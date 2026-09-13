# Changelog

## 0.1.44

- GPS **Follow** is now continuous: every vehicle GPS update recenters the active MapLibre camera on the followed vehicle while preserving the user's current zoom level. Mouse-wheel/pinch/+/- zoom keeps Follow active; deliberate user panning exits Follow.
- Added global route templates stored in Home Assistant. The current route can be saved, loaded and deleted across desktop, iPhone/iPad and Companion App; route templates keep the selected start vehicle but always use its current live GPS coordinates.
- Added global named destinations stored in Home Assistant. Current/map/POI/address destinations can be saved under arbitrary names such as HOME or Arbeit, renamed and deleted.
- Home Assistant `zone.*` entities are exposed directly as selectable route destinations without duplicating their coordinates into Cardata storage.
- Added explicit address search to the route panel through the Home Assistant backend. User-submitted searches are rate-limited/cached and use Nominatim; search results can be used immediately as a route destination or stored globally under a custom name.
- Existing Google Maps handoff, three-waypoint limit, POI routing, map-picked destination and range hints remain unchanged.
- No Analytics, Daily Ledger, OCM, POI-provider or vehicle/range calculation logic was changed.

## 0.1.43

- Hotfix route map picking after a MapLibre/full-card rebuild: detach and clear the route click handler together with the destroyed map instance so the replacement map always binds a fresh handler.
- Free map clicks in **Ziel auf Karte** mode now set the destination again after Home Assistant/card structure re-renders, while POI layer clicks keep priority and continue to open POI popups instead of creating a free map target.
- No Analytics, Daily Ledger, OCM, POI-provider, range, vehicle-color or Google Maps route-handoff logic was changed.

## 0.1.42

- Added optional route planning to `custom:cardata-analytics-map-card` with a live vehicle GPS position as route origin.
- Added a dedicated responsive route panel with vehicle selection, up to three ordered intermediate stops, map-picked destination, route fit, clear/reset actions and mobile-friendly compact map-pick mode.
- Every visible POI can now be added directly as a route intermediate stop or destination; charging stations therefore work as selectable charging stops without a new provider or API key.
- Route points are rendered as numbered MapLibre markers only. Cardata deliberately does not draw a fake straight-line road route; Google Maps calculates the actual road route when opened.
- Added Google Maps route handoff using origin, destination and ordered waypoints, plus an optional navigation action. Maximum intermediate stops are intentionally limited to three for reliable mobile/iPhone URL handoff.
- Route state is stored locally with the existing map preferences; the route origin always uses the currently available GPS coordinates of the selected vehicle.
- POI popups now show air-line distance plus whether the POI lies inside or outside the vehicle's current air-line range estimate.
- Fixed the map `+` / `−` controls by driving the active MapLibre camera directly instead of relying on the legacy render-state synchronization path. Mouse-wheel and pinch zoom remain unchanged.
- No Analytics, Daily Ledger, Open Charge Map, POI-provider or range-calculation backend logic was changed.

## 0.1.41

- Added deterministic, colorblind-friendly per-vehicle colors shared by vehicle pins, vehicle-panel indicators and range overlays.
- Added optional per-vehicle live remaining-range overlays as geodesic MapLibre polygons, with matching border/fill colors and range labels.
- Range overlays follow every GPS update and automatically shrink/grow when the vehicle range sensor changes.
- Added toolbar controls to toggle all range overlays and fit all enabled range areas.
- Added per-vehicle range toggles and `Alle + Reichweite` fit action in the vehicle panel.
- Added a range toggle to vehicle popups.
- Range overlay visibility is stored locally with the existing map preferences; color assignment is deterministic across devices.
- No Analytics, Daily Ledger, date-range, Open Charge Map or POI-provider logic was changed.

## 0.1.40

- Hotfix: restore `custom:cardata-analytics-card` (the normal multi-vehicle analytics card).
- Remove an accidental POI-template loader call that was inserted into the normal analytics card in 0.1.39; global POI templates remain active only in `custom:cardata-analytics-map-card`.
- No Analytics, Ledger, period, GPS, OCM or POI-provider logic changes.
- Frontend resource/cache-busting filename is now `cardata-analytics-card-0.1.40.js?v=0.1.40`.

## 0.1.39

