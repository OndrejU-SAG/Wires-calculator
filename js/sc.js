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
// K curve: EN 60898-1 Annex H defines 8–12 × In. Older DIN VDE 0641 used 8–14 × In.
const SC_CURVES = {
  B: { min: 3,  max: 5,  label: 'B (3–5 × In)'   },
  C: { min: 5,  max: 10, label: 'C (5–10 × In)'  },
  D: { min: 10, max: 20, label: 'D (10–20 × In)' },
  K: { min: 8,  max: 12, label: 'K (8–12 × In)'  },
  Z: { min: 2,  max: 3,  label: 'Z (2–3 × In)'   },
};

const SC_FUSE_FACTOR = 1.6; // I₂ conventional fusing current (IEC 60269-2) — overload info only

// IEC 60364-4-43 Table 43A — k factor for cable thermal withstand I²t ≤ (k·S)²
// IEC 60364-4-43 Table 43A — k factor for cable thermal withstand I²t ≤ (k·S)²
// key: insulation type → {cu, al} k values
const SC_THW_K = {
  pvc:     { cu: 115, al: 76  },  // PVC 70°C  (70→160°C)
  xlpe:    { cu: 143, al: 94  },  // XLPE/EPR 90°C  (90→250°C)
  rubber:  { cu: 141, al: 93  },  // Rubber 60°C  (60→200°C)
  lszh:    { cu: 100, al: 66  },  // LSZH/HFFR 90°C  (90→160°C)
  si:      { cu: 132, al: 87  },  // Silicone rubber 180°C  (180→350°C)
  mineral: { cu: 115, al: 115 },  // Mineral (PVC-sheathed or bare, exposed to touch)
  mineralb:{ cu: 135, al: 135 },  // Mineral (bare, not normally exposed to touch)
  // 'custom' is handled separately via sc-insul-k input
};

// gG fuse disconnection-current multipliers k_a = I_a / In (IEC 60269-2 Annex B / IEC 60364-4-43 Table A)
const SC_FUSE_KA = {
  '5':   { lo: 4.5,  hi: 6.0  }, // ≤5 s — distribution circuits, IEC 60364-4-41 §411.3.2
  '0.4': { lo: 9.0,  hi: 12.0 }, // ≤0.4 s — final circuits ≤32 A
  '0.1': { lo: 13.0, hi: 18.0 }, // very fast SLD/socket / sensitive loads
};

// I_a/In multipliers for gG fuses at each max disconnection time (IEC 60364-4-41 / IEC 60269-2)
const SC_DTV_FUSE_IA = {
  '5':   6.0,
  '1':   8.0,
  '0.4': 12.0,
  '0.2': 15.0,
  '0.1': 18.0,
};

function getFuseKa(discTime) {
  return SC_FUSE_KA[discTime] || SC_FUSE_KA['5'];
}

let scSourceMode  = 'known'; // 'known' | 'transformer'
let scMaterial    = 'cu';
let scNetworkType = 'tns';   // 'tns' | 'tnc' | 'tt'
let _scDtvState   = null;    // { Z1_min, U0, In, isFuse, discTime, curveSel }
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
  // Ik_tr (rated) = Sn·1000 / (√3 · UnSec · Uk/100)  →  kA
  // Note: this returns the RATED (uncorrected) Ik. K_T correction (IEC 60909-0 §6.3.3)
  // is applied separately to source impedance for max-Ik calculation only — see scCalculate().
  return (Sn * 1000) / (Math.sqrt(3) * UnSec * (Uk / 100)) / 1000;
}

// IEC 60909-0 §6.3.3 — impedance correction factor for two-winding network transformers
// K_T = 0.95 × c_max / (1 + 0.6 × x_T)
// x_T = transformer per-unit reactance ≈ (u_kr / 100) × X / √(X² + R²) (uses source X/R as proxy)
// Applied to Z_T for max-Ik calc only. Returns 1.0 when not applicable (known mode or unchecked).
function scGetKT() {
  if (scSourceMode !== 'transformer') return 1.0;
  if (!document.getElementById('sc-tr-kt-apply')?.checked) return 1.0;
  const Uk = parseFloat(document.getElementById('sc-tr-uk')?.value) || 0;
  if (Uk <= 0) return 1.0;
  const xR = scSourceXR;
  // x_T per IEC 60909-0; with X/R≈ ∞ → x_T = u_kr/100 (pure reactance, conservative).
  const xT = (Uk / 100) * (xR > 0 ? xR / Math.sqrt(1 + xR * xR) : 1);
  return 0.95 * C_MAX / (1 + 0.6 * xT);
}

// ─── live-update displays ────────────────────────────────────────────────────

function scUpdateFromTransformer() {
  const ik = scGetIkBusbarKA();
  const val = document.getElementById('sc-tr-ik-val');
  if (val) val.textContent = ik > 0 ? ik.toFixed(2) + ' kA' : '—';
  const ktVal = document.getElementById('sc-tr-kt-val');
  if (ktVal) {
    const KT = scGetKT();
    const applyKt = document.getElementById('sc-tr-kt-apply')?.checked;
    if (!applyKt) {
      ktVal.textContent = '— (not applied)';
    } else if (KT > 0) {
      const arrow = KT < 1 ? ' ↑Ik_max' : (KT > 1 ? ' ↓Ik_max' : '');
      ktVal.textContent = KT.toFixed(4) + arrow;
    } else {
      ktVal.textContent = '—';
    }
  }
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
  if (!val) return;
  if (Zs_mag <= 0) { val.textContent = '—'; return; }
  let txt = fmtmOhm(Zs_mag) + '  (Rs=' + fmtmOhm(Rs) + ', Xs=' + fmtmOhm(Xs) + ')';
  const KT = scGetKT();
  if (KT !== 1.0) txt += '   |  Z_TK (max calc) = ' + fmtmOhm(Zs_mag * KT);
  val.textContent = txt;
}

