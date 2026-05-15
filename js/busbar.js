/* =====================================================================
   BUS BAR SIZING CALCULATOR — IEC 61439-1:2011
   Checks: temperature rise, short-circuit thermal withstand,
   peak electromagnetic force + mechanical stress, deflection,
   voltage drop.
   ===================================================================== */

/* ── Material properties ─────────────────────────────────────────────── */
const BB_MAT = {
  cu: {
    rho20:   17.24e-9,  // Ω·m    (IEC 60228 / IEC 62317)
    alpha20:  3.93e-3,  // K⁻¹
    E_mod:   120e9,     // Pa     Young's modulus (hard-drawn Cu)
    sigma_y: 150e6,     // Pa     0.2% proof stress (commercial hard-drawn)
    k_sc:    141,       // A·s^½/mm²  (IEC 60364-4-43, bare Cu 20→300 °C)
    label:   'Cu',
  },
  al: {
    rho20:   28.3e-9,
    alpha20:  4.03e-3,
    E_mod:    70e9,
    sigma_y:  70e6,     // Pa     conservative (soft alloy EN-AW 1350 / 1050A)
    k_sc:     93,       // A·s^½/mm²
    label:   'Al',
  },
};

/* ── Natural-convection + radiation h_eff [W/(m²·K)] ─────────────────── */
const BB_H = {
  edge:     12,   // on-edge, wide face vertical  — best convection
  flat_v:   10,   // flat-vertical (wide face points sideways)
  flat_h:    9,   // flat-horizontal (wide face on top)  — worst
  enclosed:  6,   // sealed enclosure, no forced ventilation
};

/* ── Parallel-bar derating (mutual thermal coupling) ─────────────────── */
const BB_PAR = { 1: 1.00, 2: 0.90, 3: 0.83, 4: 0.80 };

/* ── IEC 61439-1:2011 Table 5 ΔT limits ─────────────────────────────── */
const BB_DT_BUSBAR   = 105;  // K  — internal bare busbar conductors
const BB_DT_TERMINAL =  70;  // K  — terminals for external cables

/* ── Standard busbar sizes [width mm, thickness mm] ──────────────────── */
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
    o.textContent = `${w} × ${t} mm  (${w * t} mm²)`;
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

