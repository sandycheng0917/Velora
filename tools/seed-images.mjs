/**
 * 產生 apps-script/SeedImages.gs —— 一支把既有商品圖搬進 Google Sheet 的函式。
 *
 * ── 為什麼不直接把 base64 寫進 .gs ──────────────────────────────────
 *
 * 23 張圖約 1.5MB，轉成 base64 是 2MB 的純文字。那樣的 .gs 檔要貼進
 * Apps Script 編輯器幾乎不可能操作，而且每次微調都要重貼一次。
 *
 * 改成讓 Apps Script 自己去線上站台抓 —— 產生出來的檔案只有幾 KB，
 * 裡面是一張「影像鍵 → 網址」的對照表。圖片的位元組從頭到尾沒有經過
 * 這個 repo 的原始碼。
 *
 * ── 為什麼要做這件事 ────────────────────────────────────────────────
 *
 * 商品圖本來就不該放在程式碼裡。tools/images.json 那條退路是遷移期間的
 * 臨時措施，讓 13 件商品在還沒有人上傳之前就有東西可看。
 * 圖進了 Sheet 之後，那條退路就可以拆掉，資料真正只有一個來源。
 *
 * 用法：
 *   node tools/seed-images.mjs                          # 用預設的線上網址
 *   node tools/seed-images.mjs --base https://…/Velora  # 指定站台
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const args = process.argv.slice(2)
const bi = args.indexOf('--base')
const BASE = (bi !== -1 && args[bi + 1] ? args[bi + 1] : 'https://sandycheng0917.github.io/Velora')
  .replace(/\/$/, '')

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif',
}

/**
 * WebP 容器有沒有 alpha。與 tools/build-catalog.mjs 的同名函式必須一致 ——
 * 那邊決定檔名要不要帶 .cut，這邊決定 Sheet 裡記什麼，
 * 而後台是拿 Sheet 的值去算檔名的。三者對不上就會 404。
 */
function webpHasAlpha(buf) {
  if (buf.length < 32) return false
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return false
  const tag = buf.toString('ascii', 12, 16)
  if (tag === 'VP8X') return !!(buf[20] & 0x10)
  if (tag === 'VP8L') return !!(buf[24] & 0x10)
  return false
}

/** 跟 build-catalog.mjs 的 imageFileName 必須一致，否則抓不到檔案 */
const fileName = (key, sha, alpha, ext) => `${key}-${sha.slice(0, 8)}${alpha ? '.cut' : ''}.${ext}`

const legacyPath = join(ROOT, 'tools', 'images.json')
if (!existsSync(legacyPath)) {
  console.error('✗ 找不到 tools/images.json，沒有可搬的對照表')
  process.exit(1)
}

