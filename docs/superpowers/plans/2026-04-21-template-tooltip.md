# Template Tooltip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native `<select>` template picker with a custom dropdown that shows a speech-bubble tooltip with the template's description after hovering an option for 600ms.

**Architecture:** Modify `index.html` to swap the `<select>` for a `<div>`-based wrapper and add all necessary CSS. Rewrite the DOM-building and event logic in `templates.js` to build custom option divs, handle open/close, selection, and hover tooltip positioning. No backend changes needed — description data already arrives via `/api/templates` → `meta[name].description`.

**Tech Stack:** Vanilla JS, plain HTML/CSS. No new dependencies.

---

## File Map

- Modify: `frontend/index.html` — replace `<select id="template-select">` with wrapper div; add dropdown + tooltip CSS inside existing `<style>` block
- Modify: `frontend/templates.js` — rewrite to build custom dropdown DOM; add open/close, selection, hover tooltip logic

---

### Task 1: Replace `<select>` with wrapper div in `index.html`

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Replace the `<select>` element**

In `frontend/index.html`, find line 258:
```html
<select id="template-select" title="Template"></select>
```
Replace it with:
```html
<div id="template-select-wrapper">
  <button id="template-trigger" type="button">Template</button>
  <div id="template-dropdown" hidden></div>
  <div id="template-tooltip" hidden>
    <div id="tooltip-name"></div>
    <div id="tooltip-desc"></div>
  </div>
</div>
```

- [ ] **Step 2: Add CSS for the custom dropdown**

Inside the `<style>` block in `frontend/index.html`, add the following rules after the `#toolbar button:hover` rule (after line 50):

```css
#template-select-wrapper {
  position: relative;
  display: inline-block;
}

#template-trigger {
  padding: 5px 12px;
  border-radius: 4px;
  border: 1px solid #444;
  background: #222;
  color: #eee;
  font-size: 0.875rem;
  cursor: pointer;
  white-space: nowrap;
}

#template-trigger:hover { background: #333; }

#template-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 6px;
  min-width: 180px;
  z-index: 100;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  overflow: hidden;
}

.tpl-option {
  padding: 7px 12px;
  color: #aaa;
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
}

.tpl-option:hover,
.tpl-option.selected {
  background: #2a2a2a;
  color: #eee;
}

#template-tooltip {
  position: absolute;
  left: calc(100% + 10px);
  top: 0;
  background: #2d2d2d;
  border: 1px solid #555;
  border-radius: 10px;
  padding: 10px 14px;
  width: 220px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  pointer-events: none;
  z-index: 101;
}

#template-tooltip::before {
  content: '';
  position: absolute;
  left: -7px;
  top: 50%;
  transform: translateY(-50%);
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-right: 7px solid #555;
}

#template-tooltip::after {
  content: '';
  position: absolute;
  left: -6px;
  top: 50%;
  transform: translateY(-50%);
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-right: 7px solid #2d2d2d;
}

#tooltip-name {
  font-weight: 600;
  color: #eee;
  font-size: 0.78rem;
  margin-bottom: 4px;
}

#tooltip-desc {
  color: #aaa;
  font-size: 0.73rem;
  line-height: 1.4;
}

#template-tooltip.flip-left {
  left: auto;
  right: calc(100% + 10px);
}

#template-tooltip.flip-left::before {
  left: auto;
  right: -7px;
  border-right: none;
  border-left: 7px solid #555;
}

#template-tooltip.flip-left::after {
  left: auto;
  right: -6px;
  border-right: none;
  border-left: 7px solid #2d2d2d;
}
```

- [ ] **Step 3: Remove the old `#toolbar select` rule reference**

The existing rule `#toolbar select, #toolbar button { ... }` (line 40) still applies to `#toolbar button` — that's fine, leave it. The `select` part just has no target anymore, which is harmless.

- [ ] **Step 4: Verify HTML in browser**

Start the backend (`uvicorn backend.main:app --reload` from project root) and open `http://localhost:8000`. The toolbar should show a "Template" button where the select was. Clicking it does nothing yet — that's expected.

- [ ] **Step 5: Commit**

```bash
git add frontend/index.html
git commit -m "feat: replace template select with custom dropdown wrapper and CSS"
```

---

### Task 2: Build dropdown DOM and implement open/close in `templates.js`

**Files:**
- Modify: `frontend/templates.js`

- [ ] **Step 1: Rewrite `templates.js`**

Replace the entire contents of `frontend/templates.js` with:

