// The steel solvers, composed into the shape the pages consume.
//
// TWO CALLERS, AND THE NAME NOW UNDERSELLS IT. The Vercel Edge functions in
// `api/steel/` import these directly — this is what runs on the server. The
// browser also imports it, but only as the FALLBACK `calcApi.ts` reaches for
// when /api/steel/* is not deployed (a static preview, `vite dev`), and only
// via dynamic import, so the engine stays in a lazy chunk and never enters the
// main bundle. Keeping one module for both is the point: the endpoint and the
// fallback cannot disagree about what a beam weighs.
import {
  deriveWSection, beamFlexure, beamShear, beamLoadingSimple,
  columnAxial, weakAxisFlexure, combinedLoading,
  boltGroupGeom, boltShear, eccentricBoltGroup, outOfPlaneBoltGroup,
  pryingAction, shearTabBlockShear, boltGeomFromPositions, plyBearing,
  minFilletSize, maxFilletAlongEdge,
} from '../engine/steelDesign'
import { solveWeldedConnection } from '../engine/weldedConnection'
import { shapeByName } from '../engine/aiscSections'
import { available, basisFactor, type DesignBasis } from '../engine/designBasis'
import type {
  BeamCalcInput, BeamCalcResult,
  ColumnCalcInput, ColumnCalcResult,
  ConnectionCalcInput, ConnectionCalcResult,
} from './calcApi'

const shapeOf = (name: string) => {
  const s = shapeByName(name)
  if (!s) throw new Error(`Unknown AISC shape "${name}"`)
  return s
}

export function localBeam(i: BeamCalcInput): BeamCalcResult {
  const s = shapeOf(i.shapeName)
  const props = deriveWSection(s)
  const basis: DesignBasis = i.basis ?? 'LRFD'
  // Lb arrives in METRES (the page's input unit); beamFlexure works in mm.
  const flex = beamFlexure(s, props, i.Fy, i.Lb * 1000, i.Cb)
  const shear = beamShear(s, props, i.Fy)
  return {
    props, flex, shear, basis,
    loads: beamLoadingSimple({ wDead: i.wDead, wLive: i.wLive, L: i.span }, props.Ix, basis),
    avail: {
      Mn: available(flex.Mn, basis, 'flexure'),
      // §G2.1(a) and (b) carry different pairs — 1.00/1.50 and 0.90/1.67 — so
      // the web slenderness picks the limit state, not just the phi.
      Vn: available(shear.Vn, basis, shear.slenderWeb ? 'shearSlender' : 'shearRolled'),
    },
  }
}

export function localColumn(i: ColumnCalcInput): ColumnCalcResult {
  const s = shapeOf(i.shapeName)
  const props = deriveWSection(s)
  const axial = columnAxial(s, i.Fy, i.L, i.Kx, i.Ky)
  // strong-axis flexure with Lb = member length, Cb = 1 (uniform moment —
  // conservative). `i.L` is in metres, as columnAxial takes it; beamFlexure mm.
  const flexX = beamFlexure(s, props, i.Fy, i.L * 1000, 1.0)
  const weak = weakAxisFlexure(s, props, i.Fy)
  const basis: DesignBasis = i.basis ?? 'LRFD'
  const avail = {
    Pn:  available(axial.Pn,  basis, 'compression'),
    Mnx: available(flexX.Mn,  basis, 'flexure'),
    Mny: available(weak.Mny,  basis, 'flexure'),
  }
  return {
    props, axial, flexX, weak, basis, avail,
    // §H1-1 is a ratio of demand to AVAILABLE strength, so it is basis-agnostic
    // once both sides are on the same basis — which is exactly the trap the
    // dual format sets, and why the available values are passed rather than
    // the phi ones.
    comb: combinedLoading(i.Pu, avail.Pn, i.Mux, avail.Mnx, i.Muy, avail.Mny),
  }
}

