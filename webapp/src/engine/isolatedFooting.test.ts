import { describe, it, expect } from 'vitest';
import { designSquareFooting } from './isolatedFooting';
import { netBearing } from './bearing';
import { twoWayVc, oneWayVc, type ColumnPosition } from './shear';
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

// ─────────────────────────────────────────────────────────────────────────
// columnOffset — the property-line consequences of a column at a free edge.
//
// "Column position" used to set αs and nothing else: same B, same Dc, same
// depth for interior, edge and corner, and the drawing showed the column
// centred in all three. It is a geometric statement, so it now has geometry.
// ─────────────────────────────────────────────────────────────────────────
describe('columnOffset — a column at a free edge', () => {
  const base = {
    serviceLoad: 900, ultimateLoad: 1300, columnWidth: 400, fc: 21, fy: 415,
    qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5, barDia: 20, cover: 75,
  }
  const at = (position: ColumnPosition) => designSquareFooting({ ...base, position })

  it('is absent for an interior column', () => {
    expect(at('interior').offset).toBeNull()
  })

  it('puts the column face flush with the edge — e = (B − c)/2', () => {
    const r = at('edge')
    expect(r.offset!.ex).toBeCloseTo((r.B - 0.4) / 2, 9)
    expect(r.offset!.ey).toBe(0)
  })

  it('offsets both axes at a corner, and the resultant is the vector sum', () => {
    const r = at('corner')
    expect(r.offset!.ey).toBeCloseTo(r.offset!.ex, 9)
    expect(r.offset!.e).toBeCloseTo(Math.hypot(r.offset!.ex, r.offset!.ey), 9)
  })

  it('reports the uplift rather than hiding it — a flush pad cannot bear fully', () => {
    const r = at('edge')
    expect(r.offset!.kernOK).toBe(false)
    expect(r.offset!.qMin).toBeLessThan(0)          // the base lifts
    expect(r.offset!.qMax).toBeGreaterThan(r.qNet)
  })

  it('and it CANNOT be sized out of — the offset grows with B', () => {
    // This is why a property-line pad is strapped or combined rather than
    // simply enlarged: e = (B − c)/2 outruns the kern B/6 for any B > 1.5c.
    const small = designSquareFooting({ ...base, position: 'edge', serviceLoad: 200, ultimateLoad: 300 })
    const large = designSquareFooting({ ...base, position: 'edge', serviceLoad: 4000, ultimateLoad: 6000 })
    expect(large.B).toBeGreaterThan(small.B)
    expect(large.offset!.ex).toBeGreaterThan(small.offset!.ex)   // worse, not better
    for (const r of [small, large]) expect(r.offset!.kernOK).toBe(false)
  })

  it('names the strap moment that would fix it', () => {
    const r = at('edge')
    expect(r.offset!.restraint).toBeCloseTo(base.serviceLoad * r.offset!.e, 6)
  })

  it('the truncated critical section makes the pad thicker, not thinner', () => {
    // The visible consequence of the perimeter fix: choosing "edge" used to
    // change nothing at all.
    expect(at('edge').Dc).toBeGreaterThan(at('interior').Dc)
    expect(at('corner').Dc).toBeGreaterThan(at('edge').Dc)
  })
})
