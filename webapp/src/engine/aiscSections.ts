// ─────────────────────────────────────────────────────────────────────────
// AISC metric shape library — every row transcribed from the AISC Shapes
// Database v15.0 (metric columns), the data behind the 15th/16th-edition
// Manual tables. Units: area mm², dimensions mm, radii of gyration mm.
// Families: W, C, L, HSS (rect/square), PIPE (round HSS and standard pipe), WT.
//
// HSS and pipe `t` is the DESIGN wall thickness (AISC 360-16 §B4.2: 0.93·tnom
// for ERW), which is what the tabulated A and r are computed on; the name keeps
// the nominal wall. `aiscSections.test.ts` pins the W geometry to the tabulated
// area so a transcription slip surfaces instead of reaching `deriveWSection`.
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
  { name: 'W100x19', family: 'W', A: 2470, rx: 43.7, ry: 25.4, d: 106, bf: 103, tf: 8.76, tw: 7.11 },

  // W150
  { name: 'W150x13', family: 'W', A: 1630, rx: 61.7, ry: 22.6, d: 148, bf: 100, tf: 4.95, tw: 4.32 },
  { name: 'W150x18', family: 'W', A: 2290, rx: 63.2, ry: 23.3, d: 153, bf: 102, tf: 7.11, tw: 5.84 },
  { name: 'W150x22.5', family: 'W', A: 2860, rx: 65, ry: 36.8, d: 152, bf: 152, tf: 6.6, tw: 5.84 },
  { name: 'W150x24', family: 'W', A: 3060, rx: 66, ry: 24.6, d: 160, bf: 102, tf: 10.3, tw: 6.6 },
  { name: 'W150x29.8', family: 'W', A: 3790, rx: 67.6, ry: 38.1, d: 157, bf: 153, tf: 9.27, tw: 6.6 },
  { name: 'W150x37', family: 'W', A: 4740, rx: 68.6, ry: 38.6, d: 162, bf: 154, tf: 11.6, tw: 8.13 },

  // W200
  { name: 'W200x15', family: 'W', A: 1910, rx: 81.8, ry: 21.4, d: 200, bf: 100, tf: 5.21, tw: 4.32 },
  { name: 'W200x19.3', family: 'W', A: 2480, rx: 81.5, ry: 21.4, d: 203, bf: 102, tf: 6.48, tw: 5.84 },
  { name: 'W200x22.5', family: 'W', A: 2860, rx: 83.6, ry: 22.3, d: 206, bf: 102, tf: 8, tw: 6.22 },
  { name: 'W200x26.6', family: 'W', A: 3390, rx: 87.1, ry: 31.2, d: 207, bf: 133, tf: 8.38, tw: 5.84 },
  { name: 'W200x31.3', family: 'W', A: 3970, rx: 88.6, ry: 32, d: 210, bf: 134, tf: 10.2, tw: 6.35 },
  { name: 'W200x35.9', family: 'W', A: 4570, rx: 86.9, ry: 40.9, d: 201, bf: 165, tf: 10.2, tw: 6.22 },
  { name: 'W200x41.7', family: 'W', A: 5320, rx: 87.6, ry: 41.1, d: 205, bf: 166, tf: 11.8, tw: 7.24 },
  { name: 'W200x46.1', family: 'W', A: 5890, rx: 88.1, ry: 51.3, d: 203, bf: 203, tf: 11, tw: 7.24 },
  { name: 'W200x52', family: 'W', A: 6650, rx: 89.2, ry: 51.6, d: 206, bf: 204, tf: 12.6, tw: 7.87 },
  { name: 'W200x59', family: 'W', A: 7550, rx: 89.7, ry: 51.8, d: 210, bf: 205, tf: 14.2, tw: 9.14 },
  { name: 'W200x71', family: 'W', A: 9100, rx: 91.7, ry: 52.8, d: 216, bf: 206, tf: 17.4, tw: 10.2 },
  { name: 'W200x86', family: 'W', A: 11000, rx: 92.7, ry: 53.3, d: 222, bf: 209, tf: 20.6, tw: 13 },
  { name: 'W200x100', family: 'W', A: 12700, rx: 94.5, ry: 53.8, d: 229, bf: 210, tf: 23.7, tw: 14.5 },

  // W250
  { name: 'W250x17.9', family: 'W', A: 2280, rx: 99.1, ry: 19.9, d: 251, bf: 101, tf: 5.33, tw: 4.83 },
  { name: 'W250x22.3', family: 'W', A: 2850, rx: 100, ry: 20.6, d: 254, bf: 102, tf: 6.86, tw: 5.84 },
  { name: 'W250x25.3', family: 'W', A: 3220, rx: 103, ry: 21.5, d: 257, bf: 102, tf: 8.38, tw: 6.1 },
  { name: 'W250x28.4', family: 'W', A: 3630, rx: 105, ry: 22.2, d: 259, bf: 102, tf: 10, tw: 6.35 },
  { name: 'W250x32.7', family: 'W', A: 4190, rx: 108, ry: 33.8, d: 259, bf: 146, tf: 9.14, tw: 6.1 },
  { name: 'W250x38.5', family: 'W', A: 4910, rx: 110, ry: 34.5, d: 262, bf: 147, tf: 11.2, tw: 6.6 },
  { name: 'W250x44.8', family: 'W', A: 5700, rx: 111, ry: 34.8, d: 267, bf: 148, tf: 13, tw: 7.62 },
  { name: 'W250x49.1', family: 'W', A: 6260, rx: 106, ry: 49.3, d: 247, bf: 202, tf: 11, tw: 7.37 },
  { name: 'W250x58', family: 'W', A: 7420, rx: 108, ry: 50.3, d: 252, bf: 203, tf: 13.5, tw: 8 },
  { name: 'W250x67', family: 'W', A: 8580, rx: 110, ry: 51.1, d: 257, bf: 204, tf: 15.7, tw: 8.89 },
  { name: 'W250x73', family: 'W', A: 9290, rx: 110, ry: 64.5, d: 254, bf: 254, tf: 14.2, tw: 8.64 },
  { name: 'W250x80', family: 'W', A: 10200, rx: 111, ry: 65, d: 257, bf: 254, tf: 15.6, tw: 9.4 },
  { name: 'W250x89', family: 'W', A: 11400, rx: 112, ry: 65.3, d: 259, bf: 257, tf: 17.3, tw: 10.7 },
  { name: 'W250x101', family: 'W', A: 12800, rx: 113, ry: 65.8, d: 264, bf: 257, tf: 19.6, tw: 11.9 },
  { name: 'W250x115', family: 'W', A: 14600, rx: 114, ry: 66, d: 269, bf: 259, tf: 22.1, tw: 13.5 },
  { name: 'W250x131', family: 'W', A: 16800, rx: 115, ry: 66.8, d: 274, bf: 262, tf: 25.1, tw: 15.4 },
  { name: 'W250x149', family: 'W', A: 18900, rx: 117, ry: 67.3, d: 282, bf: 262, tf: 28.4, tw: 17.3 },
  { name: 'W250x167', family: 'W', A: 21200, rx: 118, ry: 68.1, d: 290, bf: 264, tf: 31.8, tw: 19.2 },

  // W310
  { name: 'W310x21', family: 'W', A: 2680, rx: 117, ry: 19.1, d: 302, bf: 101, tf: 5.72, tw: 5.08 },
  { name: 'W310x23.8', family: 'W', A: 3040, rx: 119, ry: 19.6, d: 305, bf: 101, tf: 6.73, tw: 5.59 },
  { name: 'W310x28.3', family: 'W', A: 3590, rx: 122, ry: 20.9, d: 310, bf: 102, tf: 8.89, tw: 5.97 },
  { name: 'W310x32.7', family: 'W', A: 4180, rx: 125, ry: 21.5, d: 312, bf: 102, tf: 10.8, tw: 6.6 },
  { name: 'W310x38.7', family: 'W', A: 4940, rx: 131, ry: 38.4, d: 310, bf: 165, tf: 9.65, tw: 5.84 },
  { name: 'W310x44.5', family: 'W', A: 5670, rx: 132, ry: 38.6, d: 312, bf: 166, tf: 11.2, tw: 6.6 },
  { name: 'W310x52', family: 'W', A: 6650, rx: 133, ry: 39.1, d: 318, bf: 167, tf: 13.2, tw: 7.62 },
  { name: 'W310x60', family: 'W', A: 7550, rx: 130, ry: 49.3, d: 302, bf: 203, tf: 13.1, tw: 7.49 },
  { name: 'W310x67', family: 'W', A: 8450, rx: 131, ry: 49.5, d: 307, bf: 204, tf: 14.6, tw: 8.51 },
  { name: 'W310x74', family: 'W', A: 9420, rx: 132, ry: 49.8, d: 310, bf: 205, tf: 16.3, tw: 9.4 },
  { name: 'W310x79', family: 'W', A: 10100, rx: 133, ry: 63, d: 307, bf: 254, tf: 14.6, tw: 8.76 },
  { name: 'W310x86', family: 'W', A: 11000, rx: 134, ry: 63.8, d: 310, bf: 254, tf: 16.3, tw: 9.14 },
  { name: 'W310x97', family: 'W', A: 12300, rx: 134, ry: 76.7, d: 307, bf: 305, tf: 15.4, tw: 9.91 },
  { name: 'W310x107', family: 'W', A: 13600, rx: 135, ry: 77.2, d: 312, bf: 305, tf: 17, tw: 10.9 },
  { name: 'W310x117', family: 'W', A: 15000, rx: 136, ry: 77.5, d: 315, bf: 307, tf: 18.7, tw: 11.9 },
  { name: 'W310x129', family: 'W', A: 16500, rx: 137, ry: 78, d: 318, bf: 307, tf: 20.6, tw: 13.1 },
  { name: 'W310x143', family: 'W', A: 18200, rx: 138, ry: 78.5, d: 323, bf: 310, tf: 22.9, tw: 14 },
  { name: 'W310x158', family: 'W', A: 20100, rx: 139, ry: 79, d: 328, bf: 310, tf: 25.1, tw: 15.5 },
  { name: 'W310x179', family: 'W', A: 22700, rx: 140, ry: 79.5, d: 333, bf: 312, tf: 28.2, tw: 18 },
  { name: 'W310x202', family: 'W', A: 25700, rx: 142, ry: 80.3, d: 340, bf: 315, tf: 31.8, tw: 20.1 },
  { name: 'W310x226', family: 'W', A: 28800, rx: 144, ry: 81, d: 348, bf: 318, tf: 35.6, tw: 22.1 },
  { name: 'W310x253', family: 'W', A: 32300, rx: 146, ry: 81.8, d: 356, bf: 320, tf: 39.6, tw: 24.4 },
  { name: 'W310x283', family: 'W', A: 36100, rx: 148, ry: 82.6, d: 366, bf: 323, tf: 44.2, tw: 26.9 },
  { name: 'W310x313', family: 'W', A: 39900, rx: 150, ry: 83.3, d: 373, bf: 325, tf: 48.3, tw: 30 },
  { name: 'W310x342', family: 'W', A: 43700, rx: 152, ry: 84.1, d: 384, bf: 328, tf: 52.6, tw: 32.8 },
  { name: 'W310x375', family: 'W', A: 47800, rx: 154, ry: 84.8, d: 391, bf: 330, tf: 57.2, tw: 35.6 },
  { name: 'W310x415', family: 'W', A: 52800, rx: 156, ry: 85.9, d: 404, bf: 333, tf: 62.7, tw: 38.9 },

  // W360
  { name: 'W360x32.9', family: 'W', A: 4190, rx: 141, ry: 26.4, d: 348, bf: 127, tf: 8.51, tw: 5.84 },
  { name: 'W360x39', family: 'W', A: 4960, rx: 144, ry: 27.4, d: 353, bf: 128, tf: 10.7, tw: 6.48 },
  { name: 'W360x44', family: 'W', A: 5710, rx: 146, ry: 37.8, d: 351, bf: 171, tf: 9.78, tw: 6.86 },
  { name: 'W360x51', family: 'W', A: 6450, rx: 148, ry: 38.9, d: 356, bf: 171, tf: 11.6, tw: 7.24 },
  { name: 'W360x57.8', family: 'W', A: 7230, rx: 149, ry: 39.4, d: 358, bf: 172, tf: 13.1, tw: 7.87 },
  { name: 'W360x64', family: 'W', A: 8130, rx: 148, ry: 48, d: 348, bf: 203, tf: 13.5, tw: 7.75 },
  { name: 'W360x72', family: 'W', A: 9100, rx: 149, ry: 48.5, d: 351, bf: 204, tf: 15.1, tw: 8.64 },
  { name: 'W360x79', family: 'W', A: 10100, rx: 150, ry: 48.8, d: 353, bf: 205, tf: 16.8, tw: 9.4 },
  { name: 'W360x91', family: 'W', A: 11500, rx: 152, ry: 62.2, d: 353, bf: 254, tf: 16.4, tw: 9.53 },
  { name: 'W360x101', family: 'W', A: 12900, rx: 153, ry: 62.5, d: 356, bf: 254, tf: 18.3, tw: 10.5 },
  { name: 'W360x110', family: 'W', A: 14100, rx: 153, ry: 63, d: 361, bf: 257, tf: 19.9, tw: 11.4 },
  { name: 'W360x122', family: 'W', A: 15500, rx: 154, ry: 63, d: 363, bf: 257, tf: 21.7, tw: 13 },
  { name: 'W360x134', family: 'W', A: 17100, rx: 156, ry: 94, d: 356, bf: 368, tf: 18, tw: 11.2 },
  { name: 'W360x147', family: 'W', A: 18800, rx: 157, ry: 94.2, d: 361, bf: 371, tf: 19.8, tw: 12.3 },
  { name: 'W360x162', family: 'W', A: 20600, rx: 158, ry: 94.7, d: 363, bf: 371, tf: 21.8, tw: 13.3 },
  { name: 'W360x179', family: 'W', A: 22800, rx: 158, ry: 95, d: 368, bf: 373, tf: 23.9, tw: 15 },
  { name: 'W360x196', family: 'W', A: 25000, rx: 160, ry: 95.5, d: 373, bf: 373, tf: 26.2, tw: 16.4 },
  { name: 'W360x216', family: 'W', A: 27500, rx: 161, ry: 101, d: 376, bf: 394, tf: 27.7, tw: 17.3 },
  { name: 'W360x237', family: 'W', A: 30100, rx: 162, ry: 102, d: 381, bf: 396, tf: 30.2, tw: 18.9 },
  { name: 'W360x262', family: 'W', A: 33400, rx: 163, ry: 102, d: 386, bf: 399, tf: 33.3, tw: 21.1 },
  { name: 'W360x287', family: 'W', A: 36600, rx: 165, ry: 103, d: 394, bf: 399, tf: 36.6, tw: 22.6 },
  { name: 'W360x314', family: 'W', A: 40000, rx: 166, ry: 103, d: 399, bf: 401, tf: 39.6, tw: 24.9 },
  { name: 'W360x347', family: 'W', A: 44200, rx: 168, ry: 104, d: 406, bf: 404, tf: 43.7, tw: 27.2 },
  { name: 'W360x382', family: 'W', A: 48800, rx: 170, ry: 105, d: 417, bf: 406, tf: 48, tw: 30 },
  { name: 'W360x421', family: 'W', A: 53700, rx: 172, ry: 106, d: 424, bf: 409, tf: 52.6, tw: 32.8 },
  { name: 'W360x463', family: 'W', A: 59000, rx: 175, ry: 107, d: 434, bf: 411, tf: 57.4, tw: 35.8 },
  { name: 'W360x509', family: 'W', A: 65200, rx: 177, ry: 108, d: 445, bf: 417, tf: 62.7, tw: 39.1 },
  { name: 'W360x551', family: 'W', A: 70300, rx: 180, ry: 108, d: 455, bf: 419, tf: 67.6, tw: 42.2 },
  { name: 'W360x592', family: 'W', A: 75500, rx: 182, ry: 109, d: 465, bf: 422, tf: 72.4, tw: 45 },
  { name: 'W360x634', family: 'W', A: 80600, rx: 184, ry: 110, d: 475, bf: 424, tf: 77.2, tw: 47.8 },
  { name: 'W360x677', family: 'W', A: 86500, rx: 186, ry: 111, d: 483, bf: 427, tf: 81.5, tw: 51.3 },
  { name: 'W360x744', family: 'W', A: 94800, rx: 190, ry: 113, d: 498, bf: 432, tf: 88.9, tw: 55.6 },
  { name: 'W360x818', family: 'W', A: 105000, rx: 194, ry: 114, d: 513, bf: 437, tf: 97, tw: 60.5 },
  { name: 'W360x900', family: 'W', A: 115000, rx: 198, ry: 116, d: 531, bf: 442, tf: 106, tw: 66 },
  { name: 'W360x990', family: 'W', A: 126000, rx: 203, ry: 117, d: 549, bf: 450, tf: 115, tw: 71.9 },

  // W410
  { name: 'W410x38.8', family: 'W', A: 4950, rx: 159, ry: 28.4, d: 399, bf: 140, tf: 8.76, tw: 6.35 },
  { name: 'W410x46.1', family: 'W', A: 5890, rx: 163, ry: 29.7, d: 404, bf: 140, tf: 11.2, tw: 6.99 },
  { name: 'W410x53', family: 'W', A: 6840, rx: 165, ry: 38.6, d: 404, bf: 178, tf: 10.9, tw: 7.49 },
  { name: 'W410x60', family: 'W', A: 7610, rx: 168, ry: 39.9, d: 406, bf: 178, tf: 12.8, tw: 7.75 },
  { name: 'W410x67', family: 'W', A: 8580, rx: 169, ry: 39.9, d: 409, bf: 179, tf: 14.4, tw: 8.76 },
  { name: 'W410x75', family: 'W', A: 9480, rx: 170, ry: 40.4, d: 414, bf: 180, tf: 16, tw: 9.65 },
  { name: 'W410x85', family: 'W', A: 10800, rx: 171, ry: 40.6, d: 417, bf: 181, tf: 18.2, tw: 10.9 },
  { name: 'W410x100', family: 'W', A: 12600, rx: 177, ry: 62.5, d: 414, bf: 259, tf: 16.9, tw: 10 },
  { name: 'W410x114', family: 'W', A: 14600, rx: 178, ry: 62.7, d: 419, bf: 262, tf: 19.3, tw: 11.6 },
  { name: 'W410x132', family: 'W', A: 16900, rx: 179, ry: 63.2, d: 427, bf: 264, tf: 22.2, tw: 13.3 },
  { name: 'W410x149', family: 'W', A: 19000, rx: 180, ry: 63.8, d: 432, bf: 264, tf: 25, tw: 14.9 },

  // W460
  { name: 'W460x52', family: 'W', A: 6650, rx: 179, ry: 31, d: 450, bf: 152, tf: 10.8, tw: 7.62 },
  { name: 'W460x60', family: 'W', A: 7610, rx: 183, ry: 32.3, d: 455, bf: 153, tf: 13.3, tw: 8 },
  { name: 'W460x68', family: 'W', A: 8710, rx: 184, ry: 32.8, d: 460, bf: 154, tf: 15.4, tw: 9.14 },
  { name: 'W460x74', family: 'W', A: 9480, rx: 187, ry: 41.9, d: 457, bf: 191, tf: 14.5, tw: 9.02 },
  { name: 'W460x82', family: 'W', A: 10500, rx: 188, ry: 42.4, d: 460, bf: 191, tf: 16, tw: 9.91 },
  { name: 'W460x89', family: 'W', A: 11400, rx: 190, ry: 42.7, d: 462, bf: 192, tf: 17.7, tw: 10.5 },
  { name: 'W460x97', family: 'W', A: 12300, rx: 190, ry: 42.9, d: 467, bf: 193, tf: 19.1, tw: 11.4 },
  { name: 'W460x106', family: 'W', A: 13500, rx: 191, ry: 43.2, d: 470, bf: 194, tf: 20.6, tw: 12.6 },
  { name: 'W460x113', family: 'W', A: 14400, rx: 196, ry: 66.3, d: 462, bf: 279, tf: 17.3, tw: 10.8 },
  { name: 'W460x128', family: 'W', A: 16300, rx: 197, ry: 66.8, d: 467, bf: 282, tf: 19.6, tw: 12.2 },
  { name: 'W460x144', family: 'W', A: 18400, rx: 199, ry: 67.3, d: 472, bf: 282, tf: 22.1, tw: 13.6 },
  { name: 'W460x158', family: 'W', A: 20100, rx: 199, ry: 67.6, d: 475, bf: 284, tf: 23.9, tw: 15 },
  { name: 'W460x177', family: 'W', A: 22600, rx: 201, ry: 68.3, d: 483, bf: 287, tf: 26.9, tw: 16.6 },
  { name: 'W460x193', family: 'W', A: 24700, rx: 204, ry: 68.6, d: 490, bf: 284, tf: 30.5, tw: 17 },
  { name: 'W460x213', family: 'W', A: 27100, rx: 205, ry: 69.1, d: 495, bf: 284, tf: 33.5, tw: 18.5 },

  // W530
  { name: 'W530x66', family: 'W', A: 8390, rx: 205, ry: 32, d: 526, bf: 165, tf: 11.4, tw: 8.89 },
  { name: 'W530x72', family: 'W', A: 9100, rx: 209, ry: 42.2, d: 523, bf: 207, tf: 10.9, tw: 8.89 },
  { name: 'W530x82', family: 'W', A: 10500, rx: 213, ry: 43.9, d: 528, bf: 209, tf: 13.3, tw: 9.53 },
  { name: 'W530x85', family: 'W', A: 10800, rx: 212, ry: 34.3, d: 536, bf: 167, tf: 16.5, tw: 10.3 },
  { name: 'W530x92', family: 'W', A: 11800, rx: 217, ry: 45, d: 533, bf: 209, tf: 15.6, tw: 10.2 },
  { name: 'W530x101', family: 'W', A: 12900, rx: 218, ry: 45.7, d: 536, bf: 210, tf: 17.4, tw: 10.9 },
  { name: 'W530x109', family: 'W', A: 13900, rx: 219, ry: 46, d: 538, bf: 211, tf: 18.8, tw: 11.6 },
  { name: 'W530x123', family: 'W', A: 15700, rx: 220, ry: 46.5, d: 544, bf: 212, tf: 21.2, tw: 13.1 },
  { name: 'W530x138', family: 'W', A: 17600, rx: 221, ry: 46.7, d: 549, bf: 214, tf: 23.6, tw: 14.7 },
  { name: 'W530x150', family: 'W', A: 19200, rx: 229, ry: 73.4, d: 544, bf: 312, tf: 20.3, tw: 12.7 },
  { name: 'W530x165', family: 'W', A: 21000, rx: 230, ry: 73.7, d: 546, bf: 312, tf: 22.2, tw: 14 },
  { name: 'W530x182', family: 'W', A: 23200, rx: 231, ry: 74.2, d: 551, bf: 315, tf: 24.4, tw: 15.2 },
  { name: 'W530x196', family: 'W', A: 25000, rx: 232, ry: 74.4, d: 554, bf: 315, tf: 26.4, tw: 16.5 },
  { name: 'W530x219', family: 'W', A: 27900, rx: 233, ry: 74.9, d: 561, bf: 318, tf: 29.2, tw: 18.3 },

  // W610
  { name: 'W610x82', family: 'W', A: 10500, rx: 231, ry: 34, d: 599, bf: 178, tf: 12.8, tw: 10 },
  { name: 'W610x92', family: 'W', A: 11700, rx: 234, ry: 35.1, d: 602, bf: 179, tf: 15, tw: 10.9 },
  { name: 'W610x101', family: 'W', A: 13000, rx: 243, ry: 47.5, d: 602, bf: 228, tf: 14.9, tw: 10.5 },
  { name: 'W610x113', family: 'W', A: 14500, rx: 246, ry: 48.8, d: 607, bf: 228, tf: 17.3, tw: 11.2 },
  { name: 'W610x125', family: 'W', A: 15900, rx: 249, ry: 49.5, d: 612, bf: 229, tf: 19.6, tw: 11.9 },
  { name: 'W610x140', family: 'W', A: 17900, rx: 251, ry: 50.3, d: 617, bf: 230, tf: 22.2, tw: 13.1 },
  { name: 'W610x153', family: 'W', A: 19500, rx: 254, ry: 50.5, d: 622, bf: 229, tf: 24.9, tw: 14 },
  { name: 'W610x174', family: 'W', A: 22200, rx: 257, ry: 74.7, d: 617, bf: 325, tf: 21.6, tw: 14 },
  { name: 'W610x195', family: 'W', A: 24900, rx: 259, ry: 75.4, d: 622, bf: 328, tf: 24.4, tw: 15.4 },
  { name: 'W610x217', family: 'W', A: 27700, rx: 262, ry: 76.5, d: 627, bf: 328, tf: 27.7, tw: 16.5 },
  { name: 'W610x241', family: 'W', A: 30800, rx: 264, ry: 77.5, d: 635, bf: 330, tf: 31, tw: 17.9 },
  { name: 'W610x285', family: 'W', A: 36500, rx: 267, ry: 78, d: 648, bf: 330, tf: 37.1, tw: 20.6 },
  { name: 'W610x307', family: 'W', A: 39200, rx: 269, ry: 78.2, d: 653, bf: 330, tf: 39.9, tw: 22.1 },
  { name: 'W610x341', family: 'W', A: 43400, rx: 272, ry: 79, d: 660, bf: 333, tf: 43.9, tw: 24.4 },
  { name: 'W610x372', family: 'W', A: 47400, rx: 272, ry: 79.8, d: 668, bf: 335, tf: 48, tw: 26.4 },
  { name: 'W610x415', family: 'W', A: 52800, rx: 274, ry: 80.5, d: 678, bf: 338, tf: 53.1, tw: 29.5 },
  { name: 'W610x455', family: 'W', A: 57900, rx: 277, ry: 81.3, d: 688, bf: 340, tf: 57.9, tw: 32 },
  { name: 'W610x498', family: 'W', A: 63400, rx: 279, ry: 82, d: 699, bf: 343, tf: 63, tw: 35.1 },
  { name: 'W610x551', family: 'W', A: 70300, rx: 282, ry: 83.1, d: 711, bf: 348, tf: 69.1, tw: 38.6 },

  // W690
  { name: 'W690x125', family: 'W', A: 15900, rx: 272, ry: 52.6, d: 678, bf: 254, tf: 16.3, tw: 11.7 },
  { name: 'W690x140', family: 'W', A: 17800, rx: 277, ry: 53.8, d: 683, bf: 254, tf: 18.9, tw: 12.4 },
  { name: 'W690x152', family: 'W', A: 19400, rx: 279, ry: 54.6, d: 688, bf: 254, tf: 21.1, tw: 13.1 },
  { name: 'W690x170', family: 'W', A: 21700, rx: 279, ry: 55.4, d: 693, bf: 257, tf: 23.6, tw: 14.5 },
  { name: 'W690x192', family: 'W', A: 24400, rx: 284, ry: 56.1, d: 701, bf: 254, tf: 27.9, tw: 15.5 },
  { name: 'W690x217', family: 'W', A: 27900, rx: 292, ry: 81.3, d: 696, bf: 356, tf: 24.8, tw: 15.4 },
  { name: 'W690x240', family: 'W', A: 30700, rx: 292, ry: 82, d: 701, bf: 356, tf: 27.4, tw: 16.8 },
  { name: 'W690x265', family: 'W', A: 33900, rx: 295, ry: 82.6, d: 706, bf: 358, tf: 30.2, tw: 18.4 },
  { name: 'W690x289', family: 'W', A: 36800, rx: 297, ry: 83.6, d: 714, bf: 356, tf: 34, tw: 19.1 },

  // W760
  { name: 'W760x134', family: 'W', A: 17000, rx: 297, ry: 53.1, d: 749, bf: 264, tf: 15.5, tw: 11.9 },
  { name: 'W760x147', family: 'W', A: 18700, rx: 297, ry: 53.3, d: 754, bf: 267, tf: 17, tw: 13.2 },
  { name: 'W760x161', family: 'W', A: 20500, rx: 302, ry: 54.6, d: 757, bf: 267, tf: 19.3, tw: 13.8 },
  { name: 'W760x173', family: 'W', A: 22100, rx: 305, ry: 55.6, d: 762, bf: 267, tf: 21.6, tw: 14.4 },
  { name: 'W760x185', family: 'W', A: 23500, rx: 307, ry: 56.6, d: 767, bf: 267, tf: 23.6, tw: 14.9 },
  { name: 'W760x196', family: 'W', A: 25000, rx: 310, ry: 57.2, d: 770, bf: 267, tf: 25.4, tw: 15.6 },
  { name: 'W760x220', family: 'W', A: 28100, rx: 315, ry: 57.9, d: 780, bf: 267, tf: 30, tw: 16.5 },
  { name: 'W760x257', family: 'W', A: 32800, rx: 323, ry: 86.9, d: 772, bf: 381, tf: 27.2, tw: 16.6 },
  { name: 'W760x284', family: 'W', A: 36200, rx: 325, ry: 87.9, d: 780, bf: 381, tf: 30.2, tw: 18 },
  { name: 'W760x314', family: 'W', A: 40200, rx: 328, ry: 88.6, d: 785, bf: 384, tf: 33.5, tw: 19.7 },

  // W840
  { name: 'W840x176', family: 'W', A: 22400, rx: 330, ry: 58.9, d: 836, bf: 292, tf: 18.8, tw: 14 },
  { name: 'W840x193', family: 'W', A: 24700, rx: 335, ry: 60.7, d: 841, bf: 292, tf: 21.7, tw: 14.7 },
  { name: 'W840x210', family: 'W', A: 26800, rx: 340, ry: 61.7, d: 846, bf: 292, tf: 24.4, tw: 15.4 },
  { name: 'W840x226', family: 'W', A: 29000, rx: 343, ry: 62.7, d: 851, bf: 295, tf: 26.9, tw: 16.1 },
  { name: 'W840x251', family: 'W', A: 31900, rx: 348, ry: 63.5, d: 859, bf: 292, tf: 31, tw: 17 },
  { name: 'W840x299', family: 'W', A: 38100, rx: 356, ry: 90.4, d: 856, bf: 399, tf: 29.2, tw: 18.2 },

  // W920
  { name: 'W920x201', family: 'W', A: 25700, rx: 356, ry: 60.5, d: 904, bf: 305, tf: 20.1, tw: 15.2 },
  { name: 'W920x223', family: 'W', A: 28600, rx: 363, ry: 62.7, d: 912, bf: 305, tf: 23.9, tw: 15.9 },
  { name: 'W920x238', family: 'W', A: 30300, rx: 366, ry: 63.5, d: 914, bf: 305, tf: 25.9, tw: 16.5 },
  { name: 'W920x253', family: 'W', A: 32300, rx: 368, ry: 64.3, d: 919, bf: 305, tf: 27.9, tw: 17.3 },
  { name: 'W920x271', family: 'W', A: 34600, rx: 368, ry: 64.8, d: 922, bf: 307, tf: 30, tw: 18.4 },
  { name: 'W920x289', family: 'W', A: 36800, rx: 371, ry: 65, d: 927, bf: 307, tf: 32, tw: 19.4 },
  { name: 'W920x313', family: 'W', A: 39900, rx: 371, ry: 65.5, d: 932, bf: 310, tf: 34.5, tw: 21.1 },
  { name: 'W920x345', family: 'W', A: 43900, rx: 376, ry: 66.5, d: 943, bf: 307, tf: 39.9, tw: 22.1 },
  { name: 'W920x381', family: 'W', A: 48600, rx: 378, ry: 67.3, d: 951, bf: 310, tf: 43.9, tw: 24.4 },
  { name: 'W920x420', family: 'W', A: 53500, rx: 391, ry: 96.5, d: 942, bf: 422, tf: 39.9, tw: 22.5 },
]

// ── C-shapes (American Standard Channels) ───────────────────────────────────
const C: AiscShape[] = [
  { name: 'C75x8.9', family: 'C', A: 1140, rx: 27.7, ry: 10.5, d: 76.2, bf: 40.6, tf: 6.93, tw: 9.04 },
  { name: 'C100x10.8', family: 'C', A: 1370, rx: 37.3, ry: 11.4, d: 102, bf: 43.7, tf: 7.52, tw: 8.15 },
  { name: 'C130x10.4', family: 'C', A: 1270, rx: 49.5, ry: 12.4, d: 127, bf: 44.5, tf: 8.13, tw: 4.83 },
  { name: 'C130x13', family: 'C', A: 1700, rx: 46.7, ry: 12.3, d: 127, bf: 48, tf: 8.13, tw: 8.26 },
  { name: 'C150x12.2', family: 'C', A: 1540, rx: 59.4, ry: 13.6, d: 152, bf: 48.8, tf: 8.71, tw: 5.08 },
  { name: 'C150x15.6', family: 'C', A: 1980, rx: 56.4, ry: 13.4, d: 152, bf: 51.6, tf: 8.71, tw: 7.98 },
  { name: 'C150x19.3', family: 'C', A: 2460, rx: 54.1, ry: 13.3, d: 152, bf: 54.9, tf: 8.71, tw: 11.1 },
  { name: 'C180x14.6', family: 'C', A: 1850, rx: 69.1, ry: 14.7, d: 178, bf: 53.1, tf: 9.3, tw: 5.33 },
  { name: 'C180x18.2', family: 'C', A: 2320, rx: 65.8, ry: 14.4, d: 178, bf: 55.6, tf: 9.3, tw: 7.98 },
  { name: 'C180x22', family: 'C', A: 2790, rx: 63.8, ry: 14.2, d: 178, bf: 58.4, tf: 9.3, tw: 10.6 },
  { name: 'C200x17.1', family: 'C', A: 2170, rx: 79, ry: 15.8, d: 203, bf: 57.4, tf: 9.91, tw: 5.59 },
  { name: 'C200x20.5', family: 'C', A: 2600, rx: 75.9, ry: 15.6, d: 203, bf: 59.4, tf: 9.91, tw: 7.7 },
  { name: 'C200x27.9', family: 'C', A: 3550, rx: 71.6, ry: 15.2, d: 203, bf: 64.3, tf: 9.91, tw: 12.4 },
  { name: 'C230x19.9', family: 'C', A: 2540, rx: 88.4, ry: 16.9, d: 229, bf: 61.7, tf: 10.5, tw: 5.92 },
  { name: 'C230x22', family: 'C', A: 2840, rx: 86.4, ry: 16.7, d: 229, bf: 63.2, tf: 10.5, tw: 7.24 },
  { name: 'C230x30', family: 'C', A: 3790, rx: 81.8, ry: 16.3, d: 229, bf: 67.3, tf: 10.5, tw: 11.4 },
  { name: 'C250x22.8', family: 'C', A: 2890, rx: 98.6, ry: 18.1, d: 254, bf: 66, tf: 11.1, tw: 6.1 },
  { name: 'C250x30', family: 'C', A: 3790, rx: 93.2, ry: 17.5, d: 254, bf: 69.6, tf: 11.1, tw: 9.63 },
  { name: 'C250x37', family: 'C', A: 4740, rx: 89.4, ry: 17.1, d: 254, bf: 73.4, tf: 11.1, tw: 13.4 },
  { name: 'C250x45', family: 'C', A: 5680, rx: 87.1, ry: 17, d: 254, bf: 77, tf: 11.1, tw: 17.1 },
  { name: 'C310x30.8', family: 'C', A: 3920, rx: 117, ry: 20.2, d: 305, bf: 74.7, tf: 12.7, tw: 7.16 },
  { name: 'C310x37', family: 'C', A: 4740, rx: 113, ry: 19.8, d: 305, bf: 77.5, tf: 12.7, tw: 9.83 },
  { name: 'C310x45', family: 'C', A: 5680, rx: 109, ry: 19.4, d: 305, bf: 80.5, tf: 12.7, tw: 13 },
  { name: 'C380x50.4', family: 'C', A: 6450, rx: 142, ry: 22.9, d: 381, bf: 86.4, tf: 16.5, tw: 10.2 },
  { name: 'C380x60', family: 'C', A: 7610, rx: 138, ry: 22.4, d: 381, bf: 89.4, tf: 16.5, tw: 13.2 },
  { name: 'C380x74', family: 'C', A: 9480, rx: 133, ry: 22, d: 381, bf: 94.5, tf: 16.5, tw: 18.2 },
]

// ── L-shapes (single angles) ─────────────────────────────────────────────────
// Equal-leg and common unequal-leg angles; rz = minor principal radius; xbar = centroid from back of leg.
const L: AiscShape[] = [
  // 51 × 51
  { name: 'L51x51x4.8', family: 'L', A: 466, rx: 15.5, ry: 15.5, rz: 9.88, xbar: 14.2, leg1: 50.8, leg2: 50.8, t: 4.76 },
  { name: 'L51x51x6.4', family: 'L', A: 609, rx: 15.4, ry: 15.4, rz: 9.83, xbar: 14.9, leg1: 50.8, leg2: 50.8, t: 6.35 },
  { name: 'L51x51x7.9', family: 'L', A: 748, rx: 15.2, ry: 15.2, rz: 9.8, xbar: 15.5, leg1: 50.8, leg2: 50.8, t: 7.94 },
  { name: 'L51x51x9.5', family: 'L', A: 884, rx: 15, ry: 15, rz: 9.8, xbar: 16.1, leg1: 50.8, leg2: 50.8, t: 9.53 },
  // 64 × 64
  { name: 'L64x64x4.8', family: 'L', A: 581, rx: 19.6, ry: 19.6, rz: 12.2, xbar: 17.4, leg1: 63.5, leg2: 63.5, t: 4.76 },
  { name: 'L64x64x6.4', family: 'L', A: 768, rx: 19.4, ry: 19.4, rz: 12.2, xbar: 18.1, leg1: 63.5, leg2: 63.5, t: 6.35 },
  { name: 'L64x64x7.9', family: 'L', A: 942, rx: 19.2, ry: 19.2, rz: 12.2, xbar: 18.7, leg1: 63.5, leg2: 63.5, t: 7.94 },
  { name: 'L64x64x9.5', family: 'L', A: 1120, rx: 19, ry: 19, rz: 12.2, xbar: 19.3, leg1: 63.5, leg2: 63.5, t: 9.53 },
  // 76 × 76
  { name: 'L76x76x4.8', family: 'L', A: 703, rx: 23.7, ry: 23.7, rz: 14.9, xbar: 20.6, leg1: 76.2, leg2: 76.2, t: 4.76 },
  { name: 'L76x76x6.4', family: 'L', A: 929, rx: 23.5, ry: 23.5, rz: 14.9, xbar: 21.2, leg1: 76.2, leg2: 76.2, t: 6.35 },
  { name: 'L76x76x7.9', family: 'L', A: 1150, rx: 23.3, ry: 23.3, rz: 14.8, xbar: 21.8, leg1: 76.2, leg2: 76.2, t: 7.94 },
  { name: 'L76x76x9.5', family: 'L', A: 1360, rx: 23.1, ry: 23.1, rz: 14.8, xbar: 22.5, leg1: 76.2, leg2: 76.2, t: 9.53 },
  { name: 'L76x76x12.7', family: 'L', A: 1780, rx: 22.7, ry: 22.7, rz: 14.7, xbar: 23.6, leg1: 76.2, leg2: 76.2, t: 12.7 },
  // 89 × 89
  { name: 'L89x89x6.4', family: 'L', A: 1100, rx: 27.7, ry: 27.7, rz: 17.5, xbar: 24.2, leg1: 88.9, leg2: 88.9, t: 6.35 },
  { name: 'L89x89x7.9', family: 'L', A: 1350, rx: 27.4, ry: 27.4, rz: 17.4, xbar: 24.9, leg1: 88.9, leg2: 88.9, t: 7.94 },
  { name: 'L89x89x9.5', family: 'L', A: 1610, rx: 27.2, ry: 27.2, rz: 17.3, xbar: 25.4, leg1: 88.9, leg2: 88.9, t: 9.53 },
  { name: 'L89x89x12.7', family: 'L', A: 2100, rx: 26.7, ry: 26.7, rz: 17.2, xbar: 26.7, leg1: 88.9, leg2: 88.9, t: 12.7 },
  // 102 × 102
  { name: 'L102x102x7.9', family: 'L', A: 1550, rx: 31.5, ry: 31.5, rz: 19.8, xbar: 28.2, leg1: 102, leg2: 102, t: 7.94 },
  { name: 'L102x102x9.5', family: 'L', A: 1850, rx: 31.2, ry: 31.2, rz: 19.8, xbar: 28.7, leg1: 102, leg2: 102, t: 9.53 },
  { name: 'L102x102x12.7', family: 'L', A: 2420, rx: 30.7, ry: 30.7, rz: 19.7, xbar: 30, leg1: 102, leg2: 102, t: 12.7 },
  { name: 'L102x102x15.9', family: 'L', A: 2970, rx: 30.5, ry: 30.5, rz: 19.7, xbar: 31, leg1: 102, leg2: 102, t: 15.9 },
  // 127 × 127
  { name: 'L127x127x9.5', family: 'L', A: 2350, rx: 39.4, ry: 39.4, rz: 25, xbar: 34.8, leg1: 127, leg2: 127, t: 9.53 },
  { name: 'L127x127x12.7', family: 'L', A: 3090, rx: 38.9, ry: 38.9, rz: 24.9, xbar: 36.1, leg1: 127, leg2: 127, t: 12.7 },
  { name: 'L127x127x15.9', family: 'L', A: 3810, rx: 38.6, ry: 38.6, rz: 24.8, xbar: 37.3, leg1: 127, leg2: 127, t: 15.9 },
  { name: 'L127x127x19.1', family: 'L', A: 4500, rx: 38.1, ry: 38.1, rz: 24.7, xbar: 38.6, leg1: 127, leg2: 127, t: 19.1 },
  // 152 × 152
  { name: 'L152x152x9.5', family: 'L', A: 2830, rx: 47.5, ry: 47.5, rz: 30.2, xbar: 41.1, leg1: 152, leg2: 152, t: 9.53 },
  { name: 'L152x152x12.7', family: 'L', A: 3720, rx: 47.2, ry: 47.2, rz: 30, xbar: 42.4, leg1: 152, leg2: 152, t: 12.7 },
  { name: 'L152x152x15.9', family: 'L', A: 4600, rx: 46.7, ry: 46.7, rz: 29.7, xbar: 43.7, leg1: 152, leg2: 152, t: 15.9 },
  { name: 'L152x152x19', family: 'L', A: 5460, rx: 46.2, ry: 46.2, rz: 29.7, xbar: 45, leg1: 152, leg2: 152, t: 19.1 },
  { name: 'L152x152x22.2', family: 'L', A: 6290, rx: 46, ry: 46, rz: 29.7, xbar: 46, leg1: 152, leg2: 152, t: 22.2 },
  { name: 'L152x152x25.4', family: 'L', A: 7100, rx: 45.5, ry: 45.5, rz: 29.7, xbar: 47.2, leg1: 152, leg2: 152, t: 25.4 },
  // 203 × 203
  { name: 'L203x203x15.9', family: 'L', A: 6250, rx: 63, ry: 63, rz: 40.1, xbar: 56.1, leg1: 203, leg2: 203, t: 15.9 },
  { name: 'L203x203x19.1', family: 'L', A: 7420, rx: 62.5, ry: 62.5, rz: 39.9, xbar: 57.4, leg1: 203, leg2: 203, t: 19.1 },
  { name: 'L203x203x22.2', family: 'L', A: 8580, rx: 62.2, ry: 62.2, rz: 39.9, xbar: 58.7, leg1: 203, leg2: 203, t: 22.2 },
  { name: 'L203x203x25.4', family: 'L', A: 9740, rx: 61.7, ry: 61.7, rz: 39.6, xbar: 59.9, leg1: 203, leg2: 203, t: 25.4 },
  // unequal-leg: 152 × 89
  { name: 'L152x89x7.9', family: 'L', A: 1860, rx: 49.3, ry: 25.2, rz: 19.5, xbar: 19.2, leg1: 152, leg2: 88.9, t: 7.94 },
  { name: 'L152x89x9.5', family: 'L', A: 2220, rx: 49, ry: 25, rz: 19.4, xbar: 19.8, leg1: 152, leg2: 88.9, t: 9.53 },
  { name: 'L152x89x12.7', family: 'L', A: 2900, rx: 48.8, ry: 24.6, rz: 19.2, xbar: 21.1, leg1: 152, leg2: 88.9, t: 12.7 },
  // unequal-leg: 152 × 102
  { name: 'L152x102x9.5', family: 'L', A: 2330, rx: 49, ry: 29.5, rz: 22.1, xbar: 23.7, leg1: 152, leg2: 102, t: 9.53 },
  { name: 'L152x102x12.7', family: 'L', A: 3060, rx: 48.5, ry: 29, rz: 21.9, xbar: 24.9, leg1: 152, leg2: 102, t: 12.7 },
  // unequal-leg: 178 × 102
  { name: 'L178x102x9.5', family: 'L', A: 2580, rx: 57.7, ry: 28.4, rz: 22.2, xbar: 21.9, leg1: 178, leg2: 102, t: 9.53 },
  { name: 'L178x102x12.7', family: 'L', A: 3390, rx: 57.2, ry: 28.2, rz: 22, xbar: 23.1, leg1: 178, leg2: 102, t: 12.7 },
  // unequal-leg: 203 × 152
  { name: 'L203x152x12.7', family: 'L', A: 4390, rx: 64.8, ry: 45.5, rz: 33, xbar: 37.1, leg1: 203, leg2: 152, t: 12.7 },
  { name: 'L203x152x15.9', family: 'L', A: 5430, rx: 64.5, ry: 45, rz: 32.8, xbar: 38.4, leg1: 203, leg2: 152, t: 15.9 },
]

// ── Computed (nominal-geometry) tube generators ─────────────────────────────
// ── HSS rectangular / square ─────────────────────────────────────────────────
const HSS: AiscShape[] = [
  { name: 'HSS50x50x3.2', family: 'HSS', A: 542, rx: 19.3, ry: 19.3, b: 50.8, h: 50.8, t: 2.95 },
  { name: 'HSS50x50x4.8', family: 'HSS', A: 768, rx: 18.6, ry: 18.6, b: 50.8, h: 50.8, t: 4.42 },
  { name: 'HSS64x64x3.2', family: 'HSS', A: 690, rx: 24.5, ry: 24.5, b: 63.5, h: 63.5, t: 2.95 },
  { name: 'HSS64x64x4.8', family: 'HSS', A: 994, rx: 23.8, ry: 23.8, b: 63.5, h: 63.5, t: 4.42 },
  { name: 'HSS76x76x4.8', family: 'HSS', A: 1220, rx: 29, ry: 29, b: 76.2, h: 76.2, t: 4.42 },
  { name: 'HSS76x76x6.4', family: 'HSS', A: 1570, rx: 28.2, ry: 28.2, b: 76.2, h: 76.2, t: 5.92 },
  { name: 'HSS89x89x4.8', family: 'HSS', A: 1450, rx: 34.3, ry: 34.3, b: 88.9, h: 88.9, t: 4.42 },
  { name: 'HSS89x89x6.4', family: 'HSS', A: 1880, rx: 33.5, ry: 33.5, b: 88.9, h: 88.9, t: 5.92 },
  { name: 'HSS89x89x7.9', family: 'HSS', A: 2270, rx: 32.8, ry: 32.8, b: 88.9, h: 88.9, t: 7.39 },
  { name: 'HSS102x102x4.8', family: 'HSS', A: 1660, rx: 39.4, ry: 39.4, b: 101.6, h: 101.6, t: 4.42 },
  { name: 'HSS102x102x6.4', family: 'HSS', A: 2170, rx: 38.6, ry: 38.6, b: 101.6, h: 101.6, t: 5.92 },
  { name: 'HSS102x102x7.9', family: 'HSS', A: 2650, rx: 37.8, ry: 37.8, b: 101.6, h: 101.6, t: 7.39 },
  { name: 'HSS102x102x9.5', family: 'HSS', A: 3080, rx: 37.3, ry: 37.3, b: 101.6, h: 101.6, t: 8.86 },
  { name: 'HSS127x127x6.4', family: 'HSS', A: 2770, rx: 49, ry: 49, b: 127, h: 127, t: 5.92 },
  { name: 'HSS127x127x7.9', family: 'HSS', A: 3390, rx: 48.3, ry: 48.3, b: 127, h: 127, t: 7.39 },
  { name: 'HSS152x152x6.4', family: 'HSS', A: 3380, rx: 59.4, ry: 59.4, b: 152.4, h: 152.4, t: 5.92 },
  { name: 'HSS152x152x7.9', family: 'HSS', A: 4150, rx: 58.7, ry: 58.7, b: 152.4, h: 152.4, t: 7.39 },
  { name: 'HSS152x152x9.5', family: 'HSS', A: 4890, rx: 57.9, ry: 57.9, b: 152.4, h: 152.4, t: 8.86 },
  { name: 'HSS152x152x12.7', family: 'HSS', A: 6280, rx: 56.6, ry: 56.6, b: 152.4, h: 152.4, t: 11.8 },
  { name: 'HSS178x178x6.4', family: 'HSS', A: 3980, rx: 69.9, ry: 69.9, b: 177.8, h: 177.8, t: 5.92 },
  { name: 'HSS178x178x7.9', family: 'HSS', A: 4900, rx: 69.1, ry: 69.1, b: 177.8, h: 177.8, t: 7.39 },
  { name: 'HSS178x178x9.5', family: 'HSS', A: 5790, rx: 68.3, ry: 68.3, b: 177.8, h: 177.8, t: 8.86 },
  { name: 'HSS178x178x12.7', family: 'HSS', A: 7480, rx: 66.8, ry: 66.8, b: 177.8, h: 177.8, t: 11.8 },
  { name: 'HSS203x203x6.4', family: 'HSS', A: 4580, rx: 80, ry: 80, b: 203.2, h: 203.2, t: 5.92 },
  { name: 'HSS203x203x7.9', family: 'HSS', A: 5650, rx: 79.5, ry: 79.5, b: 203.2, h: 203.2, t: 7.39 },
  { name: 'HSS203x203x9.5', family: 'HSS', A: 6710, rx: 78.7, ry: 78.7, b: 203.2, h: 203.2, t: 8.86 },
  { name: 'HSS203x203x12.7', family: 'HSS', A: 8710, rx: 77.2, ry: 77.2, b: 203.2, h: 203.2, t: 11.8 },
  { name: 'HSS254x254x6.4', family: 'HSS', A: 5780, rx: 101, ry: 101, b: 254, h: 254, t: 5.92 },
  { name: 'HSS254x254x7.9', family: 'HSS', A: 7160, rx: 100, ry: 100, b: 254, h: 254, t: 7.39 },
  { name: 'HSS254x254x9.5', family: 'HSS', A: 8520, rx: 99.6, ry: 99.6, b: 254, h: 254, t: 8.86 },
  { name: 'HSS254x254x12.7', family: 'HSS', A: 11100, rx: 98, ry: 98, b: 254, h: 254, t: 11.8 },
  { name: 'HSS305x305x6.4', family: 'HSS', A: 6970, rx: 122, ry: 122, b: 304.8, h: 304.8, t: 5.92 },
  { name: 'HSS305x305x9.5', family: 'HSS', A: 10300, rx: 120, ry: 120, b: 304.8, h: 304.8, t: 8.86 },
  { name: 'HSS305x305x12.7', family: 'HSS', A: 13500, rx: 119, ry: 119, b: 304.8, h: 304.8, t: 11.8 },
  { name: 'HSS356x356x9.5', family: 'HSS', A: 12100, rx: 141, ry: 141, b: 355.6, h: 355.6, t: 8.86 },
  { name: 'HSS356x356x12.7', family: 'HSS', A: 15900, rx: 139, ry: 139, b: 355.6, h: 355.6, t: 11.8 },
  // rectangular
  { name: 'HSS102x51x4.8', family: 'HSS', A: 1220, rx: 35.3, ry: 20.4, b: 50.8, h: 101.6, t: 4.42 },
  { name: 'HSS102x51x6.4', family: 'HSS', A: 1570, rx: 34.5, ry: 19.8, b: 50.8, h: 101.6, t: 5.92 },
  { name: 'HSS127x64x4.8', family: 'HSS', A: 1550, rx: 45, ry: 25.9, b: 63.5, h: 127, t: 4.42 },
  { name: 'HSS127x64x6.4', family: 'HSS', A: 2030, rx: 43.9, ry: 25.4, b: 63.5, h: 127, t: 5.92 },
  { name: 'HSS152x76x4.8', family: 'HSS', A: 1890, rx: 54.4, ry: 31.8, b: 76.2, h: 152.4, t: 4.42 },
  { name: 'HSS152x76x6.4', family: 'HSS', A: 2480, rx: 53.3, ry: 31, b: 76.2, h: 152.4, t: 5.92 },
  { name: 'HSS152x102x6.4', family: 'HSS', A: 2770, rx: 55.9, ry: 40.9, b: 101.6, h: 152.4, t: 5.92 },
  { name: 'HSS152x102x7.9', family: 'HSS', A: 3390, rx: 55.1, ry: 40.1, b: 101.6, h: 152.4, t: 7.39 },
  { name: 'HSS152x102x9.5', family: 'HSS', A: 3990, rx: 54.4, ry: 39.4, b: 101.6, h: 152.4, t: 8.86 },
  { name: 'HSS203x102x6.4', family: 'HSS', A: 3380, rx: 72.4, ry: 42.2, b: 101.6, h: 203.2, t: 5.92 },
  { name: 'HSS203x102x7.9', family: 'HSS', A: 4150, rx: 71.6, ry: 41.4, b: 101.6, h: 203.2, t: 7.39 },
  { name: 'HSS203x102x9.5', family: 'HSS', A: 4890, rx: 70.6, ry: 40.9, b: 101.6, h: 203.2, t: 8.86 },
  { name: 'HSS203x152x6.4', family: 'HSS', A: 3980, rx: 77, ry: 61.7, b: 152.4, h: 203.2, t: 5.92 },
  { name: 'HSS203x152x9.5', family: 'HSS', A: 5790, rx: 75.4, ry: 60.5, b: 152.4, h: 203.2, t: 8.86 },
  { name: 'HSS254x152x6.4', family: 'HSS', A: 4580, rx: 93.7, ry: 63.2, b: 152.4, h: 254, t: 5.92 },
  { name: 'HSS254x152x9.5', family: 'HSS', A: 6710, rx: 92.2, ry: 62, b: 152.4, h: 254, t: 8.86 },
  { name: 'HSS305x152x9.5', family: 'HSS', A: 7610, rx: 109, ry: 63.2, b: 152.4, h: 304.8, t: 8.86 },
  { name: 'HSS305x203x9.5', family: 'HSS', A: 8520, rx: 114, ry: 83.1, b: 203.2, h: 304.8, t: 8.86 },
  { name: 'HSS127x127x9.5', family: 'HSS', A: 3990, rx: 47.5, ry: 47.5, b: 127, h: 127, t: 8.86 },
  { name: 'HSS127x76x6.4', family: 'HSS', A: 2170, rx: 45.2, ry: 30.2, b: 76.2, h: 127, t: 5.92 },
]

// ── Round HSS / standard pipe ─────────────────────────────────────────────────
const PIPE: AiscShape[] = [
  { name: 'PIPE 3 STD', family: 'PIPE', A: 1340, rx: 29.7, ry: 29.7, D: 88.9, t: 5.11 },
  { name: 'PIPE 4 STD', family: 'PIPE', A: 1910, rx: 38.4, ry: 38.4, D: 114.3, t: 5.61 },
  { name: 'PIPE 5 STD', family: 'PIPE', A: 2590, rx: 47.8, ry: 47.8, D: 141.3, t: 6.12 },
  { name: 'PIPE 6 STD', family: 'PIPE', A: 3350, rx: 57.2, ry: 57.2, D: 168.3, t: 6.63 },
  { name: 'HSS60x3.9', family: 'PIPE', A: 645, rx: 20.1, ry: 20.1, D: 60.3, t: 3.63 },
  { name: 'HSS89x3.2', family: 'PIPE', A: 794, rx: 30.5, ry: 30.5, D: 88.9, t: 2.95 },
  { name: 'HSS114x6', family: 'PIPE', A: 1910, rx: 38.6, ry: 38.6, D: 114.3, t: 5.59 },
  { name: 'HSS140x6.6', family: 'PIPE', A: 2560, rx: 47.2, ry: 47.2, D: 139.7, t: 6.1 },
  { name: 'HSS168x7.1', family: 'PIPE', A: 3350, rx: 57.2, ry: 57.2, D: 168.3, t: 6.6 },
  { name: 'HSS219x8.2', family: 'PIPE', A: 5060, rx: 74.9, ry: 74.9, D: 219.1, t: 7.62 },
  { name: 'HSS273x9.5', family: 'PIPE', A: 7350, rx: 93.5, ry: 93.5, D: 273.1, t: 8.86 },
  { name: 'HSS324x9.5', family: 'PIPE', A: 8770, rx: 112, ry: 112, D: 323.9, t: 8.86 },
  { name: 'HSS356x9.5', family: 'PIPE', A: 9680, rx: 123, ry: 123, D: 355.6, t: 8.86 },
  { name: 'PIPE 8 STD', family: 'PIPE', A: 5060, rx: 74.9, ry: 74.9, D: 219.1, t: 7.62 },
  { name: 'PIPE 10 STD', family: 'PIPE', A: 7420, rx: 93.5, ry: 93.5, D: 273, t: 8.64 },
  { name: 'HSS168x6.4', family: 'PIPE', A: 3020, rx: 57.4, ry: 57.4, D: 168.3, t: 5.92 },
  { name: 'HSS219x6.4', family: 'PIPE', A: 3960, rx: 75.4, ry: 75.4, D: 219.1, t: 5.92 },
]

// ── WT-shapes (structural tees) ────────────────────────────────────────────────
const WT: AiscShape[] = [
  // WT75 — cut from W150
  { name: 'WT75x9', family: 'WT', A: 1150, rx: 21.9, ry: 23.3, d: 76.7, bf: 102, tf: 7.11, tw: 5.84 },
  { name: 'WT75x11.25', family: 'WT', A: 1430, rx: 20.2, ry: 36.8, d: 76.2, bf: 152, tf: 6.6, tw: 5.84 },
  { name: 'WT75x14.9', family: 'WT', A: 1900, rx: 19.7, ry: 38.1, d: 78.7, bf: 153, tf: 9.27, tw: 6.6 },
  // WT100 — cut from W200
  { name: 'WT100x11.25', family: 'WT', A: 1430, rx: 31, ry: 22.3, d: 103, bf: 102, tf: 8, tw: 6.22 },
  { name: 'WT100x15.65', family: 'WT', A: 1990, rx: 28.4, ry: 32, d: 105, bf: 134, tf: 10.2, tw: 6.35 },
  { name: 'WT100x17.95', family: 'WT', A: 2280, rx: 25.4, ry: 40.9, d: 101, bf: 165, tf: 10.2, tw: 6.22 },
  { name: 'WT100x23.1', family: 'WT', A: 2940, rx: 24.6, ry: 51.3, d: 102, bf: 203, tf: 11, tw: 7.24 },
  // WT125 — cut from W250
  { name: 'WT125x16.4', family: 'WT', A: 2090, rx: 37.1, ry: 33.8, d: 129, bf: 146, tf: 9.14, tw: 6.1 },
  { name: 'WT125x19.3', family: 'WT', A: 2460, rx: 36.6, ry: 34.5, d: 131, bf: 147, tf: 11.2, tw: 6.6 },
  { name: 'WT125x24.55', family: 'WT', A: 3130, rx: 32, ry: 49.3, d: 124, bf: 202, tf: 11, tw: 7.37 },
  { name: 'WT125x33.5', family: 'WT', A: 4280, rx: 31.5, ry: 51.1, d: 128, bf: 204, tf: 15.7, tw: 8.89 },
  // WT155 — cut from W310
  { name: 'WT155x19.4', family: 'WT', A: 2460, rx: 44.5, ry: 38.4, d: 155, bf: 165, tf: 9.65, tw: 5.84 },
  { name: 'WT155x22.3', family: 'WT', A: 2840, rx: 44.5, ry: 38.6, d: 157, bf: 166, tf: 11.2, tw: 6.6 },
  { name: 'WT155x26', family: 'WT', A: 3340, rx: 44.7, ry: 39.1, d: 159, bf: 167, tf: 13.2, tw: 7.62 },
  { name: 'WT155x39.5', family: 'WT', A: 5020, rx: 38.4, ry: 63, d: 153, bf: 254, tf: 14.6, tw: 8.76 },
  // WT180 — cut from W360
  { name: 'WT180x25.5', family: 'WT', A: 3230, rx: 51.8, ry: 38.9, d: 178, bf: 171, tf: 11.6, tw: 7.24 },
  { name: 'WT180x28.9', family: 'WT', A: 3600, rx: 51.8, ry: 39.4, d: 179, bf: 172, tf: 13.1, tw: 7.87 },
  { name: 'WT180x39.5', family: 'WT', A: 5030, rx: 47.8, ry: 48.8, d: 177, bf: 205, tf: 16.8, tw: 9.4 },
  // WT205 — cut from W410
  { name: 'WT205x19.4', family: 'WT', A: 2480, rx: 62.7, ry: 28.4, d: 199, bf: 140, tf: 8.76, tw: 6.35 },
  { name: 'WT205x26.5', family: 'WT', A: 3410, rx: 61.2, ry: 38.6, d: 201, bf: 178, tf: 10.9, tw: 7.49 },
  { name: 'WT205x50', family: 'WT', A: 6330, rx: 56.4, ry: 62.5, d: 208, bf: 259, tf: 16.9, tw: 10 },
  // WT230 — cut from W460
  { name: 'WT230x26', family: 'WT', A: 3320, rx: 70.9, ry: 31, d: 225, bf: 152, tf: 10.8, tw: 7.62 },
  { name: 'WT230x37', family: 'WT', A: 4740, rx: 68.6, ry: 41.9, d: 229, bf: 191, tf: 14.5, tw: 9.02 },
  // WT265 — cut from W530
  { name: 'WT265x33', family: 'WT', A: 4190, rx: 84.1, ry: 32, d: 262, bf: 165, tf: 11.4, tw: 8.89 },
  { name: 'WT265x75', family: 'WT', A: 9610, rx: 76.5, ry: 73.4, d: 272, bf: 312, tf: 20.3, tw: 12.7 },
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
/** Names an earlier catalogue carried that are not AISC designations — a
 *  mass rounded the wrong way (W150x22 is W150X22.5), or no such rolled shape
 *  at all (W250x192, C150x25.7), in which case the nearest real shape stands in.
 *  Saved models still name them, so lookups resolve through this table. */
export const LEGACY_SHAPE_NAMES: Readonly<Record<string, string>> = {
  'W150x22': 'W150x22.5',
  'W200x17.9': 'W200x19.3',
  'W200x22': 'W200x22.5',
  'W200x59.3': 'W200x59',
  'W200x71.9': 'W200x71',
  'W250x38.7': 'W250x38.5',
  'W250x192': 'W250x167',
  'W410x74.3': 'W410x75',
  'W840x246': 'W840x251',
  'W840x276': 'W840x299',
  'C100x13.4': 'C100x10.8',
  'C130x10.0': 'C130x10.4',
  'C130x13.4': 'C130x13',
  'C150x25.7': 'C150x19.3',
  'C180x21.9': 'C180x22',
  'C230x22.2': 'C230x22',
  'C230x29.8': 'C230x30',
  'C250x29.8': 'C250x30',
  'C380x50.5': 'C380x50.4',
  'C380x74.5': 'C380x74',
  'HSS89x3.9': 'HSS89x3.2',
  'HSS114x6.4': 'HSS114x6',
  'HSS139x6.4': 'HSS140x6.6',
  'HSS273x9.3': 'HSS273x9.5',
  'WT75x11.2': 'WT75x11.25',
  'WT100x10.5': 'WT100x11.25',
  'WT100x14.9': 'WT100x15.65',
  'WT100x17.9': 'WT100x17.95',
  'WT125x24.5': 'WT125x24.55',
  'WT180x25.6': 'WT180x25.5',
  'WT180x29.5': 'WT180x28.9',
  'WT180x40.5': 'WT180x39.5',
}
const BY_NAME = new Map(AISC_SHAPES.map((s) => [s.name, s]))
/** The catalogue shape a name refers to — current or legacy. */
export const shapeByName = (name: string): AiscShape | undefined =>
  BY_NAME.get(name) ?? BY_NAME.get(LEGACY_SHAPE_NAMES[name] ?? '')
/** The current catalogue name for a stored one (itself when already current). */
export const canonicalShapeName = (name: string): string => shapeByName(name)?.name ?? name

/** St-Venant torsional constant J (mm⁴) from the tabulated geometry.
 *  Open shapes (C, L): thin-wall J = Σ(b·t³)/3 (Roark, Table 10.7) — the polar
 *  moment Ix+Iy overestimates open-section J by 1–2 orders of magnitude, i.e.
 *  reads UNconservatively stiff in torsion.
 *  Closed shapes: rect/square HSS by Bredt's second formula J = 4A₀²t/p on the
 *  midline; round HSS / pipe exactly J = (π/32)(D⁴ − Di⁴) (= Ix+Iy, circular).
 *  Returns undefined when the needed geometry fields are absent (caller keeps
 *  its fallback). W/WT use deriveWSection's thin-wall J instead. */
export function torsionJ(s: AiscShape): number | undefined {
  if (s.family === 'C' && s.d && s.bf && s.tf && s.tw)
    return (2 * s.bf * s.tf ** 3 + (s.d - 2 * s.tf) * s.tw ** 3) / 3
  if (s.family === 'L' && s.leg1 && s.leg2 && s.t)
    return (s.leg1 * s.t ** 3 + (s.leg2 - s.t) * s.t ** 3) / 3
  if ((s.family === 'HSS' || s.family === 'PIPE') && s.D && s.t)
    return (Math.PI / 32) * (s.D ** 4 - (s.D - 2 * s.t) ** 4)
  if (s.family === 'HSS' && s.b && s.h && s.t) {
    const bm = s.b - s.t, hm = s.h - s.t              // midline rectangle
    return (4 * (bm * hm) ** 2 * s.t) / (2 * (bm + hm))
  }
  return undefined
}

/** Overall cross-section bounding box {b (width), h (depth)} in mm, per family.
 *  Used as the RectSection b×h carried alongside a steel member (self-weight uses
 *  the true area, but the box drives fallbacks, quantities and labelling). */
export function sectionBoundingBox(s: AiscShape): { b: number; h: number } {
  if (s.family === 'HSS') return { b: s.b ?? 100, h: s.h ?? 100 }
  if (s.family === 'PIPE') return { b: s.D ?? 100, h: s.D ?? 100 }
  if (s.family === 'L') {
    const legV = Math.max(s.leg1 ?? 50, s.leg2 ?? 50), legH = Math.min(s.leg1 ?? 50, s.leg2 ?? 50)
    return { b: legH, h: legV }
  }
  // W / WT / C
  return { b: s.bf ?? 100, h: s.d ?? 100 }
}

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

/** Next heavier W-shape in the catalog — strictly more area, so two shapes
 *  that weigh the same (W310x79, W360x79) are not a step; undefined at the top. */
export function nextHeavierW(name: string): AiscShape | undefined {
  const s = shapeByName(name)
  return s?.family === 'W' ? W_SORTED.find((w) => w.A > s.A) : undefined
}

/** Next lighter W-shape in the catalog — strictly less area; undefined at the bottom. */
export function nextLighterW(name: string): AiscShape | undefined {
  const s = shapeByName(name)
  if (s?.family !== 'W') return undefined
  for (let i = W_SORTED.length - 1; i >= 0; i--) if (W_SORTED[i]!.A < s.A) return W_SORTED[i]
  return undefined
}