export function localConnection(i: ConnectionCalcInput): ConnectionCalcResult {
  const custom = !!i.bolts && i.bolts.length > 0
  const geom = custom
    ? boltGeomFromPositions(i.bolts!)
    : boltGroupGeom(i.nRows, i.nCols, i.sx, i.sy, i.ex_edge, i.ey)
  const nShear = i.nShear ?? 1
  const basis: DesignBasis = i.basis ?? 'LRFD'
  const phiRnBolt = boltShear(i.boltGrade, i.db, i.Vu, i.tPlate, i.FuPlate, i.threads, nShear)
  // The forces come first: §J3.10(a) bearing depends on which way each bolt
  // pushes the tab, so tear-out is per bolt, not one number for the group.
  const shearAvail = available(phiRnBolt.Rn_shear, basis, 'connection')
  const eccentric = eccentricBoltGroup(geom, i.Vu, i.Hu, i.ex_load, i.ey_load, shearAvail, i.db, i.tPlate)
  // The tab, in its own frame: welded along x = 0, free on the other three
  // sides — W and H from the outermost bolts plus the entered edge distances.
  const abs = geom.bolts.map((b) => ({ id: b.id, x: b.x + geom.Cx, y: b.y + geom.Cy }))
  const tabW = Math.max(...abs.map((b) => b.x)) + i.ex_edge
  const tabH = Math.max(...abs.map((b) => b.y)) + i.ey
  const force = new Map(eccentric.bolts.map((f) => [f.id, f]))
  // Vu acts DOWN on the tab (the beam's reaction, delivered through the bolts)
  const onTab = plyBearing(abs, (id) => {
    const f = force.get(id)
    return f ? { x: f.Vx, y: -f.Vy } : { x: 0, y: -1 }
  }, i.db, i.tPlate, i.FuPlate, { xMax: tabW, yMin: 0, yMax: tabH })
  // The beam web bears too, pushed the other way (the bolts carry the beam's
  // reaction UP into its web). The web runs on into the flanges, so it can
  // only tear toward the next hole or out of the beam end, 13 mm past the
  // support face.
  const web = i.twWeb && i.twWeb > 0
    ? plyBearing(abs, (id) => {
      const f = force.get(id)
      return f ? { x: -f.Vx, y: f.Vy } : { x: 0, y: 1 }
    }, i.db, i.twWeb, i.FuWeb ?? 450, { xMin: 13 })
    : null
  // each bolt against the least of its shear, tab and web strengths; the
  // worst ratio governs, and what limits that bolt is reported
  type By = ConnectionCalcResult['boltGovernedBy']
  let boltUtil = 0, boltGoverning = abs[0]?.id ?? '', boltGovernedBy: By = 'bolt shear'
  const bearing = onTab.map((t, k) => {
    const w = web?.[k]
    const cands: [number, By][] = [
      [phiRnBolt.Rn_shear, 'bolt shear'],
      [t.Rn, t.Rn_tear < t.Rn_bear ? 'tab tear-out' : 'tab bearing'],
      ...(w ? [[w.Rn, w.Rn_tear < w.Rn_bear ? 'web tear-out' : 'web bearing'] as [number, By]] : []),
    ]
    const [Rn, by] = cands.reduce((a, b) => (b[0] < a[0] ? b : a))
    const avail = available(Rn, basis, 'connection')
    const R = force.get(t.id)?.R ?? 0
    const u = avail > 0 ? R / avail : Infinity
    if (u > boltUtil) { boltUtil = u; boltGoverning = t.id; boltGovernedBy = by }
    return { ...t, availBearing: available(t.Rn, basis, 'connection'), avail }
  })
  const webBearing = web ? web.map((b) => ({ ...b, availBearing: available(b.Rn, basis, 'connection') })) : null

  // The tab welds: two fillets along the support face, x = 0 from 0 to the tab
  // height, carrying the bolt group's load where it acts — the centroid plus
  // the entered eccentricity, so the weld sees V, H and the moment V·a about
  // its own line. Two equal fillets on one line = one line of twice the throat.
  let weld: ConnectionCalcResult['weld'] = null
  if (i.weldSize && i.weldSize > 0) {
    const FEXX = i.FEXX ?? 482
    const Px = i.Hu, Py = -i.Vu
    const P = Math.hypot(Px, Py)
    const r = solveWeldedConnection({
      segments: [{ id: 'W', x1: 0, y1: 0, x2: 0, y2: tabH }], size: 2 * i.weldSize, FEXX,
      phi: basisFactor(basis, 'connection'),
      load: { P, angleDeg: P > 0 ? (Math.atan2(Py, Px) * 180) / Math.PI : -90, px: geom.Cx + i.ex_load, py: geom.Cy + i.ey_load },
    })
    const wMin = minFilletSize(i.tPlate), wMax = maxFilletAlongEdge(i.tPlate)
    const sizeOk = i.weldSize >= wMin - 1e-9 && i.weldSize <= wMax + 1e-9
    const util = r.capacityPerLen > 0 ? r.fMax / r.capacityPerLen : Infinity
    weld = { w: i.weldSize, FEXX, L: tabH, fMax: r.fMax, availPerLen: r.capacityPerLen, util, wMin, wMax, sizeOk, ok: sizeOk && util <= 1 + 1e-9 }
  }
  const worstBearing = Math.min(...bearing.map((b) => b.availBearing), ...(webBearing ?? []).map((b) => b.availBearing))
  const avail = {
    shear:     shearAvail,
    bearing:   worstBearing,
    governing: Math.min(shearAvail, worstBearing),
  }
  const outOfPlane = i.e_out > 0
    ? outOfPlaneBoltGroup(geom, eccentric.bolts, i.e_out, i.Vu, i.boltGrade, i.db, i.threads, basis)
    : null
  const prying = outOfPlane && i.b_gage > 0
    ? pryingAction(outOfPlane.Tmax, outOfPlane.phiTn_crit, i.b_gage, i.ex_edge, i.sy, i.tPlate, i.db, i.FyPlate, basis)
    : null
  // A free-form pattern has no single bolt line to tear out along, so the
  // shear-tab paths do not apply; the page says so rather than printing a
  // number derived from a geometry that is not there.
  const blockShear = custom
    ? []
    : shearTabBlockShear(i.nRows, i.sy, i.ey, i.ey, i.ex_edge, i.db, i.tPlate, i.FyPlate, i.FuPlate)
  return {
    geom, phiRnBolt, eccentric, outOfPlane, prying, blockShear,
    // the elastic method is linear in the load, so the worst ratio scales Vu
    maxVu: boltUtil > 1e-12 ? i.Vu / boltUtil : Infinity,
    bearing, boltUtil, boltGoverning, boltGovernedBy, webBearing, weld,
    tauMax: (eccentric.Rmax * 1000) / (phiRnBolt.Ab * nShear),
    basis, avail,
    availBlockShear: blockShear.map((c) =>
      available(Math.min(c.Rn_fract, c.Rn_cap), basis, 'connection')),
  }
}
