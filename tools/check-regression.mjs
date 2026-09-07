/**
 * 內容退化檢查：把 Sheet 產生的資料，跟改版前寫死在 catalog.js 裡的資料逐欄比對。
 *
 * 為什麼需要這支：
 * 把資料從寫死改成 Sheet 驅動時，最危險的不是「壞掉」而是「變空」——
 * 少一段品牌簡介、品類名稱從「居家香氛」變成「香氛」，建置照樣成功、
 * 型別照樣正確、測試照樣通過，只有上線後才看得出來，而且不容易注意到。
 *
 * 這支的工作只有一件：**列出所有變差的欄位**。
 *   · 舊的有值、新的空了      → ✗ 一定要修
 *   · 舊的有值、新的不一樣    → ⚠ 要確認是刻意改的
 *   · 舊的沒有、新的有        → ＋ 純粹是新增
 *
 * 用法：
 *   node tools/check-regression.mjs
 *
 * 離線可跑，不需要 Sheet、也不需要 git —— 它比的是
 *   tools/baseline.json（改版前的內容快照）
 * 對上
 *   src/data/*.generated.js（這次建置產生的內容）
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const DATA = join(ROOT, 'velora-frontend', 'src', 'data')

/**
 * 「改版前」的基準線。
 *
 * 🔴 第一版是 `git show HEAD:...catalog.js`，那是錯的 ——
 *    基準線不能是會移動的東西。改版一 commit 進去，HEAD 上的 catalog.js
 *    就變成介面層了，而介面層會去 import 產生的檔案，
 *    載入時直接 ERR_MODULE_NOT_FOUND。就算沒炸，也會變成拿新的比新的，
 *    永遠通過 —— 那是更糟的失敗方式，因為看起來像成功。
 *
 *    改成固定的快照檔（tools/baseline.json，取自 commit 161906b）。
 *    它不隨任何東西移動，也不需要 git 才能跑。
 *
 * 什麼時候該更新這個檔案：**幾乎不該**。它記錄的是「Sheet 化之前，
 * 網站上確實有的內容」。如果哪天刻意要移除某些內容，把差異登記到
 * ACCEPTED 裡並寫下理由，不要去改基準線 —— 改了就沒有基準了。
 */
async function loadOld() {
  const path = join(ROOT, 'tools', 'baseline.json')
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    console.error(`✗ 找不到基準線 ${path}。這個檔案要進版控。`)
    process.exit(2)
  }
  const b = JSON.parse(raw)
  return {
    products: b.products,
    categories: b.categories,
    houses: b.houses,
    _at: b.at,
  }
}

async function loadNew() {
  const products = (await import(pathToFileURL(join(DATA, 'products.generated.js')).href)).default
  const site = await import(pathToFileURL(join(DATA, 'site.generated.js')).href)
  return { products, ...site }
}

/* ── 比對 ──────────────────────────────────────────────────── */

/**
 * 已經確認過、刻意造成的差異。
 *
 * 沒有這張表的話，這支工具每次都會對同樣幾項叫 —— 而每次都叫、每次都要
 * 「喔那個沒關係」的警報，最後會被整個忽略，真正的問題也就一起看不見了。
 * 要加進來必須寫理由，而且理由要說得出「為什麼這樣比較好」。
 */
const ACCEPTED = {
  '品類 accessory':
    '2026-09-06 決定：絲巾扣併進純銀飾品，三色珍珠絲巾扣改掛 jewelry。' +
    '前台導覽列因此少一個品類，手機包目前 0 件所以也不會出現，等於三個品類。',
}

/**
 * 改過名的商品編號：舊 → 新。
 *
 * 這支工具是用 id 比對的，看到舊 id 不見了就判定「整件不見了」——
 * 它分不出改名和刪除。2026-09-07 把 14 件的編號從語意代稱
 * （frg-ylang）改成目錄編號（VL_FRG_001），如果不告訴它，
 * 每一件都會報成遺失而擋住部署。
 *
 * 🔴 這裡不是 ACCEPTED。ACCEPTED 是「這個差異可以接受，不用再看」，
 *    而改名要的是「換個 id 繼續比對內容」—— 品名、描述、材質、圖片
 *    數量全部照樣逐欄檢查。用 ACCEPTED 放行的話，改名的同時掉了
 *    一段描述也不會有人發現。
 *
 * 之後如果再改名，加在這裡；基準線本身不動。
 */
const RENAMED = {
  'frg-ylang': 'VL_FRG_001',
  'frg-blackcherry': 'VL_FRG_002',
  'frg-aquakiss': 'VL_FRG_003',
  'frg-flowershop': 'VL_FRG_004',
  'frg-aprilfresh': 'VL_FRG_005',
  'scarf-1': 'VL_SLK_001',
  'scarf-2': 'VL_SLK_002',
  'scarf-3': 'VL_SLK_003',
  'scarfring-1': 'VL_SCR_001',
  'earring-1': 'VL_EAR_001',
  'necklace-1': 'VL_NEC_001',
  'ring-1': 'VL_RNG_001',
  'bracelet-1': 'VL_BRC_001',
  vlmb001: 'VL_MB_001',
}

