// ════════════════════════════════════════════════════════════════════════
// C · CONCRETE (8–14): beam → column → footing, one workspace each
// ════════════════════════════════════════════════════════════════════════
/** Fields in on 16ths, drawing strokes on, checks drop on the beats. */
function playWS(ws, t, t0, o = {}) {
  const fstep = o.fstep ?? 0.0625
  ws.fs.forEach((f, i) => {
    const a = t0 + i * fstep
    const p = ease(t, a, a + 0.45)
    tf(f.el, `translateX(${(1 - p) * -60}px)`); op(f.el, p)
    f.set(ease(t, a + 0.08, a + 0.32, E.lin), t > a && t < a + 0.3)
  })
  ws.secs.forEach((s) => { const a = t0 + s.i * fstep - 0.05; s.el.style.clipPath = `inset(0 ${100 - 100 * ease(t, a, a + 0.5)}% 0 0)` })
  const tp = ease(t, t0 - 0.05, t0 + 0.4)
  tf(ws.title, `translateY(${(1 - tp) * 40}px)`); op(ws.title, tp)
  op(ws.sub, ease(t, t0 + 0.2, t0 + 0.5)); ws.sub.textContent = scramble(ws._sub || '', seg(t, t0 + 0.15, t0 + 0.6), 7)
  ws.dr.forEach((d, k) => d.draw(ease(t, (o.d0 ?? t0 + 0.3) + k * 0.25, (o.d1 ?? t0 + 1.5) + k * 0.25, E.inOutCubic), o.span ?? 0.3))
  ws.cards.forEach((c, k) => {
    const a = (o.c0 ?? t0 + 1.0) + k * (o.cstep ?? 0.25)
    const p = spring(t - a, 2.4, 0.55)
    tf(c.el, `translateY(${(1 - clamp(p, 0, 1.1)) * 80}px)`); op(c.el, clamp((t - a) * 6))
    c.set(seg(t, a, a + 0.6), t - a - 0.3)
  })
}
const CON = scene(8, 14.05, (root) => {
  paperGround(root)
  const world = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px' } }, root)
  const bm = workspace(world, 'beam-design', 0, 0, { nf: 14, twoCol: true, sheetH: 660, nc: 4, sub: 'ACI 318-14 · NSCP 2015' })
  bm._sub = 'SRRB · ACI 318-14 §22.2'
  const bs = C['beam-design'].steps
  const eqs = [bs[2].eqs[0], bs[3].eqs[1], bs[3].eqs[2]].map((e, k) => eqBox(bm.sheet, e.html, 30, 440 + k * 70, 17).fit(780))
  const col = workspace(world, 'column-design', 2120, 0, { nf: 11, twoCol: true, sheetH: 660, dw: [520], dx: [160], dy: [24], sub: '' })
  col._sub = 'TIED · BIAXIAL · ACI 318-14 §22.4'
  const ft = workspace(world, 'foundation', 2120, 1280, { nf: 12, twoCol: true, sheetH: 660, nc: 4, dw: [600], dx: [120], dy: [20] })
  ft._sub = 'ISOLATED PAD · TWO-WAY SHEAR §22.6'
  // triptych
  const tri = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px', perspective: '2400px' } }, root)
  const TRI = [['d_beam-design_0', 'RC BEAM', '4-⌀20 · ⌀10 @ 220', 0.95, [16, 30, 270, 400]], ['d_column-design_0', 'RC COLUMN', '8-⌀28 · ρ 3.08 %', 0.99], ['d_punching-shear_0', 'PUNCHING SHEAR', 'b₀ 2668 mm · 85.7 %', 0.86]]
  const tc = TRI.map(([id, nm, sub, , crop], k) => {
    const cd = card(tri, 150 + k * 560, 170, 500, 700, { boxShadow: '0 30px 80px -30px rgba(15,27,42,.45)', overflow: 'hidden' })
    const meta = crop ? { w: crop[2], h: crop[3] } : DRAW(id)
    const dw = Math.min(440, meta.w * 520 / meta.h)
    const d = drawing(cd, id, (500 - dw) / 2, 40, dw, 'xy', crop)
    h('div', { class: 'abs mono', style: { left: '26px', bottom: '58px', fontSize: '13px', color: '#0f4c92' } }, cd, nm)
    h('div', { class: 'abs', style: { left: '26px', bottom: '24px', fontSize: '19px', fontWeight: 700, color: '#0f1b2a', fontFamily: 'IBM Plex Mono' } }, cd, sub)
    const chip = h('div', { class: 'abs chip', style: { right: '22px', bottom: '24px', background: '#ddefe3', color: '#14603a', border: '1px solid #c2ddcb' } }, cd, 'PASS')
    return { cd, d, chip }
  })
  const wipe = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px', background: '#0b1420' } }, root)
  return { world, bm, eqs, col, ft, tri, tc, wipe }
})
CON.update = (t) => {
  const s = CON
  const k = [
    [8.0, 330, 470, 1.7], [8.95, 340, 520, 1.58, E.lin], [9.35, 960, 560, 1.0, E.inOutExpo], [9.95, 960, 540, 1.02, E.lin],
    [10.12, 1190, 420, 2.05, E.outExpo], [10.55, 1170, 430, 2.12, E.lin], [10.62, 700, 640, 1.45, E.outExpo], [10.88, 720, 630, 1.5, E.lin],
    [11.12, 2120 + 960, 560, 1.0, E.inOutExpo], [11.95, 2120 + 960, 540, 1.04, E.lin],
    [12.15, 2120 + 960, 1280 + 560, 1.0, E.inOutExpo], [12.95, 2120 + 980, 1280 + 540, 1.05, E.lin],
  ]
  cam(s.world, t, k)
  // whip blur on the pans
  const whip = Math.max(Math.exp(-(((t - 11.0) / 0.07) ** 2)), Math.exp(-(((t - 12.05) / 0.07) ** 2)), Math.exp(-(((t - 9.15) / 0.12) ** 2)) * 0.4)
  s.world.style.filter = whip > 0.02 ? `blur(${whip * 10}px)` : ''
  playWS(s.bm, t, 8.0, { d0: 8.35, d1: 9.5, c0: 9.0 })
  s.eqs.forEach((e, i) => { const a = 10.0 + i * 0.22; e.set(ease(t, a, a + 0.55, E.lin)); op(e.el, t >= a ? 1 : 0) })
  playWS(s.col, t, 10.95, { fstep: 0.04, d0: 11.05, d1: 11.8, c0: 11.35 })
  playWS(s.ft, t, 11.98, { fstep: 0.04, d0: 12.05, d1: 12.8, c0: 12.35, cstep: 0.125 })
  // triptych on bar 7 beat 3
  const triOn = t >= 12.98
  show(s.tri, triOn); op(s.world, triOn ? 1 - ease(t, 12.98, 13.2) : 1)
  s.tc.forEach((c, i) => {
    const a = 13.0 + i * 0.09
    const p = ease(t, a, a + 0.6)
    const ex = ease(t, 13.72 + i * 0.04, 13.98, E.inExpo)
    tf(c.cd, `translateY(${(1 - p) * 700 - ex * 1200}px) rotateX(${(1 - p) * 35}deg) rotateZ(${(1 - p) * (i - 1) * 6}deg)`)
    c.d.draw(1)
    const cs = spring(t - (13.4 + i * 0.125), 3.2, 0.45)
    tf(c.chip, `scale(${t < 13.4 + i * 0.125 ? 0 : 1 + 0.8 * (1 - clamp(cs, 0, 1.2))})`)
  })
  // the dark wipe comes up from below into the steel section
  const w = ease(t, 13.78, 14.0, E.inExpo)
  tf(s.wipe, `translateY(${(1 - w) * H}px)`)
}

