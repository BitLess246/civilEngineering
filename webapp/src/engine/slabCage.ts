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
   *  from the FACE, and the bottom mat embeds past it. */
  support?: number
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

  const lenX = i.x1 - i.x0, lenZ = i.z1 - i.z0
  if (lenX <= 0 || lenZ <= 0) return { member: i.mark, runs: [], notes: ['degenerate panel'] }
  // The SHORT span is the outer layer of both mats — larger d where the moment
  // is larger. `xIsShort` decides which of the two directions gets it.
  const xIsShort = lenX <= lenZ

  /** Levels of the two layers, m. Outer = short span. */
  const yBottom = (short: boolean) => yBot + c + (short ? 0 : db) + db / 2
  const yTopMat = (short: boolean) => yTop - c - (short ? 0 : db) - db / 2

  let n = 0
  const push = (r: Omit<RebarRun, 'member' | 'count' | 'mark'> & { tag: string }) => {
    runs.push({ ...r, mark: `${i.mark}-${r.tag}${++n}`, member: i.mark, count: 1 })
  }

  // ── the two mats, one direction at a time ──────────────────────────────
  // `along` is the axis the bars RUN on; `across` is the one they are spaced
  // out along, and the one the strips are measured across.
  const ed = i.edges ?? {}
  const cont = (v: boolean | undefined) => v !== false
  const dirs = [
    { d: i.x, run: 'x' as const, lo: i.x0, hi: i.x1, aLo: i.z0, aHi: i.z1, short: xIsShort,
      contLo: cont(ed.xLo), contHi: cont(ed.xHi) },
    { d: i.z, run: 'z' as const, lo: i.z0, hi: i.z1, aLo: i.x0, aHi: i.x1, short: !xIsShort,
      contLo: cont(ed.zLo), contHi: cont(ed.zHi) },
  ]

  for (const dir of dirs) {
    const at = (u: number, v: number, y: number): Vec3 =>
      dir.run === 'x' ? [u, y, v] : [v, y, u]
    const yB = yBottom(dir.short), yT = yTopMat(dir.short)
    const embed = ext.column.supportEmbed / 1000

    for (const { band, strip } of strips(dir.aLo, dir.aHi, dir.d.csWidth)) {
      const e = ext[strip]
      // ── bottom mat: the full panel, carried into both supports ─────────
      for (const v of bandLines(band[0], band[1], strip === 'column' ? dir.d.botCs : dir.d.botMs)) {
        push({
          tag: `B${dir.run.toUpperCase()}`, dia: i.barDia, role: 'bottom',
          path: [at(dir.lo - embed, v, yB), at(dir.hi + embed, v, yB)],
          bendDia: [],
        })
      }
      // ── top mat: over each support only ────────────────────────────────
      // Into the span by the figure's extension from the FACE; back over the
      // support and `embed` into the next panel, where the real bar carries on.
      // Half the bars run the long extension and half the short (§8.7.4.1.3
      // splits the column strip 50/50); the middle strip runs one length.
      const topSpacing = strip === 'column' ? dir.d.topCs : dir.d.topMs
      const lines = bandLines(band[0], band[1], topSpacing)
      lines.forEach((v, k) => {
        const long = strip === 'middle' || k % 2 === 0
        const reach = (long ? e.topLong : e.topShort) * dir.d.ln
        for (const [face, sign, cont] of [
          [dir.lo, 1, dir.contLo], [dir.hi, -1, dir.contHi],
        ] as const) {
          const inner = face + sign * (sup / 2 + reach)
          if (cont) {
            // Half of one bar; the next panel draws the other half.
            push({
              tag: `T${dir.run.toUpperCase()}`, dia: i.barDia, role: 'top',
              path: [at(face, v, yT), at(inner, v, yT)], bendDia: [],
            })
          } else {
            // Free edge: to the far face and turn down into the support.
            const outer = face - sign * (sup / 2 - c)
            push({
              tag: `T${dir.run.toUpperCase()}`, dia: i.barDia, role: 'top',
              path: [at(outer, v, yT - hook), at(outer, v, yT), at(inner, v, yT)],
              bendDia: [bend],
            })
          }
        }
      })
    }
  }

  // A slab too thin to turn a standard hook into is a real finding, not a
  // drawing problem: the bar needs a smaller diameter or a different anchorage.
  if (hook < hookExt(i.barDia) - 1e-9) {
    notes.push(`⌀${i.barDia} hook needs ${Math.round(hookExt(i.barDia) * 1000)} mm `
      + `of ℓext (§425.3.1); a ${i.h} mm slab leaves ${Math.round(hook * 1000)} mm between the mats`)
  }

  // ── chairs ─────────────────────────────────────────────────────────────
  // A standing Z between the mats: a foot on the bottom steel, the rise, and a
  // head under the top steel. Without them the top mat is not where the design
  // put it, and the negative-moment capacity over the support is not there.
  const cs = i.chairSpacing ?? 1.2
  if (cs > 0) {
    const rise = yTopMat(false) - yBottom(false) - db
    const foot = Math.min(0.15, lenX / 6, lenZ / 6)
    if (rise > db) {
      for (const x of bandLines(i.x0, i.x1, cs * 1000)) {
        for (const z of bandLines(i.z0, i.z1, cs * 1000)) {
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
