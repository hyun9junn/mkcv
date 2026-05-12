const test = require('node:test');
const assert = require('node:assert/strict');
const jsyaml = require('js-yaml');

// Phase 2: sections-ui.js was converted from IIFE-on-window to ESM. This
// harness drives the same scenarios through the ESM module — DOM lives in
// happy-dom, `app.state` is mutated on the live singleton, `sectionsState`
// parse cache and storage are reset via exported test hooks, and
// `window.settingsSync` / `window.editorAdapter` are injected onto
// `globalThis`. The imported `preview` object's `.refresh` method is
// monkey-patched to capture calls without invoking real PDF rendering.

function createMockElement(tagName = 'div') {
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
      add(...cls) {
        const set = new Set(element.className.split(/\s+/).filter(Boolean));
        cls.forEach((c) => set.add(c));
        element.className = Array.from(set).join(' ');
      },
      remove(...cls) {
        const removeSet = new Set(cls);
        element.className = element.className
          .split(/\s+/)
          .filter(Boolean)
          .filter((c) => !removeSet.has(c))
          .join(' ');
      },
      toggle(cls, force) {
        const set = new Set(element.className.split(/\s+/).filter(Boolean));
        const shouldHave = force == null ? !set.has(cls) : !!force;
        if (shouldHave) set.add(cls);
        else set.delete(cls);
        element.className = Array.from(set).join(' ');
      },
    },
    appendChild(child) {
      child.parentNode = element;
      element.children.push(child);
      return child;
    },
    insertBefore(child, beforeChild) {
      child.parentNode = element;
      const idx = element.children.indexOf(beforeChild);
      if (idx === -1) element.children.push(child);
      else element.children.splice(idx, 0, child);
      return child;
    },
    removeChild(child) {
      const idx = element.children.indexOf(child);
      if (idx !== -1) element.children.splice(idx, 1);
      child.parentNode = null;
      return child;
    },
    remove() {
      if (element.parentNode) element.parentNode.removeChild(element);
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
      return element.querySelectorAll(selector)[0] || null;
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
      visit(element);
      return results;
    },
    click() {
      for (const callback of listeners.get('click') || []) {
        callback({ target: element, preventDefault() {}, stopPropagation() {} });
      }
    },
    focus() {},
    select() {},
    getBoundingClientRect() {
      return { left: 0, right: 240, top: 0, bottom: 32, width: 240, height: 32 };
    },
  };

  Object.defineProperty(element, 'innerHTML', {
    get() { return innerHTML; },
    set(value) {
      innerHTML = String(value);
      element.children = [];
      if (innerHTML.includes('chip-grip')) {
        const grip = createMockElement('span');
        grip.className = 'chip-grip';
        element.appendChild(grip);
      }
      if (innerHTML.includes('chip-dot')) {
        const dot = createMockElement('span');
        dot.className = 'chip-dot';
        element.appendChild(dot);
      }
      if (innerHTML.includes('chip-name')) {
        const name = createMockElement('span');
        name.className = 'chip-name';
        const match = innerHTML.match(/<span class="chip-name">([\s\S]*?)<\/span>/);
        name.textContent = match ? match[1] : '';
        element.appendChild(name);
      }
      if (innerHTML.includes('toast-msg')) {
        const msg = createMockElement('div');
        msg.className = 'toast-msg';
        element.appendChild(msg);
      }
      if (innerHTML.includes('toast-close')) {
        const close = createMockElement('button');
        close.className = 'toast-close';
        element.appendChild(close);
      }
    },
  });

  return element;
}

function createMockDocument(elements) {
  const documentListeners = new Map();
  return {
    body: createMockElement('body'),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createMockElement('div'));
      return elements.get(id);
    },
    createElement: createMockElement,
    addEventListener(type, callback) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(callback);
    },
    removeEventListener() {},
  };
}

