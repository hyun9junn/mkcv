# Multi-User Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mkcv safe and correct when served to many simultaneous users, then containerize it for cloud deployment.

**Architecture:** Three code fixes remove shared mutable state: (1) export endpoints stop writing to a shared `output/` directory, (2) pdflatex subprocess calls become non-blocking via `asyncio.to_thread`, (3) the per-user YAML file sync moves from the server filesystem to browser `localStorage`. A Docker image bundles Python + TeX Live for reproducible deployment.

**Tech Stack:** FastAPI, asyncio, browser localStorage, Docker (python:3.11-slim + texlive Debian packages), uvicorn multi-worker

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `backend/main.py` | Modify | Remove `OUTPUT_DIR`, `CV_FILE`, `FileRequest`; add `asyncio`; wrap pdflatex with `to_thread`; delete `/api/file` routes |
| `frontend/file-sync.js` | Modify | Replace fetch calls with `localStorage.getItem/setItem` |
| `tests/test_api.py` | Modify | Remove 4 `/api/file` tests; add no-disk-write regression; add `/api/file` 404 check |
| `Dockerfile` | Create | python:3.11-slim + texlive + uvicorn --workers 4 |
| `.dockerignore` | Create | Exclude `.venv`, `__pycache__`, `.git`, `output/`, `tests/` |

---

## Task 1: Remove shared `output/` directory writes

Export endpoints currently write files to a shared `output/` directory on disk even though the response body already contains the data. Under concurrent users, these writes race each other.

**Files:**
- Modify: `backend/main.py`
- Modify: `tests/test_api.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_api.py`:

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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_api.py::test_export_markdown_no_disk_write tests/test_api.py::test_export_latex_no_disk_write -v
```

Expected: both FAIL — `output/` directory currently IS created.

- [ ] **Step 3: Remove OUTPUT_DIR constant and all disk writes**

In `backend/main.py`, delete line 28:
```python
OUTPUT_DIR = Path("output")
```

In `export_markdown`, replace:
```python
    content = MarkdownRenderer().render(cv, req.section_order)
    OUTPUT_DIR.mkdir(exist_ok=True)
    (OUTPUT_DIR / "cv.md").write_text(content)
    return Response(
        content=content,
        media_type="text/markdown",
        headers={"Content-Disposition": "attachment; filename=cv.md"},
    )
```
With:
```python
    content = MarkdownRenderer().render(cv, req.section_order)
    return Response(
        content=content,
        media_type="text/markdown",
        headers={"Content-Disposition": "attachment; filename=cv.md"},
    )
```

In `export_latex`, replace:
```python
    content = renderer.render(cv, req.section_order)
    OUTPUT_DIR.mkdir(exist_ok=True)
    (OUTPUT_DIR / "cv.tex").write_text(content)
    return Response(
        content=content,
        media_type="application/x-latex",
        headers={"Content-Disposition": "attachment; filename=cv.tex"},
    )
```
With:
```python
    content = renderer.render(cv, req.section_order)
    return Response(
        content=content,
        media_type="application/x-latex",
        headers={"Content-Disposition": "attachment; filename=cv.tex"},
    )
```

In `export_pdf`, replace:
```python
        pdf_bytes = (Path(tmpdir) / "cv.pdf").read_bytes()

    OUTPUT_DIR.mkdir(exist_ok=True)
    (OUTPUT_DIR / "cv.pdf").write_bytes(pdf_bytes)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=cv.pdf"},
    )
```
With:
```python
        pdf_bytes = (Path(tmpdir) / "cv.pdf").read_bytes()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=cv.pdf"},
    )
```

- [ ] **Step 4: Run all tests**

```bash
pytest -v
```

Expected: all pass including the two new no-disk-write tests.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py tests/test_api.py
git commit -m "fix: remove shared output/ disk writes from export endpoints"
```

---

## Task 2: Make pdflatex non-blocking

`subprocess.run` is synchronous and blocks the entire uvicorn event loop for up to 30 seconds per PDF request. All other requests stall during that time. Wrapping the call with `asyncio.to_thread` moves it to a thread pool, freeing the event loop.

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add asyncio import**

In `backend/main.py`, the existing imports block starts at line 1. Add `import asyncio` after the stdlib imports:

```python
from __future__ import annotations

import asyncio
import subprocess
import tempfile
```

- [ ] **Step 2: Wrap subprocess.run in export_pdf**

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

- [ ] **Step 3: Wrap subprocess.run in preview_pdf**

In `preview_pdf`, replace the same `subprocess.run` block with the same `asyncio.to_thread` wrapping (identical to Step 2):

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

- [ ] **Step 4: Wrap _validate_template call in lifespan and validate_template endpoint**

In `lifespan`, replace:
```python
                _template_validation_cache[template_dir.name] = _validate_template(template_dir.name)
```
With:
```python
                _template_validation_cache[template_dir.name] = await asyncio.to_thread(_validate_template, template_dir.name)
```

