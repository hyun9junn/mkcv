# Reset Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Reset" button in the masthead header (left of Export) that shows a confirmation dialog and then clears all mkcv localStorage keys and reloads the app to its initial state.

**Architecture:** All changes are in `frontend/index.html` (CSS, HTML, inline JS). A `clearMkcvStorage()` helper is exposed on `window` so it can be unit-tested in isolation. The existing "Reset settings" button is renamed to "Restore recommended" — its behavior is unchanged.

**Tech Stack:** Vanilla JS, HTML/CSS, Node.js built-in test runner (`node:test`), `js-yaml` for tests.

---

## File Map

| File | Change |
|------|--------|
| `frontend/index.html` | Add CSS, HTML (button + modal), rename existing button, wire JS |
| `tests/test_editor_initial_yaml.js` | Fix pre-existing failure (name mismatch) |
| `tests/test_reset_all_storage.js` | New: unit tests for `clearMkcvStorage` |

---

### Task 1: Fix pre-existing test failure in `test_editor_initial_yaml.js`

The test expects `name: Minseo Park` but `frontend/editor-adapter.js` now has `name: Gildong Hong`. Fix the test to match the current INITIAL_YAML.

**Files:**
- Modify: `tests/test_editor_initial_yaml.js`

- [ ] **Step 1: Run the test to confirm it currently fails**

```bash
node --test tests/test_editor_initial_yaml.js
```

Expected output includes:
```
✖ editor adapter boots with a realistic software engineer resume sample
AssertionError: The input did not match the regular expression /name: Minseo Park/
```

- [ ] **Step 2: Update the test to match the current INITIAL_YAML**

In `tests/test_editor_initial_yaml.js`, replace the entire `test(...)` block with:

```js
test('editor adapter boots with a realistic software engineer resume sample', () => {
  const context = bootEditorAdapter();
  const initialYaml = context.app.state.yaml;
  const parsed = jsyaml.load(initialYaml);

  assert.match(initialYaml, /name: Gildong Hong/);
  assert.match(initialYaml, /Senior Software Engineer/);
  assert.match(initialYaml, /Orbit Labs/);
  assert.match(initialYaml, /Incident Review Assistant/);

  assert.equal(parsed.personal.name, 'Gildong Hong');
  assert.equal(parsed.personal.github, 'github.com/gildonghong');
  assert.equal(parsed.experience.length, 2);
  assert.equal(parsed.skills.length, 3);
  assert.equal(parsed.projects[0].name, 'Incident Review Assistant');
});
```

- [ ] **Step 3: Run the test to confirm it passes**

```bash
node --test tests/test_editor_initial_yaml.js
```

Expected:
```
✔ editor adapter boots with a realistic software engineer resume sample
ℹ pass 1
ℹ fail 0
```

- [ ] **Step 4: Commit**

```bash
git add tests/test_editor_initial_yaml.js
git commit -m "fix: update editor initial YAML test to match Gildong Hong"
```

---

### Task 2: Write failing unit tests for `clearMkcvStorage`

**Files:**
- Create: `tests/test_reset_all_storage.js`

- [ ] **Step 1: Write the test file**

Create `tests/test_reset_all_storage.js` with this content:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function makeContext() {
  const store = new Map();
  const localStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, v); },
    removeItem(k) { store.delete(k); },
    get length() { return store.size; },
    key(i) { return [...store.keys()][i] ?? null; },
    [Symbol.iterator]() { return store.keys(); },
  };
  Object.defineProperty(localStorage, 'keys', {
    get() { return () => [...store.keys()]; },
  });

  const domReadyCallbacks = [];
  const elements = new Map();

  function makeEl(id) {
    const listeners = new Map();
    return {
      id,
      style: {},
      classList: { toggle() {}, add() {}, remove() {} },
      addEventListener(type, cb) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(cb);
      },
      click() {
        for (const cb of listeners.get('click') || []) cb({ stopPropagation() {} });
      },
    };
  }

  const ids = [
    'btn-reset-all',
    'reset-all-modal',
    'reset-all-cancel',
    'reset-all-confirm',
    'export-trigger',
    'export-menu',
    'template-dropdown',
    'preview-zoom-in', 'preview-zoom-out', 'preview-zoom-label',
    'editor-zoom-in', 'editor-zoom-out', 'editor-zoom-label',
    'btn-validate-icon', 'btn-validate-template',
    'reset-sections-order-btn',
    'theme-toggle', 'theme-label',
    'gutter-handle', 'split', 'editor-pane', 'preview-pane',
  ];
  for (const id of ids) elements.set(id, makeEl(id));

  let reloaded = false;

  const ctx = {
    console,
    localStorage,
    document: {
      getElementById(id) { return elements.get(id) ?? null; },
      addEventListener(type, cb) {
        if (type === 'DOMContentLoaded') domReadyCallbacks.push(cb);
      },
      documentElement: { dataset: { theme: 'light' } },
    },
    location: { reload() { reloaded = true; } },
    window: {},
    preview: { zoomIn() {}, zoomOut() {}, resetZoom() {}, refit() {} },
    editorAdapter: { zoomIn() {}, zoomOut() {}, resetZoom() {} },
    app: { state: { template: 'classic' } },
    settingsSync: null,
    templateRegistry: null,
  };
  ctx.window = ctx;
  return { ctx, store, elements, domReadyCallbacks, get reloaded() { return reloaded; } };
}

