/* =====================================================================
   IEC Wire Sizing Calculator — IEC 60364-5-52 / IEC 60228 / IEC 60364-5-54
   Tab: Wire Size → IEC sub-tab.
   Public functions used by HTML inline handlers / app.js:
     iecCalculate, iecSetSystem, iecSetMaterial, iecSetPeMethod,
     iecDownloadPdf, iecFetchFromSc, iecRefreshUi
   ===================================================================== */

/* ─── IEC 60364-5-52 Annex B — current-carrying capacity tables (A) ──────
   Reference: 30 °C ambient air (D1 = 20 °C ground), copper, fully loaded.
   Aluminium values are derived from copper × 0.78 (IEC 60228 conductivity
   ratio) — for design submittals cross-check with the published Al tables.  */
const IEC_SIZES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630];

const IEC_AMP_CU = {
  pvc70: {
    '2': {
      A1: [15.5, 21, 28, 36, 50, 68, 89, 110, 134, 171, 207, 239, 275, 314, 369, 420, 502, 578, 659],
      A2: [15,   20.5, 27, 34, 46, 62, 80,  99, 118, 149, 179, 206, 236, 268, 312, 360, 424, 488, 555],
      B1: [17.5, 24, 32, 41, 57, 76, 101, 125, 151, 192, 232, 269, 309, 353, 415, 477, 546, 626, 720],
      B2: [13.5, 18, 24, 31, 42, 56, 73,   89, 108, 136, 164, 188, 216, 245, 286, 328, 382, 436, 502],
      C : [17.5, 24, 32, 41, 57, 76, 101, 125, 151, 192, 232, 269, 309, 353, 415, 477, 546, 626, 720],
      D1: [22,   29, 38, 47, 63, 81, 104, 125, 148, 183, 216, 246, 278, 312, 361, 408, 459, 511, 567],
      E : [19,   26, 35, 45, 63, 81, 104, 125, 151, 192, 232, 269, 309, 353, 415, 477, 546, 626, 720],
      F : [19,   26, 35, 45, 63, 81, 104, 125, 151, 192, 232, 269, 309, 353, 415, 477, 546, 626, 720],
      G : [21,   29, 39, 51, 71, 96, 127, 159, 192, 246, 298, 346, 399, 456, 538, 621, 714, 826, 959],
    },
    '3': {
      A1: [13.5, 18.5, 24, 31, 42, 56, 73,  89, 108, 136, 164, 188, 216, 245, 286, 328, 382, 436, 502],
      A2: [13,   17.5, 23, 29, 39, 52, 68,  83,  99, 125, 150, 172, 196, 223, 261, 298, 352, 406, 463],
      B1: [15.5, 21,   28, 36, 50, 68, 89, 110, 134, 171, 207, 239, 275, 314, 369, 420, 502, 578, 659],
      B2: [13.5, 18,   24, 31, 42, 56, 73,  89, 108, 136, 164, 188, 216, 245, 286, 328, 382, 436, 502],
      C : [15.5, 21,   28, 36, 50, 68, 89, 110, 134, 171, 207, 239, 275, 314, 369, 420, 502, 578, 659],
      D1: [18,   24,   31, 39, 52, 67, 86, 103, 122, 151, 179, 203, 230, 258, 297, 336, 378, 421, 467],
      E : [19,   26,   35, 45, 63, 81, 104, 125, 151, 192, 232, 269, 309, 353, 415, 477, 546, 626, 720],
      F : [17.5, 24,   32, 41, 57, 76, 101, 125, 151, 192, 232, 269, 309, 353, 415, 477, 546, 626, 720],
      G : [18,   25,   33, 43, 60, 81, 107, 134, 162, 207, 251, 292, 335, 384, 452, 521, 600, 694, 808],
    },
  },
  xlpe90: {
    '2': {
      A1: [19,   26, 35, 45, 61, 81, 106, 131, 158, 200, 241, 278, 318, 362, 424, 486, 575, 661, 752],
      A2: [18.5, 25, 33, 42, 57, 76, 99,  121, 145, 183, 220, 253, 290, 329, 386, 442, 521, 597, 680],
      B1: [23,   31, 42, 54, 75, 100, 133, 164, 198, 253, 306, 354, 406, 463, 546, 628, 728, 838, 961],
      B2: [17,   23, 31, 40, 54, 73, 95,  117, 141, 179, 216, 249, 285, 324, 380, 437, 511, 588, 678],
      C : [23,   32, 42, 54, 75, 100, 133, 164, 198, 253, 306, 354, 406, 463, 546, 628, 728, 838, 961],
      D1: [25,   33, 43, 53, 71, 91,  116, 139, 164, 203, 239, 271, 306, 343, 395, 446, 502, 559, 622],
      E : [24,   33, 45, 58, 80, 107, 138, 171, 209, 269, 328, 382, 441, 506, 599, 693, 808, 938, 1083],
      F : [24,   33, 45, 58, 80, 107, 138, 171, 209, 269, 328, 382, 441, 506, 599, 693, 808, 938, 1083],
      G : [26,   36, 49, 63, 86, 115, 149, 185, 225, 289, 352, 410, 473, 542, 641, 741, 855, 991, 1144],
    },
    '3': {
      A1: [17,   23, 31, 40, 54, 73,  95, 117, 141, 179, 216, 249, 285, 324, 380, 435, 509, 583, 666],
      A2: [16.5, 22, 30, 38, 51, 68,  89, 109, 130, 164, 197, 227, 259, 296, 346, 394, 467, 533, 611],
      B1: [19,   26, 35, 45, 61, 81, 106, 131, 159, 202, 245, 283, 323, 368, 431, 494, 572, 654, 743],
      B2: [17,   23, 31, 40, 54, 73,  95, 117, 141, 179, 216, 249, 285, 324, 380, 435, 509, 583, 666],
      C : [19,   26, 35, 45, 63, 85, 112, 138, 168, 213, 258, 299, 344, 392, 461, 530, 612, 700, 802],
      D1: [22,   29, 38, 47, 63, 81, 104, 125, 148, 183, 216, 246, 278, 312, 361, 408, 459, 511, 567],
      E : [22,   30, 40, 52, 71, 96, 119, 147, 179, 229, 278, 322, 371, 424, 500, 576, 668, 769, 884],
      F : [22,   30, 40, 51, 70, 94, 119, 148, 180, 232, 282, 328, 379, 434, 514, 593, 683, 791, 915],
      G : [24,   33, 43, 57, 80, 107, 141, 176, 213, 272, 331, 386, 444, 512, 609, 701, 809, 940, 1090],
    },
  },
};

