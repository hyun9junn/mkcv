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
  assert.deepEqual(Array.from(hint.list).map((item) => item.text), ['label']);
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
  assert.deepEqual(Array.from(hint.list).map((item) => item.text), ['true']);
});
