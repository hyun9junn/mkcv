from __future__ import annotations

import subprocess
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, List

import jinja2
from fastapi import FastAPI
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.parsers.yaml_parser import parse_yaml, YAMLParseError, CVValidationError
from backend.renderers.markdown import MarkdownRenderer
from backend.renderers.latex import LaTeXRenderer
from backend.models import (
    CVData, PersonalInfo, ExperienceItem, EducationItem, SkillGroup,
    ProjectItem, CertificationItem, PublicationItem, LanguageItem,
    AwardItem, ExtracurricularItem,
)

TEMPLATES_DIR = Path(__file__).parent / "templates"
OUTPUT_DIR = Path("output")
CV_FILE = Path("mycv.yaml")

_SAMPLE_CV = CVData(
    personal=PersonalInfo(name="Test User", email="test@example.com", phone="+1-000-0000", location="City, Country"),
    summary="A brief summary.",
    experience=[ExperienceItem(title="Engineer", company="Corp", start_date="2020", end_date="2023", highlights=["Did things"])],
    education=[EducationItem(degree="B.S. CS", institution="University", year="2020")],
    skills=[SkillGroup(category="Languages", items=["Python"])],
    projects=[ProjectItem(name="Project", description="A project", highlights=["Feature"])],
    certifications=[CertificationItem(name="Cert", issuer="Org", date="2022")],
    publications=[PublicationItem(title="Paper", venue="Journal", date="2023")],
    languages=[LanguageItem(language="English", proficiency="Native")],
    awards=[AwardItem(name="Award", issuer="Org", date="2023")],
    extracurricular=[ExtracurricularItem(title="Club", organization="Org", highlights=["Led team"])],
)

_template_validation_cache: dict[str, dict] = {}


def _validate_template(name: str) -> dict:
    # Stage 1: Jinja2 render with StrictUndefined
    try:
        env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(str(TEMPLATES_DIR / name)),
            block_start_string="<%",
            block_end_string="%>",
            variable_start_string="<<",
            variable_end_string=">>",
            comment_start_string="<#",
            comment_end_string="#>",
            undefined=jinja2.StrictUndefined,
        )
        template = env.get_template("cv.tex.j2")
        rendered = template.render(cv=_SAMPLE_CV)
    except jinja2.TemplateSyntaxError as e:
        return {"valid": False, "errors": [f"Jinja2 syntax error: {e}"]}
    except jinja2.UndefinedError as e:
        return {"valid": False, "errors": [f"Jinja2 undefined variable: {e}"]}
    except Exception as e:
        return {"valid": False, "errors": [f"Jinja2 render error: {e}"]}

    # Stage 2: pdflatex compilation
    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = Path(tmpdir) / "cv.tex"
        tex_path.write_text(rendered)
        try:
            result = subprocess.run(
                ["pdflatex", "-interaction=nonstopmode", "cv.tex"],
                cwd=tmpdir,
                capture_output=True,
                timeout=30,
                text=True,
            )
        except subprocess.TimeoutExpired:
            return {"valid": False, "errors": ["pdflatex timed out after 30 seconds"]}
        except FileNotFoundError:
            return {"valid": False, "errors": ["pdflatex not found — install TeX Live or MiKTeX"]}

        if result.returncode != 0:
            error_lines = [line for line in result.stdout.splitlines() if line.startswith("!")]
            errors = error_lines or [line for line in result.stderr.splitlines() if line.strip()]
            return {"valid": False, "errors": errors}

    return {"valid": True, "errors": []}


@asynccontextmanager
async def lifespan(app: FastAPI):
    for template_dir in sorted(TEMPLATES_DIR.iterdir()):
        if template_dir.is_dir() and (template_dir / "cv.tex.j2").exists():
            _template_validation_cache[template_dir.name] = _validate_template(template_dir.name)
    yield


app = FastAPI(lifespan=lifespan)


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
    return {
        "templates": templates,
        "validation": {
            name: _template_validation_cache.get(name, {"valid": None, "errors": []})
            for name in templates
        },
    }


@app.post("/api/templates/{name}/validate")
async def validate_template(name: str):
    if not _template_exists(name):
        return JSONResponse(status_code=404, content={"error": "not_found", "message": f"Template '{name}' not found"})
    result = _validate_template(name)
    _template_validation_cache[name] = result
    return result


# Serve frontend — must come after all API routes
frontend_dir = Path("frontend")
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
