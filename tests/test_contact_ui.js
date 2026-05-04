const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const jsyaml = require('js-yaml');

class MockElement {
  constructor(tagName = 'div', ownerDocument = null) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.children = [];
    this.style = {};
    this.textContent = '';
    this.className = '';
    this.dataset = {};
    this.listeners = new Map();
    this._innerHTML = '';
    this.classList = {
      add: (...classes) => {
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        classes.forEach((cls) => set.add(cls));
        this.className = Array.from(set).join(' ');
      },
      remove: (...classes) => {
        const removeSet = new Set(classes);
        this.className = this.className
          .split(/\s+/)
          .filter(Boolean)
          .filter((cls) => !removeSet.has(cls))
          .join(' ');
      },
      toggle: (cls, force) => {
        const set = new Set(this.className.split(/\s+/).filter(Boolean));
        const shouldHave = force == null ? !set.has(cls) : !!force;
        if (shouldHave) set.add(cls);
        else set.delete(cls);
        this.className = Array.from(set).join(' ');
      },
    };
  }

  set innerHTML(value) {
    this._innerHTML = value;
    for (const child of this.children) child.parentNode = null;
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }

  contains(node) {
    let current = node;
    while (current) {
      if (current === this) return true;
      current = current.parentNode;
    }
    return false;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (selector === 'span[data-value]' && current.tagName === 'SPAN' && current.dataset.value != null) return current;
      current = current.parentNode;
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (selector === 'span[data-value]' && child.tagName === 'SPAN' && child.dataset.value != null) {
          matches.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  dispatchEvent(type, extra = {}) {
    const event = {
      target: extra.target || this,
      key: extra.key,
      _stopped: false,
      stopPropagation() {
        this._stopped = true;
      },
    };

    let current = this;
    while (current) {
      for (const callback of current.listeners.get(type) || []) {
        callback(event);
      }
      if (event._stopped) return event;
      current = current.parentNode;
    }

    if (this.ownerDocument) {
      this.ownerDocument._dispatch(type, event);
    }
    return event;
  }
}

function createContext() {
  const domReadyCallbacks = [];
  const documentListeners = new Map();
  const elements = new Map();
  const editorChangeCallbacks = [];
  let yamlLoadCount = 0;

  const document = {
    createElement(tagName) {
      return new MockElement(tagName, document);
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
    createTextNode(text) {
      const node = new MockElement('text', document);
      node.textContent = text;
      return node;
    },
    addEventListener(type, callback) {
      if (type === 'DOMContentLoaded') {
        domReadyCallbacks.push(callback);
        return;
      }
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(callback);
    },
    _dispatch(type, event) {
      for (const callback of documentListeners.get(type) || []) {
        callback(event);
      }
    },
  };

  function register(id, tagName = 'div') {
    const element = new MockElement(tagName, document);
    elements.set(id, element);
    return element;
  }

  const anchor = register('contact-flyout-anchor');
  const pill = register('contact-pill', 'button');
  const flyout = register('contact-flyout');
  const caret = register('contact-pill-caret', 'span');
  const hiddenCount = register('contact-hidden-count', 'span');
  const globalSeg = register('contact-global-seg');
  const fieldsBody = register('contact-fields-body');
  flyout.style.display = 'none';

  const labelSpan = new MockElement('span', document);
  labelSpan.dataset.value = 'label';
  const urlSpan = new MockElement('span', document);
  urlSpan.dataset.value = 'url';
  const bothSpan = new MockElement('span', document);
  bothSpan.dataset.value = 'both';

  globalSeg.appendChild(labelSpan);
  globalSeg.appendChild(urlSpan);
  globalSeg.appendChild(bothSpan);

  anchor.appendChild(pill);
  pill.appendChild(caret);
  pill.appendChild(hiddenCount);
  anchor.appendChild(flyout);
  flyout.appendChild(globalSeg);
  flyout.appendChild(fieldsBody);

  const settings = {
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
  };

  const context = {
    console,
    jsyaml: {
      load(source) {
        yamlLoadCount += 1;
        return jsyaml.load(source);
      },
    },
    document,
    window: null,
    app: {
      state: {
        yaml: 'personal:\n  name: Test User\n  email: test@example.com\n',
      },
    },
    SETTINGS_HELPERS: {
      PERSONAL_FIELD_CATALOG: [
        { key: 'name', isLink: false, locked: true },
        { key: 'email', isLink: false, locked: false },
        { key: 'phone', isLink: false, locked: false },
        { key: 'location', isLink: false, locked: false },
        { key: 'website', isLink: true, locked: false },
        { key: 'linkedin', isLink: true, locked: false },
        { key: 'github', isLink: true, locked: false },
        { key: 'huggingface', isLink: true, locked: false },
      ],
      LINK_FIELDS: new Set(['website', 'linkedin', 'github', 'huggingface']),
      DEFAULT_SETTINGS: settings,
    },
    settingsSync: {
      getSettings() {
        return settings;
      },
      updateFromToolbar(mutator, opts = {}) {
        mutator(settings);
        if (opts.skipApply === false && context.contactUI) {
          context.contactUI.rebuild(settings);
        }
      },
    },
    editorAdapter: {
      onChange(callback) {
        editorChangeCallbacks.push(callback);
      },
    },
  };
  context.window = context;

  return { context, domReadyCallbacks, elements, getYamlLoadCount: () => yamlLoadCount };
}

async function bootContactUI(context, domReadyCallbacks) {
  const source = fs.readFileSync('frontend/contact-ui.js', 'utf8');
  vm.runInNewContext(source, context, { filename: 'frontend/contact-ui.js' });
  for (const callback of domReadyCallbacks) {
    await callback();
  }
}

test('clicking a visibility toggle keeps the contact flyout open', async () => {
  const { context, domReadyCallbacks, elements } = createContext();
  await bootContactUI(context, domReadyCallbacks);

  const pill = elements.get('contact-pill');
  const flyout = elements.get('contact-flyout');

  pill.dispatchEvent('click');
  assert.equal(flyout.style.display, '');

  const body = elements.get('contact-fields-body');
  const emailRow = body.children[2];
  const emailToggle = emailRow.children[0];
  emailToggle.dispatchEvent('click');

  assert.equal(flyout.style.display, '');
});

test('opening the contact flyout parses resume yaml once per rebuild', async () => {
  const { context, domReadyCallbacks, elements, getYamlLoadCount } = createContext();
  await bootContactUI(context, domReadyCallbacks);

  elements.get('contact-pill').dispatchEvent('click');

  assert.equal(getYamlLoadCount(), 1);
});

test('contact rows keep raw values in hover title instead of an inline value column', async () => {
  const { context, domReadyCallbacks, elements } = createContext();
  await bootContactUI(context, domReadyCallbacks);

  elements.get('contact-pill').dispatchEvent('click');

  const body = elements.get('contact-fields-body');
  const emailRow = body.children[2];

  assert.equal(emailRow.title, 'test@example.com');
  assert.equal(emailRow.children.length, 3);
  assert.equal(emailRow.children[1].className, 'f-key');
  assert.equal(emailRow.children[2].className, 'f-ctrl');
});

test('clicking the global contact segment writes personal.default_link_display', async () => {
  const { context, domReadyCallbacks, elements } = createContext();
  await bootContactUI(context, domReadyCallbacks);

  elements.get('contact-pill').dispatchEvent('click');
  const urlSpan = elements.get('contact-global-seg').children[1];
  urlSpan.dispatchEvent('click');

  assert.equal(context.settingsSync.getSettings().personal.default_link_display, 'url');
});

test('clearing a link override writes explicit default instead of deleting link_display', async () => {
  const { context, domReadyCallbacks, elements } = createContext();
  context.settingsSync.getSettings().personal.fields.find((field) => field.key === 'github').link_display = 'label';
  await bootContactUI(context, domReadyCallbacks);

  elements.get('contact-pill').dispatchEvent('click');
  const body = elements.get('contact-fields-body');
  const githubRow = body.children[7];
  const overridePill = githubRow.children[2].children[0];
  const clearButton = overridePill.children[1];
  clearButton.dispatchEvent('click');

  assert.equal(
    context.settingsSync.getSettings().personal.fields.find((field) => field.key === 'github').link_display,
    'default'
  );
});
