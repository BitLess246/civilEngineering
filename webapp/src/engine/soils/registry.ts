// ─────────────────────────────────────────────────────────────────────────
// Calculation registry for the soil-investigation module. Layer 8.
//
// One declared entry per calculation the module performs: the equation, its
// units, what it assumes, where it stops being valid, and what it is taken
// from. Registered BEFORE the calculation is implemented, so the reference is
// something the code was written against rather than something reconstructed
// afterwards.
//
// Three jobs:
//
//  1. `DerivedProvenance.calculation` points at a registry id, so a derived
//     parameter can print the equation that made it without the report layer
//     knowing anything about geotechnics.
//  2. `limitations` are the conditions the formula stops holding under. These
//     become runtime warnings, which is the difference between a tool that
//     computes q_u/2 and one that says "c_u ≈ q_u/2 assumes a saturated
//     cohesive soil; this layer classifies as SM".
//  3. Every entry needs a matching `docs/ValidationMap.md` row before its
//     engine ships (CLAUDE.md L9), and the test in this module's suite pins
//     that the ids stay unique and fully described.
//
// The registry is data, not behaviour. It deliberately does NOT hold the
// implementing function: a formula string that has drifted from the code is
// worse than no formula string, so the two are kept apart and each engine's
// own test is what ties its output to the reference.
// ─────────────────────────────────────────────────────────────────────────

import type { StandardId } from './standards'

export type CalcCategory =
  | 'index' | 'classification' | 'field' | 'strength'
  | 'consolidation' | 'correlation' | 'analysis'

export interface CalcEntry {
  /** Human title as it appears in a calculation sheet heading. */
  title: string
  category: CalcCategory
  /**
   * The equation in KaTeX, symbols only — the substituted form is built by the
   * worked-solution builder at run time from real values.
   */
  equation: string
  /** Result units, in the module convention (see model.ts). */
  unit: string
  /** What each symbol means, so a sheet can print a nomenclature block. */
  symbols: Record<string, string>
  /** Standard the procedure comes from, when it is a standardised test. */
  standard?: StandardId
  /** Textbook or paper the relation is taken from, when it is not a standard. */
  reference?: string
  /** Conditions taken as true without checking. */
  assumptions?: string[]
  /** Conditions the relation stops holding under — these become warnings. */
  limitations?: string[]
}

/**
 * Keys are stable ids stored inside investigation JSON as
 * `DerivedProvenance.calculation`. Renaming one is a breaking change.
 */
