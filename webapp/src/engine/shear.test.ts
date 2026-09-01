import { describe, it, expect } from 'vitest';
import { twoWayVc, punchingDepth, oneWayVc, oneWayShearDepth, criticalSection } from './shear';

describe('twoWayVc', () => {
  it('takes the (1/3)√fc·bo·d term for a square interior column', () => {
    // base = √28 · 2800 · 400 / 1000 = 5926.48 kN ; vc1 = base/3 = 1975.49
    const vc = twoWayVc({ fc: 28, bo: 2800, d: 400, betaC: 1, position: 'interior' });
    expect(vc).toBeCloseTo(1975.49, 1);
  });
});

describe('punchingDepth', () => {
  it('returns the smallest passing d (and it actually passes)', () => {
    const args = { Pu: 1000, qu: 200, c: 300, fc: 28, position: 'interior' as const };
    const d = punchingDepth(args);
    const cap = (dd: number) =>
      0.75 * twoWayVc({ fc: 28, bo: 4 * (300 + dd), d: dd, betaC: 1, position: 'interior' });
    const Vu = (dd: number) => args.Pu - args.qu * Math.pow(300 + dd, 2) * 1e-6;
    expect(cap(d)).toBeGreaterThanOrEqual(Vu(d));        // passes at d
    expect(cap(d - 1)).toBeLessThan(Vu(d - 1));          // fails just below
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(3000);
  });
});

describe('oneWayVc / oneWayShearDepth', () => {
  it('Vc = (1/6)√fc·b·d', () => {
    // √28 · 1000 · 300 / 6000 = 264.6 kN
    expect(oneWayVc({ fc: 28, b: 1000, d: 300 })).toBeCloseTo(264.57, 1);
  });
  it('returns a depth that satisfies one-way shear', () => {
    const p = { qu: 200, B: 2.5, c: 0.4, fc: 28 };
    const d = oneWayShearDepth(p);
    const arm = (p.B - p.c) / 2 - d / 1000;
    const Vu = p.qu * p.B * Math.max(0, arm);
    const cap = 0.75 * oneWayVc({ fc: 28, b: p.B * 1000, d });
    expect(cap).toBeGreaterThanOrEqual(Vu);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// criticalSection — §22.6.4.1, TRUNCATED at a free edge.
//
// `punchingDepth` used the interior perimeter for every position and varied
// αs alone, which is the one thing the three αs values do NOT mean on their
// own: they exist because the section loses sides. Choosing "edge" bought a
// small penalty on one Vc expression while keeping a perimeter 44% longer
// than the section has — and in the common case αs is not governing, so the
// choice changed nothing at all.
// ─────────────────────────────────────────────────────────────────────────
describe('criticalSection', () => {
  const c = 500, d = 150

  it('interior: the full rectangle at d/2 all round', () => {
    const r = criticalSection(c, c, d)
    expect(r.ax).toBe(c + d); expect(r.ay).toBe(c + d)
    expect(r.bo).toBe(2 * (c + d) + 2 * (c + d))     // 2600
    expect(r.Ao).toBe((c + d) * (c + d))
  })

  it('edge: three sides, and the section stops AT the free edge', () => {
    const r = criticalSection(c, c, d, 'edge')
    expect(r.ax).toBe(c + d / 2)                     // truncated in x
    expect(r.ay).toBe(c + d)
    expect(r.bo).toBe((c + d) + 2 * (c + d / 2))     // 1800
  })

  it('corner: two sides', () => {
    const r = criticalSection(c, c, d, 'corner')
    expect(r.bo).toBe((c + d / 2) + (c + d / 2))     // 1150
  })

  it('the truncation is the interior section less what a free edge removes', () => {
    // Derived a second way: drop one whole side, and d/2 off each of the two
    // that remain. Independent of the formula above, so agreement is a check.
    const interior = criticalSection(c, c, d).bo
    expect(criticalSection(c, c, d, 'edge').bo).toBe(interior - (c + d) - d)
    expect(criticalSection(c, c, d, 'corner').bo)
      .toBe(criticalSection(c, c, d, 'edge').bo - (c + d / 2) - d / 2)
  })

  it('a free edge always shortens the perimeter and the area', () => {
    for (const cx of [250, 500, 900]) for (const cy of [250, 600]) for (const dd of [100, 400]) {
      const i = criticalSection(cx, cy, dd), e = criticalSection(cx, cy, dd, 'edge')
      const k = criticalSection(cx, cy, dd, 'corner')
      expect(e.bo).toBeLessThan(i.bo); expect(k.bo).toBeLessThan(e.bo)
      expect(e.Ao).toBeLessThan(i.Ao); expect(k.Ao).toBeLessThan(e.Ao)
    }
  })

  it('interior is unchanged from the expression it replaced', () => {
    for (const cx of [200, 450, 900]) for (const cy of [200, 600]) for (const dd of [80, 300, 1200]) {
      const r = criticalSection(cx, cy, dd)
      expect(r.bo).toBe(2 * ((cx + dd) + (cy + dd)))
      expect(r.Ao).toBe((cx + dd) * (cy + dd))
    }
  })

  it('a truncated section demands a deeper footing — the safe direction', () => {
    const at = (position: 'interior' | 'edge' | 'corner') =>
      punchingDepth({ Pu: 1300, qu: 235, c: 400, fc: 21, position })
    expect(at('edge')).toBeGreaterThan(at('interior'))
    expect(at('corner')).toBeGreaterThan(at('edge'))
  })
})
