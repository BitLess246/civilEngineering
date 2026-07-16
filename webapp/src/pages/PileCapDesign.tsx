import { useMemo, useState, type ReactNode } from 'react'
import { designPileCap, type PileArrangement } from '../engine/pileCap'
import { PileCapSchematic } from '../components/PileCapSchematic'
import { PageHeader, LetterheadCard, PrintReport, type LetterheadState } from '../components/calc'
import { Math as KTex } from '../lib/math'
import { f0, f2, f3 } from '../lib/format'
import 'katex/dist/katex.min.css'

interface FormState {
  serviceLoad: number
  serviceMomX: number
  serviceMomY: number
  ultimateLoad: number
  ultimateMomX: number
  ultimateMomY: number
  nPiles: PileArrangement
  pileDia: number
  pileCapacity: number
  spacing: number
  edgeDist: number
  colX: number
  colY: number
  fc: number
  fy: number
  cover: number
  barDia: number
  pileEmbed: number
}

const DEFAULTS: FormState = {
  serviceLoad: 2000,
  serviceMomX: 0,
  serviceMomY: 0,
  ultimateLoad: 2800,
  ultimateMomX: 0,
  ultimateMomY: 0,
  nPiles: 4,
  pileDia: 400,
  pileCapacity: 600,
  spacing: 1200,
  edgeDist: 500,
  colX: 500,
  colY: 500,
  fc: 28,
  fy: 415,
  cover: 75,
  barDia: 20,
  pileEmbed: 150,
}

function NumField({ label, unit, value, onChange, step = 'any' }: {
  label: ReactNode; unit?: string; value: number; onChange: (v: number) => void; step?: string
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 font-medium text-slate-600">
        {label}{unit ? <span className="text-slate-500"> ({unit})</span> : null}
      </span>
      <input
        type="number" inputMode="decimal" step={step} value={Number.isFinite(value) ? value : ''}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-[#0056b3] focus:outline-none focus:ring-1 focus:ring-[#0056b3]"
      />
    </label>
  )
}

function SelectField<T extends string | number>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: [T, string][]
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 font-medium text-slate-600">{label}</span>
      <select value={String(value)} onChange={e => onChange(e.target.value as T)}
        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-[#0056b3] focus:outline-none">
        {options.map(([v, t]) => <option key={String(v)} value={String(v)}>{t}</option>)}
      </select>
    </label>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <legend className="px-2 text-[1.02rem] font-bold text-[#0056b3]">{title}</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  )
}

function Row({ label, value, check }: { label: ReactNode; value: ReactNode; check?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-right text-sm font-semibold text-slate-800">{value}</span>
      {check ? <span className="w-36 text-right text-xs text-slate-500">{check}</span> : null}
    </div>
  )
}

function CheckRow({ label, Vu, phiVc, ok }: { label: ReactNode; Vu: number; phiVc: number; ok: boolean }) {
  return (
    <Row
      label={label}
      value={`${f2(Vu)} kN`}
      check={
        <span className={ok ? 'text-emerald-600' : 'text-rose-600'}>
          φVc = {f2(phiVc)} kN {ok ? '✓' : '✗'}
        </span>
      }
    />
  )
}

function steelRow(label: ReactNode, s: { bars: number; spacing: number; As: number; usedMin: boolean; rho: number }, db: number) {
  return (
    <Row
      label={label}
      value={`${s.bars} ⌀${db} mm @ ${f0(s.spacing)} mm`}
      check={`As=${f0(s.As)} mm² · ${s.usedMin ? 'ρ_min' : `ρ=${s.rho.toFixed(4)}`}`}
    />
  )
}

