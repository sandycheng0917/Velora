/**
 * 把 Sheet 的商品灌進 velora2/index.html 的卡片區。
 *
 * velora2 沒有建置流程，CSP 禁 fetch，而且承諾「零 innerHTML、關掉 JS 仍是
 * 完整的中文站」。所以資料不能在瀏覽器端注入，只能在建置時改 HTML 本身。
 *
 * ── 為什麼用錨點註解而不是解析 HTML ────────────────────────────────
 *
 * 否決正規表示式匹配 <article>…</article>：非貪婪匹配遇到屬性順序變化就錯位，
 * 而且失敗是**靜默的** —— 產出語法合法但內容錯亂的 HTML，沒有人會發現。
 *
 * 否決引入 parse5 / cheerio：序列化器會正規化屬性順序與空白，
 * 每次建置都產生幾百行無意義的 diff，真正的改動會被淹掉。
 *
 * 錨點註解把問題降級成「在兩個確切字面標記之間做字串替換」，indexOf + slice
 * 就結束，而且**失敗時大聲**：找不到、重複、順序顛倒一律 throw。
 *
 * 另一個關鍵好處：錨點之間保留現有卡片當種子，所以 velora2/index.html
 * 本身仍然是一份可以直接 python -m http.server 打開的完整站台 ——
 * README 承諾的「部署就是把整個 velora2/ 丟上任何靜態主機」不會失效。
 *
 * ── 用法 ────────────────────────────────────────────────────────────
 *
 *   node tools/inject-velora2.mjs --out build/site/v2/index.html
 *   node tools/inject-velora2.mjs --check     # 只驗證，不輸出
 *
 * 一律寫到別的地方，**永遠不改 velora2/index.html 本身** ——
 * CI 會跑 git diff --exit-code -- velora2/ 確認 repo 沒被弄髒。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'velora2', 'index.html')
const DATA = join(ROOT, 'velora-frontend', 'src', 'data')

/** 有錨點的品類。手機包刻意沒有 —— Sheet 裡沒有 BAG 商品，
 *  加了錨點會把那一區清空，示意版面就消失了。 */
const SECTIONS = ['fragrance', 'scarf', 'jewelry', 'phonebag']

/* ── 跳脫 ─────────────────────────────────────────────────────────── */

/**
 * & 必須第一個換。否則後面產生的 &lt; 會被二次跳脫成 &amp;lt;，
 * 畫面上就直接看到 "&lt;" 這四個字元。
 */
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 屬性值：多換掉引號。屬性一律用雙引號，不做「這欄不會有特殊字元」的假設 */
const att = (s) => esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Sheet 的儲存格很容易按到 Alt+Enter，換行進 HTML 屬性會直接破版 */
const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

/* ── 直接子元素計數 ───────────────────────────────────────────────── */

const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'wbr'])

/**
 * 數一段 HTML 的「直接」子元素。
 *
 * 🔴 這不是裝飾性的檢查。velora2 的卡片是 CSS subgrid：
 *    grid-template-rows: subgrid; grid-row: span 5
 * 直接子元素多一個少一個，整列卡片的逐行對齊就全部崩掉 ——
 * 那正是「修跑版：卡片逐行對齊」那個 commit 剛修好的東西。
 *
 * 用深度追蹤而不是 /^\s*<(span|p|h3|dl)/ 這種行首比對：
 * .plate.pending 裡有三個縮排的 <span>，行首比對會把它們算成卡片的子元素，
 * 得到 7 而不是 5。我第一次就是這樣誤判的。
 */
function countDirectChildren(html) {
  let depth = 0
  let n = 0
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g
  let m
  while ((m = re.exec(html))) {
    const [, close, tag, attrs] = m
    const selfClosing = VOID.has(tag.toLowerCase()) || /\/\s*$/.test(attrs)
    if (close) { depth-- ; continue }
    if (depth === 0) n++
    if (!selfClosing) depth++
  }
  return n
}

/* ── 卡片 ─────────────────────────────────────────────────────────── */

/**
 * h3 / .say / dd 必須是純文字節點。
 * assets/app.js 用 el.textContent 存中文原文，含子元素的話會把子元素的文字
 * 一起吞進去，切回中文時就變成兩段文字黏在一起。
 *
 * data-en / data-ko 一律輸出，缺譯輸出空字串：
 * app.js 是 el.dataset[lang] || el.dataset.zh，空字串是 falsy 會自動回退中文；
 * 但如果省略屬性，該元素不在 querySelectorAll('[data-en]') 的集合裡，
 * 切語言時會永遠停在中文，整頁變成混語。
 */
