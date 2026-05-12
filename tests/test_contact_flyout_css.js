const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('controls row allows the contact flyout to escape vertically', () => {
  const css = fs.readFileSync('frontend/src/index.css', 'utf8');
  const controlsRowBlock = css.match(/\.controls-row\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? '';

  assert.match(controlsRowBlock, /overflow:\s*visible;/);
  assert.doesNotMatch(controlsRowBlock, /overflow-x:\s*auto;/);
});

test('contact flyout opens from the anchor right edge to avoid the preview side', () => {
  const css = fs.readFileSync('frontend/src/index.css', 'utf8');
  const flyoutBlock = css.match(/\.flyout-panel\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? '';

  assert.match(flyoutBlock, /right:\s*0;/);
  assert.doesNotMatch(flyoutBlock, /left:\s*0;/);
});

test('contact field controls align to the row right edge', () => {
  const css = fs.readFileSync('frontend/src/index.css', 'utf8');
  const fieldControlBlock = css.match(/\.f-ctrl\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? '';

  assert.match(fieldControlBlock, /margin-left:\s*auto;/);
  assert.match(fieldControlBlock, /justify-content:\s*flex-end;/);
});
