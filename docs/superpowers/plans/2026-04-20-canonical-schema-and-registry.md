# Canonical Schema & Template Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve MKCV to one canonical CV schema with enriched optional fields, fully flexible custom sections that participate in ordering, and per-template `meta.yaml` metadata files.

**Architecture:** Pydantic models with `extra="allow"` for zero-friction field extension; new `CustomSection`/`CustomBlock`/`KVPair` models for free-form content; per-template `meta.yaml` auto-discovered at startup and served via `/api/templates`; renderers build `custom_by_key` lookup and pass it to Jinja2 templates so custom sections slot into `section_order` alongside built-ins.

**Tech Stack:** Python/Pydantic v2, FastAPI, PyYAML, Jinja2, vanilla JS (no build step)

---

## File Map

| File | Action | What changes |
|---|---|---|
| `backend/models.py` | Modify | `extra="allow"` on all section models; new optional fields; `KVPair`, `CustomBlock`, `CustomSection`; `CVData.custom_sections` |
| `backend/templates/*/meta.yaml` | Create (×5) | Per-template metadata: `display_name`, `description`, `recommended_sections`, `default_section_order` |
| `backend/main.py` | Modify | Load `meta.yaml` at startup; enrich `/api/templates`; update `_SAMPLE_CV`; pass `custom_by_key` in `_validate_template`; update `_build_cv_schema` |
| `backend/renderers/latex.py` | Modify | Compute `custom_by_key`, pass to Jinja2 render call |
| `backend/renderers/markdown.py` | Modify | Handle `custom_by_key` in section render loop |
| `backend/templates/classic/cv.tex.j2` | Modify | Custom section block in `render_section` macro |
| `backend/templates/modern-startup/cv.tex.j2` | Modify | Custom section block in `render_section` macro |
| `backend/templates/academic-research/cv.tex.j2` | Modify | Custom section block in `render_section` macro |
| `backend/templates/executive-corporate/cv.tex.j2` | Modify | Custom section block in `render_section` macro |
| `backend/templates/heritage/cv.tex.j2` | Modify | Custom section block in `render_section` macro |
| `frontend/sections-state.js` | Modify | `getExpandedPresentKeys`, `getDef`, `getCustomDefs` for dynamic custom section support |
| `frontend/sections-ui.js` | Modify | Use `getExpandedPresentKeys`/`getDef`; add "Apply recommended order" button |
| `frontend/templates.js` | Modify | Recommended sections badges; pass `templateMeta` to `sectionsUI` |
| `tests/conftest.py` | Modify | Add `custom_sections` to `sample_cv` fixture |
| `tests/test_models.py` | Modify | Tests for new fields, `CustomSection`, `CustomBlock`, `KVPair`, `extra="allow"` |
| `tests/test_markdown_renderer.py` | Modify | Tests for custom section rendering |
| `tests/test_latex_renderer.py` | Modify | Tests for custom section rendering in classic template |
| `tests/test_api.py` | Modify | Tests for enriched `/api/templates` response |

---

## Task 1: Enrich `backend/models.py`

**Files:**
- Modify: `backend/models.py`
- Modify: `tests/test_models.py`
- Modify: `tests/conftest.py`

- [ ] **Step 1: Write failing tests for new optional fields**

Add to `tests/test_models.py`:

```python
def test_experience_item_new_optional_fields():
    item = ExperienceItem(title="Dev", company="Corp", start_date="2020")
    assert item.description is None
    assert item.tech_stack == []
    assert item.tags == []
    assert item.contract_type is None

def test_experience_item_extra_field_passthrough():
    item = ExperienceItem(title="Dev", company="Corp", start_date="2020", custom_note="hello")
    assert item.model_extra["custom_note"] == "hello"

def test_education_item_new_optional_fields():
    ed = EducationItem(degree="B.S. CS", institution="MIT")
    assert ed.courses == []
    assert ed.thesis is None

def test_project_item_new_optional_fields():
    proj = ProjectItem(name="T", description="D")
    assert proj.tech_stack == []
    assert proj.tags == []
    assert proj.role is None

def test_publication_item_new_optional_fields():
    pub = PublicationItem(title="Paper")
    assert pub.authors == []
    assert pub.doi is None
    assert pub.abstract is None

def test_personal_info_new_optional_fields():
    p = PersonalInfo(name="Alice", email="a@a.com")
    assert p.twitter is None
    assert p.orcid is None
    assert p.scholar is None

def test_kvpair_model():
    from backend.models import KVPair
    kv = KVPair(key="Reviewer", value="NeurIPS, ICML")
    assert kv.key == "Reviewer"
    assert kv.value == "NeurIPS, ICML"

def test_custom_block_text():
    from backend.models import CustomBlock
    b = CustomBlock(type="text", value="Some paragraph")
    assert b.type == "text"
    assert b.model_extra["value"] == "Some paragraph"

def test_custom_block_bullets():
    from backend.models import CustomBlock
    b = CustomBlock(type="bullets", items=["A", "B"])
    assert b.type == "bullets"
    assert b.model_extra["items"] == ["A", "B"]

def test_custom_block_kv():
    from backend.models import CustomBlock, KVPair
    b = CustomBlock(type="kv", pairs=[{"key": "Role", "value": "Reviewer"}])
    assert b.type == "kv"

def test_custom_section_model():
    from backend.models import CustomSection, CustomBlock
    cs = CustomSection(
        key="talks",
        title="Selected Talks",
        content=[CustomBlock(type="bullets", items=["Talk A", "Talk B"])],
    )
    assert cs.key == "talks"
    assert cs.title == "Selected Talks"
    assert len(cs.content) == 1

def test_custom_section_requires_key_and_title():
    from backend.models import CustomSection
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        CustomSection(title="No Key")
    with pytest.raises(ValidationError):
        CustomSection(key="no-title")

def test_cvdata_custom_sections_default_empty(minimal_cv):
    assert minimal_cv.custom_sections == []

def test_cvdata_with_custom_sections():
    from backend.models import CustomSection, CustomBlock
    cv = CVData(
        personal=PersonalInfo(name="Test", email="t@t.com"),
        custom_sections=[
            CustomSection(
                key="talks",
                title="Selected Talks",
                content=[CustomBlock(type="bullets", items=["Talk A"])],
            )
        ],
    )
    assert len(cv.custom_sections) == 1
    assert cv.custom_sections[0].key == "talks"

def test_cvdata_model_dump_includes_custom_sections(minimal_cv):
    data = minimal_cv.model_dump()
    assert "custom_sections" in data
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/khjmove/mkcv && python -m pytest tests/test_models.py -k "new_optional_fields or kvpair or custom_block or custom_section or custom_sections" -v 2>&1 | head -60
```

