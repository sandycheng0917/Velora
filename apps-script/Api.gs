/**
 * 後台的讀寫端點。路由在 Code.gs，這裡是實作。
 *
 * 全部都要令牌（route_ 用 withAuth_ 包起來），唯一的例外是 export，
 * 那個用 CI 金鑰而且只讀公開分頁 —— 在 Code.gs 裡。
 *
 * ── 三條貫穿這個檔案的規則 ──────────────────────────────────────────
 *
 * 1. 寫入一律先拿 LockService。存取權是「所有人」，匿名請求會真的並行；
 *    兩個請求同時算出「附加到第 15 列」就會互相覆蓋，而且沒有錯誤訊息。
 *
 * 2. 決定「資料到哪一列」一律用 lastIdRow_()，不要用 getLastRow()。
 *    getLastRow() 把套了核取方塊驗證的空儲存格也算成有內容 ——
 *    實測 13 列資料時它回 501。用它當附加位置會把新商品寫到第 502 列。
 *
 * 3. 欄位一律照 COLS 的順序逐欄組，不要用物件展開。前端傳什麼進來
 *    是不受信任的，白名單之外的鍵一律丟掉（而且會回報，不是靜默忽略 ——
 *    靜默忽略會讓「我明明存了」變成無解的客訴）。
 */

/** 前端可以寫的欄位。id 例外：只在建立時可寫，之後鎖死 */
function writableCols_() {
  var out = [];
  for (var i = 0; i < COLS.products.length; i++) {
    var c = COLS.products[i];
    // updated 由伺服器蓋，deleted 只能經由 delete 端點動
    if (c === 'updated' || c === 'deleted') continue;
    out.push(c);
  }
  return out;
}

var BOOL_COLS = ['price_public', 'listed', 'featured'];
var NUM_COLS = ['order'];

/** 分頁的標題列 → { 欄名: 索引 }。每次重讀，不快取 —— 有人加欄時才不會錯位 */
function headIndex_(sh) {
  var w = sh.getLastColumn();
  var head = sh.getRange(1, 1, 1, w).getValues()[0];
  var idx = {};
  for (var i = 0; i < head.length; i++) if (head[i]) idx[String(head[i])] = i;
  return idx;
}

/** 掃第一欄找 id 在第幾列。找不到回 0 */
function rowOfId_(sh, id) {
  var last = lastIdRow_(sh);
  if (last < 2) return 0;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === id) return i + 2;
  }
  return 0;
}

function truthyIn_(v) {
  return v === true || v === 1 || String(v).toUpperCase() === 'TRUE';
}

/**
 * 驗商品。回傳錯誤訊息陣列，空陣列代表通過。
 *
 * 分開寫是為了能單獨測（見 testValidate）。一道從來沒失敗過的驗證
 * 等同於沒有驗證 —— 你分不出它是真的在擋，還是條件寫錯了永遠通過。
 */
function validateProduct_(p, cats, houses) {
  var errs = [];
  var id = String(p.id || '').trim();

  if (!/^[a-z0-9-]{3,40}$/.test(id)) {
    errs.push('id 必須是 3–40 個小寫英數或連字號，收到「' + id + '」');
  }
  if (!p.name_zh || !String(p.name_zh).trim()) {
    errs.push('中文品名不能空白 —— 前台缺其他語言會回退中文，中文缺了就沒有東西可退');
  }
  if (cats.indexOf(String(p.category)) === -1) {
    errs.push('品類「' + p.category + '」不存在，可用的有：' + cats.join(' / '));
  }
  if (houses.indexOf(String(p.house)) === -1) {
    errs.push('品牌「' + p.house + '」不存在，可用的有：' + houses.join(' / '));
  }
  if (p.price !== undefined && p.price !== '' && isNaN(Number(p.price))) {
    errs.push('售價必須是數字，收到「' + p.price + '」');
  }
  // 勾了要公開卻沒填價格，前台會出現一個空的價格欄
  if (truthyIn_(p.price_public) && (p.price === undefined || String(p.price).trim() === '')) {
    errs.push('勾了「在前台顯示價格」就必須填售價');
  }
  if (p.order !== undefined && p.order !== '' && isNaN(Number(p.order))) {
    errs.push('排序必須是數字');
  }
  return errs;
}

