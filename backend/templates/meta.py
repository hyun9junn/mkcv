"""Template metadata loading and normalization.

Single source of truth for parsing meta.yaml. Replaces the two prior loaders
(main.py:_load_template_meta and latex.py:_load_template_meta_data).
"""
from functools import lru_cache
from pathlib import Path

import yaml as _yaml

from backend.constants import (
    BUILTIN_SECTION_KEYS,
    FIELD_LINK_DISPLAYS,
    LINK_PERSONAL_KEYS,
    PERSONAL_FIELD_KEYS,
    VALID_DENSITIES,
    VALID_FONT_SCALES,
    VALID_LINK_DISPLAYS,
    VALID_SECTION_TITLE_CASES,
)


_DEFAULT_XELATEX_FONTS = {
    "hangul_main_fonts": ["Nanum Myeongjo", "UnBatang"],
    "hangul_sans_fonts": ["Nanum Gothic", "UnDotum"],
    "hangul_mono_fonts": ["Nanum Gothic", "UnDotum"],
}


def normalize_template_defaults(defaults: object) -> dict:
    """Validate the `defaults` block of meta.yaml.
    Returns the dict if valid, {} otherwise.
    """
    if not isinstance(defaults, dict):
        return {}

    layout = defaults.get("layout")
    personal = defaults.get("personal")
    sections = defaults.get("sections")
    if not isinstance(layout, dict) or not isinstance(personal, dict) or not isinstance(sections, list):
        return {}
    if layout.get("density") not in VALID_DENSITIES:
        return {}
    if layout.get("font_scale") not in VALID_FONT_SCALES:
        return {}
    if personal.get("default_link_display") not in VALID_LINK_DISPLAYS:
        return {}

    personal_fields = personal.get("fields")
    if not isinstance(personal_fields, list):
        return {}

    personal_keys = []
    for field in personal_fields:
        if not isinstance(field, dict):
            return {}
        key = field.get("key")
        if not isinstance(key, str):
            return {}
        if not isinstance(field.get("visible"), bool):
            return {}

        link_display = field.get("link_display")
        if key in LINK_PERSONAL_KEYS:
            if link_display not in FIELD_LINK_DISPLAYS:
                return {}
        elif link_display is not None:
            return {}

        personal_keys.append(key)

    if personal_keys != list(PERSONAL_FIELD_KEYS):
        return {}

    section_keys = []
    for section in sections:
        if not isinstance(section, dict):
            return {}
        key = section.get("key")
        if not isinstance(key, str):
            return {}
        if not isinstance(section.get("title"), str):
            return {}
        if not isinstance(section.get("visible"), bool):
            return {}
        if not section["title"].strip():
            return {}
        section_keys.append(key)

    if len(section_keys) != len(BUILTIN_SECTION_KEYS):
        return {}
    if set(section_keys) != BUILTIN_SECTION_KEYS:
        return {}

    return defaults


def normalize_template_ui(ui: object) -> dict:
    """Validate the `ui` block. Returns {'badge': str}."""
    if not isinstance(ui, dict):
        return {"badge": ""}

    badge = ui.get("badge")
    if not isinstance(badge, str):
        return {"badge": ""}

    badge = badge.strip()
    return {"badge": badge if badge else ""}


def normalize_template_render(render: object) -> dict:
    """Validate the `render` block. Returns {'section_title_case': str}."""
    if not isinstance(render, dict):
        return {"section_title_case": "title"}

    section_title_case = render.get("section_title_case")
    if section_title_case not in VALID_SECTION_TITLE_CASES:
        return {"section_title_case": "title"}

    return {"section_title_case": section_title_case}


def _normalize_font_list(value, default: list[str]) -> list[str]:
    """Internal helper for template_xelatex_fonts."""
    if not isinstance(value, list):
        return list(default)

    normalized = []
    for item in value:
        if isinstance(item, str) and item.strip():
            normalized.append(item.strip())

    return normalized or list(default)


@lru_cache(maxsize=None)
def load_template_meta(template_dir_str: str) -> dict:
    """Load and fully normalize meta.yaml for one template directory.

    Returns dict with keys: display_name, description, audience, ui, render, defaults.

    Cached by template_dir_str — pass `str(template_dir)`, not the Path itself
    (Path is unhashable in some configurations and we want a clean cache key).
    """
    template_dir = Path(template_dir_str)
    meta_path = template_dir / "meta.yaml"
    if not meta_path.exists():
        return {
            "display_name": template_dir.name.replace("-", " ").title(),
            "description": "",
            "audience": "",
            "ui": normalize_template_ui(None),
            "render": normalize_template_render(None),
            "_render_raw": {},
            "defaults": {},
        }
    try:
        with meta_path.open() as f:
            data = _yaml.safe_load(f) or {}
    except _yaml.YAMLError:
        data = {}
    if not isinstance(data, dict):
        data = {}
    raw_render = data.get("render")
    return {
        "display_name": data.get("display_name", template_dir.name),
        "description": data.get("description", ""),
        "audience": data.get("audience", ""),
        "ui": normalize_template_ui(data.get("ui")),
        "render": normalize_template_render(raw_render),
        "_render_raw": raw_render if isinstance(raw_render, dict) else {},
        "defaults": normalize_template_defaults(data.get("defaults")),
    }


def template_default_titles(meta: dict) -> dict[str, str]:
    """Extract per-section default titles for builtin sections from a normalized meta dict.

    The input is a dict already returned by `load_template_meta`; this function
    is a pure, non-cached projection. Replaces latex.py:_load_template_default_titles.
    """
    sections = meta.get("defaults", {}).get("sections", [])
    if not isinstance(sections, list):
        return {}
    titles: dict[str, str] = {}
    for section in sections:
        if not isinstance(section, dict):
            continue
        key = section.get("key")
        title = section.get("title")
        if key in BUILTIN_SECTION_KEYS and isinstance(title, str) and title.strip():
            titles[key] = title
    return titles


def template_render_config(meta: dict) -> dict:
    """Extract render config (e.g. section_title_case) from a normalized meta dict.

    Replaces latex.py:_load_template_render_config.
    """
    render = meta.get("render")
    if not isinstance(render, dict):
        return {"section_title_case": "title"}
    section_title_case = render.get("section_title_case")
    if section_title_case not in VALID_SECTION_TITLE_CASES:
        return {"section_title_case": "title"}
    return {"section_title_case": section_title_case}


def template_xelatex_fonts(meta: dict) -> dict[str, list[str]]:
    """Extract xelatex font fallback chains from a normalized meta dict.

    Replaces latex.py:_load_template_xelatex_font_config.
    """
    render = meta.get("_render_raw")
    if not isinstance(render, dict):
        render = {}
    xelatex = render.get("xelatex")
    if not isinstance(xelatex, dict):
        xelatex = {}
    return {
        key: _normalize_font_list(xelatex.get(key), default)
        for key, default in _DEFAULT_XELATEX_FONTS.items()
    }
