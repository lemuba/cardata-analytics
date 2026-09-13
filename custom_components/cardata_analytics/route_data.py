"""Persistent route templates and saved destinations for Cardata Analytics."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from time import monotonic
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.storage import Store

from .const import (
    DATA_NOMINATIM_LAST_REQUEST,
    DATA_NOMINATIM_LOCK,
    DOMAIN,
    NOMINATIM_MIN_REQUEST_INTERVAL,
)

STORE_VERSION = 1
STORE_KEY = f"{DOMAIN}.routes"
DATA_STORE = "route_store"
DATA_LOCK = "route_store_lock"
DATA_CACHE = "route_store_cache"
DATA_GEOCODE_CACHE = "route_geocode_cache"

WS_LIST = f"{DOMAIN}/routes/list"
WS_SAVE_TEMPLATE = f"{DOMAIN}/routes/templates/save"
WS_DELETE_TEMPLATE = f"{DOMAIN}/routes/templates/delete"
WS_SAVE_DESTINATION = f"{DOMAIN}/routes/destinations/save"
WS_DELETE_DESTINATION = f"{DOMAIN}/routes/destinations/delete"
WS_GEOCODE = f"{DOMAIN}/routes/geocode"

NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
GEOCODE_CACHE_TTL = 24 * 60 * 60

_POINT_SCHEMA = vol.Schema(
    {
        vol.Required("lat"): vol.All(vol.Coerce(float), vol.Range(min=-90, max=90)),
        vol.Required("lon"): vol.All(vol.Coerce(float), vol.Range(min=-180, max=180)),
        vol.Required("label"): vol.All(str, vol.Length(min=1, max=180)),
        vol.Optional("address", default=""): vol.All(str, vol.Length(max=240)),
        vol.Optional("category", default=""): vol.All(str, vol.Length(max=80)),
        vol.Optional("id", default=""): vol.All(str, vol.Length(max=220)),
    },
    extra=vol.PREVENT_EXTRA,
)

_ROUTE_TEMPLATE_SCHEMA = vol.Schema(
    {
        vol.Required("name"): vol.All(str, vol.Length(min=1, max=80)),
        vol.Optional("vehicleId", default=""): vol.All(str, vol.Length(max=160)),
        vol.Optional("waypoints", default=[]): vol.All([_POINT_SCHEMA], vol.Length(max=3)),
        vol.Required("destination"): _POINT_SCHEMA,
    },
    extra=vol.PREVENT_EXTRA,
)

_DESTINATION_SCHEMA = vol.Schema(
    {
        vol.Required("name"): vol.All(str, vol.Length(min=1, max=80)),
        vol.Required("lat"): vol.All(vol.Coerce(float), vol.Range(min=-90, max=90)),
        vol.Required("lon"): vol.All(vol.Coerce(float), vol.Range(min=-180, max=180)),
        vol.Optional("address", default=""): vol.All(str, vol.Length(max=240)),
    },
    extra=vol.PREVENT_EXTRA,
)

_KEY = vol.All(str, vol.Match(r"^[A-Za-z0-9._:-]{1,100}$"))


def _domain_data(hass: HomeAssistant) -> dict[str, Any]:
    return hass.data.setdefault(DOMAIN, {})


def _store(hass: HomeAssistant) -> Store[dict[str, Any]]:
    data = _domain_data(hass)
    store = data.get(DATA_STORE)
    if store is None:
        store = Store(hass, STORE_VERSION, STORE_KEY)
        data[DATA_STORE] = store
    return store


def _lock(hass: HomeAssistant) -> asyncio.Lock:
    data = _domain_data(hass)
    lock = data.get(DATA_LOCK)
    if lock is None:
        lock = asyncio.Lock()
        data[DATA_LOCK] = lock
    return lock


async def _async_data(hass: HomeAssistant) -> dict[str, dict[str, dict[str, Any]]]:
    data = _domain_data(hass)
    cached = data.get(DATA_CACHE)
    if isinstance(cached, dict):
        return cached
    async with _lock(hass):
        cached = data.get(DATA_CACHE)
        if isinstance(cached, dict):
            return cached
        stored = await _store(hass).async_load() or {}
        out: dict[str, dict[str, dict[str, Any]]] = {"templates": {}, "destinations": {}}
        raw_templates = stored.get("templates", {}) if isinstance(stored, dict) else {}
        raw_destinations = stored.get("destinations", {}) if isinstance(stored, dict) else {}
        if isinstance(raw_templates, dict):
            for key, value in raw_templates.items():
                if not isinstance(key, str) or not key.startswith("route:"):
                    continue
                try:
                    out["templates"][key] = dict(_ROUTE_TEMPLATE_SCHEMA(value))
                except vol.Invalid:
                    continue
        if isinstance(raw_destinations, dict):
            for key, value in raw_destinations.items():
                if not isinstance(key, str) or not key.startswith("destination:"):
                    continue
                try:
                    out["destinations"][key] = dict(_DESTINATION_SCHEMA(value))
                except vol.Invalid:
                    continue
        data[DATA_CACHE] = out
        return out


async def _async_save_all(hass: HomeAssistant, data: dict[str, Any]) -> None:
    await _store(hass).async_save(data)


@websocket_api.websocket_command({vol.Required("type"): WS_LIST})
@websocket_api.async_response
async def websocket_list(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return global route templates and destinations."""
    data = await _async_data(hass)
    connection.send_result(msg["id"], deepcopy(data))


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_SAVE_TEMPLATE,
        vol.Required("key"): _KEY,
        vol.Required("template"): _ROUTE_TEMPLATE_SCHEMA,
    }
)
@websocket_api.async_response
async def websocket_save_template(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Create or update a global route template."""
    key = str(msg["key"])
    if not key.startswith("route:"):
        connection.send_error(msg["id"], "invalid_key", "Route template key must start with route:")
        return
    template = dict(msg["template"])
    await _async_data(hass)
    async with _lock(hass):
        current = deepcopy(_domain_data(hass).get(DATA_CACHE, {"templates": {}, "destinations": {}}))
        current.setdefault("templates", {})[key] = template
        await _async_save_all(hass, current)
        _domain_data(hass)[DATA_CACHE] = current
    connection.send_result(msg["id"], {"key": key, "template": deepcopy(template)})


@websocket_api.websocket_command(
    {vol.Required("type"): WS_DELETE_TEMPLATE, vol.Required("key"): _KEY}
)
@websocket_api.async_response
async def websocket_delete_template(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Delete a global route template."""
    key = str(msg["key"])
    await _async_data(hass)
    async with _lock(hass):
        current = deepcopy(_domain_data(hass).get(DATA_CACHE, {"templates": {}, "destinations": {}}))
        existed = key in current.setdefault("templates", {})
        current["templates"].pop(key, None)
        await _async_save_all(hass, current)
        _domain_data(hass)[DATA_CACHE] = current
    connection.send_result(msg["id"], {"deleted": existed, "key": key})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_SAVE_DESTINATION,
        vol.Required("key"): _KEY,
        vol.Required("destination"): _DESTINATION_SCHEMA,
    }
)
@websocket_api.async_response
async def websocket_save_destination(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Create or update a global named destination."""
    key = str(msg["key"])
    if not key.startswith("destination:"):
        connection.send_error(msg["id"], "invalid_key", "Destination key must start with destination:")
        return
    destination = dict(msg["destination"])
    await _async_data(hass)
    async with _lock(hass):
        current = deepcopy(_domain_data(hass).get(DATA_CACHE, {"templates": {}, "destinations": {}}))
        current.setdefault("destinations", {})[key] = destination
        await _async_save_all(hass, current)
        _domain_data(hass)[DATA_CACHE] = current
    connection.send_result(msg["id"], {"key": key, "destination": deepcopy(destination)})


@websocket_api.websocket_command(
    {vol.Required("type"): WS_DELETE_DESTINATION, vol.Required("key"): _KEY}
)
@websocket_api.async_response
async def websocket_delete_destination(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Delete a global named destination."""
    key = str(msg["key"])
    await _async_data(hass)
    async with _lock(hass):
        current = deepcopy(_domain_data(hass).get(DATA_CACHE, {"templates": {}, "destinations": {}}))
        existed = key in current.setdefault("destinations", {})
        current["destinations"].pop(key, None)
        await _async_save_all(hass, current)
        _domain_data(hass)[DATA_CACHE] = current
    connection.send_result(msg["id"], {"deleted": existed, "key": key})


async def _async_geocode(hass: HomeAssistant, query: str, limit: int) -> list[dict[str, Any]]:
    normalized = " ".join(query.split()).casefold()
    now = monotonic()
    domain_data = _domain_data(hass)
    cache = domain_data.setdefault(DATA_GEOCODE_CACHE, {})
    cached = cache.get(normalized)
    if isinstance(cached, dict) and now - float(cached.get("at", 0)) < GEOCODE_CACHE_TTL:
        return deepcopy(cached.get("results", []))[:limit]

    geocode_lock = domain_data.get(DATA_NOMINATIM_LOCK)
    if geocode_lock is None:
        geocode_lock = asyncio.Lock()
        domain_data[DATA_NOMINATIM_LOCK] = geocode_lock

    async with geocode_lock:
        last_request = domain_data.get(DATA_NOMINATIM_LAST_REQUEST)
        if isinstance(last_request, (int, float)):
            wait = NOMINATIM_MIN_REQUEST_INTERVAL - (monotonic() - float(last_request))
            if wait > 0:
                await asyncio.sleep(wait)
        params: dict[str, str] = {
            "format": "jsonv2",
            "addressdetails": "1",
            "q": query,
            "limit": str(limit),
        }
        language = getattr(hass.config, "language", None)
        if language:
            params["accept-language"] = str(language)
        headers = {
            "User-Agent": "CardataAnalytics/0.1.44 (+https://github.com/lemuba/cardata-analytics)"
        }
        domain_data[DATA_NOMINATIM_LAST_REQUEST] = monotonic()
        session = async_get_clientsession(hass)
        async with session.get(
            NOMINATIM_SEARCH_URL,
            params=params,
            headers=headers,
            timeout=15,
        ) as response:
            if response.status != 200:
                raise RuntimeError(f"Nominatim HTTP {response.status}")
            payload = await response.json(content_type=None)

    results: list[dict[str, Any]] = []
    if isinstance(payload, list):
        for item in payload[:limit]:
            if not isinstance(item, dict):
                continue
            try:
                lat = float(item.get("lat"))
                lon = float(item.get("lon"))
            except (TypeError, ValueError):
                continue
            display_name = str(item.get("display_name") or "").strip()
            name = str(item.get("name") or "").strip()
            if not name:
                address = item.get("address")
                if isinstance(address, dict):
                    name = str(
                        address.get("amenity")
                        or address.get("building")
                        or address.get("road")
                        or address.get("city")
                        or address.get("town")
                        or address.get("village")
                        or ""
                    ).strip()
            results.append(
                {
                    "lat": lat,
                    "lon": lon,
                    "name": name or display_name or f"{lat:.5f}, {lon:.5f}",
                    "address": display_name,
                }
            )
    cache[normalized] = {"at": monotonic(), "results": deepcopy(results)}
    # Keep the in-memory search cache bounded.
    if len(cache) > 80:
        oldest = sorted(cache.items(), key=lambda pair: float(pair[1].get("at", 0)))[:20]
        for key, _ in oldest:
            cache.pop(key, None)
    return results


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_GEOCODE,
        vol.Required("query"): vol.All(str, vol.Strip, vol.Length(min=3, max=160)),
        vol.Optional("limit", default=5): vol.All(vol.Coerce(int), vol.Range(min=1, max=5)),
    }
)
@websocket_api.async_response
async def websocket_geocode(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Geocode an explicitly submitted address through Nominatim."""
    try:
        results = await _async_geocode(hass, str(msg["query"]), int(msg.get("limit", 5)))
    except Exception as err:  # noqa: BLE001 - surfaced as a user-facing WS error
        connection.send_error(msg["id"], "geocode_failed", str(err)[:240])
        return
    connection.send_result(msg["id"], {"results": results})


def async_register_websocket(hass: HomeAssistant) -> None:
    """Register global route/destination websocket commands."""
    websocket_api.async_register_command(hass, websocket_list)
    websocket_api.async_register_command(hass, websocket_save_template)
    websocket_api.async_register_command(hass, websocket_delete_template)
    websocket_api.async_register_command(hass, websocket_save_destination)
    websocket_api.async_register_command(hass, websocket_delete_destination)
    websocket_api.async_register_command(hass, websocket_geocode)
