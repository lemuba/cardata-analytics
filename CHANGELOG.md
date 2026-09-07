# Changelog

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
