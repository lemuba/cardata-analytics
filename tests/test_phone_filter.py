"""Shape preserving GPS filtering with real session persistence and SQLite writes."""
import asyncio
from datetime import timedelta
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from test_tracking import Hass, NOW, NS, state, tracking


class PhoneFilterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.hass = Hass(self.temp.name)
        self.hass.services = NS(has_service=lambda domain, name: domain == 'notify' and name == 'mobile_app_iphone',
                                async_call=AsyncMock())
        self.manager = tracking.TrackingManager(self.hass)
        await self.manager.async_setup()
        self.entry = NS(entry_id='i3', title='BMW i3', data={})
        await self.manager.async_register_entry(self.entry)
        self.hass.states['sensor.phone'] = state('phone', NOW, latitude=54, longitude=9, gps_accuracy=5)
        self.hass.states['sensor.ssid'] = state('Not Connected', NOW)
        self.source_id = (await self.manager.async_source_action('save',
            {'name': 'iPhone', 'entity_id': 'sensor.phone', 'vehicles': ['i3']}))['source_id']

    async def asyncTearDown(self):
        for entry_id in list(self.manager._entries):
            await self.manager.async_unregister_entry(entry_id)
        await asyncio.sleep(0)
        self.temp.cleanup()

    async def start(self, mode='balanced', interval=10):
        await self.manager.async_source_action('auto_save', {
            'entry_id': 'i3', 'source_id': self.source_id, 'ssid_entity': 'sensor.ssid',
            'ssid': 'BMWi39000 CarPlay', 'notify_service': 'notify.mobile_app_iphone',
            'location_interval': interval, 'point_filter': mode,
        })
        await asyncio.sleep(0)
        await self.manager.async_source_action('start',
            {'entry_id': 'i3', 'source_id': self.source_id, 'mode': 'auto'})
        return await self.record(0, 54, 9)

    async def record(self, seconds, lat, lon, accuracy=5):
        when = NOW + timedelta(seconds=seconds)
        self.hass.states['sensor.phone'] = state('phone', when, latitude=lat, longitude=lon,
                                                 gps_accuracy=accuracy)
        with patch.object(tracking.dt_util, 'utcnow', return_value=when):
            return await self.manager.async_record_current('i3')

    def points(self):
        return self.manager._points_db('i3', NOW.timestamp() - 1, NOW.timestamp() + 5000)

    async def test_standstill_and_straight_route_are_sparse_but_end_is_saved(self):
        self.assertTrue(await self.start())
        for index in range(1, 61):
            # Alternating 5-metre fixes simulate a phone in a traffic jam.
            await self.record(index * 10, 54 + (0.00004 if index % 2 else -0.00004), 9)
        self.assertEqual(len(self.points()), 1)
        for index in range(1, 101):
            await self.record(600 + index * 10, 54 + index * 0.00009, 9)
        self.assertLess(len(self.points()), 30)
        self.assertIsNotNone(self.manager._sessions['i3'].get('pending_point'))
        await self.manager.async_source_action('stop', {'entry_id': 'i3'})
        self.assertLess(len(self.points()), 31)
        self.assertAlmostEqual(self.points()[-1].lat, 54.009, places=5)
        self.assertNotIn('pending_point', self.manager._sessions['i3'])

    async def test_corner_and_last_fix_are_kept_with_original_timestamps(self):
        await self.start()
        self.assertFalse(await self.record(10, 54.0009, 9))
        self.assertFalse(await self.record(20, 54.0009, 9.0015))
        self.assertEqual([round(p.lat, 4) for p in self.points()], [54, 54.0009])
        await self.manager.async_source_action('stop', {'entry_id': 'i3'})
        self.assertEqual(len(self.points()), 3)
        self.assertAlmostEqual(self.points()[-1].lon, 9.0015, places=5)
        self.assertEqual(self.points()[-1].ts, (NOW + timedelta(seconds=20)).timestamp())

    async def test_pending_endpoint_survives_manager_reload(self):
        await self.start()
        await self.record(10, 54.001, 9)
        self.assertEqual(len(self.points()), 1)
        reloaded = tracking.TrackingManager(self.hass)
        await reloaded.async_setup()
        await reloaded.async_register_entry(self.entry)
        try:
            self.assertIsNotNone(reloaded._sessions['i3'].get('pending_point'))
            await reloaded.async_source_action('stop', {'entry_id': 'i3'})
            self.assertEqual(len(self.points()), 2)
            self.assertAlmostEqual(self.points()[-1].lat, 54.001)
        finally:
            await reloaded.async_unregister_entry('i3')
            self.manager._sessions['i3'].pop('pending_point', None)

    async def test_long_gap_commits_old_endpoint_without_joining_separate_trips(self):
        await self.start()
        await self.record(10, 54.001, 9)
        self.assertTrue(await self.record(1000, 55, 9))
        self.assertEqual(len(self.points()), 3)
        self.assertEqual([len(segment) for segment in self.manager._split_segments(self.points())], [2, 1])

    async def test_disabled_filter_retains_prior_behavior_and_poll_interval(self):
        self.assertTrue(await self.start('off', 20))
        self.assertTrue(await self.record(20, 54.0009, 9))
        self.assertEqual(len(self.points()), 2)
        self.assertEqual(self.manager._auto_rules['i3']['location_interval'], 20)
        self.assertEqual(self.manager._auto_rules['i3']['point_filter'], 'off')

    async def test_full_delete_clears_buffer_instead_of_restoring_deleted_point(self):
        await self.start()
        await self.record(10, 54.001, 9)
        self.assertEqual(await self.manager.async_delete(['i3'], None, None), 1)
        await self.manager.async_source_action('stop', {'entry_id': 'i3'})
        self.assertEqual(self.points(), [])

    async def test_invalid_filter_is_rejected_without_changing_rule(self):
        await self.start()
        current = dict(self.manager._auto_rules['i3'])
        with self.assertRaisesRegex(ValueError, 'GPS point filter'):
            await self.manager.async_source_action('auto_save', {
                'entry_id': 'i3', 'source_id': self.source_id, 'ssid_entity': 'sensor.ssid',
                'ssid': 'BMWi39000 CarPlay', 'location_interval': 10,
                'notify_service': 'notify.mobile_app_iphone', 'point_filter': 'bad',
            })
        self.assertEqual(self.manager._auto_rules['i3'], current)
