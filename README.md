# Cardata Analytics

Cardata Analytics is a Home Assistant custom integration for analysing battery-electric vehicle data from existing sensor entities.

It tracks distance, estimated energy consumption and average consumption, provides configurable historical comparison periods, and includes an automatic dashboard card for all configured vehicles.

## Features

- Supports multiple battery-electric vehicles (BEVs)
- Manufacturer-neutral **BEV** setup option
- Optional convenience presets for **BMW i3 120 Ah** and **BMW iX1**
- Tracks:
  - State of charge
  - Odometer / mileage
  - Remaining range, if available
  - Usable battery capacity
  - Estimated consumed energy
  - Average consumption in kWh/100 km
  - State of health, if available
  - GPS latitude/longitude, if available
  - Current address via OpenStreetMap Nominatim, if GPS is configured
- Period statistics for:
  - Today
  - Week
  - Month
  - Year
  - Custom comparison period
- Shared comparison-period controls for all configured vehicles
- Long-term statistics support through Home Assistant Recorder
- Automatic Lovelace dashboard card
- Responsive multi-vehicle layout
- Designed to work with HACS

## Requirements

Cardata Analytics does not connect directly to a vehicle or manufacturer service.

The required vehicle data must already exist as sensor entities in Home Assistant, for example through another integration, MQTT, REST, CAN/OBD data, or another data source.

Each vehicle needs:

- **State of charge (SoC)** — expected as a percentage from 0 to 100
- **Odometer / mileage**
- **Usable battery capacity** — either from a sensor or, for a generic BEV, as a fixed value in kWh

Optional source data:

- Remaining range
- State of health (SoH)
- GPS latitude
- GPS longitude

Distance values are normalized from `km`, `mi` or `m` to kilometres.

Capacity values are normalized from `kWh`, `Wh` or `MWh` to kWh.

## Vehicle setup

The setup flow currently offers three vehicle types:

- **BEV** — generic manufacturer-neutral battery-electric vehicle
- **BMW i3 120 Ah** — convenience preset with built-in SoH estimation based on usable battery capacity
- **BMW iX1** — convenience preset with optional source SoH sensor

For most vehicles, use **BEV** and select the available source sensors manually.

For a generic BEV, the vehicle name can be chosen freely. You can either select a sensor that represents the vehicle's **total usable battery capacity** or enter a fixed usable capacity in kWh.

> Do not use a sensor that reports the battery's current stored energy as the usable battery capacity source. The integration needs the vehicle's total usable battery capacity for its consumption calculation.

## Optional GPS and current address

A vehicle can optionally be configured with a **latitude** and **longitude** sensor. Both sensors must be configured together. Existing vehicles can add or change these sources through Home Assistant's **Reconfigure** action for the Cardata Analytics config entry.

When both coordinates are available, Cardata Analytics creates three additional vehicle sensors:

- GPS Latitude
- GPS Longitude
- Current Address

The address is resolved with the public **OpenStreetMap Nominatim** reverse-geocoding service. No API key is required. GPS coordinates are therefore sent to the public Nominatim service when an address lookup is required. Address data is attributed to **© OpenStreetMap contributors**.

To use the public service responsibly, Cardata Analytics caches successful results, only performs a new lookup after the vehicle has moved at least approximately **100 metres**, limits each vehicle to at most one lookup every **5 minutes**, and serializes requests from all configured vehicles with a global interval above one second. A temporary geocoder or vehicle-cloud outage does not delete the last successfully resolved address.

The Current Address sensor exposes additional attributes including structured address details, the last geocoded coordinates and timestamp, and a **Google Maps URL** built directly from the coordinates. Opening this URL does not require a Google Maps API key. The Google Maps link is used by the dashboard cards and can also be used in automations.

Example attribute:

```text
google_maps_url: https://www.google.com/maps/search/?api=1&query=54.0032228%2C9.7693308
```

## Consumption calculation

