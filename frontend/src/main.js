import './vendor.js';

import { initValidator } from './validator.js';
import { initFileSync } from './file-sync.js';
import { initLayoutControls } from './layout-controls.js';
import { initEditorAdapter } from './editor-adapter.js';
import { initPreview } from './preview.js';
import { initContactUI } from './contact-ui.js';
import { initSectionsUI } from './sections-ui.js';
import { initTemplates } from './templates.js';
import { initSettingsSync } from './settings-sync.js';
import { initExporter } from './export.js';
import { initYamlBackup } from './yaml-backup.js';
import { initOnboarding } from './onboarding.js';
import { initUIWiring } from './ui-wiring.js';

document.addEventListener('DOMContentLoaded', () => {
  // initEditorAdapter creates the CodeMirror instance and internally calls
  // initYamlAutocomplete(editor) — no separate top-level call needed.
  initEditorAdapter();
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
