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
  document.querySelectorAll('[data-tt]').forEach(el => {
    const k = el.dataset.tt; if (T[l][k] !== undefined) el.dataset.tip = T[l][k];
  });
  document.querySelectorAll('[data-tkey]').forEach(el => {
    const k = el.dataset.tkey;
    const prefix = el.dataset.tprefix || '';
    const suffix = el.dataset.tsuffix || '';
    if (T[l][k] !== undefined) el.textContent = prefix + T[l][k] + suffix;
  });
  document.getElementById('length').placeholder = T[l].placeLen;
  document.getElementById('voltage').placeholder = T[l].placeV;
  document.getElementById('current').placeholder = T[l].placeA;
  const _rb = document.getElementById('resetDefBtn');
  if (_rb) _rb.title = T[l].resetBtn;
  onHChange(); liveWarn();
  buildRefTable();
  if (typeof scRefreshHints === 'function') scRefreshHints();
  if (typeof trayRenderRows === 'function') trayRenderRows();
  if (typeof iecRefreshUi === 'function') iecRefreshUi();
  localStorage.setItem('language', l);
}

function switchTab(n) {
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === n));
  document.querySelectorAll('.tab-pane').forEach((p, i) => p.classList.toggle('active', i === n));
}

function wsSwitchSub(which) {
  const iecBtn  = document.getElementById('ws-sub-iec');
  const physBtn = document.getElementById('ws-sub-phys');
  const iecPan  = document.getElementById('ws-iec-panel');
  const physPan = document.getElementById('ws-phys-panel');
  if (!iecBtn || !iecPan) return;
  const isIec = which === 'iec';
  iecBtn.classList.toggle('active', isIec);
  physBtn.classList.toggle('active', !isIec);
  iecPan.style.display  = isIec ? '' : 'none';
  physPan.style.display = isIec ? 'none' : '';
}

function toggleLinksPanel() {
  document.getElementById('linksPanel').classList.toggle('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.links-wrap')) {
    document.getElementById('linksPanel')?.classList.remove('open');
  }
});

function showToast(msg, ms = 2000) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._t); t._t = setTimeout(() => t.style.opacity = '0', ms);
}

function toggleTheme() {
  const root = document.documentElement;
  const checkbox = document.getElementById('themeToggle');
  const isChecked = checkbox.checked;
  root.setAttribute('data-theme', isChecked ? 'dark' : 'light');
  localStorage.setItem('theme', isChecked ? 'dark' : 'light');
}

function setColor(c) {
  document.documentElement.setAttribute('data-color', c);
  localStorage.setItem('color', c);
  document.querySelectorAll('.col-dot').forEach(d => d.classList.toggle('active', d.dataset.color === c));
}

