const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('README embeds preview.gif instead of preview.png', () => {
  const readme = fs.readFileSync('README.md', 'utf8');
  assert.match(readme, /!\[Preview\]\(\.\/preview\.gif\)/);
  assert.doesNotMatch(readme, /!\[Preview\]\(\.\/preview\.png\)/);
});

test('preview.gif exists at the repository root', () => {
  assert.ok(fs.existsSync('preview.gif'));
  const stat = fs.statSync('preview.gif');
  assert.ok(stat.size > 0);
});
