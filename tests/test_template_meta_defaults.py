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
    "scholar-index": ["summary", "education", "experience", "publications", "projects", "skills", "awards", "languages", "certifications", "extracurricular"],
    "dealbook": ["summary", "experience", "education", "skills", "projects", "awards", "certifications", "languages", "publications", "extracurricular"],
    "mono-forge": ["summary", "experience", "projects", "skills", "education", "publications", "certifications", "awards", "languages", "extracurricular"],
    "classic": ["summary", "experience", "education", "skills", "projects", "certifications", "publications", "languages", "awards", "extracurricular"],
    "skillboard": ["summary", "experience", "skills", "education", "projects", "awards", "publications", "certifications", "languages", "extracurricular"],
    "masthead": ["summary", "experience", "publications", "awards", "education", "projects", "skills", "languages", "certifications", "extracurricular"],
    "boardroom": ["summary", "experience", "skills", "awards", "education", "certifications", "projects", "languages", "publications", "extracurricular"],
    "letterpress": ["summary", "education", "experience", "publications", "awards", "languages", "projects", "skills", "certifications", "extracurricular"],
    "chancellor": ["summary", "experience", "education", "skills", "projects", "certifications", "publications", "languages", "awards", "extracurricular"],
    "studio-pop": ["summary", "experience", "projects", "skills", "awards", "education", "publications", "languages", "certifications", "extracurricular"],
    "foundry": ["summary", "experience", "projects", "skills", "education", "awards", "certifications", "publications", "languages", "extracurricular"],
    "ats-signal": ["summary", "experience", "projects", "skills", "education", "certifications", "awards", "publications", "languages", "extracurricular"],
    "slate-rail": ["summary", "experience", "skills", "projects", "education", "certifications", "awards", "languages", "publications", "extracurricular"],
    "signature-split": ["summary", "experience", "projects", "skills", "awards", "education", "publications", "certifications", "languages", "extracurricular"],
    "trackline": ["summary", "experience", "projects", "education", "skills", "publications", "awards", "certifications", "languages", "extracurricular"],
}
EXPECTED_DISPLAY_NAMES = {
    "scholar-index": "Scholar Index",
    "dealbook": "Dealbook",
    "mono-forge": "Mono Forge",
    "classic": "Classic",
    "skillboard": "Skillboard",
    "masthead": "Masthead",
    "boardroom": "Boardroom",
    "letterpress": "Letterpress",
    "chancellor": "Chancellor",
    "studio-pop": "Studio Pop",
    "foundry": "Foundry",
    "ats-signal": "ATS Signal",
    "slate-rail": "Slate Rail",
    "signature-split": "Signature Split",
    "trackline": "Trackline",
}
EXPECTED_UI_BADGES = {
    "classic": "Default",
    "scholar-index": "Popular",
    "foundry": "New",
    "ats-signal": "New",
    "signature-split": "New",
}
EXPECTED_SECTION_TITLE_CASE_POLICIES = {
    "classic": "title",
    "scholar-index": "title",
    "dealbook": "upper",
    "mono-forge": "upper",
    "skillboard": "upper",
    "masthead": "title",
    "boardroom": "upper",
    "letterpress": "lower",
    "chancellor": "title",
    "studio-pop": "upper",
    "foundry": "upper",
    "ats-signal": "upper",
    "slate-rail": "upper",
    "signature-split": "upper",
    "trackline": "lower",
}
EXPECTED_CURATED_TITLES = {
    "scholar-index": {
        "summary": "RESEARCH SUMMARY",
        "experience": "RESEARCH AND PROFESSIONAL EXPERIENCE",
        "skills": "TECHNICAL SKILLS",
        "awards": "AWARDS AND HONORS",
        "extracurricular": "SERVICE AND ACTIVITIES",
    },
    "mono-forge": {
        "summary": "README",
        "skills": "STACK",
        "publications": "PAPERS",
        "certifications": "CERTS",
        "extracurricular": "MISC",
    },
    "masthead": {
        "summary": "EDITOR'S NOTE",
        "experience": "CAREER",
        "projects": "SELECTED WORKS",
        "publications": "BYLINES AND PUBLICATIONS",
        "awards": "HONOURS",
        "extracurricular": "BEYOND THE PAGE",
    },
    "letterpress": {
        "summary": "PROLOGUE",
        "experience": "APPOINTMENTS",
        "publications": "PUBLISHED WORKS",
        "skills": "COMPETENCIES",
        "awards": "HONOURS AND DISTINCTIONS",
        "extracurricular": "CIVIC AND OTHER INTERESTS",
    },
    "signature-split": {
        "summary": "STATEMENT",
        "projects": "SELECTED WORK",
        "publications": "PRESS AND PUBLICATIONS",
        "awards": "RECOGNITION",
        "extracurricular": "BEYOND STUDIO",
    },
}
EXPECTED_DEFAULT_VISIBILITY = {
    "slate-rail": {
        "summary": False,
    },
    "studio-pop": {
        "awards": False,
    },
}


