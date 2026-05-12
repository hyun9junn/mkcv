const test = require('node:test');
const assert = require('node:assert/strict');

// Phase 2: preview.js was converted from IIFE-on-window to ESM. The original
// harness used `vm.runInNewContext` to evaluate the source in a custom global
// with mocked pdfjsLib, fetch, timers, etc. We preserve every assertion 1:1 by
// driving the same scenarios through the ESM module — DOM lives in happy-dom,
// `globalThis.fetch` is stubbed per test, `globalThis.setTimeout` /
// `clearTimeout` are swapped for a synthetic timer harness, and `pdfjsLib` is
// substituted via the module's `_setPdfjsLibForTesting` hook.

// Track harness per-test so afterEach can always restore globals on failure.
let _currentHarness = null;

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createTimerHarness() {
  let nextId = 1;
  const pending = new Map();

  function runDue(limit) {
    let ran = false;
    while (true) {
      const ready = Array.from(pending.entries())
        .filter(([, task]) => task.time <= limit)
        .sort((a, b) => a[1].time - b[1].time || a[0] - b[0]);
      if (!ready.length) break;
      const [id, task] = ready[0];
      pending.delete(id);
      ran = true;
      task.callback();
    }
    return ran;
  }

  return {
    now: 0,
    setTimeout(callback, delay = 0) {
      const id = nextId++;
      pending.set(id, { callback, time: this.now + delay });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    advanceBy(ms) {
      this.now += ms;
      runDue(this.now);
    },
    runAll() {
      while (pending.size > 0) {
        const nextTime = Math.min(...Array.from(pending.values()).map((task) => task.time));
        this.now = nextTime;
        runDue(nextTime);
      }
    },
  };
}

function createFetchResponse({ ok = true, jsonData, arrayBufferData }) {
  return {
    ok,
    async json() {
      return jsonData;
    },
    async arrayBuffer() {
      return arrayBufferData || new ArrayBuffer(16);
    },
  };
}

async function createHarness({ search = '', getVisibleOrder, getOrderedFilteredYaml } = {}) {
  const timers = createTimerHarness();
  const editorCallbacks = [];
  const fetchCalls = [];
  const renderBuffers = [];
  const fetchQueue = [];
  const counters = { pageRenderCalls: 0 };

  // Set up DOM under happy-dom — happy-dom doesn't honor query strings on its
  // pre-registered `window.location`, but `URLSearchParams(window.location?.search)`
  // resolves at `initPreview()` time, so we patch `window.location.search`
  // directly.
  document.body.innerHTML = `
    <div id="preview-frame"></div>
    <div id="preview-loading" style="display:none"></div>
    <div id="preview-error" style="display:none"></div>
    <span id="preview-zoom-label"></span>
  `;
  const previewFrame = document.getElementById('preview-frame');
  // Pin clientWidth — happy-dom defaults to 0 which would break the page-scale
  // calc. The original harness used 900.
  Object.defineProperty(previewFrame, 'clientWidth', { configurable: true, value: 900 });

  // happy-dom's `window.location.search` is a writable property setter; use
  // it directly. `history.replaceState` doesn't sync into `location.search` in
  // happy-dom 14.x.
  try { window.location.search = search || ''; }
  catch (_) {
    // Fall back: redefine the location object entirely.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { search: search || '' },
    });
  }

  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  globalThis.fetch = function fetchMock(url, options) {
    const deferred = createDeferred();
    fetchCalls.push({ url, options, deferred });
    fetchQueue.push(deferred);
    return deferred.promise;
  };
  globalThis.setTimeout = timers.setTimeout.bind(timers);
  globalThis.clearTimeout = timers.clearTimeout.bind(timers);

  // Stub sectionsState — the preview module imports `sectionsState` via ESM,
  // so we monkey-patch the live binding's methods rather than swapping the
  // module.
  const sectionsStateMod = await import('../frontend/src/sections-state.js');
  const realGetVisibleOrder = sectionsStateMod.sectionsState.getVisibleOrder;
  const realGetOrderedFilteredYaml = sectionsStateMod.sectionsState.getOrderedFilteredYaml;
  sectionsStateMod.sectionsState.getVisibleOrder = (yaml) => {
    if (typeof getVisibleOrder === 'function') return getVisibleOrder(yaml);
    return [`visible:${yaml}`];
  };
  sectionsStateMod.sectionsState.getOrderedFilteredYaml = (yaml) => {
    if (typeof getOrderedFilteredYaml === 'function') return getOrderedFilteredYaml(yaml);
    return `ordered:${yaml}`;
  };

  // Stub app.state via mutating the singleton — preview reads `app.state.*`.
  const { app } = await import('../frontend/src/app.js');
  app.state = {
    yaml: 'yaml-initial',
    template: 'classic',
    density: 'balanced',
    font_scale: 'normal',
    link_display: 'both',
    personal_fields: [{ key: 'email', visible: true }],
  };

  // Stub editorAdapter via window (preview reads `window.editorAdapter`).
  window.editorAdapter = {
    onChange(callback) {
      editorCallbacks.push(callback);
    },
    consumeSuppressedPreviewRefresh() {
      return false;
    },
  };

  // Stub settingsSync via window.
  window.settingsSync = {
    activeTab: 'resume',
    getSettings() {
      return {
        sections: [
          { key: 'summary', title: 'Summary' },
        ],
      };
    },
  };

  // Substitute pdfjsLib via the module's test hook.
  // happy-dom does not implement HTMLCanvasElement.getContext — stub it so
  // _renderPages() can call `canvas.getContext("2d")` without throwing.
  const realCreateElement = document.createElement.bind(document);
  const stubbedCreateElement = (tagName, ...rest) => {
    const el = realCreateElement(tagName, ...rest);
    if (String(tagName).toLowerCase() === 'canvas' && typeof el.getContext !== 'function') {
      el.getContext = () => ({});
    }
    return el;
  };
  document.createElement = stubbedCreateElement;

  const previewMod = await import('../frontend/src/preview.js');
  previewMod._resetForTesting();
  previewMod._setPdfjsLibForTesting({
    GlobalWorkerOptions: {},
    getDocument({ data }) {
      renderBuffers.push(data);
      return {
        promise: Promise.resolve({
          numPages: 1,
          destroy() {},
          async getPage() {
            return {
              getViewport({ scale }) {
                return { width: 612 * scale, height: 792 * scale };
              },
              render() {
                counters.pageRenderCalls += 1;
                return { promise: Promise.resolve() };
              },
            };
          },
        }),
      };
    },
  });

  // Mirror the IIFE-original behavior: `window.preview = preview` shim that
  // tests reach for.
  window.preview = previewMod.preview;

  function boot() {
    previewMod.initPreview();
  }

  function restore() {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    sectionsStateMod.sectionsState.getVisibleOrder = realGetVisibleOrder;
    sectionsStateMod.sectionsState.getOrderedFilteredYaml = realGetOrderedFilteredYaml;
    document.createElement = realCreateElement;
    previewMod._resetForTesting();
  }

  const harness = {
    context: {
      app,
      preview: previewMod.preview,
    },
    timers,
    editorCallbacks,
    fetchCalls,
    fetchQueue,
    renderBuffers,
    counters,
    elements: {
      get(id) { return document.getElementById(id); },
    },
    boot,
    restore,
  };
  _currentHarness = harness;
  return harness;
}

