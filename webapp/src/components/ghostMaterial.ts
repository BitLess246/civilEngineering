// ─────────────────────────────────────────────────────────────────────────
// Concrete that goes see-through while the reinforcement cages are shown.
//
// WHY THIS IS A MODULE AND NOT THREE INLINE PROPS
//
// three.js does NOT apply a `transparent` false → true change to a material
// that already exists. Mounting a material with `transparent: true` works;
// flipping the flag on a live one does not — the mesh keeps rendering fully
// opaque, however correct `opacity` looks in the React tree. So the toggle
// LOOKED wired (the prop reached the material, the props diffed, React
// re-rendered) and did nothing at all on screen, which is exactly how it was
// reported: "the concrete is still the same as when it's unchecked".
//
// Verified in a headless WebGL context, four bars side by side: mounted solid,
// mounted ghost, flipped without a key, flipped with one. Only the last two
// differ, and only the keyed one goes translucent.
//
// The fix is `key`: React tears the old material down and builds a new one, so
// it is CONSTRUCTED transparent rather than mutated into it. Hence `ghostKey`
// — it must be passed as an actual `key`, never spread in (React 19 treats a
// spread `key` as an ordinary prop and warns), which is why the key and the
// rest of the props are handed back separately.
// ─────────────────────────────────────────────────────────────────────────

/** How much of the concrete is left once the cage inside it has to be read. */
export const GHOST_OPACITY = 0.18

/** Material identity. Changing it forces React to build a fresh material — see
 *  the note above; without this the ghosting silently does nothing. */
export function ghostKey(ghost: boolean): 'ghost' | 'solid' {
  return ghost ? 'ghost' : 'solid'
}

/** The rest of the material's transparency props.
 *  `depthWrite` off so bars BEHIND the concrete still draw. */
export function ghostMaterial(ghost: boolean): {
  transparent: boolean; opacity: number; depthWrite: boolean
} {
  return { transparent: ghost, opacity: ghost ? GHOST_OPACITY : 1, depthWrite: !ghost }
}
