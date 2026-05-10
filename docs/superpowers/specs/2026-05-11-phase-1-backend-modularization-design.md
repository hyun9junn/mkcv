# Phase 1 — Backend Modularization

Part of the multi-phase mkcv refactor. Phase 1 splits `backend/main.py` (703 lines) into focused modules, fixes the leaky abstraction between `main.py` and `renderers/latex.py`, and unifies the two duplicate template-meta loaders. No external behavior changes.

## Why this comes first among the structural phases

Three feature directions you named — richer template authoring, persistence/multi-device, richer settings UI — all converge on the same backend tangles:

- `main.py` mixes FastAPI handlers with template metadata parsing, validation, PDF compilation, preview-session concurrency, and Pydantic-schema introspection.
- `main.py` and `tests/test_latex_renderer.py` both import six private symbols from `latex.py` (`_build_layout_preamble`, `_FONT_SIZE`, `_make_jinja_filters`, `_make_contact_helpers`, `_make_link_text_fn`, `_build_xelatex_preamble`). The "renderer" is leaking its internals as a public API.
- Template `meta.yaml` is loaded twice with different normalizations: `main.py:_load_template_meta` (for `/api/templates`) and `latex.py:_load_template_meta_data` (for rendering). They drift independently.
- `xelatex` subprocess invocation is duplicated three times (`_validate_template`, `_compile_preview_pdf`, `export_pdf`). `_compile_preview_pdf` exists but `export_pdf` does not call it.
- Constants like `_BUILTIN_SECTION_KEYS`, `_VALID_SECTION_TITLE_CASES`, `_PERSONAL_FIELD_KEYS` live in two files.

Phase 1 fixes the structure once. Later phases add features on a clean base.

## Scope

In scope:

1. Split `backend/main.py` (703 → ~60 lines) into `api/`, `services/`, `templates/`, `constants.py` modules.
2. Replace `backend/renderers/latex.py` (single file) with the `backend/renderers/latex/` subpackage (`renderer.py`, `helpers.py`, `preamble.py`).
3. Unify the two `meta.yaml` loaders into `backend/templates/meta.py`.
4. Consolidate the three `xelatex` subprocess sites into `backend/services/pdf_compiler.py`.
5. Drop the underscore prefix from helpers that were already being imported externally (`_make_link_text_fn` → `make_link_text_fn`, `_FONT_SIZE` → `FONT_SIZE`, etc.) and update both `backend/main.py` and `tests/test_latex_renderer.py` imports.
6. Move shared constants (`BUILTIN_SECTION_KEYS`, `VALID_DENSITIES`, `VALID_FONT_SCALES`, `VALID_LINK_DISPLAYS`, `FIELD_LINK_DISPLAYS`, `VALID_SECTION_TITLE_CASES`, `PERSONAL_FIELD_KEYS`, `LINK_PERSONAL_KEYS`) to `backend/constants.py`.

Out of scope (deferred):

- `PreviewSessionStore` ABC and any Redis-backed impl — Phase 4 (persistence).
- Caching `LaTeXRenderer.render()` output — separate perf phase.
- Changing `extra="allow"` on Pydantic models — feature work, not refactor.
- mypy / pyright — end of Phase 2 alongside frontend tooling.
- API surface changes (route names, response shapes) — Phase 1 keeps external behavior byte-identical.

## File layout

```
backend/
  __init__.py
  main.py                      # SHRINKS to ~60 lines: app instance, lifespan, static mount
  models.py                    # unchanged
  constants.py                 # NEW
  parsers/
    yaml_parser.py             # unchanged
  templates/
    __init__.py                # NEW
    meta.py                    # NEW: unified meta load + normalize
    validation.py              # NEW: validate_template (Jinja+xelatex)
    cache.py                   # NEW: shared module-level caches read by lifespan and routes
  renderers/
    base.py                    # unchanged
    markdown.py                # unchanged
    latex/                     # NEW subpackage (replaces latex.py)
      __init__.py              # re-exports public surface
      renderer.py              # LaTeXRenderer + escape/sanitize + title-prep
      helpers.py               # make_link_text_fn, make_contact_helpers, make_jinja_filters, get_template_render_bundle
      preamble.py              # build_layout_preamble, build_xelatex_preamble, FONT_SIZE, DENSITY
  services/
    __init__.py                # NEW
    pdf_compiler.py            # NEW: async compile_pdf(latex_content)
    preview_session.py         # NEW: PreviewSessionState + helpers (concrete)
    schema.py                  # NEW: build_cv_schema()
  api/
    __init__.py                # NEW
    routes.py                  # NEW: thin FastAPI handlers
    errors.py                  # NEW: error_response() + parse_or_error()
```

