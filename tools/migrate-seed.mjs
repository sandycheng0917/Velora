/**
 * 一次性遷移：把現有 catalog.js 的商品匯出成可貼進 Google Sheet 的 TSV。
 *
 *   node tools/migrate-seed.mjs            # 印到畫面
 *   node tools/migrate-seed.mjs --out X    # 寫成檔案（products.tsv / private.tsv）
 *
 * 貼法：開 products 分頁 → 點 A2 → 貼上。TSV 的分欄會自動落到正確的欄位。
 *
 * ── 只灌真實商品 ────────────────────────────────────────────────────
 * catalog.js 宣告了 13 個絲巾 SKU、7 個耳環…，但 media-manifest.js 裡
 * 只有部分有照片，沒照片的在 catalog.js 就被 continue 掉了。
 * 這裡沿用同一個判準：products 陣列裡有的才是真實商品。
 * velora2 的手機包三件是版面示意（README 有明講），本來就不在 catalog.js。
 *
 * ── FEATURED 覆寫要寫回去，不能丟 ──────────────────────────────────
 * catalog.js 的 FEATURED 常數對三件商品覆寫了 name 與 desc，
 * 例如 scarf-1 被改名為「象牙真絲長巾」而不是程式生成的「真絲長巾 No.01」。
 * 那是有人實際寫過的文案，是資料不是裝飾。遷移時把覆寫後的值寫進 Sheet，
 * 覆寫機制本身就可以退場（品名改成手填之後它就多餘了）。
 */

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'velora-frontend', 'src', 'data')

/** 必須與 apps-script/Setup.gs 的 COLS.products 逐字相同、順序一致 */
const PRODUCT_COLS = [
  'id', 'ref', 'category', 'house',
  'name_zh', 'name_en', 'name_ko',
  'tagline_zh', 'tagline_en', 'tagline_ko',
  'desc_zh', 'desc_en', 'desc_ko',
  'material_zh', 'material_en', 'material_ko',
  'spec_zh', 'spec_en', 'spec_ko',
  'notes_top_zh', 'notes_top_en', 'notes_top_ko',
  'notes_mid_zh', 'notes_mid_en', 'notes_mid_ko',
  'notes_base_zh', 'notes_base_en', 'notes_base_ko',
  'hs', 'origin', 'price', 'price_public',
  'listed', 'featured', 'order',
  'img_main', 'img_2', 'img_3',
  'updated', 'deleted',
]

/**
 * 品類對照：catalog.js 的舊分類 → Sheet 的分類。
 *
 * 舊的 catalog.js 分四類：fragrance / scarf / jewelry / accessory（絲巾扣）。
 * velora2 改成 fragrance / scarf / jewelry / phonebag，把絲巾扣併進飾品 ——
 * README 有寫明理由：「飾品」是戴在身上的，「手機包」是背在身上的，
 * 兩個詞不會互相吃掉；如果留一類叫「配件」，讀者會問手機包為什麼不在裡面。
 *
 * Sheet 的下拉綁的是 velora2 那四類，所以沒對照就會違反資料驗證，
 * 而且是貼上之後才發現。
 */
const CATEGORY_MAP = { accessory: 'jewelry' }

/** Sheet 的 categories 分頁種子。必須與 apps-script/Setup.gs 的 SEED_CATEGORIES 一致 */
const VALID_CATEGORIES = ['fragrance', 'scarf', 'jewelry', 'phonebag']

/**
 * 後台篩選頁籤用的短名。前台導覽列用長名（catalog.js 裡那組）。
 *
 * 兩組是刻意不同的：前台的「純銀飾品」講得出材質，後台頁籤橫向空間有限，
 * 長名字會把搜尋框擠掉。必須與 Setup.gs 的 SEED_CATEGORIES 第 7–9 欄一致。
 */
const HOUSE_KO = { vuca: '부카', saintmari: '세인트메리' }

const SHORT_NAMES = {
  fragrance: { zh: '香氛', en: 'Fragrance', ko: '프래그런스' },
  scarf: { zh: '絲巾', en: 'Scarves', ko: '스카프' },
  jewelry: { zh: '飾品', en: 'Jewelry', ko: '주얼리' },
  phonebag: { zh: '手機包', en: 'Phone bags', ko: '폰백' },
}

