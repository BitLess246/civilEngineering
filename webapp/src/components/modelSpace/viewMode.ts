// ─────────────────────────────────────────────────────────────────────────
// HOW THE VIEWPORT DRAWS ITS SOLIDS — solid, ghosted, or wireframe.
//
// Three questions, all of them decided here rather than inline in the page, so
// they can be tested without a renderer and so the answer cannot differ between
// the members, the slabs and the footings:
//
//   1. WHICH MODE the viewport is in. The user picks one, but showing a force
//      diagram overrides it: an N or Mz ribbon is drawn ALONG the member axis
//      and is inside the member's own concrete for most of its length, so a
//      solid model hides the thing that was just switched on. Wireframe is not
//      a preference there, it is what makes the diagram visible.
//   2. WHETHER THE CONCRETE IS GHOSTED. Not "is the checkbox on" — see
//      `ghostConcrete`.
//   3. WHAT MATERIAL PROPS that adds up to, including the `key` that makes a
//      change of style actually take effect (the note on `surfaceKey`).
//
// Pure. No three.js, no React — the page holds the state, this decides what it
// means.
// ─────────────────────────────────────────────────────────────────────────

/** What the user picked in the Display tab. */
export type ViewMode = 'solid' | 'wireframe'

/** How one surface is drawn once everything is taken into account. */
export type SurfaceStyle = 'solid' | 'ghost' | 'wire'

/** How much of the concrete is left once the cage inside it has to be read. */
export const GHOST_OPACITY = 0.18

/**
 * How much of the surface is left in wireframe, where the EDGES carry the
 * shape.
 *
 * Not zero, and that is deliberate: the face is still what a click picks a
 * member by, and an `opacity: 0` face is picked exactly as well as a visible
 * one but gives the eye nothing at all to judge which side of a column it is
 * looking at. This is a hint of a face, not a face.
 */
export const WIRE_OPACITY = 0.06

/**
 * The mode the viewport actually draws in.
 *
 * A force diagram forces wireframe: the ribbon is drawn along the member axis,
 * so in solid mode most of it is inside the concrete it describes. The user's
 * own choice is not overwritten — it comes back the moment the diagram is
 * switched off — which is why this is derived rather than assigned into state.
 */
export function effectiveViewMode(chosen: ViewMode, forceDiagram: boolean): ViewMode {
  return forceDiagram ? 'wireframe' : chosen
}

/**
 * Is the concrete see-through because there is a cage inside it to read?
 *
 * NOT simply "is the Show reinforcement cages checkbox on". The checkbox stays
 * on across an edit that invalidates the design — `save()` clears the analysis
 * and the design, which is correct invalidation — and across switching every
 * cage kind off. Both leave the bars gone, and the old condition left the whole
 * structure ghosted with nothing behind it: a model that had gone transparent
 * for no visible reason, which is how it was reported.
 *
 * So the question the ghosting answers is the honest one: is anything actually
 * being drawn inside? `drawn` is the count of cages that survive the kind
 * filter, not the count placed.
 */
export function ghostConcrete(showRebar: boolean, drawn: number): boolean {
  return showRebar && drawn > 0
}

/**
 * The style one structural solid is drawn in.
 *
 * Wireframe wins over ghosting: they are both ways of seeing THROUGH the
 * concrete, and edges plus an 18% face is neither one thing nor the other. In
 * wireframe the cage is already fully visible, so the ghosting has nothing left
 * to do.
 */
export function surfaceStyleFor(mode: ViewMode, ghosted: boolean): SurfaceStyle {
  if (mode === 'wireframe') return 'wire'
  return ghosted ? 'ghost' : 'solid'
}

/**
 * Material IDENTITY. Changing it forces React to build a fresh material, and
 * without that the style change silently does nothing.
 *
 * three.js does NOT apply a `transparent` false → true change to a material
 * that already exists. Mounting a material with `transparent: true` works;
 * flipping the flag on a live one does not — the mesh keeps rendering fully
 * opaque, however correct `opacity` looks in the React tree. So the ghost
 * toggle LOOKED wired (the prop reached the material, the props diffed, React
 * re-rendered) and did nothing at all on screen, which is exactly how it was
 * reported: "the concrete is still the same as when it's unchecked".
 *
 * Verified in a headless WebGL context, four bars side by side: mounted solid,
 * mounted ghost, flipped without a key, flipped with one. Only the last two
 * differ, and only the keyed one goes translucent.
 *
 * The fix is `key`: React tears the old material down and builds a new one, so
 * it is CONSTRUCTED transparent rather than mutated into it. It must be passed
 * as an actual `key`, never spread in (React 19 treats a spread `key` as an
 * ordinary prop and warns), which is why the key and the rest of the props are
 * handed back separately.
 */
export function surfaceKey(style: SurfaceStyle): SurfaceStyle {
  return style
}

/** The rest of the material's transparency props.
 *  `depthWrite` off in both see-through styles, so what is BEHIND the surface
 *  — bars, force ribbons, the far side of the frame — still draws. */
export function surfaceMaterial(style: SurfaceStyle): {
  transparent: boolean; opacity: number; depthWrite: boolean
} {
  if (style === 'solid') return { transparent: false, opacity: 1, depthWrite: true }
  return {
    transparent: true,
    opacity: style === 'ghost' ? GHOST_OPACITY : WIRE_OPACITY,
    depthWrite: false,
  }
}
