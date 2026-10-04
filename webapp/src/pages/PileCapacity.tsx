import { useState } from 'react'
import 'katex/dist/katex.min.css'
import {
  pileCapacity, type PileInput, type PileResult, type SoilLayer, type SoilKind, type PileKind,
} from '../engine/pileCapacity'
import { Card, Num, Pick, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, BRAND, f2, f3 } from '../lib/influenceStyle'

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

  const totalDepth = built ? built.reduce((s, l) => s + l.thickness, 0) : 0

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
  ] : []

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="Pile Capacity Report" badges={['α method · Meyerhof', `FS = ${f2(FS)}`]} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Static capacity of a single driven pile: α·cu adhesion in clay, K·σ′·tanδ in sand,
        with 9·cu end bearing in clay and the Meyerhof q′·Nq — capped at 0.5·pa·Nq·tanφ — in
        sand. Effective stresses respect the water table.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Pile section">
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => { setKind('circular'); setD(0.4); setLayers(SAMPLE); setWaterTable(3); setFS(3) }}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — 0.4 m pile, clay over sand
              </button>
            </div>
            <Pick label="Section" value={kind} onChange={(v) => setKind(v as PileKind)}
              options={[['circular', 'Circular — concrete'], ['square', 'Square — concrete'], ['pipe', 'Steel pipe (plugged)']]} />
            {kind !== 'square' && <Num label="Diameter D" unit="m" value={d} onChange={setD} min={0.15} max={3} step="0.05" />}
            {kind === 'square' && <Num label="Width b" unit="m" value={b} onChange={setB} min={0.15} max={3} step="0.05" />}
            {kind === 'pipe' && <Num label="Wall thickness t" unit="m" value={t} onChange={setT} min={0.005} max={0.1} step="0.005" />}
          </Card>

          <Card title="Soil profile" hint="top layer first — the tip bears in the last one">
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => setLayers((ls) => [...ls, { thickness: '3', kind: 'clay', cu: '40', phi: '', gamma: '18', gammaSat: '' }])}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Add a layer
              </button>
            </div>
            {layers.map((l, i) => (
              <div key={i} className="sm:col-span-2 lg:col-span-3 rounded-lg border border-hairline-2 p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11.5px] font-semibold text-muted">Layer {i + 1}</span>
                  {layers.length > 1 && (
                    <button type="button" onClick={() => setLayers((ls) => ls.filter((_, j) => j !== i))}
                      className="text-[11px] font-semibold text-fail hover:underline">remove</button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Pick label="Soil" value={l.kind} onChange={(v) => setLayer(i, { kind: v as SoilKind })}
                    options={[['clay', 'Clay (cu)'], ['sand', 'Sand (φ)']]} />
                  <Num label="Thickness" unit="m" value={num(l.thickness)} onChange={(v) => setLayer(i, { thickness: String(v) })} min={0.2} max={60} step="0.5" />
                  {l.kind === 'clay'
                    ? <Num label="cu" unit="kPa" value={num(l.cu)} onChange={(v) => setLayer(i, { cu: String(v) })} min={5} max={400} step="5" />
                    : <Num label="φ" unit="°" value={num(l.phi)} onChange={(v) => setLayer(i, { phi: String(v) })} min={20} max={45} step="1" />}
                  <Num label="γ" unit="kN/m³" value={num(l.gamma)} onChange={(v) => setLayer(i, { gamma: String(v) })} min={12} max={24} step="0.5" />
                  <Num label="γ sat (below WT)" unit="kN/m³" value={Number.isFinite(num(l.gammaSat)) ? num(l.gammaSat) : num(l.gamma)} onChange={(v) => setLayer(i, { gammaSat: String(v) })} min={12} max={26} step="0.5" />
                </div>
              </div>
            ))}
            <Num label="Water table depth" unit="m" value={waterTable} onChange={setWaterTable} min={0} max={80} step="0.5" />
            <Num label="Factor of safety FS" value={FS} onChange={setFS} min={1.5} max={6} step="0.25" />
          </Card>
        </div>

        <div className="space-y-5">
          {res ? (
            <>
              <ResultCard title="Capacity">
                <Row label="Shaft friction Qs" value={`${f3(res.Qs)} kN`} sub={`${f3(res.perimeter)} m perimeter · ${f3(res.embedDepth)} m embedment`} />
                <Row label="End bearing Qp" value={`${f3(res.Qp)} kN`} sub={`qp = ${f3(res.qp)} kPa · Ap = ${f3(res.area)} m²${res.capped ? ' (capped)' : ''}`} />
                <Row label="Ultimate Qult" value={`${f3(res.Qult)} kN`} sub="Qp + Qs" />
                <Row label={`Allowable (FS = ${f2(FS)})`} value={`${f3(res.Qall)} kN`} sub="the design number" />
                <Row label="Tip overburden σ′" value={`${f3(res.sigmaTip)} kPa`} sub={`at ${f3(res.embedDepth)} m${Number.isFinite(wt) ? ` · WT at ${f2(wt)} m` : ' · dry profile'}`} />
              </ResultCard>

              {res.warnings.length > 0 && (
                <ResultCard title="Notes">
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                    {res.warnings.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                </ResultCard>
              )}

              <DrawingCard title="Profile and capacity breakdown" meta="shaft segments to scale with their Qs">
                <DrawingFrame label="Pile soil profile">
                  <PileProfile res={res} layers={built!} totalDepth={totalDepth} waterTable={wt} />
                </DrawingFrame>
              </DrawingCard>

              <WorkedSolution steps={steps} title="Pile capacity — step by step" />
            </>
          ) : (
            <ResultCard title="Check the inputs">
              <p className="text-sm text-fail">
                Every layer needs a positive thickness and unit weight, plus cu for clay or φ for
                sand. The pipe wall must be thinner than half the diameter; FS ≥ 1.5.
              </p>
            </ResultCard>
          )}
        </div>
      </div>
    </div>
  )
}

// ── profile drawing: layers to scale, shaft friction bars at the side ────

function PileProfile({ res, layers, totalDepth, waterTable }: {
  res: PileResult
  layers: SoilLayer[]
  totalDepth: number
  waterTable: number
}) {
  const W = 620, H = 360
  const topY = 44, botY = H - 34
  const cx = 250
  const scale = (botY - topY) / Math.max(totalDepth, 0.1)
  const y = (z: number) => topY + z * scale
  const pileW = Math.max(14, Math.min(34, res.area > 0 ? Math.sqrt(res.area) * scale * 1.2 : 20))

  // segments carry their own from/to depths, so bands need no accumulation
  const bands = layers.map((l, i) => ({
    a: res.segments[i]?.from ?? 0,
    b: res.segments[i]?.to ?? 0,
    kind: l.kind,
    seg: res.segments[i],
  }))
  const maxQ = Math.max(...res.segments.map((s) => s.Q), 1)
  const barX = 420, barW = 130

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Pile profile">
      {/* layer bands */}
      {bands.map((bd, i) => (
        <g key={i}>
          <rect x={cx - 150} y={y(bd.a)} width={300} height={Math.max((bd.b - bd.a) * scale, 2)}
            fill={bd.kind === 'clay' ? 'rgba(120,94,58,0.14)' : 'rgba(140,140,120,0.14)'} stroke={MUTED} strokeWidth="0.7" />
          <text x={cx - 142} y={y(bd.a) + 13} fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">
            {bd.kind === 'clay' ? `cu ${f2(layers[i].cu ?? 0)} kPa` : `φ ${f2(layers[i].phi ?? 0)}°`} · {f3(bd.b - bd.a)} m
          </text>
        </g>
      ))}
      {/* water table */}
      {Number.isFinite(waterTable) && waterTable < totalDepth && (
        <>
          <line x1={cx - 150} x2={cx + 150} y1={y(waterTable)} y2={y(waterTable)} stroke="rgba(15,76,146,0.7)" strokeWidth="1.2" strokeDasharray="6 3" />
          <text x={cx + 156} y={y(waterTable) + 4} fontSize="9.5" fill="rgba(15,76,146,0.9)" fontFamily="var(--font-mono, monospace)">▽ WT</text>
        </>
      )}
      {/* the pile */}
      <rect x={cx - pileW / 2} y={y(0)} width={pileW} height={Math.max(res.embedDepth * scale, 2)} fill="rgba(15,76,146,0.35)" stroke={INK} strokeWidth="1.4" />
      {/* tip marker */}
      <path d={`M ${cx - 5} ${y(res.embedDepth)} L ${cx} ${y(res.embedDepth) + 8} L ${cx + 5} ${y(res.embedDepth)}`} fill="none" stroke={INK} strokeWidth="1.4" />
      <text x={cx} y={y(0) - 8} textAnchor="middle" fontSize="10" fill={INK} fontFamily="var(--font-mono, monospace)">
        Qp = {f3(res.Qp)} kN
      </text>
      {/* shaft friction bars per layer */}
      {bands.map((bd, i) => {
        const q = bd.seg?.Q ?? 0
        const w = (q / maxQ) * barW
        const yTop = y(bd.a) + 2
        const h = Math.max((bd.b - bd.a) * scale - 4, 3)
        return (
          <g key={i}>
            <rect x={barX} y={yTop} width={Math.max(w, 1)} height={h} fill={BRAND} opacity={0.75} />
            <text x={barX + barW + 8} y={yTop + h / 2 + 3.5} fontSize="9.5" fill={INK} fontFamily="var(--font-mono, monospace)">
              Qs = {f3(q)} kN
            </text>
          </g>
        )
      })}
      {/* totals footer */}
      <text x={cx - 150} y={H - 8} fontSize="10" fill={INK} fontFamily="var(--font-mono, monospace)">
        Qult = {f3(res.Qult)} kN · Qall = {f3(res.Qall)} kN (FS = {f2(res.FS)})
      </text>
      <text x={barX} y={topY - 10} fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">shaft friction per layer</text>
    </svg>
  )
}
