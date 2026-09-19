/* Offline UI behavior tests using production JS, DOM/MapLibre adapters.
 * Run: node tests/test_frontend.cjs
 * No browser, map tiles or Home Assistant server are required. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.env.CARDATA_TEST_ROOT || path.resolve(__dirname, '..');
const frontend = path.join(root, 'custom_components/cardata_analytics/frontend');
const source = fs.readFileSync(path.join(frontend, fs.readdirSync(frontend).find(n => n.endsWith('.js'))), 'utf8');

class Element {
  constructor(attrs = '', tag = 'div') {
    this.attrs = Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    this.dataset = Object.fromEntries(Object.entries(this.attrs).filter(([k]) => k.startsWith('data-')).map(([k,v]) => [k.slice(5).replace(/-([a-z])/g,(_,s)=>s.toUpperCase()),v]));
    this.id = this.attrs.id || '';
    this.value = this.attrs.value || '';
    this.type = this.attrs.type;
    this.tagName = tag.toUpperCase();
    this.checked = /\bchecked\b/.test(attrs);
    this.events = {};
    this.scrollTop = 0;
    this.style = {};
    this.children = [];
    this.classes = new Set();
    this.classList = {contains:k=>this.classes.has(k),add:k=>this.classes.add(k),remove:k=>this.classes.delete(k)};
  }
  set innerHTML(value) {
    this.html = value;
    this.children = [...value.matchAll(/<(input|select|button|div)\b([^>]*)>/g)].map(m=>new Element(m[2],m[1]));
  }
  get innerHTML() {return this.html || '';}
  querySelectorAll(selector) {
    if (selector.startsWith('#')) return this.children.filter(n=>n.id === selector.slice(1));
    if (selector.startsWith('.')) return this.children.filter(n=>(n.attrs.class || '').split(' ').includes(selector.slice(1)));
    const match = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    return match ? this.children.filter(n=>match[1] in n.attrs && (match[2] === undefined || n.attrs[match[1]] === match[2])) : [];
  }
  querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
  contains(node) {return this.children.includes(node);}
  addEventListener(name, action) {this.events[name] = action;}
  focus() {}
  remove() {}
  click() {return this.events.click?.({target:this});}
}

let now = Date.parse('2026-09-18T17:43:45Z');
class ClockDate extends Date {constructor(...args) {if (args.length) super(...args); else super(now);} static now(){return now;}}
const registry = new Map();
const intervals = new Set();
const storage = new Map();
const document = {hidden:false, body:{appendChild(){}}, createElement:()=>new Element()};
const context = vm.createContext({
  console, Date:ClockDate, Intl, Map, Set, Math, Number, String, Boolean, Array, Object, JSON,
  Blob, URL:{createObjectURL:()=> 'blob:test', revokeObjectURL(){}},
  CSS:{escape:s=>s}, navigator:{language:'de-DE'}, document,
  window:{customCards:[],matchMedia:()=>({matches:false}),confirm:()=>true},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  performance:{now:()=>now}, queueMicrotask:()=>{},
  setInterval:fn=>{const timer={fn};intervals.add(timer);return timer;}, clearInterval:t=>intervals.delete(t),
  setTimeout:()=>0, clearTimeout:()=>{},
  customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},
  HTMLElement:class {constructor(){this.isConnected=true;} attachShadow(){this.shadowRoot={getElementById:()=>null,activeElement:null};}},
});
vm.runInContext(source, context);
const Card = registry.get('cardata-analytics-map-card');

const point = (date, i, base=54) => ({ts:new Date(Date.parse(date)+i*60000).toISOString(),lat:base+i*.001,lon:9+i*.001,soc:60,speed:40});
function fixture() {
  const c = new Card();
  const segments = [[point('2026-09-13T00:00Z',0)], [point('2026-09-14T00:00Z',0)],
    Array.from({length:12},(_,i)=>point('2026-09-14T10:26Z',i,53)),
    Array.from({length:16},(_,i)=>point('2026-09-18T17:00Z',i,54))];
  const trips = [2,3].map((index)=>({index,start:segments[index][0].ts,end:segments[index].at(-1).ts,
    distance_km:index===2?10.2:21.1,point_count:segments[index].length,duration_seconds:900,avg_speed_kmh:40,max_speed_kmh:80}));
  const data = {start:'2026-09-13T00:00:00Z',end:'2026-09-18T18:00:00Z',vehicles:[
    {entry_id:'one',name:'BMW iX1',point_count:30,distance_km:31.3,trip_count:2,duration_seconds:1800,avg_speed_kmh:40,max_speed_kmh:80,trips,segments},
    {entry_id:'two',name:'BMW i3',point_count:2,distance_km:1,trip_count:1,segments:[[point('2026-09-15T10:00Z',0,52),point('2026-09-15T10:00Z',1,52)]],trips:[]}
  ]};
  const status = {vehicles:[{entry_id:'one',name:'BMW iX1',gps_configured:true,enabled:true,retention_days:0,point_count:572,live_point_count:4,imported_point_count:568,last_ts:'2026-09-18T17:41:00Z',last_live_ts:'2026-09-18T17:40:00Z'}]};
  c.requests=[];
  c._hass={language:'de',locale:{language:'de',number_format:'language'},states:{},callWS:async request=>{
    c.requests.push(request);
    if(request.type.endsWith('/status')) return status;
    if(request.type.endsWith('/query')) return {...data,start:request.start,end:request.end};
    if(request.type.endsWith('/gpx')) return {filename:'trip.gpx',content:'<gpx/>'};
    if(request.type.endsWith('/import_recorder')) return {vehicle_name:'BMW iX1',candidates:6,accepted:5,inserted:4,already_stored:1,filtered:1,stored:{point_count:18,imported_point_count:14}};
    throw new Error('Unexpected request '+request.type);
  }};
  c._trackingResult=data;
  c._trackingStatus=status;
  c._trackingStartLocal='2026-09-13T00:00';c._trackingEndLocal='2026-09-18T18:00';
  c._trackingSelectedEntries=new Set(['one','two']);c._trackingPrimaryEntryId='one';
  c._trackingColorForEntry=()=> '#228833';
  c._trackingColorMode='vehicle';
  c._updateControls=()=>{};
  const panel=new Element();
  c.shadowRoot={activeElement:null,getElementById:id=>id==='tracking-panel'?panel:panel.querySelector('#'+id)};
  const sources = Object.fromEntries(['cardata-tracks','cardata-track-markers','route','pois'].map(id=>[id,{data:{untouched:true},setData(data){this.data=data;}}]));
  c.bounds=[];
  c._vectorMap={getSource:id=>sources[id],fitBounds:bounds=>c.bounds.push(bounds)};
  c._mapStyleReady=true;
  c._prepareTrackingPlayback();c._renderTrackingPanel();
  return {c,panel,data,sources};
}

let checks=0;
async function test(name, fn){await fn();checks++;console.log('PASS',name);}
(async()=>{
  await test('trip click filters actual map sources, summary, markers and playback',async()=>{
    const {c,panel,sources}=fixture();
    assert.equal(sources['cardata-tracks'].data.features.length,27);
    assert.equal(panel.querySelectorAll('[data-track-trip]').length,2);
    panel.querySelector('[data-track-trip="3"]').click();
    assert.equal(sources['cardata-tracks'].data.features.length,15);
    assert.equal(sources['cardata-track-markers'].data.features.length,3);
    assert.equal(c._trackingPlaybackFlat.length,16);
    assert.equal(c._trackingVisibleVehicles()[0].point_count,16);
    assert.equal(c._trackingVisibleVehicles()[0].distance_km,21.1);
    assert.equal(panel.querySelector('[data-track-trip="3"]').attrs['aria-pressed'],'true');
    assert.match(panel.innerHTML,/Ausgewählte Fahrt/);
    assert.equal(sources.route.data.untouched,true);assert.equal(sources.pois.data.untouched,true);
  });
  await test('10.2 km trip and map-style source rebuild keep only that trip',async()=>{
    const {c,panel,sources}=fixture();
    panel.querySelector('[data-track-trip="2"]').click();
    assert.equal(sources['cardata-tracks'].data.features.length,11);
    assert.equal(c._trackingPlaybackFlat.length,12);
    assert.equal(c._trackingVisibleVehicles()[0].distance_km,10.2);
    sources['cardata-tracks'].data=null;c._syncTrackingMapSource();
    assert.equal(sources['cardata-tracks'].data.features.length,11);
    assert.equal(c.bounds.at(-1)[0][1],53);
  });
  await test('Show full track restores all selected vehicles',async()=>{
    const {c,panel,sources}=fixture();c._selectTrackingTrip('one',2);
    await panel.querySelector('#tracking-show').click();
    assert.equal(c._trackingSelectedTrip,null);
    assert.equal(sources['cardata-tracks'].data.features.length,27);
    assert.equal(c._trackingPlaybackFlat.length,28); // singleton observations skipped
    assert.equal(c._trackingVisibleVehicles().length,2);
  });
  await test('main and per-trip GPX use exact loaded bounds',async()=>{
    const {c,data}=fixture();c._selectTrackingTrip('one',2);
    await c._downloadTrackingGpx();
    let request=c.requests.at(-1);
    assert.equal(request.start,data.vehicles[0].trips[0].start);
    assert.equal(request.end,data.vehicles[0].trips[0].end);
    assert.equal(request.trip_index,undefined);
    await c._downloadTrackingGpx(3);request=c.requests.at(-1);
    assert.equal(request.start,data.vehicles[0].trips[1].start);
    c._trackingSelectedTrip=null;c._trackingFollowNow=true;
    await c._downloadTrackingGpx();assert.equal(c.requests.at(-1).end,data.end);
  });
  await test('fixed ranges stay fixed; follow-now includes current seconds',async()=>{
    const {c}=fixture();const fixed=c._trackingRangeIso().end;
    now+=3600000;assert.equal(c._trackingRangeIso().end,fixed);
    c._trackingFollowNow=true;c._trackingRangePreset='today';
    assert.equal(c._trackingRangeIso().end,new Date(now).toISOString());
    now+=45000;assert.equal(c._trackingRangeIso().end,new Date(now).toISOString());
    c._trackingFollowNow=false;const frozen=c._trackingRangeIso().end;
    now+=60000;assert.equal(c._trackingRangeIso().end,frozen);
  });
  await test('background refresh cannot replace a just-selected trip or move camera',async()=>{
    const {c,data}=fixture();let resolve;
    c._hass.callWS=()=>new Promise(r=>{resolve=r;});
    const pending=c._loadTrackingTrack({background:true});
    c._selectTrackingTrip('one',2);const before=c.bounds.length;
    resolve({...data,vehicles:[]});await pending;
    assert.equal(c._trackingSelectedTrip.index,2);
    assert.equal(c._trackingVisibleVehicles()[0].distance_km,10.2);
    assert.equal(c.bounds.length,before);
  });
  await test('edited range invalidates an outstanding query',async()=>{
    const {c,data}=fixture();let resolve;
    c._hass.callWS=()=>new Promise(r=>{resolve=r;});
    const pending=c._loadTrackingTrack();
    c._clearTrackingResult();resolve(data);await pending;
    assert.equal(c._trackingResult,null);
  });
  await test('auto refresh reads status but preserves selected historical trip',async()=>{
    const {c}=fixture();c._trackingFollowNow=true;c._selectTrackingTrip('one',2);
    await c._refreshTracking();
    assert.equal(c.requests.filter(r=>r.type.endsWith('/query')).length,0);
    assert.equal(c.requests.filter(r=>r.type.endsWith('/status')).length,1);
    assert.equal(c._trackingSelectedTrip.index,2);
  });
  await test('auto refresh pauses for playback, field editing and closed panel',async()=>{
    const {c,panel}=fixture();c._trackingFollowNow=true;c._trackingPlaybackRunning=true;
    await c._refreshTracking();assert.equal(c.requests.length,0);
    c._trackingPlaybackRunning=false;c.shadowRoot.activeElement=panel.querySelector('#tracking-start');
    await c._refreshTracking();assert.equal(c.requests.length,0);
    c.shadowRoot.activeElement=null;panel.classList.add('hidden');
    await c._refreshTracking();assert.equal(c.requests.length,0);
  });
  await test('import shows committed storage report; manual refresh preserves it',async()=>{
    const {c,panel}=fixture();await c._importTrackingRecorder();
    assert.match(panel.innerHTML,/4 neu gespeichert · 1 bereits vorhanden · 1 herausgefiltert/);
    assert.match(panel.innerHTML,/Datenbank geprüft: 18 GPS-Punkte/);
    assert.match(panel.innerHTML,/Live: 4 · Recorder-Import: 568/);
    assert.match(panel.innerHTML,/Letzter Live-Punkt/);
    await panel.querySelector('#tracking-refresh').click();
    assert.match(panel.innerHTML,/Datenbank geprüft: 18 GPS-Punkte/);
    assert.ok(c.requests.some(r=>r.type.endsWith('/query')));
  });
  await test('failed import never claims points were saved',async()=>{
    const {c,panel}=fixture();c._hass.callWS=async()=>{throw new Error('database unavailable');};
    await c._importTrackingRecorder();
    assert.match(panel.innerHTML,/database unavailable/);
    assert.doesNotMatch(panel.innerHTML,/Datenbank geprüft:/);
    assert.equal(c._trackingLoading,false);
  });
  await test('English translation and repeated renders retain scroll position',async()=>{
    const {c,panel}=fixture();c._hass.language='en';c._hass.locale.language='en';
    panel.scrollTop=320;panel.querySelector('.tracking-trip-list').scrollTop=75;
    c._renderTrackingPanel();
    assert.match(panel.innerHTML,/Stored in total: 572 GPS points/);
    assert.match(panel.innerHTML,/Up to now \(refresh automatically\)/);
    assert.equal(panel.scrollTop,320);assert.equal(panel.querySelector('.tracking-trip-list').scrollTop,75);
    c._selectTrackingTrip('one',2);assert.match(panel.innerHTML,/Selected trip/);
  });
  await test('live camera follow stops when fitting a historical trip',async()=>{
    const {c}=fixture();c._mode='gps';c._lastFreeMode='terrain';
    c._selectTrackingTrip('one',2);assert.equal(c._mode,'terrain');
  });
  await test('refresh timer is unique and removed on disconnect',async()=>{
    const {c}=fixture();c._destroyVectorBasemap=()=>{};
    c._startTrackingRefresh();const timer=c._trackingRefreshTimer;c._startTrackingRefresh();
    assert.equal(c._trackingRefreshTimer,timer);assert.ok(intervals.has(timer));
    c.disconnectedCallback();assert.equal(c._trackingRefreshTimer,null);assert.ok(!intervals.has(timer));
  });
  console.log(`${checks} frontend behavior tests passed. Browser layout and real HA still require manual verification.`);
})().catch(err=>{console.error(err);process.exitCode=1;});
