# YAML Backup Export / Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "↓ YAML backup" and "↑ Import YAML…" to the export menu — exporting a timestamped ZIP of both YAML files and importing one back.

**Architecture:** A new self-contained `yaml-backup.js` module (IIFE, exposes `window.yamlBackup`) handles all export/import logic through existing public interfaces (`editorAdapter`, `settingsSync`). A new `#import-modal` (same CSS pattern as `#reset-modal`) handles the confirmation step. `settingsSync.setYaml()` is added as a thin public wrapper around the existing internal `_onYamlChange`.

**Tech Stack:** JSZip 3.10.1 (CDN), existing js-yaml (already loaded), Node.js `node:test` for JS unit tests.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/index.html` | Modify | JSZip CDN tag, new export menu items, hidden file input, `#import-modal`, load `yaml-backup.js` |
| `frontend/settings-sync.js` | Modify | Expose `setYaml` in the public return block |
| `frontend/yaml-backup.js` | Create | All export/import logic — `exportZip()`, `importZip(file)`, modal wiring |
| `tests/test_yaml_backup.js` | Create | Unit tests for export/import logic using mocked JSZip and DOM |

---

## Task 1: Add JSZip CDN and export-menu divider CSS

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Add JSZip CDN script tag**

In `frontend/index.html`, after line 18 (`js-yaml.min.js` script tag):

```html
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
```

- [ ] **Step 2: Add CSS rule for the export menu divider**

In `frontend/index.html`, find the `#export-menu.open` CSS block (around line 239) and add immediately after it:

```css
    #export-menu hr { border: none; border-top: 1px solid var(--rule); margin: 4px 0; }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "feat: add JSZip CDN and export-menu divider CSS"
```

---

## Task 2: Expose `setYaml` on `settingsSync`

**Files:**
- Modify: `frontend/settings-sync.js:459-468`

`settingsSync` currently exposes `getYaml` but not `setYaml`. The import flow needs to push new YAML through the same internal path (`_onYamlChange`) that the editor uses — this updates `_settingsYaml`, re-parses, applies UI controls, refreshes the preview, and schedules the localStorage save.

- [ ] **Step 1: Write the failing test**

Create `tests/test_yaml_backup.js` with just this one test for now:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function makeSettingsSyncStub() {
  let _yaml = 'template: classic\n';
  const calls = [];
  return {
    stub: {
      get activeTab() { return 'resume'; },
      getYaml: () => _yaml,
      setYaml: (yaml) => { _yaml = yaml; calls.push(yaml); },
      getSettings: () => ({}),
    },
    calls,
    getYaml: () => _yaml,
  };
}

