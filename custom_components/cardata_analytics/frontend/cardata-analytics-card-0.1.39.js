const DOMAIN = "cardata_analytics";
const CARD_TAG = "cardata-analytics-card";
const CARD_VERSION = "0.1.39";
const POI_RADIUS_OPTIONS_KM = [2, 5, 10, 25, 50, 100, 150, 200];

// MapLibre is the single rendering engine for every basemap and for the live
// vehicle/POI geometry. Keeping one geographic renderer prevents HTML overlays
// from drifting away from the map during pan/zoom, especially on iOS WebView.
// If another custom card already loaded MapLibre, reuse that global instance.
const CARDATA_MAPLIBRE_JS = "https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js";
const CARDATA_OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const CARDATA_OPENFREEMAP_GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

function ensureCardataMapLibre() {
  if (window.maplibregl && typeof window.maplibregl.Map === "function") {
    return Promise.resolve(window.maplibregl);
  }
  if (window.__cardataMapLibrePromise) return window.__cardataMapLibrePromise;

  window.__cardataMapLibrePromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (window.maplibregl && typeof window.maplibregl.Map === "function") resolve(window.maplibregl);
      else reject(new Error("MapLibre wurde geladen, ist aber nicht verfügbar."));
    };
    const existing = [...document.scripts].find((script) => /maplibre-gl(?:@|\/)/i.test(script.src || ""));
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("MapLibre konnte nicht geladen werden.")), { once: true });
      if (window.maplibregl && typeof window.maplibregl.Map === "function") finish();
      return;
    }
    const script = document.createElement("script");
    script.src = CARDATA_MAPLIBRE_JS;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = finish;
    script.onerror = () => reject(new Error("MapLibre konnte nicht geladen werden."));
    document.head.appendChild(script);
  });
  return window.__cardataMapLibrePromise;
}

class CardataAnalyticsCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = {};
    this._registryLoaded = false;
    this._loadingRegistry = false;
    this._entities = [];
    this._devices = [];
    this._unsubEntityRegistry = null;
    this._unsubDeviceRegistry = null;
    this._subscriptionsStarted = false;
    this._registryReloadTimer = null;
    this._controlInteraction = false;
    this._renderPending = false;
    this._lastStateSignature = null;
    this._lastStructureSignature = null;
    this._domBuilt = false;
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this._ensureRegistrySubscriptions();
  }

  disconnectedCallback() {
    this._stopRegistrySubscriptions();
  }

  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    this._config = config || {};
  }

  // In Home Assistant's Sections view we want enough horizontal room for
  // two vehicle columns by default. Masonry views still control card width.
  getGridOptions() {
    return {
      columns: "full",
      min_columns: 6,
    };
  }

  set hass(hass) {
    this._hass = hass;
    this._ensureRegistrySubscriptions();
    this._loadGlobalPoiTemplates();

    if (!this._registryLoaded && !this._loadingRegistry) {
      this._loadRegistry();
      return;
    }

    if (!this._registryLoaded) return;

    const signature = this._stateSignature();
    if (signature === this._lastStateSignature) return;

    if (this._isControlInteractionActive()) {
      this._renderPending = true;
      return;
    }

    // State changes only update the already existing DOM nodes. This keeps
    // focus and scroll position stable in iOS/iPadOS WebView.
    if (this._domBuilt && this._structureSignature() === this._lastStructureSignature) {
      this._updateValues();
      this._lastStateSignature = signature;
      return;
    }

    this._renderFull();
  }

  getCardSize() {
    return Math.max(4, this._vehicleGroups().length * 4 + 3);
  }

  _isControlInteractionActive() {
    // Only suppress updates while a native picker/dropdown is actually open.
    // A SELECT/INPUT may keep keyboard focus after the user has committed a
    // value. Treating mere focus as an active interaction left later HA state
    // updates queued forever until the field was blurred, so the dashboard
    // could show the new dates together with stale selected-period values.
    return this._controlInteraction;
  }

  _beginControlInteraction() {
    this._controlInteraction = true;
  }

  _finishControlInteraction(delay = 0) {
    window.setTimeout(() => {
      this._controlInteraction = false;
      this._flushPendingValues();
    }, delay);
  }

  _flushPendingValues() {
    // Always patch once after a committed control change. Home Assistant may
    // deliver the global date/select state before the vehicle sensor states;
    // later hass-setter calls remain unblocked and patch again when those
    // sensor states arrive. This prevents a focused control from pinning stale
    // selected-period values indefinitely.
    this._renderPending = false;
    if (this._domBuilt && this._structureSignature() === this._lastStructureSignature) {
      this._updateValues();
      this._lastStateSignature = this._stateSignature();
    } else {
      this._renderFull();
    }
  }

  _wireControlInteraction(el) {
    if (!el) return;
    el.addEventListener("pointerdown", () => this._beginControlInteraction());
    el.addEventListener("focus", () => this._beginControlInteraction());
    el.addEventListener("blur", () => this._finishControlInteraction(50));
  }

  async _ensureRegistrySubscriptions() {
    if (!this.isConnected || !this._hass?.connection || this._subscriptionsStarted) return;
    this._subscriptionsStarted = true;
    try {
      this._unsubEntityRegistry = await this._hass.connection.subscribeEvents(
        () => this._scheduleRegistryReload(),
        "entity_registry_updated"
      );
      this._unsubDeviceRegistry = await this._hass.connection.subscribeEvents(
        () => this._scheduleRegistryReload(),
        "device_registry_updated"
      );
    } catch (err) {
      this._subscriptionsStarted = false;
      console.warn("Cardata Analytics: Registry-Abonnement nicht verfügbar", err);
    }
  }

  _stopRegistrySubscriptions() {
    for (const unsub of [this._unsubEntityRegistry, this._unsubDeviceRegistry]) {
      try { if (typeof unsub === "function") unsub(); } catch (_) { /* no-op */ }
    }
    this._unsubEntityRegistry = null;
    this._unsubDeviceRegistry = null;
    this._subscriptionsStarted = false;
    if (this._registryReloadTimer) {
      clearTimeout(this._registryReloadTimer);
      this._registryReloadTimer = null;
    }
  }

  _scheduleRegistryReload() {
    if (this._registryReloadTimer) clearTimeout(this._registryReloadTimer);
    this._registryReloadTimer = setTimeout(() => {
      this._registryReloadTimer = null;
      this._loadRegistry();
    }, 150);
  }

  async _loadRegistry() {
    if (!this._hass || this._loadingRegistry) return;
    this._loadingRegistry = true;
    try {
      const [entities, devices] = await Promise.all([
        this._hass.callWS({ type: "config/entity_registry/list" }),
        this._hass.callWS({ type: "config/device_registry/list" }),
      ]);
      this._entities = (entities || []).filter((e) => e.platform === DOMAIN && !e.disabled_by);
      this._devices = devices || [];
      this._registryLoaded = true;
      this._lastStateSignature = null;
      this._lastStructureSignature = null;
    } catch (err) {
      console.error("Cardata Analytics: Registry konnte nicht geladen werden", err);
    } finally {
      this._loadingRegistry = false;
      this._renderFull();
    }
  }

  _deviceName(deviceId) {
    const dev = this._devices.find((d) => d.id === deviceId);
    return dev?.name_by_user || dev?.name || "Fahrzeug";
  }

  _vehicleGroups() {
    const groups = new Map();
    for (const ent of this._entities) {
      if (!ent.device_id) continue;
      const uid = ent.unique_id || "";
      if (uid.startsWith("global_")) continue;
      if (!groups.has(ent.device_id)) {
        groups.set(ent.device_id, {
          deviceId: ent.device_id,
          name: this._deviceName(ent.device_id),
          entities: {},
        });
      }
      const key = this._keyFromUniqueId(uid);
      if (key) groups.get(ent.device_id).entities[key] = ent.entity_id;
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  _keyFromUniqueId(uid) {
    const suffixMap = [
      ["custom_average_consumption", "custom_average_consumption"],
      ["custom_distance", "custom_distance"],
      ["custom_energy", "custom_energy"],
      ["average_consumption_day", "average_consumption_today"],
      ["average_consumption_week", "average_consumption_week"],
      ["average_consumption_month", "average_consumption_month"],
      ["average_consumption_year", "average_consumption_year"],
      ["distance_day", "distance_today"],
      ["distance_week", "distance_week"],
      ["distance_month", "distance_month"],
      ["distance_year", "distance_year"],
      ["energy_day", "energy_consumed_today"],
      ["energy_week", "energy_consumed_week"],
      ["energy_month", "energy_consumed_month"],
      ["energy_year", "energy_consumed_year"],
      ["energy_consumed_total", "energy_consumed_total"],
      ["battery_capacity", "battery_capacity"],
      ["mileage", "mileage"],
      ["soc", "soc"],
      ["soh", "soh"],
      ["range", "range"],
      ["latitude", "latitude"],
      ["longitude", "longitude"],
      ["current_address", "current_address"],
    ];
    for (const [suffix, key] of suffixMap) {
      if (uid.endsWith(`_${suffix}`)) return key;
    }
    return null;
  }

  _globalEntity(uniqueId) {
    return this._entities.find((e) => e.unique_id === uniqueId)?.entity_id || null;
  }

  _state(entityId, fallback = "—") {
    if (!entityId || !this._hass) return fallback;
    const obj = this._hass.states[entityId];
    if (!obj || ["unknown", "unavailable"].includes(obj.state)) return fallback;
    return obj.state;
  }

  _num(entityId, decimals = 1) {
    const raw = this._state(entityId, null);
    if (raw === null) return "—";
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    return n.toLocaleString("de-DE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  }

  _unit(entityId, fallback = "") {
    return this._hass?.states?.[entityId]?.attributes?.unit_of_measurement || fallback;
  }

  _addressText(entityId) {
    const obj = entityId ? this._hass?.states?.[entityId] : null;
    const value = obj?.state;
    return !value || ["unknown", "unavailable", "none", ""].includes(String(value).toLowerCase())
      ? null
      : String(value);
  }

  _locationAvailable(entities) {
    if (!entities?.current_address || !this._addressText(entities.current_address)) return false;
    const rawLat = this._state(entities.latitude, null);
    const rawLon = this._state(entities.longitude, null);
    if (rawLat == null || rawLon == null || String(rawLat).trim() === "" || String(rawLon).trim() === "") return false;
    const lat = Number(rawLat);
    const lon = Number(rawLon);
    return Number.isFinite(lat) && Number.isFinite(lon)
      && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  }

  _locationUpdatedAt(entities) {
    const timestamps = [entities?.latitude, entities?.longitude]
      .map((id) => this._hass?.states?.[id])
      .map((obj) => obj?.last_updated || obj?.last_changed)
      .filter(Boolean)
      .sort();
    if (timestamps.length) return timestamps.at(-1);
    return this._hass?.states?.[entities?.current_address]?.attributes?.last_geocoded || null;
  }

  _locationAgeText(entities) {
    const iso = this._locationUpdatedAt(entities);
    if (!iso) return "Standortzeit unbekannt";
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "Standortzeit unbekannt";
    const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (sec < 60) return "Standort gerade aktualisiert";
    const min = Math.round(sec / 60);
    if (min < 60) return `Standort vor ${min} Min. aktualisiert`;
    const hrs = Math.round(min / 60);
    if (hrs < 24) return `Standort vor ${hrs} Std. aktualisiert`;
    const days = Math.round(hrs / 24);
    return `Standort vor ${days} Tag${days === 1 ? "" : "en"} aktualisiert`;
  }

  _googleMapsUrl(entityId) {
    if (!entityId || !this._hass) return null;
    const stateObj = this._hass.states[entityId];
    const url = stateObj?.attributes?.google_maps_url;
    if (typeof url === "string" && url.startsWith("https://")) return url;
    const lat = Number(stateObj?.attributes?.latitude);
    const lon = Number(stateObj?.attributes?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`;
  }

  _stateSignature() {
    if (!this._hass || !this._registryLoaded) return null;
    const parts = [];
    const ids = this._entities.map((e) => e.entity_id).filter(Boolean).sort();
    for (const entityId of ids) {
      const stateObj = this._hass.states[entityId];
      if (!stateObj) {
        parts.push(`${entityId}=<missing>`);
        continue;
      }
      let extra = "";
      if (entityId.startsWith("select.")) {
        extra = `|${JSON.stringify(stateObj.attributes?.options || [])}`;
      }
      const registryEntry = this._entities.find((entry) => entry.entity_id === entityId);
      if ((registryEntry?.unique_id || "").endsWith("_current_address")) {
        extra += `|location=${JSON.stringify({
          google_maps_url: stateObj.attributes?.google_maps_url || "",
          last_geocoded: stateObj.attributes?.last_geocoded || "",
          using_cached_address: stateObj.attributes?.using_cached_address === true,
        })}`;
      }
      if ((registryEntry?.unique_id || "").endsWith("_latitude")
          || (registryEntry?.unique_id || "").endsWith("_longitude")) {
        extra += `|updated=${stateObj.last_updated || stateObj.last_changed || ""}`;
      }
      if (Object.prototype.hasOwnProperty.call(stateObj.attributes || {}, "data_complete")) {
        extra += `|coverage=${JSON.stringify({
          data_complete: stateObj.attributes?.data_complete,
          coverage_status: stateObj.attributes?.coverage_status,
          tracking_started_at: stateObj.attributes?.tracking_started_at,
          tracking_started_date: stateObj.attributes?.tracking_started_date,
          history_complete_from: stateObj.attributes?.history_complete_from,
          effective_data_from: stateObj.attributes?.effective_data_from,
          coverage_available_from: stateObj.attributes?.coverage_available_from,
          historical_days_expected: stateObj.attributes?.historical_days_expected,
          historical_days_covered: stateObj.attributes?.historical_days_covered,
          requested_from: stateObj.attributes?.requested_from,
          requested_to: stateObj.attributes?.requested_to,
          partial_energy_kwh: stateObj.attributes?.partial_energy_kwh,
          partial_distance_km: stateObj.attributes?.partial_distance_km,
          partial_average_consumption: stateObj.attributes?.partial_average_consumption,
        })}`;
      }
      parts.push(`${entityId}=${stateObj.state}${extra}`);
    }
    return parts.join(";");
  }

  _structureSignature() {
    const vehicles = this._vehicleGroups().map((v) => [
      v.deviceId,
      v.name,
      Object.entries(v.entities).sort(([a], [b]) => a.localeCompare(b)),
    ]);
    return JSON.stringify({
      vehicles,
      preset: this._globalEntity("global_range_preset"),
      from: this._globalEntity("global_range_from"),
      to: this._globalEntity("global_range_to"),
    });
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", {
      bubbles: true,
      composed: true,
      detail: { entityId },
    }));
  }

  _socColor(entityId) {
    const n = Number(this._state(entityId, 0));
    return n >= 60
      ? "var(--success-color, #2e7d32)"
      : n >= 30
        ? "var(--warning-color, #f9a825)"
        : "var(--error-color, #c62828)";
  }

  _vehicleId(v) {
    return String(v.deviceId || "vehicle").replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  _metric(entityId, label, unit = "", decimals = 1, icon = "mdi:gauge", bind = "") {
    const val = this._num(entityId, decimals);
    const shownUnit = unit || this._unit(entityId);
    const clickable = entityId ? " clickable" : "";
    return `<div class="metric${clickable}" data-entity="${this._esc(entityId || "")}">
      <div class="metric-icon"><ha-icon icon="${this._esc(icon)}"></ha-icon></div>
      <div class="metric-text">
        <div class="metric-value"><span class="value" data-bind="${this._esc(bind)}">${this._esc(val)}</span>${shownUnit ? ` <span>${this._esc(shownUnit)}</span>` : ""}</div>
        <div class="metric-label">${this._esc(label)}</div>
      </div>
    </div>`;
  }

  _periodCard(v, period, label) {
    const e = v.entities;
    const suffix = { today: "today", week: "week", month: "month", year: "year" }[period];
    const distance = e[`distance_${suffix}`];
    const energy = e[`energy_consumed_${suffix}`];
    const avg = e[`average_consumption_${suffix}`];
    const id = this._vehicleId(v);
    return `<div class="period clickable" data-entity="${this._esc(avg || distance || energy || "")}">
      <div class="period-title">${label}</div>
      <div><span data-bind="${id}:${period}:distance">${this._esc(this._num(distance, 1))}</span> km</div>
      <div><span data-bind="${id}:${period}:energy">${this._esc(this._num(energy, 2))}</span> kWh</div>
      <div>Ø <span data-bind="${id}:${period}:avg">${this._esc(this._num(avg, 1))}</span> kWh/100 km</div>
    </div>`;
  }

  _formatCoverageDate(value) {
    if (!value) return "";
    const raw = String(value);
    const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      const [, year, month, day] = dateOnly;
      return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString("de-DE");
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toLocaleDateString("de-DE");
  }

  _localDateKey(value) {
    if (!value) return "";
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : "";
    }
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  _coverageInfo(entityId) {
    const stateObj = entityId ? this._hass?.states?.[entityId] : null;
    const attrs = stateObj?.attributes || {};
    const status = attrs.coverage_status || "";
    const complete = attrs.data_complete === true;

    if (complete) return { show: false, text: "", status };

    // Coverage is determined by the backend. The first tracked calendar day is
    // usable; ranges starting before that date are intentionally incomplete.
    const availableFrom = this._formatCoverageDate(
      attrs.coverage_available_from || attrs.effective_data_from
      || attrs.tracking_started_at || attrs.history_complete_from
    );
    const expectedDays = Number(attrs.historical_days_expected ?? 0);
    const coveredDays = Number(attrs.historical_days_covered ?? 0);

    let text;
    if (status === "future") {
      text = "Zeitraum liegt teilweise oder vollständig in der Zukunft.";
    } else if (status === "invalid_range") {
      text = "Ungültiger Zeitraum: Das Von-Datum liegt nach dem Bis-Datum.";
    } else if (status === "entities_missing") {
      text = "Zeitraum kann noch nicht ausgewertet werden – Analytics-Entitäten fehlen.";
    } else if (status === "source_unavailable") {
      text = "Zeitraum kann aktuell nicht vollständig ausgewertet werden – der Kilometerstand ist nicht verfügbar.";
    } else if (status === "missing_daily_history") {
      const days = expectedDays > 0 ? ` (${coveredDays}/${expectedDays} historische Tage vorhanden)` : "";
      text = availableFrom
        ? `Zeitraum nicht vollständig auswertbar · Analytics-Daten verfügbar ab ${availableFrom}${days}.`
        : `Zeitraum nicht vollständig auswertbar · einzelne Tagesdaten fehlen${days}.`;
    } else if (status === "no_history" || status === "calculation_error") {
      text = availableFrom
        ? `Zeitraum nicht vollständig auswertbar · Analytics-Daten verfügbar ab ${availableFrom}.`
        : "Zeitraum nicht vollständig auswertbar.";
    } else if (status === "partial") {
      const days = expectedDays > 0 ? ` (${coveredDays}/${expectedDays} historische Tage vorhanden)` : "";
      text = availableFrom
        ? `Zeitraum nicht vollständig auswertbar · Analytics-Daten verfügbar ab ${availableFrom}${days}.`
        : `Zeitraum nicht vollständig auswertbar${days}.`;
    } else if (status === "initializing" || !status) {
      text = "Auswertung wird aktualisiert …";
    } else {
      text = availableFrom
        ? `Zeitraum nicht vollständig auswertbar · Analytics-Daten verfügbar ab ${availableFrom}.`
        : "Zeitraum nicht vollständig auswertbar.";
    }
    return { show: true, text, status };
  }

  _coverageWarning(v) {
    const id = this._vehicleId(v);
    const info = this._coverageInfo(v.entities.custom_average_consumption || v.entities.custom_energy);
    return `<div class="coverage-warning${info.show ? "" : " hidden"}" data-bind="${this._esc(`${id}:coverage`)}">
      <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
      <span>${this._esc(info.text)}</span>
    </div>`;
  }

  _vehicleCard(v) {
    const e = v.entities;
    const id = this._vehicleId(v);
    const soc = this._num(e.soc, 1);
    const soh = e.soh ? this._num(e.soh, 1) : null;
    const range = e.range ? this._num(e.range, 0) : null;
    return `<section class="vehicle" data-vehicle="${this._esc(id)}">
      <div class="vehicle-head clickable" data-entity="${this._esc(e.soc || "")}">
        <div class="car-dot" data-bind="${id}:soc-color" style="background:${this._socColor(e.soc)}"><ha-icon icon="mdi:car-electric"></ha-icon></div>
        <div>
          <h2>${this._esc(v.name)}</h2>
          <div class="sub">
            SoC <span data-bind="${id}:soc">${this._esc(soc)}</span> %
            ${e.soh ? ` · SoH <span data-bind="${id}:soh">${this._esc(soh)}</span> %` : ""}
            ${e.range ? ` · <span data-bind="${id}:range">${this._esc(range)}</span> km` : ""}
          </div>
        </div>
      </div>
      ${e.current_address ? `<div class="location-row${this._locationAvailable(e) ? "" : " hidden"}" data-bind-row="${id}:location">
        <ha-icon icon="mdi:map-marker"></ha-icon>
        <span class="location-copy">
          <span class="location-text" data-bind="${id}:address">${this._esc(this._addressText(e.current_address) || "")}</span>
          <small class="location-age" data-bind="${id}:location-age">${this._esc(this._locationAgeText(e))}</small>
        </span>
        <a class="maps-btn${this._googleMapsUrl(e.current_address) ? "" : " hidden"}" data-bind-link="${id}:maps" href="${this._esc(this._googleMapsUrl(e.current_address) || "#")}" target="_blank" rel="noopener" title="In Google Maps öffnen"><ha-icon icon="mdi:google-maps"></ha-icon><span>Maps</span></a>
      </div>` : ""}
      <div class="metrics">
        ${this._metric(e.battery_capacity, "Kapazität", "kWh", 2, "mdi:battery-high", `${id}:capacity`)}
        ${this._metric(e.mileage, "Kilometerstand", "km", 1, "mdi:counter", `${id}:mileage`)}
        ${this._metric(e.energy_consumed_total, "Energie gesamt", "kWh", 2, "mdi:lightning-bolt", `${id}:energy-total`)}
      </div>
      <div class="periods">
        ${this._periodCard(v, "today", "Heute")}
        ${this._periodCard(v, "week", "Woche")}
        ${this._periodCard(v, "month", "Monat")}
        ${this._periodCard(v, "year", "Jahr")}
      </div>
      <div class="selected-period clickable" data-entity="${this._esc(e.custom_average_consumption || "")}">
        <strong>Gewählter Zeitraum</strong>
        <span><span data-bind="${id}:custom-distance">${this._esc(this._num(e.custom_distance, 1))}</span> km</span>
        <span><span data-bind="${id}:custom-energy">${this._esc(this._num(e.custom_energy, 2))}</span> kWh</span>
        <span>Ø <span data-bind="${id}:custom-avg">${this._esc(this._num(e.custom_average_consumption, 1))}</span> kWh/100 km</span>
        ${this._coverageWarning(v)}
      </div>
    </section>`;
  }

  _comparisonText(vehicles) {
    if (vehicles.length < 2) return "";
    const valid = vehicles
      .map((v) => ({ v, avg: Number(this._state(v.entities.custom_average_consumption, NaN)) }))
      .filter((x) => Number.isFinite(x.avg) && x.avg > 0);
    if (valid.length < 2) return "";
    valid.sort((a, b) => a.avg - b.avg);
    const best = valid[0];
    const second = valid[1];
    const diff = (second.avg - best.avg).toLocaleString("de-DE", { maximumFractionDigits: 1 });
    return `${best.v.name} im gewählten Zeitraum um ${diff} kWh/100 km effizienter als ${second.v.name}.`;
  }

  _comparison(vehicles) {
    const text = this._comparisonText(vehicles);
    return `<div class="comparison${text ? "" : " hidden"}" id="comparison">${this._esc(text)}</div>`;
  }

  _setText(bind, value) {
    const el = this.shadowRoot?.querySelector(`[data-bind="${CSS.escape(bind)}"]`);
    if (el && el.textContent !== String(value)) el.textContent = String(value);
  }

  _updateVehicleValues(v) {
    const e = v.entities;
    const id = this._vehicleId(v);
    this._setText(`${id}:soc`, this._num(e.soc, 1));
    if (e.soh) this._setText(`${id}:soh`, this._num(e.soh, 1));
    if (e.range) this._setText(`${id}:range`, this._num(e.range, 0));
    this._setText(`${id}:capacity`, this._num(e.battery_capacity, 2));
    this._setText(`${id}:mileage`, this._num(e.mileage, 1));
    this._setText(`${id}:energy-total`, this._num(e.energy_consumed_total, 2));

    if (e.current_address) {
      const locationVisible = this._locationAvailable(e);
      const row = this.shadowRoot?.querySelector(`[data-bind-row="${CSS.escape(`${id}:location`)}"]`);
      row?.classList.toggle("hidden", !locationVisible);
      this._setText(`${id}:address`, this._addressText(e.current_address) || "");
      this._setText(`${id}:location-age`, this._locationAgeText(e));
      const link = this.shadowRoot?.querySelector(`[data-bind-link="${CSS.escape(`${id}:maps`)}"]`);
      if (link) {
        const url = locationVisible ? this._googleMapsUrl(e.current_address) : null;
        link.classList.toggle("hidden", !url);
        if (url && link.getAttribute("href") !== url) link.setAttribute("href", url);
      }
    }

    for (const period of ["today", "week", "month", "year"]) {
      this._setText(`${id}:${period}:distance`, this._num(e[`distance_${period}`], 1));
      this._setText(`${id}:${period}:energy`, this._num(e[`energy_consumed_${period}`], 2));
      this._setText(`${id}:${period}:avg`, this._num(e[`average_consumption_${period}`], 1));
    }

    this._setText(`${id}:custom-distance`, this._num(e.custom_distance, 1));
    this._setText(`${id}:custom-energy`, this._num(e.custom_energy, 2));
    this._setText(`${id}:custom-avg`, this._num(e.custom_average_consumption, 1));

    const coverage = this.shadowRoot?.querySelector(`[data-bind="${CSS.escape(`${id}:coverage`)}"]`);
    if (coverage) {
      const info = this._coverageInfo(e.custom_average_consumption || e.custom_energy);
      const textEl = coverage.querySelector("span");
      if (textEl && textEl.textContent !== info.text) textEl.textContent = info.text;
      coverage.classList.toggle("hidden", !info.show);
    }

    const dot = this.shadowRoot?.querySelector(`[data-bind="${CSS.escape(`${id}:soc-color`)}"]`);
    if (dot) dot.style.background = this._socColor(e.soc);
  }

  _updateValues() {
    if (!this.shadowRoot || !this._domBuilt) return;

    const vehicles = this._vehicleGroups();
    for (const v of vehicles) this._updateVehicleValues(v);

    const preset = this._globalEntity("global_range_preset");
    const from = this._globalEntity("global_range_from");
    const to = this._globalEntity("global_range_to");
    const active = this.shadowRoot.activeElement;

    const presetEl = this.shadowRoot.getElementById("preset");
    const fromEl = this.shadowRoot.getElementById("from");
    const toEl = this.shadowRoot.getElementById("to");

    if (presetEl && active !== presetEl) {
      const options = this._hass.states[preset]?.attributes?.options || [];
      const oldOptions = [...presetEl.options].map((o) => o.value);
      if (JSON.stringify(oldOptions) !== JSON.stringify(options)) {
        presetEl.replaceChildren(...options.map((option) => {
          const el = document.createElement("option");
          el.value = option;
          el.textContent = option;
          return el;
        }));
      }
      const value = this._state(preset, "");
      if (presetEl.value !== value) presetEl.value = value;
    }
    if (fromEl && active !== fromEl) {
      const value = this._state(from, "");
      if (fromEl.value !== value) fromEl.value = value;
    }
    if (toEl && active !== toEl) {
      const value = this._state(to, "");
      if (toEl.value !== value) toEl.value = value;
    }

    const comparison = this.shadowRoot.getElementById("comparison");
    if (comparison) {
      const text = this._comparisonText(vehicles);
      comparison.textContent = text;
      comparison.classList.toggle("hidden", !text);
    }
  }

  _renderFull() {
    if (!this.shadowRoot) return;
    if (!this._hass || !this._registryLoaded) {
      this.shadowRoot.innerHTML = `<ha-card><div class="loading">Cardata Analytics wird geladen …</div></ha-card>`;
      this._domBuilt = false;
      return;
    }

    const vehicles = this._vehicleGroups();
    const preset = this._globalEntity("global_range_preset");
    const from = this._globalEntity("global_range_from");
    const to = this._globalEntity("global_range_to");
    const options = this._hass.states[preset]?.attributes?.options || [];
    const optionHtml = options
      .map((o) => `<option value="${this._esc(o)}" ${this._state(preset) === o ? "selected" : ""}>${this._esc(o)}</option>`)
      .join("");

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card>
        <div class="wrap">
          <header>
            <div><h1>Cardata Analytics</h1><div class="muted">Fahrzeugübersicht & Verbrauchsanalyse</div></div>
            <div class="count">${vehicles.length} Fahrzeug${vehicles.length === 1 ? "" : "e"}</div>
          </header>
          <div class="range">
            <label>Schnellwahl<select id="preset" ${preset ? "" : "disabled"}>${optionHtml}</select></label>
            <label>Von<input id="from" type="date" value="${this._esc(this._state(from, ""))}" ${from ? "" : "disabled"}></label>
            <label>Bis<input id="to" type="date" value="${this._esc(this._state(to, ""))}" ${to ? "" : "disabled"}></label>
          </div>
          ${this._comparison(vehicles)}
          <div class="vehicles ${vehicles.length === 1 ? "single" : ""}">${vehicles.map((v) => this._vehicleCard(v)).join("") || `<div class="empty">Noch kein Fahrzeug in der Integration eingerichtet.</div>`}</div>
        </div>
      </ha-card>`;

    this.shadowRoot.querySelectorAll("[data-entity]").forEach((el) => {
      el.addEventListener("click", () => this._moreInfo(el.dataset.entity));
    });

    const presetEl = this.shadowRoot.getElementById("preset");
    const fromEl = this.shadowRoot.getElementById("from");
    const toEl = this.shadowRoot.getElementById("to");
    for (const control of [presetEl, fromEl, toEl]) this._wireControlInteraction(control);

    if (presetEl && preset) {
      presetEl.addEventListener("change", async (ev) => {
        // The native dropdown has already committed/closed when change fires.
        // Release the interaction guard immediately so the vehicle sensor
        // state changes produced by the service call can patch the card even
        // while the SELECT itself keeps focus.
        this._controlInteraction = false;
        const option = ev.target.value;
        try {
          await this._hass.callService("select", "select_option", {
            entity_id: preset,
            option,
          });
        } finally {
          this._flushPendingValues();
        }
      });
    }

    if (fromEl && from) {
      fromEl.addEventListener("change", async (ev) => {
        this._controlInteraction = false;
        const date = ev.target.value;
        try {
          await this._hass.callService("date", "set_value", {
            entity_id: from,
            date,
          });
        } finally {
          this._flushPendingValues();
        }
      });
    }

    if (toEl && to) {
      toEl.addEventListener("change", async (ev) => {
        this._controlInteraction = false;
        const date = ev.target.value;
        try {
          await this._hass.callService("date", "set_value", {
            entity_id: to,
            date,
          });
        } finally {
          this._flushPendingValues();
        }
      });
    }

    this._domBuilt = true;
    this._lastStructureSignature = this._structureSignature();
    this._lastStateSignature = this._stateSignature();
  }

  _esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    }[c]));
  }

  _styles() {
    return `
      :host { display:block; container-type:inline-size; }
      ha-card { overflow:hidden; }
      .wrap { padding:18px; color:var(--primary-text-color); }
      header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:16px; }
      h1 { margin:0; font-size:28px; line-height:1.15; letter-spacing:-0.02em; }
      h2 { margin:0; font-size:21px; line-height:1.2; }
      .muted,.sub,.metric-label { color:var(--secondary-text-color); }
      .muted { margin-top:4px; font-size:15px; }
      .count { background:var(--secondary-background-color); border-radius:18px; padding:7px 12px; font-size:13px; white-space:nowrap; }

      .range { display:grid; grid-template-columns:minmax(150px,0.9fr) minmax(170px,1fr) minmax(170px,1fr); gap:12px; margin-bottom:14px; }
      label { display:flex; flex-direction:column; gap:5px; font-size:12px; color:var(--secondary-text-color); font-weight:700; }
      select,input { box-sizing:border-box; width:100%; min-height:44px; border:1px solid var(--divider-color); border-radius:12px; background:var(--card-background-color); color:var(--primary-text-color); padding:8px 12px; font:inherit; font-size:15px; }

      .comparison { padding:11px 13px; border-radius:12px; background:var(--secondary-background-color); margin-bottom:14px; font-size:14px; }
      .comparison.hidden { display:none; }
      .vehicles { display:grid; gap:14px; }
      .vehicles.single { grid-template-columns:1fr; }
      .vehicles:not(.single) { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .vehicle { border:1px solid var(--divider-color); border-radius:16px; padding:14px; min-width:0; background:var(--card-background-color); }
      .vehicle-head { display:flex; align-items:center; gap:12px; margin-bottom:12px; min-width:0; }
      .vehicle-head > div:last-child { min-width:0; }
      .car-dot { width:42px; height:42px; border-radius:50%; display:grid; place-items:center; color:white; flex:0 0 auto; }
      .car-dot ha-icon { --mdc-icon-size:23px; }
      .sub { margin-top:4px; font-size:14px; line-height:1.4; }
      .location-row { display:flex; align-items:center; gap:7px; margin:-3px 0 10px 54px; min-width:0; color:var(--secondary-text-color); font-size:12px; }
      .location-row.hidden { display:none; }
      .location-row > ha-icon { --mdc-icon-size:17px; color:var(--primary-color); flex:0 0 auto; }
      .location-copy { display:flex; flex-direction:column; min-width:0; flex:1; }
      .location-text { min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; color:var(--primary-text-color); }
      .location-age { margin-top:2px; color:var(--secondary-text-color); font-size:10px; }
      .maps-btn { margin-left:auto; flex:0 0 auto; display:inline-flex; align-items:center; gap:4px; min-height:30px; padding:0 9px; border:1px solid var(--divider-color); border-radius:9px; color:var(--primary-text-color); background:var(--secondary-background-color); text-decoration:none; font-weight:700; }
      .maps-btn ha-icon { --mdc-icon-size:16px; color:var(--primary-color); }
      .maps-btn.hidden { display:none; }

      .metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:9px; }
      .metric { display:flex; align-items:center; gap:10px; padding:11px 12px; background:var(--secondary-background-color); border-radius:12px; min-width:0; }
      .metric-icon { width:32px; height:32px; border-radius:50%; display:grid; place-items:center; flex:0 0 auto; background:var(--card-background-color); }
      .metric-icon ha-icon { --mdc-icon-size:19px; color:var(--primary-color); }
      .metric-text { min-width:0; }
      .metric-value { font-size:17px; line-height:1.2; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .metric-value > span:last-child { font-size:12px; font-weight:500; color:var(--secondary-text-color); }
      .metric-label { font-size:11px; margin-top:2px; }

      .periods { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; margin-top:9px; }
      .period { padding:11px 12px; background:var(--secondary-background-color); border-radius:12px; font-size:13px; line-height:1.5; min-width:0; }
      .period-title { font-size:14px; font-weight:700; margin-bottom:3px; }

      .selected-period { display:grid; grid-template-columns:minmax(145px,1.35fr) repeat(3,minmax(95px,1fr)); gap:10px; align-items:center; margin-top:9px; padding:11px 12px; border:1px dashed var(--divider-color); border-radius:12px; font-size:13px; }
      .selected-period strong { font-size:14px; }
      .coverage-warning { grid-column:1 / -1; display:flex; align-items:flex-start; gap:7px; margin-top:2px; padding:8px 10px; border-radius:9px; background:color-mix(in srgb, var(--warning-color, #f9a825) 14%, transparent); color:var(--primary-text-color); line-height:1.35; }
      .coverage-warning ha-icon { --mdc-icon-size:18px; color:var(--warning-color, #f9a825); flex:0 0 auto; margin-top:1px; }
      .coverage-warning.hidden { display:none; }

      .clickable { cursor:pointer; transition:background-color .15s ease, transform .15s ease; }
      .clickable:hover { background-color:color-mix(in srgb, var(--secondary-background-color) 88%, var(--primary-color) 12%); }
      .loading,.empty { padding:24px; text-align:center; color:var(--secondary-text-color); }

      @container (max-width: 760px) {
        .wrap { padding:14px; }
        header { align-items:center; }
        h1 { font-size:24px; }
        .range { grid-template-columns:1fr; }
        .selected-period { grid-template-columns:1fr 1fr; }
      }

      /* Two vehicles stay side-by-side down to tablet/card widths. The card
         only stacks on genuinely narrow phone-sized containers. */
      @container (max-width: 460px) {
        .vehicles:not(.single) { grid-template-columns:1fr; }
      }

      @container (max-width: 500px) {
        .wrap { padding:12px; }
        header { gap:10px; }
        h1 { font-size:22px; }
        .muted { font-size:14px; }
        .count { padding:6px 9px; }
        .vehicle { padding:12px; }
        h2 { font-size:19px; }
        .metrics { grid-template-columns:1fr; }
        .periods { grid-template-columns:1fr 1fr; }
        .selected-period { grid-template-columns:1fr; }
      }
    `;
  }
}

