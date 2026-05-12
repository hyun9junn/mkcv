export const app = {
  state: {
    yaml: "",
    template: "classic",
    density: "balanced",
    font_scale: "normal",
    link_display: "label",
    personal_fields: [],
    lang: typeof localStorage !== 'undefined' ? (localStorage.getItem('mkcv_lang') || 'ko') : 'ko',
  },
  setState(patch) {
    Object.assign(this.state, patch);
  },
  setLang(lang) {
    this.state.lang = lang;
    localStorage.setItem('mkcv_lang', lang);
    document.documentElement.lang = lang;
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
  },
};
