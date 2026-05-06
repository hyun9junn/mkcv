import pytest
import subprocess
from pathlib import Path
from backend.models import CVData, PersonalInfo
from backend.renderers.latex import LaTeXRenderer, _build_layout_preamble, _FONT_SIZE, _make_jinja_filters, _make_contact_helpers, _make_link_text_fn
from tests.conftest import xelatex_available

TEMPLATES_DIR = Path("backend/templates")
TEMPLATES_WITH_GITHUB_LINK = [
    "scholar-index",
    "dealbook",
    "mono-forge",
    "classic",
    "skillboard",
    "masthead",
    "boardroom",
    "letterpress",
    "chancellor",
    "studio-pop",
    "foundry",
    "ats-signal",
    "slate-rail",
    "signature-split",
    "trackline",
]


def _social_cv() -> CVData:
    return CVData(
        personal=PersonalInfo(
            name="Jane Smith",
            email="jane@example.com",
            github="github.com/janesmith",
            linkedin="linkedin.com/in/janesmith",
            huggingface="huggingface.co/janesmith",
        )
    )


def test_latex_contains_name(sample_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(sample_cv)
    assert "Jane Smith" in output


def test_latex_contains_job_title(sample_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(sample_cv)
    assert "Software Engineer" in output
    assert "Tech Co" in output


def test_latex_contains_education(sample_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(sample_cv)
    assert "B.S. Computer Science" in output
    assert "MIT" in output


def test_latex_contains_highlights(sample_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(sample_cv)
    assert "Built payment service" in output


def test_latex_skips_empty_experience(minimal_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(minimal_cv)
    assert "Experience" not in output


def test_latex_skips_empty_summary(minimal_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(minimal_cv)
    assert "Summary" not in output


def test_latex_unknown_template_raises(sample_cv):
    with pytest.raises(ValueError, match="unknown_template"):
        LaTeXRenderer(TEMPLATES_DIR, template="nonexistent").render(sample_cv)


def test_classic_latex_renders_awards(sample_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(sample_cv)
    assert r"\section{Awards}" in output
    assert "Best Paper Award" in output
    assert "ICML" in output


def test_classic_latex_renders_extracurricular(sample_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(sample_cv)
    assert r"\section{Extracurricular Activities}" in output
    assert "Chess Club" in output
    assert "Won championship" in output


def test_classic_latex_skips_empty_awards(minimal_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(minimal_cv)
    assert "Awards" not in output


def test_classic_latex_skips_empty_extracurricular(minimal_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(minimal_cv)
    assert "Extracurricular" not in output


def test_classic_latex_renders_custom_section_bullets(sample_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(
        sample_cv, section_order=["talks"]
    )
    assert r"\section{Selected Talks}" in output
    assert "NeurIPS 2024: Efficient Quantization" in output

def test_classic_latex_renders_custom_section_text():
    from backend.models import CVData, PersonalInfo, CustomSection, CustomBlock
    cv = CVData(
        personal=PersonalInfo(name="Test", email="t@t.com"),
        custom_sections=[
            CustomSection(
                key="bio",
                title="Biography",
                content=[CustomBlock(type="text", value="A short bio paragraph.")],
            )
        ],
    )
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(cv, section_order=["bio"])
    assert r"\section{Biography}" in output
    assert "A short bio paragraph." in output

def test_classic_latex_renders_custom_section_kv():
    from backend.models import CVData, PersonalInfo, CustomSection, CustomBlock
    cv = CVData(
        personal=PersonalInfo(name="Test", email="t@t.com"),
        custom_sections=[
            CustomSection(
                key="service",
                title="Academic Service",
                content=[CustomBlock(type="kv", pairs=[{"key": "Reviewer", "value": "NeurIPS"}])],
            )
        ],
    )
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(cv, section_order=["service"])
    assert r"\section{Academic Service}" in output
    assert "Reviewer" in output
    assert "NeurIPS" in output

def test_classic_latex_skips_custom_section_not_in_order(sample_cv):
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(
        sample_cv, section_order=["summary"]
    )
    assert "Selected Talks" not in output


def test_masthead_uppercase_settings_titles_render_as_title_case():
    from backend.models import CVData, PersonalInfo

    cv = CVData(
        personal=PersonalInfo(name="Jane Smith", email="j@example.com"),
        summary="A brief editor's note.",
    )

    output = LaTeXRenderer(TEMPLATES_DIR, template="masthead").render(
        cv,
        section_order=["summary"],
        section_titles={"summary": "EDITOR'S NOTE"},
    )

    assert r"\section{Editor's Note}" in output


def test_letterpress_uppercase_settings_titles_render_as_lowercase():
    from backend.models import CVData, PersonalInfo

    cv = CVData(
        personal=PersonalInfo(name="Jane Smith", email="j@example.com"),
        summary="A formal preface.",
    )

    output = LaTeXRenderer(TEMPLATES_DIR, template="letterpress").render(
        cv,
        section_order=["summary"],
        section_titles={"summary": "PROLOGUE"},
    )

    assert r"\section{prologue}" in output


def test_ats_signal_uppercase_settings_titles_stay_uppercase():
    from backend.models import CVData, PersonalInfo

    cv = CVData(
        personal=PersonalInfo(name="Jane Smith", email="j@example.com"),
        summary="A compact ATS summary.",
    )

    output = LaTeXRenderer(TEMPLATES_DIR, template="ats-signal").render(
        cv,
        section_order=["summary"],
        section_titles={"summary": "SUMMARY"},
    )

    assert r"\section{SUMMARY}" in output


def test_template_render_metadata_can_force_lowercase_on_builtin_titles(tmp_path, minimal_cv):
    template_dir = tmp_path / "meta-lower"
    template_dir.mkdir()
    (template_dir / "cv.tex.j2").write_text(r"\section{<< section_titles.summary >>}")
    (template_dir / "meta.yaml").write_text(
        "render:\n"
        "  section_title_case: lower\n"
    )

    output = LaTeXRenderer(tmp_path, template="meta-lower").render(
        minimal_cv,
        section_order=["summary"],
        section_titles={"summary": "EDITOR'S NOTE"},
    )

    assert r"\section{editor's note}" in output


def test_font_size_map():
    assert _FONT_SIZE["small"] == "10pt"
    assert _FONT_SIZE["normal"] == "11pt"
    assert _FONT_SIZE["large"] == "12pt"


def test_layout_preamble_balanced():
    p = _build_layout_preamble("balanced")
    assert "\\newcommand{\\cvvgap}{4pt}" in p
    assert "\\newcommand{\\cvsecbefore}{12pt}" in p
    assert "\\newcommand{\\cvsecafter}{6pt}" in p
    assert "\\newcommand{\\cvitembefore}{2pt}" in p


def test_layout_preamble_compact():
    p = _build_layout_preamble("compact")
    assert "\\newcommand{\\cvvgap}{2pt}" in p
    assert "\\newcommand{\\cvsecbefore}{8pt}" in p
    assert "\\newcommand{\\cvsecafter}{4pt}" in p
    assert "\\newcommand{\\cvitembefore}{1pt}" in p


def test_layout_preamble_comfortable():
    p = _build_layout_preamble("comfortable")
    assert "\\newcommand{\\cvvgap}{8pt}" in p
    assert "\\newcommand{\\cvsecbefore}{14pt}" in p
    assert "\\newcommand{\\cvsecafter}{7pt}" in p
    assert "\\newcommand{\\cvitembefore}{4pt}" in p


def test_layout_preamble_unknown_falls_back_to_balanced():
    p = _build_layout_preamble("airy")
    assert "\\newcommand{\\cvvgap}{4pt}" in p


def test_renderer_passes_layout_vars_to_template(tmp_path, minimal_cv):
    tmpl_dir = tmp_path / "mini"
    tmpl_dir.mkdir()
    (tmpl_dir / "cv.tex.j2").write_text(
        "\\documentclass[<< font_size >>]{article}\n"
        "<< layout_preamble >>\n"
        "\\begin{document}hello\\end{document}"
    )
    renderer = LaTeXRenderer(tmp_path, template="mini", density="compact", font_scale="small")
    result = renderer.render(minimal_cv)
    assert "\\documentclass[10pt]{article}" in result
    assert "\\newcommand{\\cvvgap}{2pt}" in result


def test_all_templates_include_shared_xelatex_preamble():
    for template_path in TEMPLATES_DIR.glob("*/cv.tex.j2"):
        source = template_path.read_text()
        assert "<< xelatex_preamble >>" in source, f"{template_path} should use the shared xelatex preamble"


def test_renderer_includes_xelatex_hangul_font_config_from_meta(tmp_path, minimal_cv):
    tmpl_dir = tmp_path / "xelatex-meta"
    tmpl_dir.mkdir()
    (tmpl_dir / "cv.tex.j2").write_text("<< xelatex_preamble >>\n\\begin{document}ok\\end{document}")
    (tmpl_dir / "meta.yaml").write_text(
        "render:\n"
        "  xelatex:\n"
        "    hangul_main_fonts:\n"
        "      - Body Serif A\n"
        "      - Body Serif B\n"
        "    hangul_sans_fonts:\n"
        "      - Sans A\n"
        "    hangul_mono_fonts:\n"
        "      - Mono A\n"
        "      - Mono B\n"
    )

    rendered = LaTeXRenderer(tmp_path, template="xelatex-meta").render(minimal_cv)

    assert "\\usepackage{fontspec}" in rendered
    assert "\\usepackage{kotex}" in rendered
    assert "\\IfFontExistsTF{Body Serif A}" in rendered
    assert "\\setmainhangulfont{Body Serif A}" in rendered
    assert "\\setsanshangulfont{Sans A}" in rendered
    assert "\\setmonohangulfont{Mono A}" in rendered
    assert "\\setmonohangulfont{Mono B}" in rendered


@xelatex_available
@pytest.mark.parametrize("template", ["classic", "boardroom"])
def test_templates_compile_korean_content_with_xelatex(tmp_path, template):
    cv = CVData(
        personal=PersonalInfo(name="홍길동", email="hong@example.com"),
        summary="한글 요약 테스트입니다. English mixed.",
    )

    rendered = LaTeXRenderer(TEMPLATES_DIR, template=template).render(
        cv,
        section_order=["summary"],
    )
    tex_path = tmp_path / "cv.tex"
    tex_path.write_text(rendered)

    result = subprocess.run(
        ["xelatex", "-interaction=nonstopmode", "cv.tex"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stdout


def test_renderer_unknown_font_scale_falls_back(tmp_path, minimal_cv):
    tmpl_dir = tmp_path / "mini"
    tmpl_dir.mkdir()
    (tmpl_dir / "cv.tex.j2").write_text(
        "\\documentclass[<< font_size >>]{article}\n"
        "<< layout_preamble >>\n"
        "\\begin{document}hello\\end{document}"
    )
    renderer = LaTeXRenderer(tmp_path, template="mini", font_scale="huge")
    result = renderer.render(minimal_cv)
    assert "\\documentclass[11pt]{article}" in result


@pytest.mark.parametrize("template", TEMPLATES_WITH_GITHUB_LINK)
@pytest.mark.parametrize(
    ("link_display", "expected_text"),
    [
        ("label", r"\href{https://github.com/janesmith}{GitHub}"),
        ("url", r"\href{https://github.com/janesmith}{github.com/janesmith}"),
        ("both", r"\href{https://github.com/janesmith}{GitHub (github.com/janesmith)}"),
    ],
)
def test_link_display_changes_personal_github_text_across_templates(template, link_display, expected_text):
    output = LaTeXRenderer(TEMPLATES_DIR, template=template, link_display=link_display).render(_social_cv())
    assert expected_text in output


def test_name_size_short():
    f = _make_jinja_filters()
    # "Jane Smith" = 10 chars → ≤ 22 → Huge
    assert f['name_size']('Jane Smith') == r'\Huge\bfseries'


def test_name_size_medium():
    f = _make_jinja_filters()
    # "Alexander James Thompson" = 24 chars → 23-30 → LARGE
    assert f['name_size']('Alexander James Thompson') == r'\LARGE\bfseries'


def test_name_size_long():
    f = _make_jinja_filters()
    # "Alexander James Montgomery-Williams" = 35 chars → > 30 → Large
    assert f['name_size']('Alexander James Montgomery-Williams') == r'\Large\bfseries'


def test_name_fontsize_short():
    f = _make_jinja_filters()
    result = f['name_fontsize']('Jane Smith', 26.0, 1.15)
    assert r'\fontsize{26pt}' in result
    assert r'\selectfont' in result


def test_name_fontsize_medium():
    f = _make_jinja_filters()
    # 24 chars → normal_pt - 3 = 23
    result = f['name_fontsize']('Alexander James Thompson', 26.0, 1.15)
    assert r'\fontsize{23pt}' in result


def test_name_fontsize_long():
    f = _make_jinja_filters()
    # 35 chars → normal_pt - 5 = 21
    result = f['name_fontsize']('Alexander James Montgomery-Williams', 26.0, 1.15)
    assert r'\fontsize{21pt}' in result


def test_name_fontsize_preserves_ratio():
    f = _make_jinja_filters()
    # scholar-index: 22pt base, 1.18 ratio → short name → 22pt/26pt (same as original)
    result = f['name_fontsize']('Jane Smith', 22.0, 1.18)
    assert r'\fontsize{22pt}{26pt}\selectfont' == result


def test_shrink_if_long_short():
    f = _make_jinja_filters()
    assert f['shrink_if_long']('Software Engineer', 48) == ''


def test_shrink_if_long_over_threshold():
    f = _make_jinja_filters()
    long_title = 'Principal Machine Learning Infrastructure Engineering Lead'
    assert f['shrink_if_long'](long_title, 48) == r'\small '


def test_shrink_if_long_default_threshold():
    f = _make_jinja_filters()
    # Exactly at 48 chars — not over
    assert f['shrink_if_long']('A' * 48, 48) == ''
    # One over
    assert f['shrink_if_long']('A' * 49, 48) == r'\small '


def test_classic_long_name_steps_down():
    from backend.models import CVData, PersonalInfo
    cv = CVData(personal=PersonalInfo(
        name="Alexander James Montgomery-Williams",  # 35 chars → Large
        email="a@example.com",
    ))
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(cv)
    assert r'\Large\bfseries' in output


def test_classic_short_name_stays_huge():
    from backend.models import CVData, PersonalInfo
    cv = CVData(personal=PersonalInfo(name="Jane Smith", email="j@example.com"))
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(cv)
    assert r'\Huge\bfseries' in output


def test_foundry_long_name_steps_down():
    from backend.models import CVData, PersonalInfo
    cv = CVData(personal=PersonalInfo(
        name="Alexander James Montgomery-Williams",  # 35 chars → 26-5=21pt
        email="a@example.com",
    ))
    output = LaTeXRenderer(TEMPLATES_DIR, template="foundry").render(cv)
    assert r'\fontsize{21pt}' in output


def test_foundry_short_name_stays_26pt():
    from backend.models import CVData, PersonalInfo
    cv = CVData(personal=PersonalInfo(name="Jane Smith", email="j@example.com"))
    output = LaTeXRenderer(TEMPLATES_DIR, template="foundry").render(cv)
    assert r'\fontsize{26pt}' in output


def test_scholar_index_long_name_steps_down():
    from backend.models import CVData, PersonalInfo
    cv = CVData(personal=PersonalInfo(
        name="Alexander James Montgomery-Williams",  # 35 chars → 22-5=17pt
        email="a@example.com",
    ))
    output = LaTeXRenderer(TEMPLATES_DIR, template="scholar-index").render(cv)
    assert r'\fontsize{17pt}' in output


def test_scholar_index_short_name_stays_22pt():
    from backend.models import CVData, PersonalInfo
    cv = CVData(personal=PersonalInfo(name="Jane Smith", email="j@example.com"))
    output = LaTeXRenderer(TEMPLATES_DIR, template="scholar-index").render(cv)
    assert r'\fontsize{22pt}' in output


def test_boardroom_long_name_steps_down():
    from backend.models import CVData, PersonalInfo
    cv = CVData(personal=PersonalInfo(
        name="Alexander James Montgomery-Williams",  # 35 chars → 22-5=17pt
        email="a@example.com",
    ))
    output = LaTeXRenderer(TEMPLATES_DIR, template="boardroom").render(cv)
    assert r'\fontsize{17pt}' in output


def test_boardroom_short_name_stays_22pt():
    from backend.models import CVData, PersonalInfo
    cv = CVData(personal=PersonalInfo(name="Jane Smith", email="j@example.com"))
    output = LaTeXRenderer(TEMPLATES_DIR, template="boardroom").render(cv)
    assert r'\fontsize{22pt}' in output


def test_classic_long_job_title_triggers_shrink():
    from backend.models import CVData, PersonalInfo, ExperienceItem
    cv = CVData(
        personal=PersonalInfo(name="Jane Smith", email="j@example.com"),
        experience=[ExperienceItem(
            title="Principal Machine Learning Infrastructure Engineering Lead",  # 57 chars
            company="Acme Corp",
            start_date="2020",
        )],
    )
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(cv)
    assert r'\small' in output


def test_classic_short_job_title_no_shrink():
    from backend.models import CVData, PersonalInfo, ExperienceItem
    cv = CVData(
        personal=PersonalInfo(name="Jane Smith", email="j@example.com"),
        experience=[ExperienceItem(
            title="Software Engineer",
            company="Acme Corp",
            start_date="2020",
        )],
    )
    output = LaTeXRenderer(TEMPLATES_DIR, template="classic").render(cv)
    assert r'\small' not in output


def test_dealbook_long_job_title_triggers_shrink():
    from backend.models import CVData, PersonalInfo, ExperienceItem
    cv = CVData(
        personal=PersonalInfo(name="Jane Smith", email="j@example.com"),
        experience=[ExperienceItem(
            title="Principal Machine Learning Infrastructure Engineering Lead",  # 57 chars > 48
            company="Acme Corp",
            start_date="2020",
        )],
    )
    output = LaTeXRenderer(TEMPLATES_DIR, template="dealbook").render(cv)
    assert r'\small' in output


def test_skillboard_long_job_title_triggers_shrink():
    from backend.models import CVData, PersonalInfo, ExperienceItem
    cv = CVData(
        personal=PersonalInfo(name="Jane Smith", email="j@example.com"),
        experience=[ExperienceItem(
            title="Principal Machine Learning Infrastructure Engineering Lead",  # 57 chars > 48
            company="Acme Corp",
            start_date="2020",
        )],
    )
    output = LaTeXRenderer(TEMPLATES_DIR, template="skillboard").render(cv)
    assert r'\small' in output


def test_boardroom_long_job_title_triggers_shrink():
    from backend.models import CVData, PersonalInfo, ExperienceItem
    cv = CVData(
        personal=PersonalInfo(name="Jane Smith", email="j@example.com"),
        experience=[ExperienceItem(
            title="Principal Machine Learning Engineering Director",  # 49 chars > 40
            company="Acme Corp",
            start_date="2020",
        )],
    )
    output = LaTeXRenderer(TEMPLATES_DIR, template="boardroom").render(cv)
    assert r'\small' in output


def test_scholar_index_long_job_title_triggers_shrink():
    from backend.models import CVData, PersonalInfo, ExperienceItem
    cv = CVData(
        personal=PersonalInfo(name="Jane Smith", email="j@example.com"),
        experience=[ExperienceItem(
            title="Principal Machine Learning Infrastructure Engineering Lead",  # 57 chars > 48
            company="MIT CSAIL",
            start_date="2020",
        )],
    )
    output = LaTeXRenderer(TEMPLATES_DIR, template="scholar-index").render(cv)
    assert r'\small' in output


def test_studio_pop_long_job_title_triggers_shrink():
    from backend.models import CVData, PersonalInfo, ExperienceItem
    cv = CVData(
        personal=PersonalInfo(name="Jane Smith", email="j@example.com"),
        experience=[ExperienceItem(
            title="Principal Machine Learning Infrastructure Engineering Lead",  # 57 chars > 48
            company="Acme Corp",
            start_date="2020",
        )],
    )
    output = LaTeXRenderer(TEMPLATES_DIR, template="studio-pop").render(cv)
    assert r'\small' in output


def test_studio_pop_sidebar_skills_and_languages_respect_section_order():
    from backend.models import CVData, PersonalInfo, SkillGroup, LanguageItem

    cv = CVData(
        personal=PersonalInfo(name="Jane Smith", email="j@example.com"),
        skills=[SkillGroup(category="Languages", items=["Python", "Go"])],
        languages=[LanguageItem(language="English", proficiency="Native")],
    )

    hidden_output = LaTeXRenderer(TEMPLATES_DIR, template="studio-pop").render(
        cv, section_order=["summary"]
    )
    assert r"\sidesection{Skills}" not in hidden_output
    assert r"\sidesection{Languages}" not in hidden_output

    shown_output = LaTeXRenderer(TEMPLATES_DIR, template="studio-pop").render(
        cv, section_order=["summary", "skills", "languages"]
    )
    assert r"\sidesection{SKILLS}" in shown_output
    assert r"\sidesection{LANGUAGES}" in shown_output


def test_foundry_long_job_title_triggers_shrink():
    from backend.models import CVData, PersonalInfo, ExperienceItem
    cv = CVData(
        personal=PersonalInfo(name="Jane Smith", email="j@example.com"),
        experience=[ExperienceItem(
            title="Principal Machine Learning Infrastructure Engineering Lead",  # 57 chars > 48
            company="Acme Corp",
            start_date="2020",
        )],
    )
    output = LaTeXRenderer(TEMPLATES_DIR, template="foundry").render(cv)
    assert r'\small' in output


def test_ats_signal_long_name_steps_down():
    from backend.models import CVData, PersonalInfo
    cv = CVData(personal=PersonalInfo(name="Bartholomew Christopherson Winthrop", email="b@example.com"))
    output = LaTeXRenderer(TEMPLATES_DIR, template="ats-signal").render(cv)
    assert r'\Large\bfseries Bartholomew Christopherson Winthrop' in output


def test_ats_signal_short_name_stays_huge():
    from backend.models import CVData, PersonalInfo
    cv = CVData(personal=PersonalInfo(name="Jane Smith", email="j@example.com"))
    output = LaTeXRenderer(TEMPLATES_DIR, template="ats-signal").render(cv)
    assert r'\Huge\bfseries Jane Smith' in output


def test_ats_signal_long_job_title_triggers_shrink():
    from backend.models import CVData, PersonalInfo, ExperienceItem
    cv = CVData(
        personal=PersonalInfo(name="Jane Smith", email="j@example.com"),
        experience=[ExperienceItem(
            title="Principal Machine Learning Infrastructure Engineering Lead",
            company="Acme Corp",
            start_date="2020",
        )],
    )
    output = LaTeXRenderer(TEMPLATES_DIR, template="ats-signal").render(cv)
    assert r'\small \cvorg{Principal Machine Learning Infrastructure Engineering Lead}' in output


def test_slate_rail_long_job_title_triggers_shrink():
    from backend.models import CVData, PersonalInfo, ExperienceItem
    cv = CVData(
        personal=PersonalInfo(name="Jane Smith", email="j@example.com"),
        experience=[ExperienceItem(
            title="Principal Machine Learning Infrastructure Engineering Lead",
            company="Acme Corp",
            start_date="2020",
        )],
    )
    output = LaTeXRenderer(TEMPLATES_DIR, template="slate-rail").render(cv)
    assert r'\small \cvrole{Principal Machine Learning Infrastructure Engineering Lead}' in output


def test_filters_available_in_template(tmp_path, minimal_cv):
    # "Alice" = 5 chars → name_size returns \Huge\bfseries
    tmpl_dir = tmp_path / "mini"
    tmpl_dir.mkdir()
    (tmpl_dir / "cv.tex.j2").write_text(
        "\\documentclass[<< font_size >>]{article}\n"
        "<< layout_preamble >>\n"
        "\\begin{document}\n"
        "<< cv.personal.name | name_size >>\n"
        "<< cv.personal.name | shrink_if_long(3) >>\n"
        "\\end{document}"
    )
    renderer = LaTeXRenderer(tmp_path, template="mini")
    result = renderer.render(minimal_cv)
    assert r'\Huge\bfseries' in result   # name_size filter worked
    assert r'\small ' in result           # shrink_if_long(3) triggered (Alice=5>3)


def test_contact_visible_defaults_true_when_no_fields():
    visible, _ = _make_contact_helpers([], "url")
    assert visible("email") is True
    assert visible("github") is True


def test_contact_visible_name_always_true():
    visible, _ = _make_contact_helpers([{"key": "name", "visible": False}], "url")
    assert visible("name") is True


def test_contact_visible_respects_field_setting():
    visible, _ = _make_contact_helpers(
        [{"key": "linkedin", "visible": False}, {"key": "github", "visible": True}],
        "url",
    )
    assert visible("linkedin") is False
    assert visible("github") is True


def test_contact_visible_unknown_key_defaults_true():
    visible, _ = _make_contact_helpers([{"key": "email", "visible": False}], "url")
    assert visible("nonexistent") is True


def test_contact_link_style_uses_global_when_no_override():
    _, style = _make_contact_helpers([{"key": "github", "visible": True}], "url")
    assert style("github") == "url"


def test_contact_link_style_uses_field_override():
    _, style = _make_contact_helpers(
        [{"key": "github", "visible": True, "link_display": "label"}], "url"
    )
    assert style("github") == "label"


def test_contact_link_style_ignores_invalid_override():
    _, style = _make_contact_helpers(
        [{"key": "github", "visible": True, "link_display": "invalid"}], "url"
    )
    assert style("github") == "url"


def test_link_text_with_explicit_style_overrides_global():
    fn = _make_link_text_fn("url")
    assert fn("github.com/user", "GitHub", "label") == "GitHub"
    assert fn("github.com/user", "GitHub", "both") == "GitHub (github.com/user)"
    assert fn("github.com/user", "GitHub", "url") == "github.com/user"


def test_link_text_without_style_uses_global():
    fn = _make_link_text_fn("both")
    assert fn("github.com/user", "GitHub") == "GitHub (github.com/user)"


def test_link_text_invalid_style_falls_back_to_global():
    fn = _make_link_text_fn("label")
    assert fn("github.com/user", "GitHub", "invalid") == "GitHub"


def _make_cv(github="github.com/user", linkedin=None, email="a@b.com", phone=None, location=None):
    return CVData(
        personal=PersonalInfo(
            name="Test User",
            email=email,
            phone=phone,
            location=location,
            linkedin=linkedin,
            github=github,
        )
    )


def test_classic_hides_github_when_not_visible():
    renderer = LaTeXRenderer(
        TEMPLATES_DIR, template="classic",
        personal_fields=[
            {"key": "name",   "visible": True},
            {"key": "email",  "visible": True},
            {"key": "github", "visible": False},
        ],
    )
    out = renderer.render(_make_cv())
    assert "github.com/user" not in out


def test_classic_shows_github_when_visible():
    renderer = LaTeXRenderer(
        TEMPLATES_DIR, template="classic",
        personal_fields=[{"key": "github", "visible": True}],
    )
    out = renderer.render(_make_cv())
    assert "github.com/user" in out


def test_classic_github_label_override():
    renderer = LaTeXRenderer(
        TEMPLATES_DIR, template="classic",
        link_display="url",
        personal_fields=[{"key": "github", "visible": True, "link_display": "label"}],
    )
    out = renderer.render(_make_cv())
    assert "GitHub" in out
    assert "github.com/user" not in out.split("GitHub")[1][:30]


def test_classic_hides_phone_when_not_visible():
    renderer = LaTeXRenderer(
        TEMPLATES_DIR, template="classic",
        personal_fields=[{"key": "phone", "visible": False}],
    )
    out = renderer.render(_make_cv(phone="+1-555-0000"))
    assert "+1-555-0000" not in out


def test_classic_shows_all_fields_by_default():
    renderer = LaTeXRenderer(TEMPLATES_DIR, template="classic")
    cv = _make_cv(phone="+1-555-0000", location="Seoul", linkedin="linkedin.com/in/user")
    out = renderer.render(cv)
    assert "a@b.com" in out
    assert "+1-555-0000" in out
    assert "Seoul" in out
    assert "linkedin.com/in/user" in out or "LinkedIn" in out


@pytest.mark.parametrize("template", TEMPLATES_WITH_GITHUB_LINK)
def test_contact_visibility_hides_github_across_templates(template):
    renderer = LaTeXRenderer(
        TEMPLATES_DIR,
        template=template,
        personal_fields=[{"key": "github", "visible": False}],
    )
    out = renderer.render(_make_cv())
    assert r"\href{https://github.com/user}" not in out


@pytest.mark.parametrize("template", TEMPLATES_WITH_GITHUB_LINK)
def test_contact_link_style_override_applies_across_templates(template):
    renderer = LaTeXRenderer(
        TEMPLATES_DIR,
        template=template,
        link_display="url",
        personal_fields=[{"key": "github", "visible": True, "link_display": "label"}],
    )
    out = renderer.render(_make_cv())
    assert r"\href{https://github.com/user}{GitHub}" in out
