# Feature Backlog — Electrical Calculator

Features identified during the May 2026 audit. Prioritised by user impact.

---

## FEAT-1 · Insulation-type selector in Analytical Wire Sizing (Tab 0 — Analytical)

**Problem:** The analytical calculator (`calculator.js`) has no insulation selector. The adiabatic PE check now uses the Tmax-derived k (PVC or XLPE), but the user has no way to select LSZH, rubber, or silicone insulations. A dedicated selector would:
- Auto-fill a sensible `Tmax` when insulation type changes (70 °C for PVC, 90 °C for XLPE, etc.)
- Use the precise k from IEC 60364-5-54 Table 54.3 for every insulation type

**Implementation:** Add a `<select id="ws-insulation">` with options mirroring `IEC_INSUL` in `iec-calculator.js`. On change, update `Tmax` preset and derive k.

---

## FEAT-2 · Embed full IEC 60364-5-52 Al ampacity tables (B.52.4 / B.52.5 / B.52.10 / B.52.11)

**Problem:** `iec-calculator.js` derives Al ampacity as Cu × 0.78. The actual IEC-published tables deviate from this ratio at specific sizes and methods.

**Implementation:** Add `IEC_AMP_AL` object alongside the existing `IEC_AMP_CU` in `iec-calculator.js`, mirroring the structure exactly. Remove the `IEC_AL_FACTOR` multiplier path for those methods that have direct Al tables. Keep 0.78 only as a fallback for exotic insulation types.

---

## FEAT-3 · Show both simplified (Table 54.2) and adiabatic PE sizing side-by-side in IEC tab

**Problem:** IEC 60364-5-54 §543.1 permits two methods. Currently only the simplified method (Table 54.2) is shown; the adiabatic method often yields a smaller PE conductor, saving material cost.

**Implementation:** Always calculate both methods. Display both results with a clear label; highlight the adiabatic result if it is smaller than the simplified result. Requires linking fault current data (from Tab 3 or a manual input) to the IEC tab.

---

## FEAT-4 · IEC clause references in PDF reports

**Problem:** PDF reports are detailed but do not cite specific IEC clause numbers next to each calculation step. Electrical inspection bodies often require normative references.

**Implementation:** In each module's PDF generation code (`sbBuildPdf`, `scBuildPdf`, `motorBuildPdf`, `iecDownloadPdf`), append the relevant IEC clause number in brackets after each formula line, e.g.:
- `ΔT = (Pt / (k × Ae))^(1/1.245)  [IEC 60890 §5]`
- `I"k3 = c × U0 / (√3 × Z1)  [IEC 60909-0 §4.2]`

---

## FEAT-5 · Explicit Ik2 / Ik3 N/A suppression for single-phase mode (Tab 3 — Short Circuit)

**Problem:** When `ac1` (single-phase) is selected, `Ik2` and `Ik3` are calculated with a phantom `U_LL = 230 × √3` voltage. The calculation path correctly uses only `Ik1_max` for equipment rating, but `Ik2`/`Ik3` values may appear in result cards and could confuse users.

**Implementation:** In the result rendering section of `sc.js`, check `isSinglePhase` and either hide the Ik2/Ik3 result rows or replace their values with `"N/A — single-phase supply"`.

---

## FEAT-6 · Soil resistivity input for Motor Starting calculator (Tab 4) — ALREADY IMPLEMENTED

**(Completed in May 2026 audit as BUG-4 fix.)** Soil resistivity dropdown `msc-soil-rho` is now wired to `getCrho()` per IEC 60364-5-52 Table B.52.20.

---

## FEAT-7 · Motor cable insulation selector for Ca correction (Tab 4 — Motor Starting)

**Problem:** The motor starting calculator always uses PVC 70 °C Ca values (IEC Table B.52.14). For XLPE-insulated motor cables (common in industrial settings), Ca at high ambient temperatures is more favourable (0.87 vs 0.79 at 45 °C), leading to over-conservative sizing.

**Implementation:** Add insulation selector (PVC / XLPE) to motor starting inputs. Wire to `getCa(ambTemp, insType)` which already supports both (`'pvc'` and `'xlpe'`).

---

## FEAT-8 · Switchboard: show natX vs. ΔT comparison table for both models

**Problem:** Now that both IEC natX and chimney models are available, showing a side-by-side ΔT comparison for the selected ventilation opening sizes would help engineers understand the difference and justify their choice in reports.

**Implementation:** After calculation, append a small comparison card showing `ΔT (IEC natX)` and `ΔT (chimney model)` when natural ventilation is enabled.
