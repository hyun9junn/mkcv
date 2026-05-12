const test = require('node:test');
const assert = require('node:assert/strict');

// Phase 2: settings-sync.js was converted from IIFE-on-window to ESM. This
// harness drives the same scenarios by importing the real ESM module and
// monkey-patching the live exports of its dependencies (editorAdapter,
// preview, sectionsState, sectionsUI, SETTINGS_HELPERS) for each test.
// `_resetSettingsSyncForTesting` clears module-level state between runs.

// Track per-test teardown for afterEach cleanup.
let _currentTeardown = null;

test.afterEach(() => {
  if (_currentTeardown) {
    _currentTeardown();
    _currentTeardown = null;
  }
  document.body.innerHTML = '';
  if (globalThis.localStorage) localStorage.clear();
  delete globalThis.window.editorAdapter;
  delete globalThis.window.sectionsSync;
});

// ── Synthetic timer harness ───────────────────────────────────────────────────

function createTimerHarness() {
  let nextId = 1;
  const pending = new Map();
  return {
    setTimeout(callback, delay = 0) {
      const id = nextId++;
      pending.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    runAll() {
      while (pending.size > 0) {
        const ready = Array.from(pending.entries())
          .sort((a, b) => a[1].delay - b[1].delay || a[0] - b[0]);
        const [id, task] = ready[0];
        pending.delete(id);
        task.callback();
      }
    },
    install() {
      const origSetTimeout = globalThis.setTimeout;
      const origClearTimeout = globalThis.clearTimeout;
      globalThis.setTimeout = this.setTimeout.bind(this);
      globalThis.clearTimeout = this.clearTimeout.bind(this);
      return () => {
        globalThis.setTimeout = origSetTimeout;
        globalThis.clearTimeout = origClearTimeout;
      };
    },
  };
}

// ── DOM stub helpers ──────────────────────────────────────────────────────────

function buildSettingsSyncDOM() {
  const ids = [
    'file-tab-resume', 'file-tab-settings', 'valid-dot', 'valid-text',
    'settings-warn-item', 'lines-stat', 'editor-meta',
    'density-group', 'font-scale-group', 'toast-stack',
  ];
  for (const id of ids) {
    if (!document.getElementById(id)) {
      const el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
  }
}

// ── Core createContext + bootSettingsSync ─────────────────────────────────────

async function createContext(options = {}) {
  const editorChangeCallbacks = [];
  const counters = { previewRenders: 0, previewSnapshots: [], buildPanelCalls: 0, reorderCalls: 0 };

  let order = (options.initialOrder || []).slice();
  const hidden = new Set(options.initialHidden || []);

  // Build DOM.
  buildSettingsSyncDOM();

  // Seed localStorage.
  if (options.initialSettingsYaml) {
    localStorage.setItem('mkcv:default:settings.yaml', options.initialSettingsYaml);
  }

  // Import the live ESM modules.
  const appMod           = await import('../frontend/src/app.js');
  const settingsEngineMod = await import('../frontend/src/settings-engine.js');
  const editorAdapterMod  = await import('../frontend/src/editor-adapter.js');
  const previewMod        = await import('../frontend/src/preview.js');
  const sectionsStateMod  = await import('../frontend/src/sections-state.js');
  const sectionsUIMod     = await import('../frontend/src/sections-ui.js');
  const templatesMod      = await import('../frontend/src/templates.js');
  const contactUIMod      = await import('../frontend/src/contact-ui.js');
  const {
    settingsSync,
    initSettingsSync,
    _resetSettingsSyncForTesting,
  } = await import('../frontend/src/settings-sync.js');

  // ── Patch app.state ──────────────────────────────────────────────────────────
  const origAppState = appMod.app.state;
  appMod.app.state = {
    yaml: options.initialYaml || 'personal:\n  name: Test User\n',
    template: 'classic',
    density: 'balanced',
    font_scale: 'normal',
    link_display: 'both',
    personal_fields: [],
  };
  const origSetState = appMod.app.setState.bind(appMod.app);
  appMod.app.setState = function(patch) { Object.assign(appMod.app.state, patch); };

  // ── Patch SETTINGS_HELPERS ───────────────────────────────────────────────────
  const SECTION_CATALOG = [{ key: 'summary', defaultTitle: 'SUMMARY' }];
  const KNOWN_KEYS = new Set(['summary']);
  const DEFAULT_SETTINGS = {
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
    sections: [],
  };

  function settingsToYaml(settings) {
    return JSON.stringify(settings);
  }
  function parseSettings(raw) {
    if (raw && raw.trim().startsWith('{')) {
      return { value: JSON.parse(raw), errors: [], warnings: [] };
    }
    return {
      value: {
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
        sections: order.map((key) => ({
          key, title: key.toUpperCase(), visible: !hidden.has(key),
        })),
      },
      errors: [], warnings: [],
    };
  }
  function normalizeTemplateDefaults(rawDefaults) { return rawDefaults || DEFAULT_SETTINGS; }

  const origSH = {
    SECTION_CATALOG: settingsEngineMod.SETTINGS_HELPERS.SECTION_CATALOG,
    KNOWN_KEYS: settingsEngineMod.SETTINGS_HELPERS.KNOWN_KEYS,
    DEFAULT_SETTINGS: settingsEngineMod.SETTINGS_HELPERS.DEFAULT_SETTINGS,
    settingsToYaml: settingsEngineMod.SETTINGS_HELPERS.settingsToYaml,
    parseSettings: settingsEngineMod.SETTINGS_HELPERS.parseSettings,
    normalizeTemplateDefaults: settingsEngineMod.SETTINGS_HELPERS.normalizeTemplateDefaults,
    VALID_DENSITY: settingsEngineMod.SETTINGS_HELPERS.VALID_DENSITY,
    VALID_FONT: settingsEngineMod.SETTINGS_HELPERS.VALID_FONT,
  };
  settingsEngineMod.SETTINGS_HELPERS.SECTION_CATALOG = SECTION_CATALOG;
  settingsEngineMod.SETTINGS_HELPERS.KNOWN_KEYS = KNOWN_KEYS;
  settingsEngineMod.SETTINGS_HELPERS.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  settingsEngineMod.SETTINGS_HELPERS.settingsToYaml = settingsToYaml;
  settingsEngineMod.SETTINGS_HELPERS.parseSettings = parseSettings;
  settingsEngineMod.SETTINGS_HELPERS.normalizeTemplateDefaults = normalizeTemplateDefaults;
  settingsEngineMod.SETTINGS_HELPERS.VALID_DENSITY = ['comfortable', 'balanced', 'compact'];
  settingsEngineMod.SETTINGS_HELPERS.VALID_FONT = ['small', 'normal', 'large'];

  // ── Patch editorAdapter ──────────────────────────────────────────────────────
  const editorValue = { current: '' };
  const scrollState = { left: 0, top: 0 };
  let closeHintCalls = 0;
  let suppressNextPreviewRefresh = false;

  const origEA = {
    getValue: editorAdapterMod.editorAdapter.getValue,
    setValue: editorAdapterMod.editorAdapter.setValue,
    setValueSilently: editorAdapterMod.editorAdapter.setValueSilently,
    setValuePreserveScroll: editorAdapterMod.editorAdapter.setValuePreserveScroll,
    closeHint: editorAdapterMod.editorAdapter.closeHint,
    getScrollInfo: editorAdapterMod.editorAdapter.getScrollInfo,
    scrollTo: editorAdapterMod.editorAdapter.scrollTo,
    suppressNextPreviewRefresh: editorAdapterMod.editorAdapter.suppressNextPreviewRefresh,
    consumeSuppressedPreviewRefresh: editorAdapterMod.editorAdapter.consumeSuppressedPreviewRefresh,
    clearHistory: editorAdapterMod.editorAdapter.clearHistory,
    onChange: editorAdapterMod.editorAdapter.onChange,
  };

  editorAdapterMod.editorAdapter.getValue = () => editorValue.current;
  editorAdapterMod.editorAdapter.setValue = (str) => {
    editorValue.current = str;
    scrollState.left = 0;
    scrollState.top = 0;
    for (const cb of editorChangeCallbacks) cb(str);
  };
  editorAdapterMod.editorAdapter.setValueSilently = (str) => {
    editorValue.current = str;
    scrollState.left = 0;
    scrollState.top = 0;
  };
  editorAdapterMod.editorAdapter.setValuePreserveScroll = (str) => {
    const { left, top } = editorAdapterMod.editorAdapter.getScrollInfo();
    editorValue.current = str;
    for (const cb of editorChangeCallbacks) cb(str);
    editorAdapterMod.editorAdapter.scrollTo(left, top);
  };
  editorAdapterMod.editorAdapter.closeHint = () => { closeHintCalls += 1; };
  editorAdapterMod.editorAdapter.getScrollInfo = () => ({ left: scrollState.left, top: scrollState.top });
  editorAdapterMod.editorAdapter.scrollTo = (l, t) => { scrollState.left = l; scrollState.top = t; };
  editorAdapterMod.editorAdapter.suppressNextPreviewRefresh = () => { suppressNextPreviewRefresh = true; };
  editorAdapterMod.editorAdapter.consumeSuppressedPreviewRefresh = () => {
    const v = suppressNextPreviewRefresh;
    suppressNextPreviewRefresh = false;
    return v;
  };
  editorAdapterMod.editorAdapter.clearHistory = () => {};
  editorAdapterMod.editorAdapter.onChange = (cb) => editorChangeCallbacks.push(cb);

  // Expose the editorAdapter test proxy under context.window.editorAdapter so
  // index.html inline scripts (and tests that call context.window.editorAdapter) work.
  const testEditorAdapter = {
    get value() { return editorValue.current; },
    get closeHintCalls() { return closeHintCalls; },
    setValue: editorAdapterMod.editorAdapter.setValue,
    setValueSilently: editorAdapterMod.editorAdapter.setValueSilently,
    setValuePreserveScroll: editorAdapterMod.editorAdapter.setValuePreserveScroll,
    getScrollInfo: editorAdapterMod.editorAdapter.getScrollInfo,
    scrollTo: editorAdapterMod.editorAdapter.scrollTo,
    suppressNextPreviewRefresh: editorAdapterMod.editorAdapter.suppressNextPreviewRefresh,
    consumeSuppressedPreviewRefresh: editorAdapterMod.editorAdapter.consumeSuppressedPreviewRefresh,
    onChange: editorAdapterMod.editorAdapter.onChange,
  };

  // ── Patch preview ─────────────────────────────────────────────────────────────
  const origPreviewRefresh = previewMod.preview.refresh;
  previewMod.preview.refresh = () => {
    counters.previewRenders += 1;
    counters.previewSnapshots.push({
      link_display: appMod.app.state.link_display,
      personal_fields: JSON.parse(JSON.stringify(appMod.app.state.personal_fields || [])),
    });
  };

  // ── Patch sectionsState ───────────────────────────────────────────────────────
  const origSectionsState = {
    DEFAULT_ORDER: sectionsStateMod.sectionsState.DEFAULT_ORDER,
    getOrderedFilteredYaml: sectionsStateMod.sectionsState.getOrderedFilteredYaml,
    reorderMainArea: sectionsStateMod.sectionsState.reorderMainArea,
    syncYamlToSectionState: sectionsStateMod.sectionsState.syncYamlToSectionState,
    setOrder: sectionsStateMod.sectionsState.setOrder,
    toggleHidden: sectionsStateMod.sectionsState.toggleHidden,
    resetAll: sectionsStateMod.sectionsState.resetAll,
    isHidden: sectionsStateMod.sectionsState.isHidden,
    getOrder: sectionsStateMod.sectionsState.getOrder,
    getYamlSectionState: sectionsStateMod.sectionsState.getYamlSectionState,
    parseResumeYaml: sectionsStateMod.sectionsState.parseResumeYaml,
    getExpandedPresentKeys: sectionsStateMod.sectionsState.getExpandedPresentKeys,
  };

  sectionsStateMod.sectionsState.DEFAULT_ORDER = [];
  sectionsStateMod.sectionsState.getOrderedFilteredYaml = (yaml) => yaml;
  sectionsStateMod.sectionsState.reorderMainArea = (yaml, sectionOrder) => {
    counters.reorderCalls += 1;
    if (typeof options.reorderMainArea === 'function') {
      return options.reorderMainArea(yaml, sectionOrder);
    }
    return yaml;
  };
  sectionsStateMod.sectionsState.setOrder = (newOrder) => { order = newOrder.slice(); };
  sectionsStateMod.sectionsState.toggleHidden = (key) => {
    if (hidden.has(key)) hidden.delete(key);
    else hidden.add(key);
  };
  sectionsStateMod.sectionsState.resetAll = () => { order = []; hidden.clear(); };
  sectionsStateMod.sectionsState.isHidden = (key) => hidden.has(key);
  sectionsStateMod.sectionsState.getOrder = () => order.slice();
  // Remove optional methods so settings-sync sees they're absent and falls back
  // to the reorderMainArea path (which this test's counters track).
  delete sectionsStateMod.sectionsState.syncYamlToSectionState;
  delete sectionsStateMod.sectionsState.getYamlSectionState;
  delete sectionsStateMod.sectionsState.parseResumeYaml;
  delete sectionsStateMod.sectionsState.getExpandedPresentKeys;

  // ── Patch sectionsUI ─────────────────────────────────────────────────────────
  const origBuildPanel = sectionsUIMod.sectionsUI.buildPanel;
  sectionsUIMod.sectionsUI.buildPanel = () => { counters.buildPanelCalls += 1; };

  // ── Save templateUI + contactUI originals; apply mock if provided ────────────
  const origSelectTemplate = templatesMod.templateUI.selectTemplate;
  const origContactUIRebuild = contactUIMod.contactUI.rebuild;
  if (options.mockSelectTemplate) {
    templatesMod.templateUI.selectTemplate = options.mockSelectTemplate;
  }

  // ── Patch validator ──────────────────────────────────────────────────────────
  const validatorMod = await import('../frontend/src/validator.js');
  const origValidate = validatorMod.validator.validate;
  validatorMod.validator.validate = () => {};

  // ── Reset settings-sync module state ─────────────────────────────────────────
  _resetSettingsSyncForTesting();

  // ── Boot (run initSettingsSync) ───────────────────────────────────────────────
  const origSetTimeout = globalThis.setTimeout;
  const origClearTimeout = globalThis.clearTimeout;
  if (options.setTimeout) globalThis.setTimeout = options.setTimeout;
  if (options.clearTimeout) globalThis.clearTimeout = options.clearTimeout;

  initSettingsSync();

  // ── Build element proxy for click-based tab switching ────────────────────────
  const elements = {
    get: (id) => document.getElementById(id),
  };

  _currentTeardown = () => {
    // Restore app
    appMod.app.state = origAppState;
    appMod.app.setState = origSetState;
    // Restore SETTINGS_HELPERS
    Object.assign(settingsEngineMod.SETTINGS_HELPERS, origSH);
    // Restore editorAdapter
    Object.assign(editorAdapterMod.editorAdapter, origEA);
    // Restore preview
    previewMod.preview.refresh = origPreviewRefresh;
    // Restore sectionsState
    Object.assign(sectionsStateMod.sectionsState, origSectionsState);
    // Restore sectionsUI
    sectionsUIMod.sectionsUI.buildPanel = origBuildPanel;
    // Restore templateUI + contactUI
    templatesMod.templateUI.selectTemplate = origSelectTemplate;
    contactUIMod.contactUI.rebuild = origContactUIRebuild;
    // Restore validator
    validatorMod.validator.validate = origValidate;
    // Restore timers
    if (options.setTimeout) globalThis.setTimeout = origSetTimeout;
    if (options.clearTimeout) globalThis.clearTimeout = origClearTimeout;
    // Reset settings-sync state
    _resetSettingsSyncForTesting();
  };

  return {
    settingsSync,
    testEditorAdapter,
    counters,
    elements,
    appState: appMod.app.state,
    sectionsStateObj: sectionsStateMod.sectionsState,
  };
}

function attachPreviewListener(testEditorAdapter, settingsSync, counters) {
  // mirror the original test helper: add a change listener that increments
  // previewRenders when in resume tab and preview is not suppressed.
  testEditorAdapter.onChange(() => {
    if (settingsSync.activeTab === 'settings') return;
    if (testEditorAdapter.consumeSuppressedPreviewRefresh()) return;
    counters.previewRenders += 1;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('switching back to resume does not trigger resume-side change listeners', async () => {
  const { settingsSync, testEditorAdapter, elements } = await createContext();

  let resumeSideChanges = 0;
  testEditorAdapter.onChange(() => {
    if (settingsSync.activeTab === 'settings') return;
    resumeSideChanges += 1;
  });

  elements.get('file-tab-settings').click();
  resumeSideChanges = 0;

  elements.get('file-tab-resume').click();

  assert.equal(resumeSideChanges, 0);
});

test('resume sync prefers shared sections-state resume parser when available', async () => {
  const resumeYaml = 'summary: Shared parser path\n';
  const { testEditorAdapter, sectionsStateObj } = await createContext({
    initialOrder: ['summary'],
    initialYaml: resumeYaml,
  });

  let helperCalls = 0;
  let rawParseCalls = 0;

  globalThis.jsyaml = {
    load(source) {
      rawParseCalls += 1;
      return { summary: source };
    },
  };
  sectionsStateObj.parseResumeYaml = (source) => {
    helperCalls += 1;
    assert.equal(source, resumeYaml);
    return { summary: 'Shared parser path' };
  };
  sectionsStateObj.getYamlSectionState = () => ({ order: ['summary'], hidden: [] });
  sectionsStateObj.getExpandedPresentKeys = () => ['summary'];

  testEditorAdapter.setValue(resumeYaml);

  assert.equal(helperCalls, 1);
  assert.equal(rawParseCalls, 0);
  delete globalThis.jsyaml;
});

test('resume sync falls back to raw yaml parsing when sections-state parser helper is absent', async () => {
  const resumeYaml = 'summary: Raw fallback path\n';
  const { testEditorAdapter, sectionsStateObj } = await createContext({
    initialOrder: ['summary'],
    initialYaml: resumeYaml,
  });

  let rawParseCalls = 0;
  globalThis.jsyaml = {
    load(source) {
      rawParseCalls += 1;
      assert.equal(source, resumeYaml);
      return { summary: 'Raw fallback path' };
    },
  };
  sectionsStateObj.getYamlSectionState = () => ({ order: ['summary'], hidden: [] });
  sectionsStateObj.getExpandedPresentKeys = () => ['summary'];

  testEditorAdapter.setValue(resumeYaml);

  assert.equal(rawParseCalls, 1);
  delete globalThis.jsyaml;
});

test('resume and settings tabs each restore their own last editor scroll position', async () => {
  const { testEditorAdapter, elements } = await createContext();

  testEditorAdapter.scrollTo(0, 120);
  elements.get('file-tab-settings').click();

  testEditorAdapter.scrollTo(0, 340);
  elements.get('file-tab-resume').click();
  assert.equal(testEditorAdapter.getScrollInfo().top, 120);

  elements.get('file-tab-settings').click();
  assert.equal(testEditorAdapter.getScrollInfo().top, 340);
});

test('section order changes trigger one preview render', async () => {
  const { settingsSync, testEditorAdapter, counters, sectionsStateObj } = await createContext({
    initialOrder: ['summary'],
    initialYaml: 'summary: first\n',
    reorderMainArea(yaml) {
      return yaml + '\n# reordered';
    },
  });

  attachPreviewListener(testEditorAdapter, settingsSync, counters);

  counters.previewRenders = 0;
  sectionsStateObj.setOrder(['summary']);

  assert.equal(counters.previewRenders, 1);
});

test('contact-originated updates apply personal settings before preview refresh', async () => {
  const initialSettings = {
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
    sections: [{ key: 'summary', title: 'SUMMARY', visible: true }],
  };
  const { settingsSync, counters } = await createContext({
    initialOrder: ['summary'],
    initialSettingsYaml: JSON.stringify(initialSettings),
  });

  counters.previewRenders = 0;
  counters.previewSnapshots = [];
  counters.buildPanelCalls = 0;
  counters.reorderCalls = 0;

  settingsSync.updateFromToolbar((next) => {
    next.personal.default_link_display = 'url';
    next.personal.fields.find((field) => field.key === 'github').visible = false;
  }, { applyToolbar: true, applyContact: true });

  // Import app.state to check the mutations.
  const { app } = await import('../frontend/src/app.js');
  assert.equal(app.state.link_display, 'url');
  assert.equal(app.state.personal_fields.find((field) => field.key === 'github').visible, false);
  assert.equal(counters.previewRenders, 1);
  assert.equal(counters.buildPanelCalls, 0);
  assert.equal(counters.reorderCalls, 0);
  assert.equal(counters.previewSnapshots[0].link_display, 'url');
  assert.equal(
    counters.previewSnapshots[0].personal_fields.find((field) => field.key === 'github').visible,
    false
  );
});

test('settings file template is applied on boot', async () => {
  const initialSettings = {
    template: 'signature-split',
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
    sections: [{ key: 'summary', title: 'SUMMARY', visible: true }],
  };

  const templateUICalls = [];
  await createContext({
    initialOrder: ['summary'],
    initialSettingsYaml: JSON.stringify(initialSettings),
    mockSelectTemplate(name, opts = {}) {
      templateUICalls.push({ name, opts });
      import('../frontend/src/app.js').then(({ app }) => app.setState({ template: name }));
    },
  });

  const { app } = await import('../frontend/src/app.js');
  assert.equal(app.state.template, 'signature-split');
  assert.equal(templateUICalls.length, 1);
  assert.equal(templateUICalls[0].name, 'signature-split');
});

test('settings editor template changes update the live template selection', async () => {
  const timers = createTimerHarness();
  const initialSettings = {
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
    sections: [{ key: 'summary', title: 'SUMMARY', visible: true }],
  };

  const templateUICalls = [];
  const uninstallTimers = timers.install();
  const { elements, testEditorAdapter } = await createContext({
    initialOrder: ['summary'],
    initialSettingsYaml: JSON.stringify(initialSettings),
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    mockSelectTemplate(name, opts = {}) {
      templateUICalls.push({ name, opts });
      import('../frontend/src/app.js').then(({ app }) => app.setState({ template: name }));
    },
  });

  elements.get('file-tab-settings').click();
  testEditorAdapter.setValue(JSON.stringify({
    ...initialSettings,
    template: 'signature-split',
  }));

  timers.runAll();

  const { app } = await import('../frontend/src/app.js');
  assert.equal(app.state.template, 'signature-split');
  assert.equal(templateUICalls.length, 1);
  assert.equal(templateUICalls[0].name, 'signature-split');

  uninstallTimers();
});

test('settings editor batches preview and section panel updates while typing', async () => {
  const timers = createTimerHarness();
  const initialSettings = {
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
    sections: [{ key: 'summary', title: 'SUMMARY', visible: true }],
  };

  const uninstallTimers = timers.install();
  const { elements, testEditorAdapter, counters } = await createContext({
    initialOrder: ['summary'],
    initialSettingsYaml: JSON.stringify(initialSettings),
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });

  elements.get('file-tab-settings').click();
  counters.previewRenders = 0;
  counters.buildPanelCalls = 0;
  counters.reorderCalls = 0;

  testEditorAdapter.setValue(JSON.stringify({
    ...initialSettings,
    layout: { density: 'compact', font_scale: 'normal' },
  }));
  testEditorAdapter.setValue(JSON.stringify({
    ...initialSettings,
    layout: { density: 'comfortable', font_scale: 'normal' },
  }));

  assert.equal(counters.previewRenders, 0);
  assert.equal(counters.buildPanelCalls, 0);
  assert.equal(counters.reorderCalls, 0);

  timers.runAll();

  const { app } = await import('../frontend/src/app.js');
  assert.equal(app.state.density, 'comfortable');
  assert.equal(counters.previewRenders, 1);
  assert.equal(counters.buildPanelCalls, 1);
  assert.equal(counters.reorderCalls, 1);

  uninstallTimers();
});

test('switching tabs closes any open completion menu', async () => {
  const { elements, testEditorAdapter } = await createContext();

  elements.get('file-tab-settings').click();
  elements.get('file-tab-resume').click();

  assert.equal(testEditorAdapter.closeHintCalls, 2);
});

test('settingsSync exposes setYaml', async () => {
  const { settingsSync } = await import('../frontend/src/settings-sync.js');
  assert.ok(
    typeof settingsSync.setYaml === 'function',
    'setYaml should be a function on settingsSync',
  );
});
