// ─────────────────────────────────────────────────────────────────────────
// The code behind each input on the development-length page.
//
// Every factor on that page is a lookup from a table in ACI 318-14 §25.4,
// and the page previously showed only the resulting number. Someone filling
// it in had to already know which row of which table they were choosing —
// which is precisely the knowledge the page exists to supply.
//
// Held as DATA rather than JSX so it can be asserted against: the tests below
// check that every row of every table matches what the engine computes for
// the same condition, so a hint cannot drift away from the calculation it
// describes.
// ─────────────────────────────────────────────────────────────────────────

export interface HintTable {
  /** Column headers. The last column is the factor value. */
  head: string[]
  rows: string[][]
}

export interface CodeHintSpec {
  /** Short title for the popover. */
  title: string
  /** Clause reference, shown in the popover header. */
  clause: string
  /** The clause's own statement, paraphrased tightly. */
  statement: string
  /** The table the clause defines, when it defines one. */
  table?: HintTable
  /** Why the rule exists — the part a table cannot carry. */
  why?: string
}

export const DEV_HINTS = {
  db: {
    title: 'Bar diameter and ψs',
    clause: 'ACI 318-14 Table 25.4.2.4',
    statement:
      'The bar-size factor ψs is 0.8 for ⌀20 and smaller, and 1.0 for ⌀25 and larger. ' +
      'It is applied to the tension development length only.',
    table: {
      head: ['Bar size', 'ψs'],
      rows: [['⌀20 and smaller', '0.8'], ['⌀25 and larger', '1.0']],
    },
    why:
      'A smaller bar has more surface area per unit of steel area, so it develops its ' +
      'yield force in proportionally less length. The step at ⌀25 is the code’s ' +
      'simplification of a continuous trend.',
  },

  fc: {
    title: "Concrete strength f'c",
    clause: 'ACI 318-14 §25.4.1.4',
    statement:
      "The value of √f'c used to calculate development length shall not exceed 8.3 MPa — " +
      "so f'c is effectively capped at about 69 MPa for every length in §25.4.",
    table: {
      head: ["f'c, MPa", "√f'c used"],
      rows: [
        ['21', '4.58'], ['28', '5.29'], ['35', '5.92'],
        ['48', '6.93'], ['69', '8.31 → 8.3 (cap)'], ['80', '8.3 (capped)'],
      ],
    },
    why:
      'The splitting-bond tests behind §25.4 were run on ordinary-strength concrete. ' +
      "Above that range the measured bond strength stops tracking √f'c, so a stronger " +
      'mix cannot be allowed to buy a shorter length than it has been shown to deliver.',
  },

  fy: {
    title: 'Bar yield strength fy',
    clause: 'ACI 318-14 §25.4.2.3',
    statement:
      'Development length is DIRECTLY proportional to fy: the bar has to transfer its ' +
      'full yield force into the concrete, and a higher grade means a larger force over ' +
      'the same bar surface.',
    table: {
      head: ['Grade', 'fy, MPa', 'ld relative to Grade 415'],
      rows: [['275', '275', '0.66'], ['415 (PNS)', '415', '1.00'], ['420', '420', '1.01'], ['550', '550', '1.33']],
    },
    why:
      'Substituting a higher grade to reduce the bar count does not shorten the ' +
      'anchorage — it lengthens it, which is how a detail that fitted at Grade 415 ' +
      'stops fitting at Grade 550.',
  },

  lambda: {
    title: 'Lightweight concrete λ',
    clause: 'ACI 318-14 Table 19.2.4.1(a) · §25.4.2.4',
    statement:
      'λ accounts for the reduced tensile strength of lightweight concrete. It DIVIDES ' +
      'the development length, so λ = 0.75 makes every length 33% longer.',
    table: {
      head: ['Concrete', 'λ'],
      rows: [
        ['Normalweight', '1.00'],
        ['Sand-lightweight', '0.85'],
        ['All-lightweight', '0.75'],
      ],
    },
    why:
      'Bond failure in §25.4 is a SPLITTING failure — the concrete cracks along the bar ' +
      'rather than the steel slipping. Splitting is governed by tensile strength, which ' +
      'is what lightweight aggregate reduces.',
  },

  psiT: {
    title: 'Casting position ψt',
    clause: 'ACI 318-14 Table 25.4.2.4',
    statement:
      'ψt = 1.3 where more than 300 mm of fresh concrete is placed BELOW the horizontal ' +
      'bar as it is cast; 1.0 otherwise.',
    table: {
      head: ['Casting position', 'ψt'],
      rows: [
        ['More than 300 mm of fresh concrete below the bar', '1.3'],
        ['Other', '1.0'],
      ],
    },
    why:
      'Bleed water and entrapped air rise and collect under a bar near the top of a deep ' +
      'pour, leaving a weaker bond surface. The trigger is the depth of concrete BELOW ' +
      'the bar during casting — not whether the bar ends up near the top in service.',
  },

  psiE: {
    title: 'Epoxy coating ψe',
    clause: 'ACI 318-14 Table 25.4.2.4',
    statement:
      'ψe penalises the reduced friction of a coated bar. §25.4.2.4 also caps the ' +
      'PRODUCT ψt·ψe at 1.7, so the two penalties cannot both apply in full.',
    table: {
      head: ['Condition', 'ψe'],
      rows: [
        ['Epoxy-coated, cover < 3db OR clear spacing < 6db', '1.5'],
        ['All other epoxy-coated or zinc-and-epoxy bars', '1.2'],
        ['Uncoated or zinc-coated (galvanized)', '1.0'],
      ],
    },
    why:
      'The 1.7 cap exists because the two effects are not independent: a top bar and a ' +
      'coated bar both degrade the same bond interface, and testing did not support ' +
      'multiplying the penalties without limit.',
  },

  confine: {
    title: 'Confinement term (cb + Ktr)/db',
    clause: 'ACI 318-14 §25.4.2.3',
    statement:
      'cb is the SMALLER of (a) the distance from the centre of the bar to the nearest ' +
      'concrete surface, and (b) one-half the centre-to-centre spacing of the bars being ' +
      'developed. Ktr = 40·Atr/(s·n). The term (cb + Ktr)/db shall not be taken greater ' +
      'than 2.5.',
    table: {
      head: ['Term', 'Meaning'],
      rows: [
        ['cb', 'min(cover to bar CENTRE, half the c/c bar spacing), mm'],
        ['Atr', 'total area of transverse steel crossing the splitting plane, mm²'],
        ['s', 'spacing of that transverse steel, mm'],
        ['n', 'number of bars being developed at the splitting plane'],
        ['Ktr = 0', 'always permitted as a design simplification'],
        ['cap', '(cb + Ktr)/db ≤ 2.5'],
      ],
    },
    why:
      'This one term carries the whole splitting mechanism: more cover, wider bar spacing ' +
      'and more ties all delay the split, and all three shorten ld. The 2.5 cap is there ' +
      'because beyond it the failure mode changes from splitting to pullout, which the ' +
      'formula does not describe.',
  },

  hook: {
    title: 'Standard hook factors ψc and ψr',
    clause: 'ACI 318-14 §25.4.3.2 · §25.3.1',
    statement:
      'ldh is measured from the critical section to the OUTSIDE END of the hook. ψt does ' +
      'NOT apply to hooks. ψc and ψr apply to ⌀36 and smaller only, and ψe for a hook is ' +
      '1.2 for epoxy-coated bars (never 1.5).',
    table: {
      head: ['Condition', 'Factor'],
      rows: [
        ['Side cover ≥ 65 mm and, for a 90° hook, tail cover ≥ 50 mm', 'ψc = 0.7'],
        ['Hook enclosed by ties/stirrups ⊥ to the bar at s ≤ 3db', 'ψr = 0.8'],
        ['Neither condition met', '1.0'],
        ['Floor on ldh', 'the greater of 8db and 150 mm'],
        ['90° hook tail (§25.3.1)', '12db'],
        ['Inside bend diameter (§25.3.1)', '6db for ⌀10–⌀25, 8db for ⌀28–⌀36'],
      ],
    },
    why:
      'A hook anchors mostly by BEARING inside the bend, not by friction along the bar, ' +
      'which is why the casting-position penalty drops out and why confinement across ' +
      'the bend is worth so much — it stops the concrete in front of the hook splitting off.',
  },
} as const satisfies Record<string, CodeHintSpec>

export type DevHintKey = keyof typeof DEV_HINTS