/* ══ 商品讀寫 ══════════════════════════════════════════════════════ */

/**
 * 建立或更新一件商品。
 *
 * id 存在就更新那一列，不存在就附加。**不接受改 id** ——
 * id 是主鍵，改了等於換一件商品，而舊的影像鍵、舊的網址會全部指向錯的東西。
 */
function opSave_(b) {
  var p = b.product;
  if (!p || typeof p !== 'object') return { ok: false, err: 'bad-product' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, err: 'busy' }; }

  try {
    var ss = openBook_();
    var sh = ss.getSheetByName('products');
    if (!sh) return { ok: false, err: 'no-sheet' };

    var id = String(p.id || '').trim();
    var idx = headIndex_(sh);
    var row = id ? rowOfId_(sh, id) : 0;
    var creating = row === 0;

    // 白名單之外的鍵要回報，不能靜默丟掉。前端多送一個 supplier_phone
    // 而我們默默忽略的話，操作者會以為存進去了
    var allowed = writableCols_();
    var rejected = [];
    for (var k in p) if (allowed.indexOf(k) === -1) rejected.push(k);

    var width = COLS.products.length;
    var values = creating
      ? new Array(width)
      : sh.getRange(row, 1, 1, width).getValues()[0];
    if (creating) for (var z = 0; z < width; z++) values[z] = '';

    for (var i = 0; i < allowed.length; i++) {
      var col = allowed[i];
      if (col === 'id') { values[idx.id] = id; continue; }
      if (!(col in p)) continue;                       // 沒送的欄位保持原值
      var v = p[col];
      if (BOOL_COLS.indexOf(col) !== -1) v = truthyIn_(v);
      else if (NUM_COLS.indexOf(col) !== -1) v = v === '' ? '' : Number(v);
      else v = String(v === null || v === undefined ? '' : v);
      values[idx[col]] = v;
    }

    // 🔴 驗「合併後」的結果，不是驗「送進來的東西」。
    //
    // 上面那個迴圈支援部分更新（沒送的欄位保持原值），所以只送
    // { id, name_zh } 是合法的用法。但如果拿 p 去驗，缺席的 category
    // 與 house 會被判定成「不存在的品類」而整筆被拒 ——
    // 註解說支援部分更新、實際上不支援，是最難查的那種不一致。
    // 這個 bug 是 testWriteCycle 抓到的（2026-09-06）。
    var merged = {};
    for (var m = 0; m < COLS.products.length; m++) merged[COLS.products[m]] = values[m];
    var errs = validateProduct_(merged, readKeys_(ss, 'categories'), readKeys_(ss, 'houses'));
    if (errs.length) return { ok: false, err: 'invalid', detail: errs };

    values[idx.updated] = today_();
    if (creating) values[idx.deleted] = false;

    var target = creating ? lastIdRow_(sh) + 1 : row;
    ensureRows_(sh, target + 1);
    sh.getRange(target, 1, 1, width).setValues([values]);
    SpreadsheetApp.flush();

    // 寫完讀回來比對。setValues 靜默失敗會變成「以為存好了」，
    // 而那要到下次發布才會被發現 —— 那時已經很難回推是哪一步掉的
    var back = sh.getRange(target, 1, 1, width).getValues()[0];
    if (String(back[idx.id]) !== id) {
      return { ok: false, err: 'write-failed', detail: '寫入第 ' + target + ' 列後讀回的 id 是「' + back[idx.id] + '」' };
    }

    audit_('save', true, (creating ? '新增 ' : '更新 ') + id + '（第 ' + target + ' 列）');
    return {
      ok: true, id: id, row: target, created: creating,
      updated: values[idx.updated],
      ignored: rejected.length ? rejected : undefined
    };
  } finally {
    lock.releaseLock();
  }
}

