/**
 * 商品資料的介面層。
 *
 * 這個檔案本身**不含任何商品資料** —— 資料在 Google Sheet，由
 * tools/build-catalog.mjs 產生成同目錄的 products.generated.js 與
 * site.generated.js。這裡只做一件事：把那兩份扁平資料組成前台元件要的形狀。
 *
 * ── 為什麼要有這一層，而不是讓元件直接吃產生的檔案 ──────────────────
 *
 * Sheet 存的是扁平欄位（name_zh / name_en / name_ko 三欄），
 * 因為那是人能編輯的形狀 —— 一個儲存格一個值。
 * 但 i18n.js 的 pick() 吃的是 { zh, en, ko } 物件，香調要陣列不是字串。
 * 兩邊都合理，中間需要一次轉換。放在這裡，ShowcaseView / ProductModal /
 * SiteHeader / SiteFooter 一行都不用改，也不需要知道資料從哪來。
 *
 * ── 這裡的 export 就是對外契約 ──────────────────────────────────────
 *
 *   company / houses / categories / products / featured
 *   mediaUrl / findCategory / categoryCount / isCutout
 *
 * 九個，跟改版前一模一樣。要動它們就是動所有元件，先想清楚。
 */

import PRODUCTS from './products.generated.js'
import { categories as CATS, houses as HOUSES } from './site.generated.js'

/** GitHub Pages 部署在子路徑，所有靜態資源的路徑都要帶上前綴 */
const BASE = import.meta.env.BASE_URL || '/'
const url = (p) => (p ? BASE.replace(/\/$/, '') + p : p)

/**
 * 公司資料。刻意留在程式碼裡不進 Sheet ——
 * 它一年不會改一次，而且 LINE 連結打錯會讓唯一的轉換管道失效，
 * 那種東西不該放在隨時可編輯的地方。
 */
export const company = {
  name: {
    zh: '維羅拉國際有限公司',
    en: 'Velora International CO., LTD',
    ko: '벨로라 인터내셔널',
  },
  nameEn: 'Velora International CO., LTD',
  wordmark: 'VELORA',
  wordmarkZh: '維羅拉',
  lineId: '@velora',
  lineUrl: 'https://lin.ee/uzoQ8dl',
  email: 'hello@velora.com.tw',
  // 統編、地址、電話待確認，確定前不對外顯示；補上後於頁尾加回即可。
}

/* ── 轉換工具 ─────────────────────────────────────────────────────── */

/** 三個扁平欄位 → { zh, en, ko }。缺的補空字串，pick() 會自動回退中文 */
const tri = (row, field) => ({
  zh: row[`${field}_zh`] || '',
  en: row[`${field}_en`] || '',
  ko: row[`${field}_ko`] || '',
})

/** 三個分號分隔的字串 → { zh: [], en: [], ko: [] } */
const list = (row, field) => {
  const split = (s) => String(s || '').split(';').map((x) => x.trim()).filter(Boolean)
  return { zh: split(row[`${field}_zh`]), en: split(row[`${field}_en`]), ko: split(row[`${field}_ko`]) }
}

/**
 * 產地代碼 → 三語。Sheet 存 'KR' 這種兩碼，因為那是人填的形狀；
 * 但 ProductModal 用 pick(product.origin)，要的是三語物件。
 * 沒對到的代碼原樣顯示，總比顯示空白好 —— 至少看得出漏了什麼。
 */
const ORIGIN = {
  KR: { zh: '韓國', en: 'Korea', ko: '한국' },
  TW: { zh: '台灣', en: 'Taiwan', ko: '대만' },
  JP: { zh: '日本', en: 'Japan', ko: '일본' },
}
const origin = (code) => ORIGIN[code] || { zh: code, en: code, ko: code }

/**
 * 香調只有香氛用得到。其餘品類三個 slot 都是空的，
 * 這時要回 null 而不是空陣列 —— ProductModal 用 v-if="product.notes"
 * 判斷要不要畫那塊，空物件是 truthy，會畫出三個空欄位。
 */
function notesOf(row) {
  const top = list(row, 'notes_top')
  const middle = list(row, 'notes_mid')
  const base = list(row, 'notes_base')
  const any = [top, middle, base].some((n) => n.zh.length || n.en.length || n.ko.length)
  return any ? { top, middle, base } : null
}

/* ── 商品 ─────────────────────────────────────────────────────────── */

export const products = PRODUCTS.map((r) => {
  const files = r.files || []
  const gallery = files.map((f) => url('/media/' + f))
  return {
    id: r.id,
    category: r.category,
    house: r.house,
    name: tri(r, 'name'),
    tagline: tri(r, 'tagline'),
    desc: tri(r, 'desc'),
    material: tri(r, 'material'),
    spec: tri(r, 'spec'),
    detail: tri(r, 'detail'),
    notes: notesOf(r),
    origin: origin(r.origin),
    // 沒有圖的商品 image 是 undefined，版面會走 .plate.pending 的空版樣式
    image: gallery[0],
    thumb: gallery[0],
    gallery,
    listed: r.listed !== false,
    featured: r.featured === true,
    order: r.order || 0,
    updated: r.updated,
    // price 只有 price_public 勾選時才存在。沒勾的話產生器連欄位都不輸出，
    // 不是輸出了再隱藏 —— 所以這裡不需要任何判斷，沒有就是沒有
    ...(r.price === undefined ? {} : { price: r.price }),
  }
}).sort((a, b) => a.order - b.order)

/**
 * 首頁精選。改版前是一個手寫的 FEATURED 常數，順便覆寫品名與描述；
 * 那些覆寫已經寫回 Sheet（scarf-1 的「象牙真絲長巾」就是），
 * 所以這裡只剩一個布林欄位的過濾。
 */
export const featured = products.filter((p) => p.featured && p.listed)

/* ── 品牌與品類 ───────────────────────────────────────────────────── */

/** 產生的是陣列（Sheet 的自然形狀），元件用 houses[p.house] 取，要物件 */
export const houses = Object.fromEntries(HOUSES.map((h) => [h.key, h]))

/**
 * 前台的品類。
 *
 * 沒有上架商品的品類會被濾掉 —— 導覽列點進去是空的比沒有那一項更糟，
 * 而且品類格會變成一張沒有內容的封面圖。目前手機包是 0 件，
 * 灌了商品之後它會自己出現，不需要改程式碼。
 *
 * 後台不走這條路：後台要看得到所有品類（不然沒辦法把商品指派過去）。
 */
export const allCategories = CATS.map((c) => ({ ...c, cover: url(c.cover) }))

export const categories = allCategories.filter((c) =>
  products.some((p) => p.category === c.key && p.listed)
)

/* ── 對外的小工具 ─────────────────────────────────────────────────── */

export { url as mediaUrl }

export const findCategory = (key) => allCategories.find((c) => c.key === key)

export const categoryCount = (key) => products.filter((p) => p.category === key).length

/**
 * 版面用哪種裁切方式取決於「這是不是去背圖」。
 *
 * .png 是舊素材的判準：build-assets.py 會把沒有實際透明像素的圖轉存 JPEG，
 * 所以留下來的 .png 一定有透明像素。
 *
 * 但 WebP 也可以有 alpha，副檔名就分不出來了 —— 所以產生器直接讀 WebP
 * 容器標頭（VP8X 的 ALPHA flag），有透明像素的檔名帶 .cut.webp。
 * 判斷寫在產生檔名的時候，不是每次渲染時猜。
 */
export const isCutout = (src) =>
  Boolean(src) && (src.endsWith('.png') || src.endsWith('.cut.webp'))
