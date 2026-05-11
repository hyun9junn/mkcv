"""LaTeX preamble builders and per-density / per-font-scale constants.

Public surface (no underscores):
- FONT_SIZE
- DENSITY
- DEFAULT_XELATEX_FONTS
- build_layout_preamble
- build_font_fallback_chain
- build_xelatex_preamble
"""
from __future__ import annotations

from pathlib import Path

from backend.templates.meta import load_template_meta, template_xelatex_fonts


FONT_SIZE = {
    "small":  "10pt",
    "normal": "11pt",
    "large":  "12pt",
}

DENSITY = {
    "comfortable": {"vgap": "8pt",  "secbefore": "14pt", "secafter": "7pt",  "itembefore": "4pt"},
    "balanced":    {"vgap": "4pt",  "secbefore": "12pt", "secafter": "6pt",  "itembefore": "2pt"},
    "compact":     {"vgap": "2pt",  "secbefore": "8pt",  "secafter": "4pt",  "itembefore": "1pt"},
}

DEFAULT_XELATEX_FONTS = {
    "hangul_main_fonts": ["Nanum Myeongjo", "UnBatang"],
    "hangul_sans_fonts": ["Nanum Gothic", "UnDotum"],
    "hangul_mono_fonts": ["Nanum Gothic", "UnDotum"],
}


def build_layout_preamble(density: str) -> str:
    d = DENSITY.get(density, DENSITY["balanced"])
    return (
        f"\\newcommand{{\\cvvgap}}{{{d['vgap']}}}\n"
        f"\\newcommand{{\\cvsecbefore}}{{{d['secbefore']}}}\n"
        f"\\newcommand{{\\cvsecafter}}{{{d['secafter']}}}\n"
        f"\\newcommand{{\\cvitembefore}}{{{d['itembefore']}}}"
    )


def build_font_fallback_chain(command: str, fonts: list[str], options: str = "") -> str:
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


def build_xelatex_preamble(templates_dir: Path, template: str) -> str:
    config = template_xelatex_fonts(load_template_meta(str(Path(templates_dir) / template)))
    font_options = "AutoFakeSlant=0.2"
    return "\n".join([
        r"\usepackage{fontspec}",
        r"\usepackage{kotex}",
        r"\defaultfontfeatures{Ligatures=TeX}",
        build_font_fallback_chain("setmainhangulfont", config["hangul_main_fonts"], font_options),
        build_font_fallback_chain("setsanshangulfont", config["hangul_sans_fonts"], font_options),
        build_font_fallback_chain("setmonohangulfont", config["hangul_mono_fonts"], font_options),
    ])
