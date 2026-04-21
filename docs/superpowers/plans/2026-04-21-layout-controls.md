# Layout Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Density (Comfortable/Balanced/Compact) and Font Scale (S/M/L) segmented controls to the toolbar, flowing through the API as `font_size` and `layout_preamble` Jinja2 variables consumed by all 11 LaTeX templates.

**Architecture:** `LaTeXRenderer` resolves two enum inputs against a lookup table into a `font_size` string and a `layout_preamble` LaTeX `\newcommand` block, both passed as Jinja2 variables. Templates are updated to use `<< font_size >>` in `\documentclass` and `<< layout_preamble >>` in the preamble, then reference `\cvvgap`, `\cvsecbefore`, `\cvsecafter`, `\cvitembefore` throughout. Frontend stores selections in `localStorage` and includes them in every PDF/LaTeX API request.

**Tech Stack:** Python 3.9, FastAPI, Pydantic v2, Jinja2, LaTeX `\newcommand`, vanilla JS, pytest

---

## File Map

| File | Change |
|---|---|
| `backend/renderers/latex.py` | Add `_FONT_SIZE`, `_DENSITY`, `_build_layout_preamble()`; add `density`/`font_scale` params; pass `font_size`/`layout_preamble` to render |
| `backend/main.py` | Add `density`/`font_scale` to `CVRequest`; pass to `LaTeXRenderer` in 3 endpoints; update `_validate_template` |
| `frontend/app.js` | Add `density`/`font_scale` to `app.state` |
| `frontend/index.html` | Add two segmented button groups after template select; add `layout-controls.js` script tag |
| `frontend/layout-controls.js` | New — init from localStorage, wire clicks → setState + localStorage + preview refresh |
| `frontend/preview.js` | Add `density`/`font_scale` to fetch body |
| `frontend/export.js` | Add `density`/`font_scale` to fetch body for `latex` and `pdf` only |
| `tests/test_latex_renderer.py` | New — unit tests for lookup tables, preamble generation, render output |
| `backend/templates/classic/cv.tex.j2` | `<< font_size >>`, `<< layout_preamble >>`, `\titlespacing`, `topsep`, `vspace` |
| `backend/templates/heritage/cv.tex.j2` | Same as classic |
| `backend/templates/executive-corporate/cv.tex.j2` | `<< font_size >>`, `<< layout_preamble >>`, `\titlespacing*`, `topsep`, `vspace` |
| `backend/templates/modern-startup/cv.tex.j2` | Same as executive-corporate |
| `backend/templates/academic-research/cv.tex.j2` | Same as executive-corporate |
| `backend/templates/column-skills/cv.tex.j2` | `<< font_size >>`, `<< layout_preamble >>`, `topsep`, `vspace` |
| `backend/templates/hipster/cv.tex.j2` | Same as column-skills |
| `backend/templates/banking/cv.tex.j2` | Same as column-skills |
| `backend/templates/resume-tech/cv.tex.j2` | Same as column-skills |
| `backend/templates/sidebar-minimal/cv.tex.j2` | Same as column-skills |
| `backend/templates/sidebar-portrait/cv.tex.j2` | Same as column-skills |

---

### Task 1: Renderer — preset lookup and layout variables (TDD)

**Files:**
- Create: `tests/test_latex_renderer.py`
- Modify: `backend/renderers/latex.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_latex_renderer.py`:

```python
from pathlib import Path
from backend.renderers.latex import LaTeXRenderer, _build_layout_preamble, _FONT_SIZE
from backend.models import CVData, PersonalInfo


def _minimal_cv():
    return CVData(personal=PersonalInfo(name="Test User", email="t@t.com"))


def test_font_size_map():
    assert _FONT_SIZE["small"] == "10pt"
    assert _FONT_SIZE["normal"] == "11pt"
    assert _FONT_SIZE["large"] == "12pt"


def test_layout_preamble_balanced():
    p = _build_layout_preamble("balanced")
    assert "\\newcommand{\\cvvgap}{4pt}" in p
    assert "\\newcommand{\\cvsecbefore}{12pt}" in p
    assert "\\newcommand{\\cvsecafter}{6pt}" in p
    assert "\\newcommand{\\cvitembefore}{2pt}" in p


def test_layout_preamble_compact():
    p = _build_layout_preamble("compact")
    assert "\\newcommand{\\cvvgap}{2pt}" in p
    assert "\\newcommand{\\cvsecbefore}{8pt}" in p
    assert "\\newcommand{\\cvsecafter}{4pt}" in p
    assert "\\newcommand{\\cvitembefore}{1pt}" in p


def test_layout_preamble_comfortable():
    p = _build_layout_preamble("comfortable")
    assert "\\newcommand{\\cvvgap}{8pt}" in p
    assert "\\newcommand{\\cvsecbefore}{14pt}" in p
    assert "\\newcommand{\\cvsecafter}{7pt}" in p
    assert "\\newcommand{\\cvitembefore}{4pt}" in p


def test_layout_preamble_unknown_falls_back_to_balanced():
    p = _build_layout_preamble("airy")
    assert "\\newcommand{\\cvvgap}{4pt}" in p


def test_renderer_passes_layout_vars_to_template(tmp_path):
    tmpl_dir = tmp_path / "mini"
    tmpl_dir.mkdir()
    (tmpl_dir / "cv.tex.j2").write_text(
        "\\documentclass[<< font_size >>]{article}\n"
        "<< layout_preamble >>\n"
        "\\begin{document}hello\\end{document}"
    )
    renderer = LaTeXRenderer(tmp_path, template="mini", density="compact", font_scale="small")
    result = renderer.render(_minimal_cv())
    assert "\\documentclass[10pt]{article}" in result
    assert "\\newcommand{\\cvvgap}{2pt}" in result


def test_renderer_unknown_font_scale_falls_back(tmp_path):
    tmpl_dir = tmp_path / "mini"
    tmpl_dir.mkdir()
    (tmpl_dir / "cv.tex.j2").write_text(
        "\\documentclass[<< font_size >>]{article}\n"
        "<< layout_preamble >>\n"
        "\\begin{document}hello\\end{document}"
    )
    renderer = LaTeXRenderer(tmp_path, template="mini", font_scale="huge")
    result = renderer.render(_minimal_cv())
    assert "\\documentclass[11pt]{article}" in result
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd /Users/khjmove/mkcv && python -m pytest tests/test_latex_renderer.py -v 2>&1 | head -20
```

