const validator = (() => {
  const banner = document.getElementById("error-banner");
  let timer = null;

  function showErrors(errors) {
    if (!errors.length) {
      banner.style.display = "none";
      banner.textContent = "";
      return;
    }
    banner.style.display = "block";
    banner.textContent = errors.join(" · ");
  }

  async function validate(yaml, template) {
    try {
      const resp = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml, template }),
      });
      const data = await resp.json();
      showErrors(data.errors || []);
      return data.valid;
    } catch {
      return true;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    window.editorAdapter.onChange(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        validate(app.state.yaml, app.state.template);
      }, 500);
    });
  });

  return { validate };
})();

window.validator = validator;
