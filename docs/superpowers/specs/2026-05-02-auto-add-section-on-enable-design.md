# Auto-Add Section on Enable

**Date:** 2026-05-02  
**Status:** Approved

## Problem

When a user clicks a chip for a built-in section that is absent from the YAML, a toast appears saying "Add a `key:` key to include this section." with an "Add default content" button. This is an extra step — the user's intent is clear (they want the section enabled), so the app should act immediately.

## Solution

Replace the `showAddSectionToast(key)` call in the chip click handler with a direct action: append the default YAML, rebuild the panel, refresh the preview, and show a brief confirmation toast.

## Affected File

`frontend/sections-ui.js`

## Change Details

### Chip click handler (lines 79–85)

**Before:**
```js
if (!present) {
  if (sectionsState.SECTION_DEFS[key]) {
    showAddSectionToast(key);
  } else {
    showToast(`Add a \`${key}:\` key to include this section.`, "info");
  }
  return;
}
```

**After:**
```js
if (!present) {
  if (sectionsState.SECTION_DEFS[key]) {
    if (appendDefaultSection(key)) {
      buildPanel();
      preview.refresh(
        sectionsState.getOrderedFilteredYaml(app.state.yaml),
        app.state.template
      );
      showToast(`${def.label} added`, "info");
    }
  } else {
    showToast(`Add a \`${key}:\` key to include this section.`, "info");
  }
  return;
}
```

### Remove `showAddSectionToast`

The `showAddSectionToast` function (lines 264–294) loses its only call site and becomes dead code. It is deleted.

## Unchanged Behavior

- Custom sections (not in `SECTION_DEFS`) still show the instructional toast — they have no default YAML to inject.
- `appendDefaultSection` is unchanged.
- All other chip interactions (toggle hidden, drag-reorder) are unchanged.

## Toast message

`"${def.label} added"` — e.g. "Skills added", "Education added". Uses the existing `showToast(..., "info")` infrastructure.
