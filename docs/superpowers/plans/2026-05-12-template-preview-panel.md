# Template Floating Preview Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing small text-only template hover popover with a floating preview panel (220px wide) that shows a large preview image, all template metadata, and a "Use this template" button — without changing the card grid layout.

**Architecture:** The existing `#tpl-popover-portal` element is reused with richer HTML. Card clicks no longer apply templates; hover (400ms delay) shows the panel, and a "Use this template" button in the panel applies it. The panel uses `pointer-events: auto` so the button is clickable, with a 120ms mouseleave grace period so the cursor can travel from card to panel without the panel disappearing.

**Tech Stack:** Vanilla JS (ESM), CSS custom properties, Node.js built-in test runner (`node:test`), happy-dom for DOM simulation.

---

## File Map

| File | What changes |
|---|---|
| `frontend/src/index.css` | Widen portal from 164px → 220px; remove `pointer-events: none`; add `.tpl-preview-img`, `.tpl-preview-img-fallback`, `.tpl-use-btn` styles |
| `frontend/src/templates.js` | Remove card click→selectTemplate listener; build portal HTML directly (image + metadata + button); add portal mouseenter/mouseleave listeners; change `POPOVER_W` 164 → 220; add 120ms hide-delay per card |
| `tests/test_templates_ui_sync.js` | Add two new tests; existing tests are unchanged |

---

### Task 1: Update CSS for the wider panel

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Widen the portal, remove pointer-events block, add new component styles**

  In `frontend/src/index.css`, replace the `#tpl-popover-portal` block and append new rules. Find these lines (currently around line 199–210):

  ```css
      #tpl-popover-portal {
        position: absolute;
        width: 164px;
        background: var(--paper);
        border: 1px solid var(--rule);
        border-radius: 10px;
        padding: 12px;
        box-shadow: var(--shadow-md);
        z-index: 9999;
        pointer-events: none;
      }
      #tpl-popover-portal[hidden] { display: none; }
  ```

  Replace with:

  ```css
      #tpl-popover-portal {
        position: absolute;
        width: 220px;
        background: var(--paper);
        border: 1px solid var(--rule);
        border-radius: 10px;
        padding: 12px;
        box-shadow: var(--shadow-md);
        z-index: 9999;
      }
      #tpl-popover-portal[hidden] { display: none; }

      .tpl-preview-img {
        width: 100%;
        aspect-ratio: 1 / 1.414;
        object-fit: cover;
        object-position: top;
        border-radius: 6px;
        display: block;
        margin-bottom: 10px;
      }
      .tpl-preview-img-fallback {
        width: 100%;
        aspect-ratio: 1 / 1.414;
        border-radius: 6px;
        display: block;
        margin-bottom: 10px;
      }
      .tpl-use-btn {
        display: block;
        width: 100%;
        margin-top: 10px;
        padding: 7px 0;
        background: var(--accent);
        color: var(--paper);
        border: none;
        border-radius: 6px;
        font-family: var(--font-sans);
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        letter-spacing: 0.01em;
      }
      .tpl-use-btn:hover { opacity: 0.88; }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add frontend/src/index.css
  git commit -m "style: widen template portal to 220px, add preview image and use-button styles"
  ```

---

### Task 2: Write failing tests

**Files:**
- Modify: `tests/test_templates_ui_sync.js`

