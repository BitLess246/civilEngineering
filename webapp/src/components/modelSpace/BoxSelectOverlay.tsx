// The selection box over the 3D view. While Box mode is on this layer sits on
// top of the canvas and takes the left drag that would otherwise orbit, the
// way STAAD's beam cursor does: drag LEFT → RIGHT for a WINDOW (solid outline,
// takes what lies wholly inside), RIGHT → LEFT for a CROSSING (dashed, takes
// anything touched). Ctrl/⌘/Shift at release adds to the selection. A click
// without a drag picks the member nearest the pointer, since the layer is in
// front of the members' own click targets.
//
// It owns only the gesture. Which members lie where on screen is asked of the
// page (`project`), which holds the camera and the model.
import { useRef, useState, type PointerEvent } from 'react'
import { boxMode, boxSelect, nearestSegment, normRect, type P2, type ScreenSegment } from '../../lib/selection'

const CLICK_PX = 4

export function BoxSelectOverlay({ project, onBox, onClickPick }: {
  /** Members in screen px of a layer `w` × `h`. */
  project: (w: number, h: number) => ScreenSegment[]
  onBox: (ids: string[], add: boolean) => void
  onClickPick: (id: string | null, add: boolean) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ a: P2; b: P2 } | null>(null)

  const at = (e: PointerEvent<HTMLDivElement>): P2 => {
    const r = host.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const finish = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag || !host.current) return
    const b = at(e), a = drag.a
    setDrag(null)
    const add = e.ctrlKey || e.metaKey || e.shiftKey
    const { width, height } = host.current.getBoundingClientRect()
    const segs = project(width, height)
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < CLICK_PX) { onClickPick(nearestSegment(segs, b), add); return }
    onBox(boxSelect(segs, normRect(a, b), boxMode(a[0], b[0])), add)
  }

  const r = drag ? normRect(drag.a, drag.b) : null
  const crossing = drag ? boxMode(drag.a[0], drag.b[0]) === 'crossing' : false
  return (
    <div ref={host} className="absolute inset-0 z-[1] cursor-crosshair touch-none select-none"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const p = at(e); setDrag({ a: p, b: p })
      }}
      onPointerMove={(e) => { if (drag) setDrag({ a: drag.a, b: at(e) }) }}
      onPointerUp={finish}
      onPointerCancel={() => setDrag(null)}>
      {r && (r.x1 - r.x0 > 1 || r.y1 - r.y0 > 1) && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          <rect x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0}
            fill={crossing ? 'rgba(22,163,74,0.08)' : 'rgba(37,99,235,0.08)'}
            stroke={crossing ? '#16a34a' : '#2563eb'} strokeWidth={1.2} strokeDasharray={crossing ? '5 3' : undefined} />
        </svg>
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded border border-white/15 bg-rail/80 px-2 py-1 font-mono text-[10px] text-rail-muted">
        box: drag → window · ← crossing · ⌃ adds · Esc exits
      </div>
    </div>
  )
}
