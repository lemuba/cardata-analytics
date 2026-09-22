# Cardata Analytics

Cardata Analytics is a Home Assistant custom integration for analysing battery-electric vehicle data that already exists as Home Assistant sensor entities.

It adds vehicle analytics, persistent comparison periods, an automatic multi-vehicle analytics card, and a MapLibre-based vehicle map with remaining-range overlays, POIs, charging-station search and route planning.

The integration does **not** connect directly to a vehicle manufacturer. It works with data supplied by another Home Assistant integration, MQTT, REST, CAN/OBD or any other source that exposes suitable sensor entities.

> **Current release:** v0.1.69\
> **Home Assistant:** 2026.1.0 or newer  
> **Languages:** German and English. The Home Assistant language is detected automatically; other languages currently fall back to English.

> **Screenshots and mobile support:** The screenshots in this README were captured in the **desktop view**. Both custom cards are responsive and are designed to remain fully usable on smartphones and tablets, including **iPhone/iOS**. Narrow layouts reflow the map controls, POI panels become vertically scrollable, route point picking uses a compact mobile mode, and fullscreen respects iPhone safe areas. The screenshots were captured from the v0.1.50 UI. The overall layout remains representative of v0.1.69; later releases add fixes and refinements without changing the basic card structure shown here.

---

## Highlights

- Multiple battery-electric vehicles in one integration
- Manufacturer-neutral **BEV** setup plus convenience presets for **BMW i3 120 Ah** and **BMW iX1**
- SoC, odometer, usable battery capacity, remaining range and optional SoH/GPS integration
- Estimated energy consumption and average consumption in kWh/100 km
- Today / week / month / year analytics
- Persistent custom comparison periods with a compact daily ledger
- Home Assistant long-term statistics support
- Responsive automatic analytics card for all configured vehicles
- Interactive **MapLibre** vehicle map
- OpenFreeMap Liberty, detailed OpenFreeMap Bright (`OSM+`), OpenTopoMap, Esri satellite and optional 3D terrain
- Multiple vehicles with deterministic colours and coloured markers
- Live remaining-range rings per vehicle
- Continuous GPS follow while keeping the selected zoom level
- Frontend-only GPS movement information including average speed between valid GPS updates and direction
- **57 POI categories** with clustering and local free-text filtering
- **Open Charge Map** charging stations with operator, connector and power filters
- Multiple charging operators selectable at the same time
- POI search radius up to **1000 km for charging stations**
- Global POI templates shared across devices
- Route planning with live vehicle position as origin
- Up to **9 internal intermediate stops**
- POIs, address-search results and free map points can be used as intermediate stops or destinations
- Global route templates and named destinations
- Home Assistant `zone.*` entities as route targets
- Google Maps / Navigation handoff
- Responsive desktop, tablet and mobile UI including iPhone safe-area handling

---

## How Cardata Analytics works

Cardata Analytics reads the source entities you select during setup and creates its own calculated Home Assistant entities. Vehicle analytics are calculated locally inside Home Assistant.

For consumption estimation, falling SoC is converted into consumed energy using the configured usable battery capacity:

```text
consumed_kWh = (old_SoC - new_SoC) / 100 × usable_battery_capacity_kWh
```

SoC increases are treated as charging and are not counted as driving consumption.

Average consumption is calculated from estimated consumed energy and driven distance:

```text
kWh_per_100km = consumed_kWh / driven_km × 100
```

The quality of these values depends on the precision and update frequency of the source sensors. Cardata Analytics does not invent missing vehicle data.

---

## Requirements

Cardata Analytics requires existing Home Assistant entities for the vehicle data.

### Required for every vehicle

| Source | Expected value |
|---|---|
| State of charge | Percentage from 0 to 100 |
| Odometer / mileage | Distance sensor |
| Usable battery capacity | Capacity sensor or a fixed kWh value for generic BEVs |

### Optional

| Source | Purpose |
|---|---|
| Remaining range | Range display, analytics-card information and map range ring |
| State of health | Exposed as a Cardata SoH entity where supported |
| GPS latitude | Vehicle position and map features |
| GPS longitude | Vehicle position and map features |

Latitude and longitude must always be configured together.

Distance source units are normalized from `km`, `mi` or `m` to kilometres. Capacity values are normalized from `kWh`, `Wh` or `MWh` to kWh.

---

# Installation

## HACS installation

Cardata Analytics can be installed as a custom HACS integration.

1. Open **HACS** in Home Assistant.
2. Open the menu in HACS and select **Custom repositories**.
3. Add the repository:

   ```text
   https://github.com/lemuba/cardata-analytics
   ```

4. Select **Integration** as the repository type.
5. Search for **Cardata Analytics** in HACS and install it.
6. Restart Home Assistant.
7. Go to **Settings → Devices & services**.
8. Select **Add integration**.
9. Search for **Cardata Analytics**.

## Manual installation

Copy the complete integration directory:

```text
custom_components/cardata_analytics
```

into:

```text
/config/custom_components/cardata_analytics
```

Restart Home Assistant and add **Cardata Analytics** through **Settings → Devices & services → Add integration**.

---

# Integration setup

## 1. Choose a vehicle type

The setup flow offers three vehicle types:

