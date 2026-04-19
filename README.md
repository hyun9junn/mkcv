# mkcv

A web app for authoring and exporting your CV from a single YAML source of truth.

Write your CV once in `cv.yaml` — export to GitHub-ready Markdown, polished LaTeX, or PDF with one click.

![Split-view editor with live Markdown preview](docs/screenshot-placeholder.png)

## Features

- **Split-view editor** — YAML on the left, live Markdown preview on the right
- **Three export formats** — Markdown (`.md`), LaTeX (`.tex`), PDF
- **Pluggable templates** — drop a folder to add a new LaTeX style, no code changes needed
- **Inline validation** — YAML errors shown as you type
- **All sections optional** — empty sections are automatically skipped in all outputs

## Supported CV Sections

| Section | Key |
|---------|-----|
| Personal info | `personal` |
| Summary | `summary` |
| Work experience | `experience` |
| Education | `education` |
| Skills | `skills` |
| Projects | `projects` |
| Certifications | `certifications` |
| Publications | `publications` |
| Languages | `languages` |

## Getting Started

**Requirements:** Python 3.11+, and `pdflatex` for PDF export (install [TeX Live](https://tug.org/texlive/) or [MiKTeX](https://miktex.org/)).

```bash
git clone https://github.com/hyun9junn/mkcv.git
cd mkcv
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

Open **http://localhost:8000** in your browser.

## CV Format

Edit `cv.yaml` directly in the browser editor, or replace it with your own content. All sections except `personal` are optional.

```yaml
personal:
  name: Your Name
  email: you@example.com
  phone: "+1-000-000-0000"
  location: City, Country
  linkedin: linkedin.com/in/yourhandle
  github: github.com/yourusername

summary: >
  A short professional summary.

experience:
  - title: Software Engineer
    company: Acme Corp
    start_date: "2021"
    end_date: null          # null = Present
    highlights:
      - Built X, reducing latency by 40%

education:
  - degree: B.S. Computer Science
    institution: University Name
    year: "2020"
    gpa: "3.9"             # optional

skills:
  - category: Languages
    items: [Python, Go, TypeScript]

projects:
  - name: my-project
    description: What it does
    url: github.com/you/my-project
    highlights:
      - 500+ GitHub stars

certifications:
  - name: AWS Solutions Architect
    issuer: Amazon Web Services
    date: "2023"

publications:
  - title: "My Paper Title"
    venue: Conference / Blog
    date: "2023"
    url: link.to/paper

languages:
  - language: English
    proficiency: Native
```

## Adding a Custom LaTeX Template

1. Create a folder under `backend/templates/<your-name>/`
2. Add a `cv.tex.j2` file using the same Jinja2 delimiters as the classic template:
   - Variables: `<< variable >>`
   - Blocks: `<% if condition %>` / `<% endif %>`
   - The CV data is available as `cv` (a `CVData` object)
3. Restart the server — your template appears in the dropdown automatically

See `backend/templates/classic/cv.tex.j2` for a reference implementation.

## Adding a Form Editor (Future)

The editor is isolated behind an `EditorAdapter` interface. To swap the YAML editor for a form-based editor:

1. Create `frontend/form-adapter.js` implementing `getValue() → string` and `onChange(callback)`
2. In `frontend/editor-adapter.js`, replace `new CodeMirrorAdapter(...)` with `new FormAdapter(...)`

No other files need to change.

## API

| Endpoint | Method | Body | Response |
|----------|--------|------|----------|
| `/api/validate` | POST | `{yaml, template}` | `{valid, errors[]}` |
| `/api/preview` | POST | `{yaml, template}` | `{markdown}` |
| `/api/export/markdown` | POST | `{yaml, template}` | `.md` file |
| `/api/export/latex` | POST | `{yaml, template}` | `.tex` file |
| `/api/export/pdf` | POST | `{yaml, template}` | `.pdf` file |
| `/api/templates` | GET | — | `{templates[]}` |

All endpoints return structured JSON errors on failure:
```json
{
  "error": "invalid_yaml | validation_error | unknown_template | pdf_generation_failed",
  "message": "Human-readable description",
  "details": ["..."]
}
```

## Running Tests

```bash
source .venv/bin/activate
pytest -v
```

## Tech Stack

- **Backend:** FastAPI, Pydantic v2, PyYAML, Jinja2
- **Frontend:** Vanilla JS, CodeMirror 5, marked.js
- **PDF:** pdflatex (TeX Live / MiKTeX)
- **Tests:** pytest, pytest-asyncio, httpx
