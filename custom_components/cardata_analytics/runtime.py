"""Runtime calculations and persistent state for Cardata Analytics."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder.statistics import statistic_during_period
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
    custom_ready: bool
    tracking_started_at: datetime
    history_complete_from: datetime
    custom_effective_from: datetime | None
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
        self._custom_ready = False
        self._tracking_started_at = dt_util.now()
        self._history_complete_from = dt_util.now()
        self._custom_effective_from: datetime | None = None
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
        # Historical day ranges are only considered fully covered from the
        # first complete local day after tracking started. This is deliberately
        # conservative: it avoids presenting the installation day as a complete
        # 24-hour history when the integration was added part-way through it.
        self._history_complete_from = datetime.combine(
            tracking_local.date() + timedelta(days=1), time.min, tzinfo=tz
        )

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
            custom_ready=self._custom_ready,
            tracking_started_at=self._tracking_started_at,
            history_complete_from=self._history_complete_from,
            custom_effective_from=self._custom_effective_from,
            custom_coverage_complete=self._custom_coverage_complete,
            custom_coverage_status=self._custom_coverage_status,
        )

    def _analytics_entity_id(self, key: str) -> str | None:
        registry = er.async_get(self.hass)
        unique_id = f"{self.entry.entry_id}_{key}"
        return registry.async_get_entity_id("sensor", DOMAIN, unique_id)

    async def _async_statistic_change(
        self, entity_id: str, start_utc: datetime, end_utc: datetime
    ) -> float | None:
        """Return the recorder-statistics change for one cumulative sensor."""
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
        return None if value is None else max(0.0, float(value))

    def _set_custom_values(
        self,
        energy_kwh: float | None,
        distance_km: float | None,
        *,
        effective_from: datetime | None = None,
        coverage_complete: bool = False,
        coverage_status: str = "partial",
    ) -> None:
        """Store selected-period values, coverage metadata and derived average."""
        self._custom_kwh = energy_kwh
        self._custom_km = distance_km
        self._custom_effective_from = effective_from
        self._custom_coverage_complete = coverage_complete
        self._custom_coverage_status = coverage_status
        if energy_kwh is not None and distance_km is not None and distance_km > 0:
            self._custom_avg = energy_kwh / distance_km * 100.0
        elif distance_km == 0:
            self._custom_avg = 0.0
        else:
            self._custom_avg = None
        self._custom_ready = energy_kwh is not None and distance_km is not None

    async def async_refresh_custom_period(self) -> None:
        """Calculate the selected period and report whether history is complete.

        Historical values come from long-term Recorder statistics of this
        integration's cumulative mileage and energy sensors. Today's values are
        added from live counters so the selected range updates immediately.

        A selected range may start before Cardata Analytics existed. In that
        case the historical query is clamped to the exact tracking start so
        valid driving data from the installation day is retained. The result is
        exposed as *partial* when the requested calendar range starts earlier
        than the available Analytics data.
        """
        if self._range_refresh_lock:
            self._range_refresh_pending = True
            return
        self._range_refresh_lock = True
        self._range_refresh_pending = False
        try:
            start_date = self.range_from
            end_date = self.range_to
            now = dt_util.now()
            today = now.date()
            tz = dt_util.get_time_zone(self.hass.config.time_zone)

            if start_date > end_date:
                self._set_custom_values(
                    None, None, coverage_complete=False, coverage_status="invalid_range"
                )
                return

            requested_start_local = datetime.combine(start_date, time.min, tzinfo=tz)
            requested_end_local = datetime.combine(
                end_date + timedelta(days=1), time.min, tzinfo=tz
            )
            today_start_local = datetime.combine(today, time.min, tzinfo=tz)

            if start_date > today:
                self._set_custom_values(
                    0.0,
                    0.0,
                    effective_from=None,
                    coverage_complete=False,
                    coverage_status="future",
                )
                return

            energy_id = self._analytics_entity_id("energy_consumed_total")
            mileage_id = self._analytics_entity_id("mileage")
            if not energy_id or not mileage_id:
                self._set_custom_values(
                    None, None, coverage_complete=False, coverage_status="entities_missing"
                )
                return

            # Use every Analytics sample that can exist since tracking started.
            # A vehicle may already have generated valid driving data on the
            # installation day, so clamping to the following midnight would
            # incorrectly discard those values.  The exact tracking timestamp
            # is therefore the earliest usable boundary.  Coverage can still be
            # marked partial when the requested calendar range starts earlier.
            tracking_start_local = self._tracking_started_at.astimezone(tz)
            effective_start_local = max(requested_start_local, tracking_start_local)
            requested_extends_before_history = requested_start_local < tracking_start_local
            requested_extends_into_future = end_date > today

            # No tracked Analytics interval overlaps the request and today is
            # not part of it. There is nothing reliable to aggregate yet.
            if end_date < today and effective_start_local >= requested_end_local:
                self._set_custom_values(
                    0.0,
                    0.0,
                    effective_from=None,
                    coverage_complete=False,
                    coverage_status="no_data",
                )
                return

            coverage_complete = not requested_extends_before_history and not requested_extends_into_future
            coverage_status = "complete" if coverage_complete else "partial"

            # Completed range: query only the reliable overlap.
            if end_date < today:
                energy_change = await self._async_statistic_change(
                    energy_id,
                    dt_util.as_utc(effective_start_local),
                    dt_util.as_utc(requested_end_local),
                )
                mileage_change = await self._async_statistic_change(
                    mileage_id,
                    dt_util.as_utc(effective_start_local),
                    dt_util.as_utc(requested_end_local),
                )
                if energy_change is None or mileage_change is None:
                    self._set_custom_values(
                        None,
                        None,
                        effective_from=effective_start_local,
                        coverage_complete=False,
                        coverage_status="no_statistics",
                    )
                else:
                    self._set_custom_values(
                        energy_change,
                        mileage_change,
                        effective_from=effective_start_local,
                        coverage_complete=coverage_complete,
                        coverage_status=coverage_status,
                    )
                return

            # Range includes today. Historical values stop at today's midnight;
            # the current day is added from the live runtime counters.
            snapshot = self.snapshot()
            live_energy = max(0.0, float(snapshot.period_kwh["day"]))
            live_distance = max(0.0, float(snapshot.period_km["day"]))

            historical_energy = 0.0
            historical_distance = 0.0
            historical_effective_from: datetime | None = None

            if effective_start_local < today_start_local:
                historical_effective_from = effective_start_local
                historical_energy_result = await self._async_statistic_change(
                    energy_id,
                    dt_util.as_utc(effective_start_local),
                    dt_util.as_utc(today_start_local),
                )
                historical_distance_result = await self._async_statistic_change(
                    mileage_id,
                    dt_util.as_utc(effective_start_local),
                    dt_util.as_utc(today_start_local),
                )
                if historical_energy_result is None or historical_distance_result is None:
                    # We still have meaningful live-today values, but the
                    # historical portion cannot be trusted as complete.
                    historical_energy = 0.0
                    historical_distance = 0.0
                    coverage_complete = False
                    coverage_status = "no_statistics"
                else:
                    historical_energy = historical_energy_result
                    historical_distance = historical_distance_result

            # If the requested calendar range starts before tracking began, the
            # available values are still useful but cover only the tracked part.
            if requested_start_local < self._tracking_started_at.astimezone(tz):
                coverage_complete = False
                if coverage_status == "complete":
                    coverage_status = "partial"

            effective_from = historical_effective_from
            if effective_from is None and start_date <= today <= end_date:
                effective_from = max(self._tracking_started_at.astimezone(tz), today_start_local)

            self._set_custom_values(
                historical_energy + live_energy,
                historical_distance + live_distance,
                effective_from=effective_from,
                coverage_complete=coverage_complete,
                coverage_status=coverage_status,
            )
        except Exception:
            self._custom_ready = False
            self._custom_coverage_complete = False
            self._custom_coverage_status = "recorder_error"
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
