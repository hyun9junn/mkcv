from pathlib import Path

import pytest
import yaml

from backend.main import _load_template_meta

TEMPLATES_DIR = Path("backend/templates")
EXPECTED_KEYS = {
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
}
EXPECTED_PERSONAL_KEYS = [
    "name",
    "email",
    "phone",
    "location",
    "website",
    "linkedin",
    "github",
    "huggingface",
]
LINK_PERSONAL_KEYS = {"website", "linkedin", "github", "huggingface"}
EXPECTED_SECTION_ORDERS = {
    "academic-research": ["summary", "education", "experience", "publications", "projects", "skills", "awards", "languages", "certifications", "extracurricular"],
    "banking": ["summary", "experience", "education", "skills", "projects", "awards", "certifications", "languages", "publications", "extracurricular"],
    "brutalist-mono": ["summary", "experience", "projects", "skills", "education", "publications", "certifications", "awards", "languages", "extracurricular"],
    "classic": ["summary", "experience", "education", "skills", "projects", "certifications", "publications", "languages", "awards", "extracurricular"],
    "column-skills": ["summary", "experience", "skills", "education", "projects", "awards", "publications", "certifications", "languages", "extracurricular"],
    "editorial-magazine": ["summary", "experience", "publications", "awards", "education", "projects", "skills", "languages", "certifications", "extracurricular"],
    "executive-corporate": ["summary", "experience", "skills", "awards", "education", "certifications", "projects", "languages", "publications", "extracurricular"],
    "gazette": ["summary", "education", "experience", "publications", "awards", "languages", "projects", "skills", "certifications", "extracurricular"],
    "heritage": ["summary", "experience", "education", "skills", "projects", "certifications", "publications", "languages", "awards", "extracurricular"],
    "hipster": ["summary", "experience", "projects", "skills", "awards", "education", "publications", "languages", "certifications", "extracurricular"],
    "modern-startup": ["summary", "experience", "projects", "skills", "education", "awards", "certifications", "publications", "languages", "extracurricular"],
    "resume-tech": ["summary", "experience", "projects", "skills", "education", "certifications", "awards", "publications", "languages", "extracurricular"],
    "sidebar-minimal": ["summary", "experience", "skills", "projects", "education", "certifications", "awards", "languages", "publications", "extracurricular"],
    "split-header": ["summary", "experience", "projects", "skills", "awards", "education", "publications", "certifications", "languages", "extracurricular"],
    "timeline-vertical": ["summary", "experience", "projects", "education", "skills", "publications", "awards", "certifications", "languages", "extracurricular"],
}


def test_every_template_meta_has_complete_defaults_block():
    for meta_path in sorted(TEMPLATES_DIR.glob("*/meta.yaml")):
        data = yaml.safe_load(meta_path.read_text()) or {}
        defaults = data["defaults"]

        assert defaults["layout"]["density"] in {"comfortable", "balanced", "compact"}, meta_path
        assert defaults["layout"]["font_scale"] in {"small", "normal", "large"}, meta_path
        assert defaults["personal"]["link_display"] in {"label", "url", "both"}, meta_path
        personal_fields = defaults["personal"]["fields"]
        assert [field["key"] for field in personal_fields] == EXPECTED_PERSONAL_KEYS, meta_path

        for field in personal_fields:
            assert isinstance(field["visible"], bool), meta_path
            if "link_display" in field:
                assert field["key"] in LINK_PERSONAL_KEYS, meta_path
                assert field["link_display"] in {"label", "url", "both"}, meta_path

        sections = defaults["sections"]
        keys = [section["key"] for section in sections]
        assert len(keys) == len(EXPECTED_KEYS), meta_path
        assert set(keys) == EXPECTED_KEYS, meta_path
        assert keys == EXPECTED_SECTION_ORDERS[meta_path.parent.name], meta_path

        for section in sections:
            assert isinstance(section["title"], str) and section["title"].strip(), meta_path
            assert isinstance(section["visible"], bool), meta_path


