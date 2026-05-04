# Deployment-Ready MKCV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MKCV a fully stateless container deployable on Docker locally, GHCR-published for pull-and-run, and cloud-deployable on Railway/Render with zero config.

**Architecture:** Eight sequential tasks applied directly to `main` (the `feat/multi-user-deployment` branch has diverged 64+ commits and cannot be merged cleanly). Tasks 1–4 make the backend and frontend stateless. Tasks 5–8 add CI/CD, containerization, and documentation.

**Tech Stack:** FastAPI, asyncio, browser localStorage, Docker (python:3.11-slim + TeX Live), GitHub Actions, uvicorn multi-worker

---

## File Map

| File | Action | What changes |
|---|---|---|
| `backend/main.py` | Modify | Remove `OUTPUT_DIR` disk writes; add `asyncio`; wrap pdflatex with `to_thread`; delete `CV_FILE`, `SETTINGS_FILE`, `FileRequest`, `/api/file`, `/api/settings` |
| `frontend/file-sync.js` | Modify | Replace fetch with `localStorage`; rename key to `mkcv:default:resume.yaml`; restore tab guard; add migration from `mkcv_yaml`; show toast on quota error |
| `frontend/settings-sync.js` | Modify | Replace `_save()` with localStorage; make `_reorderAndSaveResume` sync; extend `_migrate()`; add type param to `_toast`; remove async from init |
| `tests/test_api.py` | Modify | Add no-disk-write tests; add `/api/file` + `/api/settings` 404 tests; remove 4 old `/api/file` tests; add pdflatex skip marks to 2 tests |
| `tests/conftest.py` | Modify | Add `pdflatex_available` skipif mark |
| `tests/test_settings_sync_tab_switch.js` | Modify | Pre-populate localStorage in `createContext`; simplify fetch mock |
| `tests/test_template_default_reset.js` | Modify | Pre-populate localStorage in `createContext`; simplify fetch mock |
| `Dockerfile` | Create | python:3.11-slim + TeX Live + non-root user + `${PORT:-8000}` / `${WEB_CONCURRENCY:-1}` |
| `.dockerignore` | Create | Exclude `.venv`, `__pycache__`, `.git`, `output/`, `tests/`, `docs/`, `mycv.yaml`, `settings.yaml`, `node_modules/` |
| `.github/workflows/docker-publish.yml` | Create | Run pytest then build+push to GHCR on every `main` push |
| `README.md` | Modify | Docker-first quick start; localStorage data model; backup/portability; Railway/Render deploy; native Python as secondary path |

---

## Task 1: Remove shared `output/` disk writes from export endpoints

Export endpoints write files to a shared `output/` directory even though the response body already contains the data. Under concurrent users these writes race each other.

**Files:**
- Modify: `backend/main.py`
- Modify: `tests/test_api.py`

- [ ] **Step 1: Write failing tests**

Add to the end of `tests/test_api.py`:

```python
async def test_export_markdown_no_disk_write(app, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/export/markdown", json={"yaml": VALID_YAML, "template": "classic"})
    assert resp.status_code == 200
    assert not (tmp_path / "output").exists()


async def test_export_latex_no_disk_write(app, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/export/latex", json={"yaml": VALID_YAML, "template": "classic"})
    assert resp.status_code == 200
    assert not (tmp_path / "output").exists()


async def test_export_pdf_no_disk_write(app, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/api/export/pdf", json={"yaml": VALID_YAML, "template": "classic"})
    # PDF generation may fail if pdflatex is absent — no output/ dir must exist regardless
    assert not (tmp_path / "output").exists()
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_api.py::test_export_markdown_no_disk_write tests/test_api.py::test_export_latex_no_disk_write tests/test_api.py::test_export_pdf_no_disk_write -v
```

Expected: all three FAIL — `output/` directory IS currently created.

- [ ] **Step 3: Remove `OUTPUT_DIR` and all disk writes from `backend/main.py`**

Delete line 27:
```python
OUTPUT_DIR = Path("output")
```