async function createHarness(options = {}) {
  const { app } = await import('../frontend/src/app.js');
  const { sectionsState, _resetParseCache, _setStorage } =
    await import('../frontend/src/sections-state.js');
  const { sectionsUI, _setPanelForTesting } =
    await import('../frontend/src/sections-ui.js');
  const previewMod = await import('../frontend/src/preview.js');

  // Reset sections-state parse cache.
  _resetParseCache();

  // Set up in-memory localStorage storage.
  const storage = new Map();
  const localStorageMock = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  };

  // Initialise the section state storage.
  const initialOrder = options.initialOrder || ['summary', 'experience', 'education', 'skills', 'projects', 'certifications'];
  const initialHidden = options.initialHidden || ['certifications'];
  storage.set('mkcv_sections_state', JSON.stringify({ hidden: initialHidden, order: initialOrder }));

  _setStorage(localStorageMock);

  // Set app state.
  app.state = Object.assign(app.state, {
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
  });

  // Capture preview refresh calls by monkey-patching the live `preview` export.
  const previewCalls = [];
  const realRefresh = previewMod.preview.refresh;
  previewMod.preview.refresh = (yaml, template) => {
    previewCalls.push({ yaml, template });
  };

  // Track editorAdapter calls.
  let setValueCalls = 0;
  let setValuePreserveScrollCalls = 0;
  const editorChangeCallbacks = [];

  const editorAdapter = {
    value: app.state.yaml,
    suppressNextPreviewRefresh() {},
    consumeSuppressedPreviewRefresh() { return false; },
    setValue(value) {
      setValueCalls += 1;
      this.value = value;
      app.setState({ yaml: value });
      for (const cb of editorChangeCallbacks) cb(value);
    },
    setValuePreserveScroll(value) {
      setValuePreserveScrollCalls += 1;
      this.value = value;
      app.setState({ yaml: value });
      for (const cb of editorChangeCallbacks) cb(value);
    },
    onChange(callback) {
      editorChangeCallbacks.push(callback);
    },
  };
  window.editorAdapter = editorAdapter;

  const settingsSections = options.settingsSections || [
    { key: 'summary', title: 'SUMMARY', visible: true },
    { key: 'experience', title: 'EXPERIENCE', visible: true },
    { key: 'education', title: 'EDUCATION', visible: true },
    { key: 'skills', title: 'SKILLS', visible: true },
    { key: 'projects', title: 'PROJECTS', visible: true },
    { key: 'certifications', title: 'CERTIFICATIONS', visible: false },
  ];

  window.settingsSync = {
    activeTab: options.activeTab || 'resume',
    getSettings() {
      return { sections: settingsSections };
    },
  };

  // Set up a mock panel element using the mock element (not happy-dom) so that
  // chip children are tracked in element.children.
  const elements = new Map();
  const panel = createMockElement('div');
  elements.set('sections-panel', panel);
  for (const id of ['reset-modal', 'reset-modal-title', 'reset-modal-cancel', 'reset-modal-confirm',
    'undo-toast', 'undo-toast-message', 'undo-toast-btn', 'toast-stack']) {
    elements.set(id, createMockElement('div'));
  }

  // Replace the module's document reference for getElementById/createElement by
  // temporarily overriding window.document. Sections-ui uses the global
  // `document` reference, so we patch it.
  const originalDocument = globalThis.document;
  globalThis.document = createMockDocument(elements);

  // Inject the panel directly via the test hook so initSectionsUI isn't needed.
  _setPanelForTesting(panel);

  function restore() {
    globalThis.document = originalDocument;
    previewMod.preview.refresh = realRefresh;
    delete window.editorAdapter;
    delete window.settingsSync;
  }

  const harness = {
    sectionsState,
    sectionsUI,
    panel,
    elements,
    previewCalls,
    app,
    get setValueCalls() { return setValueCalls; },
    get setValuePreserveScrollCalls() { return setValuePreserveScrollCalls; },
    restore,
  };
  _currentHarness = harness;
  return harness;
}

// Track harness per-test so afterEach can always restore globalThis.document.
let _currentHarness = null;

