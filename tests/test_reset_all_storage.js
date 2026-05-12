const test = require('node:test');
const assert = require('node:assert/strict');

// Phase 2: the inline UI wiring script was extracted to frontend/src/ui-wiring.js.
// These tests drive the same scenarios through the ESM module — DOM lives in
// happy-dom (via setup-dom.mjs), module singletons (preview, editorAdapter, app,
// onboarding) are monkey-patched on the live bindings, and clearMkcvStorage is
// tested as an exported function.

const ELEMENT_IDS = [
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

function buildDOM() {
  document.body.innerHTML = ELEMENT_IDS
    .map(id => `<div id="${id}" class="modal-backdrop"></div>`)
    .join('\n');
  // export-menu needs children with .export-option[data-export]
  const exportMenu = document.getElementById('export-menu');
  exportMenu.innerHTML = `
    <div class="export-option" data-export="pdf">PDF</div>
    <div class="export-option" data-export="tex">LaTeX</div>
    <div class="export-option" data-export="md">Markdown</div>
  `;
  // theme-label needs a textContent setter
  const themeLabel = document.getElementById('theme-label');
  themeLabel.textContent = 'Light';
}

test.afterEach(() => {
  document.body.innerHTML = '';
  if (globalThis.localStorage) localStorage.clear();
});

test('clearMkcvStorage removes all mkcv-prefixed keys and leaves others', async () => {
  const { clearMkcvStorage } = await import('../frontend/src/ui-wiring.js');

  localStorage.setItem('mkcv:default:resume.yaml', 'name: Test');
  localStorage.setItem('mkcv:default:settings.yaml', 'template: classic');
  localStorage.setItem('mkcv_theme', 'dark');
  localStorage.setItem('mkcv_sections_state', '{}');
  localStorage.setItem('mkcv_density', 'compact');
  localStorage.setItem('mkcv_font_scale', 'large');
  localStorage.setItem('mkcv_migrated_to_settings_yaml', '1');
  localStorage.setItem('mkcv_yaml', 'old');
  localStorage.setItem('mkcv_settings_yaml', 'old');
  localStorage.setItem('some_other_app_key', 'keep me');

  clearMkcvStorage();

  assert.equal(localStorage.getItem('mkcv:default:resume.yaml'), null, 'resume key should be cleared');
  assert.equal(localStorage.getItem('mkcv:default:settings.yaml'), null, 'settings key should be cleared');
  assert.equal(localStorage.getItem('mkcv_theme'), null, 'theme key should be cleared');
  assert.equal(localStorage.getItem('mkcv_sections_state'), null, 'sections state key should be cleared');
  assert.equal(localStorage.getItem('mkcv_density'), null, 'density key should be cleared');
  assert.equal(localStorage.getItem('mkcv_font_scale'), null, 'font scale key should be cleared');
  assert.equal(localStorage.getItem('mkcv_migrated_to_settings_yaml'), null, 'migration flag should be cleared');
  assert.equal(localStorage.getItem('mkcv_yaml'), null, 'legacy yaml key should be cleared');
  assert.equal(localStorage.getItem('mkcv_settings_yaml'), null, 'legacy settings key should be cleared');
  assert.equal(localStorage.getItem('some_other_app_key'), 'keep me', 'non-mkcv keys must be preserved');
});

test('clearMkcvStorage handles empty localStorage without errors', async () => {
  const { clearMkcvStorage } = await import('../frontend/src/ui-wiring.js');
  assert.doesNotThrow(() => clearMkcvStorage());
  assert.equal(localStorage.length, 0);
});

async function bootUIWiring() {
  buildDOM();

  // Monkey-patch live preview singleton methods.
  const previewMod = await import('../frontend/src/preview.js');
  const previewCalls = { zoomIn: 0, zoomOut: 0, resetZoom: 0, refit: 0 };
  const origZoomIn    = previewMod.preview.zoomIn;
  const origZoomOut   = previewMod.preview.zoomOut;
  const origResetZoom = previewMod.preview.resetZoom;
  const origRefit     = previewMod.preview.refit;
  previewMod.preview.zoomIn    = () => { previewCalls.zoomIn    += 1; };
  previewMod.preview.zoomOut   = () => { previewCalls.zoomOut   += 1; };
  previewMod.preview.resetZoom = () => { previewCalls.resetZoom += 1; };
  previewMod.preview.refit     = () => { previewCalls.refit     += 1; };

  // Monkey-patch live editorAdapter singleton methods.
  const editorMod = await import('../frontend/src/editor-adapter.js');
  const editorCalls = { zoomIn: 0, zoomOut: 0, resetZoom: 0 };
  const origEdZoomIn        = editorMod.editorAdapter.zoomIn;
  const origEdZoomOut       = editorMod.editorAdapter.zoomOut;
  const origEdResetZoom     = editorMod.editorAdapter.resetZoom;
  const origOnChange        = editorMod.editorAdapter.onChange;
  const origOnCursorActivity = editorMod.editorAdapter.onCursorActivity;
  const origGetCursor       = editorMod.editorAdapter.getCursor;
  editorMod.editorAdapter.zoomIn          = () => { editorCalls.zoomIn    += 1; };
  editorMod.editorAdapter.zoomOut         = () => { editorCalls.zoomOut   += 1; };
  editorMod.editorAdapter.resetZoom       = () => { editorCalls.resetZoom += 1; };
  editorMod.editorAdapter.onChange          = () => {};
  editorMod.editorAdapter.onCursorActivity  = () => {};
  editorMod.editorAdapter.getCursor         = () => ({ line: 0, ch: 0 });

  // Monkey-patch live onboarding singleton.
  const onboardingMod = await import('../frontend/src/onboarding.js');
  const origOnboardingInit = onboardingMod.onboarding.init;
  const origOnboardingShow = onboardingMod.onboarding.show;
  onboardingMod.onboarding.init = () => {};
  onboardingMod.onboarding.show = () => {};

  const { initUIWiring, _removeDocumentListenersForTesting } =
    await import('../frontend/src/ui-wiring.js');
  initUIWiring();

  function restore() {
    // Remove document-level listeners added by this initUIWiring() call so they
    // do not interfere with the next test.
    _removeDocumentListenersForTesting();

    previewMod.preview.zoomIn    = origZoomIn;
    previewMod.preview.zoomOut   = origZoomOut;
    previewMod.preview.resetZoom = origResetZoom;
    previewMod.preview.refit     = origRefit;
    editorMod.editorAdapter.zoomIn           = origEdZoomIn;
    editorMod.editorAdapter.zoomOut          = origEdZoomOut;
    editorMod.editorAdapter.resetZoom        = origEdResetZoom;
    editorMod.editorAdapter.onChange         = origOnChange;
    editorMod.editorAdapter.onCursorActivity = origOnCursorActivity;
    editorMod.editorAdapter.getCursor        = origGetCursor;
    onboardingMod.onboarding.init = origOnboardingInit;
    onboardingMod.onboarding.show = origOnboardingShow;
  }

  return { previewCalls, editorCalls, restore };
}

function fireKeydown(overrides = {}) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...overrides,
  });
  document.dispatchEvent(event);
  return event;
}

