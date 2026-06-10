// ─────────────────────────────────────────────────────────────────────────
// Combined footing — FLEXIBLE (Winkler) method.
// Models the footing as a beam on an elastic foundation: the soil reacts in
// proportion to local settlement, q(x) = k_s·B·y(x), instead of the rigid
// method's assumed-linear pressure. Solved with 2-node Hermitian beam
// elements + the consistent Winkler foundation stiffness; the soil springs
// remove the free-free rigid-body modes, so no external supports are needed.
//
// Geometry (Bx, By, Dc, q_net) is taken from the rigid design so the two
// methods are compared on the same section; only the internal V(x)/M(x)
// distribution and the resulting longitudinal steel differ.
// ─────────────────────────────────────────────────────────────────────────
import { designCombinedFooting, type CombinedFootingInput, type FlexSection } from './combinedFooting';
import { flexuralSteel, barLayout } from './flexure';

export interface FlexibleCombinedInput extends CombinedFootingInput {
  /** Modulus of subgrade reaction, kN/m³. */
  ksubgrade: number;
  /** Mesh density (beam elements). Default 120. */
  nElements?: number;
}

export interface FlexibleCombinedResult {
  shape: 'Rectangular (CRF)' | 'Trapezoidal (CTF)';
  Bx: number; By: number;
  x1: number; x2: number;
  Pu: number; Pu1: number; Pu2: number; qNet: number;
  Dc: number;
  /** Concrete modulus Ec (MPa) and section EI (kN·m²). */
  Ec: number; EI: number;
  /** Characteristic length 1/β (m) and the dimensionless rigidity λL = β·Bx. */
  charLength: number; betaBx: number;
  /** Settlement extremes (mm, + downward). */
  yMax: number; yMin: number;
  /** Peak soil pressure under the footing and whether it stays within q_net. */
  qSoilMax: number; bearingOK: boolean;
  xPeak: number; mPeak: number;
  vMax: number;
  longSections: FlexSection[];
  /** Sampled along x: V (kN), M (kN·m), w soil line-load (kN/m), y settlement (mm). */
  samples: { x: number[]; V: number[]; M: number[]; w: number[]; y: number[] };
}

// ── Dense linear solver (Gaussian elimination, partial pivot) ──
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / d;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x;
}

// Hermite cubic shape functions on a unit element, scaled length L.
function hermite(xi: number, L: number): [number, number, number, number] {
  const x2 = xi * xi, x3 = x2 * xi;
  return [
    1 - 3 * x2 + 2 * x3,
    L * (xi - 2 * x2 + x3),
    3 * x2 - 2 * x3,
    L * (-x2 + x3),
  ];
}

