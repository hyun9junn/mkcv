const preview = (() => {
  const pane = document.getElementById("preview-pane");
  let timer = null;

  async function refresh(yaml, template) {
    try {
      const resp = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml, template }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        pane.innerHTML = `<p style="color:#c00"><strong>Preview error:</strong> ${err.message}</p>`;
        return;
      }
      const { markdown } = await resp.json();
      pane.innerHTML = marked.parse(markdown);
    } catch {
      pane.innerHTML = `<p style="color:#c00">Preview unavailable</p>`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    window.editorAdapter.onChange(() => {
      clearTimeout(timer);
      timer = setTimeout(() => refresh(app.state.yaml, app.state.template), 500);
    });
    setTimeout(() => refresh(app.state.yaml, app.state.template), 100);
  });

  return { refresh };
})();

window.preview = preview;
