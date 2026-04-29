let sysType = 'dc';
let calcFreq = 50;
let lastParams = null;
let lastCalcResult = null; // shared with sc.js for import feature

function setFreq(btn, f) {
  calcFreq = f;
  btn.closest('.seg-group').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function setSystem(btn, t) {
  sysType = t;
  btn.closest('.seg-group').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('voltage').value = SYS_V[t];
  document.getElementById('freqRow').style.display = t !== 'dc' ? 'block' : 'none';
  liveWarn();
}

function getH() {
  const m = document.getElementById('hMethod').value;
  if (m === 'custom') {
    const v = parseFloat(document.getElementById('hCustomVal').value);
    return isNaN(v) ? 7 : v;
  }
  const baseH = H_PRESETS[m].h;
  if (m === 'free') return baseH;
  const condKey = document.getElementById('hCondCount').value;
  return baseH * getDerating(condKey);
}

function onHChange() {
  const m = document.getElementById('hMethod').value;
  const isC = m === 'custom', isFree = m === 'free';
  document.getElementById('hCustRow').style.display = isC ? 'block' : 'none';
  document.getElementById('hCondRow').style.display = (!isC && !isFree) ? 'block' : 'none';
  const hi = document.getElementById('hHint'); if (!hi) return;
  const names = { free: T[lang].hFree, grouped: T[lang].hGrouped, conduit: T[lang].hConduit };
  if (isC) {
    const cv = parseFloat(document.getElementById('hCustomVal').value) || '?';
    hi.textContent = cv + ' W/m²K (' + T[lang].hCustomOpt + ')';
  } else if (isFree) {
    hi.textContent = H_PRESETS.free.h + ' W/m²K (' + T[lang].hFree + ')';
  } else {
    const baseH = H_PRESETS[m].h;
    const condKey = document.getElementById('hCondCount').value;
    const factor = getDerating(condKey);
    const effH = baseH * factor;
    const effStr = Number.isInteger(effH) ? effH : effH.toFixed(1);
    const condLabel = document.getElementById('hCondCount').options[document.getElementById('hCondCount').selectedIndex].text;
    hi.textContent = effStr + ' W/m²K (' + names[m] + ' × ' + condLabel + ')';
  }
}

function getTempValue() {
  const sel = document.getElementById('tempPreset');
  if (sel.value === 'custom') return parseFloat(document.getElementById('tempCustom').value);
  return parseFloat(sel.value);
}

function onTempPresetChange() {
  const isCustom = document.getElementById('tempPreset').value === 'custom';
  document.getElementById('tempCustomRow').style.display = isCustom ? 'block' : 'none';
  liveWarn();
}

function liveWarn() {
  const pct = parseFloat(document.getElementById('vdropPct').value);
  const Tm = getTempValue();
  const Ta = parseFloat(document.getElementById('ambient').value);
  const isCustomTemp = document.getElementById('tempPreset').value === 'custom';
  const w = [];
  if (!isNaN(pct)) { if (pct > 10) w.push({ t: 'warn', m: T[lang].warnVd10 }); else if (pct > 5) w.push({ t: 'warn', m: T[lang].warnVd5 }); }
  if (!isNaN(Tm) && !isNaN(Ta)) {
    if (Tm - Ta < 10) w.push({ t: 'warn', m: T[lang].warnThermal });
    if (isCustomTemp) {
      if (Tm > 105) w.push({ t: 'warn', m: T[lang].warnTemp105 });
      else if (Tm > 90) w.push({ t: 'info', m: T[lang].infoTemp90 });
    }
  }
  document.getElementById('warnArea').innerHTML = w.map(x => `<div class="warn-chip ${x.t === 'info' ? 'info' : ''}">${x.m}</div>`).join('');
}

function calculate() {
  const errEl = document.getElementById('errCalc');
  const fail = m => { errEl.textContent = m; errEl.style.display = 'block'; document.getElementById('results').style.display = 'none'; document.getElementById('wiCard').style.display = 'none'; document.getElementById('skinEffectArea').innerHTML = ''; document.getElementById('calcStepsCard').style.display = 'none'; };
  errEl.style.display = 'none';
  const V = parseFloat(document.getElementById('voltage').value);
  const I = parseFloat(document.getElementById('current').value);
  const Ta = parseFloat(document.getElementById('ambient').value);
  const Tm = getTempValue();
  const pct = parseFloat(document.getElementById('vdropPct').value);
  let L = parseFloat(document.getElementById('length').value);
  const freq = calcFreq;
  const unit = document.getElementById('lenUnit').value, dist = document.getElementById('distType').value, h = getH();
  if ([V, I, Ta, Tm, pct, L].some(isNaN)) return fail(T[lang].errFillAll);
  if (V <= 0 || I <= 0 || L <= 0 || pct <= 0) return fail(T[lang].errPositive);
  if (Tm <= Ta) return fail(T[lang].errTempAbove + ' (' + Ta + ' °C).');
  if (!isFinite(h) || h <= 0) return fail(T[lang].errHeat);
  if (unit === 'cm') L /= 100; else if (unit === 'mm') L /= 1000;
  const Lone = dist === 'total' ? L / 2 : L;
  let res;
  try { res = fullCalc({ V, I, Tamb: Ta, Tmax: Tm, pct, Lone, sys: sysType, h, freq }); }
  catch (e) { return fail(T[lang].errFillAll); }
  lastParams = { V, I, Tamb: Ta, Tmax: Tm, pct, Lone, sys: sysType, h, freq };
  document.getElementById('card-vd').classList.toggle('lim', !res.ampLimits);
  document.getElementById('card-amp').classList.toggle('lim', res.ampLimits);
  document.getElementById('fVd').textContent = sysType === 'ac3' ? 'A = √3·I·ρ·L / V_drop' : 'A = I·ρ·2L / V_drop';
  const ex = T[lang].convExact.toLowerCase();
  document.getElementById('vdExact').textContent = fmtMm2(res.vdMm2) + ' mm²';
  document.getElementById('vdExactSub').textContent = 'AWG ' + mm2ToAwg(res.vdMm2).toFixed(2) + ' (' + ex + ')';
  document.getElementById('vdStd').textContent = res.vdStd + ' mm²';
  document.getElementById('vdAwg').textContent = fmtAwg(res.vdAwg);
  document.getElementById('ampExact').textContent = fmtMm2(res.ampMm2) + ' mm²';
  document.getElementById('ampExactSub').textContent = 'AWG ' + mm2ToAwg(res.ampMm2).toFixed(2) + ' (' + ex + ')';
  document.getElementById('ampStd').textContent = res.ampStd + ' mm²';
  document.getElementById('ampAwg').textContent = fmtAwg(res.ampAwg);
  document.getElementById('recMm2').textContent = res.recStd + ' mm²  ·  ' + fmtAwg(res.recAwg);
  document.getElementById('recSub').textContent = res.ampLimits ? T[lang].limByAmp : T[lang].limByVd;
  document.getElementById('recTags').innerHTML = [
    `<span class="rec-tag hi">${T[lang].pLossTag} ${fmtW(res.pLoss)}</span>`,
    `<span class="rec-tag">${T[lang].wireAmpTag} ${res.wireAmp.toFixed(1)} A</span>`,
    `<span class="rec-tag">${T[lang].fuseTag} ${res.fuse} A</span>`
  ].join('');
  // IEC 60364-5-54 Table 54.2 simplified method for PE/PEN sizing
  const peMm2raw = calcPeMm2(res.recStd);
  const peStd = stdMm2Up(peMm2raw);
  const peAwg = stdAwgUp(peMm2raw);
  
  // Check for fault data from short-circuit tab (tab 3)
  let peAdiabaticHtml = '';
  if (typeof window._scLastResult !== 'undefined' && window._scLastResult) {
    const scRes = window._scLastResult;
    // Use Ik1_max (earth fault) for adiabatic check, fall back to Ik3_max
    const I_fault_A = (scRes.Ik1_max || scRes.Ik1_min || scRes.Ik3_max || scRes.Ik3_min) * 1000; // kA → A
    // Get clearing time from sc.js form
    const discTimeEl = document.getElementById('sc-disc-time');
    const t_s = discTimeEl ? parseFloat(discTimeEl.value) : 0.4; // default 0.4s for final circuits
    // Use copper k_adi by default (from MATERIAL.cu.k_adi = 115)
    const k = MATERIAL.cu.k_adi;
    
    if (I_fault_A > 0 && t_s > 0) {
      const peAdiabaticRaw = calcPeAdiabatic(I_fault_A, t_s, k);
      const peAdiabaticStd = stdMm2Up(peAdiabaticRaw);
      const peAdiabaticAwg = stdAwgUp(peAdiabaticRaw);
      const peAdiabaticFmt = fmtMm2(peAdiabaticRaw);
      peAdiabaticHtml = `
        <span class="rec-pe-method">
          <span class="rec-pe-label">Adiabatic (IEC 60364-5-54 §543.1.2):</span>
          <span class="rec-pe-adiabatic">${peAdiabaticStd} mm² · ${fmtAwg(peAdiabaticAwg)}</span>
          <span class="rec-pe-note">(S=√(I²·t)/k = √(${Math.round(I_fault_A)}²·${t_s})/${k} = ${peAdiabaticFmt} mm²)</span>
        </span>
      `;
    }
  }
  
  document.getElementById('recPe').innerHTML =
    `<span class="rec-pe-badge">${T[lang].peRec}</span><span class="rec-pe-val">${peStd} mm²  ·  ${fmtAwg(peAwg)}</span>` +
    (peAdiabaticHtml ? '<br>' + peAdiabaticHtml : '');
  
  lastCalcResult = { recStd: res.recStd, recAwg: res.recAwg, peStd, peAwg };
  document.getElementById('rVdAllow').textContent = res.Vd.toFixed(3) + ' V';
  document.getElementById('rVdAllowP').textContent = pct.toFixed(1) + '% ' + T[lang].of + ' ' + V + ' V';
  document.getElementById('rVdActual').textContent = res.vdActV.toFixed(3) + ' V';
  document.getElementById('rVdActualP').textContent = res.vdActP.toFixed(2) + '% ' + T[lang].of + ' ' + V + ' V';
  const sysLbl = { dc: 'DC', ac1: T[lang].sysAc1, ac3: T[lang].sysAc3 }[sysType];
  const dl = dist === 'total'
    ? (Lone * 2).toPrecision(4) + ' ' + unit + ' ' + T[lang].noteTotal
    : Lone.toPrecision(4) + ' ' + unit + ' ' + T[lang].noteOneway;
  let noteStr = `${sysLbl} · ${dl} · ${I}A · T_amb=${Ta}°C · T_max=${Tm}°C · ρ=${(res.rho * 1e8).toFixed(3)}×10⁻⁸Ω·m · h=${h}W/m²K`;
  if (sysType !== 'dc') {
    noteStr += ` · R_DC=${(res.rDC * 1e3).toFixed(4)} mΩ/m · R_AC=${(res.rAC * 1e3).toFixed(4)} mΩ/m @ ${freq}Hz`;
  }
  document.getElementById('rNote').textContent = noteStr;
  const seArea = document.getElementById('skinEffectArea');
  if (sysType !== 'dc' && res.ys > 0.05) {
    seArea.innerHTML = `<div class="warn-chip info">${T[lang].skinEffectWarn.replace('{pct}', (res.ys * 100).toFixed(1))}</div>`;
  } else {
    seArea.innerHTML = '';
  }
  document.getElementById('results').style.display = 'block';
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // ── step-by-step text ──────────────────────────────────────────────────────
  const stepsText = buildCalcSteps({ V, I, Ta, Tm, pct, Lone, h, freq, dist, unit }, res);
  document.getElementById('calcSteps').textContent = stepsText;
  window._calcLastResult = {
    V, I, Ta, Tm, pct, Lone, sysType, h, freq, dist, unit,
    rho: res.rho, Vd: res.Vd, vdDcMm2: res.vdDcMm2, ys0: res.ys0,
    dT: res.dT, fEff: res.fEff, vdMm2: res.vdMm2, ampMm2: res.ampMm2,
    vdStd: res.vdStd, ampStd: res.ampStd, recStd: res.recStd,
    vdActV: res.vdActV, vdActP: res.vdActP, pLoss: res.pLoss,
    wireAmp: res.wireAmp, fuse: res.fuse, rDC: res.rDC, rAC: res.rAC,
    ys: res.ys, ampLimits: res.ampLimits, peStd, stepsText
  };
  document.getElementById('calcStepsCard').style.display = 'block';

  const slMax = Math.max(I * 4, 50);
  const sl = document.getElementById('wiSlider');
  sl.min = 0.1; sl.max = slMax; sl.step = 0.1; sl.value = I;
  document.getElementById('wiMin').textContent = '0.1 A';
  document.getElementById('wiMax').textContent = slMax.toFixed(0) + ' A';
  document.getElementById('wiCard').style.display = 'block';
  updateWhatIf();
}

function updateWhatIf() {
  if (!lastParams) return;
  const I = parseFloat(document.getElementById('wiSlider').value);
  document.getElementById('wiCurLabel').textContent = I.toFixed(1) + ' A';
  try {
    const r = fullCalc({ ...lastParams, I });
    document.getElementById('wiWire').textContent = r.recStd + ' mm²';
    document.getElementById('wiAwg').textContent = fmtAwg(r.recAwg);
    document.getElementById('wiLim').textContent = r.ampLimits ? T[lang].wiAmp : T[lang].wiVd;
    document.getElementById('wiPlossVal').textContent = fmtW(r.pLoss);
    document.getElementById('wiFuseVal').textContent = r.fuse + ' A';
  } catch {
    ['wiWire', 'wiAwg', 'wiLim', 'wiPlossVal', 'wiFuseVal'].forEach(id => document.getElementById(id).textContent = '—');
  }
}

/* =====================================================================
   STEP-BY-STEP CALCULATION TEXT
   ===================================================================== */
function buildCalcSteps(p, res) {
  const { V, I, Ta, Tm, pct, Lone, h, freq, dist, unit } = p;
  const sysLabels = { dc: 'DC', ac1: 'AC Single-phase', ac3: 'AC Three-phase' };
  const sysLbl = sysLabels[sysType] || sysType;
  const nCond = sysType === 'ac3' ? 3 : 2;
  const lbl = dist === 'total' ? 'total' : 'one-way';
  const L_disp = dist === 'total' ? Lone * 2 : Lone;

  const fEff = res.fEff;
  const rho = res.rho;
  const Vd = res.Vd;
  const vdDcMm2 = res.vdDcMm2;
  const ys0 = res.ys0;
  const dT = res.dT;
  const rhoEff0 = rho * (1 + ys0);
  const K = Math.sqrt(h * 2 * Math.sqrt(Math.PI) * dT / rhoEff0);
  const R_DC_0 = rho / (vdDcMm2 * 1e-6);
  const xs2_0 = fEff > 0 ? (8 * Math.PI * fEff * 1e-7) / R_DC_0 : 0;
  const xs_0  = Math.sqrt(xs2_0);
  const xs4_0 = xs2_0 * xs2_0;
  const xs2_rec = fEff > 0 ? (8 * Math.PI * fEff * 1e-7) / res.rDC : 0;
  const xs_rec  = Math.sqrt(xs2_rec);
  const xs4_rec = xs2_rec * xs2_rec;
  const fmtE = v => v.toExponential(3);
  const fmtR = v => (v * 1e3).toFixed(4) + ' mOhm/m';

  const vdFormula = sysType === 'ac3'
    ? 'A_vd_DC = sqrt(3) * I * rho * L / Vd  [AC three-phase]'
    : sysType === 'ac1'
    ? 'A_vd_DC = I * 2 * rho * L / Vd  [AC single-phase]'
    : 'A_vd_DC = I * 2 * rho * L / Vd  [DC]';
  const vdCalc = sysType === 'ac3'
    ? `         = 1.7321 * ${I} * ${fmtE(rho)} * ${Lone} / ${Vd.toFixed(3)}`
    : `         = ${I} * 2 * ${fmtE(rho)} * ${Lone} / ${Vd.toFixed(3)}`;
  const vdActFormula = sysType === 'ac3'
    ? `Vd_actual = sqrt(3) * I * R_AC * L = 1.7321 * ${I} * ${fmtR(res.rAC).split(' ')[0].replace('mOhm/m','')}e-3 * ${Lone}`
    : `Vd_actual = I * R_AC * 2 * L = ${I} * ${fmtR(res.rAC).split(' ')[0].replace('mOhm/m','')}e-3 * 2 * ${Lone}`;
  const pLossFormula = `P_loss = I^2 * R_AC * ${nCond} * L = ${I}^2 * ${fmtR(res.rAC).split(' ')[0].replace('mOhm/m','')}e-3 * ${nCond} * ${Lone}`;

  const lines = [
    `System:       ${sysLbl}${fEff > 0 ? '  |  f = ' + freq + ' Hz' : ''}`,
    `V = ${V} V   |   I = ${I} A   |   L (${lbl}) = ${L_disp} ${unit}`,
    `T_amb = ${Ta} °C   |   T_max = ${Tm} °C   |   Vd_allow = ${pct} %   |   h = ${h.toFixed(3)} W/m²K`,
    '─'.repeat(72),
    '',
    'Step 1 — Resistivity of copper  (IEC 60228, at max. conductor temperature)',
    `   rho_20  = 1.724e-8 Ohm*m      alpha = 0.00393 /K`,
    `   rho(${Tm}°C) = rho_20 * (1 + alpha * (${Tm} - 20))`,
    `            = 1.724e-8 * (1 + 0.00393 * ${Tm - 20})`,
    `            = ${fmtE(rho)} Ohm*m`,
    '',
    'Step 2 — Allowed voltage drop',
    `   Vd = ${V} * ${pct} / 100 = ${Vd.toFixed(3)} V`,
    '',
    'Step 3 — Minimum area from voltage drop  (DC basis, used for skin-effect estimate)',
    `   ${vdFormula}`,
    `   ${vdCalc}`,
    `         = ${vdDcMm2.toFixed(4)} mm²  (exact)`,
    '',
  ];

  if (fEff > 0) {
    lines.push(
      `Step 4 — Skin effect  (IEC 60287, f = ${freq} Hz, ks = 1, Cu stranded)`,
      `   R_DC_0 = rho / A_vd_DC = ${fmtE(rho)} / ${fmtE(vdDcMm2 * 1e-6)} = ${fmtE(R_DC_0)} Ohm/m`,
      `   xs^2   = 8*pi*${freq}*1e-7 / R_DC_0 = ${xs2_0.toExponential(4)}`,
      `   xs     = ${xs_0.toFixed(6)}`,
      `   ys_0   = xs^4 / (192 + 0.8*xs^4) = ${(ys0 * 100).toFixed(4)} %`,
      `   A_vd   = ${vdDcMm2.toFixed(4)} * (1 + ${ys0.toExponential(3)}) = ${res.vdMm2.toFixed(4)} mm²  (AC-corrected)`,
      '',
    );
  } else {
    lines.push(
      'Step 4 — Skin effect',
      '   DC system — no skin effect (ys = 0, R_AC = R_DC)',
      '',
    );
  }

  lines.push(
    'Step 5 — Minimum area from ampacity  (thermal steady-state balance)',
    `   dT      = ${Tm} - ${Ta} = ${dT} °C`,
    `   rho_eff = ${fmtE(rho)} * (1 + ${ys0.toExponential(3)}) = ${fmtE(rhoEff0)} Ohm*m`,
    `   K       = sqrt(h * 2*sqrt(pi) * dT / rho_eff)`,
    `           = sqrt(${h.toFixed(3)} * 2 * 1.7725 * ${dT} / ${fmtE(rhoEff0)})`,
    `           = ${K.toExponential(4)} A/m^(3/2)`,
    `   A_amp   = (I / K)^(4/3) = (${I} / ${K.toExponential(4)})^(4/3)`,
    `           = ${res.ampMm2.toFixed(4)} mm²  (exact)`,
    '',
    'Step 6 — Standard conductor selection',
    `   VD  constraint: ${res.vdMm2.toFixed(4)} mm²  ->  rounded up  ->  ${res.vdStd} mm²`,
    `   Amp constraint: ${res.ampMm2.toFixed(4)} mm²  ->  rounded up  ->  ${res.ampStd} mm²`,
    `   Recommended: max(${res.vdStd}, ${res.ampStd}) = ${res.recStd} mm²  [limited by ${res.ampLimits ? 'ampacity' : 'voltage drop'}]`,
    '',
    `Step 7 — Verification with selected conductor  (${res.recStd} mm²)`,
    `   A       = ${res.recStd} mm² = ${fmtE(res.recStd * 1e-6)} m²`,
    `   R_DC    = rho / A = ${fmtE(rho)} / ${fmtE(res.recStd * 1e-6)} = ${fmtE(res.rDC)} Ohm/m = ${fmtR(res.rDC)}`,
  );

  if (fEff > 0) {
    lines.push(
      `   xs^2   = 8*pi*${freq}*1e-7 / R_DC = ${xs2_rec.toExponential(4)}`,
      `   xs     = ${xs_rec.toFixed(6)}`,
      `   ys     = xs^4 / (192 + 0.8*xs^4) = ${(res.ys * 100).toFixed(4)} %`,
      `   R_AC   = R_DC * (1 + ys) = ${fmtR(res.rAC)}`,
    );
  } else {
    lines.push(`   R_AC   = R_DC  (DC — no skin effect)`);
  }

  lines.push(
    `   ${vdActFormula}`,
    `           = ${res.vdActV.toFixed(3)} V  =  ${res.vdActP.toFixed(2)} %  (limit: ${pct} %)`,
    `   ${pLossFormula}`,
    `           = ${fmtW(res.pLoss)}`,
    `   Wire ampacity = sqrt(h*2*sqrt(pi)*dT/rho_AC) * A^(3/4)`,
    `                 = ${res.wireAmp.toFixed(2)} A  (continuous thermal limit)`,
    `   Suggested fuse: ${res.fuse} A`,
  );

  return lines.join('\n');
}

/* =====================================================================
   PDF EXPORT
   ===================================================================== */
async function calcDownloadPdf() {
  const btn = document.getElementById('calc-pdf-btn');
  btn.textContent = 'Generating…';
  btn.disabled = true;
  try {
    if (!window.jspdf && !window.jsPDF) { showToast('jsPDF not loaded'); return; }
    const { jsPDF } = window.jspdf || window;
    const r = window._calcLastResult;
    if (!r) { showToast('No results — calculate first'); return; }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const PW = 210, PH = 297, M = 15, CW = PW - M * 2;
    const ACC = [26, 82, 118];
    const engineer = document.getElementById('calc-engineer')?.value.trim() || '';

    function drawHeader(pg, tot) {
      pdfMakeHeader(doc, { PW, M, title: _tt('calcPdfTitle', 'Analytical Cable Sizing  (IEC 60364-5-52 / IEC 60228)') });
      pdfMakeFooter(doc, { PW, PH, M, pageNum: pg, totalPages: tot, engineer, standard: 'IEC 60364-5-52 / IEC 60228' });
    }

    function secTitle(y, txt) {
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...ACC);
      doc.text(pdfSafe(txt), M, y);
      doc.setDrawColor(220, 222, 226); doc.setLineWidth(0.3);
      doc.line(M + doc.getTextWidth(pdfSafe(txt)) + 3, y - 1, PW - M, y - 1);
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

    // ── PAGE 1: Inputs + Results ──────────────────────────────────────────
    drawHeader(1, 2);
    let y = M + 22;

    const sysLabels = { dc: 'DC', ac1: 'AC Single-phase', ac3: 'AC Three-phase' };
    const sysLbl = sysLabels[r.sysType] || r.sysType;
    const L_disp = r.dist === 'total' ? r.Lone * 2 : r.Lone;
    const lbl = r.dist === 'total' ? 'total' : 'one-way';

    y = secTitle(y, _tt('iecPdfInputs', 'Input Parameters'));
    const inputs = [
      ['System', sysLbl + (r.fEff > 0 ? '  |  f = ' + r.freq + ' Hz' : '')],
      ['Supply voltage', r.V + ' V'],
      ['Current (peak)', r.I + ' A'],
      ['Ambient temperature', r.Ta + ' °C'],
      ['Max. conductor temperature', r.Tm + ' °C'],
      ['Allowable voltage drop', r.pct + ' %  =  ' + r.Vd.toFixed(3) + ' V'],
      ['Cable length', L_disp + ' ' + r.unit + ' (' + lbl + ')'],
      ['Heat dissipation coefficient', r.h.toFixed(3) + ' W/m²K'],
      ['Conductor material', 'Copper (Cu)  —  IEC 60228'],
      ['Resistivity rho at ' + r.Tm + '°C', r.rho.toExponential(4) + ' Ohm*m'],
    ];
    inputs.forEach((row, i) => { y = inputRow(y, row[0], row[1], i % 2 === 0); });
    y += 6;

    y = secTitle(y, _tt('calcPdfConstraints', 'Constraint Analysis'));
    const cardW = CW / 2, cardH = 28;
    const cards = [
      { lbl: 'Voltage Drop',  fml: r.sysType === 'ac3' ? 'A = sqrt(3)*I*rho*L / Vd' : 'A = I*2*rho*L / Vd',
        exact: r.vdMm2.toFixed(3) + ' mm²', std: r.vdStd + ' mm²', hl: !r.ampLimits },
      { lbl: 'Ampacity',      fml: 'A = (I / K)^(4/3)  K=sqrt(h*2*sqrt(pi)*dT/rho)',
        exact: r.ampMm2.toFixed(3) + ' mm²', std: r.ampStd + ' mm²', hl: r.ampLimits },
    ];
    cards.forEach((c, i) => {
      const cx = M + i * cardW;
      if (c.hl) { doc.setFillColor(235, 244, 252); doc.setDrawColor(...ACC); doc.setLineWidth(0.5); }
      else       { doc.setFillColor(245, 247, 250); doc.setDrawColor(200, 210, 225); doc.setLineWidth(0.2); }
      doc.rect(cx, y, cardW, cardH, 'FD');
      if (c.hl) {
        doc.setFillColor(...ACC); doc.setTextColor(255, 255, 255);
        doc.setFontSize(6.5); doc.rect(cx + 1, y + 1, 22, 4, 'F');
        doc.text('LIMITING', cx + 12, y + 4.3, { align: 'center' });
      }
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(50, 50, 50);
      doc.text(pdfSafe(c.lbl), cx + cardW / 2, y + 9, { align: 'center' });
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120);
      doc.text(pdfSafe(c.fml), cx + cardW / 2, y + 14, { align: 'center', maxWidth: cardW - 4 });
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...ACC);
      doc.text(pdfSafe(c.std), cx + cardW / 2, y + 22.5, { align: 'center' });
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120);
      doc.text('exact: ' + pdfSafe(c.exact), cx + cardW / 2, y + 27, { align: 'center' });
    });
    y += cardH + 4;

    // Recommendation box
    doc.setFillColor(230, 245, 235); doc.setDrawColor(0, 150, 80); doc.setLineWidth(0.5);
    doc.rect(M, y, CW, 16, 'FD');
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    doc.text('Recommended conductor', M + 4, y + 5);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 120, 60);
    doc.text(pdfSafe(r.recStd + ' mm²  (limited by ' + (r.ampLimits ? 'ampacity' : 'voltage drop') + ')'), PW / 2, y + 12, { align: 'center' });
    y += 16 + 4;

    // R_DC / R_AC bar (AC only)
    if (r.fEff > 0) {
      doc.setFillColor(240, 245, 250); doc.setDrawColor(200, 210, 225); doc.setLineWidth(0.2);
      doc.rect(M, y, CW, 10, 'FD');
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
      doc.text(pdfSafe('R_DC = ' + (r.rDC * 1e3).toFixed(4) + ' mOhm/m'), M + CW * 0.15, y + 6.5, { align: 'center' });
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...ACC);
      doc.text(pdfSafe('R_AC = ' + (r.rAC * 1e3).toFixed(4) + ' mOhm/m @ ' + r.freq + ' Hz'), M + CW * 0.60, y + 6.5, { align: 'center' });
      if (r.ys > 0.001) {
        doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120);
        doc.text(pdfSafe('ys = ' + (r.ys * 100).toFixed(3) + '%'), M + CW - 3, y + 6.5, { align: 'right' });
      }
      y += 10 + 3;
    }

    // Skin effect warning (if >5%)
    if (r.fEff > 0 && r.ys > 0.05) {
      doc.setFillColor(255, 245, 220); doc.setDrawColor(200, 130, 0); doc.setLineWidth(0.4);
      doc.rect(M, y, CW, 10, 'FD');
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(160, 100, 0);
      doc.text(pdfSafe('(!): Skin effect increases resistance by ' + (r.ys * 100).toFixed(1) + '% — accounted for in this calculation'), PW / 2, y + 6.5, { align: 'center' });
      y += 10 + 2;
    }

    // VD detail row
    doc.setFillColor(245, 247, 250); doc.setDrawColor(200, 210, 225); doc.setLineWidth(0.2);
    doc.rect(M, y, CW / 2, 10, 'FD'); doc.rect(M + CW / 2, y, CW / 2, 10, 'FD');
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text('Allowed Vd (max)', M + CW / 4, y + 4.5, { align: 'center' });
    doc.text('Actual Vd (rec. wire)', M + CW * 0.75, y + 4.5, { align: 'center' });
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text(pdfSafe(r.Vd.toFixed(3) + ' V  (' + r.pct + '%)'), M + CW / 4, y + 8.5, { align: 'center' });
    doc.text(pdfSafe(r.vdActV.toFixed(3) + ' V  (' + r.vdActP.toFixed(2) + '%)'), M + CW * 0.75, y + 8.5, { align: 'center' });
    y += 10 + 3;

    // P loss + Ampacity + Fuse row
    const cols3 = CW / 3;
    const vals3 = [
      ['Power loss', fmtW(r.pLoss)],
      ['Wire ampacity', r.wireAmp.toFixed(1) + ' A'],
      ['Suggested fuse', r.fuse + ' A'],
    ];
    vals3.forEach(([label, val], i) => {
      const cx = M + i * cols3;
      doc.setFillColor(i === 0 ? 250 : 245, i === 0 ? 240 : 247, i === 0 ? 240 : 250);
      doc.setDrawColor(200, 210, 225); doc.setLineWidth(0.2);
      doc.rect(cx, y, cols3, 10, 'FD');
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
      doc.text(pdfSafe(label), cx + cols3 / 2, y + 4.2, { align: 'center' });
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
      doc.text(pdfSafe(val), cx + cols3 / 2, y + 8.5, { align: 'center' });
    });
    y += 10 + 3;

    // PE recommendation
    doc.setFillColor(245, 247, 250); doc.setDrawColor(200, 210, 225); doc.setLineWidth(0.2);
    doc.rect(M, y, CW, 8, 'FD');
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text('Min. PE/PEN conductor size:', M + 3, y + 5.5);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text(pdfSafe(r.peStd + ' mm²'), M + CW - 3, y + 5.5, { align: 'right' });

    // ── PAGE 2: Step-by-step calculation ─────────────────────────────────
    doc.addPage();
    drawHeader(2, 2);
    y = M + 22;
    y = secTitle(y, _tt('iecPdfSteps', 'Step-by-Step Calculation'));
    y += 1;
    doc.setFontSize(7.5); doc.setFont('Courier', 'normal'); doc.setTextColor(50, 50, 50);
    const stepLines = r.stepsText.split('\n');
    const lh = 4.2;
    stepLines.forEach(line => {
      if (y + lh > PH - M - 10) {
        doc.addPage();
        drawHeader(doc.getNumberOfPages(), 2);
        y = M + 22;
      }
      doc.text(pdfSafe(line), M, y);
      y += lh;
    });

    doc.save('cable-sizing.pdf');
  } finally {
    btn.textContent = '⬇ Download PDF';
    btn.disabled = false;
  }
}
