import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import * as THREE from 'three'
import { generateTruss, solveTrussEnvelope, selfWeightLoads, type TrussType, type TrussModel } from '../engine/truss'
import { designTruss, type MemberDesign, type TrussSection } from '../engine/trussDesign'
import { FAMILIES, shapesOf, shapeByName, effectiveSection, type SectionFamily, type EffectiveSection } from '../engine/aiscSections'
import { trussTakeoff, costTrussBill } from '../engine/trussTakeoff'
import { SectionShape } from '../components/SectionShape'
import { TrussEditor } from '../components/TrussEditor'
import { FitView } from '../components/FitView'
import { buildSectionShapes } from '../lib/sectionShapes3d'
import { Num, Pick, Card, ResultCard, Row } from '../components/qty'
import { ReportControls } from '../components/ReportControls'
import { f1, f2 } from '../lib/format'

const TENSION = '#1d4ed8', COMPRESSION = '#dc2626', ZERO = '#94a3b8', SEL = '#f59e0b'
const WORLD_Z = new THREE.Vector3(0, 0, 1)

/** A truss member drawn as its ACTUAL cross-section extruded along the member,
 *  coloured blue = tension / red = compression. */
function Member3D({ a, b, shapes, color, selected, onPick }: {
  a: THREE.Vector3; b: THREE.Vector3; shapes: THREE.Shape[]; color: string; selected: boolean; onPick: () => void
}) {
  const len = useMemo(() => a.distanceTo(b), [a, b])
  // basis: extrude along the member axis; section "height" points out of plane.
  const quat = useMemo(() => {
    const z = new THREE.Vector3().subVectors(b, a).normalize()
    let x = new THREE.Vector3().crossVectors(z, WORLD_Z)
    if (x.lengthSq() < 1e-9) x = new THREE.Vector3(1, 0, 0)
    x.normalize()
    const y = new THREE.Vector3().crossVectors(z, x).normalize()
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
  }, [a, b])
  return (
    <group position={a} quaternion={quat} onClick={(e) => { e.stopPropagation(); onPick() }}>
      {shapes.map((sh, i) => (
        <mesh key={i}>
          <extrudeGeometry args={[sh, { depth: len, bevelEnabled: false, steps: 1 }]} />
          <meshStandardMaterial color={selected ? SEL : color} metalness={0.1} roughness={0.65} />
        </mesh>
      ))}
    </group>
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
  // joint loads (kN at each loaded chord node) + self-weight (auto from section)
  const [deadLoad, setDeadLoad] = useState(3)
  const [liveLoad, setLiveLoad] = useState(15)
  const [includeSW, setIncludeSW] = useState(true)
  // section & material (steel, AISC LRFD)
  const [E, setE] = useState(200000); const [Fy, setFy] = useState(248); const [K, setK] = useState(1.0)
  const [family, setFamily] = useState<SectionFamily>('L')
  const [shapeName, setShapeName] = useState('L102x102x9.5')
  const [double, setDouble] = useState(true)        // double angle (2L) when family = L
  const [gap, setGap] = useState(0)                 // separator/gusset plate thickness, mm (0 = touching)
  const [selected, setSelected] = useState<string | null>(null)
  const [steelUnitPrice, setSteelUnitPrice] = useState(80)       // ₱ per kg
  const [gussetPct, setGussetPct] = useState(10)                 // % connection allowance
  // free-form editor: when non-null, this model replaces the parametric one
  const [custom, setCustom] = useState<TrussModel | null>(null)
  // custom section: enter A & radii directly instead of picking an AISC shape
  const [customSec, setCustomSec] = useState(false)
  const [csA, setCsA] = useState(1500); const [csRx, setCsRx] = useState(30); const [csRy, setCsRy] = useState(30)
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

  const generated = useMemo(() => generateTruss({ type, span, height, panels, panelLoad: liveLoad }), [type, span, height, panels, liveLoad])
  const model = custom ?? generated
  const eff: EffectiveSection = useMemo(() => {
    if (customSec) {
      const A = Math.max(1, csA), rx = Math.max(0.1, csRx), ry = Math.max(0.1, csRy)
      const side = Math.sqrt(A)   // illustrative square profile (drawing only)
      return { label: `Custom (A ${Math.round(A)} mm²)`, family: 'HSS', A, rx, ry, rmin: Math.min(rx, ry), double: false,
        base: { name: 'custom', family: 'HSS', A, rx, ry, b: side, h: side, t: side / 2 } }
    }
    const shp = shapeByName(shapeName) ?? shapesOf(family)[0]
    return effectiveSection(shp, double && shp.family === 'L', gap)
  }, [customSec, csA, csRx, csRy, shapeName, family, double, gap])
  const section: TrussSection = useMemo(() => ({ A: eff.A, r: eff.rmin, E, Fy, K }), [eff, E, Fy, K])

  // load cases: Dead = self-weight (section-derived) + dead joint loads; Live =
  // live joint loads. Envelope over the NSCP gravity combinations.
  const loadedNodes = useMemo(() => [...new Set(model.loads.map((l) => l.node))], [model])
  const dead = useMemo(() => [
    ...(includeSW ? selfWeightLoads(model, eff.A) : []),
    ...loadedNodes.map((n) => ({ node: n, fx: 0, fy: -deadLoad })),
  ], [model, includeSW, eff.A, loadedNodes, deadLoad])
  const live = useMemo(() => loadedNodes.map((n) => ({ node: n, fx: 0, fy: -liveLoad })), [loadedNodes, liveLoad])
  const result = useMemo(() => solveTrussEnvelope(model, dead, live), [model, dead, live])
  const design = useMemo(() => (result ? designTruss(result.forces, section) : null), [result, section])
  const shapes3d = useMemo(() => {
    if (customSec) {   // illustrative solid square (no real profile for a custom section)
      const h = Math.sqrt(eff.A) / 1000 / 2
      const sq = new THREE.Shape(); sq.moveTo(-h, -h); sq.lineTo(h, -h); sq.lineTo(h, h); sq.lineTo(-h, h); sq.closePath()
      return [sq]
    }
    return buildSectionShapes(eff)   // true-scale section profiles for the 3D extrusion
  }, [eff, customSec])
  const takeoff = useMemo(
    () => result ? trussTakeoff(result.forces, eff, { gussetFraction: gussetPct / 100 }) : null,
    [result, eff, gussetPct],
  )
  const bill = useMemo(
    () => takeoff ? costTrussBill(takeoff, { steelKg: steelUnitPrice }) : null,
    [takeoff, steelUnitPrice],
  )
  const peso = (v: number) => `₱${v.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

  const pos = useMemo(() => {
    const map = new Map<string, THREE.Vector3>()
    model.nodes.forEach((nd) => map.set(nd.id, new THREE.Vector3(nd.x, nd.y, 0)))
    return map
  }, [model])
  const box = useMemo(() => {
    const xs = model.nodes.map((n) => n.x), ys = model.nodes.map((n) => n.y)
    return { min: [Math.min(...xs), Math.min(...ys), 0] as [number, number, number], max: [Math.max(...xs), Math.max(...ys), 0] as [number, number, number] }
  }, [model])
  const designById = useMemo(() => new Map((design?.members ?? []).map((d) => [d.id, d])), [design])

  const cx = (box.min[0] + box.max[0]) / 2, cyc = (box.min[1] + box.max[1]) / 2   // orbit target = model centre
  const selForce = result?.forces.find((f) => f.id === selected)
  const selDes = selForce ? designById.get(selForce.id) : undefined
  const serviceLoad = deadLoad + liveLoad

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
            <Canvas camera={{ position: [cx - span * 0.35, cyc + height + span * 0.22, Math.max(span, 6) * 1.0], fov: 45 }} onPointerMissed={() => setSelected(null)}>
              <color attach="background" args={['#f8fafc']} />
              <ambientLight intensity={0.9} />
              <directionalLight position={[6, 12, 10]} intensity={0.8} />
              <FitView box={box} dir={[-0.45, 0.4, 1]} />
              {model.members.map((mb) => {
                const a = pos.get(mb.i), b = pos.get(mb.j); if (!a || !b) return null
                const N = result?.forces.find((f) => f.id === mb.id)?.N ?? 0
                const color = Math.abs(N) < 1e-6 ? ZERO : N > 0 ? TENSION : COMPRESSION
                return <Member3D key={mb.id} a={a} b={b} shapes={shapes3d} color={color} selected={mb.id === selected} onPick={() => setSelected(mb.id)} />
              })}
              {model.nodes.map((nd) => { const p = pos.get(nd.id)!; return (
                <mesh key={nd.id} position={p}><sphereGeometry args={[0.07, 12, 12]} /><meshStandardMaterial color="#334155" /></mesh>
              ) })}
              {model.supports.map((s) => { const p = pos.get(s.node); return p ? <Support3D key={s.node} p={p} roller={!s.ux} /> : null })}
              {serviceLoad > 1e-6 && loadedNodes.map((n) => { const p = pos.get(n); return p ? <Load3D key={n} p={p} mag={serviceLoad} /> : null })}
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
                <button type="button" onClick={() => setSelected(null)} className="ml-0.5 text-slate-500 hover:text-red-500">✕</button>
              </div>
            )}
            <div className="no-print pointer-events-none absolute bottom-2 left-3 text-[10px] text-slate-500">
              drag to orbit · scroll to zoom · hold <b>Shift</b> (or right-drag) to pan · <span className="text-blue-700">tension</span> / <span className="text-red-600">compression</span>
            </div>
          </div>
        </div>

        {/* controls + results */}
        <div className="space-y-4">
          {custom ? (
            <TrussEditor model={custom} onChange={setCustom} onReset={() => { setCustom(null); setSelected(null) }} />
          ) : (
            <Card title="Truss geometry">
              <Pick label="Type" value={type} onChange={(v) => setType(v as TrussType)}
                options={[['pratt', 'Pratt'], ['howe', 'Howe'], ['warren', 'Warren'], ['roof', 'Pitched roof (gable)'], ['fink', 'Fink (W-web)'], ['scissor', 'Scissor (raised tie)']]} />
              <Num label="Span" unit="m" value={span} onChange={setSpan} step="0.5" />
              <Num label="Height" unit="m" value={height} onChange={setHeight} step="0.25" />
              <Num label="Panels" value={panels} onChange={(v) => setPanels(Math.max(2, Math.round(v)))} step="1" />
              <button type="button" onClick={() => { setCustom(structuredClone(generated)); setSelected(null) }}
                className="col-span-full mt-1 rounded-md border border-[#0056b3]/40 bg-[#0056b3]/5 px-3 py-1.5 text-sm font-semibold text-[#0056b3] hover:bg-[#0056b3]/10">
                ✎ Customize this truss (free-form editor)
              </button>
            </Card>
          )}

          <Card title="Loads (NSCP combinations)">
            <Num label="Dead joint load" unit="kN" value={deadLoad} onChange={setDeadLoad} step="1" />
            <Num label="Live joint load" unit="kN" value={liveLoad} onChange={setLiveLoad} step="1" />
            <label className="col-span-full flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeSW} onChange={(e) => setIncludeSW(e.target.checked)} />
              <span>Add member self-weight (from the section) to Dead</span>
            </label>
            <p className="col-span-full text-[11px] text-slate-500">
              Members are enveloped over <b>1.4D</b> and <b>1.2D + 1.6L</b>; each is designed for its governing combination.
            </p>
          </Card>

          <Card title="Section & material (AISC steel)">
            <label className="col-span-full flex items-center gap-2 text-sm">
              <input type="checkbox" checked={customSec} onChange={(e) => setCustomSec(e.target.checked)} />
              <span>Custom section (enter area &amp; radii directly)</span>
            </label>
            {customSec ? (
              <>
                <Num label="Area A" unit="mm²" value={csA} onChange={setCsA} step="50" />
                <Num label="r_x" unit="mm" value={csRx} onChange={setCsRx} step="1" />
                <Num label="r_y" unit="mm" value={csRy} onChange={setCsRy} step="1" />
              </>
            ) : (
              <>
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
                {family === 'L' && double && <Num label="Separator plate thickness" unit="mm" value={gap} onChange={setGap} step="1" />}
              </>
            )}
            <Num label="Fy" unit="MPa" value={Fy} onChange={setFy} step="5" />
            <Num label="E" unit="MPa" value={E} onChange={setE} step="1000" />
            <Num label="Effective length K" value={K} onChange={setK} step="0.05" />
            <div className="col-span-full flex items-center gap-3 border-t border-slate-100 pt-2">
              {!customSec && <SectionShape sec={eff} />}
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
              <Row label="Max tension (factored)" value={`${f1(result.maxTension)} kN`} />
              <Row label="Max compression (factored)" value={`${f1(result.maxCompression)} kN`} />
              {result.reactions.map((r2) => (
                <Row key={r2.node} label={`Reaction @ ${r2.node}`} value={`${f1(r2.fy)} kN ↑`} sub={r2.fx ? `H ${f1(r2.fx)} kN` : undefined} />
              ))}
              <Row label="Reactions / forces from" value={result.reactionCombo} sub="member forces enveloped over 1.4D & 1.2D+1.6L" />
              {design && <Row alert={!design.allOK} label="Design" value={design.allOK ? `OK · max util ${(design.maxUtil * 100).toFixed(0)}%` : `✗ max util ${(design.maxUtil * 100).toFixed(0)}%`} />}
            </ResultCard>
          )}
        </div>
      </div>

      {/* Member schedule (printable report) */}
      {result && design && (
        <div className="mt-6 space-y-4">
          <h2 className="text-xl font-extrabold tracking-tight text-[#0056b3]">
            Truss member schedule — {custom ? 'custom truss' : `${type} · ${f1(span)} m span`}
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
                  <th className="py-1 pr-2 font-semibold">Combo</th>
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
                      <td className="py-1 pr-2 font-medium">{f.id} <span className="text-slate-500">({f.i}–{f.j})</span></td>
                      <td className="py-1 pr-2">{f.kind}</td>
                      <td className="py-1 pr-2 text-right">{f2(f.L)}</td>
                      <td className="py-1 pr-2 text-right">{f1(Math.abs(f.N))}</td>
                      <td className={`py-1 pr-2 ${f.N >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{d.mode === 'zero' ? '—' : f.N >= 0 ? 'T' : 'C'}</td>
                      <td className="py-1 pr-2 text-slate-500">{f.combo}</td>
                      <td className="py-1 pr-2 text-right">{d.mode === 'compression' ? Math.round(d.slenderness) + (d.slenderOK ? '' : ' ⚠') : '—'}</td>
                      <td className="py-1 pr-2 text-right">{f1(d.phiPn)}</td>
                      <td className="py-1 text-right">{(d.util * 100).toFixed(0)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-slate-500">
              Pin-jointed planar truss (axial only). Tension yielding φPn = 0.9·Fy·Ag; compression flexural buckling per AISC §E3
              (Fcr from KL/r, φ = 0.90). KL/r &gt; 200 flagged (⚠). Reactions: pin at the left support, roller at the right.
            </p>
          </div>
        </div>
      )}

      {/* ── Material take-off / priced Bill of Materials ── */}
      {takeoff && bill && (
        <div className="mt-6 space-y-4 break-before-page">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-extrabold tracking-tight text-[#0056b3]">
              Material Take-off &amp; Bill of Materials
              <span className="ml-3 text-sm font-normal text-slate-500">{takeoff.section}</span>
            </h2>
          </div>

          {/* Summary tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              ['Members', `${takeoff.byMember.length}`],
              ['Section A', `${Math.round(takeoff.areaMm2)} mm²`],
              ['Net steel', `${f1(takeoff.netSteelKg)} kg`],
              [`Gusset (${gussetPct}%)`, `${f1(takeoff.gussetKg)} kg`],
              ['Total steel', `${f1(takeoff.totalKg)} kg`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-slate-200 bg-white p-2 text-center shadow-sm">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{k}</div>
                <div className="text-base font-bold text-[#0056b3]">{v}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Per-member table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Steel by member</h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Member</th>
                    <th className="py-1 pr-2 font-semibold">Kind</th>
                    <th className="py-1 pr-2 text-right font-semibold">L (m)</th>
                    <th className="py-1 pr-2 text-right font-semibold">kg/m</th>
                    <th className="py-1 text-right font-semibold">Net (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {takeoff.byMember.map((m) => (
                    <tr key={m.id} className="border-t border-slate-100">
                      <td className="py-0.5 pr-2 font-medium">{m.id}</td>
                      <td className="py-0.5 pr-2 capitalize text-slate-500">{m.kind}</td>
                      <td className="py-0.5 pr-2 text-right">{f2(m.L)}</td>
                      <td className="py-0.5 pr-2 text-right">{f2(m.kgPerM)}</td>
                      <td className="py-0.5 text-right">{f2(m.netWeightKg)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 font-semibold">
                    <td colSpan={4} className="py-1 pr-2">Total</td>
                    <td className="py-1 text-right">{f1(takeoff.netSteelKg)} kg</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* By-kind subtotals + priced BOM */}
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">By element kind</h3>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="text-left uppercase tracking-wide text-slate-500">
                      <th className="py-1 pr-2 font-semibold">Kind</th>
                      <th className="py-1 pr-2 text-right font-semibold">Members</th>
                      <th className="py-1 pr-2 text-right font-semibold">Length (m)</th>
                      <th className="py-1 text-right font-semibold">Net (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {takeoff.byKind.map((k) => (
                      <tr key={k.kind} className="border-t border-slate-100">
                        <td className="py-0.5 pr-2 capitalize font-medium">{k.kind}</td>
                        <td className="py-0.5 pr-2 text-right">{k.members}</td>
                        <td className="py-0.5 pr-2 text-right">{f2(k.lengthM)}</td>
                        <td className="py-0.5 text-right">{f2(k.netKg)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-200 font-semibold">
                      <td className="py-1 pr-2">Total</td>
                      <td className="py-1 pr-2 text-right">{takeoff.byMember.length}</td>
                      <td className="py-1 pr-2 text-right">{f2(takeoff.byKind.reduce((s, k) => s + k.lengthM, 0))}</td>
                      <td className="py-1 text-right">{f1(takeoff.netSteelKg)} kg</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Priced BOM */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[1.02rem] font-bold text-[#0056b3]">Priced Bill of Materials</h3>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <label className="flex items-center gap-1 text-slate-600">
                      Steel price
                      <input type="number" value={steelUnitPrice} min={1} step={5}
                        onChange={(e) => setSteelUnitPrice(Math.max(1, Number(e.target.value)))}
                        className="no-print ml-1 w-20 rounded border border-slate-300 px-1 py-0.5 text-right text-xs"
                      />
                      <span>₱/kg</span>
                    </label>
                    <label className="flex items-center gap-1 text-slate-600">
                      Gusset
                      <input type="number" value={gussetPct} min={0} max={50} step={1}
                        onChange={(e) => setGussetPct(Math.min(50, Math.max(0, Number(e.target.value))))}
                        className="no-print ml-1 w-16 rounded border border-slate-300 px-1 py-0.5 text-right text-xs"
                      />
                      <span>%</span>
                    </label>
                  </div>
                </div>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="text-left uppercase tracking-wide text-slate-500">
                      <th className="py-1 pr-2 font-semibold">Item</th>
                      <th className="py-1 pr-2 text-right font-semibold">Qty</th>
                      <th className="py-1 pr-2 font-semibold">Unit</th>
                      <th className="py-1 pr-2 text-right font-semibold">Unit price</th>
                      <th className="py-1 text-right font-semibold">Amount (₱)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bill.rows.map((r) => (
                      <tr key={r.item} className="border-t border-slate-100">
                        <td className="py-0.5 pr-2">{r.item}</td>
                        <td className="py-0.5 pr-2 text-right">{f1(r.qty)}</td>
                        <td className="py-0.5 pr-2">{r.unit}</td>
                        <td className="py-0.5 pr-2 text-right">{peso(r.unitPrice)}</td>
                        <td className="py-0.5 text-right">{peso(r.amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-300 font-bold">
                      <td colSpan={4} className="py-1 pr-2">Total</td>
                      <td className="py-1 text-right">{peso(bill.total)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-1 text-[11px] text-slate-500">
                  Section steel weight = A × L × 7850 kg/m³ per member.
                  Gusset / connection plate allowance added as a fraction of the section steel.
                  Prices in Philippine Peso (₱); edit to match current market rates.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
