# Template Meta-Driven Badges and Casing — Design Spec

**Date:** 2026-05-05  
**Status:** Approved

---

## Overview

Make two pieces of template behavior configurable from each template's own `meta.yaml` instead of hardcoded runtime maps:

- template picker badge labels
- built-in section title casing policy at LaTeX render time

The goal is to make adding a new template cheaper and safer. A new template should be able to declare its own badge and casing behavior in `backend/templates/<slug>/meta.yaml` without requiring follow-up edits in `frontend/templates.js` or `backend/renderers/latex.py`.

This change intentionally stays narrow. It does not attempt to move every template-related rule into metadata. It only replaces the current hardcoded `BADGES` map in the frontend and `_SECTION_TITLE_CASE_POLICY` map in the backend.

---

## Desired Outcome

After this change, a template can express these fields in `meta.yaml`:

```yaml
ui:
  badge: "New"

render:
  section_title_case: "upper"
```

Runtime behavior becomes:

- the frontend template picker shows `ui.badge` when present
- the LaTeX renderer applies `render.section_title_case` to built-in section titles only
- if either field is missing or malformed, runtime falls back safely

This preserves the existing template UX while removing two sources of duplicated template configuration.

---

## Metadata Contract

Two optional top-level objects are added to template metadata.

### `ui`

```yaml
ui:
  badge: "Popular"
```

Rules:

- `badge` must be a non-empty string to be used
- blank, non-string, or missing values behave as “no badge”
- validation-error badges still come from runtime validation status, not metadata

### `render`

```yaml
render:
  section_title_case: "title"
```

Allowed values:

- `upper`
- `lower`
- `title`

Rules:

- this policy applies only to built-in section keys
- custom section titles remain user-authored and unchanged
- missing or invalid values fall back to `title`

---

## Data Flow

### Backend meta loading

`backend/main.py` extends `_load_template_meta()` so the normalized template metadata returned by `/api/templates` also includes:

- `ui.badge`
- `render.section_title_case`

Normalization happens server-side so the frontend does not need to interpret malformed metadata. The API remains the single source of truth for template metadata consumed by the UI.

### Frontend template picker

`frontend/templates.js` stops using the local `BADGES` constant.

Instead:

- it reads `meta.ui.badge` from the template registry populated by `/api/templates`
- it shows that badge when present
- it still shows `⚠ Error` when template validation says the template is invalid

Runtime validation warning badges remain higher priority than decorative template badges.

### Backend LaTeX renderer

`backend/renderers/latex.py` stops using the hardcoded `_SECTION_TITLE_CASE_POLICY`.

Instead:

- it reads the normalized metadata for the active template
- it uses `render.section_title_case` to choose `upper`, `lower`, or smart `title` casing
- it continues to transform built-in section titles only

This keeps the current “uppercase in settings/chips, template-specific casing in PDF” behavior while moving the policy next to each template.

---

## Fallbacks and Safety

The runtime must stay resilient when a template omits these fields or defines them incorrectly.

Fallback policy:

- missing `ui.badge` -> no badge
- invalid `ui.badge` -> no badge
- missing `render.section_title_case` -> `title`
- invalid `render.section_title_case` -> `title`

The system should never fail template loading just because these optional fields are absent or malformed.

This keeps new-template authoring forgiving while preserving stable runtime behavior.

---

## Backward Compatibility

All current templates should be updated to declare the casing policy they already depend on so behavior remains unchanged after the hardcoded map is removed.

Examples:

- `ats-signal`, `dealbook`, `boardroom`, `foundry`, `skillboard`, `slate-rail`, `studio-pop`, `signature-split`, `mono-forge` -> `upper`
- `letterpress`, `trackline` -> `lower`
- `classic`, `chancellor`, `scholar-index`, `masthead` -> `title`

Only templates that should visibly show a picker badge need `ui.badge`.

---

## Files Affected

### Backend

- `backend/main.py`
  - normalize and expose `ui.badge`
  - normalize and expose `render.section_title_case`
- `backend/renderers/latex.py`
  - replace hardcoded casing map with metadata-driven lookup

### Frontend

- `frontend/templates.js`
  - replace hardcoded badge map with metadata-driven badge rendering

### Template metadata

- `backend/templates/*/meta.yaml`
  - add `render.section_title_case` for every template
  - add `ui.badge` only where the picker should show one

### Tests

- API tests for metadata exposure and normalization
- frontend template picker tests for badge rendering
- renderer tests for metadata-driven casing behavior and fallback behavior

---

## Testing

Verification should cover these guarantees:

1. `/api/templates` includes normalized `ui` and `render` metadata for templates.
2. The template picker uses `meta.ui.badge` instead of a local hardcoded map.
3. The LaTeX renderer uses `meta.render.section_title_case` instead of a local hardcoded map.
4. Invalid or missing metadata values fall back safely without breaking rendering or UI.

---

## Non-Goals

- moving recommended template lists or all picker behavior into metadata
- redesigning the full template metadata schema
- changing custom section title behavior
- changing template validation badge semantics
