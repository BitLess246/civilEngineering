// Code Library — the NSCP visualizer. `/codes` is the shelf (search, edition,
// disciplines, bookmarks, recently viewed); `/codes/:id` is one provision in
// three panels: the code tree, the live diagram, and the equations explained
// term by term with the checks and the calculator that applies them.
//
// The content is lib/codes; this page only lays it out. What it shows is
// Zeta's own explanation and the equation as Zeta's engine evaluates it — the
// verification badge says exactly that, and nothing on the page claims a
// review against the authorized code that has not happened.
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  CODE_EDITIONS, provisionById, rcBeamProvision, searchProvisions, shelves, CATEGORY_LABEL,
  BEAM_LAYERS, runProvision, walkOf, flowOf,
  type Provision, type BeamExampleInput, type SteelExampleInput, type LoadExampleInput, type CheckState, type BeamLayer,
} from '../lib/codes'
import { Math as TeX } from '../lib/math'
import { Num } from '../components/qty'
import { WorkedSolution } from '../components/WorkedSolution'
import { BeamFlexureDiagram, BeamShearDiagram } from '../components/codes/RcBeamDiagram'
import { CodeFlowchart } from '../components/codes/CodeFlowchart'
import { SteelLtbCurve, SteelShearWeb, SteelColumnCurve, LoadCombosChart } from '../components/codes/SteelDiagrams'
import { exampleFromQuery, fieldsFromQuery } from '../lib/codes/links'

// ── per-browser conveniences: bookmarks and recently viewed ───────────────
const BK = 'zeta-codes-bookmarks', RC = 'zeta-codes-recent'
const readList = (k: string): string[] => {
  try { const v = JSON.parse(localStorage.getItem(k) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [] } catch { return [] }
}
const writeList = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage blocked: still works, just forgets */ } }

const STATE_CLS: Record<CheckState, string> = {
  pass: 'border-ok-line bg-ok-tint text-ok',
  limit: 'border-warn-line bg-warn-tint text-warn',
  fail: 'border-fail-line bg-fail-tint text-fail',
}
const STATE_LABEL: Record<CheckState, string> = { pass: 'PASSES', limit: 'AT THE LIMIT', fail: 'FAILS' }

function VerificationBadge({ p }: { p: Provision }) {
  return p.verification === 'engine-matched'
    ? <span title="The equation shown is exactly what Zeta's engine computes, and a test holds this example to the engine. It has not been reviewed against an authorized copy of the code."
        className="rounded border border-ok-line bg-ok-tint px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ok">ENGINE-MATCHED</span>
    : <span className="rounded border border-warn-line bg-warn-tint px-1.5 py-0.5 font-mono text-[10px] font-semibold text-warn">PENDING REVIEW</span>
}

function ProvisionCard({ p }: { p: Provision }) {
  const firstRef = Object.values(p.refs)[0]
  return (
    <Link to={`/codes/${p.id}`} className="block rounded-lg border border-hairline bg-sheet p-3 transition-colors hover:border-brand-line hover:bg-brand-tint">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10.5px] text-faint">{firstRef.clause} · {p.component}</span>
        <VerificationBadge p={p} />
      </div>
      <p className="mt-1 text-[14px] font-semibold text-ink">{p.title}</p>
      <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted">{p.summary}</p>
    </Link>
  )
}

export default function CodeLibrary() {
  const { id } = useParams()
  const p = id ? provisionById(id) : undefined
  if (id && !p) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-10">
        <p className="text-sm text-muted">No provision called “{id}”. <Link className="text-brand underline" to="/codes">Back to the Code Library</Link></p>
      </div>
    )
  }
  return p ? <ProvisionView key={p.id} p={p} /> : <Landing />
}

