import type { LetterheadState } from '../components/calc'
import { loadProfile, letterheadDefaults } from './auth/profile'

/**
 * Starting letterhead for a page, pre-filled from the saved profile.
 *
 * Pages call this as `useState(() => initialLetterhead('S-01 · Rev A'))` so the
 * engineer's name and project arrive already typed. The sheet number stays
 * per-page: it identifies the drawing, not the person.
 *
 * Lives here rather than in `components/calc` because that file may only export
 * components — the repo's fast-refresh rule, and a reasonable boundary anyway.
 */
export const initialLetterhead = (sheet = ''): LetterheadState => {
  const d = letterheadDefaults(loadProfile())
  return { project: d.project, sheet, preparedBy: d.preparedBy }
}
