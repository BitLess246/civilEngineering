// ─────────────────────────────────────────────────────────────────────────
// CONNECTION MARKS — every designed beam end, scheduled to a typical detail.
//
// A steel connection TYPE really is typical (the same bolts, plate and weld at
// every end it serves), and detailers issue typical connection details. What
// makes that buildable rather than a slogan is that EVERY beam end is
// scheduled to a mark (docs/SteelDrawingsPlan.md, rule 3). The beam schedule,
// the framing elevations and the connection sheets all read their marks from
// here, so they cannot name the same connection two ways.
//
//   SC  shear tab to a column            (simple — released in the analysis)
//   MF  moment, CJP-welded flanges
//   MP  moment, flange extension plates on the web
//   FP  fin plate, beam to girder web (coped)
//
// Numbered in design order within each prefix by a signature of what is
// fabricated: bolts, plate, weld, flange detail, cope and the face it lands on.
// ─────────────────────────────────────────────────────────────────────────
import type { StructureDesign } from '../engine/pipeline'
import type { BeamConnection } from '../engine/steelConnections'

export interface ConnectionType {
  mark: string
  kind: 'shear-tab' | 'moment-flange-weld' | 'moment-web-plate' | 'fin-plate'
  /** One designed connection of this type — the detail is drawn from it. */
  sample: BeamConnection
  /** Every end it serves, `beamId@nodeId`, and the worst utilisation-carrying
   *  demands among them. */
  ends: string[]
  Vu: number; Mu: number
  ok: boolean
  /** What the sample frames into, and the beam that frames — what the typical
   *  detail is drawn with (`engine/steelConnectionDetail`). */
  hostShape: string
  hostKind: 'column' | 'girder'
  faceType: 'flange' | 'web'
  beamShape?: string
}

export interface ConnectionMarks {
  /** `beamId@nodeId` → mark. */
  byEnd: Map<string, string>
  types: ConnectionType[]
}

const endKey = (beamId: string, node: string) => `${beamId}@${node}`

/** What is FABRICATED, and nothing else: two ends that carry different loads
 *  through the same bolts, plate and welds are one typical detail. Demands and
 *  capacities (Tf, φRn, ok) are deliberately absent — keying on them split
 *  identical details into separate marks. */
export function signature(c: BeamConnection, bb: boolean): string {
  const wp = c.flange?.webPlate
  return [
    bb ? 'bb' : c.connType, c.faceType, c.bolts.n, c.bolts.dia, c.tab.t, Math.round(c.tab.hMm), c.tab.weldSizeMm,
    c.flange ? 'flange' : '', wp ? `${wp.tMm}x${Math.round(wp.wMm)}/${wp.weldMm}` : '',
    c.cope ? `${c.cope.lengthMm}x${c.cope.depthMm}` : '',
    // the column stiffening the connection brings with it (§J10)
    c.j10?.stiffeners ? `st${c.j10.stiffeners.ts}x${Math.round(c.j10.stiffeners.bs)}/${c.j10.stiffeners.weld}${c.j10.stiffeners.fullDepth ? 'F' : ''}` : '',
    c.j10?.doubler ? `db${c.j10.doubler.td}/${c.j10.doubler.weld}` : '',
  ].join('|')
}

export function connectionMarks(design: StructureDesign): ConnectionMarks {
  const prefix = (c: BeamConnection, bb: boolean) =>
    bb ? 'FP' : c.connType === 'moment-flange-weld' ? 'MF' : c.connType === 'moment-web-plate' ? 'MP' : 'SC'
  const kindOf = (c: BeamConnection, bb: boolean): ConnectionType['kind'] =>
    bb ? 'fin-plate' : c.connType === 'moment-flange-weld' ? 'moment-flange-weld' : c.connType === 'moment-web-plate' ? 'moment-web-plate' : 'shear-tab'
  const bySig = new Map<string, ConnectionType>()
  const counts = new Map<string, number>()
  const byEnd = new Map<string, string>()
  const beamShape = new Map(design.steelBeams.map((b) => [b.id, b.shape]))
  const all = [
    ...design.joints.flatMap((j) => j.connections.map((c) => ({ node: j.nodeId, c, bb: false, host: j.columnShape }))),
    ...design.beamJoints.flatMap((j) => j.connections.map((c) => ({ node: j.nodeId, c, bb: true, host: j.girderShape }))),
  ]
  for (const { node, c, bb, host } of all) {
    const sig = signature(c, bb)
    let t = bySig.get(sig)
    if (!t) {
      const pre = prefix(c, bb)
      const n = (counts.get(pre) ?? 0) + 1
      counts.set(pre, n)
      t = {
        mark: `${pre}${n}`, kind: kindOf(c, bb), sample: c, ends: [], Vu: 0, Mu: 0, ok: true,
        hostShape: host, hostKind: bb ? 'girder' : 'column', faceType: bb ? 'web' : c.faceType, beamShape: beamShape.get(c.beamId),
      }
      bySig.set(sig, t)
    }
    t.ends.push(endKey(c.beamId, node))
    t.Vu = Math.max(t.Vu, c.Vu)
    t.Mu = Math.max(t.Mu, c.pinned ? 0 : c.Mu)
    t.ok &&= c.ok
    byEnd.set(endKey(c.beamId, node), t.mark)
  }
  return { byEnd, types: [...bySig.values()] }
}

/** The mark at one end of a beam, or '—' where no connection was designed
 *  there (an end on a support, or a non-steel carrier). */
export const markAt = (m: ConnectionMarks, beamId: string, node: string): string =>
  m.byEnd.get(endKey(beamId, node)) ?? '—'
