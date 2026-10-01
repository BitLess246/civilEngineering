// ─────────────────────────────────────────────────────────────────────────
// A designed steel connection, beside its schedule row: the ELEVATION and the
// END SECTION of `engine/steelConnectionDetail`. The Plans tab and the PDF
// print that same drawing as the mark's sheet, so the detail a reader sees
// here and the one on the drawing set are one object rendered twice — this
// component used to hand-draw its own SVG, which nothing else could print.
// ─────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import type { BeamConnection } from '../engine/steelConnections'
import { buildConnectionDetail } from '../engine/steelConnectionDetail'
import { planToSvg } from '../engine/planRenderer'
import { DrawingFrame } from './DrawingFrame'

export function ConnectionDetail2D({ conn, hostShape, hostKind, faceType, beamShape, mark }: {
  conn: BeamConnection
  hostShape: string            // column or girder AISC shape name
  hostKind: 'column' | 'girder'
  faceType: 'flange' | 'web'
  beamShape?: string           // supported beam AISC shape name
  mark?: string                // typical-detail mark (lib/steelMarks)
}) {
  const svg = useMemo(
    () => planToSvg(buildConnectionDetail({ conn, hostShape, hostKind, faceType, beamShape, mark }), 900),
    [conn, hostShape, hostKind, faceType, beamShape, mark],
  )
  // Engine-generated markup — every string in it comes from `planToSvg`, which
  // escapes the text it is given.
  return (
    <DrawingFrame label="connection detail">
      <div className="rounded-lg border border-hairline bg-sheet [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
    </DrawingFrame>
  )
}
