// Documentation content — surveying, transportation and water resources.
// These are the board-exam pillars outside structural/geotechnical work.
import type { DocTool } from './docsModel'

export const FIELD_TOOLS: DocTool[] = [
  {
    id: 'surveying',
    name: 'Surveying Toolbox',
    route: '/surveying',
    group: 'Surveying',
    summary: 'Four board-exam classics in one shell: differential leveling, traverse closure and area, simple circular curves, and earthwork with mass haul.',
    basis: 'Plane surveying: HI and rise-and-fall book reduction, Bowditch/compass rule, DMD area, average end area with the prismoidal correction.',
    sections: [
      {
        id: 'surveying-leveling',
        title: 'Leveling',
        controls: [
          { kind: 'field', name: 'Station rows', what: 'The field book: backsight and foresight on turning points; a lone intermediate sight marks a profile point read off the running HI.' },
          { kind: 'field', name: 'Start elevation', unit: 'm', what: 'Elevation of the first benchmark; the datum the whole run hangs from.' },
          { kind: 'field', name: 'Known end elevation', unit: 'm', what: 'Closing benchmark — when given, the misclosure is distributed over the points by setups elapsed.' },
          { kind: 'field', name: 'Path length K', unit: 'km', what: 'Rates the misclosure against the 4√K / 8√K / 12√K order-of-accuracy bands.' },
          { kind: 'output', name: 'Level book', what: 'Full reduction by HI and rise & fall side by side, with the page check ΣBS−ΣFS = Σrise−Σfall = Δelev.' },
        ],
      },
      {
        id: 'surveying-traverse',
        title: 'Traverse',
        controls: [
          { kind: 'field', name: 'Courses', what: 'Length plus direction per course — a quadrant bearing (N 45-30 E) or an azimuth in degrees.' },
          { kind: 'choice', name: 'Rule', what: 'Bowditch (compass) corrections in proportion to length, or the transit rule in proportion to |lat|/|dep|.' },
          { kind: 'output', name: 'Closure & precision', what: 'Latitude/departure errors, linear misclosure and the 1-in-N precision against the perimeter.' },
          { kind: 'output', name: 'Area', what: 'Area by double-meridian distances over the adjusted courses, in m² and hectares, with the polygon drawn.' },
        ],
      },
      {
        id: 'surveying-curves',
        title: 'Curves',
        controls: [
          { kind: 'field', name: 'Radius R', unit: 'm', what: 'Curve radius; the primary geometric given.' },
          { kind: 'field', name: 'Central angle Δ', unit: '°', what: 'The deflection angle between tangents; with R it fixes every element.' },
          { kind: 'field', name: 'PI station', unit: 'm', what: 'Station of the point of intersection; PC = PI − T and PT = PC + L.' },
          { kind: 'field', name: 'Staking interval', unit: 'm', what: 'Full-station spacing for the deflection table; first and last chords are sub-chords.' },
          { kind: 'output', name: 'Staking table', what: 'Chords from the PC, incremental and total deflections — the total at the PT equals Δ/2, the field check.' },
        ],
      },
      {
        id: 'surveying-earthwork',
        title: 'Earthwork',
        controls: [
          { kind: 'field', name: 'Sections', what: 'One row per station: cut and fill cross-section areas (m²); optional middle areas enable the prismoidal check.' },
          { kind: 'field', name: 'Factors', what: 'Cut shrinkage and fill bulking applied before the mass curve accumulates.' },
          { kind: 'output', name: 'Volumes', what: 'End-area volumes per interval with the prismoidal correction wherever a middle section is known.' },
          { kind: 'output', name: 'Mass-haul diagram', what: 'Cumulative (cut − fill) ordinates; rising is surplus, falling is fill demand, the ends read borrow and waste.' },
        ],
      },
    ],
  },
  {
    id: 'traffic-volume',
    name: 'Traffic Volume',
    route: '/traffic-volume',
    group: 'Transportation',
    summary: 'Peak-hour factor and design flow rate, design-hour volumes from K and D, and the compound-growth AADT projection.',
    basis: 'Standard traffic-engineering counting relations (PHF, K and D factors); compound growth AADTₙ = AADT₀(1+g)ⁿ.',
    sections: [
      {
        id: 'traffic-volume-peak',
        title: 'Peak hour',
        controls: [
          { kind: 'field', name: 'Peak-hour volume V', unit: 'veh/h', what: 'Total vehicles counted in the peak hour.' },
          { kind: 'field', name: 'Busiest 15 minutes V₁₅', unit: 'veh', what: 'The heaviest quarter hour; PHF = V/(4·V₁₅) and the design flow rate is V/PHF.' },
        ],
      },
      {
        id: 'traffic-volume-design',
        title: 'Design hour',
        controls: [
          { kind: 'field', name: 'ADT', unit: 'veh/day', what: 'Average daily traffic, both directions.' },
          { kind: 'field', name: 'K factor', what: 'Share of ADT in the design (30th-highest) hour; planning range ≈ 0.08–0.13.' },
          { kind: 'field', name: 'D factor', what: 'Peak-direction share; DDHV = ADT·K·D is what lanes are sized against.' },
        ],
      },
      {
        id: 'traffic-volume-growth',
        title: 'Growth',
        controls: [
          { kind: 'field', name: 'Base AADT / growth / years', what: 'Compounds the count to the design year; the factor (1+g)ⁿ is shown in the worked solution.' },
        ],
      },
    ],
  },
  {
    id: 'signal-timing',
    name: 'Signal Timing',
    route: '/signal-timing',
    group: 'Transportation',
    summary: "Webster's optimal cycle for a fixed-time signal: flow ratios, green splits, saturation degrees, and HCM delay with the LOS letter.",
    basis: "Webster's method C₀ = (1.5L+5)/(1−Y) and his three-term delay; HCM signalized LOS bands (A ≤ 10 … E ≤ 80 s/veh).",
    sections: [
      {
        id: 'signal-timing-phases',
        title: 'Phases',
        controls: [
          { kind: 'field', name: 'q', unit: 'veh/h', what: 'Critical arrival flow of the phase — the busiest movement it serves.' },
          { kind: 'field', name: 's', unit: 'veh/h', what: 'Saturation flow for the same movement; y = q/s is the phase flow ratio.' },
          { kind: 'field', name: 'Lost time', unit: 's', what: 'Startup plus clearance lost per cycle; Σl is stripped off the cycle before greens are shared.' },
          { kind: 'field', name: 'Cycle override', unit: 's', what: 'Optional: use an agency cycle instead of Webster\u2019s optimum; splits recompute against it.' },
        ],
      },
      {
        id: 'signal-timing-results',
        title: 'Results',
        controls: [
          { kind: 'output', name: 'Timing sheet', what: 'Y, L, C₀, effective greens gᵢ = (yᵢ/Y)(C−L), and the cycle drawn to scale.' },
          { kind: 'output', name: 'Delay & LOS', what: "Webster delay per phase and the flow-weighted average, mapped to the HCM letter; X ≥ 1 forces F." },
        ],
      },
    ],
  },
  {
    id: 'traffic-queue',
    name: 'Traffic Queues',
    route: '/traffic-queue',
    group: 'Transportation',
    summary: 'Deterministic D/D/1 accumulation against a bottleneck — longest queue, dissipation time, total and average delay — with the M/M/1 benchmark.',
    basis: 'Deterministic queueing: cumulative arrival–departure curves integrated exactly on whole minutes; M/M/1 with ρ = λ/μ for comparison.',
    sections: [
      {
        id: 'traffic-queue-inputs',
        title: 'Queue',
        controls: [
          { kind: 'field', name: 'Arrival periods', what: 'Piecewise-constant arrival rates (veh/h) and their durations in whole minutes — the classic toll-booth story.' },
          { kind: 'field', name: 'Service rate μ', unit: 'veh/h', what: 'The bottleneck rate; the queue grows at (λ−μ) whenever arrivals outrun it.' },
          { kind: 'field', name: 'M/M/1 λ and μ', unit: 'veh/h', what: 'Poisson benchmark at the same rates: ρ, Lq, Wq against the deterministic floor.' },
        ],
      },
      {
        id: 'traffic-queue-results',
        title: 'Results',
        controls: [
          { kind: 'output', name: 'Cumulative curves', what: 'Arrivals and departures drawn together; the vertical gap is the standing queue, the area between them the total delay.' },
          { kind: 'output', name: 'Delay', what: 'Total delay in veh·min and the average per vehicle over everything that queued.' },
        ],
      },
    ],
  },
  {
    id: 'rational-method',
    name: 'Rational Method',
    route: '/rational-method',
    group: 'Water resources',
    summary: 'Peak runoff for a small catchment: composite C, time of concentration by Kirpich or FAA, intensity from a value or an IDF curve, and Q = CiA/360.',
    basis: 'Rational method Q = C·i·A/360 (m³/s, mm/h, ha); Kirpich Tc = 0.01947·L^0.77·S^−0.385 (SI); FAA overland flow; textbook IDF i = a/(Tc+b)^c.',
    sections: [
      {
        id: 'rational-catchment',
        title: 'Catchment',
        controls: [
          { kind: 'field', name: 'Sub-areas', what: 'Coefficient C (0–1) and area (ha) per surface; the composite C weights them by area.' },
        ],
      },
      {
        id: 'rational-tc',
        title: 'Time of concentration',
        controls: [
          { kind: 'choice', name: 'Method', what: 'Kirpich (L in m, S in m/m), FAA overland flow (L converted to feet, S in percent, C inside the formula), or a directly given Tc.' },
          { kind: 'field', name: 'L / S', what: 'Hydraulically longest path and its slope; Tc is floored at the 5-minute rational-method minimum.' },
        ],
      },
      {
        id: 'rational-intensity',
        title: 'Intensity & flow',
        controls: [
          { kind: 'choice', name: 'Source', what: 'A direct design intensity, or the IDF form i = a/(Tc+b)^c with the exponent defaulting to 1.' },
          { kind: 'output', name: 'Peak flow Q', what: 'Q = C·i·A/360 in m³/s, with L/s and cfs beside it and the catchment drawn to scale.' },
        ],
      },
    ],
  },
]
