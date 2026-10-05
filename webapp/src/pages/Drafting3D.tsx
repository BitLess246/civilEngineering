/**
 * Drafting3D — 2D floor plan drafting with real-time 3D viewport.
 * Exports to ModelSpace StructuralModel format.
 *
 * Revit-style modelling aids: wall-hosted doors & windows (tap a wall), finish
 * materials for slabs and ceilings, and a touch-first canvas — press-drag to
 * draw, drag elements to move them, pinch to zoom, two-finger drag to pan.
 */

import { useState, useCallback, useMemo } from 'react'
import { Drafting3DViewport } from '../components/Drafting3DViewport'
import { FloorPlanCanvas, type PlanTool } from '../components/FloorPlanCanvas'
import { useDraftProject } from '../lib/drafting3dSession'
import type { DraftProject } from '../engine/drafting3d'
import { addLevel, SLAB_MATERIALS, CEILING_MATERIALS, finishMaterial } from '../engine/drafting3d'

/** The ribbon, grouped the way Revit groups its tools. */
const TOOL_GROUPS: Array<{ label: string; tools: PlanTool[] }> = [
  { label: 'Modify', tools: ['select'] },
  { label: 'Structure', tools: ['wall', 'beam', 'column'] },
  { label: 'Openings', tools: ['door', 'window'] },
  { label: 'Model', tools: ['slab', 'ceiling', 'grid'] },
]

/** Status-bar hint per tool — the one-line contract before the first tap. */
const TOOL_HINTS: Record<PlanTool, string> = {
  select: 'Tap to select · drag an element or joint to move it · drag empty space to pan · pinch to zoom',
  wall: 'Tap two points, or press-drag-release — the wall completes either way',
  beam: 'Tap two points, or press-drag-release — the beam completes either way',
  column: 'Tap a grid point to drop a column (bottom here, top one storey up)',
  slab: 'Tap four corners to close a panel — the material picker sets its finish',
  door: 'Tap a wall — the door hosts on it and swings; drag it later to slide',
  window: 'Tap a wall — the window hosts on it at sill height; drag to slide',
  ceiling: 'Tap four corners of the room — the ceiling plane is finish, not structure',
  grid: 'Tap anywhere to add grid lines through that point',
}

