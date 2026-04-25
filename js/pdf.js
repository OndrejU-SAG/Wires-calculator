/* =====================================================================
   SHARED PDF UTILITIES  —  pdf.js
   Provides: pdfSafe, pdfMakeHeader, pdfMakeFooter, shared asset state
   Used by: switchboard.js, sc.js, tray.js
   ===================================================================== */

const _PDF_ENGINEER_KEY = 'pdfEngineer';

let _pdfLogoB64 = null;
let _pdfLogoNW  = 0;
let _pdfLogoNH  = 0;
let _pdfCompany = null;

/* ─── Character sanitization ───────────────────────────────────────────────
   Transliterates Czech/Slovak chars (not in ISO Latin-1) and converts
   math/technical symbols to ASCII equivalents for jsPDF standard fonts.   */
function pdfSafe(s) {
  if (s === null || s === undefined) return '';
  const MAP = {
    // Czech / Slovak — chars outside ISO Latin-1 (> U+00FF)
    'č': 'c',  'Č': 'C',   // č Č
    'š': 's',  'Š': 'S',   // š Š
    'ž': 'z',  'Ž': 'Z',   // ž Ž
    'ř': 'r',  'Ř': 'R',   // ř Ř
    'ě': 'e',  'Ě': 'E',   // ě Ě
    'ň': 'n',  'Ň': 'N',   // ň Ň
    'ď': 'd',  'Ď': 'D',   // ď Ď
    'ť': 't',  'Ť': 'T',   // ť Ť
    'ů': 'u',  'Ů': 'U',   // ů Ů
    // Greek / math / technical symbols
    'ρ': 'rho',  'Ω': 'Ohm',  // ρ Ω
    '²': '^2',   '×': 'x',    // ² ×
    '·': '*',    'Δ': 'dT',   // · Δ
    '≤': '<=',   '≥': '>=',   // ≤ ≥
    'π': 'pi',   '∅': 'OD',   // π ∅
    '√': 'sqrt',                   // √
  };
  return String(s).replace(/[\s\S]/g, c => {
    if (MAP[c] !== undefined) return MAP[c];
    if (c.charCodeAt(0) > 0xFF) return '?';
    return c;
  });
}

/* ─── Shared header ────────────────────────────────────────────────────────
   Draws company logo + address block + document title + divider line.
   Call once per page at the start (before adding page content).           */
function pdfMakeHeader(doc, { PW, M, title }) {
  const rY = M + 14;

  if (_pdfLogoB64) {
    try {
      const logoH = 10;
      const logoW = _pdfLogoNW && _pdfLogoNH ? (_pdfLogoNW / _pdfLogoNH) * logoH : 25;
      doc.addImage(_pdfLogoB64, 'PNG', M, M, logoW, logoH);
    } catch (e) {}
  }

  const co = _pdfCompany || {};
  const addrLines = [
    co.name,
    co.street,
    [co.zip, co.city].filter(Boolean).join(' '),
    co.country,
  ].filter(Boolean);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  addrLines.forEach((line, i) =>
    doc.text(pdfSafe(line), PW - M, M + i * 3.8, { align: 'right' })
  );

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(M, rY, PW - M, rY);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text(pdfSafe(title), M, rY - 2);
}

/* ─── Shared footer ────────────────────────────────────────────────────────
   Draws divider + date | engineer | page N of M | standard reference.     */
function pdfMakeFooter(doc, { PW, PH, M, pageNum, totalPages, engineer, standard }) {
  const today = new Date();
  const ds = [today.getDate(), today.getMonth() + 1, today.getFullYear()]
    .map((v, i) => (i < 2 ? String(v).padStart(2, '0') : String(v)))
    .join('.');

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(M, PH - M - 6, PW - M, PH - M - 6);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);

  const left = ds + (engineer ? '  |  ' + pdfSafe(engineer) : '');
  doc.text(left, M, PH - M - 2);
  doc.text('Page ' + pageNum + ' of ' + totalPages, PW / 2, PH - M - 2, { align: 'center' });
  if (standard) doc.text(pdfSafe(standard), PW - M, PH - M - 2, { align: 'right' });
}

/* ─── Engineer name persistence ─────────────────────────────────────────── */
function _pdfEngineerInit() {
  const saved = localStorage.getItem(_PDF_ENGINEER_KEY) || '';
  const ids = ['sb-engineer', 'sc-engineer', 'dc-engineer', 'tray-engineer'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!el.value) el.value = saved;
    el.addEventListener('input', () => {
      localStorage.setItem(_PDF_ENGINEER_KEY, el.value);
      ids.filter(oid => oid !== id).forEach(oid => {
        const oel = document.getElementById(oid);
        if (oel) oel.value = el.value;
      });
    });
  });
}

/* ─── Asset loading ─────────────────────────────────────────────────────── */
function pdfInit() {
  fetch('assets/company.json')
    .then(r => r.json())
    .then(d => { _pdfCompany = d; })
    .catch(() => {});

  fetch('assets/Logo.png')
    .then(r => r.blob())
    .then(blob => new Promise(resolve => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        _pdfLogoNW = img.naturalWidth;
        _pdfLogoNH = img.naturalHeight;
        URL.revokeObjectURL(url);
        const fr = new FileReader();
        fr.onload = () => { _pdfLogoB64 = fr.result; resolve(); };
        fr.readAsDataURL(blob);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      img.src = url;
    }))
    .catch(() => {});

  _pdfEngineerInit();
}

pdfInit();
