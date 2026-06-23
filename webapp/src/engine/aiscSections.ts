// ─────────────────────────────────────────────────────────────────────────
// AISC Steel Construction Manual 14th Edition — complete metric shape library.
// Units: area mm², dimensions mm, radii of gyration mm.
// Families: W, C, L, HSS (rect/square), PIPE (round HSS), WT.
// ─────────────────────────────────────────────────────────────────────────

export type SectionFamily = 'W' | 'C' | 'L' | 'HSS' | 'PIPE' | 'WT'

export interface AiscShape {
  name: string
  family: SectionFamily
  A: number                 // gross area, mm²
  rx: number; ry: number    // radii of gyration, mm
  rz?: number               // minor principal radius (single angles), mm
  xbar?: number             // centroid from back of leg (angles), mm
  // geometry for rendering, mm
  d?: number; bf?: number; tf?: number; tw?: number   // W / C / WT
  leg1?: number; leg2?: number; t?: number            // L (+ HSS wall t)
  b?: number; h?: number                              // HSS rect/square
  D?: number                                          // round HSS / pipe (+ t)
}

// ── W-shapes (wide flange) ──────────────────────────────────────────────────
const W: AiscShape[] = [
  // W100
  { name: 'W100x19',   family: 'W', A:  2480, rx:  44.1, ry:  25.7, d: 106, bf: 103, tf:  8.8, tw:  7.1 },

  // W150
  { name: 'W150x13',   family: 'W', A:  1630, rx:  60.3, ry:  21.7, d: 150, bf: 100, tf:  7.1, tw:  5.0 },
  { name: 'W150x18',   family: 'W', A:  2290, rx:  65.0, ry:  24.9, d: 153, bf: 102, tf:  7.1, tw:  5.8 },
  { name: 'W150x22',   family: 'W', A:  2850, rx:  62.0, ry:  38.1, d: 152, bf: 152, tf:  6.6, tw:  5.8 },
  { name: 'W150x24',   family: 'W', A:  3060, rx:  64.0, ry:  24.2, d: 160, bf: 102, tf: 10.3, tw:  6.6 },
  { name: 'W150x29.8', family: 'W', A:  3800, rx:  64.0, ry:  37.8, d: 157, bf: 153, tf:  9.3, tw:  6.6 },
  { name: 'W150x37',   family: 'W', A:  4740, rx:  65.0, ry:  37.7, d: 162, bf: 154, tf: 11.6, tw:  8.0 },

  // W200
  { name: 'W200x15',   family: 'W', A:  1910, rx:  83.0, ry:  20.4, d: 200, bf: 100, tf:  6.2, tw:  4.3 },
  { name: 'W200x17.9', family: 'W', A:  2280, rx:  83.0, ry:  21.4, d: 201, bf: 102, tf:  6.5, tw:  4.8 },
  { name: 'W200x22',   family: 'W', A:  2860, rx:  84.0, ry:  22.3, d: 206, bf: 102, tf:  8.0, tw:  6.2 },
  { name: 'W200x26.6', family: 'W', A:  3390, rx:  85.0, ry:  30.5, d: 207, bf: 133, tf:  8.4, tw:  5.8 },
  { name: 'W200x31.3', family: 'W', A:  3970, rx:  86.0, ry:  30.8, d: 210, bf: 134, tf: 10.2, tw:  6.4 },
  { name: 'W200x35.9', family: 'W', A:  4570, rx:  84.0, ry:  38.9, d: 201, bf: 165, tf: 10.2, tw:  6.2 },
  { name: 'W200x41.7', family: 'W', A:  5310, rx:  85.0, ry:  39.1, d: 205, bf: 166, tf: 11.8, tw:  7.2 },
  { name: 'W200x46.1', family: 'W', A:  5890, rx:  89.0, ry:  51.8, d: 203, bf: 203, tf: 11.0, tw:  7.2 },
  { name: 'W200x52',   family: 'W', A:  6650, rx:  89.0, ry:  51.9, d: 206, bf: 204, tf: 12.6, tw:  7.9 },
  { name: 'W200x59.3', family: 'W', A:  7560, rx:  89.0, ry:  51.8, d: 210, bf: 205, tf: 14.2, tw:  9.1 },
  { name: 'W200x71.9', family: 'W', A:  9100, rx:  90.0, ry:  51.9, d: 216, bf: 206, tf: 17.4, tw: 10.2 },
  { name: 'W200x86',   family: 'W', A: 11000, rx:  91.0, ry:  52.6, d: 222, bf: 209, tf: 20.6, tw: 13.0 },
  { name: 'W200x100',  family: 'W', A: 12700, rx:  92.0, ry:  52.7, d: 229, bf: 210, tf: 23.7, tw: 14.5 },

  // W250
  { name: 'W250x17.9', family: 'W', A:  2280, rx: 103.0, ry:  20.5, d: 251, bf: 101, tf:  6.1, tw:  4.8 },
  { name: 'W250x22.3', family: 'W', A:  2840, rx: 105.0, ry:  21.1, d: 254, bf: 102, tf:  6.9, tw:  5.8 },
  { name: 'W250x25.3', family: 'W', A:  3230, rx: 106.0, ry:  21.3, d: 257, bf: 102, tf:  8.4, tw:  6.1 },
  { name: 'W250x28.4', family: 'W', A:  3620, rx: 107.0, ry:  21.4, d: 260, bf: 102, tf: 10.0, tw:  6.4 },
  { name: 'W250x32.7', family: 'W', A:  4190, rx: 105.0, ry:  33.8, d: 259, bf: 146, tf:  9.1, tw:  6.1 },
  { name: 'W250x38.7', family: 'W', A:  4910, rx: 107.0, ry:  34.5, d: 262, bf: 147, tf: 11.2, tw:  6.6 },
  { name: 'W250x44.8', family: 'W', A:  5700, rx: 108.0, ry:  34.8, d: 267, bf: 148, tf: 13.0, tw:  7.6 },
  { name: 'W250x49.1', family: 'W', A:  6260, rx: 106.0, ry:  50.5, d: 254, bf: 203, tf: 13.5, tw:  8.6 },
  { name: 'W250x58',   family: 'W', A:  7420, rx: 108.0, ry:  50.3, d: 252, bf: 203, tf: 13.5, tw:  8.0 },
  { name: 'W250x67',   family: 'W', A:  8580, rx: 110.0, ry:  51.1, d: 257, bf: 204, tf: 15.7, tw:  8.9 },
  { name: 'W250x73',   family: 'W', A:  9290, rx: 107.0, ry:  63.7, d: 253, bf: 254, tf: 14.2, tw:  8.6 },
  { name: 'W250x80',   family: 'W', A: 10200, rx: 108.0, ry:  63.8, d: 256, bf: 255, tf: 15.6, tw:  9.4 },
  { name: 'W250x89',   family: 'W', A: 11400, rx: 108.0, ry:  64.1, d: 260, bf: 256, tf: 17.3, tw: 10.7 },
  { name: 'W250x101',  family: 'W', A: 12900, rx: 109.0, ry:  64.2, d: 264, bf: 257, tf: 19.6, tw: 11.9 },
  { name: 'W250x115',  family: 'W', A: 14600, rx: 110.0, ry:  64.5, d: 269, bf: 259, tf: 22.1, tw: 13.5 },
  { name: 'W250x131',  family: 'W', A: 16800, rx: 112.0, ry:  64.6, d: 275, bf: 261, tf: 25.1, tw: 15.4 },
  { name: 'W250x149',  family: 'W', A: 19000, rx: 113.0, ry:  64.7, d: 282, bf: 263, tf: 28.4, tw: 17.3 },
  { name: 'W250x167',  family: 'W', A: 21300, rx: 114.0, ry:  64.8, d: 289, bf: 265, tf: 31.8, tw: 19.2 },
  { name: 'W250x192',  family: 'W', A: 24400, rx: 116.0, ry:  65.3, d: 299, bf: 268, tf: 36.6, tw: 22.1 },

  // W310
  { name: 'W310x21',   family: 'W', A:  2680, rx: 123.0, ry:  19.8, d: 303, bf: 101, tf:  5.7, tw:  5.1 },
  { name: 'W310x23.8', family: 'W', A:  3030, rx: 124.0, ry:  20.1, d: 305, bf: 101, tf:  6.7, tw:  5.6 },
  { name: 'W310x28.3', family: 'W', A:  3590, rx: 127.0, ry:  20.5, d: 309, bf: 102, tf:  8.9, tw:  6.1 },
  { name: 'W310x32.7', family: 'W', A:  4180, rx: 128.0, ry:  20.6, d: 313, bf: 102, tf: 10.8, tw:  6.6 },
  { name: 'W310x38.7', family: 'W', A:  4940, rx: 129.0, ry:  38.4, d: 310, bf: 165, tf:  9.7, tw:  5.8 },
  { name: 'W310x44.5', family: 'W', A:  5670, rx: 130.0, ry:  38.5, d: 313, bf: 166, tf: 11.2, tw:  6.6 },
  { name: 'W310x52',   family: 'W', A:  6630, rx: 131.0, ry:  38.6, d: 317, bf: 167, tf: 13.2, tw:  7.6 },
  { name: 'W310x60',   family: 'W', A:  7610, rx: 128.0, ry:  49.7, d: 303, bf: 203, tf: 13.1, tw:  7.5 },
  { name: 'W310x67',   family: 'W', A:  8530, rx: 129.0, ry:  50.0, d: 306, bf: 204, tf: 14.6, tw:  8.5 },
  { name: 'W310x74',   family: 'W', A:  9420, rx: 130.0, ry:  50.3, d: 310, bf: 205, tf: 16.3, tw:  9.4 },
  { name: 'W310x79',   family: 'W', A: 10000, rx: 132.0, ry:  63.9, d: 306, bf: 254, tf: 14.6, tw:  8.8 },
  { name: 'W310x86',   family: 'W', A: 10900, rx: 133.0, ry:  63.9, d: 310, bf: 254, tf: 16.3, tw:  9.1 },
  { name: 'W310x97',   family: 'W', A: 12300, rx: 131.0, ry:  76.0, d: 308, bf: 305, tf: 15.4, tw:  9.9 },
  { name: 'W310x107',  family: 'W', A: 13700, rx: 132.0, ry:  76.2, d: 311, bf: 306, tf: 17.0, tw: 10.9 },
  { name: 'W310x117',  family: 'W', A: 14900, rx: 133.0, ry:  76.4, d: 314, bf: 307, tf: 18.7, tw: 11.9 },
  { name: 'W310x129',  family: 'W', A: 16500, rx: 134.0, ry:  76.6, d: 318, bf: 308, tf: 20.6, tw: 13.1 },
  { name: 'W310x143',  family: 'W', A: 18200, rx: 135.0, ry:  76.8, d: 323, bf: 309, tf: 23.0, tw: 14.5 },
  { name: 'W310x158',  family: 'W', A: 20100, rx: 136.0, ry:  77.0, d: 327, bf: 310, tf: 25.1, tw: 15.5 },
  { name: 'W310x179',  family: 'W', A: 22800, rx: 137.0, ry:  77.4, d: 333, bf: 312, tf: 28.4, tw: 17.8 },
  { name: 'W310x202',  family: 'W', A: 25800, rx: 139.0, ry:  77.7, d: 341, bf: 314, tf: 31.8, tw: 20.3 },
  { name: 'W310x226',  family: 'W', A: 28900, rx: 141.0, ry:  78.2, d: 348, bf: 317, tf: 35.6, tw: 22.9 },
  { name: 'W310x253',  family: 'W', A: 32300, rx: 143.0, ry:  78.4, d: 356, bf: 319, tf: 39.6, tw: 25.4 },
  { name: 'W310x283',  family: 'W', A: 36100, rx: 145.0, ry:  78.9, d: 365, bf: 322, tf: 44.1, tw: 28.4 },
  { name: 'W310x313',  family: 'W', A: 39900, rx: 147.0, ry:  79.3, d: 374, bf: 324, tf: 48.8, tw: 31.2 },
  { name: 'W310x342',  family: 'W', A: 43600, rx: 149.0, ry:  79.6, d: 384, bf: 327, tf: 53.1, tw: 34.5 },
  { name: 'W310x375',  family: 'W', A: 47800, rx: 151.0, ry:  80.2, d: 393, bf: 330, tf: 57.9, tw: 37.1 },
  { name: 'W310x415',  family: 'W', A: 52900, rx: 154.0, ry:  80.8, d: 403, bf: 334, tf: 63.5, tw: 40.1 },

  // W360
  { name: 'W360x32.9', family: 'W', A:  4180, rx: 144.0, ry:  26.4, d: 349, bf: 128, tf:  8.5, tw:  5.8 },
  { name: 'W360x39',   family: 'W', A:  4960, rx: 146.0, ry:  26.7, d: 353, bf: 128, tf: 10.7, tw:  6.5 },
  { name: 'W360x44',   family: 'W', A:  5710, rx: 147.0, ry:  39.5, d: 352, bf: 171, tf:  9.8, tw:  6.9 },
  { name: 'W360x51',   family: 'W', A:  6450, rx: 149.0, ry:  39.6, d: 355, bf: 171, tf: 11.6, tw:  7.2 },
  { name: 'W360x57.8', family: 'W', A:  7360, rx: 150.0, ry:  39.8, d: 358, bf: 172, tf: 13.1, tw:  7.9 },
  { name: 'W360x64',   family: 'W', A:  8130, rx: 147.0, ry:  46.4, d: 347, bf: 203, tf: 13.5, tw:  7.7 },
  { name: 'W360x72',   family: 'W', A:  9100, rx: 148.0, ry:  46.6, d: 351, bf: 204, tf: 15.1, tw:  8.6 },
  { name: 'W360x79',   family: 'W', A: 10100, rx: 149.0, ry:  46.8, d: 354, bf: 205, tf: 16.8, tw:  9.4 },
  { name: 'W360x91',   family: 'W', A: 11500, rx: 149.0, ry:  57.9, d: 353, bf: 254, tf: 16.4, tw:  9.5 },
  { name: 'W360x101',  family: 'W', A: 12900, rx: 150.0, ry:  58.1, d: 357, bf: 255, tf: 18.3, tw: 10.5 },
  { name: 'W360x110',  family: 'W', A: 14000, rx: 151.0, ry:  58.2, d: 360, bf: 256, tf: 19.9, tw: 11.4 },
  { name: 'W360x122',  family: 'W', A: 15500, rx: 152.0, ry:  58.4, d: 363, bf: 257, tf: 21.7, tw: 12.8 },
  { name: 'W360x134',  family: 'W', A: 17100, rx: 153.0, ry:  58.7, d: 367, bf: 258, tf: 23.9, tw: 14.0 },
  { name: 'W360x147',  family: 'W', A: 18700, rx: 152.0, ry:  70.9, d: 360, bf: 308, tf: 22.0, tw: 12.3 },
  { name: 'W360x162',  family: 'W', A: 20600, rx: 153.0, ry:  71.3, d: 364, bf: 309, tf: 24.4, tw: 13.3 },
  { name: 'W360x179',  family: 'W', A: 22800, rx: 154.0, ry:  71.5, d: 368, bf: 310, tf: 27.2, tw: 15.0 },
  { name: 'W360x196',  family: 'W', A: 25000, rx: 157.0, ry:  89.1, d: 372, bf: 374, tf: 26.2, tw: 16.4 },
  { name: 'W360x216',  family: 'W', A: 27600, rx: 158.0, ry:  89.1, d: 375, bf: 375, tf: 28.6, tw: 17.3 },
  { name: 'W360x237',  family: 'W', A: 30200, rx: 159.0, ry:  89.3, d: 380, bf: 376, tf: 31.0, tw: 18.9 },
  { name: 'W360x262',  family: 'W', A: 33400, rx: 161.0, ry:  89.6, d: 387, bf: 378, tf: 34.5, tw: 21.1 },
  { name: 'W360x287',  family: 'W', A: 36600, rx: 162.0, ry:  90.0, d: 393, bf: 381, tf: 37.6, tw: 23.1 },
  { name: 'W360x314',  family: 'W', A: 40000, rx: 164.0, ry:  90.4, d: 399, bf: 383, tf: 41.4, tw: 25.4 },
  { name: 'W360x347',  family: 'W', A: 44200, rx: 166.0, ry:  90.9, d: 406, bf: 386, tf: 45.7, tw: 27.9 },
  { name: 'W360x382',  family: 'W', A: 48700, rx: 168.0, ry:  91.4, d: 415, bf: 389, tf: 50.0, tw: 30.9 },
  { name: 'W360x421',  family: 'W', A: 53700, rx: 170.0, ry:  92.1, d: 422, bf: 393, tf: 55.6, tw: 34.1 },
  { name: 'W360x463',  family: 'W', A: 59000, rx: 172.0, ry:  92.7, d: 430, bf: 397, tf: 61.0, tw: 37.9 },
  { name: 'W360x509',  family: 'W', A: 64900, rx: 175.0, ry:  93.5, d: 440, bf: 401, tf: 67.6, tw: 41.9 },
  { name: 'W360x551',  family: 'W', A: 70200, rx: 177.0, ry:  94.0, d: 449, bf: 404, tf: 73.4, tw: 45.7 },
  { name: 'W360x592',  family: 'W', A: 75500, rx: 179.0, ry:  94.4, d: 455, bf: 407, tf: 78.0, tw: 49.3 },
  { name: 'W360x634',  family: 'W', A: 80900, rx: 181.0, ry:  94.9, d: 461, bf: 410, tf: 83.1, tw: 52.8 },
  { name: 'W360x677',  family: 'W', A: 86300, rx: 182.0, ry:  95.3, d: 467, bf: 413, tf: 88.1, tw: 56.4 },
  { name: 'W360x744',  family: 'W', A: 94700, rx: 185.0, ry:  95.9, d: 476, bf: 417, tf: 96.0, tw: 61.5 },
  { name: 'W360x818',  family: 'W', A:104000, rx: 187.0, ry:  96.6, d: 486, bf: 422, tf:105.0, tw: 67.6 },
  { name: 'W360x900',  family: 'W', A:115000, rx: 190.0, ry:  97.4, d: 499, bf: 428, tf:115.0, tw: 74.6 },
  { name: 'W360x990',  family: 'W', A:126000, rx: 193.0, ry:  98.1, d: 510, bf: 432, tf:125.0, tw: 81.5 },

  // W410
  { name: 'W410x38.8', family: 'W', A:  4950, rx: 162.0, ry:  29.0, d: 399, bf: 140, tf:  8.8, tw:  6.4 },
  { name: 'W410x46.1', family: 'W', A:  5880, rx: 163.0, ry:  29.3, d: 403, bf: 140, tf: 11.2, tw:  7.0 },
  { name: 'W410x53',   family: 'W', A:  6760, rx: 164.0, ry:  39.2, d: 403, bf: 177, tf: 10.9, tw:  7.5 },
  { name: 'W410x60',   family: 'W', A:  7590, rx: 165.0, ry:  39.4, d: 407, bf: 178, tf: 12.8, tw:  7.7 },
  { name: 'W410x67',   family: 'W', A:  8530, rx: 166.0, ry:  39.6, d: 410, bf: 179, tf: 14.4, tw:  8.8 },
  { name: 'W410x74.3', family: 'W', A:  9480, rx: 167.0, ry:  39.8, d: 413, bf: 180, tf: 16.0, tw:  9.7 },
  { name: 'W410x85',   family: 'W', A: 10800, rx: 168.0, ry:  40.0, d: 417, bf: 181, tf: 18.2, tw: 10.9 },
  { name: 'W410x100',  family: 'W', A: 12700, rx: 168.0, ry:  60.5, d: 415, bf: 260, tf: 17.6, tw: 10.0 },
  { name: 'W410x114',  family: 'W', A: 14500, rx: 169.0, ry:  60.6, d: 420, bf: 261, tf: 19.3, tw: 11.6 },
  { name: 'W410x132',  family: 'W', A: 16800, rx: 171.0, ry:  60.9, d: 425, bf: 263, tf: 22.2, tw: 13.3 },
  { name: 'W410x149',  family: 'W', A: 19000, rx: 172.0, ry:  61.2, d: 431, bf: 265, tf: 25.0, tw: 15.5 },

  // W460
  { name: 'W460x52',   family: 'W', A:  6650, rx: 183.0, ry:  31.7, d: 450, bf: 152, tf: 10.8, tw:  7.6 },
  { name: 'W460x60',   family: 'W', A:  7590, rx: 185.0, ry:  32.1, d: 455, bf: 153, tf: 13.3, tw:  8.0 },
  { name: 'W460x68',   family: 'W', A:  8680, rx: 187.0, ry:  32.3, d: 459, bf: 154, tf: 15.4, tw:  9.1 },
  { name: 'W460x74',   family: 'W', A:  9420, rx: 186.0, ry:  42.4, d: 457, bf: 190, tf: 14.5, tw:  9.0 },
  { name: 'W460x82',   family: 'W', A: 10500, rx: 187.0, ry:  42.6, d: 460, bf: 191, tf: 16.0, tw:  9.9 },
  { name: 'W460x89',   family: 'W', A: 11400, rx: 188.0, ry:  42.8, d: 463, bf: 192, tf: 17.7, tw: 10.5 },
  { name: 'W460x97',   family: 'W', A: 12300, rx: 189.0, ry:  43.0, d: 466, bf: 193, tf: 19.0, tw: 11.4 },
  { name: 'W460x106',  family: 'W', A: 13500, rx: 190.0, ry:  43.2, d: 469, bf: 194, tf: 20.6, tw: 12.6 },
  { name: 'W460x113',  family: 'W', A: 14400, rx: 189.0, ry:  64.7, d: 463, bf: 280, tf: 17.3, tw: 10.8 },
  { name: 'W460x128',  family: 'W', A: 16300, rx: 190.0, ry:  65.0, d: 467, bf: 282, tf: 19.6, tw: 12.2 },
  { name: 'W460x144',  family: 'W', A: 18400, rx: 192.0, ry:  65.2, d: 472, bf: 283, tf: 22.1, tw: 13.6 },
  { name: 'W460x158',  family: 'W', A: 20200, rx: 193.0, ry:  65.4, d: 476, bf: 284, tf: 24.4, tw: 14.9 },
  { name: 'W460x177',  family: 'W', A: 22600, rx: 195.0, ry:  65.7, d: 482, bf: 286, tf: 27.2, tw: 16.6 },
  { name: 'W460x193',  family: 'W', A: 24600, rx: 197.0, ry:  66.1, d: 489, bf: 288, tf: 30.5, tw: 18.1 },
  { name: 'W460x213',  family: 'W', A: 27100, rx: 199.0, ry:  66.5, d: 496, bf: 290, tf: 33.6, tw: 20.6 },

  // W530
  { name: 'W530x66',   family: 'W', A:  8380, rx: 218.0, ry:  35.8, d: 529, bf: 166, tf: 11.4, tw:  8.9 },
  { name: 'W530x72',   family: 'W', A:  9160, rx: 218.0, ry:  35.8, d: 526, bf: 166, tf: 12.7, tw:  9.6 },
  { name: 'W530x82',   family: 'W', A: 10500, rx: 219.0, ry:  47.8, d: 528, bf: 209, tf: 13.3, tw:  9.5 },
  { name: 'W530x85',   family: 'W', A: 10800, rx: 221.0, ry:  35.5, d: 535, bf: 166, tf: 16.5, tw: 10.2 },
  { name: 'W530x92',   family: 'W', A: 11700, rx: 220.0, ry:  47.9, d: 533, bf: 209, tf: 15.6, tw: 10.2 },
  { name: 'W530x101',  family: 'W', A: 12900, rx: 221.0, ry:  48.0, d: 537, bf: 210, tf: 17.4, tw: 10.9 },
  { name: 'W530x109',  family: 'W', A: 13900, rx: 222.0, ry:  48.2, d: 539, bf: 211, tf: 18.8, tw: 11.6 },
  { name: 'W530x123',  family: 'W', A: 15700, rx: 223.0, ry:  48.4, d: 544, bf: 212, tf: 21.2, tw: 13.1 },
  { name: 'W530x138',  family: 'W', A: 17600, rx: 225.0, ry:  48.7, d: 549, bf: 214, tf: 23.6, tw: 14.7 },
  { name: 'W530x150',  family: 'W', A: 19100, rx: 226.0, ry:  74.0, d: 543, bf: 312, tf: 20.3, tw: 12.7 },
  { name: 'W530x165',  family: 'W', A: 21000, rx: 227.0, ry:  74.2, d: 550, bf: 313, tf: 22.2, tw: 14.0 },
  { name: 'W530x182',  family: 'W', A: 23200, rx: 228.0, ry:  74.4, d: 555, bf: 315, tf: 24.4, tw: 15.2 },
  { name: 'W530x196',  family: 'W', A: 24900, rx: 229.0, ry:  74.6, d: 560, bf: 316, tf: 26.2, tw: 16.5 },
  { name: 'W530x219',  family: 'W', A: 27900, rx: 232.0, ry:  75.0, d: 568, bf: 319, tf: 29.2, tw: 18.3 },

  // W610
  { name: 'W610x82',   family: 'W', A: 10500, rx: 245.0, ry:  37.6, d: 599, bf: 178, tf: 12.8, tw: 10.0 },
  { name: 'W610x92',   family: 'W', A: 11800, rx: 248.0, ry:  37.9, d: 603, bf: 179, tf: 15.0, tw: 10.9 },
  { name: 'W610x101',  family: 'W', A: 12900, rx: 249.0, ry:  51.6, d: 603, bf: 228, tf: 14.9, tw: 10.5 },
  { name: 'W610x113',  family: 'W', A: 14400, rx: 251.0, ry:  51.8, d: 608, bf: 228, tf: 17.3, tw: 11.2 },
  { name: 'W610x125',  family: 'W', A: 16000, rx: 252.0, ry:  52.1, d: 612, bf: 229, tf: 19.6, tw: 11.9 },
  { name: 'W610x140',  family: 'W', A: 17900, rx: 254.0, ry:  52.4, d: 617, bf: 230, tf: 22.2, tw: 13.1 },
  { name: 'W610x153',  family: 'W', A: 19500, rx: 255.0, ry:  52.5, d: 622, bf: 230, tf: 24.4, tw: 14.0 },
  { name: 'W610x174',  family: 'W', A: 22200, rx: 255.0, ry:  73.5, d: 616, bf: 325, tf: 21.6, tw: 14.0 },
  { name: 'W610x195',  family: 'W', A: 24800, rx: 257.0, ry:  73.8, d: 622, bf: 327, tf: 24.4, tw: 15.4 },
  { name: 'W610x217',  family: 'W', A: 27700, rx: 259.0, ry:  74.1, d: 628, bf: 328, tf: 27.7, tw: 17.0 },
  { name: 'W610x241',  family: 'W', A: 30700, rx: 261.0, ry:  74.4, d: 635, bf: 329, tf: 31.0, tw: 18.9 },
  { name: 'W610x285',  family: 'W', A: 36200, rx: 264.0, ry:  74.8, d: 647, bf: 333, tf: 36.6, tw: 22.1 },
  { name: 'W610x307',  family: 'W', A: 39200, rx: 266.0, ry:  75.1, d: 652, bf: 334, tf: 39.6, tw: 23.6 },
  { name: 'W610x341',  family: 'W', A: 43500, rx: 268.0, ry:  75.7, d: 660, bf: 338, tf: 43.9, tw: 26.2 },
  { name: 'W610x372',  family: 'W', A: 47400, rx: 271.0, ry:  76.0, d: 668, bf: 340, tf: 47.6, tw: 29.0 },
  { name: 'W610x415',  family: 'W', A: 52900, rx: 274.0, ry:  76.5, d: 678, bf: 343, tf: 53.1, tw: 32.5 },
  { name: 'W610x455',  family: 'W', A: 58100, rx: 277.0, ry:  77.0, d: 688, bf: 346, tf: 58.4, tw: 35.6 },
  { name: 'W610x498',  family: 'W', A: 63500, rx: 279.0, ry:  77.4, d: 698, bf: 349, tf: 63.5, tw: 38.9 },
  { name: 'W610x551',  family: 'W', A: 70200, rx: 283.0, ry:  78.0, d: 711, bf: 353, tf: 69.9, tw: 43.2 },

  // W690
  { name: 'W690x125',  family: 'W', A: 15900, rx: 278.0, ry:  56.6, d: 678, bf: 253, tf: 16.3, tw: 11.7 },
  { name: 'W690x140',  family: 'W', A: 17800, rx: 280.0, ry:  56.9, d: 684, bf: 254, tf: 18.9, tw: 12.4 },
  { name: 'W690x152',  family: 'W', A: 19400, rx: 281.0, ry:  57.1, d: 688, bf: 254, tf: 20.6, tw: 13.1 },
  { name: 'W690x170',  family: 'W', A: 21700, rx: 283.0, ry:  57.4, d: 693, bf: 255, tf: 23.6, tw: 14.5 },
  { name: 'W690x192',  family: 'W', A: 24500, rx: 285.0, ry:  57.7, d: 701, bf: 256, tf: 26.8, tw: 16.4 },
  { name: 'W690x217',  family: 'W', A: 27700, rx: 288.0, ry:  58.1, d: 710, bf: 258, tf: 30.2, tw: 18.3 },
  { name: 'W690x240',  family: 'W', A: 30600, rx: 290.0, ry:  58.4, d: 717, bf: 259, tf: 33.3, tw: 20.3 },
  { name: 'W690x265',  family: 'W', A: 33800, rx: 293.0, ry:  58.9, d: 725, bf: 261, tf: 36.6, tw: 22.4 },
  { name: 'W690x289',  family: 'W', A: 36800, rx: 295.0, ry:  59.2, d: 733, bf: 263, tf: 40.0, tw: 24.4 },

  // W760
  { name: 'W760x134',  family: 'W', A: 17100, rx: 306.0, ry:  59.2, d: 750, bf: 265, tf: 17.0, tw: 13.2 },
  { name: 'W760x147',  family: 'W', A: 18700, rx: 307.0, ry:  59.2, d: 753, bf: 265, tf: 18.9, tw: 13.2 },
  { name: 'W760x161',  family: 'W', A: 20500, rx: 308.0, ry:  59.5, d: 758, bf: 266, tf: 21.1, tw: 13.8 },
  { name: 'W760x173',  family: 'W', A: 22000, rx: 310.0, ry:  59.7, d: 762, bf: 267, tf: 23.6, tw: 14.4 },
  { name: 'W760x185',  family: 'W', A: 23500, rx: 310.0, ry:  59.7, d: 762, bf: 267, tf: 25.4, tw: 14.9 },
  { name: 'W760x196',  family: 'W', A: 25000, rx: 313.0, ry:  59.9, d: 770, bf: 268, tf: 25.4, tw: 16.3 },
  { name: 'W760x220',  family: 'W', A: 28000, rx: 315.0, ry:  59.9, d: 779, bf: 268, tf: 29.5, tw: 16.5 },
  { name: 'W760x257',  family: 'W', A: 32700, rx: 320.0, ry:  60.3, d: 792, bf: 270, tf: 33.8, tw: 19.3 },
  { name: 'W760x284',  family: 'W', A: 36200, rx: 323.0, ry:  60.7, d: 800, bf: 272, tf: 37.6, tw: 21.6 },
  { name: 'W760x314',  family: 'W', A: 40000, rx: 326.0, ry:  61.0, d: 810, bf: 273, tf: 41.1, tw: 24.1 },

  // W840
  { name: 'W840x176',  family: 'W', A: 22400, rx: 342.0, ry:  65.1, d: 835, bf: 292, tf: 20.6, tw: 14.7 },
  { name: 'W840x193',  family: 'W', A: 24500, rx: 343.0, ry:  65.2, d: 840, bf: 292, tf: 23.0, tw: 15.9 },
  { name: 'W840x210',  family: 'W', A: 26700, rx: 345.0, ry:  65.3, d: 845, bf: 293, tf: 25.0, tw: 17.4 },
  { name: 'W840x226',  family: 'W', A: 28700, rx: 346.0, ry:  65.5, d: 850, bf: 294, tf: 26.8, tw: 18.8 },
  { name: 'W840x246',  family: 'W', A: 31300, rx: 348.0, ry:  65.7, d: 856, bf: 295, tf: 29.5, tw: 20.3 },
  { name: 'W840x276',  family: 'W', A: 35100, rx: 352.0, ry:  65.9, d: 869, bf: 297, tf: 33.0, tw: 22.9 },

  // W920
  { name: 'W920x201',  family: 'W', A: 25600, rx: 370.0, ry:  68.3, d: 903, bf: 304, tf: 20.1, tw: 15.2 },
  { name: 'W920x223',  family: 'W', A: 28500, rx: 373.0, ry:  68.5, d: 912, bf: 305, tf: 23.0, tw: 16.3 },
  { name: 'W920x238',  family: 'W', A: 30400, rx: 374.0, ry:  68.5, d: 915, bf: 305, tf: 24.4, tw: 17.3 },
  { name: 'W920x253',  family: 'W', A: 32300, rx: 375.0, ry:  68.6, d: 919, bf: 305, tf: 26.0, tw: 18.4 },
  { name: 'W920x271',  family: 'W', A: 34500, rx: 377.0, ry:  68.7, d: 923, bf: 306, tf: 27.9, tw: 19.3 },
  { name: 'W920x289',  family: 'W', A: 36800, rx: 378.0, ry:  68.9, d: 927, bf: 307, tf: 30.0, tw: 20.3 },
  { name: 'W920x313',  family: 'W', A: 39900, rx: 380.0, ry:  69.1, d: 932, bf: 308, tf: 32.5, tw: 21.8 },
  { name: 'W920x345',  family: 'W', A: 44000, rx: 383.0, ry:  69.4, d: 941, bf: 309, tf: 36.1, tw: 24.0 },
  { name: 'W920x381',  family: 'W', A: 48600, rx: 386.0, ry:  69.7, d: 952, bf: 310, tf: 39.9, tw: 26.9 },
  { name: 'W920x420',  family: 'W', A: 53500, rx: 389.0, ry:  70.0, d: 962, bf: 312, tf: 43.9, tw: 29.5 },
]

