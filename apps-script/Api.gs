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
 * 這個 id 被佔用了嗎？**不分大小寫**，而且含已軟刪除的列。
 *
 * 🔴 為什麼要不分大小寫：id 會變成影像檔名的一部分
 * （`<id>-main-<sha8>.webp`）。Sheet 與 Linux 上 VL_FRG_001 和 vl_frg_001
 * 是兩件事，但在 Windows / macOS 的檔案系統上是同一個檔案 ——
 * 產生器在本機寫檔時後者會蓋掉前者，而且不會有任何錯誤。
 *
 * 含已刪除的列：軟刪除承諾 id 永不回收。放行一個刪過的 id，
 * 舊的影像鍵就會接到新商品身上。
 *
 * @param {string} except 這一列自己的 id 不算佔用（改名時用）
 */
function idTaken_(sh, id, except) {
  var last = lastIdRow_(sh);
  if (last < 2) return false;
  var want = String(id).toUpperCase();
  var skip = except === undefined ? null : String(except).toUpperCase();
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    var got = String(ids[i][0]).trim().toUpperCase();
    if (!got || got === skip) continue;
    if (got === want) return true;
  }
  return false;
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

  if (!/^[A-Za-z0-9_-]{3,40}$/.test(id)) {
    errs.push('id 必須是 3–40 個英數、連字號或底線，收到「' + id + '」');
  }
  if (!p.name_zh || !String(p.name_zh).trim()) {
    errs.push('中文品名不能空白 —— 前台缺其他語言會回退中文，中文缺了就沒有東西可退');
  }
  if (cats.indexOf(String(p.category)) === -1) {
    errs.push('品類「' + p.category + '」不存在，可用的有：' + cats.join(' / '));
  }
  // 品牌是選填的 —— 有些商品本來就不掛品牌。空白直接放行；
  // 但填了一個不存在的品牌仍然要擋，那是打錯字不是「不掛品牌」。
  var house = String(p.house == null ? '' : p.house).trim();
  if (house !== '' && houses.indexOf(house) === -1) {
    errs.push('品牌「' + house + '」不存在，可用的有：' + houses.join(' / ') + '（也可以留白，代表不掛品牌）');
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
    // 大小寫撞名只在「新增」時擋 —— 更新既有商品時它當然會撞到自己
    if (creating && !errs.length && idTaken_(sh, id)) {
      errs.push('商品編號「' + id + '」已經有人用了（不分大小寫，也包含已刪除的商品）。' +
                '編號會變成圖片檔名的一部分，只差大小寫的兩個編號在 Windows 上是同一個檔案。');
    }
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

/* ══ 改商品編號 ════════════════════════════════════════════════════ */

/**
 * 改一件商品的編號，連影像鍵一起搬。
 *
 * ── 為什麼影像鍵一定要跟著改 ─────────────────────────────────────────
 *
 * 影像鍵是 `<id>-main`。只改 id 不改鍵的話，舊編號就被釋放出來了 ——
 * 日後有人建一件同名的商品並上傳圖片，opUpload_ 會先刪掉同鍵的舊列
 * 再寫新的，於是**前一件商品的圖片會被悄悄換成新商品的**。
 * 沒有錯誤訊息，要到打開網站才看得到，而那時已經很難回推是哪一步。
 *
 * 所以這支要嘛整組搬完（商品列、三個影像欄、images 分頁、成本列），
 * 要嘛一開始就拒絕。中間狀態不可接受。
 *
 * ── 這支不做的事 ────────────────────────────────────────────────────
 *
 * 不改前台的圖檔網址。檔名是內容定址的（`<鍵>-<sha8>.webp`），鍵變了
 * 檔名就變了 —— 但那是下一次建置的事，改完要重新發布一次。
 *
 * @param {{from:string, to:string}} b
 */
function opRenameId_(b) {
  var from = String(b.from || '').trim();
  var to = String(b.to || '').trim();
  if (!from) return { ok: false, err: 'no-id' };
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(to)) {
    return { ok: false, err: 'invalid',
             detail: ['新的商品編號要 3–40 個英數、連字號或底線，收到「' + to + '」'] };
  }
  if (from === to) return { ok: true, from: from, to: to, changed: false };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { ok: false, err: 'busy' }; }

  try {
    var ss = openBook_();
    var r = renameIdCore_(ss, from, to);
    if (!r.ok) return r;
    audit_('renameId', true, from + ' → ' + to + '（影像鍵 ' + r.keys.length + ' 個）');
    return r;
  } finally {
    lock.releaseLock();
  }
}

/**
 * 改名的實作。opRenameId_ 與批次工具 applyIdRename() 共用同一份 ——
 * 兩條路走不同的程式碼，遲早會有一條漏掉影像鍵。
 *
 * 呼叫端負責取鎖。
 */
