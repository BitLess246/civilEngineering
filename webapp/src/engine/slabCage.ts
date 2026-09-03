// ─────────────────────────────────────────────────────────────────────────
// THE SLAB CAGE — both mats of a two-way panel, placed in model space.
//
// The 3D cage had beams, columns and footings and no slab steel at all, so the
// one element that covers the whole floor was the one element drawn bare. This
// builds it from the panel's OWN design: `slabDDM` has already sized every
// strip, and `slabBarDetail` already carries ACI 318-14 Fig. 8.7.4.1.3 /
// NSCP Fig. 408.7.4.1.3 — the minimum extensions a top bar runs past the face
// of support. Nothing here re-decides either; it turns them into bars.
//
// WHAT A TWO-WAY MAT ACTUALLY LOOKS LIKE, and what this therefore draws:
//
//   • the BOTTOM mat runs the full panel both ways and carries 150 mm into
//     each support (§8.7.4.1.3's continuous bottom bars, and §8.7.4.2's
//     structural-integrity requirement that bars pass through the column core).
//   • the TOP mat exists only OVER the supports: it runs from the face into
//     the span by 0.30/0.20 ℓn in the column strip and 0.22 ℓn in the middle
//     strip, and back across the support into the next panel. Between those
//     bands the top of the slab has no flexural steel, which is exactly what a
//     photograph of a real deck shows.
//   • the SHORT span sits in the outer layer of each mat — nearest the soffit
//     at the bottom, nearest the top face above — because it carries the larger
//     moment and wants the larger d. The long span tucks inside it, one bar
//     diameter in. Drawing both layers at cover would put two bars through the
//     same space.
//   • CHAIRS hold the top mat up. They are not decoration: without them the top
//     steel lies on the bottom mat and the negative moment capacity the design
//     assumed is not there. Drawn as the standing Z-bar the reference photo
//     shows, on a grid, between the two mats.
//
// SPACING comes per strip, because that is how the DDM sizes it: the column
// strip takes most of the moment over a narrower band, so its bars are closer.
// A panel therefore has three bands each way — half a column strip at each
// edge, where the strip straddling the support line is cut by this panel's
// boundary, and the middle strip between them.
//
// Units: geometry m, bar sizes mm. Model space, y up.
// ─────────────────────────────────────────────────────────────────────────
import { DEFAULT_EXT, type SlabBarExtensions } from './slabBarDetail'
import type { RebarCage, RebarRun, Vec3 } from './rebarModel'
import { hookBendDiameter } from './rebarModel'

/** One direction's design, as the cage needs it. */
export interface SlabCageDir {
  /** Clear span in this direction, m. */
  ln: number
  /** Column-strip width, m — the FULL width centred on the support line, so a
   *  panel sees half of it at each of its two edges. */
  csWidth: number
  /** Bottom mat spacing, mm: column strip, middle strip. */
  botCs: number; botMs: number
  /** Top mat spacing over the support, mm: column strip, middle strip. */
  topCs: number; topMs: number
}

