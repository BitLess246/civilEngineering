import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'
import { generateTruss, solveTruss, type TrussType } from '../engine/truss'
import { designTruss, type MemberDesign, type TrussSection } from '../engine/trussDesign'
import { FAMILIES, shapesOf, shapeByName, effectiveSection, type SectionFamily } from '../engine/aiscSections'
import { SectionShape } from '../components/SectionShape'
import { Num, Pick, Card, ResultCard, Row } from '../components/qty'
import { ReportControls } from '../components/ReportControls'
import { f1, f2 } from '../lib/format'

const TENSION = '#1d4ed8', COMPRESSION = '#dc2626', ZERO = '#94a3b8', SEL = '#f59e0b'
const UP = new THREE.Vector3(0, 1, 0)

/** A truss member drawn as a coloured cylinder (blue = tension, red = compression). */
function Member3D({ a, b, color, thick, selected, onPick }: {
  a: THREE.Vector3; b: THREE.Vector3; color: string; thick: number; selected: boolean; onPick: () => void
}) {
  const dir = useMemo(() => new THREE.Vector3().subVectors(b, a), [a, b])
  const len = dir.length()
  const mid = useMemo(() => new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), [a, b])
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()), [dir])
  const r = (selected ? 1.6 : 1) * thick
  return (
    <mesh position={mid} quaternion={quat} onClick={(e) => { e.stopPropagation(); onPick() }}>
      <cylinderGeometry args={[r, r, len, 10]} />
      <meshStandardMaterial color={selected ? SEL : color} />
    </mesh>
  )
}

function Support3D({ p, roller }: { p: THREE.Vector3; roller: boolean }) {
  return (
    <group position={[p.x, p.y - 0.18, p.z]}>
      <mesh><coneGeometry args={[0.22, 0.36, 4]} /><meshStandardMaterial color="#0056b3" /></mesh>
      {roller && <mesh position={[0, -0.22, 0]}><cylinderGeometry args={[0.22, 0.22, 0.06, 16]} /><meshStandardMaterial color="#0056b3" /></mesh>}
    </group>
  )
}

/** Downward load arrow at a loaded joint — head at the bottom, pointing DOWN. */
function Load3D({ p, mag }: { p: THREE.Vector3; mag: number }) {
  const h = Math.min(1.4, 0.4 + mag / 20)
  const head = 0.18
  return (
    <group position={[p.x, p.y + 0.18, p.z]}>
      {/* shaft sits above the joint; arrowhead at the joint, apex pointing down */}
      <mesh position={[0, head + (h - head) / 2, 0]}><cylinderGeometry args={[0.03, 0.03, h - head, 8]} /><meshStandardMaterial color="#16a34a" /></mesh>
      <mesh position={[0, head / 2, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.1, head, 12]} /><meshStandardMaterial color="#16a34a" /></mesh>
    </group>
  )
}

