# Live Preview Performance Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mkcv's automatic PDF preview feel faster by ensuring only the newest preview wins, reducing wasted backend compile work, caching LaTeX template setup, and cutting duplicate frontend YAML parsing.

**Architecture:** Keep the existing live-PDF workflow, but change both ends of the hot path to be latest-only. The frontend preview module becomes a small scheduler with per-tab request sequencing, while the backend preview endpoint coalesces work per session and returns a lightweight stale response for superseded requests. Alongside that, cache the static Jinja template environment in the renderer and centralize parsed-resume reuse in the frontend section/settings path.

**Tech Stack:** Vanilla JS, CodeMirror 5, js-yaml, PDF.js, FastAPI, Pydantic v2, Jinja2, pytest, Node `node:test`

---

## File Map

- `frontend/preview.js`
  - Live preview orchestration. This becomes the owner of per-tab preview session ids, request sequences, in-flight state, and pending payload replacement.
- `frontend/sections-state.js`
  - Section ordering/filtering helpers. This becomes the canonical frontend cached YAML parse layer for repeated same-string resume inspection.
- `frontend/settings-sync.js`
  - Resume/settings synchronization. This stops doing its own raw `jsyaml.load()` when the shared section-state parse helper is available.
- `backend/main.py`
  - API request model and `/api/preview/pdf` control flow. This adds optional preview session metadata and per-session stale-request handling.
- `backend/renderers/latex.py`
  - LaTeX hot path. This caches static Jinja environment/template loading while keeping request-specific helpers in render context.
- `tests/test_preview_scheduler.js`
  - New frontend scheduler regression tests for latest-only behavior and silent stale-response handling.
- `tests/test_sections_state_cached_parse.js`
  - New frontend unit tests proving repeated same-YAML section queries share one parse result.
- `tests/test_settings_sync_tab_switch.js`
  - Existing settings-sync harness. Add a regression that resume-sync prefers the shared section-state parser helper.
- `tests/test_api.py`
  - API regression tests for stale preview handling and per-session isolation.
- `tests/test_latex_renderer.py`
  - Renderer regression tests for cache reuse and no leakage of per-request link/contact settings.

---

### Task 1: Build the Frontend Latest-Only Preview Scheduler

**Files:**
- Create: `tests/test_preview_scheduler.js`
- Modify: `frontend/preview.js`
- Test: `tests/test_preview_scheduler.js`
- Regression: `tests/test_layout_controls_preview.js`

- [ ] **Step 1: Write the failing preview scheduler tests**

Create `tests/test_preview_scheduler.js` with a DOM/timer/fetch harness and these two regressions:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createElement() {
  return {
    style: {},
    innerHTML: '',
    textContent: '',
    clientWidth: 900,
    scrollTop: 0,
    scrollLeft: 0,
    addEventListener() {},
    appendChild() {},
  };
}

