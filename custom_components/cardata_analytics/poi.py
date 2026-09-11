"""Server-side multi-provider POI access for Cardata Analytics."""

from __future__ import annotations

import asyncio
import json
import logging
import math
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
POI_CHARGEPOINT_MERGE_RADIUS_M = 180.0

# Public Overpass instances. They remain the main source for general OSM POIs.
# Charging stations additionally have independent fallbacks below.
OVERPASS_ENDPOINTS = (
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
)

# QLever's public OSM-Planet endpoint is independent from Overpass and is used
# as a charging-specific fallback/augmenter for targeted EV searches.
QLEVER_OSM_ENDPOINT = "https://qlever.dev/api/osm-planet"

# Public ArcGIS endpoint behind the Bundesnetzagentur charging-station map. It
# is only used for charging stations and only when the requested circle overlaps
# Germany. BNetzA data is CC BY 4.0; attribution is surfaced in the card.
BNETZA_ARCGIS_ENDPOINT = (
    "https://services6.arcgis.com/6jU7RmJig2Wwo1b0/ArcGIS/rest/services/"
    "Ladesaeulenregister/FeatureServer/7/query"
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


def _build_text_expressions(search_filter: str, operator_filter: str) -> tuple[str, str]:
    search_filter = search_filter.strip()[:80]
    operator_filter = operator_filter.strip()[:80]
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
        str(msg.get("search_filter", "")).strip().lower(),
        str(msg.get("operator_filter", "")).strip().lower(),
        str(msg.get("connector_filter", "any")),
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
                            "Cardata Analytics/0.1.29 "
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


def _sparql_regex_literal(value: str) -> str:
    return re.escape(value.strip()[:80]).replace("\\", "\\\\").replace('"', '\\"')


def _build_qlever_charging_query(msg: dict[str, Any]) -> str:
    lat = float(msg["latitude"])
    lon = float(msg["longitude"])
    radius_m = int(msg["radius_km"]) * 1000
    search = _sparql_regex_literal(str(msg.get("search_filter", "")))
    operator = _sparql_regex_literal(str(msg.get("operator_filter", "")))
    limit = min(2500, max(300, int(msg["max_results"]) * 3))

    optional = {
        "name": "name",
        "brand": "brand",
        "operator": "operator",
        "network": "network",
        "capacity": "capacity",
        "opening_hours": "opening_hours",
        "access": "access",
        "fee": "fee",
        "addr_street": "addr:street",
        "addr_housenumber": "addr:housenumber",
        "addr_postcode": "addr:postcode",
        "addr_city": "addr:city",
        "socket_ccs": "socket:ccs",
        "socket_ccs_output": "socket:ccs:output",
        "socket_type2_combo": "socket:type2_combo",
        "socket_type2_combo_output": "socket:type2_combo:output",
        "socket_type2": "socket:type2",
        "socket_type2_output": "socket:type2:output",
        "socket_chademo": "socket:chademo",
        "socket_chademo_output": "socket:chademo:output",
        "socket_tesla_supercharger": "socket:tesla_supercharger",
        "socket_tesla_supercharger_output": "socket:tesla_supercharger:output",
        "socket_tesla_destination": "socket:tesla_destination",
        "socket_tesla_destination_output": "socket:tesla_destination:output",
        "charging_station_output": "charging_station:output",
        "max_power": "max_power",
        "evse_ref": "ref:EU:EVSE",
    }
    optionals = " ".join(
        f'OPTIONAL {{ ?osm <https://www.openstreetmap.org/wiki/Key:{key}> ?{var} . }}'
        for var, key in optional.items()
    )
    select_vars = " ".join(f"?{var}" for var in optional)
    text_parts = "CONCAT(" + ", ' ', ".join(
        [
            'COALESCE(STR(?name), "")',
            'COALESCE(STR(?brand), "")',
            'COALESCE(STR(?operator), "")',
            'COALESCE(STR(?network), "")',
        ]
    ) + ")"
    filters = []
    if search:
        filters.append(f'FILTER(REGEX({text_parts}, "{search}", "i"))')
    if operator:
        filters.append(f'FILTER(REGEX({text_parts}, "{operator}", "i"))')

    return f"""
PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
SELECT DISTINCT ?osm ?loc ?kind {select_vars} WHERE {{
  {{ ?osm osmkey:amenity "charging_station" . BIND("station" AS ?kind) }}
  UNION
  {{ ?osm osmkey:man_made "charge_point" . BIND("charge_point" AS ?kind) }}
  ?osm geo:hasCentroid/geo:asWKT ?loc .
  BIND("POINT({lon:.6f} {lat:.6f})"^^geo:wktLiteral AS ?center)
  FILTER(geof:metricDistance(?loc, ?center) <= {radius_m})
  {optionals}
  {' '.join(filters)}
}}
LIMIT {limit}
""".strip()


def _binding_value(binding: dict[str, Any], key: str) -> str | None:
    value = binding.get(key)
    if isinstance(value, dict):
        raw = value.get("value")
        return str(raw) if raw is not None else None
    return None


def _parse_wkt_point(value: str | None) -> tuple[float, float] | None:
    if not value:
        return None
    match = re.search(
        r"POINT\s*(?:Z\s*)?\(\s*([-+0-9.eE]+)\s+([-+0-9.eE]+)", value, flags=re.I
    )
    if not match:
        return None
    lon = float(match.group(1))
    lat = float(match.group(2))
    return lat, lon


async def _async_fetch_qlever_charging(
    hass: HomeAssistant, msg: dict[str, Any]
) -> tuple[list[dict[str, Any]], str]:
    session = async_get_clientsession(hass)
    query = _build_qlever_charging_query(msg)
    timeout = min(18.0, max(8.0, int(msg["timeout_seconds"]) / 2))
    async with asyncio.timeout(timeout):
        async with session.post(
            QLEVER_OSM_ENDPOINT,
            data=query.encode("utf-8"),
            headers={
                "Accept": "application/sparql-results+json",
                "Content-Type": "application/sparql-query; charset=utf-8",
                "User-Agent": (
                    "Cardata Analytics/0.1.29 "
                    "(https://github.com/lemuba/cardata-analytics)"
                ),
            },
        ) as response:
            if response.status != 200:
                body = (await response.text())[:180].replace("\n", " ").strip()
                raise RuntimeError(f"QLever: HTTP {response.status}" + (f" ({body})" if body else ""))
            payload = await response.json(content_type=None)

    bindings = ((payload or {}).get("results") or {}).get("bindings")
    if not isinstance(bindings, list):
        raise RuntimeError("QLever: ungültige SPARQL-JSON-Antwort")

    tag_mapping = {
        "name": "name", "brand": "brand", "operator": "operator", "network": "network",
        "capacity": "capacity", "opening_hours": "opening_hours", "access": "access",
        "fee": "fee", "addr_street": "addr:street", "addr_housenumber": "addr:housenumber",
        "addr_postcode": "addr:postcode", "addr_city": "addr:city", "socket_ccs": "socket:ccs",
        "socket_ccs_output": "socket:ccs:output", "socket_type2_combo": "socket:type2_combo",
        "socket_type2_combo_output": "socket:type2_combo:output", "socket_type2": "socket:type2",
        "socket_type2_output": "socket:type2:output", "socket_chademo": "socket:chademo",
        "socket_chademo_output": "socket:chademo:output",
        "socket_tesla_supercharger": "socket:tesla_supercharger",
        "socket_tesla_supercharger_output": "socket:tesla_supercharger:output",
        "socket_tesla_destination": "socket:tesla_destination",
        "socket_tesla_destination_output": "socket:tesla_destination:output",
        "charging_station_output": "charging_station:output", "max_power": "max_power",
        "evse_ref": "ref:EU:EVSE",
    }
    elements: list[dict[str, Any]] = []
    for binding in bindings:
        if not isinstance(binding, dict):
            continue
        subject = _binding_value(binding, "osm") or ""
        id_match = re.search(r"openstreetmap\.org/(node|way|relation)/(\d+)", subject)
        coords = _parse_wkt_point(_binding_value(binding, "loc"))
        if not id_match or coords is None:
            continue
        tags: dict[str, Any] = {}
        kind = _binding_value(binding, "kind")
        if kind == "charge_point":
            tags["man_made"] = "charge_point"
        else:
            tags["amenity"] = "charging_station"
        for variable, tag_key in tag_mapping.items():
            value = _binding_value(binding, variable)
            if value not in (None, ""):
                tags[tag_key] = value
        elements.append(
            {
                "type": id_match.group(1),
                "id": int(id_match.group(2)),
                "lat": coords[0],
                "lon": coords[1],
                "tags": tags,
                "provider": "qlever",
            }
        )
    return _aggregate_osm_charging(elements, "qlever"), QLEVER_OSM_ENDPOINT


def _request_overlaps_germany(latitude: float, longitude: float, radius_km: int) -> bool:
    lat_margin = radius_km / 111.0
    lon_margin = radius_km / max(25.0, 111.0 * math.cos(math.radians(latitude)))
    return not (
        latitude + lat_margin < 47.0
        or latitude - lat_margin > 55.7
        or longitude + lon_margin < 5.0
        or longitude - lon_margin > 15.6
    )


def _arcgis_text_where(search_filter: str, operator_filter: str) -> str:
    groups: list[str] = []
    for text, fields in (
        (operator_filter.strip()[:80], ["Betreiber_", "für_die_Überschrift_"]),
        (search_filter.strip()[:80], ["Betreiber_", "für_die_Überschrift_", "Standort_"]),
    ):
        if not text:
            continue
        escaped = text.replace("'", "''")
        groups.append("(" + " OR ".join(f"{field} LIKE '%{escaped}%'" for field in fields) + ")")
    return " AND ".join(groups) if groups else "1=1"


def _bnetza_feature_to_element(feature: dict[str, Any]) -> dict[str, Any] | None:
    attrs = feature.get("attributes") or {}
    geometry = feature.get("geometry") or {}
    try:
        lat = float(geometry.get("y", attrs.get("Breitengrad_")))
        lon = float(geometry.get("x", attrs.get("Längengrad_")))
    except (TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None

    operator = str(attrs.get("Betreiber_") or "").strip()
    title = str(attrs.get("für_die_Überschrift_") or operator or "Ladestation").strip()
    address = str(attrs.get("Standort_") or "").strip()
    tags: dict[str, Any] = {
        "amenity": "charging_station",
        "name": title,
        "operator": operator or None,
        "brand": operator or None,
        "addr:full": address or None,
        "source": "Bundesnetzagentur.de",
        "cardata:provider": "bnetza",
    }
    capacity = attrs.get("Anzahl_Ladepunkte_")
    if capacity not in (None, ""):
        tags["capacity"] = str(capacity)

    max_power: float | None = None
    socket_counts = {"socket:type2_combo": 0, "socket:type2": 0, "socket:chademo": 0}
    for index in range(1, 5):
        suffix = f"__{index}_"
        if _truthy_tag(attrs.get(f"DC_Kupplung_Combo{suffix}")):
            socket_counts["socket:type2_combo"] += 1
        if _truthy_tag(attrs.get(f"AC_Kupplung_Typ_2{suffix}")) or _truthy_tag(
            attrs.get(f"AC_Steckdose_Typ_2{suffix}")
        ):
            socket_counts["socket:type2"] += 1
        if _truthy_tag(attrs.get(f"DC_CHAdeMO{suffix}")):
            socket_counts["socket:chademo"] += 1
        power = _parse_power_kw(attrs.get(f"Nennleistung_Ladepunkt_{index}_"))
        if power is not None and (max_power is None or power > max_power):
            max_power = power

    for socket_key, count in socket_counts.items():
        if count:
            tags[socket_key] = str(count)
    if max_power is not None:
        tags["max_power"] = f"{max_power:g} kW"

    # IONITY commonly appears only as the operator in registry data.
    if "ionity" in operator.lower() or "ionity" in title.lower():
        tags["network"] = "IONITY"

    clean_tags = {key: value for key, value in tags.items() if value not in (None, "")}
    object_id = attrs.get("OBJECTID", attrs.get("ID", 0))
    try:
        object_id = int(object_id)
    except (TypeError, ValueError):
        object_id = abs(hash((round(lat, 6), round(lon, 6), title))) % 2_000_000_000
    return {
        "type": "bnetza",
        "id": object_id,
        "lat": lat,
        "lon": lon,
        "tags": clean_tags,
        "provider": "bnetza",
    }


async def _async_fetch_bnetza_charging(
    hass: HomeAssistant, msg: dict[str, Any]
) -> tuple[list[dict[str, Any]], str]:
    latitude = float(msg["latitude"])
    longitude = float(msg["longitude"])
    radius_km = int(msg["radius_km"])
    if not _request_overlaps_germany(latitude, longitude, radius_km):
        return [], ""

    session = async_get_clientsession(hass)
    geometry = json.dumps(
        {"x": longitude, "y": latitude, "spatialReference": {"wkid": 4326}},
        separators=(",", ":"),
    )
    where = _arcgis_text_where(
        str(msg.get("search_filter", "")), str(msg.get("operator_filter", ""))
    )
    max_rows = min(4000, max(1000, int(msg["max_results"]) * 4))
    page_size = 1000
    offset = 0
    elements: list[dict[str, Any]] = []
    deadline = time.monotonic() + min(15.0, max(8.0, int(msg["timeout_seconds"]) / 2))

    while offset < max_rows:
        remaining = deadline - time.monotonic()
        if remaining <= 1.0:
            break
        params = {
            "where": where,
            "geometry": geometry,
            "geometryType": "esriGeometryPoint",
            "inSR": "4326",
            "outSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "distance": str(radius_km),
            "units": "esriSRUnit_Kilometer",
            "outFields": "*",
            "returnGeometry": "true",
            "resultOffset": str(offset),
            "resultRecordCount": str(min(page_size, max_rows - offset)),
            "f": "json",
        }
        async with asyncio.timeout(min(7.0, remaining)):
            async with session.get(
                BNETZA_ARCGIS_ENDPOINT,
                params=params,
                headers={"User-Agent": "Cardata Analytics/0.1.29"},
            ) as response:
                if response.status != 200:
                    raise RuntimeError(f"Bundesnetzagentur: HTTP {response.status}")
                payload = await response.json(content_type=None)
        if not isinstance(payload, dict):
            raise RuntimeError("Bundesnetzagentur: ungültige JSON-Antwort")
        if payload.get("error"):
            message = (payload.get("error") or {}).get("message") or "ArcGIS-Abfrage fehlgeschlagen"
            raise RuntimeError(f"Bundesnetzagentur: {message}")
        features = payload.get("features")
        if not isinstance(features, list):
            raise RuntimeError("Bundesnetzagentur: keine Feature-Liste in Antwort")
        for feature in features:
            if isinstance(feature, dict):
                element = _bnetza_feature_to_element(feature)
                if element is not None:
                    elements.append(element)
        if len(features) < page_size or not payload.get("exceededTransferLimit"):
            break
        offset += len(features)
    return elements, BNETZA_ARCGIS_ENDPOINT


def _normalized_identity_text(tags: dict[str, Any]) -> set[str]:
    text = " ".join(
        str(tags.get(key, "")) for key in ("name", "brand", "operator", "network")
    ).lower()
    return {token for token in re.findall(r"[a-z0-9äöüß]+", text) if len(token) >= 3}


def _merge_cross_provider_charging(elements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate OSM/QLever/BNetzA charging locations and merge useful tags."""
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
    """Run a robust multi-provider query under bounded global concurrency.

    General POIs use Overpass. EV charging uses QLever OSM as its primary OSM
    query path plus BNetzA inside Germany; Overpass is only a charging fallback
    when QLever itself is unavailable. This keeps normal charging searches from
    waiting on public Overpass proxy timeouts at all.
    """
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

        provider_errors: list[str] = []
        sources: list[str] = []
        combined: list[dict[str, Any]] = []

        # Start every required independent provider immediately. For mixed
        # category searches this lets the EV providers make progress while the
        # general Overpass query is running.
        overpass_task: asyncio.Task[tuple[list[dict[str, Any]], str]] | None = None
        if general_categories:
            general_query = _build_overpass_query(
                float(msg["latitude"]),
                float(msg["longitude"]),
                int(msg["radius_km"]),
                general_categories,
                int(msg["max_results"]),
                int(msg["timeout_seconds"]),
                str(msg.get("search_filter", "")),
                str(msg.get("operator_filter", "")),
                "any",
            )
            overpass_task = hass.async_create_task(
                _async_fetch_overpass(hass, general_query, int(msg["timeout_seconds"]))
            )

        qlever_task = (
            hass.async_create_task(_async_fetch_qlever_charging(hass, msg))
            if charging_requested
            else None
        )
        bnetza_task = (
            hass.async_create_task(_async_fetch_bnetza_charging(hass, msg))
            if charging_requested
            else None
        )

        qlever_succeeded = False
        if qlever_task is not None:
            try:
                qlever_elements, _qlever_endpoint = await qlever_task
                qlever_succeeded = True
                if qlever_elements:
                    combined.extend(qlever_elements)
                    sources.append("QLever OSM")
            except Exception as err:
                provider_errors.append(f"QLever: {err}")

        if bnetza_task is not None:
            try:
                bnetza_elements, bnetza_endpoint = await bnetza_task
                if bnetza_elements:
                    combined.extend(bnetza_elements)
                    sources.append("Bundesnetzagentur")
                elif bnetza_endpoint:
                    # The provider was contacted successfully but had no match.
                    pass
            except Exception as err:
                provider_errors.append(f"BNetzA: {err}")

        if overpass_task is not None:
            try:
                overpass_elements, overpass_endpoint = await overpass_task
                combined.extend(_aggregate_osm_charging(overpass_elements, "osm"))
                sources.append(_endpoint_host(overpass_endpoint))
            except Exception as err:
                provider_errors.append(f"Overpass: {err}")

        # Charging-only searches normally never touch Overpass. If the independent
        # QLever path itself is unavailable, make one bounded Overpass fallback
        # attempt so charging still has a third route outside BNetzA coverage.
        if charging_requested and not qlever_succeeded and not any(
            (item.get("tags") or {}).get("amenity") == "charging_station" for item in combined
        ):
            charging_query = _build_overpass_query(
                float(msg["latitude"]),
                float(msg["longitude"]),
                int(msg["radius_km"]),
                ["charging"],
                int(msg["max_results"]),
                min(25, int(msg["timeout_seconds"])),
                str(msg.get("search_filter", "")),
                str(msg.get("operator_filter", "")),
                str(msg.get("connector_filter", "any")),
            )
            try:
                fallback_elements, fallback_endpoint = await _async_fetch_overpass(
                    hass, charging_query, min(25, int(msg["timeout_seconds"]))
                )
                combined.extend(_aggregate_osm_charging(fallback_elements, "osm"))
                sources.append(_endpoint_host(fallback_endpoint))
            except Exception as err:
                provider_errors.append(f"Overpass-EV-Fallback: {err}")

        combined = _merge_cross_provider_charging(combined)
        if not combined and provider_errors:
            raise RuntimeError(" · ".join(provider_errors))

        # Keep the bounded result set geographically useful. Without sorting, a
        # large 200-km provider response could otherwise cut off nearby POIs just
        # because the upstream service returned distant rows first.
        origin_lat = float(msg["latitude"])
        origin_lon = float(msg["longitude"])

        def _distance_from_origin(item: dict[str, Any]) -> float:
            coords = _element_coords(item)
            if coords is None:
                return float("inf")
            return _haversine_m(origin_lat, origin_lon, coords[0], coords[1])

        combined.sort(key=_distance_from_origin)
        max_results = int(msg["max_results"])
        if len(combined) > max_results * 2:
            combined = combined[: max_results * 2]
        source_label = " + ".join(dict.fromkeys(sources)) or "Home Assistant"
        return {
            "elements": combined,
            "endpoint": source_label,
            "sources": list(dict.fromkeys(sources)),
            "warnings": provider_errors,
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