async function settleRequest(fetchCall, response) {
  fetchCall.deferred.resolve(response);
  await flushMicrotasks();
}

test.afterEach(() => {
  if (_currentHarness) {
    _currentHarness.restore();
    _currentHarness = null;
  }
  document.body.innerHTML = '';
  delete window.editorAdapter;
  delete window.settingsSync;
  delete window.preview;
});

test('latest-only scheduling serializes in-flight work and applies only the newest queued payload', async () => {
  const harness = await createHarness();
  harness.boot();

  harness.timers.advanceBy(200);
  await flushMicrotasks();
  assert.equal(harness.fetchCalls.length, 1);

  harness.context.app.state.yaml = 'yaml-a';
  harness.editorCallbacks[0]();
  harness.context.app.state.yaml = 'yaml-b';
  harness.editorCallbacks[0]();
  harness.context.app.state.yaml = 'yaml-c';
  harness.editorCallbacks[0]();

  harness.timers.runAll();
  await flushMicrotasks();

  assert.equal(harness.fetchCalls.length, 1);

  await settleRequest(
    harness.fetchCalls[0],
    createFetchResponse({ arrayBufferData: new TextEncoder().encode('initial').buffer })
  );
  await flushMicrotasks();

  assert.equal(harness.fetchCalls.length, 2);
  assert.equal(JSON.parse(harness.fetchCalls[1].options.body).yaml, 'ordered:yaml-c');
  assert.equal(harness.renderBuffers.length, 0);

  await settleRequest(
    harness.fetchCalls[1],
    createFetchResponse({ arrayBufferData: new TextEncoder().encode('latest').buffer })
  );
  await flushMicrotasks();

  assert.equal(harness.fetchCalls.length, 2);
  assert.equal(harness.renderBuffers.length, 1);
  assert.deepEqual(
    harness.renderBuffers.map((buffer) => new TextDecoder().decode(buffer)),
    ['latest']
  );

  harness.restore();
});

