import { lazy, Suspense, useMemo, useState } from 'react'
// type-only imports — no engine code bundled into the browser from here
import { calcColumn } from '../lib/calcApi'
import type { ColumnCalcResult } from '../lib/calcApi'
import { useCalcResult } from '../lib/useCalcResult'
import { Num, Pick, Card, ResultCard, Row } from '../components/qty'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { f1 } from '../lib/format'
import { sn1, sn2, sn3 } from '../lib/solution'
import { PageHeader } from '../components/calc'
import { ShapePick, CalcBadge, Spinner, Verdict } from '../components/steelUi'
import { GRADES, shapeOrFirst, type Grade } from '../lib/steelShapes'

const ColumnViewer3D = lazy(() => import('../components/SteelViewer3D').then(m => ({ default: m.ColumnViewer3D })))

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
  // Factor axial demand client-side (trivial arithmetic, not proprietary)
  const Pu     = dlMode === 'DL' ? Math.max(1.4*dead, 1.2*dead+1.6*live) : PuDir

  const input = useMemo(
    () => ({ shapeName, Fy, L, Kx, Ky, Pu, Mux, Muy }),
    [shapeName, Fy, L, Kx, Ky, Pu, Mux, Muy]
  )
  const { data: res, loading, error } = useCalcResult<ColumnCalcResult>(
    () => calcColumn(input), [input]
  )

  const steps = useMemo((): SolutionStep[] => {
    if (!res) return []
    const { axial, flexX, weak, comb } = res
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
          { tex: `\\phi M_{ny} = 0.90 F_y Z_y = ${sn1(weak.phiMny)}\\text{ kN·m}\\quad (\\text{§F6, weak-axis})` },
        ],
      },
      {
        title: `Combined loading §H1-1 (equation ${comb.equation})`,
        lines: comb.equation === 'H1-1a' ? [
          { tex: `P_u/\\phi P_n = ${sn3(Pu/axial.phiPn)} \\geq 0.2 \\Rightarrow \\text{use §H1-1a}` },
          { tex: `\\frac{P_u}{\\phi P_n} + \\frac{8}{9}\\!\\left(\\frac{M_{ux}}{\\phi M_{nx}} + \\frac{M_{uy}}{\\phi M_{ny}}\\right) = ${sn3(Pu/axial.phiPn)} + \\frac{8}{9}(${sn3(Mux/flexX.phiMn)} + ${sn3(Muy > 0 ? Muy/weak.phiMny : 0)}) = ${sn3(comb.ratio)}\\quad${comb.ok?'\\checkmark':'\\times'}` },
        ] : [
          { tex: `P_u/\\phi P_n = ${sn3(Pu/axial.phiPn)} < 0.2 \\Rightarrow \\text{use §H1-1b}` },
          { tex: `\\frac{P_u}{2\\phi P_n} + \\left(\\frac{M_{ux}}{\\phi M_{nx}} + \\frac{M_{uy}}{\\phi M_{ny}}\\right) = ${sn3(comb.ratio)}\\quad${comb.ok?'\\checkmark':'\\times'}` },
        ],
      },
    ]
  }, [res, shape, Pu, Mux, Muy, Kx, Ky, L, Fy, dead, live, dlMode])

  return (
    <div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <Card title={<>Section & grade<CalcBadge loading={loading} error={error} /></>}>
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

      <div className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
        <Suspense fallback={<Spinner />}>
          <ColumnViewer3D shape={shape} L={L} Pu={Pu} Mux={Mux} />
        </Suspense>
        {res && (<>
          <ResultCard title="Axial §E3">
            <Row label="KL/rx" value={f1(res.axial.slendernessX)} />
            <Row label="KL/ry" value={f1(res.axial.slendernessY)} sub="governing" />
            <Row alert={!res.axial.slenderOK} label="KL/r" value={`${f1(res.axial.slenderness)}${res.axial.slenderOK?'':' > 200 ✗'}`} />
            <Row label="Fcr" value={`${f1(res.axial.Fcr)} MPa`} />
            <Row label="φPn" value={`${f1(res.axial.phiPn)} kN`} />
          </ResultCard>
          <ResultCard title="Flexure">
            <Row label="φMnx" value={`${f1(res.flexX.phiMn)} kN·m`} sub={res.flexX.ltbZone} />
            <Row label="φMny §F6" value={`${f1(res.weak.phiMny)} kN·m`} />
          </ResultCard>
          <ResultCard title={`Combined §${res.comb.equation}`}>
            <Row alert={!res.comb.ok} label="Combined ratio" value={<Verdict pass={res.comb.ok} value={`${(res.comb.ratio*100).toFixed(0)} %`} />} />
          </ResultCard>
        </>)}
      </div>

      </div>

      {res && (
        <div>
          <WorkedSolution steps={steps} title="Column Design — step-by-step (AISC 360-16 §E3, §H1-1)" />
        </div>
      )}
    </div>
  )
}

export default function SteelColumn() {
  return (
    <div>
      <PageHeader title="Steel Column Design" badges={['AISC 360-16 LRFD']} />
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <p className="no-print mt-1 text-slate-600">AISC 360-16 §E3 flexural buckling, weak-axis flexure, and the §H1-1 combined axial-plus-bending interaction. 3D scene and a step-by-step solution.</p>
        <ReportControls title="Steel Column Design Report" />
        <div className="mt-5">
          <ColumnTab />
        </div>
      </div>
    </div>
  )
}
