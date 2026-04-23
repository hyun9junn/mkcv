const exporter = (() => {
  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function defaultFilename(format) {
    const ext = { markdown: "md", latex: "tex", pdf: "pdf" }[format];
    try {
      const parsed = jsyaml.load(app.state.yaml);
      const name = parsed?.personal?.name;
      if (name && typeof name === "string" && name.trim()) {
        const slug = name.trim().toLowerCase().replace(/\s+/g, "_");
        return `${slug}_cv.${ext}`;
      }
    } catch {}
    return `cv.${ext}`;
  }

  let pendingFormat = null;

  function openFilenameModal(format) {
    pendingFormat = format;
    const input = document.getElementById("filename-input");
    input.value = defaultFilename(format);
    document.getElementById("filename-modal").classList.add("open");
    input.focus();
    input.select();
  }

  function closeFilenameModal() {
    document.getElementById("filename-modal").classList.remove("open");
    pendingFormat = null;
  }

  async function exportFile(format, filename) {
    const ext = { markdown: "md", latex: "tex", pdf: "pdf" }[format];
    const trimmed = filename.trim();
    const finalName = trimmed
      ? (trimmed.includes(".") ? trimmed : `${trimmed}.${ext}`)
      : `cv.${ext}`;

    const body = {
      yaml: sectionsState.getOrderedFilteredYaml(app.state.yaml),
      template: app.state.template,
      section_order: sectionsState.getVisibleOrder(app.state.yaml),
    };
    if (format !== "markdown") {
      body.density = app.state.density;
      body.font_scale = app.state.font_scale;
    }
    try {
      const resp = await fetch(`/api/export/${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const err = await resp.json();
        alert(`Export failed: ${err.message}`);
        return;
      }
      triggerDownload(await resp.blob(), finalName);
    } catch {
      alert("Export failed: network error");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-md").addEventListener("click", () => openFilenameModal("markdown"));
    document.getElementById("btn-tex").addEventListener("click", () => openFilenameModal("latex"));
    document.getElementById("btn-pdf").addEventListener("click", () => openFilenameModal("pdf"));

    document.getElementById("filename-modal-cancel").addEventListener("click", closeFilenameModal);

    document.getElementById("filename-modal-confirm").addEventListener("click", () => {
      const input = document.getElementById("filename-input");
      if (!input.value.trim()) return;
      const fmt = pendingFormat;
      closeFilenameModal();
      exportFile(fmt, input.value);
    });

    document.getElementById("filename-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const input = e.currentTarget;
        if (!input.value.trim()) return;
        const fmt = pendingFormat;
        closeFilenameModal();
        exportFile(fmt, input.value);
      } else if (e.key === "Escape") {
        closeFilenameModal();
      }
    });

    document.getElementById("filename-modal").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeFilenameModal();
    });
  });
})();
