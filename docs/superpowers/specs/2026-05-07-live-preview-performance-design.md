# Live Preview Performance Improvements — Design Spec

**Date:** 2026-05-07
**Status:** Approved

---

## Overview

Improve mkcv's automatic PDF preview responsiveness without changing the editor's core workflow. The current experience feels slow for two separate reasons:

1. the frontend waits 1.5 seconds before sending a preview request
2. every preview request performs a full XeLaTeX compile and then re-renders the PDF pages in the browser

Local measurement on the current codepath shows the real bottleneck is the PDF compile step, not YAML parsing:

- YAML parse: about `0.9 ms`
- LaTeX render: about `22.8 ms`
- `xelatex`: about `1252 ms`

The first iteration therefore focuses on reducing wasted preview work and making the latest edit win quickly, rather than attempting a larger rendering architecture change.

---

## Goals

- make the preview feel more responsive after the user pauses typing
- prevent stale preview work from stacking up
- reduce duplicate YAML parsing during resume editing
- keep the existing live-PDF product behavior intact

## Non-Goals

- no draft HTML/Markdown preview mode
- no hard cancellation of an already-running `xelatex` process
- no PDF.js virtualization or partial page rendering changes
- no editor or backend framework migration

---

## Chosen Approach

The approved first iteration combines four small-to-medium changes:

1. **Frontend latest-only scheduling**
2. **Backend per-session preview coalescing**
3. **Cached Jinja environment/template loading**
4. **Shared/memoized resume YAML parsing on the frontend**

This keeps the implementation bounded while addressing the main sources of perceived slowness and unnecessary work.

---

## 1. Frontend Latest-Only Preview Scheduler

`frontend/preview.js` will stop behaving like a fire-and-forget debounce wrapper. Instead, it becomes a small scheduler with these rules:

- keep at most one preview request in flight per browser tab
- when new input arrives during an in-flight request, replace any previously pending payload with the newest one
- when the current request finishes, immediately launch the newest pending payload if one exists
- ignore any response whose sequence is older than the latest accepted request

### New frontend state

The preview module gets a small internal state machine:

- `previewSessionId`: generated once per tab load
- `nextRequestSeq`: monotonically increasing integer
- `inFlight`: whether a request is currently active
- `pendingPayload`: newest payload waiting to be sent
- `lastAppliedSeq`: newest response allowed to update the UI

### Debounce policy

After the scheduler exists, the preview debounce is reduced from `1500 ms` to roughly `800-1000 ms`. The exact value is an implementation choice, but it should remain above normal per-keystroke cadence and below the current visible lag.

### Response handling

The frontend continues to treat `AbortError` as a silent no-op. In addition, it must silently ignore a backend `stale_preview` response, because that means a newer request from the same tab has already superseded it.

---

## 2. Backend Per-Session Preview Coalescing

The backend currently compiles every `/api/preview/pdf` request independently. That wastes CPU whenever a newer preview arrives before an older compile finishes.

The first iteration does **not** try to kill a running `xelatex` process. Instead, it ensures that only the newest request for a given browser session is worth completing.

### Request metadata

`CVRequest` gains two optional preview-only fields:

- `preview_session_id: str | None`
- `preview_request_seq: int | None`

Regular preview/export callers remain valid because the fields are optional.

### Coordinator model

`backend/main.py` gains a lightweight in-memory preview coordinator keyed by `preview_session_id`.

For each session, it stores:

- an `asyncio.Lock`
- the newest seen request sequence
- a last-seen timestamp for opportunistic cleanup

### Behavior

For requests that include session metadata:

1. record the newest seen sequence for that session
2. acquire the session lock before the expensive render/compile section
3. once inside the lock, check whether the request sequence is already stale
4. if stale, return a lightweight `409` response such as `{ "error": "stale_preview" }`
5. if still current, render LaTeX and compile PDF
6. after compile completes, check again whether the request became stale while it was running
7. if stale, return `409 stale_preview` instead of PDF bytes
8. otherwise return the PDF normally

This design gives each tab a latest-only pipeline without introducing cross-user interference. Different browser tabs or users do not block each other unless they intentionally share the same `preview_session_id`.

