# YAML Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add VS Code-style schema-aware YAML key completion to the CodeMirror 5 editor using CM5's `show-hint` addon with a custom hint function backed by a `/api/schema` endpoint.

**Architecture:** A new `frontend/yaml-autocomplete.js` fetches the CV schema once from `/api/schema` and registers a custom hint function with CM5 `show-hint`. Context is detected line-by-line (no full YAML parse) for robustness. Tab/Shift+Tab are wired globally; show-hint's internal keymap takes priority when the menu is open.

**Tech Stack:** CodeMirror 5 (show-hint addon), Python/FastAPI (schema endpoint), Pydantic (schema source), plain JS (no bundler).

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `frontend/lib/show-hint.js` | Vendored CM5 show-hint addon |
| Create | `frontend/lib/show-hint.css` | Vendored CM5 show-hint styles |
| Create | `frontend/yaml-autocomplete.js` | Schema fetch, context detection, fuzzy match, hint fn, key bindings |
| Create | `frontend/yaml-autocomplete.css` | Material-darker theme override for hint dropdown |
| Modify | `backend/main.py` | Add `GET /api/schema` endpoint |
| Modify | `frontend/editor-adapter.js` | Call `initYamlAutocomplete(this._editor)` after CM init |
| Modify | `frontend/index.html` | Add `<link>` / `<script>` tags for new files |
| Modify | `tests/test_api.py` | Add tests for `/api/schema` |

---

## Task 1: Write failing test for `/api/schema`

**Files:**
- Modify: `tests/test_api.py`

- [ ] **Step 1: Add tests at the end of `tests/test_api.py`**

```python
async def test_schema_returns_200(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/schema")
    assert resp.status_code == 200


async def test_schema_has_root_keys(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/schema")
    data = resp.json()
    assert "__root__" in data
    root = data["__root__"]
    assert "keys" in root
    assert "personal" in root["keys"]
    assert "experience" in root["keys"]
    assert "personal" in root["required"]


async def test_schema_has_personal_keys(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/schema")
    data = resp.json()
    assert "personal" in data
    personal = data["personal"]
    assert "email" in personal["keys"]
    assert "huggingface" in personal["keys"]
    assert "name" in personal["required"]
    assert "email" in personal["required"]


async def test_schema_has_experience_list_context(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/schema")
    data = resp.json()
    assert "experience[]" in data
    exp = data["experience[]"]
    assert "title" in exp["keys"]
    assert "company" in exp["keys"]
    assert "highlights" in exp["list_keys"]
    assert "title" in exp["required"]


async def test_schema_required_field_star_not_in_keys(app):
    """Required annotation is metadata only — all keys appear in 'keys' list."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/schema")
    data = resp.json()
    for context_key, ctx in data.items():
        for req_field in ctx.get("required", []):
            assert req_field in ctx["keys"], (
                f"Required field '{req_field}' in '{context_key}' must also be in 'keys'"
            )
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/khjmove/mkcv && python -m pytest tests/test_api.py::test_schema_returns_200 tests/test_api.py::test_schema_has_root_keys -v
```

Expected: `FAILED` — `404 Not Found` or connection error.

---

## Task 2: Implement `GET /api/schema` in backend

**Files:**
- Modify: `backend/main.py` (after line 118, before `@app.post("/api/validate")`)

- [ ] **Step 1: Add the schema builder function and endpoint to `backend/main.py`**

Insert after the `_template_exists` function (after line 122) and before `@app.post("/api/validate")` (line 125):

