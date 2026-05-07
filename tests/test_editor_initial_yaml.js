const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const jsyaml = require('js-yaml');

function bootEditorAdapter() {
  const domReadyCallbacks = [];
  const editorPane = {};
  let codeMirrorEditor = null;

  function createEditor(options) {
    const listeners = new Map();
    codeMirrorEditor = {
      state: {},
      _value: options.value,
      _cursor: { line: 0, ch: 0 },
      _lines: String(options.value || '').split('\n'),
      _replaceCalls: [],
      _enterHandler: options.extraKeys?.Enter,
      getValue() {
        return this._value;
      },
      setValue(next) {
        this._value = next;
        this._lines = String(next).split('\n');
        for (const callback of listeners.get('change') || []) callback();
      },
      replaceSelection() {},
      replaceRange(text, from, to) {
        this._replaceCalls.push({ text, from, to });
      },
      getCursor() {
        return this._cursor;
      },
      getLine(line) {
        return this._lines[line] || '';
      },
      on(type, callback) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(callback);
      },
      showHint() {},
      refresh() {},
      scrollTo() {},
      getScrollInfo() {
        return { left: 0, top: 0 };
      },
      clearHistory() {},
    };
    return codeMirrorEditor;
  }

  const context = {
    console,
    document: {
      getElementById(id) {
        assert.equal(id, 'editor-pane');
        return editorPane;
      },
      addEventListener(type, callback) {
        if (type === 'DOMContentLoaded') domReadyCallbacks.push(callback);
      },
      documentElement: {
        style: {
          setProperty() {},
        },
      },
    },
    CodeMirror(container, options) {
      assert.equal(container, editorPane);
      return createEditor(options);
    },
    initYamlAutocomplete() {},
    app: {
      state: {},
      setState(patch) {
        Object.assign(this.state, patch);
      },
    },
  };
  context.window = context;

  const source = fs.readFileSync('frontend/editor-adapter.js', 'utf8');
  vm.runInNewContext(source, context, { filename: 'frontend/editor-adapter.js' });
  for (const callback of domReadyCallbacks) callback();
  context.__codeMirrorEditor = codeMirrorEditor;
  return context;
}

test('editor adapter boots with a realistic software engineer resume sample', () => {
  const context = bootEditorAdapter();
  const initialYaml = context.app.state.yaml;
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

test('pressing Enter after items inserts a nested bullet', () => {
  const context = bootEditorAdapter();
  const editor = context.__codeMirrorEditor;

  editor._lines = ['    items:'];
  editor._cursor = { line: 0, ch: '    items:'.length };
  editor._replaceCalls = [];

  editor._enterHandler(editor);

  assert.equal(editor._replaceCalls.length, 1);
  assert.equal(editor._replaceCalls[0].text, '\n      - ');
  assert.equal(editor._replaceCalls[0].from.line, 0);
  assert.equal(editor._replaceCalls[0].from.ch, '    items:'.length);
  assert.equal(editor._replaceCalls[0].to, undefined);
});
