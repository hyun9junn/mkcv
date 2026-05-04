const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('chip dot expands its hit area without changing the visible dot size', () => {
  const html = fs.readFileSync('frontend/index.html', 'utf8');

  assert.match(
    html,
    /\.chip-dot::before\s*\{[\s\S]*?content:\s*"";[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*-6px;[\s\S]*?\}/
  );
});
