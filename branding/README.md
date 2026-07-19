# PuffPing branding assets

Drop logo and brand files here. Suggested files (any you have — no need for all):

| File | Used for |
|------|----------|
| `logo.svg` | Primary logo (marketing header, app sidebar) — SVG preferred, scales crisply |
| `logo-mark.svg` | Icon-only mark (square) — favicon, app icon, small spaces |
| `logo-wordmark.svg` | Text-only wordmark |
| `logo-light.svg` / `logo-dark.svg` | Light/dark variants if the logo needs different colors per theme |
| `favicon.ico` / `icon.png` (512×512) | Browser tab + PWA icon |
| `og-image.png` (1200×630) | Social share preview for the marketing site |
| `brand-guidelines.pdf` | Colors, fonts, spacing (reference) |

## How these get wired in

- **Web-served assets** (anything the browser loads directly) also need to live under `public/`.
  Once you drop files here, tell me and I'll copy/reference the ones that should be public into
  `public/brand/` and wire them into the marketing header, app sidebar, favicon, and OG tags.
- **Source/design files** (`.ai`, `.fig`, `.pdf`, large PNGs) can stay in this folder as the
  source of truth without being shipped to the browser.

Formats: SVG for logos wherever possible; PNG with transparency otherwise. Colors currently
key off the minimalist green/near-black theme — a mark that reads on both light and dark works best.
