# Phase 2 — Frontend Bundler & ESM Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Vite as the frontend bundler, convert 16 IIFE/window-global JS files in `frontend/` to ES modules, vendor 5 CDN libraries as npm packages, extract inline CSS, and rewrite JS tests to import ESMs directly.

**Architecture:** Vite root is `frontend/`. Source code lives under `frontend/src/`. `index.html` contains exactly one `<script type="module" src="/src/main.js">` and no inline `<style>` or CDN `<script>` tags. `main.js` is the explicit init order; modules import each other directly. JS tests load source via dynamic `await import()` under happy-dom globals instead of `vm.runInContext` with hand-stubbed sandboxes.

**Tech Stack:** Vite 5, ES modules, happy-dom 14, npm-vendored CodeMirror 5 + js-yaml 4 + jszip 3 + pdfjs-dist 3. Existing FastAPI backend untouched except StaticFiles mount.

---

## Conventions used throughout this plan

**Conversion pattern (every source file):**

Before:
```js
const foo = (() => {
  function bar() { /* ... */ }
  return { bar };
})();
window.foo = foo;
```

After:
```js
export function bar() { /* ... */ }
// (collected exports live in main.js; window globals managed centrally)
```

**Compat shim pattern (in `main.js`):**

While not all callers have been converted, expose converted exports on `window` so unconverted scripts still find them:

```js
import { bar } from './foo.js';
window.foo = { bar };   // compat shim — removed once all callers use imports
```

**Test conversion pattern (every test file affected by a conversion):**

Before:
```js
const vm = require('node:vm');
const src = fs.readFileSync('frontend/src/foo.js', 'utf8');
const ctx = vm.createContext({ window: {}, document: { /* stub */ } });
vm.runInContext(src, ctx);
ctx.window.foo.bar();
```

After:
```js
test('bar does thing', async () => {
  const { bar } = await import('../frontend/src/foo.js');
  assert.equal(bar(), expected);
});
```

DOM stubs come from happy-dom (registered globally in `tests/setup-dom.js`). Per-test DOM construction uses `document.createElement` instead of object stubs.

**Verification command used after every task:**
```
npm test
```
Must exit 0. Where a manual smoke is required, the task says so explicitly.

---

## Task 1: Tooling foundation — Vite, happy-dom, npm packages, scripts, gitignore

**Files:**
- Create: `vite.config.js`
- Create: `tests/setup-dom.js`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `backend/main.py`

- [ ] **Step 1: Install npm packages**

```bash
npm install --save-dev vite@^5.0.0 @happy-dom/global-registrator@^14.0.0
npm install codemirror@5.65.16 js-yaml@4.1.0 jszip@3.10.1 pdfjs-dist@3.11.174
```

Expected: `package.json` gets entries in `devDependencies` and `dependencies`; `package-lock.json` is created.

- [ ] **Step 2: Create Vite config**

Create `vite.config.js` at the repo root:

```js
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'frontend',
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'frontend/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
});
```

- [ ] **Step 3: Create happy-dom setup file for tests**

Create `tests/setup-dom.js`:

```js
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'http://localhost' });

// Stub features happy-dom does not implement that the app touches.
if (typeof globalThis.fetch !== 'function') {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
}
```

- [ ] **Step 4: Update `package.json` scripts**

Replace the `scripts` block:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "npm run test:js && npm run test:py",
  "test:js": "node --test --import ./tests/setup-dom.js \"tests/test_*.js\" \"tests/*.test.mjs\"",
  "test:py": "pytest"
}
```

- [ ] **Step 5: Update `.gitignore`**

Append:

```
node_modules/
frontend/dist/
```

- [ ] **Step 6: Update `backend/main.py` to prefer `frontend/dist/` over `frontend/`**

Open `backend/main.py`. Replace the existing static-mount block at the bottom with:

```python
# Serve frontend — must come after all API routes
dist_dir = Path("frontend/dist")
src_dir = Path("frontend")
if dist_dir.exists():
    app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="frontend")
elif src_dir.exists():
    app.mount("/", StaticFiles(directory=str(src_dir), html=True), name="frontend")
