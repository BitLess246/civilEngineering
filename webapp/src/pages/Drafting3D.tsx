/**
 * Drafting3D — 2D floor plan drafting with real-time 3D viewport.
 * Exports to ModelSpace StructuralModel format.
 *
 * Revit-style modelling aids: wall-hosted doors & windows (tap a wall), finish
 * materials for slabs and ceilings, and a touch-first canvas — press-drag to
 * draw, drag elements to move them, pinch to zoom, two-finger drag to pan.
 */

import { useState, useCallback, useMemo, useLayoutEffect, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Drafting3DViewport } from '../components/Drafting3DViewport'
import { FloorPlanCanvas, type PlanTool } from '../components/FloorPlanCanvas'
import { useDraftProject } from '../lib/drafting3dSession'
import type { DraftProject } from '../engine/drafting3d'
import { addLevel, SLAB_MATERIALS, CEILING_MATERIALS, finishMaterial, DEFAULT_SECTION_FOR, sectionRole, deleteDraftElements, renameLevel, setLevelHeight, canDeleteLevel, deleteLevel, type DraftSectionRole } from '../engine/drafting3d'
import { readSession, writeSession, writeOpenId } from '../lib/modelSpaceSession'

/** The ribbon, grouped the way Revit groups its tools. */
const TOOL_GROUPS: Array<{ label: string; tools: PlanTool[] }> = [
  { label: 'Modify', tools: ['select'] },
  { label: 'Structure', tools: ['wall', 'beam', 'column'] },
  { label: 'Openings', tools: ['door', 'window'] },
  { label: 'Model', tools: ['slab', 'ceiling', 'grid'] },
]

/** Status-bar hint per tool — the one-line contract before the first tap. */
const TOOL_HINTS: Record<PlanTool, string> = {
  select: 'Tap to select · drag an element or joint to move it · drop a joint on another to weld them · pinch to zoom',
  wall: 'Ends snap to joints & grid (green ring = weld) — tap two points or press-drag-release',
  beam: 'Ends snap to joints & grid (green ring = weld) — tap two points or press-drag-release',
  column: 'Tap to drop a column — its base snaps to the nearest joint or grid point',
  slab: 'Tap four corners — they snap to joints & grid; the material picker sets the finish',
  door: 'Tap a wall — the door hosts on it and swings; drag it later to slide',
  window: 'Tap a wall — the window hosts on it at sill height; drag to slide',
  ceiling: 'Tap four corners of the room — the ceiling plane is finish, not structure',
  grid: 'Tap anywhere to add grid lines through that point',
}

const ROLE_LABEL: Record<DraftSectionRole, string> = { wall: 'Walls', beam: 'Beams', column: 'Columns', slab: 'Slabs' }
const ROLES: DraftSectionRole[] = ['wall', 'beam', 'column', 'slab']
const isRole = (t: PlanTool): t is DraftSectionRole => (ROLES as string[]).includes(t)

/** Fill the window below wherever the page starts — the app shell's top bar
 *  and any banner above it vary, and `h-screen` under them pushed the
 *  viewport's bottom off the page. */
