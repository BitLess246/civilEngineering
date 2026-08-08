// ─────────────────────────────────────────────────────────────────────────
// Geotechnical investigation report — the document model. Layer 9.
//
// Assembles an `Investigation` into the 22 sections a geotechnical report is
// expected to carry, renderer-agnostic: this module produces text, tables and
// `Drawing`s, and `lib/soilsPdf.ts` paints them. Nothing here computes soil
// behaviour — every number arrives from the engines.
//
// THE POINT OF THIS MODULE IS THE GAPS.
//
// A report generator that quietly omits the sections it has no data for
// produces a document that reads as complete, and the reader cannot tell the
// difference between "the clay is not a liquefaction risk" and "liquefaction
// was never assessed". So every section is ALWAYS present and carries a status:
//
//   complete      the data supports it
//   partial       some of it is supported; `gap` says what is missing
//   not-assessed  nothing supports it; `gap` says what would be needed
//
// The gaps are collected onto the report as a whole, so the cover can state up
// front what this document does not establish. That is the difference between
// a report and a printout.
//
// UNITS: as the engines produce them — depth m, stress kPa, unit weight kN/m³.
// ─────────────────────────────────────────────────────────────────────────

import type { Drawing } from '../planRenderer'
import type { Investigation, Borehole } from './model'
import { layerThickness, soilFamily, isCohesive } from './model'
import { buildBoreholeLog } from './logRenderer'
import { buildSection, sectionDrawing } from './section'
import { sptProfile, type LayerUnitWeight } from './sptProfile'
import { liquefactionProfile, type LiquefactionProfileInput } from './liquefaction'
import { liquefactionChart } from './liquefactionPlot'
import { finesByLayer, finesMap } from './finesContent'
import { resolveParameters, PARAMETER_LABEL } from './parameters'
import { describeProvenance, PROVENANCE_LABEL } from './provenance'
import { validateInvestigation } from './validate'
import { evaluateTest, summarise, LAB_TESTS } from './lab'
import { classifySample } from './classifySample'
import { labChart } from './lab/testChart'
import { cite } from './standards'

export type SectionStatus = 'complete' | 'partial' | 'not-assessed'

export interface ReportTable {
  title?: string
  head: string[]
  rows: string[][]
  /** Column indices to right-align. */
  right?: number[]
}

export interface ReportFigure {
  caption: string
  drawing: Drawing
}

export interface ReportSection {
  no: number
  title: string
  status: SectionStatus
  /** What is missing. REQUIRED whenever status is not 'complete'. */
  gap?: string
  paragraphs: string[]
  tables: ReportTable[]
  figures: ReportFigure[]
  notes: string[]
}

export interface SoilsReport {
  title: string
  investigationNo: string
  projectName: string
  location: string
  reportDate: string
  preparedBy?: string
  sections: ReportSection[]
  /** Every gap in the document, in section order. Printed on the cover. */
  gaps: { section: number; title: string; gap: string }[]
  /** Sections with data, over 22. */
  completeness: number
  /** Integrity errors that must be resolved before the report is issued. */
  blockingIssues: string[]
}

export interface ReportOptions {
  preparedBy?: string
  reportDate?: string
  /** Seismic input for the liquefaction section. Omit to leave it unassessed. */
  seismic?: LiquefactionProfileInput
  /** Foundation the recommendations section discusses, if one has been chosen. */
  foundation?: { kind: string; depth?: number; allowablePressure?: number }
}

const f2 = (n: number | undefined) => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(2))
const f1 = (n: number | undefined) => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(1))

/** A section with nothing behind it. `gap` is mandatory — that is the point. */
const missing = (no: number, title: string, gap: string): ReportSection =>
  ({ no, title, status: 'not-assessed', gap, paragraphs: [], tables: [], figures: [], notes: [] })