// ── landing ────────────────────────────────────────────────────────────────
function Landing() {
  const [q, setQ] = useState('')
  const [edition, setEdition] = useState('NSCP 2015')
  const [bookmarks] = useState(() => readList(BK))
  const [recent] = useState(() => readList(RC))
  const hits = useMemo(() => searchProvisions(q), [q])
  const shelf = shelves()
  const pick = (ids: string[]) => ids.map(provisionById).filter((x): x is Provision => !!x)

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-6 sm:px-7">
      <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-brand">CODE LIBRARY</p>
      <h1 className="mt-1 text-[26px] font-extrabold tracking-tight text-ink">NSCP visualizer</h1>
      <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-muted">
        Code requirements explained with live diagrams, the equations term by term, worked examples computed by Zeta's
        own design engine, and a link to the calculator that applies them. Explanations are Zeta's own words with clause
        references — read the authorized code for the provision itself.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search provisions"
          placeholder="Search a topic, symbol or clause — try “shear”, “phi”, “409.6”…"
          className="h-11 min-w-0 flex-1 rounded-lg border border-field-line bg-field px-3 text-[14px] text-ink placeholder:text-faint" />
        <label className="flex items-center gap-2 text-[12px] text-muted">
          Edition
          <select value={edition} onChange={(e) => setEdition(e.target.value)} className="h-11 rounded-lg border border-field-line bg-field px-2 text-[13px] text-ink">
            {CODE_EDITIONS.map((e) => <option key={e.id} value={e.id} disabled={!e.available}>{e.id}</option>)}
          </select>
        </label>
      </div>

      {q.trim() ? (
        <section className="mt-6">
          <p className="mb-2 text-[12px] text-muted">{hits.length} provision{hits.length === 1 ? '' : 's'} match “{q.trim()}”</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{hits.map((h) => <ProvisionCard key={h.id} p={h} />)}</div>
        </section>
      ) : <>
        {(bookmarks.length > 0 || recent.length > 0) && (
          <section className="mt-6 grid gap-5 md:grid-cols-2">
            {bookmarks.length > 0 && <div><h2 className="mb-2 text-[13px] font-bold text-ink">Bookmarked</h2><div className="space-y-2">{pick(bookmarks).map((b) => <ProvisionCard key={b.id} p={b} />)}</div></div>}
            {recent.length > 0 && <div><h2 className="mb-2 text-[13px] font-bold text-ink">Recently viewed</h2><div className="space-y-2">{pick(recent).slice(0, 3).map((b) => <ProvisionCard key={b.id} p={b} />)}</div></div>}
          </section>
        )}
        {shelf.map((s) => (
          <section key={s.category} className="mt-7">
            <div className="mb-2 flex items-baseline gap-3">
              <h2 className="text-[16px] font-bold text-ink">{s.label}</h2>
              <span className="font-mono text-[11px] text-faint">{s.items.length ? `${s.items.length} provision${s.items.length === 1 ? '' : 's'}` : 'planned'}</span>
            </div>
            {s.items.length
              ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{s.items.map((it) => <ProvisionCard key={it.id} p={it} />)}</div>
              : <p className="text-[12px] text-faint">Not visualised yet — this shelf fills as its design engine is verified.</p>}
          </section>
        ))}
      </>}
    </div>
  )
}

