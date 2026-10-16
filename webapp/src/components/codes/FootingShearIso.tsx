// One-way shear in a footing, isometric: the pad split at the critical
// section with the loaded strip pulled clear, so the plane Vc acts on is a
// face (B·d of it shaded) and the soil pressure that makes Vu pushes on the
// strip's underside. Geometry from `lib/footingShearIso`; numbers from
// `footingShearExample`, the provision's own.
import type { FootingShearInput } from '../../lib/codes'
import { footingShearExample } from '../../lib/codes/footingShear'
import { footingShearIso } from '../../lib/footingShearIso'
import { SE, boxFaces, faceVisible, fitIso, isoPath, sortFaces, type Face, type Vec3 } from '../../lib/isometric'
import { DrawingFrame } from '../DrawingFrame'

const INK = 'var(--color-ink, #1f2937)', EDGE = '#37526e', CRIT = '#c2402a', LOAD = '#d4512b', DIM = '#1f77b4', HL = '#f59e0b', FAINT = '#8a8f98'
const CONC: Record<string, string> = { '+z': '#eef3f8', '-y': '#dbe4ee', '+x': '#c9d5e2' }
const COL: Record<string, string> = { '+z': '#5f7894', '-y': '#37526e', '+x': '#2b4259' }
const halo = { paintOrder: 'stroke' as const, stroke: 'var(--sheet, #fff)', strokeWidth: 2.6, strokeLinejoin: 'round' as const }

