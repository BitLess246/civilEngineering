import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { distributePanel, wallLineLoad, type AreaLoad } from '../engine/tributary'
import type { LoadCategory } from '../engine/beamAnalysis'
import { PanelSketch } from '../components/PanelSketch'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import { tributarySolution } from '../lib/tributarySolution'
import { Num, Pick, Card, ResultCard, Row } from '../components/qty'
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

  return (
    <div className="mx-auto max-w-[1500px] p-6">
      <Link to="/" className="no-print text-sm text-[#0056b3] hover:underline">← Home</Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0056b3]">Slab Load Path (Tributary)</h1>
      <p className="no-print mt-1 text-slate-600">
        Distribute a slab panel's area loads to its edge beams — one-way (UDL on the long edges) or two-way
        (45° tributary triangles & trapezoids) — with categories preserved for the NSCP combinations. Send any
        edge straight into Beam Analysis. Phase 3 of the 3D model-space roadmap.
      </p>
      <ReportControls title="Slab Load Path Report" />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card title="Panel">
            <Num label="Side a" unit="m" value={a} onChange={setA} />
            <Num label="Side b" unit="m" value={b} onChange={setB} />
            <p className="col-span-full text-xs text-slate-500">
              ℓx = short span, ℓy = long span — assigned automatically.
            </p>
          </Card>

          <fieldset className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <legend className="px-2 text-[1.02rem] font-bold text-[#0056b3]">Area loads</legend>
            <button type="button" onClick={() => setAreaLoads((ls) => [...ls, { id: uid++, q: 2, cat: 'L' }])}
              className="no-print mb-3 rounded-md border border-[#cddcf0] bg-[#eaf1f9] px-3 py-1.5 text-sm font-semibold text-[#0f4c92] hover:bg-[#dce9f7]">+ Area load</button>
            <div className="space-y-3">
              {areaLoads.map((l) => (
                <div key={l.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{l.cat} load</span>
                    <button type="button" onClick={() => setAreaLoads((ls) => ls.filter((q) => q.id !== l.id))}
                      className="text-xs text-red-500 hover:underline">remove</button>
                  </div>
                  <div className="flex flex-wrap gap-3 [&>label]:w-36">
                    <Num label="q" unit="kPa" value={l.q}
                      onChange={(v) => setAreaLoads((ls) => ls.map((q) => (q.id === l.id ? { ...q, q: v } : q)))} />
                    <Pick label="category" value={l.cat}
                      onChange={(v) => setAreaLoads((ls) => ls.map((q) => (q.id === l.id ? { ...q, cat: v as LoadCategory } : q)))}
                      options={CATS} />
                  </div>
                </div>
              ))}
            </div>
          </fieldset>

          <Card title="Wall on the edge beam (optional)">
            <Pick label="Include wall" value={wallOn ? 'yes' : 'no'} onChange={(v) => setWallOn(v === 'yes')}
              options={[['no', 'No'], ['yes', 'Yes — add D line load']]} />
            {wallOn && <>
              <Num label="Thickness" unit="mm" value={wallT} onChange={setWallT} />
              <Num label="Height" unit="m" value={wallH} onChange={setWallH} />
              <p className="col-span-full text-xs text-slate-500">
                w = t·h·24 = {f2(wWall)} kN/m (dead) — added to whichever edge you send to Beam Analysis.
              </p>
            </>}
          </Card>
        </div>

        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          {r && (
            <ResultCard title="Tributary plan">
              <PanelSketch r={r} />
            </ResultCard>
          )}

          {r && (
            <ResultCard title="Edge line loads">
              {r.edges.map((e, i) => (
                <Row key={e.edge}
                  label={
                    <span className="inline-flex items-center gap-2">
                      {e.edge} ({e.kind}, {f2(e.length)} m)
                      {e.loads.length > 0 && (
                        <button type="button" onClick={() => sendToBeam(i)}
                          className="no-print rounded border border-[#0056b3] px-1.5 py-0.5 text-[10px] font-semibold text-[#0056b3] hover:bg-blue-50">
                          analyze →
                        </button>
                      )}
                    </span>
                  }
                  value={e.loads.length === 0 ? '— none'
                    : r.behaviour === 'one-way' ? `${f2(e.peak)} kN/m UDL`
                      : e.kind === 'short' ? `△ 0→${f2(e.peak)}→0 kN/m`
                        : `▱ peak ${f2(e.peak)} kN/m`}
                  sub={`W = ${f1(e.total)} kN`} />
              ))}
              <Row label="Closure" value={`${f1(r.totalDistributed)} = ${f1(r.totalApplied)} kN ✓`} />
            </ResultCard>
          )}
        </div>
      </div>

      {solution && <WorkedSolution steps={solution} title="Load path — step by step" />}
    </div>
  )
}
