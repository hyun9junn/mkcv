const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const jsyaml = require('js-yaml');

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
      add() {},
      remove() {},
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
  if (options.initialSettingsYaml) {
    localStorageData.set('mkcv:default:settings.yaml', options.initialSettingsYaml);
  }
  const editorChangeCallbacks = [];
  const counters = { previewRenders: 0, buildPanelCalls: 0, reorderCalls: [] };

  let order = (options.initialOrder || []).slice();
  const hidden = new Set(options.initialHidden || []);
  const sectionTitles = new Map(Object.entries(options.initialTitles || {}));

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
    setValue(str) {
      this.value = str;
      for (const callback of editorChangeCallbacks) callback(str);
    },
    setValueSilently(str) {
      this.value = str;
    },
    setValuePreserveScroll(str) {
      this.value = str;
      for (const callback of editorChangeCallbacks) callback(str);
    },
    getScrollInfo() {
      return { left: 0, top: 0 };
    },
    scrollTo() {},
    suppressNextPreviewRefresh() {},
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
        yaml: options.initialYaml || 'summary: first\n',
        template: options.activeTemplate || 'signature-split',
        density: 'comfortable',
        font_scale: 'large',
        link_display: 'both',
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
      buildPanel() {
        counters.buildPanelCalls += 1;
      },
    },
    sectionsState: {
      DEFAULT_ORDER: ['summary', 'experience', 'education', 'skills', 'projects'],
      getOrderedFilteredYaml(yaml) {
        return yaml;
      },
      reorderMainArea(yaml, sectionOrder) {
        counters.reorderCalls.push(sectionOrder.slice());
        return `${yaml.trimEnd()}\n# order: ${sectionOrder.join(',')}\n`;
      },
      setOrder(newOrder) {
        order = newOrder.slice();
      },
      toggleHidden(key) {
        if (hidden.has(key)) hidden.delete(key);
        else hidden.add(key);
      },
      resetAll() {
        order = this.DEFAULT_ORDER.slice();
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
      SECTION_CATALOG: [
        { key: 'summary', defaultTitle: 'SUMMARY' },
        { key: 'experience', defaultTitle: 'EXPERIENCE' },
        { key: 'education', defaultTitle: 'EDUCATION' },
        { key: 'skills', defaultTitle: 'SKILLS' },
        { key: 'projects', defaultTitle: 'PROJECTS' },
      ],
      KNOWN_KEYS: new Set(['summary', 'experience', 'education', 'skills', 'projects']),
      VALID_DENSITY: ['comfortable', 'balanced', 'compact'],
      VALID_FONT: ['small', 'normal', 'large'],
      DEFAULT_SETTINGS: {
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
      },
      settingsToYaml(settings) {
        return JSON.stringify(settings);
      },
      normalizeTemplateDefaults(rawDefaults, currentTemplate) {
        const defaults = context.SETTINGS_HELPERS.DEFAULT_SETTINGS;
        const normalized = JSON.parse(JSON.stringify(defaults));
        normalized.template = currentTemplate || defaults.template;

        if (rawDefaults?.layout?.density) normalized.layout.density = rawDefaults.layout.density;
        if (rawDefaults?.layout?.font_scale) normalized.layout.font_scale = rawDefaults.layout.font_scale;
        if (rawDefaults?.personal?.default_link_display) normalized.personal.default_link_display = rawDefaults.personal.default_link_display;
        if (Array.isArray(rawDefaults?.personal?.fields) && rawDefaults.personal.fields.length > 0) {
          const seen = new Set();
          normalized.personal.fields = rawDefaults.personal.fields
            .filter((field) => field && field.key && !seen.has(field.key) && seen.add(field.key))
            .map((field) => ({
              key: field.key,
              visible: field.visible !== false,
              ...(field.link_display ? { link_display: field.link_display } : {}),
            }))
            .concat(
              defaults.personal.fields.filter((field) => !seen.has(field.key))
            );
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
            .concat(
              defaults.sections.filter((section) => !seen.has(section.key))
            );
        }

        return normalized;
      },
      parseSettings(raw) {
        if (!raw) {
          return {
            value: {
              template: context.app.state.template,
              layout: { density: 'comfortable', font_scale: 'large' },
              personal: { default_link_display: 'both' },
              sections: order.map((key) => ({
                key,
                title: sectionTitles.get(key) || key.toUpperCase(),
                visible: !hidden.has(key),
              })),
            },
            errors: [],
            warnings: [],
          };
        }
        return { value: JSON.parse(raw), errors: [], warnings: [] };
      },
    },
  };

  context.window = context;
  context.window.editorAdapter = editorAdapter;

  return { context, counters, domReadyCallbacks, localStorageData };
}

