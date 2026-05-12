// Contact pill UI — flyout for personal/contact fields. Phase 2: converted
// from IIFE-on-window to ESM. The aggregate `contactUI` export preserves the
// shape that `window.contactUI` previously had so still-IIFE callers continue
// to work via the `window.contactUI = contactUI` shim in main.js.

import jsyaml from 'js-yaml';
import { app } from './app.js';
import { SETTINGS_HELPERS } from './settings-engine.js';

const { PERSONAL_FIELD_CATALOG, LINK_FIELDS } = SETTINGS_HELPERS;

let _openPickerKey = null;
let _cachedYaml = null;
let _cachedPersonalValues = null;
let _parseCount = 0;

// Test-only hook — reset module-private state between tests.
export function _resetForTesting() {
  _openPickerKey = null;
  _cachedYaml = null;
  _cachedPersonalValues = null;
  _parseCount = 0;
}

// Test-only hook — return the number of times jsyaml.load() was called.
export function _getParseCount() {
  return _parseCount;
}

function _getPersonalValues() {
  const yaml = app.state.yaml || '';
  if (yaml === _cachedYaml && _cachedPersonalValues) return _cachedPersonalValues;

  const values = Object.fromEntries(PERSONAL_FIELD_CATALOG.map(field => [field.key, '']));
  try {
    _parseCount += 1;
    const parsed = jsyaml.load(yaml);
    const personal = parsed?.personal;
    if (personal && typeof personal === 'object') {
      for (const field of PERSONAL_FIELD_CATALOG) {
        const val = personal[field.key];
        values[field.key] = val != null ? String(val) : '';
      }
    }
  } catch {
    // Leave values empty when resume.yaml is invalid mid-edit.
  }

  _cachedYaml = yaml;
  _cachedPersonalValues = values;
  return values;
}

function _currentSettings() {
  return window.settingsSync ? window.settingsSync.getSettings() : SETTINGS_HELPERS.DEFAULT_SETTINGS;
}

function _countHidden(settings) {
  return (settings.personal?.fields ?? []).filter(f => f.key !== 'name' && !f.visible).length;
}

function _updatePillBadge(settings) {
  const countEl = document.getElementById('contact-hidden-count');
  if (!countEl) return;
  const n = _countHidden(settings);
  countEl.textContent = n;
  countEl.style.display = n > 0 ? '' : 'none';
}

function _buildFieldRow(fieldDef, fieldSettings, value, globalDefault) {
  const { key, locked } = fieldDef;
  const visible = fieldSettings.visible;
  const isLink = LINK_FIELDS.has(key);
  const style = isLink ? (fieldSettings.link_display ?? 'default') : null;
  const pickerOpen = _openPickerKey === key;

  const row = document.createElement('div');
  row.className = 'field-row' +
    (locked ? ' locked-row' : '') +
    (!visible && !locked ? ' hidden-row' : '');
  row.title = value || '';

  // Toggle
  const tog = document.createElement('div');
  tog.className = 'f-toggle' + (!visible ? ' off' : '') + (locked ? ' locked' : '');
  if (!locked) {
    tog.addEventListener('click', e => {
      e.stopPropagation();
      if (!window.settingsSync) return;
      window.settingsSync.updateFromToolbar(s => {
        const f = s.personal.fields.find(f => f.key === key);
        if (f) f.visible = !f.visible;
      }, { applyToolbar: true, applyContact: true });
    });
  }
  row.appendChild(tog);

  // Field key
  const keyEl = document.createElement('span');
  keyEl.className = 'f-key';
  keyEl.textContent = key;
  keyEl.title = value || '';
  row.appendChild(keyEl);

  // Right control
  const ctrl = document.createElement('div');
  ctrl.className = 'f-ctrl';

  if (locked) {
    const badge = document.createElement('span');
    badge.className = 'f-locked';
    badge.textContent = 'always shown';
    ctrl.appendChild(badge);
  } else if (isLink) {
    if (pickerOpen) {
      const picker = document.createElement('div');
      picker.className = 'f-picker';
      const opts = [
        { val: 'default', label: 'default', cls: 'p-inherit' },
        { val: 'label',   label: 'label',   cls: '' },
        { val: 'url',     label: 'url',     cls: '' },
        { val: 'both',    label: 'both',    cls: '' },
      ];
      for (const opt of opts) {
        const span = document.createElement('span');
        span.textContent = opt.label;
        if (opt.cls) span.className = opt.cls;
        span.addEventListener('click', e => {
          e.stopPropagation();
          _openPickerKey = null;
          if (!window.settingsSync) return;
          window.settingsSync.updateFromToolbar(s => {
            const f = s.personal.fields.find(f => f.key === key);
            if (!f) return;
            f.link_display = opt.val;
          }, { applyToolbar: true, applyContact: true });
        });
        picker.appendChild(span);
      }
      ctrl.appendChild(picker);
    } else if (style !== 'default') {
      const pill = document.createElement('div');
      pill.className = 'f-override';
      const txt = document.createTextNode(style + ' ');
      const x = document.createElement('span');
      x.className = 'f-override-x';
      x.textContent = '×';
      x.addEventListener('click', e => {
        e.stopPropagation();
        if (!window.settingsSync) return;
        window.settingsSync.updateFromToolbar(s => {
          const f = s.personal.fields.find(f => f.key === key);
          if (f) f.link_display = 'default';
        }, { applyToolbar: true, applyContact: true });
      });
      pill.appendChild(txt);
      pill.appendChild(x);
      ctrl.appendChild(pill);
    } else {
      const tag = document.createElement('span');
      tag.className = 'f-inherit';
      tag.textContent = `default (${globalDefault})`;
      tag.addEventListener('click', e => {
        e.stopPropagation();
        _openPickerKey = key;
        rebuild(_currentSettings());
      });
      ctrl.appendChild(tag);
    }
  }

  row.appendChild(ctrl);
  return row;
}

