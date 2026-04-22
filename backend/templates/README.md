# MKCV Template System

Guidelines for understanding, maintaining, and adding templates to MKCV.

---

## Directory layout

Each template lives in its own subdirectory under `backend/templates/`:

```
templates/
├── classic/
│   ├── cv.tex.j2      # required — Jinja2+LaTeX source
│   └── meta.yaml      # required — display metadata
├── banking/
│   ├── cv.tex.j2
│   └── meta.yaml
└── <your-template>/
    ├── cv.tex.j2
    └── meta.yaml
```

The app discovers templates at startup by scanning this directory. A folder is treated as a valid template only if it contains `cv.tex.j2`. A folder with only `meta.yaml` still appears in the template list but cannot be rendered — do not ship a template in that state.

---

## Template file: `cv.tex.j2`

### Jinja2 delimiters

The app configures a non-standard Jinja2 environment to avoid conflicts with LaTeX syntax:

| Purpose | Delimiter |
|---|---|
| Variable output | `<< variable >>` |
| Block tags (`if`, `for`, `macro`) | `<% tag %>` |
| Comments | `<# comment #>` |

Both `trim_blocks` and `lstrip_blocks` are enabled. `trim_blocks` removes the newline immediately after a block tag; `lstrip_blocks` strips leading whitespace before block tags. This means block tags consume their entire line without leaving blank lines in the output. Do not add extra blank lines around block tags expecting them to appear in the rendered `.tex`.

### Variables available in every template

| Variable | Type | Description |
|---|---|---|
| `cv` | `CVData` | The parsed CV object (see field reference below) |
| `section_order` | `list[str]` | Ordered list of section keys to render |
| `custom_by_key` | `dict[str, CustomSection]` | Custom sections indexed by their `key` field |
| `font_size` | `str` | LaTeX document class font size, e.g. `"11pt"` |
| `layout_preamble` | `str` | LaTeX `\newcommand` block defining density spacing (see below) |

Always place `<< layout_preamble >>` on its own line immediately after `\documentclass{...}`, before any `\usepackage` declarations. It emits the spacing commands that must be defined before the body uses them.

```latex
\documentclass[<< font_size >>,a4paper]{article}
<< layout_preamble >>

\usepackage{geometry}
...
```

### Layout spacing system

`layout_preamble` injects four `\newcommand` definitions that the template uses for density-aware spacing. Use these instead of hardcoded lengths:

| Command | Meaning | comfortable | balanced | compact |
|---|---|---|---|---|
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

Three filters are registered on the environment by `_make_jinja_filters()` in `backend/renderers/latex.py`. They are available in every template and in the validation environment.

#### `name_size` — standard LaTeX size commands

Use on name headers that already rely on `\Huge`, `\LARGE`, `\Large` etc.

| Name length | Returns |
|---|---|
| ≤ 22 chars | `\Huge\bfseries` |
| 23–30 chars | `\LARGE\bfseries` |
| > 30 chars | `\Large\bfseries` |

Usage pattern — the filter replaces both the size command **and** the bfseries declaration; the name is output once inside the same brace group:

```latex
{<< cv.personal.name | name_size >> << cv.personal.name >>}\\[3pt]
```

**Column constraint:** `name_size` returns `\Huge` for short names. On a full-width centered header this is correct. On a narrow sidebar or minipage column, `\Huge` would make a short name *larger* than the template's intended size and overflow the column. Do not apply `name_size` on any header that lives inside a column narrower than roughly 60% of `\textwidth`. Use `name_fontsize` instead (it scales down only, never up), or leave the name header unstyled.

Templates in this repo that are excluded from `name_size` for this reason: `banking` (55% minipage), `hipster` (28% sidebar), `sidebar-minimal` (34% sidebar panel), `sidebar-portrait` (sidebar panel).

#### `name_fontsize` — explicit point size

Use on name headers that specify an exact font size via `\fontsize{X}{Y}\selectfont`, e.g. `modern-startup`'s 26pt EB Garamond header.

| Name length | Point size |
|---|---|
| ≤ 22 chars | `normal_pt` (unchanged) |
| 23–30 chars | `normal_pt − 3` |
| > 30 chars | `normal_pt − 5` |

Call signature: `name_fontsize(normal_pt, skip_ratio)` where `skip_ratio` is the leading multiplier the template already uses.

```latex
{\ebgaramond<< cv.personal.name | name_fontsize(26, 1.15) >> << cv.personal.name >>}
```

This filter only ever scales the size down, so it is safe in narrow columns.

#### `shrink_if_long` — one-liner field guard

Returns `\small ` if `len(text.strip()) > threshold`, otherwise `''`. Use on one-liner fields that sit next to a `\hfill` — if the field is long the `\small` shrinks just that field; if it is normal length the empty string is a harmless no-op brace group.

