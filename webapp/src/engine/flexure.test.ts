import { describe, it, expect } from 'vitest';
import {
  rhoMin, flexuralSteel, barLayout, matLayout, maxBarSpacing, minClearSpacing,
} from './flexure';

describe('rhoMin', () => {
  it('max(1.4/fy, √fc/(4fy))', () => {
    // 1.4/415 = 0.003373 governs over √28/(4·415) = 0.003188
    expect(rhoMin(28, 415)).toBeCloseTo(0.003373, 6);
  });
});

describe('flexuralSteel', () => {
  it('falls back to ρ_min when the demand is low', () => {
    const r = flexuralSteel({ Mu: 100, b: 1000, d: 400, fc: 28, fy: 415 });
    expect(r.usedMin).toBe(true);
    expect(r.As).toBeCloseTo(0.003373 * 1000 * 400, 0); // ≈ 1349 mm²
  });
  it('uses the computed ratio when the demand is high', () => {
    const r = flexuralSteel({ Mu: 600, b: 1000, d: 400, fc: 28, fy: 415 });
    expect(r.usedMin).toBe(false);
    expect(r.rho).toBeGreaterThan(rhoMin(28, 415));
  });
});

describe('barLayout', () => {
  it('counts bars and spaces them across the width', () => {
    const Ab = (Math.PI / 4) * 20 * 20; // 314.16 mm²
    const layout = barLayout({ As: 1349, db: 20, b: 1500, cover: 75 });
    expect(layout.n).toBe(Math.max(2, Math.ceil(1349 / Ab))); // 5
    // From the geometry, NOT by restating the formula: bars sit a cover in
    // from each edge, so the outer bar CENTRES are 1500 − 2(75) − 20 = 1330
    // apart with 4 gaps between them. The old expectation subtracted n·db,
    // which is the clear gap between bar faces — one diameter narrower — and
    // pinned `barLayout` to a figure its own docstring called centre-to-centre.
    const firstCentre = 75 + 20 / 2;
    const lastCentre = 1500 - 75 - 20 / 2;
    expect(layout.spacing).toBeCloseTo((lastCentre - firstCentre) / (layout.n - 1), 6);
    expect(layout.spacing).toBeCloseTo(332.5, 6);
  });

  it('places the bars inside the section it was given', () => {
    // The spacing has to reconstruct a layout that actually fits: n bars at
    // s centres, each with half a diameter and a cover outside it.
    for (const [b, cover, db, As] of [
      [1500, 75, 20, 1349], [900, 40, 12, 400], [3000, 75, 25, 6000],
    ] as const) {
      const l = barLayout({ As, db, b, cover });
      const width = (l.n - 1) * l.spacing + db + 2 * cover;
      expect(width).toBeCloseTo(b, 6);
    }
  });
});

// ── Mat layouts ───────────────────────────────────────────────────────────

describe('matLayout', () => {
  it('§7.7.2.3 / §8.7.2.2 give the maximum spacing, capped at 450', () => {
    expect(maxBarSpacing('one-way', 100)).toBe(300);   // 3h
    expect(maxBarSpacing('two-way', 100)).toBe(200);   // 2h
    expect(maxBarSpacing('one-way', 200)).toBe(450);   // 3h = 600, capped
    expect(maxBarSpacing('two-way', 300)).toBe(450);   // 2h = 600, capped
  });

  it('§25.2.1 clear spacing carries the aggregate term', () => {
    expect(minClearSpacing(12, 20)).toBeCloseTo(80 / 3, 6);  // 4/3·d_agg governs
    expect(minClearSpacing(32, 20)).toBe(32);                // db governs
    expect(minClearSpacing(10, 10)).toBe(25);                // the 25 mm floor
  });

  it('spacing, not a bar count, is what floors a mat', () => {
    // THE BUG THIS EXISTS FOR. A 0.95 m footing, 200 mm thick, with a ⌀32 bar
    // and almost no steel demand. Two bars satisfy the area — and `barLayout`
    // returned exactly that, at 736 mm centres, because a count floor of two
    // is §9.7.2.1, a BEAM rule, and says nothing about a mat.
    const beamRule = barLayout({ As: 380, db: 32, b: 950, cover: 75 });
    expect(beamRule.n).toBe(2);
    expect(beamRule.spacing).toBeGreaterThan(450);

    const matRule = matLayout({ As: 380, db: 32, b: 950, cover: 75, h: 200 });
    expect(matRule.sMax).toBe(450);          // min(3h, 450) = min(600, 450)
    expect(matRule.spacing).toBeLessThanOrEqual(matRule.sMax);
    expect(matRule.n).toBeGreaterThan(2);
    expect(matRule.spacingGoverned).toBe(true);
  });

  it('leaves the count alone when the area already needs more bars', () => {
    const l = matLayout({ As: 6000, db: 16, b: 2300, cover: 75, h: 425 });
    const Ab = (Math.PI / 4) * 16 * 16;
    expect(l.n).toBe(Math.ceil(6000 / Ab));
    expect(l.spacingGoverned).toBe(false);
    expect(l.spacing).toBeLessThanOrEqual(l.sMax);
  });

  it('reports centre-to-centre AND the clear gap, one diameter apart', () => {
    const l = matLayout({ As: 2000, db: 20, b: 2000, cover: 75, h: 400 });
    expect(l.clear).toBeCloseTo(l.spacing - 20, 9);
    const width = (l.n - 1) * l.spacing + 20 + 2 * 75;
    expect(width).toBeCloseTo(2000, 6);
  });

  it('flags a mat whose bars do not fit at §25.2.1 clear spacing', () => {
    // A wide bar crammed across a narrow strip: the area demands more bars
    // than the width can hold at the code's minimum clear spacing.
    const tight = matLayout({ As: 20000, db: 32, b: 700, cover: 75, h: 300 });
    expect(tight.clearOK).toBe(false);
    const roomy = matLayout({ As: 2000, db: 16, b: 2300, cover: 75, h: 400 });
    expect(roomy.clearOK).toBe(true);
  });

  it('a two-way slab is spaced tighter than a one-way slab of the same depth', () => {
    const one = matLayout({ As: 500, db: 12, b: 3000, cover: 20, h: 140, kind: 'one-way' });
    const two = matLayout({ As: 500, db: 12, b: 3000, cover: 20, h: 140, kind: 'two-way' });
    expect(two.sMax).toBeLessThan(one.sMax);
    expect(two.n).toBeGreaterThan(one.n);
  });
});
