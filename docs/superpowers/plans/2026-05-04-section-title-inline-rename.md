# Section Title Inline Rename — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users rename a section's CV heading by double-clicking the chip label in the section bar, syncing the change to `settings.yaml` and the live preview instantly.

**Architecture:** `settingsSync` gains `updateSectionTitle(key, title)` as the single write path. `buildPanel()` in `sectionsUI` reads chip labels from `settingsSync.getSettings()` instead of the hardcoded `SECTION_DEFS` labels. Visibility toggling moves from the chip body to the `.chip-dot` element only; `.chip-name` double-click opens an inline `<input>` that commits via Enter/blur and cancels via Escape.

**Tech Stack:** Vanilla JS (ES6 IIFEs), CodeMirror 5, js-yaml, FastAPI backend (no changes needed). No JS test framework exists — verification is via the browser with the dev server running (`uvicorn backend.main:app --reload`).

---

## File Map

| File | Change |
|---|---|
| `frontend/settings-sync.js` | Add `updateSectionTitle(key, newTitle)` function and export it |
| `frontend/sections-ui.js` | `buildPanel()`: read label from settingsSync; move toggle to dot; add dblclick inline edit |
| `frontend/index.html` | Add `.chip-name-input` CSS rule |

---

### Task 1: Add `updateSectionTitle` to `settings-sync.js`

**Files:**
- Modify: `frontend/settings-sync.js`

- [ ] **Step 1: Add the function**

Inside the `settingsSync` IIFE (after the `notifySectionStateChange` function, before the `switchToResume` function), add:

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

`skipApply: true` skips `_applyAll` (so it won't call `sectionsUI.buildPanel()` internally); the caller is responsible for rebuilding the panel. `_onYamlChange` still refreshes the CV preview and schedules the save to `settings.yaml`.

- [ ] **Step 2: Export the function**

In the `return` statement at the bottom of the IIFE, add `updateSectionTitle`:

```js
return {
  get activeTab() { return _activeTab; },
  updateFromToolbar,
  notifySectionStateChange,
  updateSectionTitle,
  getYaml:     () => _settingsYaml,
  getSettings: () => _parsed.value || DEFAULT_SETTINGS,
};
```

- [ ] **Step 3: Verify in browser**

Start the dev server if it isn't running:
```bash
uvicorn backend.main:app --reload
```
Open `http://localhost:8000`. Open DevTools console and run:
```js
typeof settingsSync.updateSectionTitle
```
Expected output: `"function"`

- [ ] **Step 4: Commit**

```bash
git add frontend/settings-sync.js
git commit -m "feat: add updateSectionTitle to settingsSync"
```

---

### Task 2: Update chip label and move toggle to dot

**Files:**
- Modify: `frontend/sections-ui.js`

This task does two things inside `buildPanel()`'s per-chip loop:
1. Reads the chip display label from `settingsSync.getSettings()` instead of the hardcoded `def.label`
2. Replaces the existing `chip.addEventListener("click", ...)` body-toggle handler with a targeted `dot.addEventListener("click", ...)` handler

- [ ] **Step 1: Read `sectionTitle` from settingsSync**

In `buildPanel()`, in the `for (const key of order)` loop, immediately after the existing line:
```js
const def = sectionsState.getDef(key, app.state.yaml);
```
Add:
```js
const settings = window.settingsSync ? settingsSync.getSettings() : null;
const sectionTitle = settings?.sections?.find(s => s.key === key)?.title ?? def.label;
```

- [ ] **Step 2: Use `sectionTitle` in `chip.innerHTML` and remove `chip.title`**

Remove the existing `chip.title = ...` line (the one that says `Show ${def.label}` / `Hide ${def.label}`). It will be replaced on the dot in Step 4.

Update `chip.innerHTML` to use `sectionTitle` instead of `def.label`:
```js
chip.innerHTML = `
  <span class="chip-grip"><span></span><span></span><span></span></span>
  <span class="chip-dot"></span>
  <span class="chip-name">${sectionTitle}</span>
`;
```

- [ ] **Step 3: Remove the existing `chip.addEventListener("click", ...)` handler**

Delete the entire block that starts with:
```js
chip.addEventListener("click", (e) => {
  if (e.target.closest(".chip-grip")) return;
  ...
});
```
This block runs from the `chip.addEventListener("click"` line to its closing `});` (roughly lines 76–107 in the original file). Remove it entirely.

- [ ] **Step 4: Add dot click handler with tooltip**

After the `chip.innerHTML = ...` assignment, add:

```js
const dot = chip.querySelector(".chip-dot");
dot.title = present
  ? (hidden ? `Show ${sectionTitle}` : `Hide ${sectionTitle}`)
  : `${sectionTitle} — not in YAML`;
dot.style.cursor = "pointer";

dot.addEventListener("click", (e) => {
  e.stopPropagation();
  if (justDragged) { justDragged = false; return; }
  if (!present) {
    if (sectionsState.SECTION_DEFS[key]) {
      if (appendDefaultSection(key)) {
        buildPanel();
        preview.refresh(
          sectionsState.getOrderedFilteredYaml(app.state.yaml),
          app.state.template
        );
        showToast(`${sectionTitle} added`, "info");
      }
    } else {
      showToast(`Add a \`${key}:\` key to include this section.`, "info");
    }
    return;
  }
  const currentYaml = app.state.yaml || '';
  const newYaml = hidden
    ? sectionsState.moveFromInvisible(currentYaml, key)
    : sectionsState.moveToInvisible(currentYaml, key);
  if (newYaml !== currentYaml) {
    if (!window.settingsSync || window.settingsSync.activeTab === 'resume') {
      window.editorAdapter.setValue(newYaml);
    }
    app.setState({ yaml: newYaml });
  }
  sectionsState.toggleHidden(key);
  buildPanel();
});
```

- [ ] **Step 5: Verify in browser**

Reload `http://localhost:8000`.
- Chip labels should still show the section names (now sourced from `settings.yaml` titles — e.g. `"EXPERIENCE"` if that's what's in your settings.yaml)
- Clicking the coloured dot should toggle the section's visibility and update the CV preview
- Clicking the chip body or label text should do nothing
- Hovering over the dot should show the tooltip `"Hide Experience"` / `"Show Experience"`

