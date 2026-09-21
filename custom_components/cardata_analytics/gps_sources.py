"""Reusable external GPS sources; additive persistence in the tracking database."""
from __future__ import annotations

import asyncio
import json
import math
from uuid import uuid4

from homeassistant.core import callback
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.util import dt as dt_util


class GPSSourcesMixin:
    def _init_sources(self):
        self._sources = {}
        self._sessions = {}
        self._source_unsubs = {}
        self._source_lock = asyncio.Lock()

    def _load_sources_db(self):
        with self._connect() as con:
            con.execute("CREATE TABLE IF NOT EXISTS gps_source_state (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)")
            row = con.execute("SELECT payload FROM gps_source_state WHERE id=1").fetchone()
        return json.loads(row[0]) if row else {"sources": {}, "sessions": {}}

    def _save_sources_db(self, payload):
        with self._connect() as con:
            con.execute("INSERT OR REPLACE INTO gps_source_state VALUES (1, ?)", (payload,))

    async def _persist_sources(self):
        await self.hass.async_add_executor_job(self._save_sources_db, json.dumps({"sources": self._sources, "sessions": self._sessions}))

    async def _setup_sources(self):
        data = await self.hass.async_add_executor_job(self._load_sources_db)
        self._sources = data["sources"]
        self._sessions = data["sessions"]

    def _source_fix(self, source):
        ids = [source["entity_id"]] if source.get("entity_id") else [source["latitude_entity"], source["longitude_entity"]]
        states = [self.hass.states.get(e) for e in ids]
        if any(s is None or s.state in {"unknown", "unavailable", "none", ""} for s in states):
            return None
        try:
            lat = float(states[0].attributes["latitude"] if len(states) == 1 else states[0].state)
            lon = float(states[0].attributes["longitude"] if len(states) == 1 else states[1].state)
            stamps = [dt_util.as_utc(s.last_updated).timestamp() for s in states]
            accuracy = states[0].attributes.get("gps_accuracy")
            accuracy = None if accuracy is None else float(accuracy)
        except (KeyError, TypeError, ValueError, AttributeError):
            return None
        now = dt_util.utcnow().timestamp()
        if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
            return None
        if now - min(stamps) > 120 or max(stamps) > now + 5:
            return None
        if accuracy is not None and (not math.isfinite(accuracy) or not 0 <= accuracy <= 100):
            return None
        return {"lat": lat, "lon": lon, "ts": max(stamps), "accuracy": accuracy}

    def _listen_source(self, entry_id):
        unsub = self._source_unsubs.pop(entry_id, None)
        if unsub:
            unsub()
        session = self._sessions.get(entry_id, {})
        source = self._sources.get(session.get("source_id"))
        if not session.get("active") or not source or entry_id not in self._entries:
            return
        ids = [source["entity_id"]] if source.get("entity_id") else [source["latitude_entity"], source["longitude_entity"]]

        @callback
        def changed(event):
            # A marked callback always executes on HA's event loop.
            self._schedule_sample(entry_id, delay=0.8)

        self._source_unsubs[entry_id] = async_track_state_change_event(self.hass, ids, changed)

    async def async_source_action(self, action, data):
        async with self._source_lock:
            old = json.dumps({"sources": self._sources, "sessions": self._sessions})
            try:
                result = self._source_action(action, data)
                await self._persist_sources()
            except Exception:
                saved = json.loads(old)
                self._sources, self._sessions = saved["sources"], saved["sessions"]
                raise
            for entry_id in self._entries:
                self._listen_source(entry_id)
            if action == "start":
                self._last_points.pop(data["entry_id"], None)
                self._schedule_sample(data["entry_id"], delay=0.1)
            return result

    def _source_action(self, action, data):
        if action == "save":
            source_id = data.get("source_id") or uuid4().hex
            if data.get("source_id") and source_id not in self._sources:
                raise ValueError("Unknown GPS source")
            if any(s.get("active") and s["source_id"] == source_id for s in self._sessions.values()):
                raise ValueError("End the active trip before editing this source")
            name = str(data.get("name", "")).strip()
            vehicles = list(dict.fromkeys(data.get("vehicles", [])))
            if not name or len(name) > 100 or any(v not in self._entries for v in vehicles):
                raise ValueError("Invalid name or vehicle assignment")
            source = {"id": source_id, "name": name, "vehicles": vehicles}
            keys = ["entity_id"] if data.get("entity_id") else ["latitude_entity", "longitude_entity"]
            for key in keys:
                entity = str(data.get(key, ""))
                if entity.split(".")[0] not in {"sensor", "device_tracker", "person"} or self.hass.states.get(entity) is None:
                    raise ValueError("Select an existing location entity")
                source[key] = entity
            entities = {source[k] for k in keys}
            for existing_id, existing in self._sources.items():
                used = {existing[k] for k in ("entity_id", "latitude_entity", "longitude_entity") if existing.get(k)}
                if existing_id != source_id and entities & used:
                    raise ValueError("This entity already belongs to another GPS source")
            self._sources[source_id] = source
            return {"source_id": source_id}
        if action == "delete":
            source_id = data.get("source_id")
            if any(s.get("active") and s["source_id"] == source_id for s in self._sessions.values()):
                raise ValueError("End the active trip before deleting this source")
            self._sources.pop(source_id, None)
            return {}
        entry_id = data.get("entry_id")
        if entry_id not in self._entries:
            raise ValueError("Unknown vehicle")
        if action == "stop":
            if entry_id in self._sessions:
                self._sessions[entry_id]["active"] = False
            return {}
        if action != "start":
            raise ValueError("Unknown GPS action")
        source_id = data.get("source_id")
        source = self._sources.get(source_id)
        if not source or entry_id not in source["vehicles"]:
            raise ValueError("GPS source is not assigned to this vehicle")
        if self._sessions.get(entry_id, {}).get("active"):
            raise ValueError("End the current trip first")
        if any(s.get("active") and s["source_id"] == source_id for s in self._sessions.values()):
            raise ValueError("GPS source is already in use by another vehicle")
        self._sessions[entry_id] = {"source_id": source_id, "token": uuid4().hex, "active": True,
                                    "started": dt_util.utcnow().timestamp(), "last_fix": self._sessions.get(entry_id, {}).get("last_fix")}
        return {"waiting": self._source_fix(source) is None}

    def _external_candidate(self, entry):
        from .tracking import Point, _state_number
        from .const import CONF_MILEAGE_ENTITY, CONF_SOC_ENTITY
        session = self._sessions.get(entry.entry_id, {})
        if not session.get("active"):
            return None
        source = self._sources.get(session["source_id"])
        fix = self._source_fix(source) if source else None
        if fix is None or fix["ts"] < session["started"] - 120:
            return None
        fix["ts"] = max(fix["ts"], session["started"])
        return Point(**fix, odometer=_state_number(self.hass, entry.data.get(CONF_MILEAGE_ENTITY)),
                     soc=_state_number(self.hass, entry.data.get(CONF_SOC_ENTITY)),
                     source=f"external:{session['source_id']}:{session['token']}")

    def _sources_status(self):
        return [{**s, "fix": self._source_fix(s)} for s in self._sources.values()]
