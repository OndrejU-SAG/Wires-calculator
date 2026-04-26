/* =====================================================================
   SWITCHBOARD TEMPERATURE RISE — IEC 61439 / IEC 60890
   ===================================================================== */

/* ---- PHYSICAL CONSTANTS (edit here if needed) ---- */
const RHO_CU   = MATERIAL.cu.rho20; // Ω·mm²/m — IEC 60228 Annex B
const ALPHA_CU = MATERIAL.cu.alpha;  // K⁻¹     — IEC 60228 Annex B
const K_DEFAULT = 5.5;   // W/(m²·K) painted steel, natural convection — IEC 61439 §10.10
const CP_AIR = 1005;     // J/(kg·K)
const RHO_AIR = 1.2;     // kg/m³

/* ---- DEVICE LOSS DATABASE (edit typical values here) ---- */
const DEVICE_LOSS_DB = {
  MCB:       (In) => Math.max(2, Math.min(4, 2 + (In / 63) * 2)) * 3,  // 2–4 W/pole × 3 poles
  MCCB:      (In) => In <= 100 ? 5 : In <= 250 ? 10 : 15,
  Contactor: (In) => Math.max(3, Math.min(10, 3 + (In / 100) * 7)),
  Relay:     ()   => 2,
  Terminal:  (n)  => n * 0.3,  // In field = number of terminals
};

/* ---- FAN VENTILATION PRESETS [label, airflow m³/h] ---- */
const FAN_PRESETS = [
  ['— preset —', ''],
  ['Mini fan ~50 m³/h (e.g. Stego HV 012)', '50'],
  ['Standard fan 120mm ~150 m³/h', '150'],
  ['Standard fan 150mm ~250 m³/h', '250'],
  ['2× fans 200mm ~400 m³/h (1 inlet + 1 outlet)', '400'],
  ['2× large fans 250mm ~600 m³/h', '600'],
];

/* ---- AWG LIST (0=1/0, -1=2/0, -2=3/0, -3=4/0) ---- */
const AWG_GAUGES = [18, 16, 14, 12, 10, 8, 6, 4, 2, 1, 0, -1, -2, -3];

/* ---- IEC mm² SIZES for switchboard (full range per IEC 60228) ---- */
const SB_MM2_LIST = [0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120];

/* ---- RITTAL TS8 VERIFIED SIZES [H, W, D] mm ---- */
const TS8_SIZES = [
  [1200, 600, 500], [1200, 800, 500], [1200, 1200, 500],
  [1400, 600, 500], [1400, 600, 600], [1400, 800, 500],
  [1400, 800, 600], [1400, 800, 800], [1400, 1200, 500],
  [1400, 1200, 600], [1600, 600, 500], [1600, 800, 500],
  [1600, 1000, 500], [1600, 1200, 500], [2000, 800, 500],
  [2000, 800, 600], [2000, 1000, 500], [2000, 1200, 600],
];

/* ---- English-only status strings for PDF ---- */
const SB_STATUS_ENG = {
  ok:   'Well within limits',
  warn: 'Acceptable',
  err:  'Exceeds IEC 61439 limit',
};

/* ===== AWG → mm² — always from formula, never hardcoded ===== */
function awgToMm2Sw(n) {
  const d = 0.127 * Math.pow(92, (36 - n) / 39);
  return Math.PI * Math.pow(d / 2, 2);
}

/* pdfSafe is provided by pdf.js (loaded before this module) */

function fmtAwgLabel(n) {
  const map = { 0: '1/0', '-1': '2/0', '-2': '3/0', '-3': '4/0' };
  return map[String(n)] ?? 'AWG ' + n;
}

/* ===== IEC 60890 §7.2 Figure 1 — natural-ventilation multiplier x ===== */
function natVentMultiplier(Ao_m2, Ae_m2) {
  if (Ao_m2 <= 0 || Ae_m2 <= 0) return 1;
  const ratio = Ao_m2 / Ae_m2;
  // Linear interpolation of IEC 60890 §7.2 Figure 1 (verified points at 0, 1%, 5%, 10%, 20%)
  const lut = [[0, 1.00], [0.01, 1.07], [0.05, 1.18], [0.10, 1.30], [0.20, 1.48]];
  for (let i = 1; i < lut.length; i++) {
    if (ratio < lut[i][0]) {
      const a = lut[i - 1], b = lut[i];
      return a[1] + (b[1] - a[1]) * (ratio - a[0]) / (b[0] - a[0]);
    }
  }
  return lut.at(-1)[1];
}

/* ===== Effective cooling surface per IEC 60890 §4 ===== */
function calcAe(h_mm, w_mm, d_mm, mounting) {
  const h = h_mm / 1000, b = w_mm / 1000, d = d_mm / 1000;
  // Wall-mounted: back and bottom excluded — IEC 60890 §4
  return mounting === 'wall'
    ? 0.7 * (2 * h * d + h * b + b * d)
    : 0.7 * (2 * h * d + 2 * h * b + b * d);
}

/* ===================================================================
   STATE
   =================================================================== */
let sbConductorMode = 'mm2';
let sbEncMode = 'custom';
let sbHeatMode = 'calc';
let sbVentOpen = false;
let sbRowId = 0;

/* Logo / company data loaded by pdf.js into _pdfLogoB64, _pdfLogoNW, _pdfLogoNH, _pdfCompany */

/* ===================================================================
   INIT
   =================================================================== */
function initSwitchboard() {
  buildTs8Dropdown();
  buildFanPresets();

  sbAddConductorRow();
  sbAddDeviceRow();
  sbUpdateAe();
  sbUpdateKHint();
}

/* ===================================================================
   SECTION 1 — CONDUCTORS
   =================================================================== */
