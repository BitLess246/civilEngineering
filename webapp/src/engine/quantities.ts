// ─────────────────────────────────────────────────────────────────────────
// Material take-off / quantity estimation — typed port of the legacy
// scriptSlab / scriptChb / scriptColumn / scriptBeam / scriptBoxCulvert.
// Lengths/areas/volumes are in metres; bar diameters are in MILLIMETRES
// (the legacy forms used metres — converted here for a saner UI). Steel uses
// 7850 kg/m³ and is bought in 6 m lengths; splices shorten the usable length.
// ─────────────────────────────────────────────────────────────────────────

export type ConcreteClass = 'AA' | 'A' | 'B' | 'C' | 'custom';

/** Cement bags per m³ by NSCP mix class (sand 0.5, gravel 1.0 m³ per m³). */
export const CONCRETE_CLASS_FACTORS: Record<Exclude<ConcreteClass, 'custom'>, number> = {
  AA: 12, A: 9, B: 7.5, C: 6,
};
const STEEL_DENSITY = 7850;   // kg/m³
const BAR_LENGTH = 6;         // m, commercial length
const TIE_WIRE_ROLL = 2385;   // m per roll

const barAreaM2 = (diaMm: number) => (Math.PI / 4) * (diaMm / 1000) ** 2;

export interface ConcreteMaterials {
  volume: number; cement: number; sand: number; gravel: number; factor: number;
}
/** Cement (bags, rounded up), sand & gravel (m³) for a concrete volume. */
export function concreteMaterials(volume: number, klass: ConcreteClass, customFactor = 0): ConcreteMaterials {
  const factor = klass === 'custom' ? customFactor : CONCRETE_CLASS_FACTORS[klass];
  return {
    volume,
    cement: Math.ceil(volume * factor),
    sand: volume * 0.5,
    gravel: volume * 1.0,
    factor,
  };
}

export interface BarTakeoff {
  netLength: number; diaMm: number; area: number; splice: number; pieces: number; weight: number;
}
/** Commercial-bar take-off for a required net length (splice = usable bar length). */
export function barTakeoff(netLength: number, diaMm: number, spliceLength: number): BarTakeoff {
  const area = barAreaM2(diaMm);
  const splice = BAR_LENGTH - spliceLength;
  const pieces = splice > 0 ? Math.ceil(netLength / splice) : 0;
  return { netLength, diaMm, area, splice, pieces, weight: pieces * BAR_LENGTH * area * STEEL_DENSITY };
}

export interface TieTakeoff {
  cutsPer6m: number; totalCuts: number; diaMm: number; area: number; pieces: number; weight: number;
}
/** Stirrups / lateral ties cut from 6 m bars. */
export function lateralTieTakeoff(lengthPerSet: number, noSets: number, diaMm: number, numStructures: number): TieTakeoff {
  const cutsPer6m = Math.floor(BAR_LENGTH / lengthPerSet);
  const totalCuts = noSets * numStructures;
  const area = barAreaM2(diaMm);
  const pieces = cutsPer6m > 0 ? Math.ceil(totalCuts / cutsPer6m) : 0;
  return { cutsPer6m, totalCuts, diaMm, area, pieces, weight: pieces * BAR_LENGTH * area * STEEL_DENSITY };
}

export interface TieWire { netLength: number; intersections: number; rolls: number; }
export function tieWire(lengthPerCut: number, intersections: number, numStructures: number): TieWire {
  const netLength = lengthPerCut * intersections * numStructures;
  return { netLength, intersections, rolls: Math.ceil(netLength / TIE_WIRE_ROLL) };
}

