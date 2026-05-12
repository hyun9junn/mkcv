# Phase 3 — Frontend Module Split: Design Spec

## Context

Phase 2 added Vite and converted all 18 inline `<script>` IIFE blocks to ES modules. The codebase now has 19 source files under `frontend/src/`, three of which exceed 500 lines. Phase 3 splits those files into focused sub-modules and organises them into the subdirectory structure prescribed in the roadmap.

**This is pure restructuring.** Exports, runtime behaviour, and all 111 JS tests stay exactly as-is.

---

## Goals

1. Every `.js` file in `frontend/src/` is ≤ 500 lines.
2. No `window.xxx` assignments outside the compat shim already in `main.js`.
3. All 396 tests (111 JS + 285 Python) continue to pass without modification.
4. Source is organised into the subdirectory layout from the roadmap.

---

## Non-goals

- TypeScript, framework, or build-tool changes.
- Removing the two `window.*` shims in `main.js` (circular-import breakers; deferred to Phase 4 or later).
- Changing the behaviour of any function.
- Updating test import paths (tests must pass as-is).

---

## Current file inventory

| File | Lines | Action |
|------|-------|--------|
| `settings-sync.js` | 698 | Split into `settings/` sub-modules |
| `sections-state.js` | 645 | Split into `sections/` sub-modules |
| `yaml-autocomplete.js` | 621 | Split into `yaml/` sub-modules |
| `sections-ui.js` | 417 | No change (< 500) |
| `editor-adapter.js` | 311 | Move to `yaml/` as sub-module |
| `settings-engine.js` | 309 | Move to `settings/` as sub-module |
| `preview.js` | 302 | Move to `preview/` as sub-module |
| `templates.js` | 350 | Move to `templates/` as sub-module |
| All others | < 300 | No change |

---

## Target directory structure

```
frontend/src/
├── app.js                      (no change — global state store)
├── main.js                     (no change — entry point + compat shim)
├── vendor.js                   (no change)
├── index.css                   (no change)
│
├── sections/
│   ├── defs.js                 (new) SECTION_DEFS + DEFAULT_ORDER constants
│   └── yaml-ops.js             (new) YAML text manipulation (move/reorder/sync)
│
├── settings/
│   ├── state.js                (new) shared mutable state object _st
│   ├── apply.js                (new) _applyToToolbar/Contact/Sections/Template/All
│   ├── section-sync.js         (new) resume↔settings section sync logic
│   ├── status-bar.js           (new) _updateValidStatus/LineStat/RestoreResumeStatus
│   └── migrate.js              (new) _migrate (localStorage migration)
│
├── yaml/
│   ├── context.js              (new) cursor context detection helpers
│   ├── value-suggestions.js    (new) date + field value suggestion generators
│   └── section-templates.js    (new) SECTION_TEMPLATES constant
│
│   (future sub-modules for yaml/autocomplete.js and yaml/editor-adapter.js
│    if further splits are needed; deferred to Phase 5)
│
├── api/                        (future — Phase 3 defers API extraction)
│
├── sections-state.js           (barrel: imports sections/* + storage/parse logic, ≤ 350 lines)
├── settings-sync.js            (barrel: imports settings/* + tab/core logic, ≤ 380 lines)
├── yaml-autocomplete.js        (trimmed: extracts helpers to yaml/*, ≤ 450 lines)
│
├── contact-ui.js               (no change)
├── editor-adapter.js           (no change)
├── export.js                   (no change)
├── file-sync.js                (no change)
├── layout-controls.js          (no change)
├── onboarding.js               (no change)
├── preview.js                  (no change)
├── sections-ui.js              (no change)
├── settings-engine.js          (no change)
├── templates.js                (no change)
├── ui-wiring.js                (no change)
├── validator.js                (no change)
└── yaml-backup.js              (no change)
```

> **Note on `api/`, `preview/`, `templates/` subdirectories**: The roadmap prescribes these directory names. Phase 3 creates the `sections/`, `settings/`, and `yaml/` directories to address the over-500-line violations. The `api/`, `preview/`, and `templates/` subdirectories are deferred: the target files (`preview.js`, `templates.js`) are already under 500 lines, and extracting their API fetch calls would require resolving circular imports — better handled in a dedicated sub-phase.

