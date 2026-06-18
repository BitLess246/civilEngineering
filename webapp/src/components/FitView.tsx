import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

/**
 * Zoom-to-extents: on mount (and whenever the model bounds change) frame the
 * whole model so every member is visible. Keeps a fixed viewing direction and
 * recentres the default OrbitControls on the model. Render inside a <Canvas>.
 */
export function FitView({ box, dir = [1, 0.8, 1], margin = 1.3 }: {
  box: { min: [number, number, number]; max: [number, number, number] } | null
  dir?: [number, number, number]
  margin?: number
}) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const minKey = box ? box.min.join(',') : ''
  const maxKey = box ? box.max.join(',') : ''

  useEffect(() => {
    if (!box) return
    const min = new THREE.Vector3(...box.min), max = new THREE.Vector3(...box.max)
    const center = min.clone().add(max).multiplyScalar(0.5)
    const radius = Math.max(max.clone().sub(min).length() / 2, 0.5)
    const persp = camera as THREE.PerspectiveCamera
    const fov = ((persp.fov ?? 45) * Math.PI) / 180
    const dist = (radius / Math.sin(fov / 2)) * margin
    const d = new THREE.Vector3(...dir).normalize()
    persp.position.copy(center.clone().add(d.multiplyScalar(dist)))
    persp.near = Math.max(dist / 100, 0.01)
    persp.far = dist * 10
    persp.updateProjectionMatrix()
    if (controls) { controls.target.copy(center); controls.update() }
    else persp.lookAt(center)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minKey, maxKey, controls, camera])

  return null
}
