// sc.js — Short-Circuit Current Calculator (IEC 60909 / IEC 60364)

// IEC 60228 material constants — ρ(T) = ρ20 × (1 + α × (T − 20))
const SC_MAT = {
  cu: { rho20: 0.017241, alpha: 0.00393 }, // 1/58  Ω·mm²/m, IEC 60228 Annex B
  al: { rho20: 0.028571, alpha: 0.00403 }, // 1/35  Ω·mm²/m
};

const SC_TEMP_PRESETS = [
  { t: 20,  key: 'scTemp20'  },
  { t: 70,  key: 'scTemp70'  },
  { t: 90,  key: 'scTemp90'  },
  { t: 160, key: 'scTemp160' },
  { t: 250, key: 'scTemp250' },
];

// IEC 60909 voltage factors
const C_MAX = 1.10;  // for maximum fault current (equipment rating)
const C_MIN = 0.95;  // for minimum fault current (protection verification)

// Trip curve multipliers per IEC 60898 / IEC 60947-2
// min = lower bound (may trip), max = upper bound (GUARANTEED instantaneous trip)
const SC_CURVES = {
  B: { min: 3,  max: 5,  label: 'B (3–5 × In)'   },
  C: { min: 5,  max: 10, label: 'C (5–10 × In)'  },
  D: { min: 10, max: 20, label: 'D (10–20 × In)' },
  K: { min: 8,  max: 14, label: 'K (8–14 × In)'  },
  Z: { min: 2,  max: 3,  label: 'Z (2–3 × In)'   },
};

const SC_FUSE_FACTOR = 1.6; // gG conventional fusing current (IEC 60269-2)

let scSourceMode  = 'known'; // 'known' | 'transformer'
let scMaterial    = 'cu';
let scNetworkType = 'tns';   // 'tns' | 'tnc' | 'tt'
let scVoltPreset  = 'ac3';   // 'ac1' = 1-phase 230 V | 'ac3' = 3-phase 400 V | 'custom' = U_LL input
let scCondTemp    = 70;      // °C — conductor temperature for min Ik (protection check)
let scSourceXR    = 1.0;     // X/R ratio of source impedance
let scCableXpm    = 0.08;    // cable reactance x' [mΩ/m] typical: 0.08 single-core, 0.07 multi-core

// ─── helpers ─────────────────────────────────────────────────────────────────

// 'ac1' → U0 = 230 V, U_LL = 230 × √3 ≈ 398 V (1-phase 230 V supply; Zs = U0 / Ik_sup)
// 'ac3' → U0 = 400/√3 ≈ 231 V, U_LL = 400 V (3-phase 400 V; standard European LV)
// 'custom' → user enters U_LL; U0 = U_LL / √3

function scGetU0() {
  if (scVoltPreset === 'ac1') return 230;
  if (scVoltPreset === 'ac3') return 400 / Math.sqrt(3);
  const ull = parseFloat(document.getElementById('sc-un').value) || 400;
  return ull / Math.sqrt(3);
}

function scGetUnLine() {
  if (scVoltPreset === 'ac1') return 230 * Math.sqrt(3);
  if (scVoltPreset === 'ac3') return 400;
  return parseFloat(document.getElementById('sc-un').value) || 400;
}

// Complex impedance magnitude
function cMag(r, x) { return Math.sqrt(r * r + x * x); }

// Engineering rounding: keep n significant figures, avoid excess decimal noise
function engRound(v, sig) {
  if (!isFinite(v) || v === 0) return v;
  const d = Math.floor(Math.log10(Math.abs(v))) + 1;
  const f = Math.pow(10, sig - d);
  return Math.round(v * f) / f;
}

function fmtIkVal(kA) {
  if (kA >= 1) return engRound(kA, 3) + ' kA';
  return engRound(kA * 1000, 3) + ' A';
}

function fmtmOhm(ohm) {
  return engRound(ohm * 1000, 3) + ' mΩ';
}

function scGetRho() {
  const { rho20, alpha } = SC_MAT[scMaterial];
  return rho20 * (1 + alpha * (scCondTemp - 20));
}

function scUpdateRhoHint() {
  const rho = scGetRho();
  const el = document.getElementById('sc-rho-hint');
  if (el) el.textContent = 'ρ = ' + rho.toFixed(5) + ' Ω·mm²/m (' +
    (scMaterial === 'cu' ? 'Cu' : 'Al') + ', ' + scCondTemp + ' °C)';
}

function scGetIkBusbarKA() {
  if (scSourceMode === 'known') {
    return parseFloat(document.getElementById('sc-ik-busbar').value) || 0;
  }
  const Sn   = parseFloat(document.getElementById('sc-tr-sn').value)  || 0; // kVA
  const Uk   = parseFloat(document.getElementById('sc-tr-uk').value)  || 0; // %
  const UnSec= parseFloat(document.getElementById('sc-tr-un').value)  || 400; // V
  if (!Sn || !Uk || !UnSec) return 0;
  // Ik_tr = Sn·1000 / (√3 · UnSec · Uk/100)  →  kA
  return (Sn * 1000) / (Math.sqrt(3) * UnSec * (Uk / 100)) / 1000;
}

// ─── live-update displays ────────────────────────────────────────────────────

function scUpdateFromTransformer() {
  const ik = scGetIkBusbarKA();
  const val = document.getElementById('sc-tr-ik-val');
  if (val) val.textContent = ik > 0 ? ik.toFixed(2) + ' kA' : '—';
  scUpdateZsDisplay();
}

function scUpdateZsDisplay() {
  const U_LL = scGetUnLine();
  const ik_A = scGetIkBusbarKA() * 1000;
  const Zs_mag = ik_A > 0 ? U_LL / (Math.sqrt(3) * ik_A) : 0;
  // Split into R and X using source X/R ratio
  const XR = scSourceXR;
  const Rs = Zs_mag > 0 ? Zs_mag / Math.sqrt(1 + XR * XR) : 0;
  const Xs = Rs * XR;
  const val = document.getElementById('sc-zs-val');
  if (val) val.textContent = Zs_mag > 0
    ? fmtmOhm(Zs_mag) + '  (Rs=' + fmtmOhm(Rs) + ', Xs=' + fmtmOhm(Xs) + ')'
    : '—';
}

function scUpdateTripHint() {
  const type  = document.getElementById('sc-dev-type')?.value;
  const In    = parseFloat(document.getElementById('sc-dev-in')?.value) || 0;
  const hint  = document.getElementById('sc-trip-hint');
  if (!hint) return;
  if (type === 'fuse') {
    hint.textContent = 'gG: I2 ≈ 1.6 × In = ' + (SC_FUSE_FACTOR * In).toFixed(0) + ' A (IEC 60269-2)';
    return;
  }
  const curve = document.getElementById('sc-dev-curve')?.value;
  if (curve && SC_CURVES[curve] && In > 0) {
    const c = SC_CURVES[curve];
    hint.textContent =
      'May trip above ' + (c.min * In).toFixed(0) + ' A · ' +
      'Guaranteed trip above ' + (c.max * In).toFixed(0) + ' A';
  }
}

// ─── init ────────────────────────────────────────────────────────────────────

function initShortCircuit() {
  ['sc-s-phase', 'sc-s-pe'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    MM2_STD.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s + ' mm²';
      if (s === 2.5) opt.selected = true;
      sel.appendChild(opt);
    });
  });
  scOnDevTypeChange();
  scUpdateTripHint();
  scUpdateZsDisplay();
  scUpdateRhoHint();
}

// ─── segment-button setters ───────────────────────────────────────────────────

function scSetVoltPreset(btn, preset) {
  scVoltPreset = preset;
  btn.closest('.seg-group').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('sc-v-custom-row').style.display = preset === 'custom' ? 'block' : 'none';
  scUpdateZsDisplay();
}

function scSetMaterial(btn, mat) {
  scMaterial = mat;
  btn.closest('.seg-group').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  scUpdateRhoHint();
}

function scSetTemp(val) {
  document.getElementById('sc-temp-custom-row').style.display = val === 'custom' ? 'block' : 'none';
  if (val !== 'custom') {
    scCondTemp = parseFloat(val);
    scUpdateRhoHint();
  }
}

function scSetTempCustom() {
  const v = parseFloat(document.getElementById('sc-temp-custom').value);
  if (!isNaN(v) && v >= 1) { scCondTemp = v; scUpdateRhoHint(); }
}

function scSetNetwork(btn, net) {
  scNetworkType = net;
  btn.closest('.seg-group').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  scRefreshNetHint();
  document.getElementById('sc-tt-re-row').style.display = net === 'tt' ? 'block' : 'none';
}

function scSetSourceMode(btn, mode) {
  scSourceMode = mode;
  btn.closest('.seg-group').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('sc-src-known-panel').style.display = mode === 'known'       ? 'block' : 'none';
  document.getElementById('sc-src-tr-panel').style.display    = mode === 'transformer' ? 'block' : 'none';
  if (mode === 'transformer') scUpdateFromTransformer(); else scUpdateZsDisplay();
}

function scOnDevTypeChange() {
  const type = document.getElementById('sc-dev-type')?.value;
  const curveFld = document.getElementById('sc-curve-fld');
  if (curveFld) curveFld.style.display = type === 'fuse' ? 'none' : 'flex';
  scUpdateTripHint();
}

function scSetSourceXR() {
  const v = parseFloat(document.getElementById('sc-xr')?.value);
  if (!isNaN(v) && v >= 0) { scSourceXR = v; scUpdateZsDisplay(); }
}

function scSetCableXpm() {
  const v = parseFloat(document.getElementById('sc-xpm')?.value);
  if (!isNaN(v) && v >= 0) scCableXpm = v;
}

