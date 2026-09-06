// The fullscreen plan viewer, pinned the way this repo pins components: the
// parts that are pure are tested as code, the wiring is tested as source.
// (Vitest runs with `environment: 'node'` and there is no DOM library — see
// ErrorBoundary.test.tsx for why that is a repo-level decision this file does
// not get to make.)
//
// What matters here:
// - the ends of the set are walls, not a carousel (stepIndex);
// - "next" in the viewer moves the way the tab stacks the sheets (flat order
//   == grouped display order — the whole reason the viewer can be driven by
//   one flat index);
// - the wiring: click-to-open on the drawing, the zones, the save button
//   saving the very bytes on screen, Escape leaving.

import { describe, it, expect } from 'vitest'
import { generateGridModel } from '../engine/modelBuilder'
import { designStructure } from '../engine/pipeline'
import { buildSheetSet, groupSheets, stepIndex } from '../lib/planSheets'
import plansPanelSrc from './PlansPanel.tsx?raw'
import planViewerSrc from './PlanViewer.tsx?raw'
import type { RectSection, ModelLoad } from '../engine/model'

describe('stepIndex — the ends are walls', () => {
  it('steps mid-set both ways', () => {
    expect(stepIndex(2, 5, -1)).toBe(1)
    expect(stepIndex(2, 5, 1)).toBe(3)
  })

  it('clamps at both ends instead of wrapping', () => {
    expect(stepIndex(0, 5, -1)).toBe(0)
    expect(stepIndex(4, 5, 1)).toBe(4)
  })

  it('a one-sheet set has nowhere to go', () => {
    expect(stepIndex(0, 1, -1)).toBe(0)
    expect(stepIndex(0, 1, 1)).toBe(0)
  })

  it('survives an index past the end — a set that shrank underneath the viewer', () => {
    expect(stepIndex(9, 5, -1)).toBe(4)
    expect(stepIndex(-2, 5, 1)).toBe(0)
  })
})

describe('the viewer walks the set the way the tab stacks it', () => {
  // The viewer opens with the flat index of the clicked sheet and flips with
  // ±1 over the flat set. The page displays the set GROUPED. If grouping ever
  // reordered a sheet, "next" would land somewhere other than where the page
  // reads — so flat order and grouped order are pinned equal here, on a set
  // with every group populated.

  const section: RectSection = { id: 'S1', name: '400×400', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
  const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }
  const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3, 3], section, slabThickness: 150 })
  m.loads = m.plates.flatMap((p): ModelLoad[] => [
    { kind: 'area', plate: p.id, q: 4.0, cat: 'D' },
    { kind: 'area', plate: p.id, q: 2.4, cat: 'L' },
  ])
  m.plates[0].openings = [{ id: 'O1', kind: 'rect', x: 2.0, y: 1.8, w: 1.0, h: 0.8 }]
  m.walls = [{ id: 'w0', member: m.members.find((x) => x.role === 'beam')!.id, height: 3, thickness: 200, shearWall: true }]
  const design = designStructure(m, soil)!

  it('grouped display order == flat sheet order', () => {
    const flat = buildSheetSet(m, design, soil)
    const grouped = groupSheets(flat).flatMap((g) => g.sheets)
    expect(grouped.map((s) => s.key)).toEqual(flat.map((s) => s.key))
  })

  it('the set has more than one sheet — a viewer over one sheet proves nothing', () => {
    expect(buildSheetSet(m, design, soil).length).toBeGreaterThan(1)
  })
})

describe('PlanViewer wiring (source guards)', () => {
  it('is a fixed overlay at the dialog level, a real dialog to a screen reader', () => {
    expect(planViewerSrc).toMatch(/fixed inset-0 z-\[110\]/)
    expect(planViewerSrc).toMatch(/role="dialog"/)
    expect(planViewerSrc).toMatch(/aria-modal="true"/)
  })

  it('the edges are labelled click zones, and they dead-end at the ends', () => {
    expect(planViewerSrc).toMatch(/aria-label="Previous sheet"/)
    expect(planViewerSrc).toMatch(/aria-label="Next sheet"/)
    expect(planViewerSrc).toMatch(/disabled=\{i === 0\}/)
    expect(planViewerSrc).toMatch(/disabled=\{i === count - 1\}/)
  })

  it('the keyboard flips and leaves — unless a field owns the keys', () => {
    expect(planViewerSrc).toMatch(/'ArrowLeft'/)
    expect(planViewerSrc).toMatch(/'ArrowRight'/)
    expect(planViewerSrc).toMatch(/'Escape'/)
    expect(planViewerSrc).toMatch(/isTypingTarget\(e\.target\)/)
  })

  it("save writes THIS sheet's bytes under THIS sheet's name", () => {
    expect(planViewerSrc).toMatch(/downloadSvg\(`\$\{s\.key\}\.svg`, at\.svg\)/)
  })

  it('Escape and ✕ and the dark around the sheet all leave; the sheet itself stays', () => {
    expect(planViewerSrc).toMatch(/onMouseDown=\{onClose\}/)
    expect(planViewerSrc).toMatch(/onMouseDown=\{\(e\) => e\.stopPropagation\(\)\}/)
    expect(planViewerSrc).toMatch(/aria-label="Close full screen view"/)
  })

  it('sizes the sheet by its own viewBox, so the letterbox is genuinely backdrop', () => {
    expect(planViewerSrc).toMatch(/viewBox="0 0/)
    expect(planViewerSrc).toMatch(/aspectRatio: ratio/)
  })

  it('the sheet actually FILLS the screen — width-driven fit, not shrink-to-fit', () => {
    // The regression this pins: the injected svg has only a viewBox, so its
    // intrinsic size is 300×150. A sheet box without a width shrink-wraps to
    // that and the "fullscreen" plan opens thumbnail-sized. The box must fill
    // the stage's width and be capped by the stage's height (the svg inside
    // letterboxes itself); the stage clips the overflow either way.
    expect(planViewerSrc).toMatch(/"w-full max-h-full/)
    expect(planViewerSrc).toMatch(/overflow-hidden/)
  })
})

describe('PlansPanel wiring (source guards)', () => {
  it('opens the viewer with the flat set, clamped, and clears on close', () => {
    expect(plansPanelSrc).toMatch(/<PlanViewer/)
    expect(plansPanelSrc).toMatch(/index=\{Math\.min\(viewing, sheets\.length - 1\)\}/)
    expect(plansPanelSrc).toMatch(/onClose=\{\(\) => setViewing\(null\)\}/)
  })

  it('the drawing itself is the way in — click, keyboard, and an honest cursor', () => {
    expect(plansPanelSrc).toMatch(/onClick=\{onOpen\}/)
    expect(plansPanelSrc).toMatch(/role="button"/)
    expect(plansPanelSrc).toMatch(/'Enter' \|\| e\.key === ' '/)
    expect(plansPanelSrc).toMatch(/cursor-zoom-in/)
  })

  it('the header keeps an explicit fullscreen button beside the download', () => {
    expect(plansPanelSrc).toMatch(/title="View full screen"/)
    expect(plansPanelSrc).toMatch(/↓ SVG/)
  })

  it('both save buttons share the one download helper — no second copy', () => {
    expect(plansPanelSrc).toMatch(/import \{ downloadSvg \} from '\.\.\/lib\/downloadSvg'/)
    expect(plansPanelSrc).not.toMatch(/function download\(/)
  })

  it('says why the drawings are clickable', () => {
    expect(plansPanelSrc).toMatch(/Click a plan to view it full screen\./)
  })
})