```js
document.addEventListener("DOMContentLoaded", async () => {
    const wrapper   = document.getElementById("template-select-wrapper");
    const trigger   = document.getElementById("template-trigger");
    const dropdown  = document.getElementById("template-dropdown");
    const tooltip   = document.getElementById("template-tooltip");
    const tooltipName = document.getElementById("tooltip-name");
    const tooltipDesc = document.getElementById("tooltip-desc");
    const banner    = document.getElementById("error-banner");
    const btnValidate = document.getElementById("btn-validate-template");

    let allMeta = {};
    let hoverTimer = null;

    // ── helpers ──────────────────────────────────────────────────────────────

    function openDropdown() {
        dropdown.hidden = false;
        trigger.style.borderColor = "#666";
    }

    function closeDropdown() {
        dropdown.hidden = true;
        trigger.style.borderColor = "";
        hideTooltip();
    }

    function hideTooltip() {
        clearTimeout(hoverTimer);
        hoverTimer = null;
        tooltip.hidden = true;
        tooltip.classList.remove("flip-left");
    }

    function showTooltip(optionEl, name, description) {
        tooltipName.textContent = name;
        tooltipDesc.textContent = description;

        // position vertically centred on the hovered option
        const optRect = optionEl.getBoundingClientRect();
        const wrapRect = wrapper.getBoundingClientRect();
        const offsetTop = optRect.top - wrapRect.top + optRect.height / 2;
        tooltip.style.top = offsetTop + "px";
        tooltip.style.transform = "translateY(-50%)";

        tooltip.hidden = false;
        tooltip.classList.remove("flip-left");

        // flip left if tooltip overflows viewport right edge
        const tipRect = tooltip.getBoundingClientRect();
        if (tipRect.right > window.innerWidth - 8) {
            tooltip.classList.add("flip-left");
        }
    }

    function selectTemplate(name) {
        // update selected class
        dropdown.querySelectorAll(".tpl-option").forEach(el => {
            el.classList.toggle("selected", el.dataset.name === name);
        });
        const meta = allMeta[name] || {};
        trigger.textContent = meta.display_name || (name.charAt(0).toUpperCase() + name.slice(1));
        closeDropdown();
        app.setState({ template: name });
        preview.refresh(sectionsState.getFilteredYaml(app.state.yaml), name);
    }

    // ── toggle dropdown on trigger click ─────────────────────────────────────

    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        if (dropdown.hidden) openDropdown(); else closeDropdown();
    });

    // ── close on outside click ────────────────────────────────────────────────

    document.addEventListener("click", (e) => {
        if (!wrapper.contains(e.target)) closeDropdown();
    });

    // ── fetch templates and build option divs ─────────────────────────────────

    try {
        const data = await (await fetch("/api/templates")).json();
        const validationMap = data.validation || {};
        allMeta = data.meta || {};

        data.templates.forEach((name) => {
            const meta = allMeta[name] || {};
            const isValid = validationMap[name] ? validationMap[name].valid : null;
            const prefix = isValid === false ? "⚠ " : "";
            const displayName = meta.display_name || (name.charAt(0).toUpperCase() + name.slice(1));

            const opt = document.createElement("div");
            opt.className = "tpl-option";
            opt.dataset.name = name;
            opt.dataset.description = meta.description || "";
            opt.textContent = prefix + displayName;
            if (name === app.state.template) {
                opt.classList.add("selected");
                trigger.textContent = prefix + displayName;
            }

            // hover tooltip with 600ms delay
            opt.addEventListener("mouseenter", () => {
                const desc = opt.dataset.description;
                if (!desc) return;
                hoverTimer = setTimeout(() => {
                    showTooltip(opt, displayName, desc);
                }, 600);
            });

            opt.addEventListener("mouseleave", () => {
                hideTooltip();
            });

            opt.addEventListener("click", (e) => {
                e.stopPropagation();
                selectTemplate(name);
            });

            dropdown.appendChild(opt);
        });

    } catch {
        const opt = document.createElement("div");
        opt.className = "tpl-option selected";
        opt.dataset.name = "classic";
        opt.dataset.description = "";
        opt.textContent = "Classic";
        opt.addEventListener("click", () => selectTemplate("classic"));
        dropdown.appendChild(opt);
        trigger.textContent = "Classic";
    }

    // ── validate button (unchanged) ───────────────────────────────────────────

    btnValidate.addEventListener("click", async () => {
        const name = app.state.template;
        btnValidate.disabled = true;
        btnValidate.textContent = "Validating…";
        try {
            const resp = await fetch(`/api/templates/${name}/validate`, { method: "POST" });
            const data = await resp.json();
            banner.style.display = "block";
            if (data.valid) {
                banner.style.background = "#1a3a1a";
                banner.style.color = "#86efac";
                banner.textContent = `✓ Template '${name}' is valid (Jinja2 + pdflatex OK)`;
            } else {
                banner.style.background = "#5c1f1f";
                banner.style.color = "#fca5a5";
                banner.textContent = `⚠ Template '${name}' invalid: ${data.errors.join(" · ")}`;
            }
            setTimeout(() => {
                banner.style.display = "none";
                banner.style.background = "";
                banner.style.color = "";
                banner.textContent = "";
            }, 8000);
        } catch {
            banner.style.display = "block";
            banner.style.background = "#5c1f1f";
            banner.style.color = "#fca5a5";
            banner.textContent = "Validation request failed";
        } finally {
            btnValidate.disabled = false;
            btnValidate.textContent = "✓ Validate Template";
        }
    });
});
```

- [ ] **Step 2: Verify in browser**

Reload `http://localhost:8000`. Check:
- Clicking the trigger button opens the dropdown list of template names
- Clicking an option closes the dropdown and the preview updates to that template
- Clicking anywhere outside the dropdown closes it
- The currently selected template has a highlighted (`.selected`) style

- [ ] **Step 3: Verify hover tooltip**

Hover over a template option in the open dropdown and hold for ~600ms. A bubble should appear to the right showing the template name (bold) and its description. Moving the mouse away hides it immediately.

Test with the **"Hipster"** option — expected description: *"Dark sidebar with colorbox section headers and circular photo, teal accent — creative, design, UX, startup roles"*

- [ ] **Step 4: Verify viewport edge case**

If your browser window is narrow enough that the dropdown sits near the right edge, the tooltip should flip to appear on the left side of the dropdown instead. To test: shrink the browser window width until the dropdown is near the right edge, then hover an option.

- [ ] **Step 5: Commit**

```bash
git add frontend/templates.js
git commit -m "feat: custom template dropdown with hover tooltip bubble (600ms delay)"
```
