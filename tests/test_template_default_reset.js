const test = require('node:test');
const assert = require('node:assert/strict');
const jsyaml = require('js-yaml');

// Phase 2: settings-sync.js was converted from IIFE-on-window to ESM.
// This harness drives the same scenarios by monkey-patching the live exports of
// settings-sync.js's dependencies (editorAdapter, preview, sectionsState, etc.)
// and using _resetSettingsSyncForTesting + initSettingsSync.
// All assertions are preserved verbatim from the original test file.

function createElement() {
  const listeners = new Map();
  return {
    style: {},
    textContent: '',
    innerHTML: '',
    className: '',
    dataset: {},
    classList: { toggle() {}, add() {}, remove() {} },
    querySelectorAll() { return []; },
    appendChild() {},
    remove() {},
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    click() {
      for (const callback of listeners.get('click') || []) {
        callback({ preventDefault() {}, stopPropagation() {} });
      }
    },
  };
}

// Track per-test teardown for cleanup in afterEach.
let _currentTeardown = null;

test.afterEach(async () => {
  if (_currentTeardown) { _currentTeardown(); _currentTeardown = null; }
  if (globalThis.localStorage) localStorage.clear();
  delete globalThis.window.templateUI;
});

// ---------------------------------------------------------------------------
// createContext (builds the test's synthetic metadata — no vm, no DOM loading)
// ---------------------------------------------------------------------------

function buildTestSettingsHelpers(options = {}) {
  let order = (options.initialOrder || []).slice();
  const hidden = new Set(options.initialHidden || []);
  const sectionTitles = new Map(Object.entries(options.initialTitles || {}));

  const SECTION_CATALOG = [
    { key: 'summary', defaultTitle: 'SUMMARY' },
    { key: 'experience', defaultTitle: 'EXPERIENCE' },
    { key: 'education', defaultTitle: 'EDUCATION' },
    { key: 'skills', defaultTitle: 'SKILLS' },
    { key: 'projects', defaultTitle: 'PROJECTS' },
  ];
  const KNOWN_KEYS = new Set(['summary', 'experience', 'education', 'skills', 'projects']);
  const VALID_DENSITY = ['comfortable', 'balanced', 'compact'];
  const VALID_FONT    = ['small', 'normal', 'large'];
  const DEFAULT_SETTINGS = {
    template: 'classic',
    layout: { density: 'balanced', font_scale: 'normal' },
    personal: {
      default_link_display: 'label',
      fields: [
        { key: 'name', visible: true },
        { key: 'email', visible: true },
        { key: 'phone', visible: true },
        { key: 'location', visible: true },
        { key: 'website', visible: true, link_display: 'default' },
        { key: 'linkedin', visible: true, link_display: 'default' },
        { key: 'github', visible: true, link_display: 'default' },
        { key: 'huggingface', visible: true, link_display: 'default' },
      ],
    },
    sections: [
      { key: 'summary', title: 'SUMMARY', visible: true },
      { key: 'experience', title: 'EXPERIENCE', visible: true },
      { key: 'education', title: 'EDUCATION', visible: true },
      { key: 'skills', title: 'SKILLS', visible: true },
      { key: 'projects', title: 'PROJECTS', visible: true },
    ],
  };

  function settingsToYaml(settings) { return JSON.stringify(settings); }

  function normalizeTemplateDefaults(rawDefaults, currentTemplate) {
    const normalized = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    normalized.template = currentTemplate || DEFAULT_SETTINGS.template;
    if (rawDefaults?.layout?.density) normalized.layout.density = rawDefaults.layout.density;
    if (rawDefaults?.layout?.font_scale) normalized.layout.font_scale = rawDefaults.layout.font_scale;
    if (rawDefaults?.personal?.default_link_display) normalized.personal.default_link_display = rawDefaults.personal.default_link_display;
    if (Array.isArray(rawDefaults?.personal?.fields) && rawDefaults.personal.fields.length > 0) {
      const seen = new Set();
      normalized.personal.fields = rawDefaults.personal.fields
        .filter((field) => field && field.key && !seen.has(field.key) && seen.add(field.key))
        .map((field) => ({
          key: field.key, visible: field.visible !== false,
          ...(field.link_display ? { link_display: field.link_display } : {}),
        }))
        .concat(DEFAULT_SETTINGS.personal.fields.filter((field) => !seen.has(field.key)));
    }
    if (Array.isArray(rawDefaults?.sections) && rawDefaults.sections.length > 0) {
      const seen = new Set();
      normalized.sections = rawDefaults.sections
        .filter((section) => section && section.key && !seen.has(section.key) && seen.add(section.key))
        .map((section) => ({
          key: section.key,
          title: section.title ?? section.key.toUpperCase(),
          visible: section.visible !== false,
        }))
        .concat(DEFAULT_SETTINGS.sections.filter((section) => !seen.has(section.key)));
    }
    return normalized;
  }

  function parseSettings(raw) {
    if (!raw) {
      return {
        value: {
          template: globalThis.__testActiveTemplate || DEFAULT_SETTINGS.template,
          layout: { density: 'comfortable', font_scale: 'large' },
          personal: { default_link_display: 'both' },
          sections: order.map((key) => ({
            key, title: sectionTitles.get(key) || key.toUpperCase(), visible: !hidden.has(key),
          })),
        },
        errors: [], warnings: [],
      };
    }
    return { value: JSON.parse(raw), errors: [], warnings: [] };
  }

  return {
    SECTION_CATALOG, KNOWN_KEYS, VALID_DENSITY, VALID_FONT, DEFAULT_SETTINGS,
    settingsToYaml, normalizeTemplateDefaults, parseSettings,
    _order: { get: () => order, set: (v) => { order = v; } },
    _hidden: hidden,
  };
}

