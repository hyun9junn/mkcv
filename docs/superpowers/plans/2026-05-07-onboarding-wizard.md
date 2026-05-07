# Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 첫 방문 시 9단계 모달 위저드로 핵심 기능을 안내하고, KO/EN 언어 토글을 지원한다.

**Architecture:** `frontend/onboarding.js`에 IIFE 패턴으로 위저드 전체 로직을 구현한다. `app.js`에 `lang` 상태와 `setLang()`을 추가하고, 헤더에 `KO/EN` 버튼과 `?` 버튼을 추가한다. 9개 스텝은 JS 배열로 정의하며 각 스텝에 bilingual 텍스트와 실제 앱 스크린샷을 포함한다.

**Tech Stack:** Vanilla JS (IIFE pattern), DOM, localStorage, Node.js test runner (`node:test`, `node:vm`)

---

## File Map

| 상태 | 파일 | 역할 |
|------|------|------|
| 수정 | `frontend/app.js` | `state.lang` + `setLang()` + `langchange` 이벤트 추가 |
| 신규 | `frontend/onboarding.js` | 위저드 전체: STEPS 데이터, render/show/hide/init |
| 수정 | `frontend/index.html` | CSS 추가, 모달 HTML 추가, KO/EN·? 버튼 추가, script 태그·wire-up 추가 |
| 신규 | `tests/test_onboarding.js` | lang 시스템 + 위저드 동작 단위 테스트 |
| 신규 | `scripts/take-onboarding-screenshots.mjs` | Playwright 스크린샷 자동 촬영 스크립트 |

---

## Task 1: app.js — lang 상태 + setLang()

**Files:**
- Modify: `frontend/app.js`
- Test: `tests/test_onboarding.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_onboarding.js` 신규 생성:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function makeAppCtx(langVal = null) {
  const storage = {};
  if (langVal) storage['mkcv_lang'] = langVal;
  const dispatched = [];
  const ctx = vm.createContext({
    window: {},
    localStorage: {
      getItem: (k) => storage[k] ?? null,
      setItem: (k, v) => { storage[k] = v; },
    },
    document: {
      addEventListener() {},
      documentElement: { lang: 'ko' },
      dispatchEvent: (e) => dispatched.push(e),
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    },
    _storage: storage,
    _dispatched: dispatched,
  });
  return ctx;
}

test('app.state.lang defaults to ko', () => {
  const ctx = makeAppCtx();
  vm.runInContext(fs.readFileSync('frontend/app.js', 'utf8'), ctx);
  assert.equal(ctx.app.state.lang, 'ko');
});

test('app.state.lang reads en from localStorage', () => {
  const ctx = makeAppCtx('en');
  vm.runInContext(fs.readFileSync('frontend/app.js', 'utf8'), ctx);
  assert.equal(ctx.app.state.lang, 'en');
});

test('app.setLang() updates state and localStorage', () => {
  const ctx = makeAppCtx();
  vm.runInContext(fs.readFileSync('frontend/app.js', 'utf8'), ctx);
  ctx.app.setLang('en');
  assert.equal(ctx.app.state.lang, 'en');
  assert.equal(ctx._storage['mkcv_lang'], 'en');
});

