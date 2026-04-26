# Wire Size Calculator

**A comprehensive web-based electrical engineering tool** for wire sizing, cable tray fill analysis, switchboard temperature rise calculation, short-circuit current computation, motor starting analysis, and MM²↔AWG conversion. Built with pure JavaScript, CSS, and HTML5 — no server required.

---

## 📊 Features Overview

The calculator provides **six integrated modules**, each addressing a critical aspect of electrical system design:

### 🔢 1. **Wire Size Calculator** (`calculator.js`, `core.js`)
**IEC 60228 / IEC 60364-5-52 Compliant**

Determines minimum required conductor cross-section based on two limiting factors, evaluated in parallel:
- **Voltage drop constraint** — Ensures conductor resistance doesn't cause excessive voltage loss
- **Ampacity (thermal) constraint** — Ensures conductor can carry current without exceeding temperature rating

**Key Features:**
- Supports **DC, Single-phase AC, Three-phase AC** systems
- Frequency selection (50/60 Hz) with automatic skin effect calculation
- Temperature-corrected resistivity per IEC 60228 Annex B: `ρ(T) = ρ₂₀ × (1 + α × (T - 20))`
- Heat dissipation presets: Free air (14 W/m²·K), Grouped (10 W/m²·K), In conduit (7 W/m²·K), Custom
- Conductor derating for 1-41+ conductors per IEC 60364-5-52
- Skin effect correction using IEC 60287 methodology
- Protective earth (PE/PEN) conductor sizing per IEC 60364-5-54 Table 54.2
- Adiabatic short-circuit withstand verification (IEC 60364-5-54 §543.1.2)
- Standard fuse recommendation
- **"What-if" analysis** with interactive current slider
- Step-by-step calculation breakdown
- PDF export functionality

**System Presets:**
- DC: 24V
- AC Single-phase: 230V
- AC Three-phase: 400V

---

### ⇄ 2. **MM² ↔ AWG Converter** (`converter.js`)
**Bidirectional conversion** between metric (mm²) and American Wire Gauge (AWG) systems.

**Conversion Modes:**
- **Exact** — Mathematical conversion using official AWG formula
- **Closest** — Nearest standard size to the converted value
- **Round up** — Next larger standard size (safety margin)

**Formulas:**
```
AWG to mm²:  A = π/4 × [0.127 × 92^((36-n)/39)]²
mm² to AWG:  G = 36 - 39 × log(d/0.127)/log(92), where d = √(4A/π)
```

**Reference Tables:**
- IEC mm² standards: 0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630
- AWG: 4/0, 3/0, 2/0, 1/0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40

---

### 🌡️ 3. **Switchboard Temperature Rise** (`switchboard.js`)
**IEC 61439 / IEC 60890 Compliant**

Calculates temperature rise in electrical switchgear and controlgear assemblies with comprehensive modeling.

**Features:**
- **Device Power Loss Database**: MCB (2-4W/pole × 3 poles), MCCB (5-15W), Contactors (3-10W), Relays (2W), Terminals (0.3W ea.)
- **Conductor loss calculation**: P = I² × ρ(T) / A × L × n
- **Cooling surface calculation** per IEC 60890 §4:
  - Wall-mounted: `A_e = 0.7 × (2hd + hb + bd)`
  - Free-standing: `A_e = 0.7 × (2hd + 2hb + bd)`
- **Ventilation modeling**:
  - Natural convection (painted steel: 5.5 W/m²·K per IEC 61439 §10.10)
  - Forced ventilation with fan airflow presets
  - Chimney effect airflow per IEC 60890 §7.2
- **Rittal TS8 enclosure sizes** — Pre-configured dropdown
- **Temperature measurement points** per IEC 61439-1 §10.10 Table 6:
  - External manual operators: ΔT max 15K
  - Internal manual operators: ΔT max 25K
  - Enclosure walls/components: ΔT max 30K
  - Terminals: ΔT max 70K
- **Pre-configured fan presets**: 50-600 m³/h
- Step-by-step calculation display
- PDF export with photos support