/**
 * catalog.js 是 Vite 模組，用了 import.meta.env.BASE_URL —— 純 node 跑不動。
 * 複製一份到暫存目錄、把那個表達式換成 '/'，再從暫存匯入。
 * 不直接改原始檔：那會弄髒工作目錄，而且這支是一次性工具。
 */
async function loadCatalog() {
  const tmp = join(tmpdir(), 'velora-migrate-' + Date.now())
  await mkdir(tmp, { recursive: true })

  const src = await readFile(join(DATA, 'catalog.js'), 'utf8')
  const patched = src.replace(/import\.meta\.env\.BASE_URL/g, "'/'")
  await writeFile(join(tmp, 'catalog.js'), patched)
  // 相對匯入要找得到，manifest 也複製一份過去
  await writeFile(join(tmp, 'media-manifest.js'),
    await readFile(join(DATA, 'media-manifest.js'), 'utf8'))

  const mod = await import(pathToFileURL(join(tmp, 'catalog.js')).href)
  await rm(tmp, { recursive: true, force: true })
  return mod
}

/** 三語欄位取值。catalog.js 有些欄位是 null（飾品沒有 tagline / notes） */
const tri = (field, lang) => {
  if (field == null) return ''
  if (typeof field === 'string') return lang === 'zh' ? field : ''
  return field[lang] || ''
}

/** 香調是三語各一個陣列，Sheet 存成分號分隔的一格 */
const notes = (n, part, lang) => {
  if (!n || !n[part]) return ''
  const arr = n[part][lang]
  return Array.isArray(arr) ? arr.join(';') : ''
}

/**
 * 圖片路徑 → 影像鍵。
 * 鍵要穩定且看得出是誰的圖，所以用「商品 id + 槽位」。
 * 實際的位元組由 seed-images 那一步寫進 images 分頁。
 */
const imgKey = (id, slot, path) => (path ? `${id}-${slot}` : '')

/** TSV 的儲存格：Sheet 貼上時 tab 分欄、換行分列，所以這兩個必須清掉 */
const cell = (v) => {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return String(v).replace(/[\t\r\n]+/g, ' ').trim()
}

/**
 * 產生 apps-script/Seed.gs —— 一支可以直接在 Apps Script 執行的灌資料函式。
 *
 * 為什麼不叫使用者貼 TSV：Google Sheets 貼 TSV 時，只要有一格含 tab 或換行
 * 就會整列錯位，而且錯位後看起來仍然「有資料」，要逐欄比對才發現。
 * 用程式寫入是逐欄指定的，不存在對齊問題，而且可以在寫入前檢查 id 是否已存在。
 */