if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, CardataAnalyticsCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: "Cardata Analytics",
    description: "Automatische Analysekarte für alle Fahrzeuge der Cardata Analytics Integration.",
    preview: true,
  });
}

const MAP_CARD_TAG = "cardata-analytics-map-card";

class CardataAnalyticsMapCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = {};
    this._registryLoaded = false;
    this._loadingRegistry = false;
    this._entities = [];
    this._devices = [];
    this._subscriptionsStarted = false;
    this._unsubEntityRegistry = null;
    this._unsubDeviceRegistry = null;
    this._registryReloadTimer = null;
    this._domBuilt = false;
    this._lastStructureSignature = null;
    this._lastStateSignature = null;

    this._tileSize = 256;
    this._zoom = 13;
    this._center = { lat: 51.0, lon: 10.0 };
    this._mode = "osm";
    this._lastFreeMode = "osm";
    this._selectedVehicleId = null;
    this._hiddenVehicles = new Set();
    this._drag = null;
    this._resizeObserver = null;
    this._pseudoFullscreen = false;
    this._mapInitialized = false;
    // Keep currently visible tile DOM nodes by world tile coordinate. This avoids
    // re-requesting the complete viewport whenever GPS follow or panning crosses
    // a single tile boundary. A provider/zoom change still starts a fresh set.
    this._tileElements = new Map();
    this._tileGenerationKey = null;
    this._vectorMap = null;
    this._vectorMapInitPromise = null;
    this._vectorMapError = "";
    this._maplibreLib = null;
    this._mapStyleId = null;
    this._mapStyleReady = false;
    this._mapPoiHandlers = null;
    this._vehicleMapMarkers = new Map();
    // Programmatic camera moves (Follow / vehicle focus) must not be confused
    // with manual user panning. Keep a short guard window while MapLibre animates.
    this._programmaticCameraUntil = 0;
    this._storageKey = "cardata_analytics_map_card_v1";

    // POIs are opt-in. Queries are debounced, rate-limited and cached locally
    // so public Overpass infrastructure is never polled continuously.
    this._poiCategories = new Set();
    this._poiRadiusKm = 5;
    this._poiSearchText = "";
    this._poiOperatorText = "";
    this._poiMinPowerKw = 0;
    this._poiConnector = "any";
    this._poiIncludeUnknownPower = true;
    this._poiActiveTemplate = "";
    // Custom POI templates are global from 0.1.39 and live in Home Assistant's
    // backend Store. Browser-local templates from older versions are migrated
    // once after the backend list is available.
    this._poiGlobalTemplates = {};
    this._poiTemplatesLoaded = false;
    this._poiTemplatesLoading = false;
    this._poiOpenGroups = new Set();
    this._poiRawResults = [];
    this._poiResults = [];
    this._poiSourceVehicleId = null;
    this._poiSourceLat = null;
    this._poiSourceLon = null;
    this._poiLoading = false;
    this._poiError = "";
    this._poiFetchTimer = null;
    this._poiLastNetworkAt = 0;
    this._poiBackoffUntil = 0;
    // Robust POI request state machine. A running request is never invalidated
    // merely because Home Assistant publishes another state update. Instead the
    // newest desired query is remembered and, if necessary, executed exactly once
    // after the active request finishes. This prevents endless stale-request loops.
    this._poiLifecycleEpoch = 0;
    this._poiRequestSeq = 0;
    this._poiActiveRequestId = 0;
    this._poiActiveRequestKey = "";
    this._poiDesiredRequestKey = "";
    this._poiPendingRequestKey = "";
    this._poiPendingForce = false;
    this._poiScheduledForce = false;
    this._poiRequestInFlight = false;
    this._poiRetryKey = "";
    this._poiRetryCount = 0;
    this._poiMaxAutoRetries = 2;
    this._poiLastSuccessAt = 0;
    this._poiLastDurationMs = null;
    this._selectedPoiId = null;
    this._poiCacheTtlMs = 15 * 60 * 1000;
    this._poiMaxResults = 500;
    this._poiRequestTimeoutMs = 35000;
    this._poiLastEndpoint = "";
    this._poiLastSources = [];
    this._poiLastWarnings = [];
    this.attachShadow({ mode: "open" });
  }

  static getStubConfig() {
    return { title: "Cardata Vehicle Map" };
  }

  getGridOptions() {
    return { columns: "full", min_columns: 6 };
  }

  getCardSize() {
    return 8;
  }

  setConfig(config) {
    this._config = config || {};
    if (config?.storage_key) this._storageKey = String(config.storage_key);
    if (Number.isFinite(Number(config?.poi_cache_minutes))) {
      this._poiCacheTtlMs = Math.max(5, Math.min(120, Number(config.poi_cache_minutes))) * 60 * 1000;
    }
    if (Number.isFinite(Number(config?.poi_max_results))) {
      this._poiMaxResults = Math.max(50, Math.min(1000, Math.round(Number(config.poi_max_results))));
    }
    if (Number.isFinite(Number(config?.poi_request_timeout_seconds))) {
      this._poiRequestTimeoutMs = Math.max(15, Math.min(90, Number(config.poi_request_timeout_seconds))) * 1000;
    }
    this._restorePreferences();
  }

  connectedCallback() {
    this._restorePreferences();
    this._ensureRegistrySubscriptions();
    queueMicrotask(() => this._restorePseudoFullscreen());
  }

  disconnectedCallback() {
    this._stopRegistrySubscriptions();
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._eventController) {
      this._eventController.abort();
      this._eventController = null;
    }
    if (this._poiFetchTimer) {
      clearTimeout(this._poiFetchTimer);
      this._poiFetchTimer = null;
    }
    this._destroyVectorBasemap();
    this._resetPoiRequestState(true);
  }

  set hass(hass) {
    this._hass = hass;
    this._ensureRegistrySubscriptions();
    this._loadGlobalPoiTemplates();
    if (!this._registryLoaded && !this._loadingRegistry) {
      this._loadRegistry();
      return;
    }
    if (!this._registryLoaded) return;

    const structure = this._structureSignature();
    if (!this._domBuilt || structure !== this._lastStructureSignature) {
      this._renderFull();
      return;
    }

    const state = this._stateSignature();
    if (state === this._lastStateSignature) return;
    this._updateFromHass();
    this._lastStateSignature = state;
  }

  async _ensureRegistrySubscriptions() {
    if (!this.isConnected || !this._hass?.connection || this._subscriptionsStarted) return;
    this._subscriptionsStarted = true;
    try {
      this._unsubEntityRegistry = await this._hass.connection.subscribeEvents(
        () => this._scheduleRegistryReload(),
        "entity_registry_updated"
      );
      this._unsubDeviceRegistry = await this._hass.connection.subscribeEvents(
        () => this._scheduleRegistryReload(),
        "device_registry_updated"
      );
    } catch (err) {
      this._subscriptionsStarted = false;
      console.warn("Cardata Analytics Map: registry subscription unavailable", err);
    }
  }

  _stopRegistrySubscriptions() {
    for (const unsub of [this._unsubEntityRegistry, this._unsubDeviceRegistry]) {
      try { if (typeof unsub === "function") unsub(); } catch (_) { /* no-op */ }
    }
    this._unsubEntityRegistry = null;
    this._unsubDeviceRegistry = null;
    this._subscriptionsStarted = false;
    if (this._registryReloadTimer) clearTimeout(this._registryReloadTimer);
    this._registryReloadTimer = null;
  }

  _scheduleRegistryReload() {
    if (this._registryReloadTimer) clearTimeout(this._registryReloadTimer);
    this._registryReloadTimer = setTimeout(() => {
      this._registryReloadTimer = null;
      this._loadRegistry();
    }, 150);
  }

  async _loadRegistry() {
    if (!this._hass || this._loadingRegistry) return;
    this._loadingRegistry = true;
    try {
      const [entities, devices] = await Promise.all([
        this._hass.callWS({ type: "config/entity_registry/list" }),
        this._hass.callWS({ type: "config/device_registry/list" }),
      ]);
      this._entities = (entities || []).filter((e) => e.platform === DOMAIN && !e.disabled_by);
      this._devices = devices || [];
      this._registryLoaded = true;
      this._lastStructureSignature = null;
      this._lastStateSignature = null;
    } catch (err) {
      console.error("Cardata Analytics Map: registry could not be loaded", err);
    } finally {
      this._loadingRegistry = false;
      this._renderFull();
    }
  }

  _deviceName(deviceId) {
    const dev = this._devices.find((d) => d.id === deviceId);
    return dev?.name_by_user || dev?.name || "Vehicle";
  }

  _keyFromUniqueId(uid) {
    const suffixMap = [
      ["current_address", "current_address"],
      ["latitude", "latitude"],
      ["longitude", "longitude"],
      ["mileage", "mileage"],
      ["range", "range"],
      ["soc", "soc"],
      ["soh", "soh"],
    ];
    for (const [suffix, key] of suffixMap) {
      if (uid.endsWith(`_${suffix}`)) return key;
    }
    return null;
  }

  _vehicleGroups() {
    const groups = new Map();
    for (const ent of this._entities) {
      if (!ent.device_id || (ent.unique_id || "").startsWith("global_")) continue;
      if (!groups.has(ent.device_id)) {
        groups.set(ent.device_id, {
          deviceId: ent.device_id,
          name: this._deviceName(ent.device_id),
          entities: {},
        });
      }
      const key = this._keyFromUniqueId(ent.unique_id || "");
      if (key) groups.get(ent.device_id).entities[key] = ent.entity_id;
    }
    return [...groups.values()]
      .filter((v) => v.entities.latitude && v.entities.longitude)
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  _structureSignature() {
    return JSON.stringify(this._vehicleGroups().map((v) => [
      v.deviceId,
      v.name,
      Object.entries(v.entities).sort(([a], [b]) => a.localeCompare(b)),
    ]));
  }

  _stateSignature() {
    if (!this._hass) return null;
    const parts = [];
    for (const v of this._vehicleGroups()) {
      for (const key of ["latitude", "longitude", "soc", "range", "mileage", "current_address"]) {
        const id = v.entities[key];
        if (!id) continue;
        const stateObj = this._hass.states[id];
        parts.push(`${id}=${stateObj?.state ?? "<missing>"}`);
        if (key === "current_address" && stateObj) {
          parts.push(`${id}:url=${stateObj.attributes?.google_maps_url || ""}`);
          parts.push(`${id}:geo=${stateObj.attributes?.last_geocoded || ""}`);
        }
      }
    }
    return parts.join(";");
  }

  _number(entityId) {
    if (!entityId || !this._hass) return null;
    const obj = this._hass.states[entityId];
    if (!obj || ["unknown", "unavailable", "none", ""].includes(obj.state)) return null;
    const n = Number(obj.state);
    return Number.isFinite(n) ? n : null;
  }

  _text(entityId) {
    if (!entityId || !this._hass) return null;
    const obj = this._hass.states[entityId];
    if (!obj || ["unknown", "unavailable", "none", ""].includes(obj.state)) return null;
    return String(obj.state);
  }

  _vehicleData(v) {
    const e = v.entities;
    const lat = this._number(e.latitude);
    const lon = this._number(e.longitude);
    const addressObj = e.current_address ? this._hass?.states?.[e.current_address] : null;
    const address = this._text(e.current_address);
    const googleMapsUrl = addressObj?.attributes?.google_maps_url
      || (lat != null && lon != null
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`
        : null);
    const lastChanged = [
      this._hass?.states?.[e.latitude]?.last_updated || this._hass?.states?.[e.latitude]?.last_changed,
      this._hass?.states?.[e.longitude]?.last_updated || this._hass?.states?.[e.longitude]?.last_changed,
    ].filter(Boolean).sort().at(-1) || null;
    return {
      ...v,
      lat,
      lon,
      valid: lat != null && lon != null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180,
      soc: this._number(e.soc),
      range: this._number(e.range),
      mileage: this._number(e.mileage),
      address,
      googleMapsUrl,
      lastChanged,
    };
  }

  _vehicles() {
    return this._vehicleGroups().map((v) => this._vehicleData(v));
  }

  _visibleVehicles() {
    return this._vehicles().filter((v) => v.valid && !this._hiddenVehicles.has(v.deviceId));
  }

  _esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    }[c]));
  }

  _formatNumber(value, decimals = 1) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    return Number(value).toLocaleString("de-DE", { maximumFractionDigits: decimals });
  }

  _formatAge(iso) {
    if (!iso) return "—";
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "—";
    const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (sec < 60) return "gerade eben";
    const min = Math.round(sec / 60);
    if (min < 60) return `vor ${min} Min.`;
    const hrs = Math.round(min / 60);
    if (hrs < 24) return `vor ${hrs} Std.`;
    const days = Math.round(hrs / 24);
    return `vor ${days} Tag${days === 1 ? "" : "en"}`;
  }

  _poiDefinitions() {
    return {
      charging: { label: "Ladestationen", icon: "mdi:ev-station", group: "auto", clauses: ['["amenity"="charging_station"]'] },
      fuel: { label: "Tankstellen", icon: "mdi:gas-station", group: "auto", clauses: ['["amenity"="fuel"]'] },
      workshop: { label: "Werkstätten", icon: "mdi:wrench", group: "auto", clauses: ['["shop"="car_repair"]', '["craft"="car_repair"]'] },
      car_wash: { label: "Autowäsche", icon: "mdi:car-wash", group: "auto", clauses: ['["amenity"="car_wash"]'] },
      tyres: { label: "Reifenservice", icon: "mdi:tire", group: "auto", clauses: ['["shop"="tyres"]'] },
      car_parts: { label: "Autoteile", icon: "mdi:car-cog", group: "auto", clauses: ['["shop"="car_parts"]'] },
      car_rental: { label: "Mietwagen", icon: "mdi:car-key", group: "auto", clauses: ['["amenity"="car_rental"]'] },
      parking: { label: "Parkplätze", icon: "mdi:parking", group: "auto", clauses: ['["amenity"="parking"]'] },
      parking_garage: { label: "Parkhäuser", icon: "mdi:garage", group: "auto", clauses: ['["amenity"="parking"]["parking"~"^(multi-storey|underground)$"]'] },
      park_ride: { label: "P+R", icon: "mdi:car-multiple", group: "auto", clauses: ['["amenity"="parking"]["park_ride"~"^(yes|designated)$"]'] },

      restaurant: { label: "Restaurants & Fast Food", icon: "mdi:silverware-fork-knife", group: "food", clauses: ['["amenity"="restaurant"]', '["amenity"="fast_food"]', '["amenity"="food_court"]'] },
      cafe: { label: "Cafés", icon: "mdi:coffee", group: "food", clauses: ['["amenity"="cafe"]'] },
      bakery: { label: "Bäckereien", icon: "mdi:baguette", group: "food", clauses: ['["shop"="bakery"]'] },
      ice_cream: { label: "Eisdielen", icon: "mdi:ice-cream", group: "food", clauses: ['["amenity"="ice_cream"]', '["shop"="ice_cream"]'] },
      bar_pub: { label: "Bars & Pubs", icon: "mdi:glass-mug-variant", group: "food", clauses: ['["amenity"="bar"]', '["amenity"="pub"]'] },
      biergarten: { label: "Biergärten", icon: "mdi:beer", group: "food", clauses: ['["amenity"="biergarten"]'] },

      supermarket: { label: "Supermärkte", icon: "mdi:cart-outline", group: "shopping", clauses: ['["shop"="supermarket"]'] },
      convenience: { label: "Minimärkte", icon: "mdi:store", group: "shopping", clauses: ['["shop"="convenience"]'] },
      mall: { label: "Einkaufszentren", icon: "mdi:shopping", group: "shopping", clauses: ['["shop"="mall"]'] },
      chemist: { label: "Drogerien", icon: "mdi:bottle-tonic-plus-outline", group: "shopping", clauses: ['["shop"="chemist"]'] },
      beverages: { label: "Getränkemärkte", icon: "mdi:bottle-soda", group: "shopping", clauses: ['["shop"="beverages"]'] },

      pharmacy: { label: "Apotheken", icon: "mdi:pharmacy", group: "health", clauses: ['["amenity"="pharmacy"]', '["healthcare"="pharmacy"]'] },
      hospital: { label: "Krankenhäuser", icon: "mdi:hospital-building", group: "health", clauses: ['["amenity"="hospital"]', '["healthcare"="hospital"]'] },
      doctors: { label: "Ärzte", icon: "mdi:doctor", group: "health", clauses: ['["amenity"="doctors"]', '["healthcare"="doctor"]'] },
      dentist: { label: "Zahnärzte", icon: "mdi:tooth-outline", group: "health", clauses: ['["amenity"="dentist"]', '["healthcare"="dentist"]'] },
      clinic: { label: "Kliniken", icon: "mdi:medical-bag", group: "health", clauses: ['["amenity"="clinic"]', '["healthcare"="clinic"]'] },
      veterinarian: { label: "Tierärzte", icon: "mdi:paw", group: "health", clauses: ['["amenity"="veterinary"]'] },

      hotel: { label: "Hotels", icon: "mdi:bed", group: "travel", clauses: ['["tourism"="hotel"]'] },
      motel: { label: "Motels", icon: "mdi:bed-king-outline", group: "travel", clauses: ['["tourism"="motel"]'] },
      hostel: { label: "Hostels", icon: "mdi:bunk-bed-outline", group: "travel", clauses: ['["tourism"="hostel"]'] },
      camping: { label: "Campingplätze", icon: "mdi:tent", group: "travel", clauses: ['["tourism"="camp_site"]'] },
      caravan_site: { label: "Wohnmobilstellplätze", icon: "mdi:rv-truck", group: "travel", clauses: ['["tourism"="caravan_site"]'] },

      toilets: { label: "Toiletten", icon: "mdi:human-male-female", group: "road", clauses: ['["amenity"="toilets"]'] },
      drinking_water: { label: "Trinkwasser", icon: "mdi:water", group: "road", clauses: ['["amenity"="drinking_water"]'] },
      rest_area: { label: "Rast- & Serviceplätze", icon: "mdi:highway", group: "road", clauses: ['["highway"="rest_area"]', '["highway"="services"]'] },
      picnic_site: { label: "Picknickplätze", icon: "mdi:table-picnic", group: "road", clauses: ['["tourism"="picnic_site"]'] },
      shower: { label: "Duschen", icon: "mdi:shower", group: "road", clauses: ['["amenity"="shower"]'] },

      atm: { label: "Geldautomaten", icon: "mdi:cash", group: "service", clauses: ['["amenity"="atm"]'] },
      bank: { label: "Banken", icon: "mdi:bank", group: "service", clauses: ['["amenity"="bank"]'] },
      post_office: { label: "Postfilialen", icon: "mdi:email-outline", group: "service", clauses: ['["amenity"="post_office"]'] },
      parcel_locker: { label: "Paketstationen", icon: "mdi:package-variant-closed", group: "service", clauses: ['["amenity"="parcel_locker"]'] },

      railway_station: { label: "Bahnhöfe", icon: "mdi:train", group: "transit", clauses: ['["railway"="station"]'] },
      bus_station: { label: "Busbahnhöfe", icon: "mdi:bus", group: "transit", clauses: ['["amenity"="bus_station"]'] },
      airport: { label: "Flughäfen", icon: "mdi:airplane", group: "transit", clauses: ['["aeroway"="aerodrome"]'] },
      ferry_terminal: { label: "Fährterminals", icon: "mdi:ferry", group: "transit", clauses: ['["amenity"="ferry_terminal"]'] },
      taxi: { label: "Taxistände", icon: "mdi:taxi", group: "transit", clauses: ['["amenity"="taxi"]'] },

      museum: { label: "Museen", icon: "mdi:bank-outline", group: "leisure", clauses: ['["tourism"="museum"]'] },
      attraction: { label: "Sehenswürdigkeiten", icon: "mdi:camera-marker-outline", group: "leisure", clauses: ['["tourism"="attraction"]'] },
      viewpoint: { label: "Aussichtspunkte", icon: "mdi:binoculars", group: "leisure", clauses: ['["tourism"="viewpoint"]'] },
      castle: { label: "Burgen & Schlösser", icon: "mdi:castle", group: "leisure", clauses: ['["historic"="castle"]'] },
      monument: { label: "Denkmäler", icon: "mdi:obelisk", group: "leisure", clauses: ['["historic"="monument"]', '["historic"="memorial"]'] },
      zoo: { label: "Zoos", icon: "mdi:elephant", group: "leisure", clauses: ['["tourism"="zoo"]'] },
      theme_park: { label: "Freizeitparks", icon: "mdi:ferris-wheel", group: "leisure", clauses: ['["tourism"="theme_park"]'] },
      swimming_pool: { label: "Schwimmbäder", icon: "mdi:pool", group: "leisure", clauses: ['["leisure"="swimming_pool"]'] },

      police: { label: "Polizei", icon: "mdi:police-badge-outline", group: "emergency", clauses: ['["amenity"="police"]'] },
      fire_station: { label: "Feuerwehr", icon: "mdi:fire-truck", group: "emergency", clauses: ['["amenity"="fire_station"]'] },
      ambulance_station: { label: "Rettungswachen", icon: "mdi:ambulance", group: "emergency", clauses: ['["emergency"="ambulance_station"]'] },
    };
  }

  _poiCategoryGroups() {
    return [
      { key: "auto", label: "Auto & Mobilität" },
      { key: "food", label: "Essen & Trinken" },
      { key: "shopping", label: "Einkaufen" },
      { key: "health", label: "Gesundheit" },
      { key: "travel", label: "Reise & Aufenthalt" },
      { key: "road", label: "Unterwegs" },
      { key: "service", label: "Finanzen & Service" },
      { key: "transit", label: "ÖPNV & Verkehr" },
      { key: "leisure", label: "Freizeit & Sehenswürdigkeiten" },
      { key: "emergency", label: "Notfall" },
    ];
  }

  _poiCategoryForTags(tags = {}) {
    if (tags.amenity === "charging_station") return "charging";
    if (tags.amenity === "fuel") return "fuel";
    if (tags.shop === "car_repair" || tags.craft === "car_repair") return "workshop";
    if (tags.amenity === "car_wash") return "car_wash";
    if (tags.shop === "tyres") return "tyres";
    if (tags.shop === "car_parts") return "car_parts";
    if (tags.amenity === "car_rental") return "car_rental";
    if (tags.amenity === "parking" && ["yes", "designated"].includes(tags.park_ride)) return "park_ride";
    if (tags.amenity === "parking" && ["multi-storey", "underground"].includes(tags.parking)) return "parking_garage";
    if (tags.amenity === "parking") return "parking";

    if (["restaurant", "fast_food", "food_court"].includes(tags.amenity)) return "restaurant";
    if (tags.amenity === "cafe") return "cafe";
    if (tags.shop === "bakery") return "bakery";
    if (tags.amenity === "ice_cream" || tags.shop === "ice_cream") return "ice_cream";
    if (["bar", "pub"].includes(tags.amenity)) return "bar_pub";
    if (tags.amenity === "biergarten") return "biergarten";

    if (tags.shop === "supermarket") return "supermarket";
    if (tags.shop === "convenience") return "convenience";
    if (tags.shop === "mall") return "mall";
    if (tags.shop === "chemist") return "chemist";
    if (tags.shop === "beverages") return "beverages";

    if (tags.amenity === "pharmacy" || tags.healthcare === "pharmacy") return "pharmacy";
    if (tags.amenity === "hospital" || tags.healthcare === "hospital") return "hospital";
    if (tags.amenity === "doctors" || tags.healthcare === "doctor") return "doctors";
    if (tags.amenity === "dentist" || tags.healthcare === "dentist") return "dentist";
    if (tags.amenity === "clinic" || tags.healthcare === "clinic") return "clinic";
    if (tags.amenity === "veterinary") return "veterinarian";

    if (tags.tourism === "hotel") return "hotel";
    if (tags.tourism === "motel") return "motel";
    if (tags.tourism === "hostel") return "hostel";
    if (tags.tourism === "camp_site") return "camping";
    if (tags.tourism === "caravan_site") return "caravan_site";

    if (tags.amenity === "toilets") return "toilets";
    if (tags.amenity === "drinking_water") return "drinking_water";
    if (["rest_area", "services"].includes(tags.highway)) return "rest_area";
    if (tags.tourism === "picnic_site") return "picnic_site";
    if (tags.amenity === "shower") return "shower";

    if (tags.amenity === "atm") return "atm";
    if (tags.amenity === "bank") return "bank";
    if (tags.amenity === "post_office") return "post_office";
    if (tags.amenity === "parcel_locker") return "parcel_locker";

    if (tags.railway === "station") return "railway_station";
    if (tags.amenity === "bus_station") return "bus_station";
    if (tags.aeroway === "aerodrome") return "airport";
    if (tags.amenity === "ferry_terminal") return "ferry_terminal";
    if (tags.amenity === "taxi") return "taxi";

    if (tags.tourism === "museum") return "museum";
    if (tags.tourism === "attraction") return "attraction";
    if (tags.tourism === "viewpoint") return "viewpoint";
    if (tags.historic === "castle") return "castle";
    if (["monument", "memorial"].includes(tags.historic)) return "monument";
    if (tags.tourism === "zoo") return "zoo";
    if (tags.tourism === "theme_park") return "theme_park";
    if (tags.leisure === "swimming_pool") return "swimming_pool";

    if (tags.amenity === "police") return "police";
    if (tags.amenity === "fire_station") return "fire_station";
    if (tags.emergency === "ambulance_station") return "ambulance_station";
    return null;
  }

  _poiCoordinates(element) {
    const lat = Number(element?.lat ?? element?.center?.lat);
    const lon = Number(element?.lon ?? element?.center?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
  }

  _poiName(tags = {}, category = "") {
    const defs = this._poiDefinitions();
    return String(tags.name || tags.brand || tags.operator || defs[category]?.label || "Point of Interest");
  }

  _poiAddress(tags = {}) {
    const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ").trim();
    const city = [tags["addr:postcode"], tags["addr:city"] || tags["addr:place"]].filter(Boolean).join(" ").trim();
    const parts = [street, city].filter(Boolean);
    return parts.join(", ") || String(tags["addr:full"] || "").trim() || null;
  }

  _poiSourceLabel(element = {}) {
    const rawSources = String(element.sources || element.provider || "osm")
      .split(",").map((item) => item.trim()).filter(Boolean);
    const labels = rawSources.map((source) => {
      if (source === "ocm") {
        const provider = String(element?.tags?.["cardata:data_provider"] || "").trim();
        return provider && provider.toLowerCase() !== "open charge map"
          ? `Open Charge Map · ${provider}`
          : "Open Charge Map";
      }
      if (source === "bnetza") return "Bundesnetzagentur";
      if (source === "afir") return "AFIR · Mobilithek";
      if (source === "osm") return "OpenStreetMap";
      if (source === "merged") return "Mehrere Quellen";
      return source;
    });
    return [...new Set(labels)].join(" + ") || "OpenStreetMap";
  }

  _safeWebUrl(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    const raw = value.trim();
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch (_) {
      return null;
    }
  }

  _poiConnectorDetails(tags = {}) {
    const labels = {
      "socket:type2": "Type 2",
      "socket:type2_combo": "CCS Type 2",
      "socket:ccs": "CCS",
      "socket:chademo": "CHAdeMO",
      "socket:tesla_supercharger": "Tesla Supercharger",
      "socket:tesla_destination": "Tesla Destination",
      "socket:type1": "Type 1",
      "socket:type1_combo": "CCS Type 1",
    };
    const details = [];
    for (const [key, value] of Object.entries(tags)) {
      if (!key.startsWith("socket:") || key.endsWith(":output") || key.endsWith(":voltage") || key.endsWith(":current")) continue;
      const normalized = String(value || "").trim();
      if (!normalized || ["no", "0"].includes(normalized.toLowerCase())) continue;
      const label = labels[key] || key.slice(7).replaceAll("_", " ");
      const output = tags[`${key}:output`];
      details.push(`${label}: ${normalized}${output ? ` · ${output}` : ""}`);
    }
    return details.slice(0, 8);
  }

  _poiConnectorKeys(tags = {}) {
    const keys = new Set();
    const truthy = (value) => {
      const v = String(value ?? "").trim().toLowerCase();
      return Boolean(v) && !["no", "0", "false", "none"].includes(v);
    };
    if (truthy(tags["socket:ccs"]) || truthy(tags["socket:type2_combo"]) || tags["socket:ccs:output"] || tags["socket:type2_combo:output"]) keys.add("ccs");
    if (truthy(tags["socket:type2"]) || tags["socket:type2:output"]) keys.add("type2");
    if (truthy(tags["socket:chademo"]) || tags["socket:chademo:output"]) keys.add("chademo");
    if (truthy(tags["socket:tesla_supercharger"]) || truthy(tags["socket:tesla_destination"]) || tags["socket:tesla_supercharger:output"] || tags["socket:tesla_destination:output"]) keys.add("tesla");
    return [...keys];
  }

  _parsePowerKw(value) {
    if (value == null) return null;
    const text = String(value).replace(/,/g, ".");
    const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(MW|kW|W)?/gi)];
    let best = null;
    for (const match of matches) {
      let number = Number(match[1]);
      if (!Number.isFinite(number)) continue;
      const unit = String(match[2] || "kW").toLowerCase();
      if (unit === "mw") number *= 1000;
      else if (unit === "w") number /= 1000;
      if (number > 0 && (best == null || number > best)) best = number;
    }
    return best;
  }

  _poiChargingPowerKw(tags = {}) {
    const values = [];
    for (const [key, value] of Object.entries(tags)) {
      if (key.endsWith(":output") || ["charging_station:output", "max_power", "output"].includes(key)) {
        const parsed = this._parsePowerKw(value);
        if (parsed != null) values.push(parsed);
      }
    }
    return values.length ? Math.max(...values) : null;
  }

  _normalizePoiSearchText(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("de-DE")
      .replace(/&/g, " und ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  _poiFilterHaystack(poi) {
    return this._normalizePoiSearchText([
      poi.name, poi.address, poi.operator, poi.brand, poi.network,
      poi.tags?.cuisine, poi.tags?.description, poi.tags?.["addr:city"],
    ].filter(Boolean).join(" "));
  }

  _poiTextMatches(poi, searchValue) {
    const needle = this._normalizePoiSearchText(searchValue);
    if (!needle) return true;
    const haystack = this._poiFilterHaystack(poi);
    if (haystack.includes(needle)) return true;
    // Ignore punctuation/spacing differences such as McDonald's / McDonalds / Mc Donalds.
    const compactNeedle = needle.replace(/\s+/g, "");
    const compactHaystack = haystack.replace(/\s+/g, "");
    return compactNeedle.length >= 3 && compactHaystack.includes(compactNeedle);
  }

  _clearChargingSpecificFilters(clearSearch = true) {
    if (clearSearch) this._poiSearchText = "";
    this._poiOperatorText = "";
    this._poiConnector = "any";
    this._poiMinPowerKw = 0;
    this._poiIncludeUnknownPower = true;
  }

  _applyPoiClientFilters() {
    const search = this._poiSearchText.trim();
    const operator = this._normalizePoiSearchText(this._poiOperatorText);
    const connector = this._poiConnector;
    const minPower = Number(this._poiMinPowerKw) || 0;
    const includeUnknown = Boolean(this._poiIncludeUnknownPower);
    this._poiResults = (this._poiRawResults || []).filter((poi) => {
      if (!this._poiCategories.has(poi.category)) return false;
      if (search && !this._poiTextMatches(poi, search)) return false;
      if (operator && poi.category === "charging") {
        const operatorHaystack = this._normalizePoiSearchText(
          [poi.operator, poi.brand, poi.network, poi.name].filter(Boolean).join(" ")
        );
        if (!operatorHaystack.includes(operator)) return false;
      }
      if (poi.category === "charging") {
        if (connector !== "any" && !(poi.connectorKeys || []).includes(connector)) return false;
        if (minPower > 0) {
          if (poi.maxPowerKw != null && Number.isFinite(Number(poi.maxPowerKw))) {
            if (Number(poi.maxPowerKw) < minPower) return false;
          } else if (!includeUnknown) {
            return false;
          }
        }
      }
      return true;
    });
    if (this._selectedPoiId && !this._poiResults.some((poi) => poi.id === this._selectedPoiId)) {
      this._selectedPoiId = null;
      this.shadowRoot?.getElementById("poi-popup")?.classList.add("hidden");
    }
  }

  _builtinPoiTemplates() {
    return {
      "builtin:charging": { name: "Alle Ladestationen", categories: ["charging"], radiusKm: 25, search: "", operator: "", minPowerKw: 0, connector: "any", includeUnknownPower: true },
      "builtin:fast100": { name: "Schnellladen ≥100 kW", categories: ["charging"], radiusKm: 50, search: "", operator: "", minPowerKw: 100, connector: "ccs", includeUnknownPower: false },
      "builtin:ionity": { name: "IONITY Schnellladen", categories: ["charging"], radiusKm: 50, search: "", operator: "IONITY", minPowerKw: 100, connector: "ccs", includeUnknownPower: true },
      "builtin:fuel": { name: "Tankstellen", categories: ["fuel"], radiusKm: 25, search: "", operator: "", minPowerKw: 0, connector: "any", includeUnknownPower: true },
      "builtin:break": { name: "Essen & Pause", categories: ["restaurant", "cafe", "toilets"], radiusKm: 10, search: "", operator: "", minPowerKw: 0, connector: "any", includeUnknownPower: true },
      "builtin:parking-charge": { name: "Parken & Laden", categories: ["parking", "charging"], radiusKm: 10, search: "", operator: "", minPowerKw: 0, connector: "any", includeUnknownPower: true },
    };
  }

  _poiTemplateStorageKey() {
    // Legacy browser-local location used only for one-time migration to the
    // integration-wide Home Assistant Store.
    return `${this._storageKey}:poi-templates-v1`;
  }

  _readLocalPoiTemplates() {
    try {
      const raw = localStorage.getItem(this._poiTemplateStorageKey());
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  _readPoiTemplates() {
    return this._poiTemplatesLoaded ? this._poiGlobalTemplates : this._readLocalPoiTemplates();
  }

  _poiTemplateComparable(template = {}) {
    return JSON.stringify({
      categories: [...(template.categories || [])].map(String).sort(),
      radiusKm: Number(template.radiusKm) || 5,
      search: String(template.search || ""),
      operator: String(template.operator || ""),
      minPowerKw: Number(template.minPowerKw) || 0,
      connector: String(template.connector || "any"),
      includeUnknownPower: template.includeUnknownPower !== false,
    });
  }

  async _loadGlobalPoiTemplates(force = false) {
    if (!this._hass?.callWS || this._poiTemplatesLoading || (this._poiTemplatesLoaded && !force)) return;
    this._poiTemplatesLoading = true;
    try {
      const result = await this._hass.callWS({ type: "cardata_analytics/poi_templates/list" });
      const templates = result?.templates;
      this._poiGlobalTemplates = templates && typeof templates === "object" ? templates : {};
      this._poiTemplatesLoaded = true;
      await this._migrateLocalPoiTemplates();
    } catch (err) {
      // Older backend during a rolling frontend update: keep legacy local
      // templates usable and retry after the next HA/browser restart.
      console.warn("[Cardata Analytics] global POI templates unavailable", err);
    } finally {
      this._poiTemplatesLoading = false;
      if (this._domBuilt) this._renderPoiPanel();
    }
  }

  async _migrateLocalPoiTemplates() {
    const localTemplates = this._readLocalPoiTemplates();
    const entries = Object.entries(localTemplates || {});
    if (!entries.length || !this._hass?.callWS || !this._poiTemplatesLoaded) return;

    let allMigrated = true;
    const existingNames = new Set(Object.values(this._poiGlobalTemplates).map((item) => String(item?.name || "").trim().toLocaleLowerCase("de-DE")));
    for (const [legacyKey, legacyTemplate] of entries) {
      if (!legacyTemplate || typeof legacyTemplate !== "object") continue;
      const comparable = this._poiTemplateComparable(legacyTemplate);
      const duplicate = Object.values(this._poiGlobalTemplates).some((item) =>
        this._poiTemplateComparable(item) === comparable
        && String(item?.name || "").trim().toLocaleLowerCase("de-DE") === String(legacyTemplate?.name || "").trim().toLocaleLowerCase("de-DE")
      );
      if (duplicate) continue;

      let key = /^custom:[A-Za-z0-9._:-]{1,90}$/.test(legacyKey) && !this._poiGlobalTemplates[legacyKey]
        ? legacyKey
        : `custom:import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const template = { ...legacyTemplate };
      let name = String(template.name || "Importierte Vorlage").trim().slice(0, 60) || "Importierte Vorlage";
      if (existingNames.has(name.toLocaleLowerCase("de-DE"))) {
        const suffix = " (importiert)";
        name = `${name.slice(0, Math.max(1, 60 - suffix.length))}${suffix}`;
      }
      template.name = name;
      try {
        const result = await this._hass.callWS({ type: "cardata_analytics/poi_templates/save", key, template });
        this._poiGlobalTemplates[key] = result?.template || template;
        existingNames.add(name.toLocaleLowerCase("de-DE"));
      } catch (err) {
        allMigrated = false;
        console.warn("[Cardata Analytics] POI template migration failed", err);
      }
    }
    if (allMigrated) {
      try { localStorage.removeItem(this._poiTemplateStorageKey()); } catch (_) { /* ignore */ }
    }
  }

  async _saveGlobalPoiTemplate(key, template) {
    if (!this._hass?.callWS) throw new Error("Home-Assistant-WebSocket ist nicht verfügbar");
    const result = await this._hass.callWS({ type: "cardata_analytics/poi_templates/save", key, template });
    this._poiGlobalTemplates[key] = result?.template || template;
    this._poiTemplatesLoaded = true;
    return this._poiGlobalTemplates[key];
  }

  async _deleteGlobalPoiTemplate(key) {
    if (!this._hass?.callWS) throw new Error("Home-Assistant-WebSocket ist nicht verfügbar");
    await this._hass.callWS({ type: "cardata_analytics/poi_templates/delete", key });
    delete this._poiGlobalTemplates[key];
  }

  _snapshotPoiFilter(name = "") {
    return {
      name: String(name || "").trim(),
      categories: [...this._poiCategories],
      radiusKm: this._poiRadiusKm,
      search: this._poiSearchText,
      operator: this._poiOperatorText,
      minPowerKw: Number(this._poiMinPowerKw) || 0,
      connector: this._poiConnector,
      includeUnknownPower: Boolean(this._poiIncludeUnknownPower),
    };
  }

  _applyPoiTemplate(key) {
    const builtin = this._builtinPoiTemplates();
    const custom = this._readPoiTemplates();
    const template = builtin[key] || custom[key];
    if (!template) return;
    const valid = new Set(Object.keys(this._poiDefinitions()));
    this._poiCategories = new Set((template.categories || []).map(String).filter((item) => valid.has(item)));
    this._poiRadiusKm = POI_RADIUS_OPTIONS_KM.includes(Number(template.radiusKm)) ? Number(template.radiusKm) : 5;
    this._poiSearchText = String(template.search || "");
    this._poiOperatorText = String(template.operator || "");
    this._poiMinPowerKw = [0, 50, 100, 150, 200, 300, 350].includes(Number(template.minPowerKw)) ? Number(template.minPowerKw) : 0;
    this._poiConnector = ["any", "ccs", "type2", "chademo", "tesla"].includes(template.connector) ? template.connector : "any";
    this._poiIncludeUnknownPower = template.includeUnknownPower !== false;
    this._poiActiveTemplate = key;
    this._savePreferences();
    this._selectedPoiId = null;
    this.shadowRoot?.getElementById("poi-popup")?.classList.add("hidden");
    this._applyPoiClientFilters();
    this._renderPoiPanel();
    this._renderMap(false);
    this._updateControls();
    if (this._poiCategories.size) {
      this._poiLoading = true;
      this._schedulePoiLoad(100, false);
    } else {
      this._poiRawResults = [];
      this._poiResults = [];
      this._renderMap(false);
    }
  }

  _poiStatusText() {
    const count = this._poiResults.length;
    const rawCount = this._poiRawResults.length;
    if (this._poiLoading && this._poiError) return this._poiError;
    if (this._poiLoading) {
      const retry = this._poiRetryCount > 0 ? ` · Wiederholungsversuch ${this._poiRetryCount}/${this._poiMaxAutoRetries}` : "";
      return `POIs werden über Home Assistant geladen … · ${this._poiRadiusKm} km${retry}`;
    }
    if (this._poiError) return this._poiError;
    if (!this._poiCategories.size) return "POI-Suche ist ausgeschaltet.";
    const filtered = count !== rawCount;
    const duration = Number.isFinite(this._poiLastDurationMs) ? ` · ${(this._poiLastDurationMs / 1000).toFixed(1)} s` : "";
    const fallback = Array.isArray(this._poiLastWarnings) && this._poiLastWarnings.length ? " · Fallback aktiv" : "";
    return `${count} Treffer${filtered ? ` von ${rawCount}` : ""}${this._poiLastEndpoint ? ` · ${this._overpassEndpointLabel(this._poiLastEndpoint)}` : ""}${duration}${fallback}`;
  }

  _updatePoiStatusDom() {
    const status = this.shadowRoot?.querySelector("#poi-panel .poi-status");
    if (!status) return;
    status.textContent = this._poiStatusText();
    status.classList.toggle("warning", Boolean(this._poiError));
  }

  _distanceKm(lat1, lon1, lat2, lon2) {
    const rad = (value) => value * Math.PI / 180;
    const earthKm = 6371.0088;
    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  }

  _poiNavigationUrl(poi) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${poi.lat},${poi.lon}`)}&travelmode=driving`;
  }

  _poiSearchUrl(poi) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${poi.lat},${poi.lon}`)}`;
  }

  _poiCacheStorageKey() {
    return `${this._storageKey}:poi-cache-v8`;
  }

  _readPoiCache() {
    try {
      const raw = localStorage.getItem(this._poiCacheStorageKey());
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  _writePoiCache(cache) {
    try {
      const entries = Object.entries(cache || {})
        .filter(([, value]) => value && Number(value.timestamp) > Date.now() - 24 * 60 * 60 * 1000)
        .sort((a, b) => Number(b[1].timestamp) - Number(a[1].timestamp))
        .slice(0, 6);
      localStorage.setItem(this._poiCacheStorageKey(), JSON.stringify(Object.fromEntries(entries)));
    } catch (_) { /* localStorage may be unavailable or full */ }
  }

  _poiCacheKey(vehicle) {
    const categories = [...this._poiCategories].sort().join(",");
    const chargingSelected = this._poiCategories.has("charging");
    return [
      vehicle.lat.toFixed(3), vehicle.lon.toFixed(3), this._poiRadiusKm, categories,
      chargingSelected ? this._poiOperatorText.trim().toLocaleLowerCase("de-DE") : "",
      chargingSelected ? this._poiConnector : "any",
    ].join("|");
  }

  _currentPoiRequestKey() {
    const vehicle = this._selectedVehicle() || this._visibleVehicles()[0] || null;
    if (!vehicle || !this._poiCategories.size) return "";
    return this._poiCacheKey(vehicle);
  }

  _resetPoiRequestState(invalidateActive = false) {
    if (this._poiFetchTimer) {
      clearTimeout(this._poiFetchTimer);
      this._poiFetchTimer = null;
    }
    this._poiDesiredRequestKey = "";
    this._poiPendingRequestKey = "";
    this._poiPendingForce = false;
    this._poiScheduledForce = false;
    this._poiRetryKey = "";
    this._poiRetryCount = 0;
    if (invalidateActive) {
      this._poiLifecycleEpoch += 1;
      this._poiActiveRequestId = 0;
      this._poiActiveRequestKey = "";
      this._poiRequestInFlight = false;
    }
  }

  _schedulePoiLoad(delay = 750, force = false) {
    const key = this._currentPoiRequestKey();
    const previousDesiredKey = this._poiDesiredRequestKey;
    this._poiDesiredRequestKey = key;

    if (!key) {
      this._resetPoiRequestState(false);
      return;
    }

    // Never cancel/poison an active websocket request. If that request already
    // represents the current desired query, it is allowed to finish normally.
    // Otherwise remember only the single newest query for a follow-up request.
    if (this._poiRequestInFlight) {
      if (key === this._poiActiveRequestKey && !force) {
        this._poiPendingRequestKey = "";
        this._poiPendingForce = false;
      } else {
        const samePending = key === this._poiPendingRequestKey;
        this._poiPendingRequestKey = key;
        this._poiPendingForce = samePending ? (this._poiPendingForce || Boolean(force)) : Boolean(force);
      }
      this._poiLoading = true;
      this._updatePoiStatusDom();
      return;
    }

    const sameScheduled = key === previousDesiredKey;
    this._poiScheduledForce = sameScheduled ? (this._poiScheduledForce || Boolean(force)) : Boolean(force);
    if (this._poiFetchTimer) clearTimeout(this._poiFetchTimer);
    this._poiFetchTimer = setTimeout(() => {
      this._poiFetchTimer = null;
      const scheduledKey = this._currentPoiRequestKey();
      const scheduledForce = this._poiScheduledForce;
      this._poiScheduledForce = false;
      this._loadPois(scheduledForce, scheduledKey);
    }, Math.max(0, delay));
  }

  _poiRequestSnapshot(vehicle, force = false) {
    return {
      key: this._poiCacheKey(vehicle),
      epoch: this._poiLifecycleEpoch,
      vehicle: { deviceId: vehicle.deviceId, lat: vehicle.lat, lon: vehicle.lon },
      radiusKm: this._poiRadiusKm,
      categories: [...this._poiCategories].sort(),
      searchFilter: "",
      operatorFilter: this._poiOperatorText.trim(),
      connectorFilter: this._poiConnector,
      minPowerKw: 0,
      includeUnknownPower: true,
      maxResults: this._poiMaxResults,
      timeoutSeconds: Math.round(this._poiRequestTimeoutMs / 1000),
      forceRefresh: Boolean(force),
    };
  }

  _isTransientPoiError(err) {
    const text = String(err?.message || err || "").toLowerCase();
    if (/backend noch nicht aktiv|unknown command|ungültige antwort|invalid|400/.test(text)) return false;
    return /timeout|timed out|busy|belegt|beschäftigt|beschaeftigt|406|429|502|503|504|network|websocket|overpass|temporär|temporar|verfügbar|verfuegbar|connection|connect|reset|dns|proxy|gesamtzeit/.test(text);
  }

  _overpassEndpointLabel(endpoint) {
    try {
      return new URL(endpoint).hostname;
    } catch (_) {
      return endpoint;
    }
  }

  async _fetchOverpass(request) {
    // POIs always go through Home Assistant. The client watchdog is intentionally
    // slightly longer than the backend's total request budget, so a lost websocket
    // reply can never leave the panel spinning forever.
    if (!this._hass?.callWS) {
      throw new Error("Home-Assistant-WebSocket ist nicht verfügbar");
    }

    let timeoutId = null;
    try {
      const call = this._hass.callWS({
        type: "cardata_analytics/poi",
        latitude: request.vehicle.lat,
        longitude: request.vehicle.lon,
        radius_km: request.radiusKm,
        categories: request.categories,
        search_filter: request.searchFilter,
        operator_filter: request.operatorFilter,
        connector_filter: request.connectorFilter,
        min_power_kw: request.minPowerKw,
        include_unknown_power: request.includeUnknownPower,
        max_results: request.maxResults,
        timeout_seconds: request.timeoutSeconds,
        force_refresh: request.forceRefresh,
      });
      const watchdogMs = Math.max(50000, this._poiRequestTimeoutMs + 15000);
      const watchdog = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Frontend-Watchdog: keine Backend-Antwort nach ${Math.round(watchdogMs / 1000)} s`)), watchdogMs);
      });
      const result = await Promise.race([call, watchdog]);
      if (!result || !Array.isArray(result.elements)) {
        throw new Error("ungültige Antwort vom Cardata-Analytics-Backend");
      }
      this._poiLastEndpoint = result.endpoint || "Home Assistant";
      this._poiLastSources = Array.isArray(result.sources) ? result.sources : [];
      this._poiLastWarnings = Array.isArray(result.warnings) ? result.warnings : [];
      return {
        elements: result.elements,
        cached: Boolean(result.cached),
        elapsedMs: Number(result.elapsed_ms),
        sources: this._poiLastSources,
        warnings: this._poiLastWarnings,
        chargingStatus: String(result.charging_status || "unused"),
        retryAfterSeconds: Number(result.retry_after_seconds || 0),
      };
    } catch (err) {
      const message = err?.message || String(err);
      if (/unknown command|unknown_command|not found/i.test(message)) {
        throw new Error("POI-Backend noch nicht aktiv – Home Assistant nach dem Update vollständig neu starten");
      }
      throw new Error(`Home-Assistant-POI-Proxy: ${message}`);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async _loadPois(force = false, scheduledKey = "") {
    const vehicle = this._selectedVehicle() || this._visibleVehicles()[0] || null;
    if (!this._poiCategories.size) {
      this._resetPoiRequestState(true);
      this._poiRawResults = [];
      this._poiResults = [];
      this._poiSourceVehicleId = null;
      this._poiSourceLat = null;
      this._poiSourceLon = null;
      this._poiError = "";
      this._poiLoading = false;
      this._selectedPoiId = null;
      this._renderPoiPanel();
      this._renderMap(false);
      return;
    }
    if (!vehicle) {
      this._poiError = "Für die POI-Suche ist ein sichtbares Fahrzeug mit GPS-Position erforderlich.";
      this._poiLoading = false;
      this._renderPoiPanel();
      return;
    }

    const currentKey = this._poiCacheKey(vehicle);
    this._poiDesiredRequestKey = currentKey;
    if (scheduledKey && scheduledKey !== currentKey) {
      this._schedulePoiLoad(0, force);
      return;
    }

    if (this._poiRequestInFlight) {
      this._schedulePoiLoad(0, force);
      return;
    }

    if (!force) {
      const cache = this._readPoiCache();
      const cached = cache[currentKey];
      if (cached && Date.now() - Number(cached.timestamp) <= this._poiCacheTtlMs
          && Array.isArray(cached.results) && cached.results.length > 0) {
        this._poiRawResults = cached.results;
        this._applyPoiClientFilters();
        this._poiSourceVehicleId = vehicle.deviceId;
        this._poiSourceLat = vehicle.lat;
        this._poiSourceLon = vehicle.lon;
        this._poiError = "";
        this._poiLoading = false;
        this._poiRetryKey = "";
        this._poiRetryCount = 0;
        this._poiLastEndpoint = cached.endpoint || "Browser-Cache";
        this._poiLastSources = Array.isArray(cached.sources) ? cached.sources : [];
        this._poiLastWarnings = Array.isArray(cached.warnings) ? cached.warnings : [];
        this._renderPoiPanel();
        this._renderMap(false);
        return;
      }
    }

    const now = Date.now();
    const earliest = Math.max(this._poiLastNetworkAt + 3000, this._poiBackoffUntil);
    if (now < earliest) {
      this._poiLoading = true;
      const waitSeconds = Math.max(1, Math.ceil((earliest - now) / 1000));
      this._poiError = `POI-Abfrage wird in ${waitSeconds} s fortgesetzt …`;
      this._renderPoiPanel();
      this._schedulePoiLoad(earliest - now + 100, force);
      return;
    }

    const request = this._poiRequestSnapshot(vehicle, force);
    const requestId = ++this._poiRequestSeq;
    this._poiActiveRequestId = requestId;
    this._poiActiveRequestKey = request.key;
    this._poiRequestInFlight = true;
    this._poiLoading = true;
    this._poiError = "";
    this._renderPoiPanel();
    this._poiLastNetworkAt = Date.now();
    const startedAt = performance?.now ? performance.now() : Date.now();
    let retryDelay = 0;

    try {
      const payload = await this._fetchOverpass(request);
      const stillOwned = this._poiActiveRequestId === requestId && this._poiLifecycleEpoch === request.epoch;
      const stillCurrent = stillOwned && this._currentPoiRequestKey() === request.key;
      if (stillCurrent) {
        const seen = new Set();
        const results = [];
        for (const element of payload?.elements || []) {
          const coords = this._poiCoordinates(element);
          if (!coords) continue;
          const tags = element.tags || {};
          const category = this._poiCategoryForTags(tags);
          if (!category || !request.categories.includes(category)) continue;
          const provider = String(element.provider || tags["cardata:provider"] || "osm");
          const elementType = String(element.type || "");
          const isOsmObject = ["node", "way", "relation"].includes(elementType);
          const id = `${provider}:${elementType || "poi"}:${element.id}`;
          if (seen.has(id)) continue;
          seen.add(id);
          results.push({
            id,
            provider,
            sourceLabel: this._poiSourceLabel(element),
            sourceLicense: tags["cardata:data_provider_license"] || null,
            osmType: isOsmObject ? elementType : "",
            osmId: isOsmObject && Number.isFinite(Number(element.id)) ? Number(element.id) : null,
            lat: coords.lat,
            lon: coords.lon,
            category,
            name: this._poiName(tags, category),
            address: this._poiAddress(tags),
            operator: tags.operator || null,
            brand: tags.brand || null,
            network: tags.network || null,
            openingHours: tags.opening_hours || null,
            capacity: tags.capacity || null,
            phone: tags.phone || tags["contact:phone"] || null,
            website: this._safeWebUrl(tags.website || tags["contact:website"] || null),
            access: tags.access || null,
            fee: tags.fee || null,
            connectors: category === "charging" ? this._poiConnectorDetails(tags) : [],
            connectorKeys: category === "charging" ? this._poiConnectorKeys(tags) : [],
            maxPowerKw: category === "charging" ? this._poiChargingPowerKw(tags) : null,
          });
        }
        results.sort((a, b) => this._distanceKm(request.vehicle.lat, request.vehicle.lon, a.lat, a.lon)
          - this._distanceKm(request.vehicle.lat, request.vehicle.lon, b.lat, b.lon));
        this._poiRawResults = results.slice(0, request.maxResults);
        this._applyPoiClientFilters();
        this._poiSourceVehicleId = request.vehicle.deviceId;
        this._poiSourceLat = request.vehicle.lat;
        this._poiSourceLon = request.vehicle.lon;
        this._poiError = results.length >= request.maxResults
          ? `Die Anzeige ist auf ${request.maxResults} POIs begrenzt. Radius oder Filter ggf. verkleinern.`
          : "";
        const cache = this._readPoiCache();
        if (this._poiRawResults.length > 0) {
          cache[request.key] = {
            timestamp: Date.now(),
            results: this._poiRawResults,
            endpoint: this._poiLastEndpoint,
            sources: this._poiLastSources,
            warnings: this._poiLastWarnings,
          };
        } else {
          delete cache[request.key];
        }
        this._writePoiCache(cache);
        this._poiRetryKey = "";
        this._poiRetryCount = 0;
        this._poiLastSuccessAt = Date.now();
        const localElapsed = (performance?.now ? performance.now() : Date.now()) - startedAt;
        this._poiLastDurationMs = Number.isFinite(payload.elapsedMs) ? payload.elapsedMs : localElapsed;

        if (payload.chargingStatus === "unconfigured" && request.categories.includes("charging")) {
          this._poiError = "Open Charge Map ist noch nicht konfiguriert. Bitte Cardata Analytics unter Geräte & Dienste neu konfigurieren und den API-Key hinterlegen.";
        } else if (payload.chargingStatus === "unavailable" && request.categories.includes("charging")) {
          const details = Array.isArray(payload.warnings) && payload.warnings.length ? ` (${payload.warnings.join(" · ")})` : "";
          this._poiError = `Open Charge Map ist momentan nicht erreichbar und es liegt noch kein passender lokaler Cache vor.${details}`;
        }
      }
    } catch (err) {
      const stillOwned = this._poiActiveRequestId === requestId && this._poiLifecycleEpoch === request.epoch;
      const stillCurrent = stillOwned && this._currentPoiRequestKey() === request.key;
      if (stillCurrent) {
        const transient = this._isTransientPoiError(err);
        if (transient) {
          this._poiRetryCount = this._poiRetryKey === request.key ? this._poiRetryCount + 1 : 1;
          this._poiRetryKey = request.key;
        } else {
          this._poiRetryKey = "";
          this._poiRetryCount = 0;
        }
        if (transient && this._poiRetryCount <= this._poiMaxAutoRetries) {
          retryDelay = this._poiRetryCount === 1 ? 2500 : 6000;
          this._poiError = `POI-Dienst vorübergehend nicht erreichbar – neuer Versuch ${this._poiRetryCount}/${this._poiMaxAutoRetries} in ${Math.round(retryDelay / 1000)} s …`;
        } else {
          this._poiError = `POIs konnten nicht geladen werden: ${err?.message || err}`;
        }
      }
    } finally {
      // Only the request that still owns the active slot may clear it. This also
      // makes disconnect/reconnect safe if an old websocket promise resolves later.
      if (this._poiActiveRequestId === requestId) {
        this._poiActiveRequestId = 0;
        this._poiActiveRequestKey = "";
        this._poiRequestInFlight = false;
      }

      const pendingKey = this._poiPendingRequestKey;
      const pendingForce = this._poiPendingForce;
      this._poiPendingRequestKey = "";
      this._poiPendingForce = false;
      const newestKey = this._currentPoiRequestKey();
      const needsNewest = newestKey && newestKey !== request.key;
      const shouldRetry = retryDelay > 0 && newestKey === request.key;

      if (pendingKey || needsNewest || shouldRetry) {
        this._poiLoading = true;
        const nextForce = pendingKey ? pendingForce : false;
        const delay = shouldRetry ? retryDelay : 100;
        this._renderPoiPanel();
        this._renderMap(false);
        this._schedulePoiLoad(delay, nextForce);
      } else {
        this._poiLoading = false;
        this._renderPoiPanel();
        this._renderMap(false);
      }
    }
  }

  _restorePreferences() {
    try {
      const raw = localStorage.getItem(this._storageKey);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (["osm", "topo", "satellite", "gps"].includes(data.mode)) this._mode = data.mode;
      if (["osm", "topo", "satellite"].includes(data.lastFreeMode)) this._lastFreeMode = data.lastFreeMode;
      if (Number.isFinite(data.zoom)) this._zoom = Math.max(2, Math.min(22, Number(data.zoom)));
      if (data.center && Number.isFinite(data.center.lat) && Number.isFinite(data.center.lon)) {
        this._center = { lat: Number(data.center.lat), lon: Number(data.center.lon) };
      }
      if (Array.isArray(data.hiddenVehicles)) this._hiddenVehicles = new Set(data.hiddenVehicles.map(String));
      if (data.selectedVehicleId) this._selectedVehicleId = String(data.selectedVehicleId);
      if (Array.isArray(data.poiCategories)) {
        const validPoiKeys = new Set(Object.keys(this._poiDefinitions()));
        this._poiCategories = new Set(data.poiCategories.map(String).filter((key) => validPoiKeys.has(key)));
      }
      if (POI_RADIUS_OPTIONS_KM.includes(Number(data.poiRadiusKm))) this._poiRadiusKm = Number(data.poiRadiusKm);
      if (typeof data.poiSearchText === "string") this._poiSearchText = data.poiSearchText;
      if (typeof data.poiOperatorText === "string") this._poiOperatorText = data.poiOperatorText;
      if ([0, 50, 100, 150, 200, 300, 350].includes(Number(data.poiMinPowerKw))) this._poiMinPowerKw = Number(data.poiMinPowerKw);
      if (["any", "ccs", "type2", "chademo", "tesla"].includes(data.poiConnector)) this._poiConnector = data.poiConnector;
      if (typeof data.poiIncludeUnknownPower === "boolean") this._poiIncludeUnknownPower = data.poiIncludeUnknownPower;
    } catch (_) { /* ignore invalid browser storage */ }
  }

  _savePreferences() {
    try {
      localStorage.setItem(this._storageKey, JSON.stringify({
        mode: this._mode,
        lastFreeMode: this._lastFreeMode,
        zoom: this._zoom,
        center: this._center,
        hiddenVehicles: [...this._hiddenVehicles],
        selectedVehicleId: this._selectedVehicleId,
        poiCategories: [...this._poiCategories],
        poiRadiusKm: this._poiRadiusKm,
        poiSearchText: this._poiSearchText,
        poiOperatorText: this._poiOperatorText,
        poiMinPowerKw: this._poiMinPowerKw,
        poiConnector: this._poiConnector,
        poiIncludeUnknownPower: this._poiIncludeUnknownPower,
      }));
    } catch (_) { /* storage may be unavailable */ }
  }

  _renderFull() {
    if (!this.shadowRoot) return;
    if (!this._hass || !this._registryLoaded) {
      this.shadowRoot.innerHTML = `<ha-card><div style="padding:24px;text-align:center;color:var(--secondary-text-color)">Cardata map is loading …</div></ha-card>`;
      this._domBuilt = false;
      return;
    }

    const vehicles = this._vehicles();
    if (!this._selectedVehicleId || !vehicles.some((v) => v.deviceId === this._selectedVehicleId && v.valid)) {
      this._selectedVehicleId = vehicles.find((v) => v.valid && !this._hiddenVehicles.has(v.deviceId))?.deviceId
        || vehicles.find((v) => v.valid)?.deviceId
        || null;
    }

    const title = this._config.title || "Cardata Vehicle Map";
    this._destroyVectorBasemap();
    this._tileElements.clear();
    this._tileGenerationKey = null;
    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card>
        <div class="map-card-shell">
          <div class="map-header">
            <div class="title-wrap">
              <ha-icon icon="mdi:map-marker-multiple"></ha-icon>
              <div><div class="title">${this._esc(title)}</div><div class="subtitle">Live positions from Cardata Analytics · v${CARD_VERSION}</div></div>
            </div>
            <button class="icon-btn" id="fullscreen" title="Vollbild" aria-label="Vollbild"><ha-icon icon="mdi:fullscreen"></ha-icon></button>
          </div>
          <div class="toolbar">
            <div class="mode-group" role="group" aria-label="Kartendarstellung">
              <button class="mode-btn" data-mode="osm">OSM</button>
              <button class="mode-btn" data-mode="topo">Topo</button>
              <button class="mode-btn" data-mode="satellite"><ha-icon icon="mdi:satellite-variant"></ha-icon> Satellit</button>
              <button class="mode-btn" data-mode="gps"><ha-icon icon="mdi:crosshairs-gps"></ha-icon> GPS</button>
            </div>
            <button class="tool-btn" id="fit" title="Alle sichtbaren Fahrzeuge einpassen"><ha-icon icon="mdi:fit-to-screen-outline"></ha-icon><span>Alle</span></button>
            <button class="tool-btn" id="vehicles-toggle" title="Fahrzeuge ein- oder ausblenden"><ha-icon icon="mdi:car-multiple"></ha-icon><span>Fahrzeuge</span></button>
            <button class="tool-btn" id="poi-toggle" title="Points of Interest in Fahrzeugnähe"><ha-icon icon="mdi:map-marker-radius"></ha-icon><span>POIs</span></button>
          </div>
          <div class="map-wrap">
            <div class="map" id="map" tabindex="0" aria-label="Fahrzeugkarte" style="--cardata-map-height:${Math.max(330, Math.min(900, Number(this._config.height) || 520))}px">
              <div class="vector-map hidden" id="vector-map"></div>
              <div class="tiles" id="tiles"></div>
              <div class="poi-markers" id="poi-markers"></div>
              <div class="markers" id="markers"></div>
              <div class="map-empty" id="map-empty"></div>
              <div class="zoom-controls">
                <button id="zoom-in" aria-label="Vergrößern" title="Vergrößern"><ha-icon icon="mdi:plus"></ha-icon></button>
                <button id="zoom-out" aria-label="Verkleinern" title="Verkleinern"><ha-icon icon="mdi:minus"></ha-icon></button>
              </div>
              <div class="attribution" id="attribution"></div>
              <div class="vehicle-panel hidden" id="vehicle-panel"></div>
              <div class="poi-panel hidden" id="poi-panel"></div>
              <div class="popup hidden" id="popup"></div>
              <div class="poi-popup hidden" id="poi-popup"></div>
            </div>
          </div>
        </div>
      </ha-card>`;

    this._wireEvents();
    this._domBuilt = true;
    this._lastStructureSignature = this._structureSignature();
    this._lastStateSignature = this._stateSignature();

    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this._renderMap());
      this._resizeObserver.observe(this.shadowRoot.getElementById("map"));
    }

    requestAnimationFrame(() => {
      if (!this._mapInitialized && this._visibleVehicles().length) {
        this._fitVisibleVehicles(false);
        this._mapInitialized = true;
      } else {
        this._renderMap();
      }
      this._updateControls();
      this._renderVehiclePanel();
      this._renderPoiPanel();
      if (this._poiCategories.size) this._schedulePoiLoad(300, false);
    });
  }

  _wireEvents() {
    this.shadowRoot.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => this._setMode(btn.dataset.mode));
    });
    this.shadowRoot.getElementById("zoom-in")?.addEventListener("click", () => this._changeZoom(1));
    this.shadowRoot.getElementById("zoom-out")?.addEventListener("click", () => this._changeZoom(-1));
    this.shadowRoot.getElementById("fit")?.addEventListener("click", () => this._fitVisibleVehicles(true));
    this.shadowRoot.getElementById("vehicles-toggle")?.addEventListener("click", () => {
      this.shadowRoot.getElementById("poi-panel")?.classList.add("hidden");
      this.shadowRoot.getElementById("vehicle-panel")?.classList.toggle("hidden");
    });
    this.shadowRoot.getElementById("poi-toggle")?.addEventListener("click", () => {
      this.shadowRoot.getElementById("vehicle-panel")?.classList.add("hidden");
      const panel = this.shadowRoot.getElementById("poi-panel");
      panel?.classList.toggle("hidden");
      if (panel && !panel.classList.contains("hidden")) {
        this._renderPoiPanel();
        this._loadGlobalPoiTemplates(true);
      }
    });
    this.shadowRoot.getElementById("fullscreen")?.addEventListener("click", () => this._toggleFullscreen());

    const lifecycleSignal = this._eventSignal();
    document.addEventListener("fullscreenchange", () => {
      // Native fullscreen is only kept for compatibility with an already active
      // browser fullscreen session. Cardata itself uses persistent CSS fullscreen.
      this._updateFullscreenIcon();
      setTimeout(() => this._resizeMapAfterFullscreenChange(), 60);
    }, { signal: lifecycleSignal });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && this._pseudoFullscreen) {
        this.classList.add("pseudo-fullscreen");
        setTimeout(() => this._resizeMapAfterFullscreenChange(), 80);
      }
    }, { signal: lifecycleSignal });
    window.addEventListener("pageshow", () => {
      if (this._pseudoFullscreen) {
        this.classList.add("pseudo-fullscreen");
        setTimeout(() => this._resizeMapAfterFullscreenChange(), 80);
      }
    }, { signal: lifecycleSignal });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this._pseudoFullscreen && !document.fullscreenElement) {
        event.preventDefault();
        this._setPseudoFullscreen(false);
      }
    }, { signal: lifecycleSignal });
  }

  _eventSignal() {
    if (this._eventController) this._eventController.abort();
    this._eventController = new AbortController();
    return this._eventController.signal;
  }

  _setMode(mode) {
    if (!["osm", "topo", "satellite", "gps"].includes(mode)) return;
    if (mode === "gps") {
      const v = this._selectedVehicle() || this._visibleVehicles()[0];
      if (v) {
        this._focusVehicle(v.deviceId, { follow: true, showPopup: false, animate: true });
        return;
      }
      this._mode = "gps";
    } else {
      this._mode = mode;
      this._lastFreeMode = mode;
    }
    this._savePreferences();
    this._updateControls();
    this._renderMap(true);
  }

  _selectedVehicle() {
    return this._vehicles().find((v) => v.deviceId === this._selectedVehicleId && v.valid && !this._hiddenVehicles.has(v.deviceId)) || null;
  }

  _focusVehicle(vehicleId, { follow = true, showPopup = true, animate = true } = {}) {
    const v = this._vehicles().find((item) => item.deviceId === vehicleId && item.valid);
    if (!v) return false;

    this._hiddenVehicles.delete(v.deviceId);
    this._selectedVehicleId = v.deviceId;
    if (follow) this._mode = "gps";
    this._center = { lat: v.lat, lon: v.lon };
    const targetZoom = Math.min(this._tileProvider().maxZoom, Math.max(Number(this._zoom) || 0, 15));
    this._zoom = targetZoom;
    this._programmaticCameraUntil = Date.now() + (animate ? 1200 : 250);

    this._savePreferences();
    this._updateControls();
    this._syncVehicleMapMarkers();
    this._renderVehiclePanel();
    this._renderPoiPanel();
    this.shadowRoot?.getElementById("poi-popup")?.classList.add("hidden");

    const map = this._vectorMap;
    if (map && this._mapStyleReady) {
      try {
        map.stop?.();
        const camera = { center: [v.lon, v.lat], zoom: targetZoom };
        if (animate && typeof map.easeTo === "function") {
          map.easeTo({ ...camera, duration: 360, essential: true });
        } else if (typeof map.jumpTo === "function") {
          map.jumpTo(camera);
        }
      } catch (err) {
        console.warn("[Cardata Analytics] vehicle focus camera move failed; using map sync fallback", err);
        this._renderMap(true);
      }
    } else {
      this._renderMap(true);
    }

    if (showPopup) this._showPopup(v.deviceId);
    if (this._poiCategories.size && this._poiSourceVehicleId !== v.deviceId) this._schedulePoiLoad(500, false);
    return true;
  }

  _changeZoom(delta) {
    this._zoom = Math.max(2, Math.min(this._tileProvider().maxZoom, Math.round(this._zoom + delta)));
    this._savePreferences();
    this._renderMap(true);
  }

  _startDrag(ev) {
    if (ev.button != null && ev.button !== 0) return;
    const map = this.shadowRoot.getElementById("map");
    if (!map || ev.target.closest("button, a, .popup, .poi-popup, .vehicle-panel, .poi-panel")) return;
    map.setPointerCapture?.(ev.pointerId);
    const world = this._latLonToWorld(this._center.lat, this._center.lon, this._zoom);
    this._drag = { pointerId: ev.pointerId, x: ev.clientX, y: ev.clientY, worldX: world.x, worldY: world.y };
    map.classList.add("dragging");
  }

  _moveDrag(ev) {
    if (!this._drag || this._drag.pointerId !== ev.pointerId) return;
    const dx = ev.clientX - this._drag.x;
    const dy = ev.clientY - this._drag.y;
    this._center = this._worldToLatLon(this._drag.worldX - dx, this._drag.worldY - dy, this._zoom);
    if (this._mode === "gps") this._mode = this._lastFreeMode;
    this._renderMap(false);
    this._updateControls();
  }

  _endDrag(ev) {
    if (!this._drag || this._drag.pointerId !== ev.pointerId) return;
    this._drag = null;
    this.shadowRoot.getElementById("map")?.classList.remove("dragging");
    this._savePreferences();
  }

  _latLonToWorld(lat, lon, zoom) {
    const size = this._tileSize * (2 ** zoom);
    const limitedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
    const x = (lon + 180) / 360 * size;
    const sin = Math.sin(limitedLat * Math.PI / 180);
    const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size;
    return { x, y };
  }

  _worldToLatLon(x, y, zoom) {
    const size = this._tileSize * (2 ** zoom);
    const wrappedX = ((x % size) + size) % size;
    const clampedY = Math.max(0, Math.min(size, y));
    const lon = wrappedX / size * 360 - 180;
    const n = Math.PI - 2 * Math.PI * clampedY / size;
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lon };
  }

  _tileProvider() {
    const effectiveMode = this._mode === "gps" ? this._lastFreeMode : this._mode;
    if (effectiveMode === "satellite") {
      const customUrl = typeof this._config.satellite_url === "string" ? this._config.satellite_url.trim() : "";
      const customAttribution = typeof this._config.satellite_attribution === "string" ? this._config.satellite_attribution.trim() : "";
      const validTemplate = /^https:\/\//i.test(customUrl)
        && ["{z}", "{x}", "{y}"].every((token) => customUrl.includes(token));
      const maxZoom = Math.max(2, Math.min(22, Number(this._config.satellite_max_zoom) || 19));

      if (customUrl || customAttribution) {
        if (!validTemplate || !customAttribution) {
          return {
            id: "satellite-custom-invalid",
            maxZoom,
            attribution: "",
            maplibreStyle: null,
            unavailableMessage: "Ungültige Satelliten-Konfiguration. satellite_url muss HTTPS mit {z}/{x}/{y} enthalten und satellite_attribution muss gesetzt sein.",
          };
        }
        return {
          id: `satellite-custom:${customUrl}`,
          maxZoom,
          attribution: this._esc(customAttribution),
          maplibreStyle: this._rasterMapStyle("satellite-custom", [customUrl], maxZoom),
        };
      }

      return {
        id: "satellite-esri-world-imagery",
        maxZoom,
        attribution: "Tiles © Esri · Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
        maplibreStyle: this._rasterMapStyle(
          "satellite-esri",
          ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          maxZoom,
        ),
      };
    }
    if (effectiveMode === "topo") {
      return {
        id: "topo",
        maxZoom: 17,
        attribution: `Kartendaten © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · Darstellung © <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a>`,
        maplibreStyle: this._rasterMapStyle(
          "topo",
          [
            "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
            "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
            "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
          ],
          17,
        ),
      };
    }
    return {
      id: "osm-openfreemap-liberty",
      maxZoom: 20,
      attribution: `<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://openmaptiles.org" target="_blank" rel="noopener">OpenMapTiles</a> · Daten © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>`,
      maplibreStyle: CARDATA_OPENFREEMAP_STYLE,
    };
  }

  _rasterMapStyle(id, tiles, maxZoom) {
    return {
      version: 8,
      name: `Cardata ${id}`,
      glyphs: CARDATA_OPENFREEMAP_GLYPHS,
      sources: {
        "cardata-basemap": {
          type: "raster",
          tiles: [...tiles],
          tileSize: 256,
          minzoom: 0,
          maxzoom: maxZoom,
        },
      },
      layers: [
        {
          id: "cardata-basemap-raster",
          type: "raster",
          source: "cardata-basemap",
          paint: { "raster-fade-duration": 0 },
        },
      ],
    };
  }

  _destroyVectorBasemap() {
    this._unbindMapPoiHandlers();
    for (const marker of this._vehicleMapMarkers.values()) {
      try { marker.marker?.remove(); } catch (_) { /* already detached */ }
    }
    this._vehicleMapMarkers.clear();
    if (this._vectorMap) {
      try { this._vectorMap.remove(); } catch (_) { /* already detached */ }
    }
    this._vectorMap = null;
    this._vectorMapInitPromise = null;
    this._vectorMapError = "";
    this._maplibreLib = null;
    this._mapStyleId = null;
    this._mapStyleReady = false;
  }

  _syncVectorBasemap(provider) {
    const container = this.shadowRoot?.getElementById("vector-map");
    if (!container || !provider?.maplibreStyle || this._vectorMapError) return;

    if (this._vectorMap) {
      try {
        this._vectorMap.resize();
        this._vectorMap.setMaxZoom(provider.maxZoom);
        if (this._mapStyleId !== provider.id) {
          this._unbindMapPoiHandlers();
          this._mapStyleReady = false;
          this._mapStyleId = provider.id;
          this._vectorMap.setStyle(provider.maplibreStyle, { diff: false });
        }
        const center = this._vectorMap.getCenter();
        const zoom = this._vectorMap.getZoom();
        if (Math.abs(center.lat - this._center.lat) > 1e-7
            || Math.abs(center.lng - this._center.lon) > 1e-7
            || Math.abs(zoom - this._zoom) > 0.001) {
          this._vectorMap.jumpTo({ center: [this._center.lon, this._center.lat], zoom: this._zoom });
        }
      } catch (err) {
        console.warn("[Cardata Analytics] MapLibre sync failed", err);
      }
      return;
    }

    if (this._vectorMapInitPromise) return;
    this._vectorMapInitPromise = ensureCardataMapLibre()
      .then((maplibregl) => {
        if (!this.isConnected || !this._domBuilt || this.shadowRoot?.getElementById("vector-map") !== container) return;
        this._maplibreLib = maplibregl;
        this._mapStyleId = provider.id;
        this._mapStyleReady = false;
        this._vectorMap = new maplibregl.Map({
          container,
          style: provider.maplibreStyle,
          center: [this._center.lon, this._center.lat],
          zoom: this._zoom,
          minZoom: 2,
          maxZoom: provider.maxZoom,
          interactive: true,
          attributionControl: false,
          renderWorldCopies: true,
          fadeDuration: 0,
          dragRotate: false,
          pitchWithRotate: false,
        });
        try { this._vectorMap.touchZoomRotate?.disableRotation(); } catch (_) { /* optional */ }

        const styleReady = () => {
          if (!this._vectorMap) return;
          this._mapStyleReady = true;
          this._vectorMapError = "";
          try {
            this._vectorMap.resize();
            this._ensureMapDataLayers();
            this._syncVehicleMapMarkers();
            this._syncPoiMapSource();
          } catch (err) {
            console.warn("[Cardata Analytics] MapLibre data-layer setup failed", err);
          }
        };
        this._vectorMap.on("load", styleReady);
        this._vectorMap.on("style.load", styleReady);
        this._vectorMap.on("movestart", (event) => {
          const programmatic = Date.now() <= this._programmaticCameraUntil;
          if (event?.originalEvent && !programmatic && this._mode === "gps") {
            this._mode = this._lastFreeMode;
            this._savePreferences();
            this._updateControls();
            this._syncVehicleMapMarkers();
          }
        });
        this._vectorMap.on("move", () => {
          if (!this._vectorMap) return;
          const c = this._vectorMap.getCenter();
          this._center = { lat: c.lat, lon: c.lng };
          this._zoom = this._vectorMap.getZoom();
          this._positionPopup();
          this._positionPoiPopup();
        });
        this._vectorMap.on("moveend", () => {
          if (!this._vectorMap) return;
          const c = this._vectorMap.getCenter();
          this._center = { lat: c.lat, lon: c.lng };
          this._zoom = this._vectorMap.getZoom();
          this._savePreferences();
          this._updateControls();
          this._positionPopup();
          this._positionPoiPopup();
        });
        this._vectorMap.on("error", (event) => {
          const message = event?.error?.message || "Kartenrenderer konnte nicht geladen werden.";
          console.warn("[Cardata Analytics] MapLibre error", event?.error || event);
          if (!this._vectorMap?.loaded()) {
            this._vectorMapError = String(message);
            this._updateMapEmptyState(provider);
          }
        });
      })
      .catch((err) => {
        this._vectorMapError = err?.message || String(err) || "MapLibre konnte nicht geladen werden.";
        console.warn("[Cardata Analytics] MapLibre initialization failed", err);
        this._updateMapEmptyState(provider);
      })
      .finally(() => {
        this._vectorMapInitPromise = null;
      });
  }

  _ensureMapDataLayers() {
    const map = this._vectorMap;
    if (!map || !this._mapStyleReady) return;
    if (!map.getSource("cardata-pois")) {
      map.addSource("cardata-pois", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 52,
        clusterMaxZoom: 17,
      });
    }
    if (!map.getLayer("cardata-poi-clusters")) {
      map.addLayer({
        id: "cardata-poi-clusters",
        type: "circle",
        source: "cardata-pois",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#168aad",
          "circle-radius": ["step", ["get", "point_count"], 17, 10, 20, 30, 24, 100, 29],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.92,
        },
      });
    }
    if (!map.getLayer("cardata-poi-cluster-count")) {
      map.addLayer({
        id: "cardata-poi-cluster-count",
        type: "symbol",
        source: "cardata-pois",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 12,
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#ffffff",
        },
      });
    }
    if (!map.getLayer("cardata-poi-points")) {
      map.addLayer({
        id: "cardata-poi-points",
        type: "circle",
        source: "cardata-pois",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match", ["get", "category"],
            "charging", "#00a8a8",
            "fuel", "#f28e2b",
            "restaurant", "#b65fcf",
            "cafe", "#9c6b30",
            "pharmacy", "#2ca25f",
            "hospital", "#d64545",
            "#168aad",
          ],
          "circle-radius": ["case", ["==", ["get", "selected"], 1], 10, 8],
          "circle-stroke-width": ["case", ["==", ["get", "selected"], 1], 4, 2],
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.95,
        },
      });
    }
    this._bindMapPoiHandlers();
  }

  _bindMapPoiHandlers() {
    const map = this._vectorMap;
    if (!map || !map.getLayer("cardata-poi-clusters") || !map.getLayer("cardata-poi-points")) return;
    this._unbindMapPoiHandlers();
    const clusterClick = async (event) => {
      const feature = event?.features?.[0];
      const clusterId = feature?.properties?.cluster_id;
      const coords = feature?.geometry?.coordinates;
      const source = map.getSource("cardata-pois");
      if (clusterId == null || !Array.isArray(coords) || !source?.getClusterExpansionZoom) return;
      try {
        const zoom = await source.getClusterExpansionZoom(clusterId);
        map.easeTo({ center: coords, zoom: Math.min(this._tileProvider().maxZoom, zoom) });
      } catch (err) {
        console.debug("[Cardata Analytics] cluster expansion failed", err);
      }
    };
    const poiClick = (event) => {
      const poiId = String(event?.features?.[0]?.properties?.poiId || "");
      if (!poiId) return;
      this._selectedPoiId = poiId;
      this._syncPoiMapSource();
      this._showPoiPopup(poiId);
    };
    const pointerOn = () => { try { map.getCanvas().style.cursor = "pointer"; } catch (_) {} };
    const pointerOff = () => { try { map.getCanvas().style.cursor = ""; } catch (_) {} };
    map.on("click", "cardata-poi-clusters", clusterClick);
    map.on("click", "cardata-poi-points", poiClick);
    map.on("mouseenter", "cardata-poi-clusters", pointerOn);
    map.on("mouseleave", "cardata-poi-clusters", pointerOff);
    map.on("mouseenter", "cardata-poi-points", pointerOn);
    map.on("mouseleave", "cardata-poi-points", pointerOff);
    this._mapPoiHandlers = { clusterClick, poiClick, pointerOn, pointerOff };
  }

  _unbindMapPoiHandlers() {
    const map = this._vectorMap;
    const handlers = this._mapPoiHandlers;
    if (!map || !handlers) {
      this._mapPoiHandlers = null;
      return;
    }
    for (const [type, layer, handler] of [
      ["click", "cardata-poi-clusters", handlers.clusterClick],
      ["click", "cardata-poi-points", handlers.poiClick],
      ["mouseenter", "cardata-poi-clusters", handlers.pointerOn],
      ["mouseleave", "cardata-poi-clusters", handlers.pointerOff],
      ["mouseenter", "cardata-poi-points", handlers.pointerOn],
      ["mouseleave", "cardata-poi-points", handlers.pointerOff],
    ]) {
      try { map.off(type, layer, handler); } catch (_) { /* layer may be gone */ }
    }
    this._mapPoiHandlers = null;
  }

  _syncVehicleMapMarkers() {
    const map = this._vectorMap;
    const maplibregl = this._maplibreLib;
    if (!map || !maplibregl) return;
    const visible = this._visibleVehicles();
    const wanted = new Set(visible.map((v) => v.deviceId));
    for (const [deviceId, item] of [...this._vehicleMapMarkers.entries()]) {
      if (wanted.has(deviceId)) continue;
      try { item.marker.remove(); } catch (_) {}
      this._vehicleMapMarkers.delete(deviceId);
    }
    for (const vehicle of visible) {
      let item = this._vehicleMapMarkers.get(vehicle.deviceId);
      if (!item) {
        const element = document.createElement("button");
        element.className = "vehicle-marker";
        element.type = "button";
        element.dataset.vehicleId = vehicle.deviceId;
        element.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const current = this._vehicles().find((v) => v.deviceId === vehicle.deviceId && v.valid);
          if (!current) return;
          if (this._mode === "gps") {
            this._focusVehicle(current.deviceId, { follow: true, showPopup: true, animate: true });
            return;
          }
          this._selectedVehicleId = current.deviceId;
          this._savePreferences();
          this.shadowRoot?.getElementById("poi-popup")?.classList.add("hidden");
          this._showPopup(current.deviceId);
          this._syncVehicleMapMarkers();
          this._renderVehiclePanel();
          this._renderPoiPanel();
          if (this._poiCategories.size && this._poiSourceVehicleId !== current.deviceId) this._schedulePoiLoad(500, false);
        });
        const marker = new maplibregl.Marker({ element, anchor: "center" })
          .setLngLat([vehicle.lon, vehicle.lat])
          .addTo(map);
        item = { marker, element };
        this._vehicleMapMarkers.set(vehicle.deviceId, item);
      }
      item.marker.setLngLat([vehicle.lon, vehicle.lat]);
      item.element.title = vehicle.name;
      item.element.classList.toggle("selected", vehicle.deviceId === this._selectedVehicleId);
      item.element.classList.toggle("following", this._mode === "gps" && vehicle.deviceId === this._selectedVehicleId);
      item.element.innerHTML = `<span class="marker-pulse"></span><span class="marker-core"><ha-icon icon="mdi:car-electric"></ha-icon></span><span class="marker-label">${this._esc(vehicle.name)}</span>`;
    }
  }

  _poiGeoJson() {
    const vehicle = this._selectedVehicle() || this._visibleVehicles()[0] || null;
    if (!this._poiCategories.size || !vehicle || this._poiSourceVehicleId !== vehicle.deviceId) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: (this._poiResults || []).filter((poi) => this._poiCategories.has(poi.category)).map((poi) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [poi.lon, poi.lat] },
        properties: {
          poiId: poi.id,
          category: poi.category,
          name: poi.name || "POI",
          selected: poi.id === this._selectedPoiId ? 1 : 0,
        },
      })),
    };
  }

  _syncPoiMapSource() {
    const map = this._vectorMap;
    if (!map || !this._mapStyleReady) return;
    this._ensureMapDataLayers();
    const source = map.getSource("cardata-pois");
    if (source?.setData) source.setData(this._poiGeoJson());
  }

  _updateMapEmptyState(provider = this._tileProvider()) {
    const empty = this.shadowRoot?.getElementById("map-empty");
    if (!empty) return;
    const allGpsVehicles = this._vehicles().filter((v) => v.valid);
    const visible = this._visibleVehicles();
    if (provider?.unavailableMessage) {
      empty.textContent = provider.unavailableMessage;
      empty.classList.add("show");
    } else if (this._vectorMapError) {
      empty.textContent = `Karte konnte nicht geladen werden: ${this._vectorMapError}`;
      empty.classList.add("show");
    } else if (!allGpsVehicles.length) {
      empty.textContent = "Keine gültige Fahrzeugposition verfügbar. Bitte Latitude und Longitude beim Fahrzeug konfigurieren.";
      empty.classList.add("show");
    } else if (!visible.length) {
      empty.textContent = "Alle Fahrzeuge sind ausgeblendet.";
      empty.classList.add("show");
    } else {
      empty.textContent = "";
      empty.classList.remove("show");
    }
  }

  _renderMap(forceTiles = false) {
    void forceTiles;
    if (!this._domBuilt) return;
    const mapHost = this.shadowRoot?.getElementById("map");
    const vectorLayer = this.shadowRoot?.getElementById("vector-map");
    if (!mapHost || !vectorLayer) return;

    if (this._mode === "gps") {
      const selected = this._selectedVehicle() || this._visibleVehicles()[0];
      if (selected) {
        this._selectedVehicleId = selected.deviceId;
        this._center = { lat: selected.lat, lon: selected.lon };
      }
    }

    const provider = this._tileProvider();
    if (this._zoom > provider.maxZoom) this._zoom = provider.maxZoom;
    vectorLayer.classList.toggle("hidden", !provider.maplibreStyle);
    this.shadowRoot?.getElementById("tiles")?.classList.add("hidden");
    this.shadowRoot?.getElementById("poi-markers")?.classList.add("hidden");
    this.shadowRoot?.getElementById("markers")?.classList.add("hidden");

    if (provider.maplibreStyle) {
      this._syncVectorBasemap(provider);
      if (this._vectorMap) {
        this._syncVehicleMapMarkers();
        this._syncPoiMapSource();
      }
    }

    const attribution = this.shadowRoot?.getElementById("attribution");
    if (attribution) attribution.innerHTML = provider.attribution || "";
    this._updateMapEmptyState(provider);
    this._positionPopup();
    this._positionPoiPopup();
  }

  _fitVisibleVehicles(save = true) {
    const vehicles = this._visibleVehicles();
    if (!vehicles.length) {
      this._renderMap(true);
      return;
    }

    // "Alle" is a free-map action. Leave GPS follow before fitting, otherwise
    // the next render/state update would immediately snap back to one vehicle.
    if (this._mode === "gps") this._mode = this._lastFreeMode || "osm";
    this._selectedVehicleId = vehicles.length === 1 ? vehicles[0].deviceId : this._selectedVehicleId;
    this._updateControls();

    const minLat = Math.min(...vehicles.map((v) => v.lat));
    const maxLat = Math.max(...vehicles.map((v) => v.lat));
    const minLon = Math.min(...vehicles.map((v) => v.lon));
    const maxLon = Math.max(...vehicles.map((v) => v.lon));
    this._center = { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };

    const map = this._vectorMap;
    if (map && this._mapStyleReady) {
      try {
        map.resize();
        const panelOpen = !this.shadowRoot?.getElementById("vehicle-panel")?.classList.contains("hidden")
          || !this.shadowRoot?.getElementById("poi-panel")?.classList.contains("hidden");
        const hostWidth = this.shadowRoot?.getElementById("map")?.getBoundingClientRect()?.width || 1000;
        const sidePadding = panelOpen ? Math.min(360, Math.max(80, hostWidth * 0.24)) : 70;
        if (vehicles.length === 1) {
          map.easeTo({
            center: [vehicles[0].lon, vehicles[0].lat],
            zoom: Math.min(15, this._tileProvider().maxZoom),
            duration: 320,
          });
        } else {
          map.fitBounds(
            [[minLon, minLat], [maxLon, maxLat]],
            {
              padding: { top: 70, bottom: 70, left: 70, right: sidePadding },
              maxZoom: Math.min(15, this._tileProvider().maxZoom),
              duration: 420,
            }
          );
        }
        if (save) setTimeout(() => this._savePreferences(), 480);
        return;
      } catch (err) {
        console.warn("[Cardata Analytics] MapLibre fitBounds failed; using fallback", err);
      }
    }

    // Fallback for the short initialization window before MapLibre is ready.
    const mapHost = this.shadowRoot.getElementById("map");
    const rect = mapHost?.getBoundingClientRect();
    const width = Math.max(300, rect?.width || 800);
    const height = Math.max(250, rect?.height || 500);
    if (vehicles.length === 1) {
      this._zoom = 15;
    } else {
      let bestZoom = 2;
      for (let z = 17; z >= 2; z--) {
        const nw = this._latLonToWorld(maxLat, minLon, z);
        const se = this._latLonToWorld(minLat, maxLon, z);
        if (Math.abs(se.x - nw.x) <= width - 120 && Math.abs(se.y - nw.y) <= height - 140) {
          bestZoom = z;
          break;
        }
      }
      this._zoom = bestZoom;
    }
    if (save) this._savePreferences();
    this._renderMap(true);
  }

  _updateFromHass() {
    const selected = this._selectedVehicle();
    if (this._mode === "gps" && selected) this._center = { lat: selected.lat, lon: selected.lon };
    const poiMoveThresholdKm = Math.max(0.5, Math.min(20, this._poiRadiusKm * 0.1));
    if (selected && this._poiCategories.size && this._poiSourceVehicleId === selected.deviceId
        && Number.isFinite(this._poiSourceLat) && Number.isFinite(this._poiSourceLon)
        && this._distanceKm(this._poiSourceLat, this._poiSourceLon, selected.lat, selected.lon) >= poiMoveThresholdKm) {
      this._schedulePoiLoad(1500, false);
    }
    this._renderMap();
    this._renderVehiclePanel();
    this._renderPoiPanel();
    const popup = this.shadowRoot.getElementById("popup");
    if (popup && !popup.classList.contains("hidden") && this._selectedVehicleId) {
      this._showPopup(this._selectedVehicleId, false);
    }
    const poiPopup = this.shadowRoot.getElementById("poi-popup");
    if (poiPopup && !poiPopup.classList.contains("hidden") && this._selectedPoiId) {
      this._showPoiPopup(this._selectedPoiId, false);
    }
  }

  _updateControls() {
    this.shadowRoot.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === this._mode);
    });
    this.shadowRoot.getElementById("poi-toggle")?.classList.toggle("active", this._poiCategories.size > 0);
    this._updateFullscreenIcon();
  }

  _renderVehiclePanel() {
    const panel = this.shadowRoot.getElementById("vehicle-panel");
    if (!panel) return;
    const vehicles = this._vehicles();
    panel.innerHTML = `
      <div class="panel-title"><span>Fahrzeuge</span><button id="panel-close" aria-label="Schließen"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="panel-actions"><button id="show-all">Alle anzeigen</button><button id="hide-all">Alle ausblenden</button></div>
      <div class="vehicle-list">
        ${vehicles.map((v) => `
          <div class="vehicle-row ${v.valid ? "" : "invalid"}" data-vehicle-row="${this._esc(v.deviceId)}">
            <label>
              <input type="checkbox" data-vehicle-check="${this._esc(v.deviceId)}" ${!this._hiddenVehicles.has(v.deviceId) ? "checked" : ""} ${v.valid ? "" : "disabled"}>
              <span class="vehicle-row-main"><strong>${this._esc(v.name)}</strong><small>${v.valid ? this._esc(v.address || `${v.lat.toFixed(5)}, ${v.lon.toFixed(5)}`) : "Standort nicht verfügbar"}</small></span>
            </label>
            ${v.valid ? `<button class="focus-btn" data-focus="${this._esc(v.deviceId)}" title="Fahrzeug zentrieren"><ha-icon icon="mdi:crosshairs-gps"></ha-icon></button>` : ""}
          </div>`).join("") || `<div class="panel-empty">Keine Fahrzeuge mit GPS-Konfiguration gefunden.</div>`}
      </div>`;

    panel.querySelector("#panel-close")?.addEventListener("click", () => panel.classList.add("hidden"));
    panel.querySelector("#show-all")?.addEventListener("click", () => {
      this._hiddenVehicles.clear();
      this._savePreferences();
      this._renderVehiclePanel();
      this._renderMap(true);
      this._renderPoiPanel();
      if (this._poiCategories.size) this._schedulePoiLoad(500, false);
    });
    panel.querySelector("#hide-all")?.addEventListener("click", () => {
      for (const v of vehicles) this._hiddenVehicles.add(v.deviceId);
      this._savePreferences();
      this._renderVehiclePanel();
      this._renderMap(true);
      this._renderPoiPanel();
    });
    panel.querySelectorAll("[data-vehicle-check]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.dataset.vehicleCheck;
        if (input.checked) this._hiddenVehicles.delete(id);
        else this._hiddenVehicles.add(id);
        if (this._selectedVehicleId === id && !input.checked) {
          this.shadowRoot.getElementById("popup")?.classList.add("hidden");
        }
        this._savePreferences();
        this._renderMap(true);
        this._renderPoiPanel();
        if (this._poiCategories.size) this._schedulePoiLoad(500, false);
      });
    });
    panel.querySelectorAll("[data-focus]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._focusVehicle(btn.dataset.focus, { follow: true, showPopup: true, animate: true });
      });
    });
  }

  _renderPoiPanel() {
    const panel = this.shadowRoot?.getElementById("poi-panel");
    if (!panel) return;
    const defs = this._poiDefinitions();
    const vehicles = this._vehicles();
    const vehicle = this._selectedVehicle() || this._visibleVehicles()[0] || null;
    const selected = [...this._poiCategories];
    const builtinTemplates = this._builtinPoiTemplates();
    const customTemplates = this._readPoiTemplates();
    const operatorSuggestions = [...new Set((this._poiRawResults || [])
      .flatMap((poi) => [poi.operator, poi.brand, poi.network]).filter(Boolean).map(String))]
      .sort((a, b) => a.localeCompare(b, "de")).slice(0, 40);
    const chargingSelected = this._poiCategories.has("charging");
    const selectedDefs = selected.map((key) => [key, defs[key]]).filter(([, def]) => def);

    panel.innerHTML = `
      <div class="poi-mobile-handle" aria-hidden="true"><span></span></div>
      <div class="poi-sticky-top">
        <div class="panel-title"><span>Points of Interest</span><button id="poi-panel-close" aria-label="Schließen"><ha-icon icon="mdi:close"></ha-icon></button></div>
        <div class="poi-vehicle-row">
          <label class="poi-field"><span>Fahrzeug / POI-Zentrum</span><select id="poi-vehicle-select">
            ${vehicles.map((item) => `<option value="${this._esc(item.deviceId)}" ${vehicle?.deviceId === item.deviceId ? "selected" : ""} ${item.valid ? "" : "disabled"}>${this._esc(item.name)}${item.valid ? "" : " · kein GPS"}</option>`).join("")}
          </select></label>
          <button id="poi-vehicle-focus" class="poi-focus-button" title="Auf ausgewähltes Fahrzeug zoomen" ${vehicle ? "" : "disabled"}><ha-icon icon="mdi:crosshairs-gps"></ha-icon></button>
        </div>

        <div class="poi-filter-section poi-template-section">
          <div class="poi-section-title">Vorlagen ${this._poiTemplatesLoaded ? "· global" : ""}</div>
          <div class="poi-template-row">
            <select id="poi-template" aria-label="POI-Vorlage">
              <option value="" ${!this._poiActiveTemplate ? "selected" : ""}>Aktuelle Filter</option>
              <optgroup label="Standard">
                ${Object.entries(builtinTemplates).map(([key, item]) => `<option value="${this._esc(key)}" ${this._poiActiveTemplate === key ? "selected" : ""}>${this._esc(item.name)}</option>`).join("")}
              </optgroup>
              ${Object.keys(customTemplates).length ? `<optgroup label="Eigene · global">${Object.entries(customTemplates).sort((a,b) => String(a[1]?.name || a[0]).localeCompare(String(b[1]?.name || b[0]), "de")).map(([key, item]) => `<option value="${this._esc(key)}" ${this._poiActiveTemplate === key ? "selected" : ""}>${this._esc(item.name || key.replace(/^custom:/, ""))}</option>`).join("")}</optgroup>` : ""}
            </select>
            <button id="poi-template-save" title="Aktuelle Filter global speichern"><ha-icon icon="mdi:content-save-outline"></ha-icon></button>
            <button id="poi-template-delete" title="Eigene globale Vorlage löschen" ${this._poiActiveTemplate?.startsWith("custom:") ? "" : "disabled"}><ha-icon icon="mdi:delete-outline"></ha-icon></button>
          </div>
        </div>

        <div class="poi-filter-section poi-category-search-section">
          <label class="poi-field poi-category-search"><span>Kategorie suchen</span><input id="poi-category-search" type="search" placeholder="z. B. Bäckerei, Museum, Geldautomat …"></label>
          ${selectedDefs.length ? `<div class="poi-selected-chips" aria-label="Aktive POI-Kategorien">${selectedDefs.map(([key, def]) => `<button type="button" data-remove-poi-category="${this._esc(key)}" title="${this._esc(def.label)} abwählen"><ha-icon icon="${this._esc(def.icon)}"></ha-icon><span>${this._esc(def.label)}</span><ha-icon icon="mdi:close"></ha-icon></button>`).join("")}</div>` : `<div class="poi-selected-empty">Keine Kategorie ausgewählt</div>`}
        </div>
      </div>

      <div class="poi-category-scroll">
        <div class="poi-category-groups">
          ${this._poiCategoryGroups().map((group) => {
            const entries = Object.entries(defs).filter(([, def]) => def.group === group.key);
            const selectedCount = entries.filter(([key]) => this._poiCategories.has(key)).length;
            const open = this._poiOpenGroups.has(group.key);
            return `<details class="poi-category-group" data-poi-group="${this._esc(group.key)}" ${open ? "open" : ""}>
              <summary><span class="poi-group-label">${this._esc(group.label)}</span><span class="poi-group-count">${selectedCount}/${entries.length}</span></summary>
              <div class="poi-categories">
                ${entries.map(([key, def]) => `<label class="poi-category" data-poi-category-label="${this._esc(this._normalizePoiSearchText(def.label))}">
                  <input type="checkbox" data-poi-category="${this._esc(key)}" ${this._poiCategories.has(key) ? "checked" : ""}>
                  <ha-icon icon="${this._esc(def.icon)}"></ha-icon>
                  <span>${this._esc(def.label)}</span>
                </label>`).join("")}
              </div>
            </details>`;
          }).join("")}
        </div>
      </div>

      <div class="poi-sticky-bottom">
        <div class="poi-filter-section poi-general-search-section">
          <div class="poi-section-title">Allgemeine POI-Suche</div>
          <label class="poi-field"><span>Suche</span><input id="poi-search" type="search" value="${this._esc(this._poiSearchText)}" placeholder="z. B. Starbucks, Apotheke, Hotel …"></label>
        </div>

        <div class="poi-filter-section ${chargingSelected ? "" : "poi-disabled-section"}">
          <div class="poi-section-title">Ladestationen ${chargingSelected ? "" : "· aktivieren"}</div>
          <label class="poi-field"><span>Betreiber / Netzwerk</span><input id="poi-operator" list="poi-operator-list" type="search" value="${this._esc(this._poiOperatorText)}" placeholder="z. B. IONITY" ${chargingSelected ? "" : "disabled"}></label>
          <datalist id="poi-operator-list">${operatorSuggestions.map((item) => `<option value="${this._esc(item)}"></option>`).join("")}</datalist>
          <div class="poi-filter-grid poi-charging-grid">
            <label class="poi-field"><span>Stecker</span><select id="poi-connector" ${chargingSelected ? "" : "disabled"}>
              ${[["any","Alle"],["ccs","CCS"],["type2","Type 2"],["chademo","CHAdeMO"],["tesla","Tesla"]].map(([value,label]) => `<option value="${value}" ${this._poiConnector === value ? "selected" : ""}>${label}</option>`).join("")}
            </select></label>
            <label class="poi-field"><span>Mindestleistung</span><select id="poi-min-power" ${chargingSelected ? "" : "disabled"}>
              ${[[0,"Alle"],[50,"≥ 50 kW"],[100,"≥ 100 kW"],[150,"≥ 150 kW"],[200,"≥ 200 kW"],[300,"≥ 300 kW"],[350,"≥ 350 kW"]].map(([value,label]) => `<option value="${value}" ${Number(this._poiMinPowerKw) === value ? "selected" : ""}>${label}</option>`).join("")}
            </select></label>
          </div>
          <label class="poi-check-row"><input id="poi-include-unknown" type="checkbox" ${this._poiIncludeUnknownPower ? "checked" : ""} ${chargingSelected ? "" : "disabled"}><span>Lader mit unbekannter Leistung einbeziehen</span></label>
        </div>

        <label class="poi-radius-label">Umkreis
          <select id="poi-radius">
            ${POI_RADIUS_OPTIONS_KM.map((km) => `<option value="${km}" ${this._poiRadiusKm === km ? "selected" : ""}>${km} km</option>`).join("")}
          </select>
        </label>
        <div class="poi-actions">
          <button id="poi-refresh" ${!selected.length || !vehicle || this._poiLoading ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon> Aktualisieren</button>
          <button id="poi-clear" ${!selected.length && !this._poiResults.length ? "disabled" : ""}><ha-icon icon="mdi:map-marker-off-outline"></ha-icon> Aus</button>
        </div>
        <div class="poi-status ${this._poiError ? "warning" : ""}">${this._esc(this._poiStatusText())}</div>
        <div class="poi-note">Allgemeine POIs © OpenStreetMap-Mitwirkende · Ladestationen: Open Charge Map · Vorlagen global in Home Assistant gespeichert · Cardata ${CARD_VERSION}.</div>
      </div>`;

    panel.querySelector("#poi-panel-close")?.addEventListener("click", () => panel.classList.add("hidden"));

    panel.querySelector("#poi-vehicle-select")?.addEventListener("change", (ev) => {
      const id = String(ev.target.value || "");
      if (!id) return;
      const previousVehicle = this._selectedVehicleId;
      if (!this._focusVehicle(id, { follow: false, showPopup: false, animate: true })) return;
      if (previousVehicle !== id && this._poiCategories.size) {
        this._poiLoading = true;
        this._poiError = "";
        this._schedulePoiLoad(120, false);
      }
    });
    panel.querySelector("#poi-vehicle-focus")?.addEventListener("click", () => {
      const id = String(panel.querySelector("#poi-vehicle-select")?.value || vehicle?.deviceId || "");
      if (id) this._focusVehicle(id, { follow: false, showPopup: false, animate: true });
    });

    panel.querySelector("#poi-template")?.addEventListener("change", (ev) => {
      const key = String(ev.target.value || "");
      if (key) this._applyPoiTemplate(key);
      else this._poiActiveTemplate = "";
    });
    panel.querySelector("#poi-template-save")?.addEventListener("click", async () => {
      const current = this._poiActiveTemplate?.startsWith("custom:") ? customTemplates[this._poiActiveTemplate]?.name : "";
      const name = window.prompt("Name der globalen POI-Vorlage:", current || "");
      if (!name || !name.trim()) return;
      const clean = name.trim().slice(0, 60);
      let key = this._poiActiveTemplate?.startsWith("custom:") ? this._poiActiveTemplate : "";
      if (!key) key = `custom:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      try {
        await this._saveGlobalPoiTemplate(key, this._snapshotPoiFilter(clean));
        this._poiActiveTemplate = key;
        this._renderPoiPanel();
      } catch (err) {
        window.alert(`POI-Vorlage konnte nicht global gespeichert werden: ${err?.message || err}`);
      }
    });
    panel.querySelector("#poi-template-delete")?.addEventListener("click", async () => {
      const key = this._poiActiveTemplate;
      if (!key?.startsWith("custom:")) return;
      const name = customTemplates[key]?.name || "diese Vorlage";
      if (!window.confirm(`Globale POI-Vorlage „${name}“ löschen?`)) return;
      try {
        await this._deleteGlobalPoiTemplate(key);
        this._poiActiveTemplate = "";
        this._renderPoiPanel();
      } catch (err) {
        window.alert(`POI-Vorlage konnte nicht gelöscht werden: ${err?.message || err}`);
      }
    });

    panel.querySelectorAll(".poi-category-group").forEach((group) => {
      group.addEventListener("toggle", () => {
        const key = String(group.dataset.poiGroup || "");
        if (!key) return;
        if (group.open) {
          // On narrow screens keep the accordion compact: one open group at a time.
          if (window.matchMedia?.("(max-width: 600px)")?.matches) {
            panel.querySelectorAll(".poi-category-group[open]").forEach((other) => {
              if (other !== group) other.open = false;
            });
            this._poiOpenGroups.clear();
          }
          this._poiOpenGroups.add(key);
        } else {
          this._poiOpenGroups.delete(key);
        }
      });
    });

    const categorySearch = panel.querySelector("#poi-category-search");
    categorySearch?.addEventListener("input", () => {
      const needle = this._normalizePoiSearchText(categorySearch.value);
      panel.querySelectorAll(".poi-category-group").forEach((group) => {
        let visibleCount = 0;
        group.querySelectorAll(".poi-category").forEach((label) => {
          const haystack = String(label.dataset.poiCategoryLabel || "");
          const visible = !needle || haystack.includes(needle) || haystack.replace(/\s+/g, "").includes(needle.replace(/\s+/g, ""));
          label.classList.toggle("poi-category-filtered", !visible);
          if (visible) visibleCount += 1;
        });
        group.classList.toggle("poi-category-group-filtered", visibleCount === 0);
        if (needle && visibleCount > 0) group.open = true;
      });
    });

    const setCategory = (key, enabled) => {
      const chargingWasSelected = this._poiCategories.has("charging");
      if (enabled) this._poiCategories.add(key);
      else this._poiCategories.delete(key);
      if (key === "charging" && chargingWasSelected && !enabled) this._clearChargingSpecificFilters(true);
      this._poiActiveTemplate = "";
      this._savePreferences();
      this._selectedPoiId = null;
      this.shadowRoot?.getElementById("poi-popup")?.classList.add("hidden");
      if (!this._poiCategories.size) {
        this._resetPoiRequestState(true);
        this._poiRawResults = [];
        this._poiResults = [];
        this._poiSourceVehicleId = null;
        this._poiSourceLat = null;
        this._poiSourceLon = null;
        this._poiError = "";
        this._poiLoading = false;
        this._renderMap(false);
        this._renderPoiPanel();
        this._updateControls();
        return;
      }
      this._poiLoading = true;
      this._poiError = "";
      this._renderPoiPanel();
      this._updateControls();
      this._schedulePoiLoad(600, false);
    };

    panel.querySelectorAll("[data-poi-category]").forEach((input) => {
      input.addEventListener("change", () => setCategory(input.dataset.poiCategory, Boolean(input.checked)));
    });
    panel.querySelectorAll("[data-remove-poi-category]").forEach((button) => {
      button.addEventListener("click", () => setCategory(button.dataset.removePoiCategory, false));
    });

    const localFilterChanged = () => {
      this._poiActiveTemplate = "";
      const templateSelect = panel.querySelector("#poi-template");
      if (templateSelect) templateSelect.value = "";
      this._applyPoiClientFilters();
      this._savePreferences();
      this._renderMap(false);
      this._updatePoiStatusDom();
    };
    panel.querySelector("#poi-search")?.addEventListener("input", (ev) => {
      this._poiSearchText = String(ev.target.value || "");
      localFilterChanged();
    });
    panel.querySelector("#poi-search")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        this._poiSearchText = String(ev.target.value || "").trim();
        localFilterChanged();
      }
    });
    panel.querySelector("#poi-min-power")?.addEventListener("change", (ev) => {
      this._poiMinPowerKw = Number(ev.target.value) || 0;
      localFilterChanged();
    });
    panel.querySelector("#poi-include-unknown")?.addEventListener("change", (ev) => {
      this._poiIncludeUnknownPower = Boolean(ev.target.checked);
      localFilterChanged();
    });

    const serverFilterChanged = () => {
      this._poiActiveTemplate = "";
      this._savePreferences();
      if (this._poiCategories.size) {
        this._poiLoading = true;
        this._poiError = "";
        this._renderPoiPanel();
        this._schedulePoiLoad(350, false);
      }
    };
    panel.querySelector("#poi-operator")?.addEventListener("change", (ev) => {
      this._poiOperatorText = String(ev.target.value || "").trim();
      serverFilterChanged();
    });
    panel.querySelector("#poi-operator")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        this._poiOperatorText = String(ev.target.value || "").trim();
        serverFilterChanged();
      }
    });
    panel.querySelector("#poi-connector")?.addEventListener("change", (ev) => {
      this._poiConnector = String(ev.target.value || "any");
      serverFilterChanged();
    });
    panel.querySelector("#poi-radius")?.addEventListener("change", (ev) => {
      this._poiRadiusKm = Number(ev.target.value) || 5;
      this._poiActiveTemplate = "";
      this._savePreferences();
      if (this._poiCategories.size) {
        this._poiLoading = true;
        this._poiError = "";
        this._renderPoiPanel();
        this._schedulePoiLoad(350, false);
      }
    });
    panel.querySelector("#poi-refresh")?.addEventListener("click", () => this._schedulePoiLoad(0, true));
    panel.querySelector("#poi-clear")?.addEventListener("click", () => {
      this._resetPoiRequestState(true);
      this._poiCategories.clear();
      this._poiRawResults = [];
      this._poiResults = [];
      this._poiSourceVehicleId = null;
      this._poiSourceLat = null;
      this._poiSourceLon = null;
      this._poiError = "";
      this._poiLoading = false;
      this._selectedPoiId = null;
      this._poiActiveTemplate = "";
      this._savePreferences();
      this.shadowRoot?.getElementById("poi-popup")?.classList.add("hidden");
      this._renderPoiPanel();
      this._renderMap(false);
      this._updateControls();
    });
  }

  _renderPoiMarkers(topLeft, width, height, n) {
    // Kept as a compatibility shim for older call sites. POIs are GeoJSON
    // features rendered and clustered directly by MapLibre in 0.1.35+.
    void topLeft; void width; void height; void n;
    this._syncPoiMapSource();
  }

  _showPoiPopup(poiId, reposition = true) {
    const popup = this.shadowRoot?.getElementById("poi-popup");
    const poi = this._poiResults.find((item) => item.id === poiId);
    if (!popup || !poi) return;
    this._selectedPoiId = poi.id;
    const defs = this._poiDefinitions();
    const def = defs[poi.category] || { label: "POI", icon: "mdi:map-marker" };
    const vehicle = this._selectedVehicle() || this._visibleVehicles()[0] || null;
    const distance = vehicle ? this._distanceKm(vehicle.lat, vehicle.lon, poi.lat, poi.lon) : null;
    const detailParts = [
      poi.operator ? `Betreiber: ${poi.operator}` : null,
      poi.brand && poi.brand !== poi.operator ? `Marke: ${poi.brand}` : null,
      poi.network && poi.network !== poi.operator && poi.network !== poi.brand ? `Netz: ${poi.network}` : null,
      poi.category === "charging" && poi.maxPowerKw != null && Number.isFinite(Number(poi.maxPowerKw)) ? `Max. Leistung: ${this._formatNumber(poi.maxPowerKw, 0)} kW` : null,
      poi.openingHours ? `Öffnung: ${poi.openingHours}` : null,
      poi.capacity ? `Kapazität: ${poi.capacity}` : null,
      poi.access ? `Zugang: ${poi.access}` : null,
      poi.fee ? `Gebühr: ${poi.fee}` : null,
      poi.sourceLabel ? `Quelle: ${poi.sourceLabel}` : null,
      poi.sourceLicense ? `Lizenz: ${poi.sourceLicense}` : null,
      ...(Array.isArray(poi.connectors) ? poi.connectors : []),
    ].filter(Boolean);
    const osmUrl = poi.osmType && poi.osmId
      ? `https://www.openstreetmap.org/${encodeURIComponent(poi.osmType)}/${encodeURIComponent(poi.osmId)}`
      : null;
    popup.innerHTML = `
      <div class="popup-head"><div><strong><ha-icon icon="${this._esc(def.icon)}"></ha-icon>${this._esc(poi.name)}</strong><div>${this._esc(poi.address || `${poi.lat.toFixed(6)}, ${poi.lon.toFixed(6)}`)}</div></div><button id="poi-popup-close" aria-label="Schließen"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="poi-popup-meta"><span>${this._esc(def.label)}</span>${distance != null ? `<span>${this._formatNumber(distance, 1)} km vom Fahrzeug</span>` : ""}</div>
      ${detailParts.length ? `<div class="poi-details">${this._esc(detailParts.join(" · "))}</div>` : ""}
      ${(poi.phone || poi.website) ? `<div class="poi-contact">
        ${poi.phone ? `<span><ha-icon icon="mdi:phone"></ha-icon>${this._esc(poi.phone)}</span>` : ""}
        ${poi.website ? `<a href="${this._esc(poi.website)}" target="_blank" rel="noopener"><ha-icon icon="mdi:web"></ha-icon>Website</a>` : ""}
      </div>` : ""}
      <div class="popup-actions poi-popup-actions">
        <a href="${this._esc(this._poiNavigationUrl(poi))}" target="_blank" rel="noopener"><ha-icon icon="mdi:navigation-variant"></ha-icon> Navigation</a>
        <a href="${this._esc(this._poiSearchUrl(poi))}" target="_blank" rel="noopener"><ha-icon icon="mdi:google-maps"></ha-icon> Google Maps</a>
        ${osmUrl ? `<a href="${this._esc(osmUrl)}" target="_blank" rel="noopener"><ha-icon icon="mdi:openstreetmap"></ha-icon> OSM</a>` : ""}
      </div>`;
    popup.classList.remove("hidden");
    this.shadowRoot?.getElementById("popup")?.classList.add("hidden");
    popup.querySelector("#poi-popup-close")?.addEventListener("click", () => popup.classList.add("hidden"));
    if (reposition) this._positionPoiPopup();
  }

  _positionPoiPopup() {
    const popup = this.shadowRoot?.getElementById("poi-popup");
    const mapHost = this.shadowRoot?.getElementById("map");
    const map = this._vectorMap;
    if (!popup || !mapHost || !map || popup.classList.contains("hidden")) return;
    const poi = this._poiResults.find((item) => item.id === this._selectedPoiId);
    if (!poi) {
      popup.classList.add("hidden");
      return;
    }
    let point;
    try { point = map.project([poi.lon, poi.lat]); } catch (_) { return; }
    const rect = mapHost.getBoundingClientRect();
    const popupWidth = Math.min(350, Math.max(270, rect.width - 24));
    popup.style.width = `${popupWidth}px`;
    const left = Math.max(12, Math.min(rect.width - popupWidth - 12, point.x - popupWidth / 2));
    const top = point.y > rect.height * 0.58 ? Math.max(12, point.y - 215) : Math.min(rect.height - 205, point.y + 28);
    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(Math.max(12, top))}px`;
  }

  _showPopup(vehicleId, reposition = true) {
    const popup = this.shadowRoot.getElementById("popup");
    const v = this._vehicles().find((item) => item.deviceId === vehicleId && item.valid);
    if (!popup || !v) return;
    this._selectedVehicleId = v.deviceId;
    const address = v.address || `${v.lat.toFixed(6)}, ${v.lon.toFixed(6)}`;
    popup.innerHTML = `
      <div class="popup-head"><div><strong>${this._esc(v.name)}</strong><div>${this._esc(address)}</div></div><button id="popup-close" aria-label="Schließen"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="popup-grid">
        <div><span>SoC</span><strong>${this._formatNumber(v.soc, 1)}${v.soc == null ? "" : " %"}</strong></div>
        <div><span>Reichweite</span><strong>${this._formatNumber(v.range, 0)}${v.range == null ? "" : " km"}</strong></div>
        <div><span>Kilometer</span><strong>${this._formatNumber(v.mileage, 1)}${v.mileage == null ? "" : " km"}</strong></div>
        <div><span>GPS</span><strong>${this._esc(this._formatAge(v.lastChanged))}</strong></div>
      </div>
      <div class="popup-actions">
        <button id="popup-follow"><ha-icon icon="mdi:crosshairs-gps"></ha-icon> Folgen</button>
        ${v.googleMapsUrl ? `<a href="${this._esc(v.googleMapsUrl)}" target="_blank" rel="noopener"><ha-icon icon="mdi:google-maps"></ha-icon> Google Maps</a>` : ""}
      </div>`;
    popup.classList.remove("hidden");
    this.shadowRoot?.getElementById("poi-popup")?.classList.add("hidden");
    popup.querySelector("#popup-close")?.addEventListener("click", () => popup.classList.add("hidden"));
    popup.querySelector("#popup-follow")?.addEventListener("click", () => {
      this._focusVehicle(v.deviceId, { follow: true, showPopup: true, animate: true });
    });
    if (reposition) this._positionPopup();
  }

  _positionPopup() {
    const popup = this.shadowRoot?.getElementById("popup");
    const mapHost = this.shadowRoot?.getElementById("map");
    const map = this._vectorMap;
    if (!popup || !mapHost || !map || popup.classList.contains("hidden")) return;
    const vehicle = this._selectedVehicle();
    if (!vehicle) {
      popup.classList.add("hidden");
      return;
    }
    let point;
    try { point = map.project([vehicle.lon, vehicle.lat]); } catch (_) { return; }
    const rect = mapHost.getBoundingClientRect();
    const popupWidth = Math.min(330, Math.max(260, rect.width - 24));
    popup.style.width = `${popupWidth}px`;
    const left = Math.max(12, Math.min(rect.width - popupWidth - 12, point.x - popupWidth / 2));
    const top = point.y > rect.height * 0.56 ? Math.max(12, point.y - 205) : Math.min(rect.height - 190, point.y + 34);
    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(Math.max(12, top))}px`;
  }

  _fullscreenSessionKey() {
    return `${this._storageKey}:pseudo_fullscreen`;
  }

  _resizeMapAfterFullscreenChange() {
    try { this._vectorMap?.resize(); } catch (_) {}
    this._renderMap(true);
    this._positionPopup();
    this._positionPoiPopup();
  }

  _setPseudoFullscreen(active, persist = true) {
    this._pseudoFullscreen = Boolean(active);
    this.classList.toggle("pseudo-fullscreen", this._pseudoFullscreen);
    if (persist) {
      try {
        if (this._pseudoFullscreen) sessionStorage.setItem(this._fullscreenSessionKey(), "1");
        else sessionStorage.removeItem(this._fullscreenSessionKey());
      } catch (_) {}
    }
    this._updateFullscreenIcon();
    setTimeout(() => this._resizeMapAfterFullscreenChange(), 60);
  }

  _restorePseudoFullscreen() {
    let active = false;
    try { active = sessionStorage.getItem(this._fullscreenSessionKey()) === "1"; } catch (_) {}
    if (active) this._setPseudoFullscreen(true, false);
  }

  async _toggleFullscreen() {
    // Browser-native fullscreen is automatically terminated when a navigation
    // link opens another tab/window. A CSS fullscreen card stays intact when the
    // user returns from Google Maps, which is the expected dashboard behaviour.
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch (_) {}
    }
    this._setPseudoFullscreen(!this._pseudoFullscreen);
  }

  _updateFullscreenIcon() {
    const btn = this.shadowRoot.getElementById("fullscreen");
    const icon = btn?.querySelector("ha-icon");
    const active = Boolean(document.fullscreenElement) || this._pseudoFullscreen;
    if (icon) icon.setAttribute("icon", active ? "mdi:fullscreen-exit" : "mdi:fullscreen");
    if (btn) btn.title = active ? "Vollbild beenden" : "Vollbild";
  }

  _styles() {
    return `
      :host { display:block; container-type:inline-size; }
      ha-card { overflow:hidden; }
      button, a { font:inherit; }
      .map-card-shell { position:relative; background:var(--card-background-color); color:var(--primary-text-color); }
      .map-header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 14px 9px; }
      .title-wrap { display:flex; gap:10px; align-items:center; min-width:0; }
      .title-wrap > ha-icon { color:var(--primary-color); --mdc-icon-size:24px; }
      .title { font-weight:700; font-size:17px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .subtitle { color:var(--secondary-text-color); font-size:11px; margin-top:2px; }
      .icon-btn, .tool-btn, .mode-btn, .zoom-controls button, .panel-title button, .focus-btn, .popup-head button, .popup-actions button, .popup-actions a, .panel-actions button {
        border:1px solid var(--divider-color); background:color-mix(in srgb, var(--card-background-color) 92%, var(--primary-color) 8%); color:var(--primary-text-color); border-radius:10px; min-height:36px; display:inline-flex; align-items:center; justify-content:center; gap:6px; cursor:pointer; text-decoration:none;
      }
      .icon-btn { width:38px; padding:0; }
      .toolbar { display:flex; gap:8px; align-items:center; padding:0 12px 10px; overflow-x:auto; scrollbar-width:none; }
      .toolbar::-webkit-scrollbar { display:none; }
      .mode-group { display:flex; gap:4px; padding:3px; border-radius:12px; background:var(--secondary-background-color); flex:0 0 auto; }
      .mode-btn { border:none; min-height:34px; padding:0 11px; background:transparent; }
      .mode-btn.active, .tool-btn.active { background:var(--primary-color); color:var(--text-primary-color, white); box-shadow:0 1px 4px rgba(0,0,0,.18); }
      .mode-btn ha-icon, .tool-btn ha-icon { --mdc-icon-size:18px; }
      .tool-btn { padding:0 10px; white-space:nowrap; }
      .map-wrap { padding:0; }
      .map { height:var(--cardata-map-height, 520px); min-height:330px; position:relative; overflow:hidden; background:#d8dde3; touch-action:none; cursor:grab; user-select:none; outline:none; }
      .map.dragging { cursor:grabbing; }
      .vector-map, .tiles, .poi-markers, .markers { position:absolute; inset:0; overflow:hidden; }
      .vector-map { pointer-events:auto; }
      .tiles, .poi-markers, .markers { pointer-events:none; }
      .vector-map.hidden, .tiles.hidden, .poi-markers.hidden, .markers.hidden { display:none; }
      .vector-map .maplibregl-map, .vector-map .maplibregl-canvas-container { position:absolute; inset:0; width:100%; height:100%; overflow:hidden; }
      .vector-map .maplibregl-canvas { position:absolute; left:0; top:0; display:block; }
      .tile { position:absolute; width:256px; height:256px; max-width:none; pointer-events:none; -webkit-user-drag:none; }
      .vector-map .maplibregl-marker { position:absolute; left:0; top:0; will-change:transform; z-index:20; }
      .poi-charging-grid { margin-top:6px; }
      .poi-markers { z-index:18; overflow:visible; }
      .markers { z-index:20; overflow:visible; }
      .poi-marker, .poi-cluster { position:absolute; left:0; top:0; border:0; padding:0; pointer-events:auto; cursor:pointer; z-index:1; }
      .poi-marker { background:transparent; }
      .poi-marker-core { width:29px; height:29px; border-radius:50%; display:grid; place-items:center; background:var(--accent-color, var(--primary-color)); color:white; border:2px solid white; box-shadow:0 2px 6px rgba(0,0,0,.35); }
      .poi-marker-core ha-icon { --mdc-icon-size:16px; }
      .poi-marker.selected .poi-marker-core { outline:3px solid color-mix(in srgb, var(--primary-color) 30%, transparent); transform:scale(1.08); }
      .poi-cluster { min-width:34px; height:34px; border-radius:18px; padding:0 8px; background:var(--primary-color); color:var(--text-primary-color, white); border:2px solid white; box-shadow:0 2px 7px rgba(0,0,0,.35); font-weight:800; }
      .vehicle-marker { position:absolute; left:0; top:0; border:0; background:transparent; padding:0; pointer-events:auto; cursor:pointer; color:var(--primary-text-color); z-index:2; }
      .marker-core { position:relative; display:grid; place-items:center; width:34px; height:34px; border-radius:50% 50% 50% 0; transform:rotate(-45deg); background:var(--primary-color); color:white; border:2px solid white; box-shadow:0 2px 7px rgba(0,0,0,.35); }
      .marker-core ha-icon { transform:rotate(45deg); --mdc-icon-size:19px; }
      .marker-label { position:absolute; left:50%; top:39px; transform:translateX(-50%); padding:3px 7px; border-radius:8px; background:color-mix(in srgb, var(--card-background-color) 92%, transparent); box-shadow:0 1px 4px rgba(0,0,0,.2); font-size:11px; font-weight:700; white-space:nowrap; }
      .vehicle-marker.selected .marker-core { outline:3px solid color-mix(in srgb, var(--primary-color) 35%, transparent); }
      .marker-pulse { display:none; position:absolute; width:44px; height:44px; left:50%; top:50%; transform:translate(-50%,-50%); border-radius:50%; background:color-mix(in srgb, var(--primary-color) 28%, transparent); }
      .vehicle-marker.following .marker-pulse { display:block; animation:mapPulse 1.8s ease-out infinite; }
      @keyframes mapPulse { 0% { transform:translate(-50%,-50%) scale(.65); opacity:.8; } 100% { transform:translate(-50%,-50%) scale(1.8); opacity:0; } }
      .zoom-controls { position:absolute; z-index:40; left:10px; top:10px; display:flex; flex-direction:column; gap:5px; }
      .zoom-controls button { width:38px; height:38px; min-height:38px; padding:0; background:color-mix(in srgb, var(--card-background-color) 94%, transparent); box-shadow:0 1px 5px rgba(0,0,0,.22); }
      .zoom-controls ha-icon { --mdc-icon-size:20px; }
      .attribution { position:absolute; z-index:30; right:4px; bottom:3px; max-width:80%; padding:2px 5px; background:rgba(255,255,255,.78); color:#333; border-radius:4px; font-size:9px; line-height:1.25; }
      .attribution a { color:#245; text-decoration:none; }
      .vehicle-panel { position:absolute; z-index:60; right:10px; top:10px; width:min(340px,calc(100% - 20px)); max-height:calc(100% - 20px); overflow:auto; box-sizing:border-box; border-radius:13px; background:color-mix(in srgb, var(--card-background-color) 96%, transparent); box-shadow:0 5px 22px rgba(0,0,0,.27); border:1px solid var(--divider-color); padding:10px; user-select:text; }
      .poi-panel { position:absolute; z-index:60; right:10px; top:10px; width:min(310px,calc(100% - 20px)); max-height:calc(100% - 20px); overflow:hidden; box-sizing:border-box; border-radius:13px; background:color-mix(in srgb, var(--card-background-color) 97%, transparent); box-shadow:0 5px 22px rgba(0,0,0,.27); border:1px solid var(--divider-color); padding:0; user-select:text; display:flex; flex-direction:column; }
      .vehicle-panel.hidden, .poi-panel.hidden, .popup.hidden, .poi-popup.hidden { display:none; }
      .panel-title { display:flex; justify-content:space-between; align-items:center; font-weight:700; margin-bottom:7px; }
      .panel-title button, .popup-head button { width:32px; min-height:32px; padding:0; border:none; background:transparent; }
      .poi-mobile-handle { display:none; height:12px; place-items:center; flex:0 0 auto; }
      .poi-mobile-handle span { width:42px; height:4px; border-radius:4px; background:var(--divider-color); }
      .poi-sticky-top, .poi-sticky-bottom { flex:0 0 auto; padding:8px 9px; background:color-mix(in srgb, var(--card-background-color) 98%, transparent); }
      .poi-sticky-top { border-bottom:1px solid var(--divider-color); }
      .poi-sticky-bottom { border-top:1px solid var(--divider-color); }
      .poi-category-scroll { flex:1 1 auto; min-height:54px; overflow:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; padding:7px 9px; scrollbar-width:thin; }
      .poi-vehicle-row { display:grid; grid-template-columns:minmax(0,1fr) 36px; gap:5px; align-items:end; }
      .poi-focus-button { width:36px; min-height:34px; padding:0; border:1px solid var(--divider-color); border-radius:9px; background:color-mix(in srgb, var(--card-background-color) 92%, var(--primary-color) 8%); color:var(--primary-text-color); display:grid; place-items:center; cursor:pointer; }
      .poi-focus-button:disabled { opacity:.45; cursor:default; }
      .poi-focus-button ha-icon { --mdc-icon-size:17px; }
      .poi-filter-section { margin-top:7px; padding-top:7px; border-top:1px solid var(--divider-color); }
      .poi-template-section { margin-top:6px; }
      .poi-category-search-section { margin-top:6px; padding-top:6px; }
      .poi-general-search-section { margin-top:0; padding-top:0; border-top:0; }
      .poi-section-title { margin-bottom:5px; color:var(--secondary-text-color); font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }
      .poi-template-row { display:grid; grid-template-columns:minmax(0,1fr) 34px 34px; gap:4px; }
      .poi-template-row select, .poi-template-row button, .poi-field input, .poi-field select { min-height:32px; box-sizing:border-box; border:1px solid var(--divider-color); border-radius:8px; background:var(--card-background-color); color:var(--primary-text-color); padding:4px 7px; }
      .poi-template-row button { padding:0; display:grid; place-items:center; cursor:pointer; }
      .poi-template-row button:disabled { opacity:.4; cursor:default; }
      .poi-template-row ha-icon { --mdc-icon-size:16px; }
      .poi-filter-grid { display:grid; grid-template-columns:1fr 1fr; gap:5px; }
      .poi-field { display:flex; flex-direction:column; gap:3px; min-width:0; color:var(--secondary-text-color); font-size:9px; font-weight:700; }
      .poi-field input, .poi-field select { width:100%; min-width:0; font-size:11px; }
      .poi-check-row { display:flex; align-items:center; gap:6px; margin-top:6px; font-size:10px; cursor:pointer; }
      .poi-check-row input { width:16px; height:16px; margin:0; }
      .poi-disabled-section { opacity:.58; }
      .poi-category-search { margin-bottom:5px; }
      .poi-selected-chips { display:flex; gap:4px; overflow-x:auto; padding-bottom:2px; scrollbar-width:none; }
      .poi-selected-chips::-webkit-scrollbar { display:none; }
      .poi-selected-chips button { flex:0 0 auto; max-width:180px; min-height:27px; border:1px solid var(--divider-color); border-radius:14px; padding:2px 6px; background:var(--secondary-background-color); color:var(--primary-text-color); display:inline-flex; align-items:center; gap:3px; font-size:9px; cursor:pointer; }
      .poi-selected-chips button span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .poi-selected-chips ha-icon { --mdc-icon-size:13px; color:var(--primary-color); }
      .poi-selected-chips ha-icon:last-child { --mdc-icon-size:12px; color:var(--secondary-text-color); }
      .poi-selected-empty { color:var(--secondary-text-color); font-size:9px; padding:2px 1px; }
      .poi-category-groups { display:flex; flex-direction:column; gap:5px; }
      .poi-category-group { border:1px solid var(--divider-color); border-radius:8px; background:color-mix(in srgb, var(--secondary-background-color) 65%, transparent); overflow:hidden; }
      .poi-category-group > summary { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 8px; cursor:pointer; font-size:10px; font-weight:750; user-select:none; min-height:30px; box-sizing:border-box; }
      .poi-group-label { color:var(--primary-text-color); font-size:10px; font-weight:750; }
      .poi-group-count { color:var(--secondary-text-color); font-size:9px; font-weight:650; }
      .poi-category-group[open] > summary { border-bottom:1px solid var(--divider-color); }
      .poi-category-group-filtered { display:none; }
      .poi-categories { display:grid; grid-template-columns:1fr 1fr; gap:4px; padding:5px; }
      .poi-category-filtered { display:none !important; }
      .poi-category { display:flex; flex-direction:row; align-items:center; gap:5px; padding:6px; border-radius:8px; background:var(--secondary-background-color); color:var(--primary-text-color); font-size:10px; font-weight:600; cursor:pointer; min-width:0; }
      .poi-category span { min-width:0; overflow:hidden; text-overflow:ellipsis; }
      .poi-category input { width:16px; height:16px; margin:0; flex:0 0 auto; }
      .poi-category ha-icon { --mdc-icon-size:15px; color:var(--primary-color); flex:0 0 auto; }
      .poi-radius-label { margin-top:7px; display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:8px; color:var(--secondary-text-color); font-size:10px; font-weight:700; }
      .poi-radius-label select { width:100px; min-height:31px; border:1px solid var(--divider-color); border-radius:8px; background:var(--card-background-color); color:var(--primary-text-color); padding:3px 7px; }
      .poi-actions { display:flex; gap:5px; margin-top:7px; }
      .poi-actions button { flex:1; min-height:32px; border:1px solid var(--divider-color); border-radius:8px; background:color-mix(in srgb, var(--card-background-color) 92%, var(--primary-color) 8%); color:var(--primary-text-color); display:inline-flex; align-items:center; justify-content:center; gap:4px; cursor:pointer; font-size:10px; }
      .poi-actions button:disabled { opacity:.45; cursor:default; }
      .poi-actions ha-icon { --mdc-icon-size:15px; }
      .poi-status { margin-top:6px; padding:6px 7px; border-radius:7px; background:var(--secondary-background-color); font-size:9px; line-height:1.3; }
      .poi-status.warning { background:color-mix(in srgb, var(--warning-color, #f9a825) 14%, transparent); }
      .poi-note { margin-top:5px; color:var(--secondary-text-color); font-size:8px; line-height:1.25; }
      .panel-actions { display:flex; gap:6px; margin-bottom:8px; }
      .panel-actions button { min-height:30px; padding:0 8px; font-size:11px; }
      .vehicle-list { display:flex; flex-direction:column; gap:5px; }
      .vehicle-row { display:flex; align-items:center; gap:6px; border-radius:10px; padding:7px; background:var(--secondary-background-color); }
      .vehicle-row > label { display:flex; align-items:center; gap:8px; flex:1; min-width:0; cursor:pointer; }
      .vehicle-row input { width:18px; height:18px; flex:0 0 auto; }
      .vehicle-row-main { display:flex; flex-direction:column; min-width:0; }
      .vehicle-row-main strong { font-size:13px; }
      .vehicle-row-main small { color:var(--secondary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:10px; margin-top:2px; }
      .vehicle-row.invalid { opacity:.55; }
      .focus-btn { width:32px; min-height:32px; padding:0; }
      .focus-btn ha-icon { --mdc-icon-size:17px; }
      .panel-empty { padding:12px; color:var(--secondary-text-color); font-size:12px; text-align:center; }
      .popup, .poi-popup { position:absolute; z-index:55; box-sizing:border-box; border-radius:13px; background:color-mix(in srgb, var(--card-background-color) 97%, transparent); border:1px solid var(--divider-color); box-shadow:0 5px 22px rgba(0,0,0,.28); padding:11px; user-select:text; }
      .popup-head { display:flex; justify-content:space-between; gap:8px; font-size:12px; line-height:1.35; }
      .popup-head strong { font-size:14px; display:flex; align-items:center; gap:5px; margin-bottom:2px; }
      .popup-head strong ha-icon { --mdc-icon-size:17px; color:var(--primary-color); }
      .popup-head > div > div { color:var(--secondary-text-color); }
      .popup-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:9px; }
      .popup-grid > div { display:flex; flex-direction:column; padding:6px 8px; background:var(--secondary-background-color); border-radius:8px; }
      .popup-grid span { font-size:9px; color:var(--secondary-text-color); }
      .popup-grid strong { font-size:12px; margin-top:1px; }
      .popup-actions { display:flex; gap:6px; margin-top:9px; }
      .popup-actions button, .popup-actions a { min-height:34px; padding:0 9px; font-size:11px; flex:1; }
      .popup-actions ha-icon { --mdc-icon-size:17px; }
      .poi-popup-meta { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
      .poi-popup-meta span { padding:4px 7px; border-radius:8px; background:var(--secondary-background-color); font-size:10px; }
      .poi-details { margin-top:7px; color:var(--secondary-text-color); font-size:10px; line-height:1.4; }
      .poi-contact { display:flex; gap:8px; flex-wrap:wrap; margin-top:7px; font-size:10px; }
      .poi-contact span, .poi-contact a { display:inline-flex; align-items:center; gap:4px; color:var(--secondary-text-color); text-decoration:none; }
      .poi-contact ha-icon { --mdc-icon-size:14px; color:var(--primary-color); }
      .poi-popup-actions { flex-wrap:wrap; }
      .poi-popup-actions a { min-width:90px; }
      .map-empty { display:none; position:absolute; z-index:35; left:50%; top:50%; transform:translate(-50%,-50%); width:min(420px,calc(100% - 36px)); box-sizing:border-box; padding:14px 16px; border-radius:12px; background:color-mix(in srgb, var(--card-background-color) 94%, transparent); box-shadow:0 2px 12px rgba(0,0,0,.2); text-align:center; font-size:12px; color:var(--secondary-text-color); }
      .map-empty.show { display:block; }
      :host(.pseudo-fullscreen) { position:fixed !important; inset:0 !important; z-index:99999 !important; width:100vw !important; height:100dvh !important; background:var(--card-background-color); }
      :host(.pseudo-fullscreen) ha-card, :host(:fullscreen) ha-card { height:100%; border-radius:0; }
      :host(.pseudo-fullscreen) .map-card-shell, :host(:fullscreen) .map-card-shell { height:100%; display:flex; flex-direction:column; }
      :host(.pseudo-fullscreen) .map-wrap, :host(:fullscreen) .map-wrap { flex:1; min-height:0; }
      :host(.pseudo-fullscreen) .map, :host(:fullscreen) .map { height:100% !important; min-height:0; }
      :host(:fullscreen) { background:var(--card-background-color); }
      @container (max-width: 560px) {
        .map { height:max(620px, calc(100dvh - 120px)); max-height:780px; }
        .subtitle { display:none; }
        .tool-btn span { display:none; }
        .tool-btn { width:38px; padding:0; }
        .mode-btn { padding:0 9px; }
        .map-header { padding:10px 10px 7px; }
        .toolbar { padding:0 8px 8px; }
        .popup, .poi-popup { left:8px !important; right:8px; width:auto !important; }
        .poi-panel { position:absolute; z-index:100; left:0; right:0; bottom:0; top:auto; width:100%; max-height:94%; border-radius:17px 17px 0 0; padding:0 0 env(safe-area-inset-bottom, 0px); }
        .poi-mobile-handle { display:grid; }
        .poi-sticky-top, .poi-sticky-bottom { padding-left:10px; padding-right:10px; }
        .poi-category-scroll { padding-left:10px; padding-right:10px; min-height:80px; max-height:28dvh; }
        .poi-template-row select, .poi-template-row button, .poi-field input, .poi-field select, .poi-focus-button, .poi-radius-label select, .poi-actions button { min-height:44px; }
        .panel-title button { width:44px; min-height:44px; }
        .poi-template-row { grid-template-columns:minmax(0,1fr) 44px 44px; }
        .poi-vehicle-row { grid-template-columns:minmax(0,1fr) 44px; }
        .poi-categories { grid-template-columns:1fr; }
        .poi-category { min-height:42px; padding:7px 9px; font-size:11px; }
        .poi-category-group > summary { min-height:42px; font-size:11px; }
        .poi-group-label { font-size:11px; }
        .poi-selected-chips button { min-height:34px; }
        .poi-filter-grid { grid-template-columns:1fr 1fr; }
        .poi-note { font-size:7.5px; }
      }
    `;
  }
}

if (!customElements.get(MAP_CARD_TAG)) customElements.define(MAP_CARD_TAG, CardataAnalyticsMapCard);
if (!window.customCards.some((c) => c.type === MAP_CARD_TAG)) {
  window.customCards.push({
    type: MAP_CARD_TAG,
    name: "Cardata Vehicle Map",
    description: "Interactive map for all GPS-enabled vehicles in Cardata Analytics.",
    preview: true,
  });
}
