from pathlib import Path
from functools import lru_cache
from typing import Optional, List
import re
import jinja2
import yaml
from pydantic import BaseModel
from backend.models import CVData
from backend.models import CustomBlock, CustomSection
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
_BUILTIN_SECTION_KEYS = set(DEFAULT_SECTION_TITLES)
_TITLE_CASE_SMALL_WORDS = {
    "a",
    "an",
    "and",
    "as",
    "at",
    "but",
    "by",
    "for",
    "in",
    "nor",
    "of",
    "on",
    "or",
    "the",
    "to",
    "via",
    "with",
}
_VALID_SECTION_TITLE_CASES = {"upper", "lower", "title"}
_TITLE_WORD_RE = re.compile(r"[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?")
_DEFAULT_XELATEX_FONTS = {
    "hangul_main_fonts": ["Nanum Myeongjo", "UnBatang"],
    "hangul_sans_fonts": ["Nanum Gothic", "UnDotum"],
    "hangul_mono_fonts": ["Nanum Gothic", "UnDotum"],
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
_LATEX_ESCAPES = {
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
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


@lru_cache(maxsize=None)
def _load_template_meta_data(templates_dir: str, template: str) -> dict:
    meta_path = Path(templates_dir) / template / "meta.yaml"
    if not meta_path.exists():
        return {}

    try:
        data = yaml.safe_load(meta_path.read_text()) or {}
    except yaml.YAMLError:
        return {}

    if not isinstance(data, dict):
        return {}
    return data


@lru_cache(maxsize=None)
def _load_template_default_titles(templates_dir: str, template: str) -> dict[str, str]:
    data = _load_template_meta_data(templates_dir, template)

    sections = data.get("defaults", {}).get("sections", [])
    if not isinstance(sections, list):
        return {}

    titles = {}
    for section in sections:
        if not isinstance(section, dict):
            continue
        key = section.get("key")
        title = section.get("title")
        if key in _BUILTIN_SECTION_KEYS and isinstance(title, str) and title.strip():
            titles[key] = title
    return titles


@lru_cache(maxsize=None)
def _load_template_render_config(templates_dir: str, template: str) -> dict[str, str]:
    data = _load_template_meta_data(templates_dir, template)
    render = data.get("render")
    if not isinstance(render, dict):
        return {"section_title_case": "title"}

    section_title_case = render.get("section_title_case")
    if section_title_case not in _VALID_SECTION_TITLE_CASES:
        return {"section_title_case": "title"}

    return {"section_title_case": section_title_case}


def _normalize_font_list(value, default: list[str]) -> list[str]:
    if not isinstance(value, list):
        return list(default)

    normalized = []
    for item in value:
        if isinstance(item, str) and item.strip():
            normalized.append(item.strip())

    return normalized or list(default)


@lru_cache(maxsize=None)
def _load_template_xelatex_font_config(templates_dir: str, template: str) -> dict[str, list[str]]:
    data = _load_template_meta_data(templates_dir, template)
    render = data.get("render")
    if not isinstance(render, dict):
        render = {}

    xelatex = render.get("xelatex")
    if not isinstance(xelatex, dict):
        xelatex = {}

    return {
        key: _normalize_font_list(xelatex.get(key), default)
        for key, default in _DEFAULT_XELATEX_FONTS.items()
    }


def _build_font_fallback_chain(command: str, fonts: list[str], options: str = "") -> str:
    option_suffix = f"[{options}]" if options else ""
    lines: list[str] = []

    for index, font_name in enumerate(fonts):
        command_line = rf"\{command}{{{font_name}}}{option_suffix}"
        if index < len(fonts) - 1:
            lines.append(rf"\IfFontExistsTF{{{font_name}}}{{{command_line}}}{{%")
        else:
            lines.append(command_line)

    lines.extend("}" for _ in range(max(len(fonts) - 1, 0)))
    return "\n".join(lines)


def _escape_latex_text(value: str) -> str:
    pieces: list[str] = []
    index = 0

    while index < len(value):
        char = value[index]
        if char == "\\":
            next_char = value[index + 1] if index + 1 < len(value) else ""
            if next_char and next_char in _LATEX_ESCAPES:
                pieces.append("\\" + next_char)
                index += 2
                continue
            pieces.append(r"\textbackslash{}")
            index += 1
            continue

        replacement = _LATEX_ESCAPES.get(char)
        pieces.append(replacement if replacement is not None else char)
        index += 1

    return "".join(pieces)


def _should_preserve_model_field(model: BaseModel, field_name: str) -> bool:
    return (
        isinstance(model, CustomSection) and field_name == "key"
    ) or (
        isinstance(model, CustomBlock) and field_name == "type"
    )


def _sanitize_for_latex(value):
    if isinstance(value, str):
        return _escape_latex_text(value)

    if isinstance(value, list):
        return [_sanitize_for_latex(item) for item in value]

    if isinstance(value, tuple):
        return tuple(_sanitize_for_latex(item) for item in value)

    if isinstance(value, dict):
        return {key: _sanitize_for_latex(item) for key, item in value.items()}

    if isinstance(value, BaseModel):
        updates = {}
        for field_name in value.__class__.model_fields:
            field_value = getattr(value, field_name)
            if _should_preserve_model_field(value, field_name):
                updates[field_name] = field_value
            else:
                updates[field_name] = _sanitize_for_latex(field_value)

        sanitized = value.model_copy(update=updates, deep=True)

        if value.model_extra:
            sanitized.__pydantic_extra__ = {
                key: _sanitize_for_latex(item)
                for key, item in value.model_extra.items()
            }

        return sanitized

    return value


def _build_xelatex_preamble(templates_dir: Path, template: str) -> str:
    config = _load_template_xelatex_font_config(str(templates_dir), template)
    font_options = "AutoFakeSlant=0.2"

    return "\n".join([
        r"\usepackage{fontspec}",
        r"\usepackage{kotex}",
        r"\defaultfontfeatures{Ligatures=TeX}",
        _build_font_fallback_chain("setmainhangulfont", config["hangul_main_fonts"], font_options),
        _build_font_fallback_chain("setsanshangulfont", config["hangul_sans_fonts"], font_options),
        _build_font_fallback_chain("setmonohangulfont", config["hangul_mono_fonts"], font_options),
    ])


def _smart_title_case(text: str) -> str:
    matches = list(_TITLE_WORD_RE.finditer(text))
    if not matches:
        return text

    lower_text = text.lower()
    pieces = []
    last_index = 0
    last_word_index = len(matches) - 1

    for idx, match in enumerate(matches):
        start, end = match.span()
        word = lower_text[start:end]
        pieces.append(lower_text[last_index:start])

        if idx not in (0, last_word_index) and word in _TITLE_CASE_SMALL_WORDS:
            pieces.append(word)
        else:
            pieces.append(word[:1].upper() + word[1:])

        last_index = end

    pieces.append(lower_text[last_index:])
    return "".join(pieces)


def _transform_builtin_section_title(templates_dir: Path, template: str, title: str) -> str:
    policy = _load_template_render_config(str(templates_dir), template)["section_title_case"]
    if policy == "upper":
        return title.upper()
    if policy == "lower":
        return title.lower()
    return _smart_title_case(title)


def _prepare_section_titles(templates_dir: Path, template: str, section_titles: Optional[dict]) -> dict:
    merged = dict(_load_template_default_titles(str(templates_dir), template))
    if section_titles:
        merged.update(section_titles)

    prepared = {}
    for key, title in merged.items():
        if not isinstance(title, str):
            continue
        if key in _BUILTIN_SECTION_KEYS:
            prepared[key] = _escape_latex_text(
                _transform_builtin_section_title(templates_dir, template, title)
            )
        else:
            prepared[key] = _escape_latex_text(title)
    return prepared


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
        safe_cv = _sanitize_for_latex(cv)
        custom_by_key = {cs.key: cs for cs in safe_cv.custom_sections}
        font_size = _FONT_SIZE.get(self.font_scale, _FONT_SIZE["normal"])
        layout_preamble = _build_layout_preamble(self.density)
        titles = _prepare_section_titles(self.templates_dir, self.template, section_titles)
        xelatex_preamble = _build_xelatex_preamble(self.templates_dir, self.template)
        return env.get_template("cv.tex.j2").render(
            cv=safe_cv,
            section_order=order,
            custom_by_key=custom_by_key,
            font_size=font_size,
            layout_preamble=layout_preamble,
            section_titles=titles,
            xelatex_preamble=xelatex_preamble,
        )
