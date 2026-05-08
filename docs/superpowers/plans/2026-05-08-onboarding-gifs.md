# Onboarding GIFs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 9 static PNGs in the onboarding modal with animated GIFs that demonstrate each feature in action, using a zoom-in/zoom-out technique to show both the interaction and its effect on the live PDF preview.

**Architecture:** A new `scripts/generate-onboarding-gifs.mjs` script launches one Playwright Chromium browser session, runs 9 "scenes" in sequence, and writes a GIF for each to `frontend/assets/onboarding/`. Scenes that trigger a preview re-render use a "zoom-in then zoom-out" frame sequence: tight-crop frames (nearest-neighbor scaled to full viewport) show the interaction clearly, then full-viewport frames reveal the updated PDF. `cropAndScale` is the only new pure function — everything else follows the existing `generate-readme-preview-gif.mjs` pattern.

**Tech Stack:** Node.js ESM, Playwright (Chromium), pngjs, gifenc — all already in `devDependencies`. No new packages.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `scripts/generate-onboarding-gifs.mjs` | All 9 scenes + shared utils + `main()` |
| Create | `tests/generate-onboarding-gifs.test.mjs` | Unit test for `cropAndScale` |
| Modify | `frontend/onboarding.js` | Change `.png` → `.gif` in all 9 STEPS entries |
| Modify | `scripts/README.md` | Add documentation entry for new script |

---

## Task 1: Test and implement `cropAndScale`

**Files:**
- Create: `tests/generate-onboarding-gifs.test.mjs`
- Create: `scripts/generate-onboarding-gifs.mjs` (cropAndScale only)

`cropAndScale(srcPng, clip, targetWidth, targetHeight)` takes a parsed pngjs PNG object, extracts the sub-region defined by `clip` (`{x, y, width, height}`), and scales it to `targetWidth × targetHeight` using nearest-neighbor interpolation. Returns a new pngjs PNG object.

- [ ] **Step 1: Write the failing test**

Create `tests/generate-onboarding-gifs.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { cropAndScale } from '../scripts/generate-onboarding-gifs.mjs';

test('cropAndScale extracts and upscales a sub-region', () => {
  // 4×4 source: top-left quadrant is red, top-right green, bottom-left blue, bottom-right white
  const src = new PNG({ width: 4, height: 4 });
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const i = (y * 4 + x) * 4;
      if (x < 2 && y < 2) { src.data[i] = 255; src.data[i+1] = 0;   src.data[i+2] = 0;   src.data[i+3] = 255; } // red
      else if (x >= 2 && y < 2) { src.data[i] = 0; src.data[i+1] = 255; src.data[i+2] = 0; src.data[i+3] = 255; } // green
      else if (x < 2 && y >= 2) { src.data[i] = 0; src.data[i+1] = 0;   src.data[i+2] = 255; src.data[i+3] = 255; } // blue
      else { src.data[i] = 255; src.data[i+1] = 255; src.data[i+2] = 255; src.data[i+3] = 255; } // white
    }
  }

  // Crop top-left 2×2 (red region) and scale to 4×4
  const result = cropAndScale(src, { x: 0, y: 0, width: 2, height: 2 }, 4, 4);

  assert.equal(result.width, 4);
  assert.equal(result.height, 4);
  // Every pixel in the 4×4 result should be red
  for (let i = 0; i < 4 * 4 * 4; i += 4) {
    assert.equal(result.data[i],   255, `R at ${i}`);
    assert.equal(result.data[i+1], 0,   `G at ${i}`);
    assert.equal(result.data[i+2], 0,   `B at ${i}`);
    assert.equal(result.data[i+3], 255, `A at ${i}`);
  }
});

test('cropAndScale preserves a non-uniform region correctly', () => {
  // 4×4 source where bottom-right 2×2 is blue
  const src = new PNG({ width: 4, height: 4 });
  src.data.fill(0);
  for (let y = 2; y < 4; y++) {
    for (let x = 2; x < 4; x++) {
      const i = (y * 4 + x) * 4;
      src.data[i] = 0; src.data[i+1] = 0; src.data[i+2] = 255; src.data[i+3] = 255;
    }
  }

  // Crop bottom-right 2×2 (blue), scale to 2×2
  const result = cropAndScale(src, { x: 2, y: 2, width: 2, height: 2 }, 2, 2);

  assert.equal(result.width, 2);
  assert.equal(result.height, 2);
  for (let i = 0; i < 2 * 2 * 4; i += 4) {
    assert.equal(result.data[i+2], 255, `B at ${i}`);
  }
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
node --test tests/generate-onboarding-gifs.test.mjs
```

