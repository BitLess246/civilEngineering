import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { generateGridModel, removeElements } from '../engine/modelBuilder'
import type { StructuralModel, Member, Plate, RectSection } from '../engine/model'
import { distributePanel } from '../engine/tributary'
import { modelToFrame3D } from '../engine/modelBridge'
import { analyzeFrame3D, type F3Analysis } from '../engine/frame3d'
import { designStructure, type StructureDesign } from '../engine/pipeline'
import { Diagram } from '../components/Diagram'
import { Num, Card, ResultCard, Row } from '../components/qty'
import { f1, f2 } from '../lib/format'

const AUTOSAVE_KEY = 'model-space-autosave'

const ROLE_COLOR: Record<string, string> = {
  column: '#475569', beam: '#0056b3', girder: '#0e7490',
}
const SEL = '#f59e0b'

const parseList = (s: string): number[] =>
  s.split(/[, ]+/).map(parseFloat).filter((v) => Number.isFinite(v) && v > 0)

// ── 3D primitives ─────────────────────────────────────────────────────────
function Member3D({ a, b, role, selected, tint = 0, onPick }: {
  a: THREE.Vector3; b: THREE.Vector3; role: string; selected: boolean
  /** 0–1 utilisation tint (|M| relative to the model max) after analysis. */
  tint?: number
  onPick: () => void
}) {
  const { mid, quat, len } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(b, a)
    const len = dir.length()
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize())
    return { mid: new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), quat, len }
  }, [a, b])
  const t = role === 'column' ? 0.3 : 0.22
  const color = useMemo(() => {
    if (selected) return SEL
    const base = new THREE.Color(ROLE_COLOR[role] ?? '#64748b')
    return tint > 0 ? `#${base.lerp(new THREE.Color('#dc2626'), tint).getHexString()}` : `#${base.getHexString()}`
  }, [selected, role, tint])
  return (
    <mesh position={mid} quaternion={quat}
      onClick={(e) => { e.stopPropagation(); onPick() }}>
      <boxGeometry args={[len, t, t]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

function Slab3D({ corners, selected, onPick }: {
  corners: THREE.Vector3[]; selected: boolean; onPick: () => void
}) {
  const { mid, sx, sz } = useMemo(() => {
    const mid = corners.reduce((s, c) => s.add(c.clone()), new THREE.Vector3()).multiplyScalar(0.25)
    const sx = Math.abs(corners[1].x - corners[0].x) || Math.abs(corners[2].x - corners[0].x)
    const sz = Math.abs(corners[3].z - corners[0].z) || Math.abs(corners[2].z - corners[0].z)
    return { mid, sx, sz }
  }, [corners])
  return (
    <mesh position={[mid.x, mid.y + 0.05, mid.z]}
      onClick={(e) => { e.stopPropagation(); onPick() }}>
      <boxGeometry args={[sx * 0.96, 0.1, sz * 0.96]} />
      <meshStandardMaterial color={selected ? SEL : '#7ba6d4'} transparent opacity={selected ? 0.85 : 0.45} />
    </mesh>
  )
}

function Support3D({ p }: { p: THREE.Vector3 }) {
  return (
    <mesh position={[p.x, p.y - 0.22, p.z]}>
      <coneGeometry args={[0.28, 0.45, 4]} />
      <meshStandardMaterial color="#0056b3" />
    </mesh>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function ModelSpace() {
  const [baysX, setBaysX] = useState('6, 6')
  const [baysZ, setBaysZ] = useState('5')
  const [storeyH, setStoreyH] = useState('3.5, 3')
  const [b, setB] = useState(300); const [h, setH] = useState(500); const [fc, setFc] = useState(28)
  const [qD, setQD] = useState(4.8); const [qL, setQL] = useState(2.4)
  // Soil (for the footing stage of the design pipeline)
  const [qa, setQa] = useState(200); const [Hf, setHf] = useState(1.5)

  const [model, setModel] = useState<StructuralModel | null>(() => {
    try {
      const raw = sessionStorage.getItem(AUTOSAVE_KEY)
      return raw ? (JSON.parse(raw) as StructuralModel) : null
    } catch { return null }
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<F3Analysis | null>(null)
  const [design, setDesign] = useState<StructureDesign | null>(null)
  const [orphans, setOrphans] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const save = (m: StructuralModel | null) => {
    setModel(m)
    setAnalysis(null)             // geometry changed — results are stale
    setDesign(null)
    try {
      if (m) sessionStorage.setItem(AUTOSAVE_KEY, JSON.stringify(m))
      else sessionStorage.removeItem(AUTOSAVE_KEY)
    } catch { /* quota — ignore */ }
  }

  const analyze = () => {
    if (!model) return
    const br = modelToFrame3D(model)
    setOrphans(br.orphanEdges.length)
    setAnalysis(analyzeFrame3D(br.nodes, br.members, br.supports, br.loads))
  }

  const runPipeline = () => {
    if (!model) return
    setDesign(designStructure(model, { qAllow: qa, gammaSoil: 18, gammaConc: 24, H: Hf }))
  }

  const gov = analysis ? analysis.perCombo[analysis.govIdx] : null
  const govRes = gov?.result ?? null
  const memForce = useMemo(() => {
    const map = new Map<string, { Mmax: number; Vmax: number; Nmax: number }>()
    govRes?.members.forEach((m) => map.set(m.id, { Mmax: m.Mmax, Vmax: m.Vmax, Nmax: m.Nmax }))
    return map
  }, [govRes])

  const generate = () => {
    const section: RectSection = { id: 'S1', name: `${b}×${h}`, b, h, fc, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
    const m = generateGridModel({ baysX: parseList(baysX), baysZ: parseList(baysZ), storeyH: parseList(storeyH), section })
    // area loads on every slab, categories preserved for the combos downstream
    m.loads = m.plates.flatMap((p) => [
      ...(qD > 0 ? [{ kind: 'area' as const, plate: p.id, q: qD, cat: 'D' as const }] : []),
      ...(qL > 0 ? [{ kind: 'area' as const, plate: p.id, q: qL, cat: 'L' as const }] : []),
    ])
    setSelected(null)
    save(m)
  }

  const nodePos = useMemo(() => {
    const map = new Map<string, THREE.Vector3>()
    model?.nodes.forEach((n) => map.set(n.id, new THREE.Vector3(n.x, n.y, n.z)))
    return map
  }, [model])

  const selMember: Member | undefined = model?.members.find((m) => m.id === selected)
  const selPlate: Plate | undefined = model?.plates.find((p) => p.id === selected)

  const plateInfo = useMemo(() => {
    if (!selPlate || !model) return null
    const c = selPlate.corners.map((id) => nodePos.get(id)!)
    const lx = Math.abs(c[1].x - c[0].x) || Math.abs(c[2].x - c[0].x)
    const lz = Math.abs(c[3].z - c[0].z) || Math.abs(c[2].z - c[0].z)
    const areaLoads = model.loads
      .filter((l) => l.kind === 'area' && l.plate === selPlate.id)
      .map((l) => ({ q: (l as { q: number }).q, cat: l.cat }))
    const trib = areaLoads.length ? distributePanel(lx, lz, areaLoads) : null
    return { lx, lz, areaLoads, trib }
  }, [selPlate, model, nodePos])

  const memberLen = selMember
    ? nodePos.get(selMember.i)!.distanceTo(nodePos.get(selMember.j)!)
    : 0

  const download = () => {
    if (!model) return
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${model.name.replace(/\s+/g, '-')}.model.json`; a.click()
    URL.revokeObjectURL(url)
  }
  const upload = async (f: File) => {
    try {
      const m = JSON.parse(await f.text()) as StructuralModel
      if (m.version !== 1 || !Array.isArray(m.nodes)) throw new Error('not a model file')
      setSelected(null)
      save(m)
    } catch { alert('Could not read that file as a structural model (.model.json).') }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link to="/" className="no-print text-sm text-[#0056b3] hover:underline">← Home</Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0056b3]">3D Model Space</h1>
      <p className="no-print mt-1 text-slate-600">
        Generate a building frame on a column grid — beams, girders, columns and slab panels with categorised
        area loads — orbit it in 3D, click any element to inspect or delete it, and save/load the model as JSON.
        Phase 4 of the roadmap; the 3D solver (Phase 5) and the design pipeline (Phase 6) consume this model.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-5">
          <Card title="Column grid">
            <label className="flex flex-col text-sm">
              <span className="mb-1 font-medium text-slate-600">Bays X (m, comma-sep)</span>
              <input value={baysX} onChange={(e) => setBaysX(e.target.value)}
                className="rounded-md border border-slate-300 px-2.5 py-1.5" />
            </label>
            <label className="flex flex-col text-sm">
              <span className="mb-1 font-medium text-slate-600">Bays Z (m)</span>
              <input value={baysZ} onChange={(e) => setBaysZ(e.target.value)}
                className="rounded-md border border-slate-300 px-2.5 py-1.5" />
            </label>
            <label className="flex flex-col text-sm">
              <span className="mb-1 font-medium text-slate-600">Storey heights (m)</span>
              <input value={storeyH} onChange={(e) => setStoreyH(e.target.value)}
                className="rounded-md border border-slate-300 px-2.5 py-1.5" />
            </label>
          </Card>

          <Card title="Section & slab loads">
            <Num label="b" unit="mm" value={b} onChange={setB} />
            <Num label="h" unit="mm" value={h} onChange={setH} />
            <Num label="f′c" unit="MPa" value={fc} onChange={setFc} />
            <Num label="q dead" unit="kPa" value={qD} onChange={setQD} />
            <Num label="q live" unit="kPa" value={qL} onChange={setQL} />
            <Num label="Soil qa" unit="kPa" value={qa} onChange={setQa} />
            <Num label="Footing depth H" unit="m" value={Hf} onChange={setHf} />
          </Card>

          <div className="no-print flex flex-wrap gap-2">
            <button type="button" onClick={generate}
              className="rounded-lg bg-gradient-to-br from-[#0056b3] to-[#003f86] px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg">
              ⚙ Generate model
            </button>
            <button type="button" onClick={analyze} disabled={!model}
              className="rounded-lg bg-gradient-to-br from-[#0e7490] to-[#155e75] px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-40">
              ▶ Analyze (3D FEM)
            </button>
            <button type="button" onClick={runPipeline} disabled={!model}
              className="rounded-lg bg-gradient-to-br from-[#15803d] to-[#166534] px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:opacity-40">
              🏗 Design structure
            </button>
            <button type="button" onClick={download} disabled={!model}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[#0056b3] hover:border-[#0056b3] hover:bg-blue-50 disabled:opacity-40">
              ⤓ Save JSON
            </button>
            <button type="button" onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[#0056b3] hover:border-[#0056b3] hover:bg-blue-50">
              ⤒ Load JSON
            </button>
            <input ref={fileRef} type="file" accept=".json" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }} />
          </div>

          {model && (
            <ResultCard title="Model">
              <Row label="Nodes / members" value={`${model.nodes.length} / ${model.members.length}`}
                sub={`${model.members.filter((m) => m.role === 'column').length} col · ${model.members.filter((m) => m.role !== 'column').length} bm`} />
              <Row label="Slabs / loads" value={`${model.plates.length} / ${model.loads.length}`} />
              <Row label="Storeys" value={`${model.storeys.length}`}
                sub={model.storeys.map((s) => `${s.elevation} m`).join(' · ')} />
            </ResultCard>
          )}

          {gov && govRes && (
            <ResultCard title={`Analysis — ${gov.combo.name} governs`}>
              <Row label="ΣRy (gravity)" value={`${f1(govRes.reactions.reduce((s, q) => s + q.F[1], 0))} kN`} />
              <Row label="Extremes" value={`M ${f1(govRes.Mmax)} kN·m`}
                sub={`V ${f1(govRes.Vmax)} · N ${f1(govRes.Nmax)} kN`} />
              {orphans > 0 && <Row alert label="⚠ Orphan edges" value={`${orphans}`} sub="slab edges with no member" />}
              <p className="mt-1 text-[11px] text-slate-400">
                Members tinted red by |M| relative to the model max. Click one for its diagrams.
              </p>
            </ResultCard>
          )}

          {selMember && model && (
            <ResultCard title={`Member — ${selMember.id}`}>
              <Row label="Role" value={selMember.role} />
              <Row label="Length" value={`${f2(memberLen)} m`} />
              <Row label="Section" value={model.sections[0]?.name ?? selMember.section} />
              {(() => {
                const mr = govRes?.members.find((m) => m.id === selMember.id)
                if (!mr) return null
                return (
                  <div className="mt-2 space-y-2">
                    <Row label="Forces (governing)" value={`M ${f1(mr.Mmax)} kN·m`}
                      sub={`V ${f1(mr.Vmax)} · N ${f1(mr.Nmax)} kN`} />
                    <Diagram xs={mr.xs} ys={mr.Mz} title="Mz" unit="kN·m" color="#d62728" decimals={1} />
                    <Diagram xs={mr.xs} ys={mr.Vy} title="Vy" unit="kN" color="#1f77b4" decimals={1} />
                    <Diagram xs={mr.xs} ys={mr.N} title="N (+tension)" unit="kN" color="#7c3aed" decimals={1} />
                  </div>
                )
              })()}
              <button type="button" onClick={() => { save(removeElements(model, new Set([selMember.id]))); setSelected(null) }}
                className="no-print mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50">
                Delete member
              </button>
            </ResultCard>
          )}

          {selPlate && plateInfo && model && (
            <ResultCard title={`Slab — ${selPlate.id}`}>
              <Row label="Panel" value={`${f2(plateInfo.lx)} × ${f2(plateInfo.lz)} m`}
                sub={`t = ${selPlate.thickness} mm`} />
              {plateInfo.areaLoads.map((l, i) => (
                <Row key={i} label={`q (${l.cat})`} value={`${f2(l.q)} kPa`} />
              ))}
              {plateInfo.trib && (
                <Row label="Tributary" value={plateInfo.trib.behaviour}
                  sub={`peak ${f1(plateInfo.trib.edges[0].peak)} kN/m on long edges`} />
              )}
              <button type="button" onClick={() => { save(removeElements(model, new Set([selPlate.id]))); setSelected(null) }}
                className="no-print mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50">
                Delete slab
              </button>
            </ResultCard>
          )}
        </div>

        <div className="h-[560px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {model ? (
            <Canvas camera={{ position: [14, 11, 14], fov: 45 }} onPointerMissed={() => setSelected(null)}>
              <color attach="background" args={['#f8fafc']} />
              <ambientLight intensity={0.85} />
              <directionalLight position={[12, 18, 8]} intensity={0.9} />
              <gridHelper args={[40, 40, '#cbd5e1', '#e2e8f0']} />
              {model.members.map((m) => {
                const a = nodePos.get(m.i), bb = nodePos.get(m.j)
                if (!a || !bb) return null
                const tint = govRes && govRes.Mmax > 1e-9
                  ? (memForce.get(m.id)?.Mmax ?? 0) / govRes.Mmax : 0
                return <Member3D key={m.id} a={a} b={bb} role={m.role} tint={tint * 0.85}
                  selected={m.id === selected} onPick={() => setSelected(m.id)} />
              })}
              {model.plates.map((p) => {
                const cs = p.corners.map((c) => nodePos.get(c))
                if (cs.some((c) => !c)) return null
                return <Slab3D key={p.id} corners={cs as THREE.Vector3[]}
                  selected={p.id === selected} onPick={() => setSelected(p.id)} />
              })}
              {model.supports.map((s) => {
                const p = nodePos.get(s.node)
                return p ? <Support3D key={s.node} p={p} /> : null
              })}
              <OrbitControls makeDefault target={[6, 3, 2.5]} />
            </Canvas>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Set the grid and hit “Generate model”.
            </div>
          )}
        </div>
      </div>

      {design && (
        <div className="mt-6 space-y-6">
          <h2 className="text-xl font-extrabold tracking-tight text-[#0056b3]">
            Structure design — {design.govName} governs
            <span className="ml-3 text-sm font-normal text-slate-500">
              concrete ≈ {f1(design.totals.concrete)} m³ ({f1(design.totals.concreteMembers)} members + {f1(design.totals.concreteSlabs)} slabs)
            </span>
          </h2>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Beam & girder schedule</h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-left uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-2 font-semibold">Member</th>
                  <th className="py-1 pr-2 font-semibold">Section</th>
                  <th className="py-1 pr-2 text-right font-semibold">Mu (kN·m)</th>
                  <th className="py-1 pr-2 text-right font-semibold">Vu (kN)</th>
                  <th className="py-1 pr-2 font-semibold">Mode</th>
                  <th className="py-1 pr-2 font-semibold">Tension</th>
                  <th className="py-1 font-semibold">Stirrups</th>
                </tr>
              </thead>
              <tbody>
                {design.beams.flatMap((bm) => bm.sections.map((s, k) => {
                  const d = s.design
                  const bad = !(d.flexOK && d.comprEffective && d.comprNAOK && d.region !== 'inadequate')
                  return (
                    <tr key={`${bm.id}-${k}`} className={`border-t border-slate-100 ${bad ? 'bg-red-50 text-red-700' : ''}`}>
                      <td className="py-1 pr-2 font-medium">{k === 0 ? `${bm.id} (${bm.role}, ${f1(bm.L)} m)` : ''}</td>
                      <td className="py-1 pr-2">{s.label}{s.hogging ? ' (hog)' : ''}</td>
                      <td className="py-1 pr-2 text-right">{f1(Math.abs(s.Mu))}</td>
                      <td className="py-1 pr-2 text-right">{f1(s.Vu)}</td>
                      <td className="py-1 pr-2">{d.mode}</td>
                      <td className="py-1 pr-2">{d.bars}⌀{model?.sections[0]?.barDia}{d.layers.length > 1 ? ` (${d.layers.join('+')})` : ''}{s.hogging ? ' top' : ''}</td>
                      <td className="py-1">{d.sAdopt > 0 ? `@${Math.round(d.sAdopt)}` : d.region === 'none' ? 'none' : '⚠'}</td>
                    </tr>
                  )
                }))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Column schedule</h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Column</th>
                    <th className="py-1 pr-2 text-right font-semibold">Pu (kN)</th>
                    <th className="py-1 pr-2 text-right font-semibold">Mu</th>
                    <th className="py-1 pr-2 font-semibold">Bars</th>
                    <th className="py-1 text-right font-semibold">Util</th>
                  </tr>
                </thead>
                <tbody>
                  {design.columns.map((c) => (
                    <tr key={c.id} className={`border-t border-slate-100 ${c.ok ? '' : 'bg-red-50 text-red-700'}`}>
                      <td className="py-1 pr-2 font-medium">{c.id}</td>
                      <td className="py-1 pr-2 text-right">{f1(c.Pu)}</td>
                      <td className="py-1 pr-2 text-right">{f1(c.Mu)}</td>
                      <td className="py-1 pr-2">{c.bars}⌀{model?.sections[0]?.barDia} · ties @{Math.round(c.tieSpacing)}</td>
                      <td className="py-1 text-right">{(c.util * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Footing schedule</h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Node</th>
                    <th className="py-1 pr-2 text-right font-semibold">P / Pu (kN)</th>
                    <th className="py-1 pr-2 font-semibold">Plan</th>
                    <th className="py-1 pr-2 font-semibold">Dc</th>
                    <th className="py-1 font-semibold">Steel</th>
                  </tr>
                </thead>
                <tbody>
                  {design.footings.map((f) => (
                    <tr key={f.node} className={`border-t border-slate-100 ${f.ok ? '' : 'bg-red-50 text-red-700'}`}>
                      <td className="py-1 pr-2 font-medium">{f.node}</td>
                      <td className="py-1 pr-2 text-right">{f1(f.P)} / {f1(f.Pu)}</td>
                      <td className="py-1 pr-2">B = {f2(f.design.B)} m</td>
                      <td className="py-1 pr-2">{Math.round(f.design.Dc)} mm</td>
                      <td className="py-1">{f.design.bars}⌀{model?.sections[0]?.barDia} @ {Math.round(f.design.barSpacing)} e.w.</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Pipeline: slab area loads → tributary line loads → 3D frame FEM (governing NSCP combo) → beam/girder
            critical sections (SRRB/DRRB) → column P–M → base reactions → isolated footings. Open any standalone
            page for the full worked solution of a given element.
          </p>
        </div>
      )}
    </div>
  )
}