export function designFlexibleCombinedFooting(i: FlexibleCombinedInput): FlexibleCombinedResult {
  // ── Reuse the rigid design for geometry + thickness ──
  const rigid = designCombinedFooting(i);
  const { Bx, By, x1, x2, Pu, Pu1, Pu2, qNet, Dc, shape } = rigid;

  // ── Section stiffness ──
  const Ec = 4700 * Math.sqrt(i.fc);             // MPa
  const EcK = Ec * 1000;                          // kPa = kN/m²
  const Iz = (By * Math.pow(Dc / 1000, 3)) / 12;  // m⁴
  const EI = EcK * Iz;                            // kN·m²
  const kf = i.ksubgrade * By;                    // foundation modulus per length, kN/m²
  const beta = Math.pow(kf / (4 * EI), 0.25);     // 1/m

  // ── Mesh: uniform, with nodes forced at the two column centres ──
  const nE = Math.max(40, i.nElements ?? 120);
  const set = new Set<number>();
  for (let k = 0; k <= nE; k++) set.add(+((Bx * k) / nE).toFixed(6));
  set.add(+x1.toFixed(6)); set.add(+x2.toFixed(6));
  const nodes = [...set].sort((a, b) => a - b);
  const nN = nodes.length, ndof = 2 * nN;

  // ── Assemble global stiffness ──
  const K: number[][] = Array.from({ length: ndof }, () => new Array(ndof).fill(0));
  for (let e = 0; e < nN - 1; e++) {
    const L = nodes[e + 1] - nodes[e];
    const L2 = L * L, L3 = L2 * L;
    const eb = EI / L3, ef = (kf * L) / 420;
    const Kb = [
      [12 * eb, 6 * L * eb, -12 * eb, 6 * L * eb],
      [6 * L * eb, 4 * L2 * eb, -6 * L * eb, 2 * L2 * eb],
      [-12 * eb, -6 * L * eb, 12 * eb, -6 * L * eb],
      [6 * L * eb, 2 * L2 * eb, -6 * L * eb, 4 * L2 * eb],
    ];
    const Kfo = [
      [156 * ef, 22 * L * ef, 54 * ef, -13 * L * ef],
      [22 * L * ef, 4 * L2 * ef, 13 * L * ef, -3 * L2 * ef],
      [54 * ef, 13 * L * ef, 156 * ef, -22 * L * ef],
      [-13 * L * ef, -3 * L2 * ef, -22 * L * ef, 4 * L2 * ef],
    ];
    const map = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) K[map[a]][map[b]] += Kb[a][b] + Kfo[a][b];
  }

  // ── Load vector: column loads as nodal point forces (downward +) ──
  const F = new Array(ndof).fill(0);
  const nodeAt = (x: number) => nodes.findIndex((nx) => Math.abs(nx - x) < 1e-6);
  F[2 * nodeAt(x1)] += Pu1;
  F[2 * nodeAt(x2)] += Pu2;

  const d = solveLinear(K, F);

  // ── Sample settlement & soil line-load via Hermite interpolation ──
  const N = 200;
  const xs: number[] = [], yLine: number[] = [], wLine: number[] = [];
  let seg = 0;
  for (let k = 0; k <= N; k++) {
    const x = (Bx * k) / N;
    while (seg < nN - 2 && nodes[seg + 1] < x) seg++;
    const L = nodes[seg + 1] - nodes[seg];
    const xi = L > 0 ? (x - nodes[seg]) / L : 0;
    const [n1, n2, n3, n4] = hermite(xi, L);
    const y = n1 * d[2 * seg] + n2 * d[2 * seg + 1] + n3 * d[2 * seg + 2] + n4 * d[2 * seg + 3];
    xs.push(x); yLine.push(y); wLine.push(kf * y);  // kN/m, upward reaction
  }

  // ── Integrate for V and M (matches the rigid sign convention) ──
  const V: number[] = [], M: number[] = [];
  let Vsoil = 0, Macc = 0, prevW = wLine[0], prevV = 0;
  for (let k = 0; k <= N; k++) {
    const x = xs[k];
    if (k > 0) { const dx = x - xs[k - 1]; Vsoil += ((wLine[k] + prevW) / 2) * dx; prevW = wLine[k]; }
    let v = Vsoil;
    if (x >= x1 - 1e-9) v -= Pu1;
    if (x >= x2 - 1e-9) v -= Pu2;
    if (k > 0) { const dx = x - xs[k - 1]; Macc += ((v + prevV) / 2) * dx; }
    prevV = v;
    V.push(v); M.push(Macc);
  }

  // ── Extremes ──
  let xPeak = 0, mPeak = 0, vMax = 0, yMax = 0, yMin = 0, qSoilMax = 0;
  M.forEach((m, k) => { if (Math.abs(m) > Math.abs(mPeak)) { mPeak = m; xPeak = xs[k]; } });
  V.forEach((v) => { if (Math.abs(v) > vMax) vMax = Math.abs(v); });
  yLine.forEach((y) => { if (y > yMax) yMax = y; if (y < yMin) yMin = y; });
  wLine.forEach((w) => { const q = w / By; if (q > qSoilMax) qSoilMax = q; });

  // ── Longitudinal flexure from the BEF moments ──
  const dFlex = Dc - i.cover - i.barDia / 2;
  const Mabs = (x: number) => {
    let lo = 0; for (let k = 0; k < xs.length; k++) if (xs[k] <= x) lo = k;
    return M[Math.min(lo, M.length - 1)];
  };
  const mkSection = (label: string, x: number): FlexSection => {
    const m = Mabs(x), Mu = Math.abs(m), b = By * 1000;
    const flex = flexuralSteel({ Mu, b, d: dFlex, fc: i.fc, fy: i.fy });
    const layout = barLayout({ As: flex.As, db: i.barDia, b, cover: i.cover });
    return { label, x, Mu, b, As: flex.As, bars: layout.n, spacing: layout.spacing, top: m < 0 };
  };
  const cx1m = i.col1Width / 1000, cx2m = i.col2Width / 1000;
  const longSections = [
    mkSection('Max |M| (BEF)', xPeak),
    mkSection('Col 1 inner face', x1 + cx1m / 2),
    mkSection('Col 2 inner face', x2 - cx2m / 2),
  ];

  return {
    shape, Bx, By, x1, x2, Pu, Pu1, Pu2, qNet, Dc, Ec, EI,
    charLength: 1 / beta, betaBx: beta * Bx,
    yMax: yMax * 1000, yMin: yMin * 1000,
    qSoilMax, bearingOK: qSoilMax <= qNet + 1e-6,
    xPeak, mPeak, vMax, longSections,
    samples: { x: xs, V, M, w: wLine, y: yLine.map((y) => y * 1000) },
  };
}
