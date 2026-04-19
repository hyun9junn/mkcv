const app = {
  state: {
    yaml: "",
    template: "classic",
  },
  setState(patch) {
    Object.assign(this.state, patch);
  },
};

window.app = app;
