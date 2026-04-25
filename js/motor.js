// Motor Starting Current + Voltage Dip Calculator

let mscMaterial = 'cu';

const MSC_METHOD_PRESETS = {
  dol:  { kMin: 5,   kMax: 8,   kDef: 6.0, hint: 'DOL: kstart 5–8' },
  yd:   { kMin: 1.8, kMax: 2.5, kDef: 2.0, hint: 'Y/Δ: kstart 1.8–2.5' },
  soft: { kMin: 2.0, kMax: 3.5, kDef: 2.5, hint: 'Soft starter: kstart 2–3.5' },
  vfd:  { kMin: 1.0, kMax: 1.5, kDef: 1.2, hint: 'VFD: kstart 1.0–1.5' },
};

function mscOnMethodChange() {
  const method = document.getElementById('msc-method').value;
  const preset = MSC_METHOD_PRESETS[method];
  document.getElementById('msc-kstart').value = preset.kDef;
  document.getElementById('msc-kstart-hint').textContent = preset.hint;
}

function mscSetMaterial(btn, mat) {
  mscMaterial = mat;
  document.querySelectorAll('.msc-mat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function mscCalculate() {
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

  if ([Pn, Un, cosN, eta, cosStart, kstart, S, L, Ik].some(v => isNaN(v) || v <= 0)) {
    errEl.textContent = T[lang].errPositive;
    errEl.style.display = 'block';
    return;
  }
  if (cosN > 1 || eta > 1 || cosStart > 1) {
    errEl.textContent = T[lang].mscErrFactor;
    errEl.style.display = 'block';
    return;
  }

  const rho = mscMaterial === 'cu' ? 0.0175 : 0.028;

  // 1. Rated and starting currents
  const In     = (Pn * 1000) / (Math.sqrt(3) * Un * cosN * eta);
  const Istart = kstart * In;

  // 2. Cable impedance (R_AC includes skin effect at 50 Hz)
  const Rcable = rho * L / S * (1 + skinEffectYs(50, rho / S));
  const Xcable = 0.08 * L / 1000;

  // 3. Network impedance at busbar
  const Zs = Un / (Math.sqrt(3) * Ik * 1000);
  const Rs = Zs * 0.1;
  const Xs = Zs * 0.995;

  // 4. Total impedance
  const R = Rs + Rcable;
  const X = Xs + Xcable;

  // 5. Voltage dip
  const sinStart = Math.sqrt(1 - cosStart * cosStart);
  const dU    = Math.sqrt(3) * Istart * (R * cosStart + X * sinStart);
  const dUPct = (dU / Un) * 100;

  // Update result elements
  document.getElementById('msc-r-in').textContent    = In.toFixed(1) + ' A';
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

  // Assessment
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
  tripDetail.textContent = detailText;

  // Step-by-step calculation
  const methodSel  = document.getElementById('msc-method');
  const methodName = methodSel.options[methodSel.selectedIndex].text;
  const matLabel   = mscMaterial === 'cu' ? 'Cu (ρ = 0.0175 Ω·mm²/m)' : 'Al (ρ = 0.028 Ω·mm²/m)';

  document.getElementById('msc-steps').textContent =
`Method: ${methodName}  |  Material: ${matLabel}
────────────────────────────────────────────────────────
1. Rated current
   In = (Pn × 1000) / (√3 × Un × cos φn × η)
   In = (${Pn} × 1000) / (1.7321 × ${Un} × ${cosN} × ${eta})
   In = ${In.toFixed(2)} A

2. Starting current
   Istart = kstart × In = ${kstart} × ${In.toFixed(2)} = ${Istart.toFixed(2)} A

3. Cable impedance  (L = ${L} m one-way, S = ${S} mm², ρ = ${rho} Ω·mm²/m)
   Rcable = ρ × L / S = ${rho} × ${L} / ${S} = ${Rcable.toFixed(5)} Ω  (${(Rcable*1000).toFixed(3)} mΩ)
   Xcable ≈ 0.08 × L / 1000 = ${Xcable.toFixed(5)} Ω  (${(Xcable*1000).toFixed(3)} mΩ)

4. Network impedance at busbar  (Ik = ${Ik} kA, Un = ${Un} V)
   Zs = Un / (√3 × Ik × 1000) = ${Un} / (1.7321 × ${Ik} × 1000) = ${Zs.toFixed(5)} Ω  (${(Zs*1000).toFixed(3)} mΩ)
   Rs = Zs × 0.1   = ${Rs.toFixed(5)} Ω  (${(Rs*1000).toFixed(3)} mΩ)
   Xs = Zs × 0.995 = ${Xs.toFixed(5)} Ω  (${(Xs*1000).toFixed(3)} mΩ)
   Note: X/R ≈ 10 decomposition — indicative for MV/LV transformer feeds.

5. Total impedance
   R = Rs + Rcable = ${Rs.toFixed(5)} + ${Rcable.toFixed(5)} = ${R.toFixed(5)} Ω
   X = Xs + Xcable = ${Xs.toFixed(5)} + ${Xcable.toFixed(5)} = ${X.toFixed(5)} Ω

6. Voltage dip  (cos φstart = ${cosStart}, sin φstart = ${sinStart.toFixed(4)})
   ΔU = √3 × Istart × (R × cos φstart + X × sin φstart)
   ΔU = 1.7321 × ${Istart.toFixed(2)} × (${R.toFixed(5)} × ${cosStart} + ${X.toFixed(5)} × ${sinStart.toFixed(4)})
   ΔU = ${dU.toFixed(2)} V
   ΔU% = (ΔU / Un) × 100 = (${dU.toFixed(2)} / ${Un}) × 100 = ${dUPct.toFixed(2)} %`;

  document.getElementById('msc-res-card').style.display = 'block';
}

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
