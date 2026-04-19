import yaml
from typing import Optional
from pydantic import ValidationError
from backend.models import CVData


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


def parse_yaml(yaml_str: str) -> CVData:
    try:
        data = yaml.safe_load(yaml_str)
    except yaml.YAMLError as e:
        raise YAMLParseError("Invalid YAML syntax", details=[str(e)])

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