function sbSetConductorMode(mode) {
  sbConductorMode = mode;
  document.getElementById('sb-mode-awg').classList.toggle('active', mode === 'awg');
  document.getElementById('sb-mode-mm2').classList.toggle('active', mode === 'mm2');
  document.querySelectorAll('#sb-cond-body tr').forEach(tr => {
    const id = parseInt(tr.dataset.rowId);
    _rebuildSizeCell(tr, id);
    sbCalcConductorRow(id);
  });
}

function sbAddConductorRow() {
  const id = ++sbRowId;
  const tr = document.createElement('tr');
  tr.dataset.rowId = id;
  tr.innerHTML = _conductorRowHTML(id);
  document.getElementById('sb-cond-body').appendChild(tr);
  sbCalcConductorRow(id);
}

function _conductorRowHTML(id) {
  return `<td>${_sizeCellHTML(id)}</td>
    <td><input type="number" id="sb-cl-${id}" value="10" min="0.1" step="any" oninput="sbCalcConductorRow(${id})"></td>
    <td><input type="number" id="sb-ci-${id}" value="16" min="0" step="any" oninput="sbCalcConductorRow(${id})"></td>
    <td><input type="number" id="sb-cn-${id}" value="1" min="1" step="1" oninput="sbCalcConductorRow(${id})"></td>
    <td id="sb-cp-${id}" style="font-family:'Roboto Mono',monospace;color:var(--pri);font-weight:600;white-space:nowrap">—</td>
    <td><button class="sb-del-btn" onclick="sbRemoveConductorRow(${id})">✕</button></td>`;
}

function _sizeCellHTML(id) {
  if (sbConductorMode === 'awg') {
    const opts = AWG_GAUGES.map(n => `<option value="${n}">${fmtAwgLabel(n)}</option>`).join('');
    return `<div><select id="sb-cs-${id}" onchange="sbCalcConductorRow(${id})">${opts}</select>
      <div class="mm2-hint" id="sb-cm-${id}"></div></div>`;
  }
  const opts = SB_MM2_LIST.map(v => `<option value="${v}"${v === 2.5 ? ' selected' : ''}>${v} mm²</option>`).join('');
  return `<select id="sb-cs-${id}" onchange="sbCalcConductorRow(${id})">${opts}</select>`;
}

function _rebuildSizeCell(tr, id) { tr.cells[0].innerHTML = _sizeCellHTML(id); }

function sbRemoveConductorRow(id) {
  document.querySelector(`#sb-cond-body tr[data-row-id="${id}"]`)?.remove();
  sbCalcAllConductors();
}

function sbCondTempChanged() {
  document.querySelectorAll('#sb-cond-body tr').forEach(tr => {
    sbCalcConductorRow(parseInt(tr.dataset.rowId));
  });
}

function sbCalcConductorRow(id) {
  const selEl = document.getElementById(`sb-cs-${id}`);
  if (!selEl) return;
  const L = parseFloat(document.getElementById(`sb-cl-${id}`).value) || 0;
  const I = parseFloat(document.getElementById(`sb-ci-${id}`).value) || 0;
  const n = parseInt(document.getElementById(`sb-cn-${id}`).value) || 1;

  // ρ(T) = ρ20 × (1 + α × (T − 20))  — IEC 60228 Annex B / IEC 61439-1 §10.10
  const T_c = parseFloat(document.getElementById('sb-cond-temp')?.value) ?? 70;
  const rho_T = RHO_CU * (1 + ALPHA_CU * (T_c - 20));

  let A_mm2;
  if (sbConductorMode === 'awg') {
    const gauge = parseInt(selEl.value);
    A_mm2 = awgToMm2Sw(gauge);
    const hint = document.getElementById(`sb-cm-${id}`);
    if (hint) hint.textContent = `= ${A_mm2.toFixed(3)} mm²`;
  } else {
    A_mm2 = parseFloat(selEl.value) || 0;
  }

  // P = I² × ρ(T) / A × L × n
  const P = A_mm2 > 0 ? I * I * (rho_T / A_mm2) * L * n : 0;
  document.getElementById(`sb-cp-${id}`).textContent = P.toFixed(2) + ' W';
  sbCalcAllConductors();
}

function sbCalcAllConductors() {
  let total = 0;
  document.querySelectorAll('#sb-cond-body tr').forEach(tr => {
    const pEl = document.getElementById(`sb-cp-${tr.dataset.rowId}`);
    if (pEl) total += parseFloat(pEl.textContent) || 0;
  });
  const el = document.getElementById('sb-cond-subtotal');
  if (el) el.innerHTML = (T[lang].sbSubtotal || 'Subtotal') + ': <span>' + total.toFixed(2) + ' W</span>';
  return total;
}

/* ===================================================================
   SECTION 2 — DEVICES
   =================================================================== */
function sbAddDeviceRow() {
  const id = ++sbRowId;
  const tr = document.createElement('tr');
  tr.dataset.rowId = id;
  tr.innerHTML = _deviceRowHTML(id);
  document.getElementById('sb-dev-body').appendChild(tr);
  sbCalcDeviceRow(id);
}

function _deviceRowHTML(id) {
  const types = ['MCB', 'MCCB', 'Contactor', 'Relay', 'VFD / Soft starter', 'Terminal block', 'Other'];
  const opts = types.map(t => `<option value="${t}">${t}</option>`).join('');
  const suggest = T[lang] && T[lang].sbSuggest || 'Suggest';
  return `
    <td>
      <select id="sb-dt-${id}">${opts}</select>
      <input type="text" id="sb-dl-${id}" placeholder="Label…" class="sb-label-input">
    </td>
    <td><input type="number" id="sb-din-${id}" value="16" min="0" step="any"></td>
    <td><input type="number" id="sb-dp-${id}" value="0" min="0" step="any" oninput="sbCalcDeviceRow(${id})"><span style="font-size:10px;color:var(--on-surf-var)">W/ks</span></td>
    <td><input type="number" id="sb-dn-${id}" value="1" min="1" step="1" oninput="sbCalcDeviceRow(${id})"></td>
    <td id="sb-dpt-${id}" style="font-family:'Roboto Mono',monospace;color:var(--pri);font-weight:600;white-space:nowrap">0.00 W</td>
    <td>
      <button class="sb-suggest-btn" onclick="sbSuggestLoss(${id})">${suggest}</button>
      <button class="sb-del-btn" style="margin-top:4px" onclick="sbRemoveDeviceRow(${id})">✕</button>
    </td>`;
}

