let convDir = 'mm2ToAwg';
let convDone = false;

function buildRefTable() {
  const l = T[lang];
  document.getElementById('refHdrMm2').textContent = l.refHdrMm2;
  document.getElementById('refHdrAwg').textContent = l.refHdrAwg;

  const MM2_REF = MM2_STD.filter(m => m <= 120);
  const t1 = document.getElementById('refTblMm2');
  t1.innerHTML = `<thead><tr>
    <th>${l.refThMm2}</th><th>${l.refThAwgNearest}</th><th>${l.refThAwgSafe}</th>
  </tr></thead><tbody>${MM2_REF.map(m => {
    const nearest = closeAwg(m), safe = stdAwgUp(m);
    return `<tr><td>${m}</td><td class="dim">${fmtAwg(nearest)}</td><td>${fmtAwg(safe)}</td></tr>`;
  }).join('')}</tbody>`;

  const t2 = document.getElementById('refTblAwg');
  t2.innerHTML = `<thead><tr>
    <th>${l.refThAwg}</th><th>${l.refThMm2Exact}</th><th>${l.refThIecSafe}</th>
  </tr></thead><tbody>${AWG_REF.map(a => {
    const ex = awgToMm2(a), safe = stdMm2Up(ex);
    return `<tr><td>${fmtAwg(a)}</td><td class="dim">${fmtMm2(ex)}</td><td>${safe}</td></tr>`;
  }).join('')}</tbody>`;
}

function showConvRef(show) {
  document.getElementById('refTblWrap').style.display = show ? 'block' : 'none';
}

function swapConv() {
  convDir = convDir === 'mm2ToAwg' ? 'awgToMm2' : 'mm2ToAwg';
  const m = convDir === 'mm2ToAwg';
  document.getElementById('cFromLbl').textContent = m ? 'MM²' : 'AWG';
  document.getElementById('cToLbl').textContent = m ? 'AWG' : 'MM²';
  document.getElementById('cFromLbl').style.color = 'var(--pri)';
  document.getElementById('cToLbl').style.color = 'var(--on-surf)';
  document.getElementById('cInMm2').style.display = m ? 'block' : 'none';
  document.getElementById('cInAwg').style.display = m ? 'none' : 'block';
  convDone = false;
  document.getElementById('cResults').style.display = 'none';
  document.getElementById('cNote').style.display = 'none';
  document.getElementById('cErr').style.display = 'none';
  showConvRef(true);
}

function doConvert() {
  const e = document.getElementById('cErr'); e.style.display = 'none';
  if (convDir === 'mm2ToAwg') {
    const v = parseFloat(document.getElementById('cMm2').value);
    if (isNaN(v) || v <= 0) { e.textContent = T[lang].errPositive; e.style.display = 'block'; return; }
    const eA = mm2ToAwg(v), cA = closeAwg(v), sA = stdAwgUp(v);
    document.getElementById('cExact').textContent = isFinite(eA) ? eA.toFixed(3) : '—';
    document.getElementById('cExactSub').textContent = 'AWG (' + T[lang].convExact.toLowerCase() + ')';
    document.getElementById('cClosest').textContent = fmtAwg(cA);
    document.getElementById('cClosestSub').textContent = fmtMm2(awgToMm2(cA)) + ' mm²';
    document.getElementById('cRoundup').textContent = fmtAwg(sA);
    document.getElementById('cRoundupSub').textContent = fmtMm2(awgToMm2(sA)) + ' mm²';
    document.getElementById('cNote').textContent = `${v} mm² → AWG ${eA.toFixed(3)} · ${fmtAwg(cA)} · ${fmtAwg(sA)}`;
  } else {
    const cu = parseFloat(document.getElementById('cAwgNum').value);
    const aw = !isNaN(cu) ? cu : parseFloat(document.getElementById('cAwgSel').value);
    const em = awgToMm2(aw), cm = closeMm2(em), sm = stdMm2Up(em);
    document.getElementById('cExact').textContent = fmtMm2(em) + ' mm²';
    document.getElementById('cExactSub').textContent = T[lang].convExact.toLowerCase();
    document.getElementById('cClosest').textContent = cm + ' mm²'; document.getElementById('cClosestSub').textContent = 'IEC';
    document.getElementById('cRoundup').textContent = sm + ' mm²'; document.getElementById('cRoundupSub').textContent = 'IEC';
    document.getElementById('cNote').textContent = `AWG ${aw} → ${fmtMm2(em)} mm² · IEC ${cm} / ${sm} mm²`;
  }
  convDone = true;
  document.getElementById('cResults').style.display = 'grid';
  document.getElementById('cNote').style.display = 'block';
  showConvRef(false);
}
