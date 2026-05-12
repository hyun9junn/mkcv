// Sections panel — chip drag, hide/show, reset modal, undo toast.
// Phase 2: converted from IIFE-on-window to ESM. The aggregate `sectionsUI`
// export preserves the shape `window.sectionsUI` previously had so still-IIFE
// callers continue to work via the `window.sectionsUI = sectionsUI` shim in
// main.js.

import { app } from './app.js';
import { sectionsState } from './sections-state.js';
import { preview } from './preview.js';

let _panel = null;
let _panelDragActive = false;

/* ── Edge-scroll state ── */
let _scrollRAF   = null;
let _scrollDir   = 0;    // -1 = left, +1 = right, 0 = none
let _scrollSpeed = 0;

// Test-only hook — reset module-private state and rebind the panel without
// needing to invoke `initSectionsUI`. Tests that exercise `buildPanel`
// in isolation use this to swap in a fresh mock panel between cases.
export function _setPanelForTesting(panel) {
  _panel = panel;
  _panelDragActive = false;
  _scrollRAF = null;
  _scrollDir = 0;
  _scrollSpeed = 0;
}

function _tickScroll() {
  if (_scrollDir === 0) { _scrollRAF = null; return; }
  _panel.scrollLeft += _scrollDir * _scrollSpeed;
  _scrollRAF = requestAnimationFrame(_tickScroll);
}

function _updateScrollZone(clientX) {
  const ZONE      = 60;
  const MAX_SPEED = 8;
  const pr        = _panel.getBoundingClientRect();
  const distLeft  = clientX - pr.left;
  const distRight = pr.right - clientX;
  if (distLeft < ZONE && distLeft <= distRight) {
    _scrollDir   = -1;
    _scrollSpeed = (1 - distLeft  / ZONE) * MAX_SPEED;
  } else if (distRight < ZONE) {
    _scrollDir   = 1;
    _scrollSpeed = (1 - distRight / ZONE) * MAX_SPEED;
  } else {
    _scrollDir   = 0;
    _scrollSpeed = 0;
  }
  if (_scrollDir !== 0 && !_scrollRAF) {
    _scrollRAF = requestAnimationFrame(_tickScroll);
  }
}

function _stopScroll() {
  _scrollDir = 0; _scrollSpeed = 0;
  if (_scrollRAF) { cancelAnimationFrame(_scrollRAF); _scrollRAF = null; }
}

