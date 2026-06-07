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
 * Smallest effective depth d (mm) that satisfies punching shear for a square
 * column c (mm) under factored column load Pu (kN) on net pressure qu (kPa).
 */
export function punchingDepth(params: {
  Pu: number; qu: number; c: number; fc: number;
  position?: ColumnPosition; lambda?: number; phi?: number;
}): number {
  const phi = params.phi ?? PHI_SHEAR;
  for (let d = 50; d <= 3000; d += 1) {
    const crit = params.c + d;                 // mm (square column → side of critical square)
    const Ao = crit * crit * 1e-6;             // m²
    const Vu = params.Pu - params.qu * Ao;      // kN
    const cap = phi * twoWayVc({
      fc: params.fc, bo: 4 * crit, d, betaC: 1,
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