### BEV

The manufacturer-neutral option and the recommended choice for most electric vehicles.

You can either select a sensor that represents the vehicle's **total usable battery capacity** or enter a fixed usable capacity in kWh.

If both are configured, the fixed value can also serve as a fallback when the live capacity source is unavailable.

### BMW i3 120 Ah

Convenience preset with a required usable HV-capacity sensor and built-in SoH estimation based on the configured usable battery capacity.

### BMW iX1

Convenience preset with a required usable HV-capacity sensor and optional source SoH sensor.

> The capacity source must represent the battery's **total usable capacity**, not the energy currently stored in the battery.

## 2. Select the source entities

For each vehicle configure:

- vehicle name
- SoC sensor
- odometer sensor
- usable battery-capacity sensor or fixed capacity where applicable
- optional remaining-range sensor
- optional SoH sensor where applicable
- optional GPS latitude and longitude sensors
- Open Charge Map usage and API key

You can add any number of vehicles by running **Add integration → Cardata Analytics** again.

## 3. Reconfigure an existing vehicle

Open the Cardata Analytics integration entry in **Settings → Devices & services** and use **Reconfigure** to change source entities, vehicle name, GPS sources or the Open Charge Map setting/API key.

Existing Cardata entity identities remain stable when source entities are reconfigured.

### Integration and vehicle setup screenshots

| Integration overview | Vehicle setup / reconfigure |
|---|---|
| ![Cardata Analytics integration overview with configured vehicles](docs/images/integration-overview.png) | ![Cardata Analytics vehicle setup and reconfigure dialog](docs/images/integration-setup.png) |

---

# Open Charge Map for charging stations

Cardata Analytics deliberately uses **Open Charge Map (OCM)** for charging-station POIs instead of treating charging stations as just another general OpenStreetMap/Overpass category.

Open Charge Map is a community-driven, non-commercial charging-location project with a dedicated API and structured EV-charging data. Its API can provide information that is especially useful for an EV map, including operator/network, connection types, charging power, status, address and capacity where available.

This separation has several advantages for Cardata Analytics:

- charging-station searches are independent from public Overpass availability
- large charging searches can use radii of **500 km or 1000 km** without sending an equivalent general-purpose Overpass query
- operator/network filters can be combined, for example **IONITY + EnBW + Tesla**
- connector and minimum-power filters can be applied to normalized charging data
- operator colours and two-character labels can be shown consistently on the map
- charging results can be cached independently from normal OSM POIs

General POIs such as restaurants, parking, hotels, pharmacies or service stations continue to use OpenStreetMap data through public Overpass instances. Their radius is protected at a maximum of **200 km**.

## Open Charge Map API key

A **free Open Charge Map API key** is required when OCM charging-station support is enabled.