Expected: `ImportError` — `_build_layout_preamble` and `_FONT_SIZE` don't exist yet.

- [ ] **Step 3: Implement the updated renderer**

Replace the entire contents of `backend/renderers/latex.py` with:

```python
from pathlib import Path
from typing import Optional, List
import jinja2
from backend.models import CVData
from backend.renderers.base import BaseRenderer

DEFAULT_SECTION_ORDER = [
    "summary", "experience", "education", "skills", "projects",
    "certifications", "publications", "languages", "awards", "extracurricular",
]

_FONT_SIZE = {
    "small":  "10pt",
    "normal": "11pt",
    "large":  "12pt",
}

_DENSITY = {
    "comfortable": {"vgap": "8pt",  "secbefore": "14pt", "secafter": "7pt",  "itembefore": "4pt"},
    "balanced":    {"vgap": "4pt",  "secbefore": "12pt", "secafter": "6pt",  "itembefore": "2pt"},
    "compact":     {"vgap": "2pt",  "secbefore": "8pt",  "secafter": "4pt",  "itembefore": "1pt"},
}


def _build_layout_preamble(density: str) -> str:
    d = _DENSITY.get(density, _DENSITY["balanced"])
    return (
        f"\\newcommand{{\\cvvgap}}{{{d['vgap']}}}\n"
        f"\\newcommand{{\\cvsecbefore}}{{{d['secbefore']}}}\n"
        f"\\newcommand{{\\cvsecafter}}{{{d['secafter']}}}\n"
        f"\\newcommand{{\\cvitembefore}}{{{d['itembefore']}}}"
    )


class LaTeXRenderer(BaseRenderer):
    def __init__(
        self,
        templates_dir: Path,
        template: str = "classic",
        density: str = "balanced",
        font_scale: str = "normal",
    ):
        self.templates_dir = templates_dir
        self.template = template
        self.density = density
        self.font_scale = font_scale

    def render(self, cv: CVData, section_order: Optional[List[str]] = None) -> str:
        template_path = self.templates_dir / self.template / "cv.tex.j2"
        if not template_path.exists():
            raise ValueError(f"unknown_template: '{self.template}' not found")

        env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(str(self.templates_dir / self.template)),
            block_start_string="<%",
            block_end_string="%>",
            variable_start_string="<<",
            variable_end_string=">>",
            comment_start_string="<#",
            comment_end_string="#>",
            trim_blocks=True,
            lstrip_blocks=True,
        )
        order = section_order if section_order else DEFAULT_SECTION_ORDER
        custom_by_key = {cs.key: cs for cs in cv.custom_sections}
        font_size = _FONT_SIZE.get(self.font_scale, "11pt")
        layout_preamble = _build_layout_preamble(self.density)
        return env.get_template("cv.tex.j2").render(
            cv=cv,
            section_order=order,
            custom_by_key=custom_by_key,
            font_size=font_size,
            layout_preamble=layout_preamble,
        )
```

- [ ] **Step 4: Run renderer tests — expect all pass**

```bash
cd /Users/khjmove/mkcv && python -m pytest tests/test_latex_renderer.py -v
```

Expected:
```
PASSED tests/test_latex_renderer.py::test_font_size_map
PASSED tests/test_latex_renderer.py::test_layout_preamble_balanced
PASSED tests/test_latex_renderer.py::test_layout_preamble_compact
PASSED tests/test_latex_renderer.py::test_layout_preamble_comfortable
PASSED tests/test_latex_renderer.py::test_layout_preamble_unknown_falls_back_to_balanced
PASSED tests/test_latex_renderer.py::test_renderer_passes_layout_vars_to_template
PASSED tests/test_latex_renderer.py::test_renderer_unknown_font_scale_falls_back
```

- [ ] **Step 5: Run full suite — confirm no regressions**

```bash
cd /Users/khjmove/mkcv && python -m pytest -v
```

Expected: all existing tests pass alongside the new ones.

- [ ] **Step 6: Commit**

```bash
git add backend/renderers/latex.py tests/test_latex_renderer.py
git commit -m "feat: add layout preset lookup and font_size/layout_preamble to LaTeXRenderer"
```

