import { Router } from 'express'
import { shapeByName } from '../../../webapp/src/engine/aiscSections'
import {
  deriveWSection,
  beamFlexure, beamShear, beamLoadingSimple,
  columnAxial, weakAxisFlexure, combinedLoading,
  boltShear, boltGroupGeom, eccentricBoltGroup,
  shearTabBlockShear, outOfPlaneBoltGroup, pryingAction,
  weldStrength,
} from '../../../webapp/src/engine/steelDesign'
import type { BoltGrade, ElectrodeClass } from '../../../webapp/src/engine/steelDesign'

// Protected AISC 360-16 LRFD steel solvers. These modules are bundled into
// this service at build time and run server-side — never sent to the browser.
export const steelRouter = Router()

const allNumbers = (vals: unknown[]) =>
  vals.every((v) => typeof v === 'number' && Number.isFinite(v))

const VALID_BOLT_GRADES: BoltGrade[] = ['A325M', 'A490M']
const VALID_ELECTRODES: ElectrodeClass[] = ['E70', 'E80', 'E90', 'E100']

// ── POST /api/steel/beam ────────────────────────────────────────────────────
// §F2 flexure, §G2.1 shear, service deflection.
steelRouter.post('/beam', (req, res) => {
  const { shapeName, Fy, span, Lb, Cb, wDead, wLive } = req.body ?? {}
  const shape = typeof shapeName === 'string' ? shapeByName(shapeName) : undefined
  if (!shape) return res.status(400).json({ error: `Unknown shape: ${String(shapeName)}` })
  if (!allNumbers([Fy, span, Lb, Cb, wDead, wLive]))
    return res.status(400).json({ error: 'Fy, span, Lb, Cb, wDead, wLive must be finite numbers' })

  const props = deriveWSection(shape)
  const flex  = beamFlexure(shape, props, Fy, Lb * 1000, Cb)
  const shear = beamShear(shape, props, Fy)
  const loads = beamLoadingSimple({ wDead, wLive, L: span }, props.Ix)
  return res.json({ props, flex, shear, loads })
})

// ── POST /api/steel/column ──────────────────────────────────────────────────
// §E3 axial Fcr, §F2 strong-axis flexure, §F6 weak-axis flexure, §H1-1 combined.
// Pu is the already-factored axial demand (max(1.4D, 1.2D+1.6L) computed client-side).
steelRouter.post('/column', (req, res) => {
  const { shapeName, Fy, L, Kx, Ky, Pu, Mux, Muy = 0 } = req.body ?? {}
  const shape = typeof shapeName === 'string' ? shapeByName(shapeName) : undefined
  if (!shape) return res.status(400).json({ error: `Unknown shape: ${String(shapeName)}` })
  if (!allNumbers([Fy, L, Kx, Ky, Pu, Mux]))
    return res.status(400).json({ error: 'Fy, L, Kx, Ky, Pu, Mux must be finite numbers' })

  const props = deriveWSection(shape)
  const axial = columnAxial(shape, Fy, L, Kx, Ky)
  const flexX = beamFlexure(shape, props, Fy, L * 1000, 1.0)   // Cb = 1.0 for column bracing
  const weak  = weakAxisFlexure(shape, props, Fy)
  const comb  = combinedLoading(Pu, axial.phiPn, Mux, flexX.phiMn, Number(Muy), weak.phiMny)
  return res.json({ props, axial, flexX, weak, comb })
})

// ── POST /api/steel/connection ──────────────────────────────────────────────
// Bolt group (shear + in-plane eccentricity + out-of-plane + prying + block shear)
// and fillet weld capacity (§J2.4, §J3.6, §J3.7, §J3.9, §J3.10, §J4.3).
steelRouter.post('/connection', (req, res) => {
  const {
    Vu, Hu = 0,
    boltGrade, db, nRows, nCols, sy, sx, ey, ex_edge,
    threads, tPlate, FuPlate, FyPlate,
    ex_load = 0, ey_load = 0, e_out = 0, b_gage = 0,
    electrode, wSize,
  } = req.body ?? {}

  if (!allNumbers([Vu, db, nRows, nCols, sy, sx, ey, ex_edge, tPlate, FuPlate, FyPlate, wSize]))
    return res.status(400).json({ error: 'Required numeric fields missing or non-finite' })
  if (!VALID_BOLT_GRADES.includes(boltGrade as BoltGrade))
    return res.status(400).json({ error: `Invalid boltGrade: ${String(boltGrade)}` })
  if (!VALID_ELECTRODES.includes(electrode as ElectrodeClass))
    return res.status(400).json({ error: `Invalid electrode: ${String(electrode)}` })
  if (typeof threads !== 'boolean')
    return res.status(400).json({ error: 'threads must be boolean' })

  const geom       = boltGroupGeom(nRows, nCols, sx, sy, ex_edge, ey)
  const phiRnBolt  = boltShear(boltGrade as BoltGrade, db, Vu, tPlate, FuPlate, threads)
  const eccentric  = eccentricBoltGroup(geom, Vu, Hu, ex_load, ey_load, phiRnBolt.phiRn, db, tPlate)
  const outOfPlane = (e_out as number) > 0
    ? outOfPlaneBoltGroup(geom, eccentric.bolts, e_out, Vu, boltGrade as BoltGrade, db, threads)
    : null
  const prying = outOfPlane && (b_gage as number) > 0
    ? pryingAction(outOfPlane.Tmax, outOfPlane.phiTn_crit, b_gage, ex_edge, sy, tPlate, db, FyPlate)
    : null
  const blockShear    = shearTabBlockShear(nRows, sy, ey, ey, ex_edge, db, tPlate, FyPlate, FuPlate)
  const weld          = weldStrength(electrode as ElectrodeClass, wSize, Vu)
  const weldCapacity  = geom.plateH * weld.phiRnw

  return res.json({ geom, phiRnBolt, eccentric, outOfPlane, prying, blockShear, weld, weldCapacity })
})
