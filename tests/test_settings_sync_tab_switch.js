const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createElement() {
  const listeners = new Map();
  return {
    style: {},
    textContent: '',
    innerHTML: '',
    className: '',
    dataset: {},
    classList: {
      toggle() {},
    },
    querySelectorAll() {
      return [];
    },
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
  };
}

function createContext(options = {}) {
  const domReadyCallbacks = [];
  const elements = new Map();
  const localStorageData = new Map();
  if (options.initialSettingsYaml) {
    localStorageData.set('mkcv:default:settings.yaml', options.initialSettingsYaml);
  }
  const editorChangeCallbacks = [];
  const counters = { previewRenders: 0, previewSnapshots: [], buildPanelCalls: 0, reorderCalls: 0 };

  let order = (options.initialOrder || []).slice();
  const hidden = new Set(options.initialHidden || []);

  const ids = [
    'file-tab-resume',
    'file-tab-settings',
    'valid-dot',
    'valid-text',
    'settings-warn-item',
    'lines-stat',
    'editor-meta',
    'density-group',
    'font-scale-group',
    'toast-stack',
  ];
  for (const id of ids) {
    elements.set(id, createElement());
  }

  const editorAdapter = {
    value: '',
    scrollLeft: 0,
    scrollTop: 0,
    closeHintCalls: 0,
    _suppressNextPreviewRefresh: false,
    setValue(str) {
      this.value = str;
      this.scrollLeft = 0;
      this.scrollTop = 0;
      for (const callback of editorChangeCallbacks) callback(str);
    },
    setValueSilently(str) {
      this.value = str;
      this.scrollLeft = 0;
      this.scrollTop = 0;
    },
    setValuePreserveScroll(str) {
      const { left, top } = this.getScrollInfo();
      this.value = str;
      for (const callback of editorChangeCallbacks) callback(str);
      this.scrollTo(left, top);
    },
    closeHint() {
      this.closeHintCalls += 1;
    },
    getScrollInfo() {
      return { left: this.scrollLeft, top: this.scrollTop };
    },
    scrollTo(left, top) {
      this.scrollLeft = left;
      this.scrollTop = top;
    },
    suppressNextPreviewRefresh() {
      this._suppressNextPreviewRefresh = true;
    },
    consumeSuppressedPreviewRefresh() {
      const suppressed = this._suppressNextPreviewRefresh;
      this._suppressNextPreviewRefresh = false;
      return suppressed;
    },
    clearHistory() {},
    onChange(callback) {
      editorChangeCallbacks.push(callback);
    },
  };

  const context = {
    console,
    TextEncoder,
    setTimeout: options.setTimeout || setTimeout,
    clearTimeout: options.clearTimeout || clearTimeout,
    fetch: async () => ({ ok: false }),
    localStorage: {
      getItem(key) {
        return localStorageData.has(key) ? localStorageData.get(key) : null;
      },
      setItem(key, value) {
        localStorageData.set(key, String(value));
      },
      removeItem(key) {
        localStorageData.delete(key);
      },
    },
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, createElement());
        return elements.get(id);
      },
      addEventListener(type, callback) {
        if (type === 'DOMContentLoaded') domReadyCallbacks.push(callback);
      },
    },
    app: {
      state: {
        yaml: options.initialYaml || 'personal:\n  name: Test User\n',
        template: 'classic',
        density: 'balanced',
        font_scale: 'normal',
        link_display: 'both',
        personal_fields: [],
      },
      setState(patch) {
        Object.assign(this.state, patch);
      },
    },
    validator: {
      validate() {},
    },
    preview: {
      refresh() {
        counters.previewRenders += 1;
        counters.previewSnapshots.push({
          link_display: context.app.state.link_display,
          personal_fields: JSON.parse(JSON.stringify(context.app.state.personal_fields || [])),
        });
      },
    },
    sectionsUI: {
      buildPanel() {
        counters.buildPanelCalls += 1;
      },
    },
    sectionsState: {
      DEFAULT_ORDER: [],
      getOrderedFilteredYaml(yaml) {
        return yaml;
      },
      reorderMainArea(yaml, sectionOrder) {
        counters.reorderCalls += 1;
        if (typeof options.reorderMainArea === 'function') {
          return options.reorderMainArea(yaml, sectionOrder);
        }
        return yaml;
      },
      setOrder(newOrder) {
        order = newOrder.slice();
      },
      toggleHidden(key) {
        if (hidden.has(key)) hidden.delete(key);
        else hidden.add(key);
      },
      resetAll() {
        order = [];
        hidden.clear();
      },
      isHidden(key) {
        return hidden.has(key);
      },
      getOrder() {
        return order.slice();
      },
    },
    SETTINGS_HELPERS: {
      SECTION_CATALOG: [{ key: 'summary', defaultTitle: 'SUMMARY' }],
      KNOWN_KEYS: new Set(['summary']),
      VALID_DENSITY: ['comfortable', 'balanced', 'compact'],
      VALID_FONT: ['small', 'normal', 'large'],
      DEFAULT_SETTINGS: {
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
      },
      settingsToYaml(settings) {
        return JSON.stringify(settings);
      },
      parseSettings(raw) {
        if (raw && raw.trim().startsWith('{')) {
          return {
            value: JSON.parse(raw),
            errors: [],
            warnings: [],
          };
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
              key,
              title: key.toUpperCase(),
              visible: !hidden.has(key),
            })),
          },
          errors: [],
          warnings: [],
        };
      },
    },
  };

  context.window = context;
  context.window.editorAdapter = editorAdapter;

  return { context, counters, domReadyCallbacks, elements };
}

