import { app } from './app.js';

// settingsSync, sectionsState, preview etc. are still IIFE modules
// referenced via window.* until later phase 2 tasks convert them to ESM.

function _setActive(groupEl, value) {
  groupEl.querySelectorAll("button[data-value]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.value === value);
  });
}

export function initLayoutControls() {
  const DENSITY_KEY = "mkcv_density";
  const FONT_KEY    = "mkcv_font_scale";

  const VALID_DENSITIES  = new Set(["comfortable", "balanced", "compact"]);
  const VALID_FONT_SCALES = new Set(["small", "normal", "large"]);
  const storedDensity = localStorage.getItem(DENSITY_KEY);
  const storedFont    = localStorage.getItem(FONT_KEY);
  const density   = VALID_DENSITIES.has(storedDensity)   ? storedDensity : "balanced";
  const fontScale = VALID_FONT_SCALES.has(storedFont) ? storedFont    : "normal";
  app.setState({ density, font_scale: fontScale });

  const densityGroup = document.getElementById("density-group");
  const fontGroup    = document.getElementById("font-scale-group");

  _setActive(densityGroup, density);
  _setActive(fontGroup, fontScale);

  densityGroup.addEventListener("click", e => {
    const btn = e.target.closest("button[data-value]");
    if (!btn) return;
    const value = btn.dataset.value;
    app.setState({ density: value });
    localStorage.setItem(DENSITY_KEY, value);
    _setActive(densityGroup, value);
    if (window.settingsSync) {
      window.settingsSync.updateFromToolbar(s => { s.layout.density = value; });
    } else {
      window.preview.refresh(
        window.sectionsState.getOrderedFilteredYaml(app.state.yaml),
        app.state.template
      );
    }
  });

  fontGroup.addEventListener("click", e => {
    const btn = e.target.closest("button[data-value]");
    if (!btn) return;
    const value = btn.dataset.value;
    app.setState({ font_scale: value });
    localStorage.setItem(FONT_KEY, value);
    _setActive(fontGroup, value);
    if (window.settingsSync) {
      window.settingsSync.updateFromToolbar(s => { s.layout.font_scale = value; });
    } else {
      window.preview.refresh(
        window.sectionsState.getOrderedFilteredYaml(app.state.yaml),
        app.state.template
      );
    }
  });
}
