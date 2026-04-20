# mkcv Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PDF preview, new CV sections (Awards/Extracurricular), dynamic section toggle, local file sync, and template validation to the mkcv web app.

**Architecture:** The backend (FastAPI + Pydantic + Jinja2) gains new endpoints for PDF preview, file I/O, and template validation. The frontend replaces its Markdown preview pane with a PDF iframe and adds two new vanilla-JS modules (file-sync.js, sections.js). All changes are additive to the existing modular structure.

**Tech Stack:** Python/FastAPI, Pydantic v2, Jinja2, PyYAML, pdflatex, vanilla JS (CodeMirror 5, js-yaml CDN), httpx + pytest-asyncio for tests

---

## File Map

### Modified
- `backend/models.py` — add `AwardItem`, `ExtracurricularItem`; extend `PersonalInfo`, `CVData`
- `backend/main.py` — add `/api/preview/pdf`, `/api/file` (GET/POST), `/api/templates/{name}/validate`; update `/api/templates` response; add lifespan startup validation
- `backend/renderers/markdown.py` — add Awards + Extracurricular sections
- `backend/templates/classic/cv.tex.j2` — add Awards + Extracurricular LaTeX blocks
- `frontend/preview.js` — rewrite: Markdown → PDF iframe
- `frontend/editor-adapter.js` — add `setValue()` method
- `frontend/templates.js` — read validation status, mark invalid templates with ⚠, add validate button handler
- `frontend/index.html` — add sections panel, js-yaml CDN, new script tags, iframe CSS, toolbar buttons
- `tests/conftest.py` — add `AwardItem`/`ExtracurricularItem` to fixtures
- `tests/test_models.py` — add tests for new models/fields
- `tests/test_markdown_renderer.py` — add tests for new sections
- `tests/test_latex_renderer.py` — add tests for new LaTeX blocks
- `tests/test_api.py` — add tests for new endpoints; update templates test for new response shape

### Created
- `frontend/file-sync.js` — load `mycv.yaml` on startup; debounce-save on edit
- `frontend/sections.js` — collapsible section toggle panel

---

## Task 1: Extend Data Models (Awards, Extracurricular, PersonalInfo extras)

**Files:**
- Modify: `backend/models.py`
- Modify: `tests/test_models.py`
- Modify: `tests/conftest.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_models.py`:

```python
from backend.models import (
    CVData, PersonalInfo, ExperienceItem, EducationItem,
    SkillGroup, ProjectItem, CertificationItem, PublicationItem, LanguageItem,
    AwardItem, ExtracurricularItem,
)

def test_award_item_required_name():
    a = AwardItem(name="Best Paper")
    assert a.name == "Best Paper"
    assert a.issuer is None
    assert a.date is None
    assert a.description is None

def test_award_item_all_fields():
    a = AwardItem(name="Best Paper", issuer="ICML", date="2024", description="Top paper.")
    assert a.issuer == "ICML"
    assert a.date == "2024"
    assert a.description == "Top paper."

def test_award_item_requires_name():
    with pytest.raises(ValidationError):
        AwardItem()

def test_extracurricular_item_required_title():
    act = ExtracurricularItem(title="Chess Club")
    assert act.title == "Chess Club"
    assert act.organization is None
    assert act.date is None
    assert act.highlights == []

def test_extracurricular_item_all_fields():
    act = ExtracurricularItem(title="Chess Club", organization="SNU", date="2023", highlights=["Won championship"])
    assert act.organization == "SNU"
    assert act.highlights == ["Won championship"]

def test_extracurricular_requires_title():
    with pytest.raises(ValidationError):
        ExtracurricularItem()

def test_personal_info_extra_fields():
    p = PersonalInfo(name="Test", email="t@t.com", huggingface="hf.co/test", tagline="AI Researcher", address="Seoul")
    assert p.huggingface == "hf.co/test"
    assert p.tagline == "AI Researcher"
    assert p.address == "Seoul"

def test_personal_info_extra_fields_default_none():
    p = PersonalInfo(name="Test", email="t@t.com")
    assert p.huggingface is None
    assert p.tagline is None
    assert p.address is None

def test_cvdata_awards_default_empty(minimal_cv):
    assert minimal_cv.awards == []

def test_cvdata_extracurricular_default_empty(minimal_cv):
    assert minimal_cv.extracurricular == []

def test_cvdata_with_awards():
    cv = CVData(
        personal=PersonalInfo(name="Test", email="t@t.com"),
        awards=[AwardItem(name="1st Place", issuer="Org", date="2024")],
    )
    assert len(cv.awards) == 1
    assert cv.awards[0].name == "1st Place"

def test_cvdata_model_dump_includes_new_sections(sample_cv):
    data = sample_cv.model_dump()
    assert "awards" in data
    assert "extracurricular" in data
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/khjmove/mkcv && source .venv/bin/activate && pytest tests/test_models.py -k "award or extracurricular or extra_field" -v
```

Expected: `ImportError: cannot import name 'AwardItem'` or similar failures.

- [ ] **Step 3: Implement new models in `backend/models.py`**

Replace the full file content:

```python
from typing import Optional
from pydantic import BaseModel


class PersonalInfo(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    website: Optional[str] = None
    huggingface: Optional[str] = None
    tagline: Optional[str] = None
    address: Optional[str] = None


class ExperienceItem(BaseModel):
    title: str
    company: str
    start_date: str
    end_date: Optional[str] = None
    location: Optional[str] = None
    highlights: list[str] = []


class EducationItem(BaseModel):
    degree: str
    institution: str
    year: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    gpa: Optional[str] = None
    details: Optional[str] = None


class SkillGroup(BaseModel):
    category: str
    items: list[str]


class ProjectItem(BaseModel):
    name: str
    description: str
    url: Optional[str] = None
    date: Optional[str] = None
    highlights: list[str] = []


class CertificationItem(BaseModel):
    name: str
    issuer: Optional[str] = None
    date: Optional[str] = None


class PublicationItem(BaseModel):
    title: str
    venue: Optional[str] = None
    date: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None


class LanguageItem(BaseModel):
    language: str
    proficiency: str


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


class CVData(BaseModel):
    personal: PersonalInfo
    summary: Optional[str] = None
    experience: list[ExperienceItem] = []
    education: list[EducationItem] = []
    skills: list[SkillGroup] = []
    projects: list[ProjectItem] = []
    certifications: list[CertificationItem] = []
    publications: list[PublicationItem] = []
    languages: list[LanguageItem] = []
    awards: list[AwardItem] = []
    extracurricular: list[ExtracurricularItem] = []
```

- [ ] **Step 4: Update `tests/conftest.py` to include new models**

```python
import pytest
from backend.models import (
    CVData, PersonalInfo, ExperienceItem, EducationItem,
    SkillGroup, ProjectItem, CertificationItem, PublicationItem, LanguageItem,
    AwardItem, ExtracurricularItem,
)


@pytest.fixture
def sample_cv():
    return CVData(
        personal=PersonalInfo(
            name="Jane Smith",
            email="jane@example.com",
            phone="+1-555-0100",
            location="New York, USA",
            github="github.com/janesmith",
        ),
        summary="Experienced engineer focused on backend systems.",
        experience=[
            ExperienceItem(
                title="Software Engineer",
                company="Tech Co",
                start_date="2020",
                end_date="2023",
                highlights=["Built payment service", "Reduced p99 latency by 30%"],
            )
        ],
        education=[
            EducationItem(degree="B.S. Computer Science", institution="MIT", year="2019", gpa="3.9")
        ],
        skills=[SkillGroup(category="Languages", items=["Python", "Go"])],
        projects=[
            ProjectItem(
                name="OpenTool",
                description="An open source CLI tool",
                url="github.com/janesmith/opentool",
                highlights=["500+ GitHub stars"],
            )
        ],
        certifications=[CertificationItem(name="AWS SAA", issuer="Amazon", date="2022")],
        publications=[PublicationItem(title="Fast APIs", venue="Dev Blog", date="2023")],
        languages=[LanguageItem(language="English", proficiency="Native")],
        awards=[AwardItem(name="Best Paper Award", issuer="ICML", date="2024")],
        extracurricular=[
            ExtracurricularItem(title="Chess Club", organization="SNU", highlights=["Won championship"])
        ],
    )


@pytest.fixture
def minimal_cv():
    return CVData(personal=PersonalInfo(name="Alice", email="alice@example.com"))
```

- [ ] **Step 5: Run all model tests**

```bash
pytest tests/test_models.py -v
```

Expected: all tests PASS (including the new ones from step 1).

- [ ] **Step 6: Run full test suite to check nothing broke**

```bash
pytest -v
```

Expected: all existing tests PASS. (Some may still fail if they check for exact model_dump keys — fix any such failures by updating assertions to include `awards` and `extracurricular`.)

- [ ] **Step 7: Commit**

```bash
git add backend/models.py tests/test_models.py tests/conftest.py
git commit -m "feat: add AwardItem, ExtracurricularItem models; extend PersonalInfo and CVData"
```

---

## Task 2: Extend Markdown Renderer with Awards & Extracurricular

**Files:**
- Modify: `backend/renderers/markdown.py`
- Modify: `tests/test_markdown_renderer.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_markdown_renderer.py`:

```python
from backend.models import AwardItem, ExtracurricularItem

def test_markdown_renders_awards_section(sample_cv):
    output = MarkdownRenderer().render(sample_cv)
    assert "## Awards" in output
    assert "Best Paper Award" in output
    assert "ICML" in output

def test_markdown_renders_extracurricular_section(sample_cv):
    output = MarkdownRenderer().render(sample_cv)
    assert "## Extracurricular Activities" in output
    assert "Chess Club" in output
    assert "Won championship" in output

def test_markdown_skips_empty_awards(minimal_cv):
    output = MarkdownRenderer().render(minimal_cv)
    assert "## Awards" not in output

def test_markdown_skips_empty_extracurricular(minimal_cv):
    output = MarkdownRenderer().render(minimal_cv)
    assert "## Extracurricular Activities" not in output

def test_markdown_award_without_optional_fields():
    from backend.models import CVData, PersonalInfo
    cv = CVData(
        personal=PersonalInfo(name="Test", email="t@t.com"),
        awards=[AwardItem(name="Solo Award")],
    )
    output = MarkdownRenderer().render(cv)
    assert "Solo Award" in output

def test_markdown_extracurricular_without_highlights():
    from backend.models import CVData, PersonalInfo
    cv = CVData(
        personal=PersonalInfo(name="Test", email="t@t.com"),
        extracurricular=[ExtracurricularItem(title="Running Club", organization="SNU")],
    )
    output = MarkdownRenderer().render(cv)
    assert "Running Club" in output
    assert "SNU" in output
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_markdown_renderer.py -k "awards or extracurricular" -v
```

Expected: FAIL — `## Awards` not in output.

- [ ] **Step 3: Add Awards + Extracurricular to `backend/renderers/markdown.py`**

