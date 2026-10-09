import { useState } from 'react'
import {
  pileCapacity, type PileInput, type PileResult, type SoilLayer, type SoilKind, type PileKind,
} from '../engine/pileCapacity'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { PileProfile } from '../components/pileSketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Pile Capacity — a single driven pile through layered soil: α-method shaft
// resistance in clay, K·σ′·tanδ in sand, 9·cu or capped Meyerhof end bearing.

interface LayerRow {
  thickness: string
  kind: SoilKind
  cu: string
  phi: string
  gamma: string
  gammaSat: string
}

const SAMPLE: LayerRow[] = [
  { thickness: '4', kind: 'clay', cu: '30', phi: '', gamma: '17', gammaSat: '' },
  { thickness: '6', kind: 'sand', cu: '', phi: '32', gamma: '18', gammaSat: '19' },
]

const num = (s: string): number => {
  const v = parseFloat(s)
  return Number.isFinite(v) ? v : NaN
}

export default function PileCapacity() {
  const [kind, setKind] = useState<PileKind>('circular')
  const [d, setD] = useState(0.4)
  const [b, setB] = useState(0.3)
  const [t, setT] = useState(0.02)
  const [layers, setLayers] = useState<LayerRow[]>(SAMPLE)
  const [waterTable, setWaterTable] = useState(3)
  const [FS, setFS] = useState(3)

  const setLayer = (i: number, patch: Partial<LayerRow>) =>
    setLayers((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const built: SoilLayer[] | null = (() => {
    const out: SoilLayer[] = []
    for (const l of layers) {
      const th = num(l.thickness)
      const g = num(l.gamma)
      if (!(th > 0) || !(g > 0)) return null
      if (l.kind === 'clay') {
        const cu = num(l.cu)
        if (!(cu > 0)) return null
        out.push({ thickness: th, kind: 'clay', cu, gamma: g, gammaSat: Number.isFinite(num(l.gammaSat)) ? num(l.gammaSat) : undefined })
      } else {
        const phi = num(l.phi)
        if (!(phi > 0)) return null
        out.push({ thickness: th, kind: 'sand', phi, gamma: g, gammaSat: Number.isFinite(num(l.gammaSat)) ? num(l.gammaSat) : undefined })
      }
    }
    return out.length ? out : null
  })()

  const wt = Number.isFinite(waterTable) ? waterTable : Infinity

  const res: PileResult | null = (() => {
    try {
      if (!built) return null
      const input: PileInput = {
        layers: built,
        section: kind === 'circular' ? { kind, d } : kind === 'square' ? { kind, b } : { kind, d, t },
        waterTable: wt,
        FS,
      }
      return pileCapacity(input)
    } catch {
      return null
    }
  })()


  const steps: SolutionStep[] = res ? [
    ...res.segments.map((sg) => ({
      title: `Shaft friction — ${sg.kind === 'clay' ? 'clay' : 'sand'} ${f3(sg.from)}–${f3(sg.to)} m`,
      lines: [
        { text: sg.detail },
        { tex: `Q_{s} = p\\cdot f\\cdot \\Delta L = ${f3(res.perimeter)}\\times${f3(sg.f)}\\times${f3(sg.to - sg.from)} = ${f3(sg.Q)}\\text{ kN}` },
      ],
    })),
    {
      title: 'End bearing at the tip',
      lines: res.capped
        ? [
            { tex: `q' = ${f3(res.sigmaTip)}\\text{ kPa}, \\quad q_l = 0.5\\,p_a N_q\\tan\\varphi = ${f3(res.qp)}\\text{ kPa (cap governs)}` },
            { tex: `Q_p = q_p A_p = ${f3(res.qp)}\\times${f3(res.area)} = ${f3(res.Qp)}\\text{ kN}` },
            { text: 'The Meyerhof critical-depth cap governs — q′·Nq cannot grow without bound.' },
          ]
        : [
            res.segments[res.segments.length - 1]?.kind === 'clay'
              ? { tex: `q_p = 9\\,c_u = 9\\times${f3(res.qp / 9)} = ${f3(res.qp)}\\text{ kPa} \\;\\Rightarrow\\; Q_p = q_p A_p = ${f3(res.qp)}\\times${f3(res.area)} = ${f3(res.Qp)}\\text{ kN}` }
              : { tex: `q_p = q' N_q = ${f3(res.sigmaTip)}\\times${f3(res.sigmaTip > 1e-9 ? res.qp / res.sigmaTip : 0)} = ${f3(res.qp)}\\text{ kPa} \\;\\Rightarrow\\; Q_p = q_p A_p = ${f3(res.qp)}\\times${f3(res.area)} = ${f3(res.Qp)}\\text{ kN}` },
          ],
    },
    {
      title: 'Ultimate and allowable capacity',
      lines: [
        { tex: `Q_{ult} = Q_p + Q_s = ${f3(res.Qp)} + ${f3(res.Qs)} = ${f3(res.Qult)}\\text{ kN}` },
        { tex: `Q_{all} = \\frac{Q_{ult}}{FS} = \\frac{${f3(res.Qult)}}{${f2(FS)}} = ${f3(res.Qall)}\\text{ kN}` },
        { text: `Effective overburden at the tip: σ′ = ${f3(res.sigmaTip)} kPa${Number.isFinite(wt) ? ` (water table at ${f2(wt)} m — submerged weights below)` : ''}.` },
      ],
    },
    ...res.warnings.map((w) => ({ title: 'Note', lines: [{ text: w }] })),
  ] : [{ title: 'Check the inputs', lines: [{ text: 'Every layer needs a positive thickness and unit weight, plus cu for clay or φ for sand. The pipe wall must be thinner than half the diameter; FS ≥ 1.5.' }] }]

  const btn = 'rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint'
  return (
    <WorkspacePage title="Pile Capacity" badges={['Geotechnical', 'α method · Meyerhof']}
      intro="Static capacity of a single driven pile: α·cu adhesion in clay, K·σ′·tanδ in sand, with 9·cu end bearing in clay and the Meyerhof q′·Nq — capped at 0.5·pa·Nq·tanφ — in sand. Effective stresses respect the water table."
      inputs={<>
        <InputGroup title="Pile section">
          <div className="col-span-2">
            <Pick label="Section" value={kind} onChange={(v) => setKind(v as PileKind)}
              options={[['circular', 'Circular — concrete'], ['square', 'Square — concrete'], ['pipe', 'Steel pipe (plugged)']]} />
          </div>
          {kind !== 'square' && <Num label="Diameter D" unit="m" value={d} onChange={setD} min={0.15} max={3} step="0.05" />}
          {kind === 'square' && <Num label="Width b" unit="m" value={b} onChange={setB} min={0.15} max={3} step="0.05" />}
          {kind === 'pipe' && <Num label="Wall t" unit="m" value={t} onChange={setT} min={0.005} max={0.1} step="0.005" />}
        </InputGroup>
        {layers.map((l, i) => (
          <InputGroup key={i} title={`Layer ${i + 1}`} hint={i === 0 ? 'Top layer first; the tip bears in the last one.' : undefined}>
            <Pick label="Soil" value={l.kind} onChange={(v) => setLayer(i, { kind: v as SoilKind })} options={[['clay', 'Clay (cu)'], ['sand', 'Sand (φ)']]} />
            <Num label="Thickness" unit="m" value={num(l.thickness)} onChange={(v) => setLayer(i, { thickness: String(v) })} min={0.2} max={60} step="0.5" />
            {l.kind === 'clay'
              ? <Num label="cu" unit="kPa" value={num(l.cu)} onChange={(v) => setLayer(i, { cu: String(v) })} min={5} max={400} step="5" />
              : <Num label="φ" unit="°" value={num(l.phi)} onChange={(v) => setLayer(i, { phi: String(v) })} min={20} max={45} step="1" />}
            <Num label="γ" unit="kN/m³" value={num(l.gamma)} onChange={(v) => setLayer(i, { gamma: String(v) })} min={12} max={24} step="0.5" />
            <Num label="γ sat" unit="kN/m³" value={Number.isFinite(num(l.gammaSat)) ? num(l.gammaSat) : num(l.gamma)} onChange={(v) => setLayer(i, { gammaSat: String(v) })} min={12} max={26} step="0.5" />
            {layers.length > 1 && <div className="flex items-end"><button type="button" onClick={() => setLayers((ls) => ls.filter((_, j) => j !== i))} className={btn}>Remove</button></div>}
          </InputGroup>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => setLayers((ls) => [...ls, { thickness: '3', kind: 'clay', cu: '40', phi: '', gamma: '18', gammaSat: '' }])}>+ Add layer</button>
          <button type="button" className={btn} onClick={() => { setKind('circular'); setD(0.4); setLayers(SAMPLE); setWaterTable(3); setFS(3) }}>Sample: 0.4 m pile, clay over sand</button>
        </div>
        <InputGroup title="Water and safety">
          <Num label="Water table" unit="m" value={waterTable} onChange={setWaterTable} min={0} max={80} step="0.5" />
          <Num label="Factor of safety" value={FS} onChange={setFS} min={1.5} max={6} step="0.25" />
        </InputGroup>
      </>}
      checks={res ? <>
        <CheckCard title="Allowable capacity" basis={`FS ${f2(FS)}`} status="info" value={f2(res.Qall)} unit="kN"
          formula="Qall = (Qp + Qs) / FS"
          pairs={[{ label: 'Ultimate', value: `${f2(res.Qult)} kN` }, { label: 'Embedment', value: `${f2(res.embedDepth)} m` }]} />
        <CheckCard title="Shaft and tip" basis="share of the ultimate" status="info" value={`${f2(res.Qs)} + ${f2(res.Qp)}`} unit="kN"
          pairs={[{ label: 'Shaft share', value: `${f2((res.Qs / Math.max(res.Qult, 1e-9)) * 100)} %` }, { label: 'Tip qp', value: `${f2(res.qp)} kPa${res.capped ? ' (capped)' : ''}` }]} />
      </> : (
        <CheckCard title="Check the inputs" basis="pile capacity" status="warn" pillLabel="CHECK" value="—" formula="Positive thicknesses and unit weights; cu for clay, φ for sand." />
      )}
      summary={[
        { label: 'Section', value: kind === 'square' ? `square ${f2(b)} m` : kind === 'pipe' ? `pipe ⌀${f2(d)} m, t ${f3(t)} m` : `circular ⌀${f2(d)} m` },
        { label: 'Layers', value: `${layers.length}` },
        { label: 'Water table', value: `${f2(waterTable)} m` },
        { label: 'Factor of safety', value: f2(FS) },
      ]}
      drawing={res && built ? { title: 'Profile and capacity breakdown', node: <div data-pdf-drawing><PileProfile
        layers={built.map((l, i) => ({ kind: l.kind, label: l.kind === 'clay' ? `clay, cu ${f2(l.cu ?? 0)} kPa` : `sand, φ ${f2(l.phi ?? 0)}°`, from: res.segments[i]?.from ?? 0, to: res.segments[i]?.to ?? 0 }))}
        embed={res.embedDepth} waterTable={wt} Qp={res.Qp} Qult={res.Qult} Qall={res.Qall} FS={res.FS} segments={res.segments} /></div> } : undefined}
      resultsCaption={res && res.warnings.length ? res.warnings.join(' ') : undefined}
      results={res ? [
        ...res.segments.map((sg) => ({ check: `Shaft ${sg.kind} ${f2(sg.from)}–${f2(sg.to)} m`, basis: `f = ${f2(sg.f)} kPa`, demand: `${f2(sg.Q)} kN`, status: 'info' as const })),
        { check: 'End bearing', basis: `qp ${f2(res.qp)} kPa × Ap ${f3(res.area)} m²`, demand: `${f2(res.Qp)} kN`, status: 'info' as const },
        { check: 'Ultimate', basis: 'Qp + Qs', demand: `${f2(res.Qult)} kN`, status: 'info' as const },
        { check: 'Allowable', basis: `÷ FS ${f2(FS)}`, demand: `${f2(res.Qall)} kN`, status: 'info' as const },
      ] : [{ check: 'Capacity', basis: 'invalid input', demand: '—', status: 'warn' as const }]}
      steps={steps}
      references={[
        { topic: 'Shaft friction in clay', basis: 'α method, f = α cu', source: 'Tomlinson; API RP 2A' },
        { topic: 'Shaft friction in sand', basis: 'f = K σ′ tanδ', source: 'Das, Principles of Foundation Engineering, Ch. 12' },
        { topic: 'End bearing', basis: '9 cu (clay); q′ Nq capped at 0.5 pa Nq tanφ (sand)', source: 'Meyerhof (1976)' },
      ]}
    />
  )
}
