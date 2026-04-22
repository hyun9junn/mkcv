const preview = (() => {
  const container = document.getElementById("preview-frame");
  const loading = document.getElementById("preview-loading");
  const errorEl = document.getElementById("preview-error");
  let timer = null;
  let activePdf = null;

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

  async function renderPdf(arrayBuffer) {
    const savedScroll = container.scrollTop;

    if (activePdf) { activePdf.destroy(); activePdf = null; }

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    activePdf = pdf;

    const dpr = window.devicePixelRatio || 1;
    const availWidth = Math.max(container.clientWidth - 32, 400);
    const scale = (availWidth / 612) * dpr;

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex;flex-direction:column;align-items:center;padding:16px;gap:16px;";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
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
    container.scrollTop = savedScroll;

    loading.style.display = "none";
    errorEl.style.display = "none";
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
      await renderPdf(await resp.arrayBuffer());
    } catch (e) {
      showError("Preview unavailable — " + (e.message || "network error"), []);
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
