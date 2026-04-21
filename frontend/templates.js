document.addEventListener("DOMContentLoaded", async () => {
    const select = document.getElementById("template-select");
    const banner = document.getElementById("error-banner");
    const btnValidate = document.getElementById("btn-validate-template");
    let allMeta = {};

    try {
        const data = await (await fetch("/api/templates")).json();
        const validationMap = data.validation || {};
        allMeta = data.meta || {};

        data.templates.forEach((name) => {
            const opt = document.createElement("option");
            opt.value = name;
            const isValid = validationMap[name] ? validationMap[name].valid : null;
            const prefix = isValid === false ? "⚠ " : "";
            const meta = allMeta[name] || {};
            opt.textContent = prefix + (meta.display_name || (name.charAt(0).toUpperCase() + name.slice(1)));
            if (name === app.state.template) opt.selected = true;
            select.appendChild(opt);
        });

    } catch {
        const opt = document.createElement("option");
        opt.value = "classic";
        opt.textContent = "Classic";
        select.appendChild(opt);
    }

    select.addEventListener("change", () => {
        const name = select.value;
        app.setState({ template: name });
        preview.refresh(sectionsState.getFilteredYaml(app.state.yaml), name);
    });

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
