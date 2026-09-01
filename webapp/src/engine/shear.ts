// ─────────────────────────────────────────────────────────────────────────
// Shear — two-way (punching) and one-way (beam) capacity + required depth.
// NSCP 2015 / ACI 318-14. Capacities returned in kN.
// Convention: column sizes & d in mm, plan dims in m, qu in kPa.
// ─────────────────────────────────────────────────────────────────────────

export type ColumnPosition = 'interior' | 'edge' | 'corner';
const ALPHA_S: Record<ColumnPosition, number> = { interior: 40, edge: 30, corner: 20 };

const PHI_SHEAR = 0.75;

/**
 * Two-way (punching) shear strength Vc, kN — the minimum of the three
 * ACI 318-14 §22.6.5.2 expressions.
 * @param fc       f′c, MPa
 * @param bo       critical perimeter, mm
 * @param d        effective depth, mm
 * @param betaC    long/short side ratio of the loaded area (1 for square)
 * @param position interior / edge / corner (sets α_s)
 * @param lambda   lightweight factor λ (default 1)
 */
export function twoWayVc(params: {
  fc: number; bo: number; d: number; betaC?: number; position?: ColumnPosition; lambda?: number;
}): number {
  const { fc, bo, d } = params;
  const betaC = params.betaC ?? 1;
  const lambda = params.lambda ?? 1;
  const position = params.position ?? 'interior';
  const base = (lambda * Math.sqrt(fc) * bo * d) / 1000; // √fc·bo·d → kN (N/mm²·mm² = N, ÷1000)
  const vc1 = (1 / 3) * base;
  const vc2 = (1 / 6) * (1 + 2 / betaC) * base;
  const vc3 = (1 / 12) * (2 + (ALPHA_S[position] * d) / bo) * base;
  return Math.min(vc1, vc2, vc3);
}

/**
 * The §22.6.4.1 critical section at d/2 from the column faces — its plan
 * extent, its enclosed area, and the length of it that actually resists.
 *
 * TRUNCATED AT A FREE EDGE, which is the whole reason αs has three values.
 * An interior column is wrapped on four sides; an edge column's section stops
 * at the slab edge and only three sides resist; a corner column keeps two.
 * `punchingDepth` used the interior perimeter for all three and varied αs
 * alone, so choosing "edge" or "corner" bought a small penalty on one of the
 * three Vc expressions while quietly keeping a perimeter that is 44% (edge)
 * or 126% (corner) longer than the section has — unconservative, and in the
 * common case αs is not governing so the choice changed nothing at all.
 *
 * Convention: for `edge` the free edge is perpendicular to x, so the section
 * loses its extension in +x; for `corner` it loses +x and +y. The column face
 * is taken flush with the free edge, which is what "at the edge" means for a
 * pad footing.
 *
 * Cross-check on c = 500, d = 150: interior 4(c+d) = 2600; the edge section
 * is that less one whole side (c+d = 650) and less d/2 off each of the two
 * remaining perpendicular sides (150) → 1800, which is what the formula gives.
 *
 * Lengths mm; `Ao` in mm².
 */
export function criticalSection(
  cx: number, cy: number, d: number, position: ColumnPosition = 'interior',
): { ax: number; ay: number; bo: number; Ao: number } {
  // Extent of the section in each direction — a free edge removes one d/2.
  const ax = position === 'interior' ? cx + d : cx + d / 2
  const ay = position === 'corner' ? cy + d / 2 : cy + d
  const bo = position === 'interior' ? 2 * (ax + ay)
    : position === 'edge' ? ay + 2 * ax        // three sides: the far one, and both flanks
    : ax + ay                                  // corner: two sides
  return { ax, ay, bo, Ao: ax * ay }
}

/**
 * Smallest effective depth d (mm) that satisfies punching shear for a
 * rectangular column cx × cy (mm; cy defaults to cx → square) under factored
 * column load Pu (kN) on net pressure qu (kPa).
 */
export function punchingDepth(params: {
  Pu: number; qu: number; c: number; cy?: number; fc: number;
  position?: ColumnPosition; lambda?: number; phi?: number;
}): number {
  const phi = params.phi ?? PHI_SHEAR;
  const cx = params.c, cy = params.cy ?? params.c;
  const betaC = Math.max(cx, cy) / Math.min(cx, cy);
  for (let d = 50; d <= 3000; d += 1) {
    const cs = criticalSection(cx, cy, d, params.position);
    const Vu = params.Pu - params.qu * cs.Ao * 1e-6;   // kN (Ao mm² → m²)
    const cap = phi * twoWayVc({
      fc: params.fc, bo: cs.bo, d, betaC,
      position: params.position, lambda: params.lambda,
    });
    if (cap >= Vu) return d;
  }
  return 3000;
}

/** One-way (beam) shear strength Vc = (1/6)λ√fc·b·d, kN (b, d in mm). */
export function oneWayVc(params: { fc: number; b: number; d: number; lambda?: number }): number {
  const lambda = params.lambda ?? 1;
  return ((1 / 6) * lambda * Math.sqrt(params.fc) * params.b * params.d) / 1000;
}

/**
 * Smallest effective depth d (mm) that satisfies one-way shear. Critical
 * section is d from the column face; Vu = qu·B·arm, arm = (B−c)/2 − d.
 * @param B plan width carrying the shear, m
 * @param c column width, m
 */
export function oneWayShearDepth(params: {
  qu: number; B: number; c: number; fc: number; lambda?: number; phi?: number;
}): number {
  const phi = params.phi ?? PHI_SHEAR;
  for (let d = 50; d <= 3000; d += 1) {
    const arm = (params.B - params.c) / 2 - d / 1000;     // m
    const Vu = params.qu * params.B * Math.max(0, arm);   // kN
    const cap = phi * oneWayVc({ fc: params.fc, b: params.B * 1000, d, lambda: params.lambda });
    if (cap >= Vu) return d;
  }
  return 3000;
}
