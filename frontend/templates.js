document.addEventListener("DOMContentLoaded", async () => {
    const wrapper     = document.getElementById("template-select-wrapper");
    const trigger     = document.getElementById("template-trigger");
    const dropdown    = document.getElementById("template-dropdown");
    const tooltip     = document.getElementById("template-tooltip");
    const tooltipName = document.getElementById("tooltip-name");
    const tooltipDesc = document.getElementById("tooltip-desc");
    const banner      = document.getElementById("error-banner");
    const btnValidate = document.getElementById("btn-validate-template");

    let allMeta = {};
    let hoverTimer = null;

    // ── helpers ───────────────────────────────────────────────────────────────

    function openDropdown() {
        dropdown.hidden = false;
        trigger.style.borderColor = "#666";
    }

    function closeDropdown() {
        dropdown.hidden = true;
        trigger.style.borderColor = "";
        hideTooltip();
    }

    function hideTooltip() {
        clearTimeout(hoverTimer);
        hoverTimer = null;
        tooltip.hidden = true;
        tooltip.classList.remove("flip-left");
    }

    function showTooltip(optionEl, name, description) {
        tooltipName.textContent = name;
        tooltipDesc.textContent = description;

        // position vertically centred on the hovered option
        const optRect  = optionEl.getBoundingClientRect();
        const wrapRect = wrapper.getBoundingClientRect();
        const offsetTop = optRect.top - wrapRect.top + optRect.height / 2;
        tooltip.style.top = offsetTop + "px";
        tooltip.style.transform = "translateY(-50%)";

        tooltip.hidden = false;
        tooltip.classList.remove("flip-left");

        // flip left if tooltip overflows viewport right edge
        const tipRect = tooltip.getBoundingClientRect();
        if (tipRect.right > window.innerWidth - 8) {
            tooltip.classList.add("flip-left");
        }
    }

    function selectTemplate(name) {
        dropdown.querySelectorAll(".tpl-option").forEach(el => {
            el.classList.toggle("selected", el.dataset.name === name);
        });
        const meta = allMeta[name] || {};
        trigger.textContent = meta.display_name || (name.charAt(0).toUpperCase() + name.slice(1));
        closeDropdown();
        app.setState({ template: name });
        preview.refresh(sectionsState.getFilteredYaml(app.state.yaml), name);
    }

    // ── toggle dropdown on trigger click ─────────────────────────────────────

    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        if (dropdown.hidden) openDropdown(); else closeDropdown();
    });

    // ── close on outside click ────────────────────────────────────────────────

    document.addEventListener("click", (e) => {
        if (!wrapper.contains(e.target)) closeDropdown();
    });

    // ── fetch templates and build option divs ─────────────────────────────────

    try {
        const data = await (await fetch("/api/templates")).json();
        const validationMap = data.validation || {};
        allMeta = data.meta || {};

        data.templates.forEach((name) => {
            const meta = allMeta[name] || {};
            const isValid = validationMap[name] ? validationMap[name].valid : null;
            const prefix = isValid === false ? "⚠ " : "";
            const displayName = meta.display_name || (name.charAt(0).toUpperCase() + name.slice(1));

            const opt = document.createElement("div");
            opt.className = "tpl-option";
            opt.dataset.name = name;
            opt.dataset.description = meta.description || "";
            opt.textContent = prefix + displayName;
            if (name === app.state.template) {
                opt.classList.add("selected");
                trigger.textContent = prefix + displayName;
            }

            opt.addEventListener("mouseenter", () => {
                const desc = opt.dataset.description;
                if (!desc) return;
                hoverTimer = setTimeout(() => {
                    showTooltip(opt, displayName, desc);
                }, 600);
            });

            opt.addEventListener("mouseleave", () => {
                hideTooltip();
            });

            opt.addEventListener("click", (e) => {
                e.stopPropagation();
                selectTemplate(name);
            });

            dropdown.appendChild(opt);
        });

    } catch {
        const opt = document.createElement("div");
        opt.className = "tpl-option selected";
        opt.dataset.name = "classic";
        opt.dataset.description = "";
        opt.textContent = "Classic";
        opt.addEventListener("click", () => selectTemplate("classic"));
        dropdown.appendChild(opt);
        trigger.textContent = "Classic";
    }

    // ── validate button (unchanged) ───────────────────────────────────────────

    btnValidate.addEventListener("click", async () => {
        const name = app.state.template;
        btnValidate.disabled = true;
        btnValidate.textContent = "Validating…";
        try {
            const resp = await fetch(`/api/templates/${name}/validate`, { method: "POST" });
            const data = await resp.json();
            banner.style.display = "block";
            if (data.valid) {
                banner.style.background = "#1a3a1a";
                banner.style.color = "#86efac";
                banner.textContent = `✓ Template '${name}' is valid (Jinja2 + pdflatex OK)`;
            } else {
                banner.style.background = "#5c1f1f";
                banner.style.color = "#fca5a5";
                banner.textContent = `⚠ Template '${name}' invalid: ${data.errors.join(" · ")}`;
            }
            setTimeout(() => {
                banner.style.display = "none";
                banner.style.background = "";
                banner.style.color = "";
                banner.textContent = "";
            }, 8000);
        } catch {
            banner.style.display = "block";
            banner.style.background = "#5c1f1f";
            banner.style.color = "#fca5a5";
            banner.textContent = "Validation request failed";
        } finally {
            btnValidate.disabled = false;
            btnValidate.textContent = "✓ Validate Template";
        }
    });
});
