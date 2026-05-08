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

const ZOOM_EDITOR = { x: 0, y: 55, width: 650, height: 795 };
const ZOOM_TOOLBAR = { x: 0, y: 0, width: 1400, height: 110 };
const ZOOM_TEMPLATE_PICKER = { x: 578, y: 0, width: 422, height: 700 };
const ZOOM_EXPORT_BTN = { x: 1150, y: 0, width: 250, height: 200 };

const CLIP_EDITOR  = { x: 0,   y: 55, width: 650, height: 795 };
const CLIP_PREVIEW = { x: 695, y: 55, width: 705, height: 795 };
const CLIP_CONTACT = { x: 0,   y: 55, width: 750, height: 420 };

async function scene01Welcome(page, frames) {
  // Zoom in: show editor with cursor positioned
  await page.locator('.CodeMirror').click();
  await page.evaluate(() => {
    const cm = window.editorAdapter?._editor;
    if (!cm) throw new Error('CodeMirror editor not ready');
    cm.focus();
    cm.setCursor({ line: 1, ch: '  name: Jane'.length });
  });
  await captureZoomedFrame(page, frames, ZOOM_EDITOR, 800);

  // Type " Marie" and zoom out once preview settles
  await waitForNextPreviewStable(page, async () => {
    for (const char of ' Marie') {
      await page.keyboard.type(char, { delay: 40 });
      await captureZoomedFrame(page, frames, ZOOM_EDITOR, 80);
    }
  });

  // Zoom out: full viewport shows updated preview
  await captureFrame(page, frames, 2000);
}

async function scene02Editor(page, frames) {
  // Position cursor at the end of the first experience title: line so that pressing
  // Enter auto-indents to the experience item level and autocomplete resolves to
  // experience fields (company, location, start_date, end_date, description, …)
  await page.locator('.CodeMirror').click();
  await page.evaluate(() => {
    const cm = window.editorAdapter?._editor;
    if (!cm) throw new Error('CodeMirror editor not ready');
    cm.focus();
    const totalLines = cm.lineCount();
    let titleLine = -1;
    for (let i = 0; i < totalLines; i++) {
      const line = cm.getLine(i);
      if (/^\s{4}-\s*$/.test(line) || /^\s{2}-\s*$/.test(line)) continue;
      if (/^\s{4}title:/.test(line)) { titleLine = i; break; }
    }
    if (titleLine === -1) throw new Error('title line not found');
    cm.setCursor({ line: titleLine, ch: cm.getLine(titleLine).length });
  });

  // Capture tight editor crop — no zoom technique here (preview doesn't change)
  const shoot = async (holdMs) => {
    const buf = await page.screenshot({ clip: CLIP_EDITOR });
    frames.push({ buffer: buf, holdMs });
  };

  await shoot(700);

  // Press Enter → CodeMirror auto-indents to match the experience item field level
  await page.keyboard.press('Enter');
  await shoot(300);

  // Type 'c' to trigger the change-event autocomplete (300ms debounce)
  // showing experience field completions: company, certifications, etc.
  await page.keyboard.type('c');
  // Wait for the 300ms debounce + render
  await page.waitForTimeout(500);
  await shoot(2000);

  // Dismiss the autocomplete dropdown
  await page.keyboard.press('Escape');

  // Undo all changes made in this scene via CodeMirror API for reliability
  // Each undo() reverses one history entry: typed 'c', then the Enter
  await page.evaluate(() => {
    const cm = window.editorAdapter?._editor;
    if (!cm) throw new Error('CodeMirror editor not ready');
    cm.closeHint?.(); // explicitly dismiss any stray autocomplete dropdown
    cm.undo(); // undo typed 'c'
    cm.undo(); // undo Enter keypress
  });
  await page.waitForTimeout(400);
}

async function scene03Preview(page, frames) {
  const shoot = async (holdMs) => {
    const buf = await page.screenshot({ clip: CLIP_PREVIEW });
    frames.push({ buffer: buf, holdMs });
  };

  await shoot(800);

  // Zoom in twice
  await page.click('#preview-zoom-in');
  await page.waitForTimeout(200);
  await shoot(600);

  await page.click('#preview-zoom-in');
  await page.waitForTimeout(200);
  await shoot(1200);

  // Zoom back out
  await page.click('#preview-zoom-out');
  await page.waitForTimeout(200);
  await shoot(400);

  await page.click('#preview-zoom-out');
  await page.waitForTimeout(200);
  await shoot(800);

  // Reset to 100% to leave app clean
  await page.click('#preview-zoom-label');
  await page.waitForTimeout(200);
}

