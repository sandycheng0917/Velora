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
const SECTIONS = ['fragrance', 'scarf', 'jewelry']

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
      `<span class="p2">${esc(one(p.ref))}</span></span>`
  }
  const cut = p.file.endsWith('.png') || p.file.endsWith('.cut.webp')
  return `<span class="plate${cut ? ' is-cutout' : ''}">` +
    `<img src="assets/media/${att(p.file)}" alt="${att(one(p.name.zh))}"` +
    ` loading="lazy" decoding="async" width="800" height="1000"></span>`
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

function card(p, houseName) {
  const detail =
    `<details class="more">` +
      `<summary data-en="Details &amp; specs" data-ko="상세 · 사양">明細與規格</summary>` +
      tri('p', 'say', p.say) +
      `<dl class="hall">` +
        tri('dt', '', { zh: '材質', en: 'Material', ko: '소재' }) +
        tri('dd', '', p.material) +
        tri('dt', '', { zh: '規格', en: 'Spec', ko: '사양' }) +
        tri('dd', '', p.spec) +
      `</dl>` +
    `</details>`

  const parts = [
    plate(p),
    `<p class="ref">${esc(one(p.ref))}<em>${esc(one(houseName))}</em></p>`,
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

async function loadProducts() {
  const rows = (await import(pathToFileURL(join(DATA, 'products.generated.js')).href)).default
  const { houses } = await import(pathToFileURL(join(DATA, 'site.generated.js')).href)
  const houseName = Object.fromEntries(houses.map((h) => [h.key, h.name]))

  return rows
    .filter((r) => r.listed !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((r) => ({
      id: r.id,
      ref: r.ref,
      category: r.category,
      house: houseName[r.house] || r.house,
      file: (r.files || [])[0] || '',
      name: { zh: r.name_zh, en: r.name_en, ko: r.name_ko },
      // 卡片上那句話：有標語用標語，沒有就用描述。
      // 不自動截斷描述 —— 截在半句話比整段長更難看，而且會截掉語意
      say: (r.tagline_zh || r.tagline_en || r.tagline_ko)
        ? { zh: r.tagline_zh, en: r.tagline_en, ko: r.tagline_ko }
        : { zh: r.desc_zh, en: r.desc_en, ko: r.desc_ko },
      material: { zh: r.material_zh, en: r.material_en, ko: r.material_ko },
      spec: { zh: r.spec_zh, en: r.spec_en, ko: r.spec_ko },
    }))
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
   * 手機包沒有商品，維持破折號而不是 0 —— 那一區是版面示意，
   * 標成 0 會讓人以為東西賣完了。
   */
  const perCat = {}
  for (const p of products) perCat[p.category] = (perCat[p.category] || 0) + 1
  for (const [key, n] of Object.entries(perCat).concat([['phonebag', 0]])) {
    const re = new RegExp(`(<i data-count="${key}">)[^<]*(</i>)`, 'g')
    if (!re.test(html)) continue
    const shown = n > 0 ? String(n).padStart(2, '0') : '—'
    html = html.replace(new RegExp(`(<i data-count="${key}">)[^<]*(</i>)`, 'g'), `$1${shown}$2`)
  }

  const counts = []
  for (const key of SECTIONS) {
    const list = products.filter((p) => p.category === key)
    if (!list.length) {
      throw new Error(
        `品類 ${key} 一件上架商品都沒有。\n` +
        `注入會把那一區清空，畫面上會出現一個有標題卻沒有內容的區塊。\n` +
        `如果這是刻意的，請把 ${key} 從 SECTIONS 移除並拿掉它的錨點。`)
    }
    const block = list.map((p) => '    ' + card(p, p.house)).join('\n\n')
    html = splice(html, key, block)
    counts.push(`${key} ${list.length} 件`)
  }

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
