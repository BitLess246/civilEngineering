import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { shapesOf, shapeByName } from '../engine/aiscSections'
import type { AiscShape } from '../engine/aiscSections'
import {
  deriveWSection, beamFlexure, beamShear, columnAxial,
  weakAxisFlexure, combinedLoading, boltShear, weldStrength,
  beamLoadingSimple, boltGroupGeom, eccentricBoltGroup, shearTabBlockShear,
  outOfPlaneBoltGroup,
} from '../engine/steelDesign'
import type { BoltGrade, ElectrodeClass } from '../engine/steelDesign'
import { Num, Pick, Card, ResultCard, Row } from '../components/qty'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import { ConnectionDrawing } from '../components/ConnectionDrawing'
import type { SolutionStep } from '../lib/solution'
import { f1, f2, f3 } from '../lib/format'
import { sn1, sn2, sn3 } from '../lib/solution'

const BeamViewer3D      = lazy(() => import('../components/SteelViewer3D').then(m => ({ default: m.BeamViewer3D })))
const ColumnViewer3D    = lazy(() => import('../components/SteelViewer3D').then(m => ({ default: m.ColumnViewer3D })))
const ConnectionViewer3D = lazy(() => import('../components/SteelViewer3D').then(m => ({ default: m.ConnectionViewer3D })))

type Tab   = 'beam' | 'column' | 'connection'
type Grade = 'A36' | 'A572G50'
type ConnType = 'bolt' | 'weld'

const GRADES: Record<Grade, { Fy: number; Fu: number; label: string }> = {
  A36:     { Fy: 248, Fu: 400, label: 'A36 / SS400  (Fy 248 MPa)' },
  A572G50: { Fy: 345, Fu: 448, label: 'A572 Gr50 / A992  (Fy 345 MPa)' },
}
const W_SHAPES = shapesOf('W')

function shapeOrFirst(name: string): AiscShape { return shapeByName(name) ?? W_SHAPES[0] }

