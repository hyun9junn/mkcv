const test = require('node:test');
const assert = require('node:assert/strict');

// Phase 2: yaml-autocomplete.js was converted from IIFE-on-window to ESM. The
// module no longer reads from a vm context — it imports sectionsState and
// SETTINGS_HELPERS directly. We set `window.settingsSync` (still IIFE) to drive
// the active-tab check, then call the imported `yamlHint` directly.

test.afterEach(() => {
  delete globalThis.settingsSync;
});

function setActiveTab(activeTab) {
  globalThis.settingsSync = { activeTab };
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

test('settings tab suggests enum values for default_link_display', async () => {
  setActiveTab('settings');
  const { yamlHint } = await import('../frontend/src/yaml-autocomplete.js');
  const editor = createEditor(
    ['personal:', '  default_link_display: la'],
    { line: 1, ch: '  default_link_display: la'.length }
  );

  const hint = yamlHint(editor);
  assert.deepEqual(Array.from(hint.list).map((item) => item.text), ['label']);
});

test('resume tab never shows settings suggestions', async () => {
  setActiveTab('resume');
  const { yamlHint } = await import('../frontend/src/yaml-autocomplete.js');
  const editor = createEditor(
    ['personal:', '  default_link_display: la'],
    { line: 1, ch: '  default_link_display: la'.length }
  );

  assert.equal(yamlHint(editor), null);
});

test('settings tab never shows resume value helpers', async () => {
  setActiveTab('settings');
  const { yamlHint } = await import('../frontend/src/yaml-autocomplete.js');
  const editor = createEditor(
    ['experience:', '  - start_date: 20'],
    { line: 1, ch: '  - start_date: 20'.length }
  );

  assert.equal(yamlHint(editor), null);
});

test('settings tab suggests true/false inside sections list items', async () => {
  setActiveTab('settings');
  const { yamlHint } = await import('../frontend/src/yaml-autocomplete.js');
  const editor = createEditor(
    ['sections:', '  - key: summary', '    visible: t'],
    { line: 2, ch: '    visible: t'.length }
  );

  const hint = yamlHint(editor);
  assert.deepEqual(Array.from(hint.list).map((item) => item.text), ['true']);
});

test('settings tab suggests renamed template slugs', async () => {
  setActiveTab('settings');
  const { yamlHint } = await import('../frontend/src/yaml-autocomplete.js');
  const editor = createEditor(
    ['template: si'],
    { line: 0, ch: 'template: si'.length }
  );

  const hint = yamlHint(editor);
  assert.deepEqual(Array.from(hint.list).map((item) => item.text), ['signature-split']);
});
