// ─────────────────────────────────────────────────────────────────────────
// Flexure — required steel from the factored moment, and a bar layout.
// NSCP 2015 / ACI 318-14 (tension-controlled, φ = 0.90).
// Convention: Mu in kN·m, b & d & db & cover in mm, fc & fy in MPa.
// ─────────────────────────────────────────────────────────────────────────

const PHI_FLEXURE = 0.90;

export interface FlexuralSteel {
  /** Adopted reinforcement ratio (≥ ρ_min). */
  rho: number;
  /** Required steel area, mm². */
  As: number;
  /** True when a minimum governed rather than the moment. */
  usedMin: boolean;
  /** Which minimum was the larger — meaningful whether or not it governed. */
  minGoverning: 'beam' | 'slab';
  /** The two candidates, mm², so a solution sheet can show the comparison. */
  asMinBeam: number;
  asMinSlab: number;
}

/** Minimum flexural ratio ρ_min = max(1.4/fy, √f′c/(4 fy)) — §9.6.1.2, BEAMS. */
export function rhoMin(fc: number, fy: number): number {
  return Math.max(1.4 / fy, Math.sqrt(fc) / (4 * fy));
}

/**
 * Shrinkage-and-temperature ratio — NSCP 2015 Table 424.4.3.2 / ACI 318-14
 * Table 24.4.3.2. This is the minimum a SLAB carries, and §13.3.2.1 sends
 * footings here (via §7.6.1.1 / §8.6.1.1) rather than to the beam rule.
 *
 * The table is banded on fy, and 0.0018 is the Grade-420 row, not a universal
 * value: below 420 MPa it is 0.0020. Applying 0.0018 to Grade 415 — which is
 * what "0.0018·A_g" usually means in practice — is 10% light.
 */
export function rhoShrinkage(fy: number): number {
  if (fy < 420) return 0.0020;
  return Math.max((0.0018 * 420) / fy, 0.0014);
}

/**
 * Which minimum a section is held to.
 *
 * `beam`  §9.6.1.2, on b·d — the flexural minimum.
 * `slab`  §24.4.3.2, on the GROSS area b·h — where §13.3.2.1 points footings.
 * `max`   the greater of the two, which is what most offices detail to and
 *         what this engine defaults to: the clause a footing is sent to is
 *         genuinely contested, and taking the larger is the reading that
 *         cannot be wrong in the unsafe direction.
 */
export type AsMinBasis = 'max' | 'beam' | 'slab';

/**
 * Minimum steel, mm². `h` is needed for the slab basis (it acts on the gross
 * section); omit it and only the beam rule can apply.
 */
export function flexuralAsMin(params: {
  fc: number; fy: number; b: number; d: number; h?: number; basis?: AsMinBasis;
}): { As: number; governs: 'beam' | 'slab'; beam: number; slab: number } {
  const { fc, fy, b, d } = params;
  const basis = params.basis ?? 'max';
  const beam = rhoMin(fc, fy) * b * d;
  const slab = params.h && params.h > 0 ? rhoShrinkage(fy) * b * params.h : 0;
  if (basis === 'beam') return { As: beam, governs: 'beam', beam, slab };
  if (basis === 'slab') return { As: slab, governs: 'slab', beam, slab };
  return slab > beam
    ? { As: slab, governs: 'slab', beam, slab }
    : { As: beam, governs: 'beam', beam, slab };
}

export function flexuralSteel(params: {
  Mu: number; b: number; d: number; fc: number; fy: number; phi?: number;
  /** Gross depth, mm — enables the §24.4.3.2 slab minimum. */
  h?: number;
  /** Which minimum to hold the section to. Default `max`. */
  asMinBasis?: AsMinBasis;
}): FlexuralSteel {
  const { Mu, b, d, fc, fy } = params;
  const phi = params.phi ?? PHI_FLEXURE;
  const Rn = (Mu * 1e6) / (phi * b * d * d);                       // MPa
  const rhoCalc = (0.85 * fc / fy) * (1 - Math.sqrt(Math.max(0, 1 - (2 * Rn) / (0.85 * fc))));
  const AsCalc = rhoCalc * b * d;
  const min = flexuralAsMin({ fc, fy, b, d, h: params.h, basis: params.asMinBasis });
  const usedMin = AsCalc < min.As;
  const As = usedMin ? min.As : AsCalc;
  return { rho: As / (b * d), As, usedMin, minGoverning: min.governs, asMinBeam: min.beam, asMinSlab: min.slab };
}

export interface BarLayout {
  /** Number of bars (≥ 2). */
  n: number;
  /** Centre-to-centre spacing, mm. */
  spacing: number;
}