1. Create or sign in to an account at [openchargemap.io](https://openchargemap.io/).
2. Open your profile and go to **My Apps**.
3. Register an application and obtain your API key.
4. Enter the key in the Cardata Analytics setup or **Reconfigure** flow.

Useful Open Charge Map links:

- [Open Charge Map developer information](https://openchargemap.io/develop)
- [Open Charge Map API documentation](https://openchargemap.io/develop/api)
- [Open Charge Map registration](https://openchargemap.io/loginprovider/register)

The key is stored in the **Home Assistant backend** and is not entered into the Lovelace card. Cardata Analytics validates the key during setup and keeps the same OCM configuration synchronized across its integration entries.

Open Charge Map is an external community service. Charging-location data can originate from different providers and community contributions, so completeness and accuracy cannot be guaranteed. Cardata Analytics displays provider attribution where available.

---

# Home Assistant entities and analytics

Each configured vehicle receives Cardata Analytics entities for the available/calculated data, including:

- state of charge
- odometer
- usable battery capacity
- total estimated consumed energy
- distance and estimated consumed energy for today
- average consumption for today
- distance, energy and average consumption for week, month and year
- selected-period distance, energy and average consumption
- remaining range when configured
- SoH when available/supported
- GPS latitude and longitude when configured
- current address when GPS is configured

## Comparison periods

Cardata Analytics creates one integration-wide comparison-period control shared by all configured vehicles.

Available presets are displayed as:

- Custom
- Today
- Last day
- Last 7 days
- Last month
- Last year

A custom from/to date range can also be selected. The end date is inclusive.

### Persistent daily ledger

For reliable historical ranges, Cardata Analytics maintains a compact local daily ledger per vehicle. Completed days store the driven distance and estimated consumed energy required for selected-range calculations, while the current day continues to use live values.

The ledger is designed to stay small and persistent even over long periods.

If Home Assistant was offline around a day boundary and the exact result cannot be reconstructed safely, Cardata Analytics marks the day incomplete instead of silently guessing values. A conservative recovery mechanism can reconstruct a single unambiguous missing day when aggregate counters provide enough information.

### SoC spike protection and historical repair

Some upstream vehicle integrations occasionally publish a short-lived incorrect SoC value, for example `52 % → 100 % → 45 %` while the vehicle has not meaningfully moved. Without filtering, the fall from the false 100% value can be mistaken for real battery consumption and inflate Today/Week/Month/Year and selected-period energy.

From v0.1.64 Cardata Analytics uses a directional short-zig-zag guard for this failure mode. A false high source value may return **below** the exact pre-spike SoC because the vehicle can keep consuming energy while the bad sample is present. For example, `67 % → 100 % → 54 %` is treated as the real `67 % → 54 %` decline when the 100% pulse is short. Repeated short pulses are evaluated independently. Very short round trips can be rejected even while the odometer advances; outside the hard short window Cardata keeps the more conservative odometer/stability checks. Normal monotonic driving and genuine charging remain accepted.

The Analytics card also provides **SoC data check** below each vehicle. The check always uses the **currently selected comparison range** (for example Last 7 days), reads the configured source SoC and odometer history from Home Assistant Recorder and shows a preview before changing anything. The preview lists detected spikes by day, the current Cardata energy, the proposed corrected value and the exact additional kWh reduction. A day that was already repaired can still appear in the preview, but it is marked as already corrected and is not subtracted again.

Applying the preview changes only Cardata Analytics data: affected Daily Ledger entries, currently active Day/Week/Month/Year energy buckets and the lifetime Cardata consumed-energy total are adjusted by the newly detected phantom-energy delta. Cardata stores a diagnostic backup plus a per-day cumulative repair ledger. This makes repeated analyses/applications idempotent: previously removed spike energy is not removed a second time, while a later improved detector may still offer only the newly discovered remainder. The original manufacturer/source SoC history in Home Assistant Recorder is **not edited or deleted**. If Recorder does not contain enough source history, Cardata refuses the repair instead of guessing.

### Temporary source outages

If a configured odometer source temporarily becomes unavailable, Cardata Analytics keeps the last valid odometer reading instead of making the analytics disappear. It does not estimate missing driving distance; the value catches up when the upstream source becomes valid again.

---

# Dashboard cards

Cardata Analytics ships both dashboard cards inside the integration. No separate frontend repository is required.

When Home Assistant uses Lovelace **storage mode**, Cardata Analytics registers and updates its module resource automatically.

If Lovelace resources are managed in YAML mode, add the current module manually:

```yaml
resources:
  - url: /cardata_analytics/cardata-analytics-card-0.1.69.js?v=0.1.69
    type: module
```

After installing or updating Cardata Analytics, restart Home Assistant and reload the browser or Companion App.

---

## Analytics card

Add a **Manual** card to your dashboard:

```yaml
type: custom:cardata-analytics-card
```

The Analytics card discovers all configured Cardata Analytics vehicles automatically.

### Analytics card features

- responsive multi-vehicle layout
- current SoC, odometer and remaining range
- usable battery capacity and SoH when available
- current address and Google Maps access when GPS is configured
- today / week / month / year distance and consumption analytics
- selected comparison-period analytics
- shared preset and date controls
- local coverage/incomplete-history information where relevant
- German/English labels, dates and number formatting following Home Assistant language settings

No vehicle entity IDs need to be entered in the Lovelace YAML.

![Cardata Analytics dashboard with multi-vehicle analytics and vehicle map](docs/images/analytics-dashboard.png)

---

## Vehicle map card

Add a second **Manual** card:

```yaml
type: custom:cardata-analytics-map-card
title: Cardata Vehicle Map
height: 520
```

The map automatically discovers every configured Cardata vehicle that has both latitude and longitude entities.

`height` is optional. The default is `520` pixels and the card clamps configured values to a sensible map height.

### Optional map-card settings

```yaml
type: custom:cardata-analytics-map-card
title: Cardata Vehicle Map
height: 520
storage_key: cardata_analytics_map_card_v1
poi_cache_minutes: 15
poi_max_results: 500
poi_request_timeout_seconds: 35
```

Available advanced settings:

| Option | Purpose | Range/default |
|---|---|---|
| `title` | Card title | optional |
| `height` | Normal map height in px | default 520 |
| `storage_key` | Browser-local map preference namespace | optional |
| `poi_cache_minutes` | Frontend POI cache lifetime | 5–120 min, default 15 |
| `poi_max_results` | Maximum POIs rendered after local filtering; general OSM searches may fetch a larger bounded candidate pool internally | 50–1000, default 500 |
| `poi_request_timeout_seconds` | POI request timeout | 15–90 s, default 35 |
| `satellite_url` | Optional replacement satellite tile URL | HTTPS with `{z}/{x}/{y}` |
| `satellite_attribution` | Required attribution for a custom satellite provider | required with custom URL |
| `satellite_max_zoom` | Maximum zoom for custom satellite tiles | 2–22, default 19 |

For general OSM POIs, free-text typing remains **local** and does not trigger Overpass requests. Cardata keeps a larger bounded candidate pool internally (up to 3000 items) so name/brand searches remain useful at wider radii. If that candidate pool is exhausted, the POI status explains that the local search may be incomplete; pressing **Refresh** with a search term performs one targeted Overpass query for that term.

---

# Map features

## Map layers

The map offers four flat base-map styles plus a dedicated **3D terrain** view. **GPS Follow** is a camera/follow mode and reuses the last selected flat or 3D map style:

### OSM

The normal **OSM** mode uses the existing **OpenFreeMap Liberty** vector style based on OpenStreetMap/OpenMapTiles data and is rendered with **MapLibre GL JS**. No map API key is required.

### OSM+ (detailed)

**OSM+** uses the **OpenFreeMap Bright** vector style as a more detailed alternative to the normal Liberty view. It keeps the same OpenStreetMap/OpenMapTiles data basis and MapLibre rendering engine, but shows a denser road and place-name presentation without using the public `tile.openstreetmap.org` raster service. No map API key is required. All Cardata overlays, vehicles, range rings, POIs, clustering and routing remain unchanged when switching between OSM and OSM+.

### Topo

Topographic display based on **OpenTopoMap**.

### Satellite

Satellite mode uses **Esri World Imagery** by default without requiring a Cardata API key. The map displays the required imagery attribution.

### 3D terrain

The **3D** mode keeps the existing MapLibre/OpenFreeMap architecture and adds a real elevation mesh from the public AWS Terrarium elevation tiles. DEM tiles are fetched through Cardata's dedicated `cardata-dem://` MapLibre protocol instead of being requested directly by the renderer. The protocol performs a normal CORS fetch and keeps successfully loaded DEM tiles in a browser-local IndexedDB cache when that storage is available. No additional API key is required. The terrain source uses DEM tiles through zoom 14 for finer mountain geometry and adds a MapLibre hillshade layer from the same elevation source, making ridges, valleys and slope direction visibly easier to read.

A compact 3D control appears on the map while the terrain view is active. **Pitch** can be adjusted from 0° to 75°, **terrain exaggeration** from 1.0× (real elevation ratio) to 3.0× and **rotation/bearing** from 0° to 360°. The defaults remain 50°, 1.5× and north-up (0°). The reset button restores those view defaults. The 3D map can also be rotated directly with MapLibre's normal desktop rotation gesture (right-drag / supported modifier-drag) and with a two-finger rotation gesture on touch devices. Rotation is enabled only while 3D terrain is active; flat map modes remain north-up. Pitch, terrain exaggeration and bearing are stored with the existing map-card browser preferences.

On smaller smartphone screens the full 3D control can be **collapsed** with one tap so it does not permanently cover the map. When collapsed, a small floating **3D** button stays on the map and reopens the full terrain control when needed. This hide/show state is persisted separately from the compass setting.

A small on-map **compass** is shown by default in 3D. It can be hidden or shown from the 3D control, and both the compass itself and the dedicated north button return the view to 0° bearing. The compass visibility preference is persisted separately, so hiding it does not disable manual rotation. The control also shows the current **DEM elevation at the map centre** once terrain data are available. This is a practical runtime check that the elevation model is really active rather than only the OpenFreeMap building extrusions being visible.

The 3D view is intentionally a map-view mode rather than a separate navigation engine: vehicle markers, remaining-range rings, POIs, clustering, route start/waypoint/destination markers and GPS Follow continue to use the same Cardata map data. Leaving 3D returns the actual camera to the normal north-up 2D view while keeping the saved 3D bearing for the next terrain session. If GPS Follow is activated while 3D was the last selected map style, follow continues in the 3D terrain view with the saved pitch, terrain exaggeration and bearing.

A custom HTTPS satellite tile provider can optionally be configured:

```yaml
type: custom:cardata-analytics-map-card
satellite_url: https://tiles.example.com/{z}/{x}/{y}.jpg?key=YOUR_PROVIDER_KEY
satellite_attribution: Imagery © Your provider and its data suppliers
satellite_max_zoom: 19
```

Provider credentials, terms of use and attribution requirements remain the responsibility of the configured provider.

---

## GPS Track History & Explorer

Cardata Analytics can optionally record a dedicated local GPS history for each GPS-capable vehicle. Tracking is **disabled by default** and must be enabled per vehicle from the map card's **Tracking** panel. Track points are stored in Cardata's own local SQLite database under Home Assistant's `.storage` directory; the tracking subsystem does not write to the Home Assistant Recorder database and does not feed Analytics or the Daily Ledger.

The Tracking panel supports a freely selectable **From date/time → To date/time** range, including exact cross-day ranges such as `01.09. 10:00` through `18.09. 12:00`. Quick presets are available for Today, Last 24 hours, Last 7 days and This month. The selected range can be displayed as one **full historical track** while Cardata keeps real GPS gaps as separate track segments instead of drawing artificial straight lines between unrelated positions.

Tracking features include:

- separate recording switch and retention setting per vehicle
- retention options of 30, 90, 180, 365 days or unlimited
- multi-vehicle historical display using Cardata's deterministic vehicle colours
- automatic trip/segment detection based on GPS gaps and plausibility
- trip list with start/end time, distance and point count
- overall distance, trip count, movement duration, average GPS speed and maximum GPS speed
- track colouring by vehicle, GPS speed or recorded SoC
- start/end markers
- historical playback for the selected primary vehicle
- fit the complete selected historical track to the map
- GPX export for the selected primary vehicle and exact selected time range
- optional import of still-available GPS history from Home Assistant Recorder
- deletion of Cardata tracking points for the selected vehicle(s) and selected time range

### Select one trip or the full period

Click a trip in the list to show **only that trip's historical track**. The row is highlighted; start/end markers, the summary, playback and the main GPX button follow this selection. Live vehicle markers, POIs and planned routes remain separate map layers. **Show full track** clears the trip selection and reloads the selected vehicles for the complete From/To period. **Fit track** fits whichever historical track is currently shown.

Single GPS observations remain in the database and in full-period GPX exports, but are not shown as trips, driving tracks or playback stops. The trip list and trip counter both require at least two points. Trip separation still uses the existing GPS-gap/plausibility rules; a short stop does not necessarily separate an outward journey from its return.

The trip list defaults to **Newest first** and can be switched to **Oldest first**. Sorting is saved in this browser and changes only the list, not the chronological track, selection or GPX export.

### Trip SoC and existing Analytics consumption

The selected trip shows **Start SoC**, **End SoC**, **Energy consumed (kWh)** and **Average consumption (kWh/100 km)**. SoC comes from the first/last stored GPS observations, before map simplification. Missing endpoint SoC is shown as unavailable rather than substituted with a value from another time.

Consumption reuses the existing Cardata **total consumed energy** sensor history in Home Assistant Recorder, taking the counter difference between the stored GPS start and end timestamps. Average consumption uses the corresponding existing Cardata **odometer** history, not the GPS polyline distance. The calculation distance is shown alongside the source explanation because it can differ from the GPS distance. Existing entity IDs are resolved through the entity registry, including renamed entities. No new energy recording, battery-capacity estimate or changes to existing Analytics calculations are introduced.

The Daily Ledger stores **daily totals**, not timestamped per-trip allocations. A retained daily total therefore cannot substitute for missing intraday counter history. A missing start state, an unavailable interval, counter reset/correction or a previously repaired SoC day is explicitly marked unavailable; daily corrections are never spread across trips or applied again. Missing/zero odometer distance leaves the average unavailable even when energy is known. The existing Analytics counters themselves retain their original SoC-based calculation and filtering; this is not a new vehicle-side energy measurement.

Trip details are read on selection and require the relevant Analytics sensor history to still exist in Recorder. The separate GPS database may retain tracks longer than that history. Recorder GPS import does not recreate missing Analytics energy history. As with all recorded states, values reflect the available sensor updates at the GPS boundaries; asynchronous or delayed vehicle reports can limit their temporal precision.

### Map legend, scale and playback

- **Show legend** enables a collapsible in-map legend. Its thresholds and colors are shared with the track renderer: SoC bands at 25/50/75%, speed bands at 30/60/100/130 km/h, or colors of the currently displayed vehicles. Missing SoC/speed data are gray rather than treated as zero.
- **Show scale** adds a metric MapLibre scale in the lower-left corner. It follows the map zoom independently of tracking and is optional. Legend and scale preferences are saved in the browser.
- Playback defaults to **Entire selection in 30 s**, with 1-minute/2-minute alternatives and fixed speeds up to **3000×**. A full 24-hour timeline therefore takes 30 seconds with the default setting; pause/resume preserves the current position. The hidden browser tab pauses playback.
- **Skip gaps between trips** is enabled by default. When disabled, the marker waits at the preceding endpoint during the gap. It never animates a fictitious connection between separate trips. Interpolation within a trip is visual only; stored GPS points, statistics and GPX remain unchanged.
- Camera modes are **Free map**, **Follow vehicle – north up**, and **Follow vehicle – heading up**. Following preserves zoom and pitch; heading changes use the shortest angular path and are rate-limited, while stationary observations retain the heading. Manually dragging the map or fitting the track switches to free-map mode. Selecting live vehicle focus stops historical playback so the two cameras cannot compete.

### Live recording and display updates

Enabling **Record GPS tracking** samples the current valid position and then automatically processes changes to the configured latitude/longitude entities, even with the dashboard closed. No Recorder import is required for future recording. Position filters still apply; Cardata cannot record updates that the source integration does not supply.

**Up to now (refresh automatically)** keeps the query end current and refreshes the open Tracking panel approximately every 15 seconds. Quick presets enable this mode. Editing the To field switches to a fixed historical range; old saved ranges stay fixed until you choose a preset or enable this option. Selecting one trip or starting/seeking playback pauses automatic track replacement, including while playback is paused or finished. **Show full track** explicitly reloads the period and resets playback. Background refresh never refits the camera. The displayed recording status and stored counts can also be re-read with **Refresh stored counts**.

The recorder uses conservative point acceptance rules: tiny GPS jitter is suppressed, points are not stored unnecessarily often, very large short-time jumps are rejected, and long gaps start a new segment instead of being connected. A low-frequency stationary heartbeat prevents loss of coverage information without turning the database into a second-by-second log. Long map queries are simplified for rendering while the accepted stored track remains available for GPX export.

### GPX export

GPX files contain standard latitude, longitude and UTC timestamps, plus elevation when present. Cardata also writes optional GPX extensions for SoC, GPS speed and odometer values when those values were available at the recorded point. Separate drive segments are exported as separate `<trkseg>` blocks, so stops and missing-GPS intervals remain explicit.

### Recorder import

The **Recorder import** action can seed Cardata's track database with GPS history that Home Assistant Recorder still retains for the configured latitude/longitude entities. Import is always user-triggered, limited to the selected time range and deduplicated, so importing the same range again does not create duplicate points.

The completion report distinguishes **newly stored**, **already present** and **filtered-out** candidate points. After committing the import, Cardata reads the database again and reports the point count in that import period, including the number originally stored through Recorder import. A zero-new result can mean all accepted points already exist; a separate message identifies a period with no usable Recorder points.

To check persistence later:

1. Reopen Tracking or click **Refresh stored counts**. Each vehicle shows its stored total, separate live/import counts, latest GPS timestamp and latest live timestamp. These figures cover all retained data for that vehicle, not just the selected From/To period. Timestamps describe GPS observations, not the time the import button was clicked.
2. Choose the same historical period and click **Show full track** without importing again. Tracks are now read exclusively from Cardata's database.
3. The same check works after a Home Assistant restart. Imported points remain independent of Recorder history until Cardata retention or an explicit deletion removes them.

Source counts identify how each stored point was first inserted. Importing a point that already exists as a live point does not change its source or count it twice. Import supplies points; trips are derived from those stored points when a period is queried.

### Tracking privacy

Historical GPS data are sensitive location data. Cardata therefore keeps tracking opt-in and local to the Home Assistant installation. No Cardata cloud service is used. GPX export is generated locally on request. Existing external map/POI/navigation services keep their separate behaviour and are not automatically fed the tracking database.

## Multiple vehicles

Every GPS-enabled Cardata vehicle is shown with a deterministic colour that remains stable across devices.

The map provides:

- coloured vehicle markers
- per-vehicle visibility controls
- show/hide all vehicles
- fit all visible vehicles
- focus/follow an individual vehicle
- per-vehicle remaining-range overlay control
- global remaining-range toggle
- fit all visible range areas

Clicking a vehicle marker opens a popup with available vehicle information such as SoC, remaining range, odometer, address and GPS age.

![Cardata vehicle map with multiple vehicles, range rings and vehicle controls](docs/images/vehicle-map.png)

---

## GPS follow and movement information

When **GPS Follow** is active, every new GPS position keeps the selected vehicle centred while preserving the current zoom level.

- zooming does **not** disable Follow
- deliberately panning the map disables Follow
- normal vehicle movement does not hide already loaded vehicle-centred POIs

The map also calculates frontend-only movement information between synchronized GPS updates. Where a valid segment is available, the UI can show:

- average speed between GPS updates
- movement/standstill status
- approximate movement direction/bearing

This value is informational only. It is **not a vehicle speed sensor** and does not affect consumption, remaining range or Analytics calculations.

---

## Remaining-range rings

When a vehicle has a remaining-range source, Cardata can draw a geodesic air-line radius around its current GPS position.

The ring:

- follows vehicle GPS changes
- updates when remaining range changes
- uses the same deterministic colour as the vehicle marker
- can be enabled/disabled per vehicle
- can be shown/hidden globally
- can be included in automatic map fitting

The ring represents an **air-line distance**, not a road-network reachable area. Terrain, road layout, weather, traffic and real-world consumption are not modelled by the circle.

---

# POI 2.0

POI discovery is off by default. Open the **POI** panel and select one or more categories.

## POI search centre

The POI centre can be switched between:

- selected vehicle
- current route destination
- current map centre

## Radius

Available radius choices are:

```text
2 / 5 / 10 / 25 / 50 / 100 / 150 / 200 / 500 / 1000 km
```

Open Charge Map charging searches can use the complete selected radius up to **1000 km**.

General OpenStreetMap/Overpass POIs are protected at a maximum of **200 km**, even if a larger mixed-search radius is selected.

## 57 POI categories

Categories are grouped in the UI:

- **Auto & Mobility:** charging, fuel, workshops, car wash, tyres, car parts, car rental, parking, parking garages, P+R
- **Food & Drink:** restaurants/fast food/food courts, cafés, bakeries, ice cream, bars/pubs, beer gardens
- **Shopping:** supermarkets, convenience stores, shopping centres, chemists/drugstores, beverage stores
- **Health:** pharmacies, hospitals, doctors, dentists, clinics, veterinarians
- **Travel & Stay:** hotels, motels, hostels, campsites, caravan/motorhome sites
- **Roadside:** toilets, drinking water, rest/service areas, picnic sites, showers
- **Finance & Service:** ATMs, banks, post offices, parcel lockers
- **Public Transport & Traffic:** railway stations, bus stations, airports, ferry terminals, taxi ranks
- **Leisure & Sights:** museums, attractions, viewpoints, castles, monuments/memorials, zoos, theme parks, swimming pools
- **Emergency:** police, fire stations, ambulance stations

## General POI text search

The general POI search field filters the already loaded POI dataset locally by information such as name, address, brand, operator and network.

Changing this text **does not trigger an unnecessary new Overpass request**.

## Charging-station filters

Charging POIs support additional filters:

- multiple operators/networks at the same time using OR semantics
- CCS
- Type 2
- CHAdeMO
- Tesla connector tags
- minimum charging-power presets from 50 to 350 kW
- include/exclude stations with unknown power

Known charging operators are displayed with deterministic colours and stable two-character abbreviations on the map.

## POI templates

The template selector contains:

- **Current filters**
- your own global templates

There are no built-in standard POI presets.

Custom templates can store the selected:

- categories
- radius
- general text filter
- charging operators
- connector filter
- minimum power
- unknown-power option
- POI-centre mode

Templates are stored globally in Home Assistant and are therefore available across desktop browsers, tablets, phones and Companion App clients.

![POI 2.0 management with charging-station filters, radius and clustering](docs/images/poi-management.png)

## Clustering and POI popups

Large POI result sets are clustered in MapLibre. Clicking a cluster zooms in; clicking a POI opens its details.

Depending on the source data, a POI popup can include:

- name/category
- address
- straight-line distance
- operator/brand/network
- opening hours
- phone/website
- access/fee information
- capacity
- charging connectors and power
- source/provider attribution

Available popup actions include Google Maps, Navigation and the original OSM object where available. POIs can also be inserted directly into the Cardata route planner.

---

# Route planning

Open the **Route** panel from the map toolbar.

The route **start point is freely selectable**. You can use a GPS-capable Cardata vehicle, the current smartphone/browser location, a globally saved Cardata place, a Home Assistant zone, an address-search result or a point selected directly on the map. This also allows route planning for vehicles that do not provide GPS data.

Saved route templates preserve the selected start type. Vehicle starts always use the vehicle's current GPS position, while smartphone starts request a fresh device location when the template is loaded instead of storing an old phone coordinate.

![Cardata route planning with intermediate stops, address search and map selection](docs/images/route-planning.png)

## Route points

Cardata supports up to **9 ordered intermediate stops internally**.

Intermediate stops can be created from:

- visible POIs
- Open Charge Map charging stations
- address-search results
- free points selected on the map

The final destination can be selected from POIs, an address search, a free map point, saved named destinations or available Home Assistant zones.

Intermediate stops can be reordered or removed.

## Address search

The route planner includes an explicit address/place search. The query is sent to the Cardata backend only when the search is submitted.

Results can be:

- used as the route start
- inserted as the next intermediate stop
- used as the destination
- saved globally as a named destination

## Smartphone and saved-place starts

For vehicles without GPS data, the route planner can request the current browser/smartphone location through the standard device geolocation permission. The location is requested only when you explicitly choose the smartphone start. The UI shows the captured position age and, where available, the browser-reported accuracy.

Globally saved Cardata destinations and Home Assistant zones can also be reused as route starts.

## Free map points

Use the map picker to select an arbitrary point as either:

- the next intermediate stop
- the final destination

On mobile devices the route panel collapses to a compact picker while selecting the point so the map remains usable.

## Named destinations and Home Assistant zones

Named destinations such as **HOME**, **Work** or any custom place can be stored globally, renamed and deleted.

Existing Home Assistant `zone.*` entities are also offered as route targets.

## Global route templates

Complete route plans can be saved as global route templates in Home Assistant and reused from other devices.

## Google Maps handoff

Cardata itself stores and displays up to **9 intermediate stops**.

For Google Maps handoff:

- mobile/iPhone/iPad-safe mode exports the **first 3 intermediate stops**
- desktop mode exports up to **9 intermediate stops**
- from the 4th stop onward Cardata shows a compatibility warning so additional Cardata stops are never silently mistaken for guaranteed mobile Google Maps stops

The **Google Maps** and **Navigation** actions use standard Google Maps URLs. Cardata does not require a Google Maps API key.

Cardata shows route points and air-line distance/range hints but intentionally does not draw a synthetic road route. Google Maps/navigation remains responsible for the actual road route and turn-by-turn navigation.

---

# Address resolution with OpenStreetMap Nominatim

If GPS latitude and longitude are configured, Cardata Analytics can resolve the current vehicle address through the public **OpenStreetMap Nominatim** service.

No Nominatim API key is required.

To reduce external requests, Cardata:

- caches successful address results
- requires approximately 100 metres of movement before another automatic address lookup
- limits each vehicle to at most one automatic lookup every 5 minutes
- serializes Nominatim requests from all Cardata vehicles
- keeps the last successful address during temporary provider or upstream outages

The current-address entity also provides a locally generated Google Maps URL based on the coordinates.

Explicit route address searches use the same backend/rate-limited Nominatim access and are only submitted when the user starts a search.

---

# Persistence and device behaviour

Cardata deliberately separates shared Home Assistant data from browser-local map preferences.

## Stored globally in Home Assistant

- vehicle analytics and daily ledger
- comparison period
- global POI templates
- global route templates
- named route destinations
- Open Charge Map configuration/API key

## Stored locally in the browser/device

The map remembers interface preferences such as:

- map mode
- map centre and zoom
- selected vehicle
- vehicle visibility
- range-overlay visibility
- current unsaved route
- current POI/filter UI state

This allows shared templates and destinations while still letting each phone, tablet or desktop keep its own preferred map view.

---

# Responsive and mobile behaviour

The map card is designed for normal Home Assistant dashboards, narrow dashboard columns, tablets and phones.

- narrow cards switch the map controls to a two-row layout instead of hiding controls horizontally
- mobile POI panels use a single vertically scrollable bottom sheet
- route point picking uses a compact mobile panel
- touch targets are enlarged on phones
- pseudo-fullscreen/fullscreen respects iPhone safe areas so the exit control remains reachable
- the map uses responsive MapLibre controls and clustering for large POI result sets

---

# Localization

Cardata Analytics currently ships complete first-party UI translations for:

- German
- English

The selected Home Assistant language is used for setup, entity display names, both dashboard cards, POI/routing text, notices, dates and number formatting.

Other Home Assistant languages currently fall back to English.

For backward compatibility, the internal raw values of the comparison-period preset select remain the established German tokens. The Cardata cards display the localized labels, so existing automations using those raw values continue to work.

---


# External services and privacy

Vehicle analytics are calculated locally in Home Assistant. Cardata Analytics does not send vehicle analytics to the project developer and does not connect directly to a vehicle manufacturer.

Depending on the features you use, the following external services may receive requests:

| Service | Used for | When data is sent |
|---|---|---|
| OpenFreeMap | Liberty (`OSM`/`3D`) and Bright (`OSM+`) vector base maps | When OSM, OSM+ or 3D mode is used |
| AWS Open Data Terrarium tiles | Elevation mesh and hillshade for the 3D terrain view | Only when 3D mode is used |
| OpenTopoMap | Topographic map | When Topo mode is used |
| Esri World Imagery | Default satellite imagery | When Satellite mode is used |
| OpenStreetMap Nominatim | Reverse geocoding / explicit address search | Only when address functionality is used |
| Public Overpass instances | General OSM POIs | When general POI categories are loaded/refreshed |
| Open Charge Map | Charging-station POIs | When charging POIs are loaded/refreshed and OCM is enabled |
| Google Maps | Maps/navigation | Only when the user opens a generated Google Maps/Navigation link |

The Open Charge Map API key remains in Home Assistant backend configuration and is not exposed as a Lovelace configuration field.

Public map, geocoding, POI and charging services are external services with their own availability, usage policies and data licenses.

---

# Important limitations

- Consumption is **estimated** from SoC changes and usable battery capacity. It is not a direct measurement of traction energy.
- Accuracy depends on the source sensors and their update frequency.
- The remaining-range circle is an air-line visualization, not an isochrone or road-reachable-area calculation.
- Frontend GPS speed is an average between accepted GPS updates and must not be interpreted as vehicle/tachometer speed.
- Cardata's route planner does not calculate a road route itself; Google Maps/navigation does that after handoff.
- Cardata keeps up to nine intermediate stops, but mobile Google Maps URLs only receive the first three in safe mobile mode.
- General OSM POIs depend on public Overpass infrastructure and are intentionally capped at 200 km.
- Open Charge Map and OSM data can be incomplete, outdated or supplied by third parties; always verify critical charging/navigation information before relying on it.
- Historical selected-range coverage starts with the Cardata daily ledger; days that cannot be reconstructed safely remain incomplete instead of being guessed.

---

## Feedback and issues

Feedback, feature requests and bug reports are welcome:

https://github.com/lemuba/cardata-analytics/issues

## License

MIT

Forking, modifying and redistributing Cardata Analytics is **expressly welcome** under the terms of the MIT License. Forks and derivative projects are encouraged as long as the MIT license terms and required copyright/license notice are respected.


## External GPS sources (v0.1.69)

In **Map → Tracking → Manage GPS sources**, an administrator can add, edit or remove reusable location sources. Enter a name, select an existing Home Assistant entity with `latitude`/`longitude` attributes (for example `sensor.example_standort`, a Companion App `device_tracker`, or a `person`), and select the vehicles allowed to use it. Alternatively leave the location entity empty and specify separate latitude/longitude sensors. Sources can be saved while temporarily unavailable; recording waits for a valid fix. The form previews the current coordinates and accuracy.

For a trip, select the phone next to the vehicle and press **Start trip**. Recording runs in Home Assistant, without an open dashboard. Press **End trip** when you park. The last accepted point remains the vehicle's map position; later phone movements are ignored. The position is only as current as the phone's latest accepted update. Existing vehicle GPS can be explicitly restored after ending an external trip by enabling its **Record GPS tracking** checkbox.

There is no configured source-count limit. A source may be assigned to multiple vehicles but can record only one at a time. End its current trip before transferring it. Editing/removing an active source is blocked, and registering the same entity twice is rejected. Removing a source does not delete recorded tracks. Each external session has source provenance and a distinct segment boundary; single points are not shown as trips.

Location data must be no older than 120 seconds; reported accuracy must be at most 100 m when available. Separate coordinate sensors must both be fresh. A recent cached fix may initialize the start position at the time Start trip is pressed. If data is stale or invalid, the session waits for a valid update. Phone location permissions and background updates still determine track coverage; Cardata cannot force the phone to transmit positions.

Source definitions, allowed vehicles, sessions and the last accepted external position are stored centrally in an additive table in the existing tracking SQLite database. Active trips resume with incoming GPS updates after an HA restart. The daily ledger and other v0.1.67 storage mechanisms are unchanged. SoC, odometer and energy analytics continue to come from the vehicle, never from the phone.

The map refreshes external vehicle positions approximately every 15 seconds while visible; historical trip selection/playback is preserved. The recorder import button continues to import the vehicle's configured native GPS history; external sources record only during manually started sessions and do not retrospectively import phone history.
