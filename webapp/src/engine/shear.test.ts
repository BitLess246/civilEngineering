import { describe, it, expect } from 'vitest';
import { twoWayVc, punchingDepth, oneWayVc, oneWayShearDepth } from './shear';

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
