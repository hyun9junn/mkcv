import { app } from '../app.js';
import { preview } from '../preview.js';
import { sectionsState } from '../sections-state.js';
import { contactUI } from '../contact-ui.js';
import { templateUI } from '../templates.js';
import { SETTINGS_HELPERS as _SH } from '../settings-engine.js';

export function applyToToolbar(settings) {
  document.getElementById('density-group')?.querySelectorAll('button[data-value]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === settings.layout.density);
  });
  document.getElementById('font-scale-group')?.querySelectorAll('button[data-value]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === settings.layout.font_scale);
  });
  app.setState({
    density: settings.layout.density,
    font_scale: settings.layout.font_scale,
    link_display: settings.personal?.default_link_display ?? 'label',
    personal_fields: settings.personal?.fields ?? [],
  });
}

export function applyToContact(settings) {
  if (contactUI) contactUI.rebuild(settings);
}

export function applyTemplateSelection(settings, opts = {}) {
  const nextTemplate = settings?.template || _SH.DEFAULT_SETTINGS.template;
  const currentTemplate = app.state.template || _SH.DEFAULT_SETTINGS.template;
  if (nextTemplate === currentTemplate) return false;

  if (templateUI?.selectTemplate) {
    templateUI.selectTemplate(nextTemplate, {
      syncSettings: false,
      applyDefaults: false,
      refreshPreview: opts.refreshPreview,
      closeDropdown: false,
    });
    return true;
  }

  app.setState({ template: nextTemplate });
  return true;
}

export function refreshPreview() {
  if (preview && sectionsState) {
    preview.refresh(
      sectionsState.getOrderedFilteredYaml(app.state.yaml),
      app.state.template
    );
  }
}
