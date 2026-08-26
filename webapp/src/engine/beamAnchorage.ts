// ─────────────────────────────────────────────────────────────────────────
// WHICH WAY A BEAM BAR TURNS WHERE IT STOPS
//
// A bar terminated in a joint is developed with a standard hook: it runs to
// the far face of the confined core (§418.8.4.1), turns 90°, and extends
// ℓext = 12·db (Table 425.3.1). WHICH WAY it turns is a detailing decision,
// and the cage used to make it by rule — top down, bottom up — which is only
// the usual answer, not the right one.
//
// Two things go wrong with the rule.
//
// It anchors into concrete that may not be there. A tail turned UP out of the
// top of a joint needs a column carrying on above it to be embedded in. At a
// roof joint there is none, so the bar was drawn hooking into air.
//
// And it sends both bars at an end to the same place. Top and bottom hooks
// given the same embedment stand their legs on the same line, and their tails
// run at each other: on a beam whose depth is less than 2·ℓext plus the bar
// spacing, they meet. Staggering the two embedments by a diameter puts the
// legs in different lines and they pass instead.
//
// So the direction is CHOSEN here — the preferred way if the concrete is
// there and nothing is in it, the other way if not, sideways into a
// transverse beam if neither vertical is available — and every tail is
// checked against every other before it is drawn.
//
// Pure geometry. Distances in m, bar diameters in mm; `u` runs along the beam
// from the support centreline, positive INTO the support.
// ─────────────────────────────────────────────────────────────────────────

/** Where a hooked tail runs. */
export type AnchorDir = 'down' | 'up' | 'side'

export interface AnchorBar {
  role: 'top' | 'bottom'
  /** Bar centreline height, m. */
  y: number
  /** Offset across the beam from its axis, m. */
  v: number
  /** Bar Ø, mm. */
  dia: number
  /** Straight extension beyond the bend, m — ℓext = 12·db. */
  tail: number
}

export interface JointRoom {
  /** A column carries on ABOVE the joint, so a tail may leave the beam's top. */
  above: boolean
  /** …and BELOW it, so a tail may leave the soffit. */
  below: boolean
  /** A transverse beam to turn into, and which way across this one. */
  side?: 1 | -1
  /**
   * How high and how low a tail may reach and still be INSIDE this beam, m —
   * the cover line, not the surface. A tail that ends flush with the top face
   * has no cover over it, so the limit is what the concrete actually protects.
   * Beyond either, the tail is relying on the column and only exists if the
   * column does.
   */
  yTop: number
  yBot: number
  /** Deepest leg position, m from the support centreline: the far face of the
   *  confined core, where §418.8.4.1 wants the bar developed. */
  face: number
}

export interface Anchor {
  dir: AnchorDir
  /** Leg position, m from the support centreline, into the support. */
  u: number
  /** Why this is not the preferred detail, where it is not. */
  note?: string
}

/** Clear lane two bars need between their centrelines to pass, m. */
const lane = (a: number, b: number) => (a + b) / 2000

interface Placed extends Anchor {
  bar: AnchorBar
  /** The tail's vertical extent, m — equal values where it runs sideways. */
  lo: number
  hi: number
  /** How far across the beam the tail ends up, m. */
  vEnd: number
}

/** Vertical span a tail covers, m. */
function extent(bar: AnchorBar, dir: AnchorDir): [number, number] {
  if (dir === 'down') return [bar.y - bar.tail, bar.y]
  if (dir === 'up') return [bar.y, bar.y + bar.tail]
  return [bar.y, bar.y]
}

/**
 * Is there concrete for this tail?
 *
 * A tail that stays inside the beam's own depth always has some. One that
 * leaves the top or the soffit is relying on the column, and only exists if
 * the column does — which at a roof joint, above, it does not.
 */
export function hasRoom(bar: AnchorBar, dir: AnchorDir, room: JointRoom): boolean {
  if (dir === 'side') return room.side !== undefined
  const [lo, hi] = extent(bar, dir)
  if (dir === 'up') return hi <= room.yTop + 1e-9 || room.above
  return lo >= room.yBot - 1e-9 || room.below
}

