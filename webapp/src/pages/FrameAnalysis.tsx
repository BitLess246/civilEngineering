import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  analyzeFrame2D, type FNode, type FMember, type FSupport, type FSupportType, type FLoad,
} from '../engine/frame2d'
import type { LoadCategory } from '../engine/beamAnalysis'
import { FrameSketch } from '../components/FrameSketch'
import { Diagram } from '../components/Diagram'
import { ReportControls } from '../components/ReportControls'
import { Num, Pick, Card, ResultCard, Row } from '../components/qty'
import { f1, f2 } from '../lib/format'
import 'katex/dist/katex.min.css'

const CATS: [LoadCategory, string][] = [
  ['D', 'D — dead'], ['L', 'L — live'], ['Lr', 'Lr — roof live'],
  ['S', 'S — snow'], ['R', 'R — rain'], ['W', 'W — wind'], ['E', 'E — seismic'],
]

let uid = 1
interface NodeRow extends FNode { uid: number }
interface MemberRow { uid: number; id: string; i: string; j: string }
interface SupportRow extends FSupport { uid: number }
type LoadRow = FLoad & { uid: number }

// Default: a pinned-base portal frame.
const DEF_NODES: NodeRow[] = [
  { uid: uid++, id: 'A', x: 0, y: 0 }, { uid: uid++, id: 'B', x: 0, y: 3 },
  { uid: uid++, id: 'C', x: 6, y: 3 }, { uid: uid++, id: 'D', x: 6, y: 0 },
]
const DEF_MEMBERS: MemberRow[] = [
  { uid: uid++, id: 'col1', i: 'A', j: 'B' },
  { uid: uid++, id: 'beam', i: 'B', j: 'C' },
  { uid: uid++, id: 'col2', i: 'D', j: 'C' },
]
const DEF_SUPPORTS: SupportRow[] = [
  { uid: uid++, node: 'A', type: 'pin' }, { uid: uid++, node: 'D', type: 'pin' },
]
const DEF_LOADS: LoadRow[] = [
  { uid: uid++, kind: 'member-udl', member: 'beam', w: 12, cat: 'D' },
  { uid: uid++, kind: 'member-udl', member: 'beam', w: 8, cat: 'L' },
  { uid: uid++, kind: 'node', node: 'B', Fx: 20, Fy: 0, Mz: 0, cat: 'W' },
]

function Shell({ title, onRemove, children }: { title: string; onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</span>
        <button type="button" onClick={onRemove} className="text-xs text-red-500 hover:underline">remove</button>
      </div>
      <div className="flex flex-wrap gap-3 [&>label]:w-32">{children}</div>
    </div>
  )
}

