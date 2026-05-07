# Template Picker Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the text-only template dropdown with a 3-column portrait thumbnail grid using pre-committed PNGs, with a delayed hover popover showing description text.

**Architecture:** The dropdown DOM construction in `templates.js` is replaced to create `.tpl-card` elements with `<img>` thumbnails instead of `.tpl-option` text rows. A shell script generates PNG thumbnails from a fixed sample CV YAML by posting to the local dev API, converting each resulting PDF via `pdftoppm` or ImageMagick. All other logic (settings sync, preview refresh, template registry) is untouched.

**Tech Stack:** Vanilla JS, HTML/CSS, Bash, `pdftoppm` (poppler-utils) or ImageMagick `convert`, node:test for unit tests.

---

### Task 1: Create sample CV YAML

**Files:**
- Create: `scripts/sample-cv.yaml`

- [ ] **Step 1: Create the sample CV data file**

```yaml
personal:
  name: Jane Smith
  email: jane.smith@example.com
  phone: "+1 (415) 555-0192"
  location: San Francisco, CA
  linkedin: linkedin.com/in/janesmith
  github: github.com/janesmith
  website: janesmith.dev

summary: >
  Senior software engineer with 7 years building scalable web services and
  data pipelines. Strong background in Python, TypeScript, and cloud
  infrastructure. Passionate about developer experience and clean architecture.

experience:
  - title: Senior Software Engineer
    company: Acme Technologies
    start_date: Jan 2021
    end_date: Present
    location: San Francisco, CA
    highlights:
      - Led migration of monolithic backend to microservices, cutting deploy time by 60%
      - Designed real-time data pipeline processing 2M events per day
      - Mentored three junior engineers and established team code-review standards
    tech_stack: [Python, Kubernetes, PostgreSQL]

  - title: Software Engineer
    company: Bright Solutions
    start_date: Jun 2018
    end_date: Dec 2020
    location: Austin, TX
    highlights:
      - Built customer-facing REST API serving 50k daily active users
      - Reduced page load time by 40% through frontend performance work
      - Contributed to open-source CLI tool with 1,000+ GitHub stars
    tech_stack: [TypeScript, React, Redis]

education:
  - degree: B.S. Computer Science
    institution: University of California, Berkeley
    start_date: "2014"
    end_date: "2018"
    gpa: "3.8"

skills:
  - category: Languages
    items: [Python, TypeScript, Go, SQL]
  - category: Frameworks
    items: [FastAPI, React, PostgreSQL, Redis]
  - category: Infrastructure
    items: [Docker, Kubernetes, GitHub Actions, AWS]

projects:
  - name: OpenMetrics
    description: Open-source metrics aggregation library for Python microservices
    url: github.com/janesmith/openmetrics
    highlights:
      - "2,400+ GitHub stars, used in production at 12 companies"
      - Supports Prometheus, Datadog, and OpenTelemetry exporters

certifications:
  - name: AWS Solutions Architect Professional
    issuer: Amazon Web Services
    date: "2022"

languages:
  - language: English
    proficiency: Native
  - language: Korean
    proficiency: Conversational
```

- [ ] **Step 2: Verify the YAML parses correctly against the backend models**

```bash
cd /Users/khjmove/mkcv
python3 -c "
from backend.parsers.yaml_parser import parse_yaml
data = open('scripts/sample-cv.yaml').read()
result = parse_yaml(data)
print('OK —', result.personal.name)
"
```
Expected output: `OK — Jane Smith`

- [ ] **Step 3: Commit**

```bash
git add scripts/sample-cv.yaml
git commit -m "chore: add sample CV YAML for template thumbnail generation"
```

---

### Task 2: Write failing tests for new card structure

**Files:**
- Modify: `tests/test_templates_ui_sync.js`

- [ ] **Step 1: Update the mock `querySelectorAll` to handle `.tpl-card`**

In `tests/test_templates_ui_sync.js`, locate the `querySelectorAll` method inside `createElement` (currently at the block that checks `selector === '.tpl-option'`) and replace it:

```js
querySelectorAll(selector) {
  if (selector === '.tpl-option') {
    return this.children.filter((child) => child.classList?.contains('tpl-option'));
  }
  if (selector === '.tpl-card') {
    return this.children.filter((child) => child.classList?.contains('tpl-card'));
  }
  return [];
},
```

- [ ] **Step 2: Update the existing badge test to use `tpl-card`-aware variable names**

Replace the existing `'template picker shows badge from template metadata'` test with:

```js
test('template picker shows badge from template metadata', async () => {
  const { context, domReadyCallbacks, elements } = createContext();

  await bootTemplates(context, domReadyCallbacks);

  const cards = elements.get('template-dropdown').children;
  const signatureCard = cards.find((child) => child.dataset.name === 'signature-split');

  assert.match(signatureCard.innerHTML, /Popular/);
});
```

- [ ] **Step 3: Add three new failing tests at the end of the file**

```js
test('template picker renders tpl-card elements with thumbnail img src', async () => {
  const { context, domReadyCallbacks, elements } = createContext();

  await bootTemplates(context, domReadyCallbacks);

  const cards = elements.get('template-dropdown').children;
  assert.equal(cards.length, 2, 'one card per template');

  const classicCard = cards.find((c) => c.dataset.name === 'classic');
  assert.ok(classicCard, 'classic card exists');
  assert.ok(classicCard.classList.contains('tpl-card'), 'card has tpl-card class');
  assert.ok(classicCard.classList.contains('col-1'), 'first card is col-1');
  assert.match(classicCard.innerHTML, /\/assets\/template-previews\/classic\.png/);
});

test('template picker popover contains description text', async () => {
  const { context, domReadyCallbacks, elements } = createContext();

  await bootTemplates(context, domReadyCallbacks);

  const cards = elements.get('template-dropdown').children;
  const sigCard = cards.find((c) => c.dataset.name === 'signature-split');
  assert.ok(sigCard, 'signature-split card exists');
  assert.ok(sigCard.classList.contains('col-2'), 'second card is col-2');
  assert.match(sigCard.innerHTML, /Creative direction/);
  assert.match(sigCard.innerHTML, /Popular/);
});

test('syncSelectedOption updates tpl-card selected class', async () => {
  const { context, domReadyCallbacks, elements } = createContext();

  await bootTemplates(context, domReadyCallbacks);

  context.window.templateUI.selectTemplate('signature-split');

  const cards = elements.get('template-dropdown').children;
  const classicCard = cards.find((c) => c.dataset.name === 'classic');
  const sigCard = cards.find((c) => c.dataset.name === 'signature-split');

  assert.ok(!classicCard.classList.contains('selected'), 'classic no longer selected');
  assert.ok(sigCard.classList.contains('selected'), 'signature-split now selected');
});
```

- [ ] **Step 4: Run the tests and confirm the three new tests fail**

```bash
node --test tests/test_templates_ui_sync.js 2>&1
```

Expected: 2 existing tests pass, 3 new tests fail with errors like `classicCard.classList.contains('tpl-card') == false` (cards still have `tpl-option` class).

- [ ] **Step 5: Commit the failing tests**

```bash
git add tests/test_templates_ui_sync.js
git commit -m "test: add failing tests for tpl-card structure and thumbnail img"
```

---

### Task 3: Update CSS in `index.html`

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Replace the template picker CSS block**

In `frontend/index.html`, locate the comment `/* Template picker pill */` (around line 127) and replace the entire block from that comment through `/* Hide old tooltip ... */` (around line 210) with the following. Keep the `/* Export button */` block that follows untouched.

