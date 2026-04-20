import pytest
from httpx import AsyncClient, ASGITransport

VALID_YAML = """
personal:
  name: Alice
  email: alice@example.com
"""

INVALID_YAML = """
personal:
  name: [unclosed bracket
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
    assert "heritage" in data["templates"]
    assert "validation" in data


async def test_validate_template_classic(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/templates/classic/validate")
    assert resp.status_code == 200
    data = resp.json()
    assert "valid" in data
    assert "errors" in data
    assert isinstance(data["errors"], list)


async def test_validate_template_not_found(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/templates/nonexistent/validate")
    assert resp.status_code == 404


async def test_get_templates_includes_validation(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/templates")
    assert resp.status_code == 200
    data = resp.json()
    assert "templates" in data
    assert "classic" in data["templates"]
    assert "validation" in data
    assert "classic" in data["validation"]
    assert "valid" in data["validation"]["classic"]


VALID_YAML_FULL = """
personal:
  name: Alice
  email: alice@example.com
summary: A brief summary.
"""

async def test_preview_pdf_invalid_yaml(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/preview/pdf", json={"yaml": INVALID_YAML, "template": "classic"})
    assert resp.status_code == 422
    assert resp.json()["error"] == "invalid_yaml"

async def test_preview_pdf_unknown_template(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/preview/pdf", json={"yaml": VALID_YAML, "template": "nonexistent"})
    assert resp.status_code == 422
    assert resp.json()["error"] == "unknown_template"

async def test_get_file_missing_returns_empty(app, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/file")
    assert resp.status_code == 200
    assert resp.json()["content"] == ""

async def test_get_file_existing_returns_content(app, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "mycv.yaml").write_text("personal:\n  name: Test\n")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/file")
    assert resp.status_code == 200
    assert "Test" in resp.json()["content"]

async def test_post_file_writes_content(app, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/file", json={"content": "personal:\n  name: Bob\n"})
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert (tmp_path / "mycv.yaml").read_text() == "personal:\n  name: Bob\n"

async def test_post_file_overwrites_existing(app, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "mycv.yaml").write_text("old content")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/file", json={"content": "new content"})
    assert resp.json()["ok"] is True
    assert (tmp_path / "mycv.yaml").read_text() == "new content"


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
