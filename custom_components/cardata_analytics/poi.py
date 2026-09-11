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
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

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

# Charging infrastructure is deliberately bulk-cached locally.  The map's
# charging search therefore does not depend on a public query service for every
# radius/filter change.  Eco-Movement publishes AFIR/DATEX-II data through the
# German national access point (Mobilithek).  Bundesnetzagentur publishes a
# monthly CC-BY CSV which is normalized and stored locally as a fallback.
AFIR_ECOMOVEMENT_PUBLICATION_ID = "954064102947180544"
AFIR_ECOMOVEMENT_URL = (
    "https://mobilithek.info/mdp-api/mdp-conn-server/v1/publication/"
    f"{AFIR_ECOMOVEMENT_PUBLICATION_ID}/file/noauth"
)
BNETZA_PAGE_URL = (
    "https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/"
    "E-Mobilitaet/Ladesaeulenkarte/start.html"
)
# Safe initial fallback for the current release.  Normal operation discovers the
# newest CSV link from the BNetzA page before downloading.
BNETZA_FALLBACK_CSV_URL = (
    "https://data.bundesnetzagentur.de/Bundesnetzagentur/DE/Fachthemen/"
    "ElektrizitaetundGas/E-Mobilitaet/Ladesaeulenregister_BNetzA_2026-07-28.csv"
)
CHARGING_DATASET_CACHE_VERSION = 1
CHARGING_AFIR_TTL_SECONDS = 6 * 60 * 60
CHARGING_BNETZA_TTL_SECONDS = 7 * 24 * 60 * 60
CHARGING_MAX_STALE_SECONDS = 45 * 24 * 60 * 60

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
        int(msg.get("min_power_kw", 0)),
        bool(msg.get("include_unknown_power", True)),
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
                            "Cardata Analytics/0.1.30 "
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
                "User-Agent": "Cardata Analytics/0.1.30 (https://github.com/lemuba/cardata-analytics)",
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


async def _async_discover_bnetza_csv_url(hass: HomeAssistant) -> str:
    session = async_get_clientsession(hass)
    try:
        async with asyncio.timeout(15.0):
            async with session.get(
                BNETZA_PAGE_URL,
                headers={"User-Agent": "Cardata Analytics/0.1.30"},
            ) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status}")
                page = await response.text(errors="replace")
        candidates = re.findall(
            r"href=[\"']([^\"']*Ladesaeulenregister_BNetzA_[^\"']+\\.csv)[\"']",
            page,
            flags=re.I,
        )
        if candidates:
            return urljoin(BNETZA_PAGE_URL, html.unescape(candidates[-1]))
    except Exception as err:
        _LOGGER.debug("BNetzA CSV discovery failed, using release fallback: %s", err)
    return BNETZA_FALLBACK_CSV_URL


async def _async_refresh_bnetza_dataset(hass: HomeAssistant) -> dict[str, Any]:
    url = await _async_discover_bnetza_csv_url(hass)
    session = async_get_clientsession(hass)
    async with asyncio.timeout(75.0):
        async with session.get(
            url,
            headers={"Accept": "text/csv, application/octet-stream;q=0.8, */*;q=0.5", "User-Agent": "Cardata Analytics/0.1.30"},
            allow_redirects=True,
        ) as response:
            if response.status != 200:
                raise RuntimeError(f"Bundesnetzagentur CSV: HTTP {response.status}")
            body = await response.read()
    elements = await hass.async_add_executor_job(_parse_bnetza_csv, body)
    dataset = {
        "provider": "bnetza",
        "elements": elements,
        "fetched_at": time.time(),
        "source_url": url,
    }
    await hass.async_add_executor_job(_write_dataset_cache, _dataset_cache_path(hass, "bnetza"), dataset)
    hass.data.setdefault(DOMAIN, {}).setdefault(DATA_CHARGING_DATASETS, {})["bnetza"] = dataset
    return dataset


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


