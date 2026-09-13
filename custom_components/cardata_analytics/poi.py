"""Server-side multi-provider POI access for Cardata Analytics."""

from __future__ import annotations

import asyncio
import csv
import gzip
import hashlib
import html
import io
import json
import logging
import math
import re
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import (
    CONF_OCM_API_KEY,
    CONF_OCM_ENABLED,
    DOMAIN,
    ENTRY_KIND_GLOBAL,
    OCM_API_URL,
    OCM_REFERENCE_URL,
)

_LOGGER = logging.getLogger(__name__)

WS_TYPE_POI = f"{DOMAIN}/poi"
DATA_POI_CACHE = "poi_cache"
DATA_POI_INFLIGHT = "poi_inflight"
DATA_POI_SEMAPHORE = "poi_semaphore"
DATA_POI_LAST_REQUEST = "poi_last_request"
DATA_POI_ENDPOINT_HEALTH = "poi_endpoint_health"
DATA_POI_PREFERRED_ENDPOINT = "poi_preferred_endpoint"
DATA_CHARGING_DATASETS = "charging_datasets"
DATA_CHARGING_LOAD_TASKS = "charging_load_tasks"

POI_CACHE_TTL_SECONDS = 15 * 60
POI_MIN_REQUEST_INTERVAL_SECONDS = 0.75
POI_MAX_CONCURRENT_REQUESTS = 2
POI_SEMAPHORE_WAIT_SECONDS = 8.0
POI_ENDPOINT_COOLDOWN_SECONDS = 60.0
POI_ENDPOINT_RATE_LIMIT_COOLDOWN_SECONDS = 120.0
POI_CHARGEPOINT_MERGE_RADIUS_M = 180.0

# Public Overpass instances. They remain the main source for general OSM POIs.
# Charging stations additionally have independent fallbacks below.
OVERPASS_ENDPOINTS = (
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
)

# Charging infrastructure is deliberately bulk-cached locally.  Since 0.1.32
# the Bundesnetzagentur register is the authoritative primary source for German
# charging searches.  The large CSV is downloaded in the background and then
# all radius/operator/connector/power filtering happens locally.  This avoids
# making interactive charging searches depend on Overpass/QLever/AFIR uptime.
# The older AFIR parser remains available for compatibility, but is no longer a
# blocking or required path for user searches.
AFIR_ECOMOVEMENT_PUBLICATION_ID = "954064102947180544"
AFIR_ECOMOVEMENT_URL = (
    "https://mobilithek.info/mdp-api/mdp-conn-server/v1/publication/"
    f"{AFIR_ECOMOVEMENT_PUBLICATION_ID}/file/noauth"
)
BNETZA_PAGE_URLS = (
    "https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/Ladesaeulenkarte/start.html",
    "https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/DownloadundKontakt.html",
)
BNETZA_DATA_BASE = (
    "https://data.bundesnetzagentur.de/Bundesnetzagentur/DE/Fachthemen/"
    "ElektrizitaetundGas/E-Mobilitaet/"
)
BNETZA_FALLBACK_CSV_URL = BNETZA_DATA_BASE + "Ladesaeulenregister_BNetzA_2026-07-28.csv"
CHARGING_DATASET_CACHE_VERSION = 1
CHARGING_AFIR_TTL_SECONDS = 6 * 60 * 60
CHARGING_BNETZA_TTL_SECONDS = 7 * 24 * 60 * 60
CHARGING_MAX_STALE_SECONDS = 45 * 24 * 60 * 60

# Open Charge Map is the active, Europe-wide charging provider from v0.1.33;
# v0.1.34 adds cached reference-data decoding plus compact POI responses.
# Results are cached persistently so interactive radius/filter changes do not
# repeatedly hit the API and a temporary provider outage can use stale data.
OCM_CACHE_VERSION = 1
OCM_CACHE_TTL_SECONDS = 6 * 60 * 60
OCM_CACHE_MAX_STALE_SECONDS = 7 * 24 * 60 * 60
OCM_CACHE_MAX_AREAS = 8
OCM_HTTP_TIMEOUT_SECONDS = 55.0
OCM_REFERENCE_CACHE_VERSION = 1
OCM_REFERENCE_TTL_SECONDS = 7 * 24 * 60 * 60
OCM_REFERENCE_MAX_STALE_SECONDS = 60 * 24 * 60 * 60
OCM_REFERENCE_HTTP_TIMEOUT_SECONDS = 30.0
DATA_OCM_AREA_INFLIGHT = "ocm_area_inflight"
DATA_OCM_REFERENCE_INFLIGHT = "ocm_reference_inflight"
DATA_OCM_CACHE_LOCK = "ocm_cache_lock"

POI_CLAUSES: dict[str, tuple[str, ...]] = {
    "charging": ('["amenity"="charging_station"]',),
    "fuel": ('["amenity"="fuel"]',),
    "workshop": ('["shop"="car_repair"]', '["craft"="car_repair"]'),
    "car_wash": ('["amenity"="car_wash"]',),
    "tyres": ('["shop"="tyres"]',),
    "car_parts": ('["shop"="car_parts"]',),
    "car_rental": ('["amenity"="car_rental"]',),
    "parking": ('["amenity"="parking"]',),
    "parking_garage": ('["amenity"="parking"]["parking"~"^(multi-storey|underground)$"]',),
    "park_ride": ('["amenity"="parking"]["park_ride"~"^(yes|designated)$"]',),
    "restaurant": ('["amenity"="restaurant"]', '["amenity"="fast_food"]', '["amenity"="food_court"]'),
    "cafe": ('["amenity"="cafe"]',),
    "bakery": ('["shop"="bakery"]',),
    "ice_cream": ('["amenity"="ice_cream"]', '["shop"="ice_cream"]'),
    "bar_pub": ('["amenity"="bar"]', '["amenity"="pub"]'),
    "biergarten": ('["amenity"="biergarten"]',),
    "supermarket": ('["shop"="supermarket"]',),
    "convenience": ('["shop"="convenience"]',),
    "mall": ('["shop"="mall"]',),
    "chemist": ('["shop"="chemist"]',),
    "beverages": ('["shop"="beverages"]',),
    "pharmacy": ('["amenity"="pharmacy"]', '["healthcare"="pharmacy"]'),
    "hospital": ('["amenity"="hospital"]', '["healthcare"="hospital"]'),
    "doctors": ('["amenity"="doctors"]', '["healthcare"="doctor"]'),
    "dentist": ('["amenity"="dentist"]', '["healthcare"="dentist"]'),
    "clinic": ('["amenity"="clinic"]', '["healthcare"="clinic"]'),
    "veterinarian": ('["amenity"="veterinary"]',),
    "hotel": ('["tourism"="hotel"]',),
    "motel": ('["tourism"="motel"]',),
    "hostel": ('["tourism"="hostel"]',),
    "camping": ('["tourism"="camp_site"]',),
    "caravan_site": ('["tourism"="caravan_site"]',),
    "toilets": ('["amenity"="toilets"]',),
    "drinking_water": ('["amenity"="drinking_water"]',),
    "rest_area": ('["highway"="rest_area"]', '["highway"="services"]'),
    "picnic_site": ('["tourism"="picnic_site"]',),
    "shower": ('["amenity"="shower"]',),
    "atm": ('["amenity"="atm"]',),
    "bank": ('["amenity"="bank"]',),
    "post_office": ('["amenity"="post_office"]',),
    "parcel_locker": ('["amenity"="parcel_locker"]',),
    "railway_station": ('["railway"="station"]',),
    "bus_station": ('["amenity"="bus_station"]',),
    "airport": ('["aeroway"="aerodrome"]',),
    "ferry_terminal": ('["amenity"="ferry_terminal"]',),
    "taxi": ('["amenity"="taxi"]',),
    "museum": ('["tourism"="museum"]',),
    "attraction": ('["tourism"="attraction"]',),
    "viewpoint": ('["tourism"="viewpoint"]',),
    "castle": ('["historic"="castle"]',),
    "monument": ('["historic"="monument"]', '["historic"="memorial"]'),
    "zoo": ('["tourism"="zoo"]',),
    "theme_park": ('["tourism"="theme_park"]',),
    "swimming_pool": ('["leisure"="swimming_pool"]',),
    "police": ('["amenity"="police"]',),
    "fire_station": ('["amenity"="fire_station"]',),
    "ambulance_station": ('["emergency"="ambulance_station"]',),
}