export interface SlabCageInput {
  /** Plate id — the mark every bar in this cage carries. */
  mark: string
  /** Panel extent in plan, m. `x1 > x0`, `z1 > z0`. */
  x0: number; x1: number; z0: number; z1: number
  /** Level of the slab's TOP face, m. */
  yTop: number
  /** Thickness and cover, mm. */
  h: number; cover: number
  /** One diameter serves the panel — the spacing is what varies (`SlabScheduleRow`). */
  barDia: number
  /** Bars running along X, and bars running along Z. */
  x: SlabCageDir
  z: SlabCageDir
  /** Support width at the panel edges, m — the top mat's extension is measured
   *  from the FACE, and the bottom mat embeds past it, but never past that
   *  support's own far face less cover. The panel edge is the CENTRELINE, so
   *  this is what says how much concrete a bar has to end in. */
  support?: number
  /**
   * Per-edge support width, m, where the model knows the beam that frames each
   * edge. Overrides `support` on the edges given.
   *
   * A panel is rarely framed by four identical beams, and one width for all
   * four decides where the bottom mat stops on every edge from whichever beam
   * happened to be measured. `xLo` is the edge at `x0`, `xHi` the one at `x1`.
   */
  edgeSupport?: { xLo?: number; xHi?: number; zLo?: number; zHi?: number }
  /**
   * Level of the TOP of the supporting beams' top bars, m — the bar the slab
   * steel is tied against.
   *
   * A monolithic floor is one pour, and on site the slab's top mat is LAID ON
   * the beams' top bars: they are the highest steel in the section and the mat
   * rests on them. Placed from the slab's own cover alone the mat floated
   * above that line — 20 mm slab cover puts it higher than 40 mm beam cover
   * plus a stirrup does — which is not where a bar can physically be once the
   * beam cage is in. The reference photograph is unambiguous about it.
   *
   * The bottom mat uses the same level for the other end of the same
   * relationship: at an edge where the slab stops, its bottom bar turns up and
   * hooks on that bar (§408.7.4.2's anchorage into the support), which is the
   * detail the site photograph shows.
   *
   * Omitted, both fall back to what they did before — cover-derived levels and
   * a straight embedment — so a caller with no beam to measure gets a cage,
   * not an exception.
   */
  supportBarTop?: number
  /** Extensions to use; defaults to the flat-plate figure. */
  ext?: Record<'column' | 'middle', SlabBarExtensions>
  /** Chair grid spacing, m. 0 draws none. */
  chairSpacing?: number
  /**
   * Is the slab CONTINUOUS past each of the four edges — i.e. does another
   * panel carry on there?
   *
   * It decides what the top mat does at that edge, and the two answers are
   * different bars. Continuous: the bar stops at the support CENTRELINE,
   * because the panel on the other side draws the other half of the same bar —
   * run past it, every interior support would be drawn with two top mats.
   * Discontinuous: there is no other half, so the bar runs to the far face of
   * the support and turns down into it, which is the only anchorage a free
   * edge has (§8.7.4.2).
   *
   * Defaults to continuous everywhere, which is the interior-panel case.
   */
  edges?: { xLo?: boolean; xHi?: boolean; zLo?: boolean; zHi?: boolean }
  /**
   * How the main steel is arranged. Both are real details and both are built.
   *
   * `bent` (default) — the traditional two-way-slab arrangement, and the one
   *   the reference detail shows: every main bar is CRANKED. It lies in the
   *   bottom through midspan, bends up near a support and finishes as top steel
   *   over it. Alternate bars crank at opposite ends, so each support gets half
   *   the bottom bars arriving as top steel and midspan keeps all of them.
   * `straight` — separate straight mats, top and bottom, which is what ACI
   *   Fig. 8.7.4.1.3 draws for a slab WITHOUT beams.
   *
   * They are not interchangeable on site and they are not the same bar
   *   schedule, so this is stated rather than assumed.
   */
  detail?: 'bent' | 'straight'
  /**
   * Angle the crank climbs at, degrees from the horizontal. 45° is what a
   *   bar bender sets up for; a shallower crank needs a longer run.
   */
  crankDeg?: number
}

/**
 * Spacing of the EXTRA straight top bars a bent-bar layout still needs, mm.
 *
 * The cranked bars deliver top steel at twice the bottom spacing, because only
 * alternate bars turn up at any one support. Where the design asked for more
 * than that, the shortfall is made up with straight top bars, and this is the
 * spacing of them: areas add, so 1/s_extra = 1/s_top − 1/(2·s_bot).
 *
 * `null` when the cranked bars already carry it — a real and common outcome on
 * a lightly loaded panel, and the reason this is computed rather than assumed
 * one way or the other.
 */
export function extraTopSpacing(botSpacing: number, topSpacing: number): number | null {
  if (!(botSpacing > 0) || !(topSpacing > 0)) return null
  const need = 1 / topSpacing - 1 / (2 * botSpacing)
  return need > 1e-9 ? 1 / need : null
}

