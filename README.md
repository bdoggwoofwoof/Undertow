# Undertow

Newt's personal feelings check-in app, built to replace How We Feel. Live at https://undertow-taupe.vercel.app.

Plain static site with no build step. Vercel (project `undertow`) is linked to this repo: every push to `main` goes live, and other branches get preview links.

## Files
- `index.html`: the page shell and tab bar.
- `styles.css`: design tokens (light and dark) and all styles.
- `data.js`: grid words with Shami/Fusha Arabic, the Plutchik wheel and blends, body areas, tags, tools and journal prompts.
- `app.js`: the app (check-in, Today, Journal, Patterns, Tools, More, tour, storage, backup).
- `sw.js`: offline support (network first, cache fallback). Bump `CACHE` when files are added or renamed.
- `manifest.webmanifest`, `icon.svg`, `icon-180.png`, `icon-192.png`: install and icons.

## Data
Everything stays on the device: localStorage key `undertow.v1`, plus a second copy in IndexedDB. Never write over a list that can't be read. Backups are JSON files from More; restore merges by check-in id.

## Sources and rights
- Grid: Undertow's own word list and layout on two axes (energy, pleasantness).
- Wheel: Robert Plutchik's 1980 model (8 emotions, 3 strengths, 8 blends), drawn new. No Willcox Feeling Wheel or How We Feel artwork or word arrangements are used.
- Arabic words are a first draft; check with a speaker before relying on them.

## Version
1.0 (Nov 3, 2026). Version and date live at the top of `app.js`.
