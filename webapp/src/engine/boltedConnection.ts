// ─────────────────────────────────────────────────────────────────────────
// Eccentrically-loaded bolt group — elastic (vector) method.
// AISC / classic mechanics (as in the worked examples): a load P applied at an
// eccentricity (ex, ey) from the bolt-group centroid is split into
//   Direct shear   Rdx = Px/N ,  Rdy = Py/N
//   Torsional shear (about the centroid, T = Py·ex − Px·ey):
//                   RTx = T·yc/J ,  RTy = T·xc/J ,  J = Σ(xc² + yc²)
// The resultant on each bolt is R = √((Rdx ± RTx)² + (Rdy ∓ RTy)²); the most-
// loaded bolt governs the shear stress, and the maximum applied load P follows
// from the allowable bolt shear (R scales linearly with P).
// Bolts can be placed at ANY location in the plane (custom pattern).
// Units: positions/eccentricity mm; P kN; stress MPa; forces kN.
// ─────────────────────────────────────────────────────────────────────────
import { boltGeomFromPositions, eccentricBoltGroup, type BoltPos, type BoltForce, type BoltGroupGeom } from './steelDesign'

export interface BoltConnLoad {
  /** Magnitude of the applied load, kN. */
  P: number
  /** Direction, degrees measured from +X (horizontal), positive CCW. */
  angleDeg: number
  /** Load application point in plate coordinates (bottom-left origin), mm. */
  px: number; py: number
}

export interface BoltConnResult {
  geom: BoltGroupGeom
  Px: number; Py: number       // load components, kN
  ex: number; ey: number       // eccentricity of the load from the centroid, mm
  T: number                    // torsional moment about the centroid, kN·mm
  J: number                    // polar moment Σ(x²+y²), mm²
  bolts: BoltForce[]           // per-bolt forces (direct + torsional resultant)
  Rmax: number; criticalId: string
  Rmin: number; leastId: string
  tauMax: number               // max bolt shear stress, MPa
  maxP: number                 // maximum applied load for the allowable stress, kN
  ok: boolean
}

/**
 * Solve an eccentrically-loaded bolt group by the elastic method. `bolts` are
 * absolute plate-coordinate positions (any custom pattern). The load `P` acts at
 * `angleDeg` through the point (px, py); `allowableStress` is the permissible
 * bolt shear stress; `nShear` is the number of shear planes (1 single, 2 double).
 */
export function solveBoltedConnection(p: {
  bolts: BoltPos[]; dia: number; load: BoltConnLoad; allowableStress: number; nShear?: number;
}): BoltConnResult {
  const geom = boltGeomFromPositions(p.bolts)
  const nShear = p.nShear ?? 1
  const Ab = (Math.PI / 4) * p.dia * p.dia
  const rad = (p.load.angleDeg * Math.PI) / 180
  const Px = p.load.P * Math.cos(rad)
  const Py = p.load.P * Math.sin(rad)
  const ex = p.load.px - geom.Cx
  const ey = p.load.py - geom.Cy

  // Elastic vector method: Pu = vertical (+Y), Hu = horizontal (+X), load at (ex, ey).
  const phiPlaceholder = 1   // strength unused here; we report stress & max-P instead
  const res = eccentricBoltGroup(geom, Py, Px, ex, ey, phiPlaceholder, p.dia, 10)
  const T = Py * ex - Px * ey

  const forces = res.bolts
  const ci = forces.reduce((mi, _, i) => (forces[i].R > forces[mi].R ? i : mi), 0)
  const li = forces.reduce((mi, _, i) => (forces[i].R < forces[mi].R ? i : mi), 0)
  const Rmax = forces[ci].R, Rmin = forces[li].R

  const capacityPerBolt = (p.allowableStress * Ab * nShear) / 1000   // kN
  const tauMax = (Rmax * 1000) / (Ab * nShear)                        // MPa
  // R scales linearly with P ⇒ maxP = P · capacity / Rmax.
  const maxP = Rmax > 1e-9 ? (p.load.P * capacityPerBolt) / Rmax : Infinity

  return {
    geom, Px, Py, ex, ey, T, J: geom.Ip, bolts: forces,
    Rmax, criticalId: forces[ci].id, Rmin, leastId: forces[li].id,
    tauMax, maxP, ok: tauMax <= p.allowableStress + 1e-6,
  }
}
