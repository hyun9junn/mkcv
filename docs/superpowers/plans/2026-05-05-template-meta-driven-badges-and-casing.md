# Template Meta-Driven Badges and Casing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make template picker badges and render-time built-in section title casing fully metadata-driven from each template's `meta.yaml`.

**Architecture:** Normalize the new optional `ui` and `render` metadata in `backend/main.py`, expose them through `/api/templates`, and reuse the same metadata contract in both the frontend picker and the LaTeX renderer. Keep the runtime resilient by falling back to “no badge” and `title` casing when the metadata is missing or invalid.

**Tech Stack:** FastAPI, Jinja2, YAML, vanilla JavaScript, Node test runner, pytest

---

### Task 1: Normalize Template UI and Render Metadata in the API

**Files:**
- Modify: `backend/main.py`
- Test: `tests/test_template_meta_defaults.py`
- Test: `tests/test_api.py`

- [ ] **Step 1: Write the failing metadata normalization tests**

```python
def test_load_template_meta_normalizes_optional_badge_and_section_title_case(tmp_path):
    template_dir = tmp_path / "meta-driven"
    template_dir.mkdir()
    (template_dir / "meta.yaml").write_text(
        "display_name: Meta Driven\n"
        "ui:\n"
        "  badge: Popular\n"
        "render:\n"
        "  section_title_case: lower\n"
    )

    meta = _load_template_meta(template_dir)

    assert meta["ui"] == {"badge": "Popular"}
    assert meta["render"] == {"section_title_case": "lower"}


def test_load_template_meta_invalid_optional_badge_and_casing_fall_back_safely(tmp_path):
    template_dir = tmp_path / "bad-optional-meta"
    template_dir.mkdir()
    (template_dir / "meta.yaml").write_text(
        "ui:\n"
        "  badge: 123\n"
        "render:\n"
        "  section_title_case: loud\n"
    )

    meta = _load_template_meta(template_dir)

    assert meta["ui"] == {"badge": ""}
    assert meta["render"] == {"section_title_case": "title"}
```

- [ ] **Step 2: Run the targeted tests to verify RED**

Run: `uv run pytest tests/test_template_meta_defaults.py tests/test_api.py -q`

Expected: FAIL because `_load_template_meta()` does not yet expose normalized `ui` and `render` keys.

- [ ] **Step 3: Implement metadata normalization in the API loader**

```python
def _normalize_template_ui(ui: object) -> dict:
    if not isinstance(ui, dict):
        return {"badge": ""}
    badge = ui.get("badge")
    if not isinstance(badge, str) or not badge.strip():
        return {"badge": ""}
    return {"badge": badge.strip()}


def _normalize_template_render(render: object) -> dict:
    if not isinstance(render, dict):
        return {"section_title_case": "title"}
    case = render.get("section_title_case")
    if case not in {"upper", "lower", "title"}:
        return {"section_title_case": "title"}
    return {"section_title_case": case}
```

- [ ] **Step 4: Run the targeted tests to verify GREEN**

Run: `uv run pytest tests/test_template_meta_defaults.py tests/test_api.py -q`

Expected: PASS with the new `ui` and `render` keys present and normalized.

---

### Task 2: Replace Frontend Badge Hardcoding with Metadata

**Files:**
- Modify: `frontend/templates.js`
- Test: `tests/test_templates_ui_sync.js`

- [ ] **Step 1: Write the failing frontend badge test**

```javascript
test('template picker shows badge from template metadata', async () => {
  const { context, domReadyCallbacks, elements } = createContext();

  await bootTemplates(context, domReadyCallbacks);

  const options = elements.get('template-dropdown').children;
  const signatureOption = options.find((child) => child.dataset.name === 'signature-split');

  assert.match(signatureOption.innerHTML, /Popular/);
});
```

- [ ] **Step 2: Run the targeted frontend test to verify RED**

Run: `node --test tests/test_templates_ui_sync.js`

Expected: FAIL because `frontend/templates.js` still uses the local `BADGES` map instead of `meta.ui.badge`.

- [ ] **Step 3: Implement metadata-driven badge rendering**

```javascript
const badge = meta.ui?.badge || (isValid === false ? "⚠ Error" : "");
```

Remove the local `BADGES` constant and keep the validation error badge behavior intact.

- [ ] **Step 4: Run the targeted frontend test to verify GREEN**