async function bootSettingsSync(context, domReadyCallbacks) {
  const source = fs.readFileSync('frontend/settings-sync.js', 'utf8');
  vm.runInNewContext(source, context, { filename: 'frontend/settings-sync.js' });

  for (const callback of domReadyCallbacks) {
    await callback();
  }
}

function attachPreviewListener(context, counters) {
  context.window.editorAdapter.onChange(() => {
    if (context.window.settingsSync.activeTab === 'settings') return;
    if (context.window.editorAdapter.consumeSuppressedPreviewRefresh()) return;
    counters.previewRenders += 1;
  });
}

test('switching back to resume does not trigger resume-side change listeners', async () => {
  const { context, domReadyCallbacks, elements } = createContext();
  await bootSettingsSync(context, domReadyCallbacks);

  let resumeSideChanges = 0;
  context.window.editorAdapter.onChange(() => {
    if (context.window.settingsSync.activeTab === 'settings') return;
    resumeSideChanges += 1;
  });

  elements.get('file-tab-settings').click();
  resumeSideChanges = 0;

  elements.get('file-tab-resume').click();

  assert.equal(resumeSideChanges, 0);
});

test('resume sync prefers shared sections-state resume parser when available', async () => {
  const resumeYaml = 'summary: Shared parser path\n';
  const { context, domReadyCallbacks } = createContext({
    initialOrder: ['summary'],
    initialYaml: resumeYaml,
  });

  let helperCalls = 0;
  let rawParseCalls = 0;
  context.jsyaml = {
    load(source) {
      rawParseCalls += 1;
      return { summary: source };
    },
  };
  context.sectionsState.parseResumeYaml = (source) => {
    helperCalls += 1;
    assert.equal(source, resumeYaml);
    return { summary: 'Shared parser path' };
  };
  context.sectionsState.getYamlSectionState = () => ({ order: ['summary'], hidden: [] });
  context.sectionsState.getExpandedPresentKeys = () => ['summary'];

  await bootSettingsSync(context, domReadyCallbacks);

  context.window.editorAdapter.setValue(resumeYaml);

  assert.equal(helperCalls, 1);
  assert.equal(rawParseCalls, 0);
});

test('resume sync falls back to raw yaml parsing when sections-state parser helper is absent', async () => {
  const resumeYaml = 'summary: Raw fallback path\n';
  const { context, domReadyCallbacks } = createContext({
    initialOrder: ['summary'],
    initialYaml: resumeYaml,
  });

  let rawParseCalls = 0;
  context.jsyaml = {
    load(source) {
      rawParseCalls += 1;
      assert.equal(source, resumeYaml);
      return { summary: 'Raw fallback path' };
    },
  };
  context.sectionsState.getYamlSectionState = () => ({ order: ['summary'], hidden: [] });
  context.sectionsState.getExpandedPresentKeys = () => ['summary'];

  await bootSettingsSync(context, domReadyCallbacks);

  context.window.editorAdapter.setValue(resumeYaml);

  assert.equal(rawParseCalls, 1);
});

