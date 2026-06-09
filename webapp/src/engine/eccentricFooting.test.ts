import { describe, it, expect } from 'vitest';
import { designEccentricSquareFooting, type EccentricFootingInput } from './eccentricFooting';
import { designSquareFooting } from './isolatedFooting';

const base: Omit<EccentricFootingInput, 'serviceMoment' | 'ultimateMoment'> = {
  serviceLoad: 1000, ultimateLoad: 1400, columnWidth: 400,
  fc: 28, fy: 415, qAllow: 200, gammaSoil: 18, gammaConc: 24,
  H: 1.5, barDia: 20, cover: 75, position: 'interior',
};

describe('designEccentricSquareFooting', () => {
  it('reduces to the concentric square footing when M = 0', () => {
    const ec = designEccentricSquareFooting({ ...base, serviceMoment: 0, ultimateMoment: 0 });
    const sq = designSquareFooting(base);
    expect(ec.e).toBe(0);
    expect(ec.B).toBeCloseTo(sq.B, 6);
    expect(ec.Dc).toBe(sq.Dc);
    expect(ec.qMaxService).toBeCloseTo(ec.qMinService, 6);
  });

  it('eccentricity raises q_max above q_min and enlarges the footing', () => {
    const ec = designEccentricSquareFooting({ ...base, serviceMoment: 200, ultimateMoment: 280 });
    const sq = designSquareFooting(base);
    expect(ec.e).toBeCloseTo(0.2, 6);          // 200/1000
    expect(ec.qMaxService).toBeGreaterThan(ec.qMinService);
    expect(ec.B).toBeGreaterThanOrEqual(sq.B);  // needs more area / kern
    expect(ec.qMaxService).toBeLessThanOrEqual(ec.qNet + 1e-6);
  });

  it('keeps the load in the kern (no uplift): e ≤ B/6, q_min ≥ 0', () => {
    const ec = designEccentricSquareFooting({ ...base, serviceMoment: 400, ultimateMoment: 560 });
    expect(ec.kernOK).toBe(true);
    expect(ec.B).toBeGreaterThanOrEqual(6 * ec.e - 1e-9);
    expect(ec.qMinService).toBeGreaterThanOrEqual(-1e-6);
  });
});
