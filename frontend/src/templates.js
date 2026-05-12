// Template picker UI and registry. Phase 2: converted from IIFE-on-window to
// ESM. The aggregate `templateRegistry` and `templateUI` exports preserve the
// shapes `window.templateRegistry` and `window.templateUI` previously had so
// still-IIFE callers continue to work via the compat shims in main.js.

import { app } from './app.js';
import { sectionsState } from './sections-state.js';
import { SETTINGS_HELPERS } from './settings-engine.js';
import { preview } from './preview.js';

// ---------------------------------------------------------------------------
// Template registry — metadata storage
// ---------------------------------------------------------------------------
let _allMeta = {};

function _clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function setAllMeta(meta) {
  _allMeta = meta && typeof meta === "object" ? meta : {};
}

function getAllMeta() {
  return _clone(_allMeta) || {};
}

function getMeta(name) {
  return _clone(_allMeta[name]) || {};
}

function getDefaults(name) {
  const defaults = _allMeta[name]?.defaults;
  return defaults && typeof defaults === "object" ? _clone(defaults) : null;
}

export const templateRegistry = { setAllMeta, getAllMeta, getMeta, getDefaults };

// ---------------------------------------------------------------------------
// Template UI — picker chrome, selection, defaults
// ---------------------------------------------------------------------------
let _controls = {
  wrapper: null,
  trigger: null,
  dropdown: null,
  nameDisplay: null,
};
let _availableTemplates = new Set();

// Test-only hook — reset module-private state for both `templateRegistry`
// and `templateUI` between tests.
export function _resetForTesting() {
  _allMeta = {};
  _controls = { wrapper: null, trigger: null, dropdown: null, nameDisplay: null };
  _availableTemplates = new Set();
}

function _defaultTemplate() {
  return SETTINGS_HELPERS?.DEFAULT_SETTINGS?.template || "classic";
}

function _isValidTemplate(name) {
  return Array.isArray(SETTINGS_HELPERS?.VALID_TPL) && SETTINGS_HELPERS.VALID_TPL.includes(name);
}

function _resolveTemplate(name) {
  const candidate = typeof name === "string" ? name : String(name ?? "");
  if (_isValidTemplate(candidate) || _availableTemplates.has(candidate)) return candidate;
  return _defaultTemplate();
}