async function bootSettingsSync(context, domReadyCallbacks) {
  const source = fs.readFileSync('frontend/settings-sync.js', 'utf8');
  vm.runInNewContext(source, context, { filename: 'frontend/settings-sync.js' });
  for (const callback of domReadyCallbacks) {
    await callback();
  }
}

function loadSettingsHelpers() {
  const context = {
    console,
    jsyaml,
  };
  context.window = context;
  const source = fs.readFileSync('frontend/settings-engine.js', 'utf8');
  vm.runInNewContext(source, context, { filename: 'frontend/settings-engine.js' });
  return context.window.SETTINGS_HELPERS;
}

test('settings helpers normalize template defaults and accept current template names', () => {
  const helpers = loadSettingsHelpers();

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
    key: 'github',
    visible: false,
    link_display: 'both',
  });
  assert.ok(normalized.personal.fields.slice(1).every(f => f.visible === true));
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.sections[0])), { key: 'projects', title: 'Selected Work', visible: true });
});

test('settings helpers fall back invalid template values to classic with a warning', () => {
  const helpers = loadSettingsHelpers();
  const parsed = helpers.parseSettings('template: resume-tech\n');

  assert.equal(parsed.value.template, 'classic');
  assert.equal(parsed.warnings.length, 1);
  assert.match(parsed.warnings[0].msg, /unknown template "resume-tech"/);
});

test('applying template defaults prefers the live selected template over stale settings yaml state', async () => {
  const { context, counters, domReadyCallbacks, localStorageData } = createContext({
    initialOrder: ['projects', 'summary', 'experience', 'education', 'skills'],
    initialHidden: ['skills'],
    initialTitles: {
      summary: 'Profile',
      experience: 'Work History',
      education: 'Education',
      skills: 'Capabilities',
      projects: 'Projects',
    },
    activeTemplate: 'signature-split',
    initialSettingsYaml: JSON.stringify({
      template: 'classic',
      layout: { density: 'comfortable', font_scale: 'large' },
      personal: {
        default_link_display: 'both',
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
        { key: 'projects', title: 'Projects', visible: true },
        { key: 'summary', title: 'Profile', visible: true },
        { key: 'experience', title: 'Work History', visible: true },
        { key: 'education', title: 'Education', visible: true },
        { key: 'skills', title: 'Capabilities', visible: false },
      ],
    }),
  });

  await bootSettingsSync(context, domReadyCallbacks);
  counters.previewRenders = 0;
  counters.buildPanelCalls = 0;
  counters.reorderCalls = [];
  context.app.setState({ template: 'signature-split' });

  context.window.settingsSync.applyTemplateDefaults({
    layout: { density: 'compact', font_scale: 'small' },
    personal: {
      default_link_display: 'url',
      fields: [
        { key: 'name', visible: true },
        { key: 'email', visible: true },
        { key: 'phone', visible: false },
        { key: 'location', visible: true },
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

  assert.equal(context.app.state.template, 'signature-split');
  assert.equal(context.app.state.density, 'compact');
  assert.equal(context.app.state.font_scale, 'small');
  assert.equal(context.app.state.link_display, 'url');
  assert.equal(counters.buildPanelCalls, 1);
  assert.equal(counters.previewRenders, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(counters.reorderCalls)), [['summary', 'experience', 'projects', 'skills', 'education']]);

  const stored = JSON.parse(localStorageData.get('mkcv_sections_state'));
  assert.deepEqual(stored.order, ['summary', 'experience', 'projects', 'skills', 'education']);
  assert.deepEqual(stored.hidden, ['education']);

  const nextSettings = JSON.parse(context.window.settingsSync.getYaml());
  assert.equal(nextSettings.template, 'signature-split');
  assert.deepEqual(nextSettings.layout, { density: 'compact', font_scale: 'small' });
  assert.deepEqual(nextSettings.personal, {
    default_link_display: 'url',
    fields: [
      { key: 'name', visible: true },
      { key: 'email', visible: true },
      { key: 'phone', visible: false },
      { key: 'location', visible: true },
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
  const { context, domReadyCallbacks } = createContext({
    activeTemplate: 'ats-signal',
    initialSettingsYaml: JSON.stringify({
      template: 'ats-signal',
      layout: { density: 'compact', font_scale: 'small' },
      personal: {
        default_link_display: 'both',
        fields: [
          { key: 'name', visible: true },
          { key: 'email', visible: false },
          { key: 'phone', visible: true },
          { key: 'location', visible: true },
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

  await bootSettingsSync(context, domReadyCallbacks);

  context.window.settingsSync.applyTemplateDefaults(null);

  const nextSettings = JSON.parse(context.window.settingsSync.getYaml());
  assert.equal(nextSettings.template, 'ats-signal');
  assert.deepEqual(nextSettings.layout, { density: 'balanced', font_scale: 'normal' });
  assert.deepEqual(nextSettings.personal, {
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