Expected: error about `cropAndScale` not exported (module doesn't exist yet).

- [ ] **Step 3: Create `scripts/generate-onboarding-gifs.mjs` with `cropAndScale`**

```js
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';

const VIEWPORT = { width: 1400, height: 860 };
const DEFAULT_BASE_URL = process.env.MKCV_CAPTURE_BASE_URL || 'http://localhost:8000';
const SAMPLE_RESUME_PATH = path.resolve('scripts/sample-cv.yaml');
const DEFAULT_OUT_DIR = path.resolve('frontend/assets/onboarding');

export function buildSeedStorage(resumeYaml) {
  return {
    mkcv_onboarding_seen: '1',
    mkcv_theme: 'light',
    'mkcv:default:resume.yaml': resumeYaml,
  };
}

export function resolveGifencBindings(moduleNamespace) {
  const bindings =
    (moduleNamespace && typeof moduleNamespace.GIFEncoder === 'function' && moduleNamespace) ||
    (moduleNamespace?.default && typeof moduleNamespace.default.GIFEncoder === 'function' && moduleNamespace.default) ||
    (moduleNamespace?.['module.exports'] &&
      typeof moduleNamespace['module.exports'].GIFEncoder === 'function' &&
      moduleNamespace['module.exports']);
  if (!bindings) throw new TypeError('Unable to resolve gifenc bindings');
  return bindings;
}

export function cropAndScale(srcPng, clip, targetWidth, targetHeight) {
  const dst = new PNG({ width: targetWidth, height: targetHeight });
  for (let dy = 0; dy < targetHeight; dy++) {
    for (let dx = 0; dx < targetWidth; dx++) {
      const sx = Math.min(clip.x + Math.floor((dx / targetWidth) * clip.width), srcPng.width - 1);
      const sy = Math.min(clip.y + Math.floor((dy / targetHeight) * clip.height), srcPng.height - 1);
      const srcIdx = (sy * srcPng.width + sx) * 4;
      const dstIdx = (dy * targetWidth + dx) * 4;
      dst.data[dstIdx]   = srcPng.data[srcIdx];
      dst.data[dstIdx+1] = srcPng.data[srcIdx+1];
      dst.data[dstIdx+2] = srcPng.data[srcIdx+2];
      dst.data[dstIdx+3] = srcPng.data[srcIdx+3];
    }
  }
  return dst;
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
node --test tests/generate-onboarding-gifs.test.mjs
```

Expected: `✔ cropAndScale extracts and upscales a sub-region` and `✔ cropAndScale preserves a non-uniform region correctly` — both pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-onboarding-gifs.mjs tests/generate-onboarding-gifs.test.mjs
git commit -m "feat: add cropAndScale utility with tests"
```

---

## Task 2: Add shared frame-capture utilities and `main` skeleton

**Files:**
- Modify: `scripts/generate-onboarding-gifs.mjs`

Append these functions after `cropAndScale`. They match the pattern from `generate-readme-preview-gif.mjs`.

- [ ] **Step 1: Append shared utilities to the script**

Append to `scripts/generate-onboarding-gifs.mjs` (after `cropAndScale`):

```js
async function waitForPreviewStable(page) {
  await page.waitForFunction(() => {
    const loading = document.getElementById('preview-loading');
    const frame = document.getElementById('preview-frame');
    return Boolean(
      loading && loading.style.display === 'none' &&
      frame && frame.querySelectorAll('canvas').length > 0
    );
  }, null, { timeout: 30000 });
}

async function waitForNextPreviewStable(page, action) {
  const nextResponse = page.waitForResponse(
    (r) => {
      try { return new URL(r.url()).pathname === '/api/preview/pdf' && r.request().method().toUpperCase() === 'POST' && r.ok(); }
      catch { return false; }
    },
    { timeout: 30000 }
  );
  await action();
  await nextResponse;
  await waitForPreviewStable(page);
}

async function captureFrame(page, frames, holdMs) {
  const buffer = await page.screenshot({ clip: { x: 0, y: 0, ...VIEWPORT } });
  frames.push({ buffer, holdMs });
}

async function captureZoomedFrame(page, frames, zoomClip, holdMs) {
  const raw = await page.screenshot({ clip: { x: 0, y: 0, ...VIEWPORT } });
  const srcPng = PNG.sync.read(raw);
  const dstPng = cropAndScale(srcPng, zoomClip, VIEWPORT.width, VIEWPORT.height);
  frames.push({ buffer: PNG.sync.write(dstPng), holdMs });
}

async function encodeGif(frames, outputPath) {
  const gifencModule = await import('gifenc');
  const { GIFEncoder, quantize, applyPalette } = resolveGifencBindings(gifencModule);
  const gif = GIFEncoder();
  for (const frame of frames) {
    const png = PNG.sync.read(frame.buffer);
    const palette = quantize(png.data, 256);
    const pixels = applyPalette(png.data, palette);
    gif.writeFrame(pixels, png.width, png.height, {
      palette,
      delay: Math.max(1, Math.round(frame.holdMs)),
    });
  }
  gif.finish();
  fs.writeFileSync(outputPath, Buffer.from(gif.bytes()));
}

export async function main({ baseUrl = DEFAULT_BASE_URL, outputDir = DEFAULT_OUT_DIR } = {}) {
  const { chromium } = await import('playwright');
  const resumeYaml = fs.readFileSync(SAMPLE_RESUME_PATH, 'utf8');
  const seed = buildSeedStorage(resumeYaml);
  const url = baseUrl.replace(/\/$/, '') + '/';

  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await page.addInitScript((storage) => {
      const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
      keys.filter(k => k && k.startsWith('mkcv')).forEach(k => localStorage.removeItem(k));
      Object.entries(storage).forEach(([k, v]) => localStorage.setItem(k, v));
    }, seed);

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await waitForPreviewStable(page);

    const scenes = [
      { name: '01-welcome',          fn: scene01Welcome },
      { name: '02-editor',           fn: scene02Editor },
      { name: '03-preview',          fn: scene03Preview },
      { name: '04-sections-only',    fn: scene04Sections },
      { name: '05-contact',          fn: scene05Contact },
      { name: '06-layout',           fn: scene06Layout },
      { name: '07a-template-picker', fn: scene07aTemplatePicker },
      { name: '07b-settings-yaml',   fn: scene07bSettings },
      { name: '08-export',           fn: scene08Export },
    ];

    for (const { name, fn } of scenes) {
      const frames = [];
      await fn(page, frames);
      const outputPath = path.join(outputDir, `${name}.gif`);
      await encodeGif(frames, outputPath);
      console.log(`Wrote ${outputPath}`);
    }
  } finally {
    await browser.close();
  }
}

