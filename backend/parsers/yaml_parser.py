import yaml
import re
from typing import Optional
from pydantic import ValidationError
from backend.models import CVData

_UNSUPPORTED_PLAIN_TEXT_CONTROL_RE = re.compile(r"^[%&*!@`]")
_YAML_QUOTING_HINT = (
    "Hint: wrap the value in quotes if it starts with %, &, *, !, @, or `, "
    "or if plain text includes characters like # or :."
)


class YAMLParseError(Exception):
    def __init__(self, message: str, details: Optional[list[str]] = None):
        self.error_type = "invalid_yaml"
        self.message = message
        self.details = details or []
        super().__init__(message)


class CVValidationError(Exception):
    def __init__(self, errors: list[str]):
        self.error_type = "validation_error"
        self.message = "CV data failed validation"
        self.errors = errors
        super().__init__(self.message)


def _extract_plain_scalar_candidate(line: str) -> Optional[str]:
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return None

    if ": " in line:
        _, candidate = line.split(": ", 1)
        return candidate.rstrip()

    if stripped.startswith("- "):
        return stripped[2:].rstrip()

    return None


def _find_unsupported_plain_text_control(yaml_str: str) -> Optional[tuple[int, str]]:
    for lineno, line in enumerate(yaml_str.splitlines(), start=1):
        candidate = _extract_plain_scalar_candidate(line)
        if not candidate:
            continue
        if candidate[:1] in {'"', "'", "|", ">", "[", "{"}:
            continue
        if _UNSUPPORTED_PLAIN_TEXT_CONTROL_RE.match(candidate):
            return lineno, candidate
    return None


def parse_yaml(yaml_str: str) -> CVData:
    accidental_control = _find_unsupported_plain_text_control(yaml_str)
    if accidental_control:
        lineno, candidate = accidental_control
        raise YAMLParseError(
            "Text values that start with YAML control characters must be quoted",
            details=[f"Line {lineno}: {candidate}", _YAML_QUOTING_HINT],
        )

    try:
        data = yaml.safe_load(yaml_str)
    except yaml.YAMLError as e:
        raise YAMLParseError("Invalid YAML syntax", details=[str(e), _YAML_QUOTING_HINT])

    if not isinstance(data, dict):
        raise YAMLParseError("YAML must be a mapping at the top level")

    try:
        return CVData(**data)
    except ValidationError as e:
        errors = [
            f"{'.'.join(str(loc) for loc in err['loc'])}: {err['msg']}"
            for err in e.errors()
        ]
        raise CVValidationError(errors=errors)