Cardata Analytics estimates consumed energy from falling SoC values and usable battery capacity:

```text
consumed_kWh = (old_SoC - new_SoC) / 100 × usable_battery_capacity_kWh
```

SoC increases are treated as charging and are not counted as consumption.

Average consumption is calculated as:

```text
kWh_per_100km = consumed_kWh / driven_km × 100
```

The quality of the result depends on the accuracy and update frequency of the source sensors.

## Statistics and comparison periods

Cardata Analytics creates analytics for today, week, month and year, as well as a freely selectable comparison period.

The shared comparison-period device provides these presets:

- Custom
- Today
- Last day
- Last 7 days
- Last month
- Last year

The end date is inclusive.

For reliable custom date ranges, Cardata Analytics stores one compact daily history entry per vehicle and completed local calendar day. Each entry contains only the driven distance and estimated consumed energy for that day. The current day is always read from the live analytics counters.

This means a range covering yesterday and today is calculated as **yesterday's stored daily total + today's live total**, while selecting only yesterday returns only yesterday's stored daily total. The daily ledger is persistent and intentionally small, so it can retain many years of selected-range history without depending on Recorder aggregation timing. Selected-range sensor values are derived from the currently active date controls whenever Home Assistant reads them, so changing the range cannot leave a cached result from the previous selection behind.

The ledger also tracks whether a completed day is trustworthy. If Home Assistant was offline across midnight and the exact day boundary cannot be reconstructed, that day is marked incomplete instead of silently assigning today's odometer value to yesterday.

Cardata Analytics also includes a manufacturer-neutral **historical-day recovery** mechanism. If exactly one completed day in the current week, month or year is missing, incomplete, or conflicts with the still-available aggregate counters, the integration can reconstruct that day from the unassigned aggregate residual. Recovery is deliberately conservative: if two or more days are ambiguous, Cardata Analytics does not guess how the total should be distributed. Recovered entries keep provenance metadata so the repair remains transparent.

Home Assistant long-term statistics are still generated by the cumulative analytics sensors and remain available independently for graphs, statistics cards and other Home Assistant history features.

### Temporary source outages

If the configured odometer source temporarily becomes `unavailable` (for example during a manufacturer server outage), Cardata Analytics keeps the **last valid odometer value** and continues using it until the source returns. This prevents current distance and selected-period analytics from disappearing simply because the upstream service is temporarily offline.

The fallback does not estimate or invent missing driving distance. The odometer is frozen at the last valid reading during the outage and catches up automatically when a new valid source value arrives. The mileage sensor exposes diagnostic attributes showing whether the live source is available and whether a last-known value is currently being used.

When the upstream source later provides enough aggregate evidence to identify exactly one affected historical day, the historical-day recovery described above can repair that ledger entry. If the outage leaves more than one day ambiguous, or the manufacturer never reports enough information to derive the missing values safely, those days remain incomplete rather than being guessed.

Coverage is evaluated separately for each vehicle from the vehicle's actual daily ledger. Every historical calendar day requested by the selected range must exist as a complete ledger entry; a config-entry or tracking timestamp alone is not treated as proof that historical data exists. If any requested historical day is missing, the dashboard does **not** present the available overlap as the result for the whole requested range. The selected-period values are shown as unavailable (`—`) and the card displays a per-vehicle coverage warning including the number of covered historical days. Any calculable overlap is retained only as diagnostic sensor attributes (`partial_distance_km`, `partial_energy_kwh`, `partial_average_consumption`).

## Dashboard cards

Cardata Analytics includes two Lovelace cards. Both are registered from the same frontend module and automatically discover Cardata Analytics vehicles, so no hard-coded entity IDs are required.

### Analytics card

```yaml
type: custom:cardata-analytics-card
```

The analytics card automatically expands when additional vehicles are added and provides:

- Vehicle overview
- SoC and optional SoH
- Remaining range
- Battery capacity
- Odometer
- Total estimated energy consumption
- Today / week / month / year statistics
- Custom comparison-period values
- Shared date and preset controls
- Current vehicle address when GPS is configured
- **Google Maps** button next to the current address
- GPS location freshness such as “Standort vor 8 Min. aktualisiert”
- No empty/error location row when GPS/address data is unavailable

### Vehicle map card

Version 0.1.48 is the current separate interactive vehicle map:


### Vehicle colors and remaining-range overlays

- Every vehicle gets a deterministic, stable color derived from its Home Assistant device ID. The same vehicle therefore keeps the same color on desktop, iPhone and iPad.
- The vehicle pin, vehicle-panel color indicator and remaining-range overlay use the same color.
- Remaining range is drawn as a geodesic air-line radius around the live GPS position. It follows GPS changes and shrinks/grows whenever the range sensor changes.
- Range overlays can be enabled per vehicle, toggled globally from the map toolbar, and fitted with the `Bereich` / `Alle + Reichweite` actions.
- Range circles are a visual air-line estimate, not a street-routing reachable-area calculation.

### Route planning and Google Maps handoff

- The **Route** toolbar button opens the route planner. The origin is always the current GPS position of the selected Cardata vehicle.
- Any currently visible POI can be added as an intermediate stop or destination. This includes Open Charge Map charging stations.
- Up to nine ordered intermediate stops are supported internally. Stops can be moved up/down or removed; from the 4th stop onward the UI warns that mobile Google Maps handoff uses only the first three stops.
- Free points on the MapLibre map can be selected either as the next intermediate stop or as the final destination; on phones the route panel collapses to a compact picker while choosing the point.
- Route templates can be saved globally in Home Assistant, reloaded on any device and deleted again. The stored template keeps the chosen start vehicle but never freezes its old coordinates.
- Named destinations such as **HOME**, **Arbeit** or arbitrary custom places are stored globally, can be renamed/deleted, and can be inserted into a route. Existing Home Assistant `zone.*` entities are also offered as route targets.
- An explicit address search is available in the route panel. The query is sent through the Home Assistant backend to Nominatim only when the user submits it; results can be inserted as an intermediate stop, used as the final destination, or saved globally under a custom name.
- Cardata renders numbered route-point markers and can fit them together with the start vehicle, but intentionally does not draw a synthetic road line.
- **Google Maps** and **Navigation** hand off origin, destination and ordered waypoints through standard Google Maps URLs; no Google API key is required by Cardata.
- Air-line distance and remaining-range comparisons are guidance only. The actual road route and reachability are determined by Google Maps/navigation.

```yaml
type: custom:cardata-analytics-map-card
title: Cardata Vehicle Map
height: 520
```

The map automatically includes every configured vehicle that has Cardata Analytics latitude and longitude sensors. It provides:

- **OpenFreeMap Liberty street-map mode based on OpenStreetMap data**, rendered with MapLibre and requiring no API key
- OpenTopoMap topographic mode
- **Satellite** mode with API-key-free Esri World Imagery by default plus an optional provider-capable HTTPS override
- GPS follow mode, which continuously recenters the map on every GPS update while preserving the chosen zoom; deliberate panning exits Follow, zooming does not
- Plus/minus zoom controls and mouse/touch panning
- Fullscreen button with a CSS fullscreen fallback for clients where the browser Fullscreen API is unavailable, including iPhone safe-area handling so the exit control remains reachable
- Show/hide controls for every configured vehicle
- **Show all / hide all** vehicle controls
- **Fit all visible vehicles** button
- Deterministic per-vehicle colors shared by pins and range overlays
- Optional live remaining-range rings per vehicle plus global range toggle and **fit range areas** action
- Clickable vehicle markers with address, SoC, remaining range, odometer and GPS-age information
- **Follow** action for an individual vehicle
- **Google Maps** link from the vehicle popup
- Optional **Route** planner with a live vehicle position as origin, up to nine ordered intermediate stops from POIs/addresses/free map points, POI/map/address/saved-zone destinations, global route templates and device-aware Google Maps handoff/navigation (3 stops on mobile, up to 9 on desktop)
- Route POI popups include an air-line distance/range hint; Google Maps remains responsible for the actual street route
- Browser-local persistence for map mode, zoom, center, selected vehicle, vehicle visibility, range-overlay visibility, current route and current POI UI/filter state; custom POI templates, route templates and named destinations are stored globally in Home Assistant
- POI 2.0 templates list only **Aktuelle Filter** plus custom global templates; built-in standard presets are no longer injected
- Charging filters can combine multiple operators/networks and store that combination in a global POI template
- Charging markers are colored deterministically by operator/network and show stable two-character labels; MapLibre clustering is tuned for large station sets
- POI radius choices extend to 500/1000 km for Open Charge Map; general Overpass categories are protected at the existing 200-km maximum
- POI search center can be the selected vehicle, the current route destination or the current MapLibre map center

