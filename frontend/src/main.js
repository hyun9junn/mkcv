import './vendor.js';

import { app } from './app.js';
import { validator, initValidator } from './validator.js';
import { fileSync, initFileSync } from './file-sync.js';
import { initLayoutControls } from './layout-controls.js';

// Compat shims — unconverted (still-IIFE) source files reach for these on window.
window.app = app;
window.validator = validator;
window.fileSync = fileSync;
// (layout-controls didn't expose anything on window in IIFE form, so no shim needed)

document.addEventListener('DOMContentLoaded', () => {
  initValidator();
  initFileSync();
  initLayoutControls();
});