test.afterEach(async () => {
  if (_currentHarness) {
    _currentHarness.restore();
    _currentHarness = null;
  }
  const { _resetParseCache, _setStorage } = await import('../frontend/src/sections-state.js');
  _resetParseCache();
  _setStorage(globalThis.localStorage);
});

test('education default section scaffold uses start and end dates', async () => {
  const { sectionsState, restore } = await createHarness();

  assert.match(sectionsState.SECTION_DEFS.education.yaml, /start_date: "2020"/);
  assert.match(sectionsState.SECTION_DEFS.education.yaml, /end_date: "2024"/);
  assert.doesNotMatch(sectionsState.SECTION_DEFS.education.yaml, /\byear:/);

  restore();
});

test('skills default section scaffold uses block-list items without forced quotes', async () => {
  const { sectionsState, restore } = await createHarness();

  assert.match(sectionsState.SECTION_DEFS.skills.yaml, /category: Languages/);
  assert.match(sectionsState.SECTION_DEFS.skills.yaml, /items:\n\s+- Python\n\s+- JavaScript/);
  assert.doesNotMatch(sectionsState.SECTION_DEFS.skills.yaml, /items: \[/);

  restore();
});

test('clicking an absent hidden built-in section adds it as visible content', async () => {
  const harness = await createHarness({
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

  harness.sectionsUI.buildPanel();

  const absentCertificationsChip = harness.panel.children.find((chip) => chip.dataset.key === 'certifications');
  assert.ok(absentCertificationsChip, 'expected certifications chip to exist');
  assert.match(absentCertificationsChip.className, /\babsent\b/);

  absentCertificationsChip.querySelector('.chip-dot').click();

  assert.match(harness.app.state.yaml, /^certifications:/m, 'section should be materialized into the main YAML area');
  assert.match(
    harness.app.state.yaml.split('### invisible sections')[0],
    /summary:[\s\S]*certifications:[\s\S]*projects:/,
    'added section should follow the chip order inside the main YAML area'
  );
  assert.equal(
    harness.sectionsState.isHidden('certifications'),
    false,
    'adding an absent hidden section should also reveal it'
  );
  assert.equal(harness.setValueCalls, 0, 'adding a section should not reset the resume editor state');
  assert.equal(
    harness.setValuePreserveScrollCalls,
    1,
    'adding a section should preserve the current resume editor scroll position'
  );

  const refreshedCertificationsChip = harness.panel.children.find((chip) => chip.dataset.key === 'certifications');
  assert.ok(refreshedCertificationsChip, 'expected certifications chip after rebuild');
  assert.doesNotMatch(refreshedCertificationsChip.className, /\babsent\b/);
  assert.match(refreshedCertificationsChip.className, /\bon\b/, 'added section should render as visible');

  harness.restore();
});

test('clicking an absent visible built-in section inserts it by chip order instead of appending to the bottom', async () => {
  const harness = await createHarness({
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

  harness.sectionsUI.buildPanel();

  const certificationsChip = harness.panel.children.find((chip) => chip.dataset.key === 'certifications');
  assert.ok(certificationsChip, 'expected certifications chip to exist');
  assert.match(certificationsChip.className, /\babsent\b/);

  certificationsChip.querySelector('.chip-dot').click();

  const mainArea = harness.app.state.yaml.split('### invisible sections')[0];
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

  harness.restore();
});

test('sections below the invisible marker render as hidden chips, not absent chips', async () => {
  const harness = await createHarness({
    initialYaml: [
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
    ].join('\n'),
  });

  harness.sectionsUI.buildPanel();

  const certificationsChip = harness.panel.children.find((chip) => chip.dataset.key === 'certifications');
  assert.ok(certificationsChip, 'expected certifications chip to exist');
  assert.match(certificationsChip.className, /\bhidden\b/);
  assert.doesNotMatch(certificationsChip.className, /\babsent\b/);
  assert.doesNotMatch(certificationsChip.className, /\bon\b/);

  harness.restore();
});
