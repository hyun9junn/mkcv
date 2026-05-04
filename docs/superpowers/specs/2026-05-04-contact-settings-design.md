# Contact Field Settings — Design Spec

**Date:** 2026-05-04  
**Status:** Approved  

---

## Overview

Add per-field presentation controls for personal/contact data to `settings.yaml`. `resume.yaml` continues to hold only actual data. `settings.yaml` gains field visibility flags and per-link-field display style overrides, controlled via a new flyout panel in the toolbar.

This feature is explicitly **not** a resume section. It does not participate in section ordering, drag reorder, title rename, or section visibility toggle logic.

---

## Schema

### settings.yaml additions

A `fields` array is added under the existing `personal:` block, mirroring the `sections:` pattern:

```yaml
personal:
  link_display: url        # global default: label | url | both
  fields:
    - key: name
      visible: true        # locked — always true, no toggle in UI
    - key: email
      visible: true
    - key: phone
      visible: false
    - key: location
      visible: true
    - key: website
      visible: false
    - key: linkedin
      visible: false
    - key: github
      visible: true
      link_display: label  # per-field override (link fields only, optional)
    - key: huggingface
      visible: true
```

**Backward compatibility:** If `personal.fields` is absent (existing files), all fields default to visible with no overrides. The existing `personal.link_display` global key continues to work as before.

### Field catalog (canonical order)

| Key | Link field | Locked |
|-----|-----------|--------|
| name | no | yes (always visible) |
| email | no | no |
| phone | no | no |
| location | no | no |
| website | yes | no |
| linkedin | yes | no |
| github | yes | no |
| huggingface | yes | no |

**Link fields** (website, linkedin, github, huggingface) support the `link_display` key at the field level. Plain fields (email, phone, location) do not — they have no display style concept.

---

## UI

### Placement

A **"Contact" pill button** is added to the controls row, between the font-scale segmented control and the sections rail, separated by the existing `ctrl-sep` dividers:

```
Density [···] | Type size [···] | Contact ▾ | Sections [chip chip …] Reset settings
```

### Pill button states

| State | Appearance |
|-------|-----------|
| All fields visible, closed | `Contact ▾` (no badge) |
| Some fields hidden, closed | `Contact 2 ▾` (dark count badge) |
| Open | Accent border + background, caret flips to `▴` |

### Flyout panel

Opens below the pill on click, closes on outside click or Escape. Minimum width 340px. Positioned with `position: absolute` anchored to the pill's parent, z-index above sections chips.

**Header row:**
- Left: `CONTACT FIELDS` label (monospace, uppercase, muted)
- Right: `Default` label + segmented control `label · url · both` (sets `personal.link_display`)

**Field rows** (one per catalog entry, in canonical order):

```
[toggle] [key]        [value preview from resume.yaml]   [right control]
```

- `name` row: toggle is present but permanently in the `on` state with reduced opacity and `pointer-events: none`; right control shows `always shown` badge
- Plain field rows (email, phone, location): right control is empty
- Link field rows: right control is one of three states (see below)
- Hidden rows (`visible: false`): full row renders at 45% opacity

**Link field right-hand control — three states:**

1. **Inheriting** (no `link_display` key on the field): dashed `↑ url` inherit tag, where "url" reflects the current global default dynamically — if the global changes to "label", the tag reads `↑ label`. Clicking opens the inline picker.
2. **Picker open** (after clicking the inherit tag): inline segmented control `↑ · label · url · both`. `↑` re-sets to inherit and closes the picker. Selecting a value sets the override and closes the picker.
3. **Override set** (`link_display` key present on field): accent-colored pill `label ×`. Clicking `×` removes the override key and returns to the inherit state.

---

## Data Flow

### Flow 1: Flyout → settings.yaml

`contact-ui.js` calls `settingsSync.updateFromToolbar(mutator)` for every interaction (toggle, global default change, per-field override set/clear). The mutator modifies `s.personal.fields` or `s.personal.link_display` in place. `updateFromToolbar` serializes to YAML, saves to disk, and triggers a preview refresh.

### Flow 2: settings.yaml edited directly → flyout rebuilds

`_applyAll(settings)` in `settings-sync.js` gains a third call: `_applyToContact(settings)`, which calls `contactUI.rebuild(settings)`. This runs whenever the settings editor is active and the YAML is valid. The flyout re-renders from the parsed settings + current resume.yaml state.

### Flow 3: resume.yaml changes → value previews update

`contact-ui.js` registers an `editorAdapter.onChange` listener with a short debounce (same pattern as `sectionsUI`). When the flyout panel is open, `rebuild()` is called so value previews (e.g. `github.com/hyun9junn`) stay current. When the panel is closed, the listener is a no-op.

### Flow 4: Backend rendering

The render request is extended with:

```python
personal_fields: list[dict]   # [{key, visible, link_display?}, ...]
link_display: str              # global default
```

Jinja2 templates receive helper utilities:
- `contact_visible(key)` → bool
- `contact_link_style(key)` → resolves field override else global default

The classic template is updated first. Other templates are unaffected until explicitly wired up — they continue to render all personal fields using the global `link_display`.

---

## Files Affected

### Frontend (new)
- `frontend/contact-ui.js` — pill button + flyout panel, all event handlers, `rebuild(settings)`

### Frontend (modified)
- `frontend/settings-engine.js` — add `PERSONAL_FIELD_CATALOG`, `LINK_FIELDS` set; extend `parseSettings` and `settingsToYaml` to handle `personal.fields`; add `normalizePersonalFields` helper
- `frontend/settings-sync.js` — add `_applyToContact(settings)` to `_applyAll`; export `updateContactSettings` (thin wrapper over `updateFromToolbar`)
- `frontend/index.html` — add pill button + flyout anchor HTML to controls row; add `<script src="contact-ui.js">` after `sections-ui.js`; add CSS for pill, flyout panel, toggle, inherit tag, picker, override pill

### Backend (modified)
- `backend/main.py` — pass `personal_fields` and `link_display` in render context
- `backend/templates/classic/cv.tex.j2` — use `contact_visible` / `contact_link_style` helpers for the personal header block

### Data files (no change)
- `resume.yaml` / `mycv.yaml` — data only, untouched
- `settings.yaml` — gains `personal.fields` array on first UI interaction; existing files without it continue to work

---

## Out of Scope

- Field reordering (canonical order is fixed)
- Adding fields not in the catalog (custom contact fields)
- Per-template field catalog differences
- Templates other than classic wired up to `contact_visible`