test('app.setLang() dispatches langchange event with lang detail', () => {
  const ctx = makeAppCtx();
  vm.runInContext(fs.readFileSync('frontend/app.js', 'utf8'), ctx);
  ctx.app.setLang('en');
  assert.equal(ctx._dispatched.length, 1);
  assert.equal(ctx._dispatched[0].type, 'langchange');
  assert.deepEqual(ctx._dispatched[0].detail, { lang: 'en' });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
node --test tests/test_onboarding.js
```

Expected: 4개 테스트 모두 FAIL (`app.state.lang` 없음, `setLang` 없음)

- [ ] **Step 3: app.js에 lang 상태 + setLang() 구현**

`frontend/app.js` 전체를 다음으로 교체:

```js
const app = {
  state: {
    yaml: "",
    template: "classic",
    density: "balanced",
    font_scale: "normal",
    link_display: "label",
    personal_fields: [],
    lang: localStorage.getItem('mkcv_lang') || 'ko',
  },
  setState(patch) {
    Object.assign(this.state, patch);
  },
  setLang(lang) {
    this.state.lang = lang;
    localStorage.setItem('mkcv_lang', lang);
    document.documentElement.lang = lang === 'ko' ? 'ko' : 'en';
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
  },
};

window.app = app;
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
node --test tests/test_onboarding.js
```

Expected: 4개 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/app.js tests/test_onboarding.js
git commit -m "feat: add lang state and setLang() to app.js"
```

---

## Task 2: onboarding.js — 모듈 뼈대 + show/hide/init 로직

**Files:**
- Create: `frontend/onboarding.js`
- Modify: `tests/test_onboarding.js` (테스트 추가)

- [ ] **Step 1: 테스트 추가** (`tests/test_onboarding.js` 하단에 추가)

```js
// ── onboarding module tests ──────────────────────────────────────────────────

function makeObCtx({ seen = null, lang = 'ko' } = {}) {
  const storage = { 'mkcv_lang': lang };
  if (seen) storage['mkcv_onboarding_seen'] = seen;

  let overlayOpen = false;
  const listeners = {};

  const ctx = vm.createContext({
    window: {},
    localStorage: {
      getItem: (k) => storage[k] ?? null,
      setItem: (k, v) => { storage[k] = v; },
    },
    document: {
      addEventListener: (evt, fn) => { listeners[evt] = fn; },
      getElementById: (id) => {
        if (id === 'onboarding-overlay') return {
          classList: {
            add: (c) => { if (c === 'open') overlayOpen = true; },
            remove: (c) => { if (c === 'open') overlayOpen = false; },
          },
          addEventListener() {},
        };
        // Return stub for all other elements
        return {
          style: {}, classList: { add() {}, remove() {}, toggle() {} },
          innerHTML: '', textContent: '',
          addEventListener() {},
          querySelectorAll: () => [],
        };
      },
      documentElement: { lang },
      dispatchEvent() {},
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    },
    app: { state: { lang } },
    _storage: storage,
    _overlayOpen: () => overlayOpen,
    _listeners: listeners,
  });
  return ctx;
}

function loadOnboarding(ctx) {
  // ctx.app is already set as a stub in makeObCtx — no need to run app.js
  vm.runInContext(fs.readFileSync('frontend/onboarding.js', 'utf8'), ctx);
}

test('onboarding.init() shows overlay on first visit', () => {
  const ctx = makeObCtx({ seen: null });
  loadOnboarding(ctx);
  ctx.window.onboarding.init();
  assert.ok(ctx._overlayOpen(), 'overlay should be open on first visit');
});

test('onboarding.init() does not show overlay if already seen', () => {
  const ctx = makeObCtx({ seen: '1' });
  loadOnboarding(ctx);
  ctx.window.onboarding.init();
  assert.ok(!ctx._overlayOpen(), 'overlay should stay hidden if already seen');
});

test('onboarding.show() opens overlay', () => {
  const ctx = makeObCtx({ seen: '1' });
  loadOnboarding(ctx);
  ctx.window.onboarding.show();
  assert.ok(ctx._overlayOpen(), 'overlay should open after show()');
});

test('onboarding.hide() sets mkcv_onboarding_seen and closes overlay', () => {
  const ctx = makeObCtx({ seen: null });
  loadOnboarding(ctx);
  ctx.window.onboarding.show();
  ctx.window.onboarding.hide();
  assert.equal(ctx._storage['mkcv_onboarding_seen'], '1');
  assert.ok(!ctx._overlayOpen(), 'overlay should be closed after hide()');
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
node --test tests/test_onboarding.js
```

Expected: onboarding 관련 4개 테스트 FAIL (`onboarding.js` 없음)

- [ ] **Step 3: frontend/onboarding.js 구현**

```js
/* global app */
window.onboarding = (() => {
  const ASSET_BASE = '/assets/onboarding';

  const STEPS = [
    {
      icon: '👋',
      title: { ko: 'mkcv에 오신 것을 환영합니다', en: 'Welcome to mkcv' },
      desc: {
        ko: 'YAML로 이력서를 작성하고 아름다운 PDF로 내보내는 도구입니다. 핵심 기능을 빠르게 살펴볼게요.',
        en: "Write your résumé in YAML and export a polished PDF. Let's walk through the key features.",
      },
      tips: [],
      img: `${ASSET_BASE}/01-welcome.png`,
      strip: false,
    },
    {
      icon: '✏️',
      title: { ko: 'YAML 에디터', en: 'YAML Editor' },
      desc: {
        ko: '왼쪽 패널에서 이력서를 YAML로 작성합니다. 오류는 즉시 밑줄로 표시되고 저장은 자동입니다.',
        en: 'Write your résumé on the left panel. Errors are underlined instantly and changes save automatically.',
      },
      tips: [{ label: 'Ctrl+Space', ko: '커서 위치에서 사용 가능한 필드를 자동완성으로 제안', en: 'Autocomplete available fields at the cursor position' }],
      img: `${ASSET_BASE}/02-editor.png`,
      strip: false,
    },
    {
      icon: '👁',
      title: { ko: '실시간 PDF 미리보기', en: 'Live PDF Preview' },
      desc: {
        ko: '오른쪽 패널에서 렌더링된 PDF를 실시간 확인합니다. 내용 변경 후 약 1.5초에 자동 업데이트됩니다.',
        en: 'The right panel shows your rendered PDF, auto-updating ~1.5s after each change.',
      },
      tips: [{ label: 'Tip', ko: '줌 버튼(− / +)으로 25%~400% 배율 조정 가능', en: 'Use − / + buttons to zoom 25%–400%' }],
      img: `${ASSET_BASE}/03-preview.png`,
      strip: false,
    },
    {
      icon: '⊞',
      title: { ko: '섹션 관리', en: 'Section Management' },
      desc: {
        ko: '상단 툴바의 섹션 칩으로 이력서 구성을 제어합니다. 순서 변경, 숨김, 이름 편집이 가능합니다.',
        en: 'Section chips in the toolbar control your résumé layout — reorder, hide, or rename any section.',
      },
      tips: [
        { label: 'Drag', ko: '칩을 드래그해서 PDF 내 섹션 순서 변경', en: 'Drag chips to reorder sections in the PDF' },
        { label: 'Dbl-click', ko: '섹션 이름 더블클릭 → PDF 타이틀 직접 편집', en: 'Double-click a section name to edit its PDF title' },
      ],
      img: `${ASSET_BASE}/04-sections-only.png`,
      strip: true,
    },
    {
      icon: '👤',
      title: { ko: '연락처 & 개인 정보', en: 'Contact & Personal Info' },
      desc: {
        ko: 'Contact 드롭다운에서 PDF에 표시할 필드를 항목별로 개별 켜기/끄기 할 수 있습니다.',
        en: 'Use the Contact dropdown to toggle each personal field on or off in the PDF.',
      },
      tips: [{ label: 'Tip', ko: '필드별 링크 표시 방식(label / url / both)도 개별 설정 가능', en: 'Each field can also have its own link display mode: label / url / both' }],
      img: `${ASSET_BASE}/05-contact.png`,
      strip: false,
    },
    {
      icon: '🎨',
      title: { ko: '레이아웃 조절', en: 'Layout Controls' },
      desc: {
        ko: '상단 툴바에서 밀도와 폰트 크기를 클릭 한 번으로 조정합니다. 변경 즉시 미리보기에 반영됩니다.',
        en: 'Click density or font size in the toolbar for instant layout changes, reflected live in the preview.',
      },
      tips: [
        { label: 'Density', ko: 'Comfortable · Balanced · Compact — 줄 간격·여백 일괄 조정', en: 'Comfortable · Balanced · Compact — adjusts line spacing and margins globally' },
        { label: 'Font', ko: 'Small · Normal · Large — 전체 폰트 크기 일괄 조정', en: 'Small · Normal · Large — scales all font sizes at once' },
      ],
      img: `${ASSET_BASE}/06-layout.png`,
      strip: true,
    },
    {
      icon: '🖼',
      title: { ko: '템플릿', en: 'Templates' },
      desc: {
        ko: '15개 템플릿 중 하나를 선택하면 즉시 미리보기에 반영됩니다. 상단 TEMPLATE 버튼으로 열 수 있어요.',
        en: 'Choose from 15 templates — the preview updates instantly. Open the picker via the TEMPLATE button.',
      },
      tips: [{ label: 'Tip', ko: '템플릿마다 최적 레이아웃이 다르니 몇 가지 바꿔보며 비교해 보세요', en: "Each template has its own optimal layout — try a few and compare" }],
      img: `${ASSET_BASE}/07a-template-picker.png`,
      strip: false,
    },
    {
      icon: '⚙️',
      title: { ko: 'settings.yaml', en: 'settings.yaml' },
      desc: {
        ko: 'settings.yaml 탭에서 밀도·폰트·링크·필드 표시 등 모든 설정을 YAML로 직접 편집할 수 있습니다.',
        en: 'The settings.yaml tab lets you edit every setting — density, font, links, visibility — directly in YAML.',
      },
      tips: [{ label: 'Tip', ko: '툴바 토글과 양방향 동기화 — YAML 편집과 버튼 클릭 중 편한 방법 사용', en: 'Two-way sync with toolbar controls — use whichever you prefer' }],
      img: `${ASSET_BASE}/07b-settings-yaml.png`,
      strip: false,
    },
    {
      icon: '💡',
      title: { ko: '파워 팁 — 내보내기 & 백업', en: 'Power Tips — Export & Backup' },
      desc: {
        ko: 'Export 메뉴에서 PDF · LaTeX · Markdown 내보내기와 YAML 백업/복원을 모두 처리합니다.',
        en: 'The Export menu handles PDF, LaTeX, and Markdown export plus full YAML backup and restore.',
      },
      tips: [{ label: 'Tip', ko: '이 가이드는 헤더의 ? 도움말 버튼으로 언제든 다시 볼 수 있어요', en: 'Reopen this guide anytime via the ? Help button in the header' }],
      img: `${ASSET_BASE}/08-export.png`,
      strip: false,
    },
  ];

  const UI = {
    ko: { skip: '건너뛰기', prev: '← 이전', next: '다음 →', done: '완료 ✓' },
    en: { skip: 'Skip',     prev: '← Back',  next: 'Next →', done: 'Done ✓' },
  };

  let _step = 0;

  function t(obj) { return obj[app.state.lang] ?? obj.ko; }

  function _el(id) { return document.getElementById(id); }

  function render() {
    const s = STEPS[_step];
    const ui = UI[app.state.lang] ?? UI.ko;
    const isFirst = _step === 0;
    const isLast  = _step === STEPS.length - 1;

    _el('ob-step-label').textContent = isFirst ? '' : `${_step} / ${STEPS.length - 1}`;

    const vis = _el('ob-visual');
    vis.className = `ob-visual${s.strip ? ' ob-visual--strip' : ''}`;
    vis.innerHTML = `<img src="${s.img}" alt="">`;

    _el('ob-body').innerHTML = `
      <div class="ob-step-header">
        <span class="ob-icon">${s.icon}</span>
        <span class="ob-title">${t(s.title)}</span>
      </div>
      <p class="ob-desc">${t(s.desc)}</p>
      ${s.tips.length ? `<div class="ob-tips">${s.tips.map(tip =>
        `<div class="ob-tip"><span class="ob-tip-label">${tip.label}</span>${t(tip)}</div>`
      ).join('')}</div>` : ''}
    `;

    _el('ob-dots').innerHTML = STEPS.map((_, i) =>
      `<button class="ob-dot${i === _step ? ' ob-dot--active' : ''}" data-step="${i}" aria-label="Step ${i + 1}"></button>`
    ).join('');
    _el('ob-dots').querySelectorAll('.ob-dot').forEach(btn => {
      btn.addEventListener('click', () => { _step = +btn.dataset.step; render(); });
    });

    _el('ob-btn-prev').style.display = isFirst ? 'none' : '';
    _el('ob-btn-prev').textContent = ui.prev;
    _el('ob-btn-next').textContent = isLast ? ui.done : ui.next;
    _el('ob-btn-skip').textContent = ui.skip;
    _el('ob-btn-skip').style.display = isLast ? 'none' : '';
  }

  function show() {
    _step = 0;
    render();
    _el('onboarding-overlay').classList.add('open');
  }

  function hide() {
    try { localStorage.setItem('mkcv_onboarding_seen', '1'); } catch (_) {}
    _el('onboarding-overlay').classList.remove('open');
  }

  function init() {
    _el('ob-btn-next').addEventListener('click', () => {
      if (_step < STEPS.length - 1) { _step++; render(); } else { hide(); }
    });
    _el('ob-btn-prev').addEventListener('click', () => {
      if (_step > 0) { _step--; render(); }
    });
    _el('ob-btn-skip').addEventListener('click', hide);
    _el('ob-btn-close').addEventListener('click', hide);
    _el('onboarding-overlay').addEventListener('click', (e) => {
      if (e.target === _el('onboarding-overlay')) hide();
    });

    document.addEventListener('langchange', render);

    let seen = false;
    try { seen = localStorage.getItem('mkcv_onboarding_seen') === '1'; } catch (_) {}
    if (!seen) show();
  }

  return { init, show, hide };
})();
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
node --test tests/test_onboarding.js
```

Expected: 8개 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/onboarding.js tests/test_onboarding.js
git commit -m "feat: add onboarding.js wizard module with bilingual STEPS"
```

---

## Task 3: index.html — CSS 추가

**Files:**
- Modify: `frontend/index.html` (CSS `<style>` 블록 내부)

- [ ] **Step 1: 기존 CSS 블록 마지막 `</style>` 바로 앞에 다음 CSS 삽입**

`</style>` 태그를 찾아서 그 바로 앞에 추가 (index.html의 CSS 섹션은 약 line 900 전후에 `</style>`이 있음):

```css
    /* ── Onboarding Wizard ───────────────────────────────────────── */
    .ob-overlay {
      display: none; position: fixed; inset: 0;
      background: oklch(0% 0 0 / 0.55); z-index: 1000;
      align-items: center; justify-content: center;
    }
    .ob-overlay.open { display: flex; }
    .ob-modal {
      background: var(--paper); border: 1px solid var(--rule);
      border-radius: 14px; width: min(520px, calc(100vw - 32px));
      box-shadow: var(--shadow-md); overflow: hidden;
    }
    .ob-top {
      display: flex; justify-content: space-between; align-items: center;
      padding: 14px 18px 0;
    }
    .ob-step-label { font-size: 11px; color: var(--ink-3); letter-spacing: 0.5px; }
    .ob-close {
      background: none; border: none; cursor: pointer;
      color: var(--ink-3); font-size: 20px; line-height: 1; padding: 0;
    }
    .ob-close:hover { color: var(--ink); }
    .ob-visual {
      margin: 10px 16px 0; border-radius: 7px; overflow: hidden;
      border: 1px solid var(--rule); height: 160px; background: var(--paper-2);
    }
    .ob-visual img { width: 100%; height: 100%; object-fit: cover; object-position: top left; display: block; }
    .ob-visual--strip { display: flex; align-items: center; }
    .ob-visual--strip img { object-fit: contain; height: auto; }
    .ob-body { padding: 12px 20px 8px; }
    .ob-step-header { display: flex; align-items: center; gap: 9px; margin-bottom: 6px; }
    .ob-icon { font-size: 20px; line-height: 1; }
    .ob-title { font-size: 14px; font-weight: 700; color: var(--ink); }
    .ob-desc { font-size: 12.5px; color: var(--ink-2); line-height: 1.65; margin-bottom: 9px; }
    .ob-tips { display: flex; flex-direction: column; gap: 5px; }
    .ob-tip {
      background: var(--paper-2); border: 1px solid var(--rule); border-radius: 6px;
      padding: 5px 10px; font-size: 11.5px; color: var(--ink-2);
      display: flex; align-items: flex-start; gap: 7px;
    }
    .ob-tip-label {
      background: var(--accent); color: #fff; border-radius: 3px;
      padding: 1px 5px; font-size: 9.5px; font-weight: 600;
      white-space: nowrap; flex-shrink: 0; margin-top: 1px;
    }
    .ob-foot { padding: 10px 18px 16px; display: flex; flex-direction: column; gap: 10px; align-items: center; }
    .ob-dots { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; justify-content: center; }
    .ob-dot {
      width: 5px; height: 5px; border-radius: 50%; background: var(--rule);
      border: none; cursor: pointer; padding: 0; transition: all 0.2s;
    }
    .ob-dot--active { background: var(--accent); width: 16px; border-radius: 3px; }
    .ob-buttons { display: flex; width: 100%; justify-content: space-between; align-items: center; }
    .ob-btn-skip { background: none; border: none; color: var(--ink-3); font-size: 12px; cursor: pointer; padding: 4px 0; }
    .ob-btn-skip:hover { color: var(--ink-2); }
    .ob-btn-nav { display: flex; gap: 6px; }
    .ob-btn-prev {
      background: var(--paper-2); border: 1px solid var(--rule); color: var(--ink-2);
      border-radius: 7px; padding: 7px 14px; font-size: 12px; cursor: pointer;
    }
    .ob-btn-next {
      background: var(--accent); border: none; color: #fff;
      border-radius: 7px; padding: 7px 18px; font-size: 12px; font-weight: 600; cursor: pointer;
    }
    .ob-btn-next:hover { filter: brightness(0.9); }

    /* ── Lang toggle ─────────────────────────────────────────────── */
    .lang-toggle { display: flex; border: 1px solid var(--rule); border-radius: 5px; overflow: hidden; }
    .lang-btn {
      background: none; border: none; padding: 4px 8px;
      font-size: 11px; font-weight: 600; color: var(--ink-3); cursor: pointer;
    }
    .lang-btn.active { background: var(--accent); color: #fff; }

    /* ── Help button ─────────────────────────────────────────────── */
    .help-btn {
      background: none; border: 1px solid var(--rule); border-radius: 5px;
      padding: 4px 9px; font-size: 12px; color: var(--ink-2); cursor: pointer; font-weight: 600;
    }
    .help-btn:hover { border-color: var(--accent); color: var(--accent); }
```

- [ ] **Step 2: 앱 열어서 CSS 오류 없는지 확인**

브라우저에서 `http://localhost:8000` 열고 콘솔에 CSS 관련 오류 없는지 확인. 기존 UI 깨지지 않아야 함.

- [ ] **Step 3: 커밋**

```bash
git add frontend/index.html
git commit -m "feat: add onboarding wizard + lang toggle CSS to index.html"
```

---

## Task 4: index.html — 모달 HTML + KO/EN·? 버튼 추가

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: 헤더에 KO/EN 토글 + ? 버튼 추가**

`index.html`의 `<div class="masthead-right">` 안, `<button class="icon-btn" id="btn-validate-icon"` 바로 앞에 삽입:

```html
    <div id="lang-toggle" class="lang-toggle">
      <button class="lang-btn active" data-lang="ko">KO</button>
      <button class="lang-btn" data-lang="en">EN</button>
    </div>
    <button class="help-btn" id="onboarding-help-btn" title="Getting started guide">?</button>
```

- [ ] **Step 2: 온보딩 모달 HTML 추가**

기존 `<!-- ═══ RESET ALL MODAL ═══ -->` 주석 바로 위에 삽입:

```html
<!-- ═══ ONBOARDING WIZARD ═══ -->
<div class="ob-overlay" id="onboarding-overlay">
  <div class="ob-modal" role="dialog" aria-modal="true" aria-label="Getting started guide">
    <div class="ob-top">
      <span class="ob-step-label" id="ob-step-label"></span>
      <button class="ob-close" id="ob-btn-close" aria-label="Close">×</button>
    </div>
    <div class="ob-visual" id="ob-visual"></div>
    <div class="ob-body" id="ob-body"></div>
    <div class="ob-foot">
      <div class="ob-dots" id="ob-dots"></div>
      <div class="ob-buttons">
        <button class="ob-btn-skip" id="ob-btn-skip">건너뛰기</button>
        <div class="ob-btn-nav">
          <button class="ob-btn-prev" id="ob-btn-prev" style="display:none">← 이전</button>
          <button class="ob-btn-next" id="ob-btn-next">다음 →</button>
        </div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: `onboarding.js` script 태그 추가**

`index.html` 하단의 기존 `<script src="yaml-backup.js"></script>` 바로 다음에:

```html
<script src="onboarding.js"></script>
```

- [ ] **Step 4: 브라우저에서 헤더 확인**

`http://localhost:8000`을 열고 헤더 우측에 `KO EN` 토글과 `?` 버튼이 보이는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add frontend/index.html
git commit -m "feat: add onboarding modal HTML, KO/EN toggle, and ? button to index.html"
```

---

## Task 5: index.html — 이벤트 핸들러 wire-up

**Files:**
- Modify: `frontend/index.html` (하단 inline `<script>` 블록)

- [ ] **Step 1: 기존 inline `<script>` 블록 맨 끝, `</script>` 직전에 추가**

현재 `index.html`의 inline script는 약 line 1206 `<script>` 에서 시작해서 파일 끝 부근 `</script>`로 끝남. 그 닫는 태그 직전에 삽입:

```js
  // ── Lang toggle ──────────────────────────────────────────────────────────
  const langToggleEl = document.getElementById('lang-toggle');
  langToggleEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.lang-btn');
    if (!btn) return;
    const lang = btn.dataset.lang;
    app.setLang(lang);
    langToggleEl.querySelectorAll('.lang-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.lang === lang)
    );
  });
  // Sync button state to current lang on load
  langToggleEl.querySelectorAll('.lang-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.lang === app.state.lang)
  );

  // ── Onboarding help button ────────────────────────────────────────────────
  document.getElementById('onboarding-help-btn').addEventListener('click', () => {
    onboarding.show();
  });

  // ── Init onboarding ───────────────────────────────────────────────────────
  onboarding.init();
```

- [ ] **Step 2: 앱에서 동작 검증**

1. `http://localhost:8000` 열기
2. 첫 방문 시뮬레이션: 브라우저 콘솔에서 `localStorage.removeItem('mkcv_onboarding_seen')` 실행 후 새로고침 → 위저드 자동 표시 확인
3. 다음/이전/건너뛰기/× 버튼 동작 확인
4. 점 인디케이터 클릭으로 스텝 이동 확인
5. `?` 버튼 클릭 → 위저드 재표시 확인
6. `KO` / `EN` 버튼 클릭 → 위저드 텍스트 언어 전환 확인
7. 위저드 완료 후 새로고침 → 자동 표시 안 됨 확인

- [ ] **Step 3: 커밋**

```bash
git add frontend/index.html
git commit -m "feat: wire up lang toggle and onboarding init in index.html"
```

---

## Task 6: Playwright 스크린샷 갱신 스크립트

**Files:**
- Create: `scripts/take-onboarding-screenshots.mjs`

- [ ] **Step 1: 스크립트 작성**

```js
// scripts/take-onboarding-screenshots.mjs
// Usage: node scripts/take-onboarding-screenshots.mjs
// Requires: app running at http://localhost:8000
//           npx playwright install chromium  (once)

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT  = 'frontend/assets/onboarding';
const BASE = 'http://localhost:8000';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page    = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 860 });

console.log('Loading app...');
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);

// 1. Full app overview
await page.screenshot({ path: `${OUT}/01-welcome.png` });
console.log('01-welcome.png');

// 2. Editor panel
await page.screenshot({ path: `${OUT}/02-editor.png`, clip: { x: 0, y: 55, width: 650, height: 795 } });
console.log('02-editor.png');

// 3. Preview panel
await page.screenshot({ path: `${OUT}/03-preview.png`, clip: { x: 695, y: 55, width: 705, height: 795 } });
console.log('03-preview.png');

// 4. Sections chips only (from "Sections" label onwards)
await page.screenshot({ path: `${OUT}/04-sections-only.png`, clip: { x: 635, y: 55, width: 765, height: 42 } });
console.log('04-sections-only.png');

// 5. Contact dropdown — open then shoot
await page.click('#contact-pill');
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/05-contact.png`, clip: { x: 0, y: 55, width: 750, height: 420 } });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
console.log('05-contact.png');

