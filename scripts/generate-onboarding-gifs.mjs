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
