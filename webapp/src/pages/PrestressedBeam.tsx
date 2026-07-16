import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { designPrestressed } from '../engine/prestressedBeam'
import { buildPrestressedSolution } from '../lib/prestressedSolution'
import { PageHeader, VerdictPanel, DrawingCard, LetterheadCard, PrintReport, type LetterheadState } from '../components/calc'
import { Num, Pick, Card } from '../components/qty'
import { WorkedSolution } from '../components/WorkedSolution'

const f1 = (v: number) => v.toFixed(1)

/** Elevation: beam, tendon profile (straight, eccentric) and load arrows. */
function PSElevation({ h, e }: { h: number; e: number }) {
  const y0 = 60, H = 60, yc = y0 + H / 2, yTendon = yc + (e / h) * H
  return (
    <svg viewBox="0 0 300 160" className="mx-auto block w-full max-w-[360px]">
      <rect x="20" y={y0} width="260" height={H} fill="#fff" stroke="#0f1b2a" strokeWidth="2" />
      <line x1="20" y1={yTendon} x2="280" y2={yTendon} stroke="#0f4c92" strokeWidth="2.5" strokeDasharray="7 4" />
      <line x1="20" y1={yc} x2="280" y2={yc} stroke="#a39d8d" strokeWidth="1" strokeDasharray="3 4" />
      <text x="150" y={yTendon + 12} fontSize="9" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fill="#0f4c92">Aps · e = {e} mm</text>
      {[60, 110, 160, 210, 260].map((x) => (
        <line key={x} x1={x} y1={y0 - 18} x2={x} y2={y0 - 4} stroke="#5c6675" strokeWidth="1.5" markerEnd="url(#arr)" />
      ))}
      <defs><marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="5" orient="auto"><path d="M0 0 L6 0 L3 6 z" fill="#5c6675" /></marker></defs>
      <polygon points="20,126 12,140 28,140" fill="#0f4c92" />
      <circle cx="280" cy="133" r="6" fill="none" stroke="#0f4c92" strokeWidth="2" />
    </svg>
  )
}