function renderSeedGs(rows, cols) {
  const js = (v) => JSON.stringify(v === undefined || v === null ? '' : v)
  const body = rows.map((r) =>
    '  [' + cols.map((c) => {
      const v = r[c]
      return typeof v === 'boolean' ? String(v) : js(v)
    }).join(', ') + ']'
  ).join(',\n')

  return `/**
 * 一次性灌入既有商品（由 tools/migrate-seed.mjs 產生，請勿手動編輯）。
 *
 * 用法：函式下拉選 seedProducts → 執行 → 看執行紀錄。
 *
 * 來源是 velora-frontend/src/data/catalog.js 的 products 陣列，
 * 只含真的有照片的 ${rows.length} 件（沒照片的 SKU 在 catalog.js 就已被排除）。
 * velora2 的手機包三件是版面示意，不在來源裡，也不會被灌進來。
 *
 * catalog.js 的 FEATURED 覆寫已經併入 —— 例如 scarf-1 的品名是
 * 手寫的「象牙真絲長巾」而不是程式生成的「真絲長巾 No.01」。
 *
 * 可以重複執行：已存在的 id 會被跳過，不會產生重複列，也不會覆蓋你之後的編輯。
 * 圖片不在這裡，images 分頁由另一步寫入。
 */

var SEED_PRODUCTS = [
${body}
];

function seedProducts() {
  var ss = openBook_();
  var sh = ss.getSheetByName('products');
  if (!sh) throw new Error('找不到 products 分頁，請先執行 setupSheets。');

  // 欄數對不上就停 —— 繼續寫下去會整張表錯位，而錯位的表看起來是有資料的
  var header = sh.getRange(1, 1, 1, ${cols.length}).getValues()[0];
  var want = ${JSON.stringify(cols)};
  for (var i = 0; i < want.length; i++) {
    if (String(header[i]) !== want[i]) {
      throw new Error('欄位不符：第 ' + (i + 1) + ' 欄應為 ' + want[i] +
        '，實為「' + header[i] + '」。請先重跑 setupSheets。');
    }
  }

  // 🔴 附加位置用 lastIdRow_（定義在 Setup.gs），不要用 getLastRow()。
  // getLastRow() 把「套了核取方塊驗證的空儲存格」也算成有內容，
  // 實測資料只有 13 列時它會回 501 —— 拿它當附加位置，新商品會被寫到
  // 第 502 列，中間留下一大段空白，而且每次新增都更嚴重。
  var lastRow = lastIdRow_(sh);
  var existing = lastRow > 1
    ? sh.getRange(2, 1, lastRow - 1, 1).getValues().map(function (r) { return String(r[0]); })
    : [];

  var add = SEED_PRODUCTS.filter(function (row) { return existing.indexOf(row[0]) === -1; });
  var skipped = SEED_PRODUCTS.length - add.length;

  if (add.length) {
    ensureRows_(sh, lastRow + add.length + 1);
    sh.getRange(lastRow + 1, 1, add.length, want.length).setValues(add);
    SpreadsheetApp.flush();
  }

  var msg = '灌入 ' + add.length + ' 件商品' +
    (skipped ? '，跳過已存在的 ' + skipped + ' 件' : '') +
    '。\\n目前 products 共 ' + (lastIdRow_(sh) - 1) + ' 件（第 2–' + lastIdRow_(sh) + ' 列）。';
  Logger.log(msg);
  return msg;
}
`
}