const unitWeightsOf = (inv: Investigation, bh: Borehole): Record<string, LayerUnitWeight> => {
  const out: Record<string, LayerUnitWeight> = {}
  for (const p of inv.parameters) {
    if (!bh.layers.some((l) => l.id === p.layerId)) continue
    const g = p.unitWeight?.value
    if (g != null) out[p.layerId] = { gamma: g, gammaSat: p.saturatedUnitWeight?.value }
  }
  return out
}

// ── Sections ──────────────────────────────────────────────────────────────

function s1Introduction(inv: Investigation): ReportSection {
  const m = inv.meta
  const paragraphs = [
    `This report presents the results of the geotechnical investigation carried out for ${m.site.projectName || 'the project'}${m.site.location ? ` at ${m.site.location}` : ''}, under investigation reference ${m.investigationNo || '(unassigned)'}.`,
    `The investigation comprised ${inv.boreholes.length} exploration${inv.boreholes.length === 1 ? '' : 's'}, with field testing, sampling and laboratory testing as described in the sections that follow.`,
  ]
  const gaps: string[] = []
  if (!m.site.projectName) gaps.push('project name')
  if (!m.site.location) gaps.push('site location')
  if (!m.investigationNo) gaps.push('investigation reference')
  return {
    no: 1, title: 'Introduction and scope',
    status: gaps.length ? 'partial' : 'complete',
    gap: gaps.length ? `Not recorded: ${gaps.join(', ')}.` : undefined,
    paragraphs, tables: [], figures: [], notes: [],
  }
}

function s4FieldWork(inv: Investigation): ReportSection {
  if (!inv.boreholes.length) {
    return missing(4, 'Field investigation', 'No exploration has been logged, so there is no field work to describe.')
  }
  const rows = inv.boreholes.map((b) => [
    b.name, b.kind, f2(b.actualDepth),
    b.diameter != null ? String(b.diameter) : '—',
    b.method ?? '—',
    b.groundwaterDepth != null ? f2(b.groundwaterDepth) : 'not encountered',
    String(b.spt.length), String(b.samples.length),
  ])
  const noMethod = inv.boreholes.filter((b) => !b.method).map((b) => b.name)
  return {
    no: 4, title: 'Field investigation',
    status: noMethod.length ? 'partial' : 'complete',
    gap: noMethod.length ? `Drilling method not recorded for ${noMethod.join(', ')}, so the SPT energy and borehole-diameter corrections rest on assumed equipment.` : undefined,
    paragraphs: [
      `${inv.boreholes.length} exploration${inv.boreholes.length === 1 ? ' was' : 's were'} advanced to the depths tabulated below. Standard penetration testing was carried out in general accordance with ${cite('d1586')}.`,
    ],
    tables: [{
      title: 'Exploration summary',
      head: ['Hole', 'Type', 'Depth (m)', 'Dia (mm)', 'Method', 'Groundwater (m)', 'SPT', 'Samples'],
      rows, right: [2, 3, 5, 6, 7],
    }],
    figures: [], notes: [],
  }
}

