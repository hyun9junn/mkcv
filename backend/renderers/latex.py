from pathlib import Path
from typing import Optional, List
import jinja2
from backend.models import CVData
from backend.renderers.base import BaseRenderer

DEFAULT_SECTION_ORDER = [
    "summary", "experience", "education", "skills", "projects",
    "certifications", "publications", "languages", "awards", "extracurricular",
]

DEFAULT_SECTION_TITLES = {
    "summary":        "Summary",
    "experience":     "Experience",
    "education":      "Education",
    "skills":         "Skills",
    "projects":       "Projects",
    "certifications": "Certifications",
    "publications":   "Publications",
    "languages":      "Languages",
    "awards":         "Awards",
    "extracurricular":"Extracurricular Activities",
}

_FONT_SIZE = {
    "small":  "10pt",
    "normal": "11pt",
    "large":  "12pt",
}

_DENSITY = {
    "comfortable": {"vgap": "8pt",  "secbefore": "14pt", "secafter": "7pt",  "itembefore": "4pt"},
    "balanced":    {"vgap": "4pt",  "secbefore": "12pt", "secafter": "6pt",  "itembefore": "2pt"},
    "compact":     {"vgap": "2pt",  "secbefore": "8pt",  "secafter": "4pt",  "itembefore": "1pt"},
}


def _build_layout_preamble(density: str) -> str:
    d = _DENSITY.get(density, _DENSITY["balanced"])
    return (
        f"\\newcommand{{\\cvvgap}}{{{d['vgap']}}}\n"
        f"\\newcommand{{\\cvsecbefore}}{{{d['secbefore']}}}\n"
        f"\\newcommand{{\\cvsecafter}}{{{d['secafter']}}}\n"
        f"\\newcommand{{\\cvitembefore}}{{{d['itembefore']}}}"
    )


def _make_link_text_fn(link_display: str):
    def link_text(url: str, label: str, style: Optional[str] = None) -> str:
        s = style if style in ('label', 'url', 'both') else link_display
        if s == "url":
            return url
        elif s == "both":
            return f"{label} ({url})"
        return label
    return link_text


def _make_contact_helpers(personal_fields: list, link_display: str):
    field_map = {
        f['key']: f
        for f in personal_fields
        if isinstance(f, dict) and 'key' in f
    }

    def contact_visible(key: str) -> bool:
        if key == 'name':
            return True
        return field_map.get(key, {}).get('visible', True)

    def contact_link_style(key: str) -> str:
        override = field_map.get(key, {}).get('link_display')
        if override in ('label', 'url', 'both'):
            return override
        return link_display

    return contact_visible, contact_link_style


def _make_jinja_filters() -> dict:
    def name_size(name: str) -> str:
        n = len(name.strip())
        if n <= 22:
            return r'\Huge\bfseries'
        if n <= 30:
            return r'\LARGE\bfseries'
        return r'\Large\bfseries'

    def name_fontsize(name: str, normal_pt: float = 26.0, skip_ratio: float = 1.15) -> str:
        n = len(name.strip())
        if n <= 22:
            pt = normal_pt
        elif n <= 30:
            pt = normal_pt - 3
        else:
            pt = normal_pt - 5
        skip = round(pt * skip_ratio, 1)
        return rf'\fontsize{{{pt:g}pt}}{{{skip:g}pt}}\selectfont'

    def shrink_if_long(text: str, threshold: int = 48) -> str:
        return r'\small ' if len(text.strip()) > threshold else ''

    return {
        'name_size': name_size,
        'name_fontsize': name_fontsize,
        'shrink_if_long': shrink_if_long,
    }


class LaTeXRenderer(BaseRenderer):
    def __init__(
        self,
        templates_dir: Path,
        template: str = "classic",
        density: str = "balanced",
        font_scale: str = "normal",
        link_display: str = "label",
        personal_fields: Optional[List] = None,
    ):
        self.templates_dir = templates_dir
        self.template = template
        self.density = density
        self.font_scale = font_scale
        self.link_display = link_display
        self.personal_fields = personal_fields or []

    def render(self, cv: CVData, section_order: Optional[List[str]] = None, section_titles: Optional[dict] = None) -> str:
        template_path = self.templates_dir / self.template / "cv.tex.j2"
        if not template_path.exists():
            raise ValueError(f"unknown_template: '{self.template}' not found")

        env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(str(self.templates_dir / self.template)),
            block_start_string="<%",
            block_end_string="%>",
            variable_start_string="<<",
            variable_end_string=">>",
            comment_start_string="<#",
            comment_end_string="#>",
            trim_blocks=True,
            lstrip_blocks=True,
        )
        env.filters.update(_make_jinja_filters())
        env.globals['link_text'] = _make_link_text_fn(self.link_display)
        contact_visible, contact_link_style = _make_contact_helpers(
            self.personal_fields, self.link_display
        )
        env.globals['contact_visible'] = contact_visible
        env.globals['contact_link_style'] = contact_link_style
        order = section_order if section_order else DEFAULT_SECTION_ORDER
        custom_by_key = {cs.key: cs for cs in cv.custom_sections}
        font_size = _FONT_SIZE.get(self.font_scale, _FONT_SIZE["normal"])
        layout_preamble = _build_layout_preamble(self.density)
        titles = section_titles or {}
        return env.get_template("cv.tex.j2").render(
            cv=cv,
            section_order=order,
            custom_by_key=custom_by_key,
            font_size=font_size,
            layout_preamble=layout_preamble,
            section_titles=titles,
        )
