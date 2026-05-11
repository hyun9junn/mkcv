const test = require('node:test');
const assert = require('node:assert/strict');

test.afterEach(async () => {
  const { _resetParseCache } = await import('../frontend/src/sections-state.js');
  _resetParseCache();
  if (globalThis.localStorage) localStorage.clear();
});

test('same resume yaml reuses one parse internally while public reads stay isolated', async () => {
  const { sectionsState, _resetParseCache } = await import('../frontend/src/sections-state.js');
  _resetParseCache();

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

  const parsed = sectionsState.parseResumeYaml(resumeYaml);
  // Mutate the returned copy — must not affect the internal cache
  parsed.projects[0].name = 'Poisoned';
  parsed.custom_sections[0].title = 'Poisoned Title';

  const parsedAgain = sectionsState.parseResumeYaml(resumeYaml);
  const customDefs = sectionsState.getCustomDefs(resumeYaml);
  const presentKeys = sectionsState.getExpandedPresentKeys(resumeYaml);
  const orderedYaml = sectionsState.getOrderedFilteredYaml(resumeYaml);
  const visibleOrder = sectionsState.getVisibleOrder(resumeYaml);

  // Returns a different object (clone), not the same reference
  assert.notEqual(parsedAgain, parsed);
  // Internal cache was not poisoned by the mutation above
  assert.equal(parsedAgain.projects[0].name, 'Parser Cache');
  assert.equal(parsedAgain.custom_sections[0].title, 'Side Projects');
  assert.deepEqual(JSON.parse(JSON.stringify(customDefs)), {
    side_projects: { label: 'Side Projects', yaml: null },
  });
  assert.deepEqual(Array.from(presentKeys), ['summary', 'projects', 'side_projects']);
  assert.match(orderedYaml, /custom_sections:/);
  assert.deepEqual(Array.from(visibleOrder), ['summary', 'projects', 'side_projects']);

  // A different YAML string must produce a fresh parse (different result)
  const differentYaml = `${resumeYaml}languages:\n  - language: English\n`;
  const parsedDifferent = sectionsState.parseResumeYaml(differentYaml);
  assert.ok('languages' in parsedDifferent, 'different YAML must be parsed fresh');
});
