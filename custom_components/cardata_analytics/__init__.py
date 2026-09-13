"""Cardata Analytics integration."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace.const import (
    CONF_RESOURCE_TYPE_WS,
    LOVELACE_DATA,
    MODE_STORAGE,
)
from homeassistant.components.lovelace.resources import ResourceStorageCollection
from homeassistant.config_entries import ConfigEntry, SOURCE_IMPORT
from homeassistant.const import CONF_ID, CONF_TYPE, CONF_URL
from homeassistant.core import HomeAssistant

from .const import (
    CONF_ENTRY_KIND,
    CONF_OCM_API_KEY,
    CONF_OCM_ENABLED,
    DATA_CONTROLLER,
    DATA_CONTROLLER_SETUP_TASK,
    DATA_GLOBAL_ENTRY_PENDING,
    DATA_RUNTIMES,
    DOMAIN,
    ENTRY_KIND_GLOBAL,
    ENTRY_KIND_VEHICLE,
)
from .controller import GlobalRangeController
from .runtime import VehicleRuntime
from .poi import async_register_websocket
from .poi_templates import async_register_websocket as async_register_template_websocket
from .route_data import async_register_websocket as async_register_route_websocket

_LOGGER = logging.getLogger(__name__)

FRONTEND_URL = "/cardata_analytics"
FRONTEND_CARD_PATH = f"{FRONTEND_URL}/cardata-analytics-card-0.1.48.js"
FRONTEND_MODULE = f"{FRONTEND_CARD_PATH}?v=0.1.48"
FRONTEND_CARD_PREFIX = f"{FRONTEND_URL}/cardata-analytics-card"
DATA_FRONTEND_REGISTERED = "frontend_registered"


async def _async_register_lovelace_resource(hass: HomeAssistant) -> None:
    """Ensure the dashboard card is registered as a Lovelace module resource.

    Using a normal Lovelace resource avoids the frontend race that can happen
    when a custom card is injected with ``frontend.add_extra_js_url``.
    """
    lovelace_data = hass.data.get(LOVELACE_DATA)
    if lovelace_data is None:
        _LOGGER.warning(
            "Lovelace is not available; add %s as a module resource manually",
            FRONTEND_MODULE,
        )
        return

    resources = lovelace_data.resources
    if lovelace_data.resource_mode != MODE_STORAGE or not isinstance(
        resources, ResourceStorageCollection
    ):
        # YAML resource mode is intentionally not modified by integrations.
        existing = [
            item
            for item in resources.async_items()
            if str(item.get(CONF_URL, "")).split("?", 1)[0].startswith(FRONTEND_CARD_PREFIX)
        ]
        if not existing:
            _LOGGER.warning(
                "Lovelace resources are managed in YAML mode. Add '%s' with "
                "type 'module' to your Lovelace resources",
                FRONTEND_MODULE,
            )
        return

    # Make sure the storage collection is loaded before inspecting it.
    await resources.async_get_info()
    matches = [
        item
        for item in resources.async_items()
        if str(item.get(CONF_URL, "")).split("?", 1)[0].startswith(FRONTEND_CARD_PREFIX)
    ]

    if not matches:
        await resources.async_create_item(
            {
                CONF_RESOURCE_TYPE_WS: "module",
                CONF_URL: FRONTEND_MODULE,
            }
        )
        _LOGGER.debug("Registered Cardata Analytics Lovelace resource %s", FRONTEND_MODULE)
        return

    primary = matches[0]
    updates: dict[str, Any] = {}
    if primary.get(CONF_URL) != FRONTEND_MODULE:
        updates[CONF_URL] = FRONTEND_MODULE
    if primary.get(CONF_TYPE) != "module":
        updates[CONF_RESOURCE_TYPE_WS] = "module"
    if updates:
        await resources.async_update_item(primary[CONF_ID], updates)
        _LOGGER.debug("Updated Cardata Analytics Lovelace resource to %s", FRONTEND_MODULE)

    # Remove stale duplicates from earlier manual/automatic registrations.
    for duplicate in matches[1:]:
        await resources.async_delete_item(duplicate[CONF_ID])
        _LOGGER.warning(
            "Removed duplicate Cardata Analytics Lovelace resource %s",
            duplicate.get(CONF_URL),
        )


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    """Register the integration-wide dashboard card module."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    if domain_data.get(DATA_FRONTEND_REGISTERED):
        return True

    # POI network access runs server-side through Home Assistant so Lovelace
    # browsers and Companion WebViews do not depend on third-party CORS.
    async_register_websocket(hass)
    async_register_template_websocket(hass)
    async_register_route_websocket(hass)
    frontend_path = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(FRONTEND_URL, str(frontend_path), False)]
    )
    try:
        await _async_register_lovelace_resource(hass)
    except Exception:  # pragma: no cover - keep backend usable on frontend API changes
        _LOGGER.exception(
            "Could not register the Cardata Analytics Lovelace resource; "
            "the analytics backend will continue to run"
        )
    domain_data[DATA_FRONTEND_REGISTERED] = True

    # Create the shared comparison controller during integration setup. Config
    # entries can be set up concurrently by Home Assistant; without a guarded
    # singleton, different vehicle entries could accidentally keep different
    # controller instances and therefore different From/To ranges.
    await _async_get_controller(hass)
    return True


async def _async_get_controller(hass: HomeAssistant) -> GlobalRangeController:
    """Return the one fully initialized comparison-period controller.

    Home Assistant may call ``async_setup_entry`` for several config entries at
    the same time. Earlier versions created the controller only after awaiting
    its storage load, which allowed two or more setup tasks to create separate
    controller objects. The global date/select entities could then update one
    object while a vehicle runtime continued reading another one.

    Store and await a single initialization task so every entry receives the
    exact same controller instance.
    """
    domain_data = hass.data.setdefault(DOMAIN, {})
    controller = domain_data.get(DATA_CONTROLLER)
    if controller is not None:
        return controller

    setup_task = domain_data.get(DATA_CONTROLLER_SETUP_TASK)
    if setup_task is None:
        async def _setup_controller() -> GlobalRangeController:
            shared = GlobalRangeController(hass)
            await shared.async_setup()
            domain_data[DATA_CONTROLLER] = shared
            return shared

        setup_task = hass.async_create_task(_setup_controller())
        domain_data[DATA_CONTROLLER_SETUP_TASK] = setup_task

    try:
        return await setup_task
    finally:
        # Keep only the initialized controller. If setup failed, removing the
        # task allows a later setup attempt to retry cleanly.
        if domain_data.get(DATA_CONTROLLER_SETUP_TASK) is setup_task and setup_task.done():
            domain_data.pop(DATA_CONTROLLER_SETUP_TASK, None)


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
        global_data: dict[str, Any] = {CONF_ENTRY_KIND: ENTRY_KIND_GLOBAL}
        for existing in hass.config_entries.async_entries(DOMAIN):
            api_key = str(existing.data.get(CONF_OCM_API_KEY, "") or "").strip()
            if api_key:
                global_data[CONF_OCM_ENABLED] = bool(existing.data.get(CONF_OCM_ENABLED, True))
                global_data[CONF_OCM_API_KEY] = api_key
                break
        await hass.config_entries.flow.async_init(
            DOMAIN,
            context={"source": SOURCE_IMPORT},
            data=global_data,
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
