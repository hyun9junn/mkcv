# Settings YAML Value Autocomplete and Link Display Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add value-only `settings.yaml` autocomplete with strict resume/settings tab isolation, while normalizing link-display settings to an explicit `default_link_display` schema.

**Architecture:** Keep the shared CodeMirror editor, but make autocomplete routing strictly tab-aware so only one YAML mode is active at a time. Normalize the saved settings shape in `frontend/settings-engine.js` and template `meta.yaml` defaults so the UI, disk format, and template resets all use the same explicit `default | label | url | both` field-style model. Preserve existing renderer/export APIs by continuing to store the resolved global style in `app.state.link_display` even though the saved settings key becomes `personal.default_link_display`.

**Tech Stack:** Vanilla JS, CodeMirror 5, js-yaml, Node `node:test`, Python `pytest`, FastAPI template metadata loader

---

## File Map

- `frontend/settings-engine.js`
  - Canonical source of truth for the `settings.yaml` schema, serialization, parse-time compatibility, and template-default normalization.
- `frontend/settings-sync.js`
  - Applies parsed settings to app state; should continue exposing resolved `app.state.link_display` while reading `settings.personal.default_link_display`.
- `frontend/contact-ui.js`
  - Contact flyout behavior; should switch from deletion-based inheritance to explicit `link_display: default`.
- `frontend/yaml-autocomplete.js`
  - Shared autocomplete module; needs a settings-specific value-suggestion path and tab-aware routing.
- `frontend/editor-adapter.js`
  - Shared Tab handler and CodeMirror wrapper; needs a `closeHint()` method for tab-switch cleanup.
- `frontend/index.html`
  - Contact flyout label text; rename the global control label to `Default link display`.
- `backend/main.py`
  - Validates `meta.yaml` defaults; must accept the renamed global key and require explicit link-field styles.
- `backend/templates/*/meta.yaml`
  - All template defaults must move to the canonical explicit contact-settings shape.
- `settings.yaml`
  - Sample saved settings file; should match the new canonical emitted format exactly.
- `tests/test_contact_settings_engine.js`
  - Unit tests for parse/serialize/normalize behavior in `frontend/settings-engine.js`.
- `tests/test_contact_ui.js`
  - Contact flyout interaction tests.
- `tests/test_template_default_reset.js`
  - JS regression tests for template-default normalization and settings reset behavior.
- `tests/test_settings_sync_tab_switch.js`
  - JS regression tests for settings-sync application order and tab-switch behavior.
- `tests/test_template_meta_defaults.py`
  - Backend metadata coverage/validation tests.
- `tests/test_api.py`
  - API-level coverage that `/api/templates` exposes the canonical defaults block.
- `tests/test_yaml_autocomplete.js`
  - New JS unit tests for settings autocomplete behavior and resume/settings isolation.

---

### Task 1: Canonicalize the Frontend Settings Schema

**Files:**
- Modify: `frontend/settings-engine.js:35-277`
- Modify: `settings.yaml:1-62`
- Test: `tests/test_contact_settings_engine.js`

- [ ] **Step 1: Write the failing settings-engine tests**

Replace the existing contact-settings assertions in `tests/test_contact_settings_engine.js` with the canonical-schema expectations below:

```javascript
test('DEFAULT_SETTINGS uses default_link_display and explicit default for link fields', () => {
  const { DEFAULT_SETTINGS, LINK_FIELDS } = loadSettingsHelpers();
  assert.equal(DEFAULT_SETTINGS.personal.default_link_display, 'label');

  for (const field of DEFAULT_SETTINGS.personal.fields) {
    if (LINK_FIELDS.has(field.key)) {
      assert.equal(field.link_display, 'default');
    } else {
      assert.equal('link_display' in field, false);
    }
  }
});

test('parseSettings accepts legacy personal.link_display and normalizes missing link-field styles', () => {
  const { parseSettings } = loadSettingsHelpers();
  const yaml = [
    'template: classic',
    'layout:',
    '  density: balanced',
    '  font_scale: normal',
    'personal:',
    '  link_display: both',
    '  fields:',
    '    - key: website',
    '      visible: true',
    '    - key: github',
    '      visible: true',
    '      link_display: url',
    ''
  ].join('\n');

  const result = parseSettings(yaml);
  assert.equal(result.errors.length, 0);
  assert.equal(result.value.personal.default_link_display, 'both');
  assert.equal(result.value.personal.fields.find((field) => field.key === 'website').link_display, 'default');
  assert.equal(result.value.personal.fields.find((field) => field.key === 'github').link_display, 'url');
});

test('settingsToYaml emits default_link_display and explicit link_display for every link field', () => {
  const { settingsToYaml, DEFAULT_SETTINGS } = loadSettingsHelpers();
  const yaml = settingsToYaml(DEFAULT_SETTINGS);

  assert.match(yaml, /default_link_display: label/);
  assert.match(yaml, /- key: website\\n\\s+visible: true\\n\\s+link_display: default/);
  assert.match(yaml, /- key: linkedin\\n\\s+visible: true\\n\\s+link_display: default/);
  assert.match(yaml, /- key: github\\n\\s+visible: true\\n\\s+link_display: default/);
  assert.match(yaml, /- key: huggingface\\n\\s+visible: true\\n\\s+link_display: default/);
});
```

- [ ] **Step 2: Run the settings-engine test to verify it fails**

Run: `node --test tests/test_contact_settings_engine.js`

Expected: FAIL because `DEFAULT_SETTINGS.personal.default_link_display` does not exist yet, legacy parsing still writes `personal.link_display`, and `settingsToYaml()` still omits link-field `link_display` lines.

- [ ] **Step 3: Implement the canonical schema in `frontend/settings-engine.js`**

Make the constant, default, normalization, and parse/serialize changes below:

```javascript
const VALID_GLOBAL_LINK_DISPLAY = ['label', 'url', 'both'];
const VALID_FIELD_LINK_DISPLAY = ['default', 'label', 'url', 'both'];

function _defaultPersonalField(key) {
  if (LINK_FIELDS.has(key)) return { key, visible: true, link_display: 'default' };
  return { key, visible: true };
}

function _defaultPersonalFields() {
  return PERSONAL_FIELD_CATALOG.map((field) => _defaultPersonalField(field.key));
}

function _normalizeFieldLinkDisplay(key, rawValue) {
  if (!LINK_FIELDS.has(key)) return undefined;
  if (VALID_FIELD_LINK_DISPLAY.includes(rawValue)) return rawValue;
  if (VALID_GLOBAL_LINK_DISPLAY.includes(rawValue)) return rawValue;
  return 'default';
}

const DEFAULT_SETTINGS = {
  template: 'classic',
  layout: { density: 'balanced', font_scale: 'normal' },
  personal: {
    default_link_display: 'label',
    fields: _defaultPersonalFields(),
  },
  sections: [
    { key: 'summary',         title: 'SUMMARY',         visible: true  },
    { key: 'experience',      title: 'EXPERIENCE',      visible: true  },
    { key: 'education',       title: 'EDUCATION',       visible: true  },
    { key: 'skills',          title: 'SKILLS',          visible: true  },
    { key: 'projects',        title: 'PROJECTS',        visible: true  },
    { key: 'certifications',  title: 'CERTIFICATIONS',  visible: false },
    { key: 'publications',    title: 'PUBLICATIONS',    visible: false },
    { key: 'languages',       title: 'LANGUAGES',       visible: false },
    { key: 'awards',          title: 'AWARDS',          visible: false },
    { key: 'extracurricular', title: 'EXTRACURRICULAR', visible: false },
  ],
};

function settingsToYaml(s) {
  const lines = [
    '# settings.yaml — layout & section state',
    '# auto-synced with toolbar controls; edit either side',
    '',
    `template: ${s.template}`,
    '',
    'layout:',
    `  density:    ${s.layout.density}        # comfortable | balanced | compact`,
    `  font_scale: ${s.layout.font_scale}          # small | normal | large`,
    '',
    'personal:',
    `  default_link_display: ${s.personal.default_link_display}  # label | url | both`,
  ];

  if (Array.isArray(s.personal.fields) && s.personal.fields.length > 0) {
    lines.push('  fields:');
    for (const f of s.personal.fields) {
      lines.push(`    - key: ${f.key}`);
      lines.push(`      visible: ${f.visible}`);
      if (LINK_FIELDS.has(f.key)) {
        lines.push(`      link_display: ${_normalizeFieldLinkDisplay(f.key, f.link_display)}`);
      }
    }
  }

  lines.push('');
  lines.push('sections:');
  for (const sec of s.sections) {
    lines.push(`  - key: ${sec.key}`);
    lines.push(`    title: ${JSON.stringify(sec.title)}`);
    lines.push(`    visible: ${sec.visible}`);
  }
  return lines.join('\n') + '\n';
}

function normalizePersonalFields(rawFields) {
  if (!Array.isArray(rawFields)) return _defaultPersonalFields();

  const seen = new Set();
  const result = [];
  for (const item of rawFields) {
    if (!item || typeof item !== 'object' || item.key == null) continue;
    const key = String(item.key);
    if (seen.has(key) || !KNOWN_PERSONAL_KEYS.has(key)) continue;
    seen.add(key);

    const entry = { key, visible: item.visible !== false };
    if (LINK_FIELDS.has(key)) {
      entry.link_display = _normalizeFieldLinkDisplay(key, item.link_display);
    }
    result.push(entry);
  }

  for (const field of PERSONAL_FIELD_CATALOG) {
    if (!seen.has(field.key)) result.push(_defaultPersonalField(field.key));
  }
  return result;
}

function normalizeTemplateDefaults(rawDefaults, currentTemplate = DEFAULT_SETTINGS.template) {
  const normalized = _clone(DEFAULT_SETTINGS);
  normalized.template = currentTemplate || DEFAULT_SETTINGS.template;

  if (!rawDefaults || typeof rawDefaults !== 'object') return normalized;

  const layout = rawDefaults.layout;
  if (layout && typeof layout === 'object') {
    if (VALID_DENSITY.includes(layout.density)) normalized.layout.density = layout.density;
    if (VALID_FONT.includes(layout.font_scale)) normalized.layout.font_scale = layout.font_scale;
  }

  const personal = rawDefaults.personal;
  if (personal && typeof personal === 'object') {
    const rawDefault = personal.default_link_display ?? personal.link_display;
    if (VALID_GLOBAL_LINK_DISPLAY.includes(rawDefault)) {
      normalized.personal.default_link_display = rawDefault;
    }
    if (Array.isArray(personal.fields)) {
      normalized.personal.fields = normalizePersonalFields(personal.fields);
    }
  }

  if (Array.isArray(rawDefaults.sections)) {
    const seen = new Set();
    const sections = [];
    for (const item of rawDefaults.sections) {
      if (!item || typeof item !== 'object' || item.key == null) continue;
      const key = String(item.key);
      if (seen.has(key) || !KNOWN_KEYS.has(key)) continue;
      seen.add(key);
      const fallback = _getDefaultSection(key);
      sections.push({
        key,
        title: item.title != null ? String(item.title) : fallback.title,
        visible: item.visible !== false,
      });
    }
    if (sections.length > 0) {
      normalized.sections = sections.concat(
        DEFAULT_SETTINGS.sections
          .filter((section) => !seen.has(section.key))
          .map((section) => _clone(section))
      );
    }
  }

  return normalized;
}

