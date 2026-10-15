// A provision's decision procedure, drawn as a spine: steps run down the left,
// and a decision may branch right to a terminal. The live example's route is
// drawn solid and the boxes it never reaches are dimmed — so changing Vu on
// the page visibly moves the answer from "no stirrups" to "halve the spacing".
import type { CheckState, Flowchart, FlowNode } from '../../lib/codes'
import { flowPath } from '../../lib/codes'
import { DrawingFrame } from '../DrawingFrame'

const INK = 'var(--color-ink, #1f2937)', MUTED = '#94a3b8', PATH = '#1f4e8c'
const STATE: Record<CheckState, { fill: string; edge: string }> = {
  pass: { fill: '#dcfce7', edge: '#15803d' },
  limit: { fill: '#fef3c7', edge: '#b45309' },
  fail: { fill: '#fee2e2', edge: '#b91c1c' },
}
const W = 640, SPX = 20, SPW = 340, BRX = 420, BRW = 210, FS = 12, LH = 15, GAP = 30

/** Greedy word wrap to a character budget — the boxes are sized from it. */
function wrap(text: string, max: number): string[] {
  const out: string[] = []
  let line = ''
  for (const w of text.split(/\s+/)) {
    if (line && (line + ' ' + w).length > max) { out.push(line); line = w } else line = line ? line + ' ' + w : w
  }
  if (line) out.push(line)
  return out
}
const boxH = (lines: number) => 16 + lines * LH

function Box({ n, x, y, w, lines, on }: { n: FlowNode; x: number; y: number; w: number; lines: string[]; on: boolean }) {
  const h = boxH(lines.length)
  const st = n.state && on ? STATE[n.state] : null
  const stroke = on ? (st?.edge ?? PATH) : MUTED
  const fill = st ? st.fill : on ? '#eef4fb' : '#f8fafc'
  const shape = n.kind === 'decision'
    ? <polygon points={`${x + 12},${y} ${x + w - 12},${y} ${x + w},${y + h / 2} ${x + w - 12},${y + h} ${x + 12},${y + h} ${x},${y + h / 2}`} fill={fill} stroke={stroke} strokeWidth={on ? 1.8 : 1} />
    : <rect x={x} y={y} width={w} height={h} rx={n.kind === 'process' ? 3 : Math.min(14, h / 2)} fill={fill} stroke={stroke} strokeWidth={on ? 1.8 : 1} />
  return (
    <g opacity={on ? 1 : 0.55}>
      {shape}
      {lines.map((l, k) => (
        <text key={k} x={x + w / 2} y={y + 8 + LH * (k + 0.8)} textAnchor="middle" fontSize={FS} fill={INK}
          fontWeight={n.kind === 'end' && on ? 700 : 400}>{l}</text>
      ))}
    </g>
  )
}

export function CodeFlowchart({ f }: { f: Flowchart }) {
  const path = flowPath(f)
  // layout: each row is as tall as the taller of its spine box and its branch terminal
  const rows = f.steps.map((s) => {
    const main = wrap(s.text, s.kind === 'decision' ? 46 : 52)
    const br = s.branch ? wrap(s.branch.to.text, 30) : []
    return { main, br, h: Math.max(boxH(main.length), s.branch ? boxH(br.length) : 0) }
  })
  const ys = rows.map((_, k) => 10 + rows.slice(0, k).reduce((t, r) => t + r.h + GAP, 0))
  const H = ys[ys.length - 1] + rows[rows.length - 1].h + 10
  const cx = SPX + SPW / 2
  const mainTop = (k: number) => ys[k] + (rows[k].h - boxH(rows[k].main.length)) / 2

  return (
    <DrawingFrame label={f.title}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={f.title}>
        <defs>
          <marker id="flow-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
          </marker>
        </defs>
        {f.steps.map((s, k) => {
          const r = rows[k], top = ys[k]
          const mh = boxH(r.main.length), my = mainTop(k)
          const reached = k <= path.last
          const leaves = path.branched && k === path.last
          const downOn = reached && k < path.last
          const bh = boxH(r.br.length), by = top + (r.h - bh) / 2
          return (
            <g key={k}>
              <Box n={s} x={SPX} y={my} w={SPW} lines={r.main} on={reached} />
              {k < f.steps.length - 1 && <g>
                <line x1={cx} y1={my + mh} x2={cx} y2={mainTop(k + 1) - 1}
                  stroke={downOn ? PATH : MUTED} strokeWidth={downOn ? 2 : 1} strokeDasharray={downOn ? undefined : '4 3'} markerEnd="url(#flow-arr)" />
                {s.next && <text x={cx + 6} y={my + mh + 15} fontSize={FS} fill={downOn ? PATH : MUTED} fontWeight={700}>{s.next}</text>}
              </g>}
              {s.branch && <g>
                <line x1={SPX + SPW} y1={top + r.h / 2} x2={BRX - 1} y2={top + r.h / 2}
                  stroke={leaves ? PATH : MUTED} strokeWidth={leaves ? 2 : 1} strokeDasharray={leaves ? undefined : '4 3'} markerEnd="url(#flow-arr)" />
                <text x={(SPX + SPW + BRX) / 2} y={top + r.h / 2 - 5} textAnchor="middle" fontSize={FS} fill={leaves ? PATH : MUTED} fontWeight={700}>{s.branch.when}</text>
                <Box n={s.branch.to} x={BRX} y={by} w={BRW} lines={r.br} on={leaves} />
              </g>}
            </g>
          )
        })}
      </svg>
    </DrawingFrame>
  )
}
