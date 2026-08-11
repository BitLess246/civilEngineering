// ─────────────────────────────────────────────────────────────────────────
// Pile cap design — ACI 318-14 / NSCP 2015
// Supports 2-pile (linear), 3-pile (triangular), 4-pile (square),
// 6-pile (2×3 rectangular), and 9-pile (3×3 square) standard arrangements.
// Convention: lengths in mm, forces in kN, moments in kN·m.
// ─────────────────────────────────────────────────────────────────────────

import { twoWayVc, oneWayVc } from './shear';
import { flexuralSteel, matLayout } from './flexure';
import { type SolutionStep, sn0, sn1, sn2 } from '../lib/solution';

const PHI_V = 0.75;

export type PileArrangement = 2 | 3 | 4 | 6 | 9;

export interface PileCapInput {
  // Service loads — pile capacity check
  serviceLoad: number;    // P_service, kN
  serviceMomX: number;    // M_x service (about x-axis), kN·m
  serviceMomY: number;    // M_y service (about y-axis), kN·m
  // Factored loads — shear & flexure design
  ultimateLoad: number;   // Pu, kN
  ultimateMomX: number;   // Mux, kN·m
  ultimateMomY: number;   // Muy, kN·m
  // Pile geometry
  nPiles: PileArrangement;
  pileDia: number;        // circular pile diameter, mm
  pileCapacity: number;   // allowable service load per pile, kN
  spacing: number;        // c/c pile spacing, mm
  edgeDist: number;       // pile centre to nearest cap edge, mm
  // Column (rectangular)
  colX: number;           // column dimension in x, mm
  colY: number;           // column dimension in y, mm
  // Materials & detailing
  fc: number;
  fy: number;
  cover: number;          // clear cover, mm
  barDia: number;
  pileEmbed: number;      // pile embedment into cap, mm
  lambda?: number;        // lightweight concrete factor (default 1)
}

export interface PileCoord { x: number; y: number }

export interface SteelDetail {
  As: number; rho: number; bars: number; spacing: number; usedMin: boolean;
}

export interface PileCapResult {
  capBx: number; capBy: number;       // cap plan dimensions, mm
  Dc: number;                          // cap thickness, mm
  d: number;                           // effective depth, mm
  coords: PileCoord[];                 // pile centres from cap centre, mm
  reactions: number[];                 // service pile reactions, kN
  factReactions: number[];             // factored pile reactions, kN
  maxReaction: number;                 // max service reaction, kN
  capacityOK: boolean;                 // max ≤ pileCapacity

  VuPunchCol: number;  phiVcPunchCol: number;  punchColOK: boolean;
  VuPunchPile: number; phiVcPunchPile: number; punchPileOK: boolean;
  VuBeamX: number;     phiVcBeamX: number;     beamXOK: boolean;
  VuBeamY: number;     phiVcBeamY: number;     beamYOK: boolean;

  MuX: number; MuY: number;
  steelX: SteelDetail;
  steelY: SteelDetail;

  ldRequired: number; ldAvailable: number; ldOK: boolean;
}

/** Returns pile centres in the cap coordinate system (cap centroid = pile group centroid = origin). */
export function pileCentres(n: PileArrangement, s: number): PileCoord[] {
  const s2 = s / 2;
  const r = s / Math.sqrt(3); // circumradius of equilateral triangle with side s
  switch (n) {
    case 2: return [{ x: -s2, y: 0 }, { x: s2, y: 0 }];
    case 3: return [
      { x: 0,   y:  r     },
      { x: -s2, y: -r / 2 },
      { x:  s2, y: -r / 2 },
    ];
    case 4: return [
      { x: -s2, y: -s2 }, { x: s2, y: -s2 },
      { x: -s2, y:  s2 }, { x: s2, y:  s2 },
    ];
    case 6: return [
      { x:  -s, y: -s2 }, { x: 0, y: -s2 }, { x: s, y: -s2 },
      { x:  -s, y:  s2 }, { x: 0, y:  s2 }, { x: s, y:  s2 },
    ];
    case 9: return [
      { x: -s, y: -s }, { x: 0, y: -s }, { x: s, y: -s },
      { x: -s, y:  0 }, { x: 0, y:  0 }, { x: s, y:  0 },
      { x: -s, y:  s }, { x: 0, y:  s }, { x: s, y:  s },
    ];
  }
}

function roundUp(v: number, step: number) { return Math.ceil(v / step) * step; }

/**
 * Pile reactions — elastic analysis: Ri = P/N + Mx·yi/Σyi² + My·xi/Σxi²
 * Mx/My in kN·m, coords in mm → Ri in kN.
 */