// 6. Layout toolbar strip
await page.screenshot({ path: `${OUT}/06-layout.png`, clip: { x: 0, y: 55, width: 570, height: 42 } });
console.log('06-layout.png');

// 7a. Template picker
await page.click('#template-trigger');
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/07a-template-picker.png`, clip: { x: 578, y: 0, width: 422, height: 700 } });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
console.log('07a-template-picker.png');

// 7b. settings.yaml tab
await page.click('#file-tab-settings');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/07b-settings-yaml.png`, clip: { x: 0, y: 55, width: 650, height: 795 } });
await page.click('#file-tab-resume');
await page.waitForTimeout(300);
console.log('07b-settings-yaml.png');

// 8. Export dropdown
await page.click('#export-trigger');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/08-export.png`, clip: { x: 1150, y: 0, width: 250, height: 250 } });
await page.keyboard.press('Escape');
console.log('08-export.png');

await browser.close();
console.log(`\nDone — screenshots saved to ${OUT}/`);
```

- [ ] **Step 2: 스크립트 실행 확인**

```bash
node scripts/take-onboarding-screenshots.mjs
```

Expected: `frontend/assets/onboarding/` 에 9개 파일 생성, 파일 크기 > 1KB

- [ ] **Step 3: 커밋**

```bash
git add scripts/take-onboarding-screenshots.mjs
git commit -m "chore: add Playwright screenshot update script for onboarding"
```

