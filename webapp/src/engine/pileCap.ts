// ─────────────────────────────────────────────────────────────────────────
// Pile cap design — ACI 318-14 / NSCP 2015
// Supports 2-pile (linear), 3-pile (triangular), 4-pile (square),
// 6-pile (2×3 rectangular), and 9-pile (3×3 square) standard arrangements.
// Convention: lengths in mm, forces in kN, moments in kN·m.
// ─────────────────────────────────────────────────────────────────────────

import { twoWayVc, oneWayVc } from './shear';
import { flexuralSteel, barLayout } from './flexure';

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
      (coords[i].x > 0 ? (MuXpos += factReactions[i] * armX) : (MuXneg += factReactions[i] * armX));
    }
    const armY = Math.abs(coords[i].y) - inp.colY / 2;
    if (armY > 0) {
      (coords[i].y > 0 ? (MuYpos += factReactions[i] * armY) : (MuYneg += factReactions[i] * armY));
    }
  }
  const MuX = Math.max(MuXpos, MuXneg) / 1e3; // kN·mm → kN·m
  const MuY = Math.max(MuYpos, MuYneg) / 1e3;

  // x-direction bars (running in x, moment about y, width = capBy)
  const flexX   = flexuralSteel({ Mu: MuX, b: capBy, d, fc: inp.fc, fy: inp.fy });
  const layoutX = barLayout({ As: flexX.As, db: inp.barDia, b: capBy, cover: inp.cover });

  // y-direction bars (running in y, moment about x, width = capBx)
  const flexY   = flexuralSteel({ Mu: MuY, b: capBx, d, fc: inp.fc, fy: inp.fy });
  const layoutY = barLayout({ As: flexY.As, db: inp.barDia, b: capBx, cover: inp.cover });

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