function scUpdateTripHint() {
  const type  = document.getElementById('sc-dev-type')?.value;
  const In    = parseFloat(document.getElementById('sc-dev-in')?.value) || 0;
  const hint  = document.getElementById('sc-trip-hint');
  if (!hint) return;
  if (type === 'fuse') {
    const t  = document.getElementById('sc-disc-time')?.value || '5';
    const ka = getFuseKa(t);
    hint.textContent =
      'I_a: ' + (ka.lo * In).toFixed(0) + '…' + (ka.hi * In).toFixed(0) +
      ' A  |  I₂ (overload) = 1.6 × In = ' + (SC_FUSE_FACTOR * In).toFixed(0) + ' A (IEC 60269-2)';
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
  scUpdateIt2Hint();
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
  const curveInner = document.getElementById('sc-curve-inner');
  const discInner  = document.getElementById('sc-disc-time-inner');
  if (curveInner) curveInner.style.display = type === 'fuse' ? 'none' : '';
  if (discInner)  discInner.style.display  = type === 'fuse' ? '' : 'none';
  scUpdateTripHint();
  scUpdateIt2Hint();
}

// I²t hint changes between MCB (deterministic from clearing time) and fuse (datasheet only).
// gG fuse pre-arcing/total I²t varies widely between vendors (e.g. NH00 vs cylindrical, ~5×
// difference) — there is no derivation from In or curve, only the datasheet value applies.
function scUpdateIt2Hint() {
  const hint = document.getElementById('sc-it2-hint');
  if (!hint) return;
  const type = document.getElementById('sc-dev-type')?.value;
  const isFuse = type === 'fuse';
  hint.textContent = isFuse
    ? (T[lang]?.scIt2HintFuse ||
       '⚠ Pojistky: I²t MUSÍ být odečteno z datasheetu výrobce (total clearing I²t pro očekávané Ik). Hodnota se výrazně liší mezi typy/výrobci, nelze odvodit z In nebo z doby odpojení.')
    : (T[lang]?.scIt2Hint ||
       'Katalogová hodnota výrobce; výchozí 30 000 A²·s ≈ 16 A C/6 kA (let-through pro current-limiting MCB).');
  hint.style.color = isFuse ? 'var(--err, #c33)' : '';
  hint.style.fontWeight = isFuse ? '500' : '';
}

function scSetSourceXR() {
  const v = parseFloat(document.getElementById('sc-xr')?.value);
  if (!isNaN(v) && v >= 0) {
    scSourceXR = v;
    if (scSourceMode === 'transformer') scUpdateFromTransformer();
    else scUpdateZsDisplay();
  }
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
  scUpdateIt2Hint();
}

// ─── import from tab 0 ───────────────────────────────────────────────────────

function scOnInsulChange() {
  const v = document.getElementById('sc-insul')?.value;
  const row = document.getElementById('sc-insul-custom-row');
  if (row) row.style.display = v === 'custom' ? '' : 'none';
}

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

// ─── selectivity analysis ─────────────────────────────────────────────────────

function scOnSelCheckChange() {
  const checked = document.getElementById('sc-sel-check').checked;
  document.getElementById('sc-sel-upstream-panel').style.display = checked ? 'block' : 'none';
  if (!checked) {
    const p = document.getElementById('sc-sel-panel');
    if (p) p.style.display = 'none';
  }
}

function scOnUpTypeChange() {
  const t = document.getElementById('sc-up-type').value;
  document.getElementById('sc-sel-mcb-row').style.display    = t === 'mcb'  ? '' : 'none';
  document.getElementById('sc-sel-mccb-rows').style.display  = t === 'mccb' ? '' : 'none';
  document.getElementById('sc-sel-fuse-hint').style.display  = t === 'fuse' ? '' : 'none';
}

function drawSelectivityAscii(ds, usTripModes, Ik_min_A, Ik_max_A, dsTripLo, dsTripHi, state, I_sel, subState, verdictSource, IsMfr_kA) {
  const W = 56; // bar width (characters)

  // Collect all finite values to set a meaningful log-scale axis range
  const usLos = usTripModes.map(m => m.lo).filter(v => v > 0);
  const usMaxF = usTripModes.reduce((m, u) => Math.max(m, isFinite(u.hi) ? u.hi : 0), 0);
  const allVals = [dsTripLo, dsTripHi, Ik_min_A, Ik_max_A, ...usLos, usMaxF].filter(v => v > 0);
  const dataMin = allVals.length ? Math.min(...allVals) : 10;
  const dataMax = allVals.length ? Math.max(...allVals) : 10000;

  const logMin = Math.log10(Math.max(dataMin * 0.3, 1));
  const logMax = Math.log10(dataMax * 1.4);

  const pos = a => {
    if (!isFinite(a) || a <= 0) return W - 1;
    const lv = (Math.log10(Math.max(a, Math.pow(10, logMin))) - logMin) / (logMax - logMin);
    return Math.min(W - 1, Math.max(0, Math.round(lv * (W - 1))));
  };

  const fmtA = v => v >= 1000 ? (v / 1000).toFixed(1) + ' kA' : Math.round(v) + ' A';

  // Determine tick marks at standard decades/half-decades within the axis range
  const TICKS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  const minVal = Math.pow(10, logMin);
  const maxVal = Math.pow(10, logMax);
  const ticksInRange = TICKS.filter(t => t >= minVal * 0.9 && t <= maxVal * 1.1 && pos(t) < W);

  // Build axis line: dashes with '|' at tick positions
  const axisArr = Array(W).fill('-');
  ticksInRange.forEach(t => { const p = pos(t); if (p >= 0 && p < W) axisArr[p] = '|'; });
  const axisStr = axisArr.join('');

  // Build tick label row (9-char prefix + 1 border = column 10 is bar[0])
  const PRE = 9;
  const lblLine = Array(PRE + 1 + W + 10).fill(' ');
  let lastLblEnd = 0;
  ticksInRange.forEach(t => {
    const p = pos(t);
    const lbl = fmtA(t);
    const center = PRE + 1 + p;
    const start = center - Math.floor(lbl.length / 2);
    if (start >= lastLblEnd) {
      for (let c = 0; c < lbl.length; c++) {
        const idx = start + c;
        if (idx >= 0 && idx < lblLine.length) lblLine[idx] = lbl[c];
      }
      lastLblEnd = start + lbl.length + 1;
    }
  });

  // Solid bar (no Ik markers — they have their own dedicated row)
  const makeBar = (lo, hi, ch) => {
    let s = '';
    for (let i = 0; i < W; i++) s += (i >= lo && i <= hi) ? ch : ' ';
    return s;
  };

  // Ik range bar: [ at min, = inside, ] at max (readable bracket notation)
  const makeIkBar = (lo, hi) => {
    if (lo === hi) return makeBar(lo, hi, '|');
    let s = '';
    for (let i = 0; i < W; i++) {
      if (i === lo)                 s += '[';
      else if (i === hi)            s += ']';
      else if (i > lo && i < hi)   s += '=';
      else                          s += ' ';
    }
    return s;
  };

  const pDsLo  = pos(dsTripLo);
  const pDsHi  = pos(dsTripHi);
  const pIkMin = pos(Ik_min_A);
  const pIkMax = pos(Ik_max_A);

  const lines = [];

  // Tick label row + top border
  lines.push(lblLine.join('').trimEnd());
  lines.push('         +' + axisStr + '+');

  // Downstream trip band (solid fill, no Ik markers)
  const dsBar = makeBar(pDsLo, pDsHi, '▓');
  lines.push('DS  down |' + dsBar + '|  DS: ' + ds.devType.toUpperCase() + ' ' + ds.In + 'A (' + ds.curveLabel + ')');

  // Upstream trip bands (one row per release mode)
  usTripModes.forEach((m, idx) => {
    const uLo = pos(m.lo);
    const uHi = isFinite(m.hi) ? pos(m.hi) : W - 1;
    const uBar = makeBar(uLo, uHi, '░');
    const pfx  = idx === 0 ? 'US    up |' : '         |';
    const rng  = isFinite(m.hi) ? fmtA(m.lo) + ' … ' + fmtA(m.hi) : fmtA(m.lo) + ' → ∞';
    lines.push(pfx + uBar + '|  ' + m.name + ': ' + rng);
  });

  // Ik1 fault-current range (bracket bar)
  const fBar = makeIkBar(pIkMin, pIkMax);
  lines.push('Ik1      |' + fBar + '|  ' + fmtA(Ik_min_A) + ' … ' + fmtA(Ik_max_A));

  // Bottom border + legend
  lines.push('         +' + axisStr + '+');
  lines.push('▓ = DS trip   ░ = US trip   [=] = Ik1 fault range');
  lines.push('');

  let statusLine;
  if (verdictSource === 'mfrTable') {
    if (state === 2)      statusLine = (T[lang].selFullMfr || '✅ Full Selectivity — per manufacturer table (Is = ') + IsMfr_kA.toFixed(2) + ' kA)';
    else if (state === 1) statusLine = (T[lang].selPartialMfrPfx || '⚠ Partial — per manufacturer table, up to Is = ') + IsMfr_kA.toFixed(2) + ' kA';
    else                  statusLine = T[lang].selNoneMfrExceeded || '❌ No Selectivity — Ik exceeds manufacturer Is';
  } else if (state === 2) {
    statusLine = T[lang].selFull || '✅ Full Selectivity';
  } else if (state === 1) {
    statusLine = (T[lang].selPartialPfx || '⚠ Partial — selective up to ') + (I_sel / 1000).toFixed(2) + ' kA';
  } else if (subState === 'race') {
    statusLine = T[lang].selNoneRace || '❌ No Selectivity — Magnetic Race';
  } else if (subState === 'uncertain') {
    statusLine = T[lang].selNoneUncertain || '❌ No Selectivity — entire Ik range within upstream trip band';
  } else if (subState === 'dsNoTrip') {
    statusLine = T[lang].selNoneDsNoTrip || '❌ Downstream device does not guarantee trip';
  } else {
    statusLine = T[lang].selNone || '❌ No Selectivity';
  }
  lines.push(statusLine);

  return lines.join('\n');
}

function scAnalyzeSelectivity() {
  const r = window._scLastResult;
  const selPanel = document.getElementById('sc-sel-panel');

  if (!r) {
    if (selPanel) selPanel.style.display = 'none';
    return;
  }

  // Downstream device from last result
  const ds = {
    devType:    r.devType,
    In:         r.In,
    curveLabel: r.curveLabel,
    tripLo:     r.tripLo,
    tripHi:     r.tripHi,
    Ik1_min_A:  r.Ik1_min * 1000,
    Ik1_max_A:  r.Ik1_max * 1000,
  };
  const dsTripLo = ds.tripLo;
  const dsTripHi = ds.tripHi;

  // Upstream device from UI
  const usType = document.getElementById('sc-up-type')?.value || 'mcb';
  const usIn   = parseFloat(document.getElementById('sc-up-in')?.value);

  if (isNaN(usIn) || usIn <= 0) {
    showToast(T[lang].selErrFill || 'Fill in all upstream device fields.');
    if (selPanel) selPanel.style.display = 'none';
    return;
  }

  let usTripLo = 0, usTripHi = 0, usTripModes = [], usLabel = '';

  // For each US release mode we tag `timeGraded`:
  //   true  → mode trips with intentional time delay (L long-delay, S short-delay) →
  //           always selective vs. short-circuit because DS clears in ms before tsd elapses
  //   false → mode trips instantaneously (MCB magnetic, fuse melt, MCCB I) → race-prone
  // Only non-time-graded modes participate in zone classification below.
  if (usType === 'mcb') {
    const curve = document.getElementById('sc-up-curve')?.value || 'C';
    usTripLo = usIn * SC_CURVES[curve].min;
    usTripHi = usIn * SC_CURVES[curve].max;
    usTripModes.push({ name: 'Magnetic ' + curve + ' ' + usIn + 'A', lo: usTripLo, hi: usTripHi, timeGraded: false });
    usLabel = 'MCB ' + SC_CURVES[curve].label + ' ' + usIn + 'A';
  } else if (usType === 'fuse') {
    const upDt = document.getElementById('sc-up-disc-time')?.value || '5';
    const upKa = getFuseKa(upDt);
    usTripLo = usIn * upKa.lo;
    usTripHi = usIn * upKa.hi;
    usTripModes.push({ name: 'gG ' + usIn + 'A (≤' + upDt + 's)', lo: usTripLo, hi: usTripHi, timeGraded: false });
    usLabel = 'Fuse gG ' + usIn + 'A (≤' + upDt + 's, IEC 60269-2 Annex B)';
  } else if (usType === 'mccb') {
    const Ir  = parseFloat(document.getElementById('sc-up-ir')?.value);
    const Isd = parseFloat(document.getElementById('sc-up-isd')?.value);
    const Ii  = parseFloat(document.getElementById('sc-up-ii')?.value);
    if ([Ir, Isd, Ii].some(v => isNaN(v) || v <= 0)) {
      showToast(T[lang].selErrFill || 'Fill in all upstream MCCB fields.');
      if (selPanel) selPanel.style.display = 'none';
      return;
    }
    usTripModes.push({ name: 'L long-delay ' + usIn + 'A', lo: Ir * 1.05, hi: Ir * 1.30, timeGraded: true });
    if (Isd < Ii) usTripModes.push({ name: 'S short-delay', lo: Isd, hi: Ii, timeGraded: true });
    usTripModes.push({ name: 'I instantaneous', lo: Ii, hi: Infinity, timeGraded: false });
    usTripLo = Ir * 1.05;
    usTripHi = Ii;
    usLabel = 'MCCB ' + usIn + 'A (LSI)';
  }

  // Manufacturer Is override (kA) — when supplied, replaces band-based analysis
  const isMfrRaw = parseFloat(document.getElementById('sc-up-is-mfr')?.value);
  const IsMfr_kA = (isFinite(isMfrRaw) && isMfrRaw > 0) ? isMfrRaw : null;

  // ── Selectivity classification ───────────────────────────────────────────
  // verdictSource: 'mfrTable' (user supplied Is) | 'bandBased' (zone analysis A/B/C/D)
  // subState:      'race' | 'uncertain' | 'dsNoTrip' | 'mfrTableExceeded' | null
  const ikMin = ds.Ik1_min_A, ikMax = ds.Ik1_max_A;
  const dsTrips = ikMin >= dsTripHi;

  let state = 0, I_sel = 0, subState = null;
  let verdictSource = 'bandBased';
  let bindingMode = null;
  let zoneLabel = 'A';

  if (!dsTrips) {
    state = 0; subState = 'dsNoTrip';
  } else if (IsMfr_kA !== null) {
    verdictSource = 'mfrTable';
    const IsMfr_A = IsMfr_kA * 1000;
    if (ikMax <= IsMfr_A) {
      state = 2; I_sel = ikMax;
    } else if (ikMin <= IsMfr_A) {
      state = 1; I_sel = IsMfr_A;
    } else {
      state = 0; subState = 'mfrTableExceeded';
    }
  } else {
    // Four-zone band-based analysis (worst zone across non-time-graded US modes)
    const zonePri = { A: 0, B: 1, C: 2, D: 3 };
    let worstZone = 'A', worstMode = null, partialIsel = Infinity;
    const bindingModes = usTripModes.filter(m => !m.timeGraded);
    for (const m of bindingModes) {
      const hi = isFinite(m.hi) ? m.hi : Infinity;
      let zone;
      if (ikMax < m.lo)        zone = 'A';                          // US never even may-trip
      else if (ikMin >= hi)    zone = 'D';                          // US guaranteed instantaneous → race
      else if (ikMin < m.lo)   zone = 'B';                          // partial overlap from below
      else                     zone = 'C';                          // entire Ik in may-trip band
      if (zonePri[zone] > zonePri[worstZone]) { worstZone = zone; worstMode = m; }
      if (zone === 'B' && m.lo < partialIsel) partialIsel = m.lo;
    }
    bindingMode = worstMode ? worstMode.name : (bindingModes[0]?.name || null);
    zoneLabel = worstZone;
    if      (worstZone === 'A') { state = 2; I_sel = ikMax; }
    else if (worstZone === 'B') { state = 1; I_sel = isFinite(partialIsel) ? partialIsel : worstMode.lo; }
    else if (worstZone === 'C') { state = 0; subState = 'uncertain'; }
    else                        { state = 0; subState = 'race'; }
  }

  // ASCII graph
  const asciiEl = document.getElementById('sc-sel-ascii');
  if (asciiEl) {
    asciiEl.textContent = drawSelectivityAscii(
      ds, usTripModes, ds.Ik1_min_A, ds.Ik1_max_A, dsTripLo, dsTripHi, state, I_sel,
      subState, verdictSource, IsMfr_kA
    );
  }

  // Status box
  const statusBox  = document.getElementById('sc-sel-status-box');
  const statusText = document.getElementById('sc-sel-status-text');
  if (statusBox && statusText) {
    let cls, label;
    if (verdictSource === 'mfrTable') {
      if (state === 2) {
        cls = 'sc-trip-box sc-trip-ok';
        label = (T[lang].selFullMfr || '✅ Full Selectivity — per manufacturer table (Is = ') + IsMfr_kA.toFixed(2) + ' kA)';
      } else if (state === 1) {
        cls = 'sc-trip-box sc-trip-partial';
        label = (T[lang].selPartialMfrPfx || '⚠ Partial — per manufacturer table, up to Is = ') + IsMfr_kA.toFixed(2) + ' kA';
      } else {
        cls = 'sc-trip-box sc-trip-fail';
        label = T[lang].selNoneMfrExceeded || '❌ No Selectivity — Ik exceeds manufacturer Is';
      }
    } else if (state === 2) {
      cls = 'sc-trip-box sc-trip-ok';
      label = T[lang].selFull || '✅ Full Selectivity';
    } else if (state === 1) {
      cls = 'sc-trip-box sc-trip-partial';
      label = (T[lang].selPartialPfx || '⚠ Partial — selective up to ') + (I_sel / 1000).toFixed(2) + ' kA';
    } else if (subState === 'race') {
      cls = 'sc-trip-box sc-trip-fail';
      label = T[lang].selNoneRace || '❌ No Selectivity — Magnetic Race';
    } else if (subState === 'uncertain') {
      cls = 'sc-trip-box sc-trip-fail';
      label = T[lang].selNoneUncertain || '❌ No Selectivity — entire Ik range within upstream trip band';
    } else if (subState === 'dsNoTrip') {
      cls = 'sc-trip-box sc-trip-fail';
      label = T[lang].selNoneDsNoTrip || '❌ Downstream device does not guarantee trip — fix cable protection first';
    } else {
      cls = 'sc-trip-box sc-trip-fail';
      label = T[lang].selNone || '❌ No Selectivity';
    }
    statusBox.className = cls;
    statusText.textContent = label;
  }

  // Disclaimer (always shown — text varies by verdictSource)
  const disclEl = document.getElementById('sc-sel-disclaimer');
  if (disclEl) {
    disclEl.textContent = verdictSource === 'mfrTable'
      ? (T[lang].selDisclaimerMfr || 'Verdict based on user-supplied Is from manufacturer coordination table.')
      : (T[lang].selDisclaimer    || 'Band-based analysis. Manufacturer coordination tables required for energy/current-limiting selectivity in the magnetic region.');
  }

  // Comparison table
  const tbody = document.getElementById('sc-sel-table-body');
  if (tbody) {
    const fmtA = v => v >= 1000 ? (v / 1000).toFixed(2) + ' kA' : Math.round(v) + ' A';
    const fmtRange = (lo, hi) => fmtA(lo) + (lo === hi ? '' : ' … ' + (isFinite(hi) ? fmtA(hi) : '∞'));
    const usModes = usTripModes.map(m =>
      m.name + (m.timeGraded ? ' [time-graded]' : '') + ': ' + fmtRange(m.lo, m.hi)
    ).join('\n');
    const usCol3 = verdictSource === 'mfrTable'
      ? 'Is = ' + IsMfr_kA.toFixed(2) + ' kA'
      : (bindingMode ? 'Zone ' + zoneLabel + ' (' + bindingMode + ')' : '—');
    tbody.innerHTML =
      '<tr>' +
        '<td>DS — ' + ds.devType.toUpperCase() + ' ' + ds.In + 'A<br><small>' + ds.curveLabel + '</small></td>' +
        '<td>' + fmtA(dsTripLo) + ' … ' + fmtA(dsTripHi) + '</td>' +
        '<td>' + fmtA(ds.Ik1_min_A) + ' / ' + fmtA(ds.Ik1_max_A) + '</td>' +
      '</tr>' +
      '<tr>' +
        '<td>US — ' + usLabel + '</td>' +
        '<td style="white-space:pre-line">' + usModes + '</td>' +
        '<td>' + usCol3 + '</td>' +
      '</tr>';
  }

  // Recommendations — decision-tree builder
  const recsEl = document.getElementById('sc-sel-recs');
  if (recsEl) {
    recsEl.innerHTML = buildSelectivityRecs({
      state, subState, verdictSource, IsMfr_kA,
      dsTripHi, ikMin, ikMax,
      usTripLo, usTripHi, bindingMode, usType,
    });
  }

  // Store for PDF export
  window._scLastResult.selectivity = {
    state, I_sel, dsLabel: ds.devType.toUpperCase() + ' ' + ds.In + 'A (' + ds.curveLabel + ')',
    usLabel, usTripModes, dsTripLo, dsTripHi,
    Ik1_min_A: ds.Ik1_min_A, Ik1_max_A: ds.Ik1_max_A,
    asciiArt: document.getElementById('sc-sel-ascii')?.textContent || '',
    subState, verdictSource, IsMfr_kA, bindingMode, zoneLabel,
  };

  if (selPanel) selPanel.style.display = 'block';
}

// ─── Decision-tree style recommendation builder ──────────────────────────────
// Each guidance block contains: title (variant A/B/C…), action, why, caveat.
// Templates use {placeholder} substitution for context-specific values.

function buildSelectivityRecs(ctx) {
  const t = (k, fallback) => (T[lang] && T[lang][k]) || fallback;
  const fmtA = v => v >= 1000 ? (v / 1000).toFixed(2) + ' kA' : Math.round(v) + ' A';
  const subst = (str, vars) => String(str).replace(/\{(\w+)\}/g, (m, k) => vars[k] !== undefined ? vars[k] : m);
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));

  // Compute substitution variables used across multiple variants
  const isdMin = Math.ceil(ctx.dsTripHi);
  const usLoStr = fmtA(ctx.usTripLo);
  const ikMaxStr = fmtA(ctx.ikMax);
  const deltaA = Math.max(0, Math.round(ctx.ikMax - ctx.usTripLo));
  // minInUp = minimum upstream rated current so that usLo > IkMax
  // The lower-trip multiplier depends on upstream device type:
  //   MCB → SC_CURVES[curve].min   (3 / 5 / 10 / 8 / 2 for B / C / D / K / Z)
  //   gG fuse → SC_FUSE_KA[discTime].lo
  //   MCCB → not meaningful (Ii is independent of In_up); variant D suppressed for MCCB
  let curveMin, curveLabel;
  if (ctx.usType === 'fuse') {
    const upDt = document.getElementById('sc-up-disc-time')?.value || '5';
    curveMin = getFuseKa(upDt).lo;
    curveLabel = 'gG ≤' + upDt + 's';
  } else {
    curveLabel = document.getElementById('sc-up-curve')?.value || 'C';
    curveMin = (SC_CURVES[curveLabel] && SC_CURVES[curveLabel].min) || 5;
  }
  const minInUp = Math.ceil(ctx.ikMax / curveMin);
  const vars = {
    isdMin: fmtA(isdMin),
    usLo:   usLoStr,
    ikMax:  ikMaxStr,
    delta:  fmtA(deltaA),
    minInUp: fmtA(minInUp),
    curve:  curveLabel,
    curveMin: String(curveMin),
    is: ctx.IsMfr_kA != null ? ctx.IsMfr_kA.toFixed(2) : '',
  };

  const variant = (titleKey, actionKey, whyKey, limitKey) => {
    const action = subst(t(actionKey, ''), vars);
    const why    = subst(t(whyKey, ''),    vars);
    const limit  = subst(t(limitKey, ''),  vars);
    const labelWhy   = t('selRecVariantWhy',   'Why it works:');
    const labelLimit = t('selRecVariantLimit', 'Caveat:');
    return '<li><div class="sc-rec-variant">' +
      '<div class="sc-rec-vt">' + esc(t(titleKey, '')) + '</div>' +
      (action ? '<div class="sc-rec-va">' + esc(action) + '</div>' : '') +
      (why    ? '<div class="sc-rec-vw"><strong>' + esc(labelWhy) + '</strong> ' + esc(why) + '</div>' : '') +
      (limit  ? '<div class="sc-rec-vl"><strong>' + esc(labelLimit) + '</strong> ' + esc(limit) + '</div>' : '') +
    '</div></li>';
  };

  // FULL — manufacturer table guarantees, no recommendations
  if (ctx.state === 2 && ctx.verdictSource === 'mfrTable') {
    return '<li class="sc-rec-intro">' + esc(subst(t('selFullMfrConfirm', 'Selectivity guaranteed by manufacturer up to Is = {is} kA.'), vars)) + '</li>';
  }
  // FULL — band-based: still show disclaimer-style note
  if (ctx.state === 2 && ctx.verdictSource === 'bandBased') {
    return '<li style="color:var(--on-surf-var)">' + esc(t('selBandFullDisclaimerNote', 'Band-based — verify with manufacturer coordination table for energy selectivity.')) + '</li>';
  }
  // DS does not guarantee trip — fix cable protection first (no selectivity rec)
  if (ctx.subState === 'dsNoTrip') {
    return '<li>' + esc(t('selRecShortCable', 'Reduce cable length or increase conductor cross-section to raise minimum fault current.')) + '</li>';
  }
  // Manufacturer table exceeded
  if (ctx.subState === 'mfrTableExceeded') {
    return '<li class="sc-rec-intro">' + esc(t('selRecMfrExceededIntro', 'Actual Ik exceeds the manufacturer-supplied Is value. Options:')) + '</li>' +
           '<li>' + esc(t('selRecMfrExceededA', 'A) Use a more selective pair (higher US series).')) + '</li>' +
           '<li>' + esc(t('selRecMfrExceededB', 'B) Cascade with back-up protection upstream.')) + '</li>' +
           '<li>' + esc(t('selRecMfrExceededC', 'C) MCCB with S-release as replacement.')) + '</li>';
  }

  // Decision-tree variants for race / uncertain / partial
  let html = '';

  if (ctx.subState === 'race') {
    html += '<li class="sc-rec-intro">' + esc(t('selRecRaceIntro', 'Selectivity not guaranteed — both devices in instantaneous magnetic trip zone.')) + '</li>';
    html += '<li class="sc-rec-hdr">' + esc(t('selRecGuideHdr', 'To achieve full selectivity, do ONE of the following:')) + '</li>';
    html += variant('selRecVariantTitleA', 'selRecVarA_action', 'selRecVarA_why', 'selRecVarA_limit');
    if (ctx.usType !== 'mccb') {
      html += variant('selRecVariantTitleB', 'selRecVarB_action', 'selRecVarB_why', 'selRecVarB_limit');
    }
    html += variant('selRecVariantTitleC', 'selRecVarC_action', 'selRecVarC_why', 'selRecVarC_limit');
  } else if (ctx.subState === 'uncertain') {
    html += '<li class="sc-rec-intro">' + esc(t('selRecUncertainIntro', 'Entire Ik range lies in upstream may-trip band. Selectivity not guaranteed.')) + '</li>';
    html += '<li class="sc-rec-hdr">' + esc(t('selRecGuideHdr', 'To achieve full selectivity, do ONE of the following:')) + '</li>';
    if (ctx.usType !== 'mccb') {
      html += variant('selRecVariantTitleD', 'selRecVarD_action', 'selRecVarD_why', 'selRecVarD_limit');
    }
    html += variant('selRecVariantTitleA', 'selRecVarA_action', 'selRecVarA_why', 'selRecVarA_limit');
    if (ctx.usType !== 'mccb') {
      html += variant('selRecVariantTitleB', 'selRecVarB_action', 'selRecVarB_why', 'selRecVarB_limit');
    }
  } else if (ctx.state === 1 && ctx.verdictSource === 'bandBased') {
    html += '<li class="sc-rec-intro">' + esc(subst(t('selRecPartialIntro', 'Selective only up to usLo = {usLo}. For full selectivity:'), vars)) + '</li>';
    html += '<li class="sc-rec-hdr">' + esc(t('selRecGuideHdr', 'To achieve full selectivity, do ONE of the following:')) + '</li>';
    if (ctx.usType !== 'mccb') {
      html += variant('selRecVariantTitleD', 'selRecVarD_action', 'selRecVarD_why', 'selRecVarD_limit');
    }
    html += variant('selRecVariantTitleA', 'selRecVarA_action', 'selRecVarA_why', 'selRecVarA_limit');
    if (ctx.usType !== 'mccb') {
      html += variant('selRecVariantTitleB', 'selRecVarB_action', 'selRecVarB_why', 'selRecVarB_limit');
    }
  } else if (ctx.state === 1 && ctx.verdictSource === 'mfrTable') {
    // Partial per manufacturer table — concrete actions to push to FULL
    html += '<li class="sc-rec-intro">' + esc(subst(t('selRecPartialMfrIntro', 'Selective only up to Is = {is} kA. For full selectivity:'), vars)) + '</li>';
    if (ctx.usType !== 'mccb') {
      html += variant('selRecVariantTitleD', 'selRecVarD_action', 'selRecVarD_why', 'selRecVarD_limit');
      html += variant('selRecVariantTitleB', 'selRecVarB_action', 'selRecVarB_why', 'selRecVarB_limit');
    }
  }

  return html || ('<li style="color:var(--on-surf-var)">' + esc(t('selNoRecs', 'No recommendations.')) + '</li>');
}