async function main() {
  const cat = await loadCatalog()
  const { products, featured } = cat

  // FEATURED 的覆寫要合併回商品本體，否則「象牙真絲長巾」這種手寫文案會消失
  const overrides = new Map(featured.map((f) => [f.id, f]))
  const featuredIds = new Set(featured.map((f) => f.id))

  const rows = products.map((p) => {
    const o = overrides.get(p.id)
    const name = (o && o.name) || p.name
    const desc = (o && o.desc) || p.desc
    const gallery = p.gallery || []

    const r = {
      id: p.id,
      ref: p.ref,
      category: CATEGORY_MAP[p.category] || p.category,
      house: p.house,
      name_zh: tri(name, 'zh'), name_en: tri(name, 'en'), name_ko: tri(name, 'ko'),
      tagline_zh: tri(p.tagline, 'zh'), tagline_en: tri(p.tagline, 'en'), tagline_ko: tri(p.tagline, 'ko'),
      desc_zh: tri(desc, 'zh'), desc_en: tri(desc, 'en'), desc_ko: tri(desc, 'ko'),
      material_zh: tri(p.material, 'zh'), material_en: tri(p.material, 'en'), material_ko: tri(p.material, 'ko'),
      spec_zh: tri(p.spec, 'zh'), spec_en: tri(p.spec, 'en'), spec_ko: tri(p.spec, 'ko'),
      notes_top_zh: notes(p.notes, 'top', 'zh'),
      notes_top_en: notes(p.notes, 'top', 'en'),
      notes_top_ko: notes(p.notes, 'top', 'ko'),
      notes_mid_zh: notes(p.notes, 'middle', 'zh'),
      notes_mid_en: notes(p.notes, 'middle', 'en'),
      notes_mid_ko: notes(p.notes, 'middle', 'ko'),
      notes_base_zh: notes(p.notes, 'base', 'zh'),
      notes_base_en: notes(p.notes, 'base', 'en'),
      notes_base_ko: notes(p.notes, 'base', 'ko'),
      hs: p.hs || '',
      origin: 'KR',
      // 成本與售價都不在 catalog.js（那是刻意的機密邊界），留空由後台填
      price: '',
      price_public: false,
      listed: p.listed !== false,
      featured: featuredIds.has(p.id),
      order: p.order,
      img_main: imgKey(p.id, 'main', gallery[0]),
      img_2: imgKey(p.id, '2', gallery[1]),
      img_3: imgKey(p.id, '3', gallery[2]),
      updated: p.updated,
      deleted: false,
    }
    // 圖片路徑另外留給 seed-images 用，不進 TSV
    r.__paths = gallery.slice(0, 3)
    return r
  })

  // 欄位漏寫的話這裡會抓到 —— Sheet 貼上時欄位錯位是最難察覺的錯
  const missing = PRODUCT_COLS.filter((c) => !(c in rows[0]))
  if (missing.length) throw new Error('欄位缺漏：' + missing.join(', '))

  // 品類必須是 Sheet 下拉裡真的存在的值。
  // 貼上一個不存在的品類，Google Sheets 會標紅但仍然貼進去，
  // 然後產生器會產出一個前台找不到分區的商品 —— 在這裡擋掉。
  const badCat = [...new Set(rows.map((r) => r.category))]
    .filter((c) => !VALID_CATEGORIES.includes(c))
  if (badCat.length) {
    throw new Error(
      `品類不在 Sheet 的選項內：${badCat.join(', ')}\n` +
      `Sheet 只有：${VALID_CATEGORIES.join(', ')}\n` +
      `要嘛在 CATEGORY_MAP 加對照，要嘛在 Setup.gs 的 SEED_CATEGORIES 加一類。`)
  }

  // 每一列的欄數必須完全一致，否則貼進 Sheet 會整列錯位
  const widths = new Set(rows.map((r) => PRODUCT_COLS.length))
  if (widths.size !== 1) throw new Error('列寬不一致')

  const tsv = rows.map((r) => PRODUCT_COLS.map((c) => cell(r[c])).join('\t')).join('\n')

  // 影像清單另存，供下一步（把 base64 寫進 images 分頁）使用
  const imgs = []
  for (const r of rows) {
    r.__paths.forEach((p, i) => {
      imgs.push({ key: `${r.id}-${i === 0 ? 'main' : String(i + 1)}`, path: p })
    })
  }

  const args = process.argv.slice(2)
  const outIdx = args.indexOf('--out')
  const gsIdx = args.indexOf('--gs')
  const fixIdx = args.indexOf('--fixture')

  if (fixIdx !== -1) {
    // 產生一份與 op:'export', part:'meta' 回傳格式「完全相同」的假資料。
    //
    // 這樣產生器可以離線開發與測試，不需要 CI_EXPORT_KEY —— 那是使用者的秘密，
    // 我不該持有。而且格式相同代表「用假資料測過」等於「接上真的也會動」，
    // 不是兩套各自為政的路徑。
    const next = args[fixIdx + 1]
    const path = next && !next.startsWith('--') ? next : join(ROOT, 'tools', 'fixture.json')
    const obj = {
      ok: true,
      ver: 'fixture',
      at: new Date().toISOString(),
      // Sheet 的核取方塊回傳的是真的 boolean，字串欄位回傳字串 —— 照著模擬
      products: rows.map((r) => {
        const o = {}
        for (const c of PRODUCT_COLS) o[c] = r[c] === undefined ? '' : r[c]
        return o
      }),
      // 品牌與品類直接從 catalog.js 現有的值長出來，不另外手打一份。
      //
      // 這裡本來是手寫的，intro 三欄留空 —— 結果 check-regression 對著這份假資料
      // 報了六項「品牌簡介會消失」，但真正的 Sheet（SEED_HOUSES）根本有值。
      // 假資料跟真資料不一致的成本不是「測不到」，是「測出假的問題」，
      // 那會讓人開始不信任檢查工具，比沒有檢查更糟。
      houses: Object.values(cat.houses).map((h) => ({
        key: h.key,
        name: h.name,
        // catalog.js 只有 saintmari 有韓文品牌名，Sheet 的 SEED_HOUSES 兩個都有。
        // fixture 要跟 Sheet 一致，否則檢查工具會對著假資料報假問題
        name_ko: h.nameKo || HOUSE_KO[h.key] || '',
        country_zh: h.country.zh, country_en: h.country.en, country_ko: h.country.ko,
        tagline: h.tagline,
        intro_zh: h.intro?.zh || '', intro_en: h.intro?.en || '', intro_ko: h.intro?.ko || '',
      })),
      // 短名（後台頁籤用）沒有前身，catalog.js 只有一組名字 —— 這裡照 SEED_CATEGORIES
      // 的對應補上。cover 去掉站台前綴存相對路徑，前綴由產生器依 v1/v2 補。
      categories: cat.categories
        .filter((c) => CATEGORY_MAP[c.key] === undefined || CATEGORY_MAP[c.key] === c.key)
        .map((c, i) => ({
          key: c.key, code: c.code, ref: c.ref,
          name_zh: c.name.zh, name_en: c.name.en, name_ko: c.name.ko,
          short_zh: SHORT_NAMES[c.key]?.zh || c.name.zh,
          short_en: SHORT_NAMES[c.key]?.en || c.name.en,
          short_ko: SHORT_NAMES[c.key]?.ko || c.name.ko,
          cover: String(c.cover || '').replace(/^.*(\/media\/)/, '$1'),
          order: i + 1,
        }))
        .concat([{
          key: 'phonebag', code: 'PHONEBAG', ref: 'BAG',
          name_zh: '手機包', name_en: 'Phone bags', name_ko: '폰백',
          short_zh: '手機包', short_en: 'Phone bags', short_ko: '폰백',
          cover: '', order: 4,
        }]),
    }
    await writeFile(path, JSON.stringify(obj, null, 2), 'utf8')
    console.log(`已寫出 ${path}（${obj.products.length} 件商品，格式同 export/meta）`)
  }

  if (gsIdx !== -1) {
    // 下一個引數若是另一個旗標就不是路徑 —— 否則 `--gs --out X` 會把
    // 「--out」當成輸出檔名，在工作目錄留下一個叫 --out 的檔案
    const next = args[gsIdx + 1]
    const path = next && !next.startsWith('--') ? next : join(ROOT, 'apps-script', 'Seed.gs')
    await writeFile(path, renderSeedGs(rows, PRODUCT_COLS), 'utf8')
    console.log(`已寫出 ${path}（${rows.length} 件商品）`)
  }

  if (outIdx !== -1 && args[outIdx + 1]) {
    const dir = args[outIdx + 1]
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'products.tsv'), tsv, 'utf8')
    await writeFile(join(dir, 'images.json'), JSON.stringify(imgs, null, 2), 'utf8')
    console.log(`已寫出 ${join(dir, 'products.tsv')}（${rows.length} 列）`)
    console.log(`已寫出 ${join(dir, 'images.json')}（${imgs.length} 張圖）`)
  }

  // 沒指定任何輸出目標時才把 TSV 印到畫面。
  // 少判斷一個旗標的話，`--fixture` 會在寫檔的同時也把 13 列 TSV 灌進終端機
  if (outIdx === -1 && gsIdx === -1 && fixIdx === -1) console.log(tsv)

  // 摘要走 stderr，這樣 `> products.tsv` 導向時不會混進資料
  const byCat = {}
  rows.forEach((r) => { byCat[r.category] = (byCat[r.category] || 0) + 1 })
  console.error('\n──── 摘要 ────')
  console.error(`商品 ${rows.length} 件：` +
    Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join('、'))
  console.error(`上架 ${rows.filter((r) => r.listed).length} 件、` +
    `未上架 ${rows.filter((r) => !r.listed).length} 件、` +
    `精選 ${rows.filter((r) => r.featured).length} 件`)
  console.error(`影像 ${imgs.length} 張`)
  const noKo = rows.filter((r) => !r.name_ko)
  const noEn = rows.filter((r) => !r.name_en)
  if (noEn.length) console.error(`⚠ 缺英文品名：${noEn.map((r) => r.id).join(', ')}`)
  if (noKo.length) console.error(`⚠ 缺韓文品名：${noKo.map((r) => r.id).join(', ')}`)
  const ov = rows.filter((r) => overrides.has(r.id))
  console.error(`FEATURED 覆寫已併入：${ov.map((r) => r.id + '→' + r.name_zh).join('、')}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