function boot(ctx, domReadyCallbacks) {
  const source = fs.readFileSync('frontend/index.html', 'utf8');
  // Extract only the inline <script> block at the bottom of index.html
  const match = source.match(/<script>\s*\/\* ── UI wiring[\s\S]*?<\/script>/);
  if (!match) throw new Error('Could not find inline UI wiring script in index.html');
  vm.runInNewContext(match[0].replace(/<\/?script>/g, ''), ctx, { filename: 'index.html (inline)' });
  for (const cb of domReadyCallbacks) cb();
}

test('clearMkcvStorage removes all mkcv-prefixed keys and leaves others', () => {
  const { ctx, store, domReadyCallbacks } = makeContext();

  store.set('mkcv:default:resume.yaml', 'name: Test');
  store.set('mkcv:default:settings.yaml', 'template: classic');
  store.set('mkcv_theme', 'dark');
  store.set('mkcv_sections_state', '{}');
  store.set('mkcv_density', 'compact');
  store.set('mkcv_font_scale', 'large');
  store.set('mkcv_settings_v2_migrated', '1');
  store.set('mkcv_yaml', 'old');
  store.set('mkcv_settings_yaml', 'old');
  store.set('some_other_app_key', 'keep me');

  boot(ctx, domReadyCallbacks);
  ctx.clearMkcvStorage();

  assert.equal(store.has('mkcv:default:resume.yaml'), false, 'resume key should be cleared');
  assert.equal(store.has('mkcv:default:settings.yaml'), false, 'settings key should be cleared');
  assert.equal(store.has('mkcv_theme'), false, 'theme key should be cleared');
  assert.equal(store.has('mkcv_sections_state'), false, 'sections state key should be cleared');
  assert.equal(store.has('mkcv_density'), false, 'density key should be cleared');
  assert.equal(store.has('mkcv_font_scale'), false, 'font scale key should be cleared');
  assert.equal(store.has('mkcv_settings_v2_migrated'), false, 'migration flag should be cleared');
  assert.equal(store.has('mkcv_yaml'), false, 'legacy yaml key should be cleared');
  assert.equal(store.has('mkcv_settings_yaml'), false, 'legacy settings key should be cleared');
  assert.equal(store.get('some_other_app_key'), 'keep me', 'non-mkcv keys must be preserved');
});

test('clearMkcvStorage handles empty localStorage without errors', () => {
  const { ctx, store, domReadyCallbacks } = makeContext();
  boot(ctx, domReadyCallbacks);
  assert.doesNotThrow(() => ctx.clearMkcvStorage());
  assert.equal(store.size, 0);
});
```

- [ ] **Step 2: Run the tests to confirm they fail (function not yet defined)**

```bash
node --test tests/test_reset_all_storage.js
```

Expected output includes:
```
✖ clearMkcvStorage removes all mkcv-prefixed keys and leaves others
```
(because `ctx.clearMkcvStorage` is undefined or the script can't find the inline wiring block)

---

### Task 3: Add CSS for reset-all button and danger confirm button

**Files:**
- Modify: `frontend/index.html` (the `<style>` block, around line 270 where `.export-btn` styles live)

- [ ] **Step 1: Add `.reset-all-btn` and `.btn-danger` styles**

In `frontend/index.html`, find the line:
```css
    .export-btn:hover { opacity: .85; }
```

After that line, insert:

```css
    /* Reset-all button (masthead, left of Export) */
    .reset-all-btn {
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 500;
      color: var(--ink-2);
      border: 1px solid var(--rule);
      transition: color .15s, border-color .15s;
    }
    .reset-all-btn:hover { color: var(--err); border-color: var(--err); }
    .btn-danger { background: var(--err); color: white; }
    .btn-danger:hover { filter: brightness(1.08); }
```

- [ ] **Step 2: Visually verify in browser (optional sanity check — no test for pure CSS)**

Open the app in the browser after starting the dev server to confirm no style regressions. (Full visual testing happens in Task 6.)

---

### Task 4: Add the reset-all button in `.masthead-right` and the modal HTML

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Add the button in `.masthead-right`**

In `frontend/index.html`, find this exact block:

```html
    <div style="position:relative">
      <button class="export-btn" id="export-trigger">
```

Directly before it (still inside `.masthead-right`), insert:

```html
    <button class="reset-all-btn" id="btn-reset-all" title="Clear all data and restore defaults">Reset</button>