function sbRemoveDeviceRow(id) {
  document.querySelector(`#sb-dev-body tr[data-row-id="${id}"]`)?.remove();
  sbCalcAllDevices();
}

function sbCalcDeviceRow(id) {
  const P = parseFloat(document.getElementById(`sb-dp-${id}`)?.value) || 0;
  const n = parseInt(document.getElementById(`sb-dn-${id}`)?.value) || 1;
  const total = P * n;
  const el = document.getElementById(`sb-dpt-${id}`);
  if (el) el.textContent = total.toFixed(2) + ' W';
  sbCalcAllDevices();
}

function sbSuggestLoss(id) {
  const type = document.getElementById(`sb-dt-${id}`).value;
  const In = parseFloat(document.getElementById(`sb-din-${id}`).value) || 1;
  if (type === 'VFD / Soft starter') {
    showToast('Typically 2–3% of rated motor power — enter W manually');
    return;
  }
  let P = 0;
  if (type === 'Terminal block') P = DEVICE_LOSS_DB.Terminal(In);
  else if (DEVICE_LOSS_DB[type]) P = DEVICE_LOSS_DB[type](In);
  document.getElementById(`sb-dp-${id}`).value = P.toFixed(1);
  sbCalcDeviceRow(id);
}

function sbCalcAllDevices() {
  let total = 0;
  document.querySelectorAll('#sb-dev-body tr').forEach(tr => {
    const el = document.getElementById(`sb-dpt-${tr.dataset.rowId}`);
    if (el) total += parseFloat(el.textContent) || 0;
  });
  const el = document.getElementById('sb-dev-subtotal');
  if (el) el.innerHTML = (T[lang].sbDevSubtotal || 'Device subtotal') + ': <span>' + total.toFixed(2) + ' W</span>';
  return total;
}

/* ===================================================================
   SECTION 3 — ENCLOSURE + HEAT DISSIPATION (merged)
   =================================================================== */
function buildTs8Dropdown() {
  const sel = document.getElementById('sb-ts8-sel');
  if (!sel) return;
  TS8_SIZES.forEach(([h, w, d]) => {
    const opt = document.createElement('option');
    opt.value = `${h},${w},${d}`;
    opt.textContent = `${h} × ${w} × ${d} mm`;
    sel.appendChild(opt);
  });
}

function sbSetEncMode(mode) {
  sbEncMode = mode;
  document.getElementById('sb-enc-custom-tab').classList.toggle('active', mode === 'custom');
  document.getElementById('sb-enc-ts8-tab').classList.toggle('active', mode === 'ts8');
  document.getElementById('sb-enc-ts8').style.display = mode === 'ts8' ? '' : 'none';
  const isTs8 = mode === 'ts8';
  ['sb-enc-h', 'sb-enc-w', 'sb-enc-d'].forEach(id => {
    document.getElementById(id).disabled = isTs8;
  });
  if (isTs8) sbApplyTs8();
  sbUpdateAe();
}

function sbApplyTs8() {
  const sel = document.getElementById('sb-ts8-sel');
  if (!sel || !sel.value) return;
  const [h, w, d] = sel.value.split(',').map(Number);
  document.getElementById('sb-enc-h').value = h;
  document.getElementById('sb-enc-w').value = w;
  document.getElementById('sb-enc-d').value = d;
  sbUpdateAe();
}

function sbTs8Changed() { sbApplyTs8(); }

function sbUpdateAe() {
  const h = parseFloat(document.getElementById('sb-enc-h').value) || 0;
  const w = parseFloat(document.getElementById('sb-enc-w').value) || 0;
  const d = parseFloat(document.getElementById('sb-enc-d').value) || 0;
  const mounting = document.getElementById('sb-mounting').value;
  const Ae = (h > 0 && w > 0 && d > 0) ? calcAe(h, w, d, mounting) : 0;
  const el = document.getElementById('sb-ae-display');
  if (el) el.innerHTML = 'Ae = <span>' + Ae.toFixed(4) + ' m²</span>';
  sbUpdateKHint();
  if (document.getElementById('sb-res-card').style.display === 'block') sbCalculate();
}

function sbUpdateKHint() {
  const h = parseFloat(document.getElementById('sb-enc-h').value) || 0;
  const w = parseFloat(document.getElementById('sb-enc-w').value) || 0;
  const d = parseFloat(document.getElementById('sb-enc-d').value) || 0;
  const mounting = document.getElementById('sb-mounting').value;
  const Ae = (h > 0 && w > 0 && d > 0) ? calcAe(h, w, d, mounting) : 0;
  const k = parseFloat(document.getElementById('sb-k-val')?.value) || K_DEFAULT;
  const el = document.getElementById('sb-k-hint');
  if (el && Ae > 0) {
    el.textContent = `ΔT = Pt / (${k} × ${Ae.toFixed(4)}) = Pt / ${(k * Ae).toFixed(3)} [W/K]`;
  } else if (el) {
    el.textContent = 'ΔT = Pt / (k × Ae)  [IEC 61439]';
  }
}

function sbSetHeatModeUI(btn, mode) {
  btn.closest('.seg-group').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  sbHeatMode = mode;
  document.getElementById('sb-heat-calc-row').style.display = mode === 'calc' ? '' : 'none';
  document.getElementById('sb-heat-manual-row').style.display = mode === 'manual' ? '' : 'none';
}

