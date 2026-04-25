let sysType = 'dc';
let lastParams = null;
let lastCalcResult = null; // shared with sc.js for import feature

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
  const fail = m => { errEl.textContent = m; errEl.style.display = 'block'; document.getElementById('results').style.display = 'none'; document.getElementById('wiCard').style.display = 'none'; document.getElementById('skinEffectArea').innerHTML = ''; };
  errEl.style.display = 'none';
  const V = parseFloat(document.getElementById('voltage').value);
  const I = parseFloat(document.getElementById('current').value);
  const Ta = parseFloat(document.getElementById('ambient').value);
  const Tm = getTempValue();
  const pct = parseFloat(document.getElementById('vdropPct').value);
  let L = parseFloat(document.getElementById('length').value);
  const freq = parseFloat(document.getElementById('frequency').value) || 50;
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
  const peMm2raw = calcPeMm2(res.recStd);
  const peStd = stdMm2Up(peMm2raw);
  const peAwg = stdAwgUp(peMm2raw);
  document.getElementById('recPe').innerHTML =
    `<span class="rec-pe-badge">${T[lang].peRec}</span><span class="rec-pe-val">${peStd} mm²  ·  ${fmtAwg(peAwg)}</span>`;
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
