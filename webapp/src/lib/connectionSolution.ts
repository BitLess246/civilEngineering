// ─────────────────────────────────────────────────────────────────────────
// Step-by-step worked solution for a designed steel connection row (shear tab /
// fin plate / flange-weld moment connection) — AISC 360-16 §J3/§J4/§J2.
// Recomputes each check with the row's own designed values so every number in
// the printout traces to the same engine that sized the connection.
// ─────────────────────────────────────────────────────────────────────────
import type { SolutionStep } from './solution'
import { sn1, sn2 } from './solution'
import { FNV_A325 as FNV, type BeamConnection } from '../engine/steelConnections'
import { boltGeomFromPositions } from '../engine/steelDesign'

const PHI_BOLT = 0.75                     // §J3.6; FNV = A325 threads excluded

/** Where the connection lands: a column face or a girder web. */
export interface ConnHost {
  kind: 'column' | 'girder'
  shape: string
  faceType?: 'flange' | 'web'
}

export function connectionRowSolution(c: BeamConnection, host: ConnHost): SolutionStep[] {
  const steps: SolutionStep[] = []
  const b = c.bolts, t = c.tab
  const Ab = (Math.PI / 4) * b.dia * b.dia
  const phiRn = (PHI_BOLT * FNV * Ab) / 1000

  const beamSide = c.beamElement === 'web+flanges' ? 'web + flanges' : 'web'
  const hostSide = host.kind === 'column' ? `column ${host.shape} ${host.faceType ?? 'flange'} face` : `girder ${host.shape} web`
  steps.push({
    title: 'Design forces and connection type',
    lines: [
      { text: `Element pairing: beam ${c.beamId} ${beamSide} → ${hostSide}. The web/flange pair on each side selects the detail below.` },
      { tex: `V_u = ${sn1(c.Vu)}\\ \\text{kN}${c.Mu > 0 ? `,\\quad M_u = ${sn1(c.Mu)}\\ \\text{kN·m}` : ''}` },
      { text: c.connType === 'moment-flange-weld'
        ? 'Strong-axis moment connection (beam flanges meet the column FLANGE): direct CJP flange welds carry Mu; the single-plate web tab carries Vu (§J1.2 force split).'
        : c.connType === 'moment-web-plate'
        ? 'Weak-axis moment connection (beam flanges meet the column WEB): CJP into the thin web has no load path, so horizontal extension plates welded into the web carry the flange forces (AISC DG13 detail); the web tab carries Vu.'
        : `Simple (shear-only) ${host.kind === 'girder' ? 'fin plate' : 'shear tab'} — the end is a pin; only Vu transfers.${host.kind === 'column' && host.faceType === 'web' ? ' The plate is welded to the column web and EXTENDED past the flange tips so the bolts are erectable — the larger eccentricity is carried below.' : ''}` },
    ],
  })

  // bolt group — recompute the elastic eccentric method from the designed layout
  const g = boltGeomFromPositions(b.locations)
  const J = g.Ip
  const Rd = c.Vu / b.n
  steps.push({
    title: 'Bolt group — elastic eccentric method (§J3.6)',
    lines: [
      { text: 'Single-plate connection ⇒ each bolt works in SINGLE shear: m = 1 shear plane, at the plate ↔ beam-web interface. (A double-angle cleat would give m = 2 and twice the per-bolt capacity.)' },
      { tex: `\\phi R_n = 0.75 \\cdot F_{nv} A_b \\cdot m = 0.75 \\cdot ${FNV} \\cdot ${sn1(Ab)} \\cdot 1 / 10^3 = ${sn1(phiRn)}\\ \\text{kN/bolt (M${b.dia} A325-X, Table J3.2)}` },
      { text: `${b.n} bolt(s), single column @ ${b.pitchMm} mm pitch, ${b.edgeMm} mm edge; bolt line ${Math.round(b.ecc)} mm from the weld line (the eccentricity e).` },
      { tex: `J = \\sum (x_c^2 + y_c^2) = ${sn1(J / 1e3)}\\times 10^3\\ \\text{mm}^2` },
      { tex: `R_d = V_u / n = ${sn1(c.Vu)} / ${b.n} = ${sn2(Rd)}\\ \\text{kN};\\quad R_T = V_u\\, e\\, \\rho / J` },
      { tex: `R_{max} = ${sn2(b.Rmax)}\\ \\text{kN} \\; ${b.Rmax <= phiRn ? '\\le' : '>'} \\; \\phi R_n = ${sn1(phiRn)}\\ \\text{kN} \\quad ${b.Rmax <= phiRn ? '\\checkmark' : '\\text{NG}'}` },
    ],
    note: `critical bolt ${b.criticalId}`,
  })

  const br = c.bearing
  steps.push({
    title: 'Bolt bearing and tear-out, each bolt on both plies (§J3.10(a))',
    lines: [
      { tex: `R_n = \\min(1.2\\, l_c\\, t\\, F_u,\\; 2.4\\, d\\, t\\, F_u),\\quad \\phi = 0.75,\\quad d_h = d + 2 = ${b.dia + 2}\\ \\text{mm}` },
      { text: `lc is the clear distance along the way each bolt pushes, to the next hole or a free edge. The tab is pushed DOWN (its free edges: bottom, top, far side); the beam web is pushed UP${c.cope ? ', toward the cope' : ''}.` },
      { tex: `\\text{tab } (t = ${t.t},\\ F_u = 400):\\ \\min \\phi R_n = ${sn1(br.phiRnTab)}\\ \\text{kN},\\ l_{c,min} = ${Math.round(br.lcTabMin)}\\ \\text{mm}` },
      { tex: `\\text{beam web } (t_w = ${br.tw},\\ F_u = ${br.FuWeb}):\\ \\min \\phi R_n = ${sn1(br.phiRnWeb)}\\ \\text{kN}` },
      { tex: `\\max_i \\dfrac{R_i}{\\min(\\phi R_{n,shear},\\ \\phi R_{n,tab},\\ \\phi R_{n,web})} = ${sn2(br.util)} \\quad (${br.governingBolt},\\ \\text{${br.governedBy}}) \\quad ${br.ok ? '\\checkmark' : '\\text{NG}'}` },
    ],
  })

  const pl = c.plate, fl = pl.flexure
  const bs = pl.blockShear
  steps.push({
    title: 'Plate — shear, block shear and flexure (§J4.2, §J4.3, Manual Part 10)',
    lines: [
      { tex: `h_p = (n-1)p + 2e_v = (${b.n}-1)\\cdot ${b.pitchMm} + 2\\cdot ${b.edgeMm} = ${Math.round(t.hMm)}\\ \\text{mm},\\quad t = ${t.t}\\ \\text{mm (A36: } F_y = ${pl.Fy},\\ F_u = ${pl.Fu})` },
      { tex: `\\text{§J4.2(a) yielding: } \\phi V_y = 1.0 \\cdot 0.6 F_y\\, t\\, h_p = ${sn1(pl.phiVy)}\\ \\text{kN} \\quad ${pl.phiVy >= c.Vu ? '\\checkmark' : '\\text{NG}'}` },
      { tex: `\\text{§J4.2(b) rupture: } A_{nv} = (h_p - n\\,d_h)\\,t = ${Math.round(pl.Anv)}\\ \\text{mm}^2,\\ \\phi V_r = 0.75 \\cdot 0.6 F_u A_{nv} = ${sn1(pl.phiVr)}\\ \\text{kN} \\quad ${pl.phiVr >= c.Vu ? '\\checkmark' : '\\text{NG}'}` },
      { tex: `\\text{§J4.3 block: } A_{gv} = ${Math.round(bs.Agv)},\\ A_{nv} = ${Math.round(bs.Anv)},\\ A_{nt} = ${Math.round(bs.Ant)}\\ \\text{mm}^2 \\Rightarrow \\phi R_n = 0.75[\\min(0.6F_uA_{nv},\\,0.6F_yA_{gv}) + F_uA_{nt}] = ${sn1(bs.phiRn)}\\ \\text{kN} \\quad ${bs.phiRn >= c.Vu ? '\\checkmark' : '\\text{NG}'}` },
      { tex: `M_u = V_u\\, a = ${sn1(c.Vu)} \\cdot ${Math.round(fl.a)} = ${sn1(fl.Mu / 1000)}\\ \\text{kN·m at the bolt line}` },
      { tex: `\\text{Eq. 10-5: } \\left(\\tfrac{V_u}{\\phi V_y}\\right)^2 + \\left(\\tfrac{M_u}{0.9 F_y Z}\\right)^2 = ${sn2(fl.interaction)} \\le 1,\\quad Z = t h_p^2/4 = ${sn1(fl.Z / 1e3)}\\times10^3\\ \\text{mm}^3 \\quad ${fl.interaction <= 1 ? '\\checkmark' : '\\text{NG}'}` },
      { tex: `\\text{rupture: } Z_{net} = ${sn1(fl.Znet / 1e3)}\\times10^3\\ \\text{mm}^3,\\ 0.75 F_u Z_{net} = ${sn1(fl.phiMnRupture / 1000)}\\ \\text{kN·m} \\quad ${fl.Mu <= fl.phiMnRupture ? '\\checkmark' : '\\text{NG}'}` },
      { tex: `\\text{buckling (Part 9, } c = a\\text{): } \\lambda = \\dfrac{h_p\\sqrt{F_y}}{10\\,t\\sqrt{475 + 280(h_p/a)^2}} = ${sn2(fl.lambda)},\\ Q = ${sn2(fl.Q)},\\ 0.9\\,QF_y S = ${sn1(fl.phiMnBuckling / 1000)}\\ \\text{kN·m} \\quad ${fl.Mu <= fl.phiMnBuckling ? '\\checkmark' : '\\text{NG}'}` },
    ],
    note: `governs: ${pl.governs}, ${Math.round(pl.util * 100)}%`,
  })

  const wd = c.weld
  steps.push({
    title: 'Weld — two fillets along the support, elastic method (§J2.4, §J4.2(b))',
    lines: [
      { text: `Vu acts at the bolt line, a = ${Math.round(fl.a)} mm from the weld line, so the welds carry V and the moment V·a. Two equal fillets on one line act as one line of twice the throat.` },
      { tex: `f_{max} = \\sqrt{\\left(\\tfrac{V_u}{L}\\right)^2 + \\left(\\tfrac{V_u\\,a\\,L/2}{L^3/12}\\right)^2} = ${sn1(wd.fMax)}\\ \\text{N/mm},\\quad L = ${Math.round(wd.L)}\\ \\text{mm}` },
      { tex: `\\phi R_w = 0.75 \\cdot 0.6 F_{EXX} \\cdot 0.707 \\cdot 2w = 0.75 \\cdot 0.6 \\cdot ${wd.FEXX} \\cdot 0.707 \\cdot 2\\cdot${wd.w} = ${sn1(wd.phiWeld)}\\ \\text{N/mm} \\quad ${wd.fMax <= wd.phiWeld ? '\\checkmark' : '\\text{NG}'}` },
      { tex: `\\text{tab base metal: } 0.75 \\cdot 0.6 \\cdot 400 \\cdot ${t.t} = ${sn1(wd.phiTab)}\\ \\text{N/mm} \\quad ${wd.fMax <= wd.phiTab ? '\\checkmark' : '\\text{NG}'}` },
      { tex: `\\text{support base metal (two planes through } t = ${wd.tSupport}\\text{): } 2 \\cdot 0.75 \\cdot 0.6 \\cdot ${wd.FuSupport} \\cdot ${wd.tSupport} = ${sn1(wd.phiSupport)}\\ \\text{N/mm} \\quad ${wd.governs !== 'support base metal' || wd.ok ? '\\checkmark' : '\\text{NG}'}` },
      { tex: `\\text{Table J2.4: } w_{min} = ${wd.wMin}\\ \\text{mm (thinner part } ${Math.min(t.t, wd.tSupport)}\\text{ mm)} \\le w = ${wd.w}\\ \\text{mm E70XX, both faces} \\quad ${wd.w >= wd.wMin ? '\\checkmark' : '\\text{NG}'}` },
    ],
    note: `governs: ${wd.governs}, ${Math.round(wd.util * 100)}%`,
  })

  if (c.connType === 'moment-flange-weld' && c.flange) {
    steps.push({
      title: 'Flange force — CJP groove welds (§J2.6)',
      lines: [
        { tex: `T_f = \\dfrac{M_u}{d - t_f} = ${sn1(c.flange.Tf)}\\ \\text{kN}` },
        { tex: `\\phi R_{CJP} = \\phi F_u A_{fl} = ${sn1(c.flange.phiCapKn)}\\ \\text{kN} \\quad ${c.flange.ok ? '\\checkmark' : '\\text{NG}'} \\qquad (A_{fl} = ${Math.round(c.flange.flangeArea)}\\ \\text{mm}^2)` },
        { text: 'Provide column continuity plates at both beam-flange levels (web crippling/local bending, §J10).' },
      ],
    })
  }

  if (c.connType === 'moment-web-plate' && c.flange?.webPlate) {
    const wp = c.flange.webPlate
    steps.push({
      title: 'Flange force — weak-axis extension plates (§J4.1, §J2.4)',
      lines: [
        { tex: `T_f = \\dfrac{M_u}{d - t_f} = ${sn1(c.flange.Tf)}\\ \\text{kN}` },
        { text: `Horizontal plates PL ${wp.tMm}×${wp.wMm} mm at both beam-flange levels, welded into the column web between the flanges; the beam flanges CJP to the plate edges.` },
        { tex: `\\phi R_{pl} = 0.9\\, F_y\\, t\\, w = 0.9 \\cdot 248 \\cdot ${wp.tMm} \\cdot ${wp.wMm} / 10^3 = ${sn1(wp.phiPlateKn)}\\ \\text{kN} \\; ${wp.phiPlateKn >= c.flange.Tf ? '\\ge' : '<'} \\; T_f \\quad ${wp.phiPlateKn >= c.flange.Tf ? '\\checkmark' : '\\text{NG}'}` },
        { tex: `\\phi R_w = ${sn1(wp.phiWeldKn)}\\ \\text{kN} \\; ${wp.phiWeldKn >= c.flange.Tf ? '\\ge' : '<'} \\; T_f \\quad ${wp.phiWeldKn >= c.flange.Tf ? '\\checkmark' : '\\text{NG}'} \\qquad (w = ${wp.weldMm}\\ \\text{mm fillet, both sides along the web})` },
      ],
    })
  }

  if (c.cope) {
    const cb = c.copedBeam, wb = c.webBlockShear
    steps.push({
      title: 'Coped beam — the reduced section at the cope (§J4.2, §J4.3, Manual Part 9)',
      lines: [
        { text: `Top flange coped ${c.cope.lengthMm} mm long × ${c.cope.depthMm} mm deep to clear the girder flange (girder ${host.shape}).` },
        ...(cb ? [
          { tex: `h_o = d - d_c = ${Math.round(cb.d)} - ${cb.dc} = ${Math.round(cb.ho)}\\ \\text{mm},\\quad e = c + 13 = ${cb.e}\\ \\text{mm},\\quad M_u = V_u e = ${sn1(cb.Mu / 1000)}\\ \\text{kN·m}` },
          { tex: `\\phi V_y = 1.0 \\cdot 0.6F_y t_w h_o = ${sn1(cb.phiVy)}\\ \\text{kN},\\quad \\phi V_r = 0.75 \\cdot 0.6F_u t_w(h_o - n d_h) = ${sn1(cb.phiVr)}\\ \\text{kN} \\quad ${Math.min(cb.phiVy, cb.phiVr) >= c.Vu ? '\\checkmark' : '\\text{NG}'}` },
          { tex: `\\text{tee: } S_{net} = ${sn1(cb.Snet / 1e3)}\\times10^3,\\ Z_{net} = ${sn1(cb.Znet / 1e3)}\\times10^3\\ \\text{mm}^3` },
          { tex: `\\text{local web buckling: } \\lambda = \\dfrac{h_o\\sqrt{F_y}}{10\\,t_w\\sqrt{475 + 280(h_o/c)^2}} = ${sn2(cb.lambda)},\\ Q = ${sn2(cb.Q)},\\ \\phi M_n = 0.9\\,QF_yS_{net} = ${sn1(cb.phiMnBuckling / 1000)}\\ \\text{kN·m} \\quad ${cb.Mu <= cb.phiMnBuckling ? '\\checkmark' : '\\text{NG}'}` },
          { tex: `\\text{flexural rupture: } \\phi M_n = 0.75 F_u Z_{net} = ${sn1(cb.phiMnRupture / 1000)}\\ \\text{kN·m} \\quad ${cb.Mu <= cb.phiMnRupture ? '\\checkmark' : '\\text{NG}'}` },
        ] : []),
        ...(wb ? [
          { tex: `\\text{§J4.3 coped-web block: } A_{gv} = ${Math.round(wb.Agv)},\\ A_{nv} = ${Math.round(wb.Anv)},\\ A_{nt} = ${Math.round(wb.Ant)}\\ \\text{mm}^2 \\Rightarrow \\phi R_n = ${sn1(wb.phiRn)}\\ \\text{kN} \\quad ${wb.ok ? '\\checkmark' : '\\text{NG}'}` },
        ] : []),
      ],
      ...(cb ? { note: `governs: ${cb.governs}, ${Math.round(cb.util * 100)}%` } : {}),
    })
  }

  const failing = [
    !b.ok && 'bolt shear',
    !c.bearing.ok && `bearing/tear-out (${c.bearing.governedBy})`,
    !c.plate.ok && `plate ${c.plate.governs}`,
    !c.weld.ok && `weld (${c.weld.governs})`,
    c.copedBeam && !c.copedBeam.ok && `coped beam ${c.copedBeam.governs}`,
    c.webBlockShear && !c.webBlockShear.ok && 'coped-web block shear',
    c.flange && !c.flange.ok && 'flange force',
    c.note,
  ].filter(Boolean)
  steps.push({
    title: 'Verdict',
    lines: [
      { text: c.ok
        ? `All checks pass — ${b.n} × M${b.dia} A325 on a ${t.t}×${Math.round(t.hMm)} mm plate with ${t.weldSizeMm} mm E70 fillets.`
        : `Fails: ${failing.join('; ')}. The schedule row is flagged — revise the connection.` },
    ],
  })
  return steps
}
