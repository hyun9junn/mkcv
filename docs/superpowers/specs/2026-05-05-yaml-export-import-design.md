# YAML Backup Export / Import — Design Spec

**Date:** 2026-05-05
**Status:** Approved

---

## Overview

Add the ability to export both YAML files (`resume.yaml` and `settings.yaml`) as a single timestamped ZIP backup, and import a previously exported ZIP to restore either or both files.

---

## Decisions

| Question | Decision |
|---|---|
| Export format | Single `.zip` containing both files |
| Import partial zip | Apply files that are present; leave the other untouched |
| UI location | Inside existing `#export-menu` dropdown, below an `<hr>` |
| Filename | Timestamped: `mkcv-backup-YYYY-MM-DD.zip` |
| Save dialog | Silent download to Downloads folder (`<a download>`) — no File System Access API |
| Confirmation | Show a modal before overwriting editor content |
| ZIP library | JSZip loaded from CDN |

---

## Architecture

### New file: `frontend/yaml-backup.js`

Exposes a single `window.yamlBackup` object with two public methods. Loaded in `index.html` after `settings-sync.js`.

The module communicates with the rest of the app only through existing public interfaces — it does not touch `localStorage` keys directly:

| Operation | Interface used |
|---|---|
| Read resume YAML | `window.editorAdapter.getValue()` |
| Write resume YAML | `window.editorAdapter.setValue(yaml)` + trigger change event |
| Read settings YAML | `window.settingsSync.getYaml()` |
| Write settings YAML | `window.settingsSync.setYaml(yaml)` |

**`settingsSync.setYaml()` does not yet exist** and must be added to `settings-sync.js` as a thin public wrapper around the internal `_onYamlChange(yaml)`. This ensures the editor, UI controls, preview, and localStorage all update consistently — the same path used when the user types in the editor.

`yaml-backup.js` includes its own 4-line inline download helper (`URL.createObjectURL` / `a.download` / `a.click` / `URL.revokeObjectURL`). The `triggerDownload` function in `export.js` is private to that module's IIFE and cannot be reused.

The existing `onChange` handlers in `file-sync.js` and `settings-sync.js` persist writes to `localStorage` automatically — no extra wiring needed.

---

## UI Changes

Two new items added to the existing `#export-menu`, separated from the PDF/LaTeX/Markdown group by an `<hr>`:

```
↓ PDF            ⌘P
↓ LaTeX source   ⌘L
↓ Markdown       ⌘M
──────────────────
↓ YAML backup
↑ Import YAML…
```

- **↓ YAML backup** — triggers export immediately, no extra dialog
- **↑ Import YAML…** — opens a hidden `<input type="file" accept=".zip">` to trigger the OS file picker, then shows a confirmation modal

**Follow existing patterns throughout:**
- Menu item click handlers must be wired the same way as `btn-pdf`, `btn-md`, `btn-tex` in `export.js` (event listeners on `DOMContentLoaded`)
- The import confirmation reuses the existing `#filename-modal` HTML structure and CSS (repurposed as a confirm dialog — hide the `<input>`, change the button label to "Import")
- The blob download uses the same `URL.createObjectURL` / `a.download` / `a.click` / `URL.revokeObjectURL` pattern already used in `export.js`

The confirmation modal text:
> "This will replace your current [resume.yaml / settings.yaml / resume.yaml and settings.yaml] with the contents of the backup. Continue?"

Lists only the files actually found in the zip. Two buttons: **Cancel** and **Import**.

---

## Data Flow

### Export

1. Read resume via `editorAdapter.getValue()` and settings via `settingsSync.getYaml()`
2. Create a `JSZip` instance; add `resume.yaml` and `settings.yaml` as entries
3. `zip.generateAsync({ type: 'blob' })`
4. Call existing `triggerDownload(blob, filename)` from `export.js`; filename: `mkcv-backup-YYYY-MM-DD.zip`

### Import

1. User picks a `.zip` file via `<input type="file">`
2. `JSZip.loadAsync(file)` reads the archive
3. Check which of `resume.yaml` / `settings.yaml` are present; at least one must exist
4. For each present file, validate it parses as valid YAML:
   - `settings.yaml` → `window.SETTINGS_HELPERS.parseSettings(yaml)` (checks for errors)
   - `resume.yaml` → `jsyaml.load(yaml)` wrapped in try/catch
5. If validation passes, show confirmation modal listing the files to be updated
6. On confirm: apply each write via the public interfaces; `onChange` handlers persist to localStorage

---

## Error Handling

| Condition | Behavior |
|---|---|
| Corrupt / unreadable zip | Toast: "Could not read zip file" |
| No YAML files found in zip | Toast: "No YAML files found in this backup" |
| Invalid YAML in a file | Toast: "Invalid YAML in `resume.yaml`" (or `settings.yaml`) — abort before any write |
| localStorage quota on write | Handled by existing save paths (they show their own toasts) |

All errors abort before writing anything — no partial state.

---

## Out of Scope

- Keyboard shortcuts for export/import
- Save dialog / File System Access API
- Versioning or multiple backup slots
