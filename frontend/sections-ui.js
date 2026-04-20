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
          sectionsState.getFilteredYaml(app.state.yaml),
          app.state.template
        );
      });

      const lbl = document.createElement("span");
      lbl.className = "section-label";
      lbl.textContent = def.label + (hidden ? " (hidden)" : "");
      lbl.addEventListener("click", () => cb.click());

      const btnReset = document.createElement("button");
      btnReset.className = "btn-reset";
      btnReset.textContent = "↺ Reset";
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
      });

      row.appendChild(handle);
      row.appendChild(cb);
      row.appendChild(lbl);
      row.appendChild(btnReset);
      panel.appendChild(row);
    }
  }

  function showResetModal(key) {
    // Stub — replaced in Task 4
    alert(`Reset stub for: ${key}`);
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
