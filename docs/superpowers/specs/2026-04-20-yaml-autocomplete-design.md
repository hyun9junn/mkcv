# YAML Autocomplete — Design Spec

**Date:** 2026-04-20  
**Status:** Approved

---

## Overview

Add VS Code-style schema-aware YAML key completion to the CodeMirror 5 editor in mkcv. The feature uses CM5's `show-hint` addon with a custom hint function that fetches the CV schema from the backend, detects editing context from YAML line structure, and returns fuzzy-matched, context-aware key suggestions.

---

## Architecture & Files

### New files

| File | Purpose |
|------|---------|
| `frontend/yaml-autocomplete.js` | All autocomplete logic: schema fetch, context detection, fuzzy match, hint function, Tab key wiring |
| `frontend/lib/show-hint.js` | Vendored CM5 show-hint addon |
| `frontend/lib/show-hint.css` | Vendored show-hint styles |
| `frontend/yaml-autocomplete.css` | Material-darker theme override for the hint dropdown |

### Modified files

| File | Change |
|------|--------|
| `backend/main.py` | Add `GET /api/schema` endpoint |
| `frontend/index.html` | Add `<link>` and `<script>` tags for new files |
| `frontend/editor-adapter.js` | Call `initYamlAutocomplete(editor)` after editor init |

No other files are touched. The feature is purely additive.

---

## Backend: `/api/schema`

Returns a nested JSON object mapping each editing context to its allowed child keys, plus metadata. Derived from Pydantic model field names at request time.

### Response shape

```json
{
  "__root__": {
    "keys": ["personal", "summary", "experience", "education", "skills", "projects", "certifications", "publications", "languages", "awards", "extracurricular"],
    "required": ["personal"]
  },
  "personal": {
    "keys": ["name", "email", "phone", "location", "linkedin", "github", "website", "huggingface", "tagline", "address"],
    "required": ["name", "email"]
  },
  "experience[]": {
    "keys": ["title", "company", "start_date", "end_date", "location", "highlights"],
    "required": ["title", "company", "start_date"],
    "list_keys": ["highlights"]
  },
  "education[]": {
    "keys": ["degree", "institution", "year", "start_date", "end_date", "gpa", "details"],
    "required": ["degree", "institution"],
    "list_keys": []
  },
  "skills[]": {
    "keys": ["category", "items"],
    "required": ["category", "items"],
    "list_keys": ["items"]
  },
  "projects[]": {
    "keys": ["name", "description", "url", "date", "highlights"],
    "required": ["name", "description"],
    "list_keys": ["highlights"]
  },
  "certifications[]": {
    "keys": ["name", "issuer", "date"],
    "required": ["name"],
    "list_keys": []
  },
  "publications[]": {
    "keys": ["title", "venue", "date", "url", "description"],
    "required": ["title"],
    "list_keys": []
  },
  "languages[]": {
    "keys": ["language", "proficiency"],
    "required": ["language", "proficiency"],
    "list_keys": []
  },
  "awards[]": {
    "keys": ["name", "issuer", "date", "description"],
    "required": ["name"],
    "list_keys": []
  },
  "extracurricular[]": {
    "keys": ["title", "organization", "date", "highlights"],
    "required": ["title"],
    "list_keys": ["highlights"]
  }
}
```

- `keys` — all allowed field names for this context
- `required` — fields that show a `*` annotation in the dropdown (visual only, never inserted)
- `list_keys` — fields whose value is a block sequence (insertion gets `key:` with no trailing space; scalar fields get `key: `)

### Graceful degradation

If the endpoint is unavailable or returns malformed JSON, the frontend sets `schema = null` and all hint calls return `null` immediately. The editor behaves exactly as before — no user-visible change.

---

## Frontend: `yaml-autocomplete.js`

### Schema fetch

Fetches `/api/schema` once at `initYamlAutocomplete(editor)` call time. Wrapped in `try/catch`; failure silently sets `schema = null`.

### Context detection

