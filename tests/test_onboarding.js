const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

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

function makeObCtx({ seen = null, lang = 'ko' } = {}) {
  const storage = { 'mkcv_lang': lang };
  if (seen !== null) storage['mkcv_onboarding_seen'] = seen;

  let overlayOpen = false;
  const listeners = {};

  const ctx = vm.createContext({
    window: {},
    localStorage: {
      getItem: (k) => storage[k] ?? null,
      setItem: (k, v) => { storage[k] = v; },
    },
    document: {
      addEventListener: (evt, fn) => { listeners[evt] = fn; },
      getElementById: (id) => {
        if (id === 'onboarding-overlay') return {
          classList: {
            add: (c) => { if (c === 'open') overlayOpen = true; },
            remove: (c) => { if (c === 'open') overlayOpen = false; },
          },
          addEventListener() {},
        };
        // Return stub for all other elements
        return {
          style: {}, classList: { add() {}, remove() {}, toggle() {} },
          innerHTML: '', textContent: '',
          addEventListener() {},
          querySelectorAll: () => [],
        };
      },
      documentElement: { lang },
      dispatchEvent() {},
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    },
    Image: function Image() {
      // Stub for onboarding.preloadImages — no real image loading in tests.
    },
    app: { state: { lang } },
    _storage: storage,
    _overlayOpen: () => overlayOpen,
    _listeners: listeners,
  });
  return ctx;
}

function loadOnboarding(ctx) {
  // ctx.app is already set as a stub in makeObCtx — no need to run app.js
  vm.runInContext(fs.readFileSync('frontend/src/onboarding.js', 'utf8'), ctx);
}

test('onboarding.init() shows overlay on first visit', () => {
  const ctx = makeObCtx({ seen: null });
  loadOnboarding(ctx);
  ctx.window.onboarding.init();
  assert.ok(ctx._overlayOpen(), 'overlay should be open on first visit');
});

test('onboarding.init() does not show overlay if already seen', () => {
  const ctx = makeObCtx({ seen: '1' });
  loadOnboarding(ctx);
  ctx.window.onboarding.init();
  assert.ok(!ctx._overlayOpen(), 'overlay should stay hidden if already seen');
});

test('onboarding.show() opens overlay', () => {
  const ctx = makeObCtx({ seen: '1' });
  loadOnboarding(ctx);
  ctx.window.onboarding.show();
  assert.ok(ctx._overlayOpen(), 'overlay should open after show()');
});

test('onboarding.hide() sets mkcv_onboarding_seen and closes overlay', () => {
  const ctx = makeObCtx({ seen: null });
  loadOnboarding(ctx);
  ctx.window.onboarding.show();
  ctx.window.onboarding.hide();
  assert.equal(ctx._storage['mkcv_onboarding_seen'], '1');
  assert.ok(!ctx._overlayOpen(), 'overlay should be closed after hide()');
});
