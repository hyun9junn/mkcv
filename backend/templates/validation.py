"""Template validation: Jinja2 strict-render + xelatex compile.

Used at app startup (lifespan) and via POST /api/templates/{name}/validate.
Returns {'valid': bool, 'errors': list[str]}.
"""
from __future__ import annotations

from pathlib import Path

import jinja2

from backend.models import (
    CVData, PersonalInfo, ExperienceItem, EducationItem, SkillGroup,
    ProjectItem, CertificationItem, PublicationItem, LanguageItem,
    AwardItem, ExtracurricularItem, CustomSection, CustomBlock,
)
from backend.renderers.latex import (
    FONT_SIZE,
    build_layout_preamble,
    build_xelatex_preamble,
    make_contact_helpers,
    make_jinja_filters,
    make_link_text_fn,
)
from backend.services.pdf_compiler import compile_pdf_sync


_SAMPLE_CV = CVData(
    personal=PersonalInfo(name="Test User", email="test@example.com", phone="+1-000-0000", location="City, Country"),
    summary="A brief summary.",
    experience=[ExperienceItem(title="Engineer", company="Corp", start_date="2020", end_date="2023", highlights=["Did things"])],
    education=[EducationItem(degree="B.S. CS", institution="University", year="2020")],
    skills=[SkillGroup(category="Languages", items=["Python"])],
    projects=[ProjectItem(name="Project", description="A project", highlights=["Feature"])],
    certifications=[CertificationItem(name="Cert", issuer="Org", date="2022")],
    publications=[PublicationItem(title="Paper", venue="Journal", date="2023")],
    languages=[LanguageItem(language="English", proficiency="Native")],
    awards=[AwardItem(name="Award", issuer="Org", date="2023")],
    extracurricular=[ExtracurricularItem(title="Club", organization="Org", highlights=["Led team"])],
    custom_sections=[
        CustomSection(
            key="custom-sample",
            title="Sample Custom Section",
            content=[CustomBlock(type="bullets", items=["Item one", "Item two"])],
        )
    ],
)


def validate_template(name: str, templates_dir: Path) -> dict:
    """Two-stage check: strict Jinja2 render + xelatex compile.

    Returns {"valid": bool, "errors": list[str]}.

    This function is synchronous. Callers from async contexts should
    invoke via asyncio.to_thread.
    """
    # Stage 1: Jinja2 render with StrictUndefined
    try:
        env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(str(templates_dir / name)),
            block_start_string="<%",
            block_end_string="%>",
            variable_start_string="<<",
            variable_end_string=">>",
            comment_start_string="<#",
            comment_end_string="#>",
            trim_blocks=True,
            lstrip_blocks=True,
            undefined=jinja2.StrictUndefined,
        )
        env.filters.update(make_jinja_filters())
        env.globals['link_text'] = make_link_text_fn("label")
        _cv_fn, _cs_fn = make_contact_helpers([], "label")
        env.globals['contact_visible'] = _cv_fn
        env.globals['contact_link_style'] = _cs_fn
        template = env.get_template("cv.tex.j2")
        default_order = ["summary", "experience", "education", "skills", "projects", "certifications", "publications", "languages", "awards", "extracurricular", "custom-sample"]
        custom_by_key = {cs.key: cs for cs in _SAMPLE_CV.custom_sections}
        rendered = template.render(
            cv=_SAMPLE_CV,
            section_order=default_order,
            custom_by_key=custom_by_key,
            font_size=FONT_SIZE["normal"],
            layout_preamble=build_layout_preamble("balanced"),
            section_titles={},
            xelatex_preamble=build_xelatex_preamble(templates_dir, name),
        )
    except jinja2.TemplateSyntaxError as e:
        return {"valid": False, "errors": [f"Jinja2 syntax error: {e}"]}
    except jinja2.UndefinedError as e:
        return {"valid": False, "errors": [f"Jinja2 undefined variable: {e}"]}
    except Exception as e:
        return {"valid": False, "errors": [f"Jinja2 render error: {e}"]}

    # Stage 2: xelatex compilation
    _pdf_bytes, compile_err = compile_pdf_sync(rendered)
    if compile_err is not None:
        # Validation contract uses a different error shape than the API:
        return {"valid": False, "errors": compile_err["details"] or [compile_err["message"]]}

    return {"valid": True, "errors": []}