```python
import typing


def _build_cv_schema() -> dict:
    """Derive autocomplete schema from Pydantic models."""
    from pydantic_core import PydanticUndefinedType

    def _model_info(model_class) -> dict:
        keys = []
        required = []
        list_keys = []
        for field_name, field_info in model_class.model_fields.items():
            keys.append(field_name)
            # Required if no default (default is PydanticUndefined)
            if isinstance(field_info.default, PydanticUndefinedType):
                required.append(field_name)
            # list_keys: fields whose annotation is list[...]
            ann = field_info.annotation
            origin = typing.get_origin(ann)
            if origin is list:
                list_keys.append(field_name)
        return {"keys": keys, "required": required, "list_keys": list_keys}

    list_section_map = {
        "experience[]": ExperienceItem,
        "education[]": EducationItem,
        "skills[]": SkillGroup,
        "projects[]": ProjectItem,
        "certifications[]": CertificationItem,
        "publications[]": PublicationItem,
        "languages[]": LanguageItem,
        "awards[]": AwardItem,
        "extracurricular[]": ExtracurricularItem,
    }

    schema: dict = {}

    # Root level — CVData fields (no list_keys at root; lists are sections, not values)
    root_info = _model_info(CVData)
    schema["__root__"] = {
        "keys": root_info["keys"],
        "required": root_info["required"],
        "list_keys": [],  # root list keys are section headers, not block sequences
    }

    # personal block (scalar mapping, not a list section)
    schema["personal"] = _model_info(PersonalInfo)

    # Each list section
    for context_key, model_class in list_section_map.items():
        schema[context_key] = _model_info(model_class)

    return schema


@app.get("/api/schema")
async def get_schema():
    return _build_cv_schema()
```

> Note: `import typing` must be added at the top of the file if not already present. Check line 1–10 of `main.py` — `typing` imports (`Optional`, `List`) are already there via `from typing import Optional, List`, but `import typing` (the module itself) may not be. Add it after the existing `from typing import` line.

- [ ] **Step 2: Add `import typing` to `backend/main.py` top-of-file imports**

After line 7 (`from typing import Optional, List`), add:

```python
import typing
```

- [ ] **Step 3: Run the failing tests — they should now pass**

```bash
cd /Users/khjmove/mkcv && python -m pytest tests/test_api.py::test_schema_returns_200 tests/test_api.py::test_schema_has_root_keys tests/test_api.py::test_schema_has_personal_keys tests/test_api.py::test_schema_has_experience_list_context tests/test_api.py::test_schema_required_field_star_not_in_keys -v
```

Expected: all 5 tests `PASSED`.

- [ ] **Step 4: Run full test suite to check for regressions**

```bash
cd /Users/khjmove/mkcv && python -m pytest -v
```

Expected: all tests `PASSED`.

- [ ] **Step 5: Commit**

```bash
cd /Users/khjmove/mkcv && git add backend/main.py tests/test_api.py && git commit -m "feat: add GET /api/schema endpoint for YAML autocomplete"
```

---

## Task 3: Vendor show-hint addon files

**Files:**
- Create: `frontend/lib/show-hint.js`
- Create: `frontend/lib/show-hint.css`

- [ ] **Step 1: Create `frontend/lib/` directory and download show-hint files**

```bash
mkdir -p /Users/khjmove/mkcv/frontend/lib

curl -o /Users/khjmove/mkcv/frontend/lib/show-hint.js \
  "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/show-hint.min.js"

curl -o /Users/khjmove/mkcv/frontend/lib/show-hint.css \
  "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/show-hint.min.css"
```

- [ ] **Step 2: Verify files exist and are non-empty**

```bash
wc -c /Users/khjmove/mkcv/frontend/lib/show-hint.js /Users/khjmove/mkcv/frontend/lib/show-hint.css
```

Expected: both files show > 1000 bytes.

- [ ] **Step 3: Commit**

```bash
cd /Users/khjmove/mkcv && git add frontend/lib/ && git commit -m "chore: vendor CodeMirror 5 show-hint addon"
```

---

## Task 4: Create `frontend/yaml-autocomplete.js`

**Files:**
- Create: `frontend/yaml-autocomplete.js`

This file contains: schema fetch, context detection, sibling-key deduplication, fuzzy matching, and the CM5 hint function. Tab/Shift+Tab wiring is in Task 5.

- [ ] **Step 1: Create `frontend/yaml-autocomplete.js`**

```javascript
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
            if (!text.match(/^  /) || text.trim() === "") { inside = false; continue; }
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
      if (change.origin === "+delete" || change.origin === "paste") return;
      setTimeout(() => {
        if (detectContext(editor)) {
          editor.showHint({ hint: yamlHint, completeSingle: false });
        }
      }, 50);
    });
  };
})();
```

- [ ] **Step 2: Verify the file was created**

```bash
wc -l /Users/khjmove/mkcv/frontend/yaml-autocomplete.js
```

Expected: > 150 lines.

- [ ] **Step 3: Commit**

