from typing import Optional
from pydantic import BaseModel


class PersonalInfo(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    website: Optional[str] = None


class ExperienceItem(BaseModel):
    title: str
    company: str
    start_date: str
    end_date: Optional[str] = None
    highlights: list[str] = []


class EducationItem(BaseModel):
    degree: str
    institution: str
    year: str
    gpa: Optional[str] = None


class SkillGroup(BaseModel):
    category: str
    items: list[str]


class ProjectItem(BaseModel):
    name: str
    description: str
    url: Optional[str] = None
    highlights: list[str] = []


class CertificationItem(BaseModel):
    name: str
    issuer: Optional[str] = None
    date: Optional[str] = None


class PublicationItem(BaseModel):
    title: str
    venue: Optional[str] = None
    date: Optional[str] = None
    url: Optional[str] = None


class LanguageItem(BaseModel):
    language: str
    proficiency: str


class CVData(BaseModel):
    personal: PersonalInfo
    summary: Optional[str] = None
    experience: list[ExperienceItem] = []
    education: list[EducationItem] = []
    skills: list[SkillGroup] = []
    projects: list[ProjectItem] = []
    certifications: list[CertificationItem] = []
    publications: list[PublicationItem] = []
    languages: list[LanguageItem] = []
