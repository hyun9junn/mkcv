# Onboarding Wizard — Design Spec

**Date:** 2026-05-07  
**Status:** Approved

---

## Overview

앱을 처음 열었을 때 핵심 기능을 9단계로 안내하는 모달 위저드. 대상은 YAML에 익숙한 개발자이므로 YAML 문법 설명 없이 앱 고유 기능 소개에 집중한다. 각 스텝에는 실제 앱 스크린샷이 표시된다.

---

## Architecture

### 새 파일

- `frontend/onboarding.js` — 온보딩 전체를 담당하는 독립 모듈

### index.html 변경 (최소)

- 모달 컨테이너 `<div id="onboarding-overlay">` 추가 (hidden)
- 헤더에 `?` 도움말 버튼 추가

### 의존성

없음. 순수 DOM + `localStorage`.

---

## Data Flow

```
페이지 로드
  → onboarding.init()
  → localStorage.getItem('mkcv_onboarding_seen') 확인
    → null  → show()  (첫 방문)
    → '1'   → 아무것도 안 함

? 버튼 클릭
  → show()  (무조건)

모달 닫기 (× / 건너뛰기 / 완료)
  → localStorage.setItem('mkcv_onboarding_seen', '1')
  → hide()
```

---

## Module Structure

```js
// frontend/onboarding.js

const STEPS = [
  { icon, title, desc, tips: [{label, text}], img, strip }
];

function render(stepIndex) { /* 현재 스텝 DOM 업데이트 */ }
function show()            { /* 오버레이 표시, 스텝 0으로 초기화 */ }
function hide()            { /* 오버레이 숨김, localStorage 기록 */ }
function init()            { /* 진입점: localStorage 확인 후 show() 또는 skip */ }

export { init, show };
```

`init()`은 `app.js` 또는 `index.html` 하단 script에서 호출한다.

---

## UI Structure

```
.onboarding-overlay          ← 전체화면 backdrop (기존 .modal-backdrop CSS 재사용)
  .onboarding-modal          ← 위저드 카드 (width: ~520px)
    .onboarding-top          ← "1 / 8" 레이블 + × 닫기 버튼
    .onboarding-visual       ← 스크린샷 이미지 영역 (height: 160px)
    .onboarding-body         ← 이모지 + 타이틀 + 설명 + 팁 배지
    .onboarding-foot
      .onboarding-dots       ← 점 인디케이터 (현재 스텝 강조)
      .onboarding-buttons    ← [건너뛰기]  [← 이전] [다음 → / 완료 ✓]
```

기존 `.modal-backdrop` / `.modal` CSS를 기반으로 하되, 위저드 전용 클래스명을 별도로 사용해 충돌 방지.

---

## Steps (9단계)

| # | 아이콘 | 제목 | 이미지 파일 | 팁 |
|---|--------|------|-------------|-----|
| 1 | 👋 | Welcome | `01-welcome.png` | — |
| 2 | ✏️ | YAML 에디터 | `02-editor.png` | Ctrl+Space 자동완성 |
| 3 | 👁 | 실시간 미리보기 | `03-preview.png` | 줌 25%~400% |
| 4 | ⊞ | 섹션 관리 | `04-sections-only.png` (strip) | 드래그 순서 변경 / 더블클릭 타이틀 편집 |
| 5 | 👤 | 연락처 & 개인 정보 | `05-contact.png` | 필드별 링크 표시 방식 개별 설정 |
| 6 | 🎨 | 레이아웃 조절 | `06-layout.png` (strip) | 밀도 3단계 / 폰트 크기 3단계 |
| 7 | 🖼 | 템플릿 | `07a-template-picker.png` | 15개 템플릿, 즉시 미리보기 반영 |
| 8 | ⚙️ | settings.yaml | `07b-settings-yaml.png` | 툴바 토글과 양방향 동기화 |
| 9 | 💡 | 파워 팁 | `08-export.png` | PDF·LaTeX·Markdown·백업, ? 버튼 재오픈 |

`strip: true` 스텝(4, 6)은 이미지를 `object-fit: contain`으로 렌더링해 툴바 띠 이미지가 찌그러지지 않도록 한다.

---

## Screenshot Assets

**위치:** `frontend/assets/onboarding/`  
**서빙:** FastAPI가 `/assets/onboarding/*`로 정적 파일 서빙 (기존 static mount 활용)

스크린샷은 Playwright 스크립트(`scripts/take-onboarding-screenshots.mjs`)로 재촬영한다. UI가 크게 변경될 때 수동으로 재실행.

---

## ? 버튼

헤더 우측에 기존 버튼들(Reset, Export) 옆에 추가:

```html
<button id="onboarding-help-btn" class="btn btn-ghost" title="도움말">?</button>
```

클릭 시 `onboarding.show()` 호출.

---

## State

| Key | Value | 의미 |
|-----|-------|------|
| `mkcv_onboarding_seen` | `'1'` | 온보딩을 한 번 이상 완료/건너뛴 상태 |

`?` 버튼은 이 키와 무관하게 항상 `show()`를 호출한다.

---

## Error Handling

- 이미지 로드 실패 시 빈 영역만 표시 (텍스트 설명만으로도 충분히 이해 가능)
- localStorage 접근 실패(private mode 등) 시 항상 온보딩 표시

---

## Screenshot Update Script

```
scripts/take-onboarding-screenshots.mjs
```

앱 서버(`localhost:8000`) 실행 중인 상태에서 Playwright로 각 영역을 자동 촬영해 `frontend/assets/onboarding/`에 저장. UI 변경 시 수동 재실행.
