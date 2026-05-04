# Template Default Settings Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current "Reset order" action with a template-aware "Reset settings" flow that restores layout and section defaults from each template's `meta.yaml` without changing the active template.

**Architecture:** The backend exposes a raw `defaults` block from each template `meta.yaml` through `GET /api/templates`. The frontend adds a normalization helper for template defaults, exposes template metadata through `templates.js`, and routes the reset button through `settingsSync` so one call updates toolbar state, `settings.yaml`, section chips, preview, and `resume.yaml` ordering. All template `meta.yaml` files gain a full `defaults` block, and tests cover both the API contract and the reset behavior.

**Tech Stack:** FastAPI, PyYAML, vanilla JavaScript IIFEs, CodeMirror 5, `node:test`, `pytest`

---

## File Map

| File | Responsibility |
|---|---|
| `backend/main.py` | Include template `defaults` in `/api/templates` metadata |
| `backend/templates/README.md` | Document the new `meta.yaml.defaults` contract |
| `backend/templates/*/meta.yaml` | Define per-template layout + section defaults |
| `frontend/settings-engine.js` | Normalize raw template defaults into a full settings object |
| `frontend/settings-sync.js` | Apply a template defaults snapshot as the single reset write path |
| `frontend/templates.js` | Expose fetched template metadata/defaults to other frontend modules |
| `frontend/index.html` | Rename the button and wire it to template-default reset |
| `tests/test_api.py` | API-level coverage for template defaults metadata |
| `tests/test_template_meta_defaults.py` | Meta coverage test across all templates |
| `tests/test_template_default_reset.js` | Frontend regression test for reset behavior |

---

### Task 1: Add failing backend tests for the new metadata contract

**Files:**
- Modify: `tests/test_api.py`
- Create: `tests/test_template_meta_defaults.py`

- [ ] **Step 1: Add the API regression test in `tests/test_api.py`**

Append this test after `test_templates_meta_has_display_name`:

```python
async def test_templates_meta_includes_defaults_block(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/templates")
    assert resp.status_code == 200
    data = resp.json()

    defaults = data["meta"]["classic"]["defaults"]
    assert defaults["layout"]["density"] in {"comfortable", "balanced", "compact"}
    assert defaults["layout"]["font_scale"] in {"small", "normal", "large"}
    assert defaults["personal"]["link_display"] in {"label", "url", "both"}
    assert any(section["key"] == "summary" for section in defaults["sections"])
```

- [ ] **Step 2: Add metadata coverage test in `tests/test_template_meta_defaults.py`**

Create the file with this exact content:

```python
from pathlib import Path

import yaml

TEMPLATES_DIR = Path("backend/templates")
EXPECTED_KEYS = {
    "summary",
    "experience",
    "education",
    "skills",
    "projects",
    "certifications",
    "publications",
    "languages",
    "awards",
    "extracurricular",
}


def test_every_template_meta_has_complete_defaults_block():
    for meta_path in sorted(TEMPLATES_DIR.glob("*/meta.yaml")):
        data = yaml.safe_load(meta_path.read_text()) or {}
        defaults = data["defaults"]

        assert defaults["layout"]["density"] in {"comfortable", "balanced", "compact"}, meta_path
        assert defaults["layout"]["font_scale"] in {"small", "normal", "large"}, meta_path
        assert defaults["personal"]["link_display"] in {"label", "url", "both"}, meta_path

        sections = defaults["sections"]
        keys = [section["key"] for section in sections]
        assert len(keys) == len(EXPECTED_KEYS), meta_path
        assert set(keys) == EXPECTED_KEYS, meta_path

        for section in sections:
            assert isinstance(section["title"], str) and section["title"].strip(), meta_path
            assert isinstance(section["visible"], bool), meta_path
```

- [ ] **Step 3: Run the backend tests to verify they fail**

Run:

```bash
pytest tests/test_api.py::test_templates_meta_includes_defaults_block tests/test_template_meta_defaults.py -q
```

Expected:
- `test_templates_meta_includes_defaults_block` fails with `KeyError: 'defaults'` or equivalent missing-field assertion
- `test_every_template_meta_has_complete_defaults_block` fails because the current `meta.yaml` files do not yet define `defaults`

- [ ] **Step 4: Commit the failing tests**

```bash
git add tests/test_api.py tests/test_template_meta_defaults.py
git commit -m "test: cover template defaults metadata contract"
```

---

