/**
 * 三語切換：繁體中文 / English / 한국어。
 *
 * 範圍：**只做對外展示頁**。後台是內部工具，維持中文即可 ——
 * 給操作者三種語言只會增加維護面而不增加價值。
 *
 * 兩個工具：
 *   t('key', ...args)   介面字串（本檔的 UI 表，%s 為插入點）
 *   pick(field)         商品資料的三語欄位，形如 { zh, en, ko }
 */
import { ref, watch } from 'vue'

const STORAGE = 'velora-lang'

export const LANGS = [
  { key: 'zh', label: '繁', htmlLang: 'zh-Hant-TW', name: '繁體中文' },
  { key: 'en', label: 'EN', htmlLang: 'en', name: 'English' },
  { key: 'ko', label: '한', htmlLang: 'ko', name: '한국어' },
]

function initial() {
  try {
    const saved = localStorage.getItem(STORAGE)
    if (LANGS.some((l) => l.key === saved)) return saved
  } catch {
    /* 隱私模式或封鎖站台資料時讀不到，用預設值即可 */
  }
  // 沒有存過偏好就看瀏覽器語言，韓文與英文使用者直接落在自己的語言
  const nav = (navigator.language || '').toLowerCase()
  if (nav.startsWith('ko')) return 'ko'
  if (nav.startsWith('en')) return 'en'
  return 'zh'
}

export const lang = ref(initial())

watch(
  lang,
  (v) => {
    document.documentElement.lang = LANGS.find((l) => l.key === v)?.htmlLang || 'zh-Hant-TW'
    try {
      localStorage.setItem(STORAGE, v)
    } catch {
      /* 寫不進去不影響本次瀏覽 */
    }
  },
  { immediate: true },
)

/** 商品資料的三語欄位；缺該語時回退中文，不會露出空白 */
export const pick = (field) => {
  if (field == null) return ''
  if (typeof field === 'string') return field
  return field[lang.value] ?? field.zh ?? ''
}