// ════════════════════════════════════════════════════════════════════════
// D · STEEL (14–18): sheets on a dark stage, in depth
// ════════════════════════════════════════════════════════════════════════
const STL = scene(14, 18.05, (root) => {
  darkGround(root)
  const stage = h('div', { class: 'abs ws', style: { left: 0, top: 0, width: W + 'px', height: H + 'px', perspective: '2200px' } }, root)
  const mk = (id, w, title, sub) => {
    const meta = Object.values(C).flatMap((x) => x.draw).find((d) => d.id === id)
    const hh = meta.h * w / meta.w
    const cd = card(stage, 0, 0, w + 60, hh + 110, { boxShadow: '0 40px 120px -30px rgba(0,0,0,.75)', transformStyle: 'preserve-3d', overflow: 'hidden' })
    h('div', { class: 'abs', style: { left: '30px', top: '24px', fontSize: '22px', fontWeight: 800, color: '#0f1b2a' } }, cd, title)
    h('div', { class: 'abs mono', style: { left: '30px', top: '56px', fontSize: '11px', color: '#0f4c92' } }, cd, sub)
    const d = drawing(cd, id, 30, 86, w, 'x')
    return { cd, d, w: w + 60, h: hh + 110 }
  }
  const bolt = mk('d_bolted-connection_0', 820, 'Bolted Connection', 'AISC 360-16 §J3.6 · §J3.10 · §J4.3')
  const weld = mk('d_welded-connection_0', 840, 'Eccentric Weld Group', 'AISC 360-16 §J2.4 · ELASTIC METHOD')
  const weldOk = drawing(weld.cd, 'd_welded-connection_ok_0', 30, 86, 840)
  const sec = mk('d_steel_beam_ok_1', 400, 'W460x74', 'A992 · Fy 345 MPa')
  const span = mk('d_steel_beam_ok_0', 760, 'Steel Beam', 'AISC 360-16 §F2 · §G2.1')
  const rail = h('div', { class: 'abs', style: { left: '1420px', top: '170px', width: '380px', display: 'flex', flexDirection: 'column', gap: '14px' } }, stage)
  const bc = C['bolted-connection'].cards.map((c) => rcard(rail, c, null, null, 380))
  const wF = rcard(stage, C['welded-connection'].cards[0], 1420, 300, 380)
  const wP = rcard(stage, C['welded-connection_ok'].cards[0], 1420, 300, 380)
  const legF = field(stage, { label: 'Fillet leg <i>w</i>', value: '6', unit: 'mm' }, 1420, 190, 380)
  const sc = C['steel_beam_ok'].cards.map((c, k) => rcard(stage, c, 1420, 170 + k * 200, 380))
  return { stage, bolt, weld, weldOk, sec, span, rail, bc, wF, wP, legF, sc }
})
STL.update = (t) => {
  const s = STL
  const E1 = E.outExpo, E2 = E.inOutExpo
  // every sheet has its own path through depth; at bar 9 beat 3 they line up
  const ROW = (i, c) => ({ x: 330 + i * 420 - c.w / 2, y: 560 - c.h / 2, z: 0, ry: 0, rz: (i - 1.5) * 2.5, s: 0.46, o: 1 })
  place3(s.bolt.cd, kf(t, [[14.0, { x: 1000, y: 170, z: -900, ry: -48, o: 1 }], [14.75, { x: 330, y: 150, z: 0, ry: 0 }, E1], [14.95, { x: 330, y: 150, z: 0, ry: 0 }], [15.4, { x: -420, y: 180, z: -900, ry: 30 }, E2], [16.95, { x: -420, y: 180, z: -900, ry: 30 }], [17.35, ROW(0, s.bolt), E2]]))
  place3(s.weld.cd, kf(t, [[14.95, { x: 1200, y: 150, z: -800, ry: -40, o: 0 }], [14.96, { x: 1200, y: 150, z: -800, ry: -40, o: 1 }], [15.5, { x: 300, y: 140, z: 0, ry: 0 }, E1], [15.95, { x: 300, y: 140, z: 0, ry: 0 }], [16.4, { x: -360, y: 200, z: -800, ry: 28 }, E2], [16.95, { x: -360, y: 200, z: -800, ry: 28 }], [17.35, ROW(1, s.weld), E2]]))
  place3(s.sec.cd, kf(t, [[15.95, { x: 1300, y: 110, z: -700, ry: -50, o: 0 }], [15.96, { x: 1300, y: 110, z: -700, ry: -50, o: 1 }], [16.5, { x: 140, y: 110, z: 0, ry: 0 }, E1], [16.95, { x: 150, y: 110, z: 0, ry: 0 }], [17.35, ROW(2, s.sec), E2]]))
  place3(s.span.cd, kf(t, [[16.1, { x: 1400, y: 520, z: -500, ry: -30, o: 0 }], [16.11, { x: 1400, y: 520, z: -500, ry: -30, o: 1 }], [16.65, { x: 560, y: 330, z: 60, ry: 0 }, E1], [16.95, { x: 570, y: 330, z: 60, ry: 0 }], [17.35, ROW(3, s.span), E2]]))
  s.bolt.d.draw(ease(t, 14.05, 15.0, E.inOutCubic))
  const rOut = (a) => ease(t, a, a + 0.22, E.inExpo) * 600
  s.bc.forEach((c, k) => { const a = 14.5 + k * 0.125, p = spring(t - a, 2.4, 0.55); tf(c.el, `translateX(${(1 - clamp(p, 0, 1.1)) * 500 + rOut(14.92)}px)`); op(c.el, t > a ? 1 : 0); c.set(seg(t, a, a + 0.6), t - a - 0.25) })
  // weld: fails at 6 mm, re-typed to 12, passes — the drawing follows the inputs
  s.weld.d.draw(ease(t, 15.0, 15.7, E.inOutCubic))
  const flip = ease(t, 15.62, 15.82, E.inOutCubic)
  op(s.weldOk.box, flip >= 0.5 ? 1 : 0); op(s.weld.d.box, flip >= 0.5 ? 0 : 1)
  const wcIn = spring(t - 15.0, 2.4, 0.55)
  for (const [c, on] of [[s.wF, flip < 0.5], [s.wP, flip >= 0.5]]) {
    show(c.el, on)
    tf(c.el, `translateX(${(1 - clamp(wcIn, 0, 1.1)) * 500 + rOut(15.92)}px) perspective(900px) rotateX(${(flip < 0.5 ? flip : flip - 1) * 180}deg)`)
    c.set(c === s.wF ? seg(t, 15.0, 15.5) : 1, c === s.wF ? t - 15.3 : t - 15.72)
  }
  op(s.wF.el, t > 15 ? 1 : 0)
  tf(s.legF.el, `translateX(${(1 - clamp(wcIn, 0, 1.1)) * 500 + rOut(15.92)}px)`); op(s.legF.el, t > 15 ? 1 : 0)
  s.legF.f.value = t < 15.45 ? '6' : '12'
  s.legF.set(t < 15.45 ? 1 : ease(t, 15.45, 15.6, E.lin), t > 15.35 && t < 15.75)
  // the section, big, and its span
  s.sec.d.draw(ease(t, 16.0, 16.8, E.inOutCubic)); s.span.d.draw(ease(t, 16.15, 16.9, E.inOutCubic))
  s.sc.forEach((c, k) => { const a = 16.4 + k * 0.125, p = spring(t - a, 2.4, 0.55); tf(c.el, `translateX(${(1 - clamp(p, 0, 1.1)) * 500 + rOut(16.9)}px)`); op(c.el, t > a ? 1 : 0); c.set(seg(t, a, a + 0.6), t - a - 0.25) })
  // exit: everything tips edge-on into the paper of the next section
  const ex = ease(t, 17.6, 18.0, E.inExpo)
  s.stage.style.transform = `perspective(2200px) rotateX(${ex * 70}deg) translateY(${ex * -300}px) scale(${1 - ex * 0.3})`
  op(s.stage, 1 - ease(t, 17.93, 18.0))
}
