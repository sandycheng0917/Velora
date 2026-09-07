#!/usr/bin/env node
/**
 * 後台與公開版的 class 撞名檢查。
 *
 * 為什麼需要這支：
 * `velora-frontend/src/main.js` 無條件 import 了 `src/style.css`，
 * 所以公開版與後台版兩個 bundle 都會載入那份全域樣式。裡面有一些
 * 「裸類別」選擇器（`.wm`、`.sec`、`.plate` …），它們沒有任何祖先限定，
 * 一旦後台用到同名的 class 就會被套上去 —— 而且是靜悄悄的。
 *
 * 實際發生過：`.wm { position: absolute; opacity: 0.06; line-height: 0.72 }`
 * 是展示頁那個巨大的浮水印 V，後台側欄的字標剛好也叫 `.wm`。
 * 結果後台的公司名稱長期是 6% 不透明度、三行擠在一起，使用者兩次回報
 * 「看不到公司名稱」「頁籤蓋到公司名稱」，兩次都找錯方向。
 * 同一批還有 `.sec`（多出 64–130px 的 padding-top）與 `.plate`
 * （縮圖上多一圈金色髮絲框與暗角）。
 *
 * 檢查方式是名字，不是效果 —— 撞名就擋。要共用公開版的樣式，
 * 正確的做法是明確地寫 `.vadmin .foo { … }` 覆蓋，而不是靠同名繼承；
 * 靠繼承的話，公開版哪天改了樣式，後台會跟著壞而且沒人會聯想到。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'velora-frontend/src'
const GLOBAL_CSS = join(SRC, 'style.css')
const ADMIN_DIR = join(SRC, 'admin')

/** 公開版全域樣式裡，沒有任何祖先限定的類別選擇器 */
function bareClasses(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const found = new Set()
  for (const m of stripped.matchAll(/([^{}]+)\{/g)) {
    for (const raw of m[1].split(',')) {
      const sel = raw.trim()
      // 只收「單一類別 + 可選的偽類／偽元素」，例如 .plate、.plate::before、.wm
      const hit = /^\.([A-Za-z][\w-]*)(?:::?[a-z-]+(?:\([^)]*\))?)*$/.exec(sel)
      if (hit) found.add(hit[1])
    }
  }
  return found
}

/** 後台模板裡出現的 class 名稱（含 :class 物件語法的鍵） */
function adminClasses(dir) {
  const found = new Map() // name -> [檔名]
  const add = (name, file) => {
    if (!found.has(name)) found.set(name, [])
    if (!found.get(name).includes(file)) found.get(name).push(file)
  }
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.vue')) continue
    const text = readFileSync(join(dir, file), 'utf8')
    for (const m of text.matchAll(/\sclass="([^"]*)"/g)) {
      for (const c of m[1].split(/\s+/)) if (c && !c.includes('{')) add(c, file)
    }
    for (const m of text.matchAll(/:class="\{([^}]*)\}"/g)) {
      for (const k of m[1].matchAll(/([\w-]+)\s*:/g)) add(k[1], file)
    }
  }
  return found
}

const bare = bareClasses(readFileSync(GLOBAL_CSS, 'utf8'))
const admin = adminClasses(ADMIN_DIR)
const clashes = [...admin.keys()].filter((c) => bare.has(c)).sort()

if (!clashes.length) {
  console.log(`後台 class 撞名檢查：公開版 ${bare.size} 個裸類別、後台 ${admin.size} 個 class，沒有撞名。`)
  process.exit(0)
}

console.error('::error::後台用到的 class 跟公開版 style.css 的裸類別撞名')
console.error('')
console.error('這些名字在兩邊都存在，而 style.css 是兩個 bundle 共用的：')
for (const c of clashes) {
  console.error(`  .${c}  ←  ${admin.get(c).join('、')}`)
}
console.error('')
console.error('把後台那一邊改名（例如 .wm → .brand、.sec → .secline、.plate → .thumb）。')
console.error('不要用 !important 或提高權重壓過去 —— 那只是把下一次的意外往後推。')
process.exit(1)