## Module responsibilities and public APIs

### `backend/constants.py`

Pure constants, no logic:

```python
BUILTIN_SECTION_KEYS = frozenset({"summary", "experience", "education", "skills", "projects",
                                  "certifications", "publications", "languages", "awards", "extracurricular"})
VALID_DENSITIES = frozenset({"comfortable", "balanced", "compact"})
VALID_FONT_SCALES = frozenset({"small", "normal", "large"})
VALID_LINK_DISPLAYS = frozenset({"label", "url", "both"})
FIELD_LINK_DISPLAYS = frozenset({"default", "label", "url", "both"})
VALID_SECTION_TITLE_CASES = frozenset({"upper", "lower", "title"})
PERSONAL_FIELD_KEYS = ("name", "email", "phone", "location", "website", "linkedin", "github", "huggingface")
LINK_PERSONAL_KEYS = frozenset({"website", "linkedin", "github", "huggingface"})
```

### `backend/templates/meta.py`

Single source of `meta.yaml` loading. Replaces both `main.py:_load_template_meta` and `latex.py:_load_template_meta_data`.

```python
def load_template_meta(template_dir: Path) -> dict:
    """Load and fully normalize meta.yaml for one template directory.
       Returns dict with keys: display_name, description, audience, ui, render, defaults."""

def template_default_titles(meta: dict) -> dict[str, str]:
    """Extract per-section default titles for builtin sections."""

def template_render_config(meta: dict) -> dict:
    """Extract render config (e.g. section_title_case)."""

def template_xelatex_fonts(meta: dict) -> dict[str, list[str]]:
    """Extract xelatex font fallback chains."""

def normalize_template_defaults(defaults: object) -> dict: ...
def normalize_template_ui(ui: object) -> dict: ...
def normalize_template_render(render: object) -> dict: ...
```

The `_normalize_*` functions currently in `main.py` move here without behavioral change. The `lru_cache` on the four `latex.py:_load_template_*` functions is replaced by a single `lru_cache` on `load_template_meta` (the derived getters become pure functions of the cached dict).

### `backend/templates/validation.py`

```python
def validate_template(name: str, templates_dir: Path) -> dict:
    """Two-stage check: Jinja2 strict-render + xelatex compile.
       Returns {'valid': bool, 'errors': list[str]}."""
```

Implementation uses **public** renderer helpers (`make_jinja_filters`, `make_link_text_fn`, `make_contact_helpers`, `build_layout_preamble`, `build_xelatex_preamble`, `FONT_SIZE`) — no underscore-prefixed imports.

### `backend/renderers/latex/`

Subpackage. The `__init__.py` re-exports everything external code currently imports:

```python
# backend/renderers/latex/__init__.py
from .renderer import LaTeXRenderer
from .helpers import (
    make_link_text_fn,
    make_contact_helpers,
    make_jinja_filters,
    get_template_render_bundle,
)
from .preamble import (
    build_layout_preamble,
    build_xelatex_preamble,
    FONT_SIZE,
    DENSITY,
)
```

External imports keep working: `from backend.renderers.latex import LaTeXRenderer` still resolves. `from backend.renderers.latex import _build_layout_preamble` (underscored) intentionally breaks — `main.py` and `tests/test_latex_renderer.py` are updated to use the new names.

**`renderer.py`** (~150 lines): `LaTeXRenderer` class, `_escape_latex_text`, `_sanitize_for_latex`, `_smart_title_case`, `_transform_builtin_section_title`, `_prepare_section_titles`. The escape/sanitize/title helpers stay private — they're used only by the renderer.

**`helpers.py`** (~100 lines): `make_link_text_fn`, `make_contact_helpers`, `make_jinja_filters`, `get_template_render_bundle`. All public (no underscore). These are the symbols `validation.py` and tests need.

