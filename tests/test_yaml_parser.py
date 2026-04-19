import pytest
from backend.parsers.yaml_parser import parse_yaml, YAMLParseError, CVValidationError

VALID_YAML = """
personal:
  name: Alice
  email: alice@example.com
summary: "A great engineer."
experience: []
"""

INVALID_YAML = """
personal:
  name: [unclosed bracket
"""

MISSING_REQUIRED = """
summary: "No personal section here"
"""

def test_parse_valid_yaml():
    result = parse_yaml(VALID_YAML)
    assert result.personal.name == "Alice"
    assert result.summary == "A great engineer."

def test_parse_empty_sections():
    result = parse_yaml(VALID_YAML)
    assert result.experience == []

def test_parse_invalid_yaml_raises():
    with pytest.raises(YAMLParseError) as exc:
        parse_yaml(INVALID_YAML)
    assert exc.value.error_type == "invalid_yaml"

def test_parse_missing_required_field_raises():
    with pytest.raises(CVValidationError) as exc:
        parse_yaml(MISSING_REQUIRED)
    assert exc.value.error_type == "validation_error"
    assert len(exc.value.errors) > 0

def test_parse_non_mapping_raises():
    with pytest.raises(YAMLParseError):
        parse_yaml("- item1\n- item2\n")