Run: `node --test tests/test_templates_ui_sync.js`

Expected: PASS with picker badges sourced from API metadata.

---

### Task 3: Replace Renderer Casing Hardcoding with Metadata

**Files:**
- Modify: `backend/renderers/latex.py`
- Test: `tests/test_latex_renderer.py`

- [ ] **Step 1: Write the failing renderer metadata test**

```python
def test_invalid_template_section_title_case_meta_falls_back_to_title_case(tmp_path, minimal_cv):
    template_dir = tmp_path / "fallback-case"
    template_dir.mkdir()
    (template_dir / "cv.tex.j2").write_text(
        "\\section{<< section_titles.summary >>}\n"
    )
    (template_dir / "meta.yaml").write_text(
        "defaults:\n"
        "  layout:\n"
        "    density: balanced\n"
        "    font_scale: normal\n"
        "  personal:\n"
        "    default_link_display: label\n"
        "    fields:\n"
        "      - key: name\n"
        "        visible: true\n"
        "      - key: email\n"
        "        visible: true\n"
        "      - key: phone\n"
        "        visible: true\n"
        "      - key: location\n"
        "        visible: true\n"
        "      - key: website\n"
        "        visible: true\n"
        "        link_display: default\n"
        "      - key: linkedin\n"
        "        visible: true\n"
        "        link_display: default\n"
        "      - key: github\n"
        "        visible: true\n"
        "        link_display: default\n"
        "      - key: huggingface\n"
        "        visible: true\n"
        "        link_display: default\n"
        "  sections:\n"
        "    - key: summary\n"
        "      title: EDITOR'S NOTE\n"
        "      visible: true\n"
        "    ...\n"
        "render:\n"
        "  section_title_case: loud\n"
    )

    output = LaTeXRenderer(tmp_path, template="fallback-case").render(minimal_cv)

    assert "\\section{Editor's Note}" in output
```

- [ ] **Step 2: Run the targeted renderer tests to verify RED**

Run: `uv run pytest tests/test_latex_renderer.py -q`

Expected: FAIL because the renderer still depends on `_SECTION_TITLE_CASE_POLICY` instead of template metadata.

- [ ] **Step 3: Implement metadata-driven casing lookup**

```python
def _load_template_render_config(templates_dir: str, template: str) -> dict[str, str]:
    meta_path = Path(templates_dir) / template / "meta.yaml"
    ...
    return {"section_title_case": normalized_case}


def _transform_builtin_section_title(templates_dir: Path, template: str, title: str) -> str:
    policy = _load_template_render_config(str(templates_dir), template)["section_title_case"]
```

Keep built-in section transforms only and preserve `upper`, `lower`, and smart `title` casing behavior.

- [ ] **Step 4: Run the targeted renderer tests to verify GREEN**

Run: `uv run pytest tests/test_latex_renderer.py -q`

Expected: PASS with casing determined by template metadata and invalid values falling back to `title`.

---

### Task 4: Populate Template Metadata and Run Full Regression

**Files:**
- Modify: `backend/templates/*/meta.yaml`
- Test: `tests/test_template_meta_defaults.py`
- Test: `tests/test_api.py`
- Test: `tests/test_templates_ui_sync.js`
- Test: `tests/test_latex_renderer.py`

- [ ] **Step 1: Add explicit metadata to the live templates**

```yaml
ui:
  badge: "New"

render:
  section_title_case: upper
```

Apply `render.section_title_case` to every template so current behavior is preserved. Add `ui.badge` only to templates that should visibly show a picker badge.

- [ ] **Step 2: Extend regression coverage for live metadata**

```python
async def test_templates_meta_exposes_ui_and_render_blocks(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/templates")
    data = resp.json()
    assert data["meta"]["classic"]["ui"]["badge"] == ""
    assert data["meta"]["classic"]["render"]["section_title_case"] == "title"
```

- [ ] **Step 3: Run focused regression suites**

Run: `uv run pytest tests/test_template_meta_defaults.py tests/test_api.py tests/test_latex_renderer.py -q`

Expected: PASS

Run: `node --test tests/test_templates_ui_sync.js`

Expected: PASS

- [ ] **Step 4: Run full project regression**

Run: `uv run pytest -q`

Expected: PASS

Run: `node --test tests/*.js`

Expected: PASS

