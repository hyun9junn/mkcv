# mkcv

A web app for authoring and exporting your CV from a single YAML source of truth.

Write your CV once in `mycv.yaml` — get a live PDF preview, export to Markdown, LaTeX, or PDF with one click.

## Features

- **Live PDF preview** — the preview pane renders the actual compiled PDF of the selected template in real time (1.5s debounce)
- **File sync** — editor loads `mycv.yaml` on startup and auto-saves every 1s as you type
- **Section toggle panel** — collapsible checklist above the editor; enable/disable any section to insert or remove its YAML scaffold
- **Two LaTeX templates** — `classic` (clean, minimal) and `awesomecv` (colored headings, Hugging Face link support)
- **Template validation** — validates Jinja2 rendering + pdflatex compilation; invalid templates are marked ⚠ in the dropdown
- **Three export formats** — Markdown (`.md`), LaTeX (`.tex`), PDF
- **Inline YAML validation** — errors shown as you type
- **All sections optional** — empty sections are skipped in all outputs

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
| Awards | `awards` |
| Extracurricular Activities | `extracurricular` |

## Getting Started

**Requirements:** Python 3.11+, and `pdflatex` for PDF preview/export (install [TeX Live](https://tug.org/texlive/) or [MiKTeX](https://miktex.org/)).

```bash
git clone https://github.com/hyun9junn/mkcv.git
cd mkcv
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

Open **http://localhost:8000** in your browser. Place your `mycv.yaml` in the project root — the editor will load it automatically.

## CV Format

Edit `mycv.yaml` directly in the browser editor. All sections except `personal` are optional.

```yaml
personal:
  name: Your Name
  email: you@example.com
  phone: "+1-000-000-0000"
  location: City, Country
  linkedin: linkedin.com/in/yourhandle
  github: github.com/yourusername
  huggingface: huggingface.co/yourusername   # awesomecv template
  website: yoursite.com

summary: >
  A short professional summary.

experience:
  - title: Software Engineer
    company: Acme Corp
    start_date: "2021"
    end_date: null          # null = Present
    location: Seoul, Korea  # optional
    highlights:
      - Built X, reducing latency by 40%

education:
  - degree: B.S. Computer Science
    institution: University Name
    year: "2020"            # or use start_date/end_date
    gpa: "3.9"

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

awards:
  - name: 1st Place, Some Competition
    issuer: Organizing Body
    date: "2024"
    description: Optional description   # optional

extracurricular:
  - title: Chess Club
    organization: University Name
    date: "2023"            # optional
    highlights:
      - Won regional championship
```

## Adding a Custom LaTeX Template

1. Create a folder under `backend/templates/<your-name>/`
2. Add a `cv.tex.j2` file using the same Jinja2 delimiters as the classic template:
   - Variables: `<< variable >>`
   - Blocks: `<% if condition %>` / `<% endif %>`
   - The CV data is available as `cv` (a `CVData` object — see `backend/models.py`)
3. Restart the server — your template appears in the dropdown automatically
4. Click **✓ Validate Template** to run a two-stage check (Jinja2 render + pdflatex compile) and surface any errors

See `backend/templates/classic/cv.tex.j2` for a reference implementation.

## API

| Endpoint | Method | Body | Response |
|----------|--------|------|----------|
| `/api/validate` | POST | `{yaml, template}` | `{valid, errors[]}` |
| `/api/preview` | POST | `{yaml, template}` | `{markdown}` |
| `/api/preview/pdf` | POST | `{yaml, template}` | PDF bytes (inline) |
| `/api/export/markdown` | POST | `{yaml, template}` | `.md` file |
| `/api/export/latex` | POST | `{yaml, template}` | `.tex` file |
| `/api/export/pdf` | POST | `{yaml, template}` | `.pdf` file |
| `/api/templates` | GET | — | `{templates[], validation{}}` |
| `/api/templates/{name}/validate` | POST | — | `{valid, errors[]}` |
| `/api/file` | GET | — | `{content}` |
| `/api/file` | POST | `{content}` | `{ok}` |

All endpoints return structured JSON errors on failure:
```json
{
  "error": "invalid_yaml | validation_error | unknown_template | pdf_generation_failed | file_write_failed",
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
- **Frontend:** Vanilla JS, CodeMirror 5, js-yaml
- **PDF:** pdflatex (TeX Live / MiKTeX)
- **Tests:** pytest, pytest-asyncio, httpx