**Temperature Rise Formula:**
```
ΔT = P_total / (h × A_e)
```
Where: P_total = conductor losses + device losses, h = heat dissipation coefficient, A_e = effective cooling surface

---

### ⚡ 4. **Short Circuit Current Calculator** (`sc.js`)
**IEC 60909 / IEC 60364-4-43 Compliant**

Comprehensive short-circuit current calculation with protection device verification.

**Two Source Modes:**

#### A. **Known Short-Circuit Level**
- Input: Short-circuit current at busbar (Ik_busbar)
- Source impedance: `Z_source = U₀ / (√3 × I_k_busbar)`

#### B. **Transformer-Based Calculation**
- Input: Transformer Sn (kVA), Uk (%), Un (V)
- Transformer impedance: `Z_tr = (U_k / 100) × (U_n² / S_n)`
- Short-circuit current: `I_k = (S_n / (√3 × U_n)) × (100 / U_k)`

**Comprehensive Analysis:**
- **Symmetrical short-circuit currents**: Ik3 (3-phase), Ik2 (2-phase), Ik1 (1-phase/earth fault)
- **Asymmetrical peak current**: `I_peak = κ × √2 × I_k"` (κ = 1.7-1.95 depending on X/R ratio)
- **Cable impedance contribution**: R_cable = ρ × L / S × (1 + y_s), X_cable = x' × L
- **X/R ratio analysis** with typical values (0.5-2 for LV transformers)
- **Protection device verification**:
  - Circuit breakers: B, C, D, K, Z curves per IEC 60898 / IEC 60947-2
  - Fuses: gG type per IEC 60269-2
  - Tripping current multipliers with min/max ranges
- **Selectivity analysis** between upstream and downstream devices
- **DC short-circuit calculation** with battery modeling
- **Cable thermal withstand** verification using k factor from IEC 60364-4-43 Table 43A

**Network Types:**
- TN-S: Separate PE and N conductors
- TN-C: Combined PEN conductor
- TT: Independent consumer earth

**Device Trip Curves (IEC 60898 / IEC 60947-2):**
- B curve: 3-5 × In (generators, long cable runs)
- C curve: 5-10 × In (general circuit protection)
- D curve: 10-20 × In (transformers, motors with high starting currents)
- K curve: 8-14 × In (motors, transformers)
- Z curve: 2-3 × In (semiconductor protection)
- Fuse gG: I² ≈ 1.6 × In

**Battery Modeling (DC):**
- Lead-Acid (VRLA/AGM/Gel)
- LiFePO4
- NiCd
- Custom with SOC-dependent internal resistance
- SMPS (current-limited) modeling

---

### 🔄 5. **Motor Starting Calculator** (`motor.js`)
**IEC 60364-5-52 / IEC 60034 Compliant**

Two calculation modes addressing motor starting scenarios.

#### Mode A: **Voltage Dip Only**
Analyzes voltage dip during motor starting with existing cable size.

#### Mode B: **Full Cable Sizing**
Complete cable sizing considering:
- Ampacity with derating factors
- Running voltage drop
- Starting voltage drop

**Supported Starting Methods:**
- **DOL (Direct On Line)**: k_start = 5-8×
- **Y/Δ (Star-Delta)**: k_start = 1.8-2.5×
- **Soft starter**: k_start = 2-3.5×
- **VFD (Variable Frequency Drive)**: k_start = 1.0-1.5×

**Key Features:**
- Iterative sizing through all IEC standard sizes (1.5-630 mm²)
- IEC 60364-5-52 Annex B correction factors:
  - Ca: Ambient temperature factor (Table B.52.14)
  - Cg: Grouping factor (Table B.52.17)
  - Crho: Soil thermal resistivity factor (Table B.52.20)
  - Ku: Utilization factor
- Thermal withstand verification
- Voltage dip assessment with criteria:
  - < 5%: Well within limits — minimal equipment impact
  - 5-10%: Acceptable — may cause lighting flicker
  - 10-15%: Marginal — may cause nuisance tripping
  - > 15%: Exceeds limits — likely operational issues