- Reworked the POI panel into a compact three-zone layout: sticky vehicle/template/category-search controls at the top, a dedicated scrollable category accordion in the middle, and always-available general search/charging/radius/actions/status controls at the bottom.
- Added a responsive mobile bottom-sheet layout for narrow/iPhone-sized dashboards with safe-area padding, 44 px touch targets, compact category chips and one-open-group-at-a-time accordion behavior.
- Added an explicit POI vehicle selector plus crosshair focus action. Selecting a vehicle makes it the POI search center and focuses/zooms the shared MapLibre camera without enabling GPS follow.
- Category groups now start collapsed and display selected/total counts; selected categories are shown as removable compact chips while all 57 POI categories remain available.
- Custom POI templates are now stored globally in Home Assistant `.storage` through dedicated websocket commands, making saved templates available across browsers, iPhone/iPad and Companion App.
- Added one-time migration of existing browser-local custom POI templates to the global backend store with conflict-safe imported names. Current UI/filter state remains local per device.
- Existing MapLibre marker/follow/fullscreen behavior, Open Charge Map provider/cache logic, general POI query logic and analytics/ledger logic remain unchanged.
- Frontend resource/cache-busting filename is now `cardata-analytics-card-0.1.39.js?v=0.1.39`.

## 0.1.38

- Fixed individual vehicle **Follow** / vehicle-focus after the MapLibre camera migration. Follow now drives the MapLibre camera directly with `easeTo()` instead of relying on the legacy center/zoom state synchronization path.
- Added one shared vehicle-focus helper used by the popup **Folgen** button, the vehicle-panel crosshair button and the top-level GPS mode.
- Added a short programmatic-camera guard so a MapLibre camera animation started by Follow cannot be mistaken for manual panning and immediately cancel GPS follow.
- Clicking another vehicle while GPS follow is active now switches follow to that vehicle and recenters/zooms immediately.
- `Alle` / fit-all behavior, MapLibre POI rendering, the 57-category POI catalogue/search, Open Charge Map integration and analytics/ledger logic remain unchanged.
- Frontend resource/cache-busting filename is now `cardata-analytics-card-0.1.38.js?v=0.1.38`.

## 0.1.37

- General POI text search is now purely local on the already loaded category/radius cache. Saved presets such as `Restaurants + Donalds` therefore behave exactly like loading Restaurants first and typing `Donalds` afterwards, without creating a second Overpass request/cache namespace.
- POI network/cache scope is now based on vehicle position, radius and selected categories; charging operator/connector remain server-scoped for efficient OCM queries, while text/minimum-power/unknown-power filters remain local.
- Expanded the selectable POI catalogue to 57 travel-relevant categories across Auto & Mobility, Food & Drink, Shopping, Health, Travel, Roadside, Services, Public Transport, Leisure and Emergency.
- Added collapsible category groups and a category-search field so the expanded POI catalogue remains usable on desktop, iPad and iPhone.
- Existing MapLibre marker/cluster/fullscreen architecture and analytics/ledger logic remain unchanged.
- Frontend resource/cache-busting filename is now `cardata-analytics-card-0.1.37.js?v=0.1.37`.

## 0.1.36

- Fixed **Fit all vehicles** after the MapLibre migration: the toolbar `Alle` action now uses MapLibre `fitBounds()` with panel-aware padding and reliably exits GPS follow before fitting.
- Expanded the **Restaurants** category to OSM `amenity=fast_food` and `amenity=food_court`, so chains such as McDonald's and Burger King are included.
- Improved general POI text search with punctuation/spacing normalization (for example `McDonalds`, `Mc Donalds`, and `McDonald's`) and broader OSM name/brand/cuisine matching.
- Replaced browser-native fullscreen activation with Cardata's persistent CSS fullscreen mode. Opening Google Maps/Navigation in a new tab no longer collapses the dashboard map when returning; Escape still exits fullscreen.
- Fullscreen intent is kept in `sessionStorage` so Home Assistant/WebView lifecycle recreation in the same tab restores the large map.
- Frontend resource/cache-busting filename is now `cardata-analytics-card-0.1.36.js?v=0.1.36`.

## 0.1.35

- Unified all map rendering on **MapLibre**. OpenFreeMap/OSM, OpenTopoMap and Satellite now use the same camera/projection instead of mixing MapLibre with a separate hand-positioned raster/HTML overlay engine.
- Vehicle positions are now geographic MapLibre markers. They stay attached to their latitude/longitude while panning, zooming, GPS-following and switching basemaps.
- POIs are now a clustered MapLibre GeoJSON source. Cluster positions, individual POIs and their selection state move with the map camera instead of being recalculated as independent screen pixels.
- Vehicle and POI popup placement now uses `Map.project()` from the same renderer, eliminating drift between popup anchors and map geometry while the map moves.
- MapLibre now owns mouse/touch panning, wheel zoom and double-click zoom; the previous parallel custom drag calculations are no longer wired to the map.
- Fixed charging filters leaking into normal POIs: the operator/network filter is applied only to charging stations, and the backend no longer sends a charging operator filter to general Overpass queries.
- When **Ladestationen** is manually switched off, Cardata clears the previous charging search text, operator/network, connector, minimum-power and unknown-power settings before querying other POI categories.
- Reorganized the POI panel so general text search and charging-specific operator/network filters are visually separated.
- Open Charge Map integration, persistent OCM reference/area caches, 2–200 km radii, presets, Satellite/Topo/OSM/GPS modes and all Analytics/Daily Ledger/range logic remain intact.
- Frontend resource/cache-busting filename is now `cardata-analytics-card-0.1.35.js?v=0.1.35`.