function createTimerHarness() {
  let nextId = 1;
  const pending = new Map();
  return {
    setTimeout(callback, delay = 0) {
      const id = nextId++;
      pending.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    runNext() {
      const [id, task] = Array.from(pending.entries()).sort((a, b) => a[1].delay - b[1].delay)[0];
      pending.delete(id);
      task.callback();
    },
    runAll() {
      while (pending.size) this.runNext();
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createContext() {
  const domReady = [];
  const changeCallbacks = [];
  const timers = createTimerHarness();
  const elements = new Map([
    ['preview-frame', createElement()],
    ['preview-loading', createElement()],
    ['preview-error', createElement()],
    ['preview-zoom-label', createElement()],
  ]);

  const fetchCalls = [];
  const responses = [];

  const context = {
    console,
    setTimeout: timers.setTimeout.bind(timers),
    clearTimeout: timers.clearTimeout.bind(timers),
    AbortController,
    document: {
      getElementById(id) {
        return elements.get(id);
      },
      createElement() {
        return createElement();
      },
      addEventListener(type, callback) {
        if (type === 'DOMContentLoaded') domReady.push(callback);
      },
    },
    window: null,
    app: {
      state: {
        yaml: 'personal:\\n  name: Test User\\nsummary: One\\n',
        template: 'classic',
        density: 'balanced',
        font_scale: 'normal',
        link_display: 'label',
        personal_fields: [],
      },
    },
    sectionsState: {
      getVisibleOrder() {
        return ['summary'];
      },
      getOrderedFilteredYaml(yaml) {
        return yaml;
      },
    },
    settingsSync: {
      activeTab: 'resume',
      getSettings() {
        return { sections: [{ key: 'summary', title: 'Summary' }] };
      },
    },
    pdfjsLib: {
      GlobalWorkerOptions: {},
      getDocument() {
        return {
          promise: Promise.resolve({
            numPages: 0,
            destroy() {},
          }),
        };
      },
    },
    fetch(url, options) {
      const body = JSON.parse(options.body);
      fetchCalls.push({ url, body });
      const slot = deferred();
      responses.push(slot);
      return slot.promise;
    },
    editorAdapter: {
      onChange(callback) {
        changeCallbacks.push(callback);
      },
      consumeSuppressedPreviewRefresh() {
        return false;
      },
    },
  };
  context.window = context;

  const source = fs.readFileSync('frontend/preview.js', 'utf8');
  vm.runInNewContext(source, context, { filename: 'frontend/preview.js' });

  return { context, domReady, timers, fetchCalls, responses, elements, emitChange(yaml) {
    context.app.state.yaml = yaml;
    for (const callback of changeCallbacks) callback();
  } };
}

test('preview scheduler applies only the newest queued payload and sends session metadata', async () => {
  const { domReady, timers, emitChange, fetchCalls, responses, context } = createContext();
  for (const callback of domReady) await callback();

  emitChange('personal:\\n  name: Test User\\nsummary: One\\n');
  timers.runAll();
  assert.equal(fetchCalls.length, 1);
  assert.equal(typeof fetchCalls[0].body.preview_session_id, 'string');
  assert.equal(fetchCalls[0].body.preview_request_seq, 1);

  emitChange('personal:\\n  name: Test User\\nsummary: Two\\n');
  timers.runAll();
  assert.equal(fetchCalls.length, 1, 'second edit should queue, not start a parallel fetch');

  responses[0].resolve({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8),
  });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(fetchCalls.length, 2);
  assert.match(fetchCalls[1].body.yaml, /summary: Two/);
  assert.equal(fetchCalls[1].body.preview_request_seq, 2);
  assert.equal(context.document.getElementById('preview-error').style.display, 'none');
});

test('stale preview responses are ignored without showing an error banner', async () => {
  const { domReady, timers, emitChange, responses, elements } = createContext();
  for (const callback of domReady) await callback();

  emitChange('personal:\\n  name: Test User\\nsummary: Fresh\\n');
  timers.runAll();

  responses[0].resolve({
    ok: false,
    json: async () => ({ error: 'stale_preview', message: 'Superseded by newer preview', details: [] }),
  });
  await Promise.resolve();
  await Promise.resolve();

  assert.notEqual(elements.get('preview-error').style.display, 'block');
});
```

- [ ] **Step 2: Run the preview scheduler test to verify it fails**

Run: `node --test tests/test_preview_scheduler.js`

Expected: FAIL because `frontend/preview.js` still uses the old `setTimeout(...refresh...)` pattern, does not send `preview_session_id` / `preview_request_seq`, and currently treats non-OK responses as visible preview errors.

- [ ] **Step 3: Implement the scheduler in `frontend/preview.js`**

Replace the single `refresh()` trigger path with queued latest-only scheduling and a shorter debounce:

```javascript
const PREVIEW_DEBOUNCE_MS = 900;
let timer = null;
let activePdf = null;
let zoomLevel = 1.0;
let _abortController = null;
let _previewSessionId = `preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
let _nextRequestSeq = 0;
let _lastAppliedSeq = 0;
let _inFlight = false;
let _pendingPayload = null;

function _buildPayload(yaml, template) {
  const section_order = sectionsState.getVisibleOrder(app.state.yaml);
  const settings = window.settingsSync ? settingsSync.getSettings() : null;
  const section_titles = settings
    ? Object.fromEntries(settings.sections.map((section) => [section.key, section.title]))
    : {};

  return {
    yaml,
    template,
    section_order,
    section_titles,
    density: app.state.density,
    font_scale: app.state.font_scale,
    link_display: app.state.link_display,
    personal_fields: app.state.personal_fields ?? [],
  };
}

async function _runLatestPreview(payload) {
  const requestSeq = ++_nextRequestSeq;
  _inFlight = true;
  if (_abortController) _abortController.abort();
  _abortController = new AbortController();
  const { signal } = _abortController;

  showLoading();
  try {
    const resp = await fetch('/api/preview/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        preview_session_id: _previewSessionId,
        preview_request_seq: requestSeq,
      }),
      signal,
    });

    if (signal.aborted) return;

    if (!resp.ok) {
      const err = await resp.json();
      if (err?.error === 'stale_preview') return;
      showError(err.message, err.details);
      return;
    }

    if (requestSeq < _lastAppliedSeq) return;
    _lastAppliedSeq = requestSeq;
    await renderPdf(await resp.arrayBuffer());
  } catch (error) {
    if (error.name === 'AbortError') return;
    showError('Preview unavailable — ' + (error.message || 'network error'), []);
  } finally {
    _inFlight = false;
    if (_pendingPayload) {
      const nextPayload = _pendingPayload;
      _pendingPayload = null;
      void _runLatestPreview(nextPayload);
    }
  }
}

function requestRefresh(yaml, template) {
  const payload = _buildPayload(yaml, template);
  if (_inFlight) {
    _pendingPayload = payload;
    return;
  }
  void _runLatestPreview(payload);
}

window.editorAdapter.onChange(() => {
  if (window.settingsSync && window.settingsSync.activeTab === 'settings') return;
  if (window.editorAdapter.consumeSuppressedPreviewRefresh()) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (app.state.yaml.trim()) {
      requestRefresh(sectionsState.getOrderedFilteredYaml(app.state.yaml), app.state.template);
    }
  }, PREVIEW_DEBOUNCE_MS);
});
```

- [ ] **Step 4: Run the preview tests and one existing UI regression**

Run: `node --test tests/test_preview_scheduler.js tests/test_layout_controls_preview.js`

Expected: PASS. The new scheduler test should confirm latest-only queueing and silent stale handling, while the existing layout-controls test should still show one preview refresh per toolbar action.

- [ ] **Step 5: Commit**

```bash
git add tests/test_preview_scheduler.js frontend/preview.js tests/test_layout_controls_preview.js
git commit -m "feat: queue live preview requests by latest edit"
```

---

### Task 2: Add Backend Per-Session Preview Coalescing

**Files:**
- Modify: `backend/main.py`
- Modify: `tests/test_api.py`
- Test: `tests/test_api.py`

- [ ] **Step 1: Write the failing API tests for stale preview handling**

Add these tests near the existing `/api/preview/pdf` coverage in `tests/test_api.py`:

```python
import types
from pathlib import Path

async def test_preview_pdf_returns_stale_preview_for_older_same_session_request(app, monkeypatch):
    first_compile_started = asyncio.Event()
    allow_first_compile_to_finish = asyncio.Event()
    call_count = 0

    async def fake_to_thread(func, *args, **kwargs):
        nonlocal call_count
        call_count += 1
        cwd = Path(kwargs["cwd"])
        if call_count == 1:
          first_compile_started.set()
          await allow_first_compile_to_finish.wait()
        cwd.joinpath("cv.pdf").write_bytes(b"%PDF-1.4\\n% fake preview\\n")
        return types.SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr("backend.main.asyncio.to_thread", fake_to_thread)

    payload = {
        "yaml": VALID_YAML_FULL,
        "template": "classic",
        "preview_session_id": "tab-1",
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        first = asyncio.create_task(client.post("/api/preview/pdf", json={**payload, "preview_request_seq": 1}))
        await first_compile_started.wait()
        second = asyncio.create_task(client.post("/api/preview/pdf", json={**payload, "preview_request_seq": 2}))
        allow_first_compile_to_finish.set()
        first_resp, second_resp = await asyncio.gather(first, second)

    assert first_resp.status_code == 409
    assert first_resp.json()["error"] == "stale_preview"
    assert second_resp.status_code == 200
    assert second_resp.headers["content-type"] == "application/pdf"

async def test_preview_pdf_keeps_sessions_isolated(app, monkeypatch):
    async def fake_to_thread(func, *args, **kwargs):
        cwd = Path(kwargs["cwd"])
        cwd.joinpath("cv.pdf").write_bytes(b"%PDF-1.4\\n% fake preview\\n")
        return types.SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr("backend.main.asyncio.to_thread", fake_to_thread)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        first = client.post("/api/preview/pdf", json={
            "yaml": VALID_YAML_FULL,
            "template": "classic",
            "preview_session_id": "tab-a",
            "preview_request_seq": 1,
        })
        second = client.post("/api/preview/pdf", json={
            "yaml": VALID_YAML_FULL,
            "template": "classic",
            "preview_session_id": "tab-b",
            "preview_request_seq": 1,
        })
        first_resp, second_resp = await asyncio.gather(first, second)

    assert first_resp.status_code == 200
    assert second_resp.status_code == 200
```

- [ ] **Step 2: Run the API tests to verify they fail**

Run: `pytest tests/test_api.py -k "stale_preview or keeps_sessions_isolated" -v`

Expected: FAIL because `CVRequest` does not accept preview session fields yet and `/api/preview/pdf` still renders every request independently.

- [ ] **Step 3: Implement per-session coalescing in `backend/main.py`**

Add optional request metadata, a small in-memory coordinator, and stale-return behavior around the expensive compile block:

```python
from dataclasses import dataclass, field

@dataclass
class PreviewSessionState:
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    latest_seq: int = 0
    last_seen: float = 0.0

_PREVIEW_SESSION_TTL_SECONDS = 300.0
_preview_sessions: dict[str, PreviewSessionState] = {}

class CVRequest(BaseModel):
    yaml: str
    template: str = "classic"
    section_order: Optional[List[str]] = None
    section_titles: Optional[dict] = None
    density: Literal["comfortable", "balanced", "compact"] = "balanced"
    font_scale: Literal["small", "normal", "large"] = "normal"
    link_display: Literal["label", "url", "both"] = "label"
    personal_fields: Optional[List[dict]] = None
    preview_session_id: Optional[str] = None
    preview_request_seq: Optional[int] = None

def _preview_now() -> float:
    return asyncio.get_running_loop().time()

def _prune_preview_sessions(now: float) -> None:
    stale_ids = [
        session_id
        for session_id, state in _preview_sessions.items()
        if now - state.last_seen > _PREVIEW_SESSION_TTL_SECONDS
    ]
    for session_id in stale_ids:
        _preview_sessions.pop(session_id, None)

def _touch_preview_session(session_id: str, request_seq: int) -> PreviewSessionState:
    now = _preview_now()
    _prune_preview_sessions(now)
    state = _preview_sessions.get(session_id)
    if state is None:
        state = PreviewSessionState()
        _preview_sessions[session_id] = state
    state.latest_seq = max(state.latest_seq, request_seq)
    state.last_seen = now
    return state

def _is_stale_preview_request(state: PreviewSessionState, request_seq: int) -> bool:
    return request_seq < state.latest_seq
```

Wrap the preview endpoint like this:

```python
    session_state = None
    if req.preview_session_id and req.preview_request_seq is not None:
        session_state = _touch_preview_session(req.preview_session_id, req.preview_request_seq)

    async def _render_preview_pdf_bytes() -> bytes | JSONResponse:
        renderer = LaTeXRenderer(
            TEMPLATES_DIR,
            template=req.template,
            density=req.density,
            font_scale=req.font_scale,
            link_display=req.link_display,
            personal_fields=req.personal_fields or [],
        )
        latex_content = renderer.render(cv, req.section_order, req.section_titles)

        with tempfile.TemporaryDirectory() as tmpdir:
            tex_path = Path(tmpdir) / "cv.tex"
            tex_path.write_text(latex_content)
            try:
                result = await asyncio.to_thread(
                    subprocess.run,
                    ["xelatex", "-interaction=nonstopmode", "cv.tex"],
                    cwd=tmpdir,
                    capture_output=True,
                    timeout=30,
                    text=True,
                )
            except subprocess.TimeoutExpired:
                return _error("pdf_generation_failed", "xelatex timed out after 30 seconds")
            except FileNotFoundError:
                return _error("pdf_generation_failed", "xelatex not found — install TeX Live or MiKTeX")
            if result.returncode != 0:
                error_lines = [line for line in result.stdout.splitlines() if line.startswith("!")]
                details = error_lines or [line for line in result.stderr.splitlines() if line.strip()]
                return _error("pdf_generation_failed", "xelatex exited with errors", details)
            return (Path(tmpdir) / "cv.pdf").read_bytes()

    if session_state is None:
        pdf_bytes = await _render_preview_pdf_bytes()
        if isinstance(pdf_bytes, JSONResponse):
            return pdf_bytes
        return Response(content=pdf_bytes, media_type="application/pdf")

    async with session_state.lock:
        if _is_stale_preview_request(session_state, req.preview_request_seq):
            return _error("stale_preview", "Superseded by newer preview request", status=409)

        pdf_bytes = await _render_preview_pdf_bytes()
        session_state.last_seen = _preview_now()

        if isinstance(pdf_bytes, JSONResponse):
            return pdf_bytes
        if _is_stale_preview_request(session_state, req.preview_request_seq):
            return _error("stale_preview", "Superseded by newer preview request", status=409)
        return Response(content=pdf_bytes, media_type="application/pdf")
```

- [ ] **Step 4: Run the new API tests plus the existing preview regressions**

Run: `pytest tests/test_api.py -k "preview_pdf or stale_preview or keeps_sessions_isolated" -v`

Expected: PASS. Existing invalid-YAML and unknown-template preview tests should still pass, and the new stale/session tests should verify latest-only backend behavior.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py tests/test_api.py
git commit -m "feat: coalesce preview pdf requests per browser session"
```

---

### Task 3: Cache the Static LaTeX Jinja Environment

**Files:**
- Modify: `backend/renderers/latex.py`
- Modify: `tests/test_latex_renderer.py`
- Test: `tests/test_latex_renderer.py`

- [ ] **Step 1: Write the failing renderer cache regressions**

Add these tests to `tests/test_latex_renderer.py`:

```python
def test_renderer_caches_environment_per_template(monkeypatch, minimal_cv):
    import backend.renderers.latex as latex

    real_environment = latex.jinja2.Environment
    env_calls = 0

    def counting_environment(*args, **kwargs):
        nonlocal env_calls
        env_calls += 1
        return real_environment(*args, **kwargs)

    latex._get_template_render_bundle.cache_clear()
    monkeypatch.setattr(latex.jinja2, "Environment", counting_environment)

    LaTeXRenderer(TEMPLATES_DIR, template="classic").render(minimal_cv)
    LaTeXRenderer(TEMPLATES_DIR, template="classic").render(minimal_cv)

    assert env_calls == 1

def test_cached_environment_does_not_leak_per_request_helpers():
    import backend.renderers.latex as latex

    latex._get_template_render_bundle.cache_clear()

    url_output = LaTeXRenderer(
        TEMPLATES_DIR,
        template="classic",
        link_display="url",
    ).render(_social_cv())

    hidden_output = LaTeXRenderer(
        TEMPLATES_DIR,
        template="classic",
        link_display="label",
        personal_fields=[{"key": "github", "visible": False}],
    ).render(_social_cv())

    assert r"\href{https://github.com/janesmith}{github.com/janesmith}" in url_output
    assert r"\href{https://github.com/janesmith}{GitHub}" not in hidden_output
```

- [ ] **Step 2: Run the renderer tests to verify they fail**

Run: `pytest tests/test_latex_renderer.py -k "caches_environment or leak_per_request_helpers" -v`

Expected: FAIL because the renderer does not yet expose a cached render bundle helper and still rebuilds the environment per render.

- [ ] **Step 3: Implement the cached render bundle in `backend/renderers/latex.py`**

Add a cached template helper and pass request-specific helpers through `template.render(...)` context instead of mutating shared `env.globals`:

```python
@lru_cache(maxsize=None)
def _get_template_render_bundle(templates_dir: str, template: str):
    env = jinja2.Environment(
        loader=jinja2.FileSystemLoader(str(Path(templates_dir) / template)),
        block_start_string="<%",
        block_end_string="%>",
        variable_start_string="<<",
        variable_end_string=">>",
        comment_start_string="<#",
        comment_end_string="#>",
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters.update(_make_jinja_filters())
    return env.get_template("cv.tex.j2")

def render(self, cv: CVData, section_order: Optional[List[str]] = None, section_titles: Optional[dict] = None) -> str:
    template_path = self.templates_dir / self.template / "cv.tex.j2"
    if not template_path.exists():
        raise ValueError(f"unknown_template: '{self.template}' not found")

    order = section_order if section_order else DEFAULT_SECTION_ORDER
    safe_cv = _sanitize_for_latex(cv)
    custom_by_key = {cs.key: cs for cs in safe_cv.custom_sections}
    font_size = _FONT_SIZE.get(self.font_scale, _FONT_SIZE["normal"])
    layout_preamble = _build_layout_preamble(self.density)
    titles = _prepare_section_titles(self.templates_dir, self.template, section_titles)
    xelatex_preamble = _build_xelatex_preamble(self.templates_dir, self.template)
    contact_visible, contact_link_style = _make_contact_helpers(self.personal_fields, self.link_display)
    template = _get_template_render_bundle(str(self.templates_dir), self.template)

    return template.render(
        cv=safe_cv,
        section_order=order,
        custom_by_key=custom_by_key,
        font_size=font_size,
        layout_preamble=layout_preamble,
        section_titles=titles,
        xelatex_preamble=xelatex_preamble,
        link_text=_make_link_text_fn(self.link_display),
        contact_visible=contact_visible,
        contact_link_style=contact_link_style,
    )
```

- [ ] **Step 4: Run the renderer regressions plus existing link-display coverage**

Run: `pytest tests/test_latex_renderer.py -k "caches_environment or leak_per_request_helpers or link_text or contact_visible" -v`

Expected: PASS. The new cache reuse test should confirm one environment build per template, while the existing contact/link helper tests continue to verify request-specific behavior.

- [ ] **Step 5: Commit**

```bash
git add backend/renderers/latex.py tests/test_latex_renderer.py
git commit -m "perf: cache latex template environments"
```

---

### Task 4: Reuse Parsed Resume YAML Across Section and Settings Paths

**Files:**
- Create: `tests/test_sections_state_cached_parse.js`
- Modify: `tests/test_settings_sync_tab_switch.js`
- Modify: `frontend/sections-state.js`
- Modify: `frontend/settings-sync.js`
- Test: `tests/test_sections_state_cached_parse.js`
- Regression: `tests/test_settings_sync_tab_switch.js`

- [ ] **Step 1: Write the failing frontend parse-reuse tests**

Create `tests/test_sections_state_cached_parse.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const SAMPLE_YAML = [
  'personal:',
  '  name: Test User',
  '  email: test@example.com',
  'summary: Hello',
  'projects:',
  '  - name: Demo',
  '    description: Example',
  ''
].join('\\n');

function bootSectionsState() {
  let loadCalls = 0;
  const context = {
    console,
    localStorage: {
      getItem() { return null; },
      setItem() {},
    },
    jsyaml: {
      load() {
        loadCalls += 1;
        return {
          personal: { name: 'Test User', email: 'test@example.com' },
          summary: 'Hello',
          projects: [{ name: 'Demo', description: 'Example' }],
        };
      },
      dump(value) {
        return JSON.stringify(value);
      },
    },
  };
  context.window = context;
  const source = fs.readFileSync('frontend/sections-state.js', 'utf8');
  vm.runInNewContext(source, context, { filename: 'frontend/sections-state.js' });
  return { context, getLoadCalls: () => loadCalls };
}

test('sectionsState shares one parse result across repeated same-yaml lookups', () => {
  const { context, getLoadCalls } = bootSectionsState();

  context.window.sectionsState.getExpandedPresentKeys(SAMPLE_YAML);
  context.window.sectionsState.getVisibleOrder(SAMPLE_YAML);
  context.window.sectionsState.getOrderedFilteredYaml(SAMPLE_YAML);

  assert.equal(getLoadCalls(), 1);
});
```

Add this regression to `tests/test_settings_sync_tab_switch.js`:

```javascript
test('resume sync prefers the shared sectionsState parser helper when available', async () => {
  const { context, domReadyCallbacks } = createContext({
    initialOrder: ['summary'],
    initialYaml: 'personal:\\n  name: Test User\\nsummary: Before\\n',
  });

  let parseCalls = 0;
  context.jsyaml = {
    load() {
      throw new Error('raw jsyaml.load should not run when sectionsState.parseResumeYaml exists');
    },
  };
  context.sectionsState.parseResumeYaml = (yaml) => {
    parseCalls += 1;
    return {
      personal: { name: 'Test User', email: 'test@example.com' },
      summary: 'After',
    };
  };

  await bootSettingsSync(context, domReadyCallbacks);
  context.window.editorAdapter.setValue('personal:\\n  name: Test User\\nsummary: After\\n');

  assert.equal(parseCalls, 1);
});
```

- [ ] **Step 2: Run the frontend tests to verify they fail**

Run: `node --test tests/test_sections_state_cached_parse.js tests/test_settings_sync_tab_switch.js`

Expected: FAIL because `sections-state.js` still calls `jsyaml.load()` independently in multiple helpers and `settings-sync.js` still does its own raw resume parse.

- [ ] **Step 3: Implement the shared parser in `frontend/sections-state.js` and wire `settings-sync.js` to use it**

Add a one-entry same-string cache to `frontend/sections-state.js`, thread the parsed object through repeated helpers, and expose the parser for `settings-sync.js`:

```javascript
let _parsedResumeCache = {
  rawYaml: null,
  parsed: null,
  valid: false,
};

function parseResumeYaml(rawYaml) {
  const text = String(rawYaml ?? '');
  if (_parsedResumeCache.rawYaml === text) {
    return _parsedResumeCache.valid ? _parsedResumeCache.parsed : null;
  }

  try {
    const parsed = jsyaml.load(text);
    const normalized = parsed && typeof parsed === 'object' ? parsed : null;
    _parsedResumeCache = { rawYaml: text, parsed: normalized, valid: true };
    return normalized;
  } catch {
    _parsedResumeCache = { rawYaml: text, parsed: null, valid: false };
    return null;
  }
}

function getCustomDefs(rawYaml, parsed = parseResumeYaml(rawYaml)) {
  if (!parsed || !Array.isArray(parsed.custom_sections)) return {};
  const defs = {};
  for (const cs of parsed.custom_sections) {
    if (cs && cs.key && cs.title) defs[cs.key] = { label: cs.title, yaml: null };
  }
  return defs;
}

function getExpandedPresentKeys(rawYaml) {
  const parsed = parseResumeYaml(rawYaml);
  if (!parsed) return [];
  const keys = Object.keys(parsed).filter((key) => key !== 'personal' && key !== 'custom_sections');
  const customDefs = getCustomDefs(rawYaml, parsed);
  return [...keys, ...Object.keys(customDefs)];
}

function getOrderedFilteredYaml(rawYaml) {
  const parsed = parseResumeYaml(rawYaml);
  if (!parsed) return rawYaml;
  const { hidden, order } = _getState();
  const customDefs = getCustomDefs(rawYaml, parsed);
  const customKeys = Object.keys(customDefs);
  const anyCustomVisible = customKeys.some((key) => !hidden.includes(key));
  const ordered = {};

  if ('personal' in parsed) ordered.personal = parsed.personal;
  for (const key of order) {
    if (key in parsed && key !== 'custom_sections' && !hidden.includes(key)) {
      ordered[key] = parsed[key];
    }
  }
  if (anyCustomVisible && Array.isArray(parsed.custom_sections)) {
    ordered.custom_sections = parsed.custom_sections.filter(
      (section) => section && section.key && !hidden.includes(section.key)
    );
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in ordered) && !hidden.includes(key) && key !== 'custom_sections') {
      ordered[key] = value;
    }
  }
  return jsyaml.dump(ordered, { lineWidth: -1 });
}

return {
  SECTION_DEFS,
  DEFAULT_ORDER,
  isHidden,
  toggleHidden,
  getOrder,
  setOrder,
  resetAll,
  ensureInOrder,
  getExpandedPresentKeys,
  getDef,
  getFilteredYaml,
  getOrderedFilteredYaml,
  getVisibleOrder,
  moveToInvisible,
  moveFromInvisible,
  appendToMainArea,
  reorderMainArea,
  getYamlSectionLayout,
  getYamlSectionState,
  syncYamlToSectionState,
  materializeSection,
  clearInvisibleArea,
  resetSectionYaml,
  parseResumeYaml,
};
```

Use the helper inside `frontend/settings-sync.js`:

```javascript
function _syncSettingsFromResumeYaml(yaml) {
  if (
    _suppressResumeSectionSync ||
    !_parsed.value ||
    !window.sectionsState ||
    typeof sectionsState.getYamlSectionState !== 'function'
  ) return;

  try {
    const parsedResume = typeof sectionsState.parseResumeYaml === 'function'
      ? sectionsState.parseResumeYaml(yaml)
      : jsyaml.load(yaml);
    if (!parsedResume || typeof parsedResume !== 'object') return;
  } catch {
    return;
  }

  const currentState = _getCurrentSectionState();
  const nextState = sectionsState.getYamlSectionState(yaml, currentState.order);
  const presentKeys = _getPresentSectionKeys(yaml);
  nextState.hidden = Array.from(
    new Set([
      ...nextState.hidden,
      ...currentState.hidden.filter((key) => !presentKeys.has(key)),
    ])
  );
  const stateChanged =
    !_arraysEqual(nextState.order, currentState.order) ||
    !_arraysEqual(nextState.hidden, currentState.hidden);
  if (stateChanged) {
    _persistSectionState(nextState);
    if (window.sectionsUI) sectionsUI.buildPanel();
  }

  const nextSettings = _buildSettingsFromSectionState(nextState);
  const nextYaml = settingsToYaml(nextSettings);
  if (!stateChanged && nextYaml === _settingsYaml) return;
  _onYamlChange(nextYaml, { skipApply: true, skipPreview: true });
}
```

- [ ] **Step 4: Run the new parse-cache tests and the existing sync regression suite**

Run: `node --test tests/test_sections_state_cached_parse.js tests/test_settings_sync_tab_switch.js tests/test_section_resume_sync.js`

Expected: PASS. The new test should show one `jsyaml.load()` per same-YAML lookup set, and the existing section/settings sync tests should still pass with the shared parser in place.

- [ ] **Step 5: Commit**

```bash
git add tests/test_sections_state_cached_parse.js tests/test_settings_sync_tab_switch.js frontend/sections-state.js frontend/settings-sync.js tests/test_section_resume_sync.js
git commit -m "perf: reuse parsed resume yaml across preview helpers"
```

---

### Task 5: Run the Cross-Cut Regression Sweep

**Files:**
- Modify: none
- Test: `tests/test_preview_scheduler.js`
- Test: `tests/test_sections_state_cached_parse.js`
- Test: `tests/test_settings_sync_tab_switch.js`
- Test: `tests/test_section_resume_sync.js`
- Test: `tests/test_layout_controls_preview.js`
- Test: `tests/test_api.py`
- Test: `tests/test_latex_renderer.py`

- [ ] **Step 1: Run the frontend JS regression bundle**

Run:

```bash
node --test \
  tests/test_preview_scheduler.js \
  tests/test_sections_state_cached_parse.js \
  tests/test_settings_sync_tab_switch.js \
  tests/test_section_resume_sync.js \
  tests/test_layout_controls_preview.js
```

Expected: PASS. This confirms the new scheduler, shared parser, and existing section/layout sync behavior still work together.

- [ ] **Step 2: Run the backend Python regression bundle**

Run:

```bash
pytest \
  tests/test_api.py \
  tests/test_latex_renderer.py \
  -k "preview_pdf or stale_preview or keeps_sessions_isolated or caches_environment or leak_per_request_helpers or link_text or contact_visible" \
  -v
```

Expected: PASS. This confirms stale preview control flow, renderer caching, and per-request contact/link behavior are all preserved.

- [ ] **Step 3: Sanity-check the local app manually**

Run:

```bash
uv run uvicorn backend.main:app --reload
```

Manual check:

```text
1. Type in resume.yaml twice quickly and verify the preview settles on the newest edit.
2. Change density/font scale and verify one preview refresh still occurs.
3. Toggle a contact field hidden and verify the preview reflects it after the scheduler change.
4. Leave the app idle, then type again and confirm no visible stale-preview error banner appears.
```

Expected: The preview should feel snappier after a pause, without flashing an internal stale-preview error.

- [ ] **Step 4: Commit the final verification state if any follow-up fixes were needed**

```bash
git add frontend/preview.js frontend/sections-state.js frontend/settings-sync.js backend/main.py backend/renderers/latex.py tests/test_preview_scheduler.js tests/test_sections_state_cached_parse.js tests/test_settings_sync_tab_switch.js tests/test_api.py tests/test_latex_renderer.py
git commit -m "test: verify live preview performance improvements"
```
