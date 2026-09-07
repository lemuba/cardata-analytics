"""Shared comparison-period preset selector for Cardata Analytics."""

from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import (
    DATA_CONTROLLER,
    DOMAIN,
    RANGE_PRESET_OPTIONS,
    SIGNAL_GLOBAL_RANGE_UPDATE,
)
from .controller import GlobalRangeController


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Create the shared rolling-period selector on the global entry."""
    controller: GlobalRangeController = hass.data[DOMAIN][DATA_CONTROLLER]
    async_add_entities([CardataAnalyticsRangePresetSelect(controller)])


class CardataAnalyticsRangePresetSelect(SelectEntity):
    """One integration-wide quick selection for the comparison period."""

    _attr_has_entity_name = False
    _attr_name = "Cardata Analytics Vergleichszeitraum Schnellwahl"
    _attr_unique_id = "global_range_preset"
    _attr_suggested_object_id = "cardata_vergleichszeitraum_schnellwahl"
    _attr_icon = "mdi:calendar-sync"
    _attr_options = RANGE_PRESET_OPTIONS
    _attr_device_info = DeviceInfo(
        identifiers={(DOMAIN, "global_comparison_period")},
        name="Cardata Analytics Vergleichszeitraum",
        model="Vergleichszeitraum",
    )

    def __init__(self, controller: GlobalRangeController) -> None:
        self.controller = controller

    @property
    def current_option(self) -> str:
        return self.controller.preset

    async def async_select_option(self, option: str) -> None:
        await self.controller.async_set_preset(option)
        self.async_write_ha_state()

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_GLOBAL_RANGE_UPDATE, self._handle_update)
        )

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()
