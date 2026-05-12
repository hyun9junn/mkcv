# Phase 5 — Template Authoring Polish: Implementation Plan

Design: `docs/superpowers/specs/2026-05-12-phase-5-template-authoring-polish-design.md`

## Tasks

### Task 1 — `settings-engine.js`: add runtime valid-template set

**File:** `frontend/src/settings-engine.js`

After the `VALID_TPL` constant definition add:

```js
let _validTplSet = new Set(VALID_TPL);
```

Add two methods to `SETTINGS_HELPERS`:
- `setValidTemplates(names)` — `_validTplSet = new Set([...VALID_TPL, ...names])`
- `getValidTemplates()` — `return Array.from(_validTplSet)`

In `parseSettings()` and `normalizeTemplateDefaults()`, replace every
`VALID_TPL.includes(name)` call with `_validTplSet.has(name)`.

Export: keep `VALID_TPL` unchanged (tests check it directly).

### Task 2 — `templates.js`: wire `setValidTemplates` after server fetch

**File:** `frontend/src/templates.js`

In `initTemplates()`, after `templateRegistry.setAllMeta(data.meta || {})`, add:

```js
if (typeof SETTINGS_HELPERS?.setValidTemplates === 'function') {
  SETTINGS_HELPERS.setValidTemplates(data.templates || []);
}
```

Import `SETTINGS_HELPERS` from `./settings-engine.js`.

### Task 3 — `yaml-autocomplete.js`: use dynamic template list for completions

**File:** `frontend/src/yaml-autocomplete.js`

Change the template completions entry from:

```js
template: () => (SETTINGS_HELPERS?.VALID_TPL ?? []),
```

to:

```js
template: () => (SETTINGS_HELPERS?.getValidTemplates?.() ?? SETTINGS_HELPERS?.VALID_TPL ?? []),
```

### Task 4 — `backend/__main__.py`: CLI with `validate` and `thumbnails`

**File:** `backend/__main__.py` (new)

```python
"""CLI entry point: python -m backend validate [slug]
                    python -m backend thumbnails [slug]"""
```

Subcommands:

**`validate [slug]`**:
- If slug given: validate one template, print result, exit 0/1
- If no slug: validate all templates in `backend/templates/`, print table, exit 0/1
- Uses `validate_template()` from `backend.templates.validation`
- Runs synchronously (not in event loop)

**`thumbnails [slug]`**:
- Render template to PDF (reuse validation Jinja2 render + `compile_pdf_sync`)
- Try `from pdf2image import convert_from_bytes` — if ImportError print install hint and exit 0
- Convert first page at 150 dpi, save as PNG to `frontend/assets/template-previews/<slug>.png`
- If slug given: one template; if no slug: all templates

### Task 5 — `backend/templates/README.md`: fix xelatex section

**File:** `backend/templates/README.md`

- Change "pdflatex" → "xelatex" in the compiler constraint section
- Update the allowed packages list: `fontspec`, `unicode-math`, CJK packages are valid
- Add a "CLI tools" section documenting `python -m backend validate` and
  `python -m backend thumbnails`

### Task 6 — Update roadmap

**File:** `docs/superpowers/specs/2026-05-10-refactor-roadmap.md`

Mark Phase 5 as `✅ done (merged)` in the table, update the heading.

## Acceptance verification

After each task, run `npm test` to confirm no regressions. Final check:

```
npm test       # 111 JS + 285 Python = 396 total
python -m backend validate          # all templates pass
python -m backend validate classic  # single template
python -m backend thumbnails classic  # PNG generated or install hint printed
```
