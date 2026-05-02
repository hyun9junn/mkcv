# YAML Editor UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add smart Enter indentation, list bullet handling, schema-aware value completion, and section template insertion to the CodeMirror 5 YAML editor.

**Architecture:** All changes are confined to two existing frontend files. `editor-adapter.js` gains a new `_enterSmartIndent` key handler. `yaml-autocomplete.js` gains `detectValueContext`, `getValueToken`, value suggestion helpers, `SECTION_TEMPLATES`, `buildRootTemplate`, `buildItemTemplate`, and a restructured `yamlHint` that handles both key completion, value completion, and template insertion. `yaml-autocomplete.css` gains a style rule for template items.

**Tech Stack:** CodeMirror 5, vanilla JavaScript, no build tooling. Dev server: `uvicorn backend.main:app --reload` → `http://localhost:8000`.

---

## File Map

| File | Change |
|------|--------|
| `frontend/editor-adapter.js` | Add `Enter: _enterSmartIndent` to `extraKeys`; add `_enterSmartIndent` function |
| `frontend/yaml-autocomplete.js` | Add `VALUE_FIELDS`, `detectValueContext`, `getValueToken`, `generateDateSuggestions`, `getValueSuggestions`, `SECTION_TEMPLATES`, `buildRootTemplate`, `buildItemTemplate`; restructure `yamlHint`; update `change` listener |
| `frontend/yaml-autocomplete.css` | Add `.yaml-hint-template` style rule |

---

## Task 1: Smart Enter Key Handler

**Files:**
- Modify: `frontend/editor-adapter.js`

- [ ] **Step 1: Add `_enterSmartIndent` function**

Add this function directly above the `class CodeMirrorAdapter` line in `frontend/editor-adapter.js`:

```js
function _enterSmartIndent(editor) {
  const cursor = editor.getCursor();
  const line = editor.getLine(cursor.line);
  const lineIndent = (line.match(/^(\s*)/) || ['', ''])[1].length;

  // Case 1: Empty bullet — remove bullet marker and place cursor at parent indent
  if (/^\s*-\s*$/.test(line)) {
    const parentIndent = Math.max(0, lineIndent - 2);
    editor.replaceRange(
      ' '.repeat(parentIndent),
      { line: cursor.line, ch: 0 },
      { line: cursor.line, ch: line.length }
    );
    return;
  }

  // Case 2: Line ends with ':' — indent +2
  if (line.trimEnd().endsWith(':')) {
    editor.replaceRange('\n' + ' '.repeat(lineIndent + 2), cursor);
    return;
  }

  // Case 3: List item with key-value pattern (e.g. '  - title: Job Title') — field level
  if (/^\s*-\s+\w[\w_]*\s*:/.test(line)) {
    editor.replaceRange('\n' + ' '.repeat(lineIndent + 2), cursor);
    return;
  }

  // Case 4: List item with string content (e.g. '      - Key Achievement') — new bullet
  if (/^\s*-\s+\S/.test(line)) {
    editor.replaceRange('\n' + ' '.repeat(lineIndent) + '- ', cursor);
    return;
  }

  // Case 5: Default — preserve current indent
  editor.replaceRange('\n' + ' '.repeat(lineIndent), cursor);
}
```

- [ ] **Step 2: Wire `Enter` into `extraKeys`**

In `frontend/editor-adapter.js`, change:

```js
      extraKeys: {
        Tab: _tabOrComplete,
        "Shift-Tab": _shiftTab,
      },
```

to:

```js
      extraKeys: {
        Tab: _tabOrComplete,
        "Shift-Tab": _shiftTab,
        Enter: _enterSmartIndent,
      },
```

- [ ] **Step 3: Start dev server and verify in browser**

Run: `uvicorn backend.main:app --reload` from `/Users/khjmove/mkcv`, open `http://localhost:8000`.

Verify each case:

