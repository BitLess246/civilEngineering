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
  supportPhone: '+63 32 000 0000',
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
    expect(missingSiteFields({ ...complete, supportPhone: '\t' })).toContain('Customer service number')
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
