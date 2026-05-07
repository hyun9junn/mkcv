# XeLaTeX Template Lightweighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep mkcv on the current XeLaTeX pipeline, remove legacy pdfLaTeX baggage from templates, and make the slowest templates compile faster without visibly redesigning them.

**Architecture:** Treat the work in two layers. First, align every template and the template authoring guide with the real XeLaTeX runtime contract by removing safe legacy package declarations and updating docs/tests. Then apply small, bounded template-level simplifications to `chancellor`, `slate-rail`, and `trackline`, each backed by focused source-shape regressions plus existing render/compile smoke coverage.

**Tech Stack:** FastAPI, Pydantic v2, Jinja2, XeLaTeX, pytest, Node `node:test`, plain LaTeX template files

---

## File Map

- `backend/templates/README.md`
  - Template authoring guide. This must stop claiming a pdflatex-only pipeline and must describe the actual shared XeLaTeX preamble/runtime assumptions.
- `backend/templates/ats-signal/cv.tex.j2`
  - Template source currently carrying legacy `fontenc`/`inputenc` package declarations.
- `backend/templates/boardroom/cv.tex.j2`
  - Template source currently carrying legacy `fontenc`/`inputenc` package declarations.
- `backend/templates/chancellor/cv.tex.j2`
  - Slow single-column template. First remove legacy package baggage, then remove clearly unused declarations such as `tabularx` and `lmodern` if the compile smoke stays green.
- `backend/templates/classic/cv.tex.j2`
  - Control template; not expected to change, but acts as a benchmark baseline.
- `backend/templates/dealbook/cv.tex.j2`
  - Template source currently carrying legacy `fontenc`/`inputenc` package declarations.
- `backend/templates/foundry/cv.tex.j2`
  - Template source currently carrying legacy `fontenc`/`inputenc` package declarations.
- `backend/templates/letterpress/cv.tex.j2`
  - Template source currently carrying legacy `fontenc`/`inputenc` package declarations.
- `backend/templates/masthead/cv.tex.j2`
  - Template source currently carrying legacy `fontenc`/`inputenc` package declarations.
- `backend/templates/mono-forge/cv.tex.j2`
  - Slow template with monospace styling. This pass only removes safe legacy package declarations; no structural edits here.
- `backend/templates/scholar-index/cv.tex.j2`
  - Template source currently carrying legacy `fontenc`/`inputenc` package declarations.
- `backend/templates/signature-split/cv.tex.j2`
  - Template source currently carrying legacy `fontenc`/`inputenc` package declarations.
- `backend/templates/slate-rail/cv.tex.j2`
  - Slow sidebar template. This pass removes legacy declarations and simplifies the main-column wrapper structure without removing the sidebar/paracol design.
- `backend/templates/skillboard/cv.tex.j2`
  - Template source currently carrying legacy `fontenc`/`inputenc` package declarations.
- `backend/templates/studio-pop/cv.tex.j2`
  - Template source currently carrying legacy `fontenc`/`inputenc` package declarations.
- `backend/templates/trackline/cv.tex.j2`
  - Slow timeline template. This pass removes legacy declarations and replaces the per-entry TikZ dot with a cheaper text-based marker while keeping the date rail layout.
- `tests/test_latex_renderer.py`
  - Renderer/template regression coverage. This is the right place for source-shape tests, README/runtime contract checks, and XeLaTeX compile smoke expansion for the targeted templates.

---

### Task 1: Align Template Docs And Remove Legacy pdfLaTeX Input Packages

