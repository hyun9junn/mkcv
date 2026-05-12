# ── Stage 1: Frontend build ───────────────────────────────────────────────────
FROM node:20-slim AS frontend-builder
WORKDIR /build

# Install Node deps first (cache layer — only re-runs if package files change)
COPY package*.json ./
RUN npm ci

# Copy only the files Vite needs, then build
COPY vite.config.js ./
COPY frontend/ frontend/
RUN npm run build
# Output: /build/frontend/dist/

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-latex-recommended \
    texlive-fonts-recommended \
    texlive-latex-extra \
    texlive-fonts-extra \
    texlive-lang-korean \
    texlive-xetex \
    texlive-pictures \
    fonts-nanum \
    fonts-noto-cjk \
    fonts-linuxlibertine \
    fonts-ebgaramond \
    lmodern \
    tex-gyre \
    fontconfig \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /usr/local/share/fonts/opentype \
    && find /usr/share/texmf /usr/share/texlive -name "*.otf" -exec cp {} /usr/local/share/fonts/opentype/ \; 2>/dev/null || true \
    && fc-cache -fv

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source (frontend/dist is excluded by .dockerignore — comes from builder below)
COPY . .

# Overlay the production-built frontend from Stage 1
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

RUN useradd --no-create-home --shell /bin/false appuser
USER appuser

EXPOSE 8000

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-1}"]
