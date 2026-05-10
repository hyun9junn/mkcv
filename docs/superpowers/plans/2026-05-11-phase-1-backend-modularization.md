# Phase 1 — Backend Modularization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `backend/main.py` (703 lines) into focused modules, fix the leaky abstraction between `main.py` and `renderers/latex.py`, and unify the two duplicate `meta.yaml` loaders. Behavior is unchanged — the existing 396-test suite is the regression net.

**Architecture:** Eleven tasks following the spec's migration order. Each task is structurally a "move + rewire" — no new behavior, no new tests. After every task, `npm test` must exit 0.

**Tech Stack:** Python 3.9, FastAPI, Pydantic, Jinja2, xelatex (subprocess). Tests: `pytest` + `node --test` via `npm test` (wired in Phase 0).

**Source spec:** `docs/superpowers/specs/2026-05-11-phase-1-backend-modularization-design.md`

---

## How to read this plan (refactor-specific)

This plan does not follow standard TDD task structure (write failing test → implement → green) because **no behavior is changing**. The discipline is different:

- **Existing tests are the regression net.** After every task, `npm test` must report `111 pass, 285 pass`. If it doesn't, fix or revert.
- **Code that's being moved is referenced by file path + line range.** The implementer reads the source and copies it; reproducing every function body in this plan would be noise.
- **Code that's being newly written is shown in full.** New module skeletons, signatures, re-export lists, the slim `main.py`, etc.
- **Commit boundaries are explicit.** Each task lists the exact `git commit -m "…"` message.

If a task's instructions feel ambiguous, that's a bug in this plan — flag it as `NEEDS_CONTEXT`, don't guess.

---

## Pre-flight

- [ ] **Verify starting branch and baseline**

The implementation runs on a new branch `phase-1-backend-modularization`. Branch from whatever has Phase 0 + the Phase 1 spec. Today that's `phase-0-foundations`.

```bash
git checkout phase-0-foundations
git checkout -b phase-1-backend-modularization
npm test
```
Expected: branch switch succeeds; `npm test` exits 0 with `111 pass, 285 pass`.

---

## File map

What's being created or modified across the whole phase.

| Path | Operation |
|---|---|
| `backend/constants.py` | Create |
| `backend/templates/__init__.py` | Create |
| `backend/templates/meta.py` | Create |
| `backend/templates/validation.py` | Create |
| `backend/templates/cache.py` | Create |
| `backend/services/__init__.py` | Create |
| `backend/services/pdf_compiler.py` | Create |
| `backend/services/preview_session.py` | Create |
| `backend/services/schema.py` | Create |
| `backend/api/__init__.py` | Create |
| `backend/api/errors.py` | Create |
| `backend/api/routes.py` | Create |
| `backend/renderers/latex.py` | Delete (replaced by subpackage) |
| `backend/renderers/latex/__init__.py` | Create |
| `backend/renderers/latex/renderer.py` | Create |
| `backend/renderers/latex/helpers.py` | Create |
| `backend/renderers/latex/preamble.py` | Create |
| `backend/main.py` | Shrink to ~60 lines |
| `tests/test_latex_renderer.py:5` | Update import (drop underscores) |

---

### Task 1: `backend/constants.py`

Create the single source of truth for shared constants. Update `main.py` and `latex.py` to import from it.

**Files:**
- Create: `backend/constants.py`
- Modify: `backend/main.py:65-93` (remove redeclared constants, add import)
- Modify: `backend/renderers/latex.py:30,50` (remove redeclared `_BUILTIN_SECTION_KEYS` and `_VALID_SECTION_TITLE_CASES`, add import)

- [ ] **Step 1: Create `backend/constants.py`**

```python
"""Shared constants used across the backend.

Single source of truth — do not redeclare these in other modules.
"""

BUILTIN_SECTION_KEYS = frozenset({
    "summary",
    "experience",
    "education",
    "skills",
    "projects",
    "certifications",
    "publications",
    "languages",
    "awards",
    "extracurricular",
})

VALID_DENSITIES = frozenset({"comfortable", "balanced", "compact"})
VALID_FONT_SCALES = frozenset({"small", "normal", "large"})
VALID_LINK_DISPLAYS = frozenset({"label", "url", "both"})
FIELD_LINK_DISPLAYS = frozenset({"default", "label", "url", "both"})
VALID_SECTION_TITLE_CASES = frozenset({"upper", "lower", "title"})

PERSONAL_FIELD_KEYS = (
    "name",
    "email",
    "phone",
    "location",
    "website",
    "linkedin",
    "github",
    "huggingface",
)

LINK_PERSONAL_KEYS = frozenset({"website", "linkedin", "github", "huggingface"})
```

Note: today's `main.py` declares these as plain `set` literals. Switching to `frozenset` is intentional — these are immutable shared constants. `PERSONAL_FIELD_KEYS` stays a tuple because order matters (it's compared with `==` against a list in `_normalize_template_defaults`).

- [ ] **Step 2: Update `backend/main.py` to import constants**

In `backend/main.py`, replace lines 65-93 (the `_VALID_*`, `_PERSONAL_FIELD_KEYS`, `_LINK_PERSONAL_KEYS`, `_BUILTIN_SECTION_KEYS` block) with:

```python
from backend.constants import (
    BUILTIN_SECTION_KEYS,
    VALID_DENSITIES,
    VALID_FONT_SCALES,
    VALID_LINK_DISPLAYS,
    FIELD_LINK_DISPLAYS,
    VALID_SECTION_TITLE_CASES,
    PERSONAL_FIELD_KEYS,
    LINK_PERSONAL_KEYS,
)
```

Then in the same file, search-and-replace (within `main.py` only):
- `_VALID_DENSITIES` → `VALID_DENSITIES`
- `_VALID_FONT_SCALES` → `VALID_FONT_SCALES`
- `_VALID_LINK_DISPLAYS` → `VALID_LINK_DISPLAYS`
- `_FIELD_LINK_DISPLAYS` → `FIELD_LINK_DISPLAYS`
- `_VALID_SECTION_TITLE_CASES` → `VALID_SECTION_TITLE_CASES`
- `_PERSONAL_FIELD_KEYS` → `PERSONAL_FIELD_KEYS`
- `_LINK_PERSONAL_KEYS` → `LINK_PERSONAL_KEYS`
- `_BUILTIN_SECTION_KEYS` → `BUILTIN_SECTION_KEYS`

Leave `_PREVIEW_SESSION_TTL_SECONDS` alone for now — it moves in Task 4.

Note: the `_normalize_template_defaults` function compares `personal_keys != _PERSONAL_FIELD_KEYS`. After the rename, that line becomes `personal_keys != list(PERSONAL_FIELD_KEYS)` because `PERSONAL_FIELD_KEYS` is a tuple in `constants.py` but the local list is built dynamically. Verify the comparison still works — Python `tuple != list` even with same contents, so explicit conversion is required.

- [ ] **Step 3: Update `backend/renderers/latex.py` to import constants**