function sbResetK() {
  document.getElementById('sb-k-val').value = K_DEFAULT;
  sbKChanged();
}

function sbKChanged() {
  sbUpdateKHint();
  if (document.getElementById('sb-res-card').style.display === 'block') sbCalculate();
}

function sbKManualEdit() {
  const preset = document.getElementById('sb-k-preset');
  if (preset) preset.value = '';
  sbKChanged();
}

function sbApplyKPreset(val) {
  if (!val) return;
  document.getElementById('sb-k-val').value = val;
  sbKChanged();
}

/* ===================================================================
   SECTION 4 — VENTILATION
   =================================================================== */
function buildFanPresets() {
  const sel = document.getElementById('sb-fan-preset');
  if (!sel) return;
  FAN_PRESETS.forEach(([label, val]) => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    sel.appendChild(opt);
  });
}

function sbToggleVent() {
  sbVentOpen = !sbVentOpen;
  const body = document.getElementById('sb-vent-body');
  const arrow = document.getElementById('sb-vent-arrow');
  body.style.maxHeight = sbVentOpen ? (body.scrollHeight + 300) + 'px' : '0';
  arrow.classList.toggle('open', sbVentOpen);
}

function sbToggleNatVent(cb) {
  document.getElementById('sb-nat-fields').style.display = cb.checked ? '' : 'none';
}

function sbToggleForceVent(cb) {
  document.getElementById('sb-force-fields').style.display = cb.checked ? '' : 'none';
}

function sbApplyFanPreset(val) {
  if (!val) return;
  document.getElementById('sb-force-on').checked = true;
  sbToggleForceVent(document.getElementById('sb-force-on'));
  document.getElementById('sb-airflow').value = val;
}

/* ===================================================================
   MAIN CALCULATION
   =================================================================== */
function sbCalculate() {
  const errEl = document.getElementById('sb-err');
  errEl.style.display = 'none';

  const h = parseFloat(document.getElementById('sb-enc-h').value);
  const w = parseFloat(document.getElementById('sb-enc-w').value);
  const d = parseFloat(document.getElementById('sb-enc-d').value);
  const mounting = document.getElementById('sb-mounting').value;
  const Ta = parseFloat(document.getElementById('sb-ta').value);

  if (!h || !w || !d || isNaN(Ta) || h <= 0 || w <= 0 || d <= 0) {
    errEl.textContent = T[lang].sbErrFill;
    errEl.style.display = 'block';
    return;
  }

  const P_cables = sbCalcAllConductors();
  const P_devices = sbCalcAllDevices();
  const Pt = P_cables + P_devices;

  // Effective cooling surface — IEC 60890 §4
  const Ae = calcAe(h, w, d, mounting);

  // Natural ventilation — IEC 60890 §7.2 Figure 1
  const natOn = document.getElementById('sb-nat-on').checked;
  const openTop_cm2 = natOn ? (parseFloat(document.getElementById('sb-open-top').value) || 0) : 0;
  const openBot_cm2 = natOn ? (parseFloat(document.getElementById('sb-open-bot').value) || 0) : 0;
  const Ao_m2 = (openTop_cm2 + openBot_cm2) * 1e-4;
  const natRatio = Ae > 0 ? Ao_m2 / Ae : 0;
  const natX = natOn ? natVentMultiplier(Ao_m2, Ae) : 1;
  const Ae_total = Ae * natX;

  // Manual heat dissipation mode: user provides total W/K, ΔT = Pt / K_diss
  if (sbHeatMode === 'manual') {
    const K_diss = parseFloat(document.getElementById('sb-manual-dissipation').value) || 0;
    const dT = K_diss > 0 ? Pt / K_diss : 0;
    _sbShowResults({ P_cables, P_devices, Pt, Ae, natX, natRatio, Ao_m2, Ae_total, dT, Ta,
      k: null, K_diss, Q: 0, h_mm: h, w_mm: w, d_mm: d, mounting, natOn, forceOn: false, openTop_cm2, openBot_cm2 });
    return;
  }

  const k = parseFloat(document.getElementById('sb-k-val').value) || K_DEFAULT;

  const forceOn = document.getElementById('sb-force-on').checked;
  const Q_m3s = forceOn ? (parseFloat(document.getElementById('sb-airflow').value) || 0) / 3600 : 0;

  const denom = k * Ae_total + CP_AIR * RHO_AIR * Q_m3s;
  const dT = denom > 0 ? Pt / denom : 0;

  _sbShowResults({ P_cables, P_devices, Pt, Ae, natX, natRatio, Ao_m2, Ae_total, dT, Ta,
    k, K_diss: null, Q: Q_m3s, h_mm: h, w_mm: w, d_mm: d, mounting, natOn, forceOn, openTop_cm2, openBot_cm2 });
}

