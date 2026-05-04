# Contact Field Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-field show/hide and per-link-field display style controls to `settings.yaml`, surfaced as a "Contact" pill + flyout panel in the controls row.

**Architecture:** Backend gains `_make_contact_helpers` in `latex.py` and a new `personal_fields` parameter on `CVRequest`; the classic template gates each header field on `contact_visible(key)` and uses `contact_link_style(key)` for link text. Frontend gains a `PERSONAL_FIELD_CATALOG` in `settings-engine.js`, a new `contact-ui.js` module that owns the pill + flyout, and wiring in `settings-sync.js` so `_applyAll` calls `contactUI.rebuild`.

**Tech Stack:** Python / FastAPI / Jinja2 / pdflatex (backend); plain ES6 IIFEs, js-yaml, CodeMirror (frontend); Node.js built-in `test` runner for JS unit tests; pytest + httpx for Python tests.

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `backend/renderers/latex.py` | `_make_contact_helpers`, extended `_make_link_text_fn`, `LaTeXRenderer.personal_fields` |
| Modify | `backend/main.py` | `CVRequest.personal_fields`, pass to renderer, update `_validate_template` |
| Modify | `backend/templates/classic/cv.tex.j2` | Gate each header field on `contact_visible`; use `contact_link_style` |
| Modify | `frontend/settings-engine.js` | `PERSONAL_FIELD_CATALOG`, `LINK_FIELDS`, `normalizePersonalFields`, update `parseSettings` + `settingsToYaml` + `DEFAULT_SETTINGS` |
| Modify | `frontend/settings-sync.js` | `_applyToContact` in `_applyAll`; include `personal_fields` in `app.setState` |
| Modify | `frontend/index.html` | CSS for pill/flyout/rows; HTML structure for pill + flyout; add script tag |
| Create | `frontend/contact-ui.js` | Pill + flyout IIFE: `rebuild(settings)`, event handlers, `settingsSync.updateFromToolbar` calls |
| Modify | `frontend/preview.js` | Add `personal_fields: app.state.personal_fields ?? []` to fetch body |
| Create | `tests/test_contact_settings_engine.js` | JS unit tests for `parseSettings` / `settingsToYaml` with `personal.fields` |
| Modify | `tests/test_latex_renderer.py` | Tests for `_make_contact_helpers` and `_make_link_text_fn` with style arg |
| Modify | `tests/test_api.py` | Test `personal_fields` accepted and threaded through preview/export |

---

## Task 1: Backend — contact helpers in `latex.py`

**Files:**
- Modify: `backend/renderers/latex.py`
- Test: `tests/test_latex_renderer.py`

- [ ] **Step 1: Write failing tests**

Append to `tests/test_latex_renderer.py`:

```python
from backend.renderers.latex import _make_contact_helpers, _make_link_text_fn


def test_contact_visible_defaults_true_when_no_fields():
    visible, _ = _make_contact_helpers([], "url")
    assert visible("email") is True
    assert visible("github") is True


def test_contact_visible_name_always_true():
    visible, _ = _make_contact_helpers([{"key": "name", "visible": False}], "url")
    assert visible("name") is True


def test_contact_visible_respects_field_setting():
    visible, _ = _make_contact_helpers(
        [{"key": "linkedin", "visible": False}, {"key": "github", "visible": True}],
        "url",
    )
    assert visible("linkedin") is False
    assert visible("github") is True


def test_contact_visible_unknown_key_defaults_true():
    visible, _ = _make_contact_helpers([{"key": "email", "visible": False}], "url")
    assert visible("nonexistent") is True


def test_contact_link_style_uses_global_when_no_override():
    _, style = _make_contact_helpers([{"key": "github", "visible": True}], "url")
    assert style("github") == "url"


def test_contact_link_style_uses_field_override():
    _, style = _make_contact_helpers(
        [{"key": "github", "visible": True, "link_display": "label"}], "url"
    )
    assert style("github") == "label"


def test_contact_link_style_ignores_invalid_override():
    _, style = _make_contact_helpers(
        [{"key": "github", "visible": True, "link_display": "invalid"}], "url"
    )
    assert style("github") == "url"


def test_link_text_with_explicit_style_overrides_global():
    fn = _make_link_text_fn("url")
    assert fn("github.com/user", "GitHub", "label") == "GitHub"
    assert fn("github.com/user", "GitHub", "both") == "GitHub (github.com/user)"
    assert fn("github.com/user", "GitHub", "url") == "github.com/user"


def test_link_text_without_style_uses_global():
    fn = _make_link_text_fn("both")
    assert fn("github.com/user", "GitHub") == "GitHub (github.com/user)"


def test_link_text_invalid_style_falls_back_to_global():
    fn = _make_link_text_fn("label")
    assert fn("github.com/user", "GitHub", "invalid") == "GitHub"
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/khjmove/mkcv && source .venv/bin/activate && pytest tests/test_latex_renderer.py::test_contact_visible_defaults_true_when_no_fields -v
```

Expected: `FAILED` with `ImportError: cannot import name '_make_contact_helpers'`

- [ ] **Step 3: Implement `_make_contact_helpers` and extend `_make_link_text_fn`**

In `backend/renderers/latex.py`, replace the existing `_make_link_text_fn`:

```python
def _make_link_text_fn(link_display: str):
    def link_text(url: str, label: str, style: str | None = None) -> str:
        s = style if style in ('label', 'url', 'both') else link_display
        if s == "url":
            return url
        elif s == "both":
            return f"{label} ({url})"
        return label
    return link_text
```

Add `_make_contact_helpers` immediately after `_make_link_text_fn`:

```python
def _make_contact_helpers(personal_fields: list, link_display: str):
    field_map = {
        f['key']: f
        for f in personal_fields
        if isinstance(f, dict) and 'key' in f
    }

    def contact_visible(key: str) -> bool:
        if key == 'name':
            return True
        return field_map.get(key, {}).get('visible', True)

    def contact_link_style(key: str) -> str:
        override = field_map.get(key, {}).get('link_display')
        if override in ('label', 'url', 'both'):
            return override
        return link_display

    return contact_visible, contact_link_style
```

- [ ] **Step 4: Add `personal_fields` to `LaTeXRenderer` and wire helpers into `render`**

Update `LaTeXRenderer.__init__` signature and body:

```python
class LaTeXRenderer(BaseRenderer):
    def __init__(
        self,
        templates_dir: Path,
        template: str = "classic",
        density: str = "balanced",
        font_scale: str = "normal",
        link_display: str = "label",
        personal_fields: list | None = None,
    ):
        self.templates_dir = templates_dir
        self.template = template
        self.density = density
        self.font_scale = font_scale
        self.link_display = link_display
        self.personal_fields = personal_fields or []
```

In `LaTeXRenderer.render`, add contact helpers to `env.globals` (right after the existing `link_text` line):

```python
        env.filters.update(_make_jinja_filters())
        env.globals['link_text'] = _make_link_text_fn(self.link_display)
        contact_visible, contact_link_style = _make_contact_helpers(
            self.personal_fields, self.link_display
        )
        env.globals['contact_visible'] = contact_visible
        env.globals['contact_link_style'] = contact_link_style
```

- [ ] **Step 5: Run all new tests**

```bash
pytest tests/test_latex_renderer.py -k "contact or link_text" -v
```

Expected: all 11 new tests `PASSED`

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
pytest tests/test_latex_renderer.py -v
```

Expected: all tests `PASSED`

- [ ] **Step 7: Commit**

```bash
git add backend/renderers/latex.py tests/test_latex_renderer.py
git commit -m "feat(backend): add _make_contact_helpers and per-field link_text style arg"
```

---

## Task 2: Backend — `CVRequest` + `main.py` wiring

**Files:**
- Modify: `backend/main.py`
- Test: `tests/test_api.py`

- [ ] **Step 1: Write failing test**

Append to `tests/test_api.py`:

```python
@pytest.mark.asyncio
async def test_preview_pdf_accepts_personal_fields(client):
    """personal_fields is accepted without error; field visibility is respected."""
    resp = await client.post("/api/preview/pdf", json={
        "yaml": "personal:\n  name: Test\n  email: t@test.com\n  github: github.com/test\n",
        "template": "classic",
        "personal_fields": [
            {"key": "name",   "visible": True},
            {"key": "email",  "visible": True},
            {"key": "github", "visible": False},
        ],
    })
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"


@pytest.mark.asyncio
async def test_preview_pdf_personal_fields_defaults_to_empty(client):
    """Omitting personal_fields does not cause an error."""
    resp = await client.post("/api/preview/pdf", json={
        "yaml": "personal:\n  name: Test\n  email: t@test.com\n",
        "template": "classic",
    })
    assert resp.status_code == 200
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_api.py::test_preview_pdf_accepts_personal_fields -v
```

Expected: `PASSED` (FastAPI ignores unknown fields by default) — if it fails, investigate.  
The real goal is to confirm `personal_fields` reaches the renderer; the full integration comes in Task 3.

- [ ] **Step 3: Add `personal_fields` to `CVRequest` in `main.py`**

Find `CVRequest` and add the new field:

```python
class CVRequest(BaseModel):
    yaml: str
    template: str = "classic"
    section_order: Optional[List[str]] = None
    section_titles: Optional[dict] = None
    density: Literal["comfortable", "balanced", "compact"] = "balanced"
    font_scale: Literal["small", "normal", "large"] = "normal"
    link_display: Literal["label", "url", "both"] = "label"
    personal_fields: Optional[List[dict]] = None
```

- [ ] **Step 4: Pass `personal_fields` to `LaTeXRenderer` in all four render endpoints**

There are four calls to `LaTeXRenderer(...)` in `main.py` (export_latex, export_pdf, preview_pdf, and inside `_validate_template`). Update each one.

For the three request-handler calls (export_latex, export_pdf, preview_pdf), add `personal_fields=req.personal_fields or []`:

```python
renderer = LaTeXRenderer(
    TEMPLATES_DIR,
    template=req.template,
    density=req.density,
    font_scale=req.font_scale,
    link_display=req.link_display,
    personal_fields=req.personal_fields or [],
)
```

For `_validate_template` (which constructs the env directly, not via `LaTeXRenderer`), add `contact_visible` and `contact_link_style` globals right after `env.globals['link_text']`:

```python
        env.globals['link_text'] = _make_link_text_fn("label")
        _cv_fn, _cs_fn = _make_contact_helpers([], "label")
        env.globals['contact_visible'] = _cv_fn
        env.globals['contact_link_style'] = _cs_fn
```

Also update the import line at the top of `main.py` to include the new names:

```python
from backend.renderers.latex import (
    LaTeXRenderer, _build_layout_preamble, _FONT_SIZE,
    _make_jinja_filters, _make_link_text_fn, _make_contact_helpers,
)
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_api.py -v
```

Expected: all tests `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/main.py tests/test_api.py
git commit -m "feat(backend): add personal_fields to CVRequest and wire into LaTeXRenderer"
```

---

## Task 3: Backend — classic template header

**Files:**
- Modify: `backend/templates/classic/cv.tex.j2`
- Test: `tests/test_latex_renderer.py`

- [ ] **Step 1: Write failing tests**

Append to `tests/test_latex_renderer.py`:

```python
def _make_cv(github="github.com/user", linkedin=None, email="a@b.com", phone=None, location=None):
    return CVData(
        personal=PersonalInfo(
            name="Test User",
            email=email,
            phone=phone,
            location=location,
            linkedin=linkedin,
            github=github,
        )
    )