// ─── IEC 60364-4-41 §411.4.4 Disconnection Time Verification ────────────────

function scUpdateDtv() {
  const card = document.getElementById('sc-dtv-card');
  if (!_scDtvState) { card.style.display = 'none'; return; }
  const { Z1_min, U0, In, isFuse, discTime, curveSel } = _scDtvState;

  const tMax = parseFloat(document.getElementById('sc-dtv-tmax').value);

  // I_a: current ensuring guaranteed disconnection within t_max
  let Ia;
  if (isFuse) {
    Ia = (SC_DTV_FUSE_IA[String(tMax)] ?? SC_DTV_FUSE_IA['0.4']) * In;
  } else {
    // IEC 60364-4-41 §411.4.4: Ia = current guaranteeing disconnection within t_max.
    // For MCBs, only c.max × In guarantees instantaneous magnetic trip (<<0.1 s, ≤ any t_max).
    // c.min is the lower bound of the UNCERTAIN transition band — trip is not guaranteed there,
    // regardless of t_max. IEC 60898-1 does not define thermal-element clearing time precisely
    // enough to rely on it for the Zs check. Always use c.max.
    const c = SC_CURVES[curveSel] || SC_CURVES['C'];
    Ia = c.max * In;
  }

  // Zs × Ia ≤ U0 per IEC 60364-4-41 §411.4.4
  // Zs_actual = Z1_min (physical loop impedance, hot cable, worst case)
  const Zs_max    = U0 / Ia;  // Ω
  const Zs_actual = Z1_min;   // Ω
  const pass      = Zs_actual <= Zs_max;

  document.getElementById('sc-dtv-ia').textContent    = Ia.toFixed(1) + ' A';
  document.getElementById('sc-dtv-zs').textContent    = fmtmOhm(Zs_actual);
  document.getElementById('sc-dtv-zsmax').textContent = fmtmOhm(Zs_max);

  const badge = document.getElementById('sc-dtv-badge');
  badge.textContent  = pass ? '✅ PASS' : '❌ FAIL';
  card.className     = 'sc-dtv-card ' + (pass ? 'sc-dtv-pass' : 'sc-dtv-fail');
  card.style.display = 'block';
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
  let Re_supply = 0, Re_load = 0;
  if (scNetworkType === 'tt') {
    Re_supply = parseFloat(document.getElementById('sc-re-supply').value);
    Re_load   = parseFloat(document.getElementById('sc-re').value);
    if (isNaN(Re_supply) || Re_supply < 0 || isNaN(Re_load) || Re_load < 0) return fail(T[lang].scErrFill);
    Re = Re_supply + Re_load;  // Re_total used throughout
  }

  // ── source impedance (complex) ─────────────────────────────────────────────
  const Ik_sup_A = ik_kA * 1000;
  const Zs_mag   = U_LL / (Math.sqrt(3) * Ik_sup_A);  // |Zs| (rated, uncorrected)
  const XR       = scSourceXR;
  const Rs       = Zs_mag / Math.sqrt(1 + XR * XR);    // source resistance (rated)
  const Xs       = Rs * XR;                              // source reactance (rated)
  // IEC 60909-0 §6.3.3 — K_T impedance correction (transformer mode only).
  // Applied to source impedance for MAX Ik calculation; for MIN Ik the rated Z_T is used.
  const KT       = scGetKT();   // 1.0 if not applicable
  const Rs_max   = Rs * KT;
  const Xs_max   = Xs * KT;
  const Zs_max_mag = Zs_mag * KT;

  // ── cable resistivity: two temperatures ────────────────────────────────────
  // Max Ik → reference temperature (20°C, IEC 60909 §4.2)
  // Min Ik → user-selected operating temperature (worst case for protection)
  const rhoRef = SC_MAT[scMaterial].rho20;                               // 20°C
  const rhoHot = scGetRho();                                              // operating temp

  const xpm = scCableXpm * 1e-3;  // mΩ/m → Ω/m

  // Skin effect (IEC 60287, 50 Hz, k_s = 1 for Cu stranded)
  // rhoRef/S and rhoHot/S give R_DC per metre in Ω/m (rho in Ω·mm²/m, S in mm²)
  const ys_ph_ref = skinEffectYs(50, rhoRef / S);
  const ys_ph_hot = skinEffectYs(50, rhoHot / S);
  const ys_pe_ref = skinEffectYs(50, rhoRef / Spe);
  const ys_pe_hot = skinEffectYs(50, rhoHot / Spe);

  // Phase conductor impedances with skin effect
  const Rf_max = rhoRef * L / S * (1 + ys_ph_ref);
  const Rf_hot = rhoHot * L / S * (1 + ys_ph_hot);
  const Xf     = xpm * L;

  // PE conductor impedances with skin effect
  const Rpe_max = rhoRef * L / Spe * (1 + ys_pe_ref);
  const Rpe_hot = rhoHot * L / Spe * (1 + ys_pe_hot);
  const Xpe     = xpm * L;

  // ── 3-phase loop impedances ────────────────────────────────────────────────
  // Z3 = Zs + Zf (source + phase cable). Max uses K_T-corrected source Z_T per IEC 60909-0.
  const Z3_max = cMag(Rs_max + Rf_max, Xs_max + Xf);
  const Z3_min = cMag(Rs     + Rf_hot, Xs     + Xf);

  // ── phase-to-phase loop impedances ────────────────────────────────────────
  // IEC 60909: I"k2 = c × U_LL / (2 × Z(1)); for symmetric Z(1)=Z(2)=Z3
  // → Ik2 = (√3 / 2) × Ik3 exactly (derived, not assumed)
  const Z2_max = Z3_max;  // Z(1) = Z(2) for cables
  const Z2_min = Z3_min;

  // ── phase-to-earth loop impedances ────────────────────────────────────────
  // TN: Z1 = Zs + Zf + Zpe (+ Re for TT). K_T applies only to source for max Ik.
  const Z1_max = cMag(Rs_max + Rf_max + Rpe_max + Re, Xs_max + Xf + Xpe);
  const Z1_min = cMag(Rs     + Rf_hot + Rpe_hot + Re, Xs     + Xf + Xpe);

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
  const isSinglePhase = scVoltPreset === 'ac1';
  const Ik_max_kA = isSinglePhase
    ? Ik1_max
    : Math.max(Ik3_max, Ik2_max, Ik1_max);
  // KT < 1 reduces transformer impedance, so Ik_max legitimately exceeds the
  // rated supply Ik by up to C_MAX/KT (IEC 60909-0 §6.3.3).
  const ikCap = (scSourceMode === 'transformer' && KT !== 1.0)
    ? ik_kA * (C_MAX / KT) * 1.05   // 5 % margin for cable impedance
    : ik_kA * 1.01;
  if (Ik_max_kA > ikCap) {
    return fail(
      'Max calculated fault current (' + Ik_max_kA.toFixed(2) +
      ' kA) exceeds supply Ik (' + ik_kA + ' kA)' +
      (scSourceMode === 'transformer' && KT !== 1.0
        ? ' even after KT correction (IEC 60909-0 §6.3.3). Check transformer data.'
        : '. Check inputs.')
    );
  }

  // ── trip thresholds ───────────────────────────────────────────────────────
  const curveSel = document.getElementById('sc-dev-curve').value;
  const isFuse   = devType === 'fuse';
  const discTime = isFuse ? (document.getElementById('sc-disc-time')?.value || '5') : null;
  const fuseKa   = isFuse ? getFuseKa(discTime) : null;
  const tripLo   = isFuse ? fuseKa.lo * In : SC_CURVES[curveSel].min * In;   // device MAY trip
  const tripHi   = isFuse ? fuseKa.hi * In : SC_CURVES[curveSel].max * In;   // device WILL trip
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
    const B  = rhoHot * (1 + ys_ph_hot) / S + rhoHot * (1 + ys_pe_hot) / Spe;
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
  document.getElementById('sc-r-ik3-card').style.display = isSinglePhase ? 'none' : '';
  document.getElementById('sc-r-ik2-card').style.display = isSinglePhase ? 'none' : '';

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
  const curveLabel = isFuse ? 'gG fuse ≤' + discTime + 's' : SC_CURVES[curveSel].label;
  tripDetail.textContent =
    'Ik1: ' + fmtIkVal(Ik1_min) + ' … ' + fmtIkVal(Ik1_max) +
    '   |   Trip lo=' + tripLo.toFixed(0) + ' A  hi=' + tripHi.toFixed(0) + ' A';

  // Icu warnings
  const icuBox  = document.getElementById('sc-icu-box');
  const icuWarn = document.getElementById('sc-icu-warn');
  icuBox.style.display  = exceedsIcu     ? 'block' : 'none';
  icuWarn.style.display = approachingIcu ? 'block' : 'none';
  if (exceedsIcu) {
    const lbl = isSinglePhase ? 'Ik1_max' : (Ik_max_kA === Ik3_max ? 'Ik3_max' : (Ik_max_kA === Ik2_max ? 'Ik2_max' : 'Ik1_max'));
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

  // ─── IEC 60364-4-43 §434.5 Cable Thermal Withstand ──────────────────────
  const insulType = (document.getElementById('sc-insul')?.value || 'pvc');
  const It2_input = parseFloat(document.getElementById('sc-it2')?.value) || 30000;
  let k_thw;
  if (insulType === 'custom') {
    k_thw = parseFloat(document.getElementById('sc-insul-k')?.value) || 115;
  } else {
    const kRow = SC_THW_K[insulType] || SC_THW_K.pvc;
    k_thw = kRow[scMaterial] ?? kRow.cu;
  }
  const kS2       = Math.pow(k_thw * S,   2);   // (k·S)²   A²·s — phase
  const kSpe2     = Math.pow(k_thw * Spe, 2);   // (k·Spe)² A²·s — PE

  let thw_dt;
  if (isFuse) {
    const dt_sel = document.getElementById('sc-disc-time')?.value || '0.4';
    thw_dt = '≤ ' + dt_sel + ' s (gG fuse)';
  } else if (tripState === 2) {
    thw_dt = devType === 'mccb' ? '≤ 30 ms (instantaneous)' : '≤ 10 ms (instantaneous)';
  } else {
    thw_dt = '— (trip not guaranteed)';
  }

  // 0 = FAIL, 1 = WARN (80–100 % of limit), 2 = PASS
  const thw_ratio      = It2_input / kS2;
  const thw_status     = thw_ratio    >= 1 ? 0 : thw_ratio    >= 0.8 ? 1 : 2;
  const thw_pe_ratio   = It2_input / kSpe2;
  const thw_pe_status  = thw_pe_ratio >= 1 ? 0 : thw_pe_ratio >= 0.8 ? 1 : 2;
  const thw_overall    = Math.min(thw_status, thw_pe_status);

  function thwStatusStr(status, ratio) {
    if (status === 2) return '✅ PASS (margin ' + ((1 - ratio) * 100).toFixed(0) + '%)';
    if (status === 1) return '⚠ WARN (' + (ratio * 100).toFixed(0) + '% of limit)';
    return '❌ FAIL';
  }

  const thwCol  = document.getElementById('sc-thw-col');
  const thwCard = document.getElementById('sc-thw-card');
  const thwBadge = document.getElementById('sc-thw-badge');
  if (thwCol && thwCard && thwBadge) {
    thwCol.style.display = '';
    document.getElementById('sc-thw-dt').textContent      = thw_dt;
    document.getElementById('sc-thw-it2-val').textContent = It2_input.toLocaleString('cs-CZ') + ' A²·s';
    document.getElementById('sc-thw-ks2').textContent =
      Math.round(kS2).toLocaleString('cs-CZ') + ' A²·s  (k=' + k_thw + ', S=' + S + ' mm²)  ' +
      thwStatusStr(thw_status, thw_ratio);
    document.getElementById('sc-thw-kspe2').textContent =
      Math.round(kSpe2).toLocaleString('cs-CZ') + ' A²·s  (k=' + k_thw + ', Spe=' + Spe + ' mm²)  ' +
      thwStatusStr(thw_pe_status, thw_pe_ratio);
    if (thw_overall === 2) {
      thwCard.className    = 'sc-thw-card sc-thw-pass';
      thwBadge.textContent = '✅ PASS — phase & PE';
    } else if (thw_overall === 1) {
      thwCard.className    = 'sc-thw-card sc-thw-warn';
      thwBadge.textContent = '⚠ WARN — ' + (thw_status < thw_pe_status ? 'phase' : 'PE') + ' near limit';
    } else {
      thwCard.className    = 'sc-thw-card sc-thw-fail';
      thwBadge.textContent = '❌ FAIL — ' + (thw_status === 0 && thw_pe_status === 0 ? 'phase & PE' : thw_status === 0 ? 'phase' : 'PE') + ' I²t > k²·S²';
    }
  }

  // ─── Assumptions display ─────────────────────────────────────────────────
  const sysLabel = scVoltPreset === 'ac1' ? '1-phase 230 V' : scVoltPreset === 'ac3' ? '3-phase 400 V' : 'Custom';
  const voltModeStr = isSinglePhase
    ? sysLabel + '  →  U0 = U = 230 V  (single-phase; U_LL not applicable)'
    : sysLabel + '  →  U0 = ' + engRound(U0, 4) + ' V  ·  U_LL = ' + engRound(U_LL, 4) + ' V';
  document.getElementById('sc-assumptions').textContent = [
    'Voltage: ' + voltModeStr,
    'Voltage factors: c_max = ' + C_MAX + ' (max Ik, Icu check)   c_min = ' + C_MIN + ' (min Ik, protection)',
    'Source X/R = ' + XR + '   |Zs| = ' + fmtmOhm(Zs_mag) + '   Rs = ' + fmtmOhm(Rs) + '   Xs = ' + fmtmOhm(Xs),
    'Cable x\' = ' + scCableXpm + ' mΩ/m',
    'Max Ik: T = 20°C (reference, IEC 60909 §4.2)   ρ = ' + engRound(rhoRef, 3) + ' Ω·mm²/m',
    'Min Ik: T = ' + scCondTemp + '°C (operating)   ρ = ' + engRound(rhoHot, 4) + ' Ω·mm²/m',
    'Network: ' + scNetworkType.toUpperCase() + (Re > 0 ? '   Re_supply = ' + Re_supply + ' Ω   Re_load = ' + Re_load + ' Ω   Re_total = ' + Re + ' Ω' : ''),
  ].join('\n');

  // ─── calculation steps ───────────────────────────────────────────────────
  const fmtO = v => engRound(v, 3) + ' Ω';
  const lines = [
    '=== Input parameters ===',
    'Voltage input: ' + voltModeStr,
    isSinglePhase
      ? 'Single-phase supply: U = U0 = 230 V  (U_LL concept not applicable)'
      : 'U_LL (line-to-line) = ' + engRound(U_LL, 4) + ' V   U0 (phase) = ' + engRound(U0, 4) + ' V',
    'Ik_supply = ' + ik_kA + ' kA   Network: ' + scNetworkType.toUpperCase(),
    'S = ' + S + ' mm2   Spe = ' + Spe + ' mm2   L = ' + L + ' m',
    'Material: ' + scMaterial.toUpperCase() + '   Temp (min Ik): ' + scCondTemp + ' C   Temp (max Ik): 20 C',
    'rho_ref (20C) = ' + engRound(rhoRef, 4) + ' Ohm*mm2/m',
    'rho_hot (' + scCondTemp + 'C) = ' + engRound(rhoHot, 4) + ' Ohm*mm2/m  [rho(T)=rho20*(1+alpha*(T-20))]',
    'Cable reactance x\' = ' + scCableXpm + ' mOhm/m',
    Re > 0 ? 'Re_supply (TT source electrode) = ' + Re_supply + ' Ohm' : '',
    Re > 0 ? 'Re_load   (TT load electrode)   = ' + Re_load   + ' Ohm' : '',
    Re > 0 ? 'Re_total  = Re_supply + Re_load  = ' + Re        + ' Ohm' : '',
    '',
    '=== IEC 60909 voltage factors ===',
    'c_max = ' + C_MAX + '  (maximum fault current — equipment rating / Icu check)',
    'c_min = ' + C_MIN + '  (minimum fault current — protection / disconnection verification)',
    '',
    '=== Source impedance (complex) ===',
    isSinglePhase
      ? '|Zs| = U0 / Ik_sup = ' + engRound(U0, 4) + ' / ' + Ik_sup_A.toFixed(0) + ' = ' + fmtmOhm(Zs_mag)
      : '|Zs| = U_LL / (sqrt(3) * Ik_sup) = ' + engRound(U_LL,4) + ' / (1.732 * ' + Ik_sup_A.toFixed(0) + ') = ' + fmtmOhm(Zs_mag),
    'X/R ratio = ' + XR,
    'Rs = |Zs| / sqrt(1 + (X/R)^2) = ' + fmtmOhm(Rs),
    'Xs = (X/R) * Rs = ' + fmtmOhm(Xs),
    ...(KT !== 1.0 ? [
      '',
      '--- IEC 60909-0 §6.3.3 K_T transformer impedance correction ---',
      'x_T  = (Uk/100) * X/sqrt(X^2+R^2) = ' + ((parseFloat(document.getElementById('sc-tr-uk')?.value)||0)/100*XR/Math.sqrt(1+XR*XR)).toFixed(5),
      'K_T  = 0.95 * c_max / (1 + 0.6 * x_T) = 0.95 * ' + C_MAX + ' / (1 + 0.6 * x_T) = ' + KT.toFixed(4),
      'Z_TK (max calc only) = K_T * Z_T = ' + fmtmOhm(Zs_max_mag),
      'Min-Ik calc uses Z_T (uncorrected) per IEC 60909-0 §6.3.3.',
    ] : []),
    '',
    '=== Cable impedances ===',
    'Rf_max (20C) = rho_ref * L / S   = ' + fmtmOhm(Rf_max) + '  [used for max Ik]',
    'Rf_hot (' + scCondTemp + 'C) = rho_hot * L / S = ' + fmtmOhm(Rf_hot) + '  [used for min Ik]',
    'Rpe_max (20C)  = ' + fmtmOhm(Rpe_max) + '   Rpe_hot = ' + fmtmOhm(Rpe_hot),
    'Xf = x\' * L = ' + scCableXpm + ' * ' + L + ' = ' + fmtmOhm(Xf) + '   Xpe = ' + fmtmOhm(Xpe),
    '',
    ...(!isSinglePhase ? [
      '=== 3-phase loop impedances ===',
      'Z3_max = sqrt((Rs+Rf_max)^2 + (Xs+Xf)^2) = ' + fmtmOhm(Z3_max),
      'Z3_min = sqrt((Rs+Rf_hot)^2 + (Xs+Xf)^2) = ' + fmtmOhm(Z3_min),
      '',
      '=== Phase-to-phase loop impedances ===',
      'Z2 = Z3  (Z(1)=Z(2) for symmetric cable, IEC 60909 §3.6)',
      '',
    ] : []),
    '=== Phase-to-earth loop impedances (TN) ===',
    'Z1_max = sqrt((Rs+Rf_max+Rpe_max' + (Re>0?'+Re_total':'')+')^2 + (Xs+Xf+Xpe)^2) = ' + fmtmOhm(Z1_max),
    'Z1_min = sqrt((Rs+Rf_hot+Rpe_hot' + (Re>0?'+Re_total':'')+')^2 + (Xs+Xf+Xpe)^2) = ' + fmtmOhm(Z1_min),
    '',
    '=== Fault currents ===',
    ...(isSinglePhase ? [
      '[Ik2, Ik3 not applicable for 1-phase installation — only Ik1 shown]',
      '',
    ] : [
      'Ik3_max = c_max * U0 / Z3_max = ' + C_MAX + ' * ' + engRound(U0,4) + ' / ' + fmtmOhm(Z3_max) + ' = ' + fmtIkVal(Ik3_max),
      'Ik3_min = c_min * U0 / Z3_min = ' + C_MIN + ' * ' + engRound(U0,4) + ' / ' + fmtmOhm(Z3_min) + ' = ' + fmtIkVal(Ik3_min),
      '',
      'Ik2_max = c_max * U_LL / (2 * Z2_max) = ' + C_MAX + ' * ' + engRound(U_LL,4) + ' / (2 * ' + fmtmOhm(Z2_max) + ') = ' + fmtIkVal(Ik2_max),
      'Ik2_min = c_min * U_LL / (2 * Z2_min) = ' + fmtIkVal(Ik2_min),
      '  [Derivation: I"k2 = c*U_LL/(Z(1)+Z(2)) = c*U_LL/(2*Z3), yields exactly (sqrt(3)/2)*Ik3 per IEC 60909 §4.3]',
      '',
    ]),
    'Ik1_max = c_max * U0 / Z1_max = ' + C_MAX + ' * ' + engRound(U0,4) + ' / ' + fmtmOhm(Z1_max) + ' = ' + fmtIkVal(Ik1_max),
    'Ik1_min = c_min * U0 / Z1_min = ' + C_MIN + ' * ' + engRound(U0,4) + ' / ' + fmtmOhm(Z1_min) + ' = ' + fmtIkVal(Ik1_min),
    '',
    '=== Trip verification ===',
    'Device: ' + devType.toUpperCase() + '   In = ' + In + ' A   Curve: ' + curveLabel,
    ...(isFuse ? [
      'Disconnection time: ≤' + discTime + ' s  (IEC 60364-4-41 §411.3.2)',
      'k_a multipliers (IEC 60269-2 Annex B):  lo=' + fuseKa.lo + '  hi=' + fuseKa.hi,
      'I_a lo (may trip):        ' + tripLo.toFixed(0) + ' A  [k_a_lo × In]',
      'I_a hi (guaranteed trip): ' + tripHi.toFixed(0) + ' A  [k_a_hi × In — used for L_max]',
      'I₂ (conventional fusing, overload only): ' + (SC_FUSE_FACTOR * In).toFixed(0) + ' A  [1.6 × In, IEC 60269-2]',
      '⚠ I²t let-through (used in §434.5 cable thermal check) MUST be read from manufacturer datasheet',
      '   for the actual prospective Ik. gG fuse I²t varies widely between types/vendors and cannot',
      '   be derived from In or disconnection time. Default 30 000 A²·s does NOT apply to fuses.',
    ] : [
      'May trip above (lower bound):      ' + tripLo.toFixed(0) + ' A',
      'Guaranteed trip (upper bound): ' + tripHi.toFixed(0) + ' A  [IEC 60898 — used for L_max]',
    ]),
    'Ik1_min = ' + fmtIkVal(Ik1_min) + '   =>   ' + ['NO TRIP', 'UNCERTAIN (transition band)', 'GUARANTEED TRIP'][tripState],
    '',
    '=== Breaking capacity ===',
    (isSinglePhase
      ? 'Iku_max = Ik1_max = ' + Ik_max_kA.toFixed(2) + ' kA  [Ik2, Ik3 not applicable for 1-phase]'
      : 'Iku_max = max(Ik3_max, Ik2_max, Ik1_max) = ' + Ik_max_kA.toFixed(2) + ' kA'),
    'Icu = ' + Icu_kA + ' kA   =>   ' + (exceedsIcu ? 'EXCEEDED!' : (approachingIcu ? 'WARNING: > 80% of Icu' : 'OK')),
    '',
    '=== Maximum cable length (guaranteed trip, c_min, hot cable) ===',
    'Solve quadratic: (B^2+D^2)*L^2 + 2*(A*B+C*D)*L + (A^2+C^2-Ztarget^2) = 0',
    'where A=Rs+Re_total=' + fmtO(Rs+Re) + '  B=rho_hot*(1/S+1/Spe)=' + engRound(rhoHot*(1/S+1/Spe),4) + ' Ohm/m',
    '      C=Xs=' + fmtO(Xs) + '  D=2*x\'=' + engRound(2*xpm,5) + ' Ohm/m',
    '      Ztarget=c_min*U0/tripHi=' + fmtO(Ztarget),
    L_max > 0
      ? 'L_max = ' + engRound(L_max, 3) + ' m   [actual L = ' + L + ' m => ' + (L > L_max ? 'EXCEEDED' : 'OK') + ']'
      : 'No solution — Ztarget > |Zs| (protection cannot be guaranteed even without cable)',
    '',
    '=== Cable thermal withstand — IEC 60364-4-43 §434.5 (I²t ≤ (k·S)²) ===',
    'Insulation k factor: k = ' + k_thw + '   I²t let-through: ' + It2_input.toLocaleString() + ' A²·s   Clearing: ' + thw_dt,
    'Phase: k·S   = ' + k_thw + ' × ' + S   + ' mm²   (k·S)²   = ' + Math.round(kS2)   + ' A²·s   I²t/limit = ' + thw_ratio.toFixed(3)    + '   => ' + ['FAIL', 'WARN', 'PASS'][thw_status],
    'PE:    k·Spe = ' + k_thw + ' × ' + Spe + ' mm²   (k·Spe)² = ' + Math.round(kSpe2) + ' A²·s   I²t/limit = ' + thw_pe_ratio.toFixed(3) + '   => ' + ['FAIL', 'WARN', 'PASS'][thw_pe_status],
    'Overall result: ' + ['FAIL', 'WARN', 'PASS'][thw_overall],
  ].filter(s => s !== '');

  document.getElementById('sc-steps').textContent = lines.join('\n');
  document.getElementById('sc-res-card').style.display = 'block';
  document.getElementById('sc-res-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  window._scLastResult = {
    U0, U_LL, ik_kA, S, Spe, L, In, Icu_kA, devType, Re, Re_supply, Re_load,
    rhoRef, rhoHot, XR, xpm: scCableXpm,
    Rs, Xs, Zs_mag, Rf_hot, Xf, Rpe_hot, Z3_min, Z1_min,
    Ik3_max, Ik3_min, Ik2_max, Ik2_min, Ik1_max, Ik1_min,
    Ik_max_kA, tripState, tripLo, tripHi, exceedsIcu, approachingIcu, L_max,
    curveSel: isFuse ? 'gG' : curveSel, curveLabel,
    voltModeStr,
    sourceMode: scSourceMode, KT,           // for PDF disclosure
    isSinglePhase,                          // suppresses Ik3/Ik2 cards in PDF
    isFuse,                                 // for fuse-specific I²t note in PDF
    thw: { k: k_thw, kS2, kSpe2, It2: It2_input, status: thw_overall, phaseStatus: thw_status, peStatus: thw_pe_status, dt: thw_dt, insulType },
  };

  // ─── IEC 60364-4-41 §411.4.4 Disconnection Time Verification ───────────
  _scDtvState = { Z1_min, U0, In, isFuse, discTime, curveSel };
  scUpdateDtv();

  // Selectivity analysis (must run after _scLastResult is set)
  if (document.getElementById('sc-sel-check')?.checked) {
    scAnalyzeSelectivity();
  } else {
    const sp = document.getElementById('sc-sel-panel');
    if (sp) sp.style.display = 'none';
  }
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

    const engineer = document.getElementById('sc-engineer')?.value.trim() || '';

    function drawHeader(pageNum, totalPages) {
      pdfMakeHeader(doc, { PW, M, title: _tt('scPdfTitle', 'Short-Circuit Calculation (AC)') });
      drawFooter(pageNum, totalPages);
    }

    function drawFooter(pageNum, totalPages) {
      pdfMakeFooter(doc, { PW, PH, M, pageNum, totalPages, engineer, standard: 'IEC 60909 / IEC 60364' });
    }

    function secTitle(y, title) {
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...ACC);
      doc.text(pdfSafe(title), M, y);
      doc.setDrawColor(220, 222, 226); doc.setLineWidth(0.3);
      doc.line(M + doc.getTextWidth(pdfSafe(title)) + 3, y - 1, PW - M, y - 1);
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

      // ── fault current cards (max/min range) ──
      const allCards = [
        { lbl: 'Ik3 — 3-phase',  sub: '3-phase fault',   valMax: fmtIkPdf(r.Ik3_max), valMin: fmtIkPdf(r.Ik3_min), hl: false, skip: r.isSinglePhase },
        { lbl: 'Ik2 — 2-phase',  sub: 'phase-to-phase',  valMax: fmtIkPdf(r.Ik2_max), valMin: fmtIkPdf(r.Ik2_min), hl: false, skip: r.isSinglePhase },
        { lbl: 'Ik1 — 1-phase',  sub: r.isSinglePhase ? 'loop fault' : 'earth fault', valMax: fmtIkPdf(r.Ik1_max), valMin: fmtIkPdf(r.Ik1_min), hl: true, skip: false },
      ].filter(f => !f.skip);
      const cardW = CW / allCards.length, cardH = 30;
      allCards.forEach((f, i) => {
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

      // ── Cable Thermal Withstand (IEC 60364-4-43 §434.5) ──
      if (r.thw) {
        const tw = r.thw;
        let twcol, twbg, twLabel;
        if      (tw.status === 2) { twcol = [0, 160, 80];  twbg = [232, 252, 240]; twLabel = 'PASS'; }
        else if (tw.status === 1) { twcol = [180, 120, 0]; twbg = [255, 245, 220]; twLabel = 'WARN'; }
        else                      { twcol = [200, 40, 40]; twbg = [252, 232, 232]; twLabel = 'FAIL'; }

        function twStatusTag(st) {
          return st === 2 ? 'PASS' : st === 1 ? 'WARN' : 'FAIL';
        }

        const twH = 40;
        doc.setFillColor(245, 247, 250); doc.setDrawColor(200, 210, 225); doc.setLineWidth(0.2);
        doc.rect(M, y, CW, twH, 'FD');

        doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100);
        doc.text('CABLE THERMAL WITHSTAND  (IEC 60364-4-43 §434.5)', M + 3, y + 5.5);

        const twRows = [
          ['Δt clearing:', tw.dt],
          ['I²t let-through:', tw.It2.toLocaleString() + ' A²·s'],
          ['Phase: k²·S²   (k=' + tw.k + ', S=' + r.S + ' mm²)',
            Math.round(tw.kS2).toLocaleString() + ' A²·s  → ' + twStatusTag(tw.phaseStatus)],
          ['PE:    k²·Spe² (k=' + tw.k + ', Spe=' + r.Spe + ' mm²)',
            Math.round(tw.kSpe2).toLocaleString() + ' A²·s  → ' + twStatusTag(tw.peStatus)],
        ];
        let ry = y + 11;
        twRows.forEach(([lbl, val]) => {
          doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
          doc.text(pdfSafe(lbl), M + 3, ry);
          doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
          doc.text(pdfSafe(String(val)), M + CW - 35, ry, { align: 'right' });
          ry += 5.5;
        });

        doc.setFillColor(...twbg); doc.setDrawColor(...twcol); doc.setLineWidth(0.4);
        doc.rect(M + CW - 32, y + 1, 31, 12, 'FD');
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...twcol);
        doc.text(pdfSafe(twLabel), M + CW - 16.5, y + 8.5, { align: 'center' });

        y += twH + 3;
      }

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
    const ktStr = (r.sourceMode === 'transformer' && r.KT && r.KT !== 1.0)
      ? '  K_T = ' + r.KT.toFixed(4) + ' (IEC 60909-0 §6.3.3, applied to max calc)'
      : '';
    const srcStr = r.sourceMode === 'transformer'
      ? 'Transformer (' + (document.getElementById('sc-tr-sn')?.value || '?') + ' kVA, Uk=' + (document.getElementById('sc-tr-uk')?.value || '?') + '%)' + ktStr
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
    if (r.Re > 0) {
      inputRows.push(['Re_supply (TT, source electrode)', r.Re_supply + ' Ohm']);
      inputRows.push(['Re_load (TT, load electrode)', r.Re_load + ' Ohm']);
      inputRows.push(['Re_total = Re_supply + Re_load', r.Re + ' Ohm']);
    }
    const insulLbl = {
      pvc: 'PVC 70°C', xlpe: 'XLPE/EPR 90°C', rubber: 'Rubber 60°C',
      lszh: 'LSZH/HFFR 90°C', si: 'Silicone 180°C',
      mineral: 'Mineral (PVC/bare to touch)', mineralb: 'Mineral (bare, not to touch)',
      custom: 'Custom',
    };
    const it2Cell = r.thw
      ? (r.thw.It2.toLocaleString() + ' A²·s' + (r.isFuse ? '  - from manufacturer datasheet (mandatory for gG fuses)' : ''))
      : '—';
    inputRows.push(
      ['Protective device', r.devType.toUpperCase()],
      ['Rated current In', r.In + ' A'],
      ['Trip characteristic', pdfSafe(r.curveLabel)],
      ['Breaking capacity Icu', r.Icu_kA + ' kA'],
      ['Cable insulation (§434.5)', insulLbl[r.thw?.insulType] || r.thw?.insulType || '—'],
      ['I²t let-through (§434.5)', it2Cell],
    );

    // ── PAGE 1: Inputs + Results ──
    const TOTAL_PAGES = 2; // updated by realTotal at footer-fix loop
    drawHeader(1, TOTAL_PAGES);
    let y = M + 22;

    y = secTitle(y, _tt('iecPdfInputs', 'Input Parameters'));
    y = inputTable(y, inputRows);
    y += 6;

    y = secTitle(y, _tt('scPdfResults', 'Fault Currents & Impedances'));
    resultsSection(y);

    // ── PAGE 2 (optional): Selectivity Analysis ──
    const sel = r.selectivity;
    if (sel) {
      doc.addPage();
      drawHeader(2, TOTAL_PAGES);
      y = M + 22;
      y = secTitle(y, _tt('scPdfProtection', 'Protection Assessment') + '  (IEC 60898 / IEC 60947-2 / IEC 60269)');
      y += 2;

      // Selectivity status badge — color/label depend on state, subState and verdictSource
      let scol, sbg, sLabel;
      const isMfr = sel.verdictSource === 'mfrTable';
      const mfrIs = sel.IsMfr_kA != null ? sel.IsMfr_kA.toFixed(2) + ' kA' : '';
      if (sel.state === 2 && isMfr) {
        scol = [0, 130, 130]; sbg = [228, 248, 248];
        sLabel = 'FULL SELECTIVITY - MANUFACTURER TABLE (Is = ' + mfrIs + ')';
      } else if (sel.state === 2) {
        scol = [0, 160, 80];  sbg = [232, 252, 240];
        sLabel = 'FULL SELECTIVITY (band-based)';
      } else if (sel.state === 1 && isMfr) {
        scol = [180, 120, 0]; sbg = [255, 245, 220];
        sLabel = 'PARTIAL SELECTIVITY - MANUFACTURER TABLE (up to Is = ' + mfrIs + ')';
      } else if (sel.state === 1) {
        scol = [180, 120, 0]; sbg = [255, 245, 220];
        sLabel = 'PARTIAL SELECTIVITY - selective up to ' + (sel.I_sel / 1000).toFixed(2) + ' kA';
      } else if (sel.subState === 'race') {
        scol = [200, 40, 40]; sbg = [252, 232, 232];
        sLabel = 'NO SELECTIVITY - MAGNETIC RACE (both devices in instantaneous trip zone)';
      } else if (sel.subState === 'uncertain') {
        scol = [200, 40, 40]; sbg = [252, 232, 232];
        sLabel = 'NO SELECTIVITY - entire Ik range within upstream trip band';
      } else if (sel.subState === 'dsNoTrip') {
        scol = [200, 40, 40]; sbg = [252, 232, 232];
        sLabel = 'NO SELECTIVITY - downstream device does not guarantee trip';
      } else if (sel.subState === 'mfrTableExceeded') {
        scol = [200, 40, 40]; sbg = [252, 232, 232];
        sLabel = 'NO SELECTIVITY - Ik exceeds manufacturer Is = ' + mfrIs;
      } else {
        scol = [200, 40, 40]; sbg = [252, 232, 232];
        sLabel = 'NO SELECTIVITY';
      }
      doc.setFillColor(...sbg); doc.setDrawColor(...scol); doc.setLineWidth(0.5);
      doc.rect(M, y, CW, 12, 'FD');
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...scol);
      doc.text(pdfSafe(sLabel), PW / 2, y + 8, { align: 'center' });
      y += 12 + 4;

      // Disclaimer block (always shown — text varies by verdictSource)
      const disclaimerText = isMfr
        ? 'Verdict based on user-supplied Is value (manufacturer coordination table). Method assumes the value is correct for this exact US/DS device pair.'
        : 'Verdict based on trip-band vs. fault-current zone analysis (IEC 60898 / 60947-2 instantaneous bands). Energy / current-limiting selectivity in the magnetic region (Type 2 coordination) requires manufacturer coordination tables and is not evaluated here.';
      doc.setFillColor(248, 248, 248); doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2);
      const disclLines = doc.splitTextToSize(pdfSafe(disclaimerText), CW - 8);
      const disclH = 5 + disclLines.length * 3.2;
      doc.rect(M, y, CW, disclH, 'FD');
      doc.setFontSize(7); doc.setFont('helvetica', 'italic'); doc.setTextColor(80, 80, 80);
      doc.text(disclLines, M + 4, y + 4);
      y += disclH + 5;
      doc.setFont('helvetica', 'normal');

      // Device comparison table
      const colW3 = [CW * 0.38, CW * 0.38, CW * 0.24];
      const TH = 7, TD = 6.5;
      const hdrs = ['Device', 'Trip range', 'Ik1 min / max'];
      // header row — setFillColor inside loop so setTextColor cannot corrupt it
      let cx = M;
      hdrs.forEach((h, i) => {
        doc.setFillColor(230, 238, 248); doc.setDrawColor(170, 190, 215); doc.setLineWidth(0.2);
        doc.rect(cx, y, colW3[i], TH, 'FD');
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...ACC);
        doc.text(h, cx + 2, y + 5);
        cx += colW3[i];
      });
      y += TH;

      const fmtAp = v => v >= 1000 ? (v / 1000).toFixed(2) + ' kA' : Math.round(v) + ' A';
      const usZoneCol = isMfr
        ? 'Is = ' + mfrIs
        : (sel.zoneLabel ? 'Zone ' + sel.zoneLabel + (sel.bindingMode ? ' (' + sel.bindingMode + ')' : '') : '-');
      const selRows = [
        [
          'DS - ' + sel.dsLabel,
          fmtAp(sel.dsTripLo) + ' ... ' + fmtAp(sel.dsTripHi),
          fmtAp(sel.Ik1_min_A) + ' / ' + fmtAp(sel.Ik1_max_A),
        ],
        [
          'US - ' + sel.usLabel,
          sel.usTripModes.map(m => m.name + (m.timeGraded ? ' [time-graded]' : '') + ': ' + fmtAp(m.lo) + (isFinite(m.hi) ? ' ... ' + fmtAp(m.hi) : ' -> inf')).join(' | '),
          usZoneCol,
        ],
      ];
      const rowBg = [[248, 250, 252], [240, 244, 250]];
      selRows.forEach((row, ri) => {
        const rowH = TD + 2;
        let cx2 = M;
        // setFillColor per-cell: jsPDF shares non-stroking color with setTextColor,
        // so fill must be re-set before each rect after any text draw.
        row.forEach((cell, ci) => {
          doc.setFillColor(...rowBg[ri % 2]); doc.setDrawColor(190, 200, 215); doc.setLineWidth(0.2);
          doc.rect(cx2, y, colW3[ci], rowH, 'FD');
          doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
          doc.text(pdfSafe(cell), cx2 + 2, y + 5.5, { maxWidth: colW3[ci] - 4 });
          cx2 += colW3[ci];
        });
        y += rowH;
      });
      y += 6;

      // ASCII graph (monospace 7pt) — convert block chars to ASCII for jsPDF ISO Latin-1
      y = secTitle(y, 'Trip Characteristic Bands (logarithmic scale)');
      const asciiLines = sel.asciiArt.split('\n');
      const asciiSanitize = s => s
        .replace(/▓/g, '#').replace(/░/g, '.')
        .replace(/→/g, '->').replace(/∞/g, 'inf').replace(/…/g, '...')
        .replace(/✅/g, '[FULL]').replace(/❌/g, '[NONE]').replace(/⚠/g, '(!)');
      doc.setFontSize(6.8); doc.setFont('courier', 'normal'); doc.setTextColor(30, 30, 30);
      asciiLines.forEach(line => {
        if (y > PH - M - 10) { doc.addPage(); drawHeader(2, TOTAL_PAGES); y = M + 22; }
        doc.text(pdfSafe(asciiSanitize(line)), M, y);
        y += 3.5;
      });
    }

    // ── Calculations page ──
    doc.addPage();
    drawHeader(2, TOTAL_PAGES);
    y = M + 22;
    y = secTitle(y, _tt('iecPdfSteps', 'Step-by-Step Calculation') + '  (IEC 60909-0 / IEC 60364-4-41)');

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

    const realTotal = doc.getNumberOfPages();
    for (let p = 1; p <= realTotal; p++) {
      doc.setPage(p);
      doc.setFillColor(255, 255, 255);
      doc.rect(0, PH - M - 8, PW, 25, 'F');
      drawFooter(p, realTotal);
    }
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
let dcBatRintMode   = 'direct';  // 'direct' | 'estimate'
let dcBatEstRintMin = null;      // mΩ — populated by dcEstimateBatRint()
let dcBatEstRintMax = null;      // mΩ

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
  return 0; // SMPS / battery — bypass R_source logic
}