test('cmd/ctrl +/-/0 no longer hijacks browser zoom for preview', async () => {
  const { previewCalls, restore } = await bootUIWiring();
  try {
    const zoomInEvent  = fireKeydown({ key: '=', metaKey: true });
    const zoomOutEvent = fireKeydown({ key: '-', ctrlKey: true });
    const resetEvent   = fireKeydown({ key: '0', metaKey: true });

    assert.deepEqual(previewCalls, { zoomIn: 0, zoomOut: 0, resetZoom: 0, refit: 0 });
    assert.equal(zoomInEvent.defaultPrevented,  false);
    assert.equal(zoomOutEvent.defaultPrevented, false);
    assert.equal(resetEvent.defaultPrevented,   false);
  } finally {
    restore();
  }
});

test('alt+cmd/ctrl +/-/0 still controls preview zoom', async () => {
  const { previewCalls, restore } = await bootUIWiring();
  try {
    const zoomInEvent  = fireKeydown({ key: '+', altKey: true, metaKey: true });
    const zoomOutEvent = fireKeydown({ key: '-', altKey: true, ctrlKey: true });
    const resetEvent   = fireKeydown({ key: '0', altKey: true, metaKey: true });

    assert.equal(previewCalls.zoomIn,    1);
    assert.equal(previewCalls.zoomOut,   1);
    assert.equal(previewCalls.resetZoom, 1);
    assert.equal(zoomInEvent.defaultPrevented,  true);
    assert.equal(zoomOutEvent.defaultPrevented, true);
    assert.equal(resetEvent.defaultPrevented,   true);
  } finally {
    restore();
  }
});
