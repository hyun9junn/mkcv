const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const jsyaml = require('js-yaml');

function createElement(tagName = 'div') {
  const listeners = new Map();
  let innerHTML = '';

  const element = {
    tagName: String(tagName).toUpperCase(),
    style: {},
    textContent: '',
    value: '',
    className: '',
    dataset: {},
    title: '',
    hidden: false,
    children: [],
    parentNode: null,
    classList: {
      add() {},
      remove() {},
      toggle() {},
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    insertBefore(child, beforeChild) {
      child.parentNode = this;
      const idx = this.children.indexOf(beforeChild);
      if (idx === -1) {
        this.children.push(child);
      } else {
        this.children.splice(idx, 0, child);
      }
      return child;
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) this.children.splice(idx, 1);
      child.parentNode = null;
      return child;
    },
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    },
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    removeEventListener(type, callback) {
      const callbacks = listeners.get(type);
      if (!callbacks) return;
      const idx = callbacks.indexOf(callback);
      if (idx !== -1) callbacks.splice(idx, 1);
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      if (!selector.startsWith('.')) return [];
      const targetClass = selector.slice(1);
      const results = [];
      const visit = (node) => {
        for (const child of node.children) {
          const classes = String(child.className || '').split(/\s+/).filter(Boolean);
          if (classes.includes(targetClass)) results.push(child);
          visit(child);
        }
      };
      visit(this);
      return results;
    },
    click() {
      for (const callback of listeners.get('click') || []) {
        callback({
          target: this,
          preventDefault() {},
          stopPropagation() {},
        });
      }
    },
    focus() {},
    select() {},
    getBoundingClientRect() {
      return { left: 0, right: 240, top: 0, bottom: 32, width: 240, height: 32 };
    },
  };

  Object.defineProperty(element, 'innerHTML', {
    get() {
      return innerHTML;
    },
    set(value) {
      innerHTML = String(value);
      element.children = [];

      if (innerHTML.includes('chip-grip')) {
        const grip = createElement('span');
        grip.className = 'chip-grip';
        element.appendChild(grip);
      }
      if (innerHTML.includes('chip-dot')) {
        const dot = createElement('span');
        dot.className = 'chip-dot';
        element.appendChild(dot);
      }
      if (innerHTML.includes('chip-name')) {
        const name = createElement('span');
        name.className = 'chip-name';
        const match = innerHTML.match(/<span class="chip-name">([\s\S]*?)<\/span>/);
        name.textContent = match ? match[1] : '';
        element.appendChild(name);
      }
      if (innerHTML.includes('toast-msg')) {
        const msg = createElement('div');
        msg.className = 'toast-msg';
        element.appendChild(msg);
      }
      if (innerHTML.includes('toast-close')) {
        const close = createElement('button');
        close.className = 'toast-close';
        element.appendChild(close);
      }
    },
  });

  return element;
}

function createContext(options = {}) {
  const elements = new Map();
  const domReadyCallbacks = [];
  const previewCalls = [];
  const storage = new Map();
  const editorChangeCallbacks = [];

  const ids = [
    'sections-panel',
    'reset-modal',
    'reset-modal-title',
    'reset-modal-cancel',
    'reset-modal-confirm',
    'undo-toast',
    'undo-toast-message',
    'undo-toast-btn',
    'toast-stack',
  ];
  for (const id of ids) {
    elements.set(id, createElement('div'));
  }

  const initialOrder = options.initialOrder || ['summary', 'experience', 'education', 'skills', 'projects', 'certifications'];
  const initialHidden = options.initialHidden || ['certifications'];
  storage.set(
    'mkcv_sections_state',
    JSON.stringify({
      hidden: initialHidden,
      order: initialOrder,
    })
  );

  const settingsSections = options.settingsSections || [
    { key: 'summary', title: 'SUMMARY', visible: true },
    { key: 'experience', title: 'EXPERIENCE', visible: true },
    { key: 'education', title: 'EDUCATION', visible: true },
    { key: 'skills', title: 'SKILLS', visible: true },
    { key: 'projects', title: 'PROJECTS', visible: true },
    { key: 'certifications', title: 'CERTIFICATIONS', visible: false },
  ];

  const context = {
    console,
    jsyaml,
    requestAnimationFrame(callback) {
      return callback;
    },
    cancelAnimationFrame() {},
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
    },
    document: {
      body: createElement('body'),
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, createElement('div'));
        return elements.get(id);
      },
      createElement,
      addEventListener(type, callback) {
        if (type === 'DOMContentLoaded') domReadyCallbacks.push(callback);
      },
      removeEventListener() {},
    },
    app: {
      state: {
        yaml: options.initialYaml || [
          'personal:',
          '  name: Test User',
          '',
          'summary: >',
          '  Wrote tests first.',
          '',
          '### invisible sections',
          '',
          'languages:',
          '  - language: English',
          '    proficiency: Native',
          '',
        ].join('\n'),
        template: 'classic',
      },
      setState(patch) {
        Object.assign(this.state, patch);
      },
    },
    preview: {
      refresh(yaml, template) {
        previewCalls.push({ yaml, template });
      },
    },
    showToast() {},
    editorAdapter: {
      suppressNextPreviewRefresh() {},
      setValue(value) {
        this.value = value;
        for (const callback of editorChangeCallbacks) callback(value);
      },
      setValuePreserveScroll(value) {
        this.value = value;
        for (const callback of editorChangeCallbacks) callback(value);
      },
      onChange(callback) {
        editorChangeCallbacks.push(callback);
      },
    },
    settingsSync: {
      activeTab: options.activeTab || 'resume',
      getSettings() {
        return {
          sections: settingsSections,
        };
      },
    },
  };
  context.window = context;

  return { context, elements, previewCalls, domReadyCallbacks };
}