## 0.1.34

- Reworked the Open Charge Map client for lower payloads and fewer duplicate requests. Cardata now fetches OCM `/referencedata` once, stores a reduced persistent lookup cache, and decodes compact station responses locally.
- OCM POI requests now use `compact=true&verbose=false&includecomments=false` whenever reference data is available, substantially reducing response size for 100–200 km searches.
- Added persistent reference-data caching (7-day fresh TTL, up to 60-day stale fallback). If reference data is unavailable and no usable cache exists, charging searches automatically fall back to a normal non-compact OCM response instead of failing.
- Added OCM area single-flight deduplication across multiple cards and rapid filter changes so identical live area requests share one network task.
- Targeted operator/connector presets now resolve OCM reference IDs and send `operatorid` / `connectiontypeid` to OCM, reducing payloads and avoiding broad-result truncation for searches such as IONITY + CCS at 100–200 km. Broad cached areas can still satisfy narrower filters without a new request.
- Fixed a cache write race where concurrent searches for different vehicles/areas could overwrite each other's persistent OCM area cache.
- OCM station normalization now resolves compact `OperatorID`, `ConnectionTypeID`, `DataProviderID`, `UsageTypeID`, `StatusTypeID` and country IDs through the local reference cache while preserving operator names, CCS/Type 2/CHAdeMO/Tesla detection, power and source attribution.
- Reconfigure/install key validation now uses the small OCM reference endpoint instead of an arbitrary POI query.
- Updated the map footer to correctly identify Open Charge Map as the charging-station provider.
- Frontend resource/cache-busting filename is now `cardata-analytics-card-0.1.34.js?v=0.1.34`.

## 0.1.33

- Replaced the Germany-only BNetzA/AFIR/QLever charging workflow with **Open Charge Map** as the Europe-wide charging-station provider.
- Added Open Charge Map API-key fields to installation and Reconfigure. The key is validated server-side and never sent to Lovelace/browser code.
- Synchronizes the one OCM credential across Cardata Analytics config entries so multi-vehicle setups do not need card-level configuration.
- Added persistent per-area OCM caching under `.storage`: six-hour fresh cache plus up to seven-day stale fallback during provider outages.
- Charging-only searches never call Overpass. General restaurants/fuel/pharmacy/etc. remain on the independent Overpass path.
- Normalizes OCM operator/network, address, provider attribution, CCS/Type 2/CHAdeMO/Tesla connectors, power and capacity into the existing POI model.
- Existing IONITY/Tesla/operator, connector, power and 2–200 km filters remain available without Lovelace edits.
- Frontend resource/cache-busting filename is now `cardata-analytics-card-0.1.33.js?v=0.1.33`.

## 0.1.30

- Reworked EV charging POIs around persistent bulk data instead of per-search public query services. Charging searches now use the open **AFIR / Mobilithek Eco-Movement** DATEX-II publication as the primary source and the monthly **Bundesnetzagentur** charging-register CSV as an independent local fallback.
- Added persistent compressed charging caches under Home Assistant `.storage`. Once a source has been downloaded, 2–200 km radius changes, IONITY/Tesla/operator searches, connector filters and power filters run locally without a new external request for every map interaction.
- Added stale-while-revalidate behavior: an existing charging cache remains usable while a refresh happens in the background. A temporary external outage therefore no longer removes already known charging stations from the map.
- Removed QLever and the token-dependent Bundesnetzagentur ArcGIS/API path from the critical charging workflow. OSM/Overpass is used for charging only as a bounded emergency fallback when neither local charging dataset is available.
- Added DATEX-II AFIR normalization for station/operator, EVSE IDs, CCS/Type 2/CHAdeMO/Tesla connectors, connector power, station power, capacity, address and coordinates. IONITY is also recognized from `DE*IOY*...` EVSE identifiers.
- Added Bundesnetzagentur CSV normalization for the same Cardata charging model, including repeated connector/power/EVSE columns and German decimal-comma values. The current CSV URL is discovered from the official BNetzA page; a dated URL is only a bootstrap fallback.
- The large BNetzA CSV is refreshed in the background and does not block the first map query. AFIR is small enough to be awaited once on a fresh installation; after that both sources are local-cache-first.
- General non-charging POIs continue to use the robust Overpass failover/state-machine path from 0.1.28/0.1.29.
- Kept the existing latest-request-wins loader, watchdog/retry logic, 2–200 km radii, presets/filters, OpenFreeMap/Topo/Satellite/GPS modes and all Analytics/Daily Ledger/range logic unchanged.
- Frontend resource/cache-busting filename is now `cardata-analytics-card-0.1.30.js?v=0.1.30`.

