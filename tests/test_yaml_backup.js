const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('settingsSync exposes setYaml', () => {
  const src = fs.readFileSync('frontend/settings-sync.js', 'utf8');
  const ctx = vm.createContext({
    document: {
      addEventListener() {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    window: {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    console,
  });
  ctx.jsyaml = { load: () => ({}) };
  const settingsHelpers = {
    parseSettings: () => ({ value: {}, errors: [], warnings: [] }),
    settingsToYaml: (s) => JSON.stringify(s),
    DEFAULT_SETTINGS: {
      template: 'classic',
      layout: { density: 'balanced', font_scale: 'normal' },
      personal: { default_link_display: 'label', fields: [] },
      sections: [],
    },
    normalizeTemplateDefaults: () => ({}),
    VALID_TPL: ['classic'],
    VALID_DENSITY: ['balanced'],
    VALID_FONT: ['normal'],
    SECTION_CATALOG: [],
    KNOWN_KEYS: new Set(),
  };
  ctx.SETTINGS_HELPERS = settingsHelpers;
  ctx.window.SETTINGS_HELPERS = settingsHelpers;
  ctx.window.editorAdapter = {
    getValue: () => '',
    setValue() {},
    setValueSilently() {},
    setValuePreserveScroll() {},
    onChange() {},
    clearHistory() {},
  };
  ctx.app = { state: {}, setState() {} };
  ctx.sectionsState = { rebuild() {}, getOrderedFilteredYaml: (y) => y, getVisibleOrder: () => [] };
  ctx.window.settingsSync = null;
  try { vm.runInContext(src, ctx); } catch {}
  assert.ok(
    typeof ctx.window.settingsSync?.setYaml === 'function',
    'setYaml should be a function on settingsSync'
  );
});