function useFillHeight() {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const [height, setHeight] = useState<number>()
  useLayoutEffect(() => {
    if (!el) return
    const fit = () => setHeight(Math.max(420, window.innerHeight - (el.getBoundingClientRect().top + window.scrollY)))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [el])
  return [setEl, height] as const
}

export default function Drafting3D() {
  const { project, setProject, replaceProject, exportToModelSpace, undo, redo, canUndo, canRedo } = useDraftProject()
  const navigate = useNavigate()
  const [activeTool, setActiveTool] = useState<PlanTool>('select')
  // One section PER ROLE — a single active section stamped the 400×400
  // column on every slab and wall drawn before the panel was opened.
  const [sectionByRole, setSectionByRole] = useState<Record<DraftSectionRole, string>>({ ...DEFAULT_SECTION_FOR })
  const activeSectionId = isRole(activeTool) ? sectionByRole[activeTool]
    : activeTool === 'ceiling' ? sectionByRole.slab : DEFAULT_SECTION_FOR.beam
  const [fillRef, fillHeight] = useFillHeight()
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

  // switching storeys is view state, not an edit — Undo should not flip it
  const activateLevel = useCallback((id: string) => {
    replaceProject({ ...project, activeLevelId: id })
    setSelectedIds([])
  }, [project, replaceProject])

  const handleAddLevel = useCallback(() => {
    const clone: DraftProject = { ...project, levels: new Map(project.levels) }
    addLevel(clone)
    setProject(clone)
  }, [project, setProject])

  /** The drafted frame as a downloadable StructuralModel JSON. */
  const handleDownloadJson = useCallback(() => {
    const model = exportToModelSpace(project)
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name}.model.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [project, exportToModelSpace])

  /** Hand the drafted frame to Model Space: write it where Model Space reads
   *  its session at mount (lib/modelSpaceSession) and go there. The old
   *  button only downloaded a JSON file Model Space had no way to import. */
  const handleOpenInModelSpace = useCallback(() => {
    const model = exportToModelSpace(project)
    if (model.members.length === 0 && model.plates.length === 0) {
      window.alert('Nothing to send yet — draw at least one column, beam, wall or slab.')
      return
    }
    const open = readSession()
    if (open.model && (open.model.members?.length ?? 0) > 0
      && !window.confirm('Model Space already has a model open in this tab. Replace it with this drafting? (Save it as a project first if you need it.)')) return
    // a fresh, unsaved model: no stale design results, not tied to a saved project
    writeSession({ model, inputs: open.inputs, design: null })
    writeOpenId(null)
    navigate('/model')
  }, [exportToModelSpace, navigate, project])

  const deleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return
    const levels = new Map(project.levels)
    levels.set(level.id, deleteDraftElements(level, selectedIds))
    setProject({ ...project, levels })
    setSelectedIds([])
  }, [level, project, selectedIds, setProject])

  // Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z or Ctrl+Y redo — never while typing in a field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName))) return
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const topLevelId = useMemo(
    () => Array.from(project.levels.values()).reduce((a, b) => (b.elevation > a.elevation ? b : a)).id,
    [project.levels])

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
    <div ref={fillRef} className="h-[calc(100dvh-7rem)] w-full flex flex-col bg-sheet" style={fillHeight ? { height: fillHeight } : undefined}>
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
            {/* Edit — undo/redo and a Delete a finger can reach (the key is desktop-only) */}
            <div className="flex items-center gap-1 bg-white border border-field-line rounded-lg p-1">
              <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo"
                className="px-2.5 py-1.5 text-sm font-medium rounded-md text-muted hover:text-ink hover:bg-brand-tint disabled:opacity-40 disabled:hover:bg-transparent">↶ Undo</button>
              <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"
                className="px-2.5 py-1.5 text-sm font-medium rounded-md text-muted hover:text-ink hover:bg-brand-tint disabled:opacity-40 disabled:hover:bg-transparent">↷ Redo</button>
              <button onClick={deleteSelected} disabled={selectedIds.length === 0} title="Delete the selection (Delete)"
                className="px-2.5 py-1.5 text-sm font-medium rounded-md text-fail hover:bg-fail-tint disabled:opacity-40 disabled:text-muted disabled:hover:bg-transparent">Delete</button>
            </div>

            <label className="flex items-center gap-1.5 text-sm text-muted">
              <span className="sr-only">Active level</span>
              <select value={project.activeLevelId} onChange={e => activateLevel(e.target.value)}
                className="py-1.5 pl-2 pr-7 text-sm border border-field-line rounded-lg text-ink">
                {Array.from(project.levels.values()).sort((a, b) => a.elevation - b.elevation).map(l => (
                  <option key={l.id} value={l.id}>{l.name} · EL {l.elevation.toFixed(2)}</option>
                ))}
              </select>
            </label>

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
                onClick={handleDownloadJson}
                title="Download the frame as a StructuralModel JSON file"
                className="px-3 py-1.5 text-sm font-medium rounded-md text-muted hover:text-ink hover:bg-brand-tint transition"
              >
                JSON
              </button>
              <button
                onClick={handleOpenInModelSpace}
                className="px-4 py-1.5 text-sm font-semibold bg-brand text-on-solid rounded hover:bg-brand-hover transition"
              >
                Open in Model Space
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Side Panels */}
      {showSectionPanel && (
        <div className="fixed inset-y-0 right-0 z-50 w-80 bg-white border-l border-hairline shadow-xl flex flex-col overflow-auto">
          <div className="p-4 border-b border-hairline flex items-center justify-between">
            <h3 className="font-semibold text-ink">Sections</h3>
            <button onClick={() => setShowSectionPanel(false)} className="text-muted hover:text-ink">×</button>
          </div>
          <div className="p-4 space-y-4 max-h-[calc(100vh-100px)] overflow-auto">
            <p className="text-xs text-muted">Each tool draws with its own section. The highlighted one in each group is what that tool places next.</p>
            {ROLES.map(role => (
              <div key={role} className="space-y-2">
                <div className={`text-xs font-semibold uppercase tracking-wide ${role === activeTool ? 'text-brand' : 'text-muted'}`}>
                  {ROLE_LABEL[role]}{role === activeTool ? ' · active tool' : ''}
                </div>
                {sections.filter(sec => sectionRole(sec) === role).map(sec => (
                  <button
                    key={sec.id}
                    onClick={() => setSectionByRole(prev => ({ ...prev, [role]: sec.id }))}
                    className={`w-full text-left p-3 rounded-lg border transition ${
                      sectionByRole[role] === sec.id
                        ? 'bg-brand-tint border-brand'
                        : 'border-hairline hover:bg-brand-tint hover:border-brand'
                    }`}
                  >
                    <div className="font-medium text-ink">{sec.name}</div>
                    <div className="text-sm text-muted">{role === 'slab' || role === 'wall' ? `${sec.h} mm thick` : `${sec.b}×${sec.h} mm`}</div>
                  </button>
                ))}
              </div>
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
            {Array.from(project.levels.values()).sort((x, y) => y.elevation - x.elevation).map(l => (
              <div key={l.id}
                className={`p-3 rounded-lg border transition ${
                  project.activeLevelId === l.id ? 'bg-brand-tint border-brand' : 'border-hairline'
                }`}
              >
                <div className="flex items-center gap-2">
                  {/* keyed on name: a rename (or an undo of one) remounts it with the new value */}
                  <input key={l.name} defaultValue={l.name} aria-label="Level name"
                    onBlur={e => setProject(renameLevel(project, l.id, e.target.value))}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    className="min-w-0 flex-1 px-2 py-1 text-sm font-medium border border-field-line rounded text-ink" />
                  <button onClick={() => activateLevel(l.id)} disabled={project.activeLevelId === l.id}
                    className="px-2 py-1 text-xs font-semibold rounded border border-hairline text-muted hover:border-brand hover:text-brand disabled:border-brand disabled:text-brand">
                    {project.activeLevelId === l.id ? 'Active' : 'Open'}
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                  <span>EL {l.elevation.toFixed(2)} m</span>
                  <label className="ml-auto flex items-center gap-1">
                    Storey
                    <input key={l.height} type="number" min={2} step={0.1} defaultValue={l.height} aria-label="Storey height"
                      onBlur={e => setProject(setLevelHeight(project, l.id, Number(e.target.value)))}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      className="w-16 px-1.5 py-1 border border-field-line rounded text-ink" />
                    m
                  </label>
                  {l.id === topLevelId && canDeleteLevel(project, l.id) && (
                    <button onClick={() => { if (window.confirm(`Delete ${l.name} and everything drawn on it?`)) setProject(deleteLevel(project, l.id)) }}
                      className="px-2 py-1 rounded text-fail hover:bg-fail-tint" title="Only the top level can be deleted">Delete</button>
                  )}
                </div>
              </div>
            ))}
            <p className="text-xs text-muted">A taller storey lifts every level above it, so columns keep meeting the floor they carry.</p>
            <button
              onClick={handleAddLevel}
              className="w-full p-3 rounded-lg border border-dashed border-hairline text-muted hover:border-brand hover:text-brand transition"
            >
              + Add Level
            </button>
          </div>
        </div>
      )}

      {/* Context row — ONE fixed-height row for the tool hint, the material
          picker or the selected opening's editor. Inserting and removing those
          as separate rows moved the canvas up and down under the pointer. */}
      <div className="h-12 shrink-0 bg-white border-b border-hairline px-4 flex items-center gap-3 overflow-x-auto">
        {selectedOpening ? (<>
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
        </>) : (activeTool === 'slab' || activeTool === 'ceiling') ? (<>
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
          <span className="text-xs text-muted whitespace-nowrap">
            {finishMaterial(activeTool === 'ceiling' ? CEILING_MATERIALS : SLAB_MATERIALS,
              activeTool === 'ceiling' ? ceilingMaterialId : slabMaterialId).note}
          </span>
        </>) : (
          <span className="text-xs text-muted">{TOOL_HINTS[activeTool]}</span>
        )}
      </div>

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

    </div>
  )
}
