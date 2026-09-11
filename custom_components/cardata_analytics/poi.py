"""Server-side OpenStreetMap POI access for Cardata Analytics."""

from __future__ import annotations

import asyncio
import logging
import re
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
DATA_POI_INFLIGHT = "poi_inflight"
DATA_POI_SEMAPHORE = "poi_semaphore"
DATA_POI_LAST_REQUEST = "poi_last_request"
DATA_POI_ENDPOINT_HEALTH = "poi_endpoint_health"
DATA_POI_PREFERRED_ENDPOINT = "poi_preferred_endpoint"

POI_CACHE_TTL_SECONDS = 15 * 60
POI_MIN_REQUEST_INTERVAL_SECONDS = 0.75
POI_MAX_CONCURRENT_REQUESTS = 2
POI_SEMAPHORE_WAIT_SECONDS = 8.0
POI_ENDPOINT_COOLDOWN_SECONDS = 60.0
POI_ENDPOINT_RATE_LIMIT_COOLDOWN_SECONDS = 120.0

# Current public global instances. private.coffee is the successor of the old
# kumi.systems public endpoint. A short per-endpoint attempt budget plus health
# cooldowns prevents one unhealthy public instance from stalling the whole card.
OVERPASS_ENDPOINTS = (
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.osm.jp/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
)

POI_CLAUSES: dict[str, tuple[str, ...]] = {
    "charging": ('["amenity"="charging_station"]',),
    "fuel": ('["amenity"="fuel"]',),
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
    search_filter: str = "",
    operator_filter: str = "",
    connector_filter: str = "any",
) -> str:
    """Build a bounded Overpass QL query from validated POI options."""
    radius_m = max(500, radius_km * 1000)
    around = f"(around:{radius_m},{latitude:.6f},{longitude:.6f})"
    clauses: list[str] = []
    search_filter = search_filter.strip()[:80]
    operator_filter = operator_filter.strip()[:80]
    connector_filter = (
        connector_filter
        if connector_filter in {"any", "ccs", "type2", "chademo", "tesla"}
        else "any"
    )

    search_regex = re.escape(search_filter).replace('"', r'\"') if search_filter else ""
    operator_regex = re.escape(operator_filter).replace('"', r'\"') if operator_filter else ""
    search_expression = (
        f'[~"^(name|brand|operator|network|addr:street|addr:city|addr:postcode|addr:housename)$"~"{search_regex}",i]'
        if search_regex
        else ""
    )
    operator_expression = (
        f'[~"^(name|brand|operator|network)$"~"{operator_regex}",i]'
        if operator_regex
        else ""
    )
    connector_variants = {
        "any": [""],
        "ccs": [
            '["socket:ccs"]',
            '["socket:type2_combo"]',
            '["socket:ccs:output"]',
            '["socket:type2_combo:output"]',
        ],
        "type2": ['["socket:type2"]', '["socket:type2:output"]'],
        "chademo": ['["socket:chademo"]', '["socket:chademo:output"]'],
        "tesla": [
            '["socket:tesla_supercharger"]',
            '["socket:tesla_destination"]',
            '["socket:tesla_supercharger:output"]',
            '["socket:tesla_destination:output"]',
        ],
    }

    for category in sorted(set(categories)):
        for filter_expression in POI_CLAUSES.get(category, ()):
            connectors = connector_variants[connector_filter] if category == "charging" else [""]
            for connector_expression in connectors:
                clauses.append(
                    f"nwr{filter_expression}{search_expression}{operator_expression}{connector_expression}{around};"
                )

    # The Overpass-side timeout is lower than our total HTTP/failover budget.
    # Large-radius targeted searches can still use up to 45 s internally, while
    # each individual public endpoint gets only a short client attempt window.
    overpass_timeout = max(10, min(45, timeout_seconds - 5))
    return (
        f"[out:json][timeout:{overpass_timeout}];"
        f"({''.join(clauses)});"
        # `out center` preserves node coordinates and adds a center to ways /
        # relations. `out tags center` must not be used because it drops node
        # coordinates and silently makes most POIs unusable in the frontend.
        f"out center qt {max_results};"
    )


def _cache_key(msg: dict[str, Any]) -> tuple[Any, ...]:
    """Return a compact cache key aligned with the browser-side cache grid."""
    return (
        round(float(msg["latitude"]), 3),
        round(float(msg["longitude"]), 3),
        int(msg["radius_km"]),
        tuple(sorted(set(msg["categories"]))),
        int(msg["max_results"]),
        str(msg.get("search_filter", "")).strip().lower(),
        str(msg.get("operator_filter", "")).strip().lower(),
        str(msg.get("connector_filter", "any")),
    )


