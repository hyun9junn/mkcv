# Phase 2 — Frontend Bundler & ESM Conversion

Part of the multi-phase mkcv refactor (see `2026-05-10-refactor-roadmap.md`). Phase 2 introduces a real bundler (Vite), converts the 17 IIFE/global JS files in `frontend/` to ES modules, vendors 5 CDN libraries as npm packages, extracts the inline `<style>` block from `index.html`, and rewrites JS tests to import ESMs directly.

## Why this comes next

Phase 1 split the backend into focused subpackages. The frontend now has the opposite shape: 17 files exist as separate files but communicate exclusively through `window.*` globals because there is no module system. `frontend/index.html` is 1645 lines with 23 `<script>` tags and one giant inline `<style>` block.

Concrete pain points today:

- Cross-file calls hide behind `window.foo()`. Tooling (renames, "find references", dead-code detection) does not work.
- Tests load source files via `vm.runInNewContext` with hand-stubbed globals because the files themselves are scripts.
- Five third-party libraries (CodeMirror, js-yaml, jszip, pdf.js, CodeMirror yaml mode) load from CDN at runtime — no offline dev, no tree-shaking.
- Adding a new file requires editing `index.html` to add another `<script>` tag at the right position in the load order.

Phase 3 ("frontend module restructure") cannot make meaningful boundaries while every export is a global. Phase 4 (persistence) and Phase 5 (template authoring) both need clean module seams to add features without bloating monolithic files. Phase 2 unblocks all of them.

## Scope

**In scope:**

1. Vite as the bundler. Config at repo root, with `root: 'frontend'`.
2. Convert all 17 files in `frontend/*.js` to ES modules (`export` / `import`). No more `window.xxx = ...` outside an explicit compat shim in `main.js` for code that must remain global (CodeMirror plugins, inline event handlers in `index.html`, etc.).
3. Replace 5 CDN `<script>` tags with npm packages: `codemirror@5`, `js-yaml`, `jszip`, `pdfjs-dist`. Replace vendored `frontend/lib/show-hint.js` with `codemirror/addon/hint/show-hint.js` from the npm package; delete `frontend/lib/` once verified.
4. Extract the inline `<style>` block from `index.html` into `frontend/src/index.css`, imported from `main.js`.
5. Rewrite JS tests under `tests/test_*.js` and `tests/*.test.mjs` to import ESMs directly. Replace `vm.runInNewContext` + stubbed-globals pattern with `happy-dom` for DOM, real imports for code.
6. Wire `npm run dev` (Vite proxying `/api/*` to uvicorn on :8000), `npm run build` (outputs `frontend/dist/`), and keep `npm test` running both JS and Python tests.
7. Update `backend/main.py`'s StaticFiles mount to prefer `frontend/dist/` (built) over `frontend/` (dev fallback).
8. `.gitignore` updates: `node_modules/`, `frontend/dist/`.

**Out of scope (deferred):**

- TypeScript migration — Phase 3 territory if at all.
- Frontend framework (React/Vue/Svelte) — never in scope; we want to keep this small.
- Module reorganization into `api/`, `preview/`, `settings/`, `templates/`, etc. — Phase 3.
- CSS splitting by component — Phase 3.
- Lint/format/typecheck tooling (`eslint`, `prettier`, `tsc --noEmit`) — Phase 3 or later.
- Removing CodeMirror 5 in favor of CodeMirror 6 — out of scope; CodeMirror 5 is legacy but works.
- pdf.js worker config beyond the standard Vite recipe — if the standard recipe doesn't cover it, narrow the scope.

## Architecture

### Target directory layout

```
mkcv/
├── vite.config.js              NEW — Vite config (root: 'frontend', proxy /api → :8000)
├── package.json                MODIFIED — add Vite + npm deps, new scripts
├── package-lock.json           NEW
├── node_modules/               NEW — gitignored
├── frontend/
│   ├── index.html              MODIFIED — no inline <style>, single <script type="module" src="/src/main.js">, no CDN <script> tags
│   ├── src/
│   │   ├── main.js             NEW — entrypoint; imports CSS, all ESMs, third-party libs; runs init in correct order
│   │   ├── index.css           NEW — extracted from inline <style>
│   │   ├── app.js              MODIFIED — ESM
│   │   ├── contact-ui.js       MODIFIED — ESM
│   │   ├── editor-adapter.js   MODIFIED — ESM
│   │   ├── export.js           MODIFIED — ESM
│   │   ├── file-sync.js        MODIFIED — ESM
│   │   ├── layout-controls.js  MODIFIED — ESM
│   │   ├── onboarding.js       MODIFIED — ESM
│   │   ├── preview.js          MODIFIED — ESM
│   │   ├── sections-state.js   MODIFIED — ESM
│   │   ├── sections-ui.js      MODIFIED — ESM
│   │   ├── settings-engine.js  MODIFIED — ESM
│   │   ├── settings-sync.js    MODIFIED — ESM
│   │   ├── templates.js        MODIFIED — ESM
│   │   ├── validator.js        MODIFIED — ESM
│   │   ├── yaml-autocomplete.js MODIFIED — ESM
│   │   ├── yaml-autocomplete.css MOVED — from frontend/, imported by yaml-autocomplete.js
│   │   └── yaml-backup.js      MODIFIED — ESM
│   ├── lib/                    DELETED — CodeMirror show-hint addon now imported from npm
│   ├── assets/                 KEPT — images, GIFs (referenced from CSS/HTML)
│   └── dist/                   NEW — Vite build output, gitignored
├── backend/main.py             MODIFIED — StaticFiles mount prefers dist/
├── tests/
│   ├── setup-dom.js            NEW — happy-dom global setup
│   ├── test_*.js               MODIFIED — import ESMs, drop vm.runInNewContext
│   └── *.test.mjs              MODIFIED — same
└── .gitignore                  MODIFIED — node_modules/, frontend/dist/
```

