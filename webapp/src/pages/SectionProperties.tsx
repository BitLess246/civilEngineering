import { useState } from 'react'
import 'katex/dist/katex.min.css'
import {
  rectComposite, rectangle, circle, hollowCircle, iShape, tShape, channelShape, angleShape,
  type SectionResult, type RectRow,
} from '../engine/sectionProperties'
import { Card, Num, Pick, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, HAIR, f2, f3 } from '../lib/influenceStyle'

// Section Properties — area, centroid, moments of inertia, section moduli
// and radii of gyration for the student classics: rectangle, circle, tube,
// built-up I / T / channel / angle, and a free-form rectangle stack for any
// composite section (engine/sectionProperties.ts).

type Preset = 'rect' | 'circle' | 'tube' | 'i' | 't' | 'channel' | 'angle' | 'custom'

const PRESETS: [Preset, string][] = [
  ['rect', 'Rectangle'],
  ['circle', 'Circle'],
  ['tube', 'Hollow circle'],
  ['i', 'I-shape (built-up)'],
  ['t', 'T-shape'],
  ['channel', 'Channel'],
  ['angle', 'Equal-leg angle'],
  ['custom', 'Custom built-up'],
]

interface RowUI { x: string; y: string; w: string; h: string }

export default function SectionProperties() {
  const [preset, setPreset] = useState<Preset>('i')
  // shape inputs (mm)
  const [d, setD] = useState(200)
  const [Dout, setDout] = useState(200)
  const [dt, setDt] = useState(100)
  const [h, setH] = useState(300)
  const [b, setB] = useState(150)
  const [tf, setTf] = useState(10)
  const [tw, setTw] = useState(8)
  const [leg, setLeg] = useState(100)
  const [thk, setThk] = useState(10)
  const [rows, setRows] = useState<RowUI[]>([
    { x: '0', y: '0', w: '150', h: '10' },
    { x: '71', y: '10', w: '8', h: '280' },
    { x: '0', y: '290', w: '150', h: '10' },
  ])

  const setRow = (i: number, patch: Partial<RowUI>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))

  const res: SectionResult | null = (() => {
    try {
      switch (preset) {
        case 'rect': return rectangle(b, h)
        case 'circle': return circle(d)
        case 'tube': return hollowCircle(Dout, dt)
        case 'i': return iShape(h, b, tf, tw)
        case 't': return tShape(h, b, tf, tw)
        case 'channel': return channelShape(h, b, tf, tw)
        case 'angle': return angleShape(leg, thk)
        case 'custom': return rectComposite(rows.map((r) => ({
          x: parseFloat(r.x) || 0, y: parseFloat(r.y) || 0,
          w: parseFloat(r.w) || 0, h: parseFloat(r.h) || 0,
        })))
      }
    } catch { return null }
  })()

  const steps: SolutionStep[] = res ? (res.rows ? [
    {
      title: 'Centroid of the composite',
      lines: [
        ...res.rows.map((r) => ({
          item: `${r.name}: A = ${f2(r.A)} mm² · ȳ from bottom = ${f2(r.cy)} mm → A·ȳ = ${f2(r.A * r.cy / 1000)}×10³ mm³`,
        })),
        { tex: `\\bar{y} = \\frac{\\sum A_i \\bar{y}_i}{\\sum A_i} = \\frac{${f2(res.rows.reduce((s, r) => s + r.A * r.cy, 0))}}{${f2(res.A)}} = ${f2(res.cy)}\\text{ mm}` },
        { text: 'Every rectangle reports its own area and centroid, measured from the bottom of the section; the composite centroid is the area-weighted average.' },
      ],
    },
    {
      title: 'Parallel-axis theorem, row by row',
      lines: [
        ...res.rows.map((r) => ({
          item: `${r.name}: I = ${f2(r.Ix)} + A·dy² = ${f2(r.Ix)} + ${f2(r.A)}×(${f2(r.dy)})² = ${f2(r.Ix + r.transferX)} mm⁴`,
        })),
        { tex: `I_x = \\sum\\left( \\bar{I}_i + A_i d_i^2 \\right) = ${f2(res.Ix / 1e6)}\\times 10^6\\text{ mm}^4` },
        { tex: `I_y = ${f2(res.Iy / 1e6)}\\times 10^6\\text{ mm}^4 \\;\\text{(same route with } dx = x_i - \\bar{x}\\text{)}` },
        { text: 'd is the distance from the row centroid to the composite centroid — the transfer term A·d² is where a built-up section earns its stiffness.' },
      ],
    },
    {
      title: 'Moduli and radii of gyration',
      lines: [
        { tex: `S_x = \\frac{I_x}{c_{max}} = \\frac{${f2(res.Ix)}}{${f2(Math.max(res.cTop, res.cBot))}} = ${f2(res.Sx)}\\text{ mm}^3` },
        { tex: `r_x = \\sqrt{\\frac{I_x}{A}} = ${f2(res.rx)}\\text{ mm}, \\qquad r_y = ${f2(res.ry)}\\text{ mm}` },
        { text: 'For the asymmetric sections (T, channel) the centroid is not mid-depth and the extreme fibre governs Sx — the c you divide by is the larger of top and bottom.' },
      ],
    },
  ] : [
    {
      title: 'Closed-form section properties',
      lines: preset === 'rect'
        ? [
            { tex: `A = bh = ${f2(b)}\\times${f2(h)}, \\quad I_x = \\frac{bh^3}{12} = ${f2(res.Ix)}, \\quad I_y = \\frac{hb^3}{12} = ${f2(res.Iy)}` },
            { tex: `S_x = \\frac{bh^2}{6} = ${f2(res.Sx)}, \\quad r_x = \\frac{h}{\\sqrt{12}} = ${f2(res.rx)}` },
            { text: 'The rectangle is the atom every built-up section decomposes into — the parallel-axis table below any composite is just these numbers moved.' },
          ]
        : preset === 'circle'
          ? [
              { tex: `A = \\frac{\\pi d^2}{4}, \\quad I = \\frac{\\pi d^4}{64}, \\quad S = \\frac{\\pi d^3}{32}, \\quad r = \\frac{d}{4}` },
              { text: `All four read straight off d = ${f2(d)} mm. A circle is its own principal frame — Ix = Iy and the radii of gyration are equal.` },
            ]
          : [
              { tex: `A = \\frac{\\pi (D^2 - d^2)}{4}, \\quad I = \\frac{\\pi (D^4 - d^4)}{64}` },
              { tex: `r = \\sqrt{I/A} = \\frac{\\sqrt{D^2 + d^2}}{4} = ${f2(res.rx)}\\text{ mm}` },
              { text: `Hollow sections push area away from the axis: at D = ${f2(Dout)} with d = ${f2(dt)}, the tube keeps ${f2(100 * (1 - (dt / Dout) ** 2))}% of the solid area but ${f2(100 * (1 - (dt / Dout) ** 4))}% of its stiffness.` },
            ],
    },
  ]) : []

  return (
    <div>
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <ReportControls title="Section Properties Report" badges={['A · I · S · r']} />
        <p className="mt-2 max-w-3xl text-sm text-muted">
          The student toolkit behind every bending check: centroid, moments of inertia by the
          parallel-axis theorem, section moduli and radii of gyration — for the single shapes or any
          built-up stack of rectangles, with the whole table shown.
        </p>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="space-y-5">
            <Card title="Section">
              <Pick label="Preset" value={preset} onChange={(v) => setPreset(v as Preset)} options={PRESETS} />
              {preset === 'rect' && (
                <>
                  <Num label="Base b" unit="mm" value={b} onChange={setB} min={5} max={2000} step="5" />
                  <Num label="Height h" unit="mm" value={h} onChange={setH} min={5} max={2000} step="5" />
                </>
              )}
              {preset === 'circle' && (
                <Num label="Diameter d" unit="mm" value={d} onChange={setD} min={5} max={2000} step="5" />
              )}
              {preset === 'tube' && (
                <>
                  <Num label="Outer D" unit="mm" value={Dout} onChange={setDout} min={10} max={2000} step="5" />
                  <Num label="Inner d" unit="mm" value={dt} onChange={setDt} min={0} max={1995} step="5" />
                </>
              )}
              {(preset === 'i' || preset === 't' || preset === 'channel') && (
                <>
                  <Num label="Overall depth d" unit="mm" value={h} onChange={setH} min={20} max={2000} step="5" />
                  <Num label="Flange width bf" unit="mm" value={b} onChange={setB} min={10} max={1000} step="5" />
                  <Num label="Flange thickness tf" unit="mm" value={tf} onChange={setTf} min={1} max={200} step="0.5" />
                  <Num label="Web thickness tw" unit="mm" value={tw} onChange={setTw} min={1} max={200} step="0.5" />
                </>
              )}
              {preset === 'angle' && (
                <>
                  <Num label="Leg a" unit="mm" value={leg} onChange={setLeg} min={10} max={500} step="5" />
                  <Num label="Thickness t" unit="mm" value={thk} onChange={setThk} min={1} max={100} step="0.5" />
                </>
              )}
            </Card>

            {preset === 'custom' && (
              <Card title="Rectangle stack" hint="x, y from the bottom-left of the section">
                {rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[3rem_3rem_3rem_3rem_1.4rem] items-end gap-1.5">
                    <Num label="x" value={parseFloat(r.x) || 0} onChange={(v) => setRow(i, { x: String(v) })} step="1" />
                    <Num label="y" value={parseFloat(r.y) || 0} onChange={(v) => setRow(i, { y: String(v) })} step="1" />
                    <Num label="w" value={parseFloat(r.w) || 0} onChange={(v) => setRow(i, { w: String(v) })} step="1" />
                    <Num label="h" value={parseFloat(r.h) || 0} onChange={(v) => setRow(i, { h: String(v) })} step="1" />
                    <button type="button" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} disabled={rows.length <= 1}
                      className="mb-1.5 text-muted hover:text-fail disabled:opacity-30">✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => setRows((rs) => [...rs, { x: '0', y: '0', w: '50', h: '50' }])}
                  className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">+ Add rectangle</button>
              </Card>
            )}
          </div>

          <div className="space-y-5">
            {res ? (
              <>
                <ResultCard title="Section properties">
                  <Row label="Area A" value={`${f2(res.A)} mm²`} sub={`${f2(res.A / 100)} cm²`} />
                  <Row label="Centroid ȳ" value={`${f2(res.cy)} mm`} sub={`from bottom · x̄ = ${f2(res.cx)} mm from left`} />
                  <Row label="Ix" value={`${f3(res.Ix / 1e6)} ×10⁶ mm⁴`} sub={`cTop = ${f2(res.cTop)} · cBot = ${f2(res.cBot)} mm`} />
                  <Row label="Iy" value={`${f3(res.Iy / 1e6)} ×10⁶ mm⁴`} sub={`cLeft = ${f2(res.cLeft)} · cRight = ${f2(res.cRight)} mm`} />
                  <Row label="Sx / Sy" value={`${f2(res.Sx / 1e3)} / ${f2(res.Sy / 1e3)} ×10³ mm³`} sub="weakest fibre governs" />
                  <Row label="rx / ry" value={`${f2(res.rx)} / ${f2(res.ry)} mm`} sub="radii of gyration" />
                </ResultCard>

                <DrawingCard title="Section, to scale" meta="centroid marked · dimensions in mm">
                  <SectionView preset={preset} res={res} inputs={{ b, h, d, D: Dout, dt, bf: b, tf, tw, leg, thk, rows: rows.map((r) => ({
                    x: parseFloat(r.x) || 0, y: parseFloat(r.y) || 0, w: parseFloat(r.w) || 0, h: parseFloat(r.h) || 0,
                  })) }} />
                </DrawingCard>

                <WorkedSolution steps={steps} title="Section properties — step-by-step" />
              </>
            ) : (
              <ResultCard title="Check the inputs">
                <p className="text-sm text-fail">
                  Dimensions must be positive and consistent: the tube needs d &lt; D, the I and T
                  need depth beyond twice the flange thickness, the angle needs leg &gt; thickness,
                  and the custom stack needs at least one rectangle with positive size.
                </p>
              </ResultCard>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── section view: outline, centroid cross, dimensions ────────────────────

function SectionView({ preset, res, inputs }: {
  preset: Preset
  res: SectionResult
  inputs: {
    b: number; h: number; d: number; D: number; dt: number; bf: number; tf: number
    tw: number; leg: number; thk: number
    rows: RectRow[]
  }
}) {
  const W = 640
  const H = 400
  const pad = 64

  // overall extents from the result itself
  const yHi = res.cy + res.cTop
  const xHi = res.cx + res.cRight
  const scale = Math.min((W - 2 * pad - 60) / xHi, (H - 2 * pad - 30) / yHi)
  const ox = (W - xHi * scale) / 2
  const oy = (H - yHi * scale) / 2 + 14

  const sx = (x: number) => ox + x * scale
  const sy = (y: number) => oy + (yHi - y) * scale

  // outline paths per preset (section coordinates, y up)
  const p: string[] = []
  if (preset === 'rect') {
    p.push(`M ${sx(0)} ${sy(0)} H ${sx(inputs.b)} V ${sy(inputs.h)} H ${sx(0)} Z`)
  } else if (preset === 'circle' || preset === 'tube') {
    const r = sx(inputs.d / 2 + 0) - sx(0)
    const cx = sx(inputs.d / 2), cy = sy(inputs.d / 2)
    p.push(`M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy}`)
    if (preset === 'tube') {
      const r2 = (inputs.dt / inputs.d) * r
      p.push(`M ${cx - r2} ${cy} A ${r2} ${r2} 0 1 1 ${cx + r2} ${cy} A ${r2} ${r2} 0 1 1 ${cx - r2} ${cy}`)
    }
  } else if (preset === 'i') {
    const { bf, tf, tw } = inputs
    const hw = inputs.h - 2 * tf
    p.push(`M ${sx(0)} ${sy(0)} H ${sx(bf)} V ${sy(tf)} H ${sx((bf + tw) / 2)} V ${sy(tf + hw)} H ${sx(bf)} V ${sy(inputs.h)} H ${sx(0)} V ${sy(tf + hw)} H ${sx((bf - tw) / 2)} V ${sy(tf)} H ${sx(0)} Z`)
  } else if (preset === 't') {
    const { bf, tf, tw } = inputs
    p.push(`M ${sx((bf - tw) / 2)} ${sy(0)} H ${sx((bf + tw) / 2)} V ${sy(inputs.h - tf)} H ${sx(bf)} V ${sy(inputs.h)} H ${sx(0)} V ${sy(inputs.h - tf)} H ${sx((bf - tw) / 2)} Z`)
  } else if (preset === 'channel') {
    const { bf, tf, tw } = inputs
    p.push(`M ${sx(0)} ${sy(0)} H ${sx(bf)} V ${sy(tf)} H ${sx(bf - tw)} V ${sy(inputs.h - tf)} H ${sx(bf)} V ${sy(inputs.h)} H ${sx(0)} Z`)
  } else if (preset === 'angle') {
    const { leg, thk } = inputs
    p.push(`M ${sx(0)} ${sy(0)} H ${sx(leg)} V ${sy(thk)} H ${sx(thk)} V ${sy(leg)} H ${sx(0)} Z`)
  } else {
    for (const r of inputs.rows) {
      if (r.w > 0 && r.h > 0) p.push(`M ${sx(r.x)} ${sy(r.y)} H ${sx(r.x + r.w)} V ${sy(r.y + r.h)} H ${sx(r.x)} Z`)
    }
  }

  // row ghosts for the composite presets (the rectangles the table solves)
  const ghosts: RectRow[] = preset === 'i'
    ? [
        { x: (inputs.bf - inputs.tw) / 2, y: inputs.tf, w: inputs.tw, h: inputs.h - 2 * inputs.tf, name: 'web' },
        { x: 0, y: inputs.h - inputs.tf, w: inputs.bf, h: inputs.tf, name: 'top flange' },
        { x: 0, y: 0, w: inputs.bf, h: inputs.tf, name: 'bottom flange' },
      ]
    : preset === 't'
      ? [
          { x: (inputs.bf - inputs.tw) / 2, y: 0, w: inputs.tw, h: inputs.h - inputs.tf, name: 'web' },
          { x: 0, y: inputs.h - inputs.tf, w: inputs.bf, h: inputs.tf, name: 'flange' },
        ]
      : preset === 'channel'
        ? [
            { x: inputs.bf - inputs.tw, y: 0, w: inputs.tw, h: inputs.h, name: 'web' },
            { x: 0, y: inputs.h - inputs.tf, w: inputs.bf, h: inputs.tf, name: 'top flange' },
            { x: 0, y: 0, w: inputs.bf, h: inputs.tf, name: 'bottom flange' },
          ]
        : preset === 'angle'
          ? [
              { x: 0, y: 0, w: inputs.thk, h: inputs.leg, name: 'vertical leg' },
              { x: inputs.thk, y: 0, w: inputs.leg - inputs.thk, h: inputs.thk, name: 'horizontal leg' },
            ]
          : []

  return (
    <DrawingFrame label="Section outline with centroid axes">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Section view">
        {/* row decomposition ghosts */}
        {ghosts.map((g, i) => (
          <rect key={i} x={sx(g.x)} y={sy(g.y + g.h)} width={g.w * scale} height={g.h * scale}
            fill="none" stroke={HAIR} strokeWidth="1" strokeDasharray="4 3" />
        ))}

        {/* outline */}
        {p.map((d, i) => (
          <path key={i} d={d} fill="rgba(15,76,146,0.07)" stroke={INK} strokeWidth="1.7" fillRule="evenodd" />
        ))}

        {/* centroid axes */}
        <line x1={sx(res.cx) - 26} x2={sx(res.cx) + 26} y1={sy(res.cy)} y2={sy(res.cy)} stroke={MUTED} strokeWidth="1.1" />
        <line x1={sx(res.cx)} x2={sx(res.cx)} y1={sy(res.cy) - 26} y2={sy(res.cy) + 26} stroke={MUTED} strokeWidth="1.1" />
        <circle cx={sx(res.cx)} cy={sy(res.cy)} r="3" fill="none" stroke={MUTED} strokeWidth="1.1" />
        <text x={sx(res.cx) + 30} y={sy(res.cy) + 4} fontSize="10.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">
          ȳ = {f2(res.cy)}
        </text>

        {/* overall depth dimension */}
        <line x1={sx(xHi) + 30} x2={sx(xHi) + 30} y1={sy(0)} y2={sy(yHi)} stroke={MUTED} strokeWidth="1" />
        <text x={sx(xHi) + 36} y={sy(yHi) + 8} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
          {f2(yHi)} mm
        </text>
        <text x={sx(0)} y={sy(0) + 22} fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">
          A = {f2(res.A)} mm² · Ix = {f3(res.Ix / 1e6)}×10⁶ mm⁴
        </text>
        <text x={sx(0)} y={H - 8} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
          dashed = the rectangle rows the parallel-axis table solves
        </text>
      </svg>
    </DrawingFrame>
  )
}
