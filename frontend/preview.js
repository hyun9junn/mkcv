const preview = (() => {
  const container = document.getElementById("preview-frame");
  const loading = document.getElementById("preview-loading");
  const errorEl = document.getElementById("preview-error");
  const DEFAULT_PREVIEW_DEBOUNCE_MS = 900;
  const GIF_CAPTURE_PREVIEW_DEBOUNCE_MS = 200;
  function getPreviewDebounceMs() {
    try {
      const params = new URLSearchParams(window.location?.search || "");
      if (params.get("capture") === "gif") return GIF_CAPTURE_PREVIEW_DEBOUNCE_MS;
    } catch (_) {
      // Fall through to the default debounce when URL parsing is unavailable.
    }
    return DEFAULT_PREVIEW_DEBOUNCE_MS;
  }
  const PREVIEW_DEBOUNCE_MS = getPreviewDebounceMs();
  let timer = null;
  let activePdf = null;
  let zoomLevel = 1.0;
  let _abortController = null;
  let inFlight = false;
  let pendingRequestBody = null;
  let pendingRequestSignature = null;
  let activeRequestSignature = null;
  let lastAppliedRequestSignature = null;
  let previewRequestSeq = 0;
  const previewSessionId = createPreviewSessionId();

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  function showLoading() {
    loading.style.display = "flex";
    errorEl.style.display = "none";
  }

  function clearError() {
    errorEl.style.display = "none";
    errorEl.innerHTML = "";
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

  function createPreviewSessionId() {
    return `preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async function renderPages(pdf, shouldSkipApply) {
    if (!pdf) return false;
    const savedScrollTop  = container.scrollTop;
    const savedScrollLeft = container.scrollLeft;

    const dpr = window.devicePixelRatio || 1;
    const basePxWidth = Math.max(container.clientWidth - 32, 400);
    const scale = (basePxWidth / 612) * dpr * zoomLevel;

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex;flex-direction:column;align-items:center;padding:16px;gap:16px;min-width:fit-content;";

    for (let i = 1; i <= pdf.numPages; i++) {
      if (shouldSkipApply && shouldSkipApply()) {
        if (pdf.destroy) pdf.destroy();
        return false;
      }
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.cssText = `width:${viewport.width / dpr}px;height:${viewport.height / dpr}px;display:block;box-shadow:0 2px 8px rgba(0,0,0,0.5);`;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      if (shouldSkipApply && shouldSkipApply()) {
        if (pdf.destroy) pdf.destroy();
        return false;
      }
      wrapper.appendChild(canvas);
    }

    if (shouldSkipApply && shouldSkipApply()) {
      if (pdf.destroy) pdf.destroy();
      return false;
    }
    if (activePdf && activePdf !== pdf) { activePdf.destroy(); }
    activePdf = pdf;
    container.innerHTML = "";
    container.appendChild(wrapper);
    container.scrollTop = savedScrollTop;
    container.scrollLeft = savedScrollLeft;

    loading.style.display = "none";
    errorEl.style.display = "none";
    updateZoomDisplay();
    return true;
  }

  async function renderPdf(arrayBuffer, shouldSkipApply) {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    if (shouldSkipApply && shouldSkipApply()) {
      if (pdf.destroy) pdf.destroy();
      return false;
    }
    return renderPages(pdf, shouldSkipApply);
  }

  function setZoom(level) {
    zoomLevel = Math.max(0.25, Math.min(4.0, level));
    renderPages(activePdf);
  }

  function zoomIn()    { setZoom(zoomLevel * 1.1); }
  function zoomOut()   { setZoom(zoomLevel / 1.1); }
  function resetZoom() { setZoom(1.0); }

  function buildRequestBody(payload) {
    const settings = window.settingsSync ? settingsSync.getSettings() : null;
    return {
      yaml: payload.yaml,
      template: payload.template,
      section_order: Array.isArray(payload.section_order) ? payload.section_order.slice() : [],
      section_titles: settings
        ? Object.fromEntries(settings.sections.map(s => [s.key, s.title]))
        : {},
      density: app.state.density,
      font_scale: app.state.font_scale,
      link_display: app.state.link_display,
      personal_fields: Array.isArray(app.state.personal_fields)
        ? app.state.personal_fields.map((field) => ({ ...field }))
        : [],
    };
  }

  function getRequestSignature(requestBody) {
    return JSON.stringify(requestBody);
  }

  async function sendPreview(requestBody, requestSignature) {
    _abortController = new AbortController();
    const { signal } = _abortController;
    const requestSeq = ++previewRequestSeq;
    activeRequestSignature = requestSignature;
    let applied = false;

    inFlight = true;
    showLoading();
    try {
      const resp = await fetch("/api/preview/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...requestBody,
          preview_session_id: previewSessionId,
          preview_request_seq: requestSeq,
        }),
        signal,
      });
      if (signal.aborted) return;
      if (!resp.ok) {
        const err = await resp.json();
        if (err && err.error === "stale_preview") return;
        showError(err.message, err.details);
        return;
      }
      const arrayBuffer = await resp.arrayBuffer();
      if (pendingRequestBody) return;
      applied = await renderPdf(arrayBuffer, () => pendingRequestBody !== null);
    } catch (e) {
      if (e.name === 'AbortError') return;
      showError("Preview unavailable — " + (e.message || "network error"), []);
    } finally {
      inFlight = false;
      _abortController = null;
      if (applied) lastAppliedRequestSignature = requestSignature;
      activeRequestSignature = null;
      if (pendingRequestBody) {
        const nextRequestBody = pendingRequestBody;
        const nextRequestSignature = pendingRequestSignature;
        pendingRequestBody = null;
        pendingRequestSignature = null;
        sendPreview(nextRequestBody, nextRequestSignature);
      }
    }
  }

  function refresh(yaml, template) {
    const requestBody = buildRequestBody({
      yaml,
      template,
      section_order: sectionsState.getVisibleOrder(app.state.yaml),
    });
    const requestSignature = getRequestSignature(requestBody);

    if (inFlight) {
      if (requestSignature === pendingRequestSignature) return;
      if (requestSignature === activeRequestSignature) {
        pendingRequestBody = null;
        pendingRequestSignature = null;
        return;
      }
      pendingRequestBody = requestBody;
      pendingRequestSignature = requestSignature;
      return;
    }

    if (requestSignature === lastAppliedRequestSignature) {
      loading.style.display = "none";
      clearError();
      return;
    }

    pendingRequestBody = null;
    pendingRequestSignature = null;
    sendPreview(requestBody, requestSignature);
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
      if (window.settingsSync && window.settingsSync.activeTab === 'settings') return;
      if (window.editorAdapter.consumeSuppressedPreviewRefresh()) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (app.state.yaml.trim()) {
          refresh(sectionsState.getOrderedFilteredYaml(app.state.yaml), app.state.template);
        }
      }, PREVIEW_DEBOUNCE_MS);
    });
    setTimeout(() => {
      if (app.state.yaml.trim()) {
        refresh(sectionsState.getOrderedFilteredYaml(app.state.yaml), app.state.template);
      }
    }, 200);
  });

  function refit() { renderPages(activePdf); }

  return { refresh, zoomIn, zoomOut, resetZoom, setZoom, refit };
})();

window.preview = preview;