**Files:**
- Modify: `backend/templates/README.md`
- Modify: `backend/templates/ats-signal/cv.tex.j2`
- Modify: `backend/templates/boardroom/cv.tex.j2`
- Modify: `backend/templates/chancellor/cv.tex.j2`
- Modify: `backend/templates/dealbook/cv.tex.j2`
- Modify: `backend/templates/foundry/cv.tex.j2`
- Modify: `backend/templates/letterpress/cv.tex.j2`
- Modify: `backend/templates/masthead/cv.tex.j2`
- Modify: `backend/templates/mono-forge/cv.tex.j2`
- Modify: `backend/templates/scholar-index/cv.tex.j2`
- Modify: `backend/templates/signature-split/cv.tex.j2`
- Modify: `backend/templates/slate-rail/cv.tex.j2`
- Modify: `backend/templates/skillboard/cv.tex.j2`
- Modify: `backend/templates/studio-pop/cv.tex.j2`
- Modify: `backend/templates/trackline/cv.tex.j2`
- Test: `tests/test_latex_renderer.py`

- [ ] **Step 1: Write the failing source/documentation regressions**

Add these tests to `tests/test_latex_renderer.py` near the existing template-source checks:

```python
def _template_source(name: str) -> str:
    return (TEMPLATES_DIR / name / "cv.tex.j2").read_text()


def test_all_templates_drop_legacy_pdftex_input_packages():
    for template_path in TEMPLATES_DIR.glob("*/cv.tex.j2"):
        source = template_path.read_text()
        assert r"\usepackage[T1]{fontenc}" not in source, template_path
        assert r"\usepackage[utf8]{inputenc}" not in source, template_path


def test_template_readme_describes_current_xelatex_pipeline():
    readme = (TEMPLATES_DIR / "README.md").read_text()
    assert "compile with **XeLaTeX**" in readme
    assert "shared `<< xelatex_preamble >>` block" in readme
    assert "pdflatex" not in readme.split("## Compiler constraints", 1)[1].split("## Validation", 1)[0].lower()


@xelatex_available
@pytest.mark.parametrize("template", ["classic", "boardroom", "chancellor", "slate-rail", "trackline"])
def test_templates_compile_korean_content_with_xelatex(tmp_path, template):
    cv = CVData(
        personal=PersonalInfo(name="홍길동", email="hong@example.com"),
        summary="한글 요약 테스트입니다. English mixed.",
    )

    rendered = LaTeXRenderer(TEMPLATES_DIR, template=template).render(
        cv,
        section_order=["summary"],
    )
    tex_path = tmp_path / "cv.tex"
    tex_path.write_text(rendered)

    result = subprocess.run(
        ["xelatex", "-interaction=nonstopmode", "cv.tex"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stdout
```

- [ ] **Step 2: Run the focused test slice and verify it fails**

Run: `uv run pytest tests/test_latex_renderer.py -k "legacy_pdftex_input_packages or template_readme_describes_current_xelatex_pipeline or templates_compile_korean_content_with_xelatex" -v`

Expected: FAIL because multiple template files still contain `\usepackage[T1]{fontenc}` and `\usepackage[utf8]{inputenc}`, and `backend/templates/README.md` still documents a pdflatex-only pipeline.

- [ ] **Step 3: Update README and strip the legacy input packages from every affected template**

In each listed template, remove the exact legacy package lines below wherever they appear:

```latex
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
```

For example, `backend/templates/dealbook/cv.tex.j2` should start like this after the cleanup:

```latex
\documentclass[<< font_size >>,a4paper]{article}
<< layout_preamble >>

\usepackage[a4paper,top=15mm,bottom=15mm,left=17mm,right=17mm]{geometry}
\usepackage{lmodern}
\usepackage{xcolor}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{microtype}
<< xelatex_preamble >>
\usepackage{array}
\usepackage{tabularx}
```

Replace the compiler/validation guidance in `backend/templates/README.md` with XeLaTeX-accurate language like this:

```markdown
## Compiler constraints

All templates must compile inside the app's **XeLaTeX** pipeline (`xelatex -interaction=nonstopmode`).

The renderer injects a shared `<< xelatex_preamble >>` block that currently loads XeLaTeX/Hangul support via `fontspec` and `kotex`. Treat that shared preamble as part of the runtime contract when authoring templates.

Allowed packages are the ones that coexist cleanly with the current XeLaTeX path and the pre-installed TeX Live set used by the app. Avoid duplicate input/font encoding declarations such as `inputenc` and `fontenc`.

## Validation

When the server starts, every template is validated in two stages:

1. **Jinja2 render** — rendered against a sample `CVData` object with `StrictUndefined`.
2. **XeLaTeX compilation** — the rendered `.tex` is compiled with `xelatex`. Any LaTeX error fails validation.
```

- [ ] **Step 4: Re-run the focused test slice and verify it passes**

Run: `uv run pytest tests/test_latex_renderer.py -k "legacy_pdftex_input_packages or template_readme_describes_current_xelatex_pipeline or templates_compile_korean_content_with_xelatex" -v`

Expected: PASS.

- [ ] **Step 5: Commit the global cleanup**

```bash
git add tests/test_latex_renderer.py \
  backend/templates/README.md \
  backend/templates/ats-signal/cv.tex.j2 \
  backend/templates/boardroom/cv.tex.j2 \
  backend/templates/chancellor/cv.tex.j2 \
  backend/templates/dealbook/cv.tex.j2 \
  backend/templates/foundry/cv.tex.j2 \
  backend/templates/letterpress/cv.tex.j2 \
  backend/templates/masthead/cv.tex.j2 \
  backend/templates/mono-forge/cv.tex.j2 \
  backend/templates/scholar-index/cv.tex.j2 \
  backend/templates/signature-split/cv.tex.j2 \
  backend/templates/slate-rail/cv.tex.j2 \
  backend/templates/skillboard/cv.tex.j2 \
  backend/templates/studio-pop/cv.tex.j2 \
  backend/templates/trackline/cv.tex.j2
git commit -m "docs: align templates with xelatex runtime"
```

---

### Task 2: Lighten `chancellor` Without Changing Its Visual Family

**Files:**
- Modify: `backend/templates/chancellor/cv.tex.j2`
- Test: `tests/test_latex_renderer.py`

- [ ] **Step 1: Write the failing `chancellor` source-shape regression**

Add this test to `tests/test_latex_renderer.py`:

```python
def test_chancellor_template_drops_unused_tabularx_and_lmodern():
    source = _template_source("chancellor")
    assert r"\usepackage{tabularx}" not in source
    assert r"\usepackage{lmodern}" not in source
```

- [ ] **Step 2: Run the focused `chancellor` regression and verify it fails**

Run: `uv run pytest tests/test_latex_renderer.py -k "chancellor_template_drops_unused_tabularx_and_lmodern or templates_compile_korean_content_with_xelatex" -v`

Expected: FAIL because `backend/templates/chancellor/cv.tex.j2` still imports `tabularx` and `lmodern`.

- [ ] **Step 3: Remove the clearly unused package baggage from `chancellor`**

Update the top package block of `backend/templates/chancellor/cv.tex.j2` to this form:

```latex
\documentclass[<< font_size >>,a4paper]{article}
<< layout_preamble >>

\usepackage[top=1.3cm,bottom=1.5cm,left=1.6cm,right=1.6cm]{geometry}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{titlesec}
\usepackage{microtype}
<< xelatex_preamble >>
\usepackage{xcolor}
\usepackage{array}
```

Do not change the section-title styling, red rule treatment, header layout, or section macro structure in this task.

- [ ] **Step 4: Re-run the focused `chancellor` regression and verify it passes**

Run: `uv run pytest tests/test_latex_renderer.py -k "chancellor_template_drops_unused_tabularx_and_lmodern or templates_compile_korean_content_with_xelatex" -v`

Expected: PASS.

- [ ] **Step 5: Commit the `chancellor` cleanup**

```bash
git add tests/test_latex_renderer.py backend/templates/chancellor/cv.tex.j2
git commit -m "perf: trim chancellor xelatex package overhead"
```

