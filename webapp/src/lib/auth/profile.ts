// ─────────────────────────────────────────────────────────────────────────
// USER PROFILE — the details that go on a calculation sheet.
//
// An engineer types the same three things into the report letterhead on every
// page: their name, their licence number, their firm. This holds them once so
// the letterhead can start filled in.
//
// STORED LOCALLY, NOT IN THE ACCOUNT — deliberately.
//
// The original reason was that `user_metadata` was also where the billing
// webhook wrote `plan`, so a client able to PATCH its own metadata was a client
// able to try `plan: 'max'`. THAT REASON IS GONE: the plan moved to
// `app_metadata`, which only the service-role key can write, and a test pins
// that a plan planted in user_metadata is ignored.
//
// These stay local anyway, for a plainer reason: they are cosmetic and
// per-machine — a name and a firm printed on a sheet — and syncing them would
// buy a round trip and a conflict case for no benefit. If they ever need to
// follow an engineer between devices, user_metadata is now a safe home for
// them.
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
