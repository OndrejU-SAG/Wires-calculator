/* =====================================================================
   BUS BAR SIZING CALCULATOR — IEC 61439-1:2011
   Two modes:
     • Busbar Sizing     — iterates standard sizes, finds smallest that passes
     • Sizing Verification — checks a user-specified size against all clauses
   ===================================================================== */

/* ── Material properties ─────────────────────────────────────────────── */
const BB_MAT = {
  cu: {
    rho20:   17.24e-9,  // Ohm·m
    alpha20:  3.93e-3,  // K^-1
    Qc:      3.45e6,    // J/(m^3·K) volumetric heat capacity — for k_sc formula
    theta_f: 300,       // °C — bare conductor final temperature (IEC 60364-4-43)
    E_mod:   120e9,     // Pa
    sigma_y: 150e6,     // Pa
    label:   'Cu',
  },
  al: {
    rho20:   28.3e-9,
    alpha20:  4.03e-3,
    Qc:      2.43e6,    // J/(m^3·K)
    theta_f: 300,       // °C
    E_mod:    70e9,
    sigma_y: 100e6,     // Pa — 1350-H12/H14 alloy (IEC 60317-51 / EN 13601); pure annealed = 70 MPa
    label:   'Al',
  },
};

/* ── h_eff [W/(m²·K)] by installation ───────────────────────────────── */
const BB_H = { edge: 12, flat_v: 10, flat_h: 9, enclosed: 6 };

/* ── Parallel-bar current derating (empirical; per Siemens "Busbars in LV Switchboards"
       and DIN VDE 0103 application notes — IEC 61439-1 does not specify numeric values) ── */
const BB_PAR = { 1: 1.00, 2: 0.90, 3: 0.83, 4: 0.80 };

/* ── IEC 61439-1:2011 Table 5 limits ────────────────────────────────── */
const BB_DT_BUSBAR   = 105;   // K — bare busbar conductors
const BB_DT_TERMINAL =  70;   // K — terminals

/* ── IEC 61439-1:2011 Table 12 — min. air clearance (mm), pollution degree 3 ── */
const BB_CLEARANCE = [
  { vMax:   50, mm:  0.6 },
  { vMax:  150, mm:  1.5 },
  { vMax:  300, mm:  3.0 },
  { vMax:  600, mm:  5.5 },
  { vMax: 1000, mm:  8.0 },
];
function _bbMinClearance(Un_V) {
  const entry = BB_CLEARANCE.find(c => Un_V <= c.vMax);
  return entry ? entry.mm : 10;   // conservative default above 1000 V
}

/* ── Standard cross-sections [w mm, t mm] ───────────────────────────── */
const BB_SIZES = [
  [15,3],[20,3],[25,3],[30,3],[40,3],[50,3],
  [20,4],[25,4],[30,4],[40,4],[50,4],[60,4],
  [20,5],[25,5],[30,5],[40,5],[50,5],[60,5],[80,5],[100,5],
  [20,6],[25,6],[30,6],[40,6],[50,6],[60,6],[80,6],[100,6],
  [40,8],[50,8],[60,8],[80,8],[100,8],[120,8],
  [50,10],[60,10],[80,10],[100,10],[120,10],[160,10],
];

/* ── Init ─────────────────────────────────────────────────────────────── */
function initBusbar() {
  const sel = document.getElementById('bb-std-size');
  if (!sel) return;
  BB_SIZES.forEach(([w, t]) => {
    const o = document.createElement('option');
    o.value = `${w},${t}`;
    o.textContent = `${w} \xd7 ${t} mm  (${w * t} mm\xb2)`;
    sel.appendChild(o);
  });
  sel.value = '60,5';
  _bbApplyStdSize();
  sel.addEventListener('change', _bbApplyStdSize);
}

function _bbApplyStdSize() {
  const val = document.getElementById('bb-std-size').value;
  if (!val) return;
  const [w, t] = val.split(',').map(Number);
  document.getElementById('bb-width').value = w;
  document.getElementById('bb-thick').value = t;
}

/* ── Sub-tab switching ────────────────────────────────────────────────── */
function bbSwitchSub(which) {
  const sizBtn   = document.getElementById('bb-sub-siz');
  const verifBtn = document.getElementById('bb-sub-verif');
  const sizPan   = document.getElementById('bb-siz-panel');
  const verifPan = document.getElementById('bb-verif-panel');
  if (!sizBtn || !sizPan) return;
  const isSiz = (which === 'siz');
  sizBtn.classList.toggle('active', isSiz);
  verifBtn.classList.toggle('active', !isSiz);
  sizPan.style.display   = isSiz ? '' : 'none';
  verifPan.style.display = isSiz ? 'none' : '';
}

/* ── UI helpers ───────────────────────────────────────────────────────── */
function bbSetMat(el, mat) {
  document.querySelectorAll('[data-bb-mat]').forEach(b =>
    b.classList.toggle('active', b.dataset.bbMat === mat));
}

function bbSetSys(el, sys) {
  document.querySelectorAll('[data-bb-sys]').forEach(b =>
    b.classList.toggle('active', b.dataset.bbSys === sys));
  const cpRow = document.getElementById('bb-cosphi-row');
  if (cpRow) cpRow.style.display = (sys === 'dc') ? 'none' : '';
}

/* ── Pure calculation core ────────────────────────────────────────────── */
/**
 * @param {object} M        - material object from BB_MAT
 * @param {string} sysKey   - 'ac3'|'ac1'|'dc'
 * @param {number} w        - width mm
 * @param {number} t        - thickness mm
 * @param {number} n        - bars per phase
 * @param {string} inst     - installation key (thermal only)
 * @param {string} orient   - bending axis: 'edge' | 'flat'
 * @param {number} In       - nominal current A
 * @param {number} Un       - nominal voltage V
 * @param {number} cosph    - power factor (1 for DC)
 * @param {number} Ta       - ambient °C
 * @param {number} Ik_kA    - prospective fault current kA
 * @param {number} tsc      - fault duration s
 * @param {number} kap      - peak factor κ
 * @param {number} Ls_mm    - support span mm
 * @param {number} dcc_mm   - phase spacing mm
 * @param {number} L_m      - bus length m (0 skips VD)
 * @param {number} freq     - system frequency Hz (50 or 60)
 * @returns {object} all computed values + pass/fail booleans
 */