Two redeclarations to remove:
- Line 30: `_BUILTIN_SECTION_KEYS = set(DEFAULT_SECTION_TITLES)` — keep this line as-is for now since it's derived from `DEFAULT_SECTION_TITLES` (a different concept). Verify by reading: actually it equals the same set. Remove it and import from `constants.py`.
- Line 50: `_VALID_SECTION_TITLE_CASES = {"upper", "lower", "title"}` — remove, import.

Add at the top of `backend/renderers/latex.py` (after existing imports):
```python
from backend.constants import BUILTIN_SECTION_KEYS, VALID_SECTION_TITLE_CASES
```

Then in the same file, search-and-replace:
- `_BUILTIN_SECTION_KEYS` → `BUILTIN_SECTION_KEYS`
- `_VALID_SECTION_TITLE_CASES` → `VALID_SECTION_TITLE_CASES`

- [ ] **Step 4: Run tests**

```bash
npm test
```
Expected: `111 pass, 0 fail` (JS) and pytest exits 0 with all 285 passing.

- [ ] **Step 5: Commit**

```bash
git add backend/constants.py backend/main.py backend/renderers/latex.py
git commit -m "refactor: extract shared constants to backend/constants.py"
```

---

### Task 2: `backend/templates/meta.py` — unify the two meta loaders

Move `_load_template_meta` and `_normalize_*` from `main.py:107-220`, and `_load_template_meta_data` family from `latex.py:181-256`, into one module. Both `main.py` and `latex.py` import from it.

**Files:**
- Create: `backend/templates/__init__.py` (empty file: `# Backend templates subpackage`)
- Create: `backend/templates/meta.py`
- Modify: `backend/main.py:107-220` (delete moved functions, add imports)
- Modify: `backend/renderers/latex.py:181-256` (delete moved functions, add imports)

- [ ] **Step 1: Create `backend/templates/__init__.py`**

Single line:
```python
"""Backend templates subpackage."""
```

- [ ] **Step 2: Create `backend/templates/meta.py` with the unified API**

Public surface:

```python
"""Template metadata loading and normalization.

Single source of truth for parsing meta.yaml. Replaces the two prior loaders
(main.py:_load_template_meta and latex.py:_load_template_meta_data).
"""
from functools import lru_cache
from pathlib import Path
import yaml as _yaml

from backend.constants import (
    BUILTIN_SECTION_KEYS,
    VALID_DENSITIES,
    VALID_FONT_SCALES,
    VALID_LINK_DISPLAYS,
    VALID_SECTION_TITLE_CASES,
    FIELD_LINK_DISPLAYS,
    PERSONAL_FIELD_KEYS,
    LINK_PERSONAL_KEYS,
)

_DEFAULT_XELATEX_FONTS = {
    "hangul_main_fonts": ["Nanum Myeongjo", "UnBatang"],
    "hangul_sans_fonts": ["Nanum Gothic", "UnDotum"],
    "hangul_mono_fonts": ["Nanum Gothic", "UnDotum"],
}


def normalize_template_defaults(defaults: object) -> dict:
    """Validate the `defaults` block of meta.yaml.
    Returns the dict if valid, {} otherwise."""
    # Body: copy verbatim from backend/main.py:107-169 (was _normalize_template_defaults).
    # Replace `_VALID_*` etc. with the unprefixed names imported above.
    # Replace `_PERSONAL_FIELD_KEYS` (which was a list) with `list(PERSONAL_FIELD_KEYS)`
    # for the equality check on line 146.
    ...


def normalize_template_ui(ui: object) -> dict:
    """Validate the `ui` block. Returns {'badge': str}."""
    # Body: copy verbatim from backend/main.py:172-181 (was _normalize_template_ui).
    ...


def normalize_template_render(render: object) -> dict:
    """Validate the `render` block. Returns {'section_title_case': str}."""
    # Body: copy verbatim from backend/main.py:184-192 (was _normalize_template_render).
    # Replace `_VALID_SECTION_TITLE_CASES` with `VALID_SECTION_TITLE_CASES`.
    ...


@lru_cache(maxsize=None)
def load_template_meta(template_dir_str: str) -> dict:
    """Load and fully normalize meta.yaml for one template directory.

    Returns dict with keys: display_name, description, audience, ui, render, defaults.

    Cached by template_dir_str; pass `str(template_dir)`, not the Path itself
    (Path is unhashable in some configurations).
    """
    template_dir = Path(template_dir_str)
    # Body: copy verbatim from backend/main.py:195-220 (was _load_template_meta).
    # The function body uses _normalize_template_ui etc. — change to the
    # unprefixed local names.
    ...


def template_default_titles(meta: dict) -> dict[str, str]:
    """Extract per-section default titles for builtin sections from a normalized meta."""
    sections = meta.get("defaults", {}).get("sections", [])
    if not isinstance(sections, list):
        return {}
    titles: dict[str, str] = {}
    for section in sections:
        if not isinstance(section, dict):
            continue
        key = section.get("key")
        title = section.get("title")
        if key in BUILTIN_SECTION_KEYS and isinstance(title, str) and title.strip():
            titles[key] = title
    return titles


def template_render_config(meta: dict) -> dict:
    """Extract render config (e.g. section_title_case) from a normalized meta."""
    render = meta.get("render")
    if not isinstance(render, dict):
        return {"section_title_case": "title"}
    section_title_case = render.get("section_title_case")
    if section_title_case not in VALID_SECTION_TITLE_CASES:
        return {"section_title_case": "title"}
    return {"section_title_case": section_title_case}


def template_xelatex_fonts(meta: dict) -> dict[str, list[str]]:
    """Extract xelatex font fallback chains from a normalized meta."""
    render = meta.get("render")
    if not isinstance(render, dict):
        render = {}
    xelatex = render.get("xelatex")
    if not isinstance(xelatex, dict):
        xelatex = {}
    return {
        key: _normalize_font_list(xelatex.get(key), default)
        for key, default in _DEFAULT_XELATEX_FONTS.items()
    }


def _normalize_font_list(value, default: list[str]) -> list[str]:
    """Internal helper for template_xelatex_fonts.
    Body: copy verbatim from backend/renderers/latex.py:229-238."""
    ...
```

**Important:** the design decision behind these getters is that they take an already-loaded `meta` dict, not `(templates_dir, template)`. Today `latex.py` has four separate `lru_cache`d functions that re-read `meta.yaml` independently; we replace that with one cached `load_template_meta` whose result feeds the pure getters.

The fully expanded implementation needs to be assembled by reading the original source. The implementer fills in the `...` placeholders by copying lines 107-220 of `main.py` and lines 181-256 of `latex.py` and adjusting names per the comments above.

- [ ] **Step 3: Update `backend/main.py` to use the new module**

Delete `_normalize_template_defaults`, `_normalize_template_ui`, `_normalize_template_render`, `_load_template_meta` from `main.py:107-220`.

Add import at the top:
```python
from backend.templates.meta import load_template_meta
```

Search-and-replace within `main.py`:
- `_load_template_meta(template_dir)` → `load_template_meta(str(template_dir))`

