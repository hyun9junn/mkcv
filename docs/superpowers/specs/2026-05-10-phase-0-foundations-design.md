# Phase 0 — Foundations

Part of the multi-phase mkcv refactor. Phase 0 establishes a green-CI baseline before any structural change. No code architecture moves; just hygiene so later phases have a trustworthy `npm test` to run.

## Why this comes first

The later phases (backend split, frontend bundler, module split, persistence, template authoring) all depend on being able to detect regressions quickly. Today:

- `package.json` has `"test": "echo 'Error: no test specified' && exit 1"` despite ~12 JS test files and ~10 Python test files.
- Two pre-existing JS tests fail in `tests/test_onboarding.js` (`ReferenceError: Image is not defined` in the `vm.runInNewContext` sandbox).
- Three `.DS_Store` files are tracked in git (`.DS_Store`, `backend/.DS_Store`, `backend/templates/.DS_Store`) and `.gitignore` does not exclude them, so every `git status` shows churn.

Phase 0 fixes all three so subsequent phases have signal, not noise.

## Scope

In scope:

1. Wire JS + Python tests into `npm test`.
2. Fix the two failing `test_onboarding.js` tests by stubbing `Image` in the test sandbox.
3. Untrack the three tracked `.DS_Store` files and add `.DS_Store` to `.gitignore`.

Out of scope (deferred to later phases):

- Linting, formatting, type-checking — Phase 2 will pull those in alongside the bundler.
- Coverage reporting — wait until ES modules land so the harness is clean.
- CI configuration (`.github/workflows`) — separate from local test wiring; revisit at end of Phase 1.

## Changes

### `package.json` scripts

```json
"scripts": {
  "test": "npm run test:js && npm run test:py",
  "test:js": "node --test \"tests/test_*.js\" \"tests/*.test.mjs\"",
  "test:py": "pytest"
}
```

Rationale:
- `node --test` is built-in (no new dep) and the existing tests already use `node:test`.
- The glob `tests/test_*.js` matches the existing CommonJS tests; `tests/*.test.mjs` matches `generate-onboarding-gifs.test.mjs`.
- `test:py` shells out to `pytest`; `pytest.ini` already configures it.
- The combined `test` runs both — fail-fast via `&&`.

### `tests/test_onboarding.js` Image stub

The sandbox built by `makeObCtx` (around line 1–80 of `tests/test_onboarding.js`) needs an `Image` constructor because `frontend/onboarding.js`'s `preloadImages` uses `new Image()`. The minimal stub:

```js
Image: function Image() { /* noop preload stub */ },
```

Added to the `context` object in the existing helper. No production code changes.

### `.gitignore` and untracking

Append `.DS_Store` to `.gitignore`. Run `git rm --cached .DS_Store backend/.DS_Store backend/templates/.DS_Store` so the files leave git but stay on disk. Single commit.

## Acceptance

Phase 0 is done when:

1. `npm test` exits 0 on a clean checkout (with `xelatex` available — pytest already skips xelatex tests when not installed via `conftest.py`).
2. `git status` is clean after `npm test` (no `.DS_Store` churn).
3. Diff is small and reviewable: `package.json` (3 lines), `tests/test_onboarding.js` (1 line), `.gitignore` (1 line), three `git rm --cached` operations.

## Risk and rollback

Risk: low. No production code touched. Rollback is `git revert`.

Caveat: `npm test` running pytest assumes the user has `pytest` on PATH (already required by the existing `requirements.txt`). If a future contributor runs without the venv activated, `test:py` will fail loudly — that's the desired behavior.

## What this unblocks

Phase 1 (backend modularization) needs a green test baseline before splitting `backend/main.py`, since several pytest files exercise the routes directly. Phase 0 gives us that baseline in under an hour.