**`preamble.py`** (~100 lines): `build_layout_preamble`, `build_font_fallback_chain`, `build_xelatex_preamble`, `FONT_SIZE`, `DENSITY`, `DEFAULT_XELATEX_FONTS`.

### `backend/services/pdf_compiler.py`

```python
async def compile_pdf(latex_content: str) -> tuple[bytes | None, dict | None]:
    """Compile LaTeX to PDF via xelatex. Returns (pdf_bytes, error_dict).
       Exactly one of the two is None.
       error_dict shape: {'error': str, 'message': str, 'details': list[str], 'status': int}."""
```

Replaces the three duplicate xelatex sites in `main.py:_validate_template`, `main.py:_compile_preview_pdf`, and `main.py:export_pdf`. Timeout (30s) and error formatting (`xelatex timed out…`, `xelatex not found…`, `! …` line filtering) move here.

### `backend/services/preview_session.py`

Concrete state, no interface:

```python
@dataclass
class PreviewSessionState:
    latest_seq: int = -1
    active_requests: int = 0
    last_touched: float = 0.0
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

def record_preview_request(session_id: str, request_seq: int) -> PreviewSessionState: ...
def stale_response_if_needed(state, session_id, request_seq) -> JSONResponse | None: ...
def cleanup_preview_sessions(now: float) -> None: ...
def touch_preview_session_state(state: PreviewSessionState) -> None: ...
```

Module-level `_preview_sessions: dict[str, PreviewSessionState] = {}`. TTL constant moves here. Phase 4 will introduce a `PreviewSessionStore` ABC and an in-memory + Redis impl; this module is shaped so that change is a swap, not a rewrite.

### `backend/services/schema.py`

```python
@functools.cache
def build_cv_schema() -> dict:
    """Derive autocomplete schema by introspecting Pydantic models."""
```

Replaces `main.py:_build_cv_schema` and `_CV_SCHEMA_CACHE`.

### `backend/api/errors.py`

```python
def error_response(error_type: str, message: str,
                   details: list[str] | None = None, status: int = 422) -> JSONResponse: ...

def parse_or_error(yaml_str: str) -> tuple[CVData | None, JSONResponse | None]:
    """Returns (cv, None) on success or (None, error_response) on parse/validate error.
       Exactly one of the two is None."""
```

`parse_or_error` is a plain function returning a tuple — not a context manager — because every caller does `cv, err = parse_or_error(req.yaml); if err: return err` and the early-return reads cleanest with that shape.

### `backend/api/routes.py`

All eight FastAPI handlers move here, each ~5–10 lines:

```python
router = APIRouter()

@router.get("/api/schema")
async def get_schema():
    return build_cv_schema()

@router.post("/api/preview")
async def preview(req: CVRequest):
    cv, err = parse_or_error(req.yaml)
    if err: return err
    return {"markdown": MarkdownRenderer().render(cv, req.section_order)}

# ... and so on for /api/validate, /api/export/markdown, /api/export/latex,
#     /api/export/pdf, /api/preview/pdf, /api/templates, /api/templates/{name}/validate
```

`CVRequest` (the Pydantic body model) moves here too.

### `backend/main.py`

Slim:

```python
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.api.routes import router
from backend.templates.meta import load_template_meta
from backend.templates.validation import validate_template

TEMPLATES_DIR = Path(__file__).parent / "templates"

# Caches stay module-level here (or move to a templates/cache.py if cleaner)
_template_meta_cache: dict[str, dict] = {}
_template_validation_cache: dict[str, dict] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    for template_dir in sorted(TEMPLATES_DIR.iterdir()):
        if template_dir.is_dir():
            if (template_dir / "cv.tex.j2").exists():
                _template_validation_cache[template_dir.name] = await asyncio.to_thread(
                    validate_template, template_dir.name, TEMPLATES_DIR
                )
            if (template_dir / "cv.tex.j2").exists() or (template_dir / "meta.yaml").exists():
                _template_meta_cache[template_dir.name] = load_template_meta(template_dir)
    yield


app = FastAPI(lifespan=lifespan)
app.include_router(router)

frontend_dir = Path("frontend")
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
```

The two caches (`_template_meta_cache`, `_template_validation_cache`) are needed by both `main.py:lifespan` (to populate at startup) and `routes.py:list_templates` (to read at request time). They move to a new `backend/templates/cache.py` module so both importers share the same module-level dicts.

