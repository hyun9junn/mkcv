# Auto Layout Adjustment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three Jinja2 filters to `LaTeXRenderer` that automatically apply conservative LaTeX size reductions to long names, titles, degrees, and project names across all 11 templates — with zero effect on normal-length content.

**Architecture:** A new `_make_jinja_filters()` function in `backend/renderers/latex.py` returns `name_size`, `name_fontsize`, and `shrink_if_long` filters. These are registered on the Jinja2 environment inside `LaTeXRenderer.render()`. Each of the 11 templates gets surgical filter annotations on 3–4 known danger-zone fields only (name header, job title row, education degree row, project name row).

**Tech Stack:** Python, Jinja2, LaTeX (pdflatex), pytest

---

## File Map

**Modified:**
- `backend/renderers/latex.py` — add `_make_jinja_filters()` + register in `render()`
- `tests/test_latex_renderer.py` — unit tests for filters + integration tests
- `backend/templates/classic/cv.tex.j2` — 4 danger-zone annotations
- `backend/templates/heritage/cv.tex.j2` — 4 danger-zone annotations
- `backend/templates/column-skills/cv.tex.j2` — 4 danger-zone annotations
- `backend/templates/academic-research/cv.tex.j2` — 4 danger-zone annotations
- `backend/templates/executive-corporate/cv.tex.j2` — 4 danger-zone annotations
- `backend/templates/modern-startup/cv.tex.j2` — 4 danger-zone annotations
- `backend/templates/banking/cv.tex.j2` — 3 danger-zone annotations (no name change)
- `backend/templates/hipster/cv.tex.j2` — 3 danger-zone annotations (no name change)
- `backend/templates/resume-tech/cv.tex.j2` — 3 danger-zone annotations (no name change)
- `backend/templates/sidebar-minimal/cv.tex.j2` — 3 danger-zone annotations (no name change)
- `backend/templates/sidebar-portrait/cv.tex.j2` — 3 danger-zone annotations (no name change)

**Name header skipped** for banking, resume-tech, hipster, sidebar-minimal, sidebar-portrait — they already start at `\LARGE` or `\large`, which is conservative enough.

---

## Task 1: Add `_make_jinja_filters()` to the renderer

**Files:**
- Modify: `backend/renderers/latex.py`
- Test: `tests/test_latex_renderer.py`

- [ ] **Step 1: Write the failing unit tests**

Add to `tests/test_latex_renderer.py`:

```python
from backend.renderers.latex import _make_jinja_filters


def test_name_size_short():
    f = _make_jinja_filters()
    # "Jane Smith" = 10 chars → ≤ 22 → Huge
    assert f['name_size']('Jane Smith') == r'\Huge\bfseries'


def test_name_size_medium():
    f = _make_jinja_filters()
    # "Alexander James Thompson" = 24 chars → 23-30 → LARGE
    assert f['name_size']('Alexander James Thompson') == r'\LARGE\bfseries'


def test_name_size_long():
    f = _make_jinja_filters()
    # "Alexander James Montgomery-Williams" = 35 chars → > 30 → Large
    assert f['name_size']('Alexander James Montgomery-Williams') == r'\Large\bfseries'


def test_name_fontsize_short():
    f = _make_jinja_filters()
    result = f['name_fontsize']('Jane Smith', 26.0, 1.15)
    assert r'\fontsize{26pt}' in result
    assert r'\selectfont' in result


def test_name_fontsize_medium():
    f = _make_jinja_filters()
    # 24 chars → normal_pt - 3 = 23
    result = f['name_fontsize']('Alexander James Thompson', 26.0, 1.15)
    assert r'\fontsize{23pt}' in result


def test_name_fontsize_long():
    f = _make_jinja_filters()
    # 35 chars → normal_pt - 5 = 21
    result = f['name_fontsize']('Alexander James Montgomery-Williams', 26.0, 1.15)
    assert r'\fontsize{21pt}' in result


def test_name_fontsize_preserves_ratio():
    f = _make_jinja_filters()
    # academic-research: 22pt base, 1.18 ratio → short name → 22pt/26pt (same as original)
    result = f['name_fontsize']('Jane Smith', 22.0, 1.18)
    assert r'\fontsize{22pt}{26pt}\selectfont' == result


def test_shrink_if_long_short():
    f = _make_jinja_filters()
    assert f['shrink_if_long']('Software Engineer', 48) == ''


def test_shrink_if_long_over_threshold():
    f = _make_jinja_filters()
    long_title = 'Principal Machine Learning Infrastructure Engineering Lead'
    assert f['shrink_if_long'](long_title, 48) == r'\small '


def test_shrink_if_long_default_threshold():
    f = _make_jinja_filters()
    # Exactly at 48 chars — not over
    assert f['shrink_if_long']('A' * 48, 48) == ''
    # One over
    assert f['shrink_if_long']('A' * 49, 48) == r'\small '
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pytest tests/test_latex_renderer.py -k "test_name_size or test_name_fontsize or test_shrink_if_long" -v
```