Expected: multiple FAILED / ERROR lines.

- [ ] **Step 3: Update `backend/models.py`**

Replace the entire file:

```python
from typing import Optional, Any
from pydantic import BaseModel, ConfigDict


class PersonalInfo(BaseModel):
    model_config = ConfigDict(extra="allow")
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
    twitter: Optional[str] = None
    orcid: Optional[str] = None
    scholar: Optional[str] = None


class ExperienceItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    title: str
    company: str
    start_date: str
    end_date: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    highlights: list[str] = []
    tech_stack: list[str] = []
    tags: list[str] = []
    contract_type: Optional[str] = None


class EducationItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    degree: str
    institution: str
    year: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    gpa: Optional[str] = None
    details: Optional[str] = None
    courses: list[str] = []
    thesis: Optional[str] = None


class SkillGroup(BaseModel):
    model_config = ConfigDict(extra="allow")
    category: str
    items: list[str]


class ProjectItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str
    description: str
    url: Optional[str] = None
    date: Optional[str] = None
    highlights: list[str] = []
    tech_stack: list[str] = []
    tags: list[str] = []
    role: Optional[str] = None


class CertificationItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str
    issuer: Optional[str] = None
    date: Optional[str] = None


class PublicationItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    title: str
    venue: Optional[str] = None
    date: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    authors: list[str] = []
    doi: Optional[str] = None
    abstract: Optional[str] = None


class LanguageItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    language: str
    proficiency: str


class AwardItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str
    issuer: Optional[str] = None
    date: Optional[str] = None
    description: Optional[str] = None


class ExtracurricularItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    title: str
    organization: Optional[str] = None
    date: Optional[str] = None
    highlights: list[str] = []


class KVPair(BaseModel):
    key: str
    value: str


class CustomBlock(BaseModel):
    model_config = ConfigDict(extra="allow")
    type: str  # "text" | "bullets" | "kv"


class CustomSection(BaseModel):
    key: str
    title: str
    content: list[CustomBlock] = []


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
    custom_sections: list[CustomSection] = []
```

- [ ] **Step 4: Update `tests/conftest.py` to add custom_sections to sample_cv**

Add to the `sample_cv` fixture imports and body. The complete updated file:

```python
import pytest
from backend.models import (
    CVData, PersonalInfo, ExperienceItem, EducationItem,
    SkillGroup, ProjectItem, CertificationItem, PublicationItem, LanguageItem,
    AwardItem, ExtracurricularItem, CustomSection, CustomBlock,
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
        custom_sections=[
            CustomSection(
                key="talks",
                title="Selected Talks",
                content=[
                    CustomBlock(type="bullets", items=["NeurIPS 2024: Efficient Quantization"]),
                ],
            )
        ],
    )


@pytest.fixture
def minimal_cv():
    return CVData(personal=PersonalInfo(name="Alice", email="alice@example.com"))
```

- [ ] **Step 5: Run all model tests to confirm they pass**

```bash
cd /Users/khjmove/mkcv && python -m pytest tests/test_models.py -v 2>&1 | tail -20
```

Expected: all tests PASSED.

- [ ] **Step 6: Commit**

```bash
git add backend/models.py tests/test_models.py tests/conftest.py
git commit -m "feat: enrich models with optional fields, extra=allow, and CustomSection"
```

---

## Task 2: Write `meta.yaml` for all 5 templates

**Files:**
- Create: `backend/templates/classic/meta.yaml`
- Create: `backend/templates/modern-startup/meta.yaml`
- Create: `backend/templates/academic-research/meta.yaml`
- Create: `backend/templates/executive-corporate/meta.yaml`
- Create: `backend/templates/heritage/meta.yaml`

- [ ] **Step 1: Create `backend/templates/classic/meta.yaml`**

```yaml
display_name: "Classic"
description: "Clean, minimal layout suitable for general use — LaTeX default fonts, no color"
audience: general
recommended_sections:
  - summary
  - experience
  - education
  - skills
default_section_order:
  - summary
  - experience
  - education
  - skills
  - projects
  - certifications
  - publications
  - languages
  - awards
  - extracurricular
```

- [ ] **Step 2: Create `backend/templates/modern-startup/meta.yaml`**

```yaml
display_name: "Modern Startup"
description: "SWE / AI engineers — airy layout, EB Garamond display, ink-only, no color accents"
audience: engineering
recommended_sections:
  - projects
  - skills
  - experience
default_section_order:
  - summary
  - experience
  - education
  - projects
  - skills
  - publications
  - certifications
  - awards
  - languages
  - extracurricular
```

- [ ] **Step 3: Create `backend/templates/academic-research/meta.yaml`**

```yaml
display_name: "Academic Research"
description: "Grad school, labs, research internships — small-caps headings, indigo rules, numbered publications"
audience: academic
recommended_sections:
  - publications
  - awards
  - languages
default_section_order:
  - summary
  - education
  - experience
  - publications
  - projects
  - skills
  - awards
  - languages
  - certifications
  - extracurricular
```

- [ ] **Step 4: Create `backend/templates/executive-corporate/meta.yaml`**

```yaml
display_name: "Executive Corporate"
description: "Consulting, finance, senior IC — dense layout, Libertine serif, burgundy accent, two-column header"
audience: corporate
recommended_sections:
  - certifications
  - languages
default_section_order:
  - summary
  - experience
  - education
  - skills
  - projects
  - certifications
  - publications
  - awards
  - languages
  - extracurricular
```

- [ ] **Step 5: Create `backend/templates/heritage/meta.yaml`**

```yaml
display_name: "Heritage"
description: "Traditional red-accented layout — classic serif structure with section rules"
audience: general
recommended_sections:
  - certifications
default_section_order:
  - summary
  - experience
  - education
  - skills
  - projects
  - certifications
  - publications
  - awards
  - languages
  - extracurricular
```

