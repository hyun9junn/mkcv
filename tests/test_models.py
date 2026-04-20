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

def test_education_requires_degree_and_institution():
    with pytest.raises(ValidationError):
        EducationItem(institution="MIT", year="2020")  # missing degree

def test_education_year_is_optional():
    ed = EducationItem(degree="B.S. CS", institution="MIT")
    assert ed.year is None

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
    assert act.date == "2023"
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

def test_experience_item_optional_location():
    item = ExperienceItem(title="Dev", company="Corp", start_date="2020", location="Seoul")
    assert item.location == "Seoul"

def test_education_item_date_range():
    ed = EducationItem(degree="B.S. CS", institution="MIT", start_date="2020", end_date="2024")
    assert ed.start_date == "2020"
    assert ed.end_date == "2024"
    assert ed.year is None

def test_project_item_optional_date():
    proj = ProjectItem(name="Tool", description="A tool", date="2024")
    assert proj.date == "2024"


def test_experience_item_new_optional_fields():
    item = ExperienceItem(title="Dev", company="Corp", start_date="2020")
    assert item.description is None
    assert item.tech_stack == []
    assert item.tags == []
    assert item.contract_type is None

def test_experience_item_extra_field_passthrough():
    item = ExperienceItem(title="Dev", company="Corp", start_date="2020", custom_note="hello")
    assert item.model_extra["custom_note"] == "hello"

def test_education_item_new_optional_fields():
    ed = EducationItem(degree="B.S. CS", institution="MIT")
    assert ed.courses == []
    assert ed.thesis is None

def test_project_item_new_optional_fields():
    proj = ProjectItem(name="T", description="D")
    assert proj.tech_stack == []
    assert proj.tags == []
    assert proj.role is None

def test_publication_item_new_optional_fields():
    pub = PublicationItem(title="Paper")
    assert pub.authors == []
    assert pub.doi is None
    assert pub.abstract is None

def test_personal_info_new_optional_fields():
    p = PersonalInfo(name="Alice", email="a@a.com")
    assert p.twitter is None
    assert p.orcid is None
    assert p.scholar is None

def test_kvpair_model():
    from backend.models import KVPair
    kv = KVPair(key="Reviewer", value="NeurIPS, ICML")
    assert kv.key == "Reviewer"
    assert kv.value == "NeurIPS, ICML"

def test_custom_block_text():
    from backend.models import CustomBlock
    b = CustomBlock(type="text", value="Some paragraph")
    assert b.type == "text"
    assert b.model_extra["value"] == "Some paragraph"

def test_custom_block_bullets():
    from backend.models import CustomBlock
    b = CustomBlock(type="bullets", items=["A", "B"])
    assert b.type == "bullets"
    assert b.model_extra["items"] == ["A", "B"]

def test_custom_block_kv():
    from backend.models import CustomBlock, KVPair
    b = CustomBlock(type="kv", pairs=[{"key": "Role", "value": "Reviewer"}])
    assert b.type == "kv"

def test_custom_section_model():
    from backend.models import CustomSection, CustomBlock
    cs = CustomSection(
        key="talks",
        title="Selected Talks",
        content=[CustomBlock(type="bullets", items=["Talk A", "Talk B"])],
    )
    assert cs.key == "talks"
    assert cs.title == "Selected Talks"
    assert len(cs.content) == 1

def test_custom_section_requires_key_and_title():
    from backend.models import CustomSection
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        CustomSection(title="No Key")
    with pytest.raises(ValidationError):
        CustomSection(key="no-title")

def test_cvdata_custom_sections_default_empty(minimal_cv):
    assert minimal_cv.custom_sections == []

def test_cvdata_with_custom_sections():
    from backend.models import CustomSection, CustomBlock
    cv = CVData(
        personal=PersonalInfo(name="Test", email="t@t.com"),
        custom_sections=[
            CustomSection(
                key="talks",
                title="Selected Talks",
                content=[CustomBlock(type="bullets", items=["Talk A"])],
            )
        ],
    )
    assert len(cv.custom_sections) == 1
    assert cv.custom_sections[0].key == "talks"

def test_cvdata_model_dump_includes_custom_sections(minimal_cv):
    data = minimal_cv.model_dump()
    assert "custom_sections" in data