const problems = []
const warnings = []
const additions = []
const accepted = []

/** 記一筆遺失。已登記為刻意差異的走另一區，不算失敗。 */
function fail(label, was, now_, why) {
  if (why) { accepted.push([label, was, now_, why]); return }
  const key = Object.keys(ACCEPTED).find((k) => label === k || label.startsWith(k + " ·"))
  if (key) accepted.push([label, was, now_, ACCEPTED[key]])
  else problems.push([label, was, now_])
}

const empty = (v) => v === undefined || v === null || v === '' ||
  (Array.isArray(v) && v.length === 0)

/** 一組 {zh,en,ko} 攤平成可比對的字串陣列 */
function langs(v) {
  if (v == null) return {}
  if (typeof v === 'string') return { '': v }
  const out = {}
  for (const k of ['zh', 'en', 'ko']) if (k in v) out[k] = Array.isArray(v[k]) ? v[k].join(';') : v[k]
  return out
}

function cmp(where, field, was, now) {
  const a = langs(was)
  const b = langs(now)
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const label = `${where} · ${field}${k ? '.' + k : ''}`
    const oldV = a[k]
    const newV = b[k]
    // 兩邊都是空的不算差異。舊資料的 undefined 與新資料的 '' 在畫面上
    // 是同一件事（都會走 pick() 的回退），列出來只會把真正的問題淹掉。
    if (empty(oldV) && empty(newV)) continue
    if (!empty(oldV) && empty(newV)) fail(label, oldV, '(空)')
    else if (empty(oldV) && !empty(newV)) additions.push([label, '(空)', newV])
    else if (oldV !== newV) warnings.push([label, oldV, newV])
  }
}

const old = await loadOld()
const now = await loadNew()

/**
 * 目前要露出的品牌。
 *
 * site.generated.js 只含 listed 的品牌 —— houses 分頁的 listed 控制的是
 * 「品牌露不露出」，不是商品的上下架。取消勾選之後，那個品牌會從品牌館
 * 消失，它底下的商品則留在架上，只是 house 欄變空（＝沒掛品牌）。
 *
 * 🔴 這一段改過兩次，兩次都是同一個教訓。
 *    2026-09-07 早：暫停代理會讓 8 件商品從輸出裡消失，這支檢查照實
 *    報「遺失」，發布被自己的關卡擋下，使用者只看到「發布失敗」。
 *    2026-09-07 晚：真正的錯不在檢查，在產生器 —— 使用者要的是不顯示
 *    品牌，從來沒說商品要下架。產生器改成留白 house 之後，商品不再消失，
 *    這裡要放行的就只剩「house 由某個品牌變成空」這一件事。
 *
 *    一道分不出「刻意」與「意外」的關卡比沒有關卡更糟：它會在正常操作時
 *    擋住人，然後被繞過，之後就再也擋不住真正的問題。
 */
const activeHouses = new Set(now.houses.map((h) => h.key))
const pausedHouses = Object.keys(old.houses).filter((k) => !activeHouses.has(k))

/* 商品：逐件逐欄 */
const newById = new Map(now.products.map((p) => [p.id, p]))
/**
 * 舊 id → 新資料。先用改名後的找，找不到再用原本的。
 *
 * 🔴 兩段都需要，不能只留一段：
 *   CI 讀的是 Sheet，編號已經改過 → 要用新 id 才找得到。
 *   本機讀的是 fixture.json 產出的種子，編號還是舊的（改名只發生在
 *   Sheet 上，種子沒有跟著動）→ 只查新 id 的話 13 件全部報成遺失。
 * 退回原 id 這一段就是給本機用的。
 */
const findNew = (oldId) => newById.get(RENAMED[oldId]) || newById.get(oldId)
for (const p of old.products) {
  const n = findNew(p.id)
  if (!n) {
    fail(`商品 ${p.id}`, '存在', '整件不見了')
    continue
  }
  const w = `商品 ${p.id}`
  cmp(w, 'name', p.name, { zh: n.name_zh, en: n.name_en, ko: n.name_ko })
  cmp(w, 'tagline', p.tagline, { zh: n.tagline_zh, en: n.tagline_en, ko: n.tagline_ko })
  cmp(w, 'desc', p.desc, { zh: n.desc_zh, en: n.desc_en, ko: n.desc_ko })
  cmp(w, 'material', p.material, { zh: n.material_zh, en: n.material_en, ko: n.material_ko })
  cmp(w, 'spec', p.spec, { zh: n.spec_zh, en: n.spec_en, ko: n.spec_ko })
  // ref（索引碼）2026-09-07 起不再輸出到前台 —— 前台改印商品編號本身。
  // 這裡不能再比：欄位是刻意移除的，比下去 13 件都會報「內容遺失」而擋住部署。
  // 基準線本身不動（那是規矩），只是不再拿一個已經不存在的欄位去比。
  // 品牌不露出時 house 會留白，那是刻意的；變成**別的**品牌仍然要報
  if (pausedHouses.includes(p.house) && !n.house) {
    accepted.push([`${w} · house`, p.house, '(空)', '品牌不露出，商品仍在架上'])
  } else {
    cmp(w, 'house', p.house, n.house)
  }
  if (p.notes) {
    for (const [slot, col] of [['top', 'notes_top'], ['middle', 'notes_mid'], ['base', 'notes_base']]) {
      cmp(w, `notes.${slot}`, p.notes[slot], {
        zh: n[`${col}_zh`], en: n[`${col}_en`], ko: n[`${col}_ko`],
      })
    }
  }
  const oldImgs = p.images || 0
  const newImgs = (n.files || []).length
  if (oldImgs > newImgs) fail(`${w} · 圖片`, `${oldImgs} 張`, `${newImgs} 張`)
}
// 改過名的不算新增 —— 它在上面已經跟舊資料逐欄比對過了
const renamedTo = new Set(Object.values(RENAMED))
for (const n of now.products) {
  if (renamedTo.has(n.id)) continue
  if (!old.products.some((p) => p.id === n.id)) additions.push([`商品 ${n.id}`, '(無)', '新增'])
}

