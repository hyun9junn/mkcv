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

## take-onboarding-screenshots.mjs

Captures 8 static PNG screenshots used in onboarding UI documentation.  
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

**Output:** 8 PNG files under `frontend/assets/onboarding/`

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

## generate-template-previews.sh

Generates `300×424px` thumbnail PNGs for every template.  
Fetches each template as a PDF via the server API, then converts it to an image using `pdftoppm` or ImageMagick.

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
