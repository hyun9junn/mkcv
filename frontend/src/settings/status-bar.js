import { app } from '../app.js';
import { validator } from '../validator.js';
import { _st } from './state.js';

export function updateValidStatus(parsed) {
  if (_st.activeTab !== 'settings') return;
  const dot  = document.getElementById('valid-dot');
  const text = document.getElementById('valid-text');
  const warn = document.getElementById('settings-warn-item');
  if (!dot || !text) return;

  if (parsed.errors.length > 0) {
    dot.className    = 'status-dot err';
    text.textContent = 'Settings invalid';
  } else if (parsed.warnings.length > 0) {
    dot.className    = 'status-dot warn';
    text.textContent = `${parsed.warnings.length} warning${parsed.warnings.length > 1 ? 's' : ''}`;
  } else {
    dot.className    = 'status-dot';
    text.textContent = 'Settings valid';
  }

  if (warn) {
    const first = parsed.errors[0] || parsed.warnings[0];
    if (first) {
      warn.textContent  = first.msg;
      warn.style.display = '';
      warn.style.color   = parsed.errors.length ? 'var(--err)' : 'var(--warn)';
    } else {
      warn.style.display = 'none';
    }
  }
}

export function updateLineStat(yaml) {
  const lines = yaml.split('\n').length;
  const kb    = (new TextEncoder().encode(yaml).length / 1024).toFixed(1);
  const stat  = document.getElementById('lines-stat');
  const meta  = document.getElementById('editor-meta');
  if (stat) stat.textContent = `${lines} ln · ${kb} kb`;
  if (meta) meta.textContent = `${lines} lines`;
}

export function restoreResumeStatus() {
  const dot  = document.getElementById('valid-dot');
  const text = document.getElementById('valid-text');
  const warn = document.getElementById('settings-warn-item');
  if (dot)  dot.className    = 'status-dot';
  if (text) text.textContent = 'YAML valid';
  if (warn) warn.style.display = 'none';
  if (validator) validator.validate(app.state.yaml, app.state.template);
  const yaml  = app.state.yaml || '';
  const lines = yaml.split('\n').length;
  const kb    = (new TextEncoder().encode(yaml).length / 1024).toFixed(1);
  const stat  = document.getElementById('lines-stat');
  const meta  = document.getElementById('editor-meta');
  if (stat) stat.textContent = `${lines} ln · ${kb} kb`;
  if (meta) meta.textContent = `${lines} lines`;
}
