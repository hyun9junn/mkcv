# mkcv

A web app for authoring and exporting your CV from a single YAML source of truth.

Write your CV once in `mycv.yaml` — get a live PDF preview, export to Markdown, LaTeX, or PDF with one click.

![Preview](./preview.png)

---

## Features

| Feature | Details |
|---------|---------|
| **Live PDF preview** | Renders the compiled PDF in real time (1.5 s debounce) |
| **Zoom controls** | Zoom in/out via buttons or `Ctrl`/`⌘` + scroll wheel (25%–400%) |
| **Section panel** | Drag chips to reorder, toggle visibility without touching YAML, reset any section to its scaffold |
| **10 LaTeX templates** | `classic`, `academic-research`, `banking`, `column-skills`, `executive-corporate`, `heritage`, `hipster`, `modern-startup`, `resume-tech`, `sidebar-minimal` |
| **Layout controls** | Density (comfortable / balanced / compact) and font scale (small / normal / large) |
| **Three export formats** | Markdown (`.md`), LaTeX (`.tex`), PDF (`.pdf`) |
| **File sync** | Loads `mycv.yaml` on startup; auto-saves every 1 s as you type |
| **Inline YAML validation** | Errors shown as you type with YAML autocomplete hints |
| **Dark / light mode** | Theme toggle persisted across sessions |
| **All sections optional** | Empty sections are skipped in every output format |

---

## Quick Start

**Requirements:** Python 3.11+, and `pdflatex` on your `PATH` (see [Installing LaTeX](#installing-latex) below).

```bash
git clone https://github.com/hyun9junn/mkcv.git
cd mkcv
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

Open **http://localhost:8000** in your browser. The editor loads `mycv.yaml` from the project root automatically — create or edit it there.

---

## Using the App

### Editor

- Type your CV in YAML on the left pane. Changes auto-save to `mycv.yaml` every 1 second.
- Validation errors appear inline as you type.
- Autocomplete hints activate while editing field names.
- The cursor position (line : column) is shown in the status bar.

### PDF Preview

- The right pane renders a live PDF preview, updated 1.5 s after you stop typing.
- **Zoom:** use the `+` / `−` buttons, click the percentage label to reset to 100%, or hold `Ctrl` / `⌘` and scroll.

### Section Panel (the chip rail below the toolbar)

Each section in your YAML appears as a draggable chip:

| Action | How |
|--------|-----|
| Toggle visibility | Click the chip — hides/shows the section in PDF output without changing `mycv.yaml` |
| Reorder | Drag a chip left or right; the panel auto-scrolls near the edges |
| Reset to scaffold | Click the ↺ icon → confirm → undo within 5 s if you change your mind |
| Grey chips | Sections not yet in your YAML; drag them to set their position before adding |

### Layout Controls

The toolbar exposes two layout knobs that affect PDF output:

- **Density** — `comfortable`, `balanced` (default), `compact`  
- **Font scale** — `small`, `normal` (default), `large`

### Templates

Select a template from the dropdown. Click **✓ Validate Template** to run a two-stage check (Jinja2 render + pdflatex compile) and surface any errors. Invalid templates are marked ⚠.

---

## CV Format

All sections except `personal` are optional. Empty sections are skipped automatically.

```yaml
personal:
  name: Your Name
  email: you@example.com
  phone: "+1-000-000-0000"
  location: City, Country
  linkedin: linkedin.com/in/yourhandle
  github: github.com/yourusername
  huggingface: huggingface.co/yourusername
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
    year: "2020"            # or use start_date / end_date
    gpa: "3.9"              # optional

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
    description: Optional description

extracurricular:
  - title: Chess Club
    organization: University Name
    date: "2023"
    highlights:
      - Won regional championship
```

### Supported Sections

| Key | Section |
|-----|---------|
| `personal` | Personal info |
| `summary` | Professional summary |
| `experience` | Work experience |
| `education` | Education |
| `skills` | Skills |
| `projects` | Projects |
| `certifications` | Certifications |
| `publications` | Publications |
| `languages` | Languages |
| `awards` | Awards |
| `extracurricular` | Extracurricular activities |

---

## Installing LaTeX

PDF preview and export require `pdflatex` on your `PATH`.

### macOS

**Option A — MacTeX (full, ~4 GB):**
```bash
brew install --cask mactex
```
Open a new terminal after installation so `/Library/TeX/texbin` is on your `PATH`.

**Option B — BasicTeX (minimal, ~100 MB) + required packages:**
```bash
brew install --cask basictex
# open a new terminal, then:
sudo tlmgr update --self
sudo tlmgr install collection-fontsrecommended enumitem geometry hyperref xcolor fontawesome5
```

### Windows

**Option A — MiKTeX (recommended, auto-installs missing packages):**
1. Download the installer from <https://miktex.org/download>
2. Run the installer (install for all users recommended)
3. Open a new Command Prompt — `pdflatex` should be on `PATH` automatically

**Option B — TeX Live:**
1. Download `install-tl-windows.exe` from <https://tug.org/texlive/acquire-netinstall.html>
2. Run the installer (full install is ~7 GB; choose a smaller scheme if disk space is limited)

### Linux

**Debian / Ubuntu:**
```bash
sudo apt-get install texlive-latex-recommended texlive-fonts-recommended \
     texlive-latex-extra texlive-fonts-extra
```

**Fedora / RHEL / CentOS:**
```bash
sudo dnf install texlive-scheme-medium
```

**Arch Linux:**
```bash
sudo pacman -S texlive-most
```

**Verify the install:**
```bash
pdflatex --version
```

---

## Adding a Custom Template

1. Create `backend/templates/<your-name>/cv.tex.j2`
2. Use the same Jinja2 delimiters as the existing templates:
   - Variables: `<< variable >>`
   - Blocks: `<% if condition %>` / `<% endif %>`
   - CV data is available as `cv` (a `CVData` object — see `backend/models.py`)
3. Restart the server — your template appears in the dropdown automatically
4. Click **✓ Validate Template** to verify it compiles correctly

See `backend/templates/classic/cv.tex.j2` for a reference implementation.

---

## API Reference

| Endpoint | Method | Body | Response |
|----------|--------|------|----------|
| `/api/validate` | POST | `{yaml, template}` | `{valid, errors[]}` |
| `/api/preview` | POST | `{yaml, template}` | `{markdown}` |
| `/api/preview/pdf` | POST | `{yaml, template, section_order, density, font_scale}` | PDF bytes |
| `/api/export/markdown` | POST | `{yaml, template}` | `.md` file |
| `/api/export/latex` | POST | `{yaml, template}` | `.tex` file |
| `/api/export/pdf` | POST | `{yaml, template}` | `.pdf` file |
| `/api/templates` | GET | — | `{templates[], validation{}}` |
| `/api/templates/{name}/validate` | POST | — | `{valid, errors[]}` |
| `/api/file` | GET | — | `{content}` |
| `/api/file` | POST | `{content}` | `{ok}` |

All failure responses share a common shape:
```json
{
  "error": "invalid_yaml | validation_error | unknown_template | pdf_generation_failed | file_write_failed",
  "message": "Human-readable description",
  "details": ["..."]
}
```

---

## Running Tests

```bash
source .venv/bin/activate
pytest -v
```

---

## Tech Stack

- **Backend:** FastAPI, Pydantic v2, PyYAML, Jinja2
- **Frontend:** Vanilla JS, CodeMirror 5, js-yaml, PDF.js
- **PDF:** pdflatex (TeX Live / MiKTeX)
- **Tests:** pytest, pytest-asyncio, httpx
