// ── Zeta Model Space tour, 1920×1080 ──────────────────────────────────────
const D = JSON.parse($('#data').textContent)
// The feature-tour format: a hook over the live model, a product card, then
// numbered chapters — each a REAL capture of the app (cap/tour, 2× stills and
// canvas sequences) with a slow camera move, a cursor, highlight boxes and a
// lower third — and a free CTA. One narrated line per chapter; chapter lengths
// come from the voice clips (build.py → D.tl), so picture and voice agree.
E.inOutSine = E.inOutSine ?? ((t) => -(Math.cos(Math.PI * t) - 1) / 2)
const TL = D.tl, BX = D.boxes
const NAVY = '#0b1a2e', INK = '#0f1b2a', AMBER = '#f2b53a', ACC = '#6ba4dc', WHITE = '#f2f5f9', OK = '#1f9d55', BAD = '#d64531'
const SEG = Object.fromEntries(TL.map((s) => [s.id, s]))
const VW = 1920, VH = 1080

// ── a camera on a source: stills are 1600×900 css at 2×, canvas sequences are
//    the canvas box at 2×. A view is [x, y, w] in the source's css px; height
//    follows 16:9. ──
function source(parent, kind, name, n) {
  const wrap = h('div', { class: 'abs', style: { left: 0, top: 0, width: VW + 'px', height: VH + 'px', overflow: 'hidden' } }, parent)
  const nat = kind === 'still' || !BX[name] ? [1600, 900] : [BX[name].canvas.w, BX[name].canvas.h]
  const imgs = kind === 'still' ? [h('img', { class: 'abs', src: `../cap/tour/${name}.jpg` }, wrap)]
    : Array.from({ length: n }, (_, k) => h('img', { class: 'abs', src: `../cap/tour/${name}/${String(k).padStart(3, '0')}.jpg`, style: { display: 'none' } }, wrap))
  let shown = imgs[0]
  return {
    wrap, nat,
    set(view, frame = 0) {
      const [x, y, w] = view, s = VW / w
      if (imgs.length > 1) { const f = imgs[clamp(Math.round(frame), 0, imgs.length - 1)]; if (f !== shown) { shown.style.display = 'none'; f.style.display = 'block'; shown = f } }
      else shown.style.display = 'block'
      css(shown, { width: nat[0] * s + 'px', left: -x * s + 'px', top: -y * s + 'px' })
      return { x, y, s }
    },
  }
}
const lerpV = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k)
/** Map a css rect of the source to viewport px under camera c. */
const toVP = (c, r) => ({ x: (r.x - c.x) * c.s, y: (r.y - c.y) * c.s, w: r.w * c.s, h: r.h * c.s })

