# mkcv Improvements — Design Spec
**Date:** 2026-04-20

## Overview

Five improvements to the mkcv CV editor app. Approach: PDF-first preview replaces Markdown preview; all other features additive to the existing modular architecture.

---

## 1. Template Validation

**Endpoint:** `POST /api/templates/{name}/validate`

Two-stage validation run sequentially:

1. **Jinja2 render** — render `cv.tex.j2` with a minimal sample `CVData`. Catches `UndefinedError`, `TemplateSyntaxError`, broken placeholders.
2. **pdflatex compile** — run `pdflatex -interaction=nonstopmode` on the rendered output in a temp dir. Check exit code; parse stdout for error lines. If pdflatex is not installed, report that explicitly.

**Response:**
```json
{ "valid": false, "errors": ["line 42: Undefined control sequence \\fooo", ...] }
```

**UX:**
- On server startup, all templates are validated and results are cached in memory.
- In the template `<select>` dropdown, invalid templates are prefixed with `⚠`.
- A "Validate Template" button in the toolbar triggers validation for the currently selected template and shows results in the error banner.

---

## 2. PDF Preview (replaces Markdown preview)

**Endpoint:** `POST /api/preview/pdf` — same logic as `/api/export/pdf` but returns the PDF inline (no `Content-Disposition: attachment` header).

**Frontend (`preview.js` — rewritten):**
- `#preview-pane` `<div>` replaced by `<iframe id="preview-frame">` in `index.html`.
- On YAML or template change: 1500ms debounce → POST to `/api/preview/pdf` → create `Blob` URL from PDF bytes → set as `iframe.src`. Revoke the previous blob URL to avoid memory leaks.
- While generating: show a "Generating preview…" overlay on top of the iframe.
- On YAML parse error: do not call the PDF endpoint; preserve the last successful preview.
- On LaTeX compile error: replace iframe with an error panel showing filtered pdflatex output lines.
- On pdflatex not installed: show a clear banner — "PDF preview unavailable: pdflatex not found."

---

## 3. New CV Sections — Awards & Extracurricular

**New Pydantic models** (`backend/models.py`):

```python
class AwardItem(BaseModel):
    name: str
    issuer: Optional[str] = None
    date: Optional[str] = None
    description: Optional[str] = None

class ExtracurricularItem(BaseModel):
    title: str
    organization: Optional[str] = None
    date: Optional[str] = None
    highlights: list[str] = []
```

**`PersonalInfo` additions** (fields already used by awesomecv template):
- `huggingface: Optional[str] = None`
- `tagline: Optional[str] = None`
- `address: Optional[str] = None`

**`CVData` additions:**
```python
awards: list[AwardItem] = []
extracurricular: list[ExtracurricularItem] = []
```

**Renderers:**
- `MarkdownRenderer` — add `## Awards` and `## Extracurricular Activities` sections.
- `classic/cv.tex.j2` — add `\section{Awards}` and `\section{Extracurricular Activities}` blocks matching the awesomecv style.
- `awesomecv/cv.tex.j2` — already has both sections; no change needed.

---

## 4. Dynamic Section Toggle Panel

**UI:** A collapsible bar between the toolbar and the editor pane (not between editor and preview). Toggled by a "Sections ▾" button in the toolbar. Collapsed by default.

**Sections available:** `summary`, `experience`, `education`, `skills`, `projects`, `certifications`, `publications`, `languages`, `awards`, `extracurricular`

**Frontend (`frontend/sections.js` — new module):**
- On each editor change: parse YAML top-level keys (js-yaml) to derive which sections are present → update checkbox states.
- **Enable section:** append a minimal YAML snippet for that section to the end of the editor content.
- **Disable section:** parse YAML → delete key from parsed object → re-serialize with js-yaml → set editor value. Comments are lost; structure is preserved.
- If YAML is currently invalid: all checkboxes shown as `indeterminate`; clicks are no-ops.

**Minimal YAML snippets per section:**
```yaml
summary: >
  Write a brief professional summary here.

experience:
  - title: Job Title
    company: Company Name
    start_date: "2024"
    highlights:
      - Key achievement

# ... etc. for each section
```

**`index.html` changes:**
- Add collapsible `#sections-panel` between `#toolbar` and `#main`.
- Add `sections.js` script tag.
- Add `js-yaml` CDN script tag (required by sections.js for YAML parse/serialize).

---

## 5. File Sync — Editor ↔ `mycv.yaml`

**Endpoints:**
- `GET /api/file` — reads `mycv.yaml` from the working directory, returns `{"content": "...yaml string..."}`.
- `POST /api/file` — writes `{"content": "..."}` to `mycv.yaml`, returns `{"ok": true}` or error JSON.

**Frontend (`frontend/file-sync.js` — new module):**
- **On load** (`DOMContentLoaded`): `GET /api/file` → call `window.editorAdapter.setValue(content)` to override the `INITIAL_YAML` set by `editor-adapter.js`. If file doesn't exist or request fails, fall back silently (editor keeps `INITIAL_YAML`). `file-sync.js` must load after `editor-adapter.js` in `index.html` to guarantee `window.editorAdapter` exists.
- **On editor change:** 1000ms debounce (independent timer from the 1500ms preview debounce) → `POST /api/file`.
- Write errors displayed in `#error-banner` with prefix `[File save failed]`.
- `CodeMirrorAdapter` in `editor-adapter.js` gains a `setValue(str)` method to allow programmatic content replacement.

**File path:** hardcoded to `mycv.yaml` in the working directory (the directory from which `uvicorn` is started). No configuration needed for now.

---

## Component Interaction Diagram

```
editor change
    │
    ├─(1000ms debounce)──► POST /api/file ──► mycv.yaml
    │
    └─(1500ms debounce)──► POST /api/preview/pdf
                               │
                               ▼
                          pdflatex ──► blob URL ──► <iframe>

template change
    │
    └──────────────────────► POST /api/preview/pdf (immediate debounce reset)
```

---

## Out of Scope

- Configurable file path (always `mycv.yaml`)
- WebSocket/SSE streaming (debounce is sufficient)
- Markdown live preview (replaced by PDF)
- Template hot-reload without server restart