---

### Task 2: API — add density and font_scale to CVRequest

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Add fields to CVRequest**

In `backend/main.py`, find:

```python
class CVRequest(BaseModel):
    yaml: str
    template: str = "classic"
    section_order: Optional[List[str]] = None
```

Replace with:

```python
class CVRequest(BaseModel):
    yaml: str
    template: str = "classic"
    section_order: Optional[List[str]] = None
    density: str = "balanced"
    font_scale: str = "normal"
```

- [ ] **Step 2: Update the LaTeXRenderer import**

Find:

```python
from backend.renderers.latex import LaTeXRenderer
```

Replace with:

```python
from backend.renderers.latex import LaTeXRenderer, _build_layout_preamble, _FONT_SIZE
```

- [ ] **Step 3: Pass new fields to LaTeXRenderer in all three endpoints**

There are three occurrences of `LaTeXRenderer(TEMPLATES_DIR, template=req.template)` — in `export_latex`, `export_pdf`, and `preview_pdf`. Replace each with:

```python
LaTeXRenderer(TEMPLATES_DIR, template=req.template, density=req.density, font_scale=req.font_scale)
```

- [ ] **Step 4: Update _validate_template to pass layout variables**

In `_validate_template`, find:

```python
        rendered = template.render(cv=_SAMPLE_CV, section_order=default_order, custom_by_key=custom_by_key)
```

Replace with:

```python
        rendered = template.render(
            cv=_SAMPLE_CV,
            section_order=default_order,
            custom_by_key=custom_by_key,
            font_size=_FONT_SIZE["normal"],
            layout_preamble=_build_layout_preamble("balanced"),
        )
```

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/khjmove/mkcv && python -m pytest -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py
git commit -m "feat: add density and font_scale to CVRequest and thread through to LaTeXRenderer"
```

---

### Task 3: Frontend — app state

**Files:**
- Modify: `frontend/app.js`

- [ ] **Step 1: Add density and font_scale to app.state**

Replace the entire contents of `frontend/app.js` with:

```js
const app = {
  state: {
    yaml: "",
    template: "classic",
    density: "balanced",
    font_scale: "normal",
  },
  setState(patch) {
    Object.assign(this.state, patch);
  },
};

window.app = app;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app.js
git commit -m "feat: add density and font_scale to app state"
```

---

### Task 4: Frontend — toolbar segmented controls

**Files:**
- Modify: `frontend/index.html`
- Create: `frontend/layout-controls.js`

- [ ] **Step 1: Add segmented button groups to the toolbar**

In `frontend/index.html`, find:

```html
    <select id="template-select" title="Template"></select>
    <span id="template-recommended-badges" style="font-size:0.75rem;color:#9ca3af;margin-left:8px;"></span>
```

Replace with:

```html
    <select id="template-select" title="Template"></select>
    <span id="template-recommended-badges" style="font-size:0.75rem;color:#9ca3af;margin-left:8px;"></span>
    <div id="density-group" style="display:inline-flex;align-items:center;border:1px solid #444;border-radius:4px;overflow:hidden;">
      <span style="padding:5px 8px;background:#1a1a1a;color:#666;font-size:0.7rem;letter-spacing:0.05em;text-transform:uppercase;border-right:1px solid #444;white-space:nowrap;">Density</span>
      <button data-value="comfortable" style="background:#222;color:#aaa;border:none;border-right:1px solid #333;padding:5px 10px;cursor:pointer;font-size:0.8rem;font-family:inherit;">Comfortable</button>
      <button data-value="balanced" style="background:#222;color:#aaa;border:none;border-right:1px solid #333;padding:5px 10px;cursor:pointer;font-size:0.8rem;font-family:inherit;">Balanced</button>
      <button data-value="compact" style="background:#222;color:#aaa;border:none;padding:5px 10px;cursor:pointer;font-size:0.8rem;font-family:inherit;">Compact</button>
    </div>
    <div id="font-scale-group" style="display:inline-flex;align-items:center;border:1px solid #444;border-radius:4px;overflow:hidden;">
      <span style="padding:5px 8px;background:#1a1a1a;color:#666;font-size:0.7rem;letter-spacing:0.05em;text-transform:uppercase;border-right:1px solid #444;">Font</span>
      <button data-value="small" style="background:#222;color:#aaa;border:none;border-right:1px solid #333;padding:5px 10px;cursor:pointer;font-size:0.8rem;font-family:inherit;">S</button>
      <button data-value="normal" style="background:#222;color:#aaa;border:none;border-right:1px solid #333;padding:5px 10px;cursor:pointer;font-size:0.8rem;font-family:inherit;">M</button>
      <button data-value="large" style="background:#222;color:#aaa;border:none;padding:5px 10px;cursor:pointer;font-size:0.8rem;font-family:inherit;">L</button>
    </div>
```

- [ ] **Step 2: Add layout-controls.js script tag**

In `frontend/index.html`, find:

```html
  <script src="app.js"></script>
```

Replace with:

```html
  <script src="app.js"></script>
  <script src="layout-controls.js"></script>