### Cleanup policy

Because this state lives in-process, stale coordinator entries should be pruned opportunistically during preview requests based on age. This keeps the first iteration simple and avoids a dedicated background janitor.

---

## 3. Cached Jinja Environment and Template Loading

`backend/renderers/latex.py` currently rebuilds a new `jinja2.Environment` on every render. That is not the dominant cost, but it is unnecessary repeated setup on the hot path.

### New policy

- cache the static Jinja environment per template directory
- keep static filters on the cached environment
- pass request-specific helpers through `template.render(...)` context instead of mutating shared environment globals per request

### Why request helpers move into render context

The current helpers depend on request-specific state:

- `link_text`
- `contact_visible`
- `contact_link_style`

Those helpers must not be stored as mutable shared globals on a cached environment, because concurrent requests could overwrite each other. Passing them as render context preserves correctness while still caching the expensive static environment/template setup.

---

## 4. Shared or Memoized Resume YAML Parsing

Resume editing currently re-parses the same YAML string multiple times across:

- `frontend/settings-sync.js`
- `frontend/sections-state.js`
- preview preparation paths that compute visible section order and filtered YAML

The first iteration reduces this by introducing a shared parsed-resume helper in the frontend.

### Scope

- add one cached parse path keyed by raw YAML string
- reuse it for section-presence detection and ordered/filtered preview YAML generation
- remove direct duplicated `jsyaml.load(yaml)` calls where the same raw string is already being inspected in the same event flow

### Design preference

Prefer a small shared helper or module-local memoization over broad API churn. This keeps the optimization low-risk and avoids rewriting the section-state surface area more than necessary.

---

## Data Flow After Changes

### Resume typing

1. user edits `resume.yaml`
2. preview debounce fires after a shorter pause
3. frontend creates a new request sequence for the current tab session
4. if no request is active, send immediately
5. if a request is already active, overwrite `pendingPayload` with the newest payload only
6. backend accepts the request and records its session sequence
7. backend compiles only if that sequence is still current for its session
8. frontend applies the returned PDF only if the response sequence is still the newest allowed result

### Rapid consecutive edits

1. request A starts compiling
2. user edits again and request B becomes the newest pending payload
3. request A may finish, but if it is now stale the backend returns `stale_preview`
4. frontend ignores A's result
5. request B runs next and becomes the only render that updates the UI

---

## Error Handling

- invalid YAML and validation errors continue to surface exactly as they do today
- `stale_preview` is not shown to the user; it is an internal control response
- session metadata is optional, so callers without it continue to use the old behavior
- if preview coordinator state is missing or malformed, fall back to normal preview behavior rather than failing the request

---

## Files Affected

- `frontend/preview.js`
  - add latest-only scheduler and per-tab session metadata
  - reduce preview debounce after scheduler lands
- `frontend/settings-sync.js`
  - stop redundant resume YAML parse work during section sync paths
- `frontend/sections-state.js`
  - add shared/memoized parsed-resume access for repeated section computations
- `backend/main.py`
  - accept preview session metadata
  - add per-session preview coordinator and stale response handling
- `backend/renderers/latex.py`
  - cache Jinja environment/template loading
  - move request-specific helpers into render context

---

## Testing

Verification should cover these guarantees:

1. multiple quick edits from one tab result in only the newest preview being applied
2. stale preview responses are ignored without showing an error banner
3. different preview sessions do not share coalescing state
4. cached Jinja environment rendering still respects per-request `link_display` and contact visibility settings
5. section ordering and hidden-section filtering still produce the same preview YAML after the parsing optimization

### Suggested coverage

- frontend unit coverage for preview scheduler sequencing and stale response ignore behavior
- backend API tests for `stale_preview` handling with mocked slow compile behavior
- regression coverage for link-display and personal-field rendering correctness

---

## Out of Scope for This Iteration

- force-killing an active `xelatex` subprocess when a newer request arrives
- introducing a separate lightweight draft preview mode
- optimizing PDF.js page rendering strategy
- changing the settings-tab debounce behavior beyond what is needed to avoid duplicate preview work