function resetToDefaults() {
  const tabIdx = [...document.querySelectorAll('.tab-pane')]
    .findIndex(p => p.classList.contains('active'));

  function clickBtn(selector) {
    const b = document.querySelector(selector);
    if (b) b.click();
  }

  switch (tabIdx) {
    case 0: {
      // Physical / analytical sub-tab
      clickBtn('[onclick*="setSystem"][onclick*="\'dc\'"]');
      document.getElementById('current').value = 16;
      document.getElementById('ambient').value = 30;
      document.getElementById('tempPreset').value = '70';
      document.getElementById('tempCustom').value = 70;
      document.getElementById('vdropPct').value = 3;
      document.getElementById('length').value = 10;
      document.getElementById('lenUnit').value = 'm';
      document.getElementById('distType').value = 'oneway';
      document.getElementById('hMethod').value = 'conduit';
      document.getElementById('hCondCount').value = 'c4_6';
      document.getElementById('hCustomVal').value = 7;
      onTempPresetChange();
      onHChange();
      liveWarn();
      // IEC sub-tab defaults
      clickBtn('#iec-sys-1ph');
      clickBtn('#iec-mat-cu');
      clickBtn('#iec-pe-simp');
      document.getElementById('iec-insulation').value = 'pvc70';
      document.getElementById('iec-voltage').value = 230;
      document.getElementById('iec-current').value = 32;
      document.getElementById('iec-length').value = 2;
      document.getElementById('iec-cosphi').value = 1;
      document.getElementById('iec-max-vd').value = 3;
      document.getElementById('iec-method').value = 'B1';
      document.getElementById('iec-conductors').value = '2';
      document.getElementById('iec-tamb').value = '30';
      document.getElementById('iec-grouping').value = '1';
      document.getElementById('iec-ik').value = 1.5;
      document.getElementById('iec-tdis').value = 0.4;
      document.getElementById('iec-method').dispatchEvent(new Event('change'));
      document.getElementById('iec-insulation').dispatchEvent(new Event('change'));
      const _iecRes = document.getElementById('iec-results');
      const _iecSteps = document.getElementById('iec-steps-card');
      if (_iecRes) _iecRes.style.display = 'none';
      if (_iecSteps) _iecSteps.style.display = 'none';
      break;
    }

    case 1:
      if (convDir !== 'mm2ToAwg') swapConv();
      document.getElementById('cMm2').value = 2.5;
      break;

    case 2:
      document.getElementById('sb-enc-h').value = 1400;
      document.getElementById('sb-enc-w').value = 800;
      document.getElementById('sb-enc-d').value = 500;
      document.getElementById('sb-mounting').value = 'free';
      sbUpdateAe();
      clickBtn('[onclick*="sbSetHeatModeUI"][onclick*="\'calc\'"]');
      document.getElementById('sb-k-preset').value = '';
      document.getElementById('sb-k-val').value = 5.5;
      document.getElementById('sb-ta').value = 35;
      document.getElementById('sb-airflow').value = 0;
      document.getElementById('sb-open-area').value = 0;
      document.getElementById('sb-manual-dissipation').value = 10;
      break;

    case 3:
      if (document.getElementById('sc-dc-panel').style.display === 'none') {
        clickBtn('[onclick*="scSetVoltPreset"][onclick*="\'ac3\'"]');
        clickBtn('[onclick*="scSetMaterial"][onclick*="\'cu\'"]');
        document.getElementById('sc-temp-sel').value = '70';
        scSetTemp('70');
        clickBtn('[onclick*="scSetNetwork"][onclick*="\'tns\'"]');
        clickBtn('[onclick*="scSetSourceMode"][onclick*="\'known\'"]');
        document.getElementById('sc-ik-busbar').value = 10;
        document.getElementById('sc-tr-sn').value = 630;
        document.getElementById('sc-tr-uk').value = 4;
        document.getElementById('sc-tr-un').value = 400;
        document.getElementById('sc-xr').value = 1.0;
        document.getElementById('sc-s-phase').value = 2.5;
        document.getElementById('sc-s-pe').value = 2.5;
        document.getElementById('sc-len').value = 20;
        document.getElementById('sc-xpm').value = 0.08;
        document.getElementById('sc-dev-type').value = 'mcb';
        document.getElementById('sc-dev-in').value = 16;
        document.getElementById('sc-dev-curve').value = 'C';
        document.getElementById('sc-icu').value = 6;
        if (typeof scOnDevTypeChange === 'function') scOnDevTypeChange();
        if (typeof scUpdateZsDisplay === 'function') scUpdateZsDisplay();
      } else {
        clickBtn('[onclick*="dcSetMaterial"][onclick*="\'cu\'"]');
        document.getElementById('dc-udc').value = 48;
        document.getElementById('dc-src-type').value = 'known_ik';
        if (typeof dcOnSrcTypeChange === 'function') dcOnSrcTypeChange();
        document.getElementById('dc-ik-src').value = 100;
        document.getElementById('dc-temp-sel').value = '70';
        if (typeof dcSetTemp === 'function') dcSetTemp('70');
        document.getElementById('dc-s-phase').value = 2.5;
        document.getElementById('dc-s-pe').value = 2.5;
        document.getElementById('dc-len').value = 10;
        document.getElementById('dc-lpm').value = 1.5;
        document.getElementById('dc-dev-type').value = 'mcb';
        document.getElementById('dc-dev-in').value = 16;
        document.getElementById('dc-dev-curve').value = 'C';
        document.getElementById('dc-icu').value = 6;
        if (typeof dcUpdateRsrcDisplay === 'function') dcUpdateRsrcDisplay();
      }
      break;

    case 4:
      mscSetMode('vd');
      document.getElementById('msc-method').value = 'dol';
      mscOnMethodChange();
      document.getElementById('msc-max-vd-run').value   = 5;
      document.getElementById('msc-max-vd-start').value = 10;
      document.getElementById('msc-cable-type').value   = 'multi';
      document.getElementById('msc-inst-method').value  = 'duct';
      document.getElementById('msc-phases').value       = 'ac3';
      document.getElementById('msc-pn').value = 7.5;
      document.getElementById('msc-un').value = 400;
      document.getElementById('msc-cosn').value = 0.85;
      document.getElementById('msc-eta').value = 0.92;
      document.getElementById('msc-cosstart').value = 0.35;
      document.getElementById('msc-s').value = 2.5;
      document.getElementById('msc-len').value = 20;
      document.getElementById('msc-ik').value = 10;
      clickBtn('[onclick*="mscSetMaterial"][onclick*="\'cu\'"]');
      window._mscSizLast = null;
      break;

    case 5:
      clickBtn('[onclick*="traySetGeomMode"][onclick*="\'rect\'"]');
      clickBtn('[onclick*="traySetTrayType"][onclick*="\'ladder\'"]');
      clickBtn('[onclick*="traySetStandard"][onclick*="\'iec\'"]');
      document.getElementById('tray-width').value = 300;
      document.getElementById('tray-height').value = 60;
      document.getElementById('tray-diameter').value = 50;
      document.getElementById('tray-oval-w').value = 50;
      document.getElementById('tray-oval-h').value = 30;
      break;
  }

  showToast(T[lang].resetDone);
}

// Init
document.getElementById('voltage').value = 24;
buildRefTable();
initSwitchboard();
initShortCircuit();
initDcCalculator();
initMotorCalc();
initTray();
document.getElementById('sb-mode-mm2').classList.add('active');
// Restore saved theme — user preference wins, otherwise follow OS
const _storedTheme = localStorage.getItem('theme');
const _osDark = window.matchMedia('(prefers-color-scheme: dark)');
const _savedTheme = _storedTheme || (_osDark.matches ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', _savedTheme);
document.getElementById('themeToggle').checked = _savedTheme === 'dark';
// Keep in sync with OS changes as long as the user hasn't set a manual preference
_osDark.addEventListener('change', e => {
  if (!localStorage.getItem('theme')) {
    const t = e.matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    document.getElementById('themeToggle').checked = e.matches;
  }
});
// Restore saved color
const _savedColor = localStorage.getItem('color') || 'teal';
setColor(_savedColor);
// Restore saved language, fall back to browser locale, then 'eng'
const _storedLang = localStorage.getItem('language');
const _validLangs = ['cze', 'eng'];
const _browserLang = navigator.language && navigator.language.startsWith('cs') ? 'cze' : 'eng';
const _savedLang = (_storedLang && _validLangs.includes(_storedLang)) ? _storedLang : _browserLang;
// Apply language (updates all data-t elements and persists the choice)
setLang(_savedLang);
