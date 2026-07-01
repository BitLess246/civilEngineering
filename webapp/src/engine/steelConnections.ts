/**
 * AISC 360-16 / AISC Steel Construction Manual (SCM) — beam-to-column
 * connection design for simple shear tabs and partial-depth end-plate /
 * flange-weld moment connections.
 *
 * Conventions (consistent with pipeline.ts):
 *   forces  kN, kN·m
 *   lengths m
 *   sections mm, mm², mm⁴
 *   stresses MPa
 */
import type { StructuralModel, Node as ModelNode } from './model'
import type { StructureDesign, SteelBeamScheduleRow } from './pipeline'
import { boltGeomFromPositions, eccentricBoltGroup, type BoltPos } from './steelDesign'

// ── Material constants ──────────────────────────────────────────────────────
const PHI_SHEAR_BOLT = 0.75           // AISC §J3.6
const FNV_A325 = 495                  // MPa  (threads excluded from shear plane)

const PHI_PLATE_YIELD = 1.0           // AISC §J4.2 shear yielding
const FY_PLATE = 248                  // MPa  A36
const FU_PLATE = 400                  // MPa
const FEXX = 480                      // MPa  E70XX electrode
const PHI_WELD = 0.75

/** Capacity of a single fillet weld (one side) per unit length: kN/mm */
const phiWeldPerMm = (w: number) => PHI_WELD * 0.6 * FEXX * 0.707 * w / 1000

const PHI_CJP = 0.9                   // AISC Table J2.5 complete-joint-penetration
const MOMENT_CONN_THRESHOLD = 0.2     // use moment conn when Mu/φMn > this

// ── Plate stock ──────────────────────────────────────────────────────────────
const PLATE_STOCK = [6, 8, 10, 12, 16, 19, 22, 25] // mm, standard stock
function adoptPlate(t: number): number {
  return PLATE_STOCK.find((s) => s >= t - 1e-6) ?? PLATE_STOCK[PLATE_STOCK.length - 1]
}

// ── Types ────────────────────────────────────────────────────────────────────
export type ConnFaceType = 'flange' | 'web'
/** Which beam element(s) the connection engages: shear-tab bolts the beam WEB;
 *  a moment connection welds the beam FLANGES and shear-tabs the web. */
export type BeamAttachment = 'web' | 'web+flanges'
export type ConnType     = 'shear-tab' | 'moment-flange-weld'
export type SpanDir      = 'x' | 'z' | 'other'

export interface BoltGroup {
  n: number         // number of bolts
  dia: number       // bolt diameter mm (20 = M20)
  pitchMm: number   // bolt pitch mm
  edgeMm: number    // edge distance mm
  phiRnKn: number   // design shear strength per bolt, kN
  /** In-plane eccentricity of the reaction from the bolt-group centroid, mm
   *  (the weld/support line is x = 0). Drives the elastic bolt-force method. */
  ecc: number
  /** Per-bolt positions in the connection plane (absolute plate mm). These can be
   *  laid out automatically OR supplied CUSTOM per bolt via `designBolts`. */
  locations: BoltPos[]
  /** Maximum bolt resultant from the elastic (vector) eccentric method, kN. */
  Rmax: number
  criticalId: string   // id of the most-loaded bolt
  ok: boolean          // Rmax ≤ φRn
}

export interface ShearTab {
  t: number         // plate thickness mm (adopted from stock)
  wMm: number       // plate width mm (horizontal)
  hMm: number       // plate height mm
  weldSizeMm: number // fillet weld leg size mm (each side)
  phiVn: number     // shear tab plate capacity kN
  phiWeldVn: number // weld capacity kN
}

export interface FlangeMomentConn {
  Tf: number        // design flange force kN  (= Mu / (d - tf))
  flangeArea: number // beam flange area mm²
  phiCapKn: number  // φ·Fu·A_flange (CJP) kN
  ok: boolean
}

export interface BeamConnection {
  beamId: string
  role: string
  spanDir: SpanDir
  faceType: ConnFaceType       // which column element the beam frames into (flange/web)
  beamElement: BeamAttachment  // which beam element(s) the connection engages
  connType: ConnType
  /** True when the connection releases beam-end bending (a shear/simple pin) —
   *  the analysis idealisation the joint implies. False for a rigid moment conn. */
  pinned: boolean
  Vu: number              // design shear kN
  Mu: number              // design moment kN·m
  bolts: BoltGroup
  tab: ShearTab
  flange?: FlangeMomentConn
  ok: boolean
}

export interface SteelJoint {
  nodeId: string
  columnShape: string
  columnId: string
  /** Strong axis direction of this column (X = flanges face ±X, depth d in X).
   *  The column's primary moment frame direction. */
  strongAxisDir: 'x' | 'z'
  connections: BeamConnection[]
  ok: boolean
}

// ── Core design functions ─────────────────────────────────────────────────────

// Conventional single-plate weld-to-bolt distance (bolt line offset from the
// column face / weld line), mm — the in-plane eccentricity source.
const A_WELD_TO_BOLT = 60

/** Per-bolt design shear strength (single shear plane), kN. */
function phiBoltShear(dia: number): number {
  const Ab = (Math.PI / 4) * dia * dia
  return (PHI_SHEAR_BOLT * FNV_A325 * Ab) / 1000
}

/** Single-column bolt layout: n bolts at `pitch`, first `edge` from the top,
 *  column at horizontal offset `a` from the weld line. Absolute plate mm. */
function boltColumn(n: number, pitchMm: number, edgeMm: number, aMm: number): BoltPos[] {
  return Array.from({ length: n }, (_, i) => ({ id: `B${i + 1}`, x: aMm, y: edgeMm + i * pitchMm }))
}

/**
 * Design the connection bolt group for a vertical reaction Vu (kN) by the
 * elastic (vector) eccentric method — each bolt carries direct shear V/n plus a
 * torsional component from the reaction acting at eccentricity `ecc` from the
 * group centroid. Auto-lays a single column and grows it until the most-loaded
 * bolt is within φRn; alternatively pass CUSTOM `locations` to place each bolt
 * anywhere in the plane (the weld/support line is x = 0).
 */
export function designBolts(Vu: number, opts: {
  dia?: number; pitchMm?: number; edgeMm?: number; aMm?: number; locations?: BoltPos[];
} = {}): BoltGroup {
  const dia = opts.dia ?? 20
  const pitchMm = opts.pitchMm ?? 75, edgeMm = opts.edgeMm ?? 40, aMm = opts.aMm ?? A_WELD_TO_BOLT
  const phiRn = phiBoltShear(dia)

  let locations: BoltPos[]
  if (opts.locations && opts.locations.length > 0) {
    locations = opts.locations
  } else {
    let n = Math.max(2, Math.ceil(Vu / phiRn))
    for (let it = 0; it < 30; it++) {
      const g = boltGeomFromPositions(boltColumn(n, pitchMm, edgeMm, aMm))
      if (eccentricBoltGroup(g, Vu, 0, aMm, 0, phiRn, dia, 10).Rmax <= phiRn + 1e-6 || n >= 24) break
      n++
    }
    locations = boltColumn(n, pitchMm, edgeMm, aMm)
  }

  const geom = boltGeomFromPositions(locations)
  const ecc = Math.abs(geom.Cx)   // centroid-to-weld-line (x = 0) distance
  const res = eccentricBoltGroup(geom, Vu, 0, ecc, 0, phiRn, dia, 10)
  return {
    n: locations.length, dia, pitchMm, edgeMm, phiRnKn: phiRn,
    ecc, locations, Rmax: res.Rmax, criticalId: res.critical, ok: res.Rmax <= phiRn + 1e-6,
  }
}

/** Design a single-plate shear tab sized to a bolt column of `nBolts`. */
function designShearTab(Vu: number, nBolts: number, pitchMm = 75, edgeMm = 40): ShearTab {
  const hMm = (nBolts - 1) * pitchMm + 2 * edgeMm      // plate height
  const wMm = A_WELD_TO_BOLT + 2 * edgeMm               // plate width (weld line → bolt + edge)

  // plate thickness from shear yielding (governs over rupture for typical cases)
  const tReq = Vu * 1000 / (PHI_PLATE_YIELD * 0.6 * FY_PLATE * hMm)
  const t = adoptPlate(Math.max(6, tReq))

  // weld: two fillet welds (both sides of plate) along height h
  const weldReq = Vu / (2 * phiWeldPerMm(1) * hMm)      // size for 1 mm × area
  const weldSizeMm = Math.max(5, Math.ceil(weldReq))      // min 5 mm, round up

  const phiVn = PHI_PLATE_YIELD * 0.6 * FY_PLATE * t * hMm / 1000
  const phiWeldVn = 2 * phiWeldPerMm(weldSizeMm) * hMm

  return { t, wMm, hMm, weldSizeMm, phiVn, phiWeldVn }
}

/** Design the flange groove weld for moment transfer. Tf = Mu / lever arm (kN).
 *  Uses complete joint penetration (CJP) with φFu strength. */
function designFlangeConn(Mu: number, d: number, tf: number, bf: number): FlangeMomentConn {
  const leverArm = Math.max(d - tf, 1)    // mm
  const Tf = (Mu * 1e6) / leverArm / 1000  // kN  (Mu kN·m → N·mm, ÷ mm → N, ÷1000 → kN)
  const flangeArea = bf * tf               // mm²
  const phiCapKn = PHI_CJP * FU_PLATE * flangeArea / 1000  // kN
  return { Tf, flangeArea, phiCapKn, ok: phiCapKn >= Tf - 1e-6 }
}

/**
 * Determine the span direction of a beam member from its two node positions.
 * 'x' if primarily horizontal-X, 'z' if primarily horizontal-Z.
 */
function spanDirOf(ni: ModelNode, nj: ModelNode): SpanDir {
  const dx = Math.abs(nj.x - ni.x)
  const dz = Math.abs(nj.z - ni.z)
  if (dx < 1e-4 && dz < 1e-4) return 'other'  // vertical or diagonal
  return dx >= dz ? 'x' : 'z'
}

