const sectionsUI = (() => {
  const panel = document.getElementById("sections-panel");
  let dragSrcKey = null;

  function buildPanel() {
    const presentKeys = sectionsState.getExpandedPresentKeys(app.state.yaml);

    for (const key of presentKeys) {
      sectionsState.ensureInOrder(key);
    }

    const order    = sectionsState.getOrder();
    const presentSet = new Set(presentKeys);

    panel.innerHTML = "";

    for (const key of order) {
      const def    = sectionsState.getDef(key, app.state.yaml);
      const present = presentSet.has(key);
      if (!def) continue;

      const hidden = present && sectionsState.isHidden(key);

      const chip = document.createElement("div");
      chip.className = "chip" + ((!hidden && present) ? " on" : "") + (!present ? " absent" : "");
      chip.dataset.key = key;
      chip.draggable = present;
      chip.title = present
        ? (hidden ? `Show ${def.label}` : `Hide ${def.label}`)
        : `${def.label} — not in YAML`;

      chip.innerHTML = `
        <span class="chip-grip"><span></span><span></span><span></span></span>
        <span class="chip-dot"></span>
        <span class="chip-name">${def.label}</span>
      `;

      chip.addEventListener("click", (e) => {
        if (e.target.closest(".chip-grip")) return;
        if (!present) {
          if (sectionsState.SECTION_DEFS[key]) {
            showAddSectionToast(key);
          } else {
            showToast(`Add a \`${key}:\` key to include this section.`, "info");
          }
          return;
        }
        sectionsState.toggleHidden(key);
        buildPanel();
        preview.refresh(
          sectionsState.getOrderedFilteredYaml(app.state.yaml),
          app.state.template
        );
      });

      if (present) {
        chip.addEventListener("dragstart", (e) => {
          dragSrcKey = key;
          setTimeout(() => chip.classList.add("dragging"), 0);
          e.dataTransfer.effectAllowed = "move";
        });
        chip.addEventListener("dragend", () => {
          dragSrcKey = null;
          chip.classList.remove("dragging");
          panel.querySelectorAll(".chip").forEach(c => c.classList.remove("drag-over"));
        });
        chip.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          panel.querySelectorAll(".chip").forEach(c => c.classList.remove("drag-over"));
          if (dragSrcKey !== key) chip.classList.add("drag-over");
        });
        chip.addEventListener("drop", (e) => {
          e.preventDefault();
          if (!dragSrcKey || dragSrcKey === key) return;
          const ord     = sectionsState.getOrder();
          const fromIdx = ord.indexOf(dragSrcKey);
          const toIdx   = ord.indexOf(key);
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
      }

      panel.appendChild(chip);
    }
  }

  /* ── Modal ── */
  const modal        = document.getElementById("reset-modal");
  const modalTitle   = document.getElementById("reset-modal-title");
  const modalCancel  = document.getElementById("reset-modal-cancel");
  const modalConfirm = document.getElementById("reset-modal-confirm");

  /* ── Undo toast ── */
  const undoToast  = document.getElementById("undo-toast");
  const undoMsg    = document.getElementById("undo-toast-message");
  const undoBtn    = document.getElementById("undo-toast-btn");
  let toastTimer   = null;
  let pendingUndo  = null;

  function hideUndoToast() {
    clearTimeout(toastTimer);
    undoToast.style.display = "none";
    pendingUndo = null;
  }

  function showUndoToast(label, key, previousSectionYaml) {
    hideUndoToast();
    pendingUndo = { key, previousSectionYaml };
    undoMsg.textContent = `${label} reset`;
    undoToast.style.display = "flex";
    toastTimer = setTimeout(hideUndoToast, 5000);
  }

  undoBtn.addEventListener("click", () => {
    if (!pendingUndo) return;
    const { key, previousSectionYaml } = pendingUndo;
    const restored = sectionsState.restoreSectionYaml(key, previousSectionYaml, app.state.yaml);
    if (restored) {
      window.editorAdapter.setValue(restored);
      app.setState({ yaml: restored });
    }
    hideUndoToast();
  });

  /* Shared toast (uses #toast-stack if available, else alert) */
  function showToast(msg, type = "info") {
    const stack = document.getElementById("toast-stack");
    if (!stack) return;
    const t = document.createElement("div");
    t.className = "toast " + type;
    t.innerHTML = `<div class="toast-msg">${msg}</div><button class="toast-close">×</button>`;
    t.querySelector(".toast-close").addEventListener("click", () => t.remove());
    stack.appendChild(t);
    setTimeout(() => {
      t.style.animation = "toastIn .2s ease reverse both";
      setTimeout(() => t.remove(), 220);
    }, 3800);
  }

  function appendDefaultSection(key) {
    const def = sectionsState.SECTION_DEFS[key];
    if (!def || !def.yaml) return false;
    const current = app.state.yaml || '';
    const newYaml = current.replace(/\n*$/, '\n') + def.yaml;
    window.editorAdapter.setValue(newYaml);
    app.setState({ yaml: newYaml });
    return true;
  }

  function showAddSectionToast(key) {
    const stack = document.getElementById("toast-stack");
    if (!stack) return;
    const t = document.createElement("div");
    t.className = "toast info";
    t.style.maxWidth = "520px";
    t.innerHTML = `<div class="toast-msg">Add a \`${key}:\` key to include this section.</div><button class="toast-action">Add default context</button><button class="toast-close">×</button>`;

    let autoTimer = null;

    function removeToast() {
      clearTimeout(autoTimer);
      t.style.animation = "toastIn .2s ease reverse both";
      setTimeout(() => t.remove(), 220);
    }

    t.querySelector(".toast-close").addEventListener("click", removeToast);
    t.querySelector(".toast-action").addEventListener("click", () => {
      removeToast();
      if (appendDefaultSection(key)) {
        buildPanel();
        preview.refresh(
          sectionsState.getOrderedFilteredYaml(app.state.yaml),
          app.state.template
        );
      }
    });

    stack.appendChild(t);
    autoTimer = setTimeout(removeToast, 5000);
  }

  function showResetModal(key) {
    const def = sectionsState.SECTION_DEFS[key];
    if (!def) return;
    modalTitle.textContent = `Reset ${def.label}?`;
    modal.classList.add("open");

    function onConfirm() {
      modal.classList.remove("open");
      cleanup();
      const result = sectionsState.resetSectionYaml(key, app.state.yaml);
      if (!result) return;
      window.editorAdapter.setValue(result.newYaml);
      app.setState({ yaml: result.newYaml });
      showUndoToast(def.label, key, result.previousYaml);
    }
    function onCancel() { modal.classList.remove("open"); cleanup(); }
    function onBackdrop(e) { if (e.target === modal) { modal.classList.remove("open"); cleanup(); } }
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
    buildPanel();
    let buildTimer = null;
    window.editorAdapter.onChange(() => {
      clearTimeout(buildTimer);
      buildTimer = setTimeout(buildPanel, 300);
    });
  });

  return { buildPanel, showResetModal };
})();

window.sectionsUI = sectionsUI;
