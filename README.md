# Wire Size Calculator

A comprehensive web-based tool for electrical wire sizing calculations according to IEC 60228, IEC 60909, IEC 61439, and IEC 60890 standards. Designed for electrical engineers, technicians, and designers working with low-voltage installations.

## Overview

The calculator provides five main functions accessible through tabs:

1. **Wire Calculator** - Primary tool for determining conductor cross-section based on voltage drop and current capacity
2. **MM2 ↔ AWG Converter** - Bidirectional conversion between metric and AWG wire sizes
3. **Switchboard** - Temperature rise calculations for electrical switchgear assemblies
4. **Short Circuit** - Prospective short-circuit current calculations
5. **Motor Starting** - Motor starting current and voltage dip analysis

## Wire Calculator

### Function

Calculates the minimum required conductor cross-section for a given electrical circuit, balancing two limiting factors:
- **Voltage drop** - Ensures the conductor resistance does not cause excessive voltage loss
- **Ampacity** - Ensures the conductor can carry the current without exceeding its temperature rating

The calculator determines which factor is limiting and recommends the appropriate standard wire size.

### Input Parameters

- **System Type**: DC, Single-phase AC, or Three-phase AC
- **Supply Voltage**: Nominal system voltage in volts
- **Peak Current**: Maximum circuit current in amperes
- **Ambient Temperature**: Surrounding air temperature in °C
- **Maximum Conductor Temperature**: Permissible conductor operating temperature in °C
- **Allowed Voltage Drop**: Percentage of supply voltage that may be lost
- **Wire Length**: Circuit length with selectable unit (m, cm, mm)
- **Distance Type**: One-way or total (round-trip) length
- **Heat Dissipation**: Method of heat transfer from the conductor

### Calculation Logic

The calculator performs two parallel calculations and selects the more conservative (larger) result:

#### Voltage Drop Calculation

For DC and single-phase AC systems:
```
A_vd = (I * ρ * 2 * L) / V_drop
```

For three-phase AC systems:
```
A_vd = (sqrt(3) * I * ρ * L) / V_drop
```

Where:
- `A_vd` = required cross-section based on voltage drop (mm²)
- `I` = current (A)
- `ρ` = conductor resistivity at operating temperature (Ω·m)
- `L` = circuit length, one-way (m)
- `V_drop` = allowed voltage drop (V) = supply voltage × allowed percentage / 100

#### Ampacity Calculation

The ampacity calculation is based on steady-state thermal equilibrium:
```
A_amp = (I / K)^(4/3)
```

Where:
- `A_amp` = required cross-section based on ampacity (mm²)
- `K` = thermal coefficient = sqrt(h * 2 * sqrt(π) * ΔT / ρ)
- `h` = heat dissipation coefficient (W/m²·K)
- `ΔT` = temperature difference = T_max - T_ambient (°C)
- `ρ` = conductor resistivity at operating temperature (Ω·m)

#### Resistivity Temperature Correction

The resistivity at operating temperature is calculated using:
```
ρ_T = ρ_20 * (1 + α * (T - 20))
```

Where:
- `ρ_20` = resistivity at 20°C (1.724×10⁻⁸ Ω·m for copper)
- `α` = temperature coefficient (0.00393 for copper)
- `T` = operating temperature (°C)

### Heat Dissipation Presets

The calculator includes predefined heat dissipation coefficients:
- **Free air**: 14 W/m²·K for conductors in free air
- **Grouped**: 10 W/m²·K for grouped conductors
- **Conduit**: 7 W/m²·K for conductors in conduit
- **Custom**: User-defined value

### Conductor Derating

When multiple conductors are installed together, derating factors are applied:
- 1-3 conductors: 100%
- 4-6 conductors: 80%
- 7-9 conductors: 70%
- 10-20 conductors: 50%
- 21-30 conductors: 45%
- 31-40 conductors: 40%
- 41+ conductors: 35%

### Output

The calculator provides:
- **Voltage drop based recommendation**: Exact and standard sizes in mm² and AWG
- **Ampacity based recommendation**: Exact and standard sizes in mm² and AWG
- **Final recommendation**: The larger of the two, with indication of which factor is limiting
- **Protective earth recommendation**: Calculated according to IEC standards
- **Power loss**: Actual power dissipated in the conductor
- **Conductor rated current**: Maximum continuous current the recommended size can carry
- **Fuse recommendation**: Appropriate fuse size for the circuit
- **Actual voltage drop**: Calculated voltage drop for the recommended size

### Standard Wire Sizes

The calculator uses IEC 60228 standard cross-sections (mm²):
0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630

## MM2 ↔ AWG Converter

### Function

Converts between metric cross-sectional area (mm²) and American Wire Gauge (AWG) sizes, with three conversion modes:
1. **Exact**: Mathematical conversion using the AWG formula
2. **Closest**: Nearest standard AWG size to the converted mm² value
3. **Round up**: Next larger standard AWG size for safety margin

### Conversion Formulas

AWG to mm²:
```
d = 0.127 * 92^((36 - n) / 39)
A = π * d² / 4
```

mm² to AWG:
```
d = sqrt(4 * A / π)
n = 36 - 39 * log(d / 0.127) / log(92)
```

Where:
- `d` = wire diameter (mm for mm² input, inches for AWG input)
- `n` = AWG gauge number
- `A` = cross-sectional area (mm²)

### Reference Tables

The converter includes reference tables showing:
- IEC mm² sizes with corresponding AWG equivalents (nearest and safe)
- AWG sizes with corresponding mm² equivalents (exact and IEC safe)

## Switchboard Calculator

### Function

Calculates temperature rise in electrical switchboards and controlgear assemblies according to IEC 61439 and IEC 60890. This is critical for verifying that the assembly will not overheat under full load conditions.

### Calculation Basis

The switchboard calculator uses the power balance method:
```
ΔT = P_loss / (h * A_e)
```

Where:
- `ΔT` = temperature rise (°C)
- `P_loss` = total power loss from all devices (W)
- `h` = heat dissipation coefficient (W/m²·K)
- `A_e` = effective cooling surface area (m²)

### Device Loss Database

Includes typical power loss values for:
- MCB (Miniature Circuit Breaker): 2-4 W per pole × 3 poles
- MCCB (Molded Case Circuit Breaker): 5-15 W depending on frame size
- Contactor: 3-10 W depending on rating
- Relay: 2 W
- Terminal: 0.3 W per terminal

### Cooling Surface Calculation

For wall-mounted enclosures (per IEC 60890 §4):
```
A_e = 0.7 * (2 * h * d + h * b + b * d)
```

For free-standing enclosures:
```
A_e = 0.7 * (2 * h * d + 2 * h * b + b * d)
```

Where:
- `h` = height (m)
- `b` = width (m)
- `d` = depth (m)
- Factor 0.7 accounts for surface effectiveness

### Ventilation

Forced ventilation can be modeled with airflow rates, which increase the effective heat dissipation coefficient. The calculator includes presets for common fan sizes:
- Mini fan: ~50 m³/h
- Standard 120mm: ~150 m³/h
- Standard 150mm: ~250 m³/h
- 2× 200mm fans: ~400 m³/h
- 2× 250mm fans: ~600 m³/h

## Short Circuit Calculator

### Function

Calculates prospective short-circuit currents according to IEC 60909 and IEC 60364. This is essential for selecting protective devices and verifying their adequate interrupting rating.

### Input Modes

1. **Known Short-Circuit Level**: Direct input of short-circuit current at the busbar
2. **Transformer**: Calculation based on transformer rating and impedance

### Calculation Logic

For transformer-based calculation:
```
Z_tr = (U_k / 100) * (U_n² / S_n)
I_k = S_n / (sqrt(3) * U_n) * (100 / U_k)
```

Where:
- `Z_tr` = transformer impedance (Ω)
- `U_k` = transformer short-circuit voltage (%) 
- `U_n` = transformer rated voltage (V)
- `S_n` = transformer rated power (kVA)
- `I_k` = short-circuit current (kA)

For known busbar short-circuit level:
```
Z_source = U_0 / (sqrt(3) * I_k_busbar)
```

### Cable Contribution

The calculator accounts for cable impedance in the short-circuit path:
```
Z_cable = (ρ * L) / S + j * (x' * L)
```

Where:
- `ρ` = conductor resistivity at fault temperature (Ω·mm²/m)
- `L` = cable length (m)
- `S` = cable cross-section (mm²)
- `x'` = Cable reactance per meter (mΩ/m)