Default threshold is 48. Use 40 for fields where horizontal space is tighter (e.g. when company, title, and date share the same line).

```latex
{<< job.title | shrink_if_long(48) >>\cvorg{<< job.title >>}} \hfill \cvdate{...}
{<< edu.degree | shrink_if_long(48) >>\cvorg{<< edu.degree >>}} \hfill \cvdate{...}
{<< proj.name | shrink_if_long(40) >>\cvrole{<< proj.name >>}}
```

Apply these filters to the four danger-zone fields in every new template:

| Field | Recommended threshold |
|---|---|
| `job.title` | 48 (40 if title shares a line with company + date) |
| `edu.degree` | 48 (40 if degree shares a line with institution + date) |
| `proj.name` | 40 |
| `cv.personal.name` | — use `name_size` or `name_fontsize` instead |

### Required macro pattern

Every template **must** define a `render_section(key)` macro and call it in a loop:

```jinja2
<% macro render_section(key) %>
<% if key == 'experience' and cv.experience %>
\section{Experience}
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

This pattern is what allows the user to reorder and enable/disable sections at runtime. Do not hard-code sections in document order outside of this macro.

---

## CV data model — field reference

All fields marked `?` are optional (`None` by default) and must be guarded with `<% if field %>` before use. Outputting `None` directly produces the literal string `"None"` in the LaTeX source.

### `cv.personal`

| Field | Type | Notes |
|---|---|---|
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

### `cv.summary`

`str?` — a plain paragraph. Guard with `<% if cv.summary %>`.

### `cv.experience[]`

| Field | Type | Notes |
|---|---|---|
| `title` | `str` | Job title |
| `company` | `str` | Employer name |
| `start_date` | `str` | |
| `end_date` | `str?` | Use `"Present"` fallback: `<< job.end_date if job.end_date else "Present" >>` |
| `location` | `str?` | |
| `highlights` | `list[str]` | Bullet points; may be empty |
| `description` | `str?` | Prose alternative to highlights |

### `cv.education[]`

| Field | Type | Notes |
|---|---|---|
| `degree` | `str` | |
| `institution` | `str` | |
| `year` | `str?` | Graduation year; may be absent if `start_date`/`end_date` are used |
| `start_date` | `str?` | Used when a date range is preferred over a single year |
| `end_date` | `str?` | |
| `gpa` | `str?` | |
| `details` | `str?` | Extra prose (thesis title, honours, etc.) |
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
|---|---|
| `category` | `str` |
| `items` | `list[str]` |

Always join with `| join(", ")` or a custom separator.

### `cv.projects[]`

| Field | Type | Notes |
|---|---|---|
| `name` | `str` | |
| `description` | `str` | |
| `url` | `str?` | URL suffix; guard before wrapping in `\href` |
| `date` | `str?` | |
| `highlights` | `list[str]` | May be empty |

### `cv.publications[]`

| Field | Type | Notes |
|---|---|---|
| `title` | `str` | |
| `authors` | `list[str]` | **Always join:** `<< pub.authors \| join(", ") >>` — never output bare |
| `venue` | `str?` | Conference or journal name |
| `date` | `str?` | |
| `url` | `str?` | |
| `description` | `str?` | |
| `doi` | `str?` | |

### `cv.certifications[]`

| Field | Type |
|---|---|
| `name` | `str` |
| `issuer` | `str?` |
| `date` | `str?` |

### `cv.awards[]`

| Field | Type |
|---|---|
| `name` | `str` |
| `issuer` | `str?` |
| `date` | `str?` |
| `description` | `str?` |

### `cv.languages[]`

| Field | Type |
|---|---|
| `language` | `str` |
| `proficiency` | `str` |

### `cv.extracurricular[]`

| Field | Type |
|---|---|
| `title` | `str` |
| `organization` | `str?` |
| `date` | `str?` |
| `highlights` | `list[str]` |

---

## Custom sections

Custom sections arrive via `custom_by_key`, a `dict` keyed by the section's `key` string (e.g. `"custom-languages-2"`). Every template must handle the `key in custom_by_key` case inside `render_section`, or custom sections will silently disappear for that template.

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

`pair.key` and `pair.value` use Jinja2 attribute access, which works for both dict keys and object attributes — no need to change this to `pair['key']`.

---

## `meta.yaml` — required fields

Every template directory must include `meta.yaml`. The app reads it at startup to populate the template picker UI.

```yaml
display_name: "Human-readable name shown in the UI"
description: "One sentence describing the style and target audience"
audience: general          # one of: general, academic, corporate, engineering
recommended_sections:      # sections the UI highlights as "recommended" for this template
  - publications
  - awards
default_section_order:     # full ordered list used when user has no custom order saved
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

`default_section_order` should reflect the template's intended audience — academic templates lead with education and publications; engineering templates lead with experience and projects.