// ─── language refresh (called by setLang) ────────────────────────────────────

function scRefreshNetHint() {
  const hints = {
    tns: T[lang].scNetHintTns,
    tnc: T[lang].scNetHintTnc,
    tt:  T[lang].scNetHintTt,
  };
  const el = document.getElementById('sc-net-hint');
  if (el) el.textContent = hints[scNetworkType] || '';
}

function scRefreshHints() {
  scRefreshNetHint();
  scUpdateTripHint();
}

// ─── import from tab 0 ───────────────────────────────────────────────────────

function scImportFromCalc() {
  if (typeof lastCalcResult === 'undefined' || !lastCalcResult) {
    showToast(lang === 'cze' ? 'Nejprve proveďte výpočet v tab 1' : 'Run calculator in tab 1 first');
    return;
  }
  const selS   = document.getElementById('sc-s-phase');
  const selPe  = document.getElementById('sc-s-pe');
  if (selS)  selS.value  = String(lastCalcResult.recStd);
  if (selPe) selPe.value = String(lastCalcResult.peStd);
  showToast(lang === 'cze' ? 'Importováno z kalkulátoru ✓' : 'Imported from calculator ✓');
}

// ─── main calculation ────────────────────────────────────────────────────────

function scCalculate() {
  const errEl = document.getElementById('sc-err');
  const fail  = m => {
    errEl.textContent = m;
    errEl.style.display = 'block';
    document.getElementById('sc-res-card').style.display = 'none';
  };
  errEl.style.display = 'none';

  const U0    = scGetU0();
  const U_LL  = scGetUnLine();
  const ik_kA = scGetIkBusbarKA();
  const S     = parseFloat(document.getElementById('sc-s-phase').value);
  const Spe   = parseFloat(document.getElementById('sc-s-pe').value);
  const L     = parseFloat(document.getElementById('sc-len').value);
  const In    = parseFloat(document.getElementById('sc-dev-in').value);
  const Icu_kA= parseFloat(document.getElementById('sc-icu').value);
  const devType = document.getElementById('sc-dev-type').value;

  if ([U0, U_LL, ik_kA, S, Spe, L, In, Icu_kA].some(v => isNaN(v) || v <= 0)) {
    return fail(T[lang].scErrFill);
  }
  if (U_LL < U0 * 0.99) return fail('Inconsistent voltage: U_LL must equal U0 × √3.');

  let Re = 0;
  if (scNetworkType === 'tt') {
    Re = parseFloat(document.getElementById('sc-re').value);
    if (isNaN(Re) || Re < 0) return fail(T[lang].scErrFill);
  }

  // ── source impedance (complex) ─────────────────────────────────────────────
  const Ik_sup_A = ik_kA * 1000;
  const Zs_mag   = U_LL / (Math.sqrt(3) * Ik_sup_A);  // |Zs|
  const XR       = scSourceXR;
  const Rs       = Zs_mag / Math.sqrt(1 + XR * XR);    // source resistance
  const Xs       = Rs * XR;                              // source reactance

  // ── cable resistivity: two temperatures ────────────────────────────────────
  // Max Ik → reference temperature (20°C, IEC 60909 §4.2)
  // Min Ik → user-selected operating temperature (worst case for protection)
  const rhoRef = SC_MAT[scMaterial].rho20;                               // 20°C
  const rhoHot = scGetRho();                                              // operating temp

  const xpm = scCableXpm * 1e-3;  // mΩ/m → Ω/m

  // Phase conductor impedances
  const Rf_max = rhoRef * L / S;    // R at 20°C (for max Ik)
  const Rf_hot = rhoHot * L / S;    // R at hot  (for min Ik)
  const Xf     = xpm * L;           // cable reactance (same for max/min)

  // PE conductor impedances
  const Rpe_max = rhoRef * L / Spe;
  const Rpe_hot = rhoHot * L / Spe;
  const Xpe     = xpm * L;

  // ── 3-phase loop impedances ────────────────────────────────────────────────
  // Z3 = Zs + Zf (source + phase cable)
  const Z3_max = cMag(Rs + Rf_max, Xs + Xf);
  const Z3_min = cMag(Rs + Rf_hot, Xs + Xf);

  // ── phase-to-phase loop impedances ────────────────────────────────────────
  // IEC 60909: I"k2 = c × U_LL / (2 × Z(1)); for symmetric Z(1)=Z(2)=Z3
  // → Ik2 = (√3 / 2) × Ik3 exactly (derived, not assumed)
  const Z2_max = Z3_max;  // Z(1) = Z(2) for cables
  const Z2_min = Z3_min;

  // ── phase-to-earth loop impedances ────────────────────────────────────────
  // TN: Z1 = Zs + Zf + Zpe (+ Re for TT)
  const Z1_max = cMag(Rs + Rf_max + Rpe_max + Re, Xs + Xf + Xpe);
  const Z1_min = cMag(Rs + Rf_hot + Rpe_hot + Re, Xs + Xf + Xpe);

  // ── fault currents (kA) ───────────────────────────────────────────────────
  // Max: c_max, cold cable (lowest R → highest I)
  // Min: c_min, hot cable  (highest R → lowest I)
  const Ik3_max = C_MAX * U0 / Z3_max / 1000;
  const Ik3_min = C_MIN * U0 / Z3_min / 1000;

  const Ik2_max = C_MAX * U_LL / (2 * Z2_max) / 1000;   // IEC 60909 exact formula
  const Ik2_min = C_MIN * U_LL / (2 * Z2_min) / 1000;

  const Ik1_max = C_MAX * U0 / Z1_max / 1000;
  const Ik1_min = C_MIN * U0 / Z1_min / 1000;

  // ── sanity check: downstream cannot exceed supply ─────────────────────────
  const Ik_max_kA = Math.max(Ik3_max, Ik2_max, Ik1_max);
  if (Ik_max_kA > ik_kA * 1.01) {
    return fail(
      'Max calculated fault current (' + Ik_max_kA.toFixed(2) +
      ' kA) exceeds supply Ik (' + ik_kA + ' kA). Check inputs.'
    );
  }

  // ── trip thresholds ───────────────────────────────────────────────────────
  const curveSel = document.getElementById('sc-dev-curve').value;
  const isFuse   = devType === 'fuse';
  const tripLo   = isFuse ? SC_FUSE_FACTOR * In : SC_CURVES[curveSel].min * In;   // device MAY trip
  const tripHi   = isFuse ? SC_FUSE_FACTOR * In : SC_CURVES[curveSel].max * In;   // device WILL trip
  const Ik1_min_A = Ik1_min * 1000;

  // Trip state: 0=no trip, 1=uncertain (in transition band), 2=guaranteed
  const tripState = Ik1_min_A >= tripHi ? 2 : (Ik1_min_A >= tripLo ? 1 : 0);

  // ── Icu check against worst-case fault ────────────────────────────────────
  const exceedsIcu     = Ik_max_kA > Icu_kA;
  const approachingIcu = !exceedsIcu && Ik_max_kA > 0.8 * Icu_kA;

  // ── max cable length (guaranteed trip, c_min, hot cable, quadratic) ───────
  // Solve: c_min × U0 / sqrt((Rs + rho_hot×(1/S+1/Spe)×L + Re)² + (Xs + 2×xpm×L)²) = tripHi
  // → (B²+D²)L² + 2(AB+CD)L + (A²+C²−Ztarget²) = 0
  const Ztarget = tripHi > 0 ? C_MIN * U0 / tripHi : 0;
  let L_max = -1;
  if (Ztarget > 0) {
    const A  = Rs + Re;
    const B  = rhoHot * (1 / S + 1 / Spe);
    const C  = Xs;
    const D  = 2 * xpm;
    const qa = B * B + D * D;
    const qb = 2 * (A * B + C * D);
    const qc = A * A + C * C - Ztarget * Ztarget;
    const disc = qb * qb - 4 * qa * qc;
    if (disc >= 0) {
      L_max = (-qb + Math.sqrt(disc)) / (2 * qa);
      if (L_max < 0) L_max = -1;
    }
  }

  // ─── populate result elements ────────────────────────────────────────────

  // Impedance grid
  document.getElementById('sc-r-zs').textContent    = fmtmOhm(Zs_mag);
  document.getElementById('sc-r-zs-r').textContent  = fmtmOhm(Rs);
  document.getElementById('sc-r-zs-x').textContent  = fmtmOhm(Xs);
  document.getElementById('sc-r-rf').textContent    = fmtmOhm(Rf_hot);
  document.getElementById('sc-r-xf').textContent    = fmtmOhm(Xf);
  document.getElementById('sc-r-rpe').textContent   = fmtmOhm(Rpe_hot);
  document.getElementById('sc-r-z3').textContent    = fmtmOhm(Z3_min);
  document.getElementById('sc-r-z1').textContent    = fmtmOhm(Z1_min);

  // Fault current range cards
  function setIkCard(idMax, idMin, maxKA, minKA) {
    document.getElementById(idMax).textContent = fmtIkVal(maxKA);
    document.getElementById(idMin).textContent = fmtIkVal(minKA);
  }
  setIkCard('sc-r-ik3-max', 'sc-r-ik3-min', Ik3_max, Ik3_min);
  setIkCard('sc-r-ik2-max', 'sc-r-ik2-min', Ik2_max, Ik2_min);
  setIkCard('sc-r-ik1-max', 'sc-r-ik1-min', Ik1_max, Ik1_min);

  // Trip status (3-state)
  const tripBox    = document.getElementById('sc-trip-box');
  const tripStatus = document.getElementById('sc-trip-status');
  const tripDetail = document.getElementById('sc-trip-detail');
  if (tripState === 2) {
    tripBox.className = 'sc-trip-box sc-trip-ok';
    tripStatus.textContent = '✅ Guaranteed trip (Ik1_min ≥ ' + tripHi.toFixed(0) + ' A)';
  } else if (tripState === 1) {
    tripBox.className = 'sc-trip-box sc-trip-partial';
    tripStatus.textContent = '⚠ Uncertain — Ik1_min in transition band';
  } else {
    tripBox.className = 'sc-trip-box sc-trip-fail';
    tripStatus.textContent = '❌ No guaranteed trip — Ik1_min < ' + tripLo.toFixed(0) + ' A';
  }
  const curveLabel = isFuse ? 'gG fuse' : SC_CURVES[curveSel].label;
  tripDetail.textContent =
    'Ik1: ' + fmtIkVal(Ik1_min) + ' … ' + fmtIkVal(Ik1_max) +
    '   |   Trip lo=' + tripLo.toFixed(0) + ' A  hi=' + tripHi.toFixed(0) + ' A';

  // Icu warnings
  const icuBox  = document.getElementById('sc-icu-box');
  const icuWarn = document.getElementById('sc-icu-warn');
  icuBox.style.display  = exceedsIcu     ? 'block' : 'none';
  icuWarn.style.display = approachingIcu ? 'block' : 'none';
  if (exceedsIcu) {
    const lbl = Ik_max_kA === Ik3_max ? 'Ik3_max' : (Ik_max_kA === Ik2_max ? 'Ik2_max' : 'Ik1_max');
    icuBox.innerHTML = '⚠ <strong>' + lbl + ' = ' + Ik_max_kA.toFixed(2) + ' kA &gt; Icu = ' + Icu_kA +
      ' kA</strong> — device breaking capacity EXCEEDED!';
  }
  if (approachingIcu) {
    icuWarn.innerHTML = '⚠ Ik_max = ' + Ik_max_kA.toFixed(2) + ' kA &gt; 80% of Icu = ' + Icu_kA +
      ' kA — consider a higher-rated device.';
  }

  // Max cable length
  const mlBox = document.getElementById('sc-maxlen-box');
  if (L_max > 0) {
    mlBox.textContent = engRound(L_max, 3) + ' m';
    mlBox.className   = 'sc-maxlen-box ' + (L > L_max ? 'sc-maxlen-warn' : 'sc-maxlen-ok');
    if (L > L_max) mlBox.textContent += '  ⚠ Current cable (' + L + ' m) exceeds max length!';
  } else {
    mlBox.textContent = 'Cannot guarantee — source impedance too high';
    mlBox.className   = 'sc-maxlen-box sc-maxlen-warn';
  }

  // ─── Assumptions display ─────────────────────────────────────────────────
  const sysLabel = scVoltPreset === 'ac1' ? '1-phase 230 V' : scVoltPreset === 'ac3' ? '3-phase 400 V' : 'Custom';
  const voltModeStr = sysLabel + '  →  U0 = ' + engRound(U0, 4) + ' V  ·  U_LL = ' + engRound(U_LL, 4) + ' V';
  document.getElementById('sc-assumptions').textContent = [
    'Voltage: ' + voltModeStr,
    'Voltage factors: c_max = ' + C_MAX + ' (max Ik, Icu check)   c_min = ' + C_MIN + ' (min Ik, protection)',
    'Source X/R = ' + XR + '   |Zs| = ' + fmtmOhm(Zs_mag) + '   Rs = ' + fmtmOhm(Rs) + '   Xs = ' + fmtmOhm(Xs),
    'Cable x\' = ' + scCableXpm + ' mΩ/m',
    'Max Ik: T = 20°C (reference, IEC 60909 §4.2)   ρ = ' + engRound(rhoRef, 3) + ' Ω·mm²/m',
    'Min Ik: T = ' + scCondTemp + '°C (operating)   ρ = ' + engRound(rhoHot, 4) + ' Ω·mm²/m',
    'Network: ' + scNetworkType.toUpperCase() + (Re > 0 ? '   Re = ' + Re + ' Ω' : ''),
  ].join('\n');

  // ─── calculation steps ───────────────────────────────────────────────────
  const fmtO = v => engRound(v, 3) + ' Ω';
  const lines = [
    '=== Input parameters ===',
    'Voltage input: ' + voltModeStr,
    'U_LL (line-to-line) = ' + engRound(U_LL, 4) + ' V   U0 (phase) = ' + engRound(U0, 4) + ' V',
    'Ik_supply = ' + ik_kA + ' kA   Network: ' + scNetworkType.toUpperCase(),
    'S = ' + S + ' mm2   Spe = ' + Spe + ' mm2   L = ' + L + ' m',
    'Material: ' + scMaterial.toUpperCase() + '   Temp (min Ik): ' + scCondTemp + ' C   Temp (max Ik): 20 C',
    'rho_ref (20C) = ' + engRound(rhoRef, 4) + ' Ohm*mm2/m',
    'rho_hot (' + scCondTemp + 'C) = ' + engRound(rhoHot, 4) + ' Ohm*mm2/m  [rho(T)=rho20*(1+alpha*(T-20))]',
    'Cable reactance x\' = ' + scCableXpm + ' mOhm/m',
    Re > 0 ? 'Re (TT earth) = ' + Re + ' Ohm' : '',
    '',
    '=== IEC 60909 voltage factors ===',
    'c_max = ' + C_MAX + '  (maximum fault current — equipment rating / Icu check)',
    'c_min = ' + C_MIN + '  (minimum fault current — protection / disconnection verification)',
    '',
    '=== Source impedance (complex) ===',
    '|Zs| = U_LL / (sqrt(3) * Ik_sup) = ' + engRound(U_LL,4) + ' / (1.732 * ' + Ik_sup_A.toFixed(0) + ') = ' + fmtmOhm(Zs_mag),
    'X/R ratio = ' + XR,
    'Rs = |Zs| / sqrt(1 + (X/R)^2) = ' + fmtmOhm(Rs),
    'Xs = (X/R) * Rs = ' + fmtmOhm(Xs),
    '',
    '=== Cable impedances ===',
    'Rf_max (20C) = rho_ref * L / S   = ' + fmtmOhm(Rf_max) + '  [used for max Ik]',
    'Rf_hot (' + scCondTemp + 'C) = rho_hot * L / S = ' + fmtmOhm(Rf_hot) + '  [used for min Ik]',
    'Rpe_max (20C)  = ' + fmtmOhm(Rpe_max) + '   Rpe_hot = ' + fmtmOhm(Rpe_hot),
    'Xf = x\' * L = ' + scCableXpm + ' * ' + L + ' = ' + fmtmOhm(Xf) + '   Xpe = ' + fmtmOhm(Xpe),
    '',
    '=== 3-phase loop impedances ===',
    'Z3_max = sqrt((Rs+Rf_max)^2 + (Xs+Xf)^2) = ' + fmtmOhm(Z3_max),
    'Z3_min = sqrt((Rs+Rf_hot)^2 + (Xs+Xf)^2) = ' + fmtmOhm(Z3_min),
    '',
    '=== Phase-to-phase loop impedances ===',
    'Z2 = Z3  (Z(1)=Z(2) for symmetric cable, IEC 60909 §3.6)',
    '',
    '=== Phase-to-earth loop impedances (TN) ===',
    'Z1_max = sqrt((Rs+Rf_max+Rpe_max' + (Re>0?'+Re':'')+')^2 + (Xs+Xf+Xpe)^2) = ' + fmtmOhm(Z1_max),
    'Z1_min = sqrt((Rs+Rf_hot+Rpe_hot' + (Re>0?'+Re':'')+')^2 + (Xs+Xf+Xpe)^2) = ' + fmtmOhm(Z1_min),
    '',
    '=== Fault currents ===',
    'Ik3_max = c_max * U0 / Z3_max = ' + C_MAX + ' * ' + engRound(U0,4) + ' / ' + fmtmOhm(Z3_max) + ' = ' + fmtIkVal(Ik3_max),
    'Ik3_min = c_min * U0 / Z3_min = ' + C_MIN + ' * ' + engRound(U0,4) + ' / ' + fmtmOhm(Z3_min) + ' = ' + fmtIkVal(Ik3_min),
    '',
    'Ik2_max = c_max * U_LL / (2 * Z2_max) = ' + C_MAX + ' * ' + engRound(U_LL,4) + ' / (2 * ' + fmtmOhm(Z2_max) + ') = ' + fmtIkVal(Ik2_max),
    'Ik2_min = c_min * U_LL / (2 * Z2_min) = ' + fmtIkVal(Ik2_min),
    '  [Derivation: I"k2 = c*U_LL/(Z(1)+Z(2)) = c*U_LL/(2*Z3), yields exactly (sqrt(3)/2)*Ik3 per IEC 60909 §4.3]',
    '',
    'Ik1_max = c_max * U0 / Z1_max = ' + C_MAX + ' * ' + engRound(U0,4) + ' / ' + fmtmOhm(Z1_max) + ' = ' + fmtIkVal(Ik1_max),
    'Ik1_min = c_min * U0 / Z1_min = ' + C_MIN + ' * ' + engRound(U0,4) + ' / ' + fmtmOhm(Z1_min) + ' = ' + fmtIkVal(Ik1_min),
    '',
    '=== Trip verification ===',
    'Device: ' + devType.toUpperCase() + '   In = ' + In + ' A   Curve: ' + curveLabel,
    'May trip above (lower bound):      ' + tripLo.toFixed(0) + ' A',
    'Guaranteed trip (upper bound): ' + tripHi.toFixed(0) + ' A  [IEC 60898 — used for L_max]',
    'Ik1_min = ' + fmtIkVal(Ik1_min) + '   =>   ' + ['NO TRIP', 'UNCERTAIN (transition band)', 'GUARANTEED TRIP'][tripState],
    '',
    '=== Breaking capacity ===',
    'Iku_max = max(Ik3_max, Ik2_max, Ik1_max) = ' + Ik_max_kA.toFixed(2) + ' kA',
    'Icu = ' + Icu_kA + ' kA   =>   ' + (exceedsIcu ? 'EXCEEDED!' : (approachingIcu ? 'WARNING: > 80% of Icu' : 'OK')),
    '',
    '=== Maximum cable length (guaranteed trip, c_min, hot cable) ===',
    'Solve quadratic: (B^2+D^2)*L^2 + 2*(A*B+C*D)*L + (A^2+C^2-Ztarget^2) = 0',
    'where A=Rs+Re=' + fmtO(Rs+Re) + '  B=rho_hot*(1/S+1/Spe)=' + engRound(rhoHot*(1/S+1/Spe),4) + ' Ohm/m',
    '      C=Xs=' + fmtO(Xs) + '  D=2*x\'=' + engRound(2*xpm,5) + ' Ohm/m',
    '      Ztarget=c_min*U0/tripHi=' + fmtO(Ztarget),
    L_max > 0
      ? 'L_max = ' + engRound(L_max, 3) + ' m   [actual L = ' + L + ' m => ' + (L > L_max ? 'EXCEEDED' : 'OK') + ']'
      : 'No solution — Ztarget > |Zs| (protection cannot be guaranteed even without cable)',
  ].filter(s => s !== '');

  document.getElementById('sc-steps').textContent = lines.join('\n');
  document.getElementById('sc-res-card').style.display = 'block';
  document.getElementById('sc-res-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  window._scLastResult = {
    U0, U_LL, ik_kA, S, Spe, L, In, Icu_kA, devType, Re,
    rhoRef, rhoHot, XR, xpm: scCableXpm,
    Rs, Xs, Zs_mag, Rf_hot, Xf, Rpe_hot, Z3_min, Z1_min,
    Ik3_max, Ik3_min, Ik2_max, Ik2_min, Ik1_max, Ik1_min,
    Ik_max_kA, tripState, tripLo, tripHi, exceedsIcu, approachingIcu, L_max,
    curveSel: isFuse ? 'gG' : curveSel, curveLabel,
    voltModeStr,
  };
}