/**
 * Bar count + spacing for a required As across width b, using ⌀db bars and
 * clear cover.
 *
 * Bars sit a cover in from each edge, so the outermost bar CENTRES are
 * (b − 2·cover − db) apart and there are (n − 1) gaps between them. The
 * earlier form subtracted n·db, which is the CLEAR gap between bar faces —
 * one diameter narrower than the centre-to-centre figure this returns and
 * every drawing prints.
 *
 * For a slab or footing mat use `matLayout` instead: it applies the maximum
 * spacing clause, which this does not.
 */
export function barLayout(params: { As: number; db: number; b: number; cover: number }): BarLayout {
  const Ab = (Math.PI / 4) * params.db * params.db;
  const n = Math.max(2, Math.ceil(params.As / Ab));
  const spacing = n > 1 ? (params.b - 2 * params.cover - params.db) / (n - 1) : params.b;
  return { n, spacing };
}

// ── Mat rules ─────────────────────────────────────────────────────────────
//
// A slab or footing mat is not a beam cage, and the two differ in the rule
// that sets the MINIMUM number of bars.
//
// In a beam the floor is a count: §9.7.2.1, never fewer than two. In a mat it
// is a spacing — §7.7.2.3 for one-way slabs and footings, §8.7.2.2 for
// two-way slabs — and a count floor of two says nothing at all. Applying the
// beam rule to a mat is how a 0.95 m footing came to be detailed 2⌀32 at
// 736 mm centres and reported as adequate: the area was satisfied, and
// nothing else was being asked.
//
// These live here, next to `barLayout`, so there is one home for the rule.

/** Which maximum-spacing clause governs a mat. */
export type MatKind = 'one-way' | 'two-way';

/** §7.7.2.3 (one-way slabs, footings) or §8.7.2.2 (two-way slabs), mm. */
export function maxBarSpacing(kind: MatKind, h: number): number {
  return Math.min(kind === 'one-way' ? 3 * h : 2 * h, 450);
}

/**
 * β1 per ACI 318-14 Table 22.2.2.4.3.
 *
 * The SI table is not continuous and must not be written as one: the sloped
 * row runs 28 < f′c < 55, and the last row is a flat 0.65 for f′c ≥ 55. The
 * slope evaluated at 55 gives 0.657, so `max(0.65, slope)` returns the wrong
 * branch.
 */
export function beta1(fc: number): number {
  if (fc <= 28) return 0.85;
  if (fc >= 55) return 0.65;
  return 0.85 - 0.05 * (fc - 28) / 7;
}

/**
 * ρ at the tension-controlled limit — εt = 0.005, so c/d = 3/8 (ACI 318-14
 * §21.2.2 with §22.2.2.1's εcu = 0.003). Past this, φ = 0.90 does not apply.
 */
export function rhoTensionControlled(fc: number, fy: number): number {
  return 0.85 * beta1(fc) * (fc / fy) * (3 / 8);
}

/** §25.2.1 minimum clear spacing — max(db, 25 mm, 4/3·d_agg), mm. */
export function minClearSpacing(db: number, aggregate = 20): number {
  return Math.max(db, 25, (4 / 3) * aggregate);
}

export interface MatBarLayout extends BarLayout {
  /** Clear gap between bar faces, mm — what §25.2.1 limits. */
  clear: number;
  /** The maximum-spacing limit applied, mm. */
  sMax: number;
  /** True when §7.7.2.3/§8.7.2.2 added bars beyond the area requirement. */
  spacingGoverned: boolean;
  /** §25.2.1 satisfied. False means the bars do not fit across this width. */
  clearOK: boolean;
}

/**
 * Bar count + centre-to-centre spacing for a MAT, with the maximum-spacing
 * clause folded into the count.
 *
 * `h` is the total thickness, which is what the clause is written against.
 */
