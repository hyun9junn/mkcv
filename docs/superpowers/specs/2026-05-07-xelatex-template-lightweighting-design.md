# XeLaTeX Template Lightweighting — Design Spec

**Date:** 2026-05-07
**Status:** Approved

---

## Overview

mkcv's live preview now avoids stale work more effectively, but the heaviest remaining cost is still the LaTeX compile itself. Local measurement shows that template-to-template preview time varies dramatically even when the CV payload is held constant:

- `classic`: about `1.14 s`
- `dealbook`: about `3.09 s`
- `slate-rail`: about `5.14 s`
- `trackline`: about `5.22 s`
- `chancellor`: about `7.68 s`

The Jinja render stage is already cheap and nearly uniform across templates, roughly `0.60-0.70 ms`. The remaining variance comes from the `xelatex` compile path, especially template-level package choices, font setup, and layout complexity.

The first iteration therefore keeps the current XeLaTeX-based architecture, but reduces avoidable compile overhead in two ways:

1. apply safe XeLaTeX-oriented cleanup across all templates
2. make small, targeted layout simplifications for the slowest templates where the expected payoff justifies the risk

---

## Goals

- reduce repeated compile overhead in the current XeLaTeX preview path
- keep the visual identity of existing templates substantially intact
- remove pdfLaTeX-era template baggage that no longer matches the real render pipeline
- improve the slowest templates first without redesigning the whole template system

## Non-Goals

- no engine split between `pdflatex` and `xelatex`
- no preview/export rendering split
- no broad template redesigns or theme refreshes
- no guarantee that every template reaches `classic`-level speed
- no changes to the current section ordering, YAML schema, or preview API behavior

---

## Chosen Approach

The approved first iteration combines two scopes:

1. **Global safe cleanup for all templates**
2. **Small, bounded lightweighting for `chancellor`, `slate-rail`, and `trackline`**

This matches the desired trade-off:

- default to appearance preservation
- allow only small visual movement where it buys meaningful compile-time improvement
- avoid larger architecture work until the template layer has been cleaned up first

---

## 1. Global Safe Cleanup

### Problem

The template library and template documentation still reflect an older `pdflatex` mental model, while the actual app render pipeline unconditionally injects a XeLaTeX preamble and compiles preview/export output with `xelatex`.

That mismatch creates two costs:

- documentation and implementation disagree about what is supported
- many templates carry legacy package declarations whose value is weaker or redundant in the current XeLaTeX path

### Scope

For every template under `backend/templates/*/cv.tex.j2`, review package declarations and remove only items that meet both of these rules:

1. they are not needed for the current XeLaTeX render path
2. removing them does not materially alter template appearance or content behavior

### Expected cleanup targets

Typical candidates include:

- `inputenc`
- `fontenc`
- `lmodern` in templates where it is only inherited legacy baggage rather than an intentional visual dependency
- unused support packages left behind from earlier template iterations

The exact removals remain template-specific. This iteration prefers correctness and safety over aggressive normalization.

### Documentation correction

`backend/templates/README.md` must be updated so that it reflects the actual runtime behavior:

- the app currently compiles through XeLaTeX
- templates receive an injected XeLaTeX preamble
- package guidance should distinguish between broadly safe packages, legacy carry-overs, and packages that are discouraged in the current pipeline

The goal is not to rewrite the entire template guide, only to remove the most misleading pdflatex-only claims and align contributor expectations with the real system.

---

## 2. Targeted Lightweighting For Slow Templates

### Template selection

The first targeted pass is limited to:

- `chancellor`
- `slate-rail`
- `trackline`

These were chosen because they are among the slowest measured templates and represent different slowdown modes:

- `chancellor`: single-column but unexpectedly slow, suggesting package/font/config overhead
- `slate-rail`: visually structured layout with sidebar and multi-column coordination overhead
- `trackline`: timeline presentation with repeated layout primitives and drawing work

