import { useState } from 'react'
import 'katex/dist/katex.min.css'
import {
  designMix, type MixInput, type MixResult, type MaxAgg, type SlumpBand, type Exposure,
} from '../engine/mixDesign'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { DrawingFrame } from '../components/DrawingFrame'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, f2, f3 } from '../lib/influenceStyle'

// Concrete Mix Design — the ACI 211.1 absolute-volume procedure:
// w/c from strength, water from the slump table, cement from w/c, coarse
// aggregate from the DRUW table, fine aggregate fills what remains, then
// moisture corrections turn oven-dry weights into wet stockpile batches
// (engine/mixDesign.ts).

const SAMPLE: MixInput = {
  fcrMPa: 28,
  slumpBand: '75-100',
  maxAgg: 25,
  exposure: 'mild',
  FM: 2.8,
  druwc: 1600,
  sgCA: 2.68,
  sgFA: 2.65,
  mcCA: 1.5,
  absCA: 0.8,
  mcFA: 4.5,
  absFA: 1.0,
  volume: 1,
}

export default function MixDesign() {
  const [fcr, setFcr] = useState(28)
  const [slumpBand, setSlumpBand] = useState<SlumpBand>('75-100')
  const [maxAgg, setMaxAgg] = useState(25)
  const [exposure, setExposure] = useState<Exposure>('mild')
  const [FM, setFM] = useState(2.8)
  const [druwc, setDruwc] = useState(1600)
  const [sgCA, setSgCA] = useState(2.68)
  const [sgFA, setSgFA] = useState(2.65)
  const [mcCA, setMcCA] = useState(1.5)
  const [absCA, setAbsCA] = useState(0.8)
  const [mcFA, setMcFA] = useState(4.5)
  const [absFA, setAbsFA] = useState(1.0)
  const [volume, setVolume] = useState(1)

  const loadSample = () => {
    setFcr(SAMPLE.fcrMPa); setSlumpBand(SAMPLE.slumpBand); setMaxAgg(SAMPLE.maxAgg)
    setExposure(SAMPLE.exposure); setFM(SAMPLE.FM); setDruwc(SAMPLE.druwc)
    setSgCA(SAMPLE.sgCA); setSgFA(SAMPLE.sgFA)
    setMcCA(SAMPLE.mcCA); setAbsCA(SAMPLE.absCA); setMcFA(SAMPLE.mcFA); setAbsFA(SAMPLE.absFA)
    setVolume(SAMPLE.volume)
  }

  const input: MixInput = {
    fcrMPa: fcr, slumpBand, maxAgg: maxAgg as MaxAgg, exposure, FM, druwc,
    sgCA, sgFA,
    mcCA: mcCA / 100, absCA: absCA / 100, mcFA: mcFA / 100, absFA: absFA / 100,
    volume,
  }

  const res: MixResult | null = (() => {
    try { return designMix(input) } catch { return null }
  })()

  const steps: SolutionStep[] = res ? [
    {
      title: 'Water–cement ratio from the target strength',
      lines: [
        { tex: `f'_{cr} = ${f2(fcr)}\\text{ MPa} \\;\\xrightarrow{\\;\\text{ACI Table 6.3.4(a)}\\;}\\; w/c = ${f3(res.wc)}` },
        { text: res.airEntrained
          ? 'Air-entrained column: the same strength is reached at a lower w/c because the entrained air itself densifies and lubricates the paste.'
          : 'Non-air-entrained column. Interpolation between the printed psi rows is linear — the table is the code value, interpolation the classroom practice.' },
      ],
    },
    {
      title: 'Mixing water and air from the slump table',
      lines: [
        { tex: `\\text{water} = ${f2(res.water)}\\text{ kg/m}^3, \\qquad \\text{air} = ${f2(res.airPct)}\\%` },
        { text: `Table 6.3.3 at ${f2(maxAgg)} mm maximum aggregate, ${slumpBand} mm slump${res.airEntrained ? ', air-entrained' : ''}. Coarser aggregate drinks less water — that is why bigger rock is cheaper concrete.` },
      ],
    },
    {
      title: 'Cement content',
      lines: [
        { tex: `c = \\frac{w}{w/c} = \\frac{${f2(res.water)}}{${f3(res.wc)}} = ${f2(res.cement)}\\text{ kg/m}^3` },
        { text: `${f2(res.cement / 40)} forty-kilo bags per cubic metre — the count the plant actually orders.` },
      ],
    },
    {
      title: 'Coarse aggregate from the bulk-volume table',
      lines: [
        { tex: `V_{CA} = ${f3(res.caBulk)}\\;\\text{(Table 6.3.6, FM = ${f2(FM)})} \\;\\Rightarrow\\; m_{CA} = ${f3(res.caBulk)}\\times ${f2(druwc)} = ${f2(res.caDry)}\\text{ kg/m}^3` },
        { text: 'Dry-rodded unit weight times the bulk volume fraction. A coarser sand (higher FM) interlocks less and leaves more room for rock — that is why the FM column runs the fraction down.' },
      ],
    },
    {
      title: 'Fine aggregate by absolute volume',
      lines: [
        { tex: `V_{FA} = 1 - \\frac{c}{3.15\\times 10^3} - \\frac{w}{10^3} - \\frac{\\text{air}}{100} - \\frac{m_{CA}}{SG_{CA}\\times 10^3}` },
        { tex: `V_{FA} = 1 - ${f3(res.vCement)} - ${f3(res.vWater)} - ${f3(res.vAir)} - ${f3(res.vCA)} = ${f3(res.vFA)}\\text{ m}^3` },
        { tex: `m_{FA} = ${f3(res.vFA)}\\times ${f2(sgFA)}\\times 10^3 = ${f2(res.faDry)}\\text{ kg/m}^3` },
        { text: `Every solid checks in at its own specific gravity, air takes its percentage, and the sand takes whatever is left — that is the whole method. Fresh density resolves to ${f2(res.freshDensity)} kg/m³ against the ACI first estimate of ${res.densityEstimate}.` },
      ],
    },
    {
      title: 'Moisture corrections to stockpile weights',
      lines: [
        { tex: `m^{batch}_{CA} = ${f2(res.caDry)}\\times(1+${f3(mcCA / 100)}) = ${f2(res.batchCA)}\\text{ kg}` },
        { tex: `m^{batch}_{FA} = ${f2(res.faDry)}\\times(1+${f3(mcFA / 100)}) = ${f2(res.batchFA)}\\text{ kg}` },
        { tex: `w^{batch} = ${f2(res.water)} - ${f2(res.freeWater)} = ${f2(res.batchWater)}\\text{ kg}` },
        { text: 'Wet sand carries free water into the mix; wet rock carries some back. The plant weighs the wet stockpiles and subtracts the water they bring — the design water must still land in the drum.' },
      ],
    },
  ] : []

  const report = res ? {
    docCode: 'C-MX',
    ok: true,
    governing: `w/c ${f3(res.wc)} · ${f2(res.cement)} kg cement per m³ · ${f2(res.airPct)}% air`,
    stats: [
      { label: 'Cement', value: f2(res.cement), unit: 'kg/m³' },
      { label: 'Water to add', value: f2(res.batchWater), unit: 'kg/m³' },
      { label: 'Bags (40 kg)', value: String(res.totals.bags40), unit: `for ${f2(volume)} m³` },
    ],
    data: [
      ["Target mean strength f'cr", `${f2(fcr)} MPa`],
      ['Slump band', `${slumpBand} mm`],
      ['Max aggregate', `${f2(maxAgg)} mm`],
      ['Exposure', exposure],
      ['Fineness modulus', f2(FM)],
      ['DRUW coarse', `${f2(druwc)} kg/m³`],
      ['SG coarse / fine', `${f2(sgCA)} / ${f2(sgFA)}`],
      ['Moisture CA / FA', `${f2(mcCA)} / ${f2(mcFA)} %`],
      ['Absorption CA / FA', `${f2(absCA)} / ${f2(absFA)} %`],
      ['Batch volume', `${f2(volume)} m³`],
    ] as [string, string][],
    steps,
  } : undefined

  return (
    <WorkspacePage title="Concrete Mix Design" badges={['Materials', 'ACI 211.1']}
      intro="The absolute-volume batch design: strength gives w/c, the slump table gives water and air, rock comes from the dry-rodded table and sand fills the remainder — then moisture corrections, so the wet stockpile weights still deliver the design water."
      report={report}
      actions={<button type="button" onClick={loadSample}
        className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
        Load the 28 MPa sample
      </button>}
      inputs={<>
        <InputGroup title="Design targets">
          <Num label="Target mean f′cr" unit="MPa" value={fcr} onChange={setFcr} min={14} max={45} step="1" />
          <Pick label="Slump band" value={slumpBand} onChange={(v) => setSlumpBand(v as SlumpBand)}
            options={[['25-50', '25–50 mm vibrated'], ['75-100', '75–100 mm normal'], ['125-150', '125–150 mm high flow']]} />
          <Pick label="Max aggregate" value={String(maxAgg)} onChange={(v) => setMaxAgg(Number(v))}
            options={[['9.5', '9.5 mm'], ['12.5', '12.5 mm'], ['19', '19 mm'], ['25', '25 mm'], ['37.5', '37.5 mm'], ['50', '50 mm']]} />
          <Pick label="Exposure" value={exposure} onChange={(v) => setExposure(v as Exposure)}
            options={[['mild', 'Mild — entrapped air'], ['moderate', 'Moderate — air-entrained'], ['severe', 'Severe — more air']]} />
        </InputGroup>
        <InputGroup title="Aggregates">
          <Num label="Fineness modulus" value={FM} onChange={setFM} min={2.3} max={3.1} step="0.05" />
          <Num label="DRUW coarse" unit="kg/m³" value={druwc} onChange={setDruwc} min={1300} max={1750} step="10" />
          <Num label="SG coarse (SSD)" value={sgCA} onChange={setSgCA} min={2.1} max={3.1} step="0.01" />
          <Num label="SG fine (SSD)" value={sgFA} onChange={setSgFA} min={2.1} max={3.1} step="0.01" />
        </InputGroup>
        <InputGroup title="Moisture and batch" hint="stockpile moisture and absorption, percent">
          <Num label="CA moisture" unit="%" value={mcCA} onChange={setMcCA} min={0} max={10} step="0.1" />
          <Num label="CA absorption" unit="%" value={absCA} onChange={setAbsCA} min={0} max={10} step="0.1" />
          <Num label="FA moisture" unit="%" value={mcFA} onChange={setMcFA} min={0} max={12} step="0.1" />
          <Num label="FA absorption" unit="%" value={absFA} onChange={setAbsFA} min={0} max={12} step="0.1" />
          <Num label="Batch volume" unit="m³" value={volume} onChange={setVolume} min={0.1} max={100} step="0.5" />
        </InputGroup>
      </>}
      checks={res ? <>
        <CheckCard title="Water–cement ratio" basis="Table 6.3.4(a)" status="info" value={f3(res.wc)}
          pairs={[{ label: 'Air', value: `${f2(res.airPct)}% ${res.airEntrained ? 'entrained' : 'entrapped'}` }, { label: 'Water', value: `${f2(res.water)} kg/m³` }]} />
        <CheckCard title="Cement" basis="c = w ÷ (w/c)" status="info" value={f2(res.cement)} unit="kg/m³"
          pairs={[{ label: `For ${f2(volume)} m³`, value: `${f2(res.totals.cement)} kg` }, { label: 'Bags', value: `${res.totals.bags40} × 40 kg` }]} />
        <CheckCard title="Fresh density" basis="sum of the batch" status="info" value={f2(res.freshDensity)} unit="kg/m³"
          pairs={[{ label: 'ACI estimate', value: `${res.densityEstimate} kg/m³` }]} />
      </> : <p className="text-sm text-fail">f′cr must sit in 14–45 MPa, FM in 2.3–3.1, DRUW in 1200–1800 kg/m³ and the specific gravities in 2.0–3.2. The 150 mm slump band is not tabulated for every aggregate size.</p>}
      summary={[
        { label: 'Target', value: `f′cr ${f2(fcr)} MPa, slump ${slumpBand} mm, ${exposure}` },
        { label: 'Aggregates', value: `${f2(maxAgg)} mm max, FM ${f2(FM)}, DRUW ${f2(druwc)} kg/m³` },
        { label: 'Batch', value: `${f2(volume)} m³` },
      ]}
      drawing={res ? { title: 'Absolute volume budget', node: <div data-pdf-drawing><VolumeBars res={res} /></div> } : undefined}
      resultsCaption={res && res.warnings.length > 0 ? res.warnings.join(' ') : undefined}
      results={res ? [
        { check: 'Cement', basis: `w/c ${f3(res.wc)}`, demand: `${f2(res.cement)} kg/m³`, limit: `${f2(res.totals.cement)} kg total`, status: 'info' as const },
        { check: 'Water to add', basis: `design ${f2(res.water)} − free ${f2(res.freeWater)}`, demand: `${f2(res.batchWater)} kg/m³`, limit: `${f2(res.totals.water)} L total`, status: 'info' as const },
        { check: 'Coarse aggregate (wet)', basis: `dry ${f2(res.caDry)} at ${f2(mcCA)}%`, demand: `${f2(res.batchCA)} kg/m³`, limit: `${f2(res.totals.ca)} kg total`, status: 'info' as const },
        { check: 'Fine aggregate (wet)', basis: `dry ${f2(res.faDry)} at ${f2(mcFA)}%`, demand: `${f2(res.batchFA)} kg/m³`, limit: `${f2(res.totals.fa)} kg total`, status: 'info' as const },
        { check: 'Air', basis: res.airEntrained ? 'entrained (exposure)' : 'entrapped only', demand: `${f2(res.airPct)} %`, status: 'info' as const },
      ] : []}
      steps={steps}
      references={[
        { topic: 'Proportioning', basis: 'absolute-volume method, Tables 6.3.3–6.3.6', source: 'ACI 211.1-91 (Reapproved 2009)' },
        { topic: 'Moisture correction', basis: 'stockpile moisture less absorption', source: 'ACI 211.1 §6.3.9' },
      ]}
    />
  )
}

