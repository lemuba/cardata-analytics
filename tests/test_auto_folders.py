"""CarPlay transitions, persistent folder identities and scoped deletion."""
import asyncio
from datetime import timedelta
import tempfile
import unittest
from unittest.mock import AsyncMock, patch
from test_tracking import Hass, NOW, NS, state, tracking


class AutoFoldersTests(unittest.IsolatedAsyncioTestCase):
    async def test_folder_reparent_sibling_order_and_restart(self):
        action = self.manager._folder_action_db
        a = action('save', {'name':'A'})['folder_id']
        b = action('save', {'name':'B'})['folder_id']
        child = action('save', {'name':'child','parent_id':a})['folder_id']
        grandchild = action('save', {'name':'grandchild','parent_id':child})['folder_id']
        sibling = action('save', {'name':'sibling','parent_id':b})['folder_id']
        self.assertEqual([f['id'] for f in self.manager._folder_db()], [a,child,grandchild,b,sibling])
        action('save', {'folder_id':child,'name':'child','parent_id':b})
        self.assertEqual([f['id'] for f in self.manager._folder_db()], [a,b,sibling,child,grandchild])
        action('reorder', {'folder_id':child,'direction':'up'})
        self.assertEqual([f['id'] for f in self.manager._folder_db()], [a,b,child,grandchild,sibling])
        with self.assertRaises(ValueError):
            action('save', {'folder_id':b,'name':'B','parent_id':grandchild})
        with self.assertRaises(ValueError):
            action('reorder', {'folder_id':child,'direction':'sideways'})
        other = tracking.TrackingManager(self.hass)
        await other.async_setup()
        self.assertEqual(other._folder_db(), self.manager._folder_db())

    async def test_existing_folder_database_gets_position_without_losing_memberships(self):
        first = self.insert_trips()
        trip = (await self.manager.async_query(['i3'],first-timedelta(seconds=1),NOW,500))['vehicles'][0]['trips'][0]
        with self.manager._connect() as con:
            con.execute('DROP TABLE trip_folders')
            con.execute('CREATE TABLE trip_folders (id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT REFERENCES trip_folders(id))')
            con.execute("INSERT INTO trip_folders VALUES ('z','Z',NULL),('a','A',NULL)")
            con.execute("INSERT INTO trip_membership VALUES ('z',?)",(trip['id'],))
        self.manager._init_trip_folders_db()
        self.assertEqual([f['id'] for f in self.manager._folder_db()],['a','z'])
        self.assertEqual((await self.manager.async_query(['i3'],first-timedelta(seconds=1),NOW,500))['vehicles'][0]['trips'][0]['folders'],['z'])

    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.hass = Hass(self.temp.name)
        self.manager = tracking.TrackingManager(self.hass)
        await self.manager.async_setup()
        for entry_id in ('i3','twingo'):
            await self.manager.async_register_entry(NS(entry_id=entry_id,title=entry_id,data={}))
        self.hass.states['sensor.phone'] = state('address',NOW,latitude=54,longitude=9,gps_accuracy=5)
        self.hass.states['sensor.iphone_ssid'] = state('Not Connected',NOW)
        self.source = (await self.manager.async_source_action('save',{'name':'iPhone','entity_id':'sensor.phone','vehicles':['i3','twingo']}))['source_id']

    async def asyncTearDown(self):
        for entry_id in list(self.manager._entries):
            await self.manager.async_unregister_entry(entry_id)
        await asyncio.sleep(0)
        self.temp.cleanup()

    async def rule(self):
        await self.manager.async_source_action('auto_save',{'entry_id':'i3','source_id':self.source,'ssid_entity':'sensor.iphone_ssid','ssid':'BMWi39000 CarPlay'})
        await asyncio.sleep(0)

    async def test_carplay_connect_flicker_reconnect_manual_stop(self):
        await self.rule()
        self.hass.states['sensor.iphone_ssid'] = state('BMWi39000 CarPlay', NOW)
        await self.hass.dispatch(); await asyncio.sleep(0.03)
        session = self.manager._sessions['i3']
        self.assertEqual(session['mode'],'auto')
        self.assertTrue(await self.manager.async_record_current('i3'))
        self.hass.states['sensor.iphone_ssid'] = state('Not Connected', NOW)
        await self.hass.dispatch(); await asyncio.sleep(0.03)
        self.assertTrue(session['suspended'])
        self.hass.states['sensor.phone'] = state('walking',NOW+timedelta(seconds=20),latitude=54.001,longitude=9)
        self.assertFalse(await self.manager.async_record_current('i3'))
        self.hass.states['sensor.iphone_ssid'] = state('BMWi39000 CarPlay', NOW)
        await self.hass.dispatch(); await asyncio.sleep(0.03)
        self.assertFalse(session['suspended'])
        self.assertEqual(self.manager._sessions['i3']['token'],session['token'])
        await self.manager.async_source_action('stop',{'entry_id':'i3'})
        self.assertTrue(self.manager._auto_rules['i3']['blocked'])
        await self.hass.dispatch(); await asyncio.sleep(0.03)
        self.assertFalse(self.manager._sessions['i3']['active'])
        self.hass.states['sensor.iphone_ssid'] = state('Not Connected',NOW)
        await self.hass.dispatch(); await asyncio.sleep(0.03)
        self.assertFalse(self.manager._auto_rules['i3']['blocked'])
        self.hass.states['sensor.iphone_ssid'] = state('BMWi39000 CarPlay',NOW)
        await self.hass.dispatch(); await asyncio.sleep(0.03)
        self.assertTrue(self.manager._sessions['i3']['active'])
        self.assertNotEqual(self.manager._sessions['i3']['token'],session['token'])

    async def test_expired_disconnect_stops_and_persists(self):
        await self.rule()
        self.hass.states['sensor.iphone_ssid'] = state('BMWi39000 CarPlay',NOW)
        await self.hass.dispatch(); await asyncio.sleep(0.03)
        token=self.manager._sessions['i3']['token']
        self.hass.states['sensor.iphone_ssid'] = state('Not Connected',NOW)
        # Verify timeout transition without waiting 90 actual seconds.
        with patch('cardata_under_test.gps_sources.asyncio.sleep', return_value=None):
            await self.manager._auto_disconnect('i3',token)
        self.assertFalse(self.manager._sessions['i3']['active'])
        other=tracking.TrackingManager(self.hass)
        await other.async_setup()
        self.assertEqual(other._auto_rules['i3']['ssid'],'BMWi39000 CarPlay')
        self.assertFalse(other._sessions['i3']['active'])

    async def test_save_auto_rule_validation(self):
        await self.rule()
        for data in [dict(entry_id='twingo',source_id=self.source,ssid_entity='sensor.iphone_ssid',ssid='BMWi39000 CarPlay'),dict(entry_id='i3',source_id=self.source,ssid_entity='sensor.unknown',ssid='CarPlay')]:
            with self.assertRaises(ValueError):await self.manager.async_source_action('auto_save',data)

    async def test_opt_in_location_requests_only_while_connected_and_one_final_fix(self):
        calls = []
        async def notify(domain, name, payload, blocking=False):
            calls.append((domain, name, payload, blocking))
        self.hass.services = NS(has_service=lambda domain, name: domain == 'notify' and name == 'mobile_app_iphone', async_call=notify)
        rule = {'entry_id':'i3','source_id':self.source,'ssid_entity':'sensor.iphone_ssid',
                'ssid':'BMWi39000 CarPlay','notify_service':'notify.mobile_app_iphone','location_interval':10}
        await self.manager.async_source_action('auto_save', rule)
        self.hass.states['sensor.iphone_ssid'] = state('BMWi39000 CarPlay',NOW)
        await self.hass.dispatch()
        await asyncio.sleep(.03)
        self.assertEqual(calls,[('notify','mobile_app_iphone',{'message':'request_location_update'},False)])
        self.assertEqual(self.manager._auto_rules['i3']['location_interval'],10)
        self.assertTrue(await self.manager.async_record_current('i3'))
        self.hass.states['sensor.iphone_ssid'] = state('Not Connected',NOW)
        await self.hass.dispatch()
        await asyncio.sleep(2.05)
        self.assertNotIn('i3', self.manager._location_poll_tasks)
        self.assertEqual(len(calls),2)
        self.hass.states['sensor.phone'] = state('home',NOW+timedelta(seconds=5),latitude=54.001,longitude=9,gps_accuracy=5)
        self.assertFalse(await self.manager.async_record_current('i3'))
        self.assertIsNotNone(self.manager._sessions['i3'].get('pending_point'))
        self.assertNotIn('final_until', self.manager._sessions['i3'])
        self.assertFalse(await self.manager.async_record_current('i3'))
        self.hass.states['sensor.phone'] = state('walking',NOW+timedelta(seconds=6),latitude=54.002,longitude=9,gps_accuracy=5)
        self.assertFalse(await self.manager.async_record_current('i3'))
        self.assertEqual(self.manager._status_db(['i3'])['i3']['point_count'],1)
        await self.manager.async_source_action('stop',{'entry_id':'i3'})
        self.assertEqual(self.manager._status_db(['i3'])['i3']['point_count'],2)
        self.assertNotIn('i3', self.manager._final_fix_tasks)

    async def test_location_request_validation_and_old_rules_default_off(self):
        await self.rule()
        self.assertEqual(self.manager._auto_rules['i3']['location_interval'],0)
        data = {'entry_id':'i3','source_id':self.source,'ssid_entity':'sensor.iphone_ssid',
                'ssid':'BMWi39000 CarPlay','notify_service':'notify.mobile_app_iphone','location_interval':10}
        self.hass.services = NS(has_service=lambda domain,name: False, async_call=AsyncMock())
        with self.assertRaises(ValueError):
            await self.manager.async_source_action('auto_save',data)
        data['location_interval']=9
        with self.assertRaises(ValueError):
            await self.manager.async_source_action('auto_save',data)

    async def test_removing_automatic_rule_stops_recording_and_preserves_manual_source(self):
        await self.rule()
        self.hass.states['sensor.iphone_ssid']=state('BMWi39000 CarPlay',NOW)
        await self.hass.dispatch();await asyncio.sleep(.03)
        self.assertTrue(self.manager._sessions['i3']['active'])
        await self.manager.async_source_action('auto_delete',{'entry_id':'i3'})
        self.assertFalse(self.manager._sessions['i3']['active'])
        self.assertNotIn('i3',self.manager._auto_unsubs)
        self.assertIn(self.source,self.manager._sources)
        self.assertFalse(await self.manager.async_record_current('i3'))

    def insert_trips(self):
        first=NOW-timedelta(hours=2)
        for minute in (0,2,30,32):
            self.manager._insert_point_db('i3','i3',tracking.Point((first+timedelta(minutes=minute)).timestamp(),54+minute/10000,9))
        self.manager._insert_point_db('twingo','twingo',tracking.Point(first.timestamp(),52,8))
        return first

    async def test_persistent_identity_folders_and_scoped_delete(self):
        first=self.insert_trips()
        query=await self.manager.async_query(['i3'],first-timedelta(seconds=1),NOW,500)
        trips=query['vehicles'][0]['trips']
        self.assertEqual(len(trips),2)
        parent=self.manager._folder_action_db('save',{'name':'Urlaub 2026'})['folder_id']
        child=self.manager._folder_action_db('save',{'name':'Anreise','parent_id':parent})['folder_id']
        self.manager._folder_action_db('assign',{'folder_id':child,'trip_id':trips[0]['id']})
        query=await self.manager.async_query(['i3'],first-timedelta(seconds=1),NOW,500)
        self.assertEqual(query['vehicles'][0]['trips'][0]['folders'],[child])
        self.assertEqual(query['vehicles'][0]['trips'][0]['id'],trips[0]['id'])
        # Earlier Recorder points extend the trip without changing the saved identity.
        self.manager._insert_point_db('i3','i3',tracking.Point((first-timedelta(minutes=1)).timestamp(),53.9999,9,source='recorder_import'))
        extended=await self.manager.async_query(['i3'],first-timedelta(minutes=2),NOW,500)
        self.assertEqual(extended['vehicles'][0]['trips'][0]['id'],trips[0]['id'])
        self.assertEqual(extended['vehicles'][0]['trips'][0]['folders'],[child])
        with self.assertRaises(ValueError):self.manager._delete_trip_db('i3',trips[0]['id'],first.timestamp(),(first+timedelta(minutes=2)).timestamp())
        kept=extended['vehicles'][0]['trips'][1]
        deleted=self.manager._delete_trip_db('i3',kept['id'],tracking._parse_ts(kept['start']).timestamp(),tracking._parse_ts(kept['end']).timestamp())
        self.assertEqual(deleted,2)
        self.assertEqual(self.manager._status_db(['i3'])['i3']['point_count'],3)
        self.assertEqual(self.manager._status_db(['twingo'])['twingo']['point_count'],1)
        self.assertEqual(len(self.manager._folder_db()),2)
        restarted=tracking.TrackingManager(self.hass);await restarted.async_setup()
        self.assertEqual(len(restarted._folder_db()),2)
        with self.assertRaises(ValueError):self.manager._folder_action_db('delete',{'folder_id':parent})
        with self.assertRaises(ValueError):self.manager._folder_action_db('save',{'folder_id':parent,'name':'Loop','parent_id':child})
        self.manager._folder_action_db('delete',{'folder_id':child})
        self.assertEqual(self.manager._status_db(['i3'])['i3']['point_count'],3)

    async def test_merge_keeps_segments_and_survives_restart_and_unmerge(self):
        first = self.insert_trips()
        start, end = first - timedelta(seconds=1), NOW
        before = await self.manager.async_query(['i3'], start, end, 500)
        trips = before['vehicles'][0]['trips']
        self.assertEqual(len(trips), 2)
        selected = [{'entry_id':'i3','trip_id':t['id'], 'start_ts':tracking._parse_ts(t['start']).timestamp(),
                     'end_ts':tracking._parse_ts(t['end']).timestamp()} for t in trips]
        merged = self.manager._batch_trip_action_db('merge', selected)
        group_id = merged['group_id']
        grouped = (await self.manager.async_query(['i3'],start,end,500))['vehicles'][0]
        self.assertEqual(grouped['trip_count'], 1)
        self.assertEqual(len(grouped['segments']),2)
        self.assertEqual(grouped['trips'][0]['id'],group_id)
        self.assertEqual(grouped['trips'][0]['point_count'],4)
        self.assertEqual([t['id'] for t in grouped['trips'][0]['member_trips']], [t['id'] for t in trips])
        self.assertEqual(grouped['trips'][0]['indices'],[0,1])
        self.assertEqual(grouped['trips'][0]['duration_seconds'],240)
        self.assertEqual(grouped['trips'][0]['distance_km'],round(sum(t['distance_km'] for t in trips),3))
        partial=(await self.manager.async_query(['i3'],start,tracking._parse_ts(trips[0]['end']),500))['vehicles'][0]
        self.assertEqual(partial['trips'][0]['id'],trips[0]['id'])
        members = [{'id':t['id'],'start_ts':tracking._parse_ts(t['start']).timestamp(),
                    'end_ts':tracking._parse_ts(t['end']).timestamp()} for t in trips]
        gpx = await self.manager.async_gpx('i3',tracking._parse_ts(trips[0]['start']),tracking._parse_ts(trips[-1]['end']),
                                           group_id=group_id,members=members)
        self.assertEqual(gpx['content'].count('<trkseg>'),2)
        self.assertEqual(gpx['content'].count('<trkpt '),4)
        counters=[{'energy_kwh':2.0,'analytics_distance_km':10.0,'energy_status':'available','distance_status':'available'},
                  {'energy_kwh':3.0,'analytics_distance_km':15.0,'energy_status':'available','distance_status':'available'}]
        with patch('cardata_under_test.tracking.async_trip_analytics',new=AsyncMock(side_effect=counters)):
            detail=await self.manager.async_trip_details('i3',tracking._parse_ts(trips[0]['start']),
                tracking._parse_ts(trips[-1]['end']),group_id,members)
        self.assertEqual((detail['energy_kwh'],detail['analytics_distance_km'],detail['average_kwh_100km']),(5.0,25.0,20.0))
        bad=[dict(counters[0]),{**counters[1],'energy_kwh':None,'energy_status':'history_gap'}]
        with patch('cardata_under_test.tracking.async_trip_analytics',new=AsyncMock(side_effect=bad)):
            detail=await self.manager.async_trip_details('i3',tracking._parse_ts(trips[0]['start']),
                tracking._parse_ts(trips[-1]['end']),group_id,members)
        self.assertEqual(detail['energy_status'],'history_gap')
        self.assertIsNone(detail['average_kwh_100km'])
        other=tracking.TrackingManager(self.hass)
        await other.async_setup()
        await other.async_register_entry(self.manager._entries['i3'])
        try:
            self.assertEqual((await other.async_query(['i3'],start,end,500))['vehicles'][0]['trips'][0]['id'],group_id)
        finally:
            await other.async_unregister_entry('i3')
        self.manager._unmerge_trip_db('i3',group_id)
        self.assertEqual(len((await self.manager.async_query(['i3'],start,end,500))['vehicles'][0]['trips']),2)
        self.assertEqual(self.manager._status_db(['i3'])['i3']['point_count'],4)

    async def test_merge_rejects_partial_group_and_deletes_only_its_members(self):
        first=self.insert_trips()
        # A third trip lies between the two selected trips in time; it must never be deleted by the group.
        for minute in (14,16):
            self.manager._insert_point_db('i3','i3',tracking.Point((first+timedelta(minutes=minute)).timestamp(),55+minute/10000,9))
        start,end=first-timedelta(seconds=1),NOW
        trips=(await self.manager.async_query(['i3'],start,end,500))['vehicles'][0]['trips']
        self.assertEqual(len(trips),3)
        selected=[{'entry_id':'i3','trip_id':t['id'],'start_ts':tracking._parse_ts(t['start']).timestamp(),
                   'end_ts':tracking._parse_ts(t['end']).timestamp()} for t in (trips[0],trips[2])]
        group_id=self.manager._batch_trip_action_db('merge',selected)['group_id']
        grouped=(await self.manager.async_query(['i3'],start,end,500))['vehicles'][0]
        self.assertEqual(len(grouped['trips']),2)
        self.assertEqual(grouped['trips'][0]['id'],group_id)
        self.assertEqual(grouped['trips'][0]['indices'],[0,2])
        group_members=[{'id':t['trip_id'],'start_ts':t['start_ts'],'end_ts':t['end_ts']} for t in selected]
        gpx=await self.manager.async_gpx('i3',tracking._parse_ts(trips[0]['start']),
            tracking._parse_ts(trips[2]['end']),group_id=group_id,members=group_members)
        self.assertEqual(gpx['content'].count('<trkseg>'),2)
        self.assertEqual(gpx['content'].count('<trkpt '),4)
        with self.assertRaises(ValueError):
            self.manager._batch_trip_action_db('merge',[selected[0],{'entry_id':'i3','trip_id':trips[1]['id'],
                'start_ts':tracking._parse_ts(trips[1]['start']).timestamp(),
                'end_ts':tracking._parse_ts(trips[1]['end']).timestamp()}])
        folder=self.manager._folder_action_db('save',{'name':'Day trip'})['folder_id']
        self.manager._batch_trip_action_db('move',selected,folder)
        self.assertEqual(len([t for t in (await self.manager.async_query(['i3'],start,end,500))['vehicles'][0]['trips'] if folder in t['folders']]),1)
        deleted=self.manager._batch_trip_action_db('delete',selected)
        self.assertEqual(deleted['deleted'],4)
        remaining=(await self.manager.async_query(['i3'],start,end,500))['vehicles'][0]
        self.assertEqual(remaining['trip_count'],1)
        self.assertEqual(remaining['trips'][0]['id'],trips[1]['id'])
        self.assertEqual(self.manager._status_db(['i3'])['i3']['point_count'],2)

    async def test_extend_group_requires_all_existing_members(self):
        first=self.insert_trips()
        for minute in (60,62):
            self.manager._insert_point_db('i3','i3',tracking.Point((first+timedelta(minutes=minute)).timestamp(),54+minute/10000,9))
        start,end=first-timedelta(seconds=1),NOW
        trips=(await self.manager.async_query(['i3'],start,end,500))['vehicles'][0]['trips']
        selected=[{'entry_id':'i3','trip_id':t['id'],'start_ts':tracking._parse_ts(t['start']).timestamp(),
                   'end_ts':tracking._parse_ts(t['end']).timestamp()} for t in trips]
        first_group=self.manager._batch_trip_action_db('merge',selected[:2])['group_id']
        with self.assertRaises(ValueError):
            self.manager._batch_trip_action_db('merge',selected[1:])
        self.assertEqual(self.manager._batch_trip_action_db('merge',selected)['group_id'],first_group)
        result=(await self.manager.async_query(['i3'],start,end,500))['vehicles'][0]
        self.assertEqual(result['trip_count'],1)
        self.assertEqual(result['trips'][0]['indices'],[0,1,2])
        self.assertEqual(result['trips'][0]['point_count'],6)

    async def test_batch_validation_is_atomic_and_move_is_atomic(self):
        first=self.insert_trips()
        trips=(await self.manager.async_query(['i3'],first-timedelta(seconds=1),NOW,500))['vehicles'][0]['trips']
        folder=self.manager._folder_action_db('save',{'name':'Urlaub'})['folder_id']
        selected=[{'entry_id':'i3','trip_id':t['id'],'start_ts':tracking._parse_ts(t['start']).timestamp(),'end_ts':tracking._parse_ts(t['end']).timestamp()} for t in trips]
        stale=[dict(selected[0]),dict(selected[1])]
        stale[1]['end_ts']+=10
        with self.assertRaises(ValueError):self.manager._batch_trip_action_db('delete',stale)
        with self.assertRaises(ValueError):self.manager._batch_trip_action_db('move',stale,folder)
        self.assertEqual(self.manager._status_db(['i3'])['i3']['point_count'],4)
        with self.manager._connect() as con:
            self.assertEqual(con.execute('SELECT count(*) FROM trip_membership').fetchone()[0],0)
        self.assertEqual(self.manager._batch_trip_action_db('move',selected,folder)['trips'],2)
        queried=(await self.manager.async_query(['i3'],first-timedelta(seconds=1),NOW,500))['vehicles'][0]['trips']
        self.assertTrue(all(t['folders']==[folder] for t in queried))
        self.manager._batch_trip_action_db('move',selected,None)
        with self.manager._connect() as con:
            self.assertEqual(con.execute('SELECT count(*) FROM trip_membership').fetchone()[0],0)
        with self.assertRaises(ValueError):self.manager._batch_trip_action_db('delete',selected*2)
        result=self.manager._batch_trip_action_db('delete',selected)
        self.assertEqual(result,{'trips':2,'deleted':4})
        self.assertEqual(self.manager._status_db(['i3'])['i3']['point_count'],0)
        self.assertEqual(self.manager._status_db(['twingo'])['twingo']['point_count'],1)
        with self.manager._connect() as con:
            self.assertEqual(con.execute('SELECT count(*) FROM trip_identity').fetchone()[0],0)

    async def test_repeated_query_and_delete_range_cleanup(self):
        first=self.insert_trips()
        for _ in range(2):
            trips=(await self.manager.async_query(['i3'],first-timedelta(seconds=1),NOW,500))['vehicles'][0]['trips']
        with self.manager._connect() as con:
            self.assertEqual(con.execute('SELECT count(*) FROM trip_identity').fetchone()[0],2)
        await self.manager.async_delete(['i3'],first,first+timedelta(minutes=3))
        with self.manager._connect() as con:
            self.assertEqual(con.execute('SELECT count(*) FROM trip_identity').fetchone()[0],1)
