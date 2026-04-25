/* =====================================================================
   CABLE TRAY / CONDUIT FILL CALCULATOR
   IEC 60364-5-52  ·  NEC 392 / NEC 358
   ===================================================================== */

/* Standard cable outer diameters (mm) estimated from cross-section
   Based on typical single-core PVC-insulated cables (conductor + insulation) */
const TRAY_XSEC_OD = {
  1.5: 6.5, 2.5: 7.5, 4: 8.5, 6: 9.5, 10: 12.0, 16: 14.0,
  25: 17.0, 35: 19.0, 50: 22.0, 70: 26.0, 95: 30.0, 120: 34.0
};

const TRAY_XSEC_LIST = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120];

/* Fill limits per IEC 60364-5-52 / NEC 392-80 */
const TRAY_LIMITS = {
  single: { iec: 53, nec: 53 },
  two:    { iec: 31, nec: 31 },
  power:  { iec: 40, nec: 40 },
  signal: { iec: 50, nec: 50 },
  mixed:  { iec: 40, nec: 40 }
};

/* Rule descriptions per language */
const TRAY_RULE_DESC = {
  single: { eng: 'Single cable',                              cze: 'Jeden kabel',                          deu: 'Ein Kabel' },
  two:    { eng: '2 cables',                                  cze: '2 kabely',                             deu: '2 Kabel' },
  power:  { eng: '3+ power cables',                          cze: '3+ silové kabely',                     deu: '3+ Energiekabel' },
  signal: { eng: '3+ control / signal cables',               cze: '3+ řídicí / signálové kabely',          deu: '3+ Steuer-/Signalkabel' },
  mixed:  { eng: '3+ mixed cables (power + other)',          cze: '3+ různé kabely (silové + jiné)',       deu: '3+ gemischte Kabel (Energie + andere)' }
};

/* ---- Module state ---- */
let _trayGeomMode    = 'rect';
let _trayConduitType = 'round';
let _trayTrayType    = 'ladder';
let _trayStandard    = 'iec';
let _trayRows        = [];
let _trayNextId      = 0;
let _trayLastResult  = null;

/* ===================================================================== */
/*  INIT                                                                   */
/* ===================================================================== */
function initTray() {
  trayAddRow();
}

/* ===================================================================== */
/*  GEOMETRY MODE                                                          */
/* ===================================================================== */
function traySetGeomMode(el, mode) {
  _trayGeomMode = mode;
  el.closest('.seg-group').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('tray-rect-inputs').style.display = mode === 'rect' ? '' : 'none';
  document.getElementById('tray-circ-inputs').style.display = mode === 'circ' ? '' : 'none';
}

function traySetConduitType(el, type) {
  _trayConduitType = type;
  el.closest('.seg-group').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('tray-round-inputs').style.display = type === 'round' ? '' : 'none';
  document.getElementById('tray-oval-inputs').style.display  = type === 'oval'  ? '' : 'none';
}

