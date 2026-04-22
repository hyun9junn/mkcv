from pathlib import Path
from typing import Optional, List
import jinja2
from backend.models import CVData
from backend.renderers.base import BaseRenderer

DEFAULT_SECTION_ORDER = [
    "summary", "experience", "education", "skills", "projects",
    "certifications", "publications", "languages", "awards", "extracurricular",
]

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
    ):
        self.templates_dir = templates_dir
        self.template = template
        self.density = density
        self.font_scale = font_scale

    def render(self, cv: CVData, section_order: Optional[List[str]] = None) -> str:
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
        order = section_order if section_order else DEFAULT_SECTION_ORDER
        custom_by_key = {cs.key: cs for cs in cv.custom_sections}
        font_size = _FONT_SIZE.get(self.font_scale, _FONT_SIZE["normal"])
        layout_preamble = _build_layout_preamble(self.density)
        return env.get_template("cv.tex.j2").render(
            cv=cv,
            section_order=order,
            custom_by_key=custom_by_key,
            font_size=font_size,
            layout_preamble=layout_preamble,
        )