/** Bar centres across a band, at `spacing`, kept inside it and symmetric. */
export function bandLines(lo: number, hi: number, spacingMm: number): number[] {
  const s = spacingMm / 1000
  const w = hi - lo
  if (!(s > 1e-6) || w <= 1e-9) return []
  // The count is what the spacing BUYS over the band; the bars are then spread
  // evenly across it. Marching from one end at exactly `s` leaves a ragged
  // remainder against the far edge, which is neither what a detailer sets out
  // nor what the take-off counted.
  const n = Math.max(1, Math.round(w / s))
  const pitch = w / n
  return Array.from({ length: n }, (_, k) => lo + pitch * (k + 0.5))
}

/**
 * The three bands across a panel edge-to-edge: half a column strip at each
 * side, the middle strip between.
 *
 * The column strip is centred on the SUPPORT LINE, so this panel owns half of
 * it at each of its two boundaries. Where the panel is narrower than a full
 * column strip there is no middle strip at all and the two halves meet, which
 * is why the middle band is clamped rather than assumed to exist.
 */
export function strips(lo: number, hi: number, csWidth: number): {
  band: [number, number]; strip: 'column' | 'middle'
}[] {
  const half = Math.min(csWidth / 2, (hi - lo) / 2)
  const out: { band: [number, number]; strip: 'column' | 'middle' }[] = [
    { band: [lo, lo + half], strip: 'column' },
  ]
  if (hi - half - (lo + half) > 1e-9) out.push({ band: [lo + half, hi - half], strip: 'middle' })
  out.push({ band: [hi - half, hi], strip: 'column' })
  return out
}

/**
 * The bottom-bar grid lines a support does NOT receive a cranked bar on, and
 * the `need` of them that are actually wanted.
 *
 * Alternate bars crank up at alternate ends, so at one support the free
 * positions are exactly the bars that turned up at the OTHER one. An extra
 * straight top bar goes there — on the bottom mat's own setting-out grid, in a
 * gap, never beside a bar already at that level.
 *
 * Asking for more than the gaps can hold returns every gap: the layout is then
 * as tight as the bottom pitch allows, which is a real limit of the bent-bar
 * arrangement and not something to fix by doubling bars up.
 */
export function everyOther(lines: number[], atLow: boolean, need: number): number[] {
  const free = lines.filter((_, k) => (k % 2 === 0) !== atLow)
  if (need <= 0) return []
  if (need >= free.length) return free
  // Spread the wanted count evenly through the free positions rather than
  // taking the first `need` of them, which would crowd one side of the band.
  return Array.from({ length: need }, (_, j) =>
    free[Math.min(free.length - 1, Math.round(((j + 0.5) * free.length) / need - 0.5))])
}

/** §425.3.1 ℓext on a 90° hook, m — 12db, and never under 150 mm. */
const hookExt = (db: number) => Math.max(12 * db, 150) / 1000

/**
 * Every bar in one slab panel.
 *
 * `runs` are ordered bottom mat, top mat, chairs, so a viewer drawing them in
 * order builds the cage the way it is tied.
 */
