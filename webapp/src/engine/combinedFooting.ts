// ─────────────────────────────────────────────────────────────────────────
// Combined footing (2 columns) — RIGID (conventional) method.
// Ports the vanilla engine: CRF/CTF geometry that always covers both columns,
// the column-containment widening, the equivalent uniformly-varying line load
// (wu1 → wu2), closed-form V(x)/M(x) with columns as line loads, the punching
// + one-way thickness, and longitudinal + transverse flexure.
// The Winkler "flexible" method is a separate follow-up.
// ─────────────────────────────────────────────────────────────────────────
import { punchingDepth } from './shear';
import { flexuralSteel, barLayout } from './flexure';

export interface CombinedFootingInput {
  col1Width: number;     // mm (square)
  col2Width: number;     // mm
  spacing: number;       // m, centre-to-centre
  dl1: number; ll1: number;  // kN
  dl2: number; ll2: number;  // kN
  leftRestrict: boolean;
  rightRestrict: boolean;
  leftOverhang: number;  // mm (used only when leftRestrict)
  rightOverhang: number; // mm
  fc: number; fy: number;
  qAllow: number; gammaSoil: number; gammaConc: number; surcharge: number;
  H: number;             // m
  barDia: number;        // mm
  cover: number;         // mm
}

export interface FlexSection {
  label: string; x: number; Mu: number; b: number;
  As: number; bars: number; spacing: number; top: boolean;
}
export interface TransverseStrip {
  label: string; By: number; arm: number; MuPerM: number; AsPerM: number; spacing: number;
}
export interface CombinedFootingResult {
  shape: 'Rectangular (CRF)' | 'Trapezoidal (CTF)';
  Bx: number; By: number; By1: number; By2: number;
  x1: number; x2: number;
  Pa: number; Pu: number; Pu1: number; Pu2: number; qNet: number;
  wu1: number; wu2: number;
  widened: boolean;
  xPeak: number; mPeak: number;
  dPunch: number; dBeam: number; Dc: number;
  longSections: FlexSection[];
  transverse: TransverseStrip[];
  /** Sampled along x for diagrams. */
  samples: { x: number[]; V: number[]; M: number[]; w: number[] };
}

const roundUp = (v: number, step: number) => Math.ceil(v / step) * step;

// A column carried as a uniform line load over its width cw — shear/moment to
// the LEFT of x (cw = 0 → point load).
function colV(x: number, xc: number, cw: number, P: number): number {
  const xL = xc - cw / 2, xR = xc + cw / 2;
  if (x <= xL) return 0;
  if (x >= xR) return P;
  return (P * (x - xL)) / cw;
}
function colM(x: number, xc: number, cw: number, P: number): number {
  const xL = xc - cw / 2, xR = xc + cw / 2;
  if (x <= xL) return 0;
  if (x >= xR) return P * (x - xc);
  return (P * (x - xL) * (x - xL)) / (2 * cw);
}

