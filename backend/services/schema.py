"""Pydantic-derived schema for YAML autocomplete.

Returns a dict consumed by frontend/yaml-autocomplete.js to populate
field name suggestions.
"""
from __future__ import annotations

import functools
import typing

from pydantic_core import PydanticUndefinedType

from backend.models import (
    CVData,
    PersonalInfo,
    ExperienceItem,
    EducationItem,
    SkillGroup,
    ProjectItem,
    CertificationItem,
    PublicationItem,
    LanguageItem,
    AwardItem,
    ExtracurricularItem,
    CustomSection,
)


def _model_info(model_class) -> dict:
    keys = []
    required = []
    list_keys = []
    for field_name, field_info in model_class.model_fields.items():
        keys.append(field_name)
        if isinstance(field_info.default, PydanticUndefinedType):
            required.append(field_name)
        ann = field_info.annotation
        origin = typing.get_origin(ann)
        if origin is list:
            list_keys.append(field_name)
    return {"keys": keys, "required": required, "list_keys": list_keys}


@functools.cache
def build_cv_schema() -> dict:
    """Derive autocomplete schema from Pydantic models. Cached.

    Returned dict has these keys:
    - "__root__": top-level CVData fields (keys, required, list_keys=[])
    - "personal": PersonalInfo fields
    - "experience[]", "education[]", ... etc: per list-section item-type fields
    - "custom_sections[].content[]": fixed structure for custom blocks
    """
    list_section_map = {
        "experience[]": ExperienceItem,
        "education[]": EducationItem,
        "skills[]": SkillGroup,
        "projects[]": ProjectItem,
        "certifications[]": CertificationItem,
        "publications[]": PublicationItem,
        "languages[]": LanguageItem,
        "awards[]": AwardItem,
        "extracurricular[]": ExtracurricularItem,
        "custom_sections[]": CustomSection,
    }

    schema: dict = {}

    root_info = _model_info(CVData)
    schema["__root__"] = {
        "keys": root_info["keys"],
        "required": root_info["required"],
        "list_keys": [],
    }

    schema["personal"] = _model_info(PersonalInfo)

    for context_key, model_class in list_section_map.items():
        schema[context_key] = _model_info(model_class)

    schema["custom_sections[].content[]"] = {
        "keys": ["type", "value", "items", "pairs"],
        "required": ["type"],
        "list_keys": ["items", "pairs"],
    }

    return schema
