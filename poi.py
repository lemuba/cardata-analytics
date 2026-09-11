"""Server-side OpenStreetMap POI access for Cardata Analytics."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

WS_TYPE_POI = f"{DOMAIN}/poi"
DATA_POI_CACHE = "poi_cache"
DATA_POI_LOCK = "poi_lock"
DATA_POI_LAST_REQUEST = "poi_last_request"

POI_CACHE_TTL_SECONDS = 15 * 60
POI_MIN_REQUEST_INTERVAL_SECONDS = 1.0
OVERPASS_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)

POI_CLAUSES: dict[str, tuple[str, ...]] = {
    "charging": ('["amenity"="charging_station"]',),
    "workshop": ('["shop"="car_repair"]', '["craft"="car_repair"]'),
    "restaurant": ('["amenity"="restaurant"]',),
    "cafe": ('["amenity"="cafe"]',),
    "parking": ('["amenity"="parking"]',),
    "supermarket": ('["shop"="supermarket"]',),
    "hotel": ('["tourism"="hotel"]',),
    "pharmacy": ('["amenity"="pharmacy"]', '["healthcare"="pharmacy"]'),
    "hospital": ('["amenity"="hospital"]', '["healthcare"="hospital"]'),
    "toilets": ('["amenity"="toilets"]',),
}


def _build_overpass_query(
    latitude: float,
    longitude: float,
    radius_km: int,
    categories: list[str],
    max_results: int,
    timeout_seconds: int,
) -> str:
    """Build a bounded Overpass QL query from validated POI options."""
    radius_m = max(500, radius_km * 1000)
    around = f"(around:{radius_m},{latitude:.6f},{longitude:.6f})"
    clauses: list[str] = []
    for category in sorted(set(categories)):
        for filter_expression in POI_CLAUSES.get(category, ()):  # validated above
            clauses.append(f"nwr{filter_expression}{around};")

    # Keep the server-side timeout slightly below the HTTP timeout so Overpass
    # can return a useful status instead of being cut off by the client first.
    overpass_timeout = max(10, timeout_seconds - 5)
    return (
        f"[out:json][timeout:{overpass_timeout}];"
        f"({''.join(clauses)});"
        f"out tags center qt {max_results};"
    )


def _cache_key(msg: dict[str, Any]) -> tuple[Any, ...]:
    """Return a compact cache key aligned with the browser-side cache grid."""
    return (
        round(float(msg["latitude"]), 3),
        round(float(msg["longitude"]), 3),
        int(msg["radius_km"]),
        tuple(sorted(set(msg["categories"]))),
        int(msg["max_results"]),
    )


async def _async_fetch_overpass(
    hass: HomeAssistant,
    query: str,
    timeout_seconds: int,
) -> tuple[dict[str, Any], str]:
    """Fetch one Overpass response through Home Assistant's HTTP session."""
    session = async_get_clientsession(hass)
    failures: list[str] = []

    for endpoint in OVERPASS_ENDPOINTS:
        host = endpoint.split("/", 3)[2]
        try:
            async with asyncio.timeout(timeout_seconds):
                async with session.post(
                    endpoint,
                    data={"data": query},
                    headers={
                        "Accept": "application/json",
                        "User-Agent": (
                            "Cardata Analytics/0.1.22 "
                            "(https://github.com/lemuba/cardata-analytics)"
                        ),
                    },
                ) as response:
                    if response.status != 200:
                        body = (await response.text())[:180].replace("\n", " ").strip()
                        failures.append(
                            f"{host}: HTTP {response.status}"
                            + (f" ({body})" if body else "")
                        )
                        continue
                    payload = await response.json(content_type=None)
        except TimeoutError:
            failures.append(f"{host}: Timeout nach {timeout_seconds} s")
            continue
        except Exception as err:  # network/DNS/TLS details are useful to the user
            failures.append(f"{host}: {err}")
            continue

        if not isinstance(payload, dict) or not isinstance(payload.get("elements"), list):
            failures.append(f"{host}: ungültige JSON-Antwort")
            continue
        return payload, endpoint

    raise RuntimeError(" · ".join(failures) if failures else "Kein Overpass-Endpunkt verfügbar")


