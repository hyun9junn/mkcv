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

test('hidden sections use italic chip typography without being marked absent', () => {
  const html = fs.readFileSync('frontend/index.html', 'utf8');

  assert.match(
    html,
    /\.chip\.hidden \.chip-name\s*\{[^}]*font-style:\s*italic;[^}]*\}/
  );
});

test('visible section chip labels stay upright by default', () => {
  const html = fs.readFileSync('frontend/index.html', 'utf8');
  const match = html.match(/^\s*\.chip-name\s*\{([^}]*)\}/m);

  assert.ok(match, 'expected a base .chip-name rule');
  assert.doesNotMatch(match[1], /font-style:/);
});
