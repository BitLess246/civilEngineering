import { useState } from 'react'
import {
  hydraulicJump, type JumpResult, type ChannelShape,
} from '../engine/openChannel'
import { Card, Num, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, HAIR, f2, f3 } from '../lib/influenceStyle'
import { buildShape, type ShapeState } from './openChannelTypes'
import { ShapeCard } from './openChannelShared'

// Open channel — HYDRAULIC JUMP mode. Given the discharge and the
// supercritical approach depth, the engine finds the sequent (conjugate)
// depth where the momentum function matches, then reports the energy
// dissipated, the power, the jump class and a classical length.

const SAMPLE: ShapeState = { kind: 'rect', b: '2', z: '1.5', D: '2' }

export function JumpMode() {
  const [shape, setShape] = useState<ShapeState>(SAMPLE)
  const [Q, setQ] = useState(3)
  const [y1, setY1] = useState(0.35)

  const ch: ChannelShape = buildShape(shape)

  type JumpRes = { j: JumpResult } | { error: Error }
  const res: JumpRes = (() => {
    try {
      const j = hydraulicJump(ch, Q, y1)
      return { j }
    } catch (e) {
      return { error: e as Error }
    }
  })()

  // Approach area/top-width from the live section inputs — the same
  // formulas geomAt uses, so the Fr₁ substitution shows real numbers.
  const geom12 = (y: number) => {
    if (ch.kind === 'rect') return { A: ch.b * y, T: ch.b }
    if (ch.kind === 'trap') return { A: (ch.b + ch.z * y) * y, T: ch.b + 2 * ch.z * y }
    if (ch.kind === 'tri') return { A: ch.z * y * y, T: 2 * ch.z * y }
    const th = 2 * Math.acos(Math.min(1, Math.max(-1, 1 - (2 * y) / ch.D)))
    return { A: (ch.D * ch.D / 8) * (th - Math.sin(th)), T: ch.D * Math.sin(th / 2) }
  }
  const g1 = geom12(y1)
  const g2 = 'j' in res ? geom12(res.j.y2) : null
  const mom1 = (Q * Q) / (9.81 * g1.A)
  const mom2 = 'j' in res ? res.j.M - mom1 : 0

  const steps: SolutionStep[] = 'j' in res ? [
    {
      title: 'Approach flow',
      lines: [
        { tex: ch.kind === 'rect'
          ? `A_1 = b\\,y_1 = ${f3(ch.b)}\\times ${f3(y1)} = ${f3(g1.A)}\\text{ m}^2, \\quad T_1 = b = ${f3(g1.T)}\\text{ m}`
          : ch.kind === 'trap'
            ? `A_1 = (b + z\\,y_1)\\,y_1 = ${f3(g1.A)}\\text{ m}^2, \\quad T_1 = b + 2z\\,y_1 = ${f3(ch.b)} + 2\\times ${f3(ch.z)}\\times ${f3(y1)} = ${f3(g1.T)}\\text{ m}`
            : ch.kind === 'tri'
              ? `A_1 = z\\,y_1^2 = ${f3(ch.z)}\\times ${f3(y1)}^2 = ${f3(g1.A)}\\text{ m}^2, \\quad T_1 = 2z\\,y_1 = ${f3(g1.T)}\\text{ m}`
              : `A_1 = ${f3(g1.A)}\\text{ m}^2, \\quad T_1 = ${f3(g1.T)}\\text{ m} \\;\\; (D = ${f3(ch.D)}\\text{ m},\\; y_1 = ${f3(y1)}\\text{ m})` },
        { tex: `Fr_1 = \\sqrt{\\frac{Q^2 T_1}{g A_1^3}} = \\sqrt{\\frac{${f3(Q)}^2\\times ${f3(g1.T)}}{9.81\\times ${f3(g1.A)}^3}} = ${f3(res.j.Fr1)} \\;\\Rightarrow\\; \\text{${res.j.cls}} jump` },
        { text: 'A jump forms only when the approach flow is supercritical (Fr₁ > 1): the fast shallow stream cannot stay on the curve and rises abruptly to its sequent partner.' },
      ],
    },
    {
      title: 'Sequent depth — momentum is conserved across the jump',
      lines: res.j.closedForm
        ? [
            { tex: `M = \\frac{Q^2}{gA} + A\\bar{y}:\\quad M(y_2) = M(y_1)` },
            { tex: `y_2 = \\frac{y_1}{2}\\left(\\sqrt{1 + 8Fr_1^2} - 1\\right) = \\frac{${f3(y1)}}{2}\\left(\\sqrt{1 + 8\\times ${f3(res.j.Fr1)}^2} - 1\\right) = ${f3(res.j.y2)}\\text{ m}` },
            { text: 'For a rectangle this solves in closed form; for trapezoids, triangles and pipes the momentum function is matched by bisection on the subcritical branch.' },
          ]
        : [
            { tex: `M = \\frac{Q^2}{gA} + A\\bar{y}:\\quad M(y_2) = M(y_1) = ${f3(res.j.M)}\\text{ m}^3` },
            { tex: `M(y_1) = \\frac{${f3(Q)}^2}{9.81\\times ${f3(g1.A)}} + ${f3(g1.A)}\\times ${f3(g1.A > 0 ? mom2 / g1.A : 0)} = ${f3(mom1)} + ${f3(mom2)} = ${f3(res.j.M)}\\text{ m}^3` },
            { text: `The sequent depth is y₂ = ${f3(res.j.y2)} m, found by bisecting the momentum function on the subcritical branch above the critical depth. The rectangular closed form does not apply to this shape.` },
          ],
    },
    {
      title: 'Energy destroyed in the roller',
      lines: [
        { tex: `E_1 = y_1 + \\frac{Q^2}{2gA_1^2} = ${f3(y1)} + \\frac{${f3(Q)}^2}{2\\times 9.81\\times ${f3(g1.A)}^2} = ${f3(res.j.E1)}\\text{ m}` },
        { tex: `E_2 = y_2 + \\frac{Q^2}{2gA_2^2} = ${f3(res.j.y2)} + \\frac{${f3(Q)}^2}{2\\times 9.81\\times ${f3(g2?.A ?? 0)}^2} = ${f3(res.j.E2)}\\text{ m}` },
        { tex: `\\Delta E = E_1 - E_2 = \\left(${f3(res.j.E1)}\\right) - \\left(${f3(res.j.E2)}\\right) = ${f3(res.j.dE)}\\text{ m}` },
        { tex: `P = \\gamma\\, Q\\, \\Delta E = 9.81 \\times ${f3(Q)} \\times ${f3(res.j.dE)} = ${f2(res.j.powerKW)}\\text{ kW}` },
        { text: `A rectangular jump has the closed loss form ΔE = (y₂ − y₁)³/(4·y₁·y₂). The basin below the jump must take this as turbulence — stilling basins shorten the roller with baffle blocks and sills.` },
      ],
    },
  ] : []

  return (
    <div>
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <ReportControls title="Open Channel — Hydraulic Jump Report" badges={['Sequent depth']} />
        <p className="mt-2 max-w-3xl text-sm text-muted">
          The stilling-basin calculation: sequent depth from momentum conservation, the energy head
          destroyed in the roller, the kilowatts it turns into turbulence, and the jump class that
          decides how violent the surface looks.
        </p>

        <div className="mt-5 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="space-y-5">
            <ShapeCard shape={shape} onChange={(patch) => setShape((s) => ({ ...s, ...patch }))}
              hint="Jump section — usually the apron downstream of a spillway" />
            <Card title="Approach flow">
              <Num label="Discharge Q" unit="m³/s" value={Q} onChange={setQ} min={0.01} max={500} step="0.1" />
              <Num label="Approach depth y₁ (supercritical)" unit="m" value={y1} onChange={setY1} min={0.01} max={20} step="0.05" />
            </Card>
          </div>

          <div className="space-y-5">
            {'j' in res ? (
              <>
                <ResultCard title="Hydraulic jump">
                  <Row label="Sequent depth y₂" value={`${f3(res.j.y2)} m`} sub={`from y₁ = ${f3(y1)} m · ${res.j.closedForm ? 'closed form' : 'momentum bisection'}`} />
                  <Row label="Froude numbers" value={`Fr₁ = ${f3(res.j.Fr1)} → Fr₂ = ${f3(res.j.Fr2)}`} sub={`${res.j.cls} jump`} alert={res.j.Fr1 >= 4.5} />
                  <Row label="Energy loss ΔE" value={`${f3(res.j.dE)} m`} sub={`E₁ = ${f3(res.j.E1)} → E₂ = ${f3(res.j.E2)} m`} />
                  <Row label="Power dissipated" value={`${f2(res.j.powerKW)} kW`} sub={`jump length ≈ ${f2(res.j.Lj)} m (6.1·y₂)`} />
                </ResultCard>

                <DrawingCard title="Jump profile" meta="longitudinal section through the roller">
                  <JumpProfile shape={ch} j={res.j} />
                </DrawingCard>

                <WorkedSolution steps={steps} title="Hydraulic jump — step-by-step" />
              </>
            ) : (
              <ResultCard title="Check the inputs">
                <p className="text-sm text-fail">{res.error.message}</p>
                <p className="mt-2 text-sm text-muted">
                  A jump needs a supercritical approach: lower y₁ until Fr₁ &gt; 1, or raise Q. The
                  depth that arrives off a spillway apron is almost always supercritical; a normal
                  depth from a mild channel is not.
                </p>
              </ResultCard>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── longitudinal jump profile ─────────────────────────────────────────────

function JumpProfile({ shape, j }: { shape: ChannelShape; j: JumpResult }) {
  const W = 640
  const H = 360
  const pad = 46
  const yMax = Math.max(j.y2 * 1.3, j.y1 * 1.6, 0.2)
  const width = shape.kind === 'circle' ? Math.max(shape.D * 2.5, 2)
    : shape.kind === 'rect' ? Math.max(shape.b * 2, 2)
    : shape.kind === 'trap' ? Math.max((shape.b + 2 * shape.z * yMax) * 1.2, 2)
    : Math.max(2 * shape.z * yMax * 1.2, 2)

  const scale = (W - 2 * pad) / width
  const bedY = H - pad - 30
  const sy = (d: number) => d * scale

  // water surface: y1 for the approach, S-curve through the jump, y2 after
  const xJump0 = W * 0.32
  const xJump1 = W * 0.52
  const surf = (x: number): number => {
    if (x < xJump0) return j.y1
    if (x > xJump1) return j.y2
    const t = (x - xJump0) / (xJump1 - xJump0)
    const s = t * t * (3 - 2 * t) // smoothstep — the roller's rise
    return j.y1 + (j.y2 - j.y1) * s
  }

  const pts: string[] = []
  for (let i = 0; i <= 80; i++) {
    const x = pad + (W - 2 * pad) * i / 80
    pts.push(`${x},${bedY - sy(surf(x))}`)
  }

  // energy line: E1 flat, dropping across the jump to E2, recovering a little
  const eLine = (x: number): number => {
    if (x < xJump0) return j.E1
    if (x > xJump1) return j.E2
    const t = (x - xJump0) / (xJump1 - xJump0)
    return j.E1 + (j.E2 - j.E1) * (t * t * (3 - 2 * t))
  }
  const ETop = j.E1 + j.y2 * 0.2
  const energyPts: string[] = []
  for (let i = 0; i <= 80; i++) {
    const x = pad + (W - 2 * pad) * i / 80
    const yScreen = bedY - 24 - (eLine(x) / ETop) * (bedY - 24 - Math.max(sy(yMax) + 30, 60)) * 0.9
    energyPts.push(`${x},${yScreen}`)
  }

  return (
    <DrawingFrame label="Longitudinal jump profile">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Hydraulic jump profile">
        {/* bed */}
        <line x1={pad} x2={W - pad} y1={bedY} y2={bedY} stroke={INK} strokeWidth="1.6" />
        {Array.from({ length: 22 }, (_, i) => {
          const x = pad + 6 + i * (W - 2 * pad - 12) / 21
          return <line key={i} x1={x} x2={x + 6} y1={bedY + 3} y2={bedY + 10} stroke={HAIR} strokeWidth="1" />
        })}

        {/* water body */}
        <polygon points={`${pad},${bedY} ${pts.join(' ')} ${W - pad},${bedY}`} fill="rgba(15,76,146,0.20)" stroke="none" />
        {/* surface */}
        <polyline points={pts.join(' ')} fill="none" stroke={INK} strokeWidth="1.8" />
        {/* the roller: little circles on the jump face */}
        {Array.from({ length: 5 }, (_, i) => {
          const t = (i + 0.5) / 5
          const x = xJump0 + (xJump1 - xJump0) * t
          const y = surf(x) * (0.55 + 0.4 * Math.sin(t * Math.PI))
          return <circle key={i} cx={x} cy={bedY - sy(y)} r={2 + t * 2} fill="none" stroke={MUTED} strokeWidth="1" />
        })}

        {/* energy line */}
        <polyline points={energyPts.join(' ')} fill="none" stroke="rgba(15,76,146,0.65)" strokeWidth="1.2" strokeDasharray="6 3" />
        <text x={W - pad - 4} y={Number(energyPts[energyPts.length - 1].split(',')[1]) - 6} textAnchor="end" fontSize="10" fill="rgba(15,76,146,0.85)" fontFamily="var(--font-mono, monospace)">
          E = {f3(j.E2)} m after
        </text>
        <text x={pad + 4} y={Number(energyPts[2].split(',')[1]) - 6} fontSize="10" fill="rgba(15,76,146,0.85)" fontFamily="var(--font-mono, monospace)">
          E = {f3(j.E1)} m before
        </text>

        {/* depth tags */}
        <line x1={pad} x2={xJump0} y1={bedY - sy(j.y1)} y2={bedY - sy(j.y1)} stroke={MUTED} strokeWidth="0.8" strokeDasharray="3 3" />
        <text x={pad + 8} y={bedY - sy(j.y1) - 6} fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">
          y₁ = {f3(j.y1)} m · Fr₁ = {f2(j.Fr1)}
        </text>
        <line x1={xJump1} x2={W - pad} y1={bedY - sy(j.y2)} y2={bedY - sy(j.y2)} stroke={MUTED} strokeWidth="0.8" strokeDasharray="3 3" />
        <text x={W - pad - 8} y={bedY - sy(j.y2) - 6} textAnchor="end" fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">
          y₂ = {f3(j.y2)} m · Fr₂ = {f2(j.Fr2)}
        </text>

        {/* ΔE bracket */}
        <line x1={W * 0.62} x2={W * 0.62} y1={bedY - sy(j.y2)} y2={bedY - sy(j.y2) + sy(j.dE)} stroke={MUTED} strokeWidth="1" />
        <text x={W * 0.62 + 8} y={bedY - sy(j.y2) + sy(j.dE) / 2 + 3} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
          ΔE = {f3(j.dE)} m
        </text>

        <text x={pad} y={H - 8} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
          {j.cls} jump · {f2(j.powerKW)} kW dissipated · length ≈ 6.1·y₂ = {f2(j.Lj)} m
        </text>
      </svg>
    </DrawingFrame>
  )
}
