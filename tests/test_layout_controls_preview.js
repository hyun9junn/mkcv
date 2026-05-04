const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createButton(value) {
  return {
    dataset: { value },
    classList: {
      toggle() {},
    },
    closest(selector) {
      return selector === 'button[data-value]' ? this : null;
    },
  };
}

function createGroup(values) {
  const listeners = new Map();
  const buttons = values.map(createButton);
  return {
    buttons,
    querySelectorAll(selector) {
      return selector === 'button[data-value]' ? buttons : [];
    },
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    clickValue(value) {
      const target = buttons.find((button) => button.dataset.value === value);
      for (const callback of listeners.get('click') || []) {
        callback({ target });
      }
    },
  };
}

function createContext() {
  const domReadyCallbacks = [];
  const densityGroup = createGroup(['comfortable', 'balanced', 'compact']);
  const fontGroup = createGroup(['small', 'normal', 'large']);
  const counters = { previewRenders: 0, updateCalls: 0 };
  const settings = {
    layout: { density: 'balanced', font_scale: 'normal' },
  };

  const context = {
    console,
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
    document: {
      getElementById(id) {
        if (id === 'density-group') return densityGroup;
        if (id === 'font-scale-group') return fontGroup;
        return null;
      },
      addEventListener(type, callback) {
        if (type === 'DOMContentLoaded') domReadyCallbacks.push(callback);
      },
    },
    app: {
      state: {
        yaml: 'personal:\n  name: Test User\n',
        template: 'classic',
        density: 'balanced',
        font_scale: 'normal',
      },
      setState(patch) {
        Object.assign(this.state, patch);
      },
    },
    preview: {
      refresh() {
        counters.previewRenders += 1;
      },
    },
    sectionsState: {
      getOrderedFilteredYaml(yaml) {
        return yaml;
      },
    },
    settingsSync: {
      updateFromToolbar(mutator) {
        counters.updateCalls += 1;
        mutator(settings);
        context.preview.refresh();
      },
    },
  };
  context.window = context;

  return { context, domReadyCallbacks, densityGroup, fontGroup, counters, settings };
}

async function bootLayoutControls(context, domReadyCallbacks) {
  const source = fs.readFileSync('frontend/layout-controls.js', 'utf8');
  vm.runInNewContext(source, context, { filename: 'frontend/layout-controls.js' });
  for (const callback of domReadyCallbacks) {
    await callback();
  }
}

test('density click triggers one preview refresh when settingsSync is present', async () => {
  const { context, domReadyCallbacks, densityGroup, counters, settings } = createContext();
  await bootLayoutControls(context, domReadyCallbacks);

  densityGroup.clickValue('compact');

  assert.equal(settings.layout.density, 'compact');
  assert.equal(context.app.state.density, 'compact');
  assert.equal(counters.updateCalls, 1);
  assert.equal(counters.previewRenders, 1);
});

test('font-scale click triggers one preview refresh when settingsSync is present', async () => {
  const { context, domReadyCallbacks, fontGroup, counters, settings } = createContext();
  await bootLayoutControls(context, domReadyCallbacks);

  fontGroup.clickValue('small');

  assert.equal(settings.layout.font_scale, 'small');
  assert.equal(context.app.state.font_scale, 'small');
  assert.equal(counters.updateCalls, 1);
  assert.equal(counters.previewRenders, 1);
});
