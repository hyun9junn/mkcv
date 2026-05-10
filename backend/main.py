from __future__ import annotations

import asyncio
import subprocess
import tempfile
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
import time
from typing import Literal, Optional, List
import typing

import jinja2
from fastapi import FastAPI
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.parsers.yaml_parser import parse_yaml, YAMLParseError, CVValidationError
from backend.renderers.markdown import MarkdownRenderer
from backend.services.pdf_compiler import compile_pdf
from backend.templates.meta import load_template_meta
from backend.renderers.latex import (
    LaTeXRenderer,
    _build_layout_preamble,
    _build_xelatex_preamble,
    _FONT_SIZE,
    _make_jinja_filters,
    _make_link_text_fn,
    _make_contact_helpers,
)
from backend.models import (
    CVData, PersonalInfo, ExperienceItem, EducationItem, SkillGroup,
    ProjectItem, CertificationItem, PublicationItem, LanguageItem,
    AwardItem, ExtracurricularItem, CustomSection, CustomBlock,
)

TEMPLATES_DIR = Path(__file__).parent / "templates"

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
    custom_sections=[
        CustomSection(
            key="custom-sample",
            title="Sample Custom Section",
            content=[
                CustomBlock(type="bullets", items=["Item one", "Item two"]),
            ],
        )
    ],
)

_template_validation_cache: dict[str, dict] = {}
_template_meta_cache: dict[str, dict] = {}
_CV_SCHEMA_CACHE: dict | None = None
_PREVIEW_SESSION_TTL_SECONDS = 60.0


@dataclass
class _PreviewSessionState:
    latest_seq: int = -1
    active_requests: int = 0
    last_touched: float = 0.0
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


_preview_sessions: dict[str, _PreviewSessionState] = {}



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
            trim_blocks=True,
            lstrip_blocks=True,
            undefined=jinja2.StrictUndefined,
        )
        env.filters.update(_make_jinja_filters())
        env.globals['link_text'] = _make_link_text_fn("label")
        _cv_fn, _cs_fn = _make_contact_helpers([], "label")
        env.globals['contact_visible'] = _cv_fn
        env.globals['contact_link_style'] = _cs_fn
        template = env.get_template("cv.tex.j2")
        default_order = ["summary", "experience", "education", "skills", "projects", "certifications", "publications", "languages", "awards", "extracurricular", "custom-sample"]
        custom_by_key = {cs.key: cs for cs in _SAMPLE_CV.custom_sections}
        rendered = template.render(
            cv=_SAMPLE_CV,
            section_order=default_order,
            custom_by_key=custom_by_key,
            font_size=_FONT_SIZE["normal"],
            layout_preamble=_build_layout_preamble("balanced"),
            section_titles={},
            xelatex_preamble=_build_xelatex_preamble(TEMPLATES_DIR, name),
        )
    except jinja2.TemplateSyntaxError as e:
        return {"valid": False, "errors": [f"Jinja2 syntax error: {e}"]}
    except jinja2.UndefinedError as e:
        return {"valid": False, "errors": [f"Jinja2 undefined variable: {e}"]}
    except Exception as e:
        return {"valid": False, "errors": [f"Jinja2 render error: {e}"]}

    # Stage 2: xelatex compilation
    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = Path(tmpdir) / "cv.tex"
        tex_path.write_text(rendered)
        try:
            result = subprocess.run(
                ["xelatex", "-interaction=nonstopmode", "cv.tex"],
                cwd=tmpdir,
                capture_output=True,
                timeout=30,
                text=True,
            )
        except subprocess.TimeoutExpired:
            return {"valid": False, "errors": ["xelatex timed out after 30 seconds"]}
        except FileNotFoundError:
            return {"valid": False, "errors": ["xelatex not found — install TeX Live or MiKTeX"]}

        if result.returncode != 0:
            error_lines = [line for line in result.stdout.splitlines() if line.startswith("!")]
            errors = error_lines or [line for line in result.stderr.splitlines() if line.strip()]
            return {"valid": False, "errors": errors}

    return {"valid": True, "errors": []}


@asynccontextmanager
async def lifespan(app: FastAPI):
    for template_dir in sorted(TEMPLATES_DIR.iterdir()):
        if template_dir.is_dir():
            if (template_dir / "cv.tex.j2").exists():
                _template_validation_cache[template_dir.name] = await asyncio.to_thread(_validate_template, template_dir.name)
            if (template_dir / "cv.tex.j2").exists() or (template_dir / "meta.yaml").exists():
                _template_meta_cache[template_dir.name] = load_template_meta(str(template_dir))
    yield


app = FastAPI(lifespan=lifespan)


class CVRequest(BaseModel):
    yaml: str
    template: str = "classic"
    section_order: Optional[List[str]] = None
    section_titles: Optional[dict] = None
    density: Literal["comfortable", "balanced", "compact"] = "balanced"
    font_scale: Literal["small", "normal", "large"] = "normal"
    link_display: Literal["label", "url", "both"] = "label"
    personal_fields: Optional[List[dict]] = None
    preview_session_id: Optional[str] = None
    preview_request_seq: Optional[int] = None


