"""Runtime calculations and persistent state for Cardata Analytics."""

from __future__ import annotations

from dataclasses import dataclass
import asyncio
import logging
import math
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder.statistics import statistics_during_period
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_change
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    CONF_BATTERY_CAPACITY,
    CONF_ENERGY_ENTITY,
    CONF_MILEAGE_ENTITY,
    CONF_RANGE_ENTITY,
    CONF_SOC_ENTITY,
    CONF_SOH_ENTITY,
    DOMAIN,
    SIGNAL_UPDATE,
)
from .controller import GlobalRangeController

_LOGGER = logging.getLogger(__name__)

PERIODS = ("day", "week", "month", "year")
DAILY_HISTORY_SCHEMA = 2


def _float_state(hass: HomeAssistant, entity_id: str | None) -> float | None:
    """Return a numeric state value, or None when it is not usable."""
    if not entity_id:
        return None
    state = hass.states.get(entity_id)
    if state is None or state.state in ("unknown", "unavailable", "none", ""):
        return None
    try:
        return float(state.state)
    except (TypeError, ValueError):
        return None


def _unit(hass: HomeAssistant, entity_id: str | None) -> str:
    if not entity_id:
        return ""
    state = hass.states.get(entity_id)
    if state is None:
        return ""
    return str(state.attributes.get("unit_of_measurement") or "").strip().lower()


def _distance_km_state(hass: HomeAssistant, entity_id: str | None) -> float | None:
    """Read a distance source and normalize common units to kilometres."""
    value = _float_state(hass, entity_id)
    if value is None:
        return None
    unit = _unit(hass, entity_id)
    if unit in ("mi", "mile", "miles"):
        return value * 1.609344
    if unit in ("m", "meter", "meters", "metre", "metres"):
        return value / 1000.0
    # km (and a missing unit for backwards compatibility) are treated as km.
    return value


def _energy_kwh_state(hass: HomeAssistant, entity_id: str | None) -> float | None:
    """Read an energy/capacity source and normalize common units to kWh."""
    value = _float_state(hass, entity_id)
    if value is None:
        return None
    unit = _unit(hass, entity_id)
    if unit in ("wh",):
        return value / 1000.0
    if unit in ("mwh",):
        return value * 1000.0
    # kWh (and a missing unit for backwards compatibility) are treated as kWh.
    return value


def _period_id(period: str, now: datetime) -> str:
    if period == "day":
        return now.date().isoformat()
    if period == "week":
        iso = now.isocalendar()
        return f"{iso.year}-W{iso.week:02d}"
    if period == "month":
        return f"{now.year:04d}-{now.month:02d}"
    return f"{now.year:04d}"


@dataclass
class VehicleSnapshot:
    """Convenient read-only values exposed to entities."""

    soc: float | None
    mileage: float | None
    range_km: float | None
    source_soh: float | None
    battery_capacity: float | None
    total_kwh: float
    period_kwh: dict[str, float]
    period_km: dict[str, float]
    range_from: date
    range_to: date
    custom_kwh: float | None
    custom_km: float | None
    custom_avg: float | None
    custom_partial_kwh: float | None
    custom_partial_km: float | None
    custom_partial_avg: float | None
    custom_ready: bool
    tracking_started_at: datetime
    history_complete_from: datetime
    custom_effective_from: datetime | None
    custom_available_from: date | None
    custom_expected_historical_days: int
    custom_covered_historical_days: int
    custom_coverage_complete: bool
    custom_coverage_status: str


