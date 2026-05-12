const test = require('node:test');
const assert = require('node:assert/strict');

// Phase 2: yaml-backup.js and settings-sync.js were converted from IIFE-on-
// window to ESM. This harness drives the same scenarios by:
//  - Importing the real ESM yamlBackup module
//  - Monkey-patching editorAdapter and settingsSync live exports for each test
//  - Injecting JSZip / jsyaml stubs via globalThis
//  - Building a real happy-dom DOM for each test

// ── Shared helpers ────────────────────────────────────────────────────────────

function makeJSZipStub({ files = {}, throwOnLoad = false } = {}) {
  function JSZip() { this._files = {}; }
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
    : () => Promise.resolve(new JSZip());
  return JSZip;
}

function buildDOM() {
  const ids = [
    'btn-yaml-export', 'btn-yaml-import', 'import-yaml-input',
    'import-modal-cancel', 'import-modal-confirm', 'import-modal',
    'import-modal-body', 'toast-stack',
  ];
  for (const id of ids) {
    if (!document.getElementById(id)) {
      const el = document.createElement(
        id === 'import-yaml-input' ? 'input' : 'div'
      );
      el.id = id;
      document.body.appendChild(el);
    }
  }
}

// Track the pending test teardown for cleanup in afterEach.
let _currentTeardown = null;

test.afterEach(async () => {
  if (_currentTeardown) {
    _currentTeardown();
    _currentTeardown = null;
  }
  document.body.innerHTML = '';
  if (globalThis.localStorage) localStorage.clear();
  // Restore globalThis stubs
  delete globalThis.JSZip;
  delete globalThis.jsyaml;
});

// ── createContext ─────────────────────────────────────────────────────────────

async function createContext({
  resumeYaml = 'name: Test\n',
  settingsYaml = 'template: classic\n',
  settingsErrors = [],
  jszip,
} = {}) {
  const downloads = [];
  const settingsSetYamlCalls = [];

  // Build a minimal DOM.
  buildDOM();

  // Import the real ESM modules.
  const editorAdapterMod = await import('../frontend/src/editor-adapter.js');
  const settingsSyncMod  = await import('../frontend/src/settings-sync.js');
  const { yamlBackup, initYamlBackup } = await import('../frontend/src/yaml-backup.js');

  // Monkey-patch editorAdapter live export (object property replacement).
  const origEditorGetValue = editorAdapterMod.editorAdapter.getValue;
  const origEditorSetValue = editorAdapterMod.editorAdapter.setValue;
  editorAdapterMod.editorAdapter.getValue = () => resumeYaml;
  editorAdapterMod.editorAdapter.setValue = (v) => {
    editorAdapterMod.editorAdapter._testValue = v;
  };

  // Monkey-patch settingsSync live export.
  const origGetYaml  = settingsSyncMod.settingsSync.getYaml;
  const origSetYaml  = settingsSyncMod.settingsSync.setYaml;
  settingsSyncMod.settingsSync.getYaml = () => settingsYaml;
  settingsSyncMod.settingsSync.setYaml = (y) => settingsSetYamlCalls.push(y);

  // Stub SETTINGS_HELPERS.parseSettings via globalThis so yaml-backup.js can read it.
  // (yaml-backup imports parseSettings from SETTINGS_HELPERS which is imported from settings-engine.js)
  // We need to override the live parseSettings — import settings-engine and patch it.
  const settingsEngineMod = await import('../frontend/src/settings-engine.js');
  const origParseSettings = settingsEngineMod.SETTINGS_HELPERS.parseSettings;
  settingsEngineMod.SETTINGS_HELPERS.parseSettings = () => ({
    errors: settingsErrors,
    warnings: [],
    value: {},
  });

  // Inject JSZip and jsyaml into globalThis.
  globalThis.JSZip = jszip || makeJSZipStub({
    files: { 'resume.yaml': resumeYaml, 'settings.yaml': settingsYaml },
  });
  globalThis.jsyaml = {
    load: (y) => { if (y === '__invalid__') throw new Error('bad yaml'); return {}; },
  };

  // Stub URL.createObjectURL / revokeObjectURL and intercept anchor clicks.
  const origCreateObjectURL = URL.createObjectURL;
  const origRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = () => 'blob:fake';
  URL.revokeObjectURL = () => {};

  // Intercept <a> click for download capture.
  const origCreateElement = document.createElement.bind(document);
  const savedCreateElement = globalThis.document.createElement.bind(globalThis.document);
  globalThis.document.createElement = (tag) => {
    const el = origCreateElement(tag);
    if (tag === 'a') {
      const origClick = el.click.bind(el);
      el.click = function () {
        downloads.push({ href: this.href, download: this.download });
      };
    }
    return el;
  };

  // Wire up DOM event listeners via initYamlBackup.
  initYamlBackup();

  _currentTeardown = () => {
    // Restore all monkey-patches.
    editorAdapterMod.editorAdapter.getValue = origEditorGetValue;
    editorAdapterMod.editorAdapter.setValue = origEditorSetValue;
    delete editorAdapterMod.editorAdapter._testValue;
    settingsSyncMod.settingsSync.getYaml = origGetYaml;
    settingsSyncMod.settingsSync.setYaml = origSetYaml;
    settingsEngineMod.SETTINGS_HELPERS.parseSettings = origParseSettings;
    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
    globalThis.document.createElement = savedCreateElement;
  };

  // Helper: fire a DOM event on an element.
  function fire(id, type, extra = {}) {
    const el = document.getElementById(id);
    const evt = Object.assign({ target: el, currentTarget: el }, extra);
    el.dispatchEvent(Object.assign(new Event(type), evt));
  }

  return {
    yamlBackup,
    downloads,
    settingsSetYamlCalls,
    getEditorValue: () => editorAdapterMod.editorAdapter._testValue,
    getImportModalOpen: () => document.getElementById('import-modal').classList.contains('open'),
    getToasts: () => Array.from(document.getElementById('toast-stack').children),
    clickConfirm: () => document.getElementById('import-modal-confirm').click(),
    clickCancel: () => document.getElementById('import-modal-cancel').click(),
  };
}

