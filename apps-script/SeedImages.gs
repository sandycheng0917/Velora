/**
 * 一次性：把既有的商品圖搬進 Google Sheet 的 images 分頁。
 *
 * 由 tools/seed-images.mjs 產生，請勿手動編輯。
 *
 * ── 這支在做什麼 ────────────────────────────────────────────────────
 *
 * 商品圖本來不該放在程式碼裡。目前 23 張圖是 repo 裡的既有素材，
 * 建置時由 tools/images.json 這條遷移退路帶進網站。這支函式把那些圖的
 * 位元組真正寫進 Sheet，之後那條退路就可以拆掉 —— 資料只剩一個來源。
 *
 * 圖片不是內嵌在這個檔案裡（那會是 2MB 的 base64，貼都貼不進編輯器），
 * 而是由 UrlFetchApp 從已經上線的站台抓回來。所以：
 *
 *   🔴 執行前網站必須是活的。網址：
 *      https://sandycheng0917.github.io/Velora
 *
 * ── 可以重複執行 ────────────────────────────────────────────────────
 *
 * 已經在 Sheet 裡、而且 sha256 相符的鍵會被跳過。中途逾時（Apps Script
 * 單次執行上限 6 分鐘）就再執行一次，它會從沒做完的地方接下去。
 *
 * 共 23 張，約 0.61 MB。
 */

var SEED_IMAGES = [
  { key: "frg-ylang-main", url: "https://sandycheng0917.github.io/Velora/assets/media/frg-ylang-main-b9593ddb.webp", mime: "image/webp", alpha: false, sha256: "b9593ddb17d0bec9a0f6d76303be6c26a64cd35bd465ac8c0b4ce3c30294bfce", bytes: 32448 },
  { key: "frg-ylang-2", url: "https://sandycheng0917.github.io/Velora/assets/media/frg-ylang-2-42caa68d.webp", mime: "image/webp", alpha: false, sha256: "42caa68d8ffbb182785b07163b6d24d06b7a9c00502c712fd7b1216c3aa5e087", bytes: 33998 },
  { key: "frg-blackcherry-2", url: "https://sandycheng0917.github.io/Velora/assets/media/frg-blackcherry-2-42caa68d.webp", mime: "image/webp", alpha: false, sha256: "42caa68d8ffbb182785b07163b6d24d06b7a9c00502c712fd7b1216c3aa5e087", bytes: 33998 },
  { key: "frg-aquakiss-2", url: "https://sandycheng0917.github.io/Velora/assets/media/frg-aquakiss-2-42caa68d.webp", mime: "image/webp", alpha: false, sha256: "42caa68d8ffbb182785b07163b6d24d06b7a9c00502c712fd7b1216c3aa5e087", bytes: 33998 },
  { key: "frg-flowershop-2", url: "https://sandycheng0917.github.io/Velora/assets/media/frg-flowershop-2-42caa68d.webp", mime: "image/webp", alpha: false, sha256: "42caa68d8ffbb182785b07163b6d24d06b7a9c00502c712fd7b1216c3aa5e087", bytes: 33998 },
  { key: "frg-aprilfresh-2", url: "https://sandycheng0917.github.io/Velora/assets/media/frg-aprilfresh-2-42caa68d.webp", mime: "image/webp", alpha: false, sha256: "42caa68d8ffbb182785b07163b6d24d06b7a9c00502c712fd7b1216c3aa5e087", bytes: 33998 },
  { key: "frg-ylang-3", url: "https://sandycheng0917.github.io/Velora/assets/media/frg-ylang-3-67ef06b3.webp", mime: "image/webp", alpha: false, sha256: "67ef06b3b91ab9cf8c8ec63c610daf7bdc9723b37de69371da925e9454fa879c", bytes: 33664 },
  { key: "frg-blackcherry-3", url: "https://sandycheng0917.github.io/Velora/assets/media/frg-blackcherry-3-67ef06b3.webp", mime: "image/webp", alpha: false, sha256: "67ef06b3b91ab9cf8c8ec63c610daf7bdc9723b37de69371da925e9454fa879c", bytes: 33664 },
  { key: "frg-aquakiss-3", url: "https://sandycheng0917.github.io/Velora/assets/media/frg-aquakiss-3-67ef06b3.webp", mime: "image/webp", alpha: false, sha256: "67ef06b3b91ab9cf8c8ec63c610daf7bdc9723b37de69371da925e9454fa879c", bytes: 33664 },
  { key: "frg-flowershop-3", url: "https://sandycheng0917.github.io/Velora/assets/media/frg-flowershop-3-67ef06b3.webp", mime: "image/webp", alpha: false, sha256: "67ef06b3b91ab9cf8c8ec63c610daf7bdc9723b37de69371da925e9454fa879c", bytes: 33664 },
  { key: "frg-aprilfresh-3", url: "https://sandycheng0917.github.io/Velora/assets/media/frg-aprilfresh-3-67ef06b3.webp", mime: "image/webp", alpha: false, sha256: "67ef06b3b91ab9cf8c8ec63c610daf7bdc9723b37de69371da925e9454fa879c", bytes: 33664 },
  { key: "frg-blackcherry-main", url: "https://sandycheng0917.github.io/Velora/assets/media/frg-blackcherry-main-1a874089.webp", mime: "image/webp", alpha: false, sha256: "1a874089700f2509901863e9df39abbd3d4e72dd07679c3ec6491fce80f57564", bytes: 33590 },
  { key: "frg-aquakiss-main", url: "https://sandycheng0917.github.io/Velora/assets/media/frg-aquakiss-main-16023d1a.webp", mime: "image/webp", alpha: false, sha256: "16023d1a7b7646b37ed933b59c0298530e58c1f306a18050047c8c735ce9f7f4", bytes: 33836 },
  { key: "frg-flowershop-main", url: "https://sandycheng0917.github.io/Velora/assets/media/frg-flowershop-main-c94ac4cb.webp", mime: "image/webp", alpha: false, sha256: "c94ac4cb3d909eaff696d15529cd0b54916ba676d13ac772e711ffb1f91965b6", bytes: 33820 },
  { key: "frg-aprilfresh-main", url: "https://sandycheng0917.github.io/Velora/assets/media/frg-aprilfresh-main-7fe365f1.webp", mime: "image/webp", alpha: false, sha256: "7fe365f1e1854f91c8211dd8bc8fede18cdf736faf08f3ef338933c23572066f", bytes: 29436 },
  { key: "scarf-1-main", url: "https://sandycheng0917.github.io/Velora/assets/media/scarf-1-main-311186c4.webp", mime: "image/webp", alpha: false, sha256: "311186c420ad6706c4caadbfb8888cadf813f4f1fc53857df45d8430a93cf317", bytes: 23976 },
  { key: "scarf-2-main", url: "https://sandycheng0917.github.io/Velora/assets/media/scarf-2-main-3b8f8439.webp", mime: "image/webp", alpha: false, sha256: "3b8f843987499254c44005c89c052f32c2c3debb5e1c59ebadd6704e5ece4feb", bytes: 32416 },
  { key: "scarf-3-main", url: "https://sandycheng0917.github.io/Velora/assets/media/scarf-3-main-2570d880.webp", mime: "image/webp", alpha: false, sha256: "2570d88064e07982e98280fde9f067ab101b351246c4e32e9757dd11f17c2426", bytes: 30016 },
  { key: "scarfring-1-main", url: "https://sandycheng0917.github.io/Velora/assets/media/scarfring-1-main-ebf9100f.webp", mime: "image/webp", alpha: false, sha256: "ebf9100f37ba246daa422739b5cebd086d98e6ae217385e8bed5ea3ab2a14570", bytes: 6420 },
  { key: "earring-1-main", url: "https://sandycheng0917.github.io/Velora/assets/media/earring-1-main-4c6fd74b.webp", mime: "image/webp", alpha: false, sha256: "4c6fd74bf38a7885ef5b4bf68756ee269935589b98a5fc9a4aa93ffbfca3d6cf", bytes: 11392 },
  { key: "necklace-1-main", url: "https://sandycheng0917.github.io/Velora/assets/media/necklace-1-main-b23f9a09.webp", mime: "image/webp", alpha: false, sha256: "b23f9a09f47454ae14bd911651835cc92c50c59c3e1b6143588db29a2fe70ce5", bytes: 12702 },
  { key: "ring-1-main", url: "https://sandycheng0917.github.io/Velora/assets/media/ring-1-main-d980ab69.webp", mime: "image/webp", alpha: false, sha256: "d980ab6958e85bdd69f2e98f69c3f560f3429d059b161b0eedc5f4b444b464e1", bytes: 11550 },
  { key: "bracelet-1-main", url: "https://sandycheng0917.github.io/Velora/assets/media/bracelet-1-main-56960ae6.webp", mime: "image/webp", alpha: false, sha256: "56960ae6ef4dac54c1d37f721d088cead39c7bdfb6f27bde0f8934aab4163338", bytes: 5462 }
];

