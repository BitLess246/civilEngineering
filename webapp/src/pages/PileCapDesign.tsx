import { useMemo, useState, type ReactNode } from 'react'
import { clampTo } from '../lib/clamp'
import { designPileCap, pileCapSolution, type PileArrangement, type PileCapInput } from '../engine/pileCap'
import { PileCapSchematic } from '../components/PileCapSchematic'
import { InputGroup, CheckCard, ResultsTable, type ResultRow } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
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

function NumField({ label, unit, value, onChange, step = 'any', min, max }: {
  label: ReactNode; unit?: string; value: number; onChange: (v: number) => void; step?: string
  /** Bounds enforced on the VALUE, not only the spinner — the `min`/`max`
   *  attributes alone are advisory and a typed or pasted number goes straight
   *  through them. Same contract as the shared `Num`, whose `clampTo` this
   *  reuses; this page predates it and carries its own field. */
  min?: number; max?: number
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 font-medium text-muted">
        {label}{unit ? <span className="text-muted"> ({unit})</span> : null}
      </span>
      <input
        type="number" inputMode="decimal" step={step} min={min} max={max}
        value={Number.isFinite(value) ? value : ''}
        onChange={e => onChange(clampTo(parseFloat(e.target.value), min, max))}
        className="rounded-md border border-field-line px-2.5 py-1.5 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      />
    </label>
  )
}

function SelectField<T extends string | number>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: [T, string][]
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 font-medium text-muted">{label}</span>
      <select value={String(value)} onChange={e => onChange(e.target.value as T)}
        className="rounded-md border border-field-line px-2.5 py-1.5 text-ink focus:border-brand focus:outline-none">
        {options.map(([v, t]) => <option key={String(v)} value={String(v)}>{t}</option>)}
      </select>
    </label>
  )
}

/** Result row. `check` is a third column the shared `Row` calls `sub`; the name
 *  differs but the palette must not — this matches `components/qty`. */
