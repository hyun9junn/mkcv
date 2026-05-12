# Phase 3 — Frontend Module Split: Implementation Plan

Design spec: `docs/superpowers/specs/2026-05-12-phase-3-frontend-module-split-design.md`

---

## Guiding principles

- Every task produces green tests before moving to the next.
- Every split uses the **barrel re-export pattern**: original file keeps all its public exports, sub-modules add new named exports.
- State refactor (`settings/state.js`) is self-contained: no externally-visible behaviour change.
- Commits are atomic per task group.

---

## Task 1 — sections/defs.js

**Goal:** Extract `SECTION_DEFS` and `DEFAULT_ORDER` from `sections-state.js`.

### Steps

1. Create `frontend/src/sections/defs.js`:
   - Copy `SECTION_DEFS` (lines 5–105) and `DEFAULT_ORDER` (line 107).
   - Export both named.

2. In `sections-state.js`:
   - Replace the `SECTION_DEFS` and `DEFAULT_ORDER` definitions with:
     ```js
     export { SECTION_DEFS, DEFAULT_ORDER } from './sections/defs.js';
     ```
   - Remove the inlined constant bodies.

3. Fix the `sectionsState` aggregate object at the bottom — it references `SECTION_DEFS` and `DEFAULT_ORDER` by name; since they are now imported and re-exported, the references still resolve correctly. No change needed.

4. `npm test` — all green.

**Acceptance:** `wc -l frontend/src/sections-state.js` < 560; `npm test` green.

---

## Task 2 — sections/yaml-ops.js

**Goal:** Extract YAML text manipulation functions from `sections-state.js`.

### Steps

1. Create `frontend/src/sections/yaml-ops.js`:
   - Import `js-yaml` and `{ SECTION_DEFS, DEFAULT_ORDER }` from `./defs.js`.
   - Move into this file (with their private helpers):
     - `INVISIBLE_MARKER`, `_uniqKeys`, `_getTopLevelKeys`, `_splitAtMarker`, `_joinParts`
     - `_extractBlock`, `_removeBlock`
     - `getYamlSectionLayout`, `getYamlSectionState`
     - `moveToInvisible`, `moveFromInvisible`, `appendToMainArea`, `clearInvisibleArea`
     - `reorderMainArea`, `syncYamlToSectionState`, `materializeSection`
   - Export all public functions named.