The `_normalize_*` functions are no longer called from `main.py` — `load_template_meta` calls them internally now.

- [ ] **Step 4: Update `backend/renderers/latex.py` to use the new module**

Delete `_load_template_meta_data`, `_load_template_default_titles`, `_load_template_render_config`, `_load_template_xelatex_font_config`, and `_normalize_font_list` from `latex.py:181-256`.

Add import:
```python
from backend.templates.meta import (
    load_template_meta,
    template_default_titles,
    template_render_config,
    template_xelatex_fonts,
)
```

Update the four call sites in `latex.py`:
- `_load_template_meta_data(templates_dir, template)` → `load_template_meta(str(Path(templates_dir) / template))`
- `_load_template_default_titles(templates_dir, template)` → `template_default_titles(load_template_meta(str(Path(templates_dir) / template)))`
- `_load_template_render_config(templates_dir, template)` → `template_render_config(load_template_meta(str(Path(templates_dir) / template)))`
- `_load_template_xelatex_font_config(templates_dir, template)` → `template_xelatex_fonts(load_template_meta(str(Path(templates_dir) / template)))`

The repeated `load_template_meta(...)` call is fine because it's `lru_cache`d.

- [ ] **Step 5: Run tests**

```bash
npm test
```
Expected: 111 + 285 pass.

- [ ] **Step 6: Commit**

```bash
git add backend/templates/__init__.py backend/templates/meta.py backend/main.py backend/renderers/latex.py
git commit -m "refactor: unify template meta loading in backend/templates/meta.py"
```

---

### Task 3a: `backend/services/pdf_compiler.py` — extract the xelatex helper

**Files:**
- Create: `backend/services/__init__.py` (single line: `"""Backend services subpackage."""`)
- Create: `backend/services/pdf_compiler.py`

- [ ] **Step 1: Create `backend/services/__init__.py`**

```python
"""Backend services subpackage."""
```

- [ ] **Step 2: Create `backend/services/pdf_compiler.py`**