- Skin effect correction for AC systems
- Separate resistivity for cold (starting) and operating temperature
- Step-by-step calculation with intermediate results
- PDF export

**Formulas:**
```
Rated current:    I_n = (P_n × 1000) / (√3 × U_n × cosφ_n × η)
Starting current: I_start = k_start × I_n

Voltage dip: ΔU = √3 × I_start × (R_total × cosφ_start + X_total × sinφ_start)
               ΔU% = (ΔU / U_n) × 100
```

**Ampacity Tables (IEC 60364-5-52:2009):**
- Copper conductors at 70°C, PVC insulated
- 3 loaded conductors, 30°C ambient
- Free air, in duct, buried installations

---

### 📦 6. **Cable Tray / Conduit Fill Calculator** (`tray.js`)
**IEC 60364-5-52 / NEC 392 / NEC 358 Compliant**

Calculates fill percentage for cable trays and conduits with comprehensive standards support.

**Geometry Support:**
- **Trays**: Rectangular (ladder, ventilated, solid)
- **Conduits**: Round, Oval

**Fill Limit Scenarios:**

| Scenario | IEC Limit | NEC Limit |
|----------|-----------|------------|
| Single cable | 40% | 53% |
| Two cables | 40% | 31% |
| 3+ power cables | 40% | 50% |
| 3+ signal cables | 40% | 50% |
| 3+ mixed cables | 40% | 50% |

**Key Features:**
- Cable definition by **outer diameter (OD)** or **standard cross-section (mm²)**
- Multiple cable rows with individual count and type
- Cable type classification: Power, Control, Fiber, Signal
- **Mixed cable warning** — stricter 40% rule applies per IEC when power and signal cables share tray
- **Electromagnetic interference warning** — IEC 60364-5-52 recommends physical separation
- **Stacking height check** — Verifies cables fit within tray height
- **Remaining capacity calculation** with 20% void reserve
- Custom fill limit support
- Step-by-step calculation display
- PDF export

**Standard Cable Outer Diameters (typical single-core PVC-insulated):**
| mm² | OD (mm) | mm² | OD (mm) |
|-----|--------|-----|--------|
| 1.5 | 6.5 | 16 | 14.0 |
| 2.5 | 7.5 | 25 | 17.0 |
| 4 | 8.5 | 35 | 19.0 |
| 6 | 9.5 | 50 | 22.0 |
| 10 | 12.0 | 70 | 26.0 |
| | | 95 | 30.0 |
| | | 120 | 34.0 |

**Fill Percentage Formula:**
```
Fill (%) = (Total cable cross-sectional area / Tray or conduit area) × 100
```

---

## 📚 Standards Compliance Matrix

| Module | Primary Standards | Additional References |
|--------|------------------|---------------------|
| Wire Size | IEC 60228, IEC 60364-5-52 | IEC 60287 (skin effect) |
| MM²↔AWG | IEC 60228 Annex B | AWG standard |
| Switchboard Temp | IEC 61439, IEC 60890 | - |
| Short Circuit | IEC 60909, IEC 60364-4-43 | IEC 60269-2 (fuses) |
| Motor Starting | IEC 60364-5-52, IEC 60034 | - |
| Tray/Conduit Fill | IEC 60364-5-52 Annex B | NEC 392, NEC 358 |

---

## 🧮 Calculation Methodology

### Material Properties (IEC 60228 Annex B)

| Property | Copper | Aluminum |
|---|---|---|
| ρ₂₀ (Ω·mm²/m) | 0.017241 | 0.028264 |
| α (K⁻¹) | 0.00393 | 0.00403 |
| k_adi (A·s½/mm²) | 115 | 76 |

**Temperature-corrected resistivity:**
```
ρ(T) = ρ₂₀ × (1 + α × (T - 20))
```

**Note:** k_adi = adiabatic short-circuit withstand factor per IEC 60364-5-54.

---

### Wire Size Calculator — Detailed Formulas

#### Voltage Drop Calculation

**For DC and single-phase AC:**
```
A_vd = (I × ρ × 2 × L) / V_drop
```

