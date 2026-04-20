# Section Management UX Design

## Goal

Improve the sections panel with hide/show (UI-only, YAML unchanged), sidebar drag-to-reorder (UI-only, YAML unchanged), and Reset with confirmation modal + undo toast.

## Approach

Approach B was chosen: split section logic into two files — `sections-state.js` (pure state + localStorage) and `sections-ui.js` (DOM, drag-and-drop, modal, toast). This replaces the existing `sections.js`.

---

## State Model

All section UI state lives in `localStorage` under key `"mkcv_sections_state"`:

```js
{
  hidden: ["publications", "awards"],  // section keys hidden from PDF output
  order:  ["summary", "experience", "education", "skills", "projects",
           "certifications", "publications", "languages", "awards", "extracurricular"]
}
```

**Default order** (used on first load, before any user customisation):
`summary → experience → education → skills → projects → certifications → publications → languages → awards → extracurricular`

### Section states

| State | Condition | In YAML | In PDF output |
|-------|-----------|---------|---------------|
| Visible | key in `order`, not in `hidden` | ✓ | ✓ |
| Hidden | key in `order`, key in `hidden` | ✓ | ✗ |

`personal` is never managed by this system — always passed through to the backend unchanged.

### State transitions

| Action | YAML on disk | localStorage |
|--------|-------------|--------------|
| Uncheck (hide) | unchanged | add key to `hidden` |
| Check (show) | unchanged | remove key from `hidden` |
| Drag reorder | unchanged | update `order` array |
| Reset (confirmed) | section content replaced with default | `pendingUndo` stored temporarily |
| Undo reset | section content restored from `pendingUndo` | `pendingUndo` cleared |

---

## How Hiding Affects PDF Output

The frontend intercepts all backend API calls (`/api/preview/pdf`, `/api/export/markdown`, `/api/export/latex`, `/api/export/pdf`). Before sending the YAML, it:

1. Parses the raw YAML from the editor
2. Deletes all keys present in `hidden` from the parsed object
3. Re-serialises to YAML string
4. Sends the filtered YAML to the API

The disk file (`mycv.yaml`) is never modified by hide or reorder operations.

---

## Reset Flow

1. User clicks `↺ Reset` on a section row
2. **Confirmation modal** appears:
   - Title: "Reset [Section Name]?"
   - Body: "This will replace the [Section Name] section content with the default template. You can undo immediately after."
   - Buttons: `Cancel` (secondary) | `↺ Reset` (amber)
3. User confirms → section content in YAML editor is replaced with the default scaffold
4. **Undo toast** appears at the **top** of the screen:
   - Text: "[Section Name] reset"
   - `Undo` button (blue outline)
   - `5s` countdown
   - Auto-dismisses after 5 seconds
5. If Undo clicked → previous section content is restored in the editor

`pendingUndo` temp stash: `{ key, previousYaml, position }` — cleared when toast dismisses without undo.

---

## Panel UI

Each row in the sections panel (for sections present in YAML + `order`):

```
⠿  ☑  Experience          ↺ Reset
⠿  ☐  Publications (dim)  ↺ Reset
```

- `⠿` — drag handle (HTML5 native drag-and-drop), only on sections in `order`
- Checkbox — checked = visible in PDF, unchecked = hidden from PDF
- Label — dimmed + italic when hidden
- `↺ Reset` — opens confirmation modal; only shown for sections present in YAML

Sections in YAML but not yet in `localStorage.order` are appended at the end of the panel and added to `order` in localStorage.

The panel re-derives visible rows on every YAML editor change (same debounce as the existing `updateCheckboxes` call). This ensures sections typed manually into the YAML editor appear in the panel automatically.

**Panel order** reflects `localStorage.order` only — the YAML editor order is never changed by dragging.

---

## File Structure

| Action | File | Purpose |
|--------|------|---------|
| Create | `frontend/sections-state.js` | localStorage state, YAML filtering for API calls, reset + undo logic |
| Create | `frontend/sections-ui.js` | Panel DOM, drag-and-drop, modal, toast |
| Delete | `frontend/sections.js` | Replaced by the above two |
| Modify | `frontend/index.html` | Script tags, modal + toast HTML elements, drag/modal/toast CSS |
| Modify | `frontend/preview.js` | Call `sectionsState.getFilteredYaml()` before sending to backend |
| Modify | `frontend/export.js` | Call `sectionsState.getFilteredYaml()` before sending to backend |

### Public API (`window.sectionsState`)

```js
getFilteredYaml(rawYaml)    // strips hidden sections → used by preview.js + export.js
isHidden(key)               // → bool
toggleHidden(key)           // updates localStorage + triggers preview refresh
getOrder()                  // → string[]
setOrder(newOrder)          // updates localStorage
resetSection(key)           // shows confirm modal → replaces YAML → shows undo toast
```

### Script load order

```
editor-adapter.js → file-sync.js → sections-state.js → sections-ui.js → validator.js → preview.js → export.js
```

---

## Preview Refresh Triggers

- YAML editor changes — existing 1.5s debounce (unchanged)
- Hidden state toggle — immediate refresh (local parse only, no debounce needed)