// ── C-shapes (American Standard Channels) ───────────────────────────────────
const C: AiscShape[] = [
  { name: 'C75x8.9',   family: 'C', A:  1140, rx:  29.5, ry:   9.6, d:  76, bf:  37.1, tf:  6.9, tw:  9.0 },
  { name: 'C100x10.8', family: 'C', A:  1370, rx:  39.6, ry:  10.2, d: 102, bf:  40.3, tf:  7.5, tw:  8.2 },
  { name: 'C100x13.4', family: 'C', A:  1700, rx:  39.8, ry:  11.0, d: 102, bf:  43.7, tf:  7.5, tw: 12.2 },
  { name: 'C130x10.0', family: 'C', A:  1270, rx:  51.8, ry:  12.0, d: 127, bf:  47.3, tf:  8.1, tw:  7.3 },
  { name: 'C130x13.4', family: 'C', A:  1700, rx:  51.6, ry:  12.9, d: 127, bf:  51.9, tf:  9.1, tw: 11.4 },
  { name: 'C150x12.2', family: 'C', A:  1550, rx:  61.6, ry:  12.8, d: 152, bf:  51.7, tf:  8.0, tw:  8.0 },
  { name: 'C150x15.6', family: 'C', A:  1990, rx:  61.6, ry:  13.0, d: 152, bf:  51.7, tf:  8.0, tw:  8.0 },
  { name: 'C150x19.3', family: 'C', A:  2470, rx:  61.0, ry:  13.0, d: 152, bf:  54.8, tf:  8.7, tw: 11.1 },
  { name: 'C150x25.7', family: 'C', A:  3280, rx:  60.5, ry:  13.8, d: 152, bf:  58.9, tf: 11.1, tw: 15.3 },
  { name: 'C180x14.6', family: 'C', A:  1870, rx:  72.1, ry:  12.8, d: 178, bf:  53.6, tf:  8.1, tw:  8.1 },
  { name: 'C180x18.2', family: 'C', A:  2320, rx:  72.6, ry:  13.2, d: 178, bf:  56.0, tf:  8.7, tw: 10.6 },
  { name: 'C180x21.9', family: 'C', A:  2790, rx:  73.0, ry:  13.7, d: 178, bf:  58.4, tf: 10.3, tw: 13.0 },
  { name: 'C200x17.1', family: 'C', A:  2180, rx:  82.5, ry:  14.5, d: 203, bf:  57.4, tf:  9.9, tw:  5.6 },
  { name: 'C200x20.5', family: 'C', A:  2620, rx:  82.0, ry:  14.7, d: 203, bf:  59.5, tf:  9.9, tw:  7.7 },
  { name: 'C200x27.9', family: 'C', A:  3550, rx:  80.0, ry:  14.9, d: 203, bf:  64.2, tf:  9.9, tw: 12.4 },
  { name: 'C230x19.9', family: 'C', A:  2540, rx:  93.5, ry:  15.3, d: 229, bf:  63.1, tf: 10.5, tw:  7.2 },
  { name: 'C230x22.2', family: 'C', A:  2830, rx:  93.9, ry:  15.6, d: 229, bf:  64.9, tf: 10.5, tw:  9.5 },
  { name: 'C230x29.8', family: 'C', A:  3800, rx:  93.5, ry:  16.5, d: 229, bf:  67.3, tf: 10.5, tw: 12.2 },
  { name: 'C250x22.8', family: 'C', A:  2900, rx: 103.0, ry:  15.5, d: 254, bf:  66.0, tf: 11.1, tw:  7.9 },
  { name: 'C250x29.8', family: 'C', A:  3790, rx: 103.0, ry:  16.3, d: 254, bf:  69.6, tf: 11.1, tw: 11.4 },
  { name: 'C250x37',   family: 'C', A:  4740, rx:  99.0, ry:  17.3, d: 254, bf:  73.3, tf: 12.4, tw: 15.9 },
  { name: 'C250x45',   family: 'C', A:  5760, rx:  97.4, ry:  18.2, d: 254, bf:  77.0, tf: 13.1, tw: 19.8 },
  { name: 'C310x30.8', family: 'C', A:  3920, rx: 122.0, ry:  17.8, d: 305, bf:  74.7, tf: 12.7, tw:  7.2 },
  { name: 'C310x37',   family: 'C', A:  4740, rx: 122.0, ry:  18.5, d: 305, bf:  77.9, tf: 12.7, tw: 10.2 },
  { name: 'C310x45',   family: 'C', A:  5690, rx: 122.0, ry:  19.3, d: 305, bf:  80.5, tf: 12.7, tw: 13.0 },
  { name: 'C380x50.5', family: 'C', A:  6440, rx: 152.0, ry:  19.6, d: 381, bf:  86.4, tf: 16.5, tw: 10.2 },
  { name: 'C380x60',   family: 'C', A:  7610, rx: 152.0, ry:  20.7, d: 381, bf:  89.4, tf: 16.5, tw: 13.2 },
  { name: 'C380x74.5', family: 'C', A:  9480, rx: 150.0, ry:  22.1, d: 381, bf:  94.5, tf: 16.5, tw: 18.2 },
]

