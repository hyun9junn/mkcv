# Phase 5 — Template Authoring Polish: Design

## Goal

Make adding a new template a **zero-code-edit** operation: drop a directory under
`backend/templates/<slug>/` and reload. No frontend or backend source changes required.

This phase finishes what Phase 1 started on the backend. Phase 1 made the backend
auto-discover templates from the filesystem. Phase 5 eliminates the two remaining
manual steps:

1. Updating `VALID_TPL` in `frontend/src/settings-engine.js`
2. Manually creating a PNG thumbnail for the template picker

A template doctor CLI is added so authors can validate their work without starting the
full server.

---

## Problem analysis

### Hardcoded `VALID_TPL`

`settings-engine.js` exports a static array of 15 template slugs used in three places:

| Location | Usage |
|---|---|
| `parseSettings()` | Reject unknown template names with a warning |
| `normalizeTemplateDefaults()` | Accept `currentTemplate` only if it is in the list |
| `yaml-autocomplete.js` | Offer completions for the `template:` key |

Adding a new template today requires editing this array or the new slug is silently
rejected. The backend already serves a dynamic list via `GET /api/templates`; the
frontend just never wires that list back into `SETTINGS_HELPERS`.

### Missing thumbnail

`initTemplates()` in `templates.js` already fetches the server list and renders a card
per template. Each card tries to load `/assets/template-previews/<name>.png` and falls
back to a blank CSS placeholder if the image 404s. For a new template the fallback is
always used until someone manually generates a PNG — that is the last manual step.

### README says "pdflatex" but the engine is xelatex

`backend/services/pdf_compiler.py` invokes `xelatex`. The compiler constraint section of
`backend/templates/README.md` says "pdflatex", lists only pdflatex-compatible packages,
and tells authors not to use `fontspec`. Templates can in fact use `fontspec` and any
xelatex package. This misleads template authors.

---

## Design

### 1. Frontend auto-discovery — extend `SETTINGS_HELPERS` with a runtime valid-template set

`VALID_TPL` stays exported and unchanged — it is the **static bootstrap list** used in
tests and before the server responds. A parallel runtime set `_validTplSet` starts as a
copy of `VALID_TPL`; `setValidTemplates(names)` replaces it.

```
┌─────────────────────────────────────┐
│  settings-engine.js                 │
│                                     │
│  VALID_TPL = [...15 hardcoded...]   │  ← unchanged, tests check this
│  _validTplSet = new Set(VALID_TPL)  │  ← runtime copy, replaceable
│                                     │
│  setValidTemplates(names)           │  ← new method
│    _validTplSet = Set(VALID_TPL ∪ names)
│                                     │
│  getValidTemplates() → string[]     │  ← new method (for autocomplete)
│                                     │
│  parseSettings() uses _validTplSet  │
│  normalizeTemplateDefaults() same   │
└─────────────────────────────────────┘
           ↑ called after server response
┌─────────────────────────────────────┐
│  templates.js — initTemplates()     │
│                                     │
│  fetch /api/templates → data        │
│  SETTINGS_HELPERS.setValidTemplates │
│    (data.templates)                 │
└─────────────────────────────────────┘
```

`yaml-autocomplete.js` changes its template completions to call
`SETTINGS_HELPERS.getValidTemplates?.()`, falling back to `VALID_TPL`.

**Test compatibility:** Tests never call `setValidTemplates`, so `_validTplSet` stays
equal to `VALID_TPL` in tests. The existing assertions `VALID_TPL.includes('resume-tech')
=== false` and the parse-warning tests are unaffected.

### 2. Backend CLI — `python -m backend`

`backend/__main__.py` provides two subcommands:

```
python -m backend validate [<slug>]    # validate one or all templates
python -m backend thumbnails [<slug>]  # generate PNG thumbnails
```

**`validate`**: Runs `validate_template()` from `backend/templates/validation.py`.
Prints a pass/fail summary with error details. Exit code 0 = all valid, 1 = any failure.

**`thumbnails`**: Renders each template to PDF (reusing the validation pipeline), then
converts the first page to PNG and writes it to
`frontend/assets/template-previews/<slug>.png`. Requires `pdf2image` + `poppler`; if
either is missing the command prints an install hint and exits gracefully.

### 3. README — fix the xelatex / pdflatex confusion

Replace the "pdflatex" compiler section. Correct the allowed-packages list to reflect
the xelatex engine: `fontspec`, `unicode-math`, and CJK packages are all usable.
Add a short section on the `python -m backend validate` / `python -m backend thumbnails`
commands.

---

## Out of scope

- TypeScript migration
- Auto-generated thumbnails served on the fly (a static generation CLI is sufficient)
- Template hot-reload without server restart
- Any behavior changes to existing templates

---

## Acceptance

1. Drop a new directory under `backend/templates/new-slug/` with a valid `cv.tex.j2`
   and `meta.yaml`. Start the server. The template appears in the picker and
   `parseSettings` accepts it — **no frontend/backend code changes needed**.
2. `python -m backend validate` reports pass/fail for all templates. Exit 0 on success.
3. `python -m backend validate classic` validates a single template.
4. `python -m backend thumbnails classic` produces
   `frontend/assets/template-previews/classic.png` (or prints a clear install hint if
   `pdf2image`/`poppler` is absent).
5. All 396 tests (111 JS + 285 Python) pass without modification.
6. README compiler section correctly describes xelatex.
