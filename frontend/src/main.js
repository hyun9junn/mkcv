import './vendor.js';

import { app } from './app.js';
import { validator, initValidator } from './validator.js';
import { fileSync, initFileSync } from './file-sync.js';
import { initLayoutControls } from './layout-controls.js';
import { sectionsState } from './sections-state.js';
import { SETTINGS_HELPERS } from './settings-engine.js';
import { initYamlAutocomplete, yamlHint } from './yaml-autocomplete.js';
import { editorAdapter, initEditorAdapter } from './editor-adapter.js';

// Compat shims — unconverted (still-IIFE) source files reach for these on window.
window.app = app;
window.validator = validator;
window.fileSync = fileSync;
window.sectionsState = sectionsState;
window.SETTINGS_HELPERS = SETTINGS_HELPERS;
window.yamlHint = yamlHint;
window.initYamlAutocomplete = initYamlAutocomplete;
// (layout-controls didn't expose anything on window in IIFE form, so no shim needed)
// `window.editorAdapter` is set inside the DOMContentLoaded handler below — its
// methods only work after `initEditorAdapter()` runs, and `contact-ui.js` uses
// `if (window.editorAdapter)` as a readiness probe that must remain falsy
// before init completes.

document.addEventListener('DOMContentLoaded', () => {
  // initEditorAdapter creates the CodeMirror instance and internally calls
  // initYamlAutocomplete(editor) — no separate top-level call needed.
  initEditorAdapter();
  window.editorAdapter = editorAdapter;
  initValidator();
  initFileSync();
  initLayoutControls();
});