/* ── Main calculation ─────────────────────────────────────────────────── */
function bbCalculate() {

  /* read active buttons */
  const matEl = document.querySelector('[data-bb-mat].active') ||
                document.querySelector('[data-bb-mat]');
  const sysEl = document.querySelector('[data-bb-sys].active') ||
                document.querySelector('[data-bb-sys]');
  const matKey = matEl ? matEl.dataset.bbMat : 'cu';
  const sysKey = sysEl ? sysEl.dataset.bbSys : 'ac3';
  const M = BB_MAT[matKey];

  const w     = parseFloat(document.getElementById('bb-width').value);     // mm
  const t     = parseFloat(document.getElementById('bb-thick').value);     // mm
  const n     = parseInt(document.getElementById('bb-parallel').value, 10);
  const L     = parseFloat(document.getElementById('bb-length').value);    // m
  const inst  = document.getElementById('bb-inst').value;
  const In    = parseFloat(document.getElementById('bb-current').value);   // A
  const Un    = parseFloat(document.getElementById('bb-voltage').value);   // V
  const cosph = (sysKey === 'dc')
                  ? 1
                  : parseFloat(document.getElementById('bb-cosphi').value);
  const Ta    = parseFloat(document.getElementById('bb-tamb').value);      // °C
  const Ik    = parseFloat(document.getElementById('bb-ik').value);        // kA
  const tsc   = parseFloat(document.getElementById('bb-tsc').value);       // s
  const kap   = parseFloat(document.getElementById('bb-kappa').value);
  const Ls    = parseFloat(document.getElementById('bb-lsupp').value);     // mm
  const dcc   = parseFloat(document.getElementById('bb-dcc').value);       // mm

  if ([w, t, n, L, In, Un, cosph, Ta, Ik, tsc, kap, Ls, dcc].some(v => isNaN(v) || v <= 0)) {
    showToast(T[lang].bbErrInputs || 'Please fill all fields with positive values.');
    return;
  }

  /* ── derived geometry ──────────────────────────────────────────────── */
  const A_mm2 = w * t;
  const A_m2  = A_mm2 * 1e-6;
  const P_mm  = 2 * (w + t);
  const P_m   = P_mm  * 1e-3;
  const Ls_m  = Ls  * 1e-3;
  const dcc_m = dcc * 1e-3;
  const Ik_A  = Ik  * 1000;
  const h     = BB_H[inst] || 9;

  /* ══════════════════════════════════════════════════════════════════════
     CHECK 1 — Temperature rise & ampacity  (IEC 61439-1 §10.10 / Table 5)
     Closed-form steady-state energy balance per unit length:
       I² · ρ(θ) / A  =  h · P · ΔT
       ΔT = I²·R₀ₘ / (HC − I²·α·ρ₂₀/A)
     ══════════════════════════════════════════════════════════════════════ */
  const R0_pm  = M.rho20 * (1 + M.alpha20 * (Ta - 20)) / A_m2;  // Ω/m at Ta
  const HC     = h * P_m;                                          // W/(m·K)
  const dR_dT  = M.rho20 * M.alpha20 / A_m2;                      // Ω/(m·K)
  const I_bar  = In / n;
  const HC_net = HC - I_bar * I_bar * dR_dT;
  const DeltaT = HC_net > 0 ? I_bar * I_bar * R0_pm / HC_net : Infinity;
  const theta_op = Ta + DeltaT;

  /* ampacity at each ΔT limit */
  const Iz_bar_bus  = Math.sqrt(HC * BB_DT_BUSBAR   / (R0_pm + dR_dT * BB_DT_BUSBAR));
  const Iz_bar_term = Math.sqrt(HC * BB_DT_TERMINAL  / (R0_pm + dR_dT * BB_DT_TERMINAL));
  const k_par        = BB_PAR[n] || 0.80;
  const Iz_tot_bus   = n * Iz_bar_bus  * k_par;
  const Iz_tot_term  = n * Iz_bar_term * k_par;

  const pass_dt      = isFinite(DeltaT) && DeltaT <= BB_DT_BUSBAR;
  const pass_term_dt = isFinite(DeltaT) && DeltaT <= BB_DT_TERMINAL;
  const pass_amp     = In <= Iz_tot_bus;
  const amp_margin   = isFinite(Iz_tot_bus)
                         ? (Iz_tot_bus - In) / Iz_tot_bus * 100
                         : -999;

  /* ══════════════════════════════════════════════════════════════════════
     CHECK 2 — Short-circuit thermal withstand  (IEC 61439-1 §10.11)
     Adiabatic formula (IEC 60865-1 / IEC 60364-4-43):
       S_min = Ik · √t / k  [mm²]
     ══════════════════════════════════════════════════════════════════════ */
  const S_min   = Ik_A * Math.sqrt(tsc) / M.k_sc;
  const S_total = A_mm2 * n;
  const pass_sc = S_total >= S_min;
  const sc_marg = (S_total - S_min) / S_min * 100;

  /* ══════════════════════════════════════════════════════════════════════
     CHECK 3 — Peak electromagnetic force & mechanical withstand
               (IEC 61439-1 §10.2 / IEC 60865-1)
     f = (μ₀/2π) · I_pk² / d  =  2×10⁻⁷ · I_pk² / d  [N/m]
     Beam: simply-supported, uniform distributed load
       M_max = f·L²/8,  σ_max = M_max/Z
     ══════════════════════════════════════════════════════════════════════ */
  const Ipk  = kap * Math.SQRT2 * Ik_A;
  const f_em = 2e-7 * Ipk * Ipk / dcc_m;   // N/m

  /* Section modulus for bending in the horizontal (phase-spacing) direction */
  const w_m = w * 1e-3, t_m = t * 1e-3;
  let I_bend, Z_bend;
  if (inst === 'edge') {
    /* on-edge: wide face vertical → thin dimension resists horizontal force (WEAK) */
    I_bend = w_m * Math.pow(t_m, 3) / 12;
    Z_bend = w_m * Math.pow(t_m, 2) / 6;
  } else {
    /* flat:  wide face horizontal → wide dimension resists horizontal force (STRONG) */
    I_bend = t_m * Math.pow(w_m, 3) / 12;
    Z_bend = t_m * Math.pow(w_m, 2) / 6;
  }

  const Mbend     = f_em * Ls_m * Ls_m / 8;
  const sigma_max = Mbend / Z_bend;
  const pass_mech = sigma_max <= M.sigma_y;
  const mech_marg = (M.sigma_y - sigma_max) / M.sigma_y * 100;

  /* deflection — simply-supported beam, UDL */
  const delta_m   = 5 * f_em * Math.pow(Ls_m, 4) / (384 * M.E_mod * I_bend);
  const delta_lim = Ls_m / 200;
  const pass_defl = delta_m <= delta_lim;
  const defl_marg = (delta_lim - delta_m) / delta_lim * 100;

  /* ══════════════════════════════════════════════════════════════════════
     CHECK 4 — Voltage drop  (IEC 61439-1 §10.10.4 — informational)
     No explicit numeric limit in IEC 61439; ≤1 % is common design practice.
     ══════════════════════════════════════════════════════════════════════ */
  const theta_mean = Ta + (isFinite(DeltaT) ? DeltaT / 2 : BB_DT_BUSBAR / 2);
  const rho_op = M.rho20 * (1 + M.alpha20 * (theta_mean - 20));
  const R_bus  = rho_op * L / (A_m2 * n);
  const X_bus  = 0.12e-3 * L;   /* ≈ 0.12 mΩ/m for typical LV busbar spacing at 50 Hz */
  const sinph  = Math.sqrt(Math.max(0, 1 - cosph * cosph));
  let dU_V;
  switch (sysKey) {
    case 'ac3': dU_V = Math.sqrt(3) * In * (R_bus * cosph + X_bus * sinph); break;
    case 'ac1': dU_V = 2 * In * (R_bus * cosph + X_bus * sinph); break;
    default:    dU_V = 2 * In * R_bus; break;
  }
  const dU_pct = dU_V / Un * 100;
  const pass_vd = dU_pct <= 1.0;

  /* overall structural pass (VD is informational only) */
  const overall_pass = pass_dt && pass_sc && pass_mech && pass_defl;

  /* ── helpers ────────────────────────────────────────────────────────── */
  const fmt  = (v, d = 2) => isFinite(v) ? v.toFixed(d) : '∞';
  const fmtE = (v, d = 3) => v.toExponential(d);
  const pf   = (p) => p ? '✅ PASS' : '❌ FAIL';

  /* ── step-by-step report ─────────────────────────────────────────────── */
  const lines = [
    `══ INPUTS ══`,
    `Material:          ${M.label}`,
    `Busbar section:    ${w} × ${t} mm  →  A = ${A_mm2} mm²  ×  ${n} bar/phase`,
    `Cooling perimeter: P = 2·(${w}+${t}) = ${P_mm} mm`,
    `Bus length L:      ${L} m`,
    `Installation:      ${inst}  →  h_eff = ${h} W/(m²·K)`,
    `System:            ${sysKey.toUpperCase()}    In = ${In} A    Un = ${Un} V`,
    `Ambient Ta:        ${Ta} °C`,
    ``,
    `══ CHECK 1 — TEMPERATURE RISE  (IEC 61439-1 §10.10 / Table 5) ══`,
    `Steady-state thermal balance per unit length:`,
    `  I²·ρ(θ)/A = h·P·ΔT`,
    ``,
    `R₀/m at ${Ta} °C:`,
    `  = ρ₂₀·(1+α·(Ta−20))/A`,
    `  = ${fmtE(M.rho20)}·(1+${M.alpha20}·(${Ta}−20)) / ${fmtE(A_m2)}`,
    `  = ${fmtE(R0_pm)} Ω/m`,
    `HC = h·P = ${h} · ${fmt(P_m, 5)} = ${fmt(HC, 5)} W/(m·K)`,
    `I per bar = ${In} / ${n} = ${fmt(I_bar, 2)} A`,
    `ΔT = I²·R₀/m / (HC − I²·α·ρ₂₀/A)`,
    `   = ${fmt(I_bar,2)}²·${fmtE(R0_pm)} / (${fmt(HC,5)} − ${fmt(I_bar,2)}²·${fmtE(dR_dT)})`,
    `   = ${fmt(DeltaT, 2)} K   →   θ_op = ${fmt(theta_op, 1)} °C`,
    ``,
    `IEC 61439-1 Table 5 limits:`,
    `  Bare busbar conductors (internal): ΔT ≤ ${BB_DT_BUSBAR} K  →  ${pf(pass_dt)}`,
    `  Terminals (ext. cable connection): ΔT ≤ ${BB_DT_TERMINAL} K  →  ${pass_term_dt ? '✅ PASS' : '⚠ EXCEEDS — verify terminal rating'}`,
    ``,
    `Iz single bar @ ΔT = ${BB_DT_BUSBAR} K:  √(HC·ΔT/(R₀+dR·ΔT)) = ${fmt(Iz_bar_bus, 1)} A`,
    `Iz single bar @ ΔT = ${BB_DT_TERMINAL} K (terminals):           = ${fmt(Iz_bar_term, 1)} A`,
    `Parallel derating n=${n}: k_par = ${k_par}`,
    `Iz total (${n}×, busbar limit):   ${fmt(Iz_tot_bus,  1)} A`,
    `Iz total (${n}×, terminal limit): ${fmt(Iz_tot_term, 1)} A`,
    `In = ${In} A  ≤  Iz = ${fmt(Iz_tot_bus,1)} A  →  ${pf(pass_amp)}  (margin ${fmt(amp_margin,1)} %)`,
    ``,
    `══ CHECK 2 — SHORT-CIRCUIT THERMAL WITHSTAND  (IEC 61439-1 §10.11) ══`,
    `Adiabatic formula (IEC 60865-1):  S_min = Ik · √t / k`,
    `k = ${M.k_sc} A·s^0.5/mm²  (${M.label} bare, 20 → 300 °C per IEC 60364-4-43)`,
    `S_min = ${fmt(Ik_A,0)} · √${tsc} / ${M.k_sc}`,
    `      = ${fmt(Ik_A,0)} · ${fmt(Math.sqrt(tsc),4)} / ${M.k_sc}`,
    `      = ${fmt(S_min, 2)} mm²`,
    `S total = ${n} × ${A_mm2} = ${S_total} mm²`,
    `S_total ≥ S_min  →  ${pf(pass_sc)}  (margin ${fmt(sc_marg,1)} %)`,
    ``,
    `══ CHECK 3 — PEAK FORCE & MECHANICAL WITHSTAND  (IEC 61439-1 §10.2) ══`,
    `Peak current:`,
    `  κ = ${kap}  (IEC 60909 peak factor)`,
    `  I_pk = κ · √2 · Ik = ${fmt(kap,2)} · 1.4142 · ${fmt(Ik_A,0)} = ${fmt(Ipk,0)} A  (${fmt(Ipk/1e3,2)} kA)`,
    ``,
    `Electromagnetic force (2-conductor model):`,
    `  f = 2×10⁻⁷ · I_pk² / d_cc`,
    `    = 2×10⁻⁷ · ${fmt(Ipk,0)}² / ${fmt(dcc_m,4)}`,
    `    = ${fmt(f_em, 2)} N/m`,
    ``,
    `Simply-supported beam  L_s = ${Ls} mm:`,
    inst === 'edge'
      ? `  Orientation: on-edge → WEAK axis  (Z = w·t²/6 = ${w}·${t}²/6 = ${fmt(Z_bend*1e9,2)} ×10⁻⁹ m³)`
      : `  Orientation: flat → STRONG axis  (Z = t·w²/6 = ${t}·${w}²/6 = ${fmt(Z_bend*1e9,2)} ×10⁻⁹ m³)`,
    `  M_max = f·L_s²/8 = ${fmt(f_em,2)} · ${fmt(Ls_m,4)}² / 8 = ${fmt(Mbend,4)} N·m`,
    `  σ_max = M_max/Z = ${fmt(sigma_max/1e6, 2)} MPa  vs  σ_y(${M.label}) = ${M.sigma_y/1e6} MPa`,
    `  σ_max ≤ σ_y  →  ${pf(pass_mech)}  (margin ${fmt(mech_marg,1)} %)`,
    ``,
    `Deflection (limit L_s/200 = ${fmt(delta_lim*1000,2)} mm):`,
    `  δ = 5·f·L⁴ / (384·E·I)`,
    `    = 5·${fmt(f_em,2)}·${fmt(Ls_m,4)}⁴ / (384·${fmtE(M.E_mod)}·${fmtE(I_bend)})`,
    `    = ${fmt(delta_m*1000, 4)} mm`,
    `  δ ≤ L_s/200  →  ${pf(pass_defl)}  (margin ${fmt(defl_marg,1)} %)`,
    ``,
    `══ CHECK 4 — VOLTAGE DROP  (IEC 61439-1 §10.10.4) ══`,
    `Informational — no explicit IEC 61439 numeric limit; ≤1 % is common practice.`,
    `ρ @ θ_mean = ${fmt(theta_mean,1)} °C:  ${fmtE(rho_op)} Ω·m`,
    `R = ρ·L/(A·n) = ${fmtE(rho_op)}·${L} / (${fmtE(A_m2)}·${n}) = ${fmt(R_bus*1e3,4)} mΩ`,
    `X ≈ 0.12 mΩ/m · ${L} m = ${fmt(X_bus*1e3,4)} mΩ   (50 Hz estimate)`,
    sysKey === 'dc'
      ? `ΔU = 2·In·R = 2·${In}·${fmt(R_bus*1e3,4)} mΩ = ${fmt(dU_V,4)} V`
      : sysKey === 'ac3'
        ? `ΔU = √3·In·(R·cosφ + X·sinφ) = ${fmt(dU_V,4)} V  [3-phase]`
        : `ΔU = 2·In·(R·cosφ + X·sinφ) = ${fmt(dU_V,4)} V  [1-phase]`,
    `ΔU% = ${fmt(dU_V,4)} / ${Un} × 100 = ${fmt(dU_pct,3)} %   →  ${pass_vd ? '✅ ≤1 %' : '⚠ >1 % (review)'}`,
  ];

  /* ── render ─────────────────────────────────────────────────────────── */
  document.getElementById('bb-res-card').style.display = '';
  document.getElementById('bb-steps').textContent = lines.join('\n');

  /* overall verdict */
  const vrd = document.getElementById('bb-verdict');
  vrd.textContent = overall_pass
    ? (T[lang].bbOverallPass || '✅ All IEC 61439-1 structural checks PASS')
    : (T[lang].bbOverallFail || '❌ One or more checks FAIL — review highlighted items');
  vrd.className = 'sc-trip-box ' + (overall_pass ? 'sc-trip-ok' : 'sc-trip-fail');

  /* check badges */
  _bbBadge('bb-res-dt',      pass_dt,      `${fmt(DeltaT,1)} K  (limit ${BB_DT_BUSBAR} K)`);
  _bbBadge('bb-res-term-dt', pass_term_dt, `${fmt(DeltaT,1)} K  (limit ${BB_DT_TERMINAL} K)`, /*warnOnly=*/true);
  _bbBadge('bb-res-amp',     pass_amp,     `${fmt(In,0)} A  ≤  ${fmt(Iz_tot_bus,0)} A   +${fmt(amp_margin,1)} %`);
  _bbBadge('bb-res-sc',      pass_sc,      `${fmt(S_total,0)} mm²  ≥  ${fmt(S_min,1)} mm²   +${fmt(sc_marg,1)} %`);
  _bbBadge('bb-res-mech',    pass_mech,    `σ = ${fmt(sigma_max/1e6,1)} MPa  ≤  ${M.sigma_y/1e6} MPa   +${fmt(mech_marg,1)} %`);
  _bbBadge('bb-res-defl',    pass_defl,    `δ = ${fmt(delta_m*1000,3)} mm  ≤  L/200 = ${fmt(delta_lim*1000,2)} mm`);
  _bbBadge('bb-res-vd',      pass_vd,      `ΔU = ${fmt(dU_pct,3)} %  (≤1 % practice)`, /*warnOnly=*/false, /*isInfo=*/true);

  /* key-value cells */
  _bbKV('bb-kv-dt',        fmt(DeltaT,1)        + ' K');
  _bbKV('bb-kv-theta',     fmt(theta_op,1)       + ' °C');
  _bbKV('bb-kv-iz-bus',    fmt(Iz_tot_bus,0)     + ' A');
  _bbKV('bb-kv-iz-term',   fmt(Iz_tot_term,0)    + ' A');
  _bbKV('bb-kv-smin',      fmt(S_min,1)          + ' mm²');
  _bbKV('bb-kv-stotal',    S_total               + ' mm²');
  _bbKV('bb-kv-ipk',       fmt(Ipk/1e3,2)        + ' kA');
  _bbKV('bb-kv-fem',       fmt(f_em,1)           + ' N/m');
  _bbKV('bb-kv-sigma',     fmt(sigma_max/1e6,1)  + ' MPa');
  _bbKV('bb-kv-delta',     fmt(delta_m*1000,3)   + ' mm');
  _bbKV('bb-kv-du',        fmt(dU_V,3)           + ' V  (' + fmt(dU_pct,3) + ' %)');
}

