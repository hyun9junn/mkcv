# Section Management UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing sections toggle panel with a richer UI: hide/show (localStorage only, YAML on disk unchanged), drag-to-reorder sidebar (localStorage only), and Reset with a confirmation modal + top-of-screen undo toast.

**Architecture:** Two new JS modules replace `sections.js` — `sections-state.js` owns all state (localStorage schema, YAML filtering, reset logic) and `sections-ui.js` owns all DOM (panel rendering, drag-and-drop, checkbox, modal, toast). Hidden sections are stripped from YAML only at API call boundaries (`preview.js`, `export.js`). The YAML file on disk is never modified by hide or reorder operations.

**Tech Stack:** Vanilla JS, js-yaml (CDN, already loaded), HTML5 native drag-and-drop, localStorage

---

### Task 1: Create `frontend/sections-state.js`

**Files:**
- Create: `frontend/sections-state.js`

**Context:** Pure state module — no DOM access. Owns the localStorage schema, the canonical `SECTION_DEFS` list (moved from `sections.js`), and all YAML manipulation helpers. Consumed by `sections-ui.js`, `preview.js`, and `export.js`.

localStorage key: `"mkcv_sections_state"`
Schema: `{ hidden: string[], order: string[] }`

- [ ] **Step 1: Create `frontend/sections-state.js`**

```js
const sectionsState = (() => {
  const STORAGE_KEY = "mkcv_sections_state";

  const SECTION_DEFS = {
    summary: {
      label: "Summary",
      yaml: "summary: >\n  Write a brief professional summary here.\n",
    },
    experience: {
      label: "Experience",
      yaml: [
        "experience:",
        "  - title: Job Title",
        "    company: Company Name",
        '    start_date: "2024"',
        "    highlights:",
        "      - Key achievement",
        "",
      ].join("\n"),
    },
    education: {
      label: "Education",
      yaml: [
        "education:",
        "  - degree: B.S. Your Major",
        "    institution: University Name",
        '    year: "2020"',
        "",
      ].join("\n"),
    },
    skills: {
      label: "Skills",
      yaml: [
        "skills:",
        "  - category: Languages",
        "    items: [Python, JavaScript]",
        "",
      ].join("\n"),
    },
    projects: {
      label: "Projects",
      yaml: [
        "projects:",
        "  - name: Project Name",
        "    description: What it does",
        "    highlights:",
        "      - Key feature",
        "",
      ].join("\n"),
    },
    certifications: {
      label: "Certifications",
      yaml: [
        "certifications:",
        "  - name: Certification Name",
        "    issuer: Issuing Organization",
        '    date: "2024"',
        "",
      ].join("\n"),
    },
    publications: {
      label: "Publications",
      yaml: [
        "publications:",
        "  - title: Paper Title",
        "    venue: Conference or Journal",
        '    date: "2024"',
        "",
      ].join("\n"),
    },
    languages: {
      label: "Languages",
      yaml: [
        "languages:",
        "  - language: English",
        "    proficiency: Native",
        "",
      ].join("\n"),
    },
    awards: {
      label: "Awards",
      yaml: [
        "awards:",
        "  - name: Award Name",
        "    issuer: Awarding Organization",
        '    date: "2024"',
        "",
      ].join("\n"),
    },
    extracurricular: {
      label: "Extracurricular",
      yaml: [
        "extracurricular:",
        "  - title: Activity Name",
        "    organization: Organization Name",
        "    highlights:",
        "      - Key achievement",
        "",
      ].join("\n"),
    },
  };

  const DEFAULT_ORDER = Object.keys(SECTION_DEFS);

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function _save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function _getState() {
    const saved = _load();
    return {
      hidden: Array.isArray(saved?.hidden) ? saved.hidden : [],
      order: Array.isArray(saved?.order) ? saved.order : [...DEFAULT_ORDER],
    };
  }

  function isHidden(key) {
    return _getState().hidden.includes(key);
  }

  function toggleHidden(key) {
    const state = _getState();
    const idx = state.hidden.indexOf(key);
    if (idx === -1) {
      state.hidden.push(key);
    } else {
      state.hidden.splice(idx, 1);
    }
    _save(state);
  }

  function getOrder() {
    return _getState().order;
  }

  function setOrder(newOrder) {
    const state = _getState();
    state.order = newOrder;
    _save(state);
  }

  function ensureInOrder(key) {
    const state = _getState();
    if (!state.order.includes(key)) {
      state.order.push(key);
      _save(state);
    }
  }

  function getFilteredYaml(rawYaml) {
    try {
      const parsed = jsyaml.load(rawYaml);
      if (!parsed || typeof parsed !== "object") return rawYaml;
      const hidden = _getState().hidden;
      const filtered = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (!hidden.includes(k)) filtered[k] = v;
      }
      return jsyaml.dump(filtered, { lineWidth: -1 });
    } catch {
      return rawYaml;
    }
  }

  function resetSectionYaml(key, currentYaml) {
    // Returns { newYaml, previousYaml } or null on parse error.
    // previousYaml is a YAML string containing only the single section key.
    try {
      const parsed = jsyaml.load(currentYaml);
      if (!parsed || typeof parsed !== "object") return null;
      const defaultParsed = jsyaml.load(SECTION_DEFS[key].yaml);
      if (!defaultParsed) return null;
      const previousYaml = jsyaml.dump({ [key]: parsed[key] }, { lineWidth: -1 });
      parsed[key] = defaultParsed[key];
      const newYaml = jsyaml.dump(parsed, { lineWidth: -1 });
      return { newYaml, previousYaml };
    } catch {
      return null;
    }
  }

  function restoreSectionYaml(key, previousSectionYaml, currentYaml) {
    // Merges a single section's value back into currentYaml.
    try {
      const current = jsyaml.load(currentYaml);
      const previous = jsyaml.load(previousSectionYaml);
      if (!current || !previous) return null;
      current[key] = previous[key];
      return jsyaml.dump(current, { lineWidth: -1 });
    } catch {
      return null;
    }
  }

  return {
    SECTION_DEFS,
    DEFAULT_ORDER,
    isHidden,
    toggleHidden,
    getOrder,
    setOrder,
    ensureInOrder,
    getFilteredYaml,
    resetSectionYaml,
    restoreSectionYaml,
  };
})();

window.sectionsState = sectionsState;
```

