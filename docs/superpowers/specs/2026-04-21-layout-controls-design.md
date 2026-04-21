# Layout Controls Design

**Date:** 2026-04-21  
**Status:** Approved

## Overview

Replace any future low-level typography knobs with two high-level layout presets exposed in the toolbar:

- **Density** — Comfortable / Balanced / Compact (controls vertical spacing)
- **Font Scale** — Small / Normal / Large (controls base font size)

Templates handle all layout robustness internally. These controls adjust spacing and typography through a controlled set of LaTeX commands — users never touch raw dimensions.

---

## 1. API & Data Model

`CVRequest` (in `backend/main.py`) gains two optional fields:

```python
density: str = "balanced"    # "comfortable" | "balanced" | "compact"
font_scale: str = "normal"   # "small" | "normal" | "large"
```

Both fields default to `"balanced"` and `"normal"`. They are passed through to all endpoints that invoke `LaTeXRenderer`:

- `POST /api/preview/pdf`
- `POST /api/export/pdf`
- `POST /api/export/latex`

The startup `_validate_template` function always renders with defaults and is unaffected.

---

## 2. Renderer — Preset Lookup & Injection

`LaTeXRenderer.__init__` gains `density: str = "balanced"` and `font_scale: str = "normal"` parameters.

### Lookup tables (in `backend/renderers/latex.py`)

```python
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
```

Unknown values silently fall back to `"balanced"` / `"normal"` — no errors raised.

### Resolved `layout_preamble` variable

The renderer resolves the two inputs and passes two things to Jinja2:

- `font_size` — a string like `"11pt"`, used directly in `\documentclass[<< font_size >>]{article}`
- `layout_preamble` — a LaTeX snippet defining spacing commands:

```latex
\newcommand{\cvvgap}{4pt}
\newcommand{\cvsecbefore}{12pt}
\newcommand{\cvsecafter}{6pt}
\newcommand{\cvitembefore}{2pt}
```

This snippet is passed into every `template.render(...)` call alongside `cv`, `section_order`, and `custom_by_key`.

---

## 3. Frontend

### State

`app.state` gains two fields (in `frontend/app.js`):

```js
density: "balanced",
font_scale: "normal",
```

On `DOMContentLoaded`, both are read from `localStorage` (keys `mkcv_density`, `mkcv_font_scale`) and fall back to the defaults above.

### Toolbar controls

Two segmented button groups are inserted in the toolbar HTML (`frontend/index.html`), after the template `<select>`:

```
[ Density  Comfortable | Balanced | Compact ]   [ Font  S | M | L ]
```

Styling: each group is a bordered inline-flex container. The label ("Density", "Font") is a non-interactive prefix. Active segment gets a blue highlight (`#3a5a8a` background, white text); inactive segments are dimmed.

### Interaction

Clicking a segment:
1. Updates `app.state.density` or `app.state.font_scale`
2. Writes the new value to `localStorage`
3. Triggers a preview refresh via the existing debounce path

### API calls

`density` and `font_scale` are included in the JSON body of every fetch to:
- `/api/preview/pdf`
- `/api/export/pdf`
- `/api/export/latex`

Markdown export (`/api/export/markdown`) does not use `LaTeXRenderer` and is unaffected — do not add these fields there.

Relevant JS files to update: `preview.js`, `export.js`.

---

## 4. Template Changes

Each `cv.tex.j2` receives two mechanical changes:

### 4a. Add `layout_preamble` include

Immediately after `\documentclass[...]{article}`:

```latex
\documentclass[11pt,a4paper]{article}
<< layout_preamble >>
```

The hardcoded font size in `\documentclass` is replaced with the `font_size` Jinja2 variable:

```latex
\documentclass[<< font_size >>]{article}
<< layout_preamble >>
```

`font_size` is resolved by the renderer from `font_scale` (e.g. `"normal"` → `"11pt"`) and passed directly — it does not go through `layout_preamble`.

### 4b. Replace hardcoded spacing with cv commands

| Pattern replaced | Command used |
|---|---|
| `\vspace{Xpt}` between section items | `\vspace{\cvvgap}` |
| `\titlespacing{\section}{0pt}{Xpt}{Ypt}` | `\titlespacing{\section}{0pt}{\cvsecbefore}{\cvsecafter}` |
| `[topsep=Xpt]` on itemize/enumerate | `[topsep=\cvitembefore]` |

Only values that appear in each template are replaced. Template-specific macros (e.g. `\dateW` in `banking`) are left untouched.

Templates affected: all 11 in `backend/templates/` (`academic-research`, `banking`, `classic`, `column-skills`, `executive-corporate`, `heritage`, `hipster`, `modern-startup`, `resume-tech`, `sidebar-minimal`, `sidebar-portrait`).

---

## Out of Scope

- Per-template preset overrides (templates cannot declare their own density/font defaults)
- Exposing raw LaTeX length values to the user
- A "Custom" preset with free-form inputs
- Markdown export layout (Markdown renderer is unaffected)
