# Sortable Sections Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native HTML5 drag-and-drop in the sections rail with pointer-events–based sortable so chips live-displace as the user drags.

**Architecture:** On `pointerdown` we record offset; on first `pointermove` past 4 px we create a fixed-position clone and mark the original as an invisible placeholder; on each subsequent `pointermove` we re-insert the placeholder at the correct DOM slot so other chips reflow in real time; on `pointerup` we read the DOM order, commit it, and rebuild.

**Tech Stack:** Vanilla JS pointer events API, CSS `touch-action`, no new dependencies.

---

### Task 1: Add drag-state CSS to index.html

**Files:**
- Modify: `frontend/index.html` — inside the existing `<style>` block, near the `.chip` rules (around line 339)

- [ ] **Step 1: Add `touch-action: none` to the `.chip` rule**

  Find the existing `.chip` rule (currently ends at the `transition` line) and add one property:

  ```css
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px 4px 8px;
    border: 1px solid transparent;
    border-radius: 999px;
    cursor: pointer;
    user-select: none;
    transition: all .12s;
    white-space: nowrap;
    touch-action: none;
  }
  ```

- [ ] **Step 2: Add `.chip.dragging` and `.chip-drag-clone` rules**

  Immediately after the last `.chip.*` rule block (around line 375, after `.chip.drag-over`), insert:

  ```css
  .chip.dragging { opacity: 0; }
  .chip-drag-clone {
    position: fixed;
    pointer-events: none;
    z-index: 200;
    opacity: 0.85;
    cursor: grabbing;
  }
  ```

- [ ] **Step 3: Verify CSS loads without errors**

  Open `http://localhost:5000` (or wherever the dev server runs) and open DevTools Console — confirm no CSS parse errors. No drag behaviour changes yet.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/index.html
  git commit -m "feat: add drag-state CSS for sortable sections rail"
  ```

---

### Task 2: Replace native D&D with pointer-events drag in sections-ui.js

**Files:**
- Modify: `frontend/sections-ui.js` — rewrite `buildPanel()` and remove the `dragSrcKey` module variable

- [ ] **Step 1: Remove `dragSrcKey` module variable**

  At the top of the IIFE in `sections-ui.js`, delete:

  ```js
  let dragSrcKey = null;
  ```

- [ ] **Step 2: Remove `chip.draggable = present` from chip creation**

  In `buildPanel()`, find and delete this line (currently around line 27):

  ```js
  chip.draggable = present;
  ```

- [ ] **Step 3: Replace the click listener and drag block with the new pointer-events implementation**

  The current code has a `chip.addEventListener("click", ...)` followed by an `if (present) { ... }` block with four native drag listeners. Replace both with the following (the click listener moves inside `buildPanel` after the `chip.innerHTML` assignment, the drag block replaces the old `if (present)` block entirely):

  ```js
  let justDragged = false;

  chip.addEventListener("click", (e) => {
    if (e.target.closest(".chip-grip")) return;
    if (justDragged) { justDragged = false; return; }
    if (!present) {
      if (sectionsState.SECTION_DEFS[key]) {
        showAddSectionToast(key);
      } else {
        showToast(`Add a \`${key}:\` key to include this section.`, "info");
      }
      return;
    }
    sectionsState.toggleHidden(key);
    buildPanel();
    preview.refresh(
      sectionsState.getOrderedFilteredYaml(app.state.yaml),
      app.state.template
    );
  });

  if (present) {
    let dragClone = null;
    let offsetX = 0, offsetY = 0;
    let startX = 0, startY = 0;
    let dragging = false;

    chip.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      chip.setPointerCapture(e.pointerId);
      const rect = chip.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      startX = e.clientX;
      startY = e.clientY;
    });

    chip.addEventListener("pointermove", (e) => {
      if (!chip.hasPointerCapture(e.pointerId)) return;
      if (!dragging) {
        if (Math.abs(e.clientX - startX) <= 4 && Math.abs(e.clientY - startY) <= 4) return;
        dragging = true;
        const rect = chip.getBoundingClientRect();
        dragClone = chip.cloneNode(true);
        dragClone.className = "chip on chip-drag-clone";
        dragClone.style.width = rect.width + "px";
        document.body.appendChild(dragClone);
        chip.classList.add("dragging");
      }
      dragClone.style.left = (e.clientX - offsetX) + "px";
      dragClone.style.top  = (e.clientY - offsetY) + "px";
      const siblings = [...panel.querySelectorAll(".chip:not(.dragging)")];
      const before = siblings.find(s => {
        const r = s.getBoundingClientRect();
        return e.clientX < r.left + r.width / 2;
      });
      if (before) panel.insertBefore(chip, before);
      else panel.appendChild(chip);
    });

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      justDragged = true;
      dragClone.remove();
      dragClone = null;
      chip.classList.remove("dragging");
      const newOrder = [...panel.querySelectorAll(".chip")].map(c => c.dataset.key);
      sectionsState.setOrder(newOrder);
      buildPanel();
      preview.refresh(
        sectionsState.getOrderedFilteredYaml(app.state.yaml),
        app.state.template
      );
    }

    chip.addEventListener("pointerup",    endDrag);
    chip.addEventListener("pointercancel", endDrag);
  }
  ```

- [ ] **Step 4: Manual test — drag reorders chips live**

  1. Open the app in a browser.
  2. Drag a section chip left or right — other chips should slide aside in real time as you move.
  3. Release — the chip settles, order is committed, preview updates.
  4. Confirm the preview reflects the new section order.

- [ ] **Step 5: Manual test — click still toggles visibility**

  1. Click (without dragging) a chip that is currently visible (`on`) — it should go `off` and the preview should remove that section.
  2. Click it again — it should go `on` and the preview should re-add the section.
  3. No spurious toggles after completing a drag.

- [ ] **Step 6: Manual test — absent chips are inert**

  1. If there are any greyed-out (absent) chips in the rail, confirm they cannot be dragged.
  2. Clicking an absent chip should show the "Add default context" toast, not toggle anything.

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/sections-ui.js
  git commit -m "feat: replace native D&D with pointer-events sortable in sections rail"
  ```
