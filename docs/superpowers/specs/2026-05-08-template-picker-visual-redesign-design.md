# Template Picker Visual Redesign

**Date:** 2026-05-08  
**Status:** Approved

## Overview

Replace the current text-only dropdown template picker with a 3-column portrait thumbnail grid. Pre-committed PNG thumbnails rendered from sample data give users an immediate visual impression of each template before selecting. A delayed hover popover surfaces the description text on demand. There are currently 15 templates.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Interaction pattern | Enhanced wide dropdown (same pill trigger) | Preserves muscle memory, no layout shift |
| Preview content | Static PNGs from fixed sample data | Always available, zero runtime cost |
| Generation timing | Pre-committed static files via script | No startup penalty; script re-run when templates change |
| Grid layout | 3-column portrait grid | 15 templates — scanning by visual character is faster than reading |
| Description exposure | Delayed hover popover (400ms) | Keeps grid clean; detail available without cluttering |

## Thumbnail Generation Script

**Location:** `scripts/generate-template-previews.sh`

**Dependencies:**
- Dev server must be running locally (`http://localhost:8000` or configurable via env var)
- `pdftoppm` (from `poppler-utils`) OR `convert` (ImageMagick) — prefer `pdftoppm`

**Sample data:** `scripts/sample-cv.yaml` — a generic "Jane Smith, Software Engineer" resume with content in every visible section. Fixed, not user data.

**Process per template:**
1. POST `scripts/sample-cv.yaml` content to `/api/preview/pdf` with the template name
2. Receive PDF bytes
3. Extract page 1 as a full-page image (A4 portrait)
4. Scale to **300 × 424px** (A4 ratio 1:√2, 2× retina-ready)
5. Save as `frontend/assets/template-previews/{name}.png`

**Output directory:** `frontend/assets/template-previews/` — committed to the repo.

**When to re-run:** When a template's `cv.tex.j2` changes in a way that affects visual output.

## Frontend Changes

### `index.html` — CSS

- Replace `.tpl-option` rules with new `.tpl-card`, `.tpl-thumb`, `.tpl-label`, `.tpl-popover` rules
- Change `#template-dropdown` width from `min-width: 270px` to `width: 480px`
- Add `display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;` to `#template-dropdown`
- Add per-template fallback gradient classes (`.tpl-thumb-classic`, `.tpl-thumb-boardroom`, etc.) for the `onerror` case
- Popover positioned absolutely to the right of its card; column-3 cards flip it left via a `.col-3` modifier class

### `templates.js` — DOM construction

Replace the `.tpl-option` div construction in the `DOMContentLoaded` block with `.tpl-card` construction:

```
<div class="tpl-card [selected] col-[1|2|3]" data-name="{name}">
  <img class="tpl-thumb"
       src="/assets/template-previews/{name}.png"
       alt="{displayName}"
       onerror="this.style.display='none'; this.nextElementSibling.style.display='block'">
  <div class="tpl-thumb tpl-thumb-{name}" style="display:none"></div>
  <div class="tpl-label">{displayName}</div>
  <div class="tpl-popover">
    <div class="popover-name">{displayName}</div>
    <span class="popover-audience">{audience}</span>
    <div class="popover-desc">{description}</div>
  </div>
</div>
```

**Column assignment:** `(index % 3) + 1` → adds class `col-1`, `col-2`, or `col-3`.

**Hover popover logic** (replaces no equivalent — new behavior):
- `mouseenter`: start a 400ms `setTimeout`; on fire, add `.popover-visible` to the card
- `mouseleave`: clear the timeout; remove `.popover-visible`
- Popover is `pointer-events: none`

**Click handler:** unchanged — calls `window.templateUI.selectTemplate(name)` exactly as before.

**`syncSelectedOption(name)`:** updated to toggle `.selected` on `.tpl-card[data-name]` instead of `.tpl-option[data-name]`.

### What is NOT changed

- `templateUI.selectTemplate()` and all settings sync / preview refresh logic
- `templateRegistry` — no changes
- Backend `main.py`, `/api/templates` response shape — no changes
- Validate button, toast system, masthead structure — no changes
- All other frontend modules (`preview.js`, `settingsSync`, `sectionsState`, etc.)

## Fallback Behavior

If a PNG fails to load (`onerror`):
- The `<img>` is hidden
- A sibling `<div>` with class `tpl-thumb tpl-thumb-{name}` becomes visible
- Each `tpl-thumb-{name}` class has a distinct CSS `linear-gradient` background representing the template's color palette
- No broken-image icon, no layout shift

## File Layout

```
frontend/
  assets/
    template-previews/       ← new directory, committed
      classic.png
      boardroom.png
      trackline.png
      ... (one per template)
  index.html                 ← CSS changes only
  templates.js               ← DOM construction + hover logic

scripts/
  generate-template-previews.sh   ← new script
  sample-cv.yaml                  ← new sample data file
```

## Out of Scope

- Live preview using the user's own YAML data
- On-demand server-side thumbnail generation at runtime
- Thumbnail regeneration on template file change (manual re-run of script is sufficient)
- Changes to template metadata schema or `/api/templates` response
