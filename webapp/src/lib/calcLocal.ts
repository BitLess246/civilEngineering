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
  return {
    props,
    flex: beamFlexure(s, props, i.Fy, i.Lb, i.Cb),
    shear: beamShear(s, props, i.Fy),
    loads: beamLoadingSimple({ wDead: i.wDead, wLive: i.wLive, L: i.span }, props.Ix),
  }
}

export function localColumn(i: ColumnCalcInput): ColumnCalcResult {
  const s = shapeOf(i.shapeName)
  const props = deriveWSection(s)
  const axial = columnAxial(s, i.Fy, i.L, i.Kx, i.Ky)
  // strong-axis flexure with Lb = member length, Cb = 1 (uniform moment — conservative)
  const flexX = beamFlexure(s, props, i.Fy, i.L, 1.0)
  const weak = weakAxisFlexure(s, props, i.Fy)
  return {
    props, axial, flexX, weak,
    comb: combinedLoading(i.Pu, axial.phiPn, i.Mux, flexX.phiMn, i.Muy, weak.phiMny),
  }
}

export function localConnection(i: ConnectionCalcInput): ConnectionCalcResult {
  const custom = !!i.bolts && i.bolts.length > 0
  const geom = custom
    ? boltGeomFromPositions(i.bolts!)
    : boltGroupGeom(i.nRows, i.nCols, i.sx, i.sy, i.ex_edge, i.ey)
  const nShear = i.nShear ?? 1
  const phiRnBolt = boltShear(i.boltGrade, i.db, i.Vu, i.tPlate, i.FuPlate, i.threads, nShear)
  const eccentric = eccentricBoltGroup(geom, i.Vu, i.Hu, i.ex_load, i.ey_load, phiRnBolt.phiRn, i.db, i.tPlate)
  const outOfPlane = i.e_out > 0
    ? outOfPlaneBoltGroup(geom, eccentric.bolts, i.e_out, i.Vu, i.boltGrade, i.db, i.threads)
    : null
  const prying = outOfPlane && i.b_gage > 0
    ? pryingAction(outOfPlane.Tmax, outOfPlane.phiTn_crit, i.b_gage, i.ex_edge, i.sy, i.tPlate, i.db, i.FyPlate)
    : null
  return {
    geom, phiRnBolt, eccentric, outOfPlane, prying,
    // A free-form pattern has no single bolt line to tear out along, so the
    // shear-tab paths do not apply; the page says so rather than printing a
    // number derived from a geometry that is not there.
    blockShear: custom
      ? []
      : shearTabBlockShear(i.nRows, i.sy, i.ey, i.ey, i.ex_edge, i.db, i.tPlate, i.FyPlate, i.FuPlate),
    maxVu: eccentric.Rmax > 1e-9 ? (i.Vu * phiRnBolt.phiRn) / eccentric.Rmax : Infinity,
    tauMax: (eccentric.Rmax * 1000) / (phiRnBolt.Ab * nShear),
  }
}