const tri = (tag, cls, v, extra = '') => {
  const c = cls ? ` class="${cls}"` : ''
  return `<${tag}${c}${extra} data-en="${att(one(v.en))}" data-ko="${att(one(v.ko))}">${esc(one(v.zh))}</${tag}>`
}

function plate(p) {
  if (!p.file) {
    // 沒有圖用既有的空版語彙，仍然是 1 個直接子元素
    return `<span class="plate pending" role="img" aria-label="圖片製版中">` +
      `<b aria-hidden="true"></b>` +
      `<span class="p1" data-en="Plate pending" data-ko="제작 중">圖片製版中</span>` +
      `<span class="p2">${esc(one(p.code))}</span></span>`
  }
  const cut = p.file.endsWith('.png') || p.file.endsWith('.cut.webp')
  return `<span class="plate${cut ? ' is-cutout' : ''}">` +
    `<img src="assets/media/${att(p.file)}" alt="${att(one(p.name.zh))}"` +
    ` loading="lazy" decoding="async" width="800" height="1000"></span>`
}

/** 香調欄是分號分隔的（水蜜桃;綠意;葡萄柚）。中點比頓號更貼目錄的語氣 */
const notesText = (v) =>
  String(v || '').split(';').map((x) => x.trim()).filter(Boolean).join(' · ')

/** 三語都拆一次。整組都空的話回 null，呼叫端就整列不輸出 */
function notesRow(v) {
  const out = { zh: notesText(v.zh), en: notesText(v.en), ko: notesText(v.ko) }
  return (out.zh || out.en || out.ko) ? out : null
}

/**
 * 售價。
 *
 * 🔴 只有勾了 price_public 的商品才有這個欄位 —— 產生器連欄位都不輸出
 * （見 build-catalog.mjs）。所以這裡不必再判斷一次「要不要公開」，
 * 判斷「有沒有值」就等於判斷「有沒有勾」。多加一層自己的判斷反而危險：
 * 兩處規則遲早會不一致，而不一致的那一次就是把不該公開的價格印出去。
 *
 * 數字不隨語言變，三語給同一個字串。
 */
function priceRow(price) {
  const n = Number(price)
  if (price === undefined || price === null || String(price).trim() === '' || !isFinite(n)) return null
  const t = `NT$ ${n.toLocaleString('en-US')}`
  return { zh: t, en: t, ko: t }
}

/**
 * 卡片的直接子元素必須剛好 **4** 個：影像板、索引碼、品名、<details>。
 *
 * 2026-09-07 從 5 改成 4：說明與規格表移進 <details> 收合起來 ——
 * 手機版一頁二十個螢幕高，使用者的原話是「會要不斷的往下滑」。
 * 桌機由 CSS 的 display:contents 把 details 攤平回格線，那時才是 5 個，
 * 所以 grid-row 也有兩個值（見 style.css 的 html.js 規則）。
 */
const CARD_CHILDREN = 4

/** <dl> 的一列。值是 null 就整列不輸出 —— 空的 dt/dd 會留下一行空白 */
const row = (label, value) => (value ? tri('dt', '', label) + tri('dd', '', value) : '')

/** 三語有任何一個填了東西就算有 */
const hasText = (v) => !!(v && (String(v.zh || '').trim() || String(v.en || '').trim() || String(v.ko || '').trim()))

/**
 * 展開後的圖庫：主圖（完整比例）＋副圖。
 *
 * 卡片上那張是正方形縮圖，上下被裁掉了；這裡放的是完整的 4/5 ——
 * 「想看完整的圖」本身就是展開的理由之一。同一個網址，瀏覽器不會重抓。
 *
 * loading="lazy"：收合狀態的 <details> 內容不會被渲染，所以展開之前
 * 這些圖都不會被下載。一頁十幾件商品，這是最大的一筆流量。
 *
 * 一張圖都沒有就整個容器不輸出 —— 空的圖庫只會留下一段內距。
 */
