// Schema-aware YAML key completion for CodeMirror 5.
(function () {
  "use strict";

  const LIST_SECTIONS = new Set([
    "experience", "education", "skills", "projects",
    "certifications", "publications", "languages", "awards", "extracurricular",
  ]);

  let schema = null; // null = silently disabled

  async function fetchSchema() {
    try {
      const resp = await fetch("/api/schema");
      if (!resp.ok) return;
      const data = await resp.json();
      if (data && typeof data === "object") schema = data;
    } catch (_) {
      // Network or parse failure — stay disabled
    }
  }

  // ---------------------------------------------------------------------------
  // Context detection
  // ---------------------------------------------------------------------------

  // Returns the schema context key for the cursor position, or null.
  // Never throws — catches all errors and returns null.
  function detectContext(editor) {
    try {
      const cursor = editor.getCursor();
      const lineText = editor.getLine(cursor.line);
      const indent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;

      // If cursor is after "key: " (value position), no completions
      const textBeforeCursor = lineText.slice(0, cursor.ch);
      const leadingMatch = textBeforeCursor.match(/^(\s*(?:-\s+)?)/);
      const tokenStart = leadingMatch ? leadingMatch[0].length : 0;
      if (textBeforeCursor.slice(tokenStart).includes(":")) return null;

      // Root level (indent 0)
      if (indent === 0) return "__root__";

      // Indent 2: direct child of a root key
      if (indent === 2) {
        const parentKey = findParentKeyAt(editor, cursor.line, 0);
        if (!parentKey) return null;
        if (parentKey === "personal") return "personal";
        if (LIST_SECTIONS.has(parentKey)) return parentKey + "[]";
        return null;
      }

      // Indent 4+: inside a list item (e.g. experience[])
      if (indent >= 4) {
        // Nested bullet lines (e.g. '      - ' inside highlights) are not field positions
        if (lineText.trimStart().startsWith('- ') || /^\s*-\s*$/.test(lineText)) return null;
        const sectionKey = findListItemSection(editor, cursor.line);
        if (sectionKey) return sectionKey + "[]";
        return null;
      }

      return null;
    } catch (_) {
      return null;
    }
  }

  // Scan upward from fromLine to find the nearest key at targetIndent.
  function findParentKeyAt(editor, fromLine, targetIndent) {
    for (let i = fromLine - 1; i >= 0; i--) {
      const text = editor.getLine(i);
      if (!text.trim()) continue;
      const lineIndent = (text.match(/^(\s*)/) || ["", ""])[1].length;
      if (lineIndent === targetIndent) {
        const m = text.match(/^(\s*)(\w[\w_]*):/);
        if (m) return m[2];
      }
      if (lineIndent < targetIndent) break;
    }
    return null;
  }

  // For lines at indent >= 4, find which list section they belong to.
  function findListItemSection(editor, fromLine) {
    for (let i = fromLine - 1; i >= 0; i--) {
      const text = editor.getLine(i);
      if (!text.trim()) continue;
      const lineIndent = (text.match(/^(\s*)/) || ["", ""])[1].length;
      // List item marker is at indent 2
      if (lineIndent === 2 && text.trimStart().startsWith("- ")) {
        return findParentKeyAt(editor, i, 0);
      }
      if (lineIndent < 2) break;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Value context detection
  // ---------------------------------------------------------------------------

  const VALUE_FIELDS = new Set(['start_date', 'end_date', 'date', 'proficiency']);

  // Returns the field name if cursor is in value position for a known value field, else null.
  // Handles empty value (key: |) and partially typed values including quoted (key: "Pre|).
  function detectValueContext(editor) {
    try {
      const cursor = editor.getCursor();
      const lineText = editor.getLine(cursor.line);
      const textBeforeCursor = lineText.slice(0, cursor.ch);
      // Matches: optional indent + key + ': ' + optional opening quote + partial word/date
      const m = textBeforeCursor.match(/^\s*(?:-\s+)?(\w[\w_]*):\s*["']?([\w.-]*)$/);
      if (!m) return null;
      const field = m[1];
      return VALUE_FIELDS.has(field) ? field : null;
    } catch (_) {
      return null;
    }
  }

  // Returns {from, to} covering the value token including any opening quote.
  // Accepting a suggestion replaces from the opening quote to the cursor — no doubled quotes.
  function getValueToken(editor) {
    try {
      const cursor = editor.getCursor();
      const lineText = editor.getLine(cursor.line);
      const textBeforeCursor = lineText.slice(0, cursor.ch);
      const keyColonMatch = textBeforeCursor.match(/^\s*(?:-\s+)?\w[\w_]*:\s*/);
      if (!keyColonMatch) return null;
      return {
        from: { line: cursor.line, ch: keyColonMatch[0].length },
        to:   { line: cursor.line, ch: cursor.ch },
      };
    } catch (_) {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Value suggestions
  // ---------------------------------------------------------------------------

  function generateDateSuggestions(field) {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth() + 1; // 1–12
    const months = [];
    for (let i = 0; i < 6; i++) {
      let m = month - i;
      let y = year;
      if (m <= 0) { m += 12; y -= 1; }
      months.push(`"${y}.${String(m).padStart(2, '0')}"`);
    }
    if (field === 'end_date')   return ['"Present"', ...months, `"${year}"`];
    if (field === 'start_date') return [...months, `"${year}"`];
    if (field === 'date')       return [`"${year}"`, `"${year-1}"`, `"${year-2}"`, `"${year-3}"`, `"${year-4}"`];
    return [];
  }

  function getValueSuggestions(field) {
    if (field === 'proficiency') return ['"Native"', '"Fluent"', '"Intermediate"', '"Basic"'];
    return generateDateSuggestions(field);
  }

  // ---------------------------------------------------------------------------
  // Section templates
  // ---------------------------------------------------------------------------

  const SECTION_TEMPLATES = {
    experience:     { fields: ['title', 'company', 'start_date', 'end_date', 'location', 'highlights'], listFields: ['highlights'] },
    education:      { fields: ['degree', 'institution', 'start_date', 'end_date', 'gpa'],              listFields: [] },
    skills:         { fields: ['category', 'items'],                                                    listFields: ['items'] },
    projects:       { fields: ['name', 'description', 'url', 'highlights'],                            listFields: ['highlights'] },
    certifications: { fields: ['name', 'issuer', 'date'],                                              listFields: [] },
    publications:   { fields: ['title', 'venue', 'date', 'url'],                                       listFields: [] },
    languages:      { fields: ['language', 'proficiency'],                                              listFields: [] },
    awards:         { fields: ['name', 'issuer', 'date'],                                              listFields: [] },
    extracurricular:{ fields: ['title', 'organization', 'date', 'highlights'],                         listFields: ['highlights'] },
  };

  // Returns the SECTION_DEFS yaml string for name, trimmed, or null if unavailable.
  function _sectionDefYaml(name) {
    return (typeof sectionsState !== 'undefined' &&
            sectionsState.SECTION_DEFS &&
            sectionsState.SECTION_DEFS[name] &&
            sectionsState.SECTION_DEFS[name].yaml)
      ? sectionsState.SECTION_DEFS[name].yaml.trim()
      : null;
  }

  // Returns the full root-level section block for insertion, using SECTION_DEFS example values.
  function buildRootTemplate(name) {
    const defYaml = _sectionDefYaml(name);
    if (defYaml) return defYaml;
    // Fallback: generated empty skeleton
    const tmpl = SECTION_TEMPLATES[name];
    if (!tmpl) return name + ': ';
    const { fields, listFields } = tmpl;
    const lines = [name + ':'];
    lines.push('  - ' + fields[0] + ':');
    for (let i = 1; i < fields.length; i++) {
      const f = fields[i];
      if (listFields.includes(f)) {
        lines.push('    ' + f + ':');
        lines.push('      - ');
      } else {
        lines.push('    ' + f + ':');
      }
    }
    return lines.join('\n');
  }

  // Returns the item skeleton text inserted right after '  - ' on the cursor line,
  // using SECTION_DEFS example values. baseIndent is the leading spaces before '-'.
  function buildItemTemplate(sectionName, baseIndent) {
    const defYaml = _sectionDefYaml(sectionName);
    if (defYaml) {
      const itemMarker = '\n  - ';
      const idx = defYaml.indexOf(itemMarker);
      if (idx !== -1) {
        const rawItem = defYaml.slice(idx + itemMarker.length);
        if (baseIndent === 2) return rawItem;
        // Re-indent for non-standard base indent
        const shift = baseIndent - 2;
        return rawItem.replace(/\n( +)/g, (_, sp) => '\n' + ' '.repeat(sp.length + shift));
      }
    }
    // Fallback: generated empty skeleton
    const tmpl = SECTION_TEMPLATES[sectionName];
    if (!tmpl) return null;
    const { fields, listFields } = tmpl;
    const contIndent   = ' '.repeat(baseIndent + 2);
    const bulletIndent = ' '.repeat(baseIndent + 4);
    const parts = [fields[0] + ':'];
    for (let i = 1; i < fields.length; i++) {
      const f = fields[i];
      if (listFields.includes(f)) {
        parts.push(contIndent + f + ':');
        parts.push(bulletIndent + '- ');
      } else {
        parts.push(contIndent + f + ':');
      }
    }
    return parts.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Token extraction
  // ---------------------------------------------------------------------------

  // Returns { prefix, from, to } for the current key token.
  function getToken(editor) {
    const cursor = editor.getCursor();
    const lineText = editor.getLine(cursor.line);
    const textBeforeCursor = lineText.slice(0, cursor.ch);

    // Everything after leading whitespace and optional "- "
    const leadingMatch = textBeforeCursor.match(/^(\s*(?:-\s+)?)/);
    const tokenStart = leadingMatch ? leadingMatch[0].length : 0;
    const prefix = textBeforeCursor.slice(tokenStart);

    // End of token: up to first ":", space, or end of line
    const rest = lineText.slice(cursor.ch);
    const restStopIdx = rest.search(/[:\s]/);
    const tokenEndCh = restStopIdx === -1 ? lineText.length : cursor.ch + restStopIdx;

    return {
      prefix: prefix.toLowerCase(),
      from: { line: cursor.line, ch: tokenStart },
      to: { line: cursor.line, ch: tokenEndCh },
    };
  }

  // ---------------------------------------------------------------------------
  // Deduplication: keys already present in the same mapping block
  // ---------------------------------------------------------------------------

  function getSiblingKeys(editor, contextKey, cursorLine) {
    try {
      if (contextKey === "__root__") {
        const siblings = new Set();
        for (let i = 0; i < editor.lineCount(); i++) {
          if (i === cursorLine) continue;
          const m = editor.getLine(i).match(/^(\w[\w_]*):/);
          if (m) siblings.add(m[1]);
        }
        return siblings;
      }

      if (contextKey === "personal") {
        const siblings = new Set();
        let inside = false;
        for (let i = 0; i < editor.lineCount(); i++) {
          if (i === cursorLine) continue;
          const text = editor.getLine(i);
          if (text.match(/^personal:/)) { inside = true; continue; }
          if (inside) {
            if (text.trim() === "") continue;             // blank line — stay inside block
            if (!text.match(/^  /)) { inside = false; continue; }  // dedented — exit block
            const m = text.match(/^  (\w[\w_]*):/);
            if (m) siblings.add(m[1]);
          }
        }
        return siblings;
      }

      if (contextKey.endsWith("[]")) {
        // Dedup within the current list item block only.
        const curText = editor.getLine(cursorLine);
        let itemStart = cursorLine;
        // If not on the "- " line, scan up to find it
        if (!curText.trimStart().startsWith("- ")) {
          for (let i = cursorLine - 1; i >= 0; i--) {
            const text = editor.getLine(i);
            if (text.match(/^\s{2}-/)) { itemStart = i; break; }
            if (text.match(/^\S/)) break;
          }
        }
        // Find end of this item (next "  - " or next root key)
        let itemEnd = editor.lineCount() - 1;
        for (let i = itemStart + 1; i < editor.lineCount(); i++) {
          const text = editor.getLine(i);
          if (text.match(/^\s{2}-/) || text.match(/^\S/)) { itemEnd = i - 1; break; }
        }
        const siblings = new Set();
        for (let i = itemStart; i <= itemEnd; i++) {
          if (i === cursorLine) continue;
          const m = editor.getLine(i).match(/^[\s-]*(\w[\w_]*):/);
          if (m) siblings.add(m[1]);
        }
        return siblings;
      }
    } catch (_) { /* ignore */ }
    return new Set();
  }

  // ---------------------------------------------------------------------------
  // Fuzzy matching
  // ---------------------------------------------------------------------------

  // Returns 2 (exact prefix), 1 (subsequence), or -1 (no match).
  function fuzzyScore(pattern, candidate) {
    if (!pattern) return 1; // empty prefix: show all
    const p = pattern.toLowerCase();
    const c = candidate.toLowerCase();
    if (c.startsWith(p)) return 2;
    let pi = 0;
    for (let ci = 0; ci < c.length && pi < p.length; ci++) {
      if (p[pi] === c[ci]) pi++;
    }
    return pi === p.length ? 1 : -1;
  }

  // ---------------------------------------------------------------------------
  // Settings tab autocomplete
  // ---------------------------------------------------------------------------

  const SETTINGS_VALUE_SUGGESTIONS = {
    template: () => (window.SETTINGS_HELPERS?.VALID_TPL ?? []),
    'layout.density': () => (window.SETTINGS_HELPERS?.VALID_DENSITY ?? []),
    'layout.font_scale': () => (window.SETTINGS_HELPERS?.VALID_FONT ?? []),
    'personal.default_link_display': () => ['label', 'url', 'both'],
    'personal.fields.visible': () => ['true', 'false'],
    'personal.fields.link_display': () => ['default', 'label', 'url', 'both'],
    'sections.visible': () => ['true', 'false'],
  };

  function _activeTab() {
    return window.settingsSync?.activeTab ?? 'resume';
  }

  function _isResumeTab() {
    return _activeTab() === 'resume';
  }

  function _isSettingsTab() {
    return _activeTab() === 'settings';
  }

  function detectSettingsValueContext(editor) {
    try {
      const cursor = editor.getCursor();
      const lineText = editor.getLine(cursor.line);
      const textBeforeCursor = lineText.slice(0, cursor.ch);
      const match = textBeforeCursor.match(/^\s*(?:-\s+)?(\w[\w_]*):\s*["']?([\w-]*)$/);
      if (!match) return null;

      const field = match[1];
      const indent = (lineText.match(/^(\s*)/) || ['', ''])[1].length;
      const valueToken = getValueToken(editor);
      if (!valueToken) return null;

      // template: classic
      if (indent === 0 && field === 'template') {
        return { kind: 'template', token: valueToken };
      }

      // layout.density, layout.font_scale, personal.default_link_display (indent 2)
      if (indent === 2) {
        const parentKey = findParentKeyAt(editor, cursor.line, 0);
        if (parentKey === 'layout' && field === 'density') return { kind: 'layout.density', token: valueToken };
        if (parentKey === 'layout' && field === 'font_scale') return { kind: 'layout.font_scale', token: valueToken };
        if (parentKey === 'personal' && field === 'default_link_display') return { kind: 'personal.default_link_display', token: valueToken };
      }

      // sections list items: key/title/visible at indent 4 under sections: (indent 0)
      if (indent === 4) {
        const rootParent = findParentKeyAt(editor, cursor.line, 0);
        if (rootParent === 'sections' && field === 'visible') {
          return { kind: 'sections.visible', token: valueToken };
        }
        return null;
      }

      // personal.fields list items: visible/link_display at indent 6 under fields: (indent 2)
      if (indent === 6) {
        const midParent = findParentKeyAt(editor, cursor.line, 2);
        if (midParent === 'fields') {
          const itemKey = findCurrentListItemKey(editor, cursor.line, 4);
          if (field === 'visible') return { kind: 'personal.fields.visible', token: valueToken };
          if (field === 'link_display' && window.SETTINGS_HELPERS?.LINK_FIELDS?.has(itemKey)) {
            return { kind: 'personal.fields.link_display', token: valueToken };
          }
        }
        return null;
      }

      return null;
    } catch (_) {
      return null;
    }
  }

  function findCurrentListItemKey(editor, fromLine, keyIndent) {
    for (let i = fromLine; i >= 0; i--) {
      const text = editor.getLine(i);
      if (!text.trim()) continue;
      const lineIndent = (text.match(/^(\s*)/) || ['', ''])[1].length;
      if (lineIndent < keyIndent) break;
      const match = text.match(/^\s*-\s+key:\s*([\w-]+)/);
      if (match) return match[1];
    }
    return null;
  }

  function getSettingsValueSuggestions(kind) {
    const source = SETTINGS_VALUE_SUGGESTIONS[kind];
    return typeof source === 'function' ? source() : [];
  }

  function settingsYamlHint(editor) {
    if (!_isSettingsTab()) return null;

    const context = detectSettingsValueContext(editor);
    if (!context) return null;

    const typed = editor.getLine(editor.getCursor().line)
      .slice(context.token.from.ch, editor.getCursor().ch)
      .replace(/^["']/, '')
      .toLowerCase();

    const list = getSettingsValueSuggestions(context.kind)
      .filter((value) => value.toLowerCase().startsWith(typed))
      .map((value) => ({ text: value, displayText: value }));

    if (!list.length) return null;
    return { list, from: context.token.from, to: context.token.to };
  }

  // ---------------------------------------------------------------------------
  // CM5 hint function
  // ---------------------------------------------------------------------------

  function resumeYamlHint(editor) {
    if (!_isResumeTab()) return null;
    // --- Key completion ---
    const contextKey = detectContext(editor);
    if (contextKey) {
      const token    = getToken(editor);
      const cursor   = editor.getCursor();
      const siblings = getSiblingKeys(editor, contextKey, cursor.line);

      // Build template items (static, no schema dependency)
      const templateItems = [];
      if (contextKey === '__root__') {
        // Section names with templates: show once, insert full template (no [template] suffix)
        const scoredTemplates = [];
        Object.keys(SECTION_TEMPLATES).forEach(name => {
          const score = fuzzyScore(token.prefix, name);
          if (!siblings.has(name) && score > 0) {
            scoredTemplates.push({ name, score });
          }
        });
        scoredTemplates
          .sort((a, b) => b.score - a.score || a.name.length - b.name.length)
          .forEach(({ name }) => {
            templateItems.push({
              text: buildRootTemplate(name),
              displayText: name,
              render(el, _self, data) { el.textContent = data.displayText; },
            });
          });
      } else if (contextKey.endsWith('[]')) {
        const sectionName = contextKey.slice(0, -2);
        if (SECTION_TEMPLATES[sectionName] && !token.prefix) {
          const lineText   = editor.getLine(cursor.line);
          const lineIndent = (lineText.match(/^(\s*)/) || ['', ''])[1].length;
          const hasBullet  = /^\s*-\s*$/.test(lineText);
          const emptyAtTwo = /^\s*$/.test(lineText) && lineIndent === 2;
          const emptyAtFour = /^\s*$/.test(lineText) && lineIndent === 4;
          if (hasBullet || emptyAtTwo || emptyAtFour) {
            const tmplBase = buildItemTemplate(sectionName, 2);
            if (tmplBase) {
              if (emptyAtFour) {
                // Insert new sibling item: blank line + item at root list indent
                const insertText = '\n  - ' + tmplBase;
                templateItems.push({
                  displayText: '[+ new item]',
                  hint(cm) {
                    const ln = cm.getLine(cursor.line);
                    cm.replaceRange(insertText, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: ln.length });
                  },
                  render(el, _self, data) {
                    el.classList.add('yaml-hint-template');
                    el.textContent = data.displayText;
                  },
                });
              } else {
                const tmplText = buildItemTemplate(sectionName, lineIndent);
                templateItems.push({
                  text: emptyAtTwo ? '- ' + tmplText : tmplText,
                  displayText: '[+ new item]',
                  render(el, _self, data) {
                    el.classList.add('yaml-hint-template');
                    el.textContent = data.displayText;
                  },
                });
              }
            }
          }
        }
      }

      // Build schema-based key candidates
      const candidates = [];
      if (schema) {
        const contextDef = schema[contextKey];
        if (contextDef && Array.isArray(contextDef.keys)) {
          const required = new Set(contextDef.required  || []);
          const listKeys = new Set(contextDef.list_keys || []);

          const rawCandidates = contextDef.keys
            .filter((k) => !siblings.has(k))
            .filter((k) => !(contextKey === '__root__' && SECTION_TEMPLATES[k]))
            .map((k) => ({ key: k, score: fuzzyScore(token.prefix, k) }))
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score || a.key.length - b.key.length);

          rawCandidates.forEach(({ key }) => {
            candidates.push({
              text: listKeys.has(key) ? key + ":" : key + ": ",
              displayText: required.has(key) ? key + " *" : key,
              render(el, _self, data) { el.textContent = data.displayText; },
            });
          });
        }
      }

      const list = [...templateItems, ...candidates];
      if (list.length > 0) return { list, from: token.from, to: token.to };
    }

    // --- Value completion fallback ---
    const valueField = detectValueContext(editor);
    if (!valueField) return null;
    const suggestions = getValueSuggestions(valueField);
    if (!suggestions.length) return null;
    const valueToken = getValueToken(editor);
    if (!valueToken) return null;

    const typed = editor.getLine(editor.getCursor().line)
      .slice(valueToken.from.ch, editor.getCursor().ch)
      .replace(/^["']/, '');

    const list = suggestions
      .filter(s => s.replace(/^["']/, '').toLowerCase().startsWith(typed.toLowerCase()))
      .map(s => ({ text: s, displayText: s }));

    if (!list.length) return null;
    return { list, from: valueToken.from, to: valueToken.to };
  }

  function yamlHint(editor) {
    if (_isSettingsTab()) return settingsYamlHint(editor);
    return resumeYamlHint(editor);
  }

  // ---------------------------------------------------------------------------
  // Public init
  // ---------------------------------------------------------------------------

  window.yamlHint = yamlHint;
  window.initYamlAutocomplete = function initYamlAutocomplete(cmEditor) {
    fetchSchema();

    let hintTimer = null;
    cmEditor.on('change', (editor, change) => {
      if (change.origin === '+delete' || change.origin === 'paste' || change.origin === 'setValue' || change.origin === 'complete') return;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => {
        if (yamlHint(editor)) {
          editor.showHint({ hint: yamlHint, completeSingle: false });
        }
      }, 300);
    });
  };
})();