## 0.1.29

## 0.1.28

- Reworked POI loading into an explicit latest-request-wins state machine. A running Home Assistant websocket request is no longer invalidated by repeated HA state updates, GPS refreshes or UI re-renders; only one newest follow-up query is kept when filters/radius/vehicle change mid-request.
- Fixed the race that could leave the POI panel permanently on “POIs werden … geladen” after one or two successful refreshes.
- Added a frontend watchdog so a lost/stalled websocket reply cannot keep the POI UI busy indefinitely.
- Added up to two bounded automatic retries for transient Overpass/network/busy errors while preserving the previous POI markers during refresh.
- Reworked the backend Overpass failover to use one total request deadline instead of giving every fallback server the full timeout; dead endpoints therefore cannot accumulate multi-minute stalls.
- Added endpoint health/cooldown tracking and last-success preference. Temporarily failing/rate-limited public instances are skipped for a cooling period instead of being retried on every request.
- Updated public Overpass fallbacks to current global endpoints, preferring `overpass.private.coffee`, then `overpass-api.de`, with `overpass.osm.jp` and VK Maps as additional fallbacks.
- Added same-query single-flight deduplication in Home Assistant, so multiple open dashboards requesting the same POIs share one Overpass network task instead of duplicating public API load.
- Replaced the old global serialized POI lock with a bounded two-request semaphore plus queue timeout; one slow query can no longer create an unbounded backlog of stale requests.
- POI success status now includes backend duration, making slow/failing requests easier to diagnose.
- Kept the existing **2 / 5 / 10 / 25 / 50 / 100 / 150 / 200 km** radii, presets, filters, OpenFreeMap basemap, Satellite/Topo/GPS modes and all Analytics/Daily Ledger/range logic unchanged.
- Frontend resource/cache-busting filename is now `cardata-analytics-card-0.1.28.js?v=0.1.28`.

## 0.1.27

- Fixed POI refresh semantics: the manual **Aktualisieren** action now bypasses both the browser cache and the Home Assistant in-memory POI cache, so it performs a genuinely fresh Overpass request.
- Added single-flight/coalescing for POI requests in the map card. Filter/radius edits made while an Overpass request is running no longer queue multiple stale backend requests; only the newest requested state is fetched next.
- Free-text POI search is now also narrowed server-side across common OSM name/brand/operator/network/address tags, while the same filter is still applied client-side. This makes targeted searches such as Tesla/IONITY much lighter at larger radii.
- Extended POI radius choices to **2 / 5 / 10 / 25 / 50 / 100 / 150 / 200 km**.
- Increased the automatic vehicle-movement threshold proportionally for large-radius POI searches (up to 20 km) to avoid wasteful re-querying of public Overpass infrastructure.
- POI cache keys now include the free-text search filter, so differently targeted searches cannot reuse an unrelated cached result set.
- Frontend resource/cache-busting filename is now `cardata-analytics-card-0.1.27.js?v=0.1.27`.
- Map providers and the Analytics/Daily Ledger/historical range/GPS calculation logic remain unchanged from 0.1.26.

## 0.1.26

- Replaced the normal **OSM** basemap's direct `tile.openstreetmap.org` requests with the API-key-free **OpenFreeMap Liberty** vector style rendered by MapLibre GL JS, with visible OpenFreeMap/OpenMapTiles/OpenStreetMap attribution.
- MapLibre is loaded lazily only for the OSM mode and reuses an already available global MapLibre instance when another card has loaded it.
- Reworked the remaining raster tile renderer (Topo/Satellite) to reuse already mounted tile images while panning and during GPS follow; only newly exposed edge tiles are requested when crossing a tile boundary.
- Added an explicit cross-origin referrer policy to raster tile image requests.
- Kept OpenTopoMap, Esri World Imagery Satellite, GPS follow, POIs, POI presets/filters and all vehicle/map controls unchanged.
- Frontend resource/cache-busting filename is now `cardata-analytics-card-0.1.26.js?v=0.1.26`.
- Analytics, Daily Ledger, historical range, GPS and vehicle calculation logic remain unchanged.

## 0.1.25

- Added **fuel stations** (`amenity=fuel`) as a selectable POI category.
- Added free-text POI filtering across name/address/brand/operator/network.
- Added operator/network filtering (for example IONITY or Shell); this filter is also sent to the Home Assistant Overpass backend so targeted 50 km searches are narrowed before the result limit.
- Added EV connector filters for CCS, Type 2, CHAdeMO and Tesla connector tags.
- Added minimum charging-power filters (50/100/150/200/300/350 kW) plus an option to include POIs whose charging power is unknown in OSM.
- Added parsing/display of charging output power from common OSM `*:output`, `charging_station:output`, `max_power` and `output` tags.
- Added built-in POI filter presets: all charging stations, ≥100 kW fast charging, IONITY fast charging, fuel stations, food/break and parking/charging.
- Added browser-local custom POI presets that store the complete filter combination and can be saved/overwritten or deleted.
- Bumped the POI browser cache generation so older unfiltered cache entries cannot mask the new filter metadata.
- Frontend resource/cache-busting filename is now `cardata-analytics-card-0.1.25.js?v=0.1.25`.
- Analytics, Daily Ledger, historical range, GPS and vehicle calculation logic remain unchanged.