In `export_markdown`, replace:
```python
    content = MarkdownRenderer().render(cv, req.section_order)
    OUTPUT_DIR.mkdir(exist_ok=True)
    (OUTPUT_DIR / "cv.md").write_text(content)
    return Response(
```
With:
```python
    content = MarkdownRenderer().render(cv, req.section_order)
    return Response(
```

In `export_latex`, replace:
```python
    content = renderer.render(cv, req.section_order, req.section_titles)
    OUTPUT_DIR.mkdir(exist_ok=True)
    (OUTPUT_DIR / "cv.tex").write_text(content)
    return Response(
```
With:
```python
    content = renderer.render(cv, req.section_order, req.section_titles)
    return Response(
```

In `export_pdf`, replace:
```python
        pdf_bytes = (Path(tmpdir) / "cv.pdf").read_bytes()

    OUTPUT_DIR.mkdir(exist_ok=True)
    (OUTPUT_DIR / "cv.pdf").write_bytes(pdf_bytes)
    return Response(
```
With:
```python
        pdf_bytes = (Path(tmpdir) / "cv.pdf").read_bytes()

    return Response(
```

- [ ] **Step 4: Run all tests**

```bash
pytest -v
```

Expected: all pass including the three new no-disk-write tests.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py tests/test_api.py
git commit -m "fix: remove shared output/ disk writes from export endpoints"
```

---

## Task 2: Make pdflatex non-blocking

`subprocess.run` is synchronous and blocks the entire uvicorn event loop for up to 30 seconds per PDF request. `asyncio.to_thread` moves it to a thread pool.

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add `import asyncio` to `backend/main.py`**

After the existing stdlib imports at the top of `backend/main.py`, insert `import asyncio`:

```python
from __future__ import annotations

import asyncio
import subprocess
import tempfile
```

- [ ] **Step 2: Wrap `subprocess.run` in `export_pdf` with `asyncio.to_thread`**

In `export_pdf`, replace:
```python
        try:
            result = subprocess.run(
                ["pdflatex", "-interaction=nonstopmode", "cv.tex"],
                cwd=tmpdir,
                capture_output=True,
                timeout=30,
                text=True,
            )
        except subprocess.TimeoutExpired:
            return _error("pdf_generation_failed", "pdflatex timed out after 30 seconds")
        except FileNotFoundError:
            return _error("pdf_generation_failed", "pdflatex not found — install TeX Live or MiKTeX")
```
With:
```python
        try:
            result = await asyncio.to_thread(
                subprocess.run,
                ["pdflatex", "-interaction=nonstopmode", "cv.tex"],
                cwd=tmpdir,
                capture_output=True,
                timeout=30,
                text=True,
            )
        except subprocess.TimeoutExpired:
            return _error("pdf_generation_failed", "pdflatex timed out after 30 seconds")
        except FileNotFoundError:
            return _error("pdf_generation_failed", "pdflatex not found — install TeX Live or MiKTeX")
```

- [ ] **Step 3: Wrap `subprocess.run` in `preview_pdf` with `asyncio.to_thread`**

In `preview_pdf`, apply the identical replacement (same pattern as Step 2):

```python
        try:
            result = await asyncio.to_thread(
                subprocess.run,
                ["pdflatex", "-interaction=nonstopmode", "cv.tex"],
                cwd=tmpdir,
                capture_output=True,
                timeout=30,
                text=True,
            )
        except subprocess.TimeoutExpired:
            return _error("pdf_generation_failed", "pdflatex timed out after 30 seconds")
        except FileNotFoundError:
            return _error("pdf_generation_failed", "pdflatex not found — install TeX Live or MiKTeX")
```

- [ ] **Step 4: Wrap `_validate_template` calls in lifespan and endpoint**

In `lifespan`, replace:
```python
                _template_validation_cache[template_dir.name] = _validate_template(template_dir.name)
```
With:
```python
                _template_validation_cache[template_dir.name] = await asyncio.to_thread(_validate_template, template_dir.name)
```

In `validate_template` endpoint, replace:
```python
    result = _validate_template(name)
    _template_validation_cache[name] = result
    return result
```
With:
```python
    result = await asyncio.to_thread(_validate_template, name)
    _template_validation_cache[name] = result
    return result
