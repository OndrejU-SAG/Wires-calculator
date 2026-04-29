// Motor Starting Current + Voltage Dip  &  Full Cable Sizing Calculator

let mscMaterial = 'cu';
let mscMode = 'vd'; // 'vd' = voltage dip only, 'siz' = full cable sizing

const MSC_METHOD_PRESETS = {
  dol:  { kMin: 5,   kMax: 8,   kDef: 6.0, hint: 'DOL: kstart 5–8' },
  yd:   { kMin: 1.8, kMax: 2.5, kDef: 2.0, hint: 'Y/Δ: kstart 1.8–2.5' },
  soft: { kMin: 2.0, kMax: 3.5, kDef: 2.5, hint: 'Soft starter: kstart 2–3.5' },
  vfd:  { kMin: 1.0, kMax: 1.5, kDef: 1.2, hint: 'VFD: kstart 1.0–1.5' },
};

// IEC 60364-5-52:2009 — Cu, PVC 70°C, 3-loaded conductors, 30°C ambient (20°C ground for D1)
const IEC_SIZ_SIZES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630];

const MSC_AMP_CU = {
  free:   [17.5, 24, 32, 41, 57, 76, 101, 125, 151, 192, 232, 269, 309, 353, 415, 477, 546, 626, 720],
  duct:   [13.5, 18, 24, 31, 42, 56,  73,  89, 108, 136, 164, 188, 216, 245, 286, 328, 382, 436, 502],
  burial: [22,   29, 38, 47, 63, 81, 104, 125, 148, 183, 216, 246, 278, 312, 361, 408, 459, 511, 567],
};
const MSC_AMP_AL = {
  free:   [13.5, 18.5, 25, 32, 44, 59,  79,  98, 118, 150, 183, 210, 240, 276, 323, 371, 424, 486, 561],
  duct:   [10.5, 13.5, 18.5, 24, 32, 43, 57,  70,  84, 107, 129, 149, 170, 194, 227, 261, 303, 346, 399],
  burial: [18,   23,   29,  36, 48, 62,  80,  96, 113, 140, 166, 189, 213, 240, 277, 313, 352, 393, 437],
};

// IEC 60364-5-52 Annex B — Correction factors
// Table B.52.14 — Ambient-air temperature factor Ca (3-loaded conductors)
const IEC_CA_TEMPS  = [25, 30, 35, 40, 45, 50, 55, 60]; // °C
const IEC_CA_PVC70  = [1.06, 1.00, 0.94, 0.87, 0.79, 0.71, 0.61, 0.50]; // PVC 70 °C
const IEC_CA_XLPE90 = [1.04, 1.00, 0.96, 0.91, 0.87, 0.82, 0.76, 0.71]; // XLPE 90 °C

// Table B.52.17 — Grouping factor Cg (cables in free air / on surfaces / in conduit)
// Index = n-1; for n >= 9 use last value (0.70)
const IEC_CG_TABLE = [1.00, 0.85, 0.79, 0.75, 0.73, 0.72, 0.72, 0.71, 0.70];

// Table B.52.20 — Soil thermal-resistivity correction factor Crho (direct burial D1)
// Reference: 2.5 K·m/W → Crho = 1.00; other values adjust Iz proportionally
const IEC_CRHO_RHO  = [0.5,  0.7,  1.0,  1.5,  2.0,  2.5,  3.0];
const IEC_CRHO_FACT = [1.28, 1.20, 1.18, 1.10, 1.05, 1.00, 0.96];

function getCa(ambTemp, insType) {
  const arr = insType === 'xlpe' ? IEC_CA_XLPE90 : IEC_CA_PVC70;
  const idx = IEC_CA_TEMPS.indexOf(ambTemp);
  if (idx >= 0) return arr[idx];
  for (let i = 0; i < IEC_CA_TEMPS.length - 1; i++) {
    if (ambTemp > IEC_CA_TEMPS[i] && ambTemp < IEC_CA_TEMPS[i + 1]) {
      const t = (ambTemp - IEC_CA_TEMPS[i]) / (IEC_CA_TEMPS[i + 1] - IEC_CA_TEMPS[i]);
      return arr[i] + t * (arr[i + 1] - arr[i]);
    }
  }
  return ambTemp < IEC_CA_TEMPS[0] ? arr[0] : arr[arr.length - 1];
}

function getCg(n) {
  const idx = Math.min(Math.max(Math.round(n) - 1, 0), IEC_CG_TABLE.length - 1);
  return IEC_CG_TABLE[idx];
}

const MM2_AWG_STR = {
  1.5: 'AWG 16',      2.5: 'AWG 14',      4:   'AWG 12',      6:   'AWG 10',
  10:  'AWG 8',       16:  'AWG 6',        25:  'AWG 4',       35:  'AWG 2',
  50:  'AWG 1/0',     70:  'AWG 2/0',      95:  'AWG 3/0',     120: 'AWG 4/0',
  150: '~250 kcmil',  185: '~350 kcmil',   240: '~500 kcmil',
  300: '~600 kcmil',  400: '~750 kcmil',   500: '~1000 kcmil', 630: '~1250 kcmil',
};

// ── Mode toggle ──────────────────────────────────────────────────────────────

