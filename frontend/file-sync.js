const fileSync = (() => {
  const banner = document.getElementById("error-banner");
  let saveTimer = null;

  async function loadFile() {
    try {
      const resp = await fetch("/api/file");
      if (!resp.ok) return;
      const { content } = await resp.json();
      if (content && content.trim()) {
        window.editorAdapter.setValue(content);
        app.setState({ yaml: content });
      }
    } catch {
      // fall back to INITIAL_YAML silently
    }
  }

  async function saveFile(content) {
    try {
      const resp = await fetch("/api/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        banner.style.display = "block";
        banner.textContent = `[File save failed] ${err.message}`;
      } else {
        if (banner.textContent.startsWith("[File save failed]")) {
          banner.style.display = "none";
          banner.textContent = "";
        }
      }
    } catch {
      banner.style.display = "block";
      banner.textContent = "[File save failed] Network error";
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await loadFile();
    window.editorAdapter.onChange((val) => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveFile(val), 1000);
    });
  });
})();
