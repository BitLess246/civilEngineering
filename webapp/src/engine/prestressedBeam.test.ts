import { describe, it, expect } from 'vitest'
import { designPrestressed } from './prestressedBeam'

// 400×800 rectangular pretensioned beam, 12 m simple span, 10×12.7 mm strands
// (Aps = 987 mm², fpu 1860, low-relax), e = 250 mm, fc 40 / fci 32.
const base = {
  b: 400, h: 800, span: 12, fc: 40, fci: 32,
  Aps: 987, fpu: 1860, e: 250,
  wSDL: 6, wLL: 12,
}

describe('designPrestressed — section, moments, losses', () => {
  const r = designPrestressed(base)

  it('section properties and self-weight moments (hand calc)', () => {
    expect(r.A).toBe(320000)
    expect(r.I).toBeCloseTo((400 * 800 ** 3) / 12, 3)
    expect(r.Sb).toBeCloseTo(r.I / 400, 6)
    expect(r.wSW).toBeCloseTo(0.32 * 24, 9)                 // 7.68 kN/m
    expect(r.Msw).toBeCloseTo((7.68 * 144) / 8, 6)          // 138.24 kN·m
    expect(r.Mu).toBeCloseTo(((1.2 * 13.68 + 1.6 * 12) * 144) / 8, 6)
  })

  it('losses are ordered sanely and fse lands in the practical band', () => {
    expect(r.ES).toBeGreaterThan(0)
    expect(r.CR).toBeGreaterThan(0)
    expect(r.SH).toBeGreaterThan(0)
    expect(r.RE).toBeGreaterThan(0)
    expect(r.lossPct).toBeGreaterThan(8)
    expect(r.lossPct).toBeLessThan(25)                      // typical 10–20 %
    expect(r.fse).toBeCloseTo((0.74 * 1860) - r.lossTotal, 6)
    expect(r.Pe).toBeLessThan(r.Pi)
  })

  it('elastic shortening matches (Ep/Eci)·fcir at the converged Pi', () => {
    const Eci = 4700 * Math.sqrt(32)
    const fcir = (r.Pi * 1000) / r.A + (r.Pi * 1000 * 250 * 250) / r.I - (r.Msw * 1e6 * 250) / r.I
    expect(r.ES).toBeCloseTo((196500 / Eci) * fcir, 4)
  })
})

describe('designPrestressed — stresses vs §24.5 limits', () => {
  const r = designPrestressed(base)

  it('transfer: Pi/A ± terms with self-weight; limits 0.60f′ci / 0.25√f′ci', () => {
    const top = (r.Pi * 1000) / r.A - (r.Pi * 1000 * 250) / r.St + (r.Msw * 1e6) / r.St
    const bot = (r.Pi * 1000) / r.A + (r.Pi * 1000 * 250) / r.Sb - (r.Msw * 1e6) / r.Sb
    expect(r.transfer.top).toBeCloseTo(top, 9)
    expect(r.transfer.bot).toBeCloseTo(bot, 9)
    expect(r.limTransferC).toBeCloseTo(0.60 * 32, 9)
    expect(r.limTransferT).toBeCloseTo(0.25 * Math.sqrt(32), 9)
    expect(r.transferOK).toBe(true)
  })

  it('service: class-U tension bound 0.62√f′c on the precompressed fibre', () => {
    expect(r.limServiceT).toBeCloseTo(0.62 * Math.sqrt(40), 9)
    expect(r.serviceOK).toBe(true)
  })

  it('overloading the service moment breaks the class-U bottom-fibre bound', () => {
    const rBad = designPrestressed({ ...base, wLL: 40 })
    expect(rBad.service.bot).toBeLessThan(-rBad.limServiceT)
    expect(rBad.serviceOK).toBe(false)
  })
})

describe('designPrestressed — strength, cracking, shear, camber', () => {
  const r = designPrestressed(base)

  it('fps per §20.3.2.3.1 with γp = 0.28 (fpy/fpu = 0.9)', () => {
    const dp = 400 + 250
    const rhoP = 987 / (400 * dp)
    const b1 = 0.85 - (0.05 * 12) / 7
    const fps = 1860 * (1 - (0.28 / b1) * (rhoP * 1860) / 40)
    expect(r.fps).toBeCloseTo(fps, 6)
    expect(r.dp).toBe(650)
  })

  it('φMn from the strand couple covers Mu; φMn ≥ 1.2Mcr', () => {
    const a = (987 * r.fps) / (0.85 * 40 * 400)
    expect(r.a).toBeCloseTo(a, 6)
    expect(r.phiMn).toBeCloseTo((r.phi * 987 * r.fps * (650 - a / 2)) / 1e6, 6)
    expect(r.strengthOK).toBe(true)
    expect(r.phiMn).toBeGreaterThanOrEqual(1.2 * r.Mcr)
  })

  it('Mcr includes the precompression: (fr + Pe/A + Pe·e/Sb)·Sb', () => {
    const fr = 0.62 * Math.sqrt(40)
    const expected = ((fr + (r.Pe * 1000) / r.A + (r.Pe * 1000 * 250) / r.Sb) * r.Sb) / 1e6
    expect(r.Mcr).toBeCloseTo(expected, 6)
  })

  it('shear: Vc = min(Vci, Vcw) with the 0.17√f′c·bw·dp floor on Vci', () => {
    expect(r.Vc).toBeCloseTo(Math.min(r.Vci, r.Vcw), 9)
    expect(r.Vci).toBeGreaterThanOrEqual((0.17 * Math.sqrt(40) * 400 * Math.max(650, 640)) / 1000 - 1e-9)
    expect(r.Vcw).toBeCloseTo(((0.29 * Math.sqrt(40) + 0.3 * (r.Pe * 1000) / r.A) * 400 * 650) / 1000, 6)
  })

  it('camber Pe·e·L²/8EI opposes the 5wL⁴/384EI gravity deflection', () => {
    const Ec = 4700 * Math.sqrt(40)
    const camber = (r.Pe * 1000 * 250 * 12000 ** 2) / (8 * Ec * r.I)
    expect(r.camber).toBeCloseTo(camber, 6)
    expect(r.deltaNet).toBeCloseTo(r.deltaLoad - r.camber, 9)
  })

  it('overall verdict aggregates every check', () => {
    expect(r.ok).toBe(true)
    expect(designPrestressed({ ...base, Aps: 300 }).ok).toBe(false)   // strength fails
  })
})
