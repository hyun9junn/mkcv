/* global jsyaml */
window.SETTINGS_HELPERS = (() => {
  const SECTION_CATALOG = [
    { key: 'summary',         defaultTitle: 'SUMMARY' },
    { key: 'experience',      defaultTitle: 'EXPERIENCE' },
    { key: 'education',       defaultTitle: 'EDUCATION' },
    { key: 'skills',          defaultTitle: 'SKILLS' },
    { key: 'projects',        defaultTitle: 'PROJECTS' },
    { key: 'certifications',  defaultTitle: 'CERTIFICATIONS' },
    { key: 'publications',    defaultTitle: 'PUBLICATIONS' },
    { key: 'languages',       defaultTitle: 'LANGUAGES' },
    { key: 'awards',          defaultTitle: 'AWARDS' },
    { key: 'extracurricular', defaultTitle: 'EXTRACURRICULAR' },
  ];
  const KNOWN_KEYS         = new Set(SECTION_CATALOG.map(s => s.key));
  const VALID_DENSITY      = ['comfortable', 'balanced', 'compact'];
  const VALID_FONT         = ['small', 'normal', 'large'];
  const VALID_TPL          = [
    'academic-research',
    'banking',
    'brutalist-mono',
    'classic',
    'column-skills',
    'editorial-magazine',
    'executive-corporate',
    'gazette',
    'heritage',
    'hipster',
    'modern-startup',
    'resume-tech',
    'sidebar-minimal',
    'split-header',
    'timeline-vertical',
  ];
  const VALID_LINK_DISPLAY        = ['label', 'url', 'both'];
  const VALID_GLOBAL_LINK_DISPLAY = ['label', 'url', 'both'];
  const VALID_FIELD_LINK_DISPLAY  = ['default', 'label', 'url', 'both'];

  const PERSONAL_FIELD_CATALOG = [
    { key: 'name',        isLink: false, locked: true  },
    { key: 'email',       isLink: false, locked: false },
    { key: 'phone',       isLink: false, locked: false },
    { key: 'location',    isLink: false, locked: false },
    { key: 'website',     isLink: true,  locked: false },
    { key: 'linkedin',    isLink: true,  locked: false },
    { key: 'github',      isLink: true,  locked: false },
    { key: 'huggingface', isLink: true,  locked: false },
  ];
  const LINK_FIELDS         = new Set(PERSONAL_FIELD_CATALOG.filter(f => f.isLink).map(f => f.key));
  const KNOWN_PERSONAL_KEYS = new Set(PERSONAL_FIELD_CATALOG.map(f => f.key));

  function _defaultPersonalField(key) {
    if (LINK_FIELDS.has(key)) return { key, visible: true, link_display: 'default' };
    return { key, visible: true };
  }

  function _defaultPersonalFields() {
    return PERSONAL_FIELD_CATALOG.map(f => _defaultPersonalField(f.key));
  }

  function _normalizeFieldLinkDisplay(key, rawValue) {
    if (!LINK_FIELDS.has(key)) return undefined;
    if (VALID_FIELD_LINK_DISPLAY.includes(rawValue)) return rawValue;
    if (VALID_GLOBAL_LINK_DISPLAY.includes(rawValue)) return rawValue;
    return 'default';
  }

  const DEFAULT_SETTINGS = {
    template: 'classic',
    layout: { density: 'balanced', font_scale: 'normal' },
    personal: {
      default_link_display: 'label',
      fields: _defaultPersonalFields(),
    },
    sections: [
      { key: 'summary',         title: 'SUMMARY',         visible: true  },
      { key: 'experience',      title: 'EXPERIENCE',      visible: true  },
      { key: 'education',       title: 'EDUCATION',       visible: true  },
      { key: 'skills',          title: 'SKILLS',          visible: true  },
      { key: 'projects',        title: 'PROJECTS',        visible: true  },
      { key: 'certifications',  title: 'CERTIFICATIONS',  visible: false },
      { key: 'publications',    title: 'PUBLICATIONS',    visible: false },
      { key: 'languages',       title: 'LANGUAGES',       visible: false },
      { key: 'awards',          title: 'AWARDS',          visible: false },
      { key: 'extracurricular', title: 'EXTRACURRICULAR', visible: false },
    ],
  };

  function settingsToYaml(s) {
    const lines = [
      '# settings.yaml — layout & section state',
      '# auto-synced with toolbar controls; edit either side',
      '',
      `template: ${s.template}`,
      '',
      'layout:',
      `  density:    ${s.layout.density}        # comfortable | balanced | compact`,
      `  font_scale: ${s.layout.font_scale}          # small | normal | large`,
      '',
      'personal:',
      `  default_link_display: ${s.personal.default_link_display}  # label | url | both`,
    ];
    if (Array.isArray(s.personal.fields) && s.personal.fields.length > 0) {
      lines.push('  fields:');
      for (const f of s.personal.fields) {
        lines.push(`    - key: ${f.key}`);
        lines.push(`      visible: ${f.visible}`);
        if (LINK_FIELDS.has(f.key)) {
          lines.push(`      link_display: ${_normalizeFieldLinkDisplay(f.key, f.link_display)}`);
        }
      }
    }
    lines.push('');
    lines.push('sections:');
    for (const sec of s.sections) {
      lines.push(`  - key: ${sec.key}`);
      lines.push(`    title: ${JSON.stringify(sec.title)}`);
      lines.push(`    visible: ${sec.visible}`);
    }
    return lines.join('\n') + '\n';
  }

  function _clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizePersonalFields(rawFields) {
    if (!Array.isArray(rawFields)) return _defaultPersonalFields();

    const seen = new Set();
    const result = [];
    for (const item of rawFields) {
      if (!item || typeof item !== 'object' || item.key == null) continue;
      const key = String(item.key);
      if (seen.has(key) || !KNOWN_PERSONAL_KEYS.has(key)) continue;
      seen.add(key);

      const entry = { key, visible: item.visible !== false };
      if (LINK_FIELDS.has(key)) {
        entry.link_display = _normalizeFieldLinkDisplay(key, item.link_display);
      }
      result.push(entry);
    }

    for (const f of PERSONAL_FIELD_CATALOG) {
      if (!seen.has(f.key)) result.push(_defaultPersonalField(f.key));
    }
    return result;
  }

  function _getDefaultSection(key) {
    return DEFAULT_SETTINGS.sections.find(section => section.key === key) || {
      key,
      title: SECTION_CATALOG.find(section => section.key === key)?.defaultTitle ?? key.toUpperCase(),
      visible: true,
    };
  }

  function normalizeTemplateDefaults(rawDefaults, currentTemplate = DEFAULT_SETTINGS.template) {
    const normalized = _clone(DEFAULT_SETTINGS);
    normalized.template = currentTemplate || DEFAULT_SETTINGS.template;

    if (!rawDefaults || typeof rawDefaults !== 'object') {
      return normalized;
    }

    const layout = rawDefaults.layout;
    if (layout && typeof layout === 'object') {
      if (VALID_DENSITY.includes(layout.density)) normalized.layout.density = layout.density;
      if (VALID_FONT.includes(layout.font_scale)) normalized.layout.font_scale = layout.font_scale;
    }

    const personal = rawDefaults.personal;
    if (personal && typeof personal === 'object') {
      const rawDefault = personal.default_link_display ?? personal.link_display;
      if (VALID_GLOBAL_LINK_DISPLAY.includes(rawDefault)) {
        normalized.personal.default_link_display = rawDefault;
      }
      if (Array.isArray(personal.fields)) normalized.personal.fields = normalizePersonalFields(personal.fields);
    }

    if (Array.isArray(rawDefaults.sections)) {
      const seen = new Set();
      const sections = [];
      for (const item of rawDefaults.sections) {
        if (!item || typeof item !== 'object' || item.key == null) continue;
        const key = String(item.key);
        if (seen.has(key) || !KNOWN_KEYS.has(key)) continue;
        seen.add(key);
        const fallback = _getDefaultSection(key);
        sections.push({
          key,
          title: item.title != null ? String(item.title) : fallback.title,
          visible: item.visible !== false,
        });
      }
      if (sections.length > 0) {
        normalized.sections = sections.concat(
          DEFAULT_SETTINGS.sections
            .filter(section => !seen.has(section.key))
            .map(section => _clone(section))
        );
      }
    }

    return normalized;
  }

  function parseSettings(yaml) {
    const errors = [], warnings = [];
    let parsed;
    try {
      parsed = jsyaml.load(yaml);
    } catch (e) {
      errors.push({ msg: e.message || 'YAML parse error', line: e.mark?.line ?? null });
      return { value: null, errors, warnings };
    }
    if (!parsed || typeof parsed !== 'object') {
      errors.push({ msg: 'Settings must be a YAML mapping', line: null });
      return { value: null, errors, warnings };
    }

    const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

    if (parsed.template != null) {
      out.template = String(parsed.template);
      if (!VALID_TPL.includes(out.template))
        warnings.push({ msg: `unknown template "${out.template}"`, line: null });
    }

    if (parsed.layout && typeof parsed.layout === 'object') {
      if (parsed.layout.density != null) {
        out.layout.density = String(parsed.layout.density);
        if (!VALID_DENSITY.includes(out.layout.density)) {
          warnings.push({ msg: `unknown density "${out.layout.density}" — using balanced`, line: null });
          out.layout.density = 'balanced';
        }
      }
      if (parsed.layout.font_scale != null) {
        out.layout.font_scale = String(parsed.layout.font_scale);
        if (!VALID_FONT.includes(out.layout.font_scale)) {
          warnings.push({ msg: `unknown font_scale "${out.layout.font_scale}" — using normal`, line: null });
          out.layout.font_scale = 'normal';
        }
      }
    }

    if (parsed.personal && typeof parsed.personal === 'object') {
      const rawDefault = parsed.personal.default_link_display ?? parsed.personal.link_display;
      if (rawDefault != null) {
        out.personal.default_link_display = String(rawDefault);
        if (!VALID_GLOBAL_LINK_DISPLAY.includes(out.personal.default_link_display)) {
          warnings.push({ msg: `unknown default_link_display "${out.personal.default_link_display}" — using label`, line: null });
          out.personal.default_link_display = 'label';
        }
      }
      out.personal.fields = normalizePersonalFields(
        Array.isArray(parsed.personal.fields) ? parsed.personal.fields : undefined
      );
    }

    if (Array.isArray(parsed.sections)) {
      const seen = new Set();
      const sections = [];
      for (const item of parsed.sections) {
        if (!item || typeof item !== 'object' || !item.key) {
          warnings.push({ msg: 'section entry missing `key`', line: null });
          continue;
        }
        const key = String(item.key);
        if (seen.has(key)) { warnings.push({ msg: `duplicate section "${key}"`, line: null }); continue; }
        seen.add(key);
        if (!KNOWN_KEYS.has(key)) warnings.push({ msg: `unknown section "${key}"`, line: null });
        sections.push({
          key,
          title:   item.title != null ? String(item.title) : (SECTION_CATALOG.find(s => s.key === key)?.defaultTitle ?? key.toUpperCase()),
          visible: item.visible !== false,
        });
      }
      if (sections.length) out.sections = sections;
    }

    return { value: out, errors, warnings };
  }

  return {
    SECTION_CATALOG,
    KNOWN_KEYS,
    PERSONAL_FIELD_CATALOG,
    LINK_FIELDS,
    VALID_DENSITY,
    VALID_FONT,
    VALID_TPL,
    VALID_LINK_DISPLAY,
    VALID_GLOBAL_LINK_DISPLAY,
    VALID_FIELD_LINK_DISPLAY,
    DEFAULT_SETTINGS,
    settingsToYaml,
    parseSettings,
    normalizePersonalFields,
    normalizeTemplateDefaults,
  };
})();
