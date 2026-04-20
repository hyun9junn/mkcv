from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from typing import Optional, List

from fastapi import FastAPI
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.parsers.yaml_parser import parse_yaml, YAMLParseError, CVValidationError
from backend.renderers.markdown import MarkdownRenderer
from backend.renderers.latex import LaTeXRenderer

TEMPLATES_DIR = Path(__file__).parent / "templates"
OUTPUT_DIR = Path("output")
CV_FILE = Path("mycv.yaml")

app = FastAPI()


class CVRequest(BaseModel):
    yaml: str
    template: str = "classic"


class FileRequest(BaseModel):
    content: str


def _error(error_type: str, message: str, details: list[str] | None = None, status: int = 422):
    return JSONResponse(
        status_code=status,
        content={"error": error_type, "message": message, "details": details or []},
    )


def _template_exists(template: str) -> bool:
    return (TEMPLATES_DIR / template / "cv.tex.j2").exists()


@app.post("/api/validate")
async def validate(req: CVRequest):
    errors: list[str] = []
    try:
        parse_yaml(req.yaml)
    except YAMLParseError as e:
        errors.extend(e.details or [e.message])
    except CVValidationError as e:
        errors.extend(e.errors)

    if not _template_exists(req.template):
        errors.append(f"Unknown template: '{req.template}'")

    return {"valid": len(errors) == 0, "errors": errors}


@app.post("/api/preview")
async def preview(req: CVRequest):
    try:
        cv = parse_yaml(req.yaml)
    except YAMLParseError as e:
        return _error("invalid_yaml", e.message, e.details)
    except CVValidationError as e:
        return _error("validation_error", e.message, e.errors)

    return {"markdown": MarkdownRenderer().render(cv)}


@app.post("/api/export/markdown")
async def export_markdown(req: CVRequest):
    try:
        cv = parse_yaml(req.yaml)
    except YAMLParseError as e:
        return _error("invalid_yaml", e.message, e.details)
    except CVValidationError as e:
        return _error("validation_error", e.message, e.errors)

    content = MarkdownRenderer().render(cv)
    OUTPUT_DIR.mkdir(exist_ok=True)
    (OUTPUT_DIR / "cv.md").write_text(content)
    return Response(
        content=content,
        media_type="text/markdown",
        headers={"Content-Disposition": "attachment; filename=cv.md"},
    )


@app.post("/api/export/latex")
async def export_latex(req: CVRequest):
    try:
        cv = parse_yaml(req.yaml)
    except YAMLParseError as e:
        return _error("invalid_yaml", e.message, e.details)
    except CVValidationError as e:
        return _error("validation_error", e.message, e.errors)

    if not _template_exists(req.template):
        return _error("unknown_template", f"Template '{req.template}' not found")

    content = LaTeXRenderer(TEMPLATES_DIR, template=req.template).render(cv)
    OUTPUT_DIR.mkdir(exist_ok=True)
    (OUTPUT_DIR / "cv.tex").write_text(content)
    return Response(
        content=content,
        media_type="application/x-latex",
        headers={"Content-Disposition": "attachment; filename=cv.tex"},
    )


@app.post("/api/export/pdf")
async def export_pdf(req: CVRequest):
    try:
        cv = parse_yaml(req.yaml)
    except YAMLParseError as e:
        return _error("invalid_yaml", e.message, e.details)
    except CVValidationError as e:
        return _error("validation_error", e.message, e.errors)

    if not _template_exists(req.template):
        return _error("unknown_template", f"Template '{req.template}' not found")

    latex_content = LaTeXRenderer(TEMPLATES_DIR, template=req.template).render(cv)

    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = Path(tmpdir) / "cv.tex"
        tex_path.write_text(latex_content)
        try:
            result = subprocess.run(
                ["pdflatex", "-interaction=nonstopmode", "cv.tex"],
                cwd=tmpdir,
                capture_output=True,
                timeout=30,
                text=True,
            )
        except subprocess.TimeoutExpired:
            return _error("pdf_generation_failed", "pdflatex timed out after 30 seconds")
        except FileNotFoundError:
            return _error("pdf_generation_failed", "pdflatex not found — install TeX Live or MiKTeX")

        if result.returncode != 0:
            details = [line for line in result.stderr.splitlines() if line.strip()]
            return _error("pdf_generation_failed", "pdflatex exited with errors", details)

        pdf_bytes = (Path(tmpdir) / "cv.pdf").read_bytes()

    OUTPUT_DIR.mkdir(exist_ok=True)
    (OUTPUT_DIR / "cv.pdf").write_bytes(pdf_bytes)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=cv.pdf"},
    )


@app.post("/api/preview/pdf")
async def preview_pdf(req: CVRequest):
    try:
        cv = parse_yaml(req.yaml)
    except YAMLParseError as e:
        return _error("invalid_yaml", e.message, e.details)
    except CVValidationError as e:
        return _error("validation_error", e.message, e.errors)

    if not _template_exists(req.template):
        return _error("unknown_template", f"Template '{req.template}' not found")

    latex_content = LaTeXRenderer(TEMPLATES_DIR, template=req.template).render(cv)

    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = Path(tmpdir) / "cv.tex"
        tex_path.write_text(latex_content)
        try:
            result = subprocess.run(
                ["pdflatex", "-interaction=nonstopmode", "cv.tex"],
                cwd=tmpdir,
                capture_output=True,
                timeout=30,
                text=True,
            )
        except subprocess.TimeoutExpired:
            return _error("pdf_generation_failed", "pdflatex timed out after 30 seconds")
        except FileNotFoundError:
            return _error("pdf_generation_failed", "pdflatex not found — install TeX Live or MiKTeX")

        if result.returncode != 0:
            error_lines = [l for l in result.stdout.splitlines() if l.startswith("!")]
            details = error_lines or [l for l in result.stderr.splitlines() if l.strip()]
            return _error("pdf_generation_failed", "pdflatex exited with errors", details)

        pdf_bytes = (Path(tmpdir) / "cv.pdf").read_bytes()

    return Response(content=pdf_bytes, media_type="application/pdf")


@app.get("/api/file")
async def get_file():
    if not CV_FILE.exists():
        return {"content": ""}
    return {"content": CV_FILE.read_text()}


@app.post("/api/file")
async def save_file(req: FileRequest):
    try:
        CV_FILE.write_text(req.content)
        return {"ok": True}
    except OSError as e:
        return _error("file_write_failed", str(e), status=500)


@app.get("/api/templates")
async def list_templates():
    templates = sorted(
        d.name for d in TEMPLATES_DIR.iterdir()
        if d.is_dir() and (d / "cv.tex.j2").exists()
    )
    return {"templates": templates}


# Serve frontend — must come after all API routes
frontend_dir = Path("frontend")
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