/** 讀某張分頁的 key 欄，用來驗下拉值。順便當「分頁還在不在」的檢查 */
function readKeys_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var last = lastIdRow_(sh);
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); })
    .filter(function (s) { return s !== ''; });
}

/**
 * 軟刪除。
 *
 * 不真的刪列：id 永不回收。真刪掉的話，日後有人建一件同名商品，
 * 舊的影像鍵、外部連結、搜尋引擎的索引會全部指向新的那件東西。
 */
function opDelete_(b) {
  var id = String(b.id || '').trim();
  if (!id) return { ok: false, err: 'no-id' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, err: 'busy' }; }

  try {
    var sh = openBook_().getSheetByName('products');
    var row = rowOfId_(sh, id);
    if (!row) return { ok: false, err: 'not-found' };

    var idx = headIndex_(sh);
    var restore = b.restore === true;
    sh.getRange(row, idx.deleted + 1).setValue(!restore);
    sh.getRange(row, idx.updated + 1).setValue(today_());
    SpreadsheetApp.flush();

    audit_('delete', true, (restore ? '復原 ' : '刪除 ') + id);
    return { ok: true, id: id, deleted: !restore };
  } finally {
    lock.releaseLock();
  }
}

/* ══ 成本：單筆查詢，而且會留下紀錄 ═══════════════════════════════ */

/**
 * 查一件商品的成本。
 *
 * 刻意做成單筆而不是隨清單一起回：即使令牌外洩，攻擊者也拿不到整批 FOB 價，
 * 只能一件一件問，而且**每一次都會寫進 audit 分頁**。
 * 那張表是事後唯一的鑑識依據，所以寫入失敗也不能讓查詢成功 ——
 * 這是這個檔案裡唯一一處「記帳失敗就整個失敗」。
 */
function opCost_(b) {
  var id = String(b.id || '').trim();
  if (!id) return { ok: false, err: 'no-id' };

  var ss = openBook_();
  var sh = ss.getSheetByName('products_private');
  if (!sh) return { ok: false, err: 'no-sheet' };

  // 先記錄再回傳。順序顛倒的話，查完才記帳，中間掛掉就查得到又沒有紀錄
  var logged = false;
  try {
    var a = ss.getSheetByName('audit');
    if (a) { a.appendRow([nowIso_(), 'cost', 'TRUE', '查看成本：' + id]); logged = true; }
  } catch (e) { /* 下面會擋 */ }
  if (!logged) return { ok: false, err: 'audit-failed', detail: '寫不進操作紀錄，因此不回傳成本' };

  var row = rowOfId_(sh, id);
  if (!row) return { ok: true, id: id, found: false };

  var idx = headIndex_(sh);
  var vals = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
  return {
    ok: true, id: id, found: true,
    cost: vals[idx.cost],
    ccy: vals[idx.cost_ccy],
    at: vals[idx.cost_updated],
    note: vals[idx.supplier_note]
  };
}

/* ══ 影像 ══════════════════════════════════════════════════════════ */

/** 一格的字元上限是 50000，留餘裕。前端照這個數字切 chunk */
var CHUNK_CHARS = 40000;

/**
 * 寫入一張影像。
 *
 * data 一律加 'w:' 前綴：base64 的字母表含 + 與 /，而 Google Sheets 會把
 * 以 + - = 開頭的儲存格當公式解析，產生 #ERROR! 或直接改寫內容。
 * 兩個字元換來完全不必擔心這件事。
 *
 * 同一個 key 重傳會先清掉舊的 chunk —— 不清的話，新圖比舊圖少一格時
 * 會殘留最後那一格，串接起來就是一個壞掉的檔案，而且 sha256 才會發現。
 */
