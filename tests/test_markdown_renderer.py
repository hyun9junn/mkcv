import pytest
from backend.renderers.markdown import MarkdownRenderer
from backend.models import AwardItem, ExtracurricularItem


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


def test_markdown_renders_awards_section(sample_cv):
    output = MarkdownRenderer().render(sample_cv)
    assert "## Awards" in output
    assert "Best Paper Award" in output
    assert "ICML" in output


def test_markdown_renders_extracurricular_section(sample_cv):
    output = MarkdownRenderer().render(sample_cv)
    assert "## Extracurricular Activities" in output
    assert "Chess Club" in output
    assert "Won championship" in output


def test_markdown_skips_empty_awards(minimal_cv):
    output = MarkdownRenderer().render(minimal_cv)
    assert "## Awards" not in output


def test_markdown_skips_empty_extracurricular(minimal_cv):
    output = MarkdownRenderer().render(minimal_cv)
    assert "## Extracurricular Activities" not in output


def test_markdown_award_without_optional_fields():
    from backend.models import CVData, PersonalInfo
    cv = CVData(
        personal=PersonalInfo(name="Test", email="t@t.com"),
        awards=[AwardItem(name="Solo Award")],
    )
    output = MarkdownRenderer().render(cv)
    assert "Solo Award" in output


def test_markdown_extracurricular_without_highlights():
    from backend.models import CVData, PersonalInfo
    cv = CVData(
        personal=PersonalInfo(name="Test", email="t@t.com"),
        extracurricular=[ExtracurricularItem(title="Running Club", organization="SNU")],
    )
    output = MarkdownRenderer().render(cv)
    assert "Running Club" in output
    assert "SNU" in output


def test_markdown_award_with_description():
    from backend.models import CVData, PersonalInfo
    cv = CVData(
        personal=PersonalInfo(name="Test", email="t@t.com"),
        awards=[AwardItem(name="Award", description="Awarded for excellence.")],
    )
    output = MarkdownRenderer().render(cv)
    assert "Awarded for excellence." in output


def test_markdown_renders_custom_section_bullets(sample_cv):
    output = MarkdownRenderer().render(sample_cv, section_order=["talks"])
    assert "## Selected Talks" in output
    assert "- NeurIPS 2024: Efficient Quantization" in output

def test_markdown_renders_custom_section_text():
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
    output = MarkdownRenderer().render(cv, section_order=["bio"])
    assert "## Biography" in output
    assert "A short bio paragraph." in output

def test_markdown_renders_custom_section_kv():
    from backend.models import CVData, PersonalInfo, CustomSection, CustomBlock
    cv = CVData(
        personal=PersonalInfo(name="Test", email="t@t.com"),
        custom_sections=[
            CustomSection(
                key="service",
                title="Academic Service",
                content=[CustomBlock(type="kv", pairs=[{"key": "Reviewer", "value": "NeurIPS, ICML"}])],
            )
        ],
    )
    output = MarkdownRenderer().render(cv, section_order=["service"])
    assert "## Academic Service" in output
    assert "**Reviewer:**" in output
    assert "NeurIPS, ICML" in output

def test_markdown_skips_custom_section_not_in_order(sample_cv):
    output = MarkdownRenderer().render(sample_cv, section_order=["summary"])
    assert "Selected Talks" not in output

def test_markdown_custom_section_unknown_block_type_skipped():
    from backend.models import CVData, PersonalInfo, CustomSection, CustomBlock
    cv = CVData(
        personal=PersonalInfo(name="Test", email="t@t.com"),
        custom_sections=[
            CustomSection(
                key="misc",
                title="Misc",
                content=[CustomBlock(type="unknown_type")],
            )
        ],
    )
    output = MarkdownRenderer().render(cv, section_order=["misc"])
    assert "## Misc" in output  # section header still renders