Why move JS files into `frontend/src/`? Vite's convention is `root` for HTML entry points and `src/` for code. Mixing `index.html` and source code at the same level is allowed but causes friction with Vite's asset URL resolution (`/src/...` is the canonical dev-server path).

### Dev workflow

**Active frontend work:**
```
Terminal 1: uvicorn backend.main:app --reload --port 8000
Terminal 2: npm run dev    # Vite on :5173
```

Vite proxies `/api/*` (and any other backend paths exposed to the browser) to `:8000`. Browser navigates to `:5173`. HMR is automatic.

**Backend-focused work / production:**
```
npm run build              # writes frontend/dist/
uvicorn backend.main:app   # serves frontend/dist/ via StaticFiles
```

Browser navigates to `:8000`. No Vite running. This is the production deployment shape too.

### `backend/main.py` mount change

```python
# Pseudocode
dist_dir = Path("frontend/dist")
src_dir = Path("frontend")
if dist_dir.exists():
    app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="frontend")
elif src_dir.exists():
    app.mount("/", StaticFiles(directory=str(src_dir), html=True), name="frontend")
```

`dist_dir` wins when built; otherwise dev fallback. The dev fallback is meaningful for backend-only contributors who never run Vite — they still get a working (if un-bundled) app via the existing `<script>` tags in `index.html`. But wait: after Phase 2, `index.html` has `<script type="module" src="/src/main.js">`, which the static mount cannot resolve without Vite. So the dev fallback only works if `dist/` exists.

**Resolution:** Drop the dev fallback. Require `npm run build` to have run at least once. Document this. Surfacing the requirement loudly is better than serving a broken page.

```python
dist_dir = Path("frontend/dist")
if dist_dir.exists():
    app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="frontend")
```

If `dist/` is missing, the user gets a 404 — clear signal to run `npm run build`.

### CDN → npm migration

| Was (CDN) | Becomes (npm) | Import |
|---|---|---|
| `codemirror/5.65.16/codemirror.min.js` | `codemirror@^5.65.16` | `import CodeMirror from 'codemirror'` |
| `codemirror/5.65.16/mode/yaml/yaml.min.js` | (bundled in codemirror) | `import 'codemirror/mode/yaml/yaml.js'` |
| `js-yaml/4.1.0/js-yaml.min.js` | `js-yaml@^4.1.0` | `import jsYaml from 'js-yaml'` |
| `jszip/3.10.1/jszip.min.js` | `jszip@^3.10.1` | `import JSZip from 'jszip'` |
| `pdf.js/3.11.174/pdf.min.js` | `pdfjs-dist@^3.11.174` | `import * as pdfjsLib from 'pdfjs-dist'` |

`pdf.js` requires a worker. Vite recipe:
```js
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
```

`codemirror/addon/hint/show-hint.js` is in the npm package. Replace the vendored `frontend/lib/show-hint.js` with the npm import; diff the two files first to catch any local modifications. If they diverge, keep `lib/` and import the vendored copy as a relative URL instead.

### ESM conversion pattern

**Before** (`frontend/preview.js`, illustrative):
```js
(function() {
  function renderPreview(blob) { /* ... */ }
  function clearPreview() { /* ... */ }
  window.renderPreview = renderPreview;
  window.clearPreview = clearPreview;
})();
```

**After** (`frontend/src/preview.js`):
```js
export function renderPreview(blob) { /* ... */ }
export function clearPreview() { /* ... */ }
```

**Caller migration** (e.g., `settings-sync.js` calling `renderPreview`):
- Before: `window.renderPreview(blob)`
- After: `import { renderPreview } from './preview.js';` at top, then `renderPreview(blob)` directly.

**Inline event handlers in `index.html`:**
Today some buttons may have `onclick="handlerName()"` referencing window globals. After Phase 2, ESM exports are NOT on window by default. Options:
1. Replace `onclick=` with `addEventListener` calls inside `main.js`.
2. Explicitly re-export to window in `main.js` as a compat shim: `import * as handlers from './handlers.js'; window.handlers = handlers;`.

