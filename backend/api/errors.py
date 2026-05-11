"""Error response helpers for FastAPI handlers."""
from __future__ import annotations

from typing import Optional

from fastapi.responses import JSONResponse

from backend.models import CVData
from backend.parsers.yaml_parser import parse_yaml, YAMLParseError, CVValidationError


def error_response(
    error_type: str,
    message: str,
    details: Optional[list[str]] = None,
    status: int = 422,
) -> JSONResponse:
    """Build a structured JSON error response.

    Renamed from the old `_error` in main.py. Same shape:
        {"error": error_type, "message": message, "details": details or []}
    """
    return JSONResponse(
        status_code=status,
        content={"error": error_type, "message": message, "details": details or []},
    )


def parse_or_error(yaml_str: str) -> tuple[Optional[CVData], Optional[JSONResponse]]:
    """Parse a CV YAML string into a CVData model.

    Returns (cv, None) on success or (None, error_response) on parse/validate
    failure. Exactly one of the two return slots is None. Callers handle the
    early-return pattern:

        cv, err = parse_or_error(req.yaml)
        if err:
            return err
        # use cv ...
    """
    try:
        cv = parse_yaml(yaml_str)
    except YAMLParseError as e:
        return None, error_response("invalid_yaml", e.message, e.details)
    except CVValidationError as e:
        return None, error_response("validation_error", e.message, e.errors)
    return cv, None
