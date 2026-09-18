"""Preview/apply repair of Cardata Analytics energy inflated by SoC spikes."""

from __future__ import annotations

from bisect import bisect_right
from copy import deepcopy
from datetime import date, datetime, time, timedelta, timezone
import logging
import math
import secrets
from time import monotonic
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.recorder import get_instance, history
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.util import dt as dt_util

from .const import CONF_MILEAGE_ENTITY, CONF_SOC_ENTITY, DATA_RUNTIMES, DOMAIN, SIGNAL_UPDATE
from .soc_filter import SocSample, filter_historical_soc

_LOGGER = logging.getLogger(__name__)

WS_ANALYZE = f"{DOMAIN}/analytics_repair/analyze"
WS_APPLY = f"{DOMAIN}/analytics_repair/apply"
MAX_REPAIR_DAYS = 366
PREVIEW_TTL_SECONDS = 30 * 60


def _runtime(hass: HomeAssistant, entry_id: str) -> Any | None:
    runtimes = hass.data.get(DOMAIN, {}).get(DATA_RUNTIMES, {})
    return runtimes.get(entry_id) if isinstance(runtimes, dict) else None


def _numeric_state(state: Any) -> float | None:
    if state is None:
        return None
    raw = getattr(state, "state", None)
    if raw in (None, "unknown", "unavailable", "none", ""):
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    return value if math.isfinite(value) else None


def _state_time(state: Any) -> datetime | None:
    value = getattr(state, "last_updated", None) or getattr(state, "last_changed", None)
    if not isinstance(value, datetime):
        return None
    return dt_util.as_utc(value)


def _fetch_history(
    hass: HomeAssistant,
    start_utc: datetime,
    end_utc: datetime,
    entity_ids: list[str],
) -> dict[str, list[Any]]:
    """Fetch full state history in Recorder's executor.

    The positional call mirrors Home Assistant's own history websocket API and
    deliberately asks for non-compressed State objects with no attributes.
    """
    return history.get_significant_states(
        hass,
        start_utc,
        end_utc,
        entity_ids,
        None,
        True,   # include_start_time_state
        False,  # significant_changes_only
        False,  # minimal_response
        True,   # no_attributes
        False,  # compressed_state_format
    )


def _attach_mileage(
    soc_states: list[Any], mileage_states: list[Any]
) -> list[SocSample]:
    mileage_points: list[tuple[datetime, float]] = []
    for state in mileage_states:
        when = _state_time(state)
        value = _numeric_state(state)
        if when is None or value is None:
            continue
        mileage_points.append((when, value))
    mileage_points.sort(key=lambda item: item[0])
    mileage_times = [item[0] for item in mileage_points]

    samples: list[SocSample] = []
    for state in soc_states:
        when = _state_time(state)
        value = _numeric_state(state)
        if when is None or value is None or not 0 <= value <= 100:
            continue
        mileage: float | None = None
        if mileage_points:
            index = bisect_right(mileage_times, when) - 1
            if index >= 0:
                mileage = mileage_points[index][1]
        samples.append(SocSample(when=when, soc=value, mileage=mileage))
    samples.sort(key=lambda sample: sample.when)
    return samples


def _energy_by_local_day(
    samples: list[SocSample], capacity_kwh: float, tz: Any
) -> dict[str, float]:
    result: dict[str, float] = {}
    for previous, current in zip(samples, samples[1:]):
        if current.soc >= previous.soc:
            continue
        delta = (previous.soc - current.soc) / 100.0 * capacity_kwh
        key = current.when.astimezone(tz).date().isoformat()
        result[key] = result.get(key, 0.0) + delta
    return result


def _spikes_by_local_day(spikes: list[dict[str, Any]], tz: Any) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {}
    for spike in spikes:
        ended = dt_util.parse_datetime(str(spike.get("ended_at") or ""))
        if ended is None:
            continue
        key = dt_util.as_utc(ended).astimezone(tz).date().isoformat()
        result.setdefault(key, []).append(spike)
    return result


def _old_day_kwh(runtime: Any, day: date, today: date) -> tuple[float | None, dict[str, Any] | None]:
    key = day.isoformat()
    if day == today:
        period = runtime.data.get("periods", {}).get("day", {})
        if period.get("id") != key:
            return None, None
        try:
            return max(0.0, float(period.get("kwh", 0.0))), period
        except (TypeError, ValueError):
            return None, None

    item = runtime.data.get("daily_history", {}).get(key)
    if not isinstance(item, dict):
        return None, None
    try:
        return max(0.0, float(item.get("kwh", 0.0))), item
    except (TypeError, ValueError):
        return None, None


