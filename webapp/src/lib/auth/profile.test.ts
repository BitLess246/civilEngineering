import { describe, it, expect } from 'vitest'
import {
  loadProfile, saveProfile, preparedByLine, letterheadDefaults, hasProfile,
  EMPTY_PROFILE, type Profile,
} from './profile'

const store = () => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    raw: m,
  }
}

const full: Profile = {
  preparedBy: 'R. Valdepeñas', licenseNo: '0123456',
  organisation: 'Example Design Office', defaultProject: 'Lot 12 Residence',
}

describe('load / save', () => {
  it('round-trips a profile', () => {
    const s = store()
    saveProfile(full, s)
    expect(loadProfile(s)).toEqual(full)
  })

  it('reads empty when nothing is stored', () => {
    expect(loadProfile(store())).toEqual(EMPTY_PROFILE)
  })

  it('survives corrupt storage instead of throwing', () => {
    // A half-written value or another app's key on the same origin must not
    // take down every page that reads the letterhead.
    const s = store()
    s.setItem('civeng-profile', '{not json')
    expect(loadProfile(s)).toEqual(EMPTY_PROFILE)
  })

  it('ignores fields of the wrong type rather than putting them on a sheet', () => {
    const s = store()
    s.setItem('civeng-profile', JSON.stringify({ preparedBy: { evil: true }, licenseNo: 42 }))
    const p = loadProfile(s)
    expect(p.preparedBy).toBe('')
    expect(p.licenseNo).toBe('')
  })

  it('trims and caps length, so a pasted essay cannot break the letterhead', () => {
    const s = store()
    s.setItem('civeng-profile', JSON.stringify({ preparedBy: `  ${'x'.repeat(500)}  ` }))
    expect(loadProfile(s).preparedBy.length).toBe(120)
  })

  it('does not throw when storage is unavailable', () => {
    // Private browsing: localStorage exists but setItem throws on write.
    const hostile = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    }
    expect(() => saveProfile(full, hostile)).not.toThrow()
    expect(loadProfile(hostile)).toEqual(EMPTY_PROFILE)
  })
})

describe('preparedByLine', () => {
  it('appends the PRC number when there is one', () => {
    expect(preparedByLine(full)).toBe('R. Valdepeñas · PRC 0123456')
  })

  it('gives just the name when there is no licence', () => {
    expect(preparedByLine({ ...full, licenseNo: '' })).toBe('R. Valdepeñas')
  })

  it('is empty without a name, rather than printing a stray licence number', () => {
    // "· PRC 0123456" alone on a sheet would look like a rendering fault.
    expect(preparedByLine({ ...full, preparedBy: '' })).toBe('')
    expect(preparedByLine(EMPTY_PROFILE)).toBe('')
  })
})

describe('letterheadDefaults', () => {
  it('supplies the project and prepared-by lines', () => {
    expect(letterheadDefaults(full)).toEqual({
      project: 'Lot 12 Residence', preparedBy: 'R. Valdepeñas · PRC 0123456',
    })
  })

  it('leaves blanks blank instead of inventing a placeholder', () => {
    expect(letterheadDefaults(EMPTY_PROFILE)).toEqual({ project: '', preparedBy: '' })
  })
})

describe('hasProfile', () => {
  it('is false for empty and whitespace-only', () => {
    expect(hasProfile(EMPTY_PROFILE)).toBe(false)
    expect(hasProfile({ ...EMPTY_PROFILE, preparedBy: '   ' })).toBe(false)
  })

  it('is true once any field is set', () => {
    expect(hasProfile({ ...EMPTY_PROFILE, organisation: 'X' })).toBe(true)
  })
})