def test_classic_hides_github_when_not_visible():
    renderer = LaTeXRenderer(
        TEMPLATES_DIR, template="classic",
        personal_fields=[
            {"key": "name",   "visible": True},
            {"key": "email",  "visible": True},
            {"key": "github", "visible": False},
        ],
    )
    out = renderer.render(_make_cv())
    assert "github.com/user" not in out


def test_classic_shows_github_when_visible():
    renderer = LaTeXRenderer(
        TEMPLATES_DIR, template="classic",
        personal_fields=[{"key": "github", "visible": True}],
    )
    out = renderer.render(_make_cv())
    assert "github.com/user" in out


def test_classic_github_label_override():
    renderer = LaTeXRenderer(
        TEMPLATES_DIR, template="classic",
        link_display="url",
        personal_fields=[{"key": "github", "visible": True, "link_display": "label"}],
    )
    out = renderer.render(_make_cv())
    assert "GitHub" in out
    assert "github.com/user" not in out.split("GitHub")[1][:30]


def test_classic_hides_phone_when_not_visible():
    renderer = LaTeXRenderer(
        TEMPLATES_DIR, template="classic",
        personal_fields=[{"key": "phone", "visible": False}],
    )
    out = renderer.render(_make_cv(phone="+1-555-0000"))
    assert "+1-555-0000" not in out