export function matLayout(params: {
  As: number; db: number; b: number; cover: number; h: number;
  kind?: MatKind; aggregate?: number;
}): MatBarLayout {
  const { As, db, b, cover, h } = params;
  const kind = params.kind ?? 'one-way';
  const Ab = (Math.PI / 4) * db * db;
  const sMax = maxBarSpacing(kind, h);
  // Span between the outermost bar centres — the length the spacing divides.
  const run = Math.max(0, b - 2 * cover - db);
  const nArea = Math.ceil(As / Ab);
  const nSpacing = Math.ceil(run / sMax) + 1;
  const n = Math.max(2, nArea, nSpacing);
  const spacing = n > 1 ? run / (n - 1) : b;
  const clear = spacing - db;
  return {
    n, spacing, clear, sMax,
    spacingGoverned: nSpacing > nArea,
    clearOK: clear >= minClearSpacing(db, params.aggregate) - 1e-9,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// ANALYSIS — the capacity a section HAS, which is not the design's inverse.
//
// Everything above answers "what steel does this moment need?", and the answer
// is bounded: ρ is capped at the tension-controlled limit, so the steel yields
// by construction and As·fy is exact. Analysis asks the opposite question —
// "what can this steel carry?" — with As handed in, and there is nothing to
// stop it being over-reinforced. There the steel does NOT reach fy, and
// assuming it does overstates the capacity, in the unsafe direction.
//
// Both questions used to be answered with As·fy. On a sweep of ~9800 designs
// the engine ACCEPTS, 68 of them (0.7%) sit below yield — the worst a 200×300
// with f'c 21, fy 550 and ⌀32 bars, where §9.6.1.2's two-bar minimum alone
// puts ρ at 0.034: capacity reported 87.7 kN·m against a true 51.7, and φ
// taken as 0.90 where εt makes it 0.65.
// ─────────────────────────────────────────────────────────────────────────

/** Steel modulus and the §22.2.2.1 extreme-fibre concrete strain. */
export const ES_STEEL = 200000
export const ECU = 0.003

/**
 * Stress in tension steel whose centroid is at depth `d`, for a neutral axis
 * at `c` — similar triangles on the linear strain diagram, capped at yield.
 */
export function steelStress(c: number, d: number, fy: number): number {
  if (!(c > 0)) return fy
  return Math.min(fy, (ES_STEEL * ECU * (d - c)) / c)
}

/** §21.2.2 strength-reduction factor from the strain in the extreme layer. */
export function phiFromStrain(et: number, fy: number): number {
  const ety = fy / ES_STEEL
  if (et >= 0.005) return 0.90
  if (et <= ety) return 0.65
  return 0.65 + (0.25 * (et - ety)) / (0.005 - ety)
}

export interface RectCapacity {
  /** Equivalent stress-block depth and neutral axis, mm. */
  a: number; c: number
  /** Steel stress at equilibrium, MPa, and whether it reached fy. */
  fs: number; fsYields: boolean
  /** Strain in the EXTREME tension layer, and the φ it gives. */
  et: number; phi: number
  /** Nominal and design flexural strength, kN·m. */
  Mn: number; phiMn: number
}

/**
 * Capacity of a singly-reinforced rectangular section, solved rather than
 * assumed.
 *
 * Equilibrium is C(c) = T(c) with C = 0.85f'c·b·β1·c rising in c and
 * T = As·min(fy, Es·εcu(d − c)/c) falling, so there is exactly one root.
 * While the steel yields that root is the familiar a = As·fy/(0.85f'c·b);
 * when it does not, substituting fs back in leaves a quadratic
 *
 *     0.85f'c·b·β1·c² + Es·εcu·As·c − Es·εcu·As·d = 0
 *
 * whose positive root always exists (A > 0, D > 0) and is strictly less than
 * d, so the steel is always in tension. Exact in one step — no iteration.
 *
 * `d` is the steel CENTROID, where the resultant acts; `dt` is the extreme
 * layer, where §21.2.2 measures εt. Pass dt = d for a single layer.
 *
 * Compression steel is not modelled: this is the singly-reinforced case. A
 * doubly-reinforced section holds its own neutral axis and must not be put
 * through here.
 */
export function rectCapacity(
  b: number, d: number, dt: number, As: number, fc: number, fy: number,
): RectCapacity {
  if (!(As > 0 && b > 0 && d > 0)) {
    return { a: 0, c: 0, fs: fy, fsYields: true, et: 0.005, phi: 0.90, Mn: 0, phiMn: 0 }
  }
  const b1 = beta1(fc)
  let a = (As * fy) / (0.85 * fc * b)          // the yield assumption…
  let c = a / b1
  let fs = fy
  const fsYields = steelStress(c, d, fy) >= fy
  if (!fsYields) {                              // …and the correction when it fails
    const K = ES_STEEL * ECU * As
    const A = 0.85 * fc * b * b1
    c = (-K + Math.sqrt(K * K + 4 * A * K * d)) / (2 * A)
    a = b1 * c
    fs = steelStress(c, d, fy)
  }
  const Mn = (As * fs * (d - a / 2)) / 1e6
  const et = (ECU * (dt - c)) / c
  const phi = phiFromStrain(et, fy)
  return { a, c, fs, fsYields, et, phi, Mn, phiMn: phi * Mn }
}
