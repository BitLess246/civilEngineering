// Shared SVG dimension-line primitives — architectural 45° ticks, extension
// lines and rotated labels — extracted from FootingSchematic so every
// schematic (footing, combined, beam, pile cap) draws dimensions the same way.
const DIM = '#1f77b4'
const GAP = 4
const TK = 4

export function Tick({ x, y }: { x: number; y: number }) {
  // 45° architectural tick
  return <line x1={x - TK} y1={y + TK} x2={x + TK} y2={y - TK} stroke={DIM} strokeWidth={1.2} />
}

/** Horizontal dimension below a feature (extension lines + dim line + ticks + label). */
export function DimBelow({ xA, xB, featY, dY, label }: {
  xA: number; xB: number; featY: number; dY: number; label: string
}) {
  return (
    <g>
      <line x1={xA} y1={featY + GAP} x2={xA} y2={dY + 5} stroke={DIM} strokeWidth={0.6} />
      <line x1={xB} y1={featY + GAP} x2={xB} y2={dY + 5} stroke={DIM} strokeWidth={0.6} />
      <line x1={xA} y1={dY} x2={xB} y2={dY} stroke={DIM} strokeWidth={0.9} />
      <Tick x={xA} y={dY} />
      <Tick x={xB} y={dY} />
      <text x={(xA + xB) / 2} y={dY - 4} fontSize={9.5} fill={DIM} textAnchor="middle"
        paintOrder="stroke" stroke="#fff" strokeWidth={2.6}>{label}</text>
    </g>
  )
}

/** Vertical dimension to one side of a feature. side='right' puts it on the right. */
export function DimSide({ yA, yB, featX, dX, label, side }: {
  yA: number; yB: number; featX: number; dX: number; label: string; side: 'left' | 'right'
}) {
  const ext = side === 'right' ? 5 : -5
  const lab = side === 'right' ? dX + 11 : dX - 11
  const e1 = side === 'right' ? featX + GAP : featX - GAP
  return (
    <g>
      <line x1={e1} y1={yA} x2={dX + ext} y2={yA} stroke={DIM} strokeWidth={0.6} />
      <line x1={e1} y1={yB} x2={dX + ext} y2={yB} stroke={DIM} strokeWidth={0.6} />
      <line x1={dX} y1={yA} x2={dX} y2={yB} stroke={DIM} strokeWidth={0.9} />
      <Tick x={dX} y={yA} />
      <Tick x={dX} y={yB} />
      <text x={lab} y={(yA + yB) / 2} fontSize={9.5} fill={DIM} textAnchor="middle"
        transform={`rotate(-90 ${lab} ${(yA + yB) / 2})`} paintOrder="stroke" stroke="#fff" strokeWidth={2.6}>{label}</text>
    </g>
  )
}
