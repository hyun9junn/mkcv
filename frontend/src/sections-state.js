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
        '    start_date: "2020"',
        '    end_date: "2024"',
        "",
      ].join("\n"),
    },
    skills: {
      label: "Skills",
      yaml: [
        "skills:",
        "  - category: Languages",
        "    items:",
        "      - Python",
        "      - JavaScript",
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
  let _cachedResumeYaml = null;
  let _cachedParsedResume = null;
  let _cachedResumeError = null;
  let _hasCachedResume = false;

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

  function _cloneValue(value) {
    if (value == null || typeof value !== "object") return value;
    if (typeof structuredClone === "function") return structuredClone(value);
    if (Array.isArray(value)) return value.map(_cloneValue);
    if (value instanceof Date) return new Date(value.getTime());
    const cloned = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      cloned[key] = _cloneValue(nestedValue);
    }
    return cloned;
  }

  function _getParsedResume(rawYaml) {
    const useCache = typeof rawYaml === "string";
    if (useCache && _hasCachedResume && rawYaml === _cachedResumeYaml) {
      if (_cachedResumeError) throw _cachedResumeError;
      return _cachedParsedResume;
    }

    try {
      const parsed = jsyaml.load(rawYaml);
      if (useCache) {
        _cachedResumeYaml = rawYaml;
        _cachedParsedResume = parsed;
        _cachedResumeError = null;
        _hasCachedResume = true;
      }
      return parsed;
    } catch (error) {
      if (useCache) {
        _cachedResumeYaml = rawYaml;
        _cachedParsedResume = null;
        _cachedResumeError = error;
        _hasCachedResume = true;
      }
      throw error;
    }
  }

  function parseResumeYaml(rawYaml) {
    return _cloneValue(_getParsedResume(rawYaml));
  }

  function getCustomDefs(rawYaml) {
    try {
      const parsed = _getParsedResume(rawYaml);
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
      const parsed = _getParsedResume(rawYaml);
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
      const parsed = _getParsedResume(rawYaml);
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
      const parsed = _getParsedResume(rawYaml);
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
      const parsed = _getParsedResume(rawYaml);
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

  function _uniqKeys(keys) {
    const out = [];
    for (const key of keys || []) {
      if (!key || out.includes(key)) continue;
      out.push(key);
    }
    return out;
  }

  function _getTopLevelKeys(text) {
    const keys = [];
    for (const line of String(text || '').split('\n')) {
      if (!line || /^\s/.test(line) || line.startsWith('#')) continue;
      const match = line.match(/^([A-Za-z0-9_]+):(?:\s|$)/);
      if (match) keys.push(match[1]);
    }
    return keys;
  }

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

  function getYamlSectionLayout(rawYaml) {
    const { main, invisible } = _splitAtMarker(rawYaml);
    return {
      mainKeys: _getTopLevelKeys(main).filter((key) => key !== 'personal'),
      invisibleKeys: _getTopLevelKeys(invisible).filter((key) => key !== 'personal'),
    };
  }

  function getYamlSectionState(rawYaml, fallbackOrder = DEFAULT_ORDER) {
    const { mainKeys, invisibleKeys } = getYamlSectionLayout(rawYaml);
    const present = _uniqKeys([...mainKeys, ...invisibleKeys]);
    const order = _uniqKeys(Array.isArray(fallbackOrder) ? fallbackOrder : DEFAULT_ORDER);
    for (const key of present) {
      if (!order.includes(key)) order.push(key);
    }
    return {
      order,
      hidden: _uniqKeys(invisibleKeys),
    };
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
    const trimmedMain = main.trimEnd();
    const trimmedAppend = String(yamlToAppend || '').trimStart();
    const newMain = trimmedMain
      ? trimmedMain + '\n\n' + trimmedAppend
      : trimmedAppend;
    return _joinParts(newMain, invisible);
  }

  function reorderMainArea(rawYaml, order) {
    const { main, invisible } = _splitAtMarker(rawYaml);
    let remaining = main;
    const blocks = [];

    const personalBlock = _extractBlock(remaining, 'personal');
    if (personalBlock !== null) {
      blocks.push(personalBlock);
      remaining = _removeBlock(remaining, 'personal');
    }

    for (const key of order) {
      if (key === 'personal') continue;
      const block = _extractBlock(remaining, key);
      if (block !== null) {
        blocks.push(block);
        remaining = _removeBlock(remaining, key);
      }
    }

    const leftover = remaining.trim();
    if (leftover) blocks.push(leftover);

    return _joinParts(blocks.join('\n\n'), invisible);
  }

  function syncYamlToSectionState(rawYaml, order, hidden, opts = {}) {
    const hiddenSet = new Set(Array.isArray(hidden) ? hidden : []);
    const materializeSet = new Set(Array.isArray(opts.materialize) ? opts.materialize : []);
    const { mainKeys, invisibleKeys } = getYamlSectionLayout(rawYaml);
    const desiredOrder = _uniqKeys([
      ...(Array.isArray(order) ? order : []),
      ...mainKeys,
      ...invisibleKeys,
    ]);

    const { main, invisible } = _splitAtMarker(rawYaml);
    let remainingMain = main;
    let remainingInvisible = invisible;
    const blocksByKey = new Map();

    const personalBlock = _extractBlock(remainingMain, 'personal');
    if (personalBlock !== null) remainingMain = _removeBlock(remainingMain, 'personal');

    for (const key of desiredOrder) {
      const fromMain = _extractBlock(remainingMain, key);
      if (fromMain !== null) {
        blocksByKey.set(key, fromMain);
        remainingMain = _removeBlock(remainingMain, key);
      }

      const fromInvisible = _extractBlock(remainingInvisible, key);
      if (fromInvisible !== null) {
        if (!blocksByKey.has(key)) blocksByKey.set(key, fromInvisible);
        remainingInvisible = _removeBlock(remainingInvisible, key);
      }
    }

    const mainBlocks = [];
    const invisibleBlocks = [];
    for (const key of desiredOrder) {
      let block = blocksByKey.get(key);
      if (block == null && materializeSet.has(key) && SECTION_DEFS[key]?.yaml) {
        block = SECTION_DEFS[key].yaml.trimEnd();
      }
      if (block == null) continue;
      if (hiddenSet.has(key)) invisibleBlocks.push(block);
      else mainBlocks.push(block);
    }

    const mainParts = [];
    const invisibleParts = [];
    if (personalBlock !== null) mainParts.push(personalBlock);
    if (mainBlocks.length) mainParts.push(...mainBlocks);
    if (remainingMain.trim()) mainParts.push(remainingMain.trim());
    if (invisibleBlocks.length) invisibleParts.push(...invisibleBlocks);
    if (remainingInvisible.trim()) invisibleParts.push(remainingInvisible.trim());

    return _joinParts(mainParts.join('\n\n'), invisibleParts.join('\n\n'));
  }

  function materializeSection(rawYaml, key, desiredOrder, hidden = []) {
    if (!SECTION_DEFS[key]?.yaml) return rawYaml;

    const { mainKeys, invisibleKeys } = getYamlSectionLayout(rawYaml);
    if (mainKeys.includes(key) || invisibleKeys.includes(key)) return rawYaml;

    const currentOrder = _uniqKeys([...mainKeys, ...invisibleKeys]);
    const preferredOrder = _uniqKeys(
      Array.isArray(desiredOrder) && desiredOrder.length ? desiredOrder : DEFAULT_ORDER
    );
    const nextOrder = currentOrder.slice();
    const desiredIndex = preferredOrder.indexOf(key);

    const nextAnchor = desiredIndex === -1
      ? null
      : preferredOrder
          .slice(desiredIndex + 1)
          .find((candidate) => nextOrder.includes(candidate));

    if (nextAnchor) {
      nextOrder.splice(nextOrder.indexOf(nextAnchor), 0, key);
    } else {
      const previousAnchor = (desiredIndex === -1 ? preferredOrder : preferredOrder.slice(0, desiredIndex))
        .slice()
        .reverse()
        .find((candidate) => nextOrder.includes(candidate));

      if (previousAnchor) nextOrder.splice(nextOrder.indexOf(previousAnchor) + 1, 0, key);
      else nextOrder.push(key);
    }

    return syncYamlToSectionState(rawYaml, _uniqKeys([...nextOrder, ...preferredOrder]), hidden, {
      materialize: [key],
    });
  }

  function clearInvisibleArea(rawYaml) {
    const { main, invisible } = _splitAtMarker(rawYaml);
    if (!invisible.trim()) return rawYaml;
    const newMain = main.trimEnd() + '\n\n' + invisible.trim();
    return _joinParts(newMain, '');
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
    parseResumeYaml,
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
    clearInvisibleArea,
    reorderMainArea,
    getYamlSectionLayout,
    getYamlSectionState,
    syncYamlToSectionState,
    materializeSection,
  };
})();

window.sectionsState = sectionsState;
