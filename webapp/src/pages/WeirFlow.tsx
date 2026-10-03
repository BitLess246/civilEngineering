import { useState } from 'react'
import 'katex/dist/katex.min.css'
import {
  weirDischarge, headForQ, type WeirShape, type WeirResult,
} from '../engine/weirFlow'
import { Card, Num, Pick, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, f2, f3 } from '../lib/influenceStyle'

// Weir Flow — discharge over the standard measurement weirs: rectangular
// (suppressed / contracted), Cipolletti, V-notch and broad-crested.
// Solve Q from the head, or the head from a target Q (bisection inverse).

type Solve = 'qFromH' | 'hFromQ'

const SHAPES: [string, string][] = [
  ['rectSuppressed', 'Rectangular — suppressed'],
  ['rectContracted', 'Rectangular — end contracted'],
  ['cipolletti', 'Cipolletti trapezoid'],
  ['vnotch', 'Triangular V-notch'],
  ['broadCrested', 'Broad-crested'],
]

const FORMULA_TEX: Record<WeirShape, string> = {
  rectSuppressed: 'Q = 1.84\\,L\\,H^{3/2}',
  rectContracted: 'Q = 1.84\\,(L - 0.1\\,nH)\\,H^{3/2}',
  cipolletti: 'Q = 1.86\\,L\\,H^{3/2}',
  vnotch: 'Q = \\tfrac{8}{15}\\,C_d\\sqrt{2g}\\,\\tan\\tfrac{\\theta}{2}\\,H^{5/2}',
  broadCrested: 'Q = 1.705\\,C_b\\,b\\,H^{3/2}',
}

const SHAPE_NOTES: Record<WeirShape, string> = {
  rectSuppressed: 'Francis formula with the SI constant 1.84 and no end contractions; an approach head ha swaps H for H + ha and removes the ha^1.5 term.',
  rectContracted: 'Each end contraction steals 0.1·H of crest length — n = 2 for a weir with both ends free in the channel.',
  cipolletti: 'The 4V:1H side slopes widen the nappe as the head draws down, cancelling the end-contraction loss, so L needs no correction.',
  vnotch: 'The general Kindsvater-style form; for a 90° notch the engine also reports Cone\u2019s empirical Q = 1.343·H^2.48 for comparison.',
  broadCrested: 'Critical depth controls on the horizontal crest: ideal coefficient 1.705, with Cb below 1.0 absorbing real-structure losses.',
}

interface SolveOut { res: WeirResult | null; solvedH: number }