### Change budget

These templates may receive small structural simplifications, but not redesign-level changes.

Allowed:

- removing unused or weak-value packages
- flattening unnecessary wrapper structure
- replacing expensive repeated layout primitives with cheaper equivalents when the visual result remains very close
- simplifying sidebar or timeline plumbing while preserving the same overall template concept

Not allowed:

- removing the sidebar concept from `slate-rail`
- removing the timeline concept from `trackline`
- changing `chancellor` into a different visual family
- introducing a new typography system or visual direction

### `chancellor`

Primary focus:

- eliminate legacy XeLaTeX-hostile or low-value package setup
- reduce compile overhead from package/font configuration before touching layout
- only simplify content structure if package cleanup alone leaves the template disproportionately slow

Visual expectation:

- the current formal red-rule single-column look remains the same to a casual user

### `slate-rail`

Primary focus:

- preserve the dark sidebar and right-column content structure
- reduce unnecessary wrapper depth and layout coordination where possible
- avoid a large rewrite of the two-column concept in this iteration

Visual expectation:

- sidebar-first look remains intact
- minor spacing or alignment shifts are acceptable if they are subtle

### `trackline`

Primary focus:

- preserve the left-rail chronology concept
- inspect repeated `tikz` or timeline entry construction for cheaper equivalents
- reduce per-entry layout work where the timeline still reads the same

Visual expectation:

- the timeline still clearly looks like a timeline
- very small marker, spacing, or alignment differences are acceptable

---

## Appearance Preservation Rules

This iteration is intentionally conservative.

### Default rule

If a cleanup produces meaningfully different type, hierarchy, alignment, or information density, it is out of scope unless the template is one of the three targeted lightweighting templates and the change is both:

- small in visual impact
- likely to provide meaningful performance benefit

### Acceptable differences

- very small shifts in line breaks
- subtle spacing changes
- tiny alignment changes in sidebars, headers, or date rails
- equivalent replacements of repeated decorative primitives

### Unacceptable differences

- obvious typography changes
- clearly different section hierarchy
- visibly different sidebar/timeline structure
- content loss or broken conditional rendering

---

## Implementation Boundaries

### Files in scope

- `backend/templates/README.md`
- `backend/templates/*/cv.tex.j2`
- tests that validate LaTeX rendering or template preview behavior

### Files out of scope

- `backend/main.py` engine selection logic
- renderer engine split support
- frontend preview flow
- template metadata redesign

---

## Verification

This work must be verified in two dimensions:

1. **Correctness**
2. **Performance**

### Correctness checks

- existing LaTeX renderer and preview API regression tests still pass
- Korean/Hangul content still renders in preview/export paths
- contact links, section titles, and optional personal field visibility still behave as before
- the three targeted templates still preserve their defining visual structure

### Performance checks

Run before/after measurements for at least:

- `classic`
- `chancellor`
- `slate-rail`
- `trackline`

`classic` acts as a control. The other three measure whether the targeted work actually reduces compile time.

### Success criteria

- no regressions in existing automated preview/render tests
- measurable preview improvement for at least one of the targeted slow templates
- no targeted template becomes slower
- contributor documentation no longer claims a pdflatex-only pipeline when the app actually renders via XeLaTeX

---

## Risks

- some templates may rely on legacy package declarations more than expected
- small package changes can cause non-obvious typography or line-break regressions
- compile-time improvement may be modest for templates whose main cost comes from inherently expensive layout constructs
- documentation cleanup may expose deeper engine-strategy inconsistencies that are intentionally deferred for now

---

## Follow-Up Criteria

After this iteration lands, re-measure template preview timings.

If the slowest templates are still materially too slow, the next decision point should be between:

1. deeper per-template structural simplification
2. engine-aware rendering strategy
3. preview/export path separation

That follow-up should only happen after this low-risk cleanup pass has produced real numbers.