From **0.1.36**, OpenFreeMap, Topo and Satellite all run through the same MapLibre camera. The 0.1.36 map additionally uses MapLibre `fitBounds()` for the **Alle** vehicle action and Cardata CSS fullscreen so external navigation tabs do not collapse the large dashboard map when returning. Vehicle markers are MapLibre geographic markers and POIs are a clustered MapLibre GeoJSON source. Panning/zooming therefore moves basemap, vehicle positions, POIs and open popups in one projection instead of synchronizing independent HTML pixel overlays.

Version **0.1.37** expanded the POI catalogue/search layer to 57 grouped categories. Version **0.1.38** fixed individual vehicle Follow/focus. Version **0.1.39** makes the POI panel responsive/mobile-first, adds a vehicle selector with map focus, and stores custom POI templates globally in Home Assistant with one-time migration from older browser-local templates. Version **0.1.40** restored the normal multi-vehicle analytics card after a frontend regression. Version **0.1.41** adds stable per-vehicle colors, color-matched live remaining-range overlays, per-vehicle/global range toggles, and fit-to-range support. Version **0.1.42** adds local route planning with the selected vehicle as live GPS origin, up to three POI intermediate stops, a map-selected destination, Google Maps handoff/navigation and direct MapLibre `+` / `−` zoom control. Version **0.1.43** fixes free map destination picking after a MapLibre/full-card rebuild. Version **0.1.44** adds continuous GPS Follow plus global route templates, named destinations, Home Assistant zone targets and explicit address search. Version **0.1.45** introduces POI 2.0: only current/custom global templates, multi-operator charging filters, deterministic operator-colored charging markers with abbreviations, OCM radii up to 1000 km with a 200-km Overpass safety cap, more aggressive clustering and selectable POI centers (vehicle, route destination or map center). Version **0.1.46** keeps vehicle-centered POIs visible across normal GPS movement and during threshold-triggered refreshes, preventing the POI layer from disappearing while driving or planning a route. Version **0.1.47** improves iPhone fullscreen/safe-area behavior, makes the complete mobile POI sheet vertically scrollable, and lets address results or free map points be inserted as intermediate stops. Version **0.1.48** raises Cardata route planning to nine internal intermediate stops and keeps all nine in templates/map state; Google Maps handoff uses a safe three-stop limit on mobile devices and up to nine on desktop, with an explicit warning from the fourth stop onward.

`height` is optional and is specified in pixels. The default is `520`.

#### Satellite layer

The card includes a **Satellite** mode that works without an API key by default using Esri World Imagery, matching the proven approach in the Bosch eBike map card supplied during development. The map displays the imagery attribution (Esri, Maxar, Earthstar Geographics and GIS User Community). This is an Esri service, not an OpenStreetMap satellite service, and remains subject to Esri's service/usage terms. A different provider can still be configured with `satellite_url`, `satellite_attribution` and optional `satellite_max_zoom`.