```

- [ ] **Step 5: Run all tests**

```bash
pytest -v
```

Expected: all pass. Behavior is identical — only the threading model changes.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py
git commit -m "fix: run pdflatex in thread pool to avoid blocking the event loop"
```

---

## Task 3: Replace `/api/file` with browser localStorage

The `/api/file` endpoints read/write a single `mycv.yaml` file on the server, shared across all users. Moving persistence to `localStorage` gives each browser its own private storage.

**Files:**
- Modify: `backend/main.py`
- Modify: `frontend/file-sync.js`
- Modify: `frontend/settings-sync.js`
- Modify: `tests/test_api.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_api.py`:

```python
async def test_file_endpoint_removed(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/file")
    assert resp.status_code == 404


async def test_file_post_endpoint_removed(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/file", json={"content": "test"})
    assert resp.status_code in (404, 405)
```

- [ ] **Step 2: Run to confirm they fail**

```bash
pytest tests/test_api.py::test_file_endpoint_removed tests/test_api.py::test_file_post_endpoint_removed -v
```

Expected: both FAIL — `/api/file` currently returns 200.

- [ ] **Step 3: Remove `/api/file` from `backend/main.py`**

Delete line `CV_FILE = Path("mycv.yaml")`.

Delete the `FileRequest` model class:
```python
class FileRequest(BaseModel):
    content: str
```

> Note: `FileRequest` is also used by `/api/settings` — leave `FileRequest` in place if `/api/settings` still exists. Only delete `FileRequest` in Task 4 once both endpoints are gone.

Delete the `get_file` endpoint:
```python
@app.get("/api/file")
async def get_file():
    if not CV_FILE.exists():
        return {"content": ""}
    return {"content": CV_FILE.read_text()}
```

Delete the `save_file` endpoint:
```python
@app.post("/api/file")
async def save_file(req: FileRequest):
    try:
        CV_FILE.write_text(req.content)
        return {"ok": True}
    except OSError as e:
        return _error("file_write_failed", str(e), status=500)
```

- [ ] **Step 4: Delete the four old `/api/file` tests from `tests/test_api.py`**

Remove these four functions entirely:
- `test_get_file_missing_returns_empty`
- `test_get_file_existing_returns_content`
- `test_post_file_writes_content`
- `test_post_file_overwrites_existing`

- [ ] **Step 5: Add type parameter to `_toast` in `frontend/settings-sync.js`**

`_reorderAndSaveResume` (Step 6) will call `_toast` with a `'warn'` type. Update `_toast` now so the type param is available before first use.

Replace:
```javascript
  function _toast(msg) {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const el       = document.createElement('div');
    el.className   = 'toast info';
    el.innerHTML   = `<span class="toast-title">${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }
```
With:
```javascript
  function _toast(msg, type = 'info') {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const el       = document.createElement('div');
    el.className   = `toast ${type}`;
    el.innerHTML   = `<span class="toast-title">${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }
```

- [ ] **Step 6: Replace `frontend/file-sync.js` with localStorage implementation**

Overwrite the entire file:

```javascript
const fileSync = (() => {
  const RESUME_KEY = "mkcv:default:resume.yaml";
  const OLD_KEY    = "mkcv_yaml";

  function _migrate() {
    if (!localStorage.getItem(RESUME_KEY) && localStorage.getItem(OLD_KEY)) {
      try {
        localStorage.setItem(RESUME_KEY, localStorage.getItem(OLD_KEY));
        localStorage.removeItem(OLD_KEY);
      } catch {}
    }
  }

  function _showToast(msg) {
    const stack = document.getElementById("toast-stack");
    if (!stack) return;
    const el = document.createElement("div");
    el.className = "toast warn";
    el.innerHTML = `<span class="toast-title">${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  function loadFile() {
    const saved = localStorage.getItem(RESUME_KEY);
    if (saved && saved.trim()) {
      window.editorAdapter.setValue(saved);
      window.editorAdapter.clearHistory();
      app.setState({ yaml: saved });
    }
  }

  function saveFile(content) {
    if (window.settingsSync?.activeTab === "settings") return;
    try {
      localStorage.setItem(RESUME_KEY, content);
    } catch {
      _showToast("Resume not saved — browser storage is full or unavailable.");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    _migrate();
    loadFile();
    window.editorAdapter.onChange((val) => saveFile(val));
  });
})();
```

- [ ] **Step 7: Fix `_reorderAndSaveResume` in `frontend/settings-sync.js`**

The function currently calls `fetch('/api/file', ...)` when the settings tab is active and a section reorder needs to be saved. Replace the entire function with a synchronous localStorage version:

```javascript
  function _reorderAndSaveResume(sectionOrder) {
    const yaml = app.state.yaml;
    if (!yaml || !yaml.trim() || !window.sectionsState) return;
    const reordered = sectionsState.reorderMainArea(yaml, sectionOrder);
    if (reordered === yaml) return;
    app.setState({ yaml: reordered });
    if (_activeTab === 'resume') {
      window.editorAdapter.suppressNextPreviewRefresh();
      window.editorAdapter.setValuePreserveScroll(reordered);
      // file-sync's onChange handler saves automatically
    } else {
      try {
        localStorage.setItem('mkcv:default:resume.yaml', reordered);
      } catch {
        _toast('Resume not saved — browser storage is full or unavailable.', 'warn');
      }
    }
  }
