/**
 * design/shoot.mjs — 產生 design/exports/ 的頁面預覽圖
 *
 *   cd velora-frontend && npm run build && npx serve dist   # 或任何靜態伺服器
 *   node design/shoot.mjs                                    # 預設打 127.0.0.1:4180
 *   node design/shoot.mjs --preview                          # 改截風格提案頁
 *   VELORA_URL=http://127.0.0.1:5173 node design/shoot.mjs   # 指定其他位址
 *
 * Evolus Pencil 3 已無 CLI 匯出（已確認 app.asar 的 index.js 無相關參數），
 * 因此預覽圖以 headless 瀏覽器對實際頁面截圖產生 ——
 * 好處是預覽圖等於實際成品，不會和實作走鐘。
 *
 * 幾個踩過的坑：
 *   · 網址要用 127.0.0.1 而非 localhost —— Vite 預設只綁 IPv6 ::1，
 *     headless 瀏覽器走 IPv4 會連不上（用 vite --host 127.0.0.1 啟動）。
 *   · --screenshot 的路徑在 Windows 要用反斜線，正斜線會靜默失敗。
 *   · 每次都要用全新的 user-data-dir，且**不要**在瀏覽器關閉時立刻刪除；
 *     殘留的半刪目錄會讓後續每一次啟動都失敗（連 about:blank 都截不出來）。
 *   · Chrome 比 Edge 穩定，優先使用。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'exports')
const BASE = process.env.VELORA_URL || 'http://127.0.0.1:4180'
const TMP = process.env.TEMP || '/tmp'

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
]
const browser = BROWSERS.find(existsSync)
if (!browser) {
  console.error('找不到 Chrome 或 Edge，無法截圖。')
  process.exit(1)
}

/** 批次開始時清掉所有舊 profile；執行中不刪，避免和瀏覽器關閉競態 */
function sweepProfiles() {
  for (const name of readdirSync(TMP)) {
    if (name.startsWith('velora-shot')) {
      try {
        rmSync(join(TMP, name), { recursive: true, force: true })
      } catch {
        /* 還被佔用就留著，下次再清 */
      }
    }
  }
}

let seq = 0
function shot(url, file, width, height, { lang = 'zh-TW', budget = 11000 } = {}) {
  const out = join(OUT, file) // join() 在 Windows 會給反斜線，這是必要的
  if (existsSync(out)) rmSync(out, { force: true })
  const profile = join(TMP, `velora-shot-${Date.now()}-${++seq}`)
  try {
    execFileSync(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--no-first-run',
        '--no-default-browser-check',
        `--lang=${lang}`,
        `--user-data-dir=${profile}`,
        `--virtual-time-budget=${budget}`,
        `--window-size=${width},${height}`,
        `--screenshot=${out}`,
        url,
      ],
      { stdio: 'pipe', timeout: 180_000 },
    )
  } catch {
    /* 瀏覽器回非零時仍可能已產檔，統一以檔案是否存在為準 */
  }
  if (existsSync(out)) {
    console.log(`  ✓ ${file}  ${width}×${height}`)
    return true
  }
  console.error(`  ✗ ${file} 未產出`)
  return false
}

mkdirSync(OUT, { recursive: true })
sweepProfiles()

if (process.argv.includes('--preview')) {
  const base = pathToFileURL(resolve(HERE, 'mockup/style-preview.html')).href
  console.log('截圖：風格提案頁 →', OUT)
  for (const [file, only, top, h] of [
    ['preview-01-showcase.png', 1, 0, 2400],
    ['preview-02-modal.png', 2, 0, 700],
    ['preview-03-admin.png', 3, 0, 920],
    ['preview-04-drawer.png', 4, 0, 1180],
    ['preview-05-tokens.png', 5, 0, 1200],
  ]) {
    shot(`${base}?only=${only}&top=${top}`, file, 1440, h, { budget: 5000 })
  }
} else {
  console.log(`截圖：${BASE} →`, OUT)
  // 展示頁很長（約 10700px）；分區裁切請用 design/crop-exports.py
  shot(`${BASE}/`, '01-showcase-full.png', 1440, 10800)
  shot(`${BASE}/admin`, '02-admin.png', 1440, 1000)
  // 三語各截一張主視覺，驗證語言切換與瀏覽器語言自動偵測
  for (const [code, lang] of [
    ['zh', 'zh-TW'],
    ['en', 'en-US'],
    ['ko', 'ko-KR'],
  ]) {
    shot(`${BASE}/`, `i18n-${code}.png`, 1440, 940, { lang })
  }
  console.log('\n提示：跑 python design/crop-exports.py 可把整頁圖切成各區段。')
}

console.log('完成。')
