# Reset Order Button — Design Spec

**Date:** 2026-04-20

## Summary

Add a "↺ Reset Order" button at the far right of `#sections-panel`. It is only visible when the sections panel is open. Clicking it resets section order and visibility to defaults — UI state only, no YAML changes.

## Behavior

- **Trigger:** Click the "↺ Reset Order" button.
- **Effect:**
  1. `sectionsState.resetAll()` — writes `{ hidden: [], order: [...DEFAULT_ORDER] }` to localStorage.
  2. `sectionsUI.buildPanel()` — re-renders chips in default order with all checkboxes checked.
  3. `preview.refresh(...)` — updates preview to reflect restored visibility/order.
- **No confirmation modal** — action is reversible (user can re-drag/re-hide).
- **YAML not touched** — purely local UI state.

## Placement

Inside `#sections-panel` as the last child, aligned to the far right via `margin-left: auto`.

## Styling

Small, muted button matching the dark toolbar theme. Uses text label `↺ Reset Order` (not just `↺`) to distinguish from per-section reset buttons.

## Changes Required

1. **`sections-state.js`** — add `resetAll()` that saves `{ hidden: [], order: [...DEFAULT_ORDER] }`.
2. **`sections-ui.js`** — append the button in `buildPanel()`, wired to `resetAll()` + `buildPanel()` + `preview.refresh()`.
3. **`index.html`** — add `.btn-reset-order` CSS rule for the button style.
