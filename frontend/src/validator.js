import { app } from './app.js';

// editorAdapter, settingsSync etc. are still IIFE modules
// referenced via window.* until later phase 2 tasks convert them to ESM.

let _banner = null;
let _timer = null;

function _showErrors(errors) {
  const dot  = document.getElementById("valid-dot");
  const text = document.getElementById("valid-text");

  if (!errors.length) {
    _banner.style.display = "none";
    _banner.textContent   = "";
    if (dot)  { dot.className = "status-dot"; }
    if (text)  text.textContent = "YAML valid";
    return;
  }

  _banner.style.display = "block";
  _banner.textContent   = errors.join(" · ");
  if (dot)  { dot.className = "status-dot err"; }
  if (text)  text.textContent = "YAML errors";
}

export async function validate(yaml, template) {
  try {
    const resp = await fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yaml, template }),
    });
    const data = await resp.json();
    _showErrors(data.errors || []);
    return data.valid;
  } catch {
    return true;
  }
}

export const validator = { validate };

export function initValidator() {
  _banner = document.getElementById("error-banner");

  window.editorAdapter.onChange(() => {
    if (window.settingsSync && window.settingsSync.activeTab === 'settings') return;
    clearTimeout(_timer);
    _timer = setTimeout(() => {
      validate(app.state.yaml, app.state.template);
    }, 500);
  });
}