**For three-phase AC:**
```
A_vd = (√3 × I × ρ × L) / V_drop
```

Where:
- A_vd = required cross-section based on voltage drop (mm²)
- I = current (A)
- ρ = conductor resistivity at operating temperature (Ω·m)
- L = circuit length, one-way (m)
- V_drop = allowed voltage drop (V) = supply voltage × allowed percentage / 100

**Note:** For AC systems, ρ is adjusted for skin effect: ρ_AC = ρ_DC × (1 + y_s)

#### Skin Effect Correction (IEC 60287)

```
x_s² = (8πf × k_s) / (10⁷ × R_DC)
R_AC = R_DC × (1 + y_s)
```

Where:
- y_s = x_s⁴ / (192 + 0.8 × x_s⁴)
- k_s = 1 for stranded copper conductors
- f = frequency (Hz)
- R_DC = DC resistance (Ω/m)

#### Ampacity Calculation

Based on steady-state thermal equilibrium:
```
A_amp = (I / K)^(4/3)
```

Where:
- A_amp = required cross-section based on ampacity (mm²)
- K = thermal coefficient = √(h × 2 × √π × ΔT / ρ)
- h = heat dissipation coefficient (W/m²·K)
- ΔT = temperature difference = T_max - T_ambient (°C)
- ρ = conductor resistivity at operating temperature (Ω·m)

**Final recommendation:** `max(A_vd_standard, A_amp_standard)` — the more conservative (larger) result.

---

### Protective Earth Conductor (IEC 60364-5-54)

**Simplified method (Table 54.2):**
```
S_pe = S_phase              for S_phase ≤ 16 mm²
S_pe = 16 mm²              for 16 < S_phase ≤ 35 mm²
S_pe = S_phase / 2          for S_phase > 35 mm²
```

**Adiabatic short-circuit withstand (IEC 60364-5-54 §543.1.2):**
```
S_min = √(I_fault² × t) / k
```

Where:
- I_fault = fault current (A)
- t = clearing time (s)
- k = adiabatic factor from Table 54.1 (115 for Cu, 76 for Al at 70°C→160°C)

---

### Fuse Recommendation

Selects the largest standard fuse size ≤ calculated wire ampacity from:
1, 2, 3, 4, 5, 6, 8, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400 A

---

### Conductor Derating (IEC 60364-5-52)

Multiple conductors derating factors:
- 1-3 conductors: 100%
- 4-6 conductors: 80%
- 7-9 conductors: 70%
- 10-20 conductors: 50%
- 21-30 conductors: 45%
- 31-40 conductors: 40%
- 41+ conductors: 35%

---

## 🌐 Browser Compatibility

