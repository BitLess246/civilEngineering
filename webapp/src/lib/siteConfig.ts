// ─────────────────────────────────────────────────────────────────────────
// BUSINESS IDENTITY — every legal/contact fact the public pages state.
//
// One file, because these details appear in the Terms, the Privacy Policy, the
// Refund Policy, the Contact page and the footer, and a business address that
// is right in four places and stale in the fifth is worse than one that is
// obviously missing everywhere.
//
// NOTHING HERE IS INVENTED. The blank fields are blank because they are facts
// only the business owner knows — a registered name, a TIN, a real street
// address. They appear in documents a customer and a payment provider will
// rely on, so a plausible-looking placeholder would be a lie printed under a
// heading that says "Terms and Conditions". `missingSiteFields()` lists what is
// still unset, and the legal pages show that list rather than pretending.
//
// Fill these in before taking a single payment.
// ─────────────────────────────────────────────────────────────────────────

export interface PostalAddress {
  line1: string
  line2?: string
  city: string
  province: string
  postalCode: string
  country: string
}

export interface SiteConfig {
  /** Trading name shown throughout the app. */
  tradeName: string
  /** Registered business name — DTI/SEC. Blank until registered. */
  legalName: string
  /** Registered business address. Must match the PayMongo application. */
  address: PostalAddress
  /** Where customers reach a human. */
  supportEmail: string
  /** Customer-service number given to PayMongo; shown to payers. */
  supportPhone: string
  /** BIR Tax Identification Number. */
  tin: string
  /** Public site origin, used for canonical links. */
  siteUrl: string
  /** Working hours line for the contact page. */
  supportHours: string
  /** Date the policies were last substantively revised. */
  policiesUpdated: string
}

export const SITE: SiteConfig = {
  tradeName: 'CivEng Toolkit',

  // ── FILL THESE IN ────────────────────────────────────────────────────
  legalName: '',
  address: {
    line1: '',
    city: '',
    province: '',
    postalCode: '',
    country: 'Philippines',
  },
  supportPhone: '',
  tin: '',
  siteUrl: '',
  // ─────────────────────────────────────────────────────────────────────

  // Already known: this is the support address given on the PayMongo
  // application. A domain address reads better to customers, but this is real
  // and reachable, which matters more than it looks.
  supportEmail: 'raymval246@gmail.com',

  supportHours: 'Monday to Friday, 9:00–18:00 (PST, UTC+8)',
  policiesUpdated: '30 July 2026',
}

/** Human labels for the fields a customer-facing document needs. */
const REQUIRED: [keyof SiteConfig | 'address', string][] = [
  ['legalName', 'Registered business name'],
  ['address', 'Registered business address'],
  ['supportEmail', 'Support email'],
  ['supportPhone', 'Customer service number'],
  ['siteUrl', 'Public site URL'],
]

/**
 * Which required details are still blank.
 *
 * Empty array means the public pages are complete. Anything else is rendered on
 * the page itself — the point is that an unfinished policy is visibly
 * unfinished rather than quietly wrong. TIN is deliberately NOT in this list:
 * it is needed for PayMongo onboarding and the BIR, not for a customer-facing
 * policy, and printing it publicly is a choice the owner should make
 * deliberately rather than by default.
 */
export function missingSiteFields(site: SiteConfig = SITE): string[] {
  const out: string[] = []
  for (const [key, label] of REQUIRED) {
    if (key === 'address') {
      const a = site.address
      if (!a.line1.trim() || !a.city.trim() || !a.province.trim() || !a.postalCode.trim()) out.push(label)
      continue
    }
    const v = site[key as keyof SiteConfig]
    if (typeof v === 'string' && !v.trim()) out.push(label)
  }
  return out
}

/** True when every customer-facing detail is filled in. */
export const isSiteConfigured = (site: SiteConfig = SITE): boolean =>
  missingSiteFields(site).length === 0

/** Address as display lines, skipping blanks. */
export function addressLines(a: PostalAddress = SITE.address): string[] {
  const cityLine = [a.city, a.province].filter((s) => s.trim()).join(', ')
  const postLine = [cityLine, a.postalCode].filter((s) => s.trim()).join(' ')
  return [a.line1, a.line2 ?? '', postLine, a.country].map((s) => s.trim()).filter(Boolean)
}

/** One-line address, for a footer or a meta tag. */
export const addressOneLine = (a: PostalAddress = SITE.address): string =>
  addressLines(a).join(', ')

/** The name to use in prose — registered name if known, else the trade name. */
export const businessName = (site: SiteConfig = SITE): string =>
  site.legalName.trim() || site.tradeName
