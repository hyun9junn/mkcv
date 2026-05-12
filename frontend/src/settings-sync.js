// Settings sync — bidirectional sync between settings.yaml editor and the
// toolbar/sections/contact UI. Phase 2: converted from IIFE-on-window to ESM.
// The aggregate `settingsSync` export preserves the shape `window.settingsSync`
// previously had so still-IIFE callers continue to work via the compat shim.

import { app } from './app.js';
import { validator } from './validator.js';
import { sectionsState } from './sections-state.js';
import { SETTINGS_HELPERS } from './settings-engine.js';
import { editorAdapter } from './editor-adapter.js';
import { preview } from './preview.js';
import { sectionsUI } from './sections-ui.js';
import { migrate as _migrateImpl } from './settings/migrate.js';
import { _st } from './settings/state.js';
import { toast as _toast } from './settings/toast.js';
import { updateValidStatus as _updateValidStatus, updateLineStat as _updateLineStat, restoreResumeStatus as _restoreResumeStatus } from './settings/status-bar.js';
import { clone as _clone } from './settings/utils.js';
import { refreshPreview as _refreshPreview } from './settings/apply.js';
import { applyAll as _applyAll, applySelected as _applySelected, buildSettingsFromSectionState as _buildSettingsFromSectionState, getCurrentSectionState as _getCurrentSectionState, getSectionStateFromSettings as _getSectionStateFromSettings, persistSectionState as _persistSectionState, applySectionStateToResume as _applySectionStateToResume, syncResumeSectionTitleComments as _syncResumeSectionTitleComments, syncSettingsFromResumeYaml as _syncSettingsFromResumeYaml, formatResumeSectionTitleComments as _formatResumeSectionTitleComments } from './settings/section-sync.js';

// All SETTINGS_HELPERS references are read dynamically so tests can monkey-patch
// them on the live SETTINGS_HELPERS object between runs.
const _SH = SETTINGS_HELPERS;
const _EDITOR_SYNC_DEBOUNCE_MS = 300;

// ── Tab UI ──

function _setTabActive(tab) {
  document.getElementById('file-tab-resume')  ?.classList.toggle('active', tab === 'resume');
  document.getElementById('file-tab-settings')?.classList.toggle('active', tab === 'settings');
}

function _saveTabScroll(tab) {
  if (!editorAdapter || !_st.tabScroll[tab]) return;
  const { left, top } = editorAdapter.getScrollInfo();
  _st.tabScroll[tab] = { left, top };
}

function _restoreTabScroll(tab) {
  if (!editorAdapter || !_st.tabScroll[tab]) return;
  editorAdapter.scrollTo(_st.tabScroll[tab].left, _st.tabScroll[tab].top);
}

function _clearEditorEffects() {
  clearTimeout(_st.editorEffectsTimer);
  _st.editorEffectsTimer = null;
  _st.pendingEditorApply = false;
  _st.pendingEditorPreview = false;
  _st.pendingEditorPreviousSettings = null;
}

function _scheduleEditorEffects(opts = {}) {
  _st.pendingEditorApply = _st.pendingEditorApply || !!opts.apply;
  _st.pendingEditorPreview = _st.pendingEditorPreview || !!opts.preview;
  if (_st.pendingEditorPreviousSettings == null && opts.previousSettings) {
    _st.pendingEditorPreviousSettings = _clone(opts.previousSettings);
  }
  clearTimeout(_st.editorEffectsTimer);
  _st.editorEffectsTimer = setTimeout(() => {
    _st.editorEffectsTimer = null;
    const shouldApply = _st.pendingEditorApply;
    const shouldPreview = _st.pendingEditorPreview;
    const previousSettings = _st.pendingEditorPreviousSettings;
    _st.pendingEditorApply = false;
    _st.pendingEditorPreview = false;
    _st.pendingEditorPreviousSettings = null;
    if (!_st.parsed.value) return;
    if (shouldApply) _applyAll(_st.parsed.value, { previousSettings });
    if (shouldPreview) _refreshPreview();
  }, _EDITOR_SYNC_DEBOUNCE_MS);
}

// ── Save to localStorage ──

function _save(yaml) {
  try {
    localStorage.setItem('mkcv:default:settings.yaml', yaml);
  } catch {
    _toast('Settings not saved — browser storage is full or unavailable.', 'warn');
  }
}

