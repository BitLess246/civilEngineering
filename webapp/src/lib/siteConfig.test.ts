import { describe, it, expect } from 'vitest'
import {
  SITE, missingSiteFields, isSiteConfigured, addressLines, addressOneLine, businessName,
  type SiteConfig,
} from './siteConfig'

const complete: SiteConfig = {
  ...SITE,
  legalName: 'Example Engineering Services',
  address: { line1: '12 Rizal Street', city: 'Cebu City', province: 'Cebu', postalCode: '6000', country: 'Philippines' },
  supportEmail: 'support@example.ph',
  siteUrl: 'https://example.ph',
}

describe('missingSiteFields', () => {
  it('names every blank required detail on the shipped config', () => {
    // Not asserting a fixed count — the point is that the app KNOWS what is
    // missing and can say so, rather than rendering a policy with holes in it.
    const missing = missingSiteFields()
    for (const m of missing) expect(m.length).toBeGreaterThan(3)
    expect(isSiteConfigured()).toBe(missing.length === 0)
  })

  it('reports nothing once every detail is supplied', () => {
    expect(missingSiteFields(complete)).toEqual([])
    expect(isSiteConfigured(complete)).toBe(true)
  })

  it('treats whitespace as blank', () => {
    // '   ' in a config file looks filled in a diff and is not.
    expect(missingSiteFields({ ...complete, legalName: '   ' })).toContain('Registered business name')
    expect(missingSiteFields({ ...complete, supportEmail: '\t' })).toContain('Support email')
  })

  it('requires a whole address, not just a street', () => {
    for (const part of ['line1', 'city', 'province', 'postalCode'] as const) {
      const partial = { ...complete, address: { ...complete.address, [part]: '' } }
      expect(missingSiteFields(partial), part).toContain('Registered business address')
    }
  })

  it('does NOT demand a TIN — publishing it is a deliberate choice', () => {
    expect(missingSiteFields({ ...complete, tin: '' })).toEqual([])
  })

  it('does not ask for a phone number, and no page prints one', () => {
    // Support is by email. This is here so that re-adding a support number is a
    // deliberate edit to siteConfig rather than a number typed straight into
    // one page — which is the four-right-one-stale failure this module exists
    // to prevent.
    expect(Object.keys(complete)).not.toContain('supportPhone')
    expect(missingSiteFields(complete)).toEqual([])
  })
})

describe('address formatting', () => {
  it('renders the lines a reader expects', () => {
    expect(addressLines(complete.address)).toEqual([
      '12 Rizal Street', 'Cebu City, Cebu 6000', 'Philippines',
    ])
  })

  it('includes line 2 when present', () => {
    const a = { ...complete.address, line2: 'Unit 4B' }
    expect(addressLines(a)).toContain('Unit 4B')
  })

  it('never emits an empty or comma-only line from a blank address', () => {
    // The failure this prevents: a footer showing ", " above "Philippines".
    const lines = addressLines(SITE.address)
    for (const l of lines) {
      expect(l.trim().length).toBeGreaterThan(0)
      expect(l).not.toMatch(/^[,\s]+$/)
    }
    expect(addressOneLine(complete.address)).toBe('12 Rizal Street, Cebu City, Cebu 6000, Philippines')
  })
})

describe('businessName', () => {
  it('prefers the registered name once there is one', () => {
    expect(businessName(complete)).toBe('Example Engineering Services')
  })

  it('falls back to the trade name rather than rendering nothing', () => {
    expect(businessName({ ...complete, legalName: '' })).toBe(complete.tradeName)
    expect(businessName().length).toBeGreaterThan(0)
  })
})

