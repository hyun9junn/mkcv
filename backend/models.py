from typing import Optional
from pydantic import BaseModel, ConfigDict


class PersonalInfo(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str
    email: str
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    website: Optional[str] = None
    huggingface: Optional[str] = None
    tagline: Optional[str] = None
    address: Optional[str] = None
    twitter: Optional[str] = None
    orcid: Optional[str] = None
    scholar: Optional[str] = None
    photo: Optional[str] = None


class ExperienceItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    title: str
    company: str
    start_date: str
    end_date: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    highlights: list[str] = []
    tech_stack: list[str] = []
    tags: list[str] = []
    contract_type: Optional[str] = None


class EducationItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    degree: str
    institution: str
    year: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    gpa: Optional[str] = None
    details: Optional[str] = None
    courses: list[str] = []
    thesis: Optional[str] = None


class SkillGroup(BaseModel):
    model_config = ConfigDict(extra="allow")
    category: str
    items: list[str]


class ProjectItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str
    description: str
    url: Optional[str] = None
    date: Optional[str] = None
    highlights: list[str] = []
    tech_stack: list[str] = []
    tags: list[str] = []
    role: Optional[str] = None


class CertificationItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str
    issuer: Optional[str] = None
    date: Optional[str] = None


class PublicationItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    title: str
    venue: Optional[str] = None
    date: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    authors: list[str] = []
    doi: Optional[str] = None
    abstract: Optional[str] = None


class LanguageItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    language: str
    proficiency: str


class AwardItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str
    issuer: Optional[str] = None
    date: Optional[str] = None
    description: Optional[str] = None


class ExtracurricularItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    title: str
    organization: Optional[str] = None
    date: Optional[str] = None
    highlights: list[str] = []


class KVPair(BaseModel):
    key: str
    value: str


class CustomBlock(BaseModel):
    model_config = ConfigDict(extra="allow")
    type: str  # "text" | "bullets" | "kv"


class CustomSection(BaseModel):
    key: str
    title: str
    content: list[CustomBlock] = []


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
    awards: list[AwardItem] = []
    extracurricular: list[ExtracurricularItem] = []
    custom_sections: list[CustomSection] = []
