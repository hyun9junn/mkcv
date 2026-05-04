const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('controls row allows the contact flyout to escape vertically', () => {
  const html = fs.readFileSync('frontend/index.html', 'utf8');
  const controlsRowBlock = html.match(/\.controls-row\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? '';

  assert.match(controlsRowBlock, /overflow:\s*visible;/);
  assert.doesNotMatch(controlsRowBlock, /overflow-x:\s*auto;/);
});

test('contact flyout opens from the anchor right edge to avoid the preview side', () => {
  const html = fs.readFileSync('frontend/index.html', 'utf8');
  const flyoutBlock = html.match(/\.flyout-panel\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? '';

  assert.match(flyoutBlock, /right:\s*0;/);
  assert.doesNotMatch(flyoutBlock, /left:\s*0;/);
});

test('contact field controls align to the row right edge', () => {
  const html = fs.readFileSync('frontend/index.html', 'utf8');
  const fieldControlBlock = html.match(/\.f-ctrl\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? '';

  assert.match(fieldControlBlock, /margin-left:\s*auto;/);
  assert.match(fieldControlBlock, /justify-content:\s*flex-end;/);
});