const rows = []
for (const e of JSON.parse(readFileSync(legacyPath, 'utf8'))) {
  const abs = join(ROOT, 'velora-frontend', 'public', e.path.replace(/^\//, ''))
  if (!existsSync(abs)) {
    console.error(`  – 跳過 ${e.key}：找不到 ${e.path}`)
    continue
  }
  const buf = readFileSync(abs)
  const sha = createHash('sha256').update(buf).digest('hex')
  const ext = e.path.split('.').pop().toLowerCase()
  /*
   * 🔴 不能用副檔名判斷 alpha。
   *
   * 素材壓成 WebP 之後全部是 .webp，用 ext === 'png' 會一律得到 false，
   * 而產生器是讀 WebP 容器標頭判定的 —— 兩邊不一致，算出來的檔名就少了
   * .cut，後台指過去直接 404。實測有 4 張這樣掉下去。
   *
   * 判準必須跟 build-catalog.mjs 的 webpHasAlpha 一致：
   *   VP8X 的 flag byte 第 4 個 bit 是 ALPHA
   *   VP8L 的第 5 個 byte 第 4 個 bit 是 has_alpha
   */
  const alpha = ext === 'webp' ? webpHasAlpha(buf) : ext === 'png'
  rows.push({
    key: e.key,
    url: `${BASE}/assets/media/${fileName(e.key, sha, alpha, ext)}`,
    mime: MIME[ext] || 'application/octet-stream',
    alpha,
    sha,
    bytes: buf.length,
  })
}

const js = (v) => JSON.stringify(v)
const table = rows.map((r) =>
  `  { key: ${js(r.key)}, url: ${js(r.url)}, mime: ${js(r.mime)}, ` +
  `alpha: ${r.alpha}, sha256: ${js(r.sha)}, bytes: ${r.bytes} }`
).join(',\n')

const total = rows.reduce((n, r) => n + r.bytes, 0)

const out = `/**
 * 一次性：把既有的商品圖搬進 Google Sheet 的 images 分頁。
 *
 * 由 tools/seed-images.mjs 產生，請勿手動編輯。
 *
 * ── 這支在做什麼 ────────────────────────────────────────────────────
 *
 * 商品圖本來不該放在程式碼裡。目前 ${rows.length} 張圖是 repo 裡的既有素材，
 * 建置時由 tools/images.json 這條遷移退路帶進網站。這支函式把那些圖的
 * 位元組真正寫進 Sheet，之後那條退路就可以拆掉 —— 資料只剩一個來源。
 *
 * 圖片不是內嵌在這個檔案裡（那會是 2MB 的 base64，貼都貼不進編輯器），
 * 而是由 UrlFetchApp 從已經上線的站台抓回來。所以：
 *
 *   🔴 執行前網站必須是活的。網址：
 *      ${BASE}
 *
 * ── 可以重複執行 ────────────────────────────────────────────────────
 *
 * 已經在 Sheet 裡、而且 sha256 相符的鍵會被跳過。中途逾時（Apps Script
 * 單次執行上限 6 分鐘）就再執行一次，它會從沒做完的地方接下去。
 *
 * 共 ${rows.length} 張，約 ${(total / 1024 / 1024).toFixed(2)} MB。
 */

var SEED_IMAGES = [
${table}
];

/** 一次處理幾張。抓取 + base64 + 寫入都算在 6 分鐘的執行上限裡 */
var SEED_BATCH = 8;

function seedImages() {
  // 影像在另一份試算表（見 Setup.gs 的 openImages_）
  var sh = openImages_().getSheetByName('images');
  if (!sh) return pwSay_('找不到 images 分頁，請先執行 setupSheets。');

  var idx = headIndex_(sh);
  var width = COLS.images.length;

  // 先看哪些已經在裡面了。用 sha256 比對而不是只看 key ——
  // 同一個鍵換過圖的話，內容不同就該重寫
  var have = {};
  var last = lastIdRow_(sh);
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
    for (var i = 0; i < vals.length; i++) {
      var k = String(vals[i][idx.key]).trim();
      // 連 alpha 與 mime 一起記。只比 sha 的話，判定規則改了也不會重寫 ——
      // 而 alpha 決定檔名要不要帶 .cut，錯了後台就指到 404
      if (k) have[k] = String(vals[i][idx.sha256]) + '|' +
        (truthyIn_(vals[i][idx.alpha]) ? '1' : '0') + '|' + String(vals[i][idx.mime]);
    }
  }

  var todo = [];
  for (var j = 0; j < SEED_IMAGES.length; j++) {
    var e = SEED_IMAGES[j];
    if (have[e.key] === e.sha256 + '|' + (e.alpha ? '1' : '0') + '|' + e.mime) continue;
    todo.push(e);
  }
  if (!todo.length) {
    return pwSay_('✓ ${rows.length} 張圖都已經在 Sheet 裡了，沒有要做的事。');
  }

  var batch = todo.slice(0, SEED_BATCH);
  var done = [];
  var failed = [];

  for (var b = 0; b < batch.length; b++) {
    var it = batch[b];
    try {
      var res = UrlFetchApp.fetch(it.url, { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) {
        failed.push(it.key + '：HTTP ' + res.getResponseCode());
        continue;
      }
      var bytes = res.getBlob().getBytes();

      // 端到端校驗。抓錯檔案、被 CDN 換掉、傳輸截斷都在這裡被抓到，
      // 而不是變成網站上的破圖
      var got = shaHex_(bytes);
      if (got !== it.sha256) {
        failed.push(it.key + '：雜湊不符（預期 ' + it.sha256.substring(0, 12) +
                    '…，實得 ' + got.substring(0, 12) + '…）');
        continue;
      }

      writeImage_(sh, idx, width, it, Utilities.base64Encode(bytes));
      done.push(it.key + '（' + Math.round(it.bytes / 1024) + ' KB）');
    } catch (err) {
      failed.push(it.key + '：' + (err && err.message ? err.message : err));
    }
  }
  SpreadsheetApp.flush();

  var left = todo.length - done.length;
  return pwSay_(
    (failed.length ? '✗ ' : '✓ ') + '這一輪寫入 ' + done.length + ' 張\\n' +
    (done.length ? '  ' + done.join('\\n  ') + '\\n' : '') +
    (failed.length ? '\\n失敗 ' + failed.length + ' 張：\\n  ' + failed.join('\\n  ') + '\\n' : '') +
    '\\n還剩 ' + left + ' 張。' +
    (left ? '再執行一次 seedImages 接下去。' : '全部完成 —— 圖片現在真的在 Sheet 裡了。'));
}

/** SHA-256 十六進位。computeDigest 回傳有號 byte，要先轉無號 */
function shaHex_(bytes) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  var out = '';
  for (var i = 0; i < raw.length; i++) {
    var v = (raw[i] < 0 ? raw[i] + 256 : raw[i]) & 0xff;
    out += (v < 16 ? '0' : '') + v.toString(16);
  }
  return out;
}

/** 寫一張圖。同一個 key 的舊列先刪掉，由下往上刪避免索引位移 */
function writeImage_(sh, idx, width, meta, b64) {
  var last = lastIdRow_(sh);
  if (last >= 2) {
    var keys = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = keys.length - 1; i >= 0; i--) {
      if (String(keys[i][0]).trim() === meta.key) sh.deleteRow(i + 2);
    }
    SpreadsheetApp.flush();
  }

  var rows = [];
  var n = Math.ceil(b64.length / CHUNK_CHARS);
  for (var c = 0; c < n; c++) {
    var r = new Array(width);
    for (var z = 0; z < width; z++) r[z] = '';
    r[idx.key] = meta.key;
    r[idx.chunk] = c;
    r[idx.total] = n;
    r[idx.mime] = meta.mime;
    r[idx.alpha] = meta.alpha;
    r[idx.sha256] = meta.sha256;
    r[idx.bytes] = meta.bytes;
    // 'w:' 前綴：base64 含 + 與 /，而 Sheets 會把 + - = 開頭的儲存格
    // 當公式解析。兩個字元換來完全不必擔心這件事
    r[idx.data] = 'w:' + b64.substring(c * CHUNK_CHARS, (c + 1) * CHUNK_CHARS);
    rows.push(r);
  }

  var at = lastIdRow_(sh) + 1;
  ensureRows_(sh, at + rows.length + 1);
  sh.getRange(at, 1, rows.length, width).setValues(rows);
}

/**
 * 檢查目前 Sheet 裡有幾張圖，以及跟這份清單差多少。不會寫入。
 */
function checkImages() {
  var sh = openImages_().getSheetByName('images');
  if (!sh) return pwSay_('找不到 images 分頁。');
  var idx = headIndex_(sh);
  var last = lastIdRow_(sh);
  var keys = {};
  var chunks = 0;
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
    chunks = vals.length;
    for (var i = 0; i < vals.length; i++) {
      var k = String(vals[i][idx.key]).trim();
      if (k) keys[k] = true;
    }
  }
  var inSheet = Object.keys(keys).length;
  var missing = [];
  for (var j = 0; j < SEED_IMAGES.length; j++) {
    if (!keys[SEED_IMAGES[j].key]) missing.push(SEED_IMAGES[j].key);
  }
  return pwSay_(
    'images 分頁：' + inSheet + ' 個影像鍵、' + chunks + ' 列（一張圖可能佔多列）\\n' +
    '這份清單共 ' + SEED_IMAGES.length + ' 張\\n' +
    (missing.length ? '\\n還沒進 Sheet 的 ' + missing.length + ' 張：\\n  ' + missing.join('\\n  ')
                    : '\\n✓ 清單上的都在 Sheet 裡了'));
}
`

writeFileSync(join(ROOT, 'apps-script', 'SeedImages.gs'), out, 'utf8')
console.log(`寫出 apps-script/SeedImages.gs`)
console.log(`  ${rows.length} 張圖，共 ${(total / 1024 / 1024).toFixed(2)} MB`)
console.log(`  來源站台：${BASE}`)
console.log(`  檔案大小：${(out.length / 1024).toFixed(1)} KB（圖片位元組不在裡面）`)
