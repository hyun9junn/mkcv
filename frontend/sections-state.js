const sectionsState = (() => {
  const STORAGE_KEY = "mkcv_sections_state";

  const SECTION_DEFS = {
    summary: {
      label: "Summary",
      yaml: "summary: >\n  Write a brief professional summary here.\n",
    },
    experience: {
      label: "Experience",
      yaml: [
        "experience:",
        "  - title: Job Title",
        "    company: Company Name",
        '    start_date: "2024"',
        "    highlights:",
        "      - Key achievement",
        "",
      ].join("\n"),
    },
    education: {
      label: "Education",
      yaml: [
        "education:",
        "  - degree: B.S. Your Major",
        "    institution: University Name",
        '    year: "2020"',
        "",
      ].join("\n"),
    },
    skills: {
      label: "Skills",
      yaml: [
        "skills:",
        "  - category: Languages",
        "    items: [Python, JavaScript]",
        "",
      ].join("\n"),
    },
    projects: {
      label: "Projects",
      yaml: [
        "projects:",
        "  - name: Project Name",
        "    description: What it does",
        "    highlights:",
        "      - Key feature",
        "",
      ].join("\n"),
    },
    certifications: {
      label: "Certifications",
      yaml: [
        "certifications:",
        "  - name: Certification Name",
        "    issuer: Issuing Organization",
        '    date: "2024"',
        "",
      ].join("\n"),
    },
    publications: {
      label: "Publications",
      yaml: [
        "publications:",
        "  - title: Paper Title",
        "    venue: Conference or Journal",
        '    date: "2024"',
        "",
      ].join("\n"),
    },
    languages: {
      label: "Languages",
      yaml: [
        "languages:",
        "  - language: English",
        "    proficiency: Native",
        "",
      ].join("\n"),
    },
    awards: {
      label: "Awards",
      yaml: [
        "awards:",
        "  - name: Award Name",
        "    issuer: Awarding Organization",
        '    date: "2024"',
        "",
      ].join("\n"),
    },
    extracurricular: {
      label: "Extracurricular",
      yaml: [
        "extracurricular:",
        "  - title: Activity Name",
        "    organization: Organization Name",
        "    highlights:",
        "      - Key achievement",
        "",
      ].join("\n"),
    },
  };

  const DEFAULT_ORDER = Object.keys(SECTION_DEFS);

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function _save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function _getState() {
    const saved = _load();
    return {
      hidden: Array.isArray(saved?.hidden) ? saved.hidden : [],
      order: Array.isArray(saved?.order) ? saved.order : [...DEFAULT_ORDER],
    };
  }

  function isHidden(key) {
    return _getState().hidden.includes(key);
  }

  function toggleHidden(key) {
    const state = _getState();
    const idx = state.hidden.indexOf(key);
    if (idx === -1) {
      state.hidden.push(key);
    } else {
      state.hidden.splice(idx, 1);
    }
    _save(state);
  }

  function getOrder() {
    return _getState().order;
  }

  function setOrder(newOrder) {
    const state = _getState();
    state.order = newOrder;
    _save(state);
  }

  function ensureInOrder(key) {
    const state = _getState();
    if (!state.order.includes(key)) {
      state.order.push(key);
      _save(state);
    }
  }

  function getFilteredYaml(rawYaml) {
    try {
      const parsed = jsyaml.load(rawYaml);
      if (!parsed || typeof parsed !== "object") return rawYaml;
      const hidden = _getState().hidden;
      const filtered = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (!hidden.includes(k)) filtered[k] = v;
      }
      return jsyaml.dump(filtered, { lineWidth: -1 });
    } catch {
      return rawYaml;
    }
  }

  function resetSectionYaml(key, currentYaml) {
    // Returns { newYaml, previousYaml } or null on parse error.
    // previousYaml is a YAML string containing only the single section key.
    try {
      const parsed = jsyaml.load(currentYaml);
      if (!parsed || typeof parsed !== "object") return null;
      const defaultParsed = jsyaml.load(SECTION_DEFS[key].yaml);
      if (!defaultParsed) return null;
      const previousYaml = jsyaml.dump({ [key]: parsed[key] }, { lineWidth: -1 });
      parsed[key] = defaultParsed[key];
      const newYaml = jsyaml.dump(parsed, { lineWidth: -1 });
      return { newYaml, previousYaml };
    } catch {
      return null;
    }
  }

  function restoreSectionYaml(key, previousSectionYaml, currentYaml) {
    // Merges a single section's value back into currentYaml.
    try {
      const current = jsyaml.load(currentYaml);
      const previous = jsyaml.load(previousSectionYaml);
      if (!current || !previous) return null;
      current[key] = previous[key];
      return jsyaml.dump(current, { lineWidth: -1 });
    } catch {
      return null;
    }
  }

  return {
    SECTION_DEFS,
    DEFAULT_ORDER,
    isHidden,
    toggleHidden,
    getOrder,
    setOrder,
    ensureInOrder,
    getFilteredYaml,
    resetSectionYaml,
    restoreSectionYaml,
  };
})();

window.sectionsState = sectionsState;
