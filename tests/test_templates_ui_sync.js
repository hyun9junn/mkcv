const test = require('node:test');
const assert = require('node:assert/strict');

// Phase 2: templates.js was converted from IIFE-on-window to ESM. This
// harness drives the same scenarios through the ESM module — DOM lives in
// happy-dom, `app.state` is mutated on the live singleton, and
// `window.settingsSync` is injected directly onto `globalThis`. Preview
// refresh is captured by monkey-patching the imported preview singleton.
// The `_resetForTesting` hook provided by the module allows tests to start
// from a clean slate between runs.

// Stores the pending preview.refresh restore function between createContext
// and afterEach without needing to import the module at the top level.
let _restorePreviewRefresh = null;

async function createContext() {
  const { app } = await import('../frontend/src/app.js');
  const { sectionsState } = await import('../frontend/src/sections-state.js');
  const {
    templateRegistry,
    templateUI,
    initTemplates,
    _resetForTesting,
  } = await import('../frontend/src/templates.js');
  const previewMod = await import('../frontend/src/preview.js');

  _resetForTesting();

  app.state = Object.assign(app.state, {
    yaml: 'summary: Hello\n',
    template: 'classic',
  });

  const refreshCalls = [];
  const syncedSettings = [];
  const defaultApplications = [];

  // Monkey-patch the live preview.refresh so selectTemplate() calls are captured
  // without triggering real PDF fetches. The original tests injected window.preview;
  // now that templates.js imports preview directly via ESM we patch the binding.
  const realPreviewRefresh = previewMod.preview.refresh;
  previewMod.preview.refresh = (yaml, template) => {
    refreshCalls.push({ yaml, template });
  };
  _restorePreviewRefresh = () => { previewMod.preview.refresh = realPreviewRefresh; };

  const settingsState = {
    template: 'classic',
    layout: { density: 'balanced', font_scale: 'normal' },
    personal: { default_link_display: 'label', fields: [] },
    sections: [],
  };

  const signatureDefaults = {
    layout: { density: 'balanced', font_scale: 'normal' },
    personal: { default_link_display: 'label', fields: [] },
    sections: [{ key: 'summary', title: 'Statement', visible: true }],
  };

  window.settingsSync = {
    updateFromToolbar(mutator) {
      const next = JSON.parse(JSON.stringify(settingsState));
      mutator(next);
      settingsState.template = next.template;
      settingsState.layout = next.layout;
      settingsState.personal = next.personal;
      settingsState.sections = next.sections;
      syncedSettings.push(JSON.parse(JSON.stringify(next)));
    },
    applyTemplateDefaults(defaults) {
      defaultApplications.push(defaults);
    },
    getSettings() {
      return JSON.parse(JSON.stringify(settingsState));
    },
  };

  // Stub fetch for the /api/templates call.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url === '/api/templates') {
      return {
        json: async () => ({
          templates: ['classic', 'signature-split'],
          meta: {
            classic: {
              display_name: 'Classic',
              description: 'Default.',
              defaults: { layout: { density: 'balanced', font_scale: 'normal' }, personal: { default_link_display: 'label', fields: [] }, sections: [] },
            },
            'signature-split': {
              display_name: 'Signature Split',
              description: 'Creative direction.',
              ui: { badge: 'Popular' },
              defaults: signatureDefaults,
            },
          },
          validation: {
            classic: { valid: true, errors: [] },
            'signature-split': { valid: true, errors: [] },
          },
        }),
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  // Build the DOM that initTemplates expects.
  document.body.innerHTML = `
    <div id="template-select-wrapper">
      <button id="template-trigger"></button>
      <div id="template-dropdown" hidden>
        <div id="template-grid"></div>
        <div id="tpl-popover-portal" hidden></div>
      </div>
    </div>
    <span id="tpl-name-display"></span>
    <div id="error-banner" style="display:none"></div>
    <button id="btn-validate-template"></button>
    <div id="preview-pane-title"></div>
    <div id="toast-stack"></div>
  `;

  // initTemplates is async (fetches /api/templates).
  await initTemplates();

  globalThis.fetch = originalFetch;

  const elements = {
    get(id) { return document.getElementById(id); },
  };

  return {
    templateUI,
    templateRegistry,
    elements,
    refreshCalls,
    syncedSettings,
    defaultApplications,
    signatureDefaults,
    app,
  };
}

test.afterEach(() => {
  document.body.innerHTML = '';
  delete window.settingsSync;
  if (_restorePreviewRefresh) { _restorePreviewRefresh(); _restorePreviewRefresh = null; }
});

test('template selection syncs settings.yaml and applies template defaults', async () => {
  const {
    templateUI: tui,
    elements,
    refreshCalls,
    syncedSettings,
    defaultApplications,
    signatureDefaults,
    app,
  } = await createContext();

  assert.equal(typeof tui?.selectTemplate, 'function');

  tui.selectTemplate('signature-split');

  assert.equal(app.state.template, 'signature-split');
  assert.equal(elements.get('tpl-name-display').textContent, 'Signature Split');
  assert.equal(elements.get('preview-pane-title').textContent, 'Preview — Signature Split');
  assert.equal(refreshCalls.at(-1).template, 'signature-split');
  assert.equal(syncedSettings.at(-1).template, 'signature-split');
  assert.deepEqual(JSON.parse(JSON.stringify(defaultApplications.at(-1))), signatureDefaults);
});

test('template picker shows badge from template metadata', async (t) => {
  t.mock.timers.enable(['setTimeout']);

  const { elements } = await createContext();

  const portal = elements.get('tpl-popover-portal');
  const cards = elements.get('template-grid').children;
  const signatureCard = Array.from(cards).find((child) => child.dataset.name === 'signature-split');

  signatureCard.dispatchEvent(new Event('mouseenter'));
  t.mock.timers.tick(150);

  assert.match(portal.innerHTML, /Popular/);

  t.mock.timers.reset();
});

test('template picker renders tpl-card elements with thumbnail img src', async () => {
  const { elements } = await createContext();

  const cards = Array.from(elements.get('template-grid').children);
  assert.equal(cards.length, 2, 'one card per template');

  const classicCard = cards.find((c) => c.dataset.name === 'classic');
  assert.ok(classicCard, 'classic card exists');
  assert.ok(classicCard.classList.contains('tpl-card'), 'card has tpl-card class');
  assert.ok(classicCard.classList.contains('col-1'), 'first card is col-1');
  assert.match(classicCard.innerHTML, /\/assets\/template-previews\/classic\.png/);
});

test('hovering a card shows description and badge in portal', async (t) => {
  t.mock.timers.enable(['setTimeout']);

  const { elements } = await createContext();

  const portal = elements.get('tpl-popover-portal');
  const cards = Array.from(elements.get('template-grid').children);
  const sigCard = cards.find((c) => c.dataset.name === 'signature-split');
  assert.ok(sigCard, 'signature-split card exists');
  assert.ok(sigCard.classList.contains('col-2'), 'second card is col-2');

  sigCard.dispatchEvent(new Event('mouseenter'));
  t.mock.timers.tick(150);

  assert.match(portal.innerHTML, /Creative direction/);
  assert.match(portal.innerHTML, /Popular/);

  t.mock.timers.reset();
});

test('syncSelectedOption updates tpl-card selected class', async () => {
  const { templateUI: tui, elements } = await createContext();

  tui.selectTemplate('signature-split');

  const cards = Array.from(elements.get('template-grid').children);
  const classicCard = cards.find((c) => c.dataset.name === 'classic');
  const sigCard = cards.find((c) => c.dataset.name === 'signature-split');

  assert.ok(!classicCard.classList.contains('selected'), 'classic no longer selected');
  assert.ok(sigCard.classList.contains('selected'), 'signature-split now selected');
});

test('clicking a card does not apply the template', async () => {
  const { app, elements, refreshCalls } = await createContext();

  const cards = Array.from(elements.get('template-grid').children);
  const sigCard = cards.find(c => c.dataset.name === 'signature-split');
  assert.ok(sigCard, 'signature-split card found');

  sigCard.click();

  assert.equal(app.state.template, 'classic', 'template unchanged after card click');
  assert.equal(refreshCalls.length, 0, 'no preview refresh triggered by card click');
});

test('hovering a card shows portal with image src, metadata, and use button', async (t) => {
  t.mock.timers.enable(['setTimeout']);

  const { elements } = await createContext();

  const portal = elements.get('tpl-popover-portal');
  const cards = Array.from(elements.get('template-grid').children);
  const sigCard = cards.find(c => c.dataset.name === 'signature-split');
  assert.ok(sigCard, 'signature-split card found');

  sigCard.dispatchEvent(new Event('mouseenter'));
  t.mock.timers.tick(150);

  assert.ok(!portal.hidden, 'portal is visible after hover delay');
  assert.match(portal.innerHTML, /template-previews\/signature-split\.png/, 'portal has preview image src');
  assert.match(portal.innerHTML, /Creative direction/, 'portal has description');
  assert.match(portal.innerHTML, /Popular/, 'portal has badge');
  assert.match(portal.innerHTML, /Use this template/, 'portal has use button');

  t.mock.timers.reset();
});

test('clicking Use this template in portal applies the template', async (t) => {
  t.mock.timers.enable(['setTimeout']);

  const { app, elements, refreshCalls } = await createContext();

  const portal = elements.get('tpl-popover-portal');
  const cards = Array.from(elements.get('template-grid').children);
  const sigCard = cards.find(c => c.dataset.name === 'signature-split');

  sigCard.dispatchEvent(new Event('mouseenter'));
  t.mock.timers.tick(150);

  const useBtn = portal.querySelector('.tpl-use-btn');
  assert.ok(useBtn, 'use button exists in portal');
  useBtn.click();

  assert.equal(app.state.template, 'signature-split', 'template applied after button click');
  assert.ok(refreshCalls.length > 0, 'preview refresh triggered after button click');

  t.mock.timers.reset();
});