const ok = (pass: boolean, v: string) => (
  <span className={pass ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>{v} {pass ? '✓' : '✗'}</span>
)
const badge = (zone: string) => {
  const cls = zone === 'plastic' ? 'bg-green-100 text-green-800' : zone === 'inelastic' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
  return <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${cls}`}>{zone}</span>
}
const Spinner = () => <div className="flex h-72 items-center justify-center rounded-xl border border-slate-200 bg-slate-900 text-sm text-slate-400">Loading 3D…</div>
const ShapePick = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <label className="col-span-full flex flex-col text-sm">
    <span className="mb-1 font-medium text-slate-600">W-shape</span>
    <select value={value} onChange={e => onChange(e.target.value)}
      className="rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-[#0056b3] focus:outline-none">
      {W_SHAPES.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
    </select>
  </label>
)

// ─── Beam Tab ─────────────────────────────────────────────────────────────

function BeamTab() {
  const [shapeName, setShapeName] = useState('W310x39')
  const [grade, setGrade]         = useState<Grade>('A572G50')
  const [span,  setSpan]          = useState(6)
  const [Lb,    setLb]            = useState(2)
  const [Cb,    setCb]            = useState(1.0)
  const [wD,    setWD]            = useState(15)
  const [wL,    setWL]            = useState(25)

  const { Fy } = GRADES[grade]
  const shape  = useMemo(() => shapeOrFirst(shapeName), [shapeName])
  const props  = useMemo(() => deriveWSection(shape), [shape])
  const flex   = useMemo(() => beamFlexure(shape, props, Fy, Lb * 1000, Cb), [shape, props, Fy, Lb, Cb])
  const shear  = useMemo(() => beamShear(shape, props, Fy), [shape, props, Fy])
  const loads  = useMemo(() => beamLoadingSimple({ wDead: wD, wLive: wL, L: span }, props.Ix), [wD, wL, span, props])

  const utilM = loads.Mu / flex.phiMn, utilV = loads.Vu / shear.phiVn

  const steps = useMemo((): SolutionStep[] => {
    const E = 200000
    return [
      {
        title: 'Factored loads (NSCP/AISC load combos)',
        lines: [
          { tex: `w_u = \\max(1.4 \\times ${sn1(wD)},\\; 1.2 \\times ${sn1(wD)} + 1.6 \\times ${sn1(wL)}) = ${sn1(loads.wu)}\\text{ kN/m}` },
          { tex: `M_u = \\frac{w_u L^2}{8} = \\frac{${sn1(loads.wu)} \\times ${sn1(span)}^2}{8} = ${sn1(loads.Mu)}\\text{ kN·m}` },
          { tex: `V_u = \\frac{w_u L}{2} = ${sn1(loads.Vu)}\\text{ kN}` },
        ],
      },
      {
        title: 'Compact section (Table B4.1b)',
        lines: [
          { tex: `\\lambda_f = \\frac{b_f}{2t_f} = \\frac{${shape.bf}}{2 \\times ${shape.tf}} = ${sn2(flex.lambdaF)}` },
          { tex: `\\lambda_{pf} = 0.38\\sqrt{E/F_y} = 0.38\\sqrt{${E}/${Fy}} = ${sn2(flex.lambdaPF)}\\quad ${flex.compactFlange ? '\\checkmark\\text{ compact}' : '\\text{non-compact}'}` },
          { tex: `\\lambda_w = h_w / t_w = ${sn1(props.hw)} / ${shape.tw} = ${sn1(flex.lambdaW)}\\quad \\lambda_{pw} = ${sn1(flex.lambdaPW)}\\quad ${flex.compactWeb ? '\\checkmark' : '\\times'}` },
        ],
      },
      {
        title: 'Flexural capacity §F2 — lateral-torsional buckling',
        lines: [
          { tex: `M_p = F_y Z_x = ${Fy} \\times ${(props.Zx / 1000).toFixed(0)} \\times 10^3\\text{ mm}^3 = ${sn1(flex.Mp)}\\text{ kN·m}` },
          { tex: `L_p = 1.76\\, r_y \\sqrt{E/F_y} = 1.76 \\times ${shape.ry} \\times \\sqrt{${E}/${Fy}} = ${sn1(flex.Lp)}\\text{ mm} = ${sn2(flex.Lp/1000)}\\text{ m}` },
          { tex: `L_r = ${sn1(flex.Lr)}\\text{ mm} = ${sn2(flex.Lr/1000)}\\text{ m}` },
          { text: `L_b = ${Lb} m → zone: ${flex.ltbZone.toUpperCase()}` },
          { tex: `M_n = ${sn1(flex.Mn)}\\text{ kN·m}\\quad \\phi M_n = 0.90 \\times ${sn1(flex.Mn)} = ${sn1(flex.phiMn)}\\text{ kN·m}` },
          { tex: `\\text{Utilisation} = \\frac{M_u}{\\phi M_n} = \\frac{${sn1(loads.Mu)}}{${sn1(flex.phiMn)}} = ${sn2(utilM)}\\quad ${utilM <= 1 ? '\\checkmark' : '\\times'}` },
        ],
      },
      {
        title: 'Shear capacity §G2.1',
        lines: [
          { tex: `A_w = d \\cdot t_w = ${shape.d} \\times ${shape.tw} = ${shear.Aw.toFixed(0)}\\text{ mm}^2` },
          { tex: `h/t_w = ${sn1(shear.hwTw)}\\quad 2.24\\sqrt{E/F_y} = ${sn1(2.24 * Math.sqrt(200000 / Fy))}\\quad C_{v1} = ${sn2(shear.Cv1)},\\; \\phi_v = ${shear.phiV}` },
          { tex: `\\phi V_n = \\phi_v \\cdot 0.6 F_y A_w C_{v1} = ${sn2(shear.phiVn)}\\text{ kN}` },
        ],
      },
      {
        title: 'Deflection (unfactored service loads)',
        lines: [
          { tex: `\\delta = \\frac{5wL^4}{384EI}` },
          { tex: `\\delta_L = ${sn2(loads.deltaL)}\\text{ mm}\\quad L/360 = ${sn2(loads.limL360)}\\text{ mm}\\quad ${loads.deltaL <= loads.limL360 ? '\\checkmark' : '\\times EXCEEDS'}` },
          { tex: `\\delta_{D+L} = ${sn2(loads.deltaD + loads.deltaL)}\\text{ mm}\\quad L/240 = ${sn2(loads.limL240)}\\text{ mm}\\quad ${loads.deltaD + loads.deltaL <= loads.limL240 ? '\\checkmark' : '\\times EXCEEDS'}` },
        ],
      },
    ]
  }, [shape, props, flex, shear, loads, Fy, wD, wL, span, Lb, utilM])

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <Card title="Section & grade">
          <ShapePick value={shapeName} onChange={setShapeName} />
          <Pick label="Steel grade" value={grade} onChange={v => setGrade(v as Grade)}
            options={Object.entries(GRADES).map(([k, v]) => [k as Grade, v.label])} />
        </Card>
        <Card title="Span & bracing">
          <Num label="Span L" unit="m" value={span} onChange={setSpan} />
          <Num label="Unbraced Lb" unit="m" value={Lb} onChange={setLb} />
          <Num label="Cb (moment gradient)" value={Cb} onChange={setCb} />
        </Card>
        <Card title="Uniform service loads">
          <Num label="Dead wD" unit="kN/m" value={wD} onChange={setWD} />
          <Num label="Live wL" unit="kN/m" value={wL} onChange={setWL} />
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Suspense fallback={<Spinner />}>
          <BeamViewer3D shape={shape} span={span} wDead={wD} wLive={wL} />
        </Suspense>

        <ResultCard title="Section properties">
          <Row label="A"  value={`${shape.A.toLocaleString()} mm²`} />
          <Row label="Ix" value={`${(props.Ix/1e6).toFixed(1)} ×10⁶ mm⁴`} />
          <Row label="Sx" value={`${(props.Sx/1e3).toFixed(0)} ×10³ mm³`} />
          <Row label="Zx" value={`${(props.Zx/1e3).toFixed(0)} ×10³ mm³`} />
          <Row label="Lp / Lr" value={`${f2(flex.Lp/1000)} / ${f2(flex.Lr/1000)} m`} />
        </ResultCard>
        <ResultCard title={`Flexure §F2 ${badge(flex.ltbZone)}`}>
          <Row label="φMn" value={`${f1(flex.phiMn)} kN·m`} />
          <Row alert={utilM>1} label="Mu / φMn" value={ok(utilM<=1, `${(utilM*100).toFixed(0)} %`)} />
        </ResultCard>
        <ResultCard title="Shear §G2.1">
          <Row label="φVn" value={`${f1(shear.phiVn)} kN`} sub={`Cv1=${shear.Cv1.toFixed(2)}`} />
          <Row alert={utilV>1} label="Vu / φVn" value={ok(utilV<=1, `${(utilV*100).toFixed(0)} %`)} />
        </ResultCard>
        <ResultCard title="Deflection">
          <Row alert={loads.deltaL>loads.limL360} label="δL ≤ L/360" value={ok(loads.deltaL<=loads.limL360, `${f2(loads.deltaL)} mm`)} />
          <Row alert={loads.deltaD+loads.deltaL>loads.limL240} label="δtotal ≤ L/240" value={ok(loads.deltaD+loads.deltaL<=loads.limL240, `${f2(loads.deltaD+loads.deltaL)} mm`)} />
        </ResultCard>
      </div>

      <div className="col-span-full">
        <WorkedSolution steps={steps} title="Beam Design — step-by-step (AISC 360-16 §F, §G)" />
      </div>
    </div>
  )
}

// ─── Column Tab ────────────────────────────────────────────────────────────

function ColumnTab() {
  const [shapeName, setShapeName] = useState('W250x67')
  const [grade, setGrade]         = useState<Grade>('A572G50')
  const [L,     setL]             = useState(4)
  const [Kx,    setKx]            = useState(1.0)
  const [Ky,    setKy]            = useState(1.0)
  const [dlMode, setDlMode]       = useState<'DL'|'direct'>('DL')
  const [dead,  setDead]          = useState(800)
  const [live,  setLive]          = useState(500)
  const [PuDir, setPuDir]         = useState(1944)
  const [Mux,   setMux]           = useState(80)
  const [Muy,   setMuy]           = useState(0)

  const { Fy } = GRADES[grade]
  const shape  = useMemo(() => shapeOrFirst(shapeName), [shapeName])
  const props  = useMemo(() => deriveWSection(shape), [shape])
  const Pu = dlMode === 'DL' ? Math.max(1.4*dead, 1.2*dead+1.6*live) : PuDir

  const axial  = useMemo(() => columnAxial(shape, Fy, L, Kx, Ky), [shape, Fy, L, Kx, Ky])
  const flexX  = useMemo(() => beamFlexure(shape, props, Fy, L*1000, 1.0), [shape, props, Fy, L])
  const flexY  = useMemo(() => weakAxisFlexure(shape, props, Fy), [shape, props, Fy])
  const comb   = useMemo(() => combinedLoading(Pu, axial.phiPn, Mux, flexX.phiMn, Muy, flexY.phiMny), [Pu, axial, Mux, flexX, Muy, flexY])

  const steps = useMemo((): SolutionStep[] => {
    const E = 200000
    return [
      {
        title: 'Factored axial load',
        lines: dlMode === 'DL' ? [
          { tex: `P_u = \\max(1.4D,\\;1.2D+1.6L) = \\max(${sn1(1.4*dead)},\\;${sn1(1.2*dead+1.6*live)}) = ${sn1(Pu)}\\text{ kN}` },
        ] : [{ tex: `P_u = ${sn1(Pu)}\\text{ kN (direct input)}` }],
      },
      {
        title: 'Slenderness and critical stress §E3',
        lines: [
          { tex: `KL/r_x = \\frac{${Kx}\\times${L*1000}}{${shape.rx}} = ${sn1(axial.slendernessX)}` },
          { tex: `KL/r_y = \\frac{${Ky}\\times${L*1000}}{${shape.ry}} = ${sn1(axial.slendernessY)}\\quad \\text{(governing = }${sn1(axial.slenderness)})` },
          { tex: `4.71\\sqrt{E/F_y} = 4.71\\sqrt{${E}/${Fy}} = ${sn1(4.71*Math.sqrt(E/Fy))}` },
          { tex: `F_{cr} = ${sn2(axial.Fcr)}\\text{ MPa}\\quad \\phi P_n = 0.90 \\times ${sn2(axial.Fcr)} \\times ${shape.A} / 1000 = ${sn1(axial.phiPn)}\\text{ kN}` },
        ],
        note: axial.slenderOK ? undefined : 'KL/r > 200 — slenderness exceeds §E2 advisory limit.',
      },
      {
        title: 'Flexural capacities',
        lines: [
          { tex: `\\phi M_{nx} = ${sn1(flexX.phiMn)}\\text{ kN·m}\\quad (\\text{${flexX.ltbZone} zone, §F2})` },
          { tex: `\\phi M_{ny} = 0.90 F_y Z_y = ${sn1(flexY.phiMny)}\\text{ kN·m}\\quad (\\text{§F6, weak-axis})` },
        ],
      },
      {
        title: `Combined loading §H1-1 (equation ${comb.equation})`,
        lines: comb.equation === 'H1-1a' ? [
          { tex: `P_u/\\phi P_n = ${sn3(Pu/axial.phiPn)} \\geq 0.2 \\Rightarrow \\text{use §H1-1a}` },
          { tex: `\\frac{P_u}{\\phi P_n} + \\frac{8}{9}\\!\\left(\\frac{M_{ux}}{\\phi M_{nx}} + \\frac{M_{uy}}{\\phi M_{ny}}\\right) = ${sn3(Pu/axial.phiPn)} + \\frac{8}{9}(${sn3(Mux/flexX.phiMn)} + ${sn3(Muy > 0 ? Muy/flexY.phiMny : 0)}) = ${sn3(comb.ratio)}\\quad${comb.ok?'\\checkmark':'\\times'}` },
        ] : [
          { tex: `P_u/\\phi P_n = ${sn3(Pu/axial.phiPn)} < 0.2 \\Rightarrow \\text{use §H1-1b}` },
          { tex: `\\frac{P_u}{2\\phi P_n} + \\left(\\frac{M_{ux}}{\\phi M_{nx}} + \\frac{M_{uy}}{\\phi M_{ny}}\\right) = ${sn3(comb.ratio)}\\quad${comb.ok?'\\checkmark':'\\times'}` },
        ],
      },
    ]
  }, [shape, axial, flexX, flexY, comb, Pu, Mux, Muy, Kx, Ky, L, Fy, dead, live, dlMode])

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <Card title="Section & grade">
          <ShapePick value={shapeName} onChange={setShapeName} />
          <Pick label="Steel grade" value={grade} onChange={v => setGrade(v as Grade)}
            options={Object.entries(GRADES).map(([k, v]) => [k as Grade, v.label])} />
        </Card>
        <Card title="Column geometry">
          <Num label="Height L" unit="m" value={L} onChange={setL} />
          <Num label="Kx" value={Kx} onChange={setKx} />
          <Num label="Ky" value={Ky} onChange={setKy} />
        </Card>
        <Card title="Loads">
          <Pick label="Axial input" value={dlMode} onChange={v => setDlMode(v as 'DL'|'direct')}
            options={[['DL','Service D & L'],['direct','Factored Pu']]} />
          {dlMode === 'DL' ? <>
            <Num label="Dead D" unit="kN" value={dead} onChange={setDead} />
            <Num label="Live L" unit="kN" value={live} onChange={setLive} />
          </> : <Num label="Pu" unit="kN" value={PuDir} onChange={setPuDir} />}
          <Num label="Mux (strong-axis)" unit="kN·m" value={Mux} onChange={setMux} />
          <Num label="Muy (weak-axis)" unit="kN·m" value={Muy} onChange={setMuy} />
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Suspense fallback={<Spinner />}>
          <ColumnViewer3D shape={shape} L={L} Pu={Pu} Mux={Mux} />
        </Suspense>
        <ResultCard title="Axial §E3">
          <Row label="KL/rx" value={f1(axial.slendernessX)} />
          <Row label="KL/ry" value={f1(axial.slendernessY)} sub="governing" />
          <Row alert={!axial.slenderOK} label="KL/r" value={`${f1(axial.slenderness)}${axial.slenderOK?'':' > 200 ✗'}`} />
          <Row label="Fcr" value={`${f1(axial.Fcr)} MPa`} />
          <Row label="φPn" value={`${f1(axial.phiPn)} kN`} />
        </ResultCard>
        <ResultCard title="Flexure">
          <Row label="φMnx" value={`${f1(flexX.phiMn)} kN·m`} sub={flexX.ltbZone} />
          <Row label="φMny §F6" value={`${f1(flexY.phiMny)} kN·m`} />
        </ResultCard>
        <ResultCard title={`Combined §${comb.equation}`}>
          <Row alert={!comb.ok} label="Combined ratio" value={ok(comb.ok, `${(comb.ratio*100).toFixed(0)} %`)} />
        </ResultCard>
      </div>

      <div className="col-span-full">
        <WorkedSolution steps={steps} title="Column Design — step-by-step (AISC 360-16 §E3, §H1-1)" />
      </div>
    </div>
  )
}

// ─── Connection Tab ─────────────────────────────────────────────────────────

function ConnectionTab() {
  const [connType,   setConnType]   = useState<ConnType>('bolt')
  const [Vu,         setVu]         = useState(150)
  const [Hu,         setHu]         = useState(0)
  // bolt layout
  const [boltGrade,  setBoltGrade]  = useState<BoltGrade>('A325M')
  const [db,         setDb]         = useState(20)
  const [nRows,      setNRows]      = useState(3)
  const [nCols,      setNCols]      = useState(1)
  const [sy,         setSy]         = useState(70)
  const [sx,         setSx]         = useState(70)
  const [ey,         setEy]         = useState(40)
  const [ex_edge,    setExEdge]     = useState(35)  // horizontal edge distance
  const [threads,    setThreads]    = useState<'yes'|'no'>('yes')
  const [tPlate,     setTPlate]     = useState(10)
  const [FuPlate,    setFuPlate]    = useState(400)
  const [FyPlate,    setFyPlate]    = useState(248)
  const [ex_load,    setExLoad]     = useState(0)   // in-plane eccentricity from bolt centroid
  const [ey_load,    setEyLoad]     = useState(0)
  const [e_out,      setEOut]       = useState(0)   // out-of-plane eccentricity (perpendicular to plate)
  // weld
  const [electrode,  setElectrode]  = useState<ElectrodeClass>('E70')
  const [wSize,      setWSize]      = useState(8)

  // bolt calcs
  const phiRnBolt = useMemo(() =>
    boltShear(boltGrade, db, Vu, tPlate, FuPlate, threads === 'yes'),
    [boltGrade, db, Vu, tPlate, FuPlate, threads]
  )
  const geom = useMemo(() =>
    boltGroupGeom(nRows, nCols, sx, sy, ex_edge, ey),
    [nRows, nCols, sx, sy, ex_edge, ey]
  )
  const eccentric = useMemo(() =>
    eccentricBoltGroup(geom, Vu, Hu, ex_load, ey_load, phiRnBolt.phiRn, db, tPlate),
    [geom, Vu, Hu, ex_load, ey_load, phiRnBolt, db, tPlate]
  )
  const outOfPlane = useMemo(() =>
    e_out > 0
      ? outOfPlaneBoltGroup(geom, eccentric.bolts, e_out, Vu, boltGrade, db, threads === 'yes')
      : null,
    [geom, eccentric.bolts, e_out, Vu, boltGrade, db, threads]
  )
  const blockShearCases = useMemo(() =>
    shearTabBlockShear(nRows, sy, ey, ey, ex_edge, db, tPlate, FyPlate, FuPlate),
    [nRows, sy, ey, ex_edge, db, tPlate, FyPlate, FuPlate]
  )
  const weld = useMemo(() => weldStrength(electrode, wSize, Vu), [electrode, wSize, Vu])
  const weldCapacity = useMemo(() => geom.plateH * weld.phiRnw, [geom, weld])

  const govBlockShear = blockShearCases.reduce((mn, c) => c.phiRn < mn.phiRn ? c : mn, blockShearCases[0])

  const boltSteps = useMemo((): SolutionStep[] => {
    const { Fnv, Ab, phiRn_shear, phiRn_bearing, phiRn } = phiRnBolt
    const { n, Ip } = geom
    const M = eccentric.M
    return [
      {
        title: `Bolt shear capacity §J3.6 — ${boltGrade}, d_b = ${db} mm`,
        lines: [
          { tex: `A_b = \\frac{\\pi}{4} d_b^2 = \\frac{\\pi}{4}(${db})^2 = ${Ab.toFixed(0)}\\text{ mm}^2` },
          { tex: `F_{nv} = ${Fnv}\\text{ MPa}\\quad (${threads==='yes'?'threads in shear plane, N':'threads excluded, X'})` },
          { tex: `\\phi R_{n,\\text{shear}} = 0.75 F_{nv} A_b = 0.75 \\times ${Fnv} \\times ${Ab.toFixed(0)} / 1000 = ${sn2(phiRn_shear)}\\text{ kN/bolt}` },
        ],
      },
      {
        title: `Bearing on plate §J3.10 — t = ${tPlate} mm, F_u = ${FuPlate} MPa`,
        lines: [
          { tex: `\\phi R_{n,\\text{br}} = 0.75 \\times 2.4 F_u d_b t = 0.75 \\times 2.4 \\times ${FuPlate} \\times ${db} \\times ${tPlate} / 1000 = ${sn2(phiRn_bearing)}\\text{ kN/bolt}` },
          { tex: `\\phi R_n\\text{ (governing)} = \\min(${sn2(phiRn_shear)},\\;${sn2(phiRn_bearing)}) = ${sn2(phiRn)}\\text{ kN/bolt}` },
        ],
      },
      {
        title: `Bolt group (${nRows} × ${nCols} = ${n} bolts) — in-plane eccentricity (elastic method)`,
        lines: [
          { tex: `I_p = \\sum(x_i^2 + y_i^2) = ${Ip.toFixed(0)}\\text{ mm}^2` },
          { tex: `M = V_u \\cdot e_x - H_u \\cdot e_y = ${Vu} \\times ${ex_load} - ${Hu} \\times ${ey_load} = ${M.toFixed(0)}\\text{ kN·mm}` },
          { text: `Direct shear per bolt: Vx = Hu/n = ${(Hu/n).toFixed(2)} kN,  Vy = Vu/n = ${(Vu/n).toFixed(2)} kN` },
          { tex: `V_{x,i} = H_u/n - M y_i / I_p\\quad V_{y,i} = V_u/n + M x_i / I_p` },
          { tex: `R_{\\max} = ${sn2(eccentric.Rmax)}\\text{ kN on bolt }\\textit{${eccentric.critical}}` },
          { tex: `\\text{Utilisation} = R_{\\max} / (\\phi R_n) = ${sn2(eccentric.Rmax)} / ${sn2(phiRn)} = ${sn2(eccentric.Rmax/phiRn)}\\quad ${eccentric.Rmax<=phiRn?'\\checkmark':'\\times'}` },
        ],
      },
      {
        title: 'Bearing stress and shear stress on critical bolt',
        lines: (() => {
          const crit = eccentric.bolts.find(b => b.id === eccentric.critical)
          if (!crit) return []
          const Ab = (Math.PI/4)*db*db
          return [
            { tex: `f_{br} = \\frac{R_{\\max}}{d_b \\cdot t} = \\frac{${sn2(eccentric.Rmax)} \\times 1000}{${db} \\times ${tPlate}} = ${sn1(crit.fbr)}\\text{ MPa}\\quad \\phi F_{br} = 0.75 \\times 2.4 \\times ${FuPlate} = ${sn1(0.75*2.4*FuPlate)}\\text{ MPa}\\quad ${crit.fbr <= 0.75*2.4*FuPlate ? '\\checkmark':'\\times'}` },
            { tex: `f_v = \\frac{R_{\\max}}{A_b} = \\frac{${sn2(eccentric.Rmax)} \\times 1000}{${Ab.toFixed(0)}} = ${sn1(crit.fv)}\\text{ MPa}\\quad \\phi F_{nv} = 0.75 \\times ${Fnv} = ${sn1(0.75*Fnv)}\\text{ MPa}\\quad ${crit.fv <= 0.75*Fnv ? '\\checkmark':'\\times'}` },
          ]
        })(),
      },
      ...(outOfPlane ? [{
        title: `Out-of-plane eccentricity §J3.7 — e_out = ${e_out} mm`,
        lines: [
          { tex: `M_{op} = V_u \\cdot e_{out} = ${Vu} \\times ${e_out} = ${outOfPlane.M_op.toFixed(0)}\\text{ kN·mm}` },
          { tex: `\\text{Neutral axis at bottom bolt. }\\sum y_i^2 = ${outOfPlane.sumYi2.toFixed(0)}\\text{ mm}^2` },
          { tex: `T_i = \\frac{M_{op} \\cdot y_i}{\\sum y_i^2}\\quad (y_i \\text{ measured from lowest bolt})` },
          { tex: `T_{\\max} = ${f2(outOfPlane.Tmax)}\\text{ kN on bolt }\\textit{${outOfPlane.critical}}` },
          { tex: `\\text{AISC Table J3.2: } F_{nt} = ${outOfPlane.Fnt}\\text{ MPa},\\; F_{nv} = ${outOfPlane.Fnv}\\text{ MPa}` },
          { tex: `\\phi F_{nt}' = \\min\\!\\left(1.3 F_{nt} - \\frac{F_{nt}}{\\phi F_{nv}} f_{rv},\\; F_{nt}\\right) \\geq 0\\quad \\S J3.7` },
          { tex: `\\phi T_n = \\phi F_{nt}' A_b / 1000 = ${f2(outOfPlane.phiTn_crit)}\\text{ kN/bolt}` },
          { tex: `\\text{Utilisation} = T_{\\max} / (\\phi T_n) = ${(outOfPlane.Tmax / outOfPlane.phiTn_crit * 100).toFixed(0)}\\%\\quad ${outOfPlane.ok ? '\\checkmark' : '\\times'}` },
        ],
      }] : []),
      {
        title: 'Block shear §J4.3 (shear tab, single bolt line)',
        lines: blockShearCases.flatMap(c => [
          { text: c.label },
          { tex: `A_{gv} = ${c.Agv.toFixed(0)}\\text{ mm}^2\\quad A_{nv} = ${c.Anv.toFixed(0)}\\text{ mm}^2\\quad A_{nt} = ${c.Ant.toFixed(0)}\\text{ mm}^2` },
          { tex: `R_{n,\\text{fract}} = 0.6 F_u A_{nv} + U_{bs} F_u A_{nt} = ${sn1(c.Rn_fract)}\\text{ kN}` },
          { tex: `\\text{cap } = 0.6 F_y A_{gv} + U_{bs} F_u A_{nt} = ${sn1(c.Rn_cap)}\\text{ kN}` },
          { tex: `\\phi R_n = 0.75 \\times ${sn1(Math.min(c.Rn_fract,c.Rn_cap))} = ${sn1(c.phiRn)}\\text{ kN}\\quad ${Vu<=c.phiRn?'\\checkmark':'\\times'}` },
        ]),
      },
    ]
  }, [phiRnBolt, geom, eccentric, outOfPlane, blockShearCases, boltGrade, db, nRows, nCols, tPlate, FuPlate, FyPlate, threads, Vu, Hu, ex_load, ey_load, e_out])

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.9fr_1fr]">
      {/* ── inputs ── */}
      <div className="space-y-5">
        <Card title="Connection">
          <Pick label="Type" value={connType} onChange={v => setConnType(v as ConnType)}
            options={[['bolt','Bolted (§J3)'],['weld','Fillet weld (§J2.4)']]} />
          <Num label="Applied Vu" unit="kN" value={Vu} onChange={setVu} />
          <Num label="Applied Hu (horizontal)" unit="kN" value={Hu} onChange={setHu} />
        </Card>

        {connType === 'bolt' ? (<>
          <Card title="Bolt properties">
            <Pick label="Grade" value={boltGrade} onChange={v => setBoltGrade(v as BoltGrade)}
              options={[['A325M','A325M (F10T)'],['A490M','A490M (F13T)']]} />
            <Num label="Diameter db" unit="mm" value={db} onChange={setDb} />
            <Pick label="Threads in shear plane" value={threads} onChange={v => setThreads(v as 'yes'|'no')}
              options={[['yes','Yes (N)'],['no','No (X)']]} />
          </Card>
          <Card title="Bolt pattern">
            <Num label="Rows (vertical) nR" value={nRows} onChange={setNRows} />
            <Num label="Cols (horizontal) nC" value={nCols} onChange={setNCols} />
            <Num label="Vertical spacing sv" unit="mm" value={sy} onChange={setSy} />
            <Num label="Horizontal spacing sh" unit="mm" value={sx} onChange={setSx} />
            <Num label="Edge dist vertical ey" unit="mm" value={ey} onChange={setEy} />
            <Num label="Edge dist horiz ex" unit="mm" value={ex_edge} onChange={setExEdge} />
          </Card>
          <Card title="Eccentricity (load point from bolt centroid)">
            <Num label="In-plane e_x" unit="mm" value={ex_load} onChange={setExLoad} />
            <Num label="In-plane e_y" unit="mm" value={ey_load} onChange={setEyLoad} />
            <Num label="Out-of-plane e_out" unit="mm" value={e_out} onChange={setEOut} />
            <p className="col-span-full text-[10px] text-slate-400">
              e_x/e_y: in-plane offset (→ moment in bolt group plane, §J3.6/elastic method).{' '}
              e_out: perpendicular distance from plate face to load (→ bolt tension + §J3.7 interaction).
            </p>
          </Card>
          <Card title="Plate / connected part">
            <Num label="Plate thickness t" unit="mm" value={tPlate} onChange={setTPlate} />
            <Num label="Plate Fy" unit="MPa" value={FyPlate} onChange={setFyPlate} />
            <Num label="Plate Fu" unit="MPa" value={FuPlate} onChange={setFuPlate} />
          </Card>
        </>) : (
          <Card title="Fillet weld">
            <Pick label="Electrode" value={electrode} onChange={v => setElectrode(v as ElectrodeClass)}
              options={[['E70','E70XX (482 MPa)'],['E80','E80XX (550 MPa)'],['E90','E90XX (620 MPa)'],['E100','E100XX (690 MPa)']]} />
            <Num label="Weld size w" unit="mm" value={wSize} onChange={setWSize} />
            <Card title="Plate (for weld group geometry)">
              <Num label="Rows nR (for length)" value={nRows} onChange={setNRows} />
              <Num label="Vert spacing sv" unit="mm" value={sy} onChange={setSy} />
              <Num label="Edge dist ey" unit="mm" value={ey} onChange={setEy} />
            </Card>
          </Card>
        )}
      </div>

      {/* ── 2D drawing + 3D ── */}
      <div className="space-y-4">
        <ConnectionDrawing
          geom={geom} db={db}
          boltForces={connType === 'bolt' ? eccentric.bolts : undefined}
          critical={connType === 'bolt' ? eccentric.critical : undefined}
          Vu={Vu} Hu={Hu} ex_load={geom.Cx + ex_load} ey_load={geom.Cy + ey_load}
          connType={connType}
        />
        <Suspense fallback={<Spinner />}>
          <ConnectionViewer3D geom={geom} db={db} t_plate={tPlate} critical={connType === 'bolt' ? eccentric.critical : ''} />
        </Suspense>
      </div>

      {/* ── results ── */}
      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        {connType === 'bolt' ? (<>
          <ResultCard title="Bolt capacity / bolt">
            <Row label="φRn shear" value={`${f2(phiRnBolt.phiRn_shear)} kN`} />
            <Row label="φRn bearing" value={`${f2(phiRnBolt.phiRn_bearing)} kN`} />
            <Row label="φRn governing" value={<b>{f2(phiRnBolt.phiRn)} kN</b>} />
          </ResultCard>
          <ResultCard title={`Eccentric group (${geom.n} bolts)`}>
            <Row label="Ip" value={`${geom.Ip.toFixed(0)} mm²`} />
            <Row label="In-plane M" value={`${eccentric.M.toFixed(0)} kN·mm`} />
            <Row label="Critical bolt" value={eccentric.critical} sub={`R = ${f2(eccentric.Rmax)} kN`} />
            <Row alert={eccentric.Rmax > phiRnBolt.phiRn}
              label="Rmax / φRn"
              value={ok(eccentric.Rmax <= phiRnBolt.phiRn, `${(eccentric.Rmax/phiRnBolt.phiRn*100).toFixed(0)} %`)} />
          </ResultCard>
          <ResultCard title="Per-bolt forces">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-400">
                  <th className="pr-2 pb-1">id</th><th className="pr-2 pb-1">Vx kN</th><th className="pr-2 pb-1">Vy kN</th>
                  <th className="pr-2 pb-1">R kN</th><th className="pb-1">fbr MPa</th>
                </tr></thead>
                <tbody>
                  {eccentric.bolts.map(b => (
                    <tr key={b.id} className={b.id === eccentric.critical ? 'font-semibold text-amber-700' : ''}>
                      <td className="pr-2">{b.id}</td>
                      <td className="pr-2">{f2(b.Vx)}</td>
                      <td className="pr-2">{f2(b.Vy)}</td>
                      <td className="pr-2">{f2(b.R)}</td>
                      <td>{f1(b.fbr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ResultCard>
          <ResultCard title="Block shear §J4.3">
            {blockShearCases.map(c => (
              <Row key={c.label} alert={Vu > c.phiRn}
                label={<span className="text-[10px]">{c.label.replace('§J4.3 ', '')}</span>}
                value={ok(Vu <= c.phiRn, `φRn = ${f1(c.phiRn)} kN`)} />
            ))}
            <Row alert={Vu > govBlockShear.phiRn}
              label="Governing block shear"
              value={ok(Vu <= govBlockShear.phiRn, `${f1(govBlockShear.phiRn)} kN`)} />
          </ResultCard>

          {outOfPlane && (
            <ResultCard title="Out-of-plane eccentricity §J3.7">
              <Row label="M_op = Vu·e_out" value={`${outOfPlane.M_op.toFixed(0)} kN·mm`} />
              <Row label="Σyi²" value={`${outOfPlane.sumYi2.toFixed(0)} mm²`} />
              <Row label="Critical bolt (max T)" value={outOfPlane.critical}
                sub={`T = ${f2(outOfPlane.Tmax)} kN`} />
              <Row label="φTn (reduced)" value={`${f2(outOfPlane.phiTn_crit)} kN`}
                sub={`φFnt' = ${outOfPlane.bolts.find(b=>b.id===outOfPlane.critical)?.phiFnt_prime.toFixed(0)} MPa`} />
              <Row alert={!outOfPlane.ok}
                label="Combined check (§J3.7)"
                value={ok(outOfPlane.ok, outOfPlane.ok ? 'PASS' : 'FAIL')} />
              <div className="col-span-full overflow-x-auto">
                <table className="mt-1 w-full text-xs">
                  <thead><tr className="text-left text-slate-400">
                    <th className="pr-2 pb-1">id</th>
                    <th className="pr-2 pb-1">yi mm</th>
                    <th className="pr-2 pb-1">T kN</th>
                    <th className="pr-2 pb-1">frv MPa</th>
                    <th className="pb-1">util</th>
                  </tr></thead>
                  <tbody>
                    {outOfPlane.bolts.map(b => (
                      <tr key={b.id} className={b.id === outOfPlane.critical ? 'font-semibold text-amber-700' : ''}>
                        <td className="pr-2">{b.id}</td>
                        <td className="pr-2">{b.yi.toFixed(0)}</td>
                        <td className="pr-2">{f2(b.T)}</td>
                        <td className="pr-2">{f1(b.frv)}</td>
                        <td className={b.util > 1 ? 'text-red-600' : ''}>{(b.util*100).toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ResultCard>
          )}
        </>) : (
          <ResultCard title="Fillet weld §J2.4">
            <Row label="φRnw / mm" value={`${f3(weld.phiRnw)} kN/mm`} />
            <Row label="Required length" value={`${f1(weld.L_reqd)} mm`} sub={`plate H = ${f1(geom.plateH)} mm`} />
            <Row alert={Vu > weldCapacity}
              label="Vu vs capacity"
              value={ok(Vu <= weldCapacity, `${f1(weldCapacity)} kN`)}
              sub={`2 × ${geom.plateH.toFixed(0)} mm` } />
          </ResultCard>
        )}
      </div>

      {connType === 'bolt' && (
        <div className="col-span-full">
          <WorkedSolution steps={boltSteps} title="Connection Design — step-by-step (AISC 360-16 §J3, §J4)" />
        </div>
      )}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function SteelDesign() {
  const [tab, setTab] = useState<Tab>('beam')
  const tabBtn = (t: Tab, label: string) => (
    <button type="button" onClick={() => setTab(t)}
      className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${tab === t ? 'bg-[#0056b3] text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}>
      {label}
    </button>
  )
  return (
    <div className="mx-auto max-w-7xl p-6">
      <Link to="/" className="no-print text-sm text-[#0056b3] hover:underline">← Home</Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0056b3]">Steel Design</h1>
      <p className="no-print mt-1 text-slate-600">
        AISC 360-16 LRFD — beams (§F/G + deflections), columns (§E3 + §H1-1), connections
        (bolt group with in-plane eccentricity, bearing/shear stresses, block shear §J4.3;
        fillet welds §J2.4). 3D scene + 2D layout + step-by-step solution on every tab.
      </p>
      <ReportControls title="Steel Design Report" />
      <div className="no-print mt-5 mb-6 flex gap-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm w-fit">
        {tabBtn('beam',       'Beam')}
        {tabBtn('column',     'Column')}
        {tabBtn('connection', 'Connection')}
      </div>
      <div className="mt-2">
        {tab === 'beam'       && <BeamTab />}
        {tab === 'column'     && <ColumnTab />}
        {tab === 'connection' && <ConnectionTab />}
      </div>
    </div>
  )
}
