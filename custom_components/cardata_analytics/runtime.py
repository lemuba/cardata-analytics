"""Runtime calculations and persistent state for Cardata Analytics."""

from __future__ import annotations

from dataclasses import dataclass
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

        self.data = {
            "total_kwh": float(stored.get("total_kwh", 0.0)),
            "periods": stored.get("periods", {}),
            "tracking_started_at": self._tracking_started_at.isoformat(),
        }
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
    def current_mileage(self) -> float | None:
        return _distance_km_state(self.hass, self.entry.data[CONF_MILEAGE_ENTITY])

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

    async def _async_daily_statistic_changes(
        self,
        entity_ids: set[str],
        start_date: date,
        end_date: date,
        tz,
    ) -> dict[str, dict[date, float]]:
        """Return per-local-day Recorder changes for cumulative analytics sensors.

        ``statistics_during_period(..., period="day")`` is used deliberately
        instead of one aggregate ``change`` value.  Besides giving us the same
        cumulative delta, the daily rows let us verify that the requested
        historical calendar days really exist in Recorder for *both* mileage
        and consumed-energy statistics.  This prevents a query which starts
        months before the integration existed from silently returning only the
        newest overlap and presenting it as the complete requested range.
        """
        if start_date > end_date or not entity_ids:
            return {entity_id: {} for entity_id in entity_ids}

        start_local = datetime.combine(start_date, time.min, tzinfo=tz)
        # For period="day", Home Assistant treats the date containing
        # end_time as inclusive and internally advances to the next midnight.
        end_local = datetime.combine(end_date, time.min, tzinfo=tz)
        recorder = get_instance(self.hass)
        result = await recorder.async_add_executor_job(
            statistics_during_period,
            self.hass,
            dt_util.as_utc(start_local),
            dt_util.as_utc(end_local),
            entity_ids,
            "day",
            None,
            {"change"},
        )

        changes: dict[str, dict[date, float]] = {entity_id: {} for entity_id in entity_ids}
        for entity_id in entity_ids:
            for row in result.get(entity_id, []):
                raw_start = row.get("start")
                if raw_start is None:
                    continue
                try:
                    if isinstance(raw_start, datetime):
                        row_start = raw_start
                        if row_start.tzinfo is None:
                            row_start = row_start.replace(tzinfo=timezone.utc)
                    else:
                        row_start = dt_util.utc_from_timestamp(float(raw_start))
                    row_date = row_start.astimezone(tz).date()
                except (TypeError, ValueError, OverflowError):
                    continue
                if row_date < start_date or row_date > end_date:
                    continue

                raw_change = row.get("change")
                if raw_change is None:
                    continue
                try:
                    value = float(raw_change)
                except (TypeError, ValueError):
                    continue
                if not math.isfinite(value):
                    continue
                # TOTAL_INCREASING statistics should not be negative; clamp tiny
                # numerical artefacts and reset-related noise defensively.
                changes[entity_id][row_date] = max(0.0, value)

        return changes

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
        """Calculate the shared selected period with Recorder-backed coverage.

        Historical calendar days are read as daily ``change`` rows from the
        long-term statistics of the cumulative mileage and consumed-energy
        sensors.  A historical day counts as covered only when *both* analytics
        statistics provide a valid row for that day.  Today's values are added
        from the live runtime counters.

        This makes coverage a property of the data that actually exists in
        Recorder, not of a stored config-entry creation timestamp.  It also
        guarantees that a query beginning before analytics history cannot return
        a recent overlap (or only today's values) as though it represented the
        whole selected period.
        """
        if self._range_refresh_lock:
            self._range_refresh_pending = True
            return
        self._range_refresh_lock = True
        self._range_refresh_pending = False
        start_date = self.range_from
        end_date = self.range_to
        try:
            now = dt_util.now()
            today = now.date()
            tz = dt_util.get_time_zone(self.hass.config.time_zone)

            if start_date > end_date:
                self._set_custom_values_for_range(
                    start_date,
                    end_date,
                    None,
                    None,
                    coverage_complete=False,
                    coverage_status="invalid_range",
                )
                return

            if start_date > today:
                self._set_custom_values_for_range(
                    start_date,
                    end_date,
                    0.0,
                    0.0,
                    coverage_complete=False,
                    coverage_status="future",
                )
                return

            energy_id = self._analytics_entity_id("energy_consumed_total")
            mileage_id = self._analytics_entity_id("mileage")
            if not energy_id or not mileage_id:
                self._set_custom_values_for_range(
                    start_date,
                    end_date,
                    None,
                    None,
                    coverage_complete=False,
                    coverage_status="entities_missing",
                )
                return

            # Only completed calendar days are read from Recorder.  Today is
            # deliberately supplied by live counters so the selected range
            # changes immediately instead of waiting for the next statistics run.
            historical_end = min(end_date, today - timedelta(days=1))
            expected_historical_dates: list[date] = []
            if start_date <= historical_end:
                cursor = start_date
                while cursor <= historical_end:
                    expected_historical_dates.append(cursor)
                    cursor += timedelta(days=1)

            energy_by_day: dict[date, float] = {}
            mileage_by_day: dict[date, float] = {}
            if expected_historical_dates:
                daily = await self._async_daily_statistic_changes(
                    {energy_id, mileage_id},
                    expected_historical_dates[0],
                    expected_historical_dates[-1],
                    tz,
                )
                energy_by_day = daily.get(energy_id, {})
                mileage_by_day = daily.get(mileage_id, {})

            covered_historical_dates = [
                day
                for day in expected_historical_dates
                if day in energy_by_day and day in mileage_by_day
            ]
            covered_set = set(covered_historical_dates)
            missing_historical_dates = [
                day for day in expected_historical_dates if day not in covered_set
            ]

            historical_energy = sum(energy_by_day[day] for day in covered_historical_dates)
            historical_distance = sum(mileage_by_day[day] for day in covered_historical_dates)

            include_today = start_date <= today <= end_date
            live_energy: float | None = 0.0
            live_distance: float | None = 0.0
            live_complete = True
            if include_today:
                snapshot = self.snapshot()
                live_energy = max(0.0, float(snapshot.period_kwh["day"]))
                # A temporarily unavailable mileage source cannot be treated as
                # zero distance; doing so would create a wrong selected-period
                # average. Keep the range incomplete until mileage is usable.
                if self.current_mileage is None:
                    live_distance = None
                    live_complete = False
                else:
                    live_distance = max(0.0, float(snapshot.period_km["day"]))

            total_energy: float | None = historical_energy
            total_distance: float | None = historical_distance
            if include_today:
                total_energy += live_energy or 0.0
                if live_distance is None:
                    total_distance = None
                elif total_distance is not None:
                    total_distance += live_distance

            available_dates = list(covered_historical_dates)
            if include_today and live_complete:
                available_dates.append(today)
            available_from = min(available_dates) if available_dates else None
            effective_from = (
                datetime.combine(available_from, time.min, tzinfo=tz)
                if available_from is not None
                else None
            )

            extends_into_future = end_date > today
            history_complete = not missing_historical_dates
            coverage_complete = history_complete and live_complete and not extends_into_future

            if coverage_complete:
                coverage_status = "complete"
            elif missing_historical_dates and not covered_historical_dates:
                coverage_status = "no_statistics"
            elif missing_historical_dates:
                coverage_status = "partial"
            elif include_today and not live_complete:
                coverage_status = "source_unavailable"
            elif extends_into_future:
                coverage_status = "future"
            else:
                coverage_status = "partial"

            self._set_custom_values_for_range(
                start_date,
                end_date,
                total_energy,
                total_distance,
                effective_from=effective_from,
                available_from=available_from,
                expected_historical_days=len(expected_historical_dates),
                covered_historical_days=len(covered_historical_dates),
                coverage_complete=coverage_complete,
                coverage_status=coverage_status,
            )
        except Exception:
            # Never leave values from the previously selected period visible
            # after a failed refresh.
            self._set_custom_values_for_range(
                start_date,
                end_date,
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
        mileage = self.current_mileage
        changed = self._rollover(now, mileage)

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
