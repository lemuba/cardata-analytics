# Changelog

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
