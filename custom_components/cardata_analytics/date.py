"""Shared date controls for Cardata Analytics."""

from __future__ import annotations

from datetime import date

from homeassistant.components.date import DateEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, SIGNAL_GLOBAL_RANGE_UPDATE
from .controller import GlobalRangeController


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Create the shared pair of date entities on the dedicated global entry."""
    controller: GlobalRangeController = entry.runtime_data
    async_add_entities(
        [
            CardataAnalyticsGlobalDate(controller, "range_from", "Cardata Analytics Vergleichszeitraum von"),
            CardataAnalyticsGlobalDate(controller, "range_to", "Cardata Analytics Vergleichszeitraum bis"),
        ]
    )


class CardataAnalyticsGlobalDate(DateEntity):
    """One integration-wide comparison date control."""

    _attr_has_entity_name = False

    def __init__(self, controller: GlobalRangeController, key: str, name: str) -> None:
        self.controller = controller
        self.key = key
        self._attr_unique_id = f"global_{key}"
        self._attr_suggested_object_id = f"cardata_vergleichszeitraum_{'von' if key == 'range_from' else 'bis'}"
        self._attr_name = name
        self._attr_icon = "mdi:calendar-start" if key == "range_from" else "mdi:calendar-end"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, "global_comparison_period")},
            name="Cardata Analytics Vergleichszeitraum",
            model="Vergleichszeitraum",
        )

    @property
    def native_value(self) -> date:
        return self.controller.range_from if self.key == "range_from" else self.controller.range_to

    async def async_set_value(self, value: date) -> None:
        if self.key == "range_from":
            await self.controller.async_set_range_from(value)
        else:
            await self.controller.async_set_range_to(value)
        self.async_write_ha_state()

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_GLOBAL_RANGE_UPDATE, self._handle_update)
        )

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()
