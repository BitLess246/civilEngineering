import { describe, it, expect } from 'vitest'
import { parseOrigins, originAllowed, corsOrigin } from './originAllow'

describe('parseOrigins', () => {
  it('splits on commas and whitespace, trims trailing slashes, lowercases', () => {
    expect(parseOrigins(' https://A.com/ , https://b.com\nhttps://c.com//'))
      .toEqual(['https://a.com', 'https://b.com', 'https://c.com'])
  })

  it('is empty for unset or blank', () => {
    for (const v of [undefined, null, '', '   ', ',,']) expect(parseOrigins(v)).toEqual([])
  })
})

describe('originAllowed', () => {
  const list = parseOrigins('https://app.example.com, https://*.vercel.app')

  it('admits an exact match, and tolerates a trailing slash or case', () => {
    expect(originAllowed('https://app.example.com', list)).toBe(true)
    expect(originAllowed('https://APP.example.com/', list)).toBe(true)
  })

  it('admits one preview label under a wildcard', () => {
    expect(originAllowed('https://civil-engineering-git-abc.vercel.app', list)).toBe(true)
  })

  it('refuses the tricks a wildcard invites', () => {
    // a second label — `*.` is ONE label, or an attacker registers
    // evil.com and serves https://vercel.app.evil.com
    expect(originAllowed('https://a.b.vercel.app', list)).toBe(false)
    // suffix without the dot: evil-vercel.app is not *.vercel.app
    expect(originAllowed('https://evil-vercel.app', list)).toBe(false)
    // the bare apex is not a label
    expect(originAllowed('https://vercel.app', list)).toBe(false)
    // the wildcard must not cross the scheme
    expect(originAllowed('http://foo.vercel.app', list)).toBe(false)
    // and it is not a substring match anywhere
    expect(originAllowed('https://vercel.app.evil.com', list)).toBe(false)
    expect(originAllowed('https://app.example.com.evil.com', list)).toBe(false)
  })

  it('refuses what a browser sends when there is no real origin', () => {
    // A sandboxed iframe and a file:// page both send the literal "null".
    // No allowlist can name that origin, so it can never be on one.
    expect(originAllowed('null', list)).toBe(false)
    expect(originAllowed(null, list)).toBe(false)
    expect(originAllowed(undefined, list)).toBe(false)
    expect(originAllowed('', list)).toBe(false)
  })

  it('admits nothing when the allowlist is empty', () => {
    // Which is what makes the unconfigured deployment fail CLOSED.
    expect(originAllowed('https://app.example.com', [])).toBe(false)
  })
})

describe('corsOrigin', () => {
  const list = parseOrigins('https://app.example.com, https://*.vercel.app')

  it('reflects an allowlisted origin verbatim, case and all', () => {
    // The header must echo what the browser sent; a normalised copy does not
    // match and the browser rejects the response.
    expect(corsOrigin('https://app.example.com', list)).toBe('https://app.example.com')
    expect(corsOrigin('https://civil-git-x.vercel.app', list)).toBe('https://civil-git-x.vercel.app')
  })

  it('never reflects an origin that is not on the list', () => {
    for (const o of ['https://evil.com', 'https://a.b.vercel.app', 'null', null, undefined]) {
      expect(corsOrigin(o, list)).toBe('*')
    }
  })

  it('is the wildcard when nothing is configured', () => {
    expect(corsOrigin('https://app.example.com', [])).toBe('*')
  })
})