// ── L-shapes (single angles) ─────────────────────────────────────────────────
// Equal-leg and common unequal-leg angles; rz = minor principal radius; xbar = centroid from back of leg.
const L: AiscShape[] = [
  // 51 × 51
  { name: 'L51x51x4.8',  family: 'L', A:   456, rx: 15.6, ry: 15.6, rz:  9.9, xbar: 13.3, leg1: 51,  leg2: 51,  t:  4.8 },
  { name: 'L51x51x6.4',  family: 'L', A:   605, rx: 15.6, ry: 15.6, rz:  9.9, xbar: 14.7, leg1: 51,  leg2: 51,  t:  6.4 },
  { name: 'L51x51x7.9',  family: 'L', A:   748, rx: 15.5, ry: 15.5, rz:  9.9, xbar: 15.2, leg1: 51,  leg2: 51,  t:  7.9 },
  { name: 'L51x51x9.5',  family: 'L', A:   883, rx: 15.3, ry: 15.3, rz:  9.8, xbar: 15.7, leg1: 51,  leg2: 51,  t:  9.5 },
  // 64 × 64
  { name: 'L64x64x4.8',  family: 'L', A:   581, rx: 19.9, ry: 19.9, rz: 12.6, xbar: 16.3, leg1: 64,  leg2: 64,  t:  4.8 },
  { name: 'L64x64x6.4',  family: 'L', A:   768, rx: 19.9, ry: 19.9, rz: 12.6, xbar: 17.5, leg1: 64,  leg2: 64,  t:  6.4 },
  { name: 'L64x64x7.9',  family: 'L', A:   955, rx: 19.8, ry: 19.8, rz: 12.6, xbar: 18.0, leg1: 64,  leg2: 64,  t:  7.9 },
  { name: 'L64x64x9.5',  family: 'L', A:  1140, rx: 19.7, ry: 19.7, rz: 12.6, xbar: 18.5, leg1: 64,  leg2: 64,  t:  9.5 },
  // 76 × 76
  { name: 'L76x76x4.8',  family: 'L', A:   697, rx: 23.8, ry: 23.8, rz: 15.1, xbar: 19.5, leg1: 76,  leg2: 76,  t:  4.8 },
  { name: 'L76x76x6.4',  family: 'L', A:   929, rx: 23.8, ry: 23.8, rz: 15.1, xbar: 20.6, leg1: 76,  leg2: 76,  t:  6.4 },
  { name: 'L76x76x7.9',  family: 'L', A:  1150, rx: 23.7, ry: 23.7, rz: 15.1, xbar: 21.2, leg1: 76,  leg2: 76,  t:  7.9 },
  { name: 'L76x76x9.5',  family: 'L', A:  1370, rx: 23.5, ry: 23.5, rz: 14.9, xbar: 21.9, leg1: 76,  leg2: 76,  t:  9.5 },
  { name: 'L76x76x12.7', family: 'L', A:  1810, rx: 23.1, ry: 23.1, rz: 14.7, xbar: 22.7, leg1: 76,  leg2: 76,  t: 12.7 },
  // 89 × 89
  { name: 'L89x89x6.4',  family: 'L', A:  1090, rx: 28.0, ry: 28.0, rz: 17.7, xbar: 23.8, leg1: 89,  leg2: 89,  t:  6.4 },
  { name: 'L89x89x7.9',  family: 'L', A:  1360, rx: 28.0, ry: 28.0, rz: 17.7, xbar: 24.5, leg1: 89,  leg2: 89,  t:  7.9 },
  { name: 'L89x89x9.5',  family: 'L', A:  1620, rx: 27.8, ry: 27.8, rz: 17.6, xbar: 25.1, leg1: 89,  leg2: 89,  t:  9.5 },
  { name: 'L89x89x12.7', family: 'L', A:  2140, rx: 27.5, ry: 27.5, rz: 17.5, xbar: 26.1, leg1: 89,  leg2: 89,  t: 12.7 },
  // 102 × 102
  { name: 'L102x102x7.9',  family: 'L', A:  1560, rx: 31.8, ry: 31.8, rz: 20.1, xbar: 27.0, leg1: 102, leg2: 102, t:  7.9 },
  { name: 'L102x102x9.5',  family: 'L', A:  1850, rx: 31.8, ry: 31.8, rz: 20.1, xbar: 27.2, leg1: 102, leg2: 102, t:  9.5 },
  { name: 'L102x102x12.7', family: 'L', A:  2420, rx: 31.4, ry: 31.4, rz: 19.9, xbar: 28.4, leg1: 102, leg2: 102, t: 12.7 },
  { name: 'L102x102x15.9', family: 'L', A:  2990, rx: 31.0, ry: 31.0, rz: 19.7, xbar: 29.5, leg1: 102, leg2: 102, t: 15.9 },
  // 127 × 127
  { name: 'L127x127x9.5',  family: 'L', A:  2340, rx: 39.6, ry: 39.6, rz: 25.0, xbar: 33.8, leg1: 127, leg2: 127, t:  9.5 },
  { name: 'L127x127x12.7', family: 'L', A:  3060, rx: 39.4, ry: 39.4, rz: 24.9, xbar: 34.5, leg1: 127, leg2: 127, t: 12.7 },
  { name: 'L127x127x15.9', family: 'L', A:  3800, rx: 39.1, ry: 39.1, rz: 24.8, xbar: 35.6, leg1: 127, leg2: 127, t: 15.9 },
  { name: 'L127x127x19.1', family: 'L', A:  4490, rx: 38.8, ry: 38.8, rz: 24.7, xbar: 36.5, leg1: 127, leg2: 127, t: 19.1 },
  // 152 × 152
  { name: 'L152x152x9.5',  family: 'L', A:  2790, rx: 47.7, ry: 47.7, rz: 30.2, xbar: 40.7, leg1: 152, leg2: 152, t:  9.5 },
  { name: 'L152x152x12.7', family: 'L', A:  3710, rx: 47.5, ry: 47.5, rz: 30.1, xbar: 40.9, leg1: 152, leg2: 152, t: 12.7 },
  { name: 'L152x152x15.9', family: 'L', A:  4620, rx: 47.2, ry: 47.2, rz: 30.0, xbar: 41.9, leg1: 152, leg2: 152, t: 15.9 },
  { name: 'L152x152x19',   family: 'L', A:  5410, rx: 46.9, ry: 46.9, rz: 29.8, xbar: 43.4, leg1: 152, leg2: 152, t: 19.0 },
  { name: 'L152x152x22.2', family: 'L', A:  6290, rx: 46.7, ry: 46.7, rz: 29.7, xbar: 44.0, leg1: 152, leg2: 152, t: 22.2 },
  { name: 'L152x152x25.4', family: 'L', A:  7100, rx: 46.4, ry: 46.4, rz: 29.5, xbar: 44.8, leg1: 152, leg2: 152, t: 25.4 },
  // 203 × 203
  { name: 'L203x203x15.9', family: 'L', A:  6230, rx: 63.6, ry: 63.6, rz: 40.3, xbar: 57.4, leg1: 203, leg2: 203, t: 15.9 },
  { name: 'L203x203x19.1', family: 'L', A:  7420, rx: 63.5, ry: 63.5, rz: 40.3, xbar: 58.2, leg1: 203, leg2: 203, t: 19.1 },
  { name: 'L203x203x22.2', family: 'L', A:  8390, rx: 63.4, ry: 63.4, rz: 40.2, xbar: 58.9, leg1: 203, leg2: 203, t: 22.2 },
  { name: 'L203x203x25.4', family: 'L', A:  9550, rx: 63.2, ry: 63.2, rz: 40.0, xbar: 60.4, leg1: 203, leg2: 203, t: 25.4 },
  // unequal-leg: 152 × 89
  { name: 'L152x89x7.9',  family: 'L', A:  1830, rx: 48.5, ry: 22.4, rz: 15.2, xbar: 18.8, leg1: 152, leg2: 89,  t:  7.9 },
  { name: 'L152x89x9.5',  family: 'L', A:  2180, rx: 48.3, ry: 22.6, rz: 15.1, xbar: 19.5, leg1: 152, leg2: 89,  t:  9.5 },
  { name: 'L152x89x12.7', family: 'L', A:  2890, rx: 47.9, ry: 23.1, rz: 15.1, xbar: 20.7, leg1: 152, leg2: 89,  t: 12.7 },
  // unequal-leg: 152 × 102
  { name: 'L152x102x9.5',  family: 'L', A:  2290, rx: 48.1, ry: 27.9, rz: 17.7, xbar: 23.1, leg1: 152, leg2: 102, t:  9.5 },
  { name: 'L152x102x12.7', family: 'L', A:  3020, rx: 47.6, ry: 27.9, rz: 17.6, xbar: 23.9, leg1: 152, leg2: 102, t: 12.7 },
  // unequal-leg: 178 × 102
  { name: 'L178x102x9.5',  family: 'L', A:  2660, rx: 57.0, ry: 24.6, rz: 18.3, xbar: 19.2, leg1: 178, leg2: 102, t:  9.5 },
  { name: 'L178x102x12.7', family: 'L', A:  3520, rx: 56.5, ry: 25.1, rz: 18.2, xbar: 20.0, leg1: 178, leg2: 102, t: 12.7 },
  // unequal-leg: 203 × 152
  { name: 'L203x152x12.7', family: 'L', A:  4260, rx: 64.6, ry: 47.6, rz: 28.0, xbar: 42.6, leg1: 203, leg2: 152, t: 12.7 },
  { name: 'L203x152x15.9', family: 'L', A:  5310, rx: 64.3, ry: 47.3, rz: 27.9, xbar: 43.4, leg1: 203, leg2: 152, t: 15.9 },
]

// ── Computed (nominal-geometry) tube generators ─────────────────────────────
// Sharp-corner thin-wall model: A, I and r from nominal outer dims + wall t.
// Values run a few % over a real cold-formed HSS due to absent corner radii.
// Use for sizes not covered by tabulated rows.
const r1 = (v: number) => Math.round(v * 10) / 10
/** Rectangular (or square) HSS h(deep) × b(wide) × t, all mm. */
function hssRect(h: number, b: number, t: number): AiscShape {
  const hi = h - 2 * t, bi = b - 2 * t
  const A = b * h - bi * hi
  const Ix = (b * h ** 3 - bi * hi ** 3) / 12
  const Iy = (h * b ** 3 - hi * bi ** 3) / 12
  return { name: `HSS${h}x${b}x${t}`, family: 'HSS', A: Math.round(A), rx: r1(Math.sqrt(Ix / A)), ry: r1(Math.sqrt(Iy / A)), b, h, t }
}
const hssSq = (b: number, t: number) => hssRect(b, b, t)
/** Round HSS / pipe — outer diameter D, wall t, mm. */
function pipe(name: string, D: number, t: number): AiscShape {
  const Di = D - 2 * t
  const A = (Math.PI / 4) * (D * D - Di * Di)
  const r = Math.sqrt(D * D + Di * Di) / 4
  return { name, family: 'PIPE', A: Math.round(A), rx: r1(r), ry: r1(r), D, t }
}

// ── HSS rectangular / square ─────────────────────────────────────────────────
const HSS: AiscShape[] = [
  // tabulated real values
  { name: 'HSS50x50x3.2',   family: 'HSS', A:   568, rx:  17.9, ry:  17.9, b:  50, h:  50, t:  3.2 },
  { name: 'HSS50x50x4.8',   family: 'HSS', A:   792, rx:  16.8, ry:  16.8, b:  50, h:  50, t:  4.8 },
  { name: 'HSS64x64x3.2',   family: 'HSS', A:   744, rx:  23.5, ry:  23.5, b:  64, h:  64, t:  3.2 },
  { name: 'HSS64x64x4.8',   family: 'HSS', A:  1090, rx:  22.9, ry:  22.9, b:  64, h:  64, t:  4.8 },
  { name: 'HSS76x76x4.8',   family: 'HSS', A:  1310, rx:  27.8, ry:  27.8, b:  76, h:  76, t:  4.8 },
  { name: 'HSS76x76x6.4',   family: 'HSS', A:  1600, rx:  27.2, ry:  27.2, b:  76, h:  76, t:  6.4 },
  { name: 'HSS89x89x4.8',   family: 'HSS', A:  1550, rx:  33.1, ry:  33.1, b:  89, h:  89, t:  4.8 },
  { name: 'HSS89x89x6.4',   family: 'HSS', A:  2030, rx:  32.5, ry:  32.5, b:  89, h:  89, t:  6.4 },
  { name: 'HSS89x89x7.9',   family: 'HSS', A:  2470, rx:  31.9, ry:  31.9, b:  89, h:  89, t:  7.9 },
  { name: 'HSS102x102x4.8', family: 'HSS', A:  1790, rx:  38.2, ry:  38.2, b: 102, h: 102, t:  4.8 },
  { name: 'HSS102x102x6.4', family: 'HSS', A:  2230, rx:  37.6, ry:  37.6, b: 102, h: 102, t:  6.4 },
  { name: 'HSS102x102x7.9', family: 'HSS', A:  2900, rx:  37.0, ry:  37.0, b: 102, h: 102, t:  7.9 },
  { name: 'HSS102x102x9.5', family: 'HSS', A:  3160, rx:  36.3, ry:  36.3, b: 102, h: 102, t:  9.5 },
  { name: 'HSS127x127x6.4', family: 'HSS', A:  2860, rx:  47.7, ry:  47.7, b: 127, h: 127, t:  6.4 },
  { name: 'HSS127x127x7.9', family: 'HSS', A:  3560, rx:  47.2, ry:  47.2, b: 127, h: 127, t:  7.9 },
  { name: 'HSS152x152x6.4', family: 'HSS', A:  3550, rx:  57.7, ry:  57.7, b: 152, h: 152, t:  6.4 },
  { name: 'HSS152x152x7.9', family: 'HSS', A:  4380, rx:  57.2, ry:  57.2, b: 152, h: 152, t:  7.9 },
  { name: 'HSS152x152x9.5', family: 'HSS', A:  4920, rx:  56.6, ry:  56.6, b: 152, h: 152, t:  9.5 },
  { name: 'HSS152x152x12.7',family: 'HSS', A:  6350, rx:  55.5, ry:  55.5, b: 152, h: 152, t: 12.7 },
  { name: 'HSS178x178x6.4', family: 'HSS', A:  4170, rx:  68.0, ry:  68.0, b: 178, h: 178, t:  6.4 },
  { name: 'HSS178x178x7.9', family: 'HSS', A:  5170, rx:  67.5, ry:  67.5, b: 178, h: 178, t:  7.9 },
  { name: 'HSS178x178x9.5', family: 'HSS', A:  6200, rx:  66.9, ry:  66.9, b: 178, h: 178, t:  9.5 },
  { name: 'HSS178x178x12.7',family: 'HSS', A:  8090, rx:  65.8, ry:  65.8, b: 178, h: 178, t: 12.7 },
  { name: 'HSS203x203x6.4', family: 'HSS', A:  4790, rx:  78.2, ry:  78.2, b: 203, h: 203, t:  6.4 },
  { name: 'HSS203x203x7.9', family: 'HSS', A:  5940, rx:  77.7, ry:  77.7, b: 203, h: 203, t:  7.9 },
  { name: 'HSS203x203x9.5', family: 'HSS', A:  7080, rx:  77.1, ry:  77.1, b: 203, h: 203, t:  9.5 },
  { name: 'HSS203x203x12.7',family: 'HSS', A:  9290, rx:  76.0, ry:  76.0, b: 203, h: 203, t: 12.7 },
  { name: 'HSS254x254x6.4', family: 'HSS', A:  6060, rx:  98.7, ry:  98.7, b: 254, h: 254, t:  6.4 },
  { name: 'HSS254x254x7.9', family: 'HSS', A:  7540, rx:  98.2, ry:  98.2, b: 254, h: 254, t:  7.9 },
  { name: 'HSS254x254x9.5', family: 'HSS', A:  9000, rx:  97.6, ry:  97.6, b: 254, h: 254, t:  9.5 },
  { name: 'HSS254x254x12.7',family: 'HSS', A: 11900, rx:  96.5, ry:  96.5, b: 254, h: 254, t: 12.7 },
  { name: 'HSS305x305x6.4', family: 'HSS', A:  7330, rx: 119.0, ry: 119.0, b: 305, h: 305, t:  6.4 },
  { name: 'HSS305x305x9.5', family: 'HSS', A: 10900, rx: 118.0, ry: 118.0, b: 305, h: 305, t:  9.5 },
  { name: 'HSS305x305x12.7',family: 'HSS', A: 14400, rx: 116.0, ry: 116.0, b: 305, h: 305, t: 12.7 },
  { name: 'HSS356x356x9.5', family: 'HSS', A: 12800, rx: 138.0, ry: 138.0, b: 356, h: 356, t:  9.5 },
  { name: 'HSS356x356x12.7',family: 'HSS', A: 17000, rx: 137.0, ry: 137.0, b: 356, h: 356, t: 12.7 },
  // rectangular
  { name: 'HSS102x51x4.8',  family: 'HSS', A:  1080, rx:  34.8, ry:  17.7, b:  51, h: 102, t:  4.8 },
  { name: 'HSS102x51x6.4',  family: 'HSS', A:  1350, rx:  34.2, ry:  17.3, b:  51, h: 102, t:  6.4 },
  { name: 'HSS127x64x4.8',  family: 'HSS', A:  1330, rx:  43.8, ry:  22.0, b:  64, h: 127, t:  4.8 },
  { name: 'HSS127x64x6.4',  family: 'HSS', A:  1690, rx:  43.2, ry:  21.5, b:  64, h: 127, t:  6.4 },
  { name: 'HSS152x76x4.8',  family: 'HSS', A:  1580, rx:  53.4, ry:  26.2, b:  76, h: 152, t:  4.8 },
  { name: 'HSS152x76x6.4',  family: 'HSS', A:  2030, rx:  52.8, ry:  25.7, b:  76, h: 152, t:  6.4 },
  { name: 'HSS152x102x6.4', family: 'HSS', A:  2860, rx:  53.0, ry:  38.0, b: 102, h: 152, t:  6.4 },
  { name: 'HSS152x102x7.9', family: 'HSS', A:  3560, rx:  52.4, ry:  37.4, b: 102, h: 152, t:  7.9 },
  { name: 'HSS152x102x9.5', family: 'HSS', A:  4200, rx:  51.8, ry:  36.8, b: 102, h: 152, t:  9.5 },
  { name: 'HSS203x102x6.4', family: 'HSS', A:  3550, rx:  68.0, ry:  39.0, b: 102, h: 203, t:  6.4 },
  { name: 'HSS203x102x7.9', family: 'HSS', A:  4380, rx:  67.4, ry:  38.4, b: 102, h: 203, t:  7.9 },
  { name: 'HSS203x102x9.5', family: 'HSS', A:  5200, rx:  66.8, ry:  37.8, b: 102, h: 203, t:  9.5 },
  { name: 'HSS203x152x6.4', family: 'HSS', A:  4170, rx:  71.9, ry:  57.3, b: 152, h: 203, t:  6.4 },
  { name: 'HSS203x152x9.5', family: 'HSS', A:  5980, rx:  70.7, ry:  56.1, b: 152, h: 203, t:  9.5 },
  { name: 'HSS254x152x6.4', family: 'HSS', A:  4790, rx:  91.5, ry:  56.2, b: 152, h: 254, t:  6.4 },
  { name: 'HSS254x152x9.5', family: 'HSS', A:  6970, rx:  90.3, ry:  55.1, b: 152, h: 254, t:  9.5 },
  { name: 'HSS305x152x9.5', family: 'HSS', A:  7860, rx: 109.0, ry:  54.0, b: 152, h: 305, t:  9.5 },
  { name: 'HSS305x203x9.5', family: 'HSS', A:  9000, rx: 111.0, ry:  77.6, b: 203, h: 305, t:  9.5 },
  // computed nominal extensions — only shapes not already tabulated above
  hssSq(127, 9.5),        // tested with sharp-corner formula; must stay computed
  hssRect(127, 76, 6.4),  // not in tabulated set
]

// ── Round HSS / standard pipe ─────────────────────────────────────────────────
const PIPE: AiscShape[] = [
  { name: 'PIPE 3 STD',  family: 'PIPE', A:  1390, rx:  29.5, ry:  29.5, D:  88.9, t: 5.5 },
  { name: 'PIPE 4 STD',  family: 'PIPE', A:  2010, rx:  38.4, ry:  38.4, D: 114.3, t: 6.0 },
  { name: 'PIPE 5 STD',  family: 'PIPE', A:  2700, rx:  47.8, ry:  47.8, D: 141.3, t: 6.6 },
  { name: 'PIPE 6 STD',  family: 'PIPE', A:  3470, rx:  57.2, ry:  57.2, D: 168.3, t: 7.1 },
  { name: 'HSS60x3.9',   family: 'PIPE', A:   686, rx:  19.7, ry:  19.7, D:  60.3, t: 3.9 },
  { name: 'HSS89x3.9',   family: 'PIPE', A:  1040, rx:  29.8, ry:  29.8, D:  88.9, t: 3.9 },
  { name: 'HSS114x6.4',  family: 'PIPE', A:  2150, rx:  38.0, ry:  38.0, D: 114.3, t: 6.4 },
  { name: 'HSS139x6.4',  family: 'PIPE', A:  2650, rx:  46.6, ry:  46.6, D: 139.7, t: 6.4 },
  { name: 'HSS168x7.1',  family: 'PIPE', A:  3610, rx:  56.4, ry:  56.4, D: 168.3, t: 7.1 },
  { name: 'HSS219x8.2',  family: 'PIPE', A:  5470, rx:  73.9, ry:  73.9, D: 219.1, t: 8.2 },
  { name: 'HSS273x9.3',  family: 'PIPE', A:  7760, rx:  92.7, ry:  92.7, D: 273.1, t: 9.3 },
  { name: 'HSS324x9.5',  family: 'PIPE', A:  9450, rx: 110.0, ry: 110.0, D: 323.9, t: 9.5 },
  { name: 'HSS356x9.5',  family: 'PIPE', A: 10400, rx: 121.0, ry: 121.0, D: 355.6, t: 9.5 },
  // computed nominal extensions
  pipe('PIPE 8 STD', 219.1, 8.2), pipe('PIPE 10 STD', 273.0, 9.3),
  pipe('HSS168x6.4', 168, 6.4), pipe('HSS219x6.4', 219, 6.4),
]

// ── WT-shapes (structural tees) ────────────────────────────────────────────────
const WT: AiscShape[] = [
  // WT75 — cut from W150
  { name: 'WT75x9',    family: 'WT', A:  1145, rx:  21.1, ry:  24.9, d:  77, bf: 102, tf:  7.1, tw:  5.8 },
  { name: 'WT75x11.2', family: 'WT', A:  1425, rx:  19.1, ry:  38.1, d:  76, bf: 152, tf:  6.6, tw:  5.8 },
  { name: 'WT75x14.9', family: 'WT', A:  1900, rx:  20.5, ry:  37.8, d:  79, bf: 153, tf:  9.3, tw:  6.6 },
  // WT100 — cut from W200
  { name: 'WT100x10.5',family: 'WT', A:  1340, rx:  27.5, ry:  23.0, d: 103, bf: 102, tf:  7.1, tw:  5.8 },
  { name: 'WT100x14.9',family: 'WT', A:  1890, rx:  27.9, ry:  30.8, d: 105, bf: 134, tf: 10.2, tw:  6.4 },
  { name: 'WT100x17.9',family: 'WT', A:  2270, rx:  28.1, ry:  39.1, d: 103, bf: 166, tf: 11.8, tw:  7.2 },
  { name: 'WT100x23.1',family: 'WT', A:  2940, rx:  30.0, ry:  51.8, d: 102, bf: 203, tf: 11.0, tw:  7.2 },
  // WT125 — cut from W250
  { name: 'WT125x16.4',family: 'WT', A:  2090, rx:  33.0, ry:  33.8, d: 130, bf: 146, tf:  9.1, tw:  6.1 },
  { name: 'WT125x19.3',family: 'WT', A:  2460, rx:  33.5, ry:  34.5, d: 131, bf: 147, tf: 11.2, tw:  6.6 },
  { name: 'WT125x24.5',family: 'WT', A:  3130, rx:  34.0, ry:  50.5, d: 127, bf: 203, tf: 13.5, tw:  8.6 },
  { name: 'WT125x33.5',family: 'WT', A:  4290, rx:  36.5, ry:  51.1, d: 129, bf: 204, tf: 15.7, tw:  8.9 },
  // WT155 — cut from W310
  { name: 'WT155x19.4',family: 'WT', A:  2470, rx:  38.5, ry:  38.4, d: 155, bf: 165, tf:  9.7, tw:  5.8 },
  { name: 'WT155x22.3',family: 'WT', A:  2840, rx:  39.0, ry:  38.5, d: 157, bf: 166, tf: 11.2, tw:  6.6 },
  { name: 'WT155x26',  family: 'WT', A:  3310, rx:  43.0, ry:  38.0, d: 157, bf: 153, tf: 10.9, tw:  7.1 },
  { name: 'WT155x39.5',family: 'WT', A:  5000, rx:  41.5, ry:  63.9, d: 153, bf: 254, tf: 14.6, tw:  8.8 },
  // WT180 — cut from W360
  { name: 'WT180x25.6',family: 'WT', A:  3225, rx:  46.3, ry:  39.6, d: 178, bf: 171, tf: 11.6, tw:  7.2 },
  { name: 'WT180x28.9',family: 'WT', A:  3680, rx:  47.0, ry:  39.8, d: 179, bf: 172, tf: 13.1, tw:  7.9 },
  { name: 'WT180x29.5',family: 'WT', A:  3760, rx:  50.0, ry:  38.4, d: 181, bf: 153, tf: 11.6, tw:  7.5 },
  { name: 'WT180x40.5',family: 'WT', A:  5050, rx:  48.0, ry:  46.8, d: 177, bf: 205, tf: 16.8, tw:  9.4 },
  // WT205 — cut from W410
  { name: 'WT205x19.4',family: 'WT', A:  2475, rx:  53.0, ry:  29.0, d: 200, bf: 140, tf:  8.8, tw:  6.4 },
  { name: 'WT205x26.5',family: 'WT', A:  3380, rx:  54.3, ry:  39.2, d: 202, bf: 177, tf: 10.9, tw:  7.5 },
  { name: 'WT205x50',  family: 'WT', A:  6350, rx:  57.7, ry:  60.5, d: 208, bf: 260, tf: 17.6, tw: 10.0 },
  // WT230 — cut from W460
  { name: 'WT230x26',  family: 'WT', A:  3325, rx:  60.9, ry:  31.7, d: 225, bf: 152, tf: 10.8, tw:  7.6 },
  { name: 'WT230x37',  family: 'WT', A:  4710, rx:  62.1, ry:  42.4, d: 229, bf: 190, tf: 14.5, tw:  9.0 },
  // WT265 — cut from W530
  { name: 'WT265x33',  family: 'WT', A:  4190, rx:  72.5, ry:  35.8, d: 265, bf: 166, tf: 11.4, tw:  8.9 },
  { name: 'WT265x75',  family: 'WT', A:  9550, rx:  77.0, ry:  74.0, d: 272, bf: 312, tf: 20.3, tw: 12.7 },
]

export const AISC_SHAPES: AiscShape[] = [...W, ...C, ...L, ...HSS, ...PIPE, ...WT]
export const FAMILIES: { id: SectionFamily; label: string }[] = [
  { id: 'W',    label: 'W — Wide flange' },
  { id: 'C',    label: 'C — Channel' },
  { id: 'L',    label: 'L — Angle' },
  { id: 'HSS',  label: 'HSS — Rect/Square tube' },
  { id: 'PIPE', label: 'Pipe / Round HSS' },
  { id: 'WT',   label: 'WT — Tee' },
]

export const shapesOf   = (family: SectionFamily) => AISC_SHAPES.filter((s) => s.family === family)
export const shapeByName = (name: string) => AISC_SHAPES.find((s) => s.name === name)

/** Effective section used by a member: single shape or back-to-back DOUBLE ANGLE (2L) with a gusset gap. */
export interface EffectiveSection {
  label: string
  family: SectionFamily
  A: number
  rmin: number
  rx: number; ry: number
  double: boolean
  base: AiscShape
  gap?: number
}

/** Back-to-back double angle: A doubles; rx unchanged; ry grows by parallel-axis shift across the gap. */
export function doubleAngle(angle: AiscShape, gap = 0): EffectiveSection {
  const xbar = angle.xbar ?? 0
  const ry2 = Math.sqrt(angle.ry * angle.ry + (xbar + gap / 2) ** 2)
  const rx2 = angle.rx
  return {
    label: `2L ${angle.name.replace(/^L/, '')} (gap ${gap})`,
    family: 'L', A: 2 * angle.A, rx: rx2, ry: ry2, rmin: Math.min(rx2, ry2),
    double: true, base: angle, gap,
  }
}

/** Resolve a chosen shape (optionally doubled) into the effective section. */
export function effectiveSection(shape: AiscShape, double = false, gap = 0): EffectiveSection {
  if (double && shape.family === 'L') return doubleAngle(shape, gap)
  const rmin = shape.family === 'L' ? Math.min(shape.rz ?? shape.rx, shape.rx) : Math.min(shape.rx, shape.ry)
  return { label: shape.name, family: shape.family, A: shape.A, rx: shape.rx, ry: shape.ry, rmin, double: false, base: shape }
}

// ── W-shape optimizer helpers ─────────────────────────────────────────────
// Sorted by gross area (≈ weight per metre) for grow / shrink stepping.

export const W_SORTED: AiscShape[] = shapesOf('W').slice().sort((a, b) => a.A - b.A)

/** Next heavier W-shape in the catalog; undefined if already the heaviest. */
export function nextHeavierW(name: string): AiscShape | undefined {
  const i = W_SORTED.findIndex((s) => s.name === name)
  return i >= 0 && i < W_SORTED.length - 1 ? W_SORTED[i + 1] : undefined
}

/** Next lighter W-shape in the catalog; undefined if already the lightest. */
export function nextLighterW(name: string): AiscShape | undefined {
  const i = W_SORTED.findIndex((s) => s.name === name)
  return i > 0 ? W_SORTED[i - 1] : undefined
}
