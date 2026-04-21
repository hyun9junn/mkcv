const layoutControls = (() => {
  const DENSITY_KEY = "mkcv_density";
  const FONT_KEY = "mkcv_font_scale";

  function _setActive(groupEl, value) {
    groupEl.querySelectorAll("button[data-value]").forEach(btn => {
      const active = btn.dataset.value === value;
      btn.style.background = active ? "#3a5a8a" : "#222";
      btn.style.color = active ? "#fff" : "#aaa";
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const density = localStorage.getItem(DENSITY_KEY) || "balanced";
    const fontScale = localStorage.getItem(FONT_KEY) || "normal";
    app.setState({ density, font_scale: fontScale });

    const densityGroup = document.getElementById("density-group");
    const fontGroup = document.getElementById("font-scale-group");

    _setActive(densityGroup, density);
    _setActive(fontGroup, fontScale);

    densityGroup.addEventListener("click", e => {
      const btn = e.target.closest("button[data-value]");
      if (!btn) return;
      const value = btn.dataset.value;
      app.setState({ density: value });
      localStorage.setItem(DENSITY_KEY, value);
      _setActive(densityGroup, value);
      preview.refresh(
        sectionsState.getOrderedFilteredYaml(app.state.yaml),
        app.state.template
      );
    });

    fontGroup.addEventListener("click", e => {
      const btn = e.target.closest("button[data-value]");
      if (!btn) return;
      const value = btn.dataset.value;
      app.setState({ font_scale: value });
      localStorage.setItem(FONT_KEY, value);
      _setActive(fontGroup, value);
      preview.refresh(
        sectionsState.getOrderedFilteredYaml(app.state.yaml),
        app.state.template
      );
    });
  });
})();
