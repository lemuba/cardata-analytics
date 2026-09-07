# Cardata Analytics

Home Assistant custom integration for vehicle energy and distance analytics based on existing sensor entities.

**Cardata Analytics 0.1.1** is a standalone successor branch based on the proven BMW Cardata Analyse 0.5.5 logic, but it uses its own Home Assistant domain and storage namespace:

- Integration domain: `cardata_analytics`
- Install path: `/config/custom_components/cardata_analytics/`
- Dashboard card: `custom:cardata-analytics-card`
- Storage: `.storage/cardata_analytics.*`

It can therefore run **in parallel** with BMW Cardata Analyse 0.5.5 (`bmw_cardata_analytics`) without sharing config entries, entities or counters.

## Vehicle types

The setup flow offers three vehicle types:

- **BMW i3 120 Ah** – includes the existing i3 120 Ah SoH interpolation from usable HV capacity.
- **BMW iX1** – BMW preset with optional source SoH sensor.
- **BEV** – manufacturer-neutral battery electric vehicle. The vehicle name is freely configurable and no BMW manufacturer is assigned to the Home Assistant device.

For a generic BEV you must provide either a sensor representing the **total usable battery capacity** or a fixed usable capacity in kWh. Do not select a sensor that reports the battery's *current stored energy*, because that would make the consumption calculation incorrect.

## Required source data

Every vehicle needs:

- State of charge (SoC), expected as percent from 0 to 100.
- Odometer / mileage.
- Usable battery capacity: required capacity sensor for the BMW presets; capacity sensor or fixed kWh value for BEV.

Optional:

- Remaining range.
- Source SoH for BMW iX1 and BEV. The i3 preset calculates SoH itself.

Distance source values are normalized from `km`, `mi` or `m` to kilometres. Capacity values are normalized from `kWh`, `Wh` or `MWh` to kWh. A source without a unit is treated as km/kWh for backward compatibility.

## Consumption calculation

Energy consumption is accumulated only when SoC falls:

```text
consumed_kWh = (old_SoC - new_SoC) / 100 × usable_battery_capacity_kWh
```

SoC increases are treated as charging and are not counted as consumption.

Average consumption is:

```text
kWh_per_100km = consumed_kWh / driven_km × 100
```

The integration creates values for today, week, month, year, total energy and a user-selected comparison period. Recorder statistics are used for historical comparison ranges while the current day is added from live counters.

### Historical data coverage

Cardata Analytics never pretends that a requested historical period is complete when the integration did not yet have reliable analytics data. The integration stores when tracking started and considers historical day ranges fully covered from the first complete local day after installation.

When a custom period starts earlier than that, Cardata Analytics:

- calculates the reliable overlap that is actually available,
- exposes `data_complete: false` and coverage metadata on the custom-period sensors, and
- shows a warning in the dashboard card with the date from which complete historical evaluation is available.

If Recorder statistics are unexpectedly missing for an otherwise covered historical period, the custom-period sensors are marked unavailable instead of silently returning a misleading complete result. Long historical ranges (for example two years) therefore work as long as Cardata Analytics long-term statistics actually cover that interval.

## Comparison period

A separate integration-managed device provides shared controls for all configured vehicles:

- Benutzerdefiniert
- Heute
- Letzter Tag (yesterday through today)
- Letzte 7 Tage
- Letzter Monat
- Letztes Jahr

The end date is inclusive.

## Dashboard card

The integration registers its own Home Assistant card. Add a manual card with:

```yaml
type: custom:cardata-analytics-card
```

The card discovers entities through Home Assistant's entity and device registries, so it does not depend on hard-coded entity IDs. It keeps the DOM stable during state updates to avoid the iOS/iPadOS scroll-jump issue that was fixed in the 0.5.5 predecessor.

After installing or updating the integration, a full Home Assistant restart and a hard browser refresh may be required for the frontend module to refresh.

## Manual installation for parallel testing

1. Copy `custom_components/cardata_analytics` to `/config/custom_components/cardata_analytics`.
2. Restart Home Assistant.
3. Go to **Settings → Devices & services → Add integration**.
4. Search for **Cardata Analytics**.
5. Add one or more vehicles.
6. Add `custom:cardata-analytics-card` to a dashboard if desired.

Do **not** replace `/config/custom_components/bmw_cardata_analytics`; both integrations are intentionally separate.

## HACS custom repository

Before publishing the repository, replace the GitHub owner placeholder in `manifest.json`. The helper script does that automatically:

```bash
python tools/set_github_username.py lemuba
```

Then push the repository as:

```text
cardata-analytics
```

For HACS validation, keep GitHub Issues enabled and give the repository a useful description. Recommended topics include `home-assistant`, `hacs`, `ev`, `bev` and `energy`.

To test through HACS before submitting it as a default repository, add your GitHub repository as a **Custom repository** with category **Integration**.

## HACS / Home Assistant validation

The repository includes `.github/workflows/validate.yml` with:

- `hacs/action@main`
- `home-assistant/actions/hassfest@master`

It also includes a local `brand/icon.png`, as required for a HACS integration repository.

## Data and privacy

Cardata Analytics does not communicate with a vehicle manufacturer or external service. It reads source entities already present in Home Assistant and calculates analytics locally. Its manifest therefore uses the Home Assistant IoT class `calculated`.

## Notes and limitations

- The SoC-based energy calculation is an estimate; accuracy depends on the quality and update cadence of the selected source sensors.
- A newly installed vehicle starts its live day/week/month/year counters at installation time. Historical comparison data can only use statistics that exist in Home Assistant's Recorder database.
- The i3 SoH curve is specific to the BMW i3 120 Ah preset and is never applied to generic BEVs.

## License

MIT
