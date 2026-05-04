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

function createContext(options = {}) {
  const domReadyCallbacks = [];
  const elements = new Map();
  const localStorageData = new Map();
  const editorChangeCallbacks = [];
  const counters = { previewRenders: 0 };

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
    setTimeout,
    clearTimeout,
    fetch: async (_url, options = {}) => {
      if (options.method === 'POST') {
        return { ok: true, json: async () => ({}) };
      }
      return {
        ok: true,
        json: async () => ({ content: 'layout:\n  density: balanced\n' }),
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
      },
    },
    sectionsUI: {
      buildPanel() {},
    },
    sectionsState: {
      DEFAULT_ORDER: [],
      getOrderedFilteredYaml(yaml) {
        return yaml;
      },
      reorderMainArea(yaml, sectionOrder) {
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
        personal: { link_display: 'label' },
        sections: [],
      },
      settingsToYaml() {
        return 'layout:\n  density: balanced\n';
      },
      parseSettings() {
        return {
          value: {
            layout: { density: 'balanced', font_scale: 'normal' },
            personal: { link_display: 'label' },
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