Expected: FAIL — `ImportError: cannot import name '_make_jinja_filters'`

- [ ] **Step 3: Add `_make_jinja_filters()` to `backend/renderers/latex.py`**

Insert the following function after the `_build_layout_preamble` function (before the `LaTeXRenderer` class):

```python
def _make_jinja_filters() -> dict:
    def name_size(name: str) -> str:
        n = len(name.strip())
        if n <= 22:
            return r'\Huge\bfseries'
        if n <= 30:
            return r'\LARGE\bfseries'
        return r'\Large\bfseries'

    def name_fontsize(name: str, normal_pt: float = 26.0, skip_ratio: float = 1.15) -> str:
        n = len(name.strip())
        if n <= 22:
            pt = normal_pt
        elif n <= 30:
            pt = normal_pt - 3
        else:
            pt = normal_pt - 5
        skip = round(pt * skip_ratio, 1)
        return rf'\fontsize{{{pt:g}pt}}{{{skip:g}pt}}\selectfont'

    def shrink_if_long(text: str, threshold: int = 48) -> str:
        return r'\small ' if len(text.strip()) > threshold else ''

    return {
        'name_size': name_size,
        'name_fontsize': name_fontsize,
        'shrink_if_long': shrink_if_long,
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pytest tests/test_latex_renderer.py -k "test_name_size or test_name_fontsize or test_shrink_if_long" -v
```

Expected: all 11 new tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/renderers/latex.py tests/test_latex_renderer.py
git commit -m "feat: add _make_jinja_filters() with name_size, name_fontsize, shrink_if_long"
```

---

## Task 2: Register filters in `LaTeXRenderer.render()`

**Files:**
- Modify: `backend/renderers/latex.py`
- Test: `tests/test_latex_renderer.py`

- [ ] **Step 1: Write a failing integration test**

Add to `tests/test_latex_renderer.py`:

```python
def test_filters_available_in_template(tmp_path, minimal_cv):
    # "Alice" = 5 chars → name_size returns \Huge\bfseries
    tmpl_dir = tmp_path / "mini"
    tmpl_dir.mkdir()
    (tmpl_dir / "cv.tex.j2").write_text(
        "\\documentclass[<< font_size >>]{article}\n"
        "<< layout_preamble >>\n"
        "\\begin{document}\n"
        "<< cv.personal.name | name_size >>\n"
        "<< cv.personal.name | shrink_if_long(3) >>\n"
        "\\end{document}"
    )
    renderer = LaTeXRenderer(tmp_path, template="mini")
    result = renderer.render(minimal_cv)
    assert r'\Huge\bfseries' in result   # name_size filter worked
    assert r'\small ' in result           # shrink_if_long(3) triggered (Alice=5>3)
```

- [ ] **Step 2: Run to verify it fails**

```bash
pytest tests/test_latex_renderer.py::test_filters_available_in_template -v
```

Expected: FAIL — `jinja2.exceptions.FilterError: No filter named 'name_size'`

- [ ] **Step 3: Register filters in `LaTeXRenderer.render()`**

In `backend/renderers/latex.py`, inside `LaTeXRenderer.render()`, add `env.filters.update(_make_jinja_filters())` immediately after the `env = jinja2.Environment(...)` block:

```python
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
        env.filters.update(_make_jinja_filters())
        order = section_order if section_order else DEFAULT_SECTION_ORDER
        custom_by_key = {cs.key: cs for cs in cv.custom_sections}
        font_size = _FONT_SIZE.get(self.font_scale, _FONT_SIZE["normal"])
        layout_preamble = _build_layout_preamble(self.density)
        return env.get_template("cv.tex.j2").render(
            cv=cv,
            section_order=order,
            custom_by_key=custom_by_key,
            font_size=font_size,
            layout_preamble=layout_preamble,
        )
```

- [ ] **Step 4: Run to verify it passes**

```bash
pytest tests/test_latex_renderer.py::test_filters_available_in_template -v
```

Expected: PASS

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
pytest tests/test_latex_renderer.py -v
```