## 0.1.24

- Hard frontend cache bust: the Lovelace module now uses the new filename `cardata-analytics-card-0.1.24.js`, and storage-mode Lovelace resources matching older Cardata Analytics filenames are automatically replaced/cleaned up.
- POI requests now always use the Home Assistant WebSocket backend; a legacy `overpass_url` setting can no longer silently switch back to browser-direct/CORS-sensitive Overpass requests.
- Corrected both backend and remaining frontend Overpass query builders from `out tags center` to `out center`, preserving latitude/longitude for node POIs while adding centers for ways/relations.
- Empty POI results are not cached.
- Overpass backend fallbacks: `overpass-api.de`, `overpass.kumi.systems`, then `overpass.private.coffee`.
- Added 50 km POI radius and pharmacy matching for both `amenity=pharmacy` and `healthcare=pharmacy` (retained from the previous POI fixes).
- Satellite mode defaults to the API-key-free ArcGIS World Imagery XYZ endpoint used by the supplied Bosch eBike comparison card, with visible source attribution; custom `satellite_url` / `satellite_attribution` can still override it.
- The map header and POI note show frontend version `0.1.24` to make stale-browser-resource problems immediately visible.
- Analytics, Daily Ledger, historical range, vehicle and GPS calculation logic remain unchanged.

## 0.1.23

- Corrected the server-side Overpass query to preserve node coordinates with `out center`.
- Stopped caching empty POI results.
- Added `overpass.kumi.systems` as an additional public Overpass fallback.
- Added a key-free ArcGIS World Imagery satellite default with attribution.

## 0.1.22

- Moved the default POI/Overpass network request from the Lovelace browser/Companion WebView to a Cardata Analytics Home Assistant websocket backend. This avoids browser-side CORS/WebView networking being a prerequisite for POI loading.
- Added a small integration-level in-memory POI cache and serialized Overpass access in addition to the existing browser-local cache.
- Kept the two conservative public Overpass fallbacks (`overpass-api.de`, then `overpass.private.coffee`) on the Home Assistant side and now returns the actual endpoint/error details to the map card.
- Kept explicitly configured custom `overpass_url` values browser-direct instead of proxying arbitrary URLs through Home Assistant.
- Kept the 2/5/10/25/50 km radii and pharmacy matching from 0.1.21.
- Kept analytics, daily-ledger, date-range, GPS and vehicle calculations unchanged.


## 0.1.21

- Fixed POI loading that could remain stuck indefinitely when an Overpass request stalled by adding a bounded client-side request timeout.
- Added a conservative automatic fallback from `overpass-api.de` to the public `overpass.private.coffee` instance when no custom `overpass_url` is configured.
- Added a 50 km POI search radius.
- Expanded pharmacy matching to include both `amenity=pharmacy` and `healthcare=pharmacy`; hospital matching now also accepts `healthcare=hospital`.
- Bumped the local POI cache key so older cached results cannot mask the updated POI matching.
- Kept analytics, daily-ledger, date-range, GPS and vehicle calculations unchanged.

## 0.1.20

- Added the current vehicle address directly to each vehicle section in `custom:cardata-analytics-card`, including GPS freshness and a Google Maps button; the location row stays hidden when GPS/address data is unavailable.
- Added a **Satellite** map mode to `custom:cardata-analytics-map-card` with an explicit, provider-capable HTTPS tile configuration instead of relying on undocumented or unauthenticated commercial imagery endpoints.
- Added card settings for satellite tile URL, required attribution text and maximum zoom.
- Added an opt-in **POI** panel centred on the selected vehicle.
- Added filterable POI categories for EV charging stations, workshops, restaurants, cafés, parking, supermarkets, hotels, pharmacies, hospitals and public toilets.
- Added 2/5/10/25 km POI search radii.
- Added browser-side OpenStreetMap Overpass queries with debounce, a minimum request interval, 429/406 backoff, a 500-result display limit and 15-minute browser-local caching.
- Added automatic marker clustering for dense POI results.
- Added POI popups with category, available address/details, straight-line distance from the selected vehicle and optional opening hours, operator, phone, website, access/fee and charging-connector details when present in OSM.
- Added **Navigation** links using exact POI coordinates in Google Maps directions URLs, plus Google Maps location and OpenStreetMap source links.
- Persist POI filters/radius together with the existing browser-local map preferences.
- Kept the analytics calculations, daily ledger, date-range logic and Nominatim reverse-geocoding behavior unchanged from 0.1.19 apart from the integration/User-Agent version bump.


