// ─────────────────────────────────────────────────────────────────────────
// A designed column base plate, beside its schedule row: the PLAN and the
// SECTION of `engine/basePlateDetail` — the plate, the column on it, the rods
// at their designed positions and embedment, grout and fillets.
// ─────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import type { BasePlateScheduleRow } from '../engine/pipeline'
import { buildBasePlateDetail } from '../engine/basePlateDetail'
import { planToSvg } from '../engine/planRenderer'
import { DrawingFrame } from './DrawingFrame'

export function BasePlateDetail2D({ row, col }: { row: BasePlateScheduleRow; col: { d: number; bf: number; tf: number; tw: number } }) {
  const svg = useMemo(() => planToSvg(buildBasePlateDetail({ row, col }), 900), [row, col])
  // Engine-generated markup — `planToSvg` escapes every string it is given.
  return (
    <DrawingFrame label="base plate detail">
      <div className="rounded-lg border border-hairline bg-sheet [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
    </DrawingFrame>
  )
}