/* ===================================================================
   PDF EXPORT
   =================================================================== */
async function scDownloadPdf() {
  const btn = document.getElementById('sc-pdf-btn');
  btn.textContent = 'Generating…';
  btn.disabled = true;

  try {
    if (!window.jspdf && !window.jsPDF) { showToast('jsPDF not loaded'); return; }
    const { jsPDF } = window.jspdf || window;
    const r = window._scLastResult;
    if (!r) { showToast('No results — calculate first'); return; }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const PW = 210, PH = 297, M = 15;
    const CW = PW - M * 2;
    const ACC = [26, 82, 118];

    const today = new Date();
    const ds = [today.getDate(), today.getMonth() + 1, today.getFullYear()]
      .map((v, i) => i < 2 ? String(v).padStart(2, '0') : v).join('.');
    const engineer = document.getElementById('sb-engineer')?.value.trim() || '';

    function drawHeader(pageNum, totalPages) {
      if (sbLogoB64) {
        try {
          const logoH = 10;
          const logoW = sbLogoNW && sbLogoNH ? (sbLogoNW / sbLogoNH) * logoH : 25;
          doc.addImage(sbLogoB64, 'PNG', M, M, logoW, logoH);
        } catch (e) {}
      }
      const co = sbCompany || {};
      const addrLines = [
        co.name,
        co.street,
        [co.zip, co.city].filter(Boolean).join(' '),
        co.country,
      ].filter(Boolean);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
      addrLines.forEach((line, i) => doc.text(line, PW - M, M + i * 3.8, { align: 'right' }));

      const rY = M + 14;
      doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
      doc.line(M, rY, PW - M, rY);
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
      doc.text('Short-Circuit Current Calculation', M, rY - 2);

      doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
      doc.line(M, PH - M - 6, PW - M, PH - M - 6);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120);
      doc.text(ds + (engineer ? '  |  ' + engineer : ''), M, PH - M - 2);
      doc.text('Page ' + pageNum + ' of ' + totalPages, PW / 2, PH - M - 2, { align: 'center' });
      doc.text('IEC 60909 / IEC 60364', PW - M, PH - M - 2, { align: 'right' });
    }

    function secTitle(y, title) {
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...ACC);
      doc.text(title, M, y);
      return y + 6;
    }

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

    function resultsSection(y) {
      const fmtIkPdf = v => v >= 1 ? v.toFixed(2) + ' kA' : (v * 1000).toFixed(0) + ' A';
      const fmtmO = v => (v * 1000).toFixed(2) + ' mOhm';

      // ── impedance bar (4 equal columns) ──
      const impH = 14, colW4 = CW / 4;
      const impItems = [
        ['|Zs| source',      fmtmO(r.Zs_mag)],
        ['Rf (phase, hot)',  fmtmO(r.Rf_hot)],
        ['Rpe (hot)',        fmtmO(r.Rpe_hot)],
        ['Z1_loop (min)',    fmtmO(r.Z1_min)],
      ];
      doc.setFillColor(240, 245, 250); doc.setDrawColor(200, 210, 225); doc.setLineWidth(0.2);
      doc.rect(M, y, CW, impH, 'FD');
      impItems.forEach(([lbl, val], i) => {
        const cx = M + i * colW4;
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
        doc.text(lbl, cx + colW4 / 2, y + 4.5, { align: 'center' });
        doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...ACC);
        doc.text(pdfSafe(val), cx + colW4 / 2, y + 11, { align: 'center' });
        if (i < 3) { doc.setDrawColor(200, 210, 225); doc.setLineWidth(0.15); doc.line(cx + colW4, y, cx + colW4, y + impH); }
      });
      y += impH + 4;

      // ── fault current cards (3 columns, max/min range) ──
      const cardW = CW / 3, cardH = 30;
      [
        { lbl: 'Ik3 — 3-phase',  sub: '3-phase fault',   valMax: fmtIkPdf(r.Ik3_max), valMin: fmtIkPdf(r.Ik3_min), hl: false },
        { lbl: 'Ik2 — 2-phase',  sub: 'phase-to-phase',  valMax: fmtIkPdf(r.Ik2_max), valMin: fmtIkPdf(r.Ik2_min), hl: false },
        { lbl: 'Ik1 — 1-phase',  sub: 'earth fault',     valMax: fmtIkPdf(r.Ik1_max), valMin: fmtIkPdf(r.Ik1_min), hl: true  },
      ].forEach((f, i) => {
        const cx = M + i * cardW;
        if (f.hl) { doc.setFillColor(235, 244, 252); doc.setDrawColor(...ACC); doc.setLineWidth(0.5); }
        else       { doc.setFillColor(245, 247, 250); doc.setDrawColor(200, 210, 225); doc.setLineWidth(0.2); }
        doc.rect(cx, y, cardW, cardH, 'FD');
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
        doc.text(pdfSafe(f.lbl), cx + cardW / 2, y + 5.5, { align: 'center' });
        doc.text(f.sub, cx + cardW / 2, y + 9.5, { align: 'center' });
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...ACC);
        doc.text('MAX: ' + f.valMax, cx + cardW / 2, y + 17, { align: 'center' });
        doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
        doc.text('min: ' + f.valMin, cx + cardW / 2, y + 24, { align: 'center' });
      });
      y += cardH + 4;

      // ── trip status (3-state) ──
      let tcol, tbg, tLabel;
      if (r.tripState === 2) {
        tcol = [0, 160, 80]; tbg = [232, 252, 240]; tLabel = 'GUARANTEED TRIP';
      } else if (r.tripState === 1) {
        tcol = [255, 165, 0]; tbg = [255, 245, 220]; tLabel = 'UNCERTAIN — TRANSITION BAND';
      } else {
        tcol = [200, 40, 40]; tbg = [252, 232, 232]; tLabel = 'DEVICE WILL NOT TRIP';
      }
      doc.setFillColor(...tbg); doc.setDrawColor(...tcol); doc.setLineWidth(0.5);
      doc.rect(M, y, CW, 16, 'FD');
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...tcol);
      doc.text(tLabel, PW / 2, y + 6.5, { align: 'center' });
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      const tripDetailStr = 'Ik1: min=' + fmtIkPdf(r.Ik1_min) + ' / max=' + fmtIkPdf(r.Ik1_max) +
        '  |  tripLo=' + r.tripLo.toFixed(0) + ' A  tripHi=' + r.tripHi.toFixed(0) + ' A';
      doc.text(pdfSafe(tripDetailStr), PW / 2, y + 12.5, { align: 'center' });
      y += 16 + 3;

      // ── Icu warning (if exceeded) ──
      if (r.exceedsIcu) {
        doc.setFillColor(252, 232, 232); doc.setDrawColor(200, 40, 40); doc.setLineWidth(0.5);
        doc.rect(M, y, CW, 10, 'FD');
        doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(200, 40, 40);
        doc.text(pdfSafe('WARNING: Ik_max = ' + r.Ik_max_kA.toFixed(2) + ' kA > Icu = ' + r.Icu_kA + ' kA — BREAKING CAPACITY EXCEEDED'),
          PW / 2, y + 6.5, { align: 'center', maxWidth: CW - 6 });
        y += 10 + 2;
      }

      // ── Icu 80% approaching warning ──
      if (r.approachingIcu) {
        doc.setFillColor(255, 245, 220); doc.setDrawColor(200, 130, 0); doc.setLineWidth(0.4);
        doc.rect(M, y, CW, 10, 'FD');
        doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(160, 100, 0);
        doc.text(pdfSafe('CAUTION: Ik_max = ' + r.Ik_max_kA.toFixed(2) + ' kA > 80% of Icu = ' + r.Icu_kA + ' kA — consider higher-rated device'),
          PW / 2, y + 6.5, { align: 'center', maxWidth: CW - 6 });
        y += 10 + 2;
      }

      // ── max cable length ──
      const mlOk = r.L_max > 0 && r.L <= r.L_max;
      doc.setFillColor(245, 247, 250); doc.setDrawColor(200, 210, 225); doc.setLineWidth(0.2);
      doc.rect(M, y, CW, 10, 'FD');
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
      doc.text('Max. cable length (guaranteed trip):', M + 3, y + 6.5);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(mlOk ? 0 : 180, mlOk ? 160 : 100, mlOk ? 80 : 0);
      doc.text(r.L_max > 0 ? engRound(r.L_max, 3) + ' m' : 'N/A', M + CW - 3, y + 6.5, { align: 'right' });
      y += 10;

      return y;
    }

    // ── Input parameter rows ──
    const netLbl = { tns: 'TN-S', tnc: 'TN-C', tt: 'TT' };
    const matLbl = { cu: 'Copper (Cu)', al: 'Aluminium (Al)' };
    const srcStr = scSourceMode === 'transformer'
      ? 'Transformer (' + (document.getElementById('sc-tr-sn')?.value || '?') + ' kVA, Uk=' + (document.getElementById('sc-tr-uk')?.value || '?') + '%)'
      : 'Known value';
    const inputRows = [
      ['Voltage (input)', r.voltModeStr],
      ['Network type', netLbl[scNetworkType]],
      ['Conductor material', matLbl[scMaterial]],
      ['Temp max Ik / min Ik', '20°C / ' + scCondTemp + '°C'],
      ['Resistivity rho (20C / hot)', engRound(r.rhoRef, 5) + ' / ' + engRound(r.rhoHot, 5) + ' Ohm*mm2/m'],
      ['Source X/R ratio', r.XR],
      ['Cable reactance x\'', r.xpm + ' mOhm/m'],
      ['Source Ik', r.ik_kA + ' kA  (' + srcStr + ')'],
      ['Phase conductor S', r.S + ' mm2'],
      ['PE conductor Spe', r.Spe + ' mm2'],
      ['Cable length L', r.L + ' m'],
    ];
    if (r.Re > 0) inputRows.push(['Earth resistance Re (TT)', r.Re + ' Ohm']);
    inputRows.push(
      ['Protective device', r.devType.toUpperCase()],
      ['Rated current In', r.In + ' A'],
      ['Trip characteristic', pdfSafe(r.curveLabel)],
      ['Breaking capacity Icu', r.Icu_kA + ' kA'],
    );

    // ── PAGE 1: Inputs + Results ──
    const TOTAL_PAGES = 2;
    drawHeader(1, TOTAL_PAGES);
    let y = M + 22;

    y = secTitle(y, 'Input Parameters');
    y = inputTable(y, inputRows);
    y += 6;

    y = secTitle(y, 'Results');
    resultsSection(y);

    // ── PAGE 2: Calculations ──
    doc.addPage();
    drawHeader(2, TOTAL_PAGES);
    y = M + 22;
    y = secTitle(y, 'Step-by-Step Calculations  (IEC 60909 / IEC 60364)');

    const allLines = document.getElementById('sc-steps').textContent.split('\n');
    allLines.forEach(line => {
      if (!line.trim()) { y += 2; return; }
      if (line.startsWith('===')) {
        if (y > PH - M - 22) { doc.addPage(); drawHeader(2, TOTAL_PAGES); y = M + 22; }
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...ACC);
        doc.text(pdfSafe(line), M, y); y += 5;
        doc.setDrawColor(200, 210, 225); doc.setLineWidth(0.2);
        doc.line(M, y, PW - M, y); y += 3;
        return;
      }
      if (y > PH - M - 8) { doc.addPage(); drawHeader(2, TOTAL_PAGES); y = M + 22; }
      const indented = line.startsWith('  ');
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40);
      doc.text(pdfSafe(line.trimStart()), M + (indented ? 6 : 0), y);
      y += 4.5;
    });

    doc.save('short-circuit-ik.pdf');
    showToast('PDF downloaded ✓');
  } catch (e) {
    console.error(e);
    showToast('PDF error: ' + e.message);
  } finally {
    btn.textContent = T[lang].scPdfBtn || '⬇ Download PDF';
    btn.disabled = false;
  }
}

