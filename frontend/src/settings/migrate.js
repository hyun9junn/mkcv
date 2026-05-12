export function migrate(_SH) {
  const FLAG = 'mkcv_migrated_to_settings_yaml';

  if (!localStorage.getItem('mkcv:default:settings.yaml') && localStorage.getItem('mkcv_settings_yaml')) {
    try {
      localStorage.setItem('mkcv:default:settings.yaml', localStorage.getItem('mkcv_settings_yaml'));
      localStorage.removeItem('mkcv_settings_yaml');
    } catch {}
  }

  if (localStorage.getItem(FLAG)) return null;
  let migrated = false;
  const next   = JSON.parse(JSON.stringify(_SH.DEFAULT_SETTINGS));

  const density = localStorage.getItem('mkcv_density');
  if (density && _SH.VALID_DENSITY.includes(density)) { next.layout.density = density; migrated = true; }

  const font = localStorage.getItem('mkcv_font_scale');
  if (font && _SH.VALID_FONT.includes(font)) { next.layout.font_scale = font; migrated = true; }

  try {
    const raw = localStorage.getItem('mkcv_sections_state');
    if (raw) {
      const ss        = JSON.parse(raw);
      const order     = Array.isArray(ss?.order)  ? ss.order  : null;
      const hiddenArr = Array.isArray(ss?.hidden) ? ss.hidden : [];
      if (order) {
        next.sections = order
          .filter(k => _SH.KNOWN_KEYS.has(k))
          .map(k => ({
            key:     k,
            title:   _SH.SECTION_CATALOG.find(s => s.key === k)?.defaultTitle ?? k.toUpperCase(),
            visible: !hiddenArr.includes(k),
          }));
        migrated = true;
      }
    }
  } catch {}

  localStorage.setItem(FLAG, '1');
  ['mkcv_density', 'mkcv_font_scale', 'mkcv_sections_state'].forEach(k => localStorage.removeItem(k));
  return migrated ? next : null;
}
