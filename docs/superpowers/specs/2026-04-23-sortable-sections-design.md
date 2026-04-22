# Sortable Sections Rail — Design Spec

**Date:** 2026-04-23
**Status:** Approved

## Goal

Replace the current HTML5 drag-and-drop implementation in the sections rail with a pointer-events–based sortable that gives live displacement: when a chip is dragged, the other chips move aside in real time to show where it will land.

## Scope

- **Changed files:** `frontend/sections-ui.js`, `frontend/index.html` (CSS only)
- **No new dependencies**
- Only `present` chips (those found in the YAML) are draggable — same as now

## Drag Lifecycle

### Start (`pointerdown`)
1. Record pointer offset within the chip: `offsetX = e.clientX − rect.left`, `offsetY = e.clientY − rect.top`
2. Call `chip.setPointerCapture(e.pointerId)` so subsequent `pointermove`/`pointerup` events are always delivered to this element even if the pointer leaves it
3. Set the original chip to `opacity: 0` (class `dragging`) — it remains in the flex layout as an invisible placeholder holding its slot
4. Create a `position: fixed` clone of the chip (`cloneNode(true)`, class `chip-drag-clone`) and append it to `document.body`
5. Position the clone at `(e.clientX − offsetX, e.clientY − offsetY)`

### During drag (`pointermove`)
1. Move the clone: `left = e.clientX − offsetX`, `top = e.clientY − offsetY`
2. Collect all chips in the panel that are not the placeholder (the dragging one)
3. Find the first chip whose horizontal midpoint (`rect.left + rect.width / 2`) is greater than `e.clientX`
4. Insert the placeholder before that chip — or after the last chip if none qualify
5. Other chips reflow immediately into the new gaps

### End (`pointerup` / `pointercancel`)
1. Remove the clone from `document.body`
2. Read the committed order: `[...panel.querySelectorAll('.chip')].map(c => c.dataset.key)`
3. Call `sectionsState.setOrder(newOrder)` and `preview.refresh(...)`
4. Call `buildPanel()` to restore clean DOM state

### Click guard
The existing `click` handler (toggle hide/show) fires after `pointerup`. Track whether the pointer moved more than **4 px** from its start position; if so, suppress the click.

## CSS

Added to the `.chip` block and nearby rules in `index.html`:

```css
/* Prevent scroll interference on touch devices */
.chip { touch-action: none; }

/* Invisible placeholder that holds space during drag */
.chip.dragging { opacity: 0; }

/* Floating clone that follows the cursor */
.chip-drag-clone {
  position: fixed;
  pointer-events: none;
  z-index: 200;
  opacity: 0.85;
  cursor: grabbing;
}
```

No CSS transitions are added — instant reflow reads naturally for a short horizontal rail.

## Edge Cases

| Case | Handling |
|---|---|
| `pointercancel` | Clean up clone, call `buildPanel()` to restore original order |
| Drag on absent chip | `draggable` not set, no event listeners attached — same as now |
| Very short drag (< 4 px) | Treated as a click; order unchanged |
| Single chip in rail | `pointermove` finds no other chips; placeholder stays in place |
