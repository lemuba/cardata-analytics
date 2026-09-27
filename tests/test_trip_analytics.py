"""Read-only trip consumption from existing counters, including failure cases."""
from copy import deepcopy
from datetime import timedelta
import importlib
import unittest
from unittest.mock import AsyncMock, patch

import test_tracking as base
from test_tracking import Hass, NOW, NS, state, tracking

analytics = importlib.import_module("cardata_under_test.trip_analytics")


class MeterTests(unittest.TestCase):
    def test_existing_counter_difference_not_soc_or_daily_allocation(self):
        start, end = NOW - timedelta(hours=1), NOW
        states = [state(100, start - timedelta(hours=3)), state(102, start + timedelta(minutes=5)), state(107.25, end)]
        self.assertEqual(analytics._meter_delta(states, start, end), (7.25, "available"))
        self.assertEqual(analytics._meter_delta([state(100, start)], start, end), (0, "available"))

    def test_missing_start_unknown_gap_and_hidden_reset_are_unavailable(self):
        start, end = NOW - timedelta(hours=1), NOW
        for samples, status in [
            ([], "history_missing"), ([state(100, end)], "history_missing"),
            ([state("unavailable", start), state(120, end)], "history_missing"),
            ([state(100, start), state("unknown", start + timedelta(minutes=1)), state(120, end)], "history_gap"),
            ([state(100, start), state(0, start + timedelta(minutes=1)), state(120, end)], "counter_changed"),
        ]:
            with self.subTest(status=status, samples=samples):
                self.assertEqual(analytics._meter_delta(samples, start, end), (None, status))

    def test_units_boundary_and_nonfinite_values(self):
        start, end = NOW - timedelta(hours=1), NOW
        self.assertEqual(analytics._meter_delta([state(1000, start, unit_of_measurement="Wh"), state(2, end, unit_of_measurement="kWh")], start, end), (1, "available"))
        self.assertEqual(analytics._meter_delta([state(10, start, unit_of_measurement="mi"), state(11, end, unit_of_measurement="mi")], start, end, "distance"), (1.6093, "available"))
        self.assertEqual(analytics._meter_delta([state(10, start), state(20, end + timedelta(seconds=1))], start, end), (0, "available"))
        for value in ["nan", "inf", "-1"]:
            self.assertEqual(analytics._meter_delta([state(10, start), state(value, end)], start, end), (None, "history_gap"))


class TripAnalyticsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.start, self.end = NOW - timedelta(hours=1), NOW
        self.hass = Hass("/unused")
        self.ids = {"one_energy_consumed_total": "sensor.renamed_energy", "one_mileage": "sensor.renamed_odometer"}
        self.hass.registry = NS(async_get_entity_id=lambda domain, platform, key: self.ids.get(key))
        self.entry = NS(entry_id="one", runtime_data=NS(data={"daily_history": {NOW.date().isoformat(): {"kwh": 9999}}}))
        self.history = {
            "sensor.renamed_energy": [state(100, self.start), state(107.25, self.end)],
            "sensor.renamed_odometer": [state(1000, self.start), state(1050, self.end)],
        }

    async def call(self):
        with patch.object(analytics, "_fetch", return_value=self.history):
            return await analytics.async_trip_analytics(self.hass, self.entry, self.start, self.end)

    async def test_renamed_entities_reuse_history_without_writes(self):
        before = deepcopy(self.entry.runtime_data.data)
        result = await self.call()
        self.assertEqual(result["energy_kwh"], 7.25)
        self.assertEqual(result["average_kwh_100km"], 14.5)
        self.assertEqual(result["analytics_distance_km"], 50)
        self.assertEqual(self.entry.runtime_data.data, before)

    async def test_missing_or_reset_distance_does_not_invent_average(self):
        for samples in [[], [state(1050, self.start), state(1000, self.end)], [state(1000, self.start)]]:
            self.history["sensor.renamed_odometer"] = samples
            result = await self.call()
            self.assertEqual(result["energy_kwh"], 7.25)
            self.assertIsNone(result["average_kwh_100km"])

    async def test_current_and_legacy_repairs_never_reapply_daily_corrections(self):
        day = NOW.date().isoformat()
        for data in [{"soc_repair_days": {day: {"applied_excess_kwh": 5}}},
                     {"soc_repair_last_applied": {"changes": [{"date": day, "reduction_kwh": 5}]}}]:
            self.entry.runtime_data.data = deepcopy(data)
            result = await self.call()
            self.assertEqual(result["energy_status"], "repaired_day")
            self.assertIsNone(result["energy_kwh"])
            self.assertEqual(self.entry.runtime_data.data, data)

    async def test_missing_entities_and_recorder_failure(self):
        self.ids.clear()
        self.assertEqual((await self.call())["energy_status"], "history_missing")
        self.ids["one_energy_consumed_total"] = "sensor.renamed_energy"
        with patch.object(analytics, "_fetch", side_effect=RuntimeError("recorder unavailable")):
            with self.assertRaises(RuntimeError):
                await analytics.async_trip_analytics(self.hass, self.entry, self.start, self.end)


class TripEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_details_validate_stored_trip_and_keep_full_resolution_soc(self):
        test = base.TrackingTests()
        await test.asyncSetUp()
        try:
            manager = test.manager
            entry_id = next(iter(manager._entries))
            start = NOW - timedelta(hours=1)
            points = [tracking.Point(start.timestamp() + i * 60, 54 + i * .001, 9, soc=90-i) for i in range(3)]
            manager._insert_many_db(entry_id, "Vehicle", points)
            end = start + timedelta(minutes=2)
            queried = await manager.async_query([entry_id], start, end, 500)
            trip = queried["vehicles"][0]["trips"][0]
            self.assertEqual((trip["start_soc"], trip["end_soc"]), (90, 88))
            with patch.object(tracking, "async_trip_analytics", new=AsyncMock(return_value={"energy_kwh": 1})) as read:
                self.assertEqual(await manager.async_trip_details(entry_id, start, end), {"energy_kwh": 1})
                read.assert_awaited_once()
                with self.assertRaises(ValueError):
                    await manager.async_trip_details(entry_id, start - timedelta(seconds=1), end)
                with self.assertRaises(ValueError):
                    await manager.async_trip_details("unknown", start, end)
        finally:
            await test.asyncTearDown()
