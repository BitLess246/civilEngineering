// ─────────────────────────────────────────────────────────────────────────
// NSCP 2015 §203.3 Strength Design (LRFD) Load Combinations.
// Ref: NSCP 2015 Table 203-1  (mirrors ASCE 7-10 §2.3.2 with NSCP notation)
// SI units — loads in any consistent unit (kN, kN/m, kN/m², etc.)
// ─────────────────────────────────────────────────────────────────────────

export interface LoadDemands {
  D:  number   // Dead load
  L:  number   // Live load (floor)
  Lr: number   // Roof live load
  W:  number   // Wind load (magnitude; ±W applied per combo)
  E:  number   // Earthquake load (magnitude; ±E applied per combo)
}

export interface ComboResult {
  id:     string   // e.g. '1', '3a', '4b'
  label:  string   // human-readable expression
  value:  number   // computed factored load
  fD:  number; fL:  number; fLr: number; fW: number; fE: number
}

export interface LoadCombResult {
  combos:   ComboResult[]
  maxCombo: ComboResult   // combo with largest value
  minCombo: ComboResult   // combo with smallest value
}

// Each row: [id, label, fD, fL, fLr, fW, fE]
type ComboSpec = [string, string, number, number, number, number, number]

const COMBOS: ComboSpec[] = [
  ['1',  '1.4D',                               1.4,  0,    0,    0,    0   ],
  ['2',  '1.2D + 1.6L + 0.5Lr',               1.2,  1.6,  0.5,  0,    0   ],
  ['3a', '1.2D + 1.6Lr + 1.0L',               1.2,  1.0,  1.6,  0,    0   ],
  ['3b', '1.2D + 1.6Lr + 0.5W',               1.2,  0,    1.6,  0.5,  0   ],
  ['3c', '1.2D + 1.6Lr − 0.5W',               1.2,  0,    1.6, -0.5,  0   ],
  ['4a', '1.2D + 1.0W + 1.0L + 0.5Lr',        1.2,  1.0,  0.5,  1.0,  0   ],
  ['4b', '1.2D − 1.0W + 1.0L + 0.5Lr',        1.2,  1.0,  0.5, -1.0,  0   ],
  ['5a', '0.9D + 1.0W',                        0.9,  0,    0,    1.0,  0   ],
  ['5b', '0.9D − 1.0W',                        0.9,  0,    0,   -1.0,  0   ],
  ['6a', '1.2D + 1.0E + 1.0L',                1.2,  1.0,  0,    0,    1.0 ],
  ['6b', '1.2D − 1.0E + 1.0L',                1.2,  1.0,  0,    0,   -1.0 ],
  ['7a', '0.9D + 1.0E',                        0.9,  0,    0,    0,    1.0 ],
  ['7b', '0.9D − 1.0E',                        0.9,  0,    0,    0,   -1.0 ],
]

export function calcLoadCombinations(d: LoadDemands): LoadCombResult {
  const combos: ComboResult[] = COMBOS.map(([id, label, fD, fL, fLr, fW, fE]) => ({
    id, label, fD, fL, fLr, fW, fE,
    value: fD * d.D + fL * d.L + fLr * d.Lr + fW * d.W + fE * d.E,
  }))

  let maxCombo = combos[0]
  let minCombo = combos[0]
  for (const c of combos) {
    if (c.value > maxCombo.value) maxCombo = c
    if (c.value < minCombo.value) minCombo = c
  }

  return { combos, maxCombo, minCombo }
}
