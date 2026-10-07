// ─────────────────────────────────────────────────────────────────────────
// A model-space shear tab or fin plate, drawn the way the bolted-connection
// calculator draws its own: bolt forces, the §J4.3 block, the bearing strips
// and lc each bolt tears out through, the shear plane — every number the
// designed `BeamConnection` carries (`lib/connectionMechanics.modelTabMechanics`).
// ─────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import type { BeamConnection } from '../engine/steelConnections'
import { modelTabMechanics } from '../lib/connectionMechanics'
import { ShearTabMechanics } from './ShearTabMechanics'

export function ModelConnectionMechanics({ conn, host, beamShape }: {
  conn: BeamConnection
  host: { kind: 'column' | 'girder'; shape: string; faceType: 'flange' | 'web' }
  beamShape?: string
}) {
  const m = useMemo(() => modelTabMechanics(conn, host, beamShape), [conn, host, beamShape])
  if (!m.beam || !m.support.shape) return null
  const b = conn.bearing, w = conn.weld
  const per = (rows: typeof b.tabBolts) => rows.map((q) => ({ id: q.id, lc: q.lc, Rn_tear: q.Rn_tear, Rn_bear: q.Rn_bear, availBearing: 0.75 * q.Rn }))
  return (
    <ShearTabMechanics
      geom={m.geom} db={conn.bolts.dia} t={conn.tab.t} Fu={conn.plate.Fu} nShear={1}
      forces={m.forces} critical={conn.bolts.criticalId}
      blockShear={m.blockShear} availBlockShear={m.blockShear.map((c) => c.phiRn)}
      avail={{ shear: conn.bolts.phiRnKn, bearing: b.phiRnTab }} R="φRn"
      Vu={conn.Vu} Hu={0} ex_load={Math.round(conn.bolts.ecc)} ey_load={0}
      beam={m.beam} column={m.support.shape}
      bearing={per(b.tabBolts)} webBearing={per(b.webBolts)}
      weld={{
        w: w.w, FEXX: w.FEXX, L: w.L, fMax: w.fMax, availPerLen: w.phiWeld, util: w.fMax / w.phiWeld,
        wMin: w.wMin, sizeOk: w.w >= w.wMin, ok: w.ok,
        baseMetal: { tab: w.phiTab, support: w.phiSupport, tSupport: w.tSupport, governs: w.governs },
      }}
      support={host.kind === 'column' && host.faceType === 'flange' ? undefined : { name: m.support.name, t: m.support.t, ...(host.kind === 'girder' ? { kind: 'girder' as const } : {}) }}
      cope={conn.cope}
    />
  )
}