Append the following two blocks before the final `return "\n".join(parts)` in the `render` method. The full updated method body (replace from `if cv.languages:` onward):

```python
        if cv.languages:
            parts.append("## Languages\n")
            parts.append(" · ".join(f"**{l.language}:** {l.proficiency}" for l in cv.languages))
            parts.append("")

        if cv.awards:
            parts.append("## Awards\n")
            for award in cv.awards:
                issuer = f" — {award.issuer}" if award.issuer else ""
                date = f" · {award.date}" if award.date else ""
                parts.append(f"**{award.name}**{issuer}{date}  ")
                if award.description:
                    parts.append(award.description)
            parts.append("")

        if cv.extracurricular:
            parts.append("## Extracurricular Activities\n")
            for act in cv.extracurricular:
                org = f" — {act.organization}" if act.organization else ""
                date = f" · {act.date}" if act.date else ""
                parts.append(f"### {act.title}{org}{date}")
                for h in act.highlights:
                    parts.append(f"- {h}")
                parts.append("")

        return "\n".join(parts)
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_markdown_renderer.py -v
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/renderers/markdown.py tests/test_markdown_renderer.py
git commit -m "feat: add Awards and Extracurricular sections to Markdown renderer"
```

---

## Task 3: Extend Classic LaTeX Template with Awards & Extracurricular

**Files:**
- Modify: `backend/templates/classic/cv.tex.j2`
- Modify: `tests/test_latex_renderer.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_latex_renderer.py`:

```python
from backend.models import AwardItem, ExtracurricularItem

def test_classic_latex_renders_awards(sample_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(sample_cv)
    assert r"\section{Awards}" in output
    assert "Best Paper Award" in output
    assert "ICML" in output

def test_classic_latex_renders_extracurricular(sample_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(sample_cv)
    assert r"\section{Extracurricular Activities}" in output
    assert "Chess Club" in output
    assert "Won championship" in output

def test_classic_latex_skips_empty_awards(minimal_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(minimal_cv)
    assert "Awards" not in output

def test_classic_latex_skips_empty_extracurricular(minimal_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(minimal_cv)
    assert "Extracurricular" not in output
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_latex_renderer.py -k "awards or extracurricular" -v
```

Expected: FAIL — `\section{Awards}` not in output.

- [ ] **Step 3: Add sections to `backend/templates/classic/cv.tex.j2`**

Append the following before `\end{document}` (after the `<% if cv.languages %>` block):

```latex
<% if cv.awards %>
\section{Awards}
<% for award in cv.awards %>
\textbf{<< award.name >>}<% if award.date %> \hfill << award.date >><% endif %>\\
<% if award.issuer %>\textit{<< award.issuer >>}\\<% endif %>
<% if award.description %><< award.description >>\\<% endif %>
<% if not loop.last %>\vspace{2pt}<% endif %>
<% endfor %>
<% endif %>

<% if cv.extracurricular %>
\section{Extracurricular Activities}
<% for act in cv.extracurricular %>
\textbf{<< act.title >>}<% if act.date %> \hfill << act.date >><% endif %>\\
<% if act.organization %>\textit{<< act.organization >>}\\<% endif %>
<% if act.highlights %>
\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
<% for item in act.highlights %>
  \item << item >>
<% endfor %>
\end{itemize}
<% endif %>
<% if not loop.last %>\vspace{4pt}<% endif %>
<% endfor %>
<% endif %>
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_latex_renderer.py -v
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/templates/classic/cv.tex.j2 tests/test_latex_renderer.py
git commit -m "feat: add Awards and Extracurricular sections to classic LaTeX template"
```

---

## Task 4: Add /api/preview/pdf and /api/file Endpoints

**Files:**
- Modify: `backend/main.py`
- Modify: `tests/test_api.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_api.py`:

```python
import os

VALID_YAML_FULL = """
personal:
  name: Alice
  email: alice@example.com
summary: A brief summary.
"""

async def test_preview_pdf_invalid_yaml(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/preview/pdf", json={"yaml": INVALID_YAML, "template": "classic"})
    assert resp.status_code == 422
    assert resp.json()["error"] == "invalid_yaml"

async def test_preview_pdf_unknown_template(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/preview/pdf", json={"yaml": VALID_YAML, "template": "nonexistent"})
    assert resp.status_code == 422
    assert resp.json()["error"] == "unknown_template"

async def test_get_file_missing_returns_empty(app, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/file")
    assert resp.status_code == 200
    assert resp.json()["content"] == ""

async def test_get_file_existing_returns_content(app, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "mycv.yaml").write_text("personal:\n  name: Test\n")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/file")
    assert resp.status_code == 200
    assert "Test" in resp.json()["content"]

async def test_post_file_writes_content(app, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/file", json={"content": "personal:\n  name: Bob\n"})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert (tmp_path / "mycv.yaml").read_text() == "personal:\n  name: Bob\n"

async def test_post_file_overwrites_existing(app, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "mycv.yaml").write_text("old content")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/file", json={"content": "new content"})
    assert resp.json()["ok"] is True
    assert (tmp_path / "mycv.yaml").read_text() == "new content"
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_api.py -k "preview_pdf or get_file or post_file" -v
```