- [ ] **Step 2: Smoke-test in the browser console**

Start the server (`source .venv/bin/activate && uvicorn backend.main:app --reload`), open http://localhost:8000, open DevTools console, and run:

```js
sectionsState.getOrder()
// Expected: ["summary", "experience", "education", "skills", "projects",
//            "certifications", "publications", "languages", "awards", "extracurricular"]

sectionsState.isHidden("summary")   // Expected: false
sectionsState.toggleHidden("summary")
sectionsState.isHidden("summary")   // Expected: true
sectionsState.toggleHidden("summary")
sectionsState.isHidden("summary")   // Expected: false

sectionsState.toggleHidden("summary")
sectionsState.getFilteredYaml(app.state.yaml).includes("summary:")
// Expected: false  (summary stripped from output)
sectionsState.toggleHidden("summary")   // restore
```

Note: `sections-state.js` is not yet in `index.html` script tags — run the test by pasting the file contents directly into the console, or add it temporarily to index.html.

- [ ] **Step 3: Commit**

```bash
git add frontend/sections-state.js
git commit -m "feat: add sections-state.js — localStorage state, YAML filtering, reset helpers"
```

---

### Task 2: Update `frontend/index.html` — CSS, modal + toast HTML, script tags

**Files:**
- Modify: `frontend/index.html`

**Context:** Three independent changes:
1. Replace `#sections-panel` CSS (wrap → column) and remove `#sections-panel label` + checkbox styles; add `.section-row`, drag, modal, and toast CSS
2. Add modal and toast HTML elements before `</body>`
3. Replace `<script src="sections.js">` with two new script tags

- [ ] **Step 1: Replace the `#sections-panel` CSS block (lines 78–83)**

Find:
```css
    #sections-panel {
      padding: 8px 16px 12px;
      display: none;
      flex-wrap: wrap;
      gap: 8px 20px;
    }
```

