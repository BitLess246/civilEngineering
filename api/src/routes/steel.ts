import { Router } from 'express'
import { shapeByName } from '../../../webapp/src/engine/aiscSections'
import {
  deriveWSection,
  beamFlexure,
  beamShear,
  beamLoadingSimple,
  columnAxial,
  weakAxisFlexure,
} from '../../../webapp/src/engine/steelDesign'

// Protected AISC 360-16 LRFD steel solvers. The engine modules above are bundled
// into this service at build time and run server-side only — they are never sent
// to the browser. The SPA posts inputs here and renders the returned results.
export const steelRouter = Router()

const allNumbers = (vals: unknown[]) =>
  vals.every((v) => typeof v === 'number' && Number.isFinite(v))

// POST /api/steel/beam — §F2 flexure, §G2.1 shear, service deflection.
// Mirrors the synchronous logic the BeamTab used to run client-side.
steelRouter.post('/beam', (req, res) => {
  const { shapeName, Fy, span, Lb, Cb, wDead, wLive } = req.body ?? {}
  const shape = typeof shapeName === 'string' ? shapeByName(shapeName) : undefined
  if (!shape) return res.status(400).json({ error: `Unknown shape: ${String(shapeName)}` })
  if (!allNumbers([Fy, span, Lb, Cb, wDead, wLive]))
    return res.status(400).json({ error: 'Fy, span, Lb, Cb, wDead, wLive must be finite numbers' })

  const props = deriveWSection(shape)
  const flex = beamFlexure(shape, props, Fy, Lb * 1000, Cb)
  const shear = beamShear(shape, props, Fy)
  const loads = beamLoadingSimple({ wDead, wLive, L: span }, props.Ix)
  return res.json({ props, flex, shear, loads })
})

// POST /api/steel/column — §E3 axial Fcr (both axes) + §F6 weak-axis flexure.
steelRouter.post('/column', (req, res) => {
  const { shapeName, Fy, L, Kx, Ky } = req.body ?? {}
  const shape = typeof shapeName === 'string' ? shapeByName(shapeName) : undefined
  if (!shape) return res.status(400).json({ error: `Unknown shape: ${String(shapeName)}` })
  if (!allNumbers([Fy, L, Kx, Ky]))
    return res.status(400).json({ error: 'Fy, L, Kx, Ky must be finite numbers' })

  const props = deriveWSection(shape)
  const axial = columnAxial(shape, Fy, L, Kx, Ky)
  const weak = weakAxisFlexure(shape, props, Fy)
  return res.json({ props, axial, weak })
})
