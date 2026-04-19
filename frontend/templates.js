document.addEventListener("DOMContentLoaded", async () => {
  const select = document.getElementById("template-select");

  try {
    const { templates } = await (await fetch("/api/templates")).json();
    templates.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
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
    app.setState({ template: select.value });
    preview.refresh(app.state.yaml, app.state.template);
  });
});