def test_every_template_meta_has_complete_defaults_block():
    for meta_path in sorted(TEMPLATES_DIR.glob("*/meta.yaml")):
        data = yaml.safe_load(meta_path.read_text()) or {}
        defaults = data["defaults"]

        assert defaults["layout"]["density"] in {"comfortable", "balanced", "compact"}, meta_path
        assert defaults["layout"]["font_scale"] in {"small", "normal", "large"}, meta_path
        assert defaults["personal"]["default_link_display"] in {"label", "url", "both"}, meta_path
        personal_fields = defaults["personal"]["fields"]
        assert [field["key"] for field in personal_fields] == EXPECTED_PERSONAL_KEYS, meta_path

        for field in personal_fields:
            assert isinstance(field["visible"], bool), meta_path
            if field["key"] in LINK_PERSONAL_KEYS:
                assert field["link_display"] in {"default", "label", "url", "both"}, meta_path
            else:
                assert "link_display" not in field, meta_path

        sections = defaults["sections"]
        keys = [section["key"] for section in sections]
        assert len(keys) == len(EXPECTED_KEYS), meta_path
        assert set(keys) == EXPECTED_KEYS, meta_path
        assert keys == EXPECTED_SECTION_ORDERS[meta_path.parent.name], meta_path

        for section in sections:
            assert isinstance(section["title"], str) and section["title"].strip(), meta_path
            assert isinstance(section["visible"], bool), meta_path


def test_template_meta_branded_display_names_are_curated():
    for template_name, expected_display_name in EXPECTED_DISPLAY_NAMES.items():
        data = yaml.safe_load((TEMPLATES_DIR / template_name / "meta.yaml").read_text()) or {}
        assert data["display_name"] == expected_display_name


def test_template_meta_curated_titles_and_visibility_are_applied():
    for template_name, expected_titles in EXPECTED_CURATED_TITLES.items():
        data = yaml.safe_load((TEMPLATES_DIR / template_name / "meta.yaml").read_text()) or {}
        sections = {section["key"]: section for section in data["defaults"]["sections"]}
        for key, expected_title in expected_titles.items():
            assert sections[key]["title"] == expected_title

    for template_name, expected_visibility in EXPECTED_DEFAULT_VISIBILITY.items():
        data = yaml.safe_load((TEMPLATES_DIR / template_name / "meta.yaml").read_text()) or {}
        sections = {section["key"]: section for section in data["defaults"]["sections"]}
        for key, expected_visible in expected_visibility.items():
            assert sections[key]["visible"] is expected_visible


def test_every_template_meta_default_title_is_uppercase_for_settings_and_chips():
    for meta_path in sorted(TEMPLATES_DIR.glob("*/meta.yaml")):
        data = yaml.safe_load(meta_path.read_text()) or {}
        sections = data["defaults"]["sections"]
        for section in sections:
            assert section["title"] == section["title"].upper(), meta_path


def test_template_meta_declares_expected_ui_badges_and_render_casing():
    for meta_path in sorted(TEMPLATES_DIR.glob("*/meta.yaml")):
        data = yaml.safe_load(meta_path.read_text()) or {}
        template_name = meta_path.parent.name
        expected_badge = EXPECTED_UI_BADGES.get(template_name, "")
        expected_case = EXPECTED_SECTION_TITLE_CASE_POLICIES[template_name]

        assert data.get("ui", {}).get("badge", "") == expected_badge, meta_path
        assert data.get("render", {}).get("section_title_case") == expected_case, meta_path


def test_load_template_meta_missing_file_returns_empty_defaults(tmp_path):
    template_dir = tmp_path / "missing-meta"
    template_dir.mkdir()

    meta = _load_template_meta(template_dir)

    assert meta["display_name"] == "Missing Meta"
    assert meta["ui"] == {"badge": ""}
    assert meta["render"] == {"section_title_case": "title"}
    assert meta["defaults"] == {}


def test_load_template_meta_non_mapping_returns_empty_defaults(tmp_path):
    template_dir = tmp_path / "bad-meta"
    template_dir.mkdir()
    (template_dir / "meta.yaml").write_text("- not\n- a\n- mapping\n")

    meta = _load_template_meta(template_dir)

    assert meta["display_name"] == "bad-meta"
    assert meta["ui"] == {"badge": ""}
    assert meta["render"] == {"section_title_case": "title"}
    assert meta["defaults"] == {}


def test_load_template_meta_invalid_yaml_syntax_returns_empty_defaults(tmp_path):
    template_dir = tmp_path / "invalid-yaml"
    template_dir.mkdir()
    (template_dir / "meta.yaml").write_text("display_name: [broken\n")

    meta = _load_template_meta(template_dir)

    assert meta["display_name"] == "invalid-yaml"
    assert meta["description"] == ""
    assert meta["audience"] == ""
    assert meta["ui"] == {"badge": ""}
    assert meta["render"] == {"section_title_case": "title"}
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
    assert meta["ui"] == {"badge": ""}
    assert meta["render"] == {"section_title_case": "title"}
    assert meta["defaults"] == {}


def test_load_template_meta_normalizes_optional_badge_and_section_title_case(tmp_path):
    template_dir = tmp_path / "meta-driven"
    template_dir.mkdir()
    (template_dir / "meta.yaml").write_text(
        "display_name: Meta Driven\n"
        "ui:\n"
        "  badge: Popular\n"
        "render:\n"
        "  section_title_case: lower\n"
    )

    meta = _load_template_meta(template_dir)

    assert meta["ui"] == {"badge": "Popular"}
    assert meta["render"] == {"section_title_case": "lower"}


def test_load_template_meta_invalid_optional_badge_and_casing_fall_back_safely(tmp_path):
    template_dir = tmp_path / "bad-optional-meta"
    template_dir.mkdir()
    (template_dir / "meta.yaml").write_text(
        "ui:\n"
        "  badge: 123\n"
        "render:\n"
        "  section_title_case: loud\n"
    )

    meta = _load_template_meta(template_dir)

    assert meta["ui"] == {"badge": ""}
    assert meta["render"] == {"section_title_case": "title"}


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
        (
            "  layout:\n"
            "    density: balanced\n"
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
