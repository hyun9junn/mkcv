const sectionsUI = (() => {
  const panel = document.getElementById("sections-panel");
  let panelDragActive = false;

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
      chip.title = present
        ? (hidden ? `Show ${def.label}` : `Hide ${def.label}`)
        : `${def.label} — not in YAML`;

      chip.innerHTML = `
        <span class="chip-grip"><span></span><span></span><span></span></span>
        <span class="chip-dot"></span>
        <span class="chip-name">${def.label}</span>
      `;

      let justDragged = false;

      chip.addEventListener("click", (e) => {
        if (e.target.closest(".chip-grip")) return;
        if (justDragged) { justDragged = false; return; }
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
        let dragClone = null;
        let offsetX = 0, offsetY = 0;
        let startX = 0, startY = 0;
        let dragging = false;
        let startOrder = [];
        let activePointerId = -1;

        function onMove(e) {
          if (e.pointerId !== activePointerId) return;
          if (!dragging) {
            if (Math.abs(e.clientX - startX) <= 4 && Math.abs(e.clientY - startY) <= 4) return;
            dragging = true;
            panelDragActive = true;
            const rect = chip.getBoundingClientRect();
            dragClone = chip.cloneNode(true);
            dragClone.className = chip.className.replace(/\bdragging\b/, "").trim() + " chip-drag-clone";
            dragClone.style.width = rect.width + "px";
            document.body.appendChild(dragClone);
            chip.classList.add("dragging");
          }
          dragClone.style.left = (e.clientX - offsetX) + "px";
          dragClone.style.top  = (e.clientY - offsetY) + "px";
          const siblings = [...panel.querySelectorAll(".chip:not(.dragging)")];
          const before = siblings.find(s => {
            const r = s.getBoundingClientRect();
            return e.clientX < r.left + r.width / 2;
          });
          if (before) panel.insertBefore(chip, before);
          else panel.appendChild(chip);
        }

        function cleanUp() {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          document.removeEventListener("pointercancel", onCancel);
          activePointerId = -1;
        }

        function endDrag() {
          cleanUp();
          if (!dragging) return;
          dragging = false;
          panelDragActive = false;
          justDragged = true;
          dragClone.remove();
          dragClone = null;
          chip.classList.remove("dragging");
          const newOrder = [...panel.querySelectorAll(".chip")].map(c => c.dataset.key);
          sectionsState.setOrder(newOrder);
          buildPanel();
          preview.refresh(
            sectionsState.getOrderedFilteredYaml(app.state.yaml),
            app.state.template
          );
        }

        function onUp(e) {
          if (e.pointerId !== activePointerId) return;
          endDrag();
        }

        function onCancel(e) {
          if (e.pointerId !== activePointerId) return;
          cleanUp();
          if (!dragging) return;
          dragging = false;
          panelDragActive = false;
          dragClone.remove();
          dragClone = null;
          chip.classList.remove("dragging");
          sectionsState.setOrder(startOrder);
          buildPanel();
          preview.refresh(
            sectionsState.getOrderedFilteredYaml(app.state.yaml),
            app.state.template
          );
        }

        chip.addEventListener("pointerdown", (e) => {
          if (e.button !== 0) return;
          startOrder = sectionsState.getOrder().slice();
          activePointerId = e.pointerId;
          const rect = chip.getBoundingClientRect();
          offsetX = e.clientX - rect.left;
          offsetY = e.clientY - rect.top;
          startX = e.clientX;
          startY = e.clientY;
          document.addEventListener("pointermove", onMove);
          document.addEventListener("pointerup", onUp);
          document.addEventListener("pointercancel", onCancel);
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
      buildTimer = setTimeout(() => { if (!panelDragActive) buildPanel(); }, 300);
    });
  });

  return { buildPanel, showResetModal };
})();

window.sectionsUI = sectionsUI;
