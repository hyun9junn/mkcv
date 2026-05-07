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
  const documentListeners = new Map();
  const elements = new Map();
  const previewCalls = { zoomIn: 0, zoomOut: 0, resetZoom: 0, refit: 0 };
  const editorCalls = { zoomIn: 0, zoomOut: 0, resetZoom: 0 };

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
      trigger(type, event = {}) {
        for (const cb of listeners.get(type) || []) cb(event);
      },
      click() {
        for (const cb of listeners.get('click') || []) cb({ stopPropagation() {} });
      },
      querySelectorAll(selector) { return []; },
      querySelector() { return null; },
      getBoundingClientRect() { return { left: 0, width: 100 }; },
      hidden: false,
    };
  }

  const ids = [
    'btn-reset-all',
    'reset-all-modal',
    'reset-all-cancel',
    'reset-all-confirm',
    'btn-pdf',
    'btn-tex',
    'btn-md',
    'btn-yaml-export',
    'btn-yaml-import',
    'export-trigger',
    'export-menu',
    'template-dropdown',
    'preview-zoom-in', 'preview-zoom-out', 'preview-zoom-label',
    'editor-zoom-in', 'editor-zoom-out', 'editor-zoom-label',
    'btn-validate-icon', 'btn-validate-template',
    'reset-sections-order-btn',
    'theme-toggle', 'theme-label',
    'gutter-handle', 'split', 'editor-pane', 'preview-pane',
    'lines-stat', 'editor-meta', 'save-dot', 'save-text', 'cursor-pos',
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
        if (type === 'DOMContentLoaded') {
          domReadyCallbacks.push(cb);
          return;
        }
        if (!documentListeners.has(type)) documentListeners.set(type, []);
        documentListeners.get(type).push(cb);
      },
      querySelector() { return null; },
      documentElement: { dataset: { theme: 'light' } },
      body: { style: {} },
    },
    location: { reload() { reloaded = true; } },
    window: {},
    preview: {
      zoomIn() { previewCalls.zoomIn += 1; },
      zoomOut() { previewCalls.zoomOut += 1; },
      resetZoom() { previewCalls.resetZoom += 1; },
      refit() { previewCalls.refit += 1; },
    },
    editorAdapter: {
      zoomIn() { editorCalls.zoomIn += 1; },
      zoomOut() { editorCalls.zoomOut += 1; },
      resetZoom() { editorCalls.resetZoom += 1; },
      onChange() {},
      onCursorActivity() {},
      getCursor() { return { line: 0, ch: 0 }; },
    },
    app: {
      state: { template: 'classic', yaml: 'name: Test\n', lang: 'en' },
      setLang(lang) { this.state.lang = lang; },
    },
    settingsSync: null,
    templateRegistry: null,
    onboarding: { init() {}, show() {} },
  };
  ctx.window = ctx;
  return {
    ctx,
    store,
    elements,
    domReadyCallbacks,
    previewCalls,
    editorCalls,
    dispatchDocumentEvent(type, event) {
      for (const cb of documentListeners.get(type) || []) cb(event);
    },
    get reloaded() { return reloaded; },
  };
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
  store.set('mkcv_migrated_to_settings_yaml', '1');
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
  assert.equal(store.has('mkcv_migrated_to_settings_yaml'), false, 'migration flag should be cleared');
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

function createKeyEvent(overrides = {}) {
  return {
    key: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {},
    ...overrides,
  };
}

test('cmd/ctrl +/-/0 no longer hijacks browser zoom for preview', () => {
  const { domReadyCallbacks, dispatchDocumentEvent, previewCalls, ctx } = makeContext();
  boot(ctx, domReadyCallbacks);

  const zoomInEvent = createKeyEvent({ key: '=', metaKey: true });
  dispatchDocumentEvent('keydown', zoomInEvent);

  const zoomOutEvent = createKeyEvent({ key: '-', ctrlKey: true });
  dispatchDocumentEvent('keydown', zoomOutEvent);

  const resetEvent = createKeyEvent({ key: '0', metaKey: true });
  dispatchDocumentEvent('keydown', resetEvent);

  assert.deepEqual(previewCalls, { zoomIn: 0, zoomOut: 0, resetZoom: 0, refit: 0 });
  assert.equal(zoomInEvent.defaultPrevented, false);
  assert.equal(zoomOutEvent.defaultPrevented, false);
  assert.equal(resetEvent.defaultPrevented, false);
});

test('alt+cmd/ctrl +/-/0 still controls preview zoom', () => {
  const { domReadyCallbacks, dispatchDocumentEvent, previewCalls, ctx } = makeContext();
  boot(ctx, domReadyCallbacks);

  const zoomInEvent = createKeyEvent({ key: '+', altKey: true, metaKey: true });
  dispatchDocumentEvent('keydown', zoomInEvent);

  const zoomOutEvent = createKeyEvent({ key: '-', altKey: true, ctrlKey: true });
  dispatchDocumentEvent('keydown', zoomOutEvent);

  const resetEvent = createKeyEvent({ key: '0', altKey: true, metaKey: true });
  dispatchDocumentEvent('keydown', resetEvent);

  assert.equal(previewCalls.zoomIn, 1);
  assert.equal(previewCalls.zoomOut, 1);
  assert.equal(previewCalls.resetZoom, 1);
  assert.equal(zoomInEvent.defaultPrevented, true);
  assert.equal(zoomOutEvent.defaultPrevented, true);
  assert.equal(resetEvent.defaultPrevented, true);
});
