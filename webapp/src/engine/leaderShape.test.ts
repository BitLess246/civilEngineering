import { describe, it, expect } from 'vitest'
import { leaderShape, leaderKneeDistance, LEADER_GAP, MIN_LANDING } from './leaderShape'

const size = 1

describe('leader shape — arrowhead, leg, dogleg, glyph', () => {
  const s = leaderShape({ x: 6, y: 4, tx: 0, ty: 0, size })

  it('puts the arrowhead tip on the point named', () => {
    expect(s.head[0]).toEqual([6, 4])
  })

  it('draws a level dogleg from the glyph to the knee, then the leg', () => {
    const L = s.line
    expect(L[5][1]).toBe(0); expect(L[6][1]).toBe(0)          // the landing is level, at the label's baseline
    expect(L[6]).toEqual(s.knee)
    expect(L[7][1]).not.toBe(0)                                // and the leg leaves it
  })

  it('closes the landing with the glyph: up, across, down past the landing, a short return', () => {
    const [ret, retBot, farBot, farTop, nearTop, nearLand] = s.line
    expect(nearTop[1]).toBeLessThan(0)                         // up from the landing (y runs down)
    expect(farTop[1]).toBe(nearTop[1])                         // across the top
    expect(farBot[1]).toBeGreaterThan(0)                       // down past the landing
    expect(retBot[1]).toBe(farBot[1])                          // back along the bottom
    expect(ret[1]).toBeLessThan(retBot[1])                     // and a short way up
    expect(nearLand[0]).toBe(nearTop[0])
    // the glyph sits between the label and the landing
    expect(farTop[0]).toBeLessThan(nearTop[0])
    expect(farTop[0]).toBeGreaterThan(0)
  })

  it('stops the leg at the back of the arrowhead', () => {
    const back = s.line[s.line.length - 1]
    expect(Math.hypot(back[0] - 6, back[1] - 4)).toBeCloseTo(0.285, 9)
  })
})

describe('the angle between leg and dogleg is never acute', () => {
  it('holds at ≥ 90° for targets all round the label, both side preferences', () => {
    let worst = 180
    for (let x = -8; x <= 8; x += 0.25) for (let y = -6; y <= 6; y += 0.5) {
      if (Math.abs(y) < 1e-9 && Math.abs(x) < 3) continue      // on the label itself
      for (const side of [undefined, 'left', 'right'] as const) {
        const l = leaderShape({ x, y, tx: 0, ty: 0, size, side })
        worst = Math.min(worst, l.kneeAngle)
        expect(l.kneeAngle, `target (${x}, ${y}) side ${side}`).toBeGreaterThanOrEqual(90 - 1e-6)
      }
    }
    expect(worst).toBeCloseTo(90, 6)                           // the square drop is reached, never passed
  })

  it('drops the leg square when the target is inside the landing\'s reach', () => {
    const l = leaderShape({ x: 2, y: 3, tx: 0, ty: 0, size })
    expect(l.knee[0]).toBe(2)                                  // the knee stops above the target
    expect(l.kneeAngle).toBeCloseTo(90, 9)
    expect(l.slid).toBe(0)
  })

  it('opens away from the label when the target is beyond it', () => {
    expect(leaderShape({ x: 9, y: 3, tx: 0, ty: 0, size }).kneeAngle).toBeGreaterThan(90)
  })

  it('slides the label only when the target is too nearly under it — and only far enough', () => {
    const l = leaderShape({ x: 0.3, y: 3, tx: 0, ty: 0, size, side: 'right' })
    const need = size * (LEADER_GAP + MIN_LANDING)
    expect(l.tx).toBeCloseTo(0.3 - need, 9)
    expect(l.slid).toBeCloseTo(need - 0.3, 9)
    expect(l.kneeAngle).toBeCloseTo(90, 9)
    expect(leaderShape({ x: 5, y: 3, tx: 0, ty: 0, size }).slid).toBe(0)
  })

  it('runs the landing towards the target and anchors the label away from it', () => {
    expect(leaderShape({ x: 5, y: 1, tx: 0, ty: 0, size }).anchor).toBe('end')
    expect(leaderShape({ x: -5, y: 1, tx: 0, ty: 0, size }).anchor).toBe('start')
    expect(leaderKneeDistance(1)).toBeCloseTo(LEADER_GAP + 2.2, 9)
  })
})
