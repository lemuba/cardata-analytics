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

For historical periods, Cardata Analytics uses Home Assistant Recorder and long-term statistics where available. If the selected range is only partially covered by recorded analytics data, the custom-period sensors expose coverage information and the dashboard card indicates that the evaluation is incomplete.

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
- Historical analysis can only use data that is available in Home Assistant Recorder / long-term statistics.
- SoH estimation for the BMW i3 120 Ah preset is specific to that preset and is not applied to generic BEVs.

## Feedback and issues

Feedback, feature requests and bug reports are welcome:

https://github.com/lemuba/cardata-analytics/issues

## License

MIT
