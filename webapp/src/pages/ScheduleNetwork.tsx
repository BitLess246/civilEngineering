import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { useScheduleProject } from '../lib/useScheduleProject'
import { useScheduleSolve } from '../lib/useScheduleSolve'
import { layoutNetwork, type NetActivity, type NetNode } from '../lib/network'
import { PageHeader } from '../components/calc'

// Phase 6 — Activity-on-node network diagram at /schedule/network. Layered
// left→right DAG (layout in lib/network.ts), status-neutral nodes with the CPM
// figures, critical path in brick red, and draggable nodes (view-only: moving a
// node never changes the schedule). Reuses the store-backed project + solve.

const btn = 'inline-flex items-center gap-1.5 rounded-md border border-[#d6d3c9] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#3d4a5c] hover:border-[#0f4c92] hover:text-[#0f4c92]'
const CRITICAL = '#c2402a'
const clip = (s: string, n = 20) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

function Diagram({ nodes, edges, width, height }: ReturnType<typeof layoutNetwork>) {
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({})
  const drag = useRef<{ id: string; px: number; py: number; ox: number; oy: number } | null>(null)
  const posOf = (n: NetNode) => pos[n.id] ?? { x: n.x, y: n.y }
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  const onDown = (e: ReactPointerEvent, n: NetNode) => {
    const p = posOf(n)
    drag.current = { id: n.id, px: e.clientX, py: e.clientY, ox: p.x, oy: p.y }
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    setPos((s) => ({ ...s, [d.id]: { x: d.ox + (e.clientX - d.px), y: d.oy + (e.clientY - d.py) } }))
  }
  const onUp = () => { drag.current = null }

  // Bounding box (grows as nodes are dragged) so the canvas can scroll to them.
  const w = Math.max(width, ...nodes.map((n) => posOf(n).x + n.w + 16))
  const h = Math.max(height, ...nodes.map((n) => posOf(n).y + n.h + 16))

  return (
    <div className="overflow-auto rounded-lg border border-[#e3e1da] bg-white [background-image:linear-gradient(#f4f3ef_1px,transparent_1px),linear-gradient(90deg,#f4f3ef_1px,transparent_1px)] [background-size:24px_24px]" style={{ maxHeight: '70vh' }}>
      <svg width={w} height={h} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} style={{ touchAction: 'none' }}>
        <defs>
          <marker id="net-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L7,3 L0,6 Z" fill="#b7b0a0" />
          </marker>
          <marker id="net-arrow-crit" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L7,3 L0,6 Z" fill={CRITICAL} />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const a = nodeById.get(e.from), b = nodeById.get(e.to)
          if (!a || !b) return null
          const pa = posOf(a), pb = posOf(b)
          const sx = pa.x + a.w, sy = pa.y + a.h / 2
          const tx = pb.x, ty = pb.y + b.h / 2
          const c = Math.max(30, (tx - sx) / 2)
          return (
            <path key={i} d={`M ${sx} ${sy} C ${sx + c} ${sy}, ${tx - c} ${ty}, ${tx} ${ty}`} fill="none"
              stroke={e.critical ? CRITICAL : '#b7b0a0'} strokeWidth={e.critical ? 2 : 1}
              markerEnd={`url(#${e.critical ? 'net-arrow-crit' : 'net-arrow'})`} />
          )
        })}
        {nodes.map((n) => {
          const p = posOf(n)
          const fill = n.critical ? '#fdf3f0' : '#ffffff'
          const stroke = n.critical ? CRITICAL : '#c9c3b4'
          return (
            <g key={n.id} transform={`translate(${p.x} ${p.y})`} onPointerDown={(e) => onDown(e, n)} style={{ cursor: 'grab' }}>
              {n.milestone ? (
                <>
                  <rect width={n.w} height={n.h} rx={6} fill={fill} stroke={stroke} strokeWidth={n.critical ? 2 : 1} strokeDasharray="4 3" />
                  <text x={10} y={20} className="fill-[#0f1b2a]" style={{ fontSize: 12, fontWeight: 700 }}>◆ {clip(n.name)}</text>
                  <text x={10} y={40} className="fill-[#5c6675]" style={{ fontSize: 10, fontFamily: 'monospace' }}>milestone · day {n.es}</text>
                </>
              ) : (
                <>
                  <rect width={n.w} height={n.h} rx={6} fill={fill} stroke={stroke} strokeWidth={n.critical ? 2 : 1} />
                  {n.critical && <rect width={4} height={n.h} rx={2} fill={CRITICAL} />}
                  <text x={12} y={19} className="fill-[#0f1b2a]" style={{ fontSize: 12, fontWeight: 700 }}>{clip(n.name)}</text>
                  <line x1={8} y1={28} x2={n.w - 8} y2={28} stroke="#eeece5" />
                  <text x={12} y={44} className="fill-[#5c6675]" style={{ fontSize: 10, fontFamily: 'monospace' }}>ES {n.es} · EF {n.ef}</text>
                  <text x={n.w - 12} y={44} textAnchor="end" style={{ fontSize: 10, fontFamily: 'monospace', fill: n.critical ? CRITICAL : '#a39d8d' }}>TF {n.totalFloat}</text>
                </>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function ScheduleNetwork() {
  const api = useScheduleProject()
  const solve = useScheduleSolve(api.project)
  const [nonce, setNonce] = useState(0)   // bump to remount → reset drag positions
  const project = api.project

  const layout = useMemo(() => {
    if (!project || !solve.cpm) return null
    const acts: NetActivity[] = project.activities.map((a) => ({ id: a.id, name: a.name, predecessors: a.predecessors, milestone: a.milestone }))
    return layoutNetwork(acts, solve.cpm)
  }, [project, solve.cpm])

  const actions = project && (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => setNonce((n) => n + 1)} className={btn}>Reset layout</button>
      <Link to="/schedule" className={btn}>Grid</Link>
    </div>
  )

  return (
    <>
      <PageHeader title="Network Diagram" badges={['AON', 'critical path']} actions={actions ?? undefined} />
      <div className="mx-auto max-w-[1400px] space-y-4 p-5 sm:p-7">
        {!project ? (
          <div className="rounded-lg border border-dashed border-[#d6d3c9] bg-white px-6 py-16 text-center">
            <h2 className="text-[16px] font-bold text-[#0f1b2a]">No schedule open</h2>
            <Link to="/schedule" className="mt-4 inline-flex rounded-md bg-[#0f4c92] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#0d3f78]">Go to the schedule grid</Link>
          </div>
        ) : project.activities.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#d6d3c9] bg-white px-6 py-16 text-center text-[13px] text-[#a39d8d]">No activities to plot — add some in the grid.</div>
        ) : !solve.ok || !layout ? (
          <div className="rounded-lg border border-[#efd9cc] bg-[#fdf3ee] px-4 py-2.5 text-[12px] text-[#8f4a2f]">The schedule has {solve.errorCount} blocking issue(s); fix them in the grid to draw the network.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#5c6675]">
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded-[2px] border-2" style={{ borderColor: CRITICAL, background: '#fdf3f0' }} /> Critical activity</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded-[2px] border border-[#c9c3b4] bg-white" /> Non-critical</span>
              <span className="inline-flex items-center gap-1.5"><svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke={CRITICAL} strokeWidth="2" /></svg> Critical link</span>
              <span>Nodes are draggable · ES/EF and total float are per the CPM solve.</span>
            </div>
            <Diagram key={nonce} {...layout} />
          </>
        )}
      </div>
    </>
  )
}
