const DOMAIN = "cardata_analytics";
const CARD_TAG = "cardata-analytics-card";
const CARD_VERSION = "0.1.15";

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
      text = availableFrom
        ? `Zeitraum nicht vollständig auswertbar · einzelne Tagesdaten fehlen (Tracking ab ${availableFrom}).`
        : "Zeitraum nicht vollständig auswertbar · einzelne Tagesdaten fehlen.";
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