```

This keeps dev parity for backend-only contributors while making `npm run build` the production source of truth.

- [ ] **Step 7: Verify existing tests still pass under happy-dom registration**

Run:
```
npm test
```
Expected: all currently-green tests still pass. happy-dom registers globals on `globalThis`; existing tests use `vm.createContext` with their own stubs, so the new globals do not conflict.

If a test fails because a global it previously stubbed now has a different shape under happy-dom (e.g. `document.getElementById` returning a real `null` vs the stub's return value), update the test's per-test setup to match what happy-dom provides. Do not undo happy-dom registration.

- [ ] **Step 8: Verify `npm run build` succeeds with current HTML**

Run:
```
npm run build
```
Expected: exits 0; creates `frontend/dist/index.html` plus copied assets. CDN script tags are preserved in the output as-is (Vite doesn't try to bundle absolute URLs). `frontend/dist/` is gitignored.

If the build fails because Vite can't resolve some asset path, that's a pre-existing path bug — fix it in `index.html` (paths like `lib/show-hint.css` may need to become `/lib/show-hint.css` for Vite's resolution).

- [ ] **Step 9: Commit**

```bash
git add vite.config.js tests/setup-dom.js package.json package-lock.json .gitignore backend/main.py
git commit -m "phase 2: install Vite + happy-dom tooling, prep StaticFiles mount"
```

---

## Task 2: Move frontend JS and CSS sources into `frontend/src/`

**Files:**
- Move: 16 files from `frontend/*.js` → `frontend/src/*.js`
- Move: `frontend/yaml-autocomplete.css` → `frontend/src/yaml-autocomplete.css`
- Modify: `frontend/index.html` (script and link paths)
- Modify: 15 test files in `tests/` (source-path references)

- [ ] **Step 1: Move source files with `git mv`**

```bash
mkdir -p frontend/src
git mv frontend/app.js frontend/src/app.js
git mv frontend/contact-ui.js frontend/src/contact-ui.js
git mv frontend/editor-adapter.js frontend/src/editor-adapter.js
git mv frontend/export.js frontend/src/export.js
git mv frontend/file-sync.js frontend/src/file-sync.js
git mv frontend/layout-controls.js frontend/src/layout-controls.js
git mv frontend/onboarding.js frontend/src/onboarding.js
git mv frontend/preview.js frontend/src/preview.js
git mv frontend/sections-state.js frontend/src/sections-state.js
git mv frontend/sections-ui.js frontend/src/sections-ui.js
git mv frontend/settings-engine.js frontend/src/settings-engine.js
git mv frontend/settings-sync.js frontend/src/settings-sync.js
git mv frontend/templates.js frontend/src/templates.js
git mv frontend/validator.js frontend/src/validator.js
git mv frontend/yaml-autocomplete.js frontend/src/yaml-autocomplete.js
git mv frontend/yaml-backup.js frontend/src/yaml-backup.js
git mv frontend/yaml-autocomplete.css frontend/src/yaml-autocomplete.css
```

Verify:
```
ls frontend/src/ | wc -l   # should be 17 (16 JS + 1 CSS)
```

- [ ] **Step 2: Update `frontend/index.html` script and link paths**

Open `frontend/index.html`. In the head section, change:
```html
<link rel="stylesheet" href="yaml-autocomplete.css" />
```
to:
```html
<link rel="stylesheet" href="src/yaml-autocomplete.css" />
```

In the body, change every `<script src="FILE.js">` to `<script src="src/FILE.js">`. The full list of changes (16 of them, plus `lib/show-hint.js` unchanged for now):

```html
<script src="src/app.js"></script>
<script src="lib/show-hint.js"></script>
<script src="src/yaml-autocomplete.js"></script>
<script src="src/settings-engine.js"></script>
<script src="src/editor-adapter.js"></script>
<script src="src/file-sync.js"></script>
<script src="src/sections-state.js"></script>
<script src="src/sections-ui.js"></script>
<script src="src/contact-ui.js"></script>
<script src="src/templates.js"></script>
<script src="src/validator.js"></script>
<script src="src/preview.js"></script>
<script src="src/export.js"></script>
<script src="src/layout-controls.js"></script>
<script src="src/settings-sync.js"></script>
<script src="src/yaml-backup.js"></script>
<script src="src/onboarding.js"></script>
```

`lib/show-hint.js` stays as-is for now (will be replaced via npm in Task 3).

- [ ] **Step 3: Update source-path references in tests**

In every file under `tests/`, replace the path prefix `'frontend/` with `'frontend/src/` where it refers to a moved JS or CSS file. Use:

```bash
grep -rl "frontend/[a-z]" tests/ | xargs sed -i '' \
  -e "s|'frontend/app\.js'|'frontend/src/app.js'|g" \
  -e "s|'frontend/contact-ui\.js'|'frontend/src/contact-ui.js'|g" \
  -e "s|'frontend/editor-adapter\.js'|'frontend/src/editor-adapter.js'|g" \
  -e "s|'frontend/export\.js'|'frontend/src/export.js'|g" \
  -e "s|'frontend/file-sync\.js'|'frontend/src/file-sync.js'|g" \
  -e "s|'frontend/layout-controls\.js'|'frontend/src/layout-controls.js'|g" \
  -e "s|'frontend/onboarding\.js'|'frontend/src/onboarding.js'|g" \
  -e "s|'frontend/preview\.js'|'frontend/src/preview.js'|g" \
  -e "s|'frontend/sections-state\.js'|'frontend/src/sections-state.js'|g" \
  -e "s|'frontend/sections-ui\.js'|'frontend/src/sections-ui.js'|g" \
  -e "s|'frontend/settings-engine\.js'|'frontend/src/settings-engine.js'|g" \
  -e "s|'frontend/settings-sync\.js'|'frontend/src/settings-sync.js'|g" \
  -e "s|'frontend/templates\.js'|'frontend/src/templates.js'|g" \
  -e "s|'frontend/validator\.js'|'frontend/src/validator.js'|g" \
  -e "s|'frontend/yaml-autocomplete\.js'|'frontend/src/yaml-autocomplete.js'|g" \
  -e "s|'frontend/yaml-autocomplete\.css'|'frontend/src/yaml-autocomplete.css'|g" \
  -e "s|'frontend/yaml-backup\.js'|'frontend/src/yaml-backup.js'|g"
```

Then verify no orphan refs remain:
```
grep -rn "'frontend/[a-z]*\.js'" tests/ | grep -v "frontend/src/" || echo OK
```
Expected output: `OK`.

(Some tests reference HTML assets like `frontend/index.html` — those stay; only JS/CSS moved.)

- [ ] **Step 4: Run tests**

```
npm test
```
Expected: all currently-green tests still pass. The path change is mechanical; source content is unchanged.

- [ ] **Step 5: Manual smoke (uvicorn serving `frontend/`)**

```
uvicorn backend.main:app --reload --port 8000
```
Open `http://127.0.0.1:8000` in a browser. Verify: page loads, YAML editor visible, preview pane visible, no console errors. Kill uvicorn (Ctrl-C).

If `backend/main.py` from Task 1 prefers `dist/` but `dist/` is empty/missing, it falls back to `frontend/`. This serves the moved sources correctly because index.html now references `src/*.js`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "phase 2: move frontend JS and CSS into frontend/src/"
```

---

## Task 3: Vendor module replaces CDN libraries

**Files:**
- Create: `frontend/src/vendor.js`
- Create: `frontend/src/main.js`
- Modify: `frontend/index.html`
- Delete: vendored CDN-equivalent stylesheet link (uses npm CSS imports now)

- [ ] **Step 1: Create `frontend/src/vendor.js`**

This module imports the four libraries from npm, side-effect-imports CodeMirror's YAML mode and show-hint addon, imports CSS for CodeMirror and show-hint, configures pdf.js worker, and assigns window globals so existing IIFE scripts still find their libs.

```js
import CodeMirror from 'codemirror';
import 'codemirror/mode/yaml/yaml.js';
import 'codemirror/addon/hint/show-hint.js';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/material-darker.css';
import 'codemirror/addon/hint/show-hint.css';

import jsyaml from 'js-yaml';
import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

window.CodeMirror = CodeMirror;
window.jsyaml = jsyaml;
window.JSZip = JSZip;
window.pdfjsLib = pdfjsLib;
```

- [ ] **Step 2: Create `frontend/src/main.js`**

For now `main.js` just imports vendor — module conversion of app code happens in Tasks 4–8.

```js
import './vendor.js';
```

- [ ] **Step 3: Update `frontend/index.html` — remove CDN tags, add module entry, defer existing scripts**

Open `frontend/index.html`. In the `<head>`, **remove** these lines:

```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/material-darker.min.css" />
<link rel="stylesheet" href="lib/show-hint.css" />
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/yaml/yaml.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
```

Also remove (still in `<head>`):
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
```

Just before the **first** `<script src="src/app.js">` in the body, **add**:

```html
<script type="module" src="/src/main.js"></script>
```

Add `defer` attribute to every existing `<script src="src/*.js">` and the `<script src="lib/show-hint.js">` tag. Example for one — apply to all 17:

```html
<script defer src="src/app.js"></script>
<script defer src="lib/show-hint.js"></script>
<script defer src="src/yaml-autocomplete.js"></script>
... (etc.)
```

Why `defer`: per the HTML spec, deferred classic scripts and the module entry both execute after document parsing, in document order. Putting `<script type="module" src="/src/main.js">` first ensures `vendor.js` runs (and assigns window globals) before any deferred app script that references those globals.

- [ ] **Step 4: Diff vendored `frontend/lib/show-hint.js` against npm version**

```bash
diff frontend/lib/show-hint.js node_modules/codemirror/addon/hint/show-hint.js | head -40
```

If diff is empty (identical), `lib/show-hint.js` is unmodified and can be deleted in a later task. If diff is non-empty, keep `lib/show-hint.js`; record this in the commit message. (For now leave the file in place — Task 11 handles cleanup.)

- [ ] **Step 5: Run dev mode and verify**

In one terminal:
```
uvicorn backend.main:app --reload --port 8000
```

In another:
```
npm run dev
```
Open `http://127.0.0.1:5173/`. Verify:
- Page loads
- YAML editor shows CodeMirror with syntax highlighting (CodeMirror via npm)
- Open settings, type something — autocomplete works (show-hint via npm)
- Export → ZIP works (jszip via npm)
- Preview renders a PDF (pdfjs-dist + worker via npm)

If preview PDF fails because the worker URL is wrong, check the browser network tab — the worker should be served from a path like `/node_modules/.vite/deps/pdfjs-dist_build_pdf.worker.min.js` in dev, or hashed under `/assets/` in prod. Vite's `?url` import returns the correct URL automatically.

Kill both processes.

- [ ] **Step 6: Run build and verify**

```
npm run build
ls frontend/dist/
```

Expected: `index.html` exists with hashed JS/CSS asset references; `assets/` contains the bundled main + vendor chunks and pdf worker. The size of the worker chunk is around 1MB — that's expected.

Then:
```
uvicorn backend.main:app --port 8000
```
Open `http://127.0.0.1:8000/`. Same smoke as Step 5 but served from `dist/`. Kill uvicorn.

- [ ] **Step 7: Run tests**

```
npm test
```
Expected: all currently-green tests still pass. Source files are still IIFE; tests still use `vm.runInContext` with stubbed globals — nothing changed for them yet.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/vendor.js frontend/src/main.js frontend/index.html
git commit -m "phase 2: replace CDN libs with npm-vendored vendor module"
```

---

## Task 4: Convert leaf utility modules to ESM (app, validator, file-sync, layout-controls)

**Why this batch first:** these four files have the fewest internal dependencies. `app.js` is just an object literal. `validator.js`, `file-sync.js`, `layout-controls.js` have no callers among other source files (only DOM/window).

**Files:**
- Modify: `frontend/src/app.js`
- Modify: `frontend/src/validator.js`
- Modify: `frontend/src/file-sync.js`
- Modify: `frontend/src/layout-controls.js`
- Modify: `frontend/src/main.js`
- Modify: `frontend/index.html`
- Modify: corresponding test files

- [ ] **Step 1: Convert `frontend/src/app.js` to ESM**

Replace the file contents with:

```js
export const app = {
  state: {
    yaml: "",
    template: "classic",
    density: "balanced",
    font_scale: "normal",
    link_display: "label",
    personal_fields: [],
    lang: typeof localStorage !== 'undefined' ? (localStorage.getItem('mkcv_lang') || 'ko') : 'ko',
  },
  setState(patch) {
    Object.assign(this.state, patch);
  },
  setLang(lang) {
    this.state.lang = lang;
    localStorage.setItem('mkcv_lang', lang);
    document.documentElement.lang = lang;
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
  },
};
```

Note: removed the `window.app = app;` assignment. main.js will re-export to window as a compat shim until all callers are converted.

The `typeof localStorage !== 'undefined'` guard is needed because the module is now evaluated at import time, including under happy-dom in tests where `localStorage` may not be initialized at module load. (happy-dom does provide it, but the guard makes the module safe to import in any context.)

- [ ] **Step 2: Convert `frontend/src/validator.js` to ESM**

The current file is an IIFE that captures DOM references at load time. Split into a no-side-effect module that exports `init` plus the `validate` function.

Replace contents with:

```js
let _banner = null;
let _timer = null;

function _showErrors(errors) {
  const dot = document.getElementById("valid-dot");
  const text = document.getElementById("valid-text");

  if (!errors.length) {
    if (_banner) {
      _banner.style.display = "none";
      _banner.textContent = "";
    }
    if (dot) dot.className = "status-dot";
    if (text) text.textContent = "YAML valid";
    return;
  }

  if (_banner) {
    _banner.style.display = "block";
    _banner.textContent = errors.join(" · ");
  }
  if (dot) dot.className = "status-dot err";
  if (text) text.textContent = "YAML errors";
}

export async function validate(yaml, template) {
  try {
    const resp = await fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yaml, template }),
    });
    const data = await resp.json();
    _showErrors(data.errors || []);
    return data;
  } catch (e) {
    _showErrors([String(e)]);
    return { ok: false, errors: [String(e)] };
  }
}

export function initValidator() {
  _banner = document.getElementById("error-banner");
}

export const validator = { validate };
```

The existing file's IIFE captured `banner` at load time; the new version captures it in `initValidator()` so importing the module is safe before DOM is ready. The `validator` object export preserves the `validator.validate(...)` call shape.

If the original `validator.js` has logic this snippet omits (it's 51 lines — re-read the original first), preserve it verbatim while applying the IIFE→ESM shape change.

- [ ] **Step 3: Convert `frontend/src/file-sync.js` to ESM**

Re-read the original file first. Apply the same transform: strip the outer `(() => { ... })()` wrapper, convert internal `function` declarations to `export function`, replace `window.fileSync = fileSync` with the implicit export. Where the original captures DOM at IIFE entry, move that into an `initFileSync()` exported function.

Skeleton (apply to actual original content):

```js
const RESUME_KEY = "mkcv:default:resume.yaml";
const OLD_KEY = "mkcv_yaml";

function _migrate() { /* ... */ }
function _showToast(msg) { /* ... */ }
export function loadFile() { /* ... */ }
export function saveFile() { /* ... */ }
export function clearFile() { /* ... */ }
// (preserve all functions the original IIFE returned)

