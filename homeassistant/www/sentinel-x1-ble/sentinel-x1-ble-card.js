/* Sentinel X1 BLE \u00b7 Lovelace card for the Kamoer X1 (Bluetooth) dosing package.
 * type: custom:sentinel-x1-ble-card
 * Front end only: every control calls the helpers/scripts in packages/sentinel_x1_ble.yaml. */
const SXB_VERSION = '1.1.0';

// ---- Blue Sentinel X1 icon: "sentinel:x1ble" (same shield as the Pro-T, blue) ----------------
window.customIcons = window.customIcons || {};
if (!window.customIcons.sentinel) {
  window.customIcons.sentinel = {getIcon: async () => ({
    path: 'M117 25L192 57V100C192 145 164 174 118 193C70 174 44 143 44 101V57Z',
    secondaryPath: 'M75 71H97L105 92L128 71H151L116 105L129 136H107L99 115L78 136H59L91 102ZM138 80L157 71H170L154 136H135L147 91L136 97Z',
    viewBox: '35 20 166 178'})};
}
const SXB_ICON = 'sentinel:x1ble';
const SXB_BLUE = '#1F6FEB';
customElements.whenDefined('ha-icon').then(() => {
  const proto = customElements.get('ha-icon').prototype;
  if (proto._sentinelBleBranding) return;
  proto._sentinelBleBranding = true;
  const loadIcon = proto._loadIcon;
  proto._loadIcon = function (...args) {
    if (this.icon === SXB_ICON) this._legacy = false;
    return loadIcon.apply(this, args);
  };
  const updated = proto.updated;
  proto.updated = function (changed) {
    if (updated) updated.call(this, changed);
    if (this.icon === SXB_ICON) {
      this.style.setProperty('--icon-primary-color', SXB_BLUE);
      this.style.setProperty('--icon-secondary-color', '#fff');
      this.style.setProperty('--icon-secondary-opactity', '1');
      this._sentinelBleColored = true;
    } else if (this._sentinelBleColored) {
      ['--icon-primary-color', '--icon-secondary-color', '--icon-secondary-opactity']
        .forEach(k => this.style.removeProperty(k));
      this._sentinelBleColored = false;
    }
  };
  const refresh = root => {
    for (const el of root.querySelectorAll('*')) {
      if (el.localName === 'ha-icon' && el.icon === SXB_ICON) { el._loadIcon(); el.requestUpdate(); }
      if (el.shadowRoot) refresh(el.shadowRoot);
    }
  };
  queueMicrotask(() => refresh(document));
});

// ---- Entities ------------------------------------------------------------------------------
const E = {
  enabled: 'input_boolean.x1ble_enabled', alerts: 'input_boolean.x1ble_alerts',
  dismissed: 'input_boolean.x1ble_cal_dismissed', supplement: 'input_text.x1ble_supplement',
  window: 'input_select.x1ble_window', start: 'input_datetime.x1ble_start', end: 'input_datetime.x1ble_end',
  lastCal: 'input_datetime.x1ble_last_cal', lastDose: 'input_datetime.x1ble_last_dose',
  daily: 'input_number.x1ble_daily_ml', doses: 'input_number.x1ble_doses', cap: 'input_number.x1ble_daily_max',
  manual: 'input_number.x1ble_manual_ml', prime: 'input_number.x1ble_prime_s', calm: 'input_number.x1ble_cal_measured',
  csize: 'input_number.x1ble_container_size', cleft: 'input_number.x1ble_container_left',
  lowdays: 'input_number.x1ble_low_days', today: 'input_number.x1ble_dosed_today', total: 'input_number.x1ble_dosed_total',
  perdose: 'sensor.x1_ble_per_dose', daysleft: 'sensor.x1_ble_days_left', level: 'sensor.x1_ble_container_level',
  next: 'sensor.x1_ble_next_dose', status: 'sensor.x1_ble_status', caldue: 'binary_sensor.x1_ble_calibration_due',
  plan: 'sensor.x1_ble_pump_plan', psync: 'input_text.x1ble_pump_sync',
  reach: 'binary_sensor.sentinel_x1_ble_pump_reachable', dosing: 'binary_sensor.sentinel_x1_ble_pump_dosing',
  flow: 'sensor.sentinel_x1_ble_flow_rate_calibrated', result: 'sensor.sentinel_x1_ble_last_result',
  contact: 'sensor.sentinel_x1_ble_last_contact',
};
const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
const WATCH = [...Object.values(E), ...DAYS.map(d => `input_boolean.x1ble_${d[0]}`)];

const C = {ink: '#13233A', muted: '#56657C', line: '#E6EBF2', soft: '#F6F8FC', bg: '#F4F7FB', blue: SXB_BLUE,
  blueSoft: '#EAF2FE', green: '#1E9E6A', greenSoft: '#E7F6EF', amber: '#D9821E', amberSoft: '#FDF3E6',
  red: '#D64545', redSoft: '#FCECEC'};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const fmt = (v, dp = 1) => num(v).toFixed(dp).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
const hhmm = d => d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});

