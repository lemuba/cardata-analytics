"""Local GPS track recording and historical track explorer for Cardata Analytics."""

from __future__ import annotations

import asyncio
from bisect import bisect_right
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
import logging
import math
from pathlib import Path
import sqlite3
from typing import Any
from xml.sax.saxutils import escape

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.recorder import history
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_change
from homeassistant.util import dt as dt_util

from .const import (
    CONF_LATITUDE_ENTITY,
    CONF_LONGITUDE_ENTITY,
    CONF_MILEAGE_ENTITY,
    CONF_SOC_ENTITY,
    CONF_VEHICLE_NAME,
    DOMAIN,
)
from .trip_analytics import async_trip_analytics
from .gps_sources import GPSSourcesMixin

_LOGGER = logging.getLogger(__name__)

DATA_MANAGER = "tracking_manager"
DB_FILENAME = f"{DOMAIN}_tracking.db"
TRACK_MIN_MOVE_METERS = 8.0
TRACK_MIN_INTERVAL_SECONDS = 5.0
TRACK_HEARTBEAT_SECONDS = 30 * 60.0
TRACK_SEGMENT_GAP_SECONDS = 15 * 60.0
TRACK_MAX_SPEED_KMH = 320.0
DEFAULT_RETENTION_DAYS = 365
ALLOWED_RETENTION_DAYS = {0, 30, 90, 180, 365}
MAX_QUERY_DAYS = 3660
MAX_QUERY_POINTS = 20000
MAX_GPX_POINTS = 500000

WS_STATUS = f"{DOMAIN}/tracking/status"
WS_SETTINGS = f"{DOMAIN}/tracking/settings"
WS_QUERY = f"{DOMAIN}/tracking/query"
WS_IMPORT = f"{DOMAIN}/tracking/import_recorder"
WS_DELETE = f"{DOMAIN}/tracking/delete"
WS_GPX = f"{DOMAIN}/tracking/gpx"
WS_TRIP_DETAILS = f"{DOMAIN}/tracking/trip_details"


def _valid_coordinate(value: Any, *, latitude: bool) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    if latitude and not -90 <= number <= 90:
        return None
    if not latitude and not -180 <= number <= 180:
        return None
    return number


def _state_number(hass: HomeAssistant, entity_id: str | None) -> float | None:
    if not entity_id:
        return None
    state = hass.states.get(entity_id)
    if state is None or state.state in {"unknown", "unavailable", "none", ""}:
        return None
    try:
        value = float(state.state)
    except (TypeError, ValueError):
        return None
    return value if math.isfinite(value) else None


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371008.8
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1 - a)))


