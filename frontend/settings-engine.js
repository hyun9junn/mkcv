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
  const VALID_LINK_DISPLAY = ['label', 'url', 'both'];

  const DEFAULT_SETTINGS = {
    template: 'classic',
    layout: { density: 'balanced', font_scale: 'normal' },
    personal: { link_display: 'label' },
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
      `  link_display: ${s.personal.link_display}  # label | url | both`,
      '',
      'sections:',
    ];
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
      if (VALID_LINK_DISPLAY.includes(personal.link_display)) normalized.personal.link_display = personal.link_display;
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
      if (parsed.personal.link_display != null) {
        out.personal.link_display = String(parsed.personal.link_display);
        if (!VALID_LINK_DISPLAY.includes(out.personal.link_display)) {
          warnings.push({ msg: `unknown link_display "${out.personal.link_display}" — using label`, line: null });
          out.personal.link_display = 'label';
        }
      }
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
    VALID_DENSITY,
    VALID_FONT,
    VALID_TPL,
    VALID_LINK_DISPLAY,
    DEFAULT_SETTINGS,
    settingsToYaml,
    parseSettings,
    normalizeTemplateDefaults,
  };
})();