def _selected_rows(
    runtime: Any,
    start_day: date,
    end_day: date,
    raw_energy: dict[str, float],
    clean_energy: dict[str, float],
    spikes_by_day: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    today = dt_util.now().date()
    rows: list[dict[str, Any]] = []
    day = start_day
    while day <= end_day:
        key = day.isoformat()
        old_kwh, old_item = _old_day_kwh(runtime, day, today)
        raw_kwh = max(0.0, float(raw_energy.get(key, 0.0)))
        corrected_raw_kwh = max(0.0, float(clean_energy.get(key, 0.0)))
        detected = spikes_by_day.get(key, [])
        spike_excess = max(0.0, raw_kwh - corrected_raw_kwh) if detected else 0.0
        repairable = old_kwh is not None and spike_excess > 0.001
        proposed = (
            max(0.0, old_kwh - spike_excess)
            if repairable and old_kwh is not None
            else old_kwh
        )
        effective_reduction = (
            max(0.0, old_kwh - proposed)
            if old_kwh is not None and proposed is not None
            else 0.0
        )
        rows.append(
            {
                "date": key,
                "spike_count": len(detected),
                "spikes": detected,
                "raw_history_kwh": round(raw_kwh, 4),
                "filtered_history_kwh": round(corrected_raw_kwh, 4),
                "detected_excess_kwh": round(spike_excess, 4),
                "current_cardata_kwh": round(old_kwh, 4) if old_kwh is not None else None,
                "proposed_cardata_kwh": round(proposed, 4) if proposed is not None else None,
                "reduction_kwh": round(effective_reduction, 4),
                "repairable": repairable,
                "ledger_source": (
                    str(old_item.get("source") or "") if isinstance(old_item, dict) else ""
                ),
            }
        )
        day += timedelta(days=1)
    return rows


def _preview_store(hass: HomeAssistant) -> dict[str, dict[str, Any]]:
    data = hass.data.setdefault(DOMAIN, {})
    previews = data.setdefault("analytics_repair_previews", {})
    now = monotonic()
    for key, value in list(previews.items()):
        if not isinstance(value, dict) or now - float(value.get("created_mono", 0.0)) > PREVIEW_TTL_SECONDS:
            previews.pop(key, None)
    return previews


async def _analyze(
    hass: HomeAssistant, runtime: Any, start_day: date, end_day: date
) -> dict[str, Any]:
    capacity = runtime.battery_capacity
    if capacity is None or not math.isfinite(capacity) or capacity <= 0:
        raise ValueError("Battery capacity is unavailable; SoC energy cannot be reconstructed.")

    today = dt_util.now().date()
    effective_end = min(end_day, today)
    if start_day > effective_end:
        raise ValueError("The selected range contains no recorded day to repair.")
    if (effective_end - start_day).days + 1 > MAX_REPAIR_DAYS:
        raise ValueError(f"Repair is limited to {MAX_REPAIR_DAYS} days per analysis.")

    tz = dt_util.get_time_zone(hass.config.time_zone)
    start_local = datetime.combine(start_day, time.min, tzinfo=tz)
    if effective_end == today:
        end_local = dt_util.now().astimezone(tz)
    else:
        end_local = datetime.combine(effective_end + timedelta(days=1), time.min, tzinfo=tz)

    # Do not invent Cardata consumption before this runtime started tracking.
    tracking_start = runtime._tracking_started_at.astimezone(timezone.utc)  # noqa: SLF001
    start_utc = max(start_local.astimezone(timezone.utc), tracking_start)
    end_utc = end_local.astimezone(timezone.utc)
    if start_utc >= end_utc:
        raise ValueError("The selected range predates Cardata Analytics tracking.")

    soc_id = runtime.entry.data.get(CONF_SOC_ENTITY)
    mileage_id = runtime.entry.data.get(CONF_MILEAGE_ENTITY)
    entity_ids = [entity for entity in (soc_id, mileage_id) if entity]
    recorder = get_instance(hass)
    fetched = await recorder.async_add_executor_job(
        _fetch_history, hass, start_utc, end_utc, entity_ids
    )
    soc_states = list(fetched.get(soc_id, [])) if soc_id else []
    mileage_states = list(fetched.get(mileage_id, [])) if mileage_id else []
    samples = _attach_mileage(soc_states, mileage_states)
    if len(samples) < 2:
        raise ValueError("Recorder does not contain enough SoC history for this range.")

    cleaned, spikes = filter_historical_soc(samples)
    raw_energy = _energy_by_local_day(samples, float(capacity), tz)
    clean_energy = _energy_by_local_day(cleaned, float(capacity), tz)
    spikes_by_day = _spikes_by_local_day(spikes, tz)
    rows = _selected_rows(runtime, start_day, effective_end, raw_energy, clean_energy, spikes_by_day)

    current_total = sum(
        float(row["current_cardata_kwh"] or 0.0) for row in rows if row["current_cardata_kwh"] is not None
    )
    proposed_total = sum(
        float(row["proposed_cardata_kwh"] or 0.0) for row in rows if row["proposed_cardata_kwh"] is not None
    )
    reduction = sum(float(row["reduction_kwh"]) for row in rows)
    spike_count = sum(int(row["spike_count"]) for row in rows)

    token = secrets.token_urlsafe(18)
    preview = {
        "token": token,
        "entry_id": runtime.entry.entry_id,
        "vehicle": runtime.entry.title,
        "range_from": start_day.isoformat(),
        "range_to": effective_end.isoformat(),
        "capacity_kwh": round(float(capacity), 4),
        "spike_count": spike_count,
        "current_total_kwh": round(current_total, 4),
        "proposed_total_kwh": round(proposed_total, 4),
        "reduction_kwh": round(reduction, 4),
        "rows": rows,
        "created_mono": monotonic(),
    }
    _preview_store(hass)[token] = deepcopy(preview)
    response = deepcopy(preview)
    response.pop("created_mono", None)
    return response


def _period_matches_day(period: str, period_id: str, day: date, tz: Any) -> bool:
    sample = datetime.combine(day, time(hour=12), tzinfo=tz)
    if period == "day":
        expected = day.isoformat()
    elif period == "week":
        iso = sample.isocalendar()
        expected = f"{iso.year}-W{iso.week:02d}"
    elif period == "month":
        expected = f"{day.year:04d}-{day.month:02d}"
    else:
        expected = f"{day.year:04d}"
    return period_id == expected


async def _apply(hass: HomeAssistant, runtime: Any, preview: dict[str, Any]) -> dict[str, Any]:
    today = dt_util.now().date()
    tz = dt_util.get_time_zone(hass.config.time_zone)
    changes: list[dict[str, Any]] = []
    total_reduction = 0.0

    # Validate the complete preview before mutating anything.
    for row in preview.get("rows", []):
        if not row.get("repairable") or float(row.get("reduction_kwh", 0.0)) <= 0.001:
            continue
        day = date.fromisoformat(row["date"])
        current_old, _ = _old_day_kwh(runtime, day, today)
        preview_old = row.get("current_cardata_kwh")
        if current_old is None or preview_old is None or not math.isclose(
            float(current_old), float(preview_old), abs_tol=0.005
        ):
            raise RuntimeError(
                f"Analytics changed since the preview for {row['date']}; analyze the range again."
            )

    backup = {
        "applied_at": dt_util.utcnow().isoformat(),
        "range_from": preview.get("range_from"),
        "range_to": preview.get("range_to"),
        "total_kwh": runtime.data.get("total_kwh"),
        "periods": deepcopy(runtime.data.get("periods", {})),
        "daily_history": {},
    }

    for row in preview.get("rows", []):
        reduction = float(row.get("reduction_kwh", 0.0))
        if not row.get("repairable") or reduction <= 0.001:
            continue
        day = date.fromisoformat(row["date"])
        key = day.isoformat()
        old_kwh = float(row["current_cardata_kwh"])
        proposed = max(0.0, float(row["proposed_cardata_kwh"]))
        effective_reduction = max(0.0, old_kwh - proposed)
        if effective_reduction <= 0.001:
            continue

        if day == today:
            runtime.data["periods"]["day"]["kwh"] = round(proposed, 6)
        else:
            history_item = runtime.data.setdefault("daily_history", {}).get(key)
            if not isinstance(history_item, dict):
                continue
            backup["daily_history"][key] = deepcopy(history_item)
            updated = dict(history_item)
            updated["kwh"] = round(proposed, 6)
            updated["source"] = "soc_repair_0.1.63"
            updated["recovered_from"] = "recorder_soc_spike_filter"
            runtime.data["daily_history"][key] = updated

        for period in ("week", "month", "year"):
            pdata = runtime.data.get("periods", {}).get(period, {})
            if _period_matches_day(period, str(pdata.get("id") or ""), day, tz):
                pdata["kwh"] = round(
                    max(0.0, float(pdata.get("kwh", 0.0)) - effective_reduction), 6
                )

        total_reduction += effective_reduction
        changes.append(
            {
                "date": key,
                "before_kwh": round(old_kwh, 4),
                "after_kwh": round(proposed, 4),
                "reduction_kwh": round(effective_reduction, 4),
                "spike_count": int(row.get("spike_count", 0)),
            }
        )

    if not changes:
        return {"applied": False, "changes": [], "reduction_kwh": 0.0}

    runtime.data["total_kwh"] = round(
        max(0.0, float(runtime.data.get("total_kwh", 0.0)) - total_reduction), 6
    )
    runtime.data["soc_repair_last_backup"] = backup
    runtime.data["soc_repair_last_applied"] = {
        "at": dt_util.utcnow().isoformat(),
        "range_from": preview.get("range_from"),
        "range_to": preview.get("range_to"),
        "reduction_kwh": round(total_reduction, 6),
        "changes": changes,
    }
    # Reset the live guard to the current source after a deliberate historical
    # correction so stale pre-repair candidates cannot create a new delta.
    if hasattr(runtime, "reset_soc_guard"):
        runtime.reset_soc_guard()

    await runtime.store.async_save(runtime.data)
    runtime._recalculate_custom_period()  # noqa: SLF001 - same integration module
    async_dispatcher_send(hass, SIGNAL_UPDATE.format(runtime.entry.entry_id))
    return {
        "applied": True,
        "changes": changes,
        "reduction_kwh": round(total_reduction, 4),
        "total_kwh": round(float(runtime.data.get("total_kwh", 0.0)), 4),
    }


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_ANALYZE,
        vol.Required("entry_id"): str,
        vol.Required("start_date"): vol.Coerce(date.fromisoformat),
        vol.Required("end_date"): vol.Coerce(date.fromisoformat),
    }
)
@websocket_api.async_response
async def websocket_analyze(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Analyze the selected range and return a non-destructive repair preview."""
    runtime = _runtime(hass, msg["entry_id"])
    if runtime is None:
        connection.send_error(msg["id"], "entry_not_found", "Vehicle runtime not found")
        return
    start_day = msg["start_date"]
    end_day = msg["end_date"]
    if start_day > end_day:
        connection.send_error(msg["id"], "invalid_range", "Start date is after end date")
        return
    try:
        result = await _analyze(hass, runtime, start_day, end_day)
    except ValueError as err:
        connection.send_error(msg["id"], "analysis_unavailable", str(err))
        return
    except Exception as err:  # pragma: no cover - HA/Recorder runtime failures
        _LOGGER.exception("SoC repair analysis failed for %s", runtime.entry.title)
        connection.send_error(msg["id"], "analysis_failed", str(err))
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_APPLY,
        vol.Required("entry_id"): str,
        vol.Required("token"): str,
    }
)
@websocket_api.async_response
async def websocket_apply(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Apply one still-current repair preview."""
    runtime = _runtime(hass, msg["entry_id"])
    if runtime is None:
        connection.send_error(msg["id"], "entry_not_found", "Vehicle runtime not found")
        return
    previews = _preview_store(hass)
    preview = previews.get(msg["token"])
    if not isinstance(preview, dict) or preview.get("entry_id") != msg["entry_id"]:
        connection.send_error(msg["id"], "preview_expired", "Repair preview expired; analyze again")
        return
    try:
        result = await _apply(hass, runtime, preview)
    except RuntimeError as err:
        connection.send_error(msg["id"], "preview_stale", str(err))
        return
    except Exception as err:  # pragma: no cover - storage/runtime failures
        _LOGGER.exception("SoC repair apply failed for %s", runtime.entry.title)
        connection.send_error(msg["id"], "apply_failed", str(err))
        return
    previews.pop(msg["token"], None)
    connection.send_result(msg["id"], result)


def async_register_websocket(hass: HomeAssistant) -> None:
    """Register SoC analytics repair websocket commands."""
    websocket_api.async_register_command(hass, websocket_analyze)
    websocket_api.async_register_command(hass, websocket_apply)