def _endpoint_host(endpoint: str) -> str:
    return endpoint.split("/", 3)[2]


def _ordered_endpoints(domain_data: dict[str, Any], now: float) -> list[str]:
    """Return healthy endpoints, preferring the most recently successful one."""
    health: dict[str, dict[str, Any]] = domain_data.setdefault(DATA_POI_ENDPOINT_HEALTH, {})
    preferred = str(domain_data.get(DATA_POI_PREFERRED_ENDPOINT, ""))
    available = [
        endpoint
        for endpoint in OVERPASS_ENDPOINTS
        if float(health.get(endpoint, {}).get("cooldown_until", 0.0)) <= now
    ]
    if not available:
        # If all endpoints are cooling down, allow only the one whose cooldown
        # expires first. This avoids an artificial permanent outage.
        return [
            min(
                OVERPASS_ENDPOINTS,
                key=lambda endpoint: float(health.get(endpoint, {}).get("cooldown_until", 0.0)),
            )
        ]
    if preferred in available:
        available.remove(preferred)
        available.insert(0, preferred)
    return available


def _mark_endpoint_failure(
    domain_data: dict[str, Any], endpoint: str, status: int | None = None
) -> None:
    health: dict[str, dict[str, Any]] = domain_data.setdefault(DATA_POI_ENDPOINT_HEALTH, {})
    state = health.setdefault(endpoint, {})
    failures = int(state.get("failures", 0)) + 1
    state["failures"] = failures
    cooldown = (
        POI_ENDPOINT_RATE_LIMIT_COOLDOWN_SECONDS
        if status in {406, 429}
        else POI_ENDPOINT_COOLDOWN_SECONDS
    )
    # Escalate repeated failures, but cap the cooldown so endpoints recover.
    state["cooldown_until"] = time.monotonic() + min(10 * 60, cooldown * min(4, failures))


def _mark_endpoint_success(domain_data: dict[str, Any], endpoint: str) -> None:
    health: dict[str, dict[str, Any]] = domain_data.setdefault(DATA_POI_ENDPOINT_HEALTH, {})
    health[endpoint] = {"failures": 0, "cooldown_until": 0.0}
    domain_data[DATA_POI_PREFERRED_ENDPOINT] = endpoint