test('preview requests include preview_session_id and preview_request_seq', async () => {
  const harness = await createHarness();
  harness.boot();

  harness.timers.advanceBy(200);
  await flushMicrotasks();

  let body = JSON.parse(harness.fetchCalls[0].options.body);
  assert.equal(typeof body.preview_session_id, 'string');
  assert.ok(body.preview_session_id.length > 0);
  assert.equal(body.preview_request_seq, 1);

  await settleRequest(harness.fetchCalls[0], createFetchResponse({ arrayBufferData: new ArrayBuffer(4) }));
  harness.context.app.state.yaml = 'yaml-next';
  harness.editorCallbacks[0]();
  harness.timers.runAll();
  await flushMicrotasks();

  body = JSON.parse(harness.fetchCalls[1].options.body);
  assert.equal(body.preview_session_id, JSON.parse(harness.fetchCalls[0].options.body).preview_session_id);
  assert.equal(body.preview_request_seq, 2);

  harness.restore();
});

test('editor changes wait for the longer debounce window before scheduling preview work', async () => {
  const harness = await createHarness();
  harness.boot();

  harness.timers.advanceBy(200);
  await flushMicrotasks();
  await settleRequest(harness.fetchCalls[0], createFetchResponse({ arrayBufferData: new ArrayBuffer(4) }));

  harness.context.app.state.yaml = 'yaml-delayed';
  harness.editorCallbacks[0]();
  harness.timers.advanceBy(799);
  await flushMicrotasks();

  assert.equal(harness.fetchCalls.length, 1);

  harness.timers.advanceBy(101);
  await flushMicrotasks();

  assert.equal(harness.fetchCalls.length, 2);

  harness.restore();
});

test('capture=gif lowers the debounce window for README capture runs', async () => {
  const harness = await createHarness({ search: '?capture=gif' });
  harness.boot();

  harness.timers.advanceBy(200);
  await flushMicrotasks();
  await settleRequest(
    harness.fetchCalls[0],
    createFetchResponse({ arrayBufferData: new ArrayBuffer(4) })
  );
  await flushMicrotasks();

  harness.context.app.state.yaml = 'yaml-fast';
  harness.editorCallbacks[0]();
  harness.timers.advanceBy(199);
  await flushMicrotasks();

  assert.equal(harness.fetchCalls.length, 1);

  harness.timers.advanceBy(1);
  await flushMicrotasks();

  assert.equal(harness.fetchCalls.length, 2);
  assert.equal(JSON.parse(harness.fetchCalls[1].options.body).yaml, 'ordered:yaml-fast');

  harness.restore();
});

