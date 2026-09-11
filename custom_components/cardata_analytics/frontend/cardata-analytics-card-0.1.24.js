const DOMAIN = "cardata_analytics";
const CARD_TAG = "cardata-analytics-card";
const CARD_VERSION = "0.1.24";

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
    this._lastTileSignature = null;
    this._storageKey = "cardata_analytics_map_card_v1";

    // POIs are opt-in. Queries are debounced, rate-limited and cached locally
    // so public Overpass infrastructure is never polled continuously.
    this._poiCategories = new Set();
    this._poiRadiusKm = 5;
    this._poiResults = [];
    this._poiSourceVehicleId = null;
    this._poiSourceLat = null;
    this._poiSourceLon = null;
    this._poiLoading = false;
    this._poiError = "";
    this._poiFetchTimer = null;
    this._poiLastNetworkAt = 0;
    this._poiBackoffUntil = 0;
    this._poiRequestToken = 0;
    this._selectedPoiId = null;
    this._poiCacheTtlMs = 15 * 60 * 1000;
    this._poiMaxResults = 500;
    this._poiRequestTimeoutMs = 35000;
    this._poiLastEndpoint = "";
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
    this._poiRequestToken += 1;
  }

  set hass(hass) {
    this._hass = hass;
    this._ensureRegistrySubscriptions();
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
      charging: {
        label: "Ladestationen",
        icon: "mdi:ev-station",
        clauses: ['["amenity"="charging_station"]'],
      },
      workshop: {
        label: "Werkstätten",
        icon: "mdi:wrench",
        clauses: ['["shop"="car_repair"]', '["craft"="car_repair"]'],
      },
      restaurant: {
        label: "Restaurants",
        icon: "mdi:silverware-fork-knife",
        clauses: ['["amenity"="restaurant"]'],
      },
      cafe: {
        label: "Cafés",
        icon: "mdi:coffee",
        clauses: ['["amenity"="cafe"]'],
      },
      parking: {
        label: "Parkplätze",
        icon: "mdi:parking",
        clauses: ['["amenity"="parking"]'],
      },
      supermarket: {
        label: "Supermärkte",
        icon: "mdi:cart-outline",
        clauses: ['["shop"="supermarket"]'],
      },
      hotel: {
        label: "Hotels",
        icon: "mdi:bed",
        clauses: ['["tourism"="hotel"]'],
      },
      pharmacy: {
        label: "Apotheken",
        icon: "mdi:pharmacy",
        clauses: ['["amenity"="pharmacy"]', '["healthcare"="pharmacy"]'],
      },
      hospital: {
        label: "Krankenhäuser",
        icon: "mdi:hospital-building",
        clauses: ['["amenity"="hospital"]', '["healthcare"="hospital"]'],
      },
      toilets: {
        label: "Toiletten",
        icon: "mdi:human-male-female",
        clauses: ['["amenity"="toilets"]'],
      },
    };
  }

  _poiCategoryForTags(tags = {}) {
    if (tags.amenity === "charging_station") return "charging";
    if (tags.shop === "car_repair" || tags.craft === "car_repair") return "workshop";
    if (tags.amenity === "restaurant") return "restaurant";
    if (tags.amenity === "cafe") return "cafe";
    if (tags.amenity === "parking") return "parking";
    if (tags.shop === "supermarket") return "supermarket";
    if (tags.tourism === "hotel") return "hotel";
    if (tags.amenity === "pharmacy" || tags.healthcare === "pharmacy") return "pharmacy";
    if (tags.amenity === "hospital" || tags.healthcare === "hospital") return "hospital";
    if (tags.amenity === "toilets") return "toilets";
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
    return parts.join(", ") || null;
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
    return `${this._storageKey}:poi-cache-v5`;
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
    return [vehicle.lat.toFixed(3), vehicle.lon.toFixed(3), this._poiRadiusKm, categories].join("|");
  }

  _schedulePoiLoad(delay = 750, force = false) {
    // Invalidate an in-flight response as soon as a newer filter/radius/vehicle
    // selection is scheduled, not only when the replacement request starts.
    this._poiRequestToken += 1;
    if (this._poiFetchTimer) clearTimeout(this._poiFetchTimer);
    this._poiFetchTimer = setTimeout(() => {
      this._poiFetchTimer = null;
      this._loadPois(force);
    }, delay);
  }

  _buildOverpassQuery(vehicle) {
    const defs = this._poiDefinitions();
    const radiusM = Math.max(500, Math.round(this._poiRadiusKm * 1000));
    const around = `(around:${radiusM},${vehicle.lat.toFixed(6)},${vehicle.lon.toFixed(6)})`;
    const clauses = [];
    for (const key of [...this._poiCategories].sort()) {
      const def = defs[key];
      if (!def) continue;
      for (const filter of def.clauses) clauses.push(`nwr${filter}${around};`);
    }
    const queryTimeout = Math.max(10, Math.floor(this._poiRequestTimeoutMs / 1000) - 5);
    return `[out:json][timeout:${queryTimeout}];(${clauses.join("")});out center qt ${this._poiMaxResults};`;
  }

  _overpassEndpoints() {
    const configuredEndpoint = typeof this._config.overpass_url === "string" ? this._config.overpass_url.trim() : "";
    if (configuredEndpoint) return [configuredEndpoint];
    return [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://overpass.private.coffee/api/interpreter",
    ];
  }

  _overpassEndpointLabel(endpoint) {
    try {
      return new URL(endpoint).hostname;
    } catch (_) {
      return endpoint;
    }
  }

  async _fetchOverpassDirect(query) {
    const endpoints = this._overpassEndpoints();
    const failures = [];
    for (const endpoint of endpoints) {
      if (!/^https:\/\//i.test(endpoint)) {
        failures.push(`${endpoint}: HTTPS erforderlich`);
        continue;
      }

      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), this._poiRequestTimeoutMs)
        : null;
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller?.signal,
          cache: "no-store",
          credentials: "omit",
        });
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}`);
          error.status = response.status;
          if (response.status === 400) throw error;
          failures.push(`${this._overpassEndpointLabel(endpoint)}: HTTP ${response.status}`);
          if (response.status === 429 || response.status === 406) {
            this._poiBackoffUntil = Math.max(this._poiBackoffUntil, Date.now() + 30000);
          }
          continue;
        }
        const payload = await response.json();
        this._poiLastEndpoint = endpoint;
        return payload;
      } catch (err) {
        if (err?.status === 400) throw new Error(`Overpass-Abfrage ungültig (${err.message})`);
        const reason = err?.name === "AbortError"
          ? `Timeout nach ${Math.round(this._poiRequestTimeoutMs / 1000)} s`
          : (err?.message || String(err));
        failures.push(`${this._overpassEndpointLabel(endpoint)}: ${reason}`);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }
    throw new Error(failures.length ? failures.join(" · ") : "Kein Overpass-Endpunkt verfügbar");
  }

  async _fetchOverpass(vehicle, query) {
    // Always route POI requests through Home Assistant. Older releases allowed
    // `overpass_url` to switch back to a browser-direct request, which made the
    // card vulnerable to CORS/WebView/network-policy differences. Keep the
    // legacy option harmless rather than silently re-enabling that path.
    if (!this._hass?.callWS) {
      throw new Error("Home-Assistant-WebSocket ist nicht verfügbar");
    }

    try {
      const result = await this._hass.callWS({
        type: "cardata_analytics/poi",
        latitude: vehicle.lat,
        longitude: vehicle.lon,
        radius_km: this._poiRadiusKm,
        categories: [...this._poiCategories],
        max_results: this._poiMaxResults,
        timeout_seconds: Math.round(this._poiRequestTimeoutMs / 1000),
      });
      if (!result || !Array.isArray(result.elements)) {
        throw new Error("ungültige Antwort vom Cardata-Analytics-Backend");
      }
      this._poiLastEndpoint = result.endpoint || "Home Assistant";
      return { elements: result.elements };
    } catch (err) {
      const message = err?.message || String(err);
      if (/unknown command|unknown_command|not found/i.test(message)) {
        throw new Error("POI-Backend noch nicht aktiv – Home Assistant nach dem Update vollständig neu starten");
      }
      throw new Error(`Home-Assistant-POI-Proxy: ${message}`);
    }
  }

  async _loadPois(force = false) {
    const vehicle = this._selectedVehicle() || this._visibleVehicles()[0] || null;
    if (!this._poiCategories.size) {
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

    const cacheKey = this._poiCacheKey(vehicle);
    if (!force) {
      const cache = this._readPoiCache();
      const cached = cache[cacheKey];
      if (cached && Date.now() - Number(cached.timestamp) <= this._poiCacheTtlMs
          && Array.isArray(cached.results) && cached.results.length > 0) {
        this._poiResults = cached.results;
        this._poiSourceVehicleId = vehicle.deviceId;
        this._poiSourceLat = vehicle.lat;
        this._poiSourceLon = vehicle.lon;
        this._poiError = "";
        this._poiLoading = false;
        this._renderPoiPanel();
        this._renderMap(false);
        return;
      }
    }

    const now = Date.now();
    const earliest = Math.max(this._poiLastNetworkAt + 5000, this._poiBackoffUntil);
    if (now < earliest) {
      this._poiLoading = true;
      const waitSeconds = Math.max(1, Math.ceil((earliest - now) / 1000));
      this._poiError = `POI-Abfrage wird in ${waitSeconds} s fortgesetzt …`;
      this._renderPoiPanel();
      this._schedulePoiLoad(earliest - now + 100, force);
      return;
    }

    const token = ++this._poiRequestToken;
    this._poiLoading = true;
    this._poiError = "";
    this._renderPoiPanel();
    this._poiLastNetworkAt = Date.now();

    try {
      const query = this._buildOverpassQuery(vehicle);
      const payload = await this._fetchOverpass(vehicle, query);
      if (token !== this._poiRequestToken) return;
      const seen = new Set();
      const results = [];
      for (const element of payload?.elements || []) {
        const coords = this._poiCoordinates(element);
        if (!coords) continue;
        const tags = element.tags || {};
        const category = this._poiCategoryForTags(tags);
        if (!category || !this._poiCategories.has(category)) continue;
        const id = `${element.type || "osm"}:${element.id}`;
        if (seen.has(id)) continue;
        seen.add(id);
        results.push({
          id,
          osmType: String(element.type || ""),
          osmId: Number(element.id),
          lat: coords.lat,
          lon: coords.lon,
          category,
          name: this._poiName(tags, category),
          address: this._poiAddress(tags),
          operator: tags.operator || null,
          brand: tags.brand || null,
          openingHours: tags.opening_hours || null,
          capacity: tags.capacity || null,
          phone: tags.phone || tags["contact:phone"] || null,
          website: this._safeWebUrl(tags.website || tags["contact:website"] || null),
          access: tags.access || null,
          fee: tags.fee || null,
          connectors: category === "charging" ? this._poiConnectorDetails(tags) : [],
        });
      }
      results.sort((a, b) => this._distanceKm(vehicle.lat, vehicle.lon, a.lat, a.lon)
        - this._distanceKm(vehicle.lat, vehicle.lon, b.lat, b.lon));
      this._poiResults = results.slice(0, this._poiMaxResults);
      this._poiSourceVehicleId = vehicle.deviceId;
      this._poiSourceLat = vehicle.lat;
      this._poiSourceLon = vehicle.lon;
      this._poiError = results.length >= this._poiMaxResults
        ? `Die Anzeige ist auf ${this._poiMaxResults} POIs begrenzt. Radius oder Filter ggf. verkleinern.`
        : "";
      this._poiLoading = false;
      const cache = this._readPoiCache();
      if (this._poiResults.length > 0) {
        cache[cacheKey] = { timestamp: Date.now(), results: this._poiResults };
      } else {
        delete cache[cacheKey];
      }
      this._writePoiCache(cache);
    } catch (err) {
      if (token !== this._poiRequestToken) return;
      this._poiLoading = false;
      this._poiError = `POIs konnten nicht geladen werden: ${err?.message || err}`;
    }
    this._renderPoiPanel();
    this._renderMap(false);
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
      if ([2, 5, 10, 25, 50].includes(Number(data.poiRadiusKm))) this._poiRadiusKm = Number(data.poiRadiusKm);
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
    const map = this.shadowRoot.getElementById("map");
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
      if (panel && !panel.classList.contains("hidden")) this._renderPoiPanel();
    });
    this.shadowRoot.getElementById("fullscreen")?.addEventListener("click", () => this._toggleFullscreen());

    map?.addEventListener("pointerdown", (ev) => this._startDrag(ev));
    map?.addEventListener("pointermove", (ev) => this._moveDrag(ev));
    map?.addEventListener("pointerup", (ev) => this._endDrag(ev));
    map?.addEventListener("pointercancel", (ev) => this._endDrag(ev));
    map?.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      this._changeZoom(ev.deltaY < 0 ? 1 : -1);
    }, { passive: false });
    map?.addEventListener("dblclick", (ev) => {
      ev.preventDefault();
      this._changeZoom(1);
    });

    document.addEventListener("fullscreenchange", () => {
      this._updateFullscreenIcon();
      setTimeout(() => this._renderMap(), 60);
    }, { signal: this._eventSignal() });
  }

  _eventSignal() {
    if (this._eventController) this._eventController.abort();
    this._eventController = new AbortController();
    return this._eventController.signal;
  }

  _setMode(mode) {
    if (!["osm", "topo", "satellite", "gps"].includes(mode)) return;
    if (mode === "gps") {
      this._mode = "gps";
      const v = this._selectedVehicle() || this._visibleVehicles()[0];
      if (v) this._center = { lat: v.lat, lon: v.lon };
      this._zoom = Math.max(this._zoom, 15);
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

      // A user-supplied provider still takes precedence. If only half of a
      // custom provider is configured, surface the configuration error instead
      // of silently falling back to another provider.
      if (customUrl || customAttribution) {
        if (!validTemplate || !customAttribution) {
          return {
            id: "satellite-custom-invalid",
            url: null,
            maxZoom: Math.max(2, Math.min(22, Number(this._config.satellite_max_zoom) || 19)),
            attribution: "",
            unavailableMessage: "Ungültige Satelliten-Konfiguration. satellite_url muss HTTPS mit {z}/{x}/{y} enthalten und satellite_attribution muss gesetzt sein.",
          };
        }
        return {
          id: `satellite-custom:${customUrl}`,
          url: (z, x, y) => customUrl.split("{z}").join(String(z)).split("{x}").join(String(x)).split("{y}").join(String(y)),
          maxZoom: Math.max(2, Math.min(22, Number(this._config.satellite_max_zoom) || 19)),
          attribution: this._esc(customAttribution),
        };
      }

      // Same key-free World Imagery tile endpoint used by the supplied Bosch
      // eBike map card. Keep the provider replaceable through satellite_url /
      // satellite_attribution and show the required imagery source attribution.
      return {
        id: "satellite-esri-world-imagery",
        url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
        maxZoom: Math.max(2, Math.min(22, Number(this._config.satellite_max_zoom) || 19)),
        attribution: "Tiles © Esri · Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
      };
    }
    if (effectiveMode === "topo") {
      return {
        id: "topo",
        url: (z, x, y) => `https://${["a", "b", "c"][(x + y) % 3]}.tile.opentopomap.org/${z}/${x}/${y}.png`,
        maxZoom: 17,
        attribution: `Kartendaten © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · Darstellung © <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a>`,
      };
    }
    return {
      id: "osm",
      url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
      maxZoom: 19,
      attribution: `© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>`,
    };
  }

  _renderMap(forceTiles = false) {
    if (!this._domBuilt) return;
    const map = this.shadowRoot.getElementById("map");
    const tiles = this.shadowRoot.getElementById("tiles");
    const markers = this.shadowRoot.getElementById("markers");
    if (!map || !tiles || !markers) return;

    if (this._mode === "gps") {
      const selected = this._selectedVehicle() || this._visibleVehicles()[0];
      if (selected) {
        this._selectedVehicleId = selected.deviceId;
        this._center = { lat: selected.lat, lon: selected.lon };
      }
    }

    const provider = this._tileProvider();
    if (this._zoom > provider.maxZoom) this._zoom = provider.maxZoom;

    const rect = map.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const centerWorld = this._latLonToWorld(this._center.lat, this._center.lon, this._zoom);
    const topLeft = { x: centerWorld.x - width / 2, y: centerWorld.y - height / 2 };
    const n = 2 ** this._zoom;
    const minX = Math.floor(topLeft.x / this._tileSize) - 1;
    const maxX = Math.floor((topLeft.x + width) / this._tileSize) + 1;
    const minY = Math.max(0, Math.floor(topLeft.y / this._tileSize) - 1);
    const maxY = Math.min(n - 1, Math.floor((topLeft.y + height) / this._tileSize) + 1);
    const tileSignature = `${provider.id}|${this._zoom}|${minX}|${maxX}|${minY}|${maxY}|${width}|${height}`;

    if (forceTiles || tileSignature !== this._lastTileSignature) {
      const frag = document.createDocumentFragment();
      if (provider.url) {
        for (let ty = minY; ty <= maxY; ty++) {
          for (let tx = minX; tx <= maxX; tx++) {
            const wrappedX = ((tx % n) + n) % n;
            const img = document.createElement("img");
            img.className = "tile";
            img.alt = "";
            img.draggable = false;
            img.decoding = "async";
            img.loading = "eager";
            img.dataset.tx = String(tx);
            img.dataset.ty = String(ty);
            img.src = provider.url(this._zoom, wrappedX, ty);
            frag.appendChild(img);
          }
        }
      }
      tiles.replaceChildren(frag);
      this._lastTileSignature = tileSignature;
    }
    for (const img of tiles.children) {
      const tx = Number(img.dataset.tx);
      const ty = Number(img.dataset.ty);
      img.style.transform = `translate(${Math.round(tx * this._tileSize - topLeft.x)}px, ${Math.round(ty * this._tileSize - topLeft.y)}px)`;
    }

    const visible = this._visibleVehicles();
    const markerFrag = document.createDocumentFragment();
    for (const v of visible) {
      const p = this._latLonToWorld(v.lat, v.lon, this._zoom);
      let dx = p.x - topLeft.x;
      const worldSize = this._tileSize * n;
      if (dx < -worldSize / 2) dx += worldSize;
      if (dx > worldSize / 2) dx -= worldSize;
      const dy = p.y - topLeft.y;
      if (dx < -80 || dx > width + 80 || dy < -80 || dy > height + 80) continue;
      const marker = document.createElement("button");
      marker.className = `vehicle-marker${v.deviceId === this._selectedVehicleId ? " selected" : ""}${this._mode === "gps" && v.deviceId === this._selectedVehicleId ? " following" : ""}`;
      marker.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px) translate(-50%, -50%)`;
      marker.dataset.vehicleId = v.deviceId;
      marker.title = v.name;
      marker.innerHTML = `<span class="marker-pulse"></span><span class="marker-core"><ha-icon icon="mdi:car-electric"></ha-icon></span><span class="marker-label">${this._esc(v.name)}</span>`;
      marker.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this._selectedVehicleId = v.deviceId;
        if (this._mode === "gps") this._center = { lat: v.lat, lon: v.lon };
        this._savePreferences();
        this.shadowRoot?.getElementById("poi-popup")?.classList.add("hidden");
        this._showPopup(v.deviceId);
        this._renderMap();
        this._renderVehiclePanel();
        this._renderPoiPanel();
        if (this._poiCategories.size && this._poiSourceVehicleId !== v.deviceId) this._schedulePoiLoad(500, false);
      });
      markerFrag.appendChild(marker);
    }
    markers.replaceChildren(markerFrag);
    this._renderPoiMarkers(topLeft, width, height, n);

    const empty = this.shadowRoot.getElementById("map-empty");
    const allGpsVehicles = this._vehicles().filter((v) => v.valid);
    if (empty) {
      if (provider.unavailableMessage) {
        empty.textContent = provider.unavailableMessage;
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

    const attribution = this.shadowRoot.getElementById("attribution");
    if (attribution) attribution.innerHTML = provider.attribution;
    this._positionPopup();
    this._positionPoiPopup();
  }

  _fitVisibleVehicles(save = true) {
    const vehicles = this._visibleVehicles();
    if (!vehicles.length) {
      this._renderMap(true);
      return;
    }
    if (vehicles.length === 1) {
      this._center = { lat: vehicles[0].lat, lon: vehicles[0].lon };
      this._zoom = 15;
      this._selectedVehicleId = vehicles[0].deviceId;
      if (this._mode === "gps") this._mode = this._lastFreeMode;
      if (save) this._savePreferences();
      this._updateControls();
      this._renderMap(true);
      return;
    }

    const map = this.shadowRoot.getElementById("map");
    const rect = map?.getBoundingClientRect();
    const width = Math.max(300, rect?.width || 800);
    const height = Math.max(250, rect?.height || 500);
    const minLat = Math.min(...vehicles.map((v) => v.lat));
    const maxLat = Math.max(...vehicles.map((v) => v.lat));
    const minLon = Math.min(...vehicles.map((v) => v.lon));
    const maxLon = Math.max(...vehicles.map((v) => v.lon));
    this._center = { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };

    let bestZoom = 2;
    for (let z = 17; z >= 2; z--) {
      const nw = this._latLonToWorld(maxLat, minLon, z);
      const se = this._latLonToWorld(minLat, maxLon, z);
      const spanX = Math.abs(se.x - nw.x);
      const spanY = Math.abs(se.y - nw.y);
      if (spanX <= width - 120 && spanY <= height - 140) {
        bestZoom = z;
        break;
      }
    }
    this._zoom = bestZoom;
    if (this._mode === "gps") this._mode = this._lastFreeMode;
    if (save) this._savePreferences();
    this._updateControls();
    this._renderMap(true);
  }

  _updateFromHass() {
    const selected = this._selectedVehicle();
    if (this._mode === "gps" && selected) this._center = { lat: selected.lat, lon: selected.lon };
    if (selected && this._poiCategories.size && this._poiSourceVehicleId === selected.deviceId
        && Number.isFinite(this._poiSourceLat) && Number.isFinite(this._poiSourceLon)
        && this._distanceKm(this._poiSourceLat, this._poiSourceLon, selected.lat, selected.lon) >= 0.5) {
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
        const id = btn.dataset.focus;
        const v = vehicles.find((item) => item.deviceId === id && item.valid);
        if (!v) return;
        this._hiddenVehicles.delete(id);
        this._selectedVehicleId = id;
        this._center = { lat: v.lat, lon: v.lon };
        this._zoom = Math.max(this._zoom, 15);
        this._mode = "gps";
        this._savePreferences();
        this._updateControls();
        this._renderVehiclePanel();
        this._renderPoiPanel();
        this.shadowRoot?.getElementById("poi-popup")?.classList.add("hidden");
        this._showPopup(id);
        this._renderMap(true);
        if (this._poiCategories.size) this._schedulePoiLoad(500, false);
      });
    });
  }

  _renderPoiPanel() {
    const panel = this.shadowRoot?.getElementById("poi-panel");
    if (!panel) return;
    const defs = this._poiDefinitions();
    const vehicle = this._selectedVehicle() || this._visibleVehicles()[0] || null;
    const count = this._poiResults.filter((poi) => this._poiCategories.has(poi.category)).length;
    const selected = [...this._poiCategories];
    const status = this._poiLoading
      ? "POIs werden über Home Assistant geladen …"
      : this._poiError
        ? this._poiError
        : selected.length
          ? `${count} POI${count === 1 ? "" : "s"} geladen${this._poiLastEndpoint ? ` · ${this._overpassEndpointLabel(this._poiLastEndpoint)}` : ""}`
          : "POI-Suche ist ausgeschaltet.";

    panel.innerHTML = `
      <div class="panel-title"><span>Points of Interest</span><button id="poi-panel-close" aria-label="Schließen"><ha-icon icon="mdi:close"></ha-icon></button></div>
      <div class="poi-center"><ha-icon icon="mdi:car-electric"></ha-icon><span>${vehicle ? `Um ${this._esc(vehicle.name)}` : "Kein Fahrzeug mit GPS verfügbar"}</span></div>
      <div class="poi-categories">
        ${Object.entries(defs).map(([key, def]) => `
          <label class="poi-category">
            <input type="checkbox" data-poi-category="${this._esc(key)}" ${this._poiCategories.has(key) ? "checked" : ""}>
            <ha-icon icon="${this._esc(def.icon)}"></ha-icon>
            <span>${this._esc(def.label)}</span>
          </label>`).join("")}
      </div>
      <label class="poi-radius-label">Umkreis
        <select id="poi-radius">
          ${[2, 5, 10, 25, 50].map((km) => `<option value="${km}" ${this._poiRadiusKm === km ? "selected" : ""}>${km} km</option>`).join("")}
        </select>
      </label>
      <div class="poi-actions">
        <button id="poi-refresh" ${!selected.length || !vehicle || this._poiLoading ? "disabled" : ""}><ha-icon icon="mdi:refresh"></ha-icon> Aktualisieren</button>
        <button id="poi-clear" ${!selected.length && !count ? "disabled" : ""}><ha-icon icon="mdi:map-marker-off-outline"></ha-icon> Aus</button>
      </div>
      <div class="poi-status ${this._poiError ? "warning" : ""}">${this._esc(status)}</div>
      <div class="poi-note">POI-Daten © OpenStreetMap-Mitwirkende · Abfrage über Home Assistant / Overpass API · Cardata ${CARD_VERSION}.</div>`;

    panel.querySelector("#poi-panel-close")?.addEventListener("click", () => panel.classList.add("hidden"));
    panel.querySelectorAll("[data-poi-category]").forEach((input) => {
      input.addEventListener("change", () => {
        const key = input.dataset.poiCategory;
        if (input.checked) this._poiCategories.add(key);
        else this._poiCategories.delete(key);
        this._savePreferences();
        this._selectedPoiId = null;
        this.shadowRoot?.getElementById("poi-popup")?.classList.add("hidden");
        if (!this._poiCategories.size) {
          this._poiRequestToken += 1;
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
        this._schedulePoiLoad(800, false);
      });
    });
    panel.querySelector("#poi-radius")?.addEventListener("change", (ev) => {
      this._poiRadiusKm = Number(ev.target.value) || 5;
      this._savePreferences();
      if (this._poiCategories.size) {
        this._poiLoading = true;
        this._poiError = "";
        this._renderPoiPanel();
        this._schedulePoiLoad(500, false);
      }
    });
    panel.querySelector("#poi-refresh")?.addEventListener("click", () => this._schedulePoiLoad(0, true));
    panel.querySelector("#poi-clear")?.addEventListener("click", () => {
      this._poiRequestToken += 1;
      this._poiCategories.clear();
      this._poiResults = [];
      this._poiSourceVehicleId = null;
      this._poiSourceLat = null;
      this._poiSourceLon = null;
      this._poiError = "";
      this._poiLoading = false;
      this._selectedPoiId = null;
      this._savePreferences();
      this.shadowRoot?.getElementById("poi-popup")?.classList.add("hidden");
      this._renderPoiPanel();
      this._renderMap(false);
      this._updateControls();
    });
  }

  _renderPoiMarkers(topLeft, width, height, n) {
    const layer = this.shadowRoot?.getElementById("poi-markers");
    if (!layer) return;
    const vehicle = this._selectedVehicle() || this._visibleVehicles()[0] || null;
    if (!this._poiCategories.size || !vehicle || this._poiSourceVehicleId !== vehicle.deviceId) {
      layer.replaceChildren();
      return;
    }

    const defs = this._poiDefinitions();
    const worldSize = this._tileSize * n;
    const points = [];
    for (const poi of this._poiResults) {
      if (!this._poiCategories.has(poi.category)) continue;
      const p = this._latLonToWorld(poi.lat, poi.lon, this._zoom);
      let x = p.x - topLeft.x;
      if (x < -worldSize / 2) x += worldSize;
      if (x > worldSize / 2) x -= worldSize;
      const y = p.y - topLeft.y;
      if (x < -60 || x > width + 60 || y < -60 || y > height + 60) continue;
      points.push({ poi, x, y });
    }

    const gridSize = this._zoom >= 18 ? 34 : this._zoom >= 16 ? 46 : 58;
    const buckets = new Map();
    for (const point of points) {
      const key = `${Math.floor(point.x / gridSize)}:${Math.floor(point.y / gridSize)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(point);
    }

    const frag = document.createDocumentFragment();
    for (const group of buckets.values()) {
      if (group.length > 1) {
        const avgX = group.reduce((sum, item) => sum + item.x, 0) / group.length;
        const avgY = group.reduce((sum, item) => sum + item.y, 0) / group.length;
        const avgLat = group.reduce((sum, item) => sum + item.poi.lat, 0) / group.length;
        const avgLon = group.reduce((sum, item) => sum + item.poi.lon, 0) / group.length;
        const btn = document.createElement("button");
        btn.className = "poi-cluster";
        btn.style.transform = `translate(${Math.round(avgX)}px, ${Math.round(avgY)}px) translate(-50%, -50%)`;
        btn.title = `${group.length} POIs`;
        btn.textContent = String(group.length);
        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this._center = { lat: avgLat, lon: avgLon };
          this._zoom = Math.min(this._tileProvider().maxZoom, this._zoom + 2);
          if (this._mode === "gps") this._mode = this._lastFreeMode;
          this._savePreferences();
          this._updateControls();
          this._renderMap(true);
        });
        frag.appendChild(btn);
        continue;
      }

      const { poi, x, y } = group[0];
      const def = defs[poi.category] || { icon: "mdi:map-marker" };
      const btn = document.createElement("button");
      btn.className = `poi-marker${poi.id === this._selectedPoiId ? " selected" : ""}`;
      btn.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`;
      btn.dataset.poiId = poi.id;
      btn.title = poi.name;
      btn.innerHTML = `<span class="poi-marker-core"><ha-icon icon="${this._esc(def.icon)}"></ha-icon></span>`;
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this._selectedPoiId = poi.id;
        this._showPoiPopup(poi.id);
        this._renderMap(false);
      });
      frag.appendChild(btn);
    }
    layer.replaceChildren(frag);
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
      poi.openingHours ? `Öffnung: ${poi.openingHours}` : null,
      poi.capacity ? `Kapazität: ${poi.capacity}` : null,
      poi.access ? `Zugang: ${poi.access}` : null,
      poi.fee ? `Gebühr: ${poi.fee}` : null,
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
    const map = this.shadowRoot?.getElementById("map");
    if (!popup || !map || popup.classList.contains("hidden")) return;
    const poi = this._poiResults.find((item) => item.id === this._selectedPoiId);
    if (!poi) {
      popup.classList.add("hidden");
      return;
    }
    const rect = map.getBoundingClientRect();
    const centerWorld = this._latLonToWorld(this._center.lat, this._center.lon, this._zoom);
    const topLeft = { x: centerWorld.x - rect.width / 2, y: centerWorld.y - rect.height / 2 };
    const p = this._latLonToWorld(poi.lat, poi.lon, this._zoom);
    let x = p.x - topLeft.x;
    const worldSize = this._tileSize * (2 ** this._zoom);
    if (x < -worldSize / 2) x += worldSize;
    if (x > worldSize / 2) x -= worldSize;
    const y = p.y - topLeft.y;
    const popupWidth = Math.min(350, Math.max(270, rect.width - 24));
    popup.style.width = `${popupWidth}px`;
    const left = Math.max(12, Math.min(rect.width - popupWidth - 12, x - popupWidth / 2));
    const top = y > rect.height * 0.58 ? Math.max(12, y - 215) : Math.min(rect.height - 205, y + 28);
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
      this._mode = "gps";
      this._center = { lat: v.lat, lon: v.lon };
      this._zoom = Math.max(this._zoom, 15);
      this._savePreferences();
      this._updateControls();
      this._renderMap(true);
    });
    if (reposition) this._positionPopup();
  }

  _positionPopup() {
    const popup = this.shadowRoot.getElementById("popup");
    const map = this.shadowRoot.getElementById("map");
    if (!popup || !map || popup.classList.contains("hidden")) return;
    const v = this._selectedVehicle();
    if (!v) {
      popup.classList.add("hidden");
      return;
    }
    const rect = map.getBoundingClientRect();
    const centerWorld = this._latLonToWorld(this._center.lat, this._center.lon, this._zoom);
    const topLeft = { x: centerWorld.x - rect.width / 2, y: centerWorld.y - rect.height / 2 };
    const p = this._latLonToWorld(v.lat, v.lon, this._zoom);
    let x = p.x - topLeft.x;
    const worldSize = this._tileSize * (2 ** this._zoom);
    if (x < -worldSize / 2) x += worldSize;
    if (x > worldSize / 2) x -= worldSize;
    const y = p.y - topLeft.y;
    const popupWidth = Math.min(330, Math.max(260, rect.width - 24));
    popup.style.width = `${popupWidth}px`;
    const left = Math.max(12, Math.min(rect.width - popupWidth - 12, x - popupWidth / 2));
    const top = y > rect.height * 0.56 ? Math.max(12, y - 205) : Math.min(rect.height - 190, y + 34);
    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(Math.max(12, top))}px`;
  }

  async _toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (this.requestFullscreen) {
        await this.requestFullscreen();
        return;
      }
    } catch (_) { /* use CSS fallback */ }
    this._pseudoFullscreen = !this._pseudoFullscreen;
    this.classList.toggle("pseudo-fullscreen", this._pseudoFullscreen);
    this._updateFullscreenIcon();
    setTimeout(() => this._renderMap(true), 60);
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
      .tiles, .poi-markers, .markers { position:absolute; inset:0; overflow:hidden; pointer-events:none; }
      .tile { position:absolute; width:256px; height:256px; max-width:none; pointer-events:none; -webkit-user-drag:none; }
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
      .vehicle-panel, .poi-panel { position:absolute; z-index:60; right:10px; top:10px; width:min(340px,calc(100% - 20px)); max-height:calc(100% - 20px); overflow:auto; box-sizing:border-box; border-radius:13px; background:color-mix(in srgb, var(--card-background-color) 96%, transparent); box-shadow:0 5px 22px rgba(0,0,0,.27); border:1px solid var(--divider-color); padding:10px; user-select:text; }
      .vehicle-panel.hidden, .poi-panel.hidden, .popup.hidden, .poi-popup.hidden { display:none; }
      .panel-title { display:flex; justify-content:space-between; align-items:center; font-weight:700; margin-bottom:8px; }
      .panel-title button, .popup-head button { width:32px; min-height:32px; padding:0; border:none; background:transparent; }
      .poi-center { display:flex; gap:7px; align-items:center; padding:7px 8px; border-radius:9px; background:var(--secondary-background-color); font-size:12px; margin-bottom:8px; }
      .poi-center ha-icon { --mdc-icon-size:17px; color:var(--primary-color); }
      .poi-categories { display:grid; grid-template-columns:1fr 1fr; gap:5px; }
      .poi-category { display:flex; flex-direction:row; align-items:center; gap:6px; padding:7px; border-radius:9px; background:var(--secondary-background-color); color:var(--primary-text-color); font-size:11px; font-weight:600; cursor:pointer; }
      .poi-category input { width:17px; height:17px; margin:0; flex:0 0 auto; }
      .poi-category ha-icon { --mdc-icon-size:16px; color:var(--primary-color); }
      .poi-radius-label { margin-top:9px; display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:8px; color:var(--secondary-text-color); font-size:11px; font-weight:700; }
      .poi-radius-label select { width:110px; min-height:34px; border:1px solid var(--divider-color); border-radius:9px; background:var(--card-background-color); color:var(--primary-text-color); padding:4px 8px; }
      .poi-actions { display:flex; gap:6px; margin-top:9px; }
      .poi-actions button { flex:1; min-height:34px; border:1px solid var(--divider-color); border-radius:9px; background:color-mix(in srgb, var(--card-background-color) 92%, var(--primary-color) 8%); color:var(--primary-text-color); display:inline-flex; align-items:center; justify-content:center; gap:5px; cursor:pointer; }
      .poi-actions button:disabled { opacity:.45; cursor:default; }
      .poi-actions ha-icon { --mdc-icon-size:16px; }
      .poi-status { margin-top:8px; padding:7px 8px; border-radius:8px; background:var(--secondary-background-color); font-size:11px; line-height:1.35; }
      .poi-status.warning { background:color-mix(in srgb, var(--warning-color, #f9a825) 14%, transparent); }
      .poi-note { margin-top:7px; color:var(--secondary-text-color); font-size:9px; line-height:1.35; }
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
        .map { height:440px; }
        .subtitle { display:none; }
        .tool-btn span { display:none; }
        .tool-btn { width:38px; padding:0; }
        .mode-btn { padding:0 9px; }
        .map-header { padding:10px 10px 7px; }
        .toolbar { padding:0 8px 8px; }
        .popup, .poi-popup { left:10px !important; right:10px; width:auto !important; }
        .poi-categories { grid-template-columns:1fr; }
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
