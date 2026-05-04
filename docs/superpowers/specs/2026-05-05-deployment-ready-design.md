# Deployment-Ready MKCV Design

**Date:** 2026-05-05  
**Goal:** Make MKCV safe and correct for multi-user use, easy to run locally via Docker, publishable as a prebuilt image, and deployable on cloud platforms with minimal setup.

---

## Scope

Three use cases, one container:

1. **Local Docker usage** — `docker run --rm -p 8000:8000 ghcr.io/hyun9junn/mkcv:latest`
2. **Prebuilt image** — published to GHCR on every `main` push via GitHub Actions
3. **Cloud deployment** — Railway / Render auto-detect the `Dockerfile`; no platform config files needed

Native Python remains supported as a dev/contributor path only. Users on that path must install `pdflatex` separately.

---

## Architecture

MKCV becomes a fully stateless FastAPI + vanilla JS single-container service.

- The container writes **nothing persistent** to disk at runtime. `pdflatex` may write temporary files inside a per-request `tempfile.TemporaryDirectory()`, which is deleted automatically after the request completes.
- All user-owned state lives in **browser `localStorage`**: `resume.yaml` (CV content) and `settings.yaml` (layout, sections, template preferences).
- The server handles only stateless request/response: parse YAML, render LaTeX, run pdflatex in a temp dir, return bytes.

**Foundation:** the `feat/multi-user-deployment` branch is merged to `main` first. It already delivers: shared `output/` removal, `asyncio.to_thread` for pdflatex, CV YAML moved to localStorage, `/api/file` routes removed, Dockerfile with TeX Live, `.dockerignore`. New work builds on top of that.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `backend/main.py` | Modify | Remove `SETTINGS_FILE`, `get_settings`, `save_settings` |
| `frontend/file-sync.js` | Modify | Add settings-tab guard; rename key to `mkcv:default:resume.yaml`; add quota-error toast |
| `frontend/settings-sync.js` | Modify | Replace `fetch('/api/settings')` with localStorage; rename key to `mkcv:default:settings.yaml`; fix `_reorderAndSaveResume` fallback; extend migration |
| `Dockerfile` | Modify | Use `${PORT:-8000}` and `${WEB_CONCURRENCY:-1}` in CMD |
| `.github/workflows/docker-publish.yml` | Create | Build + push to GHCR on every `main` push |
| `tests/test_api.py` | Modify | Add `/api/settings` 404 tests; add no-settings-disk-write test; skip PDF tests when pdflatex missing |
| `README.md` | Modify | Docker-first quick start; localStorage data model; Import/Export backup path; Railway/Render deploy guide; native Python as secondary path |

---

## localStorage Data Model

| Key | Content | Written by |
|---|---|---|
| `mkcv:default:resume.yaml` | User's CV YAML | `file-sync.js` |
| `mkcv:default:settings.yaml` | Layout, sections, template settings YAML | `settings-sync.js` |

The `:default:` segment is a profile slot — reserved for future multi-profile support.

**Tab guard (mandatory):** the editor hosts two tabs sharing one CodeMirror instance.
- Resume tab changes → only write `mkcv:default:resume.yaml`
- Settings tab changes → only write `mkcv:default:settings.yaml`
- `file-sync.js` must restore the guard: `if (window.settingsSync?.activeTab === 'settings') return;`

**Error handling:** all `localStorage.setItem(...)` calls are wrapped in `try/catch`. On failure (quota exceeded, browser policy), show a small non-blocking toast — editing continues uninterrupted, but the user is aware their data was not saved.

**Debouncing:** localStorage writes are synchronous and cheap. Remove the 1-second network debounce from `file-sync.js`. The render/preview debounce (1.5 s) lives in `preview.js` and is unaffected.

**Migration from old keys:** on first load, before reading the new keys:
1. If `mkcv:default:resume.yaml` is **absent** and `mkcv_yaml` exists → copy to `mkcv:default:resume.yaml`, remove `mkcv_yaml`
2. If `mkcv:default:settings.yaml` is **absent** and `mkcv_settings_yaml` exists → copy to `mkcv:default:settings.yaml`, remove `mkcv_settings_yaml`

Never overwrite a new key that already has data. Extend the existing `_migrate()` function in `settings-sync.js` to handle this.

---

## Backend Changes

Remove from `backend/main.py`:
- `SETTINGS_FILE = Path("settings.yaml")`
- `get_settings()` endpoint (`GET /api/settings`)
- `save_settings()` endpoint (`POST /api/settings`)

The `FileRequest` model and `/api/file` routes are already removed on the `feat/multi-user-deployment` branch.

No other backend logic changes. All rendering, templates, and pdflatex handling are untouched.

---

## Dockerfile

The `Dockerfile` already exists on `feat/multi-user-deployment`. Update the `CMD` to respect environment variables:

```dockerfile
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-1}"]
```

This allows Railway and Render to inject `PORT` and `WEB_CONCURRENCY` without requiring users to configure anything. Default workers is 1 (safe baseline); users can set `WEB_CONCURRENCY=4` if needed.

---

## GitHub Actions CI/CD

File: `.github/workflows/docker-publish.yml`

Triggers on push to `main`. Steps:

1. Checkout repo
2. Run `pytest` — a failing test blocks the publish
3. Log in to GHCR using the built-in `GITHUB_TOKEN` (no secrets to configure)
4. Extract metadata; tag image as `ghcr.io/hyun9junn/mkcv:latest`
5. Build and push using `docker/build-push-action`

**Note:** after the first push, the package must be manually set to **public** in the GitHub repository's Packages settings (`github.com/hyun9junn/mkcv/pkgs/container/mkcv` → Package settings → Change visibility → Public). Without this, unauthenticated `docker pull` will fail.

---

## Testing

**New tests in `tests/test_api.py`:**
- `test_settings_get_removed` — `GET /api/settings` returns 404
- `test_settings_post_removed` — `POST /api/settings` returns 404
- `test_settings_no_disk_write` — after any render/export request, no `settings.yaml` exists in the working directory

**PDF tests:** wrap in a `pytest.mark.skipif` or a conftest fixture that checks `shutil.which("pdflatex") is None`. Skip gracefully in CI environments without TeX Live rather than failing.

**Key rename in JS tests:** any existing JS test that references `mkcv_yaml` or `mkcv_settings_yaml` as localStorage keys must be updated to `mkcv:default:resume.yaml` and `mkcv:default:settings.yaml`.

---

## README Structure

1. **Quick start (Docker)** — primary path, one command: `docker run --rm -p 8000:8000 ghcr.io/hyun9junn/mkcv:latest`
2. **Your data & localStorage** — explain that `resume.yaml` and `settings.yaml` live in browser localStorage; data persists across browser sessions on the same machine/browser
3. **Backup & portability** — use the app's Export buttons to download `resume.yaml` / `settings.yaml`; paste into the editor to restore
4. **Cloud deployment** — Railway (3 steps) and Render (3 steps), both using the auto-detected `Dockerfile`
5. **Dev / contributor setup** — native Python path; explicit note that `pdflatex` must be installed separately (links to existing Installing LaTeX section)
6. All other existing sections (CV format, templates, API reference, tests) remain unchanged

---

## Out of Scope

- Multiple profiles (the `:default:` key slot reserves the space but no profile-switching UI)
- Explicit Import/Export YAML buttons (noted as a future improvement; Export via existing download buttons, Import via paste-in for now)
- Versioned Docker image tags (only `latest` for now)
- Platform-specific config files (`railway.toml`, `render.yaml`) — not needed; Dockerfile is sufficient