Replace with:
```css
    #sections-panel {
      padding: 4px 16px 12px;
      display: none;
      flex-direction: column;
      gap: 0;
    }
    .section-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 0;
      border-bottom: 1px solid #222;
      user-select: none;
    }
    .section-row:last-child { border-bottom: none; }
    .section-row.dragging { opacity: .4; }
    .section-row.drag-over { border-top: 2px solid #60a5fa; }
    .drag-handle { color: #555; cursor: grab; font-size: 14px; padding: 0 2px; line-height: 1; }
    .drag-handle:active { cursor: grabbing; }
    .section-row.hidden-section .section-label { color: #666; font-style: italic; }
    .section-label { flex: 1; font-size: 0.8rem; color: #ccc; cursor: default; }
    .btn-reset {
      background: #222;
      border: 1px solid #444;
      color: #888;
      border-radius: 3px;
      padding: 2px 8px;
      font-size: 11px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .btn-reset:hover { background: #2a2a2a; color: #fde68a; border-color: #b45309; }
    #reset-modal {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.6);
      z-index: 100;
      align-items: center;
      justify-content: center;
    }
    #reset-modal-box {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 24px;
      max-width: 400px;
      width: 90%;
    }
    #reset-modal-title { font-size: 1rem; font-weight: 600; color: #fff; margin-bottom: 8px; }
    #reset-modal-body { font-size: .85rem; color: #aaa; margin-bottom: 20px; line-height: 1.5; }
    #reset-modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
    #reset-modal-cancel {
      padding: 6px 16px; border-radius: 4px; border: 1px solid #444;
      background: #222; color: #ccc; font-size: .85rem; cursor: pointer;
    }
    #reset-modal-confirm {
      padding: 6px 16px; border-radius: 4px; border: 1px solid #b45309;
      background: #92400e; color: #fde68a; font-size: .85rem; cursor: pointer; font-weight: 500;
    }
    #undo-toast {
      display: none;
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 6px;
      padding: 10px 16px;
      align-items: center;
      gap: 16px;
      font-size: .85rem;
      color: #ccc;
      z-index: 200;
      box-shadow: 0 4px 16px rgba(0,0,0,.5);
      white-space: nowrap;
    }
    #undo-toast-btn {
      background: transparent;
      border: 1px solid #555;
      color: #93c5fd;
      border-radius: 4px;
      padding: 2px 10px;
      font-size: .8rem;
      cursor: pointer;
    }
```

- [ ] **Step 2: Remove the old `#sections-panel label` and checkbox CSS (lines 85–95)**

Find and remove these three blocks entirely:
```css
    #sections-panel label {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 0.8rem;
      color: #ccc;
      cursor: pointer;
    }

    #sections-panel input[type="checkbox"] { cursor: pointer; }
    #sections-panel input[type="checkbox"]:indeterminate { opacity: 0.5; }
```

- [ ] **Step 3: Add modal and toast HTML after `</div>` that closes `#main` (line 177), before the first `<script>` tag**

Insert between `  </div>` (closing `#main`) and `  <script src="app.js"></script>`:

```html
  <div id="reset-modal">
    <div id="reset-modal-box">
      <div id="reset-modal-title"></div>
      <div id="reset-modal-body">This will replace the section content with the default template. You can undo immediately after.</div>
      <div id="reset-modal-actions">
        <button id="reset-modal-cancel">Cancel</button>
        <button id="reset-modal-confirm">↺ Reset</button>
      </div>
    </div>
  </div>

  <div id="undo-toast">
    <span id="undo-toast-message"></span>
    <button id="undo-toast-btn">Undo</button>
  </div>
```

- [ ] **Step 4: Replace the `sections.js` script tag (line 182)**

Find:
```html
  <script src="sections.js"></script>
```

Replace with:
```html
  <script src="sections-state.js"></script>
  <script src="sections-ui.js"></script>
```

- [ ] **Step 5: Verify the page loads without JS errors**

