import { describe, it, expect } from 'vitest';
import {
  rhoMin, flexuralSteel, barLayout, matLayout, maxBarSpacing, minClearSpacing, rectCapacity, rhoShrinkage, flexuralAsMin,
} from './flexure';
import { tBeamCapacity } from './tbeam';

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

// ─────────────────────────────────────────────────────────────────────────
// rectCapacity — ANALYSIS, where the steel may not reach fy.
//
// Everything else in this module answers "what steel does this moment need?",
// and ρ is capped so As·fy is exact. This answers the opposite question with
// As handed in, and nothing stops it being over-reinforced.
// ─────────────────────────────────────────────────────────────────────────
describe('rectCapacity', () => {
  it('reduces to As·fy·(d − a/2) while the steel yields', () => {
    const b = 300, d = 540, As = 1500, fc = 28, fy = 415
    const r = rectCapacity(b, d, d, As, fc, fy)
    expect(r.fsYields).toBe(true)
    expect(r.fs).toBeCloseTo(fy, 9)
    const a = (As * fy) / (0.85 * fc * b)
    expect(r.a).toBeCloseTo(a, 9)
    expect(r.Mn).toBeCloseTo((As * fy * (d - a / 2)) / 1e6, 9)
  })

  it('solves fs when the section is over-reinforced, and equilibrium closes', () => {
    const b = 200, d = 234, As = 1608, fc = 21, fy = 550     // 2-⌀32 in a 200×300
    const r = rectCapacity(b, d, d, As, fc, fy)
    expect(r.fsYields).toBe(false)
    expect(r.fs).toBeLessThan(fy)
    // C = T at the reported block…
    expect(0.85 * fc * b * r.a).toBeCloseTo(As * r.fs, 6)
    // …and fs is on the strain diagram at the reported neutral axis.
    expect(r.fs).toBeCloseTo((600 * (d - r.c)) / r.c, 9)
  })

  it('always puts the neutral axis inside d — the steel never goes compressive', () => {
    for (const b of [150, 300, 600])
      for (const d of [200, 400, 800])
        for (const As of [500, 2000, 8000, 30000])
          for (const fc of [21, 35, 55])
            for (const fy of [275, 415, 550]) {
              const r = rectCapacity(b, d, d, As, fc, fy)
              expect(r.c).toBeGreaterThan(0)
              expect(r.c).toBeLessThan(d)
              expect(r.fs).toBeGreaterThan(0)
              expect(0.85 * fc * b * r.a).toBeCloseTo(As * r.fs, 4)
            }
  })

  it('φ follows εt at the EXTREME layer, not at the centroid', () => {
    const light = rectCapacity(300, 540, 560, 1200, 28, 415)
    expect(light.phi).toBeCloseTo(0.90, 9)
    const heavy = rectCapacity(200, 234, 234, 1608, 21, 550)
    expect(heavy.phi).toBeCloseTo(0.65, 9)                 // compression-controlled
    // dt > d raises εt, so it can only raise φ
    const atD = rectCapacity(300, 400, 400, 6000, 28, 415)
    const atDt = rectCapacity(300, 400, 450, 6000, 28, 415)
    expect(atDt.phi).toBeGreaterThanOrEqual(atD.phi)
    expect(atDt.Mn).toBeCloseTo(atD.Mn, 9)                 // …and cannot touch Mn
  })

  it('agrees with the T-beam solver on a section that is a rectangle', () => {
    // `tBeamCapacity` reaches the same equilibrium by different code: give it a
    // flange it never leaves (hf ≥ a) at bf = b and the two must coincide.
    for (const As of [1000, 4000, 9000]) {
      const r = rectCapacity(400, 500, 500, As, 28, 415)
      const t = tBeamCapacity({ bw: 400, hf: 500, fc: 28, fy: 415 }, 400, 500, 500, As)
      expect(t.fs).toBeCloseTo(r.fs, 9)
      expect(t.c).toBeCloseTo(r.c, 9)
      expect(t.phiMn).toBeCloseTo(r.phiMn, 9)
    }
  })

  it('is zero-safe', () => {
    expect(rectCapacity(300, 500, 500, 0, 28, 415).Mn).toBe(0)
    expect(rectCapacity(0, 500, 500, 1000, 28, 415).Mn).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// TWO MINIMA, and which one a footing is held to.
//
// §9.6.1.2 is the beam rule on b·d. §24.4.3.2 is the shrinkage rule on the
// GROSS section b·h, and §13.3.2.1 sends footings there. They disagree, and
// the engine only ever applied the beam one — the slab rule could not even
// enter the comparison, because `flexuralSteel` was never told h.
// ─────────────────────────────────────────────────────────────────────────
describe('minimum steel', () => {
  it('ρ_sh is BANDED on fy — 0.0018 is the Grade-420 row, not a constant', () => {
    expect(rhoShrinkage(275)).toBeCloseTo(0.0020, 9)
    expect(rhoShrinkage(415)).toBeCloseTo(0.0020, 9)     // Grade 415 is below 420
    expect(rhoShrinkage(420)).toBeCloseTo(0.0018, 9)
    expect(rhoShrinkage(550)).toBeCloseTo(Math.max((0.0018 * 420) / 550, 0.0014), 9)
    expect(rhoShrinkage(700)).toBeCloseTo(0.0014, 9)     // floored
  })

  it('compares both and takes the greater by default', () => {
    const m = flexuralAsMin({ fc: 21, fy: 415, b: 2000, d: 515, h: 600 })
    expect(m.beam).toBeCloseTo(rhoMin(21, 415) * 2000 * 515, 6)
    expect(m.slab).toBeCloseTo(0.0020 * 2000 * 600, 6)
    expect(m.As).toBe(Math.max(m.beam, m.slab))
    expect(m.governs).toBe('beam')
  })

  it('each basis can be asked for on its own', () => {
    const at = (basis: 'max' | 'beam' | 'slab') =>
      flexuralAsMin({ fc: 21, fy: 415, b: 2000, d: 515, h: 600, basis })
    expect(at('beam').As).toBeGreaterThan(at('slab').As)
    expect(at('max').As).toBe(at('beam').As)
  })

  it('without h the slab rule cannot apply — the old behaviour, unchanged', () => {
    const m = flexuralAsMin({ fc: 21, fy: 415, b: 2000, d: 515 })
    expect(m.slab).toBe(0)
    expect(m.As).toBeCloseTo(rhoMin(21, 415) * 2000 * 515, 6)
  })

  it('the slab rule CAN govern — a thick section with light flexural depth', () => {
    // h well above d is where the gross-section rule bites: a 1200 mm raft
    // with 400 mm of cover and ducts.
    const m = flexuralAsMin({ fc: 28, fy: 420, b: 1000, d: 500, h: 1200 })
    expect(m.slab).toBeGreaterThan(m.beam)
    expect(m.governs).toBe('slab')
  })

  it('flexuralSteel reports both candidates so a sheet can show the comparison', () => {
    const r = flexuralSteel({ Mu: 474, b: 2000, d: 515, h: 600, fc: 21, fy: 415 })
    expect(r.asMinBeam).toBeGreaterThan(0)
    expect(r.asMinSlab).toBeGreaterThan(0)
    expect(r.usedMin).toBe(true)
    expect(r.As).toBe(Math.max(r.asMinBeam, r.asMinSlab))
    // …and the slab-only basis lets the moment govern instead
    const slabOnly = flexuralSteel({ Mu: 474, b: 2000, d: 515, h: 600, fc: 21, fy: 415, asMinBasis: 'slab' })
    expect(slabOnly.usedMin).toBe(false)
    expect(slabOnly.As).toBeLessThan(r.As)
  })
})
