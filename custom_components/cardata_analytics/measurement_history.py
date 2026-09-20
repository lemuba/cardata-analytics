"""Durable, coverage-aware counter/SoC history. Never modifies analytics values."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import logging
import json

from homeassistant.components.recorder import get_instance, history
from homeassistant.core import callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_interval
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .database import async_database, encode, DatabaseStore

_LOGGER = logging.getLogger(__name__)


@dataclass
class ArchivedState:
    state: str
    last_updated: datetime
    attributes: dict

    @property
    def last_changed(self):
        return self.last_updated


def streams(hass, entry) -> dict[str, str]:
    """Stable own-counter streams; source replacement starts a different stream."""
    mapping = {}
    registry = er.async_get(hass)
    for suffix in ("energy_consumed_total", "mileage"):
        entity_id = registry.async_get_entity_id("sensor", DOMAIN, f"{entry.entry_id}_{suffix}")
        if entity_id:
            mapping[entity_id] = f"{entry.entry_id}/{suffix}"
    for field in ("soc_entity", "mileage_entity", "energy_entity", "soh_entity", "range_entity"):
        entity_id = entry.data.get(field)
        if entity_id:
            mapping.setdefault(entity_id, f"{entry.entry_id}/{field}/{entity_id}")
    return mapping


def _coverage(con, stream: str, start: float, end: float) -> None:
    rows = con.execute("SELECT start,end FROM history_coverage WHERE stream=? AND end>=? AND start<=?",
                       (stream, start, end)).fetchall()
    for row in rows:
        start, end = min(start, row[0]), max(end, row[1])
        con.execute("DELETE FROM history_coverage WHERE stream=? AND start=?", (stream, row[0]))
    con.execute("INSERT OR REPLACE INTO history_coverage VALUES (?, ?, ?)", (stream, start, end))


def write_batch(db, batches) -> None:
    with db.connect() as con:
        for stream, start, end, samples, source in batches:
            for ts, value, attrs in samples:
                con.execute("""INSERT INTO measurement_history VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(stream,ts) DO UPDATE SET state=excluded.state,
                    attributes=excluded.attributes, source=excluded.source
                    WHERE measurement_history.source != 'live' OR excluded.source = 'live'""",
                            (stream, ts, value, encode(attrs), source))
            _coverage(con, stream, start, end)


def read_range(db, stream: str, start: float, end: float):
    with db.connect() as con:
        con.execute("BEGIN")
        covered = con.execute("SELECT 1 FROM history_coverage WHERE stream=? AND start<=? AND end>=?",
                              (stream, start, end)).fetchone()
        if not covered:
            return None
        before = con.execute("SELECT ts,state,attributes FROM measurement_history WHERE stream=? AND ts<=? ORDER BY ts DESC LIMIT 1",
                             (stream, start)).fetchone()
        rows = con.execute("SELECT ts,state,attributes FROM measurement_history WHERE stream=? AND ts>? AND ts<=? ORDER BY ts",
                           (stream, start, end)).fetchall()
        # Recorder presents held initial states at the range start, too.
        result = [] if before is None else [ArchivedState(before[1], datetime.fromtimestamp(start, timezone.utc), json.loads(before[2]))]
        result.extend(ArchivedState(r[1], datetime.fromtimestamp(r[0], timezone.utc), json.loads(r[2])) for r in rows)
        return result


def _sample(state, at=None):
    when = at or getattr(state, "last_updated", None) or dt_util.utcnow()
    attrs = getattr(state, "attributes", {})
    # Archive measurement units, not unrelated source attributes/GPS locations.
    return (when.timestamp(), str(getattr(state, "state", "unavailable")),
            {"unit_of_measurement": attrs["unit_of_measurement"]} if "unit_of_measurement" in attrs else {})


async def async_history(hass, entry, start, end, entity_ids, fetch):
    """Read local full coverage first, then archive available Recorder results."""
    # Calls during early startup can still use the original Recorder path.
    if "database_setup" not in hass.data.get(DOMAIN, {}):
        return await get_instance(hass).async_add_executor_job(fetch, hass, start, end, entity_ids)
    db = await async_database(hass)
    mapping = streams(hass, entry)
    result, missing = {}, []
    for entity_id in entity_ids:
        stream = mapping.get(entity_id, f"{entry.entry_id}/entity/{entity_id}")
        rows = await hass.async_add_executor_job(read_range, db, stream, start.timestamp(), end.timestamp())
        if rows is None:
            missing.append(entity_id)
        else:
            result[entity_id] = rows
    if not missing:
        return result
    fetched = await get_instance(hass).async_add_executor_job(fetch, hass, start, end, missing)
    batches = []
    for entity_id in missing:
        rows = fetched.get(entity_id, [])
        result[entity_id] = rows
        samples = sorted((_sample(row) for row in rows), key=lambda row: row[0])
        samples = [row for row in samples if row[0] <= end.timestamp()]
        if samples:
            # Never claim coverage before the earliest returned state.
            coverage_start = max(start.timestamp(), samples[0][0])
            batches.append((mapping.get(entity_id, f"{entry.entry_id}/entity/{entity_id}"),
                            coverage_start, end.timestamp(), samples, "recorder"))
    if batches:
        await hass.async_add_executor_job(write_batch, db, batches)
        # A Recorder fragment can fill the last gap of an already stored range.
        for entity_id in missing:
            stream = mapping.get(entity_id, f"{entry.entry_id}/entity/{entity_id}")
            rows = await hass.async_add_executor_job(read_range, db, stream, start.timestamp(), end.timestamp())
            if rows is not None:
                result[entity_id] = rows
    return result


def fetch_full(hass, start, end, ids):
    return history.get_significant_states(hass, start, end + timedelta(microseconds=1), ids,
                                          None, True, False, False, False, False)


class MeasurementArchive:
    """Archive every relevant state transition; minute flushes bound write load.

    Only a successfully flushed interval is marked covered. A fresh session
    starts at startup, so downtime is never silently bridged as zero consumption.
    """
    def __init__(self, hass, entry):
        self.hass, self.entry = hass, entry
        self.mapping = {}
        self.pending = {}
        self.begins = {}
        self.unsubs = []
        self.flush_lock = asyncio.Lock()
        self.backfill_task = None
        self.closed = False
        self.tasks = set()

    def _spawn(self, coro):
        task = self.hass.async_create_task(coro)
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)
        return task

    @callback
    def _changed(self, event):
        entity_id = event.data.get("entity_id")
        stream = self.mapping.get(entity_id)
        if stream:
            self.pending.setdefault(stream, []).append(_sample(event.data.get("new_state")))

    def _refresh_mapping(self):
        if self.closed:
            return
        mapping = streams(self.hass, self.entry)
        now = dt_util.utcnow()
        for entity_id, stream in mapping.items():
            if self.mapping.get(entity_id) != stream:
                self.begins[stream] = now.timestamp()
                self.pending.setdefault(stream, []).append(_sample(self.hass.states.get(entity_id), now))
        if mapping != self.mapping:
            if self.unsubs:
                self.unsubs.pop(0)()
            self.unsubs.insert(0, async_track_state_change_event(self.hass, list(mapping), self._changed))
            self.mapping = mapping
            active = set(mapping.values())
            self.begins = {key: value for key, value in self.begins.items() if key in active}

    async def start(self):
        self.db = await async_database(self.hass)
        self._refresh_mapping()
        self.unsubs.append(async_track_time_interval(self.hass, self._tick, timedelta(minutes=1)))
        await self.flush()
        self.backfill_task = self._spawn(self._backfill())

    @callback
    def _tick(self, now):
        if not self.closed:
            self._spawn(self._refresh_and_flush())

    async def _refresh_and_flush(self):
        await self.flush()
        self._refresh_mapping()
        await self.flush()

    async def flush(self):
        async with self.flush_lock:
            end = dt_util.utcnow().timestamp()
            pending, self.pending = self.pending, {}
            batches = [(stream, begin, end, pending.get(stream, []), "live")
                       for stream, begin in self.begins.items()]
            try:
                await self.hass.async_add_executor_job(write_batch, self.db, batches)
            except Exception:
                for stream, samples in pending.items():
                    self.pending[stream] = samples + self.pending.get(stream, [])
                _LOGGER.exception("Cardata measurement history flush failed; queued samples retained")
                return
            for stream, begin, _, _, _ in batches:
                if self.begins.get(stream) == begin:
                    self.begins[stream] = end

    async def _backfill(self):
        try:
            # Let forwarded Cardata sensor entities register before resolving IDs.
            await asyncio.sleep(5)
            await self._refresh_and_flush()
            runtime = self.entry.runtime_data
            raw = runtime.data.get("tracking_started_at")
            start = dt_util.parse_datetime(raw) if isinstance(raw, str) else None
            if start is None:
                return
            start = dt_util.as_utc(start)
            end = dt_util.utcnow()
            progress_store = DatabaseStore(self.hass, 1, f"history_backfill:{self.entry.entry_id}")
            progress = await progress_store.async_load() or {}
            signature = sorted(set(self.mapping.values()))
            if progress.get("streams") == signature:
                # Always recover recent downtime; older completed chunks need
                # not be scanned again on every HA restart.
                await async_history(self.hass, self.entry, max(start, end - timedelta(days=7)),
                                    end, list(self.mapping), fetch_full)
                if progress.get("complete"):
                    return
                cursor = dt_util.parse_datetime(progress.get("cursor", ""))
                if cursor is not None:
                    end = min(end, dt_util.as_utc(cursor))
            # Small backwards chunks preserve the newest available history first.
            while end > start and not self.closed:
                begin = max(start, end - timedelta(days=7))
                await async_history(self.hass, self.entry, begin, end, list(self.mapping), fetch_full)
                end = begin
                await progress_store.async_save({"streams": signature, "cursor": end.isoformat(),
                                                 "complete": end <= start})
                await asyncio.sleep(0)
        except asyncio.CancelledError:
            raise
        except Exception:
            _LOGGER.exception("Cardata history backfill interrupted; live archive continues and reload retries")

    async def stop(self):
        if self.closed:
            return
        self.closed = True
        for unsub in self.unsubs:
            unsub()
        self.unsubs.clear()
        if self.backfill_task and not self.backfill_task.done():
            self.backfill_task.cancel()
        if self.tasks:
            await asyncio.gather(*list(self.tasks), return_exceptions=True)
        await self.flush()