Open http://localhost:8000. The page should load. The sections panel header ("Sections ▾") should be visible. No 404 errors in the Network tab (note: `sections-ui.js` will 404 until Task 3 — that's acceptable). No other console errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/index.html
git commit -m "feat: index.html — vertical panel CSS, modal + toast HTML, updated script tags"
```

---

### Task 3: Create `frontend/sections-ui.js` — panel, checkbox, drag-and-drop

**Files:**
- Create: `frontend/sections-ui.js`

**Context:** Builds panel rows from the parsed YAML + `sectionsState.getOrder()`. Each row: drag handle + checkbox (hide/show) + label + Reset button. Drag-and-drop updates `localStorage` order only — YAML editor is untouched. Checkbox calls `sectionsState.toggleHidden()` and immediately triggers a preview refresh. The `showResetModal` function is a stub (`alert`) in this task — it is replaced in Task 4.

- [ ] **Step 1: Create `frontend/sections-ui.js`**

```js
const sectionsUI = (() => {
  const panel = document.getElementById("sections-panel");
  const header = document.getElementById("sections-header");
  let isPanelOpen = false;
  let dragSrcKey = null;

  function togglePanel() {
    isPanelOpen = !isPanelOpen;
    panel.style.display = isPanelOpen ? "flex" : "none";
    header.querySelector("span").textContent = isPanelOpen
      ? "Sections ▴"
      : "Sections ▾";
  }

  function getPresentKeys(yaml) {
    try {
      const parsed = jsyaml.load(yaml);
      if (!parsed || typeof parsed !== "object") return [];
      return Object.keys(parsed).filter((k) => k !== "personal");
    } catch {
      return [];
    }
  }

  function buildPanel() {
    const presentKeys = getPresentKeys(app.state.yaml);

    // Any key present in YAML but missing from localStorage order gets appended.
    for (const key of presentKeys) {
      sectionsState.ensureInOrder(key);
    }

    const order = sectionsState.getOrder();
    const presentSet = new Set(presentKeys);

    panel.innerHTML = "";

    for (const key of order) {
      if (!presentSet.has(key)) continue;
      const def = sectionsState.SECTION_DEFS[key];
      if (!def) continue;

      const hidden = sectionsState.isHidden(key);

      const row = document.createElement("div");
      row.className = "section-row" + (hidden ? " hidden-section" : "");
      row.dataset.key = key;
      row.draggable = true;

      const handle = document.createElement("span");
      handle.className = "drag-handle";
      handle.textContent = "⠿";
      handle.title = "Drag to reorder (sidebar only)";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !hidden;
      cb.style.cursor = "pointer";
      cb.addEventListener("change", () => {
        sectionsState.toggleHidden(key);
        buildPanel();
        preview.refresh(
          sectionsState.getFilteredYaml(app.state.yaml),
          app.state.template
        );
      });

      const lbl = document.createElement("span");
      lbl.className = "section-label";
      lbl.textContent = def.label + (hidden ? " (hidden)" : "");
      lbl.addEventListener("click", () => cb.click());

      const btnReset = document.createElement("button");
      btnReset.className = "btn-reset";
      btnReset.textContent = "↺ Reset";
      btnReset.addEventListener("click", () => showResetModal(key));

      row.addEventListener("dragstart", (e) => {
        dragSrcKey = key;
        setTimeout(() => row.classList.add("dragging"), 0);
        e.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        panel
          .querySelectorAll(".section-row")
          .forEach((r) => r.classList.remove("drag-over"));
      });
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        panel
          .querySelectorAll(".section-row")
          .forEach((r) => r.classList.remove("drag-over"));
        if (dragSrcKey !== key) row.classList.add("drag-over");
      });
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        if (!dragSrcKey || dragSrcKey === key) return;
        const ord = sectionsState.getOrder();
        const fromIdx = ord.indexOf(dragSrcKey);
        const toIdx = ord.indexOf(key);
        if (fromIdx === -1 || toIdx === -1) return;
        ord.splice(fromIdx, 1);
        ord.splice(toIdx, 0, dragSrcKey);
        sectionsState.setOrder(ord);
        buildPanel();
      });

      row.appendChild(handle);
      row.appendChild(cb);
      row.appendChild(lbl);
      row.appendChild(btnReset);
      panel.appendChild(row);
    }
  }

  function showResetModal(key) {
    // Stub — replaced in Task 4
    alert(`Reset stub for: ${key}`);
  }

  document.addEventListener("DOMContentLoaded", () => {
    header.addEventListener("click", togglePanel);
    buildPanel();
    window.editorAdapter.onChange(() => buildPanel());
  });

  return { buildPanel };
})();

