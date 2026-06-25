import { describe, it, expect } from 'vitest'
import { parseAccelerogram } from './accelerogram'

describe('parseAccelerogram', () => {
  describe('two-column CSV (time, ag)', () => {
    const csv = `# Elcentro
time(s), ag(g)
0.000, 0.0100
0.020, 0.0200
0.040, -0.0150
0.060, 0.0300
`
    it('parses values and derives dt from the time axis', () => {
      const r = parseAccelerogram(csv, { units: 'g' })!
      expect(r).not.toBeNull()
      expect(r.dt).toBeCloseTo(0.02, 9)
      expect(r.twoColumn).toBe(true)
      expect(r.npts).toBe(4)
    })

    it('scales g → m/s² when units is g', () => {
      const r = parseAccelerogram(csv, { units: 'g' })!
      expect(r.ag[0]).toBeCloseTo(0.0100 * 9.81, 6)
      expect(r.ag[2]).toBeCloseTo(-0.0150 * 9.81, 6)
    })

    it('leaves values unchanged when units is ms2', () => {
      const r = parseAccelerogram(csv, { units: 'ms2' })!
      // first row second column is 0.0100, no g scaling
      expect(r.ag[0]).toBeCloseTo(0.0100, 9)
    })

    it('reports correct PGA', () => {
      const r = parseAccelerogram(csv, { units: 'g' })!
      expect(r.pga).toBeCloseTo(0.03 * 9.81, 6)
    })

    it('skips comment lines and header rows', () => {
      const r = parseAccelerogram(csv, { units: 'g' })!
      expect(r.npts).toBe(4)
    })
  })

  describe('one-column CSV (dt from opts)', () => {
    const csv = `0.0100
0.0200
-0.0150
0.0300`

    it('parses with dt from opts', () => {
      const r = parseAccelerogram(csv, { dt: 0.02, units: 'ms2' })!
      expect(r).not.toBeNull()
      expect(r.dt).toBeCloseTo(0.02, 9)
      expect(r.npts).toBe(4)
      expect(r.twoColumn).toBe(false)
    })

    it('returns null without a dt source', () => {
      expect(parseAccelerogram(csv)).toBeNull()
    })

    it('applies g scaling for one-column', () => {
      const r = parseAccelerogram(csv, { dt: 0.02, units: 'g' })!
      expect(r.ag[0]).toBeCloseTo(0.0100 * 9.81, 6)
    })
  })

  describe('PEER AT2 multi-value format', () => {
    // Typical PEER NGA AT2 layout: 4-line header + rows of 5 values
    const csv = `PACIFIC EARTHQUAKE ENGINEERING RESEARCH CENTER
RECORD: ELCENTRO_N  H1  1940-05-18
NPTS=  10, DT= 0.0200 SEC, G
   0.001234   0.005678  -0.002345   0.008901  -0.004567
   0.003456  -0.001234   0.007890   0.002345  -0.006789
`
    it('picks up DT from the header line', () => {
      const r = parseAccelerogram(csv, { units: 'g' })!
      expect(r).not.toBeNull()
      expect(r.dt).toBeCloseTo(0.02, 9)
    })

    it('collects all values across rows', () => {
      const r = parseAccelerogram(csv, { units: 'g' })!
      expect(r.npts).toBe(10)
    })

    it('opts.dt overrides DT header when provided', () => {
      const r = parseAccelerogram(csv, { dt: 0.01, units: 'g' })!
      expect(r.dt).toBeCloseTo(0.01, 9)
    })
  })

  describe('comment and empty line handling', () => {
    it('skips # comments', () => {
      const r = parseAccelerogram('# comment\n0.1\n0.2\n0.3', { dt: 0.02 })!
      expect(r.npts).toBe(3)
    })

    it('skips % comments (MATLAB style)', () => {
      const r = parseAccelerogram('% comment\n0.1\n0.2', { dt: 0.02 })!
      expect(r.npts).toBe(2)
    })

    it('skips ! comments', () => {
      const r = parseAccelerogram('! header\n0.1\n0.2', { dt: 0.02 })!
      expect(r.npts).toBe(2)
    })

    it('ignores blank lines', () => {
      const r = parseAccelerogram('\n0.1\n\n0.2\n\n', { dt: 0.02 })!
      expect(r.npts).toBe(2)
    })
  })

  describe('guards', () => {
    it('returns null for empty string', () => {
      expect(parseAccelerogram('')).toBeNull()
    })

    it('returns null for all-comment file', () => {
      expect(parseAccelerogram('# just a comment\n% another')).toBeNull()
    })

    it('pga is always non-negative', () => {
      const r = parseAccelerogram('-0.5\n-1.2\n0.3', { dt: 0.01 })!
      expect(r.pga).toBeCloseTo(1.2, 9)
      expect(r.pga).toBeGreaterThanOrEqual(0)
    })
  })
})
