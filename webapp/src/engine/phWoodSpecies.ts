// ─────────────────────────────────────────────────────────────────────────
// PHILIPPINE WOODS — NSCP 2015 Table 615.2-1, "Reference Values for Visually
// Stress-Graded Unseasoned Structural Timber of Philippine Woods", all 45
// species at the three stress grades it tabulates (80%, 63%, 50%).
//
// Per row: Fb (= Ft, the table gives one value for bending and tension
// parallel to grain), E (×10³ MPa), Fc, Fc⊥, Fv — MPa. These are the
// reference values for normal load duration and DRY service (§615.3.2:
// in-service moisture content ≤ 19%); the wet-service factors of Table
// 617.1-4(a) apply above that.
//
// Derived, per the code:
//   Emin = E·(1 − 1.645·COV_E)·1.03/1.66, COV_E = 0.25 for visually graded
//          sawn lumber (§617.3.1) — 0.36531·E.
//   G    = the species' relative density from Table 619.1-1, used for the
//          member's self-weight.
//
// PRINTED MISPRINTS, CORRECTED. Every grade is the same fraction of the 80%
// grade (63% ≈ 0.7875×, 50% ≈ 0.625×), and every cell of the table obeys
// that to within 4% except four, which are typesetting errors in the 2015
// first printing. Each is replaced by the value its other two grades give:
//   Liusin       50%  Fc   printed "9376" → 9.76
//   Malabayabas  50%  Fc   printed "9390" → 9.90
//   Yakal        50%  E    printed 3.11   → 6.11   (9.78 / 7.70 at 80 / 63%)
//   Lomarau      50%  Fc⊥  printed 2.86   → 1.86   (larger than its 63% 2.34)
// `phWoodSpecies.test.ts` re-checks the ratio on every cell, so a future
// transcription slip cannot pass silently either.
//
// Table 615.2-2 (additional commercial species) is not included yet.
// ─────────────────────────────────────────────────────────────────────────

/** NSCP 2015 §617.3.1: Emin = E(1 − 1.645·0.25)(1.03)/1.66. */
export const PH_EMIN_RATIO = (1 - 1.645 * 0.25) * 1.03 / 1.66

export type PhStrengthGroup = 'I' | 'II' | 'III' | 'IV'
export const PH_STRENGTH_GROUP: Record<PhStrengthGroup, string> = {
  I: 'High strength', II: 'Moderately high strength', III: 'Medium strength', IV: 'Moderately low strength',
}

/** [Fb=Ft, E (×10³ MPa), Fc, Fc⊥, Fv], MPa. */
export type PhGradeRow = [number, number, number, number, number]