def _build_text_expressions(search_filter: str, operator_filter: str) -> tuple[str, str]:
    """Build case-insensitive text filters tolerant of punctuation/spacing.

    OSM chain names commonly contain punctuation or spaces (for example
    ``McDonald's`` / ``Burger King``), while users may type ``McDonalds`` or
    ``BurgerKing``.  Between the alphanumeric characters of the user input we
    therefore allow only non-alphanumeric separators.  This keeps the regex
    selective while making common brand spellings equivalent.  Client-side
    normalization performs the final match.
    """

    def _regex(value: str) -> str:
        raw = value.strip()[:80]
        if not raw:
            return ""
        chars = [ch for ch in raw if ch.isalnum()]
        if not chars:
            return re.escape(raw).replace('"', r'\"')
        # Cap the server-side pattern; the client still applies the complete
        # normalized search text after the response is received.
        chars = chars[:48]
        return "[^A-Za-z0-9]*".join(
            re.escape(ch).replace('"', r'\"') for ch in chars
        )

    search_regex = _regex(search_filter)
    operator_regex = _regex(operator_filter)
    search_expression = (
        f'[~"^(name|brand|operator|network|cuisine|addr:street|addr:city|addr:postcode|addr:housename)$"~"{search_regex}",i]'
        if search_regex
        else ""
    )
    operator_expression = (
        f'[~"^(name|brand|operator|network)$"~"{operator_regex}",i]'
        if operator_regex
        else ""
    )
    return search_expression, operator_expression


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
    """Build a bounded Overpass query without prematurely filtering EV sockets.

    A charging location can be mapped as ``amenity=charging_station`` while its
    individual sockets/power live on nearby ``man_made=charge_point`` objects.
    Therefore connector filters must not be pushed onto the station object.
    """
    del connector_filter  # connector filtering happens after charge-point aggregation
    radius_m = max(500, radius_km * 1000)
    around = f"(around:{radius_m},{latitude:.6f},{longitude:.6f})"
    search_expression, operator_expression = _build_text_expressions(
        search_filter, operator_filter
    )
    statements: list[str] = []
    output_sets: list[str] = []

    unique_categories = sorted(set(categories))
    if "charging" in unique_categories:
        # First find matching station objects, then pull all separately mapped
        # charge points near those stations. A second targeted charge-point set
        # catches operators that are tagged only on the individual charge point.
        statements.append(
            f'nwr["amenity"="charging_station"]{search_expression}{operator_expression}{around}'
            "->.cardata_charge_stations;"
        )
        statements.append(
            'nwr["man_made"="charge_point"](around.cardata_charge_stations:'
            f"{int(POI_CHARGEPOINT_MERGE_RADIUS_M)})->.cardata_nearby_chargepoints;"
        )
        statements.append(
            f'nwr["man_made"="charge_point"]{search_expression}{operator_expression}{around}'
            "->.cardata_direct_chargepoints;"
        )
        output_sets.extend(
            [
                ".cardata_charge_stations;",
                ".cardata_nearby_chargepoints;",
                ".cardata_direct_chargepoints;",
            ]
        )

    general_clauses: list[str] = []
    for category in unique_categories:
        if category == "charging":
            continue
        for filter_expression in POI_CLAUSES.get(category, ()):
            general_clauses.append(
                f"nwr{filter_expression}{search_expression}{operator_expression}{around};"
            )
    if general_clauses:
        statements.append(f"({''.join(general_clauses)})->.cardata_general;"
        )
        output_sets.append(".cardata_general;")

    # EV aggregation needs extra headroom for separately mapped charge points.
    result_limit = min(3000, max(max_results, max_results * (3 if "charging" in unique_categories else 1)))
    overpass_timeout = max(10, min(45, timeout_seconds - 5))
    return (
        f"[out:json][timeout:{overpass_timeout}];"
        f"{''.join(statements)}"
        f"({''.join(output_sets)});"
        f"out center qt {result_limit};"
    )


def _cache_key(msg: dict[str, Any]) -> tuple[Any, ...]:
    return (
        round(float(msg["latitude"]), 3),
        round(float(msg["longitude"]), 3),
        int(msg["radius_km"]),
        tuple(sorted(set(msg["categories"]))),
        int(msg["max_results"]),
        str(msg.get("operator_filter", "")).strip().lower() if "charging" in set(msg["categories"]) else "",
        str(msg.get("connector_filter", "any")) if "charging" in set(msg["categories"]) else "any",
    )


def _endpoint_host(endpoint: str) -> str:
    return endpoint.split("/", 3)[2]


def _ordered_endpoints(domain_data: dict[str, Any], now: float) -> list[str]:
    health: dict[str, dict[str, Any]] = domain_data.setdefault(DATA_POI_ENDPOINT_HEALTH, {})
    preferred = str(domain_data.get(DATA_POI_PREFERRED_ENDPOINT, ""))
    available = [
        endpoint
        for endpoint in OVERPASS_ENDPOINTS
        if float(health.get(endpoint, {}).get("cooldown_until", 0.0)) <= now
    ]
    if not available:
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
    state["cooldown_until"] = time.monotonic() + min(10 * 60, cooldown * min(4, failures))


def _mark_endpoint_success(domain_data: dict[str, Any], endpoint: str) -> None:
    health: dict[str, dict[str, Any]] = domain_data.setdefault(DATA_POI_ENDPOINT_HEALTH, {})
    health[endpoint] = {"failures": 0, "cooldown_until": 0.0}
    domain_data[DATA_POI_PREFERRED_ENDPOINT] = endpoint


async def _async_fetch_overpass(
    hass: HomeAssistant,
    query: str,
    timeout_seconds: int,
) -> tuple[list[dict[str, Any]], str]:
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
        fair_share = remaining_total / endpoints_left
        attempt_timeout = min(12.0, max(3.0, fair_share), max(1.0, remaining_total - 0.5))
        try:
            async with asyncio.timeout(attempt_timeout):
                async with session.post(
                    endpoint,
                    data={"data": query},
                    headers={
                        "Accept": "application/json",
                        "User-Agent": (
                            "Cardata Analytics/0.1.42 "
                            "(https://github.com/lemuba/cardata-analytics)"
                        ),
                    },
                ) as response:
                    if response.status != 200:
                        body = (await response.text())[:180].replace("\n", " ").strip()
                        failures.append(
                            f"{host}: HTTP {response.status}" + (f" ({body})" if body else "")
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
        return list(payload["elements"]), endpoint

    elapsed = time.monotonic() - started
    detail = " · ".join(failures) if failures else "Kein gesunder Overpass-Endpunkt verfügbar"
    raise RuntimeError(f"{detail} · Gesamtzeit {elapsed:.1f} s")


def _element_coords(element: dict[str, Any]) -> tuple[float, float] | None:
    lat = element.get("lat")
    lon = element.get("lon")
    if lat is None or lon is None:
        center = element.get("center") or {}
        lat = center.get("lat")
        lon = center.get("lon")
    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except (TypeError, ValueError):
        return None
    if not (-90 <= lat_f <= 90 and -180 <= lon_f <= 180):
        return None
    return lat_f, lon_f


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371008.8
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1 - a)))


def _parse_power_kw(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).replace(",", ".")
    best: float | None = None
    for number_text, unit in re.findall(r"(\d+(?:\.\d+)?)\s*(MW|kW|W)?", text, flags=re.I):
        number = float(number_text)
        unit_l = (unit or "kW").lower()
        if unit_l == "mw":
            number *= 1000
        elif unit_l == "w":
            number /= 1000
        if number > 0 and (best is None or number > best):
            best = number
    return best


def _truthy_tag(value: Any) -> bool:
    normalized = str(value if value is not None else "").strip().lower()
    return bool(normalized) and normalized not in {"0", "no", "false", "none", "nein", "n"}


