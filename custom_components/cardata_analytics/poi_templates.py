"""Persistent global POI filter templates for Cardata Analytics."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN
from .poi import POI_CLAUSES

STORE_VERSION = 1
STORE_KEY = f"{DOMAIN}.poi_templates"
DATA_TEMPLATE_STORE = "poi_template_store"
DATA_TEMPLATE_LOCK = "poi_template_lock"
DATA_TEMPLATE_CACHE = "poi_template_cache"

WS_LIST = f"{DOMAIN}/poi_templates/list"
WS_SAVE = f"{DOMAIN}/poi_templates/save"
WS_DELETE = f"{DOMAIN}/poi_templates/delete"

RADIUS_OPTIONS = [2, 5, 10, 25, 50, 100, 150, 200, 500, 1000]
POWER_OPTIONS = [0, 50, 100, 150, 200, 300, 350]
CONNECTOR_OPTIONS = ["any", "ccs", "type2", "chademo", "tesla"]

_TEMPLATE_SCHEMA = vol.Schema(
    {
        vol.Required("name"): vol.All(str, vol.Length(min=1, max=60)),
        vol.Required("categories"): vol.All(
            [vol.In(tuple(POI_CLAUSES))], vol.Length(min=0, max=len(POI_CLAUSES))
        ),
        vol.Required("radiusKm"): vol.In(RADIUS_OPTIONS),
        vol.Optional("search", default=""): vol.All(str, vol.Length(max=80)),
        # ``operator`` is kept for templates saved by <= 0.1.44. New templates
        # use ``operators`` so multiple charging networks can be combined.
        vol.Optional("operator", default=""): vol.All(str, vol.Length(max=80)),
        vol.Optional("operators", default=[]): vol.All(
            [vol.All(str, vol.Length(min=1, max=80))], vol.Length(max=12)
        ),
        vol.Optional("minPowerKw", default=0): vol.In(POWER_OPTIONS),
        vol.Optional("connector", default="any"): vol.In(CONNECTOR_OPTIONS),
        vol.Optional("includeUnknownPower", default=True): vol.Coerce(bool),
        vol.Optional("centerMode", default="vehicle"): vol.In(["vehicle", "route", "map"]),
    },
    extra=vol.PREVENT_EXTRA,
)


def _domain_data(hass: HomeAssistant) -> dict[str, Any]:
    return hass.data.setdefault(DOMAIN, {})


def _store(hass: HomeAssistant) -> Store[dict[str, Any]]:
    data = _domain_data(hass)
    store = data.get(DATA_TEMPLATE_STORE)
    if store is None:
        store = Store(hass, STORE_VERSION, STORE_KEY)
        data[DATA_TEMPLATE_STORE] = store
    return store


def _lock(hass: HomeAssistant) -> asyncio.Lock:
    data = _domain_data(hass)
    lock = data.get(DATA_TEMPLATE_LOCK)
    if lock is None:
        lock = asyncio.Lock()
        data[DATA_TEMPLATE_LOCK] = lock
    return lock


async def _async_templates(hass: HomeAssistant) -> dict[str, dict[str, Any]]:
    data = _domain_data(hass)
    cached = data.get(DATA_TEMPLATE_CACHE)
    if isinstance(cached, dict):
        return cached
    async with _lock(hass):
        cached = data.get(DATA_TEMPLATE_CACHE)
        if isinstance(cached, dict):
            return cached
        stored = await _store(hass).async_load() or {}
        raw = stored.get("templates", {}) if isinstance(stored, dict) else {}
        templates: dict[str, dict[str, Any]] = {}
        if isinstance(raw, dict):
            for key, value in raw.items():
                if not isinstance(key, str) or not key.startswith("custom:"):
                    continue
                try:
                    templates[key] = dict(_TEMPLATE_SCHEMA(value))
                except vol.Invalid:
                    continue
        data[DATA_TEMPLATE_CACHE] = templates
        return templates


async def _async_save_all(hass: HomeAssistant, templates: dict[str, dict[str, Any]]) -> None:
    await _store(hass).async_save({"templates": templates})


@websocket_api.websocket_command({vol.Required("type"): WS_LIST})
@websocket_api.async_response
async def websocket_list_templates(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return global custom POI templates."""
    templates = await _async_templates(hass)
    connection.send_result(msg["id"], {"templates": deepcopy(templates)})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_SAVE,
        vol.Required("key"): vol.All(str, vol.Match(r"^custom:[A-Za-z0-9._:-]{1,90}$")),
        vol.Required("template"): _TEMPLATE_SCHEMA,
    }
)
@websocket_api.async_response
async def websocket_save_template(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Create or update one global custom POI template."""
    key = str(msg["key"])
    template = dict(msg["template"])
    # Load before locking so the lazy loader cannot recursively acquire the lock.
    await _async_templates(hass)
    async with _lock(hass):
        templates = dict(_domain_data(hass).get(DATA_TEMPLATE_CACHE, {}))
        updated = dict(templates)
        updated[key] = template
        await _async_save_all(hass, updated)
        _domain_data(hass)[DATA_TEMPLATE_CACHE] = updated
    connection.send_result(msg["id"], {"key": key, "template": deepcopy(template)})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_DELETE,
        vol.Required("key"): vol.All(str, vol.Match(r"^custom:[A-Za-z0-9._:-]{1,90}$")),
    }
)
@websocket_api.async_response
async def websocket_delete_template(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Delete one global custom POI template."""
    key = str(msg["key"])
    # Load before locking so the lazy loader cannot recursively acquire the lock.
    await _async_templates(hass)
    async with _lock(hass):
        templates = dict(_domain_data(hass).get(DATA_TEMPLATE_CACHE, {}))
        existed = key in templates
        templates.pop(key, None)
        await _async_save_all(hass, templates)
        _domain_data(hass)[DATA_TEMPLATE_CACHE] = templates
    connection.send_result(msg["id"], {"deleted": existed, "key": key})


def async_register_websocket(hass: HomeAssistant) -> None:
    """Register global POI-template websocket commands."""
    websocket_api.async_register_command(hass, websocket_list_templates)
    websocket_api.async_register_command(hass, websocket_save_template)
    websocket_api.async_register_command(hass, websocket_delete_template)
