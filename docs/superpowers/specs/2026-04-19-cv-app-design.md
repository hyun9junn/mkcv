# mkcv — CV Management App Design

**Date:** 2026-04-19  
**Status:** Approved

## Overview

A web app for authoring and exporting a CV from a single YAML source of truth. Supports three output formats: Markdown (`.md`), LaTeX (`.tex`), and PDF. Designed with two explicit extensibility seams: pluggable output templates and a swappable editor interface.

---

## Architecture

Three clean layers. Nothing crosses a layer boundary except through the defined contract.

```
mkcv/
├── backend/
│   ├── main.py               # FastAPI app, routes
│   ├── models.py             # CVData Pydantic model (the contract)
│   ├── parsers/
│   │   └── yaml_parser.py    # YAML string → CVData
│   ├── renderers/
│   │   ├── base.py           # BaseRenderer ABC: render(cv: CVData) -> str
│   │   ├── markdown.py       # CVData → Markdown
│   │   └── latex.py          # CVData → LaTeX via Jinja2
│   └── templates/
│       ├── classic/
│       │   └── cv.tex.j2     # Default Classic LaTeX template
│       └── <custom>/         # Drop folder here to add a new style
├── frontend/
│   ├── index.html            # Shell: toolbar, editor pane, preview pane
│   ├── app.js                # App state: current yaml, selected template
│   ├── editor-adapter.js     # EditorAdapter interface + CodeMirror impl
│   ├── preview.js            # Calls /api/preview, renders Markdown → HTML
│   ├── export.js             # Calls /api/export/*, triggers file download
│   ├── validator.js          # Debounced /api/validate, shows inline errors
│   └── templates.js          # Fetches /api/templates, populates dropdown
├── tests/
├── cv.yaml                   # CV content — source of truth
└── output/                   # Generated artifacts only (.md, .tex, .pdf) — gitignored except .gitkeep
```

---

## Data Model

Defined with **Pydantic** for built-in validation and optional fields.

```python
class CVData(BaseModel):
    personal: PersonalInfo          # required
    summary: str | None = None
    experience: list[ExperienceItem] = []
    education: list[EducationItem] = []
    skills: list[SkillGroup] = []
    projects: list[ProjectItem] = []
    certifications: list[CertificationItem] = []
    publications: list[PublicationItem] = []
    languages: list[LanguageItem] = []
```

**Optional sections:** Every renderer checks whether a section is empty before rendering it. Empty lists and `None` fields produce no output — no empty headers in any format.

**Template selection:** Stored in `app.state.template` on the frontend and sent with every API call. Preview and export always use the same template — no inconsistency possible.

---

## API

All endpoints that accept YAML validate internally regardless of whether `/api/validate` was called first.

| Endpoint | Body | Response |
|---|---|---|
| `POST /api/validate` | `{yaml, template}` | `{valid, errors}` |
| `POST /api/preview` | `{yaml, template}` | `{markdown}` |
| `POST /api/export/markdown` | `{yaml, template}` | `.md` file |
| `POST /api/export/latex` | `{yaml, template}` | `.tex` file |
| `POST /api/export/pdf` | `{yaml, template}` | `.pdf` file |
| `GET /api/templates` | — | `{templates: string[]}` |

### Internal pipeline (all preview/export endpoints)

1. Parse YAML → error if malformed
2. Validate against `CVData` → error if invalid fields
3. Resolve template name → error if not found in `templates/` *(LaTeX/PDF only — Markdown renderer ignores the template parameter)*
4. Render → return result

### Unified error response

```json
{
  "error": "invalid_yaml" | "unknown_template" | "pdf_generation_failed" | "validation_error",
  "message": "Human-readable description",
  "details": ["field errors or pdflatex stderr lines"]
}
```

### PDF generation

```python
with tempfile.TemporaryDirectory() as tmpdir:
    result = subprocess.run(
        ["pdflatex", "-interaction=nonstopmode", "cv.tex"],
        cwd=tmpdir,
        capture_output=True,
        timeout=30,
        text=True
    )
    if result.returncode != 0:
        raise PDFGenerationError(details=result.stderr.splitlines())
```

Temp directory always cleaned up. Timeout of 30 seconds. Stderr captured and returned in structured error on failure. `output/` is written only on explicit export — preview is in-memory only.

---

## Frontend

Vanilla HTML/JS — no framework.

**Split view:**
- Left pane: CodeMirror YAML editor with syntax highlighting
- Right pane: live Markdown preview, auto-refreshed on change (debounced 500ms)
- Toolbar: template dropdown + export buttons (Markdown, LaTeX, PDF)

**State flow:**
```
EditorAdapter.onChange()
  → validator.js (debounced, shows inline error banners)
  → preview.js (debounced, updates right pane)
```

**EditorAdapter interface** (`editor-adapter.js`):
- `getValue() → string`
- `onChange(callback)`

Today: `CodeMirrorAdapter` implements this. Later: `FormAdapter` implements the same interface and is swapped in `app.js` — no other files change.

**Adding a custom template:** Drop a folder under `backend/templates/<name>/` containing `cv.tex.j2`. It appears automatically in the template dropdown via `GET /api/templates`.

---

## Template System

- Each template lives in `backend/templates/<name>/cv.tex.j2`
- `LaTeXRenderer` accepts a `template` parameter, loads the corresponding Jinja2 file
- Default template: `classic`
- No code changes required to add a new template — drop a folder, done

---

## Testing

- **Unit tests** (`pytest`): `yaml_parser`, `CVData` validation, each renderer with fixture YAML. Assert empty sections produce no output.
- **Renderer output tests**: fixture `CVData` → `MarkdownRenderer` / `LaTeXRenderer` → targeted string assertions (job title present, empty section headers absent). Catches template regressions without brittle full snapshots.
- **Integration tests**: FastAPI endpoints via `httpx` — valid YAML, invalid YAML, unknown template, PDF failure (mock `pdflatex`).

---

## Extensibility Seams (explicit)

| Future change | What to do |
|---|---|
| Add a new output format | Add `renderers/<format>.py` implementing `BaseRenderer` + one new route |
| Add a new LaTeX template | Drop `templates/<name>/cv.tex.j2` — no code changes |
| Swap YAML editor for form editor | Create `form-adapter.js`, swap one line in `app.js` |

---

## Dependencies

- **Backend:** `fastapi`, `uvicorn`, `pydantic`, `pyyaml`, `jinja2`
- **Frontend:** CodeMirror (YAML mode), `marked.js` (Markdown → HTML)
- **System:** `pdflatex` (TeX Live or MiKTeX)
- **Tests:** `pytest`, `httpx`
