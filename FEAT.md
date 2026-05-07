# Feature Backlog — Electrical Calculator

Features identified during the May 2026 audit. Prioritised by user impact.

---

## FEAT-1 · Embed full IEC 60364-5-52 Al ampacity tables (B.52.4 / B.52.5 / B.52.10 / B.52.11)

**Problem:** `iec-calculator.js` derives Al ampacity as Cu × 0.78. The actual IEC-published tables deviate from this ratio at specific sizes and methods.

**Implementation:** Add `IEC_AMP_AL` object alongside the existing `IEC_AMP_CU` in `iec-calculator.js`, mirroring the structure exactly. Remove the `IEC_AL_FACTOR` multiplier path for those methods that have direct Al tables. Keep 0.78 only as a fallback for exotic insulation types.

---

## FEAT-3 · Motor cable insulation selector for Ca correction (Tab 4 — Motor Starting)

**Problem:** The motor starting calculator always uses PVC 70 °C Ca values (IEC Table B.52.14). For XLPE-insulated motor cables (common in industrial settings), Ca at high ambient temperatures is more favourable (0.87 vs 0.79 at 45 °C), leading to over-conservative sizing.

**Implementation:** Add insulation selector (PVC / XLPE) to motor starting inputs. Wire to `getCa(ambTemp, insType)` which already supports both (`'pvc'` and `'xlpe'`).
