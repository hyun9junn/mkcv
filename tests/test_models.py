import pytest
from pydantic import ValidationError
from backend.models import (
    CVData, PersonalInfo, ExperienceItem, EducationItem,
    SkillGroup, ProjectItem, CertificationItem, PublicationItem, LanguageItem,
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
    for section in ["personal", "summary", "experience", "education", "skills", "projects", "certifications", "publications", "languages"]:
        assert section in data