export const fileSync = { loadFile, saveFile, clearFile /* etc. */ };
export function initFileSync() {
  _migrate();
  // any one-time DOM setup
}
```

- [ ] **Step 4: Convert `frontend/src/layout-controls.js` to ESM**

This file is 60 lines. Same transform: strip IIFE, mark functions `export`, replace `window.layoutControls = ...` with named exports, gather DOM-binding code into `initLayoutControls()`.

- [ ] **Step 5: Wire converted modules into `main.js` with compat shims**

Replace `frontend/src/main.js` contents:

```js
import './vendor.js';

import { app } from './app.js';
import { validator, initValidator } from './validator.js';
import { fileSync, initFileSync } from './file-sync.js';
import { initLayoutControls } from './layout-controls.js';

// Compat shims — other (still-IIFE) source files reach for these on window.
window.app = app;
window.validator = validator;
window.fileSync = fileSync;

document.addEventListener('DOMContentLoaded', () => {
  initValidator();
  initFileSync();
  initLayoutControls();
});
```

- [ ] **Step 6: Remove the four converted scripts from `index.html`**

Remove these four lines from the body (already converted; now loaded via main.js):

```html
<script defer src="src/app.js"></script>
<script defer src="src/validator.js"></script>
<script defer src="src/file-sync.js"></script>
<script defer src="src/layout-controls.js"></script>
```

- [ ] **Step 7: Rewrite affected tests to import ESMs**

Identify which test files reference any of the four converted source files:

```bash
grep -lE "frontend/src/(app|validator|file-sync|layout-controls)\.js" tests/
```

For each match, rewrite the source-loading pattern. Example — `tests/test_layout_controls_preview.js` currently does:

```js
const src = fs.readFileSync('frontend/src/layout-controls.js', 'utf8');
const ctx = vm.createContext({ window: {}, document: stubDoc, /* ... */ });
vm.runInContext(src, ctx);
ctx.window.layoutControls.setDensity('compact');
```

Convert to:

```js
test('layoutControls.setDensity updates density', async () => {
  document.body.innerHTML = `<select id="density"><option value="balanced"/></select>`;
  const { initLayoutControls, setDensity } = await import('../frontend/src/layout-controls.js');
  initLayoutControls();
  setDensity('compact');
  assert.equal(document.getElementById('density').value, 'compact');
});
```

(Adjust to the actual exports and DOM shape the original test exercised.)

For each test, replace `vm.runInContext` blocks with `await import('../frontend/src/FILE.js')` and use happy-dom's real DOM via `document.body.innerHTML = '...'` for setup. Per-test cleanup:

```js
test.afterEach(() => {
  document.body.innerHTML = '';
});
```

- [ ] **Step 8: Run tests**

```
npm test
```
Expected: tests covering the four converted modules now import ESMs; all green.

- [ ] **Step 9: Manual smoke**

```
npm run dev
```
Open `http://127.0.0.1:5173/`. Verify the four converted modules' behaviors still work end-to-end: page loads (`app.js`), validation banner shows on bad YAML (`validator.js`), local-storage persistence works (`file-sync.js`), density/font-scale controls work (`layout-controls.js`). Kill `npm run dev`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "phase 2: convert app/validator/file-sync/layout-controls to ESM"
```

---

## Task 5: Convert state modules to ESM (sections-state, settings-engine)

**Why this batch:** these two files own canonical app state. Several other modules (sections-ui, settings-sync, templates, contact-ui) depend on them, so converting state first means later batches' compat shims stay simple.

**Files:**
- Modify: `frontend/src/sections-state.js` (625 lines)
- Modify: `frontend/src/settings-engine.js` (308 lines)
- Modify: `frontend/src/main.js`
- Modify: `frontend/index.html`
- Modify: corresponding test files

- [ ] **Step 1: Convert `frontend/src/sections-state.js` to ESM**

Re-read the original file first. It exposes `window.sectionsState`. Apply the IIFE→ESM transform:

- Strip the outer IIFE.
- Convert each function inside the closure to `export function NAME`.
- Convert `window.sectionsState = sectionsState;` to:
  ```js
  export const sectionsState = {
    rebuild,
    getOrderedFilteredYaml,
    getVisibleOrder,
    // ... all members the original object exposed
  };
  ```
- If any DOM binding code ran at IIFE entry, move it into `export function initSectionsState()`.

- [ ] **Step 2: Convert `frontend/src/settings-engine.js` to ESM**

Re-read the original first. Same transform. The original likely exposes `window.SETTINGS_HELPERS` — preserve the export name:

```js
// at end of file
export const SETTINGS_HELPERS = {
  parseSettings,
  settingsToYaml,
  DEFAULT_SETTINGS,
  normalizeTemplateDefaults,
  VALID_TPL,
  VALID_DENSITY,
  VALID_FONT,
  SECTION_CATALOG,
  KNOWN_KEYS,
  // ... preserve every exported member
};
```

Also export named items individually (`export function parseSettings`, `export const DEFAULT_SETTINGS`, etc.) so converted callers can `import { parseSettings } from './settings-engine.js'`.

- [ ] **Step 3: Wire into `main.js`**

Update `main.js`:

```js
import './vendor.js';