- [ ] **Step 6: Commit**

```bash
git add backend/templates/classic/meta.yaml backend/templates/modern-startup/meta.yaml backend/templates/academic-research/meta.yaml backend/templates/executive-corporate/meta.yaml backend/templates/heritage/meta.yaml
git commit -m "feat: add meta.yaml for all 5 templates"
```

---

## Task 3: Update `main.py` — meta loading + enriched `/api/templates`

**Files:**
- Modify: `backend/main.py`
- Modify: `tests/test_api.py`

- [ ] **Step 1: Write failing API tests**

Add to `tests/test_api.py`:

```python
async def test_templates_response_has_meta_field(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/templates")
    data = resp.json()
    assert "meta" in data
    assert "classic" in data["meta"]

async def test_templates_meta_has_display_name(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/templates")
    data = resp.json()
    assert data["meta"]["classic"]["display_name"] == "Classic"

async def test_templates_meta_has_recommended_and_default_order(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/templates")
    data = resp.json()
    meta = data["meta"]["classic"]
    assert "recommended_sections" in meta
    assert "default_section_order" in meta
    assert isinstance(meta["default_section_order"], list)

async def test_templates_meta_academic_recommended_includes_publications(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/templates")
    data = resp.json()
    assert "publications" in data["meta"]["academic-research"]["recommended_sections"]
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/khjmove/mkcv && python -m pytest tests/test_api.py -k "meta" -v 2>&1 | head -30
```

Expected: FAILED — `meta` key not in response.

- [ ] **Step 3: Add `_load_template_meta` and update `_template_meta_cache` in `main.py`**

Add after the existing imports and before `_template_validation_cache`:

```python
import yaml as _yaml

_template_meta_cache: dict[str, dict] = {}


def _load_template_meta(template_dir: Path) -> dict:
    meta_path = template_dir / "meta.yaml"
    if not meta_path.exists():
        return {
            "display_name": template_dir.name.replace("-", " ").title(),
            "description": "",
            "audience": "",
            "recommended_sections": [],
            "default_section_order": [],
        }
    with meta_path.open() as f:
        data = _yaml.safe_load(f) or {}
    return {
        "display_name": data.get("display_name", template_dir.name),
        "description": data.get("description", ""),
        "audience": data.get("audience", ""),
        "recommended_sections": data.get("recommended_sections", []),
        "default_section_order": data.get("default_section_order", []),
    }
```

- [ ] **Step 4: Load meta in `lifespan` and update `/api/templates`**

In the `lifespan` function, add meta loading alongside validation:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    for template_dir in sorted(TEMPLATES_DIR.iterdir()):
        if template_dir.is_dir() and (template_dir / "cv.tex.j2").exists():
            _template_validation_cache[template_dir.name] = _validate_template(template_dir.name)
            _template_meta_cache[template_dir.name] = _load_template_meta(template_dir)
    yield
```

Update the `/api/templates` endpoint:

```python
@app.get("/api/templates")
async def list_templates():
    templates = sorted(
        d.name for d in TEMPLATES_DIR.iterdir()
        if d.is_dir() and (d / "cv.tex.j2").exists()
    )
    return {
        "templates": templates,
        "meta": {
            name: _template_meta_cache.get(name, _load_template_meta(TEMPLATES_DIR / name))
            for name in templates
        },
        "validation": {
            name: _template_validation_cache.get(name, {"valid": None, "errors": []})
            for name in templates
        },
    }
```

- [ ] **Step 5: Update `_SAMPLE_CV` to include a custom section, and update `_validate_template` to pass `custom_by_key`**

In `_SAMPLE_CV`, add:

```python
from backend.models import CustomSection, CustomBlock

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
    custom_sections=[
        CustomSection(
            key="custom-sample",
            title="Sample Custom Section",
            content=[
                CustomBlock(type="bullets", items=["Item one", "Item two"]),
            ],
        )
    ],
)
```

In `_validate_template`, update the render call to pass `custom_by_key`:

```python
custom_by_key = {cs.key: cs for cs in _SAMPLE_CV.custom_sections}
rendered = template.render(
    cv=_SAMPLE_CV,
    section_order=default_order + ["custom-sample"],
    custom_by_key=custom_by_key,
)
```

The `default_order` variable in `_validate_template` is already defined as a local list — append `"custom-sample"` to it:

```python
default_order = ["summary", "experience", "education", "skills", "projects", "certifications", "publications", "languages", "awards", "extracurricular", "custom-sample"]
```

- [ ] **Step 6: Update `_build_cv_schema` to include `custom_sections[]` and `custom_sections[].content[]`**

In `_build_cv_schema`, add to `list_section_map` and add a content context:

```python
# Add to list_section_map:
"custom_sections[]": CustomSection,

# After the loop, add:
schema["custom_sections[].content[]"] = {
    "keys": ["type", "value", "items", "pairs"],
    "required": ["type"],
    "list_keys": ["items", "pairs"],
}
```

Also add the new imports at the top of `_build_cv_schema`:
```python
from backend.models import CustomSection
```
(Add `CustomSection` to the existing import of models at the top of `main.py`.)

- [ ] **Step 7: Run API tests**

```bash
cd /Users/khjmove/mkcv && python -m pytest tests/test_api.py -v 2>&1 | tail -20
```

Expected: all tests PASSED.

- [ ] **Step 8: Commit**

```bash
git add backend/main.py tests/test_api.py
git commit -m "feat: load template meta.yaml and enrich /api/templates response"
```

---

## Task 4: Update renderers for custom sections

**Files:**
- Modify: `backend/renderers/latex.py`
- Modify: `backend/renderers/markdown.py`
- Modify: `tests/test_markdown_renderer.py`
- Modify: `tests/test_latex_renderer.py`

- [ ] **Step 1: Write failing markdown renderer tests**

Add to `tests/test_markdown_renderer.py`:

```python
def test_markdown_renders_custom_section_bullets(sample_cv):
    output = MarkdownRenderer().render(sample_cv, section_order=["talks"])
    assert "## Selected Talks" in output
    assert "- NeurIPS 2024: Efficient Quantization" in output

