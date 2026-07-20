// ─────────────────────────────────────────────────────────────────────────
// Plumbing fixture-unit catalog — Revised National Plumbing Code of the
// Philippines (RNPCP 2000): Table 6-5 water-supply fixture units (WSFU) and
// Table 7-2 drainage fixture units (DFU) + minimum trap/waste size.  Shared
// foundation for the water-supply, drainage (DWV) and septic-tank engines.
//
// Fixture-unit values distinguish PRIVATE (residence, private bath) from PUBLIC
// (commercial, shared) service, per the code and the module worked examples.
// Units: fixture units (dimensionless); trap size mm.
// ─────────────────────────────────────────────────────────────────────────

export type Occupancy = 'private' | 'public'

export interface PlumbingFixture {
  id: string
  label: string
  /** Water-supply fixture units — RNPCP Table 6-5. */
  wsfu: { private: number; public: number }
  /** Drainage fixture units — RNPCP Table 7-2. */
  dfu: { private: number; public: number }
  /** Minimum trap / fixture-drain diameter, mm — RNPCP Table 7-2. 0 = no DWV
   *  connection (e.g. a hose bibb draws supply only). */
  minTrapMm: number
}

// Values as used in the Module 2/3/4 worked examples (RNPCP flush-tank set).
export const PLUMBING_FIXTURES: Record<string, PlumbingFixture> = {
  'water-closet': { id: 'water-closet', label: 'Water closet (flush tank)', wsfu: { private: 3, public: 5 }, dfu: { private: 4, public: 6 }, minTrapMm: 75 },
  'lavatory': { id: 'lavatory', label: 'Lavatory', wsfu: { private: 1, public: 2 }, dfu: { private: 1, public: 1 }, minTrapMm: 32 },
  'kitchen-sink': { id: 'kitchen-sink', label: 'Kitchen sink', wsfu: { private: 2, public: 4 }, dfu: { private: 2, public: 2 }, minTrapMm: 40 },
  'bathtub': { id: 'bathtub', label: 'Bathtub', wsfu: { private: 2, public: 4 }, dfu: { private: 2, public: 2 }, minTrapMm: 40 },
  'shower': { id: 'shower', label: 'Shower head', wsfu: { private: 2, public: 2 }, dfu: { private: 2, public: 2 }, minTrapMm: 50 },
  'urinal': { id: 'urinal', label: 'Urinal (flush tank)', wsfu: { private: 3, public: 3 }, dfu: { private: 2, public: 2 }, minTrapMm: 40 },
  'hose-bibb': { id: 'hose-bibb', label: 'Hose bibb', wsfu: { private: 3, public: 3 }, dfu: { private: 0, public: 0 }, minTrapMm: 0 },
  'floor-drain': { id: 'floor-drain', label: 'Floor drain', wsfu: { private: 0, public: 0 }, dfu: { private: 2, public: 2 }, minTrapMm: 50 },
  'dishwasher': { id: 'dishwasher', label: 'Dishwasher', wsfu: { private: 2, public: 2 }, dfu: { private: 2, public: 2 }, minTrapMm: 40 },
  'slop-sink': { id: 'slop-sink', label: 'Slop / service sink', wsfu: { private: 3, public: 4 }, dfu: { private: 3, public: 3 }, minTrapMm: 65 },
  'laundry-sink': { id: 'laundry-sink', label: 'Laundry / residential sink', wsfu: { private: 2, public: 2 }, dfu: { private: 2, public: 2 }, minTrapMm: 40 },
}

export const FIXTURE_LIST: PlumbingFixture[] = Object.values(PLUMBING_FIXTURES)

/** A fixture group on a plumbing schedule: a fixture id and how many. */
export interface FixtureCount { id: string; count: number }

/** Total water-supply fixture units (Table 6-5) for a schedule. */
export function totalWSFU(items: FixtureCount[], occ: Occupancy): number {
  return items.reduce((s, it) => s + (PLUMBING_FIXTURES[it.id]?.wsfu[occ] ?? 0) * Math.max(0, it.count), 0)
}

/** Total drainage fixture units (Table 7-2) for a schedule. */
export function totalDFU(items: FixtureCount[], occ: Occupancy): number {
  return items.reduce((s, it) => s + (PLUMBING_FIXTURES[it.id]?.dfu[occ] ?? 0) * Math.max(0, it.count), 0)
}

/** Largest minimum trap size among the connected drainage fixtures, mm. */
export function largestTrap(items: FixtureCount[]): number {
  return items.reduce((m, it) => {
    const f = PLUMBING_FIXTURES[it.id]
    return f && it.count > 0 && f.dfu.private > 0 ? Math.max(m, f.minTrapMm) : m
  }, 0)
}
