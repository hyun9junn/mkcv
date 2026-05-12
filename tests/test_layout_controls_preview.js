const test = require('node:test');
const assert = require('node:assert/strict');

test.afterEach(() => {
  document.body.innerHTML = '';
  if (globalThis.localStorage) localStorage.clear();
  // Clean up window globals set per-test
  delete globalThis.settingsSync;
  delete globalThis.preview;
  delete globalThis.sectionsState;
});

function buildDOM() {
  document.body.innerHTML = `
    <div id="density-group">
      <button data-value="comfortable">Comfortable</button>
      <button data-value="balanced">Balanced</button>
      <button data-value="compact">Compact</button>
    </div>
    <div id="font-scale-group">
      <button data-value="small">Small</button>
      <button data-value="normal">Normal</button>
      <button data-value="large">Large</button>
    </div>
  `;
}

function clickValue(groupId, value) {
  const group = document.getElementById(groupId);
  const btn = [...group.querySelectorAll('button[data-value]')].find(b => b.dataset.value === value);
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

test('density click triggers one preview refresh when settingsSync is present', async () => {
  buildDOM();

  const counters = { updateCalls: 0, previewRenders: 0 };
  const settings = { layout: { density: 'balanced', font_scale: 'normal' } };
  globalThis.settingsSync = {
    updateFromToolbar(mutator) {
      counters.updateCalls += 1;
      mutator(settings);
      counters.previewRenders += 1;
    },
  };

  const { app } = await import('../frontend/src/app.js');
  const { initLayoutControls } = await import('../frontend/src/layout-controls.js');
  initLayoutControls();

  clickValue('density-group', 'compact');

  assert.equal(settings.layout.density, 'compact');
  assert.equal(app.state.density, 'compact');
  assert.equal(counters.updateCalls, 1);
  assert.equal(counters.previewRenders, 1);
});

test('font-scale click triggers one preview refresh when settingsSync is present', async () => {
  buildDOM();

  const counters = { updateCalls: 0, previewRenders: 0 };
  const settings = { layout: { density: 'balanced', font_scale: 'normal' } };
  globalThis.settingsSync = {
    updateFromToolbar(mutator) {
      counters.updateCalls += 1;
      mutator(settings);
      counters.previewRenders += 1;
    },
  };

  const { app } = await import('../frontend/src/app.js');
  const { initLayoutControls } = await import('../frontend/src/layout-controls.js');
  initLayoutControls();

  clickValue('font-scale-group', 'small');

  assert.equal(settings.layout.font_scale, 'small');
  assert.equal(app.state.font_scale, 'small');
  assert.equal(counters.updateCalls, 1);
  assert.equal(counters.previewRenders, 1);
});