/* ===================================================================
   AC / DC SUB-TAB SWITCH
   =================================================================== */
function scSwitchMode(mode) {
  document.getElementById('sc-ac-panel').style.display = mode === 'ac' ? 'block' : 'none';
  document.getElementById('sc-dc-panel').style.display = mode === 'dc' ? 'block' : 'none';
  document.getElementById('sc-sub-ac').classList.toggle('active', mode === 'ac');
  document.getElementById('sc-sub-dc').classList.toggle('active', mode === 'dc');
}

/* ===================================================================
   DC SHORT-CIRCUIT CALCULATOR
   =================================================================== */

// ─── DC state ─────────────────────────────────────────────────────────────────
let dcMaterial  = 'cu';
let dcCondTemp  = 70;    // °C for min Ik (hot cable = protection worst-case)
let dcSrcType   = 'known_ik';

// ─── DC helpers ──────────────────────────────────────────────────────────────

function dcGetRhoRef() { return SC_MAT[dcMaterial].rho20; }   // 20°C

function dcGetRhoHot() {
  const { rho20, alpha } = SC_MAT[dcMaterial];
  return rho20 * (1 + alpha * (dcCondTemp - 20));
}

function dcUpdateRhoHint() {
  const el = document.getElementById('dc-rho-hint');
  if (el) el.textContent = 'ρ = ' + dcGetRhoHot().toFixed(5) +
    ' Ω·mm²/m (' + (dcMaterial === 'cu' ? 'Cu' : 'Al') + ', ' + dcCondTemp + ' °C)';
}

