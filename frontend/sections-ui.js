const sectionsUI = (() => {
  const panel = document.getElementById("sections-panel");
  const header = document.getElementById("sections-header");
  let isPanelOpen = false;
  let dragSrcKey = null;

  function togglePanel() {
    isPanelOpen = !isPanelOpen;
    panel.style.display = isPanelOpen ? "flex" : "none";
    header.querySelector("span").textContent = isPanelOpen
      ? "Sections ▴"
      : "Sections ▾";
  }

  function getPresentKeys(yaml) {
    try {
      const parsed = jsyaml.load(yaml);
      if (!parsed || typeof parsed !== "object") return [];
      return Object.keys(parsed).filter((k) => k !== "personal");
    } catch {
      return [];
    }
  }

  function buildPanel() {
    const presentKeys = getPresentKeys(app.state.yaml);

    // Any key present in YAML but missing from localStorage order gets appended.
    for (const key of presentKeys) {
      sectionsState.ensureInOrder(key);
    }

    const order = sectionsState.getOrder();
    const presentSet = new Set(presentKeys);

    panel.innerHTML = "";

    for (const key of order) {
      if (!presentSet.has(key)) continue;
      const def = sectionsState.SECTION_DEFS[key];
      if (!def) continue;

      const hidden = sectionsState.isHidden(key);

      const row = document.createElement("div");
      row.className = "section-row" + (hidden ? " hidden-section" : "");
      row.dataset.key = key;
      row.draggable = true;

      const handle = document.createElement("span");
      handle.className = "drag-handle";
      handle.textContent = "⠿";
      handle.title = "Drag to reorder (sidebar only)";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !hidden;
      cb.style.cursor = "pointer";
      cb.addEventListener("change", () => {
        sectionsState.toggleHidden(key);
        buildPanel();
        preview.refresh(
          sectionsState.getOrderedFilteredYaml(app.state.yaml),
          app.state.template
        );
      });

      const lbl = document.createElement("span");
      lbl.className = "section-label";
      lbl.textContent = def.label;
      lbl.title = hidden ? `${def.label} (hidden)` : def.label;
      lbl.addEventListener("click", () => cb.click());

      const btnReset = document.createElement("button");
      btnReset.className = "btn-reset";
      btnReset.textContent = "↺";
      btnReset.title = `Reset ${def.label}`;
      btnReset.addEventListener("click", () => showResetModal(key));

      row.addEventListener("dragstart", (e) => {
        dragSrcKey = key;
        setTimeout(() => row.classList.add("dragging"), 0);
        e.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragend", () => {
        dragSrcKey = null;
        row.classList.remove("dragging");
        panel
          .querySelectorAll(".section-row")
          .forEach((r) => r.classList.remove("drag-over"));
      });
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        panel
          .querySelectorAll(".section-row")
          .forEach((r) => r.classList.remove("drag-over"));
        if (dragSrcKey !== key) row.classList.add("drag-over");
      });
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        if (!dragSrcKey || dragSrcKey === key) return;
        const ord = sectionsState.getOrder();
        const fromIdx = ord.indexOf(dragSrcKey);
        const toIdx = ord.indexOf(key);
        if (fromIdx === -1 || toIdx === -1) return;
        ord.splice(fromIdx, 1);
        ord.splice(toIdx, 0, dragSrcKey);
        sectionsState.setOrder(ord);
        dragSrcKey = null;
        buildPanel();
        preview.refresh(
          sectionsState.getOrderedFilteredYaml(app.state.yaml),
          app.state.template
        );
      });

      row.appendChild(handle);
      row.appendChild(cb);
      row.appendChild(lbl);
      row.appendChild(btnReset);
      panel.appendChild(row);
    }

    const btnResetOrder = document.createElement("button");
    btnResetOrder.className = "btn-reset-order";
    btnResetOrder.textContent = "↺ Reset Order";
    btnResetOrder.title = "Reset section order and visibility to defaults";
    btnResetOrder.addEventListener("click", () => {
      sectionsState.resetAll();
      buildPanel();
      preview.refresh(
        sectionsState.getOrderedFilteredYaml(app.state.yaml),
        app.state.template
      );
    });
    panel.appendChild(btnResetOrder);
  }

  const modal = document.getElementById("reset-modal");
  const modalTitle = document.getElementById("reset-modal-title");
  const modalCancel = document.getElementById("reset-modal-cancel");
  const modalConfirm = document.getElementById("reset-modal-confirm");

  const toast = document.getElementById("undo-toast");
  const toastMsg = document.getElementById("undo-toast-message");
  const toastBtn = document.getElementById("undo-toast-btn");

  let toastTimer = null;
  let pendingUndo = null; // { key, previousSectionYaml }

  function hideToast() {
    clearTimeout(toastTimer);
    toast.style.display = "none";
    pendingUndo = null;
  }

  function showToast(label, key, previousSectionYaml) {
    hideToast();
    pendingUndo = { key, previousSectionYaml };
    toastMsg.textContent = `${label} reset`;
    toast.style.display = "flex";
    toastTimer = setTimeout(hideToast, 5000);
  }

  toastBtn.addEventListener("click", () => {
    if (!pendingUndo) return;
    const { key, previousSectionYaml } = pendingUndo;
    const restored = sectionsState.restoreSectionYaml(
      key,
      previousSectionYaml,
      app.state.yaml
    );
    if (restored) {
      window.editorAdapter.setValue(restored);
      app.setState({ yaml: restored });
    }
    hideToast();
  });

  function showResetModal(key) {
    const def = sectionsState.SECTION_DEFS[key];
    if (!def) return;
    modalTitle.textContent = `Reset ${def.label}?`;
    modal.style.display = "flex";

    function onConfirm() {
      modal.style.display = "none";
      cleanup();
      const result = sectionsState.resetSectionYaml(key, app.state.yaml);
      if (!result) return;
      window.editorAdapter.setValue(result.newYaml);
      app.setState({ yaml: result.newYaml });
      showToast(def.label, key, result.previousYaml);
    }

    function onCancel() {
      modal.style.display = "none";
      cleanup();
    }

    function onBackdrop(e) {
      if (e.target === modal) {
        modal.style.display = "none";
        cleanup();
      }
    }

    function cleanup() {
      modalConfirm.removeEventListener("click", onConfirm);
      modalCancel.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
    }

    modalConfirm.addEventListener("click", onConfirm);
    modalCancel.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
  }

  document.addEventListener("DOMContentLoaded", () => {
    header.addEventListener("click", togglePanel);
    buildPanel();
    let buildTimer = null;
    window.editorAdapter.onChange(() => {
      clearTimeout(buildTimer);
      buildTimer = setTimeout(buildPanel, 300);
    });
  });

  return { buildPanel };
})();

window.sectionsUI = sectionsUI;
