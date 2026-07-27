import { describe, it, expect } from 'vitest'
import {
  bilinearPath, bilinearProbe, bilinearCommit, bilinearCycleEnergy, newBilinearState,
  type BilinearParams,
} from './hysteresis'

// ── the hysteretic material ─────────────────────────────────────────────
describe('hysteresis — bilinear kinematic hardening', () => {
  const epp: BilinearParams = { k0: 100, Fy: 10 }          // u_y = 0.1
  const hard: BilinearParams = { k0: 100, Fy: 10, b: 0.05 }

  it('is linear below yield and caps at Fy (elastic-perfectly-plastic)', () => {
    expect(bilinearProbe(0.05, newBilinearState(), epp).f).toBeCloseTo(5, 12)
    expect(bilinearProbe(0.10, newBilinearState(), epp).f).toBeCloseTo(10, 12)   // exactly at yield
    expect(bilinearProbe(0.50, newBilinearState(), epp).f).toBeCloseTo(10, 12)   // plateau
    expect(bilinearProbe(0.50, newBilinearState(), epp).yielding).toBe(true)
  })

  it('hardens on the post-yield branch at b·k₀', () => {
    const f1 = bilinearProbe(0.2, newBilinearState(), hard).f
    const f2 = bilinearProbe(0.3, newBilinearState(), hard).f
    expect(bilinearProbe(0.1, newBilinearState(), hard).f).toBeCloseTo(10, 12)   // still Fy at u_y
    expect((f2 - f1) / 0.1).toBeCloseTo(0.05 * 100, 10)                          // slope = b·k₀
  })

  it('unloads elastically at k₀ after yielding (the thing pushover cannot do)', () => {
    // push to u = 0.3 (plastic), then unload to 0.25
    const { f } = bilinearPath([0.3, 0.25], epp)
    expect(f[0]).toBeCloseTo(10, 12)
    expect(f[1]).toBeCloseTo(10 - 100 * 0.05, 10)     // k₀ unloading ⇒ 5
  })

  it('yields in the reverse direction after a full reversal', () => {
    const { f } = bilinearPath([0.3, -0.3], epp)
    expect(f[0]).toBeCloseTo(10, 12)
    expect(f[1]).toBeCloseTo(-10, 12)
  })

  it('dissipates the closed-form loop energy 4·Fy·(A − u_y) per steady-state cycle', () => {
    const A = 0.4
    const seg = (pts: number[], from: number, to: number) => {
      for (let i = 1; i <= 200; i++) pts.push(from + ((to - from) * i) / 200)
    }
    // virgin loading 0→A alone dissipates only Fy·(A−u_y); the closed form is the
    // STEADY-STATE loop, so difference out that first half-excursion.
    const first: number[] = []; seg(first, 0, A)
    const plusCycle = [...first]; seg(plusCycle, A, -A); seg(plusCycle, -A, A)

    const e1 = bilinearPath(first, epp).state.dissipated
    const e2 = bilinearPath(plusCycle, epp).state.dissipated
    expect(e1).toBeCloseTo(10 * (A - 0.1), 6)                     // = 3, the virgin leg
    expect(e2 - e1).toBeCloseTo(bilinearCycleEnergy(A, epp), 6)   // = 12, the loop
    expect(bilinearCycleEnergy(A, epp)).toBeCloseTo(4 * 10 * (0.4 - 0.1), 12)
  })

  it('dissipates nothing while the response stays elastic', () => {
    const { state } = bilinearPath([0.05, -0.05, 0.05, 0], epp)
    expect(state.dissipated).toBe(0)
    expect(state.cumPlastic).toBe(0)
  })

  it('an infinite Fy is a plain linear spring', () => {
    const lin: BilinearParams = { k0: 100, Fy: Infinity }
    expect(bilinearProbe(5, newBilinearState(), lin).f).toBeCloseTo(500, 12)
    expect(bilinearProbe(5, newBilinearState(), lin).yielding).toBe(false)
    expect(bilinearCommit(5, 0, newBilinearState(), lin).state.dissipated).toBe(0)
  })
})
