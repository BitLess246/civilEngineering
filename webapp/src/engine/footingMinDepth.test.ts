// NSCP 2015 §413.3.1.2 / ACI 318-14 §13.3.1.2 — the depth of a footing's
// bottom reinforcement is at least 150 mm. Shear alone sized a lightly loaded
// pad to 175 mm (≈ 90 mm over the mat); every designer now floors d at 150.
import { describe, it, expect } from 'vitest';
import { designSquareFooting } from './isolatedFooting';
import { designRectangularFooting } from './rectangularFooting';
import { designEccentricSquareFooting } from './eccentricFooting';
import { designCombinedFooting } from './combinedFooting';
import { MIN_FOOTING_DEPTH } from './shear';

// 150 kN service under a 400 column on 200 kPa soil: shear needs well under 150 mm
const light = {
  serviceLoad: 150, ultimateLoad: 210, columnWidth: 400,
  fc: 28, fy: 415, qAllow: 200, gammaSoil: 18, gammaConc: 24,
  H: 1.5, barDia: 16, cover: 75, position: 'interior' as const,
};
// the floor, as built: 150 + 75 + 16 = 241 → 250 mm
const DC_FLOOR = 250;

describe('footing minimum depth — §413.3.1.2', () => {
  it('is 150 mm', () => expect(MIN_FOOTING_DEPTH).toBe(150));

  it('a lightly loaded square pad is floored, not sized by shear', () => {
    const r = designSquareFooting(light);
    expect(Math.max(r.dPunch, r.dBeam)).toBeLessThan(MIN_FOOTING_DEPTH);   // shear alone would go thinner
    expect(r.Dc).toBe(DC_FLOOR);
    expect(r.dProvided).toBeGreaterThanOrEqual(MIN_FOOTING_DEPTH);
    expect(r.minDepthOK).toBe(true);
    expect(designSquareFooting({ ...light, solutionMethod: 'approximate' }).Dc).toBe(DC_FLOOR);
  });

  it('a given 175 mm pad passes shear and FAILS the minimum when analysed', () => {
    const r = designSquareFooting({ ...light, analysis: 'analyze', givenB: 1.0, givenDc: 175 });
    expect(r.dProvided).toBe(175 - 75 - 16);
    expect(r.punchOK && r.beamOK).toBe(true);
    expect(r.minDepthOK).toBe(false);
  });

  it('rectangular, eccentric and combined pads take the same floor', () => {
    expect(designRectangularFooting({ ...light, sizing: { mode: 'ratio', ratio: 1.5 } }).Dc).toBe(DC_FLOOR);
    const e = designEccentricSquareFooting({ ...light, serviceMoment: 5, ultimateMoment: 7 });
    expect(e.Dc).toBe(DC_FLOOR);
    expect(e.minDepthOK).toBe(true);
    const c = designCombinedFooting({
      col1Width: 400, col2Width: 400, spacing: 3.0, dl1: 60, ll1: 30, dl2: 60, ll2: 30,
      leftOverhang: 0, rightOverhang: 0, leftRestrict: false, rightRestrict: false,
      fc: 28, fy: 415, qAllow: 200, gammaSoil: 18, gammaConc: 24, surcharge: 0,
      H: 1.5, barDia: 16, cover: 75,
    });
    // a combined pad's beam shear runs over its narrow width, so even light
    // columns usually go past the floor — what matters is that it never goes under
    expect(c.Dc - 75 - 16).toBeGreaterThanOrEqual(MIN_FOOTING_DEPTH);
    const tiny = designCombinedFooting({
      col1Width: 400, col2Width: 400, spacing: 1.2, dl1: 5, ll1: 2, dl2: 5, ll2: 2,
      leftOverhang: 0.3, rightOverhang: 0.3, leftRestrict: true, rightRestrict: true,
      fc: 28, fy: 415, qAllow: 200, gammaSoil: 18, gammaConc: 24, surcharge: 0,
      H: 1.5, barDia: 16, cover: 75,
    });
    expect(tiny.Dc).toBe(DC_FLOOR);
  });

  it('a pad that shear already makes deeper is untouched', () => {
    const r = designSquareFooting({ ...light, serviceLoad: 1000, ultimateLoad: 1400 });
    expect(r.Dc).toBeGreaterThan(DC_FLOOR);
    expect(Math.max(r.dPunch, r.dBeam)).toBeGreaterThan(MIN_FOOTING_DEPTH);
  });
});