No Lovelace configuration is required for the default Satellite layer:

```yaml
type: custom:cardata-analytics-map-card
```

Optionally, the default can be replaced by another provider:

```yaml
type: custom:cardata-analytics-map-card
satellite_url: https://tiles.example.com/{z}/{x}/{y}.jpg?key=YOUR_PROVIDER_KEY
satellite_attribution: Imagery © Your provider and its data suppliers
satellite_max_zoom: 19
```

For a custom provider, `satellite_url` must be HTTPS and contain `{z}`, `{x}` and `{y}` placeholders, and `satellite_attribution` is required. If a partial/invalid custom configuration is supplied, Satellite mode shows a clear configuration message. Provider access credentials, permitted use and exact attribution remain the responsibility of the configured provider/account.

#### Nearby POIs

POI discovery is **off by default**. Open the **POIs** control in the map and enable one or more categories. The POI centre can be the currently selected vehicle, the current route destination or the current MapLibre map centre. Radius choices are **2 km, 5 km, 10 km, 25 km, 50 km, 100 km, 150 km, 200 km, 500 km and 1000 km**. Open Charge Map charging searches can use the full selected radius; general OSM/Overpass categories are protected at **200 km** even in a mixed search.

Available POI categories in 0.1.37+ are grouped in the UI and can be searched by category name:

- **Auto & Mobility:** EV charging, fuel, workshops, car wash, tyre service, car parts, car rental, parking, parking garages, P+R
- **Food & Drink:** restaurants/fast food/food courts, cafés, bakeries, ice cream, bars/pubs, beer gardens
- **Shopping:** supermarkets, convenience stores, shopping centres, chemists/drugstores, beverage stores
- **Health:** pharmacies, hospitals, doctors, dentists, clinics, veterinarians
- **Travel & Stay:** hotels, motels, hostels, campsites, caravan/motorhome sites
- **Roadside:** toilets, drinking water, rest/service areas, picnic sites, showers
- **Finance & Service:** ATMs, banks, post offices, parcel lockers
- **Public Transport & Traffic:** railway stations, bus stations, airports, ferry terminals, taxi ranks
- **Leisure & Sights:** museums, attractions, viewpoints, castles, monuments/memorials, zoos, theme parks, swimming pools
- **Emergency:** police, fire stations, ambulance stations

POI filters in 0.1.37+ can be combined freely. In addition to category and radius, the panel supports:

- a general free-text POI search across name, address, brand, operator and network
- multiple charging-only operator/network filters at the same time, for example `IONITY` + `EnBW` + `Tesla` (OR semantics)
- charging connector filters for CCS, Type 2, CHAdeMO and Tesla connector tags
- minimum charging power presets from 50 to 350 kW from normalized Open Charge Map connector data
- an option to include or exclude charging sites whose power is unknown
- only **Aktuelle Filter** plus user-defined global POI templates; the former built-in standard presets are no longer injected
- user-defined templates that can be saved, overwritten and deleted globally in Home Assistant, including operator combinations and POI-centre mode

When **Ladestationen** is switched off manually, Cardata clears the charging-specific operator/network, connector, power and unknown-power filters and also clears the previous charging text search. The operator/network filter is never applied to normal cafés, restaurants, fuel stations or other general POIs.

Custom templates store the selected categories, radius, general text filter, charging-operator combination, connector, minimum power, unknown-power option and POI-centre mode. From **0.1.39** they are persisted integration-wide in Home Assistant `.storage`, so the same templates are available on desktop, iPad, iPhone and Companion App. Older browser-local presets are migrated once when the backend becomes available, and v0.1.44 single-operator templates remain compatible. General free-text search is applied locally to the already loaded category/radius dataset, so changing the search text reuses the same cache and does not trigger another Overpass request.