import { app } from './app.js';
import { validator, initValidator } from './validator.js';
import { fileSync, initFileSync } from './file-sync.js';
import { initLayoutControls } from './layout-controls.js';
import { sectionsState, initSectionsState } from './sections-state.js';
import { SETTINGS_HELPERS } from './settings-engine.js';

window.app = app;
window.validator = validator;
window.fileSync = fileSync;
window.sectionsState = sectionsState;
window.SETTINGS_HELPERS = SETTINGS_HELPERS;

document.addEventListener('DOMContentLoaded', () => {
  initValidator();
  initFileSync();
  initLayoutControls();
  initSectionsState();
});
```

- [ ] **Step 4: Remove scripts from `index.html`**

Delete these lines from the body:

```html
<script defer src="src/sections-state.js"></script>
<script defer src="src/settings-engine.js"></script>
```

- [ ] **Step 5: Rewrite affected tests**

```bash
grep -lE "frontend/src/(sections-state|settings-engine)\.js" tests/
```

Convert each matched test using the pattern in Task 4 Step 7. Two of these test files are large (`test_sections_state_cached_parse.js`, `test_contact_settings_engine.js`) — preserve every assertion verbatim; only the loading/setup mechanism changes.

- [ ] **Step 6: Run tests**

```
npm test
```
Expected: green.

- [ ] **Step 7: Manual smoke**

```
npm run dev
```
Verify section reordering, settings load/save, and YAML round-tripping work. Kill `npm run dev`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "phase 2: convert sections-state and settings-engine to ESM"
```

