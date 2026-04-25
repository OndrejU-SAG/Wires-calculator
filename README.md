# Wire Size Calculator

A comprehensive web-based electrical engineering tool for wire sizing, conversion, and electrical system analysis. Designed for electrical engineers, technicians, and designers working with low-voltage installations.

## Capabilities

The calculator provides six main functions, each addressing a critical aspect of electrical design:

### 1. **Wire Size Calculator**
Determines the minimum required conductor cross-section based on two limiting factors:
- **Voltage drop** — ensures conductor resistance doesn't cause excessive voltage loss
- **Ampacity** — ensures the conductor can carry current without exceeding temperature rating

The calculator evaluates both factors in parallel and recommends the larger (more conservative) result.

### 2. **MM² ↔ AWG Converter**
Bidirectional conversion between metric (mm²) and American Wire Gauge (AWG) sizes with three modes:
- **Exact** — Mathematical conversion using AWG formula
- **Closest** — Nearest standard size to the converted value
- **Round up** — Next larger standard size for safety margin

Includes comprehensive reference tables for both systems.

### 3. **Switchboard Temperature Rise**
Calculates temperature rise in electrical switchgear and controlgear assemblies. Features:
- Device power loss database (MCB, MCCB, contactors, relays, terminals)
- Cooling surface calculation per IEC 60890 §4
- Natural and forced ventilation modeling
- Support for wall-mounted and free-standing enclosures
- Pre-configured Rittal TS8 sizes

### 4. **Short Circuit Current**
Calculates prospective short-circuit currents with:
- Two input modes: known short-circuit level or transformer-based calculation
- Cable impedance contribution modeling
- Asymmetrical peak current calculation
- Trip curve verification (B, C, D, K, Z curves)
- Selectivity analysis between upstream and downstream protective devices
- Support for TN-S, TN-C, TT network types

### 5. **Motor Starting**
Two calculation modes for motor applications:
- **Voltage Dip Only** — Analyzes voltage dip during motor starting
- **Full Cable Sizing** — Complete cable sizing with derating factors

Supports starting methods: DOL, Y/Δ, Soft starter, VFD.

### 6. **Cable Tray / Conduit Fill**
Calculates fill percentage for cable trays and conduits with:
- Support for rectangular and circular geometries
- Round and oval conduit types
- Ladder, ventilated, and solid tray types
- Compliance with IEC 60364-5-52 and NEC 392/358 standards
- Handling of single cable, multiple cables, power, signal, and mixed scenarios

---

## Calculation Methodology

### Wire Size Calculator

#### Physical Constants
- Copper resistivity at 20°C: ρ₂₀ = 1.724 × 10⁻⁸ Ω·m (IEC 60228)
- Temperature coefficient for copper: α = 0.00393 °C⁻¹
- Copper resistivity (alternate): 0.017241 Ω·mm²/m
- Aluminum resistivity at 20°C: ρ₂₀ = 0.028571 Ω·mm²/m
- Temperature coefficient for aluminum: α = 0.00403 °C⁻¹

#### Resistivity Temperature Correction
```
ρ_T = ρ_20 × (1 + α × (T - 20))
```
Where:
- ρ_T = resistivity at temperature T (Ω·mm²/m)
- ρ_20 = resistivity at 20°C
- α = temperature coefficient
- T = operating temperature (°C)

#### Voltage Drop Calculation
For DC and single-phase AC:
```
A_vd = (I × ρ × 2 × L) / V_drop
```

For three-phase AC:
```
A_vd = (√3 × I × ρ × L) / V_drop
```

Where:
- A_vd = required cross-section based on voltage drop (mm²)
- I = current (A)
- ρ = conductor resistivity at operating temperature (Ω·m)
- L = circuit length, one-way (m)
- V_drop = allowed voltage drop (V) = supply voltage × allowed percentage / 100

**Skin Effect Correction (IEC 60287):**
For AC systems, skin effect increases resistance:
```
x_s² = (8πf × k_s) / (10⁷ × R_DC)
R_AC = R_DC × (1 + y_s)
```
Where y_s = x_s⁴ / (192 + 0.8 × x_s⁴), and k_s = 1 for stranded copper conductors.

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

**Heat Dissipation Presets:**
- Free air: 14 W/m²·K
- Grouped conductors: 10 W/m²·K
- In conduit: 7 W/m²·K
- Custom: User-defined

**Conductor Derating (Multiple conductors):**
- 1-3 conductors: 100%
- 4-6 conductors: 80%
- 7-9 conductors: 70%
- 10-20 conductors: 50%
- 21-30 conductors: 45%
- 31-40 conductors: 40%
- 41+ conductors: 35%