- [ ] **Step 1: Add two tests at the bottom of the file**

  Open `tests/test_templates_ui_sync.js`. After the last existing test (line 218), append:

  ```js
  test('clicking a card does not apply the template', async () => {
    const { app, elements, refreshCalls } = await createContext();

    const cards = Array.from(elements.get('template-grid').children);
    const sigCard = cards.find(c => c.dataset.name === 'signature-split');
    assert.ok(sigCard, 'signature-split card found');

    sigCard.click();

    assert.equal(app.state.template, 'classic', 'template unchanged after card click');
    assert.equal(refreshCalls.length, 0, 'no preview refresh triggered by card click');
  });

  test('hovering a card shows portal with image src, metadata, and use button', async (t) => {
    t.mock.timers.enable(['setTimeout']);

    const { elements } = await createContext();

    const portal = elements.get('tpl-popover-portal');
    const cards = Array.from(elements.get('template-grid').children);
    const sigCard = cards.find(c => c.dataset.name === 'signature-split');
    assert.ok(sigCard, 'signature-split card found');

    sigCard.dispatchEvent(new Event('mouseenter'));
    t.mock.timers.tick(400);

    assert.ok(!portal.hidden, 'portal is visible after hover delay');
    assert.match(portal.innerHTML, /template-previews\/signature-split\.png/, 'portal has preview image src');
    assert.match(portal.innerHTML, /Creative direction/, 'portal has description');
    assert.match(portal.innerHTML, /Popular/, 'portal has badge');
    assert.match(portal.innerHTML, /Use this template/, 'portal has use button');

    t.mock.timers.reset();
  });
  ```

- [ ] **Step 2: Run tests — confirm both new tests FAIL**

  ```bash
  npm run test:js 2>&1 | grep -A 3 "clicking a card\|hovering a card"
  ```

  Expected output: both tests fail.
  - "clicking a card…" fails because card click currently calls `selectTemplate` (changes `app.state.template`).
  - "hovering a card…" fails because the portal HTML currently has no `<img>` and no "Use this template".

- [ ] **Step 3: Commit the failing tests**

  ```bash
  git add tests/test_templates_ui_sync.js
  git commit -m "test: add failing tests for new template preview panel behavior"
  ```

---

### Task 3: Update templates.js hover and click logic

**Files:**
- Modify: `frontend/src/templates.js`

- [ ] **Step 1: Hoist timer variables outside the forEach**

  In `frontend/src/templates.js`, find this block (around line 208):

  ```js
    let cardIndex = 0;
    data.templates.forEach((name) => {
  ```

  Replace it with (adds two shared timers before the loop):

  ```js
    let hoverTimer = null;
    let hideTimer  = null;
    let cardIndex = 0;
    data.templates.forEach((name) => {
  ```

  Then, inside the forEach body, find and **delete** the existing per-card declaration (around line 250):

  ```js
      let hoverTimer = null;
  ```

  Delete that line entirely — the outer `hoverTimer` now serves all cards.

- [ ] **Step 2: Update the constant and remove the card click listener**

  Inside the forEach, find:

  ```js
        card.addEventListener("click", (e) => {
          e.stopPropagation();
          templateUI.selectTemplate(name);
        });
  ```

  Delete those four lines entirely. Card clicks no longer apply templates.

  Also find the `POPOVER_W` constant inside the mouseenter handler:

  ```js
          const POPOVER_W   = 164;
  ```

  Change it to:

  ```js
          const POPOVER_W   = 220;
  ```

