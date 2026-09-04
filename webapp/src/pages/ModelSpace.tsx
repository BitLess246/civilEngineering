import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { scrollTop } from '../lib/useScrollTop'
import { endDrops } from '../lib/baseDrop'
import { Link, useSearchParams } from 'react-router-dom'
import { GuidedTour } from '../components/GuidedTour'
import { TourButton } from '../components/TourButton'
import { MODEL_STEPS } from '../lib/modelTour'
import { useTour } from '../lib/useTour'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { RebarWireframe } from '../components/RebarWireframe'
import { buildStructureCages, structureMomentRatios } from '../engine/cageBuilder'

import {
  beamSectionZones, columnStackByMember, elevationBundleByMember,
  type ColumnStackBundle, type FrameElevationBundle,
} from '../lib/planDetails'
import { placeStair } from '../engine/stairPlacement'
import { REBAR_ROLE_COLOR } from '../engine/rebarWire'
import type { CageKind } from '../engine/rebarModel'
import { effectiveViewMode, ghostConcrete, surfaceStyleFor, type ViewMode } from '../components/modelSpace/viewMode'
import { ProjectsPanel } from '../components/ProjectsPanel'
import { AUTOSAVE_KEY, INPUTS_KEY } from '../lib/modelSpaceSession'
import { emptyHistory, recordHistory, undoHistory, redoHistory, isTypingTarget, type History } from '../lib/history'
import * as THREE from 'three'
import { generateGridModel, removeElements, removeNode, buildGravityLoads, splitSharedSections } from '../engine/modelBuilder'
import type { StructuralModel, Member, Plate, RectSection, ModelLoad, MemberRole, MemberReleases, NodeSupport, SupportFixity, WoodDeck, StairLanding } from '../engine/model'
import { distributePanel } from '../engine/tributary'
import { type F3Analysis, type F3MemberResult } from '../engine/frame3d'
import { type ActiveSetAnalysis, type AxialMode } from '../engine/axialOnly'
import { diagramScale, type DiagramComp } from '../engine/memberDiagram3d'
import { validateMesh, hasMeshErrors } from '../engine/meshValidation'
import { type ModalResult } from '../engine/modal'
import { computeResponseSpectrum, rsaEquivalentLoads, type ResponseSpectrumResult, type RsaLateralResult } from '../engine/responseSpectrum'
import { type StructureDesign, type FootingPlan, type OptimizeResult, type LateralCase, type BiaxialMethod } from '../engine/pipeline'
import type { SteelJoint } from '../engine/steelConnections'
import { estimateTakeoff, costBill, type PriceList } from '../engine/takeoff'
import { footingLayout } from '../engine/footingLayout'
import { type ShellNode, type ShellElem, type ElementStress } from '../engine/shell'
import { solveModelShells, designModelSlabsFE, type SlabFEScheduleRow } from '../engine/shellModel'
import { useSolver } from '../lib/useSolver'
import { TABLE_204_1, TABLE_204_2, sdlItemKPa, sdlTotal, type SdlItem } from '../engine/deadLoads'
import { TABLE_205_1, TABLE_206 } from '../engine/liveLoads'
import { concreteClassForFc, type ConcreteClass } from '../engine/quantities'
import { computeSeismic, buildECases, type SeismicResult, type DriftRow } from '../engine/seismic'
import type { IrregularityFlag } from '../engine/irregularity'
import { columnKFactors, type ColumnK } from '../engine/effectiveLength'
import { freqFromDeflection, dg11Walking, DG11_OCCUPANCY } from '../engine/floorVibration'
import { buildSeismicMass, GRAVITY } from '../engine/modal'
import { autoRigidOffsets } from '../engine/rigidEndZones'
import { AnalysisOptionsHelp } from '../components/AnalysisOptionsHelp'
import { computeWind, computeCladding, type WindResult, type WindEnclosure, type CladdingResult } from '../engine/wind'
import { LetterheadCard, type LetterheadState } from '../components/calc'
import { initialLetterhead } from '../lib/letterhead'
import { JointConnections3D } from '../components/JointConnections3D'
import { ConnectionDetail2D } from '../components/ConnectionDetail2D'
import { connectionRowSolution } from '../lib/connectionSolution'
import { WorkedSolution } from '../components/WorkedSolution'
import { ConstructionSchedule } from '../components/ConstructionSchedule'
import { beamSectionSolution, columnRowSolution, footingRowSolution, combinedRowSolution,
  woodBeamRowSolution, woodColumnRowSolution, woodSlabRowSolution } from '../lib/modelSpaceSolutions'
import { Diagram } from '../components/Diagram'
import { MemberForcesTable } from '../components/MemberForcesTable'
import { ReactionsPanel } from '../components/ReactionsPanel'
import { DisplacementTable } from '../components/DisplacementTable'
import { PlansPanel } from '../components/PlansPanel'
import { ValidationPanel } from '../components/ValidationPanel'
import { ModalPanel } from '../components/ModalPanel'
import { ResponseSpectrumPanel } from '../components/ResponseSpectrumPanel'
import { PushoverPanel } from '../components/PushoverPanel'
import { BiaxialPushoverPanel } from '../components/BiaxialPushoverPanel'
import type { PushoverModelResult } from '../engine/pushoverModel'
import type { BiaxialPushoverResult } from '../engine/biaxialFrameModel'
import { TimeHistoryPanel } from '../components/TimeHistoryPanel'
import { ShellContourPanel } from '../components/ShellContourPanel'
import { RecordedSpectrumPanel } from '../components/RecordedSpectrumPanel'
import { elasticResponseSpectrum, nscp208DesignCurve, type AccelSpectrum, type DesignSpectrumPoint } from '../engine/accelSpectrum'
import { parseAccelerogram } from '../engine/accelerogram'
import type { TimeHistoryModelResult, GroundMotionKind, CsvAccelerogramOpts } from '../engine/timeHistoryModel'
import type { NonlinearModelResult } from '../engine/nonlinearModel'
import type { NonlinearFrameModelResult } from '../engine/nonlinearFrameModel'
import { FootingSchematic } from '../components/FootingSchematic'
import { HintButton, SeismicHint, WindHint } from '../components/LoadHints'
import { Num, Pick, Row } from '../components/qty'
import { FitView } from '../components/FitView'
import { shapeByName, shapesOf, effectiveSection, sectionBoundingBox, FAMILIES, type SectionFamily } from '../engine/aiscSections'
import { WOOD_SPECIES, speciesList, gradesOf, resolveWoodSpecies, type WoodSpecies } from '../engine/woodDesign'
import { MaterialLibrary } from '../components/MaterialLibrary'
import { loadCustomMaterials, saveCustomMaterials, type CustomMaterial } from '../lib/materialLibrary'
import { SectionShape } from '../components/SectionShape'
import { f0, f1, f2 } from '../lib/format'
import { usePlanGate } from '../lib/auth/usePlan'
import { UpgradeNotice } from '../components/UpgradeNotice'
import type { SolverKind } from '../lib/featureGate'
import { Footing3D, GridBubbles3D, Loads3D, Member3D, MemberForceDiagram3D, MemberStick3D, MemberSteel3D, ModeShapePlayer, Nodes3D, RigidArm3D, Slab3D, SlackMember3D, Stair3D, Support3D, Wall3D } from '../components/modelSpace/scene'
import { DIAG_COLOR, DIAG_LABEL, LOAD_COLOR } from '../components/modelSpace/sceneTokens'
import { DirPicker, Rule, SchedChip, Sec, SolverProgress, Swatches, TabBtn } from '../components/modelSpace/panelKit'
import { TAB_GROUPS, UTILITY_TABS, type Tab } from '../components/modelSpace/tabs'
import {
  BeamCageSection, BeamElevationFigure, BeamServiceability, ColumnCageSection, ColumnElevationFigure, WShapeSection,
} from '../components/modelSpace/figures'

/** How the biaxial utilisation in the column schedule was arrived at. The
 *  column shows one number and it comes from Mux AND Muy, so the row says
 *  which rule combined them. */
const BIAXIAL_LABEL: Record<BiaxialMethod, string> = {
  'bresler': 'Bresler reciprocal load (compression-controlled)',
  'load-contour': 'linear load contour (tension-controlled)',
  'uniaxial-x': 'uniaxial — strong axis; Muy negligible',
  'uniaxial-y': 'uniaxial — weak axis; Mux negligible',
}

/** A sensible default timber deck (DFL No.2 joists 50×200 @ 400, 25 mm plank). */
const DEFAULT_DECK: WoodDeck = {
  joistSpecies: 'DFL-2', joistKind: 'sawn', joistB: 50, joistD: 200, joistSpacing: 400,
  joistSupport: 'simple', deckMaterial: 'plank', deckThickness: 25, deckSupport: 'continuous',
}



/** The design inputs persisted alongside the autosaved model so a reload keeps
 *  the Geometry/Properties/Loading/etc. fields consistent with the 3D model
 *  (soil, seismic, wind & γc aren't part of the model, so they'd otherwise reset
 *  to defaults while the model stays loaded). */

/** The design inputs persisted alongside the autosaved model so a reload keeps
 *  the Geometry/Properties/Loading/etc. fields consistent with the 3D model
 *  (soil, seismic, wind & γc aren't part of the model, so they'd otherwise reset
 *  to defaults while the model stays loaded). */
function loadInputs(): Record<string, unknown> {
  try { const raw = sessionStorage.getItem(INPUTS_KEY); return raw ? JSON.parse(raw) as Record<string, unknown> : {} }
  catch { return {} }
}

const parseList = (s: string): number[] =>
  s.split(/[, ]+/).map(parseFloat).filter((v) => Number.isFinite(v) && v > 0)

/** Distributed load along a member derived from the shear, w ≈ −dV/dx
 *  (central difference; one-sided at the ends so a UDL reads flat). */

/** Distributed load along a member derived from the shear, w ≈ −dV/dx
 *  (central difference; one-sided at the ends so a UDL reads flat). */
const loadFromShear = (xs: number[], Vy: number[]): number[] =>
  xs.map((_, i) => {
    const lo = Math.max(0, i - 1), hi = Math.min(xs.length - 1, i + 1)
    const dx = xs[hi] - xs[lo]
    return dx !== 0 ? -(Vy[hi] - Vy[lo]) / dx : 0
  })

// ── 3D primitives ─────────────────────────────────────────────────────────
/**
 * How far below the node line a member's concrete (or steel section) hangs, m.
 *
 * A floor level is the TOP of the beams framing into it: the column below stops
 * there, the column above starts there, and the beam hangs under the joint.
 * Drawn centred on the node the beam straddled that interface — half of every
 * beam ran up through the column starting at the same node — and the cages,
 * which are built off the soffit, no longer sat inside their own concrete.
 *
 * Horizontal members only: a column's node line IS its axis, and a sloping
 * member has no single level to hang from.
 */

// ── Page ──────────────────────────────────────────────────────────────────
/**
 * The cage kinds the Display tab can switch off, in the order they are listed.
 *
 * Every kind `cageBuilder` tags — a list that misses one would silently make
 * that steel un-hideable, which is worse than not offering the control.
 */
const CAGE_KIND_LABEL: Record<CageKind, string> = {
  beam: 'Beams', column: 'Columns', slab: 'Slabs', stair: 'Stairs', footing: 'Footings',
}
/** …in the order they are listed. A `Record` keyed on the union, so adding a
 *  kind to `cageBuilder` and forgetting its checkbox is a type error rather
 *  than steel that quietly cannot be switched off. */
const CAGE_KINDS = Object.keys(CAGE_KIND_LABEL) as CageKind[]

export default function ModelSpace() {
  // design inputs restored from the last session (so they match the autosaved
  // 3D model after a reload), with the factory defaults as fallback.
  const [si] = useState(loadInputs)
  const n = (k: string, d: number) => (typeof si[k] === 'number' ? si[k] as number : d)
  const s = (k: string, d: string) => (typeof si[k] === 'string' ? si[k] as string : d)
  const b = (k: string, d: boolean) => (typeof si[k] === 'boolean' ? si[k] as boolean : d)

  const [baysX, setBaysX] = useState(s('baysX', '6, 6'))
  const [baysZ, setBaysZ] = useState(s('baysZ', '5'))
  const [storeyH, setStoreyH] = useState(s('storeyH', '3.5, 3'))
  // Per-role initial sizes (column ≥ girder ≥ beam to start the hierarchy satisfied).
  const [colB, setColB] = useState(n('colB', 400)); const [colH, setColH] = useState(n('colH', 400))
  const [girB, setGirB] = useState(n('girB', 300)); const [girH, setGirH] = useState(n('girH', 500))
  const [beaB, setBeaB] = useState(n('beaB', 250)); const [beaH, setBeaH] = useState(n('beaH', 450))
  // Concrete & reinforcement (shared material applied to every generated section)
  const [fc, setFc] = useState(n('fc', 28)); const [fy, setFy] = useState(n('fy', 415))
  const [barDia, setBarDia] = useState(n('barDia', 20)); const [tieDia, setTieDia] = useState(n('tieDia', 10))
  const [cover, setCover] = useState(n('cover', 40)); const [slabThk, setSlabThk] = useState(n('slabThk', 150))
  // Prestressing (applied to beam/girder sections as RectSection.ps)
  const [psOn, setPsOn] = useState(false)
  const [psAps, setPsAps] = useState(600); const [psFpu, setPsFpu] = useState(1860)
  const [psE, setPsE] = useState(150); const [psFci, setPsFci] = useState(24)
  const [gammaC, setGammaC] = useState(n('gammaC', 24))            // concrete unit weight, kN/m³
  // Material: 'concrete' (RC), 'steel' (AISC W-shapes) or 'wood' (timber) for the frame members.
  const [material, setMaterial] = useState<'concrete' | 'steel' | 'wood'>((si.material as 'concrete' | 'steel' | 'wood') ?? 'concrete')
  // Timber (wood frame): species/grade, sawn vs glulam, wet service.
  // Timber material as separate species + grade (migrating any legacy composite id).
  const legacyWood = WOOD_SPECIES[s('woodSpecies', 'DFL-2')]
  const [woodSpeciesId, setWoodSpeciesId] = useState(s('woodSpeciesId', legacyWood?.species ?? 'DFL'))
  const [woodGrade, setWoodGrade] = useState(s('woodGrade', legacyWood?.grade ?? '2'))
  const [woodWet, setWoodWet] = useState(b('woodWet', false))
  const woodSel: WoodSpecies = resolveWoodSpecies(woodSpeciesId, woodGrade) ?? gradesOf(woodSpeciesId)[0] ?? WOOD_SPECIES['DFL-2']
  // Timber material source: built-in library vs a user-defined custom material.
  const [matSource, setMatSource] = useState<'library' | 'custom'>((s('matSource', 'library')) as 'library' | 'custom')
  const [customId, setCustomId] = useState(s('customId', ''))
  const [customMaterials, setCustomMaterials] = useState<CustomMaterial[]>(() => loadCustomMaterials())
  const customAsSpecies = (cm: CustomMaterial): WoodSpecies =>
    ({ id: cm.id, label: cm.name, kind: cm.kind, ref: cm.ref, species: cm.id, speciesLabel: cm.name, grade: 'custom', gradeLabel: 'Custom', origin: 'custom' })
  const selectedCustom = customMaterials.find((m) => m.id === customId)
  const activeWood: WoodSpecies = matSource === 'custom' && selectedCustom ? customAsSpecies(selectedCustom) : woodSel
  const woodKind = activeWood.kind
  const [colFam, setColFam] = useState<SectionFamily>((s('colFam', 'W')) as SectionFamily)
  const [girFam, setGirFam] = useState<SectionFamily>((s('girFam', 'W')) as SectionFamily)
  const [beaFam, setBeaFam] = useState<SectionFamily>((s('beaFam', 'W')) as SectionFamily)
  const [colShape, setColShape] = useState(s('colShape', 'W310x79'))
  const [girShape, setGirShape] = useState(s('girShape', 'W360x51'))
  const [beaShape, setBeaShape] = useState(s('beaShape', 'W310x38.7'))
  const [steelFy, setSteelFy] = useState(n('steelFy', 345)); const [steelFu, setSteelFu] = useState(n('steelFu', 448))
  const [qD, setQD] = useState(n('qD', 4.8)); const [qL, setQL] = useState(n('qL', 2.4))
  // Soil (for the footing stage of the design pipeline)
  const [qa, setQa] = useState(n('qa', 200)); const [Hf, setHf] = useState(n('Hf', 1.5))
  const [gammaSoil, setGammaSoil] = useState(n('gammaSoil', 18))      // soil unit weight (overburden), kN/m³
  // Seismic (NSCP 208 static lateral force)
  const [Ca, setCa] = useState(n('Ca', 0.44)); const [Cv, setCv] = useState(n('Cv', 0.64))
  const [Rw, setRw] = useState(n('Rw', 8.5)); const [Ie, setIe] = useState(n('Ie', 1.0))
  const [Zf, setZf] = useState(n('Zf', 0.4)); const [Nv, setNv] = useState(n('Nv', 1.0))   // Zone factor + near-source (208-11)
  const [eDirs, setEDirs] = useState<string[]>((si.eDirs as string[]) ?? ['+X', '-X', '+Z', '-Z'])  // directional E cases to envelope
  // §208 static results per axis (they differ when Method-B periods differ per axis)
  const [seisXZ, setSeisXZ] = useState<{ x: SeismicResult; z: SeismicResult } | null>(null)
  const [methodB, setMethodB] = useState(b('methodB', true))          // §208.5.2.2 analytical period (needs a modal run)
  const [accTor, setAccTor] = useState(b('accTor', true))             // §208.7.2.7 accidental torsion ±5% E-case variants
  const [orth30, setOrth30] = useState(b('orth30', false))           // §208.8.1 orthogonal 100%+30% E cases
  const [evOn, setEvOn] = useState(b('evOn', true))                   // §208.4.1 vertical component Ev = 0.5·Ca·I·D
  const [rsaRegular, setRsaRegular] = useState(b('rsaRegular', true)) // §208.6.4.2 floors: 0.9·V_B & 0.8·V_A vs 1.0·V_B
  const [rsaGen, setRsaGen] = useState<{ x: RsaLateralResult; z: RsaLateralResult } | null>(null)   // RSA-derived E cases
  const [drift, setDrift] = useState<DriftRow[] | null>(null)
  const [irregular, setIrregular] = useState<IrregularityFlag[] | null>(null)
  // Wind (NSCP 207B directional procedure, MWFRS)
  const [Vw, setVw] = useState(n('Vw', 50)); const [expo, setExpo] = useState<'B' | 'C' | 'D'>((si.expo as 'B' | 'C' | 'D') ?? 'C')
  const [Kzt, setKzt] = useState(n('Kzt', 1.0))
  const [wDirs, setWDirs] = useState<string[]>((si.wDirs as string[]) ?? ['+X', '-X', '+Z', '-Z'])  // directional W cases
  const [wind, setWind] = useState<WindResult | null>(null)
  const [ccArea, setCcArea] = useState(1.0)   // C&C effective wind area, m²
  const [ccEncl, setCcEncl] = useState<WindEnclosure>('enclosed')
  const [cladding, setCladding] = useState<CladdingResult | null>(null)
  const [eCases, setECases] = useState<LateralCase[]>([])
  const [wCases, setWCases] = useState<LateralCase[]>([])
  // Analysis options: f₁ live-load factor (§203.3.1) and P-Δ second order
  const [assembly, setAssembly] = useState(b('assembly', false))
  const [pDelta, setPDelta] = useState(b('pDelta', false))
  const [cracked, setCracked] = useState(b('cracked', true))       // ACI §6.6.3.1.1 cracked EI (0.35/0.70 Ig)
  const [shearDef, setShearDef] = useState(b('shearDef', true))    // Timoshenko shear deformation (deep girders / squat columns)
  // The node as the TOP of the beam rather than its axis — the convention the
  // cages and the frame elevations use. OFF by default: it is a real
  // eccentricity, not a redraw, and it moves the column moments.
  const [beamTopSteel, setBeamTopSteel] = useState(b('beamTopSteel', false))
  const [allAround, setAllAround] = useState(b('allAround', true)) // column P–M bars on all four faces
  const [tBeamOn, setTBeamOn] = useState(b('tBeamOn', true))       // §6.3.2 flanged sagging design
  const [tryBars, setTryBars] = useState(b('tryBars', true))        // let design/optimize pick bar Ø from a ladder
  const [showLoads, setShowLoads] = useState(true)   // load-diagram overlay
  const [showFootings, setShowFootings] = useState(true)   // designed footing footprints
  const [showConns, setShowConns] = useState(true)         // designed steel joint hardware
  const [showRebar, setShowRebar] = useState(false)        // the designed bar cages, in 3D
  const [viewMode, setViewMode] = useState<ViewMode>('solid')   // solid concrete, or edges only
  // WHICH cages. A whole building's steel at once is a solid wall of bar, and
  // the panel someone is actually looking at is behind it — so the kinds are
  // separable. All on is the same view as before this existed.
  const [cageKinds, setCageKinds] = useState<CageKind[]>([...CAGE_KINDS])
  const toggleCageKind = (k: CageKind) =>
    setCageKinds((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]))

  const [model, setModel] = useState<StructuralModel | null>(() => {
    try {
      const raw = sessionStorage.getItem(AUTOSAVE_KEY)
      // migrate pre-per-member models so each member owns its section
      return raw ? splitSharedSections(JSON.parse(raw) as StructuralModel) : null
    } catch { return null }
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<F3Analysis | null>(null)
  /** Per-combo active set (tension/compression-only members); null when none. */
  const [axialSets, setAxialSets] = useState<ActiveSetAnalysis['axial'] | null>(null)
  const [modal, setModal] = useState<ModalResult | null>(null)
  const [modeShapeIdx, setModeShapeIdx] = useState<number | null>(null)
  const [modeAmp, setModeAmp] = useState(1.5)
  const [forceDiag, setForceDiag] = useState<DiagramComp | null>(null)   // inline 3D BMD/SFD overlay
  const [forceDiagScale, setForceDiagScale] = useState(1)                // user offset multiplier
  // The selected member's six force diagrams, folded away by default: the
  // selection panel shows on every tab now, and six charts is not a summary.
  const [selDiagrams, setSelDiagrams] = useState(false)
  /**
   * Which element's Delete has been armed, if any.
   *
   * Delete used to sit at the bottom of the Analysis tab, behind a scroll; it
   * is now two lines under the thing it deletes, on every tab. That is the
   * point of moving the panel, and it is also how a model loses a member to a
   * mis-aimed click — so the button asks once.
   *
   * It holds the ID rather than a boolean, so selecting something else disarms
   * it by simply no longer matching. Clearing it from an effect on `selected`
   * would be the same fact written as a cascading render, which is what
   * `react-hooks/set-state-in-effect` is there to stop.
   */
  const [armDelete, setArmDelete] = useState<string | null>(null)
  /**
   * Whether the viewport's navigation hint has been earned out.
   *
   * "orbit: drag · pan: ⇧drag · zoom: scroll" was pinned to the canvas forever,
   * so it went on telling someone who had been orbiting for an hour how to
   * orbit. It fades on the first real camera interaction — which is the proof
   * that it has been read — and stays gone: knowing how to orbit is not a fact
   * you can stop knowing when the model changes.
   */
  const [navHintDone, setNavHintDone] = useState(false)
  // Thermal load inputs
  const [thMember, setThMember] = useState('')
  const [thDeltaT, setThDeltaT] = useState(30)
  const [thAlphaKey, setThAlphaKey] = useState<'steel' | 'concrete' | 'custom'>('steel')
  const [thAlphaCustom, setThAlphaCustom] = useState(12e-6)
  const thAlpha = thAlphaKey === 'steel' ? 11.7e-6 : thAlphaKey === 'concrete' ? 10e-6 : thAlphaCustom
  // AISC DG11 floor-vibration check (0 = use the value auto-suggested from analysis)
  const [dg11OccId, setDg11OccId] = useState('office')
  const [dg11DeflMm, setDg11DeflMm] = useState(0)
  const [dg11W, setDg11W] = useState(0)
  const [rsa, setRsa] = useState<ResponseSpectrumResult | null>(null)
  const [nModes, setNModes] = useState(12)
  // Pushover (nonlinear static) inputs + result
  const [poDir, setPoDir] = useState<'x' | 'z'>('x')
  const [poPattern, setPoPattern] = useState<'triangular' | 'uniform'>('triangular')
  const [poRho, setPoRho] = useState(1.5)        // concrete tension-steel ratio, %
  const [poMpScale, setPoMpScale] = useState(1)
  const [poPM, setPoPM] = useState(false)        // apply P–M interaction at hinges
  const [poPDelta, setPoPDelta] = useState(false) // include second-order P-Δ (gravity)
  const [po, setPo] = useState<PushoverModelResult | null>(null)
  // Biaxial (skew) pushover — full 3D model, P–My–Mz hinges
  const [bxAngle, setBxAngle] = useState(45)     // plan angle, degrees from +X toward +Z
  const [bxSurface, setBxSurface] = useState<'power' | 'orbison'>('power')
  const [bxAlpha, setBxAlpha] = useState(2)      // power-surface exponent
  const [bxSteps, setBxSteps] = useState(40)
  const [bxDrift, setBxDrift] = useState(4)      // target roof drift, % of H
  const [bxPM, setBxPM] = useState(true)
  const [bx, setBx] = useState<BiaxialPushoverResult | null>(null)
  // Time-history (modal Newmark-β) inputs + result
  const [thKind, setThKind] = useState<GroundMotionKind>('rampedSine')
  const [thDir, setThDir] = useState<'x' | 'z'>('x')
  const [thPga, setThPga] = useState(0.3)        // g
  const [thFreq, setThFreq] = useState(2)        // Hz
  const [thDur, setThDur] = useState(10)         // s
  const [thZeta, setThZeta] = useState(5)        // %
  // Nonlinear time-history (hysteretic shear-building reduction) inputs + result
  const [nlDir, setNlDir] = useState<'x' | 'z'>('x')
  const [nlKind, setNlKind] = useState<GroundMotionKind>('rampedSine')
  const [nlPga, setNlPga] = useState(0.4)        // g
  const [nlFreq, setNlFreq] = useState(2)        // Hz
  const [nlDur, setNlDur] = useState(10)         // s
  const [nlZeta, setNlZeta] = useState(5)        // %
  const [nlB, setNlB] = useState(3)              // post-yield stiffness ratio, %
  const [nlRho, setNlRho] = useState(1.5)        // assumed tension steel ratio, %
  const [nl, setNl] = useState<{ inelastic: NonlinearModelResult | null; elastic: NonlinearModelResult | null } | null>(null)
  const [nlKindModel, setNlKindModel] = useState<'shear' | 'hinges'>('hinges')
  const [nlHinge, setNlHinge] = useState<{ inelastic: NonlinearFrameModelResult | null; elastic: NonlinearFrameModelResult | null } | null>(null)
  const [shellStress, setShellStress] = useState<{ nodes: ShellNode[]; elems: ShellElem[]; stresses: ElementStress[] } | null>(null)
  const [slabFE, setSlabFE] = useState<SlabFEScheduleRow[] | null>(null)
  const [recSpec, setRecSpec] = useState<{ spec: AccelSpectrum; design: DesignSpectrumPoint[]; name: string } | null>(null)
  const [shellSubdiv, setShellSubdiv] = useState(4)   // n×n triangulation per plate
  const [thCsv, setThCsv] = useState<{ text: string; name: string; npts: number } | null>(null)
  const [thCsvUnits, setThCsvUnits] = useState<'g' | 'ms2'>('g')
  const [thCsvDt, setThCsvDt] = useState(0.02)  // s, for one-column CSV
  const [th, setTh] = useState<TimeHistoryModelResult | null>(null)
  const [design, setDesign] = useState<StructureDesign | null>(null)
  const [opt, setOpt] = useState<OptimizeResult | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)   // open schedule-row solution
  const [report] = useState<'' | 'schedules' | 'drawings' | 'solutions' | 'full' | 'sol-only' | 'draw-only'>('')  // consolidated report template (interactive on screen; PDF carries everything)
  const [resultsTab, setResultsTab] = useState<'schedules' | 'boq' | 'schedule'>('schedules')  // results section tab
  const [modelImg, setModelImg] = useState<string | null>(null)   // 3D snapshot for the PDF report
  const [lh, setLh] = useState<LetterheadState>(() => initialLetterhead(''))
  const [exporting, setExporting] = useState(false)               // PDF build in flight
  // Mix class for the take-off. It FOLLOWS the design f′c rather than sitting
  // at a hard-coded 'A' — a model designed for 28 MPa was being priced with a
  // 9-bag Class A mix, which is not the concrete that was designed. The user
  // can still override it, and once they do the override sticks: `classPin`
  // holds their choice, `null` means "track f′c". A saved project that already
  // carries a class is treated as an override, so reopening it does not
  // silently reprice.
  const [classPin, setClassPin] = useState<ConcreteClass | null>((si.concreteClass as ConcreteClass) ?? null)
  const fcClass = useMemo(() => concreteClassForFc(fc), [fc])
  const concreteClass = useMemo<ConcreteClass>(() => classPin ?? fcClass.klass, [classPin, fcClass])
  const [prices, setPrices] = useState<PriceList>((si.prices as PriceList) ?? {   // unit prices for the costed bill (PHP)
    cementBag: 260, sandM3: 1500, gravelM3: 1600, steelKg: 65, tieWireRoll: 2500, plywoodSheet: 700, lumberM: 25, structuralSteelKg: 120, timberBdFt: 55,
  })
  const [sdlDraft, setSdlDraft] = useState<SdlItem[]>([])          // NSCP-204 SDL composition being built
  const [sdlMatId, setSdlMatId] = useState(TABLE_204_2[0].id)      // 204-2 material add-row
  const [sdlMatT, setSdlMatT] = useState(50)                       // 204-2 thickness, mm
  const [liveOccId, setLiveOccId] = useState('')                   // NSCP 205-1 occupancy ('' = default LL)
  const [tab, setTab] = useState<Tab>('geometry')                 // right-panel tab
  // Scroll on the CLICK, not on an effect keyed to `tab`. The guided tour also
  // drives setTab and scrolls its own target into view (GuidedTour scrollIntoView);
  // an effect cannot tell a user's click from the tour's step change, and would
  // yank the viewport back to the top of a step the tour had just centred.
  const pickTab = (t: Tab) => { setTab(t); scrollTop() }

  const [orphans, setOrphans] = useState(0)
  // footing plan: base node → '' (isolated) or partner node id (combined)
  const [planSel, setPlanSel] = useState<Record<string, string>>((si.planSel as Record<string, string>) ?? {})
  // frame-editor add-member picks
  const [newI, setNewI] = useState(''); const [newJ, setNewJ] = useState('')
  const [newRole, setNewRole] = useState<MemberRole>('beam')
  // wall-add form
  const [wallMember, setWallMember] = useState(''); const [wallH, setWallH] = useState(3)
  const [wallT, setWallT] = useState(150); const [wallShear, setWallShear] = useState(false)
  const [stLow, setStLow] = useState(''); const [stHigh, setStHigh] = useState('')
  const [stWidth, setStWidth] = useState(1.2); const [stWaist, setStWaist] = useState(150)
  const [stRisers, setStRisers] = useState(10)
  const [stFin, setStFin] = useState(1.5); const [stLive, setStLive] = useState(4.8)
  // Half-landings, m of PLAN depth at each end — 0 is none. A stair between
  // floors is two flights meeting on a beam at mid height, and the landing
  // belongs to ONE of them: put it on both and the same slab is in the model
  // twice.
  const [stLandLo, setStLandLo] = useState(0); const [stLandHi, setStLandHi] = useState(0)
  const controlsRef = useRef<React.ComponentRef<typeof OrbitControls>>(null)
  const { busy, run: runSolver, progress } = useSolver()   // off-thread FEM/design/optimise
  const gate = usePlanGate()
  const [planBlock, setPlanBlock] = useState<string | null>(null)

  /**
   * Every heavy job goes through here, so the plan check happens ONCE at the
   * single choke point instead of at each of the dozen call sites. The buttons
   * below are also disabled when a feature is off-plan, so this should never be
   * the thing a user hits — it is the backstop that makes a missed button the
   * cheap kind of mistake.
   *
   * Not a security boundary: this runs in the browser, like every calculation
   * in this app. See the header of lib/featureGate.ts.
   */
  const run = ((kind, payload) => {
    const v = gate.solve(kind as SolverKind, model?.members.length ?? 0)
    if (!v.allowed) {
      setPlanBlock(v.message)
      return Promise.reject(new Error(v.message))
    }
    setPlanBlock(null)
    return runSolver(kind, payload)
    // Cast to the solver's own signature: the wrapper is transparent, and
    // re-deriving the per-kind payload mapping here would duplicate useSolver's
    // types for no gain.
  }) as typeof runSolver

  // Verdicts for the sections a Pro account can see but not necessarily use.
  // Computed once here rather than at each button so the wording stays
  // identical wherever the same feature is refused.
  const nMembers = model?.members.length ?? 0
  const nonlinearGate = gate.solve('pushover', nMembers)
  const optimizeGate = gate.solve('optimize', nMembers)
  const reportsGate = gate.action('reports')

  // Hold Shift to PAN with a left-drag (otherwise left-drag orbits); right-drag
  // pans too. Toggles the OrbitControls left-button mode on Shift down/up.
  useEffect(() => {
    const setPan = (on: boolean) => (e: KeyboardEvent) => {
      if (e.key !== 'Shift') return
      const c = controlsRef.current
      if (c) c.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE
    }
    const down = setPan(true), up = setPan(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])


  // Persist the design inputs so a reload restores them alongside the autosaved
  // model (keeps the Geometry/Properties tabs + report inputs in sync with it).
  useEffect(() => {
    try {
      sessionStorage.setItem(INPUTS_KEY, JSON.stringify({
        baysX, baysZ, storeyH, colB, colH, girB, girH, beaB, beaH,
        fc, fy, barDia, tieDia, cover, slabThk, gammaC, qD, qL,
        qa, Hf, gammaSoil, Ca, Cv, Rw, Ie, Zf, Nv, eDirs, methodB, accTor, orth30, evOn, rsaRegular,
        Vw, expo, Kzt, wDirs, assembly, pDelta, cracked, shearDef, beamTopSteel, tryBars,
        concreteClass: classPin ?? undefined, prices, planSel,
        material, colFam, girFam, beaFam, colShape, girShape, beaShape, steelFy, steelFu,
        woodSpeciesId, woodGrade, woodWet, matSource, customId,
      }))
    } catch { /* quota — ignore */ }
  }, [baysX, baysZ, storeyH, colB, colH, girB, girH, beaB, beaH,
    fc, fy, barDia, tieDia, cover, slabThk, gammaC, qD, qL,
    qa, Hf, gammaSoil, Ca, Cv, Rw, Ie, Zf, Nv, eDirs, methodB, accTor, orth30, evOn, rsaRegular,
    Vw, expo, Kzt, wDirs, assembly, pDelta, cracked, shearDef, beamTopSteel, tryBars,
    classPin, prices, planSel,
    material, colFam, girFam, beaFam, colShape, girShape, beaShape, steelFy, steelFu,
    woodSpeciesId, woodGrade, woodWet, matSource, customId])

  /**
   * Undo history — see `lib/history`. Holds the models that CAME BEFORE; the
   * present is `model` itself, so there is only ever one copy of it.
   */
  const [hist, setHist] = useState<History<StructuralModel | null>>(emptyHistory)

  /**
   * Put a model on screen: state, autosave, and every derived result dropped
   * because it belonged to the model being replaced.
   *
   * Split out of `save` so that undo can restore a model WITHOUT recording the
   * restore as a new edit — which would push the value you just left onto the
   * past and make undo a loop between two models.
   */
  const applyModel = useCallback((m: StructuralModel | null) => {
    setModel(m)
    setAnalysis(null)             // geometry changed — results are stale
    setModal(null)
    setRsa(null)
    setDesign(null)
    setOpt(null)
    setExpanded(null)
    setDrift(null)
    setIrregular(null)
    try {
      if (m) sessionStorage.setItem(AUTOSAVE_KEY, JSON.stringify(m))
      else sessionStorage.removeItem(AUTOSAVE_KEY)
    } catch { /* quota — ignore */ }
    // Every dependency is a setState function, which React keeps stable — so
    // this identity never changes and the key handler below rebinds only when
    // the history or the model actually moves.
  }, [])

  /** An EDIT: what is on screen becomes undoable, then the new model applies. */
  const save = (m: StructuralModel | null) => {
    setHist((h) => recordHistory(h, model))
    applyModel(m)
  }

  // Memoised on the history and the model, because the keyboard handler below
  // takes them as dependencies: bound once it would close over the first
  // render's history and undo the same step forever, and rebound every render
  // it would swap the listener on every keystroke elsewhere on the page.
  const undo = useCallback(() => {
    const step = undoHistory(hist, model)
    if (!step) return
    setHist(step.history)
    applyModel(step.value)
    setSelected(null)          // the selected id may not exist in that model
  }, [hist, model, applyModel])
  const redo = useCallback(() => {
    const step = redoHistory(hist, model)
    if (!step) return
    setHist(step.history)
    applyModel(step.value)
    setSelected(null)
  }, [hist, model, applyModel])

  // ⌘Z / ⌃Z and ⌘⇧Z / ⌃Y. Not while typing: inside a number field ⌘Z is the
  // browser's own undo of the characters, and taking it would make an edit to
  // a bay width impossible to unpick a character at a time.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      if (isTypingTarget(e.target)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  /** save() for node-load-only edits (E/W case generation): mass and stiffness
   *  are untouched, so the modal result — which Method B and the RSA E-cases
   *  need on the NEXT generate click — stays valid and is kept. */
  const saveKeepModal = (m: StructuralModel) => {
    setModel(m)
    setAnalysis(null)
    setDesign(null)
    setOpt(null)
    setExpanded(null)
    setDrift(null)
    setIrregular(null)
    try { sessionStorage.setItem(AUTOSAVE_KEY, JSON.stringify(m)) } catch { /* quota — ignore */ }
  }

  // §203.3.1: f₁ = 1.0 for assembly/garage or live load > 4.8 kPa, else 0.5.
  const fLive = assembly || qL > 4.8 ? 1.0 : 0.5
  // Primary lateral axis (headline §208 summary + drift check direction).
  const primAxis: 'x' | 'z' = (eDirs[0] ?? '+X').includes('X') ? 'x' : 'z'
  const seis = seisXZ?.[primAxis] ?? null
  const lateral = [...eCases, ...wCases]
  // Infer seismic lateral system from R for column tie-detailing.
  // Only applies when E loads are present (user clicked "Generate E cases").
  const hasELoads = model?.loads.some((l) => l.cat === 'E') ?? false
  const seismicSystem: 'gravity' | 'imf' | 'smf' = hasELoads ? (Rw >= 8 ? 'smf' : Rw >= 5 ? 'imf' : 'gravity') : 'gravity'
  // §208.4.1 vertical seismic component folded into the E-combo D factors.
  const anaOpts = { f1: fLive, pDelta, lateral, seismicSystem, crackedSections: cracked, shearDeformation: shearDef, beamTopOfSteel: beamTopSteel, Ev: evOn ? 0.5 * Ca * Ie : undefined, colLayout: (allAround ? 'all-around' as const : 'two-face' as const), tBeamAction: tBeamOn }

  const analyze = () => {
    if (!model || busy || meshErrors) return   // §1 fail-fast: don't solve a singular mesh
    // 3D FEM + storey drift run in the worker so the UI stays responsive.
    run('analyze', {
      model, opts: anaOpts, drift: { hasSeis: !!seis, T: seis?.T ?? 0, R: Rw, axis: primAxis, pDelta }, crackedSections: cracked, shearDeformation: shearDef, beamTopOfSteel: beamTopSteel,
    }).then((r) => {
      const res = r as { analysis: F3Analysis | null; orphans: number; drift: DriftRow[] | null; irregularities: IrregularityFlag[] | null }
      setOrphans(res.orphans)
      setAnalysis(res.analysis)
      setAxialSets((res.analysis as ActiveSetAnalysis | null)?.axial ?? null)
      setDrift(res.drift)
      setIrregular(res.irregularities)
    }).catch((e) => console.error('analyze failed', e))
  }

  const runModal = () => {
    if (!model || busy || meshErrors) return
    setModeShapeIdx(null)    // stale shape from prior run
    run('modal', { model, nModes }).then((r) => {
      const m = (r as { modal: ModalResult | null }).modal
      setModal(m)
      if (m && m.modes.length > 0) {
        setRsa(computeResponseSpectrum(m, {
          Ca, Cv, I: Ie, R: Rw,
          staticV: seisXZ ? [seisXZ.x.V, 0, seisXZ.z.V] : undefined,
        }))
      } else {
        setRsa(null)
      }
    }).catch((e) => console.error('modal failed', e))
  }

  const runPushover = () => {
    if (!model || busy || meshErrors) return
    run('pushover', {
      model,
      opts: { dir: poDir === 'x' ? 0 : 2, pattern: poPattern, rho: poRho / 100, mpScale: poMpScale, pmInteraction: poPM, pDelta: poPDelta },
    }).then((r) => setPo((r as { pushover: PushoverModelResult | null }).pushover))
      .catch((e) => console.error('pushover failed', e))
  }

  const runBiaxialPushover = () => {
    if (!model || busy || meshErrors) return
    setBx(null)
    run('biaxialPushover', {
      model,
      opts: {
        angleDeg: bxAngle, pattern: poPattern, rho: poRho / 100, mpScale: poMpScale,
        pmInteraction: bxPM, steps: bxSteps, targetDispRatio: bxDrift / 100,
        surface: bxSurface === 'orbison' ? { kind: 'orbison' } : { kind: 'power', alpha: bxAlpha },
      },
    }).then((r) => setBx((r as { biaxialPushover: BiaxialPushoverResult | null }).biaxialPushover))
      .catch((e) => console.error('biaxial pushover failed', e))
  }

  const runNonlinear = () => {
    if (!model || busy || meshErrors) return
    setNl(null); setNlHinge(null)
    run('nonlinearTH', {
      model, hingeModel: nlKindModel,
      spec: { kind: nlKind, dt: 0.01, duration: nlDur, pga: nlPga * GRAVITY, freq: nlFreq, dir: nlDir === 'x' ? 0 : 2 },
      opts: { dir: nlDir, zeta: nlZeta / 100, b: nlB / 100, rho: nlRho / 100 },
    }).then((r) => {
      const res = r as {
        nonlinear?: { inelastic: NonlinearModelResult | null; elastic: NonlinearModelResult | null }
        hinge?: { inelastic: NonlinearFrameModelResult | null; elastic: NonlinearFrameModelResult | null }
      }
      setNl(res.nonlinear ?? null)
      setNlHinge(res.hinge ?? null)
    }).catch((e) => console.error('nonlinear time-history failed', e))
  }

  const runTimeHistory = () => {
    if (!model || busy || meshErrors) return
    const dir: 0 | 2 = thDir === 'x' ? 0 : 2
    const csvOpts: CsvAccelerogramOpts | undefined = thCsv
      ? { text: thCsv.text, dt: thCsvDt, units: thCsvUnits, dir }
      : undefined
    run('timeHistory', {
      model,
      opts: csvOpts
        ? { csv: csvOpts, zeta: thZeta / 100, nModes }
        : { spec: { kind: thKind, dt: 0.02, duration: thDur, pga: thPga * GRAVITY, freq: thFreq, dir }, zeta: thZeta / 100, nModes },
    }).then((r) => setTh((r as { timeHistory: TimeHistoryModelResult | null }).timeHistory))
      .catch((e) => console.error('time-history failed', e))
  }

  // Elastic response spectrum from the uploaded accelerogram, overlaid on the
  // NSCP 208 design spectrum (C8). Parses the same CSV used by the time-history.
  const runResponseSpectrum = () => {
    if (!thCsv) return
    const parsed = parseAccelerogram(thCsv.text, { dt: thCsvDt, units: thCsvUnits })
    if (!parsed) { setRecSpec(null); return }
    const spec = elasticResponseSpectrum(parsed.ag, parsed.dt, { zeta: thZeta / 100 })
    if (!spec) { setRecSpec(null); return }
    const design = nscp208DesignCurve(spec.points.map((p) => p.T), Ca, Cv, Ie, Rw)
    setRecSpec({ spec, design, name: thCsv.name })
  }

  const runShellStress = () => {
    if (!model || !model.shellElements || model.plates.length === 0) return
    // Mesh + solve the model's shell plates under the SERVICE area-load field for
    // display (subdivision, conforming edges and corner-id reuse handled by the
    // shared shellModel bridge). Pass nothing for D/L factors → unfactored stress.
    const solved = solveModelShells(model, { subdiv: shellSubdiv })
    if (!solved) { setShellStress(null); return }
    setShellStress({ nodes: solved.nodes, elems: solved.elems, stresses: solved.stresses })
  }

  const runSlabFE = () => {
    if (!model || !model.shellElements || model.plates.length === 0) return
    // Factored (1.2D + 1.6L) shell moment field → Wood-Armer slab reinforcement.
    const out = designModelSlabsFE(model, { subdiv: shellSubdiv })
    setSlabFE(out ? out.rows : null)
  }

  // Re-sign / re-axis a base node-load set into a directional case. The base
  // value's sign is preserved (RSA storey-force patterns can locally reverse),
  // so '−' cases are the exact mirror of '+' cases.
  const dirCase = (base: ModelLoad[], kind: 'E' | 'W', d: string): LateralCase => {
    const axis = d.includes('X') ? 'Fx' : 'Fz'
    const sign = d.startsWith('-') ? -1 : 1
    return {
      name: `${kind}${d}`, kind,
      loads: base.map((l) => {
        const v = (l as { Fx?: number }).Fx ?? (l as { Fz?: number }).Fz ?? 0
        return { kind: 'node', node: (l as { node: string }).node, [axis]: sign * v, cat: kind }
      }),
    }
  }

  /** §208.5.2.2 Method-B period per axis: the modal period of the mode with the
   *  largest effective-mass share in that direction (the fundamental
   *  translational mode). undefined when no modal result is available. */
  const fundamentalT = (axis: 'x' | 'z'): number | undefined => {
    if (!modal || modal.modes.length === 0) return undefined
    const d = axis === 'x' ? 0 : 2
    const best = modal.modes.reduce((a, m) => (m.effMassRatio[d] > a.effMassRatio[d] ? m : a))
    return best.effMassRatio[d] > 0 ? best.period : undefined
  }

  /** Swap the model's cat-E node loads for the primary direction's case and
   *  refresh the derived state shared by both E-generation paths. The engine
   *  builder expands dirs × ±0.3·perpendicular (§208.8.1) × ⟳/⟲ accidental
   *  torsion (§208.7.2.7) per the toggles. */
  const commitECases = (rx: SeismicResult, rz: SeismicResult, baseOf: (axis: 'x' | 'z') => ModelLoad[]) => {
    if (!model) return
    setSeisXZ({ x: rx, z: rz })
    setECases(buildECases(model, baseOf('x'), baseOf('z'), { dirs: eDirs, torsion: accTor, orth30 }))
    // commit the primary direction (untorsioned pattern) for the load-diagram
    // overlay + drift check
    const primary = dirCase(baseOf(primAxis), 'E', eDirs[0] ?? '+X')
    saveKeepModal({ ...model, loads: [...model.loads.filter((l) => !(l.cat === 'E' && l.kind === 'node')), ...primary.loads] })
  }

  const generateE = () => {
    if (!model) return
    // one solve per axis: distribution is direction-independent, but with a
    // Method-B period V (and so every Fx) can differ between X and Z.
    const base = { Ca, Cv, I: Ie, R: Rw, Z: Zf, Nv, gammaC }
    const rx = computeSeismic(model, { ...base, dir: 'x' as const, Tb: methodB ? fundamentalT('x') : undefined })
    const rz = computeSeismic(model, { ...base, dir: 'z' as const, Tb: methodB ? fundamentalT('z') : undefined })
    if (!rx || !rz) return
    setRsaGen(null)   // static pattern replaces any RSA-derived cases
    commitECases(rx, rz, (axis) => (axis === 'x' ? rx : rz).loads)
  }

  /** §208.6.4 dynamic path: RSA storey forces (CQC), scaled to the §208.6.4.2
   *  static-base-shear floor, become the cat-E cases the design envelopes. */
  const generateRsaE = () => {
    if (!model || !modal || modal.modes.length === 0) return
    const base = { Ca, Cv, I: Ie, R: Rw, Z: Zf, Nv, gammaC }
    const gen = (axis: 'x' | 'z') => {
      const vA = computeSeismic(model, { ...base, dir: axis })                            // Method-A static V
      const vB = computeSeismic(model, { ...base, dir: axis, Tb: fundamentalT(axis) })    // Method-B static V (§208.6.4.2)
      if (!vA || !vB) return null
      // regular: ≥ 90% of V(T_B), and never below 80% of V(T_A); irregular: 100% of V(T_B)
      const Vfloor = rsaRegular ? Math.max(0.9 * vB.V, 0.8 * vA.V) : vB.V
      const rsa = rsaEquivalentLoads(model, modal, { Ca, Cv, I: Ie, R: Rw, dir: axis, combine: 'cqc', Vfloor })
      return rsa ? { stat: vB, rsa } : null
    }
    const gx = gen('x'), gz = gen('z')
    if (!gx || !gz) return
    setRsaGen({ x: gx.rsa, z: gz.rsa })
    commitECases(gx.stat, gz.stat, (axis) => (axis === 'x' ? gx : gz).rsa.loads)
  }

  const generateW = () => {
    if (!model) return
    // wind magnitude IS axis-dependent (B, L differ), so solve each axis used.
    const needX = wDirs.some((d) => d.includes('X')), needZ = wDirs.some((d) => d.includes('Z'))
    const rx = needX ? computeWind(model, { V: Vw, exposure: expo, Kzt, dir: 'x' }) : null
    const rz = needZ ? computeWind(model, { V: Vw, exposure: expo, Kzt, dir: 'z' }) : null
    const primaryRes = rx ?? rz
    if (!primaryRes) return
    setWind(primaryRes)
    setWCases(wDirs.map((d) => {
      const base = (d.includes('X') ? rx : rz)?.loads ?? []
      return dirCase(base, 'W', d)
    }))
    const primary = dirCase(primaryRes.loads, 'W', wDirs[0] ?? '+X')
    saveKeepModal({ ...model, loads: [...model.loads.filter((l) => !(l.cat === 'W' && l.kind === 'node')), ...primary.loads] })
  }

  const runCladding = () => {
    if (!model) return
    setCladding(computeCladding(model, { V: Vw, exposure: expo, Kzt, dir: 'x', area: ccArea, enclosure: ccEncl }))
  }

  const soil = { qAllow: qa, gammaSoil, gammaConc: gammaC, H: Hf }
  const footingPlan = (): FootingPlan => {
    const plan: FootingPlan = {}
    for (const [node, partner] of Object.entries(planSel)) {
      if (partner) plan[node] = { type: 'combined', with: partner }
    }
    return plan
  }

  /** Apply the current Properties material (f′c, fy, ⌀, ties, cover) to every
   *  section and refresh the gravity loads with the current SDL/LL and γc — so
   *  Design/Optimize reflect Properties edits without regenerating the grid. */
  const applyMaterial = (m: StructuralModel): StructuralModel => {
    // barCount goes with the Ø it was searched at — a new Ø means a new cage,
    // so drop it and let the design re-derive (or bar selection re-adopt) one.
    const sections = m.sections.map((s) => ({ ...s, fc, fy, barDia, tieDia, cover, barCount: undefined }))
    const withMat = { ...m, sections }
    return { ...withMat, loads: buildGravityLoads(withMat, qD, qL, gammaC) }
  }

  // ── NSCP-204 SDL composer ──
  const toggleSdl204_1 = (c: typeof TABLE_204_1[number]) =>
    setSdlDraft((d) => d.some((x) => x.id === c.id)
      ? d.filter((x) => x.id !== c.id)
      : [...d, { id: c.id, kind: '204-1', label: c.label, kPa: c.kPa }])
  const addSdl204_2 = () => {
    const mtl = TABLE_204_2.find((x) => x.id === sdlMatId); if (!mtl || !(sdlMatT > 0)) return
    setSdlDraft((d) => [...d, { id: `${mtl.id}@${sdlMatT}`, kind: '204-2', label: `${mtl.label} (${sdlMatT} mm)`, gamma: mtl.gamma, thicknessMm: sdlMatT }])
  }
  const removeSdlItem = (idx: number) => setSdlDraft((d) => d.filter((_, i) => i !== idx))
  const commitPlates = (plates: Plate[]) => {
    const m2 = { ...model!, plates }
    save({ ...m2, loads: buildGravityLoads(m2, qD, qL, gammaC) })
  }
  /** Write the composed SDL to all slabs (or just the selected plate). */
  const applySdl = (toAll: boolean) => {
    if (!model) return
    const items = sdlDraft.length ? sdlDraft : undefined
    commitPlates(model.plates.map((p) =>
      p.role !== 'wall' && (toAll || p.id === selected) ? { ...p, sdlItems: items } : p))
  }
  // ── NSCP 205-1 live load (per slab) ──
  const occById = (id: string) => [...TABLE_205_1, ...TABLE_206].find((o) => o.id === id)
  const liveOf = (id: string) => { const o = occById(id); return o ? { id: o.id, label: o.label, kPa: o.kPa } : undefined }
  const applyLive = (toAll: boolean) => {
    if (!model) return
    const live = liveOf(liveOccId)
    commitPlates(model.plates.map((p) =>
      p.role !== 'wall' && (toAll || p.id === selected) ? { ...p, live } : p))
  }
  // ── Persistent per-panel editor row actions ──
  const setSlabSdl = (plateId: string, clear: boolean) => {
    if (!model) return
    const items = clear ? undefined : (sdlDraft.length ? sdlDraft : undefined)
    commitPlates(model.plates.map((p) => (p.id === plateId ? { ...p, sdlItems: items } : p)))
  }
  const setSlabLive = (plateId: string, occId: string) => {
    if (!model) return
    commitPlates(model.plates.map((p) => (p.id === plateId ? { ...p, live: liveOf(occId) } : p)))
  }
  // ── Timber deck (wood slab) per panel ──
  const setPlateDeck = (plateId: string, deck: WoodDeck | undefined) => {
    if (!model) return
    commitPlates(model.plates.map((p) => {
      if (p.id !== plateId) return p
      if (deck) return { ...p, deck }
      const rest = { ...p }; delete rest.deck; return rest
    }))
  }
  /** Patch fields of the selected plate's deck (leaves others intact). */
  const patchDeck = (plateId: string, patch: Partial<WoodDeck>) => {
    if (!model) return
    commitPlates(model.plates.map((p) => (p.id === plateId && p.deck ? { ...p, deck: { ...p.deck, ...patch } } : p)))
  }

  const runPipeline = () => {
    if (!model || busy || meshErrors) return
    setOpt(null)
    // material is applied on the main thread (cheap); the FEM + bar selection +
    // designStructure run in the worker so the page never freezes.
    run('design', {
      model: applyMaterial(model), soil, plan: footingPlan(), opts: anaOpts, tryBars,
    }).then((r) => {
      const res = r as { model: StructuralModel; design: StructureDesign | null }
      save(res.model)
      setDesign(res.design)
      requestAnimationFrame(captureModel)   // refresh the printable 3D snapshot
    }).catch((e) => console.error('design failed', e))
  }

  const optimize = () => {
    if (!model || busy || meshErrors) return
    run('optimize', {
      model: applyMaterial(model), soil, plan: footingPlan(), opts: anaOpts, tryBars, maxIter: 30,
    }).then((raw) => {
      const r = raw as OptimizeResult | null
      if (!r) return
      save(r.model)        // adopt the optimised per-member sections
      setOpt(r)
      setDesign(r.design)
      requestAnimationFrame(captureModel)
    }).catch((e) => console.error('optimize failed', e))
  }

  /** Snapshot the live 3D canvas as a PNG for the PDF report's first page. */
  const captureModel = () => {
    const c = document.querySelector('canvas') as HTMLCanvasElement | null
    if (!c) return
    try { setModelImg(c.toDataURL('image/png')) } catch { /* tainted / no context — skip */ }
  }

  /** Project & design inputs — shown in the schedules block and printed as
   *  §2 of the PDF calculation report. */
  // The bar cages, placed. Same objects the detail sheets project and the
  // take-off weighs — a view that built its own would be a fourth description
  // of the same steel, which is the thing this whole model set out to stop.
  /** Pedestal at each base node, m — how far the column runs below it. */
  const pedestalAt = useMemo(
    () => new Map((design?.footings ?? []).map((f) => [f.node, f.pedestal])),
    [design],
  )
  /**
   * The placed cages — ONE build, shared.
   *
   * There were three: this one gated on the 3D toggle, a second inside
   * `momentRatios` and a third in the PDF path, each calling
   * `buildStructureCages` again on the same model. The gate is the part that
   * mattered, though: the schedule's own section drawings are cut from these
   * cages, and a drawing that appeared only when the 3D rebar layer happened
   * to be switched on would be a drawing nobody could rely on.
   */
  const cageBuild = useMemo(
    () => (model && design ? buildStructureCages(model, design) : null),
    [model, design],
  )
  const rebarBuild = showRebar ? cageBuild : null
  const rebarCages = rebarBuild?.cages ?? []
  const scheduleCages = cageBuild?.cages ?? []
  /** The drawing set's frame elevations, indexed by the beam each one is the
   *  sheet for. Assembled once: it walks every member of every grid line at
   *  every level, and a schedule expands a row on every click. */
  const elevationOf = useMemo(
    () => (model && design && cageBuild
      ? elevationBundleByMember(model, design, cageBuild.cages)
      : new Map<string, FrameElevationBundle>()),
    [model, design, cageBuild],
  )
  /** The drawing set's column sheets, indexed by the member each storey of a
   *  stack belongs to. Assembled once, like the beam elevations. */
  const columnStackOf = useMemo(
    () => (model && design && cageBuild
      ? columnStackByMember(model, design, cageBuild.cages)
      : new Map<string, ColumnStackBundle>()),
    [model, design, cageBuild],
  )
  /** The storey a column row is about — one member of its stack. */
  const columnStorey = (memberId: string): { yBot: number; yTop: number } | undefined => {
    const seg = columnStackOf.get(memberId)?.input.segments.find((x) => x.mark === memberId)
    return seg ? { yBot: seg.yBot, yTop: seg.yTop } : undefined
  }
  /** The stretch of the elevation a beam's k-th design section speaks for —
   *  see `beamSectionZones`, which does the two changes of coordinate. */
  const beamZone = (bm: { id: string; sections: { x: number }[] }, k: number): [number, number] | undefined => {
    const b = elevationOf.get(bm.id)
    if (!b || !model) return undefined
    return beamSectionZones(model, b, bm.id, bm.sections.map((x) => x.x))?.[k]
  }
  /** How many cages of each kind were placed — the count beside each Display
   *  checkbox, and what decides which checkboxes there are anything to show. */
  const cagesByKind = useMemo(() => {
    const by = new Map<CageKind, number>()
    for (const c of rebarBuild?.cages ?? []) if (c.kind) by.set(c.kind, (by.get(c.kind) ?? 0) + 1)
    return by
  }, [rebarBuild])
  /** How many cages the viewport is really drawing, after the kind filter —
   *  the number the ghosting has to be decided on rather than the checkbox. */
  const drawnCages = cageKinds.reduce((n, k) => n + (cagesByKind.get(k) ?? 0), 0)
  /**
   * How the concrete is drawn right now — see `components/modelSpace/viewMode`.
   *
   * Derived every render from three things that can each change on their own:
   * the mode the user picked, whether a force diagram is up (which forces
   * wireframe, because the ribbon runs inside the member), and whether there is
   * actually a cage behind the concrete to see.
   */
  const drawMode = effectiveViewMode(viewMode, forceDiag !== null)
  const surface = surfaceStyleFor(drawMode, ghostConcrete(showRebar, drawnCages))
  /** Draw the model as its SKELETON — one line per member, node to node —
   *  rather than as solids with a different material. */
  const skeleton = drawMode === 'wireframe'
  /**
   * §418.6.3.2 / §418.4.2.2 on the placed bars.
   *
   * Built on its own cages rather than on `rebarBuild`'s, because the check
   * belongs to the schedule and must not blink out when the 3D rebar layer is
   * switched off. Gravity designs skip it — there is no reversal rule.
   */
  const momentRatios = useMemo(
    () => (model && design && design.system !== 'gravity' && cageBuild
      ? structureMomentRatios(model, design, cageBuild.cages)
      : []),
    [model, design, cageBuild],
  )
  /**
   * What the cage builder had to DECIDE, and what it could not place.
   *
   * These used to be built and thrown away: a hook turned the other way
   * because there was no concrete for it, a bar stranded outside the 150 mm a
   * tie can restrain, a member the design named that the model has not got.
   * The 3D view showed the result and never said why, which is the one thing a
   * reviewer needs. Grouped by the note itself, since a whole floor of columns
   * reaches the same one.
   */
  const rebarNotes = useMemo(() => {
    const by = new Map<string, string[]>()
    for (const c of rebarBuild?.cages ?? []) {
      for (const n of c.notes ?? []) {
        const at = by.get(n) ?? []
        if (!at.includes(c.member)) at.push(c.member)
        by.set(n, at)
      }
    }
    for (const u of rebarBuild?.unplaced ?? []) {
      const n = 'no cage: the design names it but the model has no member with those nodes'
      const at = by.get(n) ?? []
      at.push(u)
      by.set(n, at)
    }
    return [...by.entries()]
  }, [rebarBuild])

  const reportProps = (d: StructureDesign): [string, string][] => {
    const distinct = (role: MemberRole) => {
      const ids = new Set((model?.members ?? []).filter((m) => m.role === role).map((m) => m.section))
      return [...new Set((model?.sections ?? []).filter((s) => ids.has(s.id)).map((s) => s.name))].join(', ') || '—'
    }
    const slabT = [...new Set((model?.plates ?? []).filter((p) => p.role !== 'wall').map((p) => p.thickness))].join(', ')
    const barsUsed = [...new Set((model?.sections ?? []).filter((s) => s.material !== 'steel').map((s) => s.barDia))].sort((a, b) => a - b)
    const hasConcreteMems = d.beams.length > 0 || d.columns.length > 0
    const hasSteelMems    = d.steelBeams.length > 0 || d.steelColumns.length > 0
    const hasWoodMems     = d.woodBeams.length > 0 || d.woodColumns.length > 0
    const woodGrades      = [...new Set([...d.woodBeams, ...d.woodColumns].map((r) => r.species))]
      .map((id) => WOOD_SPECIES[id]?.label ?? id).join(', ')
    const slabSdls = [...new Set((model?.plates ?? []).filter((p) => p.role !== 'wall')
      .map((p) => (p.sdlItems && p.sdlItems.length ? sdlTotal(p.sdlItems) : qD)))].sort((a, b) => a - b)
    return [
      ['Column grid', `bays X ${baysX} m · bays Z ${baysZ} m · storeys ${storeyH} m`],
      ...(hasConcreteMems ? [['RC material', `f′c ${fc} MPa · fy ${fy} MPa · main ⌀${barsUsed.join('/⌀') || barDia} · ties ⌀${tieDia} · cover ${cover} mm`]] as [string, string][] : []),
      ...(hasSteelMems    ? [['Steel grade',  `Fy ${steelFy} MPa · Fu ${steelFu} MPa (AISC W-shapes)`]] as [string, string][] : []),
      ...(hasWoodMems     ? [['Timber grade', `${woodGrades}${woodWet ? ' · wet service' : ''} (NDS §3 / NSCP §6)`]] as [string, string][] : []),
      ['Columns', distinct('column')],
      ['Girders', distinct('girder')],
      ['Beams', distinct('beam')],
      ['Slabs', `t = ${slabT || '—'} mm · SDL ${slabSdls.map((v) => v.toFixed(2)).join(' / ')} kPa`],
      ['Loads', `default SDL ${qD} kPa · LL ${qL} kPa · γc ${gammaC} kN/m³`],
      ['Soil / footing', `qa ${qa} kPa · γsoil ${gammaSoil} kN/m³ · depth H ${Hf} m`],
      ['Seismic (NSCP 208)', `Ca ${Ca} · Cv ${Cv} · R ${Rw} · I ${Ie} · Z ${Zf} · Nv ${Nv}`],
      ['Wind (NSCP 207B)', `V ${Vw} m/s · exposure ${expo} · Kzt ${Kzt}`],
      ['Model', `${model?.nodes.length ?? 0} nodes · ${model?.members.length ?? 0} members · ${model?.plates.length ?? 0} slabs · ${(model?.walls ?? []).length} walls · ${model?.supports.length ?? 0} supports`],
      ['Governing case', d.govName],
      ['Concrete', `${f1(d.totals.concrete)} m³ (${f1(d.totals.concreteMembers)} members + ${f1(d.totals.concreteSlabs)} slabs)`],
      ...(d.totals.steelKg > 0
        ? [['Structural steel', `${f1(d.totals.steelKg)} kg (${f2(d.totals.steelKg / 1000)} t)`] as [string, string]]
        : []),
      ...(d.totals.woodVolume > 0
        ? [['Timber', `${f2(d.totals.woodVolume)} m³`] as [string, string]]
        : []),
    ]
  }

  /** Direct PDF export — grabs a fresh 3D snapshot, assembles the report
   *  payload and lazy-loads the jsPDF renderer (fonts stay out of the main
   *  bundle). Replaces the old print-the-page path. */
  const exportPdf = async () => {
    if (!model || !design || exporting) return
    // Backstop, for the same reason `run` has one: there are TWO buttons that
    // reach this (the workspace header and the results bar), and a check that
    // lives only on the buttons is one refactor away from being bypassed. The
    // second one was in fact missed on the first pass here.
    const v = gate.action('reports')
    if (!v.allowed) { setPlanBlock(v.message); return }
    setExporting(true)
    try {
      let img = modelImg
      const c = document.querySelector('canvas') as HTMLCanvasElement | null
      if (c) { try { img = c.toDataURL('image/png') } catch { /* tainted — keep the last snapshot */ } }
      const [{ buildModelReport }, { generateModelPdf }, { buildSheetSet }] = await Promise.all([
        import('../lib/modelReport'), import('../lib/modelPdf'), import('../lib/planSheets'),
      ])
      const badges = ['NSCP 2015', 'ACI 318-14',
        ...(design.steelBeams.length || design.steelColumns.length ? ['AISC 360-16'] : []),
        ...(design.woodBeams.length || design.woodColumns.length ? ['NDS §3 / NSCP §6'] : [])]
      await generateModelPdf({
        lh, modelImg: img, badges,
        report: buildModelReport(model, design, reportProps(design), soil, irregular,
          // §418.6.3.2/§418.4.2.2 is measured on the PLACED bars, so the cages
          // have to exist first; a gravity frame has no such clause and the
          // section is left out rather than printed empty.
          design.system === 'gravity' || !cageBuild ? null
            : structureMomentRatios(model, design, cageBuild.cages)),
        // The same sheet set the Plans tab renders — one list, two outputs.
        sheets: buildSheetSet(model, design, soil),
        fileName: `structure-report${lh.sheet ? '-' + lh.sheet.split('·')[0].trim() : ''}.pdf`,
      })
    } catch (e) {
      console.error('PDF export failed', e)
    } finally { setExporting(false) }
  }

  // ── Frame-editor helpers (all immutable via save) ──
  const updNode = (id: string, k: 'x' | 'y' | 'z', v: number) => {
    if (!model || !Number.isFinite(v)) return
    save({ ...model, nodes: model.nodes.map((n) => (n.id === id ? { ...n, [k]: v } : n)) })
  }
  const addNode = () => {
    if (!model) return
    let k = model.nodes.length
    while (model.nodes.some((n) => n.id === `n${k}`)) k++
    save({ ...model, nodes: [...model.nodes, { id: `n${k}`, x: 0, y: 0, z: 0 }] })
  }
  const toggleSupport = (id: string) => {
    if (!model) return
    const has = model.supports.some((s) => s.node === id)
    save({
      ...model,
      supports: has ? model.supports.filter((s) => s.node !== id)
        : [...model.supports, { node: id, fixity: 'fixed' as const }],
    })
  }
  const updSupport = (nodeId: string, patch: Partial<NodeSupport>) => {
    if (!model) return
    save({ ...model, supports: model.supports.map((s) => (s.node === nodeId ? { ...s, ...patch } : s)) })
  }
  const updMember = (id: string, patch: Partial<Member>) => {
    if (!model) return
    save({ ...model, members: model.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
  }
  const sectionFor = (memberId: string): RectSection | undefined => {
    const m = model?.members.find((x) => x.id === memberId)
    return m ? model?.sections.find((s) => s.id === m.section) : undefined
  }
  const colSectionAt = (node: string): RectSection | undefined => {
    const c = model?.members.find((m) => m.role === 'column' && (m.i === node || m.j === node))
    return c ? sectionFor(c.id) : undefined
  }
  const updMemberSize = (memberId: string, k: 'b' | 'h', v: number) => {
    if (!model || !Number.isFinite(v)) return
    const mm = model.members.find((x) => x.id === memberId); if (!mm) return
    save({
      ...model,
      sections: model.sections.map((s) => (s.id === mm.section
        ? { ...s, [k]: v, name: k === 'b' ? `${v}×${s.h}` : `${s.b}×${v}` } : s)),
    })
  }
  const addMember = () => {
    if (!model || !newI || !newJ || newI === newJ) return
    // no second member on a node pair that already has one
    if (model.members.some((m) => (m.i === newI && m.j === newJ) || (m.i === newJ && m.j === newI))) return
    let k = model.members.length
    while (model.members.some((m) => m.id === `m${k}`)) k++
    const id = `m${k}`
    const tmpl = model.sections[0] ?? { b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 } as RectSection
    save({
      ...model,
      sections: [...model.sections, { ...tmpl, id, name: `${tmpl.b}×${tmpl.h}` }],
      members: [...model.members, { id, i: newI, j: newJ, role: newRole, section: id }],
    })
  }
  const updPlateThickness = (id: string, t: number) => {
    if (!model || !Number.isFinite(t)) return
    const m2 = { ...model, plates: model.plates.map((p) => (p.id === id ? { ...p, thickness: t } : p)) }
    save({ ...m2, loads: buildGravityLoads(m2, qD, qL, gammaC) })
  }
  const addWall = () => {
    if (!model || !wallMember) return
    if ((model.walls ?? []).some((w) => w.member === wallMember)) return   // one wall per member
    let k = model.walls?.length ?? 0
    while ((model.walls ?? []).some((w) => w.id === `w${k}`)) k++
    const walls = [...(model.walls ?? []), { id: `w${k}`, member: wallMember, height: wallH, thickness: wallT, shearWall: wallShear }]
    const m2 = { ...model, walls }
    save({ ...m2, loads: buildGravityLoads(m2, qD, qL, gammaC) })
  }
  const removeWall = (id: string) => {
    if (!model) return
    const m2 = { ...model, walls: (model.walls ?? []).filter((w) => w.id !== id) }
    save({ ...m2, loads: buildGravityLoads(m2, qD, qL, gammaC) })
  }

  /** A flight between two beams. Everything else about it — R, G, θ, the run —
   *  is derived from where those two beams are, so there is nothing else to
   *  type and nothing that can disagree. */
  /** The landings the panel's fields describe — only the ends given a depth. */
  const stLandings = (): StairLanding[] => ([
    ...(stLandLo > 0 ? [{ at: 'low' as const, depth: stLandLo }] : []),
    ...(stLandHi > 0 ? [{ at: 'high' as const, depth: stLandHi }] : []),
  ])
  const addStair = () => {
    if (!model || !stLow || !stHigh || stLow === stHigh) return
    let k = model.stairs?.length ?? 0
    while ((model.stairs ?? []).some((x) => x.id === `st${k}`)) k++
    const stairs = [...(model.stairs ?? []), {
      id: `st${k}`, low: stLow, high: stHigh, width: stWidth, waist: stWaist,
      risers: stRisers, finishes: stFin, live: stLive, support: 'simple' as const,
      landings: stLandings(),
    }]
    const m2 = { ...model, stairs }
    save({ ...m2, loads: buildGravityLoads(m2, qD, qL, gammaC) })
  }
  const removeStair = (id: string) => {
    if (!model) return
    const m2 = { ...model, stairs: (model.stairs ?? []).filter((x) => x.id !== id) }
    save({ ...m2, loads: buildGravityLoads(m2, qD, qL, gammaC) })
  }
  const updLoad = (idx: number, v: number) => {
    if (!model || !Number.isFinite(v)) return
    save({
      ...model,
      loads: model.loads.map((l, i) => {
        if (i !== idx) return l
        if (l.kind === 'area') return { ...l, q: v }
        if (l.kind === 'member-udl') return { ...l, w: v }
        if (l.kind === 'member-point') return { ...l, P: v }
        if (l.kind === 'member-thermal') return { ...l, deltaT: v }
        return l
      }),
    })
  }
  const delLoad = (idx: number) => {
    if (!model) return
    save({ ...model, loads: model.loads.filter((_, i) => i !== idx) })
  }
  const rebuildGravity = () => {
    if (!model) return
    // self-weight + SDL (D) and LL (L) regenerated; E loads survive untouched
    save({ ...model, loads: buildGravityLoads(model, qD, qL, gammaC) })
  }

  // material take-off / BOM-BOQ for the current design + mix class
  const takeoff = useMemo(
    () => (design && model ? estimateTakeoff(model, design, { concreteClass }) : null),
    [design, model, concreteClass],
  )
  const bill = useMemo(() => (takeoff ? costBill(takeoff, prices) : null), [takeoff, prices])
  const peso = (v: number) => `₱${v.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`

  const gov = analysis ? analysis.perCombo[analysis.govIdx] : null
  const govRes = gov?.result ?? null
  const memForce = useMemo(() => {
    const map = new Map<string, { Mmax: number; Vmax: number; Nmax: number }>()
    govRes?.members.forEach((m) => map.set(m.id, { Mmax: m.Mmax, Vmax: m.Vmax, Nmax: m.Nmax }))
    return map
  }, [govRes])

  const generate = (matOverride?: 'concrete' | 'steel' | 'wood', woodOverride?: { sel?: WoodSpecies; wet?: boolean }) => {
    const mat = { fc, fy, barDia, tieDia, cover }
    const role = (b: number, h: number, id: string): RectSection => ({ id, name: `${b}×${h}`, b, h, ...mat })
    // steel role: bounding box b = bf, h = d from the chosen AISC shape, tagged
    // material/shape so the bridge, design pipeline and 3D extrusion pick it up.
    const steelRole = (shapeName: string, id: string): RectSection => {
      const sh = shapeByName(shapeName)
      const { b, h } = sh ? sectionBoundingBox(sh) : { b: 200, h: 300 }
      return { id, name: shapeName, b, h, ...mat, material: 'steel', shape: shapeName, steelFy, steelFu }
    }
    // wood role: solid-rectangle b × d tagged with the resolved timber material —
    // both the library id and the reference values travel with the section so
    // the bridge (E), pipeline (NDS §3 design) and take-off pick it up. Fresh
    // selection passed via woodOverride to avoid a same-tick stale-state read.
    const wsel = woodOverride?.sel ?? activeWood
    const wet = woodOverride?.wet ?? woodWet
    const woodRole = (b: number, h: number, id: string): RectSection =>
      ({ id, name: `${b}×${h}`, b, h, ...mat, material: 'wood',
         woodSpecies: wsel.id, woodGrade: wsel.grade, woodRef: wsel.ref, woodKind: wsel.kind, woodWet: wet })
    const chosen = matOverride ?? material
    const steel = chosen === 'steel', wood = chosen === 'wood'
    const m = generateGridModel({
      baysX: parseList(baysX), baysZ: parseList(baysZ), storeyH: parseList(storeyH),
      column: steel ? steelRole(colShape, 'COL') : wood ? woodRole(colB, colH, 'COL') : role(colB, colH, 'COL'),
      girder: steel ? steelRole(girShape, 'GIR') : wood ? woodRole(girB, girH, 'GIR') : role(girB, girH, 'GIR'),
      beam: steel ? steelRole(beaShape, 'BEA') : wood ? woodRole(beaB, beaH, 'BEA') : role(beaB, beaH, 'BEA'),
      slabThickness: slabThk,
    })
    // Wood frame → the floor slabs are timber decks too: give every floor panel a
    // default deck-on-joist (joists in the chosen species) so it designs as a
    // wood slab. Concrete/steel frames keep RC slabs.
    if (wood) m.plates = m.plates.map((p) => p.role === 'wall' ? p
      : { ...p, deck: { ...DEFAULT_DECK, joistSpecies: wsel.id, joistKind: wsel.kind, wet } })
    // gravity loads: member self-weight (D), slab self-weight + SDL (D), LL (L)
    m.loads = buildGravityLoads(m, qD, qL, gammaC)
    setSelected(null)
    setSeisXZ(null)
    setRsaGen(null)
    setWind(null)
    setECases([])
    setWCases([])
    setPlanSel({})
    save(m)
  }

  // The walkthrough. Advancing a step switches the tab too — see `useTour`.
  //
  // On a first visit every panel the tour points at is EMPTY, so without this
  // the guide is a tour of a blank canvas: "assign sections to each member
  // family" beside a table with no members in it. If there is no model when
  // the guide opens, it generates the standard grid from the inputs already on
  // the Geometry tab as a demo, and clears it again on close.
  //
  // A model the user ALREADY HAS is never touched. The guide then runs against
  // their own structure — better than a demo anyway — and there is nothing to
  // restore, which is the only version of "restore" that cannot lose work.
  const demoModel = useRef(false)
  const tour = useTour(MODEL_STEPS, (t) => setTab(t as Tab), {
    onStart: () => { if (!model) { demoModel.current = true; generate() } },
    onEnd: () => {
      if (!demoModel.current) return
      demoModel.current = false
      setModeShapeIdx(null)   // stop the mode-shape animation with its model
      save(null)              // clears the model, results and the autosave key
    },
  })

  // ── ?tour=1 — the landing page's "Run it yourself, guided" link ─────────
  // The Guide button lives in this component's state, so a link from outside
  // cannot reach it. This is that door. The parameter is consumed on arrival:
  // leaving it in the URL would restart the walkthrough on every refresh, and
  // would be shared to somebody who did not ask for it.
  const [params, setParams] = useSearchParams()
  const tourParam = params.get('tour')
  const tourStart = tour.start
  useEffect(() => {
    if (tourParam !== '1') return
    const next = new URLSearchParams(params)
    next.delete('tour')
    setParams(next, { replace: true })
    tourStart()
  }, [tourParam, params, setParams, tourStart])

  const nodePos = useMemo(() => {
    const map = new Map<string, THREE.Vector3>()
    model?.nodes.forEach((n) => map.set(n.id, new THREE.Vector3(n.x, n.y, n.z)))
    return map
  }, [model])
  // auto rigid end-zone offsets (ETABS-style) for rendering the joint zones
  const autoOff = useMemo(
    () => (model?.rigidEndZones ? autoRigidOffsets(model, model.rigidZoneFactor ?? 0.5) : null),
    [model])
  // VISUAL face offsets (factor 1 = the full support face, independent of the
  // analysis rigid-zone setting), for BOTH materials: a beam is drawn to the
  // face of the member it lands on (steel: the tab/weld bridges the gap;
  // concrete: the joint block belongs to the column pour), and a column whose
  // stack ends extends UP to the top of the deepest framing beam.
  const faceOff = useMemo(() => (model ? autoRigidOffsets(model, 1) : null), [model])
  // model bounds → zoom-to-extents on load / after generate
  const modelBox = useMemo(() => {
    if (!model || model.nodes.length === 0) return null
    const xs = model.nodes.map((n) => n.x), ys = model.nodes.map((n) => n.y), zs = model.nodes.map((n) => n.z)
    return { min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)] as [number, number, number], max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)] as [number, number, number] }
  }, [model])

  // Auto-scale for the inline 3D force diagram: the model-wide peak |ordinate| of
  // the chosen component maps to ~10% of the model's largest dimension (× user mult).
  const forceDiagInfo = useMemo(() => {
    if (!forceDiag || !govRes || !modelBox) return null
    const byId = new Map<string, F3MemberResult>(govRes.members.map((m) => [m.id, m]))
    let maxAbs = 0
    for (const m of govRes.members) for (const v of m[forceDiag]) maxAbs = Math.max(maxAbs, Math.abs(v))
    const span = Math.max(modelBox.max[0] - modelBox.min[0], modelBox.max[1] - modelBox.min[1], modelBox.max[2] - modelBox.min[2], 1)
    const scale = diagramScale(maxAbs, span * 0.1 * forceDiagScale)
    return { byId, scale, maxAbs }
  }, [forceDiag, forceDiagScale, govRes, modelBox])

  // Members switched OFF by the active set of the GOVERNING combo. Each combo
  // settles on its own set, so this is combo-specific — the table below the
  // viewport lists every combo.
  const inactiveIds = useMemo(() => {
    if (!axialSets || !analysis) return new Set<string>()
    return new Set(axialSets[analysis.govIdx]?.inactive ?? [])
  }, [axialSets, analysis])
  const axialUnconverged = useMemo(
    () => (axialSets ?? []).filter((a) => a && !a.converged).length, [axialSets])

  const selMember: Member | undefined = model?.members.find((m) => m.id === selected)
  const selPlate: Plate | undefined = model?.plates.find((p) => p.id === selected)

  // Alignment-chart K-factors per column (AISC Commentary C-C2), keyed by member.
  const columnKs = useMemo(() => {
    if (!model) return new Map<string, ColumnK>()
    return new Map(columnKFactors(model).map((k) => [k.memberId, k]))
  }, [model])

  // DG11 auto-suggestions from the analysis: the worst floor vertical deflection
  // (Δ for fn) and the dead weight supported by that floor's storey (W).
  const dg11Suggest = useMemo(() => {
    if (!model || !govRes) return null
    const supports = new Set(model.supports.map((s) => s.node))
    let worst = 0, worstY = 0
    model.nodes.forEach((n, k) => {
      if (supports.has(n.id) || n.y <= 1e-6) return       // skip bases & ground
      const uy = Math.abs(govRes.d[6 * k + 1])            // vertical deflection, m
      if (uy > worst) { worst = uy; worstY = n.y }
    })
    if (worst <= 0) return null
    const mass = buildSeismicMass(model)                  // tonnes per node (dead)
    let storeyT = 0
    for (const n of model.nodes) if (Math.abs(n.y - worstY) < 1e-3) storeyT += mass.get(n.id) ?? 0
    return { deflMm: worst * 1000, W: storeyT * GRAVITY } // mm, kN
  }, [model, govRes])


  // human-readable label for the currently-selected element (shown on the 3D view)
  const selInfo: { kind: string; id: string; extra?: string } | null = !selected ? null
    : selMember ? { kind: selMember.role, id: selMember.id, extra: sectionFor(selMember.id)?.name }
      : selPlate ? { kind: selPlate.role, id: selPlate.id, extra: `t = ${selPlate.thickness} mm` }
        : model?.nodes.some((nn) => nn.id === selected) ? { kind: 'node', id: selected }
          : { kind: 'element', id: selected }

  const plateInfo = useMemo(() => {
    if (!selPlate || !model) return null
    const c = selPlate.corners.map((id) => nodePos.get(id)!)
    const lx = Math.abs(c[1].x - c[0].x) || Math.abs(c[2].x - c[0].x)
    const lz = Math.abs(c[3].z - c[0].z) || Math.abs(c[2].z - c[0].z)
    const areaLoads = model.loads
      .filter((l) => l.kind === 'area' && l.plate === selPlate.id)
      .map((l) => ({ q: (l as { q: number }).q, cat: l.cat }))
    const trib = areaLoads.length ? distributePanel(lx, lz, areaLoads) : null
    return { lx, lz, areaLoads, trib }
  }, [selPlate, model, nodePos])

  const memberLen = selMember
    ? nodePos.get(selMember.i)!.distanceTo(nodePos.get(selMember.j)!)
    : 0

  // Pre-analysis mesh diagnostics (§1) — drives the validation panel and the
  // fail-fast guard on the Analyze button.
  const meshIssues = useMemo(() => (model ? validateMesh(model) : []), [model])
  const meshErrors = hasMeshErrors(meshIssues)

  // Member-length lookup (m) for the statics self-check in the reactions panel.
  const memberLenById = useMemo(() => {
    const map = new Map<string, number>()
    model?.members.forEach((mm) => {
      const a = nodePos.get(mm.i), b = nodePos.get(mm.j)
      if (a && b) map.set(mm.id, a.distanceTo(b))
    })
    return (id: string) => map.get(id) ?? 0
  }, [model, nodePos])

  /**
   * The design verdict for one member, whatever kind it turned out to be.
   *
   * The schedules are split by material and role, so "is this member OK?" is
   * six lookups. Asked once here, because the person who just clicked a member
   * is asking exactly that and should not have to know which schedule it lands
   * in to find out.
   */
  const memberDesign = (id: string): { kind: string; ok: boolean; util?: number } | null => {
    if (!design) return null
    const rc = design.beams.find((b) => b.id === id)
    if (rc) return { kind: 'RC beam', ok: rc.ok }
    const col = design.columns.find((c) => c.id === id)
    if (col) return { kind: 'RC column', ok: col.ok, util: col.util }
    const sb = design.steelBeams.find((b) => b.id === id)
    if (sb) return { kind: 'Steel beam', ok: sb.ok, util: Math.max(sb.utilM, sb.utilV) }
    const sc = design.steelColumns.find((c) => c.id === id)
    if (sc) return { kind: 'Steel column', ok: sc.ok, util: sc.ratio }
    const ps = design.prestressed.find((b) => b.id === id)
    if (ps) return { kind: 'Prestressed beam', ok: ps.ok }
    return null
  }


  // Panel action button (mockup "Regenerate grid model" style — flat light blue).
  const btn =
    'rounded-md border border-[#cddcf0] bg-[#eaf1f9] px-4 py-2 text-[12px] font-semibold text-[#0f4c92] transition hover:bg-[#dce9f7] disabled:opacity-40'

  /**
   * What this model IS, in a phrase: bays × bays · storeys, off the live model.
   *
   * It used to head a strip above the workspace. It is now drawn in the corner
   * of the viewport, where the thing it names actually is — a title bar that
   * describes the picture, sitting above the picture, is a caption in the wrong
   * place and a row of vertical space nothing else could use.
   */
  const modelName = model
    ? `${globalThis.Math.max(1, [...new Set(model.nodes.map((n) => n.x))].length - 1)}×${globalThis.Math.max(1, [...new Set(model.nodes.map((n) => n.z))].length - 1)} Bay · ${[...new Set(model.storeys.map((q) => q.elevation))].length} Storey${[...new Set(model.storeys.map((q) => q.elevation))].length === 1 ? '' : 's'}`
    : '3D Model Space'

  return (
    <div className="mx-auto max-w-[1700px]">
      {/* Backstop message from the gated `run`. The buttons for off-plan
          features are already disabled, so reaching this means a path was
          missed — it is shown rather than swallowed so that shows up. */}
      {planBlock && (
        <div className="no-print mx-4 mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <span aria-hidden>🔒</span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] leading-6 text-amber-900">{planBlock}</p>
            <Link to="/pricing" className="text-[12px] font-semibold text-amber-900 underline">Compare plans</Link>
          </div>
          <button type="button" onClick={() => setPlanBlock(null)}
            className="text-[11px] font-semibold text-amber-900/70 hover:text-amber-900" aria-label="Dismiss">✕</button>
        </div>
      )}
      {/* ── Tab ribbon ──────────────────────────────────────────────────────
          Eleven tabs wrapped to three lines inside a 2/5-width panel and stole
          the height the controls under them needed. Across the full width they
          are one row, they stay put when the rail narrows, and the panel below
          starts with content instead of navigation.

          NOW THE TOP OF THE PAGE, square and edge to edge. It used to sit under
          a header strip carrying the model's name and four buttons; the name
          has moved into the viewport it names, so the ribbon is the workspace's
          own chrome and reads as a toolbar rather than a card floating under
          one. The two actions that were in that strip and are still global —
          undo/redo and the PDF — come with it. */}
      <div className="no-print flex items-center gap-2 border-b border-[#e3e1da] bg-white px-3 py-2"
        data-tour="tab-bar">
        {/* The tabs wrap inside their OWN box. Wrapping them in the ribbon
            itself sent `ml-auto` Guide to a second row on its own as soon as
            the tabs nearly filled the first — a lone button on an empty line,
            which reads as a mistake rather than as a layout. */}
        {/* Gap separates the LABELLED groups — their own labels already mark
            where each begins, and a rule between them dangles at the start of
            the line whenever the ribbon wraps there, which is what 1150 px
            showed. The one rule that stays is before the utilities, which have
            no label to do the separating. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3.5 gap-y-1">
          {TAB_GROUPS.map((g) => (
            <div key={g.label} role="group" aria-label={g.label}
              className="flex flex-wrap items-center gap-0.5">
              <span className="mr-0.5 text-[9.5px] font-bold uppercase tracking-[.14em] text-[#a39d8d]">{g.label}</span>
              {g.tabs.map((t) => <TabBtn key={t.id} id={t.id} label={t.label} active={tab === t.id} onClick={pickTab} />)}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-0.5">
            <Rule />
            {UTILITY_TABS.map((t) => <TabBtn key={t.id} id={t.id} label={t.label} active={tab === t.id} onClick={pickTab} />)}
          </div>
        </div>
        <div className="flex items-center">
          {([['↶', 'Undo', undo, hist.past.length], ['↷', 'Redo', redo, hist.future.length]] as const).map(([glyph, label, run, depth], i) => (
            <button key={label} type="button" onClick={run} disabled={depth === 0}
              title={`${label} (${label === 'Undo' ? '⌘Z' : '⌘⇧Z'}) — ${depth} step${depth === 1 ? '' : 's'}`}
              aria-label={label}
              className={`border border-[#d6d3c9] bg-white px-2 py-1 text-[13px] font-semibold text-[#3d4a5c] hover:border-[#0f4c92] hover:text-[#0f4c92] disabled:opacity-35 ${i === 0 ? 'rounded-l-md' : '-ml-px rounded-r-md'}`}>
              {glyph}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void exportPdf()} disabled={!design || exporting || !reportsGate.allowed}
          title={!reportsGate.allowed ? reportsGate.message
            : design ? 'Download the calculation report as a PDF' : 'Run “Design structure” in the Design tab first'}
          className="rounded-md border border-[#0f4c92] bg-white px-2.5 py-1 text-[11.5px] font-bold text-[#0f4c92] hover:bg-[#eaf1f9] disabled:opacity-40">
          {exporting ? '⏳ PDF…' : '⎙ PDF'}
        </button>
        <TourButton onClick={tour.start} label="Guide" />
      </div>

      {/* ── Main split: the viewport takes the width, the controls a fixed rail
          (mockup: minmax(0,1fr) 360px). At 3fr/2fr the panel ran to about 660 px
          and the page named after its 3D view gave that view 60% of the screen. ── */}
      {/* Both columns are as tall as the space under the ribbon and each
          scrolls its OWN content. The page was one column: header, ribbon,
          canvas, panel and the entire report stack, so reading a schedule
          scrolled the 3D view off the top of the screen — on the page whose
          subject is that view. The viewport was already `sticky`, which is the
          same intent written in a way that only worked while nothing above it
          moved. The report below still scrolls the page normally; it is a
          document, and it should. */}
      <div className="grid grid-cols-1 gap-4 p-4 lg:h-[calc(100vh-6.5rem)] lg:min-h-[520px] lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* LEFT — sticky 3D viewport */}
        <div className="no-print lg:flex lg:min-h-0 lg:flex-col">
          <div className="relative h-[80vh] min-h-[460px] overflow-hidden rounded-lg border border-[#e3e1da] bg-[#0f1b2a] lg:h-full lg:min-h-0">
            {model ? (
              <Canvas camera={{ position: [14, 11, 14], fov: 45 }} gl={{ preserveDrawingBuffer: true }} onPointerMissed={() => setSelected(null)}>
                {/* Outer net only: it stops ANY suspension in here from bubbling
                    to the route-level <Suspense> and blanking the whole page.
                    Text is NOT what it catches — <SceneText> carries its own
                    per-label boundary and a bundled font, because a boundary at
                    this level turns one unresolvable label into an empty
                    viewport (see components/SceneText.tsx). */}
                <Suspense fallback={null}>
                <color attach="background" args={['#f8fafc']} />
                <ambientLight intensity={0.85} />
                <directionalLight position={[12, 18, 8]} intensity={0.9} />
                <FitView box={modelBox} dir={[1, 0.8, 1]} />
                <gridHelper args={[40, 40, '#e2e8f0', '#eef2f7']} />
                <GridBubbles3D model={model} />
                {model.members.map((m) => {
                  const a = nodePos.get(m.i), bb = nodePos.get(m.j)
                  if (!a || !bb) return null
                  const tint = govRes && govRes.Mmax > 1e-9
                    ? (memForce.get(m.id)?.Mmax ?? 0) / govRes.Mmax : 0
                  const sec = sectionFor(m.id)
                  const manI = m.offsets?.iEnd, manJ = m.offsets?.jEnd
                  const v3 = (v: [number, number, number]) => new THREE.Vector3(v[0], v[1], v[2])
                  // PHYSICAL members, both materials: a beam ends AT the support
                  // face (steel: the tab/weld bridges the gap; concrete: the joint
                  // block belongs to the column pour), and a column whose stack
                  // ends extends UP past the joint to the top of the deepest
                  // framing beam. Intermediate columns keep meeting at the node,
                  // so the storey above fills the joint block.
                  const fo = faceOff?.get(m.id)
                  let aV: THREE.Vector3, bV: THREE.Vector3
                  if (m.role === 'column') {
                    const contAt = (nid: string) => model.members.some((o) => o.id !== m.id && o.role === 'column' && (o.i === nid || o.j === nid))
                    aV = manI ? a.clone().add(v3(manI)) : (fo?.offI && !contAt(m.i) ? a.clone().sub(v3(fo.offI)) : a)
                    bV = manJ ? bb.clone().add(v3(manJ)) : (fo?.offJ && !contAt(m.j) ? bb.clone().sub(v3(fo.offJ)) : bb)
                    // …and down to the TOP OF THE PAD, which is the founding
                    // depth less the pad's own thickness below the base node.
                    // Drawn from the node, the column floated above a footing
                    // it never reached.
                    //
                    // CLONE FIRST. Where the column has no offset of its own,
                    // `aV`/`bV` still ARE the `nodePos` vector — and `nodePos`
                    // is memoised on the model, so it outlives the render.
                    // Subtracting in place therefore sank the base a whole
                    // pedestal on EVERY render: the supports crept downwards
                    // each time the tab was switched, and the support symbol,
                    // which reads the same map and subtracts the pedestal
                    // again, followed them down twice as fast.
                    const drops = endDrops(a.y, bb.y, pedestalAt.get(m.i) ?? 0, pedestalAt.get(m.j) ?? 0)
                    if (drops.i > 0) aV = aV.clone().setY(aV.y - drops.i)
                    if (drops.j > 0) bV = bV.clone().setY(bV.y - drops.j)
                  } else {
                    aV = manI ? a.clone().add(v3(manI)) : (fo?.offI ? a.clone().add(v3(fo.offI)) : a)
                    bV = manJ ? bb.clone().add(v3(manJ)) : (fo?.offJ ? bb.clone().add(v3(fo.offJ)) : bb)
                  }
                  // The skeleton runs NODE TO NODE — `a`/`bb`, not the face
                  // offsets and pedestal drops that put the concrete where the
                  // concrete is. Those describe the solid; the line is the
                  // other description of the same member, the one the
                  // stiffness matrix is assembled from.
                  const memberEl = skeleton
                    ? <MemberStick3D a={a} b={bb} role={m.role} tint={tint * 0.85} material={sec?.material}
                        selected={m.id === selected} onPick={() => setSelected(m.id)} />
                    : sec?.material === 'steel' && sec.shape
                      ? <MemberSteel3D a={aV} b={bV} role={m.role} shapeName={sec.shape} axisRotation={m.axisRotation}
                          tint={tint * 0.85} style={surface} selected={m.id === selected} onPick={() => setSelected(m.id)} />
                      : <Member3D a={aV} b={bV} role={m.role} tint={tint * 0.85}
                          sec={sec} style={surface} selected={m.id === selected} onPick={() => setSelected(m.id)} />
                  return (
                    <group key={m.id}>
                      {memberEl}
                      {/* A rigid arm bridges the node to the SOLID's offset
                          end. The skeleton has no gap for it to bridge — the
                          line already starts at the node — so drawn there it
                          is a stub lying inside its own member. */}
                      {!skeleton && manI && <RigidArm3D a={a} b={aV} />}
                      {!skeleton && manJ && <RigidArm3D a={bb} b={bV} />}
                      {inactiveIds.has(m.id) && (skeleton
                        ? <SlackMember3D a={a} b={bb} />
                        : <SlackMember3D a={aV} b={bV} />)}
                    </group>
                  )
                })}
                {model.plates.map((p) => {
                  const cs = p.corners.map((c) => nodePos.get(c))
                  if (cs.some((c) => !c)) return null
                  return <Slab3D key={p.id} corners={cs as THREE.Vector3[]} shell={model.shellElements} deck={p.deck}
                    thickness={p.thickness / 1000} style={surface}
                    selected={p.id === selected} onPick={() => setSelected(p.id)} />
                })}
                {model.supports.map((s) => {
                  const p = nodePos.get(s.node)
                  if (!p) return null
                  // The boundary condition is the column–footing interface, not
                  // the ground line — which is where the design supports it, so
                  // it is where the symbol belongs. Drawn at the node it sat a
                  // whole pedestal above the thing actually holding the column.
                  const ped = pedestalAt.get(s.node) ?? 0
                  return <Support3D key={s.node} p={ped ? new THREE.Vector3(p.x, p.y - ped, p.z) : p} />
                })}
                {showConns && design && (design.joints.length > 0 || design.beamJoints.length > 0) && (
                  <JointConnections3D joints={design.joints} beamJoints={design.beamJoints} model={model} nodePos={nodePos} />
                )}
                {showFootings && design && (() => {
                  const xz = new Map([...nodePos].map(([id, p]) => [id, { x: p.x, z: p.z }]))
                  const { items, overlaps } = footingLayout(
                    design.footings.map((f) => ({
                      node: f.node, B: f.design.B, Dc: f.design.Dc, pedestal: f.pedestal,
                    })),
                    design.combined.map((cf) => ({
                      nodes: cf.nodes, Bx: cf.design.Bx,
                      By1: cf.design.By1, By2: cf.design.By2, x1: cf.design.x1,
                      Dc: cf.design.Dc,
                    })),
                    xz,
                  )
                  return <group>{items.map((f) => (
                    <Footing3D key={f.key} cx={f.cx} cz={f.cz} bx={f.bx} bz={f.bz} bz1={f.bz1} bz2={f.bz2}
                      dc={f.dc} yTop={f.yTop} angle={f.angle} overlap={overlaps.has(f.key)} label={f.label}
                      style={surface} />
                  ))}</group>
                })()}
                {(model.walls ?? []).map((w) => {
                  const m = model.members.find((mm) => mm.id === w.member)
                  const tA = m && nodePos.get(m.i), tB = m && nodePos.get(m.j)
                  if (!tA || !tB) return null
                  const below = (p: THREE.Vector3) => {
                    let best: THREE.Vector3 | null = null
                    for (const n of model.nodes) {
                      const q = nodePos.get(n.id)!
                      if (Math.abs(q.x - p.x) < 1e-4 && Math.abs(q.z - p.z) < 1e-4 && q.y < p.y - 1e-4 && (!best || q.y > best.y)) best = q
                    }
                    return best
                  }
                  const bA = below(tA), bB = below(tB)
                  if (!bA || !bB) return null
                  return <Wall3D key={w.id} tA={tA} tB={tB} bA={bA} bB={bB} shear={w.shearWall} />
                })}
                {(model.stairs ?? []).map((st) => {
                  const p = placeStair(model, st)
                  return p ? <Stair3D key={st.id} p={p} style={surface} /> : null
                })}
                {/* The joints. Without them two collinear beams read as one
                    line, and the count of elements is not visible at all. */}
                {skeleton && <Nodes3D nodePos={nodePos} />}
                {showLoads && <Loads3D model={model} nodePos={nodePos} />}
                {showRebar && rebarCages.length > 0 && <RebarWireframe cages={rebarCages} kinds={cageKinds} />}
                {forceDiag && forceDiagInfo && forceDiagInfo.scale > 0 && model.members.map((m) => {
                  const mr = forceDiagInfo.byId.get(m.id)
                  const a = nodePos.get(m.i), bb = nodePos.get(m.j)
                  if (!mr || !a || !bb) return null
                  return <MemberForceDiagram3D key={`fd-${m.id}`}
                    a={[a.x, a.y, a.z]} b={[bb.x, bb.y, bb.z]}
                    xs={mr.xs} ys={mr[forceDiag]} comp={forceDiag} scale={forceDiagInfo.scale} />
                })}
                {modal && modeShapeIdx !== null && modal.modes[modeShapeIdx] && (
                  <ModeShapePlayer
                    shape={modal.modes[modeShapeIdx].shape}
                    nodePos={nodePos}
                    members={model.members}
                    amp={modeAmp}
                  />
                )}
                <OrbitControls ref={controlsRef} makeDefault enablePan target={[6, 3, 2.5]}
                  onStart={() => setNavHintDone(true)} />
                </Suspense>
              </Canvas>
            ) : (
              <div className="flex h-full items-center justify-center font-mono text-sm text-[#7d8ea3]">
                Set the grid and hit “Regenerate grid model”.
              </div>
            )}
            {/* The model's own name, in the corner of the model. */}
            <div className="no-print pointer-events-none absolute left-3 top-3 flex items-center gap-2">
              <h1 className="rounded-md bg-white/85 px-2.5 py-1 text-[15px] font-extrabold tracking-tight text-[#0f1b2a] shadow-sm backdrop-blur">
                {modelName}
              </h1>
              {model && (
                <span className="rounded border border-[#cddcf0] bg-[#eaf1f9]/90 px-1.5 py-px font-mono text-[10px] font-medium text-[#0f4c92] backdrop-blur">
                  autosaved
                </span>
              )}
            </div>
            {model && selInfo && (
              <div className="no-print absolute left-3 top-12 flex items-center gap-2 rounded-md border border-[#0f4c92]/30 bg-white/95 px-2.5 py-1 text-xs shadow-sm backdrop-blur">
                <span className="font-semibold text-[#0f4c92]">▣ {selInfo.kind} {selInfo.id}</span>
                {selInfo.extra && <span className="text-slate-500">{selInfo.extra}</span>}
                <button type="button" onClick={() => setSelected(null)} className="ml-0.5 text-slate-500 hover:text-red-500" title="Deselect">✕</button>
              </div>
            )}
            {model && (
              <div aria-hidden={navHintDone}
                className={`no-print pointer-events-none absolute bottom-3 left-3 rounded border border-white/15 bg-[#0f1b2a]/80 px-2 py-1 font-mono text-[10px] text-[#9db0c5] transition-opacity duration-700 ${navHintDone ? 'opacity-0' : 'opacity-100'}`}>
                orbit: drag · pan: ⇧drag · zoom: scroll
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — the active tab's controls: one flat panel, hairline-separated
            sections (mockup). The tab bar is NOT here: it is the ribbon under
            the header, so switching tabs does not depend on how wide this rail
            happens to be. */}
        <div className="no-print overflow-hidden rounded-lg border border-[#e3e1da] bg-white lg:flex lg:min-h-0 lg:flex-col lg:overflow-y-auto">
          {/* ── SELECTION — what is picked, wherever you are ────────────────
              This detail already existed, at the BOTTOM of the Analysis tab.
              So clicking a member in the 3D view gave you a chip on the canvas
              and nothing else, unless you happened to be on that one tab and
              scrolled past everything above it. Selection is not an analysis
              concern — it is a mode, and the panel should say what is in it.
              MOVED here rather than copied, so there is still only one of it. */}
          {(selMember || selPlate) && (
            <div className="divide-y divide-[#eeece5] border-b border-[#eeece5] bg-[#fbfaf7] px-4 py-1">
            {selMember && model && (
              <Sec id="sel-member" grid={false} title={`Member — ${selMember.id}`}>
                <Row label="Role" value={selMember.role} />
                <Row label="Length" value={`${f2(memberLen)} m`} />
                <Row label="Section" value={sectionFor(selMember.id)?.name ?? selMember.section} />
                {(() => {
                  const d = memberDesign(selMember.id)
                  if (!d) return null
                  return <Row alert={!d.ok} label="Design"
                    value={`${d.ok ? 'OK' : 'CHECK'}${d.util !== undefined ? ` · ${f2(d.util)}` : ''}`}
                    sub={d.util !== undefined ? `${d.kind} — utilisation` : d.kind} />
                })()}
                {selMember.axialMode && selMember.axialMode !== 'both' && (
                  <Row alert={inactiveIds.has(selMember.id)} label="Axial mode" value={selMember.axialMode}
                    sub={!axialSets ? 'run Analyze to resolve the active set'
                      : inactiveIds.has(selMember.id) ? 'switched OFF in the governing combination'
                      : 'active in the governing combination'} />
                )}
                {(() => {
                  const mr = govRes?.members.find((m) => m.id === selMember.id)
                  if (!mr) return null
                  return (
                    <div className="mt-2 space-y-2">
                      <Row label="Forces (governing)" value={`M ${f1(mr.Mmax)} kN·m`}
                        sub={`V ${f1(mr.Vmax)} · N ${f1(mr.Nmax)} · T ${f1(mr.Tmax)} kN`} />
                      <button type="button" onClick={() => setSelDiagrams((v) => !v)}
                        className="text-[11px] font-semibold text-[#0f4c92] hover:underline">
                        {selDiagrams ? '▾ Hide force diagrams' : '▸ Show force diagrams'}
                      </button>
                      {selDiagrams && <>
                      <Diagram xs={mr.xs} ys={mr.Mz} title="Mz — strong-axis moment" unit="kN·m" color="#d62728" decimals={1} />
                      <Diagram xs={mr.xs} ys={mr.My} title="My — weak-axis moment" unit="kN·m" color="#ea580c" decimals={1} />
                      <Diagram xs={mr.xs} ys={mr.Vy} title="Vy — shear (x′-y′)" unit="kN" color="#1f77b4" decimals={1} />
                      <Diagram xs={mr.xs} ys={mr.Vz} title="Vz — shear (x′-z′)" unit="kN" color="#0e7490" decimals={1} />
                      <Diagram xs={mr.xs} ys={mr.N} title="N — axial (+tension)" unit="kN" color="#7c3aed" decimals={1} />
                      <Diagram xs={mr.xs} ys={mr.T} title="T — torsion" unit="kN·m" color="#b45309" decimals={1} />
                      </>}
                    </div>
                  )
                })()}
                {selMember.role === 'column' && columnKs.get(selMember.id) && (() => {
                  const k = columnKs.get(selMember.id)!
                  return (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <p className="mb-1 text-[11px] font-semibold text-[#0f4c92]">Effective length K — AISC alignment chart (C-C2)</p>
                      <Row label="K — X-sway" value={`sway ${f2(k.Kx.sway)} · braced ${f2(k.Kx.braced)}`}
                        sub={`G: ${f2(k.Gi.x)} (i) · ${f2(k.Gj.x)} (j)`} />
                      <Row label="K — Z-sway" value={`sway ${f2(k.Kz.sway)} · braced ${f2(k.Kz.braced)}`}
                        sub={`G: ${f2(k.Gi.z)} (i) · ${f2(k.Gj.z)} (j)`} />
                      <p className="mt-1 text-[10px] text-slate-500">
                        G = Σ(EI/L)<sub>col</sub> / Σ(EI/L)<sub>beam</sub> at each joint; fixed base G = 1.0, pinned/no-beam G = 10.
                      </p>
                    </div>
                  )
                })()}
                {armDelete === selMember.id ? (
                  <div className="mt-2 flex items-center gap-2">
                    <button type="button" onClick={() => { save(removeElements(model, new Set([selMember.id]))); setSelected(null) }}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700">Delete member — confirm</button>
                    <button type="button" onClick={() => setArmDelete(null)}
                      className="text-sm font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setArmDelete(selMember.id)}
                    className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50">Delete member</button>
                )}
              </Sec>
            )}

            {selPlate && plateInfo && model && (
              <Sec id="sel-slab" grid={false} title={`Slab — ${selPlate.id}`}>
                <Row label="Panel" value={`${f2(plateInfo.lx)} × ${f2(plateInfo.lz)} m`}
                  sub={`t = ${selPlate.thickness} mm`} />
                {plateInfo.areaLoads.map((l, i) => (
                  <Row key={i} label={`q (${l.cat})`} value={`${f2(l.q)} kPa`} />
                ))}
                {plateInfo.trib && (
                  <Row label="Tributary" value={plateInfo.trib.behaviour}
                    sub={`peak ${f1(plateInfo.trib.edges[0].peak)} kN/m on long edges`} />
                )}
                {armDelete === selPlate.id ? (
                  <div className="mt-2 flex items-center gap-2">
                    <button type="button" onClick={() => { save(removeElements(model, new Set([selPlate.id]))); setSelected(null) }}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700">Delete slab — confirm</button>
                    <button type="button" onClick={() => setArmDelete(null)}
                      className="text-sm font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setArmDelete(selPlate.id)}
                    className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50">Delete slab</button>
                )}
              </Sec>
            )}
            </div>
          )}


          {/* ── GEOMETRY ── */}
          {tab === 'geometry' && (
            <div className="divide-y divide-[#eeece5] px-4 py-1">
              <Sec title="Column grid">
                <label className="flex flex-col text-sm">
                  <span className="mb-1 font-medium text-slate-600">Bays X (m, comma-sep)</span>
                  <input value={baysX} onChange={(e) => setBaysX(e.target.value)}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5" />
                </label>
                <label className="flex flex-col text-sm">
                  <span className="mb-1 font-medium text-slate-600">Bays Z (m)</span>
                  <input value={baysZ} onChange={(e) => setBaysZ(e.target.value)}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5" />
                </label>
                <label className="flex flex-col text-sm">
                  <span className="mb-1 font-medium text-slate-600">Storey heights (m)</span>
                  <input value={storeyH} onChange={(e) => setStoreyH(e.target.value)}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5" />
                </label>
                <div className="col-span-full" data-tour="generate-grid">
                  <button type="button" onClick={() => generate()} className={`w-full ${btn}`}>Regenerate grid model</button>
                </div>
              </Sec>

              {model && (
                <Sec grid={false} title="Model">
                  <Row label="Nodes / members" value={`${model.nodes.length} / ${model.members.length}`}
                    sub={`${model.members.filter((m) => m.role === 'column').length} col · ${model.members.filter((m) => m.role !== 'column').length} bm`} />
                  <Row label="Slabs / loads" value={`${model.plates.length} / ${model.loads.length}`} />
                  <Row label="Storeys" value={`${model.storeys.length}`}
                    sub={model.storeys.map((s) => `${s.elevation} m`).join(' · ')} />
                </Sec>
              )}

              {model && (
                <Sec grid={false} title="Nodes" hint={<>
                    <button type="button" onClick={addNode}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-[#0f4c92] hover:border-[#0f4c92] hover:bg-blue-50">+ Add node</button>
                </>}>
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="text-left uppercase tracking-wide text-slate-500">
                          <th className="py-1 pr-2 font-semibold">Id</th>
                          <th className="py-1 pr-1 font-semibold">x</th>
                          <th className="py-1 pr-1 font-semibold">y</th>
                          <th className="py-1 pr-1 font-semibold">z</th>
                          <th className="py-1 pr-1 font-semibold" title="Fixed base support">Sup</th>
                          <th className="py-1" />
                        </tr>
                      </thead>
                      <tbody>
                        {model.nodes.map((n) => (
                          <tr key={n.id} className="border-t border-slate-100">
                            <td className="py-0.5 pr-2 font-medium">{n.id}</td>
                            {(['x', 'y', 'z'] as const).map((k) => (
                              <td key={k} className="py-0.5 pr-1">
                                <input type="number" step="0.5" value={n[k]}
                                  onChange={(e) => updNode(n.id, k, parseFloat(e.target.value))}
                                  className="w-14 rounded border border-slate-200 px-1 py-0.5" />
                              </td>
                            ))}
                            <td className="py-0.5 pr-1 text-center">
                              <input type="checkbox" checked={model.supports.some((s) => s.node === n.id)}
                                onChange={() => toggleSupport(n.id)} />
                            </td>
                            <td className="py-0.5 text-right">
                              <button type="button" onClick={() => { save(removeNode(model, n.id)); if (selected) setSelected(null) }}
                                className="rounded px-1.5 text-red-500 hover:bg-red-50" title="Remove node + attached members/plates/loads">✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">Coordinates in m (y = up). Removing a node also removes everything attached to it.</p>
                </Sec>
              )}

              {model && (
                <Sec grid={false} title="Beams & columns">
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="text-left uppercase tracking-wide text-slate-500">
                          <th className="py-1 pr-2 font-semibold">Id</th>
                          <th className="py-1 pr-1 font-semibold">Role</th>
                          <th className="py-1 pr-1 font-semibold">b</th>
                          <th className="py-1 pr-1 font-semibold">h</th>
                          <th className="py-1 pr-1 font-semibold">i</th>
                          <th className="py-1 pr-1 font-semibold">j</th>
                          <th className="py-1 pr-1 font-semibold" title="clear span (centreline length minus rigid end zones)">Lc</th>
                          <th className="py-1" />
                        </tr>
                      </thead>
                      <tbody>
                        {model.members.map((m) => {
                          const ms = sectionFor(m.id)
                          const pa = nodePos.get(m.i), pb = nodePos.get(m.j)
                          const Lfull = pa && pb ? pa.distanceTo(pb) : 0
                          const eI = m.offsets?.iEnd ?? autoOff?.get(m.id)?.offI
                          const eJ = m.offsets?.jEnd ?? autoOff?.get(m.id)?.offJ
                          const Lc = Math.max(Lfull - (eI ? Math.hypot(...eI) : 0) - (eJ ? Math.hypot(...eJ) : 0), 0)
                          const trimmed = Lc < Lfull - 1e-6
                          return (
                            <tr key={m.id} className={`border-t border-slate-100 ${m.id === selected ? 'bg-amber-50' : ''}`}>
                              <td className="py-0.5 pr-2 font-medium cursor-pointer" onClick={() => setSelected(m.id)}>{m.id}</td>
                              <td className="py-0.5 pr-1">
                                <select value={m.role} onChange={(e) => updMember(m.id, { role: e.target.value as MemberRole })}
                                  className="rounded border border-slate-200 px-1 py-0.5">
                                  <option value="beam">beam</option><option value="girder">girder</option>
                                  <option value="column">column</option><option value="brace">brace</option>
                                </select>
                              </td>
                              {(['b', 'h'] as const).map((k) => (
                                <td key={k} className="py-0.5 pr-1">
                                  <input type="number" step="50" value={ms?.[k] ?? 0}
                                    onChange={(e) => updMemberSize(m.id, k, parseFloat(e.target.value))}
                                    className="w-12 rounded border border-slate-200 px-1 py-0.5" />
                                </td>
                              ))}
                              {(['i', 'j'] as const).map((end) => (
                                <td key={end} className="py-0.5 pr-1">
                                  <select value={m[end]} onChange={(e) => updMember(m.id, { [end]: e.target.value })}
                                    className="max-w-[5rem] rounded border border-slate-200 px-1 py-0.5">
                                    {model.nodes.map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
                                  </select>
                                </td>
                              ))}
                              <td className={`py-0.5 pr-1 tabular-nums ${trimmed ? 'font-semibold text-violet-700' : 'text-slate-500'}`}
                                title={trimmed ? `full ${Lfull.toFixed(2)} m` : 'no rigid end zone'}>
                                {Lc.toFixed(2)}
                              </td>
                              <td className="py-0.5 text-right">
                                <button type="button" onClick={() => { save(removeElements(model, new Set([m.id]))); if (selected === m.id) setSelected(null) }}
                                  className="rounded px-1.5 text-red-500 hover:bg-red-50">✕</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2 text-xs">
                    <select value={newRole} onChange={(e) => setNewRole(e.target.value as MemberRole)}
                      className="rounded border border-slate-200 px-1 py-0.5">
                      <option value="beam">beam</option><option value="girder">girder</option>
                      <option value="column">column</option><option value="brace">brace</option>
                    </select>
                    <select value={newI} onChange={(e) => setNewI(e.target.value)} className="max-w-[5.5rem] rounded border border-slate-200 px-1 py-0.5">
                      <option value="">node i…</option>
                      {model.nodes.map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
                    </select>
                    <span className="text-slate-500">→</span>
                    <select value={newJ} onChange={(e) => setNewJ(e.target.value)} className="max-w-[5.5rem] rounded border border-slate-200 px-1 py-0.5">
                      <option value="">node j…</option>
                      {model.nodes.map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
                    </select>
                    {(() => {
                      const dup = !!newI && !!newJ && model.members.some((m) => (m.i === newI && m.j === newJ) || (m.i === newJ && m.j === newI))
                      return (
                        <button type="button" onClick={addMember} disabled={!newI || !newJ || newI === newJ || dup}
                          title={dup ? 'A member already connects these two nodes' : undefined}
                          className="rounded-md border border-slate-300 px-2 py-1 font-semibold text-[#0f4c92] hover:border-[#0f4c92] hover:bg-blue-50 disabled:opacity-40">
                          {dup ? 'Member exists' : '+ Add member'}
                        </button>
                      )
                    })()}
                  </div>
                  {/* End releases panel — shown when a member is selected */}
                  {(() => {
                    const sel = model.members.find((m) => m.id === selected)
                    if (!sel) return null
                    const rel: MemberReleases = sel.releases ?? {}
                    const dofs = ['Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz'] as const
                    const updRel = (end: 'iEnd' | 'jEnd', dof: typeof dofs[number], v: boolean) => {
                      const cur = rel[end] ?? {}
                      updMember(sel.id, { releases: { ...rel, [end]: { ...cur, [dof]: v } } })
                    }
                    return (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs">
                        <p className="mb-1.5 font-semibold text-amber-800">End releases — {sel.id}</p>
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                              <th className="pr-2">End</th>
                              {dofs.map((d) => <th key={d} className="pr-1 text-center">{d}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {(['iEnd', 'jEnd'] as const).map((end) => (
                              <tr key={end}>
                                <td className="pr-2 font-medium text-slate-700">{end === 'iEnd' ? 'i' : 'j'}</td>
                                {dofs.map((dof) => (
                                  <td key={dof} className="pr-1 text-center">
                                    <input type="checkbox"
                                      checked={(rel[end] as Record<string, boolean> | undefined)?.[dof] ?? false}
                                      onChange={(e) => updRel(end, dof, e.target.checked)} />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="mt-1 text-[10px] text-slate-500">Check to release (zero force/moment). Mz = in-plane bending; My = out-of-plane. Click a member row to select.</p>
                      </div>
                    )
                  })()}
                  {/* Rigid end offsets — shown when a member is selected */}
                  {(() => {
                    const sel = model.members.find((m) => m.id === selected)
                    if (!sel) return null
                    const off = sel.offsets ?? {}
                    const axes = ['x', 'y', 'z'] as const
                    const updOff = (end: 'iEnd' | 'jEnd', ax: 0 | 1 | 2, v: number) => {
                      const cur: [number, number, number] = [...(off[end] ?? [0, 0, 0])] as [number, number, number]
                      cur[ax] = Number.isFinite(v) ? v : 0
                      const next = { ...off, [end]: cur }
                      // drop a zero vector so it doesn't linger in the model
                      if (next.iEnd && next.iEnd.every((c) => c === 0)) delete next.iEnd
                      if (next.jEnd && next.jEnd.every((c) => c === 0)) delete next.jEnd
                      updMember(sel.id, { offsets: Object.keys(next).length ? next : undefined })
                    }
                    return (
                      <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50 p-2 text-xs">
                        <p className="mb-1.5 font-semibold text-violet-800">Rigid end offsets (m) — {sel.id}</p>
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                              <th className="pr-2">End</th>
                              {axes.map((a) => <th key={a} className="pr-1 text-center">{a}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {(['iEnd', 'jEnd'] as const).map((end) => (
                              <tr key={end}>
                                <td className="pr-2 font-medium text-slate-700">{end === 'iEnd' ? 'i' : 'j'}</td>
                                {axes.map((_, ax) => (
                                  <td key={ax} className="pr-1">
                                    <input type="number" step="0.05" value={(off[end] ?? [0, 0, 0])[ax]}
                                      onChange={(e) => updOff(end, ax as 0 | 1 | 2, parseFloat(e.target.value))}
                                      className="w-14 rounded border border-violet-200 px-1 py-0.5 text-right" />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="mt-1 text-[10px] text-slate-500">Vector node→member-end (global m). The flexible member spans end→end; node↔end is a rigid arm (purple).</p>
                        <label className="mt-2 flex items-center gap-2 border-t border-violet-200 pt-2 text-[11px] text-slate-700">
                          <span>Auto rigid-zone factor override</span>
                          <input type="number" min={0} max={1} step={0.1}
                            value={sel.rigidZoneFactor ?? ''} placeholder="model"
                            onChange={(e) => {
                              const v = parseFloat(e.target.value)
                              updMember(sel.id, { rigidZoneFactor: Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : undefined })
                            }}
                            className="w-16 rounded border border-violet-200 px-1 py-0.5 text-right" />
                          <span className="text-[10px] text-slate-500">blank = model factor · 0 = no zone for this member (needs Auto rigid end zones on)</span>
                        </label>
                        <label className="mt-2 flex items-center gap-2 border-t border-violet-200 pt-2 text-[11px] text-slate-700">
                          <span>Local axis rotation θ (°)</span>
                          <input type="number" step={15}
                            value={sel.axisRotation ?? ''} placeholder="auto"
                            onChange={(e) => {
                              const v = parseFloat(e.target.value)
                              updMember(sel.id, { axisRotation: Number.isFinite(v) ? v : undefined })
                            }}
                            className="w-16 rounded border border-violet-200 px-1 py-0.5 text-right" />
                          <span className="text-[10px] text-slate-500">Local-axis angle about the member axis. Blank = default (vertical members 90° — depth d on global X); orients section stiffness, rigid zones and the drawn shape.</span>
                        </label>
                        {(sel.role === 'beam' || sel.role === 'girder') && (
                          <label className="mt-2 flex items-center gap-2 border-t border-violet-200 pt-2 text-[11px] text-slate-700">
                            <span>Lb unbraced length (m)</span>
                            <input type="number" min={0} step={0.1}
                              value={sel.Lb ?? ''} placeholder="full span"
                              onChange={(e) => {
                                const v = parseFloat(e.target.value)
                                updMember(sel.id, { Lb: Number.isFinite(v) && v > 0 ? v : undefined })
                              }}
                              className="w-16 rounded border border-violet-200 px-1 py-0.5 text-right" />
                            <span className="text-[10px] text-slate-500">§F2 LTB brace spacing — blank = full member length (conservative)</span>
                          </label>
                        )}
                        <label className="mt-2 flex flex-wrap items-center gap-2 border-t border-violet-200 pt-2 text-[11px] text-slate-700">
                          <span>Axial mode</span>
                          <select value={sel.axialMode ?? 'both'}
                            onChange={(e) => {
                              const v = e.target.value as AxialMode
                              updMember(sel.id, { axialMode: v === 'both' ? undefined : v })
                            }}
                            className="rounded border border-violet-200 px-1 py-0.5">
                            <option value="both">Both (ordinary member)</option>
                            <option value="tension-only">Tension-only (cross-brace, tie)</option>
                            <option value="compression-only">Compression-only (strut, bearing)</option>
                          </select>
                          <span className="block text-[10px] text-slate-500">
                            Limited members are solved by an active-set iteration: one that violates its
                            mode is switched off and the model re-solved. This breaks superposition, so
                            every NSCP combination gets its OWN active set (the shared-factorization fast
                            path is dropped — analysis takes longer). Members off in the governing combo
                            are dashed red in the viewport.
                          </span>
                        </label>
                        <div className="mt-2 border-t border-violet-200 pt-2">
                          <p className="mb-1 text-[11px] font-semibold text-violet-800">End connections — {sel.id}</p>
                          <div className="flex flex-wrap gap-3">
                            {(['iEnd', 'jEnd'] as const).map((end) => (
                              <label key={end} className="flex items-center gap-1.5 text-[11px] text-slate-700">
                                <span>{end === 'iEnd' ? 'i' : 'j'}-end</span>
                                <select value={sel.connections?.[end] ?? 'fixed'}
                                  onChange={(e) => {
                                    const k = e.target.value as 'simple' | 'moment' | 'fixed'
                                    const next = { ...(sel.connections ?? {}), [end]: k }
                                    updMember(sel.id, { connections: next })
                                  }}
                                  className="rounded border border-violet-200 px-1 py-0.5">
                                  <option value="fixed">Continuous</option>
                                  <option value="simple">Simple (pin)</option>
                                  <option value="moment">Moment (rigid)</option>
                                </select>
                              </label>
                            ))}
                          </div>
                          <span className="mt-1 block text-[10px] text-slate-500">Simple = shear-only pin (releases My, Mz — the connection hinge); Moment = rigid; drives both analysis and steel connection design.</span>
                        </div>
                      </div>
                    )
                  })()}
                </Sec>
              )}

              {/* ── Plates (slabs) ── */}
              {model && (
                <Sec grid={false} title="Slabs / plates">
                  {model.plates.filter((p) => p.role !== 'wall').length === 0 ? (
                    <p className="text-xs text-slate-500">No slabs — generate a grid or add members forming closed panels.</p>
                  ) : (
                    <div className="max-h-60 overflow-auto">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="text-left uppercase tracking-wide text-slate-500">
                            <th className="py-1 pr-2 font-semibold">Slab</th>
                            <th className="py-1 pr-2 font-semibold">Corners</th>
                            <th className="py-1 pr-1 font-semibold">t (mm)</th>
                            <th className="py-1" />
                          </tr>
                        </thead>
                        <tbody>
                          {model.plates.filter((p) => p.role !== 'wall').map((p) => (
                            <tr key={p.id} className={`border-t border-slate-100 ${p.id === selected ? 'bg-amber-50' : ''}`}>
                              <td className="py-0.5 pr-2 font-medium cursor-pointer" onClick={() => setSelected(p.id)}>{p.id}</td>
                              <td className="py-0.5 pr-2 text-slate-500">{p.corners.join(', ')}</td>
                              <td className="py-0.5 pr-1">
                                <input type="number" step="10" value={p.thickness}
                                  onChange={(e) => updPlateThickness(p.id, parseFloat(e.target.value))}
                                  className="w-16 rounded border border-slate-200 px-1 py-0.5" />
                              </td>
                              <td className="py-0.5 text-right">
                                <button type="button" onClick={() => { save(removeElements(model, new Set([p.id]))); if (selected === p.id) setSelected(null) }}
                                  className="rounded px-1.5 text-red-500 hover:bg-red-50">✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="mt-1 text-[11px] text-slate-500">Thickness drives slab self-weight (t·γc) → tributary line loads on the edge beams.</p>
                </Sec>
              )}

              {/* ── Walls ── */}
              {model && (<>
                <Sec grid={false} title="Walls (on beams)">
                  {(model.walls ?? []).length > 0 && (
                    <div className="mb-2 max-h-48 overflow-auto">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="text-left uppercase tracking-wide text-slate-500">
                            <th className="py-1 pr-2 font-semibold">On</th>
                            <th className="py-1 pr-1 font-semibold">h (m)</th>
                            <th className="py-1 pr-1 font-semibold">t (mm)</th>
                            <th className="py-1 pr-1 font-semibold">w (kN/m)</th>
                            <th className="py-1 pr-1 font-semibold">Type</th>
                            <th className="py-1" />
                          </tr>
                        </thead>
                        <tbody>
                          {(model.walls ?? []).map((w) => (
                            <tr key={w.id} className="border-t border-slate-100">
                              <td className="py-0.5 pr-2 font-medium">{w.member}</td>
                              <td className="py-0.5 pr-1">{f1(w.height)}</td>
                              <td className="py-0.5 pr-1">{w.thickness}</td>
                              <td className="py-0.5 pr-1">{f1((w.thickness / 1000) * w.height * 24)}</td>
                              <td className="py-0.5 pr-1">{w.shearWall ? <span className="font-semibold text-purple-700">shear</span> : 'gravity'}</td>
                              <td className="py-0.5 text-right">
                                <button type="button" onClick={() => removeWall(w.id)} className="rounded px-1.5 text-red-500 hover:bg-red-50">✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2 text-xs">
                    <select value={wallMember} onChange={(e) => setWallMember(e.target.value)} className="max-w-[6rem] rounded border border-slate-200 px-1 py-0.5">
                      <option value="">on beam…</option>
                      {model.members.filter((m) => m.role === 'beam' || m.role === 'girder').map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                    </select>
                    <label className="inline-flex items-center gap-1">h <input type="number" step="0.5" value={wallH} onChange={(e) => setWallH(parseFloat(e.target.value) || 0)} className="w-12 rounded border border-slate-200 px-1 py-0.5" /></label>
                    <label className="inline-flex items-center gap-1">t <input type="number" step="10" value={wallT} onChange={(e) => setWallT(parseFloat(e.target.value) || 0)} className="w-14 rounded border border-slate-200 px-1 py-0.5" /></label>
                    <label className="inline-flex items-center gap-1"><input type="checkbox" checked={wallShear} onChange={(e) => setWallShear(e.target.checked)} /> shear wall</label>
                    {(() => {
                      const dup = !!wallMember && (model.walls ?? []).some((w) => w.member === wallMember)
                      return (
                        <button type="button" onClick={addWall} disabled={!wallMember || dup}
                          title={dup ? 'This beam already carries a wall' : undefined}
                          className="rounded-md border border-slate-300 px-2 py-1 font-semibold text-[#0f4c92] hover:border-[#0f4c92] hover:bg-blue-50 disabled:opacity-40">
                          {dup ? 'Wall exists' : '+ Add wall'}
                        </button>
                      )
                    })()}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">A wall adds its self-weight (t·h·γc) as a line load on the chosen beam. A “shear wall” also braces the storey below it — modelled as an equivalent X of diagonal struts (shear + flexure stiffness) so it carries seismic/wind in the analysis.</p>

                </Sec>

                <Sec grid={false} title="Stairs (between two beams)">
                  {(model.stairs ?? []).length > 0 && (
                    <div className="mb-2 max-h-48 overflow-auto">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="text-left uppercase tracking-wide text-slate-500">
                            <th className="py-1 pr-2 font-semibold">From → to</th>
                            <th className="py-1 pr-1 font-semibold">R / G</th>
                            <th className="py-1 pr-1 font-semibold">θ</th>
                            <th className="py-1 pr-1 font-semibold">w (m)</th>
                            <th className="py-1 pr-1 font-semibold">Landing</th>
                            <th className="py-1" />
                          </tr>
                        </thead>
                        <tbody>
                          {(model.stairs ?? []).map((st) => {
                            const p = placeStair(model, st)
                            const odd = p && !(p.usable.riserOK && p.usable.goingOK && p.usable.paceOK)
                            return (
                              <tr key={st.id} className="border-t border-slate-100">
                                <td className="py-0.5 pr-2 font-medium">{st.low} → {st.high}</td>
                                <td className={`py-0.5 pr-1 ${odd ? 'font-semibold text-amber-700' : ''}`}
                                  title={odd ? 'Outside the proportions stairs are usually built in — a comfort read, not a code check' : undefined}>
                                  {p ? `${p.R.toFixed(0)}/${p.G.toFixed(0)}` : '—'}
                                </td>
                                <td className="py-0.5 pr-1">{p ? `${p.thetaDeg.toFixed(1)}°` : '—'}</td>
                                <td className="py-0.5 pr-1">{f1(st.width)}</td>
                                <td className="py-0.5 pr-1 text-slate-500">
                                  {(st.landings ?? []).length
                                    ? (st.landings ?? []).map((l) => `${f1(l.depth)}${l.at === 'low' ? '↓' : '↑'}`).join(' ')
                                    : '—'}
                                </td>
                                <td className="py-0.5 text-right">
                                  <button type="button" onClick={() => removeStair(st.id)} className="rounded px-1.5 text-red-500 hover:bg-red-50">✕</button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2 text-xs">
                    {([['from', stLow, setStLow], ['to', stHigh, setStHigh]] as const).map(([lbl, val, set]) => (
                      <select key={lbl} value={val} onChange={(e) => set(e.target.value)} className="max-w-[6rem] rounded border border-slate-200 px-1 py-0.5">
                        <option value="">{lbl} beam…</option>
                        {model.members.filter((m) => m.role === 'beam' || m.role === 'girder').map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                      </select>
                    ))}
                    <label className="inline-flex items-center gap-1">risers <input type="number" step="1" value={stRisers} onChange={(e) => setStRisers(Math.max(2, parseInt(e.target.value) || 2))} className="w-12 rounded border border-slate-200 px-1 py-0.5" /></label>
                    <label className="inline-flex items-center gap-1">w <input type="number" step="0.1" value={stWidth} onChange={(e) => setStWidth(parseFloat(e.target.value) || 0)} className="w-12 rounded border border-slate-200 px-1 py-0.5" /></label>
                    <label className="inline-flex items-center gap-1">waist <input type="number" step="10" value={stWaist} onChange={(e) => setStWaist(parseFloat(e.target.value) || 0)} className="w-14 rounded border border-slate-200 px-1 py-0.5" /></label>
                    <label className="inline-flex items-center gap-1" title="Plan depth of a flat half-landing at the LOW end, m — 0 for none. It eats into the run, so the flight gets steeper; the beam at that end is the landing beam.">
                      land↓ <input type="number" step="0.1" min="0" value={stLandLo} onChange={(e) => setStLandLo(Math.max(0, parseFloat(e.target.value) || 0))} className="w-12 rounded border border-slate-200 px-1 py-0.5" />
                    </label>
                    <label className="inline-flex items-center gap-1" title="Plan depth of a flat half-landing at the HIGH end, m — 0 for none.">
                      land↑ <input type="number" step="0.1" min="0" value={stLandHi} onChange={(e) => setStLandHi(Math.max(0, parseFloat(e.target.value) || 0))} className="w-12 rounded border border-slate-200 px-1 py-0.5" />
                    </label>
                    <label className="inline-flex items-center gap-1">fin <input type="number" step="0.5" value={stFin} onChange={(e) => setStFin(parseFloat(e.target.value) || 0)} className="w-12 rounded border border-slate-200 px-1 py-0.5" /></label>
                    <label className="inline-flex items-center gap-1">LL <input type="number" step="0.5" value={stLive} onChange={(e) => setStLive(parseFloat(e.target.value) || 0)} className="w-12 rounded border border-slate-200 px-1 py-0.5" /></label>
                    {(() => {
                      const trial = stLow && stHigh && stLow !== stHigh
                        ? placeStair(model, { id: '_t', low: stLow, high: stHigh, width: stWidth, waist: stWaist, risers: stRisers, finishes: stFin, live: stLive, support: 'simple', landings: stLandings() })
                        : null
                      // A landing that leaves nothing to slope is unplaceable, and
                      // saying "these two beams cannot carry a flight" about it
                      // blames the frame for what the landing did.
                      const bare = stLow && stHigh && stLow !== stHigh
                        ? placeStair(model, { id: '_t', low: stLow, high: stHigh, width: stWidth, waist: stWaist, risers: stRisers, finishes: stFin, live: stLive, support: 'simple' })
                        : null
                      const why = !stLow || !stHigh ? 'Pick the two beams the flight runs between'
                        : stLow === stHigh ? 'A flight needs two different beams'
                        : !trial && bare ? `${(stLandLo + stLandHi).toFixed(2)} m of landing in a ${bare.run.toFixed(2)} m run leaves nothing to slope`
                        : !trial ? 'These two cannot carry a flight: same level, named the wrong way round, or one of them is vertical in plan'
                        : undefined
                      return (
                        <>
                          <button type="button" onClick={addStair} disabled={!trial}
                            title={why}
                            className="rounded-md border border-slate-300 px-2 py-1 font-semibold text-[#0f4c92] hover:border-[#0f4c92] hover:bg-blue-50 disabled:opacity-40">
                            + Add stair
                          </button>
                          {trial && (
                            <span className="text-[11px] text-slate-500">
                              → R {trial.R.toFixed(0)} · G {trial.G.toFixed(0)} · θ {trial.thetaDeg.toFixed(1)}° · run {trial.run.toFixed(2)} m
                              {trial.landings.length > 0 && ` (${trial.flightRun.toFixed(2)} of it sloping)`}
                            </span>
                          )}
                        </>
                      )
                    })()}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">A flight is placed by the two beams it bears on: the rise and run come from where they are, and R = rise/risers, G = run/risers, so the risers are equal by construction. A <strong>half-landing</strong> at either end is part of the same one-way slab, so it eats into the run and the flight climbs the same rise over what is left — and the beam at that end is the <strong>landing beam</strong> the stair breaks on. Between floors that is two flights meeting on a beam at mid height, with the landing given to ONE of them: modelled on both, the same slab is in the frame twice. Its weight reaches the frame as reactions on those two beams — the flight itself is NOT meshed, so it adds no stiffness. That is conservative for the frame and not for the stair, which in reality braces the storey it climbs.</p>
                </Sec>
              </>)}
            </div>
          )}

          {/* ── PROPERTIES ── */}
          {tab === 'properties' && (
            <div className="divide-y divide-[#eeece5] px-4 py-1" data-tour="properties-panel">
              <Sec title="Frame material">
                <Pick label="Members" value={material} onChange={(v) => {
                  const next = v as 'concrete' | 'steel' | 'wood'
                  setMaterial(next)
                  if (model) generate(next)          // auto-regenerate grid with new frame material
                }}
                  options={[['concrete', 'Reinforced concrete'], ['steel', 'Structural steel (AISC W)'], ['wood', 'Timber (wood frame)']]} />
                <p className="col-span-full -mt-1 text-[11px] text-slate-500">
                  {material === 'steel'
                    ? 'Members become AISC W-shapes designed to AISC 360-16 LRFD (§F flexure, §G shear, §E/§H1 columns); base plates per §J8. Slabs/footings stay reinforced concrete.'
                    : material === 'wood'
                      ? 'Members become solid-rectangular timber designed to NDS §3 / NSCP §6 (LRFD via Appendix N). Floor slabs become timber deck-on-joist floors (wood slab); footings stay reinforced concrete.'
                      : 'Members are reinforced concrete designed to NSCP 2015 / ACI 318-14.'}
                </p>
              </Sec>
              {material === 'steel' ? (
                <Sec title="Steel sections (AISC)">
                  <Pick label="Column family" value={colFam} onChange={(v) => { const f = v as SectionFamily; setColFam(f); setColShape(shapesOf(f)[0].name) }}
                    options={FAMILIES.map((f) => [f.id, f.label])} />
                  <Pick label="Column shape" value={colShape} onChange={setColShape}
                    options={shapesOf(colFam).map((sh) => [sh.name, sh.name])} />
                  <Pick label="Girder family" value={girFam} onChange={(v) => { const f = v as SectionFamily; setGirFam(f); setGirShape(shapesOf(f)[0].name) }}
                    options={FAMILIES.map((f) => [f.id, f.label])} />
                  <Pick label="Girder shape" value={girShape} onChange={setGirShape}
                    options={shapesOf(girFam).map((sh) => [sh.name, sh.name])} />
                  <Pick label="Beam family" value={beaFam} onChange={(v) => { const f = v as SectionFamily; setBeaFam(f); setBeaShape(shapesOf(f)[0].name) }}
                    options={FAMILIES.map((f) => [f.id, f.label])} />
                  <Pick label="Beam shape" value={beaShape} onChange={setBeaShape}
                    options={shapesOf(beaFam).map((sh) => [sh.name, sh.name])} />
                  <Num label="Steel Fy" unit="MPa" value={steelFy} onChange={setSteelFy} step="5" />
                  <Num label="Steel Fu" unit="MPa" value={steelFu} onChange={setSteelFu} step="5" />
                  <Num label="Slab thickness" unit="mm" value={slabThk} onChange={setSlabThk} />
                  <p className="col-span-full text-[11px] text-slate-500">
                    All AISC families (W/C/L/HSS/Pipe/WT) — analysis & 3D extrusion use the true section.
                    HSS/angles suit braces. Auto-design covers W/WT flexure + axial for any family; detailed
                    HSS/angle/channel flexure checks are not yet automated. Concrete f′c is still used for base-plate bearing.
                  </p>
                </Sec>
              ) : material === 'wood' ? (
                <Sec title="Timber (wood frame)">
                  <Pick label="Material source" value={matSource} onChange={(v) => {
                    const src = v as 'library' | 'custom'; setMatSource(src)
                    if (model) generate('wood', { sel: src === 'custom' && selectedCustom ? customAsSpecies(selectedCustom) : woodSel })
                  }} options={[['library', 'Built-in library'], ['custom', 'Custom material']]} />
                  {matSource === 'library' ? (
                    <>
                      <Pick label="Species" value={woodSpeciesId} onChange={(v) => {
                        const g = gradesOf(v)[0]?.grade ?? '2'
                        setWoodSpeciesId(v); setWoodGrade(g)
                        if (model) generate('wood', { sel: resolveWoodSpecies(v, g) })
                      }} options={speciesList().map((sp) => [sp.species, sp.label])} />
                      <Pick label="Grade" value={woodGrade} onChange={(v) => {
                        setWoodGrade(v)
                        if (model) generate('wood', { sel: resolveWoodSpecies(woodSpeciesId, v) })
                      }} options={gradesOf(woodSpeciesId).map((g) => [g.grade, g.gradeLabel])} />
                    </>
                  ) : (
                    <MaterialLibrary materials={customMaterials} selectedId={customId}
                      onSelect={(id, cm) => {
                        setCustomId(id)
                        if (model) generate('wood', { sel: cm ? customAsSpecies(cm) : woodSel })
                      }}
                      onChange={(list) => { setCustomMaterials(list); saveCustomMaterials(list) }} />
                  )}
                  <label className="col-span-full flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={woodWet}
                      onChange={(e) => { setWoodWet(e.target.checked); if (model) generate('wood', { wet: e.target.checked }) }} />
                    Wet service — MC &gt; 19% sawn / 16% glulam (applies C<sub>M</sub>)
                  </label>
                  <p className="col-span-full -mb-1 text-[11px] text-slate-500">
                    Solid rectangular b × d members. Each starts from its role size and grows independently
                    when optimised; columns are kept ≥ girders ≥ beams in width.
                  </p>
                  <Num label="Column b" unit="mm" value={colB} onChange={setColB} />
                  <Num label="Column d" unit="mm" value={colH} onChange={setColH} />
                  <Num label="Girder b" unit="mm" value={girB} onChange={setGirB} />
                  <Num label="Girder d" unit="mm" value={girH} onChange={setGirH} />
                  <Num label="Beam b" unit="mm" value={beaB} onChange={setBeaB} />
                  <Num label="Beam d" unit="mm" value={beaH} onChange={setBeaH} />
                  <Num label="Slab thickness" unit="mm" value={slabThk} onChange={setSlabThk} />
                  <p className="col-span-full text-[11px] text-slate-500">
                    Designed to NDS §3 / NSCP §6: reference values ({woodKind === 'glulam' ? 'glulam' : 'sawn'}, {activeWood.origin})
                    adjusted by C<sub>D</sub>/C<sub>M</sub>/C<sub>F</sub>/C<sub>V</sub>, beam stability C<sub>L</sub> and column
                    stability C<sub>P</sub>; factored demands checked LRFD (Appendix N, K<sub>F</sub>·φ·λ). Floor slabs become timber decks; footings stay reinforced concrete.
                  </p>
                </Sec>
              ) : (
                <Sec title="Initial member sizes (mm)">
                  <p className="col-span-full -mb-1 text-[11px] text-slate-500">
                    Each member starts from its role size and grows independently when optimised;
                    columns are kept ≥ girders ≥ beams in width (strong-column / weak-beam).
                  </p>
                  <Num label="Column b" unit="mm" value={colB} onChange={setColB} />
                  <Num label="Column h" unit="mm" value={colH} onChange={setColH} />
                  <Num label="Girder b" unit="mm" value={girB} onChange={setGirB} />
                  <Num label="Girder h" unit="mm" value={girH} onChange={setGirH} />
                  <Num label="Beam b" unit="mm" value={beaB} onChange={setBeaB} />
                  <Num label="Beam h" unit="mm" value={beaH} onChange={setBeaH} />
                  <Num label="Slab thickness" unit="mm" value={slabThk} onChange={setSlabThk} />
                </Sec>
              )}
              <Sec title="Concrete & reinforcement">
                <p className="col-span-full -mb-1 text-[11px] text-slate-500">
                  Shared material applied to every section when you generate the grid. f′c drives Ec and the
                  flexural/shear capacities; fy the steel; ⌀ and cover the bar layout and effective depth.
                  {material === 'steel' && ' (Used for slabs, footings and base-plate bearing.)'}
                  {material === 'wood' && ' (Used for the concrete slabs and footings of the timber frame.)'}
                </p>
                <Num label="Concrete f′c" unit="MPa" value={fc} onChange={setFc} step="0.5" />
                <Num label="Steel fy" unit="MPa" value={fy} onChange={setFy} step="5" />
                <Pick label="Main bar ⌀ (mm)" value={String(barDia)} onChange={(v) => setBarDia(+v)}
                  options={[['12', '⌀12'], ['16', '⌀16'], ['20', '⌀20'], ['25', '⌀25'], ['28', '⌀28'], ['32', '⌀32'], ['36', '⌀36']]} />
                <Pick label="Tie / stirrup ⌀ (mm)" value={String(tieDia)} onChange={(v) => setTieDia(+v)}
                  options={[['10', '⌀10'], ['12', '⌀12'], ['16', '⌀16']]} />
                <Num label="Clear cover" unit="mm" value={cover} onChange={setCover} step="5" />
                <Num label="Concrete unit wt γc" unit="kN/m³" value={gammaC} onChange={setGammaC} step="0.5" />
              </Sec>
              <Sec title="Beam design method" hint="flanged / rectangular">
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={tBeamOn} onChange={(e) => setTBeamOn(e.target.checked)} />
                  <span>Design beams as T-beams — §6.3.2 flange from the adjoining slabs for sagging sections (when a ≤ hf). Off = plain rectangular web.</span>
                </label>
                <p className="col-span-full text-[11px] text-slate-500">
                  Sagging sections that get flange action are tagged “T bf=…” in the schedule and drawn as a T-section.
                </p>
              </Sec>
              <Sec title="Prestressing — beams & girders" hint="§24.5 · PCI losses">
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={psOn} onChange={(e) => setPsOn(e.target.checked)} />
                  <span>Check beam/girder members as pretensioned bonded (beside the RC design)</span>
                </label>
                {psOn && (<>
                  <Num label="Aps" unit="mm²" value={psAps} onChange={setPsAps} />
                  <Num label="fpu" unit="MPa" value={psFpu} onChange={setPsFpu} />
                  <Num label="Eccentricity e" unit="mm" value={psE} onChange={setPsE} />
                  <Num label="f'ci (transfer)" unit="MPa" value={psFci} onChange={setPsFci} />
                </>)}
                <div className="col-span-full">
                  <button type="button" disabled={!model}
                    onClick={() => model && save({
                      ...model,
                      sections: model.sections.map((sc) => {
                        const isBeamSec = model.members.some((mm) => mm.section === sc.id && mm.role !== 'column')
                        if (!isBeamSec || sc.material === 'steel') return sc
                        if (!psOn) { const { ps: _drop, ...rest } = sc; return rest }
                        return { ...sc, ps: { Aps: psAps, fpu: psFpu, e: psE, fci: psFci } }
                      }),
                    })}
                    className={`w-full ${btn}`}>
                    {psOn ? 'Apply prestressing to beam sections' : 'Clear prestressing from beam sections'}
                  </button>
                </div>
                <p className="col-span-full text-[11px] text-slate-500">
                  The pipeline back-derives equivalent gravity UDLs from the D/L solves (w = 8M/L²) and runs the
                  full prestressed engine per member — losses, transfer/service stresses, fps/φMn, 1.2Mcr.
                </p>
              </Sec>
              <p className="text-[11px] text-slate-500">
                Per-member b×h are editable in the Geometry → Beams &amp; columns table; slab thickness per panel
                in Geometry → Slabs. f′c, fy, ⌀, cover and slab thickness are applied when you generate a new grid;
                γc feeds self-weight (members + slabs) and seismic mass — change it, then “Rebuild D + L” (Loading)
                or regenerate. Bar Ø here is the starting size — the design/optimise engines may pick another when
                “try alternative bar sizes” is on (Analysis).
              </p>
            </div>
          )}

          {/* ── SUPPORTS ── */}
          {tab === 'supports' && (
            <div className="divide-y divide-[#eeece5] px-4 py-1" data-tour="supports-panel">
              <Sec title="Soil (footing design)">
                <Num label="Soil qa" unit="kPa" value={qa} onChange={setQa} />
                <Num label="Footing depth H" unit="m" value={Hf} onChange={setHf} />
                <Num label="Soil unit wt γsoil" unit="kN/m³" value={gammaSoil} onChange={setGammaSoil} step="0.5" />
                <p className="col-span-full text-[11px] text-slate-500">
                  Base supports are toggled per node in the Geometry → Nodes table (“Sup” column).
                  qa is the allowable bearing; γsoil is the overburden weight deducted for the net bearing
                  (q_net = qa − γsoil·Ds − γc·Dc). Applied on the next Design / Optimize.
                </p>
              </Sec>
              {model && model.supports.length > 0 && (
                <Sec grid={false} title="Support fixity">
                  <p className="mb-2 text-xs text-slate-500">
                    Fixed = all 6 DOFs clamped. Pin = 3 translations free to rotate. Spring = translational springs (kN/m).
                  </p>
                  <div className="overflow-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="text-left uppercase tracking-wide text-slate-500">
                          <th className="py-1 pr-2 font-semibold">Node</th>
                          <th className="py-1 pr-2 font-semibold">Fixity</th>
                          <th className="py-1 pr-1 font-semibold">kx (kN/m)</th>
                          <th className="py-1 pr-1 font-semibold">ky (kN/m)</th>
                          <th className="py-1 font-semibold">kz (kN/m)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {model.supports.map((s) => (
                          <tr key={s.node} className="border-t border-slate-100">
                            <td className="py-0.5 pr-2 font-medium">{s.node}</td>
                            <td className="py-0.5 pr-2">
                              <select value={s.fixity}
                                onChange={(e) => updSupport(s.node, { fixity: e.target.value as SupportFixity })}
                                className="rounded border border-slate-200 px-1 py-0.5">
                                <option value="fixed">fixed</option>
                                <option value="pin">pin</option>
                                <option value="spring">spring</option>
                              </select>
                            </td>
                            {(['kx', 'ky', 'kz'] as const).map((k) => (
                              <td key={k} className="py-0.5 pr-1">
                                {s.fixity === 'spring' ? (
                                  <input type="number" step="100" value={s[k] ?? 0}
                                    onChange={(e) => updSupport(s.node, { [k]: parseFloat(e.target.value) || 0 })}
                                    className="w-20 rounded border border-slate-200 px-1 py-0.5" />
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Sec>
              )}
              {model && model.supports.length > 0 && (
                <Sec grid={false} title="Footing plan">
                  <p className="mb-2 text-xs text-slate-500">
                    Every base support gets an isolated square footing. Where two of those pads would physically
                    collide, the design pairs them as one combined footing — the pairing follows the pads, so it
                    only happens where a combined footing is the right answer. Overlapping pads are drawn
                    <span className="mx-1 inline-block h-2 w-3 rounded-sm align-middle" style={{ background: '#dc2626' }} />
                    red on the model until they are resolved.
                  </p>
                  <p className="text-xs text-slate-500">
                    Combining columns that are <em>not</em> in each other's way is what produces a grade beam: the
                    pad is stretched until it is symmetric about the bearing resultant, and with unequal loads that
                    runs far past the columns and leaves the width to fall out as area &divide; length.
                  </p>
                </Sec>
              )}
            </div>
          )}

          {/* ── LOADING ── */}
          {tab === 'loading' && (
            <div className="divide-y divide-[#eeece5] px-4 py-1" data-tour="loading-panel">
              <Sec title="Slab loads">
                <Num label="Default SDL" unit="kPa" value={qD} onChange={setQD} />
                <Num label="Live load" unit="kPa" value={qL} onChange={setQL} />
                <p className="col-span-full text-[11px] text-slate-500">
                  “Default SDL” applies to any slab without a composed NSCP-204 SDL below. Live load is shared.
                </p>
              </Sec>

              {/* NSCP 204 superimposed-dead-load composer (per slab) */}
              <Sec grid={false} title="Superimposed dead load — NSCP 204">
                <p className="mb-2 text-[11px] text-slate-500">
                  Build the SDL from finishes/ceilings/partitions (Table 204-1, kPa) and material layers
                  (Table 204-2, γ × thickness). Then apply it to every slab, or to the slab selected in the 3D view.
                </p>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {/* Table 204-1 components */}
                  <div>
                    <p className="mb-1 text-[11px] font-semibold text-slate-600">Table 204-1 — components (kPa)</p>
                    <div className="max-h-44 space-y-0.5 overflow-auto pr-1">
                      {TABLE_204_1.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-[11px]">
                          <input type="checkbox" checked={sdlDraft.some((x) => x.id === c.id)} onChange={() => toggleSdl204_1(c)} />
                          <span className="flex-1">{c.label}</span>
                          <span className="text-slate-500">{c.kPa.toFixed(2)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {/* Table 204-2 material layers + the running composition */}
                  <div>
                    <p className="mb-1 text-[11px] font-semibold text-slate-600">Table 204-2 — material layer (γ × t)</p>
                    <div className="flex flex-wrap items-end gap-2">
                      <select value={sdlMatId} onChange={(e) => setSdlMatId(e.target.value)}
                        className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs">
                        {TABLE_204_2.map((mtl) => <option key={mtl.id} value={mtl.id}>{mtl.label} ({mtl.gamma})</option>)}
                      </select>
                      <input type="number" value={sdlMatT} onChange={(e) => setSdlMatT(parseFloat(e.target.value))}
                        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs" /> <span className="text-[11px] text-slate-500">mm</span>
                      <button type="button" onClick={addSdl204_2}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-[#0f4c92] hover:border-[#0f4c92] hover:bg-blue-50">+ Add</button>
                    </div>
                    <div className="mt-2 space-y-0.5">
                      {sdlDraft.length === 0 && <p className="text-[11px] text-slate-500">No components selected.</p>}
                      {sdlDraft.map((it, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          <span className="flex-1">{it.label}</span>
                          <span className="text-slate-500">{sdlItemKPa(it).toFixed(2)} kPa</span>
                          <button type="button" onClick={() => removeSdlItem(i)} className="rounded px-1 text-red-500 hover:bg-red-50">✕</button>
                        </div>
                      ))}
                      <div className="mt-1 border-t border-slate-100 pt-1 text-[11px] font-semibold">
                        Composed SDL = <span className="text-[#0f4c92]">{sdlTotal(sdlDraft).toFixed(2)} kPa</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => applySdl(true)} disabled={!model}
                    className="rounded-md bg-[#0f4c92] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Apply to all slabs</button>
                  <button type="button" onClick={() => applySdl(false)} disabled={!selPlate || selPlate.role === 'wall'}
                    className="rounded-md border border-[#0f4c92] px-3 py-1.5 text-xs font-semibold text-[#0f4c92] disabled:opacity-40"
                    title="Select a slab panel in the 3D view first">
                    Apply to selected slab{selPlate && selPlate.role !== 'wall' ? ` (${selPlate.id})` : ''}
                  </button>
                  <span className="text-[11px] text-slate-500">Empty composition clears a slab back to the default SDL.</span>
                </div>
              </Sec>

              {/* NSCP 205-1 / 206 live-load occupancy (per slab) */}
              <Sec grid={false} title="Live load — NSCP 205 / 206">
                <p className="mb-2 text-[11px] text-slate-500">
                  Pick the occupancy (Table 205-1) or other minimum load (§206); its uniform live load overrides the
                  default LL for the chosen slabs.
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <select value={liveOccId} onChange={(e) => setLiveOccId(e.target.value)}
                    className="min-w-[16rem] flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs">
                    <option value="">— default LL ({qL} kPa) —</option>
                    {['Residential', 'Office', 'School', 'Assembly', 'Mercantile', 'Storage', 'Institutional', 'Parking'].map((g) => (
                      <optgroup key={g} label={`205-1 · ${g}`}>
                        {TABLE_205_1.filter((o) => o.group === g).map((o) => <option key={o.id} value={o.id}>{o.label} — {o.kPa} kPa</option>)}
                      </optgroup>
                    ))}
                    <optgroup label="§206 · other minimum loads">
                      {TABLE_206.map((o) => <option key={o.id} value={o.id}>{o.label} — {o.kPa} kPa</option>)}
                    </optgroup>
                  </select>
                  <button type="button" onClick={() => applyLive(true)} disabled={!model}
                    className="rounded-md bg-[#0f4c92] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Apply to all slabs</button>
                  <button type="button" onClick={() => applyLive(false)} disabled={!selPlate || selPlate.role === 'wall'}
                    className="rounded-md border border-[#0f4c92] px-3 py-1.5 text-xs font-semibold text-[#0f4c92] disabled:opacity-40">
                    Apply to selected{selPlate && selPlate.role !== 'wall' ? ` (${selPlate.id})` : ''}
                  </button>
                </div>
              </Sec>

              {/* Persistent per-panel editor — every slab's SDL & live load */}
              {model && model.plates.filter((p) => p.role !== 'wall').length > 0 && (
                <Sec grid={false} title="Per-panel loads">
                  <div className="max-h-64 overflow-auto">
                    <table className="w-full border-collapse text-[11px]">
                      <thead>
                        <tr className="text-left uppercase tracking-wide text-slate-500">
                          <th className="py-1 pr-2 font-semibold">Slab</th>
                          <th className="py-1 pr-2 text-right font-semibold">SDL</th>
                          <th className="py-1 pr-2 font-semibold">SDL source</th>
                          <th className="py-1 pr-2 text-right font-semibold">LL</th>
                          <th className="py-1 pr-2 font-semibold">Occupancy (205-1 / 206)</th>
                          <th className="py-1 pr-2 font-semibold">Deck</th>
                          <th className="py-1 font-semibold" />
                        </tr>
                      </thead>
                      <tbody>
                        {model.plates.filter((p) => p.role !== 'wall').map((p) => {
                          const composed = !!(p.sdlItems && p.sdlItems.length > 0)
                          return (
                            <tr key={p.id} className={`border-t border-slate-100 ${selected === p.id ? 'bg-blue-50/60' : ''}`}>
                              <td className="py-0.5 pr-2 font-medium cursor-pointer hover:text-[#0f4c92]" onClick={() => setSelected(p.id)}>{p.id}</td>
                              <td className="py-0.5 pr-2 text-right">{(composed ? sdlTotal(p.sdlItems) : qD).toFixed(2)}</td>
                              <td className="py-0.5 pr-2 text-slate-500">{composed ? `204 (${p.sdlItems!.length})` : 'default'}</td>
                              <td className="py-0.5 pr-2 text-right">{(p.live ? p.live.kPa : qL).toFixed(2)}</td>
                              <td className="py-0.5 pr-2">
                                <select value={p.live?.id ?? ''} onChange={(e) => setSlabLive(p.id, e.target.value)}
                                  className="w-full rounded border border-slate-200 px-1 py-0.5 text-[11px]">
                                  <option value="">default ({qL})</option>
                                  {[...TABLE_205_1, ...TABLE_206].map((o) => <option key={o.id} value={o.id}>{o.label} — {o.kPa}</option>)}
                                </select>
                              </td>
                              <td className="py-0.5 pr-2">
                                <button type="button" onClick={() => setPlateDeck(p.id, p.deck ? undefined : DEFAULT_DECK)}
                                  title={p.deck ? 'Remove the timber deck (revert to RC slab)' : 'Make this a timber deck-on-joist floor (wood slab)'}
                                  className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${p.deck ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'text-[#0f4c92] hover:bg-blue-50'}`}>
                                  {p.deck ? 'timber ✓' : '+ timber'}
                                </button>
                              </td>
                              <td className="py-0.5 whitespace-nowrap text-right">
                                <button type="button" onClick={() => setSlabSdl(p.id, false)} title="Apply the composed SDL above to this slab"
                                  className="rounded px-1.5 text-[#0f4c92] hover:bg-blue-50">set SDL</button>
                                <button type="button" onClick={() => setSlabSdl(p.id, true)} title="Clear to default SDL"
                                  className="rounded px-1.5 text-red-500 hover:bg-red-50">clear</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    “set SDL” writes the composition built above to that panel; the occupancy dropdown sets its NSCP-205 live load.
                    “+ timber” turns a panel into a timber deck-on-joist floor (designed by the wood-slab engine, reported like RC). Click a slab id to select it in 3D.
                  </p>
                  {selPlate && selPlate.role !== 'wall' && selPlate.deck && (() => {
                    const d = selPlate.deck!
                    const gopts = gradesOf(d.joistSpecies?.split('-')[0] ?? 'DFL')
                    return (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                        <h4 className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-amber-700">Timber deck — {selPlate.id} (NDS §3 / NSCP §6)</h4>
                        <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                          <label className="flex flex-col">Species
                            <select value={d.joistSpecies?.split('-')[0] ?? 'DFL'} onChange={(e) => { const sp = e.target.value; const g = gradesOf(sp); patchDeck(selPlate.id, { joistSpecies: g.length ? g[0].id : `${sp}-2`, joistKind: g[0]?.kind ?? 'sawn' }) }}
                              className="mt-0.5 rounded border border-slate-300 px-1 py-0.5">
                              {speciesList().map((s) => <option key={s.species} value={s.species}>{s.label}</option>)}
                            </select>
                          </label>
                          <label className="flex flex-col">Grade
                            <select value={d.joistSpecies ?? ''} onChange={(e) => patchDeck(selPlate.id, { joistSpecies: e.target.value })}
                              className="mt-0.5 rounded border border-slate-300 px-1 py-0.5">
                              {gopts.map((g) => <option key={g.id} value={g.id}>{g.gradeLabel}</option>)}
                            </select>
                          </label>
                          <label className="flex flex-col">Joist b (mm)
                            <input type="number" value={d.joistB} onChange={(e) => patchDeck(selPlate.id, { joistB: +e.target.value || 0 })} className="mt-0.5 rounded border border-slate-300 px-1 py-0.5" />
                          </label>
                          <label className="flex flex-col">Joist d (mm)
                            <input type="number" value={d.joistD} onChange={(e) => patchDeck(selPlate.id, { joistD: +e.target.value || 0 })} className="mt-0.5 rounded border border-slate-300 px-1 py-0.5" />
                          </label>
                          <label className="flex flex-col">Spacing (mm)
                            <input type="number" value={d.joistSpacing} onChange={(e) => patchDeck(selPlate.id, { joistSpacing: +e.target.value || 0 })} className="mt-0.5 rounded border border-slate-300 px-1 py-0.5" />
                          </label>
                          <label className="flex flex-col">Deck
                            <select value={d.deckMaterial} onChange={(e) => patchDeck(selPlate.id, { deckMaterial: e.target.value as WoodDeck['deckMaterial'], deckWidth: e.target.value === 'bamboo-slat' ? 50 : 140 })}
                              className="mt-0.5 rounded border border-slate-300 px-1 py-0.5">
                              <option value="plank">Plank</option>
                              <option value="bamboo-slat">Bamboo slat</option>
                            </select>
                          </label>
                          <label className="flex flex-col">Deck t (mm)
                            <input type="number" value={d.deckThickness} onChange={(e) => patchDeck(selPlate.id, { deckThickness: +e.target.value || 0 })} className="mt-0.5 rounded border border-slate-300 px-1 py-0.5" />
                          </label>
                          <label className="flex flex-col">Joist support
                            <select value={d.joistSupport ?? 'simple'} onChange={(e) => patchDeck(selPlate.id, { joistSupport: e.target.value as WoodDeck['joistSupport'] })}
                              className="mt-0.5 rounded border border-slate-300 px-1 py-0.5">
                              <option value="simple">Simple</option>
                              <option value="continuous">Continuous</option>
                            </select>
                          </label>
                        </div>
                      </div>
                    )
                  })()}
                </Sec>
              )}

              {model && (
                <Sec grid={false} title="Loads" hint={<>
                    <button type="button" onClick={rebuildGravity}
                      title="Regenerate dead (member self-weight + slab self-weight + SDL) and live loads from the inputs; keeps E loads"
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-[#0f4c92] hover:border-[#0f4c92] hover:bg-blue-50">↻ Rebuild D + L</button>
                </>}>
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="text-left uppercase tracking-wide text-slate-500">
                          <th className="py-1 pr-2 font-semibold">Cat</th>
                          <th className="py-1 pr-2 font-semibold">Target</th>
                          <th className="py-1 pr-1 font-semibold">Value</th>
                          <th className="py-1" />
                        </tr>
                      </thead>
                      <tbody>
                        {model.loads.map((l: ModelLoad, idx) => {
                          const target = l.kind === 'node' ? l.node : l.kind === 'area' ? l.plate : l.member
                          const val = l.kind === 'area' ? l.q : l.kind === 'member-udl' ? l.w : l.kind === 'member-point' ? l.P : l.kind === 'member-thermal' ? l.deltaT : null
                          const unit = l.kind === 'area' ? 'kPa' : l.kind === 'member-udl' ? 'kN/m' : l.kind === 'member-thermal' ? '°C' : 'kN'
                          return (
                            <tr key={idx} className="border-t border-slate-100">
                              <td className={`py-0.5 pr-2 font-semibold ${l.cat === 'D' ? 'text-slate-600' : l.cat === 'L' ? 'text-emerald-700' : l.cat === 'T' ? 'text-amber-600' : 'text-purple-700'}`}>{l.cat}</td>
                              <td className="py-0.5 pr-2">{l.kind === 'node' ? '·' : l.kind === 'area' ? '▦' : l.kind === 'member-thermal' ? '🌡' : '—'} {target}</td>
                              <td className="py-0.5 pr-1 whitespace-nowrap">
                                {val !== null ? (
                                  <>
                                    <input type="number" step="0.1" value={val}
                                      onChange={(e) => updLoad(idx, parseFloat(e.target.value))}
                                      className="w-16 rounded border border-slate-200 px-1 py-0.5" /> {unit}
                                    {l.kind === 'member-thermal' && <span className="ml-1 text-slate-500">(α = {(l.alpha * 1e6).toFixed(1)}×10⁻⁶)</span>}
                                  </>
                                ) : (
                                  <span className="text-slate-500">
                                    {l.kind === 'node' ? ['Fx' as const, 'Fy' as const, 'Fz' as const]
                                      .filter((k) => (l[k] ?? 0) !== 0).map((k) => `${k}=${f1(l[k]!)}`).join(' ') + ' kN' : ''}
                                  </span>
                                )}
                              </td>
                              <td className="py-0.5 text-right">
                                <button type="button" onClick={() => delLoad(idx)}
                                  className="rounded px-1.5 text-red-500 hover:bg-red-50">✕</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Dead = self-weight (members from b×h, slabs from t, γc = 24 kN/m³) + the SDL input; live = the LL
                    input. “Rebuild” regenerates both after you edit the frame.
                  </p>
                </Sec>
              )}

              {model && (
                <Sec title="Thermal / temperature loads">
                  <label className="flex flex-col text-sm">
                    <span className="mb-1 font-medium text-slate-600">Member</span>
                    <select value={thMember} onChange={(e) => setThMember(e.target.value)}
                      className="rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-[#0f4c92] focus:outline-none">
                      <option value="">— select member —</option>
                      {model.members.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                    </select>
                  </label>
                  <Num label="Temperature change ΔT" unit="°C" value={thDeltaT} onChange={setThDeltaT} step="5"
                    hint="+ve = heating (expansion); −ve = cooling (contraction)" />
                  <label className="flex flex-col text-sm">
                    <span className="mb-1 font-medium text-slate-600">Expansion coeff. α</span>
                    <select value={thAlphaKey} onChange={(e) => setThAlphaKey(e.target.value as 'steel' | 'concrete' | 'custom')}
                      className="rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-[#0f4c92] focus:outline-none">
                      <option value="steel">Steel — 11.7×10⁻⁶ /°C (AISC)</option>
                      <option value="concrete">Concrete — 10×10⁻⁶ /°C (ACI 318)</option>
                      <option value="custom">Custom</option>
                    </select>
                    {thAlphaKey === 'custom' && (
                      <input type="number" step="1e-7" value={thAlphaCustom}
                        onChange={(e) => setThAlphaCustom(parseFloat(e.target.value))}
                        className="mt-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-[#0f4c92] focus:outline-none focus:ring-1 focus:ring-[#0f4c92]" />
                    )}
                  </label>
                  <div className="col-span-full">
                    <button type="button"
                      disabled={!thMember || !Number.isFinite(thDeltaT) || !Number.isFinite(thAlpha) || thAlpha <= 0}
                      onClick={() => {
                        if (!model || !thMember) return
                        save({ ...model, loads: [...model.loads, { kind: 'member-thermal', member: thMember, deltaT: thDeltaT, alpha: thAlpha, cat: 'T' }] })
                      }}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-[#0f4c92] hover:border-[#0f4c92] hover:bg-blue-50 disabled:opacity-40">
                      + Add thermal load
                    </button>
                  </div>
                  <p className="col-span-full text-[10px] text-slate-500">
                    Equivalent axial force P_T = EA·α·ΔT applied as self-equilibrating end forces (AISC 360-16 Commentary §C2). Treated as dead load (D) in NSCP 2015 combinations. Thermal effects appear in the member N diagram after Analyze.
                  </p>
                </Sec>
              )}

              <Sec title="Seismic — NSCP 208 static force">
                <div className="col-span-full -mt-1 flex justify-end">
                  <HintButton title="Seismic input guide — NSCP 208"><SeismicHint /></HintButton>
                </div>
                <Num label="Ca" value={Ca} onChange={setCa} />
                <Num label="Cv" value={Cv} onChange={setCv} />
                <Num label="R" value={Rw} onChange={setRw} />
                <Num label="I" value={Ie} onChange={setIe} />
                <Num label="Z (zone)" value={Zf} onChange={setZf} />
                <Num label="Nv (near-source)" value={Nv} onChange={setNv} />
                <DirPicker value={eDirs} onChange={setEDirs} />
                <label className="col-span-full flex items-start gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={methodB} onChange={(e) => setMethodB(e.target.checked)} className="mt-0.5" />
                  <span>
                    Method-B period (§208.5.2.2) — use the modal fundamental period per axis, capped at {Zf >= 0.4 ? '1.3' : '1.4'}·Ta.
                    {!modal && <span className="text-slate-500"> No modal result yet — run Modal (Dynamics) first, else Method A is used.</span>}
                  </span>
                </label>
                <label className="col-span-full flex items-start gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={accTor} onChange={(e) => setAccTor(e.target.checked)} className="mt-0.5" />
                  <span>
                    Accidental torsion ±5% (§208.7.2.7) — each E case splits into ⟳/⟲ variants carrying a ±0.05·L⊥ storey torque
                    (a mass-weighted force couple about the level&apos;s mass centroid), enveloped by Design/Optimize.
                  </span>
                </label>
                <label className="col-span-full flex items-start gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={orth30} onChange={(e) => setOrth30(e.target.checked)} className="mt-0.5" />
                  <span>
                    Orthogonal effects 100%+30% (§208.8.1) — every E case also carries ±30% of the perpendicular direction.
                    Required for corner columns / elements common to two intersecting lateral systems; doubles the case count.
                  </span>
                </label>
                <label className="col-span-full flex items-start gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={evOn} onChange={(e) => setEvOn(e.target.checked)} className="mt-0.5" />
                  <span>
                    Vertical component Ev = 0.5·Ca·I·D (§208.4.1) — E combos become {(1.2 + 0.5 * Ca * Ie).toFixed(2)}D + 1.0E + f₁L + 0.2S
                    and {(0.9 - 0.5 * Ca * Ie).toFixed(2)}D + 1.0E (uplift).
                  </span>
                </label>
                <div className="col-span-full">
                  <button type="button" onClick={generateE} disabled={!model || eDirs.length === 0}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-[#0f4c92] hover:border-[#0f4c92] hover:bg-blue-50 disabled:opacity-40">⚡ Generate E cases</button>
                  {seis && (() => {
                    const other = seisXZ ? seisXZ[primAxis === 'x' ? 'z' : 'x'] : null
                    const twoAxis = !!other && (Math.abs(other.V - seis.V) > 1e-6 || Math.abs(other.T - seis.T) > 1e-9)
                    const sx = seisXZ?.x, sz = seisXZ?.z
                    return (
                    <div className="mt-1 space-y-1">
                      <p className="text-xs text-slate-500">
                        {twoAxis ? `${primAxis.toUpperCase()}: ` : ''}T = {seis.T.toFixed(3)} s{seis.Tmethod === 'B' ? ` (Method B, Ta = ${seis.Ta.toFixed(3)} s)` : ''} · W = {f1(seis.W)} kN · V = {f1(seis.V)} kN
                        {seis.V === seis.Vmax ? ' (2.5CaIW/R cap governs)'
                          : seis.Vsrc > 0 && seis.V === seis.Vsrc ? ' (Zone-4 0.8ZNvIW/R floor governs)'
                            : seis.V === seis.Vmin ? ' (0.11CaIW floor governs)' : ''}
                        {seis.Ft > 0 ? ` · Ft = ${f1(seis.Ft)} kN` : ''} — {eCases.length} cat-E case{eCases.length === 1 ? '' : 's'} ({eDirs.join(', ') || 'none'}).
                        {Zf >= 0.4 ? ` Zone-4 floor = ${f1(seis.Vsrc)} kN.` : ' (Zone-4 floor off: Z < 0.4)'}
                      </p>
                      {twoAxis && other && (
                        <p className="text-xs text-slate-500">
                          {primAxis === 'x' ? 'Z' : 'X'}: T = {other.T.toFixed(3)} s{other.Tmethod === 'B' ? ` (Method B, Ta = ${other.Ta.toFixed(3)} s)` : ''} · V = {f1(other.V)} kN{other.Ft > 0 ? ` · Ft = ${f1(other.Ft)} kN` : ''}
                        </p>
                      )}
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="text-left uppercase tracking-wide text-slate-500">
                            <th className="py-0.5 pr-2 font-semibold">Level (m)</th>
                            <th className="py-0.5 pr-2 text-right font-semibold">wx (kN)</th>
                            {twoAxis ? (
                              <>
                                <th className="py-0.5 pr-2 text-right font-semibold">F·X (kN)</th>
                                <th className="py-0.5 pr-2 text-right font-semibold">F·Z (kN)</th>
                              </>
                            ) : <th className="py-0.5 pr-2 text-right font-semibold">Fx (kN)</th>}
                            <th className="py-0.5 text-right font-semibold">Nodes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {seis.storeys.map((s, i) => (
                            <tr key={s.elevation} className="border-t border-slate-100">
                              <td className="py-0.5 pr-2">{f1(s.elevation)}</td>
                              <td className="py-0.5 pr-2 text-right">{f1(s.wx)}</td>
                              {twoAxis && sx && sz ? (
                                <>
                                  <td className="py-0.5 pr-2 text-right font-medium text-[#7c3aed]">{f1(sx.storeys[i]?.Fx ?? 0)}</td>
                                  <td className="py-0.5 pr-2 text-right font-medium text-[#7c3aed]">{f1(sz.storeys[i]?.Fx ?? 0)}</td>
                                </>
                              ) : <td className="py-0.5 pr-2 text-right font-medium text-[#7c3aed]">{f1(s.Fx)}</td>}
                              <td className="py-0.5 text-right text-slate-500">{s.nodes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-[10px] text-slate-500">
                        System: <b>{seismicSystem.toUpperCase()}</b> (R = {Rw}) — column tie detailing uses {seismicSystem === 'smf' ? 'NSCP §418.7.5 SMF confinement' : seismicSystem === 'imf' ? 'NSCP §418.4.3 IMF hinge zone' : '§425.7.2 gravity ties only'}.
                      </p>
                    </div>
                    )
                  })()}
                </div>
                <div className="col-span-full border-t border-slate-100 pt-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={generateRsaE}
                      disabled={!model || eDirs.length === 0 || !modal || modal.modes.length === 0}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-[#7c3aed] hover:border-[#7c3aed] hover:bg-purple-50 disabled:opacity-40">〜 Generate E cases — RSA (§208.6.4)</button>
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <input type="checkbox" checked={rsaRegular} onChange={(e) => setRsaRegular(e.target.checked)} />
                      <span>regular structure — 0.9·V(T_B) &amp; 0.8·V(T_A) floors (unticked: irregular, 100%·V)</span>
                    </label>
                  </div>
                  {(!modal || modal.modes.length === 0) && (
                    <p className="mt-1 text-[10px] text-slate-500">Needs a Modal run (Dynamics) — the CQC storey shears are combined from the mode shapes, then scaled to the §208.6.4.2 static floor and enveloped by Design/Optimize like any E case.</p>
                  )}
                  {rsaGen && (
                    <div className="mt-1 space-y-1">
                      {(['x', 'z'] as const).map((ax) => {
                        const g = rsaGen[ax]
                        return (
                          <p key={ax} className="text-xs text-slate-500">
                            {ax.toUpperCase()}: V<sub>CQC</sub> = {f1(g.Vdyn)} kN · §208.6.4.2 floor = {f1(g.Vfloor)} kN → scale ×{g.scale.toFixed(3)} · mass participation {Math.round(g.massRatio * 100)}%
                            {g.massRatio < 0.9 && <span className="font-semibold text-amber-600"> — below 90% (§208.6.4.1): raise the mode count in Dynamics</span>}
                          </p>
                        )
                      })}
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="text-left uppercase tracking-wide text-slate-500">
                            <th className="py-0.5 pr-2 font-semibold">Level (m)</th>
                            <th className="py-0.5 pr-2 text-right font-semibold">F·X (kN)</th>
                            <th className="py-0.5 pr-2 text-right font-semibold">V·X (kN)</th>
                            <th className="py-0.5 pr-2 text-right font-semibold">F·Z (kN)</th>
                            <th className="py-0.5 text-right font-semibold">V·Z (kN)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rsaGen.x.storeys.map((s, i) => (
                            <tr key={s.elevation} className="border-t border-slate-100">
                              <td className="py-0.5 pr-2">{f1(s.elevation)}</td>
                              <td className="py-0.5 pr-2 text-right font-medium text-[#7c3aed]">{f1(s.F)}</td>
                              <td className="py-0.5 pr-2 text-right">{f1(s.V)}</td>
                              <td className="py-0.5 pr-2 text-right font-medium text-[#7c3aed]">{f1(rsaGen.z.storeys[i]?.F ?? 0)}</td>
                              <td className="py-0.5 text-right">{f1(rsaGen.z.storeys[i]?.V ?? 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-[10px] text-slate-500">
                        Storey forces back-difference the CQC storey-shear diagram, scaled so the base shear meets the §208.6.4.2 floor, split to the level&apos;s nodes ∝ seismic mass. They replace the static pattern in the cat-E cases enveloped by Analyze/Design/Optimize.
                      </p>
                    </div>
                  )}
                </div>
              </Sec>

              <Sec title="Wind — NSCP 207B MWFRS (directional)">
                <div className="col-span-full -mt-1 flex justify-end">
                  <HintButton title="Wind input guide — NSCP 207"><WindHint /></HintButton>
                </div>
                <Num label="V (basic speed)" unit="m/s" value={Vw} onChange={setVw} />
                <Num label="Kzt (topographic)" value={Kzt} onChange={setKzt} />
                <label className="flex flex-col text-sm">
                  <span className="mb-1 font-medium text-slate-600">Exposure</span>
                  <select value={expo} onChange={(e) => setExpo(e.target.value as 'B' | 'C' | 'D')}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5">
                    <option value="B">B (suburban)</option>
                    <option value="C">C (open)</option>
                    <option value="D">D (flat/coastal)</option>
                  </select>
                </label>
                <DirPicker value={wDirs} onChange={setWDirs} />
                <div className="col-span-full">
                  <button type="button" onClick={generateW} disabled={!model || wDirs.length === 0}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-[#0f4c92] hover:border-[#0f4c92] hover:bg-blue-50 disabled:opacity-40">🌬 Generate W cases</button>
                  {wind && (
                    <p className="mt-1 text-xs text-slate-500">
                      qh = {f2(wind.qh)} kPa · B×L = {f1(wind.B)}×{f1(wind.L)} m (L/B {f2(wind.LB)}) ·
                      Cp,lee {f2(wind.CpLee)} · base shear V = {f1(wind.baseShear)} kN — {wCases.length} cat-W
                      case{wCases.length === 1 ? '' : 's'} ({wDirs.join(', ') || 'none'}). Windward Cp = 0.8, G = {wind.G}, Kd = {wind.Kd}.
                    </p>
                  )}
                </div>
              </Sec>

              <Sec title="Wind — NSCP 207E.4 Components & Cladding (walls)">
                <p className="col-span-full text-[11px] text-slate-500">
                  Local wall cladding/curtain-wall pressures p = qh·[(GCp) − (GCpi)] at the mean roof
                  height. GCp by zone &amp; effective wind area (Fig 207E.4-1); GCpi from the enclosure
                  (±0.18 enclosed, ±0.55 partially enclosed). Uses the V, Kzt &amp; exposure above.
                </p>
                <Num label="Effective wind area" unit="m²" value={ccArea} step="0.5"
                  onChange={(v) => setCcArea(Math.max(0.1, v))} hint="0.93–46.5 m² band" />
                <label className="flex flex-col text-sm">
                  <span className="mb-1 font-medium text-slate-600">Enclosure</span>
                  <select value={ccEncl} onChange={(e) => setCcEncl(e.target.value as WindEnclosure)}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5">
                    <option value="enclosed">Enclosed (±0.18)</option>
                    <option value="partially">Partially enclosed (±0.55)</option>
                    <option value="open">Open (0)</option>
                  </select>
                </label>
                <div className="col-span-full">
                  <button type="button" onClick={runCladding} disabled={!model}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-[#0f4c92] hover:border-[#0f4c92] hover:bg-blue-50 disabled:opacity-40">▦ Compute C&amp;C wall pressures</button>
                  {cladding && (
                    <table className="mt-2 w-full text-left text-xs">
                      <thead className="text-slate-500">
                        <tr className="border-b border-slate-200">
                          <th className="py-1 pr-2">Zone</th><th className="py-1 pr-2">GCp (+ / −)</th>
                          <th className="py-1 pr-2">p⁺ (inward)</th><th className="py-1 pr-2">p⁻ (suction)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {([['4 — interior', cladding.zone4], ['5 — corner', cladding.zone5]] as [string, CladdingResult['zone4']][]).map(([lbl, zone]) => (
                          <tr key={zone.zone} className="border-b border-slate-100">
                            <td className="py-1 pr-2 font-medium">Zone {lbl}</td>
                            <td className="py-1 pr-2 font-mono">{f2(zone.GCpPos)} / {f2(zone.GCpNeg)}</td>
                            <td className="py-1 pr-2 font-mono">{f2(zone.pPos)} kPa</td>
                            <td className="py-1 pr-2 font-mono text-red-600">{f2(zone.pNeg)} kPa</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {cladding && (
                    <p className="mt-1 text-[10px] text-slate-500">
                      qh = {f2(cladding.qh)} kPa at h = {f1(cladding.h)} m · |GCpi| = {cladding.GCpi} · A = {f1(cladding.area)} m².
                      Corner zone 5 governs cladding suction. Roof C&amp;C and h &gt; 18.3 m (§207E.5) out of scope.
                    </p>
                  )}
                </div>
              </Sec>
            </div>
          )}

          {/* ── ANALYSIS ── */}
          {tab === 'analysis' && (
            <div className="divide-y divide-[#eeece5] px-4 py-1" data-tour="analysis-panel">
              <Sec title="Analysis options" hint={<AnalysisOptionsHelp />}>
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={assembly} onChange={(e) => setAssembly(e.target.checked)} />
                  <span>Assembly or garage <span className="text-slate-500">(f₁ = 1.0)</span></span>
                </label>
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={pDelta} onChange={(e) => setPDelta(e.target.checked)} />
                  <span>P-Δ second-order analysis</span>
                </label>
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={cracked} onChange={(e) => setCracked(e.target.checked)} />
                  <span>Cracked sections <span className="text-slate-500">(ACI §6.6.3.1.1)</span></span>
                </label>
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={shearDef} onChange={(e) => setShearDef(e.target.checked)} />
                  <span>Shear deformation <span className="text-slate-500">(Timoshenko)</span></span>
                </label>
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={beamTopSteel} onChange={(e) => setBeamTopSteel(e.target.checked)} />
                  <span>Beams framed at top of steel <span className="text-slate-500">(node = top of beam; matches the drawings, moves the column moments)</span></span>
                </label>
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={allAround} onChange={(e) => setAllAround(e.target.checked)} />
                  <span>Column bars on all four faces</span>
                </label>
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={!model} checked={model?.diaphragm ?? false}
                    onChange={(e) => model && save({ ...model, diaphragm: e.target.checked })} />
                  <span>Rigid floor diaphragm</span>
                </label>
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={!model} checked={model?.rigidEndZones ?? false}
                    onChange={(e) => model && save({ ...model, rigidEndZones: e.target.checked })} />
                  <span>Auto rigid end zones</span>
                </label>
                {model?.rigidEndZones && (
                  <label className="col-span-full flex items-center gap-2 pl-6 text-sm">
                    <span className="text-slate-600">Rigid-zone factor (0–1)</span>
                    <input type="number" min={0} max={1} step={0.1} value={model.rigidZoneFactor ?? 0.5}
                      onChange={(e) => model && save({ ...model, rigidZoneFactor: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) })}
                      className="w-20 rounded border border-slate-300 px-2 py-1" />
                    <span className="text-[11px] text-slate-500">× ½·(framing member depth) at each joint</span>
                  </label>
                )}
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={!model} checked={model?.shellElements ?? false}
                    onChange={(e) => model && save({ ...model, shellElements: e.target.checked })} />
                  <span>Shell elements for slab / wall panels</span>
                </label>
                {model?.shellElements && (
                  <p className="col-span-full pl-6 text-[11px] text-slate-500">
                    Two triangles per panel, corner nodes only — for stress plots and slab FE, not for loading a
                    frame. The design pipeline keeps the tributary load model either way.
                  </p>
                )}
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={tryBars} onChange={(e) => setTryBars(e.target.checked)} />
                  <span>Try alternative bar sizes</span>
                </label>
                <p className="col-span-full text-[11px] text-slate-500">
                  §203.3.1 live-load factor f₁ = <b>{fLive.toFixed(1)}</b>
                  {fLive === 1 ? (assembly ? ' (assembly/garage)' : ' (Lo > 4.8 kPa)') : ' (ordinary occupancy)'}.
                  {pDelta ? ' Frame solved with the geometric-stiffness P-Δ iteration.' : ' First-order (linear) frame solve.'}
                </p>
                {/* Slab load path — the one place this frame solve is known to sit on the
                    unconservative side, measured against a meshed-slab reference. Stated on the
                    card rather than only in the ⓘ, because it changes what a girder result means. */}
                <p className="col-span-full rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900">
                  <b>Slab loads reach beams by 45° tributary area</b>, not a slab mesh. Cross-checked against
                  STAAD.Pro with the slab meshed, every input matched (2×1 bay, 2 storeys): total reaction agrees
                  to <b>0.001%</b> and joint deflections to <b>0.2%</b>, but <b>interior girders come out 22–29%
                  low</b> (edge girders 10–19%) and <b>column moments 25–49% low</b> — a continuous slab carries
                  moment into the girders and columns that a tributary line load cannot. Long-span beams are
                  7–11% conservative. Check interior girders and column moments separately.
                </p>
                <div className="col-span-full">
                  <button type="button" onClick={analyze} disabled={!model || !!busy || meshErrors} className={btn}>
                    {busy === 'analyze' ? '⏳ Analyzing…' : '▶ Analyze (3D FEM)'}
                  </button>
                  {meshErrors && <p className="mt-1 text-[11px] font-medium text-red-600">Resolve the mesh errors below to enable analysis.</p>}
                </div>
                {busy === 'analyze' && <SolverProgress p={progress} />}
              </Sec>

              {model && <ValidationPanel issues={meshIssues} />}

              {gov && govRes && (
                <Sec id="analysis-governing" grid={false} title={`Analysis — ${gov.combo.name} governs`}>
                  <Row label="ΣRy (gravity)" value={`${f1(govRes.reactions.reduce((s, q) => s + q.F[1], 0))} kN`} />
                  <Row label="Extremes" value={`M ${f1(govRes.Mmax)} kN·m`}
                    sub={`V ${f1(govRes.Vmax)} · N ${f1(govRes.Nmax)} kN`} />
                  {orphans > 0 && <Row alert label="⚠ Orphan edges" value={`${orphans}`} sub="slab edges with no member" />}
                  <p className="mt-1 text-[11px] text-slate-500">Members tinted red by |M| relative to the model max. Click one for its diagrams.</p>
                </Sec>
              )}

              {analysis && model && (
                <MemberForcesTable analysis={analysis} members={model.members} sectionFor={sectionFor} />
              )}

              {analysis && model && (
                <ReactionsPanel analysis={analysis} memberLen={memberLenById} />
              )}

              {analysis && model && (
                <DisplacementTable analysis={analysis} nodes={model.nodes} />
              )}

              {model?.shellElements && model.plates.length > 0 && (
                <Sec title="Shell plate stress (CST membrane + DKT bending)">
                  <p className="col-span-full text-[11px] text-slate-500">
                    Recovers per-element membrane stresses (σx, σy, τxy, von Mises) and bending
                    moments (Mx, My, Mxy) from the shell FEM. Uses E = 25 000 MPa, ν = 0.2 for
                    all plates. Area loads are applied as uniform pressure.
                  </p>
                  <Num label="Mesh subdivision n×n" value={shellSubdiv} step="1"
                    onChange={(v) => setShellSubdiv(Math.max(1, Math.min(12, Math.round(v) || 1)))}
                    hint="1–12 cells per side" />
                  <p className="col-span-full text-[11px] text-slate-500">
                    Each quad is split into {shellSubdiv}×{shellSubdiv} cells (2·{shellSubdiv}² triangles); finer meshes
                    reduce the stiffness overestimate of coarse 2-triangle plates. Edges shared by adjacent plates stay conforming.
                  </p>
                  <div className="col-span-full flex flex-wrap gap-2">
                    <button type="button" onClick={runShellStress} disabled={!model || !!busy}
                      className={btn}>
                      ⬡ Recover shell stresses
                    </button>
                    <button type="button" onClick={runSlabFE} disabled={!model || !!busy}
                      className={btn}>
                      ▦ Design slab steel (Wood-Armer)
                    </button>
                  </div>
                  <p className="col-span-full text-[11px] text-slate-500">
                    Wood-Armer (1968) converts the factored (1.2D + 1.6L) shell moment field (Mx, My, Mxy) into
                    orthogonal design moments for the bottom (sagging) and top (hogging) faces, then sizes the x/y
                    reinforcement per metre to NSCP 2015 / ACI 318-14 (φ = 0.90, ⌀12 @ 20 mm cover, fc 28, fy 415).
                  </p>
                </Sec>
              )}
              {shellStress && (
                <ShellContourPanel nodes={shellStress.nodes} elems={shellStress.elems} stresses={shellStress.stresses} />
              )}
              {slabFE && slabFE.length > 0 && (
                <Sec grid={false} title="Slab reinforcement — Wood-Armer (shell FE, factored)">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-500">
                        <tr className="border-b border-slate-200">
                          <th className="py-1 pr-2">Slab</th><th className="py-1 pr-2">t (mm)</th>
                          <th className="py-1 pr-2">Face / dir</th><th className="py-1 pr-2">M* (kN·m/m)</th>
                          <th className="py-1 pr-2">As (mm²/m)</th><th className="py-1 pr-2">Bars ⌀12</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slabFE.flatMap((r) => {
                          const d = r.design
                          const rows: [string, number, typeof d.bottomX][] = [
                            ['Bottom · x', d.moments.mxBottom, d.bottomX],
                            ['Bottom · y', d.moments.myBottom, d.bottomY],
                            ['Top · x', d.moments.mxTop, d.topX],
                            ['Top · y', d.moments.myTop, d.topY],
                          ]
                          return rows.map(([lbl, m, s], i) => (
                            <tr key={`${r.plate}-${lbl}`} className="border-b border-slate-100">
                              {i === 0 && <td className="py-1 pr-2 font-medium align-top" rowSpan={4}>{r.plate}</td>}
                              {i === 0 && <td className="py-1 pr-2 align-top" rowSpan={4}>{r.thickness}</td>}
                              <td className="py-1 pr-2">{lbl}</td>
                              <td className="py-1 pr-2 font-mono">{m.toFixed(1)}</td>
                              <td className="py-1 pr-2 font-mono">{s.As.toFixed(0)}{s.usedMin ? ' (min)' : ''}</td>
                              <td className="py-1 pr-2 font-mono">⌀12 @ {s.spacing.toFixed(0)} mm</td>
                            </tr>
                          ))
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-500">
                    Envelope of the per-element Wood-Armer design moments over each panel. As includes the
                    shrinkage/temperature minimum (ρ_min); spacing capped at min(3t, 450) mm. d = t − cover − 1.5⌀.
                  </p>
                </Sec>
              )}

              {drift && seis && (
                <Sec id="storey-drift" grid={false} title={`Storey drift — ${(eDirs[0] ?? '+X').replace(/[+-]/, '')} (ΔM = 0.7·R·Δs)`}>
                  {drift.map((row) => (
                    <Row key={row.elevation} alert={!row.ok}
                      label={`Level ${f1(row.elevation)} m`}
                      value={`ΔM = ${row.dM.toFixed(1)} mm ${row.ok ? '✓' : '✗'}`}
                      sub={`Δs ${row.ds.toFixed(2)} · limit ${row.limit.toFixed(0)} mm`} />
                  ))}
                  <p className="mt-1 text-[11px] text-slate-500">
                    Limit {seis.T < 0.7 ? '0.025' : '0.020'}·hs (T {seis.T < 0.7 ? '<' : '≥'} 0.7 s) — NSCP 208.5.10.
                  </p>
                </Sec>
              )}

              {irregular && seis && (
                <Sec id="irregularities" grid={false} title={`Structural irregularities — ${(eDirs[0] ?? '+X').replace(/[+-]/, '')}`}>
                  {irregular.length === 0
                    ? <Row label="NSCP Table 208-9 / 208-10" value="Regular ✓" sub="Torsional, soft-storey, mass & vertical-geometric checks all pass" />
                    : irregular.map((f, i) => (
                      <Row key={`${f.code}-${f.elevation ?? i}`} alert={f.verdict === 'extreme'}
                        label={`${f.code} · ${f.name}`}
                        value={`${f.verdict === 'extreme' ? '✗ extreme' : '△ irregular'}${f.elevation != null ? ` · EL ${f1(f.elevation)} m` : ''}`}
                        sub={`${f.table} — ${f.detail}`} />
                    ))}
                  <p className="mt-1 text-[11px] text-slate-500">
                    Auto-flags off the E-case drift field + storey weights: P1 torsional (208-10 §1a/1b),
                    V1 soft-storey, V2 mass, V3 vertical-geometric (208-9 §1–3). Capacity/plan-shape types are not auto-checked.
                  </p>
                </Sec>
              )}

              {axialSets && analysis && model && (
                <Sec grid={false} title="Tension / compression-only members">
                  {(() => {
                    const limited = model.members.filter((m) => m.axialMode && m.axialMode !== 'both')
                    const rows = analysis.perCombo
                      .map((c, i) => ({ c, a: axialSets[i] }))
                      .filter((r) => r.a)
                    const everOff = new Set(rows.flatMap((r) => r.a!.inactive))
                    return (
                      <>
                        <Row label="Limited members" value={`${limited.length}`}
                          sub={`${limited.filter((m) => m.axialMode === 'tension-only').length} tension-only · ${limited.filter((m) => m.axialMode === 'compression-only').length} compression-only`} />
                        <Row label="Governing combo" value={analysis.perCombo[analysis.govIdx]?.combo.name ?? '—'}
                          sub={inactiveIds.size === 0
                            ? 'all limited members active — dashed red overlay hidden'
                            : `off: ${[...inactiveIds].join(', ')}`} />
                        <Row alert={axialUnconverged > 0} label="Active-set convergence"
                          value={axialUnconverged === 0 ? `${rows.length} combos converged ✓` : `${axialUnconverged} of ${rows.length} hit the iteration cap`}
                          sub="Each combo is iterated on its own active set — superposition does not hold, so results are never scaled or summed across combos" />
                        <div className="mt-2 max-h-60 overflow-auto">
                          <table className="w-full border-collapse text-[11px]">
                            <thead>
                              <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                                <th className="pr-2 pb-1">Combination</th>
                                <th className="pr-2 pb-1 text-right">Iter</th>
                                <th className="pb-1">Members switched off</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map(({ c, a }) => (
                                <tr key={c.combo.name} className={c === analysis.perCombo[analysis.govIdx] ? 'bg-amber-50 font-semibold' : ''}>
                                  <td className="pr-2 py-0.5 text-slate-700">{c.combo.name}</td>
                                  <td className={`pr-2 py-0.5 text-right ${a!.converged ? 'text-slate-600' : 'text-red-600'}`}>{a!.iterations}</td>
                                  <td className="py-0.5 text-slate-600">{a!.inactive.length ? a!.inactive.join(', ') : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {everOff.size === 0
                            ? 'No limited member violated its mode in any combination — the model behaves linearly and the results match an ordinary solve.'
                            : `${everOff.size} member(s) drop out in at least one combination; which one depends on the load direction, so the envelope needs every combo.`}
                        </p>
                      </>
                    )
                  })()}
                </Sec>
              )}
            </div>
          )}

          {/* ── MODAL ── */}
          {tab === 'modal' && (
            <div className="divide-y divide-[#eeece5] px-4 py-1">
              <Sec title="Modal analysis options">
                <label className="flex flex-col text-sm">
                  <span className="mb-1 font-medium text-slate-600">Number of modes</span>
                  <input type="number" min={1} max={50} step={1} value={nModes}
                    onChange={(e) => setNModes(Math.max(1, Math.min(50, Math.round(parseFloat(e.target.value) || 1))))}
                    className="rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-[#0f4c92] focus:outline-none focus:ring-1 focus:ring-[#0f4c92]" />
                </label>
                <p className="col-span-full text-[11px] text-slate-500">
                  Lumped-mass free vibration ([K]−ω²[M]). Mass from member &amp; slab self-weight (dead). Request enough
                  modes to accumulate ≥90% of the lateral mass (NSCP 208.5.5).
                </p>
                <div className="col-span-full" data-tour="modal-panel">
                  <button type="button" onClick={runModal} disabled={!model || !!busy || meshErrors} className={btn}>
                    {busy === 'modal' ? '⏳ Solving modes…' : '〰 Run modal analysis'}
                  </button>
                  {meshErrors && <p className="mt-1 text-[11px] font-medium text-red-600">Resolve the mesh errors in the Analysis tab to enable modal analysis.</p>}
                </div>
                {busy === 'modal' && <SolverProgress p={progress} />}
              </Sec>

              {model && <ValidationPanel issues={meshIssues} />}

              {modal && modal.modes.length > 0 && (
                <ModalPanel result={modal} selectedMode={modeShapeIdx} onSelectMode={setModeShapeIdx} />
              )}
              {modal && modeShapeIdx !== null && modal.modes[modeShapeIdx] && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[10px] font-bold uppercase tracking-[.12em] text-[#a39d8d]">
                      Mode {modeShapeIdx + 1} shape — T = {modal.modes[modeShapeIdx].period.toFixed(3)} s
                    </h3>
                    <button type="button" onClick={() => setModeShapeIdx(null)}
                      className="rounded px-2 py-0.5 text-xs font-semibold text-violet-500 hover:bg-violet-100">✕ Close</button>
                  </div>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-violet-700">Visual amplitude: {modeAmp.toFixed(1)} m</span>
                    <input type="range" min={0.3} max={5} step={0.1} value={modeAmp}
                      onChange={(e) => setModeAmp(parseFloat(e.target.value))}
                      className="accent-violet-600" />
                  </label>
                  <p className="mt-1.5 text-[11px] text-violet-500">
                    Purple skeleton oscillates in the 3D canvas (visual only — not structural displacement).
                    Switch to any other tab; the animation continues while the panel is visible.
                  </p>
                </div>
              )}
              {modal && modal.modes.length === 0 && (
                <Sec grid={false} title="Modal analysis">
                  <p className="text-sm text-slate-600">No modes found — the model has no lumped mass (add members/slabs with self-weight).</p>
                </Sec>
              )}
              {rsa && <ResponseSpectrumPanel result={rsa} seismicT={seis?.T} />}

              <Sec title="Time-history — modal Newmark-β (linear)">
                {/* CSV accelerogram upload */}
                <div className="col-span-full">
                  <p className="mb-1 text-[11px] font-medium text-slate-600">Real accelerogram (CSV / PEER AT2)</p>
                  {thCsv ? (
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-teal-50 px-2 py-0.5 text-[11px] text-teal-700">
                        {thCsv.name} — {thCsv.npts} pts
                      </span>
                      <button type="button" onClick={() => setThCsv(null)}
                        className="text-[11px] text-slate-500 hover:text-red-500">✕ clear</button>
                    </div>
                  ) : (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">
                      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <path d="M8 2v8M5 7l3-3 3 3M2 12h12" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Upload CSV / AT2
                      <input type="file" accept=".csv,.txt,.at2,.acc" className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (!f) return
                          f.text().then((text) => {
                            // Quick sample count (non-comment, non-empty lines with at least one number)
                            const npts = text.split('\n').filter((l) => {
                              const t = l.trim()
                              return t && !/^[#%!]/.test(t) && /[\d.-]/.test(t) && !isNaN(parseFloat(t.split(/[\s,;]+/)[0]))
                            }).length
                            setThCsv({ text, name: f.name, npts })
                          })
                          e.target.value = ''
                        }}
                      />
                    </label>
                  )}
                </div>
                {/* CSV units + dt override (only shown when a file is loaded) */}
                {thCsv && (
                  <>
                    <Pick label="CSV units" value={thCsvUnits} onChange={setThCsvUnits}
                      options={[['g', 'g (×9.81 m/s²)'], ['ms2', 'm/s²']]} />
                    <Num label="Δt (one-column)" unit="s" value={thCsvDt} onChange={setThCsvDt} step="0.01" />
                  </>
                )}
                {/* Synthetic motion params (shown when no CSV) */}
                {!thCsv && (
                  <>
                    <Pick label="Ground motion" value={thKind} onChange={setThKind}
                      options={[['rampedSine', 'Ramped sine (transient)'], ['pulse', 'Single pulse'], ['harmonic', 'Steady harmonic']]} />
                    <Num label="Peak ground accel" unit="g" value={thPga} onChange={setThPga} step="0.05" />
                    <Num label="Frequency" unit="Hz" value={thFreq} onChange={setThFreq} step="0.5" />
                    <Num label="Duration" unit="s" value={thDur} onChange={setThDur} step="1" />
                  </>
                )}
                <Pick label="Direction" value={thDir} onChange={setThDir} options={[['x', '+X'], ['z', '+Z']]} />
                <Num label="Damping ζ" unit="%" value={thZeta} onChange={setThZeta} step="1" />
                <p className="col-span-full text-[11px] text-slate-500">
                  Modal superposition: each mode is an SDOF integrated by Newmark-β (β=¼, γ=½). Upload a real
                  record (two-column t/ag, one-column with Δt, or PEER AT2) or use the built-in synthetic motion.
                </p>
                <div className="col-span-full flex flex-wrap gap-2">
                  <button type="button" onClick={runTimeHistory} disabled={!model || !!busy || meshErrors || !nonlinearGate.allowed} className={btn}>
                    {busy === 'timeHistory' ? '⏳ Integrating…' : '∿ Run time-history'}
                  </button>
                  {!nonlinearGate.allowed && <UpgradeNotice compact message={nonlinearGate.message} />}
                  {thCsv && (
                    <button type="button" onClick={runResponseSpectrum} className={btn}>
                      ⌁ Response spectrum
                    </button>
                  )}
                </div>
                {thCsv && (
                  <p className="col-span-full text-[11px] text-slate-500">
                    The response spectrum integrates an SDOF oscillator per period (Newmark-β, ζ = {thZeta}%) over the
                    uploaded record, then overlays it on the NSCP 208 design spectrum (Ca {Ca}, Cv {Cv}, I {Ie}, R {Rw}).
                  </p>
                )}
                {busy === 'timeHistory' && <SolverProgress p={progress} />}
              </Sec>
              {th && <TimeHistoryPanel res={th} dirLabel={thDir === 'x' ? '+X' : '+Z'} />}
              {recSpec && <RecordedSpectrumPanel spec={recSpec.spec} design={recSpec.design} recordName={recSpec.name} />}

              {(() => {
                const occ = DG11_OCCUPANCY.find((o) => o.id === dg11OccId) ?? DG11_OCCUPANCY[0]
                const deflMm = dg11DeflMm > 0 ? dg11DeflMm : (dg11Suggest?.deflMm ?? 0)
                const W = dg11W > 0 ? dg11W : (dg11Suggest?.W ?? 0)
                const fn = freqFromDeflection(deflMm / 1000)
                const res = dg11Walking({ fn, W, beta: occ.beta, Po: occ.Po, aoLimit: occ.aoLimit })
                const has = deflMm > 0 && W > 0
                return (
                  <Sec title="Floor vibration — AISC Design Guide 11 (walking)">
                    <Pick label="Occupancy" value={dg11OccId} onChange={setDg11OccId}
                      options={DG11_OCCUPANCY.map((o) => [o.id, o.label])} />
                    <Num label="Floor deflection Δ" unit="mm" value={dg11DeflMm} onChange={setDg11DeflMm} step="0.1"
                      hint={dg11Suggest ? `analysis suggests ${dg11Suggest.deflMm.toFixed(1)} (0 = use it)` : 'run Analyze to auto-suggest'} />
                    <Num label="Supported weight W" unit="kN" value={dg11W} onChange={setDg11W} step="10"
                      hint={dg11Suggest ? `storey dead ≈ ${dg11Suggest.W.toFixed(0)} (0 = use it)` : 'effective panel weight'} />
                    <p className="col-span-full text-[11px] text-slate-500">
                      fn = 0.18·√(g/Δ); aₚ/g = Po·e^(−0.35 fn)/(β·W) ≤ aₒ/g. Po = {occ.Po} kN, β = {occ.beta}, aₒ/g = {(occ.aoLimit * 100).toFixed(1)}% (DG11 Table 4.1).
                    </p>
                    {has ? (
                      <div className="col-span-full mt-1 space-y-1">
                        <Row label="Fundamental frequency fₙ" value={`${fn.toFixed(2)} Hz`}
                          sub={fn > 9 ? 'high-frequency floor — Eq. 4.1 is conservative' : 'low-frequency floor'} />
                        <Row label="Peak acceleration aₚ/g" value={`${(res.apOverG * 100).toFixed(2)}%`}
                          sub={`limit aₒ/g = ${(res.aoLimit * 100).toFixed(1)}%`} />
                        <Row alert={!res.ok} label={res.ok ? '✓ Satisfactory' : '✗ Exceeds tolerance'}
                          value={`ratio ${res.ratio.toFixed(2)}`} sub={res.ok ? 'aₚ ≤ aₒ' : 'stiffen framing, add damping/mass, or relax occupancy'} />
                      </div>
                    ) : (
                      <p className="col-span-full text-[11px] text-amber-600">Enter Δ and W (or run Analyze for auto-suggestions) to evaluate.</p>
                    )}
                  </Sec>
                )
              })()}
            </div>
          )}

          {/* ── PUSHOVER ── */}
          {tab === 'pushover' && (
            <div className="divide-y divide-[#eeece5] px-4 py-1">
              <Sec title="Pushover — nonlinear static (plastic hinges)">
                <Pick label="Push direction" value={poDir} onChange={setPoDir}
                  options={[['x', '+X'], ['z', '+Z']]} />
                <Pick label="Lateral pattern" value={poPattern} onChange={setPoPattern}
                  options={[['triangular', 'Inverted triangle (mass×h)'], ['uniform', 'Uniform (mass)']]} />
                {/* Bounded: 0.1–5%. Below §9.6.1.2's minimum the hinge is a
                    fiction, and the upper end is already past every code cap
                    (§18.6.3.1 stops at 2.5%). Mp is solved from C = T, so an
                    over-reinforced ρ returns the LOWER strength it really has
                    — it used to return a larger one, and above ρ ≈ 6.5% a
                    negative one. */}
                <Num label="Concrete ρ (tension)" unit="%" value={poRho} onChange={setPoRho} step="0.1"
                  min={0.1} max={5}
                  hint="assumed steel ratio for Mp (concrete only) · 0.1–5%" />
                <Num label="Mp scale" value={poMpScale} onChange={setPoMpScale} step="0.1"
                  hint="multiplier on every member capacity" />
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={!model} checked={poPM}
                    onChange={(e) => setPoPM(e.target.checked)} />
                  <span>P–M interaction (reduce plastic moment Mpc(P) at each hinge)</span>
                </label>
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={!model} checked={poPDelta}
                    onChange={(e) => setPoPDelta(e.target.checked)} />
                  <span>P-Δ second order (gravity geometric stiffness softens the capacity curve)</span>
                </label>
                <p className="col-span-full text-[11px] text-slate-500">
                  Event-to-event concentrated plastic hinges (a hinge = a member-end moment release).
                  Capacity curve = base shear vs roof displacement; pushes to a 4% drift target or a collapse
                  mechanism. Mp: steel Fy·Zx; concrete ρ·b·d²·fy·(1−0.59ρfy/f′c).
                  {' '}P–M interaction (opt-in): hinges yield at the reduced Mpc(P) — steel AISC App. 1
                  (1.18Mp(1−P/Py) major, 1.19Mp(1−(P/Py)²) minor); concrete ACI §22.4 linear chord Mp(1−P/Pn0).
                  {' '}P-Δ (opt-in): a constant geometric stiffness from the gravity weight (mass×g) softens the
                  lateral tangent — drift is amplified, hinges form earlier, and the collapse base shear drops.
                </p>
                <div className="col-span-full">
                  <button type="button" onClick={runPushover} disabled={!model || !!busy || meshErrors || !nonlinearGate.allowed} className={btn}>
                    {busy === 'pushover' ? '⏳ Pushing…' : '⤧ Run pushover'}
                  </button>
                  {!nonlinearGate.allowed && <UpgradeNotice compact message={nonlinearGate.message} />}
                  {meshErrors && <p className="mt-1 text-[11px] font-medium text-red-600">Resolve the mesh errors in the Analysis tab to enable pushover.</p>}
                </div>
                {busy === 'pushover' && <SolverProgress p={progress} />}
              </Sec>

              {model && <ValidationPanel issues={meshIssues} />}

              {po && po.result.curve.length > 1 && (
                <PushoverPanel res={po} dirLabel={poDir === 'x' ? '+X' : '+Z'} />
              )}
              {po && po.result.curve.length <= 1 && (
                <Sec grid={false} title="Pushover">
                  <p className="text-sm text-slate-600">
                    No yield events — the model has no hingeable members or no lateral mass to push.
                    Assign sections and ensure the frame carries self-weight.
                  </p>
                </Sec>
              )}

              <Sec title="Biaxial pushover — skew push on the full 3-D model">
                <Num label="Push angle in plan" unit="°" value={bxAngle} onChange={setBxAngle} step="5"
                  hint="0° = +X, 90° = +Z; 45° bends every column about both axes at once" />
                <Num label="Target roof drift" unit="% of H" value={bxDrift} onChange={setBxDrift} step="0.5" />
                <Num label="Displacement steps" value={bxSteps} onChange={setBxSteps} step="10"
                  hint="more steps = smoother curve and easier convergence" />
                <Pick label="Yield surface" value={bxSurface} onChange={setBxSurface}
                  options={[['power', 'Bresler contour (RC)'], ['orbison', 'Orbison (steel I-shapes)']]} />
                {bxSurface === 'power' && (
                  <Num label="Contour exponent α" value={bxAlpha} onChange={setBxAlpha} step="0.5"
                    hint="1 = linear chord, 1.5 typical RC, 2 = ellipse; above ~6 the return map stops converging" />
                )}
                <label className="col-span-full flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={!model} checked={bxPM}
                    onChange={(e) => setBxPM(e.target.checked)} />
                  <span>P–M interaction (axial load reduces the hinge capacities)</span>
                </label>
                <p className="col-span-full text-[11px] text-slate-500">
                  Unlike the pushover above, this one runs on the <strong>real 3-D model</strong> — no reduction to an
                  equivalent plane frame — and each member end carries a <strong>biaxial</strong> hinge whose two bending
                  axes yield on one coupled surface. That is what lets the push run at any plan angle: at 45° a corner
                  column can sit at 0.8·Mpy <em>and</em> 0.8·Mpz, which two independent 1-D hinges would call elastic.
                  {' '}Concrete ρ and Mp scale are shared with the pushover settings above. Member end releases and rigid
                  offsets cannot be represented by the hinge element; if the model uses them, the result panel says so.
                </p>
                <div className="col-span-full">
                  <button type="button" onClick={runBiaxialPushover} disabled={!model || !!busy || meshErrors || !nonlinearGate.allowed} className={btn}>
                    {busy === 'biaxialPushover' ? '⏳ Pushing…' : '◈ Run biaxial pushover'}
                  </button>
                  {!nonlinearGate.allowed && <UpgradeNotice compact message={nonlinearGate.message} />}
                </div>
                {busy === 'biaxialPushover' && <SolverProgress p={progress} />}
              </Sec>

              {bx && bx.curve.length > 0 && <BiaxialPushoverPanel res={bx} />}
              {bx && bx.curve.length === 0 && (
                <Sec grid={false} title="Biaxial pushover">
                  <p className="text-sm text-slate-600">
                    The push produced no converged steps — the model has no lateral mass, or no member could be
                    given a plastic capacity. Assign sections and ensure the frame carries self-weight.
                  </p>
                </Sec>
              )}
            </div>
          )}

          {tab === 'nonlinear' && (
            <div className="divide-y divide-[#eeece5] px-4 py-1">
              <Sec title="Nonlinear time-history (hysteretic, Newmark + Newton-Raphson)">
                <Pick label="Plasticity model" value={nlKindModel} onChange={setNlKindModel}
                  options={[['hinges', 'Member-end plastic hinges'], ['shear', 'Shear building (storey springs)']]} />
                <Pick label="Direction" value={nlDir} onChange={setNlDir} options={[['x', '+X'], ['z', '+Z']]} />
                <Pick label="Ground motion" value={nlKind} onChange={setNlKind}
                  options={[['rampedSine', 'Ramped sine'], ['harmonic', 'Harmonic'], ['pulse', 'Pulse']]} />
                <Num label="Peak ground accel" unit="g" value={nlPga} onChange={setNlPga} step="0.05" />
                <Num label="Frequency" unit="Hz" value={nlFreq} onChange={setNlFreq} step="0.5" />
                <Num label="Duration" unit="s" value={nlDur} onChange={setNlDur} step="1" />
                <Num label="Damping ζ" unit="%" value={nlZeta} onChange={setNlZeta} step="0.5" />
                <Num label="Post-yield ratio b" unit="%" value={nlB} onChange={setNlB} step="0.5"
                  hint="storey spring hardening (0 = elastic-perfectly-plastic)" />
                <Num label="Concrete ρ (tension)" unit="%" value={nlRho} onChange={setNlRho} step="0.1"
                  min={0.1} max={5}
                  hint="assumed steel ratio for Mp (concrete only) · 0.1–5%" />
                {nlKindModel === 'hinges' ? (
                  <>
                    <p className="col-span-full text-[11px] text-slate-500">
                      The 3D model is condensed to an <strong>equivalent plane frame</strong> (all frame lines
                      parallel to the loading direction are combined), then integrated with a bilinear hysteretic
                      plastic hinge at <strong>every member end</strong> — Newmark-β with Newton-Raphson each step.
                      Hinge capacity is reduced by <strong>P–M interaction</strong>, so axial load lowers Mp.
                      An elastic reference run is solved alongside.
                    </p>
                    <p className="col-span-full rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
                      No shear-type assumption — a beam-hinging frame hinges in its beams, because every member end
                      carries its own hinge. Plane-frame idealization: exact when the parallel frames are identical
                      and deform together; one direction at a time, torsion ignored.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="col-span-full text-[11px] text-slate-500">
                      The frame is reduced to an equivalent nonlinear <strong>shear building</strong>: one bilinear
                      hysteretic spring per storey — mass from the seismic mass, stiffness k₀ = V/Δ from a static
                      lateral probe, capacity Fy = Σ2·Mp/h. Newmark-β with Newton-Raphson iteration each step;
                      Rayleigh damping on the initial stiffness. An elastic reference run is solved alongside so the
                      inelastic force reduction is visible.
                    </p>
                    <p className="col-span-full rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                      <strong>Assumes a shear-type (strong-beam / weak-column) mechanism.</strong> A frame that hinges
                      in its beams has a lower real capacity than Σ2·Mp/h, so Fy would be unconservative — confirm the
                      governing mechanism with the Pushover tab first. One direction at a time; torsion ignored.
                    </p>
                  </>
                )}
                <div className="col-span-full">
                  <button type="button" onClick={runNonlinear} disabled={!model || !!busy || meshErrors} className={btn}>
                    {busy === 'nonlinearTH' ? '⏳ Integrating…' : '⚡ Run nonlinear time-history'}
                  </button>
                  {meshErrors && <p className="mt-1 text-[11px] font-medium text-red-600">Resolve the mesh errors in the Analysis tab to enable this run.</p>}
                </div>
                {busy === 'nonlinearTH' && <SolverProgress p={progress} />}
              </Sec>

              {model && <ValidationPanel issues={meshIssues} />}

              {nlHinge?.inelastic && (() => {
                const ie = nlHinge.inelastic!, el = nlHinge.elastic
                const R = el && ie.response.peakBaseShear > 0
                  ? el.response.peakBaseShear / ie.response.peakBaseShear : null
                const yielded = ie.response.hinges.filter((h) => h.yielded)
                  .sort((a, b) => Math.abs(b.plastic) - Math.abs(a.plastic))
                return (
                  <>
                    <Sec grid={false} title="Response summary — member-end hinges">
                      <Row label="Equivalent frame period T₁" value={`${f2(ie.period)} s`}
                        sub={`${ie.frame.nodes.length} nodes · ${ie.frame.members.length} members · ${ie.frame.framesCombined} parallel frame lines combined`} />
                      <Row label="Hinges yielded" value={`${ie.response.yieldedHinges} of ${ie.response.hinges.length}`}
                        alert={!ie.response.converged} />
                      <Row label="Peak base shear" value={`${f1(ie.response.peakBaseShear)} kN`}
                        sub={el ? `elastic demand ${f1(el.response.peakBaseShear)} kN` : undefined} />
                      {R != null && R > 1.01 && (
                        <Row label="Force reduction (elastic / inelastic)" value={`${f2(R)}×`}
                          sub="ductility-derived demand reduction, not a code R factor" />
                      )}
                      <Row label="Peak roof displacement" value={`${f1(ie.response.peakDisp * 1000)} mm`} />
                      <Row label="Hysteretic energy dissipated" value={`${f1(ie.response.totalDissipated)} kN·m`} />
                      <Row label="Newton convergence" value={ie.response.converged ? `✓ ≤ ${ie.response.maxIterations} iterations` : '✗ did not converge'}
                        alert={!ie.response.converged} />
                    </Sec>

                    {yielded.length === 0 && (
                      <Sec grid={false} title="Hinge state">
                        <p className="text-sm text-slate-600">
                          No hinge yielded — the frame stayed <strong>elastic</strong> under this record. That is a
                          result, not a failure: raise the PGA, lower the frequency toward the {f2(ie.period)} s
                          period, or use lighter sections to drive it inelastic.
                        </p>
                      </Sec>
                    )}
                    {yielded.length > 0 && (
                      <Sec grid={false} title="Yielded hinges (largest plastic rotation first)">
                        <div className="overflow-x-auto">
                          <table className="w-full text-right text-[12px]">
                            <thead className="text-slate-500">
                              <tr className="border-b border-slate-200">
                                <th className="py-1 pr-2 text-left">Member</th><th className="py-1 pr-2 text-left">End</th>
                                <th className="py-1 pr-2">M (kN·m)</th><th className="py-1 pr-2">θ (mrad)</th>
                                <th className="py-1 pr-2">θp (mrad)</th><th className="py-1 pr-2">E (kN·m)</th>
                              </tr>
                            </thead>
                            <tbody className="font-mono">
                              {yielded.slice(0, 20).map((h) => (
                                <tr key={`${h.member}-${h.end}`} className="border-b border-slate-100 bg-amber-50">
                                  <td className="py-0.5 pr-2 text-left">{h.member}</td>
                                  <td className="py-0.5 pr-2 text-left">{h.end}</td>
                                  <td className="py-0.5 pr-2">{f1(h.moment)}</td>
                                  <td className="py-0.5 pr-2">{f1(h.rotation * 1000)}</td>
                                  <td className="py-0.5 pr-2">{f1(h.plastic * 1000)}</td>
                                  <td className="py-0.5 pr-2">{f1(h.dissipated)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="mt-2 text-[10px] text-slate-500">
                          θp is the permanent (plastic) rotation left in the hinge. Member ids are the condensed
                          frame&rsquo;s — each combines the parallel 3D members at that grid position.
                          {yielded.length > 20 && ` Showing the 20 worst of ${yielded.length}.`}
                        </p>
                      </Sec>
                    )}
                  </>
                )
              })()}
              {nlHinge && !nlHinge.inelastic && (
                <Sec grid={false} title="Nonlinear time-history — member-end hinges">
                  <p className="text-sm text-slate-600">
                    The model could not be condensed to a plane frame in this direction — it needs members lying
                    in the loading plane, at least one support, and a positive seismic mass.
                  </p>
                </Sec>
              )}

              {nl?.inelastic && (() => {
                const ie = nl.inelastic!, el = nl.elastic
                const R = el && ie.response.peakBaseForce > 0
                  ? el.response.peakBaseForce / ie.response.peakBaseForce : null
                return (
                  <>
                    <Sec grid={false} title="Response summary">
                      <Row label="Reduced period T₁" value={`${f2(ie.period)} s`}
                        sub={`Rayleigh α ${ie.rayleigh.alpha.toFixed(3)} · β ${ie.rayleigh.beta.toFixed(5)}`} />
                      <Row label="Yielded" value={ie.response.yielded ? 'yes — inelastic' : 'no — stayed elastic'}
                        alert={!ie.response.converged} />
                      <Row label="Peak base force" value={`${f1(ie.response.peakBaseForce)} kN`}
                        sub={el ? `elastic demand ${f1(el.response.peakBaseForce)} kN` : undefined} />
                      {R != null && R > 1.01 && (
                        <Row label="Force reduction (elastic / inelastic)" value={`${f2(R)}×`}
                          sub="ductility-derived demand reduction, not a code R factor" />
                      )}
                      <Row label="Hysteretic energy dissipated" value={`${f1(ie.response.totalDissipated)} kN·m`} />
                      <Row label="Newton convergence" value={ie.response.converged ? `✓ ≤ ${ie.response.maxIterations} iterations` : '✗ did not converge'}
                        alert={!ie.response.converged} />
                    </Sec>

                    <Sec grid={false} title="Storey reduction & demand">
                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-[12px]">
                          <thead className="text-slate-500">
                            <tr className="border-b border-slate-200">
                              <th className="py-1 pr-2 text-left">Storey</th><th className="py-1 pr-2">EL (m)</th>
                              <th className="py-1 pr-2">m (t)</th><th className="py-1 pr-2">k₀ (kN/m)</th>
                              <th className="py-1 pr-2">Fy (kN)</th><th className="py-1 pr-2">Δpeak (mm)</th>
                              <th className="py-1 pr-2">μ</th><th className="py-1 pr-2">E (kN·m)</th>
                            </tr>
                          </thead>
                          <tbody className="font-mono">
                            {ie.storeys.map((s, i) => {
                              const mu = ie.response.ductility[i] ?? 0
                              return (
                                <tr key={s.storey} className={`border-b border-slate-100 ${mu > 1 ? 'bg-amber-50' : ''}`}>
                                  <td className="py-0.5 pr-2 text-left">{s.storey}</td>
                                  <td className="py-0.5 pr-2">{f2(s.elevation)}</td>
                                  <td className="py-0.5 pr-2">{f1(s.mass)}</td>
                                  <td className="py-0.5 pr-2">{f0(s.k0)}</td>
                                  <td className="py-0.5 pr-2">{f0(s.Fy)}</td>
                                  <td className="py-0.5 pr-2">{f1((ie.response.peak[i] ?? 0) * 1000)}</td>
                                  <td className="py-0.5 pr-2">{f2(mu)}</td>
                                  <td className="py-0.5 pr-2">{f1(ie.response.dissipated[i] ?? 0)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-2 text-[10px] text-slate-500">
                        μ = peak storey drift / yield drift (μ &gt; 1 ⇒ that storey yielded, highlighted).
                        Δpeak is the spring deformation, i.e. the interstorey drift. E is the energy that storey
                        dissipated hysteretically.
                      </p>
                    </Sec>
                  </>
                )
              })()}
              {nl && !nl.inelastic && (
                <Sec grid={false} title="Nonlinear time-history">
                  <p className="text-sm text-slate-600">
                    The frame could not be reduced — every storey needs a positive mass, a finite lateral
                    stiffness and at least one column carrying a plastic moment.
                  </p>
                </Sec>
              )}
            </div>
          )}

          {/* ── DESIGN ── */}
          {tab === 'design' && (
            <div className="divide-y divide-[#eeece5] px-4 py-1">
              <Sec title="Design & optimise">
                <div className="col-span-full flex flex-wrap gap-2">
                  <button type="button" onClick={runPipeline} disabled={!model || !!busy || meshErrors} className={btn}
                    data-tour="design-button">
                    {busy === 'design' ? '⏳ Designing…' : '🏗 Design structure'}
                  </button>
                  <button type="button" onClick={optimize} disabled={!model || !!busy || meshErrors || !optimizeGate.allowed} className={btn}
                    title="Grow each failing member's own section until nothing fails, then trim back">
                    {busy === 'optimize' ? '⏳ Optimizing…' : '🏁 Optimize design'}
                  </button>
                  {!optimizeGate.allowed && <UpgradeNotice compact message={optimizeGate.message} />}
                </div>
                {meshErrors && (
                  <p className="col-span-full text-[11px] font-medium text-red-600">
                    Mesh has errors — fix them in the Analysis tab before designing.
                  </p>
                )}
                {busy && <SolverProgress p={progress} />}
                {busy && (
                  <p className="col-span-full text-[11px] font-medium text-[#0f4c92]">
                    Running in the background — the page stays responsive; results appear when ready.
                  </p>
                )}
                <p className="col-span-full text-[11px] text-slate-500">
                  The full schedules (beam/girder, column, footing) render below, each the full width of the page.
                  Click any schedule row for its step-by-step solution and plan/elevation drawings.
                </p>
              </Sec>
            </div>
          )}

          {tab === 'plans' && model && (
            <div className="px-4 py-3" data-tour="plans-panel">
              <PlansPanel model={model} design={design} soil={soil} />
            </div>
          )}

          {/* ── DISPLAY — the overlays on the 3D view ────────────────────────
              These are VIEW state, and under the canvas they were a stack of
              checkboxes whose legends wrapped inline: five of them pushed the
              model up off the top of the screen, and they scrolled away from
              the view they control. In the panel they sit beside it, and the
              legend of each one gets its own line instead of fighting the
              label for width.

              ITS OWN TAB. Pinned to the top of the panel these cost every other
              tab 300 px of height before its first field; at the foot of it they
              measured 2204 px down the rendered page, which is a control for the
              viewport two screens below the viewport. A tab costs nothing
              anywhere else, and pays for it with a round trip — so the panel
              says what each toggle is WAITING for rather than offering a dead
              checkbox with no explanation. */}
          {tab === 'display' && (
          <div className="divide-y divide-[#eeece5] px-4 py-1" data-tour="display-panel">
            <Sec title="Display" grid={false}>
              <div className="space-y-2.5 text-xs text-slate-600">
                <p className="text-[11px] leading-snug text-slate-500">
                  What the 3D view draws. These apply on every tab.
                </p>
                {/* First, because it governs everything under it: this is HOW
                    the model is drawn, the rest is WHAT is drawn on it. */}
                <div>
                  <p className="mb-1 font-medium">Model</p>
                  <div className="inline-flex rounded-md border border-[#cddcf0] p-0.5">
                    {(['solid', 'wireframe'] as ViewMode[]).map((v) => (
                      <button key={v} type="button" onClick={() => setViewMode(v)}
                        aria-pressed={viewMode === v}
                        className={`rounded px-2.5 py-0.5 text-[11.5px] font-semibold capitalize transition ${
                          viewMode === v ? 'bg-[#0f4c92] text-white' : 'text-[#5c6675] hover:bg-[#eaf1f9]'}`}>
                        {v}
                      </button>
                    ))}
                  </div>
                  {/* Said, not silently done. The buttons keep showing the
                      user's own choice — it comes back when the diagram goes
                      off — so without this line the control looks broken. */}
                  {forceDiag !== null && viewMode === 'solid' && (
                    <p className="mt-1 text-[11px] leading-snug text-slate-500">
                      Drawn wireframe while the {DIAG_LABEL[forceDiag]} diagram is up — the ribbon
                      runs along the member axis, inside its own concrete.
                    </p>
                  )}
                  {drawMode === 'wireframe' && (
                    <p className="mt-1 text-[11px] leading-snug text-slate-500">
                      One line per member, node to node, with a marker at each joint.
                      Members and panels stay clickable.
                    </p>
                  )}
                </div>
                {design && (design.joints.length > 0 || design.beamJoints.length > 0) && (
                  <div>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={showConns} onChange={(e) => setShowConns(e.target.checked)} />
                      Show designed steel connections
                    </label>
                    <Swatches items={[['#334155', 'plates'], ['#d4a017', 'bolts / welds']]} />
                  </div>
                )}
                {design && (
                  <div>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={showFootings} onChange={(e) => setShowFootings(e.target.checked)} />
                      Show designed footings to scale
                    </label>
                    <Swatches items={[['#b45309', 'ok'], ['#dc2626', 'overlap']]} />
                  </div>
                )}
                <div>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={showRebar} onChange={(e) => setShowRebar(e.target.checked)}
                      disabled={!design} />
                    Show reinforcement cages
                  </label>
                  {!design && <p className="pl-6 text-[11px] text-slate-400">design the structure first</p>}
                  {showRebar && <p className="pl-6 text-[11px] text-slate-400">concrete shown see-through</p>}
                  {showRebar && cagesByKind.size > 0 && (
                    <div className="mt-1.5 pl-6">
                      <div className="mb-1 text-[11px] text-slate-500">Cages to show</div>
                      <div className="flex flex-wrap gap-1.5">
                        {CAGE_KINDS.filter((k) => cagesByKind.has(k)).map((k) => (
                          <label key={k} className={`inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-0.5 text-xs ${
                            cageKinds.includes(k) ? 'border-[#0f4c92] bg-blue-50 text-[#0f4c92]' : 'border-slate-200 text-slate-500'}`}>
                            <input type="checkbox" className="sr-only" checked={cageKinds.includes(k)}
                              onChange={() => toggleCageKind(k)} />
                            {CAGE_KIND_LABEL[k]}
                            <span className="tabular-nums opacity-60">{cagesByKind.get(k)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {showRebar && rebarCages.length > 0 && (
                    <Swatches items={([['top', 'top'], ['bottom', 'bottom'], ['stirrup', 'stirrups'],
                      ['vertical', 'col. verticals'], ['tie', 'ties'], ['mat', 'footing mat'], ['chair', 'slab chairs']] as const)
                      .map(([role, label]) => [REBAR_ROLE_COLOR[role], label] as const)} />
                  )}
                  {showRebar && rebarNotes.length > 0 && (
                    <div className="mt-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-900">
                      <div className="font-medium">What the detailing had to decide</div>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {rebarNotes.map(([note, at]) => (
                          <li key={note}>
                            <span className="font-mono">{at.slice(0, 4).join(', ')}{at.length > 4 ? ` +${at.length - 4} more` : ''}</span>
                            {' — '}{note}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={showLoads} onChange={(e) => setShowLoads(e.target.checked)} />
                    Show load diagrams on the model
                  </label>
                  {showLoads && model && model.loads.length > 0 && (
                    <Swatches items={[...new Set(model.loads.map((l) => l.cat))]
                      .map((cat) => [LOAD_COLOR[cat] ?? '#64748b', cat] as const)} />
                  )}
                </div>
                {!design && (
                  <p className="rounded border border-[#e3e1da] bg-[#faf9f6] px-2 py-1.5 text-[11px] leading-snug text-slate-500">
                    Footings, steel connections and the bar cages appear here once the
                    structure has been designed — they are drawn from the design, so
                    there is nothing to draw until it has run.
                  </p>
                )}
                {/* THE CONTROL STAYS, DISABLED — it does not disappear.
                    An option that vanishes when it cannot be used tells you
                    nothing: you cannot tell whether the app has no force
                    diagrams, or has them somewhere else, or wants something
                    from you first. The reinforcement-cage option beside it
                    already greys out and says "design the structure first";
                    this is the same, in the same place, for the same reason.

                    Says "again" because designing legitimately CLEARS the
                    analysis: the pipeline re-applies the section materials and
                    rebuilds the loads, so the model it saves is not the one the
                    earlier run solved. Without that, the hint tells someone who
                    has just pressed Analyze that they have not — which is how
                    it read the first time it was measured. */}
                <div className="border-t border-[#eeece5] pt-2.5">
                  <p className="mb-1 font-medium">Force diagram</p>
                  <div className={`flex flex-wrap items-center gap-1 ${govRes ? '' : 'opacity-45'}`}>
                    <button type="button" onClick={() => setForceDiag(null)} disabled={!govRes}
                      className={`rounded px-1.5 py-0.5 font-semibold ${forceDiag === null ? 'bg-slate-200 text-slate-700' : 'text-slate-500 hover:text-slate-600'} disabled:cursor-not-allowed disabled:hover:text-slate-500`}>off</button>
                    {(['N', 'Vy', 'Vz', 'My', 'Mz', 'T'] as DiagramComp[]).map((c) => (
                      <button key={c} type="button" onClick={() => setForceDiag(c)} disabled={!govRes}
                        title={govRes ? `Draw ${c} on every member (governing combo)` : 'Needs analysis results'}
                        className="rounded px-1.5 py-0.5 font-semibold transition disabled:cursor-not-allowed"
                        style={forceDiag === c
                          ? { background: DIAG_COLOR[c], color: '#fff' }
                          : { color: DIAG_COLOR[c] }}>
                        {DIAG_LABEL[c]}
                      </button>
                    ))}
                  </div>
                  {!govRes && (
                    <p className="mt-1 text-[11px] text-slate-400">
                      analyse the model first — designing rebuilds the loads, so analyse again after it
                    </p>
                  )}
                  {govRes && forceDiag && (
                    <label className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-slate-500">scale</span>
                      <input type="range" min={0.3} max={3} step={0.1} value={forceDiagScale}
                        onChange={(e) => setForceDiagScale(Number(e.target.value))} className="h-1 flex-1" />
                    </label>
                  )}
                </div>
              </div>
            </Sec>
          </div>
          )}

          {tab === 'projects' && (
            <div data-tour="projects-panel"><ProjectsPanel /></div>
          )}

        </div>
      </div>

      {tour.on && (
        <GuidedTour step={tour.step} index={tour.at} total={tour.total}
          onNext={tour.next} onPrev={tour.prev} onClose={tour.close} />
      )}

      {/* ── Optimisation log (full width) ── */}
      {opt && (() => {
        const sizesFor = (role: MemberRole) => {
          const ids = new Set(opt.model.members.filter((m) => m.role === role).map((m) => m.section))
          return [...new Set(opt.model.sections.filter((s) => ids.has(s.id) && s.material !== 'steel').map((s) => s.name))].join(', ') || '—'
        }
        const steelColShapes  = [...new Set(opt.design.steelColumns.map((c) => c.shape))].join(', ')
        const steelBeamShapes = [...new Set(opt.design.steelBeams.map((b) => b.shape))].join(', ')
        const hasSteelCols    = opt.design.steelColumns.length > 0
        const hasSteelBeams   = opt.design.steelBeams.length > 0
        const steelOK         = opt.design.steelBeams.every((b) => b.ok) && opt.design.steelColumns.every((c) => c.ok)
        const steelKg         = opt.design.totals.steelKg
        return (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-1 text-[1.02rem] font-bold text-[#0f4c92]">
              Optimization — {opt.converged
                ? `converged in ${opt.steps.length} step${opt.steps.length === 1 ? '' : 's'}`
                : 'did NOT converge'}
            </h3>
            {!opt.converged && (
              <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                {opt.stopReason ?? 'iteration cap hit — check spans/loads'}
              </p>
            )}
            <div className="mb-2 space-y-0.5 text-xs text-slate-500">
              <p>Concrete — <b>columns</b> {sizesFor('column')} · <b>girders</b> {sizesFor('girder')} · <b>beams</b> {sizesFor('beam')}</p>
              {(hasSteelBeams || hasSteelCols) && (
                <p>
                  {'Structural steel — '}
                  {[
                    hasSteelCols  ? `columns: ${steelColShapes}` : '',
                    hasSteelBeams ? `beams/girders: ${steelBeamShapes}` : '',
                  ].filter(Boolean).join(' · ')}
                  {` · ${(steelKg / 1000).toFixed(2)} t · `}
                  <span className={steelOK ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                    {steelOK ? '✓ all steel OK' : '✗ steel check fails'}
                  </span>
                </p>
              )}
            </div>
            <table className="w-auto border-collapse text-xs">
              <thead>
                <tr className="text-left uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-4 font-semibold">Step</th>
                  <th className="py-1 pr-4 text-right font-semibold">Members grown</th>
                  <th className="py-1 pr-4 text-right font-semibold">Failing</th>
                  <th className="py-1 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {opt.steps.map((s, i) => (
                  <tr key={i} className={`border-t border-slate-100 ${s.ok ? '' : 'bg-red-50 text-red-700'}`}>
                    <td className="py-0.5 pr-4">{i + 1}</td>
                    <td className="py-0.5 pr-4 text-right">{s.grown || '—'}</td>
                    <td className="py-0.5 pr-4 text-right">{s.fails}</td>
                    <td className="py-0.5">{s.ok ? '✓ all pass' : '✗ grow failing'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })()}

      {/* ── Schedules (full width, stacked) ── */}
      {design && (() => {
        // consolidated-report templates expand every row, filtering content
        const reportOpen = report !== '' && report !== 'schedules'
        const wantSol = report === '' || report === 'full' || report === 'solutions' || report === 'sol-only'
        const wantDraw = report === '' || report === 'full' || report === 'drawings' || report === 'draw-only'
        const tablesHidden = report === 'sol-only' || report === 'draw-only'   // *-only: no schedule tables
        const props = reportProps(design)
        return (
        <div className={`mt-6 space-y-6 ${tablesHidden ? 'report-no-tables' : ''}`}>
          {/* PAGE 1 — header + 3D model snapshot */}
          <h2 className="text-xl font-extrabold tracking-tight text-[#0f4c92]">
            Structure design — {design.govName} governs
            <span className="ml-3 text-sm font-normal text-slate-500">
              concrete ≈ {f1(design.totals.concrete)} m³ ({f1(design.totals.concreteMembers)} members + {f1(design.totals.concreteSlabs)} slabs)
              {design.totals.steelKg > 0 && ` · steel ${(design.totals.steelKg / 1000).toFixed(2)} t`}
            </span>
          </h2>
          {design.pDeltaIssues.length > 0 && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-bold">⚠ P-Δ did not converge for {design.pDeltaIssues.length} load case(s) — forces from these runs are unreliable (possible elastic instability).</p>
              <ul className="mt-1 list-inside list-disc">
                {design.pDeltaIssues.map((n) => <li key={n}><span className="font-mono">{n}</span></li>)}
              </ul>
            </div>
          )}
          {design.unchecked.length > 0 && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-bold">⚠ {design.unchecked.length} member(s) could NOT be design-checked — the result is not a passing design.</p>
              <ul className="mt-1 list-inside list-disc">
                {design.unchecked.map((u) => (
                  <li key={u.id}><span className="font-mono">{u.id}</span> ({u.role}, {u.shape}) — {u.reason}</li>
                ))}
              </ul>
            </div>
          )}
          <LetterheadCard lh={lh} onChange={(p) => setLh((s) => ({ ...s, ...p }))} />
          {/* Results tabs — Schedules · Bill of Quantities · Construction Schedule */}
          <div className="no-print flex flex-wrap items-center gap-1.5 border-b border-slate-200" data-tour="results-tabs">
            {([['schedules', 'Schedules'], ['boq', 'Bill of Quantities'], ['schedule', 'Construction Schedule']] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setResultsTab(id)}
                className={`rounded-t-md px-3.5 py-2 text-[13px] font-semibold ${resultsTab === id ? 'border-b-2 border-[#0f4c92] text-[#0f4c92]' : 'text-slate-500 hover:text-[#0f4c92]'}`}>
                {label}
              </button>
            ))}
            <button type="button" onClick={() => void exportPdf()} disabled={exporting || !reportsGate.allowed}
              title={reportsGate.allowed ? 'Download the calculation report as a PDF' : reportsGate.message}
              className="mb-1 ml-auto rounded-md bg-[#0f4c92] px-4 py-2 text-[12.5px] font-bold text-white hover:bg-[#0d3f78] disabled:opacity-40">
              {exporting ? '⏳ Building PDF…' : '⎙ Export PDF report'}
            </button>
          </div>

          {resultsTab === 'schedules' && (<>
          <p className="text-xs text-slate-500">
            Envelope of <b>{design.cases.length}</b> load case{design.cases.length === 1 ? '' : 's'} (NSCP combinations × lateral directions).
            Each element is designed for its own governing case, shown in the “Case” column. Click any row for its worked solution.
          </p>

          {/* PAGE 2+ — project & design inputs (every template) */}
          <div className="break-before-page rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Project &amp; design inputs</h3>
            <table className="w-full border-collapse text-xs">
              <tbody>
                {props.map(([k, v]) => (
                  <tr key={k} className="border-t border-slate-100">
                    <td className="w-44 py-1 pr-3 font-semibold text-slate-600">{k}</td>
                    <td className="py-1 text-slate-700">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Beam & girder schedule — RC only */}
          {design.beams.length > 0 && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">RC beam & girder schedule<SchedChip items={design.beams} ok={(b) => b.ok} /></h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-2 font-semibold">Member</th>
                  <th className="py-1 pr-2 font-semibold">Section</th>
                  <th className="py-1 pr-2 text-right font-semibold">Mu (kN·m)</th>
                  <th className="py-1 pr-2 text-right font-semibold">Vu (kN)</th>
                  <th className="py-1 pr-2 font-semibold">Mode</th>
                  <th className="py-1 pr-2 font-semibold">Tension</th>
                  <th className="py-1 pr-2 font-semibold">Stirrups</th>
                  <th className="py-1 font-semibold">Case</th>
                </tr>
              </thead>
              <tbody>
                {design.beams.flatMap((bm) => bm.sections.flatMap((s, k) => {
                  const d = s.design
                  const bad = !(d.flexOK && d.comprEffective && d.comprNAOK && d.region !== 'inadequate')
                  const key = `beam:${bm.id}:${k}`
                  const open = expanded === key || reportOpen
                  const sec = sectionFor(bm.id)
                  return [
                    <tr key={key} onClick={() => setExpanded(expanded === key ? null : key)}
                      className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${bad ? 'bg-red-50 text-red-700' : ''}`}>
                      <td className="py-1 pr-2 font-medium">
                        {k === 0 ? `${open ? '▾' : '▸'} ${bm.id} (${bm.role} ${sec?.name ?? ''}, ${f1(bm.L)} m)` : ''}
                        {k === 0 && bm.deflection && (
                          <span className={`ml-1.5 whitespace-nowrap rounded px-1 py-px text-[10px] font-semibold ${
                            bm.deflection.liveOK && bm.deflection.totalOK ? 'bg-emerald-50 text-emerald-700' : 'bg-red-100 text-red-700'}`}
                            title={`§424.2 total deflection ${f1(bm.deflection.deltaTotal)} mm vs L/240 = ${f1(bm.deflection.limitL240)} mm`}>
                            δ {f1(bm.deflection.deltaTotal)}/{f1(bm.deflection.limitL240)}
                          </span>
                        )}
                      </td>
                      <td className="py-1 pr-2">{s.label}{s.hogging ? ' (hog)' : s.bf ? ` · T bf=${Math.round(s.bf)}` : ''}</td>
                      <td className="py-1 pr-2 text-right">{f1(Math.abs(s.Mu))}</td>
                      <td className="py-1 pr-2 text-right">{f1(s.Vu)}</td>
                      <td className="py-1 pr-2">{d.mode}</td>
                      <td className="py-1 pr-2">{d.bars}⌀{sec?.barDia}{d.layers.length > 1 ? ` (${d.layers.join('+')})` : ''}{s.hogging ? ' top' : ''}</td>
                      <td className="py-1 pr-2">{d.sAdopt > 0 ? `${d.legs}L@${Math.round(d.sAdopt)}` : d.region === 'none' ? 'none' : '⚠'}</td>
                      <td className="py-1 text-slate-500">{k === 0 ? bm.gov : ''}</td>
                    </tr>,
                    open && model && sec && (
                      <tr key={`${key}:sol`}>
                        <td colSpan={8} className="bg-slate-50/60 px-2 pb-2">
                          {k === 0 && bm.deflection && <BeamServiceability r={bm.deflection} id={bm.id} L={bm.L} />}
                          {wantDraw && bm.diag && (
                            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                              <Diagram xs={bm.diag.xs} ys={loadFromShear(bm.diag.xs, bm.diag.Vy)} title="LOAD w (≈ −dV/dx)" unit="kN/m"
                                color="#475569" vlines={[{ x: s.x, label: s.label.split(' ')[0] }]} />
                              <Diagram xs={bm.diag.xs} ys={bm.diag.Vy} title="SHEAR Vy" unit="kN"
                                color="#1f77b4" vlines={[{ x: s.x, label: s.label.split(' ')[0] }]} />
                              <Diagram xs={bm.diag.xs} ys={bm.diag.Mz} title="MOMENT Mz (+sag)" unit="kN·m"
                                color="#d62728" vlines={[{ x: s.x, label: s.label.split(' ')[0] }]} />
                            </div>
                          )}
                          {wantDraw && elevationOf.get(bm.id) && (
                            <div className="mb-3 overflow-x-auto rounded-lg border border-slate-200 bg-white p-3">
                              <BeamElevationFigure
                                bundle={elevationOf.get(bm.id)!}
                                zone={beamZone(bm, k)}
                                label={`${bm.id} · ${s.label}`}
                              />
                            </div>
                          )}
                          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.7fr_1fr]">
                            {wantSol && <WorkedSolution steps={beamSectionSolution(sec, s)} title={`${bm.id} · ${s.label} — worked solution`} />}
                            {wantDraw && (
                            <div className="space-y-3 self-start rounded-lg border border-slate-200 bg-white p-3">
                              <div>
                                <BeamCageSection model={model} cages={scheduleCages} beam={bm} sec={s} rect={sec} />
                              </div>
                            </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ),
                  ]
                }))}
              </tbody>
            </table>
          </div>}

          {/* Prestressed member checks */}
          {design.prestressed.length > 0 && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Prestressed member checks (§24.5 · PCI)<SchedChip items={design.prestressed} ok={(pr) => pr.ok} /></h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-2 font-semibold">Member</th>
                  <th className="py-1 pr-2 text-right font-semibold">Loss %</th>
                  <th className="py-1 pr-2 text-right font-semibold">fse (MPa)</th>
                  <th className="py-1 pr-2 font-semibold">Transfer</th>
                  <th className="py-1 pr-2 font-semibold">Service</th>
                  <th className="py-1 pr-2 text-right font-semibold">φMn / Mu</th>
                  <th className="py-1 pr-2 font-semibold">1.2Mcr</th>
                  <th className="py-1 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {design.prestressed.map((pr) => (
                  <tr key={pr.id} className={`border-t border-slate-100 ${pr.ok ? '' : 'bg-red-50 text-red-700'}`}>
                    <td className="py-1 pr-2 font-medium">{pr.id} ({f1(pr.L)} m)</td>
                    <td className="py-1 pr-2 text-right">{pr.design.lossPct.toFixed(1)}</td>
                    <td className="py-1 pr-2 text-right">{f1(pr.design.fse)}</td>
                    <td className="py-1 pr-2">{pr.design.transferOK ? '✓' : '✗'}</td>
                    <td className="py-1 pr-2">{pr.design.serviceOK ? '✓' : '✗'}</td>
                    <td className="py-1 pr-2 text-right">{f1(pr.design.phiMn)} / {f1(pr.design.Mu)}</td>
                    <td className="py-1 pr-2">{pr.design.crackingOK ? '✓' : '✗'}</td>
                    <td className="py-1">{pr.ok ? '✓ OK' : '✗ FAILS'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}

          {/* Column schedule (full width) — RC only */}
          {design.columns.length > 0 && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">RC column schedule<SchedChip items={design.columns} ok={(c) => c.ok} /></h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-2 font-semibold">Column</th>
                  <th className="py-1 pr-2 font-semibold">Section</th>
                  <th className="py-1 pr-2 text-right font-semibold">Pu (kN)</th>
                  <th className="py-1 pr-2 text-right font-semibold" title="Strong-axis moment, about h (from Mz)">Mux</th>
                  <th className="py-1 pr-2 text-right font-semibold" title="Weak-axis moment, about b (from My). The utilisation is the BIAXIAL check and consumes both.">Muy</th>
                  <th className="py-1 pr-2 font-semibold">Bars</th>
                  <th className="py-1 pr-2 text-right font-semibold">Util</th>
                  <th className="py-1 font-semibold">Case</th>
                </tr>
              </thead>
              <tbody>
                {design.columns.flatMap((c) => {
                  const key = `col:${c.id}`, open = expanded === key || reportOpen
                  const cs = sectionFor(c.id)
                  return [
                    <tr key={key} onClick={() => setExpanded(expanded === key ? null : key)}
                      className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${c.ok ? '' : 'bg-red-50 text-red-700'}`}>
                      <td className="py-1 pr-2 font-medium">{open ? '▾' : '▸'} {c.id}</td>
                      <td className="py-1 pr-2">{cs?.name}</td>
                      <td className="py-1 pr-2 text-right">{f1(c.Pu)}</td>
                      <td className="py-1 pr-2 text-right">{f1(c.Mu)}</td>
                      <td className="py-1 pr-2 text-right">{f1(c.Muy)}</td>
                      <td className="py-1 pr-2">{c.bars}⌀{cs?.barDia} · ties @{Math.round(c.tieSpacingFinal)}{c.seismicSConf !== undefined ? ' ✱' : ''}</td>
                      <td className="py-1 pr-2 text-right" title={`${BIAXIAL_LABEL[c.biaxialMethod]} — φPn ${f1(c.phiPn)} kN`}>
                        {(c.util * 100).toFixed(0)}%
                      </td>
                      <td className="py-1 text-slate-500">{c.gov}</td>
                    </tr>,
                    open && model && cs && (
                      <tr key={`${key}:sol`}>
                        <td colSpan={8} className="bg-slate-50/60 px-2 pb-2">
                          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.7fr_1fr]">
                            {wantSol && <WorkedSolution steps={columnRowSolution(cs, c)} title={`${c.id} — worked solution`} />}
                            {wantDraw && (
                            <div className="space-y-3 self-start rounded-lg border border-slate-200 bg-white p-3">
                              {columnStackOf.get(c.id) && (
                                <ColumnElevationFigure
                                  bundle={columnStackOf.get(c.id)!}
                                  storey={columnStorey(c.id)}
                                  label={c.id}
                                />
                              )}
                              <div className="border-t border-slate-100 pt-2">
                                <ColumnCageSection model={model} cages={scheduleCages} col={c} rect={cs} />
                              </div>
                              {c.seismicSConf !== undefined && (
                                <div className="border-t border-slate-100 pt-2 text-[11px] text-slate-600">
                                  <p className="mb-0.5 font-semibold text-[#0f4c92]">Seismic confinement ({seismicSystem.toUpperCase()})</p>
                                  <p>Confinement zone ℓo = {Math.round(c.seismicLoZone!)} mm</p>
                                  <p>Ties within ℓo @ {Math.round(c.seismicSConf)} mm <span className="text-slate-500">({c.tieSpacingLabel})</span></p>
                                  {c.seismicSOut !== undefined && c.seismicSOut !== c.tieSpacing && (
                                    <p>Ties outside ℓo @ {Math.round(c.seismicSOut)} mm</p>
                                  )}
                                  <p className="mt-0.5 text-slate-500">✱ Seismic controls over §425.7.2 gravity tie spacing ({Math.round(c.tieSpacing)} mm)</p>
                                </div>
                              )}
                            </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ),
                  ]
                })}
              </tbody>
            </table>
          </div>}

          {/* Beam moment-strength ratios — NSCP §418.6.3.2 (SMF) / §418.4.2.2 (IMF) */}
          {momentRatios.length > 0 && report !== 'draw-only' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">
                Beam moment-strength ratios — NSCP {momentRatios[0].ratios.clause}
                <SchedChip items={momentRatios} ok={(r) => r.ratios.ok} />
              </h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Beam</th>
                    <th className="py-1 pr-2 text-right font-semibold">Ln (m)</th>
                    <th className="py-1 pr-2 text-right font-semibold">Mn− / Mn+ face i</th>
                    <th className="py-1 pr-2 text-right font-semibold">Mn− / Mn+ face j</th>
                    <th className="py-1 pr-2 text-right font-semibold">min Mn along</th>
                    <th className="py-1 pr-2 text-right font-semibold">Tightest</th>
                    <th className="py-1 font-semibold">OK</th>
                  </tr>
                </thead>
                <tbody>
                  {momentRatios.map((r) => {
                    const st = r.ratios.stations
                    const a = st[0], z = st[st.length - 1]
                    const along = Math.min(...st.flatMap((x) => [x.MnNeg, x.MnPos]))
                    const util = Math.min(...r.ratios.checks
                      .filter((c) => c.required > 0).map((c) => c.provided / c.required))
                    return (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="py-1 pr-2 font-medium">{r.id}</td>
                        <td className="py-1 pr-2 text-right font-mono">{r.Ln.toFixed(2)}</td>
                        <td className="py-1 pr-2 text-right font-mono">{f1(a.MnNeg)} / {f1(a.MnPos)}</td>
                        <td className="py-1 pr-2 text-right font-mono">{f1(z.MnNeg)} / {f1(z.MnPos)}</td>
                        <td className="py-1 pr-2 text-right font-mono">{f1(along)}</td>
                        <td className="py-1 pr-2 text-right font-mono">{Number.isFinite(util) ? util.toFixed(2) : '—'}</td>
                        <td className={`py-1 font-semibold ${r.ratios.ok ? 'text-emerald-600' : 'text-red-600'}`}>{r.ratios.ok ? '✓' : '✗'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-[10px] text-slate-500">
                Mn+ at a joint face ≥ {momentRatios[0].ratios.system === 'smf' ? '½' : '⅓'}·Mn− there, and Mn
                at ANY section ≥ {momentRatios[0].ratios.system === 'smf' ? '¼' : '⅕'}·the largest Mn at either
                face ({momentRatios[0].ratios.clause}). Measured on the bars as placed — a curtailed bar is
                absent from the sections past its cut-off, which is where the second sentence bites.
              </p>
            </div>
          )}

          {/* Strong-column/weak-beam joint check — NSCP §418.7.3.2 (SMF only) */}
          {design.scwb.length > 0 && report !== 'draw-only' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Strong-column / weak-beam — NSCP §418.7.3.2<SchedChip items={design.scwb} ok={(j) => j.ok} /></h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Joint</th>
                    <th className="py-1 pr-2 text-right font-semibold">ΣMnc (kN·m)</th>
                    <th className="py-1 pr-2 text-right font-semibold">ΣMnb (kN·m)</th>
                    <th className="py-1 pr-2 text-right font-semibold">Ratio</th>
                    <th className="py-1 pr-2 text-right font-semibold">≥ 6/5</th>
                    <th className="py-1 font-semibold">Cols / Beams</th>
                  </tr>
                </thead>
                <tbody>
                  {design.scwb.map((j) => (
                    <tr key={j.node} className="border-t border-slate-100">
                      <td className="py-1 pr-2 font-medium">{j.node}</td>
                      <td className="py-1 pr-2 text-right font-mono">{f1(j.sumMnc)}</td>
                      <td className="py-1 pr-2 text-right font-mono">{f1(j.sumMnb)}</td>
                      <td className="py-1 pr-2 text-right font-mono">{Number.isFinite(j.ratio) ? j.ratio.toFixed(2) : '∞'}</td>
                      <td className={`py-1 pr-2 text-right font-semibold ${j.ok ? 'text-emerald-600' : 'text-red-600'}`}>{j.ok ? '✓' : '✗'}</td>
                      <td className="py-1 text-slate-500">{j.nCols} / {j.nBeams}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[10px] text-slate-500">
                ΣMnc ≥ (6/5)·ΣMnb at each beam-column joint (§418.7.3.2). Column Mnc is taken at the design axial Pu;
                beam Mnb from the heaviest designed tension steel. Failing joints need larger columns or lighter beams.
                {design.scwb.every((j) => j.ok) ? ' All joints satisfy the requirement.' : ' ✗ One or more joints fail.'}
              </p>
            </div>
          )}

          {/* Slab schedule (full width) — two-way DDM */}
          {design.slabs.length > 0 && report !== 'draw-only' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Slab schedule (two-way DDM)<SchedChip items={design.slabs} ok={(x) => x.ok} /></h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Panel</th>
                    <th className="py-1 pr-2 font-semibold">lx × ly (m)</th>
                    <th className="py-1 pr-2 font-semibold">h (mm)</th>
                    <th className="py-1 pr-2 font-semibold">Behaviour</th>
                    <th className="py-1 pr-2 text-right font-semibold">Mo,x / Mo,y (kN·m)</th>
                    <th className="py-1 font-semibold">DDM</th>
                  </tr>
                </thead>
                <tbody>
                  {design.slabs.flatMap((sl) => {
                    const key = `slab:${sl.plate}`, open = expanded === key || (reportOpen && wantSol)
                    const dd = sl.design
                    return [
                      <tr key={key} onClick={() => setExpanded(expanded === key ? null : key)}
                        className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${dd.applicable ? '' : 'bg-amber-50 text-amber-800'}`}>
                        <td className="py-1 pr-2 font-medium">{open ? '▾' : '▸'} {sl.plate}</td>
                        <td className="py-1 pr-2">{f1(sl.lx)} × {f1(sl.ly)}</td>
                        <td className="py-1 pr-2">{Math.round(dd.h)}{dd.h < dd.hmin ? ` (< ${Math.round(dd.hmin)} min)` : ''}</td>
                        <td className="py-1 pr-2">{dd.twoWay ? 'two-way' : 'one-way'}</td>
                        <td className="py-1 pr-2 text-right">{f1(dd.x.Mo)} / {f1(dd.y.Mo)}</td>
                        <td className="py-1">{dd.applicable ? (dd.deflection.totalOK ? '✓' : '⚠ defl') : '⚠ check'}</td>
                      </tr>,
                      open && (
                        <tr key={`${key}:sol`}>
                          <td colSpan={6} className="bg-slate-50/60 px-3 pb-3">
                            {!sl.selection.best && (
                              <div className="mb-3 rounded border border-[#efd4cc] bg-[#fbeeea] px-3 py-2 text-[11.5px] text-[#8f2f1e]">
                                <b>No compliant mat.</b> {sl.selection.margin}
                              </div>
                            )}
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                              {[dd.x, dd.y].map((dr) => (
                                <div key={dr.dir}>
                                  <p className="mb-1 mt-2 text-[12px] font-bold text-[#0f4c92]">
                                    {dr.dir.toUpperCase()}-direction — ℓ1 = {f1(dr.l1)} m, ℓn = {f1(dr.ln)} m, Mo = {f1(dr.Mo)} kN·m
                                  </p>
                                  <table className="w-full border-collapse text-[11px]">
                                    <thead>
                                      <tr className="text-left text-slate-500">
                                        <th className="py-0.5 pr-2">Location</th>
                                        <th className="py-0.5 pr-2 text-right">M (kN·m)</th>
                                        <th className="py-0.5 pr-2">Column strip</th>
                                        <th className="py-0.5">Middle strip</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {dr.locations.map((loc, li) => (
                                        <tr key={li} className="border-t border-slate-100">
                                          <td className="py-0.5 pr-2">{loc.name} <span className="text-slate-500">({loc.coeff.toFixed(2)})</span></td>
                                          <td className="py-0.5 pr-2 text-right">{f1(loc.M)}</td>
                                          {/* When nothing complies there is no mat to quote. Printing the
                                              fallback layout would present a §8.7.2.2 violation as a design. */}
                                          <td className="py-0.5 pr-2">{sl.selection.best
                                            ? `⌀${sl.barDia} @ ${Math.round(loc.column.spacing)}${loc.column.usedMin ? ' (min)' : ''}`
                                            : <span className="text-[#c2402a]">no compliant mat</span>}</td>
                                          <td className="py-0.5">{loc.middle.b > 1
                                            ? (sl.selection.best
                                              ? `⌀${sl.barDia} @ ${Math.round(loc.middle.spacing)}${loc.middle.usedMin ? ' (min)' : ''}`
                                              : <span className="text-[#c2402a]">no compliant mat</span>)
                                            : '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ))}
                            </div>
                            {/* Deflection (Branson Ie + crossing-strip) */}
                            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2">
                              <p className="mb-1 text-[12px] font-bold text-[#0f4c92]">Deflection (NSCP §424.2)</p>
                              <table className="w-full border-collapse text-[11px]">
                                <tbody>
                                  <tr className="border-t border-slate-100">
                                    <td className="py-0.5 pr-2 text-slate-500">Immediate (D+L)</td>
                                    <td className="py-0.5 pr-2 text-right">{dd.deflection.immediate.toFixed(1)} mm</td>
                                    <td className="py-0.5 pr-2 text-slate-500">{dd.deflection.cracked ? 'section cracked (Ie < Ig)' : 'uncracked (Ie = Ig)'}</td>
                                  </tr>
                                  <tr className="border-t border-slate-100">
                                    <td className="py-0.5 pr-2 text-slate-500">Immediate live</td>
                                    <td className="py-0.5 pr-2 text-right">{dd.deflection.immLive.toFixed(1)} mm</td>
                                    <td className={`py-0.5 pr-2 ${dd.deflection.liveOK ? 'text-emerald-600' : 'text-rose-600'}`}>
                                      ≤ ℓn/360 = {dd.deflection.limitLive.toFixed(1)} mm {dd.deflection.liveOK ? '✓' : '✗'}
                                    </td>
                                  </tr>
                                  <tr className="border-t border-slate-100">
                                    <td className="py-0.5 pr-2 text-slate-500">Long-term + live (λΔ = {dd.deflection.lambdaDelta.toFixed(1)})</td>
                                    <td className="py-0.5 pr-2 text-right">{dd.deflection.total.toFixed(1)} mm</td>
                                    <td className={`py-0.5 pr-2 ${dd.deflection.totalOK ? 'text-emerald-600' : 'text-rose-600'}`}>
                                      ≤ ℓn/240 = {dd.deflection.limitTotal.toFixed(1)} mm {dd.deflection.totalOK ? '✓' : '✗'}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            {dd.notes.length > 0 && (
                              <ul className="mt-2 list-disc pl-5 text-[11px] text-slate-500">
                                {dd.notes.map((n, ni) => <li key={ni}>{n}</li>)}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ),
                    ]
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                NSCP §408.10 Direct Design Method: Mo = wu·ℓ2·ℓn²/8 split into negative/positive then column/middle
                strips (αf neglected → conservative slab steel). Column-strip width = 2·min(0.25ℓ1, 0.25ℓ2).
                Deflection per §424.2 (Branson Ie + crossing-strip; λΔ = 2.0).
              </p>
            </div>
          )}

          {/* Shear-wall schedule (full width) — in-plane reinforcement */}
          {design.stairs.length > 0 && report !== 'draw-only' && (
            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Stair schedule<SchedChip items={design.stairs} ok={(st) => st.ok} /></h3>
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    {['Flight', 'Bears on', 'Rise / run (m)', 'Landing (m)', 'Risers', 'R / G (mm)', 'θ', 'Waist', 'Mu (kN·m/m)', 'Main', 'Dist.', 'Reaction D+L (kN)', ''].map((h) => (
                      <th key={h} className="py-1 pr-3 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {design.stairs.map((st) => {
                    const odd = !(st.usable.riserOK && st.usable.goingOK && st.usable.paceOK)
                    return (
                      <tr key={st.id} className="border-b border-slate-100">
                        <td className="py-1 pr-3 font-medium">{st.id}</td>
                        <td className="py-1 pr-3 font-mono text-[12px]">{st.low} → {st.high}</td>
                        <td className="py-1 pr-3">{f2(st.rise)} / {f2(st.run)}</td>
                        <td className="py-1 pr-3" title={st.landings.length
                          ? `${f2(st.flightRun)} m of the run slopes; the slab develops ${f2(st.totalSpan)} m landing to landing`
                          : undefined}>
                          {st.landings.length
                            ? st.landings.map((l) => `${f2(l.depth)} ${l.at}`).join(' + ')
                            : '—'}
                        </td>
                        <td className="py-1 pr-3">{st.risers}</td>
                        <td className={`py-1 pr-3 ${odd ? 'font-semibold text-amber-700' : ''}`}>{f0(st.R)} / {f0(st.G)}</td>
                        <td className="py-1 pr-3">{f1(st.thetaDeg)}°</td>
                        <td className="py-1 pr-3">{st.waist} mm{st.design.tMinOK ? '' : <span className="ml-1 text-red-600" title={`below the ${f0(st.design.tMin)} mm span/depth minimum`}>&lt; min</span>}</td>
                        <td className="py-1 pr-3">{f2(st.design.Mu)}</td>
                        <td className="py-1 pr-3">⌀12 @ {f0(st.design.mainSpacing)}</td>
                        <td className="py-1 pr-3">⌀10 @ {f0(st.design.distSpacing)}</td>
                        <td className="py-1 pr-3">{f1(st.totalD)} + {f1(st.totalL)}</td>
                        <td className="py-1">{st.ok
                          ? <span className="font-semibold text-emerald-600">OK</span>
                          : <span className="font-semibold text-red-600">CHECK</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="mt-1.5 text-[11px] text-slate-500">
                Rise, run, R and G are derived from where the two supporting beams are — R = rise/risers, so the risers are equal by construction. An amber R/G is outside the proportions stairs are usually built in (a comfort read, not a code check). The flight is designed on its PLAN run, which is the length its kPa-of-plan-area load works through — a half-landing does not change that span, only how much of it slopes, and a flat landing is the lighter strip, so the design is conservative on a stair that has one. The reactions are not: they come from the real stepped load. It is not meshed into the frame: it contributes load, not stiffness.
              </p>
            </div>
          )}

          {design.walls.length > 0 && report !== 'draw-only' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Shear-wall schedule (in-plane)<SchedChip items={design.walls} ok={(w) => w.ok} /></h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Wall</th>
                    <th className="py-1 pr-2 font-semibold">ℓw × hw (m)</th>
                    <th className="py-1 pr-2 font-semibold">t (mm)</th>
                    <th className="py-1 pr-2 font-semibold">hw/ℓw</th>
                    <th className="py-1 pr-2 text-right font-semibold">Vu / φVn (kN)</th>
                    <th className="py-1 pr-2 font-semibold">Horiz ρt</th>
                    <th className="py-1 pr-2 font-semibold">Vert ρℓ</th>
                    <th className="py-1 font-semibold">OK</th>
                  </tr>
                </thead>
                <tbody>
                  {design.walls.flatMap((wl) => {
                    const key = `wall:${wl.id}`, open = expanded === key || (reportOpen && wantSol)
                    const wd = wl.design
                    const curt = wd.twoCurtains ? '2 curtains' : '1 curtain'
                    return [
                      <tr key={key} onClick={() => setExpanded(expanded === key ? null : key)}
                        className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${wl.ok ? '' : 'bg-rose-50 text-rose-700'}`}>
                        <td className="py-1 pr-2 font-medium">{open ? '▾' : '▸'} {wl.id} <span className="text-slate-500">({wl.member})</span></td>
                        <td className="py-1 pr-2">{f1(wl.lw)} × {f1(wl.hw)}</td>
                        <td className="py-1 pr-2">{Math.round(wl.thickness)}</td>
                        <td className="py-1 pr-2">{wd.aspect.toFixed(2)}</td>
                        <td className="py-1 pr-2 text-right">{f1(wl.Vu)} / {f1(wd.phiVn)}</td>
                        <td className="py-1 pr-2">⌀12 @ {Math.round(wd.horiz.spacing)}{wd.horiz.usedMin ? ' (min)' : ''}</td>
                        <td className="py-1 pr-2">⌀12 @ {Math.round(wd.vert.spacing)}{wd.vert.usedMin ? ' (min)' : ''}</td>
                        <td className="py-1">{wl.ok ? '✓' : '✗'}</td>
                      </tr>,
                      open && (
                        <tr key={`${key}:sol`}>
                          <td colSpan={8} className="bg-slate-50/60 px-3 pb-3">
                            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] sm:grid-cols-3">
                              <div><span className="text-slate-500">Acv</span> = {Math.round(wd.Acv)} mm²</div>
                              <div><span className="text-slate-500">αc</span> = {wd.alphaC.toFixed(2)}</div>
                              <div><span className="text-slate-500">Curtains</span>: {curt}</div>
                              <div><span className="text-slate-500">Vn cap (0.83·Acv√fc)</span> = {f1(wd.VnCap)} kN</div>
                              <div><span className="text-slate-500">ρt req</span> = {wd.horiz.rhoReq.toFixed(4)}</div>
                              <div><span className="text-slate-500">s,max</span> = {Math.round(wd.sMax)} mm</div>
                              <div><span className="text-slate-500">Boundary elements</span>: {wd.boundaryElement ? 'required' : 'not indicated'}</div>
                              <div><span className="text-slate-500">Governing case</span>: {wl.gov || '—'}</div>
                            </div>
                            {wd.notes.length > 0 && (
                              <ul className="mt-2 list-disc pl-5 text-[11px] text-slate-500">
                                {wd.notes.map((n, ni) => <li key={ni}>{n}</li>)}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ),
                    ]
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                NSCP §418.10: Vn = Acv(αc·λ√f′c + ρt·fy), φ = 0.75, capped at 0.83·Acv·√f′c. In-plane shear from the
                enveloped strut forces; distributed web steel ρt, ρℓ ≥ 0.0025. Flexural boundary reinforcement designed separately.
              </p>
            </div>
          )}

          {/* Steel beam schedule (full width) — only when steel members exist */}
          {/* Timber beam / girder schedule */}
          {design.woodBeams.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Timber beam / girder schedule — NDS §3.3/§3.4 (NSCP §6, LRFD)<SchedChip items={design.woodBeams} ok={(b) => b.ok} /></h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Beam</th>
                    <th className="py-1 pr-2 font-semibold">b×d (mm)</th>
                    <th className="py-1 pr-2 font-semibold">Grade</th>
                    <th className="py-1 pr-2 text-right font-semibold">Mu (kN·m)</th>
                    <th className="py-1 pr-2 text-right font-semibold">F′b (MPa)</th>
                    <th className="py-1 pr-2 text-right font-semibold">CL</th>
                    <th className="py-1 pr-2 text-right font-semibold">util M</th>
                    <th className="py-1 pr-2 text-right font-semibold">util V</th>
                    <th className="py-1 font-semibold">Case</th>
                  </tr>
                </thead>
                <tbody>
                  {design.woodBeams.flatMap((b) => {
                    const key = `wbeam:${b.id}`, open = expanded === key || reportOpen
                    return [
                      <tr key={key} onClick={() => setExpanded(expanded === key ? null : key)}
                        className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${b.ok ? '' : 'bg-red-50 text-red-700'}`}>
                        <td className="py-1 pr-2 font-medium">{open ? '▾' : '▸'} {b.id}</td>
                        <td className="py-1 pr-2 font-mono">{b.b}×{b.d}</td>
                        <td className="py-1 pr-2" title={WOOD_SPECIES[b.species]?.label ?? b.species}>{b.species}{b.kind === 'glulam' ? ' (GL)' : ''}</td>
                        <td className="py-1 pr-2 text-right">{f1(b.Mu)}</td>
                        <td className="py-1 pr-2 text-right">{b.FbPrime.toFixed(2)}</td>
                        <td className="py-1 pr-2 text-right">{b.CL.toFixed(2)}</td>
                        <td className={`py-1 pr-2 text-right font-semibold ${b.utilM > 1 ? 'text-red-600' : b.utilM > 0.9 ? 'text-amber-600' : 'text-green-700'}`}>{(b.utilM * 100).toFixed(0)}%</td>
                        <td className={`py-1 pr-2 text-right font-semibold ${b.utilV > 1 ? 'text-red-600' : b.utilV > 0.9 ? 'text-amber-600' : 'text-green-700'}`}>{(b.utilV * 100).toFixed(0)}%</td>
                        <td className="py-1 text-[11px] text-slate-500">{b.gov}</td>
                      </tr>,
                      open && wantSol && (
                        <tr key={`${key}:sol`}>
                          <td colSpan={9} className="bg-slate-50/60 px-2 pb-2">
                            <WorkedSolution steps={woodBeamRowSolution(b)} title={`${b.id} — worked solution`} />
                          </td>
                        </tr>
                      ),
                    ]
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                fb = M/S ≤ F′b (§3.3, beam stability CL §3.3.3); fv = 1.5V/A ≤ F′v (§3.4). Reference values adjusted by
                CD→λ, CM, CF/CV and converted to LRFD via Appendix N (KF·φ·λ). le auto per §3.3.3.
              </p>
            </div>
          )}
          {/* Timber column schedule */}
          {design.woodColumns.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Timber column schedule — NDS §3.7 + §3.9 (NSCP §6, LRFD)<SchedChip items={design.woodColumns} ok={(c) => c.ok} /></h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Column</th>
                    <th className="py-1 pr-2 font-semibold">b×d (mm)</th>
                    <th className="py-1 pr-2 font-semibold">Grade</th>
                    <th className="py-1 pr-2 text-right font-semibold">Pu (kN)</th>
                    <th className="py-1 pr-2 text-right font-semibold">Mu (kN·m)</th>
                    <th className="py-1 pr-2 text-right font-semibold">F′c (MPa)</th>
                    <th className="py-1 pr-2 text-right font-semibold">CP</th>
                    <th className="py-1 pr-2 text-right font-semibold">le/d</th>
                    <th className="py-1 pr-2 text-right font-semibold">Ratio</th>
                    <th className="py-1 font-semibold">Case</th>
                  </tr>
                </thead>
                <tbody>
                  {design.woodColumns.flatMap((c) => {
                    const key = `wcol:${c.id}`, open = expanded === key || reportOpen
                    return [
                      <tr key={key} onClick={() => setExpanded(expanded === key ? null : key)}
                        className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${c.ok ? '' : 'bg-red-50 text-red-700'}`}>
                        <td className="py-1 pr-2 font-medium">{open ? '▾' : '▸'} {c.id}</td>
                        <td className="py-1 pr-2 font-mono">{c.b}×{c.d}</td>
                        <td className="py-1 pr-2" title={WOOD_SPECIES[c.species]?.label ?? c.species}>{c.species}{c.kind === 'glulam' ? ' (GL)' : ''}</td>
                        <td className="py-1 pr-2 text-right">{f1(c.Pu)}</td>
                        <td className="py-1 pr-2 text-right">{f1(c.Mu)}</td>
                        <td className="py-1 pr-2 text-right">{c.FcPrime.toFixed(2)}</td>
                        <td className="py-1 pr-2 text-right">{c.CP.toFixed(2)}</td>
                        <td className="py-1 pr-2 text-right">{c.slenderness.toFixed(0)}</td>
                        <td className={`py-1 pr-2 text-right font-semibold ${c.ratio > 1 ? 'text-red-600' : c.ratio > 0.9 ? 'text-amber-600' : 'text-green-700'}`}>{(c.ratio * 100).toFixed(0)}%</td>
                        <td className="py-1 text-[11px] text-slate-500">{c.gov}</td>
                      </tr>,
                      open && wantSol && (
                        <tr key={`${key}:sol`}>
                          <td colSpan={10} className="bg-slate-50/60 px-2 pb-2">
                            <WorkedSolution steps={woodColumnRowSolution(c)} title={`${c.id} — worked solution`} />
                          </td>
                        </tr>
                      ),
                    ]
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                fc = P/A ≤ F′c with column stability CP (§3.7.1, governing plane le/d); beam-column members add the §3.9.2
                interaction (fc/F′c)² + fb/[F′b(1 − fc/FcE)]. Ratio = governing of the two.
              </p>
            </div>
          )}
          {design.steelBeams.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Steel beam / girder schedule — AISC 360-16 LRFD<SchedChip items={design.steelBeams} ok={(b) => b.ok} /></h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Member</th>
                    <th className="py-1 pr-2 font-semibold">Shape</th>
                    <th className="py-1 pr-2 text-right font-semibold">Mu (kN·m)</th>
                    <th className="py-1 pr-2 text-right font-semibold">φMn</th>
                    <th className="py-1 pr-2 font-semibold">LTB</th>
                    <th className="py-1 pr-2 text-right font-semibold">Vu (kN)</th>
                    <th className="py-1 pr-2 text-right font-semibold">φVn</th>
                    <th className="py-1 pr-2 text-right font-semibold">δ est.</th>
                    <th className="py-1 pr-2 text-right font-semibold">Util</th>
                    <th className="py-1 font-semibold">Case</th>
                  </tr>
                </thead>
                <tbody>
                  {design.steelBeams.flatMap((b) => {
                    const key = `beam-${b.id}`
                    const open = expanded === key
                    const util = Math.max(b.utilM, b.utilV, b.deflLim > 0 ? b.defl / b.deflLim : 0)
                    const rows = [
                      <tr key={b.id}
                        className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50 ${b.ok ? '' : 'bg-red-50 text-red-700'}`}
                        onClick={() => setExpanded(open ? null : key)}>
                        <td className="py-1 pr-2 font-medium">{b.id} <span className="text-slate-500">{open ? '▲' : '▼'}</span></td>
                        <td className="py-1 pr-2 font-mono">{b.shape}</td>
                        <td className="py-1 pr-2 text-right">{f1(b.Mu)}</td>
                        <td className="py-1 pr-2 text-right">{f1(b.phiMn)}</td>
                        <td className="py-1 pr-2">{b.ltbZone}</td>
                        <td className="py-1 pr-2 text-right">{f1(b.Vu)}</td>
                        <td className="py-1 pr-2 text-right">{f1(b.phiVn)}</td>
                        <td className={`py-1 pr-2 text-right font-mono ${b.deflOK ? 'text-slate-700' : 'text-red-600 font-semibold'}`}>{b.defl.toFixed(1)}</td>
                        <td className={`py-1 pr-2 text-right font-semibold ${util > 1 ? 'text-red-600' : util > 0.9 ? 'text-amber-600' : 'text-green-700'}`}>{(util * 100).toFixed(0)}%</td>
                        <td className="py-1 text-[11px] text-slate-500">{b.gov}</td>
                      </tr>,
                    ]
                    if (open) rows.push(
                      <tr key={`${b.id}-sol`}>
                        <td colSpan={10} className="bg-slate-50 px-4 py-3">
                          <div className="flex flex-wrap gap-6">
                            {/* W-shape cross-section drawing */}
                            <div className="shrink-0">
                              <WShapeSection shape={b.shape} d={b.d} bf={b.bf} tf={b.tf} tw={b.tw} />
                            </div>
                            {/* Section properties */}
                            <div className="min-w-[160px]">
                              <p className="mb-1 text-[11px] font-bold text-slate-600 uppercase tracking-wide">Section properties</p>
                              <table className="text-[11px] leading-5">
                                <tbody>
                                  {[['d', `${b.d.toFixed(1)} mm`], ['bf', `${b.bf.toFixed(1)} mm`], ['tf', `${b.tf.toFixed(1)} mm`], ['tw', `${b.tw.toFixed(1)} mm`],
                                    ['Ix', `${(b.Ix / 1e6).toFixed(1)} ×10⁶ mm⁴`], ['Sx', `${(b.Sx / 1e3).toFixed(0)} ×10³ mm³`],
                                    ['Zx', `${(b.Zx / 1e3).toFixed(0)} ×10³ mm³`], ['Iy', `${(b.Iy / 1e6).toFixed(1)} ×10⁶ mm⁴`], ['ry', `${b.ry.toFixed(1)} mm`],
                                  ].map(([lbl, val]) => (
                                    <tr key={lbl}><td className="pr-3 text-slate-500">{lbl}</td><td className="font-mono">{val}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* §F2 Flexure check */}
                            <div className="min-w-[200px]">
                              <p className="mb-1 text-[11px] font-bold text-slate-600 uppercase tracking-wide">§F2 Flexure</p>
                              <table className="text-[11px] leading-5">
                                <tbody>
                                  {[
                                    ['Mp = Fy·Zx', `${f1(b.Mp)} kN·m`],
                                    ['Lp', `${(b.Lp / 1000).toFixed(2)} m`],
                                    ['Lr', `${(b.Lr / 1000).toFixed(2)} m`],
                                    ['Lb', `${(b.Lb / 1000).toFixed(2)} m`],
                                    ['LTB zone', b.ltbZone],
                                    ['Mn', `${f1(b.Mn)} kN·m`],
                                    ['φMn (φ=0.9)', `${f1(b.phiMn)} kN·m`],
                                    ['Mu', `${f1(b.Mu)} kN·m`],
                                    ['Util (M)', `${(b.utilM * 100).toFixed(1)}%`],
                                    ['Flange (B4.1b)', `${b.flangeClass}  λf=${b.lambdaF.toFixed(1)} · λpf=${b.lambdaPF.toFixed(1)} · λrf=${b.lambdaRF.toFixed(1)}`],
                                    ['Web (B4.1b)', `${b.webClass}  λw=${b.lambdaW.toFixed(1)} · λpw=${b.lambdaPW.toFixed(1)} · λrw=${b.lambdaRW.toFixed(1)}`],
                                    ['Clause', `§${b.clause} — ${b.governing} governs`],
                                    ...(Number.isFinite(b.MnFLB) ? [['Mn (FLB, §F3.2)', `${f1(b.MnFLB)} kN·m`]] : []),
                                  ].map(([lbl, val]) => (
                                    <tr key={lbl}><td className="pr-3 text-slate-500">{lbl}</td><td className="font-mono">{val}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* §G2.1 Shear check */}
                            <div className="min-w-[180px]">
                              <p className="mb-1 text-[11px] font-bold text-slate-600 uppercase tracking-wide">§G2.1 Shear</p>
                              <table className="text-[11px] leading-5">
                                <tbody>
                                  {[
                                    ['Aw = d·tw', `${(b.Aw).toFixed(0)} mm²`],
                                    ['h/tw', `${b.hwTw.toFixed(1)}`],
                                    ['Cv1', `${b.Cv1.toFixed(3)}`],
                                    ['φV (φ=1.0)', b.phiV.toFixed(2)],
                                    ['φVn', `${f1(b.phiVn)} kN`],
                                    ['Vu', `${f1(b.Vu)} kN`],
                                    ['Util (V)', `${(b.utilV * 100).toFixed(1)}%`],
                                  ].map(([lbl, val]) => (
                                    <tr key={lbl}><td className="pr-3 text-slate-500">{lbl}</td><td className="font-mono">{val}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* §L2 Serviceability — deflection */}
                            <div className="min-w-[180px]">
                              <p className="mb-1 text-[11px] font-bold text-slate-600 uppercase tracking-wide">§L2 Serviceability</p>
                              <table className="text-[11px] leading-5">
                                <tbody>
                                  {[
                                    ['δ est. (SS bound)', `${b.defl.toFixed(1)} mm`],
                                    ['L/240 limit', `${b.deflLim.toFixed(1)} mm`],
                                    ['δ / limit', `${b.deflLim > 0 ? ((b.defl / b.deflLim) * 100).toFixed(1) : '—'}%`],
                                    ['OK?', b.deflOK ? '✓ Pass' : '✗ Fail'],
                                  ].map(([lbl, val]) => (
                                    <tr key={lbl}><td className="pr-3 text-slate-500">{lbl}</td><td className={`font-mono ${lbl === 'OK?' && !b.deflOK ? 'text-red-600 font-bold' : ''}`}>{val}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          <p className="mt-2 text-[10px] text-slate-500">Lb = member brace spacing (set per-member in Geometry → Properties; blank = full length, conservative). Cb = 1.0. φ = 0.9 (flexure), 1.0 (shear, doubly-symmetric I). δ est. = 5Mu·L²/(48·E·Ix), SS bound vs L/240.</p>
                        </td>
                      </tr>
                    )
                    return rows
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                §F2 flexure (Lb = full member length, conservative; Cb = 1.0), §G2.1 shear, §L2 serviceability (δ est. = 5Mu·L²/48EI vs L/240). δ est. column shows estimated midspan deflection (mm) — red if &gt; L/240. Util = max(Mu/φMn, Vu/φVn, δ/lim). Click a row to expand.
              </p>
            </div>
          )}

          {/* Steel column schedule (full width) */}
          {design.steelColumns.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Steel column schedule — AISC §E3 + §H1-1<SchedChip items={design.steelColumns} ok={(c) => c.ok} /></h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Column</th>
                    <th className="py-1 pr-2 font-semibold">Shape</th>
                    <th className="py-1 pr-2 text-right font-semibold">Pu (kN)</th>
                    <th className="py-1 pr-2 text-right font-semibold">φPn</th>
                    <th className="py-1 pr-2 text-right font-semibold">Mu (kN·m)</th>
                    <th className="py-1 pr-2 text-right font-semibold">KL/r</th>
                    <th className="py-1 pr-2 font-semibold">Eq.</th>
                    <th className="py-1 pr-2 text-right font-semibold">Ratio</th>
                    <th className="py-1 font-semibold">Case</th>
                  </tr>
                </thead>
                <tbody>
                  {design.steelColumns.flatMap((c) => {
                    const key = `col-${c.id}`
                    const open = expanded === key
                    const E_STEEL = 200000
                    const rows = [
                      <tr key={c.id}
                        className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50 ${c.ok ? '' : 'bg-red-50 text-red-700'}`}
                        onClick={() => setExpanded(open ? null : key)}>
                        <td className="py-1 pr-2 font-medium">{c.id} <span className="text-slate-500">{open ? '▲' : '▼'}</span></td>
                        <td className="py-1 pr-2 font-mono">{c.shape}</td>
                        <td className="py-1 pr-2 text-right">{f1(c.Pu)}</td>
                        <td className="py-1 pr-2 text-right">{f1(c.phiPn)}</td>
                        <td className="py-1 pr-2 text-right">{f1(c.Mu)}</td>
                        <td className="py-1 pr-2 text-right">{c.slenderness.toFixed(0)}</td>
                        <td className="py-1 pr-2">{c.equation}</td>
                        <td className={`py-1 pr-2 text-right font-semibold ${c.ratio > 1 ? 'text-red-600' : c.ratio > 0.9 ? 'text-amber-600' : 'text-green-700'}`}>{(c.ratio * 100).toFixed(0)}%</td>
                        <td className="py-1 text-[11px] text-slate-500">{c.gov}</td>
                      </tr>,
                    ]
                    if (open) rows.push(
                      <tr key={`${c.id}-sol`}>
                        <td colSpan={9} className="bg-slate-50 px-4 py-3">
                          <div className="flex flex-wrap gap-6">
                            {/* cross-section drawing — W/WT as flanged section, others via the universal drawer */}
                            <div className="shrink-0">
                              {(() => {
                                const sh = shapeByName(c.shape)
                                if (sh && sh.family !== 'W' && sh.family !== 'WT') return <SectionShape sec={effectiveSection(sh, false)} />
                                return <WShapeSection shape={c.shape} d={c.d} bf={c.bf} tf={c.tf} tw={c.tw} />
                              })()}
                            </div>
                            {/* Section properties */}
                            <div className="min-w-[160px]">
                              <p className="mb-1 text-[11px] font-bold text-slate-600 uppercase tracking-wide">Section properties</p>
                              <table className="text-[11px] leading-5">
                                <tbody>
                                  {[['d', `${c.d.toFixed(1)} mm`], ['bf', `${c.bf.toFixed(1)} mm`], ['tf', `${c.tf.toFixed(1)} mm`], ['tw', `${c.tw.toFixed(1)} mm`],
                                    ['A', `${c.A.toFixed(0)} mm²`], ['rx', `${c.rx.toFixed(1)} mm`], ['ry', `${c.ry.toFixed(1)} mm`],
                                  ].map(([lbl, val]) => (
                                    <tr key={lbl}><td className="pr-3 text-slate-500">{lbl}</td><td className="font-mono">{val}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* §E3 Axial check */}
                            <div className="min-w-[210px]">
                              <p className="mb-1 text-[11px] font-bold text-slate-600 uppercase tracking-wide">§E3 Axial compression</p>
                              <table className="text-[11px] leading-5">
                                <tbody>
                                  {[
                                    ['KLx/rx', c.slendernessX.toFixed(1)],
                                    ['KLy/ry', c.slendernessY.toFixed(1)],
                                    ['Governing KL/r', c.slenderness.toFixed(1)],
                                    ['Fe = π²E/(KL/r)²', `${c.Fe.toFixed(1)} MPa`],
                                    ['4.71√(E/Fy)', `${(4.71 * Math.sqrt(E_STEEL / (c.Fcr > 0 ? c.Pu / (c.phiPn / 0.9 / c.A || 1) : 345))).toFixed(1)}`],
                                    ['Fcr', `${c.Fcr.toFixed(1)} MPa`],
                                    ['φPn (φ=0.9)', `${f1(c.phiPn)} kN`],
                                    ['Pu', `${f1(c.Pu)} kN`],
                                    ['Pu/φPn', `${(c.Pu / (c.phiPn || 1) * 100).toFixed(1)}%`],
                                  ].map(([lbl, val]) => (
                                    <tr key={lbl}><td className="pr-3 text-slate-500">{lbl}</td><td className="font-mono">{val}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* §H1-1 Combined */}
                            <div className="min-w-[180px]">
                              <p className="mb-1 text-[11px] font-bold text-slate-600 uppercase tracking-wide">§H1-1 Combined</p>
                              <table className="text-[11px] leading-5">
                                <tbody>
                                  {[
                                    ['Pu/φPn', `${(c.Pu / (c.phiPn || 1)).toFixed(3)}`],
                                    ['Mu', `${f1(c.Mu)} kN·m`],
                                    ['φMn', `${f1(c.phiMn)} kN·m`],
                                    ['Equation', c.equation],
                                    ['Interaction ratio', `${(c.ratio * 100).toFixed(1)}%`],
                                    ['Status', c.ok ? '✓ OK' : '✗ NG'],
                                  ].map(([lbl, val]) => (
                                    <tr key={lbl}><td className="pr-3 text-slate-500">{lbl}</td><td className={`font-mono ${lbl === 'Status' ? (c.ok ? 'text-green-700' : 'text-red-600') : ''}`}>{val}</td></tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          <p className="mt-2 text-[10px] text-slate-500">K = 1.0 (conservative). §E3: 4.71√(E/Fy) threshold. §H1-1a when Pu/φPn ≥ 0.2, else §H1-1b.</p>
                        </td>
                      </tr>
                    )
                    return rows
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                §E3 axial buckling (governing KL/r, K = 1.0), §H1-1 combined axial + flexure. Ratio ≤ 100% passes. Click a row to expand the worked solution.
              </p>
            </div>
          )}

          {/* Base-plate schedule (full width) */}
          {design.basePlates.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Base-plate schedule — AISC §J8 / Design Guide 1<SchedChip items={design.basePlates} ok={(pl) => pl.ok} /></h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Node</th>
                    <th className="py-1 pr-2 font-semibold">Column</th>
                    <th className="py-1 pr-2 text-right font-semibold">Pu (kN)</th>
                    <th className="py-1 pr-2 text-right font-semibold">Tu (kN)</th>
                    <th className="py-1 pr-2 font-semibold">Plate B×N×t (mm)</th>
                    <th className="py-1 pr-2 text-right font-semibold">Bearing</th>
                    <th className="py-1 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {design.basePlates.map((p) => (
                    <tr key={p.node} className={`sched-row border-t border-slate-100 ${p.ok ? '' : 'bg-red-50 text-red-700'}`}>
                      <td className="py-1 pr-2 font-medium">{p.node}</td>
                      <td className="py-1 pr-2">{p.shape}</td>
                      <td className="py-1 pr-2 text-right">{f1(p.Pu)}</td>
                      <td className="py-1 pr-2 text-right">{p.Tu > 0 ? f1(p.Tu) : '—'}</td>
                      <td className="py-1 pr-2">{f1(p.design.B)} × {f1(p.design.N)} × {p.tAdopt}</td>
                      <td className="py-1 pr-2 text-right">{(p.design.bearingUtil * 100).toFixed(0)}%</td>
                      <td className="py-1">{p.ok ? '✓ OK' : '✗ check'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                Bearing §J8: φc·0.85f′c·√(A2/A1), φc = 0.65. Plate thickness from cantilever bending
                t = ℓ√(2fp/(0.9Fy)); ℓ = max(m, n, n′). Uplift sizes anchor rods (φt·0.75·Fu).
                Adopted t rounded to plate stock.
              </p>
            </div>
          )}

          {/* Timber deck slab schedule — NDS §3 / NSCP §6 */}
          {design.woodSlabs.length > 0 && report !== 'draw-only' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Timber deck slab schedule — NDS §3 / NSCP §6<SchedChip items={design.woodSlabs} ok={(s) => s.ok} /></h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Panel</th>
                    <th className="py-1 pr-2 text-right font-semibold">Span (m)</th>
                    <th className="py-1 pr-2 font-semibold">Species</th>
                    <th className="py-1 pr-2 font-semibold">Joists</th>
                    <th className="py-1 pr-2 text-right font-semibold">Deck t</th>
                    <th className="py-1 pr-2 text-right font-semibold">Deck util</th>
                    <th className="py-1 pr-2 text-right font-semibold">Joist util</th>
                    <th className="py-1 pr-2 text-right font-semibold">Bd·ft</th>
                    <th className="py-1 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {design.woodSlabs.flatMap((s) => {
                    const key = `wslab:${s.plate}`, open = expanded === key || reportOpen
                    const t = s.design.takeoff
                    return [
                      <tr key={key} onClick={() => setExpanded(expanded === key ? null : key)}
                        className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${s.ok ? '' : 'bg-red-50 text-red-700'}`}>
                        <td className="py-1 pr-2 font-medium">{open ? '▾' : '▸'} {s.plate}</td>
                        <td className="py-1 pr-2 text-right">{f2(s.design.joist.span)}</td>
                        <td className="py-1 pr-2">{s.species}</td>
                        <td className="py-1 pr-2">{t.joistCount}·{f0(s.design.joist.b)}×{f0(s.design.joist.d)}</td>
                        <td className="py-1 pr-2 text-right">{f0(s.design.deck.d)}</td>
                        <td className="py-1 pr-2 text-right">{(s.design.deck.ratio * 100).toFixed(0)}%</td>
                        <td className="py-1 pr-2 text-right">{(s.design.joist.ratio * 100).toFixed(0)}%</td>
                        <td className="py-1 pr-2 text-right">{f0(t.joistBoardFeet + t.deckBoardFeet)}</td>
                        <td className="py-1 text-slate-500">{s.ok ? '✓ OK' : '✗ check'}</td>
                      </tr>,
                      open && wantSol && (
                        <tr key={`${key}:sol`}>
                          <td colSpan={9} className="bg-slate-50/60 px-2 pb-2">
                            <WorkedSolution steps={woodSlabRowSolution(s)} title={`${s.plate} — worked solution`} />
                          </td>
                        </tr>
                      ),
                    ]
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">Deck-on-joist: the deck board spans the joist spacing, the joist spans the panel; bending + shear + service deflection (L/360 live, L/240 total). Board feet by size. Click a row for the worked solution.</p>
            </div>
          )}

          {/* Steel connection schedule — only for steel frames */}
          {(design.joints.length > 0 || design.beamJoints.length > 0) && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Steel connection schedule — AISC SCM<SchedChip items={[...design.joints.flatMap((j) => j.connections), ...design.beamJoints.flatMap((j) => j.connections)]} ok={(cn) => cn.ok} /></h3>
              <p className="mb-2 text-[11px] text-slate-500">
                Columns oriented with depth <em>d</em> in X (flanges face ±X); X-direction girders land on the column <strong>flange</strong> face (strong-axis moment connection), Z-direction beams land on the column <strong>web</strong> face (shear tab). Bolts: M20 A325 single-shear (φRₙ = 116.5 kN/bolt). Welds: E70XX fillet, both sides of plate.
              </p>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Node</th>
                    <th className="py-1 pr-2 font-semibold">Col. shape</th>
                    <th className="py-1 pr-2 font-semibold">Beam</th>
                    <th className="py-1 pr-2 font-semibold">Dir</th>
                    <th className="py-1 pr-2 font-semibold">Connects (col → beam)</th>
                    <th className="py-1 pr-2 font-semibold">Type</th>
                    <th className="py-1 pr-2 text-right font-semibold">Vu (kN)</th>
                    <th className="py-1 pr-2 text-right font-semibold">Mu (kN·m)</th>
                    <th className="py-1 pr-2 font-semibold">Bolts</th>
                    <th className="py-1 pr-2 font-semibold">Plate t×h</th>
                    <th className="py-1 pr-2 font-semibold">Weld</th>
                    <th className="py-1 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(design.joints as SteelJoint[]).flatMap((j) =>
                    j.connections.flatMap((c, ci) => {
                      const key = `conn:${j.nodeId}:${c.beamId}`
                      const open = expanded === key || reportOpen
                      const beamShapeName = model?.sections.find((sx) => sx.id === model.members.find((mm) => mm.id === c.beamId)?.section)?.shape
                      return [(
                      <tr key={`${j.nodeId}-${c.beamId}`} onClick={() => setExpanded(expanded === key ? null : key)}
                        className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${c.ok ? '' : 'bg-red-50 text-red-700'}`}>
                        <td className={`py-1 pr-2 align-top ${ci === 0 ? 'font-medium' : 'text-slate-300'}`}>
                          {open ? '▾' : '▸'} {j.nodeId}
                          {ci === 0 && <div className="text-[10px] text-slate-500">{j.strongAxisDir.toUpperCase()}-axis</div>}
                        </td>
                        <td className={`py-1 pr-2 font-mono align-top ${ci === 0 ? '' : 'text-slate-300'}`}>{j.columnShape}</td>
                        <td className="py-1 pr-2 font-medium">{c.beamId}</td>
                        <td className="py-1 pr-2 uppercase">{c.spanDir}</td>
                        <td className="py-1 pr-2 text-[11px]">
                          <span className={c.faceType === 'flange' ? 'font-semibold text-blue-700' : 'text-slate-600'}>col {c.faceType}</span>
                          <span className="text-slate-500"> → beam {c.beamElement}</span>
                        </td>
                        <td className="py-1 pr-2 text-[11px]">
                          {c.connType === 'moment-flange-weld' ? 'Moment (CJP flange)'
                            : c.connType === 'moment-web-plate' ? 'Moment (web ext. plates)' : 'Shear tab'}
                          <div className="text-[10px] text-slate-500">{c.pinned ? 'pin — releases Mz' : 'rigid'}</div>
                        </td>
                        <td className="py-1 pr-2 text-right">{f1(c.Vu)}</td>
                        <td className="py-1 pr-2 text-right">{f1(c.Mu)}</td>
                        <td className="py-1 pr-2 text-[11px]">
                          {c.bolts.n} × M{c.bolts.dia} A325 <span className="text-[10px] text-slate-500">(single shear)</span>
                          <div className="text-[10px] text-slate-500">R={f1(c.bolts.Rmax)}/{f1(c.bolts.phiRnKn)} kN/bolt · e={Math.round(c.bolts.ecc)}mm</div>
                        </td>
                        <td className="py-1 pr-2 text-[11px]">{c.tab.t}×{Math.round(c.tab.hMm)} mm</td>
                        <td className="py-1 pr-2 text-[11px]">
                          {c.tab.weldSizeMm}mm E70
                          {c.flange && <span className="ml-1 text-blue-600">{c.flange.webPlate ? '+ ext. plates' : '+ CJP flg'}</span>}
                        </td>
                        <td className="py-1 text-[11px]">
                          <span className={c.ok ? 'text-green-700' : 'text-red-600'}>{c.ok ? '✓ OK' : '✗ NG'}</span>
                          {c.flange && (
                            <div className="text-[10px] text-slate-500">Tf={f1(c.flange.Tf)} kN</div>
                          )}
                        </td>
                      </tr>
                      ),
                      open && (
                        <tr key={`${key}:detail`}>
                          <td colSpan={12} className="bg-slate-50/60 px-2 pb-2">
                            <div className="grid w-full grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                              <ConnectionDetail2D conn={c} hostShape={j.columnShape} hostKind="column" faceType={c.faceType} beamShape={beamShapeName} />
                              {wantSol && <WorkedSolution steps={connectionRowSolution(c, { kind: 'column', shape: j.columnShape, faceType: c.faceType })} title={`Connection ${j.nodeId} · ${c.beamId} — worked solution`} />}
                            </div>
                          </td>
                        </tr>
                      ),
                      ]
                    })
                  )}
                  {design.beamJoints.flatMap((bj) =>
                    bj.connections.flatMap((c, ci) => {
                      const key = `conn:${bj.nodeId}:${c.beamId}`
                      const open = expanded === key || reportOpen
                      const beamShapeName = model?.sections.find((sx) => sx.id === model.members.find((mm) => mm.id === c.beamId)?.section)?.shape
                      return [(
                      <tr key={`bb-${bj.nodeId}-${c.beamId}`} onClick={() => setExpanded(expanded === key ? null : key)}
                        className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${c.ok ? '' : 'bg-red-50 text-red-700'}`}>
                        <td className={`py-1 pr-2 align-top ${ci === 0 ? 'font-medium' : 'text-slate-300'}`}>
                          {open ? '▾' : '▸'} {bj.nodeId}
                          {ci === 0 && <div className="text-[10px] text-slate-500">beam-to-beam</div>}
                        </td>
                        <td className={`py-1 pr-2 font-mono align-top ${ci === 0 ? '' : 'text-slate-300'}`}>
                          {bj.girderShape}
                          {ci === 0 && <div className="text-[10px] text-slate-500">girder {bj.girderId}</div>}
                        </td>
                        <td className="py-1 pr-2 font-medium">{c.beamId}</td>
                        <td className="py-1 pr-2 uppercase">{c.spanDir}</td>
                        <td className="py-1 pr-2 text-[11px]">
                          <span className="text-slate-600">girder web</span>
                          <span className="text-slate-500"> → beam web{c.cope ? ` (coped ${c.cope.lengthMm}×${c.cope.depthMm})` : ''}</span>
                        </td>
                        <td className="py-1 pr-2 text-[11px]">
                          Fin plate
                          <div className="text-[10px] text-slate-500">pin — releases Mz</div>
                        </td>
                        <td className="py-1 pr-2 text-right">{f1(c.Vu)}</td>
                        <td className="py-1 pr-2 text-right">—</td>
                        <td className="py-1 pr-2 text-[11px]">
                          {c.bolts.n} × M{c.bolts.dia} A325 <span className="text-[10px] text-slate-500">(single shear)</span>
                          <div className="text-[10px] text-slate-500">R={f1(c.bolts.Rmax)}/{f1(c.bolts.phiRnKn)} kN/bolt · e={Math.round(c.bolts.ecc)}mm</div>
                        </td>
                        <td className="py-1 pr-2 text-[11px]">{c.tab.t}×{Math.round(c.tab.hMm)} mm</td>
                        <td className="py-1 pr-2 text-[11px]">{c.tab.weldSizeMm}mm E70</td>
                        <td className="py-1 text-[11px]">
                          <span className={c.ok ? 'text-green-700' : 'text-red-600'}>{c.ok ? '✓ OK' : '✗ NG'}</span>
                        </td>
                      </tr>
                      ),
                      open && (
                        <tr key={`${key}:detail`}>
                          <td colSpan={12} className="bg-slate-50/60 px-2 pb-2">
                            <div className="grid w-full grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                              <ConnectionDetail2D conn={c} hostShape={bj.girderShape} hostKind="girder" faceType="web" beamShape={beamShapeName} />
                              {wantSol && <WorkedSolution steps={connectionRowSolution(c, { kind: 'girder', shape: bj.girderShape })} title={`Connection ${bj.nodeId} · ${c.beamId} — worked solution`} />}
                            </div>
                          </td>
                        </tr>
                      ),
                      ]
                    })
                  )}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                Shear tab: A36 plate (Fy=248, Fu=400 MPa), M20 A325 bolts @ 75 mm pitch, 40 mm edge. Plate shear yielding φ=1.0 (§J4.2).
                Moment connection: CJP groove weld at beam flanges, φFu·A_flange (§J2.6). Weld = E70XX fillet both sides of shear tab.
                Beam-to-beam: fin plate welded to the girder web, supported-beam top flange coped to clear the girder flange (SCM Pt 9/10).
              </p>
            </div>
          )}

          {/* Footing schedule (full width) */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Footing schedule<SchedChip items={design.footings} ok={(f) => f.ok} /></h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-2 font-semibold">Node</th>
                  <th className="py-1 pr-2 text-right font-semibold">P / Pu (kN)</th>
                  <th className="py-1 pr-2 font-semibold">Plan</th>
                  <th className="py-1 pr-2 font-semibold">Dc</th>
                  <th className="py-1 pr-2 font-semibold">Steel</th>
                  <th className="py-1 font-semibold">Case</th>
                </tr>
              </thead>
              <tbody>
                {design.footings.flatMap((f) => {
                  const key = `ftg:${f.node}`, open = expanded === key || reportOpen
                  const cs = colSectionAt(f.node)
                  return [
                    <tr key={key} onClick={() => setExpanded(expanded === key ? null : key)}
                      className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${f.ok ? '' : 'bg-red-50 text-red-700'}`}>
                      <td className="py-1 pr-2 font-medium">{open ? '▾' : '▸'} {f.node}</td>
                      <td className="py-1 pr-2 text-right">{f1(f.P)} / {f1(f.Pu)}</td>
                      <td className="py-1 pr-2">B = {f2(f.design.B)} m</td>
                      <td className="py-1 pr-2">{Math.round(f.design.Dc)} mm</td>
                      <td className="py-1 pr-2">{f.design.bars}⌀{f.barDia} @ {Math.round(f.design.barSpacing)} e.w.</td>
                      <td className="py-1 text-slate-500">{f.gov}</td>
                    </tr>,
                    open && model && (
                      <tr key={`${key}:sol`}>
                        <td colSpan={6} className="bg-slate-50/60 px-2 pb-2">
                          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.7fr_1fr]">
                            {wantSol && <WorkedSolution steps={footingRowSolution(cs ?? model.sections[0], soil, f)} title={`Footing ${f.node} — worked solution`} />}
                            {wantDraw && (
                            <div className="rounded-lg border border-slate-200 bg-white p-3">
                              <FootingSchematic Bx={f.design.B} By={f.design.B} Dc={f.design.Dc}
                                columnWidth={cs ? Math.min(cs.b, cs.h) : 400} H={Hf} />
                            </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ),
                  ]
                })}
              </tbody>
            </table>
          </div>

          {/* Combined footing schedule (full width) */}
          {design.combined.length > 0 && report !== 'draw-only' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Combined footing schedule<SchedChip items={design.combined} ok={(c) => c.ok} /></h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sched-head text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Nodes</th>
                    <th className="py-1 pr-2 text-right font-semibold">Spacing</th>
                    <th className="py-1 pr-2 text-right font-semibold">DL / LL (kN)</th>
                    <th className="py-1 pr-2 font-semibold">Shape</th>
                    <th className="py-1 pr-2 font-semibold">Plan</th>
                    <th className="py-1 font-semibold">Dc</th>
                  </tr>
                </thead>
                <tbody>
                  {design.combined.flatMap((c) => {
                    const key = `comb:${c.nodes.join('-')}`, open = expanded === key || (reportOpen && wantSol)
                    return [
                      <tr key={key} onClick={() => setExpanded(expanded === key ? null : key)}
                        className={`sched-row cursor-pointer border-t border-slate-100 hover:bg-blue-50/40 ${c.ok ? '' : 'bg-red-50 text-red-700'}`}>
                        <td className="py-1 pr-2 font-medium">{open ? '▾' : '▸'} {c.nodes[0]} + {c.nodes[1]}</td>
                        <td className="py-1 pr-2 text-right">{f2(c.spacing)} m</td>
                        <td className="py-1 pr-2 text-right">{f1(c.dl1)}/{f1(c.ll1)} · {f1(c.dl2)}/{f1(c.ll2)}</td>
                        <td className="py-1 pr-2">{c.design.shape}</td>
                        <td className="py-1 pr-2">{f2(c.design.Bx)} × {f2(c.design.By)} m</td>
                        <td className="py-1">{Math.round(c.design.Dc)} mm</td>
                      </tr>,
                      open && model && (
                        <tr key={`${key}:sol`}>
                          <td colSpan={6} className="bg-slate-50/60 px-2 pb-2">
                            <WorkedSolution steps={combinedRowSolution(colSectionAt(c.nodes[0]) ?? model.sections[0], colSectionAt(c.nodes[1]) ?? model.sections[0], soil, c)} title={`Combined footing ${c.nodes.join(' + ')} — worked solution`} />
                          </td>
                        </tr>
                      ),
                    ]
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                Column loads split from D-only / L-only frame solves. Click a row for the full worked solution.
              </p>
            </div>
          )}

          <p className="text-xs text-slate-500">
            Pipeline: slab area loads → tributary line loads → 3D frame FEM (governing NSCP combo) → beam/girder
            critical sections (SRRB/DRRB) → column P–M → base reactions → isolated footings. Open any standalone
            page for the full worked solution of a given element.
          </p>
          </>)}

          {resultsTab === 'schedule' && model && <ConstructionSchedule model={model} design={design} />}
        </div>
        )
      })()}

      {/* ── Material take-off — BOM / BOQ (full width) ── */}
      {design && takeoff && resultsTab === 'boq' && (
        <div className="mt-6 space-y-4 break-before-page">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-extrabold tracking-tight text-[#0f4c92]">
              Material take-off — Bill of Quantities &amp; Materials
            </h2>
            <div className="no-print flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-sm">
              <label className="flex items-center gap-2">
                <span className="font-medium text-slate-600">Concrete class</span>
                <select value={concreteClass} onChange={(e) => setClassPin(e.target.value as ConcreteClass)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                  <option value="AA">AA (12 bags/m³)</option>
                  <option value="A">A (9)</option>
                  <option value="B">B (7.5)</option>
                  <option value="C">C (6)</option>
                </select>
              </label>
              {/* Which of the two it is has to be visible, or an overridden
                  class looks the same as a derived one and the bill quietly
                  stops matching the design. */}
              {classPin === null ? (
                <span className="text-[11.5px] text-slate-500">
                  from f′c = {f2(fc)} MPa
                </span>
              ) : (
                <button type="button" onClick={() => setClassPin(null)}
                  className="text-[11.5px] font-semibold text-[#0f4c92] underline underline-offset-2">
                  overridden — match f′c ({fcClass.klass})
                </button>
              )}
            </div>
          </div>

          {!fcClass.adequate && classPin === null && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              f′c = {f2(fc)} MPa is above Class AA ({f2(fcClass.classFc)} MPa), so no standard NSCP mix
              class reaches it. The bill below is priced at Class AA — a DESIGNED mix is required, and its
              cement content will be higher than the 12 bags/m³ assumed here.
            </p>
          )}

          {/* BOM summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              takeoff.totalConcreteM3 > 0 && ['Concrete', `${f2(takeoff.totalConcreteM3)} m³`],
              takeoff.totalConcreteM3 > 0 && ['Cement', `${takeoff.concrete.cement} bags`],
              takeoff.totalConcreteM3 > 0 && ['Sand', `${f2(takeoff.concrete.sand)} m³`],
              takeoff.totalConcreteM3 > 0 && ['Gravel', `${f2(takeoff.concrete.gravel)} m³`],
              takeoff.totalSteelPurchasedKg > 0 && ['Rebar (bought)', `${f1(takeoff.totalSteelPurchasedKg)} kg`],
              takeoff.tieWire.rolls > 0 && ['Tie wire', `${takeoff.tieWire.rolls} roll${takeoff.tieWire.rolls === 1 ? '' : 's'}`],
              takeoff.structuralSteelKg > 0 && ['Structural steel', `${(takeoff.structuralSteelKg / 1000).toFixed(2)} t`],
              takeoff.timberM3 > 0 && ['Timber', `${f2(takeoff.timberM3)} m³`],
              takeoff.timberM3 > 0 && ['Timber (bd·ft)', `${f0(takeoff.timberBoardFeet)}`],
            ].filter(Boolean as unknown as (v: unknown) => v is [string, string]).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-slate-200 bg-white p-2 text-center shadow-sm">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{k}</div>
                <div className="text-sm font-bold text-[#0f4c92]">{v}</div>
              </div>
            ))}
          </div>

          {/* Priced Bill of Materials — unit prices make it an actual Bill */}
          {bill && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[1.02rem] font-bold text-[#0f4c92]">Bill of Materials (priced)</h3>
                <span className="text-sm font-bold text-[#0f4c92]">Grand total: {peso(bill.total)}</span>
              </div>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Material</th>
                    <th className="py-1 pr-2 text-right font-semibold">Qty</th>
                    <th className="py-1 pr-2 font-semibold">Unit</th>
                    <th className="py-1 pr-2 text-right font-semibold">Unit price (₱)</th>
                    <th className="py-1 text-right font-semibold">Amount (₱)</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.rows.map((r) => {
                    const key = r.priceKey
                    const pv = key ? (prices[key] ?? r.unitPrice) : r.unitPrice
                    return (
                      <tr key={r.item} className="border-t border-slate-100">
                        <td className="py-0.5 pr-2">{r.item}</td>
                        <td className="py-0.5 pr-2 text-right">{f2(r.qty)}</td>
                        <td className="py-0.5 pr-2 text-slate-500">{r.unit}</td>
                        <td className="py-0.5 pr-2 text-right">
                          {key ? (
                            <>
                              <input type="number" value={pv}
                                onChange={(e) => setPrices((p) => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))}
                                className="no-print w-24 rounded border border-slate-200 px-1 py-0.5 text-right" />
                              <span className="print-only">{pv.toLocaleString('en-PH')}</span>
                            </>
                          ) : pv.toLocaleString('en-PH')}
                        </td>
                        <td className="py-0.5 text-right font-medium">{peso(r.amount)}</td>
                      </tr>
                    )
                  })}
                  <tr className="border-t border-slate-200 font-bold text-[#0f4c92]">
                    <td className="py-1 pr-2" colSpan={4}>Grand total</td>
                    <td className="py-1 text-right">{peso(bill.total)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                Edit the unit prices to your local rates (PHP). Steel priced on the purchased (6 m-bar) weight incl. lap/waste;
                concrete via cement/sand/gravel; timber per board foot. Labour, hauling and contingencies not included.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* BOQ */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Bill of Quantities (by element)</h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Item</th>
                    <th className="py-1 pr-2 text-right font-semibold">Qty</th>
                    <th className="py-1 font-semibold">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {takeoff.boq.map((r) => (
                    <tr key={r.item} className="border-t border-slate-100">
                      <td className="py-0.5 pr-2">{r.item}</td>
                      <td className="py-0.5 pr-2 text-right">{f2(r.qty)}</td>
                      <td className="py-0.5 text-slate-500">{r.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Steel by diameter (BOM) — 6 m commercial bars with lap + waste */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Reinforcement by bar Ø (6 m bars)</h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Bar</th>
                    <th className="py-1 pr-2 text-right font-semibold">Net (m)</th>
                    <th className="py-1 pr-2 text-right font-semibold">6 m pcs</th>
                    <th className="py-1 pr-2 text-right font-semibold">Waste (m)</th>
                    <th className="py-1 text-right font-semibold">Weight (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {takeoff.steelByDia.map((d) => (
                    <tr key={d.dia} className="border-t border-slate-100">
                      <td className="py-0.5 pr-2 font-medium">⌀{d.dia}</td>
                      <td className="py-0.5 pr-2 text-right">{f1(d.netLengthM)}</td>
                      <td className="py-0.5 pr-2 text-right">{d.pieces6m}</td>
                      <td className="py-0.5 pr-2 text-right">{f1(d.wasteM)}</td>
                      <td className="py-0.5 text-right">{f1(d.weightKg)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 font-semibold">
                    <td className="py-1 pr-2">Total</td>
                    <td />
                    <td className="py-1 text-right">{takeoff.steelByDia.reduce((s, d) => s + d.pieces6m, 0)}</td>
                    <td />
                    <td className="py-1 text-right">{f1(takeoff.totalSteelPurchasedKg)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">
                Continuous bars spliced (usable 6 − 0.30 m lap); stirrups/ties nested (cuts per 6 m). Fabricated net
                {' '}{f1(takeoff.totalSteelNetKg)} kg → bought {f1(takeoff.totalSteelPurchasedKg)} kg.
                Class {concreteClass}: {takeoff.concrete.factor} cement bags/m³ · sand 0.5, gravel 1.0 m³/m³ (NSCP mix).
              </p>
            </div>
          </div>

          {/* Structural steel by shape — only when W-shapes are present */}
          {takeoff.structuralSteelKg > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Structural steel by shape</h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Shape</th>
                    <th className="py-1 pr-2 text-right font-semibold">Unit wt (kg/m)</th>
                    <th className="py-1 pr-2 text-right font-semibold">Length (m)</th>
                    <th className="py-1 text-right font-semibold">Mass (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {takeoff.steelByShape.sort((a, b) => a.shape.localeCompare(b.shape)).map((s) => (
                    <tr key={s.shape} className="border-t border-slate-100">
                      <td className="py-0.5 pr-2 font-medium">{s.shape}</td>
                      <td className="py-0.5 pr-2 text-right">{f1(s.kgPerM)}</td>
                      <td className="py-0.5 pr-2 text-right">{f1(s.L)}</td>
                      <td className="py-0.5 text-right">{Math.round(s.kg)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 font-semibold">
                    <td className="py-1 pr-2">Total</td>
                    <td className="py-1 pr-2" />
                    <td className="py-1 pr-2 text-right">{f1(takeoff.steelByShape.reduce((s, r) => s + r.L, 0))}</td>
                    <td className="py-1 text-right">{Math.round(takeoff.structuralSteelKg)} kg ({(takeoff.structuralSteelKg / 1000).toFixed(2)} t)</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">Net mass: ρ = 7 850 kg/m³ · A (mm²) × L (m). Connections, base plates and field splices not included.</p>
            </div>
          )}

          {/* Timber by section size — only when a wood frame is present */}
          {takeoff.timberM3 > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Timber by size</h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-2 font-semibold">Size (mm)</th>
                    <th className="py-1 pr-2 font-semibold">Species</th>
                    <th className="py-1 pr-2 font-semibold">Kind</th>
                    <th className="py-1 pr-2 text-right font-semibold">Pcs</th>
                    <th className="py-1 pr-2 text-right font-semibold">Length (m)</th>
                    <th className="py-1 pr-2 text-right font-semibold">Volume (m³)</th>
                    <th className="py-1 text-right font-semibold">Board feet</th>
                  </tr>
                </thead>
                <tbody>
                  {[...takeoff.timberBySize].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                    <tr key={`${s.name}-${s.species}-${s.kind}`} className="border-t border-slate-100">
                      <td className="py-0.5 pr-2 font-medium">{s.name}</td>
                      <td className="py-0.5 pr-2" title={WOOD_SPECIES[s.species]?.label ?? s.species}>{s.species}</td>
                      <td className="py-0.5 pr-2">{s.kind}</td>
                      <td className="py-0.5 pr-2 text-right">{s.count}</td>
                      <td className="py-0.5 pr-2 text-right">{f1(s.L)}</td>
                      <td className="py-0.5 pr-2 text-right">{f2(s.m3)}</td>
                      <td className="py-0.5 text-right">{f0(s.boardFeet)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 font-semibold">
                    <td className="py-1 pr-2">Total</td>
                    <td className="py-1 pr-2" colSpan={3} />
                    <td className="py-1 pr-2 text-right">{f1(takeoff.timberBySize.reduce((s, r) => s + r.L, 0))}</td>
                    <td className="py-1 pr-2 text-right">{f2(takeoff.timberM3)}</td>
                    <td className="py-1 text-right">{f0(takeoff.timberBoardFeet)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">Solid-rectangle volume b×h×L; board feet = m³ × 423.776 (1 bd·ft = 1/12 ft³). Priced per board foot in the Bill of Materials. Connections and wastage/off-cuts not included.</p>
            </div>
          )}

          {/* Formwork + tie wire */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Formwork</h3>
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {[
                    ['Contact area', `${f1(takeoff.formwork.areaM2)} m²`],
                    [`Plywood (${takeoff.formwork.sheetM2.toFixed(2)} m²/sheet, ${takeoff.formwork.uses} uses)`, `${takeoff.formwork.plywoodSheets} sheets`],
                    ['Lumber (studs / walers / braces)', `${f1(takeoff.formwork.lumberM)} lin·m`],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-t border-slate-100">
                      <td className="py-1 pr-2 text-slate-600">{k}</td>
                      <td className="py-1 text-right font-semibold">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Tie wire (#16 G.I.)</h3>
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {[
                    ['Bar intersections', `${takeoff.tieWire.intersections}`],
                    ['Net length (0.30 m / tie)', `${f1(takeoff.tieWire.netM)} m`],
                    ['Rolls (2385 m / roll)', `${takeoff.tieWire.rolls}`],
                    ['Weight', `${f1(takeoff.tieWire.weightKg)} kg`],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-t border-slate-100">
                      <td className="py-1 pr-2 text-slate-600">{k}</td>
                      <td className="py-1 text-right font-semibold">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detailed cut list */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Reinforcement cut list</h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-left uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-2 font-semibold">Element</th>
                  <th className="py-1 pr-2 font-semibold">Mark</th>
                  <th className="py-1 pr-2 text-right font-semibold">Bar</th>
                  <th className="py-1 pr-2 text-right font-semibold">No.</th>
                  <th className="py-1 pr-2 text-right font-semibold">Cut (m)</th>
                  <th className="py-1 pr-2 text-right font-semibold">Total (m)</th>
                  <th className="py-1 text-right font-semibold">kg</th>
                </tr>
              </thead>
              <tbody>
                {takeoff.cutList.map((c, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-0.5 pr-2">{c.element}</td>
                    <td className="py-0.5 pr-2">{c.mark}</td>
                    <td className="py-0.5 pr-2 text-right">⌀{c.dia}</td>
                    <td className="py-0.5 pr-2 text-right">{c.count}</td>
                    <td className="py-0.5 pr-2 text-right">{f2(c.cutLengthM)}</td>
                    <td className="py-0.5 pr-2 text-right">{f1(c.totalM)}</td>
                    <td className="py-0.5 text-right">{f1(c.weightKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-slate-500">
              Cut lengths include a 40·d_b lap/anchorage allowance on straight bars and a 2·max(6·d_t, 75 mm) hook
              allowance on stirrups/ties. {takeoff.slabSteelDDM ? 'Slab steel follows the DDM column/middle-strip layout: +M bottom bars span-long, −M top bars cut off 0.3·ℓn over supports.' : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