function dcGetRsrcOhm() {
  const udc = parseFloat(document.getElementById('dc-udc')?.value) || 0;
  if (dcSrcType === 'known_ik') {
    const ik = parseFloat(document.getElementById('dc-ik-src')?.value) || 0;
    return ik > 0 ? udc / ik : 0;
  }
  if (dcSrcType === 'known_r') {
    return (parseFloat(document.getElementById('dc-r-src')?.value) || 0) / 1000;
  }
  return 0; // SMPS — bypass R_source logic
}

function dcUpdateRsrcDisplay() {
  const el = document.getElementById('dc-rsrc-val');
  if (!el) return;
  if (dcSrcType === 'smps') { el.textContent = 'N/A (SMPS)'; return; }
  const r = dcGetRsrcOhm();
  el.textContent = r > 0 ? fmtmOhm(r) : '—';
}

function dcUpdateTripHint() {
  const type = document.getElementById('dc-dev-type')?.value;
  const In   = parseFloat(document.getElementById('dc-dev-in')?.value) || 0;
  const hint = document.getElementById('dc-trip-hint');
  if (!hint) return;
  if (type === 'fuse') {
    hint.textContent = 'gG: I2 ≈ 1.6 × In = ' + (SC_FUSE_FACTOR * In).toFixed(0) + ' A';
    return;
  }
  const curve = document.getElementById('dc-dev-curve')?.value;
  if (curve && SC_CURVES[curve] && In > 0) {
    const c = SC_CURVES[curve];
    hint.textContent =
      'May trip above ' + (c.min * In).toFixed(0) + ' A · ' +
      'Guaranteed above ' + (c.max * In).toFixed(0) + ' A';
  }
}

// ─── DC segment setters ───────────────────────────────────────────────────────

function dcSetMaterial(btn, mat) {
  dcMaterial = mat;
  btn.closest('.seg-group').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  dcUpdateRhoHint();
}

function dcSetTemp(val) {
  document.getElementById('dc-temp-custom-row').style.display = val === 'custom' ? 'block' : 'none';
  if (val !== 'custom') { dcCondTemp = parseFloat(val); dcUpdateRhoHint(); }
}

function dcSetTempCustom() {
  const v = parseFloat(document.getElementById('dc-temp-custom').value);
  if (!isNaN(v) && v >= 1) { dcCondTemp = v; dcUpdateRhoHint(); }
}

function dcOnSrcTypeChange() {
  dcSrcType = document.getElementById('dc-src-type').value;
  document.getElementById('dc-src-ik-row').style.display   = dcSrcType === 'known_ik' ? 'block' : 'none';
  document.getElementById('dc-src-r-row').style.display    = dcSrcType === 'known_r'  ? 'block' : 'none';
  document.getElementById('dc-src-smps-row').style.display = dcSrcType === 'smps'     ? 'block' : 'none';
  dcUpdateRsrcDisplay();
}

function dcOnDevTypeChange() {
  const type = document.getElementById('dc-dev-type')?.value;
  const curveFld = document.getElementById('dc-curve-fld');
  if (curveFld) curveFld.style.display = type === 'fuse' ? 'none' : 'flex';
  dcUpdateTripHint();
}

// ─── DC init ──────────────────────────────────────────────────────────────────

function initDcCalculator() {
  ['dc-s-phase', 'dc-s-pe'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    MM2_STD.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s + ' mm²';
      if (s === 2.5) opt.selected = true;
      sel.appendChild(opt);
    });
  });
  dcOnDevTypeChange();
  dcUpdateTripHint();
  dcUpdateRsrcDisplay();
  dcUpdateRhoHint();
}

// ─── DC main calculation ──────────────────────────────────────────────────────

function dcCalculate() {
  const errEl = document.getElementById('dc-err');
  const fail  = m => {
    errEl.textContent = m;
    errEl.style.display = 'block';
    document.getElementById('dc-res-card').style.display = 'none';
  };
  errEl.style.display = 'none';

  const U_DC  = parseFloat(document.getElementById('dc-udc').value);
  const S     = parseFloat(document.getElementById('dc-s-phase').value);
  const Spe   = parseFloat(document.getElementById('dc-s-pe').value);
  const L     = parseFloat(document.getElementById('dc-len').value);
  const lpm   = parseFloat(document.getElementById('dc-lpm').value);   // μH/m
  const In    = parseFloat(document.getElementById('dc-dev-in').value);
  const Icu_kA= parseFloat(document.getElementById('dc-icu').value);
  const devType = document.getElementById('dc-dev-type').value;

  if ([U_DC, S, Spe, L, In, Icu_kA].some(v => isNaN(v) || v <= 0)) {
    return fail('Please fill in all fields (positive values).');
  }
  if (isNaN(lpm) || lpm < 0) return fail('Cable inductance must be ≥ 0.');

  const isFuse = devType === 'fuse';
  const curveSel = document.getElementById('dc-dev-curve')?.value;
  const tripLo = isFuse ? SC_FUSE_FACTOR * In : SC_CURVES[curveSel].min * In;
  const tripHi = isFuse ? SC_FUSE_FACTOR * In : SC_CURVES[curveSel].max * In;

  // ── SMPS mode ──────────────────────────────────────────────────────────────
  if (dcSrcType === 'smps') {
    const I_lim = parseFloat(document.getElementById('dc-i-lim').value);
    if (isNaN(I_lim) || I_lim <= 0) return fail('Enter a valid SMPS current limit.');

    const tripState = I_lim >= tripHi ? 2 : (I_lim >= tripLo ? 1 : 0);
    const curveLabel = isFuse ? 'gG fuse' : SC_CURVES[curveSel].label;

    // Impedance display (cable only — R_source not applicable)
    const rhoHot = dcGetRhoHot();
    const Rcable_hot = rhoHot * L / S;
    const Rpe_hot    = rhoHot * L / Spe;
    const Rloop_min  = Rcable_hot + Rpe_hot; // source not included
    document.getElementById('dc-r-rsrc').textContent   = 'N/A (SMPS)';
    document.getElementById('dc-r-rcable').textContent = fmtmOhm(Rcable_hot);
    document.getElementById('dc-r-rpe').textContent    = fmtmOhm(Rpe_hot);
    document.getElementById('dc-r-rloop').textContent  = '—';
    document.getElementById('dc-r-ik-max').textContent = '—';
    document.getElementById('dc-r-ik-min').textContent = '—';
    document.getElementById('dc-r-tau').textContent    = '—';
    document.getElementById('dc-r-3tau').textContent   = '—';

    _dcSetTripBox(tripState, I_lim, I_lim, tripLo, tripHi);
    document.getElementById('dc-smps-warn').style.display  = 'block';
    document.getElementById('dc-icu-box').style.display    = 'none';
    document.getElementById('dc-icu-warn').style.display   = 'none';
    document.getElementById('dc-maxlen-box').textContent   = 'N/A — SMPS mode';
    document.getElementById('dc-maxlen-box').className     = 'sc-maxlen-box sc-maxlen-warn';

    const lines = [
      '=== SMPS Mode — Resistive calculation not applicable ===',
      'U_DC = ' + U_DC + ' V   I_lim = ' + I_lim + ' A',
      '',
      '=== Trip verification ===',
      'Device: ' + devType.toUpperCase() + '   In = ' + In + ' A   Curve: ' + curveLabel,
      'May trip above:        ' + tripLo.toFixed(0) + ' A',
      'Guaranteed trip above: ' + tripHi.toFixed(0) + ' A',
      'I_lim = ' + I_lim.toFixed(0) + ' A => ' + ['NO TRIP', 'UNCERTAIN', 'GUARANTEED TRIP'][tripState],
      '',
      'WARNING: SMPS current limit may fold back under fault.',
      'Magnetic trip not reliable — consider eFuse or verify SMPS short-circuit characteristic.',
      'L_max: not calculated in SMPS mode.',
    ];
    document.getElementById('dc-steps').textContent = lines.join('\n');
    document.getElementById('dc-res-card').style.display = 'block';
    document.getElementById('dc-res-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    window._dcLastResult = { smps: true, U_DC, I_lim, In, Icu_kA, devType, tripState, tripLo, tripHi,
      curveLabel, exceedsIcu: false, approachingIcu: false, L_max: -1, S, Spe, L,
      Rcable_hot, Rpe_hot, dcCondTemp, dcMaterial };
    return;
  }

  // ── Normal (resistive) mode ────────────────────────────────────────────────
  const R_source = dcGetRsrcOhm();
  if (R_source < 0) return fail('Invalid source resistance.');

  const rhoRef = dcGetRhoRef();  // 20°C — for max Ik
  const rhoHot = dcGetRhoHot();  // operating T — for min Ik

  // Cable & return conductor
  const Rcable_max = rhoRef * L / S;
  const Rcable_hot = rhoHot * L / S;
  const Rpe_max    = rhoRef * L / Spe;
  const Rpe_hot    = rhoHot * L / Spe;

  // Loop resistances
  const Rloop_max = R_source + Rcable_max + Rpe_max;   // cold — lowest R → highest Ik
  const Rloop_min = R_source + Rcable_hot + Rpe_hot;   // hot  — highest R → lowest Ik

  if (Rloop_max <= 0) return fail('Total loop resistance ≤ 0. Check inputs.');

  // Fault currents (DC — no voltage factor c)
  const Ik_max = U_DC / Rloop_max;  // A
  const Ik_min = U_DC / Rloop_min;  // A

  // Time constant (τ = L_loop / R_loop_max — conservative for equipment rating)
  const L_loop_uH = 2 * lpm * L;         // μH (both conductors)
  const L_loop_H  = L_loop_uH * 1e-6;    // H
  const tau_s     = L_loop_H / Rloop_max;
  const tau_ms    = tau_s * 1000;
  const tau3_ms   = 3 * tau_ms;

  // Trip thresholds
  const tripState = Ik_min >= tripHi ? 2 : (Ik_min >= tripLo ? 1 : 0);

  // Icu check
  const exceedsIcu     = Ik_max / 1000 > Icu_kA;
  const approachingIcu = !exceedsIcu && Ik_max / 1000 > 0.8 * Icu_kA;

  // Max cable length (linear, DC — no reactance)
  // Ztarget = U_DC / tripHi  →  R_source + rho_hot*(1/S+1/Spe)*L = Ztarget
  // L_max = (Ztarget - R_source) / (rho_hot * (1/S + 1/Spe))
  let L_max = -1;
  const Ztarget_dc = tripHi > 0 ? U_DC / tripHi : 0;
  if (Ztarget_dc > 0) {
    const B_dc = rhoHot * (1 / S + 1 / Spe);
    const numer = Ztarget_dc - R_source;
    if (numer > 0 && B_dc > 0) L_max = numer / B_dc;
    else if (numer <= 0) L_max = -2; // source R alone exceeds target
  }

  // ─── Populate results ────────────────────────────────────────────────────
  document.getElementById('dc-r-rsrc').textContent   = fmtmOhm(R_source);
  document.getElementById('dc-r-rcable').textContent = fmtmOhm(Rcable_hot);
  document.getElementById('dc-r-rpe').textContent    = fmtmOhm(Rpe_hot);
  document.getElementById('dc-r-rloop').textContent  = fmtmOhm(Rloop_min);

  const fmtA = v => v >= 1000 ? engRound(v / 1000, 3) + ' kA' : engRound(v, 3) + ' A';
  document.getElementById('dc-r-ik-max').textContent = fmtA(Ik_max);
  document.getElementById('dc-r-ik-min').textContent = fmtA(Ik_min);
  document.getElementById('dc-r-tau').textContent    = engRound(tau_ms, 3) + ' ms';
  document.getElementById('dc-r-3tau').textContent   = engRound(tau3_ms, 3) + ' ms';

  const curveLabel = isFuse ? 'gG fuse' : SC_CURVES[curveSel].label;
  _dcSetTripBox(tripState, Ik_min, Ik_max, tripLo, tripHi);
  document.getElementById('dc-smps-warn').style.display = 'none';

  // Icu
  const icuBox  = document.getElementById('dc-icu-box');
  const icuWarn = document.getElementById('dc-icu-warn');
  icuBox.style.display  = exceedsIcu     ? 'block' : 'none';
  icuWarn.style.display = approachingIcu ? 'block' : 'none';
  if (exceedsIcu)     icuBox.innerHTML = '⚠ <strong>Ik_max = ' + fmtA(Ik_max) + ' > Icu_DC = ' + Icu_kA + ' kA</strong> — DC breaking capacity EXCEEDED!';
  if (approachingIcu) icuWarn.innerHTML = '⚠ Ik_max = ' + fmtA(Ik_max) + ' > 80% of Icu_DC = ' + Icu_kA + ' kA — consider higher-rated device.';

  // Max cable length
  const mlBox = document.getElementById('dc-maxlen-box');
  if (L_max > 0) {
    mlBox.textContent = engRound(L_max, 3) + ' m';
    mlBox.className   = 'sc-maxlen-box ' + (L > L_max ? 'sc-maxlen-warn' : 'sc-maxlen-ok');
    if (L > L_max) mlBox.textContent += '  ⚠ Current cable (' + L + ' m) exceeds max length!';
  } else if (L_max === -2) {
    mlBox.textContent = 'Source R too high — trip not achievable even without cable';
    mlBox.className   = 'sc-maxlen-box sc-maxlen-warn';
  } else {
    mlBox.textContent = 'Cannot calculate — check inputs';
    mlBox.className   = 'sc-maxlen-box sc-maxlen-warn';
  }

  // ─── Step-by-step ───────────────────────────────────────────────────────
  const fmtO  = v => engRound(v, 3) + ' Ω';
  const fmtmO = v => engRound(v * 1000, 3) + ' mΩ';
  const srcStr = dcSrcType === 'known_ik'
    ? 'Known Ik = ' + document.getElementById('dc-ik-src').value + ' A'
    : 'Known R_source = ' + document.getElementById('dc-r-src').value + ' mΩ';
  const lines = [
    '=== Input parameters ===',
    'U_DC = ' + U_DC + ' V   Source type: ' + srcStr,
    'Material: ' + dcMaterial.toUpperCase() + '   Temp (min Ik): ' + dcCondTemp + ' °C   Temp (max Ik): 20 °C',
    'rho_ref (20C) = ' + engRound(rhoRef, 4) + ' Ohm*mm2/m',
    'rho_hot (' + dcCondTemp + 'C) = ' + engRound(rhoHot, 4) + ' Ohm*mm2/m',
    'S = ' + S + ' mm2   Spe = ' + Spe + ' mm2   L = ' + L + ' m',
    'l\' = ' + lpm + ' uH/m',
    '',
    '=== Source resistance ===',
    dcSrcType === 'known_ik'
      ? 'R_source = U_DC / Ik_source = ' + U_DC + ' / ' + document.getElementById('dc-ik-src').value + ' = ' + fmtmO(R_source)
      : 'R_source = ' + fmtmO(R_source) + '  (direct input)',
    '',
    '=== Cable resistances (DC — resistive only, no reactance) ===',
    'Rcable_max (20C) = rho_ref * L / S = ' + fmtmO(Rcable_max) + '  [for max Ik]',
    'Rcable_hot (' + dcCondTemp + 'C) = rho_hot * L / S = ' + fmtmO(Rcable_hot) + '  [for min Ik]',
    'Rpe_max (20C)  = ' + fmtmO(Rpe_max) + '   Rpe_hot = ' + fmtmO(Rpe_hot),
    '',
    '=== Loop resistances ===',
    'Rloop_max = R_source + Rcable_max + Rpe_max = ' + fmtmO(R_source) + ' + ' + fmtmO(Rcable_max) + ' + ' + fmtmO(Rpe_max) + ' = ' + fmtmO(Rloop_max),
    'Rloop_min = R_source + Rcable_hot + Rpe_hot = ' + fmtmO(R_source) + ' + ' + fmtmO(Rcable_hot) + ' + ' + fmtmO(Rpe_hot) + ' = ' + fmtmO(Rloop_min),
    '',
    '=== Fault currents (DC — no voltage factor c) ===',
    'Ik_max = U_DC / Rloop_max = ' + U_DC + ' / ' + fmtO(Rloop_max) + ' = ' + fmtA(Ik_max),
    'Ik_min = U_DC / Rloop_min = ' + U_DC + ' / ' + fmtO(Rloop_min) + ' = ' + fmtA(Ik_min),
    '',
    '=== Time constant (informational only) ===',
    'L_loop = 2 * l\' * L = 2 * ' + lpm + ' uH/m * ' + L + ' m = ' + engRound(L_loop_uH, 3) + ' uH',
    'tau = L_loop / Rloop_max = ' + engRound(L_loop_uH, 3) + ' uH / ' + fmtO(Rloop_max) + ' = ' + engRound(tau_ms, 3) + ' ms',
    '95% of Ik_max reached in ~3*tau = ' + engRound(tau3_ms, 3) + ' ms',
    '',
    '=== Trip verification ===',
    'Device: ' + devType.toUpperCase() + '   In = ' + In + ' A   Curve: ' + curveLabel,
    'May trip above (lower bound):      ' + tripLo.toFixed(0) + ' A',
    'Guaranteed trip (upper bound): ' + tripHi.toFixed(0) + ' A',
    'Ik_min = ' + fmtA(Ik_min) + '   =>   ' + ['NO TRIP', 'UNCERTAIN (transition band)', 'GUARANTEED TRIP'][tripState],
    '',
    '=== Breaking capacity ===',
    'Ik_max = ' + fmtA(Ik_max) + '   Icu_DC = ' + Icu_kA + ' kA   =>   ' + (exceedsIcu ? 'EXCEEDED!' : (approachingIcu ? 'WARNING: > 80% of Icu_DC' : 'OK')),
    '',
    '=== Maximum cable length (guaranteed trip, hot cable) ===',
    'Ztarget = U_DC / tripHi = ' + U_DC + ' / ' + tripHi.toFixed(0) + ' = ' + fmtO(Ztarget_dc),
    'Solve (linear): R_source + rho_hot*(1/S+1/Spe)*L = Ztarget',
    'B = rho_hot * (1/S + 1/Spe) = ' + engRound(rhoHot * (1 / S + 1 / Spe), 4) + ' Ohm/m',
    L_max > 0
      ? 'L_max = (Ztarget - R_source) / B = ' + engRound(L_max, 3) + ' m   [actual L = ' + L + ' m => ' + (L > L_max ? 'EXCEEDED' : 'OK') + ']'
      : 'No solution — R_source alone exceeds Ztarget (protection not achievable)',
  ].filter(s => s !== undefined);

  document.getElementById('dc-steps').textContent = lines.join('\n');
  document.getElementById('dc-res-card').style.display = 'block';
  document.getElementById('dc-res-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  window._dcLastResult = {
    smps: false, U_DC, R_source, S, Spe, L, lpm, In, Icu_kA, devType, curveLabel,
    rhoRef, rhoHot, dcCondTemp, dcMaterial,
    Rcable_max, Rcable_hot, Rpe_max, Rpe_hot,
    Rloop_max, Rloop_min, Ik_max, Ik_min,
    tau_ms, tau3_ms, L_loop_uH,
    tripState, tripLo, tripHi, exceedsIcu, approachingIcu, L_max,
    srcStr,
  };
}