Expected: all existing tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/renderers/latex.py tests/test_latex_renderer.py
git commit -m "feat: register Jinja2 layout filters in LaTeXRenderer.render()"
```

---

## Task 3: Apply `name_size` to classic, heritage, column-skills name headers

**Files:**
- Modify: `backend/templates/classic/cv.tex.j2:23`
- Modify: `backend/templates/heritage/cv.tex.j2:37`
- Modify: `backend/templates/column-skills/cv.tex.j2:63`
- Test: `tests/test_latex_renderer.py`

- [ ] **Step 1: Write the failing integration tests**

Add to `tests/test_latex_renderer.py`:

```python
def test_classic_long_name_steps_down():
    from backend.models import CVData, PersonalInfo
    cv = CVData(personal=PersonalInfo(
        name="Alexander James Montgomery-Williams",  # 35 chars → Large
        email="a@example.com",
    ))
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(cv)
    assert r'\Large\bfseries' in output


def test_classic_short_name_stays_huge():
    from backend.models import CVData, PersonalInfo
    cv = CVData(personal=PersonalInfo(name="Jane Smith", email="j@example.com"))
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(cv)
    assert r'\Huge\bfseries' in output
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_latex_renderer.py -k "test_classic_long_name or test_classic_short_name_stays" -v
```

Expected: FAIL — `\Large\bfseries` not found (template still hardcodes `\Huge\bfseries`)

- [ ] **Step 3: Edit `backend/templates/classic/cv.tex.j2` line 23**

Old:
```
    {\Huge\bfseries << cv.personal.name >>}\\[6pt]
```
New:
```
    {<< cv.personal.name | name_size >> << cv.personal.name >>}\\[6pt]
```

- [ ] **Step 4: Edit `backend/templates/heritage/cv.tex.j2` line 37**

Old:
```
    {\Huge\bfseries << cv.personal.name >>}\\[4pt]
```
New:
```
    {<< cv.personal.name | name_size >> << cv.personal.name >>}\\[4pt]
```

- [ ] **Step 5: Edit `backend/templates/column-skills/cv.tex.j2` line 63**

Old:
```
{\Huge\bfseries\color{cvaccent} << cv.personal.name >>}\\[5pt]
```
New:
```
{<< cv.personal.name | name_size >>\color{cvaccent} << cv.personal.name >>}\\[5pt]
```

- [ ] **Step 6: Run the new tests**

```bash
pytest tests/test_latex_renderer.py -k "test_classic_long_name or test_classic_short_name_stays" -v
```

Expected: both PASS

- [ ] **Step 7: Run full test suite**

```bash
pytest tests/test_latex_renderer.py -v
```

Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add backend/templates/classic/cv.tex.j2 backend/templates/heritage/cv.tex.j2 backend/templates/column-skills/cv.tex.j2 tests/test_latex_renderer.py
git commit -m "feat: apply name_size filter to classic, heritage, column-skills name headers"
```

---

## Task 4: Apply `name_fontsize` to academic-research, executive-corporate, modern-startup

**Files:**
- Modify: `backend/templates/academic-research/cv.tex.j2:56`
- Modify: `backend/templates/executive-corporate/cv.tex.j2:59`
- Modify: `backend/templates/modern-startup/cv.tex.j2:60`
- Test: `tests/test_latex_renderer.py`

- [ ] **Step 1: Write the failing integration tests**

Add to `tests/test_latex_renderer.py`:

```python
def test_modern_startup_long_name_steps_down():
    from backend.models import CVData, PersonalInfo
    cv = CVData(personal=PersonalInfo(
        name="Alexander James Montgomery-Williams",  # 35 chars → 26-5=21pt
        email="a@example.com",
    ))
    output = LaTeXRenderer(TEMPLATES_DIR, template="modern-startup").render(cv)
    assert r'\fontsize{21pt}' in output


def test_modern_startup_short_name_stays_26pt():
    from backend.models import CVData, PersonalInfo
    cv = CVData(personal=PersonalInfo(name="Jane Smith", email="j@example.com"))
    output = LaTeXRenderer(TEMPLATES_DIR, template="modern-startup").render(cv)
    assert r'\fontsize{26pt}' in output
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_latex_renderer.py -k "test_modern_startup_long_name or test_modern_startup_short" -v
```

Expected: FAIL — `\fontsize{21pt}` not found (template hardcodes `\fontsize{26pt}{30pt}`)

