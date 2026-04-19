import pytest
from backend.renderers.markdown import MarkdownRenderer


def test_markdown_contains_name(sample_cv):
    output = MarkdownRenderer().render(sample_cv)
    assert "Jane Smith" in output


def test_markdown_contains_job_title(sample_cv):
    output = MarkdownRenderer().render(sample_cv)
    assert "Software Engineer" in output
    assert "Tech Co" in output


def test_markdown_contains_education(sample_cv):
    output = MarkdownRenderer().render(sample_cv)
    assert "B.S. Computer Science" in output
    assert "MIT" in output


def test_markdown_contains_highlights(sample_cv):
    output = MarkdownRenderer().render(sample_cv)
    assert "Built payment service" in output


def test_markdown_contains_skills(sample_cv):
    output = MarkdownRenderer().render(sample_cv)
    assert "Languages" in output
    assert "Python" in output


def test_markdown_skips_empty_experience(minimal_cv):
    output = MarkdownRenderer().render(minimal_cv)
    assert "## Work Experience" not in output


def test_markdown_skips_empty_summary(minimal_cv):
    output = MarkdownRenderer().render(minimal_cv)
    assert "## Summary" not in output


def test_markdown_skips_empty_skills(minimal_cv):
    output = MarkdownRenderer().render(minimal_cv)
    assert "## Skills" not in output
