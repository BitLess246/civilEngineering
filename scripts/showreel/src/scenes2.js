// ════════════════════════════════════════════════════════════════════════
// C · GEOMETRY (8–14): the frame builds itself, then the real app does it
// ════════════════════════════════════════════════════════════════════════
const XS = [0, 6, 12, 18], ZS = [0, 6, 12], YS = [0, 3.5, 6.5, 9.5, 12.5, 15.5]
function projector(yaw, pitch, sc, X0, Y0) {
  const cx = 9, cz = 6, cy = 0
  const cy_ = Math.cos(yaw), sy_ = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch)
  return (x, y, z) => {
    const xr = (x - cx) * cy_ - (z - cz) * sy_, zr = (x - cx) * sy_ + (z - cz) * cy_
    return [X0 + sc * xr, Y0 - sc * ((y - cy) * cp - zr * sp)]
  }
}
function ribbon(parent, x, y) {
  const card = h('div', { class: 'abs card', style: { left: x + 'px', top: y + 'px', width: '1500px', height: '96px', borderRadius: '12px', display: 'flex', alignItems: 'flex-start', padding: '10px 16px', gap: '2px' } }, parent)
  const items = D.chrome.ribbon.filter((r) => !/Find a tool/.test(r.label))
  const groups = [['MODEL', 4], ['ANALYSE', 4], ['RESULTS', 2], ['UTILITIES', 2], ['FILE', 4]]
  const btns = []; let k = 0
  groups.forEach(([g, n], gi) => {
    const grp = h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', borderRight: gi < 4 ? '1px solid #e3e1da' : 'none', paddingRight: '10px', marginRight: '8px' } }, card)
    const row = h('div', { style: { display: 'flex', gap: '4px' } }, grp)
    for (let i = 0; i < n; i++, k++) {
      const it = items[k]; if (!it) continue
      const b = h('div', { style: { width: '82px', height: '56px', borderRadius: '9px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px', color: gi === 4 && i < 3 ? '#b8b4a8' : '#3d4a5c', fontSize: '13.5px', fontWeight: 500 } }, row)
      b.innerHTML = it.svg.replace(/width="20" height="20"/, 'width="22" height="22"') + `<span>${it.label}</span>`
      btns.push(b)
    }
    h('div', { class: 'mono', style: { fontSize: '10px', color: '#5c6675', marginTop: '3px', letterSpacing: '.22em' } }, grp, g)
  })
  const pill = h('div', { class: 'abs', style: { width: '82px', height: '56px', borderRadius: '9px', background: '#0f4c92', top: '10px', left: '0px', zIndex: 0 } }, card)
  card.insertBefore(pill, card.firstChild)
  btns.forEach((b) => { b.style.position = 'relative'; b.style.zIndex = 1 })
  return { card, btns, pill, items }
}
/** Put the active pill on button i (fractional = sliding between two). */
function ribbonActive(r, f) {
  const i = Math.floor(f), a = f - i
  const b0 = r.btns[i], b1 = r.btns[Math.min(r.btns.length - 1, i + 1)]
  const x0 = b0.offsetLeft, x1 = b1.offsetLeft
  r.pill.style.top = b0.offsetTop + 'px'
  r.pill.style.left = lerp(x0, x1, a) + 'px'
  r.btns.forEach((b, k) => { const on = k === Math.round(f); b.style.color = on ? '#ffffff' : (k >= 13 && k < 16 ? '#b8b4a8' : '#3d4a5c') })
}

