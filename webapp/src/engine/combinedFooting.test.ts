import { describe, it, expect } from 'vitest';
import { designCombinedFooting, type CombinedFootingInput } from './combinedFooting';

const base: Omit<CombinedFootingInput, 'leftRestrict' | 'rightRestrict'> = {
  col1Width: 400, col2Width: 400, spacing: 4.0,
  dl1: 600, ll1: 400, dl2: 500, ll2: 300,
  leftOverhang: 0, rightOverhang: 0,
  fc: 28, fy: 415, qAllow: 200, gammaSoil: 18, gammaConc: 24, surcharge: 0,
  H: 1.6, barDia: 20, cover: 75,
};

function containsBothColumns(r: ReturnType<typeof designCombinedFooting>) {
  const c1L = r.x1 - 0.2, c2R = r.x2 + 0.2; // half a 400 mm column
  return c1L >= -1e-6 && c2R <= r.Bx + 1e-6 && r.x1 > 0 && r.x2 < r.Bx;
}
function equilibrium(r: ReturnType<typeof designCombinedFooting>) {
  const n = r.samples.x.length - 1;
  return Math.abs(r.samples.V[0]) < 1e-6 && Math.abs(r.samples.V[n]) < 1e-6
    && Math.abs(r.samples.M[0]) < 1e-6 && Math.abs(r.samples.M[n]) < 1e-6;
}

describe('combined footing — rectangular (CRF)', () => {
  it('left-restricted: covers both columns, self-equilibrates, sane design', () => {
    const r = designCombinedFooting({ ...base, leftRestrict: true, rightRestrict: false });
    expect(r.shape).toBe('Rectangular (CRF)');
    expect(containsBothColumns(r)).toBe(true);
    expect(equilibrium(r)).toBe(true);
    expect(r.wu1 + r.wu2).toBeCloseTo((2 * r.Pu) / r.Bx, 6);
    expect(r.Dc).toBeGreaterThan(200);
    expect(r.longSections).toHaveLength(3);
    expect(r.longSections.every((s) => s.bars >= 2)).toBe(true);
  });

  it('both edges free: centred on the resultant, covers both columns', () => {
    const r = designCombinedFooting({ ...base, leftRestrict: false, rightRestrict: false });
    expect(containsBothColumns(r)).toBe(true);
    expect(equilibrium(r)).toBe(true);
  });
});

describe('combined footing — trapezoidal (CTF)', () => {
  it('both restricted: trapezoid, covers both columns, equilibrium', () => {
    const r = designCombinedFooting({ ...base, leftRestrict: true, rightRestrict: true });
    expect(r.shape).toBe('Trapezoidal (CTF)');
    expect(r.By1).toBeGreaterThan(0);
    expect(r.By2).toBeGreaterThan(0);
    expect(containsBothColumns(r)).toBe(true);
    expect(equilibrium(r)).toBe(true);
  });
});

describe('column containment', () => {
  it('widens the slab when a column would stick out (very unequal loads, CTF)', () => {
    const r = designCombinedFooting({
      ...base, leftRestrict: true, rightRestrict: true,
      dl1: 1100, ll1: 700, dl2: 40, ll2: 20,    // tiny col-2 end → would be < column width
    });
    expect(r.widened).toBe(true);
    expect(containsBothColumns(r)).toBe(true);
  });
});