const isDirectRun = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;

if (isDirectRun) {
  main().catch((err) => { console.error(err); process.exitCode = 1; });
}
```

- [ ] **Step 2: Verify the file parses cleanly**

```bash
node --input-type=module <<'EOF'
import './scripts/generate-onboarding-gifs.mjs';
console.log('parse ok');
EOF
```

Expected: `parse ok` (scene functions referenced in `scenes` array don't exist yet, so this will fail with a ReferenceError — that's expected and tells you the skeleton is wired up).

Actually, run this check instead:

```bash
node -e "import('./scripts/generate-onboarding-gifs.mjs').then(() => console.log('exports ok')).catch(e => console.error(e.message))"
```

Expected output contains `scene01Welcome is not defined` or similar — confirms the module loads and the scenes wiring is the only missing piece.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-onboarding-gifs.mjs
git commit -m "feat: add shared utilities and main skeleton for onboarding GIFs"
```

---

## Task 3: Implement scenes 01 and 02

**Files:**
- Modify: `scripts/generate-onboarding-gifs.mjs`

Add the scene functions **before** the `main()` function.

**Zoom clip for scene 01** — editor panel: `{ x: 0, y: 55, width: 650, height: 795 }`

- [ ] **Step 1: Add `scene01Welcome` and `scene02Editor`**