// ---------------------------------------------------------------------------
// Boot helper
// ---------------------------------------------------------------------------

async function bootSettingsSync(options = {}) {
  const { SETTINGS_HELPERS: realSH } = await import('../frontend/src/settings-engine.js');
  const appMod            = await import('../frontend/src/app.js');
  const editorAdapterMod  = await import('../frontend/src/editor-adapter.js');
  const previewMod        = await import('../frontend/src/preview.js');
  const sectionsStateMod  = await import('../frontend/src/sections-state.js');
  const sectionsUIMod     = await import('../frontend/src/sections-ui.js');
  const validatorMod      = await import('../frontend/src/validator.js');
  const {
    settingsSync,
    initSettingsSync,
    _resetSettingsSyncForTesting,
  } = await import('../frontend/src/settings-sync.js');

  // ── Build test helpers (mirrors the original context SETTINGS_HELPERS) ───────
  const testSH = buildTestSettingsHelpers(options);
  globalThis.__testActiveTemplate = options.activeTemplate || 'classic';

  // ── Patch SETTINGS_HELPERS ───────────────────────────────────────────────────
  const origSH = {
    SECTION_CATALOG: realSH.SECTION_CATALOG,
    KNOWN_KEYS: realSH.KNOWN_KEYS,
    VALID_DENSITY: realSH.VALID_DENSITY,
    VALID_FONT: realSH.VALID_FONT,
    DEFAULT_SETTINGS: realSH.DEFAULT_SETTINGS,
    settingsToYaml: realSH.settingsToYaml,
    parseSettings: realSH.parseSettings,
    normalizeTemplateDefaults: realSH.normalizeTemplateDefaults,
  };
  realSH.SECTION_CATALOG         = testSH.SECTION_CATALOG;
  realSH.KNOWN_KEYS              = testSH.KNOWN_KEYS;
  realSH.VALID_DENSITY           = testSH.VALID_DENSITY;
  realSH.VALID_FONT              = testSH.VALID_FONT;
  realSH.DEFAULT_SETTINGS        = testSH.DEFAULT_SETTINGS;
  realSH.settingsToYaml          = testSH.settingsToYaml;
  realSH.parseSettings           = testSH.parseSettings;
  realSH.normalizeTemplateDefaults = testSH.normalizeTemplateDefaults;

  // ── Seed localStorage ────────────────────────────────────────────────────────
  localStorage.clear();
  if (options.initialSettingsYaml) {
    localStorage.setItem('mkcv:default:settings.yaml', options.initialSettingsYaml);
  }

  // ── Patch app.state ──────────────────────────────────────────────────────────
  const origAppState = appMod.app.state;
  const origSetState = appMod.app.setState.bind(appMod.app);
  appMod.app.state = {
    yaml:            options.initialYaml || 'summary: first\n',
    template:        options.activeTemplate || 'signature-split',
    density:         'comfortable',
    font_scale:      'large',
    link_display:    'both',
    personal_fields: [],
  };
  appMod.app.setState = (patch) => Object.assign(appMod.app.state, patch);

  // ── Patch editorAdapter ──────────────────────────────────────────────────────
  const editorChangeCallbacks = [];
  const editorValue = { current: '' };
  const origEA = {
    getValue: editorAdapterMod.editorAdapter.getValue,
    setValue: editorAdapterMod.editorAdapter.setValue,
    setValueSilently: editorAdapterMod.editorAdapter.setValueSilently,
    setValuePreserveScroll: editorAdapterMod.editorAdapter.setValuePreserveScroll,
    getScrollInfo: editorAdapterMod.editorAdapter.getScrollInfo,
    scrollTo: editorAdapterMod.editorAdapter.scrollTo,
    suppressNextPreviewRefresh: editorAdapterMod.editorAdapter.suppressNextPreviewRefresh,
    consumeSuppressedPreviewRefresh: editorAdapterMod.editorAdapter.consumeSuppressedPreviewRefresh,
    clearHistory: editorAdapterMod.editorAdapter.clearHistory,
    closeHint: editorAdapterMod.editorAdapter.closeHint,
    onChange: editorAdapterMod.editorAdapter.onChange,
  };
  editorAdapterMod.editorAdapter.getValue = () => editorValue.current;
  editorAdapterMod.editorAdapter.setValue = (str) => {
    editorValue.current = str;
    for (const cb of editorChangeCallbacks) cb(str);
  };
  editorAdapterMod.editorAdapter.setValueSilently = (str) => { editorValue.current = str; };
  editorAdapterMod.editorAdapter.setValuePreserveScroll = (str) => {
    editorValue.current = str;
    for (const cb of editorChangeCallbacks) cb(str);
  };
  editorAdapterMod.editorAdapter.getScrollInfo = () => ({ left: 0, top: 0 });
  editorAdapterMod.editorAdapter.scrollTo = () => {};
  editorAdapterMod.editorAdapter.suppressNextPreviewRefresh = () => {};
  editorAdapterMod.editorAdapter.consumeSuppressedPreviewRefresh = () => false;
  editorAdapterMod.editorAdapter.clearHistory = () => {};
  editorAdapterMod.editorAdapter.closeHint = () => {};
  editorAdapterMod.editorAdapter.onChange = (cb) => editorChangeCallbacks.push(cb);

  // ── Patch preview, sectionsUI, validator ─────────────────────────────────────
  const counters = { previewRenders: 0, buildPanelCalls: 0, reorderCalls: [] };

  const origPreviewRefresh = previewMod.preview.refresh;
  previewMod.preview.refresh = () => { counters.previewRenders += 1; };

  const origBuildPanel = sectionsUIMod.sectionsUI.buildPanel;
  sectionsUIMod.sectionsUI.buildPanel = () => { counters.buildPanelCalls += 1; };

  const origValidate = validatorMod.validator.validate;
  validatorMod.validator.validate = () => {};

  // ── Patch sectionsState ───────────────────────────────────────────────────────
  const { _resetParseCache, _setStorage } = await import('../frontend/src/sections-state.js');
  _resetParseCache();

  const localStorageData = new Map();
  if (options.initialSettingsYaml) {
    localStorageData.set('mkcv:default:settings.yaml', options.initialSettingsYaml);
  }
  const testLocalStorage = {
    getItem(k)     { return localStorageData.has(k) ? localStorageData.get(k) : null; },
    setItem(k, v)  { localStorageData.set(k, String(v)); },
    removeItem(k)  { localStorageData.delete(k); },
  };
  _setStorage(testLocalStorage);

  // We also need globalThis.localStorage to return our test data (settings-sync uses it directly).
  const origGlobalLS = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: testLocalStorage });

  // Patch reorderMainArea on the live sectionsState object and remove
  // syncYamlToSectionState so _applySectionStateToResume takes the reorderMainArea
  // path (which this test's counters track).
  // Also reset DEFAULT_ORDER so extra built-in keys are not appended to the order.
  const origReorderMainArea = sectionsStateMod.sectionsState.reorderMainArea;
  const origSyncYamlToSectionState = sectionsStateMod.sectionsState.syncYamlToSectionState;
  const origDefaultOrder = sectionsStateMod.sectionsState.DEFAULT_ORDER;
  sectionsStateMod.sectionsState.DEFAULT_ORDER = [];
  sectionsStateMod.sectionsState.reorderMainArea = (yaml, sectionOrder) => {
    counters.reorderCalls.push(sectionOrder.slice());
    return `${yaml.trimEnd()}\n# order: ${sectionOrder.join(',')}\n`;
  };
  delete sectionsStateMod.sectionsState.syncYamlToSectionState;

  // ── Build DOM stubs for the module's document.getElementById calls ────────────
  const elements = new Map();
  const stubIds = [
    'file-tab-resume', 'file-tab-settings', 'valid-dot', 'valid-text',
    'settings-warn-item', 'lines-stat', 'editor-meta',
    'density-group', 'font-scale-group', 'toast-stack',
  ];
  for (const id of stubIds) elements.set(id, createElement());

  const origGetElementById = globalThis.document.getElementById.bind(globalThis.document);
  globalThis.document.getElementById = (id) => {
    if (elements.has(id)) return elements.get(id);
    return origGetElementById(id);
  };

  // ── Reset settings-sync state + boot ─────────────────────────────────────────
  _resetSettingsSyncForTesting();
  initSettingsSync();

  // Expose for teardown
  _currentTeardown = () => {
    appMod.app.state = origAppState;
    appMod.app.setState = origSetState;
    Object.assign(editorAdapterMod.editorAdapter, origEA);
    previewMod.preview.refresh  = origPreviewRefresh;
    sectionsUIMod.sectionsUI.buildPanel = origBuildPanel;
    validatorMod.validator.validate = origValidate;
    sectionsStateMod.sectionsState.reorderMainArea = origReorderMainArea;
    sectionsStateMod.sectionsState.syncYamlToSectionState = origSyncYamlToSectionState;
    sectionsStateMod.sectionsState.DEFAULT_ORDER = origDefaultOrder;
    Object.assign(realSH, origSH);
    globalThis.document.getElementById = origGetElementById;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: origGlobalLS });
    _setStorage(origGlobalLS);
    _resetParseCache();
    _resetSettingsSyncForTesting();
    delete globalThis.__testActiveTemplate;
  };

  return {
    settingsSync,
    appState: appMod.app.state,
    getYaml: () => settingsSync.getYaml(),
    counters,
    localStorageData,
  };
}