function _scheduleSave() {
  clearTimeout(_st.saveTimer);
  _st.saveTimer = setTimeout(() => _save(_st.settingsYaml), 1000);
}

// ── Core: process a settings YAML change ──
// opts.fromEditor  — change came from the CodeMirror editor (skip writing back)
// opts.skipApply   — settings already applied externally (skip _applyAll + sections rebuild)
// opts.skipPreview — caller will handle preview refresh (avoid double render)

function _onYamlChange(yaml, opts = {}) {
  const previousSettings = _clone(_st.parsed.value);
  _st.settingsYaml = yaml;
  _st.parsed       = _SH.parseSettings(yaml);

  _updateValidStatus(_st.parsed);
  if (_st.activeTab === 'settings') _updateLineStat(yaml);

  const shouldApply = !!_st.parsed.value && !opts.skipApply;
  const shouldPreview = !!_st.parsed.value && !opts.skipPreview;

  if (opts.fromEditor && (shouldApply || shouldPreview)) {
    // Typing in settings.yaml should feel like resume.yaml: batch expensive UI sync
    // and preview work until the user pauses, instead of rerendering every keypress.
    _scheduleEditorEffects({ apply: shouldApply, preview: shouldPreview, previousSettings });
  } else {
    _clearEditorEffects();
    if (shouldApply) _applyAll(_st.parsed.value, { previousSettings });
    if (shouldPreview) _refreshPreview();
  }

  _scheduleSave();

  // Reflect changes in editor when settings tab is active
  if (_st.activeTab === 'settings' && !opts.fromEditor && !_st.suppress) {
    _st.suppress = true;
    editorAdapter.setValuePreserveScroll(yaml);
    _st.suppress = false;
  }
}

// ── Public: called by layout-controls.js when toolbar changes ──

function updateFromToolbar(mutator, opts = {}) {
  if (!_st.parsed.value) return;
  const previousSettings = _clone(_st.parsed.value);
  const next = JSON.parse(JSON.stringify(_st.parsed.value));
  mutator(next);
  const hasSelectiveApply = opts.applyToolbar || opts.applySections || opts.applyContact;
  if (hasSelectiveApply) _applySelected(next, { ...opts, previousSettings });
  _onYamlChange(_SH.settingsToYaml(next), {
    skipApply: hasSelectiveApply ? true : (opts.skipApply ?? true),
    skipPreview: opts.skipPreview,
  });
}

// ── Public: called via monkey-patched sections-state methods ──

function notifySectionStateChange(opts = {}) {
  if (!_st.parsed.value) return;
  const sectionState = _getCurrentSectionState();
  if (!opts.skipResumeSync) _applySectionStateToResume(sectionState);
  if (preview && sectionsState) {
    preview.refresh(
      sectionsState.getOrderedFilteredYaml(app.state.yaml),
      app.state.template
    );
  }
  const next = _buildSettingsFromSectionState(sectionState);
  // skipApply: sections already updated; skipPreview: we already refreshed above
  _onYamlChange(_SH.settingsToYaml(next), { skipApply: true, skipPreview: true });
}

// ── Public: called by sectionsUI to update section title inline ──

function updateSectionTitle(key, newTitle) {
  if (!_st.parsed.value) return;
  const next = JSON.parse(JSON.stringify(_st.parsed.value));
  const section = next.sections.find(s => s.key === key);
  if (!section) return;
  section.title = newTitle;
  _onYamlChange(_SH.settingsToYaml(next), { skipApply: true });
  _syncResumeSectionTitleComments(next);
}

function applyTemplateDefaults(rawDefaults, opts = {}) {
  const activeTemplate = app.state.template || _st.parsed.value?.template || _SH.DEFAULT_SETTINGS.template;
  const next = _SH.normalizeTemplateDefaults(rawDefaults, activeTemplate);
  _onYamlChange(_SH.settingsToYaml(next), { skipPreview: opts.skipPreview });
}

// ── Tab switching ──