// ── Slab ──────────────────────────────────────────────────────────────────
export interface SlabInput {
  slabArea: number; thickness: number; numStructures: number;
  concreteClass: ConcreteClass; customFactor?: number;
  spliceLength: number;
  longSpanLength: number; numLongPieces: number; longDiaMm: number;
  shortSpanLength: number; numShortPieces: number; shortDiaMm: number;
  lengthPerCut: number; numIntersections: number;
}
export interface SlabResult {
  volume: number; materials: ConcreteMaterials;
  longSteel: BarTakeoff; shortSteel: BarTakeoff; totalSteelWeight: number;
  tieWire: TieWire;
}
export function estimateSlab(i: SlabInput): SlabResult {
  const volume = i.slabArea * i.thickness * i.numStructures;
  const materials = concreteMaterials(volume, i.concreteClass, i.customFactor);
  const longSteel = barTakeoff(i.longSpanLength * i.numLongPieces * i.numStructures, i.longDiaMm, i.spliceLength);
  const shortSteel = barTakeoff(i.shortSpanLength * i.numShortPieces * i.numStructures, i.shortDiaMm, i.spliceLength);
  return {
    volume, materials, longSteel, shortSteel,
    totalSteelWeight: longSteel.weight + shortSteel.weight,
    tieWire: tieWire(i.lengthPerCut, i.numIntersections, i.numStructures),
  };
}

// ── CHB (masonry) ───────────────────────────────────────────────────────────
export type ChbSize = '4' | '6' | '8';
const MORTAR_CEMENT: Record<ChbSize, number> = { '4': 0.522, '6': 1.018, '8': 1.5 };
const MORTAR_SAND: Record<ChbSize, number> = { '4': 0.0435, '6': 0.0844, '8': 0.125 };
export interface ChbInput { wallArea: number; holeArea: number; size: ChbSize; }
export interface ChbResult {
  netArea: number; pieces: number;
  mortar: { cement: number; sand: number };
  plaster: { cement: number; sand: number };
  totalCement: number; totalSand: number;
}
export function estimateChb(i: ChbInput): ChbResult {
  const netArea = i.wallArea - i.holeArea;
  const pieces = Math.ceil(netArea * 12.5);
  const mortar = { cement: Math.ceil(netArea * MORTAR_CEMENT[i.size]), sand: netArea * MORTAR_SAND[i.size] };
  const plaster = { cement: Math.ceil(netArea * 0.3), sand: netArea * 0.025 };
  return {
    netArea, pieces, mortar, plaster,
    totalCement: mortar.cement + plaster.cement,
    totalSand: mortar.sand + plaster.sand,
  };
}

// ── Column ──────────────────────────────────────────────────────────────────
export interface ColumnInput {
  length: number; width: number; height: number; numStructures: number;
  concreteClass: ConcreteClass; customFactor?: number; spliceLength: number;
  barLengthPerPiece: number; numBars: number; barDiaMm: number;
  tieLengthPerSet: number; numTieSets: number; tieDiaMm: number;
  lengthPerCut: number; numIntersections: number;
}
export interface ColumnResult {
  volume: number; materials: ConcreteMaterials;
  mainSteel: BarTakeoff; lateralTies: TieTakeoff; tieWire: TieWire;
}
export function estimateColumn(i: ColumnInput): ColumnResult {
  const volume = i.length * i.width * i.height * i.numStructures;
  return {
    volume,
    materials: concreteMaterials(volume, i.concreteClass, i.customFactor),
    mainSteel: barTakeoff(i.barLengthPerPiece * i.numBars * i.numStructures, i.barDiaMm, i.spliceLength),
    lateralTies: lateralTieTakeoff(i.tieLengthPerSet, i.numTieSets, i.tieDiaMm, i.numStructures),
    tieWire: tieWire(i.lengthPerCut, i.numIntersections, i.numStructures),
  };
}

