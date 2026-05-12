import './vendor.js';
import './index.css';

import { initValidator } from './validator.js';
import { initFileSync } from './file-sync.js';
import { initLayoutControls } from './layout-controls.js';
import { editorAdapter, initEditorAdapter } from './editor-adapter.js';
import { initPreview } from './preview.js';
import { initContactUI } from './contact-ui.js';
import { initSectionsUI } from './sections-ui.js';
import { initTemplates } from './templates.js';
import { settingsSync, initSettingsSync } from './settings-sync.js';
import { initExporter } from './export.js';
import { initYamlBackup } from './yaml-backup.js';
import { initOnboarding } from './onboarding.js';
import { initUIWiring } from './ui-wiring.js';

// settingsSync is safe to expose at module level — its methods close over
// module-private state that is ready before DOMContentLoaded.
window.settingsSync = settingsSync;

document.addEventListener('DOMContentLoaded', () => {
  // initEditorAdapter creates the CodeMirror instance and internally calls
  // initYamlAutocomplete(editor) — no separate top-level call needed.
  initEditorAdapter();
  // contact-ui uses `if (window.editorAdapter)` as a readiness probe; it must
  // remain falsy until after initEditorAdapter() completes.
  window.editorAdapter = editorAdapter;
  initPreview();
  initContactUI();
  initSectionsUI();
  initTemplates();
  initSettingsSync();
  initExporter();
  initYamlBackup();
  initOnboarding();
  initValidator();
  initFileSync();
  initLayoutControls();
  initUIWiring();
});