// ─── Battery helpers ─────────────────────────────────────────────────────────

function dcBatGetRintMin() {
  if (dcBatRintMode === 'estimate') return dcBatEstRintMin;
  return parseFloat(document.getElementById('dc-bat-rint-min')?.value) || 0;
}

function dcBatGetRintMax() {
  if (dcBatRintMode === 'estimate') return dcBatEstRintMax;
  return parseFloat(document.getElementById('dc-bat-rint-max')?.value) || 0;
}

function _dcBatApplyChemDefaults(chem) {
  const blocks = parseInt(document.getElementById('dc-bat-blocks')?.value) || 2;
  if (chem === 'lead_acid') {
    document.getElementById('dc-bat-uoc-max').value = (12.7 * blocks).toFixed(1);
    document.getElementById('dc-bat-uoc-min').value = (11.8 * blocks).toFixed(1);
  } else if (chem === 'lifepo4') {
    document.getElementById('dc-bat-uoc-max').value = '29.2';
    document.getElementById('dc-bat-uoc-min').value = '25.6';
  } else if (chem === 'nicd') {
    document.getElementById('dc-bat-uoc-max').value = '26.0';
    document.getElementById('dc-bat-uoc-min').value = '22.0';
  }
}

function dcOnBatChemChange() {
  const chem = document.getElementById('dc-bat-chem')?.value;
  if (!chem) return;
  document.getElementById('dc-bat-blocks-row').style.display = chem === 'lead_acid' ? 'block' : 'none';
  const estBtn = document.getElementById('dc-bat-rint-est-btn');
  if (chem === 'custom') {
    estBtn.disabled = true;
    // force direct input mode for custom chemistry
    const directBtn = document.querySelector('#dc-bat-rint-mode .seg-btn');
    if (directBtn) dcSetBatRintMode(directBtn, 'direct');
  } else {
    estBtn.disabled = false;
    _dcBatApplyChemDefaults(chem);
  }
  if (dcBatRintMode === 'estimate') dcEstimateBatRint();
  dcUpdateRsrcDisplay();
}

