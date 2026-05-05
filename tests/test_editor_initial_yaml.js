const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const jsyaml = require('js-yaml');

function bootEditorAdapter() {
  const domReadyCallbacks = [];
  const editorPane = {};

  function createEditor(options) {
    const listeners = new Map();
    return {
      state: {},
      _value: options.value,
      getValue() {
        return this._value;
      },
      setValue(next) {
        this._value = next;
        for (const callback of listeners.get('change') || []) callback();
      },
      replaceSelection() {},
      replaceRange() {},
      getCursor() {
        return { line: 0, ch: 0 };
      },
      getLine() {
        return '';
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
  return context;
}

test('editor adapter boots with a realistic software engineer resume sample', () => {
  const context = bootEditorAdapter();
  const initialYaml = context.app.state.yaml;
  const parsed = jsyaml.load(initialYaml);

  assert.match(initialYaml, /name: Minseo Park/);
  assert.match(initialYaml, /Senior Software Engineer/);
  assert.match(initialYaml, /Orbit Labs/);
  assert.match(initialYaml, /Incident Review Assistant/);

  assert.equal(parsed.personal.name, 'Minseo Park');
  assert.equal(parsed.personal.github, 'github.com/minseopark');
  assert.equal(parsed.experience.length, 2);
  assert.equal(parsed.skills.length, 3);
  assert.equal(parsed.projects[0].name, 'Incident Review Assistant');
});
