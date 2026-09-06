/**
 * 產生器：Google Sheet → 兩個前台吃得下的資料。
 *
 *   node tools/build-catalog.mjs --from tools/fixture.json   # 離線開發
 *   node tools/build-catalog.mjs --api                       # CI 用，讀環境變數
 *
 * 零 npm 依賴。Node 22 以上內建 fetch 與 crypto。
 *
 * ── 輸出 ────────────────────────────────────────────────────────────
 *   velora-frontend/src/data/products.generated.js   商品陣列（扁平欄位）
 *   velora-frontend/src/data/site.generated.js       company / houses / categories
 *   <out>/v1/media/*.webp                            Vue 版的圖
 *   <out>/assets/media/*.webp                        velora2 的圖（根目錄）
 *
 * ── 成本絕不外流：這裡是第 2 與第 3 層 ──────────────────────────────
 *
 *   1. 資料層隔離   cost 在 products_private，匯出端點讀不到（Apps Script 端）
 *   2. 欄位白名單   ↓ 這支：逐欄挑，絕不用 {...row} 展開
 *   3. 輸出前斷言   ↓ 這支：遞迴掃描，命中 cost 形狀就 throw
 *   4. 誘餌字串     CI 對整個輸出 grep（deploy.yml）
 *   5. Sheet 保護   products_private 設保護範圍
 *
 *   第 2 層用白名單而不是黑名單，是因為黑名單擋不住「日後有人在 Sheet
 *   新增了一個叫 supplier_phone 的欄位」—— 白名單預設拒絕，新欄位要
 *   明確加進來才會輸出。
 */

import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'velora-frontend', 'src', 'data')

/* ══ 欄位白名單 ═══════════════════════════════════════════════════════
   必須與 apps-script/Setup.gs 的 COLS.products 一致。
   刻意不含 cost —— 那個欄位在另一張分頁，這裡連名字都不該出現。 */

const PUBLIC_FIELDS = [
  'id', 'ref', 'category', 'house',
  'name_zh', 'name_en', 'name_ko',
  'tagline_zh', 'tagline_en', 'tagline_ko',
  'desc_zh', 'desc_en', 'desc_ko',
  'material_zh', 'material_en', 'material_ko',
  'spec_zh', 'spec_en', 'spec_ko',
  'notes_top_zh', 'notes_top_en', 'notes_top_ko',
  'notes_mid_zh', 'notes_mid_en', 'notes_mid_ko',
  'notes_base_zh', 'notes_base_en', 'notes_base_ko',
  'hs', 'origin',
  'price', 'price_public',
  'listed', 'featured', 'order',
  'img_main', 'img_2', 'img_3',
  'updated',
]

/** 任何一個 key 命中就中止。這是白名單之外的第二道網 */
const FORBIDDEN_KEY = /^(cost|cost_ccy|cost_updated|fob|unit_?price|supplier|단가|원가)/i

const CATEGORY_ORDER = ['fragrance', 'scarf', 'jewelry', 'phonebag']

/* ══ 讀資料 ═══════════════════════════════════════════════════════════ */

async function load(args) {
  const fromIdx = args.indexOf('--from')
  if (fromIdx !== -1 && args[fromIdx + 1]) {
    const path = args[fromIdx + 1]
    return { src: path, data: JSON.parse(await readFile(path, 'utf8')) }
  }

  const url = process.env.EXEC_URL
  const key = process.env.CI_EXPORT_KEY
  if (!url || !key) {
    throw new Error(
      '需要 EXEC_URL 與 CI_EXPORT_KEY 兩個環境變數，或用 --from <fixture.json>。\n' +
      '離線開發請跑：node tools/build-catalog.mjs --from tools/fixture.json')
  }

  const post = async (body) => {
    // text/plain 是唯一能用的 Content-Type —— Apps Script 沒有 doOptions，
    // application/json 會觸發 preflight 而失敗。詳見 apps-script/Code.gs 檔頭。
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`匯出端點回 HTTP ${res.status}`)
    const j = await res.json()
    if (!j.ok) throw new Error(`匯出端點回 ${j.err}`)
    return j
  }

  const meta = await post({ op: 'export', key, part: 'meta' })

  // 影像分頁可能很大，分頁拉完
  const images = []
  for (let page = 0; ; page++) {
    const r = await post({ op: 'export', key, part: 'images', page, size: 40 })
    images.push(...r.images)
    if (!r.more) break
  }
  meta.images = images
  return { src: url.replace(/\/[^/]+$/, '/…'), data: meta }
}

