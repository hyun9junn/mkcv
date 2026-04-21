const preview = (() => {
  const frame = document.getElementById("preview-frame");
  const loading = document.getElementById("preview-loading");
  const errorEl = document.getElementById("preview-error");
  let timer = null;
  let currentBlobUrl = null;

  function showLoading() {
    loading.style.display = "flex";
    errorEl.style.display = "none";
  }

  function showError(message, details) {
    loading.style.display = "none";
    errorEl.style.display = "block";
    const detailHtml = details && details.length
      ? "<pre>" + details.map(d => d.replace(/&/g,"&amp;").replace(/</g,"&lt;")).join("\n") + "</pre>"
      : "";
    const safeMsg = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    errorEl.innerHTML = `<strong>Preview error:</strong> ${safeMsg}${detailHtml}`;
  }

  function showFrame(url) {
    loading.style.display = "none";
    errorEl.style.display = "none";
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = url;
    frame.src = url;
  }

  async function refresh(yaml, template) {
    showLoading();
    try {
      const section_order = sectionsState.getVisibleOrder(app.state.yaml);
      const resp = await fetch("/api/preview/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml, template, section_order, density: app.state.density, font_scale: app.state.font_scale }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        showError(err.message, err.details);
        return;
      }
      const blob = await resp.blob();
      showFrame(URL.createObjectURL(blob));
    } catch {
      showError("Preview unavailable — network error", []);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    window.editorAdapter.onChange(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (app.state.yaml.trim()) {
          refresh(sectionsState.getOrderedFilteredYaml(app.state.yaml), app.state.template);
        }
      }, 1500);
    });
    setTimeout(() => {
      if (app.state.yaml.trim()) {
        refresh(sectionsState.getOrderedFilteredYaml(app.state.yaml), app.state.template);
      }
    }, 200);
  });

  return { refresh };
})();

window.preview = preview;
