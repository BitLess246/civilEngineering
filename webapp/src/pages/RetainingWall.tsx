import { useMemo, useState } from 'react'
import { designRetainingWall, type RetainingWallInput } from '../engine/retainingWall'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { RetainingWallSection } from '../components/RetainingWallSection'
import { buildRetainingWallSolution, retainingWallBarNote } from '../lib/retainingWallSolution'
import { f1, f2, f3 } from '../lib/format'

type FormState = RetainingWallInput & { gamma_c: number }

const DEFAULTS: FormState = {
  Hs: 3000, tb: 500, ts: 300, bt: 500, bh: 1500,
  gamma_s: 18, phi_deg: 30, q_sur: 0, mu: 0.5, qa: 200,
  fc: 28, fy: 415, cover: 75, barDia: 16, gamma_c: 23.6,
}

const REQUIRED: (keyof FormState)[] = [
  'Hs', 'tb', 'ts', 'bt', 'bh',
  'gamma_s', 'phi_deg', 'mu', 'qa',
  'fc', 'fy', 'cover', 'barDia', 'gamma_c',
]

export default function RetainingWall() {
  const [f, setF] = useState<FormState>(DEFAULTS)
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) =>
    setF((s) => ({ ...s, [k]: v }))

  const allFinite = REQUIRED.every((k) => Number.isFinite(f[k] as number))
    && Number.isFinite(f.q_sur)

  // `f` is a fresh object every render, so memoize on its VALUE identity
  const fKey = JSON.stringify(f)
  const r = useMemo(
    () => (allFinite ? designRetainingWall(f) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fKey, allFinite],
  )

  const bd = f.barDiaBase ?? f.barDia
  const ok = r ? r.stableSL && r.stableOT && r.bearingOK && r.tensionOK && r.shearOK && r.toe.shearOK && r.heel.shearOK : false
  const report = r ? {
    docCode: 'RW-01',
    ok,
    governing: `FS sliding ${f2(r.FS_SL)} · FS overturning ${f2(r.FS_OT)} · q,max ${f1(r.q_max)} kPa`,
    stats: [
      // B and H are ALREADY in metres.
      { label: 'Base width B', value: f2(r.B), unit: 'm' },
      { label: 'Total height H', value: f2(r.H), unit: 'm' },
      { label: 'q,max', value: f1(r.q_max), unit: 'kPa' },
    ],
    checks: [
      { name: 'Sliding (FS req 1.5 / FS)', ratio: 1.5 / r.FS_SL, ok: r.stableSL },
      { name: 'Overturning (FS req 2.0 / FS)', ratio: 2.0 / r.FS_OT, ok: r.stableOT },
      { name: 'Bearing q,max / qa', ratio: r.q_max / f.qa, ok: r.bearingOK },
      { name: 'No tension under the heel', ratio: null, ok: r.tensionOK },
      { name: 'Stem shear Vu / φVc', ratio: r.Vu_stem / r.Vc_stem, ok: r.shearOK },
      { name: 'Toe shear Vu / φVc', ratio: r.toe.Vu / r.toe.phiVc, ok: r.toe.shearOK },
      { name: 'Heel shear Vu / φVc', ratio: r.heel.Vu / r.heel.phiVc, ok: r.heel.shearOK },
    ],
    data: [
      ['Stem height Hs', `${f.Hs} mm`], ['Base thickness tb', `${f.tb} mm`],
      ['Stem thickness ts', `${f.ts} mm`], ['Toe / heel', `${f.bt} / ${f.bh} mm`],
      ['Soil γs / φ', `${f.gamma_s} kN/m³ / ${f.phi_deg}°`], ['Surcharge', `${f.q_sur} kPa`],
      ['Friction μ', `${f.mu}`], ['Allowable qa', `${f.qa} kPa`],
      ["Concrete f'c / fy", `${f.fc} / ${f.fy} MPa`], ['Ka (Rankine)', `${f3(r.Ka)}`],
      ['Active thrust Pa + Pq', `${f1(r.Pa)} + ${f1(r.Pq)} kN/m`], ['Stem Mu', `${f1(r.Mu_stem)} kN·m/m`],
    ] as [string, string][],
    steps: buildRetainingWallSolution(f, r),
  } : undefined

  return (
    <WorkspacePage title="Cantilever Retaining Wall" badges={['Foundations', 'NSCP 2015 · ACI 318-14']}
      intro="Rankine active pressure on a cantilever wall, per metre run: overturning and sliding stability, bearing under the base with the resultant's eccentricity, then the stem, toe and heel designed as cantilevers off the stem faces on factored pressure."
      report={report}
      inputs={<>
        <InputGroup title="Geometry (mm)">
          <Num label="Stem height Hs" unit="mm" value={f.Hs} onChange={set('Hs')} min={1} />
          <Num label="Base thickness tb" unit="mm" value={f.tb} onChange={set('tb')} min={1} />
          <Num label="Stem width ts" unit="mm" value={f.ts} onChange={set('ts')} min={1} />
          <Num label="Toe bt" unit="mm" value={f.bt} onChange={set('bt')} min={0} />
          <Num label="Heel bh" unit="mm" value={f.bh} onChange={set('bh')} min={0} />
        </InputGroup>
        <InputGroup title="Soil">
          <Num label="γs" unit="kN/m³" value={f.gamma_s} onChange={set('gamma_s')} min={1} />
          <Num label="φ" unit="°" value={f.phi_deg} onChange={set('phi_deg')} min={0} max={89.9} />
          <Num label="Surcharge q" unit="kPa" value={f.q_sur} onChange={set('q_sur')} min={0} />
          <Num label="Base friction μ" value={f.mu} onChange={set('mu')} min={0} />
          <Num label="Allowable qa" unit="kPa" value={f.qa} onChange={set('qa')} min={1} />
        </InputGroup>
        <InputGroup title="Concrete and steel">
          <Num label="f′c" unit="MPa" value={f.fc} onChange={set('fc')} min={1} />
          <Num label="fy" unit="MPa" value={f.fy} onChange={set('fy')} min={1} />
          <Num label="Cover (stem)" unit="mm" value={f.cover} onChange={set('cover')} min={0} />
          <Num label="Main bar ⌀" unit="mm" value={f.barDia} onChange={set('barDia')} min={1} />
          <Num label="γc" unit="kN/m³" value={f.gamma_c} onChange={set('gamma_c')} min={1} />
        </InputGroup>
      </>}
      checks={r ? <>
        <CheckCard title="Overturning" basis="FS ≥ 2.0" status={r.stableOT ? 'pass' : 'fail'} value={f2(r.FS_OT)}
          ratio={2.0 / r.FS_OT} ratioLabel="2.0 ÷ FS"
          pairs={[{ label: 'MR', value: `${f1(r.MR)} kN·m/m` }, { label: 'MO', value: `${f1(r.MO)} kN·m/m` }]} />
        <CheckCard title="Sliding" basis="FS ≥ 1.5" status={r.stableSL ? 'pass' : 'fail'} value={f2(r.FS_SL)}
          ratio={1.5 / r.FS_SL} ratioLabel="1.5 ÷ FS"
          pairs={[{ label: 'μΣV', value: `${f1(f.mu * r.sumV)} kN/m` }, { label: 'Fh', value: `${f1(r.Fh)} kN/m` }]} />
        <CheckCard title="Bearing" basis={`e ${f3(r.e)} m · B/6 ${f3(r.B / 6)} m`} status={r.bearingOK && r.tensionOK ? 'pass' : 'fail'}
          value={f1(r.q_max)} unit="kPa" ratio={r.q_max / f.qa} ratioLabel="q,max ÷ qa"
          pairs={[{ label: 'q,min', value: `${f1(r.q_min)} kPa${r.tensionOK ? '' : ' — tension'}` }, { label: 'qa', value: `${f.qa} kPa` }]} />
        <CheckCard title="Stem" basis="at the base, 1.6H" status={r.shearOK ? 'pass' : 'fail'}
          value={`⌀${f.barDia} @ ${f1(r.s_stem)}`} unit="mm" ratio={r.Vu_stem / r.Vc_stem} ratioLabel="Vu ÷ φVc"
          pairs={[{ label: 'Mu', value: `${f1(r.Mu_stem)} kN·m/m` }, { label: 'As', value: `${f1(r.As_design)} mm²/m` }]} />
        <CheckCard title="Toe and heel" basis="cantilevers off the stem faces" status={r.toe.shearOK && r.heel.shearOK ? 'pass' : 'fail'}
          value={`⌀${bd} @ ${f1(r.toe.spacing)} / ${f1(r.heel.spacing)}`} unit="mm"
          ratio={Math.max(r.toe.Vu / r.toe.phiVc, r.heel.Vu / r.heel.phiVc)} ratioLabel="worst Vu ÷ φVc"
          pairs={[{ label: 'Toe Mu', value: `${f1(r.toe.Mu)} kN·m/m` }, { label: 'Heel Mu', value: `${f1(r.heel.Mu)} kN·m/m` }]} />
      </> : <p className="text-sm text-muted">Fill in all inputs to see results.</p>}
      summary={[
        { label: 'Wall', value: `Hs ${f.Hs}, stem ${f.ts}, base ${f.tb} mm; toe ${f.bt}, heel ${f.bh} mm` },
        { label: 'Soil', value: `γ ${f.gamma_s} kN/m³, φ ${f.phi_deg}°, q ${f.q_sur} kPa, μ ${f.mu}, qa ${f.qa} kPa` },
        { label: 'Materials', value: `f′c ${f.fc}, fy ${f.fy} MPa, ⌀${f.barDia}, cover ${f.cover} mm` },
      ]}
      drawing={r ? { title: 'Section — thrusts, base pressure and bars', node: <div data-pdf-drawing>
        <RetainingWallSection
          Hs={f.Hs} tb={f.tb} ts={f.ts} bt={f.bt} bh={f.bh}
          Pa={r.Pa} Pq={r.Pq} q_sur={f.q_sur} H={r.H} B={r.B}
          q_max={r.q_max} q_min={r.q_min} xbar={r.xbar} e={r.e}
          bars={retainingWallBarNote(f, r)} />
      </div> } : undefined}
      resultsCaption={r && r.inputNotes.length ? r.inputNotes.join(' ') : undefined}
      results={r ? [
        { check: 'Earth pressure', basis: `Ka ${f3(r.Ka)} · Pa ½Ka·γ·H² + Pq Ka·q·H`, demand: `${f1(r.Pa)} + ${f1(r.Pq)} = ${f1(r.Fh)} kN/m`, status: 'info' as const },
        { check: 'Vertical loads', basis: `stem ${f1(r.W_stem)} · base ${f1(r.W_base)} · soil ${f1(r.W_soil)}${r.W_sur > 0 ? ` · surcharge ${f1(r.W_sur)}` : ''}`, demand: `ΣV ${f1(r.sumV)} kN/m`, status: 'info' as const },
        { check: 'Overturning', basis: 'MR / MO ≥ 2.0', demand: f2(r.FS_OT), limit: '2.00', ratio: 2.0 / r.FS_OT, status: r.stableOT ? 'pass' as const : 'fail' as const },
        { check: 'Sliding', basis: 'μΣV / Fh ≥ 1.5', demand: f2(r.FS_SL), limit: '1.50', ratio: 1.5 / r.FS_SL, status: r.stableSL ? 'pass' as const : 'fail' as const },
        { check: 'Bearing at the toe', basis: `x̄ ${f2(r.xbar)} m, e ${f3(r.e)} m`, demand: `${f1(r.q_max)} kPa`, limit: `${f.qa} kPa`, ratio: r.q_max / f.qa, status: r.bearingOK ? 'pass' as const : 'fail' as const },
        { check: 'Pressure at the heel', basis: 'no tension (e ≤ B/6)', demand: `${f1(r.q_min)} kPa`, status: r.tensionOK ? 'pass' as const : 'fail' as const },
        { check: 'Stem shear', basis: `d ${f1(r.d_stem)} mm`, demand: `${f1(r.Vu_stem)} kN/m`, limit: `${f1(r.Vc_stem)} kN/m`, ratio: r.Vu_stem / r.Vc_stem, status: r.shearOK ? 'pass' as const : 'fail' as const },
        { check: 'Stem vertical bars', basis: `As req ${f1(r.As_stem)}, min ${f1(r.As_min)} mm²/m`, demand: `⌀${f.barDia} @ ${f1(r.s_stem)}`, limit: `s,max ${f1(r.s_stem_max)} mm`, status: 'info' as const },
        { check: 'Stem horizontal bars', basis: 'ρt 0.0020 (§11.6.1)', demand: `⌀${f.barDia} @ ${f1(r.s_horiz)}`, status: 'info' as const },
        { check: 'Factored base pressure', basis: '1.2D + 1.6L', demand: `${f1(r.qu_toe)} / ${f1(r.qu_heel)} kPa`, status: r.uplift_u ? 'warn' as const : 'info' as const },
        { check: 'Toe shear', basis: `Mu ${f1(r.toe.Mu)} kN·m/m`, demand: `${f1(r.toe.Vu)} kN/m`, limit: `${f1(r.toe.phiVc)} kN/m`, ratio: r.toe.Vu / r.toe.phiVc, status: r.toe.shearOK ? 'pass' as const : 'fail' as const },
        { check: 'Toe bars (bottom)', basis: r.toe.As_min >= r.toe.As ? 'minimum governs' : 'flexure governs', demand: `⌀${bd} @ ${f1(r.toe.spacing)}`, limit: `${f1(r.toe.As_prov)} mm²/m`, status: 'info' as const },
        { check: 'Heel shear', basis: `Mu ${f1(r.heel.Mu)} kN·m/m`, demand: `${f1(r.heel.Vu)} kN/m`, limit: `${f1(r.heel.phiVc)} kN/m`, ratio: r.heel.Vu / r.heel.phiVc, status: r.heel.shearOK ? 'pass' as const : 'fail' as const },
        { check: 'Heel bars (top)', basis: r.heel.As_min >= r.heel.As ? 'minimum governs' : 'flexure governs', demand: `⌀${bd} @ ${f1(r.heel.spacing)}`, limit: `${f1(r.heel.As_prov)} mm²/m`, status: 'info' as const },
        { check: 'Base temperature steel', basis: '§24.4.3.2', demand: `⌀${bd} @ ${f1(r.s_temp_base)}`, limit: `${f1(r.As_temp_base)} mm²/m`, status: 'info' as const },
      ] : []}
      steps={report?.steps ?? []}
      references={[
        { topic: 'Earth pressure', basis: 'Rankine active, surcharge Ka·q', source: 'Das, Principles of Foundation Engineering' },
        { topic: 'Stability', basis: 'FS overturning 2.0, sliding 1.5', source: 'Common design practice; Das, Principles of Foundation Engineering' },
        { topic: 'Stem, toe and heel', basis: 'one-way flexure and shear', source: 'ACI 318-14 §7, §22.5 · NSCP 2015 §407, §422' },
      ]}
    />
  )
}
