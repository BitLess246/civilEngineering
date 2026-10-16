// One-way shear in a footing, isometric: the pad split at the critical
// section with the loaded strip pulled clear, so the plane Vc acts on is a
// face (B·d of it shaded) and the soil pressure that makes Vu pushes on the
// strip's underside. The bottom mat is drawn as round steel: the section cuts
// the main bars, so the pad shows their ends on its section face at d and the
// strip carries its own pieces from its cut face — nothing spans the gap.
// Geometry from `lib/footingShearIso`; numbers from `footingShearExample`,
// the provision's own. The Foundation Design page passes its adopted mat.
import type { FootingShearInput } from '../../lib/codes'
import { footingShearExample } from '../../lib/codes/footingShear'
import { footingShearIso } from '../../lib/footingShearIso'
import { AXO, boxFaces, faceVisible, fitIso, isoPath, sortFaces, type Face, type Vec3 } from '../../lib/isometric'
import { DrawingFrame } from '../DrawingFrame'
import { BarEnd, IsoBar } from '../isoBars'
import { Leader } from '../Leader'

const INK = 'var(--color-ink, #1f2937)', EDGE = '#37526e', CRIT = '#c2402a', LOAD = '#d4512b', DIM = '#1f77b4', HL = '#f59e0b', FAINT = '#8a8f98'
const CONC: Record<string, string> = { '+z': '#eef3f8', '-y': '#dbe4ee', '+x': '#c9d5e2' }
const COL: Record<string, string> = { '+z': '#5f7894', '-y': '#37526e', '+x': '#2b4259' }
const halo = { paintOrder: 'stroke' as const, stroke: 'var(--sheet, #fff)', strokeWidth: 2.6, strokeLinejoin: 'round' as const }

