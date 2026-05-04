# Template Default Settings Reset — Design Spec

**Date:** 2026-05-04

## Summary

Replace the current "Reset order" action with a template-aware "Reset settings" action. Each template's `meta.yaml` will define a `defaults` block that mirrors `settings.yaml` except for `template`. Clicking the reset button restores the current template's default density, font scale, link display, section order, section visibility, and section titles without changing the selected template.

## Goals

- Make section reset behavior template-specific instead of global.
- Let template authors define default section titles and visibility alongside order.
- Allow template metadata to define layout defaults (`density`, `font_scale`, `link_display`) in one place.
- Keep the current selected template unchanged when resetting settings.

## Non-Goals

- Do not switch `app.state.template` during reset.
- Do not change resume content beyond the existing section reordering / invisible-area handling needed to match the reset section state.
- Do not require a separate `defaults.yaml` file per template.

## Data Model

Each template `meta.yaml` gains a `defaults` block:

```yaml
display_name: "Classic"
description: "..."
audience: general

defaults:
  layout:
    density: balanced
    font_scale: normal
  personal:
    link_display: label
  sections:
    - key: summary
      title: "SUMMARY"
      visible: true
    - key: experience
      title: "EXPERIENCE"
      visible: true
```

Rules:

- `defaults.sections` is the single source of truth for default section order.
- Each section entry may define `key`, `title`, and `visible`.
- `template` is intentionally omitted from `defaults`.
- Missing `defaults` fields fall back to the app-wide defaults already defined in `frontend/settings-engine.js`.

## Backend Behavior

- Extend `_load_template_meta()` in `backend/main.py` to include `defaults`.
- Return `defaults` from `GET /api/templates` as part of the existing `meta` payload.
- Preserve backward compatibility for templates that do not yet define `defaults` by returning a safe empty/default structure.

## Frontend Behavior

- Rename the toolbar button label from "Reset order" to "Reset settings".
- On click, read the current template's `meta.defaults`.
- Build a replacement settings object by:
  - starting from the app-wide default settings shape,
  - overlaying `meta.defaults`,
  - preserving the current `template` field from the active settings state.
- Apply the resulting settings through the existing settings sync path so that:
  - toolbar state updates,
  - section chips rebuild with reset order / visibility / titles,
  - `settings.yaml` updates,
  - preview refreshes once,
  - `resume.yaml` section order is normalized to the reset order.

## Template Metadata Update

- Add a complete `defaults` block to every template under `backend/templates/*/meta.yaml`.
- Use template-appropriate defaults rather than cloning one universal preset.
- Existing `recommended_sections` and `default_section_order` stop being the source of reset behavior. They may remain temporarily for compatibility or be removed if no longer needed by the UI.

## Error Handling

- If the active template has no `meta.defaults`, fall back to the app-wide default settings object.
- If a `defaults.sections` entry is malformed, ignore the bad entry and continue with remaining defaults.
- If the template metadata request fails, the reset action should still fall back to app-wide defaults rather than becoming unavailable.

## Testing

- API test: `GET /api/templates` includes `meta.<template>.defaults`.
- Frontend reset test: reset preserves the current template name.
- Frontend reset test: reset restores density, font scale, and link display from template defaults.
- Frontend reset test: reset restores section order, visibility, and titles from template defaults.
- Metadata coverage test: every template `meta.yaml` contains a valid `defaults` block.