/* ══ 過濾與正規化 ═════════════════════════════════════════════════════ */

/** Sheet 的核取方塊回 boolean，手打的可能是字串 */
const bool = (v) => v === true || String(v).trim().toUpperCase() === 'TRUE'
const str = (v) => (v === null || v === undefined ? '' : String(v).trim())

/**
 * 逐欄挑出白名單裡的欄位。
 * 絕不用 { ...row } —— 那會把 Sheet 上任何新增的欄位一併帶出去，
 * 包括日後某人加的 supplier_phone。
 */
function pick(row) {
  const o = {}
  for (const f of PUBLIC_FIELDS) o[f] = row[f] === undefined ? '' : row[f]
  return o
}

/**
 * 輸出前的最後一道：遞迴掃描即將寫出去的物件，
 * 任何 key 長得像成本就中止整個建置。
 *
 * 這一層防的不是「我忘了過濾」（白名單已經處理），
 * 而是「日後有人為了方便，在某個地方把整列塞了進來」。
 */
function assertNoCost(node, path = '$') {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((v, i) => assertNoCost(v, `${path}[${i}]`))
    return
  }
  for (const [k, v] of Object.entries(node)) {
    if (FORBIDDEN_KEY.test(k)) {
      throw new Error(`🔴 成本欄位出現在輸出中：${path}.${k}　建置中止。`)
    }
    assertNoCost(v, `${path}.${k}`)
  }
}

/* ══ 影像 ═════════════════════════════════════════════════════════════ */

/**
 * 把 images 分頁的列組回檔案。
 *
 * 一個 key 可能拆成多個 chunk（Sheet 單格上限 50,000 字元），
 * 依 chunk 序號串接。data 欄有 'w:' 前綴要剝掉 —— 那是為了避開
 * Google Sheets 把 + - = 開頭的儲存格當公式解析。
 */
function assembleImages(rows) {
  const byKey = new Map()
  for (const r of rows) {
    const key = str(r.key)
    if (!key) continue
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(r)
  }

  const out = new Map()
  for (const [key, parts] of byKey) {
    parts.sort((a, b) => Number(a.chunk) - Number(b.chunk))
    const total = Number(parts[0].total || parts.length)
    if (parts.length !== total) {
      throw new Error(`影像 ${key} 的 chunk 不完整：有 ${parts.length} 段，宣告 ${total} 段`)
    }
    const b64 = parts.map((p) => {
      const d = String(p.data || '')
      if (!d.startsWith('w:')) throw new Error(`影像 ${key} 的 data 少了 w: 前綴`)
      return d.slice(2)
    }).join('')

    const buf = Buffer.from(b64, 'base64')
    const sha = createHash('sha256').update(buf).digest('hex')
    const want = str(parts[0].sha256)
    // 端到端校驗：chunk 順序錯亂、遺漏、被 Sheets 改寫，都在這裡被抓到，
    // 而不是變成網站上的破圖
    if (want && sha !== want) {
      throw new Error(`影像 ${key} 雜湊不符：Sheet 記 ${want.slice(0, 12)}…，實得 ${sha.slice(0, 12)}…`)
    }
    out.set(key, { buf, sha, alpha: bool(parts[0].alpha), mime: str(parts[0].mime) || 'image/webp' })
  }
  return out
}