test('editor changes skip duplicate preview requests when normalized render input is unchanged', async () => {
  const harness = await createHarness({
    getVisibleOrder() {
      return ['summary'];
    },
    getOrderedFilteredYaml(yaml) {
      if (yaml === 'yaml-space-a' || yaml === 'yaml-space-b') return 'ordered:stable';
      return `ordered:${yaml}`;
    },
  });
  harness.boot();

  harness.timers.advanceBy(200);
  await flushMicrotasks();
  await settleRequest(
    harness.fetchCalls[0],
    createFetchResponse({ arrayBufferData: new ArrayBuffer(4) })
  );
  await flushMicrotasks();

  harness.context.app.state.yaml = 'yaml-space-a';
  harness.editorCallbacks[0]();
  harness.timers.runAll();
  await flushMicrotasks();

  assert.equal(harness.fetchCalls.length, 2);
  assert.equal(JSON.parse(harness.fetchCalls[1].options.body).yaml, 'ordered:stable');
  await settleRequest(
    harness.fetchCalls[1],
    createFetchResponse({ arrayBufferData: new ArrayBuffer(4) })
  );
  await flushMicrotasks();

  harness.context.app.state.yaml = 'yaml-space-b';
  harness.editorCallbacks[0]();
  harness.timers.runAll();
  await flushMicrotasks();

  assert.equal(harness.fetchCalls.length, 2);

  harness.restore();
});

test('reverting to the in-flight preview state clears queued duplicate work', async () => {
  const harness = await createHarness({
    getVisibleOrder() {
      return ['summary'];
    },
  });
  harness.boot();

  harness.timers.advanceBy(200);
  await flushMicrotasks();
  await settleRequest(
    harness.fetchCalls[0],
    createFetchResponse({ arrayBufferData: new ArrayBuffer(4) })
  );
  await flushMicrotasks();

  harness.context.preview.refresh('ordered:changed', 'classic');
  await flushMicrotasks();
  assert.equal(harness.fetchCalls.length, 2);

  harness.context.preview.refresh('ordered:yaml-initial', 'classic');
  harness.context.preview.refresh('ordered:changed', 'classic');
  await flushMicrotasks();

  await settleRequest(
    harness.fetchCalls[1],
    createFetchResponse({ arrayBufferData: new ArrayBuffer(4) })
  );
  await flushMicrotasks();

  assert.equal(harness.fetchCalls.length, 2);

  harness.restore();
});

test('failed preview requests retry when the same render input is requested again', async () => {
  const harness = await createHarness();
  harness.boot();

  harness.timers.advanceBy(200);
  await flushMicrotasks();
  await settleRequest(
    harness.fetchCalls[0],
    createFetchResponse({ arrayBufferData: new ArrayBuffer(4) })
  );
  await flushMicrotasks();

  harness.context.preview.refresh('ordered:retry-target', 'classic');
  await flushMicrotasks();
  assert.equal(harness.fetchCalls.length, 2);

  await settleRequest(
    harness.fetchCalls[1],
    createFetchResponse({
      ok: false,
      jsonData: { error: 'render_failed', message: 'Render failed', details: ['missing font'] },
    })
  );
  await flushMicrotasks();

  harness.context.preview.refresh('ordered:retry-target', 'classic');
  await flushMicrotasks();

  assert.equal(harness.fetchCalls.length, 3);

  harness.restore();
});

