# Auto Layout Adjustment Design

**Date:** 2026-04-22  
**Status:** Approved

## Overview

Add automatic, conservative typography adjustments that activate only when content is near overflow. When fields are normal length, nothing changes. When a name, title, or other one-liner is borderline too long, a small LaTeX size command kicks in to prevent awkward wrapping or overfull hboxes.

All logic lives in the renderer. Templates get small, surgical filter annotations on known danger-zone fields only.

---

## 1. Renderer Changes

### New function: `_make_jinja_filters()`

Added to `backend/renderers/latex.py`. Returns a dict of three Jinja2 filter functions, registered on the environment inside `LaTeXRenderer.render()` via `env.filters.update(...)`.

#### `name_size(name: str) -> str`

For templates whose name header uses standard LaTeX size commands (`\Huge`, `\LARGE`, etc.).

| Name length | Returns |
|---|---|
| ≤ 22 chars | `\Huge\bfseries` (no change) |
| 23–30 chars | `\LARGE\bfseries` |
| > 30 chars | `\Large\bfseries` |

#### `name_fontsize(name: str, normal_pt: float, skip_ratio: float) -> str`

For templates using explicit `\fontsize{X}{Y}\selectfont` in the name header (e.g. `modern-startup` with 26pt EB Garamond). Steps the point size down by ~3pt per threshold tier, preserving the template's own leading ratio.

| Name length | Point size |
|---|---|
| ≤ 22 chars | `normal_pt` (no change) |
| 23–30 chars | `normal_pt - 3` |
| > 30 chars | `normal_pt - 5` |

Returns: `\fontsize{Xpt}{Ypt}\selectfont`

#### `shrink_if_long(text: str, threshold: int = 48) -> str`

General-purpose. Returns `\small ` if `len(text.strip()) > threshold`, otherwise `''`. Used on one-liner fields where a `\hfill` pattern can overflow.

---

## 2. Template Changes

All 11 templates (`academic-research`, `banking`, `classic`, `column-skills`, `executive-corporate`, `heritage`, `hipster`, `modern-startup`, `resume-tech`, `sidebar-minimal`, `sidebar-portrait`) receive filter annotations on four danger-zone fields only.

### Danger zones and thresholds

| Field | Filter call | Threshold | Why |
|---|---|---|---|
| `cv.personal.name` (header) | `name_size` or `name_fontsize` | 22 / 30 chars | Largest text on page; overflow is most visible |
| `job.title` (experience row) | `shrink_if_long` | 48 chars | Title + `\hfill` + date range can exceed line width |
| `edu.degree` (education row) | `shrink_if_long` | 48 chars | Same `\hfill` pattern |
| `proj.name` (projects row) | `shrink_if_long` | 40 chars | Shorter threshold; name often sits next to description |

### Edit pattern

```latex
% before
\textbf{<< job.title >>} \hfill << job.start_date >> -- << job.end_date >>

% after
{<< job.title | shrink_if_long(48) >>\textbf{<< job.title >>}} \hfill << job.start_date >> -- << job.end_date >>
```

When `shrink_if_long` returns `''`, the outer braces are a harmless no-op group in LaTeX. When it returns `\small `, only the immediately enclosed content is affected — scoped strictly to that one field.

### Name header: which filter per template

During implementation, each template is inspected to determine whether it uses:
- **Standard size commands** → use `name_size`: `{<< cv.personal.name | name_size >> << cv.personal.name >>}`
- **Explicit `\fontsize{X}{Y}`** → use `name_fontsize` with the template's specific base pt and skip: `{<< cv.personal.name | name_fontsize(26, 1.18) >><< cv.personal.name >>}`

Name scaling is **not applied** to templates where the name header lives inside a narrow column, because `name_size` returns `\Huge` for short names — which would make short names *larger* than the original size and overflow the column. Excluded templates and reasons:

| Template | Reason |
|---|---|
| `banking` | Name in a 55% minipage; `\Huge` on a short name would overflow the column |
| `hipster` | Name in a 28% dark sidebar; column is too narrow for any upscaling |
| `sidebar-minimal` | Name in a sidebar panel; same constraint as `hipster` |
| `sidebar-portrait` | Name in a sidebar panel; same constraint as `hipster` |

### Threshold exceptions

`executive-corporate` uses threshold **40** (not 48) for both `job.title` and `edu.degree`. This template places company, title, and date range all on the same line (e.g. `Company — Title \hfill Date`), leaving less horizontal room than a `\hfill` split across two elements. Threshold 40 prevents overflow on that tighter layout.

---

## 3. Explicit Out of Scope

- Summary paragraph text (wraps naturally)
- Bullet list items (variable length is expected)
- Skill item lists (comma-separated, already flexible)
- Certifications, languages, awards (short by convention)
- Exposing any of these thresholds or filters as user-facing controls
- Markdown renderer (unaffected)
- `microtype` configuration changes (already loaded per-template; defaults are sufficient)

---

## 4. Behaviour Summary

| Content length | Visual effect |
|---|---|
| Normal (under threshold) | Zero change — identical output to today |
| Near overflow (over threshold) | One size step smaller on that field only |
| Extreme overflow (still over threshold after reduction) | LaTeX wraps naturally; no further intervention |

The goal is robustness in borderline cases, not forcing everything to fit at all costs.