export default function PileCapDesign() {
  const [form, setForm] = useState<FormState>(DEFAULTS)
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setForm(s => ({ ...s, [k]: v }))

  const valid = Object.values(form).every(v => typeof v === 'string' || Number.isFinite(v as number))
    && form.serviceLoad > 0 && form.ultimateLoad > 0
    && form.pileCapacity > 0 && form.spacing > 0 && form.edgeDist > 0

  // The solver input is memoised separately from the result: the worked
  // solution needs the same inputs the solve used, and rebuilding the object
  // at render would be a second source of truth.
  const solverInput: PileCapInput = useMemo(() => ({
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
  }), [form])

  const result = useMemo(() => (valid ? designPileCap(solverInput) : null), [solverInput, valid])

  const allOK = result && result.capacityOK && result.punchColOK && result.punchPileOK
    && result.beamXOK && result.beamYOK && result.ldOK

  const r = result
  const maxR = r ? globalThis.Math.max(...r.reactions) : 0
  const ratios = r ? {
    cap: maxR / form.pileCapacity,
    pc: r.VuPunchCol / r.phiVcPunchCol, pp: r.VuPunchPile / r.phiVcPunchPile,
    bx: r.VuBeamX / r.phiVcBeamX, by: r.VuBeamY / r.phiVcBeamY,
    ld: r.ldRequired / globalThis.Math.max(r.ldAvailable, 1e-9),
  } : null
  const plan = r ? `${f2(r.capBx / 1000)} × ${f2(r.capBy / 1000)}` : ''
  const report = r && ratios ? {
    docCode: 'PC-01',
    ok: !!allOK,
    governing: `Governing ratio ${globalThis.Math.max(ratios.pc, ratios.pp, ratios.bx, ratios.by).toFixed(2)} across punching / beam shear · pile reaction ${f2(maxR)} / ${form.pileCapacity} kN`,
    stats: [
      // capBx / capBy are mm — the report used to print them as metres
      { label: 'Cap plan', value: plan, unit: 'm' },
      { label: 'Thickness Dc', value: f0(r.Dc), unit: 'mm' },
      { label: 'Piles', value: `${form.nPiles}-⌀${form.pileDia}`, unit: 'mm' },
    ],
    checks: [
      { name: 'Pile reaction R,max / capacity', ratio: ratios.cap, ok: r.capacityOK },
      { name: 'Column punching Vu/φVc', ratio: ratios.pc, ok: r.punchColOK },
      { name: 'Pile punching Vu/φVc', ratio: ratios.pp, ok: r.punchPileOK },
      { name: 'One-way shear X Vu/φVc', ratio: ratios.bx, ok: r.beamXOK },
      { name: 'One-way shear Y Vu/φVc', ratio: ratios.by, ok: r.beamYOK },
      { name: 'Development ld,req/avail', ratio: ratios.ld, ok: r.ldOK },
    ],
    data: [
      ['Service / ultimate load', `${form.serviceLoad} / ${form.ultimateLoad} kN`],
      ['Moments MuX / MuY', `${r.MuX.toFixed(1)} / ${r.MuY.toFixed(1)} kN·m`],
      ['Pile capacity', `${form.pileCapacity} kN`], ['Pile spacing / edge', `${form.spacing} / ${form.edgeDist} mm`],
      ['Column', `${form.colX} × ${form.colY} mm`], ["Concrete f'c / fy", `${form.fc} / ${form.fy} MPa`],
      ['Effective depth d', `${r.d.toFixed(0)} mm`],
    ] as [string, string][],
    steps: pileCapSolution(solverInput, r),
    drawingTitle: 'Pile Cap Plan',
  } : undefined
  const steel = (label: string, st: { bars: number; spacing: number; As: number; usedMin: boolean; rho: number }): ResultRow => ({
    check: label, basis: st.usedMin ? 'minimum steel' : `ρ ${st.rho.toFixed(4)}`, demand: `As ${f0(st.As)} mm²`,
    limit: `${st.bars} ⌀${form.barDia} @ ${f0(st.spacing)} mm`, status: 'info',
  })
  const reactionRows: ResultRow[] = r ? r.reactions.map((R, i) => ({
    check: `Pile ${i + 1}`, basis: `(${(r.coords[i].x / 1000).toFixed(2)}, ${(r.coords[i].y / 1000).toFixed(2)}) m`,
    demand: `${f2(R)} kN`, limit: `${form.pileCapacity} kN`, ratio: R / form.pileCapacity,
    status: R <= form.pileCapacity ? 'pass' : 'fail',
  })) : []
  const shear = (ok: boolean) => (ok ? 'pass' as const : 'fail' as const)

  return (
    <WorkspacePage title="Pile Cap" badges={['Foundations', 'ACI 318-14 · NSCP 2015']}
      intro="A rigid pile cap under axial load and biaxial moment. Pile reactions by R = P/N ± M·y/Σy² ± M·x/Σx²; the depth is the least that passes column punching, pile punching and one-way shear each way; then bottom steel each way and its development past the column face."
      report={report}
      inputs={<>

          <InputGroup title="Column Loads">
            <NumField label={<>Service <KTex tex="P" /></>} unit="kN" value={form.serviceLoad} onChange={set('serviceLoad')} />
            <NumField label={<>Service <KTex tex="M_x" /></>} unit="kN·m" value={form.serviceMomX} onChange={set('serviceMomX')} />
            <NumField label={<>Service <KTex tex="M_y" /></>} unit="kN·m" value={form.serviceMomY} onChange={set('serviceMomY')} />
            <NumField label={<>Factored <KTex tex="P_u" /></>} unit="kN" value={form.ultimateLoad} onChange={set('ultimateLoad')} />
            <NumField label={<>Factored <KTex tex="M_{ux}" /></>} unit="kN·m" value={form.ultimateMomX} onChange={set('ultimateMomX')} />
            <NumField label={<>Factored <KTex tex="M_{uy}" /></>} unit="kN·m" value={form.ultimateMomY} onChange={set('ultimateMomY')} />
          </InputGroup>

          <InputGroup title="Pile & Cap Geometry">
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
            <NumField label="Pile diameter" unit="mm" value={form.pileDia} onChange={set('pileDia')} step="50" min={1} />
            <NumField label="Pile capacity (service)" unit="kN" value={form.pileCapacity} onChange={set('pileCapacity')} min={1} />
            <NumField label="Pile spacing (c/c)" unit="mm" value={form.spacing} onChange={set('spacing')} step="50" min={1} />
            <NumField label="Edge distance" unit="mm" value={form.edgeDist} onChange={set('edgeDist')} step="25" min={1} />
            <NumField label="Pile embedment" unit="mm" value={form.pileEmbed} onChange={set('pileEmbed')} step="25" min={0} />
          </InputGroup>

          <InputGroup title="Column">
            <NumField label={<>Width <KTex tex="c_x" /></>} unit="mm" value={form.colX} onChange={set('colX')} step="25" min={1} />
            <NumField label={<>Width <KTex tex="c_y" /></>} unit="mm" value={form.colY} onChange={set('colY')} step="25" min={1} />
          </InputGroup>

          <InputGroup title="Materials & Detailing">
            <NumField label={<KTex tex="f'_c" />} unit="MPa" value={form.fc} onChange={set('fc')} min={1} />
            <NumField label={<KTex tex="f_y" />} unit="MPa" value={form.fy} onChange={set('fy')} min={1} />
            <NumField label={<>Bar <KTex tex="d_b" /></>} unit="mm" value={form.barDia} onChange={set('barDia')} min={1} />
            <NumField label="Clear cover" unit="mm" value={form.cover} onChange={set('cover')} min={0} />
          </InputGroup>
              </>}
      checks={r && ratios ? <>
        <CheckCard title="Pile reactions" basis="service, rigid cap" status={r.capacityOK ? 'pass' : 'fail'}
          value={f2(maxR)} unit="kN max" ratio={ratios.cap} ratioLabel="R ÷ capacity"
          pairs={[{ label: 'Capacity', value: `${form.pileCapacity} kN` }, { label: 'Piles', value: `${form.nPiles} × ⌀${form.pileDia}` }]} />
        <CheckCard title="Punching" basis="column and worst pile, d/2" status={r.punchColOK && r.punchPileOK ? 'pass' : 'fail'}
          value={f0(r.Dc)} unit="mm thick" ratio={globalThis.Math.max(ratios.pc, ratios.pp)} ratioLabel="worst Vu ÷ φVc"
          pairs={[{ label: 'Column', value: `${f0(r.VuPunchCol)} / ${f0(r.phiVcPunchCol)} kN` }, { label: 'Pile', value: `${f0(r.VuPunchPile)} / ${f0(r.phiVcPunchPile)} kN` }]} />
        <CheckCard title="One-way shear" basis="at d from the column face" status={r.beamXOK && r.beamYOK ? 'pass' : 'fail'}
          value={f0(r.d)} unit="mm d" ratio={globalThis.Math.max(ratios.bx, ratios.by)} ratioLabel="worst Vu ÷ φVc"
          pairs={[{ label: 'x', value: `${f0(r.VuBeamX)} / ${f0(r.phiVcBeamX)} kN` }, { label: 'y', value: `${f0(r.VuBeamY)} / ${f0(r.phiVcBeamY)} kN` }]} />
        <CheckCard title="Development" basis="straight bar past the column face" status={r.ldOK ? 'pass' : 'fail'}
          value={f0(r.ldRequired)} unit="mm req." ratio={ratios.ld} ratioLabel="ld ÷ available"
          pairs={[{ label: 'Available', value: `${f0(r.ldAvailable)} mm` }, { label: 'If short', value: 'hook the bars' }]} />
      </> : <p className="text-sm text-muted">Enter valid inputs to see results.</p>}
      summary={[
        { label: 'Column', value: `${form.colX} × ${form.colY} mm, P ${form.serviceLoad} / Pu ${form.ultimateLoad} kN` },
        { label: 'Moments', value: `service ${form.serviceMomX} / ${form.serviceMomY}, factored ${form.ultimateMomX} / ${form.ultimateMomY} kN·m` },
        { label: 'Piles', value: `${form.nPiles} × ⌀${form.pileDia} mm at ${form.spacing} mm, edge ${form.edgeDist} mm, ${form.pileCapacity} kN each` },
        { label: 'Materials', value: `f′c ${form.fc}, fy ${form.fy} MPa, ⌀${form.barDia}, cover ${form.cover} mm` },
      ]}
      drawing={r ? { title: 'Cap plan', node: <div data-pdf-drawing>
        <PileCapSchematic d={r.d} capBx={r.capBx} capBy={r.capBy} coords={r.coords}
          pileDia={form.pileDia} colX={form.colX} colY={form.colY} reactions={r.reactions} />
      </div> } : undefined}
      resultsCaption="φv = 0.75, φf = 0.90. Column punching at d/2 from the column face; pile punching at d/2 from the pile perimeter; one-way shear at d from the column face; development length as a straight bar with no Ktr."
      results={r && ratios ? [
        { check: 'Cap plan', basis: 'Bx × By', demand: `${plan} m`, status: 'info' },
        { check: 'Thickness / effective depth', basis: 'Dc / d', demand: `${f0(r.Dc)} / ${f0(r.d)} mm`, status: 'info' },
        { check: 'Column punching', basis: 'two-way, d/2', demand: `${f0(r.VuPunchCol)} kN`, limit: `${f0(r.phiVcPunchCol)} kN`, ratio: ratios.pc, status: shear(r.punchColOK) },
        { check: 'Pile punching (worst)', basis: 'two-way, d/2', demand: `${f0(r.VuPunchPile)} kN`, limit: `${f0(r.phiVcPunchPile)} kN`, ratio: ratios.pp, status: shear(r.punchPileOK) },
        { check: 'One-way shear — x', basis: 'at d from face', demand: `${f0(r.VuBeamX)} kN`, limit: `${f0(r.phiVcBeamX)} kN`, ratio: ratios.bx, status: shear(r.beamXOK) },
        { check: 'One-way shear — y', basis: 'at d from face', demand: `${f0(r.VuBeamY)} kN`, limit: `${f0(r.phiVcBeamY)} kN`, ratio: ratios.by, status: shear(r.beamYOK) },
        { check: 'Design moments', basis: 'Mu,x / Mu,y', demand: `${f3(r.MuX)} / ${f3(r.MuY)} kN·m`, status: 'info' },
        steel('Bars — x (bottom)', r.steelX),
        steel('Bars — y (bottom)', r.steelY),
        { check: 'Development', basis: 'column face to bar end', demand: `${f0(r.ldRequired)} mm`, limit: `${f0(r.ldAvailable)} mm`, ratio: ratios.ld, status: r.ldOK ? 'pass' : 'fail' },
      ] : []}
      extraSections={r ? [{ title: 'Pile reactions (service)', node: <ResultsTable rows={reactionRows} /> }] : []}
      steps={report?.steps ?? []}
      references={[
        { topic: 'Pile reactions', basis: 'R = P/N + M·y/Σy² + M·x/Σx²', source: 'rigid-cap assumption; Bowles, Foundation Analysis and Design' },
        { topic: 'Pile caps', basis: 'punching around column and piles; one-way shear', source: 'ACI 318-14 §13.4.6, §22.5, §22.6 · NSCP 2015 §413' },
        { topic: 'Development length', basis: 'straight bars in tension', source: 'ACI 318-14 §25.4.2' },
      ]}
    />
  )
}
