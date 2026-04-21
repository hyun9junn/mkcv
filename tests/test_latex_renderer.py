import pytest
from pathlib import Path
from backend.renderers.latex import LaTeXRenderer, _build_layout_preamble, _FONT_SIZE
from backend.models import AwardItem, ExtracurricularItem, CVData, PersonalInfo

TEMPLATES_DIR = Path("backend/templates")


def test_latex_contains_name(sample_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(sample_cv)
    assert "Jane Smith" in output


def test_latex_contains_job_title(sample_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(sample_cv)
    assert "Software Engineer" in output
    assert "Tech Co" in output


def test_latex_contains_education(sample_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(sample_cv)
    assert "B.S. Computer Science" in output
    assert "MIT" in output


def test_latex_contains_highlights(sample_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(sample_cv)
    assert "Built payment service" in output


def test_latex_skips_empty_experience(minimal_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(minimal_cv)
    assert "Experience" not in output


def test_latex_skips_empty_summary(minimal_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(minimal_cv)
    assert "Summary" not in output


def test_latex_unknown_template_raises(sample_cv):
    with pytest.raises(ValueError, match="unknown_template"):
        LaTeXRenderer(TEMPLATES_DIR, template="nonexistent").render(sample_cv)


def test_classic_latex_renders_awards(sample_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(sample_cv)
    assert r"\section{Awards}" in output
    assert "Best Paper Award" in output
    assert "ICML" in output


def test_classic_latex_renders_extracurricular(sample_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(sample_cv)
    assert r"\section{Extracurricular Activities}" in output
    assert "Chess Club" in output
    assert "Won championship" in output


def test_classic_latex_skips_empty_awards(minimal_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(minimal_cv)
    assert "Awards" not in output


def test_classic_latex_skips_empty_extracurricular(minimal_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(minimal_cv)
    assert "Extracurricular" not in output


def test_classic_latex_renders_custom_section_bullets(sample_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(
        sample_cv, section_order=["talks"]
    )
    assert r"\section{Selected Talks}" in output
    assert "NeurIPS 2024: Efficient Quantization" in output

def test_classic_latex_renders_custom_section_text():
    from backend.models import CVData, PersonalInfo, CustomSection, CustomBlock
    cv = CVData(
        personal=PersonalInfo(name="Test", email="t@t.com"),
        custom_sections=[
            CustomSection(
                key="bio",
                title="Biography",
                content=[CustomBlock(type="text", value="A short bio paragraph.")],
            )
        ],
    )
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(cv, section_order=["bio"])
    assert r"\section{Biography}" in output
    assert "A short bio paragraph." in output

def test_classic_latex_renders_custom_section_kv():
    from backend.models import CVData, PersonalInfo, CustomSection, CustomBlock
    cv = CVData(
        personal=PersonalInfo(name="Test", email="t@t.com"),
        custom_sections=[
            CustomSection(
                key="service",
                title="Academic Service",
                content=[CustomBlock(type="kv", pairs=[{"key": "Reviewer", "value": "NeurIPS"}])],
            )
        ],
    )
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(cv, section_order=["service"])
    assert r"\section{Academic Service}" in output
    assert "Reviewer" in output
    assert "NeurIPS" in output

def test_classic_latex_skips_custom_section_not_in_order(sample_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(
        sample_cv, section_order=["summary"]
    )
    assert "Selected Talks" not in output


def _minimal_cv():
    return CVData(personal=PersonalInfo(name="Test User", email="t@t.com"))


def test_font_size_map():
    assert _FONT_SIZE["small"] == "10pt"
    assert _FONT_SIZE["normal"] == "11pt"
    assert _FONT_SIZE["large"] == "12pt"


def test_layout_preamble_balanced():
    p = _build_layout_preamble("balanced")
    assert "\\newcommand{\\cvvgap}{4pt}" in p
    assert "\\newcommand{\\cvsecbefore}{12pt}" in p
    assert "\\newcommand{\\cvsecafter}{6pt}" in p
    assert "\\newcommand{\\cvitembefore}{2pt}" in p


def test_layout_preamble_compact():
    p = _build_layout_preamble("compact")
    assert "\\newcommand{\\cvvgap}{2pt}" in p
    assert "\\newcommand{\\cvsecbefore}{8pt}" in p
    assert "\\newcommand{\\cvsecafter}{4pt}" in p
    assert "\\newcommand{\\cvitembefore}{1pt}" in p


def test_layout_preamble_comfortable():
    p = _build_layout_preamble("comfortable")
    assert "\\newcommand{\\cvvgap}{8pt}" in p
    assert "\\newcommand{\\cvsecbefore}{14pt}" in p
    assert "\\newcommand{\\cvsecafter}{7pt}" in p
    assert "\\newcommand{\\cvitembefore}{4pt}" in p


def test_layout_preamble_unknown_falls_back_to_balanced():
    p = _build_layout_preamble("airy")
    assert "\\newcommand{\\cvvgap}{4pt}" in p


def test_renderer_passes_layout_vars_to_template(tmp_path):
    tmpl_dir = tmp_path / "mini"
    tmpl_dir.mkdir()
    (tmpl_dir / "cv.tex.j2").write_text(
        "\\documentclass[<< font_size >>]{article}\n"
        "<< layout_preamble >>\n"
        "\\begin{document}hello\\end{document}"
    )
    renderer = LaTeXRenderer(tmp_path, template="mini", density="compact", font_scale="small")
    result = renderer.render(_minimal_cv())
    assert "\\documentclass[10pt]{article}" in result
    assert "\\newcommand{\\cvvgap}{2pt}" in result


def test_renderer_unknown_font_scale_falls_back(tmp_path):
    tmpl_dir = tmp_path / "mini"
    tmpl_dir.mkdir()
    (tmpl_dir / "cv.tex.j2").write_text(
        "\\documentclass[<< font_size >>]{article}\n"
        "<< layout_preamble >>\n"
        "\\begin{document}hello\\end{document}"
    )
    renderer = LaTeXRenderer(tmp_path, template="mini", font_scale="huge")
    result = renderer.render(_minimal_cv())
    assert "\\documentclass[11pt]{article}" in result
