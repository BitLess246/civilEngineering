// ════════════════════════════════════════════════════════════════════════
// H · ROADS · SURVEY · ECONOMY (32–38): one plate a bar-half, slid on the beat
// ════════════════════════════════════════════════════════════════════════
/** A plate: slides in from the right on `a`, out to the left on `b`. */
function plateT(el, t, a, b) {
  const i = ease(t, a, a + 0.32, E.outExpo), o = ease(t, b - 0.16, b, E.inExpo)
  el.style.transform = `translateX(${(1 - i) * 1500 - o * 1500}px)`
  el.style.filter = (i < 0.98 || o > 0.02) ? `blur(${(1 - i) * 10 + o * 10}px)` : ''
  show(el, t >= a - 0.01 && t < b + 0.01)
}
function cardsIn(cs, t, a, step = 0.125, dx = 0, dy = 90) {
  cs.forEach((c, k) => { const s0 = a + k * step, p = spring(t - s0, 2.4, 0.55); tf(c.el, `translate(${(1 - clamp(p, 0, 1.1)) * dx}px, ${(1 - clamp(p, 0, 1.1)) * dy}px)`); op(c.el, t > s0 ? 1 : 0); c.set(seg(t, s0, s0 + 0.6), t - s0 - 0.3) })
}
const RDS = scene(32, 38.05, (root) => {
  paperGround(root)
  const P = (n) => Array.from({ length: n }, () => h('div', { class: 'abs ws', style: { left: 0, top: 0, width: W + 'px', height: H + 'px' } }, root))
  const [p1, p2, p3, p4, p5, p6] = P(6)
  // traverse
  const tv = panel(p1, 'd_traverse_0', 150, 80, 860, 'Traverse', 'BOWDITCH (COMPASS) RULE · DMD AREA')
  const tvc = C.traverse.cards.map((c, k) => rcard(p1, c, 1180, 150 + k * 250, 420))
  // curves
  const sc = panel(p2, 'd_simple-curve_0', 110, 90, 860, 'Simple Curve', 'ARC DEFINITION · DEFLECTION ANGLES', { order: 'x' })
  const vc = panel(p2, 'd_vertical-curves_0', 930, 520, 860, 'Vertical Curves', 'AASHTO · SIGHT-DISTANCE LENGTH', { order: 'x' })
  const scc = [rcard(p2, C['simple-curve'].cards[0], 1170, 130, 380), rcard(p2, C['vertical-curves'].cards[0], 160, 640, 380)]
  // signal timing
  const st = panel(p3, 'd_signal-timing_0', 220, 110, 1380, 'Signal Timing', 'WEBSTER · HCM LEVEL OF SERVICE', { order: 'x' })
  const stc = C['signal-timing'].cards.map((c, k) => rcard(p3, c, 280 + k * 470, 680, 420))
  const head = h('div', { class: 'abs', style: { left: '0px', top: '0px', width: '3px', background: '#0f4c92', boxShadow: '0 0 0 1px rgba(255,255,255,.7)' } }, p3)
  // economy
  const cf = panel(p4, 'd_cash-flow-analysis_0', 110, 200, 800, 'Cash-Flow Analysis', 'NPW · IRR · B/C · PAYBACK')
  const inf = panel(p4, 'd_interest-factors_0', 990, 200, 800, 'Interest Factors', 'P/A · F/A · P/F · CAPITALIZED COST')
  const cfc = [rcard(p4, C['cash-flow-analysis'].cards[0], 160, 760, 360), rcard(p4, C['cash-flow-analysis'].cards[1], 560, 760, 360), rcard(p4, C['interest-factors'].cards[0], 1040, 760, 360), rcard(p4, C['interest-factors'].cards[3], 1440, 760, 360)]
  // break-even, with the one point that matters
  const be = panel(p5, 'd_break-even_0', 120, 110, 1160, 'Break-Even Analysis', 'FIXED + VARIABLE COST · REVENUE')
  const bec = C['break-even'].cards.map((c, k) => rcard(p5, c, 1390, 150 + k * 260, 400))
  const bdot = h('div', { class: 'abs', style: { width: '22px', height: '22px', borderRadius: '50%', background: '#f2b53a', marginLeft: '-11px', marginTop: '-11px' } }, p5)
  // projectile
  const pj = panel(p6, 'd_projectile-motion_0', 120, 130, 1160, 'Projectile Motion', 'KINEMATICS · RANGE · APEX · IMPACT', { order: 'x' })
  const pjc = C['projectile-motion'].cards.map((c, k) => rcard(p6, c, 1390, 170 + k * 250, 400))
  const path = [...pj.d.svg.querySelectorAll('path,polyline')].map((e) => [e, e.getTotalLength ? e.getTotalLength() : 0]).sort((a, b) => b[1] - a[1])[0]
  const ball = h('div', { class: 'abs', style: { width: '18px', height: '18px', borderRadius: '50%', background: '#fff', border: '3px solid #0f4c92', marginLeft: '-9px', marginTop: '-9px' } }, p6)
  return { p1, p2, p3, p4, p5, p6, tv, tvc, sc, vc, scc, st, stc, head, cf, inf, cfc, be, bec, bdot, pj, pjc, path, ball }
})
RDS.update = (t) => {
  const s = RDS
  plateT(s.p1, t, 32.0, 33.0); plateT(s.p2, t, 33.0, 34.0); plateT(s.p3, t, 34.0, 35.0)
  plateT(s.p4, t, 35.0, 36.0); plateT(s.p5, t, 36.0, 37.0); plateT(s.p6, t, 37.0, 38.0)
  // traverse: the courses close on the beats
  playPanel(s.tv, t, 32.0, { dy: 0, d0: 0.02, d1: 0.8, span: 0.5 })
  cardsIn(s.tvc, t, 32.35, 0.125, 260, 0)
  tf(s.tv.cd, (s.tv.cd.style.transform || '') + ` scale(${1 + 0.04 * ease(t, 32.0, 33.0, E.lin)})`)
  // curves
  playPanel(s.sc, t, 33.0, { dy: 0, d1: 0.6 }); playPanel(s.vc, t, 33.25, { dx: 300, dy: 0, d1: 0.6 })
  cardsIn(s.scc, t, 33.5, 0.125, 0, 80)
  // signal: phases sweep, the playhead runs the cycle
  playPanel(s.st, t, 34.0, { dy: 0, d1: 0.5 })
  cardsIn(s.stc, t, 34.375, 0.125)
  const sx = 220 + 24 + (40 + 600 * ease(t, 34.3, 34.95, E.lin)) * 1380 / 664
  css(s.head, { left: sx + 'px', top: '200px', height: '330px' }); op(s.head, ease(t, 34.3, 34.4) * (1 - ease(t, 34.9, 35.0)))
  // economy
  playPanel(s.cf, t, 35.0, { dy: 0, d1: 0.55 }); playPanel(s.inf, t, 35.125, { dx: 300, dy: 0, d1: 0.55 })
  cardsIn(s.cfc, t, 35.375, 0.0625)
  // break-even: the lines cross; the crossing is the signal
  playPanel(s.be, t, 36.0, { dy: 0, d1: 0.55, span: 0.6 })
  cardsIn(s.bec, t, 36.5, 0.125, 260, 0)
  const k = 1160 / 640
  css(s.bdot, { left: 120 + 24 + 345 * k + 'px', top: 110 + 78 + 150 * k + 4 + 'px' })
  const bp = spring(t - 36.5, 3, 0.4)
  tf(s.bdot, `scale(${t < 36.5 ? 0 : clamp(bp, 0, 1.3)})`)
  s.bdot.style.boxShadow = `0 0 ${14 + 30 * Math.exp(-(t - 36.5) * 4)}px rgba(242,181,58,.9), 0 0 60px rgba(242,181,58,.3)`
  // projectile: a ball rides the trajectory
  playPanel(s.pj, t, 37.0, { dy: 0, d1: 0.5 })
  cardsIn(s.pjc, t, 37.3, 0.125, 260, 0)
  if (s.path) {
    const [e, L] = s.path, q = e.getPointAtLength(L * ease(t, 37.1, 37.85, E.inOutCubic))
    const sk = 1160 / s.pj.d.vb.width
    css(s.ball, { left: 120 + 24 + q.x * sk + 'px', top: 130 + 78 + q.y * sk + 'px' }); op(s.ball, t > 37.1 ? 1 : 0)
  }
}

