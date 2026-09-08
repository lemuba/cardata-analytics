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

## Dashboard card

Cardata Analytics includes its own Lovelace card:

```yaml
type: custom:cardata-analytics-card
```

The card automatically discovers all vehicles and analytics entities created by this integration. No hard-coded entity IDs are required.

It automatically expands when additional vehicles are added and provides:

- Vehicle overview
- SoC and optional SoH
- Remaining range
- Battery capacity
- Odometer
- Total estimated energy consumption
- Today / week / month / year statistics
- Custom comparison-period values
- Shared date and preset controls

The card is registered as a Lovelace module resource automatically when Home Assistant uses storage mode.

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

Cardata Analytics performs its calculations locally in Home Assistant.

It does not send vehicle data to the developer and does not communicate with a vehicle manufacturer or external cloud service on its own. It only reads the source entities that already exist in your Home Assistant instance.

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