export function designCombinedFooting(i: CombinedFootingInput): CombinedFootingResult {
  const cx1m = i.col1Width / 1000, cx2m = i.col2Width / 1000;
  const sf = i.spacing;
  const leftOh = i.leftRestrict ? i.leftOverhang / 1000 : 0;
  const rightOh = i.rightRestrict ? i.rightOverhang / 1000 : 0;

  // ── Loads ──
  const Pa1 = i.dl1 + i.ll1, Pa2 = i.dl2 + i.ll2, Pa = Pa1 + Pa2;
  const Pu1 = Math.max(1.4 * i.dl1, 1.2 * i.dl1 + 1.6 * i.ll1);
  const Pu2 = Math.max(1.4 * i.dl2, 1.2 * i.dl2 + 1.6 * i.ll2);
  const Pu = Pu1 + Pu2;

  // ── Net bearing (trial Dc = 0.25 m) ──
  const Dc0 = 0.25;
  const qNet = i.qAllow - i.gammaSoil * (i.H - Dc0) - i.gammaConc * Dc0 - i.surcharge;

  // ── Geometry (CRF covers both columns; CTF fixed by geometry) ──
  const bothRestricted = i.leftRestrict && i.rightRestrict;
  let shape: CombinedFootingResult['shape'];
  let Bx = 0, By = 0, By1 = 0, By2 = 0, x1 = 0, x2 = 0;
  if (!bothRestricted) {
    shape = 'Rectangular (CRF)';
    const eRes = (Pa2 * sf) / Pa;
    const aL = eRes + cx1m / 2, aR = (sf - eRes) + cx2m / 2;
    if (i.leftRestrict && !i.rightRestrict) {
      x1 = leftOh + cx1m / 2;
      Bx = roundUp(Math.max(2 * (x1 + eRes), x1 + sf + cx2m / 2), 0.1);
      x2 = x1 + sf;
    } else if (i.rightRestrict && !i.leftRestrict) {
      const x2FromR = rightOh + cx2m / 2;
      Bx = roundUp(Math.max(2 * (x2FromR + (sf - eRes)), x2FromR + sf + cx1m / 2), 0.1);
      x2 = Bx - x2FromR; x1 = x2 - sf;
    } else {
      Bx = roundUp(2 * Math.max(aL, aR), 0.1);
      x1 = Bx / 2 - eRes; x2 = x1 + sf;
    }
    By = roundUp(Pa / (qNet * Bx), 0.1); By1 = By; By2 = By;
  } else {
    shape = 'Trapezoidal (CTF)';
    Bx = +(sf + cx1m / 2 + cx2m / 2 + leftOh + rightOh).toFixed(6);
    x1 = leftOh + cx1m / 2; x2 = x1 + sf;
    const xbar = (Pa1 * x1 + Pa2 * x2) / Pa;
    const A = Pa / qNet, Bysum = (2 * A) / Bx;
    const by2 = (xbar * Bysum) / (Bx / 3) - Bysum;
    By2 = roundUp(by2, 0.1); By1 = roundUp(Bysum - by2, 0.1); By = (By1 + By2) / 2;
  }

  // ── Containment: widen if a column is wider than the slab beneath it ──
  let widened = false;
  {
    const PROJ = 0.075;
    const ByAtX = (x: number) => (shape[0] === 'R' ? By : By1 + ((By2 - By1) * x) / Bx);
    const cols = [{ x: x1, c: cx1m }, { x: x2, c: cx2m }];
    const wUnder = (cl: { x: number; c: number }) => Math.min(ByAtX(cl.x - cl.c / 2), ByAtX(cl.x + cl.c / 2));
    if (cols.some((cl) => wUnder(cl) < cl.c - 1e-9)) {
      widened = true;
      for (let g = 0; g < 400; g++) {
        let viol = false;
        for (const cl of cols) {
          if (wUnder(cl) < cl.c + 2 * PROJ - 1e-6) {
            viol = true;
            if (shape[0] === 'R') { By += 0.05; By1 = By; By2 = By; }
            else if (cl.x < Bx / 2) By1 += 0.05; else By2 += 0.05;
          }
        }
        if (!viol) break;
      }
      By1 = roundUp(By1, 0.1); By2 = roundUp(By2, 0.1); By = (By1 + By2) / 2;
    }
  }

  // ── Equivalent uniformly-varying line load + closed-form V, M ──
  const wsum = (2 * Pu) / Bx;
  const w1p2 = (6 * (Pu1 * x1 + Pu2 * x2)) / (Bx * Bx);
  const wu2 = w1p2 - wsum, wu1 = wsum - wu2, alpha = (wu2 - wu1) / Bx;
  const Vat = (x: number) => (wu1 * x + (alpha * x * x) / 2) - colV(x, x1, cx1m, Pu1) - colV(x, x2, cx2m, Pu2);
  const Mat = (x: number) => (wu1 * x * x / 2 + (alpha * x * x * x) / 6) - colM(x, x1, cx1m, Pu1) - colM(x, x2, cx2m, Pu2);

  let xPeak = x1, lo = x1, hi = x2;
  for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2; if (Vat(mid) < 0) lo = mid; else hi = mid; xPeak = mid; }
  const mPeak = Mat(xPeak);

  const N = 200;
  const samples = { x: [] as number[], V: [] as number[], M: [] as number[], w: [] as number[] };
  for (let k = 0; k <= N; k++) {
    const x = (Bx * k) / N;
    samples.x.push(x); samples.V.push(Vat(x)); samples.M.push(Mat(x)); samples.w.push(wu1 + alpha * x);
  }

  // ── Thickness: punching (critical column) + one-way (beam) shear ──
  const Pcrit = Math.max(Pu1, Pu2);
  const cCrit = Pu2 >= Pu1 ? i.col2Width : i.col1Width;
  const Afoot = shape[0] === 'R' ? Bx * By : ((By1 + By2) * Bx) / 2;
  const qu = Pu / Afoot;
  const dPunch = punchingDepth({ Pu: Pcrit, qu, c: cCrit, fc: i.fc, position: 'interior' });
  const Dc_punch = roundUp(dPunch + i.cover + i.barDia, 25);

  const dBeam_m = (Dc_punch + 25 - i.cover - i.barDia) / 1000;
  const ByAt = (x: number) => (shape[0] === 'R' ? By : By1 + ((By2 - By1) * x) / Bx);
  const xface = Pu2 >= Pu1 ? x2 - cx2m / 2 - dBeam_m : x1 + cx1m / 2 + dBeam_m;
  const VuBeam = Math.abs(Vat(xface));
  const ByBeam = ByAt(xface);
  const dB = (VuBeam * 1000) / (0.75 * (1 / 6) * Math.sqrt(i.fc) * (ByBeam * 1000));
  const Dc_beam = roundUp(dB + i.cover + i.barDia, 25);
  const Dc = Math.max(Dc_punch, Dc_beam);

  // ── Longitudinal flexure at the critical sections ──
  const dFlex = Dc - i.cover - i.barDia / 2;
  const mkSection = (label: string, x: number): FlexSection => {
    const Mu = Math.abs(Mat(x)), b = ByAt(x) * 1000;
    const flex = flexuralSteel({ Mu, b, d: dFlex, fc: i.fc, fy: i.fy });
    const layout = barLayout({ As: flex.As, db: i.barDia, b, cover: i.cover });
    return { label, x, Mu, b, As: flex.As, bars: layout.n, spacing: layout.spacing, top: Mat(x) < 0 };
  };
  const longSections = [
    mkSection('Max +M (interior, top)', xPeak),
    mkSection('Col 1 inner face', x1 + cx1m / 2),
    mkSection('Col 2 inner face', x2 - cx2m / 2),
  ];

  // ── Transverse flexure under each column (per metre) ──
  const Ab = (Math.PI / 4) * i.barDia * i.barDia;
  const dT = Dc - i.cover - 1.5 * i.barDia;
  const mkTrans = (label: string, Pcol: number, Byloc: number, cColm: number): TransverseStrip => {
    const arm = (Byloc - cColm) / 2;
    const qStrip = Pcol / (Bx * Byloc);
    const MuPerM = (qStrip * arm * arm) / 2;
    const flex = flexuralSteel({ Mu: MuPerM, b: 1000, d: dT, fc: i.fc, fy: i.fy });
    return { label, By: Byloc, arm, MuPerM, AsPerM: flex.As, spacing: (Ab / flex.As) * 1000 };
  };
  const transverse = [
    mkTrans('Col 1 strip', Pu1, i.leftRestrict ? By1 : By, cx1m),
    mkTrans('Col 2 strip', Pu2, i.rightRestrict ? By2 : By, cx2m),
  ];

  return {
    shape, Bx, By, By1, By2, x1, x2, Pa, Pu, Pu1, Pu2, qNet, wu1, wu2, widened,
    xPeak, mPeak, dPunch, dBeam: dB, Dc, longSections, transverse, samples,
  };
}