def test_markdown_renders_custom_section_text():
    from backend.models import CVData, PersonalInfo, CustomSection, CustomBlock
    cv = CVData(
        personal=PersonalInfo(name="Test", email="t@t.com"),
        custom_sections=[
            CustomSection(
                key="bio",
                title="Biography",
                content=[CustomBlock(type="text", value="A short bio paragraph.")],
            )
        ],
    )
    output = MarkdownRenderer().render(cv, section_order=["bio"])
    assert "## Biography" in output
    assert "A short bio paragraph." in output

def test_markdown_renders_custom_section_kv():
    from backend.models import CVData, PersonalInfo, CustomSection, CustomBlock
    cv = CVData(
        personal=PersonalInfo(name="Test", email="t@t.com"),
        custom_sections=[
            CustomSection(
                key="service",
                title="Academic Service",
                content=[CustomBlock(type="kv", pairs=[{"key": "Reviewer", "value": "NeurIPS, ICML"}])],
            )
        ],
    )
    output = MarkdownRenderer().render(cv, section_order=["service"])
    assert "## Academic Service" in output
    assert "**Reviewer:**" in output
    assert "NeurIPS, ICML" in output

def test_markdown_skips_custom_section_not_in_order(sample_cv):
    output = MarkdownRenderer().render(sample_cv, section_order=["summary"])
    assert "Selected Talks" not in output

def test_markdown_custom_section_unknown_block_type_skipped():
    from backend.models import CVData, PersonalInfo, CustomSection, CustomBlock
    cv = CVData(
        personal=PersonalInfo(name="Test", email="t@t.com"),
        custom_sections=[
            CustomSection(
                key="misc",
                title="Misc",
                content=[CustomBlock(type="unknown_type")],
            )
        ],
    )
    output = MarkdownRenderer().render(cv, section_order=["misc"])
    assert "## Misc" in output  # section header still renders
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/khjmove/mkcv && python -m pytest tests/test_markdown_renderer.py -k "custom_section" -v 2>&1 | head -30
```

Expected: FAILED.

- [ ] **Step 3: Update `backend/renderers/markdown.py`**

Replace the render method's section loop to include custom section handling. The complete updated `render` method:

```python
def render(self, cv: CVData, section_order: Optional[List[str]] = None) -> str:
    parts = []

    parts.append(f"# {cv.personal.name}\n")
    contact = [x for x in [cv.personal.email, cv.personal.phone, cv.personal.location] if x]
    if contact:
        parts.append(" · ".join(contact) + "  ")
    links = []
    if cv.personal.linkedin:
        links.append(f"[{cv.personal.linkedin}](https://{cv.personal.linkedin})")
    if cv.personal.github:
        links.append(f"[{cv.personal.github}](https://{cv.personal.github})")
    if cv.personal.website:
        links.append(f"[{cv.personal.website}](https://{cv.personal.website})")
    if links:
        parts.append(" · ".join(links))
    parts.append("")

    order = section_order if section_order else DEFAULT_SECTION_ORDER
    custom_by_key = {cs.key: cs for cs in cv.custom_sections}

    for key in order:
        if key == "summary" and cv.summary:
            parts.append("## Summary\n")
            parts.append(cv.summary.strip())
            parts.append("")
        elif key == "experience" and cv.experience:
            parts.append("## Work Experience\n")
            for job in cv.experience:
                end = job.end_date or "Present"
                parts.append(f"### {job.title} — {job.company}")
                parts.append(f"*{job.start_date} – {end}*\n")
                for h in job.highlights:
                    parts.append(f"- {h}")
                parts.append("")
        elif key == "education" and cv.education:
            parts.append("## Education\n")
            for edu in cv.education:
                gpa = f" · GPA: {edu.gpa}" if edu.gpa else ""
                parts.append(f"### {edu.degree} — {edu.institution}")
                parts.append(f"*{edu.year}*{gpa}\n")
        elif key == "skills" and cv.skills:
            parts.append("## Skills\n")
            for group in cv.skills:
                parts.append(f"**{group.category}:** {', '.join(group.items)}  ")
            parts.append("")
        elif key == "projects" and cv.projects:
            parts.append("## Projects\n")
            for proj in cv.projects:
                name_part = f"[{proj.name}](https://{proj.url})" if proj.url else proj.name
                parts.append(f"### {name_part}")
                parts.append(proj.description)
                for h in proj.highlights:
                    parts.append(f"- {h}")
                parts.append("")
        elif key == "certifications" and cv.certifications:
            parts.append("## Certifications\n")
            for cert in cv.certifications:
                issuer = f" — {cert.issuer}" if cert.issuer else ""
                date = f" · {cert.date}" if cert.date else ""
                parts.append(f"**{cert.name}**{issuer}{date}  ")
            parts.append("")
        elif key == "publications" and cv.publications:
            parts.append("## Publications\n")
            for pub in cv.publications:
                title = f"[{pub.title}](https://{pub.url})" if pub.url else f"**{pub.title}**"
                venue = f" — {pub.venue}" if pub.venue else ""
                date = f" · {pub.date}" if pub.date else ""
                parts.append(f"{title}{venue}{date}  ")
            parts.append("")
        elif key == "languages" and cv.languages:
            parts.append("## Languages\n")
            parts.append(" · ".join(f"**{l.language}:** {l.proficiency}" for l in cv.languages))
            parts.append("")
        elif key == "awards" and cv.awards:
            parts.append("## Awards\n")
            for award in cv.awards:
                issuer = f" — {award.issuer}" if award.issuer else ""
                date = f" · {award.date}" if award.date else ""
                parts.append(f"**{award.name}**{issuer}{date}  ")
                if award.description:
                    parts.append(award.description)
            parts.append("")
        elif key == "extracurricular" and cv.extracurricular:
            parts.append("## Extracurricular Activities\n")
            for act in cv.extracurricular:
                org = f" — {act.organization}" if act.organization else ""
                date = f" · {act.date}" if act.date else ""
                parts.append(f"### {act.title}{org}{date}")
                for h in act.highlights:
                    parts.append(f"- {h}")
                parts.append("")
        elif key in custom_by_key:
            cs = custom_by_key[key]
            parts.append(f"## {cs.title}\n")
            for block in cs.content:
                btype = block.type
                extras = block.model_extra
                if btype == "text":
                    parts.append(extras.get("value", ""))
                elif btype == "bullets":
                    for item in extras.get("items", []):
                        parts.append(f"- {item}")
                elif btype == "kv":
                    for pair in extras.get("pairs", []):
                        parts.append(f"**{pair['key']}:** {pair['value']}")
            parts.append("")

    return "\n".join(parts)