async def _async_collect_local_charging(
    hass: HomeAssistant, msg: dict[str, Any]
) -> tuple[list[dict[str, Any]], list[str], list[str], bool]:
    """Return locally searchable charging data without per-query public APIs."""
    warnings: list[str] = []
    sources: list[str] = []
    provider_available = False

    # AFIR is the primary source and small enough to await once when a fresh
    # installation has no local cache.  BNetzA's ~50 MB monthly CSV is warmed in
    # the background and never blocks the normal map query on first use.
    afir_dataset: dict[str, Any] = {"elements": []}
    bnetza_dataset: dict[str, Any] = {"elements": []}
    try:
        afir_dataset, afir_warnings = await _async_get_charging_dataset(
            hass, "afir", wait_if_empty=True
        )
        warnings.extend(afir_warnings)
        provider_available = provider_available or bool(afir_dataset.get("elements"))
    except Exception as err:
        warnings.append(f"AFIR/Mobilithek: {err}")

    try:
        bnetza_dataset, bnetza_warnings = await _async_get_charging_dataset(
            hass, "bnetza", wait_if_empty=False
        )
        warnings.extend(bnetza_warnings)
        provider_available = provider_available or bool(bnetza_dataset.get("elements"))
    except Exception as err:
        warnings.append(f"Bundesnetzagentur: {err}")

    filtered_tasks = []
    labels = []
    if afir_dataset.get("elements"):
        filtered_tasks.append(
            hass.async_add_executor_job(_filter_charging_dataset, afir_dataset["elements"], msg)
        )
        labels.append("AFIR / Mobilithek")
    if bnetza_dataset.get("elements"):
        filtered_tasks.append(
            hass.async_add_executor_job(_filter_charging_dataset, bnetza_dataset["elements"], msg)
        )
        labels.append("Bundesnetzagentur lokal")

    combined: list[dict[str, Any]] = []
    if filtered_tasks:
        results = await asyncio.gather(*filtered_tasks, return_exceptions=True)
        for label, result in zip(labels, results):
            if isinstance(result, Exception):
                warnings.append(f"{label}: lokale Filterung fehlgeschlagen ({result})")
            else:
                combined.extend(result)
                sources.append(label)
    return _merge_cross_provider_charging(combined), sources, warnings, provider_available


async def async_warm_charging_sources(hass: HomeAssistant) -> None:
    """Warm charging caches without competing with the primary AFIR download.

    This coroutine itself is started as a Home Assistant background task.  On a
    fresh install we give the comparatively small AFIR feed priority and only
    start the ~50 MB BNetzA bulk refresh after AFIR has finished (or failed).
    That keeps first-use IONITY/CCS searches responsive on slower HA hosts.
    """
    try:
        afir = await _async_load_disk_dataset(hass, "afir")
        afir_age = time.time() - float(afir.get("fetched_at", 0.0) or 0.0)
        if not afir.get("elements") or afir_age > CHARGING_AFIR_TTL_SECONDS:
            afir_task = await _async_start_dataset_refresh(hass, "afir")
            try:
                await asyncio.shield(afir_task)
            except Exception as err:
                _LOGGER.debug("AFIR warm-up failed; BNetzA fallback will still be prepared: %s", err)

        bnetza = await _async_load_disk_dataset(hass, "bnetza")
        bnetza_age = time.time() - float(bnetza.get("fetched_at", 0.0) or 0.0)
        if not bnetza.get("elements") or bnetza_age > CHARGING_BNETZA_TTL_SECONDS:
            # Do not await the large monthly CSV: the refresh remains fully in
            # the background and the previous cache stays usable meanwhile.
            await _async_start_dataset_refresh(hass, "bnetza")
    except Exception:
        _LOGGER.exception("Could not warm Cardata charging datasets")


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
                str(msg.get("search_filter", "")),
                str(msg.get("operator_filter", "")),
                "any",
            )
            general_task = hass.async_create_task(
                _async_fetch_overpass(hass, query, int(msg["timeout_seconds"]))
            )

        charging_provider_available = False
        if charging_requested:
            charging_elements, charging_sources, charging_warnings, charging_provider_available = (
                await _async_collect_local_charging(hass, msg)
            )
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

        # OSM is only a bounded emergency fallback for charging.  A working
        # AFIR/BNetzA cache returning zero filtered matches is a valid result and
        # must never trigger another public-query dependency.
        if charging_requested and not charging_provider_available:
            query = _build_overpass_query(
                float(msg["latitude"]),
                float(msg["longitude"]),
                int(msg["radius_km"]),
                ["charging"],
                int(msg["max_results"]),
                min(18, int(msg["timeout_seconds"])),
                str(msg.get("search_filter", "")),
                str(msg.get("operator_filter", "")),
                str(msg.get("connector_filter", "any")),
            )
            try:
                fallback, endpoint = await _async_fetch_overpass(hass, query, min(18, int(msg["timeout_seconds"])))
                fallback = _aggregate_osm_charging(fallback, "osm")
                fallback = await hass.async_add_executor_job(_filter_charging_dataset, fallback, msg)
                combined.extend(fallback)
                sources.append(_endpoint_host(endpoint))
                warnings.append("Ladestationen: OSM-Notfallfallback aktiv")
            except Exception as err:
                warnings.append(f"OSM-EV-Fallback: {err}")

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
            raise RuntimeError(" · ".join(warnings))

        return {
            "elements": combined,
            "endpoint": " + ".join(dict.fromkeys(sources)) or "Lokaler POI-Cache",
            "sources": list(dict.fromkeys(sources)),
            "warnings": warnings,
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