test('resume and settings tabs each restore their own last editor scroll position', async () => {
  const { context, domReadyCallbacks, elements } = createContext();
  await bootSettingsSync(context, domReadyCallbacks);

  context.window.editorAdapter.scrollTo(0, 120);
  elements.get('file-tab-settings').click();

  context.window.editorAdapter.scrollTo(0, 340);
  elements.get('file-tab-resume').click();
  assert.equal(context.window.editorAdapter.getScrollInfo().top, 120);

  elements.get('file-tab-settings').click();
  assert.equal(context.window.editorAdapter.getScrollInfo().top, 340);
});

test('section order changes trigger one preview render', async () => {
  const { context, counters, domReadyCallbacks } = createContext({
    initialOrder: ['summary'],
    initialYaml: 'summary: first\n',
    reorderMainArea(yaml) {
      return yaml + '\n# reordered';
    },
  });
  await bootSettingsSync(context, domReadyCallbacks);
  attachPreviewListener(context, counters);

  counters.previewRenders = 0;
  context.sectionsState.setOrder(['summary']);

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
  const { context, counters, domReadyCallbacks } = createContext({
    initialOrder: ['summary'],
    initialSettingsYaml: JSON.stringify(initialSettings),
  });
  await bootSettingsSync(context, domReadyCallbacks);

  counters.previewRenders = 0;
  counters.previewSnapshots = [];
  counters.buildPanelCalls = 0;
  counters.reorderCalls = 0;

  context.window.settingsSync.updateFromToolbar((next) => {
    next.personal.default_link_display = 'url';
    next.personal.fields.find((field) => field.key === 'github').visible = false;
  }, { applyToolbar: true, applyContact: true });

  assert.equal(context.app.state.link_display, 'url');
  assert.equal(context.app.state.personal_fields.find((field) => field.key === 'github').visible, false);
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
  const { context, domReadyCallbacks } = createContext({
    initialOrder: ['summary'],
    initialSettingsYaml: JSON.stringify(initialSettings),
  });
  context.window.templateUI = {
    calls: [],
    selectTemplate(name, opts = {}) {
      this.calls.push({ name, opts });
      context.app.setState({ template: name });
    },
  };

  await bootSettingsSync(context, domReadyCallbacks);

  assert.equal(context.app.state.template, 'signature-split');
  assert.equal(context.window.templateUI.calls.length, 1);
  assert.equal(context.window.templateUI.calls[0].name, 'signature-split');
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
  const { context, domReadyCallbacks, elements } = createContext({
    initialOrder: ['summary'],
    initialSettingsYaml: JSON.stringify(initialSettings),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  context.window.templateUI = {
    calls: [],
    selectTemplate(name, opts = {}) {
      this.calls.push({ name, opts });
      context.app.setState({ template: name });
    },
  };

  await bootSettingsSync(context, domReadyCallbacks);

  elements.get('file-tab-settings').click();
  context.window.editorAdapter.setValue(JSON.stringify({
    ...initialSettings,
    template: 'signature-split',
  }));

  timers.runAll();

  assert.equal(context.app.state.template, 'signature-split');
  assert.equal(context.window.templateUI.calls.length, 1);
  assert.equal(context.window.templateUI.calls[0].name, 'signature-split');
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
  const { context, counters, domReadyCallbacks, elements } = createContext({
    initialOrder: ['summary'],
    initialSettingsYaml: JSON.stringify(initialSettings),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  await bootSettingsSync(context, domReadyCallbacks);

  elements.get('file-tab-settings').click();
  counters.previewRenders = 0;
  counters.buildPanelCalls = 0;
  counters.reorderCalls = 0;

  context.window.editorAdapter.setValue(JSON.stringify({
    ...initialSettings,
    layout: { density: 'compact', font_scale: 'normal' },
  }));
  context.window.editorAdapter.setValue(JSON.stringify({
    ...initialSettings,
    layout: { density: 'comfortable', font_scale: 'normal' },
  }));

  assert.equal(counters.previewRenders, 0);
  assert.equal(counters.buildPanelCalls, 0);
  assert.equal(counters.reorderCalls, 0);

  timers.runAll();

  assert.equal(context.app.state.density, 'comfortable');
  assert.equal(counters.previewRenders, 1);
  assert.equal(counters.buildPanelCalls, 1);
  assert.equal(counters.reorderCalls, 1);
});

test('switching tabs closes any open completion menu', async () => {
  const { context, domReadyCallbacks, elements } = createContext();
  await bootSettingsSync(context, domReadyCallbacks);

  elements.get('file-tab-settings').click();
  elements.get('file-tab-resume').click();

  assert.equal(context.window.editorAdapter.closeHintCalls, 2);
});
