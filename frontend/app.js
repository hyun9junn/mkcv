const app = {
  state: {
    yaml: "",
    template: "classic",
    density: "balanced",
    font_scale: "normal",
    link_display: "label",
  },
  setState(patch) {
    Object.assign(this.state, patch);
  },
};

window.app = app;
