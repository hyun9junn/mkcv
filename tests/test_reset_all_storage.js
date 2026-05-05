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
  };

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
      querySelectorAll(selector) { return []; },
      hidden: false,
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
    TextEncoder,
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
    editorAdapter: { zoomIn() {}, zoomOut() {}, resetZoom() {}, onChange() {}, onCursorActivity() {}, getCursor() { return { line: 0, ch: 0 }; } },
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
