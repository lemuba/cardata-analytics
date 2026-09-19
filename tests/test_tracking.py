"""Offline regression tests: real SQLite/production logic, minimal HA adapters.

Run with python -m unittest discover -s tests -p 'test_*.py'.
These tests do not replace an integration test in a running Home Assistant.
CARDATA_TEST_ROOT can point at a freshly unpacked release for the second QA pass.
"""

import asyncio
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
import importlib
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import AsyncMock, patch
from xml.etree import ElementTree as ET

ROOT = Path(os.environ.get("CARDATA_TEST_ROOT", Path(__file__).resolve().parents[1]))
COMPONENT = ROOT / "custom_components/cardata_analytics"
UTC = timezone.utc
NOW = datetime(2026, 9, 18, 20, tzinfo=UTC)
NS = types.SimpleNamespace


def module(name, **values):
    result = types.ModuleType(name)
    result.__dict__.update(values)
    sys.modules[name] = result
    return result


def callback(fn):
    fn._hass_callback = True
    return fn


def track_state(hass, entities, action):
    hass.listeners.append((entities, action))
    return lambda: hass.listeners.remove((entities, action))


# Model documented HA dispatch: marked callbacks run on the event loop;
# unmarked synchronous wrappers run in the executor.
module("voluptuous", Required=lambda x: x, Optional=lambda x, **kw: x, Coerce=lambda x: x)
module("homeassistant")
ws = module("homeassistant.components.websocket_api", websocket_command=lambda schema: lambda f: f,
            async_response=lambda f: f, async_register_command=lambda *args: None)
module("homeassistant.components", websocket_api=ws)
history = NS(get_significant_states=lambda *args: {})
module("homeassistant.components.recorder", history=history, get_instance=lambda hass: hass)
module("homeassistant.config_entries", ConfigEntry=object)
module("homeassistant.core", Event=object, EventStateChangedData=dict, HomeAssistant=object, callback=callback)
module("homeassistant.helpers")
module("homeassistant.helpers.event", async_track_state_change_event=track_state,
       async_track_time_change=lambda *args, **kwargs: lambda: None)
module("homeassistant.helpers.dispatcher", async_dispatcher_send=lambda *args: None)
dt = NS(utcnow=lambda: NOW, now=lambda: NOW, as_utc=lambda d: d.astimezone(UTC),
        parse_datetime=lambda s: datetime.fromisoformat(s.replace("Z", "+00:00")), get_time_zone=lambda name: UTC)
module("homeassistant.util", dt=dt)
module("cardata_under_test", __path__=[str(COMPONENT)])
tracking = importlib.import_module("cardata_under_test.tracking")
soc = importlib.import_module("cardata_under_test.soc_filter")
repair = importlib.import_module("cardata_under_test.analytics_repair")


class Hass:
    def __init__(self, root):
        self.config = NS(path=lambda *parts: str(Path(root, *parts)), time_zone="UTC")
        self.states = {}
        self.data = {}
        self.listeners = []
        self.loop_thread = threading.get_ident()

    async def async_add_executor_job(self, fn, *args):
        return await asyncio.to_thread(fn, *args)

    def async_create_task(self, coro):
        if threading.get_ident() != self.loop_thread:
            coro.close()
            raise RuntimeError("async_create_task outside the event-loop thread")
        return asyncio.create_task(coro)

    async def dispatch(self):
        for _, action in list(self.listeners):
            if getattr(action, "_hass_callback", False):
                action(NS())
            else:
                await asyncio.to_thread(action, NS())


def state(value, when, **attrs):
    return NS(state=str(value), last_updated=when, last_changed=when, attributes=attrs)


class TrackingTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="cardata-qa-", dir=ROOT.parent)
        self.hass = Hass(self.temp.name)
        self.manager = tracking.TrackingManager(self.hass)
        await self.manager.async_setup()
        self.entry = NS(entry_id="one", title="Test vehicle", data={
            "latitude_entity": "sensor.lat", "longitude_entity": "sensor.lon",
            "soc_entity": "sensor.soc", "mileage_entity": "sensor.odo"})
        await self.manager.async_register_entry(self.entry)
        self.start = NOW.replace(hour=0)
        self.end = NOW

    async def asyncTearDown(self):
        for key in list(self.manager._entries):
            await self.manager.async_unregister_entry(key)
        await asyncio.sleep(0)
        self.temp.cleanup()

    def set_position(self, lat=54, lon=9, when=None):
        when = when or NOW - timedelta(hours=1)
        self.hass.states.update({"sensor.lat": state(lat, when), "sensor.lon": state(lon, when)})

    def point(self, minute, lat=54, lon=9, **kwargs):
        return tracking.Point((self.start + timedelta(minutes=minute)).timestamp(), lat, lon, **kwargs)

    def store(self, points, vehicle="one"):
        return self.manager._insert_many_db(vehicle, vehicle, points)

    async def query(self, vehicles=None, max_points=12000):
        return await self.manager.async_query(vehicles or ["one"], self.start, self.end, max_points)

    async def test_opt_in_and_actual_event_dispatch(self):
        self.assertEqual(self.manager.setting("one"), {"enabled": False, "retention_days": 365})
        self.set_position()
        await self.hass.dispatch()
        self.assertEqual(self.manager._status_db(["one"])["one"]["point_count"], 0)
        await self.manager.async_set_settings("one", True, 0)
        await asyncio.sleep(.13)
        self.assertEqual(self.manager._status_db(["one"])["one"]["point_count"], 1)
        self.set_position(54.001, 9.001, NOW - timedelta(minutes=59))
        await self.hass.dispatch()
        await self.hass.dispatch()  # separate latitude/longitude events coalesce
        await asyncio.sleep(.83)
        stored = self.manager._status_db(["one"])["one"]
        self.assertEqual(stored["point_count"], 2)
        self.assertEqual(stored["live_point_count"], 2)
        await self.manager.async_set_settings("one", False, 0)
        self.set_position(54.002, 9.002, NOW - timedelta(minutes=58))
        await self.hass.dispatch()
        self.assertEqual(self.manager._status_db(["one"])["one"]["point_count"], 2)

    async def test_reload_settings_source_counts_and_latest_timestamps(self):
        self.store([self.point(60), self.point(61, 54.001, source="recorder_import")])
        await self.manager.async_set_settings("one", True, 180)
        await self.manager.async_unregister_entry("one")
        reloaded = tracking.TrackingManager(self.hass)
        await reloaded.async_setup()
        await reloaded.async_register_entry(self.entry)
        self.assertEqual(reloaded.setting("one"), {"enabled": True, "retention_days": 180})
        row = (await reloaded.async_status())["vehicles"][0]
        self.assertEqual((row["point_count"], row["live_point_count"], row["imported_point_count"]), (2, 1, 1))
        self.assertTrue(row["last_ts"].endswith("01:01:00Z"))
        self.assertTrue(row["last_live_ts"].endswith("01:00:00Z"))
        await reloaded.async_unregister_entry("one")

    async def test_filters_and_heartbeat(self):
        baseline = self.point(0)
        cases = [(self.point(0), False), (self.point(.05, 54.00005), False),
                 (self.point(1, 54.00001), False), (self.point(1, 54.0001), True),
                 (self.point(1, 55), False), (self.point(16, 55), True),
                 (self.point(29), False), (self.point(30), True)]
        for candidate, expected in cases:
            with self.subTest(candidate=candidate):
                self.assertEqual(self.manager._accept_candidate(baseline, candidate)[0], expected)
        self.assertTrue(self.manager._accept_candidate(None, baseline)[0])
        for value in ["unknown", "unavailable", "nan", 91]:
            self.assertIsNone(tracking._valid_coordinate(value, latitude=True))

    async def test_singletons_are_stored_but_not_trips_and_indices_remain_stable(self):
        points = [self.point(0), self.point(926)] + [self.point(1020+i*2, 54+i*.001) for i in range(12)]
        self.store(points)
        result = (await self.query())["vehicles"][0]
        self.assertEqual(result["point_count"], 14)
        self.assertEqual(result["trip_count"], 1)
        self.assertEqual([(t["index"], t["point_count"]) for t in result["trips"]], [(2, 12)])
        self.assertEqual([len(s) for s in result["segments"]], [1, 1, 12])
        self.assertEqual(result["trips"][0]["duration_seconds"], 22*60)
        gpx = await self.manager.async_gpx("one", self.start, self.end, 2)
        self.assertEqual(len(ET.fromstring(gpx["content"]).findall(".//{*}trkpt")), 12)
        full = await self.manager.async_gpx("one", self.start, self.end)
        self.assertEqual(len(ET.fromstring(full["content"]).findall(".//{*}trkpt")), 14)

    async def test_gaps_multi_vehicle_empty_ranges_and_gpx_metadata(self):
        self.manager._entries["two"] = NS(entry_id="two", title="Second", data={})
        points = [self.point(1, altitude=10, soc=50, speed=20, odometer=123), self.point(2, 54.001),
                  self.point(30, 54.002), self.point(31, 54.003)]
        self.store(points)
        self.store([self.point(5), self.point(6, 54.001)], "two")
        result = await self.query(["one", "two", "missing"])
        self.assertEqual([v["trip_count"] for v in result["vehicles"]], [2, 1])
        gpx = ET.fromstring((await self.manager.async_gpx("one", self.start, self.end))["content"])
        self.assertEqual(len(gpx.findall(".//{*}trkseg")), 2)
        self.assertEqual(gpx.find(".//{*}ele").text, "10.0")
        self.assertEqual(gpx.find(".//{*}soc").text, "50.00")
        self.assertTrue(gpx.find(".//{*}time").text.endswith("Z"))
        empty = await self.manager.async_query(["one"], NOW, NOW+timedelta(days=1), 500)
        self.assertEqual(empty["vehicles"][0]["point_count"], 0)

    async def test_map_simplification_preserves_database_and_gpx(self):
        points = [self.point(i/6, 54+i*.0001) for i in range(1600)]
        self.store(points)
        vehicle = (await self.query(max_points=500))["vehicles"][0]
        self.assertEqual(vehicle["point_count"], 1600)
        self.assertLessEqual(vehicle["rendered_point_count"], 500)
        self.assertEqual(vehicle["segments"][0][0]["ts"], points[0].as_dict()["ts"])
        self.assertEqual(vehicle["segments"][0][-1]["ts"], points[-1].as_dict()["ts"])
        gpx = await self.manager.async_gpx("one", self.start, self.end)
        self.assertEqual(len(ET.fromstring(gpx["content"]).findall(".//{*}trkpt")), 1600)
        with patch.object(tracking, "MAX_GPX_POINTS", 100):
            with self.assertRaisesRegex(ValueError, "Too many"):
                await self.manager.async_gpx("one", self.start, self.end)

    def recorder_data(self):
        return {"sensor.lat": [state(54+i*.001, self.start+timedelta(minutes=60+i)) for i in range(3)],
                "sensor.lon": [state(9+i*.001, self.start+timedelta(minutes=60+i, seconds=1)) for i in range(3)],
                "sensor.soc": [state(60, self.start+timedelta(minutes=59)), state(59, self.start+timedelta(minutes=61))],
                "sensor.odo": [state(1000, self.start+timedelta(minutes=59))]}

    async def test_recorder_import_commit_readback_repeat_and_reload(self):
        self.manager._fetch_recorder_history = lambda *args: self.recorder_data()
        first = await self.manager.async_import_recorder("one", self.start, self.end)
        self.assertEqual((first["inserted"], first["already_stored"], first["filtered"]), (3, 0, 0))
        self.assertEqual(first["stored"]["imported_point_count"], 3)
        second = await self.manager.async_import_recorder("one", self.start, self.end)
        self.assertEqual((second["inserted"], second["already_stored"]), (0, 3))
        reloaded = tracking.TrackingManager(self.hass)
        self.assertEqual(reloaded._status_db(["one"])["one"]["point_count"], 3)
        points = reloaded._points_db("one", self.start.timestamp(), self.end.timestamp())
        self.assertEqual([p.soc for p in points], [60, 59, 59])
        self.assertTrue(all(p.odometer == 1000 and p.source == "recorder_import" for p in points))

    async def test_import_preserves_live_source_and_live_point_before_range(self):
        self.store([self.point(-1, 53.99), self.point(60+1/60, 54, 9)])
        self.manager._fetch_recorder_history = lambda *args: self.recorder_data()
        report = await self.manager.async_import_recorder("one", self.start, self.end)
        self.assertEqual((report["inserted"], report["already_stored"]), (2, 1))
        self.assertEqual(report["stored"]["point_count"], 3)
        self.assertEqual(report["stored"]["live_point_count"], 1)
        self.assertEqual(self.manager._status_db(["one"])["one"]["point_count"], 4)

    async def test_import_no_history_and_database_error(self):
        report = await self.manager.async_import_recorder("one", self.start, self.end)
        self.assertEqual(report["candidates"], 0)
        self.assertEqual(report["stored"]["point_count"], 0)
        self.manager._fetch_recorder_history = lambda *args: self.recorder_data()
        with patch.object(self.manager, "_insert_many_db", side_effect=sqlite3.OperationalError("read only")):
            with self.assertRaises(sqlite3.OperationalError):
                await self.manager.async_import_recorder("one", self.start, self.end)
        self.assertEqual(self.manager._status_db(["one"])["one"]["point_count"], 0)

    async def test_retention_choices_and_delete_are_scoped(self):
        for days in [30, 90, 180, 365, 0]:
            with self.subTest(days=days):
                self.manager._delete_db(["one"], None, None)
                old = tracking.Point((NOW-timedelta(days=400)).timestamp(), 54, 9)
                self.store([old, self.point(60)])
                await self.manager.async_set_settings("one", False, days)
                self.assertEqual(self.manager._status_db(["one"])["one"]["point_count"], 2 if days == 0 else 1)
        self.store([self.point(60)], "two")
        await self.manager.async_delete(["one"], self.start, self.end)
        self.assertEqual(self.manager._status_db(["one", "two"])["two"]["point_count"], 1)
        with self.assertRaises(ValueError):
            await self.manager.async_set_settings("one", True, 7)

    async def test_recording_failure_is_logged_and_unload_removes_listener(self):
        self.set_position()
        self.manager._settings["one"] = {"enabled": True, "retention_days": 0}
        with patch.object(self.manager, "_insert_point_db", side_effect=sqlite3.OperationalError("disk error")):
            with self.assertLogs(tracking._LOGGER, level="ERROR") as captured:
                await self.manager._delayed_sample("one", 0)
        self.assertIn("Could not record", captured.output[0])
        await self.manager.async_unregister_entry("one")
        self.assertFalse(self.hass.listeners)


