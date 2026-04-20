# Reset Order Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "↺ Reset Order" button at the far right of the sections panel that resets section order and visibility to defaults without touching YAML.

**Architecture:** `sectionsState` gains a `resetAll()` method that clears localStorage hidden list and restores `DEFAULT_ORDER`. `sectionsUI.buildPanel()` appends the button as the last child of `#sections-panel`, styled to float right via `margin-left: auto`. No modal needed — the action is reversible.

**Tech Stack:** Vanilla JS, localStorage, plain CSS in `index.html`

---

### Task 1: Add `resetAll()` to `sections-state.js`

**Files:**
- Modify: `frontend/sections-state.js`

- [ ] **Step 1: Add `resetAll` to the module body**

In `frontend/sections-state.js`, add this function after `setOrder` (around line 155):

```js
function resetAll() {
  _save({ hidden: [], order: [...DEFAULT_ORDER] });
}
```

- [ ] **Step 2: Export `resetAll` from the returned object**

Update the `return` block at the bottom of `sections-state.js` (currently around line 245):

```js
return {
  SECTION_DEFS,
  DEFAULT_ORDER,
  isHidden,
  toggleHidden,
  getOrder,
  setOrder,
  ensureInOrder,
  getFilteredYaml,
  getOrderedFilteredYaml,
  getVisibleOrder,
  resetSectionYaml,
  restoreSectionYaml,
  resetAll,
};
```

- [ ] **Step 3: Verify manually**

Open browser console on the app. Run:
```js
sectionsState.resetAll()
JSON.parse(localStorage.getItem('mkcv_sections_state'))
// Expected: { hidden: [], order: ['summary','experience','education','skills','projects','certifications','publications','languages','awards','extracurricular'] }
```

- [ ] **Step 4: Commit**

```bash
git add frontend/sections-state.js
git commit -m "feat: add resetAll() to sectionsState"
```

---

### Task 2: Add CSS for the Reset Order button

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Add `.btn-reset-order` style**

In `frontend/index.html`, add this rule after the `.btn-reset:hover` rule (currently around line 118):

```css
.btn-reset-order {
  background: transparent;
  border: none;
  color: #666;
  padding: 2px 6px;
  font-size: 0.72rem;
  cursor: pointer;
  line-height: 1;
  flex-shrink: 0;
  margin-left: auto;
  white-space: nowrap;
  letter-spacing: 0.01em;
}
.btn-reset-order:hover { color: #60a5fa; }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/index.html
git commit -m "feat: add .btn-reset-order CSS"
```

---

### Task 3: Render the Reset Order button in `buildPanel()`

**Files:**
- Modify: `frontend/sections-ui.js`

- [ ] **Step 1: Append button at the end of `buildPanel()`**

In `frontend/sections-ui.js`, at the end of `buildPanel()` — after the `for (const key of order)` loop, before the closing `}` of `buildPanel` (currently around line 124) — add:

```js
const btnResetOrder = document.createElement("button");
btnResetOrder.className = "btn-reset-order";
btnResetOrder.textContent = "↺ Reset Order";
btnResetOrder.title = "Reset section order and visibility to defaults";
btnResetOrder.addEventListener("click", () => {
  sectionsState.resetAll();
  buildPanel();
  preview.refresh(
    sectionsState.getOrderedFilteredYaml(app.state.yaml),
    app.state.template
  );
});
panel.appendChild(btnResetOrder);
```

- [ ] **Step 2: Verify in browser**

1. Open the app and expand the Sections panel.
2. Confirm "↺ Reset Order" appears at the far right of the panel row.
3. Drag a section chip to a new position — confirm preview reorders.
4. Uncheck a section — confirm it goes dim.
5. Click "↺ Reset Order":
   - All chips return to default order (`summary`, `experience`, `education`, `skills`, `projects`, `certifications`, `publications`, `languages`, `awards`, `extracurricular`).
   - All checkboxes are checked (no dim chips).
   - Preview updates to match.
   - YAML content in the editor is unchanged.
6. Close and reopen the panel — confirm reset state persists (it's saved to localStorage).

- [ ] **Step 3: Commit**

```bash
git add frontend/sections-ui.js
git commit -m "feat: add Reset Order button to sections panel"
```