function dcOnBatBlocksChange() {
  const chem = document.getElementById('dc-bat-chem')?.value;
  if (chem !== 'lead_acid') return;
  const blocks = parseInt(document.getElementById('dc-bat-blocks')?.value) || 2;
  document.getElementById('dc-bat-uoc-max').value = (12.7 * blocks).toFixed(1);
  document.getElementById('dc-bat-uoc-min').value = (11.8 * blocks).toFixed(1);
  if (dcBatRintMode === 'estimate') dcEstimateBatRint();
  dcUpdateRsrcDisplay();
}

function dcSetBatRintMode(btn, mode) {
  const chem = document.getElementById('dc-bat-chem')?.value;
  if (chem === 'custom' && mode === 'estimate') return;
  dcBatRintMode = mode;
  btn.closest('.seg-group').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('dc-bat-rint-direct').style.display   = mode === 'direct'   ? 'block' : 'none';
  document.getElementById('dc-bat-rint-estimate').style.display = mode === 'estimate' ? 'block' : 'none';
  if (mode === 'estimate') dcEstimateBatRint();
  dcUpdateRsrcDisplay();
}

function dcEstimateBatRint() {
  const chem   = document.getElementById('dc-bat-chem')?.value;
  const c10    = parseFloat(document.getElementById('dc-bat-c10')?.value) || 0;
  const uocMax = parseFloat(document.getElementById('dc-bat-uoc-max')?.value) || 0;
  const dispEl = document.getElementById('dc-bat-est-display');
  if (!dispEl) return;

  if (chem === 'custom' || c10 <= 0 || uocMax <= 0) {
    dispEl.style.display = 'none';
    dcBatEstRintMin = null; dcBatEstRintMax = null;
    return;
  }

  let rint25C, rMinFactor, rMaxFactor;
  if (chem === 'lead_acid') {
    rint25C = uocMax / (7 * c10) * 1000;
    rMinFactor = 0.85; rMaxFactor = 2.0;
  } else if (chem === 'lifepo4') {
    rint25C = uocMax / (10 * c10) * 1000;
    rMinFactor = 0.90; rMaxFactor = 1.50;
  } else if (chem === 'nicd') {
    rint25C = uocMax / (8 * c10) * 1000;
    rMinFactor = 0.80; rMaxFactor = 1.80;
  } else { return; }

  dcBatEstRintMin = rint25C * rMinFactor;
  dcBatEstRintMax = rint25C * rMaxFactor;

  dispEl.style.display = 'block';
  dispEl.innerHTML =
    '⚠ Estimated values – verify against battery datasheet. Accuracy ±30–50%.<br>' +
    'R_int_25°C = ' + engRound(rint25C, 3) + ' mΩ → ' +
    'R_int_min = ' + engRound(dcBatEstRintMin, 3) + ' mΩ | ' +
    'R_int_max = ' + engRound(dcBatEstRintMax, 3) + ' mΩ';
  dcUpdateRsrcDisplay();
}

