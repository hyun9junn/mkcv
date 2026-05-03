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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage unavailable (quota exceeded or private browsing); operate statelessly.
    }
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
    if (!Array.isArray(newOrder)) return;
    const state = _getState();
    state.order = newOrder;
    _save(state);
  }

  function resetAll() {
    _save({ hidden: [], order: [...DEFAULT_ORDER] });
  }

  function ensureInOrder(key) {
    const state = _getState();
    if (!state.order.includes(key)) {
      state.order.push(key);
      _save(state);
    }
  }

  function getCustomDefs(rawYaml) {
    try {
      const parsed = jsyaml.load(rawYaml);
      if (!parsed || !Array.isArray(parsed.custom_sections)) return {};
      const defs = {};
      for (const cs of parsed.custom_sections) {
        if (cs && cs.key && cs.title) {
          defs[cs.key] = { label: cs.title, yaml: null };
        }
      }
      return defs;
    } catch {
      return {};
    }
  }

  function getExpandedPresentKeys(rawYaml) {
    try {
      const parsed = jsyaml.load(rawYaml);
      if (!parsed || typeof parsed !== "object") return [];
      const keys = Object.keys(parsed).filter((k) => k !== "personal" && k !== "custom_sections");
      const customDefs = getCustomDefs(rawYaml);
      return [...keys, ...Object.keys(customDefs)];
    } catch {
      return [];
    }
  }

  function getDef(key, rawYaml) {
    if (SECTION_DEFS[key]) return SECTION_DEFS[key];
    const customDefs = getCustomDefs(rawYaml);
    return customDefs[key] || null;
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

  function getOrderedFilteredYaml(rawYaml) {
    try {
      const parsed = jsyaml.load(rawYaml);
      if (!parsed || typeof parsed !== "object") return rawYaml;
      const { hidden, order } = _getState();
      const customDefs = getCustomDefs(rawYaml);
      const customKeys = Object.keys(customDefs);

      const anyCustomVisible = customKeys.some((k) => !hidden.includes(k));

      const ordered = {};
      if ("personal" in parsed) ordered.personal = parsed.personal;
      for (const key of order) {
        if (key in parsed && key !== "custom_sections" && !hidden.includes(key)) {
          ordered[key] = parsed[key];
        }
      }
      if (anyCustomVisible && Array.isArray(parsed.custom_sections)) {
        ordered.custom_sections = parsed.custom_sections.filter(
          (cs) => cs && cs.key && !hidden.includes(cs.key)
        );
      }
      for (const [k, v] of Object.entries(parsed)) {
        if (!(k in ordered) && !hidden.includes(k) && k !== "custom_sections") {
          ordered[k] = v;
        }
      }
      return jsyaml.dump(ordered, { lineWidth: -1 });
    } catch {
      return rawYaml;
    }
  }

  function getVisibleOrder(rawYaml) {
    try {
      const parsed = jsyaml.load(rawYaml);
      if (!parsed || typeof parsed !== "object") return [];
      const { hidden, order } = _getState();
      const expandedKeys = getExpandedPresentKeys(rawYaml);
      const present = new Set(expandedKeys);
      const result = order.filter((k) => present.has(k) && !hidden.includes(k));
      for (const k of expandedKeys) {
        if (!result.includes(k) && !hidden.includes(k)) result.push(k);
      }
      return result;
    } catch {
      return [];
    }
  }

  const INVISIBLE_MARKER = '### invisible sections';

  function _splitAtMarker(rawYaml) {
    const lines = rawYaml.split('\n');
    const idx = lines.findIndex(l => l.trim() === INVISIBLE_MARKER);
    if (idx === -1) return { main: rawYaml, invisible: '' };
    return {
      main: lines.slice(0, idx).join('\n'),
      invisible: lines.slice(idx + 1).join('\n').replace(/^\n+/, ''),
    };
  }

  function _joinParts(main, invisible) {
    const m = main.trimEnd();
    const iv = (invisible || '').trim();
    if (!iv) return m + '\n';
    return m + '\n\n' + INVISIBLE_MARKER + '\n\n' + iv + '\n';
  }

  function _extractBlock(text, key) {
    const lines = text.split('\n');
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === key + ':' || lines[i].startsWith(key + ': ')) {
        start = i; break;
      }
    }
    if (start === -1) return null;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.length > 0 && !/^\s/.test(l) && !l.startsWith('#')) { end = i; break; }
    }
    return lines.slice(start, end).join('\n').trimEnd();
  }

  function _removeBlock(text, key) {
    const lines = text.split('\n');
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === key + ':' || lines[i].startsWith(key + ': ')) {
        start = i; break;
      }
    }
    if (start === -1) return text;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.length > 0 && !/^\s/.test(l) && !l.startsWith('#')) { end = i; break; }
    }
    while (start > 0 && lines[start - 1].trim() === '') start--;
    return lines.slice(0, start).concat(lines.slice(end)).join('\n');
  }

  function moveToInvisible(rawYaml, key) {
    const { main, invisible } = _splitAtMarker(rawYaml);
    const block = _extractBlock(main, key);
    if (!block) return rawYaml;
    const newMain = _removeBlock(main, key);
    const newInvisible = invisible.trim() ? invisible.trimEnd() + '\n\n' + block : block;
    return _joinParts(newMain, newInvisible);
  }

  function moveFromInvisible(rawYaml, key) {
    const { main, invisible } = _splitAtMarker(rawYaml);
    const block = _extractBlock(invisible, key);
    if (!block) return rawYaml;
    const newInvisible = _removeBlock(invisible, key);
    const newMain = main.trimEnd() + '\n\n' + block;
    return _joinParts(newMain, newInvisible);
  }

  function appendToMainArea(rawYaml, yamlToAppend) {
    const { main, invisible } = _splitAtMarker(rawYaml);
    const newMain = main.replace(/\n*$/, '\n') + yamlToAppend;
    return _joinParts(newMain, invisible);
  }

  function resetSectionYaml(key, currentYaml) {
    // Returns { newYaml, previousYaml } or null on parse error.
    // previousYaml is a YAML string containing only the single section key.
    try {
      const parsed = jsyaml.load(currentYaml);
      if (!parsed || typeof parsed !== "object") return null;
      if (!SECTION_DEFS[key]) return null;
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
    getOrderedFilteredYaml,
    getVisibleOrder,
    getCustomDefs,
    getExpandedPresentKeys,
    getDef,
    resetSectionYaml,
    restoreSectionYaml,
    resetAll,
    moveToInvisible,
    moveFromInvisible,
    appendToMainArea,
  };
})();

window.sectionsState = sectionsState;
