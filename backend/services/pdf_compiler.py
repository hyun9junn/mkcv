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
