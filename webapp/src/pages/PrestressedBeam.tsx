import { useMemo, useState } from 'react'
import { designPrestressed } from '../engine/prestressedBeam'
import { buildPrestressedSolution } from '../lib/prestressedSolution'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard, type ResultRow } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { PSElevation } from '../components/prestressSketches'

const f1 = (v: number) => v.toFixed(1)

export default function PrestressedBeam() {
  const [b, setB] = useState(400); const [h, setH] = useState(800)
  const [span, setSpan] = useState(12)
  const [fc, setFc] = useState(40); const [fci, setFci] = useState(32)
  const [Aps, setAps] = useState(987); const [fpu, setFpu] = useState(1860)
  const [e, setE] = useState(250); const [fpjPct, setFpjPct] = useState(74)
  const [wSDL, setWSDL] = useState(6); const [wLL, setWLL] = useState(12)
  const [RH, setRH] = useState(75)
  const [klass, setKlass] = useState<'U' | 'T'>('U')

  const inp = useMemo(() => ({
    b, h, span, fc, fci, Aps, fpu, e, fpj: (fpjPct / 100) * fpu, wSDL, wLL, RH, klass,
  }), [b, h, span, fc, fci, Aps, fpu, e, fpjPct, wSDL, wLL, RH, klass])
  const r = useMemo(() => { try { return designPrestressed(inp) } catch { return null } }, [inp])
  const steps = useMemo(() => (r ? buildPrestressedSolution(inp, r) : []), [inp, r])

  const checks = r ? [
    { name: 'Strength Mu/φMn', ratio: r.phiMn > 0 ? r.Mu / r.phiMn : 99, ok: r.strengthOK, basis: '§20.3.2.3.1 fps' },
    { name: 'Service σ,bot / limit', ratio: Number.isFinite(r.limServiceT) ? Math.max(0, -r.service.bot) / r.limServiceT : 0, ok: r.serviceOK, basis: `§24.5.4, class ${klass}` },
    { name: "Transfer σ,bot / 0.60f'ci", ratio: r.transfer.bot / r.limTransferC, ok: r.transferOK, basis: '§24.5.3' },
    { name: '1.2Mcr / φMn', ratio: r.phiMn > 0 ? (1.2 * r.Mcr) / r.phiMn : 99, ok: r.crackingOK, basis: '§9.6.2.1' },
  ] : []
  return (
    <WorkspacePage title="Prestressed Beam" badges={['Concrete', `ACI 318-14 · PCI · class ${klass}`]}
      intro="A pretensioned, bonded, simply supported beam: PCI losses (elastic shortening, creep, shrinkage, relaxation), the §24.5 transfer and service stress limits, fps per §20.3.2.3.1, φMn ≥ 1.2Mcr, Vci/Vcw and camber."
      report={r ? {
        docCode: 'PS-01', ok: r.ok,
        governing: `losses ${r.lossPct.toFixed(1)}% · utilization ${(r.Mu / Math.max(r.phiMn, 1e-9)).toFixed(2)}`,
        stats: [
          { label: 'φMn', value: f1(r.phiMn), unit: 'kN·m' },
          { label: 'fse', value: f1(r.fse), unit: 'MPa' },
          { label: 'Pe', value: f1(r.Pe), unit: 'kN' },
        ],
        checks: checks.map((c) => ({ name: c.name, ratio: c.ratio, ok: c.ok })),
        data: [
          ['Section', `${b} × ${h} mm`], ['Span', `${span} m`], ["f'c / f'ci", `${fc} / ${fci} MPa`],
          ['Tendons', `Aps ${Aps} mm² · fpu ${fpu} · e ${e} mm`], ['Loads', `SDL ${wSDL} · LL ${wLL} kN/m`],
          ['Losses', `${r.lossPct.toFixed(1)} % → fse ${f1(r.fse)} MPa`],
        ],
        steps, drawingTitle: 'Prestressed beam',
      } : undefined}
      inputs={<>
        <InputGroup title="Section and span">
          <Num label="Width b" unit="mm" value={b} onChange={setB} />
          <Num label="Depth h" unit="mm" value={h} onChange={setH} />
          <Num label="Simple span L" unit="m" value={span} onChange={setSpan} />
          <div />
          <Num label="f′c (28-day)" unit="MPa" value={fc} onChange={setFc} />
          <Num label="f′ci (transfer)" unit="MPa" value={fci} onChange={setFci} />
        </InputGroup>
        <InputGroup title="Tendons" hint="Pretensioned, bonded.">
          <Num label="Aps" unit="mm²" value={Aps} onChange={setAps} />
          <Num label="fpu" unit="MPa" value={fpu} onChange={setFpu} />
          <Num label="Eccentricity e" unit="mm" value={e} onChange={setE} />
          <Num label="Jacking" unit="% fpu" value={fpjPct} onChange={setFpjPct} />
          <Num label="Ambient RH" unit="%" value={RH} onChange={setRH} />
          <Pick label="Class (§24.5.2)" value={klass} onChange={(v) => setKlass(v as 'U' | 'T')} options={[['U', 'U — uncracked'], ['T', 'T — transition']]} />
        </InputGroup>
        <InputGroup title="Loads" hint="Unfactored; self-weight is added.">
          <Num label="Superimposed DL" unit="kN/m" value={wSDL} onChange={setWSDL} />
          <Num label="Live load" unit="kN/m" value={wLL} onChange={setWLL} />
        </InputGroup>
      </>}
      checks={r ? <>
        <CheckCard title="Design" basis={`losses ${r.lossPct.toFixed(1)}%, fse ${f1(r.fse)} MPa`} status={r.ok ? 'pass' : 'fail'} pillLabel={r.ok ? 'DESIGN OK' : 'REVISE'}
          value={f1(r.Pe)} unit="kN Pe" pairs={[{ label: 'φMn', value: `${f1(r.phiMn)} kN·m` }, { label: 'Net deflection', value: `${f1(r.deltaNet)} mm` }]} />
        {checks.map((c) => (
          <CheckCard key={c.name} title={c.name} basis={c.basis} status={c.ok ? 'pass' : 'fail'} value={c.ratio.toFixed(2)} ratio={c.ratio} ratioLabel="Utilization" />
        ))}
      </> : (
        <CheckCard title="Check the inputs" basis="prestressed beam" status="warn" pillLabel="CHECK" value="—" formula="Positive section, span, materials and tendon area." />
      )}
      summary={[
        { label: 'Section', value: `${b} × ${h} mm, L ${span} m` },
        { label: "f'c / f'ci", value: `${fc} / ${fci} MPa` },
        { label: 'Tendons', value: `Aps ${Aps} mm², fpu ${fpu} MPa, e ${e} mm, ${fpjPct} % jacking` },
        { label: 'Loads', value: `SDL ${wSDL}, LL ${wLL} kN/m; RH ${RH} %` },
      ]}
      drawing={r ? { title: 'Elevation and tendon profile', node: <div data-pdf-drawing><PSElevation h={h} e={e} span={span} /></div> } : undefined}
      resultsCaption={r ? r.shearNote : undefined}
      results={r ? [
        { check: 'Prestress losses', basis: 'ES + CR + SH + RE', demand: `${r.lossPct.toFixed(1)} %`, status: 'info' as const },
        { check: 'Effective prestress', basis: 'fse, Pe', demand: `${f1(r.fse)} MPa, ${f1(r.Pe)} kN`, status: 'info' as const },
        ...checks.map((c): ResultRow => ({ check: c.name, basis: c.basis, demand: c.ratio.toFixed(2), limit: '1.00', ratio: c.ratio, status: c.ok ? 'pass' : 'fail' })),
        { check: 'Net deflection', basis: 'camber − load', demand: `${f1(r.deltaNet)} mm`, status: 'info' as const },
      ] : [{ check: 'Beam', basis: 'invalid input', demand: '—', status: 'warn' as const }]}
      steps={steps.length ? steps : [{ title: 'Check the inputs', lines: [{ text: 'Positive section, span, materials and tendon area.' }] }]}
      references={[
        { topic: 'Losses', basis: 'elastic shortening, creep, shrinkage, relaxation', source: 'PCI Design Handbook; Zia et al. (1979)' },
        { topic: 'Stress limits', basis: 'transfer and service, class U / T', source: 'ACI 318-14 §24.5' },
        { topic: 'Flexural strength', basis: 'fps approximation', source: 'ACI 318-14 §20.3.2.3.1' },
        { topic: 'Minimum strength', basis: 'φMn ≥ 1.2 Mcr', source: 'ACI 318-14 §9.6.2.1' },
      ]}
    />
  )
}