export default function Drafting3D() {
  const { project, setProject, exportToModelSpace } = useDraftProject()
  const [activeTool, setActiveTool] = useState<PlanTool>('select')
  const [activeSectionId, setActiveSectionId] = useState('col-400x400')
  // Revit's type selector: the finish applied to NEW slabs / ceilings. One per
  // catalog, since the two lists serve different tools.
  const [slabMaterialId, setSlabMaterialId] = useState(SLAB_MATERIALS[0].id)
  const [ceilingMaterialId, setCeilingMaterialId] = useState(CEILING_MATERIALS[0].id)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // Phones get the 2D sheet by default — a half-width split pane is too
  // cramped to draw on; desktop keeps the split.
  const [viewMode, setViewMode] = useState<'2d' | '3d' | 'split'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? '2d' : 'split')
  const [showSectionPanel, setShowSectionPanel] = useState(false)
  const [showLevelPanel, setShowLevelPanel] = useState(false)

  const level = useMemo(() => project.levels.get(project.activeLevelId)!, [project])
  const sections = useMemo(() => Array.from(project.sections.values()), [project.sections])

  // The selected door/window (for the property editor) — first if several.
  const selectedOpening = useMemo(() => {
    for (const id of selectedIds) {
      const el = level.elements.get(id)
      if (el && (el.type === 'door' || el.type === 'window')) return el
    }
    return null
  }, [level.elements, selectedIds])

  /** Material the active tool/selection works with right now. */
  const activeMaterialId = activeTool === 'ceiling' ? ceilingMaterialId : slabMaterialId

  const handleProjectChange = useCallback((newProject: DraftProject) => {
    setProject(newProject)
  }, [setProject])

  const handleSelectionChange = useCallback((ids: string[]) => {
    setSelectedIds(ids)
  }, [])

  const handleSelect3D = useCallback((id: string) => {
    setSelectedIds(prev => (prev.length === 1 && prev[0] === id ? [] : [id]))
  }, [])

  const activateLevel = useCallback((id: string) => {
    setProject({ ...project, activeLevelId: id })
  }, [project, setProject])

  const handleAddLevel = useCallback(() => {
    const clone: DraftProject = { ...project, levels: new Map(project.levels) }
    addLevel(clone)
    setProject(clone)
  }, [project, setProject])

  const handleExportModelSpace = useCallback(() => {
    const model = exportToModelSpace(project)
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name}.model.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [project, exportToModelSpace])

  /** Edit the selected opening's properties (width / height / sill / swing). */
  const patchSelectedOpening = useCallback((patch: Partial<{ width: number; height: number; sill: number; swing: 0 | 1 | 2 | 3 }>) => {
    if (!selectedOpening) return
    const levels = new Map(project.levels)
    const lvl = levels.get(level.id)
    if (!lvl) return
    const elements = new Map(lvl.elements)
    elements.set(selectedOpening.id, { ...selectedOpening, ...patch })
    levels.set(level.id, { ...lvl, elements })
    setProject({ ...project, levels })
  }, [level.id, project, selectedOpening, setProject])

  /** Clicking a material applies it to the selection too (Revit behaviour:
   *  pick the type, then click elements — or retype what's selected). */
  const setMaterial = useCallback((id: string) => {
    if (activeTool === 'ceiling') setCeilingMaterialId(id)
    else setSlabMaterialId(id)
    const targets = selectedIds
      .map(id2 => level.elements.get(id2))
      .filter((el): el is NonNullable<typeof el> => !!el &&
        (activeTool === 'ceiling' ? el.type === 'ceiling' : el.type === 'slab'))
    if (targets.length === 0) return
    const levels = new Map(project.levels)
    const lvl = levels.get(level.id)
    if (!lvl) return
    const elements = new Map(lvl.elements)
    for (const t of targets) elements.set(t.id, { ...t, materialId: id })
    levels.set(level.id, { ...lvl, elements })
    setProject({ ...project, levels })
  }, [activeTool, level.elements, level.id, project, selectedIds, setProject])

  const canvasProps = {
    project,
    level,
    activeSectionId,
    selectedIds,
    onProjectChange: handleProjectChange,
    onSelectionChange: handleSelectionChange,
  }

  return (
    <div className="h-screen w-full flex flex-col bg-sheet">
      {/* Top Toolbar */}
      <header className="bg-white border-b border-hairline shadow-sm z-10">
        <div className="mx-auto max-w-full px-4 py-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-ink">Drafting3D</h1>
            <span className="px-2 py-0.5 text-xs font-semibold bg-brand-tint text-brand rounded">Beta</span>
          </div>

          <div className="flex-1 flex justify-center items-center gap-2 flex-wrap">
            {TOOL_GROUPS.map(group => (
              <div key={group.label} className="flex items-center gap-1 bg-white border border-field-line rounded-lg p-1">
                {group.tools.map(tool => (
                  <button
                    key={tool}
                    onClick={() => setActiveTool(tool)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
                      activeTool === tool
                        ? 'bg-brand text-on-solid'
                        : 'text-muted hover:text-ink hover:bg-brand-tint'
                    }`}
                  >
                    {tool.charAt(0).toUpperCase() + tool.slice(1)}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-white border border-field-line rounded-lg p-1">
              {(['2d', '3d', 'split'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
                    viewMode === mode
                      ? 'bg-brand text-on-solid'
                      : 'text-muted hover:text-ink hover:bg-brand-tint'
                  }`}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSectionPanel(!showSectionPanel)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
                  showSectionPanel ? 'bg-brand text-on-solid' : 'text-muted hover:text-ink hover:bg-brand-tint'
                }`}
              >
                Sections
              </button>
              <button
                onClick={() => setShowLevelPanel(!showLevelPanel)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
                  showLevelPanel ? 'bg-brand text-on-solid' : 'text-muted hover:text-ink hover:bg-brand-tint'
                }`}
              >
                Levels
              </button>
              <button
                onClick={handleExportModelSpace}
                className="px-4 py-1.5 text-sm font-semibold bg-brand text-on-solid rounded hover:bg-brand-hover transition"
              >
                Export to ModelSpace
              </button>
            </div>
          </div>
        </div>

        {/* Status hint — what the active tool does with the next tap/drag */}
        <div className="mx-auto max-w-full px-4 pb-2 text-xs text-muted">{TOOL_HINTS[activeTool]}</div>
      </header>

      {/* Side Panels */}
      {showSectionPanel && (
        <div className="fixed inset-y-0 right-0 z-50 w-80 bg-white border-l border-hairline shadow-xl flex flex-col overflow-auto">
          <div className="p-4 border-b border-hairline flex items-center justify-between">
            <h3 className="font-semibold text-ink">Sections</h3>
            <button onClick={() => setShowSectionPanel(false)} className="text-muted hover:text-ink">×</button>
          </div>
          <div className="p-4 space-y-3 max-h-[calc(100vh-100px)] overflow-auto">
            {sections.map(sec => (
              <button
                key={sec.id}
                onClick={() => setActiveSectionId(sec.id)}
                className={`w-full text-left p-3 rounded-lg border transition ${
                  activeSectionId === sec.id
                    ? 'bg-brand-tint border-brand'
                    : 'border-hairline hover:bg-brand-tint hover:border-brand'
                }`}
              >
                <div className="font-medium text-ink">{sec.name}</div>
                <div className="text-sm text-muted">{sec.b}×{sec.h} mm</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {showLevelPanel && (
        <div className="fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-hairline shadow-xl flex flex-col overflow-auto">
          <div className="p-4 border-b border-hairline flex items-center justify-between">
            <h3 className="font-semibold text-ink">Levels</h3>
            <button onClick={() => setShowLevelPanel(false)} className="text-muted hover:text-ink">×</button>
          </div>
          <div className="flex-1 p-4 space-y-2 overflow-auto">
            {Array.from(project.levels.values()).map(l => (
              <button
                key={l.id}
                onClick={() => activateLevel(l.id)}
                className={`w-full text-left p-3 rounded-lg border transition ${
                  project.activeLevelId === l.id
                    ? 'bg-brand-tint border-brand'
                    : 'border-hairline hover:bg-brand-tint hover:border-brand'
                }`}
              >
                <div className="font-medium text-ink">{l.name}</div>
                <div className="text-sm text-muted">EL {l.elevation.toFixed(2)} m</div>
              </button>
            ))}
            <button
              onClick={handleAddLevel}
              className="w-full p-3 rounded-lg border border-dashed border-hairline text-muted hover:border-brand hover:text-brand transition"
            >
              + Add Level
            </button>
          </div>
        </div>
      )}

      {/* Material picker — Revit's type selector for the active tool */}
      {(activeTool === 'slab' || activeTool === 'ceiling') && (
        <div className="bg-white border-b border-hairline px-4 py-2 flex items-center gap-3 overflow-x-auto">
          <span className="text-xs font-semibold text-muted whitespace-nowrap">
            {activeTool === 'ceiling' ? 'Ceiling finish' : 'Slab material'}
          </span>
          {(activeTool === 'ceiling' ? CEILING_MATERIALS : SLAB_MATERIALS).map(m => (
            <button
              key={m.id}
              onClick={() => setMaterial(m.id)}
              title={`${m.note} · ${m.load} kN/m²`}
              className={`flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg border text-sm transition whitespace-nowrap ${
                (activeTool === 'ceiling' ? ceilingMaterialId : slabMaterialId) === m.id
                  ? 'border-brand bg-brand-tint text-ink'
                  : 'border-hairline text-muted hover:border-brand hover:text-ink'
              }`}
            >
              <span className="w-4 h-4 rounded-sm border border-hairline inline-block" style={{ background: m.color }} />
              {m.name}
              {m.load > 0 && <span className="text-xs text-muted">{m.load} kN/m²</span>}
            </button>
          ))}
        </div>
      )}

      {/* Selected door/window property editor — width, height, sill, swing */}
      {selectedOpening && (
        <div className="bg-white border-b border-hairline px-4 py-2 flex items-center gap-4 overflow-x-auto">
          <span className="text-xs font-semibold text-muted whitespace-nowrap">
            {selectedOpening.type === 'door' ? 'Door' : 'Window'} · {selectedOpening.width?.toFixed(2)}×{selectedOpening.height?.toFixed(2)} m
          </span>
          <label className="flex items-center gap-1 text-xs text-muted">
            Width
            <input
              type="number" min={0.4} max={3} step={0.1}
              value={selectedOpening.width ?? 0.9}
              onChange={e => patchSelectedOpening({ width: Math.max(0.4, Math.min(3, Number(e.target.value) || 0.9)) })}
              className="w-16 px-1.5 py-1 border border-field-line rounded text-ink"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-muted">
            Height
            <input
              type="number" min={0.4} max={3} step={0.1}
              value={selectedOpening.height ?? 2.1}
              onChange={e => patchSelectedOpening({ height: Math.max(0.4, Math.min(3, Number(e.target.value) || 2.1)) })}
              className="w-16 px-1.5 py-1 border border-field-line rounded text-ink"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-muted">
            Sill
            <input
              type="number" min={0} max={2} step={0.1}
              value={selectedOpening.sill ?? 0}
              onChange={e => patchSelectedOpening({ sill: Math.max(0, Math.min(2, Number(e.target.value) || 0)) })}
              className="w-16 px-1.5 py-1 border border-field-line rounded text-ink"
            />
          </label>
          {selectedOpening.type === 'door' && (
            <label className="flex items-center gap-1 text-xs text-muted">
              Swing
              <select
                value={selectedOpening.swing ?? 0}
                onChange={e => patchSelectedOpening({ swing: Number(e.target.value) as 0 | 1 | 2 | 3 })}
                className="px-1.5 py-1 border border-field-line rounded text-ink"
              >
                <option value={0}>Left, in</option>
                <option value={1}>Right, in</option>
                <option value={2}>Left, out</option>
                <option value={3}>Right, out</option>
              </select>
            </label>
          )}
        </div>
      )}

      {/* Main Viewport */}
      <main className="flex-1 overflow-hidden relative">
        {viewMode === '2d' && (
          <div className="h-full w-full">
            <FloorPlanCanvas
              {...canvasProps}
              activeTool={activeTool}
              activeMaterialId={activeMaterialId}
            />
          </div>
        )}

        {viewMode === '3d' && (
          <div className="h-full w-full">
            <Drafting3DViewport project={project} selectedIds={selectedIds} onSelect={handleSelect3D} />
          </div>
        )}

        {viewMode === 'split' && (
          <div className="h-full w-full flex">
            <div className="w-1/2 h-full border-r border-hairline">
              <FloorPlanCanvas
                {...canvasProps}
                activeTool={activeTool}
                activeMaterialId={activeMaterialId}
              />
            </div>
            <div className="w-1/2 h-full">
              <Drafting3DViewport project={project} selectedIds={selectedIds} onSelect={handleSelect3D} />
            </div>
          </div>
        )}
      </main>

      {/* Catalog footnote — what the picker's colours and loads mean */}
      {(activeTool === 'slab' || activeTool === 'ceiling') && (
        <div className="bg-sheet border-t border-hairline px-4 py-1.5 text-xs text-muted">
          {finishMaterial(activeTool === 'ceiling' ? CEILING_MATERIALS : SLAB_MATERIALS,
            activeTool === 'ceiling' ? ceilingMaterialId : slabMaterialId).note}
        </div>
      )}
    </div>
  )
}