### Task 2: Implement backend defaults exposure and document the new `meta.yaml` schema

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/templates/README.md`

- [ ] **Step 1: Extend `_load_template_meta()` in `backend/main.py`**

Update the missing-file fallback and the returned metadata shape so `defaults` is always present:

```python
def _load_template_meta(template_dir: Path) -> dict:
    meta_path = template_dir / "meta.yaml"
    if not meta_path.exists():
        return {
            "display_name": template_dir.name.replace("-", " ").title(),
            "description": "",
            "audience": "",
            "defaults": {},
        }
    with meta_path.open() as f:
        data = _yaml.safe_load(f) or {}
    defaults = data.get("defaults")
    return {
        "display_name": data.get("display_name", template_dir.name),
        "description": data.get("description", ""),
        "audience": data.get("audience", ""),
        "defaults": defaults if isinstance(defaults, dict) else {},
    }
```

- [ ] **Step 2: Rewrite the `meta.yaml` documentation block in `backend/templates/README.md`**

Replace the current `recommended_sections` / `default_section_order` example under `## meta.yaml — required fields` with:

```yaml
display_name: "Human-readable name shown in the UI"
description: "One sentence describing the style and target audience"
audience: general          # one of: general, academic, corporate, engineering
defaults:
  layout:
    density: balanced      # one of: comfortable, balanced, compact
    font_scale: normal     # one of: small, normal, large
  personal:
    link_display: label    # one of: label, url, both
  sections:
    - key: summary
      title: "SUMMARY"
      visible: true
    - key: experience
      title: "EXPERIENCE"
      visible: true
```

Immediately after the code block, replace the old explanatory sentence with:

```md
`defaults.sections` is the single source of truth for template reset order. Include every built-in section exactly once, in the order the template should restore. `template` is intentionally omitted here because reset must preserve the currently selected template.
```

- [ ] **Step 3: Run the backend tests to verify they still fail only on missing template data**

Run:

```bash
pytest tests/test_api.py::test_templates_meta_includes_defaults_block tests/test_template_meta_defaults.py -q
```

Expected:
- API test may now pass
- metadata coverage test should still fail until the actual template files are updated

- [ ] **Step 4: Commit the backend contract change**

```bash
git add backend/main.py backend/templates/README.md
git commit -m "feat: expose template defaults metadata"
```

---

### Task 3: Add a failing frontend regression test for template-default reset

**Files:**
- Create: `tests/test_template_default_reset.js`

- [ ] **Step 1: Create the frontend reset regression test**

Create `tests/test_template_default_reset.js` with this exact content:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createElement() {
  const listeners = new Map();
  return {
    style: {},
    textContent: '',
    innerHTML: '',
    className: '',
    dataset: {},
    classList: { toggle() {} },
    querySelectorAll() { return []; },
    appendChild() {},
    remove() {},
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    click() {
      for (const callback of listeners.get('click') || []) {
        callback({ preventDefault() {}, stopPropagation() {} });
      }
    },
  };
}

