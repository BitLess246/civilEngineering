// ─────────────────────────────────────────────────────────────────────────
// The ONE way to draw text inside a react-three-fiber <Canvas>.
//
// WHY THIS EXISTS. drei's <Text> is backed by troika-three-text, whose font
// resolver defaults to fetching its data from
// `https://cdn.jsdelivr.net/gh/lojjic/unicode-font-resolver@v1.0.1/...`.
// drei then does `suspend(() => new Promise(res => preloadFont(..., res)))`,
// and troika only invokes that callback on SUCCESS — a failed fetch leaves the
// promise permanently unsettled, so the component suspends FOREVER. On a
// network that cannot reach jsdelivr (offline, corporate proxy, blocked CDN)
// the nearest <Suspense> therefore shows its fallback for good: the viewport
// went blank and never recovered.
//
// TWO INDEPENDENT DEFENCES, because either alone still leaves a hole:
//
//  1. A bundled font. When every code point in the string is covered by a font
//     the caller supplied, troika's resolver short-circuits (`fallbackRanges`
//     stays empty) and makes NO network request at all. So the normal path
//     never touches the CDN.
//  2. A <Suspense> boundary around each individual label. If a string ever does
//     contain a character outside the subset, that ONE label is what goes
//     missing — not the model, the grid and every other label with it.
// ─────────────────────────────────────────────────────────────────────────

import { Suspense, type ComponentProps } from 'react'
import { Text } from '@react-three/drei'
import { SCENE_FONT } from './sceneFont'

type TextProps = ComponentProps<typeof Text>

/**
 * Drop-in replacement for drei's <Text>. The `font` is fixed deliberately and
 * applied after the spread: a caller reaching for a different one would be
 * reaching for the CDN.
 */
export function SceneText({ children, ...props }: TextProps) {
  return (
    <Suspense fallback={null}>
      <Text {...props} font={SCENE_FONT}>{children}</Text>
    </Suspense>
  )
}