function s5Stratigraphy(inv: Investigation): ReportSection {
  const layers = inv.boreholes.flatMap((b) => b.layers.map((l) => ({ b, l })))
  const section = buildSection(inv.boreholes)
  if (!layers.length) {
    return missing(5, 'Subsurface conditions', 'No strata have been logged. Stratigraphy is the basis of every other section, so nothing downstream can be reported either.')
  }
  const unclassified = layers.filter(({ l }) => !l.symbol).map(({ b, l }) => `${b.name}/${l.name}`)
  return {
    no: 5, title: 'Subsurface conditions',
    status: unclassified.length ? 'partial' : 'complete',
    gap: unclassified.length
      ? `${unclassified.length} layer${unclassified.length === 1 ? ' has' : 's have'} no USCS group symbol (${unclassified.slice(0, 4).join(', ')}${unclassified.length > 4 ? ', …' : ''}). A described layer without a classification cannot be correlated between holes with confidence.`
      : undefined,
    paragraphs: [
      'The strata encountered in each exploration are logged below. Descriptions follow the visual-manual procedure, confirmed by laboratory classification where samples were tested.',
      ...(section.holes.length > 1
        ? ['The correlated section that follows the logs is an INTERPRETATION. Only the vertical hole traces on it are measured; every boundary drawn between holes is inferred, and is dashed to say so.']
        : []),
    ],
    tables: inv.boreholes.filter((b) => b.layers.length).map((b) => ({
      title: `${b.name} — stratigraphy`,
      head: ['From (m)', 'To (m)', 'Thickness (m)', 'Symbol', 'Description'],
      rows: [...b.layers].sort((x, y) => x.depthTop - y.depthTop).map((l) => [
        f2(l.depthTop), f2(l.depthBottom), f2(layerThickness(l)), l.symbol ?? '—',
        l.description || l.name,
      ]),
      right: [0, 1, 2],
    })),
    figures: [
      ...inv.boreholes.filter((b) => b.layers.length).map((b) => ({
        caption: `${b.name} — borehole log`,
        drawing: buildBoreholeLog(b),
      })),
      // The section is an INTERPRETATION between the logs, so it follows them
      // rather than leading — a reader should meet the measured holes first.
      ...(section.holes.length > 1
        ? [{
            caption: 'Correlated section — solid where a hole proves a boundary, dashed where it is inferred',
            drawing: sectionDrawing(section),
          }]
        : []),
    ],
    notes: section.holes.length > 1 ? section.notes : [],
  }
}

function s6Groundwater(inv: Investigation): ReportSection {
  const withWater = inv.boreholes.filter((b) => b.groundwaterDepth != null)
  if (!inv.boreholes.length) {
    return missing(6, 'Groundwater conditions', 'No explorations logged.')
  }
  if (!withWater.length) {
    return {
      no: 6, title: 'Groundwater conditions',
      status: 'partial',
      gap: 'Groundwater was not recorded in any exploration. Absence of a record is NOT a record of absence — every effective-stress calculation in this report therefore treats the profile as dry, which is unconservative if it is not.',
      paragraphs: ['No groundwater observations are available for this investigation.'],
      tables: [], figures: [], notes: [],
    }
  }
  const noStabilised = withWater.filter((b) => b.groundwaterDepthStabilised == null)
  return {
    no: 6, title: 'Groundwater conditions',
    status: noStabilised.length ? 'partial' : 'complete',
    gap: noStabilised.length
      ? `Only a drilling-time water level is available for ${noStabilised.map((b) => b.name).join(', ')}. A level read during drilling can be well away from the stabilised water table, particularly in clay.`
      : undefined,
    paragraphs: ['Groundwater levels observed during and after drilling are tabulated below. Levels vary seasonally, and design should consider the highest credible level rather than the level observed on the day.'],
    tables: [{
      head: ['Hole', 'During drilling (m)', 'Stabilised (m)'],
      rows: inv.boreholes.map((b) => [
        b.name,
        b.groundwaterDepth != null ? f2(b.groundwaterDepth) : 'not encountered',
        b.groundwaterDepthStabilised != null ? f2(b.groundwaterDepthStabilised) : '—',
      ]),
      right: [1, 2],
    }],
    figures: [], notes: [],
  }
}

function s7Spt(inv: Investigation): ReportSection {
  const holes = inv.boreholes.filter((b) => b.spt.length)
  if (!holes.length) {
    return missing(7, 'Standard penetration testing', 'No SPT was carried out, so no in-situ strength or density correlation is available.')
  }
  const tables: ReportTable[] = []
  const notes: string[] = []
  let anyMissingStress = false

  for (const b of holes) {
    const p = sptProfile(b, unitWeightsOf(inv, b))
    if (p.missingUnitWeights.length) anyMissingStress = true
    for (const n of p.notes) if (!notes.includes(n)) notes.push(n)
    tables.push({
      title: `${b.name} — corrected blow counts`,
      head: ['Depth (m)', 'Layer', 'N', 'N₆₀', "σ'v0 (kPa)", 'C_N', '(N₁)₆₀'],
      rows: p.rows.map((r) => [
        f2(r.depth), r.layerName ?? '—', String(r.N), f1(r.n60),
        r.effectiveStress != null ? f1(r.effectiveStress) : '—',
        r.cn != null ? f2(r.cn) : '—',
        r.n160 != null ? f1(r.n160) : '—',
      ]),
      right: [0, 2, 3, 4, 5, 6],
    })
  }

  return {
    no: 7, title: 'Standard penetration testing',
    status: anyMissingStress ? 'partial' : 'complete',
    gap: anyMissingStress
      ? 'Unit weights are missing for some layers, so the effective stress — and with it (N₁)₆₀ — could not be computed below them. N₆₀ is still reported, since it needs no stress.'
      : undefined,
    paragraphs: [
      `Blow counts are corrected for hammer energy, borehole diameter, sampler type and rod length to N₆₀, and for effective overburden to (N₁)₆₀ per ${cite('d1586')} and the NCEER recommendations.`,
    ],
    tables, figures: [], notes,
  }
}