async function scene05Contact(page, frames) {
  const shoot = async (holdMs) => {
    const buf = await page.screenshot({ clip: CLIP_CONTACT });
    frames.push({ buffer: buf, holdMs });
  };

  // Open Contact dropdown
  await page.click('#contact-pill');
  await page.waitForTimeout(500);
  await shoot(1000);

  // Toggle the first non-locked field off
  const toggle = page.locator('#contact-fields-body .f-toggle:not(.locked)').first();
  await toggle.click();
  await page.waitForTimeout(300);
  await shoot(900);

  // Toggle it back on
  await toggle.click();
  await page.waitForTimeout(300);
  await shoot(700);

  // Close
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

async function scene04Sections(page, frames) {
  const CHIP_KEY = 'skills';

  // Zoom in on toolbar — show chips clearly
  await captureZoomedFrame(page, frames, ZOOM_TOOLBAR, 900);

  // Click chip-dot to hide the skills section, wait for preview
  await waitForNextPreviewStable(page, () =>
    page.click(`.chip[data-key="${CHIP_KEY}"] .chip-dot`)
  );
  await captureZoomedFrame(page, frames, ZOOM_TOOLBAR, 600);

  // Zoom out — preview shows section is gone
  await captureFrame(page, frames, 1800);

  // Zoom back in
  await captureZoomedFrame(page, frames, ZOOM_TOOLBAR, 700);

  // Click chip-dot again to unhide
  await waitForNextPreviewStable(page, () =>
    page.click(`.chip[data-key="${CHIP_KEY}"] .chip-dot`)
  );
  await captureZoomedFrame(page, frames, ZOOM_TOOLBAR, 500);

  // Double-click chip-name to rename
  await page.dblclick(`.chip[data-key="${CHIP_KEY}"] .chip-name`);
  await page.waitForTimeout(300);
  await captureZoomedFrame(page, frames, ZOOM_TOOLBAR, 700);

  // Clear the input and type new name
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Core Skills');
  await captureZoomedFrame(page, frames, ZOOM_TOOLBAR, 800);

  // Confirm with Enter — triggers preview update
  await waitForNextPreviewStable(page, () => page.keyboard.press('Enter'));

  // Zoom out — preview shows new section title
  await captureFrame(page, frames, 2000);

  // Restore original name to leave app clean for subsequent scenes
  await page.dblclick(`.chip[data-key="${CHIP_KEY}"] .chip-name`);
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+A');
  await page.keyboard.type('skills');
  await waitForNextPreviewStable(page, () => page.keyboard.press('Enter'));
}

async function scene06Layout(page, frames) {
  // Zoom in on density buttons
  await captureZoomedFrame(page, frames, ZOOM_TOOLBAR, 800);

  // Comfortable → Balanced
  await waitForNextPreviewStable(page, () =>
    page.click('#density-group button[data-value="balanced"]')
  );
  await captureZoomedFrame(page, frames, ZOOM_TOOLBAR, 500);
  await captureFrame(page, frames, 1500);

  // Balanced → Compact
  await captureZoomedFrame(page, frames, ZOOM_TOOLBAR, 500);
  await waitForNextPreviewStable(page, () =>
    page.click('#density-group button[data-value="compact"]')
  );
  await captureZoomedFrame(page, frames, ZOOM_TOOLBAR, 500);
  await captureFrame(page, frames, 1500);

  // Restore comfortable to leave app clean
  await waitForNextPreviewStable(page, () =>
    page.click('#density-group button[data-value="comfortable"]')
  );
}

async function scene07aTemplatePicker(page, frames) {
  // Open template picker, zoom in to show cards
  await page.click('#template-trigger');
  await page.waitForTimeout(300);
  await captureZoomedFrame(page, frames, ZOOM_TEMPLATE_PICKER, 1000);

  // Click 'classic' — picker closes, preview re-renders
  await waitForNextPreviewStable(page, () =>
    page.click('.tpl-card[data-name="classic"]')
  );

  // Zoom out — preview shows classic template
  await captureFrame(page, frames, 1700);

  // Reopen picker, zoom in again
  await page.click('#template-trigger');
  await page.waitForTimeout(300);
  await captureZoomedFrame(page, frames, ZOOM_TEMPLATE_PICKER, 800);

  // Click 'boardroom' — picker closes, preview re-renders
  await waitForNextPreviewStable(page, () =>
    page.click('.tpl-card[data-name="boardroom"]')
  );

  // Zoom out — preview shows boardroom template
  await captureFrame(page, frames, 1700);

  // Restore original template
  await page.click('#template-trigger');
  await page.waitForTimeout(300);
  await waitForNextPreviewStable(page, () =>
    page.click('.tpl-card[data-name="trackline"]')
  );
}

async function scene07bSettings(page, frames) {
  const shoot = async (holdMs) => {
    const buf = await page.screenshot({ clip: CLIP_EDITOR });
    frames.push({ buffer: buf, holdMs });
  };

  // Show resume tab baseline
  await shoot(700);

  // Switch to settings tab
  await page.click('#file-tab-settings');
  await page.waitForTimeout(500);
  await shoot(2000);

  // Switch back to resume tab
  await page.click('#file-tab-resume');
  await page.waitForTimeout(300);
  await shoot(600);
}

async function scene08Export(page, frames) {
  // Zoom in on export button area
  await captureZoomedFrame(page, frames, ZOOM_EXPORT_BTN, 800);

  // Open export dropdown
  await page.click('#export-trigger');
  await page.waitForTimeout(300);
  await captureZoomedFrame(page, frames, ZOOM_EXPORT_BTN, 1200);

  // Click PDF option — triggers filename modal (full page overlay)
  await page.click('.export-option[data-export="pdf"]');
  await page.waitForFunction(() => {
    const modal = document.getElementById('filename-modal');
    return Boolean(modal?.classList.contains('open'));
  }, null, { timeout: 10000 });

  // Zoom out — filename modal visible over full page
  await captureFrame(page, frames, 2400);

  // Close modal to leave app clean
  await page.click('#filename-modal-cancel').catch(() =>
    page.keyboard.press('Escape')
  );
  await page.waitForTimeout(300);
}

export async function main({ baseUrl = DEFAULT_BASE_URL, outputDir = DEFAULT_OUT_DIR } = {}) {
  const { chromium } = await import('playwright');
  const resumeYaml = fs.readFileSync(SAMPLE_RESUME_PATH, 'utf8');
  const seed = buildSeedStorage(resumeYaml);
  const url = baseUrl.replace(/\/$/, '') + '/?capture=gif';

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
