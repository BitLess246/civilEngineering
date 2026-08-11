import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

/**
 * Zoom-to-extents: on mount (and whenever the model bounds or the viewport
 * change) frame the whole model so every member is visible. Keeps a fixed
 * viewing direction and recentres the default OrbitControls. Render inside a
 * <Canvas>.
 *
 * The fit projects the box's eight corners onto the CAMERA BASIS and honours
 * the viewport aspect, rather than fitting a sphere of the box's diagonal.
 * The sphere version was badly wrong for anything long and thin — which is
 * most of what this app draws. A 6 m beam 0.3 m deep has a half-diagonal of
 * 3.4 m against a half-height of 0.95 m, so the camera was pulled back ~3.5×
 * further than needed and the member rendered at a fifth of the frame.
 */
export function FitView({ box, dir = [1, 0.8, 1], margin = 1.3 }: {
  box: { min: [number, number, number]; max: [number, number, number] } | null
  dir?: [number, number, number]
  margin?: number
}) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const minKey = box ? box.min.join(',') : ''
  const maxKey = box ? box.max.join(',') : ''

  useEffect(() => {
    if (!box || size.width === 0 || size.height === 0) return
    const min = new THREE.Vector3(...box.min), max = new THREE.Vector3(...box.max)
    const center = min.clone().add(max).multiplyScalar(0.5)
    const persp = camera as THREE.PerspectiveCamera

    // Camera basis. `forward` points from the model TOWARDS the camera, so a
    // corner with a positive `forward` component is nearer and needs the
    // camera pushed back by that much on top of its own framing distance.
    const forward = new THREE.Vector3(...dir).normalize()
    const worldUp = Math.abs(forward.y) > 0.999 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)
    const right = new THREE.Vector3().crossVectors(worldUp, forward).normalize()
    const up = new THREE.Vector3().crossVectors(forward, right).normalize()

    const vFov = ((persp.fov ?? 45) * Math.PI) / 180
    const tanV = Math.tan(vFov / 2)
    const tanH = tanV * (size.width / size.height)

    let dist = 0
    for (const cx of [min.x, max.x]) {
      for (const cy of [min.y, max.y]) {
        for (const cz of [min.z, max.z]) {
          const p = new THREE.Vector3(cx, cy, cz).sub(center)
          const f = p.dot(forward)
          dist = Math.max(dist, f + Math.abs(p.dot(right)) / tanH, f + Math.abs(p.dot(up)) / tanV)
        }
      }
    }
    dist = Math.max(dist * margin, 0.5)

    persp.position.copy(center.clone().add(forward.clone().multiplyScalar(dist)))
    // The three.js camera is an external mutable object owned by the r3f
    // renderer, not React state — repositioning it imperatively is the whole
    // point of this component, and there is no declarative equivalent.
    // eslint-disable-next-line react-hooks/immutability
    persp.near = Math.max(dist / 100, 0.01)
    persp.far = dist * 10
    persp.updateProjectionMatrix()
    if (controls) { controls.target.copy(center); controls.update() }
    else persp.lookAt(center)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minKey, maxKey, controls, camera, size.width, size.height])

  return null
}