function s8Laboratory(inv: Investigation): ReportSection {
  const all = inv.boreholes.flatMap((b) =>
    b.samples.flatMap((s) => s.tests.map((t) => ({ b, s, t }))))

  // A TEST WITH NO DATA IS NOT REPORTED. A booked-but-unrun test tells the
  // reader nothing about the ground, and a table padded with "no result
  // recorded" buries the rows that do carry a measurement. What it IS worth
  // saying is how many were left out and why, so the omission is stated once
  // in the gap rather than repeated as a dozen empty rows — this report is not
  // a record of absence, but it does not pretend the absences are not there.
  const rows: string[][] = []
  const figures: ReportFigure[] = []
  let omittedPending = 0
  let omittedEmpty = 0

  for (const { b, s, t } of all) {
    const spec = LAB_TESTS.find((x) => x.type === t.type)
    const { outcome, error } = evaluateTest(t)

    if (!outcome && !error) {
      // Nothing computable: either it has not been run, or it is marked
      // complete with an empty form. Both are counted, neither is tabulated.
      if (t.status === 'planned' || t.status === 'in-progress') omittedPending++
      else omittedEmpty++
      continue
    }

    // A data ERROR is data — the specimen was entered and the numbers are
    // impossible — so it is reported rather than dropped with the blanks.
    const result = outcome
      ? (() => {
          const sum = summarise(outcome)
          return `${sum.label} = ${f2(sum.value)}${sum.unit ? ` ${sum.unit}` : ''}`
        })()
      : `data error: ${error}`

    rows.push([b.name, s.name, spec?.label ?? t.type, cite(t.standard), t.status, result])

    if (outcome) {
      const drawing = labChart(t, outcome)
      if (drawing) {
        figures.push({
          caption: `${spec?.label ?? t.type} — ${b.name}, ${s.name} (${cite(t.standard)})`,
          drawing,
        })
      }
    }
  }

  if (!rows.length) {
    return missing(8, 'Laboratory testing', all.length
      ? `${all.length} laboratory test${all.length === 1 ? ' is' : 's are'} booked against the samples but none has a result, so nothing is tabulated. Every soil parameter in this report rests on field correlation or engineering assumption rather than measurement.`
      : 'No laboratory tests are recorded. Every soil parameter in this report therefore rests on field correlation or engineering assumption rather than measurement.')
  }

  const omitted = omittedPending + omittedEmpty
  const gapParts: string[] = []
  if (omittedPending) gapParts.push(`${omittedPending} not yet run`)
  if (omittedEmpty) gapParts.push(`${omittedEmpty} marked complete with an empty form`)

  return {
    no: 8, title: 'Laboratory testing',
    status: omitted ? 'partial' : 'complete',
    gap: omitted
      ? `${omitted} of ${all.length} booked test${all.length === 1 ? '' : 's'} produced no result and ${omitted === 1 ? 'is' : 'are'} therefore not tabulated (${gapParts.join(', ')}). Parameters that would have come from them rest on correlation instead.`
      : undefined,
    paragraphs: [
      'The laboratory programme and its results are tabulated below, followed by the plot for every test whose result is read off a curve. Tests that produced no result are excluded from the table and accounted for above; a specimen that failed on a seating error is reported with its error rather than dropped, because that is part of the history of the sample.',
    ],
    tables: [{ head: ['Hole', 'Sample', 'Test', 'Standard', 'Status', 'Result'], rows }],
    figures, notes: [],
  }
}