---

## Task 6: Convert editor + autocomplete modules to ESM (yaml-autocomplete, editor-adapter)

**Files:**
- Modify: `frontend/src/yaml-autocomplete.js` (617 lines)
- Modify: `frontend/src/editor-adapter.js` (271 lines)
- Modify: `frontend/src/main.js`
- Modify: `frontend/index.html`
- Modify: corresponding test files

- [ ] **Step 1: Convert `frontend/src/yaml-autocomplete.js` to ESM**

Re-read the original. The file currently exposes `window.initYamlAutocomplete` and `window.yamlHint`. Convert:

```js
import CodeMirror from 'codemirror';   // for the hint registration

export function initYamlAutocomplete(/* params */) { /* ... */ }
export function yamlHint(/* params */) { /* ... */ }
// (preserve all exports the original exposed)
```

Note: the file imports CodeMirror now instead of relying on `window.CodeMirror`. This is cleaner; the vendor module still sets `window.CodeMirror` so non-converted modules can use it.

- [ ] **Step 2: Convert `frontend/src/editor-adapter.js` to ESM**

Re-read the original. It currently exposes `window.editorAdapter`. Convert to named exports plus a re-exported object:

```js
import CodeMirror from 'codemirror';

export function getValue() { /* ... */ }
export function setValue(v) { /* ... */ }
export function setValueSilently(v) { /* ... */ }
export function setValuePreserveScroll(v) { /* ... */ }
export function onChange(cb) { /* ... */ }
export function clearHistory() { /* ... */ }
export function zoomIn() { /* ... */ }
export function zoomOut() { /* ... */ }
export function resetZoom() { /* ... */ }

export const editorAdapter = {
  getValue, setValue, setValueSilently, setValuePreserveScroll,
  onChange, clearHistory, zoomIn, zoomOut, resetZoom,
};

export function initEditorAdapter() { /* DOM binding code */ }
```

- [ ] **Step 3: Wire into `main.js`**

```js
import { initYamlAutocomplete } from './yaml-autocomplete.js';
import { editorAdapter, initEditorAdapter } from './editor-adapter.js';

window.editorAdapter = editorAdapter;

// inside DOMContentLoaded:
  initEditorAdapter();
  initYamlAutocomplete();
```

- [ ] **Step 4: Remove scripts from `index.html`**

```html
<script defer src="src/yaml-autocomplete.js"></script>
<script defer src="src/editor-adapter.js"></script>
```

- [ ] **Step 5: Rewrite affected tests**

```bash
grep -lE "frontend/src/(yaml-autocomplete|editor-adapter)\.js" tests/
```

Convert tests. `test_yaml_autocomplete.js` (96 lines) and `test_editor_initial_yaml.js` (132 lines) both use `vm.runInContext` with extensive stubs for CodeMirror. Now that the source imports CodeMirror via the npm package, the test must either:

(a) **Use happy-dom + real CodeMirror** — works if happy-dom's DOM is rich enough for CodeMirror. Try this first.

(b) **Mock CodeMirror via a per-test stub** — replace the module before importing the source under test. Pattern using `node:module`'s register hooks is fragile in CJS; instead, prefer (a) and only fall back to (b) if happy-dom + CodeMirror combination crashes.

Example for (a):

```js
test('initYamlAutocomplete registers helper', async () => {
  document.body.innerHTML = `<textarea id="yaml-editor"></textarea>`;
  await import('../frontend/src/vendor.js');  // ensures CodeMirror is loaded
  const { initYamlAutocomplete } = await import('../frontend/src/yaml-autocomplete.js');
  initYamlAutocomplete();
  // assertions on CodeMirror.helpers or whatever the test checked
});
```

- [ ] **Step 6: Run tests**

```
npm test
```
Expected: green. If a test fails because happy-dom can't host CodeMirror, mark it skipped with `test.skip('...', /* TODO Phase 3 — happy-dom limits */)` and document in the commit message.