function opUpload_(b) {
  var key = String(b.key || '').trim();
  if (!/^[a-z0-9-]{3,60}$/.test(key)) return { ok: false, err: 'bad-key' };
  var chunks = b.chunks;
  if (!chunks || !chunks.length) return { ok: false, err: 'no-data' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { ok: false, err: 'busy' }; }

  try {
    // 影像在另一份試算表（見 Setup.gs 的 IN_IMAGE_BOOK）
    var sh = openImages_().getSheetByName('images');
    if (!sh) return { ok: false, err: 'no-sheet' };
    var idx = headIndex_(sh);
    var width = COLS.images.length;

    // 先刪掉這個 key 的舊列。由下往上刪，否則刪一列之後下面的索引全部位移
    var last = lastIdRow_(sh);
    if (last >= 2) {
      var keys = sh.getRange(2, 1, last - 1, 1).getValues();
      for (var i = keys.length - 1; i >= 0; i--) {
        if (String(keys[i][0]).trim() === key) sh.deleteRow(i + 2);
      }
      SpreadsheetApp.flush();
    }

    var rows = [];
    for (var c = 0; c < chunks.length; c++) {
      var ch = chunks[c];
      var data = String(ch.data || '');
      if (data.length > CHUNK_CHARS + 2) {
        return { ok: false, err: 'chunk-too-big', detail: '第 ' + c + ' 格 ' + data.length + ' 字元，上限 ' + CHUNK_CHARS };
      }
      var r = new Array(width);
      for (var z = 0; z < width; z++) r[z] = '';
      r[idx.key] = key;
      r[idx.chunk] = c;
      r[idx.total] = chunks.length;
      r[idx.mime] = String(b.mime || 'image/webp');
      r[idx.alpha] = b.alpha === true;
      r[idx.sha256] = String(b.sha256 || '');
      r[idx.bytes] = Number(b.bytes || 0);
      r[idx.data] = data.indexOf('w:') === 0 ? data : 'w:' + data;
      rows.push(r);
    }

    var at = lastIdRow_(sh) + 1;
    ensureRows_(sh, at + rows.length + 1);
    sh.getRange(at, 1, rows.length, width).setValues(rows);
    SpreadsheetApp.flush();

    audit_('upload', true, key + '：' + rows.length + ' 格、' + (b.bytes || 0) + ' bytes');
    return { ok: true, key: key, chunks: rows.length, bytes: Number(b.bytes || 0) };
  } finally {
    lock.releaseLock();
  }
}

/** 讀一張影像的全部 chunk，照 chunk 排序好再回 */
function opImage_(b) {
  var key = String(b.key || '').trim();
  if (!key) return { ok: false, err: 'no-key' };

  var sh = openImages_().getSheetByName('images');
  if (!sh) return { ok: false, err: 'no-sheet' };
  var last = lastIdRow_(sh);
  if (last < 2) return { ok: true, key: key, found: false };

  var idx = headIndex_(sh);
  var vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  var mine = [];
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][idx.key]).trim() === key) mine.push(vals[i]);
  }
  if (!mine.length) return { ok: true, key: key, found: false };

  mine.sort(function (a, z) { return Number(a[idx.chunk]) - Number(z[idx.chunk]); });

  // 缺格要說出來。串接一份缺了中間一格的 base64 會得到一個「看起來像檔案」
  // 的東西，瀏覽器只會顯示破圖，沒有人知道為什麼
  var total = Number(mine[0][idx.total]) || mine.length;
  if (mine.length !== total) {
    return { ok: false, err: 'incomplete', detail: '應有 ' + total + ' 格，只找到 ' + mine.length + ' 格' };
  }

  var data = '';
  for (var j = 0; j < mine.length; j++) {
    var d = String(mine[j][idx.data]);
    data += d.indexOf('w:') === 0 ? d.substring(2) : d;
  }
  return {
    ok: true, key: key, found: true,
    mime: mine[0][idx.mime], alpha: truthyIn_(mine[0][idx.alpha]),
    sha256: mine[0][idx.sha256], bytes: Number(mine[0][idx.bytes]) || 0,
    chunks: mine.length, data: data
  };
}

/* ══ 發布：代打 GitHub API ═════════════════════════════════════════ */

/**
 * 觸發 GitHub Actions 重建。
 *
 * 為什麼由 Apps Script 代打而不是瀏覽器直接呼叫：GitHub 的 token 只要
 * 進了前端 bundle 就等於公開。放在指令碼屬性裡，瀏覽器從頭到尾看不到它。
 *
 * 🔴 repository_dispatch 只在**預設分支**上觸發。目前工作分支是 Velora2，
 *    合併回 main 之前按下去，GitHub 會回 204 成功但什麼都不會發生 ——
 *    完全沒有錯誤訊號，是最難查的那種失敗。
 */
