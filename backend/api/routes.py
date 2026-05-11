"""FastAPI route handlers.

All eight HTTP endpoints live here. main.py mounts this router and adds
nothing else route-related.
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Literal, Optional, List

from fastapi import APIRouter
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from backend.api.errors import error_response, parse_or_error
from backend.parsers.yaml_parser import parse_yaml, YAMLParseError, CVValidationError
from backend.renderers.latex import LaTeXRenderer
from backend.renderers.markdown import MarkdownRenderer
from backend.services.pdf_compiler import compile_pdf
from backend.services.preview_session import (
    PreviewSessionState,
    record_preview_request,
    stale_response_if_needed,
    touch_preview_session_state,
)
from backend.services.schema import build_cv_schema
from backend.templates.cache import template_meta_cache, template_validation_cache
from backend.templates.meta import load_template_meta
from backend.templates.validation import validate_template


TEMPLATES_DIR = Path(__file__).parent.parent / "templates"

router = APIRouter()


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


def _template_exists(template: str) -> bool:
    return (TEMPLATES_DIR / template / "cv.tex.j2").exists()


def _strip_internal_keys(meta: dict) -> dict:
    """Remove _-prefixed implementation-detail keys before serialization."""
    return {k: v for k, v in meta.items() if not k.startswith("_")}


@router.get("/api/schema")
async def get_schema():
    return build_cv_schema()


@router.post("/api/validate")
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


@router.post("/api/preview")
async def preview(req: CVRequest):
    cv, err = parse_or_error(req.yaml)
    if err:
        return err

    return {"markdown": MarkdownRenderer().render(cv, req.section_order)}


@router.post("/api/export/markdown")
async def export_markdown(req: CVRequest):
    cv, err = parse_or_error(req.yaml)
    if err:
        return err

    content = MarkdownRenderer().render(cv, req.section_order)
    return Response(
        content=content,
        media_type="text/markdown",
        headers={"Content-Disposition": "attachment; filename=cv.md"},
    )


@router.post("/api/export/latex")
async def export_latex(req: CVRequest):
    cv, err = parse_or_error(req.yaml)
    if err:
        return err

    if not _template_exists(req.template):
        return error_response("unknown_template", f"Template '{req.template}' not found")

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


@router.post("/api/export/pdf")
async def export_pdf(req: CVRequest):
    cv, err = parse_or_error(req.yaml)
    if err:
        return err

    if not _template_exists(req.template):
        return error_response("unknown_template", f"Template '{req.template}' not found")

    renderer = LaTeXRenderer(
        TEMPLATES_DIR,
        template=req.template,
        density=req.density,
        font_scale=req.font_scale,
        link_display=req.link_display,
        personal_fields=req.personal_fields or [],
    )
    latex_content = renderer.render(cv, req.section_order, req.section_titles)

    pdf_bytes, compile_err = await compile_pdf(latex_content)
    if compile_err is not None:
        return error_response(
            compile_err["error"],
            compile_err["message"],
            compile_err["details"],
            compile_err["status"],
        )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=cv.pdf"},
    )


@router.post("/api/preview/pdf")
async def preview_pdf(req: CVRequest):
    session_id = req.preview_session_id
    request_seq = req.preview_request_seq
    session_state: Optional[PreviewSessionState] = None

    if session_id is not None and request_seq is not None:
        session_state = record_preview_request(session_id, request_seq)

    try:
        stale_response = stale_response_if_needed(session_state, session_id, request_seq)
        if stale_response is not None:
            return stale_response

        cv = parse_yaml(req.yaml)
    except YAMLParseError as e:
        return error_response("invalid_yaml", e.message, e.details)
    except CVValidationError as e:
        return error_response("validation_error", e.message, e.errors)

    if not _template_exists(req.template):
        return error_response("unknown_template", f"Template '{req.template}' not found")

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
                stale_response = stale_response_if_needed(session_state, session_id, request_seq)
                if stale_response is not None:
                    return stale_response

                latex_content = renderer.render(cv, req.section_order, req.section_titles)
                pdf_bytes, compile_err = await compile_pdf(latex_content)

                stale_response = stale_response_if_needed(session_state, session_id, request_seq)
                if stale_response is not None:
                    return stale_response

                if compile_err is not None:
                    return error_response(
                        compile_err["error"],
                        compile_err["message"],
                        compile_err["details"],
                        compile_err["status"],
                    )

                return Response(content=pdf_bytes, media_type="application/pdf")

        latex_content = renderer.render(cv, req.section_order, req.section_titles)
        pdf_bytes, compile_err = await compile_pdf(latex_content)
        if compile_err is not None:
            return error_response(
                compile_err["error"],
                compile_err["message"],
                compile_err["details"],
                compile_err["status"],
            )

        return Response(content=pdf_bytes, media_type="application/pdf")
    finally:
        if session_state is not None:
            session_state.active_requests -= 1
            touch_preview_session_state(session_state)


@router.get("/api/templates")
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
                template_meta_cache.get(name, load_template_meta(str(TEMPLATES_DIR / name)))
            )
            for name in all_template_dirs
        },
        "validation": {
            name: template_validation_cache.get(name, {"valid": None, "errors": []})
            for name in templates
        },
    }


@router.post("/api/templates/{name}/validate")
async def validate_template_route(name: str):
    if not _template_exists(name):
        return JSONResponse(status_code=404, content={"error": "not_found", "message": f"Template '{name}' not found"})
    result = await asyncio.to_thread(validate_template, name, TEMPLATES_DIR)
    template_validation_cache[name] = result
    return result