```

- [ ] **Step 2: Add the modal HTML**

In `frontend/index.html`, find the comment:

```html
<!-- ═══ RESET MODAL ═══ -->
```

Directly before that comment, insert the new modal:

```html
<!-- ═══ RESET ALL MODAL ═══ -->
<div class="modal-backdrop" id="reset-all-modal">
  <div class="modal">
    <div class="modal-head">
      <div class="eyebrow">Reset</div>
      <h2>Start over?</h2>
    </div>
    <div class="modal-body">
      This will clear your resume and all settings, restoring the app to its initial state. This cannot be undone.
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" id="reset-all-cancel">Cancel</button>
      <button class="btn btn-danger" id="reset-all-confirm">Reset</button>
    </div>
  </div>
</div>

```

---

### Task 5: Rename the existing "Reset settings" button label

**Files:**
- Modify: `frontend/index.html` (controls row, around line 1024)

- [ ] **Step 1: Update the button label**

Find:
```html
    <button class="reset-sections-btn" id="reset-sections-order-btn">Reset settings</button>
```

Replace with:
```html
    <button class="reset-sections-btn" id="reset-sections-order-btn">Restore recommended</button>
```

---

### Task 6: Wire JS — expose `clearMkcvStorage` and wire modal

**Files:**
- Modify: `frontend/index.html` (the inline `<script>` block at the bottom, inside `DOMContentLoaded`)

- [ ] **Step 1: Add `clearMkcvStorage` and modal wiring**

In the inline `<script>` block, find the end of the `DOMContentLoaded` listener — the closing `});` just before `</script>`. Before that closing `});`, insert:

```js
  /* Reset-all button */
  window.clearMkcvStorage = function () {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    keys.filter(k => k.startsWith('mkcv')).forEach(k => localStorage.removeItem(k));
  };

  const resetAllModal   = document.getElementById('reset-all-modal');
  const resetAllBtn     = document.getElementById('btn-reset-all');
  const resetAllCancel  = document.getElementById('reset-all-cancel');
  const resetAllConfirm = document.getElementById('reset-all-confirm');

  resetAllBtn.addEventListener('click', () => {
    resetAllModal.classList.add('open');
  });
  resetAllCancel.addEventListener('click', () => {
    resetAllModal.classList.remove('open');
  });
  resetAllModal.addEventListener('click', (e) => {
    if (e.target === resetAllModal) resetAllModal.classList.remove('open');
  });
  resetAllConfirm.addEventListener('click', () => {
    window.clearMkcvStorage();
    location.reload();
  });
```

- [ ] **Step 2: Run the unit tests — they should now pass**

```bash
node --test tests/test_reset_all_storage.js
```

Expected:
```
✔ clearMkcvStorage removes all mkcv-prefixed keys and leaves others
✔ clearMkcvStorage handles empty localStorage without errors
ℹ pass 2
ℹ fail 0
```

- [ ] **Step 3: Run all JS tests to confirm no regressions**

```bash
node --test tests/test_template_default_reset.js tests/test_editor_initial_yaml.js tests/test_reset_all_storage.js
```

Expected: all tests pass, 0 failures.

- [ ] **Step 4: Commit**

```bash
git add frontend/index.html tests/test_reset_all_storage.js tests/test_editor_initial_yaml.js
git commit -m "feat: add full reset button with confirmation modal"
```

---

### Task 7: Manual end-to-end verification

- [ ] **Step 1: Start the dev server**

```bash
uvicorn backend.main:app --reload
```

Open `http://localhost:8000` in a browser.

- [ ] **Step 2: Seed some localStorage data**

In the browser console:
```js
localStorage.setItem('mkcv:default:resume.yaml', 'name: Custom User');
localStorage.setItem('mkcv_theme', 'dark');
```
Then reload the page. Confirm the editor shows "Custom User" and theme is dark.

- [ ] **Step 3: Verify Reset button placement**

Confirm the "Reset" button appears in the masthead, to the left of the Export button. Confirm the existing "Restore recommended" button appears in the sections rail area.

- [ ] **Step 4: Verify confirmation modal**

Click "Reset". Confirm the modal appears with heading "Start over?" and two buttons: "Cancel" and "Reset".

Click outside the modal (backdrop). Confirm it closes without resetting.

Click "Reset" again. Click "Cancel". Confirm it closes without resetting. Check localStorage still has the custom resume.

- [ ] **Step 5: Verify full reset**

Click "Reset", then click "Reset" in the modal. Confirm:
- Page reloads
- Editor shows Gildong Hong starter resume
- Settings are back to defaults (Classic template, Balanced density, Normal type size)
- Theme is light

- [ ] **Step 6: Verify "Restore recommended" still works**

Make a layout change (e.g., switch to Compact density). Click "Restore recommended". Confirm layout resets without wiping the resume content.