```bash
cd /Users/khjmove/mkcv && git add frontend/yaml-autocomplete.js && git commit -m "feat: add yaml-autocomplete.js with context detection and fuzzy hint function"
```

---

## Task 5: Wire Tab / Shift+Tab in `editor-adapter.js`

**Files:**
- Modify: `frontend/editor-adapter.js`

The Tab binding is set on the CM editor directly. When the show-hint menu is open, show-hint's internal keymap intercepts Tab/Enter first (it has higher priority than `extraKeys`). When the menu is closed, `tabOrComplete` runs.

- [ ] **Step 1: Replace `editor-adapter.js` entirely**

The new version adds `initYamlAutocomplete(this._editor)` at the end of the constructor and sets `extraKeys` for Tab/Shift+Tab:

```javascript
class CodeMirrorAdapter {
  constructor(container, initialValue = "") {
    this._editor = CodeMirror(container, {
      value: initialValue,
      mode: "yaml",
      theme: "material-darker",
      lineNumbers: true,
      lineWrapping: true,
      tabSize: 2,
      indentWithTabs: false,
      autofocus: true,
      extraKeys: {
        Tab: _tabOrComplete,
        "Shift-Tab": _shiftTab,
      },
    });

    if (typeof initYamlAutocomplete === "function") {
      initYamlAutocomplete(this._editor);
    }
  }

  getValue() {
    return this._editor.getValue();
  }

  setValue(str) {
    this._editor.setValue(str);
  }

  onChange(callback) {
    this._editor.on("change", () => callback(this.getValue()));
  }
}

// Tab: fast-accept if one candidate, open dropdown if many, else insert 2 spaces.
// When show-hint menu is open, show-hint's keymap intercepts Tab first — this
// function only runs when the menu is closed.
function _tabOrComplete(editor) {
  const hint = typeof yamlHint === "function" ? yamlHint(editor) : null;
  if (hint && hint.list.length === 1) {
    // Fast-accept: exactly one candidate
    const completion = hint.list[0];
    editor.replaceRange(completion.text, hint.from, hint.to);
    return;
  }
  if (hint && hint.list.length > 1) {
    editor.showHint({ hint: yamlHint, completeSingle: false });
    return;
  }
  // No completions available: YAML-safe indent (spaces only, never \t)
  editor.replaceSelection("  ");
}

// Shift+Tab: dismiss hint menu if open, else remove up to 2 leading spaces.
function _shiftTab(editor) {
  if (editor.state.completionActive) {
    editor.state.completionActive.close(); // show-hint internal API
    return;
  }
  const cursor = editor.getCursor();
  const lineText = editor.getLine(cursor.line);
  const spaces = (lineText.match(/^ */) || [""])[0].length;
  const remove = Math.min(spaces, 2);
  if (remove > 0) {
    editor.replaceRange(
      "",
      { line: cursor.line, ch: 0 },
      { line: cursor.line, ch: remove }
    );
  }
}

const INITIAL_YAML = `personal:
  name: Your Name
  email: you@example.com
  phone: "+1-000-000-0000"
  location: City, Country
  github: github.com/yourusername

summary: >
  Write a brief professional summary here.

experience:
  - title: Job Title
    company: Company Name
    start_date: "2020"
    end_date: null
    highlights:
      - Key achievement or responsibility

education:
  - degree: B.S. Your Major
    institution: University Name
    year: "2020"

skills:
  - category: Languages
    items: [Python, JavaScript]
`;

document.addEventListener("DOMContentLoaded", () => {
  const editor = new CodeMirrorAdapter(
    document.getElementById("editor-pane"),
    INITIAL_YAML
  );
  window.editorAdapter = editor;
  app.setState({ yaml: editor.getValue() });
  editor.onChange((val) => app.setState({ yaml: val }));
});
```

- [ ] **Step 2: Commit**

```bash
cd /Users/khjmove/mkcv && git add frontend/editor-adapter.js && git commit -m "feat: wire Tab/Shift+Tab autocomplete key bindings in editor-adapter"
```

---

## Task 6: Create dropdown CSS theme override

**Files:**
- Create: `frontend/yaml-autocomplete.css`

- [ ] **Step 1: Create `frontend/yaml-autocomplete.css`**

