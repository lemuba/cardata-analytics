const DOMAIN = "cardata_analytics";
const CARD_TAG = "cardata-analytics-card";
const CARD_VERSION = "0.1.19";

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
      this._hass?.states?.[e.latitude]?.last_changed,
      this._hass?.states?.[e.longitude]?.last_changed,
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

  _restorePreferences() {
    try {
      const raw = localStorage.getItem(this._storageKey);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (["osm", "topo", "gps"].includes(data.mode)) this._mode = data.mode;
      if (["osm", "topo"].includes(data.lastFreeMode)) this._lastFreeMode = data.lastFreeMode;
      if (Number.isFinite(data.zoom)) this._zoom = Math.max(2, Math.min(19, Number(data.zoom)));
      if (data.center && Number.isFinite(data.center.lat) && Number.isFinite(data.center.lon)) {
        this._center = { lat: Number(data.center.lat), lon: Number(data.center.lon) };
      }
      if (Array.isArray(data.hiddenVehicles)) this._hiddenVehicles = new Set(data.hiddenVehicles.map(String));
      if (data.selectedVehicleId) this._selectedVehicleId = String(data.selectedVehicleId);
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
              <div><div class="title">${this._esc(title)}</div><div class="subtitle">Live positions from Cardata Analytics</div></div>
            </div>
            <button class="icon-btn" id="fullscreen" title="Vollbild" aria-label="Vollbild"><ha-icon icon="mdi:fullscreen"></ha-icon></button>
          </div>
          <div class="toolbar">
            <div class="mode-group" role="group" aria-label="Kartendarstellung">
              <button class="mode-btn" data-mode="osm">OSM</button>
              <button class="mode-btn" data-mode="topo">Topo</button>
              <button class="mode-btn" data-mode="gps"><ha-icon icon="mdi:crosshairs-gps"></ha-icon> GPS</button>
            </div>
            <button class="tool-btn" id="fit" title="Alle sichtbaren Fahrzeuge einpassen"><ha-icon icon="mdi:fit-to-screen-outline"></ha-icon><span>Alle</span></button>
            <button class="tool-btn" id="vehicles-toggle" title="Fahrzeuge ein- oder ausblenden"><ha-icon icon="mdi:car-multiple"></ha-icon><span>Fahrzeuge</span></button>
          </div>
          <div class="map-wrap">
            <div class="map" id="map" tabindex="0" aria-label="Fahrzeugkarte" style="--cardata-map-height:${Math.max(330, Math.min(900, Number(this._config.height) || 520))}px">
              <div class="tiles" id="tiles"></div>
              <div class="markers" id="markers"></div>
              <div class="map-empty" id="map-empty"></div>
              <div class="zoom-controls">
                <button id="zoom-in" aria-label="Vergrößern" title="Vergrößern"><ha-icon icon="mdi:plus"></ha-icon></button>
                <button id="zoom-out" aria-label="Verkleinern" title="Verkleinern"><ha-icon icon="mdi:minus"></ha-icon></button>
              </div>
              <div class="attribution" id="attribution"></div>
              <div class="vehicle-panel hidden" id="vehicle-panel"></div>
              <div class="popup hidden" id="popup"></div>
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
      this.shadowRoot.getElementById("vehicle-panel")?.classList.toggle("hidden");
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
    if (!["osm", "topo", "gps"].includes(mode)) return;
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
    this._zoom = Math.max(2, Math.min(19, Math.round(this._zoom + delta)));
    this._savePreferences();
    this._renderMap(true);
  }

  _startDrag(ev) {
    if (ev.button != null && ev.button !== 0) return;
    const map = this.shadowRoot.getElementById("map");
    if (!map || ev.target.closest("button, a, .popup, .vehicle-panel")) return;
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
    if (this._mode === "topo") {
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
        this._showPopup(v.deviceId);
        this._renderMap();
        this._renderVehiclePanel();
      });
      markerFrag.appendChild(marker);
    }
    markers.replaceChildren(markerFrag);

    const empty = this.shadowRoot.getElementById("map-empty");
    const allGpsVehicles = this._vehicles().filter((v) => v.valid);
    if (empty) {
      if (!allGpsVehicles.length) {
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
    this._renderMap();
    this._renderVehiclePanel();
    const popup = this.shadowRoot.getElementById("popup");
    if (popup && !popup.classList.contains("hidden") && this._selectedVehicleId) {
      this._showPopup(this._selectedVehicleId, false);
    }
  }

  _updateControls() {
    this.shadowRoot.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === this._mode);
    });
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
    });
    panel.querySelector("#hide-all")?.addEventListener("click", () => {
      for (const v of vehicles) this._hiddenVehicles.add(v.deviceId);
      this._savePreferences();
      this._renderVehiclePanel();
      this._renderMap(true);
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
        this._showPopup(id);
        this._renderMap(true);
      });
    });
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
      .mode-btn.active { background:var(--primary-color); color:var(--text-primary-color, white); box-shadow:0 1px 4px rgba(0,0,0,.18); }
      .mode-btn ha-icon, .tool-btn ha-icon { --mdc-icon-size:18px; }
      .tool-btn { padding:0 10px; white-space:nowrap; }
      .map-wrap { padding:0; }
      .map { height:var(--cardata-map-height, 520px); min-height:330px; position:relative; overflow:hidden; background:#d8dde3; touch-action:none; cursor:grab; user-select:none; outline:none; }
      .map.dragging { cursor:grabbing; }
      .tiles, .markers { position:absolute; inset:0; overflow:hidden; pointer-events:none; }
      .tile { position:absolute; width:256px; height:256px; max-width:none; pointer-events:none; -webkit-user-drag:none; }
      .markers { z-index:20; overflow:visible; }
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
      .vehicle-panel { position:absolute; z-index:60; right:10px; top:10px; width:min(330px,calc(100% - 20px)); max-height:calc(100% - 20px); overflow:auto; border-radius:13px; background:color-mix(in srgb, var(--card-background-color) 96%, transparent); box-shadow:0 5px 22px rgba(0,0,0,.27); border:1px solid var(--divider-color); padding:10px; user-select:text; }
      .vehicle-panel.hidden, .popup.hidden { display:none; }
      .panel-title { display:flex; justify-content:space-between; align-items:center; font-weight:700; margin-bottom:8px; }
      .panel-title button, .popup-head button { width:32px; min-height:32px; padding:0; border:none; background:transparent; }
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
      .popup { position:absolute; z-index:55; box-sizing:border-box; border-radius:13px; background:color-mix(in srgb, var(--card-background-color) 97%, transparent); border:1px solid var(--divider-color); box-shadow:0 5px 22px rgba(0,0,0,.28); padding:11px; user-select:text; }
      .popup-head { display:flex; justify-content:space-between; gap:8px; font-size:12px; line-height:1.35; }
      .popup-head strong { font-size:14px; display:block; margin-bottom:2px; }
      .popup-head > div > div { color:var(--secondary-text-color); }
      .popup-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:9px; }
      .popup-grid > div { display:flex; flex-direction:column; padding:6px 8px; background:var(--secondary-background-color); border-radius:8px; }
      .popup-grid span { font-size:9px; color:var(--secondary-text-color); }
      .popup-grid strong { font-size:12px; margin-top:1px; }
      .popup-actions { display:flex; gap:6px; margin-top:9px; }
      .popup-actions button, .popup-actions a { min-height:34px; padding:0 9px; font-size:11px; flex:1; }
      .popup-actions ha-icon { --mdc-icon-size:17px; }
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
        .popup { left:10px !important; right:10px; width:auto !important; }
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