/** [common name, botanical name, strength group, relative density, 80%, 63%, 50%]. */
export const PH_WOODS: [string, string, PhStrengthGroup, number, PhGradeRow, PhGradeRow, PhGradeRow][] = [
  ['Agoho', 'Casuarina equisetifolia', 'I', 0.84, [26.3, 8.22, 14.5, 5.91, 2.95], [20.7, 6.47, 11.4, 4.65, 2.32], [16.4, 5.14, 9.06, 3.69, 1.84]],
  ['Liusin', 'Parinari corymbosa', 'I', 0.79, [25.0, 9.36, 15.6, 4.31, 2.64], [19.7, 7.37, 12.3, 3.39, 2.08], [15.6, 5.85, 9.76, 2.69, 1.65]],
  ['Malabayabas', 'Tristania spp.', 'I', 0.9, [28.7, 8.3, 15.8, 8.7, 3.02], [22.6, 6.53, 12.5, 6.85, 2.38], [17.9, 5.19, 9.9, 5.44, 1.89]],
  ['Manggachapui', 'Hopea spp.', 'I', 0.71, [25.8, 9.63, 16.0, 6.03, 2.78], [20.3, 7.58, 12.6, 4.75, 2.19], [16.1, 6.02, 10.0, 3.77, 1.74]],
  ['Molave', 'Vitex parviflora', 'I', 0.69, [24.0, 6.54, 15.4, 6.34, 2.88], [18.9, 5.15, 12.1, 5.0, 2.27], [15.0, 4.09, 9.6, 3.96, 1.8]],
  ['Narig', 'Vatica spp.', 'I', 0.72, [21.8, 8.33, 13.7, 4.97, 2.61], [17.2, 6.56, 10.8, 3.92, 2.06], [13.6, 5.2, 8.59, 3.11, 1.63]],
  ['Sasalit', 'Teijmanniodendron ahernianum', 'I', 0.9, [31.3, 9.72, 21.6, 10.2, 3.38], [24.7, 7.65, 17.0, 8.07, 2.67], [19.6, 6.08, 13.5, 6.4, 2.12]],
  ['Yakal', 'Shorea spp.', 'I', 0.76, [24.5, 9.78, 15.8, 6.27, 2.49], [19.3, 7.7, 12.0, 4.94, 1.96], [15.3, 6.11, 9.55, 3.92, 1.55]],
  ['Antipolo', 'Artocarpus spp.', 'II', 0.52, [18.6, 5.35, 10.8, 3.9, 2.06], [14.7, 4.21, 8.53, 3.07, 1.62], [11.6, 3.34, 6.77, 2.44, 1.29]],
  ['Binggas', 'Terminalia spp.', 'II', 0.7, [18.9, 6.57, 11.4, 3.27, 2.24], [14.9, 5.17, 8.98, 2.57, 1.77], [11.8, 4.11, 7.13, 2.04, 1.4]],
  ['Bokbok', 'Xanthophyllum excelsum', 'II', 0.64, [18.1, 6.36, 11.3, 3.41, 2.18], [14.3, 5.01, 8.9, 2.68, 1.72], [11.3, 3.97, 7.06, 2.13, 1.36]],
  ['Dao', 'Dracontomelon spp.', 'II', 0.48, [16.2, 5.43, 9.44, 2.27, 1.92], [12.8, 4.28, 7.43, 1.79, 1.51], [10.1, 3.39, 5.9, 1.42, 1.2]],
  ['Gatasan', 'Garcinia venulosa', 'II', 0.67, [20.8, 6.84, 13.5, 3.52, 2.36], [16.4, 5.39, 10.6, 2.77, 1.86], [13.0, 4.27, 8.42, 2.2, 1.47]],
  ['Guijo', 'Shorea spp.', 'II', 0.7, [21.8, 8.47, 13.2, 4.26, 2.4], [17.1, 6.67, 10.4, 3.35, 1.89], [13.6, 5.3, 8.22, 2.66, 1.5]],
  ['Kamagong', 'Diospyros spp.', 'II', 0.72, [20.9, 7.2, 11.7, 4.39, 2.47], [16.6, 5.67, 9.21, 3.46, 1.95], [13.1, 4.5, 7.31, 2.74, 1.54]],
  ['Kamatog', 'Erythrophloeum densiflorum', 'II', 0.64, [19.0, 7.56, 11.2, 3.95, 2.35], [15.0, 5.95, 8.79, 3.11, 1.85], [11.9, 4.72, 6.98, 2.47, 1.47]],
  ['Katmon', 'Dillenia spp.', 'II', 0.68, [18.8, 6.82, 11.9, 4.84, 2.29], [14.8, 5.37, 9.38, 3.81, 1.8], [11.7, 4.26, 7.44, 3.03, 1.43]],
  ['Kato', 'Amoora spp.', 'II', 0.59, [18.4, 8.04, 10.6, 3.46, 1.96], [14.5, 6.33, 8.34, 2.73, 1.54], [11.5, 5.02, 6.62, 2.17, 1.23]],
  ['Lomarau', 'Swintonia foxworthyi', 'II', 0.64, [19.8, 7.92, 11.8, 2.98, 2.18], [15.6, 6.24, 9.3, 2.34, 1.71], [12.4, 4.95, 7.38, 1.86, 1.36]],
  ['Mahogany, big-leafed', 'Swietenia macrophylla', 'II', 0.54, [16.5, 4.66, 10.5, 3.83, 2.71], [13.0, 3.67, 8.24, 3.01, 2.13], [10.3, 2.91, 6.54, 2.39, 1.69]],
  ['Makaasim', 'Syzygium nitidum', 'II', 0.74, [20.5, 6.72, 11.4, 3.7, 2.4], [16.1, 5.29, 8.95, 2.92, 1.89], [12.8, 4.2, 7.1, 2.31, 1.5]],
  ['Malakauayan', 'Decussocarpus philippinensis', 'II', 0.5, [18.9, 6.66, 11.12, 2.32, 2.14], [14.9, 5.24, 8.79, 1.83, 1.69], [11.8, 4.16, 6.98, 1.45, 1.34]],
  ['Narra', 'Pterocarpus indicus', 'II', 0.52, [18.0, 5.94, 11.4, 3.07, 1.91], [14.2, 4.68, 8.97, 2.42, 1.51], [11.2, 3.71, 7.12, 1.92, 1.2]],
  ['Pahutan', 'Mangifera spp.', 'II', 0.55, [16.6, 6.53, 10.0, 2.5, 2.05], [13.1, 5.15, 7.88, 1.97, 1.61], [10.4, 4.08, 6.25, 1.56, 1.28]],
  ['Apitong', 'Dipterocarpus spp.', 'III', 0.57, [16.5, 7.31, 9.56, 2.2, 1.73], [13.0, 5.76, 7.53, 1.73, 1.36], [10.3, 4.57, 5.97, 1.37, 1.08]],
  ['Bagtikan', 'Parashorea malaanonan', 'III', 0.44, [16.6, 6.48, 9.89, 2.33, 1.82], [13.1, 5.1, 7.79, 1.84, 1.43], [10.4, 4.05, 6.18, 1.46, 1.14]],
  ['Dangkalan', 'Calophyllum spp.', 'III', 0.58, [16.3, 6.38, 9.2, 2.48, 1.98], [12.8, 5.03, 7.24, 1.96, 1.56], [10.2, 3.99, 5.75, 1.55, 1.24]],
  ['Gisau', 'Canarium spp.', 'III', 0.5, [14.3, 5.33, 8.16, 1.99, 1.9], [11.2, 4.2, 6.43, 1.56, 1.49], [8.93, 3.33, 5.1, 1.24, 1.18]],
  ['Lanutan-bagyo', 'Gonystylus macrophyllum', 'III', 0.53, [15.0, 6.06, 8.96, 2.02, 1.84], [11.8, 4.77, 7.06, 1.59, 1.45], [9.39, 3.79, 5.6, 1.26, 1.15]],
  ['Lauan', 'Shorea spp.', 'III', 0.4, [13.9, 5.83, 8.18, 1.72, 1.48], [10.9, 4.59, 6.44, 1.35, 1.17], [8.68, 3.64, 5.11, 1.07, 0.93]],
  ['Malaanonang', 'Shorea spp.', 'III', 0.41, [13.8, 5.41, 8.54, 1.96, 1.59], [10.9, 4.26, 6.72, 1.54, 1.25], [8.63, 3.38, 5.34, 1.23, 0.99]],
  ['Malasaging', 'Aglaia spp.', 'III', 0.51, [16.8, 5.94, 9.51, 2.92, 1.85], [13.3, 4.68, 7.49, 2.3, 1.46], [10.5, 3.71, 5.95, 1.83, 1.16]],
  ['Malugai', 'Pometia spp.', 'III', 0.61, [15.4, 6.3, 9.33, 3.07, 2.07], [12.1, 4.96, 7.35, 2.42, 1.63], [9.62, 3.94, 5.83, 1.92, 1.3]],
  ['Miau', 'Dysoxylum spp.', 'III', 0.52, [15.7, 6.5, 8.83, 2.78, 2.06], [12.3, 5.12, 6.96, 2.19, 1.62], [9.8, 4.06, 5.52, 1.74, 1.29]],
  ['Nato', 'Palaquium spp.', 'III', 0.49, [16.2, 5.56, 9.17, 2.33, 1.98], [12.7, 4.38, 7.22, 1.84, 1.56], [10.1, 3.48, 5.73, 1.46, 1.24]],
  ['Palosapis', 'Anisoptera spp.', 'III', 0.52, [13.8, 5.98, 8.38, 2.73, 1.68], [10.9, 4.71, 6.6, 2.15, 1.33], [8.65, 3.73, 5.24, 1.7, 1.05]],
  ['Pine', 'Pinus spp.', 'III', 0.55, [14.7, 6.66, 8.29, 1.88, 1.56], [11.6, 5.24, 6.53, 1.48, 1.23], [9.19, 4.16, 5.18, 1.18, 0.98]],
  ['Salakin', 'Aphanamixis spp.', 'III', 0.56, [15.7, 5.67, 8.83, 2.94, 1.88], [12.4, 4.47, 6.96, 2.32, 1.48], [9.83, 3.54, 5.52, 1.84, 1.18]],
  ['Vidal lanutan', 'Hibiscus campylosiphon', 'III', 0.5, [19.5, 5.83, 8.54, 2.65, 2.39], [15.4, 4.59, 6.73, 2.09, 1.88], [12.2, 3.64, 5.34, 1.66, 1.5]],
  ['Almaciga', 'Agathis dammara', 'IV', 0.42, [11.8, 5.47, 6.27, 1.44, 1.47], [9.26, 4.3, 4.94, 1.13, 1.16], [7.35, 3.42, 3.92, 0.9, 0.92]],
  ['Bayok', 'Pterospermum spp.', 'IV', 0.44, [12.6, 4.75, 7.33, 1.3, 1.2], [9.94, 3.74, 5.78, 1.03, 0.95], [7.89, 2.97, 4.58, 0.81, 0.75]],
  ['Lingo-lingo', 'Vitex turczaninowii', 'IV', 0.48, [13.2, 4.13, 6.85, 2.0, 1.66], [10.4, 3.25, 5.39, 1.58, 1.31], [8.27, 2.58, 4.28, 1.25, 1.04]],
  ['Mangasinoro', 'Shorea spp.', 'IV', 0.42, [12.8, 5.36, 7.46, 1.97, 1.44], [10.0, 4.22, 5.87, 1.55, 1.14], [7.98, 3.35, 4.66, 1.23, 0.9]],
  ['Raintree', 'Samanea saman', 'IV', 0.48, [11.9, 2.75, 7.23, 3.32, 2.07], [9.37, 2.16, 5.7, 2.61, 1.63], [7.43, 1.72, 4.52, 2.07, 1.3]],
  ['Yemane', 'Gmelina arborea', 'IV', 0.42, [12.6, 4.09, 7.87, 3.4, 1.96], [9.9, 3.22, 6.2, 2.68, 1.55], [7.86, 2.55, 4.92, 2.13, 1.23]],
]

/** The three stress grades Table 615.2-1 tabulates, as fractions. */
export const PH_GRADES = [80, 63, 50] as const