| Action | Expected |
|--------|----------|
| Cursor at end of `personal:`, press Enter | Next line at col 2 |
| Cursor at end of `  name: Hyungjun`, press Enter | Next line at col 2 |
| Cursor at end of `    highlights:`, press Enter | Next line at col 6 |
| Cursor at end of `  - title: Job Title`, press Enter | Next line at col 4 |
| Cursor at end of `      - Key Achievement`, press Enter | Next line `      - ` at col 6+2 prefix |
| Cursor on line `      - ` (empty bullet), press Enter | Bullet removed, cursor stays on line at col 4 |

- [ ] **Step 4: Commit**

```bash
git add frontend/editor-adapter.js
git commit -m "feat: add smart Enter key handler for YAML indentation"
```

---

## Task 2: Value Helpers

**Files:**
- Modify: `frontend/yaml-autocomplete.js`

- [ ] **Step 1: Add `VALUE_FIELDS` and `detectValueContext`**

Insert the following block immediately after the closing `}` of `findListItemSection` (line 94) and before the `// Token extraction` comment in `frontend/yaml-autocomplete.js`:

```js
  // ---------------------------------------------------------------------------
  // Value context detection
  // ---------------------------------------------------------------------------

  const VALUE_FIELDS = new Set(['start_date', 'end_date', 'date', 'proficiency']);

  // Returns the field name if cursor is in value position for a known value field, else null.
  // Handles empty value (key: |) and partially typed values (key: "Pre|).
  function detectValueContext(editor) {
    try {
      const cursor = editor.getCursor();
      const lineText = editor.getLine(cursor.line);
      const textBeforeCursor = lineText.slice(0, cursor.ch);
      // Matches: optional indent + key + ': ' + optional opening quote + partial word
      const m = textBeforeCursor.match(/^\s*(\w[\w_]*):\s*["']?([\w.-]*)$/);
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
      const keyColonMatch = textBeforeCursor.match(/^\s*\w[\w_]*:\s*/);
      if (!keyColonMatch) return null;
      return {
        from: { line: cursor.line, ch: keyColonMatch[0].length },
        to:   { line: cursor.line, ch: cursor.ch },
      };
    } catch (_) {
      return null;
    }
  }
```

- [ ] **Step 2: Add value suggestion helpers**

Add immediately after the block from Step 1:

```js
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
    if (field === 'date')       return [`"${year}"`, `"${year-1}"`, `"${year-2}"`, `"${year-3}"`];
    return [];
  }

  function getValueSuggestions(field) {
    if (field === 'proficiency') return ['"Native"', '"Fluent"', '"Intermediate"', '"Basic"'];
    return generateDateSuggestions(field);
  }
```

- [ ] **Step 3: Restructure `yamlHint` to add value fallback**

Replace the current `yamlHint` function (lines 207–238 in the original file) with:

```js
  function yamlHint(editor) {
    if (!schema) return null;

    // --- Key completion ---
    const contextKey = detectContext(editor);
    if (contextKey) {
      const contextDef = schema[contextKey];
      if (contextDef && Array.isArray(contextDef.keys)) {
        const token   = getToken(editor);
        const cursor  = editor.getCursor();
        const siblings = getSiblingKeys(editor, contextKey, cursor.line);
        const required = new Set(contextDef.required  || []);
        const listKeys = new Set(contextDef.list_keys || []);

        const candidates = contextDef.keys
          .filter((k) => !siblings.has(k))
          .map((k) => ({ key: k, score: fuzzyScore(token.prefix, k) }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score || a.key.length - b.key.length);

        const list = candidates.map(({ key }) => ({
          text: listKeys.has(key) ? key + ":" : key + ": ",
          displayText: required.has(key) ? key + " *" : key,
          render(el, _self, data) { el.textContent = data.displayText; },
        }));

        if (list.length > 0) return { list, from: token.from, to: token.to };
      }
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
```