function renameIdCore_(ss, from, to) {
  var sh = ss.getSheetByName('products');
  if (!sh) return { ok: false, err: 'no-sheet' };

  var row = rowOfId_(sh, from);
  if (!row) return { ok: false, err: 'not-found', detail: '找不到商品編號「' + from + '」' };

  // 目標不能被佔用（不分大小寫、含已刪除的），但自己不算
  if (idTaken_(sh, to, from)) {
    return { ok: false, err: 'id-taken',
             detail: '商品編號「' + to + '」已經有人用了（不分大小寫，也包含已刪除的商品）' };
  }

  var idx = headIndex_(sh);
  var im = openImages_().getSheetByName('images');
  var imIdx = im ? headIndex_(im) : null;
  var imLast = im ? lastIdRow_(im) : 0;
  var imKeys = (im && imLast >= 2)
    ? im.getRange(2, imIdx.key + 1, imLast - 1, 1).getValues()
    : [];

  /* 先算出「要改哪些影像鍵」並全部檢查完，再開始寫。
     邊檢查邊寫的話，第三個鍵撞名時前兩個已經改掉了。 */
  var plan = [];
  var slots = ['img_main', 'img_2', 'img_3'];
  for (var i = 0; i < slots.length; i++) {
    var cell = String(sh.getRange(row, idx[slots[i]] + 1).getValue() || '').trim();
    if (!cell) continue;
    // 只搬「確實是用舊編號組出來的」鍵。手動填過別的值就原樣留著
    if (cell.indexOf(from + '-') !== 0) continue;
    var newKey = to + cell.substring(from.length);
    if (!/^[A-Za-z0-9_-]{3,60}$/.test(newKey)) {
      return { ok: false, err: 'bad-key',
               detail: '改名後的影像鍵「' + newKey + '」不合法' };
    }
    for (var j = 0; j < imKeys.length; j++) {
      if (String(imKeys[j][0]).trim() === newKey) {
        return { ok: false, err: 'key-taken',
                 detail: 'images 分頁已經有影像鍵「' + newKey + '」，改名會蓋掉別人的圖' };
      }
    }
    plan.push({ slot: slots[i], from: cell, to: newKey });
  }

  /* ── 開始寫。順序：images 分頁 → 商品的影像欄 → 商品 id → 成本列 ──
     先搬 images：中途失敗的話，商品仍指著舊鍵，而舊鍵還在，圖還看得到。
     反過來先改 id 的話，中途失敗會留下一件指向不存在影像的商品。 */
  for (var k = 0; k < plan.length; k++) {
    for (var m = 0; m < imKeys.length; m++) {
      if (String(imKeys[m][0]).trim() === plan[k].from) {
        im.getRange(m + 2, imIdx.key + 1).setValue(plan[k].to);
      }
    }
    sh.getRange(row, idx[plan[k].slot] + 1).setValue(plan[k].to);
  }
  if (plan.length) SpreadsheetApp.flush();

  sh.getRange(row, idx.id + 1).setValue(to);
  sh.getRange(row, idx.updated + 1).setValue(today_());
  SpreadsheetApp.flush();

  var back = String(sh.getRange(row, idx.id + 1).getValue()).trim();
  if (back !== to) {
    return { ok: false, err: 'write-failed',
             detail: '寫入第 ' + row + ' 列後讀回的編號是「' + back + '」' };
  }

  // 成本列跟著搬。這張分頁也以 id 當鍵，不搬就變成孤兒
  var pv = ss.getSheetByName('products_private');
  if (pv) {
    var pvRow = rowOfId_(pv, from);
    if (pvRow) pv.getRange(pvRow, 1).setValue(to);
  }

  return { ok: true, from: from, to: to, changed: true, row: row,
           keys: plan.map(function (x) { return x.from + ' → ' + x.to; }) };
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
  // 🔴 這條要跟 validateProduct_ 的 id 規則一致（多 20 字給 -main 這類後綴）。
  // 影像鍵是 <id>-main，所以 id 放行、這裡不放行的字元會變成
  // 「存得起來但傳不了圖」——2026-09-07 底線就是這樣被擋掉的
  if (!/^[A-Za-z0-9_-]{3,60}$/.test(key)) return { ok: false, err: 'bad-key' };
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
      // 縮圖只放第 0 格那一列。放每一列會讓 23 張圖多存幾十份一樣的東西，
      // 而讀的那一邊（opImageIndex_）本來就只看每個鍵的第一列。
      // idx.thumb 是 undefined 代表分頁還沒補欄 —— 這時就不寫，
      // 上傳照樣成功，只是縮圖那條退回原本的公開網址／API 路徑。
      if (c === 0 && idx.thumb !== undefined && b.thumb) {
        r[idx.thumb] = 'w:' + String(b.thumb).replace(/^w:/, '');
      }
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


/**
 * 影像索引：只回中繼資料，不回位元組。
 *
 * ── 這支存在的理由 ──────────────────────────────────────────────────
 *
 * 後台清單原本每張縮圖都打一次 op:'image'，一次約兩秒、十三張要等十秒。
 * 但那些圖在前台早就烤成實體檔案了，而且檔名是**內容定址**的：
 *
 *     <影像鍵>-<sha256 前 8 碼>[.cut].<副檔名>
 *
 * sha256 就在這張分頁裡。所以後台只要拿到「鍵 → sha / mime / alpha」，
 * 就能自己算出公開網址，讓瀏覽器直接載 —— 而且會被瀏覽器快取。
 *
 * 23 張圖的索引約 2KB，一次請求就拿完。
 *
 * 算錯或那張圖還沒發布時，<img> 會 404，前端再退回 op:'image'。
 * 所以這個最佳化不會有「猜錯就壞掉」的風險，只會退回原本的速度。
 */
function opImageIndex_() {
  var sh = openImages_().getSheetByName('images');
  if (!sh) return { ok: false, err: 'no-sheet' };

  var last = lastIdRow_(sh);
  if (last < 2) return { ok: true, images: [] };

  var idx = headIndex_(sh);
  var vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();

  // 一張圖可能佔多列（chunk），索引只要每個鍵的第一列
  var seen = {};
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var key = String(vals[i][idx.key]).trim();
    if (!key || seen[key]) continue;
    seen[key] = true;
    var thumb = idx.thumb === undefined ? '' : String(vals[i][idx.thumb] || '');
    out.push({
      key: key,
      sha256: String(vals[i][idx.sha256] || ''),
      mime: String(vals[i][idx.mime] || 'image/webp'),
      alpha: truthyIn_(vals[i][idx.alpha]),
      bytes: Number(vals[i][idx.bytes]) || 0,
      // 96px 的 WebP，約 1.5KB。後台清單直接拿它畫，不必等公開網址或 API。
      // 還沒回填的圖這裡是空字串，前端會自動退回原本那兩條路。
      thumb: thumb.indexOf('w:') === 0 ? thumb.substring(2) : thumb
    });
  }
  return { ok: true, images: out };
}

