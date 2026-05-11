const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const baseYaml = require('js-yaml');

function createContext() {
  const storage = new Map();
  let loadCalls = 0;

  const context = {
    console,
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
    },
    jsyaml: {
      load(source) {
        loadCalls += 1;
        return baseYaml.load(source);
      },
      dump(value, options) {
        return baseYaml.dump(value, options);
      },
    },
  };

  context.window = context;
  return { context, getLoadCalls: () => loadCalls };
}

function loadScript(filename, context) {
  const source = fs.readFileSync(filename, 'utf8');
  vm.runInNewContext(source, context, { filename });
}

test('same resume yaml reuses one parse internally while public reads stay isolated', () => {
  const { context, getLoadCalls } = createContext();
  loadScript('frontend/src/sections-state.js', context);

  const resumeYaml = [
    'personal:',
    '  name: Test User',
    '',
    'summary: >',
    '  Cached once.',
    '',
    'projects:',
    '  - name: Parser Cache',
    '    description: Shares parsed YAML.',
    '',
    'custom_sections:',
    '  - key: side_projects',
    '    title: Side Projects',
    '',
  ].join('\n');

  const parsed = context.window.sectionsState.parseResumeYaml(resumeYaml);
  parsed.projects[0].name = 'Poisoned';
  parsed.custom_sections[0].title = 'Poisoned Title';
  const parsedAgain = context.window.sectionsState.parseResumeYaml(resumeYaml);
  const customDefs = context.window.sectionsState.getCustomDefs(resumeYaml);
  const presentKeys = context.window.sectionsState.getExpandedPresentKeys(resumeYaml);
  const orderedYaml = context.window.sectionsState.getOrderedFilteredYaml(resumeYaml);
  const visibleOrder = context.window.sectionsState.getVisibleOrder(resumeYaml);

  assert.notEqual(parsedAgain, parsed);
  assert.equal(parsedAgain.projects[0].name, 'Parser Cache');
  assert.equal(parsedAgain.custom_sections[0].title, 'Side Projects');
  assert.deepEqual(JSON.parse(JSON.stringify(customDefs)), {
    side_projects: { label: 'Side Projects', yaml: null },
  });
  assert.deepEqual(Array.from(presentKeys), ['summary', 'projects', 'side_projects']);
  assert.match(orderedYaml, /custom_sections:/);
  assert.deepEqual(Array.from(visibleOrder), ['summary', 'projects', 'side_projects']);
  assert.equal(getLoadCalls(), 1);

  context.window.sectionsState.getExpandedPresentKeys(`${resumeYaml}languages:\n  - language: English\n`);
  assert.equal(getLoadCalls(), 2);
});