function _sbShowResults(r) {
  const { P_cables, P_devices, Pt, Ae_total, dT, Ta } = r;
  const Ti = Ta + dT;

  let statusClass, statusKey;
  if (dT <= 10) { statusClass = 'green'; statusKey = 'ok'; }
  else if (dT <= 15) { statusClass = 'yellow'; statusKey = 'warn'; }
  else { statusClass = 'red'; statusKey = 'err'; }

  document.getElementById('sb-r-cables').textContent = P_cables.toFixed(2) + ' W';
  document.getElementById('sb-r-devices').textContent = P_devices.toFixed(2) + ' W';
  document.getElementById('sb-r-total').textContent = Pt.toFixed(2) + ' W';
  document.getElementById('sb-r-ae').textContent = Ae_total.toFixed(4) + ' m²';
  document.getElementById('sb-r-dt').textContent = dT.toFixed(2) + ' K';
  document.getElementById('sb-r-ti').textContent = Ti.toFixed(2) + ' °C';

  const badge = document.getElementById('sb-r-status');
  badge.textContent = T[lang]['sbStatus' + statusKey.charAt(0).toUpperCase() + statusKey.slice(1)];
  badge.className = 'sb-status-badge ' + statusClass;

  document.getElementById('sb-status-hot').style.display = Ti > 55 ? 'block' : 'none';

  _sbBuildSteps(r, dT, Ti);

  document.getElementById('sb-res-card').style.display = 'block';
  document.getElementById('sb-res-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  window._sbLastResult = { ...r, dT, Ti, statusClass, statusKey };
}

function _sbBuildSteps(r, dT, Ti) {
  const { P_cables, P_devices, Pt, Ae, natX, natRatio, Ao_m2, Ae_total, Ta, k, K_diss, Q, h_mm, w_mm, d_mm, mounting, natOn, forceOn, openTop_cm2, openBot_cm2 } = r;
  const hm = h_mm / 1000, wm = w_mm / 1000, dm = d_mm / 1000;
  const lines = [];
  let step = 1;

  // Per-conductor calculations
  const T_c = parseFloat(document.getElementById('sb-cond-temp')?.value) ?? 70;
  const rho_T = RHO_CU * (1 + ALPHA_CU * (T_c - 20));

  document.querySelectorAll('#sb-cond-body tr').forEach(tr => {
    const id = tr.dataset.rowId;
    const selEl = document.getElementById(`sb-cs-${id}`);
    if (!selEl) return;
    const L = parseFloat(document.getElementById(`sb-cl-${id}`)?.value) || 0;
    const I = parseFloat(document.getElementById(`sb-ci-${id}`)?.value) || 0;
    const n = parseInt(document.getElementById(`sb-cn-${id}`)?.value) || 1;
    let A_mm2, sizeLabel;
    if (sbConductorMode === 'awg') {
      const gauge = parseInt(selEl.value);
      A_mm2 = awgToMm2Sw(gauge);
      const d_wire = 0.127 * Math.pow(92, (36 - gauge) / 39);
      sizeLabel = fmtAwgLabel(gauge);
      lines.push(`${step++}. Conductor ${sizeLabel} → mm²:\n   d = 0.127 × 92^((36−${gauge})/39) = ${d_wire.toFixed(4)} mm\n   A = π × (d/2)² = ${A_mm2.toFixed(4)} mm²`);
    } else {
      A_mm2 = parseFloat(selEl.value) || 0;
      sizeLabel = A_mm2 + ' mm²';
    }
    const r_m = A_mm2 > 0 ? rho_T / A_mm2 : 0;
    const P = A_mm2 > 0 ? I * I * r_m * L * n : 0;
    lines.push(`${step++}. Conductor ${sizeLabel}, L=${L}m, I=${I}A, n=${n}, T=${T_c}°C:\n   ρ(${T_c}°C) = ${RHO_CU} × (1 + ${ALPHA_CU} × (${T_c}−20)) = ${rho_T.toFixed(5)} Ω·mm²/m  [IEC 60228 Annex B]\n   r = ρ(T)/A = ${rho_T.toFixed(5)}/${A_mm2} = ${r_m.toFixed(5)} Ω/m\n   P = I² × r × L × n = ${I}² × ${r_m.toFixed(5)} × ${L} × ${n} = ${P.toFixed(3)} W`);
  });

  lines.push(`${step++}. Total conductor losses:\n   P_cables = ${P_cables.toFixed(2)} W`);

  // Per-device
  document.querySelectorAll('#sb-dev-body tr').forEach(tr => {
    const id = tr.dataset.rowId;
    const typeEl = document.getElementById(`sb-dt-${id}`);
    if (!typeEl) return;
    const type = typeEl.value;
    const label = document.getElementById(`sb-dl-${id}`)?.value || '';
    const P_unit = parseFloat(document.getElementById(`sb-dp-${id}`)?.value) || 0;
    const n = parseInt(document.getElementById(`sb-dn-${id}`)?.value) || 1;
    const Ptot = P_unit * n;
    const desc = label ? `${type} "${label}"` : type;
    lines.push(`${step++}. Device ${desc}, n=${n}:\n   P = ${P_unit} W/unit × ${n} = ${Ptot.toFixed(2)} W`);
  });

  lines.push(`${step++}. Total device losses:\n   P_devices = ${P_devices.toFixed(2)} W`);
  lines.push(`${step++}. Total internal losses:\n   Pt = P_cables + P_devices = ${P_cables.toFixed(2)} + ${P_devices.toFixed(2)} = ${Pt.toFixed(2)} W`);

  const fmla = mounting === 'wall'
    ? `Ae = 0.7 × (2·h·d + h·b + b·d)  [wall-mounted — IEC 60890 §4]`
    : `Ae = 0.7 × (2·h·d + 2·h·b + b·d)  [free-standing — IEC 60890 §4]`;
  const term2 = mounting === 'wall' ? hm * wm : 2 * hm * wm;
  lines.push(`${step++}. Effective cooling surface:\n   ${fmla}\n   h=${hm}m, b=${wm}m, d=${dm}m\n   Ae = 0.7 × (${(2*hm*dm).toFixed(4)} + ${term2.toFixed(4)} + ${(wm*dm).toFixed(4)}) = ${Ae.toFixed(4)} m²`);

  if (natOn) {
    const Ao_cm2 = openTop_cm2 + openBot_cm2;
    if (Ao_m2 > 0) {
      lines.push(`${step++}. Natural ventilation — IEC 60890 §7.2 Figure 1:\n   A_top = ${openTop_cm2.toFixed(1)} cm²,  A_bot = ${openBot_cm2.toFixed(1)} cm²\n   Ao = ${Ao_cm2.toFixed(1)} cm² = ${Ao_m2.toFixed(6)} m²\n   ratio = Ao / Ae = ${Ao_m2.toFixed(6)} / ${Ae.toFixed(4)} = ${natRatio.toFixed(5)}\n   x = ${natX.toFixed(4)}  [IEC 60890 §7.2 Figure 1]\n   Ae_total = Ae × x = ${Ae.toFixed(4)} × ${natX.toFixed(4)} = ${Ae_total.toFixed(4)} m²`);
    } else {
      lines.push(`${step++}. Natural ventilation enabled — no openings entered; Ae_total = Ae = ${Ae.toFixed(4)} m²`);
    }
  }

  if (k !== null) {
    if (forceOn && Q > 0) {
      const Q_h = (Q * 3600).toFixed(0);
      lines.push(`${step++}. Temperature rise (natural + forced ventilation):\n   ΔT = Pt / (k·Ae_total + cp·ρ·Q)\n   cp = ${CP_AIR} J/(kg·K), ρ = ${RHO_AIR} kg/m³, Q = ${Q_h} m³/h = ${Q.toFixed(5)} m³/s\n   ΔT = ${Pt.toFixed(2)} / (${k}×${Ae_total.toFixed(4)} + ${CP_AIR}×${RHO_AIR}×${Q.toFixed(5)})\n   ΔT = ${Pt.toFixed(2)} / ${(k*Ae_total + CP_AIR*RHO_AIR*Q).toFixed(3)} = ${dT.toFixed(2)} K`);
    } else {
      lines.push(`${step++}. Temperature rise:\n   ΔT = Pt / (k × Ae_total) = ${Pt.toFixed(2)} / (${k} × ${Ae_total.toFixed(4)})\n   ΔT = ${Pt.toFixed(2)} / ${(k * Ae_total).toFixed(3)} = ${dT.toFixed(2)} K`);
    }
  } else {
    lines.push(`${step++}. Temperature rise (manual dissipation):\n   ΔT = Pt / K_diss = ${Pt.toFixed(2)} / ${K_diss} = ${dT.toFixed(2)} K`);
  }

  lines.push(`${step++}. Internal temperature:\n   Ti = Ta + ΔT = ${Ta} + ${dT.toFixed(2)} = ${Ti.toFixed(2)} °C`);

  const limitNote = dT <= 10 ? '✓ Within IEC 61439 limit (ΔT_max = 15 K)'
    : dT <= 15 ? '⚠ Within limit but close to maximum'
    : '✗ Exceeds IEC 61439 limit (ΔT_max = 15 K) — consider larger enclosure or forced ventilation';
  lines.push(`Conclusion: ${limitNote}`);

  document.getElementById('sb-steps').textContent = lines.join('\n\n');
}

/* ===================================================================
   PDF EXPORT
   =================================================================== */
async function sbDownloadPdf() {
  const btn = document.getElementById('sb-pdf-btn');
  btn.textContent = 'Generating…';
  btn.disabled = true;

  try {
    if (!window.jspdf && !window.jsPDF) { showToast('jsPDF not loaded'); return; }
    const { jsPDF } = window.jspdf || window;
    const r = window._sbLastResult;
    if (!r) { showToast('No results — calculate first'); return; }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const PW = 210, PH = 297, M = 15;
    const CW = PW - M * 2;
    const ACC = [26, 82, 118]; // accent blue

    // ---- HEADER / FOOTER (shared helpers from pdf.js) ----
    const engineer = document.getElementById('sb-engineer')?.value.trim() || '';

    function drawHeader(pageNum, totalPages) {
      pdfMakeHeader(doc, { PW, M, title: 'Switchboard Temperature Rise Calculation' });
      drawFooter(pageNum, totalPages);
    }

    function drawFooter(pageNum, totalPages) {
      pdfMakeFooter(doc, { PW, PH, M, pageNum, totalPages, engineer, standard: 'IEC 61439 / IEC 60890' });
    }

    // ---- TABLE HELPER ----
    function pdfSection(y, title) {
      if (y > PH - M - 25) { doc.addPage(); return [margin30(), title]; }
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...ACC);
      doc.text(title, M, y); return y + 6;
    }
    function margin30() { return M + 22; }

    function inputTable(y, rows) {
      const RH = 6.5;
      rows.forEach(([label, value], i) => {
        if (i % 2 === 0) { doc.setFillColor(245, 247, 250); doc.rect(M, y, CW, RH, 'F'); }
        doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.1);
        doc.rect(M, y, CW, RH);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
        doc.text(pdfSafe(label), M + 3, y + 4.5);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
        doc.text(pdfSafe(String(value)), M + CW - 3, y + 4.5, { align: 'right' });
        y += RH;
      });
      return y;
    }

    function resultsBox(y, r) {
      const rows = [
        ['Total cable losses',     r.P_cables.toFixed(2) + ' W'],
        ['Total device losses',    r.P_devices.toFixed(2) + ' W'],
        ['Total internal losses',  r.Pt.toFixed(2) + ' W'],
        ['Effective cooling area', r.Ae_total.toFixed(4) + ' m²'],
        ['Temperature rise ΔT',   r.dT.toFixed(2) + ' K'],
        ['Internal temperature Ti',r.Ti.toFixed(2) + ' °C'],
        ['Status',                 SB_STATUS_ENG[r.statusKey]],
      ];
      const boxH = rows.length * 7 + 4;
      doc.setFillColor(235, 244, 252); doc.setDrawColor(...ACC); doc.setLineWidth(0.5);
      doc.rect(M, y, CW, boxH, 'FD');
      rows.forEach(([label, value], i) => {
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(70, 70, 70);
        doc.text(pdfSafe(label), M + 4, y + 5.5 + i * 7);
        doc.setFont('helvetica', 'bold');
        // colour status according to result
        if (i === rows.length - 1) {
          const col = r.statusKey === 'ok' ? [0, 160, 80] : r.statusKey === 'warn' ? [180, 120, 0] : [200, 40, 40];
          doc.setTextColor(...col);
        } else {
          doc.setTextColor(30, 30, 30);
        }
        doc.text(pdfSafe(value), M + CW - 4, y + 5.5 + i * 7, { align: 'right' });
      });
      return y + boxH + 4;
    }

    function enclosureSketch(doc, x, y, h_mm, w_mm, d_mm, MAX_W = 65, MAX_H = 55) {
      const scale = Math.min(MAX_W / w_mm, MAX_H / h_mm);
      const fw = w_mm * scale;
      const fh = h_mm * scale;
      const dOff = Math.min(d_mm * scale * 0.28, 14);
      const ang = 0.38;

      doc.setDrawColor(70, 70, 70); doc.setLineWidth(0.4);
      doc.rect(x, y, fw, fh);
      // Top face
      [[x,y],[x+dOff,y-dOff*ang],[x+fw+dOff,y-dOff*ang],[x+fw,y]].reduce((a,b,i,arr)=>{
        if (i>0) doc.line(a[0],a[1],b[0],b[1]); return b;
      });
      doc.line(x+fw+dOff, y-dOff*ang, x+fw, y);
      // Right face
      doc.line(x+fw, y, x+fw+dOff, y-dOff*ang);
      doc.line(x+fw, y+fh, x+fw+dOff, y+fh-dOff*ang);
      doc.line(x+fw+dOff, y-dOff*ang, x+fw+dOff, y+fh-dOff*ang);

      doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(70,70,70);
      doc.text(`H=${h_mm}`, x-1, y+fh/2, {align:'right'});
      doc.text(`W=${w_mm}`, x+fw/2, y+fh+4.5, {align:'center'});
      doc.text(`D=${d_mm}`, x+fw+dOff+2, y+fh/2-dOff*ang/2);
      doc.setFontSize(7.5); doc.setTextColor(120,120,120);
      doc.text('Enclosure (schematic)', x+fw/2, y+fh+9, {align:'center'});
    }

    function dataTable(doc, y, pageH, headers, rows, colW) {
      const RH = 6.5;
      // header
      doc.setFillColor(...ACC); doc.rect(M, y, CW, RH, 'F');
      doc.setFontSize(8.5); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
      let cx = M;
      headers.forEach((h, i) => {
        const isNum = i > 0;
        doc.text(h, isNum ? cx + colW[i] - 2 : cx + 2, y + 4.5, isNum ? {align:'right'} : {});
        cx += colW[i];
      });
      y += RH;

      rows.forEach((row, ri) => {
        if (y > pageH - M - 12) { doc.addPage(); y = M + 15; }
        if (ri % 2 === 1) { doc.setFillColor(245,247,250); doc.rect(M, y, CW, RH, 'F'); }
        doc.setDrawColor(215,215,215); doc.setLineWidth(0.1);
        doc.rect(M, y, CW, RH);
        cx = M;
        row.forEach((cell, i) => {
          doc.setFontSize(8.5); doc.setFont('helvetica','normal'); doc.setTextColor(40,40,40);
          const isNum = i >= 2;  // columns 0 (index), 1 (label/type) left-aligned; rest right
          doc.text(String(cell), isNum ? cx + colW[i] - 2 : cx + 2, y + 4.5,
            isNum ? {align:'right', maxWidth: colW[i]-3} : {maxWidth: colW[i]-3});
          cx += colW[i];
        });
        y += RH;
      });

      // totals
      const lossIdx = rows[0]?.length - 1;
      if (lossIdx >= 0) {
        const tot = rows.reduce((s, row) => s + (parseFloat(row[lossIdx]) || 0), 0);
        doc.setFillColor(218, 232, 246); doc.rect(M, y, CW, RH, 'F');
        doc.setFontSize(8.5); doc.setFont('helvetica','bold'); doc.setTextColor(...ACC);
        doc.text('Total', M + 2, y + 4.5);
        doc.text(tot.toFixed(2) + ' W', M + CW - 2, y + 4.5, {align:'right'});
        y += RH;
      }
      return y;
    }

    // ---- READ PHOTOS ----
    async function readPhotoData(inputId) {
      const file = document.getElementById(inputId)?.files[0];
      if (!file) return null;
      return new Promise(res => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const ar = img.naturalWidth / img.naturalHeight;
          URL.revokeObjectURL(url);
          const fr = new FileReader();
          fr.onload = () => res({ b64: fr.result, ar, type: file.type.includes('png') ? 'PNG' : 'JPEG' });
          fr.readAsDataURL(file);
        };
        img.onerror = () => { URL.revokeObjectURL(url); res(null); };
        img.src = url;
      });
    }
    const [photo1, photo2] = await Promise.all([readPhotoData('sb-photo1'), readPhotoData('sb-photo2')]);
    const photos = [photo1, photo2].filter(Boolean);

    // ---- GATHER DATA ----
    const encSrc = sbEncMode === 'ts8' ? 'Rittal TS8' : 'Custom dimensions';
    const mountStr = document.getElementById('sb-mounting').value === 'wall' ? 'Wall-mounted' : 'Free-standing';
    const kStr = sbHeatMode === 'calc'
      ? (parseFloat(document.getElementById('sb-k-val').value) || K_DEFAULT) + ' W/(m²·K)'
      : 'Manual';
    const natOn = document.getElementById('sb-nat-on').checked;
    const forceOn = document.getElementById('sb-force-on').checked;

    const condRows = _getConductorTableData();
    const devRows = _getDeviceTableData();

    // ---- PAGE 1: Input Summary + Results + Sketch ----
    const TOTAL_PAGES = 2;
    drawHeader(1, TOTAL_PAGES);
    let y = M + 22;

    y = pdfSection(y, 'Input Summary');
    y = inputTable(y, [
      ['Enclosure (H × W × D)', `${r.h_mm} × ${r.w_mm} × ${r.d_mm} mm`],
      ['Mounting',              mountStr],
      ['Enclosure source',      encSrc],
      ['Ambient temperature Ta', document.getElementById('sb-ta').value + ' °C'],
      ['Convection coeff. k',   kStr],
      ['Effective cooling area Ae', r.Ae_total.toFixed(4) + ' m²'],
      ['Natural ventilation',   natOn ? `On (top: ${document.getElementById('sb-open-top').value || 0} cm², bot: ${document.getElementById('sb-open-bot').value || 0} cm²)` : 'Off'],
      ['Forced ventilation',    forceOn ? `On (${document.getElementById('sb-airflow').value || 0} m³/h)` : 'Off'],
    ]);
    y += 5;

    y = pdfSection(y, 'Results');
    y = resultsBox(y, r);
    y += 4;

    // ---- Enclosure sketch + optional photos (side by side) ----
    const SKETCH_MAX_W = 65, SKETCH_MAX_H = 55;
    const sketchStartY = y;
    enclosureSketch(doc, M, sketchStartY, r.h_mm, r.w_mm, r.d_mm, SKETCH_MAX_W, SKETCH_MAX_H);

    if (photos.length > 0) {
      const photoX = M + SKETCH_MAX_W + 10;
      const photoAvailW = CW - SKETCH_MAX_W - 10;
      const slotH = photos.length === 1 ? SKETCH_MAX_H : (SKETCH_MAX_H - 5) / 2;
      let pY = sketchStartY;
      photos.forEach((ph, i) => {
        const fitH = Math.min(slotH, photoAvailW / ph.ar);
        const fitW = fitH * ph.ar;
        try { doc.addImage(ph.b64, ph.type, photoX, pY, fitW, fitH); } catch (e) {}
        if (i < photos.length - 1) pY += slotH + 5;
      });
    }

    y = sketchStartY + SKETCH_MAX_H + 10;

    // ---- PAGE 2: Tables + Calculations ----
    doc.addPage();
    drawHeader(2, TOTAL_PAGES);
    y = M + 22;

    // Conductor table
    y = pdfSection(y, 'Conductor Losses');
    y = dataTable(doc, y, PH, ['#', 'Size', 'L [m]', 'I [A]', 'n', 'Loss [W]'],
      condRows, [10, 38, 20, 20, 14, 28]);
    y += 6;

    // Device table
    if (y > PH - M - 40) { doc.addPage(); drawHeader(TOTAL_PAGES, TOTAL_PAGES); y = M + 22; }
    y = pdfSection(y, 'Device Losses');
    y = dataTable(doc, y, PH, ['#', 'Label', 'Type', 'In [A]', 'W/unit', 'n', 'Total [W]'],
      devRows, [10, 30, 30, 18, 18, 12, 22]);
    y += 8;

    // Calculations
    if (y > PH - M - 40) { doc.addPage(); drawHeader(TOTAL_PAGES, TOTAL_PAGES); y = M + 22; }
    y = pdfSection(y, 'Step-by-Step Calculations');
    const steps = document.getElementById('sb-steps').textContent.split('\n\n');
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40);
    steps.forEach(block => {
      const lines = block.split('\n');
      const blockH = lines.length * 4.5 + 5;
      if (y + blockH > PH - M - 10) {
        doc.addPage(); drawHeader(TOTAL_PAGES, TOTAL_PAGES); y = M + 22;
      }
      lines.forEach((line, li) => {
        if (!line.trim()) return;
        const indented = line.startsWith('   ');
        const isBold = li === 0;
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.setTextColor(isBold ? ACC[0] : 40, isBold ? ACC[1] : 40, isBold ? ACC[2] : 40);
        doc.text(pdfSafe(line.trimStart()), M + (indented ? 6 : 0), y);
        y += 4.5;
      });
      doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.2);
      doc.line(M, y + 1, PW - M, y + 1);
      y += 5;
    });

    const realTotal = doc.getNumberOfPages();
    for (let p = 1; p <= realTotal; p++) {
      doc.setPage(p);
      doc.setFillColor(255, 255, 255);
      doc.rect(0, PH - M - 8, PW, 25, 'F');
      drawFooter(p, realTotal);
    }
    doc.save('switchboard-temp-rise.pdf');
    showToast('PDF downloaded ✓');
  } catch (e) {
    console.error(e);
    showToast('PDF error: ' + e.message);
  } finally {
    btn.textContent = T[lang].sbPdfBtn || '⬇ Download PDF';
    btn.disabled = false;
  }
}

