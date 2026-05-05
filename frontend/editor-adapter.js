class CodeMirrorAdapter {
  constructor(container, initialValue = "") {
    this._zoomLevel = 1.0;
    this._suppressChange = false;
    this._suppressNextPreviewRefresh = false;
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
        Enter: _enterSmartIndent,
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

  setValueSilently(str) {
    this._suppressChange = true;
    try {
      this._editor.setValue(str);
    } finally {
      this._suppressChange = false;
    }
  }

  setValuePreserveScroll(str) {
    const scroll = this._editor.getScrollInfo();
    this._editor.setValue(str);
    this._editor.scrollTo(scroll.left, scroll.top);
  }

  getScrollInfo() {
    return this._editor.getScrollInfo();
  }

  scrollTo(left, top) {
    this._editor.scrollTo(left, top);
  }

  suppressNextPreviewRefresh() {
    this._suppressNextPreviewRefresh = true;
  }

  consumeSuppressedPreviewRefresh() {
    const suppressed = this._suppressNextPreviewRefresh;
    this._suppressNextPreviewRefresh = false;
    return suppressed;
  }

  closeHint() {
    if (typeof this._editor.closeHint === 'function') {
      this._editor.closeHint();
    }
  }

  clearHistory() {
    this._editor.clearHistory();
  }

  onChange(callback) {
    this._editor.on("change", () => {
      if (this._suppressChange) return;
      callback(this.getValue());
    });
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

// Fields whose value is always a list — Enter after these inserts a bullet.
const YAML_LIST_FIELDS = new Set(['highlights', 'items']);

// Enter: smart indent for YAML — handles empty bullets, colon-terminated lines,
// key-value list items, string-value bullets, and default indent preservation.
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

  // Case 2: Line ends with ':' — indent +2, with bullet if it's a list field
  if (line.trimEnd().endsWith(':')) {
    const fieldMatch = line.trim().match(/^(\w[\w_]*):\s*$/);
    const bullet = fieldMatch && YAML_LIST_FIELDS.has(fieldMatch[1]) ? '- ' : '';
    editor.replaceRange('\n' + ' '.repeat(lineIndent + 2) + bullet, { line: cursor.line, ch: line.length });
    return;
  }

  // Case 3: List item with key-value pattern (e.g. '  - title: Job Title') — field level
  if (/^\s*-\s+\w[\w_]*\s*:/.test(line)) {
    editor.replaceRange('\n' + ' '.repeat(lineIndent + 2), { line: cursor.line, ch: line.length });
    return;
  }

  // Case 4: List item with string content (e.g. '      - Key Achievement') — new bullet
  if (/^\s*-\s+\S/.test(line)) {
    editor.replaceRange('\n' + ' '.repeat(lineIndent) + '- ', { line: cursor.line, ch: line.length });
    return;
  }

  // Case 5: Default — preserve current indent
  editor.replaceRange('\n' + ' '.repeat(lineIndent), { line: cursor.line, ch: line.length });
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
  name: Gildong Hong
  email: gildong.park@example.com
  phone: "+82-10-1234-5678"
  location: Seoul, South Korea
  website: gildong.dev
  linkedin: linkedin.com/in/gildonghong
  github: github.com/gildonghong

summary: >
  Product-minded software engineer with 6+ years of experience building
  internal platforms, developer tooling, and customer-facing web products.
  Enjoys turning ambiguous requirements into reliable systems with strong UX,
  clean APIs, and observability baked in.

experience:
  - title: Senior Software Engineer
    company: Orbit Labs
    start_date: "2022-03"
    end_date: null
    location: Seoul
    highlights:
      - Led development of a workflow automation platform used by 40+ operations teammates across three regions.
      - Reduced API p95 latency by 38% by profiling slow database queries, introducing async job offloading, and tightening cache invalidation rules.
      - Partnered with design and support to ship self-serve admin tools that cut manual ticket volume by roughly 25%.
  - title: Software Engineer
    company: Novera Cloud
    start_date: "2019-01"
    end_date: "2022-02"
    location: Seoul
    highlights:
      - Built React and FastAPI features for a B2B analytics product serving finance and retail customers.
      - Introduced CI checks and reusable component patterns that reduced regressions during weekly releases.
      - Migrated reporting jobs from ad-hoc scripts to scheduled workers with retry and alerting support.

education:
  - degree: B.S. in Computer Science
    institution: Korea University
    year: "2018"

skills:
  - category: Languages
    items: [Python, TypeScript, SQL, Go]
  - category: Frameworks
    items: [FastAPI, React, Node.js, PostgreSQL]
  - category: Tools
    items: [Docker, Redis, AWS, GitHub Actions]

projects:
  - name: Incident Review Assistant
    description: Internal tool for summarizing incidents and tracking follow-up actions.
    highlights:
      - Combined Slack exports, ticket metadata, and runbook links into a single searchable timeline for engineering teams.
      - Helped shorten postmortem prep time and kept cross-functional action items visible after production incidents.
`;

document.addEventListener("DOMContentLoaded", () => {
  const editor = new CodeMirrorAdapter(
    document.getElementById("editor-pane"),
    INITIAL_YAML
  );
  window.editorAdapter = editor;
  app.setState({ yaml: editor.getValue() });
  editor.onChange((val) => {
    if (!window.settingsSync || window.settingsSync.activeTab === 'resume') {
      app.setState({ yaml: val });
    }
  });
});