function calcReactions(
  coords: PileCoord[], P: number, Mx_kNm: number, My_kNm: number,
): number[] {
  const Sxx = coords.reduce((s, p) => s + p.y * p.y, 0); // Σyi², mm²
  const Syy = coords.reduce((s, p) => s + p.x * p.x, 0); // Σxi², mm²
  const N = coords.length;
  return coords.map(p => {
    let R = P / N;
    if (Sxx > 0) R += (Mx_kNm * 1e3 * p.y) / Sxx;
    if (Syy > 0) R += (My_kNm * 1e3 * p.x) / Syy;
    return R;
  });
}

/**
 * ACI 318-14 §25.5.1 development length (straight bar, bottom, uncoated,
 * normal weight unless lambda < 1). Returns mm.
 */
function devLength(db: number, fc: number, fy: number, cover: number, lambda: number): number {
  const cb = cover + db / 2;                           // centre-to-surface distance
  const ratio = Math.min(cb / db, 2.5);               // (cb + Ktr)/db, Ktr = 0
  return Math.ceil((3 * fy) / (40 * lambda * Math.sqrt(fc) * ratio) * db);
}

export function designPileCap(inp: PileCapInput): PileCapResult {
  const lambda = inp.lambda ?? 1;
  const coords = pileCentres(inp.nPiles, inp.spacing);
  const N = coords.length;

  // ── Cap plan dimensions ──────────────────────────────────────────────────
  const maxX = Math.max(...coords.map(p => Math.abs(p.x)));
  const maxY = Math.max(...coords.map(p => Math.abs(p.y)));
  const capBx = roundUp(2 * (maxX + inp.edgeDist), 25);
  const capBy = roundUp(2 * (maxY + inp.edgeDist), 25);

  // ── Pile reactions ───────────────────────────────────────────────────────
  const reactions     = calcReactions(coords, inp.serviceLoad,  inp.serviceMomX,  inp.serviceMomY);
  const factReactions = calcReactions(coords, inp.ultimateLoad, inp.ultimateMomX, inp.ultimateMomY);
  const maxReaction     = Math.max(...reactions);
  const maxFactReaction = Math.max(...factReactions);
  const capacityOK = maxReaction <= inp.pileCapacity;

  const betaC = Math.max(inp.colX, inp.colY) / Math.min(inp.colX, inp.colY);

  // ── Find minimum effective depth satisfying all shear checks ─────────────
  let dMin = 3000;
  outer: for (let dTry = 50; dTry <= 3000; dTry++) {
    // 1 · Column punching (critical section at d/2 from column face)
    const boCol = 2 * (inp.colX + dTry) + 2 * (inp.colY + dTry);
    let VuCol = inp.ultimateLoad;
    for (let i = 0; i < N; i++) {
      if (Math.abs(coords[i].x) <= inp.colX / 2 + dTry / 2 &&
          Math.abs(coords[i].y) <= inp.colY / 2 + dTry / 2) {
        VuCol -= factReactions[i];
      }
    }
    VuCol = Math.max(0, VuCol);
    if (PHI_V * twoWayVc({ fc: inp.fc, bo: boCol, d: dTry, betaC, lambda }) < VuCol) continue;

    // 2 · Pile punching (worst pile reaction, critical perimeter π(dp+d))
    const boPile = Math.PI * (inp.pileDia + dTry);
    if (PHI_V * twoWayVc({ fc: inp.fc, bo: boPile, d: dTry, betaC: 1, lambda }) < maxFactReaction) continue;

    // 3 · One-way shear in x (critical section at cx/2 + d from cap centre)
    const critX = inp.colX / 2 + dTry;
    let bxPos = 0, bxNeg = 0;
    for (let i = 0; i < N; i++) {
      if (coords[i].x  >  critX) bxPos += factReactions[i];
      if (coords[i].x  < -critX) bxNeg += factReactions[i];
    }
    if (PHI_V * oneWayVc({ fc: inp.fc, b: capBy, d: dTry, lambda }) < Math.max(bxPos, bxNeg)) continue;

    // 4 · One-way shear in y
    const critY = inp.colY / 2 + dTry;
    let byPos = 0, byNeg = 0;
    for (let i = 0; i < N; i++) {
      if (coords[i].y  >  critY) byPos += factReactions[i];
      if (coords[i].y  < -critY) byNeg += factReactions[i];
    }
    if (PHI_V * oneWayVc({ fc: inp.fc, b: capBx, d: dTry, lambda }) < Math.max(byPos, byNeg)) continue;

    dMin = dTry;
    break outer;
  }

  // Minimum depth also must accommodate pile embedment + cover + bar
  const dcFromEmbed = roundUp(inp.pileEmbed + inp.cover + inp.barDia, 25);
  const Dc = Math.max(roundUp(dMin + inp.cover + inp.barDia, 25), dcFromEmbed);
  const d  = Dc - inp.cover - inp.barDia / 2;

  // ── Final check values at adopted d ─────────────────────────────────────
  const boColF = 2 * (inp.colX + d) + 2 * (inp.colY + d);
  let VuPunchCol = inp.ultimateLoad;
  for (let i = 0; i < N; i++) {
    if (Math.abs(coords[i].x) <= inp.colX / 2 + d / 2 &&
        Math.abs(coords[i].y) <= inp.colY / 2 + d / 2) {
      VuPunchCol -= factReactions[i];
    }
  }
  VuPunchCol = Math.max(0, VuPunchCol);
  const phiVcPunchCol  = PHI_V * twoWayVc({ fc: inp.fc, bo: boColF, d, betaC, lambda });

  const boPileF = Math.PI * (inp.pileDia + d);
  const VuPunchPile   = maxFactReaction;
  const phiVcPunchPile = PHI_V * twoWayVc({ fc: inp.fc, bo: boPileF, d, betaC: 1, lambda });

  const critXF = inp.colX / 2 + d;
  let bxPosF = 0, bxNegF = 0;
  for (let i = 0; i < N; i++) {
    if (coords[i].x  >  critXF) bxPosF += factReactions[i];
    if (coords[i].x  < -critXF) bxNegF += factReactions[i];
  }
  const VuBeamX    = Math.max(bxPosF, bxNegF);
  const phiVcBeamX = PHI_V * oneWayVc({ fc: inp.fc, b: capBy, d, lambda });

  const critYF = inp.colY / 2 + d;
  let byPosF = 0, byNegF = 0;
  for (let i = 0; i < N; i++) {
    if (coords[i].y  >  critYF) byPosF += factReactions[i];
    if (coords[i].y  < -critYF) byNegF += factReactions[i];
  }
  const VuBeamY    = Math.max(byPosF, byNegF);
  const phiVcBeamY = PHI_V * oneWayVc({ fc: inp.fc, b: capBx, d, lambda });

  // ── Flexure — critical section at column face ────────────────────────────
  let MuXpos = 0, MuXneg = 0, MuYpos = 0, MuYneg = 0;
  for (let i = 0; i < N; i++) {
    const armX = Math.abs(coords[i].x) - inp.colX / 2;
    if (armX > 0) {
      if (coords[i].x > 0) MuXpos += factReactions[i] * armX;
      else MuXneg += factReactions[i] * armX;
    }
    const armY = Math.abs(coords[i].y) - inp.colY / 2;
    if (armY > 0) {
      if (coords[i].y > 0) MuYpos += factReactions[i] * armY;
      else MuYneg += factReactions[i] * armY;
    }
  }
  const MuX = Math.max(MuXpos, MuXneg) / 1e3; // kN·mm → kN·m
  const MuY = Math.max(MuYpos, MuYneg) / 1e3;

  // x-direction bars (running in x, moment about y, width = capBy)
  const flexX   = flexuralSteel({ Mu: MuX, b: capBy, d, fc: inp.fc, fy: inp.fy });
  const layoutX = matLayout({
    As: flexX.As, db: inp.barDia, b: capBy, cover: inp.cover, h: Dc, kind: 'one-way',
  });

  // y-direction bars (running in y, moment about x, width = capBx)
  const flexY   = flexuralSteel({ Mu: MuY, b: capBx, d, fc: inp.fc, fy: inp.fy });
  const layoutY = matLayout({
    As: flexY.As, db: inp.barDia, b: capBx, cover: inp.cover, h: Dc, kind: 'one-way',
  });

  // ── Development length ───────────────────────────────────────────────────
  const ldReq    = devLength(inp.barDia, inp.fc, inp.fy, inp.cover, lambda);
  const ldAvailX = capBx / 2 - inp.colX / 2 - inp.cover;
  const ldAvailY = capBy / 2 - inp.colY / 2 - inp.cover;
  const ldAvail  = Math.min(ldAvailX, ldAvailY);

  return {
    capBx, capBy, Dc, d,
    coords, reactions, factReactions, maxReaction, capacityOK,
    VuPunchCol,  phiVcPunchCol,  punchColOK:  phiVcPunchCol  >= VuPunchCol,
    VuPunchPile, phiVcPunchPile, punchPileOK: phiVcPunchPile >= VuPunchPile,
    VuBeamX,     phiVcBeamX,     beamXOK:     phiVcBeamX     >= VuBeamX,
    VuBeamY,     phiVcBeamY,     beamYOK:     phiVcBeamY     >= VuBeamY,
    MuX, MuY,
    steelX: { As: flexX.As, rho: flexX.rho, bars: layoutX.n, spacing: layoutX.spacing, usedMin: flexX.usedMin },
    steelY: { As: flexY.As, rho: flexY.rho, bars: layoutY.n, spacing: layoutY.spacing, usedMin: flexY.usedMin },
    ldRequired: ldReq, ldAvailable: ldAvail, ldOK: ldAvail >= ldReq,
  };
}

