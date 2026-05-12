"""CLI entry point for mkcv backend tools.

Usage:
    python -m backend validate [<slug>]    # validate one template or all
    python -m backend thumbnails [<slug>]  # generate PNG preview thumbnails
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

TEMPLATES_DIR = Path(__file__).parent / "templates"
PREVIEWS_DIR = Path(__file__).parent.parent / "frontend" / "assets" / "template-previews"


def _all_template_slugs() -> list[str]:
    return sorted(
        d.name for d in TEMPLATES_DIR.iterdir()
        if d.is_dir() and (d / "cv.tex.j2").exists()
    )


def _cmd_validate(args: argparse.Namespace) -> int:
    from backend.templates.validation import validate_template

    slugs = [args.slug] if args.slug else _all_template_slugs()
    if not slugs:
        print("No templates found in", TEMPLATES_DIR)
        return 1

    any_fail = False
    col = max(len(s) for s in slugs)
    for slug in slugs:
        result = validate_template(slug, TEMPLATES_DIR)
        status = "PASS" if result["valid"] else "FAIL"
        print(f"  {slug:<{col}}  {status}")
        if not result["valid"]:
            any_fail = True
            for err in result.get("errors", []):
                print(f"    {err}")

    return 1 if any_fail else 0


def _render_template_pdf(slug: str) -> bytes | None:
    """Render a template to PDF bytes using the validation pipeline."""
    import jinja2

    from backend.models import (
        CVData, PersonalInfo, ExperienceItem, EducationItem, SkillGroup,
        ProjectItem, CertificationItem, PublicationItem, LanguageItem,
        AwardItem, ExtracurricularItem, CustomSection, CustomBlock,
    )
    from backend.renderers.latex import (
        FONT_SIZE, build_layout_preamble, build_xelatex_preamble,
        make_contact_helpers, make_jinja_filters, make_link_text_fn,
    )
    from backend.services.pdf_compiler import compile_pdf_sync

    sample_cv = CVData(
        personal=PersonalInfo(name="Jane Smith", email="jane@example.com", phone="+1-555-0100", location="City, State"),
        summary="A brief professional summary.",
        experience=[ExperienceItem(title="Software Engineer", company="Acme Corp", start_date="2020", end_date="2024", highlights=["Built features"])],
        education=[EducationItem(degree="B.S. Computer Science", institution="State University", year="2020")],
        skills=[SkillGroup(category="Languages", items=["Python", "JavaScript"])],
        projects=[ProjectItem(name="Open Source Project", description="A useful tool", highlights=["1k stars"])],
        certifications=[CertificationItem(name="AWS Certified", issuer="Amazon", date="2023")],
        publications=[PublicationItem(title="Research Paper", venue="Conference", date="2023")],
        languages=[LanguageItem(language="English", proficiency="Native")],
        awards=[AwardItem(name="Best Paper", issuer="Org", date="2023")],
        extracurricular=[ExtracurricularItem(title="Volunteer", organization="Org", highlights=["Led team"])],
        custom_sections=[CustomSection(
            key="custom-sample", title="Sample Section",
            content=[CustomBlock(type="bullets", items=["Item one", "Item two"])],
        )],
    )

    try:
        env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(str(TEMPLATES_DIR / slug)),
            block_start_string="<%", block_end_string="%>",
            variable_start_string="<<", variable_end_string=">>",
            comment_start_string="<#", comment_end_string="#>",
            trim_blocks=True, lstrip_blocks=True,
            undefined=jinja2.StrictUndefined,
        )
        env.filters.update(make_jinja_filters())
        env.globals["link_text"] = make_link_text_fn("label")
        _cv_fn, _cs_fn = make_contact_helpers([], "label")
        env.globals["contact_visible"] = _cv_fn
        env.globals["contact_link_style"] = _cs_fn
        template = env.get_template("cv.tex.j2")
        section_order = ["summary", "experience", "education", "skills", "projects",
                         "certifications", "publications", "languages", "awards",
                         "extracurricular", "custom-sample"]
        custom_by_key = {cs.key: cs for cs in sample_cv.custom_sections}
        rendered = template.render(
            cv=sample_cv,
            section_order=section_order,
            custom_by_key=custom_by_key,
            font_size=FONT_SIZE["normal"],
            layout_preamble=build_layout_preamble("balanced"),
            section_titles={},
            xelatex_preamble=build_xelatex_preamble(TEMPLATES_DIR, slug),
        )
    except Exception as e:
        print(f"  Jinja2 render error: {e}")
        return None

    pdf_bytes, err = compile_pdf_sync(rendered)
    if err:
        print(f"  xelatex error: {err.get('message', 'unknown error')}")
        return None
    return pdf_bytes


def _cmd_thumbnails(args: argparse.Namespace) -> int:
    try:
        from pdf2image import convert_from_bytes
    except ImportError:
        print("pdf2image is not installed. To generate thumbnails, run:")
        print("  pip install pdf2image")
        print("  # also requires poppler: brew install poppler  (macOS)")
        print("  #                        apt-get install poppler-utils  (Linux)")
        return 0

    slugs = [args.slug] if args.slug else _all_template_slugs()
    if not slugs:
        print("No templates found in", TEMPLATES_DIR)
        return 1

    PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)
    any_fail = False
    col = max(len(s) for s in slugs)
    for slug in slugs:
        print(f"  {slug:<{col}}  ", end="", flush=True)
        pdf_bytes = _render_template_pdf(slug)
        if pdf_bytes is None:
            print("FAIL")
            any_fail = True
            continue
        try:
            images = convert_from_bytes(pdf_bytes, first_page=1, last_page=1, dpi=150)
            out_path = PREVIEWS_DIR / f"{slug}.png"
            images[0].save(str(out_path), "PNG")
            print(f"OK  →  {out_path}")
        except Exception as e:
            print(f"FAIL  ({e})")
            any_fail = True

    return 1 if any_fail else 0


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="python -m backend",
        description="mkcv backend CLI tools",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    val_p = sub.add_parser("validate", help="Validate templates (Jinja2 render + xelatex compile)")
    val_p.add_argument("slug", nargs="?", default=None, help="Template slug; omit to validate all")

    thumb_p = sub.add_parser("thumbnails", help="Generate PNG preview thumbnails")
    thumb_p.add_argument("slug", nargs="?", default=None, help="Template slug; omit to generate all")

    args = parser.parse_args()
    if args.command == "validate":
        return _cmd_validate(args)
    if args.command == "thumbnails":
        return _cmd_thumbnails(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