2. In `sections-state.js`:
   - Add re-export line:
     ```js
     export {
       getYamlSectionLayout, getYamlSectionState,
       moveToInvisible, moveFromInvisible, appendToMainArea, clearInvisibleArea,
       reorderMainArea, syncYamlToSectionState, materializeSection,
     } from './sections/yaml-ops.js';
     ```
   - Remove the now-extracted function bodies + private helpers (INVISIBLE_MARKER through materializeSection).
   - Update the `sectionsState` aggregate object import lines for the extracted functions (they are re-exported so still in scope from the module's own namespace — no change needed).

3. `npm test` — all green.

**Acceptance:** `wc -l frontend/src/sections-state.js` < 350; `wc -l frontend/src/sections/yaml-ops.js` < 300; `npm test` green.

---

## Task 3 — yaml/context.js + yaml/value-suggestions.js + yaml/section-templates.js

**Goal:** Extract helper groups from `yaml-autocomplete.js`.

### Steps

1. Create `frontend/src/yaml/context.js`:
   - Copy: `LIST_SECTIONS`, `VALUE_FIELDS`, `_findParentKeyAt`, `_findListItemSection`, `_detectContext`, `_detectValueContext`, `_getValueToken`.
   - Export: `detectContext`, `detectValueContext`, `getValueToken`, `LIST_SECTIONS`.
   - No imports needed (pure editor-API functions; CodeMirror editor is passed as argument).

2. Create `frontend/src/yaml/value-suggestions.js`:
   - Copy: `_generateDateSuggestions`, `_getValueSuggestions`.
   - Export: `generateDateSuggestions`, `getValueSuggestions`.
   - No imports needed.

3. Create `frontend/src/yaml/section-templates.js`:
   - Copy: `SECTION_TEMPLATES` object.
   - Export named.

4. In `yaml-autocomplete.js`:
   - Add imports:
     ```js
     import { detectContext, detectValueContext, getValueToken } from './yaml/context.js';
     import { getValueSuggestions } from './yaml/value-suggestions.js';
     import { SECTION_TEMPLATES } from './yaml/section-templates.js';
     ```
   - Remove the extracted constant/function bodies.
   - Update internal call sites: `_detectContext` → `detectContext`, etc.

5. `npm test` — all green.

**Acceptance:** `wc -l frontend/src/yaml-autocomplete.js` < 500; `npm test` green.

---

## Task 4 — settings/migrate.js

**Goal:** Extract `_migrate` from `settings-sync.js`.

### Steps

1. Create `frontend/src/settings/migrate.js`:
   - Signature: `export function migrate(_SH) { ... }`
   - Move the entire `_migrate` function body, replacing all `_SH` references with the parameter.
   - Pure function: only reads/writes `localStorage` and reads `_SH`.

2. In `settings-sync.js`:
   - Add: `import { migrate as _migrateImpl } from './settings/migrate.js';`
   - Replace `_migrate()` call in `initSettingsSync` with `_migrateImpl(_SH)`.
   - Remove the `_migrate` function body.

3. `npm test` — all green.

**Acceptance:** `_migrate` body gone from `settings-sync.js`; `npm test` green.

---

## Task 5 — settings/state.js

**Goal:** Introduce shared mutable state module to enable subsequent settings-sync splits.

### Steps

1. Create `frontend/src/settings/state.js`:
   ```js
   import { SETTINGS_HELPERS as _SH } from '../settings-engine.js';

   export const _st = {
     activeTab: 'resume',
     settingsYaml: _SH.settingsToYaml(_SH.DEFAULT_SETTINGS),
     parsed: _SH.parseSettings(_SH.settingsToYaml(_SH.DEFAULT_SETTINGS)),
     saveTimer: null,
     editorEffectsTimer: null,
     pendingEditorApply: false,
     pendingEditorPreview: false,
     pendingEditorPreviousSettings: null,
     suppress: false,
     suppressResumeSectionSync: false,
     tabScroll: { resume: { left: 0, top: 0 }, settings: { left: 0, top: 0 } },
     yamlChangeFn: null,
   };
   ```

2. In `settings-sync.js`:
   - Import `_st` from `./settings/state.js`.
   - Replace all module-private `let` state declarations at the top with reads/writes of `_st.*`:
     - `_activeTab` → `_st.activeTab`
     - `_settingsYaml` → `_st.settingsYaml`
     - `_parsed` → `_st.parsed`
     - `_saveTimer` → `_st.saveTimer`
     - etc.
   - Remove the `let` declarations that are now in `_st`.
   - Keep `const _SH = SETTINGS_HELPERS` and `const _EDITOR_SYNC_DEBOUNCE_MS = 300` in `settings-sync.js` (not mutable state).
   - Update `_resetSettingsSyncForTesting` to reset `_st` fields instead of the private `let` bindings.

3. `npm test` — all green.

**Acceptance:** No `let _activeTab`, `let _settingsYaml`, etc. in `settings-sync.js`; tests green.

---

## Task 6 — settings/status-bar.js

**Goal:** Extract status bar DOM helpers from `settings-sync.js`.

### Steps

1. Create `frontend/src/settings/status-bar.js`:
   - Exports: `updateValidStatus(parsed, activeTab)`, `updateLineStat(yaml)`, `restoreResumeStatus(validator, app, editorAdapter)`
   - All three functions take their dependencies as parameters — no `_st` import needed.
   - Copy function bodies from `settings-sync.js`, adjusting to use parameter names.

2. In `settings-sync.js`:
   - Import: `import { updateValidStatus, updateLineStat, restoreResumeStatus } from './settings/status-bar.js';`
   - Replace internal calls: `_updateValidStatus(_st.parsed)` → `updateValidStatus(_st.parsed, _st.activeTab)`, etc.
   - Remove extracted function bodies.

3. `npm test` — all green.

---

## Task 7 — settings/apply.js

**Goal:** Extract toolbar/contact/template/sections apply functions from `settings-sync.js`.

### Steps

1. Create `frontend/src/settings/apply.js`:
   - Imports: `{ app }`, `{ preview }`, `{ sectionsState }`, `{ sectionsUI }`, `{ contactUI }`, `{ templateUI }`, `{ SETTINGS_HELPERS as _SH }`, `{ _st }` from `./state.js`
   - Move: `_applyToToolbar`, `_applyToContact`, `_applyTemplateSelection`, `_applyAll`, `_applySelected`, `_refreshPreview`
   - Export all six named.
   - These functions access `_st.parsed` (via `_st`) and call `_st.yamlChangeFn` if needed.

2. In `settings-sync.js`:
   - Import the six functions from `./settings/apply.js`.
   - Remove their bodies.
   - Adjust `_scheduleEditorEffects` and `_onYamlChange` call sites to use imported names.

3. `npm test` — all green.

---

## Task 8 — settings/section-sync.js

**Goal:** Extract section↔resume sync logic from `settings-sync.js`.

### Steps

1. Create `frontend/src/settings/section-sync.js`:
   - Imports: `{ app }`, `{ sectionsState }`, `{ sectionsUI }`, `{ editorAdapter }`, `{ SETTINGS_HELPERS as _SH }`, `{ _st }` from `./state.js`
   - Move: `_getSectionStateFromSettings`, `_persistSectionState`, `_getCurrentSectionState`, `_getPresentSectionKeys`, `_parseResumeYaml`, `_formatResumeSectionTitleComments`, `_syncResumeSectionTitleComments`, `_buildSettingsFromSectionState`, `_materializeKeysFromVisibilityChanges`, `_applySectionStateToResume`, `_syncSettingsFromResumeYaml`
   - Calls to `_onYamlChange` are replaced with `_st.yamlChangeFn(...)`.
   - Export: `formatResumeSectionTitleComments`, `syncSettingsFromResumeYaml`, `applySectionStateToResume`, `buildSettingsFromSectionState`, `getSectionStateFromSettings`, `persistSectionState` (functions called by settings-sync.js).

2. In `settings-sync.js`:
   - During `initSettingsSync`: `_st.yamlChangeFn = _onYamlChange;`
   - Import needed functions from `./settings/section-sync.js`.
   - Remove extracted function bodies.

3. `npm test` — all green.

**Acceptance:** `wc -l frontend/src/settings-sync.js` < 400; `npm test` green.

---

## Task 9 — Line count verification + acceptance

### Steps

1. Run: `wc -l frontend/src/**/*.js frontend/src/sections/*.js frontend/src/settings/*.js frontend/src/yaml/*.js`
   - Confirm every file ≤ 500 lines.

2. Check window assignments:
   ```bash
   grep -rn 'window\.' frontend/src/ --include='*.js' | grep '='
   ```
   - Only `main.js` lines should appear.

3. Full test suite:
   ```bash
   npm test
   ```
   - All 396 tests green.

4. Build check:
   ```bash
   npm run build
   ```
   - `dist/` produced without errors.

5. Commit all changes with message:
   `refactor: Phase 3 — split frontend/src into focused sub-modules`

---

## Task 10 — Update roadmap

1. In `docs/superpowers/specs/2026-05-10-refactor-roadmap.md`:
   - Update Phase 3 status to `✅ done (merged)`.
   - Add spec/plan file references.
   - Update Phase 3 heading from "*(not started)*" to "*(done)*".

---

## Branch + merge

- Branch: `phase-3-frontend-module-split` (off `main`)
- After all tasks green: run the `finishing-a-development-branch` skill to merge.