function s10Parameters(inv: Investigation): ReportSection {
  const rows: string[][] = []
  const absent: string[] = []

  for (const b of inv.boreholes) {
    const uw = unitWeightsOf(inv, b)
    for (const layer of b.layers) {
      const stored = inv.parameters.find((p) => p.layerId === layer.id)
      const r = resolveParameters({ borehole: b, layer, unitWeights: uw, stored })
      for (const p of r.resolved) {
        rows.push([
          `${b.name} / ${layer.name}`,
          PARAMETER_LABEL[p.key],
          `${f2(p.value.value)} ${p.value.unit}`,
          PROVENANCE_LABEL[p.value.provenance.kind],
          describeProvenance(p.value.provenance),
        ])
      }
      if (!r.resolved.length) absent.push(`${b.name}/${layer.name}`)
    }
  }

  if (!rows.length) {
    return missing(10, 'Engineering parameters', 'No design parameter has any evidence behind it — no laboratory test, no correlation input and no stated assumption.')
  }

  const correlated = rows.filter((r) => r[3] === PROVENANCE_LABEL.correlated).length
  const assumed = rows.filter((r) => r[3] === PROVENANCE_LABEL.assumed).length
  return {
    no: 10, title: 'Engineering parameters',
    status: absent.length ? 'partial' : 'complete',
    gap: absent.length
      ? `No parameter could be established for ${absent.length} layer${absent.length === 1 ? '' : 's'} (${absent.slice(0, 4).join(', ')}${absent.length > 4 ? ', …' : ''}).`
      : undefined,
    paragraphs: [
      'Every design parameter below carries its provenance: whether it was MEASURED in the laboratory, DERIVED from other measurements, CORRELATED from field testing, or ASSUMED by the engineer. Where more than one source existed, the strongest was taken — measurements are never averaged with correlations.',
      `Of ${rows.length} parameters, ${rows.length - correlated - assumed} rest on measurement or derivation, ${correlated} on correlation and ${assumed} on stated assumption.`,
    ],
    tables: [{
      head: ['Layer', 'Parameter', 'Value', 'Basis', 'Source'],
      rows, right: [2],
    }],
    figures: [],
    notes: correlated || assumed
      ? ['A correlated or assumed parameter carries far more scatter than a measured one. Where such a parameter governs the design, targeted laboratory testing is the cheapest way to reduce risk.']
      : [],
  }
}