Typical reactance values:
- Single-core cables: 0.08 mΩ/m
- Multi-core cables: 0.07 mΩ/m

### Asymmetrical Peak Current

The peak short-circuit current (for mechanical stress verification) is calculated as:
```
I_peak = κ * sqrt(2) * I_k"
```

Where:
- `κ` = peak factor (1.8 for LV systems, 1.7-1.95 depending on X/R ratio)
- `I_k"` = initial symmetrical short-circuit current

### Trip Curve Verification

The calculator verifies that protective devices will trip within their specified ranges:
- **B curve**: 3-5 × In (protection of generators, long cable runs)
- **C curve**: 5-10 × In (general protection of circuits)
- **D curve**: 10-20 × In (transformers, motors with high starting currents)
- **K curve**: 8-14 × In (motors, transformers)
- **Z curve**: 2-3 × In (semiconductor protection)

## Motor Starting Calculator

### Function

Analyzes voltage dip during motor starting, which is critical for ensuring that other equipment on the same circuit is not adversely affected by the voltage drop caused by high starting currents.

### Input Parameters

- **Motor Rated Power**: Motor nominal power (kW)
- **Supply Voltage**: Nominal line-to-line voltage (V)
- **Power Factor (Rated)**: cos φ at rated operation
- **Efficiency**: Motor efficiency at rated operation
- **Power Factor (Starting)**: cos φ during starting
- **Starting Current Multiplier**: k_start = I_start / I_nominal
- **Cable Cross-Section**: Cable size (mm²)
- **Cable Length**: Circuit length (m)
- **Short-Circuit Level**: Upstream short-circuit current (kA)
- **Starting Method**: DOL, Y/Δ, Soft starter, VFD
- **Conductor Material**: Copper or Aluminum

### Calculation Logic

#### Rated and Starting Currents
```
I_n = (P_n * 1000) / (sqrt(3) * U_n * cos_φn * η)
I_start = k_start * I_n
```

Where:
- `P_n` = rated power (kW)
- `U_n` = rated voltage (V)
- `cos_φn` = rated power factor
- `η` = efficiency
- `k_start` = starting current multiplier

#### Impedances

Cable impedance:
```
R_cable = ρ * L / S
X_cable ≈ 0.08 * L / 1000
```

Network impedance at busbar:
```
Z_s = U_n / (sqrt(3) * I_k * 1000)
R_s = Z_s * 0.1
X_s = Z_s * 0.995
```

Note: The X/R ratio of approximately 10 is typical for MV/LV transformer feeds.

Total impedance:
```
R_total = R_s + R_cable
X_total = X_s + X_cable
```

#### Voltage Dip Calculation

```
ΔU = sqrt(3) * I_start * (R_total * cos_φ_start + X_total * sin_φ_start)
ΔU% = (ΔU / U_n) * 100
```

Where:
- `sin_φ_start = sqrt(1 - cos_φ_start²)`

### Assessment Criteria

The calculator evaluates the voltage dip against common industry limits:
- **< 5%**: Well within limits - minimal impact on other equipment
- **5-10%**: Acceptable - may cause flicker in lighting but generally tolerable
- **10-15%**: Marginal - may cause nuisance tripping of sensitive equipment
- **> 15%**: Exceeds limits - likely to cause operational issues

## Technical Standards

This calculator is based on the following standards:
- **IEC 60228**: Conductors of insulated cables
- **IEC 60909**: Short-circuit currents in three-phase AC systems
- **IEC 61439**: Low-voltage switchgear and controlgear assemblies
- **IEC 60890**: Calculation of temperature rise in low-voltage switchgear
- **IEC 60269**: Low-voltage fuses
- **IEC 60898 / IEC 60947-2**: Circuit breakers

## Browser Compatibility

The calculator is compatible with modern web browsers including Chrome, Firefox, Edge, and Safari. It is designed as a progressive web application and can be added to the home screen for offline use once cached.

## Usage Notes

- All calculations assume copper conductors unless aluminum is specifically selected
- Default values are provided for common low-voltage systems (230V single-phase, 400V three-phase)
- The calculator uses standard IEC values for resistivity and temperature coefficients
- Results are rounded to appropriate significant figures for practical application
- For critical applications, always verify calculations with the relevant standards and local regulations