Insert before `export async function main`:

```js
const ZOOM_EDITOR = { x: 0, y: 55, width: 650, height: 795 };
const ZOOM_TOOLBAR = { x: 0, y: 0, width: 1400, height: 110 };
const ZOOM_TEMPLATE_PICKER = { x: 578, y: 0, width: 422, height: 700 };
const ZOOM_EXPORT_BTN = { x: 1150, y: 0, width: 250, height: 200 };

const CLIP_EDITOR  = { x: 0,   y: 55, width: 650, height: 795 };
const CLIP_PREVIEW = { x: 695, y: 55, width: 705, height: 795 };
const CLIP_CONTACT = { x: 0,   y: 55, width: 750, height: 420 };

async function scene01Welcome(page, frames) {
  // Zoom in: show editor with cursor positioned
  await page.locator('.CodeMirror').click();
  await page.evaluate(() => {
    const cm = window.editorAdapter?._editor;
    if (!cm) throw new Error('CodeMirror editor not ready');
    cm.focus();
    cm.setCursor({ line: 1, ch: '  name: Jane'.length });
  });
  await captureZoomedFrame(page, frames, ZOOM_EDITOR, 800);

  // Type " Marie" and zoom out once preview settles
  await waitForNextPreviewStable(page, async () => {
    for (const char of ' Marie') {
      await page.keyboard.type(char, { delay: 40 });
      await captureZoomedFrame(page, frames, ZOOM_EDITOR, 80);
    }
  });

  // Zoom out: full viewport shows updated preview
  await captureFrame(page, frames, 2000);
}

async function scene02Editor(page, frames) {
  // Show editor in initial state
  await page.locator('.CodeMirror').click();
  await page.evaluate(() => {
    const cm = window.editorAdapter?._editor;
    cm.focus();
    cm.setCursor({ line: 3, ch: 0 });
  });

  // Capture tight editor crop — no zoom technique here (preview doesn't change)
  const shoot = async (holdMs) => {
    const buf = await page.screenshot({ clip: CLIP_EDITOR });
    frames.push({ buffer: buf, holdMs });
  };

  await shoot(700);

  // Type a character to trigger autocomplete
  await page.keyboard.type('  ');
  await shoot(300);

  // Open autocomplete
  await page.keyboard.press('Control+Space');
  await page.waitForTimeout(400);
  await shoot(2000);

  // Dismiss and leave editor clean for subsequent scenes
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Z');
  await page.keyboard.press('Control+Z');
  await page.waitForTimeout(200);
}
```

- [ ] **Step 2: Verify scene references parse**

```bash
node -e "import('./scripts/generate-onboarding-gifs.mjs').then(() => console.log('ok')).catch(e => console.error(e.message))"
```