```

Note: the function is now synchronous (no `async`). The existing callers (`_applyToSections`, `notifySectionStateChange`) do not await it, so this is safe.

- [ ] **Step 8: Run all tests**

```bash
pytest -v
```

Expected: all pass. The two new 404 tests pass; the four deleted tests are gone.

- [ ] **Step 9: Commit**

```bash
git add backend/main.py frontend/file-sync.js frontend/settings-sync.js tests/test_api.py
git commit -m "fix: replace /api/file server sync with browser localStorage"
```

---

## Task 4: Remove `/api/settings` and migrate `settings-sync.js` to localStorage

The `/api/settings` endpoints read/write `settings.yaml` on the server, shared across all users and lost on container restart.

**Files:**
- Modify: `backend/main.py`
- Modify: `frontend/settings-sync.js`
- Modify: `tests/test_api.py`
- Modify: `tests/test_settings_sync_tab_switch.js`
- Modify: `tests/test_template_default_reset.js`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_api.py`:

```python
async def test_settings_get_removed(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/settings")
    assert resp.status_code == 404


async def test_settings_post_removed(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/settings", json={"content": "layout:\n  density: balanced\n"})
    assert resp.status_code in (404, 405)


async def test_settings_no_disk_write(app, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/api/export/markdown", json={"yaml": VALID_YAML, "template": "classic"})
        await client.post("/api/export/latex", json={"yaml": VALID_YAML, "template": "classic"})
    assert not (tmp_path / "settings.yaml").exists()
```

- [ ] **Step 2: Run to confirm they fail**

```bash
pytest tests/test_api.py::test_settings_get_removed tests/test_api.py::test_settings_post_removed tests/test_api.py::test_settings_no_disk_write -v
```

Expected: `test_settings_get_removed` and `test_settings_post_removed` FAIL; `test_settings_no_disk_write` PASSES (settings.yaml was never written by those endpoints, but the test confirms it).

- [ ] **Step 3: Remove `/api/settings` from `backend/main.py`**

Delete line `SETTINGS_FILE = Path("settings.yaml")`.

Now that both `/api/file` and `/api/settings` are gone, delete the `FileRequest` model class (if it still exists from Task 3):

```python
class FileRequest(BaseModel):
    content: str
```

Delete the `get_settings` endpoint:

```python
@app.get("/api/settings")
async def get_settings():
    if not SETTINGS_FILE.exists():
        return {"content": ""}
    return {"content": SETTINGS_FILE.read_text()}
```

Delete the `save_settings` endpoint:

```python
@app.post("/api/settings")
async def save_settings(req: FileRequest):
    try:
        SETTINGS_FILE.write_text(req.content)
        return {"ok": True}
    except OSError as e:
        return _error("file_write_failed", str(e), status=500)
```

- [ ] **Step 4: Replace `_save` in `frontend/settings-sync.js` with localStorage version**

Replace:
```javascript
  async function _save(yaml) {
    try {
      await fetch('/api/settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content: yaml }),
      });
    } catch {}
  }
```
With:
```javascript
  function _save(yaml) {
    try {
      localStorage.setItem('mkcv:default:settings.yaml', yaml);
    } catch {
      _toast('Settings not saved — browser storage is full or unavailable.', 'warn');
    }
  }
```

