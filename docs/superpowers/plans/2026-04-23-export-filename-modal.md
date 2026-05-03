# Export Filename Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a styled modal pre-filled with `{slug}_cv.{ext}` when the user clicks an export format, letting them edit the filename before the download starts.

**Architecture:** Intercept the existing hidden-button click handlers in `export.js` to open a new `#filename-modal` (added to `index.html`). The modal derives a default name from `personal.name` in the live YAML, then calls the existing fetch+download flow with the user-supplied name.

**Tech Stack:** Vanilla JS, `jsyaml` (already loaded on the page), existing modal CSS classes (`.modal-backdrop`, `.modal`, `.modal-head`, `.modal-body`, `.modal-foot`, `.btn`)

---

## File Map

| File | Change |
|---|---|
| `frontend/index.html` | Add `#filename-modal` markup after `#reset-modal` (line 899) |
| `frontend/export.js` | Full rewrite: add `defaultFilename`, `openFilenameModal`, `closeFilenameModal`; update `exportFile` to accept filename; rewire button listeners |

---

### Task 1: Add `#filename-modal` markup to `index.html`

**Files:**
- Modify: `frontend/index.html` — insert after line 899 (closing `</div>` of `#reset-modal`)

- [ ] **Step 1: Insert the modal HTML**

Open `frontend/index.html`. After the closing `</div>` of `#reset-modal` (line 899), insert:

```html

<!-- ═══ FILENAME MODAL ═══ -->
<div class="modal-backdrop" id="filename-modal">
  <div class="modal">
    <div class="modal-head">
      <div class="eyebrow">Export</div>
      <h2>Save as</h2>
    </div>
    <div class="modal-body">
      <input id="filename-input" type="text"
        style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--rule);border-radius:6px;font-size:13px;background:var(--paper-2);color:var(--ink);">
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" id="filename-modal-cancel">Cancel</button>
      <button class="btn btn-accent" id="filename-modal-confirm">Download</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Verify the markup renders correctly**

Start the dev server if not running:
```bash
cd /Users/khjmove/mkcv && python -m uvicorn backend.main:app --reload
```
Open `http://localhost:8000` in a browser. Open the browser console and run:
```js
document.getElementById('filename-modal').classList.add('open')
```
Expected: the modal appears centered with "Export" eyebrow, "Save as" heading, a text input, Cancel and Download buttons. Close it:
```js
document.getElementById('filename-modal').classList.remove('open')
```

- [ ] **Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "feat: add filename modal markup to index.html"
```

---

### Task 2: Rewrite `export.js` with modal logic

**Files:**
- Modify: `frontend/export.js` — full replacement

- [ ] **Step 1: Replace the entire contents of `export.js`**

```js
const exporter = (() => {
  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function defaultFilename(format) {
    const ext = { markdown: "md", latex: "tex", pdf: "pdf" }[format];
    try {
      const parsed = jsyaml.load(app.state.yaml);
      const name = parsed?.personal?.name;
      if (name && typeof name === "string" && name.trim()) {
        const slug = name.trim().toLowerCase().replace(/\s+/g, "_");
        return `${slug}_cv.${ext}`;
      }
    } catch {}
    return `cv.${ext}`;
  }

  let pendingFormat = null;

  function openFilenameModal(format) {
    pendingFormat = format;
    const input = document.getElementById("filename-input");
    input.value = defaultFilename(format);
    document.getElementById("filename-modal").classList.add("open");
    input.select();
    input.focus();
  }

  function closeFilenameModal() {
    document.getElementById("filename-modal").classList.remove("open");
    pendingFormat = null;
  }

  async function exportFile(format, filename) {
    const ext = { markdown: "md", latex: "tex", pdf: "pdf" }[format];
    const trimmed = filename.trim();
    const finalName = trimmed
      ? (trimmed.includes(".") ? trimmed : `${trimmed}.${ext}`)
      : `cv.${ext}`;

    const body = {
      yaml: sectionsState.getOrderedFilteredYaml(app.state.yaml),
      template: app.state.template,
      section_order: sectionsState.getVisibleOrder(app.state.yaml),
    };
    if (format !== "markdown") {
      body.density = app.state.density;
      body.font_scale = app.state.font_scale;
    }
    try {
      const resp = await fetch(`/api/export/${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const err = await resp.json();
        alert(`Export failed: ${err.message}`);
        return;
      }
      triggerDownload(await resp.blob(), finalName);
    } catch {
      alert("Export failed: network error");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-md").addEventListener("click", () => openFilenameModal("markdown"));
    document.getElementById("btn-tex").addEventListener("click", () => openFilenameModal("latex"));
    document.getElementById("btn-pdf").addEventListener("click", () => openFilenameModal("pdf"));

    document.getElementById("filename-modal-cancel").addEventListener("click", closeFilenameModal);

    document.getElementById("filename-modal-confirm").addEventListener("click", () => {
      const input = document.getElementById("filename-input");
      if (!input.value.trim()) return;
      const fmt = pendingFormat;
      closeFilenameModal();
      exportFile(fmt, input.value);
    });

    document.getElementById("filename-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const input = e.currentTarget;
        if (!input.value.trim()) return;
        const fmt = pendingFormat;
        closeFilenameModal();
        exportFile(fmt, input.value);
      } else if (e.key === "Escape") {
        closeFilenameModal();
      }
    });

    document.getElementById("filename-modal").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeFilenameModal();
    });
  });
})();
```

- [ ] **Step 2: Verify all scenarios manually in the browser**

Reload `http://localhost:8000`.

**Scenario A — default name derived from YAML:**
1. Click Export → PDF
2. Modal opens. Input should read `john_doe_cv.pdf` (or whatever `personal.name` is in your YAML, lowercased, spaces → underscores)
3. Click Download → file downloads with that name

**Scenario B — user edits the filename:**
1. Click Export → PDF
2. Clear the input, type `my_resume`
3. Click Download → file downloads as `my_resume.pdf` (extension auto-appended since no `.` in input)

**Scenario C — user types full name with extension:**
1. Click Export → LaTeX
2. Change input to `application_cv.tex`
3. Click Download → file downloads as `application_cv.tex` (extension not doubled)

**Scenario D — empty input blocked:**
1. Click Export → Markdown
2. Clear the input entirely
3. Click Download → nothing happens, modal stays open

**Scenario E — keyboard shortcuts:**
1. Open modal → press Enter → downloads
2. Open modal → press Escape → modal closes, no download

**Scenario F — click backdrop to dismiss:**
1. Open modal → click the dark backdrop outside the modal box → modal closes, no download

**Scenario G — YAML missing personal.name:**
In the browser console run `app.state.yaml = "summary: hello"` then click Export → PDF. Input should read `cv.pdf`.

- [ ] **Step 3: Run backend tests to confirm no regressions**

```bash
cd /Users/khjmove/mkcv && python -m pytest tests/ -v
```
Expected: all tests pass (no backend code was changed)

- [ ] **Step 4: Commit**

```bash
git add frontend/export.js
git commit -m "feat: show filename modal before export, default to {name}_cv.{ext}"
```