function _bbCalc(M, sysKey, w, t, n, inst, orient, In, Un, cosph, Ta, Ik_kA, tsc, kap, Ls_mm, dcc_mm, L_m, freq) {
  const A_mm2 = w * t;
  const A_m2  = A_mm2 * 1e-6;
  const P_mm  = 2 * (w + t);
  const P_m   = P_mm * 1e-3;
  const Ls_m  = Ls_mm * 1e-3;
  const dcc_m = dcc_mm * 1e-3;
  const Ik_A  = Ik_kA * 1000;
  const h     = BB_H[inst] || 9;

  /* — Thermal balance ——————————————————————————————————————————————— */
  const R_dc_pm = M.rho20 * (1 + M.alpha20 * (Ta - 20)) / A_m2;
  const y_s     = (sysKey !== 'dc') ? skinEffectYs(freq, R_dc_pm) : 0;
  const R0_pm   = R_dc_pm * (1 + y_s);
  const HC      = h * P_m;
  const dR_dT   = M.rho20 * M.alpha20 / A_m2;
  const I_bar   = In / n;
  const HC_net  = HC - I_bar * I_bar * dR_dT;
  const DeltaT   = HC_net > 0 ? I_bar * I_bar * R0_pm / HC_net : Infinity;
  const theta_op = Ta + DeltaT;
  const Iz_bar_bus  = Math.sqrt(HC * BB_DT_BUSBAR   / (R0_pm + dR_dT * BB_DT_BUSBAR));
  const Iz_bar_term = Math.sqrt(HC * BB_DT_TERMINAL  / (R0_pm + dR_dT * BB_DT_TERMINAL));
  const k_par        = BB_PAR[n] || 0.80;
  const Iz_tot_bus   = n * Iz_bar_bus  * k_par;
  const Iz_tot_term  = n * Iz_bar_term * k_par;
  const pass_dt      = isFinite(DeltaT) && DeltaT <= BB_DT_BUSBAR;
  const pass_term_dt = isFinite(DeltaT) && DeltaT <= BB_DT_TERMINAL;
  const pass_amp     = In <= Iz_tot_bus;
  const amp_margin   = isFinite(Iz_tot_bus) ? (Iz_tot_bus - In) / Iz_tot_bus * 100 : -999;

  /* — Short-circuit k factor at operating temperature (IEC 60364-4-43 Annex B) — */
  const theta_i_sc = isFinite(theta_op) ? theta_op : (Ta + BB_DT_BUSBAR);
  const ln_ratio   = Math.log(
    (1 + M.alpha20 * (M.theta_f - 20)) / (1 + M.alpha20 * (theta_i_sc - 20))
  );
  const k_sc = ln_ratio > 0
    ? Math.sqrt(M.Qc / (M.rho20 * M.alpha20) * ln_ratio) / 1e6  // convert A·s^0.5/m² → A·s^0.5/mm²
    : 0;  // guard: if theta_op >= theta_f, busbar cannot absorb fault energy

  /* — Short-circuit thermal ————————————————————————————————————————— */
  const S_min   = k_sc > 0 ? Ik_A * Math.sqrt(tsc) / k_sc : Infinity;
  const S_total = A_mm2 * n;
  const pass_sc = S_total >= S_min;
  const sc_marg = (S_total - S_min) / S_min * 100;

  /* — Mechanical ——————————————————————————————————————————————————— */
  const Ipk  = kap * Math.SQRT2 * Ik_A;
  /* force per bar: n bars/phase each carry Ik/n; n adjacent-phase bars all at ≈dcc */
  const f_em = 2e-7 * Ipk * Ipk / (dcc_m * n);
  const w_m = w * 1e-3, t_m = t * 1e-3;
  let I_bend, Z_bend;
  if (orient === 'edge') {
    I_bend = w_m * Math.pow(t_m, 3) / 12;
    Z_bend = w_m * Math.pow(t_m, 2) / 6;
  } else {
    I_bend = t_m * Math.pow(w_m, 3) / 12;
    Z_bend = t_m * Math.pow(w_m, 2) / 6;
  }
  const Mbend     = f_em * Ls_m * Ls_m / 8;
  const sigma_max = Mbend / Z_bend;
  const pass_mech = sigma_max <= M.sigma_y;
  const mech_marg = (M.sigma_y - sigma_max) / M.sigma_y * 100;
  const delta_m   = 5 * f_em * Math.pow(Ls_m, 4) / (384 * M.E_mod * I_bend);
  const delta_lim = Ls_m / 200;
  const pass_defl = delta_m <= delta_lim;
  const defl_marg = (delta_lim - delta_m) / delta_lim * 100;

  /* — Air clearance (IEC 61439-1:2011 §10.3 / Table 12) ——————————— */
  const clearance_min_mm    = _bbMinClearance(Un);
  const clearance_actual_mm = dcc_mm - w;   // edge-to-edge between adjacent phases
  const pass_clearance      = clearance_actual_mm >= clearance_min_mm;

  /* — Voltage drop ————————————————————————————————————————————————— */
  const theta_mean = Ta + (isFinite(DeltaT) ? DeltaT / 2 : BB_DT_BUSBAR / 2);
  const rho_op = M.rho20 * (1 + M.alpha20 * (theta_mean - 20));
  const R_bus  = (L_m > 0) ? rho_op * L_m / (A_m2 * n) : 0;
  const X_bus  = (L_m > 0 && sysKey !== 'dc') ? 0.12e-3 * (freq / 50) * L_m : 0;
  const sinph  = Math.sqrt(Math.max(0, 1 - cosph * cosph));
  let dU_V;
  switch (sysKey) {
    case 'ac3': dU_V = Math.sqrt(3) * In * (R_bus * cosph + X_bus * sinph); break;
    case 'ac1': dU_V = 2 * In * (R_bus * cosph + X_bus * sinph); break;
    default:    dU_V = 2 * In * R_bus; break;
  }
  const dU_pct = (Un > 0 && L_m > 0) ? dU_V / Un * 100 : 0;
  const pass_vd = dU_pct <= 1.0;

  const overall_pass = pass_dt && pass_amp && pass_sc && pass_mech && pass_defl && pass_clearance;

  return {
    A_mm2, A_m2, P_mm, P_m, Ls_m, dcc_m, Ik_A, h,
    R_dc_pm, y_s, R0_pm, HC, dR_dT, I_bar, Iz_bar_bus, Iz_bar_term,
    k_par, Iz_tot_bus, Iz_tot_term,
    DeltaT, theta_op, pass_dt, pass_term_dt, pass_amp, amp_margin,
    k_sc, S_min, S_total, pass_sc, sc_marg,
    Ipk, f_em, I_bend, Z_bend, Mbend, sigma_max,
    delta_m, delta_lim, pass_mech, mech_marg, pass_defl, defl_marg,
    clearance_min_mm, clearance_actual_mm, pass_clearance,
    theta_mean, rho_op, R_bus, X_bus, dU_V, dU_pct, pass_vd,
    overall_pass,
  };
}