// ── Export tests ─────────────────────────────────────────────────────────────

test('exportZip triggers download with timestamped filename', async () => {
  const { yamlBackup, downloads } = await createContext();
  await yamlBackup.exportZip();
  assert.equal(downloads.length, 1);
  assert.match(downloads[0].download, /^mkcv-backup-\d{4}-\d{2}-\d{2}\.zip$/);
});

test('exportZip includes both yaml files in zip', async () => {
  const zippedFiles = {};
  function JSZip() { this._files = zippedFiles; }
  JSZip.prototype.file = function(name, content) {
    if (content !== undefined) { this._files[name] = content; return this; }
    return null;
  };
  JSZip.prototype.generateAsync = () => Promise.resolve(new Blob(['']));
  JSZip.loadAsync = () => Promise.resolve(new JSZip());
  const { yamlBackup } = await createContext({
    jszip: JSZip,
    resumeYaml: 'name: Alice\n',
    settingsYaml: 'template: boardroom\n',
  });
  await yamlBackup.exportZip();
  assert.equal(zippedFiles['resume.yaml'], 'name: Alice\n');
  assert.equal(zippedFiles['settings.yaml'], 'template: boardroom\n');
});

// ── Import error tests ────────────────────────────────────────────────────────

test('importZip shows toast when zip is corrupt', async () => {
  const { yamlBackup, getToasts } = await createContext({
    jszip: makeJSZipStub({ throwOnLoad: true }),
  });
  await yamlBackup.importZip(new Blob());
  assert.ok(getToasts().some(t => t.textContent.includes('Could not read zip file')));
});

test('importZip shows toast when no yaml files found', async () => {
  const { yamlBackup, getToasts } = await createContext({
    jszip: makeJSZipStub({ files: {} }),
  });
  await yamlBackup.importZip(new Blob());
  assert.ok(getToasts().some(t => t.textContent.includes('No YAML files found')));
});

test('importZip shows toast when resume.yaml is invalid YAML', async () => {
  const { yamlBackup, getToasts } = await createContext({
    jszip: makeJSZipStub({ files: { 'resume.yaml': '__invalid__' } }),
  });
  await yamlBackup.importZip(new Blob());
  assert.ok(getToasts().some(t =>
    t.textContent.includes('Invalid YAML in') && t.textContent.includes('resume.yaml')
  ));
});

test('importZip shows toast when settings.yaml has parse errors', async () => {
  const { yamlBackup, getToasts } = await createContext({
    jszip: makeJSZipStub({ files: { 'settings.yaml': 'bad: yaml: content' } }),
    settingsErrors: [{ msg: 'bad', line: null }],
  });
  await yamlBackup.importZip(new Blob());
  assert.ok(getToasts().some(t =>
    t.textContent.includes('Invalid YAML in') && t.textContent.includes('settings.yaml')
  ));
});

// ── Import success path ───────────────────────────────────────────────────────

test('importZip opens modal when validation passes', async () => {
  const { yamlBackup, getImportModalOpen } = await createContext();
  await yamlBackup.importZip(new Blob());
  assert.ok(getImportModalOpen());
});

test('confirming import calls setYaml and setValue', async () => {
  const { yamlBackup, settingsSetYamlCalls, clickConfirm, getEditorValue } =
    await createContext({ resumeYaml: 'name: Bob\n', settingsYaml: 'template: classic\n' });
  await yamlBackup.importZip(new Blob());
  clickConfirm();
  assert.equal(settingsSetYamlCalls.length, 1);
  assert.equal(settingsSetYamlCalls[0], 'template: classic\n');
  assert.equal(getEditorValue(), 'name: Bob\n');
});

test('confirming import closes modal', async () => {
  const { yamlBackup, getImportModalOpen, clickConfirm } = await createContext();
  await yamlBackup.importZip(new Blob());
  clickConfirm();
  assert.ok(!getImportModalOpen());
});

test('cancelling import closes modal without writing', async () => {
  const { yamlBackup, getImportModalOpen, settingsSetYamlCalls, clickCancel } =
    await createContext();
  await yamlBackup.importZip(new Blob());
  clickCancel();
  assert.ok(!getImportModalOpen());
  assert.equal(settingsSetYamlCalls.length, 0);
});

test('partial zip with only resume.yaml calls setValue but not setYaml', async () => {
  const { yamlBackup, settingsSetYamlCalls, getEditorValue, clickConfirm } =
    await createContext({
      jszip: makeJSZipStub({ files: { 'resume.yaml': 'name: Carol\n' } }),
    });
  await yamlBackup.importZip(new Blob());
  clickConfirm();
  assert.equal(getEditorValue(), 'name: Carol\n');
  assert.equal(settingsSetYamlCalls.length, 0);
});