function traySetTrayType(el, type) {
  _trayTrayType = type;
  el.closest('.seg-group').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

function traySetStandard(el, std) {
  _trayStandard = std;
  el.closest('.seg-group').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

/* ===================================================================== */
/*  CABLE TABLE                                                            */
/* ===================================================================== */
function trayAddRow() {
  const id = _trayNextId++;
  _trayRows.push({ id, mode: 'od', odMode: 'diameter', od: 10, xsec: 2.5, count: 1, type: 'power' });
  _trayRenderRows();
}

function trayDeleteRow(id) {
  _trayRows = _trayRows.filter(r => r.id !== id);
  _trayRenderRows();
}

function traySetRowMode(id, mode) {
  _trayReadRow(id);
  const row = _trayRows.find(r => r.id === id);
  if (!row) return;
  row.mode = mode;
  _trayRenderRows();
}

function trayToggleOdMode(id) {
  _trayReadRow(id);
  const row = _trayRows.find(r => r.id === id);
  if (!row) return;
  row.odMode = row.odMode === 'diameter' ? 'radius' : 'diameter';
  _trayRenderRows();
}

function trayUpdateRow(id) {
  _trayReadRow(id);
  const row = _trayRows.find(r => r.id === id);
  if (!row) return;
  const areaEl = document.getElementById(`tray-area-${id}`);
  if (areaEl) {
    const area = Math.PI * Math.pow(row.od / 2, 2) * row.count;
    areaEl.textContent = area.toFixed(1);
  }
}

function _trayReadRow(id) {
  const row = _trayRows.find(r => r.id === id);
  if (!row) return;
  if (row.mode === 'od') {
    const odEl = document.getElementById(`tray-od-val-${id}`);
    if (odEl) {
      const v = parseFloat(odEl.value) || 0;
      row.od = row.odMode === 'diameter' ? v : v * 2;
    }
  } else {
    const selEl = document.getElementById(`tray-xsec-sel-${id}`);
    if (selEl) {
      row.xsec = parseFloat(selEl.value);
      row.od = TRAY_XSEC_OD[row.xsec] || 10;
    }
  }
  const cntEl  = document.getElementById(`tray-count-${id}`);
  if (cntEl)  row.count = Math.max(1, parseInt(cntEl.value)  || 1);
  const typeEl = document.getElementById(`tray-type-${id}`);
  if (typeEl) row.type = typeEl.value;
}

/* Exposed so setLang() can refresh localised dropdown options */
function trayRenderRows() { _trayRenderRows(); }

function _trayRenderRows() {
  const tbody = document.getElementById('tray-cable-body');
  if (!tbody) return;

  const tLang = (typeof lang !== 'undefined' && T[lang]) ? lang : 'eng';
  const t = T[tLang];

  const TL = {
    power:   t.tray_typePower   || 'Power',
    control: t.tray_typeControl || 'Control',
    fiber:   t.tray_typeFiber   || 'Fiber',
    signal:  t.tray_typeSignal  || 'Signal'
  };
  const modeOD   = t.tray_modeOD   || 'OD';
  const modeXsec = t.tray_modeXsec || 'mm²';
  const warnEst  = t.tray_warnEstOd || 'OD estimated — may vary by manufacturer';

  tbody.innerHTML = '';

  for (const row of _trayRows) {
    const odDisp   = row.odMode === 'diameter' ? row.od : row.od / 2;
    const odUnit   = row.odMode === 'diameter' ? 'mm (⌀)' : 'mm (r)';
    const odToggle = row.odMode === 'diameter' ? '⇄ r' : '⇄ ⌀';
    const area     = Math.PI * Math.pow(row.od / 2, 2) * row.count;

    const xsecOpts = TRAY_XSEC_LIST.map(v =>
      `<option value="${v}"${v === row.xsec ? ' selected' : ''}>${v} mm²</option>`
    ).join('');
    const typeOpts = ['power','control','fiber','signal'].map(tp =>
      `<option value="${tp}"${tp === row.type ? ' selected' : ''}>${TL[tp]}</option>`
    ).join('');

    const INP = `background:var(--surf-2);border:1.5px solid var(--out);border-radius:var(--r-sm);color:var(--on-surf);font-family:'Roboto',sans-serif;font-size:12.5px;padding:5px 8px;outline:none;`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="white-space:nowrap">
        <div class="seg-group" style="margin-bottom:0;min-width:72px">
          <button class="seg-btn${row.mode==='od'?' active':''}" onclick="traySetRowMode(${row.id},'od')" style="padding:4px 6px;font-size:11px">${modeOD}</button>
          <button class="seg-btn${row.mode==='xsec'?' active':''}" onclick="traySetRowMode(${row.id},'xsec')" style="padding:4px 6px;font-size:11px">${modeXsec}</button>
        </div>
      </td>
      <td>
        <div style="display:${row.mode==='od'?'block':'none'}">
          <div style="display:flex;align-items:center;gap:4px">
            <input type="number" id="tray-od-val-${row.id}" value="${odDisp.toFixed(1)}" min="0.1" step="0.1" oninput="trayUpdateRow(${row.id})" style="${INP}width:62px">
            <span style="font-size:10px;color:var(--on-surf-var);white-space:nowrap">${odUnit}</span>
          </div>
          <button onclick="trayToggleOdMode(${row.id})" style="margin-top:3px;background:var(--sec-con);color:var(--on-sec-con);border:none;border-radius:var(--r-sm);padding:2px 7px;font-size:10px;cursor:pointer;font-family:'Roboto',sans-serif">${odToggle}</button>
        </div>
        <div style="display:${row.mode==='xsec'?'block':'none'}">
          <select id="tray-xsec-sel-${row.id}" onchange="trayUpdateRow(${row.id})" style="${INP}width:88px">${xsecOpts}</select>
          <div style="font-size:9.5px;color:var(--warn-col);margin-top:3px;line-height:1.35;max-width:115px">${warnEst}</div>
        </div>
      </td>
      <td><input type="number" id="tray-count-${row.id}" value="${row.count}" min="1" step="1" oninput="trayUpdateRow(${row.id})" style="${INP}width:52px"></td>
      <td><select id="tray-type-${row.id}" onchange="trayUpdateRow(${row.id})" style="${INP}min-width:80px">${typeOpts}</select></td>
      <td id="tray-area-${row.id}" style="font-family:'Roboto Mono',monospace;font-size:12px;color:var(--pri);white-space:nowrap">${area.toFixed(1)}</td>
      <td><button onclick="trayDeleteRow(${row.id})" class="sb-del-btn" style="padding:3px 8px;font-size:11px">✕</button></td>
    `;
    tbody.appendChild(tr);
  }
}

/* ===================================================================== */
/*  GEOMETRY HELPERS                                                       */
/* ===================================================================== */
function _trayGetUsableArea() {
  if (_trayGeomMode === 'rect') {
    const w = parseFloat(document.getElementById('tray-width').value)  || 0;
    const h = parseFloat(document.getElementById('tray-height').value) || 0;
    return { area: w * h, w, h, valid: w > 0 && h > 0 };
  }
  if (_trayConduitType === 'round') {
    const d = parseFloat(document.getElementById('tray-diameter').value) || 0;
    return { area: Math.PI * Math.pow(d / 2, 2), d, valid: d > 0 };
  }
  const ow = parseFloat(document.getElementById('tray-oval-w').value) || 0;
  const oh = parseFloat(document.getElementById('tray-oval-h').value) || 0;
  return { area: Math.PI * (ow / 2) * (oh / 2), ow, oh, valid: ow > 0 && oh > 0 };
}

/* ===================================================================== */
/*  FILL LIMIT LOGIC                                                       */
/* ===================================================================== */
function _trayGetLimits(totalCount, types) {
  const hasPower = types.has('power');
  const hasOther = types.has('control') || types.has('fiber') || types.has('signal');
  const mixed    = hasPower && hasOther;
  let ruleKey;

  if      (totalCount === 1) ruleKey = 'single';
  else if (totalCount === 2) ruleKey = 'two';
  else if (mixed)            ruleKey = 'mixed';
  else if (hasPower)         ruleKey = 'power';
  else                       ruleKey = 'signal';

  return {
    ruleKey,
    mixed,
    limitIec: TRAY_LIMITS[ruleKey].iec,
    limitNec:  TRAY_LIMITS[ruleKey].nec
  };
}

/* ===================================================================== */
/*  CALCULATE                                                              */
/* ===================================================================== */
function trayCalculate() {
  const errEl = document.getElementById('tray-err');
  errEl.style.display = 'none';

  const tLang = (typeof lang !== 'undefined' && T[lang]) ? lang : 'eng';
  const t = T[tLang];

  /* Sync all rows first */
  for (const row of _trayRows) _trayReadRow(row.id);

  /* Validate geometry */
  const geom = _trayGetUsableArea();
  if (!geom.valid) {
    errEl.textContent = t.tray_errNoTray || 'Please enter valid tray dimensions.';
    errEl.style.display = 'block';
    return;
  }

  /* Validate cables */
  if (_trayRows.length === 0) {
    errEl.textContent = t.tray_errNoCables || 'Please add at least one cable row.';
    errEl.style.display = 'block';
    return;
  }

  /* Accumulate */
  let totalCableArea = 0, totalCount = 0;
  const types    = new Set();
  const odCounts = {};

  for (const row of _trayRows) {
    const singleArea = Math.PI * Math.pow(row.od / 2, 2);
    totalCableArea  += singleArea * row.count;
    totalCount      += row.count;
    types.add(row.type);
    odCounts[row.od] = (odCounts[row.od] || 0) + row.count;
  }

  /* Fill limit */
  const { ruleKey, mixed, limitIec, limitNec } = _trayGetLimits(totalCount, types);
  const activeLimit  = _trayStandard === 'iec' ? limitIec : limitNec;
  const standardName = _trayStandard === 'iec' ? 'IEC 60364-5-52' : 'NEC 392 / 358';
  const ruleDesc     = (TRAY_RULE_DESC[ruleKey] || {})[tLang]
                    || (TRAY_RULE_DESC[ruleKey] || {}).eng
                    || ruleKey;

  /* Fill % and remaining */
  const fillPct   = (totalCableArea / geom.area) * 100;
  const remaining = Math.max(0, geom.area - totalCableArea);

  /* Most common OD by count */
  const mostCommonOd = parseFloat(Object.entries(odCounts).sort((a, b) => b[1] - a[1])[0][0]);
  const commonSingle = Math.PI * Math.pow(mostCommonOd / 2, 2);
  const roomAtLimit  = Math.max(0, (geom.area * activeLimit / 100) - totalCableArea);
  const additional   = Math.floor(roomAtLimit / commonSingle);

  /* Status */
  let statusClass, statusKey;
  if      (fillPct > activeLimit)          { statusClass = 'red';    statusKey = 'tray_statusOver'; }
  else if (fillPct > activeLimit * 0.9)   { statusClass = 'yellow'; statusKey = 'tray_statusWarn'; }
  else                                     { statusClass = 'green';  statusKey = 'tray_statusOk';   }

  /* Stacking check (rectangular only) */
  let stackWarn = false;
  if (_trayGeomMode === 'rect' && geom.w > 0 && geom.h > 0) {
    stackWarn = (totalCableArea / geom.w) > geom.h;
  }

  /* ---- Render results ---- */
  document.getElementById('tray-res-card').style.display = 'block';

  document.getElementById('tray-r-fill-pct').textContent   = fillPct.toFixed(1) + ' %';
  document.getElementById('tray-r-cable-area').textContent = totalCableArea.toFixed(0) + ' mm²';
  document.getElementById('tray-r-tray-area').textContent  = geom.area.toFixed(0) + ' mm²';
  document.getElementById('tray-r-remaining').textContent  = remaining.toFixed(0) + ' mm²';
  document.getElementById('tray-r-additional').textContent = additional + ' × ⌀' + mostCommonOd.toFixed(1) + ' mm';
  document.getElementById('tray-r-limit').textContent      = activeLimit + ' %';
  document.getElementById('tray-r-rule').textContent       = ruleDesc;

  const statusEl = document.getElementById('tray-r-status');
  statusEl.textContent = t[statusKey] || statusKey;
  statusEl.className   = 'sb-status-badge ' + statusClass;

  /* Fill bar */
  const barEl = document.getElementById('tray-fill-bar');
  barEl.style.width      = Math.min(fillPct, 100).toFixed(1) + '%';
  barEl.style.background = statusClass === 'green' ? '#00c864'
                         : statusClass === 'yellow' ? '#c88c00' : '#ff4444';

  /* Limit marker */
  document.getElementById('tray-fill-limit-marker').style.left = Math.min(activeLimit, 100) + '%';

  /* Warnings */
  const stackEl = document.getElementById('tray-stack-warn');
  stackEl.style.display = (stackWarn && _trayGeomMode === 'rect') ? 'flex' : 'none';
  if (stackWarn) stackEl.textContent = t.tray_warnStack || '⚠ Estimated stack height exceeds tray height';

  const mixedEl = document.getElementById('tray-mixed-warn');
  mixedEl.style.display = mixed ? 'flex' : 'none';
  if (mixed) mixedEl.textContent = t.tray_warnMixed || '⚠ Mixed cable types — stricter 40% rule applies';

  /* Rule info line */
  document.getElementById('tray-rule-info').textContent =
    activeLimit + '% — ' + standardName + ' — ' + ruleDesc;

  /* Store for PDF */
  _trayLastResult = {
    fillPct, totalCableArea, trayArea: geom.area, remaining, activeLimit,
    ruleKey, ruleDesc, standardName, statusClass, statusKey,
    additional, mostCommonOd, totalCount, types: [...types],
    stackWarn, mixed, geomMode: _trayGeomMode, trayType: _trayTrayType, geom
  };
}

/* ===================================================================== */
/*  CALCULATION STEPS (for PDF)                                           */
/* ===================================================================== */
function _trayBuildSteps(r) {
  const lines = [];
  let step = 1;

  // Step 1 — Tray / conduit usable area
  if (r.geomMode === 'rect') {
    lines.push(
      step++ + '. Tray usable area:\n' +
      '   A_tray = W x H = ' + r.geom.w + ' mm x ' + r.geom.h + ' mm\n' +
      '   A_tray = ' + r.trayArea.toFixed(1) + ' mm^2'
    );
  } else if (r.geom.d) {
    lines.push(
      step++ + '. Conduit usable area (round):\n' +
      '   A = pi x (d/2)^2 = pi x (' + (r.geom.d / 2).toFixed(1) + ')^2\n' +
      '   A = ' + r.trayArea.toFixed(1) + ' mm^2'
    );
  } else {
    lines.push(
      step++ + '. Duct usable area (oval):\n' +
      '   A = pi x (ow/2) x (oh/2) = pi x ' + (r.geom.ow / 2).toFixed(1) + ' x ' + (r.geom.oh / 2).toFixed(1) + '\n' +
      '   A = ' + r.trayArea.toFixed(1) + ' mm^2'
    );
  }

  // Step 2 — Individual cable cross-sectional areas
  lines.push(step++ + '. Individual cable areas  (A_i = pi x (OD/2)^2 x count):');
  const areaStrings = [];
  _trayRows.forEach((row, i) => {
    const singleA = Math.PI * Math.pow(row.od / 2, 2);
    const totalA  = singleA * row.count;
    areaStrings.push(totalA.toFixed(1));
    lines.push(
      '   Cable ' + (i + 1) + ': OD = ' + row.od.toFixed(1) + ' mm, n = ' + row.count + ', type = ' + row.type + '\n' +
      '   A_' + (i + 1) + ' = pi x (' + row.od.toFixed(1) + '/2)^2 x ' + row.count +
      ' = ' + singleA.toFixed(2) + ' x ' + row.count + ' = ' + totalA.toFixed(1) + ' mm^2'
    );
  });

  // Step 3 — Total cable area
  lines.push(
    step++ + '. Total cable area:\n' +
    '   A_cables = ' + areaStrings.join(' + ') + ' = ' + r.totalCableArea.toFixed(1) + ' mm^2'
  );

  // Step 4 — Fill percentage
  lines.push(
    step++ + '. Fill percentage:\n' +
    '   Fill% = (A_cables / A_tray) x 100\n' +
    '   Fill% = (' + r.totalCableArea.toFixed(1) + ' / ' + r.trayArea.toFixed(1) + ') x 100\n' +
    '   Fill% = ' + r.fillPct.toFixed(2) + '%'
  );

  // Step 5 — Fill limit determination
  const typesList = r.types.join(', ');
  lines.push(
    step++ + '. Fill limit (standard: ' + r.standardName + '):\n' +
    '   Cable types present: ' + typesList + '\n' +
    '   Applied rule: ' + r.ruleDesc + '\n' +
    '   Fill limit = ' + r.activeLimit + '%'
  );

  // Step 6 — Assessment
  const verdict = r.fillPct > r.activeLimit
    ? 'EXCEEDED (' + r.fillPct.toFixed(1) + '% > ' + r.activeLimit + '%)'
    : r.fillPct > r.activeLimit * 0.9
      ? 'WARNING — within 10% of limit (' + r.fillPct.toFixed(1) + '% vs ' + r.activeLimit + '%)'
      : 'OK — within limit (' + r.fillPct.toFixed(1) + '% <= ' + r.activeLimit + '%)';
  lines.push(step++ + '. Assessment:\n   ' + verdict);

  // Step 7 — Remaining capacity
  const allowedArea = r.trayArea * r.activeLimit / 100;
  const freeArea    = Math.max(0, allowedArea - r.totalCableArea);
  lines.push(
    step++ + '. Remaining capacity at limit:\n' +
    '   A_free = A_tray x Limit% - A_cables\n' +
    '   A_free = ' + r.trayArea.toFixed(1) + ' x ' + r.activeLimit + '% - ' + r.totalCableArea.toFixed(1) + '\n' +
    '   A_free = ' + allowedArea.toFixed(1) + ' - ' + r.totalCableArea.toFixed(1) + ' = ' + freeArea.toFixed(1) + ' mm^2\n' +
    '   Additional cables (OD ' + r.mostCommonOd.toFixed(1) + ' mm, most common): ' + r.additional
  );

  return lines;
}

/* ===================================================================== */
/*  PDF EXPORT                                                             */
/* ===================================================================== */
function trayDownloadPdf() {
  if (!window.jspdf) { alert('PDF library not loaded.'); return; }
  if (!_trayLastResult) { trayCalculate(); }
  if (!_trayLastResult) return;

  const { jsPDF } = window.jspdf;
  const r   = _trayLastResult;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const PW = 210, PH = 297, M = 15, CW = PW - 2 * M;
  const ACC = [26, 82, 118];

  const engineer = document.getElementById('tray-engineer')?.value.trim() || '';

  function drawHeader(pageNum, totalPages) {
    pdfMakeHeader(doc, { PW, M, title: 'Cable Tray / Conduit Fill Calculation' });
    drawFooter(pageNum, totalPages);
  }

  function drawFooter(pageNum, totalPages) {
    pdfMakeFooter(doc, { PW, PH, M, pageNum, totalPages, engineer, standard: 'IEC 60364-5-52 / NEC 392' });
  }

  let y = M + 22;  // content starts below header band

  /* ---- Section header helper ---- */
  function secHdr(title) {
    if (y > PH - M - 30) { doc.addPage(); drawHeader(_curPage(), 1); y = M + 22; }
    doc.setFontSize(10.5); doc.setFont('helvetica', 'bold');
    doc.setTextColor(...ACC);
    doc.text(pdfSafe(title), M, y);
    doc.setDrawColor(...ACC); doc.setLineWidth(0.3);
    doc.line(M, y + 1.5, M + CW, y + 1.5);
    y += 7;
    doc.setTextColor(30, 30, 30);
  }

  /* ---- Key/value row helper ---- */
  function kv(label, value) {
    if (y > PH - M - 10) { doc.addPage(); drawHeader(_curPage(), 1); y = M + 22; }
    const RH = 6.5;
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(pdfSafe(label), M + 3, y + 4.5);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text(pdfSafe(String(value)), M + CW - 3, y + 4.5, { align: 'right' });
    y += RH;
  }

  function _curPage() { return doc.getNumberOfPages(); }

  /* ================================================================
     PAGE 1  —  Summary  (Geometry + Standard + Cable table)
     ================================================================ */
  drawHeader(1, 1);  // total pages patched at end

  /* ---- Geometry ---- */
  secHdr('Summary — Geometry');
  const geomTypeStr = r.geomMode === 'rect'
    ? r.trayType.charAt(0).toUpperCase() + r.trayType.slice(1) + ' tray'
    : (_trayConduitType === 'round' ? 'Round conduit' : 'Oval duct');
  kv('Type', geomTypeStr);
  if (r.geomMode === 'rect') {
    kv('Dimensions', r.geom.w + ' mm x ' + r.geom.h + ' mm');
  } else if (r.geom.d) {
    kv('Inner diameter', r.geom.d + ' mm');
  } else {
    kv('Dimensions (oval)', r.geom.ow + ' mm x ' + r.geom.oh + ' mm');
  }
  kv('Usable area', r.trayArea.toFixed(0) + ' mm^2');
  y += 3;

  /* ---- Standard ---- */
  secHdr('Summary — Fill Standard');
  kv('Standard',     r.standardName);
  kv('Applied rule', r.ruleDesc);
  kv('Fill limit',   r.activeLimit + ' %');
  y += 3;

  /* ---- Cable table ---- */
  secHdr('Summary — Cables');
  const colW = [14, 30, 16, 30, 36, 24];
  const hdrs = ['#', 'OD (mm)', 'Count', 'Type', 'Area (mm^2)', 'Input'];

  doc.setFillColor(...ACC);
  doc.rect(M, y, CW, 6.5, 'F');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  let cx = M;
  hdrs.forEach((h, i) => {
    doc.text(pdfSafe(h), i === 0 ? cx + 2 : cx + colW[i] - 2, y + 4.5,
      i === 0 ? {} : { align: 'right' });
    cx += colW[i];
  });
  y += 6.5;

  _trayRows.forEach((row, ri) => {
    if (y > PH - M - 12) { doc.addPage(); drawHeader(_curPage(), 1); y = M + 22; }
    if (ri % 2 === 1) { doc.setFillColor(245, 248, 252); doc.rect(M, y, CW, 6.5, 'F'); }
    doc.setDrawColor(210, 215, 220); doc.setLineWidth(0.1);
    doc.rect(M, y, CW, 6.5);
    const area  = Math.PI * Math.pow(row.od / 2, 2) * row.count;
    const cells = [
      ri + 1,
      'OD ' + row.od.toFixed(1),
      row.count,
      row.type.charAt(0).toUpperCase() + row.type.slice(1),
      area.toFixed(1),
      row.mode === 'xsec' ? '[est. OD]' : 'measured',
    ];
    cx = M;
    cells.forEach((cell, i) => {
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.setTextColor(i === 5 && row.mode === 'xsec' ? 160 : 40, 40, 40);
      doc.text(pdfSafe(String(cell)), i === 0 ? cx + 2 : cx + colW[i] - 2, y + 4.5,
        i === 0 ? { maxWidth: colW[i] - 3 } : { align: 'right', maxWidth: colW[i] - 3 });
      cx += colW[i];
    });
    y += 6.5;
  });
  y += 5;

  /* ================================================================
     Results section
     ================================================================ */
  if (y > PH - M - 80) { doc.addPage(); drawHeader(_curPage(), 1); y = M + 22; }
  secHdr('Results');
  kv('Total cable area',   r.totalCableArea.toFixed(0) + ' mm^2');
  kv('Tray usable area',   r.trayArea.toFixed(0) + ' mm^2');
  kv('Fill percentage',    r.fillPct.toFixed(1) + ' %');
  kv('Fill limit',         r.activeLimit + ' %');
  kv('Remaining capacity', r.remaining.toFixed(0) + ' mm^2');
  kv('Additional cables (most common OD)', r.additional + ' x OD ' + r.mostCommonOd.toFixed(1) + ' mm');
  y += 3;

  /* Status box */
  const statusText = r.fillPct > r.activeLimit ? 'EXCEEDED'
    : r.fillPct > r.activeLimit * 0.9 ? 'WARNING' : 'OK';
  const sCol = r.statusClass === 'green' ? [0, 160, 80]
             : r.statusClass === 'yellow' ? [180, 130, 0] : [200, 40, 40];
  const sBg  = r.statusClass === 'green' ? [220, 255, 235]
             : r.statusClass === 'yellow' ? [255, 248, 220] : [255, 225, 220];
  if (y > PH - M - 22) { doc.addPage(); drawHeader(_curPage(), 1); y = M + 22; }
  doc.setFillColor(...sBg);
  doc.setDrawColor(...sCol);
  doc.setLineWidth(0.6);
  doc.roundedRect(M, y, CW, 14, 3, 3, 'FD');
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.setTextColor(...sCol);
  doc.text(statusText, PW / 2, y + 9.5, { align: 'center' });
  y += 20;

  /* Warnings */
  if (r.stackWarn || r.mixed) {
    if (y > PH - M - 20) { doc.addPage(); drawHeader(_curPage(), 1); y = M + 22; }
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 100, 0);
    if (r.stackWarn) {
      doc.text(pdfSafe('Warning: Estimated stack height exceeds tray height — consider wider or taller tray'), M, y, { maxWidth: CW });
      y += 6;
    }
    if (r.mixed) {
      doc.text(pdfSafe('Warning: Mixed cable types (power + other) detected — stricter 40% fill rule applied'), M, y, { maxWidth: CW });
      y += 6;
    }
    y += 2;
  }

  /* ================================================================
     Calculation Procedure section
     ================================================================ */
  if (y > PH - M - 50) { doc.addPage(); drawHeader(_curPage(), 1); y = M + 22; }
  secHdr('Calculation Procedure');

  const steps = _trayBuildSteps(r);
  steps.forEach(block => {
    const lines = block.split('\n');
    const blockH = lines.length * 4.5 + 5;
    if (y + blockH > PH - M - 10) {
      doc.addPage(); drawHeader(_curPage(), 1); y = M + 22;
    }
    lines.forEach((line, li) => {
      if (!line.trim()) return;
      const indented = line.startsWith('   ');
      const isBold   = li === 0;
      doc.setFontSize(8.5);
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      doc.setTextColor(isBold ? ACC[0] : 40, isBold ? ACC[1] : 40, isBold ? ACC[2] : 40);
      doc.text(pdfSafe(line.trimStart()), M + (indented ? 6 : 0), y, { maxWidth: CW - (indented ? 6 : 0) });
      y += 4.5;
    });
    doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.2);
    doc.line(M, y + 1, PW - M, y + 1);
    y += 5;
  });

  /* ================================================================
     Patch all footers with correct total page count
     ================================================================ */
  const realTotal = doc.getNumberOfPages();
  for (let p = 1; p <= realTotal; p++) {
    doc.setPage(p);
    doc.setFillColor(255, 255, 255);
    doc.rect(0, PH - M - 8, PW, 25, 'F');
    drawFooter(p, realTotal);
  }

  doc.save('cable-tray-fill.pdf');
}