- [ ] **Step 3: Edit `backend/templates/academic-research/cv.tex.j2` line 56**

Old:
```
    {\fontsize{22pt}{26pt}\selectfont\scshape << cv.personal.name >>}\\[4pt]
```
New:
```
    {<< cv.personal.name | name_fontsize(22, 1.18) >>\scshape << cv.personal.name >>}\\[4pt]
```

- [ ] **Step 4: Edit `backend/templates/executive-corporate/cv.tex.j2` line 59**

Old:
```
    {\fontsize{22pt}{24pt}\selectfont << cv.personal.name >>}\\[2pt]
```
New:
```
    {<< cv.personal.name | name_fontsize(22, 1.09) >> << cv.personal.name >>}\\[2pt]
```

- [ ] **Step 5: Edit `backend/templates/modern-startup/cv.tex.j2` line 60**

Old:
```
    {\ebgaramond\fontsize{26pt}{30pt}\selectfont << cv.personal.name >>}\\[6pt]
```
New:
```
    {\ebgaramond<< cv.personal.name | name_fontsize(26, 1.15) >> << cv.personal.name >>}\\[6pt]
```

- [ ] **Step 6: Run the new tests**

```bash
pytest tests/test_latex_renderer.py -k "test_modern_startup_long_name or test_modern_startup_short" -v
```

Expected: both PASS

- [ ] **Step 7: Run full test suite**

```bash
pytest tests/test_latex_renderer.py -v
```

Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add backend/templates/academic-research/cv.tex.j2 backend/templates/executive-corporate/cv.tex.j2 backend/templates/modern-startup/cv.tex.j2 tests/test_latex_renderer.py
git commit -m "feat: apply name_fontsize filter to academic-research, executive-corporate, modern-startup"
```

---

## Task 5: Apply `shrink_if_long` to classic and heritage one-liner fields

**Files:**
- Modify: `backend/templates/classic/cv.tex.j2:51,67,83`
- Modify: `backend/templates/heritage/cv.tex.j2:67,82,105`
- Test: `tests/test_latex_renderer.py`

- [ ] **Step 1: Write the failing integration tests**

Add to `tests/test_latex_renderer.py`:

```python
def test_classic_long_job_title_triggers_shrink():
    from backend.models import CVData, PersonalInfo, ExperienceItem
    cv = CVData(
        personal=PersonalInfo(name="Jane Smith", email="j@example.com"),
        experience=[ExperienceItem(
            title="Principal Machine Learning Infrastructure Engineering Lead",  # 57 chars
            company="Acme Corp",
            start_date="2020",
        )],
    )
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(cv)
    assert r'\small' in output