/* ---- Data collectors for PDF ---- */
function _getConductorTableData() {
  const rows = [];
  let i = 1;
  document.querySelectorAll('#sb-cond-body tr').forEach(tr => {
    const id = tr.dataset.rowId;
    const selEl = document.getElementById(`sb-cs-${id}`);
    if (!selEl) return;
    const size = sbConductorMode === 'awg'
      ? fmtAwgLabel(parseInt(selEl.value))
      : selEl.value + ' mm²';
    rows.push([
      i++,
      size,
      document.getElementById(`sb-cl-${id}`).value,
      document.getElementById(`sb-ci-${id}`).value,
      document.getElementById(`sb-cn-${id}`).value,
      document.getElementById(`sb-cp-${id}`).textContent.replace(' W', ''),
    ]);
  });
  return rows;
}

function _getDeviceTableData() {
  const rows = [];
  let i = 1;
  document.querySelectorAll('#sb-dev-body tr').forEach(tr => {
    const id = tr.dataset.rowId;
    const typeEl = document.getElementById(`sb-dt-${id}`);
    if (!typeEl) return;
    rows.push([
      i++,
      document.getElementById(`sb-dl-${id}`)?.value || '—',
      typeEl.value,
      document.getElementById(`sb-din-${id}`).value,
      document.getElementById(`sb-dp-${id}`).value,
      document.getElementById(`sb-dn-${id}`).value,
      document.getElementById(`sb-dpt-${id}`).textContent.replace(' W', ''),
    ]);
  });
  return rows;
}
