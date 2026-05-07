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
    lmodern \
    tex-gyre \
    && rm -rf /var/lib/apt/lists/* \
    && printf '<fontconfig>\n  <dir>/usr/share/texmf/fonts/opentype</dir>\n  <dir>/usr/share/texlive/texmf-dist/fonts/opentype</dir>\n</fontconfig>\n' \
       > /etc/fonts/conf.d/09-texlive.conf \
    && fc-cache -fv

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --no-create-home --shell /bin/false appuser
USER appuser

EXPOSE 8000

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-1}"]
