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
  /** True when ρ_min governed. */
  usedMin: boolean;
}

/** Minimum flexural ratio ρ_min = max(1.4/fy, √f′c/(4 fy)). */
export function rhoMin(fc: number, fy: number): number {
  return Math.max(1.4 / fy, Math.sqrt(fc) / (4 * fy));
}

export function flexuralSteel(params: {
  Mu: number; b: number; d: number; fc: number; fy: number; phi?: number;
}): FlexuralSteel {
  const { Mu, b, d, fc, fy } = params;
  const phi = params.phi ?? PHI_FLEXURE;
  const Rn = (Mu * 1e6) / (phi * b * d * d);                       // MPa
  const rhoCalc = (0.85 * fc / fy) * (1 - Math.sqrt(Math.max(0, 1 - (2 * Rn) / (0.85 * fc))));
  const rMin = rhoMin(fc, fy);
  const usedMin = rhoCalc < rMin;
  const rho = usedMin ? rMin : rhoCalc;
  return { rho, As: rho * b * d, usedMin };
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
