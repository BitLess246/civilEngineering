import { describe, it, expect } from 'vitest';
import { netBearing, requiredArea, squareSize } from './bearing';

describe('netBearing', () => {
  it('subtracts soil + concrete + surcharge from the gross allowable', () => {
    // Ds = 1.4 - 0.25 = 1.15; 150 - 19.1*1.15 - 23.64*0.25 = 122.125
    const q = netBearing({ qAllow: 150, gammaSoil: 19.1, gammaConc: 23.64, H: 1.4, Dc: 0.25 });
    expect(q).toBeCloseTo(122.125, 3);
  });
});

describe('requiredArea / squareSize', () => {
  it('A = P / q_net', () => {
    expect(requiredArea(1000, 200)).toBeCloseTo(5, 6);
  });
  it('squareSize rounds up to the step', () => {
    expect(squareSize(5)).toBeCloseTo(Math.sqrt(5), 6);       // 2.2360…
    expect(squareSize(5, 0.05)).toBeCloseTo(2.25, 6);          // ceil to 50 mm
  });
});