/**
 * Do two placed bars occupy the same steel?
 *
 * A bar in a joint is two things: the STRAIGHT running in from the span as far
 * as its leg, and the TAIL turned off the end of it. Either can foul either.
 * Checking only tail against tail missed the case that actually binds — a tail
 * turned across the level another bar runs at — and checking the straight as if
 * it ran the full depth of the joint missed the fix, which is that a bar
 * stopped a diameter short is no longer there for the other one to hit.
 */
function clashes(a: Placed, b: Placed): boolean {
  const gap = lane(a.bar.dia, b.bar.dia) - 1e-9
  // tail against tail: same lane across, same line along, overlapping heights
  if (Math.abs(a.vEnd - b.vEnd) < gap && Math.abs(a.u - b.u) < gap
      && a.lo < b.hi - 1e-9 && b.lo < a.hi - 1e-9) return true
  return tailCrossesStraight(a, b, gap) || tailCrossesStraight(b, a, gap)
}

/** `t`'s tail turned across the level `s`'s straight runs at. */
function tailCrossesStraight(t: Placed, s: Placed, gap: number): boolean {
  if (Math.abs(t.vEnd - s.bar.v) >= gap) return false
  // `s` stops at its own leg, so it is only in the way if it reaches this far.
  if (s.u < t.u - gap) return false
  return s.bar.y > t.lo + 1e-9 && s.bar.y < t.hi - 1e-9
}

function place(bar: AnchorBar, dir: AnchorDir, u: number, room: JointRoom): Placed {
  const [lo, hi] = extent(bar, dir)
  return {
    bar, dir, u, lo, hi,
    vEnd: dir === 'side' ? bar.v + (room.side ?? 1) * bar.tail : bar.v,
  }
}

/**
 * Where every bar stopping at one end of a beam turns, and which way.
 *
 * Bars are settled in the order given, each against those already placed, so
 * the first bar keeps the preferred detail and later ones move. Feed the more
 * heavily stressed face first — at a support that is the top steel.
 */
export function endAnchors(bars: AnchorBar[], room: JointRoom): Anchor[] {
  const done: Placed[] = []
  const out: Anchor[] = []

  for (const bar of bars) {
    // Turn INTO the core first — a top bar down, a bottom bar up — then the
    // other way, then out sideways into a transverse beam.
    const wanted: AnchorDir[] = bar.role === 'top'
      ? ['down', 'up', 'side']
      : ['up', 'down', 'side']
    const legal = wanted.filter((d) => hasRoom(bar, d, room))
    if (!legal.length) {
      // Nothing to anchor into at all. Say so rather than drawing a hook that
      // ends in air; the caller decides what to do about it.
      out.push({ dir: wanted[0], u: room.face, note: `${bar.role} bar at this end has no concrete to hook into` })
      continue
    }

    // ── the stagger ────────────────────────────────────────────────────────
    // Two legs in one line, however they turn, is the detail that binds on
    // site. The first bar in a lane holds the far face; anything after it in
    // the same lane steps back a diameter, which is the difference in
    // embedment that lets the two tails pass.
    const inLane = done.filter((d) => Math.abs(d.bar.v - bar.v) < lane(d.bar.dia, bar.dia))
    const step = inLane.length
      ? Math.min(...inLane.map((d) => d.u - lane(d.bar.dia, bar.dia)))
      : room.face

    // A lane that already holds a leg gets the stepped position and only that:
    // the stagger is the detail, not a repair, so it does not wait for a clash
    // to be found before it is applied.
    const spots = inLane.length ? [step] : [room.face]

    let chosen: Placed | null = null
    let note: string | undefined
    for (const dir of legal) {
      for (const u of spots) {
        const p = place(bar, dir, u, room)
        if (done.some((d) => clashes(d, p))) continue
        chosen = p
        if (dir !== wanted[0]) {
          note = `${bar.role} bar turned ${dir}: ${wanted[0]} is `
            + (hasRoom(bar, wanted[0], room) ? 'blocked by another bar' : 'not supported by concrete') + ' here'
        }
        break
      }
      if (chosen) break
    }
    // Nothing clear: keep the first legal detail, stepped back, and report it.
    if (!chosen) {
      chosen = place(bar, legal[0], spots[0], room)
      note = 'no clear line for this hook — check the joint by hand'
    }
    done.push(chosen)
    out.push({ dir: chosen.dir, u: chosen.u, ...(note ? { note } : {}) })
  }
  return out
}