export default function FrameAnalysis() {
  // Section (applied to every member): rectangular b×h + f'c → E, A, I.
  const [b, setB] = useState(300); const [h, setH] = useState(500); const [fc, setFc] = useState(28)
  const [nodes, setNodes] = useState<NodeRow[]>(DEF_NODES)
  const [members, setMembers] = useState<MemberRow[]>(DEF_MEMBERS)
  const [supports, setSupports] = useState<SupportRow[]>(DEF_SUPPORTS)
  const [loads, setLoads] = useState<LoadRow[]>(DEF_LOADS)
  const [selCombo, setSelCombo] = useState<number | null>(null)
  const [selMember, setSelMember] = useState<string>('beam')

  const E = 4700 * Math.sqrt(Math.max(fc, 1))
  const fMembers: FMember[] = useMemo(
    () => members.map((m) => ({ id: m.id, i: m.i, j: m.j, E, A: b * h, I: (b * h ** 3) / 12 })),
    [members, E, b, h],
  )

  const valid = nodes.length >= 2 && members.length >= 1 && supports.length >= 1
  const res = useMemo(() => {
    if (!valid) return null
    try { return analyzeFrame2D(nodes, fMembers, supports, loads) } catch { return null }
  }, [nodes, fMembers, supports, loads, valid])

  const shownIdx = selCombo !== null && res && res.perCombo[selCombo]?.result ? selCombo : res?.govIdx ?? 0
  const shown = res ? res.perCombo[shownIdx] : null
  const r = shown?.result ?? null
  const mem = r?.members.find((m) => m.id === selMember) ?? r?.members[0] ?? null

  const nodeIds = nodes.map((n) => n.id)
  const memberIds = members.map((m) => m.id)
  const upd = <T extends { uid: number }>(set: React.Dispatch<React.SetStateAction<T[]>>) =>
    (uidV: number, patch: Partial<T>) => set((xs) => xs.map((x) => (x.uid === uidV ? { ...x, ...patch } : x)))
  const updNode = upd(setNodes), updSup = upd(setSupports), updLoad = upd(setLoads)
  const updMember = upd(setMembers)

  return (
    <div className="mx-auto max-w-[1500px] p-6">
      <Link to="/" className="no-print text-sm text-[#0056b3] hover:underline">← Home</Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0056b3]">Frame Analysis (2D)</h1>
      <p className="no-print mt-1 text-slate-600">
        2D frame FEM — 6-DOF members (axial + Hermite bending) built on the shared core, with pinned / roller /
        fixed nodes, nodal & member gravity loads, and all 7 NSCP 2015 load combinations. Phase 2 of the 3D
        model-space roadmap.
      </p>
      <ReportControls title="Frame Analysis Report" />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card title="Member section (all members)">
            <Num label="b" unit="mm" value={b} onChange={setB} />
            <Num label="h" unit="mm" value={h} onChange={setH} />
            <Num label="f′c" unit="MPa" value={fc} onChange={setFc} />
            <p className="col-span-full text-xs text-slate-500">
              E = 4700√f′c = {f1(E)} MPa · A = {b * h} mm² · I = {(b * h ** 3 / 12 / 1e9).toFixed(3)}×10⁹ mm⁴
            </p>
          </Card>

          <fieldset className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <legend className="px-2 text-[1.02rem] font-bold text-[#0056b3]">Nodes</legend>
            <button type="button" onClick={() => setNodes((ns) => [...ns, { uid: uid++, id: `N${ns.length + 1}`, x: 0, y: 0 }])}
              className="no-print mb-3 rounded-md border border-[#cddcf0] bg-[#eaf1f9] px-3 py-1.5 text-sm font-semibold text-[#0f4c92] hover:bg-[#dce9f7]">+ Node</button>
            <div className="space-y-3">
              {nodes.map((n) => (
                <Shell key={n.uid} title={n.id} onRemove={() => setNodes((ns) => ns.filter((q) => q.uid !== n.uid))}>
                  <label className="flex w-32 flex-col text-sm">
                    <span className="mb-1 font-medium text-slate-600">id</span>
                    <input value={n.id} onChange={(e) => updNode(n.uid, { id: e.target.value })}
                      className="rounded-md border border-slate-300 px-2.5 py-1.5" />
                  </label>
                  <Num label="x" unit="m" value={n.x} onChange={(v) => updNode(n.uid, { x: v })} />
                  <Num label="y" unit="m" value={n.y} onChange={(v) => updNode(n.uid, { y: v })} />
                </Shell>
              ))}
            </div>
          </fieldset>

          <fieldset className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <legend className="px-2 text-[1.02rem] font-bold text-[#0056b3]">Members</legend>
            <button type="button" onClick={() => setMembers((ms) => [...ms, { uid: uid++, id: `m${ms.length + 1}`, i: nodeIds[0] ?? '', j: nodeIds[1] ?? '' }])}
              className="no-print mb-3 rounded-md border border-[#cddcf0] bg-[#eaf1f9] px-3 py-1.5 text-sm font-semibold text-[#0f4c92] hover:bg-[#dce9f7]">+ Member</button>
            <div className="space-y-3">
              {members.map((m) => (
                <Shell key={m.uid} title={m.id} onRemove={() => setMembers((ms) => ms.filter((q) => q.uid !== m.uid))}>
                  <label className="flex w-32 flex-col text-sm">
                    <span className="mb-1 font-medium text-slate-600">id</span>
                    <input value={m.id} onChange={(e) => updMember(m.uid, { id: e.target.value })}
                      className="rounded-md border border-slate-300 px-2.5 py-1.5" />
                  </label>
                  <Pick label="node i" value={m.i} onChange={(v) => updMember(m.uid, { i: v })} options={nodeIds.map((q) => [q, q])} />
                  <Pick label="node j" value={m.j} onChange={(v) => updMember(m.uid, { j: v })} options={nodeIds.map((q) => [q, q])} />
                </Shell>
              ))}
            </div>
          </fieldset>

          <fieldset className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <legend className="px-2 text-[1.02rem] font-bold text-[#0056b3]">Supports</legend>
            <button type="button" onClick={() => setSupports((ss) => [...ss, { uid: uid++, node: nodeIds[0] ?? '', type: 'pin' }])}
              className="no-print mb-3 rounded-md border border-[#cddcf0] bg-[#eaf1f9] px-3 py-1.5 text-sm font-semibold text-[#0f4c92] hover:bg-[#dce9f7]">+ Support</button>
            <div className="space-y-3">
              {supports.map((s) => (
                <Shell key={s.uid} title={s.type} onRemove={() => setSupports((ss) => ss.filter((q) => q.uid !== s.uid))}>
                  <Pick label="node" value={s.node} onChange={(v) => updSup(s.uid, { node: v })} options={nodeIds.map((q) => [q, q])} />
                  <Pick label="type" value={s.type} onChange={(v) => updSup(s.uid, { type: v as FSupportType })}
                    options={[['pin', 'Pin'], ['roller', 'Roller'], ['fixed', 'Fixed']]} />
                </Shell>
              ))}
            </div>
          </fieldset>

          <fieldset className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <legend className="px-2 text-[1.02rem] font-bold text-[#0056b3]">Loads</legend>
            <div className="no-print mb-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setLoads((ls) => [...ls, { uid: uid++, kind: 'node', node: nodeIds[0] ?? '', Fx: 0, Fy: -50, Mz: 0, cat: 'D' }])}
                className="rounded-md border border-[#cddcf0] bg-[#eaf1f9] px-3 py-1.5 text-sm font-semibold text-[#0f4c92] hover:bg-[#dce9f7]">+ Node load</button>
              <button type="button" onClick={() => setLoads((ls) => [...ls, { uid: uid++, kind: 'member-udl', member: memberIds[0] ?? '', w: 10, cat: 'D' }])}
                className="rounded-md border border-[#cddcf0] bg-[#eaf1f9] px-3 py-1.5 text-sm font-semibold text-[#0f4c92] hover:bg-[#dce9f7]">+ Member UDL</button>
              <button type="button" onClick={() => setLoads((ls) => [...ls, { uid: uid++, kind: 'member-point', member: memberIds[0] ?? '', a: 1, P: 50, cat: 'D' }])}
                className="rounded-md border border-[#cddcf0] bg-[#eaf1f9] px-3 py-1.5 text-sm font-semibold text-[#0f4c92] hover:bg-[#dce9f7]">+ Member point</button>
            </div>
            <div className="space-y-3">
              {loads.map((ld) => (
                <Shell key={ld.uid} title={ld.kind} onRemove={() => setLoads((ls) => ls.filter((q) => q.uid !== ld.uid))}>
                  {ld.kind === 'node' && <>
                    <Pick label="node" value={ld.node} onChange={(v) => updLoad(ld.uid, { node: v } as Partial<LoadRow>)} options={nodeIds.map((q) => [q, q])} />
                    <Num label="Fx" unit="kN" value={ld.Fx} onChange={(v) => updLoad(ld.uid, { Fx: v } as Partial<LoadRow>)} />
                    <Num label="Fy" unit="kN" value={ld.Fy} onChange={(v) => updLoad(ld.uid, { Fy: v } as Partial<LoadRow>)} />
                    <Num label="Mz" unit="kN·m" value={ld.Mz} onChange={(v) => updLoad(ld.uid, { Mz: v } as Partial<LoadRow>)} />
                  </>}
                  {ld.kind === 'member-udl' && <>
                    <Pick label="member" value={ld.member} onChange={(v) => updLoad(ld.uid, { member: v } as Partial<LoadRow>)} options={memberIds.map((q) => [q, q])} />
                    <Num label="w (gravity ↓)" unit="kN/m" value={ld.w} onChange={(v) => updLoad(ld.uid, { w: v } as Partial<LoadRow>)} />
                  </>}
                  {ld.kind === 'member-point' && <>
                    <Pick label="member" value={ld.member} onChange={(v) => updLoad(ld.uid, { member: v } as Partial<LoadRow>)} options={memberIds.map((q) => [q, q])} />
                    <Num label="a from i" unit="m" value={ld.a} onChange={(v) => updLoad(ld.uid, { a: v } as Partial<LoadRow>)} />
                    <Num label="P (gravity ↓)" unit="kN" value={ld.P} onChange={(v) => updLoad(ld.uid, { P: v } as Partial<LoadRow>)} />
                  </>}
                  <Pick label="category" value={ld.cat} onChange={(v) => updLoad(ld.uid, { cat: v as LoadCategory } as Partial<LoadRow>)} options={CATS} />
                </Shell>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <ResultCard title="Model">
            <FrameSketch nodes={nodes} members={members.map((m) => ({ ...m, E: 0, A: 0, I: 0 }))}
              supports={supports} loads={loads} selected={selMember} />
            {!res && valid && <p className="mt-1 text-sm text-red-600">⚠ Unstable or singular — check supports/connectivity.</p>}
          </ResultCard>

          {res && (
            <ResultCard title="NSCP 2015 load combinations">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="text-left uppercase tracking-wide text-slate-500">
                      <th className="py-1 pr-2 font-semibold">Combination</th>
                      <th className="py-1 pr-2 text-right font-semibold">Nmax</th>
                      <th className="py-1 pr-2 text-right font-semibold">Vmax</th>
                      <th className="py-1 text-right font-semibold">Mmax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.perCombo.map((pc, i) => (
                      <tr key={pc.combo.name} onClick={() => pc.result && setSelCombo(i)}
                        className={`border-t border-slate-100 ${pc.result ? 'cursor-pointer hover:bg-blue-50' : 'text-slate-300'} ${
                          i === res.govIdx ? 'bg-amber-50 font-semibold' : ''} ${i === shownIdx ? 'outline outline-1 outline-[#0056b3]' : ''}`}>
                        <td className="py-1 pr-2">{pc.combo.name}{i === res.govIdx ? ' ★' : ''}</td>
                        <td className="py-1 pr-2 text-right">{pc.result ? f1(pc.result.Nmax) : '—'}</td>
                        <td className="py-1 pr-2 text-right">{pc.result ? f1(pc.result.Vmax) : '—'}</td>
                        <td className="py-1 text-right">{pc.result ? f1(pc.result.Mmax) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ResultCard>
          )}

          {r && shown && (
            <ResultCard title={`Reactions — ${shown.combo.name}`}>
              {r.reactions.map((rc, i) => (
                <Row key={i} label={`${rc.node} (${rc.type})`}
                  value={`Ry ${f2(rc.Ry)} kN`}
                  sub={`Rx ${f2(rc.Rx)}${Math.abs(rc.Rm) > 0.01 ? ` · M ${f2(rc.Rm)}` : ''}`} />
              ))}
            </ResultCard>
          )}
        </div>
      </div>

      {r && mem && (
        <div className="mt-6">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h2 className="text-[1.02rem] font-bold text-[#0056b3]">Member diagrams</h2>
            <select value={selMember} onChange={(e) => setSelMember(e.target.value)}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm">
              {r.members.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
            </select>
            <span className="text-xs text-slate-500">local x from node i · N &gt; 0 tension</span>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <Diagram xs={mem.xs} ys={mem.N} title={`AXIAL — ${mem.id}`} unit="kN" color="#7c3aed" decimals={1} />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <Diagram xs={mem.xs} ys={mem.V} title="SHEAR" unit="kN" color="#1f77b4" decimals={1} />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <Diagram xs={mem.xs} ys={mem.M} title="MOMENT" unit="kN·m" color="#d62728" decimals={1} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
