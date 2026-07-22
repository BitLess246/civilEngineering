import { useMemo, type JSX } from 'react'
import type { ModelActivity } from '../engine/modelSchedule'
import type { CpmActivity } from '../engine/schedule/cpm'

const BOX_W = 148, BOX_H = 66, COL_W = 214, ROW_H = 108, PAD = 18

/** Editable Activity-on-Node critical-path diagram: each activity is a node box
 *  (ES | DUR | EF · name · LS | TF | LF) with arrows to its successors, the
 *  critical path in red, and an editable DUR field.  Editing a duration calls
 *  `onEditDuration`, which re-solves the schedule so this diagram, the Gantt and
 *  the table all update together. */
export function CriticalPathDiagram({ activities, cpm, critical, onEditDuration }: {
  activities: ModelActivity[]
  cpm: Map<string, CpmActivity>
  critical: Set<string>
  onEditDuration: (id: string, duration: number) => void
}): JSX.Element {
  const layout = useMemo(() => {
    // longest-path rank → columns; order within a column by early start
    const rank = new Map<string, number>()
    for (const a of activities) rank.set(a.id, 0)
    for (let pass = 0; pass < activities.length + 2; pass++) {
      let changed = false
      for (const a of activities) for (const l of a.predecessors) {
        const r = (rank.get(l.id) ?? 0) + 1
        if (r > (rank.get(a.id) ?? 0)) { rank.set(a.id, r); changed = true }
      }
      if (!changed) break
    }
    const cols = new Map<number, ModelActivity[]>()
    for (const a of activities) { const r = rank.get(a.id)!; (cols.get(r) ?? cols.set(r, []).get(r)!).push(a) }
    const pos = new Map<string, { x: number; y: number }>()
    let maxRows = 0
    for (const [r, list] of cols) {
      list.sort((a, b) => (cpm.get(a.id)?.es ?? 0) - (cpm.get(b.id)?.es ?? 0))
      list.forEach((a, i) => pos.set(a.id, { x: PAD + r * COL_W, y: PAD + i * ROW_H }))
      maxRows = Math.max(maxRows, list.length)
    }
    const width = PAD * 2 + (Math.max(0, ...[...cols.keys()]) * COL_W) + BOX_W
    const height = PAD * 2 + Math.max(1, maxRows) * ROW_H - (ROW_H - BOX_H)
    return { pos, width, height }
  }, [activities, cpm])

  const cell = (v: number | string, cls: string) =>
    <div className={`flex items-center justify-center text-[10.5px] font-semibold ${cls}`}>{v}</div>

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="relative" style={{ width: layout.width, height: layout.height }}>
        {/* arrows */}
        <svg className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height}>
          <defs>
            <marker id="cpd-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#334155" />
            </marker>
            <marker id="cpd-arrow-crit" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#dc2626" />
            </marker>
          </defs>
          {activities.flatMap((a) => {
            const to = layout.pos.get(a.id); if (!to) return []
            return a.predecessors.map((l) => {
              const from = layout.pos.get(l.id); if (!from) return null
              const x1 = from.x + BOX_W, y1 = from.y + BOX_H / 2, x2 = to.x, y2 = to.y + BOX_H / 2
              const isCrit = critical.has(a.id) && critical.has(l.id)
              const mx = (x1 + x2) / 2
              return (
                <path key={`${l.id}->${a.id}`} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 2},${y2}`}
                  fill="none" stroke={isCrit ? '#dc2626' : '#94a3b8'} strokeWidth={isCrit ? 2 : 1.3}
                  markerEnd={`url(#${isCrit ? 'cpd-arrow-crit' : 'cpd-arrow'})`} />
              )
            })
          })}
        </svg>
        {/* node boxes */}
        {activities.map((a) => {
          const c = cpm.get(a.id); if (!c) return null
          const p = layout.pos.get(a.id)!
          const isCrit = critical.has(a.id)
          return (
            <div key={a.id} className={`absolute rounded-md border-2 bg-white shadow-sm ${isCrit ? 'border-red-500' : 'border-slate-300'}`}
              style={{ left: p.x, top: p.y, width: BOX_W, height: BOX_H }} title={a.name}>
              <div className="grid h-[22px] grid-cols-3 divide-x divide-white overflow-hidden rounded-t">
                {cell(c.es, 'bg-[#a5d76e] text-[#1e3a0f]')}
                <div className="flex items-center justify-center bg-[#3f9a3f]">
                  <input type="number" min={1} value={a.duration}
                    onChange={(e) => onEditDuration(a.id, Math.max(1, Math.round(+e.target.value || 1)))}
                    className="h-full w-full bg-transparent text-center text-[11px] font-bold text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                </div>
                {cell(c.ef, 'bg-[#a5d76e] text-[#1e3a0f]')}
              </div>
              <div className="flex h-[22px] items-center justify-center truncate px-1 text-[10px] font-bold text-slate-700">
                {a.id} · {a.name.replace(/^(Floor|Columns|Footings|Level) /, '').split(' — ')[0].slice(0, 16)}
              </div>
              <div className="grid h-[22px] grid-cols-3 divide-x divide-white overflow-hidden rounded-b">
                {cell(c.ls, 'bg-[#57cbbf] text-[#0f3b36]')}
                {cell(c.totalFloat, `${isCrit ? 'bg-red-500 text-white' : 'bg-slate-400 text-white'}`)}
                {cell(c.lf, 'bg-[#57cbbf] text-[#0f3b36]')}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
        <span><b>ES</b>·<b>DUR</b>·<b>EF</b> top, <b>LS</b>·<b>TF</b>·<b>LF</b> bottom</span>
        <span className="text-red-600">red = critical path (TF = 0)</span>
        <span>edit any <b>DUR</b> — the diagram, Gantt and table update together</span>
      </div>
    </div>
  )
}