```css
    /* Template picker pill */
    #template-select-wrapper { position: relative; }
    .tpl-picker {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 6px 14px;
      border: 1px solid var(--rule);
      border-radius: 999px;
      background: var(--paper-2);
      font-size: 12px;
      color: var(--ink-2);
      cursor: pointer;
      transition: border-color .15s, background .15s;
    }
    .tpl-picker:hover { border-color: var(--rule-2); }
    .tpl-picker-label {
      font-family: var(--font-serif);
      font-size: 10.5px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--ink-4);
    }
    #tpl-name-display {
      font-family: var(--font-serif);
      font-weight: 500;
      font-size: 14px;
      color: var(--ink);
      letter-spacing: -0.005em;
    }
    .tpl-caret { color: var(--ink-3); font-size: 10px; }

    #template-dropdown {
      position: absolute;
      top: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 10px;
      box-shadow: var(--shadow-md);
      width: 480px;
      max-height: 60vh;
      overflow-y: auto;
      padding: 10px;
      z-index: 50;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    #template-dropdown[hidden] { display: none; }

    /* Template card */
    .tpl-card {
      border: 1.5px solid var(--rule);
      border-radius: 8px;
      overflow: visible;
      cursor: pointer;
      position: relative;
      transition: border-color .12s;
    }
    .tpl-card:hover { border-color: var(--rule-2); }
    .tpl-card.selected { border-color: var(--accent); border-width: 2px; }

    .tpl-thumb {
      width: 100%;
      aspect-ratio: 1 / 1.414;
      display: block;
      border-radius: 6px 6px 0 0;
      object-fit: cover;
      object-position: top;
    }
    .tpl-label {
      padding: 4px 7px 6px;
      font-family: var(--font-serif);
      font-size: 11px;
      color: var(--ink-2);
      font-weight: 500;
    }
    .tpl-card.selected .tpl-label { color: var(--accent); }

    /* Hover popover */
    .tpl-popover {
      display: none;
      position: absolute;
      top: 0;
      left: calc(100% + 10px);
      width: 164px;
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 10px;
      padding: 12px;
      box-shadow: var(--shadow-md);
      z-index: 60;
      pointer-events: none;
    }
    .col-3 .tpl-popover {
      left: auto;
      right: calc(100% + 10px);
    }
    .tpl-card.popover-visible .tpl-popover { display: block; }

    .popover-name {
      font-family: var(--font-serif);
      font-size: 12px;
      font-weight: 600;
      color: var(--ink);
      margin-bottom: 5px;
    }
    .popover-audience {
      display: inline-block;
      font-family: var(--font-mono);
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--ink-4);
      border: 1px solid var(--rule);
      border-radius: 3px;
      padding: 1px 5px;
      margin-bottom: 6px;
    }
    .popover-badge {
      display: inline-block;
      font-family: var(--font-mono);
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--accent);
      border: 1px solid var(--accent);
      border-radius: 3px;
      padding: 1px 5px;
      margin-bottom: 6px;
      margin-left: 4px;
    }
    .popover-desc {
      font-size: 11px;
      color: var(--ink-3);
      line-height: 1.5;
      font-family: var(--font-sans);
    }

    /* Per-template fallback gradients (shown when PNG fails to load) */
    .tpl-thumb-classic       { background: linear-gradient(160deg,#f5f2ec,#e8e0d4); }
    .tpl-thumb-boardroom     { background: linear-gradient(160deg,#1a1230,#3b1f5e); }
    .tpl-thumb-trackline     { background: linear-gradient(160deg,#eaf6f2,#c5e8dc); }
    .tpl-thumb-foundry       { background: linear-gradient(160deg,#fff8f0,#fcdcb4); }
    .tpl-thumb-chancellor    { background: linear-gradient(160deg,#f4ede4,#e0ccb8); }
    .tpl-thumb-dealbook      { background: linear-gradient(160deg,#eef2ff,#c8d4f8); }
    .tpl-thumb-mono-forge    { background: linear-gradient(160deg,#f0f0f0,#d8d8d8); }
    .tpl-thumb-studio-pop    { background: linear-gradient(160deg,#fff0f5,#fcc8d8); }
    .tpl-thumb-slate-rail    { background: linear-gradient(160deg,#1c2128,#364050); }
    .tpl-thumb-scholar-index { background: linear-gradient(160deg,#f0f4f8,#d4e4f4); }
    .tpl-thumb-ats-signal    { background: linear-gradient(160deg,#f8f8f8,#e4e4e4); }
    .tpl-thumb-signature-split { background: linear-gradient(160deg,#faf4e8,#eddcb4); }
    .tpl-thumb-skillboard    { background: linear-gradient(160deg,#f0faf4,#c4e8d0); }
    .tpl-thumb-masthead      { background: linear-gradient(160deg,#fff8f0,#f4d8a0); }
    .tpl-thumb-letterpress   { background: linear-gradient(160deg,#1e1e1e,#383838); }

    /* Hide legacy tooltip element */
    #template-tooltip { display: none !important; }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/index.html
git commit -m "style: replace tpl-option CSS with tpl-card thumbnail grid styles"
```

---

### Task 4: Update DOM construction in `templates.js`

**Files:**
- Modify: `frontend/templates.js:87-213`

- [ ] **Step 1: Replace `syncSelectedOption` to target `.tpl-card`**

In `frontend/templates.js`, replace the `syncSelectedOption` function:

```js
    function syncSelectedOption(name) {
        controls.dropdown?.querySelectorAll(".tpl-card").forEach(el => {
            el.classList.toggle("selected", el.dataset.name === name);
        });
    }
```

- [ ] **Step 2: Replace the `data.templates.forEach` block in `DOMContentLoaded`**

In the `DOMContentLoaded` listener, locate the `data.templates.forEach((name) => {` block (currently creates `.tpl-option` divs) and replace the entire forEach call with:

