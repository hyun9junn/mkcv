const test = require('node:test');
const assert = require('node:assert/strict');
const jsyaml = require('js-yaml');

// Phase 2: editor-adapter.js was converted to ESM. The first test now boots
// the real CodeMirror under happy-dom (added to the DOM as `#editor-pane`).
// The second test exercises the Enter-key handler in isolation by calling the
// exported `_enterSmartIndent` directly with a fake editor — this preserves
// the exact assertions from the previous IIFE/vm harness, just without the
// indirection through the fake `extraKeys` map.

test.afterEach(() => {
  document.body.innerHTML = '';
});

test('editor adapter boots with a realistic software engineer resume sample', async () => {
  document.body.innerHTML = '<div id="editor-pane"></div>';
  const { app } = await import('../frontend/src/app.js');
  const { initEditorAdapter } = await import('../frontend/src/editor-adapter.js');

  initEditorAdapter();
  const initialYaml = app.state.yaml;
  const parsed = jsyaml.load(initialYaml);

  assert.match(initialYaml, /name: Gildong Hong/);
  assert.match(initialYaml, /Senior Software Engineer/);
  assert.match(initialYaml, /Orbit Labs/);
  assert.match(initialYaml, /Incident Review Assistant/);

  assert.equal(parsed.personal.name, 'Gildong Hong');
  assert.equal(parsed.personal.github, 'github.com/gildonghong');
  assert.equal(parsed.experience.length, 2);
  assert.equal(parsed.education[0].start_date, '2014-03');
  assert.equal(parsed.education[0].end_date, '2018-02');
  assert.equal(parsed.education[0].year, undefined);
  assert.equal(parsed.skills.length, 3);
  assert.deepEqual(Array.from(parsed.skills[0].items), ['Python', 'TypeScript', 'SQL', 'Go']);
  assert.equal(parsed.projects[0].name, 'Incident Review Assistant');

  assert.match(initialYaml, /name: Gildong Hong/);
  assert.match(initialYaml, /company: Orbit Labs/);
  assert.match(initialYaml, /summary: >/);
  assert.match(initialYaml, /items:\n\s+- Python\n\s+- TypeScript/);
});

test('pressing Enter after items inserts a nested bullet', async () => {
  const { _enterSmartIndent } = await import('../frontend/src/editor-adapter.js');

  const replaceCalls = [];
  const editor = {
    _lines: ['    items:'],
    _cursor: { line: 0, ch: '    items:'.length },
    getCursor() { return this._cursor; },
    getLine(line) { return this._lines[line] || ''; },
    replaceRange(text, from, to) {
      replaceCalls.push({ text, from, to });
    },
  };

  _enterSmartIndent(editor);

  assert.equal(replaceCalls.length, 1);
  assert.equal(replaceCalls[0].text, '\n      - ');
  assert.equal(replaceCalls[0].from.line, 0);
  assert.equal(replaceCalls[0].from.ch, '    items:'.length);
  assert.equal(replaceCalls[0].to, undefined);
});