function createContext() {
  const domReadyCallbacks = [];
  const elements = new Map();
  const localStorageData = new Map();
  const editorChangeCallbacks = [];
  const counters = { previewRenders: 0 };

  const ids = [
    'file-tab-resume',
    'file-tab-settings',
    'valid-dot',
    'valid-text',
    'settings-warn-item',
    'lines-stat',
    'editor-meta',
    'density-group',
    'font-scale-group',
    'toast-stack',
  ];
  for (const id of ids) elements.set(id, createElement());

  localStorageData.set('mkcv_sections_state', JSON.stringify({
    order: ['projects', 'summary', 'experience', 'education', 'skills'],
    hidden: ['summary'],
  }));

  const editorAdapter = {
    value: '',
    scrollLeft: 0,
    scrollTop: 0,
    _suppressNextPreviewRefresh: false,
    setValue(str) {
      this.value = str;
      for (const callback of editorChangeCallbacks) callback(str);
    },
    setValueSilently(str) { this.value = str; },
    setValuePreserveScroll(str) {
      this.value = str;
      for (const callback of editorChangeCallbacks) callback(str);
    },
    getScrollInfo() { return { left: this.scrollLeft, top: this.scrollTop }; },
    scrollTo(left, top) {
      this.scrollLeft = left;
      this.scrollTop = top;
    },
    suppressNextPreviewRefresh() {
      this._suppressNextPreviewRefresh = true;
    },
    consumeSuppressedPreviewRefresh() {
      const suppressed = this._suppressNextPreviewRefresh;
      this._suppressNextPreviewRefresh = false;
      return suppressed;
    },
    clearHistory() {},
    onChange(callback) { editorChangeCallbacks.push(callback); },
  };

  const context = {
    console,
    TextEncoder,
    setTimeout,
    clearTimeout,
    fetch: async (_url, options = {}) => {
      if (options.method === 'POST') return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ content: '' }) };
    },
    localStorage: {
      getItem(key) { return localStorageData.has(key) ? localStorageData.get(key) : null; },
      setItem(key, value) { localStorageData.set(key, String(value)); },
      removeItem(key) { localStorageData.delete(key); },
    },
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, createElement());
        return elements.get(id);
      },
      addEventListener(type, callback) {
        if (type === 'DOMContentLoaded') domReadyCallbacks.push(callback);
      },
    },
    app: {
      state: {
        yaml: 'personal:\\n  name: Test User\\n',
        template: 'classic',
        density: 'comfortable',
        font_scale: 'large',
        link_display: 'url',
      },
      setState(patch) {
        Object.assign(this.state, patch);
      },
    },
    validator: { validate() {} },
    preview: {
      refresh() {
        counters.previewRenders += 1;
      },
    },
    sectionsUI: {
      buildPanel() {},
    },
    sectionsState: {
      DEFAULT_ORDER: ['summary', 'experience', 'education', 'skills', 'projects', 'certifications', 'publications', 'languages', 'awards', 'extracurricular'],
      getOrderedFilteredYaml(yaml) {
        return yaml;
      },
      reorderMainArea(yaml, order) {
        return `${yaml}\\n# ${order.join(',')}`;
      },
      getOrder() {
        const raw = localStorageData.get('mkcv_sections_state');
        return raw ? JSON.parse(raw).order : [];
      },
      isHidden(key) {
        const raw = localStorageData.get('mkcv_sections_state');
        return raw ? JSON.parse(raw).hidden.includes(key) : false;
      },
      setOrder(order) {
        const raw = localStorageData.get('mkcv_sections_state');
        const state = raw ? JSON.parse(raw) : { hidden: [] };
        state.order = order.slice();
        localStorageData.set('mkcv_sections_state', JSON.stringify(state));
      },
      toggleHidden(key) {
        const raw = localStorageData.get('mkcv_sections_state');
        const state = raw ? JSON.parse(raw) : { order: [] };
        const hidden = new Set(state.hidden || []);
        if (hidden.has(key)) hidden.delete(key);
        else hidden.add(key);
        state.hidden = [...hidden];
        localStorageData.set('mkcv_sections_state', JSON.stringify(state));
      },
      resetAll() {
        localStorageData.set('mkcv_sections_state', JSON.stringify({ order: this.DEFAULT_ORDER, hidden: [] }));
      },
    },
    SETTINGS_HELPERS: {
      SECTION_CATALOG: [
        { key: 'summary', defaultTitle: 'SUMMARY' },
        { key: 'experience', defaultTitle: 'EXPERIENCE' },
        { key: 'education', defaultTitle: 'EDUCATION' },
        { key: 'skills', defaultTitle: 'SKILLS' },
        { key: 'projects', defaultTitle: 'PROJECTS' },
        { key: 'certifications', defaultTitle: 'CERTIFICATIONS' },
        { key: 'publications', defaultTitle: 'PUBLICATIONS' },
        { key: 'languages', defaultTitle: 'LANGUAGES' },
        { key: 'awards', defaultTitle: 'AWARDS' },
        { key: 'extracurricular', defaultTitle: 'EXTRACURRICULAR' },
      ],
      KNOWN_KEYS: new Set(['summary', 'experience', 'education', 'skills', 'projects', 'certifications', 'publications', 'languages', 'awards', 'extracurricular']),
      VALID_DENSITY: ['comfortable', 'balanced', 'compact'],
      VALID_FONT: ['small', 'normal', 'large'],
      VALID_LINK_DISPLAY: ['label', 'url', 'both'],
      DEFAULT_SETTINGS: {
        template: 'classic',
        layout: { density: 'balanced', font_scale: 'normal' },
        personal: { link_display: 'label' },
        sections: [
          { key: 'summary', title: 'SUMMARY', visible: true },
          { key: 'experience', title: 'EXPERIENCE', visible: true },
          { key: 'education', title: 'EDUCATION', visible: true },
          { key: 'skills', title: 'SKILLS', visible: true },
          { key: 'projects', title: 'PROJECTS', visible: true },
          { key: 'certifications', title: 'CERTIFICATIONS', visible: false },
          { key: 'publications', title: 'PUBLICATIONS', visible: false },
          { key: 'languages', title: 'LANGUAGES', visible: false },
          { key: 'awards', title: 'AWARDS', visible: false },
          { key: 'extracurricular', title: 'EXTRACURRICULAR', visible: false },
        ],
      },
      settingsToYaml(value) {
        return JSON.stringify(value);
      },
      parseSettings(yaml) {
        return { value: JSON.parse(yaml), errors: [], warnings: [] };
      },
    },
  };

  context.window = context;
  context.window.editorAdapter = editorAdapter;
  return { context, counters, domReadyCallbacks };
}