test('settingsSync exposes setYaml', () => {
  // Load settings-sync.js in a minimal context and verify setYaml exists on the result
  const src = fs.readFileSync('frontend/settings-sync.js', 'utf8');
  const timers = { id: 1, pending: new Map() };
  const ctx = vm.createContext({
    document: {
      addEventListener() {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    window: {},
    setTimeout: (fn, ms) => { const id = timers.id++; timers.pending.set(id, fn); return id; },
    clearTimeout: (id) => timers.pending.delete(id),
    console,
    window: { SETTINGS_HELPERS: {
      parseSettings: () => ({ value: {}, errors: [], warnings: [] }),
      settingsToYaml: (s) => JSON.stringify(s),
      DEFAULT_SETTINGS: { template: 'classic', layout: { density: 'balanced', font_scale: 'normal' }, personal: { default_link_display: 'label', fields: [] }, sections: [] },
      normalizeTemplateDefaults: (d, t) => ({}),
    }},
  });
  // settings-sync.js references jsyaml and SETTINGS_HELPERS — patch them
  ctx.jsyaml = { load: () => ({}) };
  ctx.SETTINGS_HELPERS = ctx.window.SETTINGS_HELPERS;
  // Provide a minimal editorAdapter
  ctx.window.editorAdapter = { getValue: () => '', setValue() {}, setValueSilently() {}, setValuePreserveScroll() {}, onChange() {} };
  ctx.app = { state: {}, setState() {} };
  ctx.sectionsState = { rebuild() {}, getOrderedFilteredYaml: (y) => y, getVisibleOrder: () => [] };
  ctx.window.settingsSync = null;
  try { vm.runInContext(src, ctx); } catch {}
  assert.ok(typeof ctx.window.settingsSync?.setYaml === 'function', 'setYaml should be a function on settingsSync');
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
node --test tests/test_yaml_backup.js
```

Expected: FAIL — `setYaml should be a function on settingsSync`

- [ ] **Step 3: Add `setYaml` to `settings-sync.js` return block**

In `frontend/settings-sync.js`, find the return block (line ~459):

```javascript
  return {
    get activeTab() { return _activeTab; },
    updateFromToolbar,
    notifySectionStateChange,
    updateSectionTitle,
    applyTemplateDefaults,
    getYaml:     () => _settingsYaml,
    getSettings: () => _parsed.value || DEFAULT_SETTINGS,
  };
```

Replace with:

```javascript
  return {
    get activeTab() { return _activeTab; },
    updateFromToolbar,
    notifySectionStateChange,
    updateSectionTitle,
    applyTemplateDefaults,
    getYaml:     () => _settingsYaml,
    getSettings: () => _parsed.value || DEFAULT_SETTINGS,
    setYaml:     (yaml) => _onYamlChange(yaml),
  };
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
node --test tests/test_yaml_backup.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/settings-sync.js tests/test_yaml_backup.js
git commit -m "feat: expose setYaml on settingsSync"
```

---

## Task 3: Add HTML elements

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Add new export menu items and hidden file input**

In `frontend/index.html`, find `#export-menu` (line ~949):

```html
      <div id="export-menu">
        <div class="export-option primary" data-export="pdf">↓ PDF <span class="kbd">⌘P</span></div>
        <div class="export-option" data-export="tex">↓ LaTeX source <span class="kbd">⌘L</span></div>
        <div class="export-option" data-export="md">↓ Markdown <span class="kbd">⌘M</span></div>
      </div>
```

Replace with:

```html
      <div id="export-menu">
        <div class="export-option primary" data-export="pdf">↓ PDF <span class="kbd">⌘P</span></div>
        <div class="export-option" data-export="tex">↓ LaTeX source <span class="kbd">⌘L</span></div>
        <div class="export-option" data-export="md">↓ Markdown <span class="kbd">⌘M</span></div>
        <hr>
        <div class="export-option" id="btn-yaml-export">↓ YAML backup</div>
        <div class="export-option" id="btn-yaml-import">↑ Import YAML…</div>
      </div>
```

Find the hidden export buttons block (line ~957):

```html
    <!-- Hidden export buttons for export.js compat -->
    <button id="btn-pdf"  style="display:none"></button>
    <button id="btn-tex"  style="display:none"></button>
    <button id="btn-md"   style="display:none"></button>
```

Replace with:

```html
    <!-- Hidden export buttons for export.js compat -->
    <button id="btn-pdf"  style="display:none"></button>
    <button id="btn-tex"  style="display:none"></button>
    <button id="btn-md"   style="display:none"></button>
    <input  id="import-yaml-input" type="file" accept=".zip" style="display:none">
```

- [ ] **Step 2: Add `#import-modal`**

In `frontend/index.html`, find the comment `<!-- ═══ FILENAME MODAL ═══ -->` (line ~1110) and insert before it:

```html
<!-- ═══ IMPORT MODAL ═══ -->
<div class="modal-backdrop" id="import-modal">
  <div class="modal">
    <div class="modal-head">
      <div class="eyebrow">Import</div>
      <h2>Restore from backup?</h2>
    </div>
    <div class="modal-body" id="import-modal-body"></div>
    <div class="modal-foot">
      <button class="btn btn-ghost"  id="import-modal-cancel">Cancel</button>
      <button class="btn btn-accent" id="import-modal-confirm">Import</button>
    </div>
  </div>
</div>

```

- [ ] **Step 3: Load `yaml-backup.js`**

In `frontend/index.html`, find the line `<script src="settings-sync.js"></script>` (line ~1148) and add immediately after:

```html
<script src="yaml-backup.js"></script>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/index.html
git commit -m "feat: add YAML backup menu items, file input, and import modal"
```

---

## Task 4: Create `yaml-backup.js`

**Files:**
- Create: `frontend/yaml-backup.js`

- [ ] **Step 1: Write tests for export and import logic**

Append to `tests/test_yaml_backup.js`:

```javascript
// ── Shared harness ──────────────────────────────────────────────────────────

function makeDOM() {
  const elements = {};
  const listeners = {};

  function el(id) {
    if (!elements[id]) {
      elements[id] = {
        id,
        className: '',
        textContent: '',
        innerHTML: '',
        style: {},
        files: null,
        value: '',
        classList: {
          add(c)    { elements[id].className += ' ' + c; },
          remove(c) { elements[id].className = elements[id].className.replace(' ' + c, ''); },
          contains(c) { return elements[id].className.includes(c); },
        },
        addEventListener(type, fn) {
          const k = `${id}:${type}`;
          if (!listeners[k]) listeners[k] = [];
          listeners[k].push(fn);
        },
        click() { fire(id, 'click', {}); },
      };
    }
    return elements[id];
  }

  function fire(id, type, event = {}) {
    const k = `${id}:${type}`;
    for (const fn of listeners[k] || []) fn({ target: el(id), currentTarget: el(id), ...event });
  }

  return { el, fire, elements, listeners };
}

function makeJSZipStub({ files = {}, throwOnLoad = false } = {}) {
  function JSZip() {
    this._files = {};
  }
  JSZip.prototype.file = function(name, content) {
    if (content !== undefined) { this._files[name] = content; return this; }
    const data = files[name];
    if (!data) return null;
    return { async: () => Promise.resolve(data) };
  };
  JSZip.prototype.generateAsync = function() {
    return Promise.resolve(new Blob([JSON.stringify(this._files)]));
  };
  JSZip.loadAsync = throwOnLoad
    ? () => Promise.reject(new Error('bad zip'))
    : (f) => Promise.resolve(new JSZip());
  return JSZip;
}

function loadBackup(ctx) {
  const src = fs.readFileSync('frontend/yaml-backup.js', 'utf8');
  vm.runInContext(src, ctx);
}

function makeCtx({ dom, jszip, resumeYaml = 'name: Test\n', settingsYaml = 'template: classic\n', settingsErrors = [] } = {}) {
  const downloads = [];
  const toasts = [];
  const settingsSetYamlCalls = [];

  const ctx = vm.createContext({
    document: {
      addEventListener(type, fn) { if (type === 'DOMContentLoaded') fn(); },
      getElementById: (id) => dom.el(id),
    },
    window: {
      editorAdapter: {
        getValue: () => resumeYaml,
        setValue(v) { this._value = v; },
        _value: resumeYaml,
      },
      settingsSync: {
        getYaml: () => settingsYaml,
        setYaml: (y) => settingsSetYamlCalls.push(y),
      },
      SETTINGS_HELPERS: {
        parseSettings: () => ({ errors: settingsErrors, warnings: [], value: {} }),
      },
    },
    JSZip: jszip || makeJSZipStub({ files: { 'resume.yaml': resumeYaml, 'settings.yaml': settingsYaml } }),
    jsyaml: { load: (y) => { if (y === '__invalid__') throw new Error('bad yaml'); return {}; } },
    URL: {
      createObjectURL: (b) => 'blob:fake',
      revokeObjectURL: () => {},
    },
    console,
    downloads,
    toasts,
    settingsSetYamlCalls,
  });
  // Patch createElement to capture <a> downloads
  ctx.document.createElement = (tag) => {
    if (tag === 'a') {
      return { href: '', download: '', click() { downloads.push({ href: this.href, download: this.download }); } };
    }
    const el = dom.el('__created__' + tag);
    el.tagName = tag;
    return el;
  };
  // Patch toast-stack to capture toasts
  dom.el('toast-stack').appendChild = (el) => toasts.push(el.className + ':' + el.innerHTML);
  return { ctx, downloads, toasts, settingsSetYamlCalls };
}

// ── Export tests ─────────────────────────────────────────────────────────────

test('exportZip triggers download with timestamped filename', async () => {
  const dom = makeDOM();
  const { ctx, downloads } = makeCtx({ dom });
  loadBackup(ctx);

  await ctx.window.yamlBackup.exportZip();

  assert.equal(downloads.length, 1);
  assert.match(downloads[0].download, /^mkcv-backup-\d{4}-\d{2}-\d{2}\.zip$/);
});

test('exportZip includes both yaml files in zip', async () => {
  const dom = makeDOM();
  const zippedFiles = {};

  function JSZip() { this._files = zippedFiles; }
  JSZip.prototype.file = function(name, content) {
    if (content !== undefined) { this._files[name] = content; return this; }
    return null;
  };
  JSZip.prototype.generateAsync = () => Promise.resolve(new Blob(['']));
  JSZip.loadAsync = () => Promise.resolve(new JSZip());

  const { ctx } = makeCtx({ dom, jszip: JSZip, resumeYaml: 'name: Alice\n', settingsYaml: 'template: boardroom\n' });
  loadBackup(ctx);

  await ctx.window.yamlBackup.exportZip();

  assert.equal(zippedFiles['resume.yaml'], 'name: Alice\n');
  assert.equal(zippedFiles['settings.yaml'], 'template: boardroom\n');
});

// ── Import error tests ────────────────────────────────────────────────────────

test('importZip shows toast when zip is corrupt', async () => {
  const dom = makeDOM();
  const { ctx, toasts } = makeCtx({ dom, jszip: makeJSZipStub({ throwOnLoad: true }) });
  loadBackup(ctx);

  await ctx.window.yamlBackup.importZip(new Blob());

  assert.ok(toasts.some(t => t.includes('Could not read zip file')));
});

test('importZip shows toast when no yaml files found', async () => {
  const dom = makeDOM();
  const { ctx, toasts } = makeCtx({ dom, jszip: makeJSZipStub({ files: {} }) });
  loadBackup(ctx);

  await ctx.window.yamlBackup.importZip(new Blob());

  assert.ok(toasts.some(t => t.includes('No YAML files found')));
});

test('importZip shows toast when resume.yaml is invalid YAML', async () => {
  const dom = makeDOM();
  const jszip = makeJSZipStub({ files: { 'resume.yaml': '__invalid__' } });
  const { ctx, toasts } = makeCtx({ dom, jszip });
  loadBackup(ctx);

  await ctx.window.yamlBackup.importZip(new Blob());

  assert.ok(toasts.some(t => t.includes('Invalid YAML in') && t.includes('resume.yaml')));
});

test('importZip shows toast when settings.yaml has parse errors', async () => {
  const dom = makeDOM();
  const jszip = makeJSZipStub({ files: { 'settings.yaml': 'bad: yaml: content' } });
  const { ctx, toasts } = makeCtx({ dom, jszip, settingsErrors: [{ msg: 'bad', line: null }] });
  loadBackup(ctx);

  await ctx.window.yamlBackup.importZip(new Blob());

  assert.ok(toasts.some(t => t.includes('Invalid YAML in') && t.includes('settings.yaml')));
});

// ── Import success path ───────────────────────────────────────────────────────

test('importZip opens modal when validation passes', async () => {
  const dom = makeDOM();
  const { ctx } = makeCtx({ dom });
  loadBackup(ctx);

  await ctx.window.yamlBackup.importZip(new Blob());

  assert.ok(dom.el('import-modal').classList.contains('open'));
});

test('confirming import calls setYaml and setValue', async () => {
  const dom = makeDOM();
  const { ctx, settingsSetYamlCalls } = makeCtx({ dom, resumeYaml: 'name: Bob\n', settingsYaml: 'template: classic\n' });
  loadBackup(ctx);

  await ctx.window.yamlBackup.importZip(new Blob());
  dom.fire('import-modal-confirm', 'click');

  assert.equal(settingsSetYamlCalls.length, 1);
  assert.equal(settingsSetYamlCalls[0], 'template: classic\n');
  assert.equal(ctx.window.editorAdapter._value, 'name: Bob\n');
});

test('confirming import closes modal', async () => {
  const dom = makeDOM();
  const { ctx } = makeCtx({ dom });
  loadBackup(ctx);

  await ctx.window.yamlBackup.importZip(new Blob());
  dom.fire('import-modal-confirm', 'click');

  assert.ok(!dom.el('import-modal').classList.contains('open'));
});

test('cancelling import closes modal without writing', async () => {
  const dom = makeDOM();
  const { ctx, settingsSetYamlCalls } = makeCtx({ dom });
  loadBackup(ctx);

  await ctx.window.yamlBackup.importZip(new Blob());
  dom.fire('import-modal-cancel', 'click');

  assert.ok(!dom.el('import-modal').classList.contains('open'));
  assert.equal(settingsSetYamlCalls.length, 0);
});

test('partial zip with only resume.yaml calls setValue but not setYaml', async () => {
  const dom = makeDOM();
  const jszip = makeJSZipStub({ files: { 'resume.yaml': 'name: Carol\n' } });
  const { ctx, settingsSetYamlCalls } = makeCtx({ dom, jszip });
  loadBackup(ctx);

  await ctx.window.yamlBackup.importZip(new Blob());
  dom.fire('import-modal-confirm', 'click');

  assert.equal(ctx.window.editorAdapter._value, 'name: Carol\n');
  assert.equal(settingsSetYamlCalls.length, 0);
});
```

- [ ] **Step 2: Run tests — expect failure (yaml-backup.js does not exist yet)**

```bash
node --test tests/test_yaml_backup.js
```

Expected: errors loading `frontend/yaml-backup.js`

- [ ] **Step 3: Create `frontend/yaml-backup.js`**

```javascript
/* global JSZip, jsyaml */
window.yamlBackup = (() => {
  function _toast(msg, type = 'info') {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const el     = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-title">${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  function _download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function _todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  async function exportZip() {
    const resumeYaml   = window.editorAdapter.getValue();
    const settingsYaml = window.settingsSync.getYaml();
    const zip = new JSZip();
    zip.file('resume.yaml',   resumeYaml);
    zip.file('settings.yaml', settingsYaml);
    const blob = await zip.generateAsync({ type: 'blob' });
    _download(blob, `mkcv-backup-${_todayStr()}.zip`);
  }

  let _pendingResume   = null;
  let _pendingSettings = null;

  function _openModal(resumeYaml, settingsYaml) {
    _pendingResume   = resumeYaml;
    _pendingSettings = settingsYaml;
    const files = [
      resumeYaml   !== null && 'resume.yaml',
      settingsYaml !== null && 'settings.yaml',
    ].filter(Boolean).join(' and ');
    document.getElementById('import-modal-body').textContent =
      `This will replace your current ${files} with the contents of the backup. Continue?`;
    document.getElementById('import-modal').classList.add('open');
  }

  function _closeModal() {
    document.getElementById('import-modal').classList.remove('open');
    _pendingResume   = null;
    _pendingSettings = null;
  }

  function _applyImport() {
    if (_pendingResume !== null)   window.editorAdapter.setValue(_pendingResume);
    if (_pendingSettings !== null) window.settingsSync.setYaml(_pendingSettings);
    _closeModal();
  }

  async function importZip(file) {
    let zip;
    try {
      zip = await JSZip.loadAsync(file);
    } catch {
      _toast('Could not read zip file', 'warn');
      return;
    }

    const resumeFile   = zip.file('resume.yaml');
    const settingsFile = zip.file('settings.yaml');

    if (!resumeFile && !settingsFile) {
      _toast('No YAML files found in this backup', 'warn');
      return;
    }

    const resumeYaml   = resumeFile   ? await resumeFile.async('string')   : null;
    const settingsYaml = settingsFile ? await settingsFile.async('string') : null;

    if (resumeYaml !== null) {
      try { jsyaml.load(resumeYaml); }
      catch { _toast('Invalid YAML in `resume.yaml`', 'warn'); return; }
    }
    if (settingsYaml !== null) {
      const { errors } = window.SETTINGS_HELPERS.parseSettings(settingsYaml);
      if (errors.length) { _toast('Invalid YAML in `settings.yaml`', 'warn'); return; }
    }

    _openModal(resumeYaml, settingsYaml);
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-yaml-export').addEventListener('click', () => exportZip());
    document.getElementById('btn-yaml-import').addEventListener('click', () => {
      document.getElementById('import-yaml-input').click();
    });
    document.getElementById('import-yaml-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importZip(file);
      e.target.value = '';
    });
    document.getElementById('import-modal-cancel').addEventListener('click', _closeModal);
    document.getElementById('import-modal-confirm').addEventListener('click', _applyImport);
    document.getElementById('import-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) _closeModal();
    });
  });

  return { exportZip, importZip };
})();
```

- [ ] **Step 4: Run all tests — expect PASS**

```bash
node --test tests/test_yaml_backup.js
```

Expected: all tests pass (11 total)

- [ ] **Step 5: Commit**

```bash
git add frontend/yaml-backup.js tests/test_yaml_backup.js
git commit -m "feat: add yaml-backup.js with export and import logic"
```

---

## Task 5: Smoke test in the browser

This feature involves browser-only APIs (JSZip, Blob, file picker). Verify manually:

- [ ] Start the dev server and open the app in a browser
- [ ] Open the Export menu — confirm the `<hr>` divider and two new items appear below Markdown
- [ ] Click **↓ YAML backup** — confirm a `.zip` file downloads with today's date in its name
- [ ] Unzip the file — confirm it contains `resume.yaml` and `settings.yaml` with the current editor content
- [ ] Edit some text in the resume editor, then click **↑ Import YAML…** and select the zip you just downloaded
- [ ] Confirm the modal appears listing the files to be restored
- [ ] Click **Import** — confirm the editor content is restored and the modal closes
- [ ] Click **↑ Import YAML…** again, select a non-zip file — confirm a toast appears: "Could not read zip file"
- [ ] Click **Cancel** in the modal — confirm the modal closes and no changes are applied

- [ ] **Commit if any fixes were needed from smoke test**

```bash
git add -A
git commit -m "fix: yaml backup smoke test corrections"
```
