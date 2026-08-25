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

describe('containment and practicality', () => {
  // Two columns 6 m apart, the second carrying roughly twice the first — the
  // ordinary interior/exterior pair a frame produces, and the case that made
  // the engine hand back an 8.2 × 0.5 × 1.0 m strip and call it ok.
  const lopsided: CombinedFootingInput = {
    col1Width: 400, col2Width: 400, spacing: 6,
    dl1: 120, ll1: 40, dl2: 260, ll2: 90,
    leftRestrict: false, rightRestrict: false, leftOverhang: 0, rightOverhang: 0,
    fc: 28, fy: 415, qAllow: 200, gammaSoil: 18, gammaConc: 24, surcharge: 0,
    H: 1.5, barDia: 20, cover: 75,
  }

  it('gives every column its 75 mm projection, not merely the column width', () => {
    // The trigger used to fire only when the pad was NARROWER than the column,
    // while the loop drove to column + 2 × 75. A pad between the two was left
    // alone: 500 mm under a 400 mm column, with 50 mm of projection.
    const r = designCombinedFooting(lopsided)
    const narrowest = Math.min(r.By1, r.By2)
    expect(narrowest).toBeGreaterThanOrEqual(0.4 + 2 * 0.075 - 1e-9)
  })

  it('says when the pad has been stretched to centre the resultant', () => {
    const r = designCombinedFooting(lopsided)
    expect(r.naturalLength).toBeCloseTo(6 + 0.2 + 0.2 + 0.15, 9)
    expect(r.Bx).toBeGreaterThan(1.25 * r.naturalLength)
    expect(r.notes.join(' ')).toContain('symmetric about the bearing resultant')
  })

  it('says when the result is a grade beam rather than a footing', () => {
    const r = designCombinedFooting(lopsided)
    expect(r.slenderness).toBeGreaterThan(6)
    expect(r.notes.join(' ')).toContain('grade beam')
  })

  it('stays quiet on a pad that is a sensible shape', () => {
    // Equal loads put the resultant at midspan, so the rectangle needs no
    // stretching and the width comes out proportionate.
    const even = designCombinedFooting({
      ...lopsided, spacing: 3, dl2: 120, ll2: 40, qAllow: 120,
    })
    expect(even.Bx).toBeLessThanOrEqual(1.25 * even.naturalLength + 1e-9)
    expect(even.slenderness).toBeLessThanOrEqual(6)
    expect(even.notes).toEqual([])
  })
})