/**
 * WebP 容器有沒有 alpha 通道。零依賴，直接讀標頭。
 *
 * 判定 alpha 是為了決定要不要套 .plate.is-cutout（去背圖用 contain、
 * 淺底、不壓暗角）。前台原本靠副檔名 .png 判斷，換成 WebP 之後那招失效，
 * 所以改成把判定結果編進檔名（.cut.webp）。
 *
 * 以這裡讀出來的為準，不信 Sheet 的 alpha 欄 —— 瀏覽器端的偵測可能因為
 * canvas 被跨域污染而失敗。
 */
function webpHasAlpha(buf) {
  if (buf.length < 32) return false
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return false
  const fourcc = buf.toString('ascii', 12, 16)
  if (fourcc === 'VP8X') return (buf[20] & 0x10) !== 0   // 擴充格式的 ALPHA flag
  if (fourcc === 'VP8 ') return false                    // 有損簡單格式，定義上無 alpha
  if (fourcc === 'VP8L') return ((buf[24] >> 4) & 1) !== 0
  return false
}

/**
 * 檔名用內容定址：<id>-<slot>-<sha8>[.cut].webp
 *
 * 內容沒變 → 檔名沒變 → 瀏覽器與 CDN 完全命中快取。
 * 內容變了 → 檔名必變 → 立刻失效。
 * 這在 GitHub Pages 上特別重要：它送 Cache-Control: max-age=600，
 * 固定檔名的圖片改版後最多要等十分鐘才會更新。
 */
/** mime → 副檔名。Sheet 的 images 分頁有 mime 欄，那是唯一可靠的來源 */
const MIME_EXT = {
  'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
}

function imageFileName(key, sha, alpha, ext = 'webp') {
  return `${key}-${sha.slice(0, 8)}${alpha ? '.cut' : ''}.${ext}`
}

/* ══ 主流程 ═══════════════════════════════════════════════════════════ */