/* Aluminium derating factor for missing-Al-table cases.  Documented
   approximation per IEC 60228 conductivity ratio; flagged in the result.   */
const IEC_AL_FACTOR = 0.78;

/* Insulation dispatch — picks base ampacity table, applies multiplier when
   only a related table exists, and supplies adiabatic k (IEC 60364-5-54
   Tab. 54.3) for PE sizing. caKey selects the Ca-temperature table.        */
const IEC_INSUL = {
  pvc70:    { base: 'pvc70',  mult: 1.00, Tmax: 70,  k_cu: 115, k_al: 76, caKey: 'pvc70',  approx: false },
  xlpe90:   { base: 'xlpe90', mult: 1.00, Tmax: 90,  k_cu: 143, k_al: 94, caKey: 'xlpe90', approx: false },
  lszh90:   { base: 'xlpe90', mult: 1.00, Tmax: 90,  k_cu: 100, k_al: 66, caKey: 'xlpe90', approx: false },
  epr90:    { base: 'xlpe90', mult: 1.00, Tmax: 90,  k_cu: 143, k_al: 94, caKey: 'xlpe90', approx: false },
  rubber60: { base: 'pvc70',  mult: 0.85, Tmax: 60,  k_cu: 141, k_al: 93, caKey: 'pvc70',  approx: true  },
  sil150:   { base: 'xlpe90', mult: 1.41, Tmax: 150, k_cu: 132, k_al: 87, caKey: 'sil150', approx: true  },
  ptfe200:  { base: 'xlpe90', mult: 1.68, Tmax: 200, k_cu: 133, k_al: 88, caKey: 'ptfe200',approx: true  },
};

/* ─── Correction factors (IEC 60364-5-52 Annex B) ──────────────────────── */
const IEC_CA = {
  pvc70:   {10:1.22, 15:1.17, 20:1.12, 25:1.06, 30:1.00, 35:0.94, 40:0.87, 45:0.79, 50:0.71, 55:0.61, 60:0.50},
  xlpe90:  {10:1.15, 15:1.12, 20:1.08, 25:1.04, 30:1.00, 35:0.96, 40:0.91, 45:0.87, 50:0.82, 55:0.76, 60:0.71},
  // Derived from formula Ca = sqrt((Tmax-Ta)/(Tmax-30)); approximate only
  sil150:  {10:1.08, 15:1.06, 20:1.04, 25:1.02, 30:1.00, 35:0.98, 40:0.96, 45:0.94, 50:0.91, 55:0.89, 60:0.87},
  ptfe200: {10:1.06, 15:1.04, 20:1.03, 25:1.01, 30:1.00, 35:0.98, 40:0.97, 45:0.95, 50:0.94, 55:0.92, 60:0.91},
};
/* IEC 60364-5-52 Tab. B.52.17 — cables in air, touching */
const IEC_CG = {1:1.00, 2:0.80, 3:0.70, 4:0.65, 5:0.60, 6:0.57, 7:0.54, 8:0.52, 9:0.50, 12:0.45, 16:0.41, 20:0.38};
/* IEC 60364-5-52 Tab. B.52.19 — buried cables, 0.25 m spacing (reference spacing) */
const IEC_CG_D1 = {1:1.00, 2:0.80, 3:0.72, 4:0.66, 5:0.61, 6:0.57, 7:0.54, 8:0.52, 9:0.50, 12:0.45, 16:0.41, 20:0.38};

/* IEC 60228 — conductor resistivity */
const IEC_RHO20 = {cu: 0.017241, al: 0.028264};
const IEC_ALPHA = {cu: 0.00393,  al: 0.00403};
const IEC_X_PER_M = 0.08e-3;

/* Method-key handles for translation lookup (IEC_METHOD_HINTS_<code>). */
const IEC_METHOD_KEYS = ['A1','A2','B1','B2','C','D1','E','F','G'];

/* ─── Module state ─────────────────────────────────────────────────────── */
let _iecSys = '1ph';
let _iecMat = 'cu';
let _iecPe  = 'simplified';
let _iecLastResult = null;

/* ─── i18n helpers ─────────────────────────────────────────────────────── */
function _tt(key, fallback) {
  return (T && T[lang] && T[lang][key]) || fallback || key;
}

/* ─── Cross-section formatter (drop trailing zeros) ────────────────────── */
function iecFmtMm2(v) {
  if (v == null || !isFinite(v)) return '—';
  if (v >= 100) return v.toFixed(0);
  if (Number.isInteger(v)) return String(v);
  // 1, 1.5, 2.5, 0.75 — keep up to 2 decimals, no trailing zeros
  return parseFloat(v.toFixed(2)).toString();
}

/* ─── UI handlers (segmented buttons) ──────────────────────────────────── */
function iecSetSystem(btn, v) {
  _iecSys = v;
  btn.parentElement.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const cf = document.getElementById('iec-cosphi-fld');
  if (cf) cf.style.opacity = (v === 'dc') ? 0.4 : 1;
  const V = document.getElementById('iec-voltage');
  if (V && document.activeElement !== V) {
    if (v === 'dc'  && (+V.value === 230 || +V.value === 400)) V.value = 24;
    if (v === '1ph' && (+V.value === 24  || +V.value === 400)) V.value = 230;
    if (v === '3ph' && (+V.value === 24  || +V.value === 230)) V.value = 400;
  }
  const cc = document.getElementById('iec-conductors');
  if (cc) { cc.value = (v === '3ph') ? '3' : '2'; iecUpdateCondHint(cc.value); }
}

function iecUpdateCondHint(val) {
  const hint = document.getElementById('iec-cond-hint'); if (!hint) return;
  if (+val === 4) {
    hint.textContent = _tt('iecCondHintN', 'Harmonics: N as loaded conductor — enter neutral current as Ib');
  } else {
    hint.textContent = _tt('iecCondHintAuto', 'Auto-set per system type');
  }
}

function iecSetMaterial(btn, v) {
  _iecMat = v;
  btn.parentElement.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  iecRefreshInsHint();
}

function iecSetPeMethod(btn, v) {
  _iecPe = v;
  btn.parentElement.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const row = document.getElementById('iec-pe-adi-row');
  if (row) row.style.display = (v === 'adiabatic') ? 'block' : 'none';
}