def test_classic_shows_all_fields_by_default():
    renderer = LaTeXRenderer(TEMPLATES_DIR, template="classic")
    cv = _make_cv(phone="+1-555-0000", location="Seoul", linkedin="linkedin.com/in/user")
    out = renderer.render(cv)
    assert "a@b.com" in out
    assert "+1-555-0000" in out
    assert "Seoul" in out
    assert "linkedin.com/in/user" in out or "LinkedIn" in out
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_latex_renderer.py::test_classic_hides_github_when_not_visible -v
```

Expected: `FAILED` — github URL still appears because template doesn't call `contact_visible` yet.

- [ ] **Step 3: Update the header block in `backend/templates/classic/cv.tex.j2`**

Replace the entire `\begin{center}...\end{center}` header block (lines 18–37) with:

```latex
\begin{center}
    {<< cv.personal.name | name_size >> << cv.personal.name >>}\\[6pt]

    \normalsize
    <% set sep = joiner(" $\cdot$ ") %>
    <% if cv.personal.email and contact_visible('email') %><< sep() >>\href{mailto:<< cv.personal.email >>}{<< cv.personal.email >>}<% endif %>
    <% if cv.personal.phone and contact_visible('phone') %><< sep() >><< cv.personal.phone >><% endif %>
    <% if cv.personal.location and contact_visible('location') %><< sep() >><< cv.personal.location >><% endif %>
    \\[2pt]

    <% set sep2 = joiner(" $\cdot$ ") %>
    <% if cv.personal.linkedin and contact_visible('linkedin') %><< sep2() >>\href{https://<< cv.personal.linkedin >>}{<< link_text(cv.personal.linkedin, 'LinkedIn', contact_link_style('linkedin')) >>}<% endif %>
    <% if cv.personal.github and contact_visible('github') %><< sep2() >>\href{https://<< cv.personal.github >>}{<< link_text(cv.personal.github, 'GitHub', contact_link_style('github')) >>}<% endif %>
    <% if cv.personal.huggingface and contact_visible('huggingface') %><< sep2() >>\href{https://<< cv.personal.huggingface >>}{<< link_text(cv.personal.huggingface, 'Hugging Face', contact_link_style('huggingface')) >>}<% endif %>
    <% if cv.personal.website and contact_visible('website') %><< sep2() >>\href{https://<< cv.personal.website >>}{<< link_text(cv.personal.website, 'Website', contact_link_style('website')) >>}<% endif %>
\end{center}
```

- [ ] **Step 4: Run the new tests**

```bash
pytest tests/test_latex_renderer.py -k "classic_hides or classic_shows or classic_github or classic_phone or classic_all" -v
```

Expected: all 5 new tests `PASSED`

- [ ] **Step 5: Run full suite including template validation**

```bash
pytest tests/ -v
```

Expected: all tests `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/templates/classic/cv.tex.j2 tests/test_latex_renderer.py
git commit -m "feat(template): gate classic header fields on contact_visible/contact_link_style"
```

---

## Task 4: Frontend — `settings-engine.js` personal fields

**Files:**
- Modify: `frontend/settings-engine.js`
- Create: `tests/test_contact_settings_engine.js`

- [ ] **Step 1: Write failing JS tests**

Create `tests/test_contact_settings_engine.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const jsyaml = require('js-yaml');

function loadSettingsHelpers() {
  const source = fs.readFileSync('frontend/settings-engine.js', 'utf8');
  const context = { jsyaml, window: {} };
  vm.runInNewContext(source, context);
  return context.window.SETTINGS_HELPERS;
}

test('PERSONAL_FIELD_CATALOG exported with 8 entries in canonical order', () => {
  const { PERSONAL_FIELD_CATALOG } = loadSettingsHelpers();
  assert.equal(PERSONAL_FIELD_CATALOG.length, 8);
  assert.equal(PERSONAL_FIELD_CATALOG[0].key, 'name');
  assert.equal(PERSONAL_FIELD_CATALOG[0].locked, true);
  assert.equal(PERSONAL_FIELD_CATALOG[0].isLink, false);
});

test('LINK_FIELDS contains exactly website linkedin github huggingface', () => {
  const { LINK_FIELDS } = loadSettingsHelpers();
  assert.ok(LINK_FIELDS.has('linkedin'));
  assert.ok(LINK_FIELDS.has('github'));
  assert.ok(LINK_FIELDS.has('huggingface'));
  assert.ok(LINK_FIELDS.has('website'));
  assert.ok(!LINK_FIELDS.has('email'));
  assert.ok(!LINK_FIELDS.has('phone'));
  assert.ok(!LINK_FIELDS.has('name'));
});

test('DEFAULT_SETTINGS includes personal.fields with all 8 fields visible', () => {
  const { DEFAULT_SETTINGS } = loadSettingsHelpers();
  assert.ok(Array.isArray(DEFAULT_SETTINGS.personal.fields));
  assert.equal(DEFAULT_SETTINGS.personal.fields.length, 8);
  assert.ok(DEFAULT_SETTINGS.personal.fields.every(f => f.visible === true));
});

test('parseSettings round-trips personal.fields', () => {
  const { parseSettings, settingsToYaml, DEFAULT_SETTINGS } = loadSettingsHelpers();
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  settings.personal.fields[2].visible = false; // phone hidden
  settings.personal.fields[6].link_display = 'label'; // github override
  const yaml = settingsToYaml(settings);
  const result = parseSettings(yaml);
  assert.equal(result.errors.length, 0);
  const fields = result.value.personal.fields;
  assert.equal(fields.find(f => f.key === 'phone').visible, false);
  assert.equal(fields.find(f => f.key === 'github').link_display, 'label');
  assert.equal(fields.find(f => f.key === 'email').visible, true);
});

test('parseSettings without personal.fields defaults all visible', () => {
  const { parseSettings } = loadSettingsHelpers();
  const yaml = 'template: classic\nlayout:\n  density: balanced\n  font_scale: normal\npersonal:\n  link_display: url\n';
  const result = parseSettings(yaml);
  assert.equal(result.errors.length, 0);
  const fields = result.value.personal.fields;
  assert.ok(Array.isArray(fields));
  assert.ok(fields.every(f => f.visible === true));
  assert.ok(!fields.some(f => f.link_display));
});

test('parseSettings ignores link_display override on non-link fields', () => {
  const { parseSettings, settingsToYaml, DEFAULT_SETTINGS } = loadSettingsHelpers();
  const yaml = settingsToYaml(DEFAULT_SETTINGS).replace(
    '- key: email\n      visible: true',
    '- key: email\n      visible: true\n      link_display: label'
  );
  const result = parseSettings(yaml);
  assert.equal(result.errors.length, 0);
  const emailField = result.value.personal.fields.find(f => f.key === 'email');
  assert.ok(!emailField.link_display);
});

test('settingsToYaml does not emit link_display for non-link fields', () => {
  const { settingsToYaml, DEFAULT_SETTINGS } = loadSettingsHelpers();
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  // manually inject a link_display on a non-link field (should be stripped in real code)
  const emailField = settings.personal.fields.find(f => f.key === 'email');
  emailField.link_display = 'label';
  const yaml = settingsToYaml(settings);
  // email block should not have link_display line
  const emailBlock = yaml.split('- key: email')[1]?.split('- key:')[0] ?? '';
  assert.ok(!emailBlock.includes('link_display'));
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --test tests/test_contact_settings_engine.js 2>&1 | head -30
```

Expected: failures — `PERSONAL_FIELD_CATALOG` not exported yet.

- [ ] **Step 3: Add `PERSONAL_FIELD_CATALOG`, `LINK_FIELDS`, `KNOWN_PERSONAL_KEYS` to `settings-engine.js`**

Insert after the `const VALID_LINK_DISPLAY` line and before `const DEFAULT_SETTINGS`:

```js
  const PERSONAL_FIELD_CATALOG = [
    { key: 'name',        isLink: false, locked: true  },
    { key: 'email',       isLink: false, locked: false },
    { key: 'phone',       isLink: false, locked: false },
    { key: 'location',    isLink: false, locked: false },
    { key: 'website',     isLink: true,  locked: false },
    { key: 'linkedin',    isLink: true,  locked: false },
    { key: 'github',      isLink: true,  locked: false },
    { key: 'huggingface', isLink: true,  locked: false },
  ];
  const LINK_FIELDS         = new Set(PERSONAL_FIELD_CATALOG.filter(f => f.isLink).map(f => f.key));
  const KNOWN_PERSONAL_KEYS = new Set(PERSONAL_FIELD_CATALOG.map(f => f.key));
```

- [ ] **Step 4: Update `DEFAULT_SETTINGS` to include `personal.fields`**

Replace the `personal` line inside `DEFAULT_SETTINGS`:

```js
    personal: {
      link_display: 'label',
      fields: PERSONAL_FIELD_CATALOG.map(f => ({ key: f.key, visible: true })),
    },
```

- [ ] **Step 5: Add `normalizePersonalFields` helper** (insert after the `_clone` function)

```js
  function normalizePersonalFields(rawFields) {
    if (!Array.isArray(rawFields)) {
      return PERSONAL_FIELD_CATALOG.map(f => ({ key: f.key, visible: true }));
    }
    const seen = new Set();
    const result = [];
    for (const item of rawFields) {
      if (!item || typeof item !== 'object' || item.key == null) continue;
      const key = String(item.key);
      if (seen.has(key) || !KNOWN_PERSONAL_KEYS.has(key)) continue;
      seen.add(key);
      const entry = { key, visible: item.visible !== false };
      if (LINK_FIELDS.has(key) && VALID_LINK_DISPLAY.includes(item.link_display)) {
        entry.link_display = item.link_display;
      }
      result.push(entry);
    }
    for (const f of PERSONAL_FIELD_CATALOG) {
      if (!seen.has(f.key)) result.push({ key: f.key, visible: true });
    }
    return result;
  }
```

- [ ] **Step 6: Update `parseSettings` to call `normalizePersonalFields`**

Inside the `if (parsed.personal && ...)` block, add after the existing `link_display` parsing:

```js
      out.personal.fields = normalizePersonalFields(
        Array.isArray(parsed.personal.fields) ? parsed.personal.fields : undefined
      );
```

- [ ] **Step 7: Update `settingsToYaml` to serialize `personal.fields`**

Replace the `personal:` block in `settingsToYaml`:

```js
    'personal:',
    `  link_display: ${s.personal.link_display}  # label | url | both`,
  ];
  if (Array.isArray(s.personal.fields) && s.personal.fields.length > 0) {
    lines.push('  fields:');
    for (const f of s.personal.fields) {
      lines.push(`    - key: ${f.key}`);
      lines.push(`      visible: ${f.visible}`);
      if (f.link_display && LINK_FIELDS.has(f.key)) {
        lines.push(`      link_display: ${f.link_display}`);
      }
    }
  }
  lines.push('');
  lines.push('sections:');
```

(Remove the existing `''` and `'sections:'` lines that follow the `personal` block, since we now push them manually above.)

- [ ] **Step 8: Export the new names from the return statement**

```js
  return {
    SECTION_CATALOG,
    KNOWN_KEYS,
    PERSONAL_FIELD_CATALOG,
    LINK_FIELDS,
    VALID_DENSITY,
    VALID_FONT,
    VALID_TPL,
    VALID_LINK_DISPLAY,
    DEFAULT_SETTINGS,
    settingsToYaml,
    parseSettings,
    normalizeTemplateDefaults,
  };
```

- [ ] **Step 9: Run all JS tests**

```bash
node --test tests/test_contact_settings_engine.js 2>&1
```

Expected: all 7 tests `pass`

- [ ] **Step 10: Run existing JS tests to check for regressions**

```bash
node --test tests/test_settings_sync_tab_switch.js && node --test tests/test_sections_chip_css.js && node --test tests/test_template_default_reset.js
```

Expected: all pass

- [ ] **Step 11: Commit**

```bash
git add frontend/settings-engine.js tests/test_contact_settings_engine.js
git commit -m "feat(engine): add PERSONAL_FIELD_CATALOG, normalizePersonalFields, personal.fields schema"
```

---

## Task 5: Frontend — `settings-sync.js` + `app.js` wiring

**Files:**
- Modify: `frontend/settings-sync.js`

- [ ] **Step 1: Add `personal_fields` to `app.setState` call inside `_applyToToolbar`**

Find the `app.setState` call in `_applyToToolbar` and add `personal_fields`:

```js
    app.setState({
      density: settings.layout.density,
      font_scale: settings.layout.font_scale,
      link_display: settings.personal?.link_display ?? 'label',
      personal_fields: settings.personal?.fields ?? [],
    });
```

- [ ] **Step 2: Add `_applyToContact` and wire into `_applyAll`**

Replace the existing `_applyAll` function:

```js
  function _applyToContact(settings) {
    if (window.contactUI) contactUI.rebuild(settings);
  }

  function _applyAll(settings) {
    _applyToToolbar(settings);
    _applyToSections(settings);
    _applyToContact(settings);
  }
```

- [ ] **Step 3: Run existing JS tests**

```bash
node --test tests/test_settings_sync_tab_switch.js
```

Expected: all 3 tests `pass`

- [ ] **Step 4: Commit**

```bash
git add frontend/settings-sync.js
git commit -m "feat(sync): wire _applyToContact into _applyAll; expose personal_fields on app.state"
```

---

## Task 6: Frontend — `index.html` CSS and HTML

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Add CSS for the pill, flyout, and field rows**

Inside the `<style>` block, after the `#undo-toast-btn:hover` rule (the last rule before `</style>`), insert:

```css
    /* ── Contact pill ── */
    .contact-pill {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 11px 4px 9px; border-radius: 999px;
      border: 1px solid var(--rule); background: var(--paper-2);
      font-size: 11px; color: var(--ink-2); cursor: pointer;
      white-space: nowrap; flex-shrink: 0; user-select: none;
      transition: border-color .12s, background .12s;
    }
    .contact-pill:hover { border-color: var(--rule-2); background: var(--paper-3); }
    .contact-pill.open { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
    .contact-pill-label { font-family: var(--font-serif); font-style: italic; font-size: 12px; }
    .contact-hidden-count {
      display: inline-flex; align-items: center; justify-content: center;
      width: 16px; height: 16px; border-radius: 50%;
      background: var(--ink-4); color: var(--paper);
      font-family: var(--font-mono); font-size: 8.5px; line-height: 1;
    }
    .contact-pill.open .contact-hidden-count { background: var(--accent); }
    .contact-pill-caret { color: var(--ink-4); font-size: 10px; }
    .contact-pill.open .contact-pill-caret { color: var(--accent); }

    /* ── Contact flyout ── */
    .flyout-anchor { position: relative; flex-shrink: 0; }
    .flyout-panel {
      position: absolute; top: calc(100% + 8px); left: 0;
      background: var(--paper); border: 1px solid var(--rule);
      border-radius: 10px; box-shadow: var(--shadow-md);
      min-width: 340px; z-index: 50; overflow: hidden;
    }
    .flyout-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 9px 14px; border-bottom: 1px solid var(--rule);
      background: var(--paper-2);
    }
    .flyout-head-label {
      font-family: var(--font-mono); font-size: 9px;
      letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-4);
    }
    .flyout-global-label { font-family: var(--font-mono); font-size: 9px; color: var(--ink-4); }
    .flyout-seg {
      display: inline-flex; gap: 1px;
      background: var(--paper-3); border-radius: 5px; padding: 2px;
      border: 1px solid var(--rule);
    }
    .flyout-seg span {
      font-family: var(--font-mono); font-size: 9px;
      padding: 2px 7px; border-radius: 3px; cursor: pointer;
      color: var(--ink-3); white-space: nowrap; user-select: none;
    }
    .flyout-seg span.active { background: var(--paper); color: var(--ink); box-shadow: var(--shadow-sm); }

    /* ── Field rows ── */
    .field-row {
      display: flex; align-items: center; gap: 9px;
      padding: 7px 14px; transition: background .1s;
    }
    .field-row + .field-row { border-top: 1px solid var(--paper-3); }
    .field-row:hover { background: var(--paper-2); }
    .field-row.hidden-row { opacity: 0.45; }
    .field-divider { height: 1px; background: var(--rule); }
    .f-toggle {
      width: 28px; height: 16px; border-radius: 999px;
      background: var(--accent); position: relative;
      flex-shrink: 0; cursor: pointer; transition: background .15s;
    }
    .f-toggle::after {
      content: ''; position: absolute; top: 2px; right: 2px;
      width: 12px; height: 12px; border-radius: 50%; background: white;
      transition: right .15s, left .15s;
    }
    .f-toggle.off { background: var(--rule); }
    .f-toggle.off::after { left: 2px; right: auto; }
    .f-toggle.locked { opacity: 0.28; pointer-events: none; }
    .f-key { font-family: var(--font-mono); font-size: 10px; color: var(--ink-3); width: 78px; flex-shrink: 0; }
    .f-val { font-size: 11px; color: var(--ink-2); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .field-row.hidden-row .f-val { color: var(--ink-4); }
    .f-ctrl { flex-shrink: 0; display: flex; align-items: center; }
    .f-locked {
      font-family: var(--font-mono); font-size: 8.5px; color: var(--ink-4);
      border: 1px solid var(--rule); border-radius: 3px; padding: 1px 5px;
    }
    .f-inherit {
      font-family: var(--font-mono); font-size: 9px; color: var(--ink-4);
      border: 1px dashed var(--rule-2); border-radius: 4px;
      padding: 2px 7px; cursor: pointer; white-space: nowrap;
      transition: border-color .1s, color .1s;
    }
    .f-inherit:hover { border-color: var(--rule); color: var(--ink-3); }
    .f-picker {
      display: inline-flex; gap: 1px;
      background: var(--paper-3); border-radius: 5px; padding: 2px;
      border: 1px solid var(--rule);
    }
    .f-picker span {
      font-family: var(--font-mono); font-size: 9px;
      padding: 2px 6px; border-radius: 3px; cursor: pointer;
      color: var(--ink-3); white-space: nowrap; user-select: none;
    }
    .f-picker span:hover { background: var(--paper); color: var(--ink); }
    .f-picker span.p-inherit { color: var(--ink-4); font-style: italic; }
    .f-override {
      display: inline-flex; align-items: center; gap: 5px;
      font-family: var(--font-mono); font-size: 9px; border-radius: 4px;
      padding: 2px 7px; background: var(--accent-soft); color: var(--accent);
      border: 1px solid oklch(52% 0.15 25 / 0.3);
    }
    .f-override-x { font-size: 11px; opacity: 0.6; cursor: pointer; line-height: 1; }
    .f-override-x:hover { opacity: 1; }
```

- [ ] **Step 2: Add the pill + flyout HTML to the controls row**

In the controls row, find the `<div class="ctrl-sep"></div>` that separates the font-scale group from the sections group. Insert a new separator + flyout anchor **between** that sep and the sections group:

```html
  <div class="ctrl-sep"></div>

  <div class="flyout-anchor" id="contact-flyout-anchor">
    <button class="contact-pill" id="contact-pill">
      <span class="contact-pill-label">Contact</span>
      <span class="contact-hidden-count" id="contact-hidden-count" style="display:none"></span>
      <span class="contact-pill-caret" id="contact-pill-caret">▾</span>
    </button>
    <div class="flyout-panel" id="contact-flyout" style="display:none">
      <div class="flyout-head">
        <span class="flyout-head-label">Contact fields</span>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="flyout-global-label">Default</span>
          <div class="flyout-seg" id="contact-global-seg">
            <span data-value="label">label</span>
            <span data-value="url">url</span>
            <span data-value="both">both</span>
          </div>
        </div>
      </div>
      <div id="contact-fields-body"></div>
    </div>
  </div>
```

- [ ] **Step 3: Add `<script src="contact-ui.js"></script>` to the script block**

Add it immediately after `<script src="sections-ui.js"></script>`:

```html
<script src="sections-ui.js"></script>
<script src="contact-ui.js"></script>
```

- [ ] **Step 4: Verify the controls row renders correctly**

Start the dev server and open the browser. The controls row should now show: `Density [...] | Type size [...] | Contact ▾ | Sections [chips...] Reset settings`. Clicking "Contact ▾" should not error (the flyout opens, but is empty until `contact-ui.js` is implemented in Task 7).

```bash
cd /Users/khjmove/mkcv && source .venv/bin/activate && uvicorn backend.main:app --reload
```

Open http://localhost:8000 and confirm the pill appears and the flyout panel (empty) opens/closes.

- [ ] **Step 5: Commit**

```bash
git add frontend/index.html
git commit -m "feat(ui): add Contact pill + flyout HTML and CSS to controls row"
```

---

## Task 7: Frontend — `contact-ui.js`

**Files:**
- Create: `frontend/contact-ui.js`

- [ ] **Step 1: Create the module**

Create `frontend/contact-ui.js`:

```js
/* global app, jsyaml, settingsSync */
const contactUI = (() => {
  const { PERSONAL_FIELD_CATALOG, LINK_FIELDS } = window.SETTINGS_HELPERS;

  let _openPickerKey = null;

  function _getPersonalValue(key) {
    try {
      const parsed = jsyaml.load(app.state.yaml || '');
      const val = parsed?.personal?.[key];
      return val != null ? String(val) : '';
    } catch {
      return '';
    }
  }

  function _currentSettings() {
    return window.settingsSync ? settingsSync.getSettings() : window.SETTINGS_HELPERS.DEFAULT_SETTINGS;
  }

  function _countHidden(settings) {
    return (settings.personal?.fields ?? []).filter(f => f.key !== 'name' && !f.visible).length;
  }

  function _updatePillBadge(settings) {
    const countEl = document.getElementById('contact-hidden-count');
    if (!countEl) return;
    const n = _countHidden(settings);
    countEl.textContent = n;
    countEl.style.display = n > 0 ? '' : 'none';
  }

  function _buildFieldRow(fieldDef, fieldSettings, value, globalDefault) {
    const { key, locked } = fieldDef;
    const visible = fieldSettings.visible;
    const isLink = LINK_FIELDS.has(key);
    const override = isLink ? fieldSettings.link_display : null;
    const pickerOpen = _openPickerKey === key;

    const row = document.createElement('div');
    row.className = 'field-row' +
      (locked ? ' locked-row' : '') +
      (!visible && !locked ? ' hidden-row' : '');

    // Toggle
    const tog = document.createElement('div');
    tog.className = 'f-toggle' + (!visible ? ' off' : '') + (locked ? ' locked' : '');
    if (!locked) {
      tog.addEventListener('click', () => {
        if (!window.settingsSync) return;
        settingsSync.updateFromToolbar(s => {
          const f = s.personal.fields.find(f => f.key === key);
          if (f) f.visible = !f.visible;
        });
      });
    }
    row.appendChild(tog);

    // Field key
    const keyEl = document.createElement('span');
    keyEl.className = 'f-key';
    keyEl.textContent = key;
    row.appendChild(keyEl);

    // Value preview
    const valEl = document.createElement('span');
    valEl.className = 'f-val';
    valEl.textContent = value;
    row.appendChild(valEl);

    // Right control
    const ctrl = document.createElement('div');
    ctrl.className = 'f-ctrl';

    if (locked) {
      const badge = document.createElement('span');
      badge.className = 'f-locked';
      badge.textContent = 'always shown';
      ctrl.appendChild(badge);
    } else if (isLink) {
      if (pickerOpen) {
        const picker = document.createElement('div');
        picker.className = 'f-picker';
        const opts = [
          { val: null,    label: '↑',    cls: 'p-inherit' },
          { val: 'label', label: 'label', cls: '' },
          { val: 'url',   label: 'url',   cls: '' },
          { val: 'both',  label: 'both',  cls: '' },
        ];
        for (const opt of opts) {
          const span = document.createElement('span');
          span.textContent = opt.label;
          if (opt.cls) span.className = opt.cls;
          span.addEventListener('click', e => {
            e.stopPropagation();
            _openPickerKey = null;
            if (!window.settingsSync) return;
            settingsSync.updateFromToolbar(s => {
              const f = s.personal.fields.find(f => f.key === key);
              if (!f) return;
              if (opt.val === null) delete f.link_display;
              else f.link_display = opt.val;
            });
          });
          picker.appendChild(span);
        }
        ctrl.appendChild(picker);
      } else if (override) {
        const pill = document.createElement('div');
        pill.className = 'f-override';
        const txt = document.createTextNode(override + ' ');
        const x = document.createElement('span');
        x.className = 'f-override-x';
        x.textContent = '×';
        x.addEventListener('click', e => {
          e.stopPropagation();
          if (!window.settingsSync) return;
          settingsSync.updateFromToolbar(s => {
            const f = s.personal.fields.find(f => f.key === key);
            if (f) delete f.link_display;
          });
        });
        pill.appendChild(txt);
        pill.appendChild(x);
        ctrl.appendChild(pill);
      } else {
        const tag = document.createElement('span');
        tag.className = 'f-inherit';
        tag.textContent = `↑ ${globalDefault}`;
        tag.addEventListener('click', e => {
          e.stopPropagation();
          _openPickerKey = key;
          rebuild(_currentSettings());
        });
        ctrl.appendChild(tag);
      }
    }

    row.appendChild(ctrl);
    return row;
  }

  function rebuild(settings) {
    const body = document.getElementById('contact-fields-body');
    if (!body) return;

    const fields = settings.personal?.fields ?? [];
    const globalDefault = settings.personal?.link_display ?? 'label';

    // Update global seg
    const seg = document.getElementById('contact-global-seg');
    if (seg) {
      seg.querySelectorAll('span[data-value]').forEach(span => {
        span.classList.toggle('active', span.dataset.value === globalDefault);
      });
    }

    _updatePillBadge(settings);
    body.innerHTML = '';

    for (const fieldDef of PERSONAL_FIELD_CATALOG) {
      const fieldSettings = fields.find(f => f.key === fieldDef.key)
        ?? { key: fieldDef.key, visible: true };
      const value = _getPersonalValue(fieldDef.key);
      const row = _buildFieldRow(fieldDef, fieldSettings, value, globalDefault);
      body.appendChild(row);
      if (fieldDef.key === 'name') {
        const divider = document.createElement('div');
        divider.className = 'field-divider';
        body.appendChild(divider);
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const pill   = document.getElementById('contact-pill');
    const flyout = document.getElementById('contact-flyout');
    const caret  = document.getElementById('contact-pill-caret');
    if (!pill || !flyout) return;

    function openFlyout() {
      flyout.style.display = '';
      caret.textContent = '▴';
      pill.classList.add('open');
      rebuild(_currentSettings());
    }

    function closeFlyout() {
      flyout.style.display = 'none';
      caret.textContent = '▾';
      pill.classList.remove('open');
      _openPickerKey = null;
    }

    pill.addEventListener('click', e => {
      e.stopPropagation();
      flyout.style.display === 'none' ? openFlyout() : closeFlyout();
    });

    document.addEventListener('click', e => {
      const anchor = document.getElementById('contact-flyout-anchor');
      if (anchor && !anchor.contains(e.target) && flyout.style.display !== 'none') {
        closeFlyout();
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && flyout.style.display !== 'none') closeFlyout();
    });

    // Global default seg
    const seg = document.getElementById('contact-global-seg');
    if (seg) {
      seg.addEventListener('click', e => {
        e.stopPropagation();
        const span = e.target.closest('span[data-value]');
        if (!span || !window.settingsSync) return;
        settingsSync.updateFromToolbar(s => { s.personal.link_display = span.dataset.value; });
      });
    }

    // Rebuild value previews when resume.yaml changes and flyout is open
    let _rebuildTimer = null;
    window.editorAdapter.onChange(() => {
      if (flyout.style.display === 'none') return;
      clearTimeout(_rebuildTimer);
      _rebuildTimer = setTimeout(() => rebuild(_currentSettings()), 300);
    });

    // Initial pill badge
    if (window.settingsSync) _updatePillBadge(settingsSync.getSettings());
  });

  return { rebuild };
})();

window.contactUI = contactUI;
```

- [ ] **Step 2: Verify in the browser**

With the dev server running, open http://localhost:8000 and:
1. Click "Contact ▾" → flyout opens with all 8 fields, your real values from `mycv.yaml`
2. Toggle phone off → pill badge shows "1", settings.yaml updates, PDF preview hides phone
3. Click "↑ url" on github → inline picker appears; select "label" → override pill shows "label ×"
4. Click "×" on override pill → returns to inherit tag
5. Edit settings.yaml in the editor to set `phone.visible: false` → pill badge updates without opening flyout
6. Edit `mycv.yaml` github URL while flyout is open → value preview updates after ~300ms

- [ ] **Step 3: Commit**

```bash
git add frontend/contact-ui.js
git commit -m "feat(ui): implement contact-ui.js pill + flyout with toggle and link style override"
```

---

## Task 8: Frontend — `preview.js` personal fields

**Files:**
- Modify: `frontend/preview.js`

- [ ] **Step 1: Add `personal_fields` to the render fetch body**

In `preview.js`, find the `JSON.stringify({...})` call inside `refresh` and add `personal_fields`:

```js
        body: JSON.stringify({
          yaml,
          template,
          section_order,
          section_titles,
          density: app.state.density,
          font_scale: app.state.font_scale,
          link_display: app.state.link_display,
          personal_fields: app.state.personal_fields ?? [],
        }),
```

- [ ] **Step 2: Verify end-to-end in the browser**

Open http://localhost:8000 and:
1. Hide `github` via the flyout toggle
2. Confirm the live PDF preview no longer shows the GitHub line in the header
3. Re-enable `github` → reappears in PDF
4. Set github link style override to "label" → PDF shows "GitHub" not the URL

- [ ] **Step 3: Run the full Python test suite one final time**

```bash
pytest tests/ -v
```

Expected: all tests `PASSED`

- [ ] **Step 4: Run all JS tests**

```bash
node --test tests/test_contact_settings_engine.js && node --test tests/test_settings_sync_tab_switch.js && node --test tests/test_sections_chip_css.js && node --test tests/test_template_default_reset.js
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add frontend/preview.js
git commit -m "feat(preview): pass personal_fields to render request"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|-------------|------|
| show/hide each contact field separately | Task 7 (toggle in flyout) |
| name always visible/locked | Task 4 (locked in catalog), Task 7 (locked toggle, `always shown` badge) |
| link fields get display style selector | Task 4 (LINK_FIELDS), Task 7 (inherit tag / picker / override pill) |
| global default link display style | Task 4 (DEFAULT_SETTINGS), Task 7 (global seg in flyout header) |
| per-field override | Task 4 (normalizePersonalFields), Task 7 (picker sets `link_display` on field entry) |
| update settings.yaml on UI change | Task 5 (`updateFromToolbar` path, already tested by existing tests) |
| update UI when settings.yaml edited directly | Task 5 (`_applyToContact` → `contactUI.rebuild`) |
| update value previews when resume.yaml changes | Task 7 (`editorAdapter.onChange` listener) |
| not a section (no drag/ordering/rename) | By design: no chip in sections rail, separate HTML element |
| backend renders only visible fields | Tasks 1–3 |
| classic template uses contact helpers | Task 3 |
| backward compatible (no personal.fields in file) | Task 4 (`normalizePersonalFields` with undefined → all visible) |

All requirements covered. No placeholders. Type and function names are consistent across all tasks.
