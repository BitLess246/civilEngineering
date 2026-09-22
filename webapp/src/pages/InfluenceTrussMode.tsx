import { useState } from 'react'
import {
  influenceLines, ilAt, ilArea, ilExtremes, memberGroups, memberById, mirrorOf,
  validateInput, KIND_NAME,
  type TrussType, type DeckLevel, type MemberKind, type InfluenceResult,
} from '../engine/influenceTruss'
import { Card, Num, Pick, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, BRAND, FAIL, AMBER, FAINT, MUTED, HAIR, TINT_T, TINT_C, f2, f3, signed } from '../lib/influenceStyle'

// Influence Lines — bridge truss MODE. A unit load walks the deck one panel
// point at a time; the engine solves the whole determinate truss at each
// position (engine/influenceTruss.ts) and every member gets its polygonal
// influence line. The page scrubs the load continuously (between panel points
// the deck beams share it, so the ordinate interpolates linearly), highlights
// members by their current force, and integrates a uniform load patch over
// [a, b]. The shell page owns the PageHeader and the mode switch.

const forceColor = (v: number) => (v > 5e-7 ? BRAND : v < -5e-7 ? FAIL : '#b9b5aa')
const tc = (v: number) => (Math.abs(v) < 5e-7 ? '—' : v > 0 ? 'T' : 'C')

interface Sel { id: string; label: string; nodes: string; kind: MemberKind | 'reaction' }

