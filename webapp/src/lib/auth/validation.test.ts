import { describe, it, expect } from 'vitest'
import {
  emailError, passwordError, confirmError, passwordStrength,
  signUpErrors, signInErrors, MIN_PASSWORD,
} from './validation'
import { classifyError } from './authClient'

describe('emailError', () => {
  it('accepts ordinary and awkward-but-valid addresses', () => {
    for (const e of [
      'a@b.co', 'first.last@example.com', 'user+tag@example.co.uk',
      'x@sub.domain.example.engineering', 'UPPER@EXAMPLE.COM', '  spaced@example.com  ',
    ]) expect(emailError(e), e).toBeNull()
  })

  it('catches the typos it is meant to catch', () => {
    for (const e of ['', '   ', 'nope', 'no@domain', 'no domain@x.com', '@example.com', 'a@b.c']) {
      expect(emailError(e), e).not.toBeNull()
    }
  })

  it('rejects an absurdly long address', () => {
    expect(emailError(`${'a'.repeat(250)}@example.com`)).toMatch(/too long/)
  })
})

describe('passwordError', () => {
  it('requires the stated minimum and says what it is', () => {
    expect(passwordError('')).toMatch(/Enter a password/)
    expect(passwordError('short')).toBe(`Use at least ${MIN_PASSWORD} characters.`)
    expect(passwordError('a'.repeat(MIN_PASSWORD))).toBeNull()
  })

  it('rejects beyond the bcrypt input limit rather than letting it silently truncate', () => {
    expect(passwordError('a'.repeat(72))).toBeNull()
    expect(passwordError('a'.repeat(73))).toMatch(/72/)
  })
})

describe('confirmError', () => {
  it('requires a match', () => {
    expect(confirmError('abcdefgh', 'abcdefgh')).toBeNull()
    expect(confirmError('abcdefgh', 'abcdefgi')).toMatch(/do not match/)
    expect(confirmError('abcdefgh', '')).toMatch(/Re-enter/)
  })
})

describe('passwordStrength', () => {
  it('rewards length more than variety', () => {
    const longSimple = passwordStrength('correcthorsebatterystaple')
    const shortComplex = passwordStrength('Aa1!xy')
    expect(longSimple.score).toBeGreaterThan(shortComplex.score)
    expect(longSimple.label).toBe('strong')
  })

  it('rises monotonically as a password grows', () => {
    let prev = -1
    // deliberately NOT sequential strings — those are caught by the pattern
    // check below and would test that instead
    for (const p of ['q', 'brisktin', 'brisktinlamp', 'brisktinlampverge', 'Brisktinlampverge1!']) {
      const s = passwordStrength(p).score
      expect(s).toBeGreaterThanOrEqual(prev)
      prev = s
    }
  })

  it('collapses obvious patterns however long they are', () => {
    for (const p of ['aaaaaaaaaaaaaaaaaaaa', '0123456789012345', 'passwordpassword']) {
      expect(passwordStrength(p).score, p).toBe(0)
      expect(passwordStrength(p).label, p).toBe('weak')
    }
  })

  it('gives one actionable hint at a time, and none when strong', () => {
    expect(passwordStrength('abc').hint).toMatch(/at least/)
    expect(passwordStrength('brisktinl').hint).toMatch(/Longer/)
    expect(passwordStrength('brisktinlampverge').hint).toMatch(/Mixing/)
    expect(passwordStrength('Brisktinlampverge1!').hint).toBeNull()
  })

  it('is advice, not a gate — a long single-class passphrase still submits', () => {
    const p = 'correcthorsebatterystaple'
    expect(passwordStrength(p).label).toBe('strong')
    expect(passwordError(p)).toBeNull()
    // and even a "weak" one submits, as long as it meets the stated minimum
    expect(passwordStrength('brisktin').label).toBe('weak')
    expect(passwordError('brisktin')).toBeNull()
  })
})

describe('form aggregation', () => {
  it('reports every sign-up problem at once', () => {
    const e = signUpErrors({ email: 'bad', password: 'x', confirm: 'y' })
    expect(Object.keys(e).sort()).toEqual(['confirm', 'email', 'password'])
  })

  it('is empty for a good sign-up', () => {
    expect(signUpErrors({ email: 'a@b.co', password: 'abcdefgh', confirm: 'abcdefgh' })).toEqual({})
  })

  it('does not apply the length rule at SIGN-IN', () => {
    // An older account may hold a shorter password. Telling someone their
    // working password is invalid at the sign-in screen would be both wrong and
    // impossible to act on.
    const e = signInErrors({ email: 'a@b.co', password: 'old' })
    expect(e).toEqual({})
    expect(signInErrors({ email: 'a@b.co', password: '' }).password).toMatch(/Enter your password/)
  })
})

describe('classifyError', () => {
  it('never reveals whether an account exists', () => {
    // Both failure modes must be indistinguishable, or the form becomes an
    // account-enumeration oracle.
    const wrongPassword = classifyError('Invalid login credentials')
    const noSuchUser = classifyError('Invalid login credentials', 400)
    expect(wrongPassword.message).toBe(noSuchUser.message)
    expect(wrongPassword.message).toBe('Email or password is incorrect.')
    expect(wrongPassword.message).not.toMatch(/user|account|exist/i)
  })

  it('recognises the cases worth naming', () => {
    expect(classifyError('User already registered').kind).toBe('email-taken')
    expect(classifyError('Password should be at least 6 characters').kind).toBe('weak-password')
    expect(classifyError('rate limit exceeded').kind).toBe('rate-limited')
    expect(classifyError('anything', 429).kind).toBe('rate-limited')
    expect(classifyError('Failed to fetch').kind).toBe('network')
  })

  it('falls back to a generic message rather than leaking provider internals', () => {
    const e = classifyError('PGRST301: JWT expired at row 42 of auth.users')
    expect(e.kind).toBe('unknown')
    expect(e.message).toBe('Something went wrong. Please try again.')
    expect(e.message).not.toMatch(/JWT|auth\.users|PGRST/)
  })
})