## 0.1.19

- Added a second Lovelace card: `custom:cardata-analytics-map-card`.
- Automatically discovers every Cardata Analytics vehicle with configured latitude/longitude sensors.
- Added OSM and OpenTopoMap map modes plus a GPS follow mode for the selected vehicle.
- Added plus/minus zoom, drag/touch panning, fullscreen mode and a fullscreen fallback for restricted clients.
- Added per-vehicle visibility controls, show-all/hide-all and automatic fit-to-visible-vehicles.
- Added vehicle marker popups with current address, SoC, remaining range, odometer, GPS freshness and a Google Maps link.
- Added local browser persistence for map mode, zoom, center, selected vehicle and visibility choices.
- Kept the analytics calculations, daily ledger, date-range calculations and Nominatim reverse-geocoding behavior unchanged from 0.1.18 (only the Nominatim User-Agent version string is bumped).
- POI/charging/workshop discovery remains intentionally deferred to a later map release.

## 0.1.18

- Added optional GPS latitude and longitude source sensors for every vehicle type, including generic BEVs and the BMW convenience presets.
- Existing vehicles can add or change GPS sources through the normal Reconfigure flow; latitude and longitude must be configured as a pair.
- Added analytics GPS Latitude and GPS Longitude sensors plus a Current Address sensor when GPS sources are configured.
- Added API-key-free reverse geocoding through OpenStreetMap Nominatim with persistent per-vehicle address caching.
- Added conservative Nominatim request controls: approximately 100 m movement threshold, five-minute per-vehicle minimum interval and a globally serialized >1 second request interval across all Cardata Analytics vehicles.
- A temporary GPS/manufacturer-cloud or Nominatim outage keeps the last successful address available and exposes cache/source health in sensor attributes.
- Added a Google Maps URL attribute generated directly from the current/last-known coordinates; no Google API key is required.
- The existing dashboard card layout is intentionally unchanged in this release; location presentation can be added separately.

## 0.1.17