function parseSettings(yaml) {
  const errors = [], warnings = [];
  let parsed;
  try {
    parsed = jsyaml.load(yaml);
  } catch (e) {
    errors.push({ msg: e.message || 'YAML parse error', line: e.mark?.line ?? null });
    return { value: null, errors, warnings };
  }
  if (!parsed || typeof parsed !== 'object') {
    errors.push({ msg: 'Settings must be a YAML mapping', line: null });
    return { value: null, errors, warnings };
  }

  const out = _clone(DEFAULT_SETTINGS);

  if (parsed.template != null) {
    out.template = String(parsed.template);
    if (!VALID_TPL.includes(out.template)) {
      warnings.push({ msg: `unknown template "${out.template}"`, line: null });
    }
  }

  if (parsed.layout && typeof parsed.layout === 'object') {
    if (parsed.layout.density != null) {
      out.layout.density = String(parsed.layout.density);
      if (!VALID_DENSITY.includes(out.layout.density)) {
        warnings.push({ msg: `unknown density "${out.layout.density}" — using balanced`, line: null });
        out.layout.density = 'balanced';
      }
    }
    if (parsed.layout.font_scale != null) {
      out.layout.font_scale = String(parsed.layout.font_scale);
      if (!VALID_FONT.includes(out.layout.font_scale)) {
        warnings.push({ msg: `unknown font_scale "${out.layout.font_scale}" — using normal`, line: null });
        out.layout.font_scale = 'normal';
      }
    }
  }

  if (parsed.personal && typeof parsed.personal === 'object') {
    const rawDefault = parsed.personal.default_link_display ?? parsed.personal.link_display;
    if (rawDefault != null) {
      out.personal.default_link_display = String(rawDefault);
      if (!VALID_GLOBAL_LINK_DISPLAY.includes(out.personal.default_link_display)) {
        warnings.push({ msg: `unknown default_link_display "${out.personal.default_link_display}" — using label`, line: null });
        out.personal.default_link_display = 'label';
      }
    }
    out.personal.fields = normalizePersonalFields(
      Array.isArray(parsed.personal.fields) ? parsed.personal.fields : undefined
    );
  }

  if (Array.isArray(parsed.sections)) {
    const seen = new Set();
    const sections = [];
    for (const item of parsed.sections) {
      if (!item || typeof item !== 'object' || !item.key) {
        warnings.push({ msg: 'section entry missing `key`', line: null });
        continue;
      }
      const key = String(item.key);
      if (seen.has(key)) {
        warnings.push({ msg: `duplicate section "${key}"`, line: null });
        continue;
      }
      seen.add(key);
      if (!KNOWN_KEYS.has(key)) warnings.push({ msg: `unknown section "${key}"`, line: null });
      sections.push({
        key,
        title: item.title != null ? String(item.title) : (SECTION_CATALOG.find((s) => s.key === key)?.defaultTitle ?? key.toUpperCase()),
        visible: item.visible !== false,
      });
    }
    if (sections.length) out.sections = sections;
  }

  return { value: out, errors, warnings };
}
```

- [ ] **Step 4: Update the checked-in sample `settings.yaml` to the canonical saved shape**

Replace the `personal:` block in `settings.yaml` with the explicit format below:

```yaml
personal:
  default_link_display: both  # label | url | both
  fields:
    - key: name
      visible: true
    - key: email
      visible: true
    - key: phone
      visible: true
    - key: location
      visible: true
    - key: website
      visible: true
      link_display: default
    - key: linkedin
      visible: true
      link_display: url
    - key: github
      visible: true
      link_display: url
    - key: huggingface
      visible: true
      link_display: default
```

- [ ] **Step 5: Run the settings-engine test suite to verify it passes**

Run: `node --test tests/test_contact_settings_engine.js`

Expected: PASS

- [ ] **Step 6: Commit the schema helper changes**

```bash
git add frontend/settings-engine.js settings.yaml tests/test_contact_settings_engine.js
git commit -m "feat: canonicalize settings link display schema"
```

### Task 2: Canonicalize Template Defaults and Backend Validation

**Files:**
- Modify: `backend/main.py:85-140`
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
- Modify: `tests/test_template_meta_defaults.py:51-219`
- Modify: `tests/test_api.py:267-277`

- [ ] **Step 1: Write the failing backend metadata tests**

Update `tests/test_template_meta_defaults.py` and `tests/test_api.py` to assert the renamed global key and explicit link-field styles:

```python
def test_every_template_meta_has_complete_defaults_block():
    for meta_path in sorted(TEMPLATES_DIR.glob("*/meta.yaml")):
        data = yaml.safe_load(meta_path.read_text()) or {}
        defaults = data["defaults"]

        assert defaults["layout"]["density"] in {"comfortable", "balanced", "compact"}, meta_path
        assert defaults["layout"]["font_scale"] in {"small", "normal", "large"}, meta_path
        assert defaults["personal"]["default_link_display"] in {"label", "url", "both"}, meta_path
        personal_fields = defaults["personal"]["fields"]
        assert [field["key"] for field in personal_fields] == EXPECTED_PERSONAL_KEYS, meta_path

        for field in personal_fields:
            assert isinstance(field["visible"], bool), meta_path
            if field["key"] in LINK_PERSONAL_KEYS:
                assert field["link_display"] in {"default", "label", "url", "both"}, meta_path
            else:
                assert "link_display" not in field, meta_path

        sections = defaults["sections"]
        keys = [section["key"] for section in sections]
        assert len(keys) == len(EXPECTED_KEYS), meta_path
        assert set(keys) == EXPECTED_KEYS, meta_path
        assert keys == EXPECTED_SECTION_ORDERS[meta_path.parent.name], meta_path

        for section in sections:
            assert isinstance(section["title"], str) and section["title"].strip(), meta_path
            assert isinstance(section["visible"], bool), meta_path
