# scripts

Helper scripts for development and documentation. None of these affect the app runtime. Run all commands from the project root.

---

## generate-readme-preview-gif.mjs

Generates the animated demo GIF (`preview.gif`) used in the README.
Launches a real browser via Playwright, simulates typing, template switching, and opening the Export menu, then encodes the captured frames into a GIF.

**One-time setup**

```bash
npm install playwright pngjs gifenc
npx playwright install chromium
```

**Run**

```bash
# Start the app server at http://localhost:8000 first
node scripts/generate-readme-preview-gif.mjs
```

To use a different server address:

```bash
MKCV_CAPTURE_BASE_URL=http://localhost:3000 node scripts/generate-readme-preview-gif.mjs
```

**Output:** `preview.gif` in the project root

---

## generate-onboarding-gifs.mjs

Generates animated GIFs used in the onboarding modal.
Launches a real browser via Playwright, demonstrates each feature in action (typing, section management, template switching, etc.), then encodes each sequence of frames as a GIF.

Steps that trigger a PDF preview re-render use a zoom-in/zoom-out technique: a tight crop of the relevant UI element is digitally scaled up to show the interaction clearly, then a full-viewport frame reveals the updated preview.

**One-time setup**

```bash
npm install playwright pngjs gifenc
npx playwright install chromium
```

**Run**

```bash
# Start the app server at http://localhost:8000 first
node scripts/generate-onboarding-gifs.mjs
```

To use a different server address:

```bash
MKCV_CAPTURE_BASE_URL=http://localhost:3000 node scripts/generate-onboarding-gifs.mjs
```

**Output:** GIF files under `frontend/assets/onboarding/`

| File | Content |
|------|---------|
| `01-welcome.gif` | Type a name edit → preview updates |
| `02-editor.gif` | YAML editing + autocomplete popup |
| `03-preview.gif` | Zoom in / zoom out on the PDF preview |
| `04-sections-only.gif` | Hide a section chip + rename via double-click → preview updates |
| `05-contact.gif` | Contact dropdown: toggle a field |
| `06-layout.gif` | Density: Comfortable → Balanced → Compact → preview updates |
| `07a-template-picker.gif` | Switch between two templates → preview updates |
| `07b-settings-yaml.gif` | Switch to settings.yaml tab |
| `08-export.gif` | Open export menu → PDF → filename modal |

---

## take-onboarding-screenshots.mjs

Captures static PNG screenshots used in onboarding UI documentation.
Opens each panel, dropdown, and tab in sequence and crops the specified region.

**One-time setup**

```bash
npm install playwright
npx playwright install chromium
```

**Run**

```bash
# Start the app server at http://localhost:8000 first
node scripts/take-onboarding-screenshots.mjs
```

**Output:** PNG files under `frontend/assets/onboarding/`

| File | Content |
|------|---------|
| `01-welcome.png` | Full app overview |
| `02-editor.png` | Editor panel |
| `03-preview.png` | Preview panel |
| `04-sections-only.png` | Section chips |
| `05-contact.png` | Contact dropdown |
| `06-layout.png` | Layout toolbar |
| `07a-template-picker.png` | Template picker |
| `07b-settings-yaml.png` | settings.yaml tab |
| `08-export.png` | Export dropdown |

---

## Template preview thumbnails

Template card thumbnails are PNG images stored at `frontend/assets/template-previews/<slug>.png`. There are two ways to generate them.

### Option A — CLI tool (recommended)

The backend ships a built-in thumbnail generator that renders each template through the same Jinja2 + xelatex pipeline the app uses:

```bash
# Requires pdf2image and poppler
pip install pdf2image
brew install poppler          # macOS
# apt-get install poppler-utils  (Debian/Ubuntu)

# Generate thumbnail for one template
python -m backend thumbnails classic

# Generate thumbnails for all templates
python -m backend thumbnails
```

The server does **not** need to be running. Thumbnails are written directly to `frontend/assets/template-previews/`.

### Option B — generate-template-previews.sh (legacy)

Fetches each template as a PDF via the live server API, then converts with `pdftoppm` or ImageMagick.

**Prerequisites**

```bash
# macOS
brew install poppler        # provides pdftoppm (recommended)
# or
brew install imagemagick

# Debian/Ubuntu
apt-get install poppler-utils
```

**Run**

```bash
# Start the app server first
scripts/generate-template-previews.sh

# Custom server address
scripts/generate-template-previews.sh http://localhost:3000
# or
MKCV_SERVER=http://localhost:3000 scripts/generate-template-previews.sh
```

**Output:** `frontend/assets/template-previews/<template-name>.png`

---

## sample-cv.yaml

Shared sample resume data used by all scripts above.
Not meant to be run directly — editing this file changes the content of any generated screenshots, GIFs, and thumbnails.
