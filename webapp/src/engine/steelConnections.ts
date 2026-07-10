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
import { shapeByName } from './aiscSections'
import { localAxes, defaultAxisRotation, type V3 } from './frame3d'

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
/** Connection type per web/flange PAIRING of the two members:
 *  · shear-tab           — beam web → support face, single plate (any face)
 *  · moment-flange-weld  — beam flanges → column FLANGE, direct CJP welds
 *  · moment-web-plate    — beam flanges → column WEB (weak axis): the flange
 *    force cannot CJP into the thin web, so it goes through horizontal
 *    extension plates welded into the column web between the flanges
 *    (AISC Design Guide 13 weak-axis moment detail). */
export type ConnType     = 'shear-tab' | 'moment-flange-weld' | 'moment-web-plate'
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

/** Weak-axis (column-web) moment detail: horizontal extension plates carry the
 *  beam-flange force into the column web + flanges (moment-web-plate). */
export interface WebMomentPlate {
  tMm: number        // plate thickness mm (stock)
  wMm: number        // plate width mm (≥ beam bf, spans between column flanges)
  weldMm: number     // fillet leg to the column web, both sides, mm
  phiPlateKn: number // φ·Fy·t·w tension yielding (§J4.1) kN
  phiWeldKn: number  // weld group capacity kN
  ok: boolean
}

