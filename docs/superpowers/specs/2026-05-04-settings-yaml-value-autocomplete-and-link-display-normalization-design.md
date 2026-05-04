# Settings YAML Value Autocomplete and Link Display Normalization — Design Spec

**Date:** 2026-05-04  
**Status:** Approved

---

## Overview

Improve the `settings.yaml` editing experience without introducing schema ambiguity.

This change has two linked goals:

1. Add value-only autocomplete for `settings.yaml`, with the same quick Tab-accept feel as `resume.yaml`
2. Normalize the contact link-display schema so the saved YAML is explicit and unambiguous

The key constraint is editor safety: the app uses a single shared CodeMirror instance for both tabs, so `resume.yaml` completions and `settings.yaml` completions must never bleed into each other.

---

## Goals

- Support value suggestions in `settings.yaml` for fixed-enum fields only
- Keep key completion disabled for `settings.yaml`
- Ensure autocomplete is tab-aware so `resume` and `settings` contexts cannot cross-trigger
- Replace the ambiguous global `personal.link_display` name with `personal.default_link_display`
- Move link-field settings to an explicit saved format instead of an omission-based inheritance model
- Preserve smooth editing for existing files through parse-time compatibility and save-time normalization

## Non-Goals

- Adding key completion for `settings.yaml`
- Reworking `resume.yaml` autocomplete behavior beyond tab isolation
- Expanding the personal field catalog
- Changing non-link personal fields to support display-style settings

---

## Schema

### New canonical `settings.yaml` shape

```yaml
personal:
  default_link_display: label  # label | url | both
  fields:
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
      link_display: default   # default | label | url | both
    - key: linkedin
      visible: true
      link_display: default
    - key: github
      visible: true
      link_display: url
    - key: huggingface
      visible: true
      link_display: default
```

### Semantics

- `personal.default_link_display` is the global default for link-style rendering
- Link fields (`website`, `linkedin`, `github`, `huggingface`) must always include `link_display`
- Link-field `link_display` accepts `default | label | url | both`
- `default` means "inherit from `personal.default_link_display`"
- Non-link fields do not support `link_display`

### Template metadata alignment

Every template `backend/templates/*/meta.yaml` `defaults.personal` block will use the same canonical shape:

- rename `link_display` to `default_link_display`
- require `link_display` on all four link fields
- allow `default` as a valid field-level value

This keeps `settings.yaml` and template defaults structurally identical, which simplifies reset behavior, parsing, and testing.

---

## Backward Compatibility

Existing files may still contain the previous format:

- `personal.link_display` at the global level
- missing `link_display` on link fields, which previously implied inheritance

Compatibility behavior:

- The parser accepts `personal.link_display` as an alias for `personal.default_link_display`
- When a link field omits `link_display`, parsing treats it as `default`
- Serialization always writes the canonical format using `default_link_display`
- After any successful save through the app, the file is normalized to the new explicit shape

This keeps live editing resilient while making the persisted format deterministic.

---

## Autocomplete

### Scope

`settings.yaml` autocomplete is value-only. It activates only when the cursor is in a known value position for a fixed-choice field.

Suggested values:

- `template:` → available template names
- `layout.density:` → `comfortable | balanced | compact`
- `layout.font_scale:` → `small | normal | large`
- `personal.default_link_display:` → `label | url | both`
- `personal.fields[].visible:` → `true | false`
- `personal.fields[].link_display:` for link fields only → `default | label | url | both`
- `sections[].visible:` → `true | false`

No key suggestions are shown in `settings.yaml`.

### Tab Isolation

The current editor instance is shared across the `resume` and `settings` tabs, so autocomplete must be explicitly gated by active tab.

Rules:

- When `activeTab === "resume"`, only the existing `resume.yaml` autocomplete path runs
- When `activeTab === "settings"`, only the new `settings.yaml` value autocomplete path runs
- If the wrong tab is active, the hint function returns `null`
- On tab switch, any open hint UI is closed so stale suggestions cannot linger

This is the main safety guard against mixed suggestions.

### Interaction Model

`settings.yaml` should feel like `resume.yaml`:

- one candidate → Tab inserts immediately
- multiple candidates → completion menu opens
- no candidate → Tab performs normal YAML indentation

The existing shared `Tab` handler can stay in place if it delegates to a tab-aware hint source.

---

## Parsing and Serialization

### Frontend settings engine

`frontend/settings-engine.js` becomes the canonical source for the new schema:

- rename `VALID_LINK_DISPLAY` handling to support two domains:
  - global: `label | url | both`
  - field-level link style: `default | label | url | both`
