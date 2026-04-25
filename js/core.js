// Physical constants
const RHO20 = 1.724e-8;
const ALPHA = 0.00393;

// Heat dissipation presets (W/m²K)
const H_PRESETS = { free: { h: 14 }, grouped: { h: 10 }, conduit: { h: 7 }, custom: { h: null } };

// Conductor count derating factors
const CONDUCTOR_DERATING = [
  { key: 'c1_3',  factor: 1.00 },
  { key: 'c4_6',  factor: 0.80 },
  { key: 'c7_9',  factor: 0.70 },
  { key: 'c10_20', factor: 0.50 },
  { key: 'c21_30', factor: 0.45 },
  { key: 'c31_40', factor: 0.40 },
  { key: 'c41p',  factor: 0.35 },
];

// Standard wire sizes
const MM2_STD = [0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630];
const AWG_STD = [-3, -2, -1, 0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40];
const AWG_REF = [24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 3, 2, 1, 0, -1, -2, -3];

const FUSE_STD = [1, 2, 3, 4, 5, 6, 8, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400];
const SYS_V = { dc: 24, ac1: 230, ac3: 400 };

// Conversion
const awgToMm2 = n => { const d = 0.127 * Math.pow(92, (36 - n) / 39); return Math.PI / 4 * d * d; };
const mm2ToAwg = a => { const d = Math.sqrt(4 * a / Math.PI); return -39 * Math.log(d / 0.127) / Math.log(92) + 36; };
const fmtAwg = n => ({ '-3': '4/0', '-2': '3/0', '-1': '2/0', '0': '1/0' }[String(n)] ?? 'AWG ' + n);
const fmtMm2 = v => v < 10 ? v.toFixed(3) : v < 100 ? v.toFixed(1) : v.toFixed(0);
const fmtW = w => w < 1 ? w.toFixed(3) + ' W' : w < 100 ? w.toFixed(2) + ' W' : w.toFixed(1) + ' W';

// Standard size lookup
const stdMm2Up = e => MM2_STD.find(s => s >= e) ?? MM2_STD.at(-1);
const closeMm2 = e => MM2_STD.reduce((a, b) => Math.abs(a - e) < Math.abs(b - e) ? a : b);
const closeAwg = e => { let b = AWG_STD[0], m = Infinity; for (const a of AWG_STD) { const d = Math.abs(awgToMm2(a) - e); if (d < m) { m = d; b = a; } } return b; };
function stdAwgUp(e) { let r = AWG_STD[0]; for (const a of AWG_STD) { if (awgToMm2(a) >= e) r = a; else break; } return r; }

function getDerating(condKey) {
  return CONDUCTOR_DERATING.find(d => d.key === condKey)?.factor ?? 1.0;
}

function calcPeMm2(s) {
  if (s <= 16) return s;
  if (s <= 35) return 16;
  if (s <= 400) return s / 2;
  if (s <= 800) return 200;
  return s / 4;
}

function suggestFuse(Im) {
  let f = FUSE_STD[0];
  for (const s of FUSE_STD) { if (s <= Im) f = s; else break; }
  return f;
}

// Skin effect y_s (IEC 60287): xs² = 8πf·ks / (10⁷·R_DC), ks = 1 for Cu stranded
// R_DC_per_m in Ω/m; returns y_s where R_AC = R_DC · (1 + y_s)
function skinEffectYs(fHz, R_DC_per_m) {
  if (fHz <= 0 || R_DC_per_m <= 0) return 0;
  const xs2 = (8 * Math.PI * fHz * 1e-7) / R_DC_per_m;
  const xs4 = xs2 * xs2;
  return xs4 / (192 + 0.8 * xs4);
}

function fullCalc({ V, I, Tamb, Tmax, pct, Lone, sys, h, freq = 50 }) {
  const rho = RHO20 * (1 + ALPHA * (Tmax - 20)), Vd = V * pct / 100;
  const fEff = sys === 'dc' ? 0 : freq;

  // Initial DC-based VD area; use to estimate skin effect for sizing
  const vdEx_dc = sys === 'ac3' ? (Math.sqrt(3) * I * rho * Lone) / Vd : (I * rho * 2 * Lone) / Vd;
  const ys0 = skinEffectYs(fEff, rho / vdEx_dc);

  // Scale VD area by (1 + ys): R_AC = R_DC·(1+ys) means same VD requires larger A
  const vdEx = vdEx_dc * (1 + ys0);

  // Ampacity: thermal balance uses R_AC heat generation → substitute rho·(1+ys) for rho
  const dT = Tmax - Tamb; if (dT <= 0) throw 'temp';
  const K = Math.sqrt(h * 2 * Math.sqrt(Math.PI) * dT / (rho * (1 + ys0)));
  const ampEx = Math.pow(I / K, 4 / 3);

  const vdMm2 = vdEx * 1e6, ampMm2 = ampEx * 1e6;
  if (!isFinite(vdMm2) || vdMm2 <= 0) throw 'vd';
  if (!isFinite(ampMm2) || ampMm2 <= 0) throw 'amp';
  const vdStd = stdMm2Up(vdMm2), ampStd = stdMm2Up(ampMm2);
  const recStd = Math.max(vdStd, ampStd), recAwg = stdAwgUp(Math.max(vdMm2, ampMm2));
  const A_rec = recStd / 1e6;

  // R_DC and R_AC for the recommended standard size
  const rDC = rho / A_rec;
  const ys  = skinEffectYs(fEff, rDC);
  const rAC = rDC * (1 + ys);

  const vdActV = sys === 'ac3' ? (Math.sqrt(3) * I * rAC * Lone) : (I * rAC * 2 * Lone);
  const pLoss = I * I * rAC * (sys === 'ac3' ? 3 : 2) * Lone;
  const wireAmp = Math.sqrt(h * 2 * Math.sqrt(Math.PI) * dT / (rho * (1 + ys))) * Math.pow(A_rec, 0.75);
  return {
    vdMm2, ampMm2, vdStd, ampStd, recStd, recAwg,
    vdAwg: stdAwgUp(vdMm2), ampAwg: stdAwgUp(ampMm2),
    vdActV, vdActP: vdActV / V * 100, pLoss, wireAmp,
    fuse: suggestFuse(wireAmp), ampLimits: ampStd >= vdStd, rho, Vd,
    rDC, rAC, ys
  };
}