General non-charging POIs are queried from OpenStreetMap through public Overpass instances only after POI filters are enabled. The Lovelace card sends the request to Cardata Analytics over Home Assistant's websocket connection and Home Assistant performs the external query, so browser CORS/Companion WebView networking is not a prerequisite. The latest-request-wins state machine, watchdog, bounded retries, same-query single-flight deduplication, endpoint cooldowns and manual **Aktualisieren** cache bypass remain in place. Very broad 100–200 km searches still benefit from the local general text filter without causing an additional Overpass request.

From **0.1.33**, EV charging searches use **Open Charge Map** as the Europe-wide charging provider. The API key is requested in the Cardata Analytics installation/reconfigure flow and is stored only in the Home Assistant backend; no API key, provider URL or other charging configuration is required in Lovelace. Charging-only searches do not use Overpass, BNetzA, QLever or AFIR.

Cardata normalizes the Open Charge Map station model into the existing POI model, including operator/network, address, connector types, charging power, capacity, status and provider attribution where supplied. Charging searches support combined operator filters, deterministic operator-colored marker labels, connector/minimum-power filters and radii up to **500 / 1000 km** without additional Lovelace configuration.

Open Charge Map area responses are persisted under Home Assistant `.storage` for six hours and may be reused as a stale fallback for up to seven days if the provider is temporarily unavailable. Filter changes within a cached area are therefore local and do not trigger another provider request. Manual **Aktualisieren** bypasses the fresh cache and requests a new Open Charge Map area. Public Overpass failures affect only general non-charging POIs.

For installations that prefer another Overpass provider or a self-hosted endpoint, the map card also accepts optional advanced settings:

```yaml
type: custom:cardata-analytics-map-card
overpass_url: https://overpass-api.de/api/interpreter
poi_cache_minutes: 15
poi_max_results: 500
poi_request_timeout_seconds: 35
```

`overpass_url` must use HTTPS. It affects **general OSM POIs only**. When omitted, Home Assistant uses its built-in public Overpass failover list. Charging searches use Open Charge Map and do not fall back to Overpass. `overpass_url` is retained for backwards-compatible/advanced configuration; `poi_cache_minutes` is clamped to 5–120 minutes, `poi_max_results` to 50–1000, and `poi_request_timeout_seconds` to 15–90 seconds.

Nearby POIs are clustered automatically when several markers overlap at the current zoom level. Clicking a cluster zooms further in. Clicking an individual POI shows its category, available OSM address/details and straight-line distance from the selected vehicle. When present in OSM, the popup also includes opening hours, operator/brand, phone, website, access/fee information, capacity and charging-connector tags.

Every POI popup offers:

- **Navigation** — opens a Google Maps directions URL with the exact POI coordinates as the destination
- **Google Maps** — opens the exact POI location
- **OSM** — opens the original OpenStreetMap object when its OSM type/id is available

Google Maps URLs do not require a Google API key. On iOS/Android, the universal Google Maps link can open the installed Google Maps app; otherwise it opens in a browser.

The **OSM** button no longer accesses the donation-funded `tile.openstreetmap.org` application tile service. From 0.1.26 it uses the API-key-free **OpenFreeMap Liberty** vector style rendered in the browser with MapLibre GL JS. OpenFreeMap is based on OpenStreetMap/OpenMapTiles data and its required attribution is displayed on the map. The **Topo** layer continues to use OpenTopoMap, and POI queries continue to run through the Home Assistant backend. Public map/POI services remain best-effort and can change availability.

Topo and Satellite remain on the lightweight raster renderer. From 0.1.26 that renderer reuses already mounted tile elements while panning and during GPS follow, so crossing a tile boundary requests only newly exposed edge tiles instead of rebuilding the full visible tile grid.

The cards are registered as a Lovelace module resource automatically when Home Assistant uses storage mode.

After installing or updating the integration, restart Home Assistant. A normal browser or Companion App reload should then be sufficient.

## Installation with HACS

### Custom repository

Until Cardata Analytics is available in the default HACS repository list, add it as a custom repository:

1. Open **HACS** in Home Assistant.
2. Open the menu and select **Custom repositories**.
3. Add:

   ```text
   https://github.com/lemuba/cardata-analytics
   ```

4. Select category **Integration**.
5. Install **Cardata Analytics**.
6. Restart Home Assistant.
7. Go to **Settings → Devices & services → Add integration**.
8. Search for **Cardata Analytics**.

## Manual installation

1. Copy:

   ```text
   custom_components/cardata_analytics
   ```

   to:

   ```text
   /config/custom_components/cardata_analytics
   ```

2. Restart Home Assistant.
3. Go to **Settings → Devices & services → Add integration**.
4. Search for **Cardata Analytics**.
5. Add one or more vehicles.
6. Add the dashboard card if desired:

   ```yaml
   type: custom:cardata-analytics-card
   ```

## Data and privacy

Cardata Analytics performs its vehicle analytics calculations locally in Home Assistant and does not send data to the developer. It does not connect to a vehicle manufacturer directly; it only reads the source entities that already exist in your Home Assistant instance.

If optional GPS latitude/longitude sources are configured, the integration sends the current coordinates to the public **OpenStreetMap Nominatim** service only when a reverse-geocoding lookup is required. Successful address results are cached locally in Home Assistant to minimize external requests. From 0.1.44, the route panel can also send a user-entered address/placename to Nominatim when the user explicitly submits an address search; these searches share the same backend rate limiter and are cached in memory. If GPS sources are not configured and no address search is submitted, Cardata Analytics makes no Nominatim requests.

The Google Maps URL is generated locally from the coordinates. Generating the link itself makes no Google request; Google receives the coordinates only when a user opens the link.

## Limitations

- Energy consumption is estimated from SoC changes and usable battery capacity; it is not a direct measurement of traction energy.
- Accuracy depends on the precision and update frequency of the source sensors.
- Custom-range history is available from the date Cardata Analytics starts maintaining its daily ledger. Upgrade migration can reconstruct the immediately preceding tracked day when unambiguous; older pre-ledger days may remain unavailable.
- SoH estimation for the BMW i3 120 Ah preset is specific to that preset and is not applied to generic BEVs.

## Feedback and issues

Feedback, feature requests and bug reports are welcome:

https://github.com/lemuba/cardata-analytics/issues

## License

MIT


### Temporary odometer outages

If a vehicle cloud temporarily stops providing a live odometer value, Cardata Analytics keeps the last valid odometer as a frozen fallback. A last-known value from a previous calendar day is used as the current day's baseline, so historical distance is not counted again as today's distance. When the source returns, new distance accumulates from that frozen baseline. No distance is invented while the source is offline.


### Open Charge Map (v0.1.34+)

Version 0.1.34+ keeps the v0.1.34 OCM `/referencedata` lookup-table cache (operators, connection types, status/usage types and data providers) and requests charging locations with `compact=true&verbose=false`. The compact numeric IDs are decoded locally. If reference data cannot be refreshed, a still-valid stale reference cache is used; if no reference cache exists at all, Cardata falls back to a normal non-compact OCM response rather than failing the charging search. Identical area requests are single-flight deduplicated across cards and rapid filter changes.
Targeted operator/connector presets (for example **IONITY + CCS**) are also narrowed server-side using OCM reference IDs, while power/text filtering remains local. This keeps 100–200 km searches smaller and reduces the risk of hitting broad result limits. A broader cached area may still be reused for narrower filters.


Cardata Analytics nutzt Open Charge Map als europaweite Quelle für Ladestationen. Der API-Key wird beim Einrichten bzw. Neu-Konfigurieren der Integration abgefragt und bleibt im Home-Assistant-Backend. Die Lovelace-Karte benötigt keinen API-Key und keine Provider-URL. Ladestationsdaten werden gebietsweise persistent gecacht, sodass temporäre Provider-Ausfälle mit dem zuletzt erfolgreichen Datenbestand überbrückt werden können.
