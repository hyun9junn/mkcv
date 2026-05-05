const sectionsUI = (() => {
  const panel = document.getElementById("sections-panel");
  let panelDragActive = false;

  /* ── Edge-scroll state ── */
  let scrollRAF   = null;
  let scrollDir   = 0;    // -1 = left, +1 = right, 0 = none
  let scrollSpeed = 0;

  function tickScroll() {
    if (scrollDir === 0) { scrollRAF = null; return; }
    panel.scrollLeft += scrollDir * scrollSpeed;
    scrollRAF = requestAnimationFrame(tickScroll);
  }

  function updateScrollZone(clientX) {
    const ZONE      = 60;
    const MAX_SPEED = 8;
    const pr        = panel.getBoundingClientRect();
    const distLeft  = clientX - pr.left;
    const distRight = pr.right - clientX;
    if (distLeft < ZONE && distLeft <= distRight) {
      scrollDir   = -1;
      scrollSpeed = (1 - distLeft  / ZONE) * MAX_SPEED;
    } else if (distRight < ZONE) {
      scrollDir   = 1;
      scrollSpeed = (1 - distRight / ZONE) * MAX_SPEED;
    } else {
      scrollDir   = 0;
      scrollSpeed = 0;
    }
    if (scrollDir !== 0 && !scrollRAF) {
      scrollRAF = requestAnimationFrame(tickScroll);
    }
  }

  function stopScroll() {
    scrollDir = 0; scrollSpeed = 0;
    if (scrollRAF) { cancelAnimationFrame(scrollRAF); scrollRAF = null; }
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildPanel() {
    const presentKeys = sectionsState.getExpandedPresentKeys(app.state.yaml);

    for (const key of presentKeys) {
      sectionsState.ensureInOrder(key);
    }

    const order    = sectionsState.getOrder();
    const presentSet = new Set(presentKeys);
    const settings = window.settingsSync ? settingsSync.getSettings() : null;

    panel.innerHTML = "";

    for (const key of order) {
      const def    = sectionsState.getDef(key, app.state.yaml);
      const present = presentSet.has(key);
      if (!def) continue;
      const sectionTitle = settings?.sections?.find(s => s.key === key)?.title ?? def.label;

      const hidden = present && sectionsState.isHidden(key);

      const chip = document.createElement("div");
      chip.className =
        "chip" +
        ((!hidden && present) ? " on" : "") +
        (hidden ? " hidden" : "") +
        (!present ? " absent" : "");
      chip.dataset.key = key;

      chip.innerHTML = `
        <span class="chip-grip"><span></span><span></span><span></span></span>
        <span class="chip-dot"></span>
        <span class="chip-name">${escHtml(sectionTitle)}</span>
      `;

      const dot = chip.querySelector(".chip-dot");
      dot.title = present
        ? (hidden ? `Show ${sectionTitle}` : `Hide ${sectionTitle}`)
        : `${sectionTitle} — not in YAML`;
      dot.style.cursor = "pointer";

      let justDragged = false;

      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        if (justDragged) { justDragged = false; return; }
        if (!present) {
          if (sectionsState.SECTION_DEFS[key]) {
            if (appendDefaultSection(key)) {
              const wasHidden = sectionsState.isHidden(key);
              if (wasHidden) {
                sectionsState.toggleHidden(key);
              }
              buildPanel();
              if (!wasHidden) {
                preview.refresh(
                  sectionsState.getOrderedFilteredYaml(app.state.yaml),
                  app.state.template
                );
              }
              showToast(`${sectionTitle} added`, "info");
            }
          } else {
            showToast(`Add a \`${key}:\` key to include this section.`, "info");
          }
          return;
        }
        const currentYaml = app.state.yaml || '';
        const newYaml = hidden
          ? sectionsState.moveFromInvisible(currentYaml, key)
          : sectionsState.moveToInvisible(currentYaml, key);
        if (newYaml !== currentYaml) {
          if (!window.settingsSync || window.settingsSync.activeTab === 'resume') {
            window.editorAdapter.suppressNextPreviewRefresh();
            window.editorAdapter.setValuePreserveScroll(newYaml);
          }
          app.setState({ yaml: newYaml });
        }
        sectionsState.toggleHidden(key);
        buildPanel();
        // preview refresh is handled by notifySectionStateChange via monkey-patched toggleHidden
      });

      const nameSpan = chip.querySelector(".chip-name");
      nameSpan.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        if (!present) return;
        const previousTitle = sectionTitle;
        nameSpan.style.display = "none";
        const input = document.createElement("input");
        input.className = "chip-name-input";
        input.value = previousTitle;
        input.style.width = Math.max(40, previousTitle.length * 8) + "px";
        nameSpan.parentNode.insertBefore(input, nameSpan.nextSibling);
        input.focus();
        input.select();

        let committed = false;
        function commit() {
          if (committed) return;
          committed = true;
          const newTitle = input.value.trim() || previousTitle;
          if (newTitle !== previousTitle && window.settingsSync) {
            settingsSync.updateSectionTitle(key, newTitle);
            buildPanel();
          } else {
            input.remove();
            nameSpan.style.display = '';
          }
        }
        function cancel() {
          if (committed) return;
          committed = true;
          buildPanel();
        }
        input.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") { ev.preventDefault(); commit(); }
          if (ev.key === "Escape") { ev.preventDefault(); cancel(); }
        });
        input.addEventListener("blur", commit);
      });

      {
        let dragClone = null;
        let cloneH = 0;
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
            cloneH = rect.height;
            dragClone = chip.cloneNode(true);
            dragClone.className = chip.className.replace(/\bdragging\b/, "").trim() + " chip-drag-clone";
            dragClone.style.width = rect.width + "px";
            document.body.appendChild(dragClone);
            chip.classList.add("dragging");
          }
          updateScrollZone(e.clientX);
          const pr      = panel.getBoundingClientRect();
          const cloneW  = parseFloat(dragClone.style.width);
          const rawLeft = e.clientX - offsetX;
          const rawTop  = e.clientY - offsetY;
          dragClone.style.left = Math.max(pr.left, Math.min(rawLeft, pr.right  - cloneW)) + "px";
          dragClone.style.top  = Math.max(pr.top,  Math.min(rawTop,  pr.bottom - cloneH)) + "px";
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
          stopScroll();
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
          // preview refresh handled by notifySectionStateChange via monkey-patched setOrder
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
          // preview refresh handled by notifySectionStateChange via monkey-patched setOrder
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
      if (!window.settingsSync || window.settingsSync.activeTab === 'resume') {
        window.editorAdapter.setValue(restored);
      }
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
    const newYaml = sectionsState.appendToMainArea(current, def.yaml);
    if (!window.settingsSync || window.settingsSync.activeTab === 'resume') {
      window.editorAdapter.suppressNextPreviewRefresh();
      window.editorAdapter.setValue(newYaml);
    }
    app.setState({ yaml: newYaml });
    return true;
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
      if (!window.settingsSync || window.settingsSync.activeTab === 'resume') {
        window.editorAdapter.setValue(result.newYaml);
      }
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