// ===========================================================================
// Tests
// ===========================================================================

test('settings helpers normalize template defaults and accept current template names', async () => {
  const { SETTINGS_HELPERS: helpers } = await import('../frontend/src/settings-engine.js');

  assert.equal(typeof helpers.normalizeTemplateDefaults, 'function');
  assert.equal(helpers.VALID_TPL.includes('ats-signal'), true);
  assert.equal(helpers.VALID_TPL.includes('signature-split'), true);
  assert.equal(helpers.VALID_TPL.includes('resume-tech'), false);
  assert.equal(helpers.VALID_TPL.includes('split-header'), false);

  const normalized = helpers.normalizeTemplateDefaults(
    {
      layout: { density: 'compact' },
      personal: {
        fields: [
          { key: 'github', visible: false, link_display: 'both' },
        ],
      },
      sections: [
        { key: 'projects', title: 'Selected Work', visible: true },
      ],
    },
    'ats-signal'
  );

  assert.equal(normalized.template, 'ats-signal');
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.layout)), { density: 'compact', font_scale: 'normal' });
  assert.equal(normalized.personal.default_link_display, 'label');
  assert.ok(Array.isArray(normalized.personal.fields));
  assert.equal(normalized.personal.fields.length, 8);
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.personal.fields[0])), {
    key: 'github', visible: false, link_display: 'both',
  });
  assert.ok(normalized.personal.fields.slice(1).every(f => f.visible === true));
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.sections[0])), { key: 'projects', title: 'Selected Work', visible: true });
});