// ── the 1 m³ absolute-volume stacked bar ─────────────────────────────────

function VolumeBars({ res }: { res: MixResult }) {
  const W = 640
  const H = 268
  const x0 = 30
  const x1 = W - 60
  const y0 = 42
  const h = 64

  const segs = [
    { label: 'Coarse agg.', v: res.vCA, fill: 'rgba(15,76,146,0.85)' },
    { label: 'Fine agg.', v: res.vFA, fill: 'rgba(15,76,146,0.55)' },
    { label: 'Cement', v: res.vCement, fill: 'rgba(15,76,146,0.3)' },
    { label: 'Water', v: res.vWater, fill: 'rgba(15,76,146,0.16)' },
    // an SVG fill cannot take a CSS gradient — the hatch is a <pattern>
    { label: 'Air', v: res.vAir, fill: 'url(#mix-air)' },
  ]

  let cursor = x0
  const rects = segs.map((s) => {
    const w = s.v * (x1 - x0)
    const r = { ...s, x: cursor, w }
    cursor += w
    return r
  })

  const rows = segs.map((s, i) => ({ ...s, y: y0 + 92 + i * 22, i }))

  return (
    <DrawingFrame label="Absolute volume budget of one cubic metre">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Absolute volume budget">
        <defs>
          <pattern id="mix-air" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(15,76,146,0.45)" strokeWidth="2" />
          </pattern>
        </defs>
        {/* the bar */}
        <rect x={x0 - 1} y={y0 - 1} width={x1 - x0 + 2} height={h + 2} fill="none" stroke={INK} strokeWidth="1.4" />
        {rects.map((r, i) => (
          <rect key={i} x={r.x} y={y0} width={Math.max(r.w - 0.5, 0)} height={h} fill={r.fill} stroke="none" />
        ))}
        {rects.map((r, i) => (r.w > 34 ? (
          <text key={i} x={r.x + r.w / 2} y={y0 + h / 2 + 4} textAnchor="middle" fontSize="10.5" fill={i < 2 ? '#ffffff' : INK} fontFamily="var(--font-mono, monospace)">
            {f2(r.v * 100)}%
          </text>
        ) : null))}
        <text x={x0} y={y0 - 10} fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">
          1.000 m³ — the absolute volumes sum to unity by construction
        </text>

        {/* legend with masses */}
        {rows.map((r, i) => (
          <g key={i}>
            <rect x={x0} y={r.y - 8} width={12} height={12} fill={r.fill} stroke={INK} strokeWidth="0.7" />
            <text x={x0 + 20} y={r.y + 2} fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">{r.label}</text>
            <text x={W - 60} y={r.y + 2} textAnchor="end" fontSize="10.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">
              {i === 0 ? `${f2(res.caDry)} kg` : i === 1 ? `${f2(res.faDry)} kg` : i === 2 ? `${f2(res.cement)} kg` : i === 3 ? `${f2(res.water)} kg` : `${f2(res.airPct)} %`}
            </text>
          </g>
        ))}
        <text x={x0} y={H - 6} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
          fresh density {f2(res.freshDensity)} kg/m³ · ACI first estimate {res.densityEstimate} kg/m³
        </text>
      </svg>
    </DrawingFrame>
  )
}