/* ── Shared input reader ─────────────────────────────────────────────── */
function _bbReadShared() {
  const matEl  = document.querySelector('[data-bb-mat].active') || document.querySelector('[data-bb-mat]');
  const sysEl  = document.querySelector('[data-bb-sys].active') || document.querySelector('[data-bb-sys]');
  const matKey = matEl ? matEl.dataset.bbMat : 'cu';
  const sysKey = sysEl ? sysEl.dataset.bbSys : 'ac3';
  const M      = BB_MAT[matKey];
  const sysIsDc = sysKey === 'dc';
  return {
    matKey, sysKey, M,
    In:     parseFloat(document.getElementById('bb-current').value),
    Un:     parseFloat(document.getElementById('bb-voltage').value),
    cosph:  sysIsDc ? 1 : parseFloat(document.getElementById('bb-cosphi').value),
    Ta:     parseFloat(document.getElementById('bb-tamb').value),
    Ik:     parseFloat(document.getElementById('bb-ik').value),
    tsc:    parseFloat(document.getElementById('bb-tsc').value),
    kap:    parseFloat(document.getElementById('bb-kappa').value),
    inst:   document.getElementById('bb-inst').value,
    orient: document.getElementById('bb-orient')?.value || 'edge',
    freq:   parseFloat(document.getElementById('bb-freq')?.value) || 50,
    Ls:     parseFloat(document.getElementById('bb-lsupp').value),
    dcc:    parseFloat(document.getElementById('bb-dcc').value),
    L:      parseFloat(document.getElementById('bb-length').value) || 0,
  };
}

/* ══════════════════════════════════════════════════════════════════════
   BUSBAR SIZING MODE
   ══════════════════════════════════════════════════════════════════════ */
let _bbSizCandidates = [];

function bbSize() {
  const s = _bbReadShared();
  const maxPar = parseInt(document.getElementById('bb-maxpar').value, 10) || 2;

  if ([s.In, s.Un, s.cosph, s.Ta, s.Ik, s.tsc, s.kap, s.Ls, s.dcc].some(v => isNaN(v) || v <= 0)) {
    showToast(T[lang].bbErrInputs || 'Please fill all fields with positive values.');
    return;
  }
  if (s.kap < 1.0 || s.kap > 2.0) {
    showToast('κ must be between 1.0 and 2.0 per IEC 60909.');
    return;
  }
  if (s.sysKey === 'dc' && Math.abs(s.kap - 1.0) > 0.01) {
    showToast('κ = 1.0 for DC systems (no asymmetric component). Value overridden to 1.0.');
  }
  if (s.tsc > 5) {
    showToast('Warning: adiabatic formula (IEC 60364-4-43) is valid for t ≤ 5 s. Result is conservative for longer durations.');
  }

  const candidates = [];
  for (let n = 1; n <= maxPar; n++) {
    for (const [w, t] of BB_SIZES) {
      const r = _bbCalc(s.M, s.sysKey, w, t, n, s.inst, s.orient, s.In, s.Un, s.cosph,
                        s.Ta, s.Ik, s.tsc, s.kap, s.Ls, s.dcc, s.L, s.freq);
      if (r.overall_pass) {
        candidates.push({ w, t, n, M: s.M, matKey: s.matKey, ...r });
        break;                          // smallest passing size for this n
      }
    }
  }
  _bbSizCandidates = candidates;
  _bbSizRender(s, candidates);
}

