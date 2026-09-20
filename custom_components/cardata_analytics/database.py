"""Versioned Cardata SQLite persistence and atomic migration from <= 0.1.68.

Legacy files are read once and never modified. An interrupted migration never
publishes a partially populated database. HA-owned configuration remains HA-owned.
"""
from __future__ import annotations

import asyncio
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sqlite3
from time import time
from typing import Any, Generic, TypeVar

from .const import DOMAIN

DB_FILENAME = f"{DOMAIN}.db"
LEGACY_DB_FILENAME = f"{DOMAIN}_tracking.db"
SCHEMA_VERSION = 1
T = TypeVar("T")


def encode(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


class Database:
    def __init__(self, directory: Path) -> None:
        self.directory = Path(directory)
        self.path = self.directory / DB_FILENAME

    @contextmanager
    def connect(self):
        con = sqlite3.connect(self.path, timeout=30)
        con.row_factory = sqlite3.Row
        try:
            con.execute("PRAGMA busy_timeout=30000")
            con.execute("PRAGMA synchronous=FULL")
            with con:
                yield con
        finally:
            con.close()

    @staticmethod
    def _schema(con: sqlite3.Connection) -> None:
        con.executescript("""
            CREATE TABLE IF NOT EXISTS documents (
                key TEXT PRIMARY KEY, version INTEGER NOT NULL, payload TEXT NOT NULL,
                split_fields TEXT NOT NULL DEFAULT '[]', updated_ts REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS daily_ledger (
                store_key TEXT NOT NULL, day TEXT NOT NULL, payload TEXT NOT NULL,
                PRIMARY KEY(store_key, day));
            CREATE TABLE IF NOT EXISTS repair_days (
                store_key TEXT NOT NULL, day TEXT NOT NULL, payload TEXT NOT NULL,
                PRIMARY KEY(store_key, day));
            CREATE TABLE IF NOT EXISTS database_meta (key TEXT PRIMARY KEY, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS vehicle_config (
                entry_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_ts REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS measurement_history (
                stream TEXT NOT NULL, ts REAL NOT NULL, state TEXT NOT NULL,
                attributes TEXT NOT NULL, source TEXT NOT NULL,
                PRIMARY KEY(stream, ts));
            CREATE TABLE IF NOT EXISTS history_coverage (
                stream TEXT NOT NULL, start REAL NOT NULL, end REAL NOT NULL,
                PRIMARY KEY(stream, start));
        """)

    def initialize(self) -> dict:
        self.directory.mkdir(parents=True, exist_ok=True)
        if self.path.exists():
            with self.connect() as con:
                version = con.execute("PRAGMA user_version").fetchone()[0]
                if version != SCHEMA_VERSION:
                    raise RuntimeError(f"Unsupported Cardata database schema {version}; expected {SCHEMA_VERSION}")
                if con.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                    raise RuntimeError("Cardata database integrity check failed; refusing empty fallback")
                row = con.execute("SELECT payload FROM database_meta WHERE key='migration'").fetchone()
                if row is None:
                    raise RuntimeError("Cardata database has no completed migration marker")
                return json.loads(row[0])

        # Never touch the authoritative legacy files, including their WAL files.
        staging = self.directory / (DB_FILENAME + ".migrating")
        for suffix in ("", "-wal", "-shm", "-journal"):
            (Path(str(staging) + suffix)).unlink(missing_ok=True)
        report = {"schema": SCHEMA_VERSION, "created_at": datetime.now(timezone.utc).isoformat(),
                  "legacy_files": {}, "track_points": 0, "tracking_settings": 0}
        con = sqlite3.connect(staging)
        try:
            legacy = self.directory / LEGACY_DB_FILENAME
            if legacy.exists():
                source = sqlite3.connect(legacy.as_uri() + "?mode=ro", uri=True)
                try:
                    if source.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                        raise RuntimeError("Legacy GPS database integrity check failed")
                    source.backup(con)
                finally:
                    source.close()
                # Count rows in the coherent snapshot, not in a changing source.
                for table in ("track_points", "tracking_settings"):
                    report[table] = con.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
            con.row_factory = sqlite3.Row
            con.execute("PRAGMA journal_mode=DELETE")
            self._schema(con)
            with con:
                for path in sorted(self.directory.glob(f"{DOMAIN}.*")):
                    if path in (self.path, staging) or not path.is_file():
                        continue
                    # Only the historical HA Store namespace; not DB sidecars or exports.
                    if path.name.endswith((".db", ".migrating", "-wal", "-shm", "-journal")):
                        continue
                    raw = path.read_bytes()
                    envelope = json.loads(raw)
                    if not isinstance(envelope, dict) or envelope.get("key") != path.name:
                        raise ValueError(f"Invalid legacy Store envelope: {path.name}")
                    if envelope.get("version") != 1 or not isinstance(envelope.get("data"), dict):
                        raise ValueError(f"Unsupported legacy Store data/version: {path.name}")
                    self._write_document(con, path.name, 1, envelope["data"])
                    if self._read_document(con, path.name, 1) != envelope["data"]:
                        raise RuntimeError(f"Migration round-trip mismatch: {path.name}")
                    report["legacy_files"][path.name] = hashlib.sha256(raw).hexdigest()
                con.execute("INSERT INTO database_meta VALUES ('migration', ?)", (encode(report),))
                con.execute(f"PRAGMA user_version={SCHEMA_VERSION}")
            if con.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("Migrated Cardata database failed integrity check")
        finally:
            con.close()
        with staging.open("rb") as handle:
            os.fsync(handle.fileno())
        os.replace(staging, self.path)
        directory_fd = os.open(self.directory, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
        with self.connect() as target:
            target.execute("PRAGMA journal_mode=WAL")
        return report

    @staticmethod
    def _write_document(con, key: str, version: int, data: dict) -> None:
        payload = deepcopy(data)
        split = []
        for field, table in (("daily_history", "daily_ledger"), ("soc_repair_days", "repair_days")):
            values = payload.get(field)
            if isinstance(values, dict):
                split.append(field)
                payload.pop(field)
                existing = {row[0]: row[1] for row in con.execute(
                    f"SELECT day, payload FROM {table} WHERE store_key=?", (key,))}
                for day, value in values.items():
                    packed = encode(value)
                    if existing.pop(day, None) != packed:
                        con.execute(f"INSERT OR REPLACE INTO {table} VALUES (?, ?, ?)", (key, day, packed))
                con.executemany(f"DELETE FROM {table} WHERE store_key=? AND day=?", [(key, day) for day in existing])
            else:
                con.execute(f"DELETE FROM {table} WHERE store_key=?", (key,))
        con.execute("INSERT OR REPLACE INTO documents VALUES (?, ?, ?, ?, ?)",
                    (key, version, encode(payload), encode(split), time()))

    @staticmethod
    def _read_document(con, key: str, version: int):
        row = con.execute("SELECT * FROM documents WHERE key=?", (key,)).fetchone()
        if row is None:
            return None
        if row["version"] != version:
            raise ValueError(f"Unsupported document version for {key}")
        data = json.loads(row["payload"])
        for field, table in (("daily_history", "daily_ledger"), ("soc_repair_days", "repair_days")):
            if field in json.loads(row["split_fields"]):
                data[field] = {r[0]: json.loads(r[1]) for r in con.execute(
                    f"SELECT day, payload FROM {table} WHERE store_key=? ORDER BY day", (key,))}
        return data

    def load(self, key: str, version: int = 1):
        with self.connect() as con:
            con.execute("BEGIN")
            return self._read_document(con, key, version)

    def save(self, key: str, version: int, data: dict) -> None:
        with self.connect() as con:
            self._write_document(con, key, version, data)

    def save_config(self, entry_id: str, payload: dict) -> None:
        with self.connect() as con:
            con.execute("INSERT OR REPLACE INTO vehicle_config VALUES (?, ?, ?)",
                        (entry_id, encode(payload), time()))

    def snapshot(self, destination: Path) -> None:
        """Internal consistent snapshot primitive; no restore API in this release."""
        if Path(destination).resolve() == self.path.resolve():
            raise ValueError("Snapshot must not overwrite the active database")
        with self.connect() as source:
            target = sqlite3.connect(destination)
            try:
                source.backup(target)
                if target.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise RuntimeError("Snapshot integrity check failed")
            finally:
                target.close()


def get_database(hass) -> Database:
    data = hass.data.setdefault(DOMAIN, {})
    if "database" not in data:
        data["database"] = Database(Path(hass.config.path(".storage")))
    return data["database"]


async def async_database(hass) -> Database:
    data = hass.data.setdefault(DOMAIN, {})
    db = get_database(hass)
    task = data.get("database_setup")
    if task is None:
        task = hass.async_create_task(hass.async_add_executor_job(db.initialize))
        data["database_setup"] = task
    try:
        await asyncio.shield(task)
    except Exception:
        if data.get("database_setup") is task:
            data.pop("database_setup", None)
        raise
    return db


class DatabaseStore(Generic[T]):
    """Small Store-compatible adapter: retain existing analytics calculations."""
    def __init__(self, hass, version: int, key: str) -> None:
        self.hass, self.version, self.key = hass, version, key

    async def async_load(self) -> T | None:
        db = await async_database(self.hass)
        return await self.hass.async_add_executor_job(db.load, self.key, self.version)

    async def async_save(self, data: T) -> None:
        # Copy before the first await: later runtime mutations cannot leak into
        # this write. All Store writes share a queue and retain their call order.
        snapshot = deepcopy(data)
        domain = self.hass.data.setdefault(DOMAIN, {})
        lock = domain.setdefault("database_write_lock", asyncio.Lock())
        async with lock:
            db = await async_database(self.hass)
            await self.hass.async_add_executor_job(db.save, self.key, self.version, snapshot)
