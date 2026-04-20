from pathlib import Path
from typing import Optional, List
import jinja2
from backend.models import CVData
from backend.renderers.base import BaseRenderer

DEFAULT_SECTION_ORDER = ["summary", "experience", "education", "skills", "projects", "certifications", "publications", "languages", "awards", "extracurricular"]


class LaTeXRenderer(BaseRenderer):
    def __init__(self, templates_dir: Path, template: str = "classic"):
        self.templates_dir = templates_dir
        self.template = template

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
        return env.get_template("cv.tex.j2").render(cv=cv, section_order=order)