export function FootingShearIso({ i, hl }: { i: FootingShearInput; hl: string | null }) {
  const g = footingShearIso(i), r = footingShearExample(i)
  if (!g || !r) return null
  const lit = (k: string) => hl === k
  const W = 380, view = SE
  const box = (b: { lo: Vec3; hi: Vec3 }) => boxFaces(b.lo, b.hi)
  const all = [...box(g.pad), ...box(g.column), ...(g.strip ? box(g.strip) : [])].flatMap((f) => f.pts)
  const fit = fitIso([...all, ...g.arrows.map((a) => a.from)], 16, 62, W - 32, 220, view)
  const { p } = fit
  const P = (pts: readonly Vec3[]) => isoPath(pts.map(p))
  const seen = (fs: Face[]) => sortFaces(fs.filter((f) => faceVisible(f.n, view)), view)
  const ctr = (pts: readonly Vec3[]): Vec3 => pts.reduce<Vec3>((s, q) => [s[0] + q[0] / pts.length, s[1] + q[1] / pts.length, s[2] + q[2] / pts.length], [0, 0, 0])

  const sec = g.shearArea
  const [fx, fyTop] = p(sec[3]), [, fyBot] = p(sec[0])      // the section's front edge, top and at the bottom mat
  const secTop = p(ctr([sec[2], sec[3]]))
  const stripTop = g.strip ? p(ctr(box(g.strip).find((f) => f.key === '+z')!.pts)) : null
  const arrowFoot = g.arrows.length ? p(g.arrows[Math.floor(g.arrows.length / 2)].from) : null
  const yText = fit.box.y + fit.box.h + 30
  const H = yText + 30
  const dColor = lit('d') ? HL : DIM, qColor = lit('qu') ? HL : LOAD

  return (
    <DrawingFrame label="One-way shear: isometric of the critical section">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`Isometric of the footing split at the one-way shear section: B·d ${(g.Bd / 1e6).toFixed(3)} m², loaded strip ${r.arm.toFixed(3)} m`}>
        <text x={16} y={18} fontSize={13} fontWeight={700} fill={INK}>ISOMETRIC — the strip that shears off</text>

        {/* the pad up to the section; its +x face IS the section */}
        {seen(box(g.pad)).map((f) => <path key={f.key} d={P(f.pts)} fill={CONC[f.key]} stroke={EDGE} strokeWidth={0.9} strokeLinejoin="round" />)}
        {!r.inside && <>
        <path d={P(sec)} fill={CRIT} fillOpacity={lit('d') ? 0.5 : 0.35} stroke={CRIT} strokeWidth={1.4} strokeLinejoin="round" />
        <path d={isoPath([p(sec[0]), p(sec[1])], false)} stroke={FAINT} strokeWidth={0.8} strokeDasharray="4 3" />
        </>}
        {seen(box(g.column)).map((f) => <path key={`c${f.key}`} d={P(f.pts)} fill={COL[f.key]} stroke={EDGE} strokeWidth={0.7} />)}

        {/* the strip beyond it, pulled clear, the soil pushing it up */}
        {g.strip && seen(box(g.strip)).map((f) => <path key={`s${f.key}`} d={P(f.pts)} fill={f.key === '+z' ? LOAD : CONC[f.key]}
          fillOpacity={f.key === '+z' ? (lit('arm') || lit('qu') ? 0.4 : 0.22) : 1} stroke={EDGE} strokeWidth={0.9} strokeLinejoin="round" />)}
        {g.arrows.map((a, k) => {
          const [x0, y0] = p(a.from), [x1, y1] = p(a.to)
          return <g key={k} stroke={qColor} fill={qColor}>
            <line x1={x0} y1={y0} x2={x1} y2={y1 + 6} strokeWidth={1.4} />
            <path d={`M${x1 - 3.5} ${y1 + 7} L${x1} ${y1} L${x1 + 3.5} ${y1 + 7} Z`} stroke="none" />
          </g>
        })}

        {/* d down the section's front edge, left of it on the pad face; the section called out above the strip */}
        {!r.inside && <>
        <g stroke={dColor} strokeWidth={0.8}>
          <line x1={fx - 12} y1={fyTop} x2={fx - 12} y2={fyBot} />
          {[fyTop, fyBot].map((y) => <line key={y} x1={fx - 15} y1={y + 3} x2={fx - 9} y2={y - 3} strokeWidth={1.2} />)}
        </g>
        <text x={fx - 17} y={(fyTop + fyBot) / 2 + 4} fontSize={11} fill={dColor} textAnchor="end" {...halo}>d = {Math.round(i.d)}</text>

        <path d={`M${secTop[0].toFixed(1)} ${secTop[1].toFixed(1)} L${W - 222} 47`} stroke={CRIT} strokeWidth={0.7} fill="none" />
        <circle cx={secTop[0]} cy={secTop[1]} r={2} fill={CRIT} />
        <text x={W - 16} y={40} fontSize={11} fontWeight={700} fill={CRIT} textAnchor="end">critical section, d from the face</text>
        <text x={W - 16} y={53} fontSize={11} fill={CRIT} textAnchor="end">Vc on B·d = {i.B} × {(i.d / 1000).toFixed(3)} = {(g.Bd / 1e6).toFixed(3)} m²</text>
        </>}

        {stripTop && <text x={stripTop[0]} y={stripTop[1] + 4} fontSize={11} fill={lit('arm') ? HL : LOAD} textAnchor="middle" {...halo}>B × aᵥ</text>}
        {arrowFoot && <text x={arrowFoot[0]} y={arrowFoot[1] + 14} fontSize={11} fill={qColor} textAnchor="middle" {...halo}>qu = {i.qu} kPa</text>}

        <text x={W / 2} y={yText} fontSize={11} fill={INK} textAnchor="middle">
          {r.inside ? 'The section at d falls past the edge: no strip, Vu = 0.'
            : `Vu = qu·B·aᵥ = ${i.qu} × ${i.B} × ${r.arm.toFixed(3)} = ${r.Vu.toFixed(1)} kN · φVc = ${r.phiVc.toFixed(1)} kN`}
        </text>
        <text x={W / 2} y={yText + 14} fontSize={10} fill={FAINT} textAnchor="middle">
          The section runs the full width B, d from the column face (§422.5).
        </text>
      </svg>
    </DrawingFrame>
  )
}
