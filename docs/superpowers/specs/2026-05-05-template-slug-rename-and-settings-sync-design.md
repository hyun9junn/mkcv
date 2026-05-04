# Template Slug Rename and Settings Sync — Design Spec

**Date:** 2026-05-05  
**Status:** Approved  

---

## Overview

Rename the template slugs themselves to match the new branding, then make the runtime treat those new slugs as the only valid identifiers. This includes the backend template directory names, the API template list, the frontend settings schema, autocomplete suggestions, tests, and the template picker.

At the same time, fix the current template-selection sync bug by giving template changes a single source of truth. Changing the template from the dropdown must update `settings.yaml`, and changing `template:` inside `settings.yaml` must update the actual selected template, preview, and template defaults.

This is a **hard cut**. Old slugs are removed rather than aliased.

---

## Canonical Slugs

The runtime template ids become:

| Old slug | New slug |
|---|---|
| `classic` | `classic` |
| `academic-research` | `scholar-index` |
| `banking` | `dealbook` |
| `brutalist-mono` | `mono-forge` |
| `column-skills` | `skillboard` |
| `editorial-magazine` | `masthead` |
| `executive-corporate` | `boardroom` |
| `gazette` | `letterpress` |
| `heritage` | `chancellor` |
| `hipster` | `studio-pop` |
| `modern-startup` | `foundry` |
| `resume-tech` | `ats-signal` |
| `sidebar-minimal` | `slate-rail` |
| `split-header` | `signature-split` |
| `timeline-vertical` | `trackline` |

These slugs become the canonical names for:
- template folder names under `backend/templates/`
- backend template discovery and validation endpoints
- `settings.yaml -> template`
- frontend `VALID_TPL`
- autocomplete suggestions for `template:`
- tests and fixtures that name templates explicitly

---

## Hard Cut Policy

Old slugs are not accepted as aliases anywhere in the live codepath.

### Runtime behavior

- `/api/templates` returns only the new slugs.
- The template picker renders and selects only the new slugs.
- Backend preview/export/validate uses only the new slugs.
- The frontend settings parser recognizes only the new slugs as valid `template:` values.

### Invalid `template:` handling in `settings.yaml`

If `settings.yaml` contains an unknown template value, including any removed old slug:

- the settings parser emits a warning
- the effective applied template becomes `classic`
- the visible picker and preview also move to `classic`
- the invalid literal is not preserved as an active runtime selection

This keeps the system predictable and avoids half-valid UI states.

---

## Selection Architecture

The current bug exists because template changes flow through two disconnected paths:

- dropdown selection updates `app.state.template` directly
- settings parsing stores `template:` in parsed settings but does not apply it back to the actual UI/template state

The fix is to introduce a single template-selection entry point on the frontend.

### New frontend responsibilities

#### `templateUI.selectTemplate(name, opts)`

`frontend/templates.js` exposes a public selection function that is the only place allowed to apply a template to the live UI.

It is responsible for:
- validating/canonicalizing the requested slug against the current template registry
- updating `app.state.template`
- updating the selected option in the dropdown
- updating the preview pane title
- refreshing preview
- optionally applying template defaults
- optionally syncing the change back into `settings.yaml`

#### `settingsSync`

`frontend/settings-sync.js` remains responsible for serializing and parsing `settings.yaml`, but it no longer owns direct UI template selection.

It gains explicit helper behavior for:
- setting `template:` in the settings document
- reacting to parsed `template:` changes by calling `templateUI.selectTemplate(...)`
- preventing infinite loops when a template change originates from the dropdown and is then reflected back through the settings editor

---

## Behavior Rules

### Flow 1: Dropdown -> settings.yaml -> preview

When the user selects a template from the sidebar dropdown:

1. `templateUI.selectTemplate(newSlug, { syncSettings: true, applyDefaults: true })` runs
2. the UI selection changes immediately
3. `settings.yaml` is rewritten so `template:` becomes the new slug
4. that template's defaults are applied
5. preview refreshes using the new template

### Flow 2: settings.yaml -> dropdown -> preview

When the user edits `template:` in the settings tab:

1. settings parsing detects the template change
2. if valid, `templateUI.selectTemplate(newSlug, { syncSettings: false, applyDefaults: true })` runs
3. the dropdown, app state, preview title, and preview all update
4. template defaults are applied once

### Flow 3: Invalid settings template

When the user types an invalid template value:

1. settings parsing emits a warning
2. the effective template becomes `classic`
3. the UI reflects `classic`
4. preview renders with `classic`

### Flow 4: Reset settings button

The existing reset/defaults button continues to use the currently active live template:

```js
window.templateRegistry?.getDefaults(app.state.template)
```

No behavior change is needed there except that `app.state.template` must now always be trustworthy.

---

## Template Defaults Policy

Changing the selected template should apply that template's defaults. This includes:
- layout density
- font scale
- personal/contact field defaults
- section titles
- section visibility
- section ordering

This applies whether the change comes from:
- the template dropdown
- `settings.yaml`
- the reset/defaults button

The active template must therefore be passed into template-default normalization every time, rather than inferred from stale settings state.

---

## Files Affected

### Backend

- rename template directories in `backend/templates/`
- update default template string(s) such as `template: str = "classic"` only where needed to remain valid under the new canonical list
- update any tests or code that reference old slug names directly

### Frontend

- `frontend/settings-engine.js`
  - replace `VALID_TPL` with the new slug list
  - keep `classic` as default template
  - treat unknown template values as warnings with effective fallback to `classic`
- `frontend/templates.js`
  - add public template selection API
  - replace old badge/default slug references
  - route picker changes through the new unified selection path
- `frontend/settings-sync.js`
  - apply parsed template changes to the actual live UI
  - expose/update settings helpers for template changes
  - avoid re-entrant loops between picker changes and settings writes
- `frontend/yaml-autocomplete.js`
  - update `template:` suggestion values to the new slug list

### Tests

- Python tests naming templates directly
- JS tests that assert `VALID_TPL`, template defaults, settings sync, picker behavior, or autocomplete suggestions
- add regression coverage for both directions of template synchronization

---

## Docs Policy

Only runtime code, active tests, and user-facing behavior are updated to the new slugs.

Historical planning/spec documents under `docs/superpowers/specs/` and `docs/superpowers/plans/` are left as historical records unless they are directly used as executable test inputs or live runtime references.

This avoids rewriting prior design history just for terminology cleanup.

---

## Testing

Verification should cover four guarantees:

1. Selecting a template in the dropdown updates `settings.yaml`.
2. Selecting a template in the dropdown changes the actual rendered template and applies its defaults.
3. Editing `settings.yaml -> template:` updates the dropdown, live app state, preview, and defaults.
4. Invalid `template:` values trigger a warning and use `classic` as the effective template.

Recommended coverage areas:
- `/api/templates` metadata/list tests
- template meta/default-reset tests
- settings sync tests
- autocomplete tests for `template:`
- preview/render tests using renamed slugs

---

## Out of Scope

- backward-compatibility aliases for old slugs
- migration of historical docs just for naming consistency
- broader template registry refactors beyond what is needed for slug rename + sync correctness