def _strip_internal_keys(meta: dict) -> dict:
    """Remove _-prefixed implementation-detail keys before serialization."""
    return {k: v for k, v in meta.items() if not k.startswith("_")}


def _error(error_type: str, message: str, details: list[str] | None = None, status: int = 422):
    return JSONResponse(
        status_code=status,
        content={"error": error_type, "message": message, "details": details or []},
    )


def _template_exists(template: str) -> bool:
    return (TEMPLATES_DIR / template / "cv.tex.j2").exists()


def _cleanup_preview_sessions(now: float) -> None:
    expired_session_ids = [
        session_id
        for session_id, state in _preview_sessions.items()
        if state.active_requests == 0 and (now - state.last_touched) > _PREVIEW_SESSION_TTL_SECONDS
    ]
    for session_id in expired_session_ids:
        _preview_sessions.pop(session_id, None)


def _get_preview_session_state(session_id: str) -> _PreviewSessionState:
    now = time.monotonic()
    _cleanup_preview_sessions(now)
    state = _preview_sessions.get(session_id)
    if state is None:
        state = _PreviewSessionState(last_touched=now)
        _preview_sessions[session_id] = state
        return state

    state.last_touched = now
    return state


def _touch_preview_session_state(state: _PreviewSessionState) -> None:
    state.last_touched = time.monotonic()


def _preview_stale_response(session_id: str, request_seq: int, latest_seq: int) -> JSONResponse:
    return _error(
        "stale_preview",
        f"Preview request {request_seq} for session '{session_id}' is stale",
        [f"Latest preview request sequence is {latest_seq}"],
        status=409,
    )


def _record_preview_request(session_id: str, request_seq: int) -> _PreviewSessionState:
    state = _get_preview_session_state(session_id)
    state.active_requests += 1
    state.latest_seq = max(state.latest_seq, request_seq)
    _touch_preview_session_state(state)
    return state


def _stale_preview_response_if_needed(
    session_state: Optional[_PreviewSessionState],
    session_id: Optional[str],
    request_seq: Optional[int],
) -> Optional[JSONResponse]:
    if session_state is None or session_id is None or request_seq is None:
        return None

    _touch_preview_session_state(session_state)
    if request_seq < session_state.latest_seq:
        return _preview_stale_response(session_id, request_seq, session_state.latest_seq)

    return None




def _build_cv_schema() -> dict:
    """Derive autocomplete schema from Pydantic models."""
    from pydantic_core import PydanticUndefinedType

    def _model_info(model_class) -> dict:
        keys = []
        required = []
        list_keys = []
        for field_name, field_info in model_class.model_fields.items():
            keys.append(field_name)
            # Required if no default (default is PydanticUndefined)
            if isinstance(field_info.default, PydanticUndefinedType):
                required.append(field_name)
            # list_keys: fields whose annotation is list[...]
            ann = field_info.annotation
            origin = typing.get_origin(ann)
            if origin is list:
                list_keys.append(field_name)
        return {"keys": keys, "required": required, "list_keys": list_keys}

    list_section_map = {
        "experience[]": ExperienceItem,
        "education[]": EducationItem,
        "skills[]": SkillGroup,
        "projects[]": ProjectItem,
        "certifications[]": CertificationItem,
        "publications[]": PublicationItem,
        "languages[]": LanguageItem,
        "awards[]": AwardItem,
        "extracurricular[]": ExtracurricularItem,
        "custom_sections[]": CustomSection,
    }

    schema: dict = {}

    # Root level — CVData fields (no list_keys at root; lists are sections, not values)
    root_info = _model_info(CVData)
    schema["__root__"] = {
        "keys": root_info["keys"],
        "required": root_info["required"],
        "list_keys": [],  # root list keys are section headers, not block sequences
    }

    # personal block (scalar mapping, not a list section)
    schema["personal"] = _model_info(PersonalInfo)

    # Each list section
    for context_key, model_class in list_section_map.items():
        schema[context_key] = _model_info(model_class)

    schema["custom_sections[].content[]"] = {
        "keys": ["type", "value", "items", "pairs"],
        "required": ["type"],
        "list_keys": ["items", "pairs"],
    }

    return schema


@app.get("/api/schema")
async def get_schema():
    global _CV_SCHEMA_CACHE
    if _CV_SCHEMA_CACHE is None:
        _CV_SCHEMA_CACHE = _build_cv_schema()
    return _CV_SCHEMA_CACHE


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

    return {"markdown": MarkdownRenderer().render(cv, req.section_order)}


