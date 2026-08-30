/**
 * check-public.mjs — 公開前的自我稽核
 *
 *   node check-public.mjs                      內建規則 + 本機監看清單
 *   node check-public.mjs 我的手機 公司地址     只搜你當下指定的關鍵字
 *
 * 回答三個問題：
 *   ① 哪些檔案會上傳到網站伺服器？（velora-frontend/dist/）
 *   ② 哪些檔案會進 GitHub？（git 追蹤中的檔案 —— 這是唯一會被推送的東西）
 *   ③ 有沒有不該外流的東西混進去？
 *
 * ⚠️ 這支腳本本身也會被公開，所以**不能把機密字串寫在裡面**。
 *    確切的機密字串放在 .secret-watch.txt（已被 .gitignore 擋住，只存在你本機）。
 *    沒有那個檔案時，仍會用下方不含機密的通用樣式做基本檢查。
 *
 * 本腳本不修改任何東西，可以隨時重跑。
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = import.meta.dirname
const DIST = join(ROOT, 'velora-frontend', 'dist')
const WATCH_FILE = join(ROOT, '.secret-watch.txt')

/**
 * 通用樣式：不含任何實際機密值，公開也無妨。
 * 抓的是「形狀」而非「內容」—— 韓國手機、非本公司信箱、10 位數統編。
 */
const PATTERNS = [
  [/\b01[016-9][-\s]?\d{3,4}[-\s]?\d{4}\b/, '疑似韓國手機號碼'],
  [/\b\d{10}\b/, '疑似 10 位數事業登記號'],
  [/[\w.+-]+@(?!velora\.com\.tw)[\w-]+\.[\w.]+/, '非本公司網域的電子信箱'],
  // 機密來源是韓文表格，只抓數字與信箱會漏掉最重要的部分。
  // 這裡只放「不指名任何人的形狀」—— 韓文姓名接職稱、表格欄位的通用用語。
  // 具體的人名、公司名、地名屬機密本身，寫進這裡等於公開它們，
  // 因此一律放 .secret-watch.txt（不進版控）。
  [/[가-힣]{2,4}\s*(과장|대리|부장|차장|사장|팀장|이사)\b/, '疑似韓文姓名＋職稱'],
  [/[가-힣]*\s*(단가|등록번호|담당자)\s*[:：]?\s*[\w\d]/, '疑似表格欄位＋值'],
]

const bytes = (n) =>
  n > 1048576 ? (n / 1048576).toFixed(2) + ' MB' : (n / 1024).toFixed(0) + ' KB'

function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else out.push({ path: p, size: st.size })
  }
  return out
}

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  } catch {
    return '' // git grep 找不到時回傳非零，視同沒有命中
  }
}

const line = (c = '─') => console.log(c.repeat(68))
const CUSTOM = process.argv.slice(2).filter(Boolean)

/* ① 會上傳到網站伺服器的 ──────────────────────────────────── */
line('═')
console.log('①  會上傳到網站伺服器的內容      velora-frontend/dist/')
line()
const dist = walk(DIST)
if (!dist.length) {
  console.log('  dist/ 不存在。先跑：cd velora-frontend && npm run build:public')
} else {
  const groups = {}
  for (const f of dist) {
    const rel = relative(DIST, f.path).replace(/\\/g, '/')
    const key = rel.includes('/') ? rel.split('/').slice(0, 2).join('/') : '(根目錄)'
    groups[key] = groups[key] || { n: 0, size: 0 }
    groups[key].n++
    groups[key].size += f.size
  }
  for (const [k, v] of Object.entries(groups).sort())
    console.log('  %s %s 檔  %s', k.padEnd(28), String(v.n).padStart(3), bytes(v.size))
  console.log('  %s %s 檔  %s', '總計'.padEnd(27), String(dist.length).padStart(3),
    bytes(dist.reduce((a, b) => a + b.size, 0)))
}

