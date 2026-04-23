# Export Filename Modal — Design Spec

**Date:** 2026-04-23

## Summary

When the user clicks an export format (PDF, LaTeX, Markdown), a modal appears with a pre-filled filename before the download starts. The user can edit the name or accept the default, then click Download.

## Default Filename

Derived at click time from `personal.name` in the current YAML:

- Parse `app.state.yaml` with `jsyaml.load()` (already loaded on page)
- Read `personal.name`, e.g. `"John Doe"`
- Transform: lowercase, spaces → underscores → `john_doe`
- Append format suffix: `john_doe_cv.pdf` / `john_doe_cv.tex` / `john_doe_cv.md`
- Fallback to `cv.pdf` / `cv.tex` / `cv.md` if `personal.name` is missing or YAML fails to parse

## Components

### `index.html` — `#filename-modal`

New static modal following the existing `#reset-modal` pattern:

```
eyebrow: "Export"
h2: "Save as"
body: <input id="filename-input" type="text" …>
foot: [Cancel] [Download]
```

Reuses `.modal-backdrop`, `.modal`, `.modal-head`, `.modal-body`, `.modal-foot`, `.btn`, `.btn-ghost`, `.btn-accent` — no new CSS classes.

### `export.js` — modal intercept

Flow change:

1. User clicks export option → `openFilenameModal(format)` is called instead of `exportFile` directly
2. `openFilenameModal` computes the default name, sets `#filename-input` value, stores the pending format, opens the modal
3. "Download" button click (or Enter key in input) → closes modal, calls existing `exportFile(format, filename)`
4. "Cancel" button click (or Escape key) → closes modal, no download
5. `exportFile` signature gains an optional `filename` parameter; falls back to hardcoded name if not provided (no regression)

## Data Flow

```
click export option
  → openFilenameModal(format)
      → parse app.state.yaml → personal.name
      → build default filename
      → populate #filename-input
      → show modal
          ↓ user edits or accepts
      → click Download / Enter
          → exportFile(format, inputValue)
              → POST /api/export/{format}
              → triggerDownload(blob, inputValue)
```

## Edge Cases

- `personal.name` missing or blank: fall back to `cv.{ext}`
- YAML parse error: fall back to `cv.{ext}` (no error shown to user)
- Empty input on Download click: prevent download, keep modal open (do not submit empty filename)
- Extension stripping: if the user types `john_doe_cv.pdf`, the extension is preserved as-is. If the user removes the extension, it is re-appended before download.

## Files Changed

| File | Change |
|---|---|
| `frontend/index.html` | Add `#filename-modal` markup after `#reset-modal` |
| `frontend/export.js` | Add `openFilenameModal`, update `exportFile` signature, wire modal events |

## Out of Scope

- Remembering the last-used filename across sessions
- Validating for OS-illegal characters (browser download handles this)
- Changing the filename from the YAML `personal.name` field inline
