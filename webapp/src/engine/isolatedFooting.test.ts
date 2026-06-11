import { describe, it, expect } from 'vitest';
import { designSquareFooting } from './isolatedFooting';
import { netBearing } from './bearing';
import { twoWayVc, oneWayVc } from './shear';
import { rhoMin } from './flexure';

describe('designSquareFooting (integration)', () => {
  const input = {
    serviceLoad: 1000, ultimateLoad: 1400, columnWidth: 400,
    fc: 28, fy: 415, qAllow: 200, gammaSoil: 18, gammaConc: 24,
    H: 1.5, barDia: 20, cover: 75, position: 'interior' as const,
  };
  const r = designSquareFooting(input);

  it('produces sane geometry', () => {
    expect(r.B).toBeGreaterThan(1);
    expect(r.B).toBeLessThan(6);
    expect(r.Dc % 25).toBe(0);          // rounded to 25 mm
    expect(r.Dc).toBeGreaterThanOrEqual(250);
  });

  it('B carries the service load within net bearing', () => {
    const qNet = netBearing({ ...input, Dc: r.Dc / 1000 });
    const qActual = input.serviceLoad / (r.B * r.B);
    expect(qActual).toBeLessThanOrEqual(qNet + 1e-6);
  });

  it('the governing depth satisfies both shear checks', () => {
    const d = Math.max(r.dPunch, r.dBeam);
    // punching
    const crit = input.columnWidth + d;
    const VuP = input.ultimateLoad - r.qu * crit * crit * 1e-6;
    const capP = 0.75 * twoWayVc({ fc: input.fc, bo: 4 * crit, d, betaC: 1, position: 'interior' });
    expect(capP).toBeGreaterThanOrEqual(VuP);
    // one-way
    const arm = (r.B - input.columnWidth / 1000) / 2 - d / 1000;
    const VuB = r.qu * r.B * Math.max(0, arm);
    const capB = 0.75 * oneWayVc({ fc: input.fc, b: r.B * 1000, d });
    expect(capB).toBeGreaterThanOrEqual(VuB);
  });

  it('reinforcement respects ρ_min and is buildable', () => {
    expect(r.rho).toBeGreaterThanOrEqual(rhoMin(input.fc, input.fy) - 1e-9);
    expect(r.bars).toBeGreaterThanOrEqual(2);
    expect(r.barSpacing).toBeGreaterThan(0);
  });

  it('defaults to the iteration design path', () => {
    expect(r.analysis).toBe('design');
    expect(r.method).toBe('iteration');
    expect(r.punchOK && r.beamOK).toBe(true);
  });

  it('approximate method gives a one-pass (conservative) thickness', () => {
    const a = designSquareFooting({ ...input, solutionMethod: 'approximate' });
    expect(a.method).toBe('approximate');
    expect(a.Dc % 25).toBe(0);
    expect(a.Dc).toBeGreaterThanOrEqual(r.Dc - 1e-6);
  });

  it('analyze: an adequate section passes, a thin one fails', () => {
    const okCase = designSquareFooting({ ...input, analysis: 'analyze', givenB: r.B, givenDc: r.Dc });
    expect(okCase.analysis).toBe('analyze');
    expect(okCase.punchOK && okCase.beamOK).toBe(true);
    const thin = designSquareFooting({ ...input, analysis: 'analyze', givenB: r.B, givenDc: 300 });
    expect(thin.punchOK && thin.beamOK).toBe(false);
  });
});

describe('rectangular columns', () => {
  const input = {
    serviceLoad: 1000, ultimateLoad: 1400, columnWidth: 400,
    fc: 28, fy: 415, qAllow: 200, gammaSoil: 18, gammaConc: 24,
    H: 1.5, barDia: 20, cover: 75, position: 'interior' as const,
  };
  it('punching uses the cx × cy perimeter; one-way uses the smaller dim', () => {
    const sq600 = designSquareFooting({ ...input, columnWidth: 600 });
    const r = designSquareFooting({ ...input, columnWidth: 600, columnWidthY: 300 });
    expect(r.Dc % 25).toBe(0);
    // smaller cy → longer cantilever → one-way demand can only grow
    expect(r.dBeam).toBeGreaterThanOrEqual(sq600.dBeam);
    // smaller perimeter + beta penalty → punching depth can only grow
    expect(r.dPunch).toBeGreaterThanOrEqual(sq600.dPunch);
  });
});