- [ ] **Step 7: Manual smoke**

```
npm run dev
```
Verify autocomplete fires on `Ctrl-Space`, editor zoom works, value gets/sets work. Kill `npm run dev`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "phase 2: convert yaml-autocomplete and editor-adapter to ESM"
```

---

## Task 7: Convert UI modules to ESM (preview, contact-ui, sections-ui, templates)

**Files:**
- Modify: `frontend/src/preview.js` (259 lines)
- Modify: `frontend/src/contact-ui.js` (254 lines)
- Modify: `frontend/src/sections-ui.js` (389 lines)
- Modify: `frontend/src/templates.js` (328 lines)
- Modify: `frontend/src/main.js`
- Modify: `frontend/index.html`
- Modify: corresponding test files

- [ ] **Step 1: Convert `frontend/src/preview.js`**

Re-read original. Strip IIFE; convert `window.preview = preview;` to:

```js
export function renderPreview(blob) { /* ... */ }
export function clearPreview() { /* ... */ }
export function zoomIn() { /* ... */ }
export function zoomOut() { /* ... */ }
export function resetZoom() { /* ... */ }
// (etc. — preserve every member of the original `preview` object)

export const preview = { renderPreview, clearPreview, zoomIn, zoomOut, resetZoom /* ... */ };
export function initPreview() { /* DOM binding */ }
```

If the original imports `pdfjsLib` via `window.pdfjsLib`, replace with:
```js
import * as pdfjsLib from 'pdfjs-dist';
```

- [ ] **Step 2: Convert `frontend/src/contact-ui.js`**

Re-read original. Exposes `window.contactUI`. Apply the standard transform.

- [ ] **Step 3: Convert `frontend/src/sections-ui.js`**

Re-read original. Exposes `window.sectionsUI`. Apply transform. This file calls into `sectionsState` and `SETTINGS_HELPERS` heavily — replace `window.sectionsState.X` with `import { sectionsState } from './sections-state.js'; sectionsState.X(...)` (or import specific named exports).

- [ ] **Step 4: Convert `frontend/src/templates.js`**

Re-read original. Exposes `window.templateRegistry` and `window.templateUI`. Apply transform with both exports.

- [ ] **Step 5: Wire into `main.js`**

```js
import { preview, initPreview } from './preview.js';
import { contactUI, initContactUI } from './contact-ui.js';
import { sectionsUI, initSectionsUI } from './sections-ui.js';
import { templateRegistry, templateUI, initTemplates } from './templates.js';

window.preview = preview;
window.contactUI = contactUI;
window.sectionsUI = sectionsUI;
window.templateRegistry = templateRegistry;
window.templateUI = templateUI;

// inside DOMContentLoaded:
  initPreview();
  initContactUI();
  initSectionsUI();
  initTemplates();
```

- [ ] **Step 6: Remove scripts from `index.html`**

```html
<script defer src="src/preview.js"></script>
<script defer src="src/contact-ui.js"></script>
<script defer src="src/sections-ui.js"></script>
<script defer src="src/templates.js"></script>
```

- [ ] **Step 7: Rewrite affected tests**

```bash
grep -lE "frontend/src/(preview|contact-ui|sections-ui|templates)\.js" tests/
```

Four large test files in this batch: `test_preview_scheduler.js` (594), `test_contact_ui.js` (333), `test_sections_ui_add_hidden_section.js` (436), `test_templates_ui_sync.js` (301). Same conversion pattern. Preserve every assertion verbatim.

- [ ] **Step 8: Run tests**

```
npm test
```
Expected: green.

- [ ] **Step 9: Manual smoke**

```
npm run dev
```
Verify: preview pane renders PDF, contact fields edit, sections reorder, template switcher applies templates. Kill `npm run dev`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "phase 2: convert preview, contact-ui, sections-ui, templates to ESM"
```

---

## Task 8: Convert sync, export, yaml-backup, onboarding to ESM

**Files:**
- Modify: `frontend/src/settings-sync.js` (669 lines)
- Modify: `frontend/src/export.js` (132 lines)
- Modify: `frontend/src/yaml-backup.js` (126 lines)
- Modify: `frontend/src/onboarding.js` (199 lines)
- Modify: `frontend/src/main.js`
- Modify: `frontend/index.html`
- Modify: corresponding test files

- [ ] **Step 1: Convert `frontend/src/settings-sync.js`**

Re-read original. Exposes `window.settingsSync`. Same transform; this is the largest file in the batch (669 lines) and has many internal helpers — methodically convert each `window.X` reference to an explicit `import { X } from './...'`.

- [ ] **Step 2: Convert `frontend/src/export.js`**

Re-read original. Exposes `window.exporter`.

- [ ] **Step 3: Convert `frontend/src/yaml-backup.js`**

Re-read original. Exposes `window.yamlBackup`.

- [ ] **Step 4: Convert `frontend/src/onboarding.js`**

Re-read original. Exposes `window.onboarding`. Note this file's `preloadImages()` uses `new Image()` — under happy-dom in tests this works because `Image` is provided globally.

- [ ] **Step 5: Wire into `main.js`**

```js
import { settingsSync, initSettingsSync } from './settings-sync.js';
import { exporter, initExporter } from './export.js';
import { yamlBackup, initYamlBackup } from './yaml-backup.js';
import { onboarding, initOnboarding } from './onboarding.js';

window.settingsSync = settingsSync;
window.exporter = exporter;
window.yamlBackup = yamlBackup;
window.onboarding = onboarding;

// inside DOMContentLoaded:
  initSettingsSync();
  initExporter();
  initYamlBackup();
  initOnboarding();
```

- [ ] **Step 6: Remove scripts from `index.html`**

```html
<script defer src="src/settings-sync.js"></script>
<script defer src="src/export.js"></script>
<script defer src="src/yaml-backup.js"></script>
<script defer src="src/onboarding.js"></script>
```

At this point all 16 `<script defer src="src/*.js">` tags are gone. Only `<script defer src="lib/show-hint.js">` remains alongside the module entry.