export interface FlangeMomentConn {
  Tf: number        // design flange force kN  (= Mu / (d - tf))
  flangeArea: number // beam flange area mm²
  /** Governing capacity of the flange-force path: CJP (flange face) or
   *  min(plate, weld) of the extension plates (web face). kN */
  phiCapKn: number
  ok: boolean
  /** Present only for moment-web-plate — the extension-plate detail. */
  webPlate?: WebMomentPlate
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
  /** Top-flange cope on the SUPPORTED beam (beam-to-beam fin plates only):
   *  clears the carrying girder's flange (AISC SCM Part 9 coped-beam detail). */
  cope?: { lengthMm: number; depthMm: number }
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

/** Design a single-plate shear tab sized to a bolt column of `nBolts`.
 *  `aMm` = weld-line → bolt-line distance; a WEB-face tab is extended so the
 *  bolts clear the column flange tips, which grows both `aMm` and the plate. */
function designShearTab(Vu: number, nBolts: number, pitchMm = 75, edgeMm = 40, aMm = A_WELD_TO_BOLT): ShearTab {
  const hMm = (nBolts - 1) * pitchMm + 2 * edgeMm      // plate height
  const wMm = aMm + 2 * edgeMm                          // plate width (weld line → bolt + edge)

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

const PHI_TENSION = 0.9   // AISC §J4.1 tensile yielding of connecting elements

/** Weak-axis moment detail: size the horizontal extension plates that carry the
 *  beam-flange force Tf into the column web (fillet welds both sides along the
 *  clear web depth). Plate width ≥ beam bf; tension yielding per §J4.1. */
function designWebMomentPlate(Tf: number, beamBf: number, colD: number, colTf: number): WebMomentPlate {
  const wMm = Math.ceil((beamBf + 20) / 10) * 10          // plate a little wider than the beam flange
  const tReq = (Tf * 1000) / (PHI_TENSION * FY_PLATE * wMm)
  const tMm = adoptPlate(Math.max(8, tReq))
  const phiPlateKn = (PHI_TENSION * FY_PLATE * tMm * wMm) / 1000
  const Lw = 2 * Math.max(colD - 2 * colTf, 100)          // both sides of the plate along the web
  const weldMm = Math.max(6, Math.ceil(Tf / (phiWeldPerMm(1) * Lw)))
  const phiWeldKn = phiWeldPerMm(weldMm) * Lw
  return { tMm, wMm, weldMm, phiPlateKn, phiWeldKn, ok: phiPlateKn >= Tf - 1e-6 && phiWeldKn >= Tf - 1e-6 }
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

      // The column member actually present at this node (may be the storey
      // above/below the loop column) — its section + orientation set the faces.
      const colAtNode = neighbours.find((mid) => colIds.has(mid)) ?? col.id
      const colDesign = design.steelColumns.find((c) => c.id === colAtNode)
        ?? design.steelColumns.find((c) => c.id === col.id)!
      const colMemAtNode = memMap.get(colAtNode) ?? colMem
      const colShp = shapeByName(colDesign.shape)

      // Column strong-axis direction from the member's RESOLVED orientation
      // (explicit axisRotation, or the vertical 90° default that puts depth d
      // on global X) — the same axes the solver, rigid zones and the drawn
      // section use. The depth axis is local y′ projected to the horizontal:
      // a beam spanning along it lands on the FLANGE face; across it, the WEB.
      const cpi = nodeMap.get(colMemAtNode.i), cpj = nodeMap.get(colMemAtNode.j)
      const colDir: V3 = cpi && cpj ? [cpj.x - cpi.x, cpj.y - cpi.y, cpj.z - cpi.z] : [0, 1, 0]
      const [, ypCol] = localAxes(colDir, defaultAxisRotation(colDir, colMemAtNode.axisRotation))
      const dh = Math.hypot(ypCol[0], ypCol[2])
      const depthDir: [number, number] = dh > 1e-9 ? [ypCol[0] / dh, ypCol[2] / dh] : [1, 0]
      const strongAxisDir: 'x' | 'z' = Math.abs(depthDir[0]) >= Math.abs(depthDir[1]) ? 'x' : 'z'

      // A WEB-face tab is welded to the column web and extended past the flange
      // tips so the bolts are erectable — the bolt line moves out by (bf−tw)/2.
      const aWebMm = A_WELD_TO_BOLT + Math.max(0, ((colShp?.bf ?? 0) - (colShp?.tw ?? 0)) / 2)

      const connections: BeamConnection[] = []

      for (const mid of beamMems) {
        const mem = memMap.get(mid)!
        const ni = nodeMap.get(mem.i)!, nj = nodeMap.get(mem.j)!
        const sDir = spanDirOf(ni, nj)

        // The column face the beam frames into: compare the beam's horizontal
        // direction with the column DEPTH axis (|cos| ≥ √2/2 ⇒ flange face).
        const bdx = nj.x - ni.x, bdz = nj.z - ni.z
        const bl = Math.hypot(bdx, bdz)
        const cosA = bl > 1e-9 ? Math.abs((bdx * depthDir[0] + bdz * depthDir[1]) / bl) : 1
        const faceType: ConnFaceType = cosA >= Math.SQRT1_2 ? 'flange' : 'web'

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
        // Web-face tabs carry the larger extended-plate eccentricity.
        const aMm = faceType === 'web' ? aWebMm : A_WELD_TO_BOLT
        const bolts = designBolts(Vu, { dia: 20, aMm })
        const tab = designShearTab(Vu, bolts.n, undefined, undefined, aMm)

        // Moment path per the FACE the flanges meet: direct CJP into a column
        // flange; extension plates into a column web (CJP into the thin web
        // has no stiffness path — AISC DG13 weak-axis detail).
        let flangeConn: FlangeMomentConn | undefined
        if (useMoment && row) {
          flangeConn = designFlangeConn(Mu, row.d, row.tf, row.bf)
          if (faceType === 'web') {
            const wp = designWebMomentPlate(flangeConn.Tf, row.bf, colShp?.d ?? 300, colShp?.tf ?? 15)
            flangeConn = { ...flangeConn, phiCapKn: Math.min(wp.phiPlateKn, wp.phiWeldKn), ok: wp.ok, webPlate: wp }
          }
        }

        // Which beam element(s) the connection engages: web only for a shear tab;
        // web (shear) + both flanges (moment path) for a moment connection.
        const beamElement: BeamAttachment = useMoment ? 'web+flanges' : 'web'

        const tabOk  = tab.phiVn >= Vu - 1e-6 && tab.phiWeldVn >= Vu - 1e-6
        const flangeOk = !flangeConn || flangeConn.ok

        connections.push({
          beamId: mid,
          role: mem.role,
          spanDir: sDir,
          faceType,
          beamElement,
          connType: useMoment ? (faceType === 'web' ? 'moment-web-plate' : 'moment-flange-weld') : 'shear-tab',
          pinned: !useMoment,
          Vu, Mu,
          bolts,
          tab,
          flange: flangeConn,
          ok: bolts.ok && tabOk && flangeOk,
        })
      }

      if (connections.length === 0) continue

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

// ── Beam-to-beam (girder web) connections — AISC SCM Part 10 fin plates ─────

export interface BeamBeamJoint {
  nodeId: string
  /** The CARRYING member (continuous through the joint) — usually a girder. */
  girderId: string
  girderShape: string
  connections: BeamConnection[]   // the supported beams, fin-plated to the girder web
  ok: boolean
}

/**
 * Design fin-plate connections at every joint where a beam frames into the WEB
 * of a girder that runs CONTINUOUSLY through the node (two collinear segments)
 * and no steel column exists there — the beam-to-beam case (reference fig. 20):
 * single plate welded to the girder web, bolted to the supported beam web, the
 * supported beam's top flange coped to clear the girder flange.
 */
export function designBeamBeamJoints(
  model: StructuralModel,
  design: StructureDesign,
): BeamBeamJoint[] {
  if (design.steelBeams.length === 0) return []
  const nodeMap = new Map<string, ModelNode>(model.nodes.map((n) => [n.id, n]))
  const beamRow = new Map<string, SteelBeamScheduleRow>(design.steelBeams.map((b) => [b.id, b]))
  const secOf = new Map(model.sections.map((sec) => [sec.id, sec]))
  const memMap = new Map(model.members.map((m) => [m.id, m]))

  // nodes that already host a steel column joint (handled by designSteelJoints)
  const colNodes = new Set<string>()
  for (const c of design.steelColumns) {
    const cm = memMap.get(c.id)
    if (cm) { colNodes.add(cm.i); colNodes.add(cm.j) }
  }

  const adj = new Map<string, string[]>()
  for (const m of model.members)
    for (const n of [m.i, m.j]) {
      const list = adj.get(n); if (list) list.push(m.id); else adj.set(n, [m.id])
    }

  const flexAt = (nodeId: string) =>
    (adj.get(nodeId) ?? []).map((id) => memMap.get(id)!).filter((m) =>
      (m.role === 'beam' || m.role === 'girder') && secOf.get(m.section)?.material === 'steel')

  // unit horizontal direction of member m pointing AWAY from `nodeId`
  const outDir = (m: { i: string; j: string }, nodeId: string): [number, number] | null => {
    const a = nodeMap.get(nodeId), bId = m.i === nodeId ? m.j : m.i
    const b = nodeMap.get(bId)
    if (!a || !b) return null
    const dx = b.x - a.x, dz = b.z - a.z
    const L = Math.hypot(dx, dz)
    return L > 1e-9 ? [dx / L, dz / L] : null
  }

  const joints: BeamBeamJoint[] = []
  for (const node of model.nodes) {
    if (colNodes.has(node.id)) continue
    const mems = flexAt(node.id)
    if (mems.length < 3) continue   // need a through pair + ≥1 supported beam

    // carrier = collinear pair through the node (outward dirs opposed);
    // among candidates prefer girders, then the deeper shape.
    let carrier: [typeof mems[number], typeof mems[number]] | null = null
    let carrierDepth = -1
    for (let a = 0; a < mems.length; a++)
      for (let b = a + 1; b < mems.length; b++) {
        const da = outDir(mems[a], node.id), db = outDir(mems[b], node.id)
        if (!da || !db) continue
        if (da[0] * db[0] + da[1] * db[1] > -0.999) continue   // not collinear-through
        const shp = shapeByName(secOf.get(mems[a].section)?.shape ?? '')
        const depth = (shp?.d ?? 0) + (mems[a].role === 'girder' ? 1e6 : 0)
        if (depth > carrierDepth) { carrierDepth = depth; carrier = [mems[a], mems[b]] }
      }
    if (!carrier) continue

    const girderSec = secOf.get(carrier[0].section)
    const girderShp = girderSec?.shape ? shapeByName(girderSec.shape) : undefined
    if (!girderShp) continue

    const supported = mems.filter((m) => m.id !== carrier![0].id && m.id !== carrier![1].id)
    if (supported.length === 0) continue

    const connections: BeamConnection[] = []
    for (const mem of supported) {
      const ni = nodeMap.get(mem.i)!, nj = nodeMap.get(mem.j)!
      const row = beamRow.get(mem.id)
      const Vu = row?.Vu ?? 5
      const bolts = designBolts(Vu, { dia: 20 })
      const tab = designShearTab(Vu, bolts.n)
      const tabOk = tab.phiVn >= Vu - 1e-6 && tab.phiWeldVn >= Vu - 1e-6
      // top-flange cope clears the girder flange: half its width + clearance
      // long, flange thickness + fillet allowance deep (SCM Part 9 detailing).
      const cope = {
        lengthMm: Math.round((girderShp.bf ?? 150) / 2 + 12),
        depthMm: Math.round((girderShp.tf ?? 12) + 12),
      }
      connections.push({
        beamId: mem.id, role: mem.role, spanDir: spanDirOf(ni, nj),
        faceType: 'web', beamElement: 'web', connType: 'shear-tab',
        pinned: true, Vu, Mu: 0, bolts, tab, cope,
        ok: bolts.ok && tabOk,
      })
    }

    joints.push({
      nodeId: node.id,
      girderId: carrier[0].id,
      girderShape: girderShp.name,
      connections,
      ok: connections.every((c) => c.ok),
    })
  }
  return joints
}