## Migration order

Each step is one or more commits and the test suite must be green at every step.

1. **Create `backend/constants.py`.** Add the constants. Update `main.py` and `latex.py` to `from backend.constants import …`. Old in-file constants become aliases or are removed if unreferenced.
2. **Create `backend/templates/__init__.py` + `meta.py`.** Move `_load_template_meta` and the four `_normalize_*` functions from `main.py`. Move the `_load_template_meta_data` family from `latex.py`. Have both old call sites delegate. Drop the duplicated `lru_cache`d functions in `latex.py` once they're forwarded.
3. **Create `backend/services/__init__.py` + `pdf_compiler.py`.** Replace each of the three xelatex sites one at a time, in three separate commits, each verified green.
4. **Create `backend/services/preview_session.py`.** Move `_PreviewSessionState`, `_get_preview_session_state`, `_touch_preview_session_state`, `_preview_stale_response`, `_record_preview_request`, `_stale_preview_response_if_needed`, `_cleanup_preview_sessions`, `_PREVIEW_SESSION_TTL_SECONDS`, and `_preview_sessions`. Drop the underscores on the public functions; module-internal helpers can keep them.
5. **Create `backend/services/schema.py`.** Move `_build_cv_schema` and `_CV_SCHEMA_CACHE`. Replace the cache with `@functools.cache`.
6. **Split `backend/renderers/latex.py` into the subpackage.** Move file by file: first `preamble.py` (constants + builders), then `helpers.py` (make_*), then `renderer.py` (the class + sanitize + title prep). Add `__init__.py` re-exports. Delete the original `latex.py`. Update `main.py` and `tests/test_latex_renderer.py` to drop underscores on the now-public symbols.
7. **Create `backend/templates/validation.py`.** Move `_validate_template` from `main.py`. Now it imports public helpers from `renderers.latex` and from `templates.meta`.
8. **Create `backend/api/errors.py`.** Move `_error` (rename to `error_response`) and add `parse_or_error`.
9. **Create `backend/api/routes.py`.** Move `CVRequest` and the eight handlers. Each handler in its own commit if convenient, or batch in two or three commits — but every commit must be green.
10. **Create `backend/templates/cache.py`.** Move the two module-level caches (`_template_meta_cache`, `_template_validation_cache`) here. Update `main.py:lifespan` and `routes.py:list_templates` to import them.
11. **Slim `backend/main.py`.** It now contains only: imports, `TEMPLATES_DIR`, `lifespan`, `app = FastAPI(...)`, `app.include_router(router)`, `app.mount(...)`.

Total: **~12–14 commits**, each individually shippable.

## Acceptance

Phase 1 is done when:

- `backend/main.py` is ≤ 80 lines.
- `backend/renderers/latex.py` no longer exists; `backend/renderers/latex/` does.
- No file in `backend/` imports a symbol prefixed with `_` from another file in `backend/` (except `_` symbols inside the same module).
- `grep -r "BUILTIN_SECTION_KEYS\|VALID_DENSITIES\|VALID_FONT_SCALES" backend/ | grep -v constants.py` returns import lines only — no redeclarations.
- `grep -rn "subprocess.run.*xelatex" backend/` returns exactly one hit (in `services/pdf_compiler.py`).
- `npm test` exits 0 with the same 111 + 285 = 396 tests passing.
- `git diff main..phase-1-backend-modularization` shows no changes under `frontend/`, `backend/templates/*/cv.tex.j2`, or `backend/templates/*/meta.yaml`. Production behavior is unchanged.

## Risk and rollback

Risk: medium. Lots of moved code, but every step is independently revertable and the test suite (especially `test_latex_renderer.py` and `test_api.py`) covers the public behavior closely.

Rollback: `git revert` of any single step works. The migration order is designed so partial completion is also a viable end state — even completing only steps 1–3 gives real value (one xelatex site, one constants source).

## What this unblocks

- **Phase 2 (frontend bundler)**: independent, but lands on a stable backend.
- **Phase 4 (persistence)**: `services/preview_session.py` is the seam where the `PreviewSessionStore` ABC will be introduced.
- **Phase 5 (template authoring)**: `templates/meta.py` and `templates/validation.py` are the files template authors will touch; having them as named modules makes the meta.yaml extension points easy to grow.
