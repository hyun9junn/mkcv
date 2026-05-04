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