- [ ] **Step 5: Extend `_migrate` in `frontend/settings-sync.js` to handle key rename**

Replace the entire `_migrate` function:
```javascript
  function _migrate() {
    const FLAG = 'mkcv_migrated_to_settings_yaml';

    // Always check for key rename from intermediate versions (safe to run every time)
    if (!localStorage.getItem('mkcv:default:settings.yaml') && localStorage.getItem('mkcv_settings_yaml')) {
      try {
        localStorage.setItem('mkcv:default:settings.yaml', localStorage.getItem('mkcv_settings_yaml'));
        localStorage.removeItem('mkcv_settings_yaml');
      } catch {}
    }

    if (localStorage.getItem(FLAG)) return null;
    let migrated = false;
    const next   = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

    const density = localStorage.getItem('mkcv_density');
    if (density && VALID_DENSITY.includes(density)) { next.layout.density = density; migrated = true; }

    const font = localStorage.getItem('mkcv_font_scale');
    if (font && VALID_FONT.includes(font)) { next.layout.font_scale = font; migrated = true; }

    try {
      const raw = localStorage.getItem('mkcv_sections_state');
      if (raw) {
        const ss        = JSON.parse(raw);
        const order     = Array.isArray(ss?.order)  ? ss.order  : null;
        const hiddenArr = Array.isArray(ss?.hidden) ? ss.hidden : [];
        if (order) {
          next.sections = order
            .filter(k => KNOWN_KEYS.has(k))
            .map(k => ({
              key:     k,
              title:   SECTION_CATALOG.find(s => s.key === k)?.defaultTitle ?? k.toUpperCase(),
              visible: !hiddenArr.includes(k),
            }));
          migrated = true;
        }
      }
    } catch {}

    localStorage.setItem(FLAG, '1');
    ['mkcv_density', 'mkcv_font_scale', 'mkcv_sections_state'].forEach(k => localStorage.removeItem(k));
    return migrated ? next : null;
  }
```

- [ ] **Step 6: Replace the `DOMContentLoaded` init in `frontend/settings-sync.js`**

Replace the entire `document.addEventListener('DOMContentLoaded', async () => { ... })` block with:

```javascript
  document.addEventListener('DOMContentLoaded', () => {
    // Wire tab buttons
    document.getElementById('file-tab-resume')  ?.addEventListener('click', switchToResume);
    document.getElementById('file-tab-settings')?.addEventListener('click', switchToSettings);

    // Migration (before loading from localStorage)
    const migrated = _migrate();

    // Load settings from localStorage
    const stored = localStorage.getItem('mkcv:default:settings.yaml');
    if (stored && stored.trim()) {
      _settingsYaml = stored;
      _parsed       = parseSettings(stored);
    } else if (migrated) {
      _settingsYaml = settingsToYaml(migrated);
      _parsed       = parseSettings(_settingsYaml);
      _toast('Migrated layout & section settings to settings.yaml');
      _save(_settingsYaml);
    }

    // Apply to toolbar and section chips
    if (_parsed.value) {
      _applyAll(_parsed.value);
      if (app.state.yaml?.trim()) _refreshPreview();
    }

    // Monkey-patch sections-state to keep settings.yaml in sync
    if (window.sectionsState) {
      const orig = {
        setOrder:     sectionsState.setOrder.bind(sectionsState),
        toggleHidden: sectionsState.toggleHidden.bind(sectionsState),
        resetAll:     sectionsState.resetAll.bind(sectionsState),
      };
      sectionsState.setOrder     = (o)    => { orig.setOrder(o);     notifySectionStateChange(); };
      sectionsState.toggleHidden = (k)    => { orig.toggleHidden(k); notifySectionStateChange(); };
      sectionsState.resetAll     = (...a) => { orig.resetAll(...a);   notifySectionStateChange(); };
    }

    // Listen to editor changes when settings tab is active
    window.editorAdapter.onChange((val) => {
      if (_activeTab !== 'settings' || _suppress) return;
      _onYamlChange(val, { fromEditor: true });
    });
  });
```

