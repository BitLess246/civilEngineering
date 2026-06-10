import { describe, it, expect } from 'vitest';
import { designFlexibleCombinedFooting, type FlexibleCombinedInput } from './flexibleCombinedFooting';

const base: Omit<FlexibleCombinedInput, 'leftRestrict' | 'rightRestrict'> = {
  col1Width: 400, col2Width: 400, spacing: 4.0,
  dl1: 600, ll1: 400, dl2: 500, ll2: 300,
  leftOverhang: 0, rightOverhang: 0,
  fc: 28, fy: 415, qAllow: 200, gammaSoil: 18, gammaConc: 24, surcharge: 0,
  H: 1.6, barDia: 20, cover: 75,
  ksubgrade: 40000,
};

function endEquilibrium(r: ReturnType<typeof designFlexibleCombinedFooting>) {
  const n = r.samples.x.length - 1;
  // free ends: V and M return to ~0 (self-equilibrated on the springs)
  return Math.abs(r.samples.V[n]) < 0.02 * r.Pu && Math.abs(r.samples.M[n]) < 0.02 * Math.abs(r.mPeak || 1);
}

describe('flexible (Winkler) combined footing', () => {
  it('self-equilibrates and settles downward', () => {
    const r = designFlexibleCombinedFooting({ ...base, leftRestrict: true, rightRestrict: false });
    expect(endEquilibrium(r)).toBe(true);
    expect(r.yMax).toBeGreaterThan(0);            // settlement is downward
    expect(r.EI).toBeGreaterThan(0);
    expect(r.longSections).toHaveLength(3);
    expect(r.longSections.every((s) => s.bars >= 2)).toBe(true);
  });

  it('total soil reaction balances the factored column loads', () => {
    const r = designFlexibleCombinedFooting({ ...base, leftRestrict: false, rightRestrict: false });
    const xs = r.samples.x, w = r.samples.w;
    let R = 0;
    for (let k = 1; k < xs.length; k++) R += ((w[k] + w[k - 1]) / 2) * (xs[k] - xs[k - 1]);
    expect(R).toBeCloseTo(r.Pu, 0);               // ∫ k·y dx ≈ ΣPu
  });

  it('symmetric loads give a symmetric settlement profile', () => {
    const r = designFlexibleCombinedFooting({
      ...base, dl1: 600, ll1: 400, dl2: 600, ll2: 400,
      leftRestrict: false, rightRestrict: false,
    });
    const y = r.samples.y, n = y.length - 1;
    for (let k = 0; k <= n; k++) {
      expect(Math.abs(y[k] - y[n - k])).toBeLessThan(1e-6 + 0.02 * Math.abs(r.yMax));
    }
  });

  it('a stiffer subgrade reduces settlement', () => {
    const soft = designFlexibleCombinedFooting({ ...base, leftRestrict: false, rightRestrict: false, ksubgrade: 20000 });
    const hard = designFlexibleCombinedFooting({ ...base, leftRestrict: false, rightRestrict: false, ksubgrade: 80000 });
    expect(hard.yMax).toBeLessThan(soft.yMax);
  });
});
