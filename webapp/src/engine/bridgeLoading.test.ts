import { describe, it, expect } from 'vitest'
import {
  truckAxles, tandemAxles, reversedAxles, walkVehicle, walkTruck, walkTandem,
  momentIL, reactionIL, axleOrdinates,
  laneMoment, laneShearPlus, laneShearMinus, leverRule, hl93SimpleSpan,
} from './bridgeLoading'
import { ilValueAt } from './influenceBeam'

describe('HL-93 vehicles', () => {
  it('truck: 35 + 145 + 145 kN, 4.26 m front gap, rear gap within 4.26–9.0 m', () => {
    const ax = truckAxles(9)
    expect(ax.map((a) => a.p)).toEqual([35, 145, 145])
    expect(ax[1].o).toBe(4.26)
    expect(ax[2].o).toBeCloseTo(13.26, 9)
    expect(() => truckAxles(9.5)).toThrow(/rear-axle spacing/)
  })

  it('tandem: two 110 kN axles at 1.2 m', () => {
    expect(tandemAxles().map((a) => a.p)).toEqual([110, 110])
    expect(tandemAxles()[1].o).toBe(1.2)
  })

  it('reversing mirrors the offsets about the total length', () => {
    const rev = reversedAxles(truckAxles(4.26))
    expect(rev.map((a) => a.o)).toEqual([0, 4.26, 8.52])
    expect(rev.map((a) => a.p)).toEqual([145, 145, 35])
  })
})

describe('the walk is exact against a dense position scan', () => {
  it('fixed-spacing truck on the midspan IL: walk = dense scan', () => {
    const L = 30, a = 15
    const pts = momentIL(L, a)
    const axles = truckAxles(4.26)
    const hit = walkVehicle(pts, axles, -12, L)
    // dense scan at 1 mm
    let dense = 0
    for (let x = -12; x <= L; x += 0.001) {
      let v = 0
      for (const al of axles) v += al.p * ilValueAt(pts, x + al.o)
      if (Math.abs(v) > Math.abs(dense)) dense = v
    }
    expect(hit.v).toBeCloseTo(dense, 4)
  })

  it('off-span axles contribute zero — no phantom peak at the IL ends', () => {
    // parked far off the left end, every ordinate must read 0
    const pts = reactionIL(30)
    const axles = truckAxles(4.26)
    const ord = axleOrdinates(pts, axles, -30)
    expect(ord.reduce((s, r) => s + r.contribution, 0)).toBe(0)
    expect(ilValueAt(pts, -5)).toBe(0)
  })

  it('tandem: fixed midspan section gives 484; absolute max over sections = 486 (resultant rule)', () => {
    const L = 10
    // Resultant-centered rule with axle–resultant distance s/4 = 0.3:
    // M = R·(L/2 − s/4)²/L = 220·4.7²/10 = 486
    const expectAbs = 220 * Math.pow(L / 2 - 0.3, 2) / L
    // fixed midspan section: 110·IL(5) + 110·IL(6.2) = 110·2.5 + 110·1.9 = 484
    const mid = walkTandem(momentIL(L, L / 2), L)
    expect(mid.v).toBeCloseTo(110 * 2.5 + 110 * 1.9, 3) // 484
    // sweep the section to recover the absolute max (0.05 grid ≈ exact)
    let best = 0
    for (let a = 0; a <= L; a += 0.05) {
      const v = walkTandem(momentIL(L, a), L).v
      if (v > best) best = v
    }
    expect(best).toBeGreaterThan(expectAbs - 0.05)
    expect(best).toBeLessThan(expectAbs + 0.05)
  })

  it('truck max reaction on a 30 m span = 145 + 145·25.74/30 + 35·21.48/30 = 294.47', () => {
    // Rear 145 parked on the support, partner 4.26 m along (min spacing
    // maximizes the trailing shares), front 35 further out
    const t = walkTruck(reactionIL(30), 30)
    expect(t.v).toBeCloseTo(145 + 145 * 25.74 / 30 + 35 * 21.48 / 30, 3)
    // the tandem cannot match it
    expect(walkTandem(reactionIL(30), 30).v).toBeCloseTo(110 + 110 * 28.8 / 30, 3)
  })
})

describe('lane load closed forms', () => {
  it('midspan lane moment = w·L²/8', () => {
    expect(laneMoment(30, 15)).toBeCloseTo(9.3 * 900 / 8, 9) // 1046.25
  })
  it('support lane shear = w·L/2, section values from theIL areas', () => {
    expect(laneShearPlus(30, 0)).toBeCloseTo(139.5, 9)
    expect(laneShearMinus(30, 0)).toBeCloseTo(0, 9)
    // at a = 10: plus = w(20)²/60 = 62.0; minus = −w·100/60 = −15.5
    expect(laneShearPlus(30, 10)).toBeCloseTo(62, 9)
    expect(laneShearMinus(30, 10)).toBeCloseTo(-15.5, 9)
  })
})

