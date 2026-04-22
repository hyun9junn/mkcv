import pytest
from pathlib import Path
from backend.renderers.latex import LaTeXRenderer, _build_layout_preamble, _FONT_SIZE, _make_jinja_filters

TEMPLATES_DIR = Path("backend/templates")


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
    # academic-research: 22pt base, 1.18 ratio → short name → 22pt/26pt (same as original)
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