- rename `DEFAULT_SETTINGS.personal.link_display` to `DEFAULT_SETTINGS.personal.default_link_display`
- ensure all link fields in `DEFAULT_SETTINGS.personal.fields` include `link_display: "default"` unless a template or explicit setting overrides it
- update `settingsToYaml()` to always emit field-level `link_display` for all link fields
- update `parseSettings()` to:
  - accept both `default_link_display` and legacy `link_display` globally
  - coerce missing link-field `link_display` to `default`
  - ignore `link_display` on non-link fields
  - normalize invalid values back to safe defaults with warnings

### Backend template default normalization

`backend/main.py` template-default validation must match the new canonical shape:

- require `defaults.personal.default_link_display`
- treat global `defaults.personal.link_display` as invalid for template metadata
- require all link fields to include `link_display`
- accept field-level `default | label | url | both`

This keeps template reset behavior aligned with saved settings behavior.

---

## UI Changes

### Contact flyout wording

The current UI uses the global label "Default" and omission-based override removal. It should move to explicit language:

- global segmented control label becomes `Default link display`
- a field using inheritance shows a clear state such as `default (url)` or `following default: url`
- clearing an override no longer deletes the field key; it sets `link_display: default`

### Internal state behavior

The flyout mutators should stop using `delete f.link_display` for link fields. Instead:

- choosing inherit sets `f.link_display = "default"`
- choosing a concrete style sets `f.link_display` to that value

This ensures UI state, saved YAML, and reset defaults all share the same explicit model.

---

## Files Affected

### Frontend

- `frontend/yaml-autocomplete.js`
  - split shared hint logic into tab-aware resume/settings paths
  - add settings value-context detection and value suggestions
  - close or suppress hints when tab context does not match
- `frontend/editor-adapter.js`
  - keep shared Tab behavior but route it through tab-aware completion logic
- `frontend/settings-engine.js`
  - normalize schema rename and explicit link-display requirements
- `frontend/settings-sync.js`
  - preserve active-tab awareness for editor behavior
- `frontend/contact-ui.js`
  - rename global control wording
  - switch inherit/reset logic from deletion to explicit `default`

### Backend

- `backend/main.py`
  - update template-default validation for the renamed and explicit schema

### Data / fixtures

- `settings.yaml`
  - update sample file to canonical format
- `backend/templates/*/meta.yaml`
  - update all template defaults to canonical format

### Tests

- `tests/test_contact_settings_engine.js`
- `tests/test_template_meta_defaults.py`
- `tests/test_template_default_reset.js`
- autocomplete-focused JS tests for tab isolation and settings value suggestions

---

## Data Flow

### Flow 1: Editing `settings.yaml` directly

1. User switches to the `settings` tab
2. The shared editor loads settings content
3. Tab-aware autocomplete detects `settings` mode
4. Only value suggestions for known enum fields are offered
5. Parsed settings are normalized in memory
6. Save writes the canonical schema back to disk

### Flow 2: Editing `resume.yaml`

1. User switches to the `resume` tab
2. The shared editor loads resume content
3. Only resume autocomplete is active
4. No settings-specific suggestions can appear

### Flow 3: Contact flyout interactions

1. User changes the global default or a field-level style
2. `settingsSync.updateFromToolbar()` mutates normalized settings
3. Serialization writes explicit values
4. Preview/render receives the resolved settings

### Flow 4: Resetting template defaults

1. Template metadata loads canonical defaults
2. Reset applies explicit field-level values, including `default`
3. The resulting `settings.yaml` matches the same persisted format used by manual edits

---

## Error Handling

- Invalid YAML still blocks parsed application as it does today
- Unknown enum values produce warnings and fall back safely
- Legacy global `link_display` is accepted during parsing but never re-emitted
- Missing link-field `link_display` is normalized to `default`
- If autocomplete cannot confidently identify a supported settings value context, it returns no suggestions instead of guessing

---

## Testing

### Frontend settings parsing

- `parseSettings()` accepts legacy `personal.link_display`
- `parseSettings()` maps missing link-field `link_display` to `default`
- `settingsToYaml()` always emits `default_link_display`
- `settingsToYaml()` always emits `link_display` for all link fields
- non-link fields never retain `link_display`

### Template metadata validation

- every template `meta.yaml` contains `default_link_display`
- every link field in template defaults contains `link_display`
- field-level `default` is accepted as valid
- old metadata shape is rejected by validator tests

### Autocomplete

- resume tab never shows settings suggestions
- settings tab never shows resume suggestions
- `settings.yaml` suggests enum values only in supported value positions
- Tab fast-accept works for single settings candidates
- normal indent behavior remains unchanged when no settings suggestion exists

### UI behavior

- clearing a link override writes `default`, not omission
- contact flyout reflects the renamed global setting correctly
- reset-to-template preserves canonical explicit link-display values

---

## Recommendation

Implement this as one coherent schema-and-editor change, not as two separate patches. The value-only autocomplete is most reliable once the `settings.yaml` shape is explicit, and the explicit schema becomes much easier to edit once autocomplete knows the fixed value domains.
