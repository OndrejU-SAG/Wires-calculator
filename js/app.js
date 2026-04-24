function setLang(l) {
  lang = l;
  document.documentElement.lang = l === 'cze' ? 'cs' : 'en';
  document.getElementById('btnCze').classList.toggle('active', l === 'cze');
  document.getElementById('btnEng').classList.toggle('active', l === 'eng');
  document.querySelectorAll('[data-t]').forEach(el => {
    const k = el.dataset.t; if (T[l][k] !== undefined) el.textContent = T[l][k];
  });
  document.querySelectorAll('[data-tp]').forEach(el => {
    const k = el.dataset.tp; if (T[l][k] !== undefined) el.placeholder = T[l][k];
  });
  document.getElementById('length').placeholder = T[l].placeLen;
  document.getElementById('voltage').placeholder = T[l].placeV;
  document.getElementById('current').placeholder = T[l].placeA;
  onHChange(); liveWarn();
  buildRefTable();
  if (typeof scRefreshHints === 'function') scRefreshHints();
}

function switchTab(n) {
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === n));
  document.querySelectorAll('.tab-pane').forEach((p, i) => p.classList.toggle('active', i === n));
}

function showToast(msg, ms = 2000) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._t); t._t = setTimeout(() => t.style.opacity = '0', ms);
}

// Init
document.getElementById('voltage').value = 24;
buildRefTable();
initSwitchboard();
initShortCircuit();
initDcCalculator();
// Set default conductor mode button state
document.getElementById('sb-mode-mm2').classList.add('active');
