const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule() {
  const href = pathToFileURL(path.resolve('scripts/generate-readme-preview-gif.mjs')).href;
  return import(`${href}?t=${Date.now()}`);
}

test('buildSeedStorage returns the README capture localStorage keys', async () => {
  const mod = await loadModule();
  const yaml = 'personal:\n  name: Jane Smith\n';

  assert.deepEqual(mod.buildSeedStorage(yaml), {
    mkcv_onboarding_seen: '1',
    mkcv_theme: 'light',
    'mkcv:default:resume.yaml': yaml,
  });
});

test('buildStoryboard returns the README beats in a fixed order', async () => {
  const mod = await loadModule();
  const storyboard = mod.buildStoryboard();

  assert.deepEqual(
    storyboard.map((beat) => beat.name),
    [
      'initial-state',
      'typed-name',
      'preview-settled',
      'template-picker-open',
      'template-applied',
      'export-open',
      'export-filename-modal',
    ]
  );
  assert.deepEqual(
    storyboard.map((beat) => beat.holdMs),
    [900, 220, 1500, 1400, 1700, 2200, 2400]
  );
  assert.equal(storyboard.find((beat) => beat.name === 'template-applied').template, 'trackline');
});

test('resolveCaptureOptions points at ?capture=gif and preview.gif', async () => {
  const mod = await loadModule();
  const opts = mod.resolveCaptureOptions({ baseUrl: 'http://localhost:8000' });

  assert.equal(opts.url, 'http://localhost:8000/?capture=gif');
  assert.deepEqual(opts.viewport, { width: 1400, height: 860 });
  assert.deepEqual(opts.clip, { x: 0, y: 0, width: 1400, height: 860 });
  assert.equal(opts.targetTemplate, 'trackline');
  assert.equal(opts.outputPath, path.resolve('preview.gif'));
});

test('resolveGifencBindings unwraps CommonJS-flavored module exports', async () => {
  const mod = await loadModule();
  const fakeModule = {
    default: {
      GIFEncoder() {},
      quantize() {},
      applyPalette() {},
    },
  };

  const bindings = mod.resolveGifencBindings(fakeModule);

  assert.equal(typeof bindings.GIFEncoder, 'function');
  assert.equal(typeof bindings.quantize, 'function');
  assert.equal(typeof bindings.applyPalette, 'function');
});

test('isPreviewPdfResponse matches preview POST requests only', async () => {
  const mod = await loadModule();

  assert.equal(
    mod.isPreviewPdfResponse({
      url: 'http://localhost:8000/api/preview/pdf',
      method: 'POST',
    }),
    true
  );
  assert.equal(
    mod.isPreviewPdfResponse({
      url: 'http://localhost:8000/api/export/pdf',
      method: 'POST',
    }),
    false
  );
  assert.equal(
    mod.isPreviewPdfResponse({
      url: 'http://localhost:8000/api/preview/pdf',
      method: 'GET',
    }),
    false
  );
});

test('resolveGifFrameDelayMs keeps storyboard hold values in real milliseconds', async () => {
  const mod = await loadModule();

  assert.equal(mod.resolveGifFrameDelayMs(4500), 4500);
  assert.equal(mod.resolveGifFrameDelayMs(1100), 1100);
});
