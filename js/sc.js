// sc.js — Short-Circuit Current Calculator (IEC 60909 / IEC 60364)

const SC_RHO = { cu: 0.01786, al: 0.0282 }; // Ω·mm²/m at 20 °C

// Magnetic trip multipliers — lower bound = worst case for protection check
const SC_CURVES = {
  B: { min: 3,  label: 'B (3–5 × In)' },
  C: { min: 5,  label: 'C (5–10 × In)' },
  D: { min: 10, label: 'D (10–20 × In)' },
  K: { min: 8,  label: 'K (8–14 × In)' },
  Z: { min: 2,  label: 'Z (2–3 × In)' },
};

// gG fuse: use conventional fusing current I2 ≈ 1.6 × In (IEC 60269-2)
const SC_FUSE_FACTOR = 1.6;

let scSourceMode  = 'known'; // 'known' | 'transformer'
let scMaterial    = 'cu';
let scNetworkType = 'tns';   // 'tns' | 'tnc' | 'tt'
let scVoltPreset  = 230;     // 230 | 400 | 0=custom

// ─── helpers ─────────────────────────────────────────────────────────────────

function scGetUnLine() {
  if (scVoltPreset === 0) return parseFloat(document.getElementById('sc-un').value) || 230;
  return scVoltPreset;
}

// Phase voltage used in single-phase formula: Un/√3 for 400 V, Un for 230 V
function scGetU0() {
  const Un = scGetUnLine();
  return Un === 400 ? Un / Math.sqrt(3) : Un;
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
  const Un   = scGetUnLine();
  const ik_A = scGetIkBusbarKA() * 1000;
  const Zs   = ik_A > 0 ? Un / (Math.sqrt(3) * ik_A) : 0;
  const val  = document.getElementById('sc-zs-val');
  if (val) val.textContent = Zs > 0 ? (Zs * 1000).toFixed(2) + ' mΩ' : '—';
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
    hint.textContent = 'Min. magnetický proud: ' + (SC_CURVES[curve].min * In).toFixed(0) + ' A';
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
}

// ─── segment-button setters ───────────────────────────────────────────────────

function scSetVoltage(btn, v) {
  scVoltPreset = v;
  btn.closest('.seg-group').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('sc-v-custom-row').style.display = v === 0 ? 'block' : 'none';
  scUpdateZsDisplay();
}

