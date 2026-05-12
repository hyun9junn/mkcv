"""LaTeX renderer subpackage.

Public surface — what external modules and tests should import.
"""
import jinja2  # noqa: F401 — kept so tests can monkeypatch backend.renderers.latex.jinja2

from backend.renderers.latex.helpers import (
    TemplateRenderBundle,
    get_template_render_bundle,
    make_contact_helpers,
    make_jinja_filters,
    make_link_text_fn,
)
from backend.renderers.latex.preamble import (
    DEFAULT_XELATEX_FONTS,
    DENSITY,
    FONT_SIZE,
    build_font_fallback_chain,
    build_layout_preamble,
    build_xelatex_preamble,
)
from backend.renderers.latex.renderer import (
    DEFAULT_SECTION_ORDER,
    DEFAULT_SECTION_TITLES,
    LaTeXRenderer,
)

__all__ = [
    "DEFAULT_SECTION_ORDER",
    "DEFAULT_SECTION_TITLES",
    "DEFAULT_XELATEX_FONTS",
    "DENSITY",
    "FONT_SIZE",
    "LaTeXRenderer",
    "TemplateRenderBundle",
    "build_font_fallback_chain",
    "build_layout_preamble",
    "build_xelatex_preamble",
    "get_template_render_bundle",
    "make_contact_helpers",
    "make_jinja_filters",
    "make_link_text_fn",
]
