// ════════════════════════════════════════════════════════════════════════
// A · OPEN (0–4): one field, typed; then every field; then a point
// ════════════════════════════════════════════════════════════════════════
const WALL_KEYS = ['beam-design', 'slope', 'hydraulic-jump', 'bolted-connection', 'retaining-wall', 'traverse', 'column-design', 'pipe-flow', 'foundation', 'signal-timing', 'lateral-pile', 'water-tank', 'steel_beam', 'settlement', 'simple-curve', 'culvert', 'stair', 'interest-factors', 'pile-cap', 'do-sag', 'welded-connection', 'bearing-capacity', 'muskingum', 'vertical-curves']
const WALL = []
for (let k = 0; WALL.length < 99 && k < 12; k++) for (const key of WALL_KEYS) {
  const f = C[key].fields.filter((x) => x.value && String(x.value).length < 18)[k]
  if (f && WALL.length < 99) WALL.push(f)
}
const A = scene(0, 4.2, (root) => {
  const grid = darkGround(root)
  const world = h('div', { class: 'abs ws', style: { left: 0, top: 0, width: W + 'px', height: H + 'px' } }, root)
  // the wall: 11 × 9 fields on cards, the hero at the centre
  const CW = 236, CH = 104, NX = 11, NY = 9
  const cells = []
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const cx = W / 2 + (i - (NX - 1) / 2) * CW, cy = H / 2 + (j - (NY - 1) / 2) * CH
    const hero = i === (NX - 1) / 2 && j === (NY - 1) / 2
    const f = hero ? { label: 'Height <i>H</i>', value: '10', unit: 'm' } : WALL[(j * NX + i) % WALL.length]
    const bg = h('div', { class: 'abs', style: { left: cx - 104 + 'px', top: cy - 44 + 'px', width: '208px', height: '84px', background: '#fff', borderRadius: '10px', boxShadow: '0 14px 40px -16px rgba(0,0,0,.6)' } }, world)
    const ff = field(bg, f, 16, 14, 176)
    const d = Math.hypot(i - (NX - 1) / 2, (j - (NY - 1) / 2) * 1.4)
    cells.push({ bg, ff, cx, cy, d, hero, row: j, i, j })
  }
  const dot = h('div', { class: 'abs', style: { left: W / 2 - 9 + 'px', top: H / 2 - 9 + 'px', width: '18px', height: '18px', borderRadius: '50%', background: '#f2b53a' } }, root)
  const tag = h('div', { class: 'abs mono', style: { left: W / 2 + 'px', top: H / 2 + 190 + 'px', fontSize: '15px', color: '#9eb0c5', transform: 'translateX(-50%)', whiteSpace: 'nowrap' } }, root)
  return { grid, world, cells, dot, tag }
})
A.update = (t) => {
  const s = A
  op(s.grid, ease(t, 0, 1.4, E.outCubic) * 0.8)
  // camera: tight on the hero field, drifting in; the kick on bar 2 throws it back
  const pull = ease(t, 2.0, 2.85, E.outExpo)
  const sc = lerp(3.3 + 0.18 * ease(t, 0, 2, E.outCubic), 0.86, pull) * (1 - 0.94 * ease(t, 3.45, 3.98, E.inExpo))
  const rot = lerp(0, -4, pull) + lerp(0, 9, ease(t, 3.45, 3.98, E.inExpo))
  tf(s.world, `translate(${W / 2}px, ${H / 2}px) rotate(${rot}deg) scale(${sc}) translate(${-W / 2}px, ${-H / 2}px)`)
  s.world.style.transformOrigin = '0 0'
  // a row shear on the off-beat, alternate rows opposite ways — the hero rides
  // its row too, or its neighbour slides over it and leaves a hole beside it
  const shear = (j) => (j % 2 ? 1 : -1) * 120 * (ease(t, 2.72, 3.0, E.outExpo) - ease(t, 3.22, 3.45, E.inOutCubic))
  for (const c of s.cells) {
    if (c.hero) {
      const inP = spring(t - 0.05, 2.2, 0.55)
      tf(c.bg, `translate(${shear(c.j)}px, 0) scale(${clamp(inP, 0, 1.2)})`); op(c.bg, t > 0.05 ? 1 : 0)
      const v = t < 0.75 ? 0 : t < 1.25 ? 0.5 : 1
      c.ff.set(v, t > 0.3 && t < 1.5 && Math.floor(t * 4) % 2 === 0 || (t >= 0.6 && t < 1.5))
      c.ff.bx.style.borderColor = t >= 1.5 ? '#0f4c92' : c.ff.bx.style.borderColor
      continue
    }
    const at = 2.0 + c.d * 0.055
    const p = spring(t - at, 2.6, 0.5)
    tf(c.bg, `translate(${shear(c.j)}px, 0) scale(${clamp(p, 0, 1.15)})`)
    op(c.bg, t >= at ? 1 : 0)
    c.ff.set(ease(t, at + 0.1, at + 0.45, E.lin), false)
  }
  // everything falls into one point
  const col = ease(t, 3.45, 3.98, E.inExpo)
  op(s.world, 1 - ease(t, 3.85, 3.98))
  const dp = ease(t, 3.75, 3.95, E.outBack)
  tf(s.dot, `scale(${t < 3.75 ? 0 : dp * (t >= 4 ? 1 + 2.5 * Math.exp(-(t - 4) * 12) : 1)})`)
  s.dot.style.boxShadow = `0 0 ${20 + 40 * col}px rgba(242,181,58,.85), 0 0 100px rgba(242,181,58,.3)`
  op(s.dot, t < 4.15 ? 1 : 0)
  s.tag.textContent = t < 2 ? scramble('ONE INPUT', seg(t, 0.4, 1.0), 4) : t < 3.45 ? scramble(`${s.cells.length} INPUTS · 24 CALCULATORS`, seg(t, 2.1, 2.7), 6) : ''
  op(s.tag, (1 - pull * 0.0) * (t < 1.9 ? ease(t, 0.4, 0.7) : 1) * (1 - ease(t, 3.3, 3.45)))
  css(s.tag, { top: (t < 2 ? H / 2 + 200 : H - 150) + 'px' })
}