```

- [ ] **Step 3: Create frontend/layout-controls.js**

```js
const layoutControls = (() => {
  const DENSITY_KEY = "mkcv_density";
  const FONT_KEY = "mkcv_font_scale";

  function _setActive(groupEl, value) {
    groupEl.querySelectorAll("button[data-value]").forEach(btn => {
      const active = btn.dataset.value === value;
      btn.style.background = active ? "#3a5a8a" : "#222";
      btn.style.color = active ? "#fff" : "#aaa";
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const density = localStorage.getItem(DENSITY_KEY) || "balanced";
    const fontScale = localStorage.getItem(FONT_KEY) || "normal";
    app.setState({ density, font_scale: fontScale });

    const densityGroup = document.getElementById("density-group");
    const fontGroup = document.getElementById("font-scale-group");

    _setActive(densityGroup, density);
    _setActive(fontGroup, fontScale);

    densityGroup.addEventListener("click", e => {
      const btn = e.target.closest("button[data-value]");
      if (!btn) return;
      const value = btn.dataset.value;
      app.setState({ density: value });
      localStorage.setItem(DENSITY_KEY, value);
      _setActive(densityGroup, value);
      preview.refresh(
        sectionsState.getOrderedFilteredYaml(app.state.yaml),
        app.state.template
      );
    });

    fontGroup.addEventListener("click", e => {
      const btn = e.target.closest("button[data-value]");
      if (!btn) return;
      const value = btn.dataset.value;
      app.setState({ font_scale: value });
      localStorage.setItem(FONT_KEY, value);
      _setActive(fontGroup, value);
      preview.refresh(
        sectionsState.getOrderedFilteredYaml(app.state.yaml),
        app.state.template
      );
    });
  });
})();
```

- [ ] **Step 4: Commit**

```bash
git add frontend/index.html frontend/layout-controls.js
git commit -m "feat: add density and font scale segmented controls to toolbar"
```

---

### Task 5: Frontend — thread layout state into API calls

**Files:**
- Modify: `frontend/preview.js`
- Modify: `frontend/export.js`

- [ ] **Step 1: Update preview.js fetch body**

In `frontend/preview.js`, find:

```js
        body: JSON.stringify({ yaml, template, section_order }),
```

Replace with:

```js
        body: JSON.stringify({ yaml, template, section_order, density: app.state.density, font_scale: app.state.font_scale }),
```

- [ ] **Step 2: Update export.js — replace exportFile function**

In `frontend/export.js`, find and replace the entire `exportFile` function:

```js
  async function exportFile(format) {
    const filename = { markdown: "cv.md", latex: "cv.tex", pdf: "cv.pdf" }[format];
    const body = {
      yaml: sectionsState.getOrderedFilteredYaml(app.state.yaml),
      template: app.state.template,
      section_order: sectionsState.getVisibleOrder(app.state.yaml),
    };
    if (format !== "markdown") {
      body.density = app.state.density;
      body.font_scale = app.state.font_scale;
    }
    try {
      const resp = await fetch(`/api/export/${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const err = await resp.json();
        alert(`Export failed: ${err.message}`);
        return;
      }
      triggerDownload(await resp.blob(), filename);
    } catch {
      alert("Export failed: network error");
    }
  }
```

- [ ] **Step 3: Run full test suite**

```bash
cd /Users/khjmove/mkcv && python -m pytest -v
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/preview.js frontend/export.js
git commit -m "feat: include density and font_scale in preview and export API calls"
```

---

### Task 6: Templates — classic and heritage

**Files:**
- Modify: `backend/templates/classic/cv.tex.j2`
- Modify: `backend/templates/heritage/cv.tex.j2`

Both use `\titlespacing` (no `*`) and `topsep=2pt` on itemize.

**classic:**

- [ ] **Step 1: Update \documentclass and inject layout_preamble**

Find:
```
\documentclass[11pt,a4paper]{article}
```
Replace with:
```
\documentclass[<< font_size >>]{article}
<< layout_preamble >>
```

- [ ] **Step 2: Replace \titlespacing**

Find:
```
\titlespacing{\section}{0pt}{12pt}{6pt}
```
Replace with:
```
\titlespacing{\section}{0pt}{\cvsecbefore}{\cvsecafter}
```

- [ ] **Step 3: Replace topsep in all itemize blocks**

Find (3 occurrences):
```
\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
```
Replace all with:
```
\begin{itemize}[leftmargin=*,noitemsep,topsep=\cvitembefore]
```

- [ ] **Step 4: Replace between-item vspace in loop.last guards**

Find all occurrences of each pattern and replace with `\vspace{\cvvgap}`:

```
<% if not loop.last %>\vspace{4pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{3pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{2pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

**heritage:**

- [ ] **Step 5: Update \documentclass and inject layout_preamble**

Find:
```
\documentclass[11pt,a4paper]{article}
```
Replace with:
```
\documentclass[<< font_size >>]{article}
<< layout_preamble >>
```

- [ ] **Step 6: Replace \titlespacing**

Find:
```
\titlespacing{\section}{0pt}{10pt}{6pt}
```
Replace with:
```
\titlespacing{\section}{0pt}{\cvsecbefore}{\cvsecafter}
```

- [ ] **Step 7: Replace topsep in all itemize blocks**

Find (all occurrences):
```
\begin{itemize}[leftmargin=1.4em,noitemsep,topsep=2pt,itemsep=1pt]
```
Replace all with:
```
\begin{itemize}[leftmargin=1.4em,noitemsep,topsep=\cvitembefore,itemsep=1pt]
```

- [ ] **Step 8: Replace between-item vspace in loop.last guards**

```
<% if not loop.last %>\vspace{3pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{2pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

- [ ] **Step 9: Verify Jinja2 render for both templates**

```bash
cd /Users/khjmove/mkcv && python -c "
from pathlib import Path
from backend.renderers.latex import LaTeXRenderer
from backend.parsers.yaml_parser import parse_yaml
cv = parse_yaml(open('mycv.yaml').read())
for tmpl in ['classic', 'heritage']:
    r = LaTeXRenderer(Path('backend/templates'), template=tmpl, density='compact', font_scale='small')
    out = r.render(cv)
    assert r'\cvvgap' in out, f'{tmpl}: missing cvvgap'
    assert r'\documentclass[10pt]' in out, f'{tmpl}: wrong font size'
    assert r'\cvsecbefore' in out, f'{tmpl}: missing cvsecbefore'
    print(f'{tmpl}: OK')
"
```

Expected:
```
classic: OK
heritage: OK
```

- [ ] **Step 10: Commit**

```bash
git add backend/templates/classic/cv.tex.j2 backend/templates/heritage/cv.tex.j2
git commit -m "feat: parameterize spacing in classic and heritage templates"
```

---

### Task 7: Templates — executive-corporate, modern-startup, academic-research

**Files:**
- Modify: `backend/templates/executive-corporate/cv.tex.j2`
- Modify: `backend/templates/modern-startup/cv.tex.j2`
- Modify: `backend/templates/academic-research/cv.tex.j2`

All three use `\titlespacing*` and `\usepackage{parskip}`.

**executive-corporate:**

- [ ] **Step 1: Update \documentclass and inject layout_preamble**

Find:
```
\documentclass[11pt,a4paper]{article}
```
Replace with:
```
\documentclass[<< font_size >>]{article}
<< layout_preamble >>
```

- [ ] **Step 2: Replace \titlespacing***

Find:
```
\titlespacing*{\section}{0pt}{11pt}{4pt}
```
Replace with:
```
\titlespacing*{\section}{0pt}{\cvsecbefore}{\cvsecafter}
```

- [ ] **Step 3: Replace topsep in itemize blocks**

Find:
```
  {\begin{itemize}[leftmargin=1.0em,labelsep=0.4em,itemsep=1pt,topsep=2pt,parsep=0pt]}
```
Replace with:
```
  {\begin{itemize}[leftmargin=1.0em,labelsep=0.4em,itemsep=1pt,topsep=\cvitembefore,parsep=0pt]}
```

Find (all occurrences):
```
\begin{itemize}[leftmargin=1.1em,itemsep=2pt,topsep=2pt]
```
Replace all with:
```
\begin{itemize}[leftmargin=1.1em,itemsep=2pt,topsep=\cvitembefore]
```

Find (all occurrences):
```
\begin{itemize}[leftmargin=1.1em,itemsep=1.5pt,topsep=2pt]
```
Replace all with:
```
\begin{itemize}[leftmargin=1.1em,itemsep=1.5pt,topsep=\cvitembefore]
```

- [ ] **Step 4: Replace between-item vspace in loop.last guards**

```
<% if not loop.last %>\vspace{4pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{3pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{2pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

**modern-startup:**

- [ ] **Step 5: Update \documentclass and inject layout_preamble**

Find:
```
\documentclass[11pt,a4paper]{article}
```
Replace with:
```
\documentclass[<< font_size >>]{article}
<< layout_preamble >>
```

- [ ] **Step 6: Replace \titlespacing***

Find:
```
\titlespacing*{\section}{0pt}{14pt}{5pt}
```
Replace with:
```
\titlespacing*{\section}{0pt}{\cvsecbefore}{\cvsecafter}
```

- [ ] **Step 7: Replace topsep in itemize blocks**

Find:
```
  {\begin{itemize}[leftmargin=1.1em,labelsep=0.5em,itemsep=1pt,topsep=3pt,parsep=0pt,label=\textendash]}
```
Replace with:
```
  {\begin{itemize}[leftmargin=1.1em,labelsep=0.5em,itemsep=1pt,topsep=\cvitembefore,parsep=0pt,label=\textendash]}
```

Find:
```
\begin{itemize}[leftmargin=1.2em,itemsep=3pt,topsep=2pt]
```
Replace with:
```
\begin{itemize}[leftmargin=1.2em,itemsep=3pt,topsep=\cvitembefore]
```

- [ ] **Step 8: Replace between-item vspace in loop.last guards**

```
<% if not loop.last %>\vspace{6pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{5pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{4pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{3pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{2pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

**academic-research:**

- [ ] **Step 9: Update \documentclass and inject layout_preamble**

Find:
```
\documentclass[11pt,a4paper]{article}
```
Replace with:
```
\documentclass[<< font_size >>]{article}
<< layout_preamble >>
```

- [ ] **Step 10: Replace \titlespacing***

Find:
```
\titlespacing*{\section}{0pt}{13pt}{4pt}
```
Replace with:
```
\titlespacing*{\section}{0pt}{\cvsecbefore}{\cvsecafter}
```

- [ ] **Step 11: Replace topsep in itemize/enumerate blocks**

Find:
```
  {\begin{itemize}[leftmargin=1.2em,labelsep=0.5em,itemsep=1pt,topsep=2pt,parsep=0pt]}
```
Replace with:
```
  {\begin{itemize}[leftmargin=1.2em,labelsep=0.5em,itemsep=1pt,topsep=\cvitembefore,parsep=0pt]}
```

Find:
```
\begin{enumerate}[leftmargin=1.8em,itemsep=4pt,topsep=2pt,label=\textup{[\arabic*]}]
```
Replace with:
```
\begin{enumerate}[leftmargin=1.8em,itemsep=4pt,topsep=\cvitembefore,label=\textup{[\arabic*]}]
```

Find (all occurrences):
```
\begin{itemize}[leftmargin=1.2em,itemsep=2pt,topsep=2pt]
```
Replace all with:
```
\begin{itemize}[leftmargin=1.2em,itemsep=2pt,topsep=\cvitembefore]
```

- [ ] **Step 12: Replace between-item vspace in loop.last guards**

```
<% if not loop.last %>\vspace{5pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{4pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

- [ ] **Step 13: Verify Jinja2 render for all three**

```bash
cd /Users/khjmove/mkcv && python -c "
from pathlib import Path
from backend.renderers.latex import LaTeXRenderer
from backend.parsers.yaml_parser import parse_yaml
cv = parse_yaml(open('mycv.yaml').read())
for tmpl in ['executive-corporate', 'modern-startup', 'academic-research']:
    r = LaTeXRenderer(Path('backend/templates'), template=tmpl, density='compact', font_scale='small')
    out = r.render(cv)
    assert r'\cvvgap' in out, f'{tmpl}: missing cvvgap'
    assert r'\documentclass[10pt]' in out, f'{tmpl}: wrong font size'
    assert r'\cvsecbefore' in out, f'{tmpl}: missing cvsecbefore'
    print(f'{tmpl}: OK')
"
```

Expected:
```
executive-corporate: OK
modern-startup: OK
academic-research: OK
```

- [ ] **Step 14: Commit**

```bash
git add backend/templates/executive-corporate/cv.tex.j2 backend/templates/modern-startup/cv.tex.j2 backend/templates/academic-research/cv.tex.j2
git commit -m "feat: parameterize spacing in executive-corporate, modern-startup, academic-research templates"
```

---

### Task 8: Templates — column-skills and hipster

**Files:**
- Modify: `backend/templates/column-skills/cv.tex.j2`
- Modify: `backend/templates/hipster/cv.tex.j2`

Neither uses `\titlespacing`. Both use column layout macros.

**column-skills:**

- [ ] **Step 1: Update \documentclass and inject layout_preamble**

Find:
```
\documentclass[11pt,a4paper]{article}
```
Replace with:
```
\documentclass[<< font_size >>]{article}
<< layout_preamble >>
```

- [ ] **Step 2: Replace topsep in itemize/enumerate blocks**

Find:
```
  \begin{itemize}[leftmargin=1em,labelsep=0.4em,itemsep=0.5pt,topsep=1pt,parsep=0pt,label=\textendash]%
```
Replace with:
```
  \begin{itemize}[leftmargin=1em,labelsep=0.4em,itemsep=0.5pt,topsep=\cvitembefore,parsep=0pt,label=\textendash]%
```

Find:
```
\begin{enumerate}[leftmargin=1.5em,itemsep=3pt,topsep=2pt,label=\textup{[\arabic*]}]
```
Replace with:
```
\begin{enumerate}[leftmargin=1.5em,itemsep=3pt,topsep=\cvitembefore,label=\textup{[\arabic*]}]
```

- [ ] **Step 3: Replace between-item vspace in loop.last guards**

```
<% if not loop.last %>\vspace{5pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{4pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{3pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

**hipster:**

- [ ] **Step 4: Update \documentclass and inject layout_preamble**

Find:
```
\documentclass[11pt,a4paper]{article}
```
Replace with:
```
\documentclass[<< font_size >>]{article}
<< layout_preamble >>
```

- [ ] **Step 5: Replace topsep in itemize/enumerate blocks**

Find:
```
  \begin{itemize}[leftmargin=1em,labelsep=0.4em,itemsep=0.5pt,topsep=2pt,parsep=0pt,label=\textendash]%
```
Replace with:
```
  \begin{itemize}[leftmargin=1em,labelsep=0.4em,itemsep=0.5pt,topsep=\cvitembefore,parsep=0pt,label=\textendash]%
```

Find:
```
\begin{enumerate}[leftmargin=1.5em,itemsep=3pt,topsep=2pt,label=\textup{[\arabic*]}]
```
Replace with:
```
\begin{enumerate}[leftmargin=1.5em,itemsep=3pt,topsep=\cvitembefore,label=\textup{[\arabic*]}]
```

- [ ] **Step 6: Replace between-item vspace in loop.last guards**

```
<% if not loop.last %>\vspace{5pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{4pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

- [ ] **Step 7: Verify Jinja2 render**

```bash
cd /Users/khjmove/mkcv && python -c "
from pathlib import Path
from backend.renderers.latex import LaTeXRenderer
from backend.parsers.yaml_parser import parse_yaml
cv = parse_yaml(open('mycv.yaml').read())
for tmpl in ['column-skills', 'hipster']:
    r = LaTeXRenderer(Path('backend/templates'), template=tmpl, density='compact', font_scale='small')
    out = r.render(cv)
    assert r'\cvvgap' in out, f'{tmpl}: missing cvvgap'
    assert r'\documentclass[10pt]' in out, f'{tmpl}: wrong font size'
    print(f'{tmpl}: OK')
"
```

Expected:
```
column-skills: OK
hipster: OK
```

- [ ] **Step 8: Commit**

```bash
git add backend/templates/column-skills/cv.tex.j2 backend/templates/hipster/cv.tex.j2
git commit -m "feat: parameterize spacing in column-skills and hipster templates"
```

---

### Task 9: Templates — banking and resume-tech

**Files:**
- Modify: `backend/templates/banking/cv.tex.j2`
- Modify: `backend/templates/resume-tech/cv.tex.j2`

Neither uses `\titlespacing`. Banking uses a tabular date layout; resume-tech uses rule-based section headers.

**banking:**

- [ ] **Step 1: Update \documentclass and inject layout_preamble**

Find:
```
\documentclass[11pt,a4paper]{article}
```
Replace with:
```
\documentclass[<< font_size >>]{article}
<< layout_preamble >>
```

- [ ] **Step 2: Replace topsep in itemize/enumerate blocks**

Find:
```
  \begin{itemize}[leftmargin=1em,labelsep=0.4em,itemsep=0.5pt,topsep=1pt,parsep=0pt,label=\textendash]%
```
Replace with:
```
  \begin{itemize}[leftmargin=1em,labelsep=0.4em,itemsep=0.5pt,topsep=\cvitembefore,parsep=0pt,label=\textendash]%
```

Find:
```
\begin{enumerate}[leftmargin=1.5em,itemsep=3pt,topsep=2pt,label=\textup{[\arabic*]}]
```
Replace with:
```
\begin{enumerate}[leftmargin=1.5em,itemsep=3pt,topsep=\cvitembefore,label=\textup{[\arabic*]}]
```

- [ ] **Step 3: Replace between-item vspace in loop.last guards**

```
<% if not loop.last %>\vspace{4pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{3pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

**resume-tech:**

- [ ] **Step 4: Update \documentclass and inject layout_preamble**

Find:
```
\documentclass[11pt,a4paper]{article}
```
Replace with:
```
\documentclass[<< font_size >>]{article}
<< layout_preamble >>
```

- [ ] **Step 5: Replace topsep in itemize/enumerate blocks**

Find:
```
  \begin{itemize}[leftmargin=1.2em,labelsep=0.4em,itemsep=0pt,topsep=1pt,parsep=0pt,label=\textbullet]%
```
Replace with:
```
  \begin{itemize}[leftmargin=1.2em,labelsep=0.4em,itemsep=0pt,topsep=\cvitembefore,parsep=0pt,label=\textbullet]%
```

Find:
```
\begin{enumerate}[leftmargin=1.5em,itemsep=2pt,topsep=1pt,label=\textup{[\arabic*]}]
```
Replace with:
```
\begin{enumerate}[leftmargin=1.5em,itemsep=2pt,topsep=\cvitembefore,label=\textup{[\arabic*]}]
```

- [ ] **Step 6: Replace between-item vspace in loop.last guards**

```
<% if not loop.last %>\vspace{5pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{4pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

- [ ] **Step 7: Verify Jinja2 render**

```bash
cd /Users/khjmove/mkcv && python -c "
from pathlib import Path
from backend.renderers.latex import LaTeXRenderer
from backend.parsers.yaml_parser import parse_yaml
cv = parse_yaml(open('mycv.yaml').read())
for tmpl in ['banking', 'resume-tech']:
    r = LaTeXRenderer(Path('backend/templates'), template=tmpl, density='compact', font_scale='small')
    out = r.render(cv)
    assert r'\cvvgap' in out, f'{tmpl}: missing cvvgap'
    assert r'\documentclass[10pt]' in out, f'{tmpl}: wrong font size'
    print(f'{tmpl}: OK')
"
```

Expected:
```
banking: OK
resume-tech: OK
```

- [ ] **Step 8: Commit**

```bash
git add backend/templates/banking/cv.tex.j2 backend/templates/resume-tech/cv.tex.j2
git commit -m "feat: parameterize spacing in banking and resume-tech templates"
```

---

### Task 10: Templates — sidebar-minimal and sidebar-portrait

**Files:**
- Modify: `backend/templates/sidebar-minimal/cv.tex.j2`
- Modify: `backend/templates/sidebar-portrait/cv.tex.j2`

Both use a two-column sidebar layout with `\usepackage{parskip}`. Neither uses `\titlespacing`.

**sidebar-minimal:**

- [ ] **Step 1: Update \documentclass and inject layout_preamble**

Find:
```
\documentclass[11pt,a4paper]{article}
```
Replace with:
```
\documentclass[<< font_size >>]{article}
<< layout_preamble >>
```

- [ ] **Step 2: Replace topsep in itemize/enumerate blocks**

Find:
```
  \begin{itemize}[leftmargin=1em,labelsep=0.4em,itemsep=0.5pt,topsep=2pt,parsep=0pt,label=\textendash]%
```
Replace with:
```
  \begin{itemize}[leftmargin=1em,labelsep=0.4em,itemsep=0.5pt,topsep=\cvitembefore,parsep=0pt,label=\textendash]%
```

Find:
```
\begin{enumerate}[leftmargin=1.5em,itemsep=3pt,topsep=2pt,label=\textup{[\arabic*]}]
```
Replace with:
```
\begin{enumerate}[leftmargin=1.5em,itemsep=3pt,topsep=\cvitembefore,label=\textup{[\arabic*]}]
```

- [ ] **Step 3: Replace between-item vspace in loop.last guards**

```
<% if not loop.last %>\vspace{5pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{4pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{3pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{2pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

**sidebar-portrait:**

- [ ] **Step 4: Update \documentclass and inject layout_preamble**

Find:
```
\documentclass[11pt,a4paper]{article}
```
Replace with:
```
\documentclass[<< font_size >>]{article}
<< layout_preamble >>
```

- [ ] **Step 5: Replace topsep in itemize/enumerate blocks**

Find:
```
  \begin{itemize}[leftmargin=1em,labelsep=0.4em,itemsep=0.5pt,topsep=2pt,parsep=0pt,label=\textendash]%
```
Replace with:
```
  \begin{itemize}[leftmargin=1em,labelsep=0.4em,itemsep=0.5pt,topsep=\cvitembefore,parsep=0pt,label=\textendash]%
```

Find:
```
\begin{enumerate}[leftmargin=1.5em,itemsep=3pt,topsep=2pt,label=\textup{[\arabic*]}]
```
Replace with:
```
\begin{enumerate}[leftmargin=1.5em,itemsep=3pt,topsep=\cvitembefore,label=\textup{[\arabic*]}]
```

- [ ] **Step 6: Replace between-item vspace in loop.last guards**

```
<% if not loop.last %>\vspace{5pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{4pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{3pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

```
<% if not loop.last %>\vspace{2pt}<% endif %>
```
→ `<% if not loop.last %>\vspace{\cvvgap}<% endif %>`

- [ ] **Step 7: Verify Jinja2 render for both sidebar templates**

```bash
cd /Users/khjmove/mkcv && python -c "
from pathlib import Path
from backend.renderers.latex import LaTeXRenderer
from backend.parsers.yaml_parser import parse_yaml
cv = parse_yaml(open('mycv.yaml').read())
for tmpl in ['sidebar-minimal', 'sidebar-portrait']:
    r = LaTeXRenderer(Path('backend/templates'), template=tmpl, density='compact', font_scale='small')
    out = r.render(cv)
    assert r'\cvvgap' in out, f'{tmpl}: missing cvvgap'
    assert r'\documentclass[10pt]' in out, f'{tmpl}: wrong font size'
    print(f'{tmpl}: OK')
"
```

Expected:
```
sidebar-minimal: OK
sidebar-portrait: OK
```

- [ ] **Step 8: Run full test suite**

```bash
cd /Users/khjmove/mkcv && python -m pytest -v
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add backend/templates/sidebar-minimal/cv.tex.j2 backend/templates/sidebar-portrait/cv.tex.j2
git commit -m "feat: parameterize spacing in sidebar-minimal and sidebar-portrait templates"
```

---

### Task 11: Final verification — all templates × all presets

- [ ] **Step 1: Run the full combination matrix**

```bash
cd /Users/khjmove/mkcv && python -c "
from pathlib import Path
from backend.renderers.latex import LaTeXRenderer
from backend.parsers.yaml_parser import parse_yaml

TEMPLATES_DIR = Path('backend/templates')
cv = parse_yaml(open('mycv.yaml').read())

templates = [
    'classic', 'heritage', 'executive-corporate', 'modern-startup',
    'academic-research', 'column-skills', 'hipster', 'banking',
    'resume-tech', 'sidebar-minimal', 'sidebar-portrait',
]
densities = ['comfortable', 'balanced', 'compact']
font_scales = ['small', 'normal', 'large']

errors = []
for tmpl in templates:
    for d in densities:
        for f in font_scales:
            try:
                r = LaTeXRenderer(TEMPLATES_DIR, template=tmpl, density=d, font_scale=f)
                out = r.render(cv)
                font_pt = {'small': '10pt', 'normal': '11pt', 'large': '12pt'}[f]
                assert r'\cvvgap' in out, 'missing cvvgap'
                assert r'\cvitembefore' in out, 'missing cvitembefore'
                assert f'\\documentclass[{font_pt}]' in out, f'wrong font size: expected {font_pt}'
            except Exception as e:
                errors.append(f'{tmpl}/{d}/{f}: {e}')

if errors:
    for e in errors: print('FAIL:', e)
else:
    print(f'All {len(templates) * len(densities) * len(font_scales)} combinations OK')
"
```

Expected:
```
All 99 combinations OK
```

- [ ] **Step 2: Run full test suite**

```bash
cd /Users/khjmove/mkcv && python -m pytest -v
```

Expected: all pass.

- [ ] **Step 3: Final commit**

```bash
git add .
git commit -m "feat: layout controls — density and font scale complete across all 11 templates"
```
