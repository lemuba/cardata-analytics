"""External GPS integration regressions using the production SQLite manager."""
from test_tracking import Hass, NS, NOW, state, tracking
from datetime import timedelta
import asyncio
import tempfile
import unittest


class SourceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.hass = Hass(self.temp.name)
        self.manager = tracking.TrackingManager(self.hass)
        await self.manager.async_setup()
        for entry_id in ['a', 'b']:
            await self.manager.async_register_entry(NS(entry_id=entry_id, title=entry_id, data={'soc_entity': 'sensor.soc', 'mileage_entity': 'sensor.odo'}))
        self.hass.states['sensor.phone'] = state('address', NOW, latitude=54, longitude=9, gps_accuracy=5)
        self.hass.states['sensor.soc'] = state(80, NOW)
        self.hass.states['sensor.odo'] = state(10000, NOW)
        self.source_id = (await self.manager.async_source_action('save', {'name':'Phone', 'entity_id':'sensor.phone', 'vehicles':['a','b']}))['source_id']

    async def asyncTearDown(self):
        for entry_id in list(self.manager._entries):
            await self.manager.async_unregister_entry(entry_id)
        await asyncio.sleep(0)
        self.temp.cleanup()

    async def start(self, vehicle='a'):
        return await self.manager.async_source_action('start', {'source_id':self.source_id,'entry_id':vehicle})

    async def test_reusable_source_exclusive_session_and_stop(self):
        await self.start()
        self.assertTrue(await self.manager.async_record_current('a'))
        self.assertFalse(await self.manager.async_record_current('b'))
        with self.assertRaises(ValueError): await self.start('b')
        with self.assertRaises(ValueError): await self.manager.async_source_action('delete', {'source_id':self.source_id})
        await self.manager.async_source_action('stop', {'entry_id':'a'})
        self.hass.states['sensor.phone'] = state('walking', NOW + timedelta(seconds=5), latitude=54.001, longitude=9)
        self.assertFalse(await self.manager.async_record_current('a'))
        await self.start('b')
        self.assertTrue(await self.manager.async_record_current('b'))
        point = self.manager._last_point_db('a')
        self.assertEqual((point.lat, point.soc, point.odometer), (54,80,10000))
        self.assertTrue(point.source.startswith('external:'))
        status = await self.manager.async_status()
        self.assertEqual(status['vehicles'][0]['live_point_count'],1)
        self.assertFalse(status['vehicles'][0]['session']['active'])

    async def test_stale_missing_inaccurate_and_invalid_wait(self):
        self.hass.states['sensor.phone'] = state('old', NOW-timedelta(minutes=3), latitude=54, longitude=9)
        self.assertTrue((await self.start())['waiting'])
        self.assertFalse(await self.manager.async_record_current('a'))
        for attrs in [{'latitude':float('nan'),'longitude':9}, {'latitude':54,'longitude':9,'gps_accuracy':101}, {'latitude':91,'longitude':9}]:
            self.hass.states['sensor.phone'] = state('bad', NOW, **attrs)
            self.assertFalse(await self.manager.async_record_current('a'))
        self.hass.states['sensor.phone'] = state('ok', NOW, latitude=54, longitude=9)
        self.assertTrue(await self.manager.async_record_current('a'))

    async def test_restart_keeps_session_and_no_duplicate(self):
        await self.start()
        await self.manager.async_record_current('a')
        entry = self.manager._entries['a']
        await self.manager.async_unregister_entry('a')
        other = tracking.TrackingManager(self.hass)
        await other.async_setup()
        await other.async_register_entry(entry)
        try:
            self.assertTrue(other._sessions['a']['active'])
            self.assertFalse(await other.async_record_current('a'))
            self.assertEqual(other._sources[self.source_id]['name'], 'Phone')
            self.assertIn('a', other._source_unsubs)
        finally:
            await other.async_unregister_entry('a')

    async def test_separate_coordinates_and_source_validation(self):
        self.hass.states['sensor.lat'] = state(54,NOW)
        self.hass.states['sensor.lon'] = state(9,NOW)
        result = await self.manager.async_source_action('save', {'name':'Pair','latitude_entity':'sensor.lat','longitude_entity':'sensor.lon','vehicles':['b']})
        source = self.manager._sources[result['source_id']]
        self.assertEqual(self.manager._source_fix(source)['lat'],54)
        self.hass.states['sensor.lon'] = state(9,NOW-timedelta(minutes=3))
        self.assertIsNone(self.manager._source_fix(source))
        with self.assertRaises(ValueError):
            await self.manager.async_source_action('save', {'name':'bad','entity_id':'sensor.absent','vehicles':['a']})
        with self.assertRaises(ValueError):
            await self.manager.async_source_action('start', {'source_id':result['source_id'],'entry_id':'a'})

    async def test_session_boundaries_and_existing_database_unchanged(self):
        p = tracking.Point
        points = [p(1,54,9,source='live'), p(11,54.0001,9,source='external:s:first'), p(21,54.0002,9,source='external:s:first'), p(31,54.0003,9,source='external:s:second'), p(41,54.0004,9,source='external:s:second')]
        self.assertEqual([len(s) for s in self.manager._split_segments(points)],[1,2,2])
        await self.start()
        await self.manager.async_record_current('a')
        await self.manager.async_source_action('stop', {'entry_id':'a'})
        await self.manager.async_source_action('delete', {'source_id':self.source_id})
        self.assertEqual(self.manager._status_db(['a'])['a']['point_count'],1)
        self.assertTrue((await self.manager.async_status())['vehicles'][0]['gps_configured'])

    async def test_listener_dispatch_works_without_open_dashboard(self):
        await self.start()
        await self.hass.dispatch()
        await asyncio.sleep(0.9)
        self.assertEqual(self.manager._status_db(['a'])['a']['point_count'],1)
        await self.manager.async_source_action('stop', {'entry_id':'a'})
        self.assertNotIn('a',self.manager._source_unsubs)

    async def test_native_gps_can_be_explicitly_reenabled(self):
        self.manager._entries['a'].data.update({'latitude_entity':'sensor.lat','longitude_entity':'sensor.lon'})
        self.hass.states['sensor.lat'] = state(54,NOW)
        self.hass.states['sensor.lon'] = state(9,NOW)
        await self.start()
        with self.assertRaises(ValueError): await self.manager.async_set_settings('a',True,365)
        await self.manager.async_source_action('stop',{'entry_id':'a'})
        await self.manager.async_set_settings('a',True,365)
        self.assertNotIn('a', self.manager._sessions)
        self.assertTrue(await self.manager.async_record_current('a'))

    async def test_native_tracking_survives_stopped_phone_session(self):
        self.manager._entries['a'].data.update({'latitude_entity': 'sensor.lat', 'longitude_entity': 'sensor.lon'})
        self.hass.states['sensor.lat'] = state(54, NOW)
        self.hass.states['sensor.lon'] = state(9, NOW)
        await self.manager.async_set_settings('a', True, 0)
        self.assertTrue(await self.manager.async_record_current('a'))
        await self.start()
        status = await self.manager.async_status()
        self.assertTrue(next(v for v in status['vehicles'] if v['entry_id'] == 'a')['enabled'])
        await self.manager.async_source_action('stop', {'entry_id': 'a'})
        status = await self.manager.async_status()
        vehicle = next(v for v in status['vehicles'] if v['entry_id'] == 'a')
        self.assertTrue(vehicle['enabled'])
        self.assertFalse(vehicle['session']['active'])
        self.hass.states['sensor.lat'] = state(54.002, NOW + timedelta(seconds=30))
        self.hass.states['sensor.lon'] = state(9.002, NOW + timedelta(seconds=30))
        self.assertTrue(await self.manager.async_record_current('a'))
        self.assertEqual(self.manager._last_point_db('a').source, 'live')
        self.assertEqual(self.manager._status_db(['a'])['a']['live_point_count'], 2)

    async def test_duplicate_entities_cannot_bypass_phone_exclusivity(self):
        with self.assertRaises(ValueError):
            await self.manager.async_source_action('save', {'name':'Same phone','entity_id':'sensor.phone','vehicles':['b']})
        self.assertEqual(len(self.manager._sources),1)

    async def test_failed_save_rolls_back_and_stop_serializes_with_recording(self):
        from unittest.mock import patch
        with patch.object(self.manager, '_save_sources_db', side_effect=OSError('disk full')):
            with self.assertRaises(OSError): await self.start()
        self.assertEqual(self.manager._sessions,{})
        await self.start()
        await asyncio.gather(self.manager.async_record_current('a'),self.manager.async_source_action('stop',{'entry_id':'a'}))
        self.assertFalse(self.manager._sessions['a']['active'])
        self.assertFalse(await self.manager.async_record_current('a'))