The calculator is a **Progressive Web Application (PWA)** compatible with:
- ✅ Chrome / Edge (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Can be added to home screen for offline use once cached
- ✅ Responsive design for desktop and tablet

---

## 📁 Project Structure

```
Wires-calculator-main/
├── index.html          # Main HTML file with tab interface
├── README.md           # This documentation
├── report.md           # Development report
├── css/
│   └── styles.css      # Complete styling (16KB+)
│
├── js/
│   ├── app.js           # Core app: language, theme, tabs, defaults, init (9.3KB)
│   ├── calculator.js    # Wire size calculator main logic (27.1KB)
│   ├── core.js          # Physical constants, material props, core calculations (5.3KB)
│   ├── converter.js     # MM²↔AWG converter (3.8KB)
│   ├── i18n.js          # Internationalization strings (65.5KB)
│   ├── motor.js         # Motor starting calculator (37.9KB)
│   ├── pdf.js           # PDF export utilities (5.9KB)
│   ├── sc.js            # Short-circuit calculator (115KB)
│   ├── switchboard.js   # Switchboard temperature rise (45.8KB)
│   └── tray.js          # Cable tray fill calculator (32.4KB)
│
└── assets/
    ├── Logo.png         # Company logo for PDF
    └── company.json     # Company info for PDF header
```

---

## 🎨 User Interface Features

### Tab-Based Navigation
- **Tab 0**: Wire Size Calculator
- **Tab 1**: MM²↔AWG Converter
- **Tab 2**: Switchboard Temperature Rise
- **Tab 3**: Short Circuit Current
- **Tab 4**: Motor Starting
- **Tab 5**: Cable Tray / Conduit Fill

### Global Settings
- **Language**: English, Czech, German
- **Theme**: Light / Dark mode (with OS preference detection)
- **Color**: Teal, Red, Purple accent colors
- **Reset to Defaults**: Per-tab default value restoration

### Persistent Preferences
All user preferences are saved to localStorage:
- Language selection
- Theme preference
- Color scheme
- Engineer name (for PDF exports)

---

## 🔧 Configuration Options

### Wire Size Calculator Presets

**System Voltage Presets:**
- DC: 24V
- AC Single-phase: 230V
- AC Three-phase: 400V

**Temperature Presets:**
- 70°C — PVC
- 90°C — XLPE / EPR
- 180°C — Silicone
- 260°C — PTFE (Teflon)
- Custom: User-defined (20-500°C)

**Heat Dissipation Presets:**
- Free air: 14 W/m²·K
- Grouped conductors: 10 W/m²·K
- In conduit: 7 W/m²·K
- Custom: User-defined

### Short-Circuit Calculator Presets

**Voltage Presets:**
- 1-Phase 230V (U₀ = 230V, U_LL = 398V)
- 3-Phase 400V (U₀ = 231V, U_LL = 400V)
- Custom: User-defined line-to-line voltage

**Temperature Presets for Ik Calculation:**
- 20°C — Reference (max Ik, IEC 60909)
- 70°C — Max. operation, PVC
- 90°C — Max. operation, XLPE/EPR
- 160°C — Max. short-circuit, PVC
- 250°C — Max. short-circuit, XLPE/EPR

**Note:** Min. Ik (trip verification): 70°C PVC / 90°C XLPE · Max. Ik (Icu test): 20°C

### Switchboard Calculator Presets

**Heat Dissipation:**
- IEC 61439 default: 5.5 W/m²·K (painted steel, natural convection)
- Rittal TS8 enclosure sizes (15 pre-configured sizes)

**Fan Ventilation Presets:**
- Mini fan ~50 m³/h
- Standard fan 120mm ~150 m³/h
- Standard fan 150mm ~250 m³/h
- 2× fans 200mm ~400 m³/h
- 2× large fans 250mm ~600 m³/h

### Motor Calculator Presets

**Starting Current Multipliers (k_start):**
- DOL: 5-8× (default: 6.0)
- Y/Δ: 1.8-2.5× (default: 2.0)
- Soft starter: 2-3.5× (default: 2.5)
- VFD: 1.0-1.5× (default: 1.2)

**Voltage Drop Limits:**
- Running: Configurable (default: 5%)
- Starting: Configurable (default: 10% for DOL, 15% for others)

---

## 📤 Export Capabilities

All modules support **PDF export** with:
- Professional layout with header and footer
- Step-by-step calculation breakdown
- Input parameters summary
- Results presentation
- Company logo and engineer name (configurable)
- Date stamp and page numbers

**PDF Export Modules:**
- Wire Size: `calcDownloadPdf()` — 2-page PDF with inputs, constraints, results, and step-by-step
- Switchboard: Comprehensive PDF with photos support
- Short Circuit: Detailed calculation PDF
- Motor Starting: Full analysis PDF
- Cable Tray: Fill calculation PDF with geometry details

---

## 🎯 Usage Notes & Best Practices

### General
- All calculations default to **copper conductors**; aluminum is available as an option
- Default values are provided for common **low-voltage systems**
- Skin effect is **automatically calculated** for AC systems using IEC 60287 methodology
- Results are **rounded to appropriate significant figures** for practical application
- **Warning system** alerts users to potential issues (high voltage drop, thermal margins, etc.)

### Wire Size Calculator
- Voltage drop percentages > 5% trigger warnings
- Temperature difference < 10°C between T_max and T_ambient triggers thermal warning
- Custom temperature > 90°C triggers information about PVC suitability
- Custom temperature > 105°C triggers insulation warning

### Short-Circuit Calculator
- For **TT networks**: RCD protection generally required per IEC 60364-4-41 §411.5
- X/R ratio typically 0.5-2 for LV transformers
- Cable reactance: 0.08 mΩ/m (single-core), 0.07 mΩ/m (multi-core)
- **DC calculations**: Verify SMPS current-limiting behavior with manufacturer

### Switchboard Temperature Rise
- For **Rittal TS8** enclosures: Use pre-configured sizes for accurate cooling surface
- **Natural ventilation**: Opening areas affect chimney effect airflow
- **Forced ventilation**: Fan airflow rates significantly increase heat dissipation
- Check **measurement point limits** per IEC 61439-1 Table 6

### Motor Starting
- **VFD mode**: Starting voltage dip is negligible — drive controls I_start
- **DOL starting**: Highest starting currents, requires careful voltage dip analysis
- **Y/Δ starting**: Reduced starting current but lower starting torque
- Consider **parallel cables** for large motors or long runs

### Cable Tray / Conduit Fill
- **IEC note**: Annex B defines limits for conduit systems; applying to trays is conservative practice
- **NEC note**: Solid-bottom trays use different fill rules (NEC 392.22(B))
- **Mixed cables**: Power and signal cables should be **physically separated** to prevent EMI
- **Stacking**: Verify cable OD × count fits within tray dimensions

---

## ⚠️ Important Disclaimers

1. **Engineering Judgment Required**: This calculator provides **estimates** based on standard formulas. For critical applications, always verify calculations with:
   - Relevant standards and local regulations
   - Equipment manufacturer specifications
   - Site-specific conditions

2. **Manufacturer Data**: Device power losses, cable reactances, and material properties may vary by manufacturer. Use manufacturer-provided data when available.

3. **Installation Conditions**: Actual installation conditions (temperature, grouping, ventilation) may differ from standard assumptions. Adjust inputs accordingly.

4. **Safety**: Electrical calculations involve safety-critical parameters. Ensure all calculations are reviewed by qualified electrical engineers.

5. **Standards Updates**: Standards may be updated. Verify current requirements with the latest standard editions.

---

## 💡 Advanced Features

### Data Import/Export
- **Import from Wire Calculator**: Short-circuit module can import cable data from wire size calculations
- **Excel Paste**: Bulk import of calculation parameters from Excel
- **Markdown Copy**: Export results as formatted Markdown tables

### Real-time Validation
- Live warnings for potential issues
- Input validation with clear error messages
- Automatic unit conversion (m, cm, mm)

### Step-by-Step Display
All modules provide **detailed calculation breakdowns** showing:
- All intermediate values
- Formulas used
- Constants and assumptions
- Error checking at each step

---

## 🔍 Verification & Testing

The calculator has been **verified against**:
- IEC standard formulas and examples
- Published engineering handbooks
- Manufacturer calculation tools
- Cross-module consistency checks

**Known Limitations:**
- Skin effect calculation assumes stranded copper conductors (k_s = 1)
- Cable reactance values are typical estimates
- Temperature rise calculations assume uniform heat distribution
- Short-circuit calculations assume worst-case (maximum) conditions

---

## 📝 License & Usage

This tool is provided as-is for **educational and professional use**. No warranty is implied.

**Recommended for:**
- Electrical engineers
- Electrical technicians
- Electrical designers
- Students of electrical engineering

---

## 🙏 Credits

- **Standards**: IEC, NEC
- **Formulas**: Based on international electrical engineering standards
- **Implementation**: Pure JavaScript, HTML5, CSS3
- **External Libraries**: jsPDF (for PDF generation)

---

## 📞 Support

For issues, questions, or contributions:
- Review the step-by-step calculations for verification
- Check against manufacturer data and standards
- Consult qualified electrical engineers for critical applications

---

*Last updated: April 2025*
*Version: Comprehensive electrical engineering calculator with 6 integrated modules*
