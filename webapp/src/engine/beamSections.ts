// ─────────────────────────────────────────────────────────────────────────
// Critical-section detection for multi-section RC design — faithful port of
// the legacy rcDetectCriticalSections():
//   1. Supports FIRST (so they claim their x-slot with the correct shear):
//      Case A — end support without overhang → Vu = |R| exactly;
//      Case B — end support with overhang, or interior → the larger of
//      |V_before| and |V_after| across the support face.
//   2. Global max +M and max −M (deduped against the supports).
//   3. Per-span V = 0 crossings — the TRUE moment extrema (dM/dx = V),
//      located by linear interpolation between samples.
// Sections are de-duplicated by x within 25 mm and sorted left → right.
// ─────────────────────────────────────────────────────────────────────────
import type { FemResult } from './beamAnalysis'

export interface CriticalSection {
  label: string
  x: number
  Mu: number   // signed: negative = hogging (top tension)
  Vu: number   // magnitude
}

function interpAt(x: number, xs: number[], ys: number[]): number {
  if (x <= xs[0]) return ys[0]
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] >= x) {
      const t = (x - xs[i - 1]) / Math.max(xs[i] - xs[i - 1], 1e-12)
      return ys[i - 1] + t * (ys[i] - ys[i - 1])
    }
  }
  return ys[ys.length - 1]
}

export function detectCriticalSections(r: FemResult): CriticalSection[] {
  const { xs, V, M } = r
  const supps = [...r.reactions].sort((a, b) => a.x - b.x)

  const idxAt = (x: number, dir = 0): number => {
    let best = 0, bd = Infinity
    for (let i = 0; i < xs.length; i++) {
      const d = Math.abs(xs[i] - x)
      if (d < bd) { bd = d; best = i }
    }
    if (dir < 0 && xs[best] > x && best > 0) best -= 1
    if (dir > 0 && xs[best] < x && best < xs.length - 1) best += 1
    return best
  }

  const sections: CriticalSection[] = []
  const tryAdd = (x: number, Mu: number, Vu: number, label: string) => {
    if (sections.some((s) => Math.abs(s.x - x) < 0.025)) return
    sections.push({ label, x, Mu: Math.round(Mu * 1000) / 1000, Vu: Math.round(Vu * 1000) / 1000 })
  }

  // 1. Supports first (overhang-aware Case A / Case B shear).
  const xLeftEdge = xs[0]
  const xRightEdge = xs[xs.length - 1]
  const overhangTol = 1e-3
  supps.forEach((s, i) => {
    const idx = idxAt(s.x)
    const Rv = Number(s.Rv) || 0
    const isLeftEnd = i === 0
    const isRightEnd = i === supps.length - 1
    const hasLeftOverhang = isLeftEnd && s.x - xLeftEdge > overhangTol
    const hasRightOverhang = isRightEnd && xRightEdge - s.x > overhangTol

    let Vu: number
    if ((isLeftEnd && !hasLeftOverhang) || (isRightEnd && !hasRightOverhang)) {
      Vu = Math.abs(Rv)                       // Case A — face shear = reaction
    } else {
      const Vat = V[idx] || 0                 // Case B — larger of the two faces
      Vu = Math.max(Math.abs(Vat - Rv), Math.abs(Vat))
    }
    const Mu = M[idx] || 0
    const label = isLeftEnd
      ? `Left support (x = ${s.x.toFixed(2)} m${hasLeftOverhang ? ', w/ overhang' : ''})`
      : isRightEnd
        ? `Right support (x = ${s.x.toFixed(2)} m${hasRightOverhang ? ', w/ overhang' : ''})`
        : `Interior support ${i} (x = ${s.x.toFixed(2)} m)`
    tryAdd(s.x, Mu, Vu, label)
  })

  // 2. Global max / min moment.
  let iMax = 0, iMin = 0
  for (let i = 1; i < M.length; i++) {
    if (M[i] > M[iMax]) iMax = i
    if (M[i] < M[iMin]) iMin = i
  }
  const peak = Math.max(Math.abs(M[iMax]), Math.abs(M[iMin]), 1e-9)
  const eps = peak * 0.005 + 1e-6
  if (M[iMax] > eps) tryAdd(xs[iMax], M[iMax], Math.abs(V[iMax]), `Max +M (x = ${xs[iMax].toFixed(2)} m)`)
  if (M[iMin] < -eps) tryAdd(xs[iMin], M[iMin], Math.abs(V[iMin]), `Max −M (x = ${xs[iMin].toFixed(2)} m)`)

  // 3. Per-span V = 0 crossings — true moment extrema.
  for (let i = 0; i < supps.length - 1; i++) {
    const xL = supps[i].x, xR = supps[i + 1].x
    const iL = idxAt(xL, +1)
    const iR = idxAt(xR, -1)
    let zeroCount = 0
    for (let k = iL; k < iR; k++) {
      if (V[k] * V[k + 1] < 0) {
        const x0 = xs[k] - (V[k] * (xs[k + 1] - xs[k])) / (V[k + 1] - V[k])
        if (x0 - xL < 0.05 || xR - x0 < 0.05) continue
        zeroCount += 1
        const lbl = supps.length === 2
          ? `Midspan @ V=0 (x = ${x0.toFixed(2)} m)`
          : `Span ${i + 1} extremum ${zeroCount} (x = ${x0.toFixed(2)} m)`
        tryAdd(x0, interpAt(x0, xs, M), Math.abs(interpAt(x0, xs, V)), lbl)
      }
    }
  }

  sections.sort((a, b) => a.x - b.x)
  return sections
}
