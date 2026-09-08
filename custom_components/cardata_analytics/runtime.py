"""Runtime calculations and persistent state for Cardata Analytics."""

from __future__ import annotations

from dataclasses import dataclass
import logging
import math
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder.statistics import (
    statistic_during_period,
    statistics_during_period,
)
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
        self._range_refresh_lock = False
        self._range_refresh_pending = False
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

        self.data = {
            "total_kwh": float(stored.get("total_kwh", 0.0)),
            "periods": stored.get("periods", {}),
            "tracking_started_at": self._tracking_started_at.isoformat(),
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
        self._rollover(now, mileage)
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

    def _rollover(self, now: datetime, mileage: float | None) -> bool:
        changed = False
        for period in PERIODS:
            new_id = _period_id(period, now)
            pdata = self.data["periods"][period]
            if pdata.get("id") != new_id:
                pdata["id"] = new_id
                pdata["start_mileage"] = mileage
                pdata["kwh"] = 0.0
                changed = True
            elif pdata.get("start_mileage") is None and mileage is not None:
                pdata["start_mileage"] = mileage
                changed = True
        return changed

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

    async def _async_statistic_change(
        self,
        entity_id: str,
        start_utc: datetime,
        end_utc: datetime,
    ) -> float | None:
        """Return the Recorder-statistics change for one cumulative sensor.

        Mileage and consumed energy are cumulative ``total_increasing`` sensors.
        Home Assistant's ``statistic_during_period`` returns the exact delta for
        the requested interval and combines long-term and short-term statistics
        where necessary.  Using the interval delta directly is important for the
        first tracked day: reducing daily rows can miss that day's movement.
        """
        recorder = get_instance(self.hass)
        result = await recorder.async_add_executor_job(
            statistic_during_period,
            self.hass,
            start_utc,
            end_utc,
            entity_id,
            {"change"},
            None,
        )
        value = result.get("change")
        if value is None:
            return None
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(numeric):
            return None
        return max(0.0, numeric)

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
        if self.range_from != requested_from or self.range_to != requested_to:
            # The user changed the dates while this Recorder query was running.
            # Discard the stale result and guarantee one recalculation for the
            # newest range after the current refresh leaves its lock.
            self._range_refresh_pending = True
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
        """Calculate the inclusive selected date range.

        The calculation intentionally separates *coverage* from *value
        calculation*:

        * Coverage is based on the first calendar day on which this vehicle was
          tracked by Cardata Analytics. A requested range starting before that
          day is incomplete and is therefore not published as a complete result.
        * Values for completed days are calculated from the exact Recorder
          statistic change of the cumulative mileage and consumed-energy sensors.
        * If the range includes today, today's live counters are added so the
          result updates immediately instead of waiting for Recorder statistics.

        Examples when tracking started on 7 September:
        ``7 Sep - 8 Sep`` = yesterday's Recorder delta + today's live delta.
        ``7 Sep - 7 Sep`` = yesterday's Recorder delta only.
        ``2 Sep - 8 Sep`` = incomplete (only the overlap is kept as diagnostics).
        """
        if self._range_refresh_lock:
            self._range_refresh_pending = True
            return

        self._range_refresh_lock = True
        self._range_refresh_pending = False
        requested_from = self.range_from
        requested_to = self.range_to

        try:
            now = dt_util.now()
            today = now.date()
            tz = dt_util.get_time_zone(self.hass.config.time_zone)
            tracking_date = self._tracking_started_at.astimezone(tz).date()

            if requested_from > requested_to:
                self._set_custom_values_for_range(
                    requested_from,
                    requested_to,
                    None,
                    None,
                    coverage_complete=False,
                    coverage_status="invalid_range",
                )
                return

            if requested_from > today:
                self._set_custom_values_for_range(
                    requested_from,
                    requested_to,
                    0.0,
                    0.0,
                    available_from=tracking_date,
                    coverage_complete=False,
                    coverage_status="future",
                )
                return

            energy_id = self._analytics_entity_id("energy_consumed_total")
            mileage_id = self._analytics_entity_id("mileage")
            if not energy_id or not mileage_id:
                self._set_custom_values_for_range(
                    requested_from,
                    requested_to,
                    None,
                    None,
                    available_from=tracking_date,
                    coverage_complete=False,
                    coverage_status="entities_missing",
                )
                return

            # Do not invent data before Cardata Analytics started tracking this
            # vehicle. For an incomplete request we still calculate the available
            # overlap, but expose it only as partial_* diagnostic attributes.
            effective_start_date = max(requested_from, tracking_date)
            effective_end_date = min(requested_to, today)

            extends_before_tracking = requested_from < tracking_date
            extends_into_future = requested_to > today

            if effective_start_date > effective_end_date:
                self._set_custom_values_for_range(
                    requested_from,
                    requested_to,
                    None,
                    None,
                    available_from=tracking_date,
                    coverage_complete=False,
                    coverage_status="no_statistics",
                )
                return

            historical_end = min(effective_end_date, today - timedelta(days=1))
            historical_energy: float | None = 0.0
            historical_distance: float | None = 0.0
            historical_query_needed = effective_start_date <= historical_end

            requested_historical_end = min(requested_to, today - timedelta(days=1))
            expected_historical_days = (
                (requested_historical_end - requested_from).days + 1
                if requested_from <= requested_historical_end
                else 0
            )
            overlap_historical_days = (
                (historical_end - effective_start_date).days + 1
                if historical_query_needed
                else 0
            )
            if historical_query_needed:
                start_local = datetime.combine(effective_start_date, time.min, tzinfo=tz)
                end_local = datetime.combine(
                    historical_end + timedelta(days=1), time.min, tzinfo=tz
                )
                start_utc = dt_util.as_utc(start_local)
                end_utc = dt_util.as_utc(end_local)

                historical_energy = await self._async_statistic_change(
                    energy_id, start_utc, end_utc
                )
                historical_distance = await self._async_statistic_change(
                    mileage_id, start_utc, end_utc
                )

            historical_complete = (
                not historical_query_needed
                or (historical_energy is not None and historical_distance is not None)
            )
            covered_historical_days = (
                overlap_historical_days if historical_complete else 0
            )

            include_today = effective_start_date <= today <= effective_end_date
            live_energy: float | None = 0.0
            live_distance: float | None = 0.0
            live_complete = True

            if include_today:
                snapshot = self.snapshot()
                live_energy = max(0.0, float(snapshot.period_kwh["day"]))
                if self.current_mileage is None:
                    # No live value and no previously valid odometer value means
                    # there is no defensible distance for today.
                    live_distance = None
                    live_complete = False
                else:
                    # During a temporary source outage current_mileage falls back
                    # to the last persisted valid odometer. Distance therefore
                    # freezes at the last known point instead of becoming unknown
                    # or zero. It catches up automatically when the source returns.
                    live_distance = max(0.0, float(snapshot.period_km["day"]))

            total_energy: float | None
            total_distance: float | None

            if historical_energy is None:
                total_energy = live_energy if include_today else None
            else:
                total_energy = historical_energy + (live_energy or 0.0)

            if historical_distance is None or live_distance is None:
                total_distance = None
            else:
                total_distance = historical_distance + live_distance

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
            elif not historical_complete:
                coverage_status = "no_statistics"
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
                requested_from,
                requested_to,
                None,
                None,
                coverage_complete=False,
                coverage_status="recorder_error",
            )
        finally:
            self._range_refresh_lock = False
            async_dispatcher_send(self.hass, SIGNAL_UPDATE.format(self.entry.entry_id))
            if self._range_refresh_pending:
                self._range_refresh_pending = False
                self.hass.async_create_task(self.async_refresh_custom_period())

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
        if self._rollover(now, self.current_mileage):
            await self.store.async_save(self.data)
        async_dispatcher_send(self.hass, SIGNAL_UPDATE.format(self.entry.entry_id))
        await self.async_refresh_custom_period()

    @callback
    def _async_hourly(self, now: datetime) -> None:
        self.hass.async_create_task(self.async_refresh_custom_period())
