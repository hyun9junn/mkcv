import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const VIEWPORT = { width: 1400, height: 860 };
const CLIP = { x: 0, y: 0, width: 1400, height: 860 };
const TARGET_TEMPLATE = 'trackline';
const DEFAULT_BASE_URL = process.env.MKCV_CAPTURE_BASE_URL || 'http://localhost:8000';
const SAMPLE_RESUME_PATH = path.resolve('scripts/sample-cv.yaml');

export function buildSeedStorage(resumeYaml) {
  return {
    mkcv_onboarding_seen: '1',
    mkcv_theme: 'light',
    'mkcv:default:resume.yaml': resumeYaml,
  };
}

export function buildStoryboard() {
  return [
    { name: 'initial-state', holdMs: 900 },
    { name: 'typed-name', holdMs: 220 },
    { name: 'preview-settled', holdMs: 1500 },
    { name: 'template-picker-open', holdMs: 1400 },
    { name: 'template-applied', holdMs: 1700, template: TARGET_TEMPLATE },
    { name: 'export-open', holdMs: 2200 },
  ];
}

export function resolveCaptureOptions({
  baseUrl = DEFAULT_BASE_URL,
  outputPath = path.resolve('preview.gif'),
} = {}) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  return {
    url: `${normalizedBaseUrl}/?capture=gif`,
    outputPath,
    viewport: { ...VIEWPORT },
    clip: { ...CLIP },
    targetTemplate: TARGET_TEMPLATE,
  };
}

export function resolveGifencBindings(moduleNamespace) {
  const bindings =
    (moduleNamespace && typeof moduleNamespace.GIFEncoder === 'function' && moduleNamespace) ||
    (moduleNamespace?.default && typeof moduleNamespace.default.GIFEncoder === 'function' && moduleNamespace.default) ||
    (moduleNamespace?.['module.exports'] &&
      typeof moduleNamespace['module.exports'].GIFEncoder === 'function' &&
      moduleNamespace['module.exports']);

  if (!bindings) {
    throw new TypeError('Unable to resolve gifenc bindings');
  }
  return bindings;
}

async function waitForPreviewStable(page) {
  await page.waitForFunction(() => {
    const loading = document.getElementById('preview-loading');
    const frame = document.getElementById('preview-frame');
    return Boolean(
      loading &&
      loading.style.display === 'none' &&
      frame &&
      frame.querySelectorAll('canvas').length > 0
    );
  }, null, { timeout: 30000 });
}

async function captureFrame(page, frames, clip, holdMs) {
  const buffer = await page.screenshot({ clip });
  frames.push({ buffer, holdMs });
}

async function typeNameEdit(page, frames, clip, beat) {
  await page.locator('.CodeMirror').click();
  await page.evaluate(() => {
    const cm = window.editorAdapter?._editor;
    if (!cm) throw new Error('CodeMirror editor not ready');
    cm.focus();
    cm.setCursor({ line: 1, ch: '  name: Jane'.length });
  });

  for (const char of ' Marie') {
    await page.keyboard.type(char, { delay: 40 });
    await captureFrame(page, frames, clip, beat.holdMs);
  }
}

async function openTemplateAndApply(page, frames, capture, openBeat, appliedBeat) {
  await page.click('#template-trigger');
  await page.waitForTimeout(250);
  await captureFrame(page, frames, capture.clip, openBeat.holdMs);

  await page.click(`.tpl-card[data-name="${capture.targetTemplate}"]`);
  await waitForPreviewStable(page);
  await captureFrame(page, frames, capture.clip, appliedBeat.holdMs);
}

async function openExport(page, frames, clip, beat) {
  await page.click('#export-trigger');
  await page.waitForTimeout(250);
  await captureFrame(page, frames, clip, beat.holdMs);
}

async function encodeGif(frames, outputPath) {
  const { PNG } = await import('pngjs');
  const gifencModule = await import('gifenc');
  const { GIFEncoder, quantize, applyPalette } = resolveGifencBindings(gifencModule);

  const gif = GIFEncoder();

  for (const frame of frames) {
    const png = PNG.sync.read(frame.buffer);
    const palette = quantize(png.data, 256);
    const pixels = applyPalette(png.data, palette);
    gif.writeFrame(pixels, png.width, png.height, {
      palette,
      delay: Math.max(1, Math.round(frame.holdMs / 10)),
    });
  }

  gif.finish();
  fs.writeFileSync(outputPath, Buffer.from(gif.bytes()));
}

export async function main({
  baseUrl = DEFAULT_BASE_URL,
  outputPath = path.resolve('preview.gif'),
} = {}) {
  const { chromium } = await import('playwright');
  const resumeYaml = fs.readFileSync(SAMPLE_RESUME_PATH, 'utf8');
  const seed = buildSeedStorage(resumeYaml);
  const capture = resolveCaptureOptions({ baseUrl, outputPath });
  const storyboard = buildStoryboard();
  const initialBeat = storyboard[0];
  const typedBeat = storyboard[1];
  const previewBeat = storyboard[2];
  const templateOpenBeat = storyboard[3];
  const templateAppliedBeat = storyboard[4];
  const exportBeat = storyboard[5];
  const frames = [];

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: capture.viewport, deviceScaleFactor: 1 });

    await page.addInitScript((storage) => {
      const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
      keys
        .filter((key) => key && key.startsWith('mkcv'))
        .forEach((key) => localStorage.removeItem(key));
      Object.entries(storage).forEach(([key, value]) => localStorage.setItem(key, value));
    }, seed);

    await page.goto(capture.url, { waitUntil: 'networkidle', timeout: 30000 });
    await waitForPreviewStable(page);
    await captureFrame(page, frames, capture.clip, initialBeat.holdMs);

    await typeNameEdit(page, frames, capture.clip, typedBeat);
    await waitForPreviewStable(page);
    await captureFrame(page, frames, capture.clip, previewBeat.holdMs);

    await openTemplateAndApply(page, frames, capture, templateOpenBeat, templateAppliedBeat);
    await openExport(page, frames, capture.clip, exportBeat);

    await encodeGif(frames, capture.outputPath);
    console.log(`Wrote ${capture.outputPath}`);
  } finally {
    await browser.close();
  }
}

const isDirectRun = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