// ── Beam ─────────────────────────────────────────────────────────────────────
export interface BeamBarGroup { lengthPerPiece: number; numPieces: number; diaMm: number; }
export interface BeamInput {
  length: number; width: number; height: number; numStructures: number;
  concreteClass: ConcreteClass; customFactor?: number; spliceLength: number;
  topSupport: BeamBarGroup; topMidspan: BeamBarGroup;
  bottomSupport: BeamBarGroup; bottomMidspan: BeamBarGroup;
  stirrupLengthPerSet: number; numStirrupSets: number; stirrupDiaMm: number;
  lengthPerCut: number; numIntersections: number;
}
export interface BeamResult {
  volume: number; materials: ConcreteMaterials;
  mainBars: { label: string; takeoff: BarTakeoff }[];
  totalMainWeight: number; stirrups: TieTakeoff; tieWire: TieWire;
}
export function estimateBeam(i: BeamInput): BeamResult {
  const volume = i.length * i.width * i.height * i.numStructures;
  const grp = (label: string, g: BeamBarGroup) => ({
    label, takeoff: barTakeoff(g.lengthPerPiece * g.numPieces * i.numStructures, g.diaMm, i.spliceLength),
  });
  const mainBars = [
    grp('Top bars @ support', i.topSupport),
    grp('Top bars @ midspan', i.topMidspan),
    grp('Bottom bars @ support', i.bottomSupport),
    grp('Bottom bars @ midspan', i.bottomMidspan),
  ];
  return {
    volume,
    materials: concreteMaterials(volume, i.concreteClass, i.customFactor),
    mainBars,
    totalMainWeight: mainBars.reduce((s, b) => s + b.takeoff.weight, 0),
    stirrups: lateralTieTakeoff(i.stirrupLengthPerSet, i.numStirrupSets, i.stirrupDiaMm, i.numStructures),
    tieWire: tieWire(i.lengthPerCut, i.numIntersections, i.numStructures),
  };
}

// ── Box culvert ───────────────────────────────────────────────────────────────
export interface BoxCulvertInput {
  grossArea: number; holeArea: number; length: number;
  concreteClass: ConcreteClass; customFactor?: number; spliceLength: number;
  numLongTop: number; longTopDiaMm: number;
  numLongU: number; longUDiaMm: number;
  rsbSpacing: number; topBarLength: number; topBarDiaMm: number; uBarLength: number; uBarDiaMm: number;
  lengthPerCut: number;
}
export interface BoxCulvertResult {
  netArea: number; volume: number; materials: ConcreteMaterials;
  longTop: BarTakeoff; longU: BarTakeoff;
  rsb: {
    count: number;
    top: { netLength: number; pieces: number; weight: number };
    u: { netLength: number; pieces: number; weight: number };
  };
  tieWire: TieWire;
}
export function estimateBoxCulvert(i: BoxCulvertInput): BoxCulvertResult {
  const netArea = i.grossArea - i.holeArea;
  const volume = netArea * i.length;
  // Longitudinal bars run the culvert length.
  const longTop = barTakeoff(i.length * i.numLongTop, i.longTopDiaMm, i.spliceLength);
  const longU = barTakeoff(i.length * i.numLongU, i.longUDiaMm, i.spliceLength);
  // Reinforcing steel bars (transverse rings) repeat at the spacing.
  const count = Math.ceil(i.length / i.rsbSpacing) + 1;
  const rsbBar = (perBarLen: number, diaMm: number) => {
    const netLength = count * perBarLen;
    const pieces = Math.ceil(netLength / BAR_LENGTH);
    return { netLength, pieces, weight: pieces * BAR_LENGTH * barAreaM2(diaMm) * STEEL_DENSITY };
  };
  const numLongitudinal = i.numLongTop + i.numLongU;
  return {
    netArea, volume,
    materials: concreteMaterials(volume, i.concreteClass, i.customFactor),
    longTop, longU,
    rsb: { count, top: rsbBar(i.topBarLength, i.topBarDiaMm), u: rsbBar(i.uBarLength, i.uBarDiaMm) },
    tieWire: tieWire(i.lengthPerCut, count * numLongitudinal, 1),
  };
}
