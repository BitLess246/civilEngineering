/**
 * The rebrand to Zeta, and the three things it must NOT have touched.
 *
 * A trade name is free to change; these are not:
 *
 *   · the LEGAL name, which the DTI registration and the payment-provider
 *     application were filed against and which the footer, Terms, Privacy
 *     Policy and Contact page state as the operator;
 *   · the support address, which the provider shows payers and checked at
 *     onboarding, so it changes on their side or not at all;
 *   · the `civeng-*` storage keys, which hold every returning user's theme,
 *     profile, tool preferences and nav state — renaming one silently resets
 *     it for everybody.
 *
 * The last is the one a well-meaning "finish the rebrand" sweep would break,
 * because `civeng-theme` looks exactly like a leftover. It is not: it is a key.
 */
import { describe, it, expect } from 'vitest'
import { SITE } from './siteConfig'
import { BRAND_NAME } from './brand'

const SRC = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>
const ROOT = import.meta.glob(['../../index.html', '../../public/*.svg'], {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

/** What a file SAYS, not the notes explaining how it got there. */
const code = (s: string) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')

describe('the trade name is Zeta', () => {
  it('in the one place it is set', () => {
    expect(SITE.tradeName).toBe('Zeta')
    expect(BRAND_NAME).toBe('Zeta')
  })

  it('in the two files that cannot import it', () => {
    // `index.html` renders before the bundle; the favicon is a static asset.
    // Both carry the name as a literal, so both are asserted by hand.
    const html = Object.entries(ROOT).find(([f]) => f.endsWith('index.html'))![1]
    const icon = Object.entries(ROOT).find(([f]) => f.endsWith('favicon.svg'))![1]
    expect(html).toMatch(/<title>Zeta<\/title>/)
    expect(icon).toMatch(/aria-label="Zeta"/)
    expect(icon).toMatch(/<title>Zeta<\/title>/)
  })

  it('nowhere under the old name in anything that renders', () => {
    const old = /civ ?engg? toolkit|civil engineering toolkit/i
    const hits = [...Object.entries(SRC), ...Object.entries(ROOT)]
      .filter(([f]) => !/\.test\.tsx?$/.test(f))
      .filter(([, s]) => old.test(code(s)))
      .map(([f]) => f)
    expect(hits, 'old trade name still rendered').toEqual([])
  })
})

describe('what the rebrand must not have touched', () => {
  it('keeps the registered legal name, character for character', () => {
    expect(SITE.legalName).toBe('CIVENGG WEBSITE APPLICATION SERVICE')
  })

  it('keeps the support address the payment provider has on file', () => {
    expect(SITE.supportEmail).toBe('civengg.support@gmail.com')
  })

  it('keeps every civeng-* storage key, so no returning user is reset', () => {
    // Each of these holds a returning visitor's state. Renamed, the browser
    // simply finds nothing under the new key and starts them from defaults —
    // no error, no warning, just everybody's theme and preferences gone.
    const keys = new Set<string>()
    for (const s of Object.values(SRC)) {
      for (const m of s.matchAll(/'(civeng-[a-z-]+)'/g)) keys.add(m[1])
    }
    for (const k of ['civeng-theme', 'civeng-profile', 'civeng-tool-prefs',
      'civeng-nav-rail', 'civeng-nav-collapsed', 'civeng-guide-seen']) {
      expect(keys.has(k), `${k} was renamed — every returning user loses it`).toBe(true)
    }
    // …and no zeta-* twin was introduced beside them, which is how a
    // half-finished rename would show up.
    const all = Object.values(SRC).join('\n')
    expect(all).not.toMatch(/'zeta-(theme|profile|tool-prefs|nav-rail|nav-collapsed|guide-seen)'/)
  })
})

describe('the Terms read as sentences', () => {
  it('put no article in front of the name', () => {
    // "The CivEngg Toolkit is operated by…" worked because TOOLKIT is a noun.
    // With a proper name it is "The Zeta is operated by…", in the one
    // document on the site that has to read as deliberate.
    const terms = Object.entries(SRC).find(([f]) => f.endsWith('legal/Terms.tsx'))![1]
    expect(terms).not.toMatch(/[Tt]he \{SITE\.tradeName\}/)
    expect(terms).not.toMatch(/the \$\{SITE\.tradeName\}/)
    expect(terms).toMatch(/\{SITE\.tradeName\} is operated by/)
  })
})
