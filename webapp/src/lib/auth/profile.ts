// ─────────────────────────────────────────────────────────────────────────
// USER PROFILE — the details that go on a calculation sheet.
//
// An engineer types the same three things into the report letterhead on every
// page: their name, their licence number, their firm. This holds them once so
// the letterhead can start filled in.
//
// STORED LOCALLY, NOT IN THE ACCOUNT — deliberately. Writing to Supabase
// `user_metadata` from the browser is possible, but that is the SAME field the
// billing webhook writes `plan` into, and a client that can PATCH its own
// metadata is a client that can try to set `plan: 'max'`. Row-level security
// would be the answer, and until that exists these preferences are worth far
// less than the risk of opening that door. They are cosmetic — a name printed
// on a sheet — so localStorage is the honest place for them.
//
// The consequence is stated in the UI: these follow the browser, not the login.
// ─────────────────────────────────────────────────────────────────────────

export interface Profile {
  /** Printed as "Prepared by" on every calculation sheet. */
  preparedBy: string
  /** PRC licence number, appended to the name when present. */
  licenseNo: string
  /** Firm or organisation, printed as the default project owner. */
  organisation: string
  /** Default project name for new sheets. */
  defaultProject: string
}

export const EMPTY_PROFILE: Profile = {
  preparedBy: '', licenseNo: '', organisation: '', defaultProject: '',
}

const KEY = 'civeng-profile'

type Store = Pick<Storage, 'getItem' | 'setItem'>

const defaultStore = (): Store | null => {
  try { return window.localStorage } catch { return null }
}

/** Read the saved profile. Never throws — a corrupt value reads as empty. */
export function loadProfile(store: Store | null = defaultStore()): Profile {
  try {
    const raw = store?.getItem(KEY)
    if (!raw) return { ...EMPTY_PROFILE }
    const parsed = JSON.parse(raw) as Partial<Profile>
    // field-by-field so an unexpected shape cannot inject junk into the sheet
    return {
      preparedBy: str(parsed.preparedBy),
      licenseNo: str(parsed.licenseNo),
      organisation: str(parsed.organisation),
      defaultProject: str(parsed.defaultProject),
    }
  } catch {
    return { ...EMPTY_PROFILE }
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim().slice(0, 120) : '')

/** Persist the profile. Silent on failure — private mode should not break a page. */
export function saveProfile(p: Profile, store: Store | null = defaultStore()): void {
  try { store?.setItem(KEY, JSON.stringify(p)) } catch { /* storage unavailable */ }
}

/**
 * The "Prepared by" line for a calculation sheet.
 *
 * Appends the licence number when there is one, because a sealed sheet names
 * both — and an engineer who filled the field in should not have to retype it
 * into the name every time.
 */
export function preparedByLine(p: Profile): string {
  const name = p.preparedBy.trim()
  const lic = p.licenseNo.trim()
  if (!name) return ''
  return lic ? `${name} · PRC ${lic}` : name
}

/** Letterhead defaults from the profile. Blank fields stay blank. */
export function letterheadDefaults(p: Profile): { project: string; preparedBy: string } {
  return { project: p.defaultProject.trim(), preparedBy: preparedByLine(p) }
}

/** Whether anything has been filled in — drives the "set up your profile" hint. */
export const hasProfile = (p: Profile): boolean =>
  Object.values(p).some((v) => v.trim().length > 0)