export default function PileCapDesign() {
  const [form, setForm] = useState<FormState>(DEFAULTS)
  const [lh, setLh] = useState<LetterheadState>({ project: '', sheet: 'PC-01 · Rev A', preparedBy: '' })
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setForm(s => ({ ...s, [k]: v }))

  const valid = Object.values(form).every(v => typeof v === 'string' || Number.isFinite(v as number))
    && form.serviceLoad > 0 && form.ultimateLoad > 0
    && form.pileCapacity > 0 && form.spacing > 0 && form.edgeDist > 0

  const result = useMemo(() => {
    if (!valid) return null
    return designPileCap({
      serviceLoad: form.serviceLoad,
      serviceMomX: form.serviceMomX,
      serviceMomY: form.serviceMomY,
      ultimateLoad: form.ultimateLoad,
      ultimateMomX: form.ultimateMomX,
      ultimateMomY: form.ultimateMomY,
      nPiles: form.nPiles,
      pileDia: form.pileDia,
      pileCapacity: form.pileCapacity,
      spacing: form.spacing,
      edgeDist: form.edgeDist,
      colX: form.colX,
      colY: form.colY,
      fc: form.fc,
      fy: form.fy,
      cover: form.cover,
      barDia: form.barDia,
      pileEmbed: form.pileEmbed,
    })
  }, [form, valid])

  const allOK = result && result.capacityOK && result.punchColOK && result.punchPileOK
    && result.beamXOK && result.beamYOK && result.ldOK

  return (
    <div>
      <PageHeader title="Pile Cap" badges={['ACI 318-14', 'NSCP 2015']}
        actions={
          <button type="button" onClick={() => { const prev = document.title; document.title = `Pile Cap Design Report${lh.project ? ` — ${lh.project}` : ''}`; window.print(); window.setTimeout(() => { document.title = prev }, 500) }}
            className="inline-flex items-center gap-2 rounded-md bg-[#0f4c92] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[#0d3f78]">⎙ Export report</button>
        } />
      <div className="mx-auto max-w-6xl px-5 pb-8 sm:px-7">

      <div className="no-print mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]">
        {/* ── Inputs ── */}
        <div className="space-y-5">
          <Card title="Column Loads">
            <NumField label={<>Service <KTex tex="P" /></>} unit="kN" value={form.serviceLoad} onChange={set('serviceLoad')} />
            <NumField label={<>Service <KTex tex="M_x" /></>} unit="kN·m" value={form.serviceMomX} onChange={set('serviceMomX')} />
            <NumField label={<>Service <KTex tex="M_y" /></>} unit="kN·m" value={form.serviceMomY} onChange={set('serviceMomY')} />
            <NumField label={<>Factored <KTex tex="P_u" /></>} unit="kN" value={form.ultimateLoad} onChange={set('ultimateLoad')} />
            <NumField label={<>Factored <KTex tex="M_{ux}" /></>} unit="kN·m" value={form.ultimateMomX} onChange={set('ultimateMomX')} />
            <NumField label={<>Factored <KTex tex="M_{uy}" /></>} unit="kN·m" value={form.ultimateMomY} onChange={set('ultimateMomY')} />
          </Card>

          <Card title="Pile & Cap Geometry">
            <SelectField<PileArrangement>
              label="Number of piles"
              value={form.nPiles}
              onChange={v => set('nPiles')(Number(v) as PileArrangement)}
              options={[
                [2, '2 piles (linear)'],
                [3, '3 piles (triangular)'],
                [4, '4 piles (square)'],
                [6, '6 piles (2 × 3)'],
                [9, '9 piles (3 × 3)'],
              ]}
            />
            <NumField label="Pile diameter" unit="mm" value={form.pileDia} onChange={set('pileDia')} step="50" />
            <NumField label="Pile capacity (service)" unit="kN" value={form.pileCapacity} onChange={set('pileCapacity')} />
            <NumField label="Pile spacing (c/c)" unit="mm" value={form.spacing} onChange={set('spacing')} step="50" />
            <NumField label="Edge distance" unit="mm" value={form.edgeDist} onChange={set('edgeDist')} step="25" />
            <NumField label="Pile embedment" unit="mm" value={form.pileEmbed} onChange={set('pileEmbed')} step="25" />
          </Card>

          <Card title="Column">
            <NumField label={<>Width <KTex tex="c_x" /></>} unit="mm" value={form.colX} onChange={set('colX')} step="25" />
            <NumField label={<>Width <KTex tex="c_y" /></>} unit="mm" value={form.colY} onChange={set('colY')} step="25" />
          </Card>

          <Card title="Materials & Detailing">
            <NumField label={<KTex tex="f'_c" />} unit="MPa" value={form.fc} onChange={set('fc')} />
            <NumField label={<KTex tex="f_y" />} unit="MPa" value={form.fy} onChange={set('fy')} />
            <NumField label={<>Bar <KTex tex="d_b" /></>} unit="mm" value={form.barDia} onChange={set('barDia')} />
            <NumField label="Clear cover" unit="mm" value={form.cover} onChange={set('cover')} />
          </Card>
        </div>

        {/* ── Results ── */}
        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          {/* Schematic */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Cap plan</h2>
            {result ? (
              <PileCapSchematic
                capBx={result.capBx}
                capBy={result.capBy}
                coords={result.coords}
                pileDia={form.pileDia}
                colX={form.colX}
                colY={form.colY}
                reactions={result.reactions}
              />
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">Enter valid inputs to preview.</p>
            )}
          </div>

          {result && (
            <>
              {/* Summary banner */}
              <div className={`rounded-xl border p-3 text-center text-sm font-semibold shadow-sm ${
                allOK ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}>
                {allOK ? '✓ All checks pass' : '✗ One or more checks fail — review results below'}
              </div>

              {/* Cap geometry */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Cap geometry</h2>
                <Row label="Plan (Bx × By)"
                  value={`${f2(result.capBx / 1000)} × ${f2(result.capBy / 1000)} m`} />
                <Row label={<>Thickness <KTex tex="D_c" /></>} value={`${f0(result.Dc)} mm`} />
                <Row label={<>Effective depth <KTex tex="d" /></>} value={`${f0(result.d)} mm`} />
              </div>

              {/* Pile reactions */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Pile reactions (service)</h2>
                {result.reactions.map((r, i) => (
                  <Row key={i}
                    label={`Pile ${i + 1} (${(result.coords[i].x / 1000).toFixed(2)}, ${(result.coords[i].y / 1000).toFixed(2)}) m`}
                    value={`${f2(r)} kN`}
                    check={
                      <span className={r <= form.pileCapacity ? 'text-emerald-600' : 'text-rose-600'}>
                        ≤ {form.pileCapacity} kN {r <= form.pileCapacity ? '✓' : '✗'}
                      </span>
                    }
                  />
                ))}
              </div>

              {/* Shear checks */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Shear checks (factored)</h2>
                <CheckRow label="Column punching" Vu={result.VuPunchCol} phiVc={result.phiVcPunchCol} ok={result.punchColOK} />
                <CheckRow label="Pile punching (worst)" Vu={result.VuPunchPile} phiVc={result.phiVcPunchPile} ok={result.punchPileOK} />
                <CheckRow label={<>Beam shear — <KTex tex="x" /></>} Vu={result.VuBeamX} phiVc={result.phiVcBeamX} ok={result.beamXOK} />
                <CheckRow label={<>Beam shear — <KTex tex="y" /></>} Vu={result.VuBeamY} phiVc={result.phiVcBeamY} ok={result.beamYOK} />
              </div>

              {/* Flexure & steel */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Flexure & reinforcement</h2>
                <Row label={<>Design moment <KTex tex="M_{u,x}" /></>} value={`${f3(result.MuX)} kN·m`} />
                <Row label={<>Design moment <KTex tex="M_{u,y}" /></>} value={`${f3(result.MuY)} kN·m`} />
                {steelRow(<>Bars — <KTex tex="x" />-direction (bottom)</>, result.steelX, form.barDia)}
                {steelRow(<>Bars — <KTex tex="y" />-direction (bottom)</>, result.steelY, form.barDia)}
              </div>

              {/* Development length */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Development length</h2>
                <Row
                  label={<>Required <KTex tex="\ell_d" /></>}
                  value={`${f0(result.ldRequired)} mm`}
                />
                <Row
                  label="Available (column face to bar end)"
                  value={`${f0(result.ldAvailable)} mm`}
                  check={
                    <span className={result.ldOK ? 'text-emerald-600' : 'text-rose-600'}>
                      {result.ldOK ? '✓ OK' : '✗ Hooks required'}
                    </span>
                  }
                />
              </div>

              {/* Basis */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
                <h2 className="mb-1 text-[1.02rem] font-bold text-[#0056b3]">Basis</h2>
                <KTex block tex={String.raw`R_i = \frac{P}{N} + \frac{M_x \cdot y_i}{\sum y_i^2} + \frac{M_y \cdot x_i}{\sum x_i^2}`} />
                <p className="mt-1 text-xs text-slate-500">
                  NSCP 2015 / ACI 318-14. φ_v = 0.75, φ_f = 0.90.
                  Column punching at d/2 from column face; pile punching at d/2 from pile perimeter (§13.4.6).
                  One-way shear critical section at d from column face.
                  Development length per §25.5.1 (straight bar, no Ktr).
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="no-print mt-5"><LetterheadCard lh={lh} onChange={(patch) => setLh((v) => ({ ...v, ...patch }))} /></div>
      {result && (
        <PrintReport
          docTitle="Pile Cap" docCode="PC-01" badges={['ACI 318-14', 'NSCP 2015']}
          ok={!!allOK}
          governing={`Governing ratio ${globalThis.Math.max(
            result.VuPunchCol / result.phiVcPunchCol, result.VuPunchPile / result.phiVcPunchPile,
            result.VuBeamX / result.phiVcBeamX, result.VuBeamY / result.phiVcBeamY).toFixed(2)} across punching / beam shear`}
          lh={lh}
          stats={[
            { label: 'Cap plan', value: `${f2(result.capBx)} × ${f2(result.capBy)}`, unit: 'm' },
            { label: 'Thickness Dc', value: f0(result.Dc), unit: 'mm' },
            { label: 'Piles', value: `${form.nPiles}-⌀${form.pileDia}`, unit: 'mm' },
          ]}
          checks={[
            { name: 'Column punching Vu/φVc', ratio: result.VuPunchCol / result.phiVcPunchCol, ok: result.punchColOK },
            { name: 'Pile punching Vu/φVc', ratio: result.VuPunchPile / result.phiVcPunchPile, ok: result.punchPileOK },
            { name: 'One-way shear X Vu/φVc', ratio: result.VuBeamX / result.phiVcBeamX, ok: result.beamXOK },
            { name: 'One-way shear Y Vu/φVc', ratio: result.VuBeamY / result.phiVcBeamY, ok: result.beamYOK },
            { name: 'Development ld,req/avail', ratio: result.ldRequired / globalThis.Math.max(result.ldAvailable, 1e-9), ok: result.ldOK },
          ]}
          data={[
            ['Service / ultimate load', `${form.serviceLoad} / ${form.ultimateLoad} kN`],
            ['Moments MuX / MuY', `${result.MuX.toFixed(1)} / ${result.MuY.toFixed(1)} kN·m`],
            ['Pile capacity', `${form.pileCapacity} kN`], ['Pile spacing / edge', `${form.spacing} / ${form.edgeDist} mm`],
            ['Column', `${form.colX} × ${form.colY} mm`], ["Concrete f'c / fy", `${form.fc} / ${form.fy} MPa`],
            ['Effective depth d', `${result.d.toFixed(0)} mm`],
          ]}
          drawingTitle="Pile Cap Plan"
          drawing={<PileCapSchematic capBx={result.capBx} capBy={result.capBy} coords={result.coords}
            pileDia={form.pileDia} colX={form.colX} colY={form.colY} reactions={result.reactions} />}
        />
      )}
      </div>
    </div>
  )
}