test('settings helpers fall back invalid template values to classic with a warning', async () => {
  const { SETTINGS_HELPERS: helpers } = await import('../frontend/src/settings-engine.js');
  const parsed = helpers.parseSettings('template: resume-tech\n');

  assert.equal(parsed.value.template, 'classic');
  assert.equal(parsed.warnings.length, 1);
  assert.match(parsed.warnings[0].msg, /unknown template "resume-tech"/);
});

test('applying template defaults prefers the live selected template over stale settings yaml state', async () => {
  const { settingsSync, appState, counters, localStorageData } = await bootSettingsSync({
    initialOrder: ['projects', 'summary', 'experience', 'education', 'skills'],
    initialHidden: ['skills'],
    initialTitles: {
      summary: 'Profile', experience: 'Work History',
      education: 'Education', skills: 'Capabilities', projects: 'Projects',
    },
    activeTemplate: 'signature-split',
    initialSettingsYaml: JSON.stringify({
      template: 'classic',
      layout: { density: 'comfortable', font_scale: 'large' },
      personal: {
        default_link_display: 'both',
        fields: [
          { key: 'name', visible: true }, { key: 'email', visible: true },
          { key: 'phone', visible: true }, { key: 'location', visible: true },
          { key: 'website', visible: true, link_display: 'default' },
          { key: 'linkedin', visible: true, link_display: 'default' },
          { key: 'github', visible: true, link_display: 'default' },
          { key: 'huggingface', visible: true, link_display: 'default' },
        ],
      },
      sections: [
        { key: 'projects', title: 'Projects', visible: true },
        { key: 'summary', title: 'Profile', visible: true },
        { key: 'experience', title: 'Work History', visible: true },
        { key: 'education', title: 'Education', visible: true },
        { key: 'skills', title: 'Capabilities', visible: false },
      ],
    }),
  });

  counters.previewRenders = 0;
  counters.buildPanelCalls = 0;
  counters.reorderCalls = [];
  appState.template = 'signature-split';

  settingsSync.applyTemplateDefaults({
    layout: { density: 'compact', font_scale: 'small' },
    personal: {
      default_link_display: 'url',
      fields: [
        { key: 'name', visible: true }, { key: 'email', visible: true },
        { key: 'phone', visible: false }, { key: 'location', visible: true },
        { key: 'website', visible: true, link_display: 'both' },
        { key: 'linkedin', visible: true, link_display: 'default' },
        { key: 'github', visible: false, link_display: 'label' },
        { key: 'huggingface', visible: true, link_display: 'default' },
      ],
    },
    sections: [
      { key: 'summary', title: 'SUMMARY', visible: true },
      { key: 'experience', title: 'EXPERIENCE', visible: true },
      { key: 'projects', title: 'PROJECTS', visible: true },
      { key: 'skills', title: 'SKILLS', visible: true },
      { key: 'education', title: 'EDUCATION', visible: false },
    ],
  });

  assert.equal(appState.template, 'signature-split');
  assert.equal(appState.density, 'compact');
  assert.equal(appState.font_scale, 'small');
  assert.equal(appState.link_display, 'url');
  assert.equal(counters.buildPanelCalls, 1);
  assert.equal(counters.previewRenders, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(counters.reorderCalls)), [['summary', 'experience', 'projects', 'skills', 'education']]);

  const stored = JSON.parse(localStorageData.get('mkcv_sections_state'));
  assert.deepEqual(stored.order, ['summary', 'experience', 'projects', 'skills', 'education']);
  assert.deepEqual(stored.hidden, ['education']);

  const nextSettings = JSON.parse(settingsSync.getYaml());
  assert.equal(nextSettings.template, 'signature-split');
  assert.deepEqual(nextSettings.layout, { density: 'compact', font_scale: 'small' });
  assert.deepEqual(nextSettings.personal, {
    default_link_display: 'url',
    fields: [
      { key: 'name', visible: true }, { key: 'email', visible: true },
      { key: 'phone', visible: false }, { key: 'location', visible: true },
      { key: 'website', visible: true, link_display: 'both' },
      { key: 'linkedin', visible: true, link_display: 'default' },
      { key: 'github', visible: false, link_display: 'label' },
      { key: 'huggingface', visible: true, link_display: 'default' },
    ],
  });
  assert.deepEqual(
    nextSettings.sections.map(({ key, title, visible }) => ({ key, title, visible })),
    [
      { key: 'summary', title: 'SUMMARY', visible: true },
      { key: 'experience', title: 'EXPERIENCE', visible: true },
      { key: 'projects', title: 'PROJECTS', visible: true },
      { key: 'skills', title: 'SKILLS', visible: true },
      { key: 'education', title: 'EDUCATION', visible: false },
    ]
  );
});