const C = scene(8, 14, (root) => {
  const grid = darkGround(root)
  const spot = h('div', { class: 'abs', style: { left: '0px', top: '0px', width: W + 'px', height: H + 'px', background: 'radial-gradient(900px 700px at 62% 52%, rgba(107,164,220,.16), transparent 70%)' } }, root)
  const sv = h('svg', { width: W, height: H, class: 'abs', style: { left: 0, top: 0 } }, root)
  const gGrid = h('g', {}, sv), gSlab = h('g', {}, sv), gCol = h('g', {}, sv), gBeam = h('g', {}, sv), gNode = h('g', {}, sv), gAnn = h('g', {}, sv)
  const axes = []
  XS.forEach((x, i) => axes.push({ a: [x, 0, -4.5], b: [x, 0, 16.5], lab: 'ABCD'[i] }))
  ZS.forEach((z, i) => axes.push({ a: [-4.5, 0, z], b: [22.5, 0, z], lab: String(i + 1) }))
  for (const ax of axes) {
    ax.el = h('line', { stroke: 'rgba(107,164,220,.55)', 'stroke-width': 1.2, 'stroke-dasharray': '10 6 2 6' }, gGrid)
    ax.bub = h('g', {}, gGrid)
    h('circle', { r: 15, fill: '#0f1b2a', stroke: 'rgba(158,176,197,.8)', 'stroke-width': 1.2 }, ax.bub)
    h('text', { 'text-anchor': 'middle', y: 5, fill: '#e8eaed', 'font-family': 'IBM Plex Mono', 'font-size': 14, 'font-weight': 600 }, ax.bub, ax.lab)
  }
  const cols = []
  for (const x of XS) for (const z of ZS) cols.push({ x, z, el: h('line', { stroke: '#e8eaed', 'stroke-width': 3.2, 'stroke-linecap': 'round' }, gCol), sup: h('path', { fill: 'none', stroke: '#6ba4dc', 'stroke-width': 1.6 }, gNode) })
  const beams = [], slabs = []
  for (let k = 1; k < YS.length; k++) {
    const y = YS[k]
    for (const z of ZS) for (let i = 0; i < 3; i++) beams.push({ k, a: [XS[i], y, z], b: [XS[i + 1], y, z], el: h('line', { stroke: '#6ba4dc', 'stroke-width': 2.6, 'stroke-linecap': 'round' }, gBeam) })
    for (const x of XS) for (let i = 0; i < 2; i++) beams.push({ k, a: [x, y, ZS[i]], b: [x, y, ZS[i + 1]], el: h('line', { stroke: '#6ba4dc', 'stroke-width': 2.6, 'stroke-linecap': 'round' }, gBeam) })
    slabs.push({ k, y, el: h('polygon', { fill: 'rgba(107,164,220,.10)', stroke: 'none' }, gSlab) })
  }
  const nodes = []
  for (let k = 1; k < YS.length; k++) for (const x of XS) for (const z of ZS) nodes.push({ k, p: [x, YS[k], z], el: h('circle', { r: 3.2, fill: '#ffffff' }, gNode) })
  const callouts = [
    { at: [18, 15.5, 0], t: 'BAYS X   6.00 · 6.00 · 6.00 m', dx: 120, dy: -90, t0: 9.05 },
    { at: [18, 9.5, 12], t: 'BAYS Z   6.00 · 6.00 m', dx: 150, dy: 10, t0: 9.3 },
    { at: [0, 12.5, 12], t: 'STOREYS  3.50 · 3.00 · 3.00 · 3.00 · 3.00', dx: -170, dy: -60, t0: 9.55 },
  ].map((c) => ({ ...c, line: h('polyline', { fill: 'none', stroke: 'rgba(232,234,237,.6)', 'stroke-width': 1 }, gAnn), dot: h('circle', { r: 4, fill: 'none', stroke: '#e8eaed', 'stroke-width': 1.4 }, gAnn), lab: h('div', { class: 'abs mono', style: { fontSize: '15px', color: '#e8eaed', whiteSpace: 'pre' } }, root) }))
  const amber = h('div', { class: 'abs', style: { width: '14px', height: '14px', borderRadius: '50%', background: '#f2b53a', boxShadow: '0 0 20px rgba(242,181,58,.8)' } }, root)

  // the app: ribbon and grid panel, a cursor, the real model
  const ui = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px' } }, root)
  const rib = ribbon(ui, 110, 110)
  rib.card.style.transformOrigin = '0 0'
  const panel = h('div', { class: 'abs card', style: { left: '110px', top: '330px', width: '540px', padding: '28px 30px 30px', borderRadius: '14px', transformOrigin: '0 0' } }, ui)
  h('div', { class: 'mono', style: { color: '#0f4c92', fontSize: '13px', fontWeight: 600, letterSpacing: '.18em', marginBottom: '18px' } }, panel, '▾ COLUMN GRID')
  const fields = [['Bays X (m, comma-sep)', '6, 6, 6'], ['Bays Z (m)', '6, 6'], ['Storey heights (m)', '3.5, 3, 3, 3, 3']].map(([l, v]) => {
    const f = h('div', { style: { marginBottom: '16px' } }, panel)
    h('div', { style: { fontSize: '18px', color: '#3d4a5c', fontWeight: 500, marginBottom: '8px' } }, f, l)
    const box = h('div', { style: { height: '52px', border: '1.5px solid #8d8b85', borderRadius: '9px', background: '#fcfbf8', fontSize: '20px', color: '#0f1b2a', padding: '0 16px', display: 'flex', alignItems: 'center', fontWeight: 500 } }, f)
    const val = h('span', {}, box); const caret = h('span', { style: { width: '2px', height: '24px', background: '#0f4c92', marginLeft: '2px' } }, box)
    return { box, val, caret, v }
  })
  const btn = h('div', { style: { marginTop: '8px', height: '54px', borderRadius: '10px', border: '1.5px solid #cddcf0', background: '#eaf1f9', color: '#0f4c92', fontWeight: 600, fontSize: '19px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' } }, panel, 'Regenerate grid model')
  const ripple = h('div', { class: 'abs', style: { width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(15,76,146,.25)', left: '50%', top: '50%', marginLeft: '-20px', marginTop: '-20px' } }, btn)
  const cursor = h('div', { class: 'abs', style: { width: '30px', height: '30px', zIndex: 9 } }, ui, `<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2 L4 19 L8.6 15 L11.6 22 L14.4 20.8 L11.4 14 L17.6 14 Z" fill="#fff" stroke="#0f1b2a" stroke-width="1.4" stroke-linejoin="round"/></svg>`)
  const modelWrap = h('div', { class: 'abs', style: { left: '0px', top: '0px', width: '1100px', height: '822px' } }, root)
  const shadow = h('div', { class: 'abs', style: { left: '150px', top: '700px', width: '800px', height: '110px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(0,0,0,.55), transparent)' } }, modelWrap)
  const orbit = seqEl(modelWrap, Array.from({ length: 48 }, (_, i) => `orbit_${String(i).padStart(2, '0')}.png`), 1100, 822)
  const scan = h('div', { class: 'abs', style: { left: '0px', width: '1100px', height: '2px', background: '#e8eaed', boxShadow: '0 0 18px rgba(232,234,237,.8)' } }, modelWrap)
  const badge = h('div', { class: 'abs', style: { left: '120px', top: '880px', display: 'flex', gap: '18px', alignItems: 'center' } }, root)
  const chip = h('div', { class: 'chip', style: { background: '#ffffff', color: '#0f1b2a', fontFamily: 'Archivo', fontWeight: 700, fontSize: '22px', letterSpacing: '0', padding: '10px 20px', borderRadius: '10px' } }, badge, '3×2 Bay · 5 Storeys')
  const sub = h('div', { class: 'mono', style: { fontSize: '15px', color: '#9eb0c5' } }, badge, '')
  return { grid, spot, axes, cols, beams, slabs, nodes, callouts, amber, ui, rib, panel, fields, btn, ripple, cursor, modelWrap, orbit, scan, badge, chip, sub, sv }
})
C.update = (t) => {
  const s = C
  const wire = t < 10
  show(s.panel, t >= 10)
  show(s.sv, wire); s.callouts.forEach((c) => show(c.lab, wire))
  op(s.grid, 1); tf(s.grid, `translate(${-(t - 8) * 18}px, ${(t - 8) * 6}px)`)
  if (wire) {
    const yaw = lerp(-0.72, -0.52, ease(t, 8, 10, E.inOutCubic)), sc = lerp(30, 34, ease(t, 8, 10, E.outCubic))
    const P = projector(yaw, 0.5, sc, W / 2 + 40, H / 2 + 300)
    const pt = (q) => P(q[0], q[1], q[2])
    for (const [i, ax] of s.axes.entries()) {
      const p = ease(t, 8.0 + i * 0.04, 8.55 + i * 0.04)
      const a = pt(ax.a), b = pt(ax.b), m = [lerp(a[0], b[0], 0.5), lerp(a[1], b[1], 0.5)]
      ax.el.setAttribute('x1', lerp(m[0], a[0], p)); ax.el.setAttribute('y1', lerp(m[1], a[1], p))
      ax.el.setAttribute('x2', lerp(m[0], b[0], p)); ax.el.setAttribute('y2', lerp(m[1], b[1], p))
      const bp = clamp(spring(t - 8.35 - i * 0.04, 3, 0.45), 0, 1.3)
      ax.bub.setAttribute('transform', `translate(${a[0]},${a[1]}) scale(${bp})`)
    }
    s.cols.forEach((c, i) => {
      const p = ease(t, 8.45 + i * 0.028, 8.95 + i * 0.028)
      const a = pt([c.x, 0, c.z]), b = pt([c.x, YS[5] * p, c.z])
      c.el.setAttribute('x1', a[0]); c.el.setAttribute('y1', a[1]); c.el.setAttribute('x2', b[0]); c.el.setAttribute('y2', b[1])
      op(c.el, p > 0 ? 1 : 0)
      const sp = clamp(spring(t - 8.3 - i * 0.02, 3.2, 0.5), 0, 1.2) * 9
      c.sup.setAttribute('d', `M${a[0]},${a[1]} l${-sp},${sp * 1.3} h${2 * sp} Z`)
    })
    for (const bm of s.beams) {
      const at = 8.75 + (bm.k - 1) * 0.25
      const p = ease(t, at, at + 0.32)
      const a = pt(bm.a), b = pt(bm.b)
      bm.el.setAttribute('x1', a[0]); bm.el.setAttribute('y1', a[1])
      bm.el.setAttribute('x2', lerp(a[0], b[0], p)); bm.el.setAttribute('y2', lerp(a[1], b[1], p))
      op(bm.el, p > 0 ? 1 : 0)
    }
    for (const sl of s.slabs) {
      const at = 8.9 + (sl.k - 1) * 0.25, p = ease(t, at, at + 0.4)
      const q = [[0, sl.y, 0], [18, sl.y, 0], [18, sl.y, 12], [0, sl.y, 12]].map(pt)
      sl.el.setAttribute('points', q.map((v) => v.join(',')).join(' ')); op(sl.el, p)
    }
    for (const n of s.nodes) {
      const at = 8.75 + (n.k - 1) * 0.25 + 0.1, p = clamp(spring(t - at, 3.5, 0.4), 0, 1.4)
      const q = pt(n.p); n.el.setAttribute('cx', q[0]); n.el.setAttribute('cy', q[1]); n.el.setAttribute('r', 3.2 * p)
    }
    for (const c of s.callouts) {
      const q = pt(c.at), p = ease(t, c.t0, c.t0 + 0.35)
      const ex = q[0] + c.dx * p, ey = q[1] + c.dy * p
      c.line.setAttribute('points', `${q[0]},${q[1]} ${q[0] + c.dx * 0.25 * p},${ey} ${ex},${ey}`)
      c.dot.setAttribute('cx', q[0]); c.dot.setAttribute('cy', q[1]); op(c.dot, p); op(c.line, p)
      c.lab.textContent = scramble(c.t, seg(t, c.t0 + 0.1, c.t0 + 0.6), 7)
      css(c.lab, { left: (c.dx < 0 ? ex - 10 - c.lab.offsetWidth : ex + 10) + 'px', top: ey - 22 + 'px' })
    }
    const o = pt([9, 0, 6])
    const ap = ease(t, 8.0, 8.35)
    css(s.amber, { left: o[0] - 7 + 'px', top: o[1] - 7 + 'px' }); tf(s.amber, `scale(${1 + ap * 3})`); op(s.amber, 1 - ap)
    s.sv.style.transform = `scale(${1 + 0.06 * ease(t, 9.7, 10, E.inCubic)})`
    s.sv.style.transformOrigin = '50% 55%'
  } else op(s.amber, 0)

  // ── the app (10–12) ──
  const uiOn = t >= 9.92 && t < 12.3
  show(s.ui, uiOn)
  if (uiOn) {
    const out = ease(t, 12.0, 12.3, E.inExpo)
    tf(s.rib.card, `translateY(${(1 - ease(t, 9.92, 10.3)) * -200 - out * 260}px) scale(1.12)`)
    s.rib.btns.forEach((b, i) => { const p = clamp(spring(t - 9.98 - i * 0.022, 3.2, 0.5), 0, 1.2); tf(b, `translateY(${(1 - p) * 22}px) scale(${0.7 + 0.3 * p})`); op(b, clamp(p * 1.5)) })
    ribbonActive(s.rib, 0)
    op(s.rib.pill, ease(t, 10.3, 10.5))
    const pin = ease(t, 10.0, 10.38)
    tf(s.panel, `translateX(${(1 - pin) * 260 - out * 1100}px) perspective(1600px) rotateY(${(1 - ease(t, 10.0, 10.6)) * 14}deg) scale(${lerp(2.3, 1.38, pin)})`)
    s.panel.style.filter = pin < 1 ? `blur(${(1 - pin) * 12}px)` : ''
    s.fields.forEach((f, i) => {
      const a = 10.25 + i * 0.22
      f.val.textContent = typed(f.v, seg(t, a, a + 0.2))
      op(f.caret, t >= a && t < a + 0.3 && Math.floor(t * 8) % 2 === 0 ? 1 : 0)
      f.box.style.borderColor = t >= a && t < a + 0.3 ? '#0f4c92' : '#8d8b85'
      f.box.style.boxShadow = t >= a && t < a + 0.3 ? '0 0 0 3px rgba(15,76,146,.18)' : 'none'
    })
    // the cursor travels to the button and presses it on the downbeat
    const br = s.btn.getBoundingClientRect()
    const cp = ease(t, 10.5, 10.92, E.inOutCubic)
    const cx = lerp(1180, br.left + br.width * 0.62, cp), cy = lerp(820, br.top + br.height * 0.55, cp)
    css(s.cursor, { left: cx + 'px', top: cy + 'px' }); op(s.cursor, ease(t, 10.4, 10.5) * (1 - out))
    const press = t >= 11 ? Math.exp(-(t - 11) * 14) : 0
    tf(s.btn, `scale(${1 - 0.05 * press})`)
    const rp = seg(t, 11.0, 11.5)
    tf(s.ripple, `scale(${E.outExpo(rp) * 16})`); op(s.ripple, t >= 11 ? 1 - rp : 0)
  }
  // ── the real model (11–14) ──
  const mOn = t >= 11
  show(s.modelWrap, mOn); show(s.badge, t >= 12.2)
  if (mOn) {
    const rev = ease(t, 11.0, 11.55)
    const centre = ease(t, 12.0, 12.45)
    const zoom = ease(t, 13.0, 13.35)
    const sc = lerp(0.95, 1.1, centre) * lerp(1, 1.32, zoom) * (1 + 0.025 * (t - 11))
    const x = lerp(880, (W - 1100) / 2, centre), y = lerp(230, 150, centre) + zoom * 60
    css(s.modelWrap, { left: x + 'px', top: y + 'px' })
    const whip = ease(t, 13.82, 14.0, E.inExpo)
    tf(s.modelWrap, `translateX(${-whip * 900}px) scale(${sc})`)
    s.modelWrap.style.filter = whip > 0 ? `blur(${whip * 18}px)` : ''
    s.modelWrap.style.clipPath = `inset(${(1 - rev) * 100}% 0 0 0)`
    s.scan.style.top = (1 - rev) * 822 + 'px'; op(s.scan, rev < 1 ? 1 : 0)
    s.orbit.set(47 * ease(t, 11.0, 14.2, E.inOutCubic))
    css(s.spot, { background: `radial-gradient(900px 700px at ${lerp(62, 50, centre)}% 52%, rgba(107,164,220,.2), transparent 70%)` })
  }
  if (t >= 12.2) {
    const p = clamp(spring(t - 12.25, 2.6, 0.5), 0, 1.15)
    tf(s.chip, `translateY(${(1 - p) * 40}px)`); op(s.chip, clamp(p))
    s.sub.textContent = scramble('GENERATED FROM FOUR NUMBERS', seg(t, 12.4, 13.0), 4)
    op(s.badge, 1 - ease(t, 13.8, 14, E.inCubic))
  }
}

// ════════════════════════════════════════════════════════════════════════
// D · LOADING (14–18)
// ════════════════════════════════════════════════════════════════════════
const Dl = scene(14, 18, (root) => {
  const grid = darkGround(root)
  const spot = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px', background: 'radial-gradient(800px 700px at 64% 50%, rgba(107,164,220,.18), transparent 70%)' } }, root)
  const mw = h('div', { class: 'abs', style: { left: '700px', top: '150px', width: '1100px', height: '822px' } }, root)
  const orbit = seqEl(mw, Array.from({ length: 48 }, (_, i) => `orbit_${String(i).padStart(2, '0')}.png`), 1100, 822)
  const head = h('div', { class: 'abs mono', style: { left: '200px', top: '228px', fontSize: '15px', color: '#9eb0c5' } }, root)
  const chips = [['D', 'DEAD'], ['L', 'LIVE'], ['E', 'SEISMIC · NSCP §208'], ['W', 'WIND · NSCP §207B']].map(([l, c], i) => {
    const row = h('div', { class: 'abs', style: { left: '200px', top: 280 + i * 150 + 'px', display: 'flex', alignItems: 'center', gap: '26px' } }, root)
    const box = h('div', { class: 'card-dark', style: { width: '118px', height: '118px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '76px', fontWeight: 900, color: '#f2f5f9', background: 'rgba(15,27,42,.85)', boxShadow: '0 24px 60px -20px rgba(0,0,0,.7)' } }, row, l)
    const cap = h('div', { class: 'mono', style: { fontSize: '17px', color: i >= 2 ? '#6ba4dc' : '#e8eaed' } }, row)
    const ring = h('div', { class: 'abs', style: { left: '-10px', top: '-10px', width: '138px', height: '138px', borderRadius: '18px', border: '1.5px solid rgba(232,234,237,.7)' } }, row)
    return { row, box, cap, ring, c }
  })
  // the lateral-force diagram
  const dia = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px' } }, root)
  const dsv = h('svg', { width: W, height: H, class: 'abs', style: { left: 0, top: 0 } }, dia)
  const dg = h('g', {}, dsv)
  const ttl = h('div', { class: 'abs mono', style: { left: '330px', top: '200px', fontSize: '15px', color: '#9eb0c5' } }, dia)
  const ec = h('div', { class: 'abs', style: { left: '1110px', top: '230px', width: '700px' } }, dia)
  const cases = ['E+X ⟲', 'E+X ⟳', 'E−X ⟲', 'E−X ⟳', 'E+Z ⟲', 'E+Z ⟳', 'E−Z ⟲', 'E−Z ⟳'].map((c, i) =>
    h('div', { class: 'abs chip', style: { left: (i % 4) * 170 + 'px', top: Math.floor(i / 4) * 66 + 'px', border: '1px solid rgba(158,176,197,.4)', color: '#e8eaed', fontSize: '18px', padding: '10px 18px', background: 'rgba(15,27,42,.7)' } }, ec, c))
  const notes = ['ACCIDENTAL TORSION  ±0.05·L', 'ORTHOGONAL  100% + 30%', 'VERTICAL  Ev = 0.5·Ca·I·D'].map((n, i) =>
    h('div', { class: 'abs mono', style: { left: '0px', top: 160 + i * 34 + 'px', fontSize: '15px', color: i === 2 ? '#6ba4dc' : '#9eb0c5', whiteSpace: 'pre' } }, ec))
  const spec = h('div', { class: 'abs card', style: { left: '1110px', top: '560px', width: '700px', padding: '20px 24px 16px', color: '#0f1b2a' } }, dia)
  h('div', { class: 'mono', style: { fontSize: '12px', color: '#0f4c92', fontWeight: 600, marginBottom: '6px' } }, spec, 'DESIGN RESPONSE SPECTRUM · NSCP §208')
  const specSvg = tpl('t_spectrum'); specSvg.style.width = '652px'; specSvg.style.height = '215px'; spec.appendChild(specSvg)
  return { grid, spot, mw, orbit, head, chips, dia, dg, ttl, ec, cases, notes, spec, specSvg }
})
Dl.update = (t) => {
  const s = Dl
  tf(s.grid, `translate(${-(t - 14) * 14}px, 0)`)
  const part1 = t < 16
  show(s.mw, part1); s.chips.forEach((c) => show(c.row, part1)); show(s.head, part1); show(s.spot, part1)
  if (part1) {
    s.orbit.set(47 - 16 * ease(t, 14, 16, E.outCubic))
    const push = ease(t, 14, 16, E.outCubic)
    tf(s.mw, `scale(${1.08 + 0.06 * push}) translateX(${(1 - ease(t, 14, 14.35)) * 260}px)`)
    s.mw.style.filter = t < 14.2 ? `blur(${(1 - seg(t, 14, 14.2)) * 14}px)` : ''
    s.head.textContent = scramble('LOAD CASES', seg(t, 14.0, 14.4), 2)
    s.chips.forEach((c, i) => {
      const at = 14.0 + i * 0.5
      const p = t >= at ? spring(t - at, 3.4, 0.42) : 0
      tf(c.box, `scale(${t >= at ? 1.6 - 0.6 * p : 0.001})`); op(c.box, t >= at ? 1 : 0)
      c.cap.textContent = scramble(c.c, seg(t, at + 0.05, at + 0.4), i + 11)
      const r = seg(t, at, at + 0.5); tf(c.ring, `scale(${1 + E.outExpo(r) * 0.5})`); op(c.ring, t >= at ? (1 - r) * 0.9 : 0)
    })
    op(s.mw, 1)
  }
  show(s.dia, !part1)
  if (!part1) {
    const g = s.dg; g.innerHTML = ''
    const X0 = 560, Y0 = 900, bw = 150, hs = [0, 3.5, 6.5, 9.5, 12.5, 15.5], kz = 42
    const grow = (k) => ease(t, 16.0 + (k - 1) * 0.1, 16.45 + (k - 1) * 0.1)
    const sway = (k) => 46 * Math.pow(hs[k] / 15.5, 1.25) * ease(t, 16.1, 16.9, E.outCubic) * (1 + 0.08 * Math.sin((t - 16.9) * 9) * Math.exp(-(t - 16.9) * 2) * (t > 16.9))
    const px = (i, k) => X0 + i * bw + sway(k), py = (k) => Y0 - hs[k] * kz
    for (let i = 0; i < 4; i++) for (let k = 0; k < 5; k++) h('line', { x1: px(i, k), y1: py(k), x2: px(i, k + 1), y2: py(k + 1), stroke: '#e8eaed', 'stroke-width': 3 }, g)
    for (let k = 1; k <= 5; k++) for (let i = 0; i < 3; i++) h('line', { x1: px(i, k), y1: py(k), x2: px(i + 1, k), y2: py(k), stroke: '#6ba4dc', 'stroke-width': 3 }, g)
    for (let i = 0; i < 4; i++) h('path', { d: `M${px(i, 0)},${Y0} l-10,14 h20 Z`, fill: 'none', stroke: '#9eb0c5', 'stroke-width': 1.5 }, g)
    h('line', { x1: X0 - 60, y1: Y0 + 14, x2: X0 + 3 * bw + 60, y2: Y0 + 14, stroke: 'rgba(158,176,197,.5)', 'stroke-width': 1 }, g)
    for (let k = 1; k <= 5; k++) {
      const p = grow(k), L = 230 * (hs[k] / 15.5) * p
      const x1 = px(0, k) - 26 - L, x2 = px(0, k) - 26, y = py(k)
      h('line', { x1, y1: y, x2: x2 - 10, y2: y, stroke: '#f2f5f9', 'stroke-width': 3, opacity: p > 0 ? 1 : 0 }, g)
      h('path', { d: `M${x2},${y} l-14,-8 v16 Z`, fill: '#f2f5f9', opacity: p > 0.05 ? 1 : 0 }, g)
      const lt = h('text', { x: x1 - 12, y: y + 6, 'text-anchor': 'end', fill: '#9eb0c5', 'font-family': 'IBM Plex Mono', 'font-size': 18, opacity: clamp(p * 2 - 1) }, g); lt.textContent = 'F' + '₁₂₃₄₅'[k - 1]
    }
    const vp = ease(t, 16.7, 17.1)
    h('line', { x1: X0 + 3 * bw + 40, y1: Y0 + 46, x2: X0 + 3 * bw + 40 - 300 * vp, y2: Y0 + 46, stroke: '#6ba4dc', 'stroke-width': 3, opacity: vp > 0 ? 1 : 0 }, g)
    h('path', { d: `M${X0 + 3 * bw + 40 - 300 * vp - 4},${Y0 + 46} l14,-8 v16 Z`, fill: '#6ba4dc', opacity: vp > 0.05 ? 1 : 0 }, g)
    const vt = h('text', { x: X0 + 3 * bw + 60, y: Y0 + 52, fill: '#6ba4dc', 'font-family': 'IBM Plex Mono', 'font-size': 18, opacity: vp }, g); vt.textContent = 'V  BASE SHEAR'
    s.ttl.textContent = scramble('STATIC LATERAL FORCE · NSCP §208.5', seg(t, 16.0, 16.6), 8)
    s.cases.forEach((c, i) => { const p = clamp(spring(t - 16.2 - i * 0.07, 3, 0.5), 0, 1.15); tf(c, `translateY(${(1 - p) * 30}px)`); op(c, clamp(p * 1.3)) })
    const nTxt = ['ACCIDENTAL TORSION  ±0.05·L', 'ORTHOGONAL  100% + 30%', 'VERTICAL  Ev = 0.5·Ca·I·D']
    s.notes.forEach((n, i) => { n.textContent = scramble(nTxt[i], seg(t, 16.7 + i * 0.12, 17.1 + i * 0.12), 30 + i) })
    const sp = ease(t, 17.0, 17.35)
    tf(s.spec, `translateY(${(1 - sp) * 80}px) perspective(1400px) rotateX(${(1 - sp) * 25}deg)`); op(s.spec, sp)
    if (!s.specD) s.specD = prepDraw(s.specSvg, 'x')
    drawAt(s.specD, seg(t, 17.05, 17.85), 0.3)
    const out = ease(t, 17.8, 18.0, E.inCubic)
    tf(s.dia, `scale(${1 - 0.04 * out})`); op(s.dia, 1 - out * 0.6)
  }
}

// ════════════════════════════════════════════════════════════════════════
// E · ANALYSIS (18–24)
// ════════════════════════════════════════════════════════════════════════
const En = scene(18, 24, (root) => {
  const grid = darkGround(root)
  const spot = h('div', { class: 'abs', style: { left: 0, top: 0, width: W + 'px', height: H + 'px', background: 'radial-gradient(900px 700px at 55% 52%, rgba(107,164,220,.16), transparent 70%)' } }, root)
  const dw = h('div', { class: 'abs', style: { left: '470px', top: '150px', width: '1150px', height: '809px' } }, root)
  const exag = seqEl(dw, Array.from({ length: 11 }, (_, i) => `duo_exag_${String(i).padStart(2, '0')}.png`), 1150, 809)
  const txt = h('div', { class: 'abs', style: { left: '150px', top: '250px', width: '520px' } }, root)
  const lines = ['3D FEM · 12-DOF SPACE FRAME', 'P-Δ · RIGID END ZONES', 'CRACKED SECTIONS · §406.6.3', 'DIAPHRAGMS · SHELLS'].map((l, i) => h('div', { class: 'mono', style: { fontSize: '16px', color: i ? '#9eb0c5' : '#e8eaed', marginBottom: '14px', whiteSpace: 'pre' } }, txt))
  const gov = h('div', { class: 'abs', style: { left: '150px', top: '820px' } }, root)
  const govL = h('div', { class: 'mono', style: { fontSize: '13px', color: '#9eb0c5', marginBottom: '8px' } }, gov, 'GOVERNING COMBINATION')
  const govV = h('div', { style: { fontSize: '34px', fontWeight: 700, color: '#f2f5f9', letterSpacing: '-.01em', whiteSpace: 'nowrap' } }, gov)
  // stress
  const sw = h('div', { class: 'abs', style: { left: '385px', top: '120px', width: '1150px', height: '833px', transformOrigin: '50% 50%' } }, root)
  h('img', { src: 'assets/canvas_stress.png', style: { width: '1150px', height: '833px' } }, sw)
  const legend = h('div', { class: 'abs', style: { left: '150px', top: '880px' } }, root)
  h('div', { class: 'mono', style: { fontSize: '13px', color: '#9eb0c5', marginBottom: '10px' } }, legend, 'MEMBER STRESS σ · FEA SPECTRUM')
  const sw2 = h('div', { style: { display: 'flex', width: '420px', height: '12px', borderRadius: '2px', overflow: 'hidden' } }, legend)
  const JETS = ['rgb(0,0,143)', 'rgb(0,0,255)', 'rgb(0,128,255)', 'rgb(0,255,255)', 'rgb(128,255,128)', 'rgb(255,255,0)', 'rgb(255,128,0)', 'rgb(255,0,0)', 'rgb(128,0,0)']
  const sws = Array.from({ length: 12 }, (_, i) => { const t = (i + 0.5) / 12, x = t * 8, k = Math.min(7, Math.floor(x)); return h('div', { style: { flex: 1, background: JETS[Math.round(x)] } }, sw2) })
  // triptych
  const tri = ['duo_exag_10.png', 'canvas_stress.png', 'duo_canvas_disp.png'].map((src, i) => {
    const p = h('div', { class: 'abs', style: { left: 120 + i * 575 + 'px', top: '250px', width: '540px' } }, root)
    const c = h('div', { style: { width: '540px', height: '400px', borderRadius: '14px', border: '1px solid rgba(158,176,197,.22)', background: 'rgba(15,27,42,.55)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, p)
    h('img', { src: 'assets/' + src, style: { width: '520px' } }, c)
    h('div', { class: 'mono', style: { fontSize: '14px', color: '#9eb0c5', marginTop: '16px' } }, p, ['DEFORMED SHAPE', 'MEMBER STRESS', 'DISPLACEMENT'][i])
    return p
  })
  const triCap = h('div', { class: 'abs disp', style: { left: '120px', top: '760px', fontSize: '64px', color: '#f2f5f9', whiteSpace: 'nowrap' } }, root)
  return { grid, spot, dw, exag, txt, lines, gov, govV, sw, legend, sws, tri, triCap }
})
En.update = (t) => {
  const s = En
  tf(s.grid, `translate(${-(t - 18) * 10}px, ${(t - 18) * 4}px)`)
  const p1 = t < 20, p2 = t >= 20 && t < 22, p3 = t >= 22
  show(s.dw, p1); show(s.txt, p1); show(s.gov, p1); show(s.sw, p2); show(s.legend, p2); s.tri.forEach((x) => show(x, p3)); show(s.triCap, p3)
  if (p1) {
    // the building leans into the load and rings down — a damped sway
    const tau = t - 18
    const k = clamp(7.2 * (1 - Math.exp(-5 * tau)) + 2.8 * Math.exp(-1.1 * tau) * Math.sin(2 * Math.PI * 0.95 * tau) * (1 - Math.exp(-5 * tau)), 0, 10)
    s.exag.set(k)
    const ent = ease(t, 18, 18.4)
    tf(s.dw, `scale(${lerp(1.25, 1, ent) * (1 + 0.03 * tau)})`)
    s.dw.style.filter = t < 18.15 ? `blur(${(1 - seg(t, 18, 18.15)) * 16}px)` : ''
    const ls = ['3D FEM · 12-DOF SPACE FRAME', 'P-Δ · RIGID END ZONES', 'CRACKED SECTIONS · §406.6.3', 'DIAPHRAGMS · SHELLS']
    s.lines.forEach((l, i) => { l.textContent = scramble(ls[i], seg(t, 18.15 + i * 0.18, 18.6 + i * 0.18), 40 + i) })
    s.govV.textContent = typed('1.42D + 1.0E + 0.5L + 0.2S · E−Z ⟲', seg(t, 18.9, 19.5))
    const gp = ease(t, 18.8, 19.2); tf(s.gov, `translateY(${(1 - gp) * 30}px)`); op(s.gov, gp)
    const out = ease(t, 19.85, 20, E.inExpo); op(s.dw, 1 - out)
  }
  if (p2) {
    const ent = ease(t, 20, 20.35)
    const z1 = ease(t, 20.5, 20.75), pan = ease(t, 21.0, 21.45, E.inOutCubic), z2 = ease(t, 21.5, 21.75)
    const zoom = 1 + 1.2 * z1 * (1 - z2)
    const ox = lerp(lerp(50, 22, z1), 78, pan * (1 - z2) + 0) , oy = lerp(lerp(50, 82, z1), 34, pan * (1 - z2))
    s.sw.style.transformOrigin = `${z2 > 0 ? lerp(78, 50, z2) : ox}% ${z2 > 0 ? lerp(34, 50, z2) : oy}%`
    tf(s.sw, `scale(${lerp(1.18, 1, ent) * zoom})`)
    s.sw.style.filter = (t >= 20.5 && t < 20.58) || (t >= 21.5 && t < 21.58) ? 'blur(6px)' : ''
    s.sws.forEach((w, i) => op(w, ease(t, 20.1 + i * 0.03, 20.25 + i * 0.03)))
    op(s.legend, 1)
  }
  if (p3) {
    s.tri.forEach((p, i) => {
      const at = 21.9 + i * 0.22, q = ease(t, at, at + 0.45)
      const back = ease(t, 23.55, 24, E.inCubic)
      tf(p, `translateY(${(1 - q) * 500}px) perspective(1600px) rotateX(${(1 - q) * -35}deg) scale(${1 - back * 0.12})`)
      op(p, (q > 0 ? 1 : 0) * (1 - back * 0.7))
    })
    s.triCap.textContent = typed('One factorization. Every combination.', seg(t, 22.9, 23.5))
    op(s.triCap, 1 - ease(t, 23.7, 24))
  }
}