def test_classic_short_job_title_no_shrink():
    from backend.models import CVData, PersonalInfo, ExperienceItem
    cv = CVData(
        personal=PersonalInfo(name="Jane Smith", email="j@example.com"),
        experience=[ExperienceItem(
            title="Software Engineer",
            company="Acme Corp",
            start_date="2020",
        )],
    )
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(cv)
    assert r'\small' not in output
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_latex_renderer.py -k "test_classic_long_job or test_classic_short_job" -v
```

Expected: FAIL — `\small` not found (template doesn't apply the filter yet)

- [ ] **Step 3: Edit `backend/templates/classic/cv.tex.j2` line 51 (job.title)**

Old:
```
\textbf{<< job.title >>} \hfill << job.start_date >> -- << job.end_date if job.end_date else "Present" >>\\
```
New:
```
{<< job.title | shrink_if_long(48) >>\textbf{<< job.title >>}} \hfill << job.start_date >> -- << job.end_date if job.end_date else "Present" >>\\
```

- [ ] **Step 4: Edit `backend/templates/classic/cv.tex.j2` line 67 (edu.degree)**

Old:
```
\textbf{<< edu.degree >>} \hfill <% if edu.year %><< edu.year >><% elif edu.start_date %><< edu.start_date >> -- << edu.end_date if edu.end_date else "Present" >><% endif %>\\
```
New:
```
{<< edu.degree | shrink_if_long(48) >>\textbf{<< edu.degree >>}} \hfill <% if edu.year %><< edu.year >><% elif edu.start_date %><< edu.start_date >> -- << edu.end_date if edu.end_date else "Present" >><% endif %>\\
```

- [ ] **Step 5: Edit `backend/templates/classic/cv.tex.j2` line 83 (proj.name)**

Old:
```
\textbf{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>} --- << proj.description >>
```
New:
```
{<< proj.name | shrink_if_long(40) >>\textbf{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>}} --- << proj.description >>
```

- [ ] **Step 6: Edit `backend/templates/heritage/cv.tex.j2` line 67 (job.title)**

Old:
```
\textbf{<< job.title >>} \hfill << job.start_date >> -- << job.end_date if job.end_date else "Present" >>\\
```
New:
```
{<< job.title | shrink_if_long(48) >>\textbf{<< job.title >>}} \hfill << job.start_date >> -- << job.end_date if job.end_date else "Present" >>\\
```

- [ ] **Step 7: Edit `backend/templates/heritage/cv.tex.j2` line 82 (edu.degree)**

Old:
```
\textbf{<< edu.degree >>} \hfill
```
New:
```
{<< edu.degree | shrink_if_long(48) >>\textbf{<< edu.degree >>}} \hfill
```

- [ ] **Step 8: Edit `backend/templates/heritage/cv.tex.j2` line 105 (proj.name)**

Old:
```
\textbf{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>}
```
New:
```
{<< proj.name | shrink_if_long(40) >>\textbf{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>}}
```

- [ ] **Step 9: Run the new tests**

```bash
pytest tests/test_latex_renderer.py -k "test_classic_long_job or test_classic_short_job" -v
```

Expected: both PASS

- [ ] **Step 10: Run full test suite**

```bash
pytest tests/test_latex_renderer.py -v
```

Expected: all PASS

- [ ] **Step 11: Commit**

```bash
git add backend/templates/classic/cv.tex.j2 backend/templates/heritage/cv.tex.j2 tests/test_latex_renderer.py
git commit -m "feat: apply shrink_if_long to classic and heritage one-liner fields"
```

---

## Task 6: Apply `shrink_if_long` to banking, column-skills, executive-corporate

**Files:**
- Modify: `backend/templates/banking/cv.tex.j2:92,109,126`
- Modify: `backend/templates/column-skills/cv.tex.j2:90,106,115`
- Modify: `backend/templates/executive-corporate/cv.tex.j2:85,100,117`

- [ ] **Step 1: Edit `backend/templates/banking/cv.tex.j2` line 92 (job.title)**

Old:
```
  \cvrole{<< job.title >>}, \cvorg{<< job.company >>}<% if job.location %> \hfill \cvdate{<< job.location >>}<% endif %>
```
New:
```
  {<< job.title | shrink_if_long(48) >>\cvrole{<< job.title >>}}, \cvorg{<< job.company >>}<% if job.location %> \hfill \cvdate{<< job.location >>}<% endif %>
```

- [ ] **Step 2: Edit `backend/templates/banking/cv.tex.j2` line 109 (edu.degree)**

Old:
```
  \cvrole{<< edu.degree >>}, \cvorg{<< edu.institution >>}<% if edu.gpa %> \hfill \cvdate{GPA: << edu.gpa >>}<% endif %>
```
New:
```
  {<< edu.degree | shrink_if_long(48) >>\cvrole{<< edu.degree >>}}, \cvorg{<< edu.institution >>}<% if edu.gpa %> \hfill \cvdate{GPA: << edu.gpa >>}<% endif %>
```

- [ ] **Step 3: Edit `backend/templates/banking/cv.tex.j2` line 126 (proj.name)**

Old:
```
  \cvrole{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>} --- \cvorg{<< proj.description >>}
```
New:
```
  {<< proj.name | shrink_if_long(40) >>\cvrole{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>}} --- \cvorg{<< proj.description >>}
