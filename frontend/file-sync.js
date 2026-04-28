const fileSync = (() => {
  const STORAGE_KEY = "mkcv_yaml";

  function loadFile() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) {
      window.editorAdapter.setValue(saved);
      window.editorAdapter.clearHistory();
      app.setState({ yaml: saved });
    }
  }

  function saveFile(content) {
    localStorage.setItem(STORAGE_KEY, content);
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadFile();
    window.editorAdapter.onChange((val) => saveFile(val));
  });
})();
