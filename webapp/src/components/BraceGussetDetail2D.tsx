// ─────────────────────────────────────────────────────────────────────────
// A designed brace end, beside its schedule row: the gusset in the plane of
// the frame (`engine/braceGussetDetail`) — the slotted HSS, its four fillets,
// the Whitmore section and the UFM interfaces with their welds.
// ─────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import type { SteelBraceScheduleRow } from '../engine/pipeline'
import { buildBraceGussetDetail } from '../engine/braceGussetDetail'
import { planToSvg } from '../engine/planRenderer'
import { DrawingFrame } from './DrawingFrame'

export function BraceGussetDetail2D({ row }: { row: SteelBraceScheduleRow }) {
  const svgs = useMemo(() => row.ends.map((e) => ({
    node: e.node,
    svg: planToSvg(buildBraceGussetDetail({ end: e.design, frame: e.frame, braceShape: row.shape, node: e.node }), 700),
  })), [row])
  // Engine-generated markup — `planToSvg` escapes every string it is given.
  return (
    <DrawingFrame label="brace gusset details">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {svgs.map((s) => (
          <div key={s.node} className="rounded-lg border border-hairline bg-sheet [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: s.svg }} />
        ))}
      </div>
    </DrawingFrame>
  )
}
