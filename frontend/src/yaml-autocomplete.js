// Schema-aware YAML key completion for CodeMirror 5.

import { sectionsState } from './sections-state.js';
import { SETTINGS_HELPERS } from './settings-engine.js';
import { detectContext, detectValueContext, getValueToken, findParentKeyAt as _findParentKeyAt, LIST_SECTIONS } from './yaml/context.js';
import { getValueSuggestions } from './yaml/value-suggestions.js';
import { SECTION_TEMPLATES } from './yaml/section-templates.js';

let _schema = null; // null = silently disabled

async function _fetchSchema() {
  try {
    const resp = await fetch("/api/schema");
    if (!resp.ok) return;
    const data = await resp.json();
    if (data && typeof data === "object") _schema = data;
  } catch (_) {
    // Network or parse failure — stay disabled
  }
}


// Returns the SECTION_DEFS yaml string for name, trimmed, or null if unavailable.
function _sectionDefYaml(name) {
  return (sectionsState &&
          sectionsState.SECTION_DEFS &&
          sectionsState.SECTION_DEFS[name] &&
          sectionsState.SECTION_DEFS[name].yaml)
    ? sectionsState.SECTION_DEFS[name].yaml.trim()
    : null;
}

// Returns the full root-level section block for insertion, using SECTION_DEFS example values.
function _buildRootTemplate(name) {
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
function _buildItemTemplate(sectionName, baseIndent) {
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
function _getToken(editor) {
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

function _getSiblingKeys(editor, contextKey, cursorLine) {
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
function _fuzzyScore(pattern, candidate) {
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
  template: () => (SETTINGS_HELPERS?.VALID_TPL ?? []),
  'layout.density': () => (SETTINGS_HELPERS?.VALID_DENSITY ?? []),
  'layout.font_scale': () => (SETTINGS_HELPERS?.VALID_FONT ?? []),
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

function _detectSettingsValueContext(editor) {
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
      const parentKey = _findParentKeyAt(editor, cursor.line, 0);
      if (parentKey === 'layout' && field === 'density') return { kind: 'layout.density', token: valueToken };
      if (parentKey === 'layout' && field === 'font_scale') return { kind: 'layout.font_scale', token: valueToken };
      if (parentKey === 'personal' && field === 'default_link_display') return { kind: 'personal.default_link_display', token: valueToken };
    }

    // sections list items: key/title/visible at indent 4 under sections: (indent 0)
    if (indent === 4) {
      const rootParent = _findParentKeyAt(editor, cursor.line, 0);
      if (rootParent === 'sections' && field === 'visible') {
        return { kind: 'sections.visible', token: valueToken };
      }
      return null;
    }

    // personal.fields list items: visible/link_display at indent 6 under fields: (indent 2)
    if (indent === 6) {
      const midParent = _findParentKeyAt(editor, cursor.line, 2);
      if (midParent === 'fields') {
        const itemKey = _findCurrentListItemKey(editor, cursor.line, 4);
        if (field === 'visible') return { kind: 'personal.fields.visible', token: valueToken };
        if (field === 'link_display' && SETTINGS_HELPERS?.LINK_FIELDS?.has(itemKey)) {
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

function _findCurrentListItemKey(editor, fromLine, keyIndent) {
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

function _getSettingsValueSuggestions(kind) {
  const source = SETTINGS_VALUE_SUGGESTIONS[kind];
  return typeof source === 'function' ? source() : [];
}

function _settingsYamlHint(editor) {
  if (!_isSettingsTab()) return null;

  const context = _detectSettingsValueContext(editor);
  if (!context) return null;

  const typed = editor.getLine(editor.getCursor().line)
    .slice(context.token.from.ch, editor.getCursor().ch)
    .replace(/^["']/, '')
    .toLowerCase();

  const list = _getSettingsValueSuggestions(context.kind)
    .filter((value) => value.toLowerCase().startsWith(typed))
    .map((value) => ({ text: value, displayText: value }));

  if (!list.length) return null;
  return { list, from: context.token.from, to: context.token.to };
}

// ---------------------------------------------------------------------------
// CM5 hint function
// ---------------------------------------------------------------------------

function _resumeYamlHint(editor) {
  if (!_isResumeTab()) return null;
  // --- Key completion ---
  const contextKey = detectContext(editor);
  if (contextKey) {
    const token    = _getToken(editor);
    const cursor   = editor.getCursor();
    const siblings = _getSiblingKeys(editor, contextKey, cursor.line);

    // Build template items (static, no schema dependency)
    const templateItems = [];
    if (contextKey === '__root__') {
      // Section names with templates: show once, insert full template (no [template] suffix)
      const scoredTemplates = [];
      Object.keys(SECTION_TEMPLATES).forEach(name => {
        const score = _fuzzyScore(token.prefix, name);
        if (!siblings.has(name) && score > 0) {
          scoredTemplates.push({ name, score });
        }
      });
      scoredTemplates
        .sort((a, b) => b.score - a.score || a.name.length - b.name.length)
        .forEach(({ name }) => {
          templateItems.push({
            text: _buildRootTemplate(name),
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
          const tmplBase = _buildItemTemplate(sectionName, 2);
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
              const tmplText = _buildItemTemplate(sectionName, lineIndent);
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
    if (_schema) {
      const contextDef = _schema[contextKey];
      if (contextDef && Array.isArray(contextDef.keys)) {
        const required = new Set(contextDef.required  || []);
        const listKeys = new Set(contextDef.list_keys || []);

        const rawCandidates = contextDef.keys
          .filter((k) => !siblings.has(k))
          .filter((k) => !(contextKey === '__root__' && SECTION_TEMPLATES[k]))
          .map((k) => ({ key: k, score: _fuzzyScore(token.prefix, k) }))
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

export function yamlHint(editor) {
  if (_isSettingsTab()) return _settingsYamlHint(editor);
  return _resumeYamlHint(editor);
}

// ---------------------------------------------------------------------------
// Public init
// ---------------------------------------------------------------------------

export function initYamlAutocomplete(cmEditor) {
  _fetchSchema();

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
}
