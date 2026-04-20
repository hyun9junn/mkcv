import pytest
from pydantic import ValidationError
from backend.models import (
    CVData, PersonalInfo, ExperienceItem, EducationItem,
    SkillGroup, ProjectItem, CertificationItem, PublicationItem, LanguageItem,
    AwardItem, ExtracurricularItem,
)

def test_personal_info_requires_name_and_email():
    with pytest.raises(ValidationError):
        PersonalInfo(name="Alice")  # missing email

def test_personal_info_optional_fields():
    p = PersonalInfo(name="Alice", email="alice@example.com")
    assert p.phone is None
    assert p.linkedin is None
    assert p.github is None
    assert p.location is None
    assert p.website is None

def test_cvdata_requires_personal():
    with pytest.raises(ValidationError):
        CVData()

def test_cvdata_all_sections_optional(minimal_cv):
    assert minimal_cv.experience == []
    assert minimal_cv.summary is None
    assert minimal_cv.skills == []

def test_cvdata_full(sample_cv):
    assert sample_cv.personal.name == "Jane Smith"
    assert len(sample_cv.experience) == 1
    assert sample_cv.experience[0].title == "Software Engineer"

def test_experience_end_date_optional():
    item = ExperienceItem(title="Dev", company="Corp", start_date="2020")
    assert item.end_date is None
    assert item.highlights == []

def test_skill_group():
    sg = SkillGroup(category="Languages", items=["Python", "Go"])
    assert sg.items == ["Python", "Go"]

def test_experience_requires_title_company_start_date():
    with pytest.raises(ValidationError):
        ExperienceItem(company="Corp", start_date="2020")  # missing title

def test_education_requires_degree_institution_year():
    with pytest.raises(ValidationError):
        EducationItem(institution="MIT", year="2020")  # missing degree

def test_project_requires_name_and_description():
    with pytest.raises(ValidationError):
        ProjectItem(name="Tool")  # missing description

def test_cvdata_model_dump_includes_all_sections(sample_cv):
    data = sample_cv.model_dump()
    for section in ["personal", "summary", "experience", "education", "skills", "projects", "certifications", "publications", "languages", "awards", "extracurricular"]:
        assert section in data


def test_award_item_required_name():
    a = AwardItem(name="Best Paper")
    assert a.name == "Best Paper"
    assert a.issuer is None
    assert a.date is None
    assert a.description is None

def test_award_item_all_fields():
    a = AwardItem(name="Best Paper", issuer="ICML", date="2024", description="Top paper.")
    assert a.issuer == "ICML"
    assert a.date == "2024"
    assert a.description == "Top paper."

def test_award_item_requires_name():
    with pytest.raises(ValidationError):
        AwardItem()

def test_extracurricular_item_required_title():
    act = ExtracurricularItem(title="Chess Club")
    assert act.title == "Chess Club"
    assert act.organization is None
    assert act.date is None
    assert act.highlights == []

def test_extracurricular_item_all_fields():
    act = ExtracurricularItem(title="Chess Club", organization="SNU", date="2023", highlights=["Won championship"])
    assert act.organization == "SNU"
    assert act.highlights == ["Won championship"]

def test_extracurricular_requires_title():
    with pytest.raises(ValidationError):
        ExtracurricularItem()

def test_personal_info_extra_fields():
    p = PersonalInfo(name="Test", email="t@t.com", huggingface="hf.co/test", tagline="AI Researcher", address="Seoul")
    assert p.huggingface == "hf.co/test"
    assert p.tagline == "AI Researcher"
    assert p.address == "Seoul"

def test_personal_info_extra_fields_default_none():
    p = PersonalInfo(name="Test", email="t@t.com")
    assert p.huggingface is None
    assert p.tagline is None
    assert p.address is None

def test_cvdata_awards_default_empty(minimal_cv):
    assert minimal_cv.awards == []

def test_cvdata_extracurricular_default_empty(minimal_cv):
    assert minimal_cv.extracurricular == []

def test_cvdata_with_awards():
    cv = CVData(
        personal=PersonalInfo(name="Test", email="t@t.com"),
        awards=[AwardItem(name="1st Place", issuer="Org", date="2024")],
    )
    assert len(cv.awards) == 1
    assert cv.awards[0].name == "1st Place"

def test_cvdata_model_dump_includes_new_sections(sample_cv):
    data = sample_cv.model_dump()
    assert "awards" in data
    assert "extracurricular" in data
