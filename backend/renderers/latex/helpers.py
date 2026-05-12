"""Jinja env factory and template-rendering helpers.

Public surface (no underscores):
- TemplateRenderBundle
- make_link_text_fn
- make_contact_helpers
- make_jinja_filters
- get_template_render_bundle
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

import jinja2


@dataclass(frozen=True)
class TemplateRenderBundle:
    env: jinja2.Environment
    template: jinja2.Template


def make_link_text_fn(link_display: str):
    def link_text(url: str, label: str, style: Optional[str] = None) -> str:
        s = style if style in ('label', 'url', 'both') else link_display
        if s == "url":
            return url
        elif s == "both":
            return f"{label} ({url})"
        return label
    return link_text


def make_contact_helpers(personal_fields: list, link_display: str):
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


def make_jinja_filters() -> dict:
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
def get_template_render_bundle(templates_dir: str, template: str) -> TemplateRenderBundle:
    env = jinja2.Environment(
        loader=jinja2.FileSystemLoader(str(Path(templates_dir) / template)),
        block_start_string="<%",
        block_end_string="%>",
        variable_start_string="<<",
        variable_end_string=">>",
        comment_start_string="<#",
        comment_end_string="#>",
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters.update(make_jinja_filters())
    return TemplateRenderBundle(
        env=env,
        template=env.get_template("cv.tex.j2"),
    )
