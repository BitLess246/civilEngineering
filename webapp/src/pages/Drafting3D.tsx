/**
 * Drafting3D — 2D floor plan drafting with real-time 3D viewport.
 * Exports to ModelSpace StructuralModel format.
 */

import { useState, useCallback, useMemo } from 'react'
import { Drafting3DViewport } from './Drafting3DViewport'
import { FloorPlanCanvas } from './FloorPlanCanvas'
import { ReportControls } from './ReportControls'
import { Card, Num, Pick } from './qty'
import { useDraftProject } from '../lib/drafting3dSession'
import type { DraftProject, DraftLevel, RectSection } from '../engine/drafting3d'

const DEFAULT_SECTIONS: Array<{ id: string; name: string; b: number; h: number }> = [
  { id: 'beam-300x500', name: 'Beam 300×500', b: 300, h: 500 },
  { id: 'beam-300x600', name: 'Beam 300×600', b: 300, h: 600 },
  { id: 'beam-350x600', name: 'Beam 350×600', b: 350, h: 600 },
  { id: 'beam-400x700', name: 'Beam 400×700', b: 400, h: 700 },
  { id: 'col-400x400', name: 'Column 400×400', b: 400, h: 400 },
  { id: 'col-500x500', name: 'Column 500×500', b: 500, h: 500 },
  { id: 'col-600x600', name: 'Column 600×600', b: 600, h: 600 },
  { id: 'slab-150', name: 'Slab 150', b: 1000, h: 150 },
  { id: 'slab-200', name: 'Slab 200', b: 1000, h: 200 },
  { id: 'slab-250', name: 'Slab 250', b: 1000, h: 250 },
  { id: 'wall-200', name: 'Wall 200', b: 1000, h: 200 },
  { id: 'wall-250', name: 'Wall 250', b: 1000, h: 250 },
]

export default function Drafting3D() {
  const { project, setProject, saveProject, exportToModelSpace } = useDraftProject()
  const [activeTool, setActiveTool] = useState<'select' | 'wall' | 'beam' | 'column' | 'slab' | 'grid'>('select')
  const [activeSectionId, setActiveSectionId] = useState('col-400x400')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'2d' | '3d' | 'split'>('split')
  const [showSectionPanel, setShowSectionPanel] = useState(false)
  const [showLevelPanel, setShowLevelPanel] = useState(false)

  const level = useMemo(() => project.levels.get(project.activeLevelId), [project, project.activeLevelId])!

  const handleProjectChange = useCallback((newProject: typeof project) => {
    setProject(newProject)
  }, [setProject])

  const handleSelectionChange = useCallback((ids: string[]) => {
    setSelectedIds(ids)
  }, [])

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

  return (
    <div className="h-screen w-full flex flex-col bg-gray-50">
      {/* Top Toolbar */}
      <header className="bg-white border-b border-hairline shadow-sm z-10">
        <div className="mx-auto max-w-full px-4 py-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-ink">Drafting3D</h1>
            <span className="px-2 py-0.5 text-xs font-semibold bg-brand-tint text-brand rounded">Beta</span>
          </div>

          <div className="flex-1 flex justify-center items-center gap-2">
            <div className="flex items-center gap-2 bg-white border border-field-line rounded-lg p-1">
              {(['select', 'wall', 'beam', 'column', 'slab', 'grid'] as const).map(tool => (
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
          </div>

          <div className="flex items-center gap-3">
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
      </header>

      {/* Side Panels */}
      {showSectionPanel && (
        <div className="fixed inset-y-0 right-0 z-50 w-80 bg-white border-l border-hairline shadow-xl flex flex-col overflow-auto">
          <div className="p-4 border-b border-hairline flex items-center justify-between">
            <h3 className="font-semibold text-ink">Sections</h3>
            <button onClick={() => setShowSectionPanel(false)} className="text-muted hover:text-ink">×</button>
          </div>
          <div className="p-4 space-y-3 max-h-[calc(100vh-100px)] overflow-auto">
{DEFAULT_SECTIONS.map(sec => (
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
                onClick={() => { /* activate level */ }}
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
              onClick={() => { /* add level */ }}
              className="w-full p-3 rounded-lg border border-dashed border-hairline text-muted hover:border-brand hover:text-brand transition"
            >
              + Add Level
            </button>
          </div>
        </div>
      )}

      {/* Main Viewport */}
      <main className="flex-1 overflow-hidden relative">
        {viewMode === '2d' && (
          <div className="h-full w-full">
            <FloorPlanCanvas
              project={project}
              level={level}
              activeTool={activeTool}
              activeSectionId={activeSectionId}
              onProjectChange={handleProjectChange}
              onSelectionChange={handleSelectionChange}
            />
          </div>
        )}

        {viewMode === '3d' && (
          <div className="h-full w-full">
            <Drafting3DViewport project={project} level={level} selectedIds={selectedIds} />
          </div>
        )}

        {viewMode === 'split' && (
          <div className="h-full w-full flex">
            <div className="w-1/2 h-full border-r border-hairline">
              <FloorPlanCanvas
                project={project}
                level={level}
                activeTool={activeTool}
                activeSectionId={activeSectionId}
                onProjectChange={handleProjectChange}
                onSelectionChange={handleSelectionChange}
              />
            </div>
            <div className="w-1/2 h-full">
              <Drafting3DViewport project={project} level={level} selectedIds={selectedIds} />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}