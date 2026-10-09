import { useState } from 'react'
import { loadProfile, letterheadDefaults } from './auth/profile'
import type { LetterheadState } from '../components/calc'

/**
 * The letterhead a report prints under — Project / Sheet / Prepared by, seeded
 * from the saved profile — plus the print action that titles the document.
 * Shared by `ReportControls` (the classic card) and the workspace layout, which
 * shows the same fields in its input rail and its report title block.
 */
export function useReportLetterhead(title: string) {
  // Seeded from the saved profile, as INITIAL state rather than an effect —
  // an effect would overwrite whatever the user had already typed on a
  // re-render, and this is a starting value, not a binding.
  const [defaults] = useState(() => letterheadDefaults(loadProfile()))
  const [project, setProject] = useState(defaults.project)
  const [sheet, setSheet] = useState('')
  const [preparedBy, setPreparedBy] = useState(defaults.preparedBy)
  const today = new Date().toISOString().slice(0, 10)
  const lh: LetterheadState = { project, sheet, preparedBy }
  const setLh = (p: Partial<LetterheadState>) => {
    if (p.project !== undefined) setProject(p.project)
    if (p.sheet !== undefined) setSheet(p.sheet)
    if (p.preparedBy !== undefined) setPreparedBy(p.preparedBy)
  }
  const print = () => {
    const prev = document.title
    document.title = title + (project ? ` — ${project}` : '')
    window.print()
    window.setTimeout(() => { document.title = prev }, 500)
  }
  return { lh, setLh, today, print }
}