#### Protective Earth Conductor
Calculated according to IEC standards:
```
S_pe = min(S_phase, calcPeMm2(S_phase))
```
Where calcPeMm2 applies IEC 60364-5-54 derating rules.

#### Fuse Recommendation
Selects the largest standard fuse size ≤ calculated Wire Ampacity from:
1, 2, 3, 4, 5, 6, 8, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400 A

### MM² ↔ AWG Conversion

**AWG to mm²:**
```
d = 0.127 × 92^((36 - n) / 39)  [inches]
A = π × d² / 4  [mm²]
```

**mm² to AWG:**
```
d = √(4 × A / π)
G = 36 - 39 × log(d / 0.127) / log(92)
```

Where:
- d = wire diameter (mm for mm² input, inches for AWG)
- n = AWG gauge number
- A = cross-sectional area (mm²)
- G = AWG gauge number result

**Standard Sizes:**
- IEC mm²: 0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630
- AWG: 4/0, 3/0, 2/0, 1/0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40

### Switchboard Temperature Rise

#### Effective Cooling Surface (IEC 60890 §4)
For wall-mounted enclosures:
```
A_e = 0.7 × (2 × h × d + h × b + b × d)
```

For free-standing enclosures:
```
A_e = 0.7 × (2 × h × d + 2 × h × b + b × d)
```

Where:
- h = height (m)
- b = width (m)
- d = depth (m)
- 0.7 factor accounts for surface effectiveness

#### Temperature Rise Calculation
```
ΔT = P_loss / (h × A_e)
```

Where:
- ΔT = temperature rise (°C)
- P_loss = total power loss from all devices (W)
- h = heat dissipation coefficient (W/m²·K)
- A_e = effective cooling surface area (m²)

**Heat Dissipation Coefficients:**
- Natural convection, painted steel: 5.5 W/m²·K (IEC 61439 §10.10)
- Forced ventilation: increases with airflow rate

**Device Loss Database (typical values):**
- MCB: 2-4 W per pole × 3 poles (depends on frame size)
- MCCB: 5-15 W (depends on frame size)
- Contactor: 3-10 W (depends on rating)
- Relay: 2 W
- Terminal: 0.3 W per terminal

### Short Circuit Current

#### Transformer-Based Calculation (IEC 60909)
```
Z_tr = (U_k / 100) × (U_n² / S_n)
I_k = (S_n / (√3 × U_n)) × (100 / U_k)
```

Where:
- Z_tr = transformer impedance (Ω)
- U_k = transformer short-circuit voltage (%)
- U_n = transformer rated voltage (V)
- S_n = transformer rated power (kVA)
- I_k = short-circuit current (kA)

#### Known Busbar Short-Circuit Level
```
Z_source = U_0 / (√3 × I_k_busbar)
```

Where:
- U_0 = line-to-earth voltage (V)
- I_k_busbar = short-circuit current at busbar (kA)

#### Cable Contribution
```
Z_cable = (ρ × L) / S + j × (x' × L)
```

Where:
- ρ = conductor resistivity at fault temperature (Ω·mm²/m)
- L = cable length (m)
- S = cable cross-section (mm²)
- x' = cable reactance per meter (mΩ/m)

Typical reactance values:
- Single-core cables: 0.08 mΩ/m
- Multi-core cables: 0.07 mΩ/m

#### Asymmetrical Peak Current
```
I_peak = κ × √2 × I_k"
```

Where:
- κ = peak factor (1.8 for LV systems, 1.7-1.95 depending on X/R ratio)
- I_k" = initial symmetrical short-circuit current

#### Trip Curve Multipliers (IEC 60898 / IEC 60947-2)
- **B curve**: 3-5 × In (protection of generators, long cable runs)
- **C curve**: 5-10 × In (general protection of circuits)
- **D curve**: 10-20 × In (transformers, motors with high starting currents)
- **K curve**: 8-14 × In (motors, transformers)
- **Z curve**: 2-3 × In (semiconductor protection)
- **Fuse gG**: I² ≈ 1.6 × In (IEC 60269-2)

### Motor Starting

#### Rated and Starting Currents
```
I_n = (P_n × 1000) / (√3 × U_n × cos_φn × η)
I_start = k_start × I_n
```

Where:
- P_n = rated power (kW)
- U_n = rated voltage (V)
- cos_φn = rated power factor
- η = efficiency
- k_start = starting current multiplier

**Typical Starting Current Multipliers:**
- DOL (Direct On Line): 5-8×
- Y/Δ (Star-Delta): 1.8-2.5×
- Soft starter: 2-3.5×
- VFD (Variable Frequency Drive): 1.0-1.5×

#### Impedances
**Cable impedance:**
```
R_cable = ρ × L / S × (1 + y_s)
X_cable ≈ 0.08 × L / 1000
```

