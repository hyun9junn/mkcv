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

function createContext() {
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

  storage.set(
    'mkcv_sections_state',
    JSON.stringify({
      hidden: ['certifications'],
      order: ['summary', 'experience', 'education', 'skills', 'projects', 'certifications'],
    })
  );

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
        yaml: [
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
      activeTab: 'resume',
      getSettings() {
        return {
          sections: [
            { key: 'summary', title: 'SUMMARY', visible: true },
            { key: 'experience', title: 'EXPERIENCE', visible: true },
            { key: 'education', title: 'EDUCATION', visible: true },
            { key: 'skills', title: 'SKILLS', visible: true },
            { key: 'projects', title: 'PROJECTS', visible: true },
            { key: 'certifications', title: 'CERTIFICATIONS', visible: false },
          ],
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
  const { context, elements } = createContext();

  loadScript('frontend/sections-state.js', context);
  loadScript('frontend/sections-ui.js', context);

  context.window.sectionsUI.buildPanel();

  const panel = elements.get('sections-panel');
  const absentCertificationsChip = panel.children.find((chip) => chip.dataset.key === 'certifications');
  assert.ok(absentCertificationsChip, 'expected certifications chip to exist');
  assert.match(absentCertificationsChip.className, /\babsent\b/);

  absentCertificationsChip.querySelector('.chip-dot').click();

  assert.match(context.app.state.yaml, /^certifications:/m, 'section should be appended to the main YAML area');
  assert.equal(
    context.window.sectionsState.isHidden('certifications'),
    false,
    'adding an absent hidden section should also reveal it'
  );

  const refreshedCertificationsChip = panel.children.find((chip) => chip.dataset.key === 'certifications');
  assert.ok(refreshedCertificationsChip, 'expected certifications chip after rebuild');
  assert.doesNotMatch(refreshedCertificationsChip.className, /\babsent\b/);
  assert.match(refreshedCertificationsChip.className, /\bon\b/, 'added section should render as visible');
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
