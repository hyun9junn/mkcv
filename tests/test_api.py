import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest
from httpx import AsyncClient, ASGITransport
from tests.conftest import xelatex_available

VALID_YAML = """
personal:
  name: Alice
  email: alice@example.com
"""

INVALID_YAML = """
personal:
  name: [unclosed bracket
"""

SPECIAL_CHAR_YAML = """
personal:
  name: Alice
  email: alice@example.com
summary: %growth
"""

BAD_FIELDS_YAML = """
summary: "no personal section"
"""


@pytest.fixture
def app():
    from backend.main import app
    return app


async def test_validate_valid(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/validate", json={"yaml": VALID_YAML, "template": "classic"})
    assert resp.status_code == 200
    assert resp.json()["valid"] is True
    assert resp.json()["errors"] == []


async def test_validate_invalid_yaml(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/validate", json={"yaml": INVALID_YAML, "template": "classic"})
    data = resp.json()
    assert data["valid"] is False
    assert len(data["errors"]) > 0


async def test_validate_missing_required(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/validate", json={"yaml": BAD_FIELDS_YAML, "template": "classic"})
    assert resp.json()["valid"] is False


async def test_validate_unknown_template(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/validate", json={"yaml": VALID_YAML, "template": "nonexistent"})
    data = resp.json()
    assert data["valid"] is False
    assert any("nonexistent" in e for e in data["errors"])


async def test_preview_returns_markdown(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/preview", json={"yaml": VALID_YAML, "template": "classic"})
    assert resp.status_code == 200
    assert "Alice" in resp.json()["markdown"]


async def test_preview_invalid_yaml_returns_error(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/preview", json={"yaml": INVALID_YAML, "template": "classic"})
    assert resp.status_code == 422
    assert resp.json()["error"] == "invalid_yaml"


async def test_export_markdown(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/export/markdown", json={"yaml": VALID_YAML, "template": "classic"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/markdown")
    assert "Alice" in resp.text


async def test_export_latex(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/export/latex", json={"yaml": VALID_YAML, "template": "classic"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/x-latex")
    assert "Alice" in resp.text


async def test_export_latex_respects_link_display(app):
    yaml = """
personal:
  name: Alice
  email: alice@example.com
  github: github.com/alice
"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/export/latex",
            json={"yaml": yaml, "template": "classic", "link_display": "both"},
        )
    assert resp.status_code == 200
    assert r"\href{https://github.com/alice}{GitHub (github.com/alice)}" in resp.text


async def test_export_unknown_template_returns_error(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/export/latex", json={"yaml": VALID_YAML, "template": "nonexistent"})
    assert resp.status_code == 422
    assert resp.json()["error"] == "unknown_template"


async def test_get_templates(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/templates")
    assert resp.status_code == 200
    data = resp.json()
    assert "classic" in data["templates"]
    assert "chancellor" in data["templates"]
    assert "heritage" not in data["templates"]
    assert "validation" in data


@xelatex_available
async def test_validate_template_classic(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/templates/classic/validate")
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is True
    assert "valid" in data
    assert "errors" in data
    assert isinstance(data["errors"], list)


async def test_validate_template_not_found(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/templates/nonexistent/validate")
    assert resp.status_code == 404


@xelatex_available
async def test_get_templates_includes_validation(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/templates")
    assert resp.status_code == 200
    data = resp.json()
    assert "templates" in data
    assert "classic" in data["templates"]
    assert "scholar-index" in data["templates"]
    assert "validation" in data
    assert "classic" in data["validation"]
    assert "valid" in data["validation"]["classic"]
    assert data["validation"]["classic"]["valid"] is True


VALID_YAML_FULL = """
personal:
  name: Alice
  email: alice@example.com
summary: A brief summary.
"""


def _preview_pdf_payload(name: str, preview_session_id: str, preview_request_seq: int) -> dict:
    return {
        "yaml": f"""
personal:
  name: {name}
  email: {name.lower().replace(" ", ".")}@example.com
summary: Preview request for {name}
""",
        "template": "classic",
        "preview_session_id": preview_session_id,
        "preview_request_seq": preview_request_seq,
    }


def _fake_pdf_compile_result() -> SimpleNamespace:
    return SimpleNamespace(returncode=0, stdout="", stderr="")


def _fake_pdf_compile_failure_result(message: str = "! simulated xelatex failure") -> SimpleNamespace:
    return SimpleNamespace(returncode=1, stdout=message, stderr="")

async def test_preview_pdf_invalid_yaml(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/preview/pdf", json={"yaml": INVALID_YAML, "template": "classic"})
    assert resp.status_code == 422
    assert resp.json()["error"] == "invalid_yaml"


async def test_preview_pdf_invalid_yaml_with_plain_text_special_chars_returns_hint(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/preview/pdf", json={"yaml": SPECIAL_CHAR_YAML, "template": "classic"})
    assert resp.status_code == 422
    data = resp.json()
    assert data["error"] == "invalid_yaml"
    assert any("wrap the value in quotes" in detail.lower() for detail in data["details"])

async def test_preview_pdf_unknown_template(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/preview/pdf", json={"yaml": VALID_YAML, "template": "nonexistent"})
    assert resp.status_code == 422
    assert resp.json()["error"] == "unknown_template"


async def test_preview_pdf_stale_preview_for_older_request_in_same_session(app, monkeypatch):
    from backend import main as backend_main

    backend_main._preview_sessions.clear()
    first_compile_started = asyncio.Event()
    allow_first_compile_to_finish = asyncio.Event()

    async def fake_to_thread(func, *args, **kwargs):
        if func is backend_main.subprocess.run:
            tmpdir = Path(kwargs["cwd"])
            latex_source = (tmpdir / "cv.tex").read_text()
            if "Alice One" in latex_source:
                first_compile_started.set()
                await allow_first_compile_to_finish.wait()
                (tmpdir / "cv.pdf").write_bytes(b"%PDF-1")
                return _fake_pdf_compile_result()
            if "Alice Two" in latex_source:
                (tmpdir / "cv.pdf").write_bytes(b"%PDF-2")
                return _fake_pdf_compile_result()
            raise AssertionError(f"Unexpected compile payload: {latex_source}")
        return func(*args, **kwargs)

    monkeypatch.setattr(backend_main.asyncio, "to_thread", fake_to_thread)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        first_task = asyncio.create_task(
            client.post("/api/preview/pdf", json=_preview_pdf_payload("Alice One", "stale-session-a", 1))
        )
        await first_compile_started.wait()

        second_task = asyncio.create_task(
            client.post("/api/preview/pdf", json=_preview_pdf_payload("Alice Two", "stale-session-a", 2))
        )

        allow_first_compile_to_finish.set()
        first_resp, second_resp = await asyncio.gather(first_task, second_task)

    assert first_resp.status_code == 409
    assert first_resp.json()["error"] == "stale_preview"
    assert second_resp.status_code == 200
    assert second_resp.headers["content-type"] == "application/pdf"


async def test_preview_pdf_keeps_sessions_isolated(app, monkeypatch):
    from backend import main as backend_main

    backend_main._preview_sessions.clear()
    first_compile_started = asyncio.Event()
    allow_first_compile_to_finish = asyncio.Event()

    async def fake_to_thread(func, *args, **kwargs):
        if func is backend_main.subprocess.run:
            tmpdir = Path(kwargs["cwd"])
            latex_source = (tmpdir / "cv.tex").read_text()
            if "Alpha One" in latex_source:
                first_compile_started.set()
                await allow_first_compile_to_finish.wait()
                (tmpdir / "cv.pdf").write_bytes(b"%PDF-alpha-1")
                return _fake_pdf_compile_result()
            if "Alpha Two" in latex_source:
                (tmpdir / "cv.pdf").write_bytes(b"%PDF-alpha-2")
                return _fake_pdf_compile_result()
            if "Bravo One" in latex_source:
                (tmpdir / "cv.pdf").write_bytes(b"%PDF-bravo-1")
                return _fake_pdf_compile_result()
            raise AssertionError(f"Unexpected compile payload: {latex_source}")
        return func(*args, **kwargs)

    monkeypatch.setattr(backend_main.asyncio, "to_thread", fake_to_thread)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        alpha_one_task = asyncio.create_task(
            client.post("/api/preview/pdf", json=_preview_pdf_payload("Alpha One", "isolated-session-a", 1))
        )
        await first_compile_started.wait()

        alpha_two_task = asyncio.create_task(
            client.post("/api/preview/pdf", json=_preview_pdf_payload("Alpha Two", "isolated-session-a", 2))
        )
        bravo_one_task = asyncio.create_task(
            client.post("/api/preview/pdf", json=_preview_pdf_payload("Bravo One", "isolated-session-b", 1))
        )

        bravo_resp = await asyncio.wait_for(bravo_one_task, timeout=0.5)
        allow_first_compile_to_finish.set()
        alpha_one_resp, alpha_two_resp = await asyncio.gather(alpha_one_task, alpha_two_task)

    assert bravo_resp.status_code == 200
    assert bravo_resp.headers["content-type"] == "application/pdf"
    assert alpha_one_resp.status_code == 409
    assert alpha_one_resp.json()["error"] == "stale_preview"
    assert alpha_two_resp.status_code == 200


async def test_preview_pdf_newer_invalid_request_supersedes_older_inflight_valid_request(app, monkeypatch):
    from backend import main as backend_main

    backend_main._preview_sessions.clear()
    first_compile_started = asyncio.Event()
    allow_first_compile_to_finish = asyncio.Event()

    async def fake_to_thread(func, *args, **kwargs):
        if func is backend_main.subprocess.run:
            tmpdir = Path(kwargs["cwd"])
            latex_source = (tmpdir / "cv.tex").read_text()
            if "Valid First" in latex_source:
                first_compile_started.set()
                await allow_first_compile_to_finish.wait()
                (tmpdir / "cv.pdf").write_bytes(b"%PDF-valid-first")
                return _fake_pdf_compile_result()
            raise AssertionError(f"Unexpected compile payload: {latex_source}")
        return func(*args, **kwargs)

    monkeypatch.setattr(backend_main.asyncio, "to_thread", fake_to_thread)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        first_task = asyncio.create_task(
            client.post("/api/preview/pdf", json=_preview_pdf_payload("Valid First", "supersede-invalid", 1))
        )
        await first_compile_started.wait()

        invalid_resp = await asyncio.wait_for(
            client.post(
                "/api/preview/pdf",
                json={
                    "yaml": INVALID_YAML,
                    "template": "classic",
                    "preview_session_id": "supersede-invalid",
                    "preview_request_seq": 2,
                },
            ),
            timeout=0.5,
        )

        allow_first_compile_to_finish.set()
        first_resp = await first_task

    assert invalid_resp.status_code == 422
    assert invalid_resp.json()["error"] == "invalid_yaml"
    assert first_resp.status_code == 409
    assert first_resp.json()["error"] == "stale_preview"


async def test_preview_pdf_stale_preview_wins_over_outdated_compile_failure(app, monkeypatch):
    from backend import main as backend_main

    backend_main._preview_sessions.clear()
    first_compile_started = asyncio.Event()
    allow_first_compile_to_finish = asyncio.Event()

    async def fake_to_thread(func, *args, **kwargs):
        if func is backend_main.subprocess.run:
            tmpdir = Path(kwargs["cwd"])
            latex_source = (tmpdir / "cv.tex").read_text()
            if "Failing First" in latex_source:
                first_compile_started.set()
                await allow_first_compile_to_finish.wait()
                return _fake_pdf_compile_failure_result()
            if "Recovery Second" in latex_source:
                (tmpdir / "cv.pdf").write_bytes(b"%PDF-recovery-second")
                return _fake_pdf_compile_result()
            raise AssertionError(f"Unexpected compile payload: {latex_source}")
        return func(*args, **kwargs)

    monkeypatch.setattr(backend_main.asyncio, "to_thread", fake_to_thread)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        first_task = asyncio.create_task(
            client.post("/api/preview/pdf", json=_preview_pdf_payload("Failing First", "compile-failure-stale", 1))
        )
        await first_compile_started.wait()

        second_task = asyncio.create_task(
            client.post("/api/preview/pdf", json=_preview_pdf_payload("Recovery Second", "compile-failure-stale", 2))
        )

        allow_first_compile_to_finish.set()
        first_resp, second_resp = await asyncio.gather(first_task, second_task)

    assert first_resp.status_code == 409
    assert first_resp.json()["error"] == "stale_preview"
    assert second_resp.status_code == 200
    assert second_resp.headers["content-type"] == "application/pdf"

async def test_schema_returns_200(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/schema")
    assert resp.status_code == 200


async def test_schema_has_root_keys(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/schema")
    data = resp.json()
    assert "__root__" in data
    root = data["__root__"]
    assert "keys" in root
    assert "personal" in root["keys"]
    assert "experience" in root["keys"]
    assert "personal" in root["required"]


async def test_schema_has_personal_keys(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/schema")
    data = resp.json()
    assert "personal" in data
    personal = data["personal"]
    assert "email" in personal["keys"]
    assert "huggingface" in personal["keys"]
    assert "name" in personal["required"]
    assert "email" in personal["required"]


async def test_schema_has_experience_list_context(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/schema")
    data = resp.json()
    assert "experience[]" in data
    exp = data["experience[]"]
    assert "title" in exp["keys"]
    assert "company" in exp["keys"]
    assert "highlights" in exp["list_keys"]
    assert "title" in exp["required"]


async def test_schema_required_field_star_not_in_keys(app):
    """Required annotation is metadata only — all keys appear in 'keys' list."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/schema")
    assert resp.status_code == 200
    data = resp.json()
    for context_key, ctx in data.items():
        for req_field in ctx.get("required", []):
            assert req_field in ctx["keys"], (
                f"Required field '{req_field}' in '{context_key}' must also be in 'keys'"
            )


async def test_templates_response_has_meta_field(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/templates")
    data = resp.json()
    assert "meta" in data
    assert "classic" in data["meta"]

async def test_templates_meta_has_display_name(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/templates")
    data = resp.json()
    assert data["meta"]["classic"]["display_name"] == "Classic"


async def test_templates_meta_includes_defaults_block(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/templates")
    assert resp.status_code == 200
    data = resp.json()

    defaults = data["meta"]["classic"]["defaults"]
    assert defaults["layout"]["density"] in {"comfortable", "balanced", "compact"}
    assert defaults["layout"]["font_scale"] in {"small", "normal", "large"}
    assert defaults["personal"]["default_link_display"] in {"label", "url", "both"}
    assert any(section["key"] == "summary" for section in defaults["sections"])


async def test_templates_meta_exposes_ui_and_render_blocks(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/templates")
    assert resp.status_code == 200
    data = resp.json()

    assert data["meta"]["classic"]["ui"] == {"badge": "Default"}
    assert data["meta"]["classic"]["render"] == {"section_title_case": "title"}


async def test_export_latex_with_density_and_font_scale(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/export/latex", json={
            "yaml": VALID_YAML,
            "template": "classic",
            "density": "compact",
            "font_scale": "small",
        })
    assert resp.status_code == 200
    content = resp.text
    assert "Alice" in content
    assert "\\documentclass" in content


async def test_export_latex_invalid_density_returns_422(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/export/latex", json={
            "yaml": VALID_YAML,
            "template": "classic",
            "density": "INVALID",
        })
    assert resp.status_code == 422


@xelatex_available
async def test_preview_pdf_accepts_personal_fields(app):
    """personal_fields is accepted by the API without error; a valid PDF is returned."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/preview/pdf", json={
            "yaml": "personal:\n  name: Test\n  email: t@test.com\n  github: github.com/test\n",
            "template": "classic",
            "personal_fields": [
                {"key": "name",   "visible": True},
                {"key": "email",  "visible": True},
                {"key": "github", "visible": False},
            ],
        })
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"


@xelatex_available
async def test_preview_pdf_personal_fields_defaults_to_empty(app):
    """Omitting personal_fields does not cause an error."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/preview/pdf", json={
            "yaml": "personal:\n  name: Test\n  email: t@test.com\n",
            "template": "classic",
        })
    assert resp.status_code == 200


@xelatex_available
async def test_preview_pdf_accepts_korean_resume_content(app):
    yaml = """
personal:
  name: 홍길동
  email: hong@example.com
summary: 한글 요약 테스트입니다. English mixed.
"""

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/preview/pdf", json={
            "yaml": yaml,
            "template": "classic",
        })

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"


async def test_export_markdown_no_disk_write(app, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/export/markdown", json={"yaml": VALID_YAML, "template": "classic"})
    assert resp.status_code == 200
    assert not (tmp_path / "output").exists()


async def test_export_latex_no_disk_write(app, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/export/latex", json={"yaml": VALID_YAML, "template": "classic"})
    assert resp.status_code == 200
    assert not (tmp_path / "output").exists()


async def test_export_pdf_no_disk_write(app, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/api/export/pdf", json={"yaml": VALID_YAML, "template": "classic"})
    # PDF generation may fail if the TeX engine is absent — no output/ dir must exist regardless
    assert not (tmp_path / "output").exists()


async def test_file_endpoint_removed(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/file")
    assert resp.status_code == 404


async def test_file_post_endpoint_removed(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/file", json={"content": "test"})
    assert resp.status_code in (404, 405)


async def test_settings_get_removed(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/settings")
    assert resp.status_code == 404


async def test_settings_post_removed(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/settings", json={"content": "layout:\n  density: balanced\n"})
    assert resp.status_code in (404, 405)


async def test_settings_no_disk_write(app, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/api/export/markdown", json={"yaml": VALID_YAML, "template": "classic"})
        await client.post("/api/export/latex", json={"yaml": VALID_YAML, "template": "classic"})
    assert not (tmp_path / "settings.yaml").exists()
