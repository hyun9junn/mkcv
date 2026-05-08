# README Preview GIF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static README preview image with a deterministic animated `preview.gif` that shows YAML edit -> PDF refresh -> template switch -> export menu.

**Architecture:** Keep the product's default preview behavior unchanged and add a narrow `?capture=gif` override inside `frontend/preview.js` so README capture runs move faster. Generate the GIF from a checked-in Playwright script that seeds browser storage with `scripts/sample-cv.yaml`, captures a small storyboard of frames, and encodes them into a committed root-level `preview.gif`.

**Tech Stack:** Vanilla JS, DOM, Playwright, Node.js `node:test`, `pngjs`, `gifenc`

---

## File Map

| Status | File | Responsibility |
|---|---|---|
| Modify | `frontend/preview.js` | Read `window.location.search` and shorten preview debounce only for `?capture=gif` |
| Modify | `tests/test_preview_scheduler.js` | Lock down normal debounce vs capture-mode debounce behavior |
| Create | `scripts/generate-readme-preview-gif.mjs` | Seed deterministic browser state, run the README storyboard, capture frames, encode `preview.gif` |
| Create | `tests/test_generate_readme_preview_gif.js` | Verify script exports deterministic seed/config/storyboard helpers |
| Modify | `package.json` | Record dev dependencies needed by the generator script |
| Modify | `package-lock.json` | Lock the dependency graph for repeatable capture runs |
| Create | `tests/test_readme_preview_asset.js` | Verify README points at `preview.gif` and the generated asset exists |
| Modify | `README.md` | Replace `preview.png` embed with `preview.gif` |
| Create | `preview.gif` | Final committed animated README asset |

`scripts/sample-cv.yaml` remains read-only input for the generator. Do not change the sample data in this plan.

---

## Task 1: Preview capture mode in `frontend/preview.js`

**Files:**
- Modify: `frontend/preview.js`
- Modify: `tests/test_preview_scheduler.js`

- [ ] **Step 1: Add a failing capture-mode debounce test**

In `tests/test_preview_scheduler.js`, change the harness signature so tests can control `window.location.search`, then add a new capture-mode test.

Update `createHarness` near the top of the file:

```js
function createHarness({ search = '' } = {}) {
  const timers = createTimerHarness();
  const domReadyCallbacks = [];
  const elements = new Map([
    ['preview-frame', createElement('div')],
    ['preview-loading', createElement('div')],
    ['preview-error', createElement('div')],
    ['preview-zoom-label', createElement('span')],
  ]);
  const editorCallbacks = [];
  const fetchCalls = [];
  const renderBuffers = [];
  const fetchQueue = [];
  const counters = { pageRenderCalls: 0 };

  elements.get('preview-loading').style.display = 'none';
  elements.get('preview-error').style.display = 'none';

  const context = {
    console,
    Math,
    JSON,
    Date,
    ArrayBuffer,
    Uint8Array,
    TextEncoder,
    TextDecoder,
    URLSearchParams,
    location: { search },
    setTimeout: timers.setTimeout.bind(timers),
    clearTimeout: timers.clearTimeout.bind(timers),
    fetch(url, options) {
      const deferred = createDeferred();
      fetchCalls.push({ url, options, deferred });
      fetchQueue.push(deferred);
      return deferred.promise;
    },
    document: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      createElement(tagName) {
        return createElement(tagName);
      },
      addEventListener(type, callback) {
        if (type === 'DOMContentLoaded') domReadyCallbacks.push(callback);
      },
    },
    window: null,
    pdfjsLib: {
      GlobalWorkerOptions: {},
      getDocument({ data }) {
        renderBuffers.push(data);
        return {
          promise: Promise.resolve({
            numPages: 1,
            destroy() {},
            async getPage() {
              return {
                getViewport({ scale }) {
                  return { width: 612 * scale, height: 792 * scale };
                },
                render() {
                  counters.pageRenderCalls += 1;
                  return { promise: Promise.resolve() };
                },
              };
            },
          }),
        };
      },
    },
    sectionsState: {
      getVisibleOrder(yaml) {
        return [`visible:${yaml}`];
      },
      getOrderedFilteredYaml(yaml) {
        return `ordered:${yaml}`;
      },
    },
    settingsSync: {
      activeTab: 'resume',
      getSettings() {
        return {
          sections: [
            { key: 'summary', title: 'Summary' },
          ],
        };
      },
    },
    app: {
      state: {
        yaml: 'yaml-initial',
        template: 'classic',
        density: 'balanced',
        font_scale: 'normal',
        link_display: 'both',
        personal_fields: [{ key: 'email', visible: true }],
      },
    },
    editorAdapter: {
      onChange(callback) {
        editorCallbacks.push(callback);
      },
      consumeSuppressedPreviewRefresh() {
        return false;
      },
    },
    AbortController: class AbortController {
      constructor() {
        this.signal = { aborted: false };
      }
      abort() {
        this.signal.aborted = true;
      }
    },
  };
  context.window = context;

  function boot() {
    const source = fs.readFileSync('frontend/preview.js', 'utf8');
    vm.runInNewContext(source, context, { filename: 'frontend/preview.js' });
    for (const callback of domReadyCallbacks) {
      callback();
    }
  }

  return {
    context,
    timers,
    editorCallbacks,
    fetchCalls,
    fetchQueue,
    renderBuffers,
    counters,
    elements,
    boot,
  };
}
```

