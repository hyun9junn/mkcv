# Auto-Add Section on Enable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user clicks a chip for a built-in section that is absent from the YAML, automatically append the default YAML, enable the section, and show a brief confirmation toast — instead of showing an intermediate "add it first" toast.

**Architecture:** Single file change in `frontend/sections-ui.js`. The click handler for absent built-in sections is updated to call `appendDefaultSection` immediately; the now-dead `showAddSectionToast` function is deleted.

**Tech Stack:** Vanilla JS, js-yaml (already loaded as `jsyaml`), existing `showToast` / `appendDefaultSection` helpers in `sections-ui.js`.

---

### Task 1: Update the click handler to auto-add and show confirmation toast

**Files:**
- Modify: `frontend/sections-ui.js:79-85`

> No automated frontend test suite exists in this project. Verification is manual (steps below).

- [ ] **Step 1: Open `frontend/sections-ui.js` and locate the click handler**

  The target block starts at line 76. Find this exact code inside `chip.addEventListener("click", ...)`:

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

- [ ] **Step 2: Replace the block with the auto-add behavior**

  Replace the block above with:

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

  Note: `def` is already in scope at this point — it is declared on the line `const def = sectionsState.getDef(key, app.state.yaml);` earlier in `buildPanel`, inside the same `for` loop closure that contains this click handler.

- [ ] **Step 3: Manually verify the new behavior**

  1. Start the app (or reload if already running).
  2. Remove a built-in section key (e.g. `skills:`) from the YAML editor so the Skills chip shows as absent (greyed out).
  3. Click the Skills chip.
  4. Expected: no intermediate toast; the `skills:` default YAML is appended to the editor, the chip turns on (green), the preview updates, and a brief "Skills added" info toast appears.
  5. Verify the toast auto-dismisses after ~4 seconds.

- [ ] **Step 4: Verify custom sections are unaffected**

  1. Add a `custom_sections:` entry with a custom key (e.g. `volunteering`) to the YAML.
  2. Remove the entry again so the chip shows as absent.
  3. Click it.
  4. Expected: the original instructional toast still appears: "Add a `volunteering:` key to include this section."

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/sections-ui.js
  git commit -m "feat: auto-add default section YAML on chip click instead of prompting"
  ```

---

### Task 2: Delete the dead `showAddSectionToast` function

**Files:**
- Modify: `frontend/sections-ui.js:264-294`

- [ ] **Step 1: Delete `showAddSectionToast`**

  Remove the entire function from line 264 to line 294 (inclusive):

  ```js
  function showAddSectionToast(key) {
    const stack = document.getElementById("toast-stack");
    if (!stack) return;
    const t = document.createElement("div");
    t.className = "toast info";
    t.style.maxWidth = "520px";
    t.innerHTML = `<div class="toast-msg">Add a \`${key}:\` key to include this section.</div><button class="toast-action">Add default context</button><button class="toast-close">×</button>`;

    let autoTimer = null;

    function removeToast() {
      clearTimeout(autoTimer);
      t.style.animation = "toastIn .2s ease reverse both";
      setTimeout(() => t.remove(), 220);
    }

    t.querySelector(".toast-close").addEventListener("click", removeToast);
    t.querySelector(".toast-action").addEventListener("click", () => {
      removeToast();
      if (appendDefaultSection(key)) {
        buildPanel();
        preview.refresh(
          sectionsState.getOrderedFilteredYaml(app.state.yaml),
          app.state.template
        );
      }
    });

    stack.appendChild(t);
    autoTimer = setTimeout(removeToast, 5000);
  }
  ```

- [ ] **Step 2: Verify nothing broke**

  Reload the app. Repeat Task 1 Step 3 (click an absent chip) and confirm the feature still works correctly after the dead function is removed.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/sections-ui.js
  git commit -m "refactor: remove dead showAddSectionToast function"
  ```
