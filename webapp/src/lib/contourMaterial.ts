// ─────────────────────────────────────────────────────────────────────────
// THE CONTOUR MATERIAL — one scalar per vertex, one colour per FRAGMENT.
//
// Both stress contours used to ship a per-vertex COLOUR and let
// `vertexColors` blend it. That is wrong twice over, and the second one is not
// a matter of taste:
//
// 1. NO ISO-BOUNDARIES. A continuously blended field has nothing to read. The
//    boundary between two bands IS the iso-line, which is why every FEA
//    post-processor bands its stress plots; without them a reader cannot tell
//    40% of peak from 55% anywhere on the model. It reads as a smear, because
//    it is one.
//
// 2. IT INTERPOLATED THE COLOUR INSTEAD OF THE VALUE. Between a vertex at
//    −1.9 MPa (dark blue) and one at +1.9 (dark red), the GPU walks a straight
//    line through RGB space. It does NOT pass through the ramp's pale centre,
//    so the ZERO CROSSING WAS PAINTED THE WRONG COLOUR — on every member whose
//    two ends carry opposite sign, which in a frame is most of them. The
//    element in the middle looked like a moderate stress rather than like the
//    place the sign changes.
//
// The fix is the standard one: interpolate the normalised SCALAR (a varying),
// and evaluate the ramp per fragment. Banding is then just a quantisation of
// that scalar before the lookup, and it lands exactly on the true iso-level
// rather than wherever a vertex happened to be.
//
// No texture is involved anywhere. The ramp is nine uniform stops, the same
// nine `stressScale` hands the legend, so the bar and the surface cannot drift.
// ─────────────────────────────────────────────────────────────────────────
import * as THREE from 'three'
import { rampStops, DEFAULT_BANDS } from './stressScale'

const VERT = /* glsl */`
  attribute float aValue;     // normalised 0…1, already domain-mapped in JS
  varying float vValue;
  void main() {
    vValue = aValue;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// The loop bound is constant and the index is the loop counter, so this
// unrolls on GLSL ES 1.0 — dynamic indexing of a uniform array would not be
// portable, and a lookup texture would reintroduce filtering decisions the
// value interpolation exists to avoid.
const FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uStops[9];
  uniform float uBands;       // 0 = smooth
  uniform float uOpacity;
  varying float vValue;

  void main() {
    float t = clamp(vValue, 0.0, 1.0);
    if (uBands > 0.5) {
      float i = min(uBands - 1.0, floor(t * uBands));
      t = (i + 0.5) / uBands;                 // band CENTRE, matching the legend
    }
    float x = t * 8.0;
    vec3 c = uStops[8];
    for (int k = 0; k < 8; k++) {
      float a = float(k), b = float(k) + 1.0;
      if (x >= a && x <= b) c = mix(uStops[k], uStops[k + 1], x - a);
    }
    gl_FragColor = vec4(c, uOpacity);
  }
`

export interface ContourMaterialOpts {
  signed: boolean
  /** 0 = smooth. */
  bands?: number
  opacity?: number
}

/**
 * Build the material. `aValue` must be set on the geometry as a 1-component
 * float attribute holding the NORMALISED value at each vertex.
 *
 * Unlit on purpose: this is a data surface, not geometry to be lit. Shading it
 * would multiply the ramp by the lighting and the colour would stop meaning
 * the number it is keyed to.
 */
export function contourMaterial({
  signed, bands = DEFAULT_BANDS, opacity = 1,
}: ContourMaterialOpts): THREE.ShaderMaterial {
  const stops = rampStops(signed).map(([r, g, b]) => new THREE.Vector3(r / 255, g / 255, b / 255))
  return new THREE.ShaderMaterial({
    uniforms: {
      uStops: { value: stops },
      uBands: { value: Math.max(0, bands) },
      uOpacity: { value: opacity },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
    transparent: opacity < 1,
    depthWrite: opacity >= 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })
}