```css
/* Match material-darker editor theme */
.CodeMirror-hints {
  background: #212121;
  border: 1px solid #444;
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  font-family: monospace;
  font-size: 13px;
  max-height: 14em;
  overflow-y: auto;
  padding: 2px 0;
  z-index: 10;
}

.CodeMirror-hint {
  color: #cdd3de;
  cursor: pointer;
  padding: 2px 12px;
  white-space: pre;
}

.CodeMirror-hint-active {
  background: #2979ff22;
  color: #82aaff;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/khjmove/mkcv && git add frontend/yaml-autocomplete.css && git commit -m "feat: add material-darker hint dropdown theme"
```

---

## Task 7: Wire everything into `index.html`

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Add CSS links after line 9 (after `material-darker.min.css` link)**

Insert after the existing `<link rel="stylesheet" href="...material-darker.min.css" />` (line 9):

```html
  <link rel="stylesheet" href="lib/show-hint.css" />
  <link rel="stylesheet" href="yaml-autocomplete.css" />
```

- [ ] **Step 2: Add script tags before closing `</body>` — after `app.js` but before `editor-adapter.js`**

The scripts must load in this order: `show-hint.js` before `yaml-autocomplete.js`, and both before `editor-adapter.js` (which calls `initYamlAutocomplete`).

Replace the current script block (lines 294–302):

```html
  <script src="app.js"></script>
  <script src="lib/show-hint.js"></script>
  <script src="yaml-autocomplete.js"></script>
  <script src="editor-adapter.js"></script>
  <script src="file-sync.js"></script>
  <script src="sections-state.js"></script>
  <script src="sections-ui.js"></script>
  <script src="templates.js"></script>
  <script src="validator.js"></script>
  <script src="preview.js"></script>
  <script src="export.js"></script>
```

- [ ] **Step 3: Commit**

```bash
cd /Users/khjmove/mkcv && git add frontend/index.html && git commit -m "feat: load show-hint addon and yaml-autocomplete in index.html"
```

---

## Task 8: Run full test suite and manual smoke test

**Files:** none

- [ ] **Step 1: Run full backend test suite**

```bash
cd /Users/khjmove/mkcv && python -m pytest -v
```

Expected: all tests `PASSED`.

- [ ] **Step 2: Start the dev server**

```bash
cd /Users/khjmove/mkcv && uvicorn backend.main:app --reload
```

- [ ] **Step 3: Manual smoke tests — open `http://localhost:8000` and verify each scenario**

| Scenario | Expected |
|----------|----------|
| Open editor. Click at column 0 on an empty line. Type `ex` | Dropdown shows `experience` |
| Press Tab | `experience: ` inserted (with trailing space); cursor after space |
| Under `personal:`, type 2 spaces then `hu` | Dropdown shows `huggingface *` (required star, muted) |
| Press Tab on single match | `huggingface: ` fast-accepted, no dropdown opened |
| Under `personal:`, with `name:` already present, type 2 spaces | `name` not in dropdown (deduplication) |
| Under `experience:`, type `  - ` then `ti` | Dropdown shows `title *` |
| Press Tab | `title: ` inserted |
| Under same experience item, type `  ` | `title` absent from dropdown (already present in this item) |
| Type `  hi` in experience item | Dropdown shows `highlights` |
| Press Tab | `highlights:` inserted (no trailing space — list key) |
| At indent 4, type `comp` | `company *` suggested |
| Empty line, no schema context (e.g. inside a scalar value) | No dropdown |
| Press Tab with no dropdown | 2 spaces inserted |
| Press Shift+Tab with 2 leading spaces | 2 spaces removed |
| Press Shift+Tab with no leading spaces | Nothing happens |
| Check browser console | No JS errors |

- [ ] **Step 4: Verify `/api/schema` response directly**

```bash
curl -s http://localhost:8000/api/schema | python3 -m json.tool | head -40
```

Expected: well-formed JSON with `__root__`, `personal`, `experience[]`, etc.

- [ ] **Step 5: Final commit (if any fixups were made)**

```bash
cd /Users/khjmove/mkcv && git add -p && git commit -m "fix: post-smoke-test corrections to yaml autocomplete"
```

Only run this step if you found and fixed issues during smoke testing.