describe('lever rule', () => {
  it('interior, one lane: wheel on the girder + partner at 1.8 m → g = 0.625, DF = 0.75', () => {
    const r = leverRule({ S: 2.4, girder: 'interior', lanes: 1 })
    expect(r.sumR).toBeCloseTo(1.25, 9)
    expect(r.g).toBeCloseTo(0.625, 9)
    expect(r.m).toBe(1.2)
    expect(r.g * r.m).toBeCloseTo(0.75, 9)
  })

  it('interior, two lanes: near wheels on the girder, far wheels mirrored → g = 1.25', () => {
    const r = leverRule({ S: 2.4, girder: 'interior', lanes: 2 })
    expect(r.sumR).toBeCloseTo(2.5, 9) // 1 + 0.25 + 1 + 0.25
    expect(r.g).toBeCloseTo(1.25, 9)
    expect(r.m).toBe(1.0)
  })

  it('exterior, one lane: measured wheel positions with the cantilever lever', () => {
    // S = 2.4, d = 1.6: lane wheels from the edge at 1.5 and 3.3 →
    // x = −0.1 (overhang: ΣM about B gives r = (S−x)/S = 1 + 0.1/2.4) and x = 1.7 (r = 0.7/2.4)
    const r = leverRule({ S: 2.4, d: 1.6, girder: 'exterior', lanes: 1 })
    expect(r.wheels[0].x).toBeCloseTo(-0.1, 9)
    expect(r.wheels[0].r).toBeCloseTo(1 + 0.1 / 2.4, 9)
    expect(r.wheels[1].x).toBeCloseTo(1.7, 9)
    expect(r.wheels[1].r).toBeCloseTo(0.7 / 2.4, 9)
    expect(r.g).toBeCloseTo((1.0416667 + 0.2916667) / 2, 6)
    expect(r.g * r.m).toBeCloseTo(0.8, 6)
  })

  it('exterior, two lanes: the second lane lands past the first interior girder → 0 shares', () => {
    const r = leverRule({ S: 2.4, d: 1.6, girder: 'exterior', lanes: 2 })
    expect(r.wheels[2].r).toBe(0)
    expect(r.wheels[3].r).toBe(0)
    // so two lanes give exactly what one lane gives before the presence factor
    expect(r.g).toBeCloseTo(leverRule({ S: 2.4, d: 1.6, girder: 'exterior', lanes: 1 }).g, 9)
    expect(r.g * r.m).toBeCloseTo(0.6666667, 6)
  })
})

describe('hl93SimpleSpan — the assembly', () => {
  // 30 m span, interior girders at 2.4 m: DF = max(0.75, 1.25) = 1.25
  const res = hl93SimpleSpan({
    L: 30,
    deck: { S: 2.4, girder: 'interior' },
  })

  it('picks the governing lever case', () => {
    expect(res.DF).toBeCloseTo(1.25, 9)
    expect(res.lever.governing.m).toBe(1.0) // two lanes govern here
    expect(res.lever.other.g * res.lever.other.m).toBeCloseTo(0.75, 9)
  })

  it('vehicle moment matches the resultant-centered rule for the swept truck', () => {
    // s = 4.26: governing axle (mid 145) and resultant symmetric about midspan:
    // axle at 14.2791, resultant at 15.7209 → M = RL·a − 35·4.26 = 154.69·14.2791 − 149.1 = 2059.8
    const veh = res.moment.vehPart / res.DF / (1 + res.IM)
    expect(veh).toBeGreaterThan(2050)
    expect(veh).toBeLessThan(2066) // grid finds sections 0.3 m apart
    // and the case detail adds up: value = vehPart + lanePart
    expect(res.moment.vehPart + res.moment.lanePart).toBeCloseTo(res.moment.value, 6)
  })

  it('reaction combines vehicle (with IM) and lane halves', () => {
    expect(res.reaction.vehPart).toBeCloseTo(res.DF * 1.33 * 294.47, 1)
    expect(res.reaction.lanePart).toBeCloseTo(res.DF * 9.3 * 15, 6)
    expect(res.reaction.value).toBeCloseTo(res.reaction.vehPart + res.reaction.lanePart, 6)
    // shear at the support is the same physical case
    expect(Math.abs(res.shear.value)).toBeCloseTo(res.reaction.value, 6)
  })

  it('envelope vanishes at the supports and peaks inside', () => {
    expect(res.envelope[0].M).toBe(0)
    expect(res.envelope[100].M).toBe(0)
    const mid = res.envelope.find((e) => Math.abs(e.x - 15) < 1e-9)!
    expect(mid.M).toBeGreaterThan(res.envelope[10].M)
    expect(mid.M).toBeGreaterThan(res.envelope[90].M)
    // the reported governing moment matches the envelope peak (grid-level)
    const peak = Math.max(...res.envelope.map((e) => e.M))
    expect(res.moment.value).toBeGreaterThanOrEqual(peak - 1e-6)
  })

  it('the per-axle parking reproduces the reported vehicle effect', () => {
    const sum = res.reaction.axles.reduce((s, r) => s + r.contribution, 0)
    expect(sum).toBeCloseTo(res.reaction.vehPart / res.DF / (1 + res.IM), 4)
  })
})

describe('shear envelope shapes', () => {
  it('positive shear peaks at the left support, negative at the right', () => {
    const res = hl93SimpleSpan({ L: 20, deck: { S: 2.0, girder: 'interior' } })
    expect(res.envelope[0].Vpos).toBeGreaterThan(0)
    expect(res.envelope[0].Vneg).toBeCloseTo(0, 6)
    expect(res.envelope[res.envelope.length - 1].Vneg).toBeLessThan(0)
    expect(res.envelope[res.envelope.length - 1].Vpos).toBeCloseTo(0, 6)
    // and the support shear equals the reaction case
    expect(res.envelope[0].Vpos).toBeCloseTo(res.reaction.value, 6)
  })
})
