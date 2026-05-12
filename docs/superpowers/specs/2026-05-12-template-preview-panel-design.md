# Template Floating Preview Panel

**Date:** 2026-05-12  
**Status:** Approved

## Problem

The current template picker shows small thumbnail cards in a 3-column grid dropdown. Hovering a card reveals a tiny 164px-wide text-only popover (name, audience tag, badge, description) — but no enlarged image. Users cannot inspect a template clearly before selecting it.

## Goal

Let users see a large, readable preview of any template before applying it, without leaving the picker flow.

## Chosen Approach

A **floating preview panel** appears alongside the existing card grid when the user hovers a card. The grid dropdown is unchanged in size and position. The panel floats to the right (or left if space is insufficient) and stays visible while the user's cursor is over a card.

## Interaction Flow

1. User clicks the template picker pill → card grid opens (unchanged)
2. User hovers a card (400ms delay) → floating panel appears alongside the grid
3. Panel shows: large preview image, template name, audience tag, badge, description, "Use this template" button
4. User clicks "Use this template" → template is applied, dropdown closes
5. User moves cursor off the card → panel disappears
6. Clicking a card **does not** apply the template — it only shows the panel on hover

## Panel Content

Top to bottom:
- **Preview image** — full `aspect-ratio: 1/1.414` (A4 portrait), sourced from `/assets/template-previews/${name}.png` with gradient fallback; fills the panel width
- **Name** — serif, 12px, semi-bold
- **Audience tag + badge** — same pill style as current popover
- **Description** — 11px, secondary color, 1.5 line-height
- **"Use this template" button** — full-width, primary accent color; calls `templateUI.selectTemplate(name)`

## Positioning

- Default: panel floats to the **right** of the dropdown, with a small gap
- Fallback: if insufficient space on the right (`window.innerWidth - dropdownRight < panelWidth + gap`), panel flips to the **left**
- Vertical alignment: panel top aligns with the hovered card's top (mirrors existing popover logic)
- `pointer-events: auto` on the panel — the panel itself must be interactive so the "Use this template" button is clickable
- The hover timer is **not** cancelled when the cursor moves from the card into the panel; entering the panel keeps it visible
- The panel hides when the cursor leaves both the card **and** the panel (mouseleave on both, with the panel also dismissing on `mouseleave`)

## Files Changed

| File | Change |
|---|---|
| `frontend/src/templates.js` | Replace hover handler's popover clone logic with new panel HTML builder; card click no longer calls `selectTemplate` |
| `frontend/src/index.css` | Widen `#tpl-popover-portal` from 164px to ~220px; add styles for `.tpl-preview-img`, `.tpl-use-btn` |
| `frontend/index.html` | No structural changes — `#tpl-popover-portal` is reused |

## What Does Not Change

- The card grid layout, size, and scroll behaviour
- The selected-card highlight (blue border on active template)
- The template application logic in `selectTemplate()`
- The dropdown open/close behaviour
- The 400ms hover delay before showing the panel
