window.templateRegistry = (() => {
    let allMeta = {};

    function clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function setAllMeta(meta) {
        allMeta = meta && typeof meta === "object" ? meta : {};
    }

    function getAllMeta() {
        return clone(allMeta) || {};
    }

    function getMeta(name) {
        return clone(allMeta[name]) || {};
    }

    function getDefaults(name) {
        const defaults = allMeta[name]?.defaults;
        return defaults && typeof defaults === "object" ? clone(defaults) : null;
    }

    return { setAllMeta, getAllMeta, getMeta, getDefaults };
})();

window.templateUI = (() => {
    let controls = {
        wrapper: null,
        trigger: null,
        dropdown: null,
        nameDisplay: null,
    };
    let availableTemplates = new Set();

    function defaultTemplate() {
        return window.SETTINGS_HELPERS?.DEFAULT_SETTINGS?.template || "classic";
    }

    function isValidTemplate(name) {
        return Array.isArray(window.SETTINGS_HELPERS?.VALID_TPL) && window.SETTINGS_HELPERS.VALID_TPL.includes(name);
    }

    function resolveTemplate(name) {
        const candidate = typeof name === "string" ? name : String(name ?? "");
        if (isValidTemplate(candidate) || availableTemplates.has(candidate)) return candidate;
        return defaultTemplate();
    }

    function fallbackDisplayName(name) {
        return String(name || defaultTemplate())
            .split("-")
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");
    }

    function getDisplayName(name) {
        const meta = window.templateRegistry.getMeta(name);
        return meta.display_name || fallbackDisplayName(name);
    }

    function getPreviewYaml() {
        if (!window.sectionsState) return app.state.yaml;
        if (typeof sectionsState.getOrderedFilteredYaml === "function") {
            return sectionsState.getOrderedFilteredYaml(app.state.yaml);
        }
        if (typeof sectionsState.getFilteredYaml === "function") {
            return sectionsState.getFilteredYaml(app.state.yaml);
        }
        return app.state.yaml;
    }

    function openDropdown() {
        if (!controls.dropdown || !controls.trigger) return;
        controls.dropdown.hidden = false;
        controls.trigger.style.borderColor = "var(--rule-2)";
    }

    function closeDropdown() {
        if (!controls.dropdown || !controls.trigger) return;
        controls.dropdown.hidden = true;
        controls.trigger.style.borderColor = "";
    }

    function syncSelectedOption(name) {
        controls.dropdown?.querySelectorAll(".tpl-card").forEach(el => {
            el.classList.toggle("selected", el.dataset.name === name);
        });
    }

    function updateTemplateChrome(name) {
        const displayName = getDisplayName(name);
        syncSelectedOption(name);
        if (controls.nameDisplay) controls.nameDisplay.textContent = displayName;

        const paneTitle = document.getElementById("preview-pane-title");
        if (paneTitle) paneTitle.textContent = `Preview — ${displayName}`;
        return displayName;
    }

    function selectTemplate(name, opts = {}) {
        const resolved = resolveTemplate(name);
        updateTemplateChrome(resolved);
        if (opts.closeDropdown !== false) closeDropdown();

        const templateChanged = app.state.template !== resolved;
        app.setState({ template: resolved });

        const shouldSyncSettings = opts.syncSettings !== false;
        const shouldApplyDefaults = opts.applyDefaults ?? true;
        const shouldRefreshPreview = opts.refreshPreview !== false;

        if (!templateChanged && opts.force !== true && !shouldSyncSettings && !shouldApplyDefaults && !shouldRefreshPreview) {
            return resolved;
        }

        if (shouldSyncSettings && window.settingsSync?.updateFromToolbar) {
            window.settingsSync.updateFromToolbar(next => {
                next.template = resolved;
            }, { skipApply: true, skipPreview: true });
        }

        if (shouldApplyDefaults && window.settingsSync?.applyTemplateDefaults) {
            window.settingsSync.applyTemplateDefaults(
                window.templateRegistry.getDefaults(resolved),
                { skipPreview: true }
            );
        }

        if (shouldRefreshPreview && window.preview) {
            preview.refresh(getPreviewYaml(), resolved);
        }

        return resolved;
    }

    function setControls(nextControls = {}) {
        controls = { ...controls, ...nextControls };
    }

    function setAvailableTemplates(names = []) {
        availableTemplates = new Set(names);
        if (availableTemplates.size === 0) availableTemplates.add(defaultTemplate());
    }

    return {
        closeDropdown,
        openDropdown,
        selectTemplate,
        setControls,
        setAvailableTemplates,
    };
})();

