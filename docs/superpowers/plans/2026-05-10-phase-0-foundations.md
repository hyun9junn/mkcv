# Phase 0 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a green-CI baseline (`npm test` exits 0) and clean working tree before Phase 1 backend modularization.

**Architecture:** Three small hygiene changes — untrack `.DS_Store`, fix two pre-existing `Image` reference errors in `tests/test_onboarding.js`, wire `package.json` scripts to run JS + Python tests. No production code changes.

**Tech Stack:** `node --test` (built-in), `pytest` (existing), git.

**Source spec:** `docs/superpowers/specs/2026-05-10-phase-0-foundations-design.md`

---

## File map

| File | Change | Purpose |
|---|---|---|
| `.gitignore` | Modify | Append `.DS_Store` line |
| `.DS_Store` | Untrack | Remove from git index, keep on disk |
| `backend/.DS_Store` | Untrack | Same |
| `backend/templates/.DS_Store` | Untrack | Same |
| `tests/test_onboarding.js:75-87` | Modify | Stub `Image` constructor in `makeObCtx` sandbox |
| `package.json:10-12` | Modify | Replace placeholder `test` script with real `test`, `test:js`, `test:py` |

Task order is important: untrack `.DS_Store` first so later commits aren't noisy, then fix the failing tests so `npm test` will pass when wired in the final task.

---

### Task 1: Untrack `.DS_Store` and add to `.gitignore`

**Files:**
- Modify: `.gitignore`
- Untrack: `.DS_Store`, `backend/.DS_Store`, `backend/templates/.DS_Store`

- [ ] **Step 1: Confirm the three tracked files**

Run: `git ls-files | grep -i 'DS_Store'`
Expected:
```
.DS_Store
backend/.DS_Store
backend/templates/.DS_Store
```

- [ ] **Step 2: Append `.DS_Store` to `.gitignore`**

Edit `.gitignore` from:
```
.superpowers/
.worktrees/
__pycache__/
*.pyc
.venv/
node_modules/
output/
```
to:
```
.superpowers/
.worktrees/
__pycache__/
*.pyc
.venv/
node_modules/
output/
.DS_Store
```

- [ ] **Step 3: Untrack the three files (keep on disk)**

Run:
```bash
git rm --cached .DS_Store backend/.DS_Store backend/templates/.DS_Store
```
Expected: three `rm '...'` lines.

- [ ] **Step 4: Verify**

Run: `git ls-files | grep -i 'DS_Store'`
Expected: empty output.

Run: `ls .DS_Store backend/.DS_Store backend/templates/.DS_Store`
Expected: all three still exist (not deleted from disk).

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "chore: untrack .DS_Store files and add to .gitignore"
```
Expected: 1 commit with `.gitignore` modified and three deletions.

---

### Task 2: Fix `Image is not defined` in `test_onboarding.js`

**Files:**
- Modify: `tests/test_onboarding.js:68-87` (the `makeObCtx` helper)
- Test: `tests/test_onboarding.js:118-130` (the two failing tests — no edits, just verification)

- [ ] **Step 1: Run the failing tests to confirm the baseline**

Run: `node --test tests/test_onboarding.js`
Expected: 7 pass, 2 fail. The two failures both say `ReferenceError: Image is not defined` and originate inside `frontend/onboarding.js` at the `preloadImages` call.

- [ ] **Step 2: Read the helper to find the insertion point**

Open `tests/test_onboarding.js`. The helper `makeObCtx` starts at line 68. The `vm.createContext({...})` call begins around line 75 and lists keys: `window`, `localStorage`, `document`, `setTimeout`, `clearTimeout`, etc. The `Image` stub joins this list as a sibling key.

- [ ] **Step 3: Add the `Image` stub**

Inside the `vm.createContext({...})` object literal in `makeObCtx`, add this entry alongside the other globals:

```js
Image: function Image() {
  // Stub for onboarding.preloadImages — no real image loading in tests.
},
```

The exact placement: anywhere inside the object literal, but conventionally next to other globals like `setTimeout`. The function body is intentionally empty — `preloadImages` only calls `new Image()` and assigns `.src`, both of which are no-ops here.

- [ ] **Step 4: Run the same test command to verify it passes**

Run: `node --test tests/test_onboarding.js`
Expected: 9 pass, 0 fail.

- [ ] **Step 5: Run the full JS test suite to confirm no other test regressed**

Run: `node --test "tests/test_*.js" "tests/*.test.mjs"`
Expected: all tests pass (109 + 2 from the .mjs file = 111 total, all green).

- [ ] **Step 6: Commit**

```bash
git add tests/test_onboarding.js
git commit -m "test: stub Image constructor in onboarding test sandbox"
```

---

### Task 3: Wire `npm test` to run JS + Python tests

**Files:**
- Modify: `package.json:10-12` (the `scripts` block)

- [ ] **Step 1: Confirm current scripts block**

Run: `cat package.json | python -c "import sys, json; print(json.dumps(json.load(sys.stdin)['scripts'], indent=2))"`
Expected:
```json
{
  "test": "echo \"Error: no test specified\" && exit 1"
}
```

- [ ] **Step 2: Replace the scripts block**

Edit `package.json`. The current `"scripts": { ... }` block (around lines 10–12):
```json
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
```
becomes:
```json
  "scripts": {
    "test": "npm run test:js && npm run test:py",
    "test:js": "node --test \"tests/test_*.js\" \"tests/*.test.mjs\"",
    "test:py": "pytest"
  },
```

Keep all other top-level keys (`name`, `version`, `dependencies`, etc.) untouched.

- [ ] **Step 3: Run JS-only**

Run: `npm run test:js`
Expected: 111 tests, 0 fail (109 from `test_*.js` + 2 from the `.mjs` file).

- [ ] **Step 4: Run Python-only**

Run: `npm run test:py`
Expected: pytest exits 0. xelatex-dependent tests skip if `xelatex` is not on PATH (per `tests/conftest.py:10-13`).

- [ ] **Step 5: Run combined**

Run: `npm test`
Expected: both halves run; final exit code 0.

- [ ] **Step 6: Confirm clean working tree**

Run: `git status`
Expected: only `package.json` modified (no `.DS_Store` churn — Task 1 fixed that).

- [ ] **Step 7: Commit**

```bash
git add package.json
git commit -m "chore: wire npm test to run JS and Python suites"
```

---

## Final verification

- [ ] **Run full suite from a clean shell**

```bash
npm test
```
Expected: exits 0, both suites green.

- [ ] **Verify three commits**

```bash
git log --oneline -3
```
Expected (newest first):
```
<sha> chore: wire npm test to run JS and Python suites
<sha> test: stub Image constructor in onboarding test sandbox
<sha> chore: untrack .DS_Store files and add to .gitignore
```

- [ ] **Verify clean working tree**

```bash
git status
```
Expected: `nothing to commit, working tree clean` (the previously-modified `.DS_Store` is now untracked, so changes to it no longer appear).

Phase 0 is done. Phase 1 (backend modularization) can proceed with a trustworthy `npm test`.