```js
        let cardIndex = 0;
        data.templates.forEach((name) => {
            const meta        = window.templateRegistry.getMeta(name);
            const isValid     = validationMap[name] ? validationMap[name].valid : null;
            const displayName = meta.display_name || name
                .split("-")
                .map(part => part.charAt(0).toUpperCase() + part.slice(1))
                .join(" ");
            const description = meta.description  || "";
            const audience    = meta.audience     || "";
            const badge       = isValid === false ? "⚠ Error" : (meta.ui?.badge || "");
            const isFirst     = name === app.state.template;
            const col         = (cardIndex % 3) + 1;

            const card = document.createElement("div");
            card.className = `tpl-card${isFirst ? " selected" : ""} col-${col}`;
            card.dataset.name = name;

            card.innerHTML = `
              <img class="tpl-thumb"
                   src="/assets/template-previews/${name}.png"
                   alt="${displayName}"
                   onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
              <div class="tpl-thumb tpl-thumb-${name}" style="display:none"></div>
              <div class="tpl-label">${displayName}</div>
              <div class="tpl-popover">
                <div class="popover-name">${displayName}</div>
                ${audience ? `<span class="popover-audience">${audience}</span>` : ""}
                ${badge    ? `<span class="popover-badge">${badge}</span>`       : ""}
                ${description ? `<div class="popover-desc">${description}</div>` : ""}
              </div>
            `;

            if (isFirst && nameDisplay) nameDisplay.textContent = displayName;

            card.addEventListener("click", (e) => {
                e.stopPropagation();
                window.templateUI.selectTemplate(name);
            });

            let hoverTimer = null;
            card.addEventListener("mouseenter", () => {
                hoverTimer = setTimeout(() => {
                    card.classList.add("popover-visible");
                }, 400);
            });
            card.addEventListener("mouseleave", () => {
                clearTimeout(hoverTimer);
                card.classList.remove("popover-visible");
            });

            dropdown.appendChild(card);
            cardIndex++;
        });
```

- [ ] **Step 3: Replace the fallback `catch` block's `.tpl-option` construction**

In the same `DOMContentLoaded` listener, the `catch` block also creates a `.tpl-option` element. Replace it with a `.tpl-card`:

```js
    } catch {
        window.templateRegistry.setAllMeta({});
        window.templateUI.setAvailableTemplates(["classic"]);
        const card = document.createElement("div");
        card.className = "tpl-card selected col-1";
        card.dataset.name = "classic";
        card.innerHTML = `
          <div class="tpl-thumb tpl-thumb-classic"></div>
          <div class="tpl-label">Classic</div>
          <div class="tpl-popover">
            <div class="popover-name">Classic</div>
          </div>
        `;
        card.addEventListener("click", () => window.templateUI.selectTemplate("classic"));
        dropdown.appendChild(card);
        if (nameDisplay) nameDisplay.textContent = "Classic";
    }
```

- [ ] **Step 4: Run all tests and confirm all 5 pass**

```bash
node --test tests/test_templates_ui_sync.js 2>&1
```

Expected output:
```
✔ template selection syncs settings.yaml and applies template defaults
✔ template picker shows badge from template metadata
✔ template picker renders tpl-card elements with thumbnail img src
✔ template picker popover contains description text
✔ syncSelectedOption updates tpl-card selected class
ℹ pass 5
ℹ fail 0
```

- [ ] **Step 5: Commit**

```bash
git add frontend/templates.js
git commit -m "feat: replace tpl-option dropdown with tpl-card thumbnail grid"
```

---

### Task 5: Create thumbnail generation script

**Files:**
- Create: `scripts/generate-template-previews.sh`

- [ ] **Step 1: Create the script**

