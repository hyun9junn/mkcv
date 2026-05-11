const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const jsyaml = require('js-yaml');

function createElement() {
  const listeners = new Map();
  let innerHTML = '';
  const element = {
    style: {},
    textContent: '',
    value: '',
    className: '',
    dataset: {},
    hidden: false,
    title: '',
    children: [],
    parentNode: null,
    classList: {
      toggle() {},
      add() {},
      remove() {},
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
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    click() {
      for (const callback of listeners.get('click') || []) {
        callback({ target: this, preventDefault() {}, stopPropagation() {} });
      }
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
        const grip = createElement();
        grip.className = 'chip-grip';
        element.appendChild(grip);
      }
      if (innerHTML.includes('chip-dot')) {
        const dot = createElement();
        dot.className = 'chip-dot';
        element.appendChild(dot);
      }
      if (innerHTML.includes('chip-name')) {
        const name = createElement();
        name.className = 'chip-name';
        const match = innerHTML.match(/<span class="chip-name">([\s\S]*?)<\/span>/);
        name.textContent = match ? match[1] : '';
        element.appendChild(name);
      }
      if (innerHTML.includes('toast-msg')) {
        const msg = createElement();
        msg.className = 'toast-msg';
        element.appendChild(msg);
      }
      if (innerHTML.includes('toast-close')) {
        const close = createElement();
        close.className = 'toast-close';
        element.appendChild(close);
      }
    },
  });

  return element;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createContext(options = {}) {
  const domReadyCallbacks = [];
  const elements = new Map();
  const localStorageData = new Map();
  const editorChangeCallbacks = [];
  const deferredEditorChanges = [];

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
    'sections-panel',
    'reset-modal',
    'reset-modal-title',
    'reset-modal-cancel',
    'reset-modal-confirm',
    'undo-toast',
    'undo-toast-message',
    'undo-toast-btn',
  ];
  for (const id of ids) {
    elements.set(id, createElement());
  }

  const context = {
    console,
    TextEncoder,
    jsyaml,
    setTimeout,
    clearTimeout,
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
      body: createElement(),
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, createElement());
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
        yaml: options.initialYaml || 'personal:\n  name: Test User\n',
        template: 'classic',
        density: 'balanced',
        font_scale: 'normal',
        link_display: 'label',
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
      refresh() {},
    },
    sectionsUI: {
      buildPanel() {},
    },
    requestAnimationFrame(callback) {
      return callback;
    },
    cancelAnimationFrame() {},
    fetch: async () => ({ ok: false }),
  };

  const editorAdapter = {
    value: context.app.state.yaml,
    _suppressNextPreviewRefresh: false,
    setValue(value) {
      this.value = value;
      if (!context.window.settingsSync || context.window.settingsSync.activeTab === 'resume') {
        context.app.setState({ yaml: value });
      }
      if (options.deferEditorChangeDispatch) {
        deferredEditorChanges.push(value);
      } else {
        for (const callback of editorChangeCallbacks) callback(value);
      }
    },
    setValueSilently(value) {
      this.value = value;
    },
    setValuePreserveScroll(value) {
      this.value = value;
      if (!context.window.settingsSync || context.window.settingsSync.activeTab === 'resume') {
        context.app.setState({ yaml: value });
      }
      if (options.deferEditorChangeDispatch) {
        deferredEditorChanges.push(value);
      } else {
        for (const callback of editorChangeCallbacks) callback(value);
      }
    },
    getScrollInfo() {
      return { left: 0, top: 0 };
    },
    scrollTo() {},
    suppressNextPreviewRefresh() {
      this._suppressNextPreviewRefresh = true;
    },
    consumeSuppressedPreviewRefresh() {
      const suppressed = this._suppressNextPreviewRefresh;
      this._suppressNextPreviewRefresh = false;
      return suppressed;
    },
    clearHistory() {},
    closeHint() {},
    onChange(callback) {
      editorChangeCallbacks.push(callback);
    },
  };

  context.window = context;
  context.window.editorAdapter = editorAdapter;
  context.__flushEditorChanges = () => {
    while (deferredEditorChanges.length) {
      const value = deferredEditorChanges.shift();
      for (const callback of editorChangeCallbacks) callback(value);
    }
  };

  return { context, domReadyCallbacks, localStorageData };
}

function loadScript(filename, context) {
  const source = fs.readFileSync(filename, 'utf8');
  vm.runInNewContext(source, context, { filename });
}

