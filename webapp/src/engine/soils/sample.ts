// A realistic, VALID sample investigation — two boreholes on a Baguio City
// site with a fill crust over soft clay over dense sand.
//
// Used as the seed for "load an example" in the UI and as the fixture the
// validation tests measure against: the suite asserts this passes clean, then
// breaks one field at a time. A fixture that already carries warnings would
// make those tests unable to tell a new warning from an old one.

import type { Investigation } from './model'

export function sampleInvestigation(): Investigation {
  return {
    meta: {
      investigationNo: 'SI-2026-014',
      title: 'Geotechnical Investigation — 6-Storey Commercial Building',
      site: {
        projectName: 'ABC Commercial Building',
        client: 'ABC Development Corp.',
        location: 'Session Road, Baguio City',
        latitude: 16.4108,
        longitude: 120.5960,
        elevation: 1_450,
        description: 'Gently sloping corner lot, previously occupied by a two-storey structure since demolished.',
        existingConditions: 'Slab-on-grade of the former structure remains over the northern half of the lot.',
      },
      consultant: '',
      engineer: '',
      investigationDate: '2026-06-15',
      status: 'laboratory',
    },
    fieldObservations: 'Seepage observed at the base of the cut along the eastern boundary during fieldwork.',
    boreholes: [
      {
        id: 'bh1',
        name: 'BH-01',
        kind: 'borehole',
        latitude: 16.41082,
        longitude: 120.59605,
        groundElevation: 1_450.35,
        plannedDepth: 20,
        actualDepth: 20,
        diameter: 100,
        method: 'rotary-wash',
        startDate: '2026-06-15',
        completionDate: '2026-06-17',
        groundwaterDepth: 7.8,
        terminationReason: 'Planned depth reached in dense sand.',
        layers: [
          {
            id: 'bh1-l1', depthTop: 0, depthBottom: 1.5, name: 'Fill',
            description: 'Loose silty sand fill with brick and concrete fragments.',
            colour: 'brown', density: 'loose', moisture: 'moist',
          },
          {
            id: 'bh1-l2', symbol: 'SM', depthTop: 1.5, depthBottom: 4.2, name: 'Silty Sand',
            description: 'Medium dense silty fine to medium SAND, trace gravel.',
            colour: 'light brown', density: 'medium-dense', moisture: 'moist',
          },
          {
            id: 'bh1-l3', symbol: 'CL', depthTop: 4.2, depthBottom: 8.5, name: 'Lean Clay',
            description: 'Soft to firm lean CLAY with sand, occasional organic partings.',
            colour: 'grey', consistency: 'soft', moisture: 'wet',
          },
          {
            id: 'bh1-l4', symbol: 'SP', depthTop: 8.5, depthBottom: 20, name: 'Poorly Graded Sand',
            description: 'Dense to very dense poorly graded SAND, trace fines.',
            colour: 'grey-brown', density: 'dense', moisture: 'saturated',
          },
        ],
        samples: [
          {
            id: 'bh1-s1', name: 'S-01', layerId: 'bh1-l2', type: 'split-spoon',
            depthTop: 1.5, depthBottom: 1.95, standard: 'd1586',
            recoveryLength: 0.38, driveLength: 0.45, sampleDate: '2026-06-15',
            tests: [
              {
                id: 'bh1-s1-t1', type: 'moisture', standard: 'd2216', status: 'complete', testDate: '2026-06-18',
                data: { containerMass: 25.0, wetMass: 85.4, dryMass: 76.2 },        // w = 17.97%
              },
              {
                id: 'bh1-s1-t2', type: 'sieve', standard: 'd6913', status: 'complete', testDate: '2026-06-19',
                data: {
                  totalMass: 500,
                  readings: [
                    { size: 9.5, designation: '3/8 in', massRetained: 0 },
                    { size: 4.75, designation: 'No. 4', massRetained: 15 },
                    { size: 2.0, designation: 'No. 10', massRetained: 25 },
                    { size: 0.85, designation: 'No. 20', massRetained: 55 },
                    { size: 0.425, designation: 'No. 40', massRetained: 90 },
                    { size: 0.15, designation: 'No. 100', massRetained: 145 },
                    { size: 0.075, designation: 'No. 200', massRetained: 45 },
                  ],
                  panMass: 125,
                },                                                                  // 25% fines — a silty SAND
              },
              {
                id: 'bh1-s1-t3', type: 'atterberg', standard: 'd4318', status: 'complete', testDate: '2026-06-19',
                data: { liquidLimit: 21, nonPlastic: true },   // NP fines ⇒ SM, not SC
              },
            ],
          },
          {
            id: 'bh1-s2', name: 'S-02', layerId: 'bh1-l3', type: 'shelby-tube',
            depthTop: 5, depthBottom: 5.75, standard: 'd1587',
            recoveryLength: 0.71, driveLength: 0.75, sampleDate: '2026-06-16',
            tests: [
              {
                id: 'bh1-s2-t1', type: 'moisture', standard: 'd2216', status: 'complete', testDate: '2026-06-18',
                data: { containerMass: 25.0, wetMass: 92.5, dryMass: 73.0 },        // w = 40.6%
              },
              {
                id: 'bh1-s2-t2', type: 'atterberg', standard: 'd4318', status: 'complete', testDate: '2026-06-19',
                data: { liquidLimit: 45, plasticLimit: 22, naturalMoisture: 40.6 }, // PI 23, above the A-line ⇒ CL
              },
              {
                id: 'bh1-s2-t5', type: 'sieve', standard: 'd6913', status: 'complete', testDate: '2026-06-19',
                data: {
                  totalMass: 400,
                  readings: [
                    { size: 4.75, designation: 'No. 4', massRetained: 0 },
                    { size: 2.0, designation: 'No. 10', massRetained: 0 },
                    { size: 0.425, designation: 'No. 40', massRetained: 28 },
                    { size: 0.075, designation: 'No. 200', massRetained: 72 },
                  ],
                  panMass: 300,
                },                                                                  // 75% fines ⇒ fine-grained
              },
              {
                // The minus-No.200 fraction of the sieve above, so `fractionOfTotal`
                // is its 75% fines and the two curves join at 0.075 mm. Carries the
                // 0.002 mm split no sieve can reach, which is what makes a USDA
                // texture possible on this sample and impossible on the others.
                id: 'bh1-s2-t6', type: 'hydrometer', standard: 'd7928', status: 'complete', testDate: '2026-06-20',
                data: {
                  dryMass: 50, specificGravity: 2.7,
                  compositeCorrection: 5, meniscusCorrection: 1, fractionOfTotal: 75,
                  readings: [
                    { time: 2, reading: 52, temperature: 22 },
                    { time: 5, reading: 49, temperature: 22 },
                    { time: 15, reading: 44, temperature: 22 },
                    { time: 30, reading: 40, temperature: 22 },
                    { time: 60, reading: 36, temperature: 22 },
                    { time: 250, reading: 30, temperature: 22 },
                    { time: 1440, reading: 24, temperature: 22 },
                  ],
                },                                                                  // clay 34% ⇒ USDA clay loam
              },
              {
                id: 'bh1-s2-t3', type: 'ucs', standard: 'd2166', status: 'complete', testDate: '2026-06-22',
                data: {
                  diameter: 38, height: 76, failureLoad: 120, failureDeformation: 6,
                  unitWeight: 17.5, soil: 'saturated-cohesive',
                },
              },
              {
                id: 'bh1-s2-t4', type: 'consolidation', standard: 'd2435', status: 'complete', testDate: '2026-06-26',
                data: {
                  initialHeight: 20, diameter: 63.5, dryMass: 81.4, specificGravity: 2.7,
                  points: [
                    { stress: 12.5, compression: 0.10, t50: 3.1 },
                    { stress: 25, compression: 0.18, t50: 3.4 },
                    { stress: 50, compression: 0.30, t50: 3.8 },
                    { stress: 100, compression: 0.46, t50: 4.2 },
                    { stress: 200, compression: 1.10, t50: 5.0 },
                    { stress: 400, compression: 2.05, t50: 5.6 },
                    { stress: 800, compression: 3.00, t50: 6.1 },
                  ],
                },
              },
            ],
          },
          {
            id: 'bh1-s3', name: 'S-03', layerId: 'bh1-l4', type: 'split-spoon',
            depthTop: 9, depthBottom: 9.45, standard: 'd1586',
            recoveryLength: 0.3, driveLength: 0.45, sampleDate: '2026-06-16',
            tests: [
              {
                id: 'bh1-s3-t1', type: 'sieve', standard: 'd6913', status: 'complete', testDate: '2026-06-19',
                data: {
                  totalMass: 500,
                  readings: [
                    { size: 9.5, designation: '3/8 in', massRetained: 0 },
                    { size: 4.75, designation: 'No. 4', massRetained: 10 },
                    { size: 2.0, designation: 'No. 10', massRetained: 40 },
                    { size: 0.85, designation: 'No. 20', massRetained: 120 },
                    { size: 0.425, designation: 'No. 40', massRetained: 190 },
                    { size: 0.15, designation: 'No. 100', massRetained: 120 },
                    { size: 0.075, designation: 'No. 200', massRetained: 12 },
                  ],
                  panMass: 8,
                },                                                                  // 1.6% fines, uniform ⇒ SP
              },
              {
                id: 'bh1-s3-t2', type: 'atterberg', standard: 'd4318', status: 'complete', testDate: '2026-06-19',
                data: { liquidLimit: 19, nonPlastic: true },
              },
            ],
          },
        ],
        spt: [
          { id: 'bh1-n1', depth: 1.5, blows: [3, 4, 4], penetration: [150, 150, 150], hammer: 'safety', rodLength: 3, sampleId: 'bh1-s1' },
          { id: 'bh1-n2', depth: 3, blows: [5, 7, 7], penetration: [150, 150, 150], hammer: 'safety', rodLength: 4.5 },
          { id: 'bh1-n3', depth: 4.5, blows: [1, 2, 2], penetration: [150, 150, 150], hammer: 'safety', rodLength: 6 },
          { id: 'bh1-n4', depth: 6, blows: [1, 2, 3], penetration: [150, 150, 150], hammer: 'safety', rodLength: 7.5 },
          { id: 'bh1-n5', depth: 9, blows: [12, 16, 19], penetration: [150, 150, 150], hammer: 'safety', rodLength: 10.5, sampleId: 'bh1-s3' },
          { id: 'bh1-n6', depth: 12, blows: [15, 21, 24], penetration: [150, 150, 150], hammer: 'safety', rodLength: 13.5 },
          { id: 'bh1-n7', depth: 15, blows: [18, 25, 28], penetration: [150, 150, 150], hammer: 'safety', rodLength: 16.5 },
          { id: 'bh1-n8', depth: 18, blows: [22, 29, 33], penetration: [150, 150, 150], hammer: 'safety', rodLength: 19.5 },
        ],
      },
      {
        id: 'bh2',
        name: 'BH-02',
        kind: 'borehole',
        latitude: 16.41075,
        longitude: 120.59618,
        groundElevation: 1_449.10,
        plannedDepth: 20,
        actualDepth: 20,
        diameter: 100,
        method: 'rotary-wash',
        startDate: '2026-06-18',
        completionDate: '2026-06-20',
        groundwaterDepth: 7.2,
        terminationReason: 'Planned depth reached in dense sand.',
        layers: [
          {
            id: 'bh2-l1', depthTop: 0, depthBottom: 2.1, name: 'Fill',
            description: 'Loose silty sand fill.', colour: 'brown', density: 'loose', moisture: 'moist',
          },
          {
            id: 'bh2-l2', symbol: 'CL', depthTop: 2.1, depthBottom: 9.4, name: 'Lean Clay',
            description: 'Soft lean CLAY with sand.', colour: 'grey', consistency: 'soft', moisture: 'wet',
          },
          {
            id: 'bh2-l3', depthTop: 9.4, depthBottom: 20, name: 'Poorly Graded Sand',
            description: 'Dense poorly graded SAND.', colour: 'grey-brown', density: 'dense', moisture: 'saturated',
          },
        ],
        samples: [
          {
            id: 'bh2-s1', name: 'S-01', layerId: 'bh2-l2', type: 'shelby-tube',
            depthTop: 4, depthBottom: 4.75, standard: 'd1587',
            recoveryLength: 0.68, driveLength: 0.75, sampleDate: '2026-06-18',
            tests: [
              {
                id: 'bh2-s1-t1', type: 'moisture', standard: 'd2216', status: 'complete', testDate: '2026-06-21',
                data: { containerMass: 25.0, wetMass: 90.8, dryMass: 72.5 },        // w = 38.5%
              },
              {
                id: 'bh2-s1-t2', type: 'atterberg', standard: 'd4318', status: 'complete', testDate: '2026-06-22',
                data: { liquidLimit: 48, plasticLimit: 24, naturalMoisture: 38.5 }, // PI 24 ⇒ CL
              },
              {
                id: 'bh2-s1-t4', type: 'sieve', standard: 'd6913', status: 'complete', testDate: '2026-06-22',
                data: {
                  totalMass: 400,
                  readings: [
                    { size: 4.75, designation: 'No. 4', massRetained: 0 },
                    { size: 0.425, designation: 'No. 40', massRetained: 24 },
                    { size: 0.075, designation: 'No. 200', massRetained: 60 },
                  ],
                  panMass: 316,
                },                                                                  // 79% fines
              },
              { id: 'bh2-s1-t3', type: 'triaxial', standard: 'd4767', status: 'planned' },
            ],
          },
        ],
        spt: [
          { id: 'bh2-n1', depth: 1.5, blows: [2, 3, 4], penetration: [150, 150, 150], hammer: 'safety', rodLength: 3 },
          { id: 'bh2-n2', depth: 4.5, blows: [1, 2, 2], penetration: [150, 150, 150], hammer: 'safety', rodLength: 6, sampleId: 'bh2-s1' },
          { id: 'bh2-n3', depth: 7.5, blows: [2, 2, 3], penetration: [150, 150, 150], hammer: 'safety', rodLength: 9 },
          { id: 'bh2-n4', depth: 10.5, blows: [14, 18, 21], penetration: [150, 150, 150], hammer: 'safety', rodLength: 12 },
          { id: 'bh2-n5', depth: 15, blows: [19, 26, 30], penetration: [150, 150, 150], hammer: 'safety', rodLength: 16.5 },
        ],
      },
    ],
    parameters: [],
  }
}
