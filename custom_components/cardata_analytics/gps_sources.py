"""Reusable external GPS sources; additive persistence in the tracking database."""
from __future__ import annotations

import asyncio
import json
import math
import logging
from uuid import uuid4

from homeassistant.core import callback
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.util import dt as dt_util

_LOGGER = logging.getLogger(__name__)
LOCATION_INTERVALS = {0, 10, 20, 30, 60, 120, 300, 600}
POINT_FILTERS = {"off", "detailed", "balanced", "compact"}


class GPSSourcesMixin:
    def _init_sources(self):
        self._sources = {}
        self._sessions = {}
        self._source_unsubs = {}
        self._source_lock = asyncio.Lock()
        self._auto_rules = {}
        self._auto_unsubs = {}
        self._auto_timers = {}
        self._location_poll_tasks = {}
        self._final_fix_tasks = {}

    def _load_sources_db(self):
        with self._connect() as con:
            con.execute("CREATE TABLE IF NOT EXISTS gps_source_state (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)")
            row = con.execute("SELECT payload FROM gps_source_state WHERE id=1").fetchone()
        return json.loads(row[0]) if row else {"sources": {}, "sessions": {}, "auto_rules": {}}

    def _save_sources_db(self, payload):
        with self._connect() as con:
            con.execute("INSERT OR REPLACE INTO gps_source_state VALUES (1, ?)", (payload,))

    async def _persist_sources(self):
        await self.hass.async_add_executor_job(self._save_sources_db, json.dumps({"sources": self._sources, "sessions": self._sessions, "auto_rules": self._auto_rules}))

    async def _setup_sources(self):
        data = await self.hass.async_add_executor_job(self._load_sources_db)
        self._sources = data["sources"]
        self._sessions = data["sessions"]
        self._auto_rules = data.get("auto_rules", {})

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
            entry_id = data.get("entry_id")
            if (action in {"stop", "auto_delete"} or
                    action == "start" and not self._sessions.get(entry_id, {}).get("active")):
                await self._flush_phone_pending(entry_id)
            old = json.dumps({"sources": self._sources, "sessions": self._sessions, "auto_rules": self._auto_rules})
            try:
                result = self._source_action(action, data)
                await self._persist_sources()
            except Exception:
                saved = json.loads(old)
                self._sources, self._sessions, self._auto_rules = saved["sources"], saved["sessions"], saved["auto_rules"]
                raise
            for entry_id in self._entries:
                self._listen_source(entry_id)
                self._listen_auto(entry_id)
                self._sync_location_poll(entry_id)
            if action == "stop":
                entry_id = data.get("entry_id")
                rule = self._auto_rules.get(entry_id)
                if rule and self._auto_connected(rule):
                    rule["blocked"] = True
                    await self._persist_sources()
                self._cancel_auto_timer(entry_id)
                self._cancel_final_fix(entry_id)
            if action in {"auto_save", "auto_delete"}:
                entry_id = data.get("entry_id")
                if action == "auto_delete":
                    self._cancel_auto_timer(entry_id)
                    self._cancel_final_fix(entry_id)
                if entry_id in self._entries:
                    self.hass.async_create_task(self._reconcile_auto(entry_id))
            if action == "start":
                self._last_points.pop(data["entry_id"], None)
                self._schedule_sample(data["entry_id"], delay=0.1)
            return result

    def _source_action(self, action, data):
        if action == "auto_save":
            entry_id = data.get("entry_id")
            source_id = data.get("source_id")
            sensor = str(data.get("ssid_entity", ""))
            ssid = str(data.get("ssid", "")).strip()
            notify_service = str(data.get("notify_service", "")).strip()
            try:
                interval = int(data.get("location_interval", 0))
            except (TypeError, ValueError):
                raise ValueError("Select a supported location request interval") from None
            if interval not in LOCATION_INTERVALS:
                raise ValueError("Select a supported location request interval")
            point_filter = data.get("point_filter", "balanced" if interval else "off")
            if point_filter not in POINT_FILTERS:
                raise ValueError("Select a supported GPS point filter")
            if interval:
                if not notify_service.startswith("notify.mobile_app_") or not self.hass.services.has_service("notify", notify_service.split(".", 1)[1]):
                    raise ValueError("Select the iPhone's existing mobile app notification action")
            elif notify_service and not notify_service.startswith("notify.mobile_app_"):
                raise ValueError("Select a mobile app notification action")
            if entry_id not in self._entries or source_id not in self._sources or entry_id not in self._sources[source_id]["vehicles"]:
                raise ValueError("GPS source is not assigned to this vehicle")
            if not sensor.startswith("sensor.") or self.hass.states.get(sensor) is None or not ssid or len(ssid) > 100:
                raise ValueError("Select an existing SSID sensor and a Wi-Fi network name")
            if any(v != entry_id and r["ssid_entity"] == sensor and r["ssid"] == ssid for v, r in self._auto_rules.items()):
                raise ValueError("This SSID already starts another vehicle")
            if self._sessions.get(entry_id, {}).get("active") and self._sessions[entry_id].get("mode") == "auto":
                raise ValueError("End the active automatic trip before changing its rule")
            self._auto_rules[entry_id] = {"source_id": source_id, "ssid_entity": sensor, "ssid": ssid, "blocked": False,
                                          "notify_service": notify_service, "location_interval": interval,
                                          "point_filter": point_filter}
            return {}
        if action == "auto_delete":
            entry_id = data.get("entry_id")
            self._auto_rules.pop(entry_id, None)
            if self._sessions.get(entry_id, {}).get("active") and self._sessions[entry_id].get("mode") == "auto":
                self._sessions[entry_id]["active"] = False
            return {}
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
            self._auto_rules = {v: r for v, r in self._auto_rules.items() if r["source_id"] != source_id}
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
                                    "mode": "auto" if data.get("mode") == "auto" else "manual", "suspended": False,
                                    "started": dt_util.utcnow().timestamp(), "last_fix": self._sessions.get(entry_id, {}).get("last_fix")}
        return {"waiting": self._source_fix(source) is None}

    def _auto_connected(self, rule):
        state = self.hass.states.get(rule["ssid_entity"]) if rule else None
        return bool(rule) and state is not None and state.state == rule["ssid"]

    def _cancel_auto_timer(self, entry_id):
        task = self._auto_timers.pop(entry_id, None)
        if task and not task.done() and task is not asyncio.current_task():
            task.cancel()

    def _cancel_final_fix(self, entry_id):
        task = self._final_fix_tasks.pop(entry_id, None)
        if task and not task.done() and task is not asyncio.current_task():
            task.cancel()

    def _cancel_location_poll(self, entry_id):
        task = self._location_poll_tasks.pop(entry_id, None)
        if task and not task.done() and task is not asyncio.current_task():
            task.cancel()

    def _sync_location_poll(self, entry_id):
        rule = self._auto_rules.get(entry_id, {})
        session = self._sessions.get(entry_id, {})
        interval = rule.get("location_interval", 0)
        if (entry_id in self._entries and interval in LOCATION_INTERVALS - {0}
                and rule.get("notify_service") and session.get("active")
                and session.get("mode") == "auto" and not session.get("suspended")
                and self._auto_connected(rule)):
            task = self._location_poll_tasks.get(entry_id)
            if task and not task.done():
                return
            self._location_poll_tasks[entry_id] = self.hass.async_create_task(
                self._location_poll(entry_id, session["token"], rule["notify_service"], interval)
            )
        else:
            self._cancel_location_poll(entry_id)

    async def _request_location(self, service):
        try:
            domain, name = service.split(".", 1)
            if domain == "notify" and name.startswith("mobile_app_") and self.hass.services.has_service(domain, name):
                await self.hass.services.async_call(domain, name, {"message": "request_location_update"}, blocking=False)
        except Exception:
            _LOGGER.warning("Could not request phone GPS location via %s", service, exc_info=True)

    async def _location_poll(self, entry_id, token, service, interval):
        try:
            while True:
                rule = self._auto_rules.get(entry_id, {})
                session = self._sessions.get(entry_id, {})
                if (session.get("token") != token or not session.get("active") or session.get("suspended")
                        or rule.get("notify_service") != service or rule.get("location_interval") != interval
                        or not self._auto_connected(rule)):
                    return
                await self._request_location(service)
                await asyncio.sleep(interval)
        except asyncio.CancelledError:
            return
        finally:
            if self._location_poll_tasks.get(entry_id) is asyncio.current_task():
                self._location_poll_tasks.pop(entry_id, None)

    async def _request_final_fix(self, entry_id, token, service):
        try:
            # Give the phone a moment to leave CarPlay Wi-Fi and regain data connectivity.
            await asyncio.sleep(2)
            session = self._sessions.get(entry_id, {})
            if session.get("token") == token and session.get("active") and session.get("suspended"):
                await self._request_location(service)
        except asyncio.CancelledError:
            return
        finally:
            if self._final_fix_tasks.get(entry_id) is asyncio.current_task():
                self._final_fix_tasks.pop(entry_id, None)

    def _listen_auto(self, entry_id):
        unsub = self._auto_unsubs.pop(entry_id, None)
        if unsub:
            unsub()
        rule = self._auto_rules.get(entry_id)
        if not rule or entry_id not in self._entries:
            self._cancel_auto_timer(entry_id)
            self._cancel_location_poll(entry_id)
            return

        @callback
        def changed(event):
            self.hass.async_create_task(self._reconcile_auto(entry_id))

        self._auto_unsubs[entry_id] = async_track_state_change_event(self.hass, [rule["ssid_entity"]], changed)

    async def _reconcile_auto(self, entry_id):
        rule = self._auto_rules.get(entry_id)
        if not rule or entry_id not in self._entries:
            return
        if self._auto_connected(rule):
            self._cancel_auto_timer(entry_id)
            self._cancel_final_fix(entry_id)
            session = self._sessions.get(entry_id, {})
            if session.get("active") and session.get("mode") == "auto" and session.get("suspended"):
                async with self._source_lock:
                    session["suspended"] = False
                    session.pop("final_until", None)
                    await self._persist_sources()
                    self._schedule_sample(entry_id, delay=0.1)
            elif not session.get("active") and not rule.get("blocked"):
                try:
                    await self.async_source_action("start", {"entry_id": entry_id, "source_id": rule["source_id"], "mode": "auto"})
                except ValueError:
                    # A shared phone may already be in use by another vehicle.
                    return
            self._sync_location_poll(entry_id)
            return
        self._cancel_location_poll(entry_id)
        if rule.get("blocked"):
            rule["blocked"] = False
            await self._persist_sources()
        session = self._sessions.get(entry_id, {})
        if session.get("active") and session.get("mode") == "auto":
            if not session.get("suspended"):
                session["suspended"] = True
                service = rule.get("notify_service") if rule.get("location_interval") else None
                if service:
                    now = dt_util.utcnow().timestamp()
                    session["disconnected_at"] = now
                    session["final_until"] = now + 20
                    self._cancel_final_fix(entry_id)
                    self._final_fix_tasks[entry_id] = self.hass.async_create_task(
                        self._request_final_fix(entry_id, session["token"], service)
                    )
                await self._persist_sources()
            self._cancel_auto_timer(entry_id)
            self._auto_timers[entry_id] = self.hass.async_create_task(self._auto_disconnect(entry_id, session["token"]))

    async def _auto_disconnect(self, entry_id, token):
        try:
            await asyncio.sleep(90)
            if not self._auto_connected(self._auto_rules.get(entry_id, {})) and self._sessions.get(entry_id, {}).get("token") == token:
                await self.async_source_action("stop", {"entry_id": entry_id, "automatic": True})
        except asyncio.CancelledError:
            return
        finally:
            if self._auto_timers.get(entry_id) is asyncio.current_task():
                self._auto_timers.pop(entry_id, None)

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
        if session.get("suspended"):
            now = dt_util.utcnow().timestamp()
            if (not session.get("final_until") or now > session["final_until"]
                    or not session.get("disconnected_at") or fix["ts"] < session["disconnected_at"]):
                return None
        fix["ts"] = max(fix["ts"], session["started"])
        return Point(**fix, odometer=_state_number(self.hass, entry.data.get(CONF_MILEAGE_ENTITY)),
                     soc=_state_number(self.hass, entry.data.get(CONF_SOC_ENTITY)),
                     source=f"external:{session['source_id']}:{session['token']}")

    def _sources_status(self):
        return [{**s, "fix": self._source_fix(s)} for s in self._sources.values()]