// ════════════════════════════════════════════════════════════════════════
// B · TITLE (4–8): the logo from the point; 108; every one shows its work
// ════════════════════════════════════════════════════════════════════════
const B1 = scene(3.95, 8.25, (root) => {
  const grid = darkGround(root)
  const logoBox = h('div', { class: 'abs', style: { width: '300px', height: '300px' } }, root, LOGO('lgB'))
  const lg = $('#lgB', logoBox)
  const ring = h('div', { class: 'abs', style: { left: W / 2 - 300 + 'px', top: H / 2 - 300 + 'px', width: '600px', height: '600px', borderRadius: '50%', border: '1.5px solid rgba(242,181,58,.9)' } }, root)
  const ring2 = h('div', { class: 'abs', style: { left: W / 2 - 300 + 'px', top: H / 2 - 300 + 'px', width: '600px', height: '600px', borderRadius: '50%', border: '1px solid rgba(232,234,237,.6)' } }, root)
  const WM = WORD(112); root.appendChild(WM.el)
  const word = WM.el, letters = WM.letters
  const codes = h('div', { class: 'abs mono', style: { fontSize: '19px', color: '#9eb0c5', whiteSpace: 'pre', letterSpacing: '.22em' } }, root)
  const rule = h('div', { class: 'abs', style: { height: '1px', background: 'rgba(158,176,197,.5)' } }, root)
  // the kinetic headline
  const kin = h('div', { class: 'abs', style: { left: '170px', top: '0px' } }, root)
  const num = h('div', { class: 'disp', style: { fontSize: '300px', fontWeight: 900, color: '#f2f5f9', letterSpacing: '-.05em', height: '270px', lineHeight: '270px', overflow: 'hidden', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }, kin)
  const digits = [0, 1, 2].map(() => {
    const col = h('span', { style: { display: 'inline-block', height: '270px', overflow: 'hidden', verticalAlign: 'top' } }, num)
    const strip = h('span', { style: { display: 'block' } }, col)
    for (let d = 0; d <= 19; d++) h('span', { style: { display: 'block', height: '270px' } }, strip, String(d % 10))
    return strip
  })
  const lab = h('div', { class: 'disp', style: { fontSize: '120px', color: '#6ba4dc', height: '128px', overflow: 'hidden', whiteSpace: 'nowrap' } }, kin, '<span style="display:inline-block">tools.</span>')
  const lines = ['Every answer', 'shows its work'].map((txt) => h('div', { class: 'disp', style: { fontSize: '120px', color: '#f2f5f9', height: '128px', overflow: 'hidden', whiteSpace: 'nowrap', paddingBottom: '20px', marginBottom: '-20px', boxSizing: 'content-box' } }, kin, `<span style="display:inline-block">${txt}</span>`))
  const stop = h('div', { class: 'abs', style: { width: '26px', height: '26px', borderRadius: '50%', background: '#f2b53a' } }, root)
  const side = h('div', { class: 'abs mono', style: { left: '1330px', top: '0px', fontSize: '15px', color: '#9eb0c5', lineHeight: '2.1', whiteSpace: 'pre' } }, root)
  return { grid, logoBox, lg, ring, ring2, word, letters, WM, codes, rule, kin, num, digits, lab, lines, stop, side }
})
B1.update = (t) => {
  const s = B1
  op(s.grid, 0.75)
  tf(s.grid, `scale(${1.04 - 0.04 * ease(t, 4, 8, E.outCubic)})`)
  // the logo unfolds out of the point: the diagonal from its centre, then both bars
  const lb = s.lg
  markFromCentre(lb, { diag: clamp(spring(t - 4.0, 2.6, 0.45), 0, 1.06), top: ease(t, 4.14, 4.42), bot: ease(t, 4.2, 4.48), shade: ease(t, 4.45, 4.8) })
  markFlash(lb, 1.4 * Math.exp(-(t - 4) * 5), 1.4)
  // lockup: centred, then steps left on beat 2; leaves up on bar 4
  const slide = ease(t, 4.5, 5.0)
  const out = ease(t, 5.75, 6.1, E.inExpo)
  const size = lerp(300, 210, slide)
  const cx = W / 2 + lerp(0, -360, slide), cy = H / 2 + lerp(0, -30, slide) - out * 900
  // the mark's centre (the point it unfolds from) sits on the screen centre
  const nodeOff = 0
  css(s.logoBox, { left: cx - size / 2 + 'px', top: cy - size / 2 - (1 - slide) * nodeOff + 'px', width: size + 'px', height: size + 'px' })
  lb.setAttribute('width', size); lb.setAttribute('height', size)
  tf(s.logoBox, `scale(${t < 4.6 ? 0.6 + 0.4 * ease(t, 4.0, 4.6) : 1})`)
  const r1 = seg(t, 4.0, 4.9), r2 = seg(t, 4.08, 5.3)
  tf(s.ring, `scale(${0.05 + E.outExpo(r1) * 1.6})`); op(s.ring, (1 - r1) * 0.9)
  tf(s.ring2, `scale(${0.05 + E.outExpo(r2) * 2.4})`); op(s.ring2, t >= 4.08 ? (1 - r2) * 0.5 : 0)
  css(s.word, { left: cx + size / 2 + 40 + 'px', top: cy - 56 + 'px' })
  s.WM.set([0, 1, 2, 3].map((i) => ease(t, 4.55 + i * 0.05, 5.1 + i * 0.05)), lerp(0.2, 0.04, ease(t, 4.55, 5.4)))
  css(s.codes, { left: cx + size / 2 + 42 + 'px', top: cy + 98 + 'px' })
  s.codes.textContent = scramble('STANDALONE CALCULATORS  ·  WORKED SOLUTIONS', seg(t, 5.0, 5.6), 21)
  css(s.rule, { left: cx + size / 2 + 42 + 'px', top: cy + 82 + 'px', width: s.WM.width() * ease(t, 5.0, 5.5) + 'px' })
  ;[s.word, s.codes, s.rule].forEach((e) => { e.style.filter = `blur(${out * 12}px)`; op(e, 1 - out) })
  // 108 rolls in on bar 4's downbeat; one beat a line after it
  const T0 = 6.0
  const top = H / 2 - 300 - 60 * ease(t, 6.5, 7.6, E.outCubic)
  css(s.kin, { top: top + 'px' })
  const target = [1, 0, 8]
  s.digits.forEach((st, i) => {
    const p = ease(t, T0 + i * 0.06, T0 + 0.55 + i * 0.08, E.outExpo)
    const v = (10 + target[i]) * p
    tf(st, `translateY(${-v * 270}px)`)
  })
  op(s.num, t >= T0 ? 1 : 0)
  const lp = ease(t, 6.2, 6.6)
  tf(s.lab.firstChild, `translateY(${(1 - lp) * 130}px)`)
  const at = [6.5, 7.0]
  s.lines.forEach((l, i) => { const p = ease(t, at[i], at[i] + 0.4); tf(l.firstChild, `translateY(${(1 - p) * 140}px)`); l.style.color = i === 1 ? '#f2f5f9' : '#f2f5f9' })
  const L = s.lines[1].firstChild
  const sx = 170 + L.offsetWidth + 12, sy = top + 270 + 128 + 128 + 70
  css(s.stop, { left: sx + 'px', top: sy + 'px' })
  const dp = spring(t - 7.5, 3, 0.4)
  tf(s.stop, `scale(${t < 7.5 ? 0 : dp})`)
  s.stop.style.boxShadow = `0 0 ${16 + 30 * Math.exp(-(t - 7.5) * 3)}px rgba(242,181,58,.8), 0 0 70px rgba(242,181,58,.25)`
  s.side.textContent = t < 6.3 ? '' : ['15 DISCIPLINES', 'NSCP 2015 · ACI 318-14', 'AISC 360-16 · AASHTO LRFD', 'FHWA · PCA · HCM', 'INPUTS → CHECKS → DRAWING', '→ STEP-BY-STEP SOLUTION'].map((x, i) => scramble(x, seg(t, 6.3 + i * 0.12, 6.75 + i * 0.12), 30 + i)).join('\n')
  css(s.side, { top: top + 40 + 'px' })
  // exit: up, with the full stop staying behind as a point for the cut
  const ex = ease(t, 7.8, 8.15, E.inExpo)
  tf(s.kin, `translateY(${-ex * 1100}px)`); s.kin.style.filter = `blur(${ex * 10}px)`
  tf(s.side, `translateY(${-ex * 1100}px)`)
  op(s.logoBox, 1 - out)
}