- [ ] **Step 7: Update `tests/test_settings_sync_tab_switch.js`**

In `createContext`, after `const localStorageData = new Map();` (line 61), add pre-population:

```javascript
  const localStorageData = new Map();
  if (options.initialSettingsYaml) {
    localStorageData.set('mkcv:default:settings.yaml', options.initialSettingsYaml);
  }
```

Replace the `fetch` mock (the block that checks for `'/api/settings'`) with a simple stub that never returns settings content:

```javascript
    fetch: async () => ({ ok: false }),
```

- [ ] **Step 8: Update `tests/test_template_default_reset.js`**

In `createContext`, after `const localStorageData = new Map();` (line 39), add pre-population:

```javascript
  const localStorageData = new Map();
  if (options.initialSettingsYaml) {
    localStorageData.set('mkcv:default:settings.yaml', options.initialSettingsYaml);
  }
```

Replace the `fetch` mock block (lines 92–97) with:

```javascript
    fetch: async () => ({ ok: false }),
```

- [ ] **Step 9: Run all tests**

```bash
pytest -v
node --test tests/test_settings_sync_tab_switch.js
node --test tests/test_template_default_reset.js
```

Expected: all pass. The three new `/api/settings` tests pass; `settings-sync.js` JS tests pass with localStorage-based init.

- [ ] **Step 10: Commit**

```bash
git add backend/main.py frontend/settings-sync.js tests/test_api.py \
        tests/test_settings_sync_tab_switch.js tests/test_template_default_reset.js
git commit -m "fix: replace /api/settings server sync with browser localStorage"
```

---

## Task 5: Add pdflatex skip guards in pytest

Two tests assert `resp.status_code == 200` for PDF responses and fail in CI environments without pdflatex installed.

**Files:**
- Modify: `tests/conftest.py`
- Modify: `tests/test_api.py`

- [ ] **Step 1: Add `pdflatex_available` mark to `tests/conftest.py`**

Add at the top of `tests/conftest.py`, after the existing imports:

```python
import shutil

pdflatex_available = pytest.mark.skipif(
    shutil.which("pdflatex") is None,
    reason="pdflatex not installed",
)
```

- [ ] **Step 2: Import the mark in `tests/test_api.py` and apply it**

Add at the top of `tests/test_api.py`:

```python
from tests.conftest import pdflatex_available
```

Apply the mark to the two tests that assert PDF response status 200:

```python
@pdflatex_available
async def test_preview_pdf_accepts_personal_fields(app):
    ...

@pdflatex_available
async def test_preview_pdf_personal_fields_defaults_to_empty(app):
    ...
```

- [ ] **Step 3: Run pytest**

```bash
pytest -v
```

Expected: if pdflatex is installed, both tests run and pass. If not, both are skipped with `SKIPPED [pdflatex not installed]`. All other tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/conftest.py tests/test_api.py
git commit -m "test: skip PDF tests when pdflatex is not installed"
```

---

## Task 6: Create Dockerfile and `.dockerignore`

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-latex-recommended \
    texlive-fonts-recommended \
    texlive-latex-extra \
    texlive-fonts-extra \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --no-create-home --shell /bin/false appuser
USER appuser

EXPOSE 8000

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-1}"]
```

`${PORT:-8000}` and `${WEB_CONCURRENCY:-1}` let Railway/Render inject values without any extra config. Default workers is 1 (safe baseline for shared hosting); set `WEB_CONCURRENCY=4` on 2-CPU instances.

- [ ] **Step 2: Create `.dockerignore`**

```
.venv/
__pycache__/
**/__pycache__/
*.pyc
*.pyo
.DS_Store
output/
.pytest_cache/
.git/
.worktrees/
tests/
docs/
mycv.yaml
settings.yaml
node_modules/
```

Excluding `mycv.yaml` and `settings.yaml` prevents a developer's personal data from being baked into the image.

- [ ] **Step 3: Build the image to verify**

```bash
docker build -t mkcv:latest .
```

Expected: build completes. The `apt-get install` step takes 2–5 minutes on first build (TeX Live is ~500 MB).