/**
 * 只回填一張圖的縮圖，不動位元組。
 *
 * 為什麼不用 opUpload_ 重傳：那支會先刪光這個鍵的所有 chunk 再重寫，
 * 等於為了一張 1.5KB 的縮圖把 100KB 的原圖搬一次 —— 而且中間掛掉
 * 就會留下一張只刪不寫的空圖。這支只碰第 0 格那一列的 thumb 欄。
 */
function opSaveThumb_(b) {
  var key = String(b.key || '').trim();
  if (!key) return { ok: false, err: 'no-key' };
  var thumb = String(b.thumb || '');
  if (!thumb) return { ok: false, err: 'no-data' };
  if (thumb.length > CHUNK_CHARS) {
    return { ok: false, err: 'chunk-too-big', detail: '縮圖 ' + thumb.length + ' 字元，上限 ' + CHUNK_CHARS };
  }

  var sh = openImages_().getSheetByName('images');
  if (!sh) return { ok: false, err: 'no-sheet' };
  var idx = headIndex_(sh);
  if (idx.thumb === undefined) {
    return { ok: false, err: 'no-thumb-col', detail: 'images 分頁還沒有 thumb 欄，請先在 Apps Script 編輯器執行 addThumbColumn()' };
  }

  var last = lastIdRow_(sh);
  if (last < 2) return { ok: true, key: key, found: false };

  // 找這個鍵的第 0 格。chunk 不一定照順序排（重傳過的會排在後面），
  // 所以是比對 chunk 欄的值，不是取第一個遇到的列
  var vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][idx.key]).trim() !== key) continue;
    if (Number(vals[i][idx.chunk]) !== 0) continue;
    sh.getRange(i + 2, idx.thumb + 1).setValue('w:' + thumb.replace(/^w:/, ''));
    SpreadsheetApp.flush();
    return { ok: true, key: key, found: true, chars: thumb.length };
  }
  return { ok: true, key: key, found: false };
}

/* ══ 品牌 ══════════════════════════════════════════════════════════ */

/** 前台的品牌區最多排四格。超過就不是「代理幾家」而是另一種版面了 */
var MAX_HOUSES = 4;

function validateHouse_(h) {
  var errs = [];
  var key = String(h.key || '').trim();
  if (!/^[a-z0-9-]{2,40}$/.test(key)) {
    errs.push('品牌代碼必須是 2–40 個小寫英數或連字號，收到「' + key + '」');
  }
  if (!String(h.name || '').trim()) {
    errs.push('品牌名稱不能空白');
  }
  return errs;
}