function loadScript(filename, context) {
  const source = fs.readFileSync(filename, 'utf8');
  vm.runInNewContext(source, context, { filename });
}

test('clicking an absent hidden built-in section adds it as visible content', () => {
  const { context, elements } = createContext({
    initialYaml: [
      'personal:',
      '  name: Test User',
      '',
      'summary: >',
      '  Wrote tests first.',
      '',
      'projects:',
      '  - name: Resume Builder',
      '    description: Keeps YAML in sync.',
      '',
      '### invisible sections',
      '',
      'languages:',
      '  - language: English',
      '    proficiency: Native',
      '',
    ].join('\n'),
    initialOrder: ['summary', 'certifications', 'projects', 'languages'],
  });

  let setValueCalls = 0;
  let setValuePreserveScrollCalls = 0;
  const originalSetValue = context.editorAdapter.setValue.bind(context.editorAdapter);
  const originalSetValuePreserveScroll = context.editorAdapter.setValuePreserveScroll.bind(context.editorAdapter);
  context.editorAdapter.setValue = (value) => {
    setValueCalls += 1;
    return originalSetValue(value);
  };
  context.editorAdapter.setValuePreserveScroll = (value) => {
    setValuePreserveScrollCalls += 1;
    return originalSetValuePreserveScroll(value);
  };

  loadScript('frontend/sections-state.js', context);
  loadScript('frontend/sections-ui.js', context);

  context.window.sectionsUI.buildPanel();

  const panel = elements.get('sections-panel');
  const absentCertificationsChip = panel.children.find((chip) => chip.dataset.key === 'certifications');
  assert.ok(absentCertificationsChip, 'expected certifications chip to exist');
  assert.match(absentCertificationsChip.className, /\babsent\b/);

  absentCertificationsChip.querySelector('.chip-dot').click();

  assert.match(context.app.state.yaml, /^certifications:/m, 'section should be materialized into the main YAML area');
  assert.match(
    context.app.state.yaml.split('### invisible sections')[0],
    /summary:[\s\S]*certifications:[\s\S]*projects:/,
    'added section should follow the chip order inside the main YAML area'
  );
  assert.equal(
    context.window.sectionsState.isHidden('certifications'),
    false,
    'adding an absent hidden section should also reveal it'
  );
  assert.equal(setValueCalls, 0, 'adding a section should not reset the resume editor state');
  assert.equal(
    setValuePreserveScrollCalls,
    1,
    'adding a section should preserve the current resume editor scroll position'
  );

  const refreshedCertificationsChip = panel.children.find((chip) => chip.dataset.key === 'certifications');
  assert.ok(refreshedCertificationsChip, 'expected certifications chip after rebuild');
  assert.doesNotMatch(refreshedCertificationsChip.className, /\babsent\b/);
  assert.match(refreshedCertificationsChip.className, /\bon\b/, 'added section should render as visible');
});

test('clicking an absent visible built-in section inserts it by chip order instead of appending to the bottom', () => {
  const { context, elements } = createContext({
    initialYaml: [
      'personal:',
      '  name: Test User',
      '',
      'summary: >',
      '  Wrote tests first.',
      '',
      'projects:',
      '  - name: Resume Builder',
      '    description: Keeps YAML in sync.',
      '',
    ].join('\n'),
    initialOrder: ['summary', 'certifications', 'projects'],
    initialHidden: [],
    settingsSections: [
      { key: 'summary', title: 'SUMMARY', visible: true },
      { key: 'projects', title: 'PROJECTS', visible: true },
      { key: 'certifications', title: 'CERTIFICATIONS', visible: true },
    ],
  });

  loadScript('frontend/sections-state.js', context);
  loadScript('frontend/sections-ui.js', context);

  context.window.sectionsUI.buildPanel();

  const panel = elements.get('sections-panel');
  const certificationsChip = panel.children.find((chip) => chip.dataset.key === 'certifications');
  assert.ok(certificationsChip, 'expected certifications chip to exist');
  assert.match(certificationsChip.className, /\babsent\b/);

  certificationsChip.querySelector('.chip-dot').click();

  const mainArea = context.app.state.yaml.split('### invisible sections')[0];
  assert.match(
    mainArea,
    /summary:[\s\S]*certifications:[\s\S]*projects:/,
    'the inserted section should land between its ordered visible neighbors'
  );
  assert.doesNotMatch(
    mainArea,
    /projects:[\s\S]*certifications:/,
    'the inserted section should not be forced to the bottom of the main YAML area'
  );
});

test('sections below the invisible marker render as hidden chips, not absent chips', () => {
  const { context, elements } = createContext();

  context.app.state.yaml = [
    'personal:',
    '  name: Test User',
    '',
    'summary: >',
    '  Wrote tests first.',
    '',
    '### invisible sections',
    '',
    'certifications:',
    '  - name: Deep Learning Specialization',
    '    issuer: Coursera',
    '    date: "2025"',
    '',
  ].join('\n');

  loadScript('frontend/sections-state.js', context);
  loadScript('frontend/sections-ui.js', context);

  context.window.sectionsUI.buildPanel();

  const panel = elements.get('sections-panel');
  const certificationsChip = panel.children.find((chip) => chip.dataset.key === 'certifications');
  assert.ok(certificationsChip, 'expected certifications chip to exist');
  assert.match(certificationsChip.className, /\bhidden\b/);
  assert.doesNotMatch(certificationsChip.className, /\babsent\b/);
  assert.doesNotMatch(certificationsChip.className, /\bon\b/);
});
