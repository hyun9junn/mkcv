class CodeMirrorAdapter {
  constructor(container, initialValue = "") {
    this._zoomLevel = 1.0;
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

  clearHistory() {
    this._editor.clearHistory();
  }

  onChange(callback) {
    this._editor.on("change", () => callback(this.getValue()));
  }

  onCursorActivity(callback) {
    this._editor.on("cursorActivity", () => callback(this._editor.getCursor()));
  }

  getCursor() {
    return this._editor.getCursor();
  }

  _applyZoom() {
    const size = 12.5 * this._zoomLevel;
    document.documentElement.style.setProperty('--editor-font-size', size + 'px');
    this._editor.refresh();
    const el = document.getElementById('editor-zoom-label');
    if (el) el.textContent = Math.round(this._zoomLevel * 100) + '%';
  }

  zoomIn()    { this._zoomLevel = Math.min(3.0, this._zoomLevel * 1.1); this._applyZoom(); }
  zoomOut()   { this._zoomLevel = Math.max(0.5, this._zoomLevel / 1.1); this._applyZoom(); }
  resetZoom() { this._zoomLevel = 1.0; this._applyZoom(); }
  getZoomLevel() { return this._zoomLevel; }
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
