import { useState } from 'react'
import {
  geomAt, specificEnergy, criticalState, froude, G,
  type ChannelShape,
} from '../engine/openChannel'
import { Card, Num, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, HAIR, f2, f3 } from '../lib/influenceStyle'
import { buildShape, type ShapeState } from './openChannelTypes'
import { ShapeCard, SectionSketch } from './openChannelShared'

// Open channel — CRITICAL DEPTH mode. The control section: where
// Q²T/(gA³) = 1, specific energy is minimum, and Fr crosses 1. Also plots
// the specific-energy curve E(y) and, optionally, locates a given depth on
// it as sub- or supercritical.

const SAMPLE: ShapeState = { kind: 'rect', b: '2', z: '1.5', D: '2' }

export function CriticalMode() {
  const [shape, setShape] = useState<ShapeState>(SAMPLE)
  const [Q, setQ] = useState(3)
  const [yGiven, setYGiven] = useState('1.2')

  const ch: ChannelShape = buildShape(shape)
  const y = parseFloat(yGiven) || 0

  type Point = { y: number; E: number; Fr: number }
  type CritRes =
    | { yc: number; E_min: number; gc: ReturnType<typeof geomAt>; point: Point | null }
    | { error: Error }
  const res: CritRes = (() => {
    try {
      const { yc, E_min } = criticalState(ch, Q)
      const gc = geomAt(ch, yc)
      const point: Point | null = y > 0
        ? { y, E: specificEnergy(ch, y, Q), Fr: froude(ch, y, Q) }
        : null
      return { yc, E_min, gc, point }
    } catch (e) {
      return { error: e as Error }
    }
  })()

  const probeGeom = 'yc' in res && res.point ? geomAt(ch, res.point.y) : null

  const steps: SolutionStep[] = 'yc' in res ? [
    {
      title: 'The critical condition',
      lines: [
        { tex: `\\frac{Q^2 T}{g A^3} = 1 \\;\\text{ at }\\; y = y_c` },
        { tex: `\\frac{${f3(Q)}^2\\times ${f3(res.gc.T)}}{9.81\\times ${f3(res.gc.A)}^3} = 1 \\;\\; (y_c = ${f3(res.yc)}\\text{ m},\\; A_c = ${f3(res.gc.A)}\\text{ m}^2,\\; T_c = ${f3(res.gc.T)}\\text{ m})` },
        { text: 'Critical flow is where the specific energy E = y + Q²/(2gA²) is minimum for the given discharge — the condition every control section (weir crest, brink, sill) passes through.' },
      ],
    },
    {
      title: 'Solve for the critical depth',
      lines: [
        { tex: `y_c = ${f3(res.yc)}\\text{ m}, \\qquad A_c = ${f3(res.gc.A)}\\text{ m}^2, \\qquad T_c = ${f3(res.gc.T)}\\text{ m}` },
        { text: 'For a rectangle the closed form yc = (Q²/gb²)^⅓ applies; the other shapes solve the critical condition by bisection.' },
      ],
    },
    {
      title: 'Minimum specific energy',
      lines: [
        { tex: `E_{min} = y_c + \\frac{Q^2}{2 g A_c^2} = ${f3(res.yc)} + \\frac{${f3(Q)}^2}{2\\times 9.81\\times ${f3(res.gc.A)}^2} = ${f3(res.E_min)}\\text{ m}` },
        { text: 'For a rectangular section this is exactly 1.5·yc — the velocity head is half the depth at critical flow.' },
      ],
    },
    ...(res.point ? [
      {
        title: `The given depth y = ${f3(res.point.y)} m on the curve`,
        lines: [
          { tex: `E = y + \\frac{Q^2}{2gA^2} = ${f3(res.point.y)} + \\frac{${f3(Q)}^2}{2\\times 9.81\\times ${f3(probeGeom?.A ?? 0)}^2} = ${f3(res.point.E)}\\text{ m}` },
          { tex: `Fr = \\sqrt{\\frac{Q^2 T}{gA^3}} = \\sqrt{\\frac{${f3(Q)}^2\\times ${f3(probeGeom?.T ?? 0)}}{9.81\\times ${f3(probeGeom?.A ?? 0)}^3}} = ${f3(res.point.Fr)}` },
          { text: res.point.Fr < 1
            ? `Fr < 1: subcritical (upper limb of the curve), deeper than critical. This depth can coexist with an alternate depth at the same energy — read it off the lower limb.`
            : `Fr > 1: supercritical (lower limb), shallower than critical. Its alternate depth sits on the upper limb at the same E = ${f3(res.point.E)} m.` },
        ],
      } satisfies SolutionStep,
    ] : []),
  ] : []

  return (
    <div>
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <ReportControls title="Open Channel — Critical Depth Report" badges={['Froude', 'Specific energy']} />
        <p className="mt-2 max-w-3xl text-sm text-muted">
          The control section: solve the critical depth, the minimum specific energy, and see where
          any given depth sits on the E–y curve — subcritical upper limb or supercritical lower limb,
          with its alternate depth.
        </p>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="space-y-5">
            <ShapeCard shape={shape} onChange={(patch) => setShape((s) => ({ ...s, ...patch }))}
              hint="Same section as the normal-depth mode" />
            <Card title="Flow and probe depth">
              <Num label="Discharge Q" unit="m³/s" value={Q} onChange={setQ} min={0.01} max={500} step="0.1" />
              <Num label="Depth to probe y (blank = skip)" unit="m" value={y === 0 ? 0 : y} onChange={(v) => setYGiven(v === 0 ? '' : String(v))} min={0} max={20} step="0.1" />
            </Card>
          </div>

          <div className="space-y-5">
            {'yc' in res ? (
              <>
                <ResultCard title="Critical state">
                  <Row label="Critical depth yc" value={`${f3(res.yc)} m`} sub={`Ac = ${f3(res.gc.A)} m² · Tc = ${f3(res.gc.T)} m`} />
                  <Row label="Minimum specific energy" value={`${f3(res.E_min)} m`} sub={ch.kind === 'rect' ? 'rect: exactly 1.5·yc' : 'from E(y) at yc'} />
                  {res.point && (
                    <Row label={`Probe y = ${f3(res.point.y)} m`} value={`Fr = ${f3(res.point.Fr)}`}
                      sub={res.point.Fr < 1 ? 'subcritical limb' : 'supercritical limb'}
                      alert={res.point.Fr >= 1} />
                  )}
                </ResultCard>

                <DrawingCard title="Specific energy curve" meta={`E(y) at Q = ${f3(Q)} m³/s`}>
                  <EnergyCurve shape={ch} Q={Q} yc={res.yc} EMin={res.E_min} probe={res.point} />
                </DrawingCard>

                <DrawingCard title="Section at critical depth" meta="the control section, to scale">
                  <SectionSketch shape={ch} y={res.yc} caption={`Critical condition: Q²T/(gA³) = 1 — Fr = 1, E = Emin`} />
                </DrawingCard>

                <WorkedSolution steps={steps} title="Critical depth — step-by-step" />
              </>
            ) : (
              <ResultCard title="Check the inputs">
                <p className="text-sm text-fail">{res.error.message}</p>
              </ResultCard>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── E–y curve with the critical point and both limbs marked ──────────────

function EnergyCurve({ shape, Q, yc, EMin, probe }: {
  shape: ChannelShape
  Q: number
  yc: number
  EMin: number
  probe: { y: number; E: number; Fr: number } | null
}) {
  const W = 640
  const H = 380
  const padL = 58
  const padB = 46
  const padT = 30
  const padR = 24

  // E range: from just above EMin to the largest plotted E
  const yMaxPlot = shape.kind === 'circle' ? Math.max(yc * 3, probe?.y ?? 0, 0.5) : Math.max(yc * 2.6, probe?.y ?? 0, 0.5)
  const EMax = specificEnergy(shape, yMaxPlot, Q)
  const E0 = Math.max(0, EMin - 0.15 * (EMax - EMin)) // x-axis start

  const px = (E: number) => padL + (E - E0) / (EMax - E0) * (W - padL - padR)
  const py = (y: number) => H - padB - y / yMaxPlot * (H - padB - padT)

  // sample the curve on both limbs
  const upper: string[] = []
  for (let i = 0; i <= 60; i++) {
    const y = yc + (yMaxPlot - yc) * i / 60
    upper.push(`${px(specificEnergy(shape, y, Q))},${py(y)}`)
  }
  const lower: string[] = []
  for (let i = 0; i <= 60; i++) {
    const y = yc * (1 - 0.985 * i / 60)
    if (y <= 0.0005) break
    lower.push(`${px(specificEnergy(shape, y, Q))},${py(y)}`)
  }

  // alternate depth for the probe: same E on the other limb
  const alt = probe && probe.Fr < 1
    ? (() => {
        // alternate is supercritical: bisect the lower limb for E(y) = probe.E
        let lo = 1e-4, hi = yc
        for (let i = 0; i < 60; i++) {
          const mid = (lo + hi) / 2
          if (specificEnergy(shape, mid, Q) > probe.E) lo = mid; else hi = mid
        }
        return (lo + hi) / 2
      })()
    : probe
      ? (() => {
          let lo = yc, hi = yMaxPlot
          for (let i = 0; i < 60; i++) {
            const mid = (lo + hi) / 2
            if (specificEnergy(shape, mid, Q) < probe.E) lo = mid; else hi = mid
          }
          return (lo + hi) / 2
        })()
      : null

  // the 45° asymptote y = E
  const asyE0 = E0 + (yMaxPlot * 0.02)
  const asyMax = Math.min(yMaxPlot, EMax)

  return (
    <DrawingFrame label="Specific energy curve E(y)">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Specific energy curve">
        {/* axes */}
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke={INK} strokeWidth="1.4" />
        <line x1={padL} x2={padL} y1={padT} y2={H - padB} stroke={INK} strokeWidth="1.4" />
        <text x={W - padR} y={H - padB + 26} textAnchor="end" fontSize="11" fill={INK} fontFamily="var(--font-mono, monospace)">E (m)</text>
        <text x={padL - 8} y={padT - 10} fontSize="11" fill={INK} fontFamily="var(--font-mono, monospace)">y (m)</text>

        {/* E = Emin vertical */}
        <line x1={px(EMin)} x2={px(EMin)} y1={py(yc)} y2={H - padB} stroke={MUTED} strokeWidth="1" strokeDasharray="4 3" />
        <text x={px(EMin) + 5} y={H - padB - 6} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">Emin = {f3(EMin)}</text>

        {/* y = yc horizontal */}
        <line x1={padL} x2={px(EMin)} y1={py(yc)} y2={py(yc)} stroke={MUTED} strokeWidth="1" strokeDasharray="4 3" />
        <text x={padL + 6} y={py(yc) - 5} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">yc = {f3(yc)}</text>

        {/* 45° asymptote */}
        <line x1={px(asyE0)} y1={py(Math.min(yMaxPlot, asyE0))} x2={px(EMax)} y2={py(asyMax)} stroke={HAIR} strokeWidth="1" strokeDasharray="2 4" />
        <text x={px(EMax) - 4} y={py(asyMax) + 14} textAnchor="end" fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">y = E</text>

        {/* limbs */}
        <polyline points={upper.join(' ')} fill="none" stroke={INK} strokeWidth="1.8" />
        <polyline points={lower.join(' ')} fill="none" stroke={INK} strokeWidth="1.8" />
        <text x={px(specificEnergy(shape, yMaxPlot * 0.92, Q)) + 8} y={py(yMaxPlot * 0.92)} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">subcritical</text>
        <text x={px(specificEnergy(shape, yc * 0.35, Q)) + 8} y={py(yc * 0.35)} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">supercritical</text>

        {/* critical point */}
        <circle cx={px(EMin)} cy={py(yc)} r="3.5" fill={INK} />

        {/* probe and its alternate */}
        {probe && probe.E <= EMax && probe.y <= yMaxPlot && (
          <>
            <line x1={px(probe.E)} x2={px(probe.E)} y1={py(probe.y)} y2={H - padB} stroke="rgba(15,76,146,0.45)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={px(probe.E)} cy={py(probe.y)} r="4" fill="#0f4c92" />
            <text x={px(probe.E) + 7} y={py(probe.y) - 7} fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">
              y = {f2(probe.y)}, Fr = {f2(probe.Fr)}
            </text>
            {alt !== null && probe.Fr < 1 && (
              <>
                <line x1={px(probe.E)} x2={px(probe.E)} y1={py(alt)} y2={py(probe.y)} stroke="rgba(15,76,146,0.45)" strokeWidth="1" strokeDasharray="3 3" />
                <circle cx={px(probe.E)} cy={py(alt)} r="4" fill="none" stroke="#0f4c92" strokeWidth="1.6" />
                <text x={px(probe.E) + 7} y={py(alt) + 4} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
                  alternate {f2(alt)} m
                </text>
              </>
            )}
          </>
        )}

        <text x={padL} y={H - 8} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
          E = y + Q²/(2gA²) · critical where Q²T/(gA³) = 1 · g = {f2(G)} m/s²
        </text>
      </svg>
    </DrawingFrame>
  )
}
