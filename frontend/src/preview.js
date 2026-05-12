// Preview pane — wraps PDF rendering, debounced refresh, and request scheduling.
// Phase 2: converted from IIFE-on-window to ESM. The aggregate `preview` export
// preserves the shape the previous `window.preview` object had so still-IIFE
// callers continue to work via the `window.preview = preview` shim in main.js.

import * as pdfjsLibReal from 'pdfjs-dist';
import { app } from './app.js';
import { sectionsState } from './sections-state.js';

// `_pdfjsLib` is a module-private reference so tests can substitute the
// `getDocument` implementation via `_setPdfjsLibForTesting()`. Production code
// always uses the real `pdfjs-dist` import.
let _pdfjsLib = pdfjsLibReal;

// Test-only hook — replace the bound `pdfjs-dist` namespace.
export function _setPdfjsLibForTesting(lib) {
  _pdfjsLib = lib || pdfjsLibReal;
}

// Test-only hook — reset every module-private state variable so tests start
// from a clean slate without needing to bust the ESM import cache.
export function _resetForTesting() {
  _container = null;
  _loading = null;
  _errorEl = null;
  _previewDebounceMs = DEFAULT_PREVIEW_DEBOUNCE_MS;
  if (_timer != null) {
    try { clearTimeout(_timer); } catch (_) {}
  }
  _timer = null;
  _activePdf = null;
  _zoomLevel = 1.0;
  _abortController = null;
  _inFlight = false;
  _pendingRequestBody = null;
  _pendingRequestSignature = null;
  _activeRequestSignature = null;
  _lastAppliedRequestSignature = null;
  _previewRequestSeq = 0;
  _pdfjsLib = pdfjsLibReal;
}

const DEFAULT_PREVIEW_DEBOUNCE_MS = 900;
const GIF_CAPTURE_PREVIEW_DEBOUNCE_MS = 200;

function _getPreviewDebounceMs() {
  try {
    const params = new URLSearchParams(window.location?.search || "");
    if (params.get("capture") === "gif") return GIF_CAPTURE_PREVIEW_DEBOUNCE_MS;
  } catch (_) {
    // Fall through to the default debounce when URL parsing is unavailable.
  }
  return DEFAULT_PREVIEW_DEBOUNCE_MS;
}

// Module-private state.
let _container = null;
let _loading = null;
let _errorEl = null;
let _previewDebounceMs = DEFAULT_PREVIEW_DEBOUNCE_MS;
let _timer = null;
let _activePdf = null;
let _zoomLevel = 1.0;
let _abortController = null;
let _inFlight = false;
let _pendingRequestBody = null;
let _pendingRequestSignature = null;
let _activeRequestSignature = null;
let _lastAppliedRequestSignature = null;
let _previewRequestSeq = 0;
const _previewSessionId = _createPreviewSessionId();

