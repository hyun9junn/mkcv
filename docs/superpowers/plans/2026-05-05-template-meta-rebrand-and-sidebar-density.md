# Template Meta Rebrand and Sidebar Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh template branding, surface selective section-title personality in defaults, and make sidebar-heavy templates start from tighter one-page defaults.

**Architecture:** Keep the change centered in `backend/templates/*/meta.yaml` so the picker, settings defaults, and preview/export all inherit the new branding automatically. Add one focused LaTeX renderer regression test for `hipster`, then update the template so sidebar-only skills/languages honor section visibility through `section_order`.

**Tech Stack:** Python, pytest, Jinja2, YAML metadata, frontend settings sync

---

### Task 1: Lock in the new metadata expectations

**Files:**
- Modify: `tests/test_template_meta_defaults.py`

- [ ] **Step 1: Write failing tests for rebranded display names and curated defaults**

```python
def test_template_meta_branded_display_names_are_curated():
    ...

def test_template_meta_curated_titles_and_visibility_are_applied():
    ...
```

- [ ] **Step 2: Run the metadata tests to verify they fail**

Run: `pytest tests/test_template_meta_defaults.py -q`
Expected: FAIL because current `meta.yaml` files still expose the old names/titles/visibility.

- [ ] **Step 3: Update template metadata**

Touch the relevant `backend/templates/*/meta.yaml` files and keep changes limited to:
- `display_name`
- `description`
- selective `defaults.sections[].title`
- selective `defaults.sections[].visible`

- [ ] **Step 4: Re-run the metadata tests**

Run: `pytest tests/test_template_meta_defaults.py -q`
Expected: PASS

### Task 2: Add a renderer regression test for hipster sidebar visibility

**Files:**
- Modify: `tests/test_latex_renderer.py`

- [ ] **Step 1: Write the failing renderer test**

```python
def test_hipster_sidebar_skills_and_languages_respect_section_order():
    ...
```

- [ ] **Step 2: Run the renderer test to verify it fails**

Run: `pytest tests/test_latex_renderer.py::test_hipster_sidebar_skills_and_languages_respect_section_order -q`
Expected: FAIL because `hipster` currently renders sidebar skills/languages whenever data exists.

- [ ] **Step 3: Apply the minimal template fix**

Modify `backend/templates/hipster/cv.tex.j2` so sidebar `skills` and `languages` render only when their keys are present in `section_order`.

- [ ] **Step 4: Re-run the renderer test**

Run: `pytest tests/test_latex_renderer.py::test_hipster_sidebar_skills_and_languages_respect_section_order -q`
Expected: PASS

### Task 3: Final verification

**Files:**
- Verify only

- [ ] **Step 1: Run focused verification**

Run: `pytest tests/test_template_meta_defaults.py tests/test_latex_renderer.py::test_hipster_sidebar_skills_and_languages_respect_section_order tests/test_api.py::test_templates_meta_has_display_name tests/test_api.py::test_templates_meta_includes_defaults_block -q`
Expected: PASS

- [ ] **Step 2: Review the diff for scope**

Run: `git diff -- backend/templates tests docs/superpowers/plans/2026-05-05-template-meta-rebrand-and-sidebar-density.md`
Expected: Only the planned metadata, template, test, and plan-file changes are present.