---

## Split designs

### A. `sections-state.js` (645 → ~350 lines)

**`sections/defs.js`** (~103 lines, new)
- Exports: `SECTION_DEFS`, `DEFAULT_ORDER`
- No external imports (pure data)

**`sections/yaml-ops.js`** (~265 lines, new)
- Exports: `getYamlSectionLayout`, `getYamlSectionState`, `moveToInvisible`, `moveFromInvisible`, `appendToMainArea`, `reorderMainArea`, `syncYamlToSectionState`, `materializeSection`, `clearInvisibleArea`
- Imports: `js-yaml`, `sections/defs.js` (for `SECTION_DEFS`, `DEFAULT_ORDER`)
- Private helpers retained internally: `INVISIBLE_MARKER`, `_uniqKeys`, `_getTopLevelKeys`, `_splitAtMarker`, `_joinParts`, `_extractBlock`, `_removeBlock`

**`sections-state.js`** (~277 lines, reduced)
- Imports from `sections/defs.js` and `sections/yaml-ops.js`
- Retains: storage/parse cache logic (`_load`, `_save`, `_getState`, `_getParsedResume`, parse cache vars)
- Re-exports everything from both sub-modules so existing tests continue to import from the old path

Tests that import `../frontend/src/sections-state.js` are unaffected; the barrel re-exports everything.

---

### B. `settings-sync.js` (698 → ~370 lines)

The challenge: most functions close over module-private mutable state (`_activeTab`, `_parsed`, `_settingsYaml`, `_suppress`, `_suppressResumeSectionSync`, `_tabScroll`, timers). Extracting them requires shared state.

**Solution: `settings/state.js`** (~25 lines, new)  
Exports a single mutable object `_st` that holds all formerly-private state variables. Both `settings-sync.js` and its sub-modules import `_st` and mutate its properties. This is standard ESM singleton state — no circular dependency.

```js
// settings/state.js
export const _st = {
  activeTab: 'resume',
  settingsYaml: null,   // initialized during settings-sync module eval
  parsed: null,
  saveTimer: null,
  editorEffectsTimer: null,
  pendingEditorApply: false,
  pendingEditorPreview: false,
  pendingEditorPreviousSettings: null,
  suppress: false,
  suppressResumeSectionSync: false,
  tabScroll: { resume: { left: 0, top: 0 }, settings: { left: 0, top: 0 } },
  yamlChangeFn: null,   // wired during initSettingsSync to break sub-module cycle
};
```

**`settings/migrate.js`** (~45 lines, new)
- Exports: `migrate(_SH)`
- Imports: nothing (reads/writes `localStorage`, receives `_SH` as parameter)
- Pure function: no module state

**`settings/status-bar.js`** (~60 lines, new)
- Exports: `updateValidStatus(parsed, activeTab)`, `updateLineStat(yaml)`, `restoreResumeStatus(validator, app, editorAdapter)`
- Pure functions: state is passed in as parameters; no `_st` dependency

**`settings/apply.js`** (~95 lines, new)
- Exports: `applyToToolbar(settings, app)`, `applyToContact(settings, contactUI)`, `applyTemplateSelection(settings, opts, app, _SH, templateUI)`, `applyAll(settings, opts, ...)`, `applySelected(settings, opts, ...)`, `refreshPreview(preview, sectionsState, app)`
- No module state; all dependencies passed as arguments
- Imports from sub-modules it needs (app, sectionsState etc. passed as params to avoid coupling)

**`settings/section-sync.js`** (~200 lines, new)
- Contains: `_getSectionStateFromSettings`, `_buildSettingsFromSectionState`, `_formatResumeSectionTitleComments`, `_syncResumeSectionTitleComments`, `_getPresentSectionKeys`, `_parseResumeYaml`, `_applySectionStateToResume`, `_syncSettingsFromResumeYaml`, `_materializeKeysFromVisibilityChanges`, `_persistSectionState`, `_getCurrentSectionState`
- Imports `_st` from `settings/state.js` (reads `_st.suppressResumeSectionSync`, `_st.parsed`, writes `_st.suppressResumeSectionSync`)
- Calls `_st.yamlChangeFn(...)` (the `_onYamlChange` reference wired in `initSettingsSync`) to avoid circular imports with `settings-sync.js`

