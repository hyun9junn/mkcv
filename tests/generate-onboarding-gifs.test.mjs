import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { cropAndScale } from '../scripts/generate-onboarding-gifs.mjs';

test('cropAndScale extracts and upscales a sub-region', () => {
  const src = new PNG({ width: 4, height: 4 });
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const i = (y * 4 + x) * 4;
      if (x < 2 && y < 2) { src.data[i] = 255; src.data[i+1] = 0;   src.data[i+2] = 0;   src.data[i+3] = 255; }
      else if (x >= 2 && y < 2) { src.data[i] = 0; src.data[i+1] = 255; src.data[i+2] = 0; src.data[i+3] = 255; }
      else if (x < 2 && y >= 2) { src.data[i] = 0; src.data[i+1] = 0;   src.data[i+2] = 255; src.data[i+3] = 255; }
      else { src.data[i] = 255; src.data[i+1] = 255; src.data[i+2] = 255; src.data[i+3] = 255; }
    }
  }
  const result = cropAndScale(src, { x: 0, y: 0, width: 2, height: 2 }, 4, 4);
  assert.equal(result.width, 4);
  assert.equal(result.height, 4);
  for (let i = 0; i < 4 * 4 * 4; i += 4) {
    assert.equal(result.data[i],   255, `R at ${i}`);
    assert.equal(result.data[i+1], 0,   `G at ${i}`);
    assert.equal(result.data[i+2], 0,   `B at ${i}`);
    assert.equal(result.data[i+3], 255, `A at ${i}`);
  }
});

test('cropAndScale preserves a non-uniform region correctly', () => {
  const src = new PNG({ width: 4, height: 4 });
  src.data.fill(0);
  for (let y = 2; y < 4; y++) {
    for (let x = 2; x < 4; x++) {
      const i = (y * 4 + x) * 4;
      src.data[i] = 0; src.data[i+1] = 0; src.data[i+2] = 255; src.data[i+3] = 255;
    }
  }
  const result = cropAndScale(src, { x: 2, y: 2, width: 2, height: 2 }, 2, 2);
  assert.equal(result.width, 2);
  assert.equal(result.height, 2);
  for (let i = 0; i < 2 * 2 * 4; i += 4) {
    assert.equal(result.data[i+2], 255, `B at ${i}`);
  }
});