- Fix the shared comparison-range controller being created more than once when Home Assistant sets up several Cardata Analytics config entries concurrently.
- All vehicle runtimes and the global From/To/preset entities now use the exact same controller instance.
- Date and select platforms now use the controller attached to their own global config entry instead of looking it up again in `hass.data`.
- This fixes selected-period values appearing stuck on one vehicle (for example today's 59 km) while another vehicle remains at 0 km after changing the global range.

## 0.1.16

- Fixed per-vehicle comparison-range coverage so every requested historical calendar day must exist in that vehicle's daily ledger.
- Coverage no longer trusts the stored config-entry/tracking timestamp as proof that historical data exists. This fixes long ranges being shown as complete for some vehicles while another vehicle correctly reported missing history.
- For a range such as 02.09-08.09 with only 07.09 stored, all vehicles now report the range as incomplete and expose no misleading full-range value.
- `historical_days_expected` and `historical_days_covered` now refer to the complete requested historical part of the selected range for every vehicle.
- `coverage_available_from` is derived from the first actually complete daily-ledger entry when available.
- Improved the dashboard warning for missing daily history to show the available-from date and covered/expected historical-day count.

## 0.1.15

- Fix duplicate current-day distance while an odometer source is unavailable.
- If the last valid odometer sample is from an earlier local day, today's Day baseline is rebased to that frozen last-known odometer instead of reusing an older baseline.
- Keeps Week/Month/Year and recovered historical days untouched, so an already recovered historical distance is not counted a second time as today.
- When the manufacturer source returns, new distance automatically accumulates from the frozen current-day baseline.
- Adds diagnostic metadata for an automatic stale-baseline repair.

## 0.1.14

- Added generic historical-day recovery for all BEVs; this is not tied to Renault or any manufacturer.
- If exactly one completed day inside the current week/month/year is missing, incomplete, or stored as an implausible 0/0 while the aggregate counters contain an unassigned residual, Cardata Analytics reconstructs that day deterministically.
- Recovery uses the shortest available aggregate bucket first (week, then month, then year) and never distributes values when two or more days are ambiguous.
- Recovered ledger entries are marked with `source: aggregate_recovery` and `recovered_from` provenance.
- Recovery is retried at startup, after relevant source updates, at midnight, and during the hourly maintenance refresh, allowing a day to be repaired when an upstream cloud integration comes back later.
- Added `daily_history_last_recovery` diagnostics to selected-period sensor attributes.
- Bumped the daily-history schema to version 3 while preserving existing ledger data.


## 0.1.13

- Fixed selected-period values remaining stale while the quick-selection/date control kept keyboard focus.
- The frontend interaction guard now blocks state patches only while a native picker is actually being used, not merely while the control remains focused.
- A committed quick-selection/date change now immediately releases the guard and continues to accept the subsequent vehicle sensor updates.

## 0.1.12

- Reworked selected-period calculation to be synchronous and derived from the current `From`/`To` dates on every sensor snapshot.
- Removed the cached/asynchronous selected-range result path that could leave yesterday's values visible after the date controls changed.
- Completed days still come from the persistent daily ledger; today is added only when today is inside the selected interval.
- This makes `07.09 -> 07.09`, `08.09 -> 08.09`, and `07.09 -> 08.09` deterministic without Recorder timing or stale refresh races.

## 0.1.11

- Fixed the 0.1.10 first-day ledger migration that could persist today's distance/energy under yesterday's date after an upgrade or restart.
- On upgrade, the first completed tracking day is now deterministically repaired from the integration lifetime odometer baseline minus today's distance, and lifetime consumed energy minus today's energy.
- Existing incorrect first-day ledger entries are overwritten when the vehicle started tracking yesterday (for example i3 59 km -> 12 km and Twingo 0 km -> 15 km for 2026-09-07 in the reported test case).
- Added a persistent integration-level `tracking_start_mileage` baseline so the repair remains valid across normal period resets.
- A Home Assistant restart that misses the exact midnight boundary no longer assigns the live startup odometer to the previous day. Such a day is marked incomplete unless it can be reconstructed safely.
- Added `complete` metadata to daily-ledger entries and exclude explicitly incomplete days from full selected-range results.
- Added `daily_history_schema`, `daily_history_last_repair` and `daily_history_last_entry` diagnostics to selected-period sensor attributes.

## 0.1.10

- Replaced custom-range history calculation with a persistent per-vehicle daily ledger.
- Custom date ranges no longer depend on Recorder aggregation timing or hourly statistic boundaries.
- Completed days are archived as exact daily distance and energy totals; the current day still uses live counters.
- Added a one-time migration for installations that started on the previous day, reconstructing yesterday from existing Year/Day distance and lifetime/Day energy counters.
- Preserved long-term statistics sensors for graphs and independent Home Assistant history.
- Added daily-ledger diagnostics to selected-period sensor attributes (`history_backend`, stored day count, first/last stored date).
- Kept the 0.1.9 generation/lock protection against stale range refreshes.

## 0.1.9

- Fixed selected-period values sometimes remaining on the previous date range after changing the comparison dates.
- Replaced the boolean/pending refresh guard with a serialized `asyncio.Lock`, so a range change waits for the current Recorder query and then recalculates the latest range before the service call completes.
- Added a range-generation token so an older Recorder query can never commit its result after a newer range selection, even if the same dates are selected again later.
- Historical completed days are now calculated by summing Home Assistant Recorder hourly `change` rows inside the exact local-calendar interval instead of using a single summary delta.
- This specifically fixes a first-tracking-day edge case where selecting Yesterday could still show Yesterday + Today (for example 71 km instead of 12 km).
- Today's live counters remain separate and are only added when today is actually inside the selected range.
- The global date controller now clears vehicle range results before publishing new date values, preventing a brief new-date/old-value mismatch in the dashboard.
- Kept the persistent last-known odometer fallback introduced in 0.1.8 for temporary manufacturer/cloud outages.

## 0.1.8

- Keep odometer-based analytics usable during temporary manufacturer/cloud outages that expose the configured mileage source as `unavailable`.
- When upgrading while the source is already offline, restore the latest known analytics odometer from existing Recorder statistics when available, so the fallback works immediately after the update.
- Persist the most recently valid normalized odometer value per vehicle and use it as a read-only fallback until the live source returns.
- Today/week/month/year distance sensors no longer collapse to 0 solely because the live odometer source is temporarily unavailable.
- Selected periods that include today continue to calculate with the last known odometer value instead of failing with `source_unavailable`, provided at least one valid odometer sample was seen before the outage.
- The fallback never invents distance: mileage remains frozen at the last valid reading and automatically catches up when the source becomes available again.
- Added diagnostic attributes to the mileage and selected-period sensors: `source_available`, `using_last_known_value` / `using_last_known_mileage`, and the timestamp of the last valid source update.
- If no valid mileage value has ever been available, selected periods containing today still remain unavailable rather than silently assuming 0 km.

## 0.1.7

- Fixed selected-period calculations not updating correctly when switching between Today, Yesterday and multi-day ranges.
- Restored interval-based Recorder aggregation with Home Assistant `statistic_during_period()` for the cumulative mileage and consumed-energy analytics sensors.
- A range covering yesterday and today now uses yesterday's exact Recorder delta plus today's live counters (for example 12 km + 59 km = 71 km).
- A completed historical day such as Yesterday is queried directly from Recorder and no longer depends on a reduced daily-row result.
- Coverage is again evaluated independently from the value calculation: ranges starting before a vehicle's first tracked calendar day remain incomplete and expose only diagnostic partial values.
- Kept stale-query protection so results from an older date selection cannot overwrite the currently selected range.
- Added an error log entry when a selected-period Recorder query fails, making future diagnostics visible in the Home Assistant log.

## 0.1.6

- Reworked custom-period aggregation to use Home Assistant Recorder daily long-term-statistics rows for both cumulative energy and mileage sensors.
- Coverage is now derived from the historical data that actually exists per vehicle, instead of relying on stored config-entry/tracking timestamps.
- A historical calendar day is considered covered only when both energy and mileage statistics exist for that day.
- Fixed incomplete long ranges sometimes showing only today's values (or another recent overlap) as the selected-period result.
- Fixed vehicles with inconsistent legacy tracking timestamps being treated as fully covered for dates before their actual Recorder history.
- Today's selected-period values still come from live counters so the result updates immediately; an unavailable live mileage source now marks a range containing today as incomplete instead of silently using 0 km.
- Added diagnostic coverage attributes: `coverage_available_from`, `historical_days_expected`, and `historical_days_covered`.
- Simplified the dashboard coverage warning so the frontend trusts backend Recorder coverage instead of re-deriving it from tracking timestamps.

## 0.1.5

- Fixed stale selected-period values after changing the shared quick-selection or date range. The range service now waits for all vehicle recalculations to finish before returning.
- Results from an older Recorder query are discarded if the global range changed while that query was running; the card is cleared to an updating state until the new range is ready.
- Incomplete custom ranges no longer expose a partial overlap as if it were the complete selected-period result. The three selected-period sensor states remain unknown (`—` in the card) until the requested range is fully covered.
- Partial overlap results are retained as diagnostic attributes: `partial_distance_km`, `partial_energy_kwh` and `partial_average_consumption`.
- Coverage is evaluated per vehicle at calendar-day granularity: the first day on which tracking started is usable, while any requested day before that vehicle's tracking date marks the range incomplete.
- Coverage metadata remains available even when the selected-period state is unknown, so every affected vehicle can show the warning consistently.
- Added `tracking_started_at` and partial-result attributes to the dashboard state signature so warnings and values update reliably without a full card rebuild.
- Failed Recorder refreshes now clear the previous selected-period result instead of risking stale values from an older range.

## 0.1.4

- Fixed per-vehicle coverage warnings in the dashboard card.
- The card now independently verifies that the selected start date does not predate each vehicle's Analytics tracking start.
- Prevents an affected vehicle from hiding the incomplete-history warning because of stale or delayed custom-period metadata.

## 0.1.3

- Fix custom historical ranges dropping valid driving data from the integration installation day.
- Historical queries now start at the exact per-vehicle Analytics tracking timestamp instead of the following midnight.
- Ranges that start before tracking began still expose `data_complete: false`, but all actually recorded Analytics data is included in the result.
- Improve the dashboard coverage warning so partial ranges show when usable Analytics data starts.

## 0.1.2

- Register the dashboard card as a persistent Lovelace module resource instead of injecting it with `frontend.add_extra_js_url`.
- Fix intermittent `Custom element doesn't exist: cardata-analytics-card` / configuration errors after normal browser or Companion App page reloads.
- Automatically update the resource URL cache-buster to the installed integration version and remove duplicate Cardata Analytics resource entries.
- Keep the existing static frontend path; YAML resource mode is detected and receives a clear log warning instead of being modified.

## 0.1.1

- Added selected-period historical data coverage checks.
- Persist the start of analytics tracking per vehicle.
- Historical custom ranges are conservatively considered fully covered only from the first complete local day after tracking started.
- Requests that reach further back are calculated only for the reliable overlap and exposed as incomplete instead of pretending the full period exists.
- Added coverage metadata to the custom-period sensors (`data_complete`, `coverage_status`, `history_complete_from`, `effective_data_from`).
- Dashboard card now displays a warning when a selected range is only partially covered or Recorder statistics are missing.
- Fixed a duplicated responsive CSS container rule in the dashboard card.

## 0.1.0

- First standalone release of **Cardata Analytics**.
- Standalone Home Assistant domain `cardata_analytics`.
- BMW i3 120 Ah and BMW iX1 presets.
- Manufacturer-neutral `BEV` vehicle type.
- Optional source SoH for iX1 and BEV; BMW i3 120 Ah retains the dedicated interpolated SoH curve.
- SoC-based consumption tracking, distance, energy and average consumption for day/week/month/year.
- Shared comparison period with quick presets including Today.
- Automatic custom dashboard card `custom:cardata-analytics-card`.
- Distance sources in km/mi/m and capacity sources in kWh/Wh/MWh are normalized internally.
- HACS repository structure and validation workflows included.