/* 品類 */
const newCats = new Map(now.categories.map((c) => [c.key, c]))
for (const c of old.categories) {
  const n = newCats.get(c.key)
  if (!n) {
    fail(`品類 ${c.key}`, `存在（${c.name.zh}）`, '整個不見了')
    continue
  }
  cmp(`品類 ${c.key}`, 'name', c.name, n.name)
  cmp(`品類 ${c.key}`, 'ref', c.ref, n.ref)
  cmp(`品類 ${c.key}`, 'cover', c.cover, n.cover)
}
for (const n of now.categories) {
  if (!old.categories.some((c) => c.key === n.key)) additions.push([`品類 ${n.key}`, '(無)', n.name.zh])
}

/* 品牌 */
const newHouses = new Map(now.houses.map((h) => [h.key, h]))
for (const key of Object.keys(old.houses)) {
  const o = old.houses[key]
  const n = newHouses.get(key)
  if (!n) {
    fail(`品牌 ${key}`, '存在', '整個不見了',
      `houses 分頁的 listed 未勾選 —— 品牌不露出，商品仍在架上。勾回去再發布就會回來`)
    continue
  }
  cmp(`品牌 ${key}`, 'name', o.name, n.name)
  cmp(`品牌 ${key}`, 'tagline', o.tagline, n.tagline)
  cmp(`品牌 ${key}`, 'intro', o.intro, n.intro)
  cmp(`品牌 ${key}`, 'country', o.country, n.country)
}

/* ── 報告 ──────────────────────────────────────────────────── */

const line = '─'.repeat(72)
function section(title, rows, mark) {
  console.log(line)
  console.log(`${title}　${rows.length} 項`)
  console.log(line)
  if (!rows.length) {
    console.log('  （無）')
    return
  }
  for (const [label, was, now_] of rows) {
    const trim = (s) => {
      const t = String(s).replace(/\s+/g, ' ')
      return t.length > 46 ? t.slice(0, 45) + '…' : t
    }
    console.log(`  ${mark} ${label}`)
    console.log(`      舊  ${trim(was)}`)
    console.log(`      新  ${trim(now_)}`)
  }
}

if (pausedHouses.length) {
  console.log(line)
  console.log(`○ 暫停中的品牌：${pausedHouses.join('、')}`)
  console.log('  它們的商品與品類消失是預期的，不算內容遺失。')
}

section('✗ 內容遺失　舊的有值、新的空了或不見了', problems, '✗')
section('⚠ 內容改變　要確認是刻意的還是意外', warnings, '⚠')
section('＋ 純新增　舊的沒有', additions, '＋')

console.log(line)
console.log(`○ 已確認的刻意差異　${accepted.length} 項`)
console.log(line)
if (!accepted.length) console.log('  （無）')
for (const [label, was, now_, why] of accepted) {
  console.log(`  ○ ${label}　${was} → ${now_}`)
  console.log(`      ${why}`)
}

console.log(line)
if (problems.length) {
  console.log(`✗ ${problems.length} 項內容遺失。這些會讓線上的站台變空白，必須先補回 Sheet。`)
  /*
   * 也用 GitHub Actions 的註記格式印一份。
   *
   * 沒有這一段的話，摘要頁與 API 只看得到「Process completed with exit code 1」——
   * 要知道是哪一項得點進去展開步驟往下捲。訊息寫得再清楚，看不到就等於沒寫。
   */
  if (process.env.GITHUB_ACTIONS) {
    // 每一項壓成單行；註記的換行要寫成 %0A，送真的換行字元只會留下第一行
    const flat = (v) => String(v).split(/\s+/).join(' ').slice(0, 60)
    const lines = problems.slice(0, 12).map(([l, was, n]) => `${l}：${flat(was)} → ${flat(n)}`)
    console.log('::error::內容遺失 ' + problems.length + ' 項%0A' + lines.join('%0A'))
  }
  process.exit(1)
}
console.log(`✓ 沒有內容遺失。${warnings.length} 項改變、${additions.length} 項新增，請確認是刻意的。`)