window.sectionsUI = sectionsUI;
```

- [ ] **Step 2: Open http://localhost:8000 and open the Sections panel**

Click "Sections ▾". You should see one row per non-`personal` section present in the YAML. Each row shows ⠿ handle, checkbox, label, and "↺ Reset" button.

- [ ] **Step 3: Verify checkbox hides section from preview**

Uncheck "Summary". The PDF preview should regenerate without the Summary section. The YAML editor content must be unchanged (still contains `summary:` key).

Re-check "Summary". Preview should regenerate with Summary restored. YAML editor still unchanged.

- [ ] **Step 4: Verify drag-and-drop reorders sidebar only**

Drag "Education" above "Experience". Panel order should update. YAML editor order must be unchanged.

Refresh the page — panel should remember the new order (persisted in localStorage).

- [ ] **Step 5: Verify Reset stub fires**

Click "↺ Reset" on any section. Browser alert should appear: "Reset stub for: [key]". Click OK.

- [ ] **Step 6: Commit**

```bash
git add frontend/sections-ui.js
git commit -m "feat: sections-ui.js — panel rendering, checkbox hide/show, drag-and-drop reorder"
```

---

### Task 4: Replace Reset stub with modal + undo toast in `frontend/sections-ui.js`

**Files:**
- Modify: `frontend/sections-ui.js`

**Context:** Replace the `showResetModal` stub and the closing `DOMContentLoaded` + `return` block with the full modal + toast implementation. The modal reads section label from `sectionsState.SECTION_DEFS`. On confirm, `sectionsState.resetSectionYaml()` replaces the section in the YAML editor and an undo toast appears for 5s at the top of the screen.

- [ ] **Step 1: In `frontend/sections-ui.js`, replace everything from `function showResetModal` to the end of the file**

Find (at the bottom of the IIFE):
```js
  function showResetModal(key) {
    // Stub — replaced in Task 4
    alert(`Reset stub for: ${key}`);
  }

  document.addEventListener("DOMContentLoaded", () => {
    header.addEventListener("click", togglePanel);
    buildPanel();
    window.editorAdapter.onChange(() => buildPanel());
  });

  return { buildPanel };
})();

window.sectionsUI = sectionsUI;
```

Replace with:
```js
  const modal = document.getElementById("reset-modal");
  const modalTitle = document.getElementById("reset-modal-title");
  const modalCancel = document.getElementById("reset-modal-cancel");
  const modalConfirm = document.getElementById("reset-modal-confirm");

  const toast = document.getElementById("undo-toast");
  const toastMsg = document.getElementById("undo-toast-message");
  const toastBtn = document.getElementById("undo-toast-btn");

  let toastTimer = null;
  let pendingUndo = null; // { key, previousSectionYaml }

  function hideToast() {
    clearTimeout(toastTimer);
    toast.style.display = "none";
    pendingUndo = null;
  }

  function showToast(label, key, previousSectionYaml) {
    clearTimeout(toastTimer);
    pendingUndo = { key, previousSectionYaml };
    toastMsg.textContent = `${label} reset`;
    toast.style.display = "flex";
    toastTimer = setTimeout(hideToast, 5000);
  }

  toastBtn.addEventListener("click", () => {
    if (!pendingUndo) return;
    const { key, previousSectionYaml } = pendingUndo;
    const restored = sectionsState.restoreSectionYaml(
      key,
      previousSectionYaml,
      app.state.yaml
    );
    if (restored) {
      window.editorAdapter.setValue(restored);
      app.setState({ yaml: restored });
    }
    hideToast();
  });

  function showResetModal(key) {
    const def = sectionsState.SECTION_DEFS[key];
    modalTitle.textContent = `Reset ${def.label}?`;
    modal.style.display = "flex";

    function onConfirm() {
      modal.style.display = "none";
      cleanup();
      const result = sectionsState.resetSectionYaml(key, app.state.yaml);
      if (!result) return;
      window.editorAdapter.setValue(result.newYaml);
      app.setState({ yaml: result.newYaml });
      showToast(def.label, key, result.previousYaml);
    }

    function onCancel() {
      modal.style.display = "none";
      cleanup();
    }

    function cleanup() {
      modalConfirm.removeEventListener("click", onConfirm);
      modalCancel.removeEventListener("click", onCancel);
    }

    modalConfirm.addEventListener("click", onConfirm);
    modalCancel.addEventListener("click", onCancel);
  }

  document.addEventListener("DOMContentLoaded", () => {
    header.addEventListener("click", togglePanel);
    buildPanel();
    window.editorAdapter.onChange(() => buildPanel());
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.style.display = "none";
    });
  });

  return { buildPanel };
})();