- [ ] **Step 7: Rewrite affected tests**

```bash
grep -lE "frontend/src/(settings-sync|export|yaml-backup|onboarding)\.js" tests/
```

Includes `test_settings_sync_tab_switch.js` (605 lines) — the largest test file. Same conversion pattern; preserve assertions verbatim.

- [ ] **Step 8: Run tests**

```
npm test
```
Expected: green.

- [ ] **Step 9: Manual smoke**

```
npm run dev
```
Verify: settings save/load, export ZIP works, YAML backup downloads, onboarding wizard runs. Kill `npm run dev`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "phase 2: convert settings-sync, export, yaml-backup, onboarding to ESM"
```

---

## Task 9: Move inline bottom script into `main.js`, remove compat shims

After Task 8, every source file is ESM. The compat shims on `window` in `main.js` exist for one remaining consumer: the 239-line inline `<script>` block at the bottom of `frontend/index.html` that wires DOM event handlers using `preview.zoomIn()`, `editorAdapter.zoomOut()`, etc.

Moving this block into a proper module file lets us drop the compat shims entirely.

**Files:**
- Create: `frontend/src/ui-wiring.js`
- Modify: `frontend/src/main.js`
- Modify: `frontend/index.html`

- [ ] **Step 1: Create `frontend/src/ui-wiring.js`**

Copy the contents of the inline `<script>` block at the bottom of `index.html` into a new file. Wrap it as an exported init function and replace references to window globals with imports:

```js
import { preview } from './preview.js';
import { editorAdapter } from './editor-adapter.js';
// (import anything else the bottom script touches)

export function initUIWiring() {
  // Validate icon → hidden button
  document.getElementById('btn-validate-icon').addEventListener('click', () => {
    document.getElementById('btn-validate-template').click();
  });

  // Export dropdown
  const exportTrigger = document.getElementById('export-trigger');
  const exportMenu = document.getElementById('export-menu');
  // ... (all the wiring, with `preview.zoomIn()` and `editorAdapter.zoomIn()` etc. using imports)
}
```

Re-read the original inline script and reproduce it line-for-line. Replace any unqualified `preview`, `editorAdapter`, `app`, etc. references with the corresponding imported value.

- [ ] **Step 2: Remove the inline `<script>` block from `index.html`**

In `frontend/index.html`, delete everything from the opening `<script>` (the bare tag at the bottom, no `src=` and no `type="module"`) through its closing `</script>`. The block starts with the `/* ── UI wiring: new elements not covered by existing modules ── */` comment.

- [ ] **Step 3: Call `initUIWiring()` from `main.js`, drop window compat shims**

Replace `main.js` contents with:

```js
import './vendor.js';

import { initValidator } from './validator.js';
import { initFileSync } from './file-sync.js';
import { initLayoutControls } from './layout-controls.js';
import { initSectionsState } from './sections-state.js';
import { initEditorAdapter } from './editor-adapter.js';
import { initYamlAutocomplete } from './yaml-autocomplete.js';
import { initPreview } from './preview.js';
import { initContactUI } from './contact-ui.js';
import { initSectionsUI } from './sections-ui.js';
import { initTemplates } from './templates.js';
import { initSettingsSync } from './settings-sync.js';
import { initExporter } from './export.js';
import { initYamlBackup } from './yaml-backup.js';
import { initOnboarding } from './onboarding.js';
import { initUIWiring } from './ui-wiring.js';

document.addEventListener('DOMContentLoaded', () => {
  initValidator();
  initFileSync();
  initLayoutControls();
  initSectionsState();
  initEditorAdapter();
  initYamlAutocomplete();
  initPreview();
  initContactUI();
  initSectionsUI();
  initTemplates();
  initSettingsSync();
  initExporter();
  initYamlBackup();
  initOnboarding();
  initUIWiring();
});
```

No more `window.X = X` assignments. The single remaining `lib/show-hint.js` script tag (if not yet replaced) still works because vendor.js side-effect-imports `codemirror/addon/hint/show-hint.js` from npm — at this point delete it:

- [ ] **Step 4: Remove `lib/show-hint.js` script tag from `index.html`**

Delete:

```html
<script defer src="lib/show-hint.js"></script>
```

Verify that `vendor.js` already side-effect-imports show-hint from npm (it does, from Task 3 Step 1). If Step 4 of Task 3 found the vendored copy diverged from npm, keep it imported as a relative URL in vendor.js instead and only remove from index.html.

- [ ] **Step 5: Run tests**

```
npm test
```
Expected: green. Tests touch source modules directly and don't depend on window compat shims.

- [ ] **Step 6: Manual smoke (dev mode)**

```
npm run dev
```
Open `http://127.0.0.1:5173/`. Browser console should show no errors. Verify validate-icon, export dropdown, preview zoom, editor zoom, modal Enter/Escape, and any other behaviors from the bottom inline script. Kill `npm run dev`.

- [ ] **Step 7: Manual smoke (build mode)**

```
npm run build
uvicorn backend.main:app --port 8000
```
Open `http://127.0.0.1:8000/`. Repeat the smoke from Step 6. Kill uvicorn.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "phase 2: move inline ui-wiring script to module, remove window shims"
```

---

## Task 10: Extract inline CSS to `frontend/src/index.css`

**Files:**
- Create: `frontend/src/index.css`
- Modify: `frontend/index.html`
- Modify: `frontend/src/main.js`

- [ ] **Step 1: Cut the inline `<style>` block**

In `frontend/index.html`, the `<style>` block runs from line 21 to line 1091 (~1070 lines). Extract its inner contents (NOT including the `<style>` and `</style>` tags themselves) into a new file:

```bash
# Extract inline CSS to a new file
awk '/^\s*<style>$/{flag=1;next} /^\s*<\/style>$/{flag=0} flag' frontend/index.html > frontend/src/index.css
```

Verify the file was created with the expected length:
```bash
wc -l frontend/src/index.css
# expected: ~1069 lines
```

- [ ] **Step 2: Delete the inline `<style>...</style>` block from `index.html`**

In `frontend/index.html`, remove the entire `<style>` element including its opening and closing tags. The lines that previously contained CSS go away entirely.

- [ ] **Step 3: Import the CSS from `main.js`**

Add a CSS import at the top of `frontend/src/main.js` (after vendor.js so vendor CSS loads first):

```js
import './vendor.js';
import './index.css';
// ... (rest unchanged)
```

Vite handles CSS imports by emitting a `<link rel="stylesheet">` in the built output.

- [ ] **Step 4: Run dev mode and visually verify**

```
npm run dev
```
Open `http://127.0.0.1:5173/`. Page should render identically to before extraction — fonts, colors, spacing, layout all unchanged. If any selector visibly broke, the CSS extraction lost some scoping context — check the diff and the order of CSS imports. Kill `npm run dev`.

