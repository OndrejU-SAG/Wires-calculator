function setLang(l) {
  lang = l;
  document.documentElement.lang = l === 'cze' ? 'cs' : l === 'deu' ? 'de' : 'en';
  document.getElementById('langDropdown').value = l;
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
  localStorage.setItem('language', l);
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

function toggleTheme() {
  const root = document.documentElement;
  const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  root.setAttribute('data-theme', next);
  document.getElementById('btnTheme').textContent = next === 'light' ? '🌙' : '☀';
  localStorage.setItem('theme', next);
}

// Init
document.getElementById('voltage').value = 24;
buildRefTable();
initSwitchboard();
initShortCircuit();
initDcCalculator();
initMotorCalc();
document.getElementById('sb-mode-mm2').classList.add('active');
// Restore saved theme
const _savedTheme = localStorage.getItem('theme') || 'dark';
if (_savedTheme === 'light') document.documentElement.setAttribute('data-theme', 'light');
document.getElementById('btnTheme').textContent = _savedTheme === 'light' ? '🌙' : '☀';
// Restore saved language or use default
const _savedLang = localStorage.getItem('language') || 'eng';
// Apply default language (updates all data-t elements)
setLang(_savedLang);