class SocRegressionTests(unittest.IsolatedAsyncioTestCase):
    async def test_known_spike_patterns_charging_and_normal_driving(self):
        cases = [([52,100,45], [52,45], 1), ([67,100,54], [67,54], 1),
                 ([67,100,54,100,52], [67,54,52], 2), ([52,10,51], [52,51], 1),
                 ([52,60,75,90,100], [52,60,75,90,100], 0), ([70,69,65], [70,69,65], 0)]
        for values, expected, count in cases:
            with self.subTest(values=values):
                samples = [soc.SocSample(NOW+timedelta(minutes=i), value, 100+i*.1) for i,value in enumerate(values)]
                cleaned, spikes = soc.filter_historical_soc(samples)
                self.assertEqual([s.soc for s in cleaned], expected)
                self.assertEqual(len(spikes), count)

    async def test_soc_repair_first_apply_and_repeat_are_idempotent(self):
        day = date(2026, 9, 17)
        key = day.isoformat()
        runtime = NS(data={"total_kwh": 68.25, "daily_history": {key: {"kwh": 20, "km": 100}},
                           "periods": {"month": {"id": "2026-09", "kwh": 68.25}}},
                     entry=NS(entry_id="one"), store=NS(async_save=AsyncMock()),
                     _recalculate_custom_period=lambda: None, reset_soc_guard=lambda: None)
        hass = NS(config=NS(time_zone="UTC"))
        def rows():
            return repair._selected_rows(runtime, day, day, {key: 20}, {key: 9.71}, {key: [{}]})
        first = await repair._apply(hass, runtime, {"rows": rows()})
        self.assertTrue(first["applied"])
        self.assertAlmostEqual(first["reduction_kwh"], 10.29)
        snapshot = deepcopy(runtime.data)
        second = await repair._apply(hass, runtime, {"rows": rows()})
        self.assertFalse(second["applied"])
        self.assertEqual(runtime.data, snapshot)
        runtime.store.async_save.assert_awaited_once()


if __name__ == "__main__":
    unittest.main(verbosity=2)
