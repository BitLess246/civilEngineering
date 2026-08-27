// "Which of these do you actually work on?" — asked once, on first run.
//
// The catalog spans 11 groups from RC beams to septic sizing, and almost
// nobody uses all of it. This asks once and trims the home directory and the
// sidebar to the answer.
//
// ── WHO SEES IT ─────────────────────────────────────────────────────────────
// Anyone whose browser has no stored answer. That deliberately includes people
// who already had accounts before this shipped — the preference is new, so
// nobody has one, and silently defaulting them to "everything" would mean the
// feature only ever reaches new signups.
//
// ── IT IS DISMISSIBLE, AND SKIPPING IS A REAL ANSWER ────────────────────────
// "Show me everything" stores `ALL_PREFS` rather than storing nothing. Storing
// nothing would re-open this dialog on the next page load, which is how a
// one-time question turns into a thing people learn to dismiss without reading.
// Escape and the backdrop do the same, because a modal you cannot leave without
// answering is a wall, and this is a convenience.
//
// `ALL_PREFS` is `{ chosen: null }`, NOT the list of today's groups. A TICKED
// SELECTION IS A STANDING INSTRUCTION: a group that ships later is not in it,
// so it stays hidden. That is deliberate — somebody who said "I do concrete"
// should not find a masonry section in their sidebar next month. But somebody
// who clicked "show me everything" meant all of it, not these eleven, and
// freezing that into a list would make the button they clicked a lie the day
// the twelfth group appears.
//
// Nothing here is destructive: hiding a group changes navigation only. Every
// route, bookmark, deep link and ⌘K result keeps working, and the whole answer
// is editable afterwards at /profile.

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DisciplinePicker } from './DisciplinePicker'
import { prefsFromChosen, ALL_PREFS, CHOOSABLE_GROUPS } from '../lib/toolPrefs'
import { setToolPrefs } from '../lib/useToolPrefs'

export function WelcomeDialog({ onClose }: { onClose: () => void }) {
  // Starts with everything ticked. An empty grid reads as "opt in to each of
  // these" and pushes people to skip; a full one reads as "turn off what you
  // do not need", which is the question actually being asked.
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set(CHOOSABLE_GROUPS))

  // Skipping still WRITES, so the question is not asked again. See the note
  // above. Declared before the effect that uses it, and memoised so the key
  // listener is not torn down and rebuilt on every keystroke.
  const skip = useCallback(() => { setToolPrefs(ALL_PREFS); onClose() }, [onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') skip() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [skip])

  const toggle = (label: string) => setChosen((s) => {
    const next = new Set(s)
    if (!next.delete(label)) next.add(label)
    return next
  })

  const save = () => { setToolPrefs(prefsFromChosen(chosen, CHOOSABLE_GROUPS)); onClose() }

  const none = chosen.size === 0
  const all = chosen.size === CHOOSABLE_GROUPS.length

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-[#0f1b2a]/55 p-4 py-[6vh]"
      onMouseDown={skip} role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-[#e3e1da] bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="border-b border-[#e3e1da] bg-[#f7f5ef] px-6 py-4">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#a39d8d]">Getting to know you</p>
          <h2 id="welcome-title" className="mt-1 text-[19px] font-extrabold tracking-tight text-[#0f1b2a]">
            Which of these do you work on?
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#5c6675]">
            We will keep the home page and the sidebar to what you tick. Nothing is removed —
            every tool stays reachable by search and by link — and you can change this any time
            in your profile.
          </p>
        </div>

        <div className="px-6 py-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[12px] font-semibold text-slate-500">
              {chosen.size} of {CHOOSABLE_GROUPS.length} selected
            </span>
            <button type="button"
              onClick={() => setChosen(all ? new Set() : new Set(CHOOSABLE_GROUPS))}
              className="text-[12px] font-semibold text-[#0f4c92] hover:underline">
              {all ? 'Clear all' : 'Select all'}
            </button>
          </div>

          <DisciplinePicker chosen={chosen} onToggle={toggle} />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-[#e3e1da] bg-[#fbfaf7] px-6 py-4">
          <button type="button" onClick={save} disabled={none}
            className="rounded-lg bg-[#0f4c92] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#135caf] disabled:cursor-not-allowed disabled:opacity-50">
            Save and continue
          </button>
          <button type="button" onClick={skip}
            className="text-[13px] font-semibold text-slate-600 hover:text-[#0f4c92] hover:underline">
            Skip — show me everything
          </button>
          {none && (
            // Rather than silently accepting an empty answer and ignoring it
            // later, which would look like the setting did nothing.
            <span className="text-[12px] font-medium text-amber-700">
              Pick at least one, or use “Show me everything”.
            </span>
          )}
          <span className="ml-auto hidden text-[11.5px] text-slate-400 sm:inline">
            Change later in <Link to="/profile" className="underline">your profile</Link>
          </span>
        </div>
      </div>
    </div>
  )
}
