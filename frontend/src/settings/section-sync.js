import { app } from '../app.js';
import { sectionsState } from '../sections-state.js';
import { sectionsUI } from '../sections-ui.js';
import { editorAdapter } from '../editor-adapter.js';
import { SETTINGS_HELPERS as _SH } from '../settings-engine.js';
import { _st } from './state.js';
import { toast as _toast } from './toast.js';
import { clone as _clone, arraysEqual as _arraysEqual } from './utils.js';
import { applyToToolbar, applyToContact, applyTemplateSelection, refreshPreview } from './apply.js';

export function getSectionStateFromSettings(settings) {
  const settingsKeys = (settings.sections || []).map((section) => section.key);
  const hidden = (settings.sections || [])
    .filter((section) => !section.visible)
    .map((section) => section.key);
  const knownOrder = sectionsState ? sectionsState.DEFAULT_ORDER : [];
  const extra = knownOrder.filter((key) => !settingsKeys.includes(key));
  return { order: [...settingsKeys, ...extra], hidden };
}

export function persistSectionState(sectionState) {
  try {
    localStorage.setItem('mkcv_sections_state', JSON.stringify(sectionState));
  } catch {}
}

export function getCurrentSectionState() {
  const order = sectionsState ? sectionsState.getOrder() : [];
  return {
    order,
    hidden: order.filter((key) => sectionsState.isHidden(key)),
  };
}

function _getPresentSectionKeys(rawYaml) {
  if (!sectionsState) return new Set();

  if (typeof sectionsState.getExpandedPresentKeys === 'function') {
    const keys = sectionsState.getExpandedPresentKeys(rawYaml);
    if (Array.isArray(keys) && keys.length > 0) return new Set(keys);
  }

  if (typeof sectionsState.getYamlSectionLayout === 'function') {
    const layout = sectionsState.getYamlSectionLayout(rawYaml);
    return new Set([...(layout?.mainKeys || []), ...(layout?.invisibleKeys || [])]);
  }

  return new Set();
}

function _parseResumeYaml(yaml) {
  if (sectionsState && typeof sectionsState.parseResumeYaml === 'function') {
    return sectionsState.parseResumeYaml(yaml);
  }
  if (typeof globalThis.jsyaml !== 'undefined') return globalThis.jsyaml.load(yaml);
  return null;
}

export function formatResumeSectionTitleComments(yaml, settings = _st.parsed.value) {
  if (typeof yaml !== 'string' || !yaml.trim()) return yaml;

  const titleByKey = Object.fromEntries(
    (settings?.sections || [])
      .filter((section) =>
        section &&
        typeof section.key === 'string' &&
        _SH.KNOWN_KEYS.has(section.key) &&
        typeof section.title === 'string' &&
        section.title.trim()
      )
      .map((section) => [section.key, section.title.trim()])
  );

  if (Object.keys(titleByKey).length === 0) return yaml;

  const hasTrailingNewline = yaml.endsWith('\n');
  let changed = false;
  const nextLines = yaml.split('\n').map((line) => {
    if (!line || /^\s/.test(line) || line.trimStart().startsWith('#')) return line;

    const match = line.match(/^([A-Za-z0-9_]+):(.*)$/);
    if (!match) return line;

    const [, key, rest = ''] = match;
    const title = titleByKey[key];
    if (!title) return line;

    const contentBeforeComment = rest.split('#', 1)[0].trimEnd();
    const nextLine = `${key}:${contentBeforeComment} # ${title}`;
    if (nextLine !== line) changed = true;
    return nextLine;
  });

  if (!changed) return yaml;

  const nextYaml = nextLines.join('\n');
  return hasTrailingNewline && !nextYaml.endsWith('\n') ? `${nextYaml}\n` : nextYaml;
}

export function syncResumeSectionTitleComments(settings = _st.parsed.value) {
  const yaml = app.state.yaml;
  const nextYaml = formatResumeSectionTitleComments(yaml, settings);
  if (nextYaml === yaml) return;
  _st.suppressResumeSectionSync = true;
  app.setState({ yaml: nextYaml });
  saveResumeYaml(nextYaml);
  _st.suppressResumeSectionSync = false;
}

