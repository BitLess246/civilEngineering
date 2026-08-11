import { describe, it, expect } from 'vitest';
import { designPileCap, pileCapSolution, pileCentres } from './pileCap';

// Shared base inputs — 4-pile square cap, concentric load
const BASE = {
  serviceLoad: 2000, serviceMomX: 0, serviceMomY: 0,
  ultimateLoad: 2800, ultimateMomX: 0, ultimateMomY: 0,
  nPiles: 4 as const,
  pileDia: 400, pileCapacity: 600, spacing: 1200, edgeDist: 500,
  colX: 500, colY: 500,
  fc: 28, fy: 415, cover: 75, barDia: 20, pileEmbed: 150,
};

describe('pileCentres', () => {
  it('returns N piles for each arrangement', () => {
    ([2, 3, 4, 6, 9] as const).forEach(n => {
      expect(pileCentres(n, 1200)).toHaveLength(n);
    });
  });

  it('pile group centroid is at origin for all arrangements', () => {
    ([2, 3, 4, 6, 9] as const).forEach(n => {
      const coords = pileCentres(n, 1200);
      const cx = coords.reduce((s, p) => s + p.x, 0) / n;
      const cy = coords.reduce((s, p) => s + p.y, 0) / n;
      expect(cx).toBeCloseTo(0, 8);
      expect(cy).toBeCloseTo(0, 8);
    });
  });

  it('4-pile group has correct coordinates', () => {
    const coords = pileCentres(4, 1200);
    expect(coords.map(p => p.x).sort()).toEqual([-600, -600, 600, 600]);
    expect(coords.map(p => p.y).sort()).toEqual([-600, -600, 600, 600]);
  });
});

describe('designPileCap — concentric 4-pile', () => {
  it('produces a valid design', () => {
    const r = designPileCap(BASE);
    expect(r.Dc).toBeGreaterThan(0);
    expect(r.d).toBeGreaterThan(0);
    expect(r.capBx).toBeGreaterThan(0);
  });

  it('cap covers all piles with edge distance', () => {
    const r = designPileCap(BASE);
    // Each pile is at ±600mm; cap half-width = capBx/2; must be ≥ 600 + 500 = 1100 mm
    expect(r.capBx / 2).toBeGreaterThanOrEqual(BASE.spacing / 2 + BASE.edgeDist);
  });

  it('equal service reactions for concentric load', () => {
    const r = designPileCap(BASE);
    const expected = BASE.serviceLoad / 4;
    r.reactions.forEach(ri => expect(ri).toBeCloseTo(expected, 5));
  });

  it('pile capacity check passes', () => {
    const r = designPileCap(BASE);
    // 2000/4 = 500 kN ≤ 600 kN pileCapacity
    expect(r.capacityOK).toBe(true);
    expect(r.maxReaction).toBeCloseTo(500, 3);
  });

  it('all shear checks pass', () => {
    const r = designPileCap(BASE);
    expect(r.punchColOK).toBe(true);
    expect(r.punchPileOK).toBe(true);
    expect(r.beamXOK).toBe(true);
    expect(r.beamYOK).toBe(true);
  });

  it('reported φVc > Vu for each check', () => {
    const r = designPileCap(BASE);
    expect(r.phiVcPunchCol).toBeGreaterThanOrEqual(r.VuPunchCol);
    expect(r.phiVcPunchPile).toBeGreaterThanOrEqual(r.VuPunchPile);
    expect(r.phiVcBeamX).toBeGreaterThanOrEqual(r.VuBeamX);
    expect(r.phiVcBeamY).toBeGreaterThanOrEqual(r.VuBeamY);
  });

  it('Dc is a multiple of 25 mm', () => {
    const r = designPileCap(BASE);
    expect(r.Dc % 25).toBe(0);
  });

  it('effective depth = Dc − cover − db/2', () => {
    const r = designPileCap(BASE);
    expect(r.d).toBeCloseTo(r.Dc - BASE.cover - BASE.barDia / 2, 5);
  });

  it('steel area is positive and bars ≥ 2', () => {
    const r = designPileCap(BASE);
    expect(r.steelX.As).toBeGreaterThan(0);
    expect(r.steelX.bars).toBeGreaterThanOrEqual(2);
    expect(r.steelY.As).toBeGreaterThan(0);
    expect(r.steelY.bars).toBeGreaterThanOrEqual(2);
  });
});