async function boot(options = {}) {
  const { context, domReadyCallbacks, localStorageData } = createContext(options);

  // Import ESM modules for settings-engine and sections-state.
  const { SETTINGS_HELPERS, DEFAULT_SETTINGS, settingsToYaml } = await import('../frontend/src/settings-engine.js');
  const { sectionsState, _resetParseCache, _setStorage } = await import('../frontend/src/sections-state.js');

  // Reset sections-state parse cache so each test starts clean.
  _resetParseCache();

  // Point the ESM module at the vm context's localStorage stub so that
  // settings-sync.js (IIFE, writes mkcv_sections_state to context.localStorage)
  // and sectionsState (ESM, reads/writes via _storage) share the same storage.
  _setStorage(context.localStorage);

  context.window.SETTINGS_HELPERS = SETTINGS_HELPERS;
  context.window.sectionsState = sectionsState;

  const helpers = SETTINGS_HELPERS;
  const initialSettings = clone(options.initialSettings || DEFAULT_SETTINGS);
  const settingsYaml = settingsToYaml(initialSettings);

  localStorageData.set('mkcv:default:settings.yaml', settingsYaml);

  if (Array.isArray(options.initialSectionState?.order) || Array.isArray(options.initialSectionState?.hidden)) {
    const sectionState = JSON.stringify({
      order: options.initialSectionState.order || DEFAULT_SETTINGS.sections.map((section) => section.key),
      hidden: options.initialSectionState.hidden || [],
    });
    localStorageData.set('mkcv_sections_state', sectionState);
  }

  loadScript('frontend/src/settings-sync.js', context);
  if (options.loadSectionsUI) {
    loadScript('frontend/src/sections-ui.js', context);
  }

  for (const callback of domReadyCallbacks) {
    await callback();
  }

  return { context, helpers };
}

test.afterEach(async () => {
  if (globalThis.localStorage) localStorage.clear();
  const { _resetParseCache, _setStorage } = await import('../frontend/src/sections-state.js');
  _resetParseCache();
  // Restore globalThis.localStorage as the default storage after each test.
  _setStorage(globalThis.localStorage);
});

