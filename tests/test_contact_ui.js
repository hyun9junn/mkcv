const test = require('node:test');
const assert = require('node:assert/strict');

// Phase 2: contact-ui.js was converted from IIFE-on-window to ESM. This harness
// drives the same scenarios through the ESM module — DOM lives in happy-dom,
// `app.state` is mutated on the live singleton, and `window.settingsSync` /
// `window.editorAdapter` are injected directly onto `globalThis`. The
// `_resetForTesting` and `_getParseCount` hooks provided by the module allow
// tests to start from a clean slate and observe cache behavior without needing
// to stub `jsyaml` itself.

async function createContext() {
  const { app } = await import('../frontend/src/app.js');
  const { contactUI, _resetForTesting, _getParseCount, initContactUI } =
    await import('../frontend/src/contact-ui.js');

  _resetForTesting();

  // Set up the app state that _getPersonalValues() reads.
  app.state = Object.assign(app.state, {
    yaml: 'personal:\n  name: Test User\n  email: test@example.com\n',
  });

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

  // Inject settings via window — contact-ui reads window.settingsSync.
  window.settingsSync = {
    getSettings() {
      return settings;
    },
    updateFromToolbar(mutator, opts = {}) {
      mutator(settings);
      if (opts.applyContact) {
        contactUI.rebuild(settings);
      }
    },
  };

  // Inject editorAdapter via window.
  const editorChangeCallbacks = [];
  window.editorAdapter = {
    onChange(callback) {
      editorChangeCallbacks.push(callback);
    },
  };

  // Build the minimal DOM that initContactUI expects.
  document.body.innerHTML = `
    <div id="contact-flyout-anchor">
      <button id="contact-pill">
        <span id="contact-pill-caret">▾</span>
        <span id="contact-hidden-count" style="display:none"></span>
      </button>
      <div id="contact-flyout" style="display:none">
        <div id="contact-global-seg">
          <span data-value="default">default</span>
          <span data-value="label">label</span>
          <span data-value="url">url</span>
          <span data-value="both">both</span>
        </div>
        <div id="contact-fields-body"></div>
      </div>
    </div>
  `;

  initContactUI();

  const elements = {
    get(id) { return document.getElementById(id); },
  };

  return { settings, elements, getYamlLoadCount: _getParseCount };
}

test.afterEach(() => {
  document.body.innerHTML = '';
  delete window.settingsSync;
  delete window.editorAdapter;
});

test('clicking a visibility toggle keeps the contact flyout open', async () => {
  const { elements } = await createContext();

  const pill = elements.get('contact-pill');
  const flyout = elements.get('contact-flyout');

  pill.click();
  assert.equal(flyout.style.display, '');

  const body = elements.get('contact-fields-body');
  // children: [name-row, divider, email-row, phone-row, ...]
  const emailRow = body.children[2];
  const emailToggle = emailRow.children[0];
  emailToggle.click();

  assert.equal(flyout.style.display, '');
});

test('opening the contact flyout parses resume yaml once per rebuild', async () => {
  const { elements, getYamlLoadCount } = await createContext();

  elements.get('contact-pill').click();

  assert.equal(getYamlLoadCount(), 1);
});

test('contact rows keep raw values in hover title instead of an inline value column', async () => {
  const { elements } = await createContext();

  elements.get('contact-pill').click();

  const body = elements.get('contact-fields-body');
  // children: [name-row, divider, email-row, ...]
  const emailRow = body.children[2];

  assert.equal(emailRow.title, 'test@example.com');
  assert.equal(emailRow.children.length, 3);
  assert.equal(emailRow.children[1].className, 'f-key');
  assert.equal(emailRow.children[2].className, 'f-ctrl');
});

test('clicking the global contact segment writes personal.default_link_display', async () => {
  const { elements, settings } = await createContext();

  elements.get('contact-pill').click();
  // data-value="url" is the third span in contact-global-seg (index 2 after default/label)
  const urlSpan = Array.from(elements.get('contact-global-seg').querySelectorAll('span[data-value]'))
    .find(el => el.getAttribute('data-value') === 'url');
  urlSpan.click();

  assert.equal(settings.personal.default_link_display, 'url');
});

test('clearing a link override writes explicit default instead of deleting link_display', async () => {
  const { elements, settings } = await createContext();
  settings.personal.fields.find((field) => field.key === 'github').link_display = 'label';

  elements.get('contact-pill').click();
  const body = elements.get('contact-fields-body');
  // children: [name-row(0), divider(1), email(2), phone(3), location(4), website(5), linkedin(6), github(7)]
  const githubRow = body.children[7];
  const overridePill = githubRow.children[2].children[0];
  // In real DOM, .children only includes element nodes; the f-override-x span is at
  // children[0] (text nodes are not enumerated by .children).
  const clearButton = overridePill.querySelector('.f-override-x');
  clearButton.click();

  assert.equal(
    settings.personal.fields.find((field) => field.key === 'github').link_display,
    'default'
  );
});