function gallery(p) {
  const files = [p.file, ...(p.shots || [])].filter(Boolean)
  if (!files.length) return ''
  const cells = files.map((f) => {
    const cut = f.endsWith('.png') || f.endsWith('.cut.webp')
    return `<span class="plate${cut ? ' is-cutout' : ''}">` +
      `<img src="assets/media/${att(f)}" alt="${att(one(p.name.zh))}"` +
      ` loading="lazy" decoding="async" width="800" height="1000"></span>`
  })
  return `<div class="gal">${cells.join('')}</div>`
}

function card(p, houseName, labels) {
  const detail =
    `<details class="more">` +
      `<summary data-en="Details &amp; specs" data-ko="상세 · 사양">明細與規格</summary>` +
      tri('p', 'say', p.say) +
      // 順序：說明 → 照片 → 材質／香調／規格／專屬欄／售價。
      // 先給眼睛看的，再給要查的
      gallery(p) +
      `<dl class="hall">` +
        tri('dt', '', { zh: '材質', en: 'Material', ko: '소재' }) +
        tri('dd', '', p.material) +
        // 香調只有香氛填得出來，其餘品類整列不輸出（不是輸出空的）。
        // <dl> 是一個格線項目，多幾列不影響卡片的子元素數量
        row({ zh: '前調', en: 'Top', ko: '탑' }, notesRow(p.notes.top)) +
        row({ zh: '中調', en: 'Heart', ko: '미들' }, notesRow(p.notes.mid)) +
        row({ zh: '後調', en: 'Base', ko: '베이스' }, notesRow(p.notes.base)) +
        // 規格那一列的標籤逐品類不同：香氛是「容量」、絲巾是「尺寸」。
        // 同一格資料，換一個說得通的名字（labels 由 categories 分頁提供）
        row(labels.spec, hasText(p.spec) ? p.spec : null) +
        // 品類專屬的那一格。標籤留空就整列不輸出 —— 沒有名字的資料沒有意義
        row(labels.detail, hasText(labels.detail) && hasText(p.detail) ? p.detail : null) +
        row({ zh: '售價', en: 'Price', ko: '가격' }, priceRow(p.price)) +
      `</dl>` +
    `</details>`

  const parts = [
    plate(p),
    // 沒掛品牌（或品牌設成不露出）就整個 <em> 不輸出。空的 <em> 在手機版
    // 是 display:block 還帶 margin-top，會留下一段沒有內容的空白。
    // <em> 在 <p class="ref"> 裡面，不是 .card 的直接子元素，卡片不變式不受影響。
    `<p class="ref">${esc(one(p.code))}` +
      (one(houseName) ? `<em>${esc(one(houseName))}</em>` : '') + `</p>`,
    tri('h3', '', p.name),
    detail,
  ]
  const inner = parts.join('\n      ')
  const html = `<article class="card">\n      ${inner}\n    </article>`

  const n = countDirectChildren(inner)
  if (n !== CARD_CHILDREN) {
    throw new Error(
      `卡片 ${p.id} 有 ${n} 個直接子元素，必須剛好 ${CARD_CHILDREN} 個。\n` +
      `velora2 的卡片用 CSS subgrid，多一個少一個整列的逐行對齊都會錯位。`)
  }
  return html
}

/* ── 主流程 ───────────────────────────────────────────────────────── */

/** 品牌在版面上的一句話：這家做什麼。從它實際有哪些品類算出來 */
const HOUSE_LINES = {
  fragrance: { zh: '香氛', en: 'Fragrance', ko: '프래그런스' },
  scarf: { zh: '絲巾', en: 'Scarves', ko: '스카프' },
  jewelry: { zh: '飾品', en: 'Jewelry', ko: '주얼리' },
  phonebag: { zh: '手機包', en: 'Phone bags', ko: '폰백' },
}

async function loadSite() {
  return import(pathToFileURL(join(DATA, 'site.generated.js')).href)
}