async def _async_fetch_overpass(
    hass: HomeAssistant,
    query: str,
    timeout_seconds: int,
) -> tuple[dict[str, Any], str]:
    """Fetch Overpass with one total deadline and endpoint health failover."""
    session = async_get_clientsession(hass)
    domain_data = hass.data.setdefault(DOMAIN, {})
    failures: list[str] = []
    started = time.monotonic()
    deadline = started + max(15, timeout_seconds)
    endpoints = _ordered_endpoints(domain_data, started)

    for index, endpoint in enumerate(endpoints):
        remaining_total = deadline - time.monotonic()
        if remaining_total <= 2.0:
            break
        host = _endpoint_host(endpoint)
        endpoints_left = max(1, len(endpoints) - index)
        # Split the remaining total budget across remaining endpoints, with a
        # practical 12 s cap. A dead first server therefore cannot consume the
        # entire 35 s card timeout before failover is attempted. Keep the final
        # attempt inside the overall deadline as well.
        fair_share = remaining_total / endpoints_left
        attempt_timeout = min(
            12.0,
            max(3.0, fair_share),
            max(1.0, remaining_total - 0.5),
        )
        try:
            async with asyncio.timeout(attempt_timeout):
                async with session.post(
                    endpoint,
                    data={"data": query},
                    headers={
                        "Accept": "application/json",
                        "User-Agent": (
                            "Cardata Analytics/0.1.28 "
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
                        _mark_endpoint_failure(domain_data, endpoint, response.status)
                        continue
                    payload = await response.json(content_type=None)
        except TimeoutError:
            failures.append(f"{host}: Timeout nach {attempt_timeout:.0f} s")
            _mark_endpoint_failure(domain_data, endpoint)
            continue
        except Exception as err:
            failures.append(f"{host}: {err}")
            _mark_endpoint_failure(domain_data, endpoint)
            continue

        if not isinstance(payload, dict) or not isinstance(payload.get("elements"), list):
            failures.append(f"{host}: ungültige JSON-Antwort")
            _mark_endpoint_failure(domain_data, endpoint)
            continue

        _mark_endpoint_success(domain_data, endpoint)
        return payload, endpoint

    elapsed = time.monotonic() - started
    detail = " · ".join(failures) if failures else "Kein gesunder Overpass-Endpunkt verfügbar"
    raise RuntimeError(f"{detail} · Gesamtzeit {elapsed:.1f} s")


async def _async_network_query(hass: HomeAssistant, msg: dict[str, Any]) -> dict[str, Any]:
    """Run one bounded network query under a small global concurrency limit."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    semaphore = domain_data.get(DATA_POI_SEMAPHORE)
    if semaphore is None:
        semaphore = domain_data[DATA_POI_SEMAPHORE] = asyncio.Semaphore(
            POI_MAX_CONCURRENT_REQUESTS
        )

    try:
        async with asyncio.timeout(POI_SEMAPHORE_WAIT_SECONDS):
            await semaphore.acquire()
    except TimeoutError as err:
        raise RuntimeError(
            "POI-Dienst ist gerade beschäftigt; bitte in wenigen Sekunden erneut versuchen"
        ) from err

    started = time.monotonic()
    try:
        # Keep starts slightly apart even when two dashboards/cards query at once.
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
            str(msg.get("search_filter", "")),
            str(msg.get("operator_filter", "")),
            str(msg.get("connector_filter", "any")),
        )
        domain_data[DATA_POI_LAST_REQUEST] = time.monotonic()
        payload, endpoint = await _async_fetch_overpass(
            hass,
            query,
            int(msg["timeout_seconds"]),
        )
        return {
            "elements": payload["elements"],
            "endpoint": endpoint,
            "stored_at": time.monotonic(),
            "elapsed_ms": int((time.monotonic() - started) * 1000),
        }
    finally:
        semaphore.release()


async def _async_get_pois(hass: HomeAssistant, msg: dict[str, Any]) -> dict[str, Any]:
    """Get POIs with cache plus same-query single-flight deduplication."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    cache: dict[tuple[Any, ...], dict[str, Any]] = domain_data.setdefault(DATA_POI_CACHE, {})
    inflight: dict[tuple[Any, ...], asyncio.Task[dict[str, Any]]] = domain_data.setdefault(
        DATA_POI_INFLIGHT, {}
    )
    key = _cache_key(msg)
    now = time.monotonic()
    force_refresh = bool(msg.get("force_refresh", False))

    cached = None if force_refresh else cache.get(key)
    if (
        cached
        and cached.get("elements")
        and now - float(cached.get("stored_at", 0.0)) <= POI_CACHE_TTL_SECONDS
    ):
        return {
            "elements": cached["elements"],
            "endpoint": cached["endpoint"],
            "cached": True,
            "elapsed_ms": 0,
        }

    # If an identical query is already running, share it instead of sending a
    # duplicate request to public Overpass infrastructure. This also protects
    # users who have the dashboard open simultaneously on desktop and tablet.
    task = inflight.get(key)
    if task is None or task.done():
        task = hass.async_create_task(_async_network_query(hass, msg))
        inflight[key] = task

        def _cleanup(done_task: asyncio.Task[dict[str, Any]], *, cache_key: tuple[Any, ...] = key) -> None:
            if inflight.get(cache_key) is done_task:
                inflight.pop(cache_key, None)
            # Consume a possible exception when every websocket client vanished
            # before the shared task completed; active awaiters still receive it.
            if not done_task.cancelled():
                try:
                    done_task.exception()
                except Exception:
                    pass

        task.add_done_callback(_cleanup)

    # A browser/websocket disconnect must not cancel a same-query request that
    # may still be awaited by another dashboard client.
    result = await asyncio.shield(task)

    if result.get("elements"):
        cache[key] = result
        if len(cache) > 16:
            oldest = sorted(
                cache.items(), key=lambda item: float(item[1].get("stored_at", 0.0))
            )
            for old_key, _value in oldest[:-16]:
                cache.pop(old_key, None)
    else:
        cache.pop(key, None)

    return {
        "elements": result["elements"],
        "endpoint": result["endpoint"],
        "cached": False,
        "elapsed_ms": int(result.get("elapsed_ms", 0)),
    }


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_TYPE_POI,
        vol.Required("latitude"): vol.All(vol.Coerce(float), vol.Range(min=-90, max=90)),
        vol.Required("longitude"): vol.All(vol.Coerce(float), vol.Range(min=-180, max=180)),
        vol.Required("radius_km"): vol.In([2, 5, 10, 25, 50, 100, 150, 200]),
        vol.Required("categories"): vol.All(
            [vol.In(tuple(POI_CLAUSES))],
            vol.Length(min=1, max=len(POI_CLAUSES)),
        ),
        vol.Optional("search_filter", default=""): vol.All(str, vol.Length(max=80)),
        vol.Optional("operator_filter", default=""): vol.All(str, vol.Length(max=80)),
        vol.Optional("connector_filter", default="any"): vol.In(
            ["any", "ccs", "type2", "chademo", "tesla"]
        ),
        vol.Optional("force_refresh", default=False): vol.Coerce(bool),
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