function opPublish_(b) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('GH_TOKEN');
  var repo = props.getProperty('GH_REPO');
  if (!token || !repo) {
    return { ok: false, err: 'not-configured',
             detail: '請在指令碼屬性設定 GH_TOKEN（fine-grained PAT，只需 Contents: Read and write）與 GH_REPO（帳號/repo）' };
  }

  var res = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/dispatches', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ event_type: 'velora-publish' }),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  if (code !== 204) {
    // 🔴 權限不足時 GitHub 回 404 不是 403 —— 它不想透露 repo 是否存在。
    // 所以「404」在這裡幾乎一定是 token 權限問題，不是網址打錯
    var hint = code === 404
      ? 'GitHub 回 404。權限不足時它回的就是 404 而不是 403，所以八成是 PAT 沒有這個 repo 的 Contents: Read and write 權限，或 repo 名稱寫錯。'
      : '';
    audit_('publish', false, 'HTTP ' + code);
    return { ok: false, err: 'github', code: code, body: res.getContentText().slice(0, 300), hint: hint };
  }

  props.setProperty('last_publish', nowIso_());
  audit_('publish', true, '已送出 repository_dispatch');
  return { ok: true, at: nowIso_() };
}

/**
 * 查最近的建置狀態。
 *
 * 查最近 3 個 run 而不是只看最新那個：deploy.yml 有 cancel-in-progress，
 * 連按兩次發布時舊的那個會變成 cancelled。只看最新的話，第一次的
 * cancelled 會被當成「失敗」顯示給操作者，但其實有新的接手了。
 *
 * 回應快取 20 秒。CacheService 在這裡是安全的用途 —— 被逐出只是多打一次
 * GitHub API，不像鎖定計數那樣被逐出就等於失效。
 */
function opStatus_() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('GH_TOKEN');
  var repo = props.getProperty('GH_REPO');
  if (!token || !repo) return { ok: false, err: 'not-configured' };

  var cache = CacheService.getScriptCache();
  var hit = cache.get('gh_status');
  if (hit) {
    var o = JSON.parse(hit);
    o.cached = true;
    return o;
  }

  var res = UrlFetchApp.fetch(
    'https://api.github.com/repos/' + repo + '/actions/runs?per_page=3',
    { headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
      muteHttpExceptions: true });

  if (res.getResponseCode() !== 200) {
    return { ok: false, err: 'github', code: res.getResponseCode() };
  }

  var runs = (JSON.parse(res.getContentText()).workflow_runs || []).map(function (r) {
    return {
      id: r.id, status: r.status, conclusion: r.conclusion,
      started: r.run_started_at, url: r.html_url, event: r.event
    };
  });

  var live = null;
  for (var i = 0; i < runs.length; i++) {
    if (runs[i].status === 'queued' || runs[i].status === 'in_progress') { live = runs[i]; break; }
  }
  // 有新的在跑，就不要把舊的 cancelled 報成失敗
  var newest = runs[0] || null;
  var state = live ? live.status
    : (newest ? (newest.conclusion === 'cancelled' && runs.length > 1 ? 'superseded' : newest.conclusion) : 'none');

  var out = { ok: true, state: state, runs: runs, last_publish: props.getProperty('last_publish') || null };
  cache.put('gh_status', JSON.stringify(out), 20);
  return out;
}

/* ══ 編輯器裡跑的測試 ══════════════════════════════════════════════ */

/**
 * 驗 validateProduct_ 真的會擋。
 *
 * 這支不碰試算表，純函式測試，隨時可以跑。
 */