// ════════════════════════════════════════════════════════════════════════
// I · THE WORK, SHOWN (38–44): the worked solution, step by step → report
// ════════════════════════════════════════════════════════════════════════
const WK = scene(38, 44.05, (root) => {
  paperGround(root)
  const world = h('div', { class: 'abs ws', style: { left: 0, top: 0, width: W + 'px', height: H + 'px' } }, root)
  const rwS = C['retaining-wall'].steps.slice(0, 6)
  const panelEl = h('div', { class: 'abs sheetc', style: { left: '260px', top: '120px', width: '1400px', boxShadow: '0 30px 90px -40px rgba(15,27,42,.35)' } }, world)
  const hd = h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', padding: '22px 30px', borderBottom: '1px solid #eeece5' } }, panelEl)
  h('span', { class: 'mono', style: { fontSize: '14px', color: '#736d5e' } }, hd, '05')
  h('span', { style: { fontSize: '24px', fontWeight: 700, color: '#0f1b2a' } }, hd, C['retaining-wall'].solTitle)
  const tabs = h('span', { style: { marginLeft: 'auto', display: 'flex', gap: '24px', fontSize: '16px', fontWeight: 600 } }, hd)
  h('span', { style: { color: '#0f4c92', borderBottom: '2px solid #0f4c92', paddingBottom: '3px' } }, tabs, 'Worked solution'); h('span', { style: { color: '#736d5e' } }, tabs, 'Summary only')
  const steps = rwS.map((st, i) => {
    const row = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 220px', gap: '28px', padding: '26px 30px', borderBottom: '1px solid #eeece5' } }, panelEl)
    const lc = h('div', { style: { minWidth: 0 } }, row)
    const ti = h('div', { style: { fontSize: '24px', fontWeight: 700, color: '#0f1b2a', display: 'flex', gap: '14px', alignItems: 'center' } }, lc, `<span class="mono" style="font-size:16px;color:#736d5e">${st.n}</span>${st.title}`)
    const px = h('div', { style: { fontSize: '16px', color: '#5c6675', margin: '8px 0 14px 32px', lineHeight: 1.5, maxWidth: '900px' } }, lc, st.text.length > 170 ? st.text.slice(0, 168).replace(/\s\S*$/, '') + ' …' : st.text)
    const eqWrap = h('div', { style: { marginLeft: '32px', display: 'flex', flexDirection: 'column', gap: '10px', position: 'relative' } }, lc)
    const eqs = st.eqs.slice(0, 4).map((e) => { const b = eqBox(eqWrap, e.html, 0, 0, 24); b.el.style.position = 'relative'; b.el.style.alignSelf = 'flex-start'; return b })
    const rc = h('div', { style: { fontSize: '13px', color: '#5c6675', fontFamily: 'IBM Plex Mono', lineHeight: 1.6, whiteSpace: 'pre-wrap' } }, row)
    const pass = /PASS/.test(st.ref)
    const chip = pass ? h('span', { class: 'chip', style: { background: '#ddefe3', color: '#14603a', border: '1px solid #c2ddcb', fontSize: '12px', padding: '3px 10px', marginBottom: '10px' } }, rc, 'PASS') : null
    h('div', {}, rc, st.ref.replace(/^PASS\s*/, ''))
    return { row, ti, px, eqs, chip }
  })
  // report pages
  const deck = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px', perspective: '2600px' } }, root)
  const PAGES = ['retaining-wall', 'slope', 'beam-design', 'bolted-connection', 'hydraulic-jump', 'traverse', 'foundation']
  const pages = PAGES.map((key, i) => {
    const c = C[key]
    const pg = h('div', { class: 'abs ws', style: { left: W / 2 - 230 + 'px', top: H / 2 - 325 + 'px', width: '460px', height: '650px', background: '#fff', borderRadius: '4px', boxShadow: '0 30px 80px -20px rgba(0,0,0,.55)', overflow: 'hidden', transformStyle: 'preserve-3d' } }, deck)
    h('div', { class: 'mono', style: { position: 'absolute', left: '28px', top: '26px', fontSize: '9px', color: '#5c6675' } }, pg, 'PREPARED BY —')
    h('div', { style: { position: 'absolute', left: '28px', top: '42px', fontSize: '20px', fontWeight: 800, color: '#0f4c92' } }, pg, c.title)
    h('div', { style: { position: 'absolute', left: '28px', right: '28px', top: '76px', height: '1.5px', background: '#0f4c92' } }, pg)
    const m = c.draw[0], dw = Math.min(404, m.w * 250 / m.h)
    const d = drawing(pg, m.id, 28 + (404 - dw) / 2, 96, dw); d.draw(1)
    const eqs = c.steps.flatMap((x) => x.eqs).slice(0, 4).map((e, k) => eqBox(pg, e.html, 28, 370 + k * 60, 12).fit(404))
    eqs.forEach((e) => { e.el.style.padding = '8px 12px'; e.set(1) })
    h('div', { class: 'mono', style: { position: 'absolute', left: '28px', bottom: '20px', fontSize: '8.5px', color: '#736d5e' } }, pg, `ZETA · ${c.title.toUpperCase()} · SHEET ${i + 1} OF ${PAGES.length}`)
    return pg
  })
  const btn = h('div', { class: 'abs', style: { left: W / 2 - 150 + 'px', top: H - 210 + 'px', width: '300px', height: '64px', borderRadius: '10px', background: '#0f4c92', color: '#fff', fontSize: '21px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', overflow: 'hidden', boxShadow: '0 18px 40px -16px rgba(15,76,146,.7)' } }, root, '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/></svg>Export report')
  const ripple = h('div', { class: 'abs', style: { width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(255,255,255,.4)', left: '50%', top: '50%', marginLeft: '-15px', marginTop: '-15px' } }, btn)
  const cursor = h('div', { class: 'abs', style: { width: '30px', height: '30px', zIndex: 9 } }, root, `<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2 L4 19 L8.6 15 L11.6 22 L14.4 20.8 L11.4 14 L17.6 14 Z" fill="#fff" stroke="#0f1b2a" stroke-width="1.4" stroke-linejoin="round"/></svg>`)
  return { world, panelEl, steps, deck, pages, btn, ripple, cursor }
})
WK.update = (t) => {
  const s = WK
  // scroll: hold, then snap to the next step, once a half-bar
  const ys = s.steps.map((st) => st.row.offsetTop)
  const snaps = [38.0, 38.5, 39.0, 39.5, 40.0]
  let y = 0
  snaps.forEach((a, i) => { if (i === 0) return; y += (ys[i] - ys[i - 1]) * ease(t, a, a + 0.38, E.outExpo) })
  const inP = ease(t, 38.0, 38.45)
  // bar 21: lean into the overturning check
  const fsStep = s.steps[3], fsEq = fsStep.eqs[0]
  const z = ease(t, 40.0, 40.4, E.outExpo) - ease(t, 40.9, 41.0, E.inCubic) * 0
  const base = `translateY(${-y + (1 - inP) * 300}px)`
  s.world.style.transformOrigin = '0 0'; tf(s.world, base)
  if (t >= 40.0) {
    const r = fsEq.el.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2
    const ly = cy + y - (1 - inP) * 300
    tf(s.world, `translate(${z * (W / 2 - cx)}px, ${z * (H / 2 - cy)}px) ${base} translate(${cx}px, ${ly}px) scale(${1 + z * 1.1}) translate(${-cx}px, ${-ly}px)`)
  }
  s.steps.forEach((st, i) => {
    const a = snaps[Math.min(i, snaps.length - 1)] + (i === 0 ? 0.05 : 0.12)
    st.eqs.forEach((e, k) => e.set(ease(t, a + k * 0.12, a + k * 0.12 + 0.5, E.lin)))
    op(st.px, ease(t, a - 0.1, a + 0.2))
    if (st.chip) { const cs = spring(t - (a + 0.45), 3.2, 0.45); tf(st.chip, `scale(${t < a + 0.45 ? 0 : 1 + 0.8 * (1 - clamp(cs, 0, 1.2))})`) }
  })
  // bar 21 beat 3: the solution folds down into a page
  const fold = ease(t, 41.0, 41.5, E.inOutExpo)
  s.world.style.opacity = 1 - fold * 0.85
  s.world.style.filter = fold > 0.01 ? `blur(${fold * 6}px)` : ''
  if (fold > 0) s.world.style.transform += ` scale(${1 - fold * 0.6})`
  // the button, the click on bar 22, the pages fan out
  const bi = spring(t - 41.15, 2.4, 0.5)
  op(s.btn, t > 41.15 ? 1 - ease(t, 42.2, 42.45) : 0)
  tf(s.btn, `translateY(${(1 - clamp(bi, 0, 1.1)) * 120}px) scale(${t > 41.9 && t < 42.1 ? 0.96 : 1})`)
  const rp = seg(t, 42.0, 42.45); tf(s.ripple, `scale(${E.outCubic(rp) * 14})`); op(s.ripple, t >= 42.0 ? (1 - rp) * 0.7 : 0)
  const cx = lerp(1500, W / 2 + 40, ease(t, 41.45, 41.9, E.inOutCubic)), cy = lerp(1000, H - 175, ease(t, 41.45, 41.9, E.inOutCubic))
  css(s.cursor, { left: cx + 'px', top: cy + 'px' }); op(s.cursor, t > 41.4 && t < 42.4 ? 1 : 0)
  tf(s.cursor, `scale(${t > 41.92 && t < 42.08 ? 0.85 : 1})`)
  const n = s.pages.length
  s.pages.forEach((pg, i) => {
    const a = 42.05 + i * 0.07
    const p = ease(t, a, a + 0.6)
    const k = i - (n - 1) / 2
    const fan = { x: k * 250, y: Math.abs(k) * 30 - 10, z: -Math.abs(k) * 60, rz: k * 5, ry: -k * 6 }
    const dolly = ease(t, 42.6, 43.6, E.inOutCubic)
    const out = ease(t, 43.6 + (n - 1 - i) * 0.03, 43.98, E.inExpo)
    const x = fan.x * p + dolly * -k * 30, yy = (1 - p) * 500 + fan.y * p - out * 1300
    pg.style.transform = `translate3d(${x}px, ${yy}px, ${fan.z * p + dolly * 160}px) rotateZ(${fan.rz * p}deg) rotateY(${fan.ry * p + dolly * 8}deg) scale(${lerp(0.4, 1, p)})`
    op(pg, t >= a ? 1 : 0)
  })
}