export function TrussMode() {
  const [type, setType] = useState<TrussType>('Pratt')
  const [deck, setDeck] = useState<DeckLevel>('through')
  const [panels, setPanels] = useState(6)
  const [span, setSpan] = useState(42)
  const [height, setHeight] = useState(7)
  const [x, setX] = useState(14)
  const [selId, setSelId] = useState('L2-L3')
  const [w, setW] = useState(10)
  const [a, setA] = useState(0)
  const [b, setB] = useState(42)

  const problems = validateInput({ type, deck, panels, span, height })
  // Validated input never throws — the guard below is for the impossible case,
  // and there are deliberately NO hooks after it: the engine is cheap enough
  // (≤ 13 solves of a ≤ 60×60 system) to run inline on every render, the same
  // way the welded-connection page does.
  const res: InfluenceResult | null = (() => {
    try { return influenceLines({ type, deck, panels, span, height }) } catch { return null }
  })()

  if (!res) {
    return (
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <ul className="mt-4 list-disc pl-5 text-sm text-fail">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      </div>
    )
  }

  const xc = Math.min(Math.max(x, 0), span)
  const groups = memberGroups(res.geom)
  const sel: Sel = selId === 'RL' || selId === 'RR'
    ? { id: selId, label: selId, nodes: selId === 'RL' ? 'pin, L0' : 'roller, Ln', kind: 'reaction' }
    : (() => {
        const m = memberById(res.geom, selId)
        return m
          ? { id: m.id, label: m.label, nodes: m.nodes, kind: m.kind }
          : { id: res.geom.members[0].id, label: res.geom.members[0].label, nodes: res.geom.members[0].nodes, kind: res.geom.members[0].kind }
      })()
  const selReal = sel.kind !== 'reaction'
  const ordNow = ilAt(res, sel.id, xc)
  const ext = ilExtremes(res, sel.id)
  const aEff = Math.min(Math.max(a, 0), span)
  const bEff = Math.min(Math.max(b, 0), span)
  const area = ilArea(res, sel.id, aEff, bEff)
  const fUdl = w * area
  const ordRow = res.il[sel.id]
  const mirror = mirrorOf(res.geom, sel.id)

  const steps: SolutionStep[] = (() => {
    const g = res.geom
    const m = g.members.length
    const j = g.joints
    const RLv = (span - xc) / span
    const out: SolutionStep[] = [
      {
        title: 'Truss geometry and determinacy',
        lines: [
          { text: `${g.type} truss, ${g.panels} panels of ${f2(span / g.panels)} m — span ${f2(span)} m, depth ${f2(height)} m, deck at the ${g.deck === 'through' ? 'bottom' : 'top'} chord. The unit load enters at the ${g.deck === 'through' ? 'bottom' : 'top'} panel points, which is where the floor beams sit.` },
          { tex: `j = ${j},\\; m = ${m},\\; r = 3 \\;\\Rightarrow\\; m + r = ${m + 3} = 2j \\;\\checkmark` },
          { text: 'Statically determinate and stable, so each member force is unique and its influence line is an exact polygon joining the panel-point ordinates.' },
        ],
      },
      {
        title: `Reactions under the unit load at x = ${f2(xc)} m`,
        lines: [
          { text: 'Simply supported on a span L, so the reactions follow from moments about each support — per kN of moving load:' },
          { tex: `R_L = \\frac{L - x}{L} = \\frac{${f2(span)} - ${f2(xc)}}{${f2(span)}} = ${f3(RLv)}\\text{ kN}` },
          { tex: `R_R = \\frac{x}{L} = ${f3(1 - RLv)}\\text{ kN}` },
        ],
      },
      {
        title: `Influence-line ordinates — ${sel.label} (${KIND_NAME[sel.kind]}${selReal ? `, ${sel.nodes}` : ''})`,
        lines: res.positions.map((px, k) => ({
          item: `x = ${f2(px)} m (${res.labels[k]}): ${f3(ordRow[k])} kN/kN ${tc(ordRow[k]) === '—' ? '(zero)' : tc(ordRow[k]) === 'T' ? '(tension)' : '(compression)'}`,
        })),
        note: 'Between panel points the deck beams share the load between adjacent floor beams, so the influence line is linear. + = tension, − = compression.',
      },
    ]
    if (w > 0) {
      out.push({
        title: `Uniform load w = ${f2(w)} kN/m over ${f2(aEff)}–${f2(bEff)} m`,
        lines: [
          { text: 'A patch of uniform load loads the member with w times the area under its influence line across the patch — the integral is exact because the line is piecewise linear:' },
          { tex: `F = w\\int_{${f2(aEff)}}^{${f2(bEff)}}\\! IL\\,dx = ${f2(w)} \\times ${f3(area)} = ${f2(fUdl)}\\text{ kN}\\;${tc(fUdl) === 'T' || fUdl > 0 ? '\\text{(tension)}' : '\\text{(compression)}'}` },
          { text: `Governing single-load values for comparison: +${f3(ext.max)} kN/kN at x = ${f2(ext.maxX)} m, ${f3(ext.min)} kN/kN at x = ${f2(ext.minX)} m.` },
        ],
      })
    }
    return out
  })()

  return (
    <div>
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <ReportControls title="Influence Lines Report" badges={['Bridge truss']} />
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Influence lines for every member of a determinate bridge truss: the engine solves the whole
          truss once per panel point under a unit load walking the deck, and the page scrubs that load
          continuously. Read a member's line, its extremes, or integrate a uniform-load patch over it.
        </p>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* ── inputs ── */}
          <div className="space-y-5">
            <Card title="Truss">
              <Pick label="Truss type" value={type} onChange={(v) => setType(v as TrussType)}
                options={[['Pratt', 'Pratt — diagonals toward midspan'], ['Howe', 'Howe — diagonals toward the ends'], ['Warren', 'Warren — alternating, with verticals']]} />
              <Pick label="Deck level" value={deck} onChange={(v) => setDeck(v as DeckLevel)}
                options={[['through', 'Through — deck on the bottom chord'], ['deck', 'Deck — load on the top chord']]} />
              <Pick label="Panels" value={String(panels)} onChange={(v) => setPanels(Number(v))}
                options={[['4', '4 panels'], ['6', '6 panels'], ['8', '8 panels'], ['10', '10 panels'], ['12', '12 panels']]} />
              <Num label="Span L" unit="m" value={span} onChange={setSpan} min={6} max={120} step="0.5" />
              <Num label="Depth h" unit="m" value={height} onChange={setHeight} min={1} max={span} step="0.25" />
            </Card>

            <Card title="Member" hint="or click one in the drawing">
              <label className="flex flex-col text-sm sm:col-span-2 lg:col-span-3">
                <span className="mb-1 text-[11.5px] font-semibold text-muted">Influence line to plot</span>
                <select value={sel.id} onChange={(e) => setSelId(e.target.value)} className="text-[13px]">
                  {groups.map((g) => (
                    <optgroup key={g.title} label={g.title}>
                      {g.ids.map((id) => {
                        const mm = memberById(res.geom, id)
                        return <option key={id} value={id}>{mm ? `${mm.label} · ${mm.nodes}` : id === 'RL' ? 'RL · left reaction' : 'RR · right reaction'}</option>
                      })}
                    </optgroup>
                  ))}
                </select>
                <span className="mt-0.5 text-[10px] text-faint">
                  {mirror ? `Mirror member: ${mirror} — its line is this one reflected about midspan.` : 'Self-mirrored about midspan.'}
                </span>
              </label>
            </Card>

            <Card title="Moving unit load">
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="flex flex-col text-sm">
                  <span className="mb-1 text-[11.5px] font-semibold text-muted">Position x</span>
                  <input type="range" min={0} max={span} step={span / 400} value={xc}
                    onChange={(e) => setX(parseFloat(e.target.value))} className="w-full accent-brand" />
                </label>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <Num label="x" unit="m" value={xc} onChange={setX} min={0} max={span} step="0.1" />
                  <Num label="Panel length" unit="m" value={span / panels} onChange={() => {}} disabled />
                </div>
                <p className="mt-1 text-[10px] text-faint">
                  Between panel points the deck beams share the unit load with adjacent floor beams, so the ordinate interpolates linearly.
                </p>
              </div>
            </Card>

            <Card title="Uniform load patch">
              <Num label="w" unit="kN/m" value={w} onChange={setW} min={0} max={100} step="0.5" />
              <Num label="From a" unit="m" value={a} onChange={setA} min={0} max={span} step="0.5" />
              <Num label="To b" unit="m" value={b} onChange={setB} min={0} max={span} step="0.5" />
              <p className="text-[10px] text-faint sm:col-span-2 lg:col-span-3">
                F = w × (area under the influence line over [a, b]) — the force the patch puts in the selected member.
              </p>
            </Card>
          </div>

          {/* ── drawings and readings ── */}
          <div className="space-y-5">
            <ResultCard title={`Selected member — ${sel.label} (${KIND_NAME[sel.kind]}${selReal ? `, ${sel.nodes}` : ''})`}>
              <Row label={`Force at x = ${f2(xc)} m`} value={`${signed(ordNow)} kN/kN`} sub={tc(ordNow) === '—' ? 'zero member' : tc(ordNow) === 'T' ? 'tension' : 'compression'} />
              {/* The position goes in the VALUE, not the sub. `Row`'s sub is
                  `w-32 truncate` by design, and "unit load at x = 14.00 m"
                  does not fit 8rem — it shipped reading "unit load at x =
                  14.00…", ellipsising the one number the row exists to give.
                  This is also the shape `BeamMode` already uses. */}
              <Row label="IL maximum" value={`+${f3(ext.max)} kN/kN at x = ${f2(ext.maxX)} m`} />
              <Row label="IL minimum" value={`${ext.min >= 0 ? '+' : ''}${f3(ext.min)} kN/kN at x = ${f2(ext.minX)} m`} />
              <Row label={`Uniform ${f2(w)} kN/m over ${f2(aEff)}–${f2(bEff)} m`} value={`${signed(fUdl)} kN`} sub={`area = ${f3(area)} m`} />
            </ResultCard>

            <DrawingCard title="Truss elevation" meta={`L = ${f2(span)} m · h = ${f2(height)} m · ${panels} panels`}>
              <DrawingFrame label="Truss elevation with the unit load at its current position">
                <TrussFigure res={res} xc={xc} selId={sel.id} onSelect={setSelId} ordAt={(id) => ilAt(res, id, xc)} />
              </DrawingFrame>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-[10px] text-faint">
                <span className="flex items-center gap-1.5"><span className="inline-block h-[3px] w-5 rounded" style={{ background: BRAND }} />tension</span>
                <span className="flex items-center gap-1.5"><span className="inline-block h-[3px] w-5 rounded" style={{ background: FAIL }} />compression</span>
                <span className="flex items-center gap-1.5"><span className="inline-block h-[3px] w-5 rounded" style={{ background: '#b9b5aa' }} />zero</span>
                <span className="flex items-center gap-1.5"><span className="inline-block h-[3px] w-5 rounded" style={{ background: INK }} />selected</span>
              </div>
            </DrawingCard>

            <DrawingCard title={`Influence line — ${sel.label}`} meta="+ tension · − compression · ordinates kN per kN">
              <DrawingFrame label={`Influence line for member ${sel.label}`}>
                <InfluencePlot res={res} id={sel.id} xc={xc} />
              </DrawingFrame>
            </DrawingCard>

            <ResultCard title="Ordinates at the panel points">
              <table className="w-full text-xs">
                <thead className="text-muted">
                  <tr className="text-left">
                    <th className="py-1 pr-2 font-semibold">Position</th>
                    <th className="pr-2 font-semibold">x (m)</th>
                    <th className="pr-2 text-right font-semibold">Ordinate (kN/kN)</th>
                    <th className="text-right font-semibold">State</th>
                  </tr>
                </thead>
                <tbody>
                  {res.positions.map((px, k) => (
                    <tr key={k} className={`border-t border-hairline-2 ${Math.abs(px - xc) < span / (panels * 2) ? 'bg-brand-tint' : ''}`}>
                      <td className="py-1 pr-2 font-mono">{res.labels[k]}</td>
                      <td className="pr-2 font-mono">{f2(px)}</td>
                      <td className="pr-2 text-right font-mono font-semibold">{f3(ordRow[k])}</td>
                      <td className={`text-right font-mono font-semibold ${ordRow[k] > 5e-7 ? 'text-brand' : ordRow[k] < -5e-7 ? 'text-fail' : 'text-faint'}`}>{tc(ordRow[k]) === '—' ? 'zero' : tc(ordRow[k]) === 'T' ? 'tension' : 'compression'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResultCard>
          </div>
        </div>

        <div className="mt-6">
          <WorkedSolution steps={steps} title="Influence Lines — step-by-step (unit-load method)" />
        </div>
      </div>
    </div>
  )
}

// ── truss elevation ────────────────────────────────────────────────────────

function TrussFigure({ res, xc, selId, onSelect, ordAt }: {
  res: InfluenceResult
  xc: number
  selId: string
  onSelect: (id: string) => void
  ordAt: (id: string) => number
}) {
  const { geom } = res
  const W = 620, H = 300, padL = 30, padR = 30, padT = 34, padB = 42
  const sc = Math.min((W - padL - padR) / geom.span, (H - padT - padB) / geom.height)
  const yOff = padT + (H - padT - padB - geom.height * sc) / 2
  const X = (v: number) => padL + v * sc
  const Y = (v: number) => yOff + (geom.height - v) * sc
  const deckY = geom.deck === 'through' ? 0 : geom.height

  const ordered = [...geom.members].sort((m) => (m.id === selId ? 1 : -1))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Truss elevation with the unit load at its current position">
      {/* supports */}
      {geom.nodes.filter((nd) => nd.support).map((nd) => (
        <g key={nd.id} stroke={MUTED} strokeWidth={1.4} fill="none">
          <path d={`M${X(nd.x) - 8},${Y(nd.y) + 4} L${X(nd.x)},${Y(nd.y)} L${X(nd.x) + 8},${Y(nd.y) + 4} Z`} fill="#f4f3ef" />
          <path d={`M${X(nd.x) - 10},${Y(nd.y) + 8} L${X(nd.x) - 4},${Y(nd.y) + 4} M${X(nd.x) - 4},${Y(nd.y) + 8} L${X(nd.x) + 2},${Y(nd.y) + 4} M${X(nd.x) + 2},${Y(nd.y) + 8} L${X(nd.x) + 8},${Y(nd.y) + 4}`} />
          {nd.support === 'roller' && <>
            <circle cx={X(nd.x) - 4} cy={Y(nd.y) + 8} r={2} />
            <circle cx={X(nd.x) + 4} cy={Y(nd.y) + 8} r={2} />
          </>}
        </g>
      ))}

      {/* members — selected drawn last, on top */}
      {ordered.map((m) => {
        const f = ordAt(m.id)
        const isSel = m.id === selId
        return (
          <g key={m.id} onClick={() => onSelect(m.id)} className="cursor-pointer">
            <line x1={X(nodeX(geom, m.a))} y1={Y(nodeY(geom, m.a))} x2={X(nodeX(geom, m.b))} y2={Y(nodeY(geom, m.b))}
              stroke="transparent" strokeWidth={11} />
            <line x1={X(nodeX(geom, m.a))} y1={Y(nodeY(geom, m.a))} x2={X(nodeX(geom, m.b))} y2={Y(nodeY(geom, m.b))}
              stroke={isSel ? INK : forceColor(f)} strokeWidth={isSel ? 4 : 2.2} strokeLinecap="round" />
          </g>
        )
      })}

      {/* nodes + labels */}
      {geom.nodes.map((nd) => (
        <g key={nd.id}>
          <circle cx={X(nd.x)} cy={Y(nd.y)} r={3} fill={INK} />
          {nd.y === 0
            ? <text x={X(nd.x)} y={Y(nd.y) + 22} textAnchor="middle" fontSize={9.5} fill={FAINT} fontFamily="'IBM Plex Mono', monospace">{nd.id}</text>
            : <text x={X(nd.x)} y={Y(nd.y) - 9} textAnchor="middle" fontSize={9.5} fill={FAINT} fontFamily="'IBM Plex Mono', monospace">{nd.id}</text>}
        </g>
      ))}

      {/* Unit load at the scrub position.
          CASED IN WHITE, because it is drawn INSIDE the truss and lands on a
          panel point — which is exactly where a vertical is. At the default
          (x = 14, panel point L2) the amber shaft and member V2 were one
          stroke and neither could be read.
          Hanging it under the deck was the first fix and it is not robust:
          `sc` is limited by the DEPTH on a deep truss, which puts the deck on
          the canvas floor with the node labels already below it and nowhere
          left to hang anything. A casing works at every proportion, keeps the
          arrow on the load's true position, and is what a draughtsman does
          where two lines have to cross. */}
      <g>
        <line x1={X(xc)} y1={Y(deckY) - 44} x2={X(xc)} y2={Y(deckY) - 2} stroke={HAIR} strokeDasharray="3 3" strokeWidth={1} />
        <line x1={X(xc)} y1={Y(deckY) - 46} x2={X(xc)} y2={Y(deckY) - 10} stroke="#ffffff" strokeWidth={5.5} strokeLinecap="round" />
        <line x1={X(xc)} y1={Y(deckY) - 44} x2={X(xc)} y2={Y(deckY) - 12} stroke={AMBER} strokeWidth={2.2} strokeLinecap="round" />
        <path d={`M${X(xc) - 5},${Y(deckY) - 18} L${X(xc)},${Y(deckY) - 9} L${X(xc) + 5},${Y(deckY) - 18} Z`}
          fill={AMBER} stroke="#ffffff" strokeWidth={1.4} />
        {/* Beside the arrow, not centred on it: centred, the label straddled
            the vertical and its casing cut a notch through the member, so
            "1 kN" read as two fragments. Flipped to whichever side keeps it
            inside the drawing. */}
        <text x={X(xc) + (xc > geom.span / 2 ? -8 : 8)} y={Y(deckY) - 46}
          textAnchor={xc > geom.span / 2 ? 'end' : 'start'} fontSize={10} fill={AMBER}
          fontFamily="'IBM Plex Mono', monospace" stroke="#ffffff" strokeWidth={2.6}
          paintOrder="stroke" strokeLinejoin="round">1 kN</text>
      </g>
    </svg>
  )
}

const nodeX = (geom: InfluenceResult['geom'], id: string) => geom.nodes.find((nd) => nd.id === id)!.x
const nodeY = (geom: InfluenceResult['geom'], id: string) => geom.nodes.find((nd) => nd.id === id)!.y

// ── influence-line plot ────────────────────────────────────────────────────

function InfluencePlot({ res, id, xc }: { res: InfluenceResult; id: string; xc: number }) {
  const W = 620, H = 240, padL = 46, padR = 20, padT = 20, padB = 30
  const v = res.il[id]
  const xs = res.positions
  const vmax = Math.max(0.5, ...v.map((o) => Math.abs(o)))
  const X = (x: number) => padL + (x / res.geom.span) * (W - padL - padR)
  const Y = (o: number) => padT + (H - padT - padB) * (1 - (o + vmax) / (2 * vmax))
  const y0 = Y(0)
  const now = ilAt(res, id, xc)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Influence line for ${id}`}>
      {/* trapezoid fills, one per panel segment — sign-coloured by the mean ordinate */}
      {xs.slice(0, -1).map((x, k) => {
        const mean = (v[k] + v[k + 1]) / 2
        return (
          <path key={k}
            d={`M${X(x)},${y0} L${X(x)},${Y(v[k])} L${X(xs[k + 1])},${Y(v[k + 1])} L${X(xs[k + 1])},${y0} Z`}
            fill={mean >= 0 ? TINT_T : TINT_C} />
        )
      })}
      {/* axes */}
      <line x1={padL} y1={y0} x2={W - padR} y2={y0} stroke={HAIR} strokeWidth={1.2} />
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke={HAIR} strokeWidth={1.2} />
      <text x={padL - 6} y={Y(vmax) + 3} textAnchor="end" fontSize={9} fill={MUTED} fontFamily="'IBM Plex Mono', monospace">+{f2(vmax)}</text>
      <text x={padL - 6} y={y0 + 3} textAnchor="end" fontSize={9} fill={MUTED} fontFamily="'IBM Plex Mono', monospace">0</text>
      <text x={padL - 6} y={Y(-vmax) + 3} textAnchor="end" fontSize={9} fill={MUTED} fontFamily="'IBM Plex Mono', monospace">−{f2(vmax)}</text>
      {/* panel-point ticks and x labels */}
      {xs.map((x, k) => (
        <g key={k}>
          <line x1={X(x)} y1={H - padB} x2={X(x)} y2={H - padB + 4} stroke={HAIR} />
          <text x={X(x)} y={H - padB + 15} textAnchor="middle" fontSize={9} fill={FAINT} fontFamily="'IBM Plex Mono', monospace">{f2(x)}</text>
        </g>
      ))}
      <text x={W - padR} y={H - 4} textAnchor="end" fontSize={9} fill={FAINT} fontFamily="'IBM Plex Mono', monospace">load position x (m)</text>
      {/* the line itself */}
      <polyline points={xs.map((x, k) => `${X(x)},${Y(v[k])}`).join(' ')} fill="none" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      {xs.map((x, k) => (
        <g key={k}>
          <circle cx={X(x)} cy={Y(v[k])} r={2.6} fill={Math.abs(v[k]) > 5e-7 ? BRAND : '#b9b5aa'} />
          <text x={X(x)} y={v[k] >= 0 ? Y(v[k]) - 7 : Y(v[k]) + 14} textAnchor="middle" fontSize={9} fill={MUTED} fontFamily="'IBM Plex Mono', monospace">{f2(v[k])}</text>
        </g>
      ))}
      {/* scrub position — readout pinned just above the axis so it can never
          collide with an ordinate label on the curve */}
      <line x1={X(xc)} y1={padT - 6} x2={X(xc)} y2={H - padB} stroke={AMBER} strokeWidth={1.2} strokeDasharray="4 3" />
      <circle cx={X(xc)} cy={Y(now)} r={4} fill={AMBER} stroke={INK} strokeWidth={1} />
      <text x={X(xc) + (xc > res.geom.span / 2 ? -6 : 6)} y={H - padB - 8}
        textAnchor={xc > res.geom.span / 2 ? 'end' : 'start'}
        fontSize={10} fill="#b45309" fontFamily="'IBM Plex Mono', monospace" fontWeight={600}>{f2(xc)} m → {f3(now)}</text>
    </svg>
  )
}
