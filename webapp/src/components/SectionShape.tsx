import type { EffectiveSection } from '../engine/aiscSections'

// Accurate-to-geometry cross-section drawing for an AISC shape (W/C/L/2L/HSS/
// Pipe/WT). Drawn to scale inside a fixed viewBox; steel is filled, the section
// name + the governing dimensions are labelled. Pure SVG.
const FILL = '#94a3b8', EDGE = '#37526e', BLUE = '#0056b3'

export function SectionShape({ sec }: { sec: EffectiveSection }) {
  const VB = 150, pad = 22
  const s = sec.base
  // overall bounding box (mm) of what we draw
  const box = (() => {
    if (sec.double && s.leg1) return { w: 2 * (s.leg1 ?? 0) + (sec.gap ?? 10), h: s.leg2 ?? 0 }
    if (s.family === 'W' || s.family === 'WT') return { w: s.bf ?? 100, h: s.d ?? 100 }
    if (s.family === 'C') return { w: (s.bf ?? 60) + (s.tw ?? 10), h: s.d ?? 100 }
    if (s.family === 'L') return { w: s.leg1 ?? 50, h: s.leg2 ?? 50 }
    if (s.family === 'HSS') return { w: s.b ?? 100, h: s.h ?? 100 }
    return { w: s.D ?? 100, h: s.D ?? 100 }   // pipe
  })()
  const scl = (VB - 2 * pad) / Math.max(box.w, box.h)
  const W = box.w * scl, H = box.h * scl
  const ox = (VB - W) / 2, oy = (VB - H) / 2
  const px = (mm: number) => mm * scl

  const shapeEl = (() => {
    if (s.family === 'W' || s.family === 'WT') {
      const tf = px(s.tf ?? 8), tw = px(s.tw ?? 6), cxw = ox + W / 2
      if (s.family === 'WT') {
        // tee: top flange + stem down
        return <>
          <rect x={ox} y={oy} width={W} height={tf} fill={FILL} stroke={EDGE} />
          <rect x={cxw - tw / 2} y={oy + tf} width={tw} height={H - tf} fill={FILL} stroke={EDGE} />
        </>
      }
      return <>
        <rect x={ox} y={oy} width={W} height={tf} fill={FILL} stroke={EDGE} />
        <rect x={ox} y={oy + H - tf} width={W} height={tf} fill={FILL} stroke={EDGE} />
        <rect x={cxw - tw / 2} y={oy + tf} width={tw} height={H - 2 * tf} fill={FILL} stroke={EDGE} />
      </>
    }
    if (s.family === 'C') {
      const tf = px(s.tf ?? 9), tw = px(s.tw ?? 8), bf = px(s.bf ?? 60)
      return <>
        <rect x={ox} y={oy} width={tw} height={H} fill={FILL} stroke={EDGE} />          {/* web (back) */}
        <rect x={ox + tw} y={oy} width={bf} height={tf} fill={FILL} stroke={EDGE} />
        <rect x={ox + tw} y={oy + H - tf} width={bf} height={tf} fill={FILL} stroke={EDGE} />
      </>
    }
    if (s.family === 'L') {
      const t = px(s.t ?? 8), l1 = px(s.leg1 ?? 50), l2 = px(s.leg2 ?? 50), g = px(sec.gap ?? 10)
      const angle = (x0: number, flip = false) => flip
        ? <path d={`M ${x0 + l1} ${oy} h ${-t} v ${l2 - t} h ${-(l1 - t)} v ${t} h ${l1} Z`} fill={FILL} stroke={EDGE} />
        : <path d={`M ${x0} ${oy} h ${t} v ${l2 - t} h ${l1 - t} v ${t} h ${-l1} Z`} fill={FILL} stroke={EDGE} />
      if (sec.double) return <>{angle(ox)}{angle(ox + l1 + g, true)}</>
      return angle(ox)
    }
    if (s.family === 'HSS') {
      const t = px(s.t ?? 6)
      return <>
        <rect x={ox} y={oy} width={W} height={H} fill={FILL} stroke={EDGE} />
        <rect x={ox + t} y={oy + t} width={W - 2 * t} height={H - 2 * t} fill="#fff" stroke={EDGE} />
      </>
    }
    // pipe / round HSS
    const t = px(s.t ?? 6), cxp = ox + W / 2, cyp = oy + H / 2, R = W / 2
    return <>
      <circle cx={cxp} cy={cyp} r={R} fill={FILL} stroke={EDGE} />
      <circle cx={cxp} cy={cyp} r={R - t} fill="#fff" stroke={EDGE} />
    </>
  })()

  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxWidth: 200, height: 'auto', fontFamily: 'Arial' }}>
      <rect x={0.5} y={0.5} width={VB - 1} height={VB - 1} fill="#f8fafc" stroke="#e2e8f0" />
      {shapeEl}
      <text x={VB / 2} y={VB - 5} fontSize={9} fontWeight={700} fill={BLUE} textAnchor="middle">{sec.label}</text>
      <text x={4} y={11} fontSize={8} fill="#64748b">A = {Math.round(sec.A)} mm²</text>
      <text x={VB - 4} y={11} fontSize={8} fill="#64748b" textAnchor="end">r_min {sec.rmin.toFixed(1)} mm</text>
    </svg>
  )
}
