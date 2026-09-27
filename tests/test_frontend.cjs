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
const frames = new Set();
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
  requestAnimationFrame:fn=>{const frame={fn};frames.add(frame);return frame;}, cancelAnimationFrame:frame=>frames.delete(frame),
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
    distance_km:index===2?10.2:21.1,point_count:segments[index].length,duration_seconds:900,avg_speed_kmh:40,max_speed_kmh:80,start_soc:80,end_soc:60}));
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
    if(request.type.endsWith('/trip_details')) return {energy_status:'available',energy_kwh:3.78,average_kwh_100km:18.9,analytics_distance_km:20};
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
  const legend=new Element();
  c.shadowRoot={activeElement:null,getElementById:id=>id==='tracking-panel'?panel:id==='tracking-legend'?legend:panel.querySelector('#'+id)};
  const sources = Object.fromEntries(['cardata-tracks','cardata-track-markers','route','pois'].map(id=>[id,{data:{untouched:true},setData(data){this.data=data;}}]));
  c.bounds=[];
  c.cameras=[];c.controls=[];c.bearing=0;
  c._vectorMap={getSource:id=>sources[id],fitBounds:bounds=>c.bounds.push(bounds),jumpTo:opts=>{c.cameras.push(opts);c.bearing=opts.bearing??c.bearing;},getBearing:()=>c.bearing,addControl:(control,position)=>c.controls.push({control,position}),removeControl:control=>{c.controls=c.controls.filter(item=>item.control!==control);}};
  c._maplibreLib={ScaleControl:class {constructor(options){this.options=options;}}};
  c._mapStyleReady=true;
  c._prepareTrackingPlayback();c._renderTrackingPanel();
  return {c,panel,data,sources,legend};
}