Audit `index.html` for inline `on*=` attributes during the conversion. Prefer option 1.

### Initialization order

Today the order is implicit in the `<script>` tag sequence. After Phase 2, `main.js` does the ordering explicitly:

```js
// main.js (sketch)
import './index.css';
import 'codemirror/lib/codemirror.css';
import 'codemirror/mode/yaml/yaml.js';
import CodeMirror from 'codemirror';
import 'codemirror/addon/hint/show-hint.js';
import 'codemirror/addon/hint/show-hint.css';

import { initApp } from './app.js';
import { initSettingsEngine } from './settings-engine.js';
import { initEditorAdapter } from './editor-adapter.js';
// ... in the order the current <script> tags appear

document.addEventListener('DOMContentLoaded', () => {
  initApp();
  initSettingsEngine();
  // ...
});
```

Where each existing file has implicit top-level init code today (binding DOM, registering listeners), wrap it in an exported `init*` function called from `main.js`. This makes the order explicit and testable.

### Test rewrite

**Today (`tests/test_preview.js`, illustrative):**
```js
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync('frontend/preview.js', 'utf8');
const ctx = { window: {}, document: stubDocument(), /* ... */ };
vm.runInNewContext(code, ctx);
ctx.window.renderPreview(blob);
```

**After:**
```js
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();   // moved to tests/setup-dom.js
import { renderPreview } from '../frontend/src/preview.js';
renderPreview(blob);
```

Run with `node --test --import ./tests/setup-dom.js "tests/test_*.js" "tests/*.test.mjs"`.

`happy-dom` provides `document`, `window`, `Image`, `Element`, etc. — replacing all the hand-stubbed globals in current tests. Tests that need a specific element shape can construct it with `document.createElement` instead of stubbing.

**Caveat:** `happy-dom` may not stub CodeMirror's exact behavior. Tests that exercise CodeMirror should mock the CodeMirror module via Node's experimental loader, or — simpler — restructure the test to call lower-level functions.

If any test cannot be converted cleanly, document the reason inline and skip-for-now with a `// TODO Phase 3` comment. The acceptance bar is "all currently-passing tests still pass," not "every test perfectly modernized."

## Acceptance

Phase 2 is done when:

1. `npm test` exits 0 on a clean checkout after `npm install`. All currently-green tests must remain green; if any test cannot be converted to ESM cleanly, it may be skipped with an inline `// TODO Phase 3` reason, but the skip must be called out in the phase merge message.
2. `npm run dev` serves the app at `:5173` with HMR, proxying `/api/*` to uvicorn at `:8000`. Manually verified by editing a `frontend/src/*.js` file and seeing the change reflected without reload.
3. `npm run build` produces `frontend/dist/` containing `index.html`, hashed JS/CSS bundles, and assets.
4. `uvicorn backend.main:app` (after `npm run build`) serves the built app at `:8000`. Manual smoke test: load page, render a preview, change a setting, export.
5. `frontend/index.html` contains no inline `<style>`, no CDN `<script>` tags, exactly one `<script type="module" src="/src/main.js">`.
6. No `window.xxx = ...` assignments in `frontend/src/*.js` except explicit compat shims in `main.js`, documented inline.
7. `node_modules/` and `frontend/dist/` are gitignored.

## Risks and rollback

- **Risk: CodeMirror 5 npm package's ESM exports differ from the CDN UMD bundle.** The npm package is CommonJS with `default` export wrappers — Vite handles this. Verify by importing CodeMirror and instantiating an editor in `main.js` before converting any other file. Mitigation: if it fails, fall back to keeping CodeMirror on CDN and treating it as a Vite external; this is a documented hybrid escape hatch.
- **Risk: pdf.js worker path breaks in production build.** Vite's `?url` import for the worker file is standard but can produce a path that fails when served from `dist/`. Test the production build flow (Acceptance #4) before declaring done.
- **Risk: `happy-dom` is incomplete for some test.** Document and skip per the test rewrite section. Don't let test perfectionism block the phase.
- **Risk: Inline `on*=` handlers in `index.html` break silently.** Grep for `onclick=`, `onchange=`, `onsubmit=` in `index.html` before starting; convert all to `addEventListener` in `main.js` as part of the conversion.
- **Risk: Some existing JS test currently passing via lucky global stubbing breaks under real DOM.** This is unavoidable signal — fix the test or fix the bug it just exposed.

Rollback is `git revert` of the phase merge. The branch should stay reviewable as a single fast-forward chain like Phase 1.

## What this unblocks

- **Phase 3** can reorganize modules along feature axes (api/, preview/, settings/, ...) because boundaries are now real imports, not globals.
- **Phase 4** can introduce a server-side persistence layer with isolated frontend changes (one module for the auth/sync flow).
- **Phase 5** can decouple template-picker UI from the rest of the frontend.
- Any future TypeScript migration becomes incremental rather than a flag day.
