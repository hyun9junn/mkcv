import pytest
from pathlib import Path
from backend.renderers.latex import LaTeXRenderer

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