def _merge_charge_tags(base: dict[str, Any], extra: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    fill_keys = (
        "name", "brand", "operator", "network", "opening_hours", "access", "fee",
        "phone", "contact:phone", "website", "contact:website", "addr:street",
        "addr:housenumber", "addr:postcode", "addr:city", "addr:place", "addr:full",
        "ref:EU:EVSE",
    )
    for key in fill_keys:
        if not merged.get(key) and extra.get(key):
            merged[key] = extra[key]

    for key, value in extra.items():
        if not key.startswith("socket:") and key not in {"charging_station:output", "max_power", "output"}:
            continue
        if key.endswith(":output") or key in {"charging_station:output", "max_power", "output"}:
            current_kw = _parse_power_kw(merged.get(key))
            new_kw = _parse_power_kw(value)
            if new_kw is not None and (current_kw is None or new_kw > current_kw):
                merged[key] = f"{new_kw:g} kW"
            continue
        if not _truthy_tag(value):
            continue
        current = merged.get(key)
        try:
            current_count = int(str(current)) if current is not None else 0
            new_count = int(str(value))
            if current_count > 0 or new_count > 0:
                merged[key] = str(max(0, current_count) + max(0, new_count))
                continue
        except (TypeError, ValueError):
            pass
        if not _truthy_tag(current):
            merged[key] = "yes"

    return merged


def _aggregate_osm_charging(
    elements: list[dict[str, Any]], provider: str
) -> list[dict[str, Any]]:
    """Merge separately mapped OSM charge points into nearby station objects."""
    stations: list[dict[str, Any]] = []
    chargepoints: list[dict[str, Any]] = []
    others: list[dict[str, Any]] = []

    for original in elements:
        element = dict(original)
        tags = dict(element.get("tags") or {})
        element["tags"] = tags
        element["provider"] = provider
        if tags.get("amenity") == "charging_station":
            stations.append(element)
        elif tags.get("man_made") == "charge_point":
            chargepoints.append(element)
        else:
            others.append(element)

    station_coords = [_element_coords(item) for item in stations]
    child_counts = [0] * len(stations)
    promoted: list[dict[str, Any]] = []

    for chargepoint in chargepoints:
        cp_coords = _element_coords(chargepoint)
        if cp_coords is None:
            continue
        nearest_index: int | None = None
        nearest_distance = POI_CHARGEPOINT_MERGE_RADIUS_M + 1
        for index, coords in enumerate(station_coords):
            if coords is None:
                continue
            distance = _haversine_m(cp_coords[0], cp_coords[1], coords[0], coords[1])
            if distance <= POI_CHARGEPOINT_MERGE_RADIUS_M and distance < nearest_distance:
                nearest_index = index
                nearest_distance = distance
        if nearest_index is not None:
            station = stations[nearest_index]
            station["tags"] = _merge_charge_tags(station.get("tags") or {}, chargepoint.get("tags") or {})
            child_counts[nearest_index] += 1
            continue

        promoted_item = dict(chargepoint)
        promoted_tags = dict(chargepoint.get("tags") or {})
        promoted_tags["amenity"] = "charging_station"
        promoted_tags["cardata:promoted_charge_point"] = "yes"
        promoted_item["tags"] = promoted_tags
        promoted.append(promoted_item)

    for index, station in enumerate(stations):
        count = child_counts[index]
        if count:
            tags = station.get("tags") or {}
            try:
                existing = int(str(tags.get("capacity", "0")))
            except ValueError:
                existing = 0
            if count > existing:
                tags["capacity"] = str(count)

    return others + stations + promoted


def _dataset_cache_path(hass: HomeAssistant, provider: str) -> Path:
    return Path(
        hass.config.path(
            ".storage",
            f"{DOMAIN}_charging_{provider}_v{CHARGING_DATASET_CACHE_VERSION}.json.gz",
        )
    )


def _read_dataset_cache(path: Path) -> dict[str, Any] | None:
    try:
        if not path.exists():
            return None
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            payload = json.load(handle)
        if not isinstance(payload, dict) or not isinstance(payload.get("elements"), list):
            return None
        return payload
    except Exception:
        return None


def _write_dataset_cache(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with gzip.open(tmp, "wt", encoding="utf-8", compresslevel=5) as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
    tmp.replace(path)


def _stable_provider_id(provider: str, *parts: Any) -> str:
    raw = "|".join(str(part or "") for part in parts).encode("utf-8", "ignore")
    return f"{provider}-{hashlib.blake2s(raw, digest_size=10).hexdigest()}"


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def _multi_text(value: Any) -> str:
    """Return the first useful human-readable value from DATEX multilingual data."""
    if value is None:
        return ""
    if isinstance(value, (str, int, float)):
        return str(value).strip()
    if isinstance(value, list):
        for item in value:
            text = _multi_text(item)
            if text:
                return text
        return ""
    if isinstance(value, dict):
        values = value.get("values")
        if isinstance(values, list):
            for item in values:
                if isinstance(item, dict) and item.get("value") not in (None, ""):
                    return str(item["value"]).strip()
        direct = value.get("value")
        if isinstance(direct, (str, int, float)) and str(direct).strip():
            return str(direct).strip()
        for key in ("name", "text", "label", "description"):
            if key in value:
                text = _multi_text(value[key])
                if text:
                    return text
    return ""


def _recursive_named_value(value: Any, wanted_keys: tuple[str, ...]) -> str:
    if isinstance(value, dict):
        for key in wanted_keys:
            if key in value:
                text = _multi_text(value[key])
                if text:
                    return text
        for child in value.values():
            text = _recursive_named_value(child, wanted_keys)
            if text:
                return text
    elif isinstance(value, list):
        for child in value:
            text = _recursive_named_value(child, wanted_keys)
            if text:
                return text
    return ""


def _afir_coordinates(site: dict[str, Any]) -> tuple[float, float] | None:
    def _walk(value: Any) -> tuple[float, float] | None:
        if isinstance(value, dict):
            if "latitude" in value and "longitude" in value:
                try:
                    lat = float(value["latitude"])
                    lon = float(value["longitude"])
                    if -90 <= lat <= 90 and -180 <= lon <= 180:
                        return lat, lon
                except (TypeError, ValueError):
                    pass
            # Prefer actual display coordinates before traversing arbitrary branches.
            display = value.get("coordinatesForDisplay")
            if isinstance(display, dict):
                found = _walk(display)
                if found:
                    return found
            for child in value.values():
                found = _walk(child)
                if found:
                    return found
        elif isinstance(value, list):
            for child in value:
                found = _walk(child)
                if found:
                    return found
        return None

    return _walk(site.get("locationReference") or site)


def _afir_address(site: dict[str, Any]) -> dict[str, str]:
    address: dict[str, Any] | None = None

    def _find(value: Any) -> None:
        nonlocal address
        if address is not None:
            return
        if isinstance(value, dict):
            candidate = value.get("address")
            if isinstance(candidate, dict):
                address = candidate
                return
            for child in value.values():
                _find(child)
        elif isinstance(value, list):
            for child in value:
                _find(child)

    _find(site.get("locationReference") or site)
    if not address:
        return {}
    city = _multi_text(address.get("city"))
    postcode = str(address.get("postcode") or "").strip()
    country = str(address.get("countryCode") or "").strip()
    lines: list[str] = []
    for line in _as_list(address.get("addressLine")):
        if isinstance(line, dict):
            text = _multi_text(line.get("text"))
            if text:
                lines.append(text)
    out: dict[str, str] = {}
    if lines:
        out["addr:street"] = lines[0]
        if len(lines) > 1:
            out["addr:full"] = ", ".join(lines)
    if postcode:
        out["addr:postcode"] = postcode
    if city:
        out["addr:city"] = city
    if country:
        out["addr:country"] = country
    return out


def _connector_key_from_text(value: Any) -> str | None:
    text = re.sub(r"[^a-z0-9]+", "", _multi_text(value).lower())
    if not text:
        return None
    if "chademo" in text:
        return "socket:chademo"
    if "combo" in text or "ccs" in text or "type2combo" in text:
        return "socket:type2_combo"
    if "tesla" in text:
        return "socket:tesla_supercharger"
    if "type2" in text or "iec62196" in text:
        return "socket:type2"
    return None


def _power_kw_from_watts(value: Any) -> float | None:
    try:
        power = float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return None
    if power <= 0:
        return None
    # DATEX maxPowerAtSocket / totalMaximumPower are specified in watts.  Keep
    # compatibility with feeds that already serialize a small kW value.
    return power / 1000.0 if power > 1000 else power


def _parse_afir_payload(payload: Any) -> list[dict[str, Any]]:
    root = payload.get("payload", payload) if isinstance(payload, dict) else {}
    publication = None
    if isinstance(root, dict):
        for key in (
            "aegiEnergyInfrastructureTablePublication",
            "energyInfrastructureTablePublication",
        ):
            if isinstance(root.get(key), dict):
                publication = root[key]
                break
        if publication is None:
            for key, value in root.items():
                if key.lower().endswith("energyinfrastructuretablepublication") and isinstance(value, dict):
                    publication = value
                    break
    if not isinstance(publication, dict):
        raise ValueError("AFIR: EnergyInfrastructureTablePublication fehlt")

    result: list[dict[str, Any]] = []
    tables = _as_list(publication.get("energyInfrastructureTable"))
    for table in tables:
        if not isinstance(table, dict):
            continue
        for site in _as_list(table.get("energyInfrastructureSite")):
            if not isinstance(site, dict):
                continue
            coords = _afir_coordinates(site)
            if coords is None:
                continue
            operator = _recursive_named_value(site.get("operator"), ("name",))
            owner = _recursive_named_value(site.get("owner"), ("name",))
            name = _multi_text(site.get("name")) or operator or owner or "Ladestation"
            tags: dict[str, Any] = {
                "amenity": "charging_station",
                "name": name,
                "operator": operator or owner or None,
                "brand": operator or None,
                "source": "Mobilithek / Eco-Movement (AFIR)",
                "cardata:provider": "afir",
            }
            tags.update(_afir_address(site))

            capacity = 0
            max_power_kw: float | None = None
            socket_counts: dict[str, int] = {}
            socket_power: dict[str, float] = {}
            evse_ids: list[str] = []
            stations = _as_list(site.get("energyInfrastructureStation"))
            for station in stations:
                if not isinstance(station, dict):
                    continue
                station_power = _power_kw_from_watts(station.get("totalMaximumPower"))
                if station_power is not None:
                    max_power_kw = max(max_power_kw or 0.0, station_power)
                try:
                    capacity += max(0, int(station.get("numberOfRefillPoints") or 0))
                except (TypeError, ValueError):
                    pass
                refill_points = _as_list(station.get("refillPoint"))
                if not station.get("numberOfRefillPoints"):
                    capacity += len(refill_points)
                for refill in refill_points:
                    if not isinstance(refill, dict):
                        continue
                    cp = None
                    for key, value in refill.items():
                        if key.lower().endswith("electricchargingpoint") and isinstance(value, dict):
                            cp = value
                            break
                    if not isinstance(cp, dict):
                        continue
                    for external in _as_list(cp.get("externalIdentifier")):
                        if isinstance(external, dict):
                            ident = str(external.get("identifier") or "").strip()
                            if ident:
                                evse_ids.append(ident)
                    for connector in _as_list(cp.get("connector")):
                        if not isinstance(connector, dict):
                            continue
                        socket_key = _connector_key_from_text(connector.get("connectorType"))
                        power = _power_kw_from_watts(connector.get("maxPowerAtSocket"))
                        if power is not None:
                            max_power_kw = max(max_power_kw or 0.0, power)
                        if socket_key:
                            socket_counts[socket_key] = socket_counts.get(socket_key, 0) + 1
                            if power is not None:
                                socket_power[socket_key] = max(socket_power.get(socket_key, 0.0), power)

            if capacity:
                tags["capacity"] = str(capacity)
            for socket_key, count in socket_counts.items():
                tags[socket_key] = str(count)
                if socket_power.get(socket_key):
                    tags[f"{socket_key}:output"] = f"{socket_power[socket_key]:g} kW"
            if max_power_kw:
                tags["charging_station:output"] = f"{max_power_kw:g} kW"
            if evse_ids:
                deduped = list(dict.fromkeys(evse_ids))
                tags["ref:EU:EVSE"] = ";".join(deduped[:40])
            identity = " ".join([name, operator, owner, " ".join(evse_ids)]).lower()
            if "ionity" in identity or re.search(r"(?:^|[^a-z0-9])de[*_-]?ioy", identity, re.I):
                tags["network"] = "IONITY"
                if not tags.get("brand"):
                    tags["brand"] = "IONITY"

            site_id = str(site.get("idG") or site.get("id") or "")
            result.append(
                {
                    "type": "afir",
                    "id": site_id or _stable_provider_id("afir", coords[0], coords[1], name, operator),
                    "lat": coords[0],
                    "lon": coords[1],
                    "tags": {k: v for k, v in tags.items() if v not in (None, "")},
                    "provider": "afir",
                }
            )
    if not result:
        raise ValueError("AFIR: keine verwertbaren Ladeorte im Datensatz")
    return result


def _parse_decimal_de(value: Any) -> float | None:
    if value in (None, ""):
        return None
    text = str(value).strip().replace(" ", "").replace(".", "").replace(",", ".")
    # Values already using a dot as the decimal separator should not lose it.
    raw = str(value).strip()
    if "," not in raw and raw.count(".") == 1:
        text = raw
    try:
        return float(text)
    except ValueError:
        return None


def _norm_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower().replace("ä", "a").replace("ö", "o").replace("ü", "u").replace("ß", "ss"))


def _row_value(row: dict[str, Any], *aliases: str) -> str:
    normalized = {_norm_header(str(key)): value for key, value in row.items()}
    for alias in aliases:
        value = normalized.get(_norm_header(alias))
        if value not in (None, ""):
            return str(value).strip()
    return ""


def _bnetza_socket_from_text(text: str) -> str | None:
    low = text.lower()
    if "chademo" in low:
        return "socket:chademo"
    if "combo" in low or "ccs" in low:
        return "socket:type2_combo"
    if "tesla" in low:
        return "socket:tesla_supercharger"
    if "typ 2" in low or "type 2" in low:
        return "socket:type2"
    return None


def _parse_bnetza_csv(content: bytes) -> list[dict[str, Any]]:
    text = None
    for encoding in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise ValueError("Bundesnetzagentur: CSV-Zeichensatz unbekannt")
    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    result: list[dict[str, Any]] = []
    for row in reader:
        if not isinstance(row, dict):
            continue
        lat = _parse_decimal_de(_row_value(row, "Breitengrad"))
        lon = _parse_decimal_de(_row_value(row, "Längengrad", "Langengrad"))
        if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            continue
        operator = _row_value(row, "Betreiber")
        display = _row_value(row, "Anzeigename (Karte)", "Standortbezeichnung")
        name = display or operator or "Ladestation"
        street = _row_value(row, "Straße", "Strasse")
        housenumber = _row_value(row, "Hausnummer")
        postcode = _row_value(row, "Postleitzahl")
        city = _row_value(row, "Ort")
        tags: dict[str, Any] = {
            "amenity": "charging_station",
            "name": name,
            "operator": operator or None,
            "brand": operator or None,
            "addr:street": street or None,
            "addr:housenumber": housenumber or None,
            "addr:postcode": postcode or None,
            "addr:city": city or None,
            "opening_hours": _row_value(row, "Öffnungszeiten", "Offnungszeiten") or None,
            "source": "bundesnetzagentur.de",
            "cardata:provider": "bnetza",
        }
        capacity_text = _row_value(row, "Anzahl Ladepunkte")
        if capacity_text:
            tags["capacity"] = capacity_text
        max_power_kw = _parse_decimal_de(
            _row_value(row, "Nennleistung Ladeeinrichtung [kW]", "Anschlussleistung")
        )
        evse_ids: list[str] = []
        socket_counts: dict[str, int] = {}
        socket_power: dict[str, float] = {}
        for index in range(1, 13):
            connector_text = _row_value(row, f"Steckertypen{index}")
            power = _parse_decimal_de(
                _row_value(row, f"Nennleistung Stecker{index}", f"P{index} [kW]")
            )
            evse = _row_value(row, f"EVSE-ID{index}")
            if evse:
                evse_ids.append(evse)
            socket_key = _bnetza_socket_from_text(connector_text)
            if socket_key:
                socket_counts[socket_key] = socket_counts.get(socket_key, 0) + 1
                if power is not None:
                    socket_power[socket_key] = max(socket_power.get(socket_key, 0.0), power)
            if power is not None:
                max_power_kw = max(max_power_kw or 0.0, power)
        for socket_key, count in socket_counts.items():
            tags[socket_key] = str(count)
            if socket_power.get(socket_key):
                tags[f"{socket_key}:output"] = f"{socket_power[socket_key]:g} kW"
        if max_power_kw:
            tags["charging_station:output"] = f"{max_power_kw:g} kW"
        if evse_ids:
            tags["ref:EU:EVSE"] = ";".join(dict.fromkeys(evse_ids))
        identity = " ".join([name, operator, " ".join(evse_ids)]).lower()
        if "ionity" in identity or re.search(r"(?:^|[^a-z0-9])de[*_-]?ioy", identity, re.I):
            tags["network"] = "IONITY"
            if not tags.get("brand"):
                tags["brand"] = "IONITY"
        station_id = _row_value(row, "Ladeeinrichtungs-ID")
        result.append(
            {
                "type": "bnetza",
                "id": station_id or _stable_provider_id("bnetza", lat, lon, name, operator),
                "lat": lat,
                "lon": lon,
                "tags": {k: v for k, v in tags.items() if v not in (None, "")},
                "provider": "bnetza",
            }
        )
    if not result:
        raise ValueError("Bundesnetzagentur: keine verwertbaren Zeilen in CSV")
    return result


def _charging_dataset_stats(elements: list[dict[str, Any]]) -> dict[str, int]:
    stats = {"count": len(elements), "ionity": 0, "tesla": 0, "ccs": 0}
    for element in elements:
        tags = element.get("tags") or {}
        identity = " ".join(str(tags.get(key, "")) for key in ("name", "brand", "operator", "network", "ref:EU:EVSE")).lower()
        if "ionity" in identity or "de*ioy" in identity or "de-ioy" in identity or "deioy" in identity:
            stats["ionity"] += 1
        if "tesla" in identity:
            stats["tesla"] += 1
        if any(tags.get(key) not in (None, "", "0", 0, False) for key in ("socket:type2_combo", "socket:ccs")):
            stats["ccs"] += 1
    return stats


async def _async_load_disk_dataset(hass: HomeAssistant, provider: str) -> dict[str, Any]:
    domain_data = hass.data.setdefault(DOMAIN, {})
    datasets: dict[str, dict[str, Any]] = domain_data.setdefault(DATA_CHARGING_DATASETS, {})
    if provider in datasets:
        return datasets[provider]
    payload = await hass.async_add_executor_job(_read_dataset_cache, _dataset_cache_path(hass, provider))
    if not payload:
        payload = {"provider": provider, "elements": [], "fetched_at": 0.0, "source_url": ""}
    datasets[provider] = payload
    return payload


async def _async_refresh_afir_dataset(hass: HomeAssistant) -> dict[str, Any]:
    session = async_get_clientsession(hass)
    async with asyncio.timeout(35.0):
        async with session.get(
            AFIR_ECOMOVEMENT_URL,
            headers={
                "Accept": "application/json, application/octet-stream;q=0.8, */*;q=0.5",
                "Accept-Encoding": "gzip",
                "User-Agent": "Cardata Analytics/0.1.42 (https://github.com/lemuba/cardata-analytics)",
            },
            allow_redirects=True,
        ) as response:
            if response.status != 200:
                raise RuntimeError(f"Mobilithek AFIR: HTTP {response.status}")
            body = await response.read()
    if body[:2] == b"\x1f\x8b":
        body = gzip.decompress(body)
    try:
        payload = json.loads(body.decode("utf-8-sig"))
    except Exception as err:
        raise RuntimeError("Mobilithek AFIR: Antwort ist kein gültiges JSON") from err
    elements = await hass.async_add_executor_job(_parse_afir_payload, payload)
    dataset = {
        "provider": "afir",
        "elements": elements,
        "fetched_at": time.time(),
        "source_url": AFIR_ECOMOVEMENT_URL,
    }
    await hass.async_add_executor_job(_write_dataset_cache, _dataset_cache_path(hass, "afir"), dataset)
    hass.data.setdefault(DOMAIN, {}).setdefault(DATA_CHARGING_DATASETS, {})["afir"] = dataset
    return dataset


async def _async_discover_bnetza_csv_urls(hass: HomeAssistant) -> list[str]:
    """Return ordered official BNetzA CSV candidates, newest first."""
    session = async_get_clientsession(hass)
    candidates: list[str] = []
    for page_url in BNETZA_PAGE_URLS:
        try:
            async with asyncio.timeout(12.0):
                async with session.get(page_url, headers={"User-Agent": "Cardata Analytics/0.1.42"}) as response:
                    if response.status != 200:
                        raise RuntimeError(f"HTTP {response.status}")
                    page = await response.text(errors="replace")
            for href in re.findall(r"href=[\"']([^\"']*Ladesaeulenregister_BNetzA_[^\"']+\.csv)[\"']", page, flags=re.I):
                url = urljoin(page_url, html.unescape(href))
                if url not in candidates:
                    candidates.append(url)
        except Exception as err:
            _LOGGER.debug("BNetzA CSV discovery failed for %s: %s", page_url, err)

    today = datetime.now(timezone.utc).date()
    year, month = today.year, today.month
    for offset in range(0, 4):
        y, m = year, month - offset
        while m <= 0:
            y -= 1
            m += 12
        for day in (1, 7, 28):
            try:
                stamp = date(y, m, day).isoformat()
            except ValueError:
                continue
            url = BNETZA_DATA_BASE + f"Ladesaeulenregister_BNetzA_{stamp}.csv"
            if url not in candidates:
                candidates.append(url)
    if BNETZA_FALLBACK_CSV_URL not in candidates:
        candidates.append(BNETZA_FALLBACK_CSV_URL)
    return candidates


async def _async_refresh_bnetza_dataset(hass: HomeAssistant) -> dict[str, Any]:
    """Refresh the full BNetzA register without blocking POI requests.

    The official CSV is about 50 MB.  Stream it to a temporary file first so
    Home Assistant does not need another 50 MB response buffer on top of the
    parser/cache objects.  The previous successful cache is left untouched until
    the replacement has parsed successfully.
    """
    urls = await _async_discover_bnetza_csv_urls(hass)
    session = async_get_clientsession(hass)
    cache_dir = Path(hass.config.path('.storage'))
    cache_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = cache_dir / f"{DOMAIN}_bnetza_download.tmp"
    url = ""
    failures: list[str] = []
    try:
        downloaded = False
        for candidate in urls:
            try:
                async with asyncio.timeout(6 * 60):
                    async with session.get(
                        candidate,
                        headers={
                            "Accept": "text/csv, application/octet-stream;q=0.9, */*;q=0.5",
                            "Accept-Encoding": "identity",
                            "User-Agent": "Cardata Analytics/0.1.42",
                        },
                        allow_redirects=True,
                    ) as response:
                        if response.status != 200:
                            raise RuntimeError(f"HTTP {response.status}")
                        total = 0
                        with tmp_path.open('wb') as handle:
                            async for chunk in response.content.iter_chunked(256 * 1024):
                                if not chunk:
                                    continue
                                handle.write(chunk)
                                total += len(chunk)
                        if total < 1_000_000:
                            raise RuntimeError(f"Antwort unerwartet klein ({total} Bytes)")
                url = candidate
                downloaded = True
                break
            except Exception as err:
                failures.append(f"{candidate.rsplit('/', 1)[-1]}: {err}")
                try:
                    tmp_path.unlink(missing_ok=True)
                except Exception:
                    pass
        if not downloaded:
            raise RuntimeError("Bundesnetzagentur CSV nicht erreichbar: " + " · ".join(failures[-4:]))

        body = await hass.async_add_executor_job(tmp_path.read_bytes)
        elements = await hass.async_add_executor_job(_parse_bnetza_csv, body)
        stats = await hass.async_add_executor_job(_charging_dataset_stats, elements)
        dataset = {
            "provider": "bnetza",
            "elements": elements,
            "fetched_at": time.time(),
            "source_url": url,
            "stats": stats,
        }
        _LOGGER.info("Cardata charging database ready: %s stations, %s IONITY, %s Tesla, %s CCS", stats.get("count", 0), stats.get("ionity", 0), stats.get("tesla", 0), stats.get("ccs", 0))
        await hass.async_add_executor_job(
            _write_dataset_cache, _dataset_cache_path(hass, "bnetza"), dataset
        )
        hass.data.setdefault(DOMAIN, {}).setdefault(DATA_CHARGING_DATASETS, {})["bnetza"] = dataset
        return dataset
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass


async def _async_start_dataset_refresh(hass: HomeAssistant, provider: str) -> asyncio.Task[dict[str, Any]]:
    domain_data = hass.data.setdefault(DOMAIN, {})
    tasks: dict[str, asyncio.Task[dict[str, Any]]] = domain_data.setdefault(DATA_CHARGING_LOAD_TASKS, {})
    task = tasks.get(provider)
    if task is not None and not task.done():
        return task
    refresh = _async_refresh_afir_dataset if provider == "afir" else _async_refresh_bnetza_dataset
    task = hass.async_create_task(refresh(hass))
    tasks[provider] = task

    def _cleanup(done: asyncio.Task[dict[str, Any]]) -> None:
        if tasks.get(provider) is done:
            tasks.pop(provider, None)
        if not done.cancelled():
            try:
                done.exception()
            except Exception:
                pass

    task.add_done_callback(_cleanup)
    return task


async def _async_get_charging_dataset(
    hass: HomeAssistant,
    provider: str,
    *,
    wait_if_empty: bool,
    refresh_if_stale: bool = True,
) -> tuple[dict[str, Any], list[str]]:
    dataset = await _async_load_disk_dataset(hass, provider)
    elements = dataset.get("elements") if isinstance(dataset, dict) else []
    fetched_at = float(dataset.get("fetched_at", 0.0)) if isinstance(dataset, dict) else 0.0
    age = max(0.0, time.time() - fetched_at) if fetched_at else float("inf")
    ttl = CHARGING_AFIR_TTL_SECONDS if provider == "afir" else CHARGING_BNETZA_TTL_SECONDS
    warnings: list[str] = []
    task: asyncio.Task[dict[str, Any]] | None = None

    if refresh_if_stale and age > ttl:
        task = await _async_start_dataset_refresh(hass, provider)

    if elements:
        if age > ttl:
            warnings.append(
                f"{provider.upper()}: lokaler Cache wird im Hintergrund aktualisiert"
            )
        return dataset, warnings

    if task is None:
        task = await _async_start_dataset_refresh(hass, provider)
    if not wait_if_empty:
        warnings.append(f"{provider.upper()}: lokaler Cache wird aufgebaut")
        return dataset, warnings

    timeout = 28.0 if provider == "afir" else 45.0
    try:
        refreshed = await asyncio.wait_for(asyncio.shield(task), timeout=timeout)
        return refreshed, warnings
    except Exception as err:
        # A very old disk cache is still preferable to making every POI search
        # depend on a live third-party request.  Only reject it after 45 days.
        if elements and age <= CHARGING_MAX_STALE_SECONDS:
            warnings.append(f"{provider.upper()}: Aktualisierung fehlgeschlagen, älterer Cache aktiv ({err})")
            return dataset, warnings
        raise RuntimeError(f"{provider.upper()}: {err}") from err


def _charging_connector_present(tags: dict[str, Any], connector: str) -> bool:
    if connector == "any":
        return True
    mapping = {
        "ccs": ("socket:type2_combo", "socket:ccs"),
        "type2": ("socket:type2",),
        "chademo": ("socket:chademo",),
        "tesla": ("socket:tesla_supercharger", "socket:tesla_destination"),
    }
    return any(_truthy_tag(tags.get(key)) for key in mapping.get(connector, ()))


def _filter_charging_dataset(elements: list[dict[str, Any]], msg: dict[str, Any]) -> list[dict[str, Any]]:
    lat = float(msg["latitude"])
    lon = float(msg["longitude"])
    radius_km = int(msg["radius_km"])
    radius_m = radius_km * 1000.0
    search = str(msg.get("search_filter", "")).strip().lower()
    operator = str(msg.get("operator_filter", "")).strip().lower()
    connector = str(msg.get("connector_filter", "any"))
    min_power = int(msg.get("min_power_kw", 0))
    include_unknown = bool(msg.get("include_unknown_power", True))
    lat_margin = radius_km / 111.0
    lon_margin = radius_km / max(20.0, 111.0 * math.cos(math.radians(lat)))
    result: list[tuple[float, dict[str, Any]]] = []
    for element in elements:
        coords = _element_coords(element)
        if coords is None:
            continue
        if abs(coords[0] - lat) > lat_margin or abs(coords[1] - lon) > lon_margin:
            continue
        distance = _haversine_m(lat, lon, coords[0], coords[1])
        if distance > radius_m:
            continue
        tags = element.get("tags") or {}
        haystack = " ".join(
            str(tags.get(key, ""))
            for key in (
                "name", "brand", "operator", "network", "ref:EU:EVSE",
                "addr:street", "addr:postcode", "addr:city", "addr:full",
            )
        ).lower()
        operator_haystack = " ".join(
            str(tags.get(key, "")) for key in ("name", "brand", "operator", "network", "ref:EU:EVSE")
        ).lower()
        if search and search not in haystack:
            continue
        if operator and operator not in operator_haystack:
            continue
        if not _charging_connector_present(tags, connector):
            continue
        if min_power > 0:
            power = None
            for key, value in tags.items():
                if key == "charging_station:output" or key.endswith(":output") or key == "max_power":
                    parsed = _parse_power_kw(value)
                    if parsed is not None:
                        power = max(power or 0.0, parsed)
            if power is None and not include_unknown:
                continue
            if power is not None and power < min_power:
                continue
        result.append((distance, element))
    result.sort(key=lambda item: item[0])
    # Keep modest headroom for final cross-provider deduplication.
    return [element for _distance, element in result[: min(3000, max(200, int(msg["max_results"]) * 3))]]



def _ocm_settings(hass: HomeAssistant) -> tuple[bool, str]:
    """Return the integration-wide Open Charge Map configuration."""
    entries = list(hass.config_entries.async_entries(DOMAIN))
    entries.sort(key=lambda item: 0 if item.data.get("entry_kind") == ENTRY_KIND_GLOBAL else 1)
    for entry in entries:
        key = str(entry.data.get(CONF_OCM_API_KEY, "") or "").strip()
        if key:
            return bool(entry.data.get(CONF_OCM_ENABLED, True)), key
    return False, ""


def _ocm_cache_path(hass: HomeAssistant) -> Path:
    return Path(hass.config.path(".storage")) / f"{DOMAIN}_open_charge_map_cache.json"


def _ocm_reference_cache_path(hass: HomeAssistant) -> Path:
    return Path(hass.config.path(".storage")) / f"{DOMAIN}_open_charge_map_reference.json"


def _read_ocm_cache(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if int(payload.get("version", 0)) != OCM_CACHE_VERSION:
            return {"version": OCM_CACHE_VERSION, "areas": []}
        areas = payload.get("areas")
        if not isinstance(areas, list):
            areas = []
        return {"version": OCM_CACHE_VERSION, "areas": areas}
    except Exception:
        return {"version": OCM_CACHE_VERSION, "areas": []}


def _write_ocm_cache(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)


def _read_ocm_reference_cache(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if int(payload.get("version", 0)) != OCM_REFERENCE_CACHE_VERSION:
            return {}
        references = payload.get("references")
        if not isinstance(references, dict):
            return {}
        return {
            "version": OCM_REFERENCE_CACHE_VERSION,
            "fetched_at": float(payload.get("fetched_at", 0.0) or 0.0),
            "references": references,
        }
    except Exception:
        return {}


def _write_ocm_reference_cache(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)


def _ocm_area_distance_m(area: dict[str, Any], lat: float, lon: float) -> float:
    try:
        return _haversine_m(lat, lon, float(area["latitude"]), float(area["longitude"]))
    except Exception:
        return float("inf")


def _ocm_scope_signature(msg: dict[str, Any]) -> str:
    """Return the server-side OCM subset represented by a cache entry."""
    operator = str(msg.get("operator_filter", "") or "").strip().lower()[:80]
    connector = str(msg.get("connector_filter", "any") or "any").strip().lower()
    if connector == "any":
        connector = ""
    parts = []
    if operator:
        parts.append(f"operator={operator}")
    if connector:
        parts.append(f"connector={connector}")
    return "|".join(parts)


def _ocm_area_scope_covers(area: dict[str, Any], requested_scope: str) -> bool:
    """A broad OCM cache can serve a narrow filter, never the reverse."""
    cached_scope = str(area.get("scope", "") or "")
    if not cached_scope:
        return True
    return cached_scope == requested_scope


def _select_ocm_cached_area(
    cache: dict[str, Any], lat: float, lon: float, radius_km: int, *, max_age: float,
    requested_scope: str = "",
) -> dict[str, Any] | None:
    now = time.time()
    matches: list[tuple[float, int, dict[str, Any]]] = []
    for area in cache.get("areas", []):
        if not isinstance(area, dict) or not area.get("elements"):
            continue
        if not _ocm_area_scope_covers(area, requested_scope):
            continue
        fetched_at = float(area.get("fetched_at", 0.0) or 0.0)
        if not fetched_at or now - fetched_at > max_age:
            continue
        area_radius = int(area.get("radius_km", 0) or 0)
        if area_radius < radius_km:
            continue
        center_distance = _ocm_area_distance_m(area, lat, lon)
        if center_distance + radius_km * 1000 > area_radius * 1000:
            continue
        matches.append((center_distance, area_radius, area))
    if not matches:
        return None
    matches.sort(key=lambda item: (item[1], item[0]))
    return matches[0][2]


def _ocm_reference_index(items: Any, keep: tuple[str, ...]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    if not isinstance(items, list):
        return result
    for item in items:
        if not isinstance(item, dict) or item.get("ID") is None:
            continue
        compact = {key: item.get(key) for key in keep if item.get(key) not in (None, "")}
        compact["ID"] = item.get("ID")
        result[str(item.get("ID"))] = compact
    return result


def _build_ocm_reference_index(payload: dict[str, Any]) -> dict[str, Any]:
    """Reduce OCM referencedata to the lookup fields Cardata actually needs."""
    return {
        "ConnectionTypes": _ocm_reference_index(
            payload.get("ConnectionTypes"), ("Title", "FormalName")
        ),
        "Operators": _ocm_reference_index(
            payload.get("Operators"), ("Title", "WebsiteURL", "PhonePrimaryContact")
        ),
        "DataProviders": _ocm_reference_index(
            payload.get("DataProviders"), ("Title", "License", "WebsiteURL")
        ),
        "UsageTypes": _ocm_reference_index(payload.get("UsageTypes"), ("Title",)),
        "StatusTypes": _ocm_reference_index(payload.get("StatusTypes"), ("Title",)),
        "Countries": _ocm_reference_index(payload.get("Countries"), ("Title", "ISOCode")),
    }


def _ocm_reference_item(
    references: dict[str, Any] | None, collection: str, value: Any
) -> dict[str, Any]:
    if not references or value in (None, ""):
        return {}
    items = references.get(collection)
    if not isinstance(items, dict):
        return {}
    item = items.get(str(value))
    return item if isinstance(item, dict) else {}


def _ocm_server_filter_params(
    references: dict[str, Any] | None, msg: dict[str, Any]
) -> dict[str, str]:
    """Resolve stable OCM reference IDs for targeted operator/connector queries."""
    if not references:
        return {}
    params: dict[str, str] = {}
    operator_filter = str(msg.get("operator_filter", "") or "").strip().lower()
    if operator_filter:
        operator_ids: list[int] = []
        for key, item in (references.get("Operators") or {}).items():
            if not isinstance(item, dict):
                continue
            title = str(item.get("Title", "") or "").lower()
            if operator_filter in title:
                try:
                    operator_ids.append(int(key))
                except (TypeError, ValueError):
                    continue
        if operator_ids:
            params["operatorid"] = ",".join(str(item) for item in sorted(set(operator_ids)))

    connector_filter = str(msg.get("connector_filter", "any") or "any").strip().lower()
    if connector_filter != "any":
        connection_ids: list[int] = []
        for key in (references.get("ConnectionTypes") or {}):
            probe = {"ConnectionTypeID": key}
            if _ocm_connection_key(probe, references) == connector_filter:
                try:
                    connection_ids.append(int(key))
                except (TypeError, ValueError):
                    continue
        if connection_ids:
            params["connectiontypeid"] = ",".join(str(item) for item in sorted(set(connection_ids)))
    return params


async def _async_fetch_ocm_reference_data(
    hass: HomeAssistant, api_key: str
) -> dict[str, Any]:
    session = async_get_clientsession(hass)
    headers = {
        "Accept": "application/json",
        "User-Agent": "Cardata Analytics/0.1.42 (https://github.com/lemuba/cardata-analytics)",
    }
    async with asyncio.timeout(OCM_REFERENCE_HTTP_TIMEOUT_SECONDS):
        async with session.get(
            OCM_REFERENCE_URL, params={"key": api_key}, headers=headers
        ) as response:
            body = await response.read()
            if response.status in {401, 403} or b"REJECTED_APIKEY" in body[:2048].upper():
                raise RuntimeError("Open Charge Map: API-Key wurde abgelehnt")
            if response.status != 200:
                raise RuntimeError(f"Open Charge Map Referenzdaten: HTTP {response.status}")
    try:
        payload = json.loads(body)
    except Exception as err:
        raise RuntimeError("Open Charge Map Referenzdaten: ungültige JSON-Antwort") from err
    if not isinstance(payload, dict) or not isinstance(payload.get("ConnectionTypes"), list):
        raise RuntimeError("Open Charge Map Referenzdaten: unerwartetes Antwortformat")
    references = _build_ocm_reference_index(payload)
    if not references.get("ConnectionTypes"):
        raise RuntimeError("Open Charge Map Referenzdaten: keine Anschlussarten erhalten")
    return references


async def _async_get_ocm_references(
    hass: HomeAssistant, api_key: str
) -> tuple[dict[str, Any] | None, list[str]]:
    """Return cached OCM reference data, refreshing it single-flight when needed."""
    path = _ocm_reference_cache_path(hass)
    cached = await hass.async_add_executor_job(_read_ocm_reference_cache, path)
    fetched_at = float(cached.get("fetched_at", 0.0) or 0.0)
    references = cached.get("references") if isinstance(cached.get("references"), dict) else None
    age = time.time() - fetched_at if fetched_at else float("inf")
    if references and age <= OCM_REFERENCE_TTL_SECONDS:
        return references, []

    domain_data = hass.data.setdefault(DOMAIN, {})
    inflight: dict[str, asyncio.Task[dict[str, Any]]] = domain_data.setdefault(
        DATA_OCM_REFERENCE_INFLIGHT, {}
    )
    fingerprint = hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:12]
    task = inflight.get(fingerprint)
    if task is None or task.done():
        task = hass.async_create_task(_async_fetch_ocm_reference_data(hass, api_key))
        inflight[fingerprint] = task
    try:
        fresh = await asyncio.shield(task)
        payload = {
            "version": OCM_REFERENCE_CACHE_VERSION,
            "fetched_at": time.time(),
            "references": fresh,
        }
        await hass.async_add_executor_job(_write_ocm_reference_cache, path, payload)
        return fresh, []
    except Exception as err:
        if references and age <= OCM_REFERENCE_MAX_STALE_SECONDS:
            age_days = max(1, int(age / 86400))
            return references, [
                f"Open Charge Map Referenzdaten nicht aktualisiert – Cache {age_days} Tage alt ({err})"
            ]
        return None, [
            f"Open Charge Map Referenzdaten nicht erreichbar; Stationsantwort wird unkomprimiert geladen ({err})"
        ]
    finally:
        if inflight.get(fingerprint) is task and task.done():
            inflight.pop(fingerprint, None)


def _ocm_connection_key(
    connection: dict[str, Any], references: dict[str, Any] | None = None
) -> str | None:
    ct = connection.get("ConnectionType") if isinstance(connection.get("ConnectionType"), dict) else {}
    if not ct:
        ct = _ocm_reference_item(references, "ConnectionTypes", connection.get("ConnectionTypeID"))
    text = " ".join(
        str(value or "") for value in (
            ct.get("Title"), ct.get("FormalName"), connection.get("ConnectionTypeID")
        )
    ).lower()
    if "ccs" in text or "combo" in text:
        return "ccs"
    if "chademo" in text:
        return "chademo"
    if "type 2" in text or "type2" in text or "mennekes" in text:
        return "type2"
    if "tesla" in text or "nacs" in text:
        return "tesla"
    return None


def _ocm_station_to_element(
    station: dict[str, Any], references: dict[str, Any] | None = None
) -> dict[str, Any] | None:
    address = station.get("AddressInfo") if isinstance(station.get("AddressInfo"), dict) else {}
    try:
        lat = float(address.get("Latitude"))
        lon = float(address.get("Longitude"))
    except (TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None

    operator_info = station.get("OperatorInfo") if isinstance(station.get("OperatorInfo"), dict) else {}
    if not operator_info:
        operator_info = _ocm_reference_item(references, "Operators", station.get("OperatorID"))
    provider_info = station.get("DataProvider") if isinstance(station.get("DataProvider"), dict) else {}
    if not provider_info:
        provider_info = _ocm_reference_item(references, "DataProviders", station.get("DataProviderID"))
    usage = station.get("UsageType") if isinstance(station.get("UsageType"), dict) else {}
    if not usage:
        usage = _ocm_reference_item(references, "UsageTypes", station.get("UsageTypeID"))
    status = station.get("StatusType") if isinstance(station.get("StatusType"), dict) else {}
    if not status:
        status = _ocm_reference_item(references, "StatusTypes", station.get("StatusTypeID"))
    country = address.get("Country") if isinstance(address.get("Country"), dict) else {}
    if not country:
        country = _ocm_reference_item(references, "Countries", address.get("CountryID"))

    title = str(address.get("Title") or operator_info.get("Title") or "Ladestation").strip()
    operator = str(operator_info.get("Title") or "").strip()
    tags: dict[str, Any] = {
        "amenity": "charging_station",
        "name": title,
        "operator": operator,
        "network": operator,
        "brand": operator,
        "addr:street": address.get("AddressLine1") or "",
        "addr:city": address.get("Town") or "",
        "addr:postcode": address.get("Postcode") or "",
        "addr:state": address.get("StateOrProvince") or "",
        "addr:country": country.get("ISOCode") or country.get("Title") or "",
        "phone": address.get("ContactTelephone1") or operator_info.get("PhonePrimaryContact") or "",
        "website": operator_info.get("WebsiteURL") or address.get("RelatedURL") or "",
        "capacity": station.get("NumberOfPoints") or "",
        "access": usage.get("Title") or "",
        "cardata:provider": "ocm",
        "cardata:data_provider": provider_info.get("Title") or "Open Charge Map",
        "cardata:data_provider_license": provider_info.get("License") or "",
        "cardata:data_provider_url": provider_info.get("WebsiteURL") or "",
        "cardata:status": status.get("Title") or "",
        "cardata:last_verified": station.get("DateLastVerified") or "",
        "ref:ocm": station.get("UUID") or station.get("ID") or "",
    }
    if station.get("OperatorsReference"):
        tags["ref"] = station.get("OperatorsReference")

    max_power: float | None = None
    connector_counts: dict[str, int] = {}
    for connection in station.get("Connections") or []:
        if not isinstance(connection, dict):
            continue
        key = _ocm_connection_key(connection, references)
        qty = connection.get("Quantity")
        try:
            qty_i = max(1, int(qty)) if qty not in (None, "") else 1
        except (TypeError, ValueError):
            qty_i = 1
        if key:
            connector_counts[key] = connector_counts.get(key, 0) + qty_i
        try:
            power = float(connection.get("PowerKW"))
        except (TypeError, ValueError):
            power = None
        if power is not None and math.isfinite(power) and power > 0:
            max_power = max(max_power or 0.0, power)
            if key == "ccs":
                tags["socket:type2_combo:output"] = f"{power:g} kW"
            elif key == "type2":
                tags["socket:type2:output"] = f"{power:g} kW"
            elif key == "chademo":
                tags["socket:chademo:output"] = f"{power:g} kW"
            elif key == "tesla":
                tags["socket:tesla_supercharger:output"] = f"{power:g} kW"
    if connector_counts.get("ccs"):
        tags["socket:type2_combo"] = str(connector_counts["ccs"])
        tags["socket:ccs"] = str(connector_counts["ccs"])
    if connector_counts.get("type2"):
        tags["socket:type2"] = str(connector_counts["type2"])
    if connector_counts.get("chademo"):
        tags["socket:chademo"] = str(connector_counts["chademo"])
    if connector_counts.get("tesla"):
        tags["socket:tesla_supercharger"] = str(connector_counts["tesla"])
    if max_power is not None:
        tags["max_power"] = f"{max_power:g} kW"
        tags["charging_station:output"] = f"{max_power:g} kW"

    try:
        ocm_id = int(station.get("ID") or 0)
    except (TypeError, ValueError):
        ocm_id = 0
    return {
        "type": "ocm",
        "id": ocm_id,
        "lat": lat,
        "lon": lon,
        "tags": {k: v for k, v in tags.items() if v not in (None, "")},
        "provider": "ocm",
        "sources": "ocm",
    }


def _ocm_max_results(radius_km: int) -> int:
    if radius_km <= 10:
        return 2000
    if radius_km <= 25:
        return 4000
    if radius_km <= 50:
        return 7000
    if radius_km <= 100:
        return 12000
    return 20000


def _ocm_area_request_key(
    api_key: str, lat: float, lon: float, radius_km: int, scope: str
) -> tuple[Any, ...]:
    fingerprint = hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:12]
    return (fingerprint, round(lat, 3), round(lon, 3), int(radius_km), scope)


async def _async_fetch_ocm_area(
    hass: HomeAssistant, api_key: str, lat: float, lon: float, radius_km: int,
    msg: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[str]]:
    references, reference_warnings = await _async_get_ocm_references(hass, api_key)
    compact = references is not None
    session = async_get_clientsession(hass)
    params = {
        "output": "json",
        "key": api_key,
        "latitude": f"{lat:.6f}",
        "longitude": f"{lon:.6f}",
        "distance": str(radius_km),
        "distanceunit": "KM",
        "maxresults": str(_ocm_max_results(radius_km)),
        "compact": "true" if compact else "false",
        "verbose": "false",
        "includecomments": "false",
    }
    # Targeted presets such as IONITY + CCS can be narrowed by stable OCM IDs.
    # Power/text filtering still happens locally. This avoids downloading a
    # huge all-networks result set only to discard almost everything.
    params.update(_ocm_server_filter_params(references, msg))
    headers = {
        "Accept": "application/json",
        "User-Agent": "Cardata Analytics/0.1.42 (https://github.com/lemuba/cardata-analytics)",
    }
    async with asyncio.timeout(OCM_HTTP_TIMEOUT_SECONDS):
        async with session.get(OCM_API_URL, params=params, headers=headers) as response:
            body = await response.read()
            if response.status in {401, 403} or b"REJECTED_APIKEY" in body[:2048].upper():
                raise RuntimeError("Open Charge Map: API-Key wurde abgelehnt")
            if response.status != 200:
                raise RuntimeError(f"Open Charge Map: HTTP {response.status}")
    try:
        payload = json.loads(body)
    except Exception as err:
        raise RuntimeError("Open Charge Map: ungültige JSON-Antwort") from err
    if not isinstance(payload, list):
        raise RuntimeError("Open Charge Map: unerwartetes Antwortformat")
    elements: list[dict[str, Any]] = []
    for station in payload:
        if not isinstance(station, dict):
            continue
        item = _ocm_station_to_element(station, references)
        if item is not None:
            elements.append(item)
    return elements, reference_warnings


async def _async_fetch_ocm_area_singleflight(
    hass: HomeAssistant, api_key: str, lat: float, lon: float, radius_km: int,
    msg: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[str]]:
    """Coalesce identical OCM area requests across cards/filter changes."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    inflight: dict[tuple[Any, ...], asyncio.Task[tuple[list[dict[str, Any]], list[str]]]] = (
        domain_data.setdefault(DATA_OCM_AREA_INFLIGHT, {})
    )
    scope = _ocm_scope_signature(msg)
    key = _ocm_area_request_key(api_key, lat, lon, radius_km, scope)
    task = inflight.get(key)
    if task is None or task.done():
        task = hass.async_create_task(
            _async_fetch_ocm_area(hass, api_key, lat, lon, radius_km, msg)
        )
        inflight[key] = task
    try:
        return await asyncio.shield(task)
    finally:
        if inflight.get(key) is task and task.done():
            inflight.pop(key, None)


async def _async_get_ocm_area(
    hass: HomeAssistant, msg: dict[str, Any]
) -> tuple[list[dict[str, Any]], str, list[str], bool]:
    enabled, api_key = _ocm_settings(hass)
    if not enabled or not api_key:
        return [], "Open Charge Map nicht konfiguriert", ["Open Charge Map: API-Key fehlt"], False

    lat = float(msg["latitude"])
    lon = float(msg["longitude"])
    radius_km = int(msg["radius_km"])
    force = bool(msg.get("force_refresh", False))
    scope = _ocm_scope_signature(msg)
    cache_path = _ocm_cache_path(hass)
    cache = await hass.async_add_executor_job(_read_ocm_cache, cache_path)

    if not force:
        fresh = _select_ocm_cached_area(
            cache, lat, lon, radius_km, max_age=OCM_CACHE_TTL_SECONDS, requested_scope=scope
        )
        if fresh is not None:
            age_min = max(0, int((time.time() - float(fresh.get("fetched_at", 0))) / 60))
            return list(fresh.get("elements") or []), f"Open Charge Map · Cache {age_min} Min.", [], True

    try:
        elements, fetch_warnings = await _async_fetch_ocm_area_singleflight(
            hass, api_key, lat, lon, radius_km, msg
        )
        area = {
            "latitude": lat,
            "longitude": lon,
            "radius_km": radius_km,
            "scope": scope,
            "fetched_at": time.time(),
            "elements": elements,
        }
        domain_data = hass.data.setdefault(DOMAIN, {})
        cache_lock = domain_data.get(DATA_OCM_CACHE_LOCK)
        if cache_lock is None:
            cache_lock = domain_data[DATA_OCM_CACHE_LOCK] = asyncio.Lock()
        async with cache_lock:
            # Re-read after the network request so concurrent searches for a
            # different vehicle/area cannot overwrite each other's cache entry.
            latest = await hass.async_add_executor_job(_read_ocm_cache, cache_path)
            areas = [
                item for item in latest.get("areas", [])
                if not (
                    isinstance(item, dict)
                    and int(item.get("radius_km", 0) or 0) == radius_km
                    and str(item.get("scope", "") or "") == scope
                    and _ocm_area_distance_m(item, lat, lon) < 1000
                )
            ]
            areas.append(area)
            areas.sort(key=lambda item: float(item.get("fetched_at", 0.0)), reverse=True)
            latest = {"version": OCM_CACHE_VERSION, "areas": areas[:OCM_CACHE_MAX_AREAS]}
            await hass.async_add_executor_job(_write_ocm_cache, cache_path, latest)
        source = "Open Charge Map · live kompakt" if not fetch_warnings else "Open Charge Map · live"
        return elements, source, fetch_warnings, True
    except Exception as err:
        # Read the newest cache again because another shared request may have
        # populated it while this request was waiting/failing.
        cache = await hass.async_add_executor_job(_read_ocm_cache, cache_path)
        stale = _select_ocm_cached_area(
            cache, lat, lon, radius_km, max_age=OCM_CACHE_MAX_STALE_SECONDS, requested_scope=scope
        )
        if stale is not None:
            age_h = max(1, int((time.time() - float(stale.get("fetched_at", 0))) / 3600))
            return (
                list(stale.get("elements") or []),
                f"Open Charge Map · Cache {age_h} Std.",
                [f"Open Charge Map aktuell nicht erreichbar – älterer Cache wird verwendet ({err})"],
                True,
            )
        raise RuntimeError(str(err)) from err


async def _async_collect_local_charging(
    hass: HomeAssistant, msg: dict[str, Any]
) -> tuple[list[dict[str, Any]], list[str], list[str], bool, bool]:
    """Return Europe-wide charging data from Open Charge Map plus local cache."""
    try:
        elements, source, warnings, available = await _async_get_ocm_area(hass, msg)
    except Exception as err:
        return [], [], [f"Open Charge Map: {err}"], False, False

    if not available:
        return [], [source], warnings, False, False

    filtered = await hass.async_add_executor_job(_filter_charging_dataset, elements, msg)
    return _merge_cross_provider_charging(filtered), [source], warnings, True, False


async def async_warm_charging_sources(hass: HomeAssistant) -> None:
    """Compatibility no-op: OCM areas are loaded on demand from configured vehicle positions."""
    return None


def _normalized_identity_text(tags: dict[str, Any]) -> set[str]:
    text = " ".join(
        str(tags.get(key, "")) for key in ("name", "brand", "operator", "network")
    ).lower()
    return {token for token in re.findall(r"[a-z0-9äöüß]+", text) if len(token) >= 3}


def _merge_cross_provider_charging(elements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate OSM/AFIR/BNetzA charging locations and merge useful tags."""
    merged: list[dict[str, Any]] = []
    by_osm_id: dict[tuple[str, int], int] = {}

    for element in elements:
        tags = element.get("tags") or {}
        if tags.get("amenity") != "charging_station":
            merged.append(element)
            continue
        element_type = str(element.get("type", ""))
        element_id = element.get("id")
        if element_type in {"node", "way", "relation"} and isinstance(element_id, int):
            key = (element_type, element_id)
            if key in by_osm_id:
                index = by_osm_id[key]
                merged[index]["tags"] = _merge_charge_tags(merged[index].get("tags") or {}, tags)
                sources = set(str(merged[index].get("sources", "")).split(","))
                sources.add(str(merged[index].get("provider", "osm")))
                sources.add(str(element.get("provider", "osm")))
                merged[index]["sources"] = ",".join(sorted(item for item in sources if item))
                continue
            by_osm_id[key] = len(merged)

        coords = _element_coords(element)
        tokens = _normalized_identity_text(tags)
        duplicate_index: int | None = None
        if coords is not None:
            for index, existing in enumerate(merged):
                existing_tags = existing.get("tags") or {}
                if existing_tags.get("amenity") != "charging_station":
                    continue
                existing_coords = _element_coords(existing)
                if existing_coords is None:
                    continue
                if _haversine_m(coords[0], coords[1], existing_coords[0], existing_coords[1]) > 120:
                    continue
                existing_tokens = _normalized_identity_text(existing_tags)
                # If one source has no useful identity text, proximity alone is
                # enough at 35 m; otherwise require an overlapping operator/name token.
                distance = _haversine_m(coords[0], coords[1], existing_coords[0], existing_coords[1])
                if (tokens and existing_tokens and tokens & existing_tokens) or distance <= 35:
                    duplicate_index = index
                    break
        if duplicate_index is not None:
            existing = merged[duplicate_index]
            existing["tags"] = _merge_charge_tags(existing.get("tags") or {}, tags)
            sources = set(str(existing.get("sources", existing.get("provider", ""))).split(","))
            sources.add(str(element.get("provider", "")))
            existing["sources"] = ",".join(sorted(item for item in sources if item))
            existing["provider"] = "merged"
        else:
            item = dict(element)
            item["sources"] = str(element.get("provider", ""))
            merged.append(item)

    return merged


async def _async_network_query(hass: HomeAssistant, msg: dict[str, Any]) -> dict[str, Any]:
    """Query general POIs live, but EV charging primarily from local bulk caches."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    semaphore = domain_data.get(DATA_POI_SEMAPHORE)
    if semaphore is None:
        semaphore = domain_data[DATA_POI_SEMAPHORE] = asyncio.Semaphore(POI_MAX_CONCURRENT_REQUESTS)

    try:
        async with asyncio.timeout(POI_SEMAPHORE_WAIT_SECONDS):
            await semaphore.acquire()
    except TimeoutError as err:
        raise RuntimeError(
            "POI-Dienst ist gerade beschäftigt; bitte in wenigen Sekunden erneut versuchen"
        ) from err

    started = time.monotonic()
    try:
        last_request = float(domain_data.get(DATA_POI_LAST_REQUEST, 0.0))
        remaining = POI_MIN_REQUEST_INTERVAL_SECONDS - (time.monotonic() - last_request)
        if remaining > 0:
            await asyncio.sleep(remaining)
        domain_data[DATA_POI_LAST_REQUEST] = time.monotonic()

        categories = list(msg["categories"])
        charging_requested = "charging" in categories
        general_categories = [category for category in categories if category != "charging"]
        provider_msg = dict(msg)
        provider_msg["search_filter"] = ""
        provider_msg["min_power_kw"] = 0
        provider_msg["include_unknown_power"] = True
        warnings: list[str] = []
        sources: list[str] = []
        combined: list[dict[str, Any]] = []

        general_task: asyncio.Task[tuple[list[dict[str, Any]], str]] | None = None
        if general_categories:
            query = _build_overpass_query(
                float(msg["latitude"]),
                float(msg["longitude"]),
                int(msg["radius_km"]),
                general_categories,
                int(msg["max_results"]),
                int(msg["timeout_seconds"]),
                "",  # text search is client-side so broad category caches are reusable
                "",  # operator/network is charging-specific; never filter normal POIs
                "any",
            )
            general_task = hass.async_create_task(
                _async_fetch_overpass(hass, query, int(msg["timeout_seconds"]))
            )

        charging_provider_available = False
        charging_initializing = False
        if charging_requested:
            (
                charging_elements, charging_sources, charging_warnings,
                charging_provider_available, charging_initializing,
            ) = await _async_collect_local_charging(hass, provider_msg)
            combined.extend(charging_elements)
            sources.extend(charging_sources)
            warnings.extend(charging_warnings)

        if general_task is not None:
            try:
                general_elements, endpoint = await general_task
                combined.extend(general_elements)
                sources.append(_endpoint_host(endpoint))
            except Exception as err:
                warnings.append(f"Overpass: {err}")

        # Charging deliberately has no Overpass fallback. Open Charge Map is the
        # Europe-wide charging source; its persistent area cache provides stale
        # fallback when the service is temporarily unavailable.

        combined = _merge_cross_provider_charging(combined)
        origin_lat = float(msg["latitude"])
        origin_lon = float(msg["longitude"])

        def _distance(item: dict[str, Any]) -> float:
            coords = _element_coords(item)
            if coords is None:
                return float("inf")
            return _haversine_m(origin_lat, origin_lon, coords[0], coords[1])

        combined.sort(key=_distance)
        max_results = int(msg["max_results"])
        combined = combined[: max_results * 2]

        if not combined and warnings and not charging_provider_available and not sources:
            _LOGGER.debug("Cardata general POI provider unavailable: %s", " · ".join(warnings))

        ocm_enabled, ocm_key = _ocm_settings(hass) if charging_requested else (False, "")
        charging_status = (
            "ready" if charging_provider_available
            else ("unavailable" if charging_requested and ocm_enabled and ocm_key else ("unconfigured" if charging_requested else "unused"))
        )
        return {
            "elements": combined,
            "endpoint": " + ".join(dict.fromkeys(sources)) or (
                "Open Charge Map nicht konfiguriert" if charging_status == "unconfigured" else "Lokaler POI-Cache"
            ),
            "sources": list(dict.fromkeys(sources)),
            "warnings": warnings,
            "charging_status": charging_status,
            "retry_after_seconds": 0,
            "stored_at": time.monotonic(),
            "elapsed_ms": int((time.monotonic() - started) * 1000),
        }
    finally:
        semaphore.release()


async def _async_get_pois(hass: HomeAssistant, msg: dict[str, Any]) -> dict[str, Any]:
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
            "sources": cached.get("sources", []),
            "warnings": cached.get("warnings", []),
            "charging_status": cached.get("charging_status", "ready"),
            "retry_after_seconds": 0,
            "cached": True,
            "elapsed_ms": 0,
        }

    task = inflight.get(key)
    if task is None or task.done():
        task = hass.async_create_task(_async_network_query(hass, msg))
        inflight[key] = task

        def _cleanup(
            done_task: asyncio.Task[dict[str, Any]], *, cache_key: tuple[Any, ...] = key
        ) -> None:
            if inflight.get(cache_key) is done_task:
                inflight.pop(cache_key, None)
            if not done_task.cancelled():
                try:
                    done_task.exception()
                except Exception:
                    pass

        task.add_done_callback(_cleanup)

    result = await asyncio.shield(task)
    if result.get("elements"):
        cache[key] = result
        if len(cache) > 16:
            oldest = sorted(cache.items(), key=lambda item: float(item[1].get("stored_at", 0.0)))
            for old_key, _value in oldest[:-16]:
                cache.pop(old_key, None)
    else:
        cache.pop(key, None)

    return {
        "elements": result["elements"],
        "endpoint": result["endpoint"],
        "sources": result.get("sources", []),
        "warnings": result.get("warnings", []),
        "charging_status": result.get("charging_status", "unused"),
        "retry_after_seconds": int(result.get("retry_after_seconds", 0) or 0),
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
            [vol.In(tuple(POI_CLAUSES))], vol.Length(min=1, max=len(POI_CLAUSES))
        ),
        vol.Optional("search_filter", default=""): vol.All(str, vol.Length(max=80)),
        vol.Optional("operator_filter", default=""): vol.All(str, vol.Length(max=80)),
        vol.Optional("connector_filter", default="any"): vol.In(
            ["any", "ccs", "type2", "chademo", "tesla"]
        ),
        vol.Optional("min_power_kw", default=0): vol.In([0, 50, 100, 150, 200, 300, 350]),
        vol.Optional("include_unknown_power", default=True): vol.Coerce(bool),
        vol.Optional("force_refresh", default=False): vol.Coerce(bool),
        vol.Optional("max_results", default=500): vol.All(vol.Coerce(int), vol.Range(min=50, max=1000)),
        vol.Optional("timeout_seconds", default=35): vol.All(vol.Coerce(int), vol.Range(min=15, max=90)),
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