function switchToResume() {
  if (_st.activeTab === 'resume') return;
  _saveTabScroll(_st.activeTab);
  editorAdapter?.closeHint?.();
  _st.activeTab = 'resume';
  _setTabActive('resume');
  _st.suppress = true;
  editorAdapter.setValueSilently(app.state.yaml);
  editorAdapter.clearHistory();
  _restoreTabScroll('resume');
  _st.suppress = false;
  _restoreResumeStatus();
}

function switchToSettings() {
  if (_st.activeTab === 'settings') return;
  _saveTabScroll(_st.activeTab);
  editorAdapter?.closeHint?.();
  _st.activeTab = 'settings';
  _setTabActive('settings');
  _st.suppress = true;
  editorAdapter.setValueSilently(_st.settingsYaml);
  editorAdapter.clearHistory();
  _restoreTabScroll('settings');
  _st.suppress = false;
  _updateValidStatus(_st.parsed);
  _updateLineStat(_st.settingsYaml);
}

// ── Init ──

export function initSettingsSync() {
  // Wire the yamlChangeFn so section-sync.js can call back without a circular import
  _st.yamlChangeFn = _onYamlChange;

  // Wire tab buttons
  document.getElementById('file-tab-resume')  ?.addEventListener('click', switchToResume);
  document.getElementById('file-tab-settings')?.addEventListener('click', switchToSettings);

  // Migration (before loading from localStorage)
  const migrated = _migrateImpl(_SH);

  // Load settings from localStorage
  const stored = localStorage.getItem('mkcv:default:settings.yaml');
  if (stored && stored.trim()) {
    _st.settingsYaml = stored;
    _st.parsed       = _SH.parseSettings(stored);
  } else if (migrated) {
    _st.settingsYaml = _SH.settingsToYaml(migrated);
    _st.parsed       = _SH.parseSettings(_st.settingsYaml);
    _toast('Migrated layout & section settings to settings.yaml');
    _save(_st.settingsYaml);
  }

  // Apply to toolbar and section chips
  if (_st.parsed.value) {
    _applyAll(_st.parsed.value);
    if (app.state.yaml?.trim()) _refreshPreview();
  }

  // Monkey-patch sections-state to keep settings.yaml in sync
  if (sectionsState) {
    const orig = {
      setOrder:     sectionsState.setOrder.bind(sectionsState),
      toggleHidden: sectionsState.toggleHidden.bind(sectionsState),
      resetAll:     sectionsState.resetAll.bind(sectionsState),
    };
    sectionsState.setOrder     = (o)    => { orig.setOrder(o);     notifySectionStateChange(); };
    sectionsState.toggleHidden = (k, opts) => { orig.toggleHidden(k); notifySectionStateChange(opts); };
    sectionsState.resetAll     = (...a) => { orig.resetAll(...a);   notifySectionStateChange(); };
  }

  // Listen to editor changes when settings tab is active
  editorAdapter.onChange((val) => {
    if (_st.activeTab !== 'settings' || _st.suppress) return;
    _onYamlChange(val, { fromEditor: true });
  });

  editorAdapter.onChange((val) => {
    if (_st.activeTab !== 'resume') return;
    _syncSettingsFromResumeYaml(val);
  });
}

// ── Test-only hooks ──

export function _resetSettingsSyncForTesting() {
  _st.activeTab     = 'resume';
  _st.settingsYaml  = _SH.settingsToYaml(_SH.DEFAULT_SETTINGS);
  _st.parsed        = _SH.parseSettings(_st.settingsYaml);
  _st.saveTimer     = null;
  _st.editorEffectsTimer = null;
  _st.pendingEditorApply = false;
  _st.pendingEditorPreview = false;
  _st.pendingEditorPreviousSettings = null;
  _st.suppress      = false;
  _st.suppressResumeSectionSync = false;
  _st.tabScroll.resume  = { left: 0, top: 0 };
  _st.tabScroll.settings = { left: 0, top: 0 };
}

export const settingsSync = {
  get activeTab() { return _st.activeTab; },
  updateFromToolbar,
  notifySectionStateChange,
  updateSectionTitle,
  applyTemplateDefaults,
  formatResumeSectionTitleComments: (yaml) => _formatResumeSectionTitleComments(yaml),
  getYaml:     () => _st.settingsYaml,
  getSettings: () => _st.parsed.value || _SH.DEFAULT_SETTINGS,
  setYaml:     (yaml) => _onYamlChange(yaml),
};