export default function PrestressedBeam() {
  const [b, setB] = useState(400); const [h, setH] = useState(800)
  const [span, setSpan] = useState(12)
  const [fc, setFc] = useState(40); const [fci, setFci] = useState(32)
  const [Aps, setAps] = useState(987); const [fpu, setFpu] = useState(1860)
  const [e, setE] = useState(250); const [fpjPct, setFpjPct] = useState(74)
  const [wSDL, setWSDL] = useState(6); const [wLL, setWLL] = useState(12)
  const [RH, setRH] = useState(75)
  const [klass, setKlass] = useState<'U' | 'T'>('U')
  const [lh, setLh] = useState<LetterheadState>({ project: '', sheet: '', preparedBy: '' })

  const inp = useMemo(() => ({
    b, h, span, fc, fci, Aps, fpu, e, fpj: (fpjPct / 100) * fpu, wSDL, wLL, RH, klass,
  }), [b, h, span, fc, fci, Aps, fpu, e, fpjPct, wSDL, wLL, RH, klass])
  const r = useMemo(() => { try { return designPrestressed(inp) } catch { return null } }, [inp])
  const steps = useMemo(() => (r ? buildPrestressedSolution(inp, r) : []), [inp, r])
  const badges = ['ACI 318-14', 'PCI', 'NSCP 2015']

  return (
    <div className="min-h-screen">
      <PageHeader title="Prestressed Beam" badges={[...badges, `class ${klass}`]} />
      <div className="mx-auto max-w-6xl px-5 py-5 sm:px-7">
        <p className="no-print text-[13px] text-[#5c6675]">
          <Link to="/" className="font-semibold text-[#0f4c92]">← Home</Link> · Pretensioned bonded beam: PCI losses
          (ES/CR/SH/RE), §24.5 transfer & service stress limits, fps per §20.3.2.3.1, φMn ≥ 1.2Mcr, Vci/Vcw, camber.
        </p>
        <div className="no-print mt-4 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(330px,1fr)]">
          <div className="space-y-4">
            <Card title="Section & span">
              <Num label="Width b" unit="mm" value={b} onChange={setB} />
              <Num label="Depth h" unit="mm" value={h} onChange={setH} />
              <Num label="Simple span L" unit="m" value={span} onChange={setSpan} />
              <Num label="f'c (28-day)" unit="MPa" value={fc} onChange={setFc} />
              <Num label="f'ci (transfer)" unit="MPa" value={fci} onChange={setFci} />
            </Card>
            <Card title="Tendons" hint="pretensioned · bonded">
              <Num label="Aps" unit="mm²" value={Aps} onChange={setAps} />
              <Num label="fpu" unit="MPa" value={fpu} onChange={setFpu} />
              <Num label="Eccentricity e" unit="mm" value={e} onChange={setE} />
              <Num label="Jacking (% fpu)" unit="%" value={fpjPct} onChange={setFpjPct} />
              <Num label="Ambient RH" unit="%" value={RH} onChange={setRH} />
              <Pick label="Class (§24.5.2)" value={klass} onChange={(v) => setKlass(v as 'U' | 'T')}
                options={[['U', 'U — uncracked'], ['T', 'T — transition']]} />
            </Card>
            <Card title="Loads" hint="unfactored, self-weight auto">
              <Num label="Superimposed DL" unit="kN/m" value={wSDL} onChange={setWSDL} />
              <Num label="Live load" unit="kN/m" value={wLL} onChange={setWLL} />
            </Card>
            {r && <WorkedSolution steps={steps} title="Prestressed beam — worked solution" />}
          </div>
          <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            {r && (
              <VerdictPanel ok={r.ok} headline={r.ok ? 'DESIGN OK' : 'CHECK FAILED'}
                governing={`losses ${r.lossPct.toFixed(1)}% · fse ${f1(r.fse)} MPa · ${r.shearNote}`}
                stats={[
                  { label: 'φMn', value: f1(r.phiMn), unit: 'kN·m' },
                  { label: 'Pe', value: f1(r.Pe), unit: 'kN' },
                  { label: 'Net Δ', value: f1(r.deltaNet), unit: 'mm' },
                ]}
                checks={[
                  { name: 'Strength Mu/φMn', ratio: r.phiMn > 0 ? r.Mu / r.phiMn : 99 },
                  { name: 'Service σ,bot / limit', ratio: Number.isFinite(r.limServiceT) ? Math.max(0, -r.service.bot) / r.limServiceT : 0 },
                  { name: 'Transfer σ,bot / 0.60f\'ci', ratio: r.transfer.bot / r.limTransferC },
                  { name: '1.2Mcr / φMn', ratio: r.phiMn > 0 ? (1.2 * r.Mcr) / r.phiMn : 99 },
                ]} />
            )}
            {r && (
              <DrawingCard title="Elevation & tendon profile" meta={`${b}×${h} · L = ${span} m`}>
                <PSElevation h={h} e={e} />
              </DrawingCard>
            )}
            <LetterheadCard lh={lh} onChange={(p) => setLh((s) => ({ ...s, ...p }))} />
          </div>
        </div>
      </div>
      {r && (
        <PrintReport docTitle="Prestressed Beam" docCode="PS-01" badges={badges} ok={r.ok}
          governing={`losses ${r.lossPct.toFixed(1)}% · utilization ${(r.Mu / Math.max(r.phiMn, 1e-9)).toFixed(2)}`}
          lh={lh}
          stats={[
            { label: 'φMn', value: f1(r.phiMn), unit: 'kN·m' },
            { label: 'fse', value: f1(r.fse), unit: 'MPa' },
            { label: 'Pe', value: f1(r.Pe), unit: 'kN' },
          ]}
          checks={[
            { name: 'Transfer stresses §24.5.3', ratio: r.transfer.bot / r.limTransferC, ok: r.transferOK },
            { name: 'Service stresses §24.5.4', ratio: Number.isFinite(r.limServiceT) ? Math.max(0, -r.service.bot) / r.limServiceT : 0, ok: r.serviceOK },
            { name: 'Strength Mu/φMn', ratio: r.Mu / Math.max(r.phiMn, 1e-9), ok: r.strengthOK },
            { name: 'φMn ≥ 1.2Mcr', ratio: (1.2 * r.Mcr) / Math.max(r.phiMn, 1e-9), ok: r.crackingOK },
          ]}
          data={[
            ['Section', `${b} × ${h} mm`], ['Span', `${span} m`], ["f'c / f'ci", `${fc} / ${fci} MPa`],
            ['Tendons', `Aps ${Aps} mm² · fpu ${fpu} · e ${e} mm`], ['Loads', `SDL ${wSDL} · LL ${wLL} kN/m`],
            ['Losses', `${r.lossPct.toFixed(1)} % → fse ${f1(r.fse)} MPa`],
          ]}
          steps={steps}
          drawing={<PSElevation h={h} e={e} />}
          drawingTitle="Prestressed beam" />
      )}
    </div>
  )
}