function testValidate() {
  var cats = ['fragrance', 'scarf', 'jewelry', 'phonebag'];
  var houses = ['vuca', 'saintmari'];
  var base = { id: 'test-item', name_zh: '測試', category: 'fragrance', house: 'vuca' };
  function w(over) {
    var o = {};
    for (var k in base) o[k] = base[k];
    for (var k2 in over) o[k2] = over[k2];
    return o;
  }
  var cases = [
    ['正常', base, 0],
    ['id 有大寫', w({ id: 'Test-Item' }), 1],
    ['id 太短', w({ id: 'ab' }), 1],
    ['id 有底線', w({ id: 'test_item' }), 1],
    ['中文品名空白', w({ name_zh: '' }), 1],
    ['品類不存在', w({ category: 'nope' }), 1],
    ['品牌不存在', w({ house: 'nope' }), 1],
    ['售價不是數字', w({ price: 'abc' }), 1],
    ['勾公開卻沒填價', w({ price_public: true, price: '' }), 1],
    ['勾公開且有填價', w({ price_public: true, price: 1280 }), 0],
    ['排序不是數字', w({ order: 'x' }), 1]
  ];
  var out = [];
  var bad = 0;
  for (var i = 0; i < cases.length; i++) {
    var name = cases[i][0], obj = cases[i][1], want = cases[i][2];
    var got = validateProduct_(obj, cats, houses).length;
    var okc = (want === 0) === (got === 0);
    if (!okc) bad++;
    out.push((okc ? '  ✓ ' : '  ✗ ') + name + '　預期' + (want ? '擋下' : '放行') +
             '，實際' + (got ? '擋下（' + got + ' 項）' : '放行'));
  }
  var msg = '商品驗證規則\n' + out.join('\n') + '\n\n' +
    (bad ? '✗ ' + bad + ' 項不符預期' : '✓ ' + cases.length + '/' + cases.length + ' 全部符合預期');
  Logger.log(msg);
  return msg;
}

/**
 * 驗 GitHub 的設定對不對，但**不會**真的觸發建置。
 *
 * 打的是 GET /repos/{repo}，那是唯讀的。回應碼就足以分辨三種常見的錯：
 *   200 → 設定正確
 *   404 → 權限不足或 repo 名稱寫錯（GitHub 不想透露 repo 是否存在，
 *         所以權限不夠時回的是 404 而不是 403 —— 這一點很容易誤導）
 *   401 → token 本身無效或已過期
 *
 * 順便把預設分支印出來：repository_dispatch 只在預設分支上觸發，
 * 如果那裡不是你放 deploy.yml 的分支，按發布會「成功但什麼都沒發生」。
 */
function testGithub() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('GH_TOKEN');
  var repo = props.getProperty('GH_REPO');

  if (!token || !repo) {
    return pwSay_(
      '還沒設定。請到「專案設定 → 指令碼屬性」新增這兩個：\n' +
      '  GH_REPO   你的帳號/repo名稱（從 github.com/ 後面那兩段抄）\n' +
      '  GH_TOKEN  Fine-grained token，只需要 Contents: Read and write\n\n' +
      '目前狀態：GH_REPO ' + (repo ? '已設定（' + repo + '）' : '沒有') +
      '、GH_TOKEN ' + (token ? '已設定' : '沒有'));
  }

  var res = UrlFetchApp.fetch('https://api.github.com/repos/' + repo, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();

  if (code === 401) {
    return pwSay_('✗ HTTP 401：token 無效或已過期。重新產生一個貼進 GH_TOKEN。');
  }
  if (code === 404) {
    return pwSay_(
      '✗ HTTP 404。兩種可能，而且 GitHub 不會告訴你是哪一種：\n' +
      '  1. token 沒有這個 repo 的權限（Repository access 沒勾到它，\n' +
      '     或 Contents 沒設成 Read and write）\n' +
      '  2. GH_REPO 打錯了。目前的值是「' + repo + '」\n\n' +
      '權限不足時 GitHub 回的就是 404 而不是 403 —— 它不想透露 repo 存不存在。');
  }
  if (code !== 200) {
    return pwSay_('✗ HTTP ' + code + '\n' + res.getContentText().slice(0, 300));
  }

  var info = JSON.parse(res.getContentText());
  var branch = info.default_branch;
  var warn = branch === 'main' ? '' :
    '\n\n⚠ 這個 repo 的預設分支是「' + branch + '」而不是 main。\n' +
    'repository_dispatch 只在預設分支上觸發 —— 請確認 deploy.yml 在那個分支上，\n' +
    '否則按發布會回成功但什麼都不會發生。';

  return pwSay_(
    '✓ GitHub 設定正確。\n\n' +
    '  repo          ' + info.full_name + '\n' +
    '  預設分支      ' + branch + '\n' +
    '  公開／私有    ' + (info.private ? '私有（GitHub Pages 免費方案不支援）' : '公開') + '\n\n' +
    '這支只做唯讀查詢，沒有觸發任何建置。' + warn);
}