def _bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dlambda = math.radians(lon2 - lon1)
    y = math.sin(dlambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlambda)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def _iso_utc(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_ts(value: str) -> datetime:
    parsed = dt_util.parse_datetime(value)
    if parsed is None:
        raise ValueError(f"Invalid datetime: {value}")
    return dt_util.as_utc(parsed)


@dataclass(slots=True)
class Point:
    ts: float
    lat: float
    lon: float
    odometer: float | None = None
    soc: float | None = None
    speed: float | None = None
    bearing: float | None = None
    altitude: float | None = None
    accuracy: float | None = None
    source: str = "live"

    def as_dict(self) -> dict[str, Any]:
        return {
            "ts": _iso_utc(self.ts),
            "lat": round(self.lat, 7),
            "lon": round(self.lon, 7),
            "odometer": None if self.odometer is None else round(self.odometer, 3),
            "soc": None if self.soc is None else round(self.soc, 2),
            "speed": None if self.speed is None else round(self.speed, 2),
            "bearing": None if self.bearing is None else round(self.bearing, 1),
            "altitude": None if self.altitude is None else round(self.altitude, 1),
            "accuracy": None if self.accuracy is None else round(self.accuracy, 1),
            "source": self.source,
        }


class TrackingManager(GPSSourcesMixin):
    """Own the local SQLite track store and vehicle GPS listeners."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._init_sources()
        self.path = Path(hass.config.path(".storage", DB_FILENAME))
        self._db_lock = asyncio.Lock()
        self._entries: dict[str, ConfigEntry] = {}
        self._settings: dict[str, dict[str, Any]] = {}
        self._unsubs: dict[str, Any] = {}
        self._sample_tasks: dict[str, asyncio.Task[Any]] = {}
        self._last_points: dict[str, Point] = {}
        self._cleanup_unsub: Any | None = None

    async def async_setup(self) -> None:
        await self.hass.async_add_executor_job(self._init_db)
        await self._setup_sources()
        self._settings = await self.hass.async_add_executor_job(self._load_settings)
        self._cleanup_unsub = async_track_time_change(
            self.hass, self._async_cleanup_callback, hour=3, minute=17, second=0
        )
        await self.async_cleanup_retention()

    def _connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(self.path, timeout=30)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA synchronous=NORMAL")
        return con

    def _init_db(self) -> None:
        with self._connect() as con:
            con.executescript(
                """
                CREATE TABLE IF NOT EXISTS tracking_settings (
                    vehicle_id TEXT PRIMARY KEY,
                    enabled INTEGER NOT NULL DEFAULT 0,
                    retention_days INTEGER NOT NULL DEFAULT 365,
                    updated_ts REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS track_points (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    vehicle_id TEXT NOT NULL,
                    vehicle_name TEXT NOT NULL,
                    ts REAL NOT NULL,
                    lat REAL NOT NULL,
                    lon REAL NOT NULL,
                    altitude REAL,
                    odometer REAL,
                    soc REAL,
                    speed REAL,
                    bearing REAL,
                    accuracy REAL,
                    source TEXT NOT NULL DEFAULT 'live'
                );
                CREATE INDEX IF NOT EXISTS idx_track_vehicle_ts ON track_points(vehicle_id, ts);
                CREATE INDEX IF NOT EXISTS idx_track_ts ON track_points(ts);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_track_dedupe
                    ON track_points(vehicle_id, ts, lat, lon);
                """
            )

    def _load_settings(self) -> dict[str, dict[str, Any]]:
        result: dict[str, dict[str, Any]] = {}
        with self._connect() as con:
            for row in con.execute("SELECT vehicle_id, enabled, retention_days FROM tracking_settings"):
                result[str(row["vehicle_id"])] = {
                    "enabled": bool(row["enabled"]),
                    "retention_days": int(row["retention_days"]),
                }
        return result

    def setting(self, entry_id: str) -> dict[str, Any]:
        return self._settings.setdefault(
            entry_id, {"enabled": False, "retention_days": DEFAULT_RETENTION_DAYS}
        )

    async def async_register_entry(self, entry: ConfigEntry) -> None:
        self._entries[entry.entry_id] = entry
        self._listen_source(entry.entry_id)
        last = await self.hass.async_add_executor_job(self._last_point_db, entry.entry_id)
        if last is not None:
            self._last_points[entry.entry_id] = last
        if not entry.data.get(CONF_LATITUDE_ENTITY) or not entry.data.get(CONF_LONGITUDE_ENTITY):
            return
        if entry.entry_id in self._unsubs:
            return
        entities = [entry.data[CONF_LATITUDE_ENTITY], entry.data[CONF_LONGITUDE_ENTITY]]

        @callback
        def _handle_gps_change(event: Event[EventStateChangedData]) -> None:
            # The registered callable itself must be marked as a callback.
            # An unmarked lambda runs in HA's executor, where async_create_task
            # (and cancellation of our debounce task) is not thread-safe.
            self._state_changed(entry.entry_id, event)

        self._unsubs[entry.entry_id] = async_track_state_change_event(
            self.hass, entities, _handle_gps_change
        )
        if self.setting(entry.entry_id)["enabled"]:
            self._schedule_sample(entry.entry_id, delay=0.2)

    async def async_unregister_entry(self, entry_id: str) -> None:
        source_unsub = self._source_unsubs.pop(entry_id, None)
        if source_unsub:
            source_unsub()
        unsub = self._unsubs.pop(entry_id, None)
        if unsub:
            unsub()
        task = self._sample_tasks.pop(entry_id, None)
        if task and not task.done():
            task.cancel()
        self._entries.pop(entry_id, None)
        self._last_points.pop(entry_id, None)

    @callback
    def _state_changed(self, entry_id: str, event: Event[EventStateChangedData]) -> None:
        if not self.setting(entry_id)["enabled"]:
            return
        self._schedule_sample(entry_id, delay=0.8)

    def _schedule_sample(self, entry_id: str, *, delay: float) -> None:
        old = self._sample_tasks.get(entry_id)
        if old and not old.done():
            old.cancel()
        self._sample_tasks[entry_id] = self.hass.async_create_task(
            self._delayed_sample(entry_id, delay)
        )

    async def _delayed_sample(self, entry_id: str, delay: float) -> None:
        try:
            await asyncio.sleep(delay)
            await self.async_record_current(entry_id)
        except asyncio.CancelledError:
            return
        except Exception:  # tracking failures must not interrupt core analytics
            _LOGGER.exception("Could not record a Cardata GPS point for %s", entry_id)
        finally:
            current = self._sample_tasks.get(entry_id)
            if current is asyncio.current_task():
                self._sample_tasks.pop(entry_id, None)

    def _current_candidate(self, entry: ConfigEntry) -> Point | None:
        lat_state = self.hass.states.get(entry.data.get(CONF_LATITUDE_ENTITY))
        lon_state = self.hass.states.get(entry.data.get(CONF_LONGITUDE_ENTITY))
        lat = _valid_coordinate(getattr(lat_state, "state", None), latitude=True)
        lon = _valid_coordinate(getattr(lon_state, "state", None), latitude=False)
        if lat is None or lon is None:
            return None
        updated = [
            value
            for value in (
                getattr(lat_state, "last_updated", None) or getattr(lat_state, "last_changed", None),
                getattr(lon_state, "last_updated", None) or getattr(lon_state, "last_changed", None),
            )
            if isinstance(value, datetime)
        ]
        ts = dt_util.as_utc(max(updated)).timestamp() if updated else dt_util.utcnow().timestamp()
        attrs: dict[str, Any] = {}
        for state in (lat_state, lon_state):
            raw = getattr(state, "attributes", None)
            if isinstance(raw, dict):
                attrs.update(raw)
        def _attr_number(*keys: str) -> float | None:
            for key in keys:
                try:
                    value = float(attrs.get(key))
                except (TypeError, ValueError):
                    continue
                if math.isfinite(value):
                    return value
            return None
        return Point(
            ts=ts,
            lat=lat,
            lon=lon,
            altitude=_attr_number("altitude", "elevation"),
            accuracy=_attr_number("gps_accuracy", "accuracy"),
            odometer=_state_number(self.hass, entry.data.get(CONF_MILEAGE_ENTITY)),
            soc=_state_number(self.hass, entry.data.get(CONF_SOC_ENTITY)),
            source="live",
        )

    def _accept_candidate(self, previous: Point | None, point: Point) -> tuple[bool, Point]:
        if previous is None:
            return True, point
        if point.ts <= previous.ts:
            return False, point
        if point.source != previous.source and (point.source.startswith("external:") or previous.source.startswith("external:")):
            return True, point
        elapsed = point.ts - previous.ts
        if elapsed <= 0:
            return False, point
        distance = _haversine_m(previous.lat, previous.lon, point.lat, point.lon)
        if elapsed < TRACK_MIN_INTERVAL_SECONDS and distance < 30.0:
            return False, point
        if distance < TRACK_MIN_MOVE_METERS and elapsed < TRACK_HEARTBEAT_SECONDS:
            return False, point
        if elapsed <= TRACK_SEGMENT_GAP_SECONDS:
            speed = distance / elapsed * 3.6
            if speed > TRACK_MAX_SPEED_KMH:
                return False, point
            point.speed = speed
            if distance >= 3.0:
                point.bearing = _bearing_deg(previous.lat, previous.lon, point.lat, point.lon)
        return True, point

    async def async_record_current(self, entry_id: str) -> bool:
        async with self._source_lock:
            entry = self._entries.get(entry_id)
            session = self._sessions.get(entry_id, {})
            if entry is None:
                return False
            if session.get("active"):
                point = self._external_candidate(entry)
            elif session:
                # Explicitly ended external trips stay parked; no silent fallback.
                return False
            elif self.setting(entry_id)["enabled"]:
                point = self._current_candidate(entry)
            else:
                return False
            if point is None:
                return False
            accepted, point = self._accept_candidate(self._last_points.get(entry_id), point)
            if not accepted:
                return False
            inserted = await self.hass.async_add_executor_job(self._insert_point_db, entry_id, entry.title, point)
            if inserted:
                self._last_points[entry_id] = point
                if session.get("active"):
                    session["last_fix"] = point.as_dict()
                    await self._persist_sources()
            return inserted

    def _insert_point_db(self, entry_id: str, name: str, point: Point) -> bool:
        with self._connect() as con:
            cur = con.execute(
                """INSERT OR IGNORE INTO track_points
                   (vehicle_id, vehicle_name, ts, lat, lon, altitude, odometer, soc, speed, bearing, accuracy, source)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    entry_id, name, point.ts, point.lat, point.lon, point.altitude,
                    point.odometer, point.soc, point.speed, point.bearing, point.accuracy, point.source,
                ),
            )
            return cur.rowcount > 0

    def _last_point_db(self, entry_id: str) -> Point | None:
        with self._connect() as con:
            row = con.execute(
                "SELECT * FROM track_points WHERE vehicle_id=? ORDER BY ts DESC LIMIT 1", (entry_id,)
            ).fetchone()
        return self._row_point(row) if row else None

    @staticmethod
    def _row_point(row: sqlite3.Row) -> Point:
        return Point(
            ts=float(row["ts"]), lat=float(row["lat"]), lon=float(row["lon"]),
            odometer=row["odometer"], soc=row["soc"], speed=row["speed"], bearing=row["bearing"],
            altitude=row["altitude"], accuracy=row["accuracy"], source=str(row["source"] or "live"),
        )

    async def async_set_settings(self, entry_id: str, enabled: bool, retention_days: int) -> dict[str, Any]:
        if retention_days not in ALLOWED_RETENTION_DAYS:
            raise ValueError("Unsupported retention period")
        if enabled:
            async with self._source_lock:
                if self._sessions.get(entry_id, {}).get("active"):
                    raise ValueError("End the external GPS trip first")
                previous_session = self._sessions.pop(entry_id, None)
                try:
                    await self._persist_sources()
                except Exception:
                    if previous_session is not None:
                        self._sessions[entry_id] = previous_session
                    raise
        setting = {"enabled": bool(enabled), "retention_days": int(retention_days)}
        self._settings[entry_id] = setting
        await self.hass.async_add_executor_job(self._save_setting_db, entry_id, setting)
        if enabled:
            self._schedule_sample(entry_id, delay=0.1)
        await self.async_cleanup_retention(entry_id)
        return dict(setting)

    def _save_setting_db(self, entry_id: str, setting: dict[str, Any]) -> None:
        with self._connect() as con:
            con.execute(
                """INSERT INTO tracking_settings(vehicle_id, enabled, retention_days, updated_ts)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(vehicle_id) DO UPDATE SET enabled=excluded.enabled,
                     retention_days=excluded.retention_days, updated_ts=excluded.updated_ts""",
                (entry_id, 1 if setting["enabled"] else 0, setting["retention_days"], dt_util.utcnow().timestamp()),
            )

    @callback
    def _async_cleanup_callback(self, now: datetime) -> None:
        self.hass.async_create_task(self.async_cleanup_retention())

    async def async_cleanup_retention(self, only_entry: str | None = None) -> None:
        for entry_id, setting in list(self._settings.items()):
            if only_entry is not None and entry_id != only_entry:
                continue
            days = int(setting.get("retention_days", DEFAULT_RETENTION_DAYS))
            if days <= 0:
                continue
            cutoff = dt_util.utcnow().timestamp() - days * 86400
            await self.hass.async_add_executor_job(self._delete_before_db, entry_id, cutoff)

    def _delete_before_db(self, entry_id: str, cutoff: float) -> None:
        with self._connect() as con:
            con.execute("DELETE FROM track_points WHERE vehicle_id=? AND ts<?", (entry_id, cutoff))

    def _status_db(
        self, entry_ids: list[str], start_ts: float | None = None, end_ts: float | None = None
    ) -> dict[str, dict[str, Any]]:
        """Read committed point counts, optionally limited to an import range."""
        out: dict[str, dict[str, Any]] = {}
        with self._connect() as con:
            for entry_id in entry_ids:
                clauses = ["vehicle_id=?"]
                params: list[Any] = [entry_id]
                if start_ts is not None:
                    clauses.append("ts>=?")
                    params.append(start_ts)
                if end_ts is not None:
                    clauses.append("ts<=?")
                    params.append(end_ts)
                row = con.execute(
                    """SELECT COUNT(*) AS n, MIN(ts) AS first_ts, MAX(ts) AS last_ts,
                       SUM(CASE WHEN (source='live' OR source LIKE 'external:%') THEN 1 ELSE 0 END) AS live_count,
                       SUM(CASE WHEN source='recorder_import' THEN 1 ELSE 0 END) AS imported_count,
                       MAX(CASE WHEN (source='live' OR source LIKE 'external:%') THEN ts END) AS last_live_ts
                       FROM track_points WHERE """ + " AND ".join(clauses),
                    params,
                ).fetchone()
                out[entry_id] = {
                    "point_count": int(row["n"] or 0),
                    "first_ts": _iso_utc(row["first_ts"]) if row["first_ts"] is not None else None,
                    "last_ts": _iso_utc(row["last_ts"]) if row["last_ts"] is not None else None,
                    "live_point_count": int(row["live_count"] or 0),
                    "imported_point_count": int(row["imported_count"] or 0),
                    "last_live_ts": _iso_utc(row["last_live_ts"]) if row["last_live_ts"] is not None else None,
                }
        return out

    async def async_status(self) -> dict[str, Any]:
        entry_ids = list(self._entries)
        db = await self.hass.async_add_executor_job(self._status_db, entry_ids)
        vehicles = []
        for entry_id, entry in self._entries.items():
            setting = self.setting(entry_id)
            vehicles.append(
                {
                    "entry_id": entry_id,
                    "name": entry.title or str(entry.data.get(CONF_VEHICLE_NAME) or "Vehicle"),
                    "gps_configured": bool(entry.data.get(CONF_LATITUDE_ENTITY) and entry.data.get(CONF_LONGITUDE_ENTITY)) or any(entry_id in s["vehicles"] for s in self._sources.values()) or bool(db.get(entry_id, {}).get("point_count")),
                    "native_gps": bool(entry.data.get(CONF_LATITUDE_ENTITY) and entry.data.get(CONF_LONGITUDE_ENTITY)),
                    "session": self._sessions.get(entry_id),
                    "enabled": bool(setting["enabled"]) and entry_id not in self._sessions,
                    "retention_days": int(setting["retention_days"]),
                    **db.get(entry_id, {}),
                }
            )
        vehicles.sort(key=lambda item: item["name"].casefold())
        return {"vehicles": vehicles, "database": str(self.path.name), "sources": self._sources_status()}

    def _points_db(self, entry_id: str, start_ts: float, end_ts: float, limit: int | None = None) -> list[Point]:
        sql = "SELECT * FROM track_points WHERE vehicle_id=? AND ts>=? AND ts<=? ORDER BY ts"
        params: list[Any] = [entry_id, start_ts, end_ts]
        if limit is not None:
            sql += " LIMIT ?"
            params.append(limit)
        with self._connect() as con:
            rows = con.execute(sql, params).fetchall()
        return [self._row_point(row) for row in rows]

    @staticmethod
    def _split_segments(points: list[Point]) -> list[list[Point]]:
        if not points:
            return []
        segments: list[list[Point]] = [[points[0]]]
        for point in points[1:]:
            prev = segments[-1][-1]
            gap = point.ts - prev.ts
            distance = _haversine_m(prev.lat, prev.lon, point.lat, point.lon)
            speed = distance / gap * 3.6 if gap > 0 else float("inf")
            if gap > TRACK_SEGMENT_GAP_SECONDS or speed > TRACK_MAX_SPEED_KMH or (point.source != prev.source and (point.source.startswith("external:") or prev.source.startswith("external:"))):
                segments.append([point])
            else:
                segments[-1].append(point)
        return segments

    @staticmethod
    def _segment_distance_m(points: list[Point]) -> float:
        return sum(
            _haversine_m(a.lat, a.lon, b.lat, b.lon)
            for a, b in zip(points, points[1:])
        )

    @staticmethod
    def _perpendicular_distance_m(point: Point, start: Point, end: Point) -> float:
        # Local equirectangular projection is adequate for short simplification spans.
        ref_lat = math.radians((start.lat + end.lat + point.lat) / 3.0)
        scale_x = 111320.0 * max(0.01, math.cos(ref_lat))
        scale_y = 110540.0
        x1, y1 = start.lon * scale_x, start.lat * scale_y
        x2, y2 = end.lon * scale_x, end.lat * scale_y
        x0, y0 = point.lon * scale_x, point.lat * scale_y
        dx, dy = x2 - x1, y2 - y1
        if dx == 0 and dy == 0:
            return math.hypot(x0 - x1, y0 - y1)
        t = max(0.0, min(1.0, ((x0 - x1) * dx + (y0 - y1) * dy) / (dx * dx + dy * dy)))
        return math.hypot(x0 - (x1 + t * dx), y0 - (y1 + t * dy))

    @classmethod
    def _douglas_peucker(cls, points: list[Point], tolerance_m: float) -> list[Point]:
        if len(points) <= 2:
            return points[:]
        max_dist = -1.0
        index = 0
        first, last = points[0], points[-1]
        for i in range(1, len(points) - 1):
            dist = cls._perpendicular_distance_m(points[i], first, last)
            if dist > max_dist:
                max_dist, index = dist, i
        if max_dist > tolerance_m:
            left = cls._douglas_peucker(points[: index + 1], tolerance_m)
            right = cls._douglas_peucker(points[index:], tolerance_m)
            return left[:-1] + right
        return [first, last]

    @classmethod
    def _simplify_segments(cls, segments: list[list[Point]], max_points: int) -> list[list[Point]]:
        total = sum(len(s) for s in segments)
        if total <= max_points:
            return segments
        tolerance = 3.0
        simplified = segments
        for _ in range(12):
            simplified = [cls._douglas_peucker(segment, tolerance) if len(segment) > 2 else segment[:] for segment in segments]
            if sum(len(s) for s in simplified) <= max_points:
                return simplified
            tolerance *= 1.8
        # Final deterministic thinning if a very noisy track still exceeds the cap.
        total = sum(len(s) for s in simplified)
        step = max(2, math.ceil(total / max_points))
        out: list[list[Point]] = []
        for segment in simplified:
            if len(segment) <= 2:
                out.append(segment)
            else:
                thinned = segment[::step]
                if thinned[-1] is not segment[-1]:
                    thinned.append(segment[-1])
                out.append(thinned)
        return out

    async def async_query(self, entry_ids: list[str], start: datetime, end: datetime, max_points: int) -> dict[str, Any]:
        start_ts, end_ts = start.timestamp(), end.timestamp()
        vehicles: list[dict[str, Any]] = []
        max_points = max(500, min(MAX_QUERY_POINTS, int(max_points)))
        per_vehicle = max(500, max_points // max(1, len(entry_ids)))
        for entry_id in entry_ids:
            entry = self._entries.get(entry_id)
            if entry is None:
                continue
            points = await self.hass.async_add_executor_job(self._points_db, entry_id, start_ts, end_ts, None)
            full_segments = self._split_segments(points)
            trips = []
            total_distance = 0.0
            max_speed = 0.0
            for idx, segment in enumerate(full_segments):
                # Keep raw segments (and their indices) for GPX compatibility,
                # but isolated observations are not trips.
                if len(segment) < 2:
                    continue
                dist_m = self._segment_distance_m(segment)
                trip_duration = max(0.0, segment[-1].ts - segment[0].ts)
                trip_max_speed = max((p.speed or 0.0) for p in segment)
                total_distance += dist_m
                max_speed = max(max_speed, trip_max_speed)
                trips.append(
                    {
                        "index": idx,
                        "start": _iso_utc(segment[0].ts),
                        "end": _iso_utc(segment[-1].ts),
                        "distance_km": round(dist_m / 1000.0, 3),
                        "point_count": len(segment),
                        "start_soc": segment[0].soc if segment[0].soc is not None and 0 <= segment[0].soc <= 100 else None,
                        "end_soc": segment[-1].soc if segment[-1].soc is not None and 0 <= segment[-1].soc <= 100 else None,
                        "duration_seconds": round(trip_duration),
                        "avg_speed_kmh": round(dist_m / trip_duration * 3.6, 2) if trip_duration > 0 else 0.0,
                        "max_speed_kmh": round(trip_max_speed, 2),
                    }
                )
            segments = self._simplify_segments(full_segments, per_vehicle)
            rendered_points = sum(len(s) for s in segments)
            duration = sum(max(0.0, s[-1].ts - s[0].ts) for s in full_segments if len(s) >= 2)
            vehicles.append(
                {
                    "entry_id": entry_id,
                    "name": entry.title,
                    "point_count": len(points),
                    "rendered_point_count": rendered_points,
                    "distance_km": round(total_distance / 1000.0, 3),
                    "trip_count": len(trips),
                    "duration_seconds": round(duration),
                    "avg_speed_kmh": round((total_distance / 1000.0) / (duration / 3600.0), 2) if duration > 0 else 0.0,
                    "max_speed_kmh": round(max_speed, 2),
                    "trips": trips,
                    "segments": [[point.as_dict() for point in segment] for segment in segments if segment],
                }
            )
        return {"start": start.isoformat(), "end": end.isoformat(), "vehicles": vehicles}

    async def async_trip_details(self, entry_id: str, start: datetime, end: datetime) -> dict[str, Any]:
        """Read Analytics only on explicit trip selection, independently of GPS recording."""
        entry = self._entries.get(entry_id)
        if entry is None:
            raise ValueError("Unknown vehicle")
        points = await self.hass.async_add_executor_job(
            self._points_db, entry_id, start.timestamp(), end.timestamp(), None
        )
        segments = self._split_segments(points)
        if len(segments) != 1 or len(segments[0]) < 2:
            raise ValueError("Select one stored trip")
        if abs(points[0].ts - start.timestamp()) > 0.001 or abs(points[-1].ts - end.timestamp()) > 0.001:
            raise ValueError("Trip bounds have changed; reload the track")
        return await async_trip_analytics(self.hass, entry, start, end)

    def _nearest_series(self, states: list[Any]) -> tuple[list[float], list[float]]:
        pairs: list[tuple[float, float]] = []
        for state in states:
            try:
                value = float(state.state)
            except (TypeError, ValueError):
                continue
            when = getattr(state, "last_updated", None) or getattr(state, "last_changed", None)
            if not isinstance(when, datetime) or not math.isfinite(value):
                continue
            pairs.append((dt_util.as_utc(when).timestamp(), value))
        pairs.sort()
        return [p[0] for p in pairs], [p[1] for p in pairs]

    @staticmethod
    def _series_value(times: list[float], values: list[float], ts: float) -> float | None:
        idx = bisect_right(times, ts) - 1
        return values[idx] if idx >= 0 else None

    def _fetch_recorder_history(self, entity_ids: list[str], start: datetime, end: datetime) -> dict[str, list[Any]]:
        return history.get_significant_states(
            self.hass, start, end, entity_ids, None, True, False, False, True, False
        )

    async def async_import_recorder(self, entry_id: str, start: datetime, end: datetime) -> dict[str, Any]:
        entry = self._entries.get(entry_id)
        if entry is None:
            raise ValueError("Unknown vehicle")
        lat_id = entry.data.get(CONF_LATITUDE_ENTITY)
        lon_id = entry.data.get(CONF_LONGITUDE_ENTITY)
        if not lat_id or not lon_id:
            raise ValueError("Vehicle has no configured GPS entities")
        ids = [lat_id, lon_id]
        for optional in (entry.data.get(CONF_SOC_ENTITY), entry.data.get(CONF_MILEAGE_ENTITY)):
            if optional and optional not in ids:
                ids.append(optional)
        hist = await self.hass.async_add_executor_job(self._fetch_recorder_history, ids, start, end)
        lat_states = hist.get(lat_id, [])
        lon_states = hist.get(lon_id, [])
        soc_times, soc_values = self._nearest_series(hist.get(entry.data.get(CONF_SOC_ENTITY), [])) if entry.data.get(CONF_SOC_ENTITY) else ([], [])
        odo_times, odo_values = self._nearest_series(hist.get(entry.data.get(CONF_MILEAGE_ENTITY), [])) if entry.data.get(CONF_MILEAGE_ENTITY) else ([], [])
        events: list[tuple[float, str, float]] = []
        for kind, states, latitude in (("lat", lat_states, True), ("lon", lon_states, False)):
            for state in states:
                when = getattr(state, "last_updated", None) or getattr(state, "last_changed", None)
                value = _valid_coordinate(getattr(state, "state", None), latitude=latitude)
                if not isinstance(when, datetime) or value is None:
                    continue
                events.append((dt_util.as_utc(when).timestamp(), kind, value))
        events.sort(key=lambda item: item[0])
        lat: float | None = None
        lon: float | None = None
        candidates: list[Point] = []
        last_pair: tuple[float, float] | None = None
        # Latitude/longitude entities normally update as one logical GPS sample,
        # but Recorder stores them as separate state rows. Coalesce changes that
        # arrive within two seconds so an intermediate "new lat + old lon" pair
        # never becomes a fake corner in an imported track.
        groups: list[list[tuple[float, str, float]]] = []
        for event in events:
            if not groups or event[0] - groups[-1][-1][0] > 2.0:
                groups.append([event])
            else:
                groups[-1].append(event)
        for group in groups:
            ts = group[-1][0]
            for _event_ts, kind, value in group:
                if kind == "lat":
                    lat = value
                else:
                    lon = value
            if lat is None or lon is None:
                continue
            pair = (lat, lon)
            if pair == last_pair:
                continue
            last_pair = pair
            candidates.append(
                Point(
                    ts=ts, lat=lat, lon=lon,
                    soc=self._series_value(soc_times, soc_values, ts),
                    odometer=self._series_value(odo_times, odo_values, ts),
                    source="recorder_import",
                )
            )
        before = await self.hass.async_add_executor_job(self._last_point_before_db, entry_id, start.timestamp())
        accepted: list[Point] = []
        previous = before
        for point in candidates:
            ok, point = self._accept_candidate(previous, point)
            if not ok:
                continue
            accepted.append(point)
            previous = point
        inserted = await self.hass.async_add_executor_job(self._insert_many_db, entry_id, entry.title, accepted)
        if accepted:
            current_last = self._last_points.get(entry_id)
            if current_last is None or accepted[-1].ts > current_last.ts:
                self._last_points[entry_id] = accepted[-1]
        # The insert transaction has committed before this fresh connection is
        # opened. This is stored data, not a count of Recorder search results.
        stored = await self.hass.async_add_executor_job(
            self._status_db, [entry_id], start.timestamp(), end.timestamp()
        )
        return {
            "candidates": len(candidates),
            "accepted": len(accepted),
            "inserted": inserted,
            "already_stored": len(accepted) - inserted,
            "filtered": len(candidates) - len(accepted),
            "stored": stored[entry_id],
            "start": start.isoformat(),
            "end": end.isoformat(),
            "vehicle_name": entry.title,
        }

    def _last_point_before_db(self, entry_id: str, ts: float) -> Point | None:
        with self._connect() as con:
            row = con.execute(
                "SELECT * FROM track_points WHERE vehicle_id=? AND ts<? ORDER BY ts DESC LIMIT 1",
                (entry_id, ts),
            ).fetchone()
        return self._row_point(row) if row else None

    def _insert_many_db(self, entry_id: str, name: str, points: list[Point]) -> int:
        if not points:
            return 0
        with self._connect() as con:
            before = con.total_changes
            con.executemany(
                """INSERT OR IGNORE INTO track_points
                   (vehicle_id, vehicle_name, ts, lat, lon, altitude, odometer, soc, speed, bearing, accuracy, source)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                [
                    (
                        entry_id, name, p.ts, p.lat, p.lon, p.altitude, p.odometer, p.soc,
                        p.speed, p.bearing, p.accuracy, p.source,
                    )
                    for p in points
                ],
            )
            return con.total_changes - before

    async def async_delete(self, entry_ids: list[str], start: datetime | None, end: datetime | None) -> int:
        return await self.hass.async_add_executor_job(
            self._delete_db,
            entry_ids,
            start.timestamp() if start else None,
            end.timestamp() if end else None,
        )

    def _delete_db(self, entry_ids: list[str], start_ts: float | None, end_ts: float | None) -> int:
        total = 0
        with self._connect() as con:
            for entry_id in entry_ids:
                clauses = ["vehicle_id=?"]
                params: list[Any] = [entry_id]
                if start_ts is not None:
                    clauses.append("ts>=?")
                    params.append(start_ts)
                if end_ts is not None:
                    clauses.append("ts<=?")
                    params.append(end_ts)
                cur = con.execute("DELETE FROM track_points WHERE " + " AND ".join(clauses), params)
                total += cur.rowcount
        for entry_id in entry_ids:
            self._last_points.pop(entry_id, None)
        return total

    async def async_gpx(self, entry_id: str, start: datetime, end: datetime, trip_index: int | None = None) -> dict[str, str]:
        entry = self._entries.get(entry_id)
        if entry is None:
            raise ValueError("Unknown vehicle")
        points = await self.hass.async_add_executor_job(
            self._points_db, entry_id, start.timestamp(), end.timestamp(), MAX_GPX_POINTS + 1
        )
        if len(points) > MAX_GPX_POINTS:
            raise ValueError("Too many points for one GPX export")
        segments = self._split_segments(points)
        if trip_index is not None:
            if trip_index < 0 or trip_index >= len(segments):
                raise ValueError("Unknown trip index")
            segments = [segments[trip_index]]
        name = entry.title or "Cardata vehicle"
        start_tag = start.astimezone(timezone.utc).strftime("%Y%m%d_%H%M")
        end_tag = end.astimezone(timezone.utc).strftime("%Y%m%d_%H%M")
        safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in name).strip("_") or "vehicle"
        lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<gpx version="1.1" creator="Cardata Analytics" xmlns="http://www.topografix.com/GPX/1/1" xmlns:cardata="https://github.com/lemuba/cardata-analytics/gpx/1">',
            f"  <trk><name>{escape(name)}</name>",
        ]
        for segment in segments:
            if not segment:
                continue
            lines.append("    <trkseg>")
            for p in segment:
                lines.append(f'      <trkpt lat="{p.lat:.7f}" lon="{p.lon:.7f}">')
                if p.altitude is not None:
                    lines.append(f"        <ele>{p.altitude:.1f}</ele>")
                lines.append(f"        <time>{_iso_utc(p.ts)}</time>")
                extensions = []
                if p.soc is not None:
                    extensions.append(f"<cardata:soc>{p.soc:.2f}</cardata:soc>")
                if p.speed is not None:
                    extensions.append(f"<cardata:speed_kmh>{p.speed:.2f}</cardata:speed_kmh>")
                if p.odometer is not None:
                    extensions.append(f"<cardata:odometer_km>{p.odometer:.3f}</cardata:odometer_km>")
                if extensions:
                    lines.append("        <extensions>" + "".join(extensions) + "</extensions>")
                lines.append("      </trkpt>")
            lines.append("    </trkseg>")
        lines += ["  </trk>", "</gpx>"]
        suffix = f"_trip_{trip_index + 1}" if trip_index is not None else ""
        return {"filename": f"Cardata_{safe}_{start_tag}_to_{end_tag}{suffix}.gpx", "content": "\n".join(lines)}


async def async_setup_tracking(hass: HomeAssistant) -> TrackingManager:
    data = hass.data.setdefault(DOMAIN, {})
    manager = data.get(DATA_MANAGER)
    if isinstance(manager, TrackingManager):
        return manager
    manager = TrackingManager(hass)
    await manager.async_setup()
    data[DATA_MANAGER] = manager
    return manager


def get_tracking_manager(hass: HomeAssistant) -> TrackingManager | None:
    manager = hass.data.get(DOMAIN, {}).get(DATA_MANAGER)
    return manager if isinstance(manager, TrackingManager) else None


def _validate_range(start: str, end: str) -> tuple[datetime, datetime]:
    start_dt = _parse_ts(start)
    end_dt = _parse_ts(end)
    if end_dt <= start_dt:
        raise ValueError("End must be after start")
    if end_dt - start_dt > timedelta(days=MAX_QUERY_DAYS):
        raise ValueError("Requested range is too large")
    return start_dt, end_dt


@websocket_api.websocket_command({vol.Required("type"): WS_STATUS})
@websocket_api.async_response
async def websocket_status(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    manager = get_tracking_manager(hass)
    if manager is None:
        connection.send_error(msg["id"], "not_ready", "Tracking is not ready")
        return
    connection.send_result(msg["id"], await manager.async_status())


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_SETTINGS,
        vol.Required("entry_id"): str,
        vol.Required("enabled"): bool,
        vol.Required("retention_days"): vol.Coerce(int),
    }
)
@websocket_api.async_response
async def websocket_settings(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    manager = get_tracking_manager(hass)
    if manager is None or msg["entry_id"] not in manager._entries:
        connection.send_error(msg["id"], "unknown_vehicle", "Unknown vehicle")
        return
    try:
        result = await manager.async_set_settings(msg["entry_id"], msg["enabled"], msg["retention_days"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_settings", str(err))
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_QUERY,
        vol.Required("entry_ids"): [str],
        vol.Required("start"): str,
        vol.Required("end"): str,
        vol.Optional("max_points", default=12000): vol.Coerce(int),
    }
)
@websocket_api.async_response
async def websocket_query(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    manager = get_tracking_manager(hass)
    if manager is None:
        connection.send_error(msg["id"], "not_ready", "Tracking is not ready")
        return
    try:
        start, end = _validate_range(msg["start"], msg["end"])
        result = await manager.async_query(msg["entry_ids"], start, end, msg["max_points"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_range", str(err))
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_IMPORT,
        vol.Required("entry_id"): str,
        vol.Required("start"): str,
        vol.Required("end"): str,
    }
)
@websocket_api.async_response
async def websocket_import(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    manager = get_tracking_manager(hass)
    if manager is None:
        connection.send_error(msg["id"], "not_ready", "Tracking is not ready")
        return
    try:
        start, end = _validate_range(msg["start"], msg["end"])
        result = await manager.async_import_recorder(msg["entry_id"], start, end)
    except (ValueError, KeyError) as err:
        connection.send_error(msg["id"], "import_failed", str(err))
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_DELETE,
        vol.Required("entry_ids"): [str],
        vol.Optional("start"): str,
        vol.Optional("end"): str,
    }
)
@websocket_api.async_response
async def websocket_delete(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    manager = get_tracking_manager(hass)
    if manager is None:
        connection.send_error(msg["id"], "not_ready", "Tracking is not ready")
        return
    try:
        start = _parse_ts(msg["start"]) if msg.get("start") else None
        end = _parse_ts(msg["end"]) if msg.get("end") else None
        deleted = await manager.async_delete(msg["entry_ids"], start, end)
    except ValueError as err:
        connection.send_error(msg["id"], "delete_failed", str(err))
        return
    connection.send_result(msg["id"], {"deleted": deleted})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_GPX,
        vol.Required("entry_id"): str,
        vol.Required("start"): str,
        vol.Required("end"): str,
        vol.Optional("trip_index"): vol.Coerce(int),
    }
)
@websocket_api.async_response
async def websocket_gpx(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    manager = get_tracking_manager(hass)
    if manager is None:
        connection.send_error(msg["id"], "not_ready", "Tracking is not ready")
        return
    try:
        start, end = _validate_range(msg["start"], msg["end"])
        result = await manager.async_gpx(msg["entry_id"], start, end, msg.get("trip_index"))
    except ValueError as err:
        connection.send_error(msg["id"], "gpx_failed", str(err))
        return
    connection.send_result(msg["id"], result)


def async_register_websocket(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, websocket_sources)
    websocket_api.async_register_command(hass, websocket_status)
    websocket_api.async_register_command(hass, websocket_settings)
    websocket_api.async_register_command(hass, websocket_query)
    websocket_api.async_register_command(hass, websocket_import)
    websocket_api.async_register_command(hass, websocket_delete)
    websocket_api.async_register_command(hass, websocket_gpx)
    websocket_api.async_register_command(hass, websocket_trip_details)


@websocket_api.websocket_command(
    {vol.Required("type"): WS_TRIP_DETAILS, vol.Required("entry_id"): str,
     vol.Required("start"): str, vol.Required("end"): str}
)
@websocket_api.async_response
async def websocket_trip_details(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    manager = get_tracking_manager(hass)
    if manager is None:
        connection.send_error(msg["id"], "not_ready", "Tracking is not ready")
        return
    try:
        start, end = _validate_range(msg["start"], msg["end"])
        result = await manager.async_trip_details(msg["entry_id"], start, end)
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_trip", str(err))
        return
    except Exception:
        _LOGGER.exception("Could not read existing Analytics history for a GPS trip")
        connection.send_error(msg["id"], "history_unavailable", "Analytics history is unavailable")
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/tracking/sources", vol.Required("action"): str, vol.Optional("data", default={}): dict})
@websocket_api.async_response
async def websocket_sources(hass, connection, msg):
    manager = get_tracking_manager(hass)
    if manager is None:
        connection.send_error(msg["id"], "not_ready", "Tracking is not ready")
        return
    if msg["action"] in {"save", "delete"} and not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "Administrator required")
        return
    try:
        result = await manager.async_source_action(msg["action"], msg["data"])
    except (ValueError, KeyError, TypeError) as err:
        connection.send_error(msg["id"], "invalid_source", str(err))
        return
    connection.send_result(msg["id"], result)
