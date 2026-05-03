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
  const KNOWN_KEYS    = new Set(SECTION_CATALOG.map(s => s.key));
  const VALID_DENSITY = ['comfortable', 'balanced', 'compact'];
  const VALID_FONT    = ['small', 'normal', 'large'];
  const VALID_TPL     = ['classic', 'academic-research', 'banking', 'column-skills', 'modern-startup', 'heritage'];

  const DEFAULT_SETTINGS = {
    template: 'classic',
    layout: { density: 'balanced', font_scale: 'normal' },
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
      'sections:',
    ];
    for (const sec of s.sections) {
      lines.push(`  - key: ${sec.key}`);
      lines.push(`    title: ${JSON.stringify(sec.title)}`);
      lines.push(`    visible: ${sec.visible}`);
    }
    return lines.join('\n') + '\n';
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

  return { SECTION_CATALOG, KNOWN_KEYS, VALID_DENSITY, VALID_FONT, VALID_TPL, DEFAULT_SETTINGS, settingsToYaml, parseSettings };
})();