function _escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildPanel() {
  const presentKeys = sectionsState.getExpandedPresentKeys(app.state.yaml);

  for (const key of presentKeys) {
    sectionsState.ensureInOrder(key);
  }

  const order    = sectionsState.getOrder();
  const presentSet = new Set(presentKeys);
  const settings = window.settingsSync ? window.settingsSync.getSettings() : null;

  _panel.innerHTML = "";

  for (const key of order) {
    const def    = sectionsState.getDef(key, app.state.yaml);
    const present = presentSet.has(key);
    if (!def) continue;
    const sectionTitle = settings?.sections?.find(s => s.key === key)?.title ?? def.label;

    const hidden = present && sectionsState.isHidden(key);

    const chip = document.createElement("div");
    chip.className =
      "chip" +
      ((!hidden && present) ? " on" : "") +
      (hidden ? " hidden" : "") +
      (!present ? " absent" : "");
    chip.dataset.key = key;

    chip.innerHTML = `
      <span class="chip-grip"><span></span><span></span><span></span></span>
      <span class="chip-dot"></span>
      <span class="chip-name">${_escHtml(sectionTitle)}</span>
    `;

    const dot = chip.querySelector(".chip-dot");
    dot.title = present
      ? (hidden ? `Show ${sectionTitle}` : `Hide ${sectionTitle}`)
      : `${sectionTitle} — not in YAML`;
    dot.style.cursor = "pointer";

    let justDragged = false;

    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      if (justDragged) { justDragged = false; return; }
      if (!present) {
        if (sectionsState.SECTION_DEFS[key]) {
          if (_appendDefaultSection(key)) {
            const wasHidden = sectionsState.isHidden(key);
            if (wasHidden) {
              sectionsState.toggleHidden(key, { skipResumeSync: true });
            }
            buildPanel();
            if (!wasHidden) {
              preview.refresh(
                sectionsState.getOrderedFilteredYaml(app.state.yaml),
                app.state.template
              );
            }
            _showToast(`${sectionTitle} added`, "info");
          }
        } else {
          _showToast(`Add a \`${key}:\` key to include this section.`, "info");
        }
        return;
      }
      if (!window.settingsSync) {
        const currentYaml = app.state.yaml || '';
        const newYaml = hidden
          ? sectionsState.moveFromInvisible(currentYaml, key)
          : sectionsState.moveToInvisible(currentYaml, key);
        if (newYaml !== currentYaml) {
          window.editorAdapter.suppressNextPreviewRefresh();
          window.editorAdapter.setValuePreserveScroll(newYaml);
          app.setState({ yaml: newYaml });
        }
      }
      sectionsState.toggleHidden(key);
      buildPanel();
      // preview refresh is handled by notifySectionStateChange via monkey-patched toggleHidden
    });

    const nameSpan = chip.querySelector(".chip-name");
    nameSpan.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      if (!present) return;
      const previousTitle = sectionTitle;
      nameSpan.style.display = "none";
      const input = document.createElement("input");
      input.className = "chip-name-input";
      input.value = previousTitle;
      input.style.width = Math.max(40, previousTitle.length * 8) + "px";
      nameSpan.parentNode.insertBefore(input, nameSpan.nextSibling);
      input.focus();
      input.select();

      let committed = false;
      function commit() {
        if (committed) return;
        committed = true;
        const newTitle = input.value.trim() || previousTitle;
        if (newTitle !== previousTitle && window.settingsSync) {
          window.settingsSync.updateSectionTitle(key, newTitle);
          buildPanel();
        } else {
          input.remove();
          nameSpan.style.display = '';
        }
      }
      function cancel() {
        if (committed) return;
        committed = true;
        buildPanel();
      }
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); commit(); }
        if (ev.key === "Escape") { ev.preventDefault(); cancel(); }
      });
      input.addEventListener("blur", commit);
    });

    {
      let dragClone = null;
      let cloneH = 0;
      let offsetX = 0, offsetY = 0;
      let startX = 0, startY = 0;
      let dragging = false;
      let startOrder = [];
      let activePointerId = -1;

      function onMove(e) {
        if (e.pointerId !== activePointerId) return;
        if (!dragging) {
          if (Math.abs(e.clientX - startX) <= 4 && Math.abs(e.clientY - startY) <= 4) return;
          dragging = true;
          _panelDragActive = true;
          const rect = chip.getBoundingClientRect();
          cloneH = rect.height;
          dragClone = chip.cloneNode(true);
          dragClone.className = chip.className.replace(/\bdragging\b/, "").trim() + " chip-drag-clone";
          dragClone.style.width = rect.width + "px";
          document.body.appendChild(dragClone);
          chip.classList.add("dragging");
        }
        _updateScrollZone(e.clientX);
        const pr      = _panel.getBoundingClientRect();
        const cloneW  = parseFloat(dragClone.style.width);
        const rawLeft = e.clientX - offsetX;
        const rawTop  = e.clientY - offsetY;
        dragClone.style.left = Math.max(pr.left, Math.min(rawLeft, pr.right  - cloneW)) + "px";
        dragClone.style.top  = Math.max(pr.top,  Math.min(rawTop,  pr.bottom - cloneH)) + "px";
        const siblings = [..._panel.querySelectorAll(".chip:not(.dragging)")];
        const before = siblings.find(s => {
          const r = s.getBoundingClientRect();
          return e.clientX < r.left + r.width / 2;
        });
        if (before) _panel.insertBefore(chip, before);
        else _panel.appendChild(chip);
      }

      function cleanUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onCancel);
        activePointerId = -1;
        _stopScroll();
      }

      function endDrag() {
        cleanUp();
        if (!dragging) return;
        dragging = false;
        _panelDragActive = false;
        justDragged = true;
        dragClone.remove();
        dragClone = null;
        chip.classList.remove("dragging");
        const newOrder = [..._panel.querySelectorAll(".chip")].map(c => c.dataset.key);
        sectionsState.setOrder(newOrder);
        buildPanel();
        // preview refresh handled by notifySectionStateChange via monkey-patched setOrder
      }

      function onUp(e) {
        if (e.pointerId !== activePointerId) return;
        endDrag();
      }

      function onCancel(e) {
        if (e.pointerId !== activePointerId) return;
        cleanUp();
        if (!dragging) return;
        dragging = false;
        _panelDragActive = false;
        dragClone.remove();
        dragClone = null;
        chip.classList.remove("dragging");
        sectionsState.setOrder(startOrder);
        buildPanel();
        // preview refresh handled by notifySectionStateChange via monkey-patched setOrder
      }

      chip.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        startOrder = sectionsState.getOrder().slice();
        activePointerId = e.pointerId;
        const rect = chip.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        startX = e.clientX;
        startY = e.clientY;
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onCancel);
      });
    }

    _panel.appendChild(chip);
  }
}

/* ── Modal state ── */
let _modal        = null;
let _modalTitle   = null;
let _modalCancel  = null;
let _modalConfirm = null;