async function loadProducts() {
  const rows = (await import(pathToFileURL(join(DATA, 'products.generated.js')).href)).default
  const { houses } = await loadSite()
  const houseName = Object.fromEntries(houses.map((h) => [h.key, h.name]))

  return rows
    .filter((r) => r.listed !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((r) => ({
      id: r.id,
      /*
       * 卡片上印的編號就是商品編號本身。
       *
       * 2026-09-07 以前另有一個 ref（索引碼）欄位，跟 id 並存 ——
       * 一個給機器、一個給人看。兩個編號的結果是沒有人知道該報哪一個，
       * 所以合併成一個：id 改成 VL_FRG_001 這種看得懂的格式，
       * 前台直接印它。ref 欄位還在 Sheet 上，只是不再輸出。
       */
      code: r.id,
      category: r.category,
      house: houseName[r.house] || r.house,
      houseKey: r.house,
      file: (r.files || [])[0] || '',
      // 主圖之外的圖。之前只取 [0]，副圖上傳了卻沒有任何地方引用
      shots: (r.files || []).slice(1),
      // 產生器只在勾了 price_public 時才輸出 price 欄位 ——
      // 沒勾的商品這裡就是 undefined，不是「有值但要藏起來」
      price: r.price,
      notes: {
        top: { zh: r.notes_top_zh, en: r.notes_top_en, ko: r.notes_top_ko },
        mid: { zh: r.notes_mid_zh, en: r.notes_mid_en, ko: r.notes_mid_ko },
        base: { zh: r.notes_base_zh, en: r.notes_base_en, ko: r.notes_base_ko },
      },
      name: { zh: r.name_zh, en: r.name_en, ko: r.name_ko },
      // 卡片上那句話：有標語用標語，沒有就用描述。
      // 不自動截斷描述 —— 截在半句話比整段長更難看，而且會截掉語意
      say: (r.tagline_zh || r.tagline_en || r.tagline_ko)
        ? { zh: r.tagline_zh, en: r.tagline_en, ko: r.tagline_ko }
        : { zh: r.desc_zh, en: r.desc_en, ko: r.desc_ko },
      material: { zh: r.material_zh, en: r.material_en, ko: r.material_ko },
      spec: { zh: r.spec_zh, en: r.spec_en, ko: r.spec_ko },
      detail: { zh: r.detail_zh, en: r.detail_en, ko: r.detail_ko },
    }))
}

/**
 * 整段移除一個 <section id="key">，連同導覽列與主視覺裡指向它的連結。
 *
 * 用括號配對找結束標籤，不用正規表示式 —— 非貪婪匹配遇到巢狀 <section>
 * 就會提早收尾，而且失敗是靜默的：產出語法合法但結構錯亂的 HTML。
 */
function dropSection(html, key) {
  const open = new RegExp(`<section[^>]*id="${key}"[^>]*>`)
  const m = open.exec(html)
  if (!m) return html

  let i = m.index + m[0].length
  let depth = 1
  while (depth > 0) {
    const next = html.indexOf('<section', i)
    const close = html.indexOf('</section>', i)
    if (close === -1) throw new Error(`找不到 #${key} 的結束標籤`)
    if (next !== -1 && next < close) { depth++; i = next + 8 } else { depth--; i = close + 10 }
  }
  let out = html.slice(0, m.index) + html.slice(i)

  // 導覽列與主視覺的連結也要拿掉，否則點下去會捲不到任何地方。
  //
  // 🔴 樣板字面值裡要寫 \\s 才會產生正規表示式要的 \s ——
  //    寫成 \s 的話 JS 會把它當成字面的 s，變成比對「s 開頭的空白」，
  //    而那個錯誤是靜默的：連結留在畫面上，點下去捲不到任何地方。
  out = out.replace(new RegExp(`\\s*<a href="#${key}"[^>]*>[\\s\\S]*?</a>`, 'g'), '')
  return out
}

/** 品牌區塊。只有上架中的品牌會出現 */
function houseBlock(h, i) {
  const cat = h.lines || { zh: '', en: '', ko: '' }
  return `<article>` +
    `<p class="ref">HOUSE · ${String(i + 1).padStart(2, '0')}</p>` +
    `<h3>${esc(one(h.name))}</h3>` +
    tri('p', 'loc', {
      zh: `${one(h.country.zh)}　·　${one(cat.zh)}`,
      en: `${one(h.country.en)} · ${one(cat.en)}`,
      ko: `${one(h.country.ko)} · ${one(cat.ko)}`,
    }) +
    tri('p', '', h.intro) +
  `</article>`
}

/** 通用版的錨點替換。splice() 是品類專用的包裝 */
function spliceNamed(html, name, block) {
  const start = `<!-- ${name}:start`
  const end = `<!-- ${name}:end -->`
  const si = html.indexOf(start)
  if (si === -1) throw new Error(`找不到錨點 ${start}`)
  if (html.indexOf(start, si + 1) !== -1) throw new Error(`錨點 ${start} 出現不只一次`)
  const so = html.indexOf('-->', si)
  const ei = html.indexOf(end, so)
  if (ei === -1) throw new Error(`找不到 ${end}，或它排在 start 前面`)
  if (html.indexOf(end, ei + 1) !== -1) throw new Error(`錨點 ${end} 出現不只一次`)
  return html.slice(0, so + 3) + '\n' + block + '\n    ' + html.slice(ei)
}

function splice(html, key, block) {
  const start = `<!-- CARDS:${key}:start`
  const end = `<!-- CARDS:${key}:end -->`

  const si = html.indexOf(start)
  if (si === -1) throw new Error(`找不到錨點 ${start}。velora2/index.html 被改過了？`)
  if (html.indexOf(start, si + 1) !== -1) throw new Error(`錨點 ${start} 出現不只一次`)

  const so = html.indexOf('-->', si)
  if (so === -1) throw new Error(`錨點 ${start} 沒有收尾`)

  const ei = html.indexOf(end, so)
  if (ei === -1) throw new Error(`找不到 ${end}，或它排在 start 前面`)
  if (html.indexOf(end, ei + 1) !== -1) throw new Error(`錨點 ${end} 出現不只一次`)

  return html.slice(0, so + 3) + '\n' + block + '\n    ' + html.slice(ei)
}

async function main() {
  const args = process.argv.slice(2)
  const check = args.includes('--check')
  const oi = args.indexOf('--out')
  const OUT = oi !== -1 && args[oi + 1]
    ? args[oi + 1]
    : join(ROOT, 'build', 'site', 'v2', 'index.html')

  let html = await readFile(SRC, 'utf8')
  const products = await loadProducts()

  /*
   * 主視覺那四個件數（FRG 05 / SLK 13 …）原本是寫死的，而且早就跟實際
   * 不符 —— 線上寫著絲巾 13 件、飾品 28 件，Sheet 裡是 3 件和 5 件。
   * 寫死的數字沒有人會記得更新，最後一定會說謊。
   *
   * 🔴 這裡曾經多接一筆寫死的 ['phonebag', 0]，理由是「那一區是版面示意，
   *    標成 0 會讓人以為東西賣完了」。它排在 perCat 後面，所以手機包
   *    真的有商品之後，第一圈寫上的 01 會被第二圈的 0 蓋回破折號 ——
   *    導覽列從此鎖死在「—」，不管 Sheet 裡有幾件。2026-09-07 移除。
   *
   *    現在不必特例：沒有商品時 perCat 根本沒有那個鍵，迴圈不會碰它，
   *    原始檔裡的破折號就留著。有商品才會被換成數字。
   */
  const perCat = {}
  for (const p of products) perCat[p.category] = (perCat[p.category] || 0) + 1
  for (const [key, n] of Object.entries(perCat)) {
    const re = new RegExp(`(<i data-count="${key}">)[^<]*(</i>)`, 'g')
    if (!re.test(html)) continue
    const shown = n > 0 ? String(n).padStart(2, '0') : '—'
    html = html.replace(new RegExp(`(<i data-count="${key}">)[^<]*(</i>)`, 'g'), `$1${shown}$2`)
  }

  /*
   * 明細表兩列的標籤，由 categories 分頁提供（產生器已經補過預設值）。
   * 舊的 site.generated.js 沒有這兩個欄位 —— 那時退回「規格」，
   * 專屬那一列則整列不輸出。這樣舊資料不會產生沒有名字的欄。
   */
  const { categories: allCats } = await loadSite()
  const labelMap = Object.fromEntries((allCats || []).map((c) => [c.key, c]))
  const labelsFor = (key) => {
    const c = labelMap[key] || {}
    return {
      spec: c.specLabel || { zh: '規格', en: 'Spec', ko: '사양' },
      detail: c.detailLabel || { zh: '', en: '', ko: '' },
    }
  }

  const counts = []
  /** 沒有上架商品、整段被移除的品類。要報告出來，否則區塊消失了沒有人知道為什麼 */
  const dropped = []
  for (const key of SECTIONS) {
    const list = products.filter((p) => p.category === key)

    /*
     * 一件上架商品都沒有 → 整個 <section> 拿掉。
     *
     * 第一版是丟例外。那在「品類永遠有商品」的假設下是對的，但一個品類
     * 底下的商品全部取消上架（products 的 listed）之後就會變成 0 件 ——
     * 那是正常操作，不是錯誤。
     *
     * 只清掉卡片而留下標題會更糟：畫面上出現一個有標題、有導言、
     * 卻什麼都沒有的區塊，那看起來像壞掉。
     */
    if (!list.length) {
      html = dropSection(html, key)
      dropped.push(key)
      continue
    }

    const block = list.map((p) => '    ' + card(p, p.house, labelsFor(key))).join('\n\n')
    html = splice(html, key, block)
    counts.push(`${key} ${list.length} 件`)
  }

  /*
   * 品牌區。只有「上架中而且真的有商品」的品牌會出現。
   *
   * houses 的 listed 控制品牌露不露出（不影響商品上下架）；有品牌但
   * 一件商品都沒有的情況（例如剛簽約還沒上架）也不該出現在
   * 「代理品牌」那一區 —— 那會讓人以為點得進去。
   */
  const { houses: allHouses } = await loadSite()
  const withProducts = new Set(products.map((p) => p.houseKey))
  const shown = allHouses.filter((h) => withProducts.has(h.key))
  const houseDropped = allHouses.filter((h) => !withProducts.has(h.key)).map((h) => h.name)

  const houseHtml = shown.map((h, i) => {
    const cats = [...new Set(products.filter((p) => p.houseKey === h.key).map((p) => p.category))]
    const lines = {
      zh: cats.map((c) => (HOUSE_LINES[c] || {}).zh || c).join('與'),
      en: cats.map((c) => (HOUSE_LINES[c] || {}).en || c).join(' & '),
      ko: cats.map((c) => (HOUSE_LINES[c] || {}).ko || c).join(' · '),
    }
    return '      ' + houseBlock({ ...h, lines }, i)
  }).join('\n\n')
  html = spliceNamed(html, 'HOUSES', houseHtml)

  /*
   * 把實際家數寫進 data-count，讓 CSS 決定排幾欄。
   *
   * 沒有這一步的話，格數是 CSS 寫死的三欄，而 Sheet 上目前只有兩家 ——
   * 第三格就是一塊空的。空格不是「留位子」，看起來只是漏掉了東西。
   *
   * 用整段開標籤比對而不是正規表示式：class 順序或多一個屬性都會讓
   * 鬆散的 regex 悄悄比不到，而那種失敗是靜默的 —— 產出的 HTML 合法，
   * 只是永遠停在三欄。這裡比不到就直接拋。
   */
  const housesTag = '<div class="houses">'
  if (html.split(housesTag).length - 1 !== 1) {
    throw new Error(`找不到唯一的 ${housesTag}，velora2/index.html 被改過了？`)
  }
  html = html.replace(housesTag, `<div class="houses" data-count="${shown.length}">`)

  // 注入後再全檔驗一次卡片不變式。單張卡片在 card() 裡驗過了，
  // 這裡驗的是「拼接本身沒有把別人的卡片弄壞」
  const cards = [...html.matchAll(/<article class="card">([\s\S]*?)<\/article>/g)]
  const broken = cards.filter((m) => countDirectChildren(m[1]) !== CARD_CHILDREN)
  if (broken.length) {
    throw new Error(`注入後有 ${broken.length} 張卡片不是 ${CARD_CHILDREN} 個直接子元素`)
  }

  // velora2 承諾零 innerHTML、零 fetch、唯一的 script 是 assets/app.js
  for (const [pat, why] of [
    [/\binnerHTML\b/, '出現 innerHTML'],
    [/\bfetch\s*\(/, '出現 fetch('],
    [/<script(?![^>]*src="assets\/app\.js")/, '出現非 assets/app.js 的 script'],
  ]) {
    if (pat.test(html)) throw new Error(`注入後的 HTML ${why}，違反 velora2 的 CSP 承諾`)
  }

  console.error(`卡片注入：${counts.join('、')}，全站 ${cards.length} 張卡片都是 ${CARD_CHILDREN} 個子元素`)

  if (check) {
    console.error('--check：只驗證，沒有寫出檔案')
    return
  }
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, html, 'utf8')
  console.error(`寫出 ${OUT}`)
}

await main()