/**
 * Design connections at every beam-to-column joint in a steel frame.
 * A joint is a node where at least one column and one beam/girder meet.
 */
export function designSteelJoints(
  model: StructuralModel,
  design: StructureDesign,
): SteelJoint[] {
  if (design.steelBeams.length === 0 && design.steelColumns.length === 0) return []

  const nodeMap  = new Map<string, ModelNode>(model.nodes.map((n) => [n.id, n]))
  const beamRow  = new Map<string, SteelBeamScheduleRow>(design.steelBeams.map((b) => [b.id, b]))
  const colIds   = new Set<string>(design.steelColumns.map((c) => c.id))

  // Build adj: node → list of member ids that touch it
  const adj = new Map<string, string[]>()
  for (const m of model.members) {
    ;[m.i, m.j].forEach((n) => {
      if (!adj.has(n)) adj.set(n, [])
      adj.get(n)!.push(m.id)
    })
  }

  // memberId → member
  const memMap = new Map(model.members.map((m) => [m.id, m]))

  const joints: SteelJoint[] = []

  // Find all nodes that host a column AND at least one beam/girder
  const processedNodes = new Set<string>()

  for (const col of design.steelColumns) {
    const colMem = memMap.get(col.id); if (!colMem) continue
    // both the i-node (base) and j-node (top) of the column are potential joint nodes
    for (const nodeId of [colMem.i, colMem.j]) {
      if (processedNodes.has(nodeId)) continue
      processedNodes.add(nodeId)

      const neighbours = adj.get(nodeId) ?? []
      // beam/girder members at this node
      const beamMems = neighbours.filter((mid) => {
        const mem = memMap.get(mid); if (!mem) return false
        return mem.role === 'beam' || mem.role === 'girder'
      })
      if (beamMems.length === 0) continue

      // Determine column strong-axis direction from the count of X vs Z beams
      let xCount = 0, zCount = 0
      for (const mid of beamMems) {
        const mem = memMap.get(mid)!
        const ni = nodeMap.get(mem.i)!, nj = nodeMap.get(mem.j)!
        if (spanDirOf(ni, nj) === 'x') xCount++
        else zCount++
      }
      // Strong axis faces the direction with more beams (girder direction)
      // If equal, default to X (primary frame direction)
      const strongAxisDir: 'x' | 'z' = xCount >= zCount ? 'x' : 'z'

      const connections: BeamConnection[] = []

      for (const mid of beamMems) {
        const mem = memMap.get(mid)!
        const ni = nodeMap.get(mem.i)!, nj = nodeMap.get(mem.j)!
        const sDir = spanDirOf(ni, nj)

        // The column face the beam frames into
        const faceType: ConnFaceType = sDir === strongAxisDir ? 'flange' : 'web'

        const row = beamRow.get(mid)
        // If no design row (can happen for non-designed members): use a minimal shear
        const Vu = row?.Vu ?? 5
        const Mu = row?.Mu ?? 0
        const phiMn = row?.phiMn ?? 1

        // The user's explicit connection type at the end framing into THIS node
        // governs; otherwise infer from the moment demand. A 'simple' end is a
        // pin (shear tab); 'moment' forces a moment connection.
        const end = mem.i === nodeId ? 'iEnd' : 'jEnd'
        const connKind = mem.connections?.[end]
        const useMoment = connKind === 'moment'
          || (connKind !== 'simple' && phiMn > 1e-9 && (Mu / phiMn) > MOMENT_CONN_THRESHOLD)

        // Elastic eccentric bolt group (each bolt placed & checked individually).
        const bolts = designBolts(Vu, { dia: 20 })
        const tab = designShearTab(Vu, bolts.n)

        let flangeConn: FlangeMomentConn | undefined
        if (useMoment && row) {
          flangeConn = designFlangeConn(Mu, row.d, row.tf, row.bf)
        }

        // Which beam element(s) the connection engages: web only for a shear tab;
        // web (shear) + both flanges (CJP welds) for a moment connection.
        const beamElement: BeamAttachment = useMoment ? 'web+flanges' : 'web'

        const tabOk  = tab.phiVn >= Vu - 1e-6 && tab.phiWeldVn >= Vu - 1e-6
        const flangeOk = !flangeConn || flangeConn.ok

        connections.push({
          beamId: mid,
          role: mem.role,
          spanDir: sDir,
          faceType,
          beamElement,
          connType: useMoment ? 'moment-flange-weld' : 'shear-tab',
          pinned: !useMoment,
          Vu, Mu,
          bolts,
          tab,
          flange: flangeConn,
          ok: bolts.ok && tabOk && flangeOk,
        })
      }

      if (connections.length === 0) continue

      // Find the column member id connected to this node (may be i or j)
      const colAtNode = neighbours.find((mid) => colIds.has(mid)) ?? col.id
      const colDesign = design.steelColumns.find((c) => c.id === colAtNode) ?? design.steelColumns.find((c) => c.id === col.id)!

      joints.push({
        nodeId,
        columnShape: colDesign.shape,
        columnId: colAtNode,
        strongAxisDir,
        connections,
        ok: connections.every((c) => c.ok),
      })
    }
  }

  return joints
}