- [ ] **Step 4: Update the `change` listener to trigger on value positions**

In `initYamlAutocomplete`, change:

```js
      setTimeout(() => {
        if (detectContext(editor)) {
          editor.showHint({ hint: yamlHint, completeSingle: false });
        }
      }, 50);
```

to:

```js
      setTimeout(() => {
        if (detectContext(editor) || detectValueContext(editor)) {
          editor.showHint({ hint: yamlHint, completeSingle: false });
        }
      }, 50);
```

- [ ] **Step 5: Verify in browser**

| Action | Expected |
|--------|----------|
| Cursor at end of `    end_date: ` | Dropdown shows `"Present"`, date strings |
| Cursor at end of `    start_date: ` | Dropdown shows recent `"YYYY.MM"` strings |
| Cursor at end of `    date: ` | Dropdown shows `"2026"`, prior years |
| Cursor at end of `    proficiency: ` | Dropdown shows `"Native"`, `"Fluent"`, etc. |
| Type `"Pre` after `end_date: ` | Dropdown filters to `"Present"` only |
| Accept `"Present"` while at `"Pre` | Result is `"Present"` (no doubled quotes) |
| Cursor after `    name: ` (not a value field) | No dropdown triggered |

- [ ] **Step 6: Commit**

```bash
git add frontend/yaml-autocomplete.js
git commit -m "feat: add value completion for date and proficiency fields"
```

---

## Task 3: Root-Level Template Insertion

**Files:**
- Modify: `frontend/yaml-autocomplete.js`
- Modify: `frontend/yaml-autocomplete.css`

- [ ] **Step 1: Add `SECTION_TEMPLATES` and `buildRootTemplate`**

Insert immediately after the `getValueSuggestions` function added in Task 2:

```js
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

  // Builds the full root-level section block text for insertion.
  // Example for 'experience':
  //   experience:\n  - title:\n    company:\n    ...\n    highlights:\n      - 
  function buildRootTemplate(name) {
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
```

- [ ] **Step 2: Extend `yamlHint` to prepend template items at root level**

Inside `yamlHint`, replace the key-completion block:

```js
        const list = candidates.map(({ key }) => ({
          text: listKeys.has(key) ? key + ":" : key + ": ",
          displayText: required.has(key) ? key + " *" : key,
          render(el, _self, data) { el.textContent = data.displayText; },
        }));

        if (list.length > 0) return { list, from: token.from, to: token.to };
```

with:

```js
        const templateItems = [];
        if (contextKey === '__root__') {
          Object.keys(SECTION_TEMPLATES).forEach(name => {
            if (!siblings.has(name) && fuzzyScore(token.prefix, name) > 0) {
              templateItems.push({
                text: buildRootTemplate(name),
                displayText: name + ' [template]',
                render(el, _self, data) {
                  el.classList.add('yaml-hint-template');
                  el.textContent = data.displayText;
                },
              });
            }
          });
        }

        const list = [
          ...templateItems,
          ...candidates.map(({ key }) => ({
            text: listKeys.has(key) ? key + ":" : key + ": ",
            displayText: required.has(key) ? key + " *" : key,
            render(el, _self, data) { el.textContent = data.displayText; },
          })),
        ];

        if (list.length > 0) return { list, from: token.from, to: token.to };
```

- [ ] **Step 3: Add template item styling to `yaml-autocomplete.css`**

Append to `frontend/yaml-autocomplete.css`:

```css
.yaml-hint-template {
  color: #82aaff;
  font-style: italic;
}
```

- [ ] **Step 4: Verify in browser**

| Action | Expected |
|--------|----------|
| Cursor at col 0 (root), open autocomplete | Each section has both `name:` and `name [template]` entries; template items appear at top in blue italic |
| Type `exp` at root | `experience [template]` and `experience:` both visible |
| Accept `experience [template]` on an empty line | Inserts full experience block: `experience:\n  - title:\n    company:\n    start_date:\n    end_date:\n    location:\n    highlights:\n      - ` |
| `experience` already in document, open autocomplete at root | `experience [template]` does NOT appear (already present); `experience:` also absent via existing dedup |

