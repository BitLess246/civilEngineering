// Model Space's Code Compliance Inspector: every designed member as code
// checks, worst first. Picking a row selects the member in the 3D view;
// the selected row opens to its checks, each with its clause and — where the
// Code Library covers it — an "Explain" link that opens the provision with
// that member's own section and demand. The verdicts are the pipeline's own
// (lib/codes/inspector re-reads the design, it does not re-design).
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { InspectedMember, InspectState } from '../../lib/codes/inspector'
import { summarize } from '../../lib/codes/inspector'

const STATE_CLS: Record<InspectState, string> = {
  fail: 'border-fail-line bg-fail-tint text-fail',
  near: 'border-warn-line bg-warn-tint text-warn',
  pass: 'border-ok-line bg-ok-tint text-ok',
  unrated: 'border-hairline bg-sheet-2 text-muted',
}
const STATE_LABEL: Record<InspectState, string> = { fail: 'FAIL', near: 'NEAR LIMIT', pass: 'PASS', unrated: 'NO RATIO' }
const ORDER: InspectState[] = ['fail', 'near', 'pass', 'unrated']
const pct = (u: number | null) => (u === null ? '—' : `${(u * 100).toFixed(0)}%`)

export function ComplianceInspector({ items, selected, onSelect, colour, onColour }: {
  items: InspectedMember[]
  selected: string | null
  onSelect: (id: string) => void
  /** Whether the 3D view is tinted by compliance. */
  colour: boolean
  onColour: (on: boolean) => void
}) {
  const [show, setShow] = useState<ReadonlySet<InspectState>>(() => new Set(ORDER))
  const sum = useMemo(() => summarize(items), [items])
  const rows = items.filter((i) => show.has(i.state))
  const toggle = (s: InspectState) => setShow((cur) => {
    const n = new Set(cur)
    if (n.has(s) && n.size > 1) n.delete(s); else n.add(s)
    return n
  })

  return (
    <div className="col-span-full space-y-2.5" data-testid="compliance-inspector">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show members by state">
        {ORDER.map((s) => (
          <button key={s} type="button" aria-pressed={show.has(s)} onClick={() => toggle(s)}
            className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold ${show.has(s) ? STATE_CLS[s] : 'border-hairline text-faint line-through'}`}>
            {STATE_LABEL[s]} {sum[s]}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-[12px] text-ink-2">
        <input type="checkbox" checked={colour} onChange={(e) => onColour(e.target.checked)} className="h-3.5 w-3.5 accent-brand" />
        Colour the 3D model by compliance <span className="text-faint">(red fail · orange ≥ 90 % · green pass)</span>
      </label>
      <ul className="max-h-[420px] space-y-1 overflow-y-auto pr-1" aria-label="Members by compliance" tabIndex={0}>
        {rows.map((m) => {
          const open = m.id === selected
          return (
            <li key={`${m.kind}-${m.id}`} className={`rounded-md border ${open ? 'border-brand-line bg-brand-tint' : 'border-hairline bg-sheet'}`}>
              <button type="button" onClick={() => onSelect(m.id)} aria-expanded={open}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left">
                <span className={`w-[76px] flex-none rounded border px-1 py-0.5 text-center font-mono text-[10px] font-bold ${STATE_CLS[m.state]}`}>{STATE_LABEL[m.state]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-ink">{m.id} <span className="font-normal text-muted">· {m.kindLabel} · {m.section}</span></span>
                  <span className="block truncate text-[11px] text-faint">{m.detail}</span>
                </span>
                <span className="flex-none font-mono text-[12px] font-semibold text-ink-2">{pct(m.util)}</span>
              </button>
              {open && (
                <ul className="space-y-1 border-t border-hairline-2 px-2.5 py-2">
                  {m.checks.map((c) => (
                    <li key={c.name} className="flex flex-wrap items-baseline justify-between gap-x-2 text-[12px]">
                      <span className="min-w-0">
                        <span className={`mr-1.5 font-mono text-[10px] font-bold ${STATE_CLS[c.state].split(' ').pop()}`}>{STATE_LABEL[c.state]}</span>
                        <span className="text-ink">{c.name}</span>
                        <span className="block text-[11px] text-faint">{c.clause}{c.util !== null ? ` · ${pct(c.util)}` : ''}</span>
                      </span>
                      {c.explain
                        ? <Link to={c.explain} target="_blank" rel="noopener" className="flex-none text-[11.5px] font-semibold text-brand hover:underline">Explain ↗</Link>
                        : <span className="flex-none text-[11px] text-faint">not in the Code Library yet</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
        {rows.length === 0 && <li className="px-2 py-3 text-[12px] text-faint">No members in the states shown.</li>}
      </ul>
      <p className="text-[11px] leading-relaxed text-faint">
        Verdicts and ratios are the design's own — the same the schedules print. Clauses are cited for navigation;
        this is an inspection aid, not a certificate of compliance.
      </p>
    </div>
  )
}
