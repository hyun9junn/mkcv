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
  // CM5 hint function
  // ---------------------------------------------------------------------------

  function yamlHint(editor) {
    if (!schema) return null;
    const contextKey = detectContext(editor);
    if (!contextKey) return null;
    const contextDef = schema[contextKey];
    if (!contextDef || !Array.isArray(contextDef.keys)) return null;

    const token = getToken(editor);
    const siblings = getSiblingKeys(editor, contextKey, editor.getCursor().line);
    const required = new Set(contextDef.required || []);
    const listKeys = new Set(contextDef.list_keys || []);

    const candidates = contextDef.keys
      .filter((k) => !siblings.has(k))
      .map((k) => ({ key: k, score: fuzzyScore(token.prefix, k) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.key.length - b.key.length);

    if (candidates.length === 0) return null;

    const list = candidates.map(({ key }) => ({
      // text inserted on accept: "key: " for scalars, "key:" for list-value fields
      text: listKeys.has(key) ? key + ":" : key + ": ",
      // displayText shows "*" for required — visual only, never inserted
      displayText: required.has(key) ? key + " *" : key,
      render(el, _self, data) {
        el.textContent = data.displayText;
      },
    }));

    return { list, from: token.from, to: token.to };
  }

  // ---------------------------------------------------------------------------
  // Public init
  // ---------------------------------------------------------------------------

  window.yamlHint = yamlHint;          // exposed for Tab fast-accept
  window.initYamlAutocomplete = function initYamlAutocomplete(cmEditor) {
    fetchSchema();

    // Auto-trigger on every insertion keystroke when in key position
    cmEditor.on("change", (editor, change) => {
      if (!schema) return;
      if (change.origin === "+delete" || change.origin === "paste" || change.origin === "setValue") return;
      setTimeout(() => {
        if (detectContext(editor)) {
          editor.showHint({ hint: yamlHint, completeSingle: false });
        }
      }, 50);
    });
  };
})();
