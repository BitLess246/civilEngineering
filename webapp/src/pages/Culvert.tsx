import { useState } from 'react'
import 'katex/dist/katex.min.css'
import {
  CULVERT_INLETS, culvertCheck, minDiameter,
  type CulvertSection, type CulvertResult,
} from '../engine/culvert'
import { Card, Num, Pick, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, f2, f3 } from '../lib/influenceStyle'

// Culvert Hydraulics — FHWA HDS-5 headwater check for circular and box
// culverts: inlet control (unsubmerged / transition / submerged forms),
// outlet control (full-barrel energy equation), the governing regime and
// the outlet velocity, plus a standard-size sweep for the minimum diameter.

type Mode = 'check' | 'size'
type SecKind = 'circular' | 'box'

const INLET_OPTIONS: [string, string][] = CULVERT_INLETS.map((i) => [i.id, i.label])

interface CheckOut { res: CulvertResult | null }
interface SizeOut { res: CulvertResult | null; D: number }

export default function Culvert() {
  const [mode, setMode] = useState<Mode>('check')
  const [secKind, setSecKind] = useState<SecKind>('circular')
  const [inlet, setInlet] = useState('concrete-square-headwall')
  const [Q, setQ] = useState(1.0)
  const [D, setD] = useState(0.9)
  const [B, setB] = useState(1.8)
  const [rise, setRise] = useState(1.2)
  const [L, setL] = useState(30)
  const [S, setS] = useState(0.5) // percent, stored /100
  const [TW, setTW] = useState(0.5)
  const [barrels, setBarrels] = useState(1)
  const [nOverride, setNOverride] = useState(0) // 0 = material default
  const [allowableHW, setAllowableHW] = useState(1.0)

  const section: CulvertSection = secKind === 'circular' ? { kind: 'circular', D } : { kind: 'box', B, D: rise }
  const Sslope = S / 100

  const chk: CheckOut = (() => {
    try {
      return { res: culvertCheck({ Q, section, inlet, L, S: Sslope, TW, barrels, ...(nOverride > 0 ? { n: nOverride } : {}) }) }
    } catch { return { res: null } }
  })()
  const siz: SizeOut = (() => {
    if (secKind !== 'circular') return { res: null, D: NaN }
    try {
      const r = minDiameter({ Q, inlet, L, S: Sslope, TW, barrels, allowableHW })
      return { res: r.result, D: r.D }
    } catch { return { res: null, D: NaN } }
  })()
  const res = mode === 'check' ? chk.res : siz.res
  const sizedD = siz.D

  const kindLabel = (r: CulvertResult) =>
    r.section.kind === 'circular' ? `⌀ ${f3((r.section as { D: number }).D)} m circular` : `${f3(B)} × ${f3(rise)} m box`

  const steps: SolutionStep[] = res ? [
    {
      title: 'Inlet control — HDS-5 forms 1 and 2',
      lines: [
        { tex: '\\frac{HW_i}{D} = \\frac{E_c}{D} + K\\left[\\frac{Q}{A\\sqrt{D}}\\right]^{M} + s\\cdot S \\quad\\quad \\frac{HW_i}{D} = c\\left[\\frac{Q}{A\\sqrt{D}}\\right]^{2} + Y + s\\cdot S' },
        { text: `Constants for ${res.inlet.label}: K = ${res.inlet.K}, M = ${res.inlet.M}, c = ${res.inlet.c}, Y = ${res.inlet.Y}, slope coefficient s = ${res.inlet.slopeCoef}, entrance loss Ke = ${res.inlet.Ke}. The discharge ratio x = Q/(A·√D) is evaluated in US units (cfs, ft). Form 1 is the unsubmerged curve, form 2 the submerged one; between HW/D = 1.0 and 1.2 the nomograph interpolates linearly in Q between form 1 at the crown and form 2 at 1.2·D.` },
        { tex: `\\text{Result: } \\frac{HW_i}{D} = ${f3(res.inletHW.hw / res.section.D)} \\;\\Rightarrow\\; HW_i = ${f3(res.inletHW.hw)}\\ \\text{m} \\;\\; (${res.inletHW.form})` },
      ],
    },
    {
      title: 'Outlet control — full-barrel energy equation',
      lines: [
        { tex: 'H = \\left[1 + K_e + \\frac{2g\\,n^2 L}{R^{4/3}}\\right]\\frac{V^2}{2g} \\quad\\quad HW_o = h_o + H' },
        { text: `V = ${f3(res.outletHW.V)} m/s over the full barrel area, R = A/P of the full section, n = ${res.n}. The outlet depth ho is the greater of the tailwater TW = ${f3(TW)} m and (dc + D)/2 with dc = ${f3(res.outletHW.dc)} m — here ho = ${f3(res.outletHW.ho)} m.` },
        { tex: `H = ${f3(res.outletHW.H)}\\ \\text{m} \\;(\\text{friction } ${f3(res.outletHW.hf)} + \\text{entrance \\& velocity } ${f3(res.outletHW.vh)}) \\;\\Rightarrow\\; HW_o = ${f3(res.outletHW.hw)}\\ \\text{m}` },
      ],
    },
    {
      title: 'Controlling regime',
      lines: [
        { tex: `HW = \\max(HW_i, HW_o) = ${f3(res.hw)}\\ \\text{m} \\quad\\Rightarrow\\quad \\frac{HW}{D} = ${f2(res.hwOverD)} \\;\\; (${res.controlling}\\text{ control})` },
        { text: `HDS-5 control: the deeper headwater governs because the culvert must pass Q under whichever limit is harsher. Outlet velocity ${f2(res.outletVelocity)} m/s at a velocity depth of ${f3(res.velocityDepth)} m.` },
        ...res.notes.map((nt) => ({ text: nt })),
      ],
    },
    mode === 'size' && Number.isFinite(sizedD) ? {
      title: 'Standard-size sweep',
      lines: [
        { tex: `D_{\\min} = ${f2(sizedD)}\\ \\text{m} \\quad (HW \\le ${f2(allowableHW)}\\ \\text{m})` },
        { text: 'The sweep walks the standard concrete pipe diameters (0.30 m … 3.00 m) and returns the first whose governing headwater stays under the allowable depth.' },
      ],
    } : { title: 'Sizing', lines: [{ text: mode === 'size' ? 'No standard diameter holds the headwater under the allowable depth — try multiple barrels or a higher allowable headwater.' : 'Switch the mode to "size D" to sweep the standard diameters against an allowable headwater.' }] },
  ] : []

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="Culvert Hydraulics Report" badges={[res ? res.inlet.label : 'HDS-5']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        FHWA HDS-5 culvert check: inlet control (unsubmerged, transition and submerged
        nomograph forms) against outlet control (full-barrel friction, entrance and exit
        losses over the tailwater), the governing headwater ratio HW/D, the outlet
        velocity, and a standard-size sweep for the minimum barrel diameter.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Culvert and loads">
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => { setMode('check'); setSecKind('circular'); setInlet('concrete-square-headwall'); setQ(1.0); setD(0.9); setL(30); setS(0.5); setTW(0.5); setBarrels(1); setAllowableHW(1.0) }}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — ⌀ 0.9 m concrete, Q = 1.0 m³/s, 30 m barrel
              </button>
            </div>
            <Pick label="Task" value={mode} onChange={(v) => setMode(v as Mode)}
              options={[['check', 'Check headwater for a size'], ['size', 'Size D for allowable HW']]} />
            <Pick label="Entrance" value={inlet} onChange={setInlet} options={INLET_OPTIONS} />
            <Pick label="Section" value={secKind} onChange={(v) => setSecKind(v as SecKind)}
              options={[['circular', 'Circular pipe'], ['box', 'Concrete box']]} />
            <Num label="Discharge Q" unit="m³/s" value={Q} onChange={setQ} min={0.01} max={100} step="0.1" />
            {secKind === 'circular'
              ? <Num label="Diameter D" unit="m" value={D} onChange={setD} min={0.2} max={3.6} step="0.05" />
              : <>
                  <Num label="Span B" unit="m" value={B} onChange={setB} min={0.6} max={4.0} step="0.1" />
                  <Num label="Rise D" unit="m" value={rise} onChange={setRise} min={0.4} max={4.0} step="0.1" />
                </>}
            <Num label="Barrel length L" unit="m" value={L} onChange={setL} min={2} max={300} step="1" />
            <Num label="Barrel slope S" unit="%" value={S} onChange={setS} min={0} max={10} step="0.1" />
            <Num label="Tailwater TW" unit="m" value={TW} onChange={setTW} min={0} max={5} step="0.05" />
            <Num label="Barrels sharing Q" value={barrels} onChange={setBarrels} min={1} max={10} step="1" />
            <Num label="Manning n (0 = by material)" value={nOverride} onChange={setNOverride} min={0} max={0.05} step="0.001" />
            {mode === 'size' && (
              <Num label="Allowable headwater" unit="m" value={allowableHW} onChange={setAllowableHW} min={0.2} max={6} step="0.05" />
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {res ? (
            <>
              <ResultCard title={mode === 'size' ? `Sized — ⌀ ${f2(sizedD)} m` : 'Headwater check'}>
                <Row label="Controlling regime" value={res.controlling === 'inlet' ? 'Inlet control' : 'Outlet control'}
                  sub={kindLabel(res)} />
                <Row label="Headwater HW" value={`${f3(res.hw)} m`} sub={`HW/D = ${f2(res.hwOverD)} above the inlet invert`} />
                <Row label="Inlet-control HW" value={`${f3(res.inletHW.hw)} m`} sub={`${res.inletHW.form} form · x = ${f2(res.inletHW.x)}`} />
                <Row label="Outlet-control HW" value={`${f3(res.outletHW.hw)} m`}
                  sub={`H = ${f3(res.outletHW.hf)} + ${f3(res.outletHW.vh)} = ${f3(res.outletHW.H)} m over ho = ${f3(res.outletHW.ho)} m`} />
                <Row label="Outlet velocity" value={`${f2(res.outletVelocity)} m/s`} sub={`velocity depth ${f3(res.velocityDepth)} m`} />
                {mode === 'size' && <Row label="Allowable headwater" value={`${f2(allowableHW)} m`} sub="governs the sweep" />}
              </ResultCard>

              {res.notes.length > 0 && (
                <ResultCard title="Notes">
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                    {res.notes.map((nt) => <li key={nt}>{nt}</li>)}
                  </ul>
                </ResultCard>
              )}

              <DrawingCard title="Cross-section" meta="embankment, barrel and the governing headwater">
                <DrawingFrame label="Culvert section">
                  <CulvertSection res={res} />
                </DrawingFrame>
              </DrawingCard>

              <WorkedSolution steps={steps} title="Culvert hydraulics — step by step" />
            </>
          ) : (
            <ResultCard title="Check the inputs">
              <p className="text-sm text-fail">
                {mode === 'size'
                  ? 'No standard diameter holds the headwater under the allowable depth — try multiple barrels, a bigger allowable headwater, or a more efficient entrance.'
                  : 'Give a positive discharge, barrel length and non-negative tailwater. The box section needs a positive span and rise.'}
              </p>
            </ResultCard>
          )}
        </div>
      </div>
    </div>
  )
}

// ── cross-section drawing ────────────────────────────────────────────────

function CulvertSection({ res }: { res: CulvertResult }) {
  const W = 640, Hh = 320
  const groundY = 150
  const invertY = 244
  const toeL = 150, toeR = 470
  const pipeR = res.section.kind === 'circular' ? Math.max(16, Math.min(34, res.section.D * 34)) : 30
  const hwPix = Math.min(groundY - 24, Math.max(6, res.hw * 90))
  const topY = invertY - hwPix
  const twPix = Math.min(70, Math.max(3, res.TW * 90))
  // Where the upstream / downstream slope faces sit at a given height —
  // the water bodies stop against them.
  const slopeX = (toe: number, y: number, dir: 1 | -1) =>
    toe + dir * Math.min(Math.max(groundY - y, 0), 54) * (28 / 54)
  const hwX = slopeX(toeL, topY, 1)
  const twX = slopeX(toeR, invertY - twPix, -1)

  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full" role="img" aria-label="Culvert cross-section">
      {/* embankment */}
      <path d={`M 20 ${groundY} L ${toeL} ${groundY} L ${toeL + 28} 96 L ${toeR - 28} 96 L ${toeR} ${groundY} L ${W - 20} ${groundY} L ${W - 20} ${Hh - 24} L 20 ${Hh - 24} Z`}
        fill="rgba(120,113,108,0.14)" stroke={INK} strokeWidth="1.4" />
      <text x={W / 2} y={88} textAnchor="middle" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">road embankment</text>
      {/* headwater against the upstream slope */}
      <rect x={20} y={topY} width={Math.max(hwX - 20, 2)} height={Math.max(Hh - 24 - topY, 2)}
        fill="rgba(15,76,146,0.18)" stroke="none" />
      <line x1={20} x2={hwX} y1={topY} y2={topY} stroke="rgba(15,76,146,0.85)" strokeWidth="1.4" />
      {/* tailwater */}
      <rect x={twX} y={invertY - twPix} width={Math.max(W - 20 - twX, 2)} height={Math.max(Hh - 24 - (invertY - twPix), 2)}
        fill="rgba(15,76,146,0.14)" stroke="none" />
      {/* barrel */}
      {res.section.kind === 'circular' ? (
        <circle cx={W / 2} cy={invertY - pipeR} r={pipeR} fill="rgba(255,255,255,0.92)" stroke={INK} strokeWidth="2" />
      ) : (
        <rect x={W / 2 - 46} y={invertY - 2 * pipeR} width={92} height={2 * pipeR} fill="rgba(255,255,255,0.92)" stroke={INK} strokeWidth="2" />
      )}
      {/* HW dimension */}
      <line x1={136} x2={136} y1={topY} y2={invertY} stroke={INK} strokeWidth="1" />
      <text x={130} y={(topY + invertY) / 2 - 3} textAnchor="end" fontSize="11" fill={INK} fontFamily="var(--font-mono, monospace)">
        HW = {f3(res.hw)} m
      </text>
      <text x={130} y={(topY + invertY) / 2 + 11} textAnchor="end" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
        HW/D = {f2(res.hwOverD)} · {res.controlling}
      </text>
      <text x={24} y={topY - 6} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">headwater</text>
      {/* slope arrow under the labels */}
      <text x={196} y={invertY - 16} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">S = {f2(res.S * 100)}%</text>
      <path d={`M ${200} ${invertY - 10} L ${252} ${invertY - 6}`} fill="none" stroke={MUTED} strokeWidth="1" />
      {/* TW and outlet velocity, right-aligned inside the sheet */}
      <text x={W - 26} y={invertY - twPix - 6} textAnchor="end" fontSize="10" fill={INK} fontFamily="var(--font-mono, monospace)">
        TW = {f3(res.TW)} m
      </text>
      <text x={W - 26} y={invertY - twPix - 20} textAnchor="end" fontSize="10" fill={INK} fontFamily="var(--font-mono, monospace)">
        V = {f2(res.outletVelocity)} m/s
      </text>
    </svg>
  )
}
