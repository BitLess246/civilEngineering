import { lazy, Suspense, useMemo, useState } from 'react'
// type-only imports — no engine code bundled into the browser from here
import { calcBeam } from '../lib/calcApi'
import type { BeamCalcResult } from '../lib/calcApi'
import { useCalcResult } from '../lib/useCalcResult'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import type { SolutionStep } from '../lib/solution'
import { f1, f2 } from '../lib/format'
import { sn1, sn2 } from '../lib/solution'
import { ModelMemberResults } from '../components/ModelMemberResults'
import { backSolvedServiceLoads, type MemberLoadRequest } from '../lib/modelMemberResults'
import { ShapePick, CalcBadge, TrialWall, Spinner, BasisPick, BasisNote } from '../components/steelUi'
import { WShapeSection, SteelBeamElevation } from '../components/steelSketches'
import { capacityLabel, demandLabel, factorLabel, comboLabel, SAFETY, type DesignBasis } from '../engine/designBasis'
import { GRADES, shapeOrFirst, type Grade } from '../lib/steelShapes'

const BeamViewer3D = lazy(() => import('../components/SteelViewer3D').then(m => ({ default: m.BeamViewer3D })))

export default function SteelBeam() {
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
  const { data: res, loading, error, cause } = useCalcResult<BeamCalcResult>(
    // No debounce: the steel calculators are cheap and the 250 ms default
    // just held the answer back a quarter of a second behind every
    // keystroke, with a "computing…" badge sitting where the number
    // should be. 0 still defers to a task, so a burst of synchronous
    // changes coalesces into one call.
    () => calcBeam(input), [input], 0,
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
        title: 'Section classification (Table B4.1b)',
        lines: [
          { tex: `\\lambda_f = \\frac{b_f}{2t_f} = \\frac{${shape.bf}}{2 \\times ${shape.tf}} = ${sn2(flex.lambdaF)}` },
          { tex: `\\lambda_{pf} = 0.38\\sqrt{E/F_y} = ${sn2(flex.lambdaPF)}\\quad \\lambda_{rf} = 1.0\\sqrt{E/F_y} = ${sn2(flex.lambdaRF)}\\quad \\Rightarrow\\ \\text{${flex.flangeClass} flange}` },
          { tex: `\\lambda_w = h_w / t_w = ${sn1(props.hw)} / ${shape.tw} = ${sn1(flex.lambdaW)}\\quad \\lambda_{pw} = ${sn1(flex.lambdaPW)}\\quad \\lambda_{rw} = ${sn1(flex.lambdaRW)}\\quad \\Rightarrow\\ \\text{${flex.webClass} web}` },
          { text: flex.applicable
              ? `Compact web + ${flex.flangeClass} flange → §${flex.clause} governs the flexural strength.`
              : `Out of scope: ${flex.reason}` },
        ],
      },
      {
        title: `Flexural capacity §${flex.clause} — lateral-torsional buckling${flex.flangeClass === 'compact' ? '' : ' + flange local buckling'}`,
        lines: [
          { tex: `M_p = F_y Z_x = ${Fy} \\times ${(props.Zx / 1000).toFixed(0)} \\times 10^3\\text{ mm}^3 = ${sn1(flex.Mp)}\\text{ kN·m}` },
          { tex: `L_p = 1.76\\, r_y \\sqrt{E/F_y} = 1.76 \\times ${shape.ry} \\times \\sqrt{${E}/${Fy}} = ${sn1(flex.Lp)}\\text{ mm} = ${sn2(flex.Lp/1000)}\\text{ m}` },
          { tex: `L_r = ${sn1(flex.Lr)}\\text{ mm} = ${sn2(flex.Lr/1000)}\\text{ m}` },
          { text: `L_b = ${Lb} m → zone: ${flex.ltbZone.toUpperCase()}` },
          { text: `M_n(LTB) = ${sn1(flex.MnLTB)} kN·m` },
          // §F3.2: a noncompact or slender flange buckles locally before the
          // section can reach Mp, so §F2 alone would overstate the capacity.
          ...(flex.flangeClass === 'compact' ? [] : [{
            tex: flex.flangeClass === 'noncompact'
              ? `M_n(FLB) = M_p - (M_p - 0.7F_yS_x)\\frac{\\lambda_f - \\lambda_{pf}}{\\lambda_{rf} - \\lambda_{pf}} = ${sn1(flex.MnFLB)}\\text{ kN·m}\\quad(\\S F3\\text{-}1)`
              : `M_n(FLB) = \\frac{0.9Ek_cS_x}{\\lambda_f^2},\\ k_c = ${sn2(flex.kc)} \\Rightarrow ${sn1(flex.MnFLB)}\\text{ kN·m}\\quad(\\S F3\\text{-}2)`,
          }]),
          { text: `Governing limit state: ${flex.governing}.` },
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

  /** Saved-model girder → the page's own fields. Shape, span, unbraced length
   *  and grade are the schedule's own facts; the service line loads are
   *  back-solved from the saved factored Mu over a simple span at this page's
   *  default 15:25 split, so the §F2 flexure check reproduces the schedule's
   *  Mn and LTB zone. Shear and deflection stay the page's own uniform-load
   *  reading of that demand — visible in the fields, adjustable at will. */
  const loadSaved = (req: MemberLoadRequest) => {
    const b = req.design.steelBeams.find((x) => x.id === req.id)
    if (!b || !(b.L > 0)) return
    setShapeName(b.shape)
    const sec = req.section
    if (sec?.steelFy) setGrade(sec.steelFy >= 300 ? 'A572G50' : 'A36')
    setSpan(b.L)
    setLb(b.Lb > 0 ? b.Lb : b.L)
    const r1 = (v: number) => Number(v.toFixed(1))
    const { dead, live } = backSolvedServiceLoads((8 * Math.abs(b.Mu)) / (b.L * b.L), 5 / 3)
    setWD(r1(dead)); setWL(r1(live))
  }

  const dTot = res ? res.loads.deltaD + res.loads.deltaL : 0
  const flexOK = utilM <= 1, shearOK = utilV <= 1
  const dLOK = res ? res.loads.deltaL <= res.loads.limL360 : false
  const dTOK = res ? dTot <= res.loads.limL240 : false
  const report = res ? {
    docCode: 'S-SB',
    ok: flexOK && shearOK && dLOK && dTOK,
    governing: `${shapeName} · ${demandLabel(res.basis, 'M')} ${f1(res.loads.Mu)} / ${capacityLabel(res.basis, 'M')} ${f1(res.avail.Mn)} kN·m (${res.flex.governing})`,
    stats: [
      { label: capacityLabel(res.basis, 'M'), value: f1(res.avail.Mn), unit: 'kN·m' },
      { label: capacityLabel(res.basis, 'V'), value: f1(res.avail.Vn), unit: 'kN' },
      { label: 'LTB zone', value: res.flex.ltbZone, unit: '' },
    ],
    checks: [
      { name: `Flexure §${res.flex.clause}`, ratio: utilM, ok: flexOK },
      { name: 'Shear §G2.1', ratio: utilV, ok: shearOK },
      { name: 'Live deflection ≤ L/360', ratio: res.loads.limL360 > 0 ? res.loads.deltaL / res.loads.limL360 : 0, ok: dLOK },
      { name: 'Total deflection ≤ L/240', ratio: res.loads.limL240 > 0 ? dTot / res.loads.limL240 : 0, ok: dTOK },
    ],
    data: [
      ['Shape', shapeName], ['Grade', `${GRADES[grade].label} (Fy ${Fy} MPa)`], ['Design basis', res.basis],
      ['Span L', `${f2(span)} m`], ['Unbraced Lb', `${f2(Lb)} m`], ['Cb', f2(Cb)],
      ['Dead / live', `${f2(wD)} / ${f2(wL)} kN/m`],
    ] as [string, string][],
    steps,
  } : undefined

  return (
    <WorkspacePage title="Steel Beam" badges={['Steel', 'AISC 360-16 · NSCP 2015']}
      intro="A simply supported rolled W under uniform load: §F2 lateral-torsional buckling between the braces of the compression flange, plus §F3 flange local buckling when the flange is not compact, §G2.1 shear, and service deflections against L/360 and L/240. LRFD or ASD."
      report={report}
      inputs={<>
        <div className="no-print"><ModelMemberResults kind="steelBeam" onLoad={loadSaved} /></div>
        <TrialWall cause={cause} />
        <InputGroup title="Section and grade">
          <ShapePick value={shapeName} onChange={setShapeName} />
          <BasisPick value={basis} onChange={setBasis} />
          <Pick label="Steel grade" value={grade} onChange={v => setGrade(v as Grade)}
            options={Object.entries(GRADES).map(([k, v]) => [k as Grade, v.label])} />
          <div className="col-span-2"><BasisNote basis={basis} /></div>
        </InputGroup>
        <InputGroup title="Span and bracing">
          <Num label="Span L" unit="m" value={span} onChange={setSpan} />
          <Num label="Unbraced Lb" unit="m" value={Lb} onChange={setLb} />
          <Num label="Cb (moment gradient)" value={Cb} onChange={setCb} />
        </InputGroup>
        <InputGroup title="Uniform service loads">
          <Num label="Dead wD" unit="kN/m" value={wD} onChange={setWD} />
          <Num label="Live wL" unit="kN/m" value={wL} onChange={setWL} />
        </InputGroup>
      </>}
      checks={res ? <>
        <CheckCard title={`Flexure §${res.flex.clause}`} basis={`${res.flex.governing} · LTB ${res.flex.ltbZone}`}
          status={flexOK ? 'pass' : 'fail'} value={f1(res.avail.Mn)} unit="kN·m" ratio={utilM}
          ratioLabel={`${demandLabel(res.basis, 'M')} ÷ ${capacityLabel(res.basis, 'M')}`}
          pairs={[{ label: demandLabel(res.basis, 'M'), value: `${f1(res.loads.Mu)} kN·m` }, { label: 'Flange', value: res.flex.flangeClass }]} />
        <CheckCard title="Shear §G2.1" basis={factorLabel(res.basis, shearLS)} status={shearOK ? 'pass' : 'fail'}
          value={f1(res.avail.Vn)} unit="kN" ratio={utilV} ratioLabel={`${demandLabel(res.basis, 'V')} ÷ ${capacityLabel(res.basis, 'V')}`}
          pairs={[{ label: demandLabel(res.basis, 'V'), value: `${f1(res.loads.Vu)} kN` }, { label: 'Cv1', value: res.shear.Cv1.toFixed(2) }]} />
        <CheckCard title="Deflection" basis="service, 5wL⁴/384EI" status={dLOK && dTOK ? 'pass' : 'fail'}
          value={f2(dTot)} unit="mm total" ratio={res.loads.limL240 > 0 ? dTot / res.loads.limL240 : undefined} ratioLabel="δ ÷ L/240"
          pairs={[{ label: 'δL / L/360', value: `${f2(res.loads.deltaL)} / ${f2(res.loads.limL360)} mm` }, { label: 'L/240', value: `${f2(res.loads.limL240)} mm` }]} />
        <CalcBadge loading={loading} error={error} cause={cause} />
      </> : <CalcBadge loading={loading} error={error} cause={cause} />}
      summary={[
        { label: 'Section', value: `${shapeName}, ${GRADES[grade].label}` },
        { label: 'Span', value: `${f2(span)} m, Lb ${f2(Lb)} m, Cb ${f2(Cb)}` },
        { label: 'Loads', value: `wD ${f2(wD)}, wL ${f2(wL)} kN/m (${basis})` },
      ]}
      drawing={{ title: 'Elevation and section', node: <div data-pdf-drawing className="space-y-3">
        <SteelBeamElevation span={span} Lb={Lb} wD={wD} wL={wL} />
        {shape.d && shape.bf && shape.tf && shape.tw
          ? <WShapeSection name={shape.name} d={shape.d} bf={shape.bf} tf={shape.tf} tw={shape.tw} /> : null}
      </div> }}
      results={res ? [
        { check: 'Section', basis: 'Ix · Sx · Zx', demand: `${(res.props.Ix / 1e6).toFixed(1)}×10⁶ · ${(res.props.Sx / 1e3).toFixed(0)}×10³ · ${(res.props.Zx / 1e3).toFixed(0)}×10³`, status: 'info' as const },
        { check: 'Lp / Lr', basis: '§F2.2', demand: `${f2(res.flex.Lp / 1000)} / ${f2(res.flex.Lr / 1000)} m`, limit: `Lb ${f2(Lb)} m`, status: 'info' as const },
        ...(res.flex.flangeClass !== 'compact' ? [{ check: 'Flange local buckling', basis: `${res.flex.flangeClass} · §F3.2`, demand: `${f1(res.flex.MnFLB)} kN·m`, status: 'warn' as const }] : []),
        { check: `Flexure §${res.flex.clause}`, basis: `Mn ${f1(res.flex.Mn)} · ${factorLabel(res.basis, 'flexure')}`, demand: `${f1(res.loads.Mu)} kN·m`, limit: `${f1(res.avail.Mn)} kN·m`, ratio: utilM, status: flexOK ? 'pass' as const : 'fail' as const },
        { check: 'Shear §G2.1', basis: `Cv1 ${res.shear.Cv1.toFixed(2)} · ${factorLabel(res.basis, shearLS)}`, demand: `${f1(res.loads.Vu)} kN`, limit: `${f1(res.avail.Vn)} kN`, ratio: utilV, status: shearOK ? 'pass' as const : 'fail' as const },
        { check: 'Live deflection', basis: 'L/360', demand: `${f2(res.loads.deltaL)} mm`, limit: `${f2(res.loads.limL360)} mm`, ratio: res.loads.limL360 > 0 ? res.loads.deltaL / res.loads.limL360 : undefined, status: dLOK ? 'pass' as const : 'fail' as const },
        { check: 'Total deflection', basis: 'L/240', demand: `${f2(dTot)} mm`, limit: `${f2(res.loads.limL240)} mm`, ratio: res.loads.limL240 > 0 ? dTot / res.loads.limL240 : undefined, status: dTOK ? 'pass' as const : 'fail' as const },
      ] : []}
      extraSections={[{ title: '3D view', node: (
        <Suspense fallback={<Spinner />}>
          <BeamViewer3D shape={shape} span={span} wDead={wD} wLive={wL} />
        </Suspense>
      ) }]}
      steps={steps}
      references={[
        { topic: 'Flexure', basis: 'yielding, LTB; FLB for a noncompact flange', source: 'AISC 360-16 §F2, §F3 · NSCP 2015 §506' },
        { topic: 'Shear', basis: 'web shear, Cv1', source: 'AISC 360-16 §G2.1' },
        { topic: 'Width-to-thickness', basis: 'compact / noncompact / slender', source: 'AISC 360-16 Table B4.1b' },
      ]}
    />
  )
}