document.addEventListener("DOMContentLoaded", async () => {
    const wrapper      = document.getElementById("template-select-wrapper");
    const trigger      = document.getElementById("template-trigger");
    const dropdown     = document.getElementById("template-dropdown");
    const grid         = document.getElementById("template-grid");
    const nameDisplay  = document.getElementById("tpl-name-display");
    const banner       = document.getElementById("error-banner");
    const btnValidate  = document.getElementById("btn-validate-template");
    window.templateUI.setControls({ wrapper, trigger, dropdown, nameDisplay });

    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        if (dropdown.hidden) window.templateUI.openDropdown();
        else window.templateUI.closeDropdown();
    });

    document.addEventListener("click", (e) => {
        if (!wrapper.contains(e.target)) window.templateUI.closeDropdown();
    });

    try {
        const data = await (await fetch("/api/templates")).json();
        const validationMap = data.validation || {};
        window.templateRegistry.setAllMeta(data.meta || {});
        window.templateUI.setAvailableTemplates(data.templates || []);

        let cardIndex = 0;
        data.templates.forEach((name) => {
            const meta        = window.templateRegistry.getMeta(name);
            const isValid     = validationMap[name] ? validationMap[name].valid : null;
            const displayName = meta.display_name || name
                .split("-")
                .map(part => part.charAt(0).toUpperCase() + part.slice(1))
                .join(" ");
            const description = meta.description  || "";
            const audience    = meta.audience     || "";
            const badge       = isValid === false ? "⚠ Error" : (meta.ui?.badge || "");
            const isFirst     = name === app.state.template;
            const col         = (cardIndex % 3) + 1;

            const card = document.createElement("div");
            card.className = `tpl-card${isFirst ? " selected" : ""} col-${col}`;
            card.dataset.name = name;

            // Fields below are from server-side meta.yaml (developer-controlled, not user input).
            card.innerHTML = `
              <div class="tpl-thumb-wrap">
                <img class="tpl-thumb"
                     src="/assets/template-previews/${name}.png"
                     alt="${displayName}"
                     onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
                <div class="tpl-thumb tpl-thumb-${name}" style="display:none"></div>
              </div>
              <div class="tpl-label">${displayName}</div>
              <div class="tpl-popover">
                <div class="popover-name">${displayName}</div>
                ${audience ? `<span class="popover-audience">${audience}</span>` : ""}
                ${badge    ? `<span class="popover-badge">${badge}</span>`       : ""}
                ${description ? `<div class="popover-desc">${description}</div>` : ""}
              </div>
            `;

            if (isFirst && nameDisplay) nameDisplay.textContent = displayName;

            card.addEventListener("click", (e) => {
                e.stopPropagation();
                window.templateUI.selectTemplate(name);
            });

            let hoverTimer = null;
            card.addEventListener("mouseenter", () => {
                hoverTimer = setTimeout(() => {
                    const popover = card.querySelector(".tpl-popover");
                    if (popover) {
                        const rect = card.getBoundingClientRect();
                        popover.style.top = rect.top + "px";
                        if (card.classList.contains("col-3")) {
                            popover.style.left = "";
                            popover.style.right = (window.innerWidth - rect.left + 10) + "px";
                        } else {
                            popover.style.left = (rect.right + 10) + "px";
                            popover.style.right = "";
                        }
                    }
                    card.classList.add("popover-visible");
                }, 400);
            });
            card.addEventListener("mouseleave", () => {
                clearTimeout(hoverTimer);
                card.classList.remove("popover-visible");
            });

            grid.appendChild(card);
            cardIndex++;
        });

    } catch {
        window.templateRegistry.setAllMeta({});
        window.templateUI.setAvailableTemplates(["classic"]);
        const card = document.createElement("div");
        card.className = "tpl-card selected col-1";
        card.dataset.name = "classic";
        card.innerHTML = `
          <div class="tpl-thumb tpl-thumb-classic"></div>
          <div class="tpl-label">Classic</div>
          <div class="tpl-popover">
            <div class="popover-name">Classic</div>
          </div>
        `;
        card.addEventListener("click", () => window.templateUI.selectTemplate("classic"));
        dropdown.appendChild(card);
        if (nameDisplay) nameDisplay.textContent = "Classic";
    }

    /* Validate button (triggered by icon in masthead) */
    btnValidate?.addEventListener("click", async () => {
        const name = app.state.template;
        btnValidate.disabled = true;

        const validDot  = document.getElementById("valid-dot");
        const validText = document.getElementById("valid-text");
        if (validDot)  { validDot.classList.add("warn"); validDot.classList.remove("idle"); }
        if (validText)  validText.textContent = "Validating…";

        try {
            const resp = await fetch(`/api/templates/${name}/validate`, { method: "POST" });
            const data = await resp.json();

            if (data.valid) {
                if (validDot)  { validDot.classList.remove("warn", "err"); }
                if (validText)  validText.textContent = "Template valid";
                _showToast("Template valid", `'${name}' compiled cleanly.`, "ok");
            } else {
                if (validDot)  { validDot.classList.add("err"); validDot.classList.remove("warn"); }
                if (validText)  validText.textContent = "Template error";
                banner.style.display = "block";
                banner.textContent = `⚠ '${name}' invalid: ${data.errors.join(" · ")}`;
                setTimeout(() => { banner.style.display = "none"; banner.textContent = ""; }, 10000);
            }
        } catch {
            _showToast("Validation failed", "Network error — is the server running?", "err");
        } finally {
            btnValidate.disabled = false;
        }
    });

    function _showToast(title, msg, type = "info") {
        const stack = document.getElementById("toast-stack");
        if (!stack) return;
        const t = document.createElement("div");
        t.className = "toast " + type;
        t.innerHTML = `
          <div>
            <div class="toast-title">${title}</div>
            ${msg ? `<div class="toast-msg">${msg}</div>` : ""}
          </div>
          <button class="toast-close">×</button>
        `;
        t.querySelector(".toast-close").addEventListener("click", () => t.remove());
        stack.appendChild(t);
        setTimeout(() => {
            t.style.animation = "toastIn .2s ease reverse both";
            setTimeout(() => t.remove(), 220);
        }, 4000);
    }
});
