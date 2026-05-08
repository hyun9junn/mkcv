import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';

const VIEWPORT = { width: 1400, height: 860 };
const DEFAULT_BASE_URL = process.env.MKCV_CAPTURE_BASE_URL || 'http://localhost:8000';
const SAMPLE_RESUME_PATH = path.resolve('scripts/sample-cv.yaml');
const DEFAULT_OUT_DIR = path.resolve('frontend/assets/onboarding');

export function buildSeedStorage(resumeYaml) {
  return {
    mkcv_onboarding_seen: '1',
    mkcv_theme: 'light',
    'mkcv:default:resume.yaml': resumeYaml,
  };
}

export function resolveGifencBindings(moduleNamespace) {
  const bindings =
    (moduleNamespace && typeof moduleNamespace.GIFEncoder === 'function' && moduleNamespace) ||
    (moduleNamespace?.default && typeof moduleNamespace.default.GIFEncoder === 'function' && moduleNamespace.default) ||
    (moduleNamespace?.['module.exports'] &&
      typeof moduleNamespace['module.exports'].GIFEncoder === 'function' &&
      moduleNamespace['module.exports']);
  if (!bindings) throw new TypeError('Unable to resolve gifenc bindings');
  return bindings;
}

export function cropAndScale(srcPng, clip, targetWidth, targetHeight) {
  const dst = new PNG({ width: targetWidth, height: targetHeight });
  for (let dy = 0; dy < targetHeight; dy++) {
    for (let dx = 0; dx < targetWidth; dx++) {
      const sx = Math.min(clip.x + Math.floor((dx / targetWidth) * clip.width), srcPng.width - 1);
      const sy = Math.min(clip.y + Math.floor((dy / targetHeight) * clip.height), srcPng.height - 1);
      const srcIdx = (sy * srcPng.width + sx) * 4;
      const dstIdx = (dy * targetWidth + dx) * 4;
      dst.data[dstIdx]   = srcPng.data[srcIdx];
      dst.data[dstIdx+1] = srcPng.data[srcIdx+1];
      dst.data[dstIdx+2] = srcPng.data[srcIdx+2];
      dst.data[dstIdx+3] = srcPng.data[srcIdx+3];
    }
  }
  return dst;
}

async function waitForPreviewStable(page) {
  await page.waitForFunction(() => {
    const loading = document.getElementById('preview-loading');
    const frame = document.getElementById('preview-frame');
    return Boolean(
      loading && loading.style.display === 'none' &&
      frame && frame.querySelectorAll('canvas').length > 0
    );
  }, null, { timeout: 30000 });
}

async function waitForNextPreviewStable(page, action) {
  const nextResponse = page.waitForResponse(
    (r) => {
      try { return new URL(r.url()).pathname === '/api/preview/pdf' && r.request().method().toUpperCase() === 'POST' && r.ok(); }
      catch { return false; }
    },
    { timeout: 30000 }
  );
  await action();
  await nextResponse;
  await waitForPreviewStable(page);
}

async function captureFrame(page, frames, holdMs) {
  const buffer = await page.screenshot({ clip: { x: 0, y: 0, ...VIEWPORT } });
  frames.push({ buffer, holdMs });
}

async function captureZoomedFrame(page, frames, zoomClip, holdMs) {
  const raw = await page.screenshot({ clip: { x: 0, y: 0, ...VIEWPORT } });
  const srcPng = PNG.sync.read(raw);
  const dstPng = cropAndScale(srcPng, zoomClip, VIEWPORT.width, VIEWPORT.height);
  frames.push({ buffer: PNG.sync.write(dstPng), holdMs });
}

async function encodeGif(frames, outputPath) {
  const gifencModule = await import('gifenc');
  const { GIFEncoder, quantize, applyPalette } = resolveGifencBindings(gifencModule);
  const gif = GIFEncoder();
  for (const frame of frames) {
    const png = PNG.sync.read(frame.buffer);
    const palette = quantize(png.data, 256);
    const pixels = applyPalette(png.data, palette);
    gif.writeFrame(pixels, png.width, png.height, {
      palette,
      delay: Math.max(1, Math.round(frame.holdMs)),
    });
  }
  gif.finish();
  fs.writeFileSync(outputPath, Buffer.from(gif.bytes()));
}

export async function main({ baseUrl = DEFAULT_BASE_URL, outputDir = DEFAULT_OUT_DIR } = {}) {
  const { chromium } = await import('playwright');
  const resumeYaml = fs.readFileSync(SAMPLE_RESUME_PATH, 'utf8');
  const seed = buildSeedStorage(resumeYaml);
  const url = baseUrl.replace(/\/$/, '') + '/';

  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await page.addInitScript((storage) => {
      const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
      keys.filter(k => k && k.startsWith('mkcv')).forEach(k => localStorage.removeItem(k));
      Object.entries(storage).forEach(([k, v]) => localStorage.setItem(k, v));
    }, seed);

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await waitForPreviewStable(page);

    const scenes = [
      { name: '01-welcome',          fn: scene01Welcome },
      { name: '02-editor',           fn: scene02Editor },
      { name: '03-preview',          fn: scene03Preview },
      { name: '04-sections-only',    fn: scene04Sections },
      { name: '05-contact',          fn: scene05Contact },
      { name: '06-layout',           fn: scene06Layout },
      { name: '07a-template-picker', fn: scene07aTemplatePicker },
      { name: '07b-settings-yaml',   fn: scene07bSettings },
      { name: '08-export',           fn: scene08Export },
    ];

    for (const { name, fn } of scenes) {
      const frames = [];
      await fn(page, frames);
      const outputPath = path.join(outputDir, `${name}.gif`);
      await encodeGif(frames, outputPath);
      console.log(`Wrote ${outputPath}`);
    }
  } finally {
    await browser.close();
  }
}

const isDirectRun = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;

if (isDirectRun) {
  main().catch((err) => { console.error(err); process.exitCode = 1; });
}