/* ② 會進 GitHub 的 ────────────────────────────────────────── */
line('═')
console.log('②  會進 GitHub 的檔案            git 追蹤中（只有這些會被推送）')
line()
const tracked = sh('git ls-files').split('\n').filter(Boolean)
if (!tracked.length) {
  console.log('  尚未 git add，或這裡不是 git repo。')
} else {
  const groups = {}
  for (const rel of tracked) {
    const key = rel.includes('/') ? rel.split('/').slice(0, 2).join('/') : '(根目錄)'
    groups[key] = (groups[key] || 0) + 1
  }
  for (const [k, n] of Object.entries(groups).sort())
    console.log('  %s %s 檔', k.padEnd(36), String(n).padStart(3))
  console.log('  %s %s 檔', '總計'.padEnd(35), String(tracked.length).padStart(3))
}

/* ③ 被擋在外面的 ──────────────────────────────────────────── */
line('═')
console.log('③  被 .gitignore 擋住、不會外流的')
line()
const ignored = sh('git status --porcelain --ignored')
  .split('\n')
  .filter((l) => l.startsWith('!!'))
  .map((l) => l.slice(3).trim())
if (!ignored.length) console.log('  （無）')
for (const p of ignored) console.log('  ✗ ' + p)

/* ④ 機密掃描 ──────────────────────────────────────────────── */
line('═')
console.log('④  機密掃描（掃 git 追蹤中的所有檔案，包含本腳本自己）')
line()

let bad = 0
function report(label, why, hits) {
  if (!hits.length) return
  bad++
  console.log('  ⚠ %s（%s）', label, why)
  for (const h of hits) console.log('      ' + h)
}

if (CUSTOM.length) {
  console.log('  （只搜你指定的 %d 個關鍵字）\n', CUSTOM.length)
  for (const kw of CUSTOM) {
    const hits = sh(`git grep -lI -e "${kw.replace(/"/g, '\\"')}"`).trim()
    report(kw, '你指定的關鍵字', hits ? hits.split('\n') : [])
  }
} else {
  // (a) 本機監看清單：確切的機密字串，只存在你的電腦上
  if (existsSync(WATCH_FILE)) {
    const words = readFileSync(WATCH_FILE, 'utf8')
      .split('\n')
      .map((l) => l.split('#')[0].trim())
      .filter(Boolean)
    console.log('  監看清單 .secret-watch.txt：%d 個字串（此檔不進版控）', words.length)
    for (const w of words) {
      const hits = sh(`git grep -lI -e "${w.replace(/"/g, '\\"')}"`).trim()
      report(w.slice(0, 4) + '…（已遮蔽）', '監看清單命中', hits ? hits.split('\n') : [])
    }
  } else {
    console.log('  找不到 .secret-watch.txt —— 只做通用樣式檢查。')
    console.log('  建議在專案根目錄建立該檔，一行一個要監看的機密字串。')
  }

  // (b) 通用樣式：不含機密值，靠「形狀」抓
  console.log('  通用樣式：%d 條', PATTERNS.length)
  for (const [re, why] of PATTERNS) {
    const hits = []
    for (const f of tracked) {
      if (/\.(png|jpe?g|gif|svg|ico|ep|zip|pdf|xlsx|woff2?)$/i.test(f)) continue
      let text
      try {
        text = readFileSync(join(ROOT, f), 'utf8')
      } catch {
        continue
      }
      const m = text.match(re)
      if (m) hits.push(`${f}  →  ${m[0]}`)
    }
    report(String(re), why, hits)
  }
}

console.log(bad ? `\n  ⚠ ${bad} 項命中，公開前請逐一確認是否為誤報。`
                : '\n  ✓ 全部 0 命中')

/* ⑤ 後台是否在公開版 ──────────────────────────────────────── */
line('═')
console.log('⑤  公開版是否含後台')
line()
const adminHit = sh('git grep -lI -e "商品管理" -- velora-frontend/dist').trim()
console.log(adminHit
  ? '  ⚠ dist/ 內含後台字串：\n      ' + adminHit
  : '  ✓ dist/ 不含後台，後台程式碼未被打包')
line('═')
