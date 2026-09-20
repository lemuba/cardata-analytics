"""Read existing Analytics sensor history for one GPS trip; never write counters."""

from __future__ import annotations

from datetime import datetime, timedelta
import math
from typing import Any

from homeassistant.components.recorder import history
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

from .analytics_repair import _applied_repair_excess_by_day
from .const import DOMAIN
from .measurement_history import async_history


def _meter_delta(states: list[Any], start: datetime, end: datetime, quantity: str = "energy") -> tuple[float | None, str]:
    """Difference of held counter states, rejecting missing coverage and resets.

    Recorder supplies the state at start even if unchanged for a long time.
    No interpolation, daily allocation or positive-delta summation is used.
    """
    samples = []
    for state in states:
        when = getattr(state, "last_updated", None) or getattr(state, "last_changed", None)
        if not isinstance(when, datetime):
            continue
        when = dt_util.as_utc(when)
        if when > end:
            continue
        try:
            value = float(state.state)
        except (TypeError, ValueError):
            value = None
        units = {"kWh": 1.0, "Wh": 0.001, "MWh": 1000.0} if quantity == "energy" else {"km": 1.0, "m": 0.001, "mi": 1.609344}
        unit = getattr(state, "attributes", {}).get("unit_of_measurement", "kWh" if quantity == "energy" else "km")
        if unit not in units:
            value = None
        elif value is not None:
            value *= units[unit]
        if value is not None and (not math.isfinite(value) or value < 0):
            value = None
        samples.append((when, value))
    samples.sort(key=lambda item: item[0])
    before = [value for when, value in samples if when <= start]
    if not before or before[-1] is None:
        return None, "history_missing"
    values = [before[-1], *(value for when, value in samples if when > start)]
    if any(value is None for value in values):
        return None, "history_gap"
    if any(current < previous - 1e-6 for previous, current in zip(values, values[1:])):
        return None, "counter_changed"
    return round(max(0.0, values[-1] - values[0]), 4), "available"


def _fetch(hass: Any, start: datetime, end: datetime, entity_ids: list[str]) -> dict:
    # Keep attributes/state objects; the counters already have normalized units.
    return history.get_significant_states(
        hass, start, end + timedelta(microseconds=1), entity_ids,
        None, True, False, False, False, False,
    )


def _repair_overlaps(runtime: Any, start: datetime, end: datetime, tz: Any) -> bool:
    """Daily repairs cannot safely be allocated to an individual intraday trip."""
    if runtime is None or not isinstance(getattr(runtime, "data", None), dict):
        return False
    first, last = start.astimezone(tz).date(), end.astimezone(tz).date()
    return any(first.isoformat() <= day <= last.isoformat()
               for day in _applied_repair_excess_by_day(runtime))


async def async_trip_analytics(hass: Any, entry: Any, start: datetime, end: datetime) -> dict[str, Any]:
    """Reuse recorded Cardata counters without new recording or ledger mutation."""
    result: dict[str, Any] = {
        "energy_kwh": None, "average_kwh_100km": None, "analytics_distance_km": None,
        "energy_status": "history_missing", "distance_status": "history_missing",
        "energy_source": "analytics_history", "start": start.isoformat(), "end": end.isoformat(),
    }
    registry = er.async_get(hass)
    energy_id = registry.async_get_entity_id("sensor", DOMAIN, f"{entry.entry_id}_energy_consumed_total")
    mileage_id = registry.async_get_entity_id("sensor", DOMAIN, f"{entry.entry_id}_mileage")
    ids = [entity_id for entity_id in (energy_id, mileage_id) if entity_id]
    if not ids:
        return result
    fetched = await async_history(hass, entry, start, end, ids, _fetch)
    if energy_id:
        result["energy_kwh"], result["energy_status"] = _meter_delta(fetched.get(energy_id, []), start, end)
    if mileage_id:
        result["analytics_distance_km"], result["distance_status"] = _meter_delta(fetched.get(mileage_id, []), start, end, "distance")
    tz = dt_util.get_time_zone(hass.config.time_zone)
    if _repair_overlaps(getattr(entry, "runtime_data", None), start, end, tz):
        result.update(energy_kwh=None, energy_status="repaired_day")
    energy, distance = result["energy_kwh"], result["analytics_distance_km"]
    if energy is not None and distance is not None and distance > 0:
        result["average_kwh_100km"] = round(energy / distance * 100.0, 2)
    return result