/** 一次處理幾張。抓取 + base64 + 寫入都算在 6 分鐘的執行上限裡 */
var SEED_BATCH = 8;

function seedImages() {
  var ss = openBook_();
  var sh = ss.getSheetByName('images');
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
      if (k) have[k] = String(vals[i][idx.sha256]);
    }
  }

  var todo = [];
  for (var j = 0; j < SEED_IMAGES.length; j++) {
    var e = SEED_IMAGES[j];
    if (have[e.key] === e.sha256) continue;
    todo.push(e);
  }
  if (!todo.length) {
    return pwSay_('✓ 23 張圖都已經在 Sheet 裡了，沒有要做的事。');
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
    (failed.length ? '✗ ' : '✓ ') + '這一輪寫入 ' + done.length + ' 張\n' +
    (done.length ? '  ' + done.join('\n  ') + '\n' : '') +
    (failed.length ? '\n失敗 ' + failed.length + ' 張：\n  ' + failed.join('\n  ') + '\n' : '') +
    '\n還剩 ' + left + ' 張。' +
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
  var sh = openBook_().getSheetByName('images');
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
    'images 分頁：' + inSheet + ' 個影像鍵、' + chunks + ' 列（一張圖可能佔多列）\n' +
    '這份清單共 ' + SEED_IMAGES.length + ' 張\n' +
    (missing.length ? '\n還沒進 Sheet 的 ' + missing.length + ' 張：\n  ' + missing.join('\n  ')
                    : '\n✓ 清單上的都在 Sheet 裡了'));
}
