const test = require('node:test');
const assert = require('node:assert/strict');

// Phase 2: onboarding.js was converted from IIFE-on-window to ESM. This
// harness drives the same scenarios through the ESM module — DOM lives in
// happy-dom, `app.state` is mutated on the live singleton, and
// `_resetOnboardingForTesting` resets step state between tests.

// ── app module tests ─────────────────────────────────────────────────────────

test.afterEach(() => {
  document.body.innerHTML = '';
  if (globalThis.localStorage) localStorage.clear();
});

test('app.state.lang defaults to ko', async () => {
  localStorage.clear();
  const { app } = await import('../frontend/src/app.js');
  assert.equal(app.state.lang, 'ko');
});

test('setLang updates state.lang', async () => {
  const { app } = await import('../frontend/src/app.js');
  app.setLang('en');
  assert.equal(app.state.lang, 'en');
});

test('app.setLang() updates state and localStorage', async () => {
  const { app } = await import('../frontend/src/app.js');
  app.setLang('en');
  assert.equal(app.state.lang, 'en');
  assert.equal(localStorage.getItem('mkcv_lang'), 'en');
});

test('app.setLang() dispatches langchange event with lang detail', async () => {
  const { app } = await import('../frontend/src/app.js');
  const dispatched = [];
  document.addEventListener('langchange', (e) => dispatched.push(e));
  app.setLang('en');
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].type, 'langchange');
  assert.equal(dispatched[0].detail.lang, 'en');
});

test('app.setLang() updates document.documentElement.lang', async () => {
  const { app } = await import('../frontend/src/app.js');
  app.setLang('en');
  assert.equal(document.documentElement.lang, 'en');
});

// ── onboarding module tests ──────────────────────────────────────────────────

// Build a minimal DOM for the onboarding overlay and controls.
function buildOnboardingDOM() {
  // Overlay
  const overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.classList = { _classes: new Set(), add(c) { this._classes.add(c); }, remove(c) { this._classes.delete(c); }, contains(c) { return this._classes.has(c); } };
  document.body.appendChild(overlay);

  // Stub all the elements the onboarding module reads
  const stubIds = [
    'ob-step-label', 'ob-visual', 'ob-body', 'ob-dots',
    'ob-btn-next', 'ob-btn-prev', 'ob-btn-skip', 'ob-btn-close',
  ];
  for (const id of stubIds) {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
}

async function createOnboardingContext({ seen = null, lang = 'ko' } = {}) {
  const { app } = await import('../frontend/src/app.js');
  const {
    onboarding,
    initOnboarding,
    _resetOnboardingForTesting,
  } = await import('../frontend/src/onboarding.js');

  _resetOnboardingForTesting();

  // Set language on the live app singleton.
  app.state.lang = lang;

  // Set up localStorage state for seen flag.
  if (seen !== null) {
    localStorage.setItem('mkcv_onboarding_seen', seen);
  } else {
    localStorage.removeItem('mkcv_onboarding_seen');
  }

  // Build DOM for the onboarding widget.
  buildOnboardingDOM();

  return { onboarding, initOnboarding };
}

function overlayIsOpen() {
  const overlay = document.getElementById('onboarding-overlay');
  return overlay ? overlay.classList.contains('open') : false;
}

test('onboarding.init() shows overlay on first visit', async () => {
  const { initOnboarding } = await createOnboardingContext({ seen: null });
  initOnboarding();
  assert.ok(overlayIsOpen(), 'overlay should be open on first visit');
});

test('onboarding.init() does not show overlay if already seen', async () => {
  const { initOnboarding } = await createOnboardingContext({ seen: '1' });
  initOnboarding();
  assert.ok(!overlayIsOpen(), 'overlay should stay hidden if already seen');
});

test('onboarding.show() opens overlay', async () => {
  const { onboarding, initOnboarding } = await createOnboardingContext({ seen: '1' });
  initOnboarding();
  onboarding.show();
  assert.ok(overlayIsOpen(), 'overlay should open after show()');
});

test('onboarding.hide() sets mkcv_onboarding_seen and closes overlay', async () => {
  const { onboarding, initOnboarding } = await createOnboardingContext({ seen: null });
  initOnboarding();
  onboarding.show();
  onboarding.hide();
  assert.equal(localStorage.getItem('mkcv_onboarding_seen'), '1');
  assert.ok(!overlayIsOpen(), 'overlay should be closed after hide()');
});