test('returning to the last applied preview state clears stale error UI without a refetch', async () => {
  const harness = await createHarness();
  harness.boot();

  harness.timers.advanceBy(200);
  await flushMicrotasks();
  await settleRequest(
    harness.fetchCalls[0],
    createFetchResponse({ arrayBufferData: new TextEncoder().encode('applied').buffer })
  );
  await flushMicrotasks();

  harness.context.preview.refresh('ordered:changed', 'classic');
  await flushMicrotasks();
  assert.equal(harness.fetchCalls.length, 2);

  await settleRequest(
    harness.fetchCalls[1],
    createFetchResponse({
      ok: false,
      jsonData: { error: 'render_failed', message: 'Render failed', details: ['missing font'] },
    })
  );
  await flushMicrotasks();

  assert.equal(harness.elements.get('preview-error').style.display, 'block');

  harness.context.preview.refresh('ordered:yaml-initial', 'classic');
  await flushMicrotasks();

  assert.equal(harness.fetchCalls.length, 2);
  assert.equal(harness.elements.get('preview-error').style.display, 'none');
  assert.equal(harness.elements.get('preview-error').innerHTML, '');

  harness.restore();
});

test('stale_preview responses are ignored without showing an error banner', async () => {
  const harness = await createHarness();
  harness.boot();

  harness.timers.advanceBy(200);
  await flushMicrotasks();

  await settleRequest(
    harness.fetchCalls[0],
    createFetchResponse({
      ok: false,
      jsonData: { error: 'stale_preview', message: 'Stale preview request', details: ['ignored'] },
    })
  );
  await flushMicrotasks();

  assert.equal(harness.elements.get('preview-error').style.display, 'none');
  assert.equal(harness.elements.get('preview-error').innerHTML, '');
  assert.equal(harness.renderBuffers.length, 0);

  harness.restore();
});

test('non-stale preview errors still show the error banner', async () => {
  const harness = await createHarness();
  harness.boot();

  harness.timers.advanceBy(200);
  await flushMicrotasks();

  await settleRequest(
    harness.fetchCalls[0],
    createFetchResponse({
      ok: false,
      jsonData: { error: 'render_failed', message: 'Render failed', details: ['missing font'] },
    })
  );
  await flushMicrotasks();

  assert.equal(harness.elements.get('preview-error').style.display, 'block');
  assert.match(harness.elements.get('preview-error').innerHTML, /Render failed/);
  assert.match(harness.elements.get('preview-error').innerHTML, /missing font/);
  assert.equal(harness.renderBuffers.length, 0);

  harness.restore();
});

test('zoom and refit rerender the current active pdf', async () => {
  const harness = await createHarness();
  harness.boot();

  harness.timers.advanceBy(200);
  await flushMicrotasks();
  await settleRequest(
    harness.fetchCalls[0],
    createFetchResponse({ arrayBufferData: new TextEncoder().encode('latest').buffer })
  );
  await flushMicrotasks();

  assert.equal(harness.counters.pageRenderCalls, 1);
  assert.equal(harness.elements.get('preview-zoom-label').textContent, '100%');

  harness.context.preview.zoomIn();
  await flushMicrotasks();
  assert.equal(harness.counters.pageRenderCalls, 2);
  assert.equal(harness.elements.get('preview-zoom-label').textContent, '110%');

  harness.context.preview.zoomOut();
  await flushMicrotasks();
  assert.equal(harness.counters.pageRenderCalls, 3);
  assert.equal(harness.elements.get('preview-zoom-label').textContent, '100%');

  harness.context.preview.zoomIn();
  await flushMicrotasks();
  assert.equal(harness.counters.pageRenderCalls, 4);
  assert.equal(harness.elements.get('preview-zoom-label').textContent, '110%');

  harness.context.preview.resetZoom();
  await flushMicrotasks();
  assert.equal(harness.counters.pageRenderCalls, 5);
  assert.equal(harness.elements.get('preview-zoom-label').textContent, '100%');

  harness.context.preview.refit();
  await flushMicrotasks();
  assert.equal(harness.counters.pageRenderCalls, 6);
  assert.equal(harness.elements.get('preview-zoom-label').textContent, '100%');

  harness.restore();
});