- [ ] **Step 3: Replace the mouseenter handler body with the new portal HTML builder**

  Find the full mouseenter handler (around line 251–270):

  ```js
        card.addEventListener("mouseenter", () => {
          hoverTimer = setTimeout(() => {
            const tplContent = card.querySelector(".tpl-popover");
            if (portal && tplContent) {
              const cardRect    = card.getBoundingClientRect();
              const wrapperRect = wrapper.getBoundingClientRect();
              const POPOVER_W   = 164;
              const GAP         = 10;
              portal.innerHTML  = tplContent.innerHTML;
              portal.style.top  = (cardRect.top - wrapperRect.top) + "px";
              const spaceRight  = window.innerWidth - cardRect.right - GAP;
              if (spaceRight >= POPOVER_W) {
                portal.style.left  = (cardRect.right - wrapperRect.left + GAP) + "px";
                portal.style.right = "";
              } else {
                portal.style.left  = (cardRect.left - wrapperRect.left - GAP - POPOVER_W) + "px";
                portal.style.right = "";
              }
              portal.hidden = false;
            }
          }, 400);
        });
  ```

  Replace with:

  ```js
        card.addEventListener("mouseenter", () => {
          clearTimeout(hideTimer);
          hoverTimer = setTimeout(() => {
            if (!portal) return;
            const cardRect    = card.getBoundingClientRect();
            const wrapperRect = wrapper.getBoundingClientRect();
            const POPOVER_W   = 220;
            const GAP         = 10;
            portal.innerHTML = `
              <img class="tpl-preview-img"
                   src="/assets/template-previews/${name}.png"
                   alt="${displayName}"
                   onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
              <div class="tpl-preview-img-fallback tpl-thumb-${name}" style="display:none"></div>
              <div class="popover-name">${displayName}</div>
              ${audience ? `<span class="popover-audience">${audience}</span>` : ""}
              ${badge    ? `<span class="popover-badge">${badge}</span>`       : ""}
              ${description ? `<div class="popover-desc">${description}</div>` : ""}
              <button class="tpl-use-btn">Use this template</button>
            `;
            portal.querySelector(".tpl-use-btn").addEventListener("click", (e) => {
              e.stopPropagation();
              templateUI.selectTemplate(name);
            });
            portal.style.top  = (cardRect.top - wrapperRect.top) + "px";
            const spaceRight  = window.innerWidth - cardRect.right - GAP;
            if (spaceRight >= POPOVER_W) {
              portal.style.left  = (cardRect.right - wrapperRect.left + GAP) + "px";
              portal.style.right = "";
            } else {
              portal.style.left  = (cardRect.left - wrapperRect.left - GAP - POPOVER_W) + "px";
              portal.style.right = "";
            }
            portal.hidden = false;
          }, 400);
        });
  ```

- [ ] **Step 4: Replace the mouseleave handler with the grace-period version**

  Find:

  ```js
        card.addEventListener("mouseleave", () => {
          clearTimeout(hoverTimer);
          if (portal) portal.hidden = true;
        });
  ```

  Replace with:

  ```js
        card.addEventListener("mouseleave", () => {
          clearTimeout(hoverTimer);
          hideTimer = setTimeout(() => {
            if (portal) portal.hidden = true;
          }, 120);
        });
  ```

- [ ] **Step 5: Add portal mouseenter/mouseleave listeners (after the forEach, before the catch block)**

  Find the line just after the forEach closes:

  ```js
    } catch {
  ```

  Insert these lines immediately before the `} catch {` line:

  ```js
    if (portal) {
      portal.addEventListener("mouseenter", () => clearTimeout(hideTimer));
      portal.addEventListener("mouseleave", () => { if (portal) portal.hidden = true; });
    }
  ```

- [ ] **Step 6: Run the full JS test suite — all tests must pass**

  ```bash
  npm run test:js
  ```

  Expected: all tests pass, including the two new ones.

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/templates.js
  git commit -m "feat: replace template hover popover with floating preview panel"
  ```

---

### Task 4: Manual smoke test

**Files:** none — verification only

- [ ] **Step 1: Start the dev server**

  ```bash
  npm run dev
  ```

  Open `http://localhost:5173` (or whatever port your dev server uses — check package.json `"dev"` script).

- [ ] **Step 2: Verify the golden path**

  1. Click the template picker pill in the masthead — the card grid opens.
  2. Hover over any card — after ~400ms a panel appears to the right showing the large preview image, name, audience tag, badge, description, and "Use this template" button.
  3. Move the cursor from the card into the panel — the panel stays visible.
  4. Click "Use this template" — the template is applied (preview pane updates, pill label changes), dropdown closes.
  5. Hover a card near the right edge of the viewport — the panel flips to the left side.

- [ ] **Step 3: Verify no regressions**

  1. Click a card directly (without clicking "Use this template") — the template should NOT change.
  2. Move cursor away from the card without entering the panel — panel disappears after ~120ms.
  3. Open the picker, select a template, close the picker — the selected card retains its blue border.
  4. The existing hover-text popover information (audience, badge, description) all appears in the panel.