/* ── Undo toast state ── */
let _undoToast  = null;
let _undoMsg    = null;
let _undoBtn    = null;
let _toastTimer   = null;
let _pendingUndo  = null;

function _hideUndoToast() {
  clearTimeout(_toastTimer);
  _undoToast.style.display = "none";
  _pendingUndo = null;
}

function _showUndoToast(label, key, previousSectionYaml) {
  _hideUndoToast();
  _pendingUndo = { key, previousSectionYaml };
  _undoMsg.textContent = `${label} reset`;
  _undoToast.style.display = "flex";
  _toastTimer = setTimeout(_hideUndoToast, 5000);
}

/* Shared toast (uses #toast-stack if available, else alert) */
function _showToast(msg, type = "info") {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.innerHTML = `<div class="toast-msg">${msg}</div><button class="toast-close">×</button>`;
  t.querySelector(".toast-close").addEventListener("click", () => t.remove());
  stack.appendChild(t);
  setTimeout(() => {
    t.style.animation = "toastIn .2s ease reverse both";
    setTimeout(() => t.remove(), 220);
  }, 3800);
}

function _appendDefaultSection(key) {
  const def = sectionsState.SECTION_DEFS[key];
  if (!def || !def.yaml) return false;
  const current = app.state.yaml || '';
  const order = typeof sectionsState.getOrder === "function" ? sectionsState.getOrder() : [];
  const hidden = order.filter((candidate) => candidate !== key && sectionsState.isHidden(candidate));
  const structuralYaml = typeof sectionsState.materializeSection === "function"
    ? sectionsState.materializeSection(current, key, order, hidden)
    : sectionsState.appendToMainArea(current, def.yaml);
  const newYaml = typeof window.settingsSync?.formatResumeSectionTitleComments === "function"
    ? window.settingsSync.formatResumeSectionTitleComments(structuralYaml)
    : structuralYaml;
  if (!window.settingsSync || window.settingsSync.activeTab === 'resume') {
    window.editorAdapter.suppressNextPreviewRefresh();
    window.editorAdapter.setValuePreserveScroll(newYaml);
  }
  app.setState({ yaml: newYaml });
  return true;
}

export function showResetModal(key) {
  const def = sectionsState.SECTION_DEFS[key];
  if (!def) return;
  _modalTitle.textContent = `Reset ${def.label}?`;
  _modal.classList.add("open");

  function onConfirm() {
    _modal.classList.remove("open");
    cleanup();
    const result = sectionsState.resetSectionYaml(key, app.state.yaml);
    if (!result) return;
    if (!window.settingsSync || window.settingsSync.activeTab === 'resume') {
      window.editorAdapter.setValue(result.newYaml);
    }
    app.setState({ yaml: result.newYaml });
    _showUndoToast(def.label, key, result.previousYaml);
  }
  function onCancel() { _modal.classList.remove("open"); cleanup(); }
  function onBackdrop(e) { if (e.target === _modal) { _modal.classList.remove("open"); cleanup(); } }
  function cleanup() {
    _modalConfirm.removeEventListener("click", onConfirm);
    _modalCancel.removeEventListener("click", onCancel);
    _modal.removeEventListener("click", onBackdrop);
  }

  _modalConfirm.addEventListener("click", onConfirm);
  _modalCancel.addEventListener("click", onCancel);
  _modal.addEventListener("click", onBackdrop);
}

export const sectionsUI = { buildPanel, showResetModal };

export function initSectionsUI() {
  _panel = document.getElementById("sections-panel");

  _modal        = document.getElementById("reset-modal");
  _modalTitle   = document.getElementById("reset-modal-title");
  _modalCancel  = document.getElementById("reset-modal-cancel");
  _modalConfirm = document.getElementById("reset-modal-confirm");

  _undoToast  = document.getElementById("undo-toast");
  _undoMsg    = document.getElementById("undo-toast-message");
  _undoBtn    = document.getElementById("undo-toast-btn");

  _undoBtn.addEventListener("click", () => {
    if (!_pendingUndo) return;
    const { key, previousSectionYaml } = _pendingUndo;
    const restored = sectionsState.restoreSectionYaml(key, previousSectionYaml, app.state.yaml);
    if (restored) {
      if (!window.settingsSync || window.settingsSync.activeTab === 'resume') {
        window.editorAdapter.setValue(restored);
      }
      app.setState({ yaml: restored });
    }
    _hideUndoToast();
  });

  buildPanel();
  let buildTimer = null;
  window.editorAdapter.onChange(() => {
    clearTimeout(buildTimer);
    buildTimer = setTimeout(() => { if (!_panelDragActive) buildPanel(); }, 300);
  });
}