window.sectionsUI = sectionsUI;
```

- [ ] **Step 2: Click "↺ Reset" on any section — verify modal appears**

Expected: modal overlay appears with title "Reset [Section]?" and two buttons: "Cancel" and "↺ Reset" (amber).

- [ ] **Step 3: Click Cancel — verify modal closes with no changes**

- [ ] **Step 4: Reset the Experience section — verify YAML changes and toast appears**

Click "↺ Reset" on Experience, then click "↺ Reset" in the modal.
Expected:
- Modal closes
- Experience section in YAML editor is replaced with the default scaffold (just "Job Title" / "Company Name" / "2024")
- Undo toast appears at the top: "Experience reset" + "Undo" button

- [ ] **Step 5: Click Undo — verify content is restored**

Expected: Experience section in YAML editor reverts to its previous content. Toast disappears.

- [ ] **Step 6: Verify clicking the modal overlay closes it**

Open modal, click the dark overlay outside the box. Modal should close without resetting.

- [ ] **Step 7: Verify 5s auto-dismiss**

Open modal, confirm reset, then wait 5 seconds without clicking Undo. Toast should auto-dismiss.

- [ ] **Step 8: Commit**

```bash
git add frontend/sections-ui.js
git commit -m "feat: sections-ui.js — Reset confirmation modal + top-of-screen undo toast"
```

---

### Task 5: Update `preview.js` and `export.js` to use filtered YAML

**Files:**
- Modify: `frontend/preview.js`
- Modify: `frontend/export.js`

**Context:** Both files currently pass `app.state.yaml` directly to backend API calls. They should instead pass `sectionsState.getFilteredYaml(app.state.yaml)` so hidden sections are excluded from the PDF preview and all exports. The `preview.refresh(yaml, template)` function signature does not change — only its callsites.

- [ ] **Step 1: Update the two `refresh(...)` callsites in `frontend/preview.js`**

Find both occurrences of:
```js
refresh(app.state.yaml, app.state.template);
```

Replace both with:
```js
refresh(sectionsState.getFilteredYaml(app.state.yaml), app.state.template);
```

There are exactly two occurrences: one inside the `editorAdapter.onChange` debounce timer and one inside the `setTimeout(..., 200)` initial load.

- [ ] **Step 2: Update `frontend/export.js`**

Find:
```js
body: JSON.stringify({ yaml: app.state.yaml, template: app.state.template }),
```

Replace with:
```js
body: JSON.stringify({ yaml: sectionsState.getFilteredYaml(app.state.yaml), template: app.state.template }),
```

- [ ] **Step 3: Verify hiding a section excludes it from preview**

1. Open http://localhost:8000 with a YAML containing `summary`
2. Let the PDF preview load
3. Uncheck "Summary" in the panel
4. PDF preview regenerates — Summary should not appear in the PDF
5. YAML editor still shows `summary:` key (unchanged on disk)

- [ ] **Step 4: Verify hiding a section excludes it from PDF export**

1. Hide "Summary"
2. Click "↓ PDF" — download and open the PDF. Summary should not appear.
3. Re-check "Summary", click "↓ PDF" again — Summary should appear in the PDF.

- [ ] **Step 5: Commit**

```bash
git add frontend/preview.js frontend/export.js
git commit -m "feat: filter hidden sections from preview and export API calls"
```

---

### Task 6: Remove `frontend/sections.js`

**Files:**
- Delete: `frontend/sections.js`

**Context:** `sections.js` is fully replaced by `sections-state.js` + `sections-ui.js`. The script tag was already removed from `index.html` in Task 2.

- [ ] **Step 1: Confirm `sections.js` is no longer referenced anywhere**

```bash
grep -r "sections\.js" /Users/khjmove/mkcv/frontend/
# Expected: no output
```

- [ ] **Step 2: Delete the file and commit**

```bash
git rm frontend/sections.js
git commit -m "chore: remove sections.js (replaced by sections-state.js + sections-ui.js)"
```

- [ ] **Step 3: Final smoke test**

Open http://localhost:8000. Check the Network tab — no 404 for `sections.js`. Open the Sections panel — all rows render. Hide a section — PDF preview updates. Drag to reorder — order persists on refresh. Reset a section — modal and toast work. All export buttons still work.
