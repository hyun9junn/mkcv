const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('settingsSync exposes setYaml', () => {
  const src = fs.readFileSync('frontend/settings-sync.js', 'utf8');
  const ctx = vm.createContext({
    document: {
      addEventListener() {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    window: {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    console,
  });
  ctx.jsyaml = { load: () => ({}) };
  const settingsHelpers = {
    parseSettings: () => ({ value: {}, errors: [], warnings: [] }),
    settingsToYaml: (s) => JSON.stringify(s),
    DEFAULT_SETTINGS: {
      template: 'classic',
      layout: { density: 'balanced', font_scale: 'normal' },
      personal: { default_link_display: 'label', fields: [] },
      sections: [],
    },
    normalizeTemplateDefaults: () => ({}),
    VALID_TPL: ['classic'],
    VALID_DENSITY: ['balanced'],
    VALID_FONT: ['normal'],
    SECTION_CATALOG: [],
    KNOWN_KEYS: new Set(),
  };
  ctx.SETTINGS_HELPERS = settingsHelpers;
  ctx.window.SETTINGS_HELPERS = settingsHelpers;
  ctx.window.editorAdapter = {
    getValue: () => '',
    setValue() {},
    setValueSilently() {},
    setValuePreserveScroll() {},
    onChange() {},
    clearHistory() {},
  };
  ctx.app = { state: {}, setState() {} };
  ctx.sectionsState = { rebuild() {}, getOrderedFilteredYaml: (y) => y, getVisibleOrder: () => [] };
  ctx.window.settingsSync = null;
  try { vm.runInContext(src, ctx); } catch {}
  assert.ok(
    typeof ctx.window.settingsSync?.setYaml === 'function',
    'setYaml should be a function on settingsSync'
  );
});

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
          add(c)      { elements[id].className += ' ' + c; },
          remove(c)   { elements[id].className = elements[id].className.replace(' ' + c, ''); },
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

function loadBackup(ctx) {
  const src = require('fs').readFileSync('frontend/yaml-backup.js', 'utf8');
  require('vm').runInContext(src, ctx);
}

function makeCtx({ dom, jszip, resumeYaml = 'name: Test\n', settingsYaml = 'template: classic\n', settingsErrors = [] } = {}) {
  const downloads = [];
  const toasts = [];
  const settingsSetYamlCalls = [];

  const ctx = require('vm').createContext({
    document: {
      addEventListener(type, fn) { if (type === 'DOMContentLoaded') fn(); },
      getElementById: (id) => dom.el(id),
      createElement(tag) {
        if (tag === 'a') {
          return {
            href: '', download: '',
            click() { downloads.push({ href: this.href, download: this.download }); },
          };
        }
        const e = dom.el('__' + tag + '_' + Math.random());
        e.tagName = tag;
        return e;
      },
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
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
    setTimeout: () => 0,
    console,
    downloads,
    toasts,
    settingsSetYamlCalls,
  });

  dom.el('toast-stack').appendChild = (e) => toasts.push(e.className + ':' + e.innerHTML);

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