async function bootSettingsSync(context, domReadyCallbacks) {
  const source = fs.readFileSync('frontend/settings-sync.js', 'utf8');
  vm.runInNewContext(source, context, { filename: 'frontend/settings-sync.js' });
  for (const callback of domReadyCallbacks) {
    await callback();
  }
}

test('reset to template defaults preserves template and restores settings state', async () => {
  const { context, counters, domReadyCallbacks } = createContext();
  await bootSettingsSync(context, domReadyCallbacks);

  context.window.settingsSync.resetToTemplateDefaults({
    layout: { density: 'compact', font_scale: 'small' },
    personal: { link_display: 'both' },
    sections: [
      { key: 'summary', title: 'PROFILE', visible: true },
      { key: 'experience', title: 'EXPERIENCE', visible: true },
      { key: 'projects', title: 'PROJECTS', visible: true },
      { key: 'skills', title: 'SKILLS', visible: true },
      { key: 'education', title: 'EDUCATION', visible: false },
      { key: 'certifications', title: 'CERTIFICATIONS', visible: false },
      { key: 'publications', title: 'PUBLICATIONS', visible: false },
      { key: 'languages', title: 'LANGUAGES', visible: false },
      { key: 'awards', title: 'AWARDS', visible: false },
      { key: 'extracurricular', title: 'EXTRACURRICULAR', visible: false },
    ],
  }, 'classic');

  const settings = context.window.settingsSync.getSettings();
  const state = JSON.parse(context.localStorage.getItem('mkcv_sections_state'));

  assert.equal(settings.template, 'classic');
  assert.equal(settings.layout.density, 'compact');
  assert.equal(settings.layout.font_scale, 'small');
  assert.equal(settings.personal.link_display, 'both');
  assert.deepEqual(settings.sections.slice(0, 3).map((section) => section.key), ['summary', 'experience', 'projects']);
  assert.equal(settings.sections[0].title, 'PROFILE');
  assert.equal(settings.sections[4].visible, false);
  assert.deepEqual(state.order.slice(0, 3), ['summary', 'experience', 'projects']);
  assert.deepEqual(state.hidden, ['education', 'certifications', 'publications', 'languages', 'awards', 'extracurricular']);
  assert.equal(context.app.state.template, 'classic');
  assert.equal(context.app.state.density, 'compact');
  assert.equal(context.app.state.font_scale, 'small');
  assert.equal(context.app.state.link_display, 'both');
  assert.equal(counters.previewRenders, 1);
});