function _bbSizRender(s, candidates) {
  const resCard = document.getElementById('bb-siz-res-card');
  const recEl   = document.getElementById('bb-siz-recommend');
  const tblEl   = document.getElementById('bb-siz-table');
  if (!resCard) return;
  resCard.style.display = '';

  const fmt = (v, d = 2) => isFinite(v) ? v.toFixed(d) : 'inf';

  if (candidates.length === 0) {
    recEl.innerHTML = `<div class="bb-badge bb-fail" style="display:block;padding:14px;font-size:13px">${
      T[lang].bbNoSizeFound || 'No standard size found — increase max parallel bars or review mechanical parameters.'
    }</div>`;
    tblEl.innerHTML = '';
    document.getElementById('bb-siz-use-btn').style.display = 'none';
    return;
  }

  document.getElementById('bb-siz-use-btn').style.display = '';
  const best = candidates[0];

  /* — Recommendation card — */
  recEl.innerHTML = `
    <div style="background:var(--suc-bg);border:1.5px solid var(--suc-bdr);border-radius:var(--r-md);padding:14px 18px">
      <div style="font-size:11px;font-weight:700;color:var(--suc);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">${
        T[lang].bbSizRecommend || '★ Recommended Size'}</div>
      <div style="font-size:22px;font-weight:800;color:var(--on-surf);margin-bottom:10px">
        ${best.M.label} ${best.w}\xd7${best.t} mm${best.n > 1 ? ' \xd7 ' + best.n + ' bars/phase' : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px;font-size:12px;color:var(--on-surf-var)">
        <span>A = ${best.A_mm2} mm\xb2 \xd7 ${best.n}</span>
        <span>ΔT = ${fmt(best.DeltaT,1)} K</span>
        <span>Iz = ${fmt(best.Iz_tot_bus,0)} A</span>
        <span>S/Smin = ${best.S_total}/${fmt(best.S_min,1)} mm\xb2</span>
        <span>σ = ${fmt(best.sigma_max/1e6,1)} MPa</span>
        <span>δ = ${fmt(best.delta_m*1000,3)} mm</span>
        ${best.L > 0 ? `<span>ΔU = ${fmt(best.dU_pct,2)} %</span>` : ''}
      </div>
    </div>`;

  /* — Comparison table (all candidates) — */
  if (candidates.length > 1) {
    const rows = candidates.map((c, i) => `
      <tr class="bb-siz-row${i === 0 ? ' bb-siz-row-best' : ''}" onclick="_bbSizSelect(${i},this)" style="cursor:pointer">
        <td style="padding:5px 8px"><input type="radio" name="bb-siz-sel" ${i === 0 ? 'checked' : ''}></td>
        <td style="padding:5px 8px;font-weight:700">${c.M.label} ${c.w}\xd7${c.t}</td>
        <td style="padding:5px 8px;text-align:center">${c.n}</td>
        <td style="padding:5px 8px;text-align:right">${c.A_mm2 * c.n}</td>
        <td style="padding:5px 8px;text-align:right">${fmt(c.DeltaT,1)}</td>
        <td style="padding:5px 8px;text-align:right">${fmt(c.Iz_tot_bus,0)}</td>
        <td style="padding:5px 8px;text-align:right">${c.S_total}/${fmt(c.S_min,1)}</td>
        <td style="padding:5px 8px;text-align:right">${fmt(c.sigma_max/1e6,1)}/${c.M.sigma_y/1e6}</td>
        <td style="padding:5px 8px;text-align:right">${fmt(c.delta_m*1000,3)}</td>
        <td style="padding:5px 8px;text-align:right">${c.L > 0 ? fmt(c.dU_pct,2)+'%' : '—'}</td>
      </tr>`).join('');
    tblEl.innerHTML = `
      <div class="res-lbl" style="margin:14px 0 6px">${T[lang].bbSizCandHdr || 'All passing candidates'}</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:11.5px">
          <thead><tr style="background:var(--surf-2);font-weight:700;font-size:10px;text-transform:uppercase;color:var(--on-surf-var)">
            <th style="padding:6px 8px"></th>
            <th style="padding:6px 8px;text-align:left">Size</th>
            <th style="padding:6px 8px">n</th>
            <th style="padding:6px 8px;text-align:right">A\xd7n mm\xb2</th>
            <th style="padding:6px 8px;text-align:right">ΔT K</th>
            <th style="padding:6px 8px;text-align:right">Iz A</th>
            <th style="padding:6px 8px;text-align:right">S/Smin mm\xb2</th>
            <th style="padding:6px 8px;text-align:right">σ/σy MPa</th>
            <th style="padding:6px 8px;text-align:right">δ mm</th>
            <th style="padding:6px 8px;text-align:right">ΔU%</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } else {
    tblEl.innerHTML = '';
  }
}

function _bbSizSelect(idx, row) {
  document.querySelectorAll('[name="bb-siz-sel"]').forEach((r, i) => { r.checked = (i === idx); });
}

function bbSizUseSelected() {
  const radios = [...document.querySelectorAll('[name="bb-siz-sel"]')];
  const idx = Math.max(0, radios.findIndex(r => r.checked));
  const c = _bbSizCandidates[idx] || _bbSizCandidates[0];
  if (!c) return;
  const sel = document.getElementById('bb-std-size');
  if (sel) { sel.value = c.w + ',' + c.t; _bbApplyStdSize(); }
  document.getElementById('bb-parallel').value = c.n;
  bbSwitchSub('verif');
  showToast(T[lang].bbSizCopied || 'Size copied to Verification — press Calculate to verify.');
}

/* ══════════════════════════════════════════════════════════════════════
   BUSBAR SIZING VERIFICATION MODE
   ══════════════════════════════════════════════════════════════════════ */
function bbCalculate() {
  const s = _bbReadShared();
  const w  = parseFloat(document.getElementById('bb-width').value);
  const t  = parseFloat(document.getElementById('bb-thick').value);
  const n  = parseInt(document.getElementById('bb-parallel').value, 10);

  if ([w, t, n, s.In, s.Un, s.cosph, s.Ta, s.Ik, s.tsc, s.kap, s.Ls, s.dcc]
      .some(v => isNaN(v) || v <= 0)) {
    showToast(T[lang].bbErrInputs || 'Please fill all fields with positive values.');
    return;
  }
  if (s.kap < 1.0 || s.kap > 2.0) {
    showToast('κ must be between 1.0 and 2.0 per IEC 60909.');
    return;
  }
  if (s.sysKey === 'dc' && Math.abs(s.kap - 1.0) > 0.01) {
    showToast('κ = 1.0 for DC systems (no asymmetric component). Value overridden to 1.0.');
  }
  if (s.tsc > 5) {
    showToast('Warning: adiabatic formula (IEC 60364-4-43) is valid for t ≤ 5 s. Result is conservative for longer durations.');
  }

  const r = _bbCalc(s.M, s.sysKey, w, t, n, s.inst, s.orient, s.In, s.Un, s.cosph,
                    s.Ta, s.Ik, s.tsc, s.kap, s.Ls, s.dcc, s.L, s.freq);

  const {
    A_mm2, P_mm, Ik_A, h, R_dc_pm, y_s, R0_pm, HC, dR_dT, I_bar, k_par,
    Iz_bar_bus, Iz_bar_term, Iz_tot_bus, Iz_tot_term,
    DeltaT, theta_op, pass_dt, pass_term_dt, pass_amp, amp_margin,
    k_sc, S_min, S_total, pass_sc, sc_marg,
    Ipk, f_em, Z_bend, Mbend, sigma_max,
    delta_m, delta_lim, pass_mech, mech_marg, pass_defl, defl_marg,
    clearance_min_mm, clearance_actual_mm, pass_clearance,
    theta_mean, rho_op, R_bus, X_bus, dU_V, dU_pct, pass_vd,
    overall_pass, Ls_m, dcc_m, I_bend,
  } = r;

  const P_m  = P_mm * 1e-3;
  const fmt  = (v, d = 2) => isFinite(v) ? v.toFixed(d) : 'inf';
  const fmtE = (v, d = 3) => v.toExponential(d);
  const pf   = p => p ? '[OK]  PASS' : '[FAIL] FAIL';

  /* — ASCII-safe step-by-step (renders well in browser pre AND in PDF) — */
  const lines = [
    `== INPUTS ==`,
    `Material:          ${s.M.label}`,
    `Busbar section:    ${w} x ${t} mm  ->  A = ${A_mm2} mm^2  x  ${n} bar/phase`,
    `Cooling perimeter: P = 2*(${w}+${t}) = ${P_mm} mm`,
    `Bus length L:      ${s.L} m`,
    `Installation:      ${s.inst}  ->  h_eff = ${h} W/(m^2*K)`,
    `Bending axis:      ${s.orient}`,
    `System:            ${s.sysKey.toUpperCase()}    In = ${s.In} A    Un = ${s.Un} V    f = ${s.freq} Hz`,
    `Ambient Ta:        ${s.Ta} degC`,
    s.sysKey !== 'dc' ? `Skin effect y_s:   ${fmtE(y_s,3)}  (IEC 60287)  ->  R_AC/R_DC = ${fmt(1+y_s,4)}` : `Skin effect:       N/A (DC)`,
    ``,
    `== CHECK 1 -- TEMPERATURE RISE  (IEC 61439-1 s10.10 / Table 5) ==`,
    `Steady-state energy balance per unit length:  I^2*rho(T)/A = h*P*dT`,
    ``,
    `R_DC/m at Ta=${s.Ta} degC:`,
    `  = rho20 * (1 + alpha*(Ta-20)) / A`,
    `  = ${fmtE(s.M.rho20)} * (1 + ${s.M.alpha20}*(${s.Ta}-20)) / ${fmtE(r.A_m2)}`,
    `  = ${fmtE(R_dc_pm)} Ohm/m`,
    `R0/m (AC, with skin effect y_s=${fmtE(y_s,3)}):  ${fmtE(R0_pm)} Ohm/m`,
    `HC = h*P = ${h} * ${fmt(P_m,5)} = ${fmt(HC,5)} W/(m*K)`,
    `I_bar = In/n = ${s.In}/${n} = ${fmt(I_bar,2)} A`,
    `dT = I^2*R0/m / (HC - I^2*alpha*rho20/A)`,
    `   = ${fmt(I_bar,2)}^2 * ${fmtE(R0_pm)} / (${fmt(HC,5)} - ${fmt(I_bar,2)}^2 * ${fmtE(dR_dT)})`,
    `   = ${fmt(DeltaT,2)} K   ->   theta_op = ${fmt(theta_op,1)} degC`,
    ``,
    `IEC 61439-1 Table 5 limits:`,
    `  Bare busbars (internal): dT <= ${BB_DT_BUSBAR} K  ->  ${pf(pass_dt)}`,
    `  Terminals (ext. cable):  dT <= ${BB_DT_TERMINAL} K  ->  ${pass_term_dt ? '[OK]  PASS' : '[!]  EXCEEDS -- verify terminal rating'}`,
    ``,
    `Iz single bar @ dT=${BB_DT_BUSBAR} K:    sqrt(HC*dT/(R0+dR*dT)) = ${fmt(Iz_bar_bus,1)} A`,
    `Iz single bar @ dT=${BB_DT_TERMINAL} K (terminals):             = ${fmt(Iz_bar_term,1)} A`,
    `Parallel derating n=${n}:  k_par = ${k_par}`,
    `Iz total (${n}x, busbar limit):   ${fmt(Iz_tot_bus,1)} A`,
    `Iz total (${n}x, terminal limit): ${fmt(Iz_tot_term,1)} A`,
    `In=${s.In} A  <=  Iz=${fmt(Iz_tot_bus,1)} A  ->  ${pf(pass_amp)}  (margin ${fmt(amp_margin,1)} %)`,
    ``,
    `== CHECK 2 -- SHORT-CIRCUIT THERMAL WITHSTAND  (IEC 61439-1 s10.11) ==`,
    `Adiabatic formula (IEC 60865-1):  S_min = Ik * sqrt(t) / k`,
    `k_sc at theta_op=${fmt(theta_op,1)} degC:  ${fmt(k_sc,1)} A*s^0.5/mm^2  (dynamic, IEC 60364-4-43 Annex B)`,
    `  k = sqrt(Qc/(rho20*alpha20) * ln((1+alpha*(theta_f-20))/(1+alpha*(theta_op-20))))`,
    `S_min = ${fmt(Ik_A,0)} * sqrt(${s.tsc}) / ${fmt(k_sc,1)}`,
    `      = ${fmt(Ik_A,0)} * ${fmt(Math.sqrt(s.tsc),4)} / ${fmt(k_sc,1)}`,
    `      = ${fmt(S_min,2)} mm^2`,
    `S_total = ${n} x ${A_mm2} = ${S_total} mm^2`,
    `S_total >= S_min  ->  ${pf(pass_sc)}  (margin ${fmt(sc_marg,1)} %)`,
    ``,
    `== CHECK 3 -- PEAK FORCE & MECHANICAL WITHSTAND  (IEC 61439-1 s10.2) ==`,
    `Peak current:`,
    `  kap = ${s.kap}  (IEC 60909 peak factor)`,
    `  I_pk = kap*sqrt(2)*Ik = ${fmt(s.kap,2)}*1.4142*${fmt(Ik_A,0)} = ${fmt(Ipk,0)} A  (${fmt(Ipk/1e3,2)} kA)`,
    ``,
    `Electromagnetic force per unit length (2-conductor model):`,
    `  f = 2e-7 * I_pk^2 / d_cc`,
    `    = 2e-7 * ${fmt(Ipk,0)}^2 / ${fmt(dcc_m,4)}`,
    `    = ${fmt(f_em,2)} N/m`,
    ``,
    `Simply-supported beam  L_s = ${s.Ls} mm:`,
    s.orient === 'edge'
      ? `  On-edge -> WEAK axis  (Z = w*t^2/6 = ${w}*${t}^2/6 = ${fmt(Z_bend*1e9,2)} x10^-9 m^3)`
      : `  Flat    -> STRONG axis  (Z = t*w^2/6 = ${t}*${w}^2/6 = ${fmt(Z_bend*1e9,2)} x10^-9 m^3)`,
    `  M_max = f*Ls^2/8 = ${fmt(f_em,2)}*${fmt(Ls_m,4)}^2/8 = ${fmt(Mbend,4)} N*m`,
    `  sigma_max = M_max/Z = ${fmt(sigma_max/1e6,2)} MPa  vs  sigma_y(${s.M.label}) = ${s.M.sigma_y/1e6} MPa`,
    `  sigma_max <= sigma_y  ->  ${pf(pass_mech)}  (margin ${fmt(mech_marg,1)} %)`,
    ``,
    `Deflection  (limit L_s/200 = ${fmt(delta_lim*1000,2)} mm) — engineering practice:`,
    `  delta = 5*f*Ls^4 / (384*E*I)`,
    `        = 5*${fmt(f_em,2)}*${fmt(Ls_m,4)}^4 / (384*${fmtE(s.M.E_mod)}*${fmtE(I_bend)})`,
    `        = ${fmt(delta_m*1000,4)} mm`,
    `  delta <= Ls/200  ->  ${pf(pass_defl)}  (margin ${fmt(defl_marg,1)} %)`,
    ``,
    `== CHECK 4 -- AIR CLEARANCE  (IEC 61439-1 s10.3 / Table 12) ==`,
    `Rated voltage Un = ${s.Un} V  ->  min. air clearance = ${fmt(clearance_min_mm,1)} mm (pollution degree 3)`,
    `Phase spacing d_cc = ${s.dcc} mm  ->  edge-to-edge = ${s.dcc} - ${w} = ${fmt(clearance_actual_mm,1)} mm`,
    `clearance >= min  ->  ${pf(pass_clearance)}`,
    ``,
    `== CHECK 5 -- VOLTAGE DROP  (IEC 61439-1 s10.10.4 -- informational) ==`,
    `No explicit numeric limit in IEC 61439; <=1% is common design practice.`,
    `rho @ theta_mean=${fmt(theta_mean,1)} degC:  ${fmtE(rho_op)} Ohm*m`,
    `R = rho*L/(A*n) = ${fmtE(rho_op)}*${s.L}/(${fmtE(r.A_m2)}*${n}) = ${fmt(R_bus*1e3,4)} mOhm`,
    s.sysKey !== 'dc'
      ? `X ~= 0.12 mOhm/m * (${s.freq}/50) * ${s.L} m = ${fmt(X_bus*1e3,4)} mOhm`
      : `X:   N/A (DC)`,
    s.sysKey === 'dc'
      ? `dU = 2*In*R = 2*${s.In}*${fmt(R_bus*1e3,4)} mOhm = ${fmt(dU_V,4)} V`
      : s.sysKey === 'ac3'
        ? `dU = sqrt(3)*In*(R*cosPhi + X*sinPhi) = ${fmt(dU_V,4)} V  [3-phase]`
        : `dU = 2*In*(R*cosPhi + X*sinPhi) = ${fmt(dU_V,4)} V  [1-phase]`,
    `dU% = ${fmt(dU_V,4)}/${s.Un}*100 = ${fmt(dU_pct,3)} %   ->  ${pass_vd ? '[OK] <=1%' : '[!] >1% (review)'}`,
    ``,
    `* Voltage drop is shown for reference. IEC 61439-1 specifies no numeric VD limit.`,
  ];

  /* — Render DOM — */
  document.getElementById('bb-res-card').style.display = '';
  document.getElementById('bb-steps').textContent = lines.join('\n');

  const vrd = document.getElementById('bb-verdict');
  vrd.textContent = overall_pass
    ? (T[lang].bbOverallPass || 'All IEC 61439-1 structural checks PASS  (voltage drop shown for reference only)')
    : (T[lang].bbOverallFail || 'One or more IEC 61439-1 checks FAIL — review highlighted items');
  vrd.className = 'sc-trip-box ' + (overall_pass ? 'sc-trip-ok' : 'sc-trip-fail');

  _bbBadge('bb-res-dt',      pass_dt,      `${fmt(DeltaT,1)} K  (limit ${BB_DT_BUSBAR} K)`);
  _bbBadge('bb-res-term-dt', pass_term_dt, `${fmt(DeltaT,1)} K  (limit ${BB_DT_TERMINAL} K)`, true);
  _bbBadge('bb-res-amp',     pass_amp,     `${fmt(s.In,0)} A ≤ ${fmt(Iz_tot_bus,0)} A   +${fmt(amp_margin,1)} %`);
  _bbBadge('bb-res-sc',      pass_sc,      `${fmt(S_total,0)} ≥ ${fmt(S_min,1)} mm\xb2   +${fmt(sc_marg,1)} %`);
  _bbBadge('bb-res-mech',    pass_mech,    `σ=${fmt(sigma_max/1e6,1)} ≤ ${s.M.sigma_y/1e6} MPa   +${fmt(mech_marg,1)} %`);
  _bbBadge('bb-res-defl',    pass_defl,    `δ=${fmt(delta_m*1000,3)} mm ≤ L/200=${fmt(delta_lim*1000,2)} mm`);
  _bbBadge('bb-res-clear',   pass_clearance, `${fmt(clearance_actual_mm,1)} mm ≥ ${fmt(clearance_min_mm,1)} mm (IEC 61439-1 Table 12)`);
  _bbBadge('bb-res-vd',      pass_vd,      `ΔU=${fmt(dU_pct,3)} %  (≤1% practice)`, false, true);

  _bbKV('bb-kv-dt',        fmt(DeltaT,1)       + ' K');
  _bbKV('bb-kv-theta',     fmt(theta_op,1)      + ' \xb0C');
  _bbKV('bb-kv-iz-bus',    fmt(Iz_tot_bus,0)    + ' A');
  _bbKV('bb-kv-iz-term',   fmt(Iz_tot_term,0)   + ' A');
  _bbKV('bb-kv-smin',      fmt(S_min,1)         + ' mm\xb2');
  _bbKV('bb-kv-stotal',    S_total              + ' mm\xb2');
  _bbKV('bb-kv-ipk',       fmt(Ipk/1e3,2)       + ' kA');
  _bbKV('bb-kv-fem',       fmt(f_em,1)          + ' N/m');
  _bbKV('bb-kv-sigma',     fmt(sigma_max/1e6,1) + ' MPa');
  _bbKV('bb-kv-delta',     fmt(delta_m*1000,3)  + ' mm');
  _bbKV('bb-kv-du',        fmt(dU_V,3)          + ' V  (' + fmt(dU_pct,3) + ' %)');
}

/* ── Badge / KV helpers ───────────────────────────────────────────────── */
function _bbBadge(id, pass, text, warnOnly = false, isInfo = false) {
  const el = document.getElementById(id);
  if (!el) return;
  let icon, cls;
  if (pass)        { icon = '✅'; cls = 'bb-pass'; }
  else if (isInfo) { icon = '⚠';  cls = 'bb-warn'; }
  else if (warnOnly){ icon = '⚠'; cls = 'bb-warn'; }
  else             { icon = '❌'; cls = 'bb-fail'; }
  el.textContent = icon + '  ' + text;
  el.className   = 'bb-badge ' + cls;
}

function _bbKV(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ══════════════════════════════════════════════════════════════════════
   PDF EXPORT  —  IEC 61439-1 Calculation Report
   ══════════════════════════════════════════════════════════════════════ */
function bbDownloadPdf() {
  if (typeof window.jspdf === 'undefined') { alert('jsPDF not loaded'); return; }
  const { jsPDF } = window.jspdf;

  const btn = document.getElementById('bb-pdf-btn');
  if (btn) { btn.textContent = 'Generating…'; btn.disabled = true; }

  try {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const PW = 210, PH = 297, M = 15;
    const BODY_W = PW - 2 * M;

    const engineer = (document.getElementById('bb-engineer') || {}).value || '';
    const stepsRaw = (document.getElementById('bb-steps')    || {}).textContent || '';
    const matEl    = document.querySelector('[data-bb-mat].active') || document.querySelector('[data-bb-mat]');
    const mat      = BB_MAT[matEl ? matEl.dataset.bbMat : 'cu'];
    const w        = parseFloat(document.getElementById('bb-width').value);
    const t        = parseFloat(document.getElementById('bb-thick').value);
    const n        = parseInt(document.getElementById('bb-parallel').value, 10) || 1;

    const title    = T[lang].bbPdfTitle || 'Bus Bar Sizing — IEC 61439-1';
    const standard = 'IEC 61439-1:2011 / IEC 60865-1';
    const stepsLines = stepsRaw.split('\n');

    /* ── page count estimate ── */
    const STEP_LH  = 4.2;
    const STEP_PH  = PH - M - 22 - (M + 10);
    const stepsPages = Math.max(1, Math.ceil(stepsLines.length * STEP_LH / STEP_PH));
    const TOTAL_PAGES = 1 + stepsPages;

    /* ── shared helpers ── */
    function hdr()      { pdfMakeHeader(doc, { PW, M, title: pdfSafe(title) }); }
    function ftr(pg)    { pdfMakeFooter(doc, { PW, PH, M, pageNum: pg, totalPages: TOTAL_PAGES, engineer, standard }); }

    function sectionTitle(y, txt) {
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 80, 160);
      doc.text(pdfSafe(txt), M, y);
      const tw = doc.getTextWidth(pdfSafe(txt));
      y += 4;
      doc.setDrawColor(0, 80, 160); doc.setLineWidth(0.5);
      doc.line(M, y, M + tw + 4, y);
      doc.setDrawColor(210, 220, 230); doc.setLineWidth(0.2);
      doc.line(M + tw + 4, y, PW - M, y);
      doc.setTextColor(40, 40, 40);
      return y + 5;
    }

    /* ════════════════════════════════════════════════════════════════
       PAGE 1 — Compliance Summary
       ════════════════════════════════════════════════════════════════ */
    hdr(); ftr(1);
    let y = M + 22;

    /* — Overall verdict box — */
    const verdictEl = document.getElementById('bb-verdict');
    const isPass = verdictEl && verdictEl.classList.contains('sc-trip-ok');
    const vColor  = isPass ? [0, 140, 80] : [200, 50, 50];
    const vBg     = isPass ? [235, 255, 242] : [255, 235, 235];
    doc.setFillColor(...vBg);
    doc.roundedRect(M, y, BODY_W, 11, 2, 2, 'F');
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...vColor);
    doc.text(pdfSafe(verdictEl ? verdictEl.textContent : (isPass ? 'ALL CHECKS PASS' : 'CHECK(S) FAILED')),
             PW / 2, y + 7.5, { align: 'center' });
    y += 16;

    /* — Busbar identification — */
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 40);
    doc.text(pdfSafe(`${mat.label}  ${w}\xd7${t} mm${n > 1 ? '  \xd7' + n + ' bars/phase' : ''}  —  A = ${w * t} mm\xb2 \xd7 ${n} = ${w * t * n} mm\xb2`), M, y);
    y += 8;

    /* — Check rows — */
    y = sectionTitle(y, T[lang].bbChecksHdr || 'IEC 61439-1 Compliance Checks');

    const checkIds = [
      { id: 'bb-res-dt',      lbl: T[lang].bbChkDt      || '§10.10.3  Temperature rise, bare busbar (ΔT ≤ 105 K)' },
      { id: 'bb-res-term-dt', lbl: T[lang].bbChkTermDt  || '§10.10.3  Temperature rise, terminals (ΔT ≤ 70 K)' },
      { id: 'bb-res-amp',     lbl: T[lang].bbChkAmp     || 'Ampacity  —  In ≤ Iz (busbar limit)' },
      { id: 'bb-res-sc',      lbl: T[lang].bbChkSc      || '§10.11  Short-circuit thermal  (S ≥ Smin = Ik·√t / k)' },
      { id: 'bb-res-mech',    lbl: T[lang].bbChkMech    || '§10.2  Peak-force bending stress  (σ ≤ σy) — IEC 61439-1' },
      { id: 'bb-res-defl',    lbl: T[lang].bbChkDefl    || 'Deflection  (δ ≤ Ls/200 — engineering practice, not IEC 61439-1)' },
      { id: 'bb-res-clear',   lbl: T[lang].bbChkClear   || '§10.3  Air clearance, phase-to-phase  (IEC 61439-1 Table 12)' },
      { id: 'bb-res-vd',      lbl: T[lang].bbChkVd      || 'Voltage drop  (≤ 1 % — design practice, no IEC numeric limit)' },
    ];

    doc.setFontSize(8.5);
    const COL_R = PW - M;
    checkIds.forEach(({ id, lbl }, i) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (y > PH - M - 12) { doc.addPage(); hdr(); ftr(1); y = M + 22; }

      const bg = (i % 2 === 0) ? [248, 250, 253] : [255, 255, 255];
      doc.setFillColor(...bg);
      doc.rect(M, y - 3.5, BODY_W, 7.5, 'F');

      const isPas = el.classList.contains('bb-pass');
      const isFai = el.classList.contains('bb-fail');
      const resCol = isPas ? [0, 140, 80] : isFai ? [200, 50, 50] : [160, 110, 0];

      doc.setFont('helvetica', 'normal'); doc.setTextColor(50, 50, 50);
      doc.text(pdfSafe(lbl), M + 2, y);

      doc.setFont('helvetica', 'bold'); doc.setTextColor(...resCol);
      doc.text(pdfSafe(el.textContent || ''), COL_R - 1, y, { align: 'right' });

      doc.setDrawColor(220, 225, 235); doc.setLineWidth(0.15);
      doc.line(M, y + 4, PW - M, y + 4);
      y += 8;
    });

    /* — VD footnote — */
    y += 2;
    doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(110, 110, 110);
    doc.text(pdfSafe('* Voltage drop is shown for reference. IEC 61439-1 specifies no numeric VD limit.'), M, y);
    y += 6;

    /* — Key values grid — */
    if (y < PH - M - 55) {
      y = sectionTitle(y, T[lang].bbKvHdr || 'Key Calculation Values');
      const kvIds = [
        { id: 'bb-kv-dt',      lbl: T[lang].bbKvDt     || 'ΔT per bar'          },
        { id: 'bb-kv-theta',   lbl: T[lang].bbKvTheta  || 'θ operating'          },
        { id: 'bb-kv-iz-bus',  lbl: T[lang].bbKvIzBus  || 'Iz (105 K busbar)'        },
        { id: 'bb-kv-iz-term', lbl: T[lang].bbKvIzTerm || 'Iz (70 K terminals)'      },
        { id: 'bb-kv-smin',    lbl: T[lang].bbKvSmin   || 'Smin SC thermal'          },
        { id: 'bb-kv-stotal',  lbl: T[lang].bbKvStotal || 'S total'                  },
        { id: 'bb-kv-ipk',     lbl: T[lang].bbKvIpk    || 'Ipk peak'       },
        { id: 'bb-kv-fem',     lbl: T[lang].bbKvFem    || 'Force f'                  },
        { id: 'bb-kv-sigma',   lbl: T[lang].bbKvSigma  || 'sigma_max' },
        { id: 'bb-kv-delta',   lbl: T[lang].bbKvDelta  || 'Deflection delta'        },
        { id: 'bb-kv-du',      lbl: T[lang].bbKvDu     || 'DeltaU voltage drop'     },
      ];
      const COLS = 3;
      const CW   = BODY_W / COLS;
      let col = 0, rowY = y;
      kvIds.forEach(({ id, lbl }) => {
        const el = document.getElementById(id);
        if (!el) return;
        /* start new row? check page overflow */
        if (col === 0 && rowY > PH - M - 16) {
          doc.addPage(); hdr(); ftr(1); rowY = M + 22; y = rowY;
        }
        const xPos = M + col * CW;
        doc.setFillColor(245, 248, 252);
        doc.roundedRect(xPos + 1, rowY - 2, CW - 2, 12, 1.5, 1.5, 'F');
        doc.setFontSize(7);   doc.setFont('helvetica', 'normal'); doc.setTextColor(110, 120, 140);
        doc.text(pdfSafe(lbl), xPos + 4, rowY + 2);
        doc.setFontSize(9.5); doc.setFont('helvetica', 'bold');   doc.setTextColor(0, 80, 160);
        doc.text(pdfSafe(el.textContent || ''), xPos + 4, rowY + 8.5);
        col++;
        if (col >= COLS) { col = 0; rowY += 14; }
      });
      y = rowY + (col > 0 ? 14 : 0);
    }

    /* ════════════════════════════════════════════════════════════════
       PAGE 2+ — Step-by-step calculation
       ════════════════════════════════════════════════════════════════ */
    doc.addPage();
    let curPage = 2;
    hdr(); ftr(curPage);
    y = M + 22;
    y = sectionTitle(y, (T[lang].bbStepsHdr || 'Step-by-Step Calculation') + '  (IEC 61439-1 / IEC 60865-1)');

    stepsLines.forEach(rawLine => {
      /* blank line */
      if (!rawLine.trim()) { y += 2.5; return; }

      /* section header: lines starting with "== " */
      if (/^==/.test(rawLine)) {
        if (y > PH - M - 20) {
          curPage++;
          doc.addPage(); hdr(); ftr(curPage); y = M + 22;
        }
        y += 2;
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 80, 160);
        doc.text(pdfSafe(rawLine), M, y);
        y += 4;
        doc.setDrawColor(180, 200, 230); doc.setLineWidth(0.3);
        doc.line(M, y, PW - M, y);
        y += 4;
        doc.setTextColor(40, 40, 40);
        return;
      }

      /* result lines: contain "[OK]" or "[FAIL]" or "[!]" */
      const isResult = /\[OK\]|\[FAIL\]|\[!\]/.test(rawLine);
      const isIndent  = rawLine.startsWith('  ');

      if (y > PH - M - 8) {
        curPage++;
        doc.addPage(); hdr(); ftr(curPage); y = M + 22;
      }

      if (isResult) {
        const isOk   = rawLine.includes('[OK]');
        const isFail = rawLine.includes('[FAIL]');
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(isOk ? 0 : isFail ? 200 : 160, isOk ? 140 : isFail ? 50 : 110, isOk ? 80 : 50);
        doc.text(pdfSafe(rawLine.trim()), M + (isIndent ? 6 : 0), y);
        doc.setFont('helvetica', 'normal');
      } else if (isIndent) {
        /* formula / indented math */
        doc.setFontSize(7.8); doc.setFont('courier', 'normal'); doc.setTextColor(60, 60, 60);
        doc.text(pdfSafe(rawLine.trimStart()), M + 6, y);
      } else {
        /* plain explanatory text */
        doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40);
        doc.text(pdfSafe(rawLine), M, y);
      }
      y += STEP_LH;
    });

    const fn = 'busbar_IEC61439_' + pdfSafe(mat.label) + '_' + w + 'x' + t + 'mm'
               + (n > 1 ? '_' + n + 'bars' : '') + '.pdf';
    doc.save(fn);

  } finally {
    if (btn) { btn.textContent = T[lang].bbPdfBtn || 'Export PDF'; btn.disabled = false; }
  }
}