class SentinelX1BleCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this._tab = 'dosing';
    this._sig = '';
    this._hist = null;
    this._log = null;
    this._histAt = 0;
    this._busy = {};
  }

  setConfig(config) {
    this._config = config || {};
    // Optional history_start (ISO date/time): hide log entries and chart data from before you started using the pump.
    const hs = this._config.history_start ? new Date(this._config.history_start) : null;
    this._histStart = hs && !isNaN(hs) ? hs.getTime() : 0;
  }
  getCardSize() { return 12; }
  getGridOptions() { return {columns: 'full'}; }

  set hass(hass) {
    this._hass = hass;
    const sig = WATCH.map(id => { const s = hass.states[id]; return s ? s.state + '|' + s.last_updated : '-'; }).join(';');
    if (sig === this._sig) return;
    this._sig = sig;
    this._render();
  }

  // ---- helpers ------------------------------------------------------------------------------
  s(id) { return this._hass.states[id]; }
  v(id, d = '') { const s = this.s(id); return s ? s.state : d; }
  on(id) { return this.v(id) === 'on'; }
  n(id, d = 0) { return num(this.v(id), d); }
  call(domain, service, data = {}) { return this._hass.callService(domain, service, data); }
  setNum(id, value) {
    const st = this.s(id); if (!st) return;
    const a = st.attributes; let v = num(value, a.min);
    v = Math.min(a.max, Math.max(a.min, v));
    const step = a.step || 1; v = Math.round(v / step) * step;
    return this.call('input_number', 'set_value', {entity_id: id, value: +v.toFixed(3)});
  }
  async press(key, fn) {
    if (this._busy[key]) return;
    this._busy[key] = true; this._render(true);
    try { await fn(); } catch (e) { console.error('sentinel-x1-ble', e); }
    setTimeout(() => { this._busy[key] = false; this._render(true); }, 1500);
  }
  timeVal(id) { const s = this.s(id); if (!s) return '00:00'; return (s.state || '00:00:00').slice(0, 5); }

  // ---- render -------------------------------------------------------------------------------
  _render(force) {
    if (!this._hass) return;
    const root = this.shadowRoot;
    const focused = root.activeElement;
    if (!force && focused && (focused.tagName === 'INPUT')) return; // don't fight typing
    const missing = !this.s(E.daily);
    root.innerHTML = `<style>${this._css()}</style>
      <div class="wrap">${missing ? this._missing() : this._header() + this._tabs() + this._body()}</div>${this._confirm ? `
      <div class="modal" role="dialog" aria-modal="true"><div class="mbox"><h3>${esc(this._confirm.title)}</h3><p>${esc(this._confirm.body)}</p>
      <div class="mact"><button class="ghost" data-confirm="no">Cancel</button><button class="primary" data-confirm="yes">${esc(this._confirm.ok)}</button></div></div></div>` : ''}`;
    this._bind();
    if (this._tab === 'history' && Date.now() - this._histAt > 120000) this._loadHistory();
  }

  _missing() {
    return `<div class="card"><h2>Sentinel X1 BLE</h2><p class="muted">The dosing package isn't loaded.
      Add <code>sentinel_x1_ble: !include packages/sentinel_x1_ble.yaml</code> under
      <code>homeassistant: packages:</code> and reload.</p></div>`;
  }

  _statusPill() {
    const st = this.v(E.status, 'unknown');
    const map = {'Dosing': ['blue', 'mdi:water-pump'], 'Scheduled': ['green', 'mdi:check-circle'],
      "Today's volume dosed": ['green', 'mdi:check-all'], 'Paused': ['amber', 'mdi:pause-circle'],
      'Pump not reachable': ['red', 'mdi:bluetooth-off'], 'Container empty': ['red', 'mdi:bottle-tonic-outline'],
      'Not a dosing day': ['grey', 'mdi:calendar-remove'], 'No daily volume set': ['amber', 'mdi:alert-circle-outline']};
    const [tone, icon] = map[st] || ['grey', 'mdi:information-outline'];
    return `<span class="pill ${tone}"><ha-icon icon="${icon}"></ha-icon>${esc(st)}</span>`;
  }

  _header() {
    const name = this.v(E.supplement).trim();
    const en = this.on(E.enabled);
    return `<div class="card head">
      <div class="brand">
        <ha-icon class="logo" icon="${SXB_ICON}"></ha-icon>
        <div><div class="title">${esc(name || 'Sentinel X1 BLE')}</div>
          <div class="sub">${name ? 'Sentinel X1 BLE \u00b7 ' : ''}Kamoer X1 \u00b7 Bluetooth doser</div></div>
      </div>
      <div class="head-right">
        ${this._statusPill()}
        <button class="toggle ${en ? 'on' : ''}" data-act="enable" title="Automatic dosing">
          <span class="knob"></span><span class="tlabel">${en ? 'Auto dosing on' : 'Auto dosing off'}</span></button>
        <button class="stop" data-act="stop" ${this._busy.stop ? 'disabled' : ''}><ha-icon icon="mdi:stop"></ha-icon>STOP</button>
      </div></div>`;
  }

  _tabs() {
    const t = [['dosing', 'Dosing', 'mdi:water'], ['setup', 'Setup', 'mdi:tune-variant'],
      ['calibrate', 'Calibrate', 'mdi:flask-outline'], ['history', 'History', 'mdi:chart-bar']];
    return `<div class="tabs">${t.map(([k, l, i]) => `<button class="tab ${this._tab === k ? 'sel' : ''}" data-tab="${k}">
      <ha-icon icon="${i}"></ha-icon><span>${l}</span></button>`).join('')}</div>`;
  }

  _body() {
    if (this._tab === 'setup') return this._setup();
    if (this._tab === 'calibrate') return this._calibrate();
    if (this._tab === 'history') return this._history();
    return this._dosing();
  }

  _stepper(id, opts = {}) {
    const st = this.s(id); if (!st) return '';
    const a = st.attributes; const step = opts.step || a.step || 1;
    const dp = opts.dp ?? (step < 1 ? 1 : 0);
    return `<div class="stepper ${opts.big ? 'big' : ''}">
      <button data-step="${id}" data-d="${-step}" aria-label="less">\u2212</button>
      <input type="number" inputmode="decimal" data-num="${id}" value="${fmt(st.state, dp)}" min="${a.min}" max="${a.max}" step="${a.step}">
      <span class="unit">${esc(opts.unit ?? a.unit_of_measurement ?? '')}</span>
      <button data-step="${id}" data-d="${step}" aria-label="more">+</button></div>`;
  }

  _banners() {
    const out = [];
    if (this.on(E.caldue)) {
      const never = !this.s(E.lastCal) || this.v(E.lastCal) === 'unknown' || !this.s(E.lastCal).attributes.timestamp;
      out.push(`<div class="banner amber"><ha-icon icon="mdi:flask-outline"></ha-icon>
        <div><b>${never ? 'Calibrate this pump' : 'Calibration is 3 months old'}</b>
        <span>Recommended, not required \u2014 keeps doses accurate as tubing wears.</span></div>
        <div class="bactions"><button class="ghost" data-tab="calibrate">Calibrate</button>
        <button class="ghost" data-act="dismiss">Dismiss</button></div></div>`);
    }
    const size = this.n(E.csize); const dl = this.n(E.daysleft, 999);
    if (size > 0 && dl <= this.n(E.lowdays, 7)) {
      out.push(`<div class="banner red"><ha-icon icon="mdi:bottle-tonic-outline"></ha-icon>
        <div><b>Container low</b><span>${fmt(this.n(E.cleft), 0)} mL left \u00b7 about ${fmt(dl, 1)} days</span></div>
        <div class="bactions"><button class="ghost" data-act="refill">Refilled</button></div></div>`);
    }
    if (this.v(E.psync) === 'failed') {
      out.push(`<div class="banner red"><ha-icon icon="mdi:calendar-alert"></ha-icon>
        <div><b>Schedule not saved to the pump</b><span>The pump may still be on its previous schedule. Sentinel retries at the next change and overnight.</span></div>
        <div class="bactions"><button class="ghost" data-act="resync">Try again</button></div></div>`);
    }
    if (!this.on(E.reach) && this.v(E.reach) !== 'unknown') {
      out.push(`<div class="banner red"><ha-icon icon="mdi:bluetooth-off"></ha-icon>
        <div><b>Pump not reachable</b><span>The bridge couldn't connect on its last try. Close the Kamoer app if it's open; doses retry automatically.</span></div></div>`);
    }
    return out.join('');
  }

  _dosing() {
    const daily = this.n(E.daily); const today = this.n(E.today); const doses = this.n(E.doses, 1);
    const per = this.n(E.perdose); const pct = daily > 0 ? Math.min(1, today / daily) : 0;
    const w24 = this.v(E.window) === '24 hours';
    const span = w24 ? 1440 : (() => { const [a, b] = [this.timeVal(E.start), this.timeVal(E.end)].map(t => +t.slice(0, 2) * 60 + +t.slice(3)); return b - a; })();
    const every = doses > 0 && span > 0 ? span / doses : 0;
    const everyTxt = every >= 60 ? `${fmt(every / 60, 1)} h` : `${Math.round(every)} min`;
    const nextS = this.v(E.next); const next = nextS && !['unknown', 'unavailable'].includes(nextS) ? new Date(nextS) : null;
    const nextTxt = next ? (next.toDateString() === new Date().toDateString() ? hhmm(next) : next.toLocaleDateString([], {weekday: 'short'}) + ' ' + hhmm(next)) : '\u2014';
    const ld = this.s(E.lastDose); const ldTs = ld && ld.attributes.timestamp ? new Date(ld.attributes.timestamp * 1000) : null;
    const ldTxt = ldTs && ld.attributes.year > 2000 && this.n(E.total) > 0 ? (ldTs.toDateString() === new Date().toDateString() ? hhmm(ldTs) : ldTs.toLocaleDateString([], {month: 'short', day: 'numeric'}) + ' ' + hhmm(ldTs)) : '\u2014';
    const r = 54, c = 2 * Math.PI * r;
    const size = this.n(E.csize); const left = this.n(E.cleft); const lvl = size > 0 ? Math.min(100, Math.max(0, 100 * left / size)) : null;
    const dl = this.v(E.daysleft);
    const days = DAYS.filter(([k]) => this.on(`input_boolean.x1ble_${k}`)).map(d => d[1]);
    const daysTxt = days.length === 7 ? 'Every day' : (days.length ? days.join(' ') : 'No days');
    const reach = this.on(E.reach); const contact = this.v(E.contact);
    const contactTxt = contact && !['unknown', 'unavailable'].includes(contact) ? hhmm(new Date(contact)) : '\u2014';
    const flow = this.n(E.flow);
    const winTxt = w24 ? '24 hours' : `${this.timeVal(E.start)}\u2013${this.timeVal(E.end)}`;
    return `${this._banners()}
    <div class="grid two">
      <div class="card hero">
        <div class="ring">
          <svg viewBox="0 0 128 128"><circle cx="64" cy="64" r="${r}" class="track"/>
            <circle cx="64" cy="64" r="${r}" class="bar" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/></svg>
          <div class="ringtxt"><b>${fmt(today, 1)}</b><span>of ${fmt(daily, 1)} mL</span></div>
        </div>
        <div class="herotxt">
          <div class="label">Today</div>
          <div class="big">${daily > 0 ? `${fmt(per, 2)} mL \u00d7 ${doses}` : 'Set a daily volume'}</div>
          <div class="muted">${daily > 0 ? `${fmt(daily, 1)} mL/day \u00b7 every ${everyTxt} \u00b7 ${esc(winTxt)}` : 'Open Setup to get started'}</div>
          <div class="kv"><div><span>Next dose</span><b>${nextTxt}</b></div><div><span>Last dose</span><b>${ldTxt}</b></div></div>
        </div>
      </div>
      <div class="card">
        <div class="label">Manual dose</div>
        <div class="row">${this._stepper(E.manual, {big: true})}
          <button class="primary" data-act="dose" ${this._busy.dose ? 'disabled' : ''}><ha-icon icon="mdi:water-plus"></ha-icon>Dose</button></div>
        <div class="row gap">
          <button class="secondary" data-act="prime" ${this._busy.prime ? 'disabled' : ''}><ha-icon icon="mdi:pipe-valve"></ha-icon>Prime ${fmt(this.n(E.prime, 10), 0)} s</button>
          <button class="secondary" data-act="rollcall" ${this._busy.rollcall ? 'disabled' : ''}><ha-icon icon="mdi:bell-ring-outline"></ha-icon>Find pump</button>
        </div>
        <div class="hint">Manual doses count toward today's total. Prime doesn't.</div>
      </div>
    </div>
    <div class="grid four">
      <div class="card tile"><div class="ticon"><ha-icon icon="mdi:bottle-tonic-outline"></ha-icon></div>
        <div class="tlabel2">Container</div>
        ${lvl === null ? `<div class="tval">Not set</div><div class="tsub"><a data-tab="setup">Set size</a></div>` :
          `<div class="tval">${Math.round(lvl)}%</div><div class="meter"><i style="width:${lvl}%" class="${lvl < 15 ? 'low' : ''}"></i></div>
           <div class="tsub">${fmt(left, 0)} mL \u00b7 ${dl === 'unknown' ? '\u2014' : fmt(dl, 1) + ' days'}</div>
           <button class="link" data-act="refill">Refilled</button>`}
      </div>
      <div class="card tile"><div class="ticon"><ha-icon icon="${reach ? 'mdi:bluetooth-connect' : 'mdi:bluetooth-off'}"></ha-icon></div>
        <div class="tlabel2">Pump</div><div class="tval ${reach ? 'okc' : 'badc'}">${this.on(E.dosing) ? 'Dosing' : (reach ? 'Ready' : 'No contact')}</div>
        <div class="tsub">Last contact ${contactTxt}</div><div class="tsub">${esc(this.v(E.result, '') === 'unknown' ? '' : this.v(E.result, ''))}</div></div>
      <div class="card tile"><div class="ticon"><ha-icon icon="mdi:speedometer"></ha-icon></div>
        <div class="tlabel2">Flow (calibrated)</div><div class="tval">${flow > 0 ? fmt(flow, 1) : '\u2014'}<small> mL/min</small></div>
        <div class="tsub"><a data-tab="calibrate">Calibrate</a></div></div>
      <div class="card tile"><div class="ticon"><ha-icon icon="mdi:calendar-week"></ha-icon></div>
        <div class="tlabel2">Schedule</div><div class="tval sm">${esc(daysTxt)}</div>
        <div class="tsub">${esc(winTxt)} \u00b7 limit ${this.n(E.cap) > 0 ? fmt(this.n(E.cap), 1) + ' mL' : 'off'}</div>
        <div class="tsub">${esc(this._runsOn())}</div>
        <div class="tdays">${size > 0 && dl !== 'unknown' ? `<b>${fmt(dl, 1)}</b> days remaining` : (size > 0 ? 'Days remaining: set a daily volume' : '<a data-tab="setup">Set container size</a> for days remaining')}</div></div>
    </div>`;
  }

  _runsOn() {
    const plan = this.v(E.plan), sync = this.v(E.psync);
    if (plan === 'ha') return 'Runs in Home Assistant (over 12 doses a day)';
    if (plan === 'pump') return sync === 'failed' ? 'Pump schedule not saved' : 'Runs on the pump';
    return 'Pump schedule cleared';
  }

  _setup() {
    const w24 = this.v(E.window) === '24 hours';
    const daily = this.n(E.daily), doses = this.n(E.doses, 1); const per = doses ? daily / doses : 0;
    const cap = this.n(E.cap);
    const capWarn = cap > 0 && cap < daily ? `<div class="warn">The safety limit is below the daily volume \u2014 ${doses <= 12 ? 'the pump schedule stays cleared until you raise the limit or lower the daily volume.' : 'some doses will be skipped.'}</div>` : '';
    const perWarn = daily > 0 && per < 0.1 ? `<div class="hint">Each dose is ${fmt(per, 3)} mL; the pump's smallest dose is 0.1 mL, so tiny remainders carry over and are delivered with later doses.</div>` : '';
    return `<div class="grid two">
      <div class="card">
        <h3>Dosing</h3>
        <label>Supplement name</label>
        <input class="text" type="text" data-text="${E.supplement}" maxlength="40" placeholder="e.g. Kalkwasser, NO3, Iodine" value="${esc(this.v(E.supplement))}">
        <label>Daily volume</label>${this._stepper(E.daily, {big: true, step: 0.5, dp: 1})}
        <label>Doses per day</label>${this._stepper(E.doses, {big: true, unit: ''})}
        <div class="calc">= <b>${fmt(per, 2)} mL</b> per dose</div>${perWarn}
        <div class="hint">${doses <= 12 ? 'Up to 12 doses a day are saved on the pump, so they keep running even if Home Assistant or Wi-Fi is down.' : 'Over 12 doses a day, Home Assistant runs the schedule; it needs Home Assistant and the bridge online.'}</div>
        <label>Daily safety limit <span class="muted">(0 = off)</span></label>${this._stepper(E.cap, {step: 0.5, dp: 1})}
        ${daily > 0 ? `<button class="link" data-act="capsuggest">Set to 1.5 \u00d7 daily (${fmt(daily * 1.5, 1)} mL)</button>` : ''}${capWarn}
      </div>
      <div class="card">
        <h3>Schedule</h3>
        <div class="seg">${['24 hours', 'Time window'].map(o => `<button class="${this.v(E.window) === o ? 'sel' : ''}" data-window="${o}">${o}</button>`).join('')}</div>
        ${w24 ? `<div class="hint">Doses are spread evenly from midnight to midnight.</div>` : `
          <div class="row times"><div><label>Start</label><input class="text" type="time" data-time="${E.start}" value="${this.timeVal(E.start)}"></div>
          <div><label>End</label><input class="text" type="time" data-time="${E.end}" value="${this.timeVal(E.end)}"></div></div>
          ${this.timeVal(E.end) <= this.timeVal(E.start) ? '<div class="warn">End must be later than start (windows can\'t cross midnight).</div>' : ''}`}
        <label>Dosing days</label>
        <div class="days">${DAYS.map(([k, l]) => `<button class="day ${this.on(`input_boolean.x1ble_${k}`) ? 'sel' : ''}" data-day="${k}">${l}</button>`).join('')}</div>
        <h3 class="mt">Container</h3>
        <label>Container size <span class="muted">(0 = don't track)</span></label>${this._stepper(E.csize, {step: 50, dp: 0})}
        <div class="row gap"><button class="secondary" data-act="refill"><ha-icon icon="mdi:refresh"></ha-icon>Refilled (set to full)</button></div>
        <label>Alert when fewer than</label>${this._stepper(E.lowdays, {unit: 'days left'})}
      </div>
      <div class="card">
        <h3>Alerts & pump</h3>
        <div class="switchrow"><div><b>Phone alerts</b><span>Low container, failed dose, pump not reachable</span></div>
          <button class="toggle ${this.on(E.alerts) ? 'on' : ''}" data-tog="${E.alerts}"><span class="knob"></span></button></div>
        <label>Prime run time</label>${this._stepper(E.prime, {unit: 's'})}
        <div class="hint">Before turning on auto dosing, delete any schedule saved in the Kamoer app, or the pump will dose on its own too.</div>
      </div>
    </div>`;
  }

  _calibrate() {
    const flow = this.n(E.flow); const m = this.n(E.calm);
    const lc = this.s(E.lastCal); const lcTxt = lc && lc.attributes.timestamp ? new Date(lc.attributes.timestamp * 1000).toLocaleDateString([], {year: 'numeric', month: 'short', day: 'numeric'}) : 'Never (in Home Assistant)';
    return `<div class="grid two">
      <div class="card">
        <h3>Calibrate</h3>
        <ol class="steps">
          <li><b>Prime the line.</b> Make sure the tube is full and liquid comes out steadily.
            <div><button class="secondary" data-act="prime" ${this._busy.prime ? 'disabled' : ''}><ha-icon icon="mdi:pipe-valve"></ha-icon>Prime ${fmt(this.n(E.prime, 10), 0)} s</button></div></li>
          <li><b>Put the outlet in the measuring cylinder</b> and run the pump for exactly 10 seconds.
            <div><button class="primary" data-act="calrun" ${this._busy.calrun || this.on(E.dosing) ? 'disabled' : ''}><ha-icon icon="mdi:timer-play-outline"></ha-icon>${this.on(E.dosing) ? 'Running\u2026' : 'Run 10 s'}</button></div></li>
          <li><b>Enter what you measured</b> and save it to the pump.
            ${this._stepper(E.calm, {big: true})}
            <div class="calc">= <b>${fmt(m * 6, 1)} mL/min</b></div>
            <div><button class="primary" data-act="calsave" ${this._busy.calsave ? 'disabled' : ''}><ha-icon icon="mdi:content-save-outline"></ha-icon>Save calibration</button></div></li>
        </ol>
      </div>
      <div class="card">
        <h3>Current</h3>
        <div class="kv col"><div><span>Flow on the pump</span><b>${flow > 0 ? fmt(flow, 1) + ' mL/min' : '\u2014'}</b></div>
          <div><span>Last calibrated</span><b>${lcTxt}</b></div>
          <div><span>Reminder</span><b>Every 3 months (you can dismiss it)</b></div></div>
        <div class="hint">The pump stores calibration itself, so doses stay accurate even if Home Assistant is offline.</div>
      </div></div>`;
  }

  _history() {
    if (!this._hist) return `<div class="card"><div class="muted">Loading history\u2026</div></div>`;
    const daily = this.n(E.daily);
    const max = Math.max(daily, ...this._hist.map(d => d.v), 0.1);
    const W = 640, H = 200, pad = 28, bw = (W - pad * 2) / 7;
    const bars = this._hist.map((d, i) => {
      const h = (H - 50) * d.v / max; const x = pad + i * bw + bw * 0.18; const y = H - 30 - h;
      return `<rect x="${x}" y="${y}" width="${bw * 0.64}" height="${Math.max(h, 1)}" rx="6" class="${d.today ? 'today' : ''}"/>
        <text x="${x + bw * 0.32}" y="${y - 6}" class="v">${d.v > 0 ? fmt(d.v, 1) : ''}</text>
        <text x="${x + bw * 0.32}" y="${H - 10}" class="d">${d.label}</text>`;
    }).join('');
    const ty = H - 30 - (H - 50) * daily / max;
    const week = this._hist.reduce((a, d) => a + d.v, 0);
    const rows = (this._log || []).slice(0, 25).map(l => `<div class="logrow"><span>${l.when}</span><b>${esc(l.msg)}</b></div>`).join('') || '<div class="muted">No doses logged yet.</div>';
    return `<div class="grid two">
      <div class="card"><h3>Last 7 days</h3>
        <svg class="chart" viewBox="0 0 ${W} ${H}">${daily > 0 ? `<line x1="${pad}" x2="${W - pad}" y1="${ty}" y2="${ty}" class="target"/><text x="${W - pad}" y="${ty - 4}" class="t">target ${fmt(daily, 1)}</text>` : ''}${bars}</svg>
        <div class="kv"><div><span>This week</span><b>${fmt(week, 1)} mL</b></div><div><span>Lifetime</span><b>${fmt(this.n(E.total), 0)} mL</b></div></div></div>
      <div class="card"><h3>Dose log</h3><div class="log">${rows}</div></div></div>`;
  }

  async _loadHistory() {
    this._histAt = Date.now();
    const end = new Date(); const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 6);
    try {
      const h = await this._hass.callWS({type: 'history/history_during_period', start_time: start.toISOString(),
        end_time: end.toISOString(), entity_ids: [E.today], minimal_response: true, no_attributes: true, include_start_time_state: true});
      const pts = (h[E.today] || []).map(p => ({t: new Date((p.lu || p.last_updated) * 1000 || p.last_changed), v: num(p.s ?? p.state)})).filter(p => p.t.getTime() >= this._histStart);
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d0 = new Date(start); d0.setDate(start.getDate() + i); const d1 = new Date(d0); d1.setDate(d0.getDate() + 1);
        const inDay = pts.filter(p => p.t >= d0 && p.t < d1).map(p => p.v);
        const isToday = i === 6;
        days.push({label: isToday ? 'Today' : d0.toLocaleDateString([], {weekday: 'short'}), today: isToday,
          v: isToday ? this.n(E.today) : (inDay.length ? Math.max(...inDay) : 0)});
      }
      this._hist = days;
      const lb = await this._hass.callWS({type: 'logbook/get_events', start_time: start.toISOString(), end_time: end.toISOString(), entity_ids: [E.today]});
      this._log = lb.filter(e => e.message && e.when * 1000 >= this._histStart).sort((a, b) => b.when - a.when).map(e => {
        const t = new Date(e.when * 1000);
        return {when: (t.toDateString() === new Date().toDateString() ? '' : t.toLocaleDateString([], {month: 'short', day: 'numeric'}) + ' ') + hhmm(t), msg: e.message};
      });
    } catch (err) { console.error('sentinel-x1-ble history', err); this._hist = []; this._log = []; }
    this._render(true);
  }

  // ---- events -------------------------------------------------------------------------------
  _bind() {
    const r = this.shadowRoot;
    r.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
      this._tab = b.dataset.tab; if (this._tab === 'history') this._histAt = 0; this._render(true);
    }));
    r.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.step; this.setNum(id, this.n(id) + num(b.dataset.d));
    }));
    r.querySelectorAll('[data-num]').forEach(i => {
      i.addEventListener('change', () => this.setNum(i.dataset.num, i.value));
      i.addEventListener('keydown', e => { if (e.key === 'Enter') i.blur(); });
      i.addEventListener('blur', () => setTimeout(() => this._render(true), 50));
    });
    r.querySelectorAll('[data-text]').forEach(i => {
      i.addEventListener('change', () => this.call('input_text', 'set_value', {entity_id: i.dataset.text, value: i.value.trim()}));
      i.addEventListener('keydown', e => { if (e.key === 'Enter') i.blur(); });
    });
    r.querySelectorAll('[data-time]').forEach(i => i.addEventListener('change', () => {
      if (i.value) this.call('input_datetime', 'set_datetime', {entity_id: i.dataset.time, time: i.value + ':00'});
    }));
    r.querySelectorAll('[data-window]').forEach(b => b.addEventListener('click', () =>
      this.call('input_select', 'select_option', {entity_id: E.window, option: b.dataset.window})));
    r.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () =>
      this.call('input_boolean', 'toggle', {entity_id: `input_boolean.x1ble_${b.dataset.day}`})));
    r.querySelectorAll('[data-tog]').forEach(b => b.addEventListener('click', () =>
      this.call('input_boolean', 'toggle', {entity_id: b.dataset.tog})));
    r.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => this._act(b.dataset.act)));
    r.querySelectorAll('[data-confirm]').forEach(b => b.addEventListener('click', () => {
      const c = this._confirm; this._confirm = null;
      if (b.dataset.confirm === 'yes' && c) c.run(); else this._render(true);
    }));
  }

  _act(a) {
    const S = (svc, data) => () => this.call('script', svc, data);
    switch (a) {
      case 'enable': {
        if (!this.on(E.enabled) && this.n(E.daily) <= 0) { this._tab = 'setup'; this._render(true); return; }
        this.call('input_boolean', 'toggle', {entity_id: E.enabled}); return;
      }
      case 'stop': return this.press('stop', S('x1ble_stop'));
      case 'dose': return this.press('dose', S('x1ble_manual_dose'));
      case 'prime': return this.press('prime', S('x1ble_prime'));
      case 'rollcall': return this.press('rollcall', () => this.call('button', 'press', {entity_id: 'button.sentinel_x1_ble_roll_call'}));
      case 'resync': return this.press('resync', S('x1ble_pump_resync'));
      case 'refill': {
        const size = this.n(E.csize);
        this._confirm = {title: 'Mark the container as refilled?',
          body: `This resets the container to full (${fmt(size, 0)} mL). Only confirm after you have actually refilled it.`,
          ok: 'Yes, it\u2019s refilled', run: () => this.press('refill', S('x1ble_refill'))};
        this._render(true); return;
      }
      case 'dismiss': return this.call('script', 'x1ble_cal_dismiss');
      case 'calrun': return this.press('calrun', S('x1ble_cal_run'));
      case 'calsave': return this.press('calsave', S('x1ble_cal_save'));
      case 'capsuggest': return this.setNum(E.cap, Math.ceil(this.n(E.daily) * 1.5 * 2) / 2);
    }
  }

  _css() {
    return `
    :host{display:block;--ink:${C.ink};--muted:${C.muted};--line:${C.line};--soft:${C.soft};--blue:${C.blue};
      font-family:var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);color:var(--ink)}
    .wrap{max-width:1180px;margin:0 auto;padding:12px;background:${C.bg};border-radius:20px}
    .card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:18px;box-shadow:0 1px 2px rgba(19,35,58,.04)}
    .grid{display:grid;gap:12px;margin-top:12px}
    .grid.two{grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
    .grid.four{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
    h2,h3{margin:0 0 10px;font-size:15px;letter-spacing:.2px}
    h3.mt{margin-top:18px}
    .muted{color:var(--muted);font-weight:400}
    .label,.tlabel2{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)}
    label{display:block;font-size:12px;font-weight:600;color:var(--muted);margin:12px 0 6px}
    .head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .brand{display:flex;align-items:center;gap:12px}
    .logo{--mdc-icon-size:46px;width:46px;height:46px}
    .title{font-size:20px;font-weight:800}
    .sub{font-size:12px;color:var(--muted)}
    .head-right{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .pill{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-size:13px;font-weight:700}
    .pill ha-icon{--mdc-icon-size:16px}
    .pill.green{background:${C.greenSoft};color:${C.green}} .pill.blue{background:${C.blueSoft};color:${C.blue}}
    .pill.amber{background:${C.amberSoft};color:${C.amber}} .pill.red{background:${C.redSoft};color:${C.red}}
    .pill.grey{background:var(--soft);color:var(--muted)}
    button{font:inherit;cursor:pointer;border:none;-webkit-tap-highlight-color:transparent}
    button:disabled{opacity:.5;cursor:default}
    .toggle{display:inline-flex;align-items:center;gap:8px;background:transparent;padding:0;color:var(--ink);font-weight:600;font-size:13px}
    .toggle .knob{width:44px;height:26px;border-radius:13px;background:#CBD5E1;position:relative;transition:.2s;flex:none}
    .toggle .knob:after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:.2s;box-shadow:0 1px 2px rgba(0,0,0,.2)}
    .toggle.on .knob{background:var(--blue)} .toggle.on .knob:after{left:21px}
    .stop{display:inline-flex;align-items:center;gap:6px;background:${C.red};color:#fff;font-weight:800;padding:10px 16px;border-radius:12px;letter-spacing:.5px}
    .stop ha-icon{--mdc-icon-size:18px}
    .tabs{display:flex;gap:6px;margin-top:12px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:5px;overflow-x:auto}
    .tab{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;background:transparent;color:var(--muted);padding:10px 12px;border-radius:10px;font-weight:700;font-size:14px;white-space:nowrap}
    .tab ha-icon{--mdc-icon-size:18px}
    .tab.sel{background:${C.blueSoft};color:var(--blue)}
    .hero{display:flex;align-items:center;gap:22px;flex-wrap:wrap}
    .ring{position:relative;width:132px;height:132px;flex:none}
    .ring svg{width:100%;height:100%;transform:rotate(-90deg)}
    .ring circle{fill:none;stroke-width:11}
    .ring .track{stroke:${C.blueSoft}} .ring .bar{stroke:var(--blue);stroke-linecap:round;transition:stroke-dashoffset .6s}
    .ringtxt{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .ringtxt b{font-size:26px} .ringtxt span{font-size:12px;color:var(--muted)}
    .herotxt{flex:1;min-width:200px}
    .big{font-size:22px;font-weight:800;margin:4px 0}
    .kv{display:flex;gap:24px;margin-top:12px;flex-wrap:wrap}
    .kv.col{flex-direction:column;gap:10px}
    .kv span{display:block;font-size:12px;color:var(--muted)} .kv b{font-size:16px}
    .row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px}
    .row.gap{margin-top:12px}
    .stepper{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--soft)}
    .stepper button{width:40px;height:40px;background:transparent;font-size:20px;color:var(--blue);font-weight:700}
    .stepper input{width:72px;border:none;background:#fff;height:40px;text-align:center;font:inherit;font-weight:700;font-size:16px;color:var(--ink);-moz-appearance:textfield}
    .stepper input::-webkit-outer-spin-button,.stepper input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
    .stepper .unit{padding:0 8px 0 4px;background:#fff;height:40px;display:flex;align-items:center;font-size:13px;color:var(--muted)}
    .stepper.big button{width:46px;height:46px} .stepper.big input{height:46px;width:84px;font-size:18px} .stepper.big .unit{height:46px}
    .primary,.secondary,.ghost{display:inline-flex;align-items:center;gap:6px;border-radius:12px;font-weight:700;padding:11px 16px}
    .primary{background:var(--blue);color:#fff} .secondary{background:${C.blueSoft};color:var(--blue)}
    .ghost{background:#fff;border:1px solid currentColor;padding:7px 12px;color:inherit}
    .primary ha-icon,.secondary ha-icon{--mdc-icon-size:18px}
    .link{background:none;color:var(--blue);padding:6px 0;font-weight:700;font-size:13px}
    a{color:var(--blue);font-weight:700;cursor:pointer;text-decoration:none}
    .hint{font-size:12px;color:var(--muted);margin-top:10px;line-height:1.45}
    .warn{font-size:12px;color:${C.amber};margin-top:8px;font-weight:600}
    .calc{margin-top:8px;font-size:13px;color:var(--muted)} .calc b{color:var(--ink)}
    .tile{position:relative;min-height:120px}
    .ticon{position:absolute;right:14px;top:14px;width:34px;height:34px;border-radius:10px;background:${C.blueSoft};color:var(--blue);display:flex;align-items:center;justify-content:center}
    .ticon ha-icon{--mdc-icon-size:20px}
    .tval{font-size:26px;font-weight:800;margin:8px 0 4px} .tval small{font-size:13px;color:var(--muted);font-weight:600}
    .tval.sm{font-size:17px;line-height:1.3;padding-right:36px}
    .tval.okc{color:${C.green}} .tval.badc{color:${C.red}}
    .tsub{font-size:12px;color:var(--muted);margin-top:2px}
    .tdays{margin-top:8px;font-size:13px;color:var(--ink)} .tdays b{font-size:17px;color:var(--blue)}
    .meter{height:8px;border-radius:4px;background:${C.blueSoft};overflow:hidden;margin:6px 0}
    .meter i{display:block;height:100%;background:var(--blue);border-radius:4px} .meter i.low{background:${C.red}}
    .banner{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;margin-top:12px;flex-wrap:wrap}
    .banner>ha-icon{--mdc-icon-size:24px;flex:none}
    .banner>div:not(.bactions){flex:1;min-width:200px} .banner b{display:block} .banner span{font-size:13px}
    .banner.amber{background:${C.amberSoft};color:#8A4E0B} .banner.red{background:${C.redSoft};color:#8E2323}
    .bactions{display:flex;gap:8px}
    input.text{width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:12px;height:44px;padding:0 12px;font:inherit;font-size:15px;color:var(--ink);background:#fff}
    .times{gap:12px} .times>div{flex:1;min-width:120px} .times label{margin-top:4px}
    .seg{display:flex;background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:4px;gap:4px}
    .seg button{flex:1;background:transparent;padding:9px;border-radius:9px;font-weight:700;color:var(--muted)}
    .seg button.sel{background:#fff;color:var(--blue);box-shadow:0 1px 2px rgba(19,35,58,.12)}
    .days{display:flex;gap:6px;flex-wrap:wrap}
    .day{flex:1;min-width:42px;padding:10px 0;border-radius:10px;background:var(--soft);color:var(--muted);font-weight:700;border:1px solid var(--line)}
    .day.sel{background:var(--blue);color:#fff;border-color:var(--blue)}
    .switchrow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0}
    .switchrow span{display:block;font-size:12px;color:var(--muted)}
    .steps{margin:0;padding-left:20px} .steps li{margin-bottom:18px;line-height:1.45} .steps li>div{margin-top:8px}
    .chart{width:100%;height:auto}
    .chart rect{fill:${C.blueSoft}} .chart rect.today{fill:var(--blue)}
    .chart text{font-size:12px;fill:var(--muted);text-anchor:middle} .chart text.v{fill:var(--ink);font-weight:700}
    .chart .target{stroke:${C.amber};stroke-dasharray:5 5;stroke-width:1.5} .chart text.t{text-anchor:end;fill:${C.amber};font-size:11px}
    .log{max-height:360px;overflow:auto}
    .logrow{display:flex;gap:12px;padding:9px 0;border-bottom:1px solid var(--line);font-size:14px}
    .logrow span{color:var(--muted);min-width:96px} .logrow b{font-weight:600}
    code{background:var(--soft);padding:1px 5px;border-radius:5px}
    .modal{position:fixed;inset:0;background:rgba(19,35,58,.45);display:flex;align-items:center;justify-content:center;z-index:10;padding:16px}
    .mbox{background:#fff;border-radius:18px;padding:22px;max-width:420px;width:100%;box-shadow:0 10px 40px rgba(19,35,58,.25)}
    .mbox h3{font-size:17px} .mbox p{color:var(--muted);font-size:14px;line-height:1.5;margin:8px 0 18px}
    .mact{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap} .mact .ghost{color:var(--ink);border-color:var(--line)}
    @media (max-width:600px){.wrap{padding:8px;border-radius:0}.card{padding:14px}.title{font-size:18px}
      .head-right{width:100%;justify-content:space-between}.tab span{display:none}.tab{padding:10px}
      .ring{width:112px;height:112px}.big{font-size:19px}}
    `;
  }
}

if (!customElements.get('sentinel-x1-ble-card')) customElements.define('sentinel-x1-ble-card', SentinelX1BleCard);
window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === 'sentinel-x1-ble-card')) {
  window.customCards.push({type: 'sentinel-x1-ble-card', name: 'Sentinel X1 BLE', description: 'Kamoer X1 Bluetooth doser \u2014 dosing, setup, calibration, history'});
}
console.info(`%c SENTINEL-X1-BLE %c ${SXB_VERSION} `, `background:${SXB_BLUE};color:#fff;font-weight:700`, 'background:#fff;color:#1F6FEB');
