import { describe, it, expect } from 'vitest';
import {
  concreteMaterials, barTakeoff, lateralTieTakeoff, tieWire,
  estimateSlab, estimateChb, estimateColumn, estimateBeam, estimateBoxCulvert,
  concreteClassForFc, CONCRETE_CLASS_FC, CONCRETE_CLASS_FACTORS,
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
      lengthPerCut: 0.3,
    });
    expect(r.volume).toBeCloseTo(2);              // 20*0.1
    expect(r.totalSteelWeight).toBeCloseTo(r.longSteel.weight + r.shortSteel.weight);
    expect(r.longSteel.netLength).toBeCloseTo(50);
    expect(r.tieWire.intersections).toBe(120);    // derived: 10 long × 12 short
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
      lengthPerCut: 0.3,
    });
    expect(r.volume).toBeCloseTo(0.4 * 0.4 * 3 * 4);
    expect(r.lateralTies.pieces).toBeGreaterThan(0);
    expect(r.mainSteel.weight).toBeGreaterThan(0);
    expect(r.tieWire.intersections).toBe(120);    // derived: 8 bars × 15 ties
  });
  it('beam: four bar groups sum to total', () => {
    const g = (d: number) => ({ lengthPerPiece: 6, numPieces: 2, diaMm: d });
    const r = estimateBeam({
      length: 6, width: 0.25, height: 0.5, numStructures: 1, concreteClass: 'B', spliceLength: 0.3,
      topSupport: g(16), topMidspan: g(12), bottomSupport: g(12), bottomMidspan: g(20),
      stirrupLengthPerSet: 1.2, numStirrupSets: 30, stirrupDiaMm: 10,
      lengthPerCut: 0.3,
    });
    expect(r.mainBars).toHaveLength(4);
    expect(r.totalMainWeight).toBeCloseTo(r.mainBars.reduce((s, b) => s + b.takeoff.weight, 0));
    // intersections = (max top 2 + max bottom 2) × 30 stirrups = 120
    expect(r.tieWire.intersections).toBe(120);
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

describe('concreteClassForFc — mix class from the design strength', () => {
  // DPWH Item 405: AA 27.58, A 20.68, B 17.24, C 13.79 MPa
  // (4000 / 3000 / 2500 / 2000 psi).
  it('picks the weakest class that still reaches f′c', () => {
    expect(concreteClassForFc(13.79).klass).toBe('C');
    expect(concreteClassForFc(17.24).klass).toBe('B');
    expect(concreteClassForFc(20.68).klass).toBe('A');
    expect(concreteClassForFc(27.58).klass).toBe('AA');
  });

  it('rounds UP to the next class, never down', () => {
    // 21 MPa is the everyday Philippine spec and sits just above Class A.
    expect(concreteClassForFc(21).klass).toBe('AA');
    expect(concreteClassForFc(17.25).klass).toBe('A');
    expect(concreteClassForFc(13.8).klass).toBe('B');
  });

  it('lands exactly on a class boundary without floating-point drift', () => {
    // 20.68 must give A, not AA — a bare >= on binary floats is the bug here.
    for (const [klass, fc] of Object.entries(CONCRETE_CLASS_FC)) {
      expect(concreteClassForFc(fc).klass).toBe(klass);
      expect(concreteClassForFc(fc).adequate).toBe(true);
    }
  });

  it('flags a design above Class AA instead of pretending', () => {
    const r = concreteClassForFc(35);
    expect(r.klass).toBe('AA');       // still totals, so the BOQ is not blank
    expect(r.adequate).toBe(false);   // but says a designed mix is required
    expect(r.classFc).toBeCloseTo(27.58, 2);
  });

  it('a weak f′c does not fall through to nothing', () => {
    expect(concreteClassForFc(10)).toEqual({ klass: 'C', classFc: 13.79, adequate: true });
  });

  it('every class the picker offers has both a strength and a cement factor', () => {
    expect(Object.keys(CONCRETE_CLASS_FC).sort()).toEqual(Object.keys(CONCRETE_CLASS_FACTORS).sort());
  });
});
