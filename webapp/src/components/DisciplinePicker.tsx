// The checkbox grid, shared by the first-run dialog and the profile page.
//
// One component for both so the two cannot drift into disagreeing about what
// the options are — the profile is where somebody goes to change an answer the
// dialog took, and a different list in each place would be its own bug.
//
// EACH ROW DESCRIBES ITSELF FROM THE CATALOG. The blurb under a group is the
// first few tool names in it, read from `SIDEBAR_GROUPS` at render time, not a
// hand-written sentence per group. Hand-written blurbs go stale the first time
// somebody adds a tool and forgets this file; naming the actual contents cannot.

import { SIDEBAR_GROUPS } from '../lib/tools'
import { PINNED_GROUPS, CHOOSABLE_GROUPS } from '../lib/toolPrefs'

/** "Beam Design · T-Beam Design · Column Design +7 more" */
function summarise(label: string): string {
  const g = SIDEBAR_GROUPS.find((x) => x.label === label)
  if (!g) return ''
  const shown = g.tools.slice(0, 3).map((t) => t.name)
  const rest = g.tools.length - shown.length
  return shown.join(' · ') + (rest > 0 ? ` +${rest} more` : '')
}

export function DisciplinePicker({
  chosen, onToggle,
}: {
  chosen: ReadonlySet<string>
  onToggle: (label: string) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {CHOOSABLE_GROUPS.map((label) => {
        const on = chosen.has(label)
        return (
          <label key={label}
            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3.5 py-2.5 transition-colors ${
              on ? 'border-[#0f4c92] bg-[#eaf1f9]' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
            <input type="checkbox" checked={on} onChange={() => onToggle(label)}
              className="mt-0.5 h-4 w-4 flex-none accent-[#0f4c92]" />
            <span className="min-w-0">
              <span className={`block text-[13px] font-bold ${on ? 'text-[#0f4c92]' : 'text-slate-700'}`}>{label}</span>
              <span className="mt-0.5 block font-mono text-[10.5px] leading-relaxed text-slate-500">{summarise(label)}</span>
            </span>
          </label>
        )
      })}
      {/* Pinned groups are listed rather than hidden, so the set on screen is
          the whole catalog and nobody hunts for a group that is simply not
          offered. Shown as fixed, not as an unchecked box they cannot tick. */}
      {PINNED_GROUPS.map((label) => (
        <div key={label} className="flex items-start gap-2.5 rounded-lg border border-dashed border-slate-200 px-3.5 py-2.5">
          <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-[3px] bg-slate-300 text-[10px] font-bold text-white" aria-hidden="true">✓</span>
          <span className="min-w-0">
            <span className="block text-[13px] font-bold text-slate-500">{label}</span>
            <span className="mt-0.5 block font-mono text-[10.5px] leading-relaxed text-slate-400">Always shown — {summarise(label)}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
