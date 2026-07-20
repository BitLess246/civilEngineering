import { describe, it, expect } from 'vitest'
import {
  slugId, upsertMaterial, deleteMaterial, materialsToCsv, csvToMaterials, CSV_HEADER,
  type CustomMaterial,
} from './materialLibrary'

const apitong: CustomMaterial = {
  id: 'custom-apitong', name: 'Apitong (80% grade)', kind: 'sawn', note: 'FPRDI, air-dry',
  ref: { Fb: 24.5, Ft: 14.0, Fv: 2.49, FcPerp: 6.15, Fc: 15.8, E: 13800, Emin: 5000, G: 0.72 },
}

describe('slugId', () => {
  it('slugifies the name and avoids collisions', () => {
    expect(slugId('Apitong (80% grade)', [])).toBe('custom-apitong-80-grade')
    expect(slugId('Yakal', ['custom-yakal'])).toBe('custom-yakal-2')
  })
})

describe('upsert / delete', () => {
  it('adds, replaces by id, and removes', () => {
    let list = upsertMaterial([], apitong)
    expect(list).toHaveLength(1)
    list = upsertMaterial(list, { ...apitong, name: 'Apitong v2' })
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Apitong v2')
    expect(deleteMaterial(list, apitong.id)).toHaveLength(0)
  })
})

describe('CSV round-trip', () => {
  it('exports a header + row and re-imports identical engineering values', () => {
    const csv = materialsToCsv([apitong])
    expect(csv.split('\n')[0]).toBe(CSV_HEADER.join(','))
    const { materials, errors } = csvToMaterials(csv)
    expect(errors).toEqual([])
    expect(materials).toHaveLength(1)
    expect(materials[0].name).toBe(apitong.name)
    expect(materials[0].kind).toBe('sawn')
    expect(materials[0].ref).toEqual(apitong.ref)
    expect(materials[0].note).toBe('FPRDI, air-dry')
  })
  it('quotes names containing commas and restores them', () => {
    const m = { ...apitong, name: 'Yakal, Guijo blend' }
    const back = csvToMaterials(materialsToCsv([m])).materials[0]
    expect(back.name).toBe('Yakal, Guijo blend')
  })
})

describe('CSV import validation', () => {
  it('rejects a row with bad engineering values but keeps good ones', () => {
    const csv = [
      CSV_HEADER.join(','),
      'Good,sawn,24,16,2.5,6,16,16000,5500,0.8,ok',
      'Bad,sawn,-5,16,2.5,6,16,16000,5500,0.8,negative Fb',   // Fb < 0
      'BadEmin,sawn,24,16,2.5,6,16,16000,16000,0.8,Emin>=E',  // Emin ≥ E
    ].join('\n')
    const { materials, errors } = csvToMaterials(csv)
    expect(materials).toHaveLength(1)
    expect(materials[0].name).toBe('Good')
    expect(errors).toHaveLength(2)
  })
  it('errors on a header missing required columns', () => {
    const { materials, errors } = csvToMaterials('name,kind\nX,sawn')
    expect(materials).toHaveLength(0)
    expect(errors[0]).toMatch(/header must include/)
  })
})