function _createPreviewSessionId() {
  return `preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function _showLoading() {
  _loading.style.display = "flex";
  _errorEl.style.display = "none";
}

function _clearError() {
  _errorEl.style.display = "none";
  _errorEl.innerHTML = "";
}

function _showError(message, details) {
  _loading.style.display = "none";
  _errorEl.style.display = "block";
  const detailHtml = details && details.length
    ? "<pre>" + details.map(d => d.replace(/&/g,"&amp;").replace(/</g,"&lt;")).join("\n") + "</pre>"
    : "";
  const safeMsg = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  _errorEl.innerHTML = `<strong>Preview error:</strong> ${safeMsg}${detailHtml}`;
}

function _updateZoomDisplay() {
  const el = document.getElementById("preview-zoom-label");
  if (el) el.textContent = Math.round(_zoomLevel * 100) + "%";
}

async function _renderPages(pdf, shouldSkipApply) {
  if (!pdf) return false;
  const savedScrollTop  = _container.scrollTop;
  const savedScrollLeft = _container.scrollLeft;

  const dpr = window.devicePixelRatio || 1;
  const basePxWidth = Math.max(_container.clientWidth - 32, 400);
  const scale = (basePxWidth / 612) * dpr * _zoomLevel;

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display:flex;flex-direction:column;align-items:center;padding:16px;gap:16px;min-width:fit-content;";

  for (let i = 1; i <= pdf.numPages; i++) {
    if (shouldSkipApply && shouldSkipApply()) {
      if (pdf.destroy) pdf.destroy();
      return false;
    }
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.cssText = `width:${viewport.width / dpr}px;height:${viewport.height / dpr}px;display:block;box-shadow:0 2px 8px rgba(0,0,0,0.5);`;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    if (shouldSkipApply && shouldSkipApply()) {
      if (pdf.destroy) pdf.destroy();
      return false;
    }
    wrapper.appendChild(canvas);
  }

  if (shouldSkipApply && shouldSkipApply()) {
    if (pdf.destroy) pdf.destroy();
    return false;
  }
  if (_activePdf && _activePdf !== pdf) { _activePdf.destroy(); }
  _activePdf = pdf;
  _container.innerHTML = "";
  _container.appendChild(wrapper);
  _container.scrollTop = savedScrollTop;
  _container.scrollLeft = savedScrollLeft;

  _loading.style.display = "none";
  _errorEl.style.display = "none";
  _updateZoomDisplay();
  return true;
}

async function _renderPdf(arrayBuffer, shouldSkipApply) {
  const pdf = await _pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  if (shouldSkipApply && shouldSkipApply()) {
    if (pdf.destroy) pdf.destroy();
    return false;
  }
  return _renderPages(pdf, shouldSkipApply);
}

function _setZoom(level) {
  _zoomLevel = Math.max(0.25, Math.min(4.0, level));
  _renderPages(_activePdf);
}

export function zoomIn()    { _setZoom(_zoomLevel * 1.1); }
export function zoomOut()   { _setZoom(_zoomLevel / 1.1); }
export function resetZoom() { _setZoom(1.0); }
export function setZoom(level) { _setZoom(level); }
export function refit() { _renderPages(_activePdf); }

function _buildRequestBody(payload) {
  const settings = window.settingsSync ? window.settingsSync.getSettings() : null;
  return {
    yaml: payload.yaml,
    template: payload.template,
    section_order: Array.isArray(payload.section_order) ? payload.section_order.slice() : [],
    section_titles: settings
      ? Object.fromEntries(settings.sections.map(s => [s.key, s.title]))
      : {},
    density: app.state.density,
    font_scale: app.state.font_scale,
    link_display: app.state.link_display,
    personal_fields: Array.isArray(app.state.personal_fields)
      ? app.state.personal_fields.map((field) => ({ ...field }))
      : [],
  };
}

function _getRequestSignature(requestBody) {
  return JSON.stringify(requestBody);
}

async function _sendPreview(requestBody, requestSignature) {
  _abortController = new AbortController();
  const { signal } = _abortController;
  const requestSeq = ++_previewRequestSeq;
  _activeRequestSignature = requestSignature;
  let applied = false;

  _inFlight = true;
  _showLoading();
  try {
    const resp = await fetch("/api/preview/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...requestBody,
        preview_session_id: _previewSessionId,
        preview_request_seq: requestSeq,
      }),
      signal,
    });
    if (signal.aborted) return;
    if (!resp.ok) {
      const err = await resp.json();
      if (err && err.error === "stale_preview") return;
      _showError(err.message, err.details);
      return;
    }
    const arrayBuffer = await resp.arrayBuffer();
    if (_pendingRequestBody) return;
    applied = await _renderPdf(arrayBuffer, () => _pendingRequestBody !== null);
  } catch (e) {
    if (e.name === 'AbortError') return;
    _showError("Preview unavailable — " + (e.message || "network error"), []);
  } finally {
    _inFlight = false;
    _abortController = null;
    if (applied) _lastAppliedRequestSignature = requestSignature;
    _activeRequestSignature = null;
    if (_pendingRequestBody) {
      const nextRequestBody = _pendingRequestBody;
      const nextRequestSignature = _pendingRequestSignature;
      _pendingRequestBody = null;
      _pendingRequestSignature = null;
      _sendPreview(nextRequestBody, nextRequestSignature);
    }
  }
}

export function refresh(yaml, template) {
  const requestBody = _buildRequestBody({
    yaml,
    template,
    section_order: sectionsState.getVisibleOrder(app.state.yaml),
  });
  const requestSignature = _getRequestSignature(requestBody);

  if (_inFlight) {
    if (requestSignature === _pendingRequestSignature) return;
    if (requestSignature === _activeRequestSignature) {
      _pendingRequestBody = null;
      _pendingRequestSignature = null;
      return;
    }
    _pendingRequestBody = requestBody;
    _pendingRequestSignature = requestSignature;
    return;
  }

  if (requestSignature === _lastAppliedRequestSignature) {
    _loading.style.display = "none";
    _clearError();
    return;
  }

  _pendingRequestBody = null;
  _pendingRequestSignature = null;
  _sendPreview(requestBody, requestSignature);
}

export const preview = { refresh, zoomIn, zoomOut, resetZoom, setZoom, refit };

export function initPreview() {
  _container = document.getElementById("preview-frame");
  _loading = document.getElementById("preview-loading");
  _errorEl = document.getElementById("preview-error");
  _previewDebounceMs = _getPreviewDebounceMs();

  _container.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    }
  }, { passive: false });

  window.editorAdapter.onChange(() => {
    if (window.settingsSync && window.settingsSync.activeTab === 'settings') return;
    if (window.editorAdapter.consumeSuppressedPreviewRefresh()) return;
    clearTimeout(_timer);
    _timer = setTimeout(() => {
      if (app.state.yaml.trim()) {
        refresh(sectionsState.getOrderedFilteredYaml(app.state.yaml), app.state.template);
      }
    }, _previewDebounceMs);
  });
  setTimeout(() => {
    if (app.state.yaml.trim()) {
      refresh(sectionsState.getOrderedFilteredYaml(app.state.yaml), app.state.template);
    }
  }, 200);
}
