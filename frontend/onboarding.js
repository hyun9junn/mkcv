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

    _el('ob-step-label').textContent = `${_step + 1} / ${STEPS.length}`;

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
    _el('ob-btn-skip').style.visibility = isLast ? 'hidden' : '';
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