**Network impedance at busbar:**
```
Z_s = U_n / (√3 × I_k × 1000)
R_s = Z_s × 0.1
X_s = Z_s × 0.995
```

Note: X/R ratio of approximately 10 is typical for MV/LV transformer feeds.

**Total impedance:**
```
R_total = R_s + R_cable
X_total = X_s + X_cable
```

#### Voltage Dip Calculation
```
ΔU = √3 × I_start × (R_total × cos_φ_start + X_total × sin_φ_start)
ΔU% = (ΔU / U_n) × 100
sin_φ_start = √(1 - cos_φ_start²)
```

**Assessment Criteria:**
- **< 5%**: Well within limits — minimal impact on other equipment
- **5-10%**: Acceptable — may cause flicker in lighting but generally tolerable
- **10-15%**: Marginal — may cause nuisance tripping of sensitive equipment
- **> 15%**: Exceeds limits — likely to cause operational issues

### Cable Tray / Conduit Fill

#### Fill Percentage Calculation
```
Fill (%) = (Total cable cross-sectional area / Tray or conduit area) × 100
```

**Fill Limits by Standard and Scenario:**

| Scenario | IEC Limit | NEC Limit |
|----------|-----------|------------|
| Single cable | 53% | 53% |
| Two cables | 31% | 31% |
| 3+ power cables | 40% | 50% |
| 3+ signal cables | 40% | 50% |
| 3+ mixed cables | 40% | 50% |

**Standard Cable Outer Diameters (typical single-core PVC-insulated):**
| mm² | OD (mm) |
|-----|--------|
| 1.5 | 6.5 |
| 2.5 | 7.5 |
| 4 | 8.5 |
| 6 | 9.5 |
| 10 | 12.0 |
| 16 | 14.0 |
| 25 | 17.0 |
| 35 | 19.0 |
| 50 | 22.0 |
| 70 | 26.0 |
| 95 | 30.0 |
| 120 | 34.0 |

**IEC Ampacity Values (60364-5-52:2009)**
For copper conductors at 70°C, PVC insulated, 3 loaded conductors, 30°C ambient:

| mm² | Free Air | In Duct | Buried |
|-----|----------|---------|--------|
| 1.5 | 17.5 A | 13.5 A | 22 A |
| 2.5 | 24 A | 18 A | 29 A |
| 4 | 32 A | 24 A | 38 A |
| 6 | 41 A | 31 A | 47 A |
| 10 | 57 A | 42 A | 63 A |
| 16 | 76 A | 56 A | 81 A |
| 25 | 101 A | 73 A | 104 A |
| 35 | 125 A | 89 A | 125 A |
| 50 | 151 A | 108 A | 148 A |

---

## Standards Compliance

This calculator implements calculations according to the following international standards:

### Primary Standards
- **IEC 60228**: Conductors of insulated cables — Defines standard conductor sizes and resistivity values
- **IEC 60909**: Short-circuit currents in three-phase AC systems — Short-circuit current calculations
- **IEC 61439**: Low-voltage switchgear and controlgear assemblies — Switchboard temperature rise calculations
- **IEC 60890**: Calculation of temperature rise in low-voltage switchgear — Cooling surface and heat dissipation methods
- **IEC 60364-5-52**: Electrical installations of buildings — Cable sizing, installation methods, and fill ratios
- **IEC 60269**: Low-voltage fuses — Fuse characteristics and protective device coordination
- **IEC 60898**: Circuit breakers for overcurrent protection — Domestic and similar installations
- **IEC 60947-2**: Circuit breakers — Industrial applications

### Additional References
- **NEC 392**: Electrical installations — Cable trays
- **NEC 358**: Electrical metallic tubing
- **IEC 60287**: Electric cables — Calculation of the current rating (skin effect)

### Material Properties
All calculations use standard IEC values:
- **Copper**: ρ₂₀ = 1.7241 × 10⁻⁸ Ω·m = 0.017241 Ω·mm²/m at 20°C
- **Aluminum**: ρ₂₀ = 2.8571 × 10⁻⁸ Ω·m = 0.028571 Ω·mm²/m at 20°C
- Temperature coefficients: Cu = 0.00393, Al = 0.00403

---

## Browser Compatibility

The calculator is a progressive web application compatible with:
- Chrome / Edge (recommended)
- Firefox
- Safari
- Can be added to home screen for offline use once cached

---

## Usage Notes

- All calculations default to copper conductors; aluminum is available as an option
- Default values are provided for common low-voltage systems (24V DC, 230V single-phase, 400V three-phase)
- Skin effect is automatically calculated for AC systems using IEC 60287 methodology
- Results are rounded to appropriate significant figures for practical application
- For critical applications, always verify calculations with the relevant standards and local regulations
