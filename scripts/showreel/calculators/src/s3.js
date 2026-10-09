// ════════════════════════════════════════════════════════════════════════
// E · GEOTECHNICAL (18–24): the circle search, the wall, the pile
// ════════════════════════════════════════════════════════════════════════
const GROUND = [[64, 190.5], [170.3, 190.5], [400.5, 323.4], [560, 323.4]]
const gy = (x) => { for (let i = 1; i < GROUND.length; i++) { const [x0, y0] = GROUND[i - 1], [x1, y1] = GROUND[i]; if (x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0) } return 323.4 }
/** The part of a trial circle inside the soil mass, as a path. */
function arcIn(cx, cy, r) {
  let d = '', on = false, best = '', cur = ''
  for (let k = 0; k <= 360; k++) {
    const a = Math.PI * k / 180, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a)
    const inside = x > 64 && x < 560 && y >= gy(x) && y < 350
    if (inside) { cur += (on ? ' L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1); on = true }
    else if (on) { if (cur.length > best.length) best = cur; cur = ''; on = false }
  }
  if (cur.length > best.length) best = cur
  return best
}
const GEO = scene(18, 24.1, (root) => {
  paperGround(root)
  const world = h('div', { class: 'abs ws', style: { left: 0, top: 0, width: W + 'px', height: H + 'px' } }, root)
  // slope, big
  const sl = drawing(world, 'd_slope_0', 120, 150, 1240)
  const svg = sl.svg, NS = 'http://www.w3.org/2000/svg'
  const all = [...svg.querySelectorAll('*')]
  const red = (e) => /200, 60, 60/.test(e.getAttribute('style') || '') || /200,60,60/.test(e.getAttribute('fill') || '')
  const crit = all.filter((e) => red(e) && !(e.tagName === 'text' && /FS/.test(e.textContent)))
  const slices = all.filter((e) => e.tagName === 'line' && /92, 102, 117/.test(e.getAttribute('style') || '') && e.getAttribute('x1') === e.getAttribute('x2') && +e.getAttribute('x1') < 400)
  const fsT = all.find((e) => e.tagName === 'text' && /FS 2\.04/.test(e.textContent))
  const rest = all.filter((e) => !crit.includes(e) && !slices.includes(e) && e !== fsT && e.tagName !== 'g' && e.tagName !== 'tspan')
  const fill = crit.find((e) => e.tagName === 'path' && /0\.16/.test(e.getAttribute('style') || ''))
  const arc = crit.find((e) => e.tagName === 'path' && e !== fill)
  const arcL = arc.getTotalLength()
  const trials = h('g', {}, null); svg.insertBefore(trials, svg.firstChild.nextSibling)
  const dots = h('g', {}, null); svg.appendChild(dots)
  const T = []
  for (let k = 0; k < 10; k++) {
    const cx = 290 + hash(k, 3) * 90, cy = 70 + hash(k, 5) * 110
    const r = Math.hypot(400 + (hash(k, 7) - 0.5) * 70 - cx, 323 - cy) + 6
    T.push({ p: h('path', { d: arcIn(cx, cy, r), fill: 'none', stroke: '#0f4c92', 'stroke-width': 1.4 }, trials), c: h('circle', { cx, cy, r: 2.6, fill: '#0f4c92' }, dots), cx, cy })
  }
  const grid = []
  for (let i = 0; i < 9; i++) for (let j = 0; j < 6; j++) grid.push(h('circle', { cx: 268 + i * 16, cy: 64 + j * 22, r: 1.3, fill: 'rgba(15,76,146,.45)' }, dots))
  const counter = h('div', { class: 'abs', style: { left: '120px', top: '96px' } }, world)
  const cN = h('div', { style: { fontFamily: 'IBM Plex Mono', fontWeight: 700, fontSize: '54px', color: '#0f1b2a', fontVariantNumeric: 'tabular-nums', lineHeight: 1 } }, counter, '0')
  const cL = h('div', { class: 'mono', style: { fontSize: '13px', color: '#5c6675', marginTop: '10px' } }, counter, 'TRIAL CIRCLES · BISHOP SIMPLIFIED')
  const over = h('div', { class: 'abs ws', style: { left: 0, top: 0, width: W + 'px', height: H + 'px' } }, root)
  const fsBig = h('div', { class: 'abs disp', style: { left: '1420px', top: '110px', fontSize: '200px', color: '#0f4c92', fontFamily: 'IBM Plex Mono', fontWeight: 700, letterSpacing: '-.04em', fontVariantNumeric: 'tabular-nums' } }, over, '')
  const fsL = h('div', { class: 'abs mono', style: { left: '1428px', top: '330px', fontSize: '14px', color: '#5c6675' } }, over, 'FS · CRITICAL CIRCLE')
  const scard = rcard(over, C.slope.cards[0], 1420, 400, 380)
  const scard2 = rcard(over, C.slope.cards[1], 1420, 640, 380)
  // retaining wall
  const rw = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px' } }, root)
  const rwp = panel(rw, 'd_retaining-wall_0', 160, 70, 700, 'Cantilever Retaining Wall', 'RANKINE · NSCP 2015 §307 · ACI 318-14', { order: 'y' })
  const rwRail = h('div', { class: 'abs', style: { left: '1000px', top: '120px', width: '760px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' } }, rw)
  const rwc = C['retaining-wall'].cards.slice(0, 4).map((c) => rcard(rwRail, c, null, null, 372))
  const rwEq = eqBox(rw, C['retaining-wall'].steps[3].eqs[0].html, 1000, 800, 26).fit(760)
  // lateral pile + settlement
  const lp = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px' } }, root)
  const lpp = panel(lp, 'd_lateral-pile_0', 110, 160, 1000, 'Laterally Loaded Pile', 'BROMS · p-y (MATLOCK) · FINITE DIFFERENCE', { order: 'x' })
  const stp = panel(lp, 'd_settlement_1', 1210, 250, 560, 'Settlement', 'BOUSSINESQ · 2:1 · TERZAGHI', { order: 'x' })
  // the quad
  const qd = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px' } }, root)
  const Q = [['d_pile-capacity_0', 'Pile Capacity', 'α METHOD · MEYERHOF'], ['d_earth-pressure_0', 'Lateral Earth Pressure', 'RANKINE · COULOMB · M-O'], ['d_bearing-capacity_0', 'Bearing Capacity', 'MEYERHOF · HANSEN · VESIĆ'], ['d_settlement_0', 'Foundation Settlement', 'STRESS DECAY WITH DEPTH']]
  const quad = Q.map(([id, tt, sb], k) => {
    const m = DRAW(id), w = Math.min(760, m.w * 360 / m.h)
    return panel(qd, id, 120 + (k % 2) * 860 + (760 - w) / 2, 70 + Math.floor(k / 2) * 490, w, tt, sb)
  })
  return { world, over, sl, crit, slices, fsT, rest, fill, arc, arcL, T, grid, cN, counter, fsBig, fsL, scard, scard2, rw, rwp, rwc, rwEq, lp, lpp, stp, qd, quad }
})
GEO.update = (t) => {
  const s = GEO
  // ground and annotations
  s.rest.forEach((e) => { e.style.opacity = ease(t, 18.0, 18.2) })
  const gp = ease(t, 18.0, 18.4, E.outExpo)
  s.sl.box.style.clipPath = `inset(0 ${100 - 100 * gp}% 0 0)`
  // ten ticks, ten trial circles; each lingers a beat then fades
  s.T.forEach((tr, k) => {
    const a = 18.6 + k * 0.125
    const L = tr.p.getTotalLength ? tr.p.getTotalLength() : 600
    setLine(tr.p, ease(t, a, a + 0.12, E.outCubic), L)
    tr.p.style.opacity = t < a ? 0 : Math.max(0.12, 1 - (t - a) * 2.4) * (1 - ease(t, 19.85, 20.0))
    tr.c.style.opacity = t < a ? 0 : (1 - ease(t, 19.85, 20.0))
  })
  s.grid.forEach((g, i) => { g.style.opacity = ease(t, 18.55 + (i % 9) * 0.02 + Math.floor(i / 9) * 0.03, 18.75 + (i % 9) * 0.02) * (1 - ease(t, 19.9, 20.1)) })
  s.cN.textContent = Math.round(3476 * E.outCubic(seg(t, 18.55, 19.95))).toLocaleString('en-US')
  op(s.counter, ease(t, 18.4, 18.6))
  // bar 11: the critical circle snaps in
  const on = t >= 20.0
  s.crit.forEach((e) => { e.style.opacity = on ? 1 : 0 })
  setLine(s.arc, ease(t, 20.0, 20.3, E.outExpo), s.arcL)
  s.fill.style.opacity = ease(t, 20.1, 20.4)
  s.slices.forEach((e, i) => { e.style.opacity = ease(t, 20.12 + i * 0.012, 20.25 + i * 0.012) })
  s.fsT.style.opacity = ease(t, 20.45, 20.6)
  const fsP = ease(t, 20.0, 20.7, E.outExpo)
  s.fsBig.textContent = on ? (2.04 * fsP).toFixed(2) : ''
  op(s.fsBig, on ? 1 : 0); op(s.fsL, ease(t, 20.1, 20.3))
  const cp = spring(t - 20.3, 2.4, 0.55)
  tf(s.scard.el, `translateX(${(1 - clamp(cp, 0, 1.1)) * 500}px)`); op(s.scard.el, t > 20.3 ? 1 : 0); s.scard.set(seg(t, 20.3, 20.9), t - 20.55)
  const cp2 = spring(t - 20.5, 2.4, 0.55)
  tf(s.scard2.el, `translateX(${(1 - clamp(cp2, 0, 1.1)) * 500}px)`); op(s.scard2.el, t > 20.5 ? 1 : 0); s.scard2.set(seg(t, 20.5, 21.0), t - 20.75)
  // camera: settles, then leans into the slip mass on the critical circle
  cam(s.world, t, [[18.0, 960, 560, 1.06], [19.9, 960, 540, 1.0, E.lin], [20.15, 700, 640, 1.32, E.outExpo], [20.9, 760, 610, 1.22, E.inOutCubic]])
  // bar 11 beat 3 → the wall (whip)
  const wIn = t >= 20.95
  show(s.world, t < 21.08); show(s.over, t < 21.08); tf(s.over, `translateX(${-ease(t, 20.95, 21.12, E.inOutExpo) * 1400}px)`); show(s.rw, wIn && t < 22.05); show(s.lp, t >= 21.98 && t < 23.05); show(s.qd, t >= 22.98)
  const wh = ease(t, 20.95, 21.12, E.inOutExpo)
  s.world.style.transform += ` translateX(${-wh * 1400}px)`; s.world.style.filter = `blur(${Math.sin(wh * Math.PI) * 12}px)`
  if (wIn) {
    tf(s.rw, `translateX(${(1 - wh) * 1400}px)`); s.rw.style.filter = `blur(${Math.sin(wh * Math.PI) * 12}px)`
    playPanel(s.rwp, t, 20.98, { dy: 0, d0: 0.05, d1: 0.7 })
    s.rwc.forEach((c, k) => { const a = 21.25 + k * 0.125, p = spring(t - a, 2.4, 0.55); tf(c.el, `translateY(${(1 - clamp(p, 0, 1.1)) * 90}px)`); op(c.el, t > a ? 1 : 0); c.set(seg(t, a, a + 0.6), t - a - 0.3) })
    s.rwEq.set(ease(t, 21.55, 21.95, E.lin)); op(s.rwEq.el, t > 21.55 ? 1 : 0)
    const rz = ease(t, 21.0, 22.0, E.lin)
    tf(s.rwp.cd, (s.rwp.cd.style.transform || '') + ` scale(${1 + rz * 0.03})`)
  }
  // bar 12: the pile; sub-cut on beat 2 to the settlement curve
  if (t >= 21.98) {
    const sp = ease(t, 21.98, 22.2, E.outExpo)
    tf(s.lp, `translateY(${(1 - sp) * 1080}px)`)
    playPanel(s.lpp, t, 22.0, { dy: 0, d1: 0.65 })
    playPanel(s.stp, t, 22.25, { dx: 300, dy: 0 })
    const z = ease(t, 22.5, 22.65, E.outExpo) - ease(t, 22.85, 22.98, E.inOutCubic)
    tf(s.lp, `translateY(${(1 - sp) * 1080}px) translate(${-z * 820}px, ${-z * 240}px) scale(${1 + z * 0.6})`)
    s.lp.style.transformOrigin = '0 0'
  }
  // bar 12 beat 3: four sheets on the 16ths, then through them
  if (t >= 22.98) {
    s.quad.forEach((p, k) => playPanel(p, t, 23.0 + k * 0.125, { dx: (k % 2 ? 260 : -260), dy: 0, d1: 0.5, f: 2.8 }))
    const thru = ease(t, 23.65, 24.05, E.inExpo)
    tf(s.qd, `scale(${1 + thru * 3})`); s.qd.style.transformOrigin = '50% 50%'; op(s.qd, 1 - ease(t, 23.85, 24.05))
    s.qd.style.filter = `blur(${thru * 8}px)`
  }
}

// ════════════════════════════════════════════════════════════════════════
// F · BREAK (24–26): every number has a clause
// ════════════════════════════════════════════════════════════════════════
const REFS = (() => {
  const out = new Set()
  for (const c of Object.values(C)) for (const st of c.steps) {
    const r = st.ref.replace(/^PASS\s*|^FAIL\s*/, '').trim()
    if (r && r.length < 44 && /§|\(\d{4}\)|FHWA|AASHTO|NSCP|AISC|ACI/.test(r)) out.add(r)
  }
  return [...out]
})()
const BRK = scene(24, 26.05, (root) => {
  darkGround(root)
  const hd = h('div', { class: 'abs', style: { left: '130px', top: '380px' } }, root)
  const lines = ['Every number', 'has a clause.'].map((x, i) => h('div', { class: 'disp', style: { fontSize: '150px', color: i ? '#6ba4dc' : '#f2f5f9', height: '158px', overflow: 'hidden', whiteSpace: 'nowrap', paddingBottom: '18px', marginBottom: '-18px', boxSizing: 'content-box' } }, hd, `<span style="display:inline-block">${x}</span>`))
  const board = h('div', { class: 'abs', style: { left: '1120px', top: '0px', width: '700px', height: H + 'px', overflow: 'hidden', maskImage: 'linear-gradient(transparent, #000 30%, #000 70%, transparent)', WebkitMaskImage: 'linear-gradient(transparent, #000 30%, #000 70%, transparent)' } }, root)
  const list = h('div', { class: 'abs', style: { left: '0px', top: '0px', width: '700px' } }, board)
  const tgt = REFS.find((r) => /^ACI 318-14 §22\.2$/.test(r)) || REFS[0]
  const others = REFS.filter((r) => r !== tgt).map((r, i) => [hash(i, 17), r]).sort((a, b) => a[0] - b[0]).map((x) => x[1])
  const order = [...others.slice(0, 38), tgt, ...others.slice(38, 46)]
  const target = 38
  const rows = order.map((r, i) => h('div', { class: 'mono', style: { height: '64px', lineHeight: '64px', fontSize: '27px', textTransform: 'none', letterSpacing: '.02em', color: '#9eb0c5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, list, r))
  const mark = h('div', { class: 'abs', style: { left: '1086px', top: H / 2 - 7 + 'px', width: '14px', height: '14px', borderRadius: '50%', background: '#f2b53a' } }, root)
  const bracket = h('div', { class: 'abs', style: { left: '1110px', top: H / 2 - 34 + 'px', width: '720px', height: '68px', border: '1px solid rgba(242,181,58,.6)', borderRadius: '8px' } }, root)
  return { hd, lines, board, list, rows, target, mark, bracket }
})
BRK.update = (t) => {
  const s = BRK
  ;[24.0, 24.5].forEach((a, i) => { const p = ease(t, a, a + 0.45); tf(s.lines[i].firstChild, `translateY(${(1 - p) * 150}px)`) })
  // the board spins down and lands on one clause
  const p = E.outQuint(seg(t, 24.0, 25.5))
  const idx = s.target * p
  tf(s.list, `translateY(${H / 2 - 32 - idx * 64}px)`)
  s.list.style.filter = `blur(${(1 - p) * 4}px)`
  s.rows.forEach((r, i) => { const d = Math.abs(i - idx); r.style.color = d < 0.5 && p > 0.97 ? '#f2f5f9' : `rgba(158,176,197,${Math.max(0.25, 1 - d * 0.18)})` })
  const land = ease(t, 25.45, 25.6)
  tf(s.mark, `scale(${land})`); s.mark.style.boxShadow = `0 0 ${12 + 26 * land}px rgba(242,181,58,.85)`
  op(s.bracket, land); tf(s.bracket, `scaleX(${0.9 + 0.1 * land})`)
  const out = ease(t, 25.72, 26.0, E.inExpo)
  for (const e of [s.hd, s.board, s.mark, s.bracket]) { e.style.transformOrigin = `${W / 2 - (e.offsetLeft || 0)}px ${H / 2 - (e.offsetTop || 0)}px`; e.style.scale = 1 - out * 0.85; e.style.opacity = 1 - out }
}

// ════════════════════════════════════════════════════════════════════════
// G · WATER (26–32): the jump, the tank, the pipe, then everything wet
// ════════════════════════════════════════════════════════════════════════
const WAT = scene(26, 32.05, (root) => {
  paperGround(root)
  const world = h('div', { class: 'abs ws', style: { left: 0, top: 0, width: W + 'px', height: H + 'px' } }, root)
  const hj = drawing(world, 'd_hydraulic-jump_0', 90, 150, 1260, 'x')
  const hsvg = hj.svg
  const water = [...hsvg.querySelectorAll('polygon')].find((e) => /15, 76, 146, 0\.2/.test(e.getAttribute('style') || ''))
  const bub = [...hsvg.querySelectorAll('circle')]
  const hjc = C['hydraulic-jump'].cards.map((c, k) => rcard(world, c, 1440, 170 + k * 250, 380))
  const hjT = h('div', { class: 'abs', style: { left: '100px', top: '80px', fontSize: '40px', fontWeight: 800, color: '#0f1b2a', letterSpacing: '-.02em' } }, world, 'Hydraulic Jump')
  const hjS = h('div', { class: 'abs mono', style: { left: '104px', top: '134px', fontSize: '12px', color: '#0f4c92' } }, world, 'MOMENTUM · BÉLANGER · y₂/y₁ = ½(√(1+8Fr₁²) − 1)')
  // the tank and the pipe
  const tk = h('div', { class: 'abs ws', style: { left: 0, top: 0, width: W + 'px', height: H + 'px' } }, root)
  const tkp = panel(tk, 'd_water-tank_0', 120, 100, 760, 'Circular Water Tank', 'RING TENSION · IS 3370 / ACI 350', { order: 'r' })
  const pfp = panel(tk, 'd_pipe-flow_0', 1020, 70, 700, 'Pipe Flow', 'DARCY–WEISBACH · COLEBROOK', { order: 'x' })
  const gvp = panel(tk, 'd_gvf-profiles_0', 1020, 540, 700, 'GVF Profiles', 'STANDARD STEP · M1 CURVE', { order: 'x' })
  // six-up
  const sx = h('div', { class: 'abs ws', style: { left: 0, top: 0, width: W + 'px', height: H + 'px' } }, root)
  const SIX = [['d_curved-gate_0', 'Curved Gate'], ['d_weir-flow_0', 'Weir Flow'], ['d_buoyancy_0', 'Buoyancy & Stability'], ['d_culvert_0', 'Culvert Hydraulics'], ['d_muskingum_0', 'Muskingum Routing'], ['d_detention_0', 'Detention Pond'], ['d_do-sag_0', 'DO Sag'], ['d_hydrostatic-force_0', 'Hydrostatic Force']]
  const six = SIX.map(([id, tt], k) => { const m = DRAW(id), w = Math.min(520, m.w * 300 / m.h); return panel(sx, id, 90 + (k % 4) * 600 + (520 - w) / 2, 110 + Math.floor(k / 4) * 470, w, tt, '') })
  const slam = h('div', { class: 'abs disp', style: { left: '120px', top: '330px', fontSize: '230px', color: '#0f1b2a', whiteSpace: 'nowrap', letterSpacing: '-.04em', transformOrigin: '0 50%' } }, root, 'Water<span style="color:#0f4c92">.</span>')
  return { world, hj, water, bub, hjc, hjT, hjS, tk, tkp, pfp, gvp, sx, six, slam }
})
WAT.update = (t) => {
  const s = WAT
  // flow: the water body reveals left to right, the bed and lines draw
  const d = s.hj.prep()
  drawAt(d, ease(t, 26.0, 26.8, E.outCubic), 0.3)
  s.water.style.opacity = 1
  s.water.style.clipPath = `inset(0 ${100 - 100 * ease(t, 26.0, 26.7, E.outCubic)}% 0 0)`
  s.bub.forEach((b, i) => { b.style.transformOrigin = `${b.getAttribute('cx')}px ${b.getAttribute('cy')}px`; b.style.transformBox = 'view-box'; b.style.transform = `scale(${clamp(spring(t - 26.55 - i * 0.06, 3, 0.4), 0, 1.3)})`; b.style.opacity = t > 26.55 + i * 0.06 ? 1 : 0 })
  const tp = ease(t, 25.98, 26.25)
  tf(s.hjT, `translateY(${(1 - tp) * 40}px)`); op(s.hjT, tp); op(s.hjS, ease(t, 26.2, 26.5)); s.hjS.textContent = scramble('MOMENTUM · BÉLANGER · y₂/y₁ = ½(√(1+8Fr₁²) − 1)', seg(t, 26.2, 26.8), 3)
  s.hjc.forEach((c, k) => { const a = 27.0 + k * 0.25, p = spring(t - a, 2.4, 0.55); tf(c.el, `translateX(${(1 - clamp(p, 0, 1.1)) * 500}px)`); op(c.el, t > a ? 1 : 0); c.set(seg(t, a, a + 0.6), t - a - 0.3) })
  // the impact lands on a word, the flow runs behind it
  const sp = ease(t, 26.0, 26.3, E.outExpo), so = ease(t, 26.35, 26.55, E.inExpo)
  tf(s.slam, `scale(${1.25 - 0.25 * sp}) translateX(${-so * 300}px)`); op(s.slam, (t >= 26.0 ? 1 : 0) * (1 - so)); s.slam.style.filter = so > 0.01 ? `blur(${so * 14}px)` : ''
  s.world.style.opacity = 0.35 + 0.65 * ease(t, 26.35, 26.6)
  // camera: starts low on the roller, pulls out on the downbeat of bar 14 + 2
  cam(s.world, t, [[26.0, 520, 520, 1.4], [26.85, 980, 470, 1.45, E.inOutCubic], [27.05, 960, 540, 1.0, E.outExpo], [27.95, 940, 540, 1.03, E.lin]])
  // bar 15: tank + pipe + GVF
  const tkOn = t >= 27.95 && t < 30.05
  show(s.tk, tkOn); show(s.world, t < 28.08); show(s.sx, t >= 29.95)
  const sw = ease(t, 27.95, 28.12, E.inOutExpo)
  s.world.style.transform += ` translateY(${-sw * 1080}px)`
  if (tkOn) {
    tf(s.tk, `translateY(${(1 - sw) * 1080 - ease(t, 29.92, 30.06, E.inExpo) * 1080}px)`)
    playPanel(s.tkp, t, 28.0, { dy: 0, d1: 0.7 })
    playPanel(s.pfp, t, 28.5, { dx: 400, dy: 0, d1: 0.6 })
    playPanel(s.gvp, t, 29.0, { dx: 400, dy: 0, d1: 0.6 })
    const z = ease(t, 29.5, 29.62, E.outExpo)
    tf(s.tk, s.tk.style.transform + ` scale(${1 + z * 0.08})`)
  }
  // bar 16: eight sheets on the 16ths, then a truck left
  if (t >= 29.95) {
    s.six.forEach((p, k) => playPanel(p, t, 30.0 + k * 0.125, { dy: 220, d1: 0.55, f: 2.8, dr: (k % 2 ? 4 : -4) }))
    const tr = ease(t, 30.0, 31.9, E.inOutCubic)
    tf(s.sx, `translateX(${-tr * 560}px) translateY(${-ease(t, 31.75, 32.0, E.inExpo) * 1080}px)`)
    s.sx.style.filter = `blur(${ease(t, 31.8, 32.0, E.inExpo) * 10}px)`
  }
}