Append this new test below the existing debounce test:

```js
test('capture=gif lowers the debounce window for README capture runs', async () => {
  const harness = createHarness({ search: '?capture=gif' });
  harness.boot();

  harness.timers.advanceBy(200);
  await flushMicrotasks();
  await settleRequest(
    harness.fetchCalls[0],
    createFetchResponse({ arrayBufferData: new ArrayBuffer(4) })
  );
  await flushMicrotasks();

  harness.context.app.state.yaml = 'yaml-fast';
  harness.editorCallbacks[0]();
  harness.timers.advanceBy(199);
  await flushMicrotasks();

  assert.equal(harness.fetchCalls.length, 1);

  harness.timers.advanceBy(1);
  await flushMicrotasks();

  assert.equal(harness.fetchCalls.length, 2);
  assert.equal(JSON.parse(harness.fetchCalls[1].options.body).yaml, 'ordered:yaml-fast');
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run:

```bash
node --test tests/test_preview_scheduler.js
```

Expected: the new `capture=gif lowers the debounce window...` test FAILS because `frontend/preview.js` still waits the normal `900 ms`.

- [ ] **Step 3: Implement the capture-only debounce override**

In `frontend/preview.js`, replace the fixed debounce constant near the top of the module:

```js
const DEFAULT_PREVIEW_DEBOUNCE_MS = 900;
const GIF_CAPTURE_PREVIEW_DEBOUNCE_MS = 200;

function getPreviewDebounceMs() {
  try {
    const params = new URLSearchParams(window.location?.search || '');
    if (params.get('capture') === 'gif') return GIF_CAPTURE_PREVIEW_DEBOUNCE_MS;
  } catch (_) {
    // Fall through to the default debounce when URL parsing is unavailable.
  }
  return DEFAULT_PREVIEW_DEBOUNCE_MS;
}

