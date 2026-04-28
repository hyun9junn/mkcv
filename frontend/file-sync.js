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
    try {
      localStorage.setItem(STORAGE_KEY, content);
    } catch {
      // QuotaExceededError: browser storage full, edit not persisted
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadFile();
    window.editorAdapter.onChange((val) => saveFile(val));
  });
})();