def test_load_template_meta_missing_file_returns_empty_defaults(tmp_path):
    template_dir = tmp_path / "missing-meta"
    template_dir.mkdir()

    meta = _load_template_meta(template_dir)

    assert meta["display_name"] == "Missing Meta"
    assert meta["defaults"] == {}


def test_load_template_meta_non_mapping_returns_empty_defaults(tmp_path):
    template_dir = tmp_path / "bad-meta"
    template_dir.mkdir()
    (template_dir / "meta.yaml").write_text("- not\n- a\n- mapping\n")

    meta = _load_template_meta(template_dir)

    assert meta["display_name"] == "bad-meta"
    assert meta["defaults"] == {}


def test_load_template_meta_invalid_yaml_syntax_returns_empty_defaults(tmp_path):
    template_dir = tmp_path / "invalid-yaml"
    template_dir.mkdir()
    (template_dir / "meta.yaml").write_text("display_name: [broken\n")

    meta = _load_template_meta(template_dir)

    assert meta["display_name"] == "invalid-yaml"
    assert meta["description"] == ""
    assert meta["audience"] == ""
    assert meta["defaults"] == {}


def test_load_template_meta_malformed_defaults_returns_empty_defaults(tmp_path):
    template_dir = tmp_path / "bad-defaults"
    template_dir.mkdir()
    (template_dir / "meta.yaml").write_text(
        "display_name: Bad Defaults\n"
        "defaults:\n"
        "  - not-a-mapping\n"
    )

    meta = _load_template_meta(template_dir)

    assert meta["display_name"] == "Bad Defaults"
    assert meta["defaults"] == {}


@pytest.mark.parametrize(
    "defaults_yaml",
    [
        (
            "  layout:\n"
            "    font_scale: normal\n"
            "  personal:\n"
            "    link_display: label\n"
            "    fields:\n"
            "      - key: name\n"
            "        visible: true\n"
            "  sections:\n"
            "    - key: summary\n"
            "      title: SUMMARY\n"
            "      visible: true\n"
        ),
        (
            "  layout:\n"
            "    density: balanced\n"
            "    font_scale: huge\n"
            "  personal:\n"
            "    link_display: label\n"
            "    fields:\n"
            "      - key: name\n"
            "        visible: true\n"
            "  sections:\n"
            "    - key: summary\n"
            "      title: SUMMARY\n"
            "      visible: true\n"
        ),
        (
            "  layout:\n"
            "    density: balanced\n"
            "    font_scale: normal\n"
            "  personal:\n"
            "    link_display: full\n"
            "    fields:\n"
            "      - key: name\n"
            "        visible: true\n"
            "  sections:\n"
            "    - key: summary\n"
            "      title: SUMMARY\n"
            "      visible: true\n"
        ),
        (
            "  layout:\n"
            "    density: balanced\n"
            "    font_scale: normal\n"
            "  personal:\n"
            "    link_display: label\n"
            "    fields:\n"
            "      - key: email\n"
            "        visible: true\n"
            "  sections:\n"
            "    - key: summary\n"
            "      title: SUMMARY\n"
            "      visible: true\n"
        ),
        (
            "  layout:\n"
            "    density: balanced\n"
            "    font_scale: normal\n"
            "  personal:\n"
            "    link_display: label\n"
            "    fields:\n"
            "      - key: name\n"
            "        visible: true\n"
            "      - key: name\n"
            "        visible: false\n"
            "  sections:\n"
            "    - key: summary\n"
            "      title: SUMMARY\n"
            "      visible: true\n"
            "    - key: summary\n"
            "      title: SUMMARY AGAIN\n"
            "      visible: false\n"
        ),
    ],
)
def test_load_template_meta_invalid_partial_defaults_return_empty_defaults(tmp_path, defaults_yaml):
    template_dir = tmp_path / "invalid-defaults"
    template_dir.mkdir()
    (template_dir / "meta.yaml").write_text(
        "display_name: Invalid Defaults\n"
        "defaults:\n"
        f"{defaults_yaml}"
    )

    meta = _load_template_meta(template_dir)

    assert meta["display_name"] == "Invalid Defaults"
    assert meta["defaults"] == {}