function s12Liquefaction(inv: Investigation, opts: ReportOptions): ReportSection {
  if (!opts.seismic) {
    return missing(12, 'Liquefaction assessment',
      'No design earthquake has been specified. Liquefaction triggering cannot be assessed without a peak ground acceleration and a magnitude, and this report makes no statement about liquefaction risk.')
  }
  const holes = inv.boreholes.filter((b) => b.spt.length)
  if (!holes.length) {
    return missing(12, 'Liquefaction assessment',
      'Liquefaction triggering by the NCEER simplified procedure needs SPT blow counts, and none were recorded.')
  }

  const tables: ReportTable[] = []
  const figures: ReportFigure[] = []
  const notes: string[] = []
  let anyEvaluated = false
  const triggering: string[] = []

  for (const b of holes) {
    const fines = finesByLayer(b)
    const p = liquefactionProfile(b, unitWeightsOf(inv, b), {
      ...opts.seismic, finesContent: { ...finesMap(fines), ...(opts.seismic.finesContent ?? {}) },
    })
    if (p.rows.some((r) => r.result)) anyEvaluated = true
    if (p.liquefiableDepths.length) {
      triggering.push(`${b.name}: ${p.liquefiableDepths.map((d) => `${f1(d.top)}–${f1(d.bottom)} m`).join(', ')}`)
    }
    for (const n of p.notes) if (!notes.includes(n)) notes.push(n)

    tables.push({
      title: `${b.name} — triggering (LPI ${f1(p.lpi)}, ${p.lpiCategory.replace('-', ' ')})`,
      head: ['Depth (m)', 'Layer', '(N₁)₆₀cs', 'CSR', 'CRR', 'FS'],
      rows: p.rows.map((r) => r.result
        ? [f2(r.depth), r.layerName ?? '—', f1(r.result.n160cs), f2(r.result.csr),
           r.result.crr != null ? f2(r.result.crr) : '—',
           r.result.factorOfSafety != null ? f2(r.result.factorOfSafety) : 'too dense']
        : [f2(r.depth), r.layerName ?? '—', '—', '—', '—', 'not evaluated']),
      right: [0, 2, 3, 4, 5],
    })
    figures.push({
      caption: `${b.name} — factor of safety against liquefaction`,
      drawing: liquefactionChart(p, { waterTable: b.groundwaterDepth, holeDepth: b.actualDepth }),
    })
  }

  // "No test returned FS < 1" is TRUE and MISLEADING when no test could be
  // evaluated — it reads as an all-clear for ground that was never checked.
  // The two outcomes are reported as the different things they are.
  const verdict = !anyEvaluated
    ? 'NO TEST COULD BE EVALUATED. Every test lay above the water table, in cohesive soil, or without the effective stress needed to correct its blow count. This section therefore establishes NOTHING about liquefaction risk at this site — it is not a finding of no risk.'
    : triggering.length
      ? `Factors of safety below unity were computed over the following depths: ${triggering.join('; ')}. Ground improvement, deeper founding or a foundation designed to tolerate the consequences should be considered.`
      : 'Every evaluated test returned a factor of safety of at least unity for the design earthquake.'

  const paragraphs = [
    `Liquefaction triggering was assessed by the NCEER simplified procedure (Youd et al. 2001) for a peak ground acceleration of ${opts.seismic.amax}g and a moment magnitude of ${opts.seismic.magnitude}.`,
    verdict,
    'The factor of safety reported here is against TRIGGERING only. It does not predict post-liquefaction settlement, loss of bearing, or lateral spread, each of which is a separate analysis.',
  ]

  return {
    no: 12, title: 'Liquefaction assessment',
    status: anyEvaluated ? 'complete' : 'partial',
    gap: anyEvaluated ? undefined
      : 'No test met the conditions for a triggering check — all lay above the water table, in cohesive soil, or without a usable blow count. The profile is empty rather than clear.',
    paragraphs, tables, figures, notes,
  }
}

function s16Recommendations(opts: ReportOptions): ReportSection {
  if (!opts.foundation) {
    return missing(16, 'Foundation recommendations',
      'No foundation scheme has been nominated. Recommendations require a proposed structure, its loads and its settlement tolerance, none of which are held in this investigation record.')
  }
  const f = opts.foundation
  return {
    no: 16, title: 'Foundation recommendations',
    status: f.allowablePressure != null ? 'complete' : 'partial',
    gap: f.allowablePressure == null ? 'No allowable bearing pressure has been nominated for the proposed foundation.' : undefined,
    paragraphs: [
      `A ${f.kind} foundation is proposed${f.depth != null ? `, founded at ${f2(f.depth)} m below existing ground level` : ''}.`,
      ...(f.allowablePressure != null
        ? [`An allowable net bearing pressure of ${f1(f.allowablePressure)} kPa may be adopted, subject to the settlement check being satisfied for the actual footing sizes and loads.`]
        : []),
      'These recommendations apply to the scheme described and to the ground conditions actually encountered in the explorations. Conditions between and below explorations are inferred, not known.',
    ],
    tables: [], figures: [], notes: [],
  }
}

