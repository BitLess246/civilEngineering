import { describe, expect, it } from 'vitest'
import { barTakeoff, concreteMaterials, lateralTieTakeoff, tieWire, estimateColumn } from '../engine/quantities'
import { barStep, concreteStep, tieStep, tieWireStep } from './estimateSolution'
import { lineText } from './solution'

const text = (s: { lines: Parameters<typeof lineText>[0][] }) => s.lines.map(lineText).join('\n')

describe('estimate worked steps restate the engine’s numbers', () => {
  it('concrete: 0.4 × 0.4 × 3 × 4 = 1.92 m³, class A → ⌈17.28⌉ = 18 bags', () => {
    const m = concreteMaterials(1.92, 'A')
    const t = text(concreteStep('0.4 \\times 0.4 \\times 3 \\times 4', m, 'A'))
    expect(m.cement).toBe(18)
    expect(t).toContain('1.920')
    expect(t).toContain('= 18')
    expect(t).toContain('0.960')   // sand 0.5 V
  })

  it('main bars: 8 × 3.5 × 4 = 112 m over 5.7 m usable → 20 bars of ⌀16', () => {
    const b = barTakeoff(112, 16, 0.3)
    expect(b.pieces).toBe(20)
    // 20 × 6 × π/4 × 0.016² × 7850 = 189.4 kg
    expect(b.weight).toBeCloseTo(20 * 6 * Math.PI / 4 * 0.016 ** 2 * 7850, 6)
    const t = text(barStep('Vertical bars', '3.5 \\times 8 \\times 4', b, 0.3))
    expect(t).toContain('5.70')
    expect(t).toContain('= 20')
    expect(t).toContain(b.weight.toFixed(2))
  })

  it('ties: ⌊6/1.4⌋ = 4 per bar, 16 × 4 = 64 cuts → 16 bars', () => {
    const tt = lateralTieTakeoff(1.4, 16, 10, 4)
    expect(tt.cutsPer6m).toBe(4)
    expect(tt.pieces).toBe(16)
    const t = text(tieStep('Lateral ties', 1.4, 16, 4, tt))
    expect(t).toContain('= 4')
    expect(t).toContain('= 64')
    expect(t).toContain('= 16')
  })

  it('a tie longer than the stock bar is called out, not silently zero', () => {
    const tt = lateralTieTakeoff(6.5, 10, 10, 1)
    expect(tieStep('Ties', 6.5, 10, 1, tt).note).toMatch(/does not fit/)
  })

  it('tie wire: 0.3 × 128 × 4 = 153.6 m → 1 roll; matches estimateColumn', () => {
    const w = tieWire(0.3, 8 * 16, 4)
    const t = text(tieWireStep('8 \\times 16', 0.3, 4, w))
    expect(t).toContain('153.60')
    expect(t).toContain('= 1')
    const col = estimateColumn({
      length: 0.4, width: 0.4, height: 3, numStructures: 4, concreteClass: 'A', spliceLength: 0.3,
      barLengthPerPiece: 3.5, numBars: 8, barDiaMm: 16, tieLengthPerSet: 1.4, numTieSets: 16, tieDiaMm: 10, lengthPerCut: 0.3,
    })
    expect(col.tieWire).toEqual(w)
  })
})
