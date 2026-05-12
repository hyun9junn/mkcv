export const LIST_SECTIONS = new Set([
  "experience", "education", "skills", "projects",
  "certifications", "publications", "languages", "awards", "extracurricular",
]);

const VALUE_FIELDS = new Set(['start_date', 'end_date', 'date', 'proficiency']);

export function findParentKeyAt(editor, fromLine, targetIndent) {
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

function _findListItemSection(editor, fromLine) {
  for (let i = fromLine - 1; i >= 0; i--) {
    const text = editor.getLine(i);
    if (!text.trim()) continue;
    const lineIndent = (text.match(/^(\s*)/) || ["", ""])[1].length;
    if (lineIndent === 2 && text.trimStart().startsWith("- ")) {
      return findParentKeyAt(editor, i, 0);
    }
    if (lineIndent < 2) break;
  }
  return null;
}

export function detectContext(editor) {
  try {
    const cursor = editor.getCursor();
    const lineText = editor.getLine(cursor.line);
    const indent = (lineText.match(/^(\s*)/) || ["", ""])[1].length;

    const textBeforeCursor = lineText.slice(0, cursor.ch);
    const leadingMatch = textBeforeCursor.match(/^(\s*(?:-\s+)?)/);
    const tokenStart = leadingMatch ? leadingMatch[0].length : 0;
    if (textBeforeCursor.slice(tokenStart).includes(":")) return null;

    if (indent === 0) return "__root__";

    if (indent === 2) {
      const parentKey = findParentKeyAt(editor, cursor.line, 0);
      if (!parentKey) return null;
      if (parentKey === "personal") return "personal";
      if (LIST_SECTIONS.has(parentKey)) return parentKey + "[]";
      return null;
    }

    if (indent >= 4) {
      if (lineText.trimStart().startsWith('- ') || /^\s*-\s*$/.test(lineText)) return null;
      const sectionKey = _findListItemSection(editor, cursor.line);
      if (sectionKey) return sectionKey + "[]";
      return null;
    }

    return null;
  } catch (_) {
    return null;
  }
}

export function detectValueContext(editor) {
  try {
    const cursor = editor.getCursor();
    const lineText = editor.getLine(cursor.line);
    const textBeforeCursor = lineText.slice(0, cursor.ch);
    const m = textBeforeCursor.match(/^\s*(?:-\s+)?(\w[\w_]*):\s*["']?([\w.-]*)$/);
    if (!m) return null;
    const field = m[1];
    return VALUE_FIELDS.has(field) ? field : null;
  } catch (_) {
    return null;
  }
}

export function getValueToken(editor) {
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