Expected: FAIL — 404 Not Found (endpoints don't exist yet).

- [ ] **Step 3: Add the two new endpoints to `backend/main.py`**

Add after the existing `export_pdf` endpoint (before `list_templates`):

```python
class FileRequest(BaseModel):
    content: str


@app.post("/api/preview/pdf")
async def preview_pdf(req: CVRequest):
    try:
        cv = parse_yaml(req.yaml)
    except YAMLParseError as e:
        return _error("invalid_yaml", e.message, e.details)
    except CVValidationError as e:
        return _error("validation_error", e.message, e.errors)

    if not _template_exists(req.template):
        return _error("unknown_template", f"Template '{req.template}' not found")

    latex_content = LaTeXRenderer(TEMPLATES_DIR, template=req.template).render(cv)

    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = Path(tmpdir) / "cv.tex"
        tex_path.write_text(latex_content)
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

        if result.returncode != 0:
            error_lines = [l for l in result.stdout.splitlines() if l.startswith("!")]
            details = error_lines or [l for l in result.stderr.splitlines() if l.strip()]
            return _error("pdf_generation_failed", "pdflatex exited with errors", details)

        pdf_bytes = (Path(tmpdir) / "cv.pdf").read_bytes()

    return Response(content=pdf_bytes, media_type="application/pdf")


CV_FILE = Path("mycv.yaml")


@app.get("/api/file")
async def get_file():
    if not CV_FILE.exists():
        return {"content": ""}
    return {"content": CV_FILE.read_text()}


@app.post("/api/file")
async def save_file(req: FileRequest):
    try:
        CV_FILE.write_text(req.content)
        return {"ok": True}
    except OSError as e:
        return _error("file_write_failed", str(e), status=500)
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_api.py -k "preview_pdf or get_file or post_file" -v
```

Expected: `test_preview_pdf_invalid_yaml` PASS, `test_preview_pdf_unknown_template` PASS, all `file` tests PASS. The `preview_pdf` pdflatex tests will PASS if pdflatex is installed, or skip implicitly (they only test error conditions).

- [ ] **Step 5: Run full test suite**

```bash
pytest -v
```

Expected: all previously passing tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py tests/test_api.py
git commit -m "feat: add /api/preview/pdf and /api/file GET+POST endpoints"
```

---

## Task 5: Add Template Validation Endpoint with Startup Cache

**Files:**
- Modify: `backend/main.py`
- Modify: `tests/test_api.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_api.py`:

```python
async def test_validate_template_classic(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/templates/classic/validate")
    assert resp.status_code == 200
    data = resp.json()
    assert "valid" in data
    assert "errors" in data
    assert isinstance(data["errors"], list)

async def test_validate_template_not_found(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/templates/nonexistent/validate")
    assert resp.status_code == 404

async def test_get_templates_includes_validation(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/templates")
    assert resp.status_code == 200
    data = resp.json()
    assert "templates" in data
    assert "classic" in data["templates"]
    assert "validation" in data
    assert "classic" in data["validation"]
    assert "valid" in data["validation"]["classic"]
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_api.py -k "validate_template or templates_includes" -v
```

Expected: FAIL — 404 (endpoint doesn't exist) and `KeyError: 'validation'`.

- [ ] **Step 3: Add validation logic + lifespan + endpoint to `backend/main.py`**

At the top of `backend/main.py`, add imports and the sample CV constant:

```python
from __future__ import annotations

import subprocess
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, List

import jinja2
from fastapi import FastAPI
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.models import (
    CVData, PersonalInfo, ExperienceItem, EducationItem,
    SkillGroup, ProjectItem, CertificationItem, PublicationItem, LanguageItem,
    AwardItem, ExtracurricularItem,
)
from backend.parsers.yaml_parser import parse_yaml, YAMLParseError, CVValidationError
from backend.renderers.markdown import MarkdownRenderer
from backend.renderers.latex import LaTeXRenderer

TEMPLATES_DIR = Path(__file__).parent / "templates"
OUTPUT_DIR = Path("output")
CV_FILE = Path("mycv.yaml")

_SAMPLE_CV = CVData(
    personal=PersonalInfo(name="Test User", email="test@example.com", phone="+1-000-0000", location="City, Country"),
    summary="A brief summary.",
    experience=[ExperienceItem(title="Engineer", company="Corp", start_date="2020", end_date="2023", highlights=["Did things"])],
    education=[EducationItem(degree="B.S. CS", institution="University", year="2020")],
    skills=[SkillGroup(category="Languages", items=["Python"])],
    projects=[ProjectItem(name="Project", description="A project", highlights=["Feature"])],
    certifications=[CertificationItem(name="Cert", issuer="Org", date="2022")],
    publications=[PublicationItem(title="Paper", venue="Journal", date="2023")],
    languages=[LanguageItem(language="English", proficiency="Native")],
    awards=[AwardItem(name="Award", issuer="Org", date="2023")],
    extracurricular=[ExtracurricularItem(title="Club", organization="Org", highlights=["Led team"])],
)

_template_validation_cache: dict[str, dict] = {}


def _validate_template(name: str) -> dict:
    template_path = TEMPLATES_DIR / name / "cv.tex.j2"
    if not template_path.exists():
        return {"valid": False, "errors": [f"Template '{name}' not found"]}

    # Stage 1: Jinja2 render
    try:
        env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(str(TEMPLATES_DIR / name)),
            block_start_string="<%",
            block_end_string="%>",
            variable_start_string="<<",
            variable_end_string=">>",
            comment_start_string="<#",
            comment_end_string="#>",
            undefined=jinja2.StrictUndefined,
        )
        latex_content = env.get_template("cv.tex.j2").render(cv=_SAMPLE_CV)
    except jinja2.TemplateSyntaxError as e:
        return {"valid": False, "errors": [f"Jinja2 syntax error at line {e.lineno}: {e.message}"]}
    except jinja2.UndefinedError as e:
        return {"valid": False, "errors": [f"Jinja2 undefined variable: {e.message}"]}
    except Exception as e:
        return {"valid": False, "errors": [f"Jinja2 render error: {str(e)}"]}

    # Stage 2: pdflatex compile
    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = Path(tmpdir) / "cv.tex"
        tex_path.write_text(latex_content)
        try:
            result = subprocess.run(
                ["pdflatex", "-interaction=nonstopmode", "cv.tex"],
                cwd=tmpdir,
                capture_output=True,
                timeout=30,
                text=True,
            )
        except subprocess.TimeoutExpired:
            return {"valid": False, "errors": ["pdflatex timed out after 30 seconds"]}
        except FileNotFoundError:
            return {"valid": False, "errors": ["pdflatex not found — install TeX Live or MiKTeX"]}

        if result.returncode != 0:
            error_lines = [l for l in result.stdout.splitlines() if l.startswith("!")]
            details = error_lines or [l for l in result.stderr.splitlines() if l.strip()]
            return {"valid": False, "errors": details}

    return {"valid": True, "errors": []}


@asynccontextmanager
async def lifespan(app: FastAPI):
    for template_dir in sorted(TEMPLATES_DIR.iterdir()):
        if template_dir.is_dir() and (template_dir / "cv.tex.j2").exists():
            _template_validation_cache[template_dir.name] = _validate_template(template_dir.name)
    yield


app = FastAPI(lifespan=lifespan)
```

Then update `list_templates` to include validation:

```python
@app.get("/api/templates")
async def list_templates():
    templates = sorted(
        d.name for d in TEMPLATES_DIR.iterdir()
        if d.is_dir() and (d / "cv.tex.j2").exists()
    )
    return {
        "templates": templates,
        "validation": {
            name: _template_validation_cache.get(name, {"valid": None, "errors": []})
            for name in templates
        },
    }
```

And add the validate endpoint:

```python
@app.post("/api/templates/{name}/validate")
async def validate_template(name: str):
    if not _template_exists(name):
        return JSONResponse(status_code=404, content={"error": "not_found", "message": f"Template '{name}' not found"})
    result = _validate_template(name)
    _template_validation_cache[name] = result
    return result
```

- [ ] **Step 4: Run validation tests**

```bash
pytest tests/test_api.py -k "validate_template or templates_includes" -v
```

Expected: all PASS. `test_validate_template_classic` may show `"valid": false` if pdflatex isn't installed, but the structure is correct.

- [ ] **Step 5: Update the existing templates test** (response shape changed)

In `tests/test_api.py`, update `test_get_templates`:

```python
async def test_get_templates(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/templates")
    assert resp.status_code == 200
    data = resp.json()
    assert "classic" in data["templates"]
    assert "awesomecv" in data["templates"]
    assert "validation" in data
```

- [ ] **Step 6: Run full test suite**

```bash
pytest -v
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/main.py tests/test_api.py
git commit -m "feat: add template validation endpoint with Jinja2+pdflatex two-stage check and startup cache"
```

---

## Task 6: Rewrite Frontend preview.js for PDF Iframe

**Files:**
- Modify: `frontend/preview.js`
- Modify: `frontend/index.html`

- [ ] **Step 1: Update CSS in `frontend/index.html`**

Replace the `#preview-pane` CSS block and add overlay/error styles. Find this block in `<style>`:

```css
    #preview-pane {
      width: 50%;
      overflow-y: auto;
      padding: 24px 32px;
      background: #fff;
      color: #111;
      font-family: Georgia, serif;
      font-size: 15px;
      line-height: 1.7;
    }

    #preview-pane h1 { font-size: 1.8rem; margin-bottom: 4px; }
    #preview-pane h2 { font-size: 1.1rem; border-bottom: 1px solid #ccc; margin: 20px 0 8px; padding-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    #preview-pane h3 { font-size: 1rem; margin: 12px 0 2px; }
    #preview-pane ul { padding-left: 20px; margin: 4px 0; }
    #preview-pane p { margin: 4px 0; }
    #preview-pane a { color: #1a56db; }
```

Replace with:

```css
    #preview-pane {
      width: 50%;
      position: relative;
      overflow: hidden;
      background: #555;
    }

    #preview-pane iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }

    #preview-loading {
      display: none;
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.45);
      color: #fff;
      font-size: 0.9rem;
      align-items: center;
      justify-content: center;
    }

    #preview-error {
      display: none;
      padding: 24px 32px;
      background: #fff;
      color: #c00;
      font-family: monospace;
      font-size: 0.8rem;
      overflow-y: auto;
      height: 100%;
    }
```

- [ ] **Step 2: Update the preview pane markup in `frontend/index.html`**

Find:

```html
    <div id="preview-pane"><em>Loading preview...</em></div>
```

Replace with:

```html
    <div id="preview-pane">
      <iframe id="preview-frame" title="CV Preview"></iframe>
      <div id="preview-loading">Generating preview…</div>
      <div id="preview-error"></div>
    </div>
```

- [ ] **Step 3: Rewrite `frontend/preview.js`**

Replace the entire file content:

```javascript
const preview = (() => {
  const pane = document.getElementById("preview-pane");
  const frame = document.getElementById("preview-frame");
  const loading = document.getElementById("preview-loading");
  const errorEl = document.getElementById("preview-error");
  let timer = null;
  let currentBlobUrl = null;

  function showLoading() {
    loading.style.display = "flex";
    errorEl.style.display = "none";
  }

  function showError(message, details) {
    loading.style.display = "none";
    errorEl.style.display = "block";
    const detailHtml = details && details.length
      ? "<pre>" + details.map(d => d.replace(/&/g,"&amp;").replace(/</g,"&lt;")).join("\n") + "</pre>"
      : "";
    errorEl.innerHTML = `<strong>Preview error:</strong> ${message}${detailHtml}`;
  }

  function showFrame(url) {
    loading.style.display = "none";
    errorEl.style.display = "none";
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = url;
    frame.src = url;
  }

  async function refresh(yaml, template) {
    showLoading();
    try {
      const resp = await fetch("/api/preview/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml, template }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        showError(err.message, err.details);
        return;
      }
      const blob = await resp.blob();
      showFrame(URL.createObjectURL(blob));
    } catch {
      showError("Preview unavailable — network error", []);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    window.editorAdapter.onChange(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (app.state.yaml.trim()) {
          refresh(app.state.yaml, app.state.template);
        }
      }, 1500);
    });
    setTimeout(() => {
      if (app.state.yaml.trim()) {
        refresh(app.state.yaml, app.state.template);
      }
    }, 200);
  });

  return { refresh };
})();

window.preview = preview;
```

- [ ] **Step 4: Verify in browser**

Start the server:
```bash
cd /Users/khjmove/mkcv && source .venv/bin/activate && uvicorn backend.main:app --reload
```

Open `http://localhost:8000`. After ~2 seconds the preview pane should show a rendered PDF. Edit YAML — after 1.5s the PDF should refresh. Check the loading overlay appears during generation.

- [ ] **Step 5: Commit**

```bash
git add frontend/preview.js frontend/index.html
git commit -m "feat: replace Markdown preview with PDF iframe preview (1.5s debounce)"
```

---

## Task 7: Add setValue to Editor Adapter + file-sync.js

**Files:**
- Modify: `frontend/editor-adapter.js`
- Create: `frontend/file-sync.js`
- Modify: `frontend/index.html`

- [ ] **Step 1: Add `setValue` to `CodeMirrorAdapter` in `frontend/editor-adapter.js`**

After the `onChange(callback)` method, add:

```javascript
  setValue(str) {
    this._editor.setValue(str);
  }
```

The full `CodeMirrorAdapter` class should now be:

```javascript
class CodeMirrorAdapter {
  constructor(container, initialValue = "") {
    this._editor = CodeMirror(container, {
      value: initialValue,
      mode: "yaml",
      theme: "material-darker",
      lineNumbers: true,
      lineWrapping: true,
      tabSize: 2,
      indentWithTabs: false,
      autofocus: true,
    });
  }

  getValue() {
    return this._editor.getValue();
  }

  setValue(str) {
    this._editor.setValue(str);
  }

  onChange(callback) {
    this._editor.on("change", () => callback(this.getValue()));
  }
}
```

- [ ] **Step 2: Create `frontend/file-sync.js`**

```javascript
const fileSync = (() => {
  const banner = document.getElementById("error-banner");
  let saveTimer = null;

  async function loadFile() {
    try {
      const resp = await fetch("/api/file");
      if (!resp.ok) return;
      const { content } = await resp.json();
      if (content && content.trim()) {
        window.editorAdapter.setValue(content);
        app.setState({ yaml: content });
      }
    } catch {
      // fall back to INITIAL_YAML silently
    }
  }

  async function saveFile(content) {
    try {
      const resp = await fetch("/api/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        banner.style.display = "block";
        banner.textContent = `[File save failed] ${err.message}`;
      } else {
        // clear any previous file-save error (leave other errors intact)
        if (banner.textContent.startsWith("[File save failed]")) {
          banner.style.display = "none";
          banner.textContent = "";
        }
      }
    } catch {
      banner.style.display = "block";
      banner.textContent = "[File save failed] Network error";
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await loadFile();
    window.editorAdapter.onChange((val) => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveFile(val), 1000);
    });
  });
})();
```

- [ ] **Step 3: Add `file-sync.js` script tag to `frontend/index.html`**

`file-sync.js` must load after `editor-adapter.js` and before `preview.js`. Find:

```html
  <script src="app.js"></script>
  <script src="editor-adapter.js"></script>
  <script src="templates.js"></script>
```

Replace with:

```html
  <script src="app.js"></script>
  <script src="editor-adapter.js"></script>
  <script src="file-sync.js"></script>
  <script src="templates.js"></script>
```

- [ ] **Step 4: Verify in browser**

With `mycv.yaml` present in the project directory, reload `http://localhost:8000`. The editor should populate with the file content instead of `INITIAL_YAML`. Edit something — wait 1 second — check that `mycv.yaml` on disk was updated (open it in another editor or `cat mycv.yaml`).

- [ ] **Step 5: Commit**

```bash
git add frontend/editor-adapter.js frontend/file-sync.js frontend/index.html
git commit -m "feat: add file-sync.js to load mycv.yaml on startup and debounce-save on edit"
```

---

## Task 8: Add Section Toggle Panel (sections.js)

**Files:**
- Create: `frontend/sections.js`
- Modify: `frontend/index.html`

- [ ] **Step 1: Add js-yaml CDN and sections panel to `frontend/index.html`**

Add js-yaml CDN in `<head>` after the existing script tags:

```html
  <script src="https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js"></script>
```

Add CSS for the sections bar in `<style>`:

```css
    #sections-bar {
      flex-shrink: 0;
      background: #181818;
      border-bottom: 1px solid #333;
    }

    #sections-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 16px;
      cursor: pointer;
      user-select: none;
      font-size: 0.8rem;
      color: #aaa;
    }

    #sections-header:hover { color: #fff; }

    #sections-panel {
      display: none;
      padding: 8px 16px 12px;
      display: none;
      flex-wrap: wrap;
      gap: 8px 20px;
    }

    #sections-panel label {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 0.8rem;
      color: #ccc;
      cursor: pointer;
    }

    #sections-panel input[type="checkbox"] { cursor: pointer; }
    #sections-panel input[type="checkbox"]:indeterminate { opacity: 0.5; }
```

Add sections bar in `<body>` between `#error-banner` and `#main`:

```html
  <div id="sections-bar">
    <div id="sections-header">
      <span>Sections ▾</span>
    </div>
    <div id="sections-panel"></div>
  </div>
```

Add `sections.js` script tag after `file-sync.js`:

```html
  <script src="sections.js"></script>
```

- [ ] **Step 2: Create `frontend/sections.js`**

```javascript
const sections = (() => {
  const SECTION_DEFS = {
    summary: {
      label: "Summary",
      yaml: "summary: >\n  Write a brief professional summary here.\n",
    },
    experience: {
      label: "Experience",
      yaml: [
        "experience:",
        "  - title: Job Title",
        "    company: Company Name",
        '    start_date: "2024"',
        "    highlights:",
        "      - Key achievement",
        "",
      ].join("\n"),
    },
    education: {
      label: "Education",
      yaml: [
        "education:",
        "  - degree: B.S. Your Major",
        "    institution: University Name",
        '    year: "2020"',
        "",
      ].join("\n"),
    },
    skills: {
      label: "Skills",
      yaml: [
        "skills:",
        "  - category: Languages",
        "    items: [Python, JavaScript]",
        "",
      ].join("\n"),
    },
    projects: {
      label: "Projects",
      yaml: [
        "projects:",
        "  - name: Project Name",
        "    description: What it does",
        "    highlights:",
        "      - Key feature",
        "",
      ].join("\n"),
    },
    certifications: {
      label: "Certifications",
      yaml: [
        "certifications:",
        "  - name: Certification Name",
        "    issuer: Issuing Organization",
        '    date: "2024"',
        "",
      ].join("\n"),
    },
    publications: {
      label: "Publications",
      yaml: [
        "publications:",
        "  - title: Paper Title",
        "    venue: Conference or Journal",
        '    date: "2024"',
        "",
      ].join("\n"),
    },
    languages: {
      label: "Languages",
      yaml: [
        "languages:",
        "  - language: English",
        "    proficiency: Native",
        "",
      ].join("\n"),
    },
    awards: {
      label: "Awards",
      yaml: [
        "awards:",
        "  - name: Award Name",
        "    issuer: Awarding Organization",
        '    date: "2024"',
        "",
      ].join("\n"),
    },
    extracurricular: {
      label: "Extracurricular",
      yaml: [
        "extracurricular:",
        "  - title: Activity Name",
        "    organization: Organization Name",
        "    highlights:",
        "      - Key achievement",
        "",
      ].join("\n"),
    },
  };

  const panel = document.getElementById("sections-panel");
  const header = document.getElementById("sections-header");
  let isPanelOpen = false;
  const checkboxes = {};

  function togglePanel() {
    isPanelOpen = !isPanelOpen;
    panel.style.display = isPanelOpen ? "flex" : "none";
    header.querySelector("span").textContent = isPanelOpen ? "Sections ▴" : "Sections ▾";
  }

  function getPresentSections(yaml) {
    try {
      const parsed = jsyaml.load(yaml);
      if (!parsed || typeof parsed !== "object") return null;
      return new Set(Object.keys(parsed));
    } catch {
      return null;
    }
  }

  function updateCheckboxes(yaml) {
    const present = getPresentSections(yaml);
    for (const [key, cb] of Object.entries(checkboxes)) {
      if (present === null) {
        cb.indeterminate = true;
        cb.checked = false;
      } else {
        cb.indeterminate = false;
        cb.checked = present.has(key);
      }
    }
  }

  function enableSection(key) {
    const current = window.editorAdapter.getValue();
    const snippet = "\n" + SECTION_DEFS[key].yaml;
    const updated = current.trimEnd() + snippet;
    window.editorAdapter.setValue(updated);
    app.setState({ yaml: updated });
  }

  function disableSection(key) {
    const current = window.editorAdapter.getValue();
    let parsed;
    try {
      parsed = jsyaml.load(current);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") return;
    delete parsed[key];
    const updated = jsyaml.dump(parsed, { lineWidth: -1 });
    window.editorAdapter.setValue(updated);
    app.setState({ yaml: updated });
  }

  function buildPanel() {
    panel.innerHTML = "";
    for (const [key, def] of Object.entries(SECTION_DEFS)) {
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.addEventListener("change", () => {
        if (cb.indeterminate) return;
        if (cb.checked) {
          enableSection(key);
        } else {
          disableSection(key);
        }
      });
      checkboxes[key] = cb;
      label.appendChild(cb);
      label.appendChild(document.createTextNode(def.label));
      panel.appendChild(label);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    header.addEventListener("click", togglePanel);
    buildPanel();
    window.editorAdapter.onChange((yaml) => updateCheckboxes(yaml));
    updateCheckboxes(app.state.yaml);
  });
})();
```

- [ ] **Step 3: Verify in browser**

Reload `http://localhost:8000`. Click "Sections ▾" to expand the panel. You should see checkboxes for all 10 sections. Sections present in the YAML should be checked. Uncheck "Summary" — the `summary:` block should disappear from the editor and the preview should update. Check "Awards" if it wasn't present — `awards:` scaffold should appear at the bottom of the YAML.

- [ ] **Step 4: Commit**

```bash
git add frontend/sections.js frontend/index.html
git commit -m "feat: add collapsible section toggle panel with YAML-aware enable/disable"
```

---

## Task 9: Template Validation UX — ⚠ in Dropdown + Validate Button

**Files:**
- Modify: `frontend/templates.js`
- Modify: `frontend/index.html`

- [ ] **Step 1: Add "Validate Template" button to `frontend/index.html`**

Find in toolbar:

```html
    <select id="template-select" title="Template"></select>
    <button id="btn-md">↓ Markdown</button>
```

Replace with:

```html
    <select id="template-select" title="Template"></select>
    <button id="btn-validate-template">✓ Validate Template</button>
    <button id="btn-md">↓ Markdown</button>
```

- [ ] **Step 2: Rewrite `frontend/templates.js`**

```javascript
document.addEventListener("DOMContentLoaded", async () => {
  const select = document.getElementById("template-select");
  const banner = document.getElementById("error-banner");
  const btnValidate = document.getElementById("btn-validate-template");
  let validationMap = {};

  try {
    const data = await (await fetch("/api/templates")).json();
    validationMap = data.validation || {};

    data.templates.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      const isValid = validationMap[name] ? validationMap[name].valid : null;
      const prefix = isValid === false ? "⚠ " : "";
      opt.textContent = prefix + name.charAt(0).toUpperCase() + name.slice(1);
      if (name === app.state.template) opt.selected = true;
      select.appendChild(opt);
    });
  } catch {
    const opt = document.createElement("option");
    opt.value = "classic";
    opt.textContent = "Classic";
    select.appendChild(opt);
  }

  select.addEventListener("change", () => {
    app.setState({ template: select.value });
    preview.refresh(app.state.yaml, app.state.template);
  });

  btnValidate.addEventListener("click", async () => {
    const name = app.state.template;
    btnValidate.disabled = true;
    btnValidate.textContent = "Validating…";
    try {
      const resp = await fetch(`/api/templates/${name}/validate`, { method: "POST" });
      const data = await resp.json();
      if (data.valid) {
        banner.style.display = "block";
        banner.style.background = "#1a3a1a";
        banner.style.color = "#86efac";
        banner.textContent = `✓ Template '${name}' is valid (Jinja2 + pdflatex OK)`;
      } else {
        banner.style.display = "block";
        banner.style.background = "#5c1f1f";
        banner.style.color = "#fca5a5";
        banner.textContent = `⚠ Template '${name}' invalid: ${data.errors.join(" · ")}`;
      }
      setTimeout(() => {
        banner.style.display = "none";
        banner.style.background = "";
        banner.style.color = "";
      }, 8000);
    } catch {
      banner.style.display = "block";
      banner.textContent = "Validation request failed";
    } finally {
      btnValidate.disabled = false;
      btnValidate.textContent = "✓ Validate Template";
    }
  });
});
```

- [ ] **Step 3: Verify in browser**

Reload `http://localhost:8000`. Click "✓ Validate Template". You should see a green success banner if the template is valid, or a red error banner with details if not. If a template is invalid, its dropdown option should show "⚠ Classic" etc.

- [ ] **Step 4: Run full test suite one final time**

```bash
pytest -v
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/templates.js frontend/index.html
git commit -m "feat: show validation status in template dropdown and add Validate Template button"
```

---

## Self-Review

### Spec Coverage

| Spec requirement | Task |
|---|---|
| Template Jinja2 render validation | Task 5 |
| Template pdflatex compile validation | Task 5 |
| Show errors for invalid templates | Task 5 + Task 9 |
| ⚠ in dropdown for invalid templates | Task 9 |
| PDF iframe preview | Task 6 |
| 1.5s debounce on YAML/template change | Task 6 |
| Loading overlay during generation | Task 6 |
| Error display on compile failure | Task 6 |
| AwardItem model | Task 1 |
| ExtracurricularItem model | Task 1 |
| PersonalInfo extra fields | Task 1 |
| Awards in Markdown renderer | Task 2 |
| Extracurricular in Markdown renderer | Task 2 |
| Awards in classic LaTeX template | Task 3 |
| Extracurricular in classic LaTeX template | Task 3 |
| Section toggle collapsible panel | Task 8 |
| Enable section inserts YAML | Task 8 |
| Disable section removes YAML | Task 8 |
| Indeterminate state on invalid YAML | Task 8 |
| Load mycv.yaml on startup | Task 7 |
| Debounce-save to mycv.yaml | Task 7 |
| File write error in banner | Task 7 |
| /api/file GET + POST | Task 4 |
| /api/preview/pdf endpoint | Task 4 |
| /api/templates/{name}/validate | Task 5 |
| Startup validation cache | Task 5 |

### Type Consistency Check

- `AwardItem`, `ExtracurricularItem` defined in Task 1, used identically in Tasks 2, 3, 5
- `fileSync` in Task 7 uses `window.editorAdapter.setValue()` — defined in Task 7 Step 1
- `sections.js` in Task 8 uses `window.editorAdapter.getValue()`/`setValue()` — defined in Task 7
- `preview.refresh()` called in templates.js (Task 9) — exported by preview.js (Task 6) as `window.preview`
- `/api/templates` response shape: `{templates: string[], validation: {[name]: {valid: bool, errors: string[]}}}` — consistent between Task 5 backend and Task 9 frontend

All types consistent. No placeholders found.