Expected: error about `scene03Preview is not defined` (or later scenes) — confirms 01 and 02 are defined.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-onboarding-gifs.mjs
git commit -m "feat: implement onboarding GIF scenes 01 (welcome) and 02 (editor)"
```

---

## Task 4: Implement scenes 03 and 05

**Files:**
- Modify: `scripts/generate-onboarding-gifs.mjs`

- [ ] **Step 1: Add `scene03Preview` and `scene05Contact`**

Insert after `scene02Editor`, before `export async function main`:

```js
async function scene03Preview(page, frames) {
  const shoot = async (holdMs) => {
    const buf = await page.screenshot({ clip: CLIP_PREVIEW });
    frames.push({ buffer: buf, holdMs });
  };

  await shoot(800);

  // Zoom in twice
  await page.click('#preview-zoom-in');
  await page.waitForTimeout(200);
  await shoot(600);

  await page.click('#preview-zoom-in');
  await page.waitForTimeout(200);
  await shoot(1200);

  // Zoom back out
  await page.click('#preview-zoom-out');
  await page.waitForTimeout(200);
  await shoot(400);

  await page.click('#preview-zoom-out');
  await page.waitForTimeout(200);
  await shoot(800);

  // Reset to 100% to leave app clean
  await page.click('#preview-zoom-label');
  await page.waitForTimeout(200);
}

async function scene05Contact(page, frames) {
  const shoot = async (holdMs) => {
    const buf = await page.screenshot({ clip: CLIP_CONTACT });
    frames.push({ buffer: buf, holdMs });
  };

  // Open Contact dropdown
  await page.click('#contact-pill');
  await page.waitForTimeout(500);
  await shoot(1000);

  // Toggle the first non-locked field off
  const toggle = page.locator('#contact-fields-body .f-toggle:not(.locked)').first();
  await toggle.click();
  await page.waitForTimeout(300);
  await shoot(900);

  // Toggle it back on
  await toggle.click();
  await page.waitForTimeout(300);
  await shoot(700);

  // Close
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}
```

- [ ] **Step 2: Verify parse**

```bash
node -e "import('./scripts/generate-onboarding-gifs.mjs').then(() => console.log('ok')).catch(e => console.error(e.message))"
```

Expected: error about `scene04Sections` or `scene06Layout` — confirms 03 and 05 are now defined.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-onboarding-gifs.mjs
git commit -m "feat: implement onboarding GIF scenes 03 (preview zoom) and 05 (contact)"
```

---

## Task 5: Implement scene 04 (sections — zoom + hide + rename)

**Files:**
- Modify: `scripts/generate-onboarding-gifs.mjs`

Scene 04 uses the zoom technique. The sample CV has these sections: `summary`, `experience`, `education`, `skills`, `projects`, `certifications`, `languages`. We target the `skills` chip.

- [ ] **Step 1: Add `scene04Sections`**

Insert before `export async function main`:

```js
async function scene04Sections(page, frames) {
  const CHIP_KEY = 'skills';

  // Zoom in on toolbar — show chips clearly
  await captureZoomedFrame(page, frames, ZOOM_TOOLBAR, 900);

  // Click chip-dot to hide the skills section, wait for preview
  await waitForNextPreviewStable(page, () =>
    page.click(`.chip[data-key="${CHIP_KEY}"] .chip-dot`)
  );
  await captureZoomedFrame(page, frames, ZOOM_TOOLBAR, 600);

  // Zoom out — preview shows section is gone
  await captureFrame(page, frames, 1800);

  // Zoom back in
  await captureZoomedFrame(page, frames, ZOOM_TOOLBAR, 700);

  // Click chip-dot again to unhide
  await waitForNextPreviewStable(page, () =>
    page.click(`.chip[data-key="${CHIP_KEY}"] .chip-dot`)
  );
  await captureZoomedFrame(page, frames, ZOOM_TOOLBAR, 500);

  // Double-click chip-name to rename
  await page.dblclick(`.chip[data-key="${CHIP_KEY}"] .chip-name`);
  await page.waitForTimeout(300);
  await captureZoomedFrame(page, frames, ZOOM_TOOLBAR, 700);

  // Clear the input and type new name
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Core Skills');
  await captureZoomedFrame(page, frames, ZOOM_TOOLBAR, 800);

  // Confirm with Enter — triggers preview update
  await waitForNextPreviewStable(page, () => page.keyboard.press('Enter'));

  // Zoom out — preview shows new section title
  await captureFrame(page, frames, 2000);

  // Restore original name to leave app clean for subsequent scenes
  await page.dblclick(`.chip[data-key="${CHIP_KEY}"] .chip-name`);
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+A');
  await page.keyboard.type('skills');
  await waitForNextPreviewStable(page, () => page.keyboard.press('Enter'));
}
```

