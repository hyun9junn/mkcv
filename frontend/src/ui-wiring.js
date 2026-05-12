// UI wiring — event handlers for elements not owned by any other module.
// Extracted from the inline <script> block that previously lived at the bottom
// of index.html. All window.X reads have been replaced with ESM imports.

import { app } from './app.js';
import { preview } from './preview.js';
import { editorAdapter } from './editor-adapter.js';
import { settingsSync } from './settings-sync.js';
import { templateRegistry } from './templates.js';
import { onboarding } from './onboarding.js';

export function clearMkcvStorage() {
  const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
  keys.filter(k => k.startsWith('mkcv')).forEach(k => localStorage.removeItem(k));
}

// Registered document-level listeners — stored so tests can remove them between
// runs via _removeDocumentListenersForTesting().
const _docListeners = [];
function _addDocListener(type, handler, options) {
  document.addEventListener(type, handler, options);
  _docListeners.push({ type, handler, options });
}

// Test-only hook — removes all document-level listeners added by initUIWiring.
export function _removeDocumentListenersForTesting() {
  for (const { type, handler, options } of _docListeners) {
    document.removeEventListener(type, handler, options);
  }
  _docListeners.length = 0;
}

export function initUIWiring() {

  /* Validate icon → hidden button */
  document.getElementById('btn-validate-icon').addEventListener('click', () => {
    document.getElementById('btn-validate-template').click();
  });

  /* Export dropdown */
  const exportTrigger = document.getElementById('export-trigger');
  const exportMenu    = document.getElementById('export-menu');
  exportTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('open');
    if (document.getElementById('template-dropdown') && !document.getElementById('template-dropdown').hidden) {
      document.getElementById('template-dropdown').hidden = true;
    }
  });
  exportMenu.querySelectorAll('.export-option[data-export]').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      exportMenu.classList.remove('open');
      const fmt = opt.dataset.export;
      const map = { pdf: 'btn-pdf', tex: 'btn-tex', md: 'btn-md' };
      if (map[fmt]) document.getElementById(map[fmt]).click();
      const lastStat = document.getElementById('last-export-stat');
      if (lastStat) lastStat.textContent = `last export: ${fmt.toUpperCase()} · just now`;
    });
  });
  _addDocListener('click', () => exportMenu.classList.remove('open'));

  /* Preview zoom controls */
  document.getElementById('preview-zoom-in').addEventListener('click', () => preview.zoomIn());
  document.getElementById('preview-zoom-out').addEventListener('click', () => preview.zoomOut());
  document.getElementById('preview-zoom-label').addEventListener('click', () => preview.resetZoom());

  /* Editor zoom controls */
  document.getElementById('editor-zoom-in').addEventListener('click', () => editorAdapter.zoomIn());
  document.getElementById('editor-zoom-out').addEventListener('click', () => editorAdapter.zoomOut());
  document.getElementById('editor-zoom-label').addEventListener('click', () => editorAdapter.resetZoom());
  document.getElementById('editor-pane').addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) editorAdapter.zoomIn();
      else editorAdapter.zoomOut();
    }
  }, { passive: false });

  /* Modal Enter / Escape */
  _addDocListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    const openModal = document.querySelector('.modal-backdrop.open');
    if (!openModal) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const confirmBtn = openModal.querySelector('.modal-foot .btn-danger, .modal-foot .btn-accent');
      if (confirmBtn) confirmBtn.click();
    } else {
      e.preventDefault();
      const cancelBtn = openModal.querySelector('.modal-foot .btn-ghost');
      if (cancelBtn) cancelBtn.click();
    }
  });

  /* Keyboard shortcuts */
  _addDocListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 'p') { e.preventDefault(); document.getElementById('btn-pdf').click(); }
      if (e.key === 'l') { e.preventDefault(); document.getElementById('btn-tex').click(); }
      if (e.key === 'm') { e.preventDefault(); document.getElementById('btn-md').click(); }
      if (e.key === 's') { e.preventDefault(); document.getElementById('btn-yaml-export').click(); }
      if (e.key === 'o') { e.preventDefault(); document.getElementById('btn-yaml-import').click(); }
      if (e.altKey) {
        if (e.key === '=' || e.key === '+') { e.preventDefault(); preview.zoomIn(); }
        if (e.key === '-') { e.preventDefault(); preview.zoomOut(); }
        if (e.key === '0') { e.preventDefault(); preview.resetZoom(); }
      }
    }
  });

  /* Reset settings button (outside sections-ui.js) */
  const resetOrderBtn = document.getElementById('reset-sections-order-btn');
  if (resetOrderBtn) {
    resetOrderBtn.addEventListener('click', () => {
      settingsSync?.applyTemplateDefaults(
        templateRegistry?.getDefaults(app.state.template) || null
      );
    });
  }

  /* Theme toggle */
  const themeBtn   = document.getElementById('theme-toggle');
  const themeLabel = document.getElementById('theme-label');
  const stored = localStorage.getItem('mkcv_theme') || 'light';
  document.documentElement.dataset.theme = stored;
  themeLabel.textContent = stored === 'dark' ? 'Dark' : 'Light';
  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    themeLabel.textContent = next === 'dark' ? 'Dark' : 'Light';
    localStorage.setItem('mkcv_theme', next);
  });

  /* Resizable split */
  const handle      = document.getElementById('gutter-handle');
  const split       = document.getElementById('split');
  const editorPane  = document.getElementById('editor-pane');
  const previewPane = document.getElementById('preview-pane');
  let dragging = false;
  let refitTimer = null;
  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  handle.addEventListener('dblclick', () => {
    editorPane.style.flex  = '1 1 50%';
    previewPane.style.flex = '1 1 50%';
    preview.refit();
  });
  _addDocListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = split.getBoundingClientRect();
    const pct  = Math.max(20, Math.min(80, ((e.clientX - rect.left) / rect.width) * 100));
    editorPane.style.flex  = `1 1 ${pct}%`;
    previewPane.style.flex = `1 1 ${100 - pct}%`;
    clearTimeout(refitTimer);
    refitTimer = setTimeout(() => { preview.refit(); }, 80);
  });
  _addDocListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    preview.refit();
  });

  /* Status strip — lines + save state */
  let saveTimer = null;
  function updateLineCount() {
    const yaml  = (settingsSync && settingsSync.activeTab === 'settings')
      ? settingsSync.getYaml()
      : (app.state.yaml || '');
    const lines = yaml.split('\n').length;
    const kb    = (new TextEncoder().encode(yaml).length / 1024).toFixed(1);
    const stat  = document.getElementById('lines-stat');
    const meta  = document.getElementById('editor-meta');
    if (stat) stat.textContent = `${lines} ln · ${kb} kb`;
    if (meta) meta.textContent = `${lines} lines`;
  }
  function markSaving() {
    const dot  = document.getElementById('save-dot');
    const text = document.getElementById('save-text');
    if (dot)  { dot.classList.remove('idle'); dot.classList.add('warn'); }
    if (text)  text.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (dot)  { dot.classList.remove('warn'); dot.classList.add('idle'); }
      if (text)  text.textContent = 'All changes saved';
      updateLineCount();
    }, 1200);
  }
  function updateCursorPos() {
    const pos = editorAdapter.getCursor();
    const el  = document.getElementById('cursor-pos');
    if (el) el.textContent = `ln ${pos.line + 1}, col ${pos.ch + 1}`;
  }

  // initEditorAdapter() has already run before initUIWiring(), so editorAdapter
  // is ready to use directly — no 'editorReady' event fallback needed.
  editorAdapter.onChange(() => { updateLineCount(); markSaving(); });
  editorAdapter.onCursorActivity(updateCursorPos);
  updateLineCount();
  updateCursorPos();

  /* Reset-all button */

  const resetAllModal   = document.getElementById('reset-all-modal');
  const resetAllBtn     = document.getElementById('btn-reset-all');
  const resetAllCancel  = document.getElementById('reset-all-cancel');
  const resetAllConfirm = document.getElementById('reset-all-confirm');

  resetAllBtn.addEventListener('click', () => {
    resetAllModal.classList.add('open');
  });
  resetAllCancel.addEventListener('click', () => {
    resetAllModal.classList.remove('open');
  });
  resetAllModal.addEventListener('click', (e) => {
    if (e.target === resetAllModal) resetAllModal.classList.remove('open');
  });
  resetAllConfirm.addEventListener('click', () => {
    clearMkcvStorage(); // exported function
    location.reload();
  });

  // ── Lang toggle ──────────────────────────────────────────────────────────
  const langToggleEl = document.getElementById('lang-toggle');
  if (langToggleEl) {
    langToggleEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.lang-btn');
      if (!btn) return;
      const lang = btn.dataset.lang;
      app.setLang(lang);
      langToggleEl.querySelectorAll('.lang-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.lang === lang)
      );
    });
    // Sync button state to current lang on load
    langToggleEl.querySelectorAll('.lang-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.lang === app.state.lang)
    );
  }

  // ── Onboarding help button ────────────────────────────────────────────────
  const helpBtn = document.getElementById('onboarding-help-btn');
  if (helpBtn) helpBtn.addEventListener('click', () => onboarding.show());
}
