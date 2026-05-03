# Section Title Inline Rename

**Date:** 2026-05-04  
**Status:** Approved

## Overview

Allow users to rename a section's CV heading directly in the section bar by double-clicking the chip label, without navigating to `settings.yaml`.

The `settings.yaml` method remains fully supported — both paths write to the same field and stay in sync.

## Interaction Model

| Target | Single click | Double-click |
|---|---|---|
| `.chip-dot` | Toggle visibility (or add section if absent) | — |
| `.chip-name` | Nothing | Enter inline edit |
| `.chip-grip` | Nothing (drag handle only) | — |
| Rest of chip body | Nothing | — |

The chip body and chip-name no longer toggle visibility on single click. Visibility is controlled exclusively via the dot.

## What the Chip Displays

The chip label shows the `title` field from `settings.yaml` for that section (read via `settingsSync.getSettings().sections.find(s => s.key === key)?.title`), falling back to `def.label` for custom/unknown sections not tracked in settings.

This means the chip label and the rendered CV heading always show the same value.

## Inline Edit Behavior

1. User double-clicks `.chip-name`
2. The span is hidden; a styled `<input>` is inserted in its place, pre-filled with the current title, with all text selected
3. **Confirm** (Enter or blur): `newTitle = input.value.trim() || previousTitle` → call `settingsSync.updateSectionTitle(key, newTitle)` → call `buildPanel()`
4. **Cancel** (Escape): call `buildPanel()` with no update

Empty input reverts to the previous title (does not reset to default).

Native `dblclick` is used — no 220ms timer needed, because single-clicking chip-name does nothing and therefore never triggers a `buildPanel()` rebuild before the dblclick fires.

## Files Changed

### `settings-sync.js`

Add `updateSectionTitle(key, newTitle)`:

```js
function updateSectionTitle(key, newTitle) {
  if (!_parsed.value) return;
  const next = JSON.parse(JSON.stringify(_parsed.value));
  const section = next.sections.find(s => s.key === key);
  if (!section) return;
  section.title = newTitle;
  _onYamlChange(settingsToYaml(next), { skipApply: true });
}
```

`skipApply: true` prevents `_applyAll` from rebuilding the chip panel prematurely — the caller (`sectionsUI`) calls `buildPanel()` after. `_onYamlChange` still refreshes the CV preview and saves to `settings.yaml`.

Export `updateSectionTitle` in the returned object.

### `sections-ui.js`

**`buildPanel()` — chip label:**  
Replace `def.label` with the title from settings:
```js
const settings = window.settingsSync ? settingsSync.getSettings() : null;
const sectionTitle = settings?.sections?.find(s => s.key === key)?.title ?? def.label;
```
Use `sectionTitle` in `chip.innerHTML` instead of `def.label`.

**`buildPanel()` — click handler:**  
Remove the existing `chip.addEventListener("click", ...)` toggle handler.  
Add a targeted click handler on the `.chip-dot` element:
```js
const dot = chip.querySelector(".chip-dot");
dot.addEventListener("click", (e) => {
  e.stopPropagation();
  // existing toggle / add-section logic (unchanged)
});
```
Move the tooltip (`chip.title`) to `dot.title`.

**`buildPanel()` — double-click edit:**  
Add a `dblclick` handler on `.chip-name`:
```js
const nameSpan = chip.querySelector(".chip-name");
nameSpan.addEventListener("dblclick", (e) => {
  e.stopPropagation();
  if (!present) return; // absent chips are not editable
  const previousTitle = sectionTitle;
  nameSpan.style.display = "none";
  const input = document.createElement("input");
  input.className = "chip-name-input";
  input.value = previousTitle;
  input.style.width = Math.max(40, previousTitle.length * 8) + "px";
  nameSpan.parentNode.insertBefore(input, nameSpan.nextSibling);
  input.focus();
  input.select();

  let committed = false;
  function commit() {
    if (committed) return;
    committed = true;
    const newTitle = input.value.trim() || previousTitle;
    if (newTitle !== previousTitle && window.settingsSync) {
      settingsSync.updateSectionTitle(key, newTitle);
    }
    buildPanel();
  }
  function cancel() {
    if (committed) return;
    committed = true;
    buildPanel();
  }
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
  });
  input.addEventListener("blur", commit);
});
```

### `index.html`

Add CSS for the inline input:
```css
.chip-name-input {
  font-family: var(--font-serif);
  font-size: 13px;
  color: var(--ink);
  background: transparent;
  border: none;
  border-bottom: 1.5px solid var(--accent);
  outline: none;
  padding: 0;
  min-width: 40px;
}
```

## Data Flow

```
user double-clicks chip-name
  → chip-name hidden, <input> shown (pre-filled, selected)
  → user types → Enter or blur
  → settingsSync.updateSectionTitle(key, newTitle)
      → _onYamlChange({ skipApply: true })
          → saves settings.yaml          ✓
          → preview.refresh()            ✓  (CV heading updates live)
  → buildPanel()                         ✓  (chip label updates)
```

## Edge Cases

- **Empty input** → reverts to previous title, no settings change
- **Escape** → reverts, no settings change
- **Absent chips** → not editable (double-click is a no-op)
- **Drag during edit** → the grip's pointerdown starts a drag only on pointerdown; since the input has focus, pointer events on the chip outside the input are unrelated. The `committed` guard ensures blur fires cleanly even if focus is lost unexpectedly
- **settings.yaml edited directly** → `buildPanel()` reads from `settingsSync.getSettings()` on every call, so the chip always reflects the current file state
- **Custom sections** → their titles live in `mycv.yaml` under `custom_sections[].title`, not in `settings.yaml`. `updateSectionTitle` will find no matching entry and return early. Custom section renaming is out of scope for this feature.