const PREVIEW_DEBOUNCE_MS = getPreviewDebounceMs();
```

The surrounding declarations should still begin like this:

```js
const preview = (() => {
  const container = document.getElementById("preview-frame");
  const loading = document.getElementById("preview-loading");
  const errorEl = document.getElementById("preview-error");
  const DEFAULT_PREVIEW_DEBOUNCE_MS = 900;
  const GIF_CAPTURE_PREVIEW_DEBOUNCE_MS = 200;

  function getPreviewDebounceMs() {
    try {
      const params = new URLSearchParams(window.location?.search || '');
      if (params.get('capture') === 'gif') return GIF_CAPTURE_PREVIEW_DEBOUNCE_MS;
    } catch (_) {
      // Fall through to the default debounce when URL parsing is unavailable.
    }
    return DEFAULT_PREVIEW_DEBOUNCE_MS;
  }

  const PREVIEW_DEBOUNCE_MS = getPreviewDebounceMs();
  let timer = null;
  let activePdf = null;
  let zoomLevel = 1.0;
```

Do not change any other scheduling or request-coalescing behavior in this task.

- [ ] **Step 4: Run the scheduler tests again**

Run:

```bash
node --test tests/test_preview_scheduler.js
```

Expected: PASS. The existing default-debounce test still passes, and the new capture-mode test now passes at `200 ms`.

- [ ] **Step 5: Commit the preview capture-mode change**

```bash
git add frontend/preview.js tests/test_preview_scheduler.js
git commit -m "feat(preview): add gif capture debounce override"
```

---

## Task 2: Add the deterministic README GIF generator

**Files:**
- Create: `scripts/generate-readme-preview-gif.mjs`
- Create: `tests/test_generate_readme_preview_gif.js`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Write failing tests for the generator's deterministic helpers**

Create `tests/test_generate_readme_preview_gif.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule() {
  const href = pathToFileURL(path.resolve('scripts/generate-readme-preview-gif.mjs')).href;
  return import(`${href}?t=${Date.now()}`);
}

test('buildSeedStorage returns the README capture localStorage keys', async () => {
  const mod = await loadModule();
  const yaml = 'personal:\\n  name: Jane Smith\\n';

  assert.deepEqual(mod.buildSeedStorage(yaml), {
    mkcv_onboarding_seen: '1',
    mkcv_theme: 'light',
    'mkcv:default:resume.yaml': yaml,
  });
});

test('buildStoryboard returns the README beats in a fixed order', async () => {
  const mod = await loadModule();
  const storyboard = mod.buildStoryboard();

  assert.deepEqual(
    storyboard.map((beat) => beat.name),
    [
      'initial-state',
      'typed-name',
      'preview-settled',
      'template-picker-open',
      'template-applied',
      'export-open',
    ]
  );
  assert.equal(storyboard.find((beat) => beat.name === 'template-applied').template, 'trackline');
  assert.equal(storyboard.at(-1).holdMs, 1200);
});

test('resolveCaptureOptions points at ?capture=gif and preview.gif', async () => {
  const mod = await loadModule();
  const opts = mod.resolveCaptureOptions({ baseUrl: 'http://localhost:8000' });

  assert.equal(opts.url, 'http://localhost:8000/?capture=gif');
  assert.deepEqual(opts.viewport, { width: 1400, height: 860 });
  assert.deepEqual(opts.clip, { x: 0, y: 0, width: 1400, height: 860 });
  assert.equal(opts.targetTemplate, 'trackline');
  assert.equal(opts.outputPath, path.resolve('preview.gif'));
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run:

```bash
node --test tests/test_generate_readme_preview_gif.js
```

Expected: FAIL because `scripts/generate-readme-preview-gif.mjs` does not exist yet.

- [ ] **Step 3: Implement the generator script with exported helpers and a direct-run entrypoint**

Create `scripts/generate-readme-preview-gif.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const VIEWPORT = { width: 1400, height: 860 };
const CLIP = { x: 0, y: 0, width: 1400, height: 860 };
const TARGET_TEMPLATE = 'trackline';
const DEFAULT_BASE_URL = process.env.MKCV_CAPTURE_BASE_URL || 'http://localhost:8000';
const SAMPLE_RESUME_PATH = path.resolve('scripts/sample-cv.yaml');

export function buildSeedStorage(resumeYaml) {
  return {
    mkcv_onboarding_seen: '1',
    mkcv_theme: 'light',
    'mkcv:default:resume.yaml': resumeYaml,
  };
}

export function buildStoryboard() {
  return [
    { name: 'initial-state', holdMs: 600 },
    { name: 'typed-name', holdMs: 100 },
    { name: 'preview-settled', holdMs: 900 },
    { name: 'template-picker-open', holdMs: 350 },
    { name: 'template-applied', holdMs: 900, template: TARGET_TEMPLATE },
    { name: 'export-open', holdMs: 1200 },
  ];
}

export function resolveCaptureOptions({
  baseUrl = DEFAULT_BASE_URL,
  outputPath = path.resolve('preview.gif'),
} = {}) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  return {
    url: `${normalizedBaseUrl}/?capture=gif`,
    outputPath,
    viewport: { ...VIEWPORT },
    clip: { ...CLIP },
    targetTemplate: TARGET_TEMPLATE,
  };
}

async function waitForPreviewStable(page) {
  await page.waitForFunction(() => {
    const loading = document.getElementById('preview-loading');
    const frame = document.getElementById('preview-frame');
    return Boolean(
      loading &&
      loading.style.display === 'none' &&
      frame &&
      frame.querySelectorAll('canvas').length > 0
    );
  }, null, { timeout: 30000 });
}

async function captureFrame(page, frames, clip, holdMs) {
  const buffer = await page.screenshot({ clip });
  frames.push({ buffer, holdMs });
}

async function typeNameEdit(page, frames, clip, beat) {
  await page.evaluate(() => {
    const cm = window.editorAdapter?._editor;
    if (!cm) throw new Error('CodeMirror editor not ready');
    cm.focus();
    cm.setCursor({ line: 1, ch: '  name: Jane'.length });
  });
  await page.locator('.CodeMirror').click();

  for (const char of ' Marie') {
    await page.keyboard.type(char, { delay: 40 });
    await captureFrame(page, frames, clip, beat.holdMs);
  }
}

async function openTemplateAndApply(page, frames, capture, openBeat, appliedBeat) {
  await page.click('#template-trigger');
  await page.waitForTimeout(250);
  await captureFrame(page, frames, capture.clip, openBeat.holdMs);

  await page.click(`.tpl-card[data-name="${capture.targetTemplate}"]`);
  await waitForPreviewStable(page);
  await captureFrame(page, frames, capture.clip, appliedBeat.holdMs);
}

async function openExport(page, frames, clip, beat) {
  await page.click('#export-trigger');
  await page.waitForTimeout(250);
  await captureFrame(page, frames, clip, beat.holdMs);
}

async function encodeGif(frames, outputPath) {
  const { PNG } = await import('pngjs');
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');

  const gif = GIFEncoder();

  for (const frame of frames) {
    const png = PNG.sync.read(frame.buffer);
    const palette = quantize(png.data, 256);
    const pixels = applyPalette(png.data, palette);
    gif.writeFrame(pixels, png.width, png.height, {
      palette,
      delay: Math.max(1, Math.round(frame.holdMs / 10)),
    });
  }

  gif.finish();
  fs.writeFileSync(outputPath, Buffer.from(gif.bytes()));
}

export async function main({
  baseUrl = DEFAULT_BASE_URL,
  outputPath = path.resolve('preview.gif'),
} = {}) {
  const { chromium } = await import('playwright');
  const resumeYaml = fs.readFileSync(SAMPLE_RESUME_PATH, 'utf8');
  const seed = buildSeedStorage(resumeYaml);
  const capture = resolveCaptureOptions({ baseUrl, outputPath });
  const storyboard = buildStoryboard();
  const initialBeat = storyboard[0];
  const typedBeat = storyboard[1];
  const previewBeat = storyboard[2];
  const templateOpenBeat = storyboard[3];
  const templateAppliedBeat = storyboard[4];
  const exportBeat = storyboard[5];
  const frames = [];

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: capture.viewport, deviceScaleFactor: 1 });

    await page.addInitScript((storage) => {
      const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
      keys.filter((key) => key && key.startsWith('mkcv')).forEach((key) => localStorage.removeItem(key));
      Object.entries(storage).forEach(([key, value]) => localStorage.setItem(key, value));
    }, seed);

    await page.goto(capture.url, { waitUntil: 'networkidle', timeout: 30000 });
    await waitForPreviewStable(page);
    await captureFrame(page, frames, capture.clip, initialBeat.holdMs);

    await typeNameEdit(page, frames, capture.clip, typedBeat);
    await waitForPreviewStable(page);
    await captureFrame(page, frames, capture.clip, previewBeat.holdMs);

    await openTemplateAndApply(page, frames, capture, templateOpenBeat, templateAppliedBeat);
    await openExport(page, frames, capture.clip, exportBeat);

    await encodeGif(frames, capture.outputPath);
    console.log(`Wrote ${capture.outputPath}`);
  } finally {
    await browser.close();
  }
}

const isDirectRun = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
```

The important boundaries are:

- keep deterministic values (`viewport`, `clip`, target template, output path) in exported helpers
- keep capture orchestration inside `main()`
- lazy-import `playwright`, `pngjs`, and `gifenc` so the test file can import the module without running the browser capture path

- [ ] **Step 4: Run the helper tests**

Run:

```bash
node --test tests/test_generate_readme_preview_gif.js
```

Expected: PASS. The module imports cleanly and all three helper-level tests pass.

- [ ] **Step 5: Add the generator dependencies to the repo**

Run:

```bash
npm install --save-dev playwright gifenc pngjs
```

Expected: `package.json` gains a `devDependencies` block, `package-lock.json` is updated, and `npm` reports the new packages were added successfully.

- [ ] **Step 6: Commit the generator code and dependency manifests**

```bash
git add scripts/generate-readme-preview-gif.mjs tests/test_generate_readme_preview_gif.js package.json package-lock.json
git commit -m "feat: add README preview gif generator"
```

---

## Task 3: Generate the asset and switch README to `preview.gif`

**Files:**
- Create: `tests/test_readme_preview_asset.js`
- Modify: `README.md`
- Create: `preview.gif`

- [ ] **Step 1: Add a failing README asset test**

Create `tests/test_readme_preview_asset.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('README embeds preview.gif instead of preview.png', () => {
  const readme = fs.readFileSync('README.md', 'utf8');
  assert.match(readme, /!\[Preview\]\(\.\/preview\.gif\)/);
  assert.doesNotMatch(readme, /!\[Preview\]\(\.\/preview\.png\)/);
});

test('preview.gif exists at the repository root', () => {
  assert.ok(fs.existsSync('preview.gif'));
  const stat = fs.statSync('preview.gif');
  assert.ok(stat.size > 0);
});
```

- [ ] **Step 2: Run the asset test to confirm it fails**

Run:

```bash
node --test tests/test_readme_preview_asset.js
```

Expected: FAIL because `README.md` still references `preview.png` and `preview.gif` does not exist yet.

- [ ] **Step 3: Update the README embed**

In `README.md`, change the hero image line near the top:

```md
-![Preview](./preview.png)
+![Preview](./preview.gif)
```

- [ ] **Step 4: Install Chromium, run the app locally, and generate `preview.gif`**

Install the Playwright browser binary once:

```bash
npx playwright install chromium
```

Expected: Playwright downloads or confirms an existing Chromium build.

Start the app in a separate terminal using the repo's documented local-dev flow:

```bash
source .venv/bin/activate
uvicorn backend.main:app --reload
```

Expected: Uvicorn starts and serves the app at `http://localhost:8000`.

With the app running, generate the GIF in the working terminal:

```bash
node scripts/generate-readme-preview-gif.mjs
```

Expected: the script prints `Wrote /abs/path/to/preview.gif` and creates a non-empty root-level `preview.gif`.

- [ ] **Step 5: Run the focused verification suite**

Run:

```bash
node --test tests/test_preview_scheduler.js tests/test_generate_readme_preview_gif.js tests/test_readme_preview_asset.js
file preview.gif
```

Expected:

- all three `node --test` suites PASS
- `file preview.gif` reports `GIF image data`

- [ ] **Step 6: Manually inspect the generated GIF**

Serve the repo root:

```bash
python -m http.server 8765
```

Expected: `Serving HTTP on ... port 8765`

Then open `http://localhost:8765/preview.gif` in a browser and confirm:

- the name edit is visible in the editor
- the PDF header visibly changes after the edit
- the template switch is obvious
- the export menu is visible in the final held frames

Stop the server with `Ctrl-C` after the check.

- [ ] **Step 7: Commit the README asset swap**

```bash
git add README.md tests/test_readme_preview_asset.js preview.gif
git commit -m "docs: replace README preview with animated gif"
```