/* ── badge helper ─────────────────────────────────────────────────────── */
function _bbBadge(id, pass, text, warnOnly = false, isInfo = false) {
  const el = document.getElementById(id);
  if (!el) return;
  let icon, cls;
  if (pass) {
    icon = '✅'; cls = 'bb-pass';
  } else if (isInfo) {
    icon = '⚠'; cls = 'bb-warn';
  } else if (warnOnly) {
    icon = '⚠'; cls = 'bb-warn';
  } else {
    icon = '❌'; cls = 'bb-fail';
  }
  el.textContent = icon + '  ' + text;
  el.className = 'bb-badge ' + cls;
}

function _bbKV(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ── PDF export ───────────────────────────────────────────────────────── */
function bbDownloadPdf() {
  if (typeof window.jspdf === 'undefined') { alert('jsPDF not loaded'); return; }
  const { jsPDF } = window.jspdf;

  const btn = document.getElementById('bb-pdf-btn');
  if (btn) { btn.textContent = 'Generating…'; btn.disabled = true; }

  try {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const PW = 210, PH = 297, M = 15;

    const engineer = (document.getElementById('bb-engineer') || {}).value || '';
    const stepsRaw = (document.getElementById('bb-steps')    || {}).textContent || '';
    const matEl    = document.querySelector('[data-bb-mat].active') || document.querySelector('[data-bb-mat]');
    const mat      = BB_MAT[matEl ? matEl.dataset.bbMat : 'cu'];
    const w        = parseFloat(document.getElementById('bb-width').value);
    const t        = parseFloat(document.getElementById('bb-thick').value);
    const n        = parseInt(document.getElementById('bb-parallel').value, 10) || 1;

    const title    = T[lang].bbPdfTitle || 'Bus Bar Sizing — IEC 61439-1';
    const standard = 'IEC 61439-1:2011 / IEC 60865-1';
    const ACC      = [0, 80, 160];

    /* ── count pages first (results page + steps pages) ── */
    const lineH    = 4.0;
    const pageBody = PH - M - 22 - (M + 8);  // usable height per steps page
    const stepsLines = stepsRaw.split('\n');
    const stepsPages = Math.max(1, Math.ceil(stepsLines.length * lineH / pageBody));
    const TOTAL_PAGES = 1 + stepsPages;

    function drawHeader() {
      pdfMakeHeader(doc, { PW, M, title: pdfSafe(title) });
    }
    function drawFooter(pageNum) {
      pdfMakeFooter(doc, { PW, PH, M, pageNum, totalPages: TOTAL_PAGES, engineer, standard });
    }
    function secTitle(y, text) {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.setTextColor(...ACC);
      doc.text(pdfSafe(text), M, y); y += 4.5;
      doc.setDrawColor(200, 210, 225); doc.setLineWidth(0.2);
      doc.line(M, y, PW - M, y); y += 4;
      doc.setTextColor(40, 40, 40);
      return y;
    }

    /* ════════════════════════════════════════════════════════════
       PAGE 1 — Results summary
       ════════════════════════════════════════════════════════════ */
    drawHeader();
    drawFooter(1);
    let y = M + 22;

    y = secTitle(y, (T[lang].bbChecksHdr || 'IEC 61439-1 Compliance Checks') + '  — ' + pdfSafe(mat.label) + '  ' + w + '\xd7' + t + ' mm  \xd7' + n);

    /* collect check rows from the DOM */
    const checkIds = [
      { id: 'bb-res-dt',      label: T[lang].bbChkDt      || 'Temperature rise (busbar)' },
      { id: 'bb-res-term-dt', label: T[lang].bbChkTermDt  || 'Temperature rise (terminals)' },
      { id: 'bb-res-amp',     label: T[lang].bbChkAmp     || 'Ampacity' },
      { id: 'bb-res-sc',      label: T[lang].bbChkSc      || 'Short-circuit thermal withstand' },
      { id: 'bb-res-mech',    label: T[lang].bbChkMech    || 'Mechanical (bending stress)' },
      { id: 'bb-res-defl',    label: T[lang].bbChkDefl    || 'Deflection' },
      { id: 'bb-res-vd',      label: T[lang].bbChkVd      || 'Voltage drop (informational)' },
    ];

    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
    checkIds.forEach(({ id, label }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const txt   = pdfSafe(el.textContent || '');
      const isPas = el.classList.contains('bb-pass');
      const isFai = el.classList.contains('bb-fail');
      const isWar = el.classList.contains('bb-warn');
      const statusColor = isPas ? [0, 140, 80] : isFai ? [200, 50, 50] : isWar ? [180, 120, 0] : [80, 80, 80];

      if (y > PH - M - 14) { doc.addPage(); drawHeader(); drawFooter(1); y = M + 22; }

      doc.setTextColor(40, 40, 40);
      doc.text(pdfSafe(label), M, y);
      doc.setTextColor(...statusColor);
      doc.text(txt, PW - M, y, { align: 'right' });
      doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.15);
      doc.line(M, y + 1.5, PW - M, y + 1.5);
      y += 6.5;
    });

    /* overall verdict */
    y += 3;
    const verdictEl = document.getElementById('bb-verdict');
    if (verdictEl) {
      const isPass = verdictEl.classList.contains('bb-pass');
      doc.setFontSize(10); doc.setFont('helvetica', 'bold');
      doc.setTextColor(isPass ? 0 : 200, isPass ? 140 : 50, isPass ? 80 : 50);
      doc.text(pdfSafe(verdictEl.textContent || ''), M, y);
      y += 8;
    }

    /* key-value grid */
    y += 2;
    if (y < PH - M - 40) {
      y = secTitle(y, T[lang].bbKvHdr || 'Key Values');
      const kvIds = [
        { id: 'bb-kv-dt',     label: T[lang].bbKvDt     || 'dT' },
        { id: 'bb-kv-theta',  label: T[lang].bbKvTheta  || 'theta_op' },
        { id: 'bb-kv-iz-bus', label: T[lang].bbKvIzBus  || 'Iz (busbar)' },
        { id: 'bb-kv-iz-term',label: T[lang].bbKvIzTerm || 'Iz (terminal)' },
        { id: 'bb-kv-smin',   label: T[lang].bbKvSmin   || 'S_min' },
        { id: 'bb-kv-stotal', label: T[lang].bbKvStotal || 'S_total' },
        { id: 'bb-kv-ipk',    label: T[lang].bbKvIpk    || 'I_pk' },
        { id: 'bb-kv-fem',    label: T[lang].bbKvFem    || 'f_em' },
        { id: 'bb-kv-sigma',  label: T[lang].bbKvSigma  || 'sigma_max' },
        { id: 'bb-kv-delta',  label: T[lang].bbKvDelta  || 'delta' },
        { id: 'bb-kv-du',     label: T[lang].bbKvDu     || 'dU%' },
      ];
      const colW = (PW - 2 * M) / 3;
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      kvIds.forEach(({ id, label }, i) => {
        const el = document.getElementById(id);
        if (!el) return;
        const col = i % 3;
        const xPos = M + col * colW;
        if (col === 0 && i > 0) y += 9;
        if (y > PH - M - 14) { doc.addPage(); drawHeader(); drawFooter(1); y = M + 22; }
        doc.setTextColor(100, 100, 100);
        doc.text(pdfSafe(label), xPos, y);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 80, 160);
        doc.text(pdfSafe(el.textContent || ''), xPos, y + 4);
        doc.setFont('helvetica', 'normal');
      });
    }

    /* ════════════════════════════════════════════════════════════
       PAGE 2+ — Step-by-step calculation
       ════════════════════════════════════════════════════════════ */
    doc.addPage();
    drawHeader();
    drawFooter(2);
    y = M + 22;
    let curPage = 2;

    y = secTitle(y, (T[lang].bbStepsHdr || 'Step-by-Step Calculation') + '  (IEC 61439-1 / IEC 60865-1)');

    doc.setFontSize(8.0); doc.setFont('courier', 'normal'); doc.setTextColor(30, 30, 30);
    stepsLines.forEach(rawLine => {
      if (!rawLine.trim()) { y += 2; return; }

      /* section headers: lines starting with == */
      const isSec = /^[=═]{2}/.test(rawLine);
      if (isSec) {
        if (y > PH - M - 18) {
          curPage++;
          doc.addPage(); drawHeader(); drawFooter(curPage); y = M + 22;
        }
        doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...ACC);
        doc.text(pdfSafe(rawLine), M, y); y += 4.5;
        doc.setDrawColor(200, 210, 225); doc.setLineWidth(0.15);
        doc.line(M, y, PW - M, y); y += 3.5;
        doc.setFontSize(8.0); doc.setFont('courier', 'normal'); doc.setTextColor(30, 30, 30);
        return;
      }

      if (y > PH - M - 8) {
        curPage++;
        doc.addPage(); drawHeader(); drawFooter(curPage); y = M + 22;
      }
      const indented = rawLine.startsWith('  ');
      doc.text(pdfSafe(rawLine.trimStart()), M + (indented ? 5 : 0), y);
      y += lineH;
    });

    const fn = 'busbar_IEC61439_' + pdfSafe(mat.label) + '_' + w + 'x' + t + 'mm' + (n > 1 ? '_' + n + 'bars' : '') + '.pdf';
    doc.save(fn);
  } finally {
    if (btn) { btn.textContent = T[lang].bbPdfBtn || 'Export PDF'; btn.disabled = false; }
  }
}
