// ─────────────────────────────────────────────────────────────────────────
// Step-by-step worked solution for a designed steel connection row (shear tab /
// fin plate / flange-weld moment connection) — AISC 360-16 §J3/§J4/§J2.
// Recomputes each check with the row's own designed values so every number in
// the printout traces to the same engine that sized the connection.
// ─────────────────────────────────────────────────────────────────────────
import type { SolutionStep } from './solution'
import { sn1, sn2 } from './solution'
import type { BeamConnection } from '../engine/steelConnections'
import { boltGeomFromPositions } from '../engine/steelDesign'

const PHI_BOLT = 0.75, FNV = 495          // §J3.6, A325 threads excluded
const PHI_PLATE = 1.0, FY_PL = 248        // §J4.2 shear yielding, A36
const PHI_WELD = 0.75, FEXX = 480         // §J2.4, E70XX

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
      { tex: `\\phi R_n = 0.75 \\cdot F_{nv} A_b \\cdot m = 0.75 \\cdot ${FNV} \\cdot ${sn1(Ab)} \\cdot 1 / 10^3 = ${sn1(phiRn)}\\ \\text{kN/bolt (M${b.dia} A325-X)}` },
      { text: `${b.n} bolt(s), single column @ ${b.pitchMm} mm pitch, ${b.edgeMm} mm edge; bolt line ${Math.round(b.ecc)} mm from the weld line (the eccentricity e).` },
      { tex: `J = \\sum (x_c^2 + y_c^2) = ${sn1(J / 1e3)}\\times 10^3\\ \\text{mm}^2` },
      { tex: `R_d = V_u / n = ${sn1(c.Vu)} / ${b.n} = ${sn2(Rd)}\\ \\text{kN};\\quad R_T = V_u\\, e\\, \\rho / J` },
      { tex: `R_{max} = ${sn2(b.Rmax)}\\ \\text{kN} \\; ${b.Rmax <= phiRn ? '\\le' : '>'} \\; \\phi R_n = ${sn1(phiRn)}\\ \\text{kN} \\quad ${b.Rmax <= phiRn ? '\\checkmark' : '\\text{NG}'}` },
    ],
    note: `critical bolt ${b.criticalId}`,
  })

  const phiVn = (PHI_PLATE * 0.6 * FY_PL * t.t * t.hMm) / 1000
  steps.push({
    title: 'Plate — shear yielding (§J4.2)',
    lines: [
      { tex: `h_p = (n-1)p + 2e_v = (${b.n}-1)\\cdot ${b.pitchMm} + 2\\cdot ${b.edgeMm} = ${Math.round(t.hMm)}\\ \\text{mm}` },
      { tex: `t_{req} = \\dfrac{V_u}{\\phi\\, 0.6 F_y h_p} = \\dfrac{${sn1(c.Vu)}\\times 10^3}{1.0 \\cdot 0.6 \\cdot ${FY_PL} \\cdot ${Math.round(t.hMm)}} = ${sn2((c.Vu * 1000) / (PHI_PLATE * 0.6 * FY_PL * t.hMm))}\\ \\text{mm} \\;\\Rightarrow\\; t = ${t.t}\\ \\text{mm (stock)}` },
      { tex: `\\phi V_n = 1.0 \\cdot 0.6 F_y\\, t\\, h_p = ${sn1(phiVn)}\\ \\text{kN} \\ge V_u = ${sn1(c.Vu)}\\ \\text{kN} \\quad ${phiVn >= c.Vu ? '\\checkmark' : '\\text{NG}'}` },
    ],
  })

  const phiWeld = (2 * PHI_WELD * 0.6 * FEXX * 0.707 * t.weldSizeMm * t.hMm) / 1000
  steps.push({
    title: 'Weld — double fillet to the support (§J2.4, NSCP 510.2.2)',
    lines: [
      { tex: `\\phi R_w = 2 \\cdot 0.75 \\cdot 0.6 F_{EXX} \\cdot 0.707 w \\cdot h_p = 2 \\cdot 0.75 \\cdot 0.6 \\cdot ${FEXX} \\cdot 0.707 \\cdot ${t.weldSizeMm} \\cdot ${Math.round(t.hMm)} / 10^3` },
      { tex: `\\phi R_w = ${sn1(phiWeld)}\\ \\text{kN} \\ge V_u = ${sn1(c.Vu)}\\ \\text{kN} \\quad ${phiWeld >= c.Vu ? '\\checkmark' : '\\text{NG}'} \\qquad (w = ${t.weldSizeMm}\\ \\text{mm E70XX, both sides})` },
    ],
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
    steps.push({
      title: 'Coped-beam detail (SCM Part 9)',
      lines: [
        { text: `Top flange coped ${c.cope.lengthMm} mm long × ${c.cope.depthMm} mm deep to clear the girder flange (girder ${host.shape}).` },
        { text: 'Check the coped section for block shear / flexure of the reduced web per SCM Part 9 when the reaction is large relative to the beam.' },
      ],
    })
  }

  steps.push({
    title: 'Verdict',
    lines: [
      { text: c.ok
        ? `All checks pass — ${b.n} × M${b.dia} A325 on a ${t.t}×${Math.round(t.hMm)} mm plate with ${t.weldSizeMm} mm E70 fillets.`
        : 'One or more checks fail — the schedule row is flagged; revise the connection (more bolts, thicker plate or larger weld).' },
    ],
  })
  return steps
}
