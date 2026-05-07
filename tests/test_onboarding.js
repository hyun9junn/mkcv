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