```

- [ ] **Step 4: Edit `backend/templates/column-skills/cv.tex.j2` line 90 (job.title)**

Old:
```
\cvrole{<< job.title >>} \hfill \cvdate{<< job.start_date >> -- << job.end_date if job.end_date else "Present" >>}\\
```
New:
```
{<< job.title | shrink_if_long(48) >>\cvrole{<< job.title >>}} \hfill \cvdate{<< job.start_date >> -- << job.end_date if job.end_date else "Present" >>}\\
```

- [ ] **Step 5: Edit `backend/templates/column-skills/cv.tex.j2` line 106 (edu.degree)**

Old:
```
\cvrole{<< edu.degree >>} \hfill \cvdate{<% if edu.year %><< edu.year >><% elif edu.start_date %><< edu.start_date >> -- << edu.end_date if edu.end_date else "Present" >><% endif %>}\\
```
New:
```
{<< edu.degree | shrink_if_long(48) >>\cvrole{<< edu.degree >>}} \hfill \cvdate{<% if edu.year %><< edu.year >><% elif edu.start_date %><< edu.start_date >> -- << edu.end_date if edu.end_date else "Present" >><% endif %>}\\
```

- [ ] **Step 6: Edit `backend/templates/column-skills/cv.tex.j2` line 115 (proj.name)**

Old:
```
\cvrole{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>} --- \cvorg{<< proj.description >>}
```
New:
```
{<< proj.name | shrink_if_long(40) >>\cvrole{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>}} --- \cvorg{<< proj.description >>}
```

- [ ] **Step 7: Edit `backend/templates/executive-corporate/cv.tex.j2` line 85 (job.title)**

Note: threshold 40 here because title + company + date are all on one line.

Old:
```
\cvrole{<< job.title >>} --- \cvorg{<< job.company >>} \hfill \cvdate{<< job.start_date >> -- << job.end_date if job.end_date else "Present" >>}
```
New:
```
{<< job.title | shrink_if_long(40) >>\cvrole{<< job.title >>}} --- \cvorg{<< job.company >>} \hfill \cvdate{<< job.start_date >> -- << job.end_date if job.end_date else "Present" >>}
```

- [ ] **Step 8: Edit `backend/templates/executive-corporate/cv.tex.j2` line 100 (edu.degree)**

Note: same threshold 40 — degree + institution + date all on one line.

Old:
```
\cvrole{<< edu.degree >>} --- \cvorg{<< edu.institution >>} \hfill \cvdate{<% if edu.year %><< edu.year >><% elif edu.start_date %><< edu.start_date >> -- << edu.end_date if edu.end_date else "Present" >><% endif %>}<% if edu.gpa %> \quad GPA: << edu.gpa >><% endif %>\\
```
New:
```
{<< edu.degree | shrink_if_long(40) >>\cvrole{<< edu.degree >>}} --- \cvorg{<< edu.institution >>} \hfill \cvdate{<% if edu.year %><< edu.year >><% elif edu.start_date %><< edu.start_date >> -- << edu.end_date if edu.end_date else "Present" >><% endif %>}<% if edu.gpa %> \quad GPA: << edu.gpa >><% endif %>\\
```

- [ ] **Step 9: Edit `backend/templates/executive-corporate/cv.tex.j2` line 117 (proj.name)**

Old:
```
\cvrole{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>} --- \cvorg{<< proj.description >>}
```
New:
```
{<< proj.name | shrink_if_long(40) >>\cvrole{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>}} --- \cvorg{<< proj.description >>}
```

- [ ] **Step 10: Run full test suite**

```bash
pytest tests/test_latex_renderer.py -v
```

Expected: all PASS

- [ ] **Step 11: Commit**

```bash
git add backend/templates/banking/cv.tex.j2 backend/templates/column-skills/cv.tex.j2 backend/templates/executive-corporate/cv.tex.j2
git commit -m "feat: apply shrink_if_long to banking, column-skills, executive-corporate one-liner fields"
```

---

## Task 7: Apply `shrink_if_long` to academic-research, hipster, modern-startup

**Files:**
- Modify: `backend/templates/academic-research/cv.tex.j2:87,96,122`
- Modify: `backend/templates/hipster/cv.tex.j2:170,186,195`
- Modify: `backend/templates/modern-startup/cv.tex.j2:90,106,124`

- [ ] **Step 1: Edit `backend/templates/academic-research/cv.tex.j2` line 87 (edu.degree)**

Old:
```
\cvorg{<< edu.degree >>}<% if edu.gpa %> \hfill \cvdate{GPA: << edu.gpa >>}<% endif %>
```
New:
```
{<< edu.degree | shrink_if_long(48) >>\cvorg{<< edu.degree >>}}<% if edu.gpa %> \hfill \cvdate{GPA: << edu.gpa >>}<% endif %>
```

- [ ] **Step 2: Edit `backend/templates/academic-research/cv.tex.j2` line 96 (job.title)**

Old:
```
\cvorg{<< job.title >>}
```
New:
```
{<< job.title | shrink_if_long(48) >>\cvorg{<< job.title >>}}
```

- [ ] **Step 3: Edit `backend/templates/academic-research/cv.tex.j2` line 122 (proj.name)**

Old:
```
\cvrole{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>} --- \cvorg{<< proj.description >>}
```
New:
```
{<< proj.name | shrink_if_long(40) >>\cvrole{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>}} --- \cvorg{<< proj.description >>}
```

- [ ] **Step 4: Edit `backend/templates/hipster/cv.tex.j2` line 170 (job.title)**

Old:
```
\cvrole{<< job.title >>} \hfill \cvdate{<< job.start_date >> -- << job.end_date if job.end_date else "Present" >>}\\
```
New:
```
{<< job.title | shrink_if_long(48) >>\cvrole{<< job.title >>}} \hfill \cvdate{<< job.start_date >> -- << job.end_date if job.end_date else "Present" >>}\\
```

- [ ] **Step 5: Edit `backend/templates/hipster/cv.tex.j2` line 186 (edu.degree)**

Old:
```
\cvrole{<< edu.degree >>} \hfill \cvdate{<% if edu.year %><< edu.year >><% elif edu.start_date %><< edu.start_date >> -- << edu.end_date if edu.end_date else "Present" >><% endif %>}\\
```
New:
```
{<< edu.degree | shrink_if_long(48) >>\cvrole{<< edu.degree >>}} \hfill \cvdate{<% if edu.year %><< edu.year >><% elif edu.start_date %><< edu.start_date >> -- << edu.end_date if edu.end_date else "Present" >><% endif %>}\\
```

- [ ] **Step 6: Edit `backend/templates/hipster/cv.tex.j2` line 195 (proj.name)**

Old:
```
\cvrole{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>} --- \cvorg{<< proj.description >>}
```
New:
```
{<< proj.name | shrink_if_long(40) >>\cvrole{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>}} --- \cvorg{<< proj.description >>}
```

- [ ] **Step 7: Edit `backend/templates/modern-startup/cv.tex.j2` line 90 (job.title)**

Old:
```
\cvrole{<< job.title >>} \hfill \cvdate{<< job.start_date >> -- << job.end_date if job.end_date else "Present" >>}\\
```
New:
```
{<< job.title | shrink_if_long(48) >>\cvrole{<< job.title >>}} \hfill \cvdate{<< job.start_date >> -- << job.end_date if job.end_date else "Present" >>}\\
```

- [ ] **Step 8: Edit `backend/templates/modern-startup/cv.tex.j2` line 106 (edu.degree)**

Old:
```
\cvrole{<< edu.degree >>} \hfill \cvdate{<% if edu.year %><< edu.year >><% elif edu.start_date %><< edu.start_date >> -- << edu.end_date if edu.end_date else "Present" >><% endif %>}\\
```
New:
```
{<< edu.degree | shrink_if_long(48) >>\cvrole{<< edu.degree >>}} \hfill \cvdate{<% if edu.year %><< edu.year >><% elif edu.start_date %><< edu.start_date >> -- << edu.end_date if edu.end_date else "Present" >><% endif %>}\\
```

- [ ] **Step 9: Edit `backend/templates/modern-startup/cv.tex.j2` line 124 (proj.name)**

Old:
```
\cvrole{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>} \hfill \cvdate{<% if proj.url %><< proj.url >><% endif %>}\\
```
New:
```
{<< proj.name | shrink_if_long(40) >>\cvrole{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>}} \hfill \cvdate{<% if proj.url %><< proj.url >><% endif %>}\\
```

- [ ] **Step 10: Run full test suite**

```bash
pytest tests/test_latex_renderer.py -v
```

Expected: all PASS

- [ ] **Step 11: Commit**

```bash
git add backend/templates/academic-research/cv.tex.j2 backend/templates/hipster/cv.tex.j2 backend/templates/modern-startup/cv.tex.j2
git commit -m "feat: apply shrink_if_long to academic-research, hipster, modern-startup one-liner fields"
```

---

## Task 8: Apply `shrink_if_long` to resume-tech, sidebar-minimal, sidebar-portrait

**Files:**
- Modify: `backend/templates/resume-tech/cv.tex.j2:71,87,102`
- Modify: `backend/templates/sidebar-minimal/cv.tex.j2:130,146,164`
- Modify: `backend/templates/sidebar-portrait/cv.tex.j2:145,161,179`

- [ ] **Step 1: Edit `backend/templates/resume-tech/cv.tex.j2` line 71 (job.title)**

Old:
```
\cvorg{<< job.title >>}<% if job.location %> \hfill \cvdate{<< job.location >>}<% endif %>
```
New:
```
{<< job.title | shrink_if_long(48) >>\cvorg{<< job.title >>}}<% if job.location %> \hfill \cvdate{<< job.location >>}<% endif %>
```

- [ ] **Step 2: Edit `backend/templates/resume-tech/cv.tex.j2` line 87 (edu.degree)**

Old:
```
\cvorg{<< edu.degree >>}<% if edu.gpa %> \hfill \cvdate{GPA: << edu.gpa >>}<% endif %>
```
New:
```
{<< edu.degree | shrink_if_long(48) >>\cvorg{<< edu.degree >>}}<% if edu.gpa %> \hfill \cvdate{GPA: << edu.gpa >>}<% endif %>
```

- [ ] **Step 3: Edit `backend/templates/resume-tech/cv.tex.j2` line 102 (proj.name)**

Old:
```
\noindent\cvrole{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>} --- \cvorg{<< proj.description >>}
```
New:
```
\noindent{<< proj.name | shrink_if_long(40) >>\cvrole{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>}} --- \cvorg{<< proj.description >>}
```

- [ ] **Step 4: Edit `backend/templates/sidebar-minimal/cv.tex.j2` line 130 (job.title)**

Old:
```
\cvrole{<< job.title >>} \hfill \cvdate{<< job.start_date >> -- << job.end_date if job.end_date else "Present" >>}\\
```
New:
```
{<< job.title | shrink_if_long(48) >>\cvrole{<< job.title >>}} \hfill \cvdate{<< job.start_date >> -- << job.end_date if job.end_date else "Present" >>}\\
```

- [ ] **Step 5: Edit `backend/templates/sidebar-minimal/cv.tex.j2` line 146 (edu.degree)**

Old:
```
\cvrole{<< edu.degree >>} \hfill \cvdate{<% if edu.year %><< edu.year >><% elif edu.start_date %><< edu.start_date >> -- << edu.end_date if edu.end_date else "Present" >><% endif %>}\\
```
New:
```
{<< edu.degree | shrink_if_long(48) >>\cvrole{<< edu.degree >>}} \hfill \cvdate{<% if edu.year %><< edu.year >><% elif edu.start_date %><< edu.start_date >> -- << edu.end_date if edu.end_date else "Present" >><% endif %>}\\
```

- [ ] **Step 6: Edit `backend/templates/sidebar-minimal/cv.tex.j2` line 164 (proj.name)**

Old:
```
\cvrole{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>} --- \cvorg{<< proj.description >>}
```
New:
```
{<< proj.name | shrink_if_long(40) >>\cvrole{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>}} --- \cvorg{<< proj.description >>}
```

- [ ] **Step 7: Edit `backend/templates/sidebar-portrait/cv.tex.j2` line 145 (job.title)**

Old:
```
\cvrole{<< job.title >>} \hfill \cvdate{<< job.start_date >> -- << job.end_date if job.end_date else "Present" >>}\\
```
New:
```
{<< job.title | shrink_if_long(48) >>\cvrole{<< job.title >>}} \hfill \cvdate{<< job.start_date >> -- << job.end_date if job.end_date else "Present" >>}\\
```

- [ ] **Step 8: Edit `backend/templates/sidebar-portrait/cv.tex.j2` line 161 (edu.degree)**

Old:
```
\cvrole{<< edu.degree >>} \hfill \cvdate{<% if edu.year %><< edu.year >><% elif edu.start_date %><< edu.start_date >> -- << edu.end_date if edu.end_date else "Present" >><% endif %>}\\
```
New:
```
{<< edu.degree | shrink_if_long(48) >>\cvrole{<< edu.degree >>}} \hfill \cvdate{<% if edu.year %><< edu.year >><% elif edu.start_date %><< edu.start_date >> -- << edu.end_date if edu.end_date else "Present" >><% endif %>}\\
```

- [ ] **Step 9: Edit `backend/templates/sidebar-portrait/cv.tex.j2` line 179 (proj.name)**

Old:
```
\cvrole{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>} --- \cvorg{<< proj.description >>}
```
New:
```
{<< proj.name | shrink_if_long(40) >>\cvrole{<% if proj.url %>\href{https://<< proj.url >>}{<< proj.name >>}<% else %><< proj.name >><% endif %>}} --- \cvorg{<< proj.description >>}
```

- [ ] **Step 10: Run full test suite**

```bash
pytest tests/test_latex_renderer.py -v
```

Expected: all PASS

- [ ] **Step 11: Commit**

```bash
git add backend/templates/resume-tech/cv.tex.j2 backend/templates/sidebar-minimal/cv.tex.j2 backend/templates/sidebar-portrait/cv.tex.j2
git commit -m "feat: apply shrink_if_long to resume-tech, sidebar-minimal, sidebar-portrait one-liner fields"
```
