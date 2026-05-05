/* global app, sectionsState, sectionsUI, preview, validator */
const settingsSync = (() => {
  const { SECTION_CATALOG, KNOWN_KEYS, VALID_DENSITY, VALID_FONT, DEFAULT_SETTINGS, settingsToYaml, parseSettings, normalizeTemplateDefaults } =
    window.SETTINGS_HELPERS;

  let _activeTab     = 'resume';
  let _settingsYaml  = settingsToYaml(DEFAULT_SETTINGS);
  let _parsed        = parseSettings(_settingsYaml);
  let _saveTimer     = null;
  let _editorEffectsTimer = null;
  let _pendingEditorApply = false;
  let _pendingEditorPreview = false;
  let _suppress      = false; // block re-entrant editor updates
  const _EDITOR_SYNC_DEBOUNCE_MS = 300;
  const _tabScroll   = {
    resume: { left: 0, top: 0 },
    settings: { left: 0, top: 0 },
  };

  // ── Status bar ──

  function _updateValidStatus(parsed) {
    if (_activeTab !== 'settings') return;
    const dot  = document.getElementById('valid-dot');
    const text = document.getElementById('valid-text');
    const warn = document.getElementById('settings-warn-item');
    if (!dot || !text) return;

    if (parsed.errors.length > 0) {
      dot.className    = 'status-dot err';
      text.textContent = 'Settings invalid';
    } else if (parsed.warnings.length > 0) {
      dot.className    = 'status-dot warn';
      text.textContent = `${parsed.warnings.length} warning${parsed.warnings.length > 1 ? 's' : ''}`;
    } else {
      dot.className    = 'status-dot';
      text.textContent = 'Settings valid';
    }

    if (warn) {
      const first = parsed.errors[0] || parsed.warnings[0];
      if (first) {
        warn.textContent  = first.msg;
        warn.style.display = '';
        warn.style.color   = parsed.errors.length ? 'var(--err)' : 'var(--warn)';
      } else {
        warn.style.display = 'none';
      }
    }
  }

  function _updateLineStat(yaml) {
    const lines = yaml.split('\n').length;
    const kb    = (new TextEncoder().encode(yaml).length / 1024).toFixed(1);
    const stat  = document.getElementById('lines-stat');
    const meta  = document.getElementById('editor-meta');
    if (stat) stat.textContent = `${lines} ln · ${kb} kb`;
    if (meta) meta.textContent = `${lines} lines`;
  }

  function _restoreResumeStatus() {
    const dot  = document.getElementById('valid-dot');
    const text = document.getElementById('valid-text');
    const warn = document.getElementById('settings-warn-item');
    if (dot)  dot.className    = 'status-dot';
    if (text) text.textContent = 'YAML valid';
    if (warn) warn.style.display = 'none';
    if (window.validator) validator.validate(app.state.yaml, app.state.template);
    // Restore resume line count
    const yaml  = app.state.yaml || '';
    const lines = yaml.split('\n').length;
    const kb    = (new TextEncoder().encode(yaml).length / 1024).toFixed(1);
    const stat  = document.getElementById('lines-stat');
    const meta  = document.getElementById('editor-meta');
    if (stat) stat.textContent = `${lines} ln · ${kb} kb`;
    if (meta) meta.textContent = `${lines} lines`;
  }

  // ── Tab UI ──

  function _setTabActive(tab) {
    document.getElementById('file-tab-resume')  ?.classList.toggle('active', tab === 'resume');
    document.getElementById('file-tab-settings')?.classList.toggle('active', tab === 'settings');
  }

  function _saveTabScroll(tab) {
    if (!window.editorAdapter || !_tabScroll[tab]) return;
    const { left, top } = window.editorAdapter.getScrollInfo();
    _tabScroll[tab] = { left, top };
  }

  function _restoreTabScroll(tab) {
    if (!window.editorAdapter || !_tabScroll[tab]) return;
    window.editorAdapter.scrollTo(_tabScroll[tab].left, _tabScroll[tab].top);
  }

  // ── Apply settings to toolbar + sections ──

  function _applyToToolbar(settings) {
    document.getElementById('density-group')?.querySelectorAll('button[data-value]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === settings.layout.density);
    });
    document.getElementById('font-scale-group')?.querySelectorAll('button[data-value]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === settings.layout.font_scale);
    });
    app.setState({
      density: settings.layout.density,
      font_scale: settings.layout.font_scale,
      link_display: settings.personal?.default_link_display ?? 'label',
      personal_fields: settings.personal?.fields ?? [],
    });
  }

  function _applyToSections(settings) {
    const settingsKeys = settings.sections.map(s => s.key);
    const hidden       = settings.sections.filter(s => !s.visible).map(s => s.key);
    // Append any known keys not already in settings (preserves their default order at the end)
    const knownOrder = window.sectionsState ? sectionsState.DEFAULT_ORDER : [];
    const extra      = knownOrder.filter(k => !settingsKeys.includes(k));
    const order      = [...settingsKeys, ...extra];
    try { localStorage.setItem('mkcv_sections_state', JSON.stringify({ order, hidden })); } catch {}
    if (window.sectionsUI) sectionsUI.buildPanel();
    _reorderAndSaveResume(order);
  }

  function _applyToContact(settings) {
    if (window.contactUI) contactUI.rebuild(settings);
  }

  function _applyTemplateSelection(settings, opts = {}) {
    const nextTemplate = settings?.template || DEFAULT_SETTINGS.template;
    const currentTemplate = app.state.template || DEFAULT_SETTINGS.template;
    if (nextTemplate === currentTemplate) return false;

    if (window.templateUI?.selectTemplate) {
      window.templateUI.selectTemplate(nextTemplate, {
        syncSettings: false,
        applyDefaults: false,
        refreshPreview: opts.refreshPreview,
        closeDropdown: false,
      });
      return true;
    }

    app.setState({ template: nextTemplate });
    return true;
  }

  function _applyAll(settings) {
    _applyTemplateSelection(settings, { refreshPreview: false });
    _applyToToolbar(settings);
    _applyToSections(settings);
    _applyToContact(settings);
  }

  function _applySelected(settings, opts = {}) {
    if (opts.applyToolbar) _applyToToolbar(settings);
    if (opts.applySections) _applyToSections(settings);
    if (opts.applyContact) _applyToContact(settings);
  }

  function _refreshPreview() {
    if (window.preview && window.sectionsState) {
      preview.refresh(
        sectionsState.getOrderedFilteredYaml(app.state.yaml),
        app.state.template
      );
    }
  }

  function _clearEditorEffects() {
    clearTimeout(_editorEffectsTimer);
    _editorEffectsTimer = null;
    _pendingEditorApply = false;
    _pendingEditorPreview = false;
  }

  function _scheduleEditorEffects(opts = {}) {
    _pendingEditorApply = _pendingEditorApply || !!opts.apply;
    _pendingEditorPreview = _pendingEditorPreview || !!opts.preview;
    clearTimeout(_editorEffectsTimer);
    _editorEffectsTimer = setTimeout(() => {
      _editorEffectsTimer = null;
      const shouldApply = _pendingEditorApply;
      const shouldPreview = _pendingEditorPreview;
      _pendingEditorApply = false;
      _pendingEditorPreview = false;
      if (!_parsed.value) return;
      if (shouldApply) _applyAll(_parsed.value);
      if (shouldPreview) _refreshPreview();
    }, _EDITOR_SYNC_DEBOUNCE_MS);
  }

  // ── Reorder mycv.yaml to match section order ──

  function _reorderAndSaveResume(sectionOrder) {
    const yaml = app.state.yaml;
    if (!yaml || !yaml.trim() || !window.sectionsState) return;
    const reordered = sectionsState.reorderMainArea(yaml, sectionOrder);
    if (reordered === yaml) return;
    app.setState({ yaml: reordered });
    if (_activeTab === 'resume') {
      window.editorAdapter.suppressNextPreviewRefresh();
      window.editorAdapter.setValuePreserveScroll(reordered);
      // file-sync's onChange handler saves automatically
    } else {
      try {
        localStorage.setItem('mkcv:default:resume.yaml', reordered);
      } catch {
        _toast('Resume not saved — browser storage is full or unavailable.', 'warn');
      }
    }
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
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => _save(_settingsYaml), 1000);
  }

  // ── Core: process a settings YAML change ──
  // opts.fromEditor  — change came from the CodeMirror editor (skip writing back)
  // opts.skipApply   — settings already applied externally (skip _applyAll + sections rebuild)
  // opts.skipPreview — caller will handle preview refresh (avoid double render)

  function _onYamlChange(yaml, opts = {}) {
    _settingsYaml = yaml;
    _parsed       = parseSettings(yaml);

    _updateValidStatus(_parsed);
    if (_activeTab === 'settings') _updateLineStat(yaml);

    const shouldApply = !!_parsed.value && !opts.skipApply;
    const shouldPreview = !!_parsed.value && !opts.skipPreview;

    if (opts.fromEditor && (shouldApply || shouldPreview)) {
      // Typing in settings.yaml should feel like resume.yaml: batch expensive UI sync
      // and preview work until the user pauses, instead of rerendering every keypress.
      _scheduleEditorEffects({ apply: shouldApply, preview: shouldPreview });
    } else {
      _clearEditorEffects();
      if (shouldApply) _applyAll(_parsed.value);
      if (shouldPreview) _refreshPreview();
    }

    _scheduleSave();

    // Reflect changes in editor when settings tab is active
    if (_activeTab === 'settings' && !opts.fromEditor && !_suppress) {
      _suppress = true;
      window.editorAdapter.setValuePreserveScroll(yaml);
      _suppress = false;
    }
  }

  // ── Public: called by layout-controls.js when toolbar changes ──

  function updateFromToolbar(mutator, opts = {}) {
    if (!_parsed.value) return;
    const next = JSON.parse(JSON.stringify(_parsed.value));
    mutator(next);
    const hasSelectiveApply = opts.applyToolbar || opts.applySections || opts.applyContact;
    if (hasSelectiveApply) _applySelected(next, opts);
    _onYamlChange(settingsToYaml(next), {
      skipApply: hasSelectiveApply ? true : (opts.skipApply ?? true),
      skipPreview: opts.skipPreview,
    });
  }

  // ── Public: called via monkey-patched sections-state methods ──

  function notifySectionStateChange() {
    // Always refresh preview immediately — sectionsState is already updated by the caller.
    if (window.preview && window.sectionsState) {
      preview.refresh(
        sectionsState.getOrderedFilteredYaml(app.state.yaml),
        app.state.template
      );
    }
    if (!_parsed.value) return;
    const order    = sectionsState.getOrder();
    const existing = new Map((_parsed.value.sections || []).map(s => [s.key, s]));
    const next     = JSON.parse(JSON.stringify(_parsed.value));
    next.sections  = order
      .filter(k => SECTION_CATALOG.some(c => c.key === k))
      .map(k => ({
        key:     k,
        title:   existing.get(k)?.title ?? (SECTION_CATALOG.find(c => c.key === k)?.defaultTitle ?? k.toUpperCase()),
        visible: !sectionsState.isHidden(k),
      }));
    // skipApply: sections already updated; skipPreview: we already refreshed above
    _onYamlChange(settingsToYaml(next), { skipApply: true, skipPreview: true });
    _reorderAndSaveResume(order);
  }

  // ── Public: called by sectionsUI to update section title inline ──

  function updateSectionTitle(key, newTitle) {
    if (!_parsed.value) return;
    const next = JSON.parse(JSON.stringify(_parsed.value));
    const section = next.sections.find(s => s.key === key);
    if (!section) return;
    section.title = newTitle;
    _onYamlChange(settingsToYaml(next), { skipApply: true });
  }

  function applyTemplateDefaults(rawDefaults, opts = {}) {
    const activeTemplate = app.state.template || _parsed.value?.template || DEFAULT_SETTINGS.template;
    const next = normalizeTemplateDefaults(rawDefaults, activeTemplate);
    _onYamlChange(settingsToYaml(next), { skipPreview: opts.skipPreview });
  }

  // ── Tab switching ──

  function switchToResume() {
    if (_activeTab === 'resume') return;
    _saveTabScroll(_activeTab);
    window.editorAdapter?.closeHint?.();
    _activeTab = 'resume';
    _setTabActive('resume');
    _suppress = true;
    window.editorAdapter.setValueSilently(app.state.yaml);
    window.editorAdapter.clearHistory();
    _restoreTabScroll('resume');
    _suppress = false;
    _restoreResumeStatus();
  }

  function switchToSettings() {
    if (_activeTab === 'settings') return;
    _saveTabScroll(_activeTab);
    window.editorAdapter?.closeHint?.();
    _activeTab = 'settings';
    _setTabActive('settings');
    _suppress = true;
    window.editorAdapter.setValueSilently(_settingsYaml);
    window.editorAdapter.clearHistory();
    _restoreTabScroll('settings');
    _suppress = false;
    _updateValidStatus(_parsed);
    _updateLineStat(_settingsYaml);
  }

  // ── Migration from localStorage ──

  function _migrate() {
    const FLAG = 'mkcv_migrated_to_settings_yaml';

    // Always check for key rename from intermediate versions (safe to run every time)
    if (!localStorage.getItem('mkcv:default:settings.yaml') && localStorage.getItem('mkcv_settings_yaml')) {
      try {
        localStorage.setItem('mkcv:default:settings.yaml', localStorage.getItem('mkcv_settings_yaml'));
        localStorage.removeItem('mkcv_settings_yaml');
      } catch {}
    }

    if (localStorage.getItem(FLAG)) return null;
    let migrated = false;
    const next   = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

    const density = localStorage.getItem('mkcv_density');
    if (density && VALID_DENSITY.includes(density)) { next.layout.density = density; migrated = true; }

    const font = localStorage.getItem('mkcv_font_scale');
    if (font && VALID_FONT.includes(font)) { next.layout.font_scale = font; migrated = true; }

    try {
      const raw = localStorage.getItem('mkcv_sections_state');
      if (raw) {
        const ss        = JSON.parse(raw);
        const order     = Array.isArray(ss?.order)  ? ss.order  : null;
        const hiddenArr = Array.isArray(ss?.hidden) ? ss.hidden : [];
        if (order) {
          next.sections = order
            .filter(k => KNOWN_KEYS.has(k))
            .map(k => ({
              key:     k,
              title:   SECTION_CATALOG.find(s => s.key === k)?.defaultTitle ?? k.toUpperCase(),
              visible: !hiddenArr.includes(k),
            }));
          migrated = true;
        }
      }
    } catch {}

    localStorage.setItem(FLAG, '1');
    ['mkcv_density', 'mkcv_font_scale', 'mkcv_sections_state'].forEach(k => localStorage.removeItem(k));
    return migrated ? next : null;
  }

  // ── Toast ──

  function _toast(msg, type = 'info') {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const el       = document.createElement('div');
    el.className   = `toast ${type}`;
    el.innerHTML   = `<span class="toast-title">${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  // ── Init ──

  document.addEventListener('DOMContentLoaded', () => {
    // Wire tab buttons
    document.getElementById('file-tab-resume')  ?.addEventListener('click', switchToResume);
    document.getElementById('file-tab-settings')?.addEventListener('click', switchToSettings);

    // Migration (before loading from localStorage)
    const migrated = _migrate();

    // Load settings from localStorage
    const stored = localStorage.getItem('mkcv:default:settings.yaml');
    if (stored && stored.trim()) {
      _settingsYaml = stored;
      _parsed       = parseSettings(stored);
    } else if (migrated) {
      _settingsYaml = settingsToYaml(migrated);
      _parsed       = parseSettings(_settingsYaml);
      _toast('Migrated layout & section settings to settings.yaml');
      _save(_settingsYaml);
    }

    // Apply to toolbar and section chips
    if (_parsed.value) {
      _applyAll(_parsed.value);
      if (app.state.yaml?.trim()) _refreshPreview();
    }

    // Monkey-patch sections-state to keep settings.yaml in sync
    if (window.sectionsState) {
      const orig = {
        setOrder:     sectionsState.setOrder.bind(sectionsState),
        toggleHidden: sectionsState.toggleHidden.bind(sectionsState),
        resetAll:     sectionsState.resetAll.bind(sectionsState),
      };
      sectionsState.setOrder     = (o)    => { orig.setOrder(o);     notifySectionStateChange(); };
      sectionsState.toggleHidden = (k)    => { orig.toggleHidden(k); notifySectionStateChange(); };
      sectionsState.resetAll     = (...a) => { orig.resetAll(...a);   notifySectionStateChange(); };
    }

    // Listen to editor changes when settings tab is active
    window.editorAdapter.onChange((val) => {
      if (_activeTab !== 'settings' || _suppress) return;
      _onYamlChange(val, { fromEditor: true });
    });
  });

  return {
    get activeTab() { return _activeTab; },
    updateFromToolbar,
    notifySectionStateChange,
    updateSectionTitle,
    applyTemplateDefaults,
    getYaml:     () => _settingsYaml,
    getSettings: () => _parsed.value || DEFAULT_SETTINGS,
    setYaml:     (yaml) => _onYamlChange(yaml),
  };
})();

window.settingsSync = settingsSync;