function scSetMaterial(btn, mat) {
  scMaterial = mat;
  btn.closest('.seg-group').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const rho = SC_RHO[mat];
  document.getElementById('sc-rho-hint').textContent =
    'ρ = ' + rho + ' Ω·mm²/m (' + (mat === 'cu' ? 'Cu' : 'Al') + ', 20 °C)';
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

  const Un     = scGetUnLine();
  const U0     = scGetU0();
  const ik_kA  = scGetIkBusbarKA();
  const S      = parseFloat(document.getElementById('sc-s-phase').value);
  const Spe    = parseFloat(document.getElementById('sc-s-pe').value);
  const L      = parseFloat(document.getElementById('sc-len').value);
  const In     = parseFloat(document.getElementById('sc-dev-in').value);
  const Icu_kA = parseFloat(document.getElementById('sc-icu').value);
  const devType= document.getElementById('sc-dev-type').value;

  // Validation
  if ([Un, ik_kA, S, Spe, L, In, Icu_kA].some(v => isNaN(v) || v <= 0)) {
    return fail(T[lang].scErrFill);
  }

  let Re = 0;
  if (scNetworkType === 'tt') {
    Re = parseFloat(document.getElementById('sc-re').value);
    if (isNaN(Re) || Re < 0) return fail(T[lang].scErrFill);
  }

  const rho      = SC_RHO[scMaterial];
  const Ik_sup_A = ik_kA * 1000;

  // ── impedances ──
  const Zs    = Un / (Math.sqrt(3) * Ik_sup_A);   // source impedance per phase [Ω]
  const Rf    = rho * L / S;                        // phase conductor resistance [Ω]
  const Rpe   = rho * L / Spe;                      // PE conductor resistance [Ω]
  const Z3    = Zs + Rf;                            // loop impedance for 3-ph fault
  const Z1    = Zs + Rf + Rpe + Re;                 // loop impedance for 1-ph fault

  // ── fault currents ──
  const Ik3_A = Un / (Math.sqrt(3) * Z3);
  const Ik2_A = Ik3_A * Math.sqrt(3) / 2;
  // 0.8 coefficient per IEC 60909 / IEC 60364-4-41 (arc impedance + thermal change)
  const Ik1_A = 0.8 * U0 / Z1;

  const Ik3 = Ik3_A / 1000;
  const Ik2 = Ik2_A / 1000;
  const Ik1 = Ik1_A / 1000;

  // ── trip check ──
  const curveSel = document.getElementById('sc-dev-curve').value;
  const Itrip_min = devType === 'fuse'
    ? SC_FUSE_FACTOR * In
    : SC_CURVES[curveSel].min * In;

  const willTrip   = Ik1_A >= Itrip_min;
  const exceedsIcu = Ik3 > Icu_kA;

  // ── max cable length for guaranteed trip ──
  // Solve: 0.8 * U0 / (Zs + ρ·L·(1/S + 1/Spe) + Re) = Itrip_min
  //   → L_max = (0.8·U0/Itrip_min − Zs − Re) / (ρ·(1/S + 1/Spe))
  const L_max = (0.8 * U0 / Itrip_min - Zs - Re) / (rho * (1 / S + 1 / Spe));

  // ─── populate result elements ───────────────────────────────────────────────
  const fmtIk = v => v >= 1 ? v.toFixed(2) + ' kA' : (v * 1000).toFixed(0) + ' A';
  const fmtmO = v => (v * 1000).toFixed(2) + ' mΩ';

  document.getElementById('sc-r-zs').textContent    = fmtmO(Zs);
  document.getElementById('sc-r-rf').textContent    = fmtmO(Rf);
  document.getElementById('sc-r-rpe').textContent   = fmtmO(Rpe);
  document.getElementById('sc-r-zloop').textContent = fmtmO(Z1);

  document.getElementById('sc-r-ik3').textContent = fmtIk(Ik3);
  document.getElementById('sc-r-ik2').textContent = fmtIk(Ik2);
  document.getElementById('sc-r-ik1').textContent = fmtIk(Ik1);

  // trip status box
  const tripBox = document.getElementById('sc-trip-box');
  tripBox.className = 'sc-trip-box ' + (willTrip ? 'sc-trip-ok' : 'sc-trip-fail');
  document.getElementById('sc-trip-status').textContent = willTrip
    ? (lang === 'cze' ? '✅ Přístroj se JISTĚ vybaví' : '✅ Device WILL trip')
    : (lang === 'cze' ? '❌ Přístroj se NEMUSÍ vybaví' : '❌ Device may NOT trip');
  document.getElementById('sc-trip-detail').textContent =
    'Ik1 = ' + Ik1_A.toFixed(0) + ' A   ' + (willTrip ? '≥' : '<') + '   Imin = ' + Itrip_min.toFixed(0) + ' A';

  // Icu warning
  const icuBox = document.getElementById('sc-icu-box');
  icuBox.style.display = exceedsIcu ? 'block' : 'none';
  if (exceedsIcu) {
    icuBox.innerHTML = '⚠ <strong>Ik3 = ' + Ik3.toFixed(2) + ' kA &gt; Icu = ' + Icu_kA + ' kA</strong> — '
      + (lang === 'cze' ? 'přístroj NEVYHOVUJE danému místu připojení!' : 'device breaking capacity EXCEEDED!');
  }

  // max cable length
  const mlBox = document.getElementById('sc-maxlen-box');
  if (L_max > 0) {
    mlBox.textContent = L_max.toFixed(1) + ' m';
    mlBox.className   = 'sc-maxlen-box ' + (L > L_max ? 'sc-maxlen-warn' : 'sc-maxlen-ok');
    if (L > L_max) {
      mlBox.textContent += lang === 'cze'
        ? '  ⚠ Aktuální kabel (' + L + ' m) překračuje max. délku!'
        : '  ⚠ Current cable (' + L + ' m) exceeds max length!';
    }
  } else {
    mlBox.textContent = lang === 'cze'
      ? 'Nelze zaručit — zdroj příliš slabý'
      : 'Cannot guarantee — source too weak';
    mlBox.className = 'sc-maxlen-box sc-maxlen-warn';
  }

  // ─── calculation steps ──────────────────────────────────────────────────────
  const curveLabel = devType === 'fuse' ? 'gG fuse (I2 = 1.6 x In)' : SC_CURVES[curveSel].label;
  const curveMin   = devType === 'fuse' ? SC_FUSE_FACTOR : SC_CURVES[curveSel].min;
  const lines = [
    '=== Vstupni parametry / Input ===',
    'Un (line) = ' + Un + ' V   U0 (phase) = ' + U0.toFixed(1) + ' V',
    'Ik_supply = ' + ik_kA + ' kA',
    'S = ' + S + ' mm2   Spe = ' + Spe + ' mm2   L = ' + L + ' m',
    'Material: ' + scMaterial.toUpperCase() + '   rho = ' + rho + ' Ohm*mm2/m',
    Re > 0 ? 'Re (TT earth) = ' + Re + ' Ohm' : '',
    '',
    '=== Impedance ===',
    'Zs  = Un / (sqrt(3) * Ik_sup) = ' + Un + ' / (1.732 * ' + Ik_sup_A.toFixed(0) + ') = ' + fmtmO(Zs),
    'Rf  = rho * L / S   = ' + rho + ' * ' + L + ' / ' + S + ' = ' + fmtmO(Rf),
    'Rpe = rho * L / Spe = ' + rho + ' * ' + L + ' / ' + Spe + ' = ' + fmtmO(Rpe),
    Re > 0 ? 'Re  = ' + (Re * 1000).toFixed(0) + ' mOhm' : '',
    'Z3 (3-ph loop) = Zs + Rf = ' + fmtmO(Z3),
    'Z1 (1-ph loop) = Zs + Rf + Rpe' + (Re > 0 ? ' + Re' : '') + ' = ' + fmtmO(Z1),
    '',
    '=== Zkratove proudy / Fault currents ===',
    'Ik3 = Un / (sqrt(3) * Z3) = ' + Un + ' / (1.732 * ' + fmtmO(Z3) + ') = ' + fmtIk(Ik3),
    'Ik2 = Ik3 * sqrt(3)/2 = ' + fmtIk(Ik3) + ' * 0.866 = ' + fmtIk(Ik2),
    'Ik1 = 0.8 * U0 / Z1  = 0.8 * ' + U0.toFixed(1) + ' / ' + fmtmO(Z1) + ' = ' + fmtIk(Ik1),
    '      [0.8 = koef. obloukove impedance a tepelnych zmen — IEC 60909]',
    '',
    '=== Overeni vybaveni / Trip verification ===',
    'Pristoj: ' + devType.toUpperCase() + '   In = ' + In + ' A   Charakteristika: ' + curveLabel,
    'Imin = ' + curveMin + ' * ' + In + ' A = ' + Itrip_min.toFixed(0) + ' A',
    'Ik1 = ' + Ik1_A.toFixed(0) + ' A   ' + (willTrip ? '>=' : '<') + '   Imin = ' + Itrip_min.toFixed(0) + ' A   =>   ' + (willTrip ? 'VYBAVI' : 'NEVYBAVI'),
    'Icu = ' + Icu_kA + ' kA   Ik3 = ' + Ik3.toFixed(2) + ' kA   =>   ' + (exceedsIcu ? 'PREKROCENA Icu !' : 'OK'),
    '',
    '=== Max. delka kabelu / Max cable length ===',
    'Reseni: 0.8 * U0 / Imin = Zs + rho*L*(1/S + 1/Spe)' + (Re > 0 ? ' + Re' : ''),
    'L_max = (0.8*U0/Imin - Zs' + (Re > 0 ? ' - Re' : '') + ') / (rho * (1/S + 1/Spe))',
    L_max > 0
      ? 'L_max = ' + L_max.toFixed(1) + ' m   [aktualni L = ' + L + ' m => ' + (L > L_max ? 'PREKROCENO' : 'OK') + ']'
      : 'L_max < 0 (zdroj prilis slaby, ochrana nelze zaruit ani bez kabelu)',
  ].filter(s => s !== '');

  document.getElementById('sc-steps').textContent = lines.join('\n');
  document.getElementById('sc-res-card').style.display = 'block';
  document.getElementById('sc-res-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
