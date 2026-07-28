import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DOC_TOOLS } from '../lib/docsContent'
import { DOC_GROUPS, countControls, matchesQuery, type DocTool, type DocControl } from '../lib/docsModel'

const KIND_TAG: Record<NonNullable<DocControl['kind']>, { label: string; cls: string }> = {
  field: { label: 'field', cls: 'bg-sky-50 text-sky-700' },
  choice: { label: 'choice', cls: 'bg-violet-50 text-violet-700' },
  toggle: { label: 'toggle', cls: 'bg-amber-50 text-amber-700' },
  button: { label: 'button', cls: 'bg-emerald-50 text-emerald-700' },
  tab: { label: 'tab', cls: 'bg-teal-50 text-teal-700' },
  output: { label: 'result', cls: 'bg-slate-100 text-slate-600' },
}

function ControlTable({ controls }: { controls: DocControl[] }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-left uppercase tracking-wide text-slate-500">
            <th className="w-8 py-1 pr-2 font-semibold" />
            <th className="py-1 pr-3 font-semibold">Control</th>
            <th className="py-1 pr-3 font-semibold">Unit</th>
            <th className="py-1 font-semibold">What it does</th>
          </tr>
        </thead>
        <tbody>
          {controls.map((c) => {
            const tag = KIND_TAG[c.kind ?? 'field']
            return (
              <tr key={c.name} className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-2">
                  <span className={`rounded px-1 py-px text-[9px] font-semibold uppercase ${tag.cls}`}>{tag.label}</span>
                </td>
                <td className="py-1.5 pr-3 font-medium text-slate-800">{c.name}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap text-slate-500">{c.unit ?? '—'}</td>
                <td className="py-1.5 leading-5 text-slate-700">
                  {c.what}
                  {c.default && <span className="text-slate-500"> Default: {c.default}.</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ToolDoc({ t }: { t: DocTool }) {
  return (
    <section id={t.id} className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-bold text-[#0f4c92]">{t.name}</h2>
        <a href={`#${t.id}`} className="text-[11px] text-slate-400 hover:text-[#0056b3]" aria-label={`Link to ${t.name}`}>#</a>
        <Link to={t.route} className="ml-auto rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-[#0f4c92] hover:border-[#0f4c92] hover:bg-blue-50">
          Open tool →
        </Link>
      </div>
      <p className="mt-1 text-sm leading-6 text-slate-700">{t.summary}</p>
      {t.basis && (
        <p className="mt-1 text-[11px] text-slate-500"><span className="font-semibold">Basis:</span> {t.basis}</p>
      )}
      {t.sections.map((s) => (
        <div key={s.id} id={`${t.id}-${s.id}`} className="mt-4 scroll-mt-6 border-t border-slate-100 pt-3">
          <h3 className="text-[13px] font-bold text-slate-800">{s.title}</h3>
          {s.body && <p className="mt-1 text-xs leading-6 text-slate-600">{s.body}</p>}
          {s.controls && s.controls.length > 0 && <ControlTable controls={s.controls} />}
          {s.notes && s.notes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {s.notes.map((n) => (
                <li key={n} className="flex gap-2 text-xs leading-5 text-slate-600">
                  <span className="text-slate-300">•</span><span>{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  )
}

export default function Documentation() {
  const [q, setQ] = useState('')
  const shown = useMemo(() => DOC_TOOLS.filter((t) => matchesQuery(t, q)), [q])
  const total = useMemo(() => countControls(DOC_TOOLS), [])
  const shownControls = useMemo(() => countControls(shown), [shown])

  return (
    <main className="mx-auto max-w-[1400px] px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Reference</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Documentation</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        Every control in the app — each field, dropdown, checkbox, button, tab and result — with what it does and
        what changes downstream when you touch it. Labels are reproduced exactly as they appear on screen, so
        searching here for something you can see in the UI finds its explanation.{' '}
        <b>{total} controls</b> across <b>{DOC_TOOLS.length} entries</b>.
      </p>
      <p className="mt-2 max-w-3xl text-[11px] text-slate-500">
        Units follow the project convention throughout: geometry in m, section dimensions in mm, forces in kN,
        stresses in MPa. Where a page departs from that, the unit column says so.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search controls, tools, clauses…"
          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#0f4c92] focus:outline-none sm:w-96"
        />
        {q.trim() && (
          <span className="text-xs text-slate-500">
            {shown.length} tool{shown.length === 1 ? '' : 's'} · {shownControls} controls
            <button type="button" onClick={() => setQ('')} className="ml-2 text-[#0056b3] underline">clear</button>
          </span>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* ── contents ── */}
        <nav className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Contents</p>
          {DOC_GROUPS.map((g) => {
            const tools = shown.filter((t) => t.group === g)
            if (!tools.length) return null
            return (
              <div key={g} className="mb-3">
                <p className="text-[11px] font-bold text-slate-700">{g}</p>
                <ul className="mt-1 space-y-px border-l border-slate-200 pl-2">
                  {tools.map((t) => (
                    <li key={t.id}>
                      <a href={`#${t.id}`} className="block py-0.5 text-[11px] text-slate-600 hover:text-[#0056b3]">
                        {t.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </nav>

        {/* ── body ── */}
        <div className="space-y-8">
          {shown.length === 0 && (
            <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
              Nothing matches “{q}”. Every word has to match — try fewer of them.
            </p>
          )}
          {DOC_GROUPS.map((g) => {
            const tools = shown.filter((t) => t.group === g)
            if (!tools.length) return null
            return (
              <div key={g}>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">{g}</h2>
                <div className="space-y-5">
                  {tools.map((t) => <ToolDoc key={t.id} t={t} />)}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <p className="mt-10 text-[11px] text-slate-500">
        Codes: NSCP 2015 · ACI 318-14 · AISC 360-16 · NDS. Engine results are checked against independent hand
        calculations on the{' '}
        <Link to="/validation" className="text-[#0056b3] underline">validation page</Link>.
      </p>
    </main>
  )
}
