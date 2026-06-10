import { describe, it, expect } from 'vitest';
import {
  concreteMaterials, barTakeoff, lateralTieTakeoff, tieWire,
  estimateSlab, estimateChb, estimateColumn, estimateBeam, estimateBoxCulvert,
} from './quantities';

describe('shared helpers', () => {
  it('concrete materials by mix class', () => {
    const m = concreteMaterials(10, 'A');
    expect(m.factor).toBe(9);
    expect(m.cement).toBe(90);      // ceil(10*9)
    expect(m.sand).toBeCloseTo(5);  // 10*0.5
    expect(m.gravel).toBeCloseTo(10);
  });
  it('custom cement factor falls through', () => {
    expect(concreteMaterials(10, 'custom', 8).cement).toBe(80);
  });
  it('bar take-off: 6 m bars less splice', () => {
    const b = barTakeoff(20, 12, 0.3);            // splice usable = 5.7 m
    expect(b.splice).toBeCloseTo(5.7);
    expect(b.pieces).toBe(Math.ceil(20 / 5.7));   // 4
    // 12 mm 6 m bar ≈ 5.33 kg → 4 bars ≈ 21.3 kg
    expect(b.weight).toBeGreaterThan(20);
    expect(b.weight).toBeLessThan(23);
  });
  it('lateral ties cut from 6 m bars', () => {
    const t = lateralTieTakeoff(1.5, 40, 10, 2);  // 4 cuts/6m, 80 ties → 20 bars
    expect(t.cutsPer6m).toBe(4);
    expect(t.totalCuts).toBe(80);
    expect(t.pieces).toBe(20);
  });
  it('tie wire rolls', () => {
    expect(tieWire(0.3, 100, 5).rolls).toBe(1);   // 150 m < 2385
  });
});

describe('slab estimate', () => {
  it('volume + both-span steel + total', () => {
    const r = estimateSlab({
      slabArea: 20, thickness: 0.1, numStructures: 1, concreteClass: 'A', spliceLength: 0.3,
      longSpanLength: 5, numLongPieces: 10, longDiaMm: 12,
      shortSpanLength: 4, numShortPieces: 12, shortDiaMm: 12,
      lengthPerCut: 0.3, numIntersections: 120,
    });
    expect(r.volume).toBeCloseTo(2);              // 20*0.1
    expect(r.totalSteelWeight).toBeCloseTo(r.longSteel.weight + r.shortSteel.weight);
    expect(r.longSteel.netLength).toBeCloseTo(50);
  });
});

describe('chb estimate', () => {
  it('net area, block count, mortar + plaster', () => {
    const r = estimateChb({ wallArea: 30, holeArea: 4, size: '6' });
    expect(r.netArea).toBe(26);
    expect(r.pieces).toBe(Math.ceil(26 * 12.5)); // 325
    expect(r.mortar.cement).toBe(Math.ceil(26 * 1.018));
    expect(r.totalCement).toBe(r.mortar.cement + r.plaster.cement);
  });
});

describe('column / beam / box culvert', () => {
  it('column volume + ties', () => {
    const r = estimateColumn({
      length: 0.4, width: 0.4, height: 3, numStructures: 4, concreteClass: 'A', spliceLength: 0.3,
      barLengthPerPiece: 3.5, numBars: 8, barDiaMm: 16,
      tieLengthPerSet: 1.4, numTieSets: 15, tieDiaMm: 10,
      lengthPerCut: 0.3, numIntersections: 60,
    });
    expect(r.volume).toBeCloseTo(0.4 * 0.4 * 3 * 4);
    expect(r.lateralTies.pieces).toBeGreaterThan(0);
    expect(r.mainSteel.weight).toBeGreaterThan(0);
  });
  it('beam: four bar groups sum to total', () => {
    const g = (d: number) => ({ lengthPerPiece: 6, numPieces: 2, diaMm: d });
    const r = estimateBeam({
      length: 6, width: 0.25, height: 0.5, numStructures: 1, concreteClass: 'B', spliceLength: 0.3,
      topSupport: g(16), topMidspan: g(12), bottomSupport: g(12), bottomMidspan: g(20),
      stirrupLengthPerSet: 1.2, numStirrupSets: 30, stirrupDiaMm: 10,
      lengthPerCut: 0.3, numIntersections: 120,
    });
    expect(r.mainBars).toHaveLength(4);
    expect(r.totalMainWeight).toBeCloseTo(r.mainBars.reduce((s, b) => s + b.takeoff.weight, 0));
  });
  it('box culvert RSB count = ceil(L/s)+1', () => {
    const r = estimateBoxCulvert({
      grossArea: 6, holeArea: 2, length: 5, concreteClass: 'A', spliceLength: 0.3,
      numLongTop: 6, longTopDiaMm: 16, numLongU: 6, longUDiaMm: 16,
      rsbSpacing: 0.2, topBarLength: 2.5, topBarDiaMm: 12, uBarLength: 3.5, uBarDiaMm: 12,
      lengthPerCut: 0.3,
    });
    expect(r.netArea).toBe(4);
    expect(r.volume).toBeCloseTo(20);
    expect(r.rsb.count).toBe(Math.ceil(5 / 0.2) + 1); // 26
  });
});
