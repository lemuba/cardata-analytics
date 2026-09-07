"""Cardata Analytics integration."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry, SOURCE_IMPORT
from homeassistant.core import HomeAssistant

from .const import (
    CONF_ENTRY_KIND,
    DATA_CONTROLLER,
    DATA_GLOBAL_ENTRY_PENDING,
    DATA_RUNTIMES,
    DOMAIN,
    ENTRY_KIND_GLOBAL,
    ENTRY_KIND_VEHICLE,
)
from .controller import GlobalRangeController
from .runtime import VehicleRuntime

_LOGGER = logging.getLogger(__name__)

FRONTEND_URL = "/cardata_analytics"
FRONTEND_MODULE = f"{FRONTEND_URL}/cardata-analytics-card.js?v=0.1.0"
DATA_FRONTEND_REGISTERED = "frontend_registered"


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    """Register the integration-wide dashboard card module."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    if domain_data.get(DATA_FRONTEND_REGISTERED):
        return True

    frontend_path = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(FRONTEND_URL, str(frontend_path), False)]
    )
    frontend.add_extra_js_url(hass, FRONTEND_MODULE)
    domain_data[DATA_FRONTEND_REGISTERED] = True
    return True


async def _async_get_controller(hass: HomeAssistant) -> GlobalRangeController:
    """Return the integration-wide comparison-period controller."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    controller = domain_data.get(DATA_CONTROLLER)
    if controller is None:
        controller = GlobalRangeController(hass)
        await controller.async_setup()
        domain_data[DATA_CONTROLLER] = controller
    return controller


def _entry_kind(entry: ConfigEntry) -> str:
    """Return the kind of config entry."""
    return entry.data.get(CONF_ENTRY_KIND, ENTRY_KIND_VEHICLE)


async def _async_ensure_global_entry(hass: HomeAssistant) -> None:
    """Create the dedicated global comparison entry once."""
    domain_data = hass.data.setdefault(DOMAIN, {})

    if any(
        _entry_kind(existing) == ENTRY_KIND_GLOBAL
        for existing in hass.config_entries.async_entries(DOMAIN)
    ):
        return

    if domain_data.get(DATA_GLOBAL_ENTRY_PENDING):
        return

    domain_data[DATA_GLOBAL_ENTRY_PENDING] = True
    try:
        await hass.config_entries.flow.async_init(
            DOMAIN,
            context={"source": SOURCE_IMPORT},
            data={CONF_ENTRY_KIND: ENTRY_KIND_GLOBAL},
        )
    except Exception:  # pragma: no cover - defensive logging for HA runtime
        _LOGGER.exception("Could not create Cardata Analytics global comparison entry")
    finally:
        domain_data[DATA_GLOBAL_ENTRY_PENDING] = False


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Cardata Analytics from a config entry."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    controller = await _async_get_controller(hass)

    if _entry_kind(entry) == ENTRY_KIND_GLOBAL:
        entry.runtime_data = controller
        await hass.config_entries.async_forward_entry_setups(entry, ["date", "select"])
        return True

    runtimes = domain_data.setdefault(DATA_RUNTIMES, {})
    runtime = VehicleRuntime(hass, entry, controller)
    await runtime.async_setup()
    runtimes[entry.entry_id] = runtime
    controller.register_runtime(entry.entry_id, runtime)
    entry.runtime_data = runtime

    await hass.config_entries.async_forward_entry_setups(entry, ["sensor"])

    # The comparison range is a separate integration-managed config entry so it
    # remains shared by all vehicles without being attached to a vehicle device.
    hass.async_create_task(_async_ensure_global_entry(hass))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    if _entry_kind(entry) == ENTRY_KIND_GLOBAL:
        return await hass.config_entries.async_unload_platforms(entry, ["date", "select"])

    unload_ok = await hass.config_entries.async_unload_platforms(entry, ["sensor"])
    if not unload_ok:
        return False

    await entry.runtime_data.async_unload()
    domain_data = hass.data.get(DOMAIN, {})
    runtimes = domain_data.get(DATA_RUNTIMES, {})
    runtimes.pop(entry.entry_id, None)
    controller = domain_data.get(DATA_CONTROLLER)
    if controller is not None:
        controller.unregister_runtime(entry.entry_id)
    return True