describe('the shipped configuration is complete', () => {
  it('has every customer-facing detail filled in', () => {
    // The business is registered, so the legal pages must no longer be showing
    // a list of holes. This is the assertion that turns "we filled the form in"
    // into something that stays true.
    expect(missingSiteFields()).toEqual([])
    expect(isSiteConfigured()).toBe(true)
  })

  it('carries the registration details the provider application was filed with', () => {
    // These are checked against the DTI certificate during onboarding, so a
    // drifting legal name or address is a held application rather than a typo.
    expect(SITE.legalName).toBe('CIVENGG WEBSITE APPLICATION SERVICE')
    expect(SITE.registrationNumber).toBe('8408482')
    expect(SITE.tin).toMatch(/^\d{9}$/)
    expect(addressOneLine()).toBe('14 Yangco Road, Baguio City, Benguet 2600, Philippines')
  })

  it('uses the registered name in prose, not the trade name', () => {
    expect(businessName()).toBe(SITE.legalName)
  })

  it('gives a site URL that is an origin, with no trailing slash', () => {
    // It is concatenated into canonical links; a trailing slash produces '//'.
    expect(SITE.siteUrl).toMatch(/^https:\/\/[^/]+$/)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE CONTACT DETAILS ARE PART OF THE LEGAL DOCUMENTS.
//
// The support address is where statutory notices and Data Privacy Act
// data-subject requests arrive, and it is printed in the Terms, the Privacy
// Policy, the Refund Policy, the Contact page and the footer. The whole point
// of `siteConfig` is that it appears once and is read five times — a second
// copy pasted into a page is how one of five goes stale, and a policy that
// names an address nobody reads is worse than one that names none.
// ─────────────────────────────────────────────────────────────────────────
const PAGES = import.meta.glob('../pages/**/*.tsx', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>
const COMPONENTS = import.meta.glob('../components/*.tsx', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

describe('no page hardcodes a contact address', () => {
  it('found sources to scan — an empty glob would pass vacuously', () => {
    expect(Object.keys(PAGES).length).toBeGreaterThan(30)
  })

  it('every email in a page comes from SITE, never a literal', () => {
    const offenders: string[] = []
    for (const [path, src] of [...Object.entries(PAGES), ...Object.entries(COMPONENTS)]) {
      // A bare address in JSX or a mailto:. `mailto:${SITE.supportEmail}` is
      // the correct form and contains no literal address to match.
      const found = src.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)
      if (found) offenders.push(`${path.split('/').pop()}: ${found.join(', ')}`)
    }
    expect(offenders, `hardcoded addresses: ${offenders.join(' | ')}`).toEqual([])
  })
})

describe('the support address', () => {
  it('is set and looks like an address', () => {
    expect(SITE.supportEmail).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i)
  })

  it('is not the owner’s personal account', () => {
    // It was, and that is a reasonable way to start. It stops being reasonable
    // once the address is the one on the payment provider's application and in
    // four legal documents: it has to outlive any one person's mail account.
    expect(SITE.supportEmail).not.toBe('raymval246@gmail.com')
  })
})

describe('the legal pages do not contradict themselves', () => {
  const layout = PAGES['../pages/legal/LegalLayout.tsx']

  it('found the layout', () => {
    expect(layout).toBeTruthy()
  })

  it('no longer calls the policies unreviewed drafts', () => {
    // They have been through legal review. Leaving the old disclaimer would
    // have the page tell a customer — and a payment provider reviewing the
    // site — that its own terms are not to be relied on.
    expect(layout).not.toMatch(/have not been reviewed by a lawyer/i)
    expect(layout).not.toMatch(/are drafts/i)
  })

  it('still says it is not advice about the reader’s own situation', () => {
    // Which remains true of any policy, reviewed or not, and is a different
    // statement from "these are drafts".
    expect(layout).toMatch(/not legal advice/i)
  })

  it('still shows the incomplete-details banner when something is blank', () => {
    // Lawyer review does not fill in a missing address. The two guards are
    // independent and both have to survive.
    expect(layout).toMatch(/missingSiteFields\(\)/)
    expect(layout).toMatch(/This document is incomplete/)
  })
})

// ── No page prints a support telephone number ────────────────────────────────
//
// Removing `supportPhone` from the config stops the five places that READ it,
// but nothing stops somebody typing a number straight into a page later — and a
// number in one page is exactly the "right in four places, stale in the fifth"
// problem this module exists to prevent. It is the worst case of it, too: a
// stale customer-service number on a Refund Policy sends a payer to a line
// nobody answers.
//
// Reuses the PAGES/COMPONENTS globs above, so it covers the legal pages and the
// footer — every surface that used to print the number.
describe('the public pages carry no telephone number', () => {
  const SOURCES = { ...PAGES, ...COMPONENTS }

  it('the config has no phone field to read', () => {
    expect(Object.keys(SITE)).not.toContain('supportPhone')
  })

  it('no page links one with tel:', () => {
    const offenders = Object.entries(SOURCES)
      .filter(([, src]) => /tel:/.test(src))
      .map(([path]) => path.split('/').pop()!)
    expect(offenders, `links a phone number; support is by email: ${offenders.join(', ')}`).toEqual([])
  })

  it('no page carries the number that used to be published', () => {
    // In the spacing it was written in, and with none at all.
    const offenders = Object.entries(SOURCES)
      .filter(([, src]) => /\+?63\s*992\s*280\s*4146/.test(src))
      .map(([path]) => path.split('/').pop()!)
    expect(offenders, `still prints the removed number: ${offenders.join(', ')}`).toEqual([])
  })
})
