const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function makeAppCtx(langVal = null) {
  const storage = {};
  if (langVal !== null) storage['mkcv_lang'] = langVal;
  const dispatched = [];
  const ctx = vm.createContext({
    window: {},
    localStorage: {
      getItem: (k) => storage[k] ?? null,
      setItem: (k, v) => { storage[k] = v; },
    },
    document: {
      addEventListener() {},
      documentElement: { lang: 'ko' },
      dispatchEvent: (e) => dispatched.push(e),
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    },
    _storage: storage,
    _dispatched: dispatched,
  });
  return ctx;
}

test('app.state.lang defaults to ko', () => {
  const ctx = makeAppCtx();
  vm.runInContext(fs.readFileSync('frontend/app.js', 'utf8'), ctx);
  assert.equal(ctx.window.app.state.lang, 'ko');
});

test('app.state.lang reads en from localStorage', () => {
  const ctx = makeAppCtx('en');
  vm.runInContext(fs.readFileSync('frontend/app.js', 'utf8'), ctx);
  assert.equal(ctx.window.app.state.lang, 'en');
});

test('app.setLang() updates state and localStorage', () => {
  const ctx = makeAppCtx();
  vm.runInContext(fs.readFileSync('frontend/app.js', 'utf8'), ctx);
  ctx.window.app.setLang('en');
  assert.equal(ctx.window.app.state.lang, 'en');
  assert.equal(ctx._storage['mkcv_lang'], 'en');
});

test('app.setLang() dispatches langchange event with lang detail', () => {
  const ctx = makeAppCtx();
  vm.runInContext(fs.readFileSync('frontend/app.js', 'utf8'), ctx);
  ctx.window.app.setLang('en');
  assert.equal(ctx._dispatched.length, 1);
  assert.equal(ctx._dispatched[0].type, 'langchange');
  assert.equal(ctx._dispatched[0].detail.lang, 'en');
});

test('app.setLang() updates document.documentElement.lang', () => {
  const ctx = makeAppCtx();
  vm.runInContext(fs.readFileSync('frontend/app.js', 'utf8'), ctx);
  ctx.window.app.setLang('en');
  assert.equal(ctx.document.documentElement.lang, 'en');
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
    app: { state: { lang } },
    _storage: storage,
    _overlayOpen: () => overlayOpen,
    _listeners: listeners,
  });
  return ctx;
}

function loadOnboarding(ctx) {
  // ctx.app is already set as a stub in makeObCtx — no need to run app.js
  vm.runInContext(fs.readFileSync('frontend/onboarding.js', 'utf8'), ctx);
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
