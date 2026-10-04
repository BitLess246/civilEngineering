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
  {
    id: 'open-channel',
    name: 'Open Channel Flow',
    route: '/open-channel',
    group: 'Water resources',
    summary: 'Three hydraulics modes in one shell: Manning normal depth, critical depth with the specific-energy curve, and the hydraulic jump with its energy balance.',
    basis: "Manning Q = (1/n)A·R^2/3·√S solved by bisection; critical condition Q²T/(gA³) = 1; sequent depths from the momentum function M = Q²/(gA) + A·ȳ; rectangular jump y₂ = (y₁/2)(√(1+8Fr₁²)−1).",
    sections: [
      {
        id: 'open-channel-normal',
        title: 'Normal depth',
        controls: [
          { kind: 'choice', name: 'Shape', what: 'Rectangular, trapezoidal (b, side slope z), triangular, or a circular pipe — geometry per depth is derived, not tabulated.' },
          { kind: 'field', name: 'Manning n', what: 'Roughness; 0.013 concrete, 0.014–0.017 earthen channels, 0.025 natural streams.' },
          { kind: 'field', name: 'Bed slope S', what: 'Channel slope in percent or m/m; uniform flow is assumed along it.' },
          { kind: 'output', name: 'yn, V, Fr', what: 'The depth Manning settles at, the velocity, and the Froude number with the flow state; a circular pipe that cannot carry Q reports its peak capacity near y/D = 0.938 instead of a fake root.' },
        ],
      },
      {
        id: 'open-channel-critical',
        title: 'Critical depth & specific energy',
        controls: [
          { kind: 'field', name: 'Discharge Q', what: 'The flow whose critical state is sought; the control condition Q²T/(gA³) = 1 is solved by bisection for every shape.' },
          { kind: 'field', name: 'Probe depth y', what: 'Optional — locates the depth on the E–y curve, labels the limb it sits on, and marks its alternate depth at the same energy.' },
          { kind: 'output', name: 'E–y curve', what: 'Specific energy against depth with Emin, yc, the 45° asymptote and both limbs drawn — the picture every textbook sketches.' },
        ],
      },
      {
        id: 'open-channel-jump',
        title: 'Hydraulic jump',
        controls: [
          { kind: 'field', name: 'Approach depth y₁', what: 'The supercritical depth arriving at the apron; Fr₁ must exceed 1 or no jump can form.' },
          { kind: 'output', name: 'Sequent depth y₂', what: 'Closed form for rectangles, momentum-function bisection for trapezoids, triangles and pipes.' },
          { kind: 'output', name: 'ΔE and power', what: 'Energy head destroyed, kilowatts dissipated (γQΔE), the USBR-style jump class from Fr₁, and the classical 6.1·y₂ length.' },
        ],
      },
    ],
  },
  {
    id: 'pipe-flow',
    name: 'Pipe Flow',
    route: '/pipe-flow',
    group: 'Water resources',
    summary: 'Friction loss in a full pipe by Hazen–Williams or Darcy–Weisbach with an iterated Colebrook friction factor, plus ΣK minor losses.',
    basis: 'Hazen–Williams V = 0.8492·C·R^0.63·S^0.54 (SI) with the equivalent Q-form; Darcy–Weisbach hf = f(L/D)V²/2g; laminar f = 64/Re; turbulent Colebrook–White by fixed-point iteration.',
    sections: [
      {
        id: 'pipe-flow-inputs',
        title: 'Pipe and flow',
        controls: [
          { kind: 'field', name: 'L / D / Q', what: 'Length, inside diameter and discharge; velocity follows from the flow area.' },
          { kind: 'field', name: 'ΣK', what: 'Sum of minor-loss coefficients — bends, valves, entrances — applied as K·V²/2g on top of friction.' },
        ],
      },
      {
        id: 'pipe-flow-hw',
        title: 'Hazen–Williams',
        controls: [
          { kind: 'field', name: 'C', what: 'Water-main roughness, 50–160; PVC ≈ 150, new cast iron ≈ 130, old steel ≈ 100. Age degrades C — design on the ten-year value.' },
          { kind: 'output', name: 'S / hf', what: 'The hydraulic gradient in m/m and per 100 m, plus the total head loss with minor losses.' },
        ],
      },
      {
        id: 'pipe-flow-dw',
        title: 'Darcy–Weisbach',
        controls: [
          { kind: 'choice', name: 'Material ε', what: 'Equivalent sand-grain roughness presets — PVC 0.0015 mm, commercial steel 0.045 mm, cast iron 0.26 mm, concrete 0.3 mm.' },
          { kind: 'field', name: 'Temperature', what: 'Water temperature picks the kinematic viscosity by interpolation (0–40 °C table).' },
          { kind: 'output', name: 'Re / f / hf', what: 'Reynolds number, the friction factor (64/Re laminar, iterated Colebrook turbulent, transition band flagged), and the head loss with the HGL/EGL profile.' },
        ],
      },
    ],
  },
  {
    id: 'concrete-mix',
    name: 'Concrete Mix Design',
    route: '/concrete-mix',
    group: 'Concrete design',
    summary: 'ACI 211.1 absolute-volume design: w/c from strength, water and air from the slump table, rock from the dry-rodded table, sand fills the remainder, then moisture corrections.',
    basis: 'ACI 211.1 Tables 6.3.3 (water), 6.3.4(a) (w/c vs strength), 6.3.6 (CA bulk volume vs FM); absolute volumes at SG 3.15 cement; wet-stockpile moisture corrections.',
    sections: [
      {
        id: 'concrete-mix-targets',
        title: 'Design targets',
        controls: [
          { kind: 'field', name: "f'cr", what: 'Target mean strength, 14–45 MPa; the psi table interpolates linearly and clamps past its edges.' },
          { kind: 'choice', name: 'Slump / size / exposure', what: 'Slump band, maximum aggregate size, and mild/moderate/severe exposure — the latter two switch to the air-entrained water column and total-air targets.' },
        ],
      },
      {
        id: 'concrete-mix-aggregates',
        title: 'Aggregates & moisture',
        controls: [
          { kind: 'field', name: 'FM / DRUW / SG', what: 'Fineness modulus picks the coarse-aggregate bulk volume; dry-rodded unit weight turns it into kilograms; specific gravities divide the absolute volumes.' },
          { kind: 'field', name: 'Moisture / absorption', what: 'Stockpile moisture and absorption per aggregate, in percent; batch water is the design water minus the free water the damp aggregates bring.' },
        ],
      },
      {
        id: 'concrete-mix-output',
        title: 'Batch sheet',
        controls: [
          { kind: 'output', name: 'Weights per m³ and per batch', what: 'Wet stockpile weights, water to add, 40-kg bag count, and the absolute-volume budget drawn as the 1 m³ bar.' },
          { kind: 'output', name: 'Fresh density check', what: 'Resolved density against the ACI first-estimate table — a drift beyond ~4 % is flagged for a unit-weight test on trial batch 1.' },
        ],
      },
    ],
  },
  {
    id: 'section-properties',
    name: 'Section Properties',
    route: '/section-properties',
    group: 'Analysis & modelling',
    summary: 'Area, centroid, moments of inertia, section moduli and radii of gyration for single shapes and built-up rectangle stacks, with the parallel-axis table shown row by row.',
    basis: 'Closed forms for rectangle/circle/tube; composite ȳ = ΣAȳ/ΣA and I = Σ(Ī + Ad²) for I/T/channel/angle and any custom rectangle stack.',
    sections: [
      {
        id: 'section-properties-presets',
        title: 'Presets',
        controls: [
          { kind: 'choice', name: 'Shape', what: 'Rectangle, circle, hollow circle, built-up I, T, channel, equal-leg angle, or a free-form rectangle stack — the built-up shapes show their decomposition dashed in the drawing.' },
          { kind: 'field', name: 'Dimensions', what: 'Millimetres throughout; the tube needs d < D, the I and T need depth beyond twice the flange thickness.' },
        ],
      },
      {
        id: 'section-properties-output',
        title: 'Properties',
        controls: [
          { kind: 'output', name: 'A, centroid', what: 'Area and the centroid measured from the bottom and left edges; asymmetric sections report top and bottom fibre distances separately.' },
          { kind: 'output', name: 'Ix, Iy, S, r', what: 'Moments of inertia about the centroidal axes, section moduli on the weakest fibre, and radii of gyration.' },
          { kind: 'output', name: 'Parallel-axis table', what: 'Per-rectangle rows: local I, the transfer term A·d², and the running sum — the worked solution prints every row.' },
        ],
      },
    ],
  },
  {
    id: 'geometric-design',
    name: 'Geometric Design',
    route: '/geometric-design',
    group: 'Transportation',
    summary: 'Highway alignment classics in one shell: stopping sight distance, parabolic vertical curves with crest/sag sight-distance checks, and the superelevation balance with minimum radius.',
    basis: 'AASHTO Green Book forms: SSD = 0.278Vt + V²/254(f±G); crest L = AS²/658 (1.08 m eye, 0.60 m object); sag headlight L = AS²/(120+3.5S); comfort L ≥ AV²/395; e + f = V²/127R.',
    sections: [
      {
        id: 'geometric-ssd',
        title: 'Stopping sight distance',
        controls: [
          { kind: 'field', name: 'Speed / time / friction', what: 'Design speed in km/h, the 2.5 s AASHTO reaction time, and the braking friction (0.35 design default).' },
          { kind: 'field', name: 'Grade G', what: 'Positive on an upgrade (shorter), negative on a downgrade (longer) — it enters the braking constant as f ± G.' },
          { kind: 'output', name: 'SSD', what: 'Reaction and braking pieces reported separately with the composition drawn to scale.' },
        ],
      },
      {
        id: 'geometric-curve',
        title: 'Vertical curves',
        controls: [
          { kind: 'field', name: 'g₁, g₂, L', what: 'Entry and exit grades in percent and the curve length; the mode follows the grades — g₁ ≥ g₂ is a crest, otherwise a sag.' },
          { kind: 'field', name: 'PVI station / elevation', what: 'The curve hangs half its length either side of the PVI; BVC and EVC elevations come off the tangent grades.' },
          { kind: 'field', name: 'Sight distance S', what: 'Checked against the AASHTO height criteria — eye 1.08 m over object 0.60 m on a crest, headlight 0.60 m at 1° on a sag; the S ≤ L and S > L branches are resolved automatically.' },
          { kind: 'output', name: 'Curve geometry', what: 'A, K, r, the PVI external offset e = A·L/800, and the high/low point station and elevation, with the profile drawn.' },
        ],
      },
      {
        id: 'geometric-super',
        title: 'Superelevation',
        controls: [
          { kind: 'field', name: 'V, R, eMax, fMax', what: 'Design speed, radius and the two design limits (commonly 8 % banking, 0.15 friction).' },
          { kind: 'output', name: 'e, f, Rmin, D', what: 'The demand V²/127R split friction-first then capped at eMax, the minimum radius from the two limits together, and the arc degree of curve — a radius below Rmin is flagged.' },
        ],
      },
    ],
  },
  {
    id: 'weir-flow',
    name: 'Weir Flow',
    route: '/weir-flow',
    group: 'Water resources',
    summary: 'Discharge over the standard measurement weirs — Francis rectangular suppressed or end-contracted, Cipolletti trapezoid, V-notch, and broad-crested — in either direction: Q from the head, or the head for a target Q.',
    basis: 'Francis Q = 1.84·L·H^1.5 with the 0.1·nH contraction correction and the ha velocity-of-approach form; Cipolletti 1.86·L·H^1.5; V-notch (8/15)Cd√(2g)tan(θ/2)H^2.5 with Cone\u2019s 90° cross-check; broad-crested critical-flow 1.705·Cb·b·H^1.5.',
    sections: [
      {
        id: 'weir-shapes',
        title: 'Weir types',
        controls: [
          { kind: 'choice', name: 'Weir type', what: 'Suppressed rectangular (no end contractions), contracted (0–2 ends), Cipolletti, V-notch with adjustable angle and Cd, or broad-crested with a loss coefficient.' },
          { kind: 'field', name: 'Head or target Q', what: 'Head above the crest when solving Q; a target discharge when solving H — the inverse runs as a bracketed bisection on the monotone rating curve.' },
          { kind: 'field', name: 'Approach head ha', what: 'Optional Va²/2g for the rectangular weirs: H becomes H + ha with the ha^1.5 term removed (the full Francis form).' },
        ],
      },
      {
        id: 'weir-output',
        title: 'Results',
        controls: [
          { kind: 'output', name: 'Q and effective length', what: 'Discharge in m³/s and L/s, the wetted crest length after any contraction correction, and the section drawn with the head dimensioned.' },
          { kind: 'output', name: 'Cross-checks', what: 'Cone\u2019s empirical 90° V-notch rating beside the general formula, and contraction corrections printed explicitly in the worked solution.' },
        ],
      },
    ],
  },
  {
    id: 'pile-capacity',
    name: 'Pile Capacity',
    route: '/pile-capacity',
    group: 'Foundations & geotechnical',
    summary: 'Static capacity of a single driven pile through layered soil: α-method adhesion in clay, K·σ′·tanδ friction in sand, 9·cu end bearing in clay and Meyerhof q′·Nq capped at 0.5·pa·Nq·tanφ in sand.',
    basis: 'Das/Tomlinson textbook forms — α interpolating 1.0 (cu ≤ 25 kPa) to 0.5 (cu ≥ 70 kPa); K = 1−sinφ and δ = φ−5° defaults; Nq = e^{π·tanφ}·tan²(45+φ/2); submerged unit weights below the water table.',
    sections: [
      {
        id: 'pile-section',
        title: 'Pile and profile',
        controls: [
          { kind: 'choice', name: 'Section', what: 'Circular or square concrete, or a steel pipe with wall thickness (gross plugged area for end bearing).' },
          { kind: 'field', name: 'Layers', what: 'Any number of clay/sand layers with thickness, cu or φ, and bulk/saturated unit weights; the tip bears in the last layer reached.' },
          { kind: 'field', name: 'Water table / FS', what: 'Effective stresses switch to submerged weight below the water table; FS divides the ultimate capacity (default 3).' },
        ],
      },
      {
        id: 'pile-output',
        title: 'Capacity',
        controls: [
          { kind: 'output', name: 'Qs per layer', what: 'Shaft friction per layer with α, K, δ, β and the mid-depth σ′ printed — the profile drawing bars each layer\u2019s share.' },
          { kind: 'output', name: 'Qp, Qult, Qall', what: 'End bearing with the Meyerhof cap flagged when it governs, the ultimate sum, and the allowable value; per-axle detail feeds the worked solution.' },
        ],
      },
    ],
  },
  {
    id: 'bridge-loading',
    name: 'Bridge Loading',
    route: '/bridge-loading',
    group: 'Analysis & modelling',
    summary: 'AASHTO HL-93 on a simple span: the design truck (rear axle spacing swept) and tandem walk exact influence lines, the 9.3 kN/m lane load rides along, IM = 33 % applies to the vehicle, and the lever rule brings everything to one girder.',
    basis: 'AASHTO LRFD 3.6.1.2/3.6.1.1.2 load model and multiple presence; lever-rule transverse distribution (sanctioned for exterior girders and shear) with a manual DF override for the 4.6.2.2 equations; influence lines from the engine behind /influence-lines.',
    sections: [
      {
        id: 'bridge-span',
        title: 'Span and deck',
        controls: [
          { kind: 'field', name: 'Span L', what: 'Simple-span length; the moment envelope, shear envelope and support reaction are all swept.' },
          { kind: 'choice', name: 'Girder / spacing / overhang', what: 'Interior girder (wheel on the beam line, partner 1.8 m into the span) or exterior girder (measured wheel positions on the strip with its overhang d to the edge).' },
          { kind: 'field', name: 'IM / DF override', what: 'Dynamic load allowance on the vehicle only (33 % default); a DF override rescales every combined number for the specification-equation value.' },
        ],
      },
      {
        id: 'bridge-output',
        title: 'Envelope and governing case',
        controls: [
          { kind: 'output', name: 'Moment envelope', what: 'Combined per-girder moment along the span with the governing truck or tandem parked at its worst position, drawn to scale.' },
          { kind: 'output', name: 'Shear and reaction', what: 'Peak shear (positive or negative, section reported) and the support reaction split into vehicle (with IM) and lane parts.' },
          { kind: 'output', name: 'Section influence line', what: 'The governing section\u2019s IL with each parked axle and its ordinate — Σ P·IL reproduces the vehicle effect by hand.' },
        ],
      },
    ],
  },
  {
    id: 'culvert',
    name: 'Culvert Hydraulics',
    route: '/culvert',
    group: 'Water resources',
    summary: 'FHWA HDS-5 headwater check for circular and box culverts: inlet control in its unsubmerged, transition and submerged nomograph forms against outlet control over the tailwater, the governing HW/D and the outlet velocity, plus a standard-size sweep for the minimum diameter.',
    basis: 'HDS-5 (Normann) Appendix A constants K/M/c/Y per entrance type with the −0.5·S slope term (+0.7·S mitered); transition interpolated linearly in Q between form 1 at HW/D = 1.0 and form 2 at 1.2; full-barrel outlet control H = [1+Ke+2g·n²L/R^1.333]·V²/2g with ho = max(TW, (dc+D)/2).',
    sections: [
      {
        id: 'culvert-input',
        title: 'Culvert and site',
        controls: [
          { kind: 'choice', name: 'Entrance type', what: 'Concrete square edge or groove end (headwall or projecting), CMP headwall / mitered / projecting, or a concrete box with flared wingwalls — each carries its own K, M, c, Y, Ke and n.' },
          { kind: 'field', name: 'Q, L, S, TW', what: 'Design discharge per barrel (split across identical barrels), barrel length, slope and the tailwater depth above the outlet invert.' },
          { kind: 'choice', name: 'Task', what: 'Check the headwater of a given size, or sweep the standard diameters for the smallest barrel whose governing headwater stays under the allowable depth.' },
        ],
      },
      {
        id: 'culvert-output',
        title: 'Results',
        controls: [
          { kind: 'output', name: 'HW inlet / outlet', what: 'Both control headwaters with the form that produced each, the total outlet head split into friction and entrance/velocity parts, and ho with dc.' },
          { kind: 'output', name: 'Governing HW and velocity', what: 'The deeper of the two controls as HW and HW/D, and the outlet velocity on the HDS-5 velocity depth (normal depth under inlet control, dc/TW/crown under outlet control) — scour notes when it runs hot.' },
        ],
      },
    ],
  },
  {
    id: 'pavement',
    name: 'Flexible Pavement',
    route: '/pavement',
    group: 'Transportation',
    summary: 'The AASHTO 1993 flexible workflow end to end: forecast design-lane ESALs from AADT, trucks and growth; solve the required structural number from the design equation; and close the layer equation a1·D1 + a2·D2·m2 + a3·D3·m3 with the section drawn to scale.',
    basis: 'AASHTO Guide for Design of Pavement Structures (1993): log W18 = ZR·S0 + 9.36·log(SN+1) − 0.20 + log(ΔPSI/2.7)/(0.40 + 1094/(SN+1)^5.19) + 2.32·log MR − 8.07 (MR in psi); ZR the exact inverse normal deviate, S0 = 0.45 typical; growth G = ((1+r)^n − 1)/r; layer coefficients per mm from the printed per-inch charts.',
    sections: [
      {
        id: 'pavement-traffic',
        title: 'Traffic and performance',
        controls: [
          { kind: 'field', name: 'AADT · T · TF · D · L', what: 'Two-way AADT, truck percentage, truck factor (ESALs per truck), directional split and design-lane factor — or enter W18 directly when a traffic study exists.' },
          { kind: 'field', name: 'Growth and period', what: 'Uniform annual growth rate over the design period gives the growth factor G; zero growth just multiplies by the years.' },
          { kind: 'field', name: 'R, S0, pt, MR', what: 'Reliability (ZR from the exact normal quantile), overall standard deviation, terminal serviceability against p0 = 4.2, and the subgrade resilient modulus in MPa.' },
        ],
      },
      {
        id: 'pavement-output',
        title: 'SN and layers',
        controls: [
          { kind: 'output', name: 'SN required', what: 'The structural number solved from the design equation by bisection — the RHS is strictly increasing in SN.' },
          { kind: 'output', name: 'Layer check', what: 'a1·D1 + a2·D2·m2 + a3·D3·m3 with editable coefficients (per mm), thicknesses and drainage factors; the section drawing labels each layer\u2019s contribution and flags any shortfall.' },
        ],
      },
    ],
  },
  {
    id: 'runoff',
    name: 'SCS Runoff',
    route: '/runoff',
    group: 'Water resources',
    summary: 'The NRCS curve-number chain for a design storm: composite CN from the land covers, retention S and initial abstraction Ia, runoff depth and volume, the TR-55 lag-method time of concentration, and the triangular unit-hydrograph peak.',
    basis: 'SCS-CN: S = 25400/CN − 254 mm, Ia = 0.2·S, Q = (P−Ia)²/(P−Ia+S); TR-55 lag T = L^0.8·(S+25.4)^0.7/(7069·√Y) with Tc = Tlag/0.6; triangular UH Tp = Δt/2 + 0.6·Tc and Qp = 0.208·A·Q/Tp — the SI twin of the 484 equation; volume V = 10·Q·A(ha).',
    sections: [
      {
        id: 'runoff-input',
        title: 'Catchment',
        controls: [
          { kind: 'field', name: 'Covers', what: 'Any number of named land covers with hectares and a curve number 30–100; the composite CN is the area-weighted mean.' },
          { kind: 'field', name: 'P, L, Y, Δt', what: 'Design storm depth, hydraulic (longest flow) length, average watershed slope, and the computation interval for the UH.' },
        ],
      },
      {
        id: 'runoff-output',
        title: 'Depth, timing, peak',
        controls: [
          { kind: 'output', name: 'Q and volume', what: 'Runoff depth from the CN loss model, the volumetric coefficient Q/P, and the volume in m³ — zero runoff is reported (with the reason) when P never exceeds Ia.' },
          { kind: 'output', name: 'Tc and Qp', what: 'Lag time, time of concentration, time to peak, the peak discharge and the 2.67·Tp base time, with the triangular hydrograph drawn.' },
        ],
      },
    ],
  },
  {
    id: 'bridge-rating',
    name: 'Bridge Rating',
    route: '/bridge-rating',
    group: 'Analysis & modelling',
    summary: 'AASHTO MBE design-load rating of a simple span: the HL-93 live load from the /bridge-loading machinery is rated against nominal flexural and shear resistances at inventory (γLL = 1.75) and operating (γLL = 1.35), in flexure and shear, with the envelope drawn against capacity.',
    basis: 'MBE 6A.4.2.1-1 RF = (φRn − γDC·DC − γDW·DW)/(γLL(1+IM)·LL) with γDC = 1.25, γDW = 1.50, φ = 1.0 (RC flexure and shear); permanent-load effects wL²/8 and wL/2; static live load from the HL-93 walk (÷(1+IM)) or user-supplied FE effects; a DF override rescales the lever-rule live load.',
    sections: [
      {
        id: 'rating-input',
        title: 'Span, loads, resistances',
        controls: [
          { kind: 'field', name: 'L and deck', what: 'Simple-span length with the lever-rule deck case (girder row, spacing, overhang) — or a distribution-factor override that rescales the live load directly.' },
          { kind: 'field', name: 'DC / DW / Mn / Vn', what: 'Per-girder structural and wearing-surface dead loads, and the nominal flexural and shear resistances at the critical sections.' },
          { kind: 'choice', name: 'Live load', what: 'The HL-93 span walk (same engine as /bridge-loading), or static per-girder effects pasted from an FE model; IM applies in both paths.' },
        ],
      },
      {
        id: 'rating-output',
        title: 'Rating factors',
        controls: [
          { kind: 'output', name: 'RF table', what: 'Inventory and operating RF for flexure and shear with the governing effect, a pass/restricted/operating-only verdict, and RF bars against the 1.0 line.' },
          { kind: 'output', name: 'Envelope vs capacity', what: 'The HL-93 per-girder moment envelope against φMn with the governing section marked; the worked solution prints every load factor.' },
        ],
      },
    ],
  },
  {
    id: 'gvf-profiles',
    name: 'GVF Profiles',
    route: '/gvf-profiles',
    group: 'Water resources',
    summary: 'Gradually-varied-flow water-surface profiles: normal and critical depths, the Chow classification (M1–M3, S1–S3, C, H2/H3, A2/A3), and an RK4 march of the GVF equation from the control, drawn over the reach with the yn/yc reference lines.',
    basis: 'GVF ODE dy/dx = (S0 − Sf)/(1 − Fr²) with Manning friction Sf = (Qn/AR^⅔)²; slope class from yn vs yc, zone from the control depth; supercritical controls march downstream, subcritical upstream; termination at the uniform-flow asymptote or critical depth (jump ahead). A standard-step energy march (E + hf balance) cross-checks the integration.',
    sections: [
      {
        id: 'gvf-input',
        title: 'Channel, flow, control',
        controls: [
          { kind: 'choice', name: 'Section', what: 'Rectangular, trapezoidal, triangular or circular — the same geometry engine as the open-channel modes.' },
          { kind: 'field', name: 'Q, n, S0, L', what: 'Discharge, Manning n, bed slope (zero or adverse allowed) and reach length.' },
          { kind: 'field', name: 'Control depth & end', what: 'The boundary depth with its end of the reach; auto follows the Froude rule (subcritical → downstream, supercritical → upstream).' },
        ],
      },
      {
        id: 'gvf-output',
        title: 'Classification and profile',
        controls: [
          { kind: 'output', name: 'Chow label', what: 'Slope class, zone and the M1…A3 label with yn, yc and the control Froude number.' },
          { kind: 'output', name: 'Water surface', what: 'The integrated profile over the reach with the uniform-flow and critical-depth lines, the control marked and the terminus reported (asymptote, jump ahead, or reach end).' },
        ],
      },
    ],
  },
  {
    id: 'muskingum',
    name: 'Muskingum Routing',
    route: '/muskingum',
    group: 'Water resources',
    summary: 'Route a flood wave through a river reach with the Muskingum method: K, X and Δt give three weighting coefficients that translate and attenuate the inflow hydrograph, with the stability window 2KX ≤ Δt ≤ 2K(1−X) enforced and the volume balance shown.',
    basis: 'S = K[X·I + (1−X)·O]; continuity discretised to O2 = C0·I2 + C1·I1 + C2·O1 with C0 = (0.5Δt − KX)/D, C1 = (0.5Δt + KX)/D, C2 = (K(1−X) − 0.5Δt)/D, D = K(1−X) + 0.5Δt, C0+C1+C2 = 1; steady start O0 = I0; coefficients below zero are refused.',
    sections: [
      {
        id: 'muskingum-input',
        title: 'Reach and hydrograph',
        controls: [
          { kind: 'field', name: 'K, X, Δt', what: 'Storage time constant (h), weighting factor 0–0.5 and routing interval — the page prints the live stability window.' },
          { kind: 'field', name: 'Inflow ordinates', what: 'Any number of m³/s ordinates at a uniform Δt; editable row by row.' },
        ],
      },
      {
        id: 'muskingum-output',
        title: 'Coefficients and peaks',
        controls: [
          { kind: 'output', name: 'C0 · C1 · C2', what: 'The three weights with the stability window for the given K, X, Δt.' },
          { kind: 'output', name: 'Peak & lag', what: 'Peak inflow vs routed peak outflow, the attenuation percent, the lag of the peak, and the volume identity trap(I) − trap(O) = ΔS drawn as paired hydrographs.' },
        ],
      },
    ],
  },
  {
    id: 'detention',
    name: 'Detention Pond',
    route: '/detention',
    group: 'Water resources',
    summary: 'Level-pool (storage-indication) routing of a triangular storm through a detention pond: trapezoidal stage–storage, an orifice and optional weir for stage–discharge, routed peak stage and outflow, attenuation and lag, and the end-to-end mass balance.',
    basis: 'Storage indication F = 2S/Δt + O stepped by F2 = (I1+I2) + (F1 − 2O1); trapezoidal prism S(h) = WLh + z(W+L)h² + 4/3·z²h³; orifice Cd·a·√(2gh) plus Francis weir C·Lw·hw^1.5; the strictly increasing F(h) curve is inverted by bisection each step; overtopping flagged when the peak stage passes the usable depth.',
    sections: [
      {
        id: 'detention-input',
        title: 'Basin, outlets, storm',
        controls: [
          { kind: 'field', name: 'Basin', what: 'Bottom width and length, side slope z, usable depth — the prism volume at any stage follows.' },
          { kind: 'field', name: 'Outlets', what: 'Orifice area, Cd and invert height, plus an optional rectangular weir (length, crest, Francis C).' },
          { kind: 'field', name: 'Storm & Δt', what: 'Triangular inflow (peak, time to peak, base time) sampled at the routing interval — the TR-55 shape from the SCS Runoff tool.' },
        ],
      },
      {
        id: 'detention-output',
        title: 'Routing result',
        controls: [
          { kind: 'output', name: 'Peaks & stage', what: 'Peak inflow vs outflow with attenuation and lag, the maximum stage against the usable depth (freeboard or overtopping), and the storage at the peak.' },
          { kind: 'output', name: 'Mass balance', what: 'Inflow volume = outflow volume + residual storage, with the error percent — plus paired hydrograph and stage drawings.' },
        ],
      },
    ],
  },
  {
    id: 'do-sag',
    name: 'DO Sag Curve',
    route: '/do-sag',
    group: 'Water resources',
    summary: 'The Streeter–Phelps oxygen sag downstream of an outfall: flow-weighted mixing of BOD and DO, temperature-corrected deoxygenation and reaeration rates, the closed-form deficit curve, and the critical time and minimum DO drawn against saturation.',
    basis: 'D(t) = kd·L0/(kr−kd)·(e^(−kd·t) − e^(−kr·t)) + D0·e^(−kr·t); mixing L0 and D0 flow-weighted at the outfall; k(T) = k20·θ^(T−20) with θ = 1.047 / 1.024; tc = ln[kr/kd·(1 − D0(kr−kd)/(kd·L0))]/(kr−kd); Dc = (kd·L0/kr)·e^(−kd·tc); DOsat from the Benson–Krause (USGS) polynomial; optional UNESCO-IHP reaeration estimate kr = 2.148·v^0.878/H^−1.48.',
    sections: [
      {
        id: 'dosag-input',
        title: 'River, effluent, kinetics',
        controls: [
          { kind: 'field', name: 'River & effluent', what: 'Flows with ultimate BOD and DO for both streams — the mix at the outfall is flow-weighted.' },
          { kind: 'field', name: 'T, kd20, kr20, u', what: 'Water temperature with the two 20 °C rates (θ-corrected), and the velocity that turns travel time into distance.' },
        ],
      },
      {
        id: 'dosag-output',
        title: 'Sag and critical point',
        controls: [
          { kind: 'output', name: 'Mix and rates', what: 'L0, DOmix, D0 and the corrected kd, kr with DOsat at the given temperature.' },
          { kind: 'output', name: 'tc · DOcrit', what: 'Critical time and distance, the critical deficit and minimum DO against the 2 mg/L stress line — an anoxic sag is flagged, and a river with no interior minimum says so.' },
        ],
      },
    ],
  },
  {
    id: 'rigid-pavement',
    name: 'Rigid Pavement',
    route: '/rigid-pavement',
    group: 'Transportation',
    summary: 'The AASHTO 1993 rigid design equation solved for the PCC slab thickness: design ESALs and reliability, modulus of rupture, load-transfer coefficient J and the drainage coefficient, with the bisection on the Guide\'s monotone RHS.',
    basis: 'log10 W18 = ZR·S0 + 7.35·log10(D+1) − 0.06 + log10[ΔPSI/3]/[1 + 1.624×10⁷/(D+1)^8.46] + (4.22 − 0.32·pt)·log10[sc′·Cd·(D^0.75 − 1.132)/(215.63·J·(D^0.75 − 18.42/(E/c)^0.25))]; p0 = 4.5 rigid; c = 0.25 strength ratio; US-unit core with SI inputs converted.',
    sections: [
      {
        id: 'rigid-input',
        title: 'Traffic, concrete, load transfer',
        controls: [
          { kind: 'field', name: 'W18 & reliability', what: 'Design ESALs (from /esal or /pavement) with the reliability and overall standard deviation S0 (rigid 0.30–0.50).' },
          { kind: 'field', name: 'sc′, E, Cd', what: 'Modulus of rupture (third-point), elastic modulus, and the drainage coefficient around 1.0.' },
          { kind: 'choice', name: 'J', what: 'Load-transfer coefficient ladder: 2.8 tied PCC shoulder … 3.2 untied — better transfer buys thinner slab.' },
        ],
      },
      {
        id: 'rigid-output',
        title: 'Slab thickness',
        controls: [
          { kind: 'output', name: 'D', what: 'Required slab thickness in mm and the Guide\'s inches, with the ZR/ΔPSI derivation and an equation round-trip check.' },
          { kind: 'output', name: 'Section drawing', what: 'The dowelled slab on granular base, to scale against the computed thickness.' },
        ],
      },
    ],
  },
  {
    id: 'roundabout',
    name: 'Roundabout Capacity',
    route: '/roundabout',
    group: 'Transportation',
    summary: 'One roundabout entry under the HCM 2010 model: circulating flow assembled from the four leg volumes, per-lane entry capacity from the exponential conflict formula, v/c, control delay and level of service.',
    basis: 'c = 1130·e^(−β×10⁻³·vc) with β = 1.02 single-lane, 0.70/0.75 two-lane right/left; delay by the HCM unsignalized procedure d = 3600/c + 900T[(x−1)+√((x−1)² + 8kBx/(cT))]/x; LOS thresholds A ≤ 10 … E ≤ 80 s/veh; conflict pattern per HCM Exhibit 21-2.',
    sections: [
      {
        id: 'roundabout-input',
        title: 'Entry and circulating flow',
        controls: [
          { kind: 'field', name: 've, PHF', what: 'Entry demand and peak-hour factor — flows are restated to the peak-15 rate.' },
          { kind: 'field', name: 'Leg volumes', what: 'The four entries assembled into the circulating stream the analysed entry faces, or a direct vc when the study gives it.' },
          { kind: 'choice', name: 'Lanes', what: 'Single-lane or two-lane entry (55/45 right-left split).' },
        ],
      },
      {
        id: 'roundabout-output',
        title: 'Capacity and LOS',
        controls: [
          { kind: 'output', name: 'c, v/c, reserve', what: 'Per-lane and entry capacity, the v/c ratio and the spare capacity before saturation.' },
          { kind: 'output', name: 'Delay · LOS', what: 'Control delay against the HCM letter grades, with the conflict diagram drawn for the entry.' },
        ],
      },
    ],
  },
  {
    id: 'esal',
    name: 'Axle Load ESALs',
    route: '/esal',
    group: 'Transportation',
    summary: 'A weighed axle-load census converted to design ESALs by the generalized fourth-power law: per-axle LEFs against the 80 kN standard, group loads shared across tandem/tridem axles, and the traffic side grown across the design period.',
    basis: 'LEF = (P/80)^4 with an editable exponent (3–5 spans the literature); groups cost n·(P_group/n/80)^4; W18 = 365·G·Σ ADT·LEF·D·L with G = ((1+r)^n − 1)/r.',
    sections: [
      {
        id: 'esal-input',
        title: 'Axle census and traffic',
        controls: [
          { kind: 'field', name: 'Axle rows', what: 'Name, axle kind (single/tandem/tridem), group load in kN and vehicles per day — the loadometer sheet.' },
          { kind: 'field', name: 'n, D, L', what: 'Load exponent, directional split and design-lane factor; annual growth and design period for the W18 accumulation.' },
        ],
      },
      {
        id: 'esal-output',
        title: 'LEFs and W18',
        controls: [
          { kind: 'output', name: 'Per-row LEF', what: 'Each row\'s equivalency factor and daily ESALs, summed into the design W18.' },
          { kind: 'output', name: 'Load–ESAL curve', what: 'The fourth-power wall with the fleet plotted on it — the 120 kN single at 5.06 ESALs is the classic example.' },
        ],
      },
    ],
  },
  {
    id: 'storm-sewer',
    name: 'Storm Sewer',
    route: '/storm-sewer',
    group: 'Water resources',
    summary: 'A linear storm-sewer ladder sized end to end: Rational Method flows with travel-time accumulation down the network, Manning full-flow capacity against the commercial diameter ladder, part-full velocity for self-cleansing, and the tc chain carried inlet to outfall.',
    basis: 'Q = Ccomp·i(tc)·ΣA/360 with i = a/(tc + b)^c; tc = max(inlet time, upstream tc + L/V); Manning Qf = (1/n)(πD²/4)(D/4)^(2/3)√S; sizing picks the smallest standard DN covering Q at a part-full (normal-depth) velocity ≥ Vmin.',
    sections: [
      {
        id: 'sewer-input',
        title: 'IDF, policy, runs',
        controls: [
          { kind: 'field', name: 'IDF a·b·c', what: 'The intensity law for the service area, entered once and shared by every run.' },
          { kind: 'field', name: 'Vmin · Vwarn', what: 'Self-cleansing floor and the erosion-check velocity.' },
          { kind: 'field', name: 'Run rows', what: 'Length, grade, Manning n and the attached inlet (area, C, inlet time) for each line, head-first.' },
        ],
      },
      {
        id: 'sewer-output',
        title: 'Sizes and the tc chain',
        controls: [
          { kind: 'output', name: 'Per-run Q · DN · V', what: 'Design flow, the standard diameter chosen, capacity utilization and travel time fed downstream.' },
          { kind: 'output', name: 'Profile & warnings', what: 'Longitudinal profile of sizes and grades, with velocity and capacity warnings flagged per run.' },
        ],
      },
    ],
  },
  {
    id: 'water-demand',
    name: 'Water Demand',
    route: '/water-demand',
    group: 'Water resources',
    summary: 'The municipal water-supply chain: population forecast on the design horizon (arithmetic, geometric, incremental or decreasing-rate), average/max-day/peak-hour demands at the service-level per-capita rate, Kuichling fire flow, and the storage reservoir breakdown.',
    basis: 'Pn by the four textbook growth laws; ADD = q·P with MDD = 1.30·ADD and PHD = 2.50·ADD (editable factors, LWUA-style practice); Kuichling Qf = 3182√P (L/min, P in thousands); storage = operating (25 % MDD) + fire reserve + emergency.',
    sections: [
      {
        id: 'demand-input',
        title: 'Forecast and demand levels',
        controls: [
          { kind: 'choice', name: 'Method', what: 'The growth law that fits the census pair; geometric takes a rate, the others take the census increment.' },
          { kind: 'field', name: 'q · factors', what: 'Per-capita demand (100–150 LPCD ladder) with the max-day and peak-hour peaking factors.' },
        ],
      },
      {
        id: 'demand-output',
        title: 'Demands and storage',
        controls: [
          { kind: 'output', name: 'ADD · MDD · PHD', what: 'The three design demands in m³/day and L/s — transmission sizes off MDD, distribution and pumping off PHD.' },
          { kind: 'output', name: 'Fire · storage', what: 'Kuichling fire flow for the chosen duration and the operating/fire/emergency storage stack, sanity-banded against days of MDD.' },
        ],
      },
    ],
  },
  {
    id: 'pump-station',
    name: 'Pump Station',
    route: '/pump-station',
    group: 'Water resources',
    summary: 'One pumping circuit end to end: the system curve the pipework demands against the pump curve the impeller gives, their bisection crossing as the duty point, the power chain down to the motor, and the NPSH margin that keeps the impeller off cavitation.',
    basis: 'H_sys = H_static + hf (Hazen–Williams both legs) + ΣK·V²/2g; H_pump = H0 − (H0 − Hd)(Q/Qd)²; duty at H_pump = H_sys; NPSHa = (Patm − Pv)/γ + z_suction − hf,suction against 1.3×NPSHr; powers ρgQH → shaft (ηp) → motor (ηm); affinity laws Q ∝ N, H ∝ N², P ∝ N³.',
    sections: [
      {
        id: 'pump-input',
        title: 'Pipework, pump, suction',
        controls: [
          { kind: 'field', name: 'System', what: 'Static lift and delivery head; suction and discharge legs with length, diameter, C and fitting K-units.' },
          { kind: 'field', name: 'Pump curve', what: 'Shutoff head and the rated point pin the falling parabola; efficiencies for the power chain.' },
          { kind: 'field', name: 'NPSH', what: 'Vapour-pressure head, suction arrangement (flooded or lift) and the datasheet NPSHr.' },
        ],
      },
      {
        id: 'pump-output',
        title: 'Duty, power, margin',
        controls: [
          { kind: 'output', name: 'Q* · H*', what: 'The operating point where the curves cross, with the water/shaft/motor power chain and kWh per m³.' },
          { kind: 'output', name: 'NPSH verdict', what: 'Available vs 1.3×required at the suction, and the curves drawing with the duty point marked.' },
        ],
      },
    ],
  },
  {
    id: 'eng-economy',
    name: 'Engineering Economy',
    route: '/eng-economy',
    group: 'Mathematics',
    summary: 'The board-exam money mathematics: time-value factors and gradients, NPV/IRR/payback on a cash-flow series, and depreciation with break-even — every line worked with the entered numbers.',
    basis: 'Single-payment and uniform-series factors (P/F, F/P, P/A, A/P, F/A, A/F); arithmetic and geometric gradients; effective rate (1+r/m)^m−1; NPV, IRR by bisection, simple and discounted payback; SL/SYD/DB depreciation; break-even and capitalized cost.',
    sections: [
      {
        id: 'economy-factors',
        title: 'Rate, horizon and gradients',
        controls: [
          { kind: 'field', name: 'Rate i · periods n', what: 'The per-period interest rate and the horizon every factor below is evaluated at.' },
          { kind: 'field', name: 'Gradients', what: 'Arithmetic gradient G (maintenance that worsens) and geometric first flow A1 growing at g percent.' },
          { kind: 'output', name: 'Factors', what: 'P/F, A/P, F/A, P/A with the numbers substituted, plus the gradient present worths and the effective annual rate.' },
        ],
      },
      {
        id: 'economy-project',
        title: 'Cash flows and verdict',
        controls: [
          { kind: 'field', name: 'Cash-flow series', what: 'Year-by-year amounts with the investment at t = 0; add or drop years freely.' },
          { kind: 'output', name: 'NPV · IRR · payback', what: 'Net present value at the hurdle rate, the break-even rate, and simple plus discounted payback — accept iff IRR clears the hurdle.' },
        ],
      },
      {
        id: 'economy-depreciation',
        title: 'Depreciation and break-even',
        controls: [
          { kind: 'choice', name: 'Method', what: 'Straight-line spreads evenly; sum-of-years-digits and declining-balance front-load the charge.' },
          { kind: 'output', name: 'Schedule · BE · cap cost', what: 'Year-by-year charge and book value, the break-even volume, and the A/i perpetuity price.' },
        ],
      },
    ],
  },
  {
    id: 'hydrostatics',
    name: 'Hydrostatics',
    route: '/hydrostatics',
    group: 'Mathematics',
    summary: 'Fluid at rest and in rigid-body motion: plane-surface force with its center of pressure, curved-gate components, buoyancy and metacentric stability, manometers, and accelerating or rotating vessels.',
    basis: 'F = γ·hc·A with yp = yc + Ixx,c/(yc·A); quarter-gate Fh on the projection and Fv as fluid weight; GM = KB + BM − KG; manometer walk ±γh; tanθ = ax/g; p = ρ(g+az)h; z = ω²r²/2g.',
    sections: [
      {
        id: 'hydrostatics-plane',
        title: 'Plane surface and gate',
        controls: [
          { kind: 'field', name: 'Plate', what: 'Rectangle or circle with its dimensions, centroid depth and inclination from the horizontal.' },
          { kind: 'field', name: 'Gate', what: 'Quarter-circular radius, width and centroid depth of the projected rectangle.' },
          { kind: 'output', name: 'Force and CP', what: 'Resultant magnitude with the center of pressure along the plate and as a vertical depth, plus the gate components and angle.' },
        ],
      },
      {
        id: 'hydrostatics-float',
        title: 'Flotation and stability',
        controls: [
          { kind: 'field', name: 'Barge', what: 'Length, beam, draft and KG above the keel of the box hull.' },
          { kind: 'output', name: 'GM verdict', what: 'Buoyant force with displaced volume, and the metacentric height with a stable/unstable verdict.' },
        ],
      },
      {
        id: 'hydrostatics-motion',
        title: 'Manometer and moving vessels',
        controls: [
          { kind: 'field', name: 'Legs', what: 'Manometer fluids with column heights, walking down (+) or up (−) from the starting pressure.' },
          { kind: 'output', name: 'Pressures and motion', what: 'Far-end pressure, surface tilt under horizontal acceleration, pressure under vertical acceleration, and the forced-vortex rim rise.' },
        ],
      },
    ],
  },
]