function s22Limitations(inv: Investigation): ReportSection {
  return {
    no: 22, title: 'Limitations',
    status: 'complete',
    paragraphs: [
      `This report is based on ${inv.boreholes.length} exploration${inv.boreholes.length === 1 ? '' : 's'} at discrete locations. Ground conditions between and below those locations are INFERRED from them and may differ. Where conditions exposed during construction differ from those described here, the recommendations must be reviewed.`,
      'The report has been prepared for the named project and site only, and should not be relied upon for any other purpose, site or scheme.',
      'Laboratory results describe the specimens tested. Their extension to a stratum is an engineering judgement, and the parameter table records which values rest on measurement and which on correlation or assumption.',
      'Calculations reproduce published methods within their stated limits; where an analysis has been carried out beyond the range its method was calibrated over, that is noted in the relevant section.',
    ],
    tables: [], figures: [], notes: [],
  }
}

// ── Assembly ──────────────────────────────────────────────────────────────

/**
 * Build the whole document. Sections that cannot be supported by the data are
 * PRESENT and marked, never dropped — see the module header.
 */
export function buildSoilsReport(inv: Investigation, opts: ReportOptions = {}): SoilsReport {
  const m = inv.meta
  const issues = validateInvestigation(inv)
  const blockingIssues = issues.filter((i) => i.severity === 'error').map((i) => i.message)

  const sections: ReportSection[] = [
    s1Introduction(inv),
    missing(2, 'Site description', 'Site description, topography and surface features are not held in the investigation record; they are entered on the report cover sheet.'),
    missing(3, 'Regional geology and seismicity', 'Regional geology requires a published geological map and the seismic hazard for the site, neither of which is held in this record.'),
    s4FieldWork(inv),
    s5Stratigraphy(inv),
    s6Groundwater(inv),
    s7Spt(inv),
    s8Laboratory(inv),
    s9Classification(inv),
    s10Parameters(inv),
    missing(11, 'Seismic site classification',
      'Site class requires a shear-wave velocity profile, or the N̄ / s̄u averages over the top 30 m with the hole extending to that depth. Where the hole is shallower, the class cannot be established from this data alone.'),
    s12Liquefaction(inv, opts),
    missing(13, 'Bearing capacity', 'Bearing capacity depends on a proposed footing geometry and founding depth, which are a design input rather than an investigation record. The /geotech calculator computes it from the parameters in section 10.'),
    missing(14, 'Settlement', 'Settlement analysis requires the proposed loads and footing dimensions in addition to the compressibility parameters.'),
    missing(15, 'Lateral earth pressure', 'Earth-pressure coefficients depend on the retaining structure geometry and the movement it can tolerate, which are a design input.'),
    s16Recommendations(opts),
    missing(17, 'Excavation and temporary works', 'Temporary works depend on the proposed excavation geometry, sequence and adjacent structures.'),
    missing(18, 'Construction considerations', 'Requires the proposed construction methodology.'),
    missing(19, 'Slope stability', 'Slope stability requires a slope geometry. Where the site is level and no cut or fill is proposed, this section is not applicable rather than incomplete — state which.'),
    missing(20, 'Corrosion and chemical attack', 'Requires sulfate, chloride, pH and resistivity testing, none of which is recorded.'),
    s21References(inv),
    s22Limitations(inv),
  ]

  const gaps = sections
    .filter((s) => s.status !== 'complete' && s.gap)
    .map((s) => ({ section: s.no, title: s.title, gap: s.gap! }))

  return {
    title: m.title || 'Geotechnical investigation report',
    investigationNo: m.investigationNo,
    projectName: m.site.projectName,
    location: m.site.location ?? '',
    reportDate: opts.reportDate ?? m.reportDate ?? new Date().toISOString().slice(0, 10),
    preparedBy: opts.preparedBy ?? m.engineer,
    sections,
    gaps,
    completeness: sections.filter((s) => s.status === 'complete').length / sections.length,
    blockingIssues,
  }
}

