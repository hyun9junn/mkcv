import { SETTINGS_HELPERS as _SH } from '../settings-engine.js';

const _defaultYaml = _SH.settingsToYaml(_SH.DEFAULT_SETTINGS);

export const _st = {
  activeTab: 'resume',
  settingsYaml: _defaultYaml,
  parsed: _SH.parseSettings(_defaultYaml),
  saveTimer: null,
  editorEffectsTimer: null,
  pendingEditorApply: false,
  pendingEditorPreview: false,
  pendingEditorPreviousSettings: null,
  suppress: false,
  suppressResumeSectionSync: false,
  tabScroll: { resume: { left: 0, top: 0 }, settings: { left: 0, top: 0 } },
  yamlChangeFn: null,
};