- [ ] **Step 6: Commit**

```bash
git add frontend/sections-ui.js
git commit -m "feat: move section toggle to chip-dot, read label from settingsSync"
```

---

### Task 3: Add inline rename on double-click + CSS

**Files:**
- Modify: `frontend/sections-ui.js`
- Modify: `frontend/index.html`

- [ ] **Step 1: Add CSS for the inline input**

In `frontend/index.html`, find the `.chip.on .chip-name` rule:
```css
.chip.on .chip-name { color: var(--ink); }
```
After it, add:
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

- [ ] **Step 2: Add dblclick handler on `.chip-name`**

In `frontend/sections-ui.js`, in `buildPanel()`, after the `dot.addEventListener("click", ...)` block added in Task 2, add:

```js
const nameSpan = chip.querySelector(".chip-name");
nameSpan.addEventListener("dblclick", (e) => {
  e.stopPropagation();
  if (!present) return;
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
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); commit(); }
    if (ev.key === "Escape") { ev.preventDefault(); cancel(); }
  });
  input.addEventListener("blur", commit);
});
```

- [ ] **Step 3: Verify — happy path**

Reload `http://localhost:8000`.
1. Double-click a chip label (e.g. `EXPERIENCE`)
2. The label turns into an underlined input field pre-filled with `EXPERIENCE`, all selected
3. Type `Work History` and press Enter
4. The chip should now read `Work History`
5. The CV preview heading for that section should update to `Work History`
6. Switch to the Settings tab in the editor — the `settings.yaml` line for that section should read `title: "Work History"`

- [ ] **Step 4: Verify — cancel and empty input**

1. Double-click the chip again (now reads `Work History`)
2. Press Escape — chip should revert to `Work History` (no change)
3. Double-click again, clear the input to empty, press Enter
4. Chip should stay `Work History` (empty input reverts to previous)

- [ ] **Step 5: Verify — absent chip is not editable**

If any chip is greyed out (section not in `mycv.yaml`), double-clicking its name should do nothing.

- [ ] **Step 6: Commit**

```bash
git add frontend/sections-ui.js frontend/index.html
git commit -m "feat: inline rename section title on dblclick"
```
