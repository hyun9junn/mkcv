# MKCV — Canonical Schema & Template Registry Design
**Date:** 2026-04-20

## Overview

Evolve MKCV to a single canonical CV schema with optional field enrichment, fully flexible custom sections, and a per-template metadata registry. One YAML source of truth; templates choose what to render; custom sections participate in ordering.

---

## 1. Schema enrichment (`backend/models.py`)

### 1.1 Open extra fields on all section models

Every section model gets:
```python
model_config = ConfigDict(extra="allow")
```
Unknown YAML fields pass through to templates automatically. Adding a new field to a template requires zero Python changes; adding it to autocomplete is one line in `models.py`.

### 1.2 New typed optional fields

| Model | New fields |
|---|---|
| `PersonalInfo` | `twitter`, `orcid`, `scholar` (all `Optional[str]`) |
| `ExperienceItem` | `description: Optional[str]`, `tech_stack: list[str] = []`, `tags: list[str] = []`, `contract_type: Optional[str]` |
| `EducationItem` | `courses: list[str] = []`, `thesis: Optional[str]` |
| `ProjectItem` | `tech_stack: list[str] = []`, `tags: list[str] = []`, `role: Optional[str]` |
| `PublicationItem` | `authors: list[str] = []`, `doi: Optional[str]`, `abstract: Optional[str]` |

### 1.3 Custom sections

New models:

```python
class KVPair(BaseModel):
    key: str
    value: str

class CustomBlock(BaseModel):
    model_config = ConfigDict(extra="allow")
    type: str  # "text" | "bullets" | "kv"
    # text:    value: str
    # bullets: items: list[str]
    # kv:      pairs: list[KVPair]

class CustomSection(BaseModel):
    key: str        # stable identifier, used in section_order
    title: str      # rendered heading
    content: list[CustomBlock] = []
```

`CVData` gains:
```python
custom_sections: list[CustomSection] = []
```

Custom sections participate in `section_order` by their `key`. The renderer builds a `custom_by_key = {cs.key: cs for cs in cv.custom_sections}` lookup before iterating `section_order`.

**Example YAML:**
```yaml
custom_sections:
  - key: talks
    title: "Selected Talks"
    content:
      - type: bullets
        items:
          - "NeurIPS 2024: Efficient Quantization in LLMs"
          - "ICML 2023: FlatQuant PTQ Framework"
  - key: service
    title: "Academic Service"
    content:
      - type: kv
        pairs:
          - key: "Reviewer"
            value: "NeurIPS, ICML, ICLR"
```

---

## 2. Per-template `meta.yaml`

Each template directory gets a `meta.yaml` file. Auto-discovered at startup.

**Schema:**
```yaml
display_name: "Academic Research"
description: "Grad school, labs, research internships — small-caps, indigo rules, numbered publications"
audience: academic           # optional tag
recommended_sections:        # sections this template is designed to showcase well
  - publications
  - awards
  - languages
default_section_order:       # suggested rendering order for this template
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

**Separation of concerns:**
- `recommended_sections` — UI hint only ("this template works great with these sections"). Shown as badges in the template picker.
- `default_section_order` — applied only via an explicit user action ("Apply recommended order" button). Never auto-applied on template switch.

**Fallback:** templates without `meta.yaml` derive `display_name` from folder name and have no `recommended_sections` or `default_section_order`. They remain fully functional.

**API:** `/api/templates` response gains a `meta` field:
```json
{
  "templates": ["academic-research", "classic", ...],
  "meta": {
    "academic-research": {
      "display_name": "Academic Research",
      "description": "...",
      "recommended_sections": ["publications", "awards", "languages"],
      "default_section_order": [...]
    }
  },
  "validation": { ... }
}
```

---

## 3. Frontend

### 3.1 Template selection behavior

On template change:
- `recommended_sections` badges update in the UI (informational only)
- Manual section ordering is **never touched**

### 3.2 "Apply recommended order" button

Located in the sections panel. State:
- **Active** when the selected template has a `default_section_order` different from the current order
- **Click:** calls `sectionsState.setOrder(meta.default_section_order)`, reorders the panel, shows a brief confirmation tick

### 3.3 Dynamic custom section keys in sections panel

On each YAML parse, `sections-state.js` adds custom section keys dynamically to the section list alongside built-ins. Custom sections can be toggled visible/hidden and dragged to reorder, just like built-in sections.

**Starter YAML snippet** (for the "add section" action):
```yaml
custom_sections:
  - key: section-key
    title: "Section Title"
    content:
      - type: bullets
        items:
          - Item one
```

### 3.4 Autocomplete (`/api/schema`)

Updated to include all new typed fields from §1.2. Unknown extra fields (via `extra="allow"`) do not appear in hints but work at render time.

---

## 4. Template rendering

### 4.1 Renderer changes (`backend/renderers/latex.py`, `markdown.py`)

Before iterating `section_order`, build:
```python
custom_by_key = {cs.key: cs for cs in cv.custom_sections}
```

`custom_by_key` is passed as an additional context variable to `env.get_template(...).render(cv=cv, section_order=order, custom_by_key=custom_by_key)`.

In the section loop, after checking built-in section keys, fall through to `custom_by_key`. Unknown keys are silently skipped.

### 4.2 LaTeX template custom section block

All five templates get a shared rendering pattern for custom sections (styled with each template's own macros):

```jinja2
<% if section in custom_by_key %>
<% set cs = custom_by_key[section] %>
\section{<< cs.title | latex_escape >>}
<% for block in cs.content %>
  <% if block.type == 'text' %>
    << block.value | latex_escape >>
  <% elif block.type == 'bullets' %>
    \begin{cvitems}
    <% for item in block.items %>
      \item << item | latex_escape >>
    <% endfor %>
    \end{cvitems}
  <% elif block.type == 'kv' %>
    \begin{tabular}{@{}p{3cm}l@{}}
    <% for pair in block.pairs %>
      \textbf{<< pair.key | latex_escape >>} & << pair.value | latex_escape >> \\
    <% endfor %>
    \end{tabular}
  <% endif %>
<% endfor %>
<% endif %>
```

### 4.3 Markdown renderer custom section block

```python
if section in custom_by_key:
    cs = custom_by_key[section]
    lines.append(f"## {cs.title}")
    for block in cs.content:
        if block.type == "text":
            lines.append(block.value)
        elif block.type == "bullets":
            for item in block.items:
                lines.append(f"- {item}")
        elif block.type == "kv":
            for pair in block.pairs:
                lines.append(f"**{pair['key']}:** {pair['value']}")
```

---

## 5. Implementation order

1. Enrich `models.py` — add optional fields + `extra="allow"` + `CustomSection`/`CustomBlock`
2. Write `meta.yaml` for all 5 templates
3. Update `main.py` — load meta files at startup, enrich `/api/templates` response
4. Update `latex.py` and `markdown.py` — `custom_by_key` rendering
5. Update all 5 `.tex.j2` templates — add custom section rendering block
6. Update `sections-state.js` — dynamic custom keys + "Apply recommended order" integration
7. Update `templates.js` — recommended_sections badges + "Apply recommended order" button
8. Update `/api/schema` — reflect new fields

---

## Out of scope

- Per-user schema customization
- Custom section types beyond text/bullets/kv
- Template hot-reload without server restart
- Schema versioning / migration