export function buildSlabCage(i: SlabCageInput): RebarCage {
  const runs: RebarRun[] = []
  const notes: string[] = []
  const ext = i.ext ?? DEFAULT_EXT
  const c = i.cover / 1000, db = i.barDia / 1000
  const yTop = i.yTop, yBot = yTop - i.h / 1000
  const sup = i.support ?? 0.3
  const bend = hookBendDiameter(i.barDia)
  // The hook turns DOWN into the slab and has to stop above the bottom mat —
  // there is only so much depth to turn into. Drawn at its full ℓext it ran
  // through the bottom steel and out of the soffit.
  const depthForHook = (i.h - 2 * i.cover - 2 * i.barDia) / 1000
  const hook = Math.min(hookExt(i.barDia), Math.max(0, depthForHook))
  /** Support widths, mm, too narrow to take the full bottom-bar embedment. */
  const narrow = new Set<number>()
  /** Upturned-leg lengths, mm, shorter than §425.3.1 asks for. */
  const shortHook = new Set<number>()
  /**
   * How far the top mat reaches into the panel from each support, as
   * `[axis, lo, hi]` in plan — the bands a chair has something to hold up in.
   *
   * Collected while the top bars are placed rather than re-derived afterwards:
   * the reach depends on the strip and on which alternate bar it is, and a
   * second copy of that arithmetic is a second thing to get wrong.
   */
  const topSpan: { run: 'x' | 'z'; lo: number; hi: number }[] = []

  const lenX = i.x1 - i.x0, lenZ = i.z1 - i.z0
  if (lenX <= 0 || lenZ <= 0) return { member: i.mark, runs: [], notes: ['degenerate panel'] }
  // The SHORT span is the outer layer of both mats — larger d where the moment
  // is larger. `xIsShort` decides which of the two directions gets it.
  const xIsShort = lenX <= lenZ

  /** Levels of the two layers, m. Outer = short span. */
  const yBottom = (short: boolean) => yBot + c + (short ? 0 : db) + db / 2
  /**
   * The top mat sits on the beams' top bars where it can, and at its own cover
   * where it cannot.
   *
   * `Math.min` is the whole rule, and it reads correctly in both directions:
   * resting on the beam bar is normally the LOWER of the two (slab cover is
   * thinner than a beam's cover plus its stirrup), so it governs; if a beam
   * ever sat so high that resting on it broke the slab's own cover, the cover
   * line is lower and governs instead. Neither is a special case.
   */
  const yTopMat = (short: boolean) => {
    const byCover = yTop - c - (short ? 0 : db) - db / 2
    if (i.supportBarTop === undefined) return byCover
    const resting = i.supportBarTop + db / 2 - (short ? 0 : db)
    return Math.min(byCover, resting)
  }

  let n = 0
  const push = (r: Omit<RebarRun, 'member' | 'count' | 'mark'> & { tag: string }) => {
    runs.push({ ...r, mark: `${i.mark}-${r.tag}${++n}`, member: i.mark, count: 1 })
  }

  // ── the two mats, one direction at a time ──────────────────────────────
  // `along` is the axis the bars RUN on; `across` is the one they are spaced
  // out along, and the one the strips are measured across.
  const ed = i.edges ?? {}
  const cont = (v: boolean | undefined) => v !== false
  const es = i.edgeSupport ?? {}
  const dirs = [
    { d: i.x, run: 'x' as const, lo: i.x0, hi: i.x1, aLo: i.z0, aHi: i.z1, short: xIsShort,
      contLo: cont(ed.xLo), contHi: cont(ed.xHi), supLo: es.xLo ?? sup, supHi: es.xHi ?? sup },
    { d: i.z, run: 'z' as const, lo: i.z0, hi: i.z1, aLo: i.x0, aHi: i.x1, short: !xIsShort,
      contLo: cont(ed.zLo), contHi: cont(ed.zHi), supLo: es.zLo ?? sup, supHi: es.zHi ?? sup },
  ]

  const bent = (i.detail ?? 'bent') === 'bent'
  const crank = ((i.crankDeg ?? 45) * Math.PI) / 180

  for (const dir of dirs) {
    const at = (u: number, v: number, y: number): Vec3 =>
      dir.run === 'x' ? [u, y, v] : [v, y, u]
    const yB = yBottom(dir.short), yT = yTopMat(dir.short)
    /**
     * How far a continuous bottom bar carries PAST the panel edge, m.
     *
     * §408.7.4.1.3 asks for 150 mm into the support, but the support is a beam
     * of finite width and the panel edge is its CENTRELINE. 150 mm past a
     * 250 mm beam puts the end of the bar 25 mm OUTSIDE the beam it is meant to
     * be anchored in — no cover, no concrete, which is exactly what the cage
     * was drawing. Where the beam is too narrow for the full embedment the bar
     * stops at its far face less cover instead. `slabBarDetail` already reads
     * the figure this way (`Math.min(embed, face)`) for the elevation; this is
     * the same reading applied to the placed bars.
     */
    const embedInto = (s: number) => {
      const want = ext.column.supportEmbed / 1000
      const room = Math.max(0, s / 2 - c)
      if (room < want - 1e-9) narrow.add(Math.round(s * 1000))
      return Math.min(want, room)
    }
    // The crank climbs from the bottom layer to the top one; at 45° it needs
    // that much horizontal run to do it.
    const climb = yT - yB
    const crankRun = climb / Math.max(Math.tan(crank), 1e-6)

    /**
     * Where a BOTTOM bar stops at one end.
     *
     * Continuous edge: straight through into the support, because the panel
     * next door carries the same bar on and there is nothing to anchor.
     *
     * Discontinuous edge: the bar reaches the support and TURNS UP, finishing
     * on the beam's own top bar — which is the site detail, and the anchorage
     * §408.7.4.2 asks for at a free edge. Run straight into the support, a
     * bottom bar at the end of a slab is developed by nothing but bond over the
     * width of one beam.
     *
     * The leg reaches the beam's top bar. Where that is a shorter leg than
     * §425.3.1's ℓext, it is raised toward the top mat — but never past it,
     * which would put the end of a bar in the cover.
     */
    const upTo = (yB: number): number | null => {
      if (i.supportBarTop === undefined) return null
      const ceiling = yTopMat(true)
      const wanted = Math.max(i.supportBarTop, yB + hookExt(i.barDia))
      return Math.min(ceiling, wanted)
    }
    const botEnd = (face: number, sign: 1 | -1, continuous: boolean, v: number, s: number, yB: number) => {
      const end = face - sign * embedInto(s)
      const up = continuous ? null : upTo(yB)
      if (up === null || up <= yB + 1e-9) return { pts: [at(end, v, yB)], bends: [] as number[] }
      if (up - yB < hookExt(i.barDia) - 1e-9) shortHook.add(Math.round((up - yB) * 1000))
      return { pts: [at(end, v, yB), at(end, v, up)], bends: [bend] }
    }

    /** Where a top leg stops at one end: the centreline when the slab carries
     *  on (the neighbour draws the other half), else the far face with a hook
     *  turned down into the support — the only anchorage a free edge has. */
    const topEnd = (face: number, sign: 1 | -1, continuous: boolean, v: number, s: number) =>
      continuous
        ? { pts: [at(face, v, yT)], bends: [] as number[] }
        : { pts: [at(face - sign * (s / 2 - c), v, yT - hook), at(face - sign * (s / 2 - c), v, yT)], bends: [bend] }

    /** Record how far a top bar just placed at this face reaches into the
     *  panel — see `topSpan`. */
    const noteTop = (face: number, sign: 1 | -1, cont: boolean, s: number, reach: number) => {
      const near = cont ? face : face - sign * (s / 2 - c)
      const far = face + sign * (s / 2 + reach)
      topSpan.push({ run: dir.run, lo: Math.min(near, far), hi: Math.max(near, far) })
    }

    for (const { band, strip } of strips(dir.aLo, dir.aHi, dir.d.csWidth)) {
      const e = ext[strip]
      const botSpacing = strip === 'column' ? dir.d.botCs : dir.d.botMs
      const topSpacing = strip === 'column' ? dir.d.topCs : dir.d.topMs

      if (!bent) {
        // ── straight mats: the ACI Fig. 8.7.4.1.3 arrangement ─────────────
        for (const v of bandLines(band[0], band[1], botSpacing)) {
          // Written from the LOW end outward: the low end's hook leg is drawn
          // first (top of the leg, then down to the mat) so the path reads
          // along the bar in one direction, which is what `rebarWire` sweeps.
          const lo = botEnd(dir.lo, 1, dir.contLo, v, dir.supLo, yB)
          const hi = botEnd(dir.hi, -1, dir.contHi, v, dir.supHi, yB)
          push({
            tag: `B${dir.run.toUpperCase()}`, dia: i.barDia, role: 'bottom',
            path: [...[...lo.pts].reverse(), ...hi.pts],
            bendDia: [...lo.bends, ...hi.bends],
          })
        }
        bandLines(band[0], band[1], topSpacing).forEach((v, k) => {
          const reach = ((strip === 'middle' || k % 2 === 0) ? e.topLong : e.topShort) * dir.d.ln
          for (const [face, sign, cont, s] of [
            [dir.lo, 1, dir.contLo, dir.supLo], [dir.hi, -1, dir.contHi, dir.supHi],
          ] as const) {
            const end = topEnd(face, sign, cont, v, s)
            push({
              tag: `T${dir.run.toUpperCase()}`, dia: i.barDia, role: 'top',
              path: [...end.pts, at(face + sign * (s / 2 + reach), v, yT)],
              bendDia: end.bends,
            })
            noteTop(face, sign, cont, s, reach)
          }
        })
        continue
      }

      // ── bent bars: one bar, bottom at midspan, top over one support ─────
      //
      // Alternate bars crank at opposite ends. Midspan therefore keeps every
      // bar in the bottom — the spacing the design asked for — while each
      // support receives half of them as top steel, which is where the factor
      // of two in `extraTopSpacing` comes from.
      bandLines(band[0], band[1], botSpacing).forEach((v, k) => {
        const atLow = k % 2 === 0
        const face = atLow ? dir.lo : dir.hi
        const sign: 1 | -1 = atLow ? 1 : -1
        const cont = atLow ? dir.contLo : dir.contHi
        const s = atLow ? dir.supLo : dir.supHi
        // The far end stays in the BOTTOM and carries on into the far support,
        // the way any continuous bottom bar does. Written out rather than
        // signed: the signed form read `farFace - farSign * -embed`, whose
        // double negative pulled the bar 150 mm SHORT of the support instead
        // of 150 mm into it.
        const far = atLow
          ? botEnd(dir.hi, -1, dir.contHi, v, dir.supHi, yB)
          : botEnd(dir.lo, 1, dir.contLo, v, dir.supLo, yB)
        // The top leg reaches the same distance past the face as a straight top
        // bar would — the figure's extension, so both details put steel over
        // the same length of support and the two are comparable.
        const reach = e.topLong * dir.d.ln
        const upper = face + sign * (s / 2 + reach)
        const end = topEnd(face, sign, cont, v, s)
        noteTop(face, sign, cont, s, reach)
        push({
          tag: `M${dir.run.toUpperCase()}`, dia: i.barDia, role: 'bottom',
          path: [
            ...end.pts,                                          // over the support, on top
            at(upper, v, yT),                                    // start of the crank
            at(upper + sign * crankRun, v, yB),                  // …and its foot
            ...far.pts,                                          // through midspan into the far support
          ],
          bendDia: [...end.bends, bend, bend, ...far.bends],
        })
      })

      // ── the top steel the cranks do not cover ───────────────────────────
      //
      // Straight bars over each support, making up what the cranked half does
      // not carry. None where it already does, which is an ordinary outcome
      // and not an omission.
      //
      // WHERE they go is the part that was wrong. `bandLines` at the extra
      // spacing laid them out on their OWN even grid, independent of the
      // cranked bars they sit beside — so on the sample panel a straight top
      // bar landed 21 mm from a cranked one at the start of the band and
      // drifted from there. Two bars at the same level, 21 mm apart, is not a
      // detail anyone would set out.
      //
      // They belong on the SAME grid as the bottom mat, in the gaps the cranks
      // left: at one support the bars that turn up are the alternate ones, so
      // the free positions are exactly the bars that cranked at the FAR end.
      // An extra bar there sits over one of those, at the bottom-bar pitch,
      // which is how a real bar schedule is set out.
      const sExtra = extraTopSpacing(botSpacing, topSpacing)
      if (sExtra !== null) {
        const grid = bandLines(band[0], band[1], botSpacing)
        const need = Math.max(0, Math.round((band[1] - band[0]) / (sExtra / 1000)))
        for (const [face, sign, cont, s, atLow] of [
          [dir.lo, 1, dir.contLo, dir.supLo, true],
          [dir.hi, -1, dir.contHi, dir.supHi, false],
        ] as const) {
          everyOther(grid, atLow, need).forEach((v, k) => {
            const reach = ((strip === 'middle' || k % 2 === 0) ? e.topLong : e.topShort) * dir.d.ln
            const end = topEnd(face, sign, cont, v, s)
            push({
              tag: `T${dir.run.toUpperCase()}`, dia: i.barDia, role: 'top',
              path: [...end.pts, at(face + sign * (s / 2 + reach), v, yT)],
              bendDia: end.bends,
            })
            noteTop(face, sign, cont, s, reach)
          })
        }
      }
    }
  }

  // A slab too thin to turn a standard hook into is a real finding, not a
  // drawing problem: the bar needs a smaller diameter or a different anchorage.
  if (hook < hookExt(i.barDia) - 1e-9) {
    notes.push(`⌀${i.barDia} hook needs ${Math.round(hookExt(i.barDia) * 1000)} mm `
      + `of ℓext (§425.3.1); a ${i.h} mm slab leaves ${Math.round(hook * 1000)} mm between the mats`)
  }

  // A support too narrow for §408.7.4.1.3's embedment is a real finding too: the
  // bottom bar is stopped at the beam's far face less cover rather than drawn
  // outside it, and the structural-integrity anchorage (§408.7.4.2) is then
  // shorter than the figure asks for.
  for (const w of [...narrow].sort((a, b) => a - b)) {
    notes.push(`bottom bars carry ${Math.round(w / 2 - i.cover)} mm into a ${w} mm support, `
      + `not the ${ext.column.supportEmbed} mm of §408.7.4.1.3 — the beam is not wide enough`)
  }

  // The upturned leg is bounded by the slab's own depth: it starts on the
  // bottom mat and stops on the beam's top bar. A thin slab therefore cannot
  // always give §425.3.1 its ℓext, and that is a finding about the slab, not a
  // drawing to fudge — the bar wants a smaller diameter or a different
  // anchorage.
  for (const leg of [...shortHook].sort((a, b) => a - b)) {
    notes.push(`bottom bars hook up ${leg} mm onto the beam's top bar, short of `
      + `⌀${i.barDia}'s ${Math.round(hookExt(i.barDia) * 1000)} mm ℓext (§425.3.1) — `
      + `a ${i.h} mm slab has no more depth to turn into`)
  }

  // ── chairs ─────────────────────────────────────────────────────────────
  // A standing Z between the mats: a foot on the bottom steel, the rise, and a
  // head under the top steel. Without them the top mat is not where the design
  // put it, and the negative-moment capacity over the support is not there.
  const cs = i.chairSpacing ?? 1.2
  if (cs > 0) {
    const rise = yTopMat(false) - yBottom(false) - db
    const foot = Math.min(0.15, lenX / 6, lenZ / 6)
    /**
     * Is there any top steel over this point for a chair to hold up?
     *
     * The top mat exists only in bands over the supports — that cut-off is the
     * whole point of the figure, and a test asserts midspan is bare. The chairs
     * were nonetheless laid on a grid across the WHOLE panel, so the middle of
     * every panel got a row of standing bars under nothing at all. A chair is
     * not a spacer for the concrete; it exists to hold the top mat at the level
     * the negative-moment capacity was designed at, and where there is no top
     * mat it is steel bought, bent, placed and paid for to do nothing.
     *
     * Either direction counts: a point at midspan along X can still be inside
     * the band of the Z-direction top mat, and that mat needs holding up too.
     */
    const underTop = (x: number, z: number) =>
      topSpan.some((t) => (t.run === 'x'
        ? x >= t.lo - 1e-9 && x <= t.hi + 1e-9
        : z >= t.lo - 1e-9 && z <= t.hi + 1e-9))
    if (rise > db) {
      for (const x of bandLines(i.x0, i.x1, cs * 1000)) {
        for (const z of bandLines(i.z0, i.z1, cs * 1000)) {
          if (!underTop(x, z)) continue
          push({
            tag: 'CH', dia: Math.min(i.barDia, 12), role: 'chair',
            path: [
              [x - foot, yBottom(false) + db, z],
              [x, yBottom(false) + db, z],
              [x, yTopMat(false) - db, z],
              [x + foot, yTopMat(false) - db, z],
            ],
            bendDia: [bend, bend],
          })
        }
      }
    } else {
      notes.push('slab too thin for a standing chair between the mats')
    }
  }

  return { member: i.mark, runs, notes: notes.length ? notes : undefined }
}
