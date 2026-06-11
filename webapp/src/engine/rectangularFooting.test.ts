import { describe, it, expect } from 'vitest';
import { designRectangularFooting, type RectFootingInput } from './rectangularFooting';
import { designSquareFooting } from './isolatedFooting';

const base: Omit<RectFootingInput, 'sizing'> = {
  serviceLoad: 1200, ultimateLoad: 1680, columnWidth: 400,
  fc: 28, fy: 415, qAllow: 200, gammaSoil: 18, gammaConc: 24,
  H: 1.5, barDia: 20, cover: 75, position: 'interior',
};

describe('designRectangularFooting — ratio mode', () => {
  const r = designRectangularFooting({ ...base, sizing: { mode: 'ratio', ratio: 1.5 } });
  it('long side is along x and roughly the target aspect', () => {
    expect(r.Bx).toBeGreaterThan(r.By);
    expect(r.Bx / r.By).toBeGreaterThan(1.3);
    expect(r.Bx / r.By).toBeLessThan(1.7);
  });
  it('produces a sane thickness and contains the column both ways', () => {
    expect(r.Dc).toBeGreaterThan(200);
    expect(r.By).toBeGreaterThan(base.columnWidth / 1000);
  });
  it('short-direction central band: fraction 2/(β+1), bandBars ≤ total', () => {
    const beta = r.Bx / r.By;
    expect(r.short.bandFraction).toBeCloseTo(2 / (beta + 1), 6);
    expect(r.short.bandBars).toBeLessThanOrEqual(r.short.bars);
    expect(r.short.bandBars).toBeGreaterThanOrEqual(2);
  });
});

describe('designRectangularFooting — fixedWidth mode', () => {
  it('honours the constrained By and solves Bx for area', () => {
    const r = designRectangularFooting({ ...base, sizing: { mode: 'fixedWidth', By: 2.0 } });
    expect(r.By).toBeCloseTo(2.0, 6);
    expect(r.Bx).toBeGreaterThan(0);
  });
});

describe('ratio 1 ≈ square footing', () => {
  it('matches designSquareFooting for the same inputs', () => {
    const sq = designSquareFooting(base);
    const rc = designRectangularFooting({ ...base, sizing: { mode: 'ratio', ratio: 1 } });
    expect(rc.Bx).toBeCloseTo(rc.By, 6);
    expect(rc.Bx).toBeCloseTo(sq.B, 1);   // same plan size (within rounding)
    expect(rc.Dc).toBe(sq.Dc);
  });
});

describe('analysis & solution methods', () => {
  it('approximate gives a one-pass thickness ≥ the iterated one', () => {
    const it_ = designRectangularFooting({ ...base, sizing: { mode: 'ratio', ratio: 1.5 } });
    const ap = designRectangularFooting({ ...base, sizing: { mode: 'ratio', ratio: 1.5 }, solutionMethod: 'approximate' });
    expect(ap.method).toBe('approximate');
    expect(ap.Dc).toBeGreaterThanOrEqual(it_.Dc - 1e-6);
  });

  it('analyze: adequate section passes, thin one fails', () => {
    const d = designRectangularFooting({ ...base, sizing: { mode: 'ratio', ratio: 1.5 } });
    const ok = designRectangularFooting({
      ...base, sizing: { mode: 'ratio', ratio: 1.5 },
      analysis: 'analyze', givenBx: d.Bx, givenBy: d.By, givenDc: d.Dc,
    });
    expect(ok.punchOK && ok.beamOK).toBe(true);
    const thin = designRectangularFooting({
      ...base, sizing: { mode: 'ratio', ratio: 1.5 },
      analysis: 'analyze', givenBx: d.Bx, givenBy: d.By, givenDc: 300,
    });
    expect(thin.punchOK && thin.beamOK).toBe(false);
  });
});
