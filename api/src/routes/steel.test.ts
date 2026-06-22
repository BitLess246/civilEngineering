import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../app'

describe('POST /api/steel/beam', () => {
  const body = { shapeName: 'W310x38.7', Fy: 345, span: 6, Lb: 2, Cb: 1, wDead: 15, wLive: 25 }

  it('returns the full design result set for a valid request', async () => {
    const res = await request(app).post('/api/steel/beam').send(body)
    expect(res.status).toBe(200)
    expect(res.body.props.Ix).toBeGreaterThan(0)
    expect(res.body.flex.phiMn).toBeGreaterThan(0)
    expect(res.body.shear.phiVn).toBeGreaterThan(0)
    expect(res.body.loads.Mu).toBeGreaterThan(0)
    // Server result must equal the client engine for the same inputs (no drift).
    expect(res.body.loads.wu).toBeCloseTo(Math.max(1.4 * 15, 1.2 * 15 + 1.6 * 25), 6)
  })

  it('rejects an unknown shape with 400', async () => {
    const res = await request(app).post('/api/steel/beam').send({ ...body, shapeName: 'W999x999' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Unknown shape/)
  })

  it('rejects non-numeric inputs with 400', async () => {
    const res = await request(app).post('/api/steel/beam').send({ ...body, span: 'six' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/steel/column', () => {
  const body = { shapeName: 'W250x67', Fy: 345, L: 4, Kx: 1, Ky: 1, Pu: 500, Mux: 80, Muy: 0 }

  it('returns axial + flexure + combined results for a valid request', async () => {
    const res = await request(app).post('/api/steel/column').send(body)
    expect(res.status).toBe(200)
    expect(res.body.axial.phiPn).toBeGreaterThan(0)
    expect(res.body.axial.slenderness).toBeGreaterThan(0)
    expect(res.body.flexX.phiMn).toBeGreaterThan(0)
    expect(res.body.weak.phiMny).toBeGreaterThan(0)
    expect(res.body.comb.ratio).toBeGreaterThan(0)
  })

  it('rejects missing Pu/Mux with 400', async () => {
    const res = await request(app).post('/api/steel/column')
      .send({ shapeName: 'W250x67', Fy: 345, L: 4, Kx: 1, Ky: 1 })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/steel/connection', () => {
  const body = {
    Vu: 200, Hu: 0,
    boltGrade: 'A325M', db: 19, nRows: 3, nCols: 1,
    sy: 75, sx: 75, ey: 38, ex_edge: 38,
    threads: true,
    tPlate: 10, FuPlate: 400, FyPlate: 248,
    ex_load: 0, ey_load: 0, e_out: 0, b_gage: 0,
    electrode: 'E70', wSize: 8,
  }

  it('returns bolt group + weld results for a valid request', async () => {
    const res = await request(app).post('/api/steel/connection').send(body)
    expect(res.status).toBe(200)
    expect(res.body.geom.n).toBe(3)
    expect(res.body.phiRnBolt.phiRn).toBeGreaterThan(0)
    expect(res.body.eccentric.Rmax).toBeGreaterThan(0)
    expect(res.body.weld.phiRnw).toBeGreaterThan(0)
    expect(res.body.weldCapacity).toBeGreaterThan(0)
    expect(res.body.outOfPlane).toBeNull()
    expect(res.body.prying).toBeNull()
    expect(Array.isArray(res.body.blockShear)).toBe(true)
  })

  it('rejects invalid boltGrade with 400', async () => {
    const res = await request(app).post('/api/steel/connection').send({ ...body, boltGrade: 'A307' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/boltGrade/)
  })

  it('rejects non-boolean threads with 400', async () => {
    const res = await request(app).post('/api/steel/connection').send({ ...body, threads: 'yes' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/threads/)
  })
})

describe('GET /health', () => {
  it('reports ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})
