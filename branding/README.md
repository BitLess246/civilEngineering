# Zeta brand files

All files are generated from one geometry by `scripts/brand/brand.py` (SVG) and `scripts/brand/render.mjs` (PNG). Edit the generator, never the outputs. Type is converted to outlines, so no file needs a font installed.

| File | Use |
|---|---|
| `zeta-mark.svg` · `png/zeta-mark-1024.png` | The folded-Z mark alone, transparent. App icons, watermarks, small spaces. |
| `zeta-logo-ink.svg` · `png/zeta-logo-ink-2400.png` | Mark + ZETA, dark wordmark. Headers on light grounds. |
| `zeta-logo-paper.svg` · `png/zeta-logo-paper-2400.png` | Mark + ZETA, light wordmark. Headers on dark grounds. |
| `zeta-lockup-{ink,paper}.svg` · `png/…-2400.png` | With the tagline *Structural engineering made clearer*. Covers, title cards, reel end-cards. |
| `png/zeta-avatar-ink-1080.png` | Social profile picture (Facebook, LinkedIn, X, YouTube). The mark on ink, padded to survive a circular crop. |
| `png/zeta-avatar-paper-1080.png` | The same on paper, for platforms with a light frame. |

The site uses `webapp/public/favicon.svg` (with `favicon-48.png` as the PNG fallback), `apple-touch-icon.png`, `icon-192/512.png`, `icon-maskable-512.png`, `site.webmanifest`, and `og-image.png` (`scripts/og-image`). In the app, `ZetaMark` and `ZetaLogo` (`webapp/src/components/BrandMark.tsx`) draw the same art from the generated `src/lib/brandArt.ts`. The wordmark is `currentColor`, so it follows the theme tokens.

**Rules.** The mark keeps its own blues on every ground; don't recolour it, outline it, or add a glow. Clear space is the height of one bar (10/64 of the mark) on every side. Minimum size: 16 px for the mark, 20 px mark height for the logo.

**Faces.** ZETA is Archivo Expanded (wdth 125) SemiBold, tracked +4 %. The tagline is IBM Plex Mono Medium, tracked to the wordmark's width. Both are OFL fonts from Google Fonts. `brand.py` documents the download.
