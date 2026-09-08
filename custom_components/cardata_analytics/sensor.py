"""Sensor platform for Cardata Analytics."""

from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Callable

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import PERCENTAGE, UnitOfEnergy, UnitOfLength
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import slugify

from .const import (
    DOMAIN,
    SIGNAL_UPDATE,
    SOH_POINTS,
    VEHICLE_GENERIC_BEV,
    VEHICLE_I3_120,
    VEHICLE_IX1,
)
from .runtime import VehicleRuntime, VehicleSnapshot


@dataclass(frozen=True, kw_only=True)
class CardataAnalyticsSensorDescription:
    """Description of one analytics sensor."""

    key: str
    name: str
    value_fn: Callable[[VehicleSnapshot], float | None]
    unit: str | None = None
    device_class: SensorDeviceClass | None = None
    state_class: SensorStateClass | None = None
    icon: str | None = None
    custom_period: bool = False


def _avg(snapshot: VehicleSnapshot, period: str) -> float:
    km = snapshot.period_km[period]
    if km <= 0:
        return 0.0
    return round(snapshot.period_kwh[period] / km * 100.0, 1)


def _soh(capacity: float | None) -> float | None:
    """Interpolate i3 120 Ah SoH and always round upward to one decimal."""
    if capacity is None:
        return None
    energy = round(capacity, 1)
    if energy < SOH_POINTS[0][0]:
        return None
    if energy >= SOH_POINTS[-1][0]:
        return 100.0

    for (x1, y1), (x2, y2) in zip(SOH_POINTS, SOH_POINTS[1:]):
        if x1 <= energy <= x2:
            raw = y1 + ((energy - x1) / (x2 - x1)) * (y2 - y1)
            return math.ceil(raw * 10.0 - 1e-9) / 10.0
    return None


BASE_SENSORS = [
    CardataAnalyticsSensorDescription(
        key="soc",
        name="Ladezustand",
        unit=PERCENTAGE,
        device_class=SensorDeviceClass.BATTERY,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda s: s.soc,
        icon="mdi:battery",
    ),
    CardataAnalyticsSensorDescription(
        key="mileage",
        name="Kilometerstand",
        unit=UnitOfLength.KILOMETERS,
        device_class=SensorDeviceClass.DISTANCE,
        state_class=SensorStateClass.TOTAL_INCREASING,
        value_fn=lambda s: s.mileage,
        icon="mdi:counter",
    ),
    CardataAnalyticsSensorDescription(
        key="battery_capacity",
        name="Nutzbare Batteriekapazität",
        unit=UnitOfEnergy.KILO_WATT_HOUR,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda s: None if s.battery_capacity is None else round(s.battery_capacity, 2),
        icon="mdi:battery-high",
    ),
    CardataAnalyticsSensorDescription(
        key="energy_consumed_total",
        name="Verbrauchte Energie gesamt",
        unit=UnitOfEnergy.KILO_WATT_HOUR,
        device_class=SensorDeviceClass.ENERGY,
        state_class=SensorStateClass.TOTAL_INCREASING,
        value_fn=lambda s: round(s.total_kwh, 2),
        icon="mdi:counter",
    ),
]

for _period, _title in (("day", "Heute"), ("week", "Woche"), ("month", "Monat"), ("year", "Jahr")):
    BASE_SENSORS.extend(
        [
            CardataAnalyticsSensorDescription(
                key=f"energy_{_period}",
                name=f"Verbrauchte Energie {_title}",
                unit=UnitOfEnergy.KILO_WATT_HOUR,
                device_class=SensorDeviceClass.ENERGY,
                state_class=SensorStateClass.TOTAL_INCREASING,
                value_fn=lambda s, p=_period: round(s.period_kwh[p], 2),
                icon="mdi:battery-arrow-down",
            ),
            CardataAnalyticsSensorDescription(
                key=f"distance_{_period}",
                name=f"Fahrstrecke {_title}",
                unit=UnitOfLength.KILOMETERS,
                device_class=SensorDeviceClass.DISTANCE,
                state_class=SensorStateClass.TOTAL_INCREASING,
                value_fn=lambda s, p=_period: round(s.period_km[p], 1),
                icon="mdi:road-variant",
            ),
            CardataAnalyticsSensorDescription(
                key=f"average_consumption_{_period}",
                name=f"Durchschnittsverbrauch {_title}",
                unit="kWh/100 km",
                state_class=SensorStateClass.MEASUREMENT,
                value_fn=lambda s, p=_period: _avg(s, p),
                icon="mdi:gauge",
            ),
        ]
    )