const flush = () => new Promise(resolve => setImmediate(resolve));
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
    c._hass.callWS=request=>request.type.endsWith('/trip_details')?Promise.resolve({energy_status:'history_missing'}):new Promise(r=>{resolve=r;});
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
  await test('trip consumption reads existing Analytics details and protects against stale responses',async()=>{
    const {c,panel}=fixture();c._selectTrackingTrip('one',2);await flush();
    assert.match(panel.innerHTML,/Start-SoC/);assert.match(panel.innerHTML,/80 %/);
    assert.match(panel.innerHTML,/3,78 kWh/);assert.match(panel.innerHTML,/18,9 kWh\/100 km/);
    assert.ok(c.requests.some(r=>r.type.endsWith('/trip_details')&&r.entry_id==='one'));
    const requests=[];c._hass.callWS=request=>new Promise(resolve=>requests.push({request,resolve}));
    c._selectTrackingTrip('one',2);c._selectTrackingTrip('one',3);
    requests[1].resolve({energy_status:'available',energy_kwh:9});await flush();
    requests[0].resolve({energy_status:'available',energy_kwh:99});await flush();
    assert.equal(c._trackingTripDetails.energy_kwh,9);assert.doesNotMatch(panel.innerHTML,/99,00 kWh/);
  });
  await test('missing and repaired consumption is explicit rather than a fake zero',async()=>{
    const {c,panel}=fixture();c._selectTrackingTrip('one',2);await flush();
    for(const status of ['history_missing','history_gap','counter_changed','repaired_day','unavailable']){
      c._trackingTripDetails={energy_status:status};c._renderTrackingPanel();
      assert.match(panel.innerHTML,/Start-SoC/);assert.doesNotMatch(panel.innerHTML,/0,00 kWh/);
    }
    assert.match(panel.innerHTML,/erneut auswählen/);
    c._hass.language='en';c._hass.locale.language='en';c._trackingTripDetails={energy_status:'repaired_day'};c._renderTrackingPanel();
    assert.match(panel.innerHTML,/SoC correction/);assert.match(panel.innerHTML,/Start SoC/);
  });
  await test('trip sort reverses only the list and persists without changing selection or playback',async()=>{
    const {c,panel,sources,data}=fixture();c._selectTrackingTrip('one',2);
    assert.deepEqual(panel.querySelectorAll('[data-track-trip]').map(e=>e.dataset.trackTrip),['3','2']);
    const route=JSON.stringify(sources['cardata-tracks'].data), chronology=c._trackingPlaybackFlat.map(p=>p.ts).join();
    panel.querySelector('#tracking-trip-sort').events.change({target:{value:'oldest'}});
    assert.deepEqual(panel.querySelectorAll('[data-track-trip]').map(e=>e.dataset.trackTrip),['2','3']);
    assert.equal(c._trackingSelectedTrip.index,2);assert.equal(JSON.stringify(sources['cardata-tracks'].data),route);
    assert.equal(c._trackingPlaybackFlat.map(p=>p.ts).join(),chronology);
    assert.deepEqual(data.vehicles[0].trips.map(t=>t.index),[2,3]);
    const other=new Card();other._restorePreferences();assert.equal(other._trackingTripSort,'oldest');
  });
  await test('legend uses the track thresholds, handles missing values, collapses and follows selection',async()=>{
    const {c,legend}=fixture();c._trackingColorMode='soc';c._syncTrackingMapSource();
    for(const [value,color] of [[0,'#c62828'],[24.9,'#c62828'],[25,'#f9a825'],[50,'#7cb342'],[75,'#2e7d32'],[100,'#2e7d32']]){
      assert.equal(c._trackingLineColor('one',{soc:value}),color);assert.ok(legend.innerHTML.includes(color));
    }
    for(const value of [null,undefined,NaN,-1,101])assert.equal(c._trackingLineColor('one',{soc:value}),'#888888');
    legend.querySelector('#tracking-legend-toggle').click();assert.equal(c._trackingLegendExpanded,false);assert.doesNotMatch(legend.innerHTML,/tracking-swatch/);
    legend.querySelector('#tracking-legend-toggle').click();c._trackingColorMode='speed';c._syncTrackingMapSource();
    for(const [value,color] of [[30,'#4477aa'],[30.1,'#228833'],[60,'#228833'],[60.1,'#ccbb44'],[100.1,'#ee7733'],[130.1,'#d64545']])assert.equal(c._trackingLineColor('one',{speed:value}),color);
    assert.match(legend.innerHTML,/km\/h/);assert.equal(c._trackingLineColor('one',{speed:null}),'#888888');
    c._trackingColorMode='vehicle';c._selectTrackingTrip('one',2);assert.match(legend.innerHTML,/BMW iX1/);assert.doesNotMatch(legend.innerHTML,/BMW i3/);
    c._trackingLegendVisible=false;c._renderTrackingLegend();assert.ok(legend.classList.contains('hidden'));
    c._trackingLegendVisible=true;c._clearTrackingResult();assert.ok(legend.classList.contains('hidden'));
  });
  await test('metric scale toggles once per map and survives preference restore',async()=>{
    const {c,panel}=fixture();panel.querySelector('#tracking-scale-visible').events.change({target:{checked:true}});
    c._syncMapScale();assert.equal(c.controls.length,1);assert.equal(c.controls[0].position,'bottom-left');assert.equal(c.controls[0].control.options.unit,'metric');
    const other=new Card();other._restorePreferences();assert.equal(other._mapScaleVisible,true);
    panel.querySelector('#tracking-scale-visible').events.change({target:{checked:false}});
    assert.equal(c.controls.length,0);assert.equal(c._mapScaleControl,null);
  });
  function frame(c,elapsed){const callback=c._trackingPlaybackTimer;assert.ok(callback);frames.delete(callback);now+=elapsed;callback.fn(now);}
  await test('24-hour timeline completes in exactly 30 seconds with interpolation and no static-track rebuilds',async()=>{
    const {c,data,sources,panel}=fixture();
    data.vehicles[0].segments=[Array.from({length:145},(_,i)=>point('2026-09-10T00:00Z',i*10))];
    c._prepareTrackingPlayback();const lineData=sources['cardata-tracks'].data;
    assert.equal(c._trackingPlaybackTimeline.at(-1),86400000);assert.equal(c._trackingPlaybackRate(),2880);
    c._startTrackingPlayback();frame(c,100);assert.ok(c._trackingPlaybackPoint.lat>54);assert.ok(c._trackingPlaybackPoint.lat<54.01);
    assert.equal(sources['cardata-tracks'].data,lineData);
    frame(c,28900);assert.equal(c._trackingPlaybackRunning,true);frame(c,1000);
    assert.equal(c._trackingPlaybackRunning,false);assert.equal(c._trackingPlaybackIndex,144);assert.match(panel.innerHTML,/Abspielen/);
    assert.equal(c._trackingPlaybackTimer,null);assert.equal(c.cameras.length,0);
  });
  await test('pause resume speed changes and scrubbing retain fractional playback progress',async()=>{
    const {c,panel}=fixture();c._selectTrackingTrip('one',2);c._trackingPlaybackSpeed='1';c._startTrackingPlayback();frame(c,30000);
    const position=c._trackingPlaybackPosition;c._stopTrackingPlayback();now+=5000;c._startTrackingPlayback();frame(c,1000);
    assert.equal(c._trackingPlaybackPosition,position+1000);
    panel.querySelector('#tracking-play-speed').events.change({target:{value:'3000'}});frame(c,1);assert.equal(c._trackingPlaybackPosition,position+4000);
    panel.querySelector('#tracking-play-slider').events.input({target:{value:'45000'}});
    assert.equal(c._trackingPlaybackPosition,45000);assert.equal(c._trackingPlaybackRunning,false);assert.equal(c._trackingPlaybackTimer,null);
    assert.equal(panel.querySelector('#tracking-play').textContent,'Abspielen');
  });
  await test('gaps are skipped or held with no imaginary motion between trips',async()=>{
    const {c,data}=fixture();const a=[point('2026-09-14T10:00Z',0),point('2026-09-14T10:00Z',1)];
    const b=[point('2026-09-14T12:00Z',0,56),point('2026-09-14T12:00Z',1,56)];
    data.vehicles[0].segments=[a,b];c._prepareTrackingPlayback();assert.equal(c._trackingPlaybackTimeline.at(-1),120000);
    c._setTrackingPlaybackPosition(60000);assert.equal(c._trackingPlaybackPoint.lat,56);
    c._trackingSkipPauses=false;c._buildTrackingTimeline();assert.equal(c._trackingPlaybackTimeline.at(-1),7260000);
    c._setTrackingPlaybackPosition(3600000);assert.equal(c._trackingPlaybackPoint.lat,a[1].lat);
    c._trackingPlaybackSpeed='duration:30';c._startTrackingPlayback();frame(c,30000);assert.equal(c._trackingPlaybackRunning,false);
  });
  await test('free north and heading camera modes preserve zoom, smooth turns and hold stationary headings',async()=>{
    const {c}=fixture();c._selectTrackingTrip('one',2);c._setTrackingPlaybackPosition(1000);assert.equal(c.cameras.length,0);
    c._setTrackingCameraMode('north');assert.equal(c.cameras.at(-1).bearing,0);assert.equal(c.cameras.at(-1).zoom,undefined);assert.equal(c.cameras.at(-1).pitch,undefined);
    c._setTrackingCameraMode('heading');assert.ok(c.cameras.at(-1).bearing>0&&c.cameras.at(-1).bearing<90);
    const first=c._trackingCameraBearing;c._trackingPlaybackFlat[1].lon=8;now+=16;c._updateTrackingCamera();
    assert.ok(Math.abs(c._trackingCameraBearing-first)<=1.45);
    c._trackingPlaybackFlat[1]={...c._trackingPlaybackFlat[0]};const held=c._trackingCameraBearing;now+=16;c._updateTrackingCamera();assert.equal(c._trackingCameraBearing,held);
    c._trackingCameraBearing=359;c._bearingDeg=()=>1;c._trackingPlaybackFlat[1]={...c._trackingPlaybackFlat[0],lat:54.5};now+=16;c._updateTrackingCamera();assert.ok(c._trackingCameraBearing>359&&c._trackingCameraBearing<=360.45);
    c._setTrackingCameraMode('free');const count=c.cameras.length;c._setTrackingPlaybackPosition(2000);assert.equal(c.cameras.length,count);
  });
  await test('playback pauses in hidden tab and cancels frames on disconnect',async()=>{
    const {c}=fixture();c._startTrackingPlayback();const old=c._trackingPlaybackTimer;
    document.hidden=true;c._trackingVisibilityHandler();document.hidden=false;assert.equal(c._trackingPlaybackRunning,false);assert.ok(!frames.has(old));
    c._startTrackingPlayback();const next=c._trackingPlaybackTimer;c.disconnectedCallback();assert.equal(c._trackingPlaybackRunning,false);assert.ok(!frames.has(next));
  });
  await test('track fit releases the playback camera and leaves playback running',async()=>{
    const {c}=fixture();c._setTrackingCameraMode('heading');c._startTrackingPlayback();
    c._fitTrackingTracks();assert.equal(c._trackingCameraMode,'free');assert.equal(c._trackingCameraActive,false);
    assert.equal(c._trackingPlaybackRunning,true);const calls=c.cameras.length;frame(c,100);assert.equal(c.cameras.length,calls);c._stopTrackingPlayback();
  });
  await test('background refresh preserves paused full-track playback including an in-flight query',async()=>{
    const {c,data}=fixture();c._trackingFollowNow=true;
    let resolve;const original=c._hass.callWS;
    c._hass.callWS=request=>request.type.endsWith('/query')?new Promise(r=>{resolve=r;}):original(request);
    const pending=c._loadTrackingTrack({background:true});c._startTrackingPlayback();frame(c,1000);c._stopTrackingPlayback();
    const position=c._trackingPlaybackPosition;resolve(data);await pending;
    assert.equal(c._trackingPlaybackPosition,position);assert.equal(c._trackingPlaybackEngaged,true);
    const count=c.requests.length;await c._refreshTracking();assert.equal(c._trackingPlaybackPosition,position);
    assert.equal(c.requests.slice(count).filter(r=>r.type.endsWith('/query')).length,0);
    c._clearTrackingResult();assert.equal(c._trackingPlaybackEngaged,false);
  });
  await test('basemap refresh preserves playback heading in 2D and restores normal north-up afterward',async()=>{
    const {c}=fixture();c._vectorMap.getPitch=()=>0;c._vectorMap.setTerrain=()=>{};c._vectorMap.getLayer=()=>null;
    c._setTrackingCameraMode('heading');const heading=c.bearing, calls=c.cameras.length;
    c._syncTerrainView({terrain:false},{animate:false});assert.equal(c.bearing,heading);assert.equal(c.cameras.length,calls);
    c._setTrackingCameraMode('free');c._syncTerrainView({terrain:false},{animate:false});assert.equal(c.bearing,0);
  });
  await test('live vehicle focus stops historical playback before moving the camera',async()=>{
    const {c}=fixture();c._vehicles=()=>[{deviceId:'live',valid:true,lat:54,lon:9}];c._tileProvider=()=>({maxZoom:20});
    c._syncVehicleMapMarkers=()=>{};c._renderVehiclePanel=()=>{};c._renderPoiPanel=()=>{};
    c._setTrackingCameraMode('heading');c._startTrackingPlayback();
    assert.equal(c._focusVehicle('live',{follow:true,showPopup:false,animate:false}),true);
    assert.equal(c._trackingPlaybackRunning,false);assert.equal(c._trackingCameraActive,false);assert.equal(c._mode,'gps');
  });
  await test('live follow keeps vehicle centered when zooming and preserves follow on pinch',async()=>{
    const {c}=fixture();let lat=54,lon=9,zoom=13,center={lat, lng:lon};
    const wheel={disable(){},enable(options){this.options=options;}};
    const touch={disable(){},enable(options){this.options=options;},disableRotation(){}};
    const map=c._vectorMap;
    Object.assign(map,{scrollZoom:wheel,touchZoomRotate:touch,getCenter:()=>center,getZoom:()=>zoom,
      stop(){},easeTo(camera){zoom=camera.zoom??zoom;if(camera.center)center={lat:camera.center[1],lng:camera.center[0]};},
      jumpTo(camera){zoom=camera.zoom??zoom;if(camera.center)center={lat:camera.center[1],lng:camera.center[0]};}});
    c._vehicles=()=>[{deviceId:'live',valid:true,lat,lon}];c._tileProvider=()=>({maxZoom:20,terrain:false});
    c._syncVehicleMapMarkers=()=>{};c._renderVehiclePanel=()=>{};c._renderPoiPanel=()=>{};
    assert.equal(c._focusVehicle('live',{follow:true,showPopup:false,animate:false}),true);
    assert.equal(wheel.options.around,'center');assert.equal(touch.options.around,'center');
    c._changeZoom(-2);assert.equal(center.lat,lat);assert.equal(center.lng,lon);assert.equal(zoom,13);
    c._handleMapDragStart({originalEvent:{touches:[{},{}]}});
    assert.equal(c._mode,'gps');
    lat=54.003;lon=9.004;c._followSelectedVehiclePosition({animate:false});
    assert.equal(center.lat,lat);assert.equal(center.lng,lon);
    c._handleMapDragStart({originalEvent:{touches:[{}]}});
    assert.notEqual(c._mode,'gps');assert.equal(wheel.options,undefined);assert.equal(touch.options,undefined);
  });
  await test('saved native GPS checkbox stays checked after a phone GPS session stops',async()=>{
    const {c,panel}=fixture();
    c._trackingStatus.vehicles[0].session={active:false,source_id:'phone'};
    c._renderTrackingPanel();
    assert.equal(panel.querySelector('[data-track-enable="one"]').checked,true);
    assert.equal(panel.querySelector('[data-track-enable="one"]').attrs.disabled,undefined);
  });
  await test('GPS management form and trip controls include vehicles without native GPS',async()=>{
    const {c,panel}=fixture(); c._hass.user={is_admin:true};
    c._trackingStatus.sources=[{id:'phone',name:'Phone',entity_id:'sensor.phone',vehicles:['twingo']}];
    c._trackingStatus.vehicles.push({entry_id:'twingo',name:'Twingo',gps_configured:true,native_gps:false});
    c._renderTrackingPanel();
    assert.ok(panel.querySelector('[data-gps-start="twingo"]'));
    assert.ok('disabled' in panel.querySelector('[data-track-enable="twingo"]').attrs || panel.innerHTML.includes('disabled> GPS-Tracking'));
    panel.querySelector('#gps-manage').click();panel.querySelector('#gps-add').click();
    assert.ok(panel.querySelector('#gps-entity'));assert.ok(panel.querySelector('#gps-lat'));
    panel.querySelector('#gps-name').value='Matthias';panel.querySelector('#gps-name').events.input();
    c._renderTrackingPanel();assert.equal(panel.querySelector('#gps-name').value,'Matthias');
    panel.querySelector('#gps-cancel').click();assert.equal(c._gpsDraft,null);
  });
  await test('GPS session actions send the chosen vehicle and source and retain failed drafts',async()=>{
    const {c,panel}=fixture();c._vectorMap=null;let sent;
    c._hass.callWS=async r=>{sent=r;if(r.type.endsWith('/status'))return c._trackingStatus;throw new Error('Already in use');};
    c._gpsDraft={name:'Keep draft',vehicles:[]};
    await c._gpsAction('start',{entry_id:'twingo',source_id:'phone'});
    assert.equal(sent.action,'start');assert.equal(sent.data.source_id,'phone');
    assert.equal(c._gpsDraft.name,'Keep draft');assert.match(c._trackingMessage,/Already in use/);assert.equal(c._gpsBusy,false);
  });
  await test('parked external position replaces native coordinates without borrowing phone consumption',async()=>{
    const {c}=fixture();c._trackingStatus.vehicles[0].session={active:false,last_fix:{lat:52,lon:8,ts:'2026-09-18T17:41:00Z'}};
    c._hass.states={'sensor.soc':{state:'77'},'sensor.phone':{attributes:{latitude:53,longitude:9}}};
    const data=Card.prototype._vehicleData.call(c,{entryId:'one',entities:{soc:'sensor.soc'}});
    assert.equal(data.lat,52);assert.equal(data.lon,8);assert.equal(data.soc,77);assert.equal(data.address,null);
  });
  await test('new native GPS positions replace parked phone positions but not active phone positions',async()=>{
    const {c}=fixture();const tracked=c._trackingStatus.vehicles[0];
    tracked.session={active:false,last_fix:{lat:52,lon:8,ts:'2026-09-18T17:41:00Z'}};
    c._hass.states={'sensor.lat':{state:'54',last_updated:'2026-09-18T17:45:00Z'},
      'sensor.lon':{state:'9',last_updated:'2026-09-18T17:45:00Z'}};
    const vehicle={entryId:'one',entities:{latitude:'sensor.lat',longitude:'sensor.lon'}};
    assert.equal(c._vehicleData(vehicle).lat,54);assert.equal(c._vehicleData(vehicle).lon,9);
    tracked.session.active=true;
    assert.equal(c._vehicleData(vehicle).lat,52);assert.equal(c._vehicleData(vehicle).lon,8);
  });
  await test('GPS sources and active sessions render in English and escape source names',async()=>{
    const {c,panel}=fixture();c._hass.language='en';c._hass.locale.language='en';c._hass.user={is_admin:true};
    c._trackingStatus.sources=[{id:'phone',name:'<script>',vehicles:['one'],fix:null}];
    c._trackingStatus.vehicles[0].session={active:true,source_id:'phone'};
    c._renderTrackingPanel();assert.match(panel.innerHTML,/Waiting for valid GPS/);assert.match(panel.innerHTML,/End trip/);
    assert.ok(!panel.innerHTML.includes('<script>'));assert.ok(panel.querySelector('[data-gps-stop="one"]'));
  });
  await test('CarPlay automation can be configured without replacing manual GPS controls',async()=>{
    const {c,panel}=fixture();c._hass.user={is_admin:true};c._hass.states['sensor.iphone_matprivat_ssid']={state:'BMWi39000 CarPlay'};
    c._trackingStatus.sources=[{id:'phone',name:'iPhone',entity_id:'sensor.phone',vehicles:['one']}];
    c._trackingStatus.auto_rules={one:{source_id:'phone',ssid_entity:'sensor.iphone_matprivat_ssid',ssid:'BMWi39000 CarPlay'}};
    c._trackingStatus.vehicles[0].session={active:true,mode:'auto',suspended:true,source_id:'phone'};
    c._gpsManage=true;c._renderTrackingPanel();
    assert.match(panel.innerHTML,/Automatische Fahrt aktiv/);assert.match(panel.innerHTML,/Aufzeichnung pausiert/);
    assert.ok(panel.querySelector('[data-gps-stop="one"]'));
    assert.match(panel.innerHTML,/10 s.*Testmodus/);
    panel.querySelector('[data-auto-notify="one"]').value='notify.mobile_app_iphone_matprivat';
    panel.querySelector('[data-auto-interval="one"]').value='10';
    let sent;c._hass.callWS=async req=>{sent=req;return {};};c._loadTrackingStatus=async()=>{};
    await panel.querySelector('[data-auto-save="one"]').click();
    assert.equal(sent.action,'auto_save');assert.equal(sent.data.ssid,'BMWi39000 CarPlay');
    assert.equal(sent.data.ssid_entity,'sensor.iphone_matprivat_ssid');
    assert.equal(sent.data.notify_service,'notify.mobile_app_iphone_matprivat');
    assert.equal(sent.data.location_interval,10);
  });
  await test('folder selection displays only assigned historical trips and preserves other views',async()=>{
    const {c,panel,sources,data}=fixture();c._hass.user={is_admin:true};
    data.vehicles[0].trips[0].id='trip-10';data.vehicles[0].trips[0].folders=['holiday-child'];
    data.vehicles[0].trips[1].id='trip-21';data.vehicles[0].trips[1].folders=[];
    c._trackingStatus.folders=[{id:'holiday',name:'Urlaub',parent_id:null},{id:'holiday-child',name:'Anreise',parent_id:'holiday'}];
    c._renderTrackingPanel();assert.ok(panel.querySelector('[data-trip-delete="trip-10"]'));
    const filter=panel.querySelector('#tracking-folder-filter');filter.value='holiday';filter.events.change({target:filter});
    assert.equal(c._trackingVisibleVehicles()[0].trip_count,1);
    assert.equal(c._trackingVisibleVehicles()[0].point_count,12);
    assert.equal(sources['cardata-tracks'].data.features.length,11);
    assert.equal(panel.querySelectorAll('[data-track-trip]').length,1);
    assert.match(panel.innerHTML,/Urlaub \/ Anreise/);
    assert.equal(sources.route.data.untouched,true);
  });
  await test('single-trip deletion sends exact stable id and bounds after confirmation',async()=>{
    const {c,panel,data}=fixture();c._hass.user={is_admin:true};
    data.vehicles[0].trips[1].id='trip-21';data.vehicles[0].trips[1].folders=[];
    c._renderTrackingPanel();let sent;
    c._hass.callWS=async req=>{sent=req;return {deleted:16}};
    c._loadTrackingStatus=async()=>{};c._loadTrackingTrack=async()=>{};
    await panel.querySelector('[data-trip-delete="trip-21"]').click();
    assert.equal(sent.type,'cardata_analytics/tracking/delete_trip');
    assert.equal(sent.trip_id,'trip-21');assert.equal(sent.start,data.vehicles[0].trips[1].start);
    assert.equal(sent.end,data.vehicles[0].trips[1].end);assert.equal(sent.entry_id,'one');
  });
  await test('bulk selection moves shown trips in one request and clears selection',async()=>{
    const {c,panel,data}=fixture();c._hass.user={is_admin:true};
    data.vehicles[0].trips.forEach((t,i)=>{t.id='trip-'+i;t.folders=[];});
    c._trackingStatus.folders=[{id:'summer',name:'Urlaub',parent_id:null}];
    c._renderTrackingPanel();panel.querySelector('#tracking-bulk-all').click();
    assert.equal(panel.querySelectorAll('[data-trip-select]').length,2);
    assert.match(panel.innerHTML,/2 ausgewählt/);
    const choice=panel.querySelector('#tracking-bulk-folder');choice.value='summer';
    let sent;c._hass.callWS=async r=>{sent=r;return {trips:2,deleted:0}};
    c._loadTrackingStatus=async()=>{};c._loadTrackingTrack=async()=>{};
    await panel.querySelector('#tracking-bulk-move').click();
    assert.equal(sent.action,'move');assert.equal(sent.folder_id,'summer');
    assert.deepEqual([...sent.trips].map(t=>t.trip_id),['trip-1','trip-0']);
    assert.equal(c._trackingBulkSelected.size,0);
  });
  await test('bulk deletion carries precise trips and range change clears selection',async()=>{
    const {c,panel,data}=fixture();c._hass.user={is_admin:true};
    data.vehicles[0].trips.forEach((t,i)=>{t.id='trip-'+i;t.folders=[];});c._renderTrackingPanel();
    panel.querySelector('#tracking-bulk-all').click();
    let sent;c._hass.callWS=async r=>{sent=r;return {trips:2,deleted:28}};
    c._loadTrackingStatus=async()=>{};c._loadTrackingTrack=async()=>{};
    await panel.querySelector('#tracking-bulk-delete').click();
    assert.equal(sent.action,'delete');assert.equal(sent.trips.length,2);
    assert.equal(c._trackingBulkSelected.size,0);
    panel.querySelector('#tracking-bulk-all')?.click();
    c._clearTrackingResult();assert.equal(c._trackingBulkSelected.size,0);
  });
  await test('merging selected trips sends both exact ranges and keeps GPS data',async()=>{
    const {c,panel,data}=fixture();c._hass.user={is_admin:true};
    data.vehicles[0].trips.forEach((t,i)=>{t.id='trip-'+i;t.folders=[];});
    c._renderTrackingPanel();panel.querySelector('#tracking-bulk-all').click();
    assert.ok(panel.querySelector('#tracking-bulk-merge'));
    let request;c._hass.callWS=async req=>{request=req;return {trips:2,group_id:'group-1'};};
    c._loadTrackingStatus=async()=>{};c._loadTrackingTrack=async()=>{};
    await panel.querySelector('#tracking-bulk-merge').click();
    assert.equal(request.action,'merge');assert.equal(request.trips.length,2);
    assert.deepEqual([...request.trips].map(t=>t.trip_id),['trip-1','trip-0']);
    assert.equal(c._trackingBulkSelected.size,0);
  });
  await test('merged trip map playback GPX and deletion use only member segments',async()=>{
    const {c,panel,data,sources}=fixture();c._hass.user={is_admin:true};
    const original=data.vehicles[0].trips;
    const merged={...original[0],id:'group-1',index:2,indices:[2,3],start:original[0].start,end:original[1].end,
      point_count:28,trip_count:1,distance_km:31.3,duration_seconds:1800,folders:[],
      members:original.map((trip,i)=>({id:`trip-${i}`,index:trip.index,start:trip.start,end:trip.end}))};
    data.vehicles[0].trips=[merged];c._renderTrackingPanel();
    assert.match(panel.innerHTML,/2 Teilstrecken/);
    c._selectTrackingTrip('one',2);
    assert.equal(c._trackingVisibleVehicles()[0].segments.length,2);
    assert.equal(sources['cardata-tracks'].data.features.length,26);
    assert.equal(c._trackingPlaybackFlat.length,28);
    let request;c._hass.callWS=async req=>{request=req;return {filename:'group.gpx',content:'<gpx/>'};};
    await c._downloadTrackingGpx(2);
    assert.equal(request.group_id,'group-1');assert.equal(request.members.length,2);
    c._loadTrackingStatus=async()=>{};c._loadTrackingTrack=async()=>{};
    await c._deleteSingleTrip(merged);
    assert.equal(request.action,'delete');assert.deepEqual([...request.trips].map(t=>t.trip_id),['trip-0','trip-1']);
    c._renderTrackingPanel();
    await c._unmergeTrackingTrip(merged);
    assert.equal(request.action,'unmerge');assert.equal(request.group_id,'group-1');
  });
  console.log(`${checks} frontend behavior tests passed. Browser layout and real HA still require manual verification.`);
})().catch(err=>{console.error(err);process.exitCode=1;});