```bash
#!/usr/bin/env bash
# Generates PNG thumbnails for all templates using the local dev server.
# Requires: curl, python3, and either pdftoppm (poppler-utils) or ImageMagick convert.
# Usage: scripts/generate-template-previews.sh [server_url]
#   server_url defaults to http://localhost:8000

set -euo pipefail

SERVER="${1:-${MKCV_SERVER:-http://localhost:8000}}"
OUTPUT_DIR="frontend/assets/template-previews"
SAMPLE_YAML="scripts/sample-cv.yaml"
TARGET_W=300
TARGET_H=424

if [ ! -f "$SAMPLE_YAML" ]; then
  echo "ERROR: $SAMPLE_YAML not found. Run from the project root." >&2
  exit 1
fi

if command -v pdftoppm &>/dev/null; then
  CONVERTER=pdftoppm
elif command -v convert &>/dev/null; then
  CONVERTER=imagemagick
else
  echo "ERROR: Neither pdftoppm (poppler-utils) nor ImageMagick 'convert' found." >&2
  echo "  macOS:  brew install poppler" >&2
  echo "  Debian: apt-get install poppler-utils" >&2
  exit 1
fi

echo "Converter: $CONVERTER"
echo "Server:    $SERVER"
mkdir -p "$OUTPUT_DIR"

templates=$(curl -sf "$SERVER/api/templates" | python3 -c "
import sys, json
print(' '.join(json.load(sys.stdin)['templates']))
")

if [ -z "$templates" ]; then
  echo "ERROR: No templates returned from $SERVER/api/templates" >&2
  exit 1
fi

count=0
for name in $templates; do
  echo -n "  $name ... "

  payload=$(python3 -c "
import json, sys
yaml = open('$SAMPLE_YAML').read()
print(json.dumps({'yaml': yaml, 'template': sys.argv[1]}))" "$name")

  tmpdir=$(mktemp -d)

  http_code=$(curl -sf -o "$tmpdir/cv.pdf" -w "%{http_code}" \
    -X POST "$SERVER/api/preview/pdf" \
    -H "Content-Type: application/json" \
    -d "$payload") || http_code="000"

  if [ "$http_code" != "200" ] || [ ! -s "$tmpdir/cv.pdf" ]; then
    echo "SKIP (server returned $http_code)"
    rm -rf "$tmpdir"
    continue
  fi

  if [ "$CONVERTER" = "pdftoppm" ]; then
    pdftoppm -r 150 -f 1 -l 1 -png "$tmpdir/cv.pdf" "$tmpdir/page"
    page_file=$(ls "$tmpdir"/page*.png | head -1)
    if command -v convert &>/dev/null; then
      convert "$page_file" -resize "${TARGET_W}x${TARGET_H}!" "$OUTPUT_DIR/$name.png"
    else
      cp "$page_file" "$OUTPUT_DIR/$name.png"
    fi
  else
    convert -density 150 "$tmpdir/cv.pdf[0]" \
      -resize "${TARGET_W}x${TARGET_H}!" \
      "$OUTPUT_DIR/$name.png"
  fi

  rm -rf "$tmpdir"
  echo "done"
  count=$((count + 1))
done

echo ""
echo "Generated $count thumbnail(s) in $OUTPUT_DIR/"
```

- [ ] **Step 2: Make the script executable**

```bash
chmod +x scripts/generate-template-previews.sh
```

- [ ] **Step 3: Commit the script**

```bash
git add scripts/generate-template-previews.sh
git commit -m "chore: add thumbnail generation script for template picker"
```

---

### Task 6: Generate thumbnails and commit

**Files:**
- Create: `frontend/assets/template-previews/*.png` (15 files)

> **Prerequisite:** The dev server must be running. In a separate terminal:
> ```bash
> cd /Users/khjmove/mkcv
> source .venv/bin/activate
> uvicorn backend.main:app --reload
> ```
> Wait for startup to finish before running the script.

- [ ] **Step 1: Create the output directory and run the script**

```bash
mkdir -p frontend/assets/template-previews
scripts/generate-template-previews.sh
```

Expected output (one line per template):
```
Using converter: pdftoppm
Server: http://localhost:8000
  ats-signal ... done
  boardroom ... done
  chancellor ... done
  classic ... done
  ...
Generated 15 thumbnail(s) in frontend/assets/template-previews/
```

If any template prints `SKIP`, check `GET /api/templates` returns it and that `POST /api/preview/pdf` with `{"yaml": "...", "template": "<name>"}` returns 200.

- [ ] **Step 2: Verify PNG dimensions**

```bash
python3 -c "
import os, struct, zlib

def png_size(path):
    with open(path, 'rb') as f:
        sig = f.read(8)
        f.read(4)  # chunk length
        assert f.read(4) == b'IHDR'
        w = struct.unpack('>I', f.read(4))[0]
        h = struct.unpack('>I', f.read(4))[0]
    return w, h

dir = 'frontend/assets/template-previews'
for f in sorted(os.listdir(dir)):
    if f.endswith('.png'):
        w, h = png_size(os.path.join(dir, f))
        print(f'{f}: {w}x{h}')
"
```

Each file should be close to 300×424px (exact dimensions may vary slightly depending on converter).

- [ ] **Step 3: Commit the thumbnails**

```bash
git add frontend/assets/template-previews/
git commit -m "feat: add pre-generated PNG thumbnails for template picker"
```

- [ ] **Step 4: Run all JS tests to confirm nothing regressed**

```bash
node --test tests/test_templates_ui_sync.js 2>&1
```

Expected: 5 tests pass, 0 fail.