export default function TrussSpace() {
  const [type, setType] = useState<TrussType>('pratt')
  const [span, setSpan] = useState(12)
  const [height, setHeight] = useState(2)
  const [panels, setPanels] = useState(4)
  const [panelLoad, setPanelLoad] = useState(15)
  // section & material (steel, AISC LRFD)
  const [E, setE] = useState(200000); const [Fy, setFy] = useState(248); const [K, setK] = useState(1.0)
  const [family, setFamily] = useState<SectionFamily>('L')
  const [shapeName, setShapeName] = useState('L102x102x9.5')
  const [double, setDouble] = useState(true)        // double angle (2L) when family = L
  const [gap, setGap] = useState(10)                // gusset gap, mm
  const [selected, setSelected] = useState<string | null>(null)
  const controlsRef = useRef<React.ComponentRef<typeof OrbitControls>>(null)

  // hold Shift to pan with a left-drag (right-drag also pans)
  useEffect(() => {
    const setPan = (on: boolean) => (e: KeyboardEvent) => {
      if (e.key !== 'Shift') return
      const c = controlsRef.current
      if (c) c.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE
    }
    const d = setPan(true), u = setPan(false)
    window.addEventListener('keydown', d); window.addEventListener('keyup', u)
    return () => { window.removeEventListener('keydown', d); window.removeEventListener('keyup', u) }
  }, [])

  const model = useMemo(() => generateTruss({ type, span, height, panels, panelLoad }), [type, span, height, panels, panelLoad])
  const result = useMemo(() => solveTruss(model), [model])
  const eff = useMemo(() => {
    const shp = shapeByName(shapeName) ?? shapesOf(family)[0]
    return effectiveSection(shp, double && shp.family === 'L', gap)
  }, [shapeName, family, double, gap])
  const section: TrussSection = useMemo(() => ({ A: eff.A, r: eff.rmin, E, Fy, K }), [eff, E, Fy, K])
  const design = useMemo(() => (result ? designTruss(result.forces, section) : null), [result, section])

  const pos = useMemo(() => {
    const map = new Map<string, THREE.Vector3>()
    model.nodes.forEach((nd) => map.set(nd.id, new THREE.Vector3(nd.x, nd.y, 0)))
    return map
  }, [model])
  const maxAbs = Math.max(1e-6, ...(result?.forces.map((f) => Math.abs(f.N)) ?? [1]))
  const designById = useMemo(() => new Map((design?.members ?? []).map((d) => [d.id, d])), [design])

  const cx = span / 2, cyc = height / 2
  const selForce = result?.forces.find((f) => f.id === selected)
  const selDes = selForce ? designById.get(selForce.id) : undefined

  return (
    <div className="mx-auto max-w-[1700px] p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/" className="no-print text-sm text-[#0056b3] hover:underline">← Home</Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#0056b3]">Truss Space</h1>
          <p className="text-xs text-slate-500">Planar pin-jointed truss — generate, analyse (axial forces) &amp; design (AISC LRFD).</p>
        </div>
        <ReportControls title="Truss Design Report" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        {/* 3D viewport */}
        <div className="no-print lg:sticky lg:top-4">
          <div className="relative h-[70vh] min-h-[420px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <Canvas camera={{ position: [cx, cyc + height * 0.5 + 1, Math.max(span, 6) * 1.25], fov: 45 }} onPointerMissed={() => setSelected(null)}>
              <color attach="background" args={['#f8fafc']} />
              <ambientLight intensity={0.9} />
              <directionalLight position={[6, 12, 10]} intensity={0.8} />
              {model.members.map((mb) => {
                const a = pos.get(mb.i), b = pos.get(mb.j); if (!a || !b) return null
                const N = result?.forces.find((f) => f.id === mb.id)?.N ?? 0
                const color = Math.abs(N) < 1e-6 ? ZERO : N > 0 ? TENSION : COMPRESSION
                const thick = 0.03 + 0.06 * (Math.abs(N) / maxAbs)
                return <Member3D key={mb.id} a={a} b={b} color={color} thick={thick} selected={mb.id === selected} onPick={() => setSelected(mb.id)} />
              })}
              {model.nodes.map((nd) => { const p = pos.get(nd.id)!; return (
                <mesh key={nd.id} position={p}><sphereGeometry args={[0.07, 12, 12]} /><meshStandardMaterial color="#334155" /></mesh>
              ) })}
              {model.supports.map((s) => { const p = pos.get(s.node); return p ? <Support3D key={s.node} p={p} roller={!s.ux} /> : null })}
              {model.loads.map((l, i) => { const p = pos.get(l.node); return p && Math.abs(l.fy) > 1e-6 ? <Load3D key={i} p={p} mag={Math.abs(l.fy)} /> : null })}
              {selForce && pos.get(selForce.i) && pos.get(selForce.j) && (
                <Text position={[(pos.get(selForce.i)!.x + pos.get(selForce.j)!.x) / 2, (pos.get(selForce.i)!.y + pos.get(selForce.j)!.y) / 2 + 0.25, 0]}
                  fontSize={0.3} color="#0f172a" anchorX="center" anchorY="middle" outlineWidth={0.012} outlineColor="#ffffff">
                  {`${f1(selForce.N)} kN`}
                </Text>
              )}
              <OrbitControls ref={controlsRef} makeDefault enablePan target={[cx, cyc, 0]} />
            </Canvas>
            {selForce && (
              <div className="no-print absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-[#0056b3]/30 bg-white/90 px-2.5 py-1 text-xs shadow-sm backdrop-blur">
                <span className="font-semibold text-[#0056b3]">▣ {selForce.kind} {selForce.id}</span>
                <span className={selForce.N >= 0 ? 'text-blue-700' : 'text-red-600'}>
                  {f1(Math.abs(selForce.N))} kN {selForce.N >= 0 ? 'tension' : 'compression'}
                </span>
                {selDes && <span className="text-slate-500">util {(selDes.util * 100).toFixed(0)}%</span>}
                <button type="button" onClick={() => setSelected(null)} className="ml-0.5 text-slate-400 hover:text-red-500">✕</button>
              </div>
            )}
            <div className="no-print pointer-events-none absolute bottom-2 left-3 text-[10px] text-slate-400">
              drag to orbit · scroll to zoom · hold <b>Shift</b> (or right-drag) to pan · <span className="text-blue-700">tension</span> / <span className="text-red-600">compression</span>
            </div>
          </div>
        </div>

        {/* controls + results */}
        <div className="space-y-4">
          <Card title="Truss geometry">
            <Pick label="Type" value={type} onChange={(v) => setType(v as TrussType)}
              options={[['pratt', 'Pratt'], ['howe', 'Howe'], ['warren', 'Warren'], ['roof', 'Pitched roof (gable)']]} />
            <Num label="Span" unit="m" value={span} onChange={setSpan} step="0.5" />
            <Num label="Height" unit="m" value={height} onChange={setHeight} step="0.25" />
            <Num label="Panels" value={panels} onChange={(v) => setPanels(Math.max(2, Math.round(v)))} step="1" />
            <Num label="Joint load" unit="kN" value={panelLoad} onChange={setPanelLoad} step="1" />
          </Card>

          <Card title="Section & material (AISC steel)">
            <Pick label="Family" value={family} onChange={(v) => { const fam = v as SectionFamily; setFamily(fam); setShapeName(shapesOf(fam)[0].name) }}
              options={FAMILIES.map((f) => [f.id, f.label])} />
            <Pick label="Shape" value={shapeName} onChange={setShapeName}
              options={shapesOf(family).map((s) => [s.name, s.name])} />
            {family === 'L' && (
              <label className="col-span-full flex items-center gap-2 text-sm">
                <input type="checkbox" checked={double} onChange={(e) => setDouble(e.target.checked)} />
                <span>Double angle (2L, back-to-back)</span>
              </label>
            )}
            {family === 'L' && double && <Num label="Gusset gap" unit="mm" value={gap} onChange={setGap} step="1" />}
            <Num label="Fy" unit="MPa" value={Fy} onChange={setFy} step="5" />
            <Num label="E" unit="MPa" value={E} onChange={setE} step="1000" />
            <Num label="Effective length K" value={K} onChange={setK} step="0.05" />
            <div className="col-span-full flex items-center gap-3 border-t border-slate-100 pt-2">
              <SectionShape sec={eff} />
              <div className="text-[11px] text-slate-500">
                <div className="font-semibold text-[#0056b3]">{eff.label}</div>
                <div>A = {Math.round(eff.A)} mm²</div>
                <div>rx {eff.rx.toFixed(1)} · ry {eff.ry.toFixed(1)} mm</div>
                <div>r_min = {eff.rmin.toFixed(1)} mm (governs buckling)</div>
              </div>
            </div>
          </Card>

          {result && (
            <ResultCard title={`Analysis — ${result.determinacy.status}`}>
              <Row label="Determinacy m + r − 2j" value={`${result.determinacy.value}`}
                sub={`m ${result.determinacy.m} · r ${result.determinacy.r} · j ${result.determinacy.j}`} alert={result.determinacy.status === 'unstable'} />
              <Row label="Max tension" value={`${f1(result.maxTension)} kN`} />
              <Row label="Max compression" value={`${f1(result.maxCompression)} kN`} />
              {result.reactions.map((r2) => (
                <Row key={r2.node} label={`Reaction @ ${r2.node}`} value={`${f1(r2.fy)} kN ↑`} sub={r2.fx ? `H ${f1(r2.fx)} kN` : undefined} />
              ))}
              {design && <Row alert={!design.allOK} label="Design" value={design.allOK ? `OK · max util ${(design.maxUtil * 100).toFixed(0)}%` : `✗ max util ${(design.maxUtil * 100).toFixed(0)}%`} />}
            </ResultCard>
          )}
        </div>
      </div>

      {/* Member schedule (printable report) */}
      {result && design && (
        <div className="mt-6 space-y-4">
          <h2 className="text-xl font-extrabold tracking-tight text-[#0056b3]">
            Truss member schedule — {type} · {f1(span)} m span
            <span className="ml-3 text-sm font-normal text-slate-500">
              {result.determinacy.status} · {eff.label} · Fy {Fy} MPa · max util {(design.maxUtil * 100).toFixed(0)}%
            </span>
          </h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-left uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-2 font-semibold">Member</th>
                  <th className="py-1 pr-2 font-semibold">Type</th>
                  <th className="py-1 pr-2 text-right font-semibold">L (m)</th>
                  <th className="py-1 pr-2 text-right font-semibold">Force (kN)</th>
                  <th className="py-1 pr-2 font-semibold">Sense</th>
                  <th className="py-1 pr-2 text-right font-semibold">KL/r</th>
                  <th className="py-1 pr-2 text-right font-semibold">φPn (kN)</th>
                  <th className="py-1 text-right font-semibold">Util</th>
                </tr>
              </thead>
              <tbody>
                {result.forces.map((f) => {
                  const d = designById.get(f.id) as MemberDesign
                  const bad = !d.ok
                  return (
                    <tr key={f.id} onClick={() => setSelected(f.id)}
                      className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${bad ? 'bg-red-50 text-red-700' : ''} ${selected === f.id ? 'bg-amber-50' : ''}`}>
                      <td className="py-1 pr-2 font-medium">{f.id} <span className="text-slate-400">({f.i}–{f.j})</span></td>
                      <td className="py-1 pr-2">{f.kind}</td>
                      <td className="py-1 pr-2 text-right">{f2(f.L)}</td>
                      <td className="py-1 pr-2 text-right">{f1(Math.abs(f.N))}</td>
                      <td className={`py-1 pr-2 ${f.N >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{d.mode === 'zero' ? '—' : f.N >= 0 ? 'T' : 'C'}</td>
                      <td className="py-1 pr-2 text-right">{d.mode === 'compression' ? Math.round(d.slenderness) + (d.slenderOK ? '' : ' ⚠') : '—'}</td>
                      <td className="py-1 pr-2 text-right">{f1(d.phiPn)}</td>
                      <td className="py-1 text-right">{(d.util * 100).toFixed(0)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-slate-400">
              Pin-jointed planar truss (axial only). Tension yielding φPn = 0.9·Fy·Ag; compression flexural buckling per AISC §E3
              (Fcr from KL/r, φ = 0.90). KL/r &gt; 200 flagged (⚠). Reactions: pin at the left support, roller at the right.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