async function main() {
  const args = process.argv.slice(2)
  const outIdx = args.indexOf('--out')
  const OUT = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : join(ROOT, 'build', 'site')

  const { src, data } = await load(args)
  console.error(`資料來源：${src}`)

  // 🔴 斷言要放在白名單「之前」。
  //
  // 放在後面的話它永遠不會觸發 —— 白名單已經把 cost 丟掉了，
  // 斷言只會看到乾淨的資料。實測確認過：注入 cost 欄位，建置照樣成功。
  // 那是一道不可達的防線，比沒有防線更糟，因為它讓人以為有在保護。
  //
  // 放在前面，它擋的就是真正該擋的威脅：匯出端點開始回傳它不該回傳的東西
  // （程式被改、部署到錯的版本、或有人把 products_private 併進 products）。
  // 那種情況下白名單仍然會過濾掉，網站不會外洩 —— 但我們會想立刻知道，
  // 而不是靜靜地繼續建置。
  assertNoCost(data, 'export')

  /*
   * 不顯示的品牌。
   *
   * houses 分頁的 listed 控制的是**品牌要不要露出**，不是商品的上下架。
   * 取消勾選之後：品牌館少一塊、商品卡上的品牌名不再出現，
   * 但那些商品照樣在架上 —— 它們只是變成「沒有掛品牌」的商品。
   *
   * 🔴 2026-09-07 改過語意。原本是整包排除，暫停 SAINTMARI 會讓 8 件
   *    絲巾與飾品從網站上消失，整個品類區塊跟著不見。那不是使用者要的：
   *    「我只是沒有要顯示品牌而已，並沒有說商品要下架。」
   *
   * 本來就沒填 house 的商品一直都是這樣運作的，所以這不是新行為，
   * 只是讓「隱藏品牌」跟「本來就沒品牌」走同一條路。
   */
  const houseOff = new Set(
    (data.houses || [])
      .filter((h) => 'listed' in h && !bool(h.listed))
      .map((h) => str(h.key))
  )
  if (houseOff.size) {
    console.error(`品牌不露出：${[...houseOff].join('、')}（商品留在架上，只是不掛品牌）`)
  }

  // ── 商品：白名單 → 正規化 ───────────────────────────────────────
  const rows = (data.products || [])
    .map(pick)
    .filter((r) => str(r.id))
    .map((r) => {
      // 不露出的品牌：把 house 留白。前台從此看不到品牌名，也不會出現
      // 指向一個不存在品牌的斷鏈（site.generated.js 只含要露出的品牌）。
      const house = houseOff.has(str(r.house)) ? '' : str(r.house)
      const o = {
        id: str(r.id), ref: str(r.ref), category: str(r.category), house,
        hs: str(r.hs), origin: str(r.origin) || 'KR',
        listed: bool(r.listed), featured: bool(r.featured),
        order: Number(r.order) || 0,
        updated: str(r.updated),
        images: [str(r.img_main), str(r.img_2), str(r.img_3)].filter(Boolean),
      }
      for (const base of ['name', 'tagline', 'desc', 'material', 'spec']) {
        for (const lang of ['zh', 'en', 'ko']) o[`${base}_${lang}`] = str(r[`${base}_${lang}`])
      }
      for (const part of ['top', 'mid', 'base']) {
        for (const lang of ['zh', 'en', 'ko']) o[`notes_${part}_${lang}`] = str(r[`notes_${part}_${lang}`])
      }
      // 🔴 price_public 為 FALSE 時，price 連輸出都不產生 ——
      // 不是「輸出但前端不顯示」。沒有被輸出的東西不可能被看到。
      if (bool(r.price_public) && str(r.price)) o.price = Number(r.price)
      return o
    })
    .sort((a, b) => {
      const ca = CATEGORY_ORDER.indexOf(a.category), cb = CATEGORY_ORDER.indexOf(b.category)
      return ca !== cb ? ca - cb : a.order - b.order
    })

  if (!rows.length) throw new Error('匯出的商品是空的 —— 中止，不要產生一個沒有商品的網站')

  // ── 影像 ────────────────────────────────────────────────────────
  const assembled = assembleImages(data.images || [])

  /*
   * repo 素材的退路 —— **只在離線開發時生效**。
   *
   * 用 --from fixture.json 跑的時候（本機沒有 CI 金鑰），圖片得從 repo 拿，
   * 否則 npm run dev 是一片空白。但**接真的匯出端點時絕不退回** ——
   * 那時 Sheet 就是唯一的來源，缺圖必須讓建置失敗。
   *
   * 沒有這個區分的話，Sheet 是空的、建置照樣成功、網站照樣有圖，
   * 而沒有人會發現「資料其實不在 Sheet 裡」。那是最糟的一種靜默成功。
   */
  const offline = args.includes('--from')
  let legacy = {}
  const legacyPath = join(ROOT, 'tools', 'images.json')
  if (offline && existsSync(legacyPath)) {
    for (const e of JSON.parse(await readFile(legacyPath, 'utf8'))) legacy[e.key] = e.path
  }

  // v1 的圖直接寫進 velora-frontend/public/media —— Vite 會原樣複製到 dist，
  // 所以 npm run build 就產出完整的 v1，deploy.yml 不必再多一步搬檔。
  //
  // 檔名是內容定址的（<id>-<slot>-<sha8>），內容沒變檔名就沒變，
  // 所以這些檔案進版控也不會每次建置都產生 diff，而且離線 npm run dev
  // 立刻有圖可看。velora2 沒有建置流程，仍然寫到 <out>。
  const mediaDirs = [
    join(ROOT, 'velora-frontend', 'public', 'media'),
    // velora2 從 2026-09-07 起放在網址根目錄，不再是 /v2/ ——
    // 這一行忘了跟著改的話，圖片會寫進一個沒有人讀的目錄，
    // 而卡片的 <img src> 全部對不到檔案（實際發生過，13 張全破）
    join(OUT, 'assets', 'media'),
  ]
  for (const d of mediaDirs) await mkdir(d, { recursive: true })

  const fileFor = new Map()   // key → 檔名
  const stats = { sheet: 0, legacy: 0, missing: 0 }
  const orphans = []

  for (const row of rows) {
    for (const key of row.images) {
      if (fileFor.has(key)) continue

      if (assembled.has(key)) {
        const { buf, mime } = assembled.get(key)
        // 副檔名照 mime 走，不要假設一定是 WebP —— 後台在 Safari 16.4
        // 以前的瀏覽器會退回 JPEG，那時存進 Sheet 的就是 JPEG 位元組。
        // 副檔名寫 .webp 而內容是 JPEG，多數瀏覽器會嗅探後照樣顯示，
        // 但那是「剛好能動」，不是對的
        const ext = MIME_EXT[mime] || 'webp'
        const alpha = ext === 'webp' ? webpHasAlpha(buf) : ext === 'png'
        const name = imageFileName(key, createHash('sha256').update(buf).digest('hex'), alpha, ext)
        for (const d of mediaDirs) await writeFile(join(d, name), buf)
        fileFor.set(key, name)
        stats.sheet++
        continue
      }

      if (legacy[key]) {
        const abs = join(ROOT, 'velora-frontend', 'public', legacy[key].replace(/^\//, ''))
        if (existsSync(abs)) {
          const buf = await readFile(abs)
          const sha = createHash('sha256').update(buf).digest('hex')
          const ext = legacy[key].split('.').pop().toLowerCase()
          // 既有素材沿用原本的判準：build-assets.py 會把沒有透明像素的圖
          // 轉存成 JPEG，所以 .png 就代表去背圖
          const name = imageFileName(key, sha, ext === 'png', ext)
          for (const d of mediaDirs) await copyFile(abs, join(d, name))
          fileFor.set(key, name)
          stats.legacy++
          continue
        }
      }

      stats.missing++
      // 在這裡記下來。下面那個迴圈會 delete row.images，
      // 等到最後才想找是哪幾張就找不到了 —— 錯誤訊息說不出哪裡壞，
      // 價值就少一半
      orphans.push(`${row.id} → ${key}`)
    }
  }

  // 把影像鍵換成實際檔名；沒有圖的留空，前台會顯示「製版中」空版
  for (const row of rows) {
    row.files = row.images.map((k) => fileFor.get(k) || null).filter(Boolean)
    delete row.images
  }

  // ── 輸出前再驗一次 ──────────────────────────────────────────────
  // 上面已經對原始 payload 驗過，這裡是針對「白名單之後又被加工過」的路徑：
  // 產生器日後長大時，中間可能出現新的合併或補值步驟。
  assertNoCost(rows, 'products.generated')

  // ── 寫檔 ────────────────────────────────────────────────────────
  const banner = (what) =>
    `/**\n * ${what}\n *\n` +
    ` * 由 tools/build-catalog.mjs 從 Google Sheet 產生，請勿手動編輯 ——\n` +
    ` * 下次建置就會被覆蓋。要改內容請改 Sheet。\n` +
    ` *\n * 產生時間：${new Date().toISOString()}\n */\n\n`

  await writeFile(join(DATA, 'products.generated.js'),
    banner('商品資料（扁平欄位，由 catalog.js 組成前台要的形狀）') +
    'export default ' + JSON.stringify(rows, null, 2) + '\n', 'utf8')

  const site = {
    houses: (data.houses || []).filter((h) => !houseOff.has(str(h.key))).map((h) => ({
      key: str(h.key), name: str(h.name), nameKo: str(h.name_ko),
      country: { zh: str(h.country_zh), en: str(h.country_en), ko: str(h.country_ko) },
      tagline: str(h.tagline),
      intro: { zh: str(h.intro_zh), en: str(h.intro_en), ko: str(h.intro_ko) },
    })),
    categories: (data.categories || []).map((c) => ({
      key: str(c.key), code: str(c.code), ref: str(c.ref),
      // name 給前台導覽列（長）、short 給後台頁籤（短）。舊的 Sheet 沒有
      // short_* 三欄，退回 name_* —— 這樣舊表也不會產生空白頁籤
      name: { zh: str(c.name_zh), en: str(c.name_en), ko: str(c.name_ko) },
      short: {
        zh: str(c.short_zh) || str(c.name_zh),
        en: str(c.short_en) || str(c.name_en),
        ko: str(c.short_ko) || str(c.name_ko),
      },
      // 相對路徑存在 Sheet 裡，站台前綴由 catalog.js 的 url() 補
      cover: str(c.cover),
      order: Number(c.order) || 0,
    })).sort((a, b) => a.order - b.order),
  }
  assertNoCost(site, 'site.generated')
  await writeFile(join(DATA, 'site.generated.js'),
    banner('品牌與品類') +
    'export const houses = ' + JSON.stringify(site.houses, null, 2) + '\n\n' +
    'export const categories = ' + JSON.stringify(site.categories, null, 2) + '\n', 'utf8')

  // ── 摘要（走 stderr，不干擾管線）────────────────────────────────
  const byCat = {}
  rows.forEach((r) => { byCat[r.category] = (byCat[r.category] || 0) + 1 })
  console.error('')
  console.error(`商品 ${rows.length} 件：` + Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join('、'))
  console.error(`上架 ${rows.filter((r) => r.listed).length} 件、精選 ${rows.filter((r) => r.featured).length} 件`)
  console.error(`影像 ${fileFor.size} 張（Sheet ${stats.sheet}、既有素材 ${stats.legacy}）` +
    (stats.missing ? `，${stats.missing} 個影像鍵找不到圖 → 顯示製版中空版` : ''))
  /*
   * 有影像鍵卻拿不到位元組 —— 這在畫面上會變成「圖片製版中」的空版，
   * 看起來像刻意的設計，實際上是資料掉了。接真端點時一律失敗。
   */
  if (stats.missing && !offline) {
    throw new Error(
      `有 ${stats.missing} 個影像鍵在 Sheet 的 images 分頁裡找不到位元組：\n  ` +
      orphans.slice(0, 10).join('\n  ') +
      `\n\n這些商品在網站上會變成「圖片製版中」的空版 —— 看起來像設計，其實是資料掉了。\n` +
      `到 Apps Script 執行 checkImages 看 Sheet 裡實際有幾張，缺的用 seedImages 或從後台補上。`)
  }

  const withPrice = rows.filter((r) => r.price !== undefined).length
  console.error(`售價：${withPrice} 件有輸出（其餘 price_public 未勾選，連欄位都不產生）`)
  console.error(`寫出 ${join(DATA, 'products.generated.js')}`)
  console.error(`寫出 ${join(DATA, 'site.generated.js')}`)
  console.error(`影像寫入 ${mediaDirs.join('  ')}`)
}

/*
 * 失敗時同時用 GitHub Actions 的 ::error:: 格式印一份。
 *
 * 沒有這一段的話，錯誤只留在原始日誌裡，而摘要頁與 API 只看得到
 * 「Process completed with exit code 1」—— 要查哪裡壞掉得點進去、
 * 展開步驟、往下捲。訊息寫得再清楚，看不到就等於沒寫。
 *
 * %0A 是 Actions 的換行跳脫；直接送 \n 會讓註記只剩第一行。
 */
main().catch((e) => {
  const msg = String((e && e.message) || e)
  console.error('\n✗ ' + msg)
  if (process.env.GITHUB_ACTIONS) {
    console.log('::error::' + msg.replace(/\r?\n/g, '%0A'))
  }
  process.exit(1)
})