- [ ] **Step 5: Run build and verify**

```
npm run build
ls frontend/dist/assets/
```
Expected: a hashed `*.css` file containing the extracted styles.

```
uvicorn backend.main:app --port 8000
```
Open `http://127.0.0.1:8000/`. Same visual smoke. Kill uvicorn.

- [ ] **Step 6: Run tests**

```
npm test
```
Expected: green. Two tests assert CSS rules from the inline block: `test_contact_flyout_css.js` and `test_sections_chip_css.js`. They currently read `frontend/index.html` and parse `<style>` content. Update them to read `frontend/src/index.css` directly:

```js
const css = fs.readFileSync('frontend/src/index.css', 'utf8');
// (rest of assertions unchanged)
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "phase 2: extract inline CSS to frontend/src/index.css"
```

---

## Task 11: Final cleanup and acceptance verification

**Files:**
- Possibly delete: `frontend/lib/` (if Task 3 Step 4 found `show-hint.js` matches npm)
- Modify: `backend/main.py` (tighten the StaticFiles fallback now that build is required)

- [ ] **Step 1: Delete `frontend/lib/` if `show-hint.js` matches npm**

Recall from Task 3 Step 4: if the diff was empty, `lib/show-hint.js` is just a vendored copy of the npm file. Delete it:

```bash
git rm -r frontend/lib/
```

Confirm `vendor.js` imports `'codemirror/addon/hint/show-hint.js'` from npm — show-hint addon registers itself on the CodeMirror global automatically.

If Task 3 Step 4 found a diff, skip this step and leave `frontend/lib/show-hint.js` in place; document the reason in the final commit.

- [ ] **Step 2: Run full test suite**

```
npm test
```
Expected: all green. Confirm count matches or exceeds the pre-phase count of 111 JS + 285 Python = 396 tests (some tests may have been merged or split during conversion).

- [ ] **Step 3: Acceptance smoke — dev workflow**

```
# Terminal 1
uvicorn backend.main:app --reload --port 8000

# Terminal 2
npm run dev
```

Open `http://127.0.0.1:5173/`. Exercise the golden path end-to-end:

1. Page loads with sample YAML
2. Edit YAML — preview updates after debounce
3. Switch template via dropdown — preview rerenders
4. Change density and font scale — preview reflows
5. Add a new section via the chip UI
6. Edit contact fields via the contact flyout
7. Export to PDF, ZIP, TEX
8. Trigger an onboarding step
9. Edit a JS source file (e.g. add `console.log` to `frontend/src/preview.js`) — HMR reflects without full reload

Kill both processes.

- [ ] **Step 4: Acceptance smoke — production workflow**

```
rm -rf frontend/dist/
npm run build
uvicorn backend.main:app --port 8000
```

Open `http://127.0.0.1:8000/`. Repeat the golden path from Step 3 (omitting HMR). Verify built file sizes are reasonable (main + vendor chunks under 2 MB combined; pdf worker is its own ~1 MB chunk).

Kill uvicorn.

- [ ] **Step 5: Confirm acceptance criteria from spec**

Walk the acceptance list in `docs/superpowers/specs/2026-05-11-phase-2-frontend-bundler-design.md`:

1. ✅ `npm test` exits 0 — verified in Step 2.
2. ✅ `npm run dev` serves with HMR + proxy — verified in Step 3.
3. ✅ `npm run build` produces working `dist/` — verified in Step 4.
4. ✅ `uvicorn` serves built app — verified in Step 4.
5. ✅ `index.html` has no inline `<style>` (Task 10), no CDN scripts (Task 3), single `<script type="module">` (Task 9). Inspect `frontend/index.html`:
   ```bash
   grep -c '<script' frontend/index.html   # expected: 1
   grep -c '<style' frontend/index.html    # expected: 0
   grep -c 'cdnjs.cloudflare' frontend/index.html   # expected: 0
   ```
6. ✅ No `window.X = X` in `frontend/src/*.js` (Task 9):
   ```bash
   grep -rn 'window\.[a-zA-Z_]* *=' frontend/src/ || echo OK
   ```
   Expected: `OK` (no matches outside intentional event-handler assignments like `window.addEventListener`).
7. ✅ `node_modules/` and `frontend/dist/` gitignored (Task 1).

- [ ] **Step 6: Commit cleanup**

```bash
git add -A
git commit -m "phase 2: cleanup vendored lib, confirm acceptance"
```

- [ ] **Step 7: Finish-branch flow**

Use the `superpowers:finishing-a-development-branch` skill to merge `phase-2-frontend-bundler` back into `phase-0-foundations` (or whichever integration branch this phase was opened against).

---

## Summary

This plan migrates the frontend from script-tag globals to ES modules in 11 tasks. Each task ends with a green `npm test` and (where relevant) a manual smoke. The pattern is consistent: convert sources in dependency-order batches, rewrite tests in lockstep, then collapse compat shims once the inline bottom script of `index.html` joins the module graph.

When complete, `frontend/index.html` is a thin shell. `frontend/src/main.js` is the explicit init order. The 5 CDN dependencies live in `package.json`. Tests load source via `await import()` against happy-dom globals. Phase 3's "module reorganization" can now make meaningful boundary changes because every cross-file call is an `import`, not a global lookup.
