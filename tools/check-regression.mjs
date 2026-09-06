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
 * 離線可跑，不需要 Sheet —— 它比的是「已經產生出來的檔案」。
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const DATA = join(ROOT, 'velora-frontend', 'src', 'data')

/* ── 取得「改版前」的 catalog.js ────────────────────────────────
   從 git 取 HEAD 版本，而不是讀工作目錄裡的檔案 —— 介面層改寫之後
   工作目錄裡那份就是新的了，比對會變成自己跟自己比，永遠通過。 */
function oldCatalogSource() {
  try {
    return execFileSync('git', ['show', 'HEAD:velora-frontend/src/data/catalog.js'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    })
  } catch {
    console.error('✗ 取不到 HEAD 的 catalog.js。這支必須在 git repo 裡跑。')
    process.exit(2)
  }
}

/** catalog.js 用了 import.meta.env，Node 直接載入會炸。複製一份改掉再載。 */
async function loadOld() {
  const dir = mkdtempSync(join(tmpdir(), 'velora-reg-'))
  const src = oldCatalogSource().replace("import.meta.env.BASE_URL || '/'", "'/'")
  writeFileSync(join(dir, 'catalog.mjs'), src)
  writeFileSync(join(dir, 'media-manifest.js'), readFileSync(join(DATA, 'media-manifest.js')))
  return import(pathToFileURL(join(dir, 'catalog.mjs')).href)
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

const problems = []
const warnings = []
const additions = []
const accepted = []

/** 記一筆遺失。已登記為刻意差異的走另一區，不算失敗。 */
function fail(label, was, now_) {
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

/* 商品：逐件逐欄 */
const newById = new Map(now.products.map((p) => [p.id, p]))
for (const p of old.products) {
  const n = newById.get(p.id)
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
  cmp(w, 'ref', p.ref, n.ref)
  cmp(w, 'house', p.house, n.house)
  if (p.notes) {
    for (const [slot, col] of [['top', 'notes_top'], ['middle', 'notes_mid'], ['base', 'notes_base']]) {
      cmp(w, `notes.${slot}`, p.notes[slot], {
        zh: n[`${col}_zh`], en: n[`${col}_en`], ko: n[`${col}_ko`],
      })
    }
  }
  const oldImgs = (p.gallery || []).length
  const newImgs = (n.files || []).length
  if (oldImgs > newImgs) fail(`${w} · 圖片`, `${oldImgs} 張`, `${newImgs} 張`)
}
for (const n of now.products) {
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
    fail(`品牌 ${key}`, '存在', '整個不見了')
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
  process.exit(1)
}
console.log(`✓ 沒有內容遺失。${warnings.length} 項改變、${additions.length} 項新增，請確認是刻意的。`)
