export function toast(msg, type = 'info') {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const el       = document.createElement('div');
  el.className   = `toast ${type}`;
  el.innerHTML   = `<span class="toast-title">${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}