- [ ] **Step 2: Verify parse**

```bash
node -e "import('./scripts/generate-onboarding-gifs.mjs').then(() => console.log('ok')).catch(e => console.error(e.message))"
```

Expected: error about `scene06Layout` or later — confirms scene 04 is wired.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-onboarding-gifs.mjs
git commit -m "feat: implement onboarding GIF scene 04 (sections hide + rename)"
```

---

## Task 6: Implement scene 06 (layout density — zoom technique)

**Files:**
- Modify: `scripts/generate-onboarding-gifs.mjs`

- [ ] **Step 1: Add `scene06Layout`**

Insert before `export async function main`:

```js
async function scene06Layout(page, frames) {
  // Zoom in on density buttons
  await captureZoomedFrame(page, frames, ZOOM_TOOLBAR, 800);

  // Comfortable → Balanced
  await waitForNextPreviewStable(page, () =>
    page.click('#density-group button[data-value="balanced"]')
  );
  await captureZoomedFrame(page, frames, ZOOM_TOOLBAR, 500);
  await captureFrame(page, frames, 1500);

  // Balanced → Compact
  await captureZoomedFrame(page, frames, ZOOM_TOOLBAR, 500);
  await waitForNextPreviewStable(page, () =>
    page.click('#density-group button[data-value="compact"]')
  );
  await captureZoomedFrame(page, frames, ZOOM_TOOLBAR, 500);
  await captureFrame(page, frames, 1500);

  // Restore comfortable to leave app clean
  await waitForNextPreviewStable(page, () =>
    page.click('#density-group button[data-value="comfortable"]')
  );
}
```

- [ ] **Step 2: Verify parse**

```bash
node -e "import('./scripts/generate-onboarding-gifs.mjs').then(() => console.log('ok')).catch(e => console.error(e.message))"
```

Expected: error about `scene07aTemplatePicker` or later.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-onboarding-gifs.mjs
git commit -m "feat: implement onboarding GIF scene 06 (layout density)"
```

---

## Task 7: Implement scenes 07a and 07b

**Files:**
- Modify: `scripts/generate-onboarding-gifs.mjs`

Scene 07a uses the zoom technique with two template switches. Uses `classic` and `boardroom` — both present in `frontend/assets/template-previews/`. Scene 07b is a simple tab switch with a focused crop.

- [ ] **Step 1: Add `scene07aTemplatePicker` and `scene07bSettings`**

Insert before `export async function main`:

```js
async function scene07aTemplatePicker(page, frames) {
  // Open template picker
  await page.click('#template-trigger');
  await page.waitForTimeout(300);

  // Zoom in on picker panel
  await captureZoomedFrame(page, frames, ZOOM_TEMPLATE_PICKER, 900);

  // Click 'classic' template
  await waitForNextPreviewStable(page, () =>
    page.click('.tpl-card[data-name="classic"]')
  );
  await captureZoomedFrame(page, frames, ZOOM_TEMPLATE_PICKER, 700);

  // Zoom out — preview shows classic template
  await captureFrame(page, frames, 1700);

  // Zoom back in, click 'boardroom'
  await captureZoomedFrame(page, frames, ZOOM_TEMPLATE_PICKER, 600);
  await waitForNextPreviewStable(page, () =>
    page.click('.tpl-card[data-name="boardroom"]')
  );
  await captureZoomedFrame(page, frames, ZOOM_TEMPLATE_PICKER, 700);

  // Zoom out — preview shows boardroom template
  await captureFrame(page, frames, 1700);

  // Restore original template — close picker first, then reopen to select trackline
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.click('#template-trigger');
  await page.waitForTimeout(300);
  await waitForNextPreviewStable(page, () =>
    page.click('.tpl-card[data-name="trackline"]')
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

async function scene07bSettings(page, frames) {
  const shoot = async (holdMs) => {
    const buf = await page.screenshot({ clip: CLIP_EDITOR });
    frames.push({ buffer: buf, holdMs });
  };

  // Show resume tab baseline
  await shoot(700);

  // Switch to settings tab
  await page.click('#file-tab-settings');
  await page.waitForTimeout(500);
  await shoot(2000);

  // Switch back to resume tab
  await page.click('#file-tab-resume');
  await page.waitForTimeout(300);
  await shoot(600);
}
```

