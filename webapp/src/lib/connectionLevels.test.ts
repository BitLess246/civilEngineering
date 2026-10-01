import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { connectionLevels } from './connectionLevels'
import { levelDrop } from '../components/modelSpace/sceneTokens'
import { shapeByName } from '../engine/aiscSections'

describe('connectionLevels — joint hardware sits on the beam it connects', () => {
  const w = shapeByName('W310x38.7')!                       // d 310, tf 9.65
  const a = new THREE.Vector3(0, 3.5, 0), b = new THREE.Vector3(6, 3.5, 0)

  it('a level beam hangs below its node: web centre at node − d/2, flanges inside the section', () => {
    const lv = connectionLevels(3.5, w, levelDrop('beam', w.d! / 1000, a, b))
    expect(lv.yc).toBeCloseTo(3.5 - w.d! / 2000, 9)
    expect(lv.yTopFlange).toBeCloseTo(3.5 - w.tf! / 2000, 9)          // top flange flush with TOS
    expect(lv.yBotFlange).toBeCloseTo(3.5 - w.d! / 1000 + w.tf! / 2000, 9)
    // the regression: nothing may sit above top of steel
    expect(lv.yTopFlange + lv.tf / 2).toBeLessThanOrEqual(3.5 + 1e-12)
  })

  it('uses the beam\'s own section, not a depth guessed from the tab', () => {
    const lv = connectionLevels(0, w, 0)
    expect(lv.d).toBeCloseTo(w.d! / 1000, 12)
    expect(lv.bf).toBeCloseTo(w.bf! / 1000, 12)
    expect(lv.yTopFlange - lv.yBotFlange).toBeCloseTo((w.d! - w.tf!) / 1000, 12)
  })

  it('a sloping member is not dropped (levelDrop 0): centred on its node line', () => {
    const lv = connectionLevels(2, w, levelDrop('beam', w.d! / 1000, a, new THREE.Vector3(6, 4, 0)))
    expect(lv.yc).toBe(2)
  })
})
