// YAML backup/restore — zip export and zip import. Phase 2: converted from
// IIFE-on-window to ESM. The aggregate `yamlBackup` export preserves the shape
// `window.yamlBackup` previously had so still-IIFE callers continue to work via
// the compat shim in main.js.

/* global JSZip, jsyaml */

import { editorAdapter } from './editor-adapter.js';
import { settingsSync } from './settings-sync.js';
import { exporter } from './export.js';
import { SETTINGS_HELPERS } from './settings-engine.js';

const { parseSettings } = SETTINGS_HELPERS;

function _toast(msg, type = 'info') {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-title">${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function _download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function _todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function _buildZipBlob() {
  const resumeYaml = editorAdapter.getValue();
  const settingsYaml = settingsSync.getYaml();
  const zip = new JSZip();
  zip.file('resume.yaml', resumeYaml);
  zip.file('settings.yaml', settingsYaml);
  return zip.generateAsync({ type: 'blob' });
}

async function exportZip() {
  _download(await _buildZipBlob(), `mkcv-backup-${_todayStr()}.zip`);
}

async function exportZipNamed(filename) {
  _download(await _buildZipBlob(), filename);
}

let _pendingResume = null;
let _pendingSettings = null;

function _openModal(resumeYaml, settingsYaml) {
  _pendingResume = resumeYaml;
  _pendingSettings = settingsYaml;
  const files = [
    resumeYaml !== null && 'resume.yaml',
    settingsYaml !== null && 'settings.yaml',
  ].filter(Boolean).join(' and ');
  document.getElementById('import-modal-body').textContent =
    `This will replace your current ${files} with the contents of the backup. Continue?`;
  document.getElementById('import-modal').classList.add('open');
}

function _closeModal() {
  document.getElementById('import-modal').classList.remove('open');
  _pendingResume = null;
  _pendingSettings = null;
}

function _applyImport() {
  if (_pendingResume !== null) editorAdapter.setValue(_pendingResume);
  if (_pendingSettings !== null) settingsSync.setYaml(_pendingSettings);
  _closeModal();
}

async function importZip(file) {
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    _toast('Could not read zip file', 'warn');
    return;
  }

  try {
    const resumeFile = zip.file('resume.yaml');
    const settingsFile = zip.file('settings.yaml');

    if (!resumeFile && !settingsFile) {
      _toast('No YAML files found in this backup', 'warn');
      return;
    }

    const resumeYaml = resumeFile ? await resumeFile.async('string') : null;
    const settingsYaml = settingsFile ? await settingsFile.async('string') : null;

    if (resumeYaml !== null) {
      try { jsyaml.load(resumeYaml); }
      catch { _toast('Invalid YAML in `resume.yaml`', 'warn'); return; }
    }
    if (settingsYaml !== null) {
      const { errors } = parseSettings(settingsYaml);
      if (errors.length) { _toast('Invalid YAML in `settings.yaml`', 'warn'); return; }
    }

    _openModal(resumeYaml, settingsYaml);
  } catch {
    _toast('Could not read zip file', 'warn');
  }
}

export function initYamlBackup() {
  document.getElementById('btn-yaml-export').addEventListener('click', () => {
    exporter.openFilenameModal('yaml-backup');
  });
  document.getElementById('btn-yaml-import').addEventListener('click', () => {
    document.getElementById('import-yaml-input').click();
  });
  document.getElementById('import-yaml-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) importZip(file).catch(() => _toast('Import failed', 'warn'));
  });
  document.getElementById('import-modal-cancel').addEventListener('click', _closeModal);
  document.getElementById('import-modal-confirm').addEventListener('click', _applyImport);
  document.getElementById('import-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) _closeModal();
  });
}

export const yamlBackup = { exportZip, exportZipNamed, importZip };