// ── overlays shared by every chapter ──
const ROOT2 = $('#stage')
function lowerThird(parent, n, title, sub) {
  const el = h('div', { class: 'abs', style: { left: '64px', top: '900px', display: 'flex', alignItems: 'stretch', filter: 'drop-shadow(0 18px 40px rgba(3,8,16,.45))' } }, parent)
  h('div', { style: { background: AMBER, color: NAVY, font: "800 40px 'Archivo'", padding: '14px 20px', display: 'flex', alignItems: 'center', letterSpacing: '-.02em' } }, el, n)
  const bar = h('div', { style: { background: NAVY, padding: '12px 26px 12px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center', clipPath: 'inset(0 100% 0 0)' } }, el)
  h('div', { style: { font: "800 38px 'Archivo'", color: WHITE, letterSpacing: '.01em', textTransform: 'uppercase', whiteSpace: 'nowrap' } }, bar, title)
  h('div', { class: 'mono', style: { fontSize: '15px', color: '#9eb0c5', marginTop: '6px', whiteSpace: 'nowrap', letterSpacing: '.12em' } }, bar, sub)
  return { set(t, a, b) {
    const k = E.outExpo(seg(t, a + 0.1, a + 0.7)), out = E.inCubic(seg(t, b - 0.35, b))
    el.style.opacity = (t >= a ? 1 : 0) * (1 - out)
    el.style.transform = `translateX(${(1 - k) * -60}px)`
    bar.style.clipPath = `inset(0 ${(1 - E.outExpo(seg(t, a + 0.25, a + 0.95))) * 100}% 0 0)`
  } }
}
function watermark(parent) {
  const el = h('div', { class: 'abs mono', style: { right: '40px', top: '34px', display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(11,26,46,.86)', color: WHITE, padding: '9px 16px 9px 12px', borderRadius: '999px', fontSize: '15px', letterSpacing: '.14em' } }, parent,
    LOGO('wm').replace('width="64" height="64"', 'width="22" height="22"') + 'ZETA · ZETASTRUCT.APP')
  return el
}
/** A highlight rectangle on a source rect (css px), drawn in viewport space. */
function hilite(parent, color) {
  const el = h('div', { class: 'abs', style: { border: `4px solid ${color}`, borderRadius: '10px', boxShadow: `0 0 0 9999px rgba(11,26,46,0), 0 0 26px ${color}66`, pointerEvents: 'none' } }, parent)
  return { set(c, r, k, pad = 8) {
    if (!r || k <= 0) { el.style.opacity = 0; return }
    const v = toVP(c, r)
    css(el, { left: v.x - pad + 'px', top: v.y - pad + 'px', width: v.w + 2 * pad + 'px', height: v.h + 2 * pad + 'px', opacity: Math.min(1, k * 3), transform: `scale(${1.08 - 0.08 * E.outBack(clamp(k))})` })
  } }
}
/** A pointer that glides to a target and clicks (ripple). */
function cursor(parent) {
  const el = h('div', { class: 'abs', style: { width: '40px', height: '40px', zIndex: 20, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.35))' } }, parent,
    '<svg viewBox="0 0 24 24" width="40" height="40"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.4-3.6-6.9L4 20z" fill="#fff" stroke="#0b1a2e" stroke-width="1.6" stroke-linejoin="round"/></svg>')
  const rip = h('div', { class: 'abs', style: { width: '60px', height: '60px', borderRadius: '50%', border: `3px solid ${AMBER}`, zIndex: 19 } }, parent)
  return { set(from, to, t, a, b, click) {
    if (t < a - 0.3 || !to) { el.style.opacity = rip.style.opacity = 0; return }
    const k = E.inOutCubic(seg(t, a, b))
    const x = from.x + (to.x - from.x) * k, y = from.y + (to.y - from.y) * k
    const press = click !== undefined && t > click && t < click + 0.12 ? 0.86 : 1
    css(el, { left: x - 6 + 'px', top: y - 4 + 'px', opacity: 1, transform: `scale(${press})` })
    const r = click !== undefined ? seg(t, click, click + 0.6) : 0
    css(rip, { left: x - 30 + 'px', top: y - 30 + 'px', opacity: click !== undefined && t >= click ? (1 - r) : 0, transform: `scale(${0.3 + r * 1.4})` })
  } }
}
const centre = (r) => r && { x: r.x + r.w / 2, y: r.y + r.h / 2 }

// ── scenes ──
const SCENES2 = []
function scene2(id, build) {
  const s = SEG[id], root = h('div', { class: 'layer' }, ROOT2)
  const o = { id, a: s.t0, b: s.t1, root, ...build(root, s) }
  SCENES2.push(o); return o
}
/** A chapter: one or two sources with camera moves, then the lower third. */
function chapter(id, shots, opts = {}) {
  return scene2(id, (root, s) => {
    const layers = shots.map((sh) => ({ sh, src: source(root, sh.kind ?? 'still', sh.name, sh.n) }))
    const hl = hilite(root, opts.color ?? AMBER), cur = cursor(root)
    const lt = lowerThird(root, s.n, s.title, s.sub), wm = watermark(root)
    return { layers, hl, cur, lt, wm, update(t) {
      const d = s.t1 - s.t0, u = (t - s.t0) / d
      let cam = null
      layers.forEach(({ sh, src }, i) => {
        const [p0, p1] = sh.span ?? [0, 1]
        const vis = u >= p0 && (u < p1 || i === layers.length - 1)
        const fadeIn = i ? E.outCubic(seg(u, p0, p0 + 0.06)) : 1
        src.wrap.style.opacity = vis ? fadeIn : 0
        if (!vis) return
        const k = E.inOutSine(seg(u, p0, p1))
        const c = src.set(lerpV(sh.from, sh.to, k), (sh.n ?? 1) > 1 ? seg(u, p0, p1) * (sh.n - 1) : 0)
        cam = { ...c, sh }
      })
      // highlight + cursor, driven by the visible shot's marks
      const m = cam?.sh.mark
      if (m) {
        const r = BX[cam.sh.name]?.[m.key] ?? m.rect
        hl.set(cam, r, seg(u, m.at, m.at + 0.12))
        if (m.click !== undefined) {
          const to = centre(toVP(cam, r)), from = { x: to.x + 420, y: to.y + 260 }
          cur.set(from, to, u, m.at - 0.2, m.at + 0.05, m.click)
        } else cur.set(null, null, u, 1, 1)
      } else { hl.set(cam, null, 0); cur.set(null, null, u, 1, 1) }
      lt.set(t, s.t0, s.t1)
      root.style.opacity = 1 - E.inCubic(seg(t, s.t1 - 0.25, s.t1)) * (opts.cutOut === false ? 0 : 0)
    } }
  })
}
const FULL = [0, 0, 1600], CANVAS = (bx) => (BX[bx] ? [BX[bx].canvas.w * 0.04, BX[bx].canvas.h * 0.12, BX[bx].canvas.w * 0.92] : FULL)

// HOOK — the live, stressed model turning; the question in two boxes
scene2('hook', (root, s) => {
  const src = source(root, 'seq', 'o2_stress', BX.o2_stress.n)
  const box = h('div', { class: 'abs', style: { left: '96px', top: '96px' } }, root)
  const l1 = h('div', { style: { display: 'inline-block', background: NAVY, color: WHITE, font: "800 76px 'Archivo'", padding: '10px 22px 8px', letterSpacing: '-.01em', textTransform: 'uppercase' } }, box, 'Design a whole RC frame')
  h('br', {}, box)
  const l2 = h('div', { style: { display: 'inline-block', background: AMBER, color: NAVY, font: "800 76px 'Archivo'", padding: '8px 22px', marginTop: '10px', letterSpacing: '-.01em', textTransform: 'uppercase' } }, box, 'In 3D — in minutes')
  h('br', {}, box)
  const l3 = h('div', { class: 'mono', style: { display: 'inline-block', background: 'rgba(11,26,46,.9)', color: '#cfe0f3', fontSize: '20px', padding: '10px 18px', marginTop: '12px', letterSpacing: '.16em' } }, box, 'NSCP 2015 · ACI 318-14 · FEM · DESIGN · PLANS')
  return { update(t) {
    const u = seg(t, s.t0, s.t1)
    src.set([60, 60, 840], u * (BX.o2_stress.n - 1) * 0.55)
    ;[l1, l2, l3].forEach((el, i) => { const k = E.outExpo(seg(t, 0.15 + i * 0.22, 0.75 + i * 0.22)); el.style.clipPath = `inset(0 ${(1 - k) * 100}% 0 0)` })
  } }
})
// TITLE — the product card
scene2('title', (root, s) => {
  h('div', { class: 'abs', style: { inset: 0, background: `radial-gradient(1400px 900px at 70% 40%, #17304f 0%, ${NAVY} 60%, #08121f 100%)` } }, root)
  h('div', { class: 'grid', style: { opacity: 0.6 } }, root)
  const left = h('div', { class: 'abs', style: { left: '120px', top: '300px', width: '760px' } }, root)
  h('div', { style: { display: 'flex', alignItems: 'center', gap: '18px', color: WHITE } }, left, LOGO('tc').replace('width="64" height="64"', 'width="74" height="74"') + WORD_SVG(40, WHITE))
  h('div', { class: 'mono', style: { color: AMBER, fontSize: '22px', marginTop: '46px', letterSpacing: '.2em' } }, left, '3D MODEL SPACE')
  h('div', { style: { font: "800 92px/0.98 'Archivo'", color: WHITE, marginTop: '16px', letterSpacing: '-.03em' } }, left, 'Frame analysis<br>&amp; design')
  h('div', { style: { fontSize: '26px', color: '#9eb0c5', marginTop: '22px' } }, left, 'RC frames to NSCP 2015 / ACI 318-14')
  const chips = h('div', { style: { display: 'flex', gap: '10px', marginTop: '30px', flexWrap: 'wrap' } }, left)
  ;['FEM', 'SEISMIC', 'MODAL', 'DESIGN', 'PLANS', 'PDF REPORT'].forEach((c) => h('span', { class: 'chip', style: { background: 'rgba(107,164,220,.12)', border: '1.5px solid rgba(107,164,220,.6)', color: ACC, fontSize: '16px' } }, chips, c))
  const shot = h('img', { class: 'abs', src: '../cap/tour/s03_model.jpg', style: { left: '960px', top: '250px', width: '860px', borderRadius: '12px', boxShadow: '0 50px 120px -30px rgba(0,0,0,.7)' } }, root)
  return { update(t) {
    const k = E.outExpo(seg(t, s.t0 + 0.1, s.t0 + 1.1))
    left.style.transform = `translateY(${(1 - k) * 40}px)`; left.style.opacity = k
    shot.style.transform = `translateX(${(1 - k) * 80}px) perspective(1600px) rotateY(${-10 + 4 * seg(t, s.t0, s.t1)}deg)`; shot.style.opacity = k
  } }
})

// CHAPTERS — the real app, under a moving camera
chapter('c01', [
  { name: 's02_typed', from: FULL, to: [980, 120, 640], span: [0, 0.55], mark: { key: 'regen', at: 0.25, click: 0.42 } },
  { name: 's03_model', from: [980, 120, 640], to: [160, 60, 1180], span: [0.55, 1] },
])
chapter('c02', [{ kind: 'seq', name: 'o1_model', n: BX.o1_model.n, from: CANVAS('o1_model'), to: [120, 110, 700] }])
chapter('c03', [{ name: 's04_loads', from: FULL, to: [1060, 330, 560], mark: { key: 'gen', at: 0.18 } }])
chapter('c04', [
  { name: 's05_analysis', from: [900, 100, 720], to: [1040, 300, 560], span: [0, 0.4], mark: { key: 'analyze', at: 0.05, click: 0.22 } },
  { name: 's06_stress', from: [200, 120, 1000], to: [300, 210, 760], span: [0.4, 1] },
])
chapter('c05', [{ name: 's07_modal', from: FULL, to: [1040, 470, 560], mark: { key: 'table', at: 0.3 } }])
chapter('c06', [
  { name: 's08_design_top', from: FULL, to: [1040, 110, 580], span: [0, 0.35], mark: { key: 'design', at: 0.04, click: 0.2 } },
  { name: 's09_schedule_fail', from: [180, 120, 1300], to: [180, 180, 900], span: [0.35, 1], mark: { key: 'chip', at: 0.55 } },
], { color: BAD })
chapter('c07', [
  { name: 's10_optimised_top', from: [1040, 110, 580], to: [1040, 110, 560], span: [0, 0.35], mark: { key: 'optimise', at: 0.02, click: 0.18 } },
  { name: 's11_schedule_pass', from: [180, 180, 900], to: [180, 200, 760], span: [0.35, 1], mark: { key: 'chip', at: 0.45 } },
], { color: OK })
chapter('c08', [
  { name: 's12_cages', from: FULL, to: [200, 110, 1000], span: [0, 0.35] },
  { kind: 'seq', name: 'o3_cages', n: BX.o3_cages?.n ?? 1, from: CANVAS('o3_cages'), to: [180, 160, 560], span: [0.35, 1] },
])
chapter('c09', [{ name: 's13_plans', from: FULL, to: [1040, 400, 560], mark: { key: 'framing', at: 0.3 } }])
scene2('c10', (root, s) => {
  h('div', { class: 'abs', style: { inset: 0, background: `radial-gradient(1400px 900px at 60% 40%, #17304f 0%, ${NAVY} 60%, #08121f 100%)` } }, root)
  const pages = D.pages.map((src, i) => h('img', { class: 'abs', src, style: { left: 520 + i * 250 + 'px', top: '120px', width: '600px', borderRadius: '4px', boxShadow: '0 40px 90px -20px rgba(0,0,0,.75)', transformOrigin: '50% 100%' } }, root))
  const lt = lowerThird(root, s.n, s.title, s.sub), wm = watermark(root)
  return { update(t) {
    pages.forEach((p, i) => { const k = E.outBack(clamp(seg(t, s.t0 + 0.2 + i * 0.35, s.t0 + 0.9 + i * 0.35))); p.style.opacity = clamp(k * 2)
      p.style.transform = `translateY(${(1 - k) * 260}px) rotate(${(i - (pages.length - 1) / 2) * 5 * k}deg)` })
    lt.set(t, s.t0, s.t1)
  } }
})
chapter('c11', [{ name: 's15_exchange', from: FULL, to: [980, 60, 620], mark: { key: 'etabs', at: 0.3 } }])
// END — the free CTA
scene2('end', (root, s) => {
  h('div', { class: 'abs', style: { inset: 0, background: `radial-gradient(1400px 900px at 30% 40%, #17304f 0%, ${NAVY} 60%, #08121f 100%)` } }, root)
  h('div', { class: 'grid', style: { opacity: 0.6 } }, root)
  const box = h('div', { class: 'abs', style: { left: '140px', top: '250px' } }, root)
  h('div', { style: { display: 'flex', alignItems: 'center', gap: '22px', color: WHITE } }, box, LOGO('ec').replace('width="64" height="64"', 'width="110" height="110"') + WORD_SVG(64, WHITE))
  h('div', { class: 'mono', style: { color: AMBER, fontSize: '24px', marginTop: '44px', letterSpacing: '.2em' } }, box, 'START FREE')
  h('div', { style: { font: "800 64px 'Archivo'", color: WHITE, marginTop: '14px', letterSpacing: '-.02em' } }, box, 'Structural engineering, made clearer.')
  const btn = h('div', { style: { display: 'inline-flex', marginTop: '36px', background: AMBER, color: NAVY, font: "800 40px 'Archivo'", padding: '16px 34px', borderRadius: '999px', gap: '16px', alignItems: 'center' } }, box, 'zetastruct.app <span style="font-size:36px">→</span>')
  h('div', { style: { fontSize: '24px', color: '#9eb0c5', marginTop: '28px' } }, box, 'Free calculators · 3D Model Space on the Pro plan')
  const shot = h('img', { class: 'abs', src: '../cap/tour/s12_cages.jpg', style: { left: '1180px', top: '300px', width: '640px', borderRadius: '12px', boxShadow: '0 50px 120px -30px rgba(0,0,0,.7)' } }, root)
  return { update(t) {
    const k = E.outExpo(seg(t, s.t0 + 0.1, s.t0 + 1.0))
    box.style.opacity = k; box.style.transform = `translateY(${(1 - k) * 30}px)`
    shot.style.opacity = k; shot.style.transform = `translateX(${(1 - k) * 60}px)`
    btn.style.transform = `scale(${1 + 0.04 * Math.sin(Math.max(0, t - s.t0 - 1) * 4) * Math.exp(-Math.max(0, t - s.t0 - 1))})`
  } }
})

window.render = (t) => {
  for (const sc of SCENES2) {
    const on = t >= sc.a && t < sc.b + 0.0001
    sc.root.style.display = on ? 'block' : 'none'
    if (on) sc.update(t)
  }
}
window.DURATION = TL.at(-1).t1
render(0)