test('settings.yaml can hide a present section by moving it below the invisible marker', async () => {
  const { context, helpers } = await boot({
    initialYaml: [
      'personal:',
      '  name: Test User',
      '',
      'summary: >',
      '  Short summary.',
      '',
      'projects:',
      '  - name: Resume Builder',
      '    description: Sync sections reliably.',
      '',
    ].join('\n'),
  });

  const next = clone(context.window.settingsSync.getSettings());
  next.sections.find((section) => section.key === 'projects').visible = false;
  context.window.settingsSync.setYaml(helpers.settingsToYaml(next));

  assert.match(context.app.state.yaml, /### invisible sections/);
  assert.match(context.app.state.yaml, /### invisible sections[\s\S]*\nprojects:/);
  assert.doesNotMatch(
    context.app.state.yaml.split('### invisible sections')[0],
    /\nprojects:/,
    'projects should no longer remain in the main area'
  );
});

test('settings.yaml can reveal an absent built-in section by materializing it into resume.yaml', async () => {
  const { context, helpers } = await boot({
    initialYaml: [
      'personal:',
      '  name: Test User',
      '',
      'summary: >',
      '  Short summary.',
      '',
    ].join('\n'),
  });

  const next = clone(context.window.settingsSync.getSettings());
  next.sections.find((section) => section.key === 'certifications').visible = true;
  context.window.settingsSync.setYaml(helpers.settingsToYaml(next));

  assert.match(context.app.state.yaml, /^certifications:/m);
  assert.equal(context.window.sectionsState.isHidden('certifications'), false);
});

test('revealing one absent section from the resume tab does not flip other absent hidden sections to visible', async () => {
  const { context } = await boot({
    loadSectionsUI: true,
    initialYaml: [
      'personal:',
      '  name: Test User',
      '',
      'summary: >',
      '  Short summary.',
      '',
    ].join('\n'),
  });

  context.window.sectionsUI.buildPanel();

  const panel = context.document.getElementById('sections-panel');
  const certificationsChip = panel.children.find((chip) => chip.dataset.key === 'certifications');
  assert.ok(certificationsChip, 'expected certifications chip to exist');
  assert.match(certificationsChip.className, /\babsent\b/);

  certificationsChip.querySelector('.chip-dot').click();

  const sections = context.window.settingsSync.getSettings().sections;
  assert.equal(
    sections.find((section) => section.key === 'certifications')?.visible,
    true,
    'the clicked absent section should become visible'
  );
  assert.equal(
    sections.find((section) => section.key === 'publications')?.visible,
    false,
    'other absent hidden sections should keep their previous visibility'
  );
  assert.equal(
    sections.find((section) => section.key === 'languages')?.visible,
    false,
    'other absent hidden sections should stay false'
  );
});

test('revealing an absent section while settings tab is open updates settings.yaml to visible true', async () => {
  const { context } = await boot({
    loadSectionsUI: true,
    initialYaml: [
      'personal:',
      '  name: Test User',
      '',
      'summary: >',
      '  Short summary.',
      '',
    ].join('\n'),
  });

  context.document.getElementById('file-tab-settings').click();
  assert.equal(context.window.settingsSync.activeTab, 'settings');

  context.window.sectionsUI.buildPanel();
  const panel = context.document.getElementById('sections-panel');
  const certificationsChip = panel.children.find((chip) => chip.dataset.key === 'certifications');
  assert.ok(certificationsChip, 'expected certifications chip to exist');
  assert.match(certificationsChip.className, /\babsent\b/);

  certificationsChip.querySelector('.chip-dot').click();

  const nextSettings = context.window.settingsSync.getSettings().sections;
  assert.equal(
    nextSettings.find((section) => section.key === 'certifications')?.visible,
    true,
    'clicked absent section should become visible in parsed settings state'
  );
  assert.match(
    context.window.settingsSync.getYaml(),
    /- key: certifications\n\s+title: "CERTIFICATIONS"\n\s+visible: true/,
    'settings.yaml text should flip the clicked section to visible true'
  );
  assert.equal(
    context.window.editorAdapter.value,
    context.window.settingsSync.getYaml(),
    'settings editor should stay in sync with the updated settings.yaml text'
  );
});

test('revealing an absent section while settings tab is open still updates settings when resume yaml is invalid', async () => {
  const { context } = await boot({
    loadSectionsUI: true,
    initialYaml: [
      'personal:',
      '  name: Test User',
      '',
      'summary: [unterminated',
      '',
    ].join('\n'),
  });

  context.document.getElementById('file-tab-settings').click();
  assert.equal(context.window.settingsSync.activeTab, 'settings');

  context.window.sectionsUI.buildPanel();
  const panel = context.document.getElementById('sections-panel');
  const certificationsChip = panel.children.find((chip) => chip.dataset.key === 'certifications');
  assert.ok(certificationsChip, 'expected certifications chip to exist');
  assert.match(certificationsChip.className, /\babsent\b/);

  certificationsChip.querySelector('.chip-dot').click();

  assert.equal(
    context.window.settingsSync.getSettings().sections.find((section) => section.key === 'certifications')?.visible,
    true,
    'clicked absent section should become visible even when resume yaml cannot be parsed'
  );
  assert.match(
    context.window.settingsSync.getYaml(),
    /- key: certifications\n\s+title: "CERTIFICATIONS"\n\s+visible: true/,
    'settings.yaml text should still reflect the reveal action'
  );
});

test('after revealing one hidden absent section in resume tab, revealing another in settings tab still flips visible to true', async () => {
  const { context } = await boot({
    loadSectionsUI: true,
    initialYaml: [
      'personal:',
      '  name: Test User',
      '',
      'summary: >',
      '  Short summary.',
      '',
    ].join('\n'),
  });

  context.window.sectionsUI.buildPanel();
  let panel = context.document.getElementById('sections-panel');

  const certificationsChip = panel.children.find((chip) => chip.dataset.key === 'certifications');
  assert.ok(certificationsChip, 'expected certifications chip to exist');
  certificationsChip.querySelector('.chip-dot').click();

  context.document.getElementById('file-tab-settings').click();
  assert.equal(context.window.settingsSync.activeTab, 'settings');

  context.window.sectionsUI.buildPanel();
  panel = context.document.getElementById('sections-panel');
  const publicationsChip = panel.children.find((chip) => chip.dataset.key === 'publications');
  assert.ok(publicationsChip, 'expected publications chip to exist');
  assert.match(publicationsChip.className, /\babsent\b/);

  publicationsChip.querySelector('.chip-dot').click();

  assert.match(
    context.app.state.yaml,
    /^publications:/m,
    'the second revealed section should be materialized into resume yaml state'
  );
  assert.ok(
    context.window.sectionsState.getExpandedPresentKeys(context.app.state.yaml).includes('publications'),
    'present-key detection should see the second revealed section in resume yaml'
  );

  const nextSections = context.window.settingsSync.getSettings().sections;
  assert.equal(
    nextSections.find((section) => section.key === 'certifications')?.visible,
    true,
    'the first revealed section should remain visible in settings'
  );
  assert.equal(
    nextSections.find((section) => section.key === 'publications')?.visible,
    true,
    'the second revealed section should flip to visible true'
  );
  assert.match(
    context.window.settingsSync.getYaml(),
    /- key: publications\n\s+title: "PUBLICATIONS"\n\s+visible: true/,
    'settings.yaml text should mark the second revealed section as visible'
  );
});

test('clicking an absent built-in chip materializes the section with its selected title comment', async () => {
  const { context } = await boot({
    loadSectionsUI: true,
    initialYaml: [
      'personal:',
      '  name: Test User',
      '',
      'summary: >',
      '  Short summary.',
      '',
    ].join('\n'),
  });

  context.window.settingsSync.updateSectionTitle('certifications', 'Selected Certifications');
  context.window.sectionsUI.buildPanel();

  const panel = context.document.getElementById('sections-panel');
  const certificationsChip = panel.children.find((chip) => chip.dataset.key === 'certifications');
  assert.ok(certificationsChip, 'expected certifications chip to exist');
  assert.match(certificationsChip.className, /\babsent\b/);

  certificationsChip.querySelector('.chip-dot').click();

  assert.match(
    context.app.state.yaml,
    /^certifications:\s+# Selected Certifications$/m,
    'materialized absent sections should carry the currently selected title in resume.yaml'
  );
});

test('reordering hidden chips updates the invisible-area order inside resume.yaml', async () => {
  const { context } = await boot({
    initialYaml: [
      'personal:',
      '  name: Test User',
      '',
      'summary: >',
      '  Short summary.',
      '',
      '### invisible sections',
      '',
      'languages:',
      '  - language: English',
      '    proficiency: Native',
      '',
      'awards:',
      '  - name: Hackathon Winner',
      '    issuer: Example Org',
      '    date: "2025"',
      '',
    ].join('\n'),
    initialSectionState: {
      order: ['summary', 'languages', 'awards'],
      hidden: ['languages', 'awards'],
    },
  });

  context.window.sectionsState.setOrder(['summary', 'awards', 'languages']);

  const invisibleArea = context.app.state.yaml.split('### invisible sections')[1] || '';
  assert.match(invisibleArea, /awards:[\s\S]*languages:/);
});

test('moving a section under the invisible marker in resume.yaml syncs settings.yaml visibility', async () => {
  const { context } = await boot({
    initialYaml: [
      'personal:',
      '  name: Test User',
      '',
      'summary: >',
      '  Short summary.',
      '',
      'projects:',
      '  - name: Resume Builder',
      '    description: Sync sections reliably.',
      '',
    ].join('\n'),
  });

  context.window.editorAdapter.setValue([
    'personal:',
    '  name: Test User',
    '',
    'summary: >',
    '  Short summary.',
    '',
    '### invisible sections',
    '',
    'projects:',
    '  - name: Resume Builder',
    '    description: Sync sections reliably.',
    '',
  ].join('\n'));

  const projects = context.window.settingsSync.getSettings().sections.find((section) => section.key === 'projects');
  assert.equal(projects.visible, false);
});

test('restore recommended updates hidden section placement inside resume.yaml', async () => {
  const { context } = await boot({
    initialYaml: [
      'personal:',
      '  name: Test User',
      '',
      'summary: >',
      '  Short summary.',
      '',
      'education:',
      '  - degree: B.S. Computer Science',
      '    institution: Example University',
      '    year: "2024"',
      '',
      'projects:',
      '  - name: Resume Builder',
      '    description: Sync sections reliably.',
      '',
    ].join('\n'),
  });

  context.window.settingsSync.applyTemplateDefaults({
    sections: [
      { key: 'summary', title: 'SUMMARY', visible: true },
      { key: 'projects', title: 'PROJECTS', visible: true },
      { key: 'education', title: 'EDUCATION', visible: false },
    ],
  });

  assert.match(context.app.state.yaml, /### invisible sections[\s\S]*\neducation:/);
  const mainArea = context.app.state.yaml.split('### invisible sections')[0];
  assert.match(mainArea, /summary:[\s\S]*projects:/);
});

test('clicking a visible middle chip hides it instead of bouncing back to visible', async () => {
  const { context } = await boot({
    loadSectionsUI: true,
    initialYaml: [
      'personal:',
      '  name: Test User',
      '',
      'summary: >',
      '  Short summary.',
      '',
      'experience:',
      '  - title: Staff Engineer',
      '    company: Example Co',
      '    highlights:',
      '      - Shipped section sync fixes.',
      '',
      'projects:',
      '  - name: Resume Builder',
      '    description: Sync sections reliably.',
      '',
    ].join('\n'),
  });

  context.window.sectionsUI.buildPanel();

  const panel = context.document.getElementById('sections-panel');
  const experienceChip = panel.children.find((chip) => chip.dataset.key === 'experience');
  assert.ok(experienceChip, 'expected experience chip to exist');

  experienceChip.querySelector('.chip-dot').click();

  const refreshedChip = panel.children.find((chip) => chip.dataset.key === 'experience');
  assert.equal(context.window.sectionsState.isHidden('experience'), true);
  assert.match(refreshedChip.className, /\bhidden\b/);
  assert.doesNotMatch(refreshedChip.className, /\bon\b/);
  assert.match(context.app.state.yaml, /### invisible sections[\s\S]*\nexperience:/);
  assert.doesNotMatch(
    context.app.state.yaml.split('### invisible sections')[0],
    /\nexperience:/,
    'experience should be removed from the main area after hiding'
  );
});

test('resume-tab hide and show keeps chip order stable after deferred editor sync', async () => {
  const { context } = await boot({
    loadSectionsUI: true,
    deferEditorChangeDispatch: true,
    initialYaml: [
      'personal:',
      '  name: Test User',
      '',
      'summary: >',
      '  Short summary.',
      '',
      'experience:',
      '  - title: Staff Engineer',
      '    company: Example Co',
      '    highlights:',
      '      - Shipped section sync fixes.',
      '',
      'projects:',
      '  - name: Resume Builder',
      '    description: Sync sections reliably.',
      '',
    ].join('\n'),
  });

  context.window.sectionsUI.buildPanel();

  let panel = context.document.getElementById('sections-panel');
  panel.children.find((chip) => chip.dataset.key === 'experience').querySelector('.chip-dot').click();
  context.__flushEditorChanges();

  panel = context.document.getElementById('sections-panel');
  panel.children.find((chip) => chip.dataset.key === 'experience').querySelector('.chip-dot').click();
  context.__flushEditorChanges();

  const chipOrder = panel.children
    .map((chip) => chip.dataset.key)
    .filter((key) => ['summary', 'experience', 'projects'].includes(key));
  assert.deepEqual(chipOrder, ['summary', 'experience', 'projects']);
});

test('renaming a built-in section title mirrors it into resume.yaml as an inline comment', async () => {
  const { context } = await boot({
    initialYaml: [
      'personal:',
      '  name: Test User',
      '',
      'summary: >',
      '  Short summary.',
      '',
      'projects:',
      '  - name: Resume Builder',
      '    description: Sync sections reliably.',
      '',
    ].join('\n'),
  });

  context.window.settingsSync.updateSectionTitle('projects', 'Selected Projects');

  assert.match(
    context.app.state.yaml,
    /^projects:\s+# Selected Projects$/m,
    'projects should advertise its selected display title directly in resume.yaml'
  );
});

test('applying template defaults mirrors selected built-in titles into resume.yaml comments', async () => {
  const { context } = await boot({
    initialYaml: [
      'personal:',
      '  name: Test User',
      '',
      'summary: >',
      '  Short summary.',
      '',
      'projects:',
      '  - name: Resume Builder',
      '    description: Sync sections reliably.',
      '',
    ].join('\n'),
  });

  context.window.settingsSync.applyTemplateDefaults({
    sections: [
      { key: 'summary', title: 'Profile', visible: true },
      { key: 'experience', title: 'Experience', visible: true },
      { key: 'education', title: 'Education', visible: true },
      { key: 'skills', title: 'Skills', visible: true },
      { key: 'projects', title: 'Selected Projects', visible: true },
      { key: 'certifications', title: 'Certifications', visible: false },
      { key: 'publications', title: 'Publications', visible: false },
      { key: 'languages', title: 'Languages', visible: false },
      { key: 'awards', title: 'Awards', visible: false },
      { key: 'extracurricular', title: 'Activities', visible: false },
    ],
  });

  assert.match(
    context.app.state.yaml,
    /^summary:\s+>\s+# Profile$/m,
    'summary should keep its block-scalar marker while advertising the selected title'
  );
  assert.match(
    context.app.state.yaml,
    /^projects:\s+# Selected Projects$/m,
    'projects should reflect the template-selected display title in resume.yaml'
  );
});