```python
"""Compile LaTeX source to PDF via xelatex subprocess.

Single source of truth for xelatex invocation. Replaces three duplicated
sites in main.py (validate_template, _compile_preview_pdf, export_pdf).
"""
import asyncio
import subprocess
import tempfile
from pathlib import Path


XELATEX_TIMEOUT_SECONDS = 30


async def compile_pdf(latex_content: str) -> tuple[bytes | None, dict | None]:
    """Compile a LaTeX source string to PDF.

    Returns (pdf_bytes, error). Exactly one of the two is None.

    On error, the error dict has shape:
        {"error": str, "message": str, "details": list[str], "status": int}
    matching the existing _error() convention so callers can pass it
    straight to JSONResponse.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = Path(tmpdir) / "cv.tex"
        tex_path.write_text(latex_content)
        try:
            result = await asyncio.to_thread(
                subprocess.run,
                ["xelatex", "-interaction=nonstopmode", "cv.tex"],
                cwd=tmpdir,
                capture_output=True,
                timeout=XELATEX_TIMEOUT_SECONDS,
                text=True,
            )
        except subprocess.TimeoutExpired:
            return None, {
                "error": "pdf_generation_failed",
                "message": f"xelatex timed out after {XELATEX_TIMEOUT_SECONDS} seconds",
                "details": [],
                "status": 422,
            }
        except FileNotFoundError:
            return None, {
                "error": "pdf_generation_failed",
                "message": "xelatex not found — install TeX Live or MiKTeX",
                "details": [],
                "status": 422,
            }

        if result.returncode != 0:
            error_lines = [line for line in result.stdout.splitlines() if line.startswith("!")]
            details = error_lines or [line for line in result.stderr.splitlines() if line.strip()]
            return None, {
                "error": "pdf_generation_failed",
                "message": "xelatex exited with errors",
                "details": details,
                "status": 422,
            }

        pdf_bytes = (Path(tmpdir) / "cv.pdf").read_bytes()
    return pdf_bytes, None
```

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: 111 + 285 pass. (Nothing imports `compile_pdf` yet, so this commit can't regress anything — but verify anyway.)

- [ ] **Step 4: Commit**

```bash
git add backend/services/__init__.py backend/services/pdf_compiler.py
git commit -m "feat: add backend/services/pdf_compiler.py"
```

---

### Task 3b: Replace the xelatex site in `_compile_preview_pdf`

**Files:**
- Modify: `backend/main.py:384-409` (delete `_compile_preview_pdf`, replace callers)

- [ ] **Step 1: Add import to `backend/main.py`**

```python
from backend.services.pdf_compiler import compile_pdf
```

- [ ] **Step 2: Delete `_compile_preview_pdf` from `backend/main.py:384-409`**

- [ ] **Step 3: Update the two call sites in `preview_pdf` (around `backend/main.py:645,657`)**

Each currently looks like:
```python
pdf_bytes, compile_error = await _compile_preview_pdf(latex_content)
```

becomes:
```python
pdf_bytes, compile_error = await compile_pdf(latex_content)
if compile_error is not None:
    compile_error = _error(**compile_error)  # convert dict to JSONResponse
```

Wait — that's ugly. Better: since the new `compile_pdf` returns a dict (not a `JSONResponse`), the call sites need to convert. Inline the conversion at the call site:

```python
pdf_bytes, compile_err = await compile_pdf(latex_content)
if compile_err is not None:
    return _error(compile_err["error"], compile_err["message"],
                  compile_err["details"], compile_err["status"])
```

Apply this pattern at both occurrences in `preview_pdf`.

- [ ] **Step 4: Run tests**

```bash
npm test
```
Expected: 111 + 285 pass.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py
git commit -m "refactor: route preview_pdf through services.compile_pdf"
```

---

### Task 3c: Replace the xelatex site in `export_pdf`

**Files:**
- Modify: `backend/main.py:574-602` (the inline xelatex block in `export_pdf`)

- [ ] **Step 1: Replace the inline xelatex block**

In `backend/main.py:export_pdf`, the body currently has an inline `with tempfile.TemporaryDirectory() … subprocess.run(["xelatex", …]) … pdf_bytes = …` block. Replace lines 574-596 with:

```python
    pdf_bytes, compile_err = await compile_pdf(latex_content)
    if compile_err is not None:
        return _error(compile_err["error"], compile_err["message"],
                      compile_err["details"], compile_err["status"])
```

The existing `Response(content=pdf_bytes, …)` return on lines 598-602 stays.

- [ ] **Step 2: Run tests**

```bash
npm test
```
Expected: 111 + 285 pass. The pytest suite includes `test_api.py` which exercises the export endpoint when xelatex is available.

- [ ] **Step 3: Commit**

```bash
git add backend/main.py
git commit -m "refactor: route export_pdf through services.compile_pdf"
```

---

### Task 3d: Replace the xelatex site in `_validate_template`

**Files:**
- Modify: `backend/main.py:262-284` (the inline xelatex block in `_validate_template`)

- [ ] **Step 1: Replace the inline xelatex block**

`_validate_template` currently runs xelatex synchronously via `subprocess.run`. The new `compile_pdf` is `async`. The cleanest path: leave `_validate_template` synchronous for now (it's called via `asyncio.to_thread` from `lifespan`), and have it call a small synchronous helper. Add to `backend/services/pdf_compiler.py`:

```python
def compile_pdf_sync(latex_content: str) -> tuple[bytes | None, dict | None]:
    """Synchronous version of compile_pdf, for use from non-async paths
    (template validation at startup). Identical error contract.

    The async version above wraps subprocess.run with asyncio.to_thread;
    this version skips that wrapper since the caller is already on a
    worker thread (asyncio.to_thread in lifespan).
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = Path(tmpdir) / "cv.tex"
        tex_path.write_text(latex_content)
        try:
            result = subprocess.run(
                ["xelatex", "-interaction=nonstopmode", "cv.tex"],
                cwd=tmpdir,
                capture_output=True,
                timeout=XELATEX_TIMEOUT_SECONDS,
                text=True,
            )
        except subprocess.TimeoutExpired:
            return None, {
                "error": "pdf_generation_failed",
                "message": f"xelatex timed out after {XELATEX_TIMEOUT_SECONDS} seconds",
                "details": [],
                "status": 422,
            }
        except FileNotFoundError:
            return None, {
                "error": "pdf_generation_failed",
                "message": "xelatex not found — install TeX Live or MiKTeX",
                "details": [],
                "status": 422,
            }
        if result.returncode != 0:
            error_lines = [line for line in result.stdout.splitlines() if line.startswith("!")]
            details = error_lines or [line for line in result.stderr.splitlines() if line.strip()]
            return None, {
                "error": "pdf_generation_failed",
                "message": "xelatex exited with errors",
                "details": details,
                "status": 422,
            }
        pdf_bytes = (Path(tmpdir) / "cv.pdf").read_bytes()
    return pdf_bytes, None
```

Then refactor `compile_pdf` (the async one) to delegate:
```python
async def compile_pdf(latex_content: str) -> tuple[bytes | None, dict | None]:
    return await asyncio.to_thread(compile_pdf_sync, latex_content)
```

This eliminates the body duplication.

- [ ] **Step 2: Update `_validate_template` to use `compile_pdf_sync`**

In `backend/main.py:_validate_template`, replace the inline xelatex block (lines 262-282) with:

```python
    _pdf_bytes, compile_err = compile_pdf_sync(rendered)
    if compile_err is not None:
        # The validation contract uses a different error shape:
        return {"valid": False, "errors": compile_err["details"] or [compile_err["message"]]}
```

Add the import at the top of `main.py`:
```python
from backend.services.pdf_compiler import compile_pdf, compile_pdf_sync
```

The earlier task added only `compile_pdf`; combine into one import statement.

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: 111 + 285 pass. The lifespan path runs at app startup, so test_api.py's TestClient instantiation exercises this.

- [ ] **Step 4: Commit**

```bash
git add backend/main.py backend/services/pdf_compiler.py
git commit -m "refactor: route _validate_template through services.compile_pdf_sync"
```

After Task 3 (a–d), `grep -rn "subprocess.run.*xelatex" backend/` returns exactly one hit: `backend/services/pdf_compiler.py`.

---

### Task 4: `backend/services/preview_session.py` — move session state

**Files:**
- Create: `backend/services/preview_session.py`
- Modify: `backend/main.py:70,97-104,325-381,609-665` (delete moved state and helpers, add imports)

- [ ] **Step 1: Create `backend/services/preview_session.py`**

```python
"""Preview-session staleness tracking.

Module-level state — single FastAPI process. Phase 4 will swap this for an
abstracted PreviewSessionStore with a Redis impl when persistence is real.
For now, behavior matches the prior in-process dict.
"""
import asyncio
import time
from dataclasses import dataclass, field
from typing import Optional

from fastapi.responses import JSONResponse


PREVIEW_SESSION_TTL_SECONDS = 60.0


@dataclass
class PreviewSessionState:
    latest_seq: int = -1
    active_requests: int = 0
    last_touched: float = 0.0
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


_preview_sessions: dict[str, PreviewSessionState] = {}


def cleanup_preview_sessions(now: float) -> None:
    """Remove sessions that are idle and older than the TTL."""
    expired = [
        sid for sid, state in _preview_sessions.items()
        if state.active_requests == 0 and (now - state.last_touched) > PREVIEW_SESSION_TTL_SECONDS
    ]
    for sid in expired:
        _preview_sessions.pop(sid, None)


def get_preview_session_state(session_id: str) -> PreviewSessionState:
    now = time.monotonic()
    cleanup_preview_sessions(now)
    state = _preview_sessions.get(session_id)
    if state is None:
        state = PreviewSessionState(last_touched=now)
        _preview_sessions[session_id] = state
        return state
    state.last_touched = now
    return state


def touch_preview_session_state(state: PreviewSessionState) -> None:
    state.last_touched = time.monotonic()


def record_preview_request(session_id: str, request_seq: int) -> PreviewSessionState:
    state = get_preview_session_state(session_id)
    state.active_requests += 1
    state.latest_seq = max(state.latest_seq, request_seq)
    touch_preview_session_state(state)
    return state


def stale_preview_response(session_id: str, request_seq: int, latest_seq: int) -> JSONResponse:
    return JSONResponse(
        status_code=409,
        content={
            "error": "stale_preview",
            "message": f"Preview request {request_seq} for session '{session_id}' is stale",
            "details": [f"Latest preview request sequence is {latest_seq}"],
        },
    )


def stale_response_if_needed(
    session_state: Optional[PreviewSessionState],
    session_id: Optional[str],
    request_seq: Optional[int],
) -> Optional[JSONResponse]:
    if session_state is None or session_id is None or request_seq is None:
        return None
    touch_preview_session_state(session_state)
    if request_seq < session_state.latest_seq:
        return stale_preview_response(session_id, request_seq, session_state.latest_seq)
    return None
```

Note: `stale_preview_response` no longer goes through `_error` because that helper lives in `main.py` and we don't want a cyclic import. The JSON shape is identical.

- [ ] **Step 2: Update `backend/main.py` to use the module**

Remove from `main.py`:
- Line 70: `_PREVIEW_SESSION_TTL_SECONDS = 60.0`
- Lines 96-104: `@dataclass class _PreviewSessionState` and `_preview_sessions: dict…`
- Lines 325-381: the seven helper functions

Add import:
```python
from backend.services.preview_session import (
    PreviewSessionState,
    record_preview_request,
    stale_response_if_needed,
)
```

Update call sites in `preview_pdf` (around `main.py:611-665`):
- `_record_preview_request(session_id, request_seq)` → `record_preview_request(session_id, request_seq)`
- `_stale_preview_response_if_needed(...)` → `stale_response_if_needed(...)`
- `_PreviewSessionState` (the type annotation in `Optional[_PreviewSessionState]`) → `PreviewSessionState`
- `_touch_preview_session_state(session_state)` (the `finally` block) → import and call `touch_preview_session_state` too, or replace inline with `session_state.last_touched = time.monotonic()` (cleaner; one less import)

Decide: keep `touch_preview_session_state` exported and import it; do not inline. Symmetry with the rest.

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: 111 + 285 pass. `tests/test_api.py` includes preview-staleness tests; they'll exercise this.

- [ ] **Step 4: Commit**

```bash
git add backend/services/preview_session.py backend/main.py
git commit -m "refactor: move preview-session state to backend/services/preview_session.py"
```

---

### Task 5: `backend/services/schema.py` — move CV schema introspection

**Files:**
- Create: `backend/services/schema.py`
- Modify: `backend/main.py:64,412-476` (delete `_CV_SCHEMA_CACHE` and `_build_cv_schema`, update `get_schema`)

- [ ] **Step 1: Create `backend/services/schema.py`**

```python
"""Pydantic-derived schema for YAML autocomplete.

Returns a dict consumed by frontend/yaml-autocomplete.js to populate
field name suggestions.
"""
import functools
import typing

from pydantic_core import PydanticUndefinedType

from backend.models import (
    CVData,
    PersonalInfo,
    ExperienceItem,
    EducationItem,
    SkillGroup,
    ProjectItem,
    CertificationItem,
    PublicationItem,
    LanguageItem,
    AwardItem,
    ExtracurricularItem,
    CustomSection,
)


def _model_info(model_class) -> dict:
    keys = []
    required = []
    list_keys = []
    for field_name, field_info in model_class.model_fields.items():
        keys.append(field_name)
        if isinstance(field_info.default, PydanticUndefinedType):
            required.append(field_name)
        ann = field_info.annotation
        origin = typing.get_origin(ann)
        if origin is list:
            list_keys.append(field_name)
    return {"keys": keys, "required": required, "list_keys": list_keys}


@functools.cache
def build_cv_schema() -> dict:
    """Derive autocomplete schema from Pydantic models. Cached."""
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

    root_info = _model_info(CVData)
    schema["__root__"] = {
        "keys": root_info["keys"],
        "required": root_info["required"],
        "list_keys": [],
    }

    schema["personal"] = _model_info(PersonalInfo)

    for context_key, model_class in list_section_map.items():
        schema[context_key] = _model_info(model_class)

    schema["custom_sections[].content[]"] = {
        "keys": ["type", "value", "items", "pairs"],
        "required": ["type"],
        "list_keys": ["items", "pairs"],
    }

    return schema
```

- [ ] **Step 2: Update `backend/main.py`**

Remove from `main.py`:
- Line 64: `_CV_SCHEMA_CACHE: dict | None = None`
- Lines 412-468: `def _build_cv_schema()`

Update `get_schema` (lines 471-476) to:
```python
@app.get("/api/schema")
async def get_schema():
    return build_cv_schema()
```

Add import:
```python
from backend.services.schema import build_cv_schema
```

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: 111 + 285 pass.

- [ ] **Step 4: Commit**

```bash
git add backend/services/schema.py backend/main.py
git commit -m "refactor: move CV schema introspection to services/schema.py"
```

---

### Task 6: Split `backend/renderers/latex.py` into the subpackage

This is the largest task. Three files inside a new `latex/` subpackage. After this, the prior `latex.py` is deleted.

**Files:**
- Create: `backend/renderers/latex/__init__.py`
- Create: `backend/renderers/latex/preamble.py`
- Create: `backend/renderers/latex/helpers.py`
- Create: `backend/renderers/latex/renderer.py`
- Delete: `backend/renderers/latex.py`
- Modify: `backend/main.py` (update imports, drop underscores on now-public symbols)
- Modify: `tests/test_latex_renderer.py:5` (drop underscores in import)

#### Task 6a: Create `preamble.py` (no behavior change yet)

- [ ] **Step 1: Create `backend/renderers/latex/preamble.py`**

```python
"""LaTeX preamble builders and per-density / per-font-scale constants.

Public surface (no underscores):
- FONT_SIZE
- DENSITY
- DEFAULT_XELATEX_FONTS
- build_layout_preamble
- build_font_fallback_chain
- build_xelatex_preamble
"""
from pathlib import Path

from backend.templates.meta import template_xelatex_fonts, load_template_meta


FONT_SIZE = {
    "small":  "10pt",
    "normal": "11pt",
    "large":  "12pt",
}

DENSITY = {
    "comfortable": {"vgap": "8pt",  "secbefore": "14pt", "secafter": "7pt",  "itembefore": "4pt"},
    "balanced":    {"vgap": "4pt",  "secbefore": "12pt", "secafter": "6pt",  "itembefore": "2pt"},
    "compact":     {"vgap": "2pt",  "secbefore": "8pt",  "secafter": "4pt",  "itembefore": "1pt"},
}

DEFAULT_XELATEX_FONTS = {
    "hangul_main_fonts": ["Nanum Myeongjo", "UnBatang"],
    "hangul_sans_fonts": ["Nanum Gothic", "UnDotum"],
    "hangul_mono_fonts": ["Nanum Gothic", "UnDotum"],
}


def build_layout_preamble(density: str) -> str:
    """Body: copy verbatim from backend/renderers/latex.py:88-95
    (was _build_layout_preamble). Replace `_DENSITY` with `DENSITY`."""
    ...


def build_font_fallback_chain(command: str, fonts: list[str], options: str = "") -> str:
    """Body: copy verbatim from backend/renderers/latex.py:258-270
    (was _build_font_fallback_chain). No name changes inside."""
    ...


def build_xelatex_preamble(templates_dir: Path, template: str) -> str:
    """Body: rewrite to use the new templates.meta API:

    config = template_xelatex_fonts(load_template_meta(str(templates_dir / template)))
    font_options = "AutoFakeSlant=0.2"
    return "\\n".join([
        r"\\usepackage{fontspec}",
        r"\\usepackage{kotex}",
        r"\\defaultfontfeatures{Ligatures=TeX}",
        build_font_fallback_chain("setmainhangulfont", config["hangul_main_fonts"], font_options),
        build_font_fallback_chain("setsanshangulfont", config["hangul_sans_fonts"], font_options),
        build_font_fallback_chain("setmonohangulfont", config["hangul_mono_fonts"], font_options),
    ])
    """
    ...
```

#### Task 6b: Create `helpers.py`

- [ ] **Step 2: Create `backend/renderers/latex/helpers.py`**

```python
"""Jinja env factory and template-rendering helpers.

Public surface (no underscores):
- make_link_text_fn
- make_contact_helpers
- make_jinja_filters
- get_template_render_bundle
"""
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

import jinja2


@dataclass(frozen=True)
class TemplateRenderBundle:
    env: jinja2.Environment
    template: jinja2.Template


def make_link_text_fn(link_display: str):
    """Body: copy verbatim from backend/renderers/latex.py:98-106
    (was _make_link_text_fn)."""
    ...


def make_contact_helpers(personal_fields: list, link_display: str):
    """Body: copy verbatim from backend/renderers/latex.py:109-127
    (was _make_contact_helpers)."""
    ...


def make_jinja_filters() -> dict:
    """Body: copy verbatim from backend/renderers/latex.py:130-157
    (was _make_jinja_filters)."""
    ...


@lru_cache(maxsize=None)
def get_template_render_bundle(templates_dir: str, template: str) -> TemplateRenderBundle:
    """Body: copy verbatim from backend/renderers/latex.py:161-177
    (was _get_template_render_bundle). Replace `_TemplateRenderBundle` with
    `TemplateRenderBundle`. Replace `_make_jinja_filters` call with
    `make_jinja_filters`."""
    ...
```

#### Task 6c: Create `renderer.py`

- [ ] **Step 3: Create `backend/renderers/latex/renderer.py`**

```python
"""LaTeX rendering: the LaTeXRenderer class and its private helpers.

Private to this module (still underscored, only used by LaTeXRenderer):
- _escape_latex_text
- _sanitize_for_latex
- _smart_title_case
- _transform_builtin_section_title
- _prepare_section_titles
- _should_preserve_model_field
"""
import re
from pathlib import Path
from typing import Optional, List

from pydantic import BaseModel

from backend.constants import BUILTIN_SECTION_KEYS
from backend.models import CVData, CustomBlock, CustomSection
from backend.renderers.base import BaseRenderer
from backend.renderers.latex.helpers import (
    get_template_render_bundle,
    make_contact_helpers,
    make_link_text_fn,
)
from backend.renderers.latex.preamble import (
    DENSITY,
    FONT_SIZE,
    build_layout_preamble,
    build_xelatex_preamble,
)
from backend.templates.meta import (
    load_template_meta,
    template_default_titles,
    template_render_config,
)


DEFAULT_SECTION_ORDER = [
    "summary", "experience", "education", "skills", "projects",
    "certifications", "publications", "languages", "awards", "extracurricular",
]

DEFAULT_SECTION_TITLES = {
    "summary":        "Summary",
    "experience":     "Experience",
    "education":      "Education",
    "skills":         "Skills",
    "projects":       "Projects",
    "certifications": "Certifications",
    "publications":   "Publications",
    "languages":      "Languages",
    "awards":         "Awards",
    "extracurricular":"Extracurricular Activities",
}

_TITLE_CASE_SMALL_WORDS = {
    "a", "an", "and", "as", "at", "but", "by", "for", "in", "nor",
    "of", "on", "or", "the", "to", "via", "with",
}
_TITLE_WORD_RE = re.compile(r"[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?")
_LATEX_ESCAPES = {
    "&": r"\&", "%": r"\%", "$": r"\$", "#": r"\#", "_": r"\_",
    "{": r"\{", "}": r"\}", "~": r"\textasciitilde{}", "^": r"\textasciicircum{}",
}


def _escape_latex_text(value: str) -> str:
    """Body: copy verbatim from backend/renderers/latex.py:273-293
    (was _escape_latex_text). No rename needed."""
    ...


def _should_preserve_model_field(model: BaseModel, field_name: str) -> bool:
    """Body: copy verbatim from backend/renderers/latex.py:296-301."""
    ...


def _sanitize_for_latex(value):
    """Body: copy verbatim from backend/renderers/latex.py:304-336."""
    ...


def _smart_title_case(text: str) -> str:
    """Body: copy verbatim from backend/renderers/latex.py:353-376."""
    ...


def _transform_builtin_section_title(templates_dir: Path, template: str, title: str) -> str:
    """Body: rewrite to use the new templates.meta API:

    meta = load_template_meta(str(templates_dir / template))
    policy = template_render_config(meta)["section_title_case"]
    if policy == "upper":
        return title.upper()
    if policy == "lower":
        return title.lower()
    return _smart_title_case(title)
    """
    ...


def _prepare_section_titles(templates_dir: Path, template: str, section_titles: Optional[dict]) -> dict:
    """Body: rewrite to use the new templates.meta API:

    meta = load_template_meta(str(templates_dir / template))
    merged = dict(template_default_titles(meta))
    if section_titles:
        merged.update(section_titles)
    prepared = {}
    for key, title in merged.items():
        if not isinstance(title, str):
            continue
        if key in BUILTIN_SECTION_KEYS:
            prepared[key] = _escape_latex_text(
                _transform_builtin_section_title(templates_dir, template, title)
            )
        else:
            prepared[key] = _escape_latex_text(title)
    return prepared
    """
    ...


class LaTeXRenderer(BaseRenderer):
    """Body: copy verbatim from backend/renderers/latex.py:406-451.
    Update internal references:
    - `_get_template_render_bundle` → `get_template_render_bundle`
    - `_make_link_text_fn` → `make_link_text_fn`
    - `_make_contact_helpers` → `make_contact_helpers`
    - `_FONT_SIZE` → `FONT_SIZE`
    - `_build_layout_preamble` → `build_layout_preamble`
    - `_prepare_section_titles` → stays underscored (still private to this module)
    - `_build_xelatex_preamble` → `build_xelatex_preamble`
    - `_sanitize_for_latex` → stays underscored
    """
    ...
```

#### Task 6d: Create `__init__.py` re-exports

- [ ] **Step 4: Create `backend/renderers/latex/__init__.py`**

```python
"""LaTeX renderer subpackage.

Public surface — what external modules and tests should import.
"""
from backend.renderers.latex.helpers import (
    TemplateRenderBundle,
    get_template_render_bundle,
    make_contact_helpers,
    make_jinja_filters,
    make_link_text_fn,
)
from backend.renderers.latex.preamble import (
    DEFAULT_XELATEX_FONTS,
    DENSITY,
    FONT_SIZE,
    build_font_fallback_chain,
    build_layout_preamble,
    build_xelatex_preamble,
)
from backend.renderers.latex.renderer import (
    DEFAULT_SECTION_ORDER,
    DEFAULT_SECTION_TITLES,
    LaTeXRenderer,
)

__all__ = [
    "DEFAULT_SECTION_ORDER",
    "DEFAULT_SECTION_TITLES",
    "DEFAULT_XELATEX_FONTS",
    "DENSITY",
    "FONT_SIZE",
    "LaTeXRenderer",
    "TemplateRenderBundle",
    "build_font_fallback_chain",
    "build_layout_preamble",
    "build_xelatex_preamble",
    "get_template_render_bundle",
    "make_contact_helpers",
    "make_jinja_filters",
    "make_link_text_fn",
]
```

#### Task 6e: Delete the old `latex.py` and update consumers

- [ ] **Step 5: Delete the old single file**

```bash
git rm backend/renderers/latex.py
```

- [ ] **Step 6: Update `backend/main.py` imports**

Replace:
```python
from backend.renderers.latex import (
    LaTeXRenderer,
    _build_layout_preamble,
    _build_xelatex_preamble,
    _FONT_SIZE,
    _make_jinja_filters,
    _make_link_text_fn,
    _make_contact_helpers,
)
```
with:
```python
from backend.renderers.latex import (
    LaTeXRenderer,
    FONT_SIZE,
    build_layout_preamble,
    build_xelatex_preamble,
    make_contact_helpers,
    make_jinja_filters,
    make_link_text_fn,
)
```

In the same file, drop the underscores on these symbols at every call site:
- `_FONT_SIZE` → `FONT_SIZE`
- `_build_layout_preamble` → `build_layout_preamble`
- `_build_xelatex_preamble` → `build_xelatex_preamble`
- `_make_jinja_filters` → `make_jinja_filters`
- `_make_link_text_fn` → `make_link_text_fn`
- `_make_contact_helpers` → `make_contact_helpers`

- [ ] **Step 7: Update `tests/test_latex_renderer.py:5`**

Replace:
```python
from backend.renderers.latex import LaTeXRenderer, _build_layout_preamble, _FONT_SIZE, _make_jinja_filters, _make_contact_helpers, _make_link_text_fn
```
with:
```python
from backend.renderers.latex import LaTeXRenderer, build_layout_preamble, FONT_SIZE, make_jinja_filters, make_contact_helpers, make_link_text_fn
```

In the same file, drop underscores at every call site:
- `_FONT_SIZE` → `FONT_SIZE`
- `_build_layout_preamble` → `build_layout_preamble`
- `_make_jinja_filters` → `make_jinja_filters`
- `_make_contact_helpers` → `make_contact_helpers`
- `_make_link_text_fn` → `make_link_text_fn`

- [ ] **Step 8: Run tests**

```bash
npm test
```
Expected: 111 + 285 pass.

- [ ] **Step 9: Commit**

```bash
git add backend/renderers/latex/ tests/test_latex_renderer.py backend/main.py
git rm backend/renderers/latex.py
git commit -m "refactor: split renderers/latex.py into renderers/latex/ subpackage"
```

(Single commit because the four new files don't compile in isolation — splitting the commit would mean an intermediate failing state.)

---

### Task 7: `backend/templates/validation.py`

**Files:**
- Create: `backend/templates/validation.py`
- Modify: `backend/main.py:223-284` (delete `_validate_template`, add import)

- [ ] **Step 1: Create `backend/templates/validation.py`**

```python
"""Template validation: Jinja2 strict-render + xelatex compile.

Used at app startup (lifespan) and via POST /api/templates/{name}/validate.
Returns {'valid': bool, 'errors': list[str]}.
"""
from pathlib import Path

import jinja2

from backend.models import (
    CVData, PersonalInfo, ExperienceItem, EducationItem, SkillGroup,
    ProjectItem, CertificationItem, PublicationItem, LanguageItem,
    AwardItem, ExtracurricularItem, CustomSection, CustomBlock,
)
from backend.renderers.latex import (
    FONT_SIZE,
    build_layout_preamble,
    build_xelatex_preamble,
    make_contact_helpers,
    make_jinja_filters,
    make_link_text_fn,
)
from backend.services.pdf_compiler import compile_pdf_sync


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
            content=[CustomBlock(type="bullets", items=["Item one", "Item two"])],
        )
    ],
)


def validate_template(name: str, templates_dir: Path) -> dict:
    """Two-stage check: strict Jinja2 render + xelatex compile.
    Body: copy from backend/main.py:223-284 (was _validate_template), with these
    edits:
    - Use `make_jinja_filters`, `make_link_text_fn`, `make_contact_helpers`,
      `build_layout_preamble`, `build_xelatex_preamble`, `FONT_SIZE` (no underscores).
    - Replace the inline `with tempfile.TemporaryDirectory()` xelatex block with
      a call to `compile_pdf_sync(rendered)`. If `compile_err` is not None,
      return `{"valid": False, "errors": compile_err["details"] or [compile_err["message"]]}`.
    - `templates_dir` is a function parameter, not the module-level `TEMPLATES_DIR`.
    """
    ...
```

- [ ] **Step 2: Update `backend/main.py`**

Remove `_validate_template` and `_SAMPLE_CV` from `main.py:39-60, 223-284`.

Add import:
```python
from backend.templates.validation import validate_template
```

Update `lifespan` to call `validate_template(template_dir.name, TEMPLATES_DIR)` instead of `_validate_template(template_dir.name)`.

Update `validate_template` route handler (around `main.py:692`) — the route function is currently named `validate_template` and conflicts with the imported one. Rename the route function to `validate_template_route` (FastAPI uses the path, not the function name, for routing — the rename is safe).

Around `main.py:692`:
```python
@app.post("/api/templates/{name}/validate")
async def validate_template_route(name: str):
    if not _template_exists(name):
        return JSONResponse(status_code=404, content={"error": "not_found", "message": f"Template '{name}' not found"})
    result = await asyncio.to_thread(validate_template, name, TEMPLATES_DIR)
    _template_validation_cache[name] = result
    return result
```

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: 111 + 285 pass.

- [ ] **Step 4: Commit**

```bash
git add backend/templates/validation.py backend/main.py
git commit -m "refactor: move template validation to backend/templates/validation.py"
```

---

### Task 8: `backend/api/errors.py`

**Files:**
- Create: `backend/api/__init__.py` (single line: `"""Backend API subpackage."""`)
- Create: `backend/api/errors.py`
- Modify: `backend/main.py:314-318` (delete `_error`, add import)

- [ ] **Step 1: Create `backend/api/__init__.py`**

```python
"""Backend API subpackage."""
```

- [ ] **Step 2: Create `backend/api/errors.py`**

```python
"""Error response helpers for FastAPI handlers."""
from typing import Optional

from fastapi.responses import JSONResponse

from backend.models import CVData
from backend.parsers.yaml_parser import parse_yaml, YAMLParseError, CVValidationError


def error_response(
    error_type: str,
    message: str,
    details: Optional[list[str]] = None,
    status: int = 422,
) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": error_type, "message": message, "details": details or []},
    )


def parse_or_error(yaml_str: str) -> tuple[Optional[CVData], Optional[JSONResponse]]:
    """Parse YAML and return (cv, None) on success or (None, error_response) on failure.
    Exactly one of the two is None."""
    try:
        cv = parse_yaml(yaml_str)
    except YAMLParseError as e:
        return None, error_response("invalid_yaml", e.message, e.details)
    except CVValidationError as e:
        return None, error_response("validation_error", e.message, e.errors)
    return cv, None
```

- [ ] **Step 3: Update `backend/main.py`**

Remove `_error` from `main.py:314-318`. Add import:
```python
from backend.api.errors import error_response, parse_or_error
```

In the same file, search-and-replace:
- `_error(` → `error_response(`

Do NOT yet rewrite handlers to use `parse_or_error` — that happens in Task 9.

- [ ] **Step 4: Run tests**

```bash
npm test
```
Expected: 111 + 285 pass.

- [ ] **Step 5: Commit**

```bash
git add backend/api/__init__.py backend/api/errors.py backend/main.py
git commit -m "refactor: move error_response to backend/api/errors.py"
```

---

### Task 9: `backend/api/routes.py` — move route handlers

**Files:**
- Create: `backend/api/routes.py`
- Modify: `backend/main.py` (delete handlers, mount router)

- [ ] **Step 1: Create `backend/api/routes.py`**

```python
"""FastAPI route handlers.

All eight HTTP endpoints live here. main.py mounts this router and adds
nothing else.
"""
import asyncio
from pathlib import Path
from typing import Literal, Optional, List

from fastapi import APIRouter
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from backend.api.errors import error_response, parse_or_error
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


def _template_exists(template: str) -> bool:
    return (TEMPLATES_DIR / template / "cv.tex.j2").exists()


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


@router.get("/api/schema")
async def get_schema():
    return build_cv_schema()


@router.post("/api/validate")
async def validate(req: CVRequest):
    """Body: copy from backend/main.py:480-492 (was @app.post("/api/validate")).
    Use `parse_or_error` instead of inline try/except. Returns
    `{"valid": bool, "errors": list}`."""
    ...


@router.post("/api/preview")
async def preview(req: CVRequest):
    """Body: copy from backend/main.py:496-504. Use `parse_or_error`."""
    ...


@router.post("/api/export/markdown")
async def export_markdown(req: CVRequest):
    """Body: copy from backend/main.py:508-521. Use `parse_or_error`."""
    ...


@router.post("/api/export/latex")
async def export_latex(req: CVRequest):
    """Body: copy from backend/main.py:525-549. Use `parse_or_error`,
    `error_response`, `_template_exists`."""
    ...


@router.post("/api/export/pdf")
async def export_pdf(req: CVRequest):
    """Body: copy from backend/main.py:553-602. Use `parse_or_error`,
    `error_response`, `_template_exists`, `compile_pdf` (already routed
    through services/pdf_compiler in Task 3c)."""
    ...


@router.post("/api/preview/pdf")
async def preview_pdf(req: CVRequest):
    """Body: copy from backend/main.py:606-665. Use `parse_or_error`,
    `error_response`, `_template_exists`, `record_preview_request`,
    `stale_response_if_needed`, `touch_preview_session_state`, `compile_pdf`."""
    ...


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
            name: template_meta_cache.get(name, load_template_meta(str(TEMPLATES_DIR / name)))
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
```

The `template_meta_cache` and `template_validation_cache` imports come from `backend/templates/cache.py`, which Task 10 creates. **Task 9 must precede Task 10's commit logically, but the file `backend/templates/cache.py` has to exist for the routes import to resolve.** Resolution: in this same Task 9, also create a stub `backend/templates/cache.py` with empty dicts; Task 10 then wires the lifespan to populate them.

Add to Task 9: create `backend/templates/cache.py` with:
```python
"""Module-level caches shared by main.py:lifespan and api/routes.py."""
template_meta_cache: dict[str, dict] = {}
template_validation_cache: dict[str, dict] = {}
```

(This conflates Task 9 and Task 10 a bit. Acceptable — the alternative is a broken intermediate state.)

- [ ] **Step 2: Update `backend/main.py`**

Delete:
- `class CVRequest(BaseModel):` (`main.py:301-311`)
- `def _template_exists(template: str) -> bool:` (`main.py:321-322`)
- All eight `@app.get`/`@app.post` route handlers and their bodies (`main.py:471-697`)

Add at the top, after the FastAPI import:
```python
from backend.api.routes import router
from backend.templates.cache import template_meta_cache, template_validation_cache
```

Add after `app = FastAPI(lifespan=lifespan)`:
```python
app.include_router(router)
```

In `lifespan`, replace:
- `_template_validation_cache[template_dir.name] = …` → `template_validation_cache[template_dir.name] = …`
- `_template_meta_cache[template_dir.name] = …` → `template_meta_cache[template_dir.name] = …`

Also change `validate_template` argument from `template_dir.name` (single arg, old signature) to `template_dir.name, TEMPLATES_DIR` (matching the new `validate_template` signature from Task 7).

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: 111 + 285 pass.

- [ ] **Step 4: Commit**

```bash
git add backend/api/routes.py backend/templates/cache.py backend/main.py
git commit -m "refactor: move route handlers to backend/api/routes.py"
```

---

### Task 10 (deferred — folded into Task 9)

`backend/templates/cache.py` is created in Task 9 because `routes.py` needs to import from it. This task is intentionally empty in the implementation order. (The migration order in the spec listed this separately; in practice it has to land alongside Task 9 or both files break.)

---

### Task 11: Slim `backend/main.py`

**Files:**
- Modify: `backend/main.py` (final cleanup pass)

- [ ] **Step 1: Strip remaining unused imports**

After Tasks 1–9, `main.py` will still have many imports that are no longer used (Pydantic models, parser, etc.). Read the current file and remove every import not referenced in the remaining body. The final file should be roughly:

```python
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
                template_validation_cache[template_dir.name] = await asyncio.to_thread(
                    validate_template, template_dir.name, TEMPLATES_DIR
                )
            if (template_dir / "cv.tex.j2").exists() or (template_dir / "meta.yaml").exists():
                template_meta_cache[template_dir.name] = load_template_meta(str(template_dir))
    yield


app = FastAPI(lifespan=lifespan)
app.include_router(router)


frontend_dir = Path("frontend")
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
```

That's ~30 lines. The acceptance criterion was ≤ 80, so this is comfortably under.

- [ ] **Step 2: Verify line count**

```bash
wc -l backend/main.py
```
Expected: ≤ 80.

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: 111 + 285 pass.

- [ ] **Step 4: Commit**

```bash
git add backend/main.py
git commit -m "refactor: slim backend/main.py to instance + lifespan + mount"
```

---

## Final verification

- [ ] **Run full suite from a clean shell**

```bash
npm test
```
Expected: exit 0, 111 + 285 pass.

- [ ] **Acceptance checks from the spec**

```bash
# main.py is ≤ 80 lines
wc -l backend/main.py

# old latex.py is gone
ls backend/renderers/latex.py 2>&1   # expect: No such file or directory
ls backend/renderers/latex/          # expect: __init__.py, helpers.py, preamble.py, renderer.py

# Constants are defined exactly once
grep -rn "^BUILTIN_SECTION_KEYS\|^VALID_DENSITIES\|^VALID_FONT_SCALES" backend/ | grep -v __pycache__
# Expect: each one appears exactly once in backend/constants.py.

# No private cross-module imports inside backend/
grep -rn "from backend\." backend/ | grep "import _" | grep -v __pycache__
# Expect: empty.

# xelatex subprocess called from exactly one place
grep -rn "subprocess.run.*xelatex\|\"xelatex\"" backend/ | grep -v __pycache__
# Expect: only backend/services/pdf_compiler.py hits.

# No frontend or template-content changes
git diff phase-0-foundations..HEAD --name-only | grep -E "^frontend/|backend/templates/.*\.tex\.j2$|backend/templates/.*meta\.yaml$"
# Expect: empty output.
```

- [ ] **Verify commit count is 12–14 and each is independently green**

```bash
git log --oneline phase-0-foundations..HEAD
```

Each commit message should start with `refactor:` (or `feat:` for the introduction of `pdf_compiler.py`). The reviewer should be able to `git checkout` any of them and `npm test` should pass.

Phase 1 is done. Phase 2 (frontend bundler) can proceed independently.