export function FootingShearIso({ i, hl, bars, direction }: {
  i: FootingShearInput; hl: string | null
  /** The design's bottom mat across this section (⌀, spacing mm); a schematic one when absent. */
  bars?: { db: number; spacing: number }
  /** Which way the section faces, for a pad checked both ways ("long direction"). */
  direction?: string
}) {
  const g = footingShearIso(i, bars), r = footingShearExample(i)
  if (!g || !r) return null
  const lit = (k: string) => hl === k
  const W = 380, view = AXO
  const box = (b: { lo: Vec3; hi: Vec3 }) => boxFaces(b.lo, b.hi)
  const all = [...box(g.pad), ...box(g.column), ...(g.strip ? box(g.strip) : [])].flatMap((f) => f.pts)
  const fit = fitIso([...all, ...g.arrows.map((a) => a.from)], 16, 62, W - 32, 220, view)
  const { p } = fit
  const P = (pts: readonly Vec3[]) => isoPath(pts.map(p))
  const seen = (fs: Face[]) => sortFaces(fs.filter((f) => faceVisible(f.n, view)), view)

  const sec = g.shearArea
  const [fx, fyTop] = p(sec[3]), [, fyBot] = p(sec[0])      // the section's front edge, top and at the bottom mat
  // the label hangs under the front row of arrows, at its middle
  const front = g.arrows.filter((a) => a.to[1] === Math.min(...g.arrows.map((q) => q.to[1])))
  const arrowFoot = front.length ? p(front[Math.floor(front.length / 2)].from) : null
  const yText = fit.box.y + fit.box.h + 44
  const qTxt = String(Number(i.qu.toFixed(1)))     // the page passes the engine's unrounded pressure
  const dColor = lit('d') ? HL : DIM, qColor = lit('qu') ? HL : LOAD
  // bars a footing's scale would draw thinner than a pixel are raised to a legible floor, and the sheet says so
  const rb = Math.max(g.db / 2, 2.2 / fit.s), bw = 2 * rb * fit.s, raised = g.db / 2 < 2.2 / fit.s
  const H = yText + (raised ? 44 : 30)

  return (
    <DrawingFrame label="One-way shear: isometric of the critical section">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`Isometric of the footing split at the one-way shear section: B·d ${(g.Bd / 1e6).toFixed(3)} m², loaded strip ${r.arm.toFixed(3)} m`}>
        <text x={16} y={18} fontSize={13} fontWeight={700} fill={INK}>ISOMETRIC — the strip that shears off{direction ? `, ${direction}` : ''}</text>

        {/* the pad up to the section; its +x face IS the section */}
        {seen(box(g.pad)).map((f) => <path key={f.key} d={P(f.pts)} fill={CONC[f.key]} stroke={EDGE} strokeWidth={0.9} strokeLinejoin="round" />)}
        {!r.inside && <>
        <path d={P(sec)} fill={CRIT} fillOpacity={lit('d') ? 0.5 : 0.35} stroke={CRIT} strokeWidth={1.4} strokeLinejoin="round" />
        <path d={P(g.cover)} fill={FAINT} fillOpacity={0.14} stroke={FAINT} strokeWidth={0.8} strokeDasharray="3 2" strokeLinejoin="round" />
        {/* the main bars, cut by the section: their ends in its face, centred at d */}
        {g.cuts.map((c, k) => <BarEnd key={`k${k}`} c={c} axis="x" r={rb} p={p} />)}
        </>}
        {seen(box(g.column)).map((f) => <path key={`c${f.key}`} d={P(f.pts)} fill={COL[f.key]} stroke={EDGE} strokeWidth={0.7} />)}

        {/* the strip beyond it, pulled clear. The soil bears on its UNDERSIDE — B·aᵥ is
            that face, shaded under a see-through strip, with the pressure pushing up on it */}
        {g.bearing && <path d={P(g.bearing)} fill={LOAD} fillOpacity={lit('arm') || lit('qu') ? 0.5 : 0.32} stroke="none" />}
        {g.arrows.map((a, k) => {
          const [x0, y0] = p(a.from), [x1, y1] = p(a.to)
          return <g key={k} stroke={qColor} fill={qColor}>
            <line x1={x0} y1={y0} x2={x1} y2={y1 + 6} strokeWidth={1.4} />
            <path d={`M${x1 - 3.5} ${y1 + 7} L${x1} ${y1} L${x1 + 3.5} ${y1 + 7} Z`} stroke="none" />
          </g>
        })}
        {/* the strip's own pieces of the mat, seen through it: main bars from its cut face (their ends
            in that face) to the end cover, the cross bars on top of them */}
        {g.stripBars.map((b, k) => <BarEnd key={`e${k}`} c={b.a} axis="x" r={rb} p={p} opacity={0.75} />)}
        {g.crossBars.map((b, k) => <IsoBar key={`x${k}`} a={b.a} b={b.b} w={bw * 0.85} p={p} opacity={0.6} />)}
        {g.stripBars.map((b, k) => <IsoBar key={`m${k}`} a={b.a} b={b.b} w={bw} p={p} opacity={0.75} />)}
        {g.strip && seen(box(g.strip)).map((f) => <path key={`s${f.key}`} d={P(f.pts)} fill={CONC[f.key]} fillOpacity={0.5}
          stroke={EDGE} strokeWidth={0.9} strokeLinejoin="round" />)}
        {g.bearing && <path d={P(g.bearing)} fill="none" stroke={lit('arm') ? HL : LOAD} strokeWidth={1.3} strokeDasharray="5 3" strokeLinejoin="round" />}

        {/* d down the section's front edge, left of it on the pad face; the section called out above the strip */}
        {!r.inside && <>
        <g stroke={dColor} strokeWidth={0.8}>
          <line x1={fx - 12} y1={fyTop} x2={fx - 12} y2={fyBot} />
          {[fyTop, fyBot].map((y) => <line key={y} x1={fx - 15} y1={y + 3} x2={fx - 9} y2={y - 3} strokeWidth={1.2} />)}
        </g>
        <text x={fx - 17} y={(fyTop + fyBot) / 2 + 4} fontSize={11} fill={dColor} textAnchor="end" {...halo}>d = {Math.round(i.d)}</text>

        {/* the callout, top right; its leader lands on the section's top edge far enough
            along that the leg reaches it without passing under the label */}
        {(() => {
          const l1 = 'critical section, d from the face'
          const l2 = `Vc on B·d = ${i.B} × ${(i.d / 1000).toFixed(3)} = ${(g.Bd / 1e6).toFixed(3)} m²`
          const tx = W - 16 - Math.max(l1.length * 6.4, l2.length * 5.9)
          const a = p(sec[3]), b = p(sec[2])
          const f = Math.min(0.5, Math.max(0.08, (tx - 34 - a[0]) / ((b[0] - a[0]) || 1)))
          return <Leader x={a[0] + (b[0] - a[0]) * f} y={a[1] + (b[1] - a[1]) * f} tx={tx} ty={40} fontSize={11}
            color={CRIT} weight={700} leading={1.2} text={[l1, l2]} />
        })()}
        </>}

        {!r.inside && (() => { const [, y] = p(g.cover[0]); return <text x={fx - 17} y={(y + fyBot) / 2 + 4} fontSize={10} fill={FAINT} textAnchor="end" {...halo}>cover — not in B·d</text> })()}
        {arrowFoot && <text x={arrowFoot[0]} y={arrowFoot[1] + 14} fontSize={11} fill={qColor} textAnchor="middle" {...halo}>qu = {qTxt} kPa on B × aᵥ</text>}
        {arrowFoot && <text x={arrowFoot[0]} y={arrowFoot[1] + 27} fontSize={10} fill={lit('arm') ? HL : LOAD} textAnchor="middle" {...halo}>the bearing underside, {i.B} × {r.arm.toFixed(3)} m</text>}

        <text x={W / 2} y={yText} fontSize={11} fill={INK} textAnchor="middle">
          {r.inside ? 'The section at d falls past the edge: no strip, Vu = 0.'
            : `Vu = qu·B·aᵥ = ${qTxt} × ${i.B} × ${r.arm.toFixed(3)} = ${r.Vu.toFixed(1)} kN · φVc = ${r.phiVc.toFixed(1)} kN`}
        </text>
        <text x={W / 2} y={yText + 14} fontSize={10} fill={FAINT} textAnchor="middle">
          ⌀{g.db} @ {g.spacing}{g.schematic ? ' (schematic)' : ''}, cut at the section: d runs to their centres; B·d stops there (§422.5).
        </text>
        {raised && <text x={W / 2} y={yText + 28} fontSize={10} fill={FAINT} textAnchor="middle">Bars drawn thicker than scale so they read.</text>}
      </svg>
    </DrawingFrame>
  )
}
