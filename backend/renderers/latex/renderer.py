"""LaTeX rendering: the LaTeXRenderer class and its private helpers.

Private to this module:
- _escape_latex_text
- _sanitize_for_latex
- _smart_title_case
- _transform_builtin_section_title
- _prepare_section_titles
- _should_preserve_model_field
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Optional, List

from pydantic import BaseModel

from backend.constants import BUILTIN_SECTION_KEYS
from backend.models import CVData, CustomBlock, CustomSection
from backend.renderers.base import BaseRenderer
from backend.renderers.latex.helpers import (
    get_template_render_bundle,
    make_contact_helpers,
    make_link_text_fn,
)
from backend.renderers.latex.preamble import (
    FONT_SIZE,
    build_layout_preamble,
    build_xelatex_preamble,
)
from backend.templates.meta import (
    load_template_meta,
    template_default_titles,
    template_render_config,
)


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

_TITLE_CASE_SMALL_WORDS = {
    "a", "an", "and", "as", "at", "but", "by", "for", "in", "nor",
    "of", "on", "or", "the", "to", "via", "with",
}
_TITLE_WORD_RE = re.compile(r"[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?")
_LATEX_ESCAPES = {
    "&": r"\&", "%": r"\%", "$": r"\$", "#": r"\#", "_": r"\_",
    "{": r"\{", "}": r"\}", "~": r"\textasciitilde{}", "^": r"\textasciicircum{}",
}


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
    policy = template_render_config(load_template_meta(str(Path(templates_dir) / template)))["section_title_case"]
    if policy == "upper":
        return title.upper()
    if policy == "lower":
        return title.lower()
    return _smart_title_case(title)


def _prepare_section_titles(templates_dir: Path, template: str, section_titles: Optional[dict]) -> dict:
    merged = dict(template_default_titles(load_template_meta(str(Path(templates_dir) / template))))
    if section_titles:
        merged.update(section_titles)

    prepared = {}
    for key, title in merged.items():
        if not isinstance(title, str):
            continue
        if key in BUILTIN_SECTION_KEYS:
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

        bundle = get_template_render_bundle(str(self.templates_dir), self.template)
        link_text = make_link_text_fn(self.link_display)
        contact_visible, contact_link_style = make_contact_helpers(
            self.personal_fields, self.link_display
        )
        order = section_order if section_order else DEFAULT_SECTION_ORDER
        safe_cv = _sanitize_for_latex(cv)
        custom_by_key = {cs.key: cs for cs in safe_cv.custom_sections}
        font_size = FONT_SIZE.get(self.font_scale, FONT_SIZE["normal"])
        layout_preamble = build_layout_preamble(self.density)
        titles = _prepare_section_titles(self.templates_dir, self.template, section_titles)
        xelatex_preamble = build_xelatex_preamble(self.templates_dir, self.template)
        return bundle.template.render(
            cv=safe_cv,
            section_order=order,
            custom_by_key=custom_by_key,
            font_size=font_size,
            layout_preamble=layout_preamble,
            section_titles=titles,
            xelatex_preamble=xelatex_preamble,
            link_text=link_text,
            contact_visible=contact_visible,
            contact_link_style=contact_link_style,
        )