```

Add one invalid-defaults case to the parametrized failure list so the old global key is rejected:

```python
(
    "  layout:\n"
    "    density: balanced\n"
    "    font_scale: normal\n"
    "  personal:\n"
    "    link_display: label\n"
    "    fields:\n"
    "      - key: name\n"
    "        visible: true\n"
    "  sections:\n"
    "    - key: summary\n"
    "      title: SUMMARY\n"
    "      visible: true\n"
),
```

Update the API assertion in `tests/test_api.py`:

```python
defaults = data["meta"]["classic"]["defaults"]
assert defaults["layout"]["density"] in {"comfortable", "balanced", "compact"}
assert defaults["layout"]["font_scale"] in {"small", "normal", "large"}
assert defaults["personal"]["default_link_display"] in {"label", "url", "both"}
assert any(section["key"] == "summary" for section in defaults["sections"])
```

- [ ] **Step 2: Run the backend metadata tests to verify they fail**

Run: `pytest tests/test_template_meta_defaults.py tests/test_api.py -q`

Expected: FAIL because the backend validator still looks for `personal.link_display` and the template fixtures still omit `link_display` on inherited link fields.

- [ ] **Step 3: Update `_normalize_template_defaults()` in `backend/main.py`**

Replace the personal-default validation block with the explicit canonical rules:

```python
_FIELD_LINK_DISPLAYS = {"default", "label", "url", "both"}


def _normalize_template_defaults(defaults: object) -> dict:
    if not isinstance(defaults, dict):
        return {}

    layout = defaults.get("layout")
    personal = defaults.get("personal")
    sections = defaults.get("sections")
    if not isinstance(layout, dict) or not isinstance(personal, dict) or not isinstance(sections, list):
        return {}
    if layout.get("density") not in _VALID_DENSITIES:
        return {}
    if layout.get("font_scale") not in _VALID_FONT_SCALES:
        return {}
    if personal.get("default_link_display") not in _VALID_LINK_DISPLAYS:
        return {}

    personal_fields = personal.get("fields")
    if not isinstance(personal_fields, list):
        return {}

    personal_keys = []
    for field in personal_fields:
        if not isinstance(field, dict):
            return {}
        key = field.get("key")
        if not isinstance(key, str):
            return {}
        if not isinstance(field.get("visible"), bool):
            return {}

        link_display = field.get("link_display")
        if key in _LINK_PERSONAL_KEYS:
            if link_display not in _FIELD_LINK_DISPLAYS:
                return {}
        elif link_display is not None:
            return {}

        personal_keys.append(key)

    if personal_keys != _PERSONAL_FIELD_KEYS:
        return {}

    section_keys = []
    for section in sections:
        if not isinstance(section, dict):
            return {}
        key = section.get("key")
        if not isinstance(key, str):
            return {}
        if not isinstance(section.get("title"), str):
            return {}
        if not isinstance(section.get("visible"), bool):
            return {}
        if not section["title"].strip():
            return {}
        section_keys.append(key)

    if len(section_keys) != len(_BUILTIN_SECTION_KEYS):
        return {}
    if set(section_keys) != _BUILTIN_SECTION_KEYS:
        return {}

    return defaults
```

- [ ] **Step 4: Rewrite each template `defaults.personal` block to the explicit canonical YAML**

Use these exact patterns.

For `backend/templates/classic/meta.yaml`, use:

```yaml
  personal:
    default_link_display: label
    fields:
      - key: name
        visible: true
      - key: email
        visible: true
      - key: phone
        visible: true
      - key: location
        visible: true
      - key: website
        visible: true
        link_display: default
      - key: linkedin
        visible: true
        link_display: default
      - key: github
        visible: true
        link_display: url
      - key: huggingface
        visible: true
        link_display: default
```

For `backend/templates/brutalist-mono/meta.yaml`, `backend/templates/modern-startup/meta.yaml`, and `backend/templates/resume-tech/meta.yaml`, use:

```yaml
  personal:
    default_link_display: both
    fields:
      - key: name
        visible: true
      - key: email
        visible: true
      - key: phone
        visible: true
      - key: location
        visible: true
      - key: website
        visible: true
        link_display: default
      - key: linkedin
        visible: true
        link_display: default
      - key: github
        visible: true
        link_display: default
      - key: huggingface
        visible: true
        link_display: default