const UI = {
  // ── 導覽 ──────────────────────────────────────────────
  searchPlaceholder: {
    zh: '搜尋商品、品類或編號',
    en: 'Search products, categories or ref.',
    ko: '상품, 카테고리, 품번 검색',
  },
  searchLabel: { zh: '搜尋商品', en: 'Search products', ko: '상품 검색' },
  openSearch: { zh: '開啟搜尋', en: 'Open search', ko: '검색 열기' },
  clearSearch: { zh: '清除搜尋', en: 'Clear search', ko: '검색어 지우기' },
  lineConsult: { zh: '用 LINE 諮詢', en: 'Ask on LINE', ko: 'LINE으로 문의' },
  menu: { zh: '開關選單', en: 'Toggle menu', ko: '메뉴 열기' },
  langLabel: { zh: '切換語言', en: 'Change language', ko: '언어 변경' },

  // ── 主視覺 ────────────────────────────────────────────
  heroEyebrow: {
    zh: '2026 秋季 — 韓國選件',
    en: '2026 Autumn — Korean Selection',
    ko: '2026 가을 — 한국 셀렉션',
  },
  heroSub1: {
    zh: '來自韓國的居家香氛、真絲長巾與純銀飾品。',
    en: 'Home fragrance, silk scarves and sterling jewelry from Korea.',
    ko: '한국에서 온 홈 프래그런스, 실크 스카프, 실버 주얼리.',
  },
  heroSub2: {
    zh: '每一件都經手挑過，才放進這裡。',
    en: 'Every piece is chosen by hand before it earns a place here.',
    ko: '손으로 직접 고른 것만 이곳에 놓입니다.',
  },
  explore: { zh: '探索系列', en: 'Explore', ko: '컬렉션 보기' },
  askOnLine: {
    zh: '或直接用 LINE 問我們 →',
    en: 'Or just ask us on LINE →',
    ko: 'LINE으로 바로 문의하기 →',
  },
  heroCarousel: { zh: '主視覺輪播', en: 'Hero carousel', ko: '메인 슬라이드' },
  slideN: { zh: '第 %s 張', en: 'Slide %s', ko: '%s번째 이미지' },

  // ── 品類 ──────────────────────────────────────────────
  catKicker: {
    zh: '兩家韓國品牌 · 四條商品線',
    en: 'Two Korean Houses · Four Lines',
    ko: '두 개의 한국 브랜드 · 네 가지 라인',
  },
  catTitle: { zh: '四大品類', en: 'Categories', ko: '카테고리' },
  catTitleEm: { zh: 'Curated', en: 'Curated', ko: 'Curated' },
  selected: { zh: '件選件', en: 'Selected', ko: '개 셀렉션' },

  // ── 精選 ──────────────────────────────────────────────
  featKicker: { zh: '本季精選', en: 'This Season · Featured', ko: '이번 시즌 · 추천' },
  featTitle: { zh: '精選展示', en: 'Featured', ko: '추천 상품' },
  featTitleEm: { zh: 'Showcase', en: 'Showcase', ko: 'Showcase' },
  viewAll: { zh: '看全部 %s 件', en: 'View all %s', ko: '전체 %s개 보기' },
  viewDetails: { zh: '查看細節', en: 'View Details', ko: '자세히 보기' },

  // ── 目錄 ──────────────────────────────────────────────
  allSelections: { zh: '全部選件', en: 'All Selections', ko: '전체 셀렉션' },
  all: { zh: '全部', en: 'ALL', ko: '전체' },
  searchResult: { zh: '搜尋結果', en: 'Search Results', ko: '검색 결과' },
  noResult: {
    zh: '找不到符合的商品。',
    en: 'No products match that search.',
    ko: '검색 결과가 없습니다.',
  },
  noResultHint: {
    zh: '換個關鍵字，或看看其他品類。',
    en: 'Try another keyword, or browse a category.',
    ko: '다른 키워드로 검색하시거나 카테고리를 둘러보세요.',
  },
  resetFilter: { zh: '看全部選件', en: 'Show all selections', ko: '전체 보기' },

  // ── 理念 ──────────────────────────────────────────────
  philKicker1: {
    zh: '理念 — 選件標準',
    en: 'Philosophy — How we choose',
    ko: '철학 — 선택의 기준',
  },
  philKicker2: {
    zh: '理念 — 低調的定義',
    en: 'Philosophy — What quiet means',
    ko: '철학 — 조용함의 정의',
  },
  philBody1: {
    zh: '維羅拉不做全品項。我們代理兩家韓國品牌：VUCA 做居家香氛，SAINTMARI 做真絲長巾與純銀飾品。每一季只留下經得起反覆使用的那幾件，標準只有一個 —— 三年後你還會想用它。',
    en: 'Velora does not carry everything. We represent two Korean houses: VUCA for home fragrance, SAINTMARI for silk scarves and sterling jewelry. Each season we keep only the few pieces that hold up to repeated use. The test is simple — will you still want it in three years?',
    ko: '벨로라는 모든 품목을 취급하지 않습니다. 두 개의 한국 브랜드를 소개합니다. VUCA는 홈 프래그런스를, SAINTMARI는 실크 스카프와 실버 주얼리를 만듭니다. 매 시즌 오래 써도 견디는 몇 가지만 남깁니다. 기준은 하나입니다 — 3년 뒤에도 쓰고 싶은가.',
  },
  philBody2: {
    zh: '低調不是沒有主張，而是把主張放進材質、比例與收邊裡。一條真絲長巾的捲邊、一只銀戒收得多細、一支擴香在空間裡停留多久 —— 這些細節不會出現在標籤上，但你用過就知道。',
    en: 'Quiet is not the absence of a point of view. It is that point of view moved into material, proportion and finish — the rolled hem of a scarf, how fine a silver band is drawn, how long a diffuser holds a room. None of it appears on the label. You notice it in use.',
    ko: '조용하다는 것은 주장이 없다는 뜻이 아닙니다. 주장을 소재와 비율과 마감 안에 넣는다는 뜻입니다. 스카프의 말아 박은 단, 은반지를 얼마나 가늘게 뽑았는지, 디퓨저가 공간에 얼마나 오래 머무는지 — 라벨에는 적히지 않지만, 써보면 압니다.',
  },

  // ── 商品細節 ──────────────────────────────────────────
  brand: { zh: '品牌', en: 'Brand', ko: '브랜드' },
  material: { zh: '材質', en: 'Material', ko: '소재' },
  spec: { zh: '規格', en: 'Specification', ko: '사양' },
  origin: { zh: '產地', en: 'Origin', ko: '원산지' },
  noteTop: { zh: '前調', en: 'Top', ko: '탑' },
  noteMiddle: { zh: '中調', en: 'Middle', ko: '미들' },
  noteBase: { zh: '後調', en: 'Base', ko: '베이스' },
  askAboutThis: {
    zh: '用 LINE 詢問這件',
    en: 'Ask about this on LINE',
    ko: 'LINE으로 이 상품 문의하기',
  },
  close: { zh: '關閉', en: 'Close', ko: '닫기' },
  viewShot: { zh: '檢視第 %s 張', en: 'View image %s', ko: '%s번째 이미지 보기' },

  // ── 頁尾與 LINE ───────────────────────────────────────
  ftCategories: { zh: '品類', en: 'Categories', ko: '카테고리' },
  ftInformation: { zh: '關於維羅拉', en: 'Information', ko: '벨로라 소개' },
  ftLine: { zh: 'LINE 官方帳號', en: 'LINE Official Account', ko: 'LINE 공식 계정' },
  ftStory: { zh: '品牌故事', en: 'Our Story', ko: '브랜드 스토리' },
  ftStandard: { zh: '選件標準', en: 'How We Choose', ko: '선택의 기준' },
  ftPrivacy: { zh: '隱私權政策', en: 'Privacy Policy', ko: '개인정보 처리방침' },
  ftTerms: { zh: '服務條款', en: 'Terms of Service', ko: '이용약관' },
  ftEmail: { zh: '信箱', en: 'Email', ko: '이메일' },
  lineNote: {
    zh: '選件問題、庫存與到貨都在 LINE 上回覆。',
    en: 'Questions, stock and arrival dates — all answered on LINE.',
    ko: '셀렉션 문의, 재고, 입고 일정 모두 LINE으로 답변드립니다.',
  },
  lineTitle: {
    zh: '維羅拉國際 LINE 官方帳號',
    en: 'Velora International on LINE',
    ko: '벨로라 인터내셔널 LINE 공식 계정',
  },
  addFriend: { zh: '加入好友', en: 'Add Friend', ko: '친구 추가' },
  rights: { zh: '版權所有', en: 'All rights reserved.', ko: 'All rights reserved.' },
  represents: {
    zh: '代理品牌 VUCA · SAINTMARI（韓國）',
    en: 'Representing VUCA · SAINTMARI (Korea)',
    ko: '취급 브랜드 VUCA · SAINTMARI (한국)',
  },
}

export function t(key, ...args) {
  const entry = UI[key]
  if (!entry) return key
  let s = entry[lang.value] ?? entry.zh
  args.forEach((a) => (s = s.replace('%s', a)))
  return s
}
