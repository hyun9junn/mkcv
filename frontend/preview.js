const preview = (() => {
  const container = document.getElementById("preview-frame");
  const loading = document.getElementById("preview-loading");
  const errorEl = document.getElementById("preview-error");
  let timer = null;
  let activePdf = null;
  let zoomLevel = 1.0;

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

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

  function updateZoomDisplay() {
    const el = document.getElementById("preview-zoom-label");
    if (el) el.textContent = Math.round(zoomLevel * 100) + "%";
  }

  async function renderPages() {
    if (!activePdf) return;
    const savedScrollTop  = container.scrollTop;
    const savedScrollLeft = container.scrollLeft;

    const dpr = window.devicePixelRatio || 1;
    const basePxWidth = Math.max(container.clientWidth - 32, 400);
    const scale = (basePxWidth / 612) * dpr * zoomLevel;

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex;flex-direction:column;align-items:center;padding:16px;gap:16px;min-width:fit-content;";

    for (let i = 1; i <= activePdf.numPages; i++) {
      const page = await activePdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.cssText = `width:${viewport.width / dpr}px;height:${viewport.height / dpr}px;display:block;box-shadow:0 2px 8px rgba(0,0,0,0.5);`;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      wrapper.appendChild(canvas);
    }

    container.innerHTML = "";
    container.appendChild(wrapper);
    container.scrollTop = savedScrollTop;
    container.scrollLeft = savedScrollLeft;

    loading.style.display = "none";
    errorEl.style.display = "none";
    updateZoomDisplay();
  }

  async function renderPdf(arrayBuffer) {
    if (activePdf) { activePdf.destroy(); activePdf = null; }
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    activePdf = pdf;
    await renderPages();
  }

  function setZoom(level) {
    zoomLevel = Math.max(0.25, Math.min(4.0, level));
    renderPages();
  }

  function zoomIn()    { setZoom(zoomLevel * 1.1); }
  function zoomOut()   { setZoom(zoomLevel / 1.1); }
  function resetZoom() { setZoom(1.0); }

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
      await renderPdf(await resp.arrayBuffer());
    } catch (e) {
      showError("Preview unavailable — " + (e.message || "network error"), []);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    container.addEventListener("wheel", (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
      }
    }, { passive: false });

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

  function refit() { renderPages(); }

  return { refresh, zoomIn, zoomOut, resetZoom, setZoom, refit };
})();

window.preview = preview;
