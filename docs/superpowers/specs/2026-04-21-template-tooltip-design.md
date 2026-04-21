# Template Tooltip — Design Spec

**Date:** 2026-04-21  
**Feature:** Hover tooltip showing template description in the template selector

## Overview

Replace the native `<select id="template-select">` in the toolbar with a custom div-based dropdown. When the user hovers over a template option for ~600ms, a speech-bubble tooltip appears to the right showing that template's name and description (sourced from each template's `meta.yaml` via the existing `/api/templates` response).

## Files Changed

- `frontend/index.html` — replace `<select>` with dropdown wrapper div; add CSS for dropdown, option items, and bubble tooltip
- `frontend/templates.js` — build custom dropdown DOM instead of `<option>` elements; add hover/click/outside-click logic

## HTML Structure

Replace:
```html
<select id="template-select" title="Template"></select>
```

With:
```html
<div id="template-select-wrapper">
  <button id="template-trigger"><!-- current template name --></button>
  <div id="template-dropdown" hidden>
    <!-- .tpl-option divs injected by templates.js -->
  </div>
  <div id="template-tooltip" hidden>
    <div id="tooltip-name"></div>
    <div id="tooltip-desc"></div>
  </div>
</div>
```

## CSS

- `#template-select-wrapper`: `position: relative; display: inline-block`
- `#template-trigger`: matches existing `#toolbar select` style (same padding, border, background, font-size)
- `#template-dropdown`: `position: absolute; top: 100%; left: 0; background: #1e1e1e; border: 1px solid #444; border-radius: 6px; min-width: 180px; z-index: 100; box-shadow: 0 8px 24px rgba(0,0,0,0.5)`
- `.tpl-option`: `padding: 7px 12px; color: #aaa; font-size: 0.8rem; cursor: pointer; white-space: nowrap`
- `.tpl-option:hover`, `.tpl-option.selected`: `background: #2a2a2a; color: #eee`
- `#template-tooltip`: `position: absolute; left: calc(100% + 10px); background: #2d2d2d; border: 1px solid #555; border-radius: 10px; padding: 10px 14px; width: 220px; box-shadow: 0 4px 16px rgba(0,0,0,0.5); pointer-events: none; z-index: 101` — with a CSS left-pointing arrow via `::before` pseudo-element
- Tooltip repositions to `right: calc(100% + 10px); left: auto` when near the right viewport edge

## JavaScript Logic (`templates.js`)

**Dropdown open/close:**
- Clicking `#template-trigger` toggles `#template-dropdown` visibility
- Clicking outside the wrapper closes the dropdown (document `click` listener)

**Option rendering:**
- For each template name in `data.templates`, create a `.tpl-option` div with `data-name` and `data-description` attributes
- Display name and `⚠` prefix logic identical to current `<option>` logic
- Mark the currently selected template with `.selected` class

**Hover tooltip (600ms delay):**
- `mouseenter` on `.tpl-option`: start a 600ms `setTimeout`; on fire, populate `#tooltip-name` and `#tooltip-desc`, position tooltip vertically centered on the hovered item, show it
- `mouseleave` on `.tpl-option`: clear the timer, hide `#tooltip-tooltip`
- If `data-description` is empty/missing, skip showing the tooltip

**Selection:**
- `click` on `.tpl-option`: update `.selected` class, update trigger button text, close dropdown, call `app.setState({ template: name })` and `preview.refresh(...)` (same as current `select` change handler)

**Positioning fallback:**
- After showing the tooltip, check if it overflows the right edge of the viewport (`getBoundingClientRect`); if so, switch to left-side positioning

## Behavior Notes

- Hover delay: **600ms**
- The tooltip is hidden when the dropdown is closed
- The `⚠` prefix for invalid templates is preserved
- No keyboard navigation changes (out of scope)