test('reset button label says Reset settings', () => {
  const html = fs.readFileSync('frontend/index.html', 'utf8');
  assert.match(html, /id=\"reset-sections-order-btn\">Reset settings<\\/button>/);
});
```

- [ ] **Step 2: Run the frontend regression test to verify it fails**

Run:

```bash
node --test tests/test_template_default_reset.js
```

Expected:
- the runtime test fails because `settingsSync.resetToTemplateDefaults` does not exist yet
- the label test fails because the button still says `Reset order`

- [ ] **Step 3: Commit the failing frontend test**

```bash
git add tests/test_template_default_reset.js
git commit -m "test: cover template default reset flow"
```

---

### Task 4: Implement frontend normalization, reset plumbing, and button wiring

**Files:**
- Modify: `frontend/settings-engine.js`
- Modify: `frontend/settings-sync.js`
- Modify: `frontend/templates.js`
- Modify: `frontend/index.html`

- [ ] **Step 1: Add a normalization helper to `frontend/settings-engine.js`**

Inside the `window.SETTINGS_HELPERS` IIFE, after `parseSettings`, add:

```js
  function normalizeTemplateDefaults(rawDefaults = {}, template = DEFAULT_SETTINGS.template) {
    const next = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    next.template = template;

    if (rawDefaults.layout && typeof rawDefaults.layout === 'object') {
      const density = rawDefaults.layout.density != null ? String(rawDefaults.layout.density) : null;
      const fontScale = rawDefaults.layout.font_scale != null ? String(rawDefaults.layout.font_scale) : null;
      if (density && VALID_DENSITY.includes(density)) next.layout.density = density;
      if (fontScale && VALID_FONT.includes(fontScale)) next.layout.font_scale = fontScale;
    }

    if (rawDefaults.personal && typeof rawDefaults.personal === 'object') {
      const linkDisplay = rawDefaults.personal.link_display != null ? String(rawDefaults.personal.link_display) : null;
      if (linkDisplay && VALID_LINK_DISPLAY.includes(linkDisplay)) next.personal.link_display = linkDisplay;
    }

    if (Array.isArray(rawDefaults.sections)) {
      const seen = new Set();
      const sections = [];
      for (const item of rawDefaults.sections) {
        if (!item || typeof item !== 'object' || !item.key) continue;
        const key = String(item.key);
        if (!KNOWN_KEYS.has(key) || seen.has(key)) continue;
        seen.add(key);
        const fallback = DEFAULT_SETTINGS.sections.find((section) => section.key === key);
        sections.push({
          key,
          title: item.title != null ? String(item.title) : (fallback?.title ?? key.toUpperCase()),
          visible: typeof item.visible === 'boolean' ? item.visible : (fallback?.visible ?? true),
        });
      }
      for (const fallback of DEFAULT_SETTINGS.sections) {
        if (seen.has(fallback.key)) continue;
        sections.push({ ...fallback });
      }
      next.sections = sections;
    }

    return next;
  }
```

Then export it from the returned object:

```js
  return {
    SECTION_CATALOG,
    KNOWN_KEYS,
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

- [ ] **Step 2: Add a public reset method to `frontend/settings-sync.js`**

Update the destructuring at the top:

```js
  const {
    SECTION_CATALOG,
    KNOWN_KEYS,
    VALID_DENSITY,
    VALID_FONT,
    DEFAULT_SETTINGS,
    settingsToYaml,
    parseSettings,
    normalizeTemplateDefaults,
  } = window.SETTINGS_HELPERS;
```

Add this function after `updateSectionTitle`:

```js
  function resetToTemplateDefaults(rawDefaults, templateName = (_parsed.value?.template || app.state.template || DEFAULT_SETTINGS.template)) {
    const next = normalizeTemplateDefaults(rawDefaults || {}, templateName);
    _onYamlChange(settingsToYaml(next));
  }
```

And export it:

```js
  return {
    get activeTab() { return _activeTab; },
    updateFromToolbar,
    notifySectionStateChange,
    updateSectionTitle,
    resetToTemplateDefaults,
    getYaml:     () => _settingsYaml,
    getSettings: () => _parsed.value || DEFAULT_SETTINGS,
  };
```

- [ ] **Step 3: Expose template metadata accessors in `frontend/templates.js`**

Right after `let allMeta = {};`, add:

```js
    window.templateCatalog = {
        getMeta(name) {
            return allMeta[name] || {};
        },
        getDefaults(name) {
            return (allMeta[name] || {}).defaults || {};
        },
    };
```

This closure-based object will stay in sync as `allMeta` is replaced after `/api/templates` loads.

- [ ] **Step 4: Rename and rewire the button in `frontend/index.html`**

Change the button label in the markup:

```html
<button class="reset-sections-btn" id="reset-sections-order-btn">Reset settings</button>
```

Replace the existing handler body near the bottom of the inline script with:

```js
  const resetOrderBtn = document.getElementById('reset-sections-order-btn');
  if (resetOrderBtn) {
    resetOrderBtn.addEventListener('click', () => {
      const defaults = window.templateCatalog?.getDefaults(app.state.template) || {};
      if (window.settingsSync) {
        settingsSync.resetToTemplateDefaults(defaults, app.state.template);
      }
    });
  }
```

- [ ] **Step 5: Run the frontend regression test and syntax checks**

Run:

```bash
node --test tests/test_template_default_reset.js
node --check frontend/settings-engine.js
node --check frontend/settings-sync.js
node --check frontend/templates.js
```

Expected:
- `node --test tests/test_template_default_reset.js` passes
- all three `node --check` commands pass with no output

- [ ] **Step 6: Commit the frontend reset implementation**

```bash
git add frontend/settings-engine.js frontend/settings-sync.js frontend/templates.js frontend/index.html tests/test_template_default_reset.js
git commit -m "feat: reset settings from template defaults"
```

---

### Task 5: Populate `defaults` in every template `meta.yaml`

**Files:**
- Modify: `backend/templates/academic-research/meta.yaml`
- Modify: `backend/templates/banking/meta.yaml`
- Modify: `backend/templates/brutalist-mono/meta.yaml`
- Modify: `backend/templates/classic/meta.yaml`
- Modify: `backend/templates/column-skills/meta.yaml`
- Modify: `backend/templates/editorial-magazine/meta.yaml`
- Modify: `backend/templates/executive-corporate/meta.yaml`
- Modify: `backend/templates/gazette/meta.yaml`
- Modify: `backend/templates/heritage/meta.yaml`
- Modify: `backend/templates/hipster/meta.yaml`
- Modify: `backend/templates/modern-startup/meta.yaml`
- Modify: `backend/templates/resume-tech/meta.yaml`
- Modify: `backend/templates/sidebar-minimal/meta.yaml`
- Modify: `backend/templates/split-header/meta.yaml`
- Modify: `backend/templates/timeline-vertical/meta.yaml`

- [ ] **Step 1: Add the `defaults` block to `backend/templates/classic/meta.yaml`**

Append:

```yaml
defaults:
  layout:
    density: balanced
    font_scale: normal
  personal:
    link_display: label
  sections:
    - key: summary
      title: "SUMMARY"
      visible: true
    - key: experience
      title: "EXPERIENCE"
      visible: true
    - key: education
      title: "EDUCATION"
      visible: true
    - key: skills
      title: "SKILLS"
      visible: true
    - key: projects
      title: "PROJECTS"
      visible: true
    - key: certifications
      title: "CERTIFICATIONS"
      visible: false
    - key: publications
      title: "PUBLICATIONS"
      visible: false
    - key: languages
      title: "LANGUAGES"
      visible: false
    - key: awards
      title: "AWARDS"
      visible: false
    - key: extracurricular
      title: "EXTRACURRICULAR"
      visible: false
```

- [ ] **Step 2: Add the `defaults` blocks to the remaining template files**

Use the following exact blocks.

`backend/templates/academic-research/meta.yaml`
```yaml
defaults:
  layout:
    density: compact
    font_scale: small
  personal:
    link_display: label
  sections:
    - key: summary
      title: "SUMMARY"
      visible: true
    - key: education
      title: "EDUCATION"
      visible: true
    - key: experience
      title: "EXPERIENCE"
      visible: true
    - key: publications
      title: "PUBLICATIONS"
      visible: true
    - key: projects
      title: "PROJECTS"
      visible: true
    - key: skills
      title: "SKILLS"
      visible: true
    - key: awards
      title: "AWARDS"
      visible: true
    - key: languages
      title: "LANGUAGES"
      visible: false
    - key: certifications
      title: "CERTIFICATIONS"
      visible: false
    - key: extracurricular
      title: "EXTRACURRICULAR"
      visible: false
```

`backend/templates/banking/meta.yaml`
```yaml
defaults:
  layout:
    density: compact
    font_scale: small
  personal:
    link_display: label
  sections:
    - key: summary
      title: "SUMMARY"
      visible: true
    - key: experience
      title: "EXPERIENCE"
      visible: true
    - key: education
      title: "EDUCATION"
      visible: true
    - key: skills
      title: "SKILLS"
      visible: true
    - key: projects
      title: "PROJECTS"
      visible: true
    - key: awards
      title: "AWARDS"
      visible: true
    - key: certifications
      title: "CERTIFICATIONS"
      visible: false
    - key: languages
      title: "LANGUAGES"
      visible: false
    - key: publications
      title: "PUBLICATIONS"
      visible: false
    - key: extracurricular
      title: "EXTRACURRICULAR"
      visible: false
```

`backend/templates/brutalist-mono/meta.yaml`
```yaml
defaults:
  layout:
    density: compact
    font_scale: small
  personal:
    link_display: both
  sections:
    - key: summary
      title: "SUMMARY"
      visible: true
    - key: experience
      title: "EXPERIENCE"
      visible: true
    - key: projects
      title: "PROJECTS"
      visible: true
    - key: skills
      title: "SKILLS"
      visible: true
    - key: education
      title: "EDUCATION"
      visible: true
    - key: publications
      title: "PUBLICATIONS"
      visible: false
    - key: certifications
      title: "CERTIFICATIONS"
      visible: false
    - key: awards
      title: "AWARDS"
      visible: false
    - key: languages
      title: "LANGUAGES"
      visible: false
    - key: extracurricular
      title: "EXTRACURRICULAR"
      visible: false
```

`backend/templates/column-skills/meta.yaml`
```yaml
defaults:
  layout:
    density: balanced
    font_scale: small
  personal:
    link_display: label
  sections:
    - key: summary
      title: "SUMMARY"
      visible: true
    - key: experience
      title: "EXPERIENCE"
      visible: true
    - key: skills
      title: "SKILLS"
      visible: true
    - key: education
      title: "EDUCATION"
      visible: true
    - key: projects
      title: "PROJECTS"
      visible: true
    - key: awards
      title: "AWARDS"
      visible: false
    - key: publications
      title: "PUBLICATIONS"
      visible: false
    - key: certifications
      title: "CERTIFICATIONS"
      visible: false
    - key: languages
      title: "LANGUAGES"
      visible: false
    - key: extracurricular
      title: "EXTRACURRICULAR"
      visible: false
```

`backend/templates/editorial-magazine/meta.yaml`
```yaml
defaults:
  layout:
    density: balanced
    font_scale: normal
  personal:
    link_display: label
  sections:
    - key: summary
      title: "SUMMARY"
      visible: true
    - key: experience
      title: "EXPERIENCE"
      visible: true
    - key: publications
      title: "PUBLICATIONS"
      visible: true
    - key: awards
      title: "AWARDS"
      visible: true
    - key: education
      title: "EDUCATION"
      visible: true
    - key: projects
      title: "PROJECTS"
      visible: true
    - key: skills
      title: "SKILLS"
      visible: true
    - key: languages
      title: "LANGUAGES"
      visible: false
    - key: certifications
      title: "CERTIFICATIONS"
      visible: false
    - key: extracurricular
      title: "EXTRACURRICULAR"
      visible: false
```

`backend/templates/executive-corporate/meta.yaml`
```yaml
defaults:
  layout:
    density: compact
    font_scale: small
  personal:
    link_display: label
  sections:
    - key: summary
      title: "SUMMARY"
      visible: true
    - key: experience
      title: "EXPERIENCE"
      visible: true
    - key: skills
      title: "SKILLS"
      visible: true
    - key: awards
      title: "AWARDS"
      visible: true
    - key: education
      title: "EDUCATION"
      visible: true
    - key: certifications
      title: "CERTIFICATIONS"
      visible: true
    - key: projects
      title: "PROJECTS"
      visible: false
    - key: languages
      title: "LANGUAGES"
      visible: false
    - key: publications
      title: "PUBLICATIONS"
      visible: false
    - key: extracurricular
      title: "EXTRACURRICULAR"
      visible: false
```

`backend/templates/gazette/meta.yaml`
```yaml
defaults:
  layout:
    density: compact
    font_scale: small
  personal:
    link_display: label
  sections:
    - key: summary
      title: "SUMMARY"
      visible: true
    - key: education
      title: "EDUCATION"
      visible: true
    - key: experience
      title: "EXPERIENCE"
      visible: true
    - key: publications
      title: "PUBLICATIONS"
      visible: true
    - key: awards
      title: "AWARDS"
      visible: true
    - key: languages
      title: "LANGUAGES"
      visible: true
    - key: projects
      title: "PROJECTS"
      visible: false
    - key: skills
      title: "SKILLS"
      visible: false
    - key: certifications
      title: "CERTIFICATIONS"
      visible: false
    - key: extracurricular
      title: "EXTRACURRICULAR"
      visible: false
```

`backend/templates/heritage/meta.yaml`
```yaml
defaults:
  layout:
    density: balanced
    font_scale: normal
  personal:
    link_display: label
  sections:
    - key: summary
      title: "SUMMARY"
      visible: true
    - key: experience
      title: "EXPERIENCE"
      visible: true
    - key: education
      title: "EDUCATION"
      visible: true
    - key: skills
      title: "SKILLS"
      visible: true
    - key: projects
      title: "PROJECTS"
      visible: true
    - key: certifications
      title: "CERTIFICATIONS"
      visible: false
    - key: publications
      title: "PUBLICATIONS"
      visible: false
    - key: languages
      title: "LANGUAGES"
      visible: false
    - key: awards
      title: "AWARDS"
      visible: false
    - key: extracurricular
      title: "EXTRACURRICULAR"
      visible: false
```

`backend/templates/hipster/meta.yaml`
```yaml
defaults:
  layout:
    density: balanced
    font_scale: normal
  personal:
    link_display: label
  sections:
    - key: summary
      title: "SUMMARY"
      visible: true
    - key: experience
      title: "EXPERIENCE"
      visible: true
    - key: projects
      title: "PROJECTS"
      visible: true
    - key: skills
      title: "SKILLS"
      visible: true
    - key: awards
      title: "AWARDS"
      visible: true
    - key: education
      title: "EDUCATION"
      visible: true
    - key: publications
      title: "PUBLICATIONS"
      visible: false
    - key: languages
      title: "LANGUAGES"
      visible: false
    - key: certifications
      title: "CERTIFICATIONS"
      visible: false
    - key: extracurricular
      title: "EXTRACURRICULAR"
      visible: false
```

`backend/templates/modern-startup/meta.yaml`
```yaml
defaults:
  layout:
    density: balanced
    font_scale: normal
  personal:
    link_display: both
  sections:
    - key: summary
      title: "SUMMARY"
      visible: true
    - key: experience
      title: "EXPERIENCE"
      visible: true
    - key: projects
      title: "PROJECTS"
      visible: true
    - key: skills
      title: "SKILLS"
      visible: true
    - key: education
      title: "EDUCATION"
      visible: true
    - key: awards
      title: "AWARDS"
      visible: false
    - key: certifications
      title: "CERTIFICATIONS"
      visible: false
    - key: publications
      title: "PUBLICATIONS"
      visible: false
    - key: languages
      title: "LANGUAGES"
      visible: false
    - key: extracurricular
      title: "EXTRACURRICULAR"
      visible: false
```

`backend/templates/resume-tech/meta.yaml`
```yaml
defaults:
  layout:
    density: compact
    font_scale: small
  personal:
    link_display: both
  sections:
    - key: summary
      title: "SUMMARY"
      visible: true
    - key: experience
      title: "EXPERIENCE"
      visible: true
    - key: projects
      title: "PROJECTS"
      visible: true
    - key: skills
      title: "SKILLS"
      visible: true
    - key: education
      title: "EDUCATION"
      visible: true
    - key: certifications
      title: "CERTIFICATIONS"
      visible: true
    - key: awards
      title: "AWARDS"
      visible: false
    - key: publications
      title: "PUBLICATIONS"
      visible: false
    - key: languages
      title: "LANGUAGES"
      visible: false
    - key: extracurricular
      title: "EXTRACURRICULAR"
      visible: false
```

`backend/templates/sidebar-minimal/meta.yaml`
```yaml
defaults:
  layout:
    density: balanced
    font_scale: normal
  personal:
    link_display: label
  sections:
    - key: summary
      title: "SUMMARY"
      visible: true
    - key: experience
      title: "EXPERIENCE"
      visible: true
    - key: skills
      title: "SKILLS"
      visible: true
    - key: projects
      title: "PROJECTS"
      visible: true
    - key: education
      title: "EDUCATION"
      visible: true
    - key: certifications
      title: "CERTIFICATIONS"
      visible: false
    - key: awards
      title: "AWARDS"
      visible: false
    - key: languages
      title: "LANGUAGES"
      visible: false
    - key: publications
      title: "PUBLICATIONS"
      visible: false
    - key: extracurricular
      title: "EXTRACURRICULAR"
      visible: false
```

`backend/templates/split-header/meta.yaml`
```yaml
defaults:
  layout:
    density: balanced
    font_scale: normal
  personal:
    link_display: label
  sections:
    - key: summary
      title: "SUMMARY"
      visible: true
    - key: experience
      title: "EXPERIENCE"
      visible: true
    - key: projects
      title: "PROJECTS"
      visible: true
    - key: skills
      title: "SKILLS"
      visible: true
    - key: awards
      title: "AWARDS"
      visible: true
    - key: education
      title: "EDUCATION"
      visible: true
    - key: publications
      title: "PUBLICATIONS"
      visible: false
    - key: certifications
      title: "CERTIFICATIONS"
      visible: false
    - key: languages
      title: "LANGUAGES"
      visible: false
    - key: extracurricular
      title: "EXTRACURRICULAR"
      visible: false
```

`backend/templates/timeline-vertical/meta.yaml`
```yaml
defaults:
  layout:
    density: balanced
    font_scale: normal
  personal:
    link_display: label
  sections:
    - key: summary
      title: "SUMMARY"
      visible: true
    - key: experience
      title: "EXPERIENCE"
      visible: true
    - key: projects
      title: "PROJECTS"
      visible: true
    - key: education
      title: "EDUCATION"
      visible: true
    - key: skills
      title: "SKILLS"
      visible: true
    - key: publications
      title: "PUBLICATIONS"
      visible: false
    - key: awards
      title: "AWARDS"
      visible: false
    - key: certifications
      title: "CERTIFICATIONS"
      visible: false
    - key: languages
      title: "LANGUAGES"
      visible: false
    - key: extracurricular
      title: "EXTRACURRICULAR"
      visible: false
```

- [ ] **Step 3: Run the metadata coverage tests**

Run:

```bash
pytest tests/test_api.py::test_templates_meta_includes_defaults_block tests/test_template_meta_defaults.py -q
```

Expected:
- both tests pass

- [ ] **Step 4: Commit the populated template defaults**

```bash
git add backend/templates/*/meta.yaml tests/test_api.py tests/test_template_meta_defaults.py
git commit -m "feat: add default settings to template metadata"
```

---

### Task 6: Run the final verification suite

**Files:**
- No code changes

- [ ] **Step 1: Run backend verification**

```bash
pytest tests/test_api.py::test_templates_meta_has_display_name tests/test_api.py::test_templates_meta_includes_defaults_block tests/test_template_meta_defaults.py -q
```

Expected:
- all selected backend tests pass

- [ ] **Step 2: Run frontend verification**

```bash
node --test tests/test_settings_sync_tab_switch.js tests/test_sections_chip_css.js tests/test_template_default_reset.js
```

Expected:
- all frontend Node tests pass

- [ ] **Step 3: Run syntax checks**

```bash
node --check frontend/settings-engine.js
node --check frontend/settings-sync.js
node --check frontend/templates.js
```

Expected:
- all commands exit cleanly with no output
