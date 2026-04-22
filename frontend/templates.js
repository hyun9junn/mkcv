document.addEventListener("DOMContentLoaded", async () => {
    const wrapper      = document.getElementById("template-select-wrapper");
    const trigger      = document.getElementById("template-trigger");
    const dropdown     = document.getElementById("template-dropdown");
    const nameDisplay  = document.getElementById("tpl-name-display");
    const banner       = document.getElementById("error-banner");
    const btnValidate  = document.getElementById("btn-validate-template");

    let allMeta = {};

    function openDropdown() {
        dropdown.hidden = false;
        trigger.style.borderColor = "var(--rule-2)";
    }

    function closeDropdown() {
        dropdown.hidden = true;
        trigger.style.borderColor = "";
    }

    function selectTemplate(name) {
        dropdown.querySelectorAll(".tpl-option").forEach(el => {
            el.classList.toggle("selected", el.dataset.name === name);
        });
        const meta = allMeta[name] || {};
        const displayName = meta.display_name || (name.charAt(0).toUpperCase() + name.slice(1));
        if (nameDisplay) nameDisplay.textContent = displayName;
        closeDropdown();
        app.setState({ template: name });

        const paneTitle = document.getElementById("preview-pane-title");
        if (paneTitle) paneTitle.textContent = `Preview — ${displayName}`;

        preview.refresh(sectionsState.getFilteredYaml(app.state.yaml), name);
    }

    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        if (dropdown.hidden) openDropdown(); else closeDropdown();
    });

    document.addEventListener("click", (e) => {
        if (!wrapper.contains(e.target)) closeDropdown();
    });

    /* Badge labels for well-known templates */
    const BADGES = {
        classic:            "Default",
        "academic-research": "Popular",
        "modern-startup":   "New",
        "resume-tech":      "New",
    };

    try {
        const data = await (await fetch("/api/templates")).json();
        const validationMap = data.validation || {};
        allMeta = data.meta || {};

        data.templates.forEach((name, idx) => {
            const meta        = allMeta[name] || {};
            const isValid     = validationMap[name] ? validationMap[name].valid : null;
            const displayName = meta.display_name || (name.charAt(0).toUpperCase() + name.slice(1));
            const description = meta.description  || "";
            const badge       = BADGES[name] || (isValid === false ? "⚠ Error" : "");
            const isFirst     = name === app.state.template;

            const opt = document.createElement("div");
            opt.className = "tpl-option" + (isFirst ? " selected" : "");
            opt.dataset.name = name;

            opt.innerHTML = `
              <div>
                <div class="tpl-option-name">${displayName}</div>
                ${description ? `<div class="tpl-option-desc">${description}</div>` : ""}
              </div>
              ${badge ? `<span class="tpl-option-badge">${badge}</span>` : ""}
            `;

            if (isFirst && nameDisplay) nameDisplay.textContent = displayName;

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
        opt.innerHTML = `<div><div class="tpl-option-name">Classic</div></div>`;
        opt.addEventListener("click", () => selectTemplate("classic"));
        dropdown.appendChild(opt);
        if (nameDisplay) nameDisplay.textContent = "Classic";
    }

    /* Validate button (triggered by icon in masthead) */
    btnValidate.addEventListener("click", async () => {
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