export function buildSettingsFromSectionState(sectionState, baseSettings = _st.parsed.value) {
  const existing = new Map((baseSettings?.sections || []).map((section) => [section.key, section]));
  const presentKeys = _getPresentSectionKeys(app.state.yaml);
  const next = _clone(baseSettings || _SH.DEFAULT_SETTINGS);
  next.sections = sectionState.order
    .filter((key) => _SH.SECTION_CATALOG.some((section) => section.key === key))
    .map((key) => ({
      key,
      title: existing.get(key)?.title ?? (_SH.SECTION_CATALOG.find((section) => section.key === key)?.defaultTitle ?? key.toUpperCase()),
      visible: presentKeys.has(key)
        ? !sectionState.hidden.includes(key)
        : (existing.get(key)?.visible ?? _SH.DEFAULT_SETTINGS.sections.find((section) => section.key === key)?.visible ?? true),
    }));
  return next;
}

function _materializeKeysFromVisibilityChanges(settings, previousSettings) {
  if (
    !sectionsState ||
    !previousSettings?.sections ||
    typeof sectionsState.getExpandedPresentKeys !== 'function'
  ) return [];
  const present = new Set(sectionsState.getExpandedPresentKeys(app.state.yaml));
  const previousVisible = new Map(
    previousSettings.sections.map((section) => [section.key, section.visible !== false])
  );
  return (settings.sections || [])
    .filter((section) =>
      section.visible &&
      previousVisible.get(section.key) === false &&
      !present.has(section.key) &&
      !!sectionsState.SECTION_DEFS?.[section.key]?.yaml
    )
    .map((section) => section.key);
}

export function saveResumeYaml(yaml) {
  if (_st.activeTab === 'resume') {
    editorAdapter.suppressNextPreviewRefresh();
    editorAdapter.setValuePreserveScroll(yaml);
    return;
  }
  try {
    localStorage.setItem('mkcv:default:resume.yaml', yaml);
  } catch {
    _toast('Resume not saved — browser storage is full or unavailable.', 'warn');
  }
}

export function applySectionStateToResume(sectionState, opts = {}) {
  const yaml = app.state.yaml;
  if (!yaml || !yaml.trim() || !sectionsState) return;
  const structuralYaml = typeof sectionsState.syncYamlToSectionState === 'function'
    ? sectionsState.syncYamlToSectionState(yaml, sectionState.order, sectionState.hidden, {
        materialize: opts.materialize,
      })
    : sectionsState.reorderMainArea(yaml, sectionState.order);
  const nextYaml = formatResumeSectionTitleComments(structuralYaml, opts.settings ?? _st.parsed.value);
  if (nextYaml === yaml) return;
  _st.suppressResumeSectionSync = true;
  app.setState({ yaml: nextYaml });
  saveResumeYaml(nextYaml);
  _st.suppressResumeSectionSync = false;
}

export function syncSettingsFromResumeYaml(yaml) {
  if (
    _st.suppressResumeSectionSync ||
    !_st.parsed.value ||
    !sectionsState ||
    typeof sectionsState.getYamlSectionState !== 'function'
  ) return;
  try {
    const parsedResume = _parseResumeYaml(yaml);
    if (!parsedResume || typeof parsedResume !== 'object') return;
  } catch {
    return;
  }

  const currentState = getCurrentSectionState();
  const nextState = sectionsState.getYamlSectionState(yaml, currentState.order);
  const presentKeys = _getPresentSectionKeys(yaml);
  nextState.hidden = Array.from(
    new Set([
      ...nextState.hidden,
      ...currentState.hidden.filter((key) => !presentKeys.has(key)),
    ])
  );
  const stateChanged =
    !_arraysEqual(nextState.order, currentState.order) ||
    !_arraysEqual(nextState.hidden, currentState.hidden);
  if (stateChanged) {
    persistSectionState(nextState);
    if (sectionsUI) sectionsUI.buildPanel();
  }

  const nextSettings = buildSettingsFromSectionState(nextState);
  const nextYaml = _SH.settingsToYaml(nextSettings);
  if (!stateChanged && nextYaml === _st.settingsYaml) return;
  if (_st.yamlChangeFn) _st.yamlChangeFn(nextYaml, { skipApply: true, skipPreview: true });
}

export function applyToSections(settings, opts = {}) {
  const sectionState = getSectionStateFromSettings(settings);
  persistSectionState(sectionState);
  if (sectionsUI) sectionsUI.buildPanel();
  applySectionStateToResume(sectionState, {
    materialize: _materializeKeysFromVisibilityChanges(settings, opts.previousSettings),
    settings,
  });
}

export function applyAll(settings, opts = {}) {
  applyTemplateSelection(settings, { refreshPreview: false });
  applyToToolbar(settings);
  applyToSections(settings, opts);
  applyToContact(settings);
}

export function applySelected(settings, opts = {}) {
  if (opts.applyToolbar) applyToToolbar(settings);
  if (opts.applySections) applyToSections(settings, { previousSettings: opts.previousSettings });
  if (opts.applyContact) applyToContact(settings);
}