---

## Task 7: 전체 테스트 + 최종 커밋

- [ ] **Step 1: JS 테스트 전체 실행**

```bash
node --test tests/test_onboarding.js
```

Expected: 8개 모두 PASS

- [ ] **Step 2: 기존 JS 테스트 회귀 확인**

```bash
node --test tests/test_yaml_backup.js tests/test_settings_sync_tab_switch.js tests/test_sections_ui_add_hidden_section.js
```

Expected: 모두 PASS

- [ ] **Step 3: Python 테스트 확인**

```bash
pytest tests/ -q --tb=short
```

Expected: 모두 PASS (onboarding은 순수 프론트엔드라 Python 테스트와 무관)

- [ ] **Step 4: 브라우저 최종 E2E 검증**

1. `localStorage.clear()` 후 새로고침 → 위저드 자동 오픈
2. EN 전환 → 모든 텍스트 영어로 바뀜 → KO 전환 → 한국어로 복원
3. 위저드 열린 상태에서 EN↔KO 토글 → 즉시 텍스트 갱신
4. 건너뛰기 → 새로고침 → 위저드 안 뜸
5. ? 버튼 → 위저드 재오픈
6. 다크 모드 전환 후 위저드 열기 → 테마 색상 올바르게 적용

- [ ] **Step 5: 최종 커밋**

```bash
git add -A
git commit -m "feat: onboarding wizard complete — bilingual KO/EN, 9 steps, real screenshots"
```