In the `validate_template` endpoint, replace:
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

## Task 3: Replace /api/file with browser localStorage

The `/api/file` endpoints read and write a single `mycv.yaml` file on the server. All users share this one file. Moving persistence to `localStorage` gives each user their own private storage in their own browser, with no server involvement.

**Files:**
- Modify: `backend/main.py`
- Modify: `frontend/file-sync.js`
- Modify: `tests/test_api.py`

- [ ] **Step 1: Write a failing test verifying /api/file returns 404**

Add to `tests/test_api.py`:

```python
async def test_file_endpoint_removed(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/file")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pytest tests/test_api.py::test_file_endpoint_removed -v
```

Expected: FAIL — `/api/file` currently returns 200.

- [ ] **Step 3: Remove /api/file from backend/main.py**

Delete `CV_FILE = Path("mycv.yaml")` (line 29 or so).

Delete the `FileRequest` model:
```python
class FileRequest(BaseModel):
    content: str
```

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

- [ ] **Step 4: Replace frontend/file-sync.js with localStorage implementation**

Overwrite the entire file with:

```javascript
const fileSync = (() => {
  const STORAGE_KEY = "mkcv_yaml";

  function loadFile() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) {
      window.editorAdapter.setValue(saved);
      window.editorAdapter.clearHistory();
      app.setState({ yaml: saved });
    }
  }

  function saveFile(content) {
    localStorage.setItem(STORAGE_KEY, content);
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadFile();
    window.editorAdapter.onChange((val) => saveFile(val));
  });
})();
```

Key differences from the old version:
- No async, no fetch — localStorage is synchronous and instant
- No debounce needed — localStorage writes are O(1) with no I/O cost
- No error banner for save failures — localStorage only fails on quota exceeded (rare for YAML)

- [ ] **Step 5: Remove the four old /api/file tests from tests/test_api.py**

Delete these four test functions entirely:
- `test_get_file_missing_returns_empty`
- `test_get_file_existing_returns_content`
- `test_post_file_writes_content`
- `test_post_file_overwrites_existing`

- [ ] **Step 6: Run all tests**

```bash
pytest -v
```

Expected: all pass. The new `test_file_endpoint_removed` should now PASS, the four deleted tests are gone, all other tests unchanged.

- [ ] **Step 7: Commit**

```bash
git add backend/main.py frontend/file-sync.js tests/test_api.py
git commit -m "fix: replace /api/file server sync with browser localStorage"
```

---

## Task 4: Add Dockerfile and .dockerignore

The app needs `pdflatex` at runtime. The Docker image bundles Python 3.11 and the necessary TeX Live packages so the app runs identically anywhere Docker runs.

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Create Dockerfile**

Create `/Users/khjmove/mkcv/Dockerfile`:

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

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

Why these packages:
- `texlive-latex-recommended` — base LaTeX engine and core packages
- `texlive-fonts-recommended` — standard fonts used by the templates
- `texlive-latex-extra` — `enumitem`, `geometry`, `hyperref`, `xcolor` (used by templates)
- `texlive-fonts-extra` — `fontawesome5` (used by templates)

`--workers 4` gives 4 separate processes, each able to run one pdflatex at a time. Adjust to 2× CPU cores on your actual server.

- [ ] **Step 2: Create .dockerignore**

Create `/Users/khjmove/mkcv/.dockerignore`:

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
tests/
docs/
mycv.yaml
```

Excluding `mycv.yaml` prevents a developer's personal CV from being baked into the image.

- [ ] **Step 3: Build the image**

```bash
docker build -t mkcv:latest .
```

Expected: build completes without errors. The `apt-get install` step installs ~500 MB of TeX Live packages — this is normal and takes 2–5 minutes on first build.

- [ ] **Step 4: Run the container and verify it starts**

```bash
docker run --rm -p 8000:8000 mkcv:latest
```

Expected output contains:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

Open `http://localhost:8000` in a browser. Verify:
- Editor loads (empty, since `mycv.yaml` is excluded from image)
- Typing YAML and clicking Preview shows markdown output
- Template dropdown shows templates

Press Ctrl+C to stop.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "build: add Dockerfile with TeX Live for multi-user deployment"
```

---

## Deployment After This Plan

Once all four tasks are done, push the image to any registry and deploy:

**Railway / Render / Fly.io (simplest):**
```bash
# Railway example
railway up
```
Point to the `Dockerfile` — these platforms auto-detect and build it.

**Self-hosted (VPS):**
```bash
docker build -t mkcv:latest .
docker run -d --restart unless-stopped -p 80:8000 mkcv:latest
```

**Scale pdflatex workers:** if you expect >10 simultaneous PDF exports, each worker handles one pdflatex at a time. Set `--workers` to match: 2 workers on a 1-CPU instance, 4–8 on a 2–4 CPU instance.
