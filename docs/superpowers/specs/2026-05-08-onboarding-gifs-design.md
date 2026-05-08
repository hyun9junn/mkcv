# Onboarding GIFs Design

**Date:** 2026-05-08  
**Status:** Approved

## Goal

Replace the 9 static PNGs used in the onboarding modal with animated GIFs that demonstrate each feature in action. Each step gets its own short GIF. Steps whose interactions cause the PDF preview to re-render use a zoom-in/zoom-out technique to show both the interaction and the preview change.

## Decisions

| Decision | Choice |
|---|---|
| Scope | One GIF per step (9 GIFs) |
| Animation | Rich interaction on every step — no steps are static loops |
| Clip strategy | Full-viewport (1400×860) for steps with preview changes; focused crop for display-only steps |
| Zoom technique | Hard cut: zoomed-in frames (crop+scale) → full-viewport frames |
| Script architecture | New standalone `scripts/generate-onboarding-gifs.mjs` |
| Dependencies | Same as README GIF: Playwright + pngjs + gifenc (no additions) |

## Files Changed

| File | Change |
|---|---|
| `scripts/generate-onboarding-gifs.mjs` | New script |
| `scripts/README.md` | Add documentation entry for new script |
| `frontend/assets/onboarding/*.gif` | 9 new GIF files (replace PNGs) |
| `frontend/onboarding.js` | Change `.png` → `.gif` in all 9 STEPS `img` fields |

The PNG files can be deleted once all GIFs are generated and verified.

## Script Structure

```
scripts/generate-onboarding-gifs.mjs

Exports (for testability):
  buildSeedStorage(resumeYaml)       — seeds localStorage (same as README GIF script)
  resolveGifencBindings(ns)          — resolves gifenc exports (same as README GIF script)
  cropAndScale(srcPng, clip, w, h)   — nearest-neighbor resize using pngjs RGBA buffers

Internal:
  waitForPreviewStable(page)         — polls #preview-loading + canvas presence
  waitForNextPreviewStable(page, fn) — fires action, awaits /api/preview/pdf + stable
  captureFrame(page, frames, clip, holdMs)         — full-viewport screenshot → push frame
  captureZoomedFrame(page, frames, zoomClip, holdMs) — full screenshot → cropAndScale → push frame
  encodeGif(frames, outputPath)      — pngjs + gifenc → write file

  sceneXX functions — one per step, see Scenes below

  main({ baseUrl, outputDir })       — launches Chromium, seeds localStorage, runs all 9 scenes
```

`cropAndScale` takes a full PNG buffer, extracts `clip` ({x, y, width, height}), and scales that region to the target dimensions using nearest-neighbor pixel mapping. Pure JS, no extra deps.

## The 9 Scenes

### Steps with zoom-in / zoom-out (preview changes)

These steps capture two kinds of frames:
- **Zoomed frames**: full screenshot → `cropAndScale(zoomRegion, 1400, 860)` — interaction area enlarged
- **Full frames**: full screenshot as-is — preview change visible

| # | Output | Zoom-in region | Interaction | Zoom-out shows |
|---|---|---|---|---|
| 01 | `01-welcome.gif` | Editor panel (x:0 y:55 650×795) | Type " Marie" into name | Full viewport — preview settles with updated name |
| 04 | `04-sections-only.gif` | Toolbar (x:0 y:0 1400×110) | 1. Click chip to hide section<br>2. Double-click chip title → type new name → Enter | Full viewport after each action — preview reflects hide, then new title |
| 06 | `06-layout.gif` | Toolbar (x:0 y:0 1400×110) | Click density: Comfortable → Balanced → Compact | Full viewport after each click — preview re-renders |
| 07a | `07a-template-picker.gif` | Template picker (x:578 y:0 422×700) | Click template A → wait → click template B | Full viewport after each — preview shows new template |
| 08 | `08-export.gif` | Export button area (x:1150 y:0 250×250) | Open export menu → click PDF | Full viewport — filename modal visible |

### Steps with focused crop only (no preview change)

| # | Output | Clip | Interaction |
|---|---|---|---|
| 02 | `02-editor.gif` | x:0 y:55 650×795 | Click editor → type a char → Ctrl+Space → autocomplete popup |
| 03 | `03-preview.gif` | x:695 y:55 705×795 | Click zoom-in ×2 → pause → click zoom-out ×2 |
| 05 | `05-contact.gif` | x:0 y:55 750×420 | Open Contact dropdown → toggle field off → toggle back on |
| 07b | `07b-settings-yaml.gif` | x:0 y:55 650×795 | Click settings tab → pause → click resume tab |

## Storyboard Timings (approximate)

Each GIF targets 4–8 seconds total. Frame `holdMs` values (ms displayed per frame in GIF):

- **Hold on interaction state**: 800–1200 ms (user reads what changed)
- **Hold on zoomed-in idle**: 600–900 ms (orientation before action)
- **Hold on full-viewport after preview**: 1500–2000 ms (preview change registers)
- **Per-character typing frames**: 40 ms delay (matches README GIF)

## Output

All GIFs written to `frontend/assets/onboarding/`:
```
01-welcome.gif
02-editor.gif
03-preview.gif
04-sections-only.gif
05-contact.gif
06-layout.gif
07a-template-picker.gif
07b-settings-yaml.gif
08-export.gif
```

## onboarding.js Update

Change all `img` field suffixes from `.png` to `.gif` in the `STEPS` array. No other changes to `onboarding.js` — the `<img>` tag renders GIFs natively, and `object-fit: cover` / `object-fit: contain` work identically.

## Running the Script

```bash
# Same one-time setup as README GIF script (if not already done)
npm install playwright pngjs gifenc
npx playwright install chromium

# Start the app server, then:
node scripts/generate-onboarding-gifs.mjs

# Custom server address:
MKCV_CAPTURE_BASE_URL=http://localhost:3000 node scripts/generate-onboarding-gifs.mjs
```

Output directory defaults to `frontend/assets/onboarding/`. All 9 GIFs are generated in one run (single browser session).