```

For every remaining template meta file in this task, use the same block as above but with `default_link_display: label`.

- [ ] **Step 5: Run the backend metadata tests to verify they pass**

Run: `pytest tests/test_template_meta_defaults.py tests/test_api.py -q`

Expected: PASS

- [ ] **Step 6: Commit the backend defaults normalization**

```bash
git add backend/main.py backend/templates/*/meta.yaml tests/test_template_meta_defaults.py tests/test_api.py
git commit -m "feat: normalize template contact defaults"
```

### Task 3: Update Settings Consumers and the Contact Flyout

**Files:**
- Modify: `frontend/settings-sync.js:99-140`
- Modify: `frontend/contact-ui.js:48-244`
- Modify: `frontend/index.html:997-1005`
- Modify: `tests/test_contact_ui.js:250-290`
- Modify: `tests/test_template_default_reset.js:180-460`
- Modify: `tests/test_settings_sync_tab_switch.js:356-430`

- [ ] **Step 1: Write the failing UI and settings-sync regression tests**

Add these tests to `tests/test_contact_ui.js`:

```javascript
test('clicking the global contact segment writes personal.default_link_display', async () => {
  const { context, domReadyCallbacks, elements } = createContext();
  await bootContactUI(context, domReadyCallbacks);

  elements.get('contact-pill').dispatchEvent('click');
  const urlSpan = elements.get('contact-global-seg').children[1];
  urlSpan.dispatchEvent('click');

  assert.equal(context.settingsSync.getSettings().personal.default_link_display, 'url');
});

test('clearing a link override writes explicit default instead of deleting link_display', async () => {
  const { context, domReadyCallbacks, elements } = createContext();
  context.settingsSync.getSettings().personal.fields.find((field) => field.key === 'github').link_display = 'label';
  await bootContactUI(context, domReadyCallbacks);

  elements.get('contact-pill').dispatchEvent('click');
  const body = elements.get('contact-fields-body');
  const githubRow = body.children[7];
  const overridePill = githubRow.children[2].children[0];
  const clearButton = overridePill.children[1];
  clearButton.dispatchEvent('click');

  assert.equal(
    context.settingsSync.getSettings().personal.fields.find((field) => field.key === 'github').link_display,
    'default'
  );
});
```

Update the mock/default settings payloads in both `tests/test_template_default_reset.js` and `tests/test_settings_sync_tab_switch.js` from:

```javascript
personal: {
  link_display: 'label',
  fields: [
    { key: 'name', visible: true },
    { key: 'email', visible: true },
    { key: 'phone', visible: true },
    { key: 'location', visible: true },
    { key: 'website', visible: true },
    { key: 'linkedin', visible: true },
    { key: 'github', visible: true },
    { key: 'huggingface', visible: true },
  ],
}
```

to:

```javascript
personal: {
  default_link_display: 'label',
  fields: [
    { key: 'name', visible: true },
    { key: 'email', visible: true },
    { key: 'phone', visible: true },
    { key: 'location', visible: true },
    { key: 'website', visible: true, link_display: 'default' },
    { key: 'linkedin', visible: true, link_display: 'default' },
    { key: 'github', visible: true, link_display: 'default' },
    { key: 'huggingface', visible: true, link_display: 'default' },
  ],
}
```

Keep real overrides explicit. For example, preserve these when they occur in the tests:

```javascript
{ key: 'website', visible: true, link_display: 'both' }
{ key: 'github', visible: false, link_display: 'label' }
```

- [ ] **Step 2: Run the affected JS regressions to verify they fail**

Run: `node --test tests/test_contact_ui.js tests/test_template_default_reset.js tests/test_settings_sync_tab_switch.js`

Expected: FAIL because `contact-ui.js` and `settings-sync.js` still read `personal.link_display`, and clearing overrides still deletes `link_display`.

- [ ] **Step 3: Update `frontend/settings-sync.js`, `frontend/contact-ui.js`, and `frontend/index.html`**

Apply these concrete changes.

In `frontend/settings-sync.js`, change the toolbar application to continue filling `app.state.link_display`, but read the canonical saved key:

```javascript
function _applyToToolbar(settings) {
  document.getElementById('density-group')?.querySelectorAll('button[data-value]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === settings.layout.density);
  });
  document.getElementById('font-scale-group')?.querySelectorAll('button[data-value]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === settings.layout.font_scale);
  });
  app.setState({
    density: settings.layout.density,
    font_scale: settings.layout.font_scale,
    link_display: settings.personal?.default_link_display ?? 'label',
    personal_fields: settings.personal?.fields ?? [],
  });
}
```

In `frontend/contact-ui.js`, convert all inherit/reset behavior to explicit `default`:

```javascript
function _buildFieldRow(fieldDef, fieldSettings, value, globalDefault) {
  const { key, locked } = fieldDef;
  const visible = fieldSettings.visible;
  const isLink = LINK_FIELDS.has(key);
  const style = isLink ? (fieldSettings.link_display ?? 'default') : null;
  const pickerOpen = _openPickerKey === key;

  const row = document.createElement('div');
  row.className = 'field-row' +
    (locked ? ' locked-row' : '') +
    (!visible && !locked ? ' hidden-row' : '');
  row.title = value || '';

  const tog = document.createElement('div');
  tog.className = 'f-toggle' + (!visible ? ' off' : '') + (locked ? ' locked' : '');
  if (!locked) {
    tog.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!window.settingsSync) return;
      settingsSync.updateFromToolbar((s) => {
        const f = s.personal.fields.find((field) => field.key === key);
        if (f) f.visible = !f.visible;
      }, { applyToolbar: true, applyContact: true });
    });
  }
  row.appendChild(tog);

  const keyEl = document.createElement('span');
  keyEl.className = 'f-key';
  keyEl.textContent = key;
  keyEl.title = value || '';
  row.appendChild(keyEl);

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
        { val: 'default', label: 'default', cls: 'p-inherit' },
        { val: 'label', label: 'label', cls: '' },
        { val: 'url', label: 'url', cls: '' },
        { val: 'both', label: 'both', cls: '' },
      ];
      for (const opt of opts) {
        const span = document.createElement('span');
        span.textContent = opt.label;
        if (opt.cls) span.className = opt.cls;
        span.addEventListener('click', (e) => {
          e.stopPropagation();
          _openPickerKey = null;
          if (!window.settingsSync) return;
          settingsSync.updateFromToolbar((s) => {
            const f = s.personal.fields.find((field) => field.key === key);
            if (!f) return;
            f.link_display = opt.val;
          }, { applyToolbar: true, applyContact: true });
        });
        picker.appendChild(span);
      }
      ctrl.appendChild(picker);
    } else if (style !== 'default') {
      const pill = document.createElement('div');
      pill.className = 'f-override';
      const txt = document.createTextNode(style + ' ');
      const x = document.createElement('span');
      x.className = 'f-override-x';
      x.textContent = '×';
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!window.settingsSync) return;
        settingsSync.updateFromToolbar((s) => {
          const f = s.personal.fields.find((field) => field.key === key);
          if (f) f.link_display = 'default';
        }, { applyToolbar: true, applyContact: true });
      });
      pill.appendChild(txt);
      pill.appendChild(x);
      ctrl.appendChild(pill);
    } else {
      const tag = document.createElement('span');
      tag.className = 'f-inherit';
      tag.textContent = `default (${globalDefault})`;
      tag.addEventListener('click', (e) => {
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
  const globalDefault = settings.personal?.default_link_display ?? 'label';
  const personalValues = _getPersonalValues();

  const seg = document.getElementById('contact-global-seg');
  if (seg) {
    seg.querySelectorAll('span[data-value]').forEach((span) => {
      span.classList.toggle('active', span.dataset.value === globalDefault);
    });
  }

  _updatePillBadge(settings);
  body.innerHTML = '';

  for (const fieldDef of PERSONAL_FIELD_CATALOG) {
    const fieldSettings = fields.find((f) => f.key === fieldDef.key)
      ?? (LINK_FIELDS.has(fieldDef.key)
        ? { key: fieldDef.key, visible: true, link_display: 'default' }
        : { key: fieldDef.key, visible: true });
    const value = personalValues[fieldDef.key] ?? '';
    const row = _buildFieldRow(fieldDef, fieldSettings, value, globalDefault);
    body.appendChild(row);
    if (fieldDef.key === 'name') {
      const divider = document.createElement('div');
      divider.className = 'field-divider';
      body.appendChild(divider);
    }
  }
}
```

Update the global segment click handler in the same file:

```javascript
settingsSync.updateFromToolbar(
  (s) => { s.personal.default_link_display = span.dataset.value; },
  { applyToolbar: true, applyContact: true }
);
```

Update the flyout header label in `frontend/index.html`:

```html
<span class="flyout-global-label">Default link display</span>
```

- [ ] **Step 4: Run the UI/settings-sync regression tests to verify they pass**

Run: `node --test tests/test_contact_ui.js tests/test_template_default_reset.js tests/test_settings_sync_tab_switch.js`

Expected: PASS

- [ ] **Step 5: Commit the consumer and UI changes**

```bash
git add frontend/settings-sync.js frontend/contact-ui.js frontend/index.html tests/test_contact_ui.js tests/test_template_default_reset.js tests/test_settings_sync_tab_switch.js
git commit -m "feat: make contact link display settings explicit"
```

### Task 4: Add Settings Value Autocomplete and Tab Isolation

**Files:**
- Modify: `frontend/yaml-autocomplete.js:1-493`
- Modify: `frontend/editor-adapter.js:1-224`
- Modify: `frontend/settings-sync.js:309-330`
- Create: `tests/test_yaml_autocomplete.js`
- Modify: `tests/test_settings_sync_tab_switch.js:24-106`

- [ ] **Step 1: Create the failing autocomplete and tab-switch tests**

Create `tests/test_yaml_autocomplete.js` with this harness and assertions:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function bootAutocomplete(activeTab) {
  const context = {
    console,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    setTimeout,
    clearTimeout,
    window: null,
    sectionsState: { SECTION_DEFS: {} },
    SETTINGS_HELPERS: {
      VALID_TPL: ['classic', 'split-header', 'resume-tech'],
      VALID_DENSITY: ['comfortable', 'balanced', 'compact'],
      VALID_FONT: ['small', 'normal', 'large'],
      LINK_FIELDS: new Set(['website', 'linkedin', 'github', 'huggingface']),
    },
    settingsSync: { activeTab },
  };
  context.window = context;
  const source = fs.readFileSync('frontend/yaml-autocomplete.js', 'utf8');
  vm.runInNewContext(source, context, { filename: 'frontend/yaml-autocomplete.js' });
  return context;
}

function createEditor(lines, cursor) {
  return {
    state: { completionActive: null },
    getCursor() {
      return cursor;
    },
    getLine(line) {
      return lines[line];
    },
    lineCount() {
      return lines.length;
    },
    on() {},
    showHint() {},
  };
}

test('settings tab suggests enum values for default_link_display', () => {
  const context = bootAutocomplete('settings');
  const editor = createEditor(
    ['personal:', '  default_link_display: la'],
    { line: 1, ch: '  default_link_display: la'.length }
  );

  const hint = context.window.yamlHint(editor);
  assert.deepEqual(hint.list.map((item) => item.text), ['label']);
});

test('resume tab never shows settings suggestions', () => {
  const context = bootAutocomplete('resume');
  const editor = createEditor(
    ['personal:', '  default_link_display: la'],
    { line: 1, ch: '  default_link_display: la'.length }
  );

  assert.equal(context.window.yamlHint(editor), null);
});

test('settings tab never shows resume value helpers', () => {
  const context = bootAutocomplete('settings');
  const editor = createEditor(
    ['experience:', '  - start_date: 20'],
    { line: 1, ch: '  - start_date: 20'.length }
  );

  assert.equal(context.window.yamlHint(editor), null);
});

test('settings tab suggests true/false inside sections list items', () => {
  const context = bootAutocomplete('settings');
  const editor = createEditor(
    ['sections:', '  - key: summary', '    visible: t'],
    { line: 2, ch: '    visible: t'.length }
  );

  const hint = context.window.yamlHint(editor);
  assert.deepEqual(hint.list.map((item) => item.text), ['true']);
});
```

Extend the fake editor in `tests/test_settings_sync_tab_switch.js` so it exposes and counts `closeHint()` calls:

```javascript
const editorAdapter = {
  value: '',
  scrollLeft: 0,
  scrollTop: 0,
  closeHintCalls: 0,
  _suppressNextPreviewRefresh: false,
  setValue(str) {
    this.value = str;
    this.scrollLeft = 0;
    this.scrollTop = 0;
    for (const callback of editorChangeCallbacks) callback(str);
  },
  setValueSilently(str) {
    this.value = str;
    this.scrollLeft = 0;
    this.scrollTop = 0;
  },
  setValuePreserveScroll(str) {
    const { left, top } = this.getScrollInfo();
    this.value = str;
    for (const callback of editorChangeCallbacks) callback(str);
    this.scrollTo(left, top);
  },
  closeHint() {
    this.closeHintCalls += 1;
  },
  getScrollInfo() {
    return { left: this.scrollLeft, top: this.scrollTop };
  },
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
  onChange(callback) {
    editorChangeCallbacks.push(callback);
  },
};
```

Add one tab-switch assertion:

```javascript
test('switching tabs closes any open completion menu', async () => {
  const { context, domReadyCallbacks, elements } = createContext();
  await bootSettingsSync(context, domReadyCallbacks);

  elements.get('file-tab-settings').click();
  elements.get('file-tab-resume').click();

  assert.equal(context.window.editorAdapter.closeHintCalls, 2);
});
```

- [ ] **Step 2: Run the autocomplete-focused JS tests to verify they fail**

Run: `node --test tests/test_yaml_autocomplete.js tests/test_settings_sync_tab_switch.js`

Expected: FAIL because `yaml-autocomplete.js` only knows resume-mode logic, and tab switches do not close open hint widgets yet.

- [ ] **Step 3: Implement the tab-aware autocomplete router and hint cleanup**

In `frontend/yaml-autocomplete.js`, keep the existing resume logic but wrap it with a settings-specific path and a shared dispatcher:

```javascript
const SETTINGS_VALUE_SUGGESTIONS = {
  template: () => (window.SETTINGS_HELPERS?.VALID_TPL ?? []),
  'layout.density': () => (window.SETTINGS_HELPERS?.VALID_DENSITY ?? []),
  'layout.font_scale': () => (window.SETTINGS_HELPERS?.VALID_FONT ?? []),
  'personal.default_link_display': () => ['label', 'url', 'both'],
  'personal.fields.visible': () => ['true', 'false'],
  'personal.fields.link_display': () => ['default', 'label', 'url', 'both'],
  'sections.visible': () => ['true', 'false'],
};

function _activeTab() {
  return window.settingsSync?.activeTab ?? 'resume';
}

function _isResumeTab() {
  return _activeTab() === 'resume';
}

function _isSettingsTab() {
  return _activeTab() === 'settings';
}

function detectSettingsValueContext(editor) {
  try {
    const cursor = editor.getCursor();
    const lineText = editor.getLine(cursor.line);
    const textBeforeCursor = lineText.slice(0, cursor.ch);
    const match = textBeforeCursor.match(/^\s*(?:-\s+)?(\w[\w_]*):\s*["']?([\w-]*)$/);
    if (!match) return null;

    const field = match[1];
    const indent = (lineText.match(/^(\s*)/) || ['', ''])[1].length;
    const valueToken = getValueToken(editor);
    if (!valueToken) return null;

    if (indent === 0 && field === 'template') {
      return { kind: 'template', token: valueToken };
    }

    if (indent === 2) {
      const parentKey = findParentKeyAt(editor, cursor.line, 0);
      if (parentKey === 'layout' && field === 'density') return { kind: 'layout.density', token: valueToken };
      if (parentKey === 'layout' && field === 'font_scale') return { kind: 'layout.font_scale', token: valueToken };
      if (parentKey === 'personal' && field === 'default_link_display') return { kind: 'personal.default_link_display', token: valueToken };
    }

    const listParent = findParentKeyAt(editor, cursor.line, 2);
    if (listParent === 'fields') {
      const itemKey = findCurrentListItemKey(editor, cursor.line, 4);
      if (field === 'visible') return { kind: 'personal.fields.visible', token: valueToken };
      if (field === 'link_display' && window.SETTINGS_HELPERS?.LINK_FIELDS?.has(itemKey)) {
        return { kind: 'personal.fields.link_display', token: valueToken };
      }
      return null;
    }

    if (listParent === 'sections' && field === 'visible') {
      return { kind: 'sections.visible', token: valueToken };
    }

    return null;
  } catch (_) {
    return null;
  }
}

function findCurrentListItemKey(editor, fromLine, keyIndent) {
  for (let i = fromLine; i >= 0; i--) {
    const text = editor.getLine(i);
    if (!text.trim()) continue;
    const lineIndent = (text.match(/^(\s*)/) || ['', ''])[1].length;
    if (lineIndent < keyIndent) break;
    const match = text.match(/^\s*-\s+key:\s*([\w-]+)/);
    if (match) return match[1];
  }
  return null;
}

function getSettingsValueSuggestions(kind) {
  const source = SETTINGS_VALUE_SUGGESTIONS[kind];
  return typeof source === 'function' ? source() : [];
}

function resumeYamlHint(editor) {
  if (!_isResumeTab()) return null;

  const contextKey = detectContext(editor);
  if (contextKey) {
    const token = getToken(editor);
    const cursor = editor.getCursor();
    const siblings = getSiblingKeys(editor, contextKey, cursor.line);
    const templateItems = [];
    if (contextKey === '__root__') {
      const scoredTemplates = [];
      Object.keys(SECTION_TEMPLATES).forEach((name) => {
        const score = fuzzyScore(token.prefix, name);
        if (!siblings.has(name) && score > 0) {
          scoredTemplates.push({ name, score });
        }
      });
      scoredTemplates
        .sort((a, b) => b.score - a.score || a.name.length - b.name.length)
        .forEach(({ name }) => {
          templateItems.push({
            text: buildRootTemplate(name),
            displayText: name,
            render(el, _self, data) { el.textContent = data.displayText; },
          });
        });
    } else if (contextKey.endsWith('[]')) {
      const sectionName = contextKey.slice(0, -2);
      if (SECTION_TEMPLATES[sectionName] && !token.prefix) {
        const lineText = editor.getLine(cursor.line);
        const lineIndent = (lineText.match(/^(\s*)/) || ['', ''])[1].length;
        const hasBullet = /^\s*-\s*$/.test(lineText);
        const emptyAtTwo = /^\s*$/.test(lineText) && lineIndent === 2;
        const emptyAtFour = /^\s*$/.test(lineText) && lineIndent === 4;
        if (hasBullet || emptyAtTwo || emptyAtFour) {
          const tmplBase = buildItemTemplate(sectionName, 2);
          if (tmplBase) {
            if (emptyAtFour) {
              const insertText = '\n  - ' + tmplBase;
              templateItems.push({
                displayText: '[+ new item]',
                hint(cm) {
                  const ln = cm.getLine(cursor.line);
                  cm.replaceRange(insertText, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: ln.length });
                },
                render(el, _self, data) {
                  el.classList.add('yaml-hint-template');
                  el.textContent = data.displayText;
                },
              });
            } else {
              const tmplText = buildItemTemplate(sectionName, lineIndent);
              templateItems.push({
                text: emptyAtTwo ? '- ' + tmplText : tmplText,
                displayText: '[+ new item]',
                render(el, _self, data) {
                  el.classList.add('yaml-hint-template');
                  el.textContent = data.displayText;
                },
              });
            }
          }
        }
      }
    }

    const candidates = [];
    if (schema) {
      const contextDef = schema[contextKey];
      if (contextDef && Array.isArray(contextDef.keys)) {
        const required = new Set(contextDef.required || []);
        const listKeys = new Set(contextDef.list_keys || []);
        const rawCandidates = contextDef.keys
          .filter((k) => !siblings.has(k))
          .filter((k) => !(contextKey === '__root__' && SECTION_TEMPLATES[k]))
          .map((k) => ({ key: k, score: fuzzyScore(token.prefix, k) }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score || a.key.length - b.key.length);

        rawCandidates.forEach(({ key }) => {
          candidates.push({
            text: listKeys.has(key) ? key + ':' : key + ': ',
            displayText: required.has(key) ? key + ' *' : key,
            render(el, _self, data) { el.textContent = data.displayText; },
          });
        });
      }
    }

    const list = [...templateItems, ...candidates];
    if (list.length > 0) return { list, from: token.from, to: token.to };
  }

  const valueField = detectValueContext(editor);
  if (!valueField) return null;
  const suggestions = getValueSuggestions(valueField);
  if (!suggestions.length) return null;
  const valueToken = getValueToken(editor);
  if (!valueToken) return null;

  const typed = editor.getLine(editor.getCursor().line)
    .slice(valueToken.from.ch, editor.getCursor().ch)
    .replace(/^["']/, '');

  const list = suggestions
    .filter((s) => s.replace(/^["']/, '').toLowerCase().startsWith(typed.toLowerCase()))
    .map((s) => ({ text: s, displayText: s }));

  return list.length ? { list, from: valueToken.from, to: valueToken.to } : null;
}

function settingsYamlHint(editor) {
  if (!_isSettingsTab()) return null;

  const context = detectSettingsValueContext(editor);
  if (!context) return null;

  const typed = editor.getLine(editor.getCursor().line)
    .slice(context.token.from.ch, editor.getCursor().ch)
    .replace(/^["']/, '')
    .toLowerCase();

  const list = getSettingsValueSuggestions(context.kind)
    .filter((value) => value.toLowerCase().startsWith(typed))
    .map((value) => ({ text: value, displayText: value }));

  if (!list.length) return null;
  return { list, from: context.token.from, to: context.token.to };
}

function yamlHint(editor) {
  if (_isSettingsTab()) return settingsYamlHint(editor);
  return resumeYamlHint(editor);
}

window.yamlHint = yamlHint;
window.initYamlAutocomplete = function initYamlAutocomplete(cmEditor) {
  fetchSchema();

  let hintTimer = null;
  cmEditor.on('change', (editor, change) => {
    if (change.origin === '+delete' || change.origin === 'paste' || change.origin === 'setValue' || change.origin === 'complete') return;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      if (yamlHint(editor)) {
        editor.showHint({ hint: yamlHint, completeSingle: false });
      }
    }, 300);
  });
};
```

In `frontend/editor-adapter.js`, add a close-hint method without changing Tab behavior:

```javascript
closeHint() {
  if (typeof this._editor.closeHint === 'function') {
    this._editor.closeHint();
  }
}
```

In `frontend/settings-sync.js`, close hints before swapping editor contents:

```javascript
function switchToResume() {
  if (_activeTab === 'resume') return;
  _saveTabScroll(_activeTab);
  window.editorAdapter?.closeHint?.();
  _activeTab = 'resume';
  _setTabActive('resume');
  _suppress = true;
  window.editorAdapter.setValueSilently(app.state.yaml);
  window.editorAdapter.clearHistory();
  _restoreTabScroll('resume');
  _suppress = false;
  _restoreResumeStatus();
}

function switchToSettings() {
  if (_activeTab === 'settings') return;
  _saveTabScroll(_activeTab);
  window.editorAdapter?.closeHint?.();
  _activeTab = 'settings';
  _setTabActive('settings');
  _suppress = true;
  window.editorAdapter.setValueSilently(_settingsYaml);
  window.editorAdapter.clearHistory();
  _restoreTabScroll('settings');
  _suppress = false;
  _updateValidStatus(_parsed);
  _updateLineStat(_settingsYaml);
}
```

- [ ] **Step 4: Run the autocomplete-focused JS tests to verify they pass**

Run: `node --test tests/test_yaml_autocomplete.js tests/test_settings_sync_tab_switch.js`

Expected: PASS

- [ ] **Step 5: Run the full regression suite for this feature**

Run: `node --test tests/test_contact_settings_engine.js tests/test_contact_ui.js tests/test_template_default_reset.js tests/test_settings_sync_tab_switch.js tests/test_yaml_autocomplete.js`

Expected: PASS

Run: `pytest tests/test_template_meta_defaults.py tests/test_api.py -q`

Expected: PASS

- [ ] **Step 6: Commit the autocomplete and tab-isolation work**

```bash
git add frontend/yaml-autocomplete.js frontend/editor-adapter.js frontend/settings-sync.js tests/test_yaml_autocomplete.js tests/test_settings_sync_tab_switch.js
git commit -m "feat: add settings yaml value autocomplete"
```