test('applying missing template defaults falls back to app defaults while preserving active template', async () => {
  const { settingsSync } = await bootSettingsSync({
    activeTemplate: 'ats-signal',
    initialSettingsYaml: JSON.stringify({
      template: 'ats-signal',
      layout: { density: 'compact', font_scale: 'small' },
      personal: {
        default_link_display: 'both',
        fields: [
          { key: 'name', visible: true }, { key: 'email', visible: false },
          { key: 'phone', visible: true }, { key: 'location', visible: true },
          { key: 'website', visible: true, link_display: 'default' },
          { key: 'linkedin', visible: true, link_display: 'default' },
          { key: 'github', visible: true, link_display: 'default' },
          { key: 'huggingface', visible: true, link_display: 'default' },
        ],
      },
      sections: [
        { key: 'projects', title: 'Projects', visible: true },
      ],
    }),
  });

  settingsSync.applyTemplateDefaults(null);

  const nextSettings = JSON.parse(settingsSync.getYaml());
  assert.equal(nextSettings.template, 'ats-signal');
  assert.deepEqual(nextSettings.layout, { density: 'balanced', font_scale: 'normal' });
  assert.deepEqual(nextSettings.personal, {
    default_link_display: 'label',
    fields: [
      { key: 'name', visible: true }, { key: 'email', visible: true },
      { key: 'phone', visible: true }, { key: 'location', visible: true },
      { key: 'website', visible: true, link_display: 'default' },
      { key: 'linkedin', visible: true, link_display: 'default' },
      { key: 'github', visible: true, link_display: 'default' },
      { key: 'huggingface', visible: true, link_display: 'default' },
    ],
  });
  assert.deepEqual(
    nextSettings.sections.map(({ key, title, visible }) => ({ key, title, visible })),
    [
      { key: 'summary', title: 'SUMMARY', visible: true },
      { key: 'experience', title: 'EXPERIENCE', visible: true },
      { key: 'education', title: 'EDUCATION', visible: true },
      { key: 'skills', title: 'SKILLS', visible: true },
      { key: 'projects', title: 'PROJECTS', visible: true },
    ]
  );
});
