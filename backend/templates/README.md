# MKCV Template System

Guidelines for understanding, maintaining, and adding templates to MKCV.

---

## Directory layout

Each template lives in its own subdirectory under `backend/templates/`:

```
templates/
├── classic/
│   ├── cv.tex.j2      # required — Jinja2+LaTeX source
│   └── meta.yaml      # required — display metadata and defaults
├── dealbook/
│   ├── cv.tex.j2
│   └── meta.yaml
└── <your-template>/
    ├── cv.tex.j2
    └── meta.yaml
```

The app discovers templates at startup by scanning this directory. A folder is treated as a valid template only if it contains `cv.tex.j2`. A folder with only `meta.yaml` still appears in the template list but cannot be rendered — do not ship a template in that state.

---

## Adding a new template — step by step

This is the most important section. Follow every step to avoid errors.

### Step 1 — Create the directory

```bash
mkdir backend/templates/<your-name>
```

Use **lowercase letters and hyphens only**. No spaces, no underscores, no uppercase.

Examples: `timeline-bold`, `sidebar-clean`, `academic-compact`

### Step 2 — Write `cv.tex.j2`

This is the Jinja2+XeLaTeX template file. See the sections below for the full reference. The minimum viable structure is:

```jinja2
\documentclass[<< font_size >>,a4paper]{article}
<< layout_preamble >>
<< xelatex_preamble >>

\usepackage{geometry}
\geometry{top=1.5cm,bottom=1.5cm,left=2cm,right=2cm}

% ... your preamble packages and \newcommand definitions ...

\begin{document}

<% macro render_section(key) %>
<% if key == 'experience' and cv.experience %>
\section{<< section_titles.get('experience', 'Experience') >>}
% ... experience rendering ...
<% endif %>

<%- # repeat for other sections ... #>

<% if key in custom_by_key %>
<% set cs = custom_by_key[key] %>
\section{<< cs.title >>}
% ... custom section rendering (see below) ...
<% endif %>
<% endmacro %>

<% for key in section_order %>
<< render_section(key) >>
<% endfor %>

\end{document}
```

**Mandatory rules for `cv.tex.j2`:**

