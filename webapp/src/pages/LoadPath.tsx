import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { distributePanel, wallLineLoad, type AreaLoad } from '../engine/tributary'
import type { LoadCategory } from '../engine/beamAnalysis'
import { PanelSketch } from '../components/PanelSketch'
import { tributarySolution } from '../lib/tributarySolution'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { f1, f2 } from '../lib/format'
import 'katex/dist/katex.min.css'

export const BEAM_LOADS_HANDOFF_KEY = 'beam-analysis-loads-handoff'

const CATS: [LoadCategory, string][] = [
  ['D', 'D — dead'], ['L', 'L — live'], ['Lr', 'Lr — roof live'],
  ['S', 'S — snow'], ['R', 'R — rain'], ['W', 'W — wind'], ['E', 'E — seismic'],
]

let uid = 1
interface AreaRow extends AreaLoad { id: number }

export default function LoadPath() {
  const navigate = useNavigate()
  const [a, setA] = useState(4)
  const [b, setB] = useState(6)
  const [areaLoads, setAreaLoads] = useState<AreaRow[]>([
    { id: uid++, q: 4.8, cat: 'D' },     // e.g. 200 mm slab self-weight
    { id: uid++, q: 2.4, cat: 'L' },
  ])
  // Optional wall riding on an edge beam
  const [wallOn, setWallOn] = useState(false)
  const [wallT, setWallT] = useState(150)
  const [wallH, setWallH] = useState(3)

  const valid = a > 0 && b > 0 && areaLoads.length > 0
  const r = useMemo(() => (valid ? distributePanel(a, b, areaLoads) : null), [a, b, areaLoads, valid])
  const solution = useMemo(() => (r ? tributarySolution(areaLoads, r) : null), [areaLoads, r])
  const wWall = wallOn ? wallLineLoad(wallT, wallH) : 0

  const sendToBeam = (edgeIdx: number) => {
    if (!r) return
    const e = r.edges[edgeIdx]
    const loads = [...e.loads]
    if (wallOn && wWall > 0) loads.push({ type: 'udl', x1: 0, x2: e.length, w: wWall, cat: 'D' })
    sessionStorage.setItem(BEAM_LOADS_HANDOFF_KEY, JSON.stringify({ L: e.length, loads }))
    navigate('/beam-analysis?handoff=loads')
  }

  const closes = r ? Math.abs(r.totalDistributed - r.totalApplied) <= 1e-6 * Math.max(1, Math.abs(r.totalApplied)) : false
  const shape = (e: NonNullable<typeof r>['edges'][number]) => e.loads.length === 0 ? '— none'
    : r!.behaviour === 'one-way' ? `${f2(e.peak)} kN/m UDL`
      : e.kind === 'short' ? `triangle 0 → ${f2(e.peak)} → 0 kN/m` : `trapezoid, peak ${f2(e.peak)} kN/m`
  const report = r ? {
    docCode: 'L-02',
    ok: closes,
    governing: `${r.behaviour} panel · ${f1(r.totalApplied)} kN applied, ${f1(r.totalDistributed)} kN distributed to the edges`,
    stats: r.edges.slice(0, 3).map((e) => ({ label: `${e.edge} edge`, value: f1(e.total), unit: 'kN' })),
    checks: [{ name: 'Closure — distributed = applied', ratio: null, ok: closes }],
    data: [
      ['Panel a × b', `${f2(a)} × ${f2(b)} m`],
      ...areaLoads.map((l) => [`Area load (${l.cat})`, `${f2(l.q)} kPa`] as [string, string]),
      ...(wallOn ? [['Wall on the edge beam', `${wallT} mm × ${f2(wallH)} m → ${f2(wWall)} kN/m D`] as [string, string]] : []),
    ] as [string, string][],
    steps: solution ?? [],
  } : undefined

  return (
    <WorkspacePage title="Slab Load Path" badges={['Loads', 'NSCP 2015 · ACI 318-14']}
      intro="Distribute a slab panel's area loads to its edge beams — one-way (a UDL on the long edges) or two-way (45° tributary triangles and trapezoids) — keeping each load's category for the NSCP combinations. Any edge can be sent straight into Beam Analysis."
      report={report}
      inputs={<>
        <InputGroup title="Panel" hint="ℓx is the short span and ℓy the long one — assigned automatically.">
          <Num label="Side a" unit="m" value={a} onChange={setA} />
          <Num label="Side b" unit="m" value={b} onChange={setB} />
        </InputGroup>
        <InputGroup title="Area loads">
          <div className="col-span-2 space-y-2">
            {areaLoads.map((l) => (
              <div key={l.id} className="grid grid-cols-2 items-end gap-2 border-b border-hairline-2 pb-2">
                <Num label="q" unit="kPa" value={l.q}
                  onChange={(v) => setAreaLoads((ls) => ls.map((q) => (q.id === l.id ? { ...q, q: v } : q)))} />
                <Pick label="Category" value={l.cat}
                  onChange={(v) => setAreaLoads((ls) => ls.map((q) => (q.id === l.id ? { ...q, cat: v as LoadCategory } : q)))}
                  options={CATS} />
                <button type="button" aria-label={`Remove ${l.cat} load`} onClick={() => setAreaLoads((ls) => ls.filter((q) => q.id !== l.id))}
                  className="col-span-2 justify-self-end text-xs text-fail hover:underline">remove</button>
              </div>
            ))}
            <button type="button" onClick={() => setAreaLoads((ls) => [...ls, { id: uid++, q: 2, cat: 'L' }])}
              className="no-print rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">+ Area load</button>
          </div>
        </InputGroup>
        <InputGroup title="Wall on the edge beam" hint={wallOn ? `w = t·h·24 = ${f2(wWall)} kN/m (dead), added to whichever edge you send to Beam Analysis.` : undefined}>
          <div className="col-span-2">
            <Pick label="Include wall" value={wallOn ? 'yes' : 'no'} onChange={(v) => setWallOn(v === 'yes')}
              options={[['no', 'No'], ['yes', 'Yes — add a D line load']]} />
          </div>
          {wallOn && <>
            <Num label="Thickness" unit="mm" value={wallT} onChange={setWallT} />
            <Num label="Height" unit="m" value={wallH} onChange={setWallH} />
          </>}
        </InputGroup>
      </>}
      checks={r ? <>
        <CheckCard title="Panel behaviour" basis={`ℓy/ℓx = ${f2(Math.max(a, b) / Math.min(a, b))}`} status="info" value={r.behaviour} />
        <CheckCard title="Closure" basis="Σ edge loads = Σ area loads" status={closes ? 'pass' : 'fail'}
          value={f1(r.totalDistributed)} unit="kN" pairs={[{ label: 'Applied', value: `${f1(r.totalApplied)} kN` }]} />
        {r.edges.map((e, i) => (
          <div key={e.edge} className="space-y-1">
            <CheckCard title={`Edge ${e.edge}`} basis={`${e.kind}, ${f2(e.length)} m`} status="info" value={f1(e.total)} unit="kN"
              pairs={[{ label: 'Line load', value: shape(e) }]} />
            {e.loads.length > 0 && (
              <button type="button" onClick={() => sendToBeam(i)}
                className="no-print rounded border border-brand px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">
                Analyse edge {e.edge} in Beam Analysis →
              </button>
            )}
          </div>
        ))}
      </> : <p className="text-sm text-muted">Enter a panel and at least one area load.</p>}
      summary={[
        { label: 'Panel', value: `${f2(a)} × ${f2(b)} m` },
        { label: 'Area loads', value: areaLoads.map((l) => `${l.cat} ${f2(l.q)} kPa`).join(', ') || '—' },
        { label: 'Wall', value: wallOn ? `${wallT} mm × ${f2(wallH)} m` : 'none' },
      ]}
      drawing={r ? { title: 'Tributary plan', node: <div data-pdf-drawing><PanelSketch r={r} /></div> } : undefined}
      results={r ? [
        ...r.edges.map((e) => ({ check: `Edge ${e.edge}`, basis: `${e.kind}, ${f2(e.length)} m`, demand: shape(e), limit: `W = ${f1(e.total)} kN`, status: 'info' as const })),
        { check: 'Closure', basis: 'distributed vs applied', demand: `${f1(r.totalDistributed)} kN`, limit: `${f1(r.totalApplied)} kN`, status: closes ? 'pass' as const : 'fail' as const },
      ] : []}
      steps={solution ?? []}
      references={[
        { topic: 'Tributary areas', basis: 'one-way strips; two-way 45° yield-line triangles and trapezoids', source: 'common practice; ACI 318-14 Ch. 8 commentary' },
        { topic: 'Load categories', basis: 'kept separate for the combinations', source: 'NSCP 2015 §203.3' },
      ]}
    />
  )
}
