# YAML Editor UX Improvements — Design Spec

**Date:** 2026-05-02
**Status:** Approved

---

## Overview

Extend the CodeMirror 5 YAML editor in mkcv with four UX improvements: smart Enter key indentation, smarter list handling, schema-aware value completion, and section template insertion. All changes are confined to two existing files: `frontend/editor-adapter.js` (key handlers) and `frontend/yaml-autocomplete.js` (completion logic).

Features 4 (schema-aware autocomplete) and 5 (missing-field deduplication) from the original request are already fully implemented and require no changes.

---

## Feature 1 & 3: Smart Enter + List Handling (`editor-adapter.js`)

A new `_enterSmartIndent(editor)` function is added to `extraKeys: { Enter: _enterSmartIndent }` alongside the existing Tab/Shift-Tab handlers.

### Rules (evaluated in order)

| Priority | Trigger | Behaviour |
|----------|---------|-----------|
| 1 | Line matches `^\s*-\s*$` (empty bullet) | Delete bullet, place cursor at `lineIndent - 2` (clamped to 0) — exits the list |
| 2 | Line's trimmed content ends with `:` | Next line at `lineIndent + 2` spaces |
| 3 | Line matches `^\s*-\s+\w[\w_]*\s*:` (list item key-value, e.g. `  - title: Job Title`) | Next line at `lineIndent + 2` spaces (continue item's fields) |
| 4 | Line matches `^\s*-\s+\S` without key-colon pattern (string-value item, e.g. `      - Key Achievement`) | Next line at same indent with `- ` prefix (continue bullet list) |
| 5 | All other lines | Next line at same `lineIndent` (preserve indent, never drop to column 0) |

### Notes

- The handler reads the full line, not just the prefix before the cursor, so it works correctly regardless of cursor column position.
- The "empty bullet" replacement overwrites the entire current line to avoid leaving a stray `- ` artifact.
- Tab → 2 spaces is already implemented in `_tabOrComplete` and requires no changes.

---

## Feature 6: Value Helpers (`yaml-autocomplete.js`)

### Context detection

A new `detectValueContext(editor)` function runs after `detectContext` returns `null`. It checks whether the cursor is in a value position — specifically, the text before the cursor on the current line must match `^\s*(\w[\w_]*):\s*` (a key followed by `: `, with nothing after the space yet, or a partial value being typed).

Returns the field name string if it's a field with known value suggestions, otherwise `null`.

### Value suggestions

| Field | Suggestions (in display order) |
|-------|-------------------------------|
| `end_date` | `"Present"`, then the last 6 `"YYYY.MM"` strings, then current `"YYYY"` |
| `start_date` | Last 6 `"YYYY.MM"` strings (most recent first), then current `"YYYY"` |
| `date` | Current `"YYYY"`, then last 4 years |
| `proficiency` | `"Native"`, `"Fluent"`, `"Intermediate"`, `"Basic"` |

`"YYYY.MM"` strings are generated dynamically from `new Date()` so they remain accurate without manual updates.

### Token replacement for quoted values

The value token extraction scans backward from the cursor to include any opening `"` or `'` as part of the `from` position. Suggested strings include their own quotes (e.g. `"Present"`), so accepting a suggestion always replaces a clean, complete token — partial typed values like `"Pre` are replaced in full, never producing doubled quotes like `""Present""`.

### Integration

`yamlHint` gains a final fallback block: after the key-completion path returns `null`, it calls `detectValueContext`. If a value context is found, it returns a flat list of string completion items using the same `from`/`to` mechanism.

The `change` listener in `initYamlAutocomplete` is updated to trigger `showHint` when either `detectContext` or `detectValueContext` returns a non-null result.

---

## Feature: Template Insertion (`yaml-autocomplete.js`)

Template items are injected at the **top** of the hint list in two contexts. They use a custom `render` function to display with a muted prefix style, visually distinguishable from regular key suggestions.

### Root-level templates (`__root__` context)

For each list section not already present in the document, a template item is prepended above the regular key suggestions. Display format: `experience [template]`.

On accept, inserts the full section block starting at the cursor. Example for `experience`:

```yaml
experience:
  - title:
    company:
    start_date:
    end_date:
    location:
    highlights:
      - 
```

`personal` and `summary` are excluded (single-instance non-list sections).

### List-item-level templates (`section[]` context)

A single `[+ new item]` entry is prepended above the per-field suggestions. On accept, inserts a full item skeleton starting from the cursor position (which is right after the existing `- ` on the current line).

**Indentation arithmetic:**
- `baseIndent` = leading spaces of the current line (e.g. 2 for `  - `)
- `continuationIndent` = `baseIndent + 2` (for all fields after the first)
- `listBulletIndent` = `baseIndent + 4` (for `highlights`'s `- `)

Example result for `experience[]` when cursor is at `  - `:

```yaml
  - title:
    company:
    start_date:
    end_date:
    location:
    highlights:
      - 
```

All continuation fields align with `title:` — no over-indentation.

### Template definitions

Stored as a static map in `yaml-autocomplete.js` keyed by section name. Required fields come first, optional fields after, list fields last.

---

## Files Changed

| File | Changes |
|------|---------|
| `frontend/editor-adapter.js` | Add `Enter: _enterSmartIndent` to `extraKeys`; implement `_enterSmartIndent` |
| `frontend/yaml-autocomplete.js` | Add `detectValueContext`; extend `yamlHint` with value fallback; add template items to hint list; update `change` listener trigger condition |

No other files are touched.

---

## Out of Scope

- Ghost-text / inline suggestion overlay
- Snippet-style multi-cursor tab stops after template insertion
- Value completion for fields not listed above
- CodeMirror 6 migration
