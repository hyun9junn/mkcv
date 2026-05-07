# README Preview GIF

**Date:** 2026-05-08  
**Status:** Approved

## Overview

Replace the static README hero image `preview.png` with a short looping `preview.gif` that shows mkcv's end-to-end value in a few seconds:

1. edit YAML on the left
2. watch the PDF preview refresh on the right
3. switch templates
4. open export options

The GIF should make the app's "single YAML source -> multiple polished outputs" story obvious even when viewed small inside GitHub's README layout.

## Goals

- communicate mkcv's core workflow in `6-8` seconds
- make the preview asset more eye-catching than a static screenshot
- keep normal product behavior unchanged for real users
- make GIF regeneration repeatable through a checked-in script

## Non-Goals

- no change to the default preview debounce for normal app usage
- no general-purpose in-app demo mode beyond what is needed for README capture
- no manual screen recording workflow that depends on a human reproducing the same steps
- no redesign of the app UI for README marketing purposes

## Chosen Approach

Use a **hybrid automated capture flow**:

- capture real in-browser interactions with Playwright so the editor and preview feel alive
- hold on one or two key states slightly longer so small README playback remains readable
- generate a committed `preview.gif` asset from deterministic captured frames

This balances authenticity, repeatability, and readability better than either a purely static stitched GIF or a loose manual recording.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| README asset | Root-level `preview.gif` committed to the repo | Keeps the README link simple and mirrors the current `preview.png` placement |
| Capture mode | Query-param gated mode via `?capture=gif` | Lets capture runs move faster without changing default product behavior |
| Preview debounce in capture mode | Lower from `900 ms` to about `200 ms` | Preserves the "live refresh" feel while reducing dead time in the GIF |
| Recording style | Full-app crop focused on editor + preview | Communicates the relationship between source YAML and rendered PDF immediately |
| Initial content | Deterministic seeded sample resume state | Avoids personal data leaks and makes regeneration stable across machines |
| GIF pipeline | Playwright frame capture + a small JS GIF encoder dependency | Avoids relying on global tools like `ffmpeg` or ImageMagick |
| Final beat | Export menu opened and held briefly | Reinforces that the same source can export to `PDF`, `Markdown`, and `LaTeX` |

## Storyboard

The final loop should follow this exact order:

1. **Initial state**
   - App loads into a clean seeded sample resume state.
   - Onboarding is dismissed or pre-suppressed.
   - The viewport is cropped so the editor and preview are both clearly visible.

2. **YAML edit**
   - The cursor moves to the `personal.name` line near the top of the YAML.
   - A short visible edit is made, such as appending a middle name or changing the displayed name.
   - The chosen edit must create an obvious visual change in the PDF header so the refresh is noticeable even at small size.

3. **Preview refresh**
   - The preview loading state appears briefly.
   - The PDF updates with the edited name.
   - This frame range should linger just enough for viewers to perceive cause and effect.

4. **Template switch**
   - The template picker opens.
   - A visually distinct template is selected from the current default, favoring an option like `studio-pop`, `trackline`, or another layout with a clearly different header treatment.
   - The preview updates again so viewers can see that one YAML source can drive different visual outputs.

5. **Export reveal**
   - The export menu opens.
   - `PDF`, `Markdown`, and `LaTeX` are visible in the final held frames.

6. **Loop behavior**
   - The GIF may hard-cut back to the first frame after the export hold.
   - Smoothness is less important than clarity; readability takes priority over a perfectly seamless loop.

## Capture-Only Runtime Behavior

`frontend/preview.js` should no longer hardcode a single fixed debounce value. Instead:

- default app behavior remains exactly `900 ms`
- if the page URL includes `?capture=gif`, the debounce drops to a capture-specific value around `200 ms`
- no other preview behavior changes for normal users

The capture mode is intentionally narrow. It exists only to reduce idle waiting during automated README recording and should not become a broader configuration surface.

## Deterministic Seed State

The capture script must not depend on whatever is already in browser storage. Before the page loads, it should seed a known state using `page.addInitScript(...)`.

At minimum, the script should:

- clear existing `mkcv` localStorage keys
- set `mkcv_onboarding_seen = "1"`
- prefill `mkcv:default:resume.yaml` with a known sample resume
- force `mkcv_theme = "light"` for consistent README rendering

The preferred sample source is `scripts/sample-cv.yaml`, because it is already repo-owned, polished, and broad enough to make template differences visible.

## Recording Automation

Add a dedicated README asset generation script rather than repurposing the onboarding screenshot script.

### New script

- `scripts/generate-readme-preview-gif.mjs`

### Responsibilities

- launch Chromium with Playwright
- open `http://localhost:8000/?capture=gif`
- seed deterministic storage before page load
- wait for the initial preview to finish rendering
- perform the storyboard interactions in sequence
- capture a bounded series of frames rather than a free-running video
- assemble the frames into `preview.gif`

### Why frames instead of manual video capture

Frame capture gives tighter control over:

- when the preview refresh is considered complete
- how long key moments are held
- output dimensions and frame rate
- final GIF size

## Asset Constraints

The generated GIF should be optimized for GitHub README display:

- duration: `6-8` seconds
- playback: infinite loop
- frame rate: low-to-moderate, roughly `6-8 fps`
- width: large enough to read in README, but reduced from the current oversized PNG
- file size: keep it as small as practical, ideally under about `8-10 MB`

If needed, prioritize these optimizations in order:

1. reduce hold-frame duplication
2. reduce frame rate slightly
3. crop more tightly around the app
4. reduce output width modestly

## Files Affected

- `frontend/preview.js`
  - derive preview debounce from URL params
  - preserve the existing `900 ms` default
- `scripts/generate-readme-preview-gif.mjs`
  - new deterministic Playwright capture + GIF assembly script
- `README.md`
  - replace `![Preview](./preview.png)` with `![Preview](./preview.gif)`
- `preview.gif`
  - new committed README asset

The existing `preview.png` may remain in the repo temporarily as a fallback/reference asset, but the README should point to the GIF once the new asset is verified.

## Testing And Verification

Verification should confirm:

1. normal app sessions still use the existing preview timing
2. `?capture=gif` sessions use the shorter debounce
3. the capture script produces a deterministic asset from a clean browser state
4. the resulting GIF clearly shows YAML edit -> preview refresh -> template change -> export options
5. `README.md` renders the new GIF correctly

Manual verification should include opening the generated GIF locally and checking that the key beats remain legible when the image is viewed at typical GitHub README width.
