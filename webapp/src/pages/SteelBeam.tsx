import { lazy, Suspense, useMemo, useState } from 'react'
// type-only imports — no engine code bundled into the browser from here
import { calcBeam } from '../lib/calcApi'
import type { BeamCalcResult } from '../lib/calcApi'
import { useCalcResult } from '../lib/useCalcResult'
import { Num, Pick, Card, ResultCard, Row } from '../components/qty'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { f1, f2 } from '../lib/format'
import { sn1, sn2 } from '../lib/solution'
import { PageHeader } from '../components/calc'
import { ShapePick, CalcBadge, Spinner, Verdict, ZoneBadge, BasisPick, BasisNote } from '../components/steelUi'
import { capacityLabel, demandLabel, factorLabel, comboLabel, SAFETY, type DesignBasis } from '../engine/designBasis'
import { GRADES, shapeOrFirst, type Grade } from '../lib/steelShapes'

const BeamViewer3D = lazy(() => import('../components/SteelViewer3D').then(m => ({ default: m.BeamViewer3D })))

function BeamTab() {
  const [shapeName, setShapeName] = useState('W310x38.7')
  const [grade, setGrade]         = useState<Grade>('A572G50')
  const [span,  setSpan]          = useState(6)
  const [Lb,    setLb]            = useState(2)
  const [Cb,    setCb]            = useState(1.0)
  const [wD,    setWD]            = useState(15)
  const [wL,    setWL]            = useState(25)

  const { Fy } = GRADES[grade]
  // Shape geometry stays client-side: needed by 3D viewer and section dimensions in steps.
  const shape = useMemo(() => shapeOrFirst(shapeName), [shapeName])

  const [basis, setBasis] = useState<DesignBasis>('LRFD')

  const input = useMemo(
    () => ({ shapeName, Fy, span, Lb, Cb, wDead: wD, wLive: wL, basis }),
    [shapeName, Fy, span, Lb, Cb, wD, wL, basis]
  )
  const { data: res, loading, error } = useCalcResult<BeamCalcResult>(
    () => calcBeam(input), [input]
  )

  // Against the AVAILABLE strength on the chosen basis, never the phi one:
  // the demand above is factored under LRFD and service under ASD, so the two
  // sides have to come from the same basis or the ratio is meaningless.
  const utilM = res ? res.loads.Mu / res.avail.Mn : 0
  const utilV = res ? res.loads.Vu / res.avail.Vn : 0
  const shearLS = res?.shear.slenderWeb ? 'shearSlender' as const : 'shearRolled' as const

  const steps = useMemo((): SolutionStep[] => {
    if (!res) return []
    const { props, flex, shear, loads } = res
    const E = 200000
    return [
      {
        title: res.basis === 'LRFD'
          ? 'Required strength — factored loads (NSCP/AISC LRFD combos)'
          : 'Required strength — service loads (ASD combination)',
        lines: [
          { text: `Load combination: ${comboLabel(res.basis)}.` },
          { tex: res.basis === 'LRFD'
              ? `w_u = \\max(1.4 \\times ${sn1(wD)},\\; 1.2 \\times ${sn1(wD)} + 1.6 \\times ${sn1(wL)}) = ${sn1(loads.wu)}\\text{ kN/m}`
              : `w_a = ${sn1(wD)} + ${sn1(wL)} = ${sn1(loads.wu)}\\text{ kN/m}` },
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
          { tex: res.basis === 'LRFD'
              ? `M_n = ${sn1(flex.Mn)}\\text{ kN·m}\\quad \\phi M_n = ${SAFETY.flexure.phi.toFixed(2)} \\times ${sn1(flex.Mn)} = ${sn1(res.avail.Mn)}\\text{ kN·m}`
              : `M_n = ${sn1(flex.Mn)}\\text{ kN·m}\\quad \\frac{M_n}{\\Omega_b} = \\frac{${sn1(flex.Mn)}}{${SAFETY.flexure.omega.toFixed(2)}} = ${sn1(res.avail.Mn)}\\text{ kN·m}` },
          { tex: `\\text{Utilisation} = ${sn1(loads.Mu)} / ${sn1(res.avail.Mn)} = ${sn2(utilM)}\\quad ${utilM <= 1 ? '\\checkmark' : '\\times'}` },
        ],
      },
      {
        title: 'Shear capacity §G2.1',
        lines: [
          { tex: `A_w = d \\cdot t_w = ${shape.d} \\times ${shape.tw} = ${shear.Aw.toFixed(0)}\\text{ mm}^2` },
          { tex: `h/t_w = ${sn1(shear.hwTw)}\\quad 2.24\\sqrt{E/F_y} = ${sn1(2.24 * Math.sqrt(200000 / Fy))}\\quad C_{v1} = ${sn2(shear.Cv1)},\\; \\phi_v = ${shear.phiV}` },
          { tex: `V_n = 0.6 F_y A_w C_{v1} = ${sn2(shear.Vn)}\\text{ kN}\\quad\\Rightarrow\\quad ${res.basis === 'LRFD' ? '\\phi V_n' : 'V_n/\\Omega_v'} = ${sn2(res.avail.Vn)}\\text{ kN}\\quad(${factorLabel(res.basis, shearLS)})` },
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
  }, [res, shape, Fy, wD, wL, span, Lb, utilM, shearLS])

  return (
    <div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <Card title={<>Section & grade<CalcBadge loading={loading} error={error} /></>}>
          <ShapePick value={shapeName} onChange={setShapeName} />
          <BasisPick value={basis} onChange={setBasis} />
          <BasisNote basis={basis} />
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

      <div className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
        <Suspense fallback={<Spinner />}>
          <BeamViewer3D shape={shape} span={span} wDead={wD} wLive={wL} />
        </Suspense>

        {res && (<>
          <ResultCard title="Section properties">
            <Row label="A"  value={`${shape.A.toLocaleString()} mm²`} />
            <Row label="Ix" value={`${(res.props.Ix/1e6).toFixed(1)} ×10⁶ mm⁴`} />
            <Row label="Sx" value={`${(res.props.Sx/1e3).toFixed(0)} ×10³ mm³`} />
            <Row label="Zx" value={`${(res.props.Zx/1e3).toFixed(0)} ×10³ mm³`} />
            <Row label="Lp / Lr" value={`${f2(res.flex.Lp/1000)} / ${f2(res.flex.Lr/1000)} m`} />
          </ResultCard>
          <ResultCard title={<>Flexure §F2 <ZoneBadge zone={res.flex.ltbZone} /></>}>
            <Row label={capacityLabel(res.basis, 'M')} value={`${f1(res.avail.Mn)} kN·m`}
              sub={`Mn = ${f1(res.flex.Mn)} · ${factorLabel(res.basis, 'flexure')}`} />
            <Row alert={utilM>1} label={`${demandLabel(res.basis, 'M')} / ${capacityLabel(res.basis, 'M')}`}
              value={<Verdict pass={utilM<=1} value={`${(utilM*100).toFixed(0)} %`} />} />
          </ResultCard>
          <ResultCard title="Shear §G2.1">
            <Row label={capacityLabel(res.basis, 'V')} value={`${f1(res.avail.Vn)} kN`}
              sub={`Cv1=${res.shear.Cv1.toFixed(2)} · ${factorLabel(res.basis, shearLS)}`} />
            <Row alert={utilV>1} label={`${demandLabel(res.basis, 'V')} / ${capacityLabel(res.basis, 'V')}`}
              value={<Verdict pass={utilV<=1} value={`${(utilV*100).toFixed(0)} %`} />} />
          </ResultCard>
          <ResultCard title="Deflection">
            <Row alert={res.loads.deltaL>res.loads.limL360} label="δL ≤ L/360" value={<Verdict pass={res.loads.deltaL<=res.loads.limL360} value={`${f2(res.loads.deltaL)} mm`} />} />
            <Row alert={res.loads.deltaD+res.loads.deltaL>res.loads.limL240} label="δtotal ≤ L/240" value={<Verdict pass={res.loads.deltaD+res.loads.deltaL<=res.loads.limL240} value={`${f2(res.loads.deltaD+res.loads.deltaL)} mm`} />} />
          </ResultCard>
        </>)}
      </div>

      </div>

      {res && (
        <div>
          <WorkedSolution steps={steps} title="Beam Design — step-by-step (AISC 360-16 §F, §G)" />
        </div>
      )}
    </div>
  )
}

export default function SteelBeam() {
  return (
    <div>
      <PageHeader title="Steel Beam Design" badges={['AISC 360-16']} />
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <p className="no-print mt-1 text-slate-600">AISC 360-16 §F2 flexure with lateral-torsional buckling, §G2.1 shear, and service deflections against L/360 and L/240. 3D scene and a step-by-step solution.</p>
        <ReportControls title="Steel Beam Design Report" />
        <div className="mt-5">
          <BeamTab />
        </div>
      </div>
    </div>
  )
}
