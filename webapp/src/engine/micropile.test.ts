import { describe, it, expect } from 'vitest'
import {
  micropileAreas, micropileStructural, micropileBond, requiredBondLength, designMicropile,
  type MicropileSection,
} from './micropile'

const area = (d: number) => (Math.PI / 4) * d * d
const sec: MicropileSection = { barDia: 32, fyBar: 520, groutDia: 150, fcGrout: 28 }
const cased: MicropileSection = { ...sec, casingOD: 140, casingID: 125, fyCasing: 552 }

describe('micropileAreas', () => {
  it('bar, casing ring and net grout areas', () => {
    const a = micropileAreas(cased)
    expect(a.Abar).toBeCloseTo(area(32), 6)
    expect(a.Acasing).toBeCloseTo(area(140) - area(125), 6)
    expect(a.Agrout).toBeCloseTo(area(150) - a.Abar - a.Acasing, 6)
  })
  it('no casing ⇒ Acasing = 0', () => {
    expect(micropileAreas(sec).Acasing).toBe(0)
  })
})

describe('micropileStructural (FHWA ASD)', () => {
  it('compression = 0.40·f′c·Agrout + 0.47·Fy·As', () => {
    const a = micropileAreas(sec)
    const expected = (0.40 * 28 * a.Agrout + 0.47 * 520 * a.Abar) / 1000
    expect(micropileStructural(sec, 'compression')).toBeCloseTo(expected, 6)
  })
  it('tension = 0.55·Fy·As (grout carries none)', () => {
    const a = micropileAreas(sec)
    expect(micropileStructural(sec, 'tension')).toBeCloseTo((0.55 * 520 * a.Abar) / 1000, 6)
  })
  it('compression exceeds tension; a casing adds capacity', () => {
    expect(micropileStructural(sec, 'compression')).toBeGreaterThan(micropileStructural(sec, 'tension'))
    expect(micropileStructural(cased, 'compression')).toBeGreaterThan(micropileStructural(sec, 'compression'))
  })
})

describe('micropileBond', () => {
  it('Qult = π·Dbond·Lbond·αbond; Qall = Qult/FS', () => {
    const r = micropileBond({ bondDia: 0.15, bondLength: 8, alphaBond: 150, FS: 2 })
    expect(r.Qult).toBeCloseTo(Math.PI * 0.15 * 8 * 150, 6)
    expect(r.Qall).toBeCloseTo(r.Qult / 2, 9)
  })
  it('requiredBondLength round-trips to the demand at the FS', () => {
    const Le = requiredBondLength({ P: 300, bondDia: 0.15, alphaBond: 150, FS: 2 })
    const r = micropileBond({ bondDia: 0.15, bondLength: Le, alphaBond: 150, FS: 2 })
    expect(r.Qall).toBeCloseTo(300, 6)
  })
})

describe('designMicropile', () => {
  const base = {
    section: sec, mode: 'compression' as const,
    bondDia: 0.15, bondLength: 8, alphaBond: 150, FS: 2, P: 400,
  }
  it('governing allowable is the smaller of structural and bond', () => {
    const r = designMicropile(base)
    expect(r.allowable).toBeCloseTo(Math.min(r.structural, r.Qbond), 9)
    expect(r.governs).toBe(r.structural <= r.Qbond ? 'structural' : 'bond')
  })
  it('FS = allowable/demand and OK flag', () => {
    const r = designMicropile(base)
    expect(r.fs).toBeCloseTo(r.allowable / 400, 9)
    expect(r.ok).toBe(r.allowable >= 400)
  })
  it('a short bond zone makes bond govern; lengthening it relieves it', () => {
    const short = designMicropile({ ...base, bondLength: 2 })
    const long = designMicropile({ ...base, bondLength: 12 })
    expect(short.Qbond).toBeLessThan(long.Qbond)
    expect(short.governs).toBe('bond')
  })
})