/**
 * 端到端自測：真的寫一件商品進去、讀回來、改一次、軟刪除、再清掉。
 *
 * 用一個固定的測試 id（__selftest__ 不合法，用 zz-selftest），跑完會刪掉那一列。
 * 只在編輯器裡跑，不對外開放。
 */
function testWriteCycle() {
  var out = [];
  var ok = function (c, m) { out.push((c ? '  ✓ ' : '  ✗ ') + m); return c; };
  var ID = 'zz-selftest';

  var r1 = opSave_({ product: {
    id: ID, ref: 'VL · ZZZ · 999', category: 'fragrance', house: 'vuca',
    name_zh: '自測商品', name_en: 'Self Test', name_ko: '셀프 테스트',
    listed: false, order: 999, supplier_phone: '0912345678'
  } });
  ok(r1.ok && r1.created, '建立：' + JSON.stringify(r1).slice(0, 90));
  ok(r1.ignored && r1.ignored.indexOf('supplier_phone') !== -1,
     '白名單之外的欄位被擋下並回報：' + JSON.stringify(r1.ignored));

  var l = opList_();
  var found = null;
  for (var i = 0; i < l.products.length; i++) if (String(l.products[i].id) === ID) found = l.products[i];
  ok(!!found, '清單讀得到');
  ok(found && String(found.name_zh) === '自測商品', '品名正確');
  ok(found && found.listed === false, 'listed 存成布林 false');

  // 只送兩個欄位。這是「部分更新」，其餘欄位要保持原值 ——
  // 2026-09-06 這裡抓到一個真的 bug：驗證拿的是送進來的物件而不是
  // 合併後的結果，所以部分更新永遠會因為「缺 category」被拒。
  var r2 = opSave_({ product: { id: ID, name_zh: '自測商品（改）' } });
  ok(r2.ok && !r2.created && r2.row === r1.row,
     '部分更新落在同一列（' + r2.row + '）' + (r2.ok ? '' : '　→ ' + JSON.stringify(r2.detail)));

  var l2 = opList_();
  var f2 = null;
  for (var j = 0; j < l2.products.length; j++) if (String(l2.products[j].id) === ID) f2 = l2.products[j];
  ok(f2 && String(f2.name_zh) === '自測商品（改）', '改到的欄位有變');
  ok(f2 && String(f2.name_en) === 'Self Test', '沒送的欄位保持原值（name_en）');
  ok(f2 && String(f2.category) === 'fragrance', '沒送的欄位保持原值（category）');

  var r3 = opSave_({ product: { id: ID, category: 'nope' } });
  ok(!r3.ok && r3.err === 'invalid' && r3.detail.length === 1,
     '不存在的品類被擋，而且只報這一項錯（' + (r3.detail || []).length + ' 項）：' +
     JSON.stringify(r3.detail));

  var r4 = opDelete_({ id: ID });
  ok(r4.ok && r4.deleted === true, '軟刪除');

  // 清掉測試列。真的刪列，因為它本來就不該存在
  var sh = openBook_().getSheetByName('products');
  var row = rowOfId_(sh, ID);
  if (row) { sh.deleteRow(row); SpreadsheetApp.flush(); }
  ok(rowOfId_(sh, ID) === 0, '測試列已清除');

  var msg = '寫入流程自測\n' + out.join('\n');
  Logger.log(msg);
  return msg;
}
