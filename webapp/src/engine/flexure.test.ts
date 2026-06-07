import { describe, it, expect } from 'vitest';
import { rhoMin, flexuralSteel, barLayout } from './flexure';

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
    expect(layout.spacing).toBeCloseTo((1500 - 150 - layout.n * 20) / (layout.n - 1), 3);
  });
});