export default function WeirFlow() {
  const [shape, setShape] = useState<WeirShape>('rectSuppressed')
  const [solve, setSolve] = useState<Solve>('qFromH')
  const [H, setH] = useState(0.5)
  const [Q, setQ] = useState(1.3)
  const [L, setL] = useState(2)
  const [n, setN] = useState(2)
  const [angle, setAngle] = useState(90)
  const [Cd, setCd] = useState(0.6)
  const [Cb, setCb] = useState(1.0)
  const [ha, setHa] = useState(0)

  const needsL = shape !== 'vnotch'

  const out: SolveOut = (() => {
    const common = { shape, L: needsL ? L : undefined, n, angle, Cd, Cb, ha: ha > 0 ? ha : undefined }
    try {
      if (solve === 'qFromH') {
        return { res: weirDischarge({ ...common, H }), solvedH: H }
      }
      const h = headForQ({ ...common, Q })
      return { res: weirDischarge({ ...common, H: h }), solvedH: h }
    } catch {
      return { res: null, solvedH: NaN }
    }
  })()
  const res = out.res
  const shownH = solve === 'qFromH' ? H : out.solvedH

  const steps: SolutionStep[] = res ? [
    {
      title: 'Governing formula',
      lines: [
        { tex: FORMULA_TEX[shape] },
        { text: SHAPE_NOTES[shape] },
      ],
    },
    solve === 'qFromH'
      ? {
          title: 'Substitute the head',
          lines: [
            { tex: `Q = ${f3(res.Q)}\\ \\text{m}^3/\\text{s} \\quad (H = ${f3(H)}\\ \\text{m})` },
            ...(res.effectiveLength < L - 1e-9 ? [{ text: `End contractions reduced the wetted crest to L′ = ${f3(res.effectiveLength)} m.` }] : []),
          ],
        }
      : {
          title: 'Invert for the head',
          lines: [
            { tex: `Q(H)\\ \\text{is monotone in } H \\;\\Rightarrow\\; H = ${f3(out.solvedH)}\\ \\text{m by bisection, verified: } Q(${f3(out.solvedH)}) = ${f3(res.Q)}\\ \\text{m}^3/\\text{s}` },
            { text: 'The inverse is a bracketed bisection to 1e-10 relative precision — the same answer a nomograph reads, without reading error.' },
          ],
        },
    ...res.notes.map((nt) => ({ title: 'Note', lines: [{ text: nt }] })),
  ] : []

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="Weir Flow Report" badges={[SHAPES.find(([v]) => v === shape)?.[1] ?? '']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        The standard flow-measurement weirs: Francis rectangular (with or without end
        contractions), the Cipolletti trapezoid whose 4V:1H sides self-correct the
        contractions, the V-notch for small flows, and the broad-crested spillway crest.
        Head → discharge, or discharge → head.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Weir and solve direction">
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => { setShape('rectSuppressed'); setSolve('qFromH'); setH(0.5); setL(2); setHa(0) }}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — 2 m suppressed weir, H = 0.5 m
              </button>
            </div>
            <Pick label="Weir type" value={shape} onChange={(v) => setShape(v as WeirShape)} options={SHAPES} />
            <Pick label="Solve" value={solve} onChange={(v) => setSolve(v as Solve)}
              options={[['qFromH', 'Q from the head H'], ['hFromQ', 'Head H for a target Q']]} />
            {needsL && <Num label={shape === 'broadCrested' ? 'Crest width b' : 'Crest length L'} unit="m" value={L} onChange={setL} min={0.1} max={50} step="0.1" />}
            {solve === 'qFromH'
              ? <Num label="Head above crest H" unit="m" value={H} onChange={setH} min={0.01} max={5} step="0.05" />
              : <Num label="Target discharge Q" unit="m³/s" value={Q} onChange={setQ} min={0.001} max={200} step="0.1" />}
            {shape === 'rectContracted' && (
              <Num label="End contractions n" value={n} onChange={setN} min={0} max={2} step="1" />
            )}
            {shape === 'vnotch' && (
              <>
                <Num label="Notch angle θ" unit="°" value={angle} onChange={setAngle} min={20} max={150} step="5" />
                <Num label="Discharge coeff Cd" value={Cd} onChange={setCd} min={0.4} max={0.9} step="0.01" />
              </>
            )}
            {shape === 'broadCrested' && (
              <Num label="Coefficient Cb" value={Cb} onChange={setCb} min={0.5} max={1.2} step="0.01" />
            )}
            {(shape === 'rectSuppressed' || shape === 'rectContracted') && (
              <Num label="Approach head ha" unit="m" value={ha} onChange={setHa} min={0} max={0.5} step="0.01" />
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {res ? (
            <>
              <ResultCard title="Discharge">
                <Row label="Discharge Q" value={`${f3(res.Q)} m³/s`} sub={`${f2(res.Q * 1000)} L/s`} />
                <Row label="Head H" value={`${f3(shownH)} m`} sub={solve === 'hFromQ' ? `solved for Q = ${f3(Q)} m³/s` : 'given'} />
                {shape !== 'vnotch' && (
                  <Row label="Effective crest length" value={`${f3(res.effectiveLength)} m`} sub={res.effectiveLength < L - 1e-9 ? 'after the contraction correction' : 'uncorrected'} />
                )}
              </ResultCard>

              {res.notes.length > 0 && (
                <ResultCard title="Notes">
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                    {res.notes.map((nt) => <li key={nt}>{nt}</li>)}
                  </ul>
                </ResultCard>
              )}

              <DrawingCard title="Section" meta="head measured above the crest, upstream of the drawdown">
                <DrawingFrame label="Weir section">
                  <WeirSection shape={shape} H={shownH} L={needsL ? L : 2 * shownH * Math.tan((angle / 2) * Math.PI / 180)} angle={angle} />
                </DrawingFrame>
              </DrawingCard>

              <WorkedSolution steps={steps} title="Weir flow — step by step" />
            </>
          ) : (
            <ResultCard title="Check the inputs">
              <p className="text-sm text-fail">
                Give a positive head (or target discharge) and crest length. The contracted weir
                also refuses heads so large that 0.1·n·H eats the whole crest.
              </p>
            </ResultCard>
          )}
        </div>
      </div>
    </div>
  )
}

// ── section drawing ──────────────────────────────────────────────────────

function WeirSection({ shape, H, L, angle }: { shape: WeirShape; H: number; L: number; angle: number }) {
  const W = 640, Hh = 300
  const x0 = 110, x1 = W - 110
  const crestY = 190
  const scale = Math.min(80 / Math.max(H, 0.01), 50 / Math.max(L, 0.5), 60)
  const hPix = H * scale
  const lPix = shape === 'vnotch'
    ? Math.min(2 * H * Math.tan((angle / 2) * Math.PI / 180) * scale, x1 - x0 - 20)
    : Math.min(L * scale, x1 - x0 - 20)
  const topY = crestY - hPix

  // structure profile per type
  const st = (() => {
    if (shape === 'rectSuppressed' || shape === 'rectContracted') {
      return { d: `M ${x0 - 8} ${crestY} L ${x1 + 8} ${crestY}`, label: 'sharp crest' }
    }
    if (shape === 'cipolletti') {
      return { d: `M ${x0 - 8} ${crestY} L ${x1 + 8} ${crestY}`, label: 'sharp crest · 4V:1H sides' }
    }
    if (shape === 'vnotch') {
      const halfW = lPix / 2
      return { d: `M ${W / 2 - halfW} ${crestY} L ${W / 2} ${crestY - Math.min(hPix, 90)} L ${W / 2 + halfW} ${crestY}`, label: 'V-notch plate' }
    }
    return { d: `M ${x0 - 8} ${crestY} L ${x0 - 8} ${crestY + 34} L ${x1 + 8} ${crestY + 34} L ${x1 + 8} ${crestY}`, label: 'broad crest' }
  })()
  const waterEnd = shape === 'broadCrested' ? x0 : shape === 'vnotch' ? W / 2 - lPix / 2 : x0 + lPix / 2

  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full" role="img" aria-label="Weir section">
      {/* upstream water body */}
      <rect x={x0 - 70} y={topY} width={Math.max(waterEnd - (x0 - 70), 4)} height={Math.max(crestY - topY, 2)}
        fill="rgba(15,76,146,0.16)" stroke="none" />
      {/* water surface line */}
      <line x1={x0 - 70} x2={waterEnd} y1={topY} y2={topY} stroke="rgba(15,76,146,0.85)" strokeWidth="1.4" />
      {/* falling jet for sharp-crested weirs */}
      {shape !== 'broadCrested' && shape !== 'vnotch' && (
        <path d={`M ${x0 + lPix / 2} ${crestY + 2} C ${x0 + lPix / 2 + 14} ${crestY + 26}, ${x0 + lPix / 2 + 26} ${crestY + 34}, ${x0 + lPix / 2 + 30} ${crestY + 76}`}
          fill="none" stroke="rgba(15,76,146,0.55)" strokeWidth="2" />
      )}
      {/* structure */}
      <path d={st.d} fill="none" stroke={INK} strokeWidth="2" />
      {/* head dimension */}
      <line x1={x0 - 34} x2={x0 - 34} y1={topY} y2={crestY} stroke={INK} strokeWidth="1" />
      <text x={x0 - 42} y={(topY + crestY) / 2} textAnchor="end" fontSize="11" fill={INK} fontFamily="var(--font-mono, monospace)">
        H = {f3(H)} m
      </text>
      {/* crest length dimension */}
      {shape !== 'vnotch' && (
        <>
          <line x1={x0} x2={x0 + lPix} y1={crestY + 52} y2={crestY + 52} stroke={INK} strokeWidth="1" />
          <text x={x0 + lPix / 2} y={crestY + 68} textAnchor="middle" fontSize="11" fill={INK} fontFamily="var(--font-mono, monospace)">
            {shape === 'broadCrested' ? 'b' : 'L'} = {f3(L)} m
          </text>
        </>
      )}
      <text x={x0 - 70} y={26} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">{st.label}</text>
    </svg>
  )
}
