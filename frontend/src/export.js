// Export dialog — filename modal and file download. Phase 2: converted from
// IIFE-on-window to ESM. The aggregate `exporter` export preserves the shape
// `window.exporter` previously had so still-IIFE callers continue to work via
// the compat shim in main.js.

import { app } from './app.js';
import { sectionsState } from './sections-state.js';
import { settingsSync } from './settings-sync.js';
import { yamlBackup } from './yaml-backup.js';

function _triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function _defaultFilename(format) {
  if (format === "yaml-backup") {
    return `mkcv-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  }
  const ext = { markdown: "md", latex: "tex", pdf: "pdf" }[format];
  try {
    const parsed = jsyaml.load(app.state.yaml);
    const name = parsed?.personal?.name;
    if (name && typeof name === "string" && name.trim()) {
      const slug = name.trim().toLowerCase().replace(/\s+/g, "_");
      return `${slug}_cv.${ext}`;
    }
  } catch {}
  return `cv.${ext}`;
}

let _pendingFormat = null;

function openFilenameModal(format) {
  _pendingFormat = format;
  const input = document.getElementById("filename-input");
  input.value = _defaultFilename(format);
  input.placeholder = _defaultFilename(format);
  document.getElementById("filename-modal").classList.add("open");
  input.focus();
  input.select();
}

function _closeFilenameModal() {
  document.getElementById("filename-modal").classList.remove("open");
  _pendingFormat = null;
}

async function _exportFile(format, filename) {
  if (format === "yaml-backup") {
    const trimmed = filename.trim();
    const finalName = trimmed
      ? (trimmed.includes(".") ? trimmed : `${trimmed}.zip`)
      : _defaultFilename("yaml-backup");
    try {
      await yamlBackup.exportZipNamed(finalName);
    } catch {
      alert("Export failed");
    }
    return;
  }

  const ext = { markdown: "md", latex: "tex", pdf: "pdf" }[format];
  const trimmed = filename.trim();
  const finalName = trimmed
    ? (trimmed.includes(".") ? trimmed : `${trimmed}.${ext}`)
    : `cv.${ext}`;

  const _settings = settingsSync ? settingsSync.getSettings() : null;
  const section_titles = _settings
    ? Object.fromEntries(_settings.sections.map(s => [s.key, s.title]))
    : {};
  const body = {
    yaml: sectionsState.getOrderedFilteredYaml(app.state.yaml),
    template: app.state.template,
    section_order: sectionsState.getVisibleOrder(app.state.yaml),
    section_titles,
  };
  if (format !== "markdown") {
    body.density = app.state.density;
    body.font_scale = app.state.font_scale;
    body.link_display = app.state.link_display;
    body.personal_fields = app.state.personal_fields ?? [];
  }
  try {
    const resp = await fetch(`/api/export/${format}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.json();
      alert(`Export failed: ${err.message}`);
      return;
    }
    _triggerDownload(await resp.blob(), finalName);
  } catch {
    alert("Export failed: network error");
  }
}

export function initExporter() {
  document.getElementById("btn-md").addEventListener("click", () => openFilenameModal("markdown"));
  document.getElementById("btn-tex").addEventListener("click", () => openFilenameModal("latex"));
  document.getElementById("btn-pdf").addEventListener("click", () => openFilenameModal("pdf"));

  document.getElementById("filename-modal-cancel").addEventListener("click", _closeFilenameModal);

  document.getElementById("filename-modal-confirm").addEventListener("click", () => {
    const input = document.getElementById("filename-input");
    if (!input.value.trim()) return;
    const fmt = _pendingFormat;
    if (!fmt) return;
    _closeFilenameModal();
    _exportFile(fmt, input.value);
  });

  document.getElementById("filename-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const input = e.currentTarget;
      if (!input.value.trim()) return;
      const fmt = _pendingFormat;
      if (!fmt) return;
      _closeFilenameModal();
      _exportFile(fmt, input.value);
    } else if (e.key === "Escape") {
      _closeFilenameModal();
    }
  });

  document.getElementById("filename-modal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) _closeFilenameModal();
  });
}

export const exporter = { openFilenameModal };