---

## Compiler constraints

All templates must compile with **pdflatex** (`-interaction=nonstopmode`). XeLaTeX or LuaLaTeX features are not available in the app's render pipeline.

Allowed font packages (pre-installed on standard TeX Live):
- `ebgaramond`, `libertine`, `tgheros`, `lmodern`
- `titlesec`, `enumitem`, `hyperref`, `microtype`, `xcolor`
- `array`, `parskip`, `etoolbox`, `tabularx`, `paracol`, `eso-pic`

Do not use `fontspec`, `unicode-math`, or any package that requires an engine other than pdflatex.

---

## Validation

When the server starts, every template is validated in two stages:

1. **Jinja2 render** — rendered against a sample `CVData` object with `StrictUndefined`. Any undefined variable reference, undefined filter, or syntax error fails validation.
2. **pdflatex compilation** — the rendered `.tex` is compiled. Any LaTeX error fails validation.

The validation environment registers the same Jinja2 filters (`name_size`, `name_fontsize`, `shrink_if_long`) as the render environment. Any filter call that does not appear in `_make_jinja_filters()` in `backend/renderers/latex.py` will fail validation.

The validation result is cached and exposed via `GET /api/templates`. A template with `"valid": false` is still listed but flagged in the UI. Always verify both stages pass before shipping a new template.

To manually re-run validation for a single template:

```
POST /api/templates/{name}/validate
```

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

Every inter-entry gap and section spacing must use `\cvvgap`, `\cvsecbefore`, `\cvsecafter`, `\cvitembefore`. These are defined by `<< layout_preamble >>` and change when the user selects a different density. Hardcoded `\vspace{4pt}` values override the density system and should only appear where the spacing is structural (e.g. a fixed gap in a sidebar header), not content-driven.

### Name headers use a filter, not a hardcoded size command

Do not write `{\LARGE\bfseries << cv.personal.name >>}`. Instead use the appropriate filter so long names step down automatically. Use `name_size` for full-width headers; `name_fontsize` for headers using explicit point sizes. See the filter reference above for the column-width constraint.

### Accent color is per-template identity

Each template defines its own color palette via `\definecolor`. Accent colors are intentionally distinct across templates so users can visually identify which template a PDF was produced with:

| Template | Accent | Hex |
|---|---|---|
| classic | none | — |
| heritage | Crimson | `#B22222` |
| academic-research | Deep indigo | `#1E3A8A` |
| executive-corporate | Burgundy | `#7F1D1D` |
| modern-startup | Ink only | `#0A0A0A` |
| banking | Navy | `#1E3A5F` |
| column-skills | none | — |
| hipster | Dark teal sidebar | `#1B4F4F` |
| resume-tech | Ink only | `#111111` |
| sidebar-minimal | Navy sidebar | `#1A1A2E` |
| sidebar-portrait | varies | — |

New templates should introduce a distinct accent rather than reusing an existing one.

### The executive-corporate header is a special case

The two-column minipage header in `executive-corporate` displays the first sentence of `cv.summary` as a tagline. Consequently, the `summary` section is suppressed in `render_section` to avoid duplication. If you adapt this layout, decide explicitly which rendering location owns the summary.

---

## Adding a new template — checklist

1. Create `templates/<your-name>/` — use lowercase with hyphens, no spaces.
2. Write `cv.tex.j2`:
   - Place `\documentclass[<< font_size >>,a4paper]{article}` and `<< layout_preamble >>` at the top.
   - Use the correct Jinja2 delimiters (`<< >>`, `<% %>`, `<# #>`).
   - Use `\cvvgap`, `\cvsecbefore`, `\cvsecafter`, `\cvitembefore` for all content spacing.
   - Apply `name_size` (full-width header) or `name_fontsize` (explicit-pt header) to `cv.personal.name`. Skip both if the name lives in a narrow column (< ~60% textwidth).
   - Apply `shrink_if_long` to `job.title`, `edu.degree`, and `proj.name` using the thresholds in the filter reference.
   - Define `\newcommand{\cvrole}`, `\newcommand{\cvorg}`, `\newcommand{\cvdate}`.
   - Implement the `render_section(key)` macro covering all standard sections and the `custom_by_key` block.
   - Guard every optional field; use the two-form date fallback for `edu.year`.
   - Join all list fields before output.
   - Compile with pdflatex only — no `fontspec`, no XeLaTeX packages.
3. Write `meta.yaml` with all required fields.
4. Restart the server and confirm `"valid": true` in `GET /api/templates`.
5. Test with a real YAML file — verify custom sections render, section reordering works, and optional fields (no phone, no github, etc.) produce no LaTeX errors.
6. Test with a very long name (> 30 chars) and a very long job title (> 48 chars) to confirm the filter output is correct and the PDF compiles without overfull hbox warnings.
