/* ============================================================
   VELORA 2 — 全站腳本
   零依賴、約 90 行。三件事：語言、章節牌、捲動揭示。

   資安三條：
     1. 只用 textContent 寫入畫面，全站沒有一處 innerHTML —— 沒有
        注入 HTML 的路徑，即使日後把文案接到外部資料也一樣安全。
     2. localStorage 讀回來的值先比對白名單再用，不直接進 DOM 或
        <html lang>，避免被人手動改值後污染屬性。
     3. 沒有 fetch、沒有第三方腳本、沒有追蹤碼。CSP 已把
        connect-src 設為 none，這支檔案也真的不連任何東西。

   三語不放字典表：譯文就寫在 HTML 的 data-en / data-ko 上，
   中文是 DOM 的原始內容。好處是關掉 JS 仍有完整中文站，
   而且改文案只要改一個地方。
   ============================================================ */

(function () {
  'use strict';

  var LANGS = ['zh', 'en', 'ko'];
  var HTML_LANG = { zh: 'zh-Hant-TW', en: 'en', ko: 'ko' };
  var STORE = 'velora-lang';

  var root = document.documentElement;

  /* ── 語言 ───────────────────────────────────────────────
     只掃有 data-en 的元素；這些都是純文字葉節點。
     中文原文在第一次讀取時存進 data-zh，之後就能來回切換。 */
  var nodes = [].slice.call(document.querySelectorAll('[data-en]'));
  nodes.forEach(function (el) {
    el.dataset.zh = el.textContent;
  });

  var buttons = [].slice.call(document.querySelectorAll('.lang button'));

  function setLang(lang) {
    if (LANGS.indexOf(lang) === -1) lang = 'zh';

    nodes.forEach(function (el) {
      el.textContent = el.dataset[lang] || el.dataset.zh;
    });

    root.setAttribute('lang', HTML_LANG[lang]);
    buttons.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
    });

    current = lang;
    paintChapter();

    try {
      localStorage.setItem(STORE, lang);
    } catch (e) {
      /* 無痕模式會擋掉寫入。切換照樣有效，只是不記得下次 */
    }
  }

  var stored;
  try {
    stored = localStorage.getItem(STORE);
  } catch (e) {
    stored = null;
  }
  /* 首次進站看瀏覽器語言，之後聽 localStorage 的 */
  var nav = (navigator.language || 'zh').slice(0, 2);
  var current = LANGS.indexOf(stored) > -1 ? stored : LANGS.indexOf(nav) > -1 ? nav : 'zh';

  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      setLang(b.dataset.lang);
    });
  });

  /* ── 位置牌：書脊上報出目前看到哪一家 ───────────────────
     品牌名不翻譯，三語都是同一個字標。 */
  var CHAPTERS = {
    top: { zh: 'Velora', en: 'Velora', ko: 'Velora' },
    vuca: { zh: 'VUCA', en: 'VUCA', ko: 'VUCA' },
    saintmari: { zh: 'SAINTMARI', en: 'SAINTMARI', ko: 'SAINTMARI' },
    mobile: { zh: '手機包', en: 'Phone bags', ko: '폰백' },
    standard: { zh: '選物準則', en: 'Standard', ko: '선정 기준' },
    about: { zh: '關於', en: 'About', ko: '소개' }
  };

  var tagText = document.querySelector('#chapterTag b');
  var here = 'top';

  function paintChapter() {
    var c = CHAPTERS[here];
    if (c && tagText) tagText.textContent = c[current];
  }

  var watched = [document.querySelector('.hero')];
  ['vuca', 'saintmari', 'mobile', 'standard', 'about'].forEach(function (id) {
    watched.push(document.getElementById(id));
  });

  if ('IntersectionObserver' in window) {
    /* 只有畫面中央那條窄帶算數，換章節的時機才不會忽前忽後 */
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          here = e.target.id || 'top';
          paintChapter();
        });
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    watched.forEach(function (el) {
      if (el) spy.observe(el);
    });
  }

  /* 這裡本來有一組捲動揭示（區塊逐一淡入）。拿掉了，兩個理由：
     一是內容在揭示前是 opacity:0，只要 observer 沒觸發整頁就是空白 ——
     用一個裝飾效果換一個「內容可能不見」的風險並不划算；
     二是全站只留書脊那一次描線當進場，動態集中在一處比散在各段更有份量。 */

  setLang(current);
})();