export function rebuild(settings) {
  const body = document.getElementById('contact-fields-body');
  if (!body) return;

  const fields = settings.personal?.fields ?? [];
  const globalDefault = settings.personal?.default_link_display ?? 'label';
  const personalValues = _getPersonalValues();

  // Update global seg
  const seg = document.getElementById('contact-global-seg');
  if (seg) {
    seg.querySelectorAll('span[data-value]').forEach(span => {
      span.classList.toggle('active', span.dataset.value === globalDefault);
    });
  }

  _updatePillBadge(settings);
  body.innerHTML = '';

  for (const fieldDef of PERSONAL_FIELD_CATALOG) {
    const fieldSettings = fields.find(f => f.key === fieldDef.key)
      ?? (LINK_FIELDS.has(fieldDef.key)
        ? { key: fieldDef.key, visible: true, link_display: 'default' }
        : { key: fieldDef.key, visible: true });
    const value = personalValues[fieldDef.key] ?? '';
    const row = _buildFieldRow(fieldDef, fieldSettings, value, globalDefault);
    body.appendChild(row);
    if (fieldDef.key === 'name') {
      const divider = document.createElement('div');
      divider.className = 'field-divider';
      body.appendChild(divider);
    }
  }
}

export const contactUI = { rebuild };

export function initContactUI() {
  const pill   = document.getElementById('contact-pill');
  const flyout = document.getElementById('contact-flyout');
  const caret  = document.getElementById('contact-pill-caret');
  if (!pill || !flyout || !caret) return;

  function openFlyout() {
    flyout.style.display = '';
    caret.textContent = '▴';
    pill.classList.add('open');
    rebuild(_currentSettings());
  }

  function closeFlyout() {
    flyout.style.display = 'none';
    caret.textContent = '▾';
    pill.classList.remove('open');
    _openPickerKey = null;
  }

  pill.addEventListener('click', e => {
    e.stopPropagation();
    flyout.style.display === 'none' ? openFlyout() : closeFlyout();
  });

  document.addEventListener('click', e => {
    const anchor = document.getElementById('contact-flyout-anchor');
    if (anchor && !anchor.contains(e.target) && flyout.style.display !== 'none') {
      closeFlyout();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && flyout.style.display !== 'none') closeFlyout();
  });

  // Global default seg
  const seg = document.getElementById('contact-global-seg');
  if (seg) {
    seg.addEventListener('click', e => {
      e.stopPropagation();
      const span = e.target.closest('span[data-value]');
      if (!span || !window.settingsSync) return;
      window.settingsSync.updateFromToolbar(
        s => { s.personal.default_link_display = span.dataset.value; },
        { applyToolbar: true, applyContact: true }
      );
    });
  }

  // Rebuild value previews when resume.yaml changes and flyout is open
  let _rebuildTimer = null;
  if (window.editorAdapter) window.editorAdapter.onChange(() => {
    if (flyout.style.display === 'none') return;
    clearTimeout(_rebuildTimer);
    _rebuildTimer = setTimeout(() => rebuild(_currentSettings()), 300);
  });

  // Initial pill badge
  if (window.settingsSync) _updatePillBadge(window.settingsSync.getSettings());
}