class VehicleRuntime:
    """Track one vehicle and persist analytics counters."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, controller: GlobalRangeController) -> None:
        self.hass = hass
        self.entry = entry
        self.controller = controller
        self.store: Store[dict[str, Any]] = Store(hass, 1, f"{DOMAIN}.{entry.entry_id}")
        self.data: dict[str, Any] = {}
        self._unsubs: list[Any] = []
        self._custom_kwh: float | None = None
        self._custom_km: float | None = None
        self._custom_avg: float | None = None
        self._custom_partial_kwh: float | None = None
        self._custom_partial_km: float | None = None
        self._custom_partial_avg: float | None = None
        self._custom_ready = False
        self._tracking_started_at = dt_util.now()
        self._history_complete_from = dt_util.now()
        self._custom_effective_from: datetime | None = None
        self._custom_available_from: date | None = None
        self._custom_expected_historical_days = 0
        self._custom_covered_historical_days = 0
        self._custom_coverage_complete = False
        self._custom_coverage_status = "initializing"
        self._range_refresh_lock = asyncio.Lock()
        self._range_generation = 0
        self._last_valid_mileage: float | None = None
        self._last_valid_mileage_at: datetime | None = None

    async def async_setup(self) -> None:
        """Load persistent data and start listeners."""
        stored = await self.store.async_load() or {}
        now = dt_util.now()
        stored_tracking_started = stored.get("tracking_started_at")
        parsed_tracking_started = (
            dt_util.parse_datetime(stored_tracking_started)
            if isinstance(stored_tracking_started, str)
            else None
        )
        if parsed_tracking_started is None:
            created_at = getattr(self.entry, "created_at", None)
            if isinstance(created_at, datetime):
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=timezone.utc)
                parsed_tracking_started = created_at
            else:
                parsed_tracking_started = now
        self._tracking_started_at = dt_util.as_utc(parsed_tracking_started)

        tz = dt_util.get_time_zone(self.hass.config.time_zone)
        tracking_local = self._tracking_started_at.astimezone(tz)
        # The first calendar day on which Cardata Analytics tracked this vehicle
        # is considered the beginning of its Analytics history.  The exact
        # tracking timestamp remains available separately and is used as the
        # actual Recorder query boundary, so no pre-installation samples are
        # invented while valid installation-day driving is retained.
        self._history_complete_from = tracking_local

        stored_last_mileage = stored.get("last_valid_mileage")
        try:
            self._last_valid_mileage = (
                float(stored_last_mileage) if stored_last_mileage is not None else None
            )
        except (TypeError, ValueError):
            self._last_valid_mileage = None
        # Keep the value that was persisted before this startup. If Home Assistant
        # missed midnight while it was stopped, the live odometer on startup may
        # already include driving from the new day and must never be used as the
        # previous day's end value.
        persisted_mileage_before_setup = self._last_valid_mileage

        stored_last_mileage_at = stored.get("last_valid_mileage_at")
        parsed_last_mileage_at = (
            dt_util.parse_datetime(stored_last_mileage_at)
            if isinstance(stored_last_mileage_at, str)
            else None
        )
        if parsed_last_mileage_at is not None:
            self._last_valid_mileage_at = dt_util.as_utc(parsed_last_mileage_at)

        # Prefer the live source when it is currently available, but keep the
        # most recently valid odometer value persistently. Manufacturer/cloud
        # integrations can temporarily expose ``unavailable`` during server
        # outages; freezing the odometer at the last known value keeps analytics
        # readable without inventing distance.
        source_mileage = self.source_mileage
        if source_mileage is not None:
            self._last_valid_mileage = source_mileage
            source_state = self.hass.states.get(self.entry.data[CONF_MILEAGE_ENTITY])
            source_updated = getattr(source_state, "last_updated", None)
            self._last_valid_mileage_at = (
                dt_util.as_utc(source_updated)
                if isinstance(source_updated, datetime)
                else dt_util.utcnow()
            )

        # Keep a lifetime odometer baseline for Cardata Analytics itself. This is
        # independent of Day/Week/Month/Year rollovers and makes first-day repair
        # correct even across a calendar-year boundary. Older releases can recover
        # it from the stored Year bucket when the tracking start is in the same year.
        tracking_start_mileage = stored.get("tracking_start_mileage")
        try:
            tracking_start_mileage = (
                float(tracking_start_mileage)
                if tracking_start_mileage is not None
                else None
            )
        except (TypeError, ValueError):
            tracking_start_mileage = None
        if tracking_start_mileage is None:
            stored_year = (stored.get("periods") or {}).get("year", {})
            candidate = stored_year.get("start_mileage") if isinstance(stored_year, dict) else None
            try:
                tracking_start_mileage = float(candidate) if candidate is not None else None
            except (TypeError, ValueError):
                tracking_start_mileage = None
        if tracking_start_mileage is None:
            tracking_start_mileage = self._last_valid_mileage

        raw_daily_history = stored.get("daily_history", {})
        daily_history: dict[str, dict[str, Any]] = {}
        if isinstance(raw_daily_history, dict):
            for day_key, values in raw_daily_history.items():
                if not isinstance(day_key, str) or not isinstance(values, dict):
                    continue
                try:
                    date.fromisoformat(day_key)
                except ValueError:
                    continue
                try:
                    kwh = float(values.get("kwh", 0.0))
                except (TypeError, ValueError):
                    kwh = 0.0
                km_raw = values.get("km")
                try:
                    km = float(km_raw) if km_raw is not None else None
                except (TypeError, ValueError):
                    km = None
                daily_history[day_key] = {
                    "kwh": max(0.0, kwh),
                    "km": max(0.0, km) if km is not None else None,
                    "source": str(values.get("source") or "stored"),
                    # Old ledger entries had no explicit completeness flag and
                    # were intended as complete. New restart-estimate entries can
                    # deliberately mark a day incomplete.
                    "complete": values.get("complete", True) is not False,
                }

        self.data = {
            "total_kwh": float(stored.get("total_kwh", 0.0)),
            "periods": stored.get("periods", {}),
            "daily_history": daily_history,
            "daily_history_schema": DAILY_HISTORY_SCHEMA,
            "tracking_started_at": self._tracking_started_at.isoformat(),
            "tracking_start_mileage": tracking_start_mileage,
            "last_valid_mileage": self._last_valid_mileage,
            "last_valid_mileage_at": (
                self._last_valid_mileage_at.isoformat()
                if self._last_valid_mileage_at is not None
                else None
            ),
        }

        # Upgrading while the manufacturer source is already unavailable should
        # still work immediately.  Older Cardata Analytics versions did not
        # persist the last valid odometer separately, so bootstrap it once from
        # this integration's existing Recorder statistics when possible.
        if self._last_valid_mileage is None and source_mileage is None:
            await self._async_restore_last_mileage_from_statistics()

        mileage = self.current_mileage
        for period in PERIODS:
            current = self.data["periods"].get(period, {})
            self.data["periods"][period] = {
                "id": current.get("id", _period_id(period, now)),
                "start_mileage": current.get("start_mileage", mileage),
                "kwh": float(current.get("kwh", 0.0)),
            }

        # If Home Assistant was restarted after midnight, the stored Day bucket
        # can still belong to yesterday. Archive it before resetting the period.
        # The last persisted odometer is preferred here so distance travelled while
        # Home Assistant was offline is not silently assigned to the old day.
        day_data = self.data["periods"].get("day", {})
        old_day_id = day_data.get("id")
        current_day_id = _period_id("day", now)
        if isinstance(old_day_id, str) and old_day_id != current_day_id:
            # HA missed the exact midnight boundary. Use only the odometer value
            # that had already been persisted before this startup, never the live
            # startup value (which may include driving from today). Because the
            # exact boundary was missed, keep the archived day marked incomplete
            # unless the dedicated first-day repair below can reconstruct it.
            self._archive_day_period(
                old_day_id,
                day_data,
                persisted_mileage_before_setup,
                source="rollover_restore",
                complete=False,
            )

        self._rollover(now, mileage)
        self._repair_previous_day_from_existing_counters(now)
        await self.store.async_save(self.data)

        tracked = [self.entry.data[CONF_SOC_ENTITY], self.entry.data[CONF_MILEAGE_ENTITY]]
        if self.entry.data.get(CONF_ENERGY_ENTITY):
            tracked.append(self.entry.data[CONF_ENERGY_ENTITY])
        if self.entry.data.get(CONF_RANGE_ENTITY):
            tracked.append(self.entry.data[CONF_RANGE_ENTITY])
        if self.entry.data.get(CONF_SOH_ENTITY):
            tracked.append(self.entry.data[CONF_SOH_ENTITY])

        self._unsubs.append(async_track_state_change_event(self.hass, tracked, self._async_state_changed))
        self._unsubs.append(async_track_time_change(self.hass, self._async_midnight, hour=0, minute=0, second=0))
        # Refresh the selected date range hourly so a range including "today"
        # catches up with newly written recorder statistics.
        self._unsubs.append(async_track_time_change(self.hass, self._async_hourly, minute=7, second=0))

    async def async_unload(self) -> None:
        """Stop listeners."""
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()

    @property
    def current_soc(self) -> float | None:
        return _float_state(self.hass, self.entry.data[CONF_SOC_ENTITY])

    @property
    def source_mileage(self) -> float | None:
        """Return the live odometer source without applying a fallback."""
        return _distance_km_state(self.hass, self.entry.data[CONF_MILEAGE_ENTITY])

    @property
    def current_mileage(self) -> float | None:
        """Return live mileage or the most recently valid persisted value."""
        source = self.source_mileage
        return source if source is not None else self._last_valid_mileage

    @property
    def mileage_source_available(self) -> bool:
        """Return whether the configured source currently has a numeric value."""
        return self.source_mileage is not None

    @property
    def using_last_known_mileage(self) -> bool:
        """Return whether analytics currently use the persisted odometer fallback."""
        return self.source_mileage is None and self._last_valid_mileage is not None

    @property
    def last_valid_mileage_at(self) -> datetime | None:
        """Timestamp of the last valid live odometer sample."""
        return self._last_valid_mileage_at

    def _remember_source_mileage(self) -> bool:
        """Persist a newly available live odometer value.

        Returns True when the persisted fallback metadata changed. Invalid or
        unavailable source states deliberately leave the last valid value intact.
        """
        source = self.source_mileage
        if source is None:
            return False

        state = self.hass.states.get(self.entry.data[CONF_MILEAGE_ENTITY])
        updated = getattr(state, "last_updated", None)
        updated_utc = (
            dt_util.as_utc(updated)
            if isinstance(updated, datetime)
            else dt_util.utcnow()
        )
        changed = (
            self._last_valid_mileage != source
            or self._last_valid_mileage_at != updated_utc
        )
        self._last_valid_mileage = source
        self._last_valid_mileage_at = updated_utc
        self.data["last_valid_mileage"] = source
        self.data["last_valid_mileage_at"] = updated_utc.isoformat()
        return changed

    async def _async_restore_last_mileage_from_statistics(self) -> bool:
        """Restore the latest known analytics odometer from Recorder.

        This primarily supports upgrades performed while an upstream vehicle
        integration is already offline. Existing long-term statistics from the
        Cardata Analytics mileage sensor survive the outage and provide a safe
        last-known value without depending on the manufacturer source.
        """
        mileage_id = self._analytics_entity_id("mileage")
        if not mileage_id:
            return False

        recorder = get_instance(self.hass)
        end_utc = dt_util.utcnow()
        start_utc = end_utc - timedelta(days=30)
        try:
            result = await recorder.async_add_executor_job(
                statistics_during_period,
                self.hass,
                start_utc,
                end_utc,
                {mileage_id},
                "hour",
                None,
                {"state"},
            )
        except Exception:
            _LOGGER.debug(
                "Could not restore last mileage for %s from Recorder statistics",
                self.entry.title,
                exc_info=True,
            )
            return False

        rows = result.get(mileage_id) or []
        for row in reversed(rows):
            value = row.get("state")
            try:
                numeric = float(value)
            except (TypeError, ValueError):
                continue
            if not math.isfinite(numeric) or numeric < 0:
                continue

            timestamp = row.get("end", row.get("start"))
            restored_at: datetime | None = None
            try:
                if timestamp is not None:
                    restored_at = datetime.fromtimestamp(float(timestamp), tz=timezone.utc)
            except (TypeError, ValueError, OSError):
                restored_at = None

            self._last_valid_mileage = numeric
            self._last_valid_mileage_at = restored_at or dt_util.utcnow()
            self.data["last_valid_mileage"] = numeric
            self.data["last_valid_mileage_at"] = self._last_valid_mileage_at.isoformat()
            _LOGGER.info(
                "Restored last known mileage for %s from Recorder: %.3f km",
                self.entry.title,
                numeric,
            )
            return True

        return False

    @property
    def current_range(self) -> float | None:
        return _distance_km_state(self.hass, self.entry.data.get(CONF_RANGE_ENTITY))

    @property
    def current_source_soh(self) -> float | None:
        return _float_state(self.hass, self.entry.data.get(CONF_SOH_ENTITY))

    @property
    def battery_capacity(self) -> float | None:
        energy_entity = self.entry.data.get(CONF_ENERGY_ENTITY)
        if energy_entity:
            capacity = _energy_kwh_state(self.hass, energy_entity)
            if capacity is not None and capacity > 0:
                return capacity
        try:
            return float(self.entry.data[CONF_BATTERY_CAPACITY])
        except (KeyError, TypeError, ValueError):
            return None

    @property
    def range_from(self) -> date:
        return self.controller.range_from

    @property
    def range_to(self) -> date:
        return self.controller.range_to

    def _archive_day_period(
        self,
        day_id: str,
        period_data: dict[str, Any],
        end_mileage: float | None,
        *,
        source: str = "runtime",
        complete: bool = True,
    ) -> bool:
        """Persist one completed local calendar day in the compact daily ledger."""
        try:
            day = date.fromisoformat(day_id)
        except (TypeError, ValueError):
            return False

        try:
            kwh = max(0.0, float(period_data.get("kwh", 0.0)))
        except (TypeError, ValueError):
            kwh = 0.0

        start_mileage = period_data.get("start_mileage")
        distance: float | None = None
        if start_mileage is not None and end_mileage is not None:
            try:
                distance = max(0.0, float(end_mileage) - float(start_mileage))
            except (TypeError, ValueError):
                distance = None

        key = day.isoformat()
        value = {
            "kwh": round(kwh, 6),
            "km": round(distance, 6) if distance is not None else None,
            "source": source,
            "complete": bool(complete and distance is not None),
        }
        previous = self.data.setdefault("daily_history", {}).get(key)
        if previous == value:
            return False
        self.data["daily_history"][key] = value
        return True

    def _repair_previous_day_from_existing_counters(self, now: datetime) -> bool:
        """Repair the first completed tracking day from current cumulative buckets.

        This is intentionally narrow and deterministic. If tracking started
        yesterday, then the integration lifetime/year distance minus today's
        distance is exactly yesterday's tracked distance, and lifetime energy
        minus today's energy is exactly yesterday's tracked energy. This repairs
        bad 0.1.10 ledger entries that accidentally stored today's values for
        yesterday and also backfills pre-ledger installations.
        """
        tz = dt_util.get_time_zone(self.hass.config.time_zone)
        tracking_date = self._tracking_started_at.astimezone(tz).date()
        yesterday = now.date() - timedelta(days=1)
        if tracking_date != yesterday:
            return False

        mileage = self.current_mileage
        if mileage is None:
            return False

        periods = self.data.get("periods", {})
        day_data = periods.get("day", {})
        if day_data.get("id") != _period_id("day", now):
            return False

        try:
            day_start = day_data.get("start_mileage")
            tracking_start_mileage = self.data.get("tracking_start_mileage")
            if day_start is None or tracking_start_mileage is None:
                return False
            today_km = max(0.0, float(mileage) - float(day_start))
            tracked_total_km = max(0.0, float(mileage) - float(tracking_start_mileage))
            previous_km = max(0.0, tracked_total_km - today_km)

            today_kwh = max(0.0, float(day_data.get("kwh", 0.0)))
            tracked_total_kwh = max(0.0, float(self.data.get("total_kwh", 0.0)))
            previous_kwh = max(0.0, tracked_total_kwh - today_kwh)
        except (TypeError, ValueError):
            return False

        key = yesterday.isoformat()
        repaired = {
            "kwh": round(previous_kwh, 6),
            "km": round(previous_km, 6),
            "source": "repair_0.1.11",
            "complete": True,
        }
        history = self.data.setdefault("daily_history", {})
        previous = history.get(key)
        if previous == repaired:
            return False

        history[key] = repaired
        self.data["daily_history_schema"] = DAILY_HISTORY_SCHEMA
        self.data["daily_history_last_repair"] = dt_util.utcnow().isoformat()
        _LOGGER.warning(
            "Repaired first completed day for %s: %s = %.3f km / %.3f kWh "
            "(previous ledger entry: %s)",
            self.entry.title,
            key,
            previous_km,
            previous_kwh,
            previous,
        )
        return True

    def _rollover(self, now: datetime, mileage: float | None) -> bool:
        changed = False
        for period in PERIODS:
            new_id = _period_id(period, now)
            pdata = self.data["periods"][period]
            if pdata.get("id") != new_id:
                if period == "day" and isinstance(pdata.get("id"), str):
                    changed = self._archive_day_period(
                        pdata["id"], pdata, mileage, source="runtime"
                    ) or changed
                pdata["id"] = new_id
                pdata["start_mileage"] = mileage
                pdata["kwh"] = 0.0
                changed = True
            elif pdata.get("start_mileage") is None and mileage is not None:
                pdata["start_mileage"] = mileage
                changed = True
        return changed

    def _daily_history_sum(
        self, start_day: date, end_day: date
    ) -> tuple[float, float, int, list[str]]:
        """Return energy, distance, covered-day count and missing days."""
        if start_day > end_day:
            return 0.0, 0.0, 0, []
        total_kwh = 0.0
        total_km = 0.0
        covered = 0
        missing: list[str] = []
        history = self.data.get("daily_history", {})
        day = start_day
        while day <= end_day:
            key = day.isoformat()
            item = history.get(key) if isinstance(history, dict) else None
            if (
                not isinstance(item, dict)
                or item.get("km") is None
                or item.get("complete", True) is False
            ):
                missing.append(key)
            else:
                try:
                    kwh = float(item.get("kwh", 0.0))
                    km = float(item.get("km"))
                except (TypeError, ValueError):
                    missing.append(key)
                else:
                    if math.isfinite(kwh) and math.isfinite(km):
                        total_kwh += max(0.0, kwh)
                        total_km += max(0.0, km)
                        covered += 1
                    else:
                        missing.append(key)
            day += timedelta(days=1)
        return total_kwh, total_km, covered, missing

    def snapshot(self) -> VehicleSnapshot:
        """Return values for sensor entities."""
        now = dt_util.now()
        mileage = self.current_mileage
        self._rollover(now, mileage)

        period_kwh: dict[str, float] = {}
        period_km: dict[str, float] = {}
        for period in PERIODS:
            pdata = self.data["periods"][period]
            period_kwh[period] = round(float(pdata.get("kwh", 0.0)), 4)
            start = pdata.get("start_mileage")
            if mileage is None or start is None:
                period_km[period] = 0.0
            else:
                period_km[period] = round(max(0.0, mileage - float(start)), 3)

        return VehicleSnapshot(
            soc=self.current_soc,
            mileage=mileage,
            range_km=self.current_range,
            source_soh=self.current_source_soh,
            battery_capacity=self.battery_capacity,
            total_kwh=round(float(self.data.get("total_kwh", 0.0)), 4),
            period_kwh=period_kwh,
            period_km=period_km,
            range_from=self.range_from,
            range_to=self.range_to,
            custom_kwh=self._custom_kwh,
            custom_km=self._custom_km,
            custom_avg=self._custom_avg,
            custom_partial_kwh=self._custom_partial_kwh,
            custom_partial_km=self._custom_partial_km,
            custom_partial_avg=self._custom_partial_avg,
            custom_ready=self._custom_ready,
            tracking_started_at=self._tracking_started_at,
            history_complete_from=self._history_complete_from,
            custom_effective_from=self._custom_effective_from,
            custom_available_from=self._custom_available_from,
            custom_expected_historical_days=self._custom_expected_historical_days,
            custom_covered_historical_days=self._custom_covered_historical_days,
            custom_coverage_complete=self._custom_coverage_complete,
            custom_coverage_status=self._custom_coverage_status,
        )

    def _analytics_entity_id(self, key: str) -> str | None:
        registry = er.async_get(self.hass)
        unique_id = f"{self.entry.entry_id}_{key}"
        return registry.async_get_entity_id("sensor", DOMAIN, unique_id)

    def _set_custom_values(
        self,
        energy_kwh: float | None,
        distance_km: float | None,
        *,
        effective_from: datetime | None = None,
        available_from: date | None = None,
        expected_historical_days: int = 0,
        covered_historical_days: int = 0,
        coverage_complete: bool = False,
        coverage_status: str = "partial",
    ) -> None:
        """Store selected-period values and coverage metadata.

        Public custom-period sensor states are only exposed when the requested
        period is fully covered.  If only part of the requested range can be
        evaluated, the partial result is retained in attributes for diagnostics
        but the visible result stays unknown.  This prevents a partial sum from
        looking like the result for the complete user-selected period.
        """
        partial_avg: float | None
        if energy_kwh is not None and distance_km is not None and distance_km > 0:
            partial_avg = energy_kwh / distance_km * 100.0
        elif energy_kwh is not None and distance_km == 0:
            partial_avg = 0.0
        else:
            partial_avg = None

        self._custom_effective_from = effective_from
        self._custom_available_from = available_from
        self._custom_expected_historical_days = expected_historical_days
        self._custom_covered_historical_days = covered_historical_days
        self._custom_coverage_complete = coverage_complete
        self._custom_coverage_status = coverage_status

        if coverage_complete and energy_kwh is not None and distance_km is not None:
            self._custom_kwh = energy_kwh
            self._custom_km = distance_km
            self._custom_avg = partial_avg
            self._custom_partial_kwh = None
            self._custom_partial_km = None
            self._custom_partial_avg = None
            self._custom_ready = True
            return

        # Incomplete/invalid ranges intentionally do not publish a normal
        # selected-period value.  Keep the overlap result only as metadata.
        self._custom_kwh = None
        self._custom_km = None
        self._custom_avg = None
        self._custom_partial_kwh = energy_kwh
        self._custom_partial_km = distance_km
        self._custom_partial_avg = partial_avg
        self._custom_ready = False

    @callback
    def invalidate_custom_period(self) -> None:
        """Clear a result immediately when the global range changes.

        Recorder queries may still be running for the previous range.  Clearing
        the public result prevents old numbers from being displayed under the
        newly selected dates while the recalculation catches up.
        """
        self._range_generation += 1
        self._set_custom_values(
            None,
            None,
            coverage_complete=False,
            coverage_status="initializing",
        )
        async_dispatcher_send(self.hass, SIGNAL_UPDATE.format(self.entry.entry_id))

    def _set_custom_values_for_range(
        self,
        requested_from: date,
        requested_to: date,
        generation: int,
        energy_kwh: float | None,
        distance_km: float | None,
        *,
        effective_from: datetime | None = None,
        available_from: date | None = None,
        expected_historical_days: int = 0,
        covered_historical_days: int = 0,
        coverage_complete: bool = False,
        coverage_status: str = "partial",
    ) -> bool:
        """Commit a result only if it still belongs to the active range."""
        if (
            self.range_from != requested_from
            or self.range_to != requested_to
            or self._range_generation != generation
        ):
            # A newer range selection superseded this Recorder query.  The
            # controller queues/awaits a fresh calculation under the async lock.
            return False

        self._set_custom_values(
            energy_kwh,
            distance_km,
            effective_from=effective_from,
            available_from=available_from,
            expected_historical_days=expected_historical_days,
            covered_historical_days=covered_historical_days,
            coverage_complete=coverage_complete,
            coverage_status=coverage_status,
        )
        return True

    async def async_refresh_custom_period(self) -> None:
        """Calculate the inclusive selected date range from the daily ledger.

        Completed local calendar days are read from Cardata Analytics' own compact
        persistent daily ledger. Today is always taken from the live Day counters.
        This makes custom ranges deterministic and independent of Recorder
        aggregation timing while long-term statistics remain available for graphs.
        """
        async with self._range_refresh_lock:
            requested_from = self.range_from
            requested_to = self.range_to
            generation = self._range_generation

            try:
                now = dt_util.now()
                today = now.date()
                tz = dt_util.get_time_zone(self.hass.config.time_zone)
                tracking_date = self._tracking_started_at.astimezone(tz).date()

                if requested_from > requested_to:
                    self._set_custom_values_for_range(
                        requested_from, requested_to, generation, None, None,
                        coverage_complete=False,
                        coverage_status="invalid_range",
                    )
                    return

                if requested_from > today:
                    self._set_custom_values_for_range(
                        requested_from, requested_to, generation, 0.0, 0.0,
                        available_from=tracking_date,
                        coverage_complete=False,
                        coverage_status="future",
                    )
                    return

                effective_start_date = max(requested_from, tracking_date)
                effective_end_date = min(requested_to, today)
                extends_before_tracking = requested_from < tracking_date
                extends_into_future = requested_to > today

                if effective_start_date > effective_end_date:
                    self._set_custom_values_for_range(
                        requested_from, requested_to, generation, None, None,
                        available_from=tracking_date,
                        coverage_complete=False,
                        coverage_status="no_history",
                    )
                    return

                historical_end = min(effective_end_date, today - timedelta(days=1))
                historical_needed = effective_start_date <= historical_end
                historical_energy = 0.0
                historical_distance = 0.0
                covered_historical_days = 0
                missing_days: list[str] = []
                if historical_needed:
                    (
                        historical_energy,
                        historical_distance,
                        covered_historical_days,
                        missing_days,
                    ) = self._daily_history_sum(effective_start_date, historical_end)

                requested_historical_end = min(requested_to, today - timedelta(days=1))
                expected_historical_days = (
                    (requested_historical_end - requested_from).days + 1
                    if requested_from <= requested_historical_end
                    else 0
                )
                historical_complete = not historical_needed or not missing_days

                include_today = effective_start_date <= today <= effective_end_date
                live_energy = 0.0
                live_distance: float | None = 0.0
                live_complete = True
                if include_today:
                    snapshot = self.snapshot()
                    live_energy = max(0.0, float(snapshot.period_kwh["day"]))
                    if self.current_mileage is None:
                        live_distance = None
                        live_complete = False
                    else:
                        live_distance = max(0.0, float(snapshot.period_km["day"]))

                total_energy: float | None = historical_energy + (live_energy if include_today else 0.0)
                if live_distance is None:
                    total_distance = None
                else:
                    total_distance = historical_distance + (live_distance if include_today else 0.0)

                coverage_complete = (
                    not extends_before_tracking
                    and not extends_into_future
                    and historical_complete
                    and live_complete
                )

                if coverage_complete:
                    coverage_status = "complete"
                elif extends_before_tracking:
                    coverage_status = "partial"
                elif missing_days:
                    coverage_status = "missing_daily_history"
                elif include_today and not live_complete:
                    coverage_status = "source_unavailable"
                elif extends_into_future:
                    coverage_status = "future"
                else:
                    coverage_status = "partial"

                effective_from = datetime.combine(
                    effective_start_date, time.min, tzinfo=tz
                )
                self._set_custom_values_for_range(
                    requested_from,
                    requested_to,
                    generation,
                    total_energy,
                    total_distance,
                    effective_from=effective_from,
                    available_from=tracking_date,
                    expected_historical_days=expected_historical_days,
                    covered_historical_days=covered_historical_days,
                    coverage_complete=coverage_complete,
                    coverage_status=coverage_status,
                )

            except Exception:
                _LOGGER.exception(
                    "Failed to refresh selected period for %s (%s to %s)",
                    self.entry.title,
                    requested_from,
                    requested_to,
                )
                self._set_custom_values_for_range(
                    requested_from, requested_to, generation, None, None,
                    coverage_complete=False,
                    coverage_status="calculation_error",
                )
            finally:
                async_dispatcher_send(
                    self.hass, SIGNAL_UPDATE.format(self.entry.entry_id)
                )

    @callback
    def _async_state_changed(self, event: Event[EventStateChangedData]) -> None:
        self.hass.async_create_task(self._async_process_state_changed(event))

    async def _async_process_state_changed(self, event: Event[EventStateChangedData]) -> None:
        entity_id = event.data["entity_id"]
        now = dt_util.now()

        # Capture a valid odometer sample before rollover/period calculations.
        # An ``unavailable`` transition intentionally keeps the previous value.
        remembered_mileage = False
        if entity_id == self.entry.data[CONF_MILEAGE_ENTITY]:
            remembered_mileage = self._remember_source_mileage()

        mileage = self.current_mileage
        changed = self._rollover(now, mileage) or remembered_mileage

        if entity_id == self.entry.data[CONF_SOC_ENTITY]:
            old_state = event.data.get("old_state")
            new_state = event.data.get("new_state")
            try:
                old = float(old_state.state) if old_state else None
                new = float(new_state.state) if new_state else None
            except (TypeError, ValueError):
                old = new = None

            capacity = self.battery_capacity
            if (
                old is not None
                and new is not None
                and capacity is not None
                and 0 <= new < old <= 100
                and capacity > 0
            ):
                delta_kwh = (old - new) / 100.0 * capacity
                self.data["total_kwh"] = float(self.data.get("total_kwh", 0.0)) + delta_kwh
                for period in PERIODS:
                    self.data["periods"][period]["kwh"] = float(self.data["periods"][period].get("kwh", 0.0)) + delta_kwh
                changed = True

        if changed:
            await self.store.async_save(self.data)

        async_dispatcher_send(self.hass, SIGNAL_UPDATE.format(self.entry.entry_id))

        # Keep a selected period containing today synchronized with the live
        # Today counters instead of waiting for the next recorder statistics run.
        today = now.date()
        if self.range_from <= today <= self.range_to and entity_id in (
            self.entry.data[CONF_SOC_ENTITY],
            self.entry.data[CONF_MILEAGE_ENTITY],
        ):
            await self.async_refresh_custom_period()

    @callback
    def _async_midnight(self, now: datetime) -> None:
        self.hass.async_create_task(self._async_handle_midnight(now))

    async def _async_handle_midnight(self, now: datetime) -> None:
        self._rollover(now, self.current_mileage)
        await self.store.async_save(self.data)
        async_dispatcher_send(self.hass, SIGNAL_UPDATE.format(self.entry.entry_id))
        await self.async_refresh_custom_period()

    @callback
    def _async_hourly(self, now: datetime) -> None:
        self.hass.async_create_task(self.async_refresh_custom_period())
