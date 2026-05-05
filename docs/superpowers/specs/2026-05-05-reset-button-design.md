# Reset Button Design

**Date:** 2026-05-05
**Scope:** Add a full-reset button to the mkcv header; rename the existing layout-reset button.

---

## Goal

Give users a single button that clears all localStorage caches and returns the app to its initial out-of-the-box state (starter resume + default settings). Distinct from the existing settings-only reset.

---

## localStorage Keys in Scope

All keys prefixed `mkcv*` are cleared on full reset:

| Key | Content |
|-----|---------|
| `mkcv:default:resume.yaml` | User's resume YAML |
| `mkcv:default:settings.yaml` | Layout/section settings YAML |
| `mkcv_sections_state` | Section order/visibility (legacy) |
| `mkcv_density` | Density preference (legacy) |
| `mkcv_font_scale` | Font scale preference (legacy) |
| `mkcv_theme` | Light/dark theme |
| `mkcv_settings_v2_migrated` | Migration flag |
| `mkcv_yaml` | Legacy resume key |
| `mkcv_settings_yaml` | Legacy settings key |

---

## Changes

### 1. Rename existing reset button

`#reset-sections-order-btn` label changes from **"Reset settings"** → **"Restore recommended"**.

Behavior is unchanged: applies template defaults for layout/sections without touching resume content.

### 2. New "Reset all" button

**Location:** `.masthead-right`, inserted between the validate icon (`#btn-validate-icon`) and the Export button wrapper.

**Label:** "Reset" (or "Start over")

**Style:** Matches existing masthead button style (ghost/text button).

**ID:** `btn-reset-all`

### 3. Confirmation modal

A new modal overlay added to `index.html` with:

- **Heading:** "Start over?"
- **Body:** "This will clear your resume and all settings, restoring the app to its initial state. This cannot be undone."
- **Buttons:** [Cancel] [Reset]

**ID:** `reset-all-modal`

Reuses the existing `.modal-overlay` / `.modal-box` CSS classes already in the page.

### 4. Reset logic

On confirmation:

```js
// Clear all mkcv localStorage keys
Object.keys(localStorage)
  .filter(k => k.startsWith('mkcv'))
  .forEach(k => localStorage.removeItem(k));

// Reload — app boots fresh with INITIAL_YAML and DEFAULT_SETTINGS
location.reload();
```

On reload the app naturally loads:
- `INITIAL_YAML` (Gildong Hong starter) from `editor-adapter.js`
- `DEFAULT_SETTINGS` (classic / balanced / normal) from `settings-engine.js`
- Theme defaults to `light` (fallback in `index.html` theme-toggle block)

---

## Implementation Files

All changes are confined to `frontend/index.html`:

1. **HTML (masthead-right):** Add `#btn-reset-all` button before the Export wrapper.
2. **HTML (modals area):** Add `#reset-all-modal` markup.
3. **CSS (existing `<style>` block):** Add styles for the new button and modal if not already covered by existing classes.
4. **JS (inline `<script>` block at bottom):** Wire `#btn-reset-all` click → show modal; wire modal Cancel/Reset buttons.
5. **HTML (controls row):** Update `#reset-sections-order-btn` label text.

No new files. No backend changes.

---

## Out of Scope

- Per-section or partial reset (resume only, settings only)
- Undo after full reset
- Server-side state (none exists)