- [ ] **Step 2: Verify parse**

```bash
node -e "import('./scripts/generate-onboarding-gifs.mjs').then(() => console.log('ok')).catch(e => console.error(e.message))"
```

Expected: error about `scene08Export` — confirms 07a and 07b are wired.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-onboarding-gifs.mjs
git commit -m "feat: implement onboarding GIF scenes 07a (template picker) and 07b (settings tab)"
```

---

## Task 8: Implement scene 08 (export — zoom technique)

**Files:**
- Modify: `scripts/generate-onboarding-gifs.mjs`

- [ ] **Step 1: Add `scene08Export`**

Insert before `export async function main`:

```js
async function scene08Export(page, frames) {
  // Zoom in on export button area
  await captureZoomedFrame(page, frames, ZOOM_EXPORT_BTN, 800);

  // Open export dropdown
  await page.click('#export-trigger');
  await page.waitForTimeout(300);
  await captureZoomedFrame(page, frames, ZOOM_EXPORT_BTN, 1200);

  // Click PDF option — triggers filename modal (full page overlay)
  await page.click('.export-option[data-export="pdf"]');
  await page.waitForFunction(() => {
    const modal = document.getElementById('filename-modal');
    return Boolean(modal?.classList.contains('open'));
  }, null, { timeout: 10000 });

  // Zoom out — filename modal visible over full page
  await captureFrame(page, frames, 2400);

  // Close modal to leave app clean
  await page.click('#filename-modal-cancel').catch(() =>
    page.keyboard.press('Escape')
  );
  await page.waitForTimeout(300);
}
```

- [ ] **Step 2: Verify the module fully loads with no undefined references**

```bash
node -e "import('./scripts/generate-onboarding-gifs.mjs').then(() => console.log('all scenes defined')).catch(e => console.error(e.message))"
```

Expected: `all scenes defined`

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-onboarding-gifs.mjs
git commit -m "feat: implement onboarding GIF scene 08 (export)"
```

---

## Task 9: Update `onboarding.js` and `scripts/README.md`

**Files:**
- Modify: `frontend/onboarding.js`
- Modify: `scripts/README.md`

- [ ] **Step 1: Change `.png` → `.gif` in `frontend/onboarding.js`**

In `frontend/onboarding.js`, all 9 STEPS entries have an `img` field pointing to a `.png`. Change each one:

```
img: `${ASSET_BASE}/01-welcome.png`   →   img: `${ASSET_BASE}/01-welcome.gif`
img: `${ASSET_BASE}/02-editor.png`   →   img: `${ASSET_BASE}/02-editor.gif`
img: `${ASSET_BASE}/03-preview.png`  →   img: `${ASSET_BASE}/03-preview.gif`
img: `${ASSET_BASE}/04-sections-only.png` → img: `${ASSET_BASE}/04-sections-only.gif`
img: `${ASSET_BASE}/05-contact.png`  →   img: `${ASSET_BASE}/05-contact.gif`
img: `${ASSET_BASE}/06-layout.png`   →   img: `${ASSET_BASE}/06-layout.gif`
img: `${ASSET_BASE}/07a-template-picker.png` → img: `${ASSET_BASE}/07a-template-picker.gif`
img: `${ASSET_BASE}/07b-settings-yaml.png` → img: `${ASSET_BASE}/07b-settings-yaml.gif`
img: `${ASSET_BASE}/08-export.png`   →   img: `${ASSET_BASE}/08-export.gif`
```

