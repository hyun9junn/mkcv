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
    fetch: async (_url, requestOptions = {}) => {
      if (requestOptions.method === 'POST') {
        return { ok: true, json: async () => ({}) };
      }
      return {
        ok: true,
        json: async () => ({ content: options.initialSettingsYaml || 'layout:\n  density: balanced\n' }),
      };
    },
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
          link_display: 'label',
          fields: [
            { key: 'name', visible: true },
            { key: 'email', visible: true },
            { key: 'phone', visible: true },
            { key: 'location', visible: true },
            { key: 'website', visible: true },
            { key: 'linkedin', visible: true },
            { key: 'github', visible: true },
            { key: 'huggingface', visible: true },
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
              link_display: 'label',
              fields: [
                { key: 'name', visible: true },
                { key: 'email', visible: true },
                { key: 'phone', visible: true },
                { key: 'location', visible: true },
                { key: 'website', visible: true },
                { key: 'linkedin', visible: true },
                { key: 'github', visible: true },
                { key: 'huggingface', visible: true },
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
      link_display: 'label',
      fields: [
        { key: 'name', visible: true },
        { key: 'email', visible: true },
        { key: 'phone', visible: true },
        { key: 'location', visible: true },
        { key: 'website', visible: true },
        { key: 'linkedin', visible: true },
        { key: 'github', visible: true },
        { key: 'huggingface', visible: true },
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
    next.personal.link_display = 'url';
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

test('settings editor batches preview and section panel updates while typing', async () => {
  const timers = createTimerHarness();
  const initialSettings = {
    layout: { density: 'balanced', font_scale: 'normal' },
    personal: {
      link_display: 'label',
      fields: [
        { key: 'name', visible: true },
        { key: 'email', visible: true },
        { key: 'phone', visible: true },
        { key: 'location', visible: true },
        { key: 'website', visible: true },
        { key: 'linkedin', visible: true },
        { key: 'github', visible: true },
        { key: 'huggingface', visible: true },
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
