// scripts/take-onboarding-screenshots.mjs
// Usage: node scripts/take-onboarding-screenshots.mjs
// Requires: app running at http://localhost:8000
//           npm install playwright && npx playwright install chromium  (once, from repo root)

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT  = 'frontend/assets/onboarding';
const BASE = 'http://localhost:8000';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 860 });

  console.log('Loading app...');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Dismiss onboarding overlay if present (sets mkcv_onboarding_seen so future runs skip it)
  const overlay = page.locator('#onboarding-overlay');
  const isOpen = await overlay.evaluate(el => el.classList.contains('open')).catch(() => false);
  if (isOpen) {
    await page.click('#ob-btn-close');
    await page.waitForTimeout(500);
    console.log('Dismissed onboarding overlay');
  }

  // 1. Full app overview
  await page.screenshot({ path: `${OUT}/01-welcome.png` });
  console.log('01-welcome.png');

  // 2. Editor panel (x:0–650; splitter at 650–695 intentionally excluded)
  await page.screenshot({ path: `${OUT}/02-editor.png`, clip: { x: 0, y: 55, width: 650, height: 795 } });
  console.log('02-editor.png');

  // 3. Preview panel (x:695–1400)
  await page.screenshot({ path: `${OUT}/03-preview.png`, clip: { x: 695, y: 55, width: 705, height: 795 } });
  console.log('03-preview.png');

  // 4. Sections chips only (from "Sections" label onwards)
  await page.screenshot({ path: `${OUT}/04-sections-only.png`, clip: { x: 635, y: 55, width: 765, height: 42 } });
  console.log('04-sections-only.png');

  // 5. Contact dropdown — open then shoot
  await page.click('#contact-pill');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/05-contact.png`, clip: { x: 0, y: 55, width: 750, height: 420 } });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  console.log('05-contact.png');

  // 6. Layout toolbar strip
  await page.screenshot({ path: `${OUT}/06-layout.png`, clip: { x: 0, y: 55, width: 570, height: 42 } });
  console.log('06-layout.png');

  // 7a. Template picker
  await page.click('#template-trigger');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/07a-template-picker.png`, clip: { x: 578, y: 0, width: 422, height: 700 } });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  console.log('07a-template-picker.png');

  // 7b. settings.yaml tab
  await page.click('#file-tab-settings');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/07b-settings-yaml.png`, clip: { x: 0, y: 55, width: 650, height: 795 } });
  await page.click('#file-tab-resume');
  await page.waitForTimeout(300);
  console.log('07b-settings-yaml.png');

  // 8. Export dropdown
  await page.click('#export-trigger');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/08-export.png`, clip: { x: 1150, y: 0, width: 250, height: 250 } });
  await page.keyboard.press('Escape');
  console.log('08-export.png');

  console.log(`\nDone — screenshots saved to ${OUT}/`);
} finally {
  await browser.close();
}
