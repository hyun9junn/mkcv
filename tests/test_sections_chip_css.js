const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('chip dot expands its hit area without changing the visible dot size', () => {
  const css = fs.readFileSync('frontend/src/index.css', 'utf8');

  assert.match(
    css,
    /\.chip-dot::before\s*\{[\s\S]*?content:\s*"";[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*-6px;[\s\S]*?\}/
  );
});

test('hidden sections use italic chip typography without being marked absent', () => {
  const css = fs.readFileSync('frontend/src/index.css', 'utf8');

  assert.match(
    css,
    /\.chip\.hidden \.chip-name\s*\{[^}]*font-style:\s*italic;[^}]*\}/
  );
});

test('visible section chip labels stay upright by default', () => {
  const css = fs.readFileSync('frontend/src/index.css', 'utf8');
  const match = css.match(/^\s*\.chip-name\s*\{([^}]*)\}/m);

  assert.ok(match, 'expected a base .chip-name rule');
  assert.doesNotMatch(match[1], /font-style:/);
});

test('section chip labels use a dedicated Korean-friendly font stack', () => {
  const css = fs.readFileSync('frontend/src/index.css', 'utf8');

  assert.match(
    css,
    /--font-chip-label:\s*'Pretendard',\s*'Noto Sans KR',\s*'Apple SD Gothic Neo',\s*'Malgun Gothic',\s*var\(--font-sans\);/
  );

  assert.match(
    css,
    /\.chip-name\s*\{[^}]*font-family:\s*var\(--font-chip-label\);[^}]*\}/
  );

  assert.match(
    css,
    /\.chip-name-input\s*\{[^}]*font-family:\s*var\(--font-chip-label\);[^}]*\}/
  );
});