Walks backward through lines above the cursor using line-by-line string operations only (no `js-yaml` parse — avoids exceptions on incomplete YAML during editing). Entire function is wrapped in `try/catch`; any unexpected state returns `null` (no completions, no crash).

**Three recognised contexts:**

| Condition | Context key |
|-----------|------------|
| Cursor line at indent 0 (no parent) | `__root__` |
| Cursor at indent 2, parent line is `personal:` | `personal` |
| Cursor at indent 4 (or on `  - ` line), grandparent is a list section | `sectionName[]` |

**Cursor-in-value detection:** If the cursor line contains `:` before the cursor column, no completions are triggered.

**Multi-document YAML / `---`:** Not supported; returns no completions.

### Deduplication

Before returning candidates, the hint function scans sibling lines (same indentation, same parent block) and removes keys that already have a `:` entry. Exception: root-level list-section keys (`experience`, `skills`, etc.) are not deduplicated because repeated items are intentional.

### Partial list-item handling

- Line is `  - ` (dash + space, no key yet): treat as list-item context with empty prefix — show full field list.
- Line is `  - titl` (no colon): treat as list-item context with prefix `titl`.
- In both cases, token replacement range covers from after `- ` to end of typed word — no duplication on accept.

### Fuzzy matching

Custom subsequence function, no external library:

1. Characters of the typed prefix must appear in order in the candidate (case-insensitive).
2. Ranking: exact prefix match > any subsequence match; shorter candidates win within each tier.
3. Examples: `hugg` → `huggingface`, `sd` → `start_date`, `comp` → `company`.

Empty prefix returns the full unfiltered candidate list (VS Code "show all on empty trigger").

### Completion insertion

On accept:
- **Token replacement:** Replaces the full current key token (from after leading whitespace / `- ` to end of typed word). Never duplicates text.
- **Scalar key** (not in `list_keys`): inserts `key: ` (trailing space, cursor positioned after space).
- **List key** (in `list_keys`): inserts `key:` (no trailing space; user types the block sequence on the next lines).
- The `*` required annotation is stripped before insertion — never written to YAML.

### Fast-accept (single strong match)

If the fuzzy filter produces exactly one candidate AND the typed prefix is a strong match (exact prefix or edit-distance ≤ 1), `Tab` accepts immediately without opening the dropdown.

---

## Tab / Shift+Tab Behavior

Tab **never** inserts a literal `\t` character.

| Key | Hint menu open | Hint menu closed |
|-----|---------------|-----------------|
| `Tab` | Accept (fast-accept if single strong match, else accept selected) | Insert 2 spaces |
| `Shift+Tab` | Dismiss | Remove up to 2 leading spaces (outdent) |
| `Enter` | Accept selected | Normal newline |
| `↑` / `↓` | Navigate dropdown | — |
| `Escape` | Dismiss | — |

Indentation behavior when no completion is active is unchanged from current behavior.

---

## Dropdown UI

- CM5 `show-hint` with `completeSingle: false` (never auto-accepts a single candidate; user must explicitly Tab or Enter).
- Up to 8 candidates shown.
- Required fields display `*` suffix in the dropdown text — visual only, stripped on insert.
- `material-darker`-matched styling: dark background, subtle border, highlighted selection row, muted `*` annotation.
- Dropdown auto-closes when cursor moves to a value position (after `:`).

---

## Error Handling Summary

| Scenario | Behaviour |
|----------|-----------|
| `/api/schema` unreachable | `schema = null`; autocomplete silently disabled; editor unchanged |
| Malformed JSON from `/api/schema` | Same as above |
| Context detection throws | Returns `null`; no completions; no crash |
| Cursor in value position | No completions triggered |
| Unknown context key in schema | No candidates returned |
| Multi-document YAML (`---`) | No completions for affected lines |
| Schema shape mismatch | Degrades to no completions for that context |

---

## Out of Scope

- Value completion (suggesting actual values, not just keys)
- Ghost-text / inline suggestion overlay
- CodeMirror 6 migration
- Snippet-style multi-field insertion