- [ ] **Step 4: Smoke-test the container**

```bash
docker run --rm -p 8000:8000 mkcv:latest
```

Open `http://localhost:8000`. Verify: editor loads, template dropdown shows templates, typing YAML and clicking Preview shows markdown output. Press Ctrl+C to stop.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "build: add Dockerfile with TeX Live for multi-user deployment"
```

---

## Task 7: Create GitHub Actions CI/CD workflow

Publishes a fresh Docker image to GHCR on every push to `main`. Pytest runs first; a failing test blocks the publish.

**Files:**
- Create: `.github/workflows/docker-publish.yml`

- [ ] **Step 1: Create `.github/workflows/docker-publish.yml`**

```bash
mkdir -p .github/workflows
```

Create `.github/workflows/docker-publish.yml`:

```yaml
name: Publish Docker image

on:
  push:
    branches: [main]

jobs:
  test-and-publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: pip install -r requirements.txt

      - name: Run tests
        run: pytest -v

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=raw,value=latest

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/docker-publish.yml
git commit -m "ci: publish Docker image to GHCR on every main push"
```

- [ ] **Step 3: After the first push triggers the workflow, make the package public**

Navigate to: `https://github.com/hyun9junn/mkcv/pkgs/container/mkcv` → **Package settings** → **Change visibility** → **Public**

Without this step, `docker pull ghcr.io/hyun9junn/mkcv:latest` will fail for unauthenticated users.

---

## Task 8: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the Quick Start section**

Replace the existing `## Quick Start` section (the block starting at "**Requirements:** Python 3.11+..." through the `uvicorn backend.main:app --reload` line) with:

```markdown
## Quick Start

The recommended way to run mkcv is with Docker — no dependencies to install.

```bash
docker pull ghcr.io/hyun9junn/mkcv:latest
docker run --rm -p 8000:8000 ghcr.io/hyun9junn/mkcv:latest
```

Open **http://localhost:8000** in your browser.

> **Note:** the GHCR package must be public for unauthenticated pulls. If you get a `pull access denied` error, the image may still be private — check the repo's Packages settings.
```

- [ ] **Step 2: Add "Your Data" section after Quick Start**

Insert after the Quick Start section:

```markdown
## Your Data

mkcv stores everything in your browser's localStorage — the server is stateless and writes nothing at runtime.

| Key | Content |
|---|---|
| `mkcv:default:resume.yaml` | Your CV content |
| `mkcv:default:settings.yaml` | Layout, section order, template preferences |

Data persists across sessions on the same machine and browser. It is private to your browser.

**Backup & portability:** use the Export buttons in the toolbar to download your CV and settings as files. To restore on another machine, paste the file contents into the editor (switch tabs to load settings). There is no cloud sync — if you clear your browser's site data, your resume is lost unless you exported it first.
```

- [ ] **Step 3: Add "Cloud Deployment" section**

Insert after "Your Data":

```markdown
## Cloud Deployment

mkcv is a stateless container — deploy it anywhere Docker is supported. No platform config files are needed; both platforms auto-detect the `Dockerfile`.

### Railway

1. Fork this repo and connect it to a new Railway project via **Deploy from GitHub repo**
2. Railway sets `PORT` automatically
3. Optionally set `WEB_CONCURRENCY=4` in Railway environment variables for higher PDF throughput

### Render

1. Create a new **Web Service** in Render → connect your GitHub repo
2. Set environment to **Docker**
3. Render sets `PORT` automatically — no additional config needed
```

- [ ] **Step 4: Add "Dev / Contributor Setup" section**

Insert after "Cloud Deployment":

```markdown
## Dev / Contributor Setup

For local development without Docker:

**Requirements:** Python 3.11+, and `pdflatex` on your `PATH` (see [Installing LaTeX](#installing-latex) below).

```bash
git clone https://github.com/hyun9junn/mkcv.git
cd mkcv
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

> pdflatex is required for PDF preview and export. The Docker image ships with TeX Live pre-installed — use Docker if you want to skip the LaTeX setup.
```

- [ ] **Step 5: Run all tests to confirm nothing broke**

```bash
pytest -v
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: Docker-first quick start, localStorage data model, cloud deploy guide"
```