function _dcSetTripBox(tripState, Ik_min, Ik_max, tripLo, tripHi) {
  const tripBox    = document.getElementById('dc-trip-box');
  const tripStatus = document.getElementById('dc-trip-status');
  const tripDetail = document.getElementById('dc-trip-detail');
  const fmtA = v => v >= 1000 ? engRound(v / 1000, 3) + ' kA' : engRound(v, 3) + ' A';
  if (tripState === 2) {
    tripBox.className = 'sc-trip-box sc-trip-ok';
    tripStatus.textContent = '✅ Guaranteed trip (Ik_min ≥ ' + tripHi.toFixed(0) + ' A)';
  } else if (tripState === 1) {
    tripBox.className = 'sc-trip-box sc-trip-partial';
    tripStatus.textContent = '⚠ Uncertain — Ik_min in transition band';
  } else {
    tripBox.className = 'sc-trip-box sc-trip-fail';
    tripStatus.textContent = '❌ No guaranteed trip — Ik_min < ' + tripLo.toFixed(0) + ' A';
  }
  tripDetail.textContent = 'Ik_min = ' + fmtA(Ik_min) +
    '   |   tripLo = ' + tripLo.toFixed(0) + ' A   tripHi = ' + tripHi.toFixed(0) + ' A';
}

/* ===================================================================
   DC PDF EXPORT
   =================================================================== */
