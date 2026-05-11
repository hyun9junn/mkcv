# mkcv

한국어 가이드입니다. 자세한 개발 문서는 [README.md](./README.md)를 참고하세요.

---

## mkcv 소개

`mkcv`는 YAML 하나를 기준으로 이력서를 작성하고, 실시간 PDF 미리보기와 함께 Markdown, LaTeX, PDF로 내보낼 수 있는 웹 앱입니다.

- 브라우저에서 바로 편집
- 템플릿 15종 지원
- 영어/한국어 혼합 이력서 PDF 지원
- 템플릿별 한글 폰트 스택 지원
- 데이터는 브라우저에 로컬 저장

---

## 빠른 시작

### 1. 바로 써보기

Hugging Face Space:

<https://huggingface.co/spaces/Hyun9junn/mkcv>

### 2. Docker로 로컬 실행

```bash
docker pull ghcr.io/hyun9junn/mkcv:latest
docker run --rm -p 8000:8000 ghcr.io/hyun9junn/mkcv:latest
```

브라우저에서 `http://localhost:8000`을 열면 됩니다.

---

## 기본 사용 흐름

1. 왼쪽 YAML 에디터에 이력서 내용을 작성합니다.
2. 오른쪽에서 PDF 미리보기를 확인합니다.
3. 템플릿, density, font scale을 조절합니다.
4. 필요하면 섹션 순서를 바꾸거나 숨깁니다.
5. PDF, Markdown, LaTeX로 export합니다.

---

## 로컬 개발

로컬 개발에는 Python 3.11+와 `xelatex`가 필요합니다.

```bash
git clone https://github.com/hyun9junn/mkcv.git
cd mkcv
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

브라우저에서 `http://localhost:8000`을 열면 됩니다.

---

## LaTeX / 한글 폰트

`mkcv`는 PDF 생성에 `xelatex`를 사용합니다. Docker와 같은 템플릿 범위를 로컬에서도 안정적으로 렌더링하려면 XeLaTeX, Nanum/Noto CJK 같은 한글 폰트, 그리고 일부 템플릿이 쓰는 `EB Garamond`, `Linux Libertine`, `TeX Gyre` 계열 폰트가 함께 필요합니다.

### macOS

가장 쉬운 방법은 MacTeX 설치입니다.

```bash
brew install --cask mactex
```

BasicTeX를 쓴다면 필요한 패키지를 추가로 설치하세요.

```bash
brew install --cask basictex
sudo tlmgr update --self
sudo tlmgr install xetex collection-langkorean collection-fontsrecommended \
     collection-fontsextra collection-pictures enumitem geometry hyperref \
     xcolor fontawesome5
```

`foundry`, `masthead`, `scholar-index`, `boardroom`, `letterpress`, `signature-split` 템플릿이 로컬에서만 실패한다면 `EB Garamond`, `Linux Libertine` 폰트도 함께 설치하고 폰트 캐시를 갱신하세요.

### Linux

Debian / Ubuntu 기준:

```bash
sudo apt-get install texlive-latex-recommended texlive-fonts-recommended \
     texlive-latex-extra texlive-fonts-extra texlive-lang-korean \
     texlive-xetex texlive-pictures tex-gyre fontconfig \
     fonts-nanum fonts-noto-cjk fonts-linuxlibertine fonts-ebgaramond

sudo fc-cache -fv
```

배포판에 따라 템플릿용 폰트가 별도 패키지로 분리되어 있으면 `EB Garamond`, `Linux Libertine` 계열도 추가 설치한 뒤 `fontconfig`를 새로 고쳐 주세요.

### Windows

MiKTeX 또는 TeX Live를 설치하고, `xelatex`가 동작하는지 확인하세요. 한국어 폰트 인식 문제가 있으면 Nanum 또는 Noto CJK 폰트를 운영체제에 설치하는 것이 좋습니다. 일부 serif/editorial 템플릿이 계속 실패하면 `EB Garamond`, `Linux Libertine`도 운영체제에 설치해 주세요.

### 확인

```bash
xelatex --version
```

---

## 데이터 저장

작성한 이력서와 설정은 브라우저 `localStorage`에 저장됩니다.

- 계정이 필요 없습니다
- 서버는 상태를 저장하지 않습니다
- 브라우저 데이터를 지우면 이력서도 함께 사라질 수 있습니다

중요한 내용은 export나 backup으로 따로 보관하는 것을 권장합니다.

---

## 참고

- 전체 기능 설명: [README.md](./README.md)
- 커스텀 템플릿 작성법: [backend/templates/README.md](./backend/templates/README.md)

---

## 라이선스

Copyright (c) 2026 Hyun9junn. All rights reserved.

이 프로젝트는 독점 소프트웨어이며, 공개 재사용 권한을 부여하지 않습니다. 자세한 내용은 [LICENSE](./LICENSE)를 참고하세요.