**`settings-sync.js`** (~370 lines, reduced)
- Retains: imports/exports, `_SH` alias, tab scroll/switch logic, `_onYamlChange`, debounce timers, `updateFromToolbar`, `notifySectionStateChange`, `updateSectionTitle`, `applyTemplateDefaults`, `initSettingsSync`, `_resetSettingsSyncForTesting`, `settingsSync` export
- Imports `_st` from `settings/state.js` (replaces private `let` declarations)
- During `initSettingsSync`: `_st.yamlChangeFn = _onYamlChange`

**`_resetSettingsSyncForTesting`** resets both local vars and `_st` properties — tests continue to work.

---

### C. `yaml-autocomplete.js` (621 → ~460 lines)

**`yaml/context.js`** (~115 lines, new)
- Exports: `detectContext(editor)`, `detectValueContext(editor)`, `getValueToken(editor)`
- Private helpers: `LIST_SECTIONS`, `VALUE_FIELDS`, `_findParentKeyAt`, `_findListItemSection`
- No external imports (pure editor-API logic)

**`yaml/value-suggestions.js`** (~30 lines, new)
- Exports: `generateDateSuggestions(field)`, `getValueSuggestions(field)`
- No imports (pure computation)

**`yaml/section-templates.js`** (~25 lines, new)
- Exports: `SECTION_TEMPLATES`
- No imports (pure constant)

**`yaml-autocomplete.js`** (~450 lines, reduced)
- Imports from the three new `yaml/` sub-modules
- Retains: `_schema`, `_fetchSchema`, `_sectionDefYaml`, `_buildRootTemplate`, `_buildCompletions`, `yamlHint`, `initYamlAutocomplete`

---

## Barrel re-export pattern (test compatibility)

Tests import from old paths like `'../frontend/src/sections-state.js'`. The old files become barrels that re-export everything:

```js
// sections-state.js (barrel portion — new lines only)
export { SECTION_DEFS, DEFAULT_ORDER } from './sections/defs.js';
export { getYamlSectionLayout, ... } from './sections/yaml-ops.js';
// (all existing named exports remain available)
```

The `sectionsState` aggregate object export is constructed in `sections-state.js` by importing from sub-modules and building the same object as before.

---

## Window globals

Current state (already meets "no assignments outside compat shim"):
- `main.js:21` — `window.settingsSync = settingsSync`
- `main.js:30` — `window.editorAdapter = editorAdapter`

These two assignments stay in `main.js`. No new `window.xxx` assignments will be introduced. Reads of `window.settingsSync` and `window.editorAdapter` inside `preview.js`, `sections-ui.js`, `contact-ui.js`, and `editor-adapter.js` are left unchanged (circular dependency resolution; deferred).

---

## Acceptance criteria

1. `wc -l frontend/src/**/*.js` — every file ≤ 500 lines
2. `grep -r 'window\.' frontend/src/ --include='*.js' | grep '='` — only matches in `main.js`
3. `npm test` passes: all 111 JS tests + 285 Python tests green
4. `npm run build` produces a working `dist/` (no Vite bundle errors)
5. Manual smoke-test: load the app, edit YAML, switch tabs, export PDF — all work

---

## Known risks

| Risk | Mitigation |
|------|-----------|
| `_st.yamlChangeFn` wired after sub-module import | Sub-module only calls `_st.yamlChangeFn` from `_syncSettingsFromResumeYaml` and `_syncResumeSectionTitleComments`, which are triggered by editor events — always after `initSettingsSync` runs |
| Barrel re-exports miss a named export | Each split is implemented with a checklist: verify `grep -n "^export"` outputs match before and after |
| `_resetSettingsSyncForTesting` misses a state field moved to `_st` | Covered by the existing tab-switch tests — they'll fail if any state isn't properly reset |
| Circular imports in `settings/` | `settings/state.js` has no local imports; `settings/section-sync.js` calls via `_st.yamlChangeFn` instead of importing `_onYamlChange` directly |
