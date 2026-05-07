const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createClassList(el) {
  function getSet() {
    return new Set(String(el.className || '').split(/\s+/).filter(Boolean));
  }
  function commit(set) {
    el.className = Array.from(set).join(' ');
  }
  return {
    add(...names) {
      const set = getSet();
      names.forEach((name) => set.add(name));
      commit(set);
    },
    remove(...names) {
      const set = getSet();
      names.forEach((name) => set.delete(name));
      commit(set);
    },
    toggle(name, force) {
      const set = getSet();
      const shouldHave = force == null ? !set.has(name) : !!force;
      if (shouldHave) set.add(name);
      else set.delete(name);
      commit(set);
    },
    contains(name) {
      return getSet().has(name);
    },
  };
}

function createElement(id = '') {
  const listeners = new Map();
  const el = {
    id,
    style: {},
    textContent: '',
    innerHTML: '',
    className: '',
    dataset: {},
    hidden: false,
    children: [],
    classList: null,
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    dispatch(type, event = {}) {
      for (const callback of listeners.get(type) || []) {
        callback({
          preventDefault() {},
          stopPropagation() {},
          target: el,
          ...event,
        });
      }
    },
    click() {
      this.dispatch('click');
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    querySelectorAll(selector) {
      const matchClass = (cls) => {
        const direct = this.children.filter((child) => child.classList?.contains(cls));
        if (direct.length) return direct;
        return this.children.flatMap((child) => child.children || []).filter((c) => c.classList?.contains(cls));
      };
      if (selector === '.tpl-option') return matchClass('tpl-option');
      if (selector === '.tpl-card') return matchClass('tpl-card');
      return [];
    },
    querySelector(selector) {
      if (selector === '.toast-close') return createElement();
      return null;
    },
    contains(target) {
      return target === this || this.children.includes(target);
    },
    remove() {},
  };
  el.classList = createClassList(el);
  return el;
}

function createContext() {
  const domReadyCallbacks = [];
  const elements = new Map();
  const refreshCalls = [];
  const syncedSettings = [];
  const defaultApplications = [];

  const ids = [
    'template-select-wrapper',
    'template-trigger',
    'template-dropdown',
    'template-grid',
    'tpl-name-display',
    'error-banner',
    'btn-validate-template',
    'preview-pane-title',
    'toast-stack',
  ];
  for (const id of ids) elements.set(id, createElement(id));
  elements.get('template-dropdown').appendChild(elements.get('template-grid'));

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

  const context = {
    console,
    setTimeout,
    clearTimeout,
    fetch: async (url) => {
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
    },
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, createElement(id));
        return elements.get(id);
      },
      createElement() {
        return createElement();
      },
      addEventListener(type, callback) {
        if (type === 'DOMContentLoaded') domReadyCallbacks.push(callback);
      },
    },
    app: {
      state: {
        yaml: 'summary: Hello\n',
        template: 'classic',
      },
      setState(patch) {
        Object.assign(this.state, patch);
      },
    },
    preview: {
      refresh(yaml, template) {
        refreshCalls.push({ yaml, template });
      },
    },
    sectionsState: {
      getFilteredYaml(yaml) {
        return yaml;
      },
      getOrderedFilteredYaml(yaml) {
        return yaml;
      },
    },
    settingsSync: {
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
    },
  };
  context.window = context;

  return { context, domReadyCallbacks, elements, refreshCalls, syncedSettings, defaultApplications, signatureDefaults };
}

async function bootTemplates(context, domReadyCallbacks) {
  const source = fs.readFileSync('frontend/templates.js', 'utf8');
  vm.runInNewContext(source, context, { filename: 'frontend/templates.js' });
  for (const callback of domReadyCallbacks) {
    await callback();
  }
}

test('template selection syncs settings.yaml and applies template defaults', async () => {
  const {
    context,
    domReadyCallbacks,
    elements,
    refreshCalls,
    syncedSettings,
    defaultApplications,
    signatureDefaults,
  } = createContext();

  await bootTemplates(context, domReadyCallbacks);

  assert.equal(typeof context.window.templateUI?.selectTemplate, 'function');

  context.window.templateUI.selectTemplate('signature-split');

  assert.equal(context.app.state.template, 'signature-split');
  assert.equal(elements.get('tpl-name-display').textContent, 'Signature Split');
  assert.equal(elements.get('preview-pane-title').textContent, 'Preview — Signature Split');
  assert.equal(refreshCalls.at(-1).template, 'signature-split');
  assert.equal(syncedSettings.at(-1).template, 'signature-split');
  assert.deepEqual(JSON.parse(JSON.stringify(defaultApplications.at(-1))), signatureDefaults);
});

test('template picker shows badge from template metadata', async () => {
  const { context, domReadyCallbacks, elements } = createContext();

  await bootTemplates(context, domReadyCallbacks);

  const cards = elements.get('template-grid').children;
  const signatureCard = cards.find((child) => child.dataset.name === 'signature-split');

  assert.match(signatureCard.innerHTML, /Popular/);
});

test('template picker renders tpl-card elements with thumbnail img src', async () => {
  const { context, domReadyCallbacks, elements } = createContext();

  await bootTemplates(context, domReadyCallbacks);

  const cards = elements.get('template-grid').children;
  assert.equal(cards.length, 2, 'one card per template');

  const classicCard = cards.find((c) => c.dataset.name === 'classic');
  assert.ok(classicCard, 'classic card exists');
  assert.ok(classicCard.classList.contains('tpl-card'), 'card has tpl-card class');
  assert.ok(classicCard.classList.contains('col-1'), 'first card is col-1');
  assert.match(classicCard.innerHTML, /\/assets\/template-previews\/classic\.png/);
});

test('template picker popover contains description text', async () => {
  const { context, domReadyCallbacks, elements } = createContext();

  await bootTemplates(context, domReadyCallbacks);

  const cards = elements.get('template-grid').children;
  const sigCard = cards.find((c) => c.dataset.name === 'signature-split');
  assert.ok(sigCard, 'signature-split card exists');
  assert.ok(sigCard.classList.contains('col-2'), 'second card is col-2');
  assert.match(sigCard.innerHTML, /Creative direction/);
  assert.match(sigCard.innerHTML, /Popular/);
});

test('syncSelectedOption updates tpl-card selected class', async () => {
  const { context, domReadyCallbacks, elements } = createContext();

  await bootTemplates(context, domReadyCallbacks);

  context.window.templateUI.selectTemplate('signature-split');

  const cards = elements.get('template-grid').children;
  const classicCard = cards.find((c) => c.dataset.name === 'classic');
  const sigCard = cards.find((c) => c.dataset.name === 'signature-split');

  assert.ok(!classicCard.classList.contains('selected'), 'classic no longer selected');
  assert.ok(sigCard.classList.contains('selected'), 'signature-split now selected');
});