- `\documentclass[<< font_size >>,a4paper]{article}` must be the first line.
- `<< layout_preamble >>` must immediately follow `\documentclass`, before any `\usepackage`.
- `<< xelatex_preamble >>` must appear somewhere in the preamble. It emits `\usepackage{fontspec}`, `\usepackage{kotex}`, and the Hangul font configuration from `meta.yaml`.
- The template **must** compile with **xelatex** — `fontspec`, `kotex`, and other XeLaTeX-specific packages are required and supported.
- Use the custom Jinja2 delimiters — standard `{{ }}` / `{% %}` conflict with LaTeX. See [Jinja2 delimiters](#jinja2-delimiters).
- Implement a `render_section(key)` macro and call it in a loop over `section_order`. Never hard-code section order outside this macro.
- Guard every optional field with `<% if field %>` before output.
- Use `\cvvgap`, `\cvsecbefore`, `\cvsecafter`, `\cvitembefore` for all content spacing — never hardcode `\vspace{Xpt}`.

### Step 3 — Write `meta.yaml`

See [meta.yaml reference](#metayaml-reference) below for the exact schema. The minimum required fields are:

```yaml
display_name: "Your Template Name"
description: "One sentence describing style and target audience."
audience: general
ui:
  badge: ""
render:
  section_title_case: title
defaults:
  layout:
    density: balanced
    font_scale: normal
  personal:
    default_link_display: label
    fields:
      - {key: name,        visible: true}
      - {key: email,       visible: true}
      - {key: phone,       visible: true}
      - {key: location,    visible: true}
      - {key: website,     visible: true,  link_display: default}
      - {key: linkedin,    visible: true,  link_display: default}
      - {key: github,      visible: true,  link_display: default}
      - {key: huggingface, visible: true,  link_display: default}
  sections:
    - {key: summary,         title: "SUMMARY",                  visible: true}
    - {key: experience,      title: "EXPERIENCE",               visible: true}
    - {key: education,       title: "EDUCATION",                visible: true}
    - {key: skills,          title: "SKILLS",                   visible: true}
    - {key: projects,        title: "PROJECTS",                 visible: true}
    - {key: certifications,  title: "CERTIFICATIONS",           visible: false}
    - {key: publications,    title: "PUBLICATIONS",             visible: false}
    - {key: languages,       title: "LANGUAGES",                visible: false}
    - {key: awards,          title: "AWARDS",                   visible: false}
    - {key: extracurricular, title: "EXTRACURRICULAR ACTIVITIES", visible: false}
```

**`defaults.personal.fields` must contain exactly these 8 keys in this order:** `name`, `email`, `phone`, `location`, `website`, `linkedin`, `github`, `huggingface`. Missing or extra keys fail validation silently (the defaults block is replaced with `{}`).

**`defaults.sections` must include all 10 built-in keys** — no more, no fewer. The set `{summary, experience, education, skills, projects, certifications, publications, languages, awards, extracurricular}` must match exactly.

### Step 4 — Validate

```bash
# Validate Jinja2 render + xelatex compile
python -m backend validate <your-name>
```

Fix any errors reported. Then restart the server and confirm `"valid": true` in the template picker, or call `GET /api/templates` and check the `validation` object.

### Step 5 — Generate a thumbnail

```bash
# Requires: pip install pdf2image  and  poppler (brew install poppler)
python -m backend thumbnails <your-name>
```

This writes `frontend/assets/template-previews/<your-name>.png`. Without a thumbnail, the template card shows a blank placeholder.

### Step 6 — Manual testing

1. Open the app and switch to your template.
2. Try a real YAML file — verify every section renders correctly.
3. Toggle individual sections off and on — confirm the macro handles each case.
4. Add a `custom_sections` entry — confirm it appears in the PDF.
5. Test with a very long name (> 30 chars) and a long job title (> 48 chars).
6. Test with optional fields absent: no phone, no github, no `edu.year`, empty `highlights`.

---

## Template file: `cv.tex.j2`

### Jinja2 delimiters

The app configures a non-standard Jinja2 environment to avoid conflicts with LaTeX `{}` syntax:

| Purpose | Delimiter |
|---------|-----------|
| Variable output | `<< variable >>` |
| Block tags (`if`, `for`, `macro`) | `<% tag %>` |
| Comments | `<# comment #>` |

Both `trim_blocks` and `lstrip_blocks` are enabled. `trim_blocks` removes the newline immediately after a block tag; `lstrip_blocks` strips leading whitespace before block tags. This means block tags consume their entire line without leaving blank lines in the output. Do not add extra blank lines around block tags expecting them to appear in the rendered `.tex`.

### Variables available in every template

| Variable | Type | Description |
|----------|------|-------------|
| `cv` | `CVData` | The parsed CV object — see [CV data model](#cv-data-model) |
| `section_order` | `list[str]` | Ordered list of section keys to render |
| `custom_by_key` | `dict[str, CustomSection]` | Custom sections indexed by their `key` field |
| `font_size` | `str` | LaTeX document class font size, e.g. `"11pt"` |
| `layout_preamble` | `str` | `\newcommand` block defining density spacing — see [Layout spacing](#layout-spacing-system) |
| `xelatex_preamble` | `str` | `\usepackage{fontspec}`, `\usepackage{kotex}`, and Hangul font setup from `meta.yaml` |
| `section_titles` | `dict[str, str]` | Maps section keys to their display title strings; use `section_titles.get(key, 'Fallback')` instead of hard-coding strings |
| `link_text` | `function` | `link_text(url, label, style=None)` — renders the display text for a hyperlink respecting the active link-display setting |
| `contact_visible` | `function` | `contact_visible(key)` — returns `True` if the personal field with that key is enabled in user settings |
| `contact_link_style` | `function` | `contact_link_style(key)` — returns the effective link-display style (`"label"`, `"url"`, or `"both"`) for a personal link field |

**Always** place `<< layout_preamble >>` immediately after `\documentclass`, before any `\usepackage`. Place `<< xelatex_preamble >>` somewhere in the preamble before `\begin{document}`.

```latex
\documentclass[<< font_size >>,a4paper]{article}
<< layout_preamble >>
<< xelatex_preamble >>

\usepackage{geometry}
...
```

### Layout spacing system

`layout_preamble` injects four `\newcommand` definitions. Use these instead of hardcoded lengths:

| Command | Meaning | comfortable | balanced | compact |
|---------|---------|-------------|----------|---------|
| `\cvvgap` | Vertical gap between entries within a section | `8pt` | `4pt` | `2pt` |
| `\cvsecbefore` | Space before a section heading | `14pt` | `12pt` | `8pt` |
| `\cvsecafter` | Space after a section heading (before content) | `7pt` | `6pt` | `4pt` |
| `\cvitembefore` | `topsep` inside bullet lists | `4pt` | `2pt` | `1pt` |

Typical usage:

```latex
\titlespacing*{\section}{0pt}{\cvsecbefore}{\cvsecafter}

\newenvironment{cvitems}{%
  \begin{itemize}[...,topsep=\cvitembefore,...]%
}{\end{itemize}}

<% if not loop.last %>\vspace{\cvvgap}<% endif %>
```

Templates that hardcode these lengths break when the user changes density. Always use the commands.

### Jinja2 filters

Three filters are registered on the environment by `make_jinja_filters()` in `backend/renderers/latex/helpers.py`. They are available in every template and in the validation environment.

#### `name_size` — standard LaTeX size commands

Use on name headers that rely on `\Huge`, `\LARGE`, `\Large` etc.

| Name length | Returns |
|-------------|---------|
| ≤ 22 chars | `\Huge\bfseries` |
| 23–30 chars | `\LARGE\bfseries` |
| > 30 chars | `\Large\bfseries` |

Usage:

```latex
{<< cv.personal.name | name_size >> << cv.personal.name >>}\\[3pt]
```

**Column constraint:** `name_size` returns `\Huge` for short names. On a narrow sidebar or minipage column, `\Huge` would overflow. Do not apply `name_size` to any header inside a column narrower than roughly 60% of `\textwidth`. Use `name_fontsize` instead (scales down only, never up), or leave the header unstyled.

Templates excluded from `name_size` for this reason: `dealbook` (55% minipage), `studio-pop` (28% sidebar), `slate-rail` (34% sidebar panel).

#### `name_fontsize` — explicit point size

Use on name headers that specify an exact font size via `\fontsize{X}{Y}\selectfont`.

| Name length | Point size |
|-------------|-----------|
| ≤ 22 chars | `normal_pt` (unchanged) |
| 23–30 chars | `normal_pt − 3` |
| > 30 chars | `normal_pt − 5` |

Call signature: `name_fontsize(normal_pt, skip_ratio)` where `skip_ratio` is the leading multiplier.

```latex
{\fontsize{<< cv.personal.name | name_fontsize(26, 1.15) >>}{...}\selectfont << cv.personal.name >>}
```

This filter only ever scales down, so it is safe in narrow columns.

#### `shrink_if_long` — one-liner field guard

Returns `\small ` if `len(text.strip()) > threshold`, otherwise `''`. Use on one-liner fields next to a `\hfill` to prevent overflow.

Default threshold is 48. Use 40 for tighter horizontal space.

```latex
{<< job.title | shrink_if_long(48) >>\cvrole{<< job.title >>}} \hfill \cvdate{...}
{<< edu.degree | shrink_if_long(48) >>\cvorg{<< edu.degree >>}} \hfill \cvdate{...}
{<< proj.name | shrink_if_long(40) >>\cvrole{<< proj.name >>}}
```

Apply these filters to the four overflow-risk fields in every new template:

| Field | Recommended threshold |
|-------|----------------------|
| `job.title` | 48 (use 40 if sharing a line with company + date) |
| `edu.degree` | 48 (use 40 if sharing a line with institution + date) |
| `proj.name` | 40 |
| `cv.personal.name` | — use `name_size` or `name_fontsize` instead |

### Required macro pattern

Every template **must** define a `render_section(key)` macro and call it in a loop:

```jinja2
<% macro render_section(key) %>
<% if key == 'experience' and cv.experience %>
\section{<< section_titles.get('experience', 'Experience') >>}
...
<% endif %>

<# ... one block per section key ... #>

<% if key in custom_by_key %>
<# custom section rendering — see below #>
<% endif %>
<% endmacro %>

<% for key in section_order %>
<< render_section(key) >>
<% endfor %>
```

This pattern allows the user to reorder and enable/disable sections at runtime. Do not hard-code sections in document order outside of this macro.

---

## CV data model

All fields marked `?` are optional (`None` by default) and must be guarded with `<% if field %>` before use. Outputting `None` directly produces the literal string `"None"` in the LaTeX source.

### `cv.personal`

| Field | Type | Notes |
|-------|------|-------|
| `name` | `str` | Always present |
| `email` | `str` | Always present |
| `phone` | `str?` | |
| `location` | `str?` | |
| `linkedin` | `str?` | URL suffix only, e.g. `linkedin.com/in/handle` |
| `github` | `str?` | URL suffix only, e.g. `github.com/handle` |
| `website` | `str?` | |
| `huggingface` | `str?` | |
| `twitter` | `str?` | |
| `orcid` | `str?` | |
| `scholar` | `str?` | |
| `tagline` | `str?` | Short role/title line |
| `address` | `str?` | Full mailing address |
| `photo` | `str?` | Path to photo — check template support before using |

### `cv.summary`

`str?` — a plain paragraph. Always guard: `<% if cv.summary %>`.

### `cv.experience[]`

| Field | Type | Notes |
|-------|------|-------|
| `title` | `str` | Job title |
| `company` | `str` | Employer name |
| `start_date` | `str` | |
| `end_date` | `str?` | Use `"Present"` fallback: `<< job.end_date if job.end_date else "Present" >>` |
| `location` | `str?` | |
| `highlights` | `list[str]` | Bullet points; may be empty — always check `if job.highlights` before looping |
| `description` | `str?` | Prose alternative to highlights; guard before output |
| `tech_stack` | `list[str]` | Technologies used; may be empty |
| `contract_type` | `str?` | e.g. `"Full-time"`, `"Contract"` |

### `cv.education[]`

| Field | Type | Notes |
|-------|------|-------|
| `degree` | `str` | |
| `institution` | `str` | |
| `year` | `str?` | Graduation year; may be absent if `start_date`/`end_date` are used |
| `start_date` | `str?` | Used when a date range is preferred over a single year |
| `end_date` | `str?` | |
| `gpa` | `str?` | |
| `details` | `str?` | Extra prose (thesis title, honours, etc.) |
| `thesis` | `str?` | Thesis title |
| `courses` | `list[str]` | May be empty |

**Rule:** Always handle both `year` and `start_date`/`end_date`. A user may supply either form:

```jinja2
<% if edu.year %>
<< edu.year >>
<% elif edu.start_date %>
<< edu.start_date >> -- << edu.end_date if edu.end_date else "Present" >>
<% endif %>
```

Never output `<< edu.year >>` bare — it renders as `"None"` when the field is absent.

### `cv.skills[]`

| Field | Type |
|-------|------|
| `category` | `str` |
| `items` | `list[str]` |

Always join: `<< group.items | join(", ") >>` or render with a `for` loop.

### `cv.projects[]`

| Field | Type | Notes |
|-------|------|-------|
| `name` | `str` | |
| `description` | `str` | |
| `url` | `str?` | URL suffix; guard before wrapping in `\href` |
| `date` | `str?` | |
| `highlights` | `list[str]` | May be empty |
| `tech_stack` | `list[str]` | Technologies used; may be empty |
| `role` | `str?` | e.g. `"Lead Developer"` |

### `cv.publications[]`

| Field | Type | Notes |
|-------|------|-------|
| `title` | `str` | |
| `authors` | `list[str]` | **Always join:** `<< pub.authors | join(", ") >>` — never output bare |
| `venue` | `str?` | Conference or journal name |
| `date` | `str?` | |
| `url` | `str?` | |
| `description` | `str?` | |
| `doi` | `str?` | |
| `abstract` | `str?` | |

### `cv.certifications[]`

| Field | Type |
|-------|------|
| `name` | `str` |
| `issuer` | `str?` |
| `date` | `str?` |

### `cv.awards[]`

| Field | Type |
|-------|------|
| `name` | `str` |
| `issuer` | `str?` |
| `date` | `str?` |
| `description` | `str?` |

### `cv.languages[]`

| Field | Type |
|-------|------|
| `language` | `str` |
| `proficiency` | `str` |

### `cv.extracurricular[]`

| Field | Type |
|-------|------|
| `title` | `str` |
| `organization` | `str?` |
| `date` | `str?` |
| `highlights` | `list[str]` |

---

## Custom sections

Custom sections arrive via `custom_by_key`, a `dict` keyed by the section's `key` string (e.g. `"custom-languages-2"`). Every template must handle the `key in custom_by_key` case inside `render_section`, or custom sections silently disappear for that template.

Each `CustomSection` has:
- `title: str` — the section heading to display
- `content: list[CustomBlock]` — ordered list of content blocks

Each `CustomBlock` has:
- `type: str` — one of `"text"`, `"bullets"`, `"kv"`
- Extra fields accessible via `block.model_extra` (a plain `dict`)

### Standard rendering pattern

```jinja2
<% if key in custom_by_key %>
<% set cs = custom_by_key[key] %>
\section{<< cs.title >>}
<% for block in cs.content %>
<% set extras = block.model_extra %>
<% if block.type == 'text' %>
<< extras.get('value', '') >>
<% elif block.type == 'bullets' %>
\begin{itemize}[leftmargin=1.2em,noitemsep,topsep=2pt]
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

`pair.key` and `pair.value` use Jinja2 attribute access, which works for both dict keys and object attributes.

---

## `meta.yaml` reference

Every template directory must include `meta.yaml`. The app reads it at startup to populate the template picker UI and provide defaults for the reset button.

### Full annotated example

```yaml
display_name: "Human-readable name shown in the UI"
description: "One sentence describing the style and target audience"
audience: general       # one of: general, academic, corporate, engineering

ui:
  badge: ""             # badge shown in template picker
                        # one of: "" (none), "Default", "New", "Popular"

render:
  section_title_case: title   # how section titles are cased in section_titles{}
                               # one of: upper, lower, title  (default: title)
  xelatex:                    # optional — override Hangul font stacks
    hangul_main_fonts: ["Nanum Myeongjo", "UnBatang"]   # serif fallback chain
    hangul_sans_fonts: ["Nanum Gothic", "UnDotum"]      # sans-serif fallback chain
    hangul_mono_fonts: ["Nanum Gothic", "UnDotum"]      # monospace fallback chain

defaults:
  layout:
    density: balanced           # one of: comfortable, balanced, compact
    font_scale: normal          # one of: small, normal, large
  personal:
    default_link_display: label # one of: label, url, both
    fields:
      # Must be exactly these 8 keys in this exact order:
      - key: name
        visible: true
      - key: email
        visible: true
      - key: phone
        visible: true
      - key: location
        visible: true
      - key: website
        visible: true
        link_display: default   # link fields only: one of default, label, url, both
      - key: linkedin
        visible: true
        link_display: default
      - key: github
        visible: true
        link_display: default
      - key: huggingface
        visible: true
        link_display: default
  sections:
    # Must include all 10 built-in keys — no more, no fewer
    - key: summary
      title: "SUMMARY"
      visible: true
    - key: experience
      title: "EXPERIENCE"
      visible: true
    - key: education
      title: "EDUCATION"
      visible: true
    - key: skills
      title: "SKILLS"
      visible: true
    - key: projects
      title: "PROJECTS"
      visible: true
    - key: certifications
      title: "CERTIFICATIONS"
      visible: false
    - key: publications
      title: "PUBLICATIONS"
      visible: false
    - key: languages
      title: "LANGUAGES"
      visible: false
    - key: awards
      title: "AWARDS"
      visible: false
    - key: extracurricular
      title: "EXTRACURRICULAR ACTIVITIES"
      visible: false
```

### Field notes

**`render.xelatex`** (optional) — override the Hangul font fallback chains. If omitted, the app uses the system defaults: `["Nanum Myeongjo", "UnBatang"]` for serif and `["Nanum Gothic", "UnDotum"]` for sans/mono. The fonts are installed with `kotex`-compatible TeX Live setups; the fallback chain means the second font is used if the first isn't found.

**`defaults`** is the single source of truth for what "Reset to template defaults" restores. The entire block is validated strictly on startup — any missing required field or invalid value causes the whole `defaults` block to be silently replaced with `{}`. The template will still appear and render, but the reset button will have no effect. Always verify `defaults` is non-empty after adding a template by checking `GET /api/templates`.

**`defaults.personal.fields`** must contain exactly these 8 keys in this exact order: `name`, `email`, `phone`, `location`, `website`, `linkedin`, `github`, `huggingface`. Omitting a key, adding an extra key, or changing the order fails validation.

Link fields (`website`, `linkedin`, `github`, `huggingface`) must include a `link_display` key. Non-link fields (`name`, `email`, `phone`, `location`) must not include `link_display` — its presence on a non-link field fails validation.

**`defaults.sections`** must include all 10 built-in section keys, no more and no fewer.

**`render.section_title_case`** controls how built-in section titles are transformed at render time. `title` applies smart title casing; `upper` uppercases; `lower` lowercases. Custom section titles are passed through unchanged.

**`template`** is intentionally absent from `defaults` — reset must preserve the currently selected template.

---

## Compiler constraints

All templates compile with **xelatex** (`-interaction=nonstopmode`). The full xelatex package set is available.

Commonly used packages (pre-installed on standard TeX Live):

- `fontspec`, `unicode-math` — xelatex font selection (required)
- `kotex` — Korean text support (injected by `xelatex_preamble`)
- `ebgaramond`, `libertine`, `tgheros`, `lmodern` — font families
- `titlesec`, `enumitem`, `hyperref`, `microtype`, `xcolor`
- `array`, `parskip`, `etoolbox`, `tabularx`, `paracol`, `eso-pic`

**LuaLaTeX is not supported.** Use xelatex-compatible packages only. Do not use `pdflatex`-only packages like `inputenc` with `utf8` — xelatex handles UTF-8 natively.

---

## Validation

When the server starts, every template is validated in two stages:

1. **Jinja2 render** — rendered against a sample `CVData` object with `StrictUndefined`. Any undefined variable reference, undefined filter, or syntax error fails validation.
2. **xelatex compilation** — the rendered `.tex` is compiled. Any LaTeX error fails validation.

The validation environment registers the same Jinja2 filters (`name_size`, `name_fontsize`, `shrink_if_long`) as the render environment. Any filter call that does not appear in `make_jinja_filters()` in `backend/renderers/latex/helpers.py` will fail validation.

The validation result is cached and exposed via `GET /api/templates`. A template with `"valid": false` is still listed but flagged in the UI. Always verify both stages pass before shipping a new template.

To manually re-run validation for a single template:

```
POST /api/templates/{name}/validate
```

---

## CLI tools

The backend ships a command-line interface for template authors. These commands do not require the server to be running.

```bash
# Validate one template (Jinja2 render + xelatex compile)
python -m backend validate classic

# Validate all templates
python -m backend validate

# Generate PNG thumbnail for one template
# Requires: pip install pdf2image  and  poppler
#   macOS:  brew install poppler
#   Linux:  apt-get install poppler-utils
python -m backend thumbnails classic

# Generate thumbnails for all templates
python -m backend thumbnails
```

Thumbnails are written to `frontend/assets/template-previews/<slug>.png` and served by the template picker. Run this command after adding a new template so its card shows a preview image instead of the blank placeholder.

---

## Design principles

### One file per template

Each `cv.tex.j2` is fully self-contained. There are no shared includes, base templates, or partial files. This makes templates portable, diff-able, and independently testable.

### Section order is data, not code

The template never hard-codes section order. The `section_order` variable is the single source of truth, controlled by the user at render time. The `render_section` macro maps a key string to its LaTeX output; ordering is handled entirely by the calling loop.

### All optional fields are guarded

Every access to an optional field uses `<% if field %>` before output. Jinja2 renders Python `None` as the string `"None"`, which would appear verbatim in the PDF.

### Lists are never output bare

`list[str]` fields (`authors`, `items`, `highlights`, etc.) must be joined before output. `<< pub.authors >>` outputs the Python repr of a list. Use `<< pub.authors | join(", ") >>` or render with a `for` loop.

### Templates do not assume section presence

A section block only renders if its data exists (`and cv.experience`, `and cv.education`, etc.). The user may omit any section from their YAML, and the template must handle empty data gracefully.

### Education dates have two forms

Users may supply either `year` (a graduation year string) or `start_date`/`end_date` (a date range). Both forms are valid. Templates must handle the fallback; see the field reference above.

### Spacing is driven by layout commands, not hardcoded lengths

Every inter-entry gap and section spacing must use `\cvvgap`, `\cvsecbefore`, `\cvsecafter`, `\cvitembefore`. These are defined by `<< layout_preamble >>` and change when the user selects a different density. Hardcoded `\vspace{4pt}` values should only appear for structural spacing (e.g. a fixed gap in a sidebar header), not for content-driven spacing.

### Name headers use a filter, not a hardcoded size command

Do not write `{\LARGE\bfseries << cv.personal.name >>}`. Use the appropriate filter so long names step down automatically. Use `name_size` for full-width headers; `name_fontsize` for headers using explicit point sizes. See the filter reference above for the column-width constraint.

### Accent color is per-template identity

Each template defines its own color palette via `\definecolor`. Accent colors are intentionally distinct across templates:

| Template | Accent | Hex |
|----------|--------|-----|
| classic | none | — |
| ats-signal | Ink only | `#111111` |
| boardroom | Burgundy | `#7F1D1D` |
| chancellor | Crimson | `#B22222` |
| dealbook | Navy | `#1E3A5F` |
| foundry | Ink only | `#0A0A0A` |
| letterpress | Dark plum | `#4A1E3F` |
| masthead | Dark red | `#8C2A1C` |
| mono-forge | Burnt orange | `#D94B0F` |
| scholar-index | Deep indigo | `#1E3A8A` |
| signature-split | Plum | `#5B2A56` |
| skillboard | none | — |
| slate-rail | Navy sidebar | `#1A1A2E` |
| studio-pop | Dark teal sidebar | `#1B4F4F` |
| trackline | Forest green | `#116B4F` |

New templates should introduce a distinct accent rather than reusing an existing one.

### The boardroom header is a special case

The two-column minipage header in `boardroom` displays the first sentence of `cv.summary` as a tagline. Consequently, the `summary` section is suppressed in `render_section` to avoid duplication. If you adapt this layout, decide explicitly which rendering location owns the summary.
