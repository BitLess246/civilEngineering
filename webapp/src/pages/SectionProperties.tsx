import { useState } from 'react'
import 'katex/dist/katex.min.css'
import {
  rectComposite, rectangle, circle, hollowCircle, iShape, tShape, channelShape, angleShape,
  type SectionResult, type RectRow,
} from '../engine/sectionProperties'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { DrawingFrame } from '../components/DrawingFrame'
import { DimBelow, DimSide } from '../components/dims'
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
        { tex: `I_y = \\sum\\left( \\bar{I}_i + A_i d_i^2 \\right) = ${f2(res.Iy / 1e6)}\\times 10^6\\text{ mm}^4` },
        { text: 'Both axes take the same route — the only difference is the offset: dy = yi − ȳ feeds Ix, dx = xi − x̄ feeds Iy.' },
        { text: 'd is the distance from the row centroid to the composite centroid — the transfer term A·d² is where a built-up section earns its stiffness.' },
      ],
    },
    {
      title: 'Moduli and radii of gyration',
      lines: [
        { tex: `S_x = \\frac{I_x}{c_{max}} = \\frac{${f2(res.Ix)}}{${f2(Math.max(res.cTop, res.cBot))}} = ${f2(res.Sx)}\\text{ mm}^3` },
        { tex: `r_x = \\sqrt{\\frac{I_x}{A}} = \\sqrt{\\frac{${f2(res.Ix)}}{${f2(res.A)}}} = ${f2(res.rx)}\\text{ mm}` },
        { tex: `r_y = \\sqrt{\\frac{I_y}{A}} = \\sqrt{\\frac{${f2(res.Iy)}}{${f2(res.A)}}} = ${f2(res.ry)}\\text{ mm}` },
        { text: 'For the asymmetric sections (T, channel) the centroid is not mid-depth and the extreme fibre governs Sx — the c you divide by is the larger of top and bottom.' },
      ],
    },
  ] : [
    {
      title: 'Closed-form section properties',
      lines: preset === 'rect'
        ? [
            { tex: `A = bh = ${f2(b)}\\times${f2(h)} = ${f2(res.A)}\\text{ mm}^2` },
            { tex: `I_x = \\frac{bh^3}{12} = \\frac{${f2(b)}\\times${f2(h)}^3}{12} = ${f2(res.Ix)}\\text{ mm}^4` },
            { tex: `I_y = \\frac{hb^3}{12} = \\frac{${f2(h)}\\times${f2(b)}^3}{12} = ${f2(res.Iy)}\\text{ mm}^4` },
            { tex: `S_x = \\frac{bh^2}{6} = \\frac{${f2(b)}\\times${f2(h)}^2}{6} = ${f2(res.Sx)}\\text{ mm}^3, \\quad r_x = \\frac{h}{\\sqrt{12}} = \\frac{${f2(h)}}{\\sqrt{12}} = ${f2(res.rx)}\\text{ mm}` },
            { text: 'The rectangle is the atom every built-up section decomposes into — the parallel-axis table below any composite is just these numbers moved.' },
          ]
        : preset === 'circle'
          ? [
              { tex: `A = \\frac{\\pi d^2}{4} = \\frac{\\pi\\times${f2(d)}^2}{4} = ${f2(res.A)}\\text{ mm}^2` },
              { tex: `I = \\frac{\\pi d^4}{64} = \\frac{\\pi\\times${f2(d)}^4}{64} = ${f2(res.Ix)}\\text{ mm}^4` },
              { tex: `S = \\frac{\\pi d^3}{32} = ${f2(res.Sx)}\\text{ mm}^3, \\quad r = \\frac{d}{4} = \\frac{${f2(d)}}{4} = ${f2(res.rx)}\\text{ mm}` },
              { text: `All four read straight off d = ${f2(d)} mm. A circle is its own principal frame — Ix = Iy and the radii of gyration are equal.` },
            ]
          : [
              { tex: `A = \\frac{\\pi (D^2 - d^2)}{4} = \\frac{\\pi\\times(${f2(Dout)}^2 - ${f2(dt)}^2)}{4} = ${f2(res.A)}\\text{ mm}^2` },
              { tex: `I = \\frac{\\pi (D^4 - d^4)}{64} = \\frac{\\pi\\times(${f2(Dout)}^4 - ${f2(dt)}^4)}{64} = ${f2(res.Ix)}\\text{ mm}^4` },
              { tex: `r = \\sqrt{I/A} = \\frac{\\sqrt{D^2 + d^2}}{4} = \\frac{\\sqrt{${f2(Dout)}^2 + ${f2(dt)}^2}}{4} = ${f2(res.rx)}\\text{ mm}` },
              { text: `Hollow sections push area away from the axis: at D = ${f2(Dout)} with d = ${f2(dt)}, the tube keeps ${f2(100 * (1 - (dt / Dout) ** 2))}% of the solid area but ${f2(100 * (1 - (dt / Dout) ** 4))}% of its stiffness.` },
            ],
    },
  ]) : []

  const presetName = PRESETS.find(([k]) => k === preset)?.[1] ?? preset
  const report = res ? {
    docCode: 'SP-01',
    ok: true,
    governing: `${presetName}: A = ${f2(res.A)} mm², Ix = ${f3(res.Ix / 1e6)}×10⁶ mm⁴, ȳ = ${f2(res.cy)} mm`,
    stats: [
      { label: 'Area A', value: f2(res.A), unit: 'mm²' },
      { label: 'Ix', value: f3(res.Ix / 1e6), unit: '×10⁶ mm⁴' },
      { label: 'Sx', value: f2(res.Sx / 1e3), unit: '×10³ mm³' },
    ],
    data: [
      ['Section', presetName],
      ['Centroid x̄ / ȳ', `${f2(res.cx)} / ${f2(res.cy)} mm`],
      ['Iy', `${f3(res.Iy / 1e6)} ×10⁶ mm⁴`],
      ['Sy', `${f2(res.Sy / 1e3)} ×10³ mm³`],
      ['rx / ry', `${f2(res.rx)} / ${f2(res.ry)} mm`],
    ] as [string, string][],
    steps,
  } : undefined

  return (
    <WorkspacePage title="Section Properties" badges={['Analysis', 'A · I · S · r']}
      intro="The toolkit behind every bending check: centroid, moments of inertia by the parallel-axis theorem, section moduli and radii of gyration — for the single shapes or any built-up stack of rectangles, with the whole table shown."
      report={report}
      inputs={<>
            <InputGroup title="Section">
              <div className="col-span-2"><Pick label="Preset" value={preset} onChange={(v) => setPreset(v as Preset)} options={PRESETS} /></div>
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
            </InputGroup>

            {preset === 'custom' && (
              <InputGroup title="Rectangle stack" hint="x, y from the bottom-left of the section">
                {rows.map((r, i) => (
                  <div key={i} className="col-span-2 grid grid-cols-[1fr_1fr_1fr_1fr_1.4rem] items-end gap-1.5">
                    <Num label="x" value={parseFloat(r.x) || 0} onChange={(v) => setRow(i, { x: String(v) })} step="1" />
                    <Num label="y" value={parseFloat(r.y) || 0} onChange={(v) => setRow(i, { y: String(v) })} step="1" />
                    <Num label="w" value={parseFloat(r.w) || 0} onChange={(v) => setRow(i, { w: String(v) })} step="1" />
                    <Num label="h" value={parseFloat(r.h) || 0} onChange={(v) => setRow(i, { h: String(v) })} step="1" />
                    <button type="button" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} disabled={rows.length <= 1}
                      className="mb-1.5 text-muted hover:text-fail disabled:opacity-30">✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => setRows((rs) => [...rs, { x: '0', y: '0', w: '50', h: '50' }])}
                  className="col-span-2 justify-self-start rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">+ Add rectangle</button>
              </InputGroup>
            )}
                </>}
      checks={res ? <>
        <CheckCard title="Area" basis="A" status="info" value={f2(res.A)} unit="mm²"
          pairs={[{ label: 'x̄ from left', value: `${f2(res.cx)} mm` }, { label: 'ȳ from bottom', value: `${f2(res.cy)} mm` }]} />
        <CheckCard title="Moments of inertia" basis="about the centroidal axes" status="info" value={f3(res.Ix / 1e6)} unit="×10⁶ mm⁴ Ix"
          pairs={[{ label: 'Iy', value: `${f3(res.Iy / 1e6)} ×10⁶ mm⁴` }]} />
        <CheckCard title="Section moduli" basis="extreme fibre governs" status="info" value={f2(res.Sx / 1e3)} unit="×10³ mm³ Sx"
          pairs={[{ label: 'Sy', value: `${f2(res.Sy / 1e3)} ×10³ mm³` }]} />
        <CheckCard title="Radii of gyration" basis="√(I/A)" status="info" value={`${f2(res.rx)} / ${f2(res.ry)}`} unit="mm rx / ry" />
      </> : <p className="text-sm text-fail">Dimensions must be positive and consistent: the tube needs d &lt; D, the I and T need depth beyond twice the flange thickness, the angle needs leg &gt; thickness, and the custom stack needs at least one rectangle with positive size.</p>}
      summary={[{ label: 'Section', value: presetName }]}
      drawing={res ? { title: 'Section, to scale', node: <div data-pdf-drawing>
        <SectionView preset={preset} res={res} inputs={{ b, h, d, D: Dout, dt, bf: b, tf, tw, leg, thk, rows: rows.map((r) => ({
          x: parseFloat(r.x) || 0, y: parseFloat(r.y) || 0, w: parseFloat(r.w) || 0, h: parseFloat(r.h) || 0,
        })) }} />
      </div> } : undefined}
      results={res ? [
        { check: 'Area', basis: 'A', demand: `${f2(res.A)} mm²`, limit: `${f2(res.A / 100)} cm²`, status: 'info' },
        { check: 'Centroid', basis: 'x̄ from left · ȳ from bottom', demand: `${f2(res.cx)} · ${f2(res.cy)} mm`, status: 'info' },
        { check: 'Ix', basis: `c top ${f2(res.cTop)} · bottom ${f2(res.cBot)} mm`, demand: `${f3(res.Ix / 1e6)} ×10⁶ mm⁴`, status: 'info' },
        { check: 'Iy', basis: `c left ${f2(res.cLeft)} · right ${f2(res.cRight)} mm`, demand: `${f3(res.Iy / 1e6)} ×10⁶ mm⁴`, status: 'info' },
        { check: 'Sx / Sy', basis: 'I ÷ c,max', demand: `${f2(res.Sx / 1e3)} / ${f2(res.Sy / 1e3)} ×10³ mm³`, status: 'info' },
        { check: 'rx / ry', basis: '√(I/A)', demand: `${f2(res.rx)} / ${f2(res.ry)} mm`, status: 'info' },
      ] : []}
      steps={steps}
      references={[
        { topic: 'Composite sections', basis: 'area-weighted centroid; parallel-axis theorem', source: 'Beer & Johnston, Mechanics of Materials' },
      ]}
    />
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
    // the tube's outer diameter is D — drawing it from the solid circle's d
    // left the outline frozen whatever D was entered
    const Dd = preset === 'tube' ? inputs.D : inputs.d
    const r = sx(Dd / 2) - sx(0)
    const cx = sx(Dd / 2), cy = sy(Dd / 2)
    p.push(`M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy}`)
    if (preset === 'tube') {
      const r2 = (inputs.dt / Dd) * r
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
          C
        </text>

        {/* overall depth and width, and ȳ from the base — real dimensions on
            extension lines (the depth used to be a bare line beside the
            section, with no ticks and its label at one end) */}
        <DimSide yA={sy(yHi)} yB={sy(0)} featX={sx(xHi)} dX={sx(xHi) + 26} label={`${f2(yHi)} mm`} side="right" />
        <DimSide yA={sy(res.cy)} yB={sy(0)} featX={sx(0)} dX={sx(0) - 26} label={`ȳ = ${f2(res.cy)}`} side="left" />
        <line x1={sx(res.cx) - 28} y1={sy(res.cy)} x2={sx(0) - 31} y2={sy(res.cy)} stroke="#1f77b4" strokeWidth={0.6} strokeDasharray="2 2" />
        <DimBelow xA={sx(0)} xB={sx(xHi)} featY={sy(0)} dY={sy(0) + 20} label={`${f2(xHi)} mm`} />
        <text x={W / 2} y={H - 24} fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)" textAnchor="middle">
          A = {f2(res.A)} mm² · Ix = {f3(res.Ix / 1e6)}×10⁶ mm⁴
        </text>
        <text x={W / 2} y={H - 8} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)" textAnchor="middle">
          dashed = the rectangle rows the parallel-axis table solves
        </text>
      </svg>
    </DrawingFrame>
  )
}
