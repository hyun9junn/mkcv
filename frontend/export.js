const exporter = (() => {
  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportFile(format) {
    const filename = { markdown: "cv.md", latex: "cv.tex", pdf: "cv.pdf" }[format];
    try {
      const resp = await fetch(`/api/export/${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml: sectionsState.getFilteredYaml(app.state.yaml), template: app.state.template }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        alert(`Export failed: ${err.message}`);
        return;
      }
      triggerDownload(await resp.blob(), filename);
    } catch {
      alert("Export failed: network error");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-md").addEventListener("click", () => exportFile("markdown"));
    document.getElementById("btn-tex").addEventListener("click", () => exportFile("latex"));
    document.getElementById("btn-pdf").addEventListener("click", () => exportFile("pdf"));
  });
})();
