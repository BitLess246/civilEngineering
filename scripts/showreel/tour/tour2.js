// ── Zeta Model Space — the continuous tour, 1920×1080 ─────────────────────
// build2.py resolved the tape into one plan row per video frame:
//   [img, prevImg, fadeK, camX, camY, camW, curX, curY, pressed,
//    rippleAge, rippleX, rippleY, callout, calloutK, busyK]
// so this file only paints it: the real app under a gentle camera, the
// pointer going to each real button, a pill naming it. No cuts between views.
E.inOutSine = E.inOutSine ?? ((t) => -(Math.cos(Math.PI * t) - 1) / 2)
const D = JSON.parse($('#data').textContent)
const TL = D.tl, SEG = Object.fromEntries(TL.map((s) => [s.id, s]))
const NAVY = '#0b1a2e', AMBER = '#f2b53a', ACC = '#6ba4dc', WHITE = '#f2f5f9'
const VW = 1920, VH = 1080, CW = 1600                    // CW: the captured viewport, css px
const ROOT = $('#stage')
const layer = () => h('div', { class: 'layer', style: { display: 'none' } }, ROOT)

/** An <img> that only re-decodes when its source changes. */
function frameImg(parent, z = 0) {
  const el = h('img', { class: 'abs', style: { zIndex: z, transformOrigin: '0 0' } }, parent)
  let src = null
  return { el, async set(s) { if (s !== src) { src = s; el.src = s; await el.decode().catch(() => {}) } } }
}
/** Place an image of the 1600-css viewport under camera [x, y, w]. */
function place(el, x, y, w) { const s = VW / w; css(el, { width: CW * s + 'px', left: -x * s + 'px', top: -y * s + 'px' }); return s }