function iecRefreshInsHint() {
  const sel = document.getElementById('iec-insulation');
  const hint = document.getElementById('iec-ins-hint');
  if (!sel || !hint) return;
  const def = IEC_INSUL[sel.value]; if (!def) return;
  const k = (_iecMat === 'cu') ? def.k_cu : def.k_al;
  const tplKey = def.approx ? 'iecInsHintApprox' : 'iecInsHint';
  let tpl = _tt(tplKey, '{name} {tmax}°C — k = {k} ({mat})');
  const name = sel.options[sel.selectedIndex].textContent.replace(/\s*\(.+$/, '').trim();
  hint.textContent = tpl
    .replace('{name}', name)
    .replace('{tmax}', def.Tmax)
    .replace('{k}', k)
    .replace('{mat}', _iecMat === 'cu' ? 'Cu' : 'Al');
}

/* ─── Lookups ──────────────────────────────────────────────────────────── */
function iecLookupAmp(insKey, mat, conds, method, sizeIdx) {
  const def = IEC_INSUL[insKey]; if (!def) return null;
  // conds=4 (L1+L2+L3+N) uses the 3-conductor table per IEC 60364-5-52 §523.7
  const condKey = +conds >= 4 ? '3' : String(conds);
  const tbl = IEC_AMP_CU[def.base]?.[condKey]?.[method];
  if (!tbl || sizeIdx < 0 || sizeIdx >= tbl.length) return null;
  let v = tbl[sizeIdx] * def.mult;
  if (mat === 'al') v *= IEC_AL_FACTOR;
  return v;
}

function iecGetCa(caKey, Tamb) {
  const t = IEC_CA[caKey]; if (!t) return 1.0;
  if (t[Tamb] != null) return t[Tamb];
  const keys = Object.keys(t).map(Number).sort((a, b) => a - b);
  if (Tamb <= keys[0]) return t[keys[0]];
  if (Tamb >= keys[keys.length - 1]) return t[keys[keys.length - 1]];
  for (let i = 0; i < keys.length - 1; i++) {
    if (Tamb >= keys[i] && Tamb <= keys[i + 1]) {
      const r = (Tamb - keys[i]) / (keys[i + 1] - keys[i]);
      return t[keys[i]] + r * (t[keys[i + 1]] - t[keys[i]]);
    }
  }
  return 1.0;
}

function iecGetCg(group, method) {
  const tbl = (method === 'D1') ? IEC_CG_D1 : IEC_CG;
  if (tbl[group] != null) return tbl[group];
  const keys = Object.keys(tbl).map(Number).sort((a, b) => a - b);
  if (group <= keys[0]) return tbl[keys[0]];
  if (group >= keys[keys.length - 1]) return tbl[keys[keys.length - 1]];
  for (let i = 0; i < keys.length - 1; i++) {
    if (group >= keys[i] && group <= keys[i + 1]) {
      const r = (group - keys[i]) / (keys[i + 1] - keys[i]);
      return tbl[keys[i]] + r * (tbl[keys[i + 1]] - tbl[keys[i]]);
    }
  }
  return 1.0;
}

/* ─── Voltage drop (IEC 60364-5-52 §G.52.2) ───────────────────────────── */
function iecVoltageDrop({system, I, R, X, cosphi, L}) {
  const sinphi = Math.sin(Math.acos(Math.min(Math.max(cosphi, 0), 1)));
  if (system === 'dc') {
    return { V: I * R * 2 * L, formula: 'ΔU = 2 · I · R · L' };
  }
  const k = system === '1ph' ? 2 : Math.sqrt(3);
  const formula = system === '1ph'
    ? 'ΔU = 2 · I · (R·cosφ + X·sinφ) · L'
    : 'ΔU = √3 · I · (R·cosφ + X·sinφ) · L';
  return { V: k * I * (R * cosphi + X * sinphi) * L, formula };
}

/* ─── Main calculation ─────────────────────────────────────────────────── */
function iecCalculate() {
  const errBox = document.getElementById('iec-err');
  errBox.style.display = 'none';
  errBox.textContent = '';

  const I  = +document.getElementById('iec-current').value;
  const U  = +document.getElementById('iec-voltage').value;
  const L  = +document.getElementById('iec-length').value;
  const cosphi = +document.getElementById('iec-cosphi').value || 1;
  const maxVdPct = +document.getElementById('iec-max-vd').value;
  const insKey = document.getElementById('iec-insulation').value;
  const method = document.getElementById('iec-method').value;
  const conds  = document.getElementById('iec-conductors').value;
  const Tamb   = +document.getElementById('iec-tamb').value;
  const group  = +document.getElementById('iec-grouping').value;

  if (!(I > 0) || !(U > 0) || !(L > 0)) {
    errBox.textContent = _tt('iecErrInputs', 'Please enter valid I, U and L values.');
    errBox.style.display = 'block';
    return;
  }
  if (!(maxVdPct > 0 && maxVdPct < 100)) {
    errBox.textContent = _tt('iecErrVd', 'Voltage-drop value out of range.');
    errBox.style.display = 'block';
    return;
  }

  const insDef = IEC_INSUL[insKey] || IEC_INSUL.pvc70;

  // 1. Correction factors
  const Ca = iecGetCa(insDef.caKey, Tamb);
  const Cg = iecGetCg(group, method);
  const Ctot = Ca * Cg;
  if (Ctot <= 0) {
    errBox.textContent = 'Ctot ≤ 0';
    errBox.style.display = 'block';
    return;
  }

  // 2. Required base ampacity
  const I_required_base = I / Ctot;

  // 3. First standard size whose corrected ampacity meets Ib
  let sizeIdx = -1, Iz_base = null, Iz_corr = null;
  for (let i = 0; i < IEC_SIZES.length; i++) {
    const a = iecLookupAmp(insKey, _iecMat, conds, method, i);
    if (a == null) continue;
    if (a >= I_required_base) {
      sizeIdx = i; Iz_base = a; Iz_corr = a * Ctot; break;
    }
  }
  let extrapWarn = '';
  if (sizeIdx < 0) {
    sizeIdx = IEC_SIZES.length - 1;
    Iz_base = iecLookupAmp(insKey, _iecMat, conds, method, sizeIdx);
    Iz_corr = Iz_base * Ctot;
    const tpl = _tt('iecWarnAmpExceeds',
      'Design current {I} A exceeds the largest tabulated ampacity ({Iz} A at {size} mm² after corrections). Use parallel cables or higher-rated conductor.');
    extrapWarn = tpl.replace('{I}', I.toFixed(1)).replace('{Iz}', Iz_corr.toFixed(1)).replace('{size}', iecFmtMm2(IEC_SIZES[sizeIdx]));
  }

  // 4. Voltage drop @ conductor max temp; iterate up if VD fails
  const Tmax = insDef.Tmax;
  const rho = IEC_RHO20[_iecMat] * (1 + IEC_ALPHA[_iecMat] * (Tmax - 20));
  const X = IEC_X_PER_M;

  function vdAt(idx) {
    const A = IEC_SIZES[idx];
    const R = rho / A;
    const r = iecVoltageDrop({system: _iecSys, I, R, X, cosphi, L});
    return { idx, A, R, V: r.V, pct: (r.V / U) * 100, formula: r.formula };
  }

  const vdIters = [];
  let cur = vdAt(sizeIdx); vdIters.push(cur);
  let finalIdx = sizeIdx;
  let limitedBy = 'amp';                     // ← new: limiting factor flag
  if (cur.pct > maxVdPct) {
    limitedBy = 'vd';
    let foundOk = false;
    for (let i = sizeIdx + 1; i < IEC_SIZES.length; i++) {
      cur = vdAt(i); vdIters.push(cur);
      if (cur.pct <= maxVdPct) { finalIdx = i; foundOk = true; break; }
    }
    if (!foundOk) {
      finalIdx = IEC_SIZES.length - 1;
      const tpl = _tt('iecWarnVdExceeds',
        'Voltage drop exceeds {limit} % even at the largest standard size {size} mm² — shorten run or raise voltage.');
      extrapWarn += (extrapWarn ? ' ' : '') +
        tpl.replace('{limit}', maxVdPct).replace('{size}', iecFmtMm2(IEC_SIZES[finalIdx]));
    }
  }

  const finalSize   = IEC_SIZES[finalIdx];
  const finalIzBase = iecLookupAmp(insKey, _iecMat, conds, method, finalIdx);
  const finalIzCorr = finalIzBase * Ctot;
  const finalVd     = vdAt(finalIdx);

  // Warn when 1.5 mm² (IEC minimum) is recommended but a smaller conductor may suffice
  if (finalIdx === 0 && !extrapWarn) {
    const minWarn = _tt('iecWarnMinSize',
      'ℹ IEC 60364-5-52 tables start at 1.5 mm²; for smaller conductors (≥ 0.25 mm² / AWG 24) use the Analytical calculator.');
    extrapWarn = (extrapWarn ? extrapWarn + ' ' : '') + minWarn;
  }

  // 5. Power loss
  const nCond = (_iecSys === '3ph') ? 3 : 2;
  const Ploss = I * I * (rho / finalSize) * nCond * L;

  // 6. PE conductor
  let peSize, peCalc;
  const k_adi = (_iecMat === 'cu') ? insDef.k_cu : insDef.k_al;
  if (_iecPe === 'simplified') {
    let raw;
    if (finalSize <= 16) raw = finalSize;
    else if (finalSize <= 35) raw = 16;
    else raw = finalSize / 2;
    peSize = MM2_STD.find(s => s >= raw) ?? MM2_STD[MM2_STD.length - 1];
    const tpl = _tt('iecPeCalcSimp',
      'IEC 60364-5-54 Tab. 54.2: S_phase = {sp} mm² → S_PE_min = {raw} mm² → standard {pe} mm²');
    peCalc = tpl
      .replace('{sp}', iecFmtMm2(finalSize))
      .replace('{raw}', iecFmtMm2(raw))
      .replace('{pe}', iecFmtMm2(peSize));
  } else {
    const Ik = (+document.getElementById('iec-ik').value || 0) * 1000;
    const t  = +document.getElementById('iec-tdis').value || 0;
    if (!(Ik > 0) || !(t > 0)) {
      errBox.textContent = _tt('iecErrAdi', 'For adiabatic method, enter Ik (kA) and t (s).');
      errBox.style.display = 'block';
      return;
    }
    const raw = Math.sqrt(Ik * Ik * t) / k_adi;
    peSize = MM2_STD.find(s => s >= raw) ?? MM2_STD[MM2_STD.length - 1];
    const tpl = _tt('iecPeCalcAdi',
      'IEC 60364-5-54 §543.1.2 (adiabatic): S = √(I²·t)/k = √({Ik}²·{t})/{k} = {raw} → {pe} mm²');
    peCalc = tpl
      .replace('{Ik}', Ik.toFixed(0))
      .replace('{t}', t)
      .replace('{k}', k_adi)
      .replace('{raw}', raw.toFixed(2))
      .replace('{pe}', iecFmtMm2(peSize));
  }

  // 7. AWG
  const awg = mm2ToAwg(finalSize);

  const result = {
    I, U, L, cosphi, maxVdPct,
    system: _iecSys, mat: _iecMat, ins: insKey, insDef,
    method, conds: +conds, Tamb, group,
    Ca, Cg, Ctot,
    sizeIdx, sizeAmpFirst: IEC_SIZES[sizeIdx], Iz_base, Iz_corr,
    finalSize, finalIzBase, finalIzCorr,
    rho, R: rho / finalSize, X, Tmax,
    vd: finalVd, vdIters, limitedBy,
    Ploss, nCond,
    peMethod: _iecPe, peSize, peCalc, k_adi,
    awg, extrapWarn,
  };
  _iecLastResult = result;
  iecRender(result);
}

/* ─── UI rendering ─────────────────────────────────────────────────────── */
function iecRender(r) {
  const wrap = document.getElementById('iec-results');
  const body = document.getElementById('iec-results-body');
  wrap.style.display = 'block';

  const vdPass = r.vd.pct <= r.maxVdPct;
  const margin = ((r.finalIzCorr - r.I) / r.I * 100);
  const limByLabel = r.limitedBy === 'vd'
    ? _tt('iecLimByVd',  'LIMITED BY VOLTAGE DROP')
    : _tt('iecLimByAmp', 'LIMITED BY AMPACITY');
  const limCls = r.limitedBy === 'vd' ? 'iec-lim-vd' : 'iec-lim-amp';

  const insName = _tt('iecIns_' + r.ins, r.ins);
  const matName = r.mat === 'cu' ? 'Cu' : 'Al';

  let html = '';

  // RECOMMENDED SIZE — hero card with limiting badge
  html += `<div class="iec-card iec-card-rec">`;
  html += `  <div class="iec-card-hdr">${_tt('iecResRecHdr', '📐 Recommended phase conductor')}`;
  html += `    <span class="iec-lim-badge ${limCls}">${limByLabel}</span></div>`;
  const awgTipText = _tt('iecAwgTip', 'Approximate AWG — IEC works in mm². Nearest larger standard AWG ≥ mm² value.');
  html += `  <div class="iec-big">${iecFmtMm2(r.finalSize)} mm²</div>`;
  html += `  <div class="iec-awg-note"><span class="iec-awg-val">${mm2ToAwgStr(r.finalSize)}</span><span class="tt iec-awg-tip" data-tip="${awgTipText.replace(/"/g, '&quot;')}" tabindex="0">ⓘ</span></div>`;
  html += `  <table class="iec-tbl">`;
  html += `    <tr><td>${_tt('iecResIzBase', 'Iz (table, method {m})').replace('{m}', r.method)}</td><td>${r.finalIzBase.toFixed(1)} A</td></tr>`;
  html += `    <tr><td>${_tt('iecResCa', 'Ca (Ta = {ta} °C, {ins})').replace('{ta}', r.Tamb).replace('{ins}', insName)}</td><td>× ${r.Ca.toFixed(2)}</td></tr>`;
  html += `    <tr><td>${_tt('iecResCg', 'Cg ({n} grouped circuits)').replace('{n}', r.group)}</td><td>× ${r.Cg.toFixed(2)}</td></tr>`;
  html += `    <tr class="iec-tot"><td>${_tt('iecResIzCorr', 'Iz_corr = Iz · Ca · Cg')}</td><td><strong>${r.finalIzCorr.toFixed(1)} A</strong></td></tr>`;
  html += `    <tr><td>${_tt('iecResIb', 'Design current Ib')}</td><td>${r.I.toFixed(1)} A</td></tr>`;
  html += `    <tr><td>${_tt('iecResMargin', 'Margin')}</td><td>${margin >= 0 ? '+' : ''}${margin.toFixed(1)} %</td></tr>`;
  html += `  </table>`;
  html += `</div>`;

  // VOLTAGE DROP card
  html += `<div class="iec-card ${vdPass ? 'iec-card-pass' : 'iec-card-fail'}">`;
  html += `  <div class="iec-card-hdr">${_tt('iecResVdHdr', '⚡ Voltage drop').replace('{tmax}', r.Tmax)}</div>`;
  html += `  <div class="iec-big">${r.vd.V.toFixed(2)} V <span class="iec-sub">(${r.vd.pct.toFixed(2)} %)</span></div>`;
  html += `  <div class="iec-fml"><code>${r.vd.formula}</code></div>`;
  html += `  <div class="iec-line">R = ${(r.R * 1000).toFixed(3)} mΩ/m  ·  X = ${(r.X * 1000).toFixed(2)} mΩ/m  ·  ρ@${r.Tmax} °C = ${r.rho.toFixed(5)} Ω·mm²/m</div>`;
  html += `  <div class="iec-line">${_tt('iecResLimit', 'Limit')}: ${r.maxVdPct} % &nbsp;→&nbsp; <strong>${vdPass ? '✅ ' + _tt('iecPass', 'PASS') : '❌ ' + _tt('iecFail', 'FAIL')}</strong></div>`;
  if (r.vdIters.length > 1) {
    html += `  <div class="iec-iter">${_tt('iecResIter', 'Size upgraded to satisfy ΔU')}: ` +
            r.vdIters.map(v => `${iecFmtMm2(v.A)} mm² → ${v.pct.toFixed(2)} %`).join(' &nbsp;⇒&nbsp; ') + `</div>`;
  }
  html += `</div>`;

  // POWER LOSS + PE
  html += `<div class="iec-row2">`;
  html += `  <div class="iec-card iec-card-mini">`;
  html += `    <div class="iec-card-hdr">${_tt('iecResPlossHdr', '🔥 Power loss')}</div>`;
  html += `    <div class="iec-big">${fmtW(r.Ploss)}</div>`;
  html += `    <div class="iec-line">${_tt('iecResPlossSub', '{n} conductors · length {L} m').replace('{n}', r.nCond).replace('{L}', r.L)}</div>`;
  html += `  </div>`;
  html += `  <div class="iec-card iec-card-mini">`;
  html += `    <div class="iec-card-hdr">${_tt('iecResPeHdr', '🛡️ Protective Earth')}</div>`;
  html += `    <div class="iec-big">${iecFmtMm2(r.peSize)} mm²</div>`;
  html += `    <div class="iec-line">${r.peCalc}</div>`;
  html += `  </div>`;
  html += `</div>`;

  // Aluminium / approximation disclosures
  if (r.mat === 'al') {
    html += `<div class="iec-warn">${_tt('iecWarnAlumin',
      'ℹ Aluminium values derived from copper × {f} (IEC 60228 conductivity ratio). Verify against IEC 60364-5-52 Tab. B.52.4 / B.52.5 / B.52.10 / B.52.11 for design submittals.')
      .replace('{f}', IEC_AL_FACTOR.toFixed(2))}</div>`;
  }
  if (r.insDef.approx) {
    html += `<div class="iec-warn">${_tt('iecWarnInsApprox',
      'ℹ Insulation ampacity derived from {base} table × {mult}; treat as preliminary.')
      .replace('{base}', r.insDef.base === 'pvc70' ? 'PVC 70 °C' : 'XLPE 90 °C')
      .replace('{mult}', r.insDef.mult)}</div>`;
  }
  if (r.extrapWarn) html += `<div class="iec-warn">${r.extrapWarn}</div>`;

  body.innerHTML = html;

  // Step-by-step
  const stepsCard = document.getElementById('iec-steps-card');
  const stepsPre  = document.getElementById('iec-steps');
  stepsCard.style.display = 'block';
  stepsPre.textContent = iecBuildStepsText(r);
}

function iecBuildStepsText(r) {
  const sysName = ({dc: _tt('iecSys_dc', 'DC'),
                    '1ph': _tt('iecSys_1ph', 'AC single-phase'),
                    '3ph': _tt('iecSys_3ph', 'AC three-phase')})[r.system];
  const matName = r.mat === 'cu' ? 'Cu' : 'Al';
  const insName = _tt('iecIns_' + r.ins, r.ins);
  const methodHint = _tt('iecMeth_' + r.method, r.method);

  const out = [];
  out.push('IEC 60364-5-52 / 60228 / 60364-5-54  —  ' + _tt('iecStepTitle', 'Cable Sizing  (Step-by-Step)'));
  out.push('-------------------------------------------------------------------');
  out.push('');
  out.push('1) ' + _tt('iecStep1', 'Inputs'));
  out.push(`   ${_tt('iecLblSystem', 'System')}: ${sysName}`);
  out.push(`   ${_tt('iecLblU', 'Voltage U')}: ${r.U} V`);
  out.push(`   ${_tt('iecLblIb', 'Design current Ib')}: ${r.I} A`);
  out.push(`   ${_tt('iecLblL', 'Length L (one-way)')}: ${r.L} m`);
  if (r.system !== 'dc') out.push(`   ${_tt('iecLblCos', 'cos phi')}: ${r.cosphi}`);
  out.push(`   ${_tt('iecLblVdMax', 'Max allowed dU')}: ${r.maxVdPct} %`);
  out.push(`   ${_tt('iecLblMat', 'Conductor material')}: ${matName}    (rho20 = ${IEC_RHO20[r.mat].toFixed(5)} Ohm.mm2/m,  alpha = ${IEC_ALPHA[r.mat]} /degC)`);
  out.push(`   ${_tt('iecLblIns', 'Insulation')}: ${insName}    (Tmax = ${r.Tmax} °C, k_adi = ${r.k_adi})`);
  out.push(`   ${_tt('iecLblMethod', 'Reference method')}: ${r.method}    (${methodHint})`);
  out.push(`   ${_tt('iecLblConds', 'Loaded conductors')}: ${r.conds}`);
  out.push(`   ${_tt('iecLblTa', 'Ambient Ta')}: ${r.Tamb} °C`);
  out.push(`   ${_tt('iecLblGroup', 'Grouping')}: ${r.group} ${_tt('iecCircuitsWord', 'circuit(s)')}`);
  out.push('');
  out.push('2) ' + _tt('iecStep2', 'Correction factors  (IEC 60364-5-52 Annex B)'));
  out.push(`   Ca = f(Ta, ins) = ${r.Ca.toFixed(3)}`);
  out.push(`   Cg = f(circuits) = ${r.Cg.toFixed(3)}`);
  out.push(`   Ctot = Ca · Cg = ${r.Ctot.toFixed(3)}`);
  out.push('');
  out.push('3) ' + _tt('iecStep3', 'Required base ampacity'));
  out.push(`   Iz_required = Ib / Ctot = ${r.I} / ${r.Ctot.toFixed(3)} = ${(r.I / r.Ctot).toFixed(2)} A`);
  out.push(`   ${_tt('iecStep3a', 'First standard size with Iz_base >= Iz_required')}: ${iecFmtMm2(r.sizeAmpFirst)} mm²`);
  out.push(`     Iz_base = ${r.Iz_base.toFixed(1)} A   →   Iz_corr = ${r.Iz_corr.toFixed(1)} A`);
  out.push('');
  out.push('4) ' + _tt('iecStep4', 'Voltage-drop check  (IEC 60364-5-52 §G.52.2)'));
  out.push(`   rho(Tmax) = rho20 · (1 + alpha·(${r.Tmax}-20)) = ${r.rho.toFixed(5)} Ohm·mm2/m`);
  out.push(`   ${r.vd.formula}`);
  if (r.vdIters.length === 1) {
    out.push(`   At ${iecFmtMm2(r.finalSize)} mm²: dU = ${r.vd.V.toFixed(3)} V  (${r.vd.pct.toFixed(3)} %) — ${r.vd.pct <= r.maxVdPct ? _tt('iecPass','PASS') : _tt('iecFail','FAIL')}`);
  } else {
    out.push('   ' + _tt('iecStep4Iter', 'Iteration to satisfy max dU') + ':');
    r.vdIters.forEach(v => out.push(`     ${iecFmtMm2(v.A)} mm² → ${v.pct.toFixed(3)} %`));
    out.push(`   ${_tt('iecStep4Selected', 'Selected')}: ${iecFmtMm2(r.finalSize)} mm²`);
  }
  out.push('');
  out.push('5) ' + _tt('iecStep5', 'Power loss'));
  out.push(`   Ploss = Ib² · (rho/A) · n · L = ${r.I}² · (${r.rho.toFixed(5)}/${iecFmtMm2(r.finalSize)}) · ${r.nCond} · ${r.L} = ${r.Ploss.toFixed(2)} W`);
  out.push('');
  out.push('6) ' + _tt('iecStep6', 'PE conductor'));
  out.push(`   ${r.peCalc}`);
  out.push('');
  out.push(_tt('iecResultLbl', 'Result'));
  out.push(`   ${_tt('iecPhaseConductor', 'Phase conductor')}: ${iecFmtMm2(r.finalSize)} mm²  (${mm2ToAwgStr(r.finalSize)})`);
  out.push(`   ${_tt('iecPeConductor',    'PE conductor')}:    ${iecFmtMm2(r.peSize)} mm²`);
  out.push(`   Iz_corr: ${r.finalIzCorr.toFixed(1)} A   (Ib = ${r.I} A → ${_tt('iecResMargin','Margin')} ${(((r.finalIzCorr - r.I) / r.I) * 100).toFixed(1)} %)`);
  out.push(`   dU: ${r.vd.V.toFixed(2)} V (${r.vd.pct.toFixed(2)} %)   ${_tt('iecResLimit','Limit')} ${r.maxVdPct} %`);
  out.push(`   ${_tt('iecResLimitedBy', 'Limited by')}: ${r.limitedBy === 'vd' ? _tt('iecLimByVd','VOLTAGE DROP') : _tt('iecLimByAmp','AMPACITY')}`);
  return out.join('\n');
}

/* ─── PDF EXPORT (modernized) ──────────────────────────────────────────── */
async function iecDownloadPdf() {
  const btn = document.getElementById('iec-pdf-btn');
  btn.textContent = '…';
  btn.disabled = true;
  try {
    if (!window.jspdf && !window.jsPDF) { showToast('jsPDF not loaded'); return; }
    const { jsPDF } = window.jspdf || window;
    const r = _iecLastResult;
    if (!r) { showToast(_tt('iecNoResults', 'No results — calculate first')); return; }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const PW = 210, PH = 297, M = 15, CW = PW - M * 2;
    const C = {                    // colour palette
      pri:     [26,  82, 118],     // primary blue
      ok:      [0,  150,  80],     // green
      okBg:    [232, 246, 235],
      fail:    [200,  50,  50],    // red
      failBg:  [253, 234, 234],
      warn:    [200, 130,   0],    // amber
      warnBg:  [255, 245, 220],
      muted:   [110, 120, 130],
      grid:    [220, 222, 226],
      hdr:     [240, 242, 246],
      text:    [30,  30,  35],
    };
    const engineer = document.getElementById('iec-engineer')?.value.trim() || '';

    function drawHeader(pg, tot) {
      pdfMakeHeader(doc, { PW, M, title: _tt('iecPdfTitle', 'IEC Cable Sizing  (IEC 60364-5-52 / 60228 / 60364-5-54)') });
      pdfMakeFooter(doc, { PW, PH, M, pageNum: pg, totalPages: tot, engineer, standard: 'IEC 60364-5-52' });
    }
    function setColor(arr, kind) {
      if (kind === 'fill') doc.setFillColor(arr[0], arr[1], arr[2]);
      if (kind === 'draw') doc.setDrawColor(arr[0], arr[1], arr[2]);
      if (kind === 'text') doc.setTextColor(arr[0], arr[1], arr[2]);
    }
    function secTitle(y, txt) {
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); setColor(C.pri, 'text');
      doc.text(pdfSafe(txt), M, y);
      setColor(C.grid, 'draw'); doc.setLineWidth(0.3);
      doc.line(M + doc.getTextWidth(pdfSafe(txt)) + 3, y - 1, PW - M, y - 1);
      return y + 6;
    }
    function pill(x, y, w, h, label, bg, fg) {
      setColor(bg, 'fill'); setColor(bg, 'draw'); doc.setLineWidth(0.2);
      doc.roundedRect(x, y, w, h, 1.4, 1.4, 'FD');
      setColor(fg, 'text');
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
      doc.text(pdfSafe(label), x + w / 2, y + h * 0.7, { align: 'center' });
    }
    function row(y, label, value, shade) {
      const RH = 6.5;
      if (shade) { setColor(C.hdr, 'fill'); doc.rect(M, y, CW, RH, 'F'); }
      setColor(C.grid, 'draw'); doc.setLineWidth(0.1); doc.rect(M, y, CW, RH);
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); setColor(C.muted, 'text');
      doc.text(pdfSafe(label), M + 3, y + 4.5);
      doc.setFont('helvetica', 'bold'); setColor(C.text, 'text');
      doc.text(pdfSafe(String(value)), M + CW - 3, y + 4.5, { align: 'right' });
      return y + RH;
    }

    const sysLabels = {
      dc: _tt('iecSys_dc', 'DC'),
      '1ph': _tt('iecSys_1ph', 'AC single-phase'),
      '3ph': _tt('iecSys_3ph', 'AC three-phase'),
    };
    const insName = _tt('iecIns_' + r.ins, r.ins);
    const methHint = _tt('iecMeth_' + r.method, r.method);

    // ── PAGE 1 ─────────────────────────────────────────────────────────
    drawHeader(1, 2);
    let y = M + 22;

    /* HERO RESULT CARD ------------------------------------------------ */
    const heroH = 32;
    const limCol = r.limitedBy === 'vd' ? C.warn : C.pri;
    const limBg  = r.limitedBy === 'vd' ? C.warnBg : C.okBg;
    setColor(limBg, 'fill'); setColor(limCol, 'draw'); doc.setLineWidth(0.6);
    doc.roundedRect(M, y, CW, heroH, 2.5, 2.5, 'FD');

    setColor(C.muted, 'text');
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(pdfSafe(_tt('iecPdfRecLbl', 'Recommended phase conductor')), M + 5, y + 6);

    setColor(C.text, 'text');
    doc.setFontSize(22); doc.setFont('helvetica', 'bold');
    const recText = iecFmtMm2(r.finalSize) + ' mm²';
    doc.text(pdfSafe(recText), M + 5, y + 19);
    const recTextW = doc.getTextWidth(pdfSafe(recText));
    doc.setFontSize(11); doc.setFont('helvetica', 'normal'); setColor(C.muted, 'text');
    const awgTxt = '(' + mm2ToAwgStr(r.finalSize) + ')';
    doc.text(pdfSafe(awgTxt), M + 5 + recTextW + 4, y + 19);

    // limiting-factor pill, top-right
    const limTxt = (r.limitedBy === 'vd'
      ? _tt('iecLimByVd', 'LIMITED BY VOLTAGE DROP')
      : _tt('iecLimByAmp', 'LIMITED BY AMPACITY'));
    const pillW = 52;
    pill(M + CW - pillW - 4, y + 4, pillW, 6, limTxt, limCol, [255, 255, 255]);

    // bottom row: Iz_corr | margin | VD pass/fail
    setColor(C.text, 'text'); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    const bot = y + heroH - 4;
    const colW = CW / 3;
    const margin = ((r.finalIzCorr - r.I) / r.I * 100);
    const vdPass = r.vd.pct <= r.maxVdPct;
    const tile = (i, lbl, val, valCol) => {
      setColor(C.muted, 'text'); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
      doc.text(pdfSafe(lbl), M + colW * i + 5, bot - 4);
      setColor(valCol || C.text, 'text'); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text(pdfSafe(val), M + colW * i + 5, bot + 0.5);
    };
    tile(0, _tt('iecResIzCorr', 'Iz_corr (Iz · Ca · Cg)'), r.finalIzCorr.toFixed(1) + ' A');
    tile(1, _tt('iecResMargin', 'Margin'), (margin >= 0 ? '+' : '') + margin.toFixed(1) + ' %', margin >= 0 ? C.ok : C.fail);
    tile(2, _tt('iecResVdHdr', '⚡ Voltage drop').replace('⚡ ', '') + ' (' + r.maxVdPct + ' %)',
         r.vd.V.toFixed(2) + ' V (' + r.vd.pct.toFixed(2) + ' %)', vdPass ? C.ok : C.fail);
    y += heroH + 6;

    /* INPUTS ---------------------------------------------------------- */
    y = secTitle(y, _tt('iecPdfInputs', 'Input Parameters'));
    const inputs = [
      [_tt('iecLblSystem', 'System'),               sysLabels[r.system]],
      [_tt('iecLblU', 'Voltage U'),                  r.U + ' V'],
      [_tt('iecLblIb', 'Design current Ib'),         r.I + ' A'],
      [_tt('iecLblL', 'Length L (one-way)'),         r.L + ' m'],
      [_tt('iecLblCos', 'cos phi'),                  r.system === 'dc' ? '— (DC)' : String(r.cosphi)],
      [_tt('iecLblVdMax', 'Max voltage drop'),       r.maxVdPct + ' %'],
      [_tt('iecLblMat', 'Conductor material'),       r.mat === 'cu' ? 'Copper (Cu) — IEC 60228' : 'Aluminium (Al) — IEC 60228'],
      [_tt('iecLblIns', 'Insulation'),               insName + '   (Tmax ' + r.Tmax + ' °C)'],
      [_tt('iecLblMethod', 'Reference method'),      r.method + '  —  ' + methHint],
      [_tt('iecLblConds', 'Loaded conductors'),      String(r.conds)],
      [_tt('iecLblTa', 'Ambient Ta'),                r.Tamb + ' °C'],
      [_tt('iecLblGroup', 'Grouping'),               String(r.group) + ' ' + _tt('iecCircuitsWord', 'circuit(s)')],
      [_tt('iecLblPe', 'PE method'),                 r.peMethod === 'simplified'
                                                      ? _tt('iecPeSimp', 'Simplified — IEC 60364-5-54 Tab. 54.2')
                                                      : _tt('iecPeAdi',  'Adiabatic — IEC 60364-5-54 §543.1.2')],
    ];
    inputs.forEach((row_, i) => { y = row(y, row_[0], row_[1], i % 2 === 0); });
    y += 5;

    /* DERATING -------------------------------------------------------- */
    y = secTitle(y, _tt('iecPdfCorrection', 'Correction Factors'));
    [
      ['Ca',                                       r.Ca.toFixed(3)],
      ['Cg',                                       r.Cg.toFixed(3)],
      ['Ctot = Ca · Cg',                           r.Ctot.toFixed(3)],
      [_tt('iecResIzBase', 'Iz_base').replace(' (table, method {m})', '').replace('{m}', r.method),
                                                   r.finalIzBase.toFixed(1) + ' A'],
      [_tt('iecResIzCorr', 'Iz_corr (Iz · Ca · Cg)'),
                                                   r.finalIzCorr.toFixed(1) + ' A'],
      [_tt('iecLblVd', 'Voltage drop'),
                                                   r.vd.V.toFixed(2) + ' V  (' + r.vd.pct.toFixed(2) + ' %)' +
                                                   '   — ' + (vdPass ? _tt('iecPass','PASS') : _tt('iecFail','FAIL'))],
      [_tt('iecLblPloss', 'Power loss'),
                                                   r.Ploss.toFixed(2) + ' W   (' + r.nCond + ' × ' + r.L + ' m)'],
      [_tt('iecResPeHdr', '🛡️ Protective Earth').replace('🛡️ ','') + ' — ' +
       (r.peMethod === 'simplified' ? 'Tab. 54.2' : '§543.1.2'),
                                                   iecFmtMm2(r.peSize) + ' mm²'],
    ].forEach((row_, i) => { y = row(y, row_[0], row_[1], i % 2 === 0); });

    if (r.extrapWarn) {
      y += 3;
      setColor(C.warnBg, 'fill'); setColor(C.warn, 'draw'); doc.setLineWidth(0.4);
      const lines = doc.splitTextToSize(pdfSafe(r.extrapWarn), CW - 6);
      const h = lines.length * 4 + 4;
      doc.roundedRect(M, y, CW, h, 1.5, 1.5, 'FD');
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); setColor(C.warn, 'text');
      doc.text(lines, M + 3, y + 5);
      y += h;
    }

    // ── PAGE 2: step-by-step ──────────────────────────────────────────
    doc.addPage();
    drawHeader(2, 2);
    y = M + 22;
    y = secTitle(y, _tt('iecPdfSteps', 'Step-by-Step Calculation'));
    doc.setFontSize(7.5); doc.setFont('Courier', 'normal'); setColor([50, 50, 50], 'text');
    const lh = 4.2;
    iecBuildStepsText(r).split('\n').forEach(line => {
      if (y + lh > PH - M - 10) {
        doc.addPage();
        drawHeader(doc.getNumberOfPages(), 2);
        y = M + 22;
        doc.setFontSize(7.5); doc.setFont('Courier', 'normal'); setColor([50, 50, 50], 'text');
      }
      doc.text(pdfSafe(line), M, y);
      y += lh;
    });

    doc.save('iec-cable-sizing.pdf');
  } finally {
    btn.textContent = _tt('iecPdfBtn', '⬇ Download PDF');
    btn.disabled = false;
  }
}

