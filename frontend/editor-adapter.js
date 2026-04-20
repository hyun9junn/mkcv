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
    });
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
