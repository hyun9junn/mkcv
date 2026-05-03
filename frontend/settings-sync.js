/* global app, sectionsState, sectionsUI, preview, validator */
const settingsSync = (() => {
  const { SECTION_CATALOG, KNOWN_KEYS, VALID_DENSITY, VALID_FONT, DEFAULT_SETTINGS, settingsToYaml, parseSettings } =
    window.SETTINGS_HELPERS;

  let _activeTab     = 'resume';
  let _settingsYaml  = settingsToYaml(DEFAULT_SETTINGS);
  let _parsed        = parseSettings(_settingsYaml);
  let _saveTimer     = null;
  let _suppress      = false; // block re-entrant editor updates

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

  // ── Apply settings to toolbar + sections ──

  function _applyToToolbar(settings) {
    document.getElementById('density-group')?.querySelectorAll('button[data-value]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === settings.layout.density);
    });
    document.getElementById('font-scale-group')?.querySelectorAll('button[data-value]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === settings.layout.font_scale);
    });
    app.setState({ density: settings.layout.density, font_scale: settings.layout.font_scale });
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

  function _applyAll(settings) {
    _applyToToolbar(settings);
    _applyToSections(settings);
  }

  // ── Reorder mycv.yaml to match section order ──

  async function _reorderAndSaveResume(sectionOrder) {
    const yaml = app.state.yaml;
    if (!yaml || !yaml.trim() || !window.sectionsState) return;
    const reordered = sectionsState.reorderMainArea(yaml, sectionOrder);
    if (reordered === yaml) return;
    app.setState({ yaml: reordered });
    if (_activeTab === 'resume') {
      window.editorAdapter.setValue(reordered);
      // file-sync's onChange handler saves automatically
    } else {
      try {
        await fetch('/api/file', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ content: reordered }),
        });
      } catch {}
    }
  }

  // ── Save to backend ──

  async function _save(yaml) {
    try {
      await fetch('/api/settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content: yaml }),
      });
    } catch {}
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

    if (_parsed.value && !opts.skipApply) {
      _applyAll(_parsed.value);
    }

    if (_parsed.value && !opts.skipPreview) {
      if (window.preview && window.sectionsState) {
        preview.refresh(
          sectionsState.getOrderedFilteredYaml(app.state.yaml),
          app.state.template
        );
      }
    }

    _scheduleSave();

    // Reflect changes in editor when settings tab is active
    if (_activeTab === 'settings' && !opts.fromEditor && !_suppress) {
      _suppress = true;
      window.editorAdapter.setValue(yaml);
      _suppress = false;
    }
  }

  // ── Public: called by layout-controls.js when toolbar changes ──

  function updateFromToolbar(mutator) {
    if (!_parsed.value) return;
    const next = JSON.parse(JSON.stringify(_parsed.value));
    mutator(next);
    _onYamlChange(settingsToYaml(next), { skipApply: true }); // toolbar already updated by caller
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

  // ── Tab switching ──

  function switchToResume() {
    if (_activeTab === 'resume') return;
    _activeTab = 'resume';
    _setTabActive('resume');
    _suppress = true;
    window.editorAdapter.setValue(app.state.yaml);
    window.editorAdapter.clearHistory();
    _suppress = false;
    _restoreResumeStatus();
  }

  function switchToSettings() {
    if (_activeTab === 'settings') return;
    _activeTab = 'settings';
    _setTabActive('settings');
    _suppress = true;
    window.editorAdapter.setValue(_settingsYaml);
    window.editorAdapter.clearHistory();
    _suppress = false;
    _updateValidStatus(_parsed);
    _updateLineStat(_settingsYaml);
  }

  // ── Migration from localStorage ──

  function _migrate() {
    const FLAG = 'mkcv_migrated_to_settings_yaml';
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

  function _toast(msg) {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const el       = document.createElement('div');
    el.className   = 'toast info';
    el.innerHTML   = `<span class="toast-title">${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  // ── Init ──

  document.addEventListener('DOMContentLoaded', async () => {
    // Wire tab buttons
    document.getElementById('file-tab-resume')  ?.addEventListener('click', switchToResume);
    document.getElementById('file-tab-settings')?.addEventListener('click', switchToSettings);

    // Migration (before loading from backend)
    const migrated = _migrate();

    // Load settings.yaml from backend
    let fromBackend = false;
    try {
      const resp = await fetch('/api/settings');
      if (resp.ok) {
        const { content } = await resp.json();
        if (content && content.trim()) {
          _settingsYaml = content;
          _parsed       = parseSettings(content);
          fromBackend   = true;
        }
      }
    } catch {}

    if (!fromBackend) {
      if (migrated) {
        _settingsYaml = settingsToYaml(migrated);
        _parsed       = parseSettings(_settingsYaml);
        _toast('Migrated layout & section settings to settings.yaml');
      }
      await _save(_settingsYaml); // write defaults (or migrated) to disk
    }

    // Apply to toolbar and section chips
    if (_parsed.value) _applyAll(_parsed.value);

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
    getYaml:     () => _settingsYaml,
    getSettings: () => _parsed.value || DEFAULT_SETTINGS,
  };
})();

window.settingsSync = settingsSync;