async function dcDownloadPdf() {
  const btn = document.getElementById('dc-pdf-btn');
  btn.textContent = 'Generating…';
  btn.disabled = true;

  try {
    if (!window.jspdf && !window.jsPDF) { showToast('jsPDF not loaded'); return; }
    const { jsPDF } = window.jspdf || window;
    const r = window._dcLastResult;
    if (!r) { showToast('No results — calculate first'); return; }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const PW = 210, PH = 297, M = 15;
    const CW = PW - M * 2;
    const ACC = [26, 82, 118];

    const today = new Date();
    const ds = [today.getDate(), today.getMonth() + 1, today.getFullYear()]
      .map((v, i) => i < 2 ? String(v).padStart(2, '0') : v).join('.');
    const engineer = document.getElementById('sb-engineer')?.value.trim() || '';

    function drawHeader(pageNum, totalPages) {
      if (sbLogoB64) {
        try {
          const logoH = 10;
          const logoW = sbLogoNW && sbLogoNH ? (sbLogoNW / sbLogoNH) * logoH : 25;
          doc.addImage(sbLogoB64, 'PNG', M, M, logoW, logoH);
        } catch (e) {}
      }
      const co = sbCompany || {};
      const addrLines = [co.name, co.street, [co.zip, co.city].filter(Boolean).join(' '), co.country].filter(Boolean);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
      addrLines.forEach((line, i) => doc.text(line, PW - M, M + i * 3.8, { align: 'right' }));
      const rY = M + 14;
      doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3); doc.line(M, rY, PW - M, rY);
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
      doc.text('DC Short-Circuit Calculation', M, rY - 2);
      doc.setDrawColor(180, 180, 180); doc.line(M, PH - M - 6, PW - M, PH - M - 6);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120);
      doc.text(ds + (engineer ? '  |  ' + engineer : ''), M, PH - M - 2);
      doc.text('Page ' + pageNum + ' of ' + totalPages, PW / 2, PH - M - 2, { align: 'center' });
      doc.text('IEC 61660 / Resistive method', PW - M, PH - M - 2, { align: 'right' });
    }

    function secTitle(y, title) {
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...ACC);
      doc.text(title, M, y);
      return y + 6;
    }

    function inputTable(y, rows) {
      const RH = 6.5;
      rows.forEach(([label, value], i) => {
        if (i % 2 === 0) { doc.setFillColor(245, 247, 250); doc.rect(M, y, CW, RH, 'F'); }
        doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.1); doc.rect(M, y, CW, RH);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
        doc.text(pdfSafe(label), M + 3, y + 4.5);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
        doc.text(pdfSafe(String(value)), M + CW - 3, y + 4.5, { align: 'right' });
        y += RH;
      });
      return y;
    }

    const fmtA = v => v >= 1000 ? engRound(v / 1000, 3) + ' kA' : engRound(v, 3) + ' A';
    const fmtmO = v => engRound(v * 1000, 3) + ' mOhm';

    // ── Input rows ──
    const inputRows = [
      ['Supply voltage U_DC', r.U_DC + ' V'],
      ['Source type', r.srcStr || (r.smps ? 'SMPS' : '—')],
      ['Conductor material', r.dcMaterial === 'cu' ? 'Copper (Cu)' : 'Aluminium (Al)'],
      ['Temp (max Ik / min Ik)', '20°C / ' + r.dcCondTemp + '°C'],
      ['Phase conductor S', r.S + ' mm2'],
      ['Return/PE conductor Spe', r.Spe + ' mm2'],
      ['Cable length L', r.L + ' m'],
      ['Cable inductance l\'', r.lpm + ' uH/m'],
      ['Protective device', r.devType.toUpperCase()],
      ['Rated current In', r.In + ' A'],
      ['Trip characteristic', pdfSafe(r.curveLabel)],
      ['DC breaking capacity Icu', r.Icu_kA + ' kA'],
    ];

    const TOTAL_PAGES = 2;
    drawHeader(1, TOTAL_PAGES);
    let y = M + 22;

    y = secTitle(y, 'Input Parameters');
    y = inputTable(y, inputRows);
    y += 6;

    // ── Results summary ──
    y = secTitle(y, 'Results');

    if (r.smps) {
      doc.setFillColor(255, 245, 220); doc.setDrawColor(200, 130, 0); doc.setLineWidth(0.5);
      doc.rect(M, y, CW, 12, 'FD');
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(160, 100, 0);
      doc.text('SMPS Mode: Current limited. Resistive Ik not calculated.', PW/2, y+7.5, {align:'center'});
      y += 14;
    } else {
      // Resistance bar
      const impH = 14, colW4 = CW / 4;
      const impItems = [
        ['R_source', fmtmO(r.R_source)],
        ['Rcable (hot)', fmtmO(r.Rcable_hot)],
        ['Rpe (hot)', fmtmO(r.Rpe_hot)],
        ['Rloop (min)', fmtmO(r.Rloop_min)],
      ];
      doc.setFillColor(240, 245, 250); doc.setDrawColor(200, 210, 225); doc.setLineWidth(0.2);
      doc.rect(M, y, CW, impH, 'FD');
      impItems.forEach(([lbl, val], i) => {
        const cx = M + i * colW4;
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
        doc.text(lbl, cx + colW4 / 2, y + 4.5, { align: 'center' });
        doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...ACC);
        doc.text(pdfSafe(val), cx + colW4 / 2, y + 11, { align: 'center' });
        if (i < 3) { doc.setDrawColor(200,210,225); doc.line(cx+colW4, y, cx+colW4, y+impH); }
      });
      y += impH + 4;

      // Ik + tau cards (4 cols)
      const cardW = CW / 2, cardH = 24;
      [
        { lbl: 'Ik_max (cold, 20°C)', val: fmtA(r.Ik_max), hl: false },
        { lbl: 'Ik_min (hot, ' + r.dcCondTemp + '°C)', val: fmtA(r.Ik_min), hl: true },
      ].forEach((f, i) => {
        const cx = M + i * cardW;
        if (f.hl) { doc.setFillColor(235, 244, 252); doc.setDrawColor(...ACC); doc.setLineWidth(0.5); }
        else       { doc.setFillColor(245, 247, 250); doc.setDrawColor(200, 210, 225); doc.setLineWidth(0.2); }
        doc.rect(cx, y, cardW, cardH, 'FD');
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
        doc.text(f.lbl, cx + cardW/2, y + 5.5, { align: 'center' });
        doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...ACC);
        doc.text(pdfSafe(f.val), cx + cardW/2, y + 16, { align: 'center' });
      });
      y += cardH + 2;

      // tau row
      const tauCardW = CW / 2;
      [
        ['Time constant τ', engRound(r.tau_ms, 3) + ' ms'],
        ['95% Ik in ~3τ', engRound(r.tau3_ms, 3) + ' ms'],
      ].forEach(([lbl, val], i) => {
        const cx = M + i * tauCardW;
        doc.setFillColor(245, 247, 250); doc.setDrawColor(200, 210, 225); doc.setLineWidth(0.2);
        doc.rect(cx, y, tauCardW, 10, 'FD');
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
        doc.text(lbl, cx + 4, y + 6.5);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(...ACC);
        doc.text(pdfSafe(val), cx + tauCardW - 4, y + 6.5, { align: 'right' });
      });
      y += 12;
    }

    // Trip box
    let tcol, tbg, tLabel;
    if (r.tripState === 2) {
      tcol = [0,160,80]; tbg = [232,252,240]; tLabel = 'GUARANTEED TRIP';
    } else if (r.tripState === 1) {
      tcol = [255,165,0]; tbg = [255,245,220]; tLabel = 'UNCERTAIN — TRANSITION BAND';
    } else {
      tcol = [200,40,40]; tbg = [252,232,232]; tLabel = 'DEVICE WILL NOT TRIP';
    }
    doc.setFillColor(...tbg); doc.setDrawColor(...tcol); doc.setLineWidth(0.5);
    doc.rect(M, y, CW, 16, 'FD');
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...tcol);
    doc.text(tLabel, PW/2, y + 6.5, { align: 'center' });
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(pdfSafe('tripLo=' + r.tripLo.toFixed(0) + ' A   tripHi=' + r.tripHi.toFixed(0) + ' A'), PW/2, y+12.5, {align:'center'});
    y += 16 + 3;

    if (r.smps) {
      doc.setFillColor(255,245,220); doc.setDrawColor(200,130,0); doc.setLineWidth(0.4);
      doc.rect(M, y, CW, 12, 'FD');
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(160,100,0);
      doc.text(pdfSafe('WARNING: SMPS magnetic trip not reliable — verify short-circuit characteristic'), PW/2, y+7.5, {align:'center',maxWidth:CW-6});
      y += 14;
    }

    if (!r.smps) {
      // Icu
      if (r.exceedsIcu) {
        doc.setFillColor(252,232,232); doc.setDrawColor(200,40,40); doc.setLineWidth(0.5);
        doc.rect(M, y, CW, 10, 'FD');
        doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(200,40,40);
        doc.text(pdfSafe('WARNING: Ik_max = ' + fmtA(r.Ik_max) + ' > Icu_DC = ' + r.Icu_kA + ' kA — DC BREAKING CAPACITY EXCEEDED'), PW/2, y+6.5, {align:'center',maxWidth:CW-6});
        y += 12;
      }
      // L_max
      const mlOk = r.L_max > 0 && r.L <= r.L_max;
      doc.setFillColor(245,247,250); doc.setDrawColor(200,210,225); doc.setLineWidth(0.2);
      doc.rect(M, y, CW, 10, 'FD');
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80,80,80);
      doc.text('Max. cable length (guaranteed trip):', M+3, y+6.5);
      doc.setFont('helvetica','bold'); doc.setTextColor(mlOk?0:180, mlOk?160:100, mlOk?80:0);
      doc.text(r.L_max > 0 ? engRound(r.L_max, 3) + ' m' : 'N/A', M+CW-3, y+6.5, {align:'right'});
      y += 10;
    }

    // ── PAGE 2: Step-by-step ──
    doc.addPage();
    drawHeader(2, TOTAL_PAGES);
    y = M + 22;
    y = secTitle(y, 'Step-by-Step Calculations  (IEC 61660 / Resistive method)');

    const allLines = document.getElementById('dc-steps').textContent.split('\n');
    allLines.forEach(line => {
      if (!line.trim()) { y += 2; return; }
      if (line.startsWith('===')) {
        if (y > PH - M - 22) { doc.addPage(); drawHeader(2, TOTAL_PAGES); y = M + 22; }
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...ACC);
        doc.text(pdfSafe(line), M, y); y += 5;
        doc.setDrawColor(200, 210, 225); doc.setLineWidth(0.2);
        doc.line(M, y, PW - M, y); y += 3;
        return;
      }
      if (y > PH - M - 8) { doc.addPage(); drawHeader(2, TOTAL_PAGES); y = M + 22; }
      const indented = line.startsWith('  ');
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40);
      doc.text(pdfSafe(line.trimStart()), M + (indented ? 6 : 0), y);
      y += 4.5;
    });

    doc.save('dc-short-circuit.pdf');
    showToast('PDF downloaded ✓');
  } catch (e) {
    console.error(e);
    showToast('PDF error: ' + e.message);
  } finally {
    btn.textContent = T[lang].dcPdfBtn || '⬇ Download PDF';
    btn.disabled = false;
  }
}
