/**
 * Plan Studio — structural sheets drawn to the user's own numbers.
 *
 * Pick a plan type, set the frame, the member sizes and the steel, and the
 * sheets redraw: the same `PlanSheet`s the Model Space Plans tab draws from a
 * design, here drawn from the inputs (`lib/planStudio`). Every sheet comes
 * from one set of cages, so a bar count changed for the beams moves the
 * elevation, the cutting list and the bending schedule together.
 *
 * A drafting tool: what is entered is what is drawn, without a design check —
 * the page says so where the sheets are.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Num, Pick } from '../components/qty'
import { InputGroup } from '../components/workspace'
import { Sheet } from '../components/PlansPanel'
import { PlanViewer } from '../components/PlanViewer'
import { PdfSettingsButton } from '../components/ExportPdfButton'
import { planToSvg } from '../engine/planRenderer'
import { DEFAULT_STUDIO, STUDIO_KINDS, buildStudio, sheetsOf, type StudioInput, type StudioSheetKind } from '../lib/planStudio'
import { downloadDxfSet } from '../lib/downloadSvg'

const KEY = 'plan-studio.input'
const load = (): StudioInput => {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT_STUDIO, ...JSON.parse(raw) }
  } catch { /* a private window, or a value from an older shape */ }
  return DEFAULT_STUDIO
}
const save = (i: StudioInput) => { try { localStorage.setItem(KEY, JSON.stringify(i)) } catch { /* storage unavailable */ } }

const DIAS = [10, 12, 16, 20, 25, 28, 32] as const
const dia = (label: string, value: number, onChange: (v: number) => void) => (
  <Pick label={label} value={String(value)} onChange={(v) => onChange(Number(v))}
    options={DIAS.map((d) => [String(d), `⌀${d} mm`] as [string, string])} />
)

/** A list of lengths typed as "6, 6, 4.5" — kept as typed until it parses. */
function Lengths({ label, value, onChange, hint }: { label: string; value: number[]; onChange: (v: number[]) => void; hint?: string }) {
  const [text, setText] = useState(value.join(', '))
  const parsed = text.split(/[,\s]+/).filter(Boolean).map(Number)
  const ok = parsed.length > 0 && parsed.every((v) => Number.isFinite(v) && v > 0.5)
  return (
    <label className="col-span-2 flex flex-col text-sm">
      <span className="mb-1 text-[11.5px] font-semibold text-muted">{label} <span className="font-normal text-faint">m, comma-separated</span></span>
      <input value={text} inputMode="decimal" aria-invalid={!ok}
        onChange={(e) => {
          setText(e.target.value)
          const v = e.target.value.split(/[,\s]+/).filter(Boolean).map(Number)
          if (v.length && v.every((x) => Number.isFinite(x) && x > 0.5)) onChange(v)
        }}
        className={`font-mono text-[13px] ${ok ? '' : 'border-fail-line'}`} />
      <span className="mt-0.5 text-[10.5px] text-faint">{ok ? hint : 'Each length over 0.5 m — the last valid list is drawn.'}</span>
    </label>
  )
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="space-y-5 rounded-xl border border-hairline bg-sheet p-4">{children}</div>
}

