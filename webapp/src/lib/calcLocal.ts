// In-browser fallback for the steel calculation API. Loaded ONLY via dynamic
// import from calcApi.ts when the API is unreachable (dev without the service,
// static deploys) — so the engine code lands in a lazy chunk, never in the
// main bundle, preserving calcApi's no-value-imports rule for the eager path.
// Compositions mirror the API endpoints 1:1 using the same engine functions.
import {
  deriveWSection, beamFlexure, beamShear, beamLoadingSimple,
  columnAxial, weakAxisFlexure, combinedLoading,
  boltGroupGeom, boltShear, eccentricBoltGroup, outOfPlaneBoltGroup,
  pryingAction, shearTabBlockShear, boltGeomFromPositions,
} from '../engine/steelDesign'
import { shapeByName } from '../engine/aiscSections'
import { available, type DesignBasis } from '../engine/designBasis'
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
  const flex = beamFlexure(s, props, i.Fy, i.Lb, i.Cb)
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
  // strong-axis flexure with Lb = member length, Cb = 1 (uniform moment — conservative)
  const flexX = beamFlexure(s, props, i.Fy, i.L, 1.0)
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
  const avail = {
    shear:     available(phiRnBolt.Rn_shear,   basis, 'connection'),
    bearing:   available(phiRnBolt.Rn_bearing, basis, 'connection'),
    governing: available(phiRnBolt.Rn,         basis, 'connection'),
  }
  const eccentric = eccentricBoltGroup(geom, i.Vu, i.Hu, i.ex_load, i.ey_load, avail.governing, i.db, i.tPlate)
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
    maxVu: eccentric.Rmax > 1e-9 ? (i.Vu * avail.governing) / eccentric.Rmax : Infinity,
    tauMax: (eccentric.Rmax * 1000) / (phiRnBolt.Ab * nShear),
    basis, avail,
    availBlockShear: blockShear.map((c) =>
      available(Math.min(c.Rn_fract, c.Rn_cap), basis, 'connection')),
  }
}
