/* =====================================================================
   IEC Wire Sizing Calculator — IEC 60364-5-52 / IEC 60228 / IEC 60364-5-54
   Provides: iecCalculate, iecSetSystem, iecSetMaterial, iecSetInsul,
             iecSetPeMethod, iecDownloadPdf
   Uses helpers from core.js: mm2ToAwg, MM2_STD, getDerating (not used)
   Uses helpers from pdf.js:  pdfSafe, pdfMakeHeader, pdfMakeFooter
   ===================================================================== */

/* ─── IEC 60364-5-52 Annex B — current-carrying capacity tables (A) ──────
   Reference: 30 °C ambient air (D1 = 20 °C ground), copper. PVC70 = 70 °C
   insulation (Tables B.52.2 / B.52.4); XLPE/EPR = 90 °C (B.52.5 / B.52.13).
   Aluminium values are derived from copper × 0.78 (IEC 60228 conductivity
   ratio) — for design-grade work cross-check with the published Al tables. */
const IEC_SIZES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630];

const IEC_AMP_CU = {
  pvc70: {
    /* PVC 70 °C — copper, 2 loaded conductors (single-phase) */
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
    /* PVC 70 °C — copper, 3 loaded conductors (three-phase or L+N+PE) */
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
    /* XLPE / EPR 90 °C — copper, 2 loaded conductors */
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
    /* XLPE / EPR 90 °C — copper, 3 loaded conductors */
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

/* Aluminium — derived from Cu × 0.78 (per IEC 60228 conductivity ratio).
   Acceptable for prelim sizing; cross-check with IEC 60364-5-52 Tab. B.52.4
   (PVC) / B.52.5 (XLPE) for design submissions.                            */
const IEC_AL_FACTOR = 0.78;

/* ─── IEC 60364-5-52 — correction factors ──────────────────────────────── */
const IEC_CA = {
  /* Table B.52.14 — ambient air, PVC 70 °C insulation */
  pvc70: {10:1.22, 15:1.17, 20:1.12, 25:1.06, 30:1.00, 35:0.94, 40:0.87, 45:0.79, 50:0.71, 55:0.61, 60:0.50},
  /* Table B.52.14 — ambient air, XLPE/EPR 90 °C insulation */
  xlpe90: {10:1.15, 15:1.12, 20:1.08, 25:1.04, 30:1.00, 35:0.96, 40:0.91, 45:0.87, 50:0.82, 55:0.76, 60:0.71},
};

/* Table B.52.17 (grouped circuits) — conservative single-curve approximation */
const IEC_CG = {1:1.00, 2:0.80, 3:0.70, 4:0.65, 5:0.60, 6:0.57, 7:0.54, 8:0.52, 9:0.50, 12:0.45, 16:0.41, 20:0.38};

/* Adiabatic factor k (IEC 60364-5-54 Table 54.3) */
const IEC_K_ADI = {
  pvc70:  {cu: 115, al: 76},
  xlpe90: {cu: 143, al: 94},
};

/* Resistivity (IEC 60228 Annex B) — Ω·mm²/m at 20 °C; α = T-coeff */
const IEC_RHO20 = {cu: 0.017241, al: 0.028264};
const IEC_ALPHA = {cu: 0.00393,  al: 0.00403};

/* Cable reactance per IEC 60909 / typical LV (mΩ/m, line-to-neutral) */
const IEC_X_PER_M = 0.08e-3;

/* ─── Module state ─────────────────────────────────────────────────────── */
let _iecSys = '1ph';   // 'dc' | '1ph' | '3ph'
let _iecMat = 'cu';    // 'cu' | 'al'
let _iecIns = 'pvc70'; // 'pvc70' | 'xlpe90'
let _iecPe  = 'simplified';
let _iecLastResult = null;

/* ─── UI handlers (segmented buttons) ──────────────────────────────────── */
function iecSetSystem(btn, v) {
  _iecSys = v;
  btn.parentElement.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // cosφ irrelevant for DC
  const cf = document.getElementById('iec-cosphi-fld');
  if (cf) cf.style.opacity = v === 'dc' ? 0.4 : 1;
  // Default voltage suggestion
  const V = document.getElementById('iec-voltage');
  if (V && document.activeElement !== V) {
    if (v === 'dc'  && (+V.value === 230 || +V.value === 400)) V.value = 24;
    if (v === '1ph' && (+V.value === 24  || +V.value === 400)) V.value = 230;
    if (v === '3ph' && (+V.value === 24  || +V.value === 230)) V.value = 400;
  }
  // Loaded-conductor default
  const cc = document.getElementById('iec-conductors');
  if (cc) cc.value = (v === '3ph') ? '3' : '2';
}

function iecSetMaterial(btn, v) {
  _iecMat = v;
  btn.parentElement.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function iecSetInsul(btn, v) {
  _iecIns = v;
  btn.parentElement.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function iecSetPeMethod(btn, v) {
  _iecPe = v;
  btn.parentElement.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const row = document.getElementById('iec-pe-adi-row');
  if (row) row.style.display = (v === 'adiabatic') ? 'block' : 'none';
}

/* ─── Method-hint update on dropdown change ────────────────────────────── */
const IEC_METHOD_HINTS = {
  A1: 'A1 — vodiče v trubce v izolované zdi',
  A2: 'A2 — vícežilový kabel v trubce v izolované zdi',
  B1: 'B1 — vodiče v trubce na zdi',
  B2: 'B2 — vícežilový kabel v trubce na zdi',
  C : 'C — kabel na zdi nebo na neperforovaném žlabu',
  D1: 'D1 — vícežilový kabel přímo v zemi / v trubce v zemi',
  E : 'E — vícežilový kabel na perforovaném žlabu / v žebřinovém roštu',
  F : 'F — jednožilové kabely v dotyku, perforovaný žlab',
  G : 'G — jednožilové kabely s rozestupem, perforovaný žlab',
};

/* ─── Lookup helpers ───────────────────────────────────────────────────── */
function iecLookupAmp(ins, mat, conds, method, sizeIdx) {
  const tbl = IEC_AMP_CU[ins]?.[String(conds)]?.[method];
  if (!tbl || sizeIdx < 0 || sizeIdx >= tbl.length) return null;
  const v = tbl[sizeIdx];
  return mat === 'al' ? v * IEC_AL_FACTOR : v;
}

function iecGetCa(ins, Tamb) {
  const t = IEC_CA[ins];
  if (!t) return 1.0;
  if (t[Tamb] != null) return t[Tamb];
  // linear interpolate fallback (not strictly per IEC but safe)
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

function iecGetCg(group) {
  if (IEC_CG[group] != null) return IEC_CG[group];
  const keys = Object.keys(IEC_CG).map(Number).sort((a, b) => a - b);
  if (group <= keys[0]) return IEC_CG[keys[0]];
  if (group >= keys[keys.length - 1]) return IEC_CG[keys[keys.length - 1]];
  for (let i = 0; i < keys.length - 1; i++) {
    if (group >= keys[i] && group <= keys[i + 1]) {
      const r = (group - keys[i]) / (keys[i + 1] - keys[i]);
      return IEC_CG[keys[i]] + r * (IEC_CG[keys[i + 1]] - IEC_CG[keys[i]]);
    }
  }
  return 1.0;
}

/* ─── Voltage drop helper ──────────────────────────────────────────────── */
function iecVoltageDrop({system, I, R_ohm_per_m, X_ohm_per_m, cosphi, L}) {
  const sinphi = Math.sin(Math.acos(Math.min(Math.max(cosphi, 0), 1)));
  if (system === 'dc' || system === '1ph') {
    return { V: I * R_ohm_per_m * 2 * L,
             formula: 'ΔU = 2 · I · R · L' };
  }
  return { V: Math.sqrt(3) * I * (R_ohm_per_m * cosphi + X_ohm_per_m * sinphi) * L,
           formula: 'ΔU = √3 · I · (R·cosφ + X·sinφ) · L' };
}

/* ─── Main calculation ─────────────────────────────────────────────────── */
function iecCalculate() {
  const errBox = document.getElementById('iec-err');
  errBox.style.display = 'none';
  errBox.textContent = '';

  // Inputs
  const I  = +document.getElementById('iec-current').value;
  const U  = +document.getElementById('iec-voltage').value;
  const L  = +document.getElementById('iec-length').value;
  const cosphi = +document.getElementById('iec-cosphi').value || 0.85;
  const maxVdPct = +document.getElementById('iec-max-vd').value;
  const method = document.getElementById('iec-method').value;
  const conds = document.getElementById('iec-conductors').value;
  const Tamb  = +document.getElementById('iec-tamb').value;
  const group = +document.getElementById('iec-grouping').value;

  if (!(I > 0) || !(U > 0) || !(L > 0)) {
    errBox.textContent = T?.[lang]?.iecErrInputs ?? 'Vyplňte platné hodnoty I, U a L.';
    errBox.style.display = 'block';
    return;
  }
  if (!(maxVdPct > 0 && maxVdPct < 100)) {
    errBox.textContent = T?.[lang]?.iecErrVd ?? 'Povolený úbytek napětí mimo rozsah.';
    errBox.style.display = 'block';
    return;
  }

  // 1. Correction factors
  const Ca = iecGetCa(_iecIns, Tamb);
  const Cg = iecGetCg(group);
  const Ctot = Ca * Cg;
  if (Ctot <= 0) {
    errBox.textContent = 'Faktor korekce <= 0.';
    errBox.style.display = 'block';
    return;
  }

  // 2. Required base ampacity (with corrections)
  const I_required_base = I / Ctot;

  // 3. Pick smallest standard size whose corrected ampacity ≥ Ib
  let sizeIdx = -1, Iz_base = null, Iz_corr = null;
  for (let i = 0; i < IEC_SIZES.length; i++) {
    const a = iecLookupAmp(_iecIns, _iecMat, conds, method, i);
    if (a == null) continue;
    if (a >= I_required_base) {
      sizeIdx = i; Iz_base = a; Iz_corr = a * Ctot;
      break;
    }
  }
  let extrapWarn = '';
  if (sizeIdx < 0) {
    sizeIdx = IEC_SIZES.length - 1;
    Iz_base = iecLookupAmp(_iecIns, _iecMat, conds, method, sizeIdx);
    Iz_corr = Iz_base * Ctot;
    extrapWarn = `⚠ Návrhový proud ${I.toFixed(1)} A přesahuje největší tabulkovou hodnotu (` +
                 `${Iz_corr.toFixed(1)} A pro ${IEC_SIZES[sizeIdx]} mm² po korekcích). ` +
                 `Použijte paralelní vodiče nebo vyšší zatížitelnost.`;
  }

  // 4. Voltage-drop check — at conductor max temp, iterate up if VD fails
  const Tmax = (_iecIns === 'pvc70') ? 70 : 90;
  const rho = IEC_RHO20[_iecMat] * (1 + IEC_ALPHA[_iecMat] * (Tmax - 20)); // Ω·mm²/m
  const X = IEC_X_PER_M; // Ω/m

  function vdAt(idx) {
    const A = IEC_SIZES[idx];
    const R = rho / A; // Ω/m
    const r = iecVoltageDrop({system: _iecSys, I, R_ohm_per_m: R, X_ohm_per_m: X, cosphi, L});
    return { idx, A, R, V: r.V, pct: (r.V / U) * 100, formula: r.formula };
  }

  const vdIters = [];
  let cur = vdAt(sizeIdx); vdIters.push(cur);
  let finalIdx = sizeIdx;
  if (cur.pct > maxVdPct) {
    for (let i = sizeIdx + 1; i < IEC_SIZES.length; i++) {
      cur = vdAt(i); vdIters.push(cur);
      if (cur.pct <= maxVdPct) { finalIdx = i; break; }
    }
    if (cur.pct > maxVdPct) {
      finalIdx = IEC_SIZES.length - 1;
      extrapWarn += (extrapWarn ? ' ' : '') +
        `⚠ Úbytek napětí překračuje ${maxVdPct}% i pro největší standardní průřez ` +
        `${IEC_SIZES[finalIdx]} mm² — zkraťte vedení nebo zvyšte napětí.`;
    }
  } else {
    finalIdx = sizeIdx;
  }

  const finalSize = IEC_SIZES[finalIdx];
  const finalIzBase = iecLookupAmp(_iecIns, _iecMat, conds, method, finalIdx);
  const finalIzCorr = finalIzBase * Ctot;
  const finalVd = vdAt(finalIdx);

  // 5. Power loss at recommended size
  const nCond = (_iecSys === '3ph') ? 3 : 2;
  const Ploss = I * I * (rho / finalSize) * nCond * L;

  // 6. PE conductor
  let peSize, peCalc;
  if (_iecPe === 'simplified') {
    let raw;
    if (finalSize <= 16) raw = finalSize;
    else if (finalSize <= 35) raw = 16;
    else raw = finalSize / 2;
    peSize = MM2_STD.find(s => s >= raw) ?? MM2_STD[MM2_STD.length - 1];
    peCalc = `IEC 60364-5-54 Tab. 54.2: S_phase = ${finalSize} mm² → S_PE_min = ${raw} mm² → standard ${peSize} mm²`;
  } else {
    const Ik = (+document.getElementById('iec-ik').value || 0) * 1000;
    const t  = +document.getElementById('iec-tdis').value || 0;
    if (!(Ik > 0) || !(t > 0)) {
      errBox.textContent = 'Pro adiabatickou metodu zadejte Ik (kA) a t (s).';
      errBox.style.display = 'block';
      return;
    }
    const k = IEC_K_ADI[_iecIns][_iecMat];
    const raw = Math.sqrt(Ik * Ik * t) / k;
    peSize = MM2_STD.find(s => s >= raw) ?? MM2_STD[MM2_STD.length - 1];
    peCalc = `IEC 60364-5-54 §543.1.2 (adiabatic): S = √(I²·t)/k = √(${Ik.toFixed(0)}²·${t}) / ${k} = ${raw.toFixed(2)} → ${peSize} mm²`;
  }

  // 7. AWG
  const awg = mm2ToAwg(finalSize);

  // 8. Stash + render
  const result = {
    I, U, L, cosphi, maxVdPct,
    system: _iecSys, mat: _iecMat, ins: _iecIns,
    method, conds: +conds, Tamb, group,
    Ca, Cg, Ctot,
    sizeIdx, sizeAmpFirst: IEC_SIZES[sizeIdx], Iz_base, Iz_corr,
    finalSize, finalIzBase, finalIzCorr,
    rho, R: rho / finalSize, X, Tmax,
    vd: finalVd, vdIters,
    Ploss, nCond,
    peMethod: _iecPe, peSize, peCalc,
    awg, extrapWarn,
  };
  _iecLastResult = result;
  iecRender(result);
}

/* ─── Renderers ────────────────────────────────────────────────────────── */
function iecRender(r) {
  const wrap = document.getElementById('iec-results');
  const body = document.getElementById('iec-results-body');
  wrap.style.display = 'block';

  const vdPass = r.vd.pct <= r.maxVdPct;
  const margin = ((r.finalIzCorr - r.I) / r.I * 100);

  let html = '';

  // RECOMMENDED SIZE
  html += `<div class="iec-card iec-card-rec">`;
  html += `  <div class="iec-card-hdr">📐 Doporučený průřez fáze</div>`;
  html += `  <div class="iec-big">${fmtMm2(r.finalSize)} mm² <span class="iec-sub">(${fmtAwg(Math.round(r.awg))})</span></div>`;
  html += `  <table class="iec-tbl">`;
  html += `    <tr><td>Iz (z tab., metoda ${r.method})</td><td>${r.finalIzBase.toFixed(1)} A</td></tr>`;
  html += `    <tr><td>Ca (Ta = ${r.Tamb} °C, ${r.ins === 'pvc70' ? 'PVC' : 'XLPE'})</td><td>× ${r.Ca.toFixed(2)}</td></tr>`;
  html += `    <tr><td>Cg (${r.group} obvod${r.group === 1 ? '' : (r.group < 5 ? 'y' : 'ů')})</td><td>× ${r.Cg.toFixed(2)}</td></tr>`;
  html += `    <tr class="iec-tot"><td>Iz · Ca · Cg (skutečná zatížitelnost)</td><td><strong>${r.finalIzCorr.toFixed(1)} A</strong></td></tr>`;
  html += `    <tr><td>Návrhový proud Ib</td><td>${r.I.toFixed(1)} A</td></tr>`;
  html += `    <tr><td>Rezerva</td><td>${margin >= 0 ? '+' : ''}${margin.toFixed(1)} %</td></tr>`;
  html += `  </table>`;
  html += `</div>`;

  // VOLTAGE DROP
  html += `<div class="iec-card ${vdPass ? 'iec-card-pass' : 'iec-card-fail'}">`;
  html += `  <div class="iec-card-hdr">⚡ Úbytek napětí (při ${r.Tmax} °C)</div>`;
  html += `  <div class="iec-big">${r.vd.V.toFixed(2)} V <span class="iec-sub">(${r.vd.pct.toFixed(2)} %)</span></div>`;
  html += `  <div class="iec-fml"><code>${r.vd.formula}</code></div>`;
  html += `  <div class="iec-line">R = ${(r.R * 1000).toFixed(3)} mΩ/m  ·  X = ${(r.X * 1000).toFixed(2)} mΩ/m  ·  ρ = ${r.rho.toFixed(5)} Ω·mm²/m</div>`;
  html += `  <div class="iec-line">Limit: ${r.maxVdPct} % &nbsp;→&nbsp; <strong>${vdPass ? '✅ VYHOVUJE' : '❌ NEVYHOVUJE'}</strong></div>`;
  if (r.vdIters.length > 1) {
    html += `  <div class="iec-iter">Iterace průřezu kvůli ΔU: ` +
            r.vdIters.map(v => `${v.A} mm² → ${v.pct.toFixed(2)} %`).join(' &nbsp;⇒&nbsp; ') + `</div>`;
  }
  html += `</div>`;

  // POWER LOSS + PE — two-column row
  html += `<div class="iec-row2">`;
  html += `  <div class="iec-card iec-card-mini">`;
  html += `    <div class="iec-card-hdr">🔥 Tepelné ztráty</div>`;
  html += `    <div class="iec-big">${fmtW(r.Ploss)}</div>`;
  html += `    <div class="iec-line">${r.nCond} žil · délka ${r.L} m</div>`;
  html += `  </div>`;
  html += `  <div class="iec-card iec-card-mini">`;
  html += `    <div class="iec-card-hdr">🛡️ PE vodič</div>`;
  html += `    <div class="iec-big">${fmtMm2(r.peSize)} mm²</div>`;
  html += `    <div class="iec-line">${r.peCalc}</div>`;
  html += `  </div>`;
  html += `</div>`;

  // Aluminium disclosure
  if (r.mat === 'al') {
    html += `<div class="iec-warn">ℹ Hodnoty pro hliník odvozeny z mědi × ${IEC_AL_FACTOR.toFixed(2)} ` +
            `(IEC 60228 — poměr vodivostí). Pro projektovou dokumentaci ověřte podle tabulek IEC 60364-5-52 B.52.4 / B.52.5 / B.52.10 / B.52.11.</div>`;
  }
  if (r.extrapWarn) {
    html += `<div class="iec-warn">${r.extrapWarn}</div>`;
  }

  body.innerHTML = html;

  // Step-by-step + steps card
  const stepsCard  = document.getElementById('iec-steps-card');
  const stepsPre   = document.getElementById('iec-steps');
  stepsCard.style.display = 'block';
  stepsPre.textContent = iecBuildStepsText(r);
}

function iecBuildStepsText(r) {
  const sysName = ({dc:'DC', '1ph':'AC 1-fáze', '3ph':'AC 3-fáze'})[r.system];
  const matName = r.mat === 'cu' ? 'Cu' : 'Al';
  const insName = r.ins === 'pvc70' ? 'PVC 70 °C' : 'XLPE/EPR 90 °C';

  const out = [];
  out.push('IEC 60364-5-52 / 60228 / 60364-5-54  —  Cable Sizing  (Step-by-Step)');
  out.push('───────────────────────────────────────────────────────────────────');
  out.push('');
  out.push('1) Inputs');
  out.push(`   System ............... ${sysName}`);
  out.push(`   Voltage U ............ ${r.U} V`);
  out.push(`   Design current Ib .... ${r.I} A`);
  out.push(`   Length L (one-way) ... ${r.L} m`);
  if (r.system !== 'dc') out.push(`   cos phi .............. ${r.cosphi}`);
  out.push(`   Max allowed vd ....... ${r.maxVdPct} %`);
  out.push(`   Conductor material ... ${matName}    (rho20 = ${IEC_RHO20[r.mat].toFixed(5)} Ohm.mm2/m)`);
  out.push(`   Insulation ........... ${insName}    (Tmax = ${r.Tmax} °C)`);
  out.push(`   Reference method ..... ${r.method}    (${(IEC_METHOD_HINTS[r.method]||'').replace(/^[A-Z0-9]+ — /,'')})`);
  out.push(`   Loaded conductors .... ${r.conds}`);
  out.push(`   Ambient Ta ........... ${r.Tamb} °C`);
  out.push(`   Grouping ............. ${r.group} circuit(s)`);
  out.push('');
  out.push('2) Correction factors  (IEC 60364-5-52 Annex B)');
  out.push(`   Ca = f(Ta, ins) = ${r.Ca.toFixed(3)}`);
  out.push(`   Cg = f(circuits) = ${r.Cg.toFixed(3)}`);
  out.push(`   Ctot = Ca · Cg = ${r.Ctot.toFixed(3)}`);
  out.push('');
  out.push('3) Required base ampacity');
  out.push(`   Iz_required = Ib / Ctot = ${r.I} / ${r.Ctot.toFixed(3)} = ${(r.I / r.Ctot).toFixed(2)} A`);
  out.push(`   First standard size with Iz_base >= Iz_required: ${r.sizeAmpFirst} mm²`);
  out.push(`     Iz_base = ${r.Iz_base.toFixed(1)} A   →   Iz_corr = ${r.Iz_corr.toFixed(1)} A`);
  out.push('');
  out.push('4) Voltage-drop check  (IEC 60364-5-52 §G.52.2)');
  out.push(`   rho(Tmax) = rho20 · (1 + alpha·(${r.Tmax}-20)) = ${r.rho.toFixed(5)} Ohm·mm²/m`);
  out.push(`   ${r.vd.formula}`);
  if (r.vdIters.length === 1) {
    out.push(`   At ${r.finalSize} mm²: dU = ${r.vd.V.toFixed(3)} V  (${r.vd.pct.toFixed(3)} %) — ${r.vd.pct <= r.maxVdPct ? 'OK' : 'FAIL'}`);
  } else {
    out.push('   Iteration to satisfy max vd:');
    r.vdIters.forEach(v => out.push(`     ${v.A} mm² → ${v.pct.toFixed(3)} %`));
    out.push(`   Selected: ${r.finalSize} mm²`);
  }
  out.push('');
  out.push('5) Power loss');
  out.push(`   Ploss = Ib² · (rho/A) · n · L = ${r.I}² · (${r.rho.toFixed(5)}/${r.finalSize}) · ${r.nCond} · ${r.L} = ${r.Ploss.toFixed(2)} W`);
  out.push('');
  out.push('6) PE conductor');
  out.push(`   ${r.peCalc}`);
  out.push('');
  out.push('Result');
  out.push(`   Phase conductor: ${r.finalSize} mm²  (${fmtAwg(Math.round(r.awg))})`);
  out.push(`   PE conductor:    ${r.peSize} mm²`);
  out.push(`   Iz_corr:         ${r.finalIzCorr.toFixed(1)} A   (Ib = ${r.I} A → margin ${(((r.finalIzCorr - r.I) / r.I) * 100).toFixed(1)} %)`);
  out.push(`   Voltage drop:    ${r.vd.V.toFixed(2)} V (${r.vd.pct.toFixed(2)} %)   limit ${r.maxVdPct} %`);
  return out.join('\n');
}

/* ─── PDF EXPORT ───────────────────────────────────────────────────────── */
async function iecDownloadPdf() {
  const btn = document.getElementById('iec-pdf-btn');
  btn.textContent = 'Generating…';
  btn.disabled = true;
  try {
    if (!window.jspdf && !window.jsPDF) { showToast('jsPDF not loaded'); return; }
    const { jsPDF } = window.jspdf || window;
    const r = _iecLastResult;
    if (!r) { showToast('No results — calculate first'); return; }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const PW = 210, PH = 297, M = 15, CW = PW - M * 2;
    const ACC = [26, 82, 118];
    const engineer = document.getElementById('iec-engineer')?.value.trim() || '';

    function drawHeader(pg, tot) {
      pdfMakeHeader(doc, { PW, M, title: 'IEC Cable Sizing  (IEC 60364-5-52 / 60228 / 60364-5-54)' });
      pdfMakeFooter(doc, { PW, PH, M, pageNum: pg, totalPages: tot, engineer, standard: 'IEC 60364-5-52' });
    }
    function secTitle(y, txt) {
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...ACC);
      doc.text(pdfSafe(txt), M, y);
      return y + 6;
    }
    function inputRow(y, label, value, shade) {
      const RH = 6.5;
      if (shade) { doc.setFillColor(245, 247, 250); doc.rect(M, y, CW, RH, 'F'); }
      doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.1); doc.rect(M, y, CW, RH);
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
      doc.text(pdfSafe(label), M + 3, y + 4.5);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
      doc.text(pdfSafe(String(value)), M + CW - 3, y + 4.5, { align: 'right' });
      return y + RH;
    }

    // ── PAGE 1 ────────────────────────────────────────────────────────────
    drawHeader(1, 2);
    let y = M + 22;

    const sysLabels = { dc: 'DC', '1ph': 'AC Single-phase', '3ph': 'AC Three-phase' };
    y = secTitle(y, 'Input Parameters');
    const inputs = [
      ['System',                       sysLabels[r.system]],
      ['Voltage U',                    r.U + ' V'],
      ['Design current Ib',            r.I + ' A'],
      ['Length L (one-way)',           r.L + ' m'],
      ['cos phi',                      r.system === 'dc' ? '— (DC)' : String(r.cosphi)],
      ['Max voltage drop',             r.maxVdPct + ' %'],
      ['Conductor material',           r.mat === 'cu' ? 'Copper (Cu) — IEC 60228' : 'Aluminium (Al) — IEC 60228'],
      ['Insulation',                   r.ins === 'pvc70' ? 'PVC 70 °C' : 'XLPE / EPR 90 °C'],
      ['Reference method',             r.method + '  —  ' + (IEC_METHOD_HINTS[r.method] || '').replace(/^[A-Z0-9]+ — /, '')],
      ['Loaded conductors',            String(r.conds)],
      ['Ambient temperature Ta',       r.Tamb + ' °C'],
      ['Grouping (circuits)',          String(r.group)],
      ['PE method',                    r.peMethod === 'simplified' ? 'Simplified — IEC 60364-5-54 Tab. 54.2'
                                                                   : 'Adiabatic — IEC 60364-5-54 §543.1.2'],
    ];
    inputs.forEach((row, i) => { y = inputRow(y, row[0], row[1], i % 2 === 0); });
    y += 5;

    y = secTitle(y, 'Correction Factors');
    [
      ['Ca (ambient)',  r.Ca.toFixed(3)],
      ['Cg (grouping)', r.Cg.toFixed(3)],
      ['Ctot = Ca · Cg', r.Ctot.toFixed(3)],
    ].forEach((row, i) => { y = inputRow(y, row[0], row[1], i % 2 === 0); });
    y += 5;

    y = secTitle(y, 'Result');
    // Big rec box
    doc.setFillColor(230, 245, 235); doc.setDrawColor(0, 150, 80); doc.setLineWidth(0.5);
    doc.rect(M, y, CW, 18, 'FD');
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    doc.text('Recommended phase conductor', M + 4, y + 5);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 120, 60);
    const recTxt = r.finalSize + ' mm²  (' + fmtAwg(Math.round(r.awg)) + ')';
    doc.text(pdfSafe(recTxt), PW / 2, y + 13, { align: 'center' });
    y += 18 + 4;

    // Detail row
    [
      ['Iz_base (Method ' + r.method + ')',  r.finalIzBase.toFixed(1) + ' A'],
      ['Iz_corr (after Ca · Cg)',            r.finalIzCorr.toFixed(1) + ' A'],
      ['Voltage drop',                       r.vd.V.toFixed(2) + ' V  (' + r.vd.pct.toFixed(2) + ' %)' +
                                              '   — limit ' + r.maxVdPct + ' %  ' +
                                              (r.vd.pct <= r.maxVdPct ? 'OK' : 'FAIL')],
      ['Power loss',                         r.Ploss.toFixed(2) + ' W   (' + r.nCond + ' conductors, ' + r.L + ' m)'],
      ['PE conductor',                       r.peSize + ' mm²'],
    ].forEach((row, i) => { y = inputRow(y, row[0], row[1], i % 2 === 0); });

    if (r.extrapWarn) {
      y += 3;
      doc.setFillColor(255, 245, 220); doc.setDrawColor(200, 130, 0); doc.setLineWidth(0.4);
      const lines = doc.splitTextToSize(pdfSafe(r.extrapWarn), CW - 6);
      const h = lines.length * 4 + 4;
      doc.rect(M, y, CW, h, 'FD');
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(160, 100, 0);
      doc.text(lines, M + 3, y + 5);
      y += h;
    }

    // ── PAGE 2 ────────────────────────────────────────────────────────────
    doc.addPage();
    drawHeader(2, 2);
    y = M + 22;
    y = secTitle(y, 'Step-by-Step Calculation');
    doc.setFontSize(7.5); doc.setFont('Courier', 'normal'); doc.setTextColor(50, 50, 50);
    const lh = 4.2;
    const text = iecBuildStepsText(r);
    text.split('\n').forEach(line => {
      if (y + lh > PH - M - 10) {
        doc.addPage();
        drawHeader(doc.getNumberOfPages(), 2);
        y = M + 22;
        doc.setFontSize(7.5); doc.setFont('Courier', 'normal'); doc.setTextColor(50, 50, 50);
      }
      doc.text(pdfSafe(line), M, y);
      y += lh;
    });

    doc.save('iec-cable-sizing.pdf');
  } finally {
    btn.textContent = (T?.[lang]?.iecPdfBtn) || '⬇ Stáhnout PDF';
    btn.disabled = false;
  }
}

/* ─── SC fetch helper ─────────────────────────────────────────────────── */
function iecFetchFromSc() {
  // Try AC then DC short-circuit module results
  const ac = document.getElementById('sc-r-ik3-max')?.textContent;
  const dc = document.getElementById('dc-r-ik')?.textContent;
  let kA = null;
  for (const txt of [ac, dc]) {
    if (!txt) continue;
    const m = txt.match(/[\d.]+/);
    if (m) { kA = parseFloat(m[0]); if (txt.includes('kA')) break; if (kA > 1000) { kA = kA / 1000; break; } }
  }
  if (kA != null && isFinite(kA) && kA > 0) {
    document.getElementById('iec-ik').value = kA.toFixed(2);
    showToast('Načteno Ik = ' + kA.toFixed(2) + ' kA');
  } else {
    showToast('Nejprve spusťte výpočet zkratového proudu (záložka Zkratový proud).');
  }
}

/* ─── Initialization ───────────────────────────────────────────────────── */
function iecInit() {
  // Method-hint live update
  const sel = document.getElementById('iec-method');
  const hint = document.getElementById('iec-method-hint');
  if (sel && hint) {
    const upd = () => { hint.textContent = IEC_METHOD_HINTS[sel.value] || ''; };
    sel.addEventListener('change', upd);
    upd();
  }
  // Bind buttons
  document.getElementById('iec-calculate')?.addEventListener('click', iecCalculate);
  document.getElementById('iec-pdf-btn')?.addEventListener('click', iecDownloadPdf);
  document.getElementById('iec-fetch-sc')?.addEventListener('click', iecFetchFromSc);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iecInit);
} else {
  iecInit();
}