@app.post("/api/export/markdown")
async def export_markdown(req: CVRequest):
    try:
        cv = parse_yaml(req.yaml)
    except YAMLParseError as e:
        return _error("invalid_yaml", e.message, e.details)
    except CVValidationError as e:
        return _error("validation_error", e.message, e.errors)

    content = MarkdownRenderer().render(cv, req.section_order)
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

    renderer = LaTeXRenderer(
        TEMPLATES_DIR,
        template=req.template,
        density=req.density,
        font_scale=req.font_scale,
        link_display=req.link_display,
        personal_fields=req.personal_fields or [],
    )
    content = renderer.render(cv, req.section_order, req.section_titles)
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

    renderer = LaTeXRenderer(
        TEMPLATES_DIR,
        template=req.template,
        density=req.density,
        font_scale=req.font_scale,
        link_display=req.link_display,
        personal_fields=req.personal_fields or [],
    )
    latex_content = renderer.render(cv, req.section_order, req.section_titles)

    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = Path(tmpdir) / "cv.tex"
        tex_path.write_text(latex_content)
        try:
            result = await asyncio.to_thread(
                subprocess.run,
                ["xelatex", "-interaction=nonstopmode", "cv.tex"],
                cwd=tmpdir,
                capture_output=True,
                timeout=30,
                text=True,
            )
        except subprocess.TimeoutExpired:
            return _error("pdf_generation_failed", "xelatex timed out after 30 seconds")
        except FileNotFoundError:
            return _error("pdf_generation_failed", "xelatex not found — install TeX Live or MiKTeX")

        if result.returncode != 0:
            error_lines = [line for line in result.stdout.splitlines() if line.startswith("!")]
            details = error_lines or [line for line in result.stderr.splitlines() if line.strip()]
            return _error("pdf_generation_failed", "xelatex exited with errors", details)

        pdf_bytes = (Path(tmpdir) / "cv.pdf").read_bytes()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=cv.pdf"},
    )


@app.post("/api/preview/pdf")
async def preview_pdf(req: CVRequest):
    session_id = req.preview_session_id
    request_seq = req.preview_request_seq
    session_state: Optional[_PreviewSessionState] = None

    if session_id is not None and request_seq is not None:
        session_state = _record_preview_request(session_id, request_seq)

    try:
        stale_response = _stale_preview_response_if_needed(session_state, session_id, request_seq)
        if stale_response is not None:
            return stale_response

        cv = parse_yaml(req.yaml)
    except YAMLParseError as e:
        return _error("invalid_yaml", e.message, e.details)
    except CVValidationError as e:
        return _error("validation_error", e.message, e.errors)

    if not _template_exists(req.template):
        return _error("unknown_template", f"Template '{req.template}' not found")

    renderer = LaTeXRenderer(
        TEMPLATES_DIR,
        template=req.template,
        density=req.density,
        font_scale=req.font_scale,
        link_display=req.link_display,
        personal_fields=req.personal_fields or [],
    )

    try:
        if session_state is not None and session_id is not None and request_seq is not None:
            async with session_state.lock:
                stale_response = _stale_preview_response_if_needed(session_state, session_id, request_seq)
                if stale_response is not None:
                    return stale_response

                latex_content = renderer.render(cv, req.section_order, req.section_titles)
                pdf_bytes, compile_err = await compile_pdf(latex_content)

                stale_response = _stale_preview_response_if_needed(session_state, session_id, request_seq)
                if stale_response is not None:
                    return stale_response

                if compile_err is not None:
                    return _error(
                        compile_err["error"],
                        compile_err["message"],
                        compile_err["details"],
                        compile_err["status"],
                    )

                return Response(content=pdf_bytes, media_type="application/pdf")

        latex_content = renderer.render(cv, req.section_order, req.section_titles)
        pdf_bytes, compile_err = await compile_pdf(latex_content)
        if compile_err is not None:
            return _error(
                compile_err["error"],
                compile_err["message"],
                compile_err["details"],
                compile_err["status"],
            )

        return Response(content=pdf_bytes, media_type="application/pdf")
    finally:
        if session_state is not None:
            session_state.active_requests -= 1
            _touch_preview_session_state(session_state)


@app.get("/api/templates")
async def list_templates():
    templates = sorted(
        d.name for d in TEMPLATES_DIR.iterdir()
        if d.is_dir() and (d / "cv.tex.j2").exists()
    )
    all_template_dirs = sorted(
        d.name for d in TEMPLATES_DIR.iterdir()
        if d.is_dir() and ((d / "cv.tex.j2").exists() or (d / "meta.yaml").exists())
    )
    return {
        "templates": templates,
        "meta": {
            name: _strip_internal_keys(
                _template_meta_cache.get(name, load_template_meta(str(TEMPLATES_DIR / name)))
            )
            for name in all_template_dirs
        },
        "validation": {
            name: _template_validation_cache.get(name, {"valid": None, "errors": []})
            for name in templates
        },
    }


@app.post("/api/templates/{name}/validate")
async def validate_template(name: str):
    if not _template_exists(name):
        return JSONResponse(status_code=404, content={"error": "not_found", "message": f"Template '{name}' not found"})
    result = await asyncio.to_thread(_validate_template, name)
    _template_validation_cache[name] = result
    return result


# Serve frontend — must come after all API routes
frontend_dir = Path("frontend")
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