No other changes to `onboarding.js`. The `<img>` tag renders GIFs natively; `object-fit: cover` and `object-fit: contain` work identically.

- [ ] **Step 2: Add documentation to `scripts/README.md`**

Insert a new section after the `## generate-readme-preview-gif.mjs` section and before `## generate-template-previews.sh`:

```markdown
---

## generate-onboarding-gifs.mjs

Generates 9 animated GIFs used in the onboarding modal.  
Launches a real browser via Playwright, demonstrates each feature in action (typing, section management, template switching, etc.), then encodes each sequence of frames as a GIF.

Steps that trigger a PDF preview re-render use a zoom-in/zoom-out technique: a tight crop of the relevant UI element is digitally scaled up to show the interaction clearly, then a full-viewport frame reveals the updated preview.

**One-time setup**

```bash
npm install playwright pngjs gifenc
npx playwright install chromium
```

**Run**

```bash
# Start the app server at http://localhost:8000 first
node scripts/generate-onboarding-gifs.mjs
```

To use a different server address:

```bash
MKCV_CAPTURE_BASE_URL=http://localhost:3000 node scripts/generate-onboarding-gifs.mjs
```

**Output:** 9 GIF files under `frontend/assets/onboarding/`

| File | Content |
|------|---------|
| `01-welcome.gif` | Type a name edit → preview updates |
| `02-editor.gif` | YAML editing + autocomplete popup |
| `03-preview.gif` | Zoom in / zoom out on the PDF preview |
| `04-sections-only.gif` | Hide a section chip + rename via double-click → preview updates |
| `05-contact.gif` | Contact dropdown: toggle a field |
| `06-layout.gif` | Density: Comfortable → Balanced → Compact → preview updates |
| `07a-template-picker.gif` | Switch between two templates → preview updates |
| `07b-settings-yaml.gif` | Switch to settings.yaml tab |
| `08-export.gif` | Open export menu → PDF → filename modal |
```

- [ ] **Step 3: Commit**

```bash
git add frontend/onboarding.js scripts/README.md
git commit -m "feat: switch onboarding images to GIFs, document generate-onboarding-gifs.mjs"
```

---

## Task 10: End-to-end verification

**Files:** None (manual run)

- [ ] **Step 1: Start the app server**

In a separate terminal:
```bash
python3 -m http.server 8000 --directory frontend
# or whatever server the project uses
```

Confirm the app loads at `http://localhost:8000`.

- [ ] **Step 2: Run the script**

```bash
node scripts/generate-onboarding-gifs.mjs
```

Expected output (one line per GIF as it's written):
```
Wrote frontend/assets/onboarding/01-welcome.gif
Wrote frontend/assets/onboarding/02-editor.gif
Wrote frontend/assets/onboarding/03-preview.gif
Wrote frontend/assets/onboarding/04-sections-only.gif
Wrote frontend/assets/onboarding/05-contact.gif
Wrote frontend/assets/onboarding/06-layout.gif
Wrote frontend/assets/onboarding/07a-template-picker.gif
Wrote frontend/assets/onboarding/07b-settings-yaml.gif
Wrote frontend/assets/onboarding/08-export.gif
```

- [ ] **Step 3: Verify GIF files exist and are non-zero**

```bash
ls -lh frontend/assets/onboarding/*.gif
```

Expected: 9 files, each >10 KB.

- [ ] **Step 4: Open the app and verify onboarding modal**

Open `http://localhost:8000` in a browser. Clear `localStorage` to see the onboarding modal:

```js
// In browser devtools console:
localStorage.removeItem('mkcv_onboarding_seen'); location.reload();
```

Step through all 9 onboarding steps and confirm:
- Each step shows an animated GIF (not a static image)
- The zoom-in/out steps (01, 04, 06, 07a, 08) show both the interaction and the preview change
- The `ob-visual--strip` steps (04, 06) display correctly in the `160px` modal area

- [ ] **Step 5: Commit final verification note**

```bash
git add frontend/assets/onboarding/
git commit -m "feat: add generated onboarding GIFs"
```