```

- [ ] **Step 4: Run markdown tests**

```bash
cd /Users/khjmove/mkcv && python -m pytest tests/test_markdown_renderer.py -v 2>&1 | tail -20
```

Expected: all PASSED.

- [ ] **Step 5: Write failing latex renderer tests**

Add to `tests/test_latex_renderer.py`:

```python
def test_classic_latex_renders_custom_section_bullets(sample_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(
        sample_cv, section_order=["talks"]
    )
    assert r"\section{Selected Talks}" in output
    assert "NeurIPS 2024: Efficient Quantization" in output

def test_classic_latex_renders_custom_section_text():
    from backend.models import CVData, PersonalInfo, CustomSection, CustomBlock
    cv = CVData(
        personal=PersonalInfo(name="Test", email="t@t.com"),
        custom_sections=[
            CustomSection(
                key="bio",
                title="Biography",
                content=[CustomBlock(type="text", value="A short bio paragraph.")],
            )
        ],
    )
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(cv, section_order=["bio"])
    assert r"\section{Biography}" in output
    assert "A short bio paragraph." in output

def test_classic_latex_renders_custom_section_kv():
    from backend.models import CVData, PersonalInfo, CustomSection, CustomBlock
    cv = CVData(
        personal=PersonalInfo(name="Test", email="t@t.com"),
        custom_sections=[
            CustomSection(
                key="service",
                title="Academic Service",
                content=[CustomBlock(type="kv", pairs=[{"key": "Reviewer", "value": "NeurIPS"}])],
            )
        ],
    )
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(cv, section_order=["service"])
    assert r"\section{Academic Service}" in output
    assert "Reviewer" in output
    assert "NeurIPS" in output

def test_classic_latex_skips_custom_section_not_in_order(sample_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(
        sample_cv, section_order=["summary"]
    )
    assert "Selected Talks" not in output
```

- [ ] **Step 6: Run latex tests to confirm they fail**

```bash
cd /Users/khjmove/mkcv && python -m pytest tests/test_latex_renderer.py -k "custom_section" -v 2>&1 | head -30
```

Expected: FAILED — custom_by_key not passed to template.

- [ ] **Step 7: Update `backend/renderers/latex.py`**

Replace the full file:

```python
from pathlib import Path
from typing import Optional, List
import jinja2
from backend.models import CVData
from backend.renderers.base import BaseRenderer

DEFAULT_SECTION_ORDER = ["summary", "experience", "education", "skills", "projects", "certifications", "publications", "languages", "awards", "extracurricular"]


class LaTeXRenderer(BaseRenderer):
    def __init__(self, templates_dir: Path, template: str = "classic"):
        self.templates_dir = templates_dir
        self.template = template

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
        return env.get_template("cv.tex.j2").render(
            cv=cv,
            section_order=order,
            custom_by_key=custom_by_key,
        )
```

- [ ] **Step 8: Run all renderer tests**

```bash
cd /Users/khjmove/mkcv && python -m pytest tests/test_latex_renderer.py tests/test_markdown_renderer.py -v 2>&1 | tail -20
```

Expected: all PASSED (latex custom_section tests still failing — templates not updated yet).

- [ ] **Step 9: Commit**

```bash
git add backend/renderers/latex.py backend/renderers/markdown.py tests/test_latex_renderer.py tests/test_markdown_renderer.py
git commit -m "feat: add custom_by_key rendering to LaTeX and Markdown renderers"
```

---

## Task 5: Add custom section block to all 5 `.tex.j2` templates

**Files:**
- Modify: `backend/templates/classic/cv.tex.j2`
- Modify: `backend/templates/modern-startup/cv.tex.j2`
- Modify: `backend/templates/academic-research/cv.tex.j2`
- Modify: `backend/templates/executive-corporate/cv.tex.j2`
- Modify: `backend/templates/heritage/cv.tex.j2`

The custom section block is the same for all templates. It goes inside the `render_section(key)` macro, immediately before `<% endmacro %>`.

- [ ] **Step 1: Add to `backend/templates/classic/cv.tex.j2`**

Find:
```
<% endmacro %>

<% for key in section_order %>
```

Replace with:
```
<% if key in custom_by_key %>
<% set cs = custom_by_key[key] %>
\section{<< cs.title >>}
<% for block in cs.content %>
<% set extras = block.model_extra %>
<% if block.type == 'text' %>
<< extras.get('value', '') >>
<% elif block.type == 'bullets' %>
\begin{itemize}[leftmargin=*,noitemsep,topsep=2pt]
<% for item in extras.get('items', []) %>
    \item << item >>
<% endfor %>
\end{itemize}
<% elif block.type == 'kv' %>
\begin{tabular}{@{}p{3cm}l@{}}
<% for pair in extras.get('pairs', []) %>
\textbf{<< pair.key >>} & << pair.value >> \\
<% endfor %>
\end{tabular}
<% endif %>
<% endfor %>
<% endif %>
<% endmacro %>

<% for key in section_order %>
```

- [ ] **Step 2: Run classic template latex tests**

```bash
cd /Users/khjmove/mkcv && python -m pytest tests/test_latex_renderer.py -k "custom_section" -v 2>&1 | tail -20
```

Expected: all custom_section tests PASSED.

- [ ] **Step 3: Add same custom section block to `modern-startup/cv.tex.j2`**

The `cvitems` environment is defined in modern-startup. Use it for bullets. Find the `<% endmacro %>` before the section loop and insert before it:

```
<% if key in custom_by_key %>
<% set cs = custom_by_key[key] %>
\section{<< cs.title >>}
<% for block in cs.content %>
<% set extras = block.model_extra %>
<% if block.type == 'text' %>
<< extras.get('value', '') >>
<% elif block.type == 'bullets' %>
\begin{cvitems}
<% for item in extras.get('items', []) %>
    \item << item >>
<% endfor %>
\end{cvitems}
<% elif block.type == 'kv' %>
\begin{tabular}{@{}p{3cm}l@{}}
<% for pair in extras.get('pairs', []) %>
\cvrole{<< pair.key >>} & << pair.value >> \\
<% endfor %>
\end{tabular}
<% endif %>
<% endfor %>
<% endif %>
```

- [ ] **Step 4: Add same block to `academic-research/cv.tex.j2`**

Same pattern; the `cvitems` environment is defined in this template too. Insert before `<% endmacro %>`:

```
<% if key in custom_by_key %>
<% set cs = custom_by_key[key] %>
\section{<< cs.title >>}
<% for block in cs.content %>
<% set extras = block.model_extra %>
<% if block.type == 'text' %>
<< extras.get('value', '') >>
<% elif block.type == 'bullets' %>
\begin{cvitems}
<% for item in extras.get('items', []) %>
    \item << item >>
<% endfor %>
\end{cvitems}
<% elif block.type == 'kv' %>
\begin{tabular}{@{}p{3cm}l@{}}
<% for pair in extras.get('pairs', []) %>
\cvrole{<< pair.key >>} & \cvorg{<< pair.value >>} \\
<% endfor %>
\end{tabular}
<% endif %>
<% endfor %>
<% endif %>
```

- [ ] **Step 5: Add same block to `executive-corporate/cv.tex.j2`**

Same pattern; insert before `<% endmacro %>`:

```
<% if key in custom_by_key %>
<% set cs = custom_by_key[key] %>
\section{<< cs.title >>}
<% for block in cs.content %>
<% set extras = block.model_extra %>
<% if block.type == 'text' %>
<< extras.get('value', '') >>
<% elif block.type == 'bullets' %>
\begin{cvitems}
<% for item in extras.get('items', []) %>
    \item << item >>
<% endfor %>
\end{cvitems}
<% elif block.type == 'kv' %>
\begin{tabular}{@{}p{3cm}l@{}}
<% for pair in extras.get('pairs', []) %>
\cvrole{<< pair.key >>} & \cvorg{<< pair.value >>} \\
<% endfor %>
\end{tabular}
<% endif %>
<% endfor %>
<% endif %>
```

- [ ] **Step 6: Add same block to `heritage/cv.tex.j2`**

Heritage uses plain `\textbf` for roles. Insert before `<% endmacro %>`:

```
<% if key in custom_by_key %>
<% set cs = custom_by_key[key] %>
\section{<< cs.title >>}
<% for block in cs.content %>
<% set extras = block.model_extra %>
<% if block.type == 'text' %>
<< extras.get('value', '') >>
<% elif block.type == 'bullets' %>
\begin{itemize}[leftmargin=1.4em,noitemsep,topsep=2pt,itemsep=1pt]
<% for item in extras.get('items', []) %>
  \item << item >>
<% endfor %>
\end{itemize}
<% elif block.type == 'kv' %>
\begin{tabular}{@{}p{3cm}l@{}}
<% for pair in extras.get('pairs', []) %>
\textbf{<< pair.key >>} & << pair.value >> \\
<% endfor %>
\end{tabular}
<% endif %>
<% endfor %>
<% endif %>
```

- [ ] **Step 7: Run all renderer tests**

```bash
cd /Users/khjmove/mkcv && python -m pytest tests/test_latex_renderer.py tests/test_markdown_renderer.py -v 2>&1 | tail -20
```

Expected: all PASSED.

- [ ] **Step 8: Commit**

```bash
git add backend/templates/classic/cv.tex.j2 backend/templates/modern-startup/cv.tex.j2 backend/templates/academic-research/cv.tex.j2 backend/templates/executive-corporate/cv.tex.j2 backend/templates/heritage/cv.tex.j2
git commit -m "feat: add custom section rendering block to all 5 LaTeX templates"
```

---

## Task 6: Update `frontend/sections-state.js` for dynamic custom section keys

**Files:**
- Modify: `frontend/sections-state.js`

Custom sections live under the `custom_sections` top-level YAML key, but each one has an individual `key` field that should appear as a separate draggable chip in the sections panel. This task adds the logic to extract those keys and provide label lookups for them.

- [ ] **Step 1: Add `getCustomDefs(rawYaml)` and `getExpandedPresentKeys(rawYaml)` and `getDef(key, rawYaml)` to `sections-state.js`**

In `sections-state.js`, add these three functions inside the IIFE before the `return` statement:

```js
function getCustomDefs(rawYaml) {
    try {
        const parsed = jsyaml.load(rawYaml);
        if (!parsed || !Array.isArray(parsed.custom_sections)) return {};
        const defs = {};
        for (const cs of parsed.custom_sections) {
            if (cs && cs.key && cs.title) {
                defs[cs.key] = { label: cs.title, yaml: null };
            }
        }
        return defs;
    } catch {
        return {};
    }
}

function getExpandedPresentKeys(rawYaml) {
    try {
        const parsed = jsyaml.load(rawYaml);
        if (!parsed || typeof parsed !== "object") return [];
        const keys = Object.keys(parsed).filter((k) => k !== "personal" && k !== "custom_sections");
        const customDefs = getCustomDefs(rawYaml);
        return [...keys, ...Object.keys(customDefs)];
    } catch {
        return [];
    }
}

function getDef(key, rawYaml) {
    if (SECTION_DEFS[key]) return SECTION_DEFS[key];
    const customDefs = getCustomDefs(rawYaml);
    return customDefs[key] || null;
}
```

- [ ] **Step 2: Update `getVisibleOrder` to exclude `custom_sections` from top-level keys and include custom section keys**

Replace the existing `getVisibleOrder` function:

```js
function getVisibleOrder(rawYaml) {
    try {
        const parsed = jsyaml.load(rawYaml);
        if (!parsed || typeof parsed !== "object") return [];
        const { hidden, order } = _getState();
        const expandedKeys = getExpandedPresentKeys(rawYaml);
        const present = new Set(expandedKeys);
        const result = order.filter((k) => present.has(k) && !hidden.includes(k));
        for (const k of expandedKeys) {
            if (!result.includes(k) && !hidden.includes(k)) result.push(k);
        }
        return result;
    } catch {
        return [];
    }
}
```

- [ ] **Step 3: Export new functions in the return statement**

Add `getCustomDefs`, `getExpandedPresentKeys`, and `getDef` to the returned object:

```js
return {
    SECTION_DEFS,
    DEFAULT_ORDER,
    isHidden,
    toggleHidden,
    getOrder,
    setOrder,
    ensureInOrder,
    getFilteredYaml,
    getOrderedFilteredYaml,
    getVisibleOrder,
    getCustomDefs,
    getExpandedPresentKeys,
    getDef,
    resetSectionYaml,
    restoreSectionYaml,
    resetAll,
};
```

- [ ] **Step 4: Update `getOrderedFilteredYaml` to handle custom sections**

Custom section keys (`talks`, `service`) are NOT top-level YAML keys — they live under `custom_sections`. The filtering/ordering logic should keep `custom_sections` intact (not split it up). The section_order passed to the backend will contain custom section keys, and the renderer handles the rest. So `getOrderedFilteredYaml` only needs to handle top-level YAML keys. But we need to make sure `custom_sections` is NOT filtered out when any of its child keys are visible.

Replace `getOrderedFilteredYaml`:

```js
function getOrderedFilteredYaml(rawYaml) {
    try {
        const parsed = jsyaml.load(rawYaml);
        if (!parsed || typeof parsed !== "object") return rawYaml;
        const { hidden, order } = _getState();
        const customDefs = getCustomDefs(rawYaml);
        const customKeys = Object.keys(customDefs);

        // Determine which built-in top-level keys are visible (not hidden)
        // For custom_sections: include if at least one custom section key is not hidden
        const anyCustomVisible = customKeys.some((k) => !hidden.includes(k));

        const ordered = {};
        // Add built-in sections in order
        for (const key of order) {
            if (key in parsed && key !== "custom_sections" && !hidden.includes(key)) {
                ordered[key] = parsed[key];
            }
        }
        // Add custom_sections block if any custom key is visible
        if (anyCustomVisible && Array.isArray(parsed.custom_sections)) {
            ordered.custom_sections = parsed.custom_sections.filter(
                (cs) => cs && cs.key && !hidden.includes(cs.key)
            );
        }
        // Add any top-level keys not in order (excluding personal and custom_sections)
        for (const [k, v] of Object.entries(parsed)) {
            if (!(k in ordered) && !hidden.includes(k) && k !== "personal" && k !== "custom_sections") {
                ordered[k] = v;
            }
        }
        return jsyaml.dump(ordered, { lineWidth: -1 });
    } catch {
        return rawYaml;
    }
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/sections-state.js
git commit -m "feat: dynamic custom section key support in sections-state.js"
```

---

## Task 7: Update `frontend/sections-ui.js` and `frontend/templates.js`

**Files:**
- Modify: `frontend/sections-ui.js`
- Modify: `frontend/templates.js`

- [ ] **Step 1: Update `buildPanel` in `sections-ui.js` to use `getExpandedPresentKeys` and `getDef`**

In `buildPanel`, replace:

```js
const presentKeys = getPresentKeys(app.state.yaml);
```
with:
```js
const presentKeys = sectionsState.getExpandedPresentKeys(app.state.yaml);
```

Replace the `ensureInOrder` loop and the def lookup:
```js
// Any key present in YAML but missing from localStorage order gets appended.
for (const key of presentKeys) {
  sectionsState.ensureInOrder(key);
}
```
(This stays the same — `ensureInOrder` already handles any key.)

Replace:
```js
const def = sectionsState.SECTION_DEFS[key];
if (!def) continue;
```
with:
```js
const def = sectionsState.getDef(key, app.state.yaml);
if (!def) continue;
```

For the reset button, only show it for built-in sections (custom sections have no default YAML):
```js
// Replace the btnReset block:
if (sectionsState.SECTION_DEFS[key]) {
    const btnReset = document.createElement("button");
    btnReset.className = "btn-reset";
    btnReset.textContent = "↺";
    btnReset.title = `Reset ${def.label}`;
    btnReset.addEventListener("click", () => showResetModal(key));
    row.appendChild(btnReset);
}
```

Also remove the now-dead `getPresentKeys` local function from `sections-ui.js` since it's replaced by `sectionsState.getExpandedPresentKeys`.

- [ ] **Step 2: Add "Apply recommended order" button to `buildPanel`**

After the existing "↺ Reset Order" button append block, add:

```js
// "Apply recommended order" button — only shown when templateMeta has a default_section_order
// _pendingTemplateMeta is the closure variable set by setTemplateMeta()
if (_pendingTemplateMeta && Array.isArray(_pendingTemplateMeta.default_section_order) && _pendingTemplateMeta.default_section_order.length > 0) {
    const pendingMeta = _pendingTemplateMeta;
    const btnApply = document.createElement("button");
    btnApply.className = "btn-apply-order";
    btnApply.textContent = `↓ Apply ${pendingMeta.display_name || "template"} order`;
    btnApply.title = `Apply the recommended section order for ${pendingMeta.display_name || "this template"}`;
    btnApply.addEventListener("click", () => {
        sectionsState.setOrder([...pendingMeta.default_section_order]);
        buildPanel();
        preview.refresh(
            sectionsState.getOrderedFilteredYaml(app.state.yaml),
            app.state.template
        );
    });
    panel.appendChild(btnApply);
}
```

- [ ] **Step 3: Expose `_pendingTemplateMeta` on `sectionsUI`**

In `sections-ui.js`, inside the IIFE before the `return` statement, add:

```js
let _pendingTemplateMeta = null;

function setTemplateMeta(meta) {
    _pendingTemplateMeta = meta;
    buildPanel();
}
```

Update the return to include these:

```js
return { buildPanel, setTemplateMeta, get _pendingTemplateMeta() { return _pendingTemplateMeta; } };
```

- [ ] **Step 4: Update `frontend/templates.js` to pass meta to `sectionsUI` and show recommended badges**

Replace the full `templates.js`:

```js
document.addEventListener("DOMContentLoaded", async () => {
    const select = document.getElementById("template-select");
    const banner = document.getElementById("error-banner");
    const btnValidate = document.getElementById("btn-validate-template");
    let allMeta = {};

    try {
        const data = await (await fetch("/api/templates")).json();
        const validationMap = data.validation || {};
        allMeta = data.meta || {};

        data.templates.forEach((name) => {
            const opt = document.createElement("option");
            opt.value = name;
            const isValid = validationMap[name] ? validationMap[name].valid : null;
            const prefix = isValid === false ? "⚠ " : "";
            const meta = allMeta[name] || {};
            opt.textContent = prefix + (meta.display_name || (name.charAt(0).toUpperCase() + name.slice(1)));
            if (name === app.state.template) opt.selected = true;
            select.appendChild(opt);
        });

        // Set initial meta for the default template
        const initialMeta = allMeta[app.state.template] || null;
        if (initialMeta) sectionsUI.setTemplateMeta(initialMeta);
        _updateRecommendedBadges(initialMeta);

    } catch {
        const opt = document.createElement("option");
        opt.value = "classic";
        opt.textContent = "Classic";
        select.appendChild(opt);
    }

    function _updateRecommendedBadges(meta) {
        let badgesEl = document.getElementById("template-recommended-badges");
        if (!badgesEl) return;
        if (!meta || !meta.recommended_sections || meta.recommended_sections.length === 0) {
            badgesEl.textContent = "";
            return;
        }
        badgesEl.textContent = "✦ " + meta.recommended_sections.join(", ");
    }

    select.addEventListener("change", () => {
        const name = select.value;
        app.setState({ template: name });
        preview.refresh(sectionsState.getFilteredYaml(app.state.yaml), name);
        const meta = allMeta[name] || null;
        sectionsUI.setTemplateMeta(meta);
        _updateRecommendedBadges(meta);
    });

    btnValidate.addEventListener("click", async () => {
        const name = app.state.template;
        btnValidate.disabled = true;
        btnValidate.textContent = "Validating…";
        try {
            const resp = await fetch(`/api/templates/${name}/validate`, { method: "POST" });
            const data = await resp.json();
            banner.style.display = "block";
            if (data.valid) {
                banner.style.background = "#1a3a1a";
                banner.style.color = "#86efac";
                banner.textContent = `✓ Template '${name}' is valid (Jinja2 + pdflatex OK)`;
            } else {
                banner.style.background = "#5c1f1f";
                banner.style.color = "#fca5a5";
                banner.textContent = `⚠ Template '${name}' invalid: ${data.errors.join(" · ")}`;
            }
            setTimeout(() => {
                banner.style.display = "none";
                banner.style.background = "";
                banner.style.color = "";
                banner.textContent = "";
            }, 8000);
        } catch {
            banner.style.display = "block";
            banner.style.background = "#5c1f1f";
            banner.style.color = "#fca5a5";
            banner.textContent = "Validation request failed";
        } finally {
            btnValidate.disabled = false;
            btnValidate.textContent = "✓ Validate Template";
        }
    });
});
```

- [ ] **Step 5: Add `#template-recommended-badges` element to `frontend/index.html`**

Find the template select area in `index.html`. After the `<select id="template-select">` or its wrapper, add:

```html
<span id="template-recommended-badges" style="font-size:0.75rem;color:#9ca3af;margin-left:8px;"></span>
```

Locate the exact position by searching for `template-select` in `index.html` and placing the badge span immediately after the closing `</select>` tag or within the toolbar row.

- [ ] **Step 6: Commit**

```bash
git add frontend/sections-ui.js frontend/templates.js frontend/index.html
git commit -m "feat: apply-recommended-order button and template recommended badges in UI"
```

---

## Task 8: Run full test suite and verify

- [ ] **Step 1: Run all tests**

```bash
cd /Users/khjmove/mkcv && python -m pytest -v 2>&1 | tail -30
```

Expected: all tests PASSED with no failures.

- [ ] **Step 2: Start the server and do a quick smoke test**

```bash
cd /Users/khjmove/mkcv && uvicorn backend.main:app --reload 2>&1 &
sleep 3
curl -s http://localhost:8000/api/templates | python3 -m json.tool | head -40
```

Expected: JSON with `templates`, `meta` (each with `display_name`, `recommended_sections`, `default_section_order`), and `validation` keys.

- [ ] **Step 3: Test custom section round-trip via API**

```bash
curl -s -X POST http://localhost:8000/api/preview \
  -H "Content-Type: application/json" \
  -d '{"yaml": "personal:\n  name: Test\n  email: t@t.com\ncustom_sections:\n  - key: talks\n    title: Selected Talks\n    content:\n      - type: bullets\n        items:\n          - NeurIPS 2024\n", "template": "classic", "section_order": ["talks"]}' | python3 -m json.tool
```

Expected: `markdown` field contains `## Selected Talks` and `- NeurIPS 2024`.

- [ ] **Step 4: Kill dev server and do final commit**

```bash
kill %1 2>/dev/null || true
git add -A
git status
```

Only commit if there are untracked changes that weren't covered by earlier commits. If clean, skip.

---

## Implementation Notes

- **`extra="allow"` and `model_extra`**: In Pydantic v2, extra fields passed to a model with `extra="allow"` are stored in `model.model_extra` (a dict). In `CustomBlock`, the type-specific fields (`value`, `items`, `pairs`) are accessed via `block.model_extra.get(...)` in renderers.

- **Jinja2 macro + template globals**: Template-level variables passed to `render()` (like `custom_by_key`) are accessible inside `render_section` macros without being passed as arguments, because they are part of the Jinja2 global context.

- **`pair.key` vs `pair['key']` in Jinja2**: In the Jinja2 templates, `pair` comes from `extras.get('pairs', [])` where each pair is a plain dict (not a `KVPair` Pydantic model). Use `pair.key` (attribute-style access works on dicts in Jinja2) or `pair['key']` — both work. The plan uses `pair.key` for consistency with other template expressions.

- **Section ordering and `custom_sections` YAML key**: The `section_order` array sent to the API contains custom section keys (e.g., `["summary", "talks", "experience"]`). The top-level YAML key `custom_sections` itself never appears in `section_order`. `getOrderedFilteredYaml` in `sections-state.js` handles keeping `custom_sections` in the serialized YAML while filtering individual sections by their key.
