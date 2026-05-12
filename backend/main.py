from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.api.routes import router
from backend.templates.cache import template_meta_cache, template_validation_cache
from backend.templates.meta import load_template_meta
from backend.templates.validation import validate_template

TEMPLATES_DIR = Path(__file__).parent / "templates"


@asynccontextmanager
async def lifespan(app: FastAPI):
    for template_dir in sorted(TEMPLATES_DIR.iterdir()):
        if template_dir.is_dir():
            if (template_dir / "cv.tex.j2").exists():
                template_validation_cache[template_dir.name] = await asyncio.to_thread(validate_template, template_dir.name, TEMPLATES_DIR)
            if (template_dir / "cv.tex.j2").exists() or (template_dir / "meta.yaml").exists():
                template_meta_cache[template_dir.name] = load_template_meta(str(template_dir))
    yield


app = FastAPI(lifespan=lifespan)
app.include_router(router)


# Mount image asset dirs from source so they're always current regardless of
# whether a dist build exists. These specific paths don't conflict with Vite's
# hashed JS/CSS output (which lives at /assets/<hash>.js, not under these dirs).
_frontend_assets = Path("frontend/assets")
for _subdir in ("template-previews", "onboarding"):
    _p = _frontend_assets / _subdir
    if _p.exists():
        app.mount(f"/assets/{_subdir}", StaticFiles(directory=str(_p)), name=f"assets-{_subdir}")

# Serve frontend — must come after all API routes
dist_dir = Path("frontend/dist")
src_dir = Path("frontend")
if dist_dir.exists():
    app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="frontend")
elif src_dir.exists():
    app.mount("/", StaticFiles(directory=str(src_dir), html=True), name="frontend")