describe('designPileCap — eccentric load (uniaxial Y)', () => {
  const ECC = { ...BASE, serviceMomY: 200, ultimateMomY: 280 };

  it('piles on +x side have higher reaction than −x side', () => {
    const r = designPileCap(ECC);
    // Piles at x = +600: higher load; x = -600: lower load
    const posR = r.reactions.filter((_, i) => r.coords[i].x > 0);
    const negR = r.reactions.filter((_, i) => r.coords[i].x < 0);
    expect(Math.min(...posR)).toBeGreaterThan(Math.max(...negR));
  });

  it('all shear checks still pass', () => {
    const r = designPileCap(ECC);
    expect(r.punchColOK).toBe(true);
    expect(r.punchPileOK).toBe(true);
    expect(r.beamXOK).toBe(true);
    expect(r.beamYOK).toBe(true);
  });
});

describe('designPileCap — 9-pile cap', () => {
  const NINE = {
    ...BASE,
    serviceLoad: 5400, ultimateLoad: 7560,
    nPiles: 9 as const,
    pileCapacity: 700, spacing: 1400, edgeDist: 600,
    colX: 600, colY: 600,
  };

  it('produces valid design for 9 piles', () => {
    const r = designPileCap(NINE);
    expect(r.coords).toHaveLength(9);
    expect(r.Dc).toBeGreaterThan(0);
    expect(r.capacityOK).toBe(true);
  });
});

describe('pileCapSolution — the printed report', () => {
  // Four failure modes size the cap and the report has to show all four, so
  // the step list is asserted by name, not just by count.
  it('shows every check that sized the cap', () => {
    const r = designPileCap(BASE);
    const s = pileCapSolution(BASE, r);
    const titles = s.map(st => st.title);
    expect(titles).toEqual([
      'Cap plan dimensions',
      'Service pile reactions',
      'Cap thickness',
      'Two-way (punching) shear at the column',
      'Two-way (punching) shear at a pile',
      'One-way (beam) shear, both directions',
      'Flexure at the column face',
      'Development of the bottom bars',
    ]);
  });

  it('every PASS chip matches the result it reports', () => {
    // An overloaded group and a well-behaved one, so both polarities run.
    for (const inp of [BASE, { ...BASE, serviceLoad: 4000, ultimateLoad: 5600 }]) {
      const r = designPileCap(inp);
      const s = pileCapSolution(inp, r);
      const pass = (t: string) => s.find(st => st.title === t)!.pass;
      expect(pass('Service pile reactions')).toBe(r.capacityOK);
      expect(pass('Two-way (punching) shear at the column')).toBe(r.punchColOK);
      expect(pass('Two-way (punching) shear at a pile')).toBe(r.punchPileOK);
      expect(pass('One-way (beam) shear, both directions')).toBe(r.beamXOK && r.beamYOK);
      expect(pass('Development of the bottom bars')).toBe(r.ldOK);
    }
    expect(designPileCap({ ...BASE, serviceLoad: 4000, ultimateLoad: 5600 }).capacityOK).toBe(false);
  });

  it('prints the solver’s own dimensions, steel and no undefined', () => {
    const r = designPileCap(BASE);
    const text = pileCapSolution(BASE, r)
      .flatMap(st => st.lines.map(ln => ('tex' in ln ? ln.tex : ln.text))).join('\n');
    expect(text).not.toMatch(/undefined|NaN/);
    expect(text).toContain(String(r.capBx));
    expect(text).toContain(String(r.Dc));
    expect(text).toContain(`${r.steelX.bars}–⌀${BASE.barDia}`);
    expect(text).toContain(`${r.steelY.bars}–⌀${BASE.barDia}`);
  });

  it('calls out uplift when a pile goes into tension', () => {
    // Big overturning moment on a 2-pile cap ⇒ one reaction negative.
    const inp = { ...BASE, nPiles: 2 as const, serviceMomX: 0, serviceMomY: 2000 };
    const r = designPileCap(inp);
    expect(Math.min(...r.reactions)).toBeLessThan(0);
    const step = pileCapSolution(inp, r).find(st => st.title === 'Service pile reactions')!;
    expect(JSON.stringify(step.lines)).toMatch(/uplift/i);
  });
});
