// The first 30-day campaign — 16 primary posts, four a week (the brief's §7).
// `tools/captions.mjs` counts every caption (code points, hashtags included),
// rejects any at 400 or more, and writes `30-day-plan.md` from this file.
//
// status:
//   ready        — the evidence is in ../evidence and every number it shows is
//                  in ../verification/verified-examples.md
//   verify-first — the feature is documented but the specific example still
//                  needs a capture and a check before the post can go out
// Evidence paths are relative to marketing/.

export const SITE = 'zetastruct.app'

export const POSTS = [
  // ── Week 1 · Introduce Zeta — awareness ────────────────────────────────────
  {
    day: 1, week: 1, series: 'Zeta Features', topic: 'Introducing Zeta', format: 'Cinematic motion graphic (9:16)',
    objective: 'Awareness', hook: 'Structural engineering, connected.',
    evidence: ['assets/01-introducing-zeta.png', 'evidence/model-space/rebar-cages.png', 'evidence/reports/framing-plan.png', 'evidence/reports/quantity-takeoff.png'],
    status: 'ready',
    captions: [
      'Structural engineering, connected. Model a frame, analyse it, design every member, detail the reinforcement and take off the quantities — in one browser workbench. 108 tools, built around NSCP 2015.\n\nExplore Zeta: zetastruct.app\n\n#StructuralEngineering #CivilEngineering #Zeta',
      'One model, many deliverables: analysis results, design checks, reinforcement cages, framing plans and a bill of quantities. That is the idea behind Zeta.\n\nzetastruct.app\n\n#StructuralEngineering #CivilEngineering #Zeta',
      'Model. Analyze. Design. Detail. Deliver. Zeta brings the steps of a structural design into one place, so each one starts from the last.\n\nzetastruct.app\n\n#Zeta #StructuralEngineering #NSCP',
    ],
  },
  {
    day: 3, week: 1, series: 'Zeta Features', topic: '3D Model Space', format: 'Screen-recording Reel',
    objective: 'Awareness → interest', hook: 'What if you could see your structural model come to life?',
    evidence: ['assets/02-model-space.png', 'evidence/model-space/3d-model.png', 'evidence/model-space/3d-designed.png'],
    status: 'ready',
    captions: [
      'From a column grid to a designed frame. In Zeta\'s 3D Model Space you set bays and storeys, apply loads, run the 3D frame analysis and design every member — then see the result on the model itself.\n\nzetastruct.app\n\n#StructuralAnalysis #CivilEngineering #Zeta',
      'Set the grid, apply the loads, analyse, design. Zeta\'s Model Space keeps the whole frame in one 3D view.\n\nzetastruct.app\n\n#StructuralAnalysis #3DModeling #Zeta',
      'Your structural model, in 3D, in the browser — from geometry to designed members.\n\nzetastruct.app\n\n#StructuralEngineering #FEA #Zeta',
    ],
  },
  {
    day: 5, week: 1, series: 'Inside the Model', topic: 'From analysis to design', format: 'Motion graphic',
    objective: 'Interest', hook: 'Modeling is only the beginning.',
    evidence: ['evidence/model-space/compliance-3d.png', 'evidence/model-space/compliance-inspector.png'],
    status: 'ready',
    captions: [
      'Analysis gives forces. Design asks whether each member can carry them. Zeta\'s compliance view colours every beam, column, slab and footing by its own check — fail, near the limit, or pass — and links each check to its clause.\n\nzetastruct.app\n\n#StructuralDesign #CivilEngineering #Zeta',
      'Red, orange, green: every member coloured by its own design check, with the clause behind it one click away.\n\nzetastruct.app\n\n#StructuralDesign #NSCP #Zeta',
      'Which member is working hardest? The compliance view answers on the model itself.\n\nzetastruct.app\n\n#StructuralEngineering #DesignCheck #Zeta',
    ],
  },
  {
    day: 7, week: 1, series: 'Zeta Features', topic: 'Engineering calculator showcase', format: 'Vertical carousel / animated video',
    objective: 'Interest', hook: 'Your next engineering calculation starts here.',
    evidence: ['evidence/concrete-design/beam-design.png', 'evidence/steel-design/steel-beam.png', 'evidence/geotechnical/retaining-wall.png', 'evidence/geotechnical/slope-stability.png'],
    status: 'ready',
    captions: [
      'Beams, columns, footings, retaining walls, slopes, steel members, connections — 108 engineering tools. The design calculators show their working step by step, with the clause, and export a PDF report.\n\nTry one: zetastruct.app\n\n#CivilEngineering #EngineeringTools #Zeta',
      'The design calculators show their working: the inputs, the clause, each step, the check. 108 tools to start from.\n\nzetastruct.app\n\n#CivilEngineering #StructuralEngineering #Zeta',
      'From beam design to slope stability — pick a problem, follow the calculation.\n\nzetastruct.app\n\n#EngineeringStudents #CivilEngineering #Zeta',
    ],
  },

  // ── Week 2 · Practical value — saves and shares ────────────────────────────
  {
    day: 8, week: 2, series: 'Engineering Explained', topic: 'Beam reinforcement', format: 'Educational motion graphic',
    objective: 'Saves, shares', hook: 'Why do beams need both longitudinal bars and stirrups?',
    evidence: ['assets/03-concrete-beam.png', 'evidence/concrete-design/beam-design.png', 'evidence/code-library/rc-beam-flexure.png'],
    status: 'ready',
    captions: [
      'Why do beams need both longitudinal bars and stirrups? The bars carry the tension that bending creates; the stirrups tie the diagonal shear cracks shut. A 300×500 beam with 4-⌀20 works at 0.95 in flexure and 0.80 in shear.\n\nzetastruct.app\n\n#ReinforcedConcrete #StructuralEngineering #Zeta',
      'Bending pulls the bottom of a beam apart; shear opens diagonal cracks. Two jobs, two kinds of steel.\n\nzetastruct.app\n\n#ReinforcedConcrete #ConcreteDesign #Zeta',
      'Longitudinal bars for moment, stirrups for shear — see both in one worked beam design.\n\nzetastruct.app\n\n#CivilEngineering #ReinforcedConcrete #Zeta',
    ],
  },
  {
    day: 10, week: 2, series: 'Design Check', topic: 'Steel design', format: 'Screen-recording Reel',
    objective: 'Saves, product interest', hook: 'Can this steel member pass its design checks?',
    evidence: ['assets/04-steel-beam.png', 'evidence/steel-design/steel-beam.png', 'evidence/code-library/steel-beam-flexure.png'],
    status: 'ready',
    captions: [
      'Can this steel beam pass? A W310×38.7 over 6 m, braced at 2 m, needs 261 kN·m — and lateral-torsional buckling limits it to 178 kN·m. It fails at 147 %. The fix is a deeper section or closer bracing.\n\nzetastruct.app\n\n#SteelDesign #StructuralEngineering #Zeta',
      'A steel beam can fail without yielding: the compression flange buckles sideways first. Unbraced length matters as much as size.\n\nzetastruct.app\n\n#SteelDesign #AISC #Zeta',
      'Same section, longer unbraced length, less strength. Lateral-torsional buckling, worked step by step.\n\nzetastruct.app\n\n#SteelDesign #CivilEngineering #Zeta',
    ],
  },
  {
    day: 12, week: 2, series: 'Engineering Explained', topic: 'Foundation design', format: 'Technical animation',
    objective: 'Saves', hook: 'What determines the size of a footing?',
    evidence: ['evidence/concrete-design/footing-design.png'],
    status: 'verify-first',
    captions: [
      'What sizes a footing? First the soil: the pad must spread the load below the allowable bearing pressure. Then the concrete: one-way and punching shear set its depth, bending sets its steel.\n\nzetastruct.app\n\n#FoundationDesign #GeotechnicalEngineering #Zeta',
      'Soil sets the plan size. Shear sets the depth. Bending sets the bars. A footing, in three checks.\n\nzetastruct.app\n\n#FoundationDesign #CivilEngineering #Zeta',
      'A footing\'s job is to make the soil\'s job possible. See how bearing, shear and flexure size one.\n\nzetastruct.app\n\n#Foundations #StructuralEngineering #Zeta',
    ],
  },
  {
    day: 14, week: 2, series: 'Engineering Explained', topic: 'Geotechnical tools', format: 'Animated cross-section',
    objective: 'Reach a second audience', hook: 'Engineering doesn\'t stop at the building\'s foundation.',
    evidence: ['evidence/geotechnical/retaining-wall.png', 'evidence/geotechnical/slope-stability.png', 'evidence/geotechnical/bearing-capacity.png'],
    status: 'verify-first',
    captions: [
      'Engineering doesn\'t stop at the foundation. Retaining walls, bearing capacity, slope stability, soil nails, micropiles, settlement and laterally loaded piles — 12 geotechnical tools, each worked step by step.\n\nzetastruct.app\n\n#GeotechnicalEngineering #CivilEngineering #Zeta',
      'Earth pressure on a wall, the slip circle under a slope, the soil under a footing — geotechnical calculations, worked step by step.\n\nzetastruct.app\n\n#GeotechnicalEngineering #Zeta',
      'Twelve geotechnical tools, from retaining walls to slope stability.\n\nzetastruct.app\n\n#Geotech #CivilEngineering #Zeta',
    ],
  },

  // ── Week 3 · The complete workflow — consideration ────────────────────────
  {
    day: 15, week: 3, series: 'Zeta Features', topic: 'Reinforcement detailing', format: '3D motion graphic',
    objective: 'Consideration', hook: 'From design calculations to a reinforcement cage.',
    evidence: ['evidence/model-space/rebar-cages.png'],
    status: 'ready',
    captions: [
      'From design calculations to a reinforcement cage. Once Zeta designs the frame, every beam, column, slab and footing gets its bars drawn in 3D — the same bars its schedule lists. Always for review by the engineer of record.\n\nzetastruct.app\n\n#RebarDetailing #ConcreteDesign #Zeta',
      'The design becomes steel you can see: cages for every member, drawn from the designed bars.\n\nzetastruct.app\n\n#RebarDetailing #ReinforcedConcrete #Zeta',
      'See inside the concrete. Reinforcement cages from the design, in 3D.\n\nzetastruct.app\n\n#ConcreteDesign #Zeta',
    ],
  },
  {
    day: 17, week: 3, series: 'From Calculation to Deliverable', topic: 'Quantity takeoff', format: 'Screen-recording Reel',
    objective: 'Consideration (consultancies)', hook: 'What quantities can your structural model produce?',
    evidence: ['assets/05-model-to-deliverable.png', 'evidence/reports/quantity-takeoff.png'],
    status: 'ready',
    captions: [
      'What quantities can a structural model produce? Concrete, cement, sand, gravel and reinforcing steel, from the designed members — then priced with your own unit costs into a bill of materials.\n\nzetastruct.app\n\n#QuantityTakeoff #ConstructionEngineering #Zeta',
      'The model already knows its concrete and its steel. Zeta turns them into a bill of quantities you can price.\n\nzetastruct.app\n\n#QuantityTakeoff #BOQ #Zeta',
      'From a designed frame to cement bags and kilograms of rebar.\n\nzetastruct.app\n\n#ConstructionEngineering #Zeta',
    ],
  },
  {
    day: 19, week: 3, series: 'From Calculation to Deliverable', topic: 'Engineering reports', format: 'Screen recording',
    objective: 'Consideration', hook: 'Your calculation is not the end of the workflow.',
    evidence: ['evidence/reports/general-notes-sheet.png', 'evidence/reports/framing-plan.png'],
    status: 'verify-first',
    captions: [
      'A calculation is only useful if someone can check it. Zeta\'s reports show the inputs, the governing combination, each design step with its clause, and the drawings — so a reviewer can follow the work.\n\nzetastruct.app\n\n#EngineeringReports #StructuralEngineering #Zeta',
      'Inputs, assumptions, clause by clause, then the check — a report a reviewer can follow.\n\nzetastruct.app\n\n#EngineeringReports #Zeta',
      'Framing plans, schedules and worked solutions from the same design.\n\nzetastruct.app\n\n#StructuralDrawings #Zeta',
    ],
  },
  {
    day: 21, week: 3, series: 'From Calculation to Deliverable', topic: 'Excel export', format: 'Screen recording',
    objective: 'Consideration', hook: 'Take your engineering results beyond the viewport.',
    evidence: [],
    status: 'verify-first',
    captions: [
      'Take your results beyond the viewport. Zeta exports the model, analysis and design tables to Excel, and the model itself to STAAD.Pro and ETABS formats — so the work can be checked in the tools your office already uses.\n\nzetastruct.app\n\n#StructuralEngineering #Interoperability #Zeta',
      'Your model\'s tables in Excel, your model in STAAD.Pro or ETABS format.\n\nzetastruct.app\n\n#StructuralAnalysis #Zeta',
      'Results that leave the browser: Excel tables and exchange files.\n\nzetastruct.app\n\n#CivilEngineering #Zeta',
    ],
  },

  // ── Week 4 · Technical credibility — trust ────────────────────────────────
  {
    day: 22, week: 4, series: 'Inside the Model', topic: 'Structural displacement', format: 'Technical animation',
    objective: 'Trust', hook: 'What happens when a structure is loaded?',
    evidence: [],
    status: 'verify-first',
    captions: [
      'What happens when a structure is loaded? It deflects, and the shape of that deflection says where the stiffness is. Zeta draws the deformed frame, scaled, from the 3D analysis.\n\nzetastruct.app\n\n#StructuralAnalysis #FEA #Zeta',
      'A structure doesn\'t just carry loads — it responds to them. See the deformed shape of a real frame.\n\nzetastruct.app\n\n#StructuralAnalysis #Zeta',
      'Loads in, displacements out. The deformed shape, drawn from the analysis.\n\nzetastruct.app\n\n#CivilEngineering #Zeta',
    ],
  },
  {
    day: 24, week: 4, series: 'Engineering Explained', topic: 'Load combinations', format: 'Educational motion graphic',
    objective: 'Saves, trust', hook: 'Why does one load case not tell the whole story?',
    evidence: ['evidence/code-library/load-combinations.png'],
    status: 'ready',
    captions: [
      'Why one load case isn\'t enough: with D = 100, L = 60, Lr = 10, W = 40 and E = 50, the earthquake combination 1.2D + 1.0E + 1.0L governs at 230, and 0.9D − 1.0E drops to 40 — the uplift case. All 13 NSCP strength combinations, side by side.\n\nzetastruct.app\n\n#LoadCombinations #NSCP #Zeta',
      'The worst case isn\'t always the heaviest. NSCP load combinations, side by side.\n\nzetastruct.app\n\n#LoadCombinations #StructuralEngineering #Zeta',
      'Dead, live, wind, earthquake — combined the NSCP way, governing case highlighted.\n\nzetastruct.app\n\n#NSCP #CivilEngineering #Zeta',
    ],
  },
  {
    day: 26, week: 4, series: 'Design Check', topic: 'Calculation validation', format: 'Technical explainer',
    objective: 'Trust', hook: 'How do we check an engineering calculation?',
    evidence: [],
    status: 'ready',
    captions: [
      'How do we check a structural solver? We modelled the same 2-storey frame in Zeta and STAAD.Pro, every input matched. Total reaction: 2117.27 vs 2117.28 kN. Every check we run is listed on Zeta\'s validation page, including the ones still open.\n\nzetastruct.app\n\n#EngineeringValidation #StructuralAnalysis #Zeta',
      'One frame, two programs, every input matched — the total reaction agreed to 0.001 %. Validation, shown.\n\nzetastruct.app\n\n#EngineeringValidation #Zeta',
      'Hand calculations, closed forms, textbook examples and an independent program: how Zeta checks its numbers.\n\nzetastruct.app\n\n#StructuralEngineering #Zeta',
    ],
  },
  {
    day: 28, week: 4, series: 'Zeta Features', topic: 'Zeta workflow recap', format: 'Cinematic Reel',
    objective: 'Conversion', hook: 'One connected workflow. Multiple engineering tools.',
    evidence: ['assets/01-introducing-zeta.png', 'assets/05-model-to-deliverable.png'],
    status: 'ready',
    captions: [
      'One connected workflow: model the frame, analyse it, design the members, detail the steel, take off the quantities, print the report. Start with a calculator, grow into the model.\n\nzetastruct.app\n\n#StructuralEngineering #CivilEngineering #Zeta',
      'Model. Analyze. Design. Detail. Deliver. All in Zeta.\n\nzetastruct.app\n\n#StructuralEngineering #Zeta',
      'From the first calculation to the bill of quantities — one workbench.\n\nzetastruct.app\n\n#CivilEngineering #Zeta',
    ],
  },
]