// ── one provision ──────────────────────────────────────────────────────────
function ProvisionView({ p }: { p: Provision }) {
  const [search] = useSearchParams()
  // A link carries the calculator's example: an RC beam through the beam codec,
  // any other family screened by its own fields.
  const isRc = p.family === 'rc-beam'
  const linked = useMemo(() => (isRc ? exampleFromQuery(search) : fieldsFromQuery(search, p)), [isRc, search, p])
  const [inp, setInp] = useState<Record<string, number | string>>(() => ({ ...linked.inp }))
  const beam = inp as unknown as BeamExampleInput
  // keep a calculator's beam when moving between provisions
  const qs = linked.carried.length || linked.from ? `?${search.toString()}` : ''
  const [hl, setHl] = useState<string | null>(null)
  const [layers, setLayers] = useState<ReadonlySet<BeamLayer>>(() => new Set(BEAM_LAYERS.map((l) => l.id)))
  const [bookmarks, setBookmarks] = useState(() => readList(BK))
  const [tab, setTab] = useState<'diagram' | 'equations'>('diagram')
  const [step, setStep] = useState<number | null>(null)
  const ex = useMemo(() => runProvision(p, inp), [p, inp])
  const walk = useMemo(() => walkOf(p, inp), [p, inp])
  const flow = useMemo(() => flowOf(p, inp), [p, inp])
  const ws = step != null ? walk[step] : undefined
  const shownLayers = useMemo<ReadonlySet<BeamLayer>>(() => (ws ? new Set(ws.layers) : layers), [ws, layers])
  const shownHl = ws?.hl ?? hl
  // the RC drawings read the flexure and shear provisions' values whichever RC page is open
  const flex = useMemo(() => (isRc ? rcBeamProvision('rc-beam-flexure')!.evaluate(beam).values : {}), [isRc, beam])
  const shearV = useMemo(() => (isRc ? rcBeamProvision('rc-beam-shear')!.evaluate(beam).values : {}), [isRc, beam])
  const marked = bookmarks.includes(p.id)

  useEffect(() => { writeList(RC, [p.id, ...readList(RC).filter((x) => x !== p.id)].slice(0, 8)) }, [p.id])
  const toggleMark = () => {
    const next = marked ? bookmarks.filter((x) => x !== p.id) : [p.id, ...bookmarks]
    setBookmarks(next); writeList(BK, next)
  }
  const [edited, setEdited] = useState(false)
  const set = (k: string) => (v: number | string) => { setEdited(true); setInp((s) => ({ ...s, [k]: v })) }
  const sel = hl ? p.variables[hl] : null
  const selVal = hl != null ? ex.values[hl] : undefined
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(3))

  const tree = (
    <nav aria-label="Code library" className="space-y-4 text-[12.5px]">
      <Link to="/codes" className="text-brand hover:underline">← Code Library</Link>
      {shelves().filter((s) => s.items.length).map((s) => (
        <div key={s.category}>
          <p className="mb-1 font-mono text-[10.5px] font-semibold tracking-wide text-faint">{s.label.toUpperCase()}</p>
          <ul className="space-y-0.5">
            {s.items.map((it) => (
              <li key={it.id}>
                <Link to={`/codes/${it.id}${qs}`} aria-current={it.id === p.id ? 'page' : undefined}
                  className={`block rounded px-2 py-1 ${it.id === p.id ? 'bg-brand-tint font-semibold text-brand' : 'text-ink-2 hover:bg-sheet-2'}`}>{it.title}</Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div>
        <p className="mb-1 font-mono text-[10.5px] font-semibold tracking-wide text-faint">RELATED</p>
        <ul className="space-y-0.5">{p.related.map((r) => provisionById(r)).filter((x): x is Provision => !!x).map((r) => (
          <li key={r.id}><Link to={`/codes/${r.id}${qs}`} className="block rounded px-2 py-1 text-ink-2 hover:bg-sheet-2">{r.title}</Link></li>
        ))}</ul>
      </div>
    </nav>
  )

  const diagram = (
    <div className="space-y-3">
      <div className="rounded-lg border border-hairline bg-sheet p-3">
        {p.diagram === 'rc-beam-shear' ? <BeamShearDiagram i={beam} v={shearV} hl={hl} />
          : p.diagram === 'rc-beam-flexure' ? <BeamFlexureDiagram i={beam} v={flex} layers={shownLayers} hl={shownHl} />
            : p.diagram === 'steel-ltb-curve' ? <SteelLtbCurve i={inp as unknown as SteelExampleInput} hl={hl} />
              : p.diagram === 'steel-shear-web' ? <SteelShearWeb i={inp as unknown as SteelExampleInput} hl={hl} />
                : p.diagram === 'steel-column-curve' ? <SteelColumnCurve i={inp as unknown as SteelExampleInput} hl={hl} />
                  : <LoadCombosChart i={inp as unknown as LoadExampleInput} hl={hl} />}
        {walk.length > 0 && (
          <div className="mt-2 rounded-md border border-hairline bg-sheet-2 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-ink">
                {ws ? <>Step {step! + 1} of {walk.length} — {ws.title}</> : 'Build the diagram up one idea at a time'}
              </p>
              <div className="flex gap-1.5">
                {ws ? <>
                  <button type="button" disabled={step === 0} onClick={() => setStep((k) => Math.max(0, (k ?? 0) - 1))}
                    className="rounded border border-hairline px-2 py-0.5 text-[12px] text-ink-2 disabled:opacity-40">◀ Back</button>
                  {step! < walk.length - 1
                    ? <button type="button" onClick={() => setStep((k) => (k ?? 0) + 1)} className="rounded border border-brand-line bg-brand-tint px-2 py-0.5 text-[12px] font-semibold text-brand">Next ▶</button>
                    : <button type="button" onClick={() => setStep(null)} className="rounded border border-brand-line bg-brand-tint px-2 py-0.5 text-[12px] font-semibold text-brand">Done</button>}
                </> : <button type="button" onClick={() => setStep(0)} className="rounded border border-brand-line bg-brand-tint px-2 py-0.5 text-[12px] font-semibold text-brand">Step through ▶</button>}
              </div>
            </div>
            {ws && <div aria-live="polite" className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
              <p>{ws.text}</p>
              {ws.tex && <div className="mt-1 overflow-x-auto text-[14px]"><TeX tex={ws.tex} block /></div>}
            </div>}
          </div>
        )}
        {p.diagram === 'rc-beam-flexure' && (
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Diagram layers">
            {BEAM_LAYERS.map((l) => {
              const on = shownLayers.has(l.id)
              return (
                <button key={l.id} type="button" aria-pressed={on}
                  onClick={() => { setLayers(() => { const n = new Set(shownLayers); if (on) n.delete(l.id); else n.add(l.id); return n }); setStep(null) }}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] ${on ? 'border-brand-line bg-brand-tint font-semibold text-brand' : 'border-hairline text-muted'}`}>{l.label}</button>
              )
            })}
          </div>
        )}
      </div>
      <div className="rounded-lg border border-hairline bg-sheet p-3">
        <p className="mb-2 text-[12px] font-semibold text-muted">Try it — change the inputs and every number on the page follows</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {p.fields.map((f) => f.options
            ? (
              <label key={f.key} className="col-span-2 flex flex-col gap-1 text-[12px] text-muted">
                {f.label}
                <select value={String(inp[f.key])} onChange={(e) => set(f.key)(e.target.value)}
                  className="h-9 rounded-md border border-field-line bg-field px-2 text-[13px] text-ink">
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            )
            : <Num key={f.key} label={f.label} unit={f.unit} value={Number(inp[f.key])} onChange={set(f.key)} min={f.min} max={f.max} step={f.step} />)}
        </div>
      </div>
      {flow && (
        <div className="rounded-lg border border-hairline bg-sheet p-3">
          <p className="mb-2 text-[13px] font-bold text-ink">{flow.title}</p>
          <CodeFlowchart f={flow} />
          <p className="mt-1.5 text-[11px] text-faint">The solid route is this beam's. Change the inputs above and watch it move.</p>
        </div>
      )}
    </div>
  )

  const explain = (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {ex.checks.map((c) => (
          <div key={c.label} className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-[12.5px] ${STATE_CLS[c.state]}`}>
            <span className="font-semibold">{c.label}</span>
            <span className="font-mono">{fmt(c.demand)} / {fmt(c.capacity)} {c.unit} · {STATE_LABEL[c.state]}</span>
          </div>
        ))}
      </div>
      {p.equations.map((e) => (
        <div key={e.id} className="rounded-lg border border-hairline bg-sheet p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[12px] font-semibold text-ink">{e.label}</p>
            <span className="font-mono text-[10px] text-faint">{p.refs[e.ref].clause}</span>
          </div>
          <div className="my-1 overflow-x-auto text-[15px]"><TeX tex={e.tex} block /></div>
          {e.when && <p className="text-[11px] text-faint">Applies when {e.when}.</p>}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {e.vars.map((k) => (
              <button key={k} type="button" onClick={() => setHl(hl === k ? null : k)} aria-pressed={hl === k}
                className={`rounded border px-1.5 py-0.5 text-[12px] ${hl === k ? 'border-brand bg-brand-tint' : 'border-hairline hover:border-brand-line'}`}
                title={p.variables[k].name}><TeX tex={p.variables[k].tex} /></button>
            ))}
          </div>
        </div>
      ))}
      {sel && (
        <div role="status" className="rounded-lg border border-brand-line bg-brand-tint p-3 text-[12.5px]">
          <p className="font-semibold text-ink"><TeX tex={sel.tex} /> — {sel.name}</p>
          <p className="mt-0.5 text-muted">Unit: {sel.unit} · Role: {sel.role}{selVal !== undefined ? ` · Now: ${fmt(selVal)} ${sel.unit === '—' ? '' : sel.unit}` : ''}</p>
          {sel.note && <p className="mt-0.5 text-muted">{sel.note}</p>}
        </div>
      )}
      <div className="rounded-lg border border-hairline bg-sheet p-3 text-[12.5px]">
        <p className="mb-1 font-semibold text-ink">References — {Object.values(p.refs)[0].edition}</p>
        <ul className="space-y-0.5 text-muted">
          {Object.values(p.refs).map((r) => <li key={r.clause}><span className="font-mono text-ink-2">{r.clause}</span> {r.topic}{r.parallel ? <span className="text-faint"> · {r.parallel}</span> : null}</li>)}
        </ul>
      </div>
      {p.calculators.map((c) => (
        <Link key={c.to} to={c.to} className="block rounded-lg bg-brand px-4 py-2.5 text-center text-[13px] font-semibold text-on-solid hover:opacity-90">{c.label} →</Link>
      ))}
    </div>
  )

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-faint">{CATEGORY_LABEL[p.category]} · {p.component} · {Object.values(p.refs)[0].edition}</p>
          <h1 className="mt-0.5 text-[22px] font-extrabold tracking-tight text-ink">{p.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <VerificationBadge p={p} />
          <button type="button" onClick={toggleMark} aria-pressed={marked}
            className={`rounded-md border px-2.5 py-1 text-[12px] ${marked ? 'border-brand-line bg-brand-tint font-semibold text-brand' : 'border-hairline text-muted hover:text-ink'}`}>
            {marked ? '★ Bookmarked' : '☆ Bookmark'}
          </button>
        </div>
      </div>
      <p className="mt-2 max-w-4xl text-[14px] leading-relaxed text-ink-2">{p.summary}</p>
      {linked.from && (
        <div role="note" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-line bg-brand-tint px-3 py-2 text-[12.5px] text-ink-2">
          <p>
            Explaining the check from <span className="font-semibold text-ink">{linked.from.label}</span> with your {isRc ? 'beam' : p.family === 'steel' ? 'member' : 'loads'}'s numbers
            {edited ? ' (since edited here)' : ''}.
            {linked.from.layers ? ` Your design stacks ${linked.from.layers} bar layers; this page draws one layer, so its d and φMn differ from the calculator's.` : ''}
            {isRc && !(linked.carried as string[]).includes('s') && p.diagram === 'rc-beam-shear' ? ' No stirrups were adopted there, so the spacing shown is the library default.' : ''}
          </p>
          <span className="shrink-0 text-[11.5px] text-muted">{linked.from.label} is still open in its own tab.</span>
        </div>
      )}

      {/* phones: switch between the diagram and the equations */}
      <div className="mt-4 flex gap-1 border-b border-hairline lg:hidden" role="tablist">
        {(['diagram', 'equations'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-[13px] ${tab === t ? 'border-b-2 border-brand font-semibold text-brand' : 'text-muted'}`}>{t === 'diagram' ? 'Diagram' : 'Equations & checks'}</button>
        ))}
      </div>

      <div className="mt-4 grid items-start gap-5 lg:grid-cols-[190px_minmax(0,1fr)_minmax(0,380px)]">
        <aside className="hidden lg:block">{tree}</aside>
        <div className={tab === 'diagram' ? '' : 'hidden lg:block'}>{diagram}</div>
        <div className={tab === 'equations' ? '' : 'hidden lg:block'}>{explain}</div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-hairline bg-sheet p-4">
          <h2 className="text-[14px] font-bold text-ink">Why this check exists</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{p.why}</p>
        </div>
        <div className="rounded-lg border border-hairline bg-sheet p-4">
          <h2 className="text-[14px] font-bold text-ink">Common mistakes</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-ink-2">{p.mistakes.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      </div>

      <div className="mt-6">
        <WorkedSolution title={`Worked example — ${p.title}`} steps={[{ title: isRc ? 'This beam, step by step' : p.family === 'steel' ? 'This member, step by step' : 'These loads, combined', lines: ex.lines,
          note: `Computed by the same engine functions the ${p.calculators[0]?.label.replace(/^Open /, '') ?? 'calculator'} calculator uses.` }]} />
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-faint">
        {p.verification === 'engine-matched'
          ? 'ENGINE-MATCHED: the equations shown are the ones Zeta evaluates, and a test holds this example to the engine. '
          : 'PENDING REVIEW: explanatory content not yet backed by an engine path. '}
        Clause numbers are cited for navigation; this page does not reproduce the code and has not been reviewed against an authorized copy of {Object.values(p.refs)[0].edition}. It explains a check — it is not proof of compliance.
      </p>
    </div>
  )
}
