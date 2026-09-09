"""Config flow for Cardata Analytics."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers import selector

from .const import (
    CONF_BATTERY_CAPACITY,
    CONF_ENERGY_ENTITY,
    CONF_ENTRY_KIND,
    CONF_MILEAGE_ENTITY,
    CONF_RANGE_ENTITY,
    CONF_SOC_ENTITY,
    CONF_SOH_ENTITY,
    CONF_VEHICLE_NAME,
    CONF_VEHICLE_TYPE,
    ENTRY_KIND_GLOBAL,
    ENTRY_KIND_VEHICLE,
    GLOBAL_ENTRY_UNIQUE_ID,
    VEHICLE_GENERIC_BEV,
    VEHICLE_I3_120,
    VEHICLE_IX1,
)


class CardataAnalyticsConfigFlow(config_entries.ConfigFlow, domain="cardata_analytics"):
    """Handle a config flow for Cardata Analytics."""

    VERSION = 1
    MINOR_VERSION = 0

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Start setup and select vehicle type."""
        if user_input is not None:
            self.context["vehicle_type"] = user_input[CONF_VEHICLE_TYPE]
            return await self.async_step_vehicle()

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_VEHICLE_TYPE): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=[
                                selector.SelectOptionDict(value=VEHICLE_I3_120, label="BMW i3 120 Ah"),
                                selector.SelectOptionDict(value=VEHICLE_IX1, label="BMW iX1"),
                                selector.SelectOptionDict(value=VEHICLE_GENERIC_BEV, label="BEV"),
                            ],
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    )
                }
            ),
        )

    async def async_step_import(self, import_data: dict[str, Any]) -> FlowResult:
        """Create the integration-managed global comparison config entry."""
        if import_data.get(CONF_ENTRY_KIND) != ENTRY_KIND_GLOBAL:
            return self.async_abort(reason="unsupported_import")

        await self.async_set_unique_id(GLOBAL_ENTRY_UNIQUE_ID)
        self._abort_if_unique_id_configured()
        return self.async_create_entry(
            title="Cardata Analytics Vergleichszeitraum",
            data={CONF_ENTRY_KIND: ENTRY_KIND_GLOBAL},
        )

    async def async_step_vehicle(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Collect source entities for a vehicle."""
        vehicle_type = self.context["vehicle_type"]
        errors: dict[str, str] = {}

        if user_input is not None:
            if self._find_duplicate(user_input[CONF_SOC_ENTITY], user_input[CONF_MILEAGE_ENTITY]):
                return self.async_abort(reason="already_configured")

            errors = self._validate_vehicle_input(vehicle_type, user_input)
            if not errors:
                data = dict(user_input)
                data[CONF_VEHICLE_TYPE] = vehicle_type
                data[CONF_ENTRY_KIND] = ENTRY_KIND_VEHICLE
                return self.async_create_entry(title=user_input[CONF_VEHICLE_NAME], data=data)

        return self.async_show_form(
            step_id="vehicle",
            data_schema=self._vehicle_schema(vehicle_type, defaults=user_input),
            errors=errors,
        )

    async def async_step_reconfigure(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Allow changing vehicle source entities after setup."""
        entry = self._get_reconfigure_entry()
        if entry.data.get(CONF_ENTRY_KIND) == ENTRY_KIND_GLOBAL:
            return self.async_abort(reason="global_entry_managed")

        vehicle_type = entry.data.get(CONF_VEHICLE_TYPE, VEHICLE_GENERIC_BEV)
        errors: dict[str, str] = {}
        if user_input is not None:
            if self._find_duplicate(
                user_input[CONF_SOC_ENTITY],
                user_input[CONF_MILEAGE_ENTITY],
                exclude_entry_id=entry.entry_id,
            ):
                return self.async_abort(reason="already_configured")

            errors = self._validate_vehicle_input(vehicle_type, user_input)
            if not errors:
                data = dict(user_input)
                data[CONF_VEHICLE_TYPE] = vehicle_type
                data[CONF_ENTRY_KIND] = ENTRY_KIND_VEHICLE
                if entry.title != user_input[CONF_VEHICLE_NAME]:
                    self.hass.config_entries.async_update_entry(entry, title=user_input[CONF_VEHICLE_NAME])
                return self.async_update_reload_and_abort(entry, data_updates=data)

        defaults = dict(entry.data) if user_input is None else user_input
        return self.async_show_form(
            step_id="reconfigure",
            data_schema=self._vehicle_schema(vehicle_type, defaults=defaults),
            errors=errors,
        )

    def _find_duplicate(self, soc: str, mileage: str, exclude_entry_id: str | None = None) -> bool:
        """Reject duplicate vehicle entries using the same SoC and odometer pair."""
        for existing in self._async_current_entries():
            if existing.entry_id == exclude_entry_id:
                continue
            if existing.data.get(CONF_ENTRY_KIND, ENTRY_KIND_VEHICLE) == ENTRY_KIND_GLOBAL:
                continue
            if existing.data.get(CONF_SOC_ENTITY) == soc and existing.data.get(CONF_MILEAGE_ENTITY) == mileage:
                return True
        return False

    @staticmethod
    def _validate_vehicle_input(vehicle_type: str, user_input: dict[str, Any]) -> dict[str, str]:
        """Validate combinations that cannot be expressed by the form schema alone."""
        errors: dict[str, str] = {}
        if vehicle_type == VEHICLE_GENERIC_BEV:
            energy_entity = user_input.get(CONF_ENERGY_ENTITY)
            fixed_capacity = user_input.get(CONF_BATTERY_CAPACITY)
            if not energy_entity and fixed_capacity in (None, ""):
                errors["base"] = "capacity_source_required"
        return errors

    @staticmethod
    def _vehicle_schema(vehicle_type: str, defaults: dict[str, Any] | None = None) -> vol.Schema:
        """Build the source-entity form for one vehicle."""
        defaults = defaults or {}
        sensor_selector = selector.EntitySelector(selector.EntitySelectorConfig(domain="sensor"))

        if vehicle_type == VEHICLE_I3_120:
            default_name = "BMW i3 120 Ah"
        elif vehicle_type == VEHICLE_IX1:
            default_name = "BMW iX1"
        else:
            default_name = "BEV"

        def required_entity(key: str):
            return vol.Required(key, default=defaults[key]) if defaults.get(key) else vol.Required(key)

        def optional_entity(key: str):
            return vol.Optional(key, default=defaults[key]) if defaults.get(key) else vol.Optional(key)

        schema_dict: dict[Any, Any] = {
            vol.Required(CONF_VEHICLE_NAME, default=defaults.get(CONF_VEHICLE_NAME, default_name)): str,
            required_entity(CONF_SOC_ENTITY): sensor_selector,
            required_entity(CONF_MILEAGE_ENTITY): sensor_selector,
            optional_entity(CONF_RANGE_ENTITY): sensor_selector,
        }

        if vehicle_type in (VEHICLE_I3_120, VEHICLE_IX1):
            # Known BMW presets use a sensor that represents usable HV capacity.
            schema_dict[required_entity(CONF_ENERGY_ENTITY)] = sensor_selector
        else:
            # Generic BEV: use either a live usable-capacity sensor or a fixed
            # usable capacity. If the live sensor is unavailable at runtime, the
            # fixed value is also used as a fallback when both are configured.
            schema_dict[optional_entity(CONF_ENERGY_ENTITY)] = sensor_selector
            battery_key = (
                vol.Optional(CONF_BATTERY_CAPACITY, default=defaults[CONF_BATTERY_CAPACITY])
                if defaults.get(CONF_BATTERY_CAPACITY) not in (None, "")
                else vol.Optional(CONF_BATTERY_CAPACITY)
            )
            schema_dict[battery_key] = selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=1,
                    max=250,
                    step=0.1,
                    unit_of_measurement="kWh",
                    mode=selector.NumberSelectorMode.BOX,
                )
            )

        # The i3 preset calculates SoH from its known HV-capacity curve. For
        # iX1 and generic BEVs an existing SoH sensor can be exposed optionally.
        if vehicle_type != VEHICLE_I3_120:
            schema_dict[optional_entity(CONF_SOH_ENTITY)] = sensor_selector

        return vol.Schema(schema_dict)