function mscSetMode(mode) {
  mscMode = mode;
  document.getElementById('msc-mode-vd-btn').classList.toggle('active', mode === 'vd');
  document.getElementById('msc-mode-siz-btn').classList.toggle('active', mode === 'siz');
  document.getElementById('msc-s-field').style.display    = mode === 'vd'  ? '' : 'none';
  document.getElementById('msc-ik-field').style.display   = mode === 'vd'  ? '' : 'none';
  document.getElementById('msc-siz-inputs').style.display = mode === 'siz' ? '' : 'none';
  const btn = document.getElementById('msc-calc-btn');
  const key = mode === 'vd' ? 'mscCalcBtn' : 'mscSizCalcBtn';
  btn.setAttribute('data-t', key);
  btn.textContent = T[lang][key];
  document.getElementById('msc-res-card').style.display     = 'none';
  document.getElementById('msc-siz-res-card').style.display = 'none';
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function mscOnMethodChange() {
  const method = document.getElementById('msc-method').value;
  const preset = MSC_METHOD_PRESETS[method];
  document.getElementById('msc-kstart').value = preset.kDef;
  document.getElementById('msc-kstart-hint').textContent = preset.hint;
  const maxEl = document.getElementById('msc-max-vd-start');
  if (maxEl) maxEl.value = method === 'dol' ? 15 : 10;
}

function mscSetMaterial(btn, mat) {
  mscMaterial = mat;
  document.querySelectorAll('.msc-mat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function mscCalculate() {
  if (mscMode === 'vd') mscCalcVdOnly();
  else mscCalcFullSizing();
}

// ── Mode: Voltage Dip Only (existing logic) ──────────────────────────────────

function mscCalcVdOnly() {
  const errEl = document.getElementById('msc-err');
  errEl.style.display = 'none';

  const Pn       = parseFloat(document.getElementById('msc-pn').value);
  const Un       = parseFloat(document.getElementById('msc-un').value);
  const cosN     = parseFloat(document.getElementById('msc-cosn').value);
  const eta      = parseFloat(document.getElementById('msc-eta').value);
  const cosStart = parseFloat(document.getElementById('msc-cosstart').value);
  const kstart   = parseFloat(document.getElementById('msc-kstart').value);
  const S        = parseFloat(document.getElementById('msc-s').value);
  const L        = parseFloat(document.getElementById('msc-len').value);
  const Ik       = parseFloat(document.getElementById('msc-ik').value);
  const Tcable   = parseFloat(document.getElementById('msc-cable-temp').value);

  if ([Pn, Un, cosN, eta, cosStart, kstart, S, L, Ik, Tcable].some(v => isNaN(v) || v <= 0)) {
    errEl.textContent = T[lang].errPositive;
    errEl.style.display = 'block';
    return;
  }
  if (cosN > 1 || eta > 1 || cosStart > 1) {
    errEl.textContent = T[lang].mscErrFactor;
    errEl.style.display = 'block';
    return;
  }

  const freq     = parseFloat(document.getElementById('msc-freq').value);
  const mat      = MATERIAL[mscMaterial];
  const rho_cold = mat.rho20;                                           // 20 °C — cold cable (starting transient)
  const rho_run  = mat.rho20 * (1 + mat.alpha * (Tcable - 20));        // at operating temp — IEC 60364-5-52 §G.52.2

  const In     = (Pn * 1000) / (Math.sqrt(3) * Un * cosN * eta);
  const Istart = kstart * In;

  const Rcable = rho_cold * L / S * (1 + skinEffectYs(freq, rho_cold / S));
  const Xcable = 0.08 * L / 1000;

  const Zs = Un / (Math.sqrt(3) * Ik * 1000);
  const Rs = Zs * 0.1;
  const Xs = Zs * 0.995;

  const R = Rs + Rcable;
  const X = Xs + Xcable;

  const sinStart = Math.sqrt(1 - cosStart * cosStart);
  const dU    = Math.sqrt(3) * Istart * (R * cosStart + X * sinStart);
  const dUPct = (dU / Un) * 100;

  document.getElementById('msc-r-in').textContent     = In.toFixed(1) + ' A';
  document.getElementById('msc-r-istart').textContent = Istart.toFixed(1) + ' A';
  document.getElementById('msc-r-zs').textContent     = (Zs * 1000).toFixed(3) + ' mΩ';
  document.getElementById('msc-r-rs').textContent     = (Rs * 1000).toFixed(3) + ' mΩ';
  document.getElementById('msc-r-xs').textContent     = (Xs * 1000).toFixed(3) + ' mΩ';
  document.getElementById('msc-r-rcable').textContent = (Rcable * 1000).toFixed(3) + ' mΩ';
  document.getElementById('msc-r-xcable').textContent = (Xcable * 1000).toFixed(3) + ' mΩ';
  document.getElementById('msc-r-rtotal').textContent = (R * 1000).toFixed(3) + ' mΩ';
  document.getElementById('msc-r-xtotal').textContent = (X * 1000).toFixed(3) + ' mΩ';
  document.getElementById('msc-r-du-v').textContent   = dU.toFixed(2) + ' V';
  document.getElementById('msc-r-du-pct').textContent = dUPct.toFixed(2) + ' %';

  const tripBox    = document.getElementById('msc-trip-box');
  const tripStatus = document.getElementById('msc-trip-status');
  const tripDetail = document.getElementById('msc-trip-detail');
  tripBox.className = 'sc-trip-box';

  let statusKey, detailText;
  if (dUPct < 5) {
    tripBox.classList.add('sc-trip-ok');
    statusKey  = 'mscAssOk';
    detailText = `ΔU = ${dUPct.toFixed(2)} % < 5 %`;
  } else if (dUPct < 10) {
    tripBox.classList.add('sc-trip-partial');
    statusKey  = 'mscAssWarn1';
    detailText = `ΔU = ${dUPct.toFixed(2)} % — 5–10 %`;
  } else if (dUPct < 15) {
    tripBox.classList.add('sc-trip-partial');
    statusKey  = 'mscAssWarn2';
    detailText = `ΔU = ${dUPct.toFixed(2)} % — 10–15 %`;
  } else {
    tripBox.classList.add('sc-trip-fail');
    statusKey  = 'mscAssFail';
    detailText = `ΔU = ${dUPct.toFixed(2)} % > 15 %`;
  }
  tripStatus.textContent = T[lang][statusKey];
  tripStatus.dataset.tkey = statusKey;
  tripDetail.textContent = detailText;

  const methodSel  = document.getElementById('msc-method');
  const methodName = methodSel.options[methodSel.selectedIndex].text;
  const matName    = mscMaterial === 'cu' ? 'Cu' : 'Al';

  document.getElementById('msc-steps').textContent =
`Method: ${methodName}  |  Material: ${matName}  |  Frequency: ${freq} Hz
Ref: IEC 60364-5-52 §G.52.2 — temperature-corrected resistivity
────────────────────────────────────────────────────────
1. Rated current
   In = (Pn × 1000) / (√3 × Un × cos φn × η)
   In = (${Pn} × 1000) / (1.7321 × ${Un} × ${cosN} × ${eta})
   In = ${In.toFixed(2)} A

2. Starting current
   Istart = kstart × In = ${kstart} × ${In.toFixed(2)} = ${Istart.toFixed(2)} A

3. Conductor resistivity (IEC 60364-5-52 §G.52.2)
   ρ(θ) = ρ20 × (1 + α × (θ − 20))
   ρ_cold (20 °C, starting — cold cable):
     ρ_cold = ${rho_cold.toFixed(6)} Ω·mm²/m  [used for starting dU]
   ρ_run  (${Tcable} °C, operating temperature):
     ρ_run  = ${rho_cold.toFixed(6)} × (1 + ${mat.alpha} × (${Tcable} − 20))
            = ${rho_run.toFixed(6)} Ω·mm²/m  [reference — no running dU in this mode]

4. Cable impedance  (L = ${L} m one-way, S = ${S} mm², ρ = ρ_cold = ${rho_cold.toFixed(6)} Ω·mm²/m)
   Rcable = ρ_cold × L / S = ${rho_cold.toFixed(6)} × ${L} / ${S} = ${Rcable.toFixed(5)} Ω  (${(Rcable*1000).toFixed(3)} mΩ)
   Xcable ≈ 0.08 × L / 1000 = ${Xcable.toFixed(5)} Ω  (${(Xcable*1000).toFixed(3)} mΩ)

5. Network impedance at busbar  (Ik = ${Ik} kA, Un = ${Un} V)
   Zs = Un / (√3 × Ik × 1000) = ${Un} / (1.7321 × ${Ik} × 1000) = ${Zs.toFixed(5)} Ω  (${(Zs*1000).toFixed(3)} mΩ)
   Rs = Zs × 0.1   = ${Rs.toFixed(5)} Ω  (${(Rs*1000).toFixed(3)} mΩ)
   Xs = Zs × 0.995 = ${Xs.toFixed(5)} Ω  (${(Xs*1000).toFixed(3)} mΩ)
   Note: X/R ≈ 10 decomposition — indicative for MV/LV transformer feeds.

6. Total impedance
   R = Rs + Rcable = ${Rs.toFixed(5)} + ${Rcable.toFixed(5)} = ${R.toFixed(5)} Ω
   X = Xs + Xcable = ${Xs.toFixed(5)} + ${Xcable.toFixed(5)} = ${X.toFixed(5)} Ω

7. Voltage dip  (cos φstart = ${cosStart}, sin φstart = ${sinStart.toFixed(4)})
   ΔU = √3 × Istart × (R × cos φstart + X × sin φstart)
   ΔU = 1.7321 × ${Istart.toFixed(2)} × (${R.toFixed(5)} × ${cosStart} + ${X.toFixed(5)} × ${sinStart.toFixed(4)})
   ΔU = ${dU.toFixed(2)} V
   ΔU% = (ΔU / Un) × 100 = (${dU.toFixed(2)} / ${Un}) × 100 = ${dUPct.toFixed(2)} %`;

  document.getElementById('msc-res-card').style.display     = 'block';
  document.getElementById('msc-siz-res-card').style.display = 'none';
}

// ── Mode: Full Cable Sizing ──────────────────────────────────────────────────

function mscCalcFullSizing() {
  const errEl = document.getElementById('msc-err');
  errEl.style.display = 'none';

  const Pn          = parseFloat(document.getElementById('msc-pn').value);
  const Un          = parseFloat(document.getElementById('msc-un').value);
  const cosN        = parseFloat(document.getElementById('msc-cosn').value);
  const eta         = parseFloat(document.getElementById('msc-eta').value);
  const cosStart    = parseFloat(document.getElementById('msc-cosstart').value);
  const kstart      = parseFloat(document.getElementById('msc-kstart').value);
  const L           = parseFloat(document.getElementById('msc-len').value);
  const maxVdRun    = parseFloat(document.getElementById('msc-max-vd-run').value);
  const maxVdStart  = parseFloat(document.getElementById('msc-max-vd-start').value);
  const Tcable      = parseFloat(document.getElementById('msc-cable-temp').value);
  const ambTemp     = parseFloat(document.getElementById('msc-ambient').value);
  const nGrouping   = parseInt(document.getElementById('msc-grouping').value, 10);
  const utilisation = parseFloat(document.getElementById('msc-utilisation').value);
  const method      = document.getElementById('msc-method').value;
  const cableType   = document.getElementById('msc-cable-type').value;
  const instMethod  = document.getElementById('msc-inst-method').value;
  const phases      = document.getElementById('msc-phases').value;

  if ([Pn, Un, cosN, eta, cosStart, kstart, L, maxVdRun, maxVdStart, Tcable].some(v => isNaN(v) || v <= 0)) {
    errEl.textContent = T[lang].errPositive;
    errEl.style.display = 'block';
    return;
  }
  if (cosN > 1 || eta > 1 || cosStart > 1) {
    errEl.textContent = T[lang].mscErrFactor;
    errEl.style.display = 'block';
    return;
  }
  if (isNaN(ambTemp) || ambTemp < 25 || ambTemp > 60 ||
      isNaN(nGrouping) || nGrouping < 1 || nGrouping > 20 ||
      isNaN(utilisation) || utilisation < 0.5 || utilisation > 1.0) {
    errEl.textContent = T[lang].mscErrCorrFactors || 'Check ambient temperature (25–60 °C), grouping (1–20), utilisation (0.5–1.0).';
    errEl.style.display = 'block';
    return;
  }

  const freq     = parseFloat(document.getElementById('msc-freq').value);
  const mat      = MATERIAL[mscMaterial];
  const rho_cold = mat.rho20;                                     // 20 °C — cold cable (starting transient)
  const rho_run  = mat.rho20 * (1 + mat.alpha * (Tcable - 20));  // at operating temp — IEC 60364-5-52 §G.52.2
  const ampTable = mscMaterial === 'cu' ? MSC_AMP_CU : MSC_AMP_AL;

  // IEC 60364-5-52 Annex B correction factors
  const Ca   = getCa(ambTemp, 'pvc');        // Table B.52.14 — ambient air temperature
  const Cg   = getCg(nGrouping);             // Table B.52.17 — grouping
  const Crho = instMethod === 'burial' ? 1.00 : 1.00; // Table B.52.20 — soil resistivity (ref. 2.5 K·m/W)
  const Xkm      = cableType === 'single' ? 0.08 : 0.07;  // Ω/km
  const InFactor = phases === 'ac3' ? Math.sqrt(3) : 1;
  const vdFactor = phases === 'ac3' ? Math.sqrt(3) : 2;

  const In     = (Pn * 1000) / (InFactor * Un * cosN * eta);
  const Istart = kstart * In;
  const sinN     = Math.sqrt(1 - cosN * cosN);
  const sinStart = Math.sqrt(1 - cosStart * cosStart);

  const methodSel  = document.getElementById('msc-method');
  const methodName = methodSel.options[methodSel.selectedIndex].text;
  const matLabel   = mscMaterial === 'cu' ? 'Cu' : 'Al';
  const instLabels = { free: 'Free air (E)', duct: 'Conduit/duct (B2)', burial: 'Direct burial (D1)' };
  const instLabel  = instLabels[instMethod];

  // Iterative sizing through all IEC standard sizes
  let found = null;
  const trials = [];

  for (let i = 0; i < IEC_SIZ_SIZES.length; i++) {
    const S       = IEC_SIZ_SIZES[i];
    const Iz      = ampTable[instMethod][i];
    const Iz_eff  = Iz * Ca * Cg * Crho * utilisation;

    const Rcable_run   = rho_run  * L / S * (1 + skinEffectYs(freq, rho_run  / S));
    const Rcable_start = rho_cold * L / S * (1 + skinEffectYs(freq, rho_cold / S));
    const Xcable       = Xkm * L / 1000;

    const dU_run       = vdFactor * In     * (Rcable_run   * cosN     + Xcable * sinN);
    const dU_start     = vdFactor * Istart * (Rcable_start * cosStart + Xcable * sinStart);
    const dU_run_pct   = (dU_run   / Un) * 100;
    const dU_start_pct = (dU_start / Un) * 100;

    const ampOk     = Iz_eff >= In;
    const vdRunOk   = dU_run_pct  <= maxVdRun;
    const vdStartOk = method === 'vfd' || dU_start_pct <= maxVdStart;

    const t = { S, Iz, Iz_eff, Rcable_run, Rcable_start, Xcable, dU_run, dU_run_pct, dU_start, dU_start_pct, ampOk, vdRunOk, vdStartOk };
    trials.push(t);

    if (!found && ampOk && vdRunOk && vdStartOk) found = t;
  }

  // ── Build step-by-step text ─────────────────────────────────────────────
  const phaseLabel = phases === 'ac3' ? 'AC3 three-phase (factor = sqrt(3))' : 'AC1 single-phase (factor = 2)';
  const caRow = IEC_CA_TEMPS.map((t, i) => `${t} °C → ${IEC_CA_PVC70[i].toFixed(2)}`).join('  |  ');
  const cgRow = IEC_CG_TABLE.map((v, i) => `n=${i + 1}: ${v.toFixed(2)}`).join('  |  ');
  let stepsText =
`Method: ${methodName}  |  Material: ${matLabel}  |  Frequency: ${freq} Hz  |  System: ${phaseLabel}
Cable: ${cableType === 'single' ? 'Single-core' : 'Multi-core'} (X = ${Xkm * 1000} mOhm/km)
Installation: ${instLabel}
Ref: IEC 60364-5-52 §G.52.2 + Annex B (Tables B.52.14, B.52.17${instMethod === 'burial' ? ', B.52.20' : ''})
────────────────────────────────────────────────────────────────────
1. Rated current
   In = (Pn * 1000) / (${phases === 'ac3' ? 'sqrt(3) * Un' : 'Un'} * cos(phi_n) * eta)
   In = (${Pn} * 1000) / (${InFactor.toFixed(4)} * ${Un} * ${cosN} * ${eta})
   In = ${In.toFixed(3)} A

2. Starting current
   Istart = kstart * In = ${kstart} * ${In.toFixed(3)} = ${Istart.toFixed(3)} A
   sin(phi_n)     = sqrt(1 - ${cosN}^2) = ${sinN.toFixed(4)}
   sin(phi_start) = sqrt(1 - ${cosStart}^2) = ${sinStart.toFixed(4)}

3. Conductor resistivity  rho(theta) = rho20 * (1 + alpha * (theta - 20))
   rho_cold (20 °C — cold cable, starting transient):
     rho_cold = ${rho_cold.toFixed(6)} Ohm*mm^2/m  [used for dU_start]
   rho_run  (${Tcable} °C — cable operating temperature):
     rho_run  = ${rho_cold.toFixed(6)} * (1 + ${mat.alpha} * (${Tcable} - 20))
              = ${rho_run.toFixed(6)} Ohm*mm^2/m  [used for dU_run]

4. Ampacity table: IEC 60364-5-52, ${instLabel}, ${matLabel}, PVC 70°C, reference 30°C ambient

5. Annex B correction factors — effective ampacity Iz_eff = Iz_table * Ca * Cg${instMethod === 'burial' ? ' * Crho' : ''} * Ku

   a) Ca — ambient-temperature factor (Table B.52.14, PVC 70°C)
      ${caRow}
      theta_amb = ${ambTemp} °C  →  Ca = ${Ca.toFixed(4)}

   b) Cg — grouping factor (Table B.52.17, cables in air / on surfaces / in conduit)
      ${cgRow}  |  n>=9: 0.70
      n = ${nGrouping} circuit${nGrouping > 1 ? 's' : ''}  →  Cg = ${Cg.toFixed(4)}
${instMethod === 'burial' ? `
   c) Crho — soil thermal-resistivity factor (Table B.52.20, direct burial D1)
      Reference soil resistivity: 2.5 K*m/W  ->  Crho = 1.00 (reference condition)
` : ''}
   Ku — utilisation factor (user-defined): ${utilisation}

   Iz_eff = Iz_table * Ca * Cg${instMethod === 'burial' ? ' * Crho' : ''} * Ku
          = Iz_table * ${Ca.toFixed(4)} * ${Cg.toFixed(4)}${instMethod === 'burial' ? ' * 1.0000' : ''} * ${utilisation}
          = Iz_table * ${(Ca * Cg * Crho * utilisation).toFixed(4)}

6. Iterative sizing — first size satisfying: Iz_eff >= In, dU_run <= ${maxVdRun} %, dU_start <= ${maxVdStart} %
`;

  if (found) {
    const { S, Iz, Iz_eff, Rcable_run, Rcable_start, Xcable, dU_run, dU_run_pct, dU_start, dU_start_pct, vdRunOk, vdStartOk } = found;
    const ys_run   = skinEffectYs(freq, rho_run  / S);
    const ys_cold  = skinEffectYs(freq, rho_cold / S);
    stepsText +=
`
   Recommended: ${S} mm²

   a) Ampacity check
      Iz_table = ${Iz} A  (IEC 60364-5-52, ${instLabel})
      Iz_eff   = ${Iz} * ${Ca.toFixed(4)} * ${Cg.toFixed(4)}${instMethod === 'burial' ? ' * 1.0000' : ''} * ${utilisation} = ${Iz_eff.toFixed(2)} A
      In       = ${In.toFixed(3)} A
      ${Iz_eff.toFixed(2)} >= ${In.toFixed(3)} A  [OK]

   b) Cable impedance for ${S} mm², L = ${L} m
      Rcable_run   = rho_run  * L / S * (1 + ys_run)
                   = ${rho_run.toFixed(6)} * ${L} / ${S} * (1 + ${ys_run.toFixed(6)})
                   = ${Rcable_run.toFixed(6)} Ohm  [running — rho at ${Tcable} °C]
      Rcable_start = rho_cold * L / S * (1 + ys_cold)
                   = ${rho_cold.toFixed(6)} * ${L} / ${S} * (1 + ${ys_cold.toFixed(6)})
                   = ${Rcable_start.toFixed(6)} Ohm  [starting — rho at 20 °C]
      Xcable = Xkm * L / 1000 = ${Xkm} * ${L} / 1000 = ${Xcable.toFixed(6)} Ohm

   c) Running voltage drop  (rho_run, cos phi_n = ${cosN}, sin phi_n = ${sinN.toFixed(4)})
      dU_run = ${vdFactor.toFixed(4)} * In * (Rcable_run * cos phi_n + Xcable * sin phi_n)
             = ${vdFactor.toFixed(4)} * ${In.toFixed(3)} * (${Rcable_run.toFixed(6)} * ${cosN} + ${Xcable.toFixed(6)} * ${sinN.toFixed(4)})
             = ${dU_run.toFixed(3)} V
      dU_run% = ${dU_run.toFixed(3)} / ${Un} * 100 = ${dU_run_pct.toFixed(3)} %
      Limit: <= ${maxVdRun} %  [${vdRunOk ? 'OK' : 'FAIL'}]

   d) Starting voltage drop  (rho_cold, cos phi_start = ${cosStart}, sin phi_start = ${sinStart.toFixed(4)})`;
    if (method === 'vfd') {
      stepsText += '\n      VFD: starting voltage drop negligible — drive controls Istart.  [N/A]';
    } else {
      stepsText +=
`
      dU_start = ${vdFactor.toFixed(4)} * Istart * (Rcable_start * cos phi_start + Xcable * sin phi_start)
               = ${vdFactor.toFixed(4)} * ${Istart.toFixed(3)} * (${Rcable_start.toFixed(6)} * ${cosStart} + ${Xcable.toFixed(6)} * ${sinStart.toFixed(4)})
               = ${dU_start.toFixed(3)} V
      dU_start% = ${dU_start.toFixed(3)} / ${Un} * 100 = ${dU_start_pct.toFixed(3)} %
      Limit: <= ${maxVdStart} %  [${vdStartOk ? 'OK' : 'FAIL'}]`;
    }
  } else {
    stepsText += `
   No standard cable up to 630 mm² satisfies all criteria.
   In = ${In.toFixed(3)} A, L = ${L} m
   Consider: parallel cables, shorter run, or different starting method.`;
  }

  // ── Populate DOM ────────────────────────────────────────────────────────
  const res = found;

  // Recommended cable box
  const recBox = document.getElementById('msc-siz-rec-box');
  if (res) {
    document.getElementById('msc-siz-rec-value').textContent = res.S + ' mm²';
    document.getElementById('msc-siz-rec-awg').textContent   = MM2_AWG_STR[res.S] || '';
    recBox.style.display = '';
  } else {
    recBox.style.display = 'none';
  }

  // Comparison table
  const tbody = document.getElementById('msc-siz-tbody');
  tbody.innerHTML = '';

  function mkBadge(pass, na) {
    if (na) return `<span class="msc-siz-badge na">—</span>`;
    return pass
      ? `<span class="msc-siz-badge pass">${T[lang].mscSizPass}</span>`
      : `<span class="msc-siz-badge fail">${T[lang].mscSizFail}</span>`;
  }

  const displayRes = res || trials[trials.length - 1];
  const vfdMode = method === 'vfd';

  tbody.innerHTML += `<tr>
    <td>${T[lang].mscSizRatedCurrent}</td>
    <td>${In.toFixed(2)} A</td>
    <td>—</td>
    <td><span class="msc-siz-badge na">—</span></td>
  </tr>`;
  tbody.innerHTML += `<tr>
    <td>${T[lang].mscSizAmpacity}</td>
    <td>${displayRes.Iz_eff.toFixed(1)} A&ensp;<span style="color:#888;font-size:0.85em">(Iz=${displayRes.Iz} A &times; Ca=${Ca.toFixed(3)} &times; Cg=${Cg.toFixed(3)} &times; Ku=${utilisation})</span></td>
    <td>&ge; ${In.toFixed(1)} A</td>
    <td>${mkBadge(displayRes.ampOk)}</td>
  </tr>`;
  tbody.innerHTML += `<tr>
    <td>${T[lang].mscSizRunVd}</td>
    <td>${displayRes.dU_run_pct.toFixed(2)} %&ensp;(${displayRes.dU_run.toFixed(2)} V)</td>
    <td>&le; ${maxVdRun} %</td>
    <td>${mkBadge(displayRes.vdRunOk)}</td>
  </tr>`;
  tbody.innerHTML += `<tr>
    <td>${T[lang].mscSizStartVd}</td>
    <td>${vfdMode ? '&asymp; 0 %' : displayRes.dU_start_pct.toFixed(2) + ' %&ensp;(' + displayRes.dU_start.toFixed(2) + ' V)'}</td>
    <td>${vfdMode ? '—' : '&le; ' + maxVdStart + ' %'}</td>
    <td>${mkBadge(displayRes.vdStartOk, vfdMode)}</td>
  </tr>`;

  // Assessment box
  const tripBox    = document.getElementById('msc-siz-trip-box');
  const tripStatus = document.getElementById('msc-siz-trip-status');
  const tripDetail = document.getElementById('msc-siz-trip-detail');
  tripBox.className = 'sc-trip-box';
  if (res) {
    tripBox.classList.add('sc-trip-ok');
    tripStatus.textContent = T[lang].mscSizOk;
    tripStatus.dataset.tkey = 'mscSizOk';
    tripDetail.textContent = `${res.S} mm² — Iz_eff = ${res.Iz_eff.toFixed(1)} A ≥ In = ${In.toFixed(1)} A  (Ca=${Ca.toFixed(3)}, Cg=${Cg.toFixed(3)}, Ku=${utilisation})`;
  } else {
    tripBox.classList.add('sc-trip-fail');
    tripStatus.textContent = T[lang].mscSizFailAll;
    tripStatus.dataset.tkey = 'mscSizFailAll';
    tripDetail.textContent = `In = ${In.toFixed(1)} A  ·  L = ${L} m  ·  ${instLabel}`;
  }

  // VFD note
  document.getElementById('msc-siz-vfd-note').style.display = vfdMode ? '' : 'none';

  // Suggestions when no cable found
  const suggestEl = document.getElementById('msc-siz-suggestions');
  if (!res) {
    const last = trials[trials.length - 1];
    const msgs = [];
    if (!last.vdStartOk && method === 'dol') msgs.push(T[lang].mscSizSuggestMethod);
    msgs.push(T[lang].mscSizSuggestCable);
    suggestEl.innerHTML = msgs.join('<br>');
    suggestEl.style.display = '';
  } else {
    suggestEl.style.display = 'none';
  }

  document.getElementById('msc-siz-steps').textContent = stepsText;
  document.getElementById('msc-siz-res-card').style.display = 'block';
  document.getElementById('msc-res-card').style.display     = 'none';

  // Store for PDF
  window._mscSizLast = {
    Pn, Un, cosN, eta, cosStart, kstart, L, maxVdRun, maxVdStart,
    method, methodName, cableType, instMethod, instLabel, phases, phaseLabel,
    In, Istart, sinN, sinStart, Tcable, rho_cold, rho_run, Xkm, vdFactor, InFactor, matLabel,
    ambTemp, nGrouping, utilisation, Ca, Cg, Crho, freq,
    res, stepsText,
  };
}

// ── PDF Export ───────────────────────────────────────────────────────────────

async function mscDownloadPdf() {
  const r = window._mscSizLast;
  if (!r) { alert('Run the calculation first.'); return; }

  if (!window.jspdf && !window.jsPDF) { alert('jsPDF not loaded'); return; }
  const { jsPDF } = window.jspdf || window;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 15;
  const CW = PW - M * 2;
  const ACC = [26, 82, 118];   // accent blue — same as switchboard
  const GRN = [0, 150, 80];    // pass green

  const engineer  = (document.getElementById('msc-engineer') || {}).value || '';
  const STANDARD  = 'IEC 60364-5-52 / IEC 60034';
  const TITLE_P1  = _tt('mscPdfTitle', 'Motor Cable Sizing Calculation');

  // ── Helpers (same patterns as switchboard.js) ─────────────────────────

  function drawFooter(pageNum, totalPages) {
    pdfMakeFooter(doc, { PW, PH, M, pageNum, totalPages, engineer, standard: STANDARD });
  }

  function pdfSection(y, title) {
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

  // ── Page 1: Inputs + Results ──────────────────────────────────────────
  pdfMakeHeader(doc, { PW, M, title: TITLE_P1 });
  let y = M + 22;

  y = pdfSection(y, _tt('iecPdfInputs', 'Input Parameters'));
  y = inputTable(y, [
    ['Motor rated power Pn',                r.Pn + ' kW'],
    ['System voltage Un',                   r.Un + ' V'],
    ['Rated power factor cos phi_n',        String(r.cosN)],
    ['Motor efficiency eta',                String(r.eta)],
    ['Starting method',                     pdfSafe(r.methodName)],
    ['Starting current multiplier kstart',  String(r.kstart)],
    ['Starting power factor cos phi_start', String(r.cosStart)],
    ['Cable length L (one-way)',            r.L + ' m'],
    ['Conductor material',                  r.matLabel],
    ['Cable operating temperature',         r.Tcable + ' \xb0C  (rho_cold = ' + r.rho_cold.toFixed(6) + ', rho_run = ' + r.rho_run.toFixed(6) + ' Ohm*mm^2/m)'],
    ['Cable type',                          r.cableType === 'single' ? 'Single-core (X = 0.08 Ohm/km)' : 'Multi-core (X = 0.07 Ohm/km)'],
    ['Installation method (IEC 60364-5-52)', r.instLabel],
    ['System',                              r.phases === 'ac3' ? 'Three-phase AC (AC3)' : 'Single-phase AC (AC1)'],
    ['Ambient temperature (IEC Tab. B.52.14)', r.ambTemp + ' \xb0C  →  Ca = ' + r.Ca.toFixed(4) + '  (PVC 70\xb0C)'],
    ['Grouping — parallel circuits (IEC Tab. B.52.17)', 'n = ' + r.nGrouping + '  →  Cg = ' + r.Cg.toFixed(4)],
    ['Utilisation factor Ku',               String(r.utilisation)],
    ...(r.instMethod === 'burial' ? [['Soil resistivity (IEC Tab. B.52.20)', 'Reference 2.5 K\xb7m/W  →  Crho = 1.00']] : []),
    ['Max running voltage drop limit',      r.maxVdRun + ' %'],
    ['Max starting voltage drop limit',     r.maxVdStart + ' %'],
  ]);
  y += 8;

  y = pdfSection(y, _tt('mscPdfResults', 'Results'));
  y += 2;

  if (r.res) {
    // ── Centered green recommended cable box ─────────────────────────────
    const BOX_W = CW * 0.56;
    const BOX_X = M + (CW - BOX_W) / 2;
    const BOX_H = 32;

    doc.setFillColor(230, 248, 235);
    doc.setDrawColor(...GRN);
    doc.setLineWidth(1.0);
    doc.rect(BOX_X, y, BOX_W, BOX_H, 'FD');

    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 100, 60);
    doc.text('Recommended Cable Size', PW / 2, y + 7.5, { align: 'center' });

    doc.setFontSize(24); doc.setFont('helvetica', 'bold'); doc.setTextColor(...GRN);
    doc.text(r.res.S + ' mm\xb2', PW / 2, y + 21, { align: 'center' });

    const awgStr = MM2_AWG_STR[r.res.S] || '';
    if (awgStr) {
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 100, 70);
      doc.text(awgStr, PW / 2, y + 28, { align: 'center' });
    }
    y += BOX_H + 8;

    // ── Results comparison table (blue header, same as switchboard dataTable) ─
    const RH = 6.5;
    const colW = [78, 50, 34, 18];   // param | value | limit | status

    doc.setFillColor(...ACC); doc.rect(M, y, CW, RH, 'F');
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('Parameter',       M + 2,                               y + 4.5);
    doc.text('Value',           M + colW[0] + colW[1] - 2,          y + 4.5, { align: 'right' });
    doc.text('Limit',           M + colW[0] + colW[1] + colW[2] - 2, y + 4.5, { align: 'right' });
    doc.text('Status',          M + CW - 2,                          y + 4.5, { align: 'right' });
    y += RH;

    const vfd  = r.method === 'vfd';
    const rows = [
      ['Rated current In',      r.In.toFixed(2) + ' A',                                                    '—',                          null],
      ['Cable ampacity Iz_eff (Ca=' + r.Ca.toFixed(3) + ', Cg=' + r.Cg.toFixed(3) + ', Ku=' + r.utilisation + ')',
                             r.res.Iz_eff.toFixed(2) + ' A  (Iz_table=' + r.res.Iz + ' A)',              '>= ' + r.In.toFixed(1) + ' A',  r.res.ampOk],
      ['Running voltage drop',  r.res.dU_run_pct.toFixed(2) + ' % (' + r.res.dU_run.toFixed(2) + ' V)',    '<= ' + r.maxVdRun + ' %',    r.res.vdRunOk],
      ['Starting voltage drop', vfd ? 'Negligible (VFD)' : r.res.dU_start_pct.toFixed(2) + ' % (' + r.res.dU_start.toFixed(2) + ' V)',
                                vfd ? '—'                : '<= ' + r.maxVdStart + ' %',
                                vfd ? null               : r.res.vdStartOk],
    ];

    rows.forEach(([label, value, limit, pass], i) => {
      i % 2 === 0 ? doc.setFillColor(245, 247, 250) : doc.setFillColor(255, 255, 255);
      doc.rect(M, y, CW, RH, 'F');
      doc.setDrawColor(215, 215, 215); doc.setLineWidth(0.1); doc.rect(M, y, CW, RH);

      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40);
      doc.text(pdfSafe(label), M + 2, y + 4.5);
      doc.text(pdfSafe(value), M + colW[0] + colW[1] - 2,           y + 4.5, { align: 'right' });
      doc.text(pdfSafe(limit), M + colW[0] + colW[1] + colW[2] - 2, y + 4.5, { align: 'right' });

      if (pass === true)       { doc.setTextColor(0, 160, 80);   doc.setFont('helvetica', 'bold'); doc.text('PASS', M + CW - 2, y + 4.5, { align: 'right' }); }
      else if (pass === false) { doc.setTextColor(200, 40, 40);  doc.setFont('helvetica', 'bold'); doc.text('FAIL', M + CW - 2, y + 4.5, { align: 'right' }); }
      else                     { doc.setTextColor(120, 120, 120);                                   doc.text('N/A',  M + CW - 2, y + 4.5, { align: 'right' }); }
      y += RH;
    });
  } else {
    // No cable found — red failure box
    const BOX_H = 20;
    doc.setFillColor(255, 235, 235);
    doc.setDrawColor(200, 40, 40); doc.setLineWidth(0.8);
    doc.rect(M, y, CW, BOX_H, 'FD');
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(200, 40, 40);
    doc.text('No standard cable (up to 630 mm\xb2) satisfies all criteria', PW / 2, y + 9, { align: 'center' });
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    doc.text('In = ' + r.In.toFixed(2) + ' A  |  L = ' + r.L + ' m  |  ' + pdfSafe(r.instLabel), PW / 2, y + 16, { align: 'center' });
    y += BOX_H + 6;
  }

  // ── Page 2: Step-by-step (same rendering as switchboard.js) ──────────
  doc.addPage();
  pdfMakeHeader(doc, { PW, M, title: TITLE_P1 });
  drawFooter(doc.getNumberOfPages(), doc.getNumberOfPages());
  y = M + 22;

  y = pdfSection(y, _tt('iecPdfSteps', 'Step-by-Step Calculation'));
  y += 3;

  // Split into blocks separated by blank lines (same pattern as switchboard)
  const blocks = r.stepsText.split('\n\n');
  blocks.forEach(block => {
    const lines = block.split('\n');
    const blockH = lines.length * 4.5 + 6;
    if (y + blockH > PH - M - 12) {
      doc.addPage();
      pdfMakeHeader(doc, { PW, M, title: TITLE_P1 });
      y = M + 22;
    }

    lines.forEach(line => {
      if (!line.trim()) return;

      // Box-drawing separator line → draw an actual PDF rule
      if (/^[─-╿\-]{5,}/.test(line.trim())) {
        doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
        doc.line(M, y - 1.5, PW - M, y - 1.5);
        return;
      }

      const trimmed   = line.trimStart();
      const indented  = line.startsWith('   ');
      const isStep    = /^\d+\./.test(trimmed);      // "1. Rated current"
      const isSubStep = /^[a-d]\)/.test(trimmed);    // "a) Ampacity check"

      if (isStep) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...ACC);
      } else if (isSubStep) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(50, 60, 80);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(40, 40, 40);
      }

      doc.setFontSize(8.5);
      const textLines = doc.splitTextToSize(pdfSafe(trimmed), CW - (indented ? 6 : 0));
      textLines.forEach(tl => {
        if (y > PH - M - 12) {
          doc.addPage();
          pdfMakeHeader(doc, { PW, M, title: TITLE_P1 });
          y = M + 22;
        }
        doc.text(tl, M + (indented ? 6 : 0), y);
        y += 4.5;
      });
    });

    doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.2);
    doc.line(M, y + 1, PW - M, y + 1);
    y += 6;
  });

  // Fix footers on all pages (same pattern as switchboard.js)
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor(255, 255, 255);
    doc.rect(0, PH - M - 8, PW, 25, 'F');
    drawFooter(p, totalPages);
  }

  doc.save('motor-cable-sizing.pdf');
}

// ── Init ─────────────────────────────────────────────────────────────────────

function initMotorCalc() {
  const sel = document.getElementById('msc-s');
  MM2_STD.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s + ' mm²';
    if (s === 2.5) opt.selected = true;
    sel.appendChild(opt);
  });
}
