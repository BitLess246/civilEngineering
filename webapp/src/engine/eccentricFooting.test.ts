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

describe('analysis & solution methods', () => {
  it('approximate gives a one-pass thickness ≥ the iterated one', () => {
    const it_ = designEccentricSquareFooting({ ...base, serviceMoment: 200, ultimateMoment: 280 });
    const ap = designEccentricSquareFooting({ ...base, serviceMoment: 200, ultimateMoment: 280, solutionMethod: 'approximate' });
    expect(ap.method).toBe('approximate');
    expect(ap.Dc).toBeGreaterThanOrEqual(it_.Dc - 1e-6);
  });

  it('analyze: adequate section passes; undersized plan fails bearing', () => {
    const d = designEccentricSquareFooting({ ...base, serviceMoment: 200, ultimateMoment: 280 });
    const ok = designEccentricSquareFooting({
      ...base, serviceMoment: 200, ultimateMoment: 280,
      analysis: 'analyze', givenB: d.B, givenDc: d.Dc,
    });
    expect(ok.punchOK && ok.beamOK && ok.bearingOK).toBe(true);
    const small = designEccentricSquareFooting({
      ...base, serviceMoment: 200, ultimateMoment: 280,
      analysis: 'analyze', givenB: d.B - 0.6, givenDc: d.Dc,
    });
    expect(small.bearingOK).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// bearingOK WAS NEVER COMPUTED IN DESIGN MODE.
//
// The same defect as `isolatedFooting` (#726) and `rectangularFooting`, and
// here it reaches the PRIMARY GEOTECHNICAL CHECK: the peak service pressure
// under an eccentric pad against what the soil may carry. `punchOK`, `beamOK`
// and `bearingOK` were all assigned only in `analyze` mode and left hardcoded
// true in both design paths — so q_allow = 0, a negative column load and a
// 30 m overburden each reported `bearingOK: true` on a pad whose B was NaN.
// ─────────────────────────────────────────────────────────────────────────
describe('the three verdicts are checks, not assertions', () => {
  const E: EccentricFootingInput = { ...base, serviceMoment: 200, ultimateMoment: 280 };

  it('a sound pad still passes all three, in every mode', () => {
    for (const over of [{}, { solutionMethod: 'approximate' as const }]) {
      const r = designEccentricSquareFooting({ ...E, ...over });
      expect(r.punchOK).toBe(true);
      expect(r.beamOK).toBe(true);
      expect(r.bearingOK).toBe(true);
      // and bearing passes because the pressure really is inside the allowable
      expect(r.qMaxService).toBeLessThanOrEqual(r.qNet + 1e-9);
    }
  });

  it('a pad with no plan fails all three — including the bearing check', () => {
    for (const over of [
      { qAllow: 0 },
      { serviceLoad: -1000, ultimateLoad: -1400 },
      { H: 30 },
    ]) {
      const r = designEccentricSquareFooting({ ...E, ...over });
      expect(Number.isFinite(r.B)).toBe(false);
      expect(r.punchOK).toBe(false);
      expect(r.beamOK).toBe(false);
      expect(r.bearingOK).toBe(false);
    }
  });

  it('analyze mode is unchanged, and bearing still fails on an over-pressured pad', () => {
    const sound = designEccentricSquareFooting(E);
    const small = designEccentricSquareFooting({ ...E, analysis: 'analyze', givenB: sound.B * 0.5, givenDc: sound.Dc });
    expect(small.bearingOK).toBe(false);
    const ample = designEccentricSquareFooting({ ...E, analysis: 'analyze', givenB: sound.B, givenDc: sound.Dc });
    expect(ample.bearingOK).toBe(true);
  });
});
