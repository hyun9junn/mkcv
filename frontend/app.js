const app = {
  state: {
    yaml: "",
    template: "classic",
    density: "balanced",
    font_scale: "normal",
  },
  setState(patch) {
    Object.assign(this.state, patch);
  },
};

window.app = app;
