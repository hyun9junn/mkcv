import pytest
from pathlib import Path
from backend.renderers.latex import LaTeXRenderer
from backend.models import AwardItem, ExtracurricularItem

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
