import { app } from './app.js';

const RESUME_KEY = "mkcv:default:resume.yaml";
const OLD_KEY    = "mkcv_yaml";

function _migrate() {
  if (!localStorage.getItem(RESUME_KEY) && localStorage.getItem(OLD_KEY)) {
    try {
      localStorage.setItem(RESUME_KEY, localStorage.getItem(OLD_KEY));
      localStorage.removeItem(OLD_KEY);
    } catch {}
  }
}

function _showToast(msg) {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = "toast warn";
  el.innerHTML = `<span class="toast-title">${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

export function loadFile() {
  const saved = localStorage.getItem(RESUME_KEY);
  if (saved && saved.trim()) {
    window.editorAdapter.setValue(saved);
    window.editorAdapter.clearHistory();
    app.setState({ yaml: saved });
  }
}

export function saveFile(content) {
  if (window.settingsSync?.activeTab === "settings") return;
  try {
    localStorage.setItem(RESUME_KEY, content);
  } catch {
    _showToast("Resume not saved — browser storage is full or unavailable.");
  }
}

export const fileSync = { loadFile, saveFile };

export function initFileSync() {
  _migrate();
  loadFile();
  window.editorAdapter.onChange((val) => saveFile(val));
}
