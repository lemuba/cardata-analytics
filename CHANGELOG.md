# Changelog

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
- New Home Assistant domain `cardata_analytics`; can run in parallel with `bmw_cardata_analytics` 0.5.5.
- BMW i3 120 Ah and BMW iX1 presets.
- Manufacturer-neutral `BEV` vehicle type.
- Optional source SoH for iX1 and BEV; BMW i3 120 Ah retains the dedicated interpolated SoH curve.
- SoC-based consumption tracking, distance, energy and average consumption for day/week/month/year.
- Shared comparison period with quick presets including Today.
- Automatic custom dashboard card `custom:cardata-analytics-card`.
- Distance sources in km/mi/m and capacity sources in kWh/Wh/MWh are normalized internally.
- HACS repository structure and validation workflows included.
