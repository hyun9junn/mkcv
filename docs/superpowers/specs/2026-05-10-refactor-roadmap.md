# mkcv Refactor — Phase Roadmap

Multi-phase, bottom-up refactor of mkcv (FastAPI backend, vanilla JS frontend, YAML → xelatex → PDF). The goal is to unblock three feature initiatives that the current architecture obstructs:

1. **More templates / richer template authoring** — templates today live in `backend/templates/<slug>/` with `cv.tex.j2` + `meta.yaml`. Authoring them is hard because schema/UI/render concerns leak across the codebase.
2. **Persistence / accounts / multi-device** — currently everything is in browser `localStorage`. No server-side user state.
3. **Richer settings UI** — settings live as `window.*` globals on a monolithic frontend; adding sections means editing several megabyte-scale files.

Each phase produces working, testable software on its own. Each phase gets its own design spec (`docs/superpowers/specs/`) and implementation plan (`docs/superpowers/plans/`) before execution.

## Phase status

| # | Name | Status | Spec | Plan |
|---|------|--------|------|------|
| 0 | Foundations | ✅ done (merged) | `2026-05-10-phase-0-foundations-design.md` | `2026-05-10-phase-0-foundations.md` |
| 1 | Backend modularization | ✅ done (merged) | `2026-05-11-phase-1-backend-modularization-design.md` | `2026-05-11-phase-1-backend-modularization.md` |
| 2 | Frontend bundler | ✅ done (merged) | `2026-05-11-phase-2-frontend-bundler-design.md` | `2026-05-11-phase-2-frontend-bundler.md` |
| 3 | Frontend module split | ⬜ not started | — | — |
| 4 | Persistence | ⬜ not started | — | — |
| 5 | Template authoring polish | ⬜ not started | — | — |

Both completed phases landed on the `phase-0-foundations` branch (13-commit fast-forward merge from `phase-1-backend-modularization`). All 396 tests (111 JS + 285 Python) pass on the merged result.

## Phase 0 — Foundations *(done)*

Wire `npm test` to run both JS (`node --test`) and Python (`pytest`) suites. Fix two failing onboarding tests (stub `Image` in the `vm.runInNewContext` sandbox). Untrack three `.DS_Store` files and add them to `.gitignore`. Result: green-CI baseline so later phases can detect regressions.

## Phase 1 — Backend modularization *(done)*

Slim `backend/main.py` from 703 lines to 36. Split responsibilities into focused subpackages:

- `backend/api/` — route handlers + error helpers
- `backend/services/` — `pdf_compiler`, `preview_session`, `schema`
- `backend/templates/` — `meta`, `validation`, `cache`
- `backend/renderers/latex/` — `preamble`, `helpers`, `renderer`
- `backend/constants.py` — single source of truth for enum-like values

Module-level dicts (`template_meta_cache`, `template_validation_cache`) shared between lifespan and routes via the explicit import. Preview-session staleness contract preserved (`asyncio.Lock`, sequence numbers).

## Phase 2 — Frontend bundler *(done)*

Add Vite. Convert the 18 inline `<script>` tags + `window.xxx` globals in `frontend/index.html` to ES module imports. Extract inline `<style>` blocks to separate CSS files. Wire a build step into `npm test` and the FastAPI static mount.

**Why:** Today `frontend/index.html` is ~megabyte-scale with everything inlined. Module boundaries are pretend (functions hang off `window`). A bundler gives us real imports, tree-shaking, and source maps — all prerequisites for Phase 3.

**Out of scope:** TypeScript migration, framework adoption (React/Vue/Svelte), CSS-in-JS, design system changes. Just plain ES modules + plain CSS, bundled.

**Acceptance:** `npm run build` produces a `dist/` that FastAPI serves. Dev mode (`npm run dev`) runs Vite alongside `uvicorn`. All 111 JS tests still pass against the source files (not bundled output).

## Phase 3 — Frontend module split *(not started)*

Break the monolithic `frontend/` JS into focused modules along the same axes as Phase 1's backend split:

- `frontend/src/api/` — fetch wrappers for the backend routes
- `frontend/src/preview/` — preview pipeline, debounce, staleness
- `frontend/src/settings/` — settings panel state + serialization
- `frontend/src/yaml/` — YAML editor, autocomplete, validation
- `frontend/src/templates/` — template picker, meta-driven UI

**Why:** With the bundler in place from Phase 2, "split a file" actually means something. Today everything reaches into shared globals; after this, each module has explicit imports.

**Out of scope:** Behavior changes. This is pure restructuring — every existing test should pass without modification.

**Acceptance:** No single file over 500 lines. No `window.xxx` assignments outside an explicit compat shim. All tests green.

## Phase 4 — Persistence *(not started)*

Add server-side user state so CVs survive across devices and browsers. Today everything is `localStorage`-only.

**Open design questions** (to be resolved in this phase's spec):
- Auth: GitHub OAuth? Magic-link email? Anonymous device tokens?
- Storage: SQLite (single-file deploy)? Postgres (multi-user scale)?
- Migration path for users with existing `localStorage` data — import on first login?
- Multi-CV per user, or one-CV-per-user?

**Acceptance:** A logged-in user can edit a CV on one device and see the same state on another. `localStorage`-only flow still works for anonymous users.

## Phase 5 — Template authoring polish *(not started)*

Make adding a new template a one-file change, not a scattered edit across the codebase. With Phase 1 done, the backend already pulls everything from `meta.yaml` + `cv.tex.j2`; this phase finishes the job on the frontend side.

**Likely scope** (subject to spec refinement):
- Template preview thumbnails generated from `cv.tex.j2` itself (not hand-curated PNGs)
- A "template doctor" CLI: `python -m mkcv validate <slug>` that reports schema/render/UI mismatches
- Frontend template picker that auto-discovers templates without hardcoded entries
- Docs in `backend/templates/README.md` brought current (Phase 1 left some stale references)

**Acceptance:** Adding a new template = drop a directory under `backend/templates/<slug>/` and reload. No frontend/backend code edits required.

## Branching

Each phase is its own feature branch off `phase-0-foundations` (the integration branch for the refactor). When the full refactor lands, `phase-0-foundations` merges to `main` as a single squash or as the preserved phase history — TBD.

## How to use this document

Before starting a phase: write its design spec under `docs/superpowers/specs/YYYY-MM-DD-phase-N-<name>-design.md`, then its plan under `docs/superpowers/plans/`. Update the status table above when a phase merges. If a phase's scope drifts mid-execution, update the "Likely scope" section in this roadmap so the picture stays current.