export default function PlanStudio() {
  const [input, setInputState] = useState<StudioInput>(load)
  const [kind, setKind] = useState<StudioSheetKind>('plans')
  const [viewing, setViewing] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [appearance, setAppearance] = useState(false)
  const set = (patch: Partial<StudioInput>) => setInputState((o) => { const n = { ...o, ...patch }; save(n); return n })
  const setPart = <K extends 'beam' | 'column' | 'footing' | 'slabBars'>(k: K, patch: Partial<StudioInput[K]>) =>
    set({ [k]: { ...input[k], ...patch } } as Partial<StudioInput>)

  // Rebuilt from a SETTLED copy of the input, 350 ms after the last edit: a
  // rebuild designs and draws a frame on the main thread (≈0.3 s on the
  // sample frame, over a second on a large one), so typing "450" must not
  // rebuild three times. A bar-count edit reuses the designed frame
  // (`buildStudio`'s cache) and costs about half.
  const [settled, setSettled] = useState(input)
  useEffect(() => {
    const t = setTimeout(() => setSettled(input), 350)
    return () => clearTimeout(t)
  }, [input])
  const stale = settled !== input
  const result = useMemo(() => buildStudio(settled), [settled])
  const shown = useMemo(
    () => sheetsOf(result.sheets, kind).map((sheet) => ({ sheet, svg: planToSvg(sheet.drawing, 1100) })),
    [result, kind],
  )
  const meta = STUDIO_KINDS.find((k) => k.kind === kind)!

  const exportPdf = async () => {
    if (busy || shown.length === 0) return
    setBusy(true)
    try {
      const { generateSheetsPdf } = await import('../lib/sheetsPdf')
      await generateSheetsPdf({ title: `Plan Studio — ${meta.label}`, sheets: shown.map((s) => s.sheet) })
    } finally { setBusy(false) }
  }

  const b = input.beam, c = input.column, f = input.footing, sl = input.slabBars
  return (
    <div className="mx-auto max-w-[1840px] px-4 py-4 sm:px-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-ink">Plan Studio</h1>
        <p className="mt-1 max-w-3xl text-[13px] text-muted">
          Structural sheets drawn to your numbers — the frame, the member sizes and the steel in them. Plans, elevations,
          details, cutting lists and bending schedules all come from one set of bars, so a change shows up on every sheet.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Panel>
            <InputGroup title="Frame">
              <Lengths label="Bays along x" value={input.baysX} onChange={(v) => set({ baysX: v })} hint="grid lines A, B, C…" />
              <Lengths label="Bays along z" value={input.baysZ} onChange={(v) => set({ baysZ: v })} hint="grid lines 1, 2, 3…" />
              <Lengths label="Storey heights" value={input.storeyH} onChange={(v) => set({ storeyH: v })} hint="bottom up, up to 4" />
              <Num label="Slab" unit="mm" value={input.slab} onChange={(v) => set({ slab: v })} min={75} />
              <Num label="Cover" unit="mm" value={input.cover} onChange={(v) => set({ cover: v })} min={20} />
              <Num label="f′c" unit="MPa" value={input.fc} onChange={(v) => set({ fc: v })} min={17} />
              <Num label="fy" unit="MPa" value={input.fy} onChange={(v) => set({ fy: v })} min={230} />
            </InputGroup>
            <InputGroup title="Beams">
              <Num label="Width b" unit="mm" value={b.b} onChange={(v) => setPart('beam', { b: v })} min={150} />
              <Num label="Depth h" unit="mm" value={b.h} onChange={(v) => setPart('beam', { h: v })} min={200} />
              {dia('Main bars', b.barDia, (v) => setPart('beam', { barDia: v }))}
              {dia('Stirrups', b.stirrupDia, (v) => setPart('beam', { stirrupDia: v }))}
              <Num label="Top bars" unit="pcs" value={b.top} onChange={(v) => setPart('beam', { top: v })} min={2} max={16} step="1" />
              <Num label="Bottom bars" unit="pcs" value={b.bottom} onChange={(v) => setPart('beam', { bottom: v })} min={2} max={16} step="1" />
              <Num label="Stirrups at ends" unit="mm" value={b.sEnd} onChange={(v) => setPart('beam', { sEnd: v })} min={50} />
              <Num label="Stirrups at middle" unit="mm" value={b.sMid} onChange={(v) => setPart('beam', { sMid: v })} min={50} />
            </InputGroup>
            <InputGroup title="Columns">
              <Num label="Width b" unit="mm" value={c.b} onChange={(v) => setPart('column', { b: v })} min={200} />
              <Num label="Depth h" unit="mm" value={c.h} onChange={(v) => setPart('column', { h: v })} min={200} />
              {dia('Vertical bars', c.barDia, (v) => setPart('column', { barDia: v }))}
              <Num label="Bars" unit="pcs" value={c.bars} onChange={(v) => setPart('column', { bars: v })} min={4} max={32} step="1" />
              {dia('Ties', c.tieDia, (v) => setPart('column', { tieDia: v }))}
              <Num label="Tie spacing" unit="mm" value={c.tieSpacing} onChange={(v) => setPart('column', { tieSpacing: v })} min={50} />
            </InputGroup>
            <InputGroup title="Footings">
              <Num label="Side B" unit="m" value={f.B} onChange={(v) => setPart('footing', { B: v })} min={0.6} />
              <Num label="Thickness" unit="mm" value={f.Dc} onChange={(v) => setPart('footing', { Dc: v })} min={200} />
              {dia('Mat bars', f.barDia, (v) => setPart('footing', { barDia: v }))}
              <Num label="Bars each way" unit="pcs" value={f.bars} onChange={(v) => setPart('footing', { bars: v })} min={2} max={60} step="1" />
              <Num label="Founding depth" unit="m" value={f.depth} onChange={(v) => setPart('footing', { depth: v })} min={0.5} />
            </InputGroup>
            <InputGroup title="Slabs">
              {dia('Bars', sl.barDia, (v) => setPart('slabBars', { barDia: v }))}
              <span />
              <Num label="Bottom spacing" unit="mm" value={sl.bottom} onChange={(v) => setPart('slabBars', { bottom: v })} min={75} />
              <Num label="Top spacing" unit="mm" value={sl.top} onChange={(v) => setPart('slabBars', { top: v })} min={75} />
            </InputGroup>
            <button type="button" onClick={() => setInputState(() => { save(DEFAULT_STUDIO); return DEFAULT_STUDIO })}
              className="rounded-md px-2 py-1 text-[12px] font-medium text-muted hover:bg-sheet-2">Reset to the sample frame</button>
          </Panel>
        </aside>

        <section className="min-w-0 space-y-4" aria-label="Sheets">
          <div role="radiogroup" aria-label="Plan type" className="flex flex-wrap gap-1.5">
            {STUDIO_KINDS.map((k) => (
              <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind} onClick={() => setKind(k.kind)}
                title={k.hint}
                className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${kind === k.kind
                  ? 'border-brand bg-brand text-on-solid' : 'border-hairline bg-sheet text-muted hover:bg-sheet-2 hover:text-ink'}`}>
                {k.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-muted">
              {meta.hint} · {shown.length} sheet{shown.length === 1 ? '' : 's'}{stale ? ' · redrawing…' : ''}
            </p>
            <span className="flex items-center gap-1.5">
              <button type="button" onClick={() => void exportPdf()} disabled={busy || shown.length === 0}
                className="rounded-md bg-brand px-3 py-1.5 text-[12px] font-semibold text-on-solid hover:bg-brand-hover disabled:opacity-50">
                {busy ? 'Building PDF…' : '⎙ PDF of these sheets'}
              </button>
              <PdfSettingsButton open={appearance} setOpen={setAppearance} />
              <button type="button" disabled={shown.length === 0}
                onClick={() => downloadDxfSet(`plan-studio-${kind}.dxf`, shown.map((s) => s.sheet.drawing))}
                className="rounded-md border border-hairline px-3 py-1.5 text-[12px] font-medium text-muted hover:bg-sheet-2 disabled:opacity-50">
                ↓ DXF
              </button>
            </span>
          </div>

          <p className="rounded-md border border-warn-line bg-warn-tint px-3 py-2 text-[12px] text-warn">
            Drawn to your numbers, not designed: nothing here is checked against the loads.
            Size members in the <Link to="/model" className="font-semibold underline">3D Model Space</Link> or the calculators, then draft them here.
          </p>
          {result.notes.map((n) => (
            <p key={n} className="rounded-md border border-hairline bg-sheet-2 px-3 py-2 text-[12px] text-muted">{n}</p>
          ))}
          {result.error && <p className="text-sm text-fail">{result.error}</p>}

          <div className={`space-y-4 transition-opacity ${stale ? 'opacity-60' : ''}`}>
            {shown.map(({ sheet, svg }, k) => (
              <Sheet key={sheet.key} sheet={sheet} svg={svg} onOpen={() => setViewing(k)} />
            ))}
          </div>
        </section>
      </div>

      {viewing != null && shown.length > 0 && (
        <PlanViewer sheets={shown} index={Math.min(viewing, shown.length - 1)} onNavigate={setViewing} onClose={() => setViewing(null)} />
      )}
    </div>
  )
}
