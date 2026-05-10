"""Shared constants used across the backend.

Single source of truth — do not redeclare these in other modules.
"""

BUILTIN_SECTION_KEYS = frozenset({
    "summary",
    "experience",
    "education",
    "skills",
    "projects",
    "certifications",
    "publications",
    "languages",
    "awards",
    "extracurricular",
})

VALID_DENSITIES = frozenset({"comfortable", "balanced", "compact"})
VALID_FONT_SCALES = frozenset({"small", "normal", "large"})
VALID_LINK_DISPLAYS = frozenset({"label", "url", "both"})
FIELD_LINK_DISPLAYS = frozenset({"default", "label", "url", "both"})
VALID_SECTION_TITLE_CASES = frozenset({"upper", "lower", "title"})

PERSONAL_FIELD_KEYS = (
    "name",
    "email",
    "phone",
    "location",
    "website",
    "linkedin",
    "github",
    "huggingface",
)

LINK_PERSONAL_KEYS = frozenset({"website", "linkedin", "github", "huggingface"})