function dcUpdateRsrcDisplay() {
  const el  = document.getElementById('dc-rsrc-val');
  const lbl = document.getElementById('dc-rsrc-lbl');
  if (!el) return;
  if (dcSrcType === 'smps') {
    if (lbl) lbl.textContent = 'R_source =';
    el.textContent = 'N/A (SMPS)';
    return;
  }
  if (dcSrcType === 'battery') {
    if (lbl) lbl.textContent = 'R_int =';
    const rMin = dcBatGetRintMin();
    const rMax = dcBatGetRintMax();
    el.textContent = (rMin > 0 && rMax > 0)
      ? engRound(rMin, 3) + ' / ' + engRound(rMax, 3) + ' mΩ'
      : '—';
    return;
  }
  if (lbl) lbl.textContent = 'R_source =';
  const r = dcGetRsrcOhm();
  el.textContent = r > 0 ? fmtmOhm(r) : '—';
}

function dcUpdateTripHint() {
  const type = document.getElementById('dc-dev-type')?.value;
  const In   = parseFloat(document.getElementById('dc-dev-in')?.value) || 0;
  const hint = document.getElementById('dc-trip-hint');
  if (!hint) return;
  if (type === 'fuse') {
    const t  = document.getElementById('dc-disc-time')?.value || '5';
    const ka = getFuseKa(t);
    hint.textContent =
      'I_a: ' + (ka.lo * In).toFixed(0) + '…' + (ka.hi * In).toFixed(0) +
      ' A  |  I₂ = 1.6 × In = ' + (SC_FUSE_FACTOR * In).toFixed(0) + ' A (IEC 60269-2)';
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
  document.getElementById('dc-src-ik-row').style.display      = dcSrcType === 'known_ik' ? 'block' : 'none';
  document.getElementById('dc-src-r-row').style.display       = dcSrcType === 'known_r'  ? 'block' : 'none';
  document.getElementById('dc-src-smps-row').style.display    = dcSrcType === 'smps'     ? 'block' : 'none';
  document.getElementById('dc-src-battery-row').style.display = dcSrcType === 'battery'  ? 'block' : 'none';
  document.getElementById('dc-udc-row').style.display         = dcSrcType === 'battery'  ? 'none'  : 'block';
  dcUpdateRsrcDisplay();
}

function dcOnDevTypeChange() {
  const type = document.getElementById('dc-dev-type')?.value;
  const curveInner = document.getElementById('dc-curve-inner');
  const discInner  = document.getElementById('dc-disc-time-inner');
  if (curveInner) curveInner.style.display = type === 'fuse' ? 'none' : '';
  if (discInner)  discInner.style.display  = type === 'fuse' ? '' : 'none';
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
  dcOnSrcTypeChange();
  dcOnDevTypeChange();
  dcUpdateTripHint();
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

  const _valsBase = dcSrcType === 'battery' ? [S, Spe, L, In, Icu_kA] : [U_DC, S, Spe, L, In, Icu_kA];
  if (_valsBase.some(v => isNaN(v) || v <= 0)) {
    return fail('Please fill in all fields (positive values).');
  }
  if (isNaN(lpm) || lpm < 0) return fail('Cable inductance must be ≥ 0.');

  const isFuse     = devType === 'fuse';
  const curveSel   = document.getElementById('dc-dev-curve')?.value;
  const dcDiscTime = isFuse ? (document.getElementById('dc-disc-time')?.value || '5') : null;
  const dcFuseKa   = isFuse ? getFuseKa(dcDiscTime) : null;
  const tripLo     = isFuse ? dcFuseKa.lo * In : SC_CURVES[curveSel].min * In;
  const tripHi     = isFuse ? dcFuseKa.hi * In : SC_CURVES[curveSel].max * In;

  // ── SMPS mode ──────────────────────────────────────────────────────────────
  if (dcSrcType === 'smps') {
    const I_lim = parseFloat(document.getElementById('dc-i-lim').value);
    if (isNaN(I_lim) || I_lim <= 0) return fail('Enter a valid SMPS current limit.');

    const tripState = I_lim >= tripHi ? 2 : (I_lim >= tripLo ? 1 : 0);
    const curveLabel = isFuse ? 'gG fuse ≤' + dcDiscTime + 's' : SC_CURVES[curveSel].label;

    // Impedance display (cable only — R_source not applicable)
    const rhoHot = dcGetRhoHot();
    const Rcable_hot = rhoHot * L / S;
    const Rpe_hot    = rhoHot * L / Spe;
    const Rloop_min  = Rcable_hot + Rpe_hot; // source not included
    const _smpsRsrcLbl = document.getElementById('dc-r-rsrc-lbl');
    if (_smpsRsrcLbl) _smpsRsrcLbl.textContent = 'R_source';
    document.getElementById('dc-bat-warns').style.display = 'none';
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
      ...(isFuse ? [
        'Disconnection time: ≤' + dcDiscTime + ' s  (IEC 60364-4-41 §411.3.2)',
        'k_a (IEC 60269-2 Annex B):  lo=' + dcFuseKa.lo + '  hi=' + dcFuseKa.hi,
        'I_a lo (may trip):        ' + tripLo.toFixed(0) + ' A',
        'I_a hi (guaranteed trip): ' + tripHi.toFixed(0) + ' A',
        'I₂ (conventional fusing, overload): ' + (SC_FUSE_FACTOR * In).toFixed(0) + ' A  [1.6 × In, IEC 60269-2]',
      ] : [
        'May trip above:        ' + tripLo.toFixed(0) + ' A',
        'Guaranteed trip above: ' + tripHi.toFixed(0) + ' A',
      ]),
      'I_lim = ' + I_lim.toFixed(0) + ' A => ' + ['NO TRIP', 'UNCERTAIN', 'GUARANTEED TRIP'][tripState],
      '',
      'WARNING: SMPS current limit may fold back under fault.',
      'Magnetic trip not reliable — consider eFuse or verify SMPS short-circuit characteristic.',
      'L_max: not calculated in SMPS mode.',
    ];
    document.getElementById('dc-steps').textContent = lines.join('\n');
    document.getElementById('dc-res-card').style.display = 'block';
    document.getElementById('dc-res-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    window._dcLastResult = { smps: true, battery: false, U_DC, I_lim, In, Icu_kA, devType, tripState, tripLo, tripHi,
      curveLabel, exceedsIcu: false, approachingIcu: false, L_max: -1, S, Spe, L,
      Rcable_hot, Rpe_hot, dcCondTemp, dcMaterial };
    return;
  }

  // ── Battery mode ───────────────────────────────────────────────────────────
  if (dcSrcType === 'battery') {
    const uocMax    = parseFloat(document.getElementById('dc-bat-uoc-max')?.value);
    const uocMin    = parseFloat(document.getElementById('dc-bat-uoc-min')?.value);
    const rintMinMO = dcBatGetRintMin();   // mΩ
    const rintMaxMO = dcBatGetRintMax();   // mΩ
    const chem      = document.getElementById('dc-bat-chem')?.value || 'lead_acid';
    const tmin      = parseFloat(document.getElementById('dc-bat-tmin')?.value);
    const batEstimated = dcBatRintMode === 'estimate';

    if (isNaN(uocMax) || uocMax <= 0) return fail('Enter valid U_oc_max.');
    if (isNaN(uocMin) || uocMin <= 0) return fail('Enter valid U_oc_min.');
    if (uocMin >= uocMax)             return fail('U_oc_min must be less than U_oc_max.');
    if (!rintMinMO || rintMinMO <= 0) return fail(batEstimated ? 'Cannot estimate R_int — check C10 and U_oc_max.' : 'Enter valid R_int_min.');
    if (!rintMaxMO || rintMaxMO <= 0) return fail('Enter valid R_int_max.');
    if (rintMinMO >= rintMaxMO)       return fail('R_int_min must be less than R_int_max.');

    const R_int_min = rintMinMO / 1000;   // Ω
    const R_int_max = rintMaxMO / 1000;   // Ω

    const rhoRef = dcGetRhoRef();
    const rhoHot = dcGetRhoHot();

    const Rcable_max = rhoRef * L / S;
    const Rcable_hot = rhoHot * L / S;
    const Rpe_max    = rhoRef * L / Spe;
    const Rpe_hot    = rhoHot * L / Spe;

    // Ik_max: best battery (R_int_min, U_oc_max) + cold cable (20°C)
    const Rloop_max = R_int_min + Rcable_max + Rpe_max;
    // Ik_min: worst battery (R_int_max, U_oc_min) + hot cable (operating T)
    const Rloop_min = R_int_max + Rcable_hot + Rpe_hot;

    if (Rloop_max <= 0) return fail('Total loop resistance ≤ 0. Check inputs.');

    const Ik_max = uocMax / Rloop_max;
    const Ik_min = uocMin / Rloop_min;

    const L_loop_uH = 2 * lpm * L;
    const L_loop_H  = L_loop_uH * 1e-6;
    const tau_s     = L_loop_H / Rloop_max;
    const tau_ms    = tau_s * 1000;
    const tau3_ms   = 3 * tau_ms;

    const curveLabel = isFuse ? 'gG fuse ≤' + dcDiscTime + 's' : SC_CURVES[curveSel].label;
    const tripState  = Ik_min >= tripHi ? 2 : (Ik_min >= tripLo ? 1 : 0);

    const exceedsIcu     = Ik_max / 1000 > Icu_kA;
    const approachingIcu = !exceedsIcu && Ik_max / 1000 > 0.8 * Icu_kA;

    // L_max (non-linear: R_int is fixed, only cable length varies)
    // Ztarget = U_oc_min / tripHi  →  R_int_max + rho_hot*(1/S+1/Spe)*L = Ztarget
    let L_max = -1;
    const Ztarget_bat = tripHi > 0 ? uocMin / tripHi : 0;
    if (Ztarget_bat > 0) {
      const R_avail = Ztarget_bat - R_int_max;
      if (R_avail > 0) {
        const B_dc = rhoHot * (1 / S + 1 / Spe);
        L_max = R_avail / B_dc;
      } else {
        L_max = -2;  // R_int_max alone exceeds Ztarget
      }
    }

    // ── Populate results UI ──
    const fmtA = v => v >= 1000 ? engRound(v / 1000, 3) + ' kA' : engRound(v, 3) + ' A';
    const rsrcLbl = document.getElementById('dc-r-rsrc-lbl');
    if (rsrcLbl) rsrcLbl.textContent = 'R_int_min / R_int_max';
    document.getElementById('dc-r-rsrc').textContent   = engRound(rintMinMO, 3) + ' / ' + engRound(rintMaxMO, 3) + ' mΩ';
    document.getElementById('dc-r-rcable').textContent = fmtmOhm(Rcable_hot);
    document.getElementById('dc-r-rpe').textContent    = fmtmOhm(Rpe_hot);
    document.getElementById('dc-r-rloop').textContent  = fmtmOhm(Rloop_min);
    document.getElementById('dc-r-ik-max').textContent = fmtA(Ik_max);
    document.getElementById('dc-r-ik-min').textContent = fmtA(Ik_min);
    document.getElementById('dc-r-tau').textContent    = engRound(tau_ms, 3) + ' ms';
    document.getElementById('dc-r-3tau').textContent   = engRound(tau3_ms, 3) + ' ms';

    _dcSetTripBox(tripState, Ik_min, Ik_max, tripLo, tripHi);
    document.getElementById('dc-smps-warn').style.display = 'none';

    const icuBox  = document.getElementById('dc-icu-box');
    const icuWarn = document.getElementById('dc-icu-warn');
    icuBox.style.display  = exceedsIcu     ? 'block' : 'none';
    icuWarn.style.display = approachingIcu ? 'block' : 'none';
    if (exceedsIcu)     icuBox.innerHTML  = '⚠ <strong>Ik_max = ' + fmtA(Ik_max) + ' > Icu_DC = ' + Icu_kA + ' kA</strong> — DC breaking capacity EXCEEDED!';
    if (approachingIcu) icuWarn.innerHTML = '⚠ Ik_max = ' + fmtA(Ik_max) + ' > 80% of Icu_DC = ' + Icu_kA + ' kA — consider higher-rated device.';

    // Battery-specific warnings
    const batWarns = document.getElementById('dc-bat-warns');
    const warnParts = [];
    if (batEstimated) warnParts.push('⚠ Estimation only – obtain R_int from datasheet or measure with battery impedance tester (e.g. Hioki BT3554).');
    if (chem === 'lead_acid' && !isNaN(tmin) && tmin < 0) warnParts.push('⚠ Lead-acid R_int at sub-zero temperatures may exceed estimates. Consider heated battery enclosure.');
    if (Ik_max > 500) warnParts.push('⚠ High prospective short-circuit current from battery (Ik_max > 500 A). Verify DC Icu rating of protective device includes battery source contribution.');
    if (batWarns) {
      batWarns.style.display = warnParts.length ? 'block' : 'none';
      batWarns.innerHTML = warnParts.map(w => '<div class="sc-icu-warn" style="margin-top:4px">' + w + '</div>').join('');
    }

    // Max cable length
    const mlBox = document.getElementById('dc-maxlen-box');
    if (L_max > 0) {
      mlBox.textContent = engRound(L_max, 3) + ' m';
      mlBox.className   = 'sc-maxlen-box ' + (L > L_max ? 'sc-maxlen-warn' : 'sc-maxlen-ok');
      if (L > L_max) mlBox.textContent += '  ⚠ Current cable (' + L + ' m) exceeds max length!';
    } else if (L_max === -2) {
      mlBox.textContent = 'Source R_int_max alone exceeds target — guaranteed trip not achievable regardless of cable length. Use higher-rated device or increase conductor cross-section.';
      mlBox.className   = 'sc-maxlen-box sc-maxlen-warn';
    } else {
      mlBox.textContent = 'Cannot calculate — check inputs';
      mlBox.className   = 'sc-maxlen-box sc-maxlen-warn';
    }

    // ── Step-by-step ──
    const fmtO  = v => engRound(v, 3) + ' Ohm';
    const fmtmO = v => engRound(v * 1000, 3) + ' mOhm';
    const CHEM_NAME = { lead_acid: 'Lead-acid (VRLA/AGM/Gel)', lifepo4: 'LiFePO4', nicd: 'NiCd', custom: 'Custom' };
    const batRintSrc = batEstimated ? 'estimated' : 'datasheet';
    const c10 = parseFloat(document.getElementById('dc-bat-c10')?.value) || 0;

    const batLines = [
      '=== Battery source parameters ===',
      'Chemistry: ' + (CHEM_NAME[chem] || chem),
      'U_oc_max = ' + uocMax + ' V  (100% SoC)',
      'U_oc_min = ' + uocMin + ' V  (minimum SoC)',
      'R_int_min = ' + fmtmO(R_int_min) + '  (source: ' + batRintSrc + ')',
      'R_int_max = ' + fmtmO(R_int_max) + '  (source: ' + batRintSrc + ')',
    ];

    if (batEstimated && c10 > 0) {
      batLines.push('');
      batLines.push('=== R_int estimation from capacity ===');
      if (chem === 'lead_acid') {
        const r25 = uocMax / (7 * c10) * 1000;
        batLines.push('C10 = ' + c10 + ' Ah');
        batLines.push('R_int_25C = U_oc_max / (7 * C10) * 1000 = ' + uocMax + ' / (7 * ' + c10 + ') * 1000 = ' + engRound(r25, 3) + ' mOhm');
        batLines.push('R_int_min = R_int_25C * 0.85 = ' + engRound(r25 * 0.85, 3) + ' mOhm  (warm 40C, full SoC)');
        batLines.push('R_int_max = R_int_25C * 2.0  = ' + engRound(r25 * 2.0, 3) + ' mOhm  (cold -10C, low SoC)');
      } else if (chem === 'lifepo4') {
        const r25 = uocMax / (10 * c10) * 1000;
        batLines.push('C10 = ' + c10 + ' Ah');
        batLines.push('R_int_25C = U_oc_max / (10 * C10) * 1000 = ' + uocMax + ' / (10 * ' + c10 + ') * 1000 = ' + engRound(r25, 3) + ' mOhm');
        batLines.push('R_int_min = R_int_25C * 0.90 = ' + engRound(r25 * 0.90, 3) + ' mOhm  (40C)');
        batLines.push('R_int_max = R_int_25C * 1.50 = ' + engRound(r25 * 1.50, 3) + ' mOhm  (-10C)');
      } else if (chem === 'nicd') {
        const r25 = uocMax / (8 * c10) * 1000;
        batLines.push('C10 = ' + c10 + ' Ah');
        batLines.push('R_int_25C = U_oc_max / (8 * C10) * 1000 = ' + uocMax + ' / (8 * ' + c10 + ') * 1000 = ' + engRound(r25, 3) + ' mOhm');
        batLines.push('R_int_min = R_int_25C * 0.80 = ' + engRound(r25 * 0.80, 3) + ' mOhm');
        batLines.push('R_int_max = R_int_25C * 1.80 = ' + engRound(r25 * 1.80, 3) + ' mOhm');
      }
      batLines.push('WARNING: Estimated values – verify against battery datasheet. Accuracy +/-30-50%.');
    }

    batLines.push('');
    batLines.push('=== Cable parameters (DC — resistive only, no reactance) ===');
    batLines.push('Material: ' + dcMaterial.toUpperCase() + '   Temp (max Ik): 20 C   Temp (min Ik): ' + dcCondTemp + ' C');
    batLines.push('rho_ref (20C) = ' + engRound(rhoRef, 4) + ' Ohm*mm2/m');
    batLines.push('rho_hot (' + dcCondTemp + 'C) = ' + engRound(rhoHot, 4) + ' Ohm*mm2/m');
    batLines.push('S = ' + S + ' mm2   Spe = ' + Spe + ' mm2   L = ' + L + ' m');
    batLines.push('l\' = ' + lpm + ' uH/m');
    batLines.push('');
    batLines.push('=== Battery fault current calculation ===');
    batLines.push('--- For Ik_max (best battery + cold cable 20C) ---');
    batLines.push('Rcable_max(20C) = ' + fmtmO(Rcable_max) + '   Rpe_max(20C) = ' + fmtmO(Rpe_max));
    batLines.push('R_loop_max = R_int_min + Rcable_max + Rpe_max');
    batLines.push('           = ' + fmtmO(R_int_min) + ' + ' + fmtmO(Rcable_max) + ' + ' + fmtmO(Rpe_max) + ' = ' + fmtmO(Rloop_max));
    batLines.push('Ik_max = U_oc_max / R_loop_max = ' + uocMax + ' / ' + fmtO(Rloop_max) + ' = ' + fmtA(Ik_max));
    batLines.push('');
    batLines.push('--- For Ik_min (worst battery + hot cable ' + dcCondTemp + 'C) ---');
    batLines.push('Rcable_hot(' + dcCondTemp + 'C) = ' + fmtmO(Rcable_hot) + '   Rpe_hot = ' + fmtmO(Rpe_hot));
    batLines.push('R_loop_min = R_int_max + Rcable_hot + Rpe_hot');
    batLines.push('           = ' + fmtmO(R_int_max) + ' + ' + fmtmO(Rcable_hot) + ' + ' + fmtmO(Rpe_hot) + ' = ' + fmtmO(Rloop_min));
    batLines.push('Ik_min = U_oc_min / R_loop_min = ' + uocMin + ' / ' + fmtO(Rloop_min) + ' = ' + fmtA(Ik_min));
    batLines.push('');
    batLines.push('=== Time constant (informational only) ===');
    batLines.push('L_loop = 2 * l\' * L = 2 * ' + lpm + ' uH/m * ' + L + ' m = ' + engRound(L_loop_uH, 3) + ' uH');
    batLines.push('tau = L_loop / R_loop_max = ' + engRound(L_loop_uH, 3) + ' uH / ' + fmtO(Rloop_max) + ' = ' + engRound(tau_ms, 3) + ' ms');
    batLines.push('95% of Ik_max reached in ~3*tau = ' + engRound(tau3_ms, 3) + ' ms');
    batLines.push('');
    batLines.push('=== Trip verification ===');
    batLines.push('Device: ' + devType.toUpperCase() + '   In = ' + In + ' A   Curve: ' + curveLabel);
    if (isFuse) {
      batLines.push('Disconnection time: ≤' + dcDiscTime + ' s  (IEC 60364-4-41 §411.3.2)');
      batLines.push('k_a (IEC 60269-2 Annex B):  lo=' + dcFuseKa.lo + '  hi=' + dcFuseKa.hi);
      batLines.push('I_a lo (may trip):        ' + tripLo.toFixed(0) + ' A');
      batLines.push('I_a hi (guaranteed trip): ' + tripHi.toFixed(0) + ' A');
      batLines.push('I₂ (conventional fusing, overload): ' + (SC_FUSE_FACTOR * In).toFixed(0) + ' A  [1.6 × In, IEC 60269-2]');
    } else {
      batLines.push('May trip above:        ' + tripLo.toFixed(0) + ' A');
      batLines.push('Guaranteed trip above: ' + tripHi.toFixed(0) + ' A');
    }
    batLines.push('Ik_min = ' + fmtA(Ik_min) + '   =>   ' + ['NO TRIP', 'UNCERTAIN (transition band)', 'GUARANTEED TRIP'][tripState]);
    batLines.push('');
    batLines.push('=== Breaking capacity ===');
    batLines.push('Ik_max = ' + fmtA(Ik_max) + '   Icu_DC = ' + Icu_kA + ' kA   =>   ' + (exceedsIcu ? 'EXCEEDED!' : (approachingIcu ? 'WARNING: > 80% of Icu_DC' : 'OK')));
    batLines.push('');
    batLines.push('=== Maximum cable length (guaranteed trip, worst battery + hot cable) ===');
    batLines.push('Ztarget = U_oc_min / tripHi = ' + uocMin + ' / ' + tripHi.toFixed(0) + ' = ' + fmtO(Ztarget_bat));
    batLines.push('R_cable_available = Ztarget - R_int_max = ' + fmtO(Ztarget_bat) + ' - ' + fmtmO(R_int_max) + ' = ' + (Ztarget_bat - R_int_max > 0 ? fmtO(Ztarget_bat - R_int_max) : 'NEGATIVE'));
    if (L_max > 0) {
      batLines.push('B = rho_hot * (1/S + 1/Spe) = ' + engRound(rhoHot * (1 / S + 1 / Spe), 4) + ' Ohm/m');
      batLines.push('L_max = R_cable_available / B = ' + engRound(L_max, 3) + ' m   [actual L = ' + L + ' m => ' + (L > L_max ? 'EXCEEDED' : 'OK') + ']');
    } else {
      batLines.push('R_int_max alone exceeds Ztarget — guaranteed trip not achievable regardless of cable length.');
      batLines.push('Use higher-rated device or increase conductor cross-section.');
    }
    batLines.push('');
    batLines.push('Resistive method. IEC 61660-1 applies to auxiliary DC installations.');
    batLines.push('Battery R_int values must be verified against manufacturer datasheet at rated conditions.');

    document.getElementById('dc-steps').textContent = batLines.join('\n');
    document.getElementById('dc-res-card').style.display = 'block';
    document.getElementById('dc-res-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    window._dcLastResult = {
      battery: true, smps: false,
      chem, uocMax, uocMin, rintMinMO, rintMaxMO, R_int_min, R_int_max,
      batEstimated, batRintSrc, tmin,
      S, Spe, L, lpm, In, Icu_kA, devType, curveLabel,
      rhoRef, rhoHot, dcCondTemp, dcMaterial,
      Rcable_max, Rcable_hot, Rpe_max, Rpe_hot,
      Rloop_max, Rloop_min, Ik_max, Ik_min,
      tau_ms, tau3_ms, L_loop_uH,
      tripState, tripLo, tripHi, exceedsIcu, approachingIcu, L_max,
      srcStr: 'Battery (' + (CHEM_NAME[chem] || chem) + ') U_oc_max=' + uocMax + 'V R_int_min=' + engRound(rintMinMO, 3) + 'mOhm',
    };
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
  const _rsrcLbl = document.getElementById('dc-r-rsrc-lbl');
  if (_rsrcLbl) _rsrcLbl.textContent = 'R_source';
  document.getElementById('dc-bat-warns').style.display = 'none';
  document.getElementById('dc-r-rsrc').textContent   = fmtmOhm(R_source);
  document.getElementById('dc-r-rcable').textContent = fmtmOhm(Rcable_hot);
  document.getElementById('dc-r-rpe').textContent    = fmtmOhm(Rpe_hot);
  document.getElementById('dc-r-rloop').textContent  = fmtmOhm(Rloop_min);

  const fmtA = v => v >= 1000 ? engRound(v / 1000, 3) + ' kA' : engRound(v, 3) + ' A';
  document.getElementById('dc-r-ik-max').textContent = fmtA(Ik_max);
  document.getElementById('dc-r-ik-min').textContent = fmtA(Ik_min);
  document.getElementById('dc-r-tau').textContent    = engRound(tau_ms, 3) + ' ms';
  document.getElementById('dc-r-3tau').textContent   = engRound(tau3_ms, 3) + ' ms';

  const curveLabel = isFuse ? 'gG fuse ≤' + dcDiscTime + 's' : SC_CURVES[curveSel].label;
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
    ...(isFuse ? [
      'Disconnection time: ≤' + dcDiscTime + ' s  (IEC 60364-4-41 §411.3.2)',
      'k_a (IEC 60269-2 Annex B):  lo=' + dcFuseKa.lo + '  hi=' + dcFuseKa.hi,
      'I_a lo (may trip):        ' + tripLo.toFixed(0) + ' A',
      'I_a hi (guaranteed trip): ' + tripHi.toFixed(0) + ' A  [used for L_max]',
      'I₂ (conventional fusing, overload): ' + (SC_FUSE_FACTOR * In).toFixed(0) + ' A  [1.6 × In, IEC 60269-2]',
    ] : [
      'May trip above (lower bound):      ' + tripLo.toFixed(0) + ' A',
      'Guaranteed trip (upper bound): ' + tripHi.toFixed(0) + ' A',
    ]),
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
    battery: false, smps: false, U_DC, R_source, S, Spe, L, lpm, In, Icu_kA, devType, curveLabel,
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

    const engineer = document.getElementById('dc-engineer')?.value.trim() || '';

    function drawHeader(pageNum, totalPages) {
      pdfMakeHeader(doc, { PW, M, title: _tt('dcPdfTitle', 'Short-Circuit Calculation (DC)') });
      drawFooter(pageNum, totalPages);
    }

    function drawFooter(pageNum, totalPages) {
      pdfMakeFooter(doc, { PW, PH, M, pageNum, totalPages, engineer, standard: 'IEC 61660-1 / IEC 60364-4-41' });
    }

    function secTitle(y, title) {
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...ACC);
      doc.text(pdfSafe(title), M, y);
      doc.setDrawColor(220, 222, 226); doc.setLineWidth(0.3);
      doc.line(M + doc.getTextWidth(pdfSafe(title)) + 3, y - 1, PW - M, y - 1);
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
    const PDF_CHEM = { lead_acid: 'Lead-acid (VRLA/AGM/Gel)', lifepo4: 'LiFePO4', nicd: 'NiCd', custom: 'Custom' };

    // ── Input rows ──
    const _cableRows = [
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
    const inputRows = r.battery ? [
      ['Source type', 'Battery (' + pdfSafe(PDF_CHEM[r.chem] || r.chem) + ')'],
      ['U_oc_max (100% SoC)', r.uocMax + ' V'],
      ['U_oc_min (min. SoC)', r.uocMin + ' V'],
      ['R_int_min (' + r.batRintSrc + ')', engRound(r.rintMinMO, 3) + ' mOhm'],
      ['R_int_max (' + r.batRintSrc + ')', engRound(r.rintMaxMO, 3) + ' mOhm'],
      ..._cableRows,
    ] : [
      ['Supply voltage U_DC', r.U_DC + ' V'],
      ['Source type', r.srcStr || (r.smps ? 'SMPS' : '—')],
      ..._cableRows,
    ];

    const TOTAL_PAGES = 2;
    drawHeader(1, TOTAL_PAGES);
    let y = M + 22;

    y = secTitle(y, _tt('iecPdfInputs', 'Input Parameters'));
    y = inputTable(y, inputRows);
    y += 6;

    // ── Results summary ──
    y = secTitle(y, _tt('dcPdfResults', 'DC Results'));

    if (r.smps) {
      doc.setFillColor(255, 245, 220); doc.setDrawColor(200, 130, 0); doc.setLineWidth(0.5);
      doc.rect(M, y, CW, 12, 'FD');
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(160, 100, 0);
      doc.text('SMPS Mode: Current limited. Resistive Ik not calculated.', PW/2, y+7.5, {align:'center'});
      y += 14;
    } else {
      // Resistance bar
      const impH = 14, colW4 = CW / 4;
      const impItems = r.battery ? [
        ['R_int_min / R_int_max', pdfSafe(engRound(r.rintMinMO, 3) + ' / ' + engRound(r.rintMaxMO, 3) + ' mOhm')],
        ['Rcable (hot)', fmtmO(r.Rcable_hot)],
        ['Rpe (hot)', fmtmO(r.Rpe_hot)],
        ['Rloop_min (worst)', fmtmO(r.Rloop_min)],
      ] : [
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
        { lbl: r.battery ? 'Ik_max (U_oc_max, R_int_min, 20°C)' : 'Ik_max (cold, 20°C)', val: fmtA(r.Ik_max), hl: false },
        { lbl: r.battery ? 'Ik_min (U_oc_min, R_int_max, ' + r.dcCondTemp + '°C)' : 'Ik_min (hot, ' + r.dcCondTemp + '°C)', val: fmtA(r.Ik_min), hl: true },
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
      // Battery warnings
      if (r.battery) {
        const batWarnPdf = [];
        batWarnPdf.push('Battery R_int increases with age (lead-acid: up to 2x at end of life). Re-verify after replacement.');
        if (r.batEstimated) batWarnPdf.push('Estimated R_int used — verify against datasheet or measure with impedance tester.');
        if (r.chem === 'lead_acid' && !isNaN(r.tmin) && r.tmin < 0) batWarnPdf.push('Sub-zero T_min: lead-acid R_int may exceed estimate. Consider heated enclosure.');
        if (r.Ik_max > 500) batWarnPdf.push('Ik_max > 500 A — verify DC Icu rating of protective device includes battery contribution.');
        const wH = 5 + batWarnPdf.length * 5;
        doc.setFillColor(255,245,220); doc.setDrawColor(200,130,0); doc.setLineWidth(0.4);
        doc.rect(M, y, CW, wH, 'FD');
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(160,100,0);
        batWarnPdf.forEach((ln, i) => doc.text(pdfSafe((i === 0 ? 'Battery: ' : '') + ln), M+3, y + 5 + i * 5, {maxWidth: CW-6}));
        y += wH + 2;
      }
      // L_max
      const mlOk = r.L_max > 0 && r.L <= r.L_max;
      doc.setFillColor(245,247,250); doc.setDrawColor(200,210,225); doc.setLineWidth(0.2);
      doc.rect(M, y, CW, 10, 'FD');
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80,80,80);
      doc.text('Max. cable length (guaranteed trip):', M+3, y+6.5);
      doc.setFont('helvetica','bold'); doc.setTextColor(mlOk?0:180, mlOk?160:100, mlOk?80:0);
      doc.text(r.L_max > 0 ? engRound(r.L_max, 3) + ' m' : (r.L_max === -2 ? 'Not achievable' : 'N/A'), M+CW-3, y+6.5, {align:'right'});
      y += 10;
    }

    // ── PAGE 2: Step-by-step ──
    doc.addPage();
    drawHeader(2, TOTAL_PAGES);
    y = M + 22;
    y = secTitle(y, _tt('iecPdfSteps', 'Step-by-Step Calculation') + '  (IEC 61660-1 / Resistive method)');

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

    const realTotal = doc.getNumberOfPages();
    for (let p = 1; p <= realTotal; p++) {
      doc.setPage(p);
      doc.setFillColor(255, 255, 255);
      doc.rect(0, PH - M - 8, PW, 25, 'F');
      drawFooter(p, realTotal);
    }
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
