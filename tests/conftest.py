import pytest
from backend.models import (
    CVData, PersonalInfo, ExperienceItem, EducationItem,
    SkillGroup, ProjectItem, CertificationItem, PublicationItem, LanguageItem,
    AwardItem, ExtracurricularItem, CustomSection, CustomBlock,
)


@pytest.fixture
def sample_cv():
    return CVData(
        personal=PersonalInfo(
            name="Jane Smith",
            email="jane@example.com",
            phone="+1-555-0100",
            location="New York, USA",
            github="github.com/janesmith",
        ),
        summary="Experienced engineer focused on backend systems.",
        experience=[
            ExperienceItem(
                title="Software Engineer",
                company="Tech Co",
                start_date="2020",
                end_date="2023",
                highlights=["Built payment service", "Reduced p99 latency by 30%"],
            )
        ],
        education=[
            EducationItem(degree="B.S. Computer Science", institution="MIT", year="2019", gpa="3.9")
        ],
        skills=[SkillGroup(category="Languages", items=["Python", "Go"])],
        projects=[
            ProjectItem(
                name="OpenTool",
                description="An open source CLI tool",
                url="github.com/janesmith/opentool",
                highlights=["500+ GitHub stars"],
            )
        ],
        certifications=[CertificationItem(name="AWS SAA", issuer="Amazon", date="2022")],
        publications=[PublicationItem(title="Fast APIs", venue="Dev Blog", date="2023")],
        languages=[LanguageItem(language="English", proficiency="Native")],
        awards=[AwardItem(name="Best Paper Award", issuer="ICML", date="2024")],
        extracurricular=[
            ExtracurricularItem(title="Chess Club", organization="SNU", highlights=["Won championship"])
        ],
        custom_sections=[
            CustomSection(
                key="talks",
                title="Selected Talks",
                content=[
                    CustomBlock(type="bullets", items=["NeurIPS 2024: Efficient Quantization"]),
                ],
            )
        ],
    )


@pytest.fixture
def minimal_cv():
    return CVData(personal=PersonalInfo(name="Alice", email="alice@example.com"))
