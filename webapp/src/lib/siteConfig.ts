// ─────────────────────────────────────────────────────────────────────────
// BUSINESS IDENTITY — every legal/contact fact the public pages state.
//
// One file, because these details appear in the Terms, the Privacy Policy, the
// Refund Policy, the Contact page and the footer, and a business address that
// is right in four places and stale in the fifth is worse than one that is
// obviously missing everywhere.
//
// NOTHING HERE IS INVENTED. Every value below is transcribed from the DTI
// registration and the payment-provider application; a plausible-looking
// placeholder would be a lie printed under a heading that says "Terms and
// Conditions". `missingSiteFields()` lists anything still unset, and the legal
// pages show that list rather than pretending.
//
// THESE MUST MATCH THE PROVIDER APPLICATION CHARACTER FOR CHARACTER. The legal
// name and address are checked against the registration during onboarding, so
// "CivEngg Website Application Service" in one place and "CIVENGG WEBSITE
// APPLICATION SERVICE" in the other is a held application.
//
// THERE IS DELIBERATELY NO SUPPORT PHONE NUMBER. Support is by email, and the
// contact channels the public pages state are the email address and the
// registered postal address. If a phone number is ever wanted back, it belongs
// here and in `REQUIRED` — not typed into one page, which is exactly the
// four-right-one-stale problem this file exists to prevent.
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
  /** DTI/SEC business registration number, as printed on the certificate. */
  registrationNumber: string
  /** Registered business address. Must match the payment-provider application. */
  address: PostalAddress
  /** Where customers reach a human. */
  supportEmail: string
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
  tradeName: 'CivEngg Toolkit',

  // Registered as a sole proprietorship, 9 August 2026. These are the details
  // the payment provider's application was filed against, so they must match
  // it exactly — a legal name or address that disagrees with the DTI
  // certificate is the usual reason an application is held.
  legalName: 'CIVENGG WEBSITE APPLICATION SERVICE',
  registrationNumber: '8408482',
  address: {
    line1: '14 Yangco Road',
    city: 'Baguio City',
    province: 'Benguet',
    postalCode: '2600',
    country: 'Philippines',
  },
  // BIR TIN. Kept here because the provider application and the BIR need it;
  // NOTHING RENDERS IT, and publishing it is a deliberate choice rather than a
  // default — see `missingSiteFields`, which excludes it on purpose.
  tin: '684281205',
  siteUrl: 'https://civil-engineering-zeta.vercel.app',

  // A dedicated support inbox rather than the owner's personal address. It is
  // the address printed in the Terms, the Privacy Policy, the Refund Policy,
  // the Contact page and the footer, so it is where statutory notices and
  // data-subject requests arrive — it needs to outlive any one person's mail
  // account and be answerable by whoever is on support.
  //
  // IF THIS CHANGES, IT MUST ALSO CHANGE ON THE PAYMENT PROVIDER'S
  // APPLICATION. The support address is one of the details Paddle shows payers
  // and checks during onboarding.
  supportEmail: 'civengg.support@gmail.com',

  supportHours: 'Monday to Friday, 9:00–18:00 (PST, UTC+8)',
  policiesUpdated: '15 August 2026',
}

/** Human labels for the fields a customer-facing document needs. */
const REQUIRED: [keyof SiteConfig | 'address', string][] = [
  ['legalName', 'Registered business name'],
  ['address', 'Registered business address'],
  ['supportEmail', 'Support email'],
  ['siteUrl', 'Public site URL'],
]

/**
 * Which required details are still blank.
 *
 * Empty array means the public pages are complete. Anything else is rendered on
 * the page itself — the point is that an unfinished policy is visibly
 * unfinished rather than quietly wrong. TIN is deliberately NOT in this list:
 * it is needed for provider onboarding and the BIR, not for a customer-facing
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