function _fallbackDisplayName(name) {
  return String(name || _defaultTemplate())
    .split("-")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function _getDisplayName(name) {
  const meta = templateRegistry.getMeta(name);
  return meta.display_name || _fallbackDisplayName(name);
}

function _getPreviewYaml() {
  if (typeof sectionsState.getOrderedFilteredYaml === "function") {
    return sectionsState.getOrderedFilteredYaml(app.state.yaml);
  }
  if (typeof sectionsState.getFilteredYaml === "function") {
    return sectionsState.getFilteredYaml(app.state.yaml);
  }
  return app.state.yaml;
}

export function openDropdown() {
  if (!_controls.dropdown || !_controls.trigger) return;
  _controls.dropdown.hidden = false;
  _controls.trigger.style.borderColor = "var(--rule-2)";
}

export function closeDropdown() {
  if (!_controls.dropdown || !_controls.trigger) return;
  _controls.dropdown.hidden = true;
  _controls.trigger.style.borderColor = "";
}

function _syncSelectedOption(name) {
  _controls.dropdown?.querySelectorAll(".tpl-card").forEach(el => {
    el.classList.toggle("selected", el.dataset.name === name);
  });
}

function _updateTemplateChrome(name) {
  const displayName = _getDisplayName(name);
  _syncSelectedOption(name);
  if (_controls.nameDisplay) _controls.nameDisplay.textContent = displayName;

  const paneTitle = document.getElementById("preview-pane-title");
  if (paneTitle) paneTitle.textContent = `Preview — ${displayName}`;
  return displayName;
}

export function selectTemplate(name, opts = {}) {
  const resolved = _resolveTemplate(name);
  _updateTemplateChrome(resolved);
  if (opts.closeDropdown !== false) closeDropdown();

  const templateChanged = app.state.template !== resolved;
  app.setState({ template: resolved });

  const shouldSyncSettings = opts.syncSettings !== false;
  const shouldApplyDefaults = opts.applyDefaults ?? true;
  const shouldRefreshPreview = opts.refreshPreview !== false;

  if (!templateChanged && opts.force !== true && !shouldSyncSettings && !shouldApplyDefaults && !shouldRefreshPreview) {
    return resolved;
  }

  if (shouldSyncSettings && window.settingsSync?.updateFromToolbar) {
    window.settingsSync.updateFromToolbar(next => {
      next.template = resolved;
    }, { skipApply: true, skipPreview: true });
  }

  if (shouldApplyDefaults && window.settingsSync?.applyTemplateDefaults) {
    window.settingsSync.applyTemplateDefaults(
      templateRegistry.getDefaults(resolved),
      { skipPreview: true }
    );
  }

  if (shouldRefreshPreview) {
    preview.refresh(_getPreviewYaml(), resolved);
  }

  return resolved;
}

export function setControls(nextControls = {}) {
  _controls = { ..._controls, ...nextControls };
}

export function setAvailableTemplates(names = []) {
  _availableTemplates = new Set(names);
  if (_availableTemplates.size === 0) _availableTemplates.add(_defaultTemplate());
}

export const templateUI = {
  closeDropdown,
  openDropdown,
  selectTemplate,
  setControls,
  setAvailableTemplates,
};

// ---------------------------------------------------------------------------
// DOM bootstrap (formerly the `DOMContentLoaded` handler at module bottom)
// ---------------------------------------------------------------------------
export async function initTemplates() {
  const wrapper      = document.getElementById("template-select-wrapper");
  const trigger      = document.getElementById("template-trigger");
  const dropdown     = document.getElementById("template-dropdown");
  const grid         = document.getElementById("template-grid");
  const nameDisplay  = document.getElementById("tpl-name-display");
  const banner       = document.getElementById("error-banner");
  const btnValidate  = document.getElementById("btn-validate-template");
  const portal       = document.getElementById("tpl-popover-portal");
  templateUI.setControls({ wrapper, trigger, dropdown, nameDisplay });

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (dropdown.hidden) templateUI.openDropdown();
    else templateUI.closeDropdown();
  });

  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) templateUI.closeDropdown();
  });

  try {
    const data = await (await fetch("/api/templates")).json();
    const validationMap = data.validation || {};
    templateRegistry.setAllMeta(data.meta || {});
    templateUI.setAvailableTemplates(data.templates || []);
    SETTINGS_HELPERS.setValidTemplates(data.templates || []);

    let hoverTimer = null;
    let hideTimer  = null;
    let cardIndex = 0;
    data.templates.forEach((name) => {
      const meta        = templateRegistry.getMeta(name);
      const isValid     = validationMap[name] ? validationMap[name].valid : null;
      const displayName = meta.display_name || name
        .split("-")
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
      const description = meta.description  || "";
      const audience    = meta.audience     || "";
      const badge       = isValid === false ? "⚠ Error" : (meta.ui?.badge || "");
      const isFirst     = name === app.state.template;
      const col         = (cardIndex % 3) + 1;

      const card = document.createElement("div");
      card.className = `tpl-card${isFirst ? " selected" : ""} col-${col}`;
      card.dataset.name = name;

      // Fields below are from server-side meta.yaml (developer-controlled, not user input).
      card.innerHTML = `
        <div class="tpl-thumb-wrap">
          <img class="tpl-thumb"
               src="/assets/template-previews/${name}.png"
               alt="${displayName}"
               onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
          <div class="tpl-thumb tpl-thumb-${name}" style="display:none"></div>
        </div>
        <div class="tpl-label">${displayName}</div>
        <div class="tpl-popover">
          <div class="popover-name">${displayName}</div>
          ${audience ? `<span class="popover-audience">${audience}</span>` : ""}
          ${badge    ? `<span class="popover-badge">${badge}</span>`       : ""}
          ${description ? `<div class="popover-desc">${description}</div>` : ""}
        </div>
      `;

      if (isFirst && nameDisplay) nameDisplay.textContent = displayName;

      card.addEventListener("mouseenter", () => {
        clearTimeout(hoverTimer);
        clearTimeout(hideTimer);
        hoverTimer = setTimeout(() => {
          if (!portal) return;
          const cardRect    = card.getBoundingClientRect();
          const wrapperRect = wrapper.getBoundingClientRect();
          const POPOVER_W   = 220;
          const GAP         = 10;
          portal.innerHTML = `
            <img class="tpl-preview-img"
                 src="/assets/template-previews/${name}.png"
                 alt="${displayName}"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
            <div class="tpl-preview-img-fallback tpl-thumb-${name}" style="display:none"></div>
            <div class="popover-name">${displayName}</div>
            ${audience ? `<span class="popover-audience">${audience}</span>` : ""}
            ${badge    ? `<span class="popover-badge">${badge}</span>`       : ""}
            ${description ? `<div class="popover-desc">${description}</div>` : ""}
            <button class="tpl-use-btn">Use this template</button>
          `;
          portal.querySelector(".tpl-use-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            templateUI.selectTemplate(name);
          });
          portal.style.top  = (cardRect.top - wrapperRect.top) + "px";
          const spaceRight  = window.innerWidth - cardRect.right - GAP;
          if (spaceRight >= POPOVER_W) {
            portal.style.left  = (cardRect.right - wrapperRect.left + GAP) + "px";
            portal.style.right = "";
          } else {
            portal.style.left  = (cardRect.left - wrapperRect.left - GAP - POPOVER_W) + "px";
            portal.style.right = "";
          }
          portal.hidden = false;
        }, 400);
      });
      card.addEventListener("mouseleave", () => {
        clearTimeout(hoverTimer);
        hideTimer = setTimeout(() => {
          if (portal) portal.hidden = true;
        }, 120);
      });

      grid.appendChild(card);
      cardIndex++;
    });

    if (portal && !portal.dataset.listenersBound) {
      portal.dataset.listenersBound = "1";
      portal.addEventListener("mouseenter", () => clearTimeout(hideTimer));
      portal.addEventListener("mouseleave", () => { if (portal) portal.hidden = true; });
    }

  } catch {
    templateRegistry.setAllMeta({});
    templateUI.setAvailableTemplates(["classic"]);
    const card = document.createElement("div");
    card.className = "tpl-card selected col-1";
    card.dataset.name = "classic";
    card.innerHTML = `
      <div class="tpl-thumb tpl-thumb-classic"></div>
      <div class="tpl-label">Classic</div>
      <div class="tpl-popover">
        <div class="popover-name">Classic</div>
      </div>
    `;
    grid.appendChild(card);
    if (nameDisplay) nameDisplay.textContent = "Classic";
  }

  /* Validate button (triggered by icon in masthead) */
  btnValidate?.addEventListener("click", async () => {
    const name = app.state.template;
    btnValidate.disabled = true;

    const validDot  = document.getElementById("valid-dot");
    const validText = document.getElementById("valid-text");
    if (validDot)  { validDot.classList.add("warn"); validDot.classList.remove("idle"); }
    if (validText)  validText.textContent = "Validating…";

    try {
      const resp = await fetch(`/api/templates/${name}/validate`, { method: "POST" });
      const data = await resp.json();

      if (data.valid) {
        if (validDot)  { validDot.classList.remove("warn", "err"); }
        if (validText)  validText.textContent = "Template valid";
        _showToast("Template valid", `'${name}' compiled cleanly.`, "ok");
      } else {
        if (validDot)  { validDot.classList.add("err"); validDot.classList.remove("warn"); }
        if (validText)  validText.textContent = "Template error";
        banner.style.display = "block";
        banner.textContent = `⚠ '${name}' invalid: ${data.errors.join(" · ")}`;
        setTimeout(() => { banner.style.display = "none"; banner.textContent = ""; }, 10000);
      }
    } catch {
      _showToast("Validation failed", "Network error — is the server running?", "err");
    } finally {
      btnValidate.disabled = false;
    }
  });
}

function _showToast(title, msg, type = "info") {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.innerHTML = `
    <div>
      <div class="toast-title">${title}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ""}
    </div>
    <button class="toast-close">×</button>
  `;
  t.querySelector(".toast-close").addEventListener("click", () => t.remove());
  stack.appendChild(t);
  setTimeout(() => {
    t.style.animation = "toastIn .2s ease reverse both";
    setTimeout(() => t.remove(), 220);
  }, 4000);
}