CUSTOM_SENSORS = [
    CardataAnalyticsSensorDescription(
        key="custom_energy",
        name="Verbrauchte Energie Zeitraum",
        unit=UnitOfEnergy.KILO_WATT_HOUR,
        device_class=SensorDeviceClass.ENERGY,
        # Deliberately no state_class: this value changes when the user changes
        # the selected dates and must not itself be treated as an accumulating meter.
        value_fn=lambda s: None if s.custom_kwh is None else round(s.custom_kwh, 2),
        icon="mdi:calendar-arrow-right",
        custom_period=True,
    ),
    CardataAnalyticsSensorDescription(
        key="custom_distance",
        name="Fahrstrecke Zeitraum",
        unit=UnitOfLength.KILOMETERS,
        device_class=SensorDeviceClass.DISTANCE,
        value_fn=lambda s: None if s.custom_km is None else round(s.custom_km, 1),
        icon="mdi:map-clock-outline",
        custom_period=True,
    ),
    CardataAnalyticsSensorDescription(
        key="custom_average_consumption",
        name="Durchschnittsverbrauch Zeitraum",
        unit="kWh/100 km",
        value_fn=lambda s: None if s.custom_avg is None else round(s.custom_avg, 1),
        icon="mdi:gauge",
        custom_period=True,
    ),
]


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up sensors for one configured vehicle."""
    runtime: VehicleRuntime = entry.runtime_data
    descriptions = list(BASE_SENSORS)

    vehicle_type = entry.data.get("vehicle_type")

    if vehicle_type == VEHICLE_I3_120:
        descriptions.append(
            CardataAnalyticsSensorDescription(
                key="soh",
                name="Batteriezustand SoH",
                unit=PERCENTAGE,
                device_class=SensorDeviceClass.BATTERY,
                state_class=SensorStateClass.MEASUREMENT,
                value_fn=lambda s: _soh(s.battery_capacity),
                icon="mdi:battery-heart-variant",
            )
        )

    elif entry.data.get("soh_entity"):
        descriptions.append(
            CardataAnalyticsSensorDescription(
                key="soh",
                name="Batteriezustand SoH",
                unit=PERCENTAGE,
                device_class=SensorDeviceClass.BATTERY,
                state_class=SensorStateClass.MEASUREMENT,
                value_fn=lambda s: s.source_soh,
                icon="mdi:battery-heart-variant",
            )
        )

    if entry.data.get("range_entity"):
        descriptions.append(
            CardataAnalyticsSensorDescription(
                key="range",
                name="Restreichweite",
                unit=UnitOfLength.KILOMETERS,
                device_class=SensorDeviceClass.DISTANCE,
                state_class=SensorStateClass.MEASUREMENT,
                value_fn=lambda s: s.range_km,
                icon="mdi:map-marker-distance",
            )
        )

    descriptions.extend(CUSTOM_SENSORS)

    # Reconfiguration can remove optional source sensors (range / source SoH).
    # Remove registry entries for optional analytics entities that are no longer
    # part of this vehicle so Home Assistant does not leave stale unavailable
    # entities behind after the config entry reloads.
    desired_keys = {description.key for description in descriptions}
    registry = er.async_get(hass)
    for optional_key in ("range", "soh"):
        if optional_key in desired_keys:
            continue
        entity_id = registry.async_get_entity_id(
            "sensor", DOMAIN, f"{entry.entry_id}_{optional_key}"
        )
        if entity_id is not None:
            registry.async_remove(entity_id)

    async_add_entities([CardataAnalyticsSensor(runtime, entry, description) for description in descriptions])


class CardataAnalyticsSensor(SensorEntity):
    """One Cardata Analytics sensor entity."""

    _attr_has_entity_name = True

    def __init__(self, runtime: VehicleRuntime, entry: ConfigEntry, description: CardataAnalyticsSensorDescription) -> None:
        self.runtime = runtime
        self.entry = entry
        self.description = description
        self._attr_unique_id = f"{entry.entry_id}_{description.key}"
        self._attr_suggested_object_id = f"cardata_{slugify(entry.title)}_{description.key}"
        self._attr_name = description.name
        self._attr_native_unit_of_measurement = description.unit
        self._attr_device_class = description.device_class
        self._attr_state_class = description.state_class
        self._attr_icon = description.icon

        vehicle_type = entry.data.get("vehicle_type")
        model = {
            VEHICLE_I3_120: "i3 120 Ah",
            VEHICLE_IX1: "iX1",
            VEHICLE_GENERIC_BEV: "BEV",
        }.get(vehicle_type, "BEV")
        device_info: dict = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": entry.title,
            "model": model,
        }
        if vehicle_type in (VEHICLE_I3_120, VEHICLE_IX1):
            device_info["manufacturer"] = "BMW"
        self._attr_device_info = DeviceInfo(**device_info)

    @property
    def native_value(self):
        return self.description.value_fn(self.runtime.snapshot())


    @property
    def extra_state_attributes(self):
        """Expose selected-period coverage metadata for transparency."""
        if not self.description.custom_period:
            return None
        snapshot = self.runtime.snapshot()
        return {
            "requested_from": snapshot.range_from.isoformat(),
            "requested_to": snapshot.range_to.isoformat(),
            "data_complete": snapshot.custom_coverage_complete,
            "coverage_status": snapshot.custom_coverage_status,
            "tracking_started_at": snapshot.tracking_started_at.isoformat(),
            "tracking_started_date": snapshot.history_complete_from.date().isoformat(),
            "history_complete_from": snapshot.history_complete_from.isoformat(),
            "effective_data_from": (
                snapshot.custom_effective_from.isoformat()
                if snapshot.custom_effective_from is not None
                else None
            ),
            "coverage_available_from": (
                snapshot.custom_available_from.isoformat()
                if snapshot.custom_available_from is not None
                else None
            ),
            "historical_days_expected": snapshot.custom_expected_historical_days,
            "historical_days_covered": snapshot.custom_covered_historical_days,
            # Diagnostic overlap values are intentionally attributes only.  The
            # normal sensor state remains unknown when the requested period is
            # not fully covered, preventing partial data from being mistaken for
            # the complete selected-period result.
            "partial_energy_kwh": (
                round(snapshot.custom_partial_kwh, 2)
                if snapshot.custom_partial_kwh is not None
                else None
            ),
            "partial_distance_km": (
                round(snapshot.custom_partial_km, 1)
                if snapshot.custom_partial_km is not None
                else None
            ),
            "partial_average_consumption": (
                round(snapshot.custom_partial_avg, 1)
                if snapshot.custom_partial_avg is not None
                else None
            ),
        }

    @property
    def available(self) -> bool:
        if self.description.custom_period:
            # Keep the entity available even when the selected range is
            # incomplete.  Its state is then ``unknown`` but coverage metadata
            # remains accessible to the dashboard card and to automations.
            return True
        if self.description.key == "soc":
            return self.runtime.current_soc is not None
        if self.description.key == "mileage":
            return self.runtime.current_mileage is not None
        if self.description.key == "battery_capacity":
            return self.runtime.battery_capacity is not None
        if self.description.key == "soh":
            if self.entry.data.get("vehicle_type") == VEHICLE_I3_120:
                return self.runtime.battery_capacity is not None
            return self.runtime.current_source_soh is not None
        if self.description.key == "range":
            return self.runtime.current_range is not None
        return True

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                SIGNAL_UPDATE.format(self.entry.entry_id),
                self._handle_update,
            )
        )
        if self.description.key == "custom_energy":
            self.hass.async_create_task(self.runtime.async_refresh_custom_period())

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()
