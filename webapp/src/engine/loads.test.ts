import { describe, it, expect } from 'vitest';
import { factoredLoad, beta1 } from './loads';

describe('factoredLoad', () => {
  it('uses 1.2D + 1.6L when live governs', () => {
    // 1.2*150 + 1.6*100 = 340  vs  1.4*150 = 210
    expect(factoredLoad({ dead: 150, live: 100 })).toBeCloseTo(340, 6);
  });
  it('uses 1.4D when dead governs', () => {
    expect(factoredLoad({ dead: 100, live: 0 })).toBeCloseTo(140, 6);
  });
});

describe('beta1', () => {
  it('is 0.85 up to 28 MPa', () => {
    expect(beta1(21)).toBe(0.85);
    expect(beta1(28)).toBe(0.85);
  });
  it('reduces above 28 MPa and floors at 0.65', () => {
    expect(beta1(35)).toBeCloseTo(0.8, 6);
    expect(beta1(70)).toBe(0.65);
  });
});