function lowerThird(parent, n, title, sub) {
  const el = h('div', { class: 'abs', style: { left: '56px', top: '926px', display: 'flex', alignItems: 'stretch', zIndex: 30, filter: 'drop-shadow(0 18px 40px rgba(3,8,16,.45))' } }, parent)
  h('div', { style: { background: AMBER, color: NAVY, font: "800 34px 'Archivo'", padding: '12px 18px', display: 'flex', alignItems: 'center', letterSpacing: '-.02em' } }, el, n)
  const bar = h('div', { style: { background: NAVY, padding: '10px 24px 10px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', clipPath: 'inset(0 100% 0 0)' } }, el)
  h('div', { style: { font: "800 32px 'Archivo'", color: WHITE, letterSpacing: '.01em', textTransform: 'uppercase', whiteSpace: 'nowrap' } }, bar, title)
  h('div', { class: 'mono', style: { fontSize: '14px', color: '#9eb0c5', marginTop: '5px', whiteSpace: 'nowrap', letterSpacing: '.12em' } }, bar, sub)
  return { set(t, a, b) {
    const k = E.outExpo(seg(t, a + 0.05, a + 0.6)), out = E.inCubic(seg(t, b - 0.3, b))
    el.style.opacity = (t >= a && t < b ? 1 : 0) * (1 - out)
    el.style.transform = `translateX(${(1 - k) * -50}px)`
    bar.style.clipPath = `inset(0 ${(1 - E.outExpo(seg(t, a + 0.2, a + 0.85))) * 100}% 0 0)`
  } }
}
function watermark(parent) {
  return h('div', { class: 'abs mono', style: { right: '36px', bottom: '34px', zIndex: 30, display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(11,26,46,.86)', color: WHITE, padding: '9px 16px 9px 12px', borderRadius: '999px', fontSize: '14px', letterSpacing: '.14em' } }, parent,
    LOGO('wm').replace('width="64" height="64"', 'width="20" height="20"') + 'ZETASTRUCT.APP')
}

// ── HOOK — the finished cages turning, the promise in two bars ──
const hook = (() => {
  const s = SEG.hook, root = layer(), img = frameImg(root)
  h('div', { class: 'abs', style: { inset: 0, background: 'linear-gradient(90deg, rgba(11,26,46,.55) 0%, rgba(11,26,46,0) 55%)', zIndex: 1 } }, root)
  const box = h('div', { class: 'abs', style: { left: '96px', top: '110px', zIndex: 2 } }, root)
  const l1 = h('div', { style: { display: 'inline-block', background: NAVY, color: WHITE, font: "800 76px 'Archivo'", padding: '10px 22px 8px', letterSpacing: '-.01em', textTransform: 'uppercase' } }, box, 'Design a whole RC frame')
  h('br', {}, box)
  const l2 = h('div', { style: { display: 'inline-block', background: AMBER, color: NAVY, font: "800 76px 'Archivo'", padding: '8px 22px', marginTop: '10px', letterSpacing: '-.01em', textTransform: 'uppercase' } }, box, 'In 3D — in minutes')
  h('br', {}, box)
  const l3 = h('div', { class: 'mono', style: { display: 'inline-block', background: 'rgba(11,26,46,.9)', color: '#cfe0f3', fontSize: '20px', padding: '10px 18px', marginTop: '12px', letterSpacing: '.16em' } }, box, 'NSCP 2015 · ACI 318-14 · FEM · DESIGN · PLANS')
  return { root, a: s.t0, b: s.t1, async update(t) {
    const u = seg(t, s.t0, s.t1), q = D.hookSeq
    await img.set(q[clamp(Math.round(u * (q.length - 1)), 0, q.length - 1)])
    const w = 860 - 90 * E.inOutSine(u); place(img.el, 320 + 40 * u, 190, w)
    ;[l1, l2, l3].forEach((el, i) => { const k = E.outExpo(seg(t, 0.15 + i * 0.22, 0.75 + i * 0.22)); el.style.clipPath = `inset(0 ${(1 - k) * 100}% 0 0)` })
  } }
})()
// ── TITLE — the product card ──
const title = (() => {
  const s = SEG.title, root = layer()
  h('div', { class: 'abs', style: { inset: 0, background: `radial-gradient(1400px 900px at 70% 40%, #17304f 0%, ${NAVY} 60%, #08121f 100%)` } }, root)
  h('div', { class: 'grid', style: { opacity: 0.6 } }, root)
  const left = h('div', { class: 'abs', style: { left: '120px', top: '300px', width: '760px' } }, root)
  h('div', { style: { display: 'flex', alignItems: 'center', gap: '18px', color: WHITE } }, left, LOGO('tc').replace('width="64" height="64"', 'width="74" height="74"') + WORD_SVG(40, WHITE))
  h('div', { class: 'mono', style: { color: AMBER, fontSize: '22px', marginTop: '46px', letterSpacing: '.2em' } }, left, '3D MODEL SPACE')
  h('div', { style: { font: "800 92px/0.98 'Archivo'", color: WHITE, marginTop: '16px', letterSpacing: '-.03em' } }, left, 'Frame analysis<br>&amp; design')
  h('div', { style: { fontSize: '26px', color: '#9eb0c5', marginTop: '22px' } }, left, 'RC frames to NSCP 2015 / ACI 318-14')
  const shot = h('img', { class: 'abs', src: D.hero, style: { left: '960px', top: '250px', width: '860px', borderRadius: '12px', boxShadow: '0 50px 120px -30px rgba(0,0,0,.7)' } }, root)
  return { root, a: s.t0, b: s.t1, async update(t) {
    const k = E.outExpo(seg(t, s.t0 + 0.1, s.t0 + 1.1))
    left.style.transform = `translateY(${(1 - k) * 40}px)`; left.style.opacity = k
    shot.style.transform = `translateX(${(1 - k) * 80}px) perspective(1600px) rotateY(${-10 + 4 * seg(t, s.t0, s.t1)}deg)`; shot.style.opacity = k
  } }
})()
// ── THE RECORDING — one take, chapters 01–11 ──
const rec = (() => {
  const root = layer(), a = D.T0, b = D.T0 + D.REC
  const base = frameImg(root, 0), prev = frameImg(root, 1)
  const curEl = h('div', { class: 'abs', style: { width: '44px', height: '44px', zIndex: 22, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.35))', transformOrigin: '6px 4px' } }, root,
    '<svg viewBox="0 0 24 24" width="44" height="44"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.4-3.6-6.9L4 20z" fill="#fff" stroke="#0b1a2e" stroke-width="1.6" stroke-linejoin="round"/></svg>')
  const rip = h('div', { class: 'abs', style: { width: '64px', height: '64px', borderRadius: '50%', border: `4px solid ${AMBER}`, zIndex: 21 } }, root)
  const pill = h('div', { class: 'abs', style: { zIndex: 23, background: AMBER, color: NAVY, font: "700 26px 'Archivo'", padding: '9px 18px 9px 16px', borderRadius: '10px', whiteSpace: 'nowrap', boxShadow: '0 14px 30px -10px rgba(3,8,16,.55)' } }, root)
  const busy = h('div', { class: 'abs mono', style: { zIndex: 24, left: '50%', top: '40px', transform: 'translateX(-50%)', background: 'rgba(11,26,46,.92)', color: WHITE, padding: '12px 22px', borderRadius: '999px', fontSize: '18px', letterSpacing: '.16em' } }, root, 'Solving · sped up ▸▸')
  const thirds = TL.filter((s) => s.n).map((s) => ({ s, lt: lowerThird(root, s.n, s.title, s.sub) }))
  watermark(root)
  // the report, fanned out over the app at the download click
  const dim = h('div', { class: 'abs', style: { inset: 0, background: 'rgba(8,18,31,.78)', zIndex: 25 } }, root)
  const pages = D.pages.map((src, i) => h('img', { class: 'abs', src, style: { zIndex: 26, left: 470 + i * 250 + 'px', top: '120px', width: '560px', borderRadius: '4px', boxShadow: '0 40px 90px -20px rgba(0,0,0,.75)', transformOrigin: '50% 100%' } }, root))
  return { root, a, b, async update(t) {
    const r = t - D.T0, P = D.plan[clamp(Math.floor(r * D.fps), 0, D.plan.length - 1)]
    const [ia, ib, k, x, y, w, cx, cy, pr, ra, rx, ry, ci, ck, bz] = P
    await base.set(D.names[ia])
    prev.el.style.display = ib < 0 ? 'none' : 'block'
    if (ib >= 0) { await prev.set(D.names[ib]); prev.el.style.opacity = 1 - k; place(prev.el, x, y, w) }
    const s = place(base.el, x, y, w)
    const sx = (cx - x) * s, sy = (cy - y) * s
    css(curEl, { left: sx - 6 + 'px', top: sy - 4 + 'px', transform: `scale(${pr ? 0.84 : 1})` })
    css(rip, { left: rx >= 0 ? (rx - x) * s - 32 + 'px' : '-99px', top: ry >= 0 ? (ry - y) * s - 32 + 'px' : '-99px', opacity: ra >= 0 ? 1 - ra / 0.6 : 0, transform: `scale(${0.3 + (ra >= 0 ? ra / 0.6 : 0) * 1.5})` })
    if (ci >= 0 && ck > 0) {
      const txt = D.calls[ci]; if (pill.dataset.t !== txt) { pill.dataset.t = txt; pill.innerHTML = txt.replace('›', '<span style="opacity:.55;margin:0 6px">›</span>') }
      const right = sx > VW - 520, below = sy < 120
      css(pill, { opacity: E.outCubic(ck), left: right ? 'auto' : sx + 34 + 'px', right: right ? VW - sx + 22 + 'px' : 'auto', top: (below ? sy + 52 : sy - 62) + 'px', transform: `translateY(${(1 - E.outCubic(ck)) * 10}px)` })
    } else pill.style.opacity = 0
    busy.style.opacity = bz
    for (const { s: c, lt } of thirds) lt.set(t, c.t0, c.t1)
    // report fan: from just after the download click to the end of chapter 10
    const c10 = SEG.c10, p0 = D.T0 + D.c10click + 0.7, p1 = c10.t1 - 0.2
    const shown = t >= p0 - 0.1 && t <= p1 + 0.5
    dim.style.opacity = shown ? E.outCubic(seg(t, p0, p0 + 0.4)) * (1 - E.inCubic(seg(t, p1 - 0.3, p1 + 0.2))) : 0
    pages.forEach((p, i) => {
      const kk = E.outBack(clamp(seg(t, p0 + 0.1 + i * 0.3, p0 + 0.8 + i * 0.3))), out = E.inCubic(seg(t, p1 - 0.35, p1 + 0.15))
      p.style.opacity = shown ? clamp(kk * 2) * (1 - out) : 0
      p.style.transform = `translateY(${(1 - kk) * 260 + out * 200}px) rotate(${(i - (pages.length - 1) / 2) * 5 * kk}deg)`
    })
  } }
})()
// ── END — the free CTA ──
const end = (() => {
  const s = SEG.end, root = layer()
  h('div', { class: 'abs', style: { inset: 0, background: `radial-gradient(1400px 900px at 30% 40%, #17304f 0%, ${NAVY} 60%, #08121f 100%)` } }, root)
  h('div', { class: 'grid', style: { opacity: 0.6 } }, root)
  const box = h('div', { class: 'abs', style: { left: '140px', top: '250px' } }, root)
  h('div', { style: { display: 'flex', alignItems: 'center', gap: '22px', color: WHITE } }, box, LOGO('ec').replace('width="64" height="64"', 'width="110" height="110"') + WORD_SVG(64, WHITE))
  h('div', { class: 'mono', style: { color: AMBER, fontSize: '24px', marginTop: '44px', letterSpacing: '.2em' } }, box, 'START FREE')
  h('div', { style: { font: "800 60px/1.02 'Archivo'", color: WHITE, marginTop: '14px', letterSpacing: '-.02em', width: '960px' } }, box, 'Structural engineering,<br>made clearer.')
  const btn = h('div', { style: { display: 'inline-flex', marginTop: '36px', background: AMBER, color: NAVY, font: "800 40px 'Archivo'", padding: '16px 34px', borderRadius: '999px', gap: '16px', alignItems: 'center' } }, box, 'zetastruct.app <span style="font-size:36px">→</span>')
  h('div', { style: { fontSize: '24px', color: '#9eb0c5', marginTop: '28px' } }, box, 'Free calculators · 3D Model Space on the Pro plan')
  const wrap = h('div', { class: 'abs', style: { left: '1200px', top: '330px', width: '620px', height: '349px', overflow: 'hidden', borderRadius: '12px', boxShadow: '0 50px 120px -30px rgba(0,0,0,.7)' } }, root)
  const shot = h('img', { class: 'abs', src: D.endShot, style: { width: '1240px', left: '-560px', top: '-300px' } }, wrap)
  return { root, a: s.t0, b: s.t1, async update(t) {
    const k = E.outExpo(seg(t, s.t0 + 0.1, s.t0 + 1.0))
    box.style.opacity = k; box.style.transform = `translateY(${(1 - k) * 30}px)`
    wrap.style.opacity = k; wrap.style.transform = `translateX(${(1 - k) * 60}px)`
    btn.style.transform = `scale(${1 + 0.04 * Math.sin(Math.max(0, t - s.t0 - 1) * 4) * Math.exp(-Math.max(0, t - s.t0 - 1))})`
  } }
})()

const SCENES = [hook, title, rec, end]
const XF = 0.45                                           // crossfade into each scene
window.render = async (t) => {
  for (const [i, sc] of SCENES.entries()) {
    const nxt = SCENES[i + 1], on = t >= sc.a && t < sc.b + (nxt ? XF : 0.0001)
    sc.root.style.display = on ? 'block' : 'none'
    if (!on) continue
    sc.root.style.zIndex = i
    sc.root.style.opacity = i ? E.outCubic(seg(t, sc.a, sc.a + XF)) : 1
    await sc.update(Math.min(t, sc.b))
  }
}
window.DURATION = TL.at(-1).t1
