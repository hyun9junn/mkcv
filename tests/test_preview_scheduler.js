const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

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

function createElement(tagName = 'div') {
  const listeners = new Map();
  return {
    tagName: tagName.toUpperCase(),
    style: {},
    textContent: '',
    innerHTML: '',
    children: [],
    width: 0,
    height: 0,
    clientWidth: 900,
    scrollTop: 0,
    scrollLeft: 0,
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    dispatch(type, event = {}) {
      for (const callback of listeners.get(type) || []) {
        callback({
          preventDefault() {},
          stopPropagation() {},
          ...event,
        });
      }
    },
    getContext() {
      return {};
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

function createHarness() {
  const timers = createTimerHarness();
  const domReadyCallbacks = [];
  const elements = new Map([
    ['preview-frame', createElement('div')],
    ['preview-loading', createElement('div')],
    ['preview-error', createElement('div')],
    ['preview-zoom-label', createElement('span')],
  ]);
  const editorCallbacks = [];
  const fetchCalls = [];
  const renderBuffers = [];
  const fetchQueue = [];

  elements.get('preview-loading').style.display = 'none';
  elements.get('preview-error').style.display = 'none';

  const context = {
    console,
    Math,
    JSON,
    Date,
    ArrayBuffer,
    Uint8Array,
    TextEncoder,
    setTimeout: timers.setTimeout.bind(timers),
    clearTimeout: timers.clearTimeout.bind(timers),
    fetch(url, options) {
      const deferred = createDeferred();
      fetchCalls.push({ url, options, deferred });
      fetchQueue.push(deferred);
      return deferred.promise;
    },
    document: {
      getElementById(id) {
        return elements.get(id) || null;
      },
      createElement(tagName) {
        return createElement(tagName);
      },
      addEventListener(type, callback) {
        if (type === 'DOMContentLoaded') domReadyCallbacks.push(callback);
      },
    },
    window: null,
    pdfjsLib: {
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
                  return { promise: Promise.resolve() };
                },
              };
            },
          }),
        };
      },
    },
    sectionsState: {
      getVisibleOrder(yaml) {
        return [`visible:${yaml}`];
      },
      getOrderedFilteredYaml(yaml) {
        return `ordered:${yaml}`;
      },
    },
    settingsSync: {
      activeTab: 'resume',
      getSettings() {
        return {
          sections: [
            { key: 'summary', title: 'Summary' },
          ],
        };
      },
    },
    app: {
      state: {
        yaml: 'yaml-initial',
        template: 'classic',
        density: 'balanced',
        font_scale: 'normal',
        link_display: 'both',
        personal_fields: [{ key: 'email', visible: true }],
      },
    },
    editorAdapter: {
      onChange(callback) {
        editorCallbacks.push(callback);
      },
      consumeSuppressedPreviewRefresh() {
        return false;
      },
    },
    AbortController: class AbortController {
      constructor() {
        this.signal = { aborted: false };
      }
      abort() {
        this.signal.aborted = true;
      }
    },
  };
  context.window = context;

  function boot() {
    const source = fs.readFileSync('frontend/preview.js', 'utf8');
    vm.runInNewContext(source, context, { filename: 'frontend/preview.js' });
    for (const callback of domReadyCallbacks) {
      callback();
    }
  }

  return {
    context,
    timers,
    editorCallbacks,
    fetchCalls,
    fetchQueue,
    renderBuffers,
    elements,
    boot,
  };
}

async function settleRequest(fetchCall, response) {
  fetchCall.deferred.resolve(response);
  await flushMicrotasks();
}

test('latest-only scheduling serializes in-flight work and applies only the newest queued payload', async () => {
  const harness = createHarness();
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

  await settleRequest(
    harness.fetchCalls[1],
    createFetchResponse({ arrayBufferData: new TextEncoder().encode('latest').buffer })
  );
  await flushMicrotasks();

  assert.equal(harness.fetchCalls.length, 2);
  assert.equal(harness.renderBuffers.length, 2);
  assert.deepEqual(
    harness.renderBuffers.map((buffer) => new TextDecoder().decode(buffer)),
    ['initial', 'latest']
  );
});

test('preview requests include preview_session_id and preview_request_seq', async () => {
  const harness = createHarness();
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
});

test('stale_preview responses are ignored without showing an error banner', async () => {
  const harness = createHarness();
  harness.boot();

  harness.timers.advanceBy(200);
  await flushMicrotasks();

  await settleRequest(
    harness.fetchCalls[0],
    createFetchResponse({
      ok: false,
      jsonData: { code: 'stale_preview', message: 'Stale preview request', details: ['ignored'] },
    })
  );
  await flushMicrotasks();

  assert.equal(harness.elements.get('preview-error').style.display, 'none');
  assert.equal(harness.elements.get('preview-error').innerHTML, '');
  assert.equal(harness.renderBuffers.length, 0);
});