/**
 * 建立或更新一個品牌。
 *
 * key 是主鍵，跟商品的 id 一樣建立後不可改 —— 商品的 house 欄存的就是它，
 * 改了等於把所有掛著的商品指向一個不存在的品牌，而那個斷鏈要到發布之後
 * 才會在前台顯現。
 */
function opSaveHouse_(b) {
  var h = b.house;
  if (!h || typeof h !== 'object') return { ok: false, err: 'bad-house' };

  var errs = validateHouse_(h);
  if (errs.length) return { ok: false, err: 'invalid', detail: errs };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, err: 'busy' }; }

  try {
    var ss = openBook_();
    var sh = ss.getSheetByName('houses');
    if (!sh) return { ok: false, err: 'no-sheet' };

    var key = String(h.key).trim();
    var idx = headIndex_(sh);
    var row = rowOfId_(sh, key);
    var creating = row === 0;

    // 上限只擋「新增」。既有的四家仍然能編輯，不然改一個錯字都做不到
    if (creating) {
      var existing = readKeys_(ss, 'houses').length;
      if (existing >= MAX_HOUSES) {
        return { ok: false, err: 'too-many',
                 detail: '最多 ' + MAX_HOUSES + ' 個品牌，目前已有 ' + existing + ' 個。要新增請先刪掉一個。' };
      }
    }

    var width = COLS.houses.length;
    var values = creating ? new Array(width) : sh.getRange(row, 1, 1, width).getValues()[0];
    if (creating) for (var z = 0; z < width; z++) values[z] = '';

    for (var i = 0; i < COLS.houses.length; i++) {
      var col = COLS.houses[i];
      if (col === 'key') { values[idx.key] = key; continue; }
      if (!(col in h)) continue;                       // 沒送的欄位保持原值
      values[idx[col]] = col === 'listed' ? truthyIn_(h[col])
        : String(h[col] === null || h[col] === undefined ? '' : h[col]);
    }

    var target = creating ? lastIdRow_(sh) + 1 : row;
    ensureRows_(sh, target + 1);
    sh.getRange(target, 1, 1, width).setValues([values]);
    SpreadsheetApp.flush();

    var back = sh.getRange(target, 1, 1, width).getValues()[0];
    if (String(back[idx.key]) !== key) {
      return { ok: false, err: 'write-failed', detail: '寫入第 ' + target + ' 列後讀回的代碼是「' + back[idx.key] + '」' };
    }

    audit_('saveHouse', true, (creating ? '新增品牌 ' : '更新品牌 ') + key + '（第 ' + target + ' 列）');
    return { ok: true, key: key, row: target, created: creating };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 刪除一個品牌。
 *
 * 🔴 還有商品掛著就不刪。品牌是硬刪（houses 沒有 deleted 欄），刪掉之後
 *    那些商品的 house 欄會指向一個不存在的代碼 —— 而 validateProduct_
 *    會從此擋下每一次儲存，錯誤訊息說「品牌不存在」，但沒有人記得
 *    是哪一步刪的。要停掉一個品牌應該關掉 listed，那是可逆的。
 */
function opDeleteHouse_(b) {
  var key = String(b.key || '').trim();
  if (!key) return { ok: false, err: 'no-key' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, err: 'busy' }; }

  try {
    var ss = openBook_();
    var sh = ss.getSheetByName('houses');
    if (!sh) return { ok: false, err: 'no-sheet' };

    var ph = ss.getSheetByName('products');
    if (!ph) return { ok: false, err: 'no-sheet' };
    var pidx = headIndex_(ph);
    var plast = lastIdRow_(ph);
    var used = 0;
    if (plast >= 2) {
      var prows = ph.getRange(2, 1, plast - 1, ph.getLastColumn()).getValues();
      for (var i = 0; i < prows.length; i++) {
        if (truthyIn_(prows[i][pidx.deleted])) continue;
        if (String(prows[i][pidx.house]).trim() === key) used++;
      }
    }
    if (used) {
      return { ok: false, err: 'house-in-use',
               detail: '還有 ' + used + ' 件商品掛著這個品牌。要停掉它請改成不顯示在前台（那是可逆的），' +
                       '或先把那些商品改成不掛品牌。' };
    }

    var row = rowOfId_(sh, key);
    if (!row) return { ok: true, key: key, found: false };
    sh.deleteRow(row);
    SpreadsheetApp.flush();

    audit_('deleteHouse', true, '刪除品牌 ' + key + '（原第 ' + row + ' 列）');
    return { ok: true, key: key, found: true };
  } finally {
    lock.releaseLock();
  }
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
    ['品牌留白（選填）', w({ house: '' }), 0],
    ['品牌整個沒給', w({ house: undefined }), 0],
    ['品牌只有空白字元', w({ house: '   ' }), 0],
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
