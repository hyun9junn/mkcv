# Template Slug Rename and Settings Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename all live template slugs to the new branded ids and make template selection stay in sync between the picker UI and `settings.yaml`.

**Architecture:** Rename the template directories so backend discovery naturally emits the new ids, then update the frontend schema/runtime/tests to use those ids exclusively. Centralize live template application in the picker module while letting `settings-sync` remain the owner of `settings.yaml` serialization, so dropdown changes and settings-editor changes both converge on the same selection path.

**Tech Stack:** FastAPI, Python, Jinja2, vanilla frontend JavaScript, Node test runner, pytest

---

### Task 1: Lock in the new slug contract and sync regressions

**Files:**
- Modify: `tests/test_template_meta_defaults.py`
- Modify: `tests/test_latex_renderer.py`
- Modify: `tests/test_api.py`
- Modify: `tests/test_template_default_reset.js`
- Modify: `tests/test_settings_sync_tab_switch.js`
- Modify: `tests/test_yaml_autocomplete.js`
- Create: `tests/test_templates_ui_sync.js`

- [ ] **Step 1: Write the failing slug and sync tests**

Add coverage for:
- new template ids everywhere active tests enumerate slugs
- `settings.yaml` invalid template values falling back to `classic`
- `settings.yaml -> template` applying to live app state
- dropdown template changes syncing back into `settings.yaml`

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run:

```bash
uv run pytest tests/test_template_meta_defaults.py tests/test_api.py -q
node --test tests/test_template_default_reset.js tests/test_settings_sync_tab_switch.js tests/test_yaml_autocomplete.js tests/test_templates_ui_sync.js
```

Expected:
- Python tests fail because the runtime still exposes old directory slugs
- JS tests fail because picker/settings sync is still disconnected

### Task 2: Rename template directories and update runtime references

**Files:**
- Rename: `backend/templates/academic-research` -> `backend/templates/scholar-index`
- Rename: `backend/templates/banking` -> `backend/templates/dealbook`
- Rename: `backend/templates/brutalist-mono` -> `backend/templates/mono-forge`
- Rename: `backend/templates/column-skills` -> `backend/templates/skillboard`
- Rename: `backend/templates/editorial-magazine` -> `backend/templates/masthead`
- Rename: `backend/templates/executive-corporate` -> `backend/templates/boardroom`
- Rename: `backend/templates/gazette` -> `backend/templates/letterpress`
- Rename: `backend/templates/heritage` -> `backend/templates/chancellor`
- Rename: `backend/templates/hipster` -> `backend/templates/studio-pop`
- Rename: `backend/templates/modern-startup` -> `backend/templates/foundry`
- Rename: `backend/templates/resume-tech` -> `backend/templates/ats-signal`
- Rename: `backend/templates/sidebar-minimal` -> `backend/templates/slate-rail`
- Rename: `backend/templates/split-header` -> `backend/templates/signature-split`
- Rename: `backend/templates/timeline-vertical` -> `backend/templates/trackline`
- Modify: `frontend/settings-engine.js`
- Modify: `frontend/yaml-autocomplete.js`
- Modify: `tests/test_template_meta_defaults.py`
- Modify: `tests/test_latex_renderer.py`
- Modify: `tests/test_api.py`

- [ ] **Step 1: Rename the template directories**

Run:

```bash
mv backend/templates/academic-research backend/templates/scholar-index
mv backend/templates/banking backend/templates/dealbook
mv backend/templates/brutalist-mono backend/templates/mono-forge
mv backend/templates/column-skills backend/templates/skillboard
mv backend/templates/editorial-magazine backend/templates/masthead
mv backend/templates/executive-corporate backend/templates/boardroom
mv backend/templates/gazette backend/templates/letterpress
mv backend/templates/heritage backend/templates/chancellor
mv backend/templates/hipster backend/templates/studio-pop
mv backend/templates/modern-startup backend/templates/foundry
mv backend/templates/resume-tech backend/templates/ats-signal
mv backend/templates/sidebar-minimal backend/templates/slate-rail
mv backend/templates/split-header backend/templates/signature-split
mv backend/templates/timeline-vertical backend/templates/trackline
```

- [ ] **Step 2: Update the active slug lists**

Replace the old slugs in:
- `frontend/settings-engine.js -> VALID_TPL`
- `frontend/yaml-autocomplete.js` settings suggestions
- active tests that reference runtime template ids

- [ ] **Step 3: Run the slug-focused tests**

Run:

```bash
uv run pytest tests/test_template_meta_defaults.py tests/test_api.py -q
node --test tests/test_yaml_autocomplete.js tests/test_template_default_reset.js
```

Expected: PASS for slug-list expectations, with picker/settings sync tests still pending until Task 3 lands.

### Task 3: Unify live template selection and fix bidirectional sync

**Files:**
- Modify: `frontend/templates.js`
- Modify: `frontend/settings-sync.js`
- Modify: `tests/test_settings_sync_tab_switch.js`
- Create: `tests/test_templates_ui_sync.js`

- [ ] **Step 1: Add the failing sync regression tests**

Cover these behaviors:
- picker selection updates `settings.yaml`
- picker selection applies template defaults
- settings-tab template edits update the live selected template
- invalid settings template values warn and use `classic`

- [ ] **Step 2: Run the sync regression tests to verify they fail**

Run:

```bash
node --test tests/test_settings_sync_tab_switch.js tests/test_templates_ui_sync.js
```

Expected: FAIL because dropdown changes currently bypass `settings-sync`, and parsed settings templates do not apply to `app.state.template`.

- [ ] **Step 3: Implement the single template-selection path**

Update `frontend/templates.js` so it exposes a shared `window.templateUI.selectTemplate(name, opts)` that:
- normalizes the requested slug against the current registry
- updates `app.state.template`
- updates the dropdown highlight and preview title
- refreshes preview
- optionally applies template defaults
- optionally syncs the change into `settings.yaml`

Update `frontend/settings-sync.js` so:
- parsed settings template changes call `templateUI.selectTemplate(...)`
- invalid template values emit warnings and apply `classic`
- dropdown-originated sync avoids loops when writing back into `settings.yaml`

- [ ] **Step 4: Run the sync regression tests again**

Run:

```bash
node --test tests/test_settings_sync_tab_switch.js tests/test_templates_ui_sync.js
```

Expected: PASS

### Task 4: Final verification

**Files:**
- Verify only

- [ ] **Step 1: Run focused verification**

Run:

```bash
uv run pytest tests/test_template_meta_defaults.py tests/test_latex_renderer.py tests/test_api.py -q
node --test tests/test_template_default_reset.js tests/test_settings_sync_tab_switch.js tests/test_yaml_autocomplete.js tests/test_templates_ui_sync.js
```

Expected: PASS

- [ ] **Step 2: Review scope**

Run:

```bash
git diff -- backend/templates frontend tests docs/superpowers/specs/2026-05-05-template-slug-rename-and-settings-sync-design.md docs/superpowers/plans/2026-05-05-template-slug-rename-and-settings-sync.md
```

Expected: only template renames, runtime/frontend updates, tests, and the new plan/spec files appear.