---

### Task 3: Simplify `slate-rail` Main-Column Wrapping While Keeping The Sidebar

**Files:**
- Modify: `backend/templates/slate-rail/cv.tex.j2`
- Test: `tests/test_latex_renderer.py`

- [ ] **Step 1: Write the failing `slate-rail` structure regression**

Add this test to `tests/test_latex_renderer.py`:

```python
def test_slate_rail_main_column_avoids_full_minipage_wrapper():
    source = _template_source("slate-rail")
    assert r"\begin{paracol}{2}" in source
    assert r"\begin{minipage}[t]{\dimexpr\linewidth-\mainGap\relax}" not in source
```

- [ ] **Step 2: Run the focused `slate-rail` regression and verify it fails**

Run: `uv run pytest tests/test_latex_renderer.py -k "slate_rail_main_column_avoids_full_minipage_wrapper or templates_compile_korean_content_with_xelatex" -v`

Expected: FAIL because the right-hand content in `backend/templates/slate-rail/cv.tex.j2` is still wrapped in a full-column `minipage`.

- [ ] **Step 3: Remove the full main-column `minipage` wrapper and keep the content flowing directly in the `paracol` column**

Replace the right-column opening/closing block in `backend/templates/slate-rail/cv.tex.j2` with this direct-flow structure, while keeping the existing `render_section(key)` macro body unchanged:

```latex
\switchcolumn

% =========================
% RIGHT — Main content
% =========================
\hspace*{\mainGap}
\color{cvink}
\raggedright

<% for key in section_order %>
<< render_section(key) >>
<% endfor %>

\end{paracol}
\end{document}
```

Keep the sidebar, `paracol`, and `\AddToShipoutPictureBG` background behavior intact. This task is only about removing the unnecessary full-column wrapper around the main content.

- [ ] **Step 4: Re-run the focused `slate-rail` regression and verify it passes**

Run: `uv run pytest tests/test_latex_renderer.py -k "slate_rail_main_column_avoids_full_minipage_wrapper or templates_compile_korean_content_with_xelatex" -v`

Expected: PASS.

- [ ] **Step 5: Commit the `slate-rail` simplification**

```bash
git add tests/test_latex_renderer.py backend/templates/slate-rail/cv.tex.j2
git commit -m "perf: simplify slate-rail main column flow"
```

---

### Task 4: Replace `trackline`'s Per-Entry TikZ Marker With A Cheaper Text Marker

**Files:**
- Modify: `backend/templates/trackline/cv.tex.j2`
- Test: `tests/test_latex_renderer.py`

- [ ] **Step 1: Write the failing `trackline` marker regression**

Add this test to `tests/test_latex_renderer.py`:

```python
def test_trackline_template_replaces_tikz_marker_with_text_command():
    source = _template_source("trackline")
    assert r"\usepackage{tikz}" not in source
    assert r"\begin{tikzpicture}" not in source
    assert r"\newcommand{\timelinedot}" in source
```

- [ ] **Step 2: Run the focused `trackline` regression and verify it fails**

Run: `uv run pytest tests/test_latex_renderer.py -k "trackline_template_replaces_tikz_marker_with_text_command or templates_compile_korean_content_with_xelatex" -v`

Expected: FAIL because `backend/templates/trackline/cv.tex.j2` still imports `tikz` and builds every dot with `\begin{tikzpicture}`.

- [ ] **Step 3: Remove `tikz` and switch the marker to a simple text command**

Update `backend/templates/trackline/cv.tex.j2` like this:

```latex
\usepackage{array}
\usepackage{parskip}
\usepackage{etoolbox}

\newcommand{\timelinedot}{{\color{cvaccent}\large\textbullet}}

% Timeline entry: date column on left, dot, content on right
\newcommand{\timelineentry}[2]{%
  \noindent\begin{minipage}[t]{0.20\linewidth}\raggedleft
    {\footnotesize\bfseries\color{cvmute}\MakeUppercase{#1}}
  \end{minipage}%
  \hspace{4pt}%
  \begin{minipage}[t]{0.025\linewidth}\centering
    \timelinedot
  \end{minipage}%
  \hspace{4pt}%
  \begin{minipage}[t]{0.72\linewidth}
    #2
  \end{minipage}\par%
}
```

Also delete the exact line below from the package block:

```latex
\usepackage{tikz}
```

Do not change the date rail widths, section ordering logic, or the overall left-rail chronology concept in this task.

- [ ] **Step 4: Re-run the focused `trackline` regression and verify it passes**

Run: `uv run pytest tests/test_latex_renderer.py -k "trackline_template_replaces_tikz_marker_with_text_command or templates_compile_korean_content_with_xelatex" -v`

Expected: PASS.

- [ ] **Step 5: Commit the `trackline` simplification**

```bash
git add tests/test_latex_renderer.py backend/templates/trackline/cv.tex.j2
git commit -m "perf: replace trackline tikz timeline markers"
```

---

### Task 5: Re-Measure And Run The Final Regression Sweep

**Files:**
- Modify: none
- Test: `tests/test_latex_renderer.py`

- [ ] **Step 1: Run the full LaTeX renderer regression suite**

Run: `uv run pytest tests/test_latex_renderer.py -v`

Expected: PASS.

- [ ] **Step 2: Re-run the preview benchmark for the control and targeted templates**

Run:

```bash
uv run python - <<'PY'
import asyncio
import json
import time
from httpx import AsyncClient, ASGITransport
from backend.main import app

RAW = """
personal:
  name: Alice Example
  email: alice@example.com
  phone: +82-10-1234-5678
  location: Seoul, South Korea
  website: alice.dev
  linkedin: linkedin.com/in/alice
  github: github.com/alice
summary: Research engineer focused on ML systems, product delivery, and developer tooling.
experience:
  - title: Senior ML Engineer
    company: Example AI
    start_date: "2023"
    end_date: Present
    location: Seoul
    highlights:
      - Led model serving platform improvements for multiple internal products.
      - Reduced inference costs by 28 percent while improving tail latency.
      - Built internal evaluation workflow for prompt and retrieval experiments.
education:
  - degree: B.S. in Computer Science
    institution: Example University
    year: "2020"
skills:
  - category: Languages
    items: [Python, TypeScript, SQL, Go]
projects:
  - name: Preview Pipeline
    description: Faster resume preview architecture with stale request suppression.
"""

TEMPLATES = ["classic", "chancellor", "slate-rail", "trackline"]

async def main():
    rows = []
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for template in TEMPLATES:
            samples = []
            for _ in range(2):
                start = time.perf_counter()
                resp = await client.post("/api/preview/pdf", json={"yaml": RAW, "template": template})
                elapsed = (time.perf_counter() - start) * 1000
                assert resp.status_code == 200, (template, resp.status_code, resp.text[:200])
                samples.append(round(elapsed, 1))
            rows.append({"template": template, "samples_ms": samples, "avg_ms": round(sum(samples) / len(samples), 1)})
    print(json.dumps(rows, ensure_ascii=False, indent=2))

asyncio.run(main())
PY
```

Expected: `classic` stays roughly in the same range as before, and `chancellor`, `slate-rail`, and `trackline` all stay at or below their previous baselines (`7.68 s`, `5.14 s`, `5.22 s` average respectively).

- [ ] **Step 3: If any targeted template regresses, stop and fix before declaring success**

Use this decision rule:

```text
If the benchmark shows chancellor > 7.68 s average, slate-rail > 5.14 s average, or trackline > 5.22 s average, do not ship. Go back to the most recent template task and reduce the new overhead before continuing.
```

- [ ] **Step 4: Record the final tree state**

Run: `git status --short`

Expected: clean working tree after the Task 1-4 commits.