function s9Classification(inv: Investigation): ReportSection {
  const layers = inv.boreholes.flatMap((b) => b.layers.map((l) => ({ b, l })))
  if (!layers.length) return missing(9, 'Soil classification', 'No strata to classify.')

  // THREE SYSTEMS SIDE BY SIDE, NOT RECONCILED. They answer different
  // questions and disagree by design — see the header of each engine. A layer
  // reads its systems off the sample that speaks for it; the USCS column keeps
  // the LOGGED symbol, which may have come from a description rather than a
  // test, and is the one column that survives with no laboratory data at all.
  const withSample = layers.map(({ b, l }) => {
    const classified = b.samples
      .filter((s) => s.layerId === l.id)
      .map((s) => classifySample(s))
    return {
      b, l,
      usda: classified.find((c) => c.usda)?.usda,
      aashto: classified.find((c) => c.aashto?.label)?.aashto,
    }
  })

  const rows = withSample.map(({ b, l, usda, aashto }) => {
    const family = soilFamily(l.symbol, l.name)
    return [
      `${b.name} / ${l.name}`,
      l.symbol ?? '—',
      aashto?.label ?? '—',
      usda?.name ?? '—',
      family,
      isCohesive(family) ? 'cohesive' : family === 'unknown' ? '—' : 'cohesionless',
    ]
  })

  const unknown = rows.filter((r) => r[4] === 'unknown').length
  const noTexture = rows.filter((r) => r[3] === '—').length

  // A missing USDA texture is a NOTE, not a gap. It is supplementary to the
  // engineering classification, and marking the section incomplete for want of
  // an agronomic name would tell an engineer their report is short of something
  // it never needed.
  const notes = noTexture
    ? [`${noTexture} of ${rows.length} layers carry no USDA texture. The triangle is drawn on the clay fraction finer than 0.002 mm, which no sieve reaches — a hydrometer analysis (${cite('d7928')}) on a sample from each layer is what supplies it.`]
    : []

  return {
    no: 9, title: 'Soil classification',
    status: unknown ? 'partial' : 'complete',
    gap: unknown ? `${unknown} layer${unknown === 1 ? '' : 's'} could not be assigned a soil family from the description or symbol, so the cohesive/cohesionless split — which decides which methods apply — is undetermined for them.` : undefined,
    paragraphs: [
      `Engineering classification follows ${cite('d2487')} (USCS) and ${cite('m145')} (AASHTO). The cohesive/cohesionless split governs which analysis methods apply: a sand method applied to a clay returns a number, and the number is wrong.`,
      'The USDA texture (Soil Survey Manual, NRCS) is reported alongside for agricultural, drainage and erosion work. The three systems set their size boundaries in different places — USDA splits sand from silt at 0.05 mm where the other two use the 0.075 mm No. 200 sieve, and USDA and AASHTO name their fines by size where USCS names them by plasticity — so the three columns are not expected to agree and are not reconciled here.',
    ],
    tables: [{ head: ['Layer', 'USCS', 'AASHTO', 'USDA texture', 'Family', 'Behaviour'], rows }],
    figures: [], notes,
  }
}

function s21References(inv: Investigation): ReportSection {
  const standards = new Set<string>()
  for (const b of inv.boreholes) {
    for (const s of b.samples) {
      if (s.standard) standards.add(cite(s.standard))
      for (const t of s.tests) standards.add(cite(t.standard))
    }
    if (b.spt.length) standards.add(cite('d1586'))
  }
  const refs = [
    'Youd, T.L. et al. (2001). Liquefaction Resistance of Soils: Summary Report from the 1996 NCEER and 1998 NCEER/NSF Workshops. J. Geotech. Geoenviron. Eng. 127(10).',
    'Das, B.M. Principles of Foundation Engineering.',
    'National Structural Code of the Philippines (NSCP) 2015.',
  ]
  return {
    no: 21, title: 'References and standards',
    status: 'complete',
    paragraphs: [],
    tables: [
      ...(standards.size ? [{ title: 'Test standards applied', head: ['Standard'], rows: [...standards].sort().map((s) => [s]) }] : []),
      { title: 'References', head: ['Reference'], rows: refs.map((r) => [r]) },
    ],
    figures: [], notes: [],
  }
}
