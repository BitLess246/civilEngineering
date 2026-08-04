// The font every in-canvas label is drawn with, and the character set it is
// required to cover. Kept out of SceneText.tsx so that file exports only a
// component (react-refresh), and so the test can assert coverage without
// pulling three.js into the test environment.
//
// See components/SceneText.tsx for WHY the font must be bundled rather than
// resolved over the network.

import sceneFontUrl from '../assets/fonts/DejaVuSans-scene.ttf?url'

/** Subset of DejaVu Sans (Bitstream Vera licence) — printable ASCII plus the
 *  engineering symbols the scenes use. Same family as the PDF fonts, so screen
 *  and print labels match. Regenerate with:
 *
 *    pyftsubset DejaVuSans.ttf --output-file=src/assets/fonts/DejaVuSans-scene.ttf \
 *      --unicodes="U+0020-007E,U+00A0,U+00B0-U+00B3,U+00B5,U+00D7,U+00D8,U+00F7,U+00F8,\
 *                  U+0394,U+03A3,U+03A6,U+03BC,U+03C6,U+2013,U+2014,U+2018,U+2019,U+201C,\
 *                  U+201D,U+2032,U+2033,U+2126,U+2205,U+2211,U+2260,U+2264,U+2265" \
 *      --layout-features='' --no-hinting --desubroutinize --drop-tables+=GSUB,GPOS,DSIG
 */
export const SCENE_FONT = sceneFontUrl

/** Characters the bundled subset is required to cover; anything outside this
 *  set would send troika back to the CDN. Asserted in SceneText.test.ts. */
export const SCENE_FONT_REQUIRED =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`' +
  'abcdefghijklmnopqrstuvwxyz{|}~' +
  '°±²³µ×ØøΔΣΦφμ–—‘’“”′″≤≥≠÷∅∑'