- [ ] **Step 5: Commit**

```bash
git add frontend/yaml-autocomplete.js frontend/yaml-autocomplete.css
git commit -m "feat: add root-level section template insertion"
```

---

## Task 4: List-Item Template Insertion

**Files:**
- Modify: `frontend/yaml-autocomplete.js`

- [ ] **Step 1: Add `buildItemTemplate`**

Add immediately after `buildRootTemplate` in `frontend/yaml-autocomplete.js`:

```js
  // Builds the item skeleton text inserted right after the existing '  - ' on the cursor line.
  // baseIndent: number of leading spaces before the '-' (e.g. 2 for '  - ').
  // Example for experience, baseIndent=2:
  //   title:\n    company:\n    start_date:\n    end_date:\n    location:\n    highlights:\n      - 
  function buildItemTemplate(sectionName, baseIndent) {
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
```

- [ ] **Step 2: Extend `yamlHint` to prepend `[+ new item]` at list-item level**

Inside `yamlHint`, extend the `templateItems` block added in Task 3. Change:

```js
        if (contextKey === '__root__') {
          Object.keys(SECTION_TEMPLATES).forEach(name => {
            if (!siblings.has(name) && fuzzyScore(token.prefix, name) > 0) {
              templateItems.push({
                text: buildRootTemplate(name),
                displayText: name + ' [template]',
                render(el, _self, data) {
                  el.classList.add('yaml-hint-template');
                  el.textContent = data.displayText;
                },
              });
            }
          });
        }
```

to:

```js
        if (contextKey === '__root__') {
          Object.keys(SECTION_TEMPLATES).forEach(name => {
            if (!siblings.has(name) && fuzzyScore(token.prefix, name) > 0) {
              templateItems.push({
                text: buildRootTemplate(name),
                displayText: name + ' [template]',
                render(el, _self, data) {
                  el.classList.add('yaml-hint-template');
                  el.textContent = data.displayText;
                },
              });
            }
          });
        } else if (contextKey.endsWith('[]')) {
          const sectionName = contextKey.slice(0, -2);
          if (SECTION_TEMPLATES[sectionName]) {
            const lineText  = editor.getLine(cursor.line);
            const isNewItem = /^\s*-\s/.test(lineText);
            if (isNewItem) {
              const baseIndent   = (lineText.match(/^(\s*)/) || ['', ''])[1].length;
              const templateText = buildItemTemplate(sectionName, baseIndent);
              if (templateText) {
                templateItems.push({
                  text: templateText,
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
```

- [ ] **Step 3: Verify in browser**

Set up a document with:
```yaml
experience:
  - title: Existing Job
    company: Existing Co
```

Place cursor at a new `  - ` line under `experience:` and open autocomplete.

| Action | Expected |
|--------|----------|
| Cursor at `  - ` under `experience:` | Dropdown shows `[+ new item]` at top (blue italic), then `title *`, `company *`, etc. |
| Accept `[+ new item]` | Inserts `title:\n    company:\n    start_date:\n    end_date:\n    location:\n    highlights:\n      - ` after the `- ` on the current line |
| Resulting YAML structure | `  - title:\n    company:\n    start_date:\n    end_date:\n    location:\n    highlights:\n      - ` (all continuation fields at col 4, bullet at col 6) |
| Cursor at `    company:` inside an existing item | `[+ new item]` does NOT appear (not on a `  - ` line) |
| Cursor at `  - ` under `projects:` | `[+ new item]` inserts `name:\n    description:\n    url:\n    highlights:\n      - ` |

- [ ] **Step 4: Commit**

```bash
git add frontend/yaml-autocomplete.js
git commit -m "feat: add list-item template insertion via autocomplete"
```