// ── Worked solution ────────────────────────────────────────────────────────
// A pile cap fails four different ways and the depth is sized by whichever
// comes first, so the report has to show all four — a reader who sees only the
// governing one cannot tell whether the cap is 500 mm deep because of column
// punching or because a corner pile punched through.
export function pileCapSolution(inp: PileCapInput, r: PileCapResult): SolutionStep[] {
  const N = r.coords.length;
  const rMax = Math.max(...r.reactions);
  const rMin = Math.min(...r.reactions);
  const boCol = 2 * (inp.colX + r.d) + 2 * (inp.colY + r.d);
  const boPile = Math.PI * (inp.pileDia + r.d);
  const util = (Vu: number, phiVc: number) => (phiVc > 0 ? Vu / phiVc : Infinity);
  const le = (ok: boolean) => (ok ? '\\le' : '>');

  return [
    {
      title: 'Cap plan dimensions', clause: 'Pile layout + edge distance',
      lines: [
        { text: `${N} piles at ${inp.spacing} mm c/c, ⌀${inp.pileDia} mm, ${inp.edgeDist} mm from the pile centre to the cap edge.` },
        { tex: `B_x = 2(x_{max} + e) = ${r.capBx}\\ \\text{mm}, \\quad B_y = 2(y_{max} + e) = ${r.capBy}\\ \\text{mm}` },
        { text: 'Both are rounded up to the next 25 mm. The cap centroid is taken at the pile-group centroid, so the column is assumed concentric with the group.' },
      ],
    },
    {
      title: 'Service pile reactions', clause: 'Elastic: Rᵢ = P/N + Mₓ·yᵢ/Σyᵢ² + Mᵧ·xᵢ/Σxᵢ²',
      lines: [
        { tex: `R_{max} = \\dfrac{P}{N} + \\dfrac{M_x y_i}{\\sum y_i^2} + \\dfrac{M_y x_i}{\\sum x_i^2} = ${sn1(rMax)}\\ \\text{kN} \\ ${le(r.capacityOK)} \\ R_{allow} = ${sn0(inp.pileCapacity)}\\ \\text{kN}` },
        { text: `Service load ${sn0(inp.serviceLoad)} kN over ${N} piles; reactions range ${sn1(rMin)} … ${sn1(rMax)} kN.${rMin < 0 ? ' A NEGATIVE reaction is uplift — that pile needs a tension connection into the cap, which this calculator does not size.' : ''}` },
        { text: 'The cap is taken as rigid, so reactions vary linearly across the group. That is the usual assumption, and it is unconservative for a thin cap on soft piles.' },
      ],
      pass: r.capacityOK,
    },
    {
      title: 'Cap thickness', clause: 'ACI 318-14 §13.4.2.1',
      lines: [
        { tex: `D = ${r.Dc}\\ \\text{mm}, \\quad d = D - c - \\tfrac{d_b}{2} = ${r.Dc} - ${inp.cover} - \\tfrac{${inp.barDia}}{2} = ${sn1(r.d)}\\ \\text{mm}` },
        { text: `The depth is searched upward until all four shear checks below pass, then rounded to 25 mm and taken at least ${inp.pileEmbed} mm (pile embedment) + cover + bar.` },
      ],
    },
    {
      title: 'Two-way (punching) shear at the column', clause: 'ACI §22.6.5 — critical section d/2 from the column face',
      lines: [
        { tex: `b_o = 2(c_x + d) + 2(c_y + d) = ${sn0(boCol)}\\ \\text{mm}` },
        { tex: `V_u = P_u - \\sum R_{u,inside} = ${sn1(r.VuPunchCol)}\\ \\text{kN} \\ ${le(r.punchColOK)} \\ \\phi V_c = ${sn1(r.phiVcPunchCol)}\\ \\text{kN}` },
        { text: `Utilisation ${sn2(util(r.VuPunchCol, r.phiVcPunchCol))}. Piles whose centres fall inside the critical perimeter are deducted — their reaction never crosses it.` },
      ],
      pass: r.punchColOK,
    },
    {
      title: 'Two-way (punching) shear at a pile', clause: 'ACI §22.6.5 — perimeter π(dₚ + d)',
      lines: [
        { tex: `b_o = \\pi(d_p + d) = \\pi(${inp.pileDia} + ${sn1(r.d)}) = ${sn0(boPile)}\\ \\text{mm}` },
        { tex: `V_u = R_{u,max} = ${sn1(r.VuPunchPile)}\\ \\text{kN} \\ ${le(r.punchPileOK)} \\ \\phi V_c = ${sn1(r.phiVcPunchPile)}\\ \\text{kN}` },
        { text: `Utilisation ${sn2(util(r.VuPunchPile, r.phiVcPunchPile))}. β_c = 1 for a circular pile. This is the check that governs a widely-spaced group, and the easiest of the four to forget by hand.` },
      ],
      pass: r.punchPileOK,
    },
    {
      title: 'One-way (beam) shear, both directions', clause: 'ACI §22.5 — critical section d from the column face',
      lines: [
        { tex: `\\text{x:}\\quad V_u = ${sn1(r.VuBeamX)}\\ \\text{kN} \\ ${le(r.beamXOK)} \\ \\phi V_c = ${sn1(r.phiVcBeamX)}\\ \\text{kN} \\quad (b = B_y = ${r.capBy}\\ \\text{mm})` },
        { tex: `\\text{y:}\\quad V_u = ${sn1(r.VuBeamY)}\\ \\text{kN} \\ ${le(r.beamYOK)} \\ \\phi V_c = ${sn1(r.phiVcBeamY)}\\ \\text{kN} \\quad (b = B_x = ${r.capBx}\\ \\text{mm})` },
        { text: 'Only the piles whose centres lie beyond the critical section contribute; a pile straddling it is taken as fully outside, which is the conservative side.' },
      ],
      pass: r.beamXOK && r.beamYOK,
    },
    {
      title: 'Flexure at the column face', clause: 'ACI §13.4.2.1 / §9.6.1.2 (minimum steel)',
      lines: [
        { tex: `M_{ux} = \\sum R_u\\left(|x_i| - \\tfrac{c_x}{2}\\right) = ${sn1(r.MuX)}\\ \\text{kN·m} \\ \\to \\ A_s = ${sn0(r.steelX.As)}\\ \\text{mm}^2` },
        { text: `x-direction: ${r.steelX.bars}–⌀${inp.barDia} at ${sn0(r.steelX.spacing)} mm over the ${r.capBy} mm width, ρ = ${r.steelX.rho.toFixed(4)}${r.steelX.usedMin ? ' — MINIMUM steel governs' : ''}.` },
        { tex: `M_{uy} = ${sn1(r.MuY)}\\ \\text{kN·m} \\ \\to \\ A_s = ${sn0(r.steelY.As)}\\ \\text{mm}^2` },
        { text: `y-direction: ${r.steelY.bars}–⌀${inp.barDia} at ${sn0(r.steelY.spacing)} mm over the ${r.capBx} mm width, ρ = ${r.steelY.rho.toFixed(4)}${r.steelY.usedMin ? ' — MINIMUM steel governs' : ''}.` },
      ],
    },
    {
      title: 'Development of the bottom bars', clause: 'ACI §25.4.2.3',
      lines: [
        { tex: `\\ell_d = \\dfrac{3f_y}{40\\lambda\\sqrt{f'_c}\\,(c_b/d_b)}\\,d_b = ${sn0(r.ldRequired)}\\ \\text{mm}` },
        { tex: `\\ell_{avail} = \\dfrac{B}{2} - \\dfrac{c_{col}}{2} - \\text{cover} = ${sn0(r.ldAvailable)}\\ \\text{mm} \\ ${r.ldOK ? '\\ge' : '<'} \\ ${sn0(r.ldRequired)}\\ \\text{mm}` },
        { text: r.ldOK
            ? 'Straight bars develop within the cap.'
            : 'Straight bars do NOT develop — hook the bar ends (§25.4.3) or widen the cap.' },
      ],
      pass: r.ldOK,
      note: 'K_tr is taken as zero (no confining reinforcement counted), which is the conservative side.',
    },
  ];
}