/* ─── SC fetch helper ─────────────────────────────────────────────────── */
function iecFetchFromSc() {
  const ac = document.getElementById('sc-r-ik3-max')?.textContent;
  const dc = document.getElementById('dc-r-ik')?.textContent;
  let kA = null;
  for (const txt of [ac, dc]) {
    if (!txt) continue;
    const m = txt.match(/[\d.]+/);
    if (m) { kA = parseFloat(m[0]); if (txt.includes('kA')) break; if (kA > 1000) { kA /= 1000; break; } }
  }
  if (kA != null && isFinite(kA) && kA > 0) {
    document.getElementById('iec-ik').value = kA.toFixed(2);
    showToast(_tt('iecToastFetched', 'Loaded Ik = {kA} kA').replace('{kA}', kA.toFixed(2)));
  } else {
    showToast(_tt('iecToastNoSc', 'Run Short-Circuit calculation first.'));
  }
}

/* ─── Method-hint live update + lang change ────────────────────────────── */
function iecRefreshUi() {
  const sel = document.getElementById('iec-method');
  const hint = document.getElementById('iec-method-hint');
  if (sel && hint) hint.textContent = _tt('iecMeth_' + sel.value, sel.value);
  iecRefreshInsHint();
  // Re-render results in current language if any
  if (_iecLastResult) iecRender(_iecLastResult);
}

/* ─── Init ─────────────────────────────────────────────────────────────── */
function iecInit() {
  const sel = document.getElementById('iec-method');
  if (sel) {
    const upd = () => {
      const h = document.getElementById('iec-method-hint');
      if (h) h.textContent = _tt('iecMeth_' + sel.value, sel.value);
    };
    sel.addEventListener('change', upd);
    upd();
  }
  const insSel = document.getElementById('iec-insulation');
  if (insSel) insSel.addEventListener('change', iecRefreshInsHint);
  iecRefreshInsHint();

  document.getElementById('iec-calculate')?.addEventListener('click', iecCalculate);
  document.getElementById('iec-pdf-btn')?.addEventListener('click', iecDownloadPdf);
  document.getElementById('iec-fetch-sc')?.addEventListener('click', iecFetchFromSc);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iecInit);
} else {
  iecInit();
}
