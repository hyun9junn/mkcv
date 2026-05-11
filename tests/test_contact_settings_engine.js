const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const jsyaml = require('js-yaml');

function loadSettingsHelpers() {
  const source = fs.readFileSync('frontend/src/settings-engine.js', 'utf8');
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
  assert.match(yaml, /- key: website\n\s+visible: true\n\s+link_display: default/);
  assert.match(yaml, /- key: linkedin\n\s+visible: true\n\s+link_display: default/);
  assert.match(yaml, /- key: github\n\s+visible: true\n\s+link_display: default/);
  assert.match(yaml, /- key: huggingface\n\s+visible: true\n\s+link_display: default/);
});