export const CALCULATIONS = {
  // ── Index properties ──
  'moisture.water-content': {
    title: 'Water content',
    category: 'index',
    equation: String.raw`w = \frac{M_w}{M_s} \times 100 = \frac{M_{wet} - M_{dry}}{M_{dry} - M_{can}} \times 100`,
    unit: '%',
    symbols: {
      w: 'water content, %',
      M_w: 'mass of water, g',
      M_s: 'mass of dry solids, g',
      'M_{wet}': 'mass of can + wet soil, g',
      'M_{dry}': 'mass of can + dry soil, g',
      'M_{can}': 'mass of the empty can, g',
    },
    standard: 'd2216',
    assumptions: ['Oven-drying at 110 ± 5 °C removes free water only.'],
    limitations: [
      'Organic soils and soils with gypsum lose structural water at 110 °C — dry at 60 °C and say so.',
    ],
  },

  'gs.specific-gravity': {
    title: 'Specific gravity of solids',
    category: 'index',
    equation: String.raw`G_s = \frac{M_s}{M_s + (M_{pw} - M_{pws})} \cdot K`,
    unit: '—',
    symbols: {
      G_s: 'specific gravity of solids at 20 °C',
      M_s: 'mass of dry solids, g',
      'M_{pw}': 'mass of pycnometer + water, g',
      'M_{pws}': 'mass of pycnometer + water + solids, g',
      K: 'temperature correction to 20 °C',
    },
    standard: 'd854',
    limitations: ['De-airing is the dominant error source; an under-de-aired run reads low.'],
  },

  'sieve.percent-passing': {
    title: 'Percent passing',
    category: 'index',
    equation: String.raw`P_i = 100 - \frac{\sum_{k \le i} M_k}{M_{total}} \times 100`,
    unit: '%',
    symbols: {
      P_i: 'percent passing sieve i, %',
      M_k: 'mass retained on sieve k, g',
      'M_{total}': 'total dry mass of the specimen, g',
    },
    standard: 'd6913',
    limitations: [
      'Masses must close on the total within 1%; a larger loss invalidates the grading.',
    ],
  },

  'sieve.uniformity': {
    title: 'Coefficient of uniformity',
    category: 'index',
    equation: String.raw`C_u = \frac{D_{60}}{D_{10}}`,
    unit: '—',
    symbols: {
      C_u: 'coefficient of uniformity',
      'D_{60}': 'grain size at 60% passing, mm',
      'D_{10}': 'grain size at 10% passing, mm',
    },
    standard: 'd2487',
    limitations: [
      'Undefined when the curve does not reach 10% passing — a soil with more than 10% fines has no D₁₀ from sieving alone.',
    ],
  },

  'sieve.curvature': {
    title: 'Coefficient of curvature',
    category: 'index',
    equation: String.raw`C_c = \frac{D_{30}^2}{D_{10} \cdot D_{60}}`,
    unit: '—',
    symbols: {
      C_c: 'coefficient of curvature',
      'D_{30}': 'grain size at 30% passing, mm',
      'D_{10}': 'grain size at 10% passing, mm',
      'D_{60}': 'grain size at 60% passing, mm',
    },
    standard: 'd2487',
  },

  'atterberg.plasticity-index': {
    title: 'Plasticity index',
    category: 'index',
    equation: String.raw`PI = LL - PL`,
    unit: '%',
    symbols: {
      PI: 'plasticity index, %',
      LL: 'liquid limit, %',
      PL: 'plastic limit, %',
    },
    standard: 'd4318',
    limitations: [
      'A soil whose PL cannot be obtained is reported non-plastic (NP), not PI = 0.',
    ],
  },

  'atterberg.liquidity-index': {
    title: 'Liquidity index',
    category: 'index',
    equation: String.raw`LI = \frac{w - PL}{PI}`,
    unit: '—',
    symbols: {
      LI: 'liquidity index',
      w: 'natural water content, %',
      PL: 'plastic limit, %',
      PI: 'plasticity index, %',
    },
    reference: 'Terzaghi, Peck & Mesri, Soil Mechanics in Engineering Practice',
    limitations: ['Meaningless for a non-plastic soil (PI = 0 divides by zero).'],
  },

  'atterberg.liquid-limit-flow': {
    title: 'Liquid limit from the flow curve',
    category: 'index',
    equation: String.raw`w = a + b\log_{10} N \Rightarrow LL = w|_{N = 25}, \qquad I_f = -b`,
    unit: '%',
    symbols: {
      w: 'water content of a trial, %',
      N: 'blows to closure, blows',
      LL: 'liquid limit, %',
      I_f: 'flow index, % per log cycle',
      a: 'intercept of the flow line, %',
      b: 'slope of the flow line, % per log cycle',
    },
    standard: 'd4318',
    assumptions: ['The flow curve is a straight line on water content vs log blows.'],
    limitations: [
      'D4318 asks for trials between 15 and 40 blows bracketing 25; outside that range the liquid limit is extrapolated.',
    ],
  },

  // ── Classification ──
  'aashto.group-index': {
    title: 'AASHTO group index',
    category: 'classification',
    equation: String.raw`GI = (F - 35)\left[0.2 + 0.005(LL - 40)\right] + 0.01(F - 15)(PI - 10)`,
    unit: '—',
    symbols: {
      GI: 'group index, dimensionless',
      F: 'percent passing the 0.075 mm (No. 200) sieve, %',
      LL: 'liquid limit, %',
      PI: 'plasticity index, %',
    },
    standard: 'm145',
    limitations: [
      'Evaluated signed; a negative result is reported as zero per M 145, not clamped term by term.',
      'Defined for the silt-clay groups (F > 35) and, in partial form, for A-2-6 and A-2-7. Outside that domain the expression is arithmetic, not a soil property.',
    ],
  },

  'aashto.classify': {
    title: 'AASHTO group',
    category: 'classification',
    equation: String.raw`\text{gradation } (P_{10}, P_{40}, P_{200}) \text{ and plasticity } (LL, PI) \Rightarrow \text{A-group}`,
    unit: '—',
    symbols: {
      P_10: 'percent passing the 2.00 mm (No. 10) sieve, %',
      P_40: 'percent passing the 0.425 mm (No. 40) sieve, %',
      P_200: 'percent passing the 0.075 mm (No. 200) sieve, %',
      LL: 'liquid limit, %',
      PI: 'plasticity index, %',
    },
    standard: 'm145',
    assumptions: ['The table is read left to right — the first group whose criteria are all met is the answer.'],
    limitations: [
      'AASHTO puts the granular / silt-clay boundary at 35% fines where USCS puts the coarse / fine boundary at 50%. The two systems answer different questions and their results should not be reconciled.',
    ],
  },

  'uscs.classify': {
    title: 'USCS group symbol',
    category: 'classification',
    equation: String.raw`\text{fines, gradation } (C_u, C_c) \text{ and plasticity } (LL, PI) \Rightarrow \text{group symbol}`,
    unit: '—',
    symbols: {
      'fines': 'percent passing the 0.075 mm (No. 200) sieve, %',
      C_u: 'coefficient of uniformity',
      C_c: 'coefficient of curvature',
      LL: 'liquid limit, %',
      PI: 'plasticity index, %',
    },
    standard: 'd2487',
    assumptions: ['Gradation and plasticity are from the same specimen.'],
    limitations: [
      'D2487 classifies from laboratory data; a field description without tests is D2488 and carries a different confidence.',
      'Borderline soils take a dual symbol — the classifier must not pick one silently.',
    ],
  },

  'uscs.a-line': {
    title: 'Casagrande A-line',
    category: 'classification',
    equation: String.raw`PI_{A} = 0.73\,(LL - 20)`,
    unit: '%',
    symbols: { PI_A: 'plasticity index on the A-line, %', LL: 'liquid limit, %' },
    standard: 'd2487',
  },

  'uscs.u-line': {
    title: 'Casagrande U-line (upper bound)',
    category: 'classification',
    equation: String.raw`PI_{U} = 0.9\,(LL - 8)`,
    unit: '%',
    symbols: { PI_U: 'plasticity index on the U-line, %', LL: 'liquid limit, %' },
    standard: 'd2487',
    limitations: [
      'A point plotting above the U-line is not a soil type — it is a testing error, and should be re-run rather than classified.',
    ],
  },

  // ── Field: SPT ──
  'spt.n60': {
    title: 'Energy-corrected SPT blow count',
    category: 'field',
    equation: String.raw`N_{60} = N \cdot \frac{E_R}{60} \cdot C_B \cdot C_S \cdot C_R`,
    unit: 'blows/300 mm',
    symbols: {
      'N_{60}': 'blow count at 60% energy ratio, blows/300 mm',
      N: 'field blow count (2nd + 3rd increments), blows/300 mm',
      E_R: 'hammer energy ratio, %',
      C_B: 'borehole-diameter correction',
      C_S: 'sampler correction',
      C_R: 'rod-length correction',
    },
    standard: 'd1586',
    reference: 'Skempton (1986); Youd et al. (2001) NCEER',
    assumptions: ['Energy ratio is the measured value when given, otherwise a hammer-type default.'],
    limitations: [
      'Hammer-type defaults span a wide range in practice — a measured E_R is worth far more than the correction it replaces.',
      'Refusal blow counts are a lower bound; correcting one does not make it a measurement.',
    ],
  },

  'spt.n1-60': {
    title: 'Overburden-corrected SPT blow count',
    category: 'field',
    equation: String.raw`(N_1)_{60} = C_N \cdot N_{60}, \qquad C_N = \sqrt{\frac{P_a}{\sigma'_{v0}}} \le 1.7`,
    unit: 'blows/300 mm',
    symbols: {
      '(N_1)_{60}': 'blow count corrected to 100 kPa effective overburden, blows/300 mm',
      C_N: 'overburden correction factor',
      P_a: 'atmospheric pressure, 100 kPa',
      "\\sigma'_{v0}": 'effective vertical stress at the test depth, kPa',
    },
    reference: 'Liao & Whitman (1986); capped per Youd et al. (2001)',
    limitations: [
      'Applies to granular soils. Correcting a clay N-value for overburden is not meaningful.',
      'C_N is capped at 1.7 — shallow tests would otherwise be inflated without limit.',
    ],
  },

  // ── Field: CPT ──
  'cpt.qt': {
    title: 'Corrected cone resistance',
    category: 'field',
    equation: String.raw`q_t = q_c + u_2 (1 - a)`,
    unit: 'MPa',
    symbols: {
      q_t: 'corrected cone resistance, MPa',
      q_c: 'measured cone resistance, MPa',
      u_2: 'pore pressure behind the cone shoulder, kPa',
      a: 'net area ratio of the cone, a dimensionless factor',
    },
    standard: 'd5778',
    reference: 'Robertson & Cabal, Guide to Cone Penetration Testing',
    limitations: [
      'Needs a u₂ measurement. In soft clay the correction is the dominant term, not a refinement — pore pressure on the shoulder can exceed the cone resistance itself.',
      'a is a property of the specific cone and belongs on its calibration certificate, not a default.',
    ],
  },

  'cpt.ic': {
    title: 'Soil behaviour type index',
    category: 'classification',
    equation: String.raw`I_c = \sqrt{(3.47 - \log_{10} Q_{tn})^2 + (\log_{10} F_r + 1.22)^2}`,
    unit: '—',
    symbols: {
      I_c: 'soil behaviour type index, a dimensionless index',
      'Q_{tn}': 'stress-normalised cone resistance, a dimensionless ratio',
      F_r: 'normalised friction ratio, %',
    },
    reference: 'Robertson (2009, 2010)',
    assumptions: [
      'The stress exponent n and I_c are mutually dependent and are solved to a fixed point rather than assumed.',
    ],
    limitations: [
      'BEHAVIOUR, not classification. A CPT takes no sample; a clayey sand and a sandy clay can plot in the same zone, and only a sample settles it.',
      'I_c above about 2.6 is treated as too clay-rich to liquefy — a screening boundary, and soils near it need sampling.',
    ],
  },

  'cpt.su': {
    title: 'Undrained shear strength from cone resistance',
    category: 'correlation',
    equation: String.raw`s_u = \frac{q_t - \sigma_{v0}}{N_{kt}}`,
    unit: 'kPa',
    symbols: {
      s_u: 'undrained shear strength, kPa',
      q_t: 'corrected cone resistance, kPa',
      '\\sigma_{v0}': 'total vertical stress at the depth, kPa',
      'N_{kt}': 'cone factor, a dimensionless factor',
    },
    reference: 'Robertson & Cabal; N_kt commonly 14–16',
    limitations: [
      'The strength is directly proportional to N_kt, which ranges 10–20 between sites. Without a local calibration against vane or triaxial data the answer carries that whole spread.',
      'Applies to fine-grained soils only.',
    ],
  },

  // ── Analysis: liquefaction triggering ──
  'liquefaction.csr': {
    title: 'Cyclic stress ratio (seismic demand)',
    category: 'analysis',
    equation: String.raw`CSR = 0.65\,\frac{a_{max}}{g}\,\frac{\sigma_{v0}}{\sigma'_{v0}}\,r_d`,
    unit: '—',
    symbols: {
      CSR: 'cyclic stress ratio, a dimensionless ratio of shear stress to effective stress',
      'a_{max}': 'peak horizontal ground acceleration at the surface, as a fraction of g',
      '\\sigma_{v0}': 'total vertical stress at the depth, kPa',
      "\\sigma'_{v0}": 'effective vertical stress at the depth, kPa',
      r_d: 'stress reduction coefficient for column flexibility, a dimensionless factor',
    },
    reference: 'Seed & Idriss (1971); Youd et al. (2001) NCEER eq. 2',
    assumptions: [
      'Level ground and a soil column whose response is captured by the r_d curve.',
      '0.65 converts an irregular time history to an equivalent number of uniform cycles.',
    ],
    limitations: [
      'a_max is a SURFACE acceleration. Using a bedrock value without a site-response analysis understates the demand on soft ground.',
      'r_d is poorly constrained below about 23 m — below that depth a site-response analysis is the defensible route.',
    ],
  },

  'liquefaction.fines-correction': {
    title: 'Equivalent clean-sand blow count',
    category: 'analysis',
    equation: String.raw`(N_1)_{60cs} = \alpha + \beta (N_1)_{60}`,
    unit: 'blows/300 mm',
    symbols: {
      '(N_1)_{60cs}': 'equivalent clean-sand blow count, blows/300 mm',
      '(N_1)_{60}': 'overburden- and energy-corrected blow count, blows/300 mm',
      '\\alpha': 'fines intercept correction, blows/300 mm',
      '\\beta': 'fines slope correction, a dimensionless factor',
    },
    reference: 'Youd et al. (2001) NCEER eqs. 6a–7c',
    limitations: [
      'Needs a measured fines content. Treating a silty sand as clean sand OVERSTATES its resistance.',
      'Saturates at 35% fines; beyond that the correction stops distinguishing soils that behave differently.',
    ],
  },

  'liquefaction.crr': {
    title: 'Cyclic resistance ratio',
    category: 'analysis',
    equation: String.raw`CRR = \left[\frac{1}{34 - (N_1)_{60cs}} + \frac{(N_1)_{60cs}}{135} + \frac{50}{[10(N_1)_{60cs} + 45]^2} - \frac{1}{200}\right] MSF \cdot K_\sigma \cdot K_\alpha`,
    unit: '—',
    symbols: {
      CRR: 'cyclic resistance ratio, a dimensionless ratio of shear stress to effective stress',
      '(N_1)_{60cs}': 'equivalent clean-sand blow count, blows/300 mm',
      MSF: 'magnitude scaling factor, a dimensionless factor',
      'K_\\sigma': 'overburden correction, a dimensionless factor',
      'K_\\alpha': 'sloping-ground correction, a dimensionless factor',
    },
    reference: 'Youd et al. (2001) NCEER eq. 4 (Rauch approximation of the Seed et al. base curve)',
    assumptions: [
      'The bracketed base curve is for clean sand, M 7.5, σ′v0 ≈ 100 kPa and level ground; MSF, K_σ and K_α move it off those conditions.',
    ],
    limitations: [
      'The base curve ends at (N₁)₆₀cs = 30. Denser granular soils are taken as non-liquefiable — the expression keeps returning numbers past that point and they are meaningless.',
      'K_σ must not be taken greater than 1.0, so no shallow soil is credited with resistance the case histories do not support.',
      'K_α is recommended by the NCEER workshop for use by specialists only.',
      'The whole procedure is for SATURATED COHESIONLESS soils. Fine-grained soils are governed by Bray & Sancio (2006), a different check entirely.',
    ],
  },

  'liquefaction.lpi': {
    title: 'Liquefaction potential index',
    category: 'analysis',
    equation: String.raw`LPI = \int_0^{20} F(z)\,w(z)\,dz, \quad F = 1 - FS \ (FS < 1), \quad w = 10 - 0.5z`,
    unit: '—',
    symbols: {
      LPI: 'liquefaction potential index, a dimensionless severity index',
      F: 'severity at depth z, a dimensionless factor',
      FS: 'factor of safety against triggering, a dimensionless ratio',
      w: 'depth weighting, a dimensionless factor',
      z: 'depth below ground, m',
    },
    reference: 'Iwasaki et al. (1978)',
    limitations: [
      'One number for a whole profile: a thin very loose seam and a thick marginal one can share an LPI and behave nothing alike. It never replaces reading the FS profile.',
      'Defined over the top 20 m only.',
    ],
  },

  'stress.effective-vertical': {
    title: 'Effective vertical stress',
    category: 'field',
    equation: String.raw`\sigma'_{v0} = \sum \gamma_i h_i - \gamma_w \max(z - z_w,\ 0)`,
    unit: 'kPa',
    symbols: {
      "\\sigma'_{v0}": 'effective vertical stress, kPa',
      '\\gamma_i': 'unit weight of layer i — moist above the water table, saturated below, kN/m³',
      h_i: 'thickness of layer i contributing above the depth, m',
      '\\gamma_w': 'unit weight of water, 9.81 kN/m³',
      z: 'depth of interest, m',
      z_w: 'depth to the water table, m',
    },
    reference: 'Terzaghi effective-stress principle',
    assumptions: ['Hydrostatic pore pressure below a static water table.'],
    limitations: [
      'A layer straddling the water table must be integrated in two parts. Taking whichever unit weight applies at its midpoint reads the stress high and flows straight into an unconservative (N₁)₆₀.',
      'Artesian or perched conditions are not hydrostatic and need a measured piezometric profile.',
    ],
  },

  // ── Strength ──
  'ucs.qu': {
    title: 'Unconfined compressive strength',
    category: 'strength',
    equation: String.raw`q_u = \frac{P}{A_c}, \qquad A_c = \frac{A_0}{1 - \varepsilon}`,
    unit: 'kPa',
    symbols: {
      q_u: 'unconfined compressive strength, kPa',
      P: 'axial load at failure, N',
      A_c: 'corrected cross-sectional area, mm²',
      A_0: 'initial area, mm²',
      '\\varepsilon': 'axial strain at failure',
    },
    standard: 'd2166',
    assumptions: ['The specimen deforms as a right cylinder (area correction).'],
  },

  'ucs.undrained-strength': {
    title: 'Undrained shear strength from UCS',
    category: 'strength',
    equation: String.raw`c_u = \frac{q_u}{2}`,
    unit: 'kPa',
    symbols: { c_u: 'undrained shear strength, kPa', q_u: 'unconfined compressive strength, kPa' },
    standard: 'd2166',
    assumptions: ['Saturated cohesive soil under φ = 0 conditions (total-stress Mohr circle through the origin).'],
    limitations: [
      'Not valid for fissured, partly saturated or granular soils — the assumption φ = 0 fails and c_u comes out unconservative.',
      'A UCS on a disturbed specimen underestimates in-situ strength; sample quality governs.',
    ],
  },

  'directshear.envelope': {
    title: 'Mohr–Coulomb failure envelope',
    category: 'strength',
    equation: String.raw`\tau_f = c' + \sigma'_n \tan\phi'`,
    unit: 'kPa',
    symbols: {
      '\\tau_f': 'shear stress at failure, kPa',
      "c'": 'effective cohesion intercept, kPa',
      "\\sigma'_n": 'effective normal stress, kPa',
      "\\phi'": 'effective friction angle, degrees',
    },
    standard: 'd3080',
    assumptions: ['Failure envelope is linear over the tested stress range.'],
    limitations: [
      'c′ and φ′ are only valid over the normal stresses tested — extrapolating to a much higher footing stress overestimates strength.',
      'A negative fitted cohesion is a fitting artefact, not a soil property; report c′ = 0.',
    ],
  },

  // ── Consolidation ──
  'consolidation.void-ratio': {
    title: 'Void ratio from height change',
    category: 'consolidation',
    equation: String.raw`e = e_0 - \frac{\Delta H}{H_s}, \qquad H_s = \frac{M_s}{G_s \rho_w A}`,
    unit: '—',
    symbols: {
      e: 'void ratio at the load step',
      e_0: 'initial void ratio',
      '\\Delta H': 'cumulative compression, mm',
      H_s: 'equivalent height of solids, mm',
      M_s: 'dry mass of the specimen, g',
      G_s: 'specific gravity of solids',
      A: 'specimen area, mm²',
    },
    standard: 'd2435',
  },

  'consolidation.cc': {
    title: 'Compression index',
    category: 'consolidation',
    equation: String.raw`C_c = \frac{e_1 - e_2}{\log_{10}(\sigma'_2 / \sigma'_1)}`,
    unit: '—',
    symbols: {
      C_c: 'compression index (virgin branch)',
      e_1: 'void ratio at σ′₁',
      e_2: 'void ratio at σ′₂',
      "\\sigma'": 'effective vertical stress, kPa',
    },
    standard: 'd2435',
    limitations: ['Taken on the straight virgin portion only — points below σ′_p give C_r, not C_c.'],
  },

  // ── Correlations (never presented as measurements) ──
  'correlation.phi-from-n60': {
    title: 'Friction angle from corrected SPT',
    category: 'correlation',
    equation: String.raw`\phi' = \sqrt{20\,(N_1)_{60}} + 20`,
    unit: 'degrees',
    symbols: { "\\phi'": 'effective friction angle, degrees', '(N_1)_{60}': 'corrected blow count, blows/300 mm' },
    reference: 'Hatanaka & Uchida (1996)',
    limitations: [
      'Clean sands only. Applying it to silty or clayey soil is outside the data it was fitted to.',
      'Scatter of roughly ±3° — a correlated φ′ should never be quoted to a decimal place.',
    ],
  },

  'correlation.dr-from-n60': {
    title: 'Relative density from corrected SPT',
    category: 'correlation',
    equation: String.raw`D_r = \sqrt{\frac{(N_1)_{60}}{60}} \times 100`,
    unit: '%',
    symbols: { D_r: 'relative density, %', '(N_1)_{60}': 'corrected blow count, blows/300 mm' },
    reference: 'Skempton (1986), normally consolidated clean sand',
    limitations: [
      'Fitted to normally consolidated clean sand; overconsolidated or aged deposits read high.',
    ],
  },

  'correlation.cu-from-n60': {
    title: 'Undrained shear strength from SPT',
    category: 'correlation',
    equation: String.raw`c_u \approx 6\,N_{60}`,
    unit: 'kPa',
    symbols: { c_u: 'undrained shear strength, kPa', 'N_{60}': 'energy-corrected blow count, blows/300 mm' },
    reference: 'Stroud (1974), for plasticity index around 20–30%',
    limitations: [
      'The coefficient ranges from about 4 to 6 with plasticity — this is an order-of-magnitude estimate.',
      'SPT in soft clay is a poor test outright; prefer a vane, a UCS or a triaxial where one exists.',
    ],
  },

  'correlation.cc-from-ll': {
    title: 'Compression index from liquid limit',
    category: 'correlation',
    equation: String.raw`C_c = 0.009\,(LL - 10)`,
    unit: '—',
    symbols: { C_c: 'compression index', LL: 'liquid limit, %' },
    reference: 'Terzaghi & Peck (1967), normally consolidated clays of moderate sensitivity',
    limitations: [
      'Terzaghi & Peck quote roughly ±30% — settlement from a correlated C_c carries that error straight through.',
      'Not applicable to organic, sensitive or overconsolidated clays.',
    ],
  },
} as const satisfies Record<string, CalcEntry>

export type CalcId = keyof typeof CALCULATIONS

export const calc = (id: CalcId): CalcEntry => CALCULATIONS[id]

export const isCalcId = (v: unknown): v is CalcId =>
  typeof v === 'string' && v in CALCULATIONS

export const calculationsIn = (category: CalcCategory): CalcId[] =>
  (Object.keys(CALCULATIONS) as CalcId[]).filter((id) => calc(id).category === category)

/**
 * Every limitation carried by a set of calculations, de-duplicated. A report
 * that used three correlations should print all three sets of caveats, once
 * each, rather than burying them in the modules that applied them.
 */
export function limitationsOf(ids: CalcId[]): string[] {
  const out = new Set<string>()
  for (const id of ids) for (const l of calc(id).limitations ?? []) out.add(l)
  return [...out]
}

/** Every assumption carried by a set of calculations, de-duplicated. */
export function assumptionsOf(ids: CalcId[]): string[] {
  const out = new Set<string>()
  for (const id of ids) for (const a of calc(id).assumptions ?? []) out.add(a)
  return [...out]
}