async def _async_get_pois(hass: HomeAssistant, msg: dict[str, Any]) -> dict[str, Any]:
    """Get POIs with integration-level cache and serialized public API access."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    cache: dict[tuple[Any, ...], dict[str, Any]] = domain_data.setdefault(DATA_POI_CACHE, {})
    key = _cache_key(msg)
    now = time.monotonic()

    cached = cache.get(key)
    if cached and now - float(cached.get("stored_at", 0.0)) <= POI_CACHE_TTL_SECONDS:
        return {
            "elements": cached["elements"],
            "endpoint": cached["endpoint"],
            "cached": True,
        }

    lock = domain_data.get(DATA_POI_LOCK)
    if lock is None:
        lock = domain_data[DATA_POI_LOCK] = asyncio.Lock()

    async with lock:
        # Another dashboard may have filled the same key while we were waiting.
        now = time.monotonic()
        cached = cache.get(key)
        if cached and now - float(cached.get("stored_at", 0.0)) <= POI_CACHE_TTL_SECONDS:
            return {
                "elements": cached["elements"],
                "endpoint": cached["endpoint"],
                "cached": True,
            }

        last_request = float(domain_data.get(DATA_POI_LAST_REQUEST, 0.0))
        remaining = POI_MIN_REQUEST_INTERVAL_SECONDS - (time.monotonic() - last_request)
        if remaining > 0:
            await asyncio.sleep(remaining)

        query = _build_overpass_query(
            float(msg["latitude"]),
            float(msg["longitude"]),
            int(msg["radius_km"]),
            list(msg["categories"]),
            int(msg["max_results"]),
            int(msg["timeout_seconds"]),
        )
        domain_data[DATA_POI_LAST_REQUEST] = time.monotonic()
        payload, endpoint = await _async_fetch_overpass(
            hass,
            query,
            int(msg["timeout_seconds"]),
        )

        result = {
            "elements": payload["elements"],
            "endpoint": endpoint,
            "stored_at": time.monotonic(),
        }
        cache[key] = result

        # Keep the in-memory integration cache deliberately small.
        if len(cache) > 12:
            oldest = sorted(cache.items(), key=lambda item: float(item[1].get("stored_at", 0.0)))
            for old_key, _value in oldest[:-12]:
                cache.pop(old_key, None)

        return {
            "elements": result["elements"],
            "endpoint": endpoint,
            "cached": False,
        }


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_TYPE_POI,
        vol.Required("latitude"): vol.All(vol.Coerce(float), vol.Range(min=-90, max=90)),
        vol.Required("longitude"): vol.All(vol.Coerce(float), vol.Range(min=-180, max=180)),
        vol.Required("radius_km"): vol.In([2, 5, 10, 25, 50]),
        vol.Required("categories"): vol.All(
            [vol.In(tuple(POI_CLAUSES))],
            vol.Length(min=1, max=len(POI_CLAUSES)),
        ),
        vol.Optional("max_results", default=500): vol.All(
            vol.Coerce(int), vol.Range(min=50, max=1000)
        ),
        vol.Optional("timeout_seconds", default=35): vol.All(
            vol.Coerce(int), vol.Range(min=15, max=90)
        ),
    }
)
@websocket_api.async_response
async def websocket_get_pois(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle a POI request from the Cardata Analytics map card."""
    try:
        result = await _async_get_pois(hass, msg)
    except Exception as err:
        _LOGGER.warning("Cardata Analytics POI request failed: %s", err)
        connection.send_error(msg["id"], "poi_fetch_failed", str(err))
        return

    connection.send_result(msg["id"], result)


def async_register_websocket(hass: HomeAssistant) -> None:
    """Register the integration's POI websocket command."""
    websocket_api.async_register_command(hass, websocket_get_pois)
