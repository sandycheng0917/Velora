/**
 * 一次性建表：把空白試算表建成維羅拉的商品資料庫。
 *
 * 用法（在 Apps Script 編輯器裡）：
 *   函式下拉選 setupSheets → 按「執行」。就這樣。
 *
 *   第一次會跳授權：選你的帳號 → 進階 → 前往「未驗證」→ 允許。
 *   腳本沒經過 Google 驗證是正常的，它是你自己的腳本。
 *
 *   沒有設 SHEET_ID 的話，它會自己在你的雲端硬碟建一份「Velora 商品資料」，
 *   把 ID 記進指令碼屬性，並在執行紀錄印出網址。
 *   想指定某份既有的試算表，才需要自己先設好 SHEET_ID 這個指令碼屬性。
 *
 * 可以重複執行：已存在的分頁不會被清空，只補上缺的欄位與設定。
 * 唯一會被覆寫的是第一列的標題與格式。
 *
 * 為什麼用程式建而不是手動開：40 個欄位、6 個分頁、下拉選單、核取方塊、
 * 保護範圍 —— 手動開一次要半小時，而且改欄位時沒有可靠的方式重做一遍。
 */

/* ── 欄位定義：這裡是唯一真實來源 ────────────────────────────────────
   產生器、後台表單、驗證都以這份為準。改欄位只改這裡。 */

var COLS = {
  /**
   * 商品主表。只放「可以公開」的欄位 —— 成本在另一張表，
   * 這不是紀律問題而是結構問題：匯出端點的程式碼裡根本沒有那張表的名字。
   */
  products: [
    'id',            // 主鍵，^[a-z0-9_-]{3,40}$，建立後不可改
    'ref',           // VL · SLK · 001
    'category',      // 下拉，取自 categories 分頁
    'house',         // 下拉，取自 houses 分頁
    'name_zh', 'name_en', 'name_ko',
    'tagline_zh', 'tagline_en', 'tagline_ko',
    'desc_zh', 'desc_en', 'desc_ko',
    'material_zh', 'material_en', 'material_ko',
    'spec_zh', 'spec_en', 'spec_ko',
    // 香調只有香氛用得到，其餘品類留空。分號分隔：水蜜桃;綠意;葡萄柚
    'notes_top_zh', 'notes_top_en', 'notes_top_ko',
    'notes_mid_zh', 'notes_mid_en', 'notes_mid_ko',
    'notes_base_zh', 'notes_base_en', 'notes_base_ko',
    'hs',            // 3307.49.0000
    'origin',        // KR
    'price',         // 建議售價（TWD）
    'price_public',  // 核取方塊。FALSE 時 price 連輸出都不會產生
    'listed',        // 核取方塊
    'featured',      // 核取方塊，首頁精選
    'order',         // 整數，同品類內的排序
    'img_main', 'img_2', 'img_3',   // 影像鍵，對應 images 分頁的 key
    'updated',       // YYYY-MM-DD，由程式寫入
    'deleted'        // 軟刪除。id 永不回收，避免舊圖與舊連結對到別件商品
  ],

  /**
   * 機密表。CI 的匯出端點完全讀不到這張 ——
   * 不是「有檢查所以讀不到」，是程式碼路徑上沒有它。
   */
  products_private: ['id', 'cost', 'cost_ccy', 'cost_updated', 'supplier_note'],

  /**
   * 影像位元組。一列一個 chunk。
   * data 欄一律有 'w:' 前綴：base64 字母表含 + 與 /，而 Google Sheets 會把
   * 以 + - = 開頭的儲存格當公式解析，產生 #ERROR! 或直接改寫內容。
   * 前綴是兩個字元的防呆，產生器 slice(2) 剝掉。
   */
  images: ['key', 'chunk', 'total', 'mime', 'alpha', 'sha256', 'bytes', 'data',
           // 96px 的縮圖，整張塞在第 0 格那一列（其餘 chunk 列留白）。
           // 後台清單靠它一次把整頁縮圖畫出來，不必逐張打 op:'image' ——
           // 本機開發與「剛上傳還沒發布」這兩種情況本來就沒有公開網址可指。
           // 一張約 1.5KB，23 張連同索引一起回也才 40KB。
           'thumb'],

  /**
   * 品牌。listed 是**整個品牌的開關** —— 取消勾選，這個品牌的所有商品
   * 都不會進前台，品牌介紹也不會出現。
   *
   * 為什麼不用「逐件把商品下架」：代理關係是整包的，暫停代理時要動的是
   * 一整個品牌。八件商品逐一取消勾選，恢復時要記得是哪八件 ——
   * 那種狀態沒有人記得住，最後一定會漏。
   */
  houses: ['key', 'name', 'name_ko', 'country_zh', 'country_en', 'country_ko',
           'tagline', 'intro_zh', 'intro_en', 'intro_ko', 'listed'],

  /**
   * 品類。name_* 與 short_* 是兩組刻意不同的名字：
   *   name_*   前台導覽列用。「純銀飾品」講得出材質，「飾品」什麼都沒說。
   *   short_*  後台篩選頁籤用。那裡橫向空間有限，長名字會擠掉搜尋框。
   * cover 是品類格的封面圖路徑，相對路徑（不含站台前綴），由產生器補上前綴。
   */
  categories: ['key', 'code', 'ref', 'name_zh', 'name_en', 'name_ko',
               'short_zh', 'short_en', 'short_ko', 'cover', 'order'],

  /** 操作日誌。事後要查「誰在什麼時候動了什麼」只有這裡有依據 */
  audit: ['at', 'op', 'ok', 'note']
};

/** 建立後不可更動的欄位。後台的儲存端會擋下對這些欄的修改 */
var IMMUTABLE = ['id'];

/**
 * 這些分頁放在「另一份」試算表裡。
 *
 * 🔴 為什麼要分開：base64 一格四萬字元。Google Sheets 會把每一格的內容
 *    都載進瀏覽器並渲染，二十幾列就足以讓整個檔案捲動卡頓 ——
 *    而且是連帶拖慢你真正在編輯的 products 分頁。
 *
 *    分成兩個檔案之後，你平常開的那份只有純文字，維持原本的速度；
 *    影像那份你永遠不需要打開。
 *
 * 代價是多一個 ID 要管（指令碼屬性 IMAGES_SHEET_ID），
 * 而且備份時兩份都要備。
 */
var IN_IMAGE_BOOK = ['images'];

/* ── 種子資料：從現有的 catalog.js 搬過來，不是憑空編的 ─────────────── */

var SEED_CATEGORIES = [
  ['fragrance', 'FRAGRANCE', 'FRG', '居家香氛', 'Home Fragrance',   '홈 프래그런스',
   '香氛',   'Fragrance',  '프래그런스', '/media/vuca/bedroom.jpg',              1],
  ['scarf',     'SCARF',     'SLK', '真絲長巾', 'Silk Scarves',     '실크 스카프',
   '絲巾',   'Scarves',    '스카프',     '/media/saintmari/scarf-camel-blazer.jpg', 2],
  ['jewelry',   'JEWELRY',   'JWL', '純銀飾品', 'Sterling Jewelry', '실버 주얼리',
   '飾品',   'Jewelry',    '주얼리',     '/media/saintmari/necklace-01.png',     3],
  // 手機包目前 0 件。前台會自動略過沒有商品的品類，所以沒有封面圖不影響版面
  ['phonebag',  'PHONEBAG',  'BAG', '手機包',   'Phone bags',       '폰백',
   '手機包', 'Phone bags', '폰백',       '',                                     4]
];

var SEED_HOUSES = [
  ['vuca', 'VUCA', '부카', '韓國', 'Korea', '한국', 'Always be with you.',
   '首爾的居家香氛品牌，主張香氣是空間的一部分而非附加品。香精配方符合 IFRA 國際香精協會標準，基劑採用玉米萃取植物乙醇，並通過七項有害物質檢驗。',
   'A Seoul home-fragrance house that treats scent as part of a room, not an accessory to it. Formulated to IFRA standards on a base of corn-derived plant ethanol, and tested for seven key harmful substances.',
   '향을 공간의 일부로 다루는 서울의 홈 프래그런스 브랜드. IFRA 기준에 맞춘 향료와 옥수수 유래 식물성 에탄올 베이스, 7가지 유해물질 검사를 통과했습니다.',
   true],
  ['saintmari', 'SAINTMARI', '세인트메리', '韓國', 'Korea', '한국', 'Quiet ornament for everyday.',
   '韓國時尚配件品牌，做真絲長巾與純銀首飾。設計克制，靠比例與收邊說話 —— 是每天戴的東西，不是場合才拿出來的。',
   'A Korean accessories label making silk scarves and sterling jewelry. The design is restrained and speaks through proportion and finish — things you wear daily, not only for occasions.',
   '실크 스카프와 실버 주얼리를 만드는 한국 액세서리 브랜드. 절제된 디자인으로 비율과 마감이 말을 합니다 — 특별한 날이 아니라 매일 착용하는 물건입니다.',
   true]
];

/* ── 主流程 ────────────────────────────────────────────────────────── */

/**
 * 只補 images 分頁的 thumb 欄。
 *
 * setupSheets() 也會補（writeHeader_ 是冪等的），但那支還會重灌種子、
 * 重設驗證與保護 —— 資料已經在跑的時候，動作愈小愈好。
 *
 * 補完欄位之後，既有的圖還是沒有縮圖：縮圖只能在瀏覽器裡產生
 * （Apps Script 沒有影像處理），所以要到後台按一次「回填縮圖」。
 */
function addThumbColumn() {
  var sh = openImages_().getSheetByName('images');
  if (!sh) throw new Error('images 分頁不存在，請先跑 setupSheets()');

  var head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), COLS.images.length)).getValues()[0];
  for (var i = 0; i < head.length; i++) {
    if (String(head[i]) === 'thumb') {
      return say_('images 分頁已經有 thumb 欄（第 ' + (i + 1) + ' 欄），沒有動作。');
    }
  }
  writeHeader_(sh, COLS.images);
  return say_('images 分頁已補上 thumb 欄（第 ' + COLS.images.length + ' 欄）。'
            + ' 接著到後台的商品清單按「回填縮圖」，把既有的圖各產一張。');
}


/* ── 一次性：把商品編號改成目錄編號的樣子 ──────────────────────────
 *
 * 2026-09-07 決定前台卡片改印商品編號、不再有獨立的索引碼欄位。
 * 但現有的 id 是當初取的語意代稱（frg-ylang、scarf-1），印在卡片上
 * 看起來是網址片段而不是目錄編號。所以照既有的索引碼把它們改一輪：
 *
 *     VL · FRG · 001   →   VL_FRG_001
 *
 * 兩支分開是刻意的：先 previewIdRename() 看清楚要改什麼，
 * 確認無誤再 applyIdRename()。改主鍵沒有「試一下」這種事。
 */

/** 索引碼 → 新編號。「VL · FRG · 001」→「VL_FRG_001」 */
function idFromRef_(ref) {
  var t = String(ref || '').trim();
  if (!t) return '';
  // 間隔點、空白、連字號一律收斂成單一底線，其餘非英數字元丟掉
  t = t.replace(/[·•\s-]+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
  t = t.replace(/_+/g, '_').replace(/^_|_$/g, '').toUpperCase();
  return t;
}

/** 只印計畫，不動任何資料 */
function previewIdRename() {
  var plan = buildIdRenamePlan_();
  var lines = ['改名計畫（這一支不會動任何資料）', ''];
  for (var i = 0; i < plan.ok.length; i++) {
    lines.push('  ' + plan.ok[i].from + '  →  ' + plan.ok[i].to);
  }
  if (plan.skip.length) {
    lines.push('', '跳過：');
    for (var j = 0; j < plan.skip.length; j++) {
      lines.push('  ' + plan.skip[j].id + ' —— ' + plan.skip[j].why);
    }
  }
  lines.push('', '共 ' + plan.ok.length + ' 件要改、' + plan.skip.length + ' 件跳過。');
  lines.push('確認無誤後執行 applyIdRename()。');
  return say_(lines.join('\n'));
}

/** 真的改。影像鍵、成本列都會跟著搬 */
function applyIdRename() {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(60000); } catch (e) { return say_('伺服器忙碌中，請稍後再試。'); }

  try {
    var ss = openBook_();
    var plan = buildIdRenamePlan_();
    var done = [], failed = [];

    for (var i = 0; i < plan.ok.length; i++) {
      var r = renameIdCore_(ss, plan.ok[i].from, plan.ok[i].to);
      if (r.ok) {
        done.push(plan.ok[i].from + ' → ' + plan.ok[i].to +
                  (r.keys.length ? '（影像鍵 ' + r.keys.length + ' 個）' : ''));
      } else {
        failed.push(plan.ok[i].from + ' → ' + plan.ok[i].to + '：' + (r.detail || r.err));
      }
    }

    audit_('renameIdBatch', failed.length === 0,
           '成功 ' + done.length + ' 件、失敗 ' + failed.length + ' 件');

    var lines = ['改名完成。', ''];
    for (var d = 0; d < done.length; d++) lines.push('  ✓ ' + done[d]);
    for (var f = 0; f < failed.length; f++) lines.push('  ✗ ' + failed[f]);
    for (var k = 0; k < plan.skip.length; k++) lines.push('  – 跳過 ' + plan.skip[k].id + '：' + plan.skip[k].why);
    lines.push('', '圖檔網址會跟著編號變，所以要到後台按一次「發布」才會反映到網站上。');
    return say_(lines.join('\n'));
  } finally {
    lock.releaseLock();
  }
}

/** 兩支共用的計畫。沒有索引碼、算出來不合法、或會撞名的都跳過 */
function buildIdRenamePlan_() {
  var ss = openBook_();
  var sh = ss.getSheetByName('products');
  if (!sh) throw new Error('products 分頁不存在');

  var idx = headIndex_(sh);
  var last = lastIdRow_(sh);
  var ok = [], skip = [];
  if (last < 2) return { ok: ok, skip: skip };

  var vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  var claimed = {};      // 這一輪已經打算用掉的新編號，避免兩件商品算出同一個

  for (var i = 0; i < vals.length; i++) {
    var id = String(vals[i][idx.id]).trim();
    if (!id) continue;
    var ref = String(vals[i][idx.ref] === undefined ? '' : vals[i][idx.ref]).trim();
    var to = idFromRef_(ref);

    if (!to) { skip.push({ id: id, why: '沒有索引碼可以依據' }); continue; }
    if (to === id) { skip.push({ id: id, why: '已經是這個編號了' }); continue; }
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(to)) {
      skip.push({ id: id, why: '從「' + ref + '」算出的「' + to + '」不合法' }); continue;
    }
    if (claimed[to.toUpperCase()]) {
      skip.push({ id: id, why: '「' + to + '」跟這一輪的另一件撞名，請先改掉其中一個的索引碼' }); continue;
    }
    if (idTaken_(sh, to, id)) {
      skip.push({ id: id, why: '「' + to + '」已經有人用了' }); continue;
    }
    claimed[to.toUpperCase()] = true;
    ok.push({ from: id, to: to });
  }
  return { ok: ok, skip: skip };
}

function setupSheets() {
  var ss = openBook_();
  var report = [];

  for (var name in COLS) {
    if (IN_IMAGE_BOOK.indexOf(name) !== -1) continue;   // 影像另存一份檔案
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    writeHeader_(sh, COLS[name]);
    report.push(name + '（' + COLS[name].length + ' 欄）');
  }

  // 影像分頁在另一份試算表裡。理由是效能：base64 一格四萬字元，
  // Google Sheets 會把每一格都載進瀏覽器並渲染，二十幾列就足以讓
  // 整個檔案捲動卡頓。分開之後你平常開的那份維持乾淨。
  var ib = openImages_();
  for (var k = 0; k < IN_IMAGE_BOOK.length; k++) {
    var n2 = IN_IMAGE_BOOK[k];
    var sh2 = ib.getSheetByName(n2) || ib.insertSheet(n2);
    writeHeader_(sh2, COLS[n2]);
    report.push(n2 + '（' + COLS[n2].length + ' 欄，另一份檔案）');
  }
  var junk2 = ib.getSheetByName('工作表1') || ib.getSheetByName('Sheet1');
  if (junk2 && ib.getSheets().length > 1 && junk2.getLastRow() === 0) ib.deleteSheet(junk2);

  // 有些試算表建立時會有一張叫「工作表1」的空分頁，礙眼但不能盲刪 ——
  // 只有在它確實是空的、而且不是唯一一張時才移除
  var junk = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (junk && ss.getSheets().length > 1 && junk.getLastRow() === 0) ss.deleteSheet(junk);

  seedOnce_(ss.getSheetByName('categories'), SEED_CATEGORIES);
  seedOnce_(ss.getSheetByName('houses'), SEED_HOUSES);

  applyValidation_(ss);
  installCanary_(ss);
  protectPrivate_(ss);

  var msg = '建表完成：\n  ' + report.join('\n  ') +
    '\n\n試算表：' + ss.getUrl();
  return say_(msg);
}

/* ── 元件 ──────────────────────────────────────────────────────────── */

/**
 * 取得試算表。沒設 SHEET_ID 就自己建一份，並把 ID 寫回指令碼屬性。
 *
 * 這樣就不必手動「建試算表 → 抄網址中間那一段 → 貼進設定頁」——
 * 那三步每一步都可能抄錯，而且錯了要到執行時才看得出來。
 * 建完就把 ID 存起來，所以重跑這支不會再建第二份。
 */
function openBook_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');

  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      throw new Error(
        '指令碼屬性 SHEET_ID 打不開：' + id +
        '。可能是 ID 貼錯，或那份試算表已被刪除。' +
        '把該屬性刪掉再執行一次，就會自動建一份新的。');
    }
  }

  var ss = SpreadsheetApp.create('Velora 商品資料');
  props.setProperty('SHEET_ID', ss.getId());
  Logger.log('已建立新的試算表並記住它的 ID：' + ss.getUrl());
  return ss;
}

/**
 * 取得影像專用的試算表。沒設 IMAGES_SHEET_ID 就自己建一份並記住 ID。
 *
 * 跟 openBook_ 是同一套做法，理由也一樣：手動建檔、抄網址中間那一段、
 * 貼進設定頁 —— 三步每一步都可能抄錯，而且錯了要到執行時才發現。
 */
function openImages_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('IMAGES_SHEET_ID');

  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      throw new Error(
        '指令碼屬性 IMAGES_SHEET_ID 打不開：' + id +
        '。可能是 ID 貼錯，或那份試算表已被刪除。' +
        '把該屬性刪掉再執行一次 setupSheets，就會自動建一份新的。');
    }
  }

  var ss = SpreadsheetApp.create('Velora 影像儲存');
  props.setProperty('IMAGES_SHEET_ID', ss.getId());
  Logger.log('已建立影像試算表並記住它的 ID：' + ss.getUrl());
  return ss;
}

/**
 * 寫入標題列並凍結。
 * 只碰第一列 —— 底下的資料一個字都不動，所以這支可以重複執行。
 */
function writeHeader_(sh, cols) {
  var range = sh.getRange(1, 1, 1, cols.length);
  range.setValues([cols]);
  range.setFontWeight('bold');
  range.setBackground('#efe9dd');       // 呼應站台的暖調紙，一眼看得出是標題列
  range.setFontFamily('Roboto Mono');
  range.setFontSize(10);
  sh.setFrozenRows(1);

  // 欄位比預設的 26 欄多時要補欄，否則 setValues 會丟例外
  if (sh.getMaxColumns() < cols.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
  }
  // 標題是 mono 小字，40 欄全開會很難捲。統一收窄，需要時手動拉開即可
  sh.setColumnWidths(1, cols.length, 130);
}

/** 只在分頁還沒有資料列時灌種子 —— 已經有人在編輯就不要覆蓋 */
function seedOnce_(sh, rows) {
  if (!sh || sh.getLastRow() > 1) return;
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

/**
 * 下拉選單與核取方塊。
 * category / house 綁到另外兩張分頁的 key 欄，所以之後新增一條商品線
 * 只要在 categories 加一列，商品表的下拉就會自己多一個選項。
 */
/** 確保分頁至少有 n 列實體列。getRange 超出 maxRows 會直接丟例外 */
function ensureRows_(sh, n) {
  if (sh.getMaxRows() < n) sh.insertRowsAfter(sh.getMaxRows(), n - sh.getMaxRows());
}

/**
 * 掃第一欄，回傳最後一列真的有 id 的位置（沒有資料就回 1，也就是只有標題）。
 *
 * 🔴 不要用 getLastRow() 決定「資料到哪裡」。
 *
 * getLastRow() 的「有內容」定義比直覺寬：套了核取方塊驗證的空儲存格也算。
 * 2026-09-06 實測 —— 資料只有 13 列，但因為驗證套到第 500 列，
 * getLastRow() 回 501。拿它當附加位置的話，新商品會被寫到第 502 列，
 * 中間留下 488 列空白，而且每次都更嚴重。
 *
 * id 是主鍵、必填，所以「第一欄有沒有值」是唯一可靠的判準。
 * 附加、整理、驗證一律用這支，不要用 getLastRow()。
 */
function lastIdRow_(sh) {
  var max = sh.getLastRow();
  if (max < 2) return 1;
  var ids = sh.getRange(2, 1, max - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]).trim() !== '') return i + 2;
  }
  return 1;
}

function applyValidation_(ss) {
  var p = ss.getSheetByName('products');
  // 驗證要套到「現在有的列」，不能套到不存在的列 ——
  // 用 Math.max(maxRows-1, 500) 而不先補列的話，列數少於 501 時
  // getRange 會丟例外。repairProducts 刪完列之後就是這種狀態。
  ensureRows_(p, 501);
  var last = p.getMaxRows() - 1;
  var at = function (col) { return p.getRange(2, COLS.products.indexOf(col) + 1, last, 1); };

  var catRange = ss.getSheetByName('categories').getRange('A2:A1000');
  var houseRange = ss.getSheetByName('houses').getRange('A2:A1000');

  at('category').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(catRange, true)
      .setAllowInvalid(false).setHelpText('必須是 categories 分頁裡的 key').build());
  at('house').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(houseRange, true)
      .setAllowInvalid(false).setHelpText('必須是 houses 分頁裡的 key').build());

  // 🔴 用 requireCheckbox 而不是 insertCheckboxes()。
  //
  // insertCheckboxes() 的文件行為是「把範圍內每一格的值設為 false」——
  // 它不只加驗證，還寫入值。對 2~1000 列套用等於在 999 個空列各寫一個 FALSE，
  // 那些列就不再是空的：getLastRow() 會回 1000，appendRow 從 1001 列開始，
  // 商品資料被推到表格最底下。2026-09-06 實測踩過，products 變成 1012 列。
  //
  // requireCheckbox 只加驗證、不碰值，空列維持是空列。
  var checkbox = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  ['price_public', 'listed', 'featured', 'deleted'].forEach(function (c) {
    at(c).setDataValidation(checkbox);
  });

  // 影像的 data 欄是動輒四萬字元的 base64，讓它顯示成一行，
  // 否則捲動整張表會卡到動不了。它在另一份試算表裡
  var im = openImages_().getSheetByName('images');
  if (!im) return;
  ensureRows_(im, 501);
  var imRows = im.getMaxRows() - 1;
  im.getRange(2, COLS.images.indexOf('data') + 1, imRows, 1)
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  im.getRange(2, COLS.images.indexOf('alpha') + 1, imRows, 1)
    .setDataValidation(checkbox);
}

/**
 * 誘餌列：這是「成本沒有外洩」這件事唯一的確定性證據。
 *
 * 其他防線（欄位白名單、輸出前斷言、grep 形狀）都是「我相信它有效」；
 * 誘餌是「只要洩漏路徑存在，它必然一起洩漏」。CI 對整個輸出做一次
 * literal grep 命中就中止部署。
 *
 * 產生的字串要同時貼進 GitHub Secret COST_CANARY。
 */
function installCanary_(ss) {
  var sh = ss.getSheetByName('products_private');
  var ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues()
    .map(function (r) { return r[0]; });
  if (ids.indexOf('__canary__') !== -1) return;   // 已經有了就別再產一個

  var rnd = Utilities.getUuid().replace(/-/g, '').slice(0, 16).toUpperCase();
  var token = 'COSTCANARY-' + rnd;
  sh.appendRow(['__canary__', token, 'TWD', today_(),
    '誘餌列，請勿刪除。值必須同步到 GitHub Secret COST_CANARY。']);
  Logger.log('⚠ 請把這一串貼進 GitHub Secret COST_CANARY：\n' + token);
}

/**
 * 把機密表設成保護範圍。
 * 這一層擋的不是攻擊者（能開試算表的人本來就看得到），是手滑 ——
 * 讓它在 UI 上長得跟其他分頁不一樣，複製貼上前會多想一秒。
 */
function protectPrivate_(ss) {
  var sh = ss.getSheetByName('products_private');
  var existing = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  if (existing.length) return;
  sh.protect()
    .setDescription('B2B 機密：FOB 成本。不得複製到其他分頁，不得由匯出端點讀取。')
    .setWarningOnly(true);   // 警告而非鎖定：擁有者自己還是要能編輯
}

function today_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
}

/**
 * 印出訊息並回傳它。
 *
 * 存在的理由：`return '...'` 很容易漏掉配套的 Logger.log，
 * 而漏掉的結果是執行紀錄一片空白 —— 看起來像函式沒跑，
 * 實際上是它跑完了而且一切正常。這種「安靜的成功」比失敗更難判讀。
 * 用 say_() 把兩件事綁在一起，就不會有只 return 不 log 的路徑。
 */
function say_(msg) {
  Logger.log(msg);
  return msg;
}

/**
 * 一鍵：整理 + 結構驗證 + 密碼學自測，印成一份報告。
 *
 * 存在的理由很實際：分三支跑要在函式下拉裡切三次、看三次執行紀錄、
 * 貼三次結果。合成一支之後是一次操作、一份報告。
 *
 * 報告內容全部可以安全外流 —— 不含密碼、不含 CI 金鑰、不含誘餌值。
 */
function checkAll() {
  var parts = [];

  parts.push('──── 1. 整理 products ────');
  try { parts.push(repairProducts()); }
  catch (e) { parts.push('✗ ' + e.message); }

  parts.push('\n──── 2. 結構驗證 ────');
  try { parts.push(verifySetup()); }
  catch (e) { parts.push('✗ ' + e.message); }

  parts.push('\n──── 3. 密碼學自測 ────');
  // selfTest 定義在 Code.gs。Apps Script 的檔案共用同一個全域範圍，
  // 所以跨檔呼叫不需要 import
  try { parts.push(typeof selfTest === 'function' ? selfTest() : '✗ 找不到 selfTest，Code.gs 可能不是最新版'); }
  catch (e) { parts.push('✗ ' + e.message); }

  var msg = parts.join('\n');
  return say_(msg);
}

/**
 * 整理 products：把真正有資料的列往上收，清掉底下的空殼。
 *
 * 為什麼會需要這支：舊版的 applyValidation_ 用了 insertCheckboxes()，
 * 那會把 999 個空列各寫進一個 FALSE，讓它們不再是「空列」。
 * 於是 getLastRow() 回 1000，商品被接在第 1001 列之後。
 * 根因已在 applyValidation_ 修掉，這支負責把已經弄髒的表清乾淨。
 *
 * 只搬有 id 的列，順序保持不變。搬完重新套用驗證。
 * 可以重複執行；表本來就乾淨的話它什麼都不做。
 */
function repairProducts() {
  var ss = openBook_();
  var sh = ss.getSheetByName('products');
  if (!sh) throw new Error('找不到 products 分頁');

  var width = COLS.products.length;
  // 用實體列數決定要掃多遠（可能有殘留的值散在任何地方），
  // 但判定「乾不乾淨」一律以 id 欄為準，不看 getLastRow()
  var last = Math.max(sh.getLastRow(), lastIdRow_(sh));
  // 每一條 return 都要留下輸出。少寫一個 Logger.log，執行紀錄就是空的，
  // 看起來像「什麼都沒發生」而不是「檢查過了，沒事」—— 實測踩過這個坑。
  if (last < 2) return say_('products 沒有資料列，不需整理。');

  var all = sh.getRange(2, 1, last - 1, width).getValues();
  // 判準是「第一欄（id）有沒有值」。核取方塊寫進去的 FALSE 在別的欄位，
  // 不影響這個判斷 —— 這也是為什麼 readSheet_ 一直都拿得到正確的 13 件。
  var withId = all.filter(function (r) { return String(r[0]).trim() !== ''; });

  // 去重：id 是主鍵，同一個 id 只能有一列。保留先出現的那一份。
  // 會需要這一步，是因為第一版的 repairProducts 用了
  // clear({ contentsOnly: false }) —— 那個選項物件是「篩選器」語意，
  // 傳 false 等於「不要只清內容」，實際上什麼都沒清。於是資料被複製到頂端
  // 而原本那份還在，13 件變成 26 列。所以底下一律改用 deleteRows()：
  // 刪列沒有歧義，也不必猜 clear 的選項組合是什麼意思。
  var seen = {}, real = [], dupes = [];
  withId.forEach(function (r) {
    var id = String(r[0]).trim();
    if (seen[id]) { dupes.push(id); return; }
    seen[id] = true;
    real.push(r);
  });

  // 乾淨的定義：id 欄連續從第 2 列排到最後一列，而且沒有重複。
  // 底下那些「只有驗證、沒有值」的列不算髒 —— 它們是給你手動新增用的緩衝。
  if (lastIdRow_(sh) === real.length + 1 && !dupes.length && withId.length === real.length) {
    return say_('已經是乾淨的：' + real.length + ' 件商品，連續排在第 2–' +
      (real.length + 1) + ' 列，沒有重複，不需整理。 ✓');
  }

  // 把整個資料區的列刪掉（不是清內容 —— 是真的移除），再重建。
  // 刪完 getLastRow() 必然回到 1，不會有「清了卻還在」的模糊地帶。
  //
  // 但要先多補一列：Google Sheets 不允許刪掉「所有非凍結的列」，
  // 第 1 列是凍結的標題，刪 2..last 剛好把可刪的全部刪光，會丟
  // 「很抱歉，你無法刪除所有非凍結的列」。補一列之後就一定會剩下一列。
  ensureRows_(sh, last + 1);
  sh.deleteRows(2, last - 1);
  SpreadsheetApp.flush();

  // 資料列與驗證都需要實體列存在，先把列數補回來
  ensureRows_(sh, Math.max(real.length, 500) + 1);

  if (real.length) sh.getRange(2, 1, real.length, width).setValues(real);

  // 🔴 flush 是必要的。Apps Script 的試算表寫入是批次送出的，
  // 不 flush 就讀 getLastRow() 拿到的是還沒更新的舊值 —— 2026-09-06 實測
  // 踩過：資料已經動了，報告卻印出舊數字，看起來像整理失敗。
  SpreadsheetApp.flush();

  applyValidation_(ss);   // 驗證隨著刪列一起沒了，重新套用（新版不會寫值）
  SpreadsheetApp.flush();

  var now = lastIdRow_(sh);
  var want = real.length + 1;
  var msg = '整理完成：保留 ' + real.length + ' 件商品' +
    (dupes.length ? '，移除 ' + dupes.length + ' 筆重複（' +
      dupes.slice(0, 5).join(', ') + (dupes.length > 5 ? '…' : '') + '）' : '') +
    '，清掉 ' + (last - 1 - withId.length) + ' 列空殼。\n' +
    '最後一列有 id 的位置 = ' + now + '（應為 ' + want + '）' +
    (now === want ? ' ✓' : ' ✗ 仍有殘留') +
    '\n（getLastRow() = ' + sh.getLastRow() + '，比較大是正常的：' +
    '底下有套好核取方塊驗證的空列，留給你手動新增用）';
  return say_(msg);
}

/* ── 驗證 ──────────────────────────────────────────────────────────────
   建完之後跑這支，不要用眼睛檢查。

   用法：函式下拉選 verifySetup → 執行 → 看執行紀錄。

   它檢查的是「結構對不對」，不是「有沒有商品」——
   所以空的資料表也應該全部通過。任何一項 ✗ 都代表 setupSheets 沒跑完整，
   重跑一次 setupSheets 即可（它可以重複執行）。

   刻意不印誘餌字串的值：它只該存在於試算表與 GitHub Secret 兩個地方，
   執行紀錄是會被複製貼上的，多一個落點就多一個外洩面。 */

function verifySetup() {
  var ss = openBook_();
  var pass = [], fail = [];
  var ok = function (c, msg) { (c ? pass : fail).push((c ? '  ✓ ' : '  ✗ ') + msg); };

  // ── 1. 六個分頁都在，欄位名稱與順序完全相符 ──────────────────────
  for (var name in COLS) {
    var sh = ss.getSheetByName(name);
    if (!sh) { ok(false, name + ' 分頁不存在'); continue; }
    var want = COLS[name];
    var got = sh.getRange(1, 1, 1, want.length).getValues()[0];
    var diff = [];
    for (var i = 0; i < want.length; i++) {
      if (String(got[i]) !== want[i]) diff.push('第' + (i + 1) + '欄應為 ' + want[i] + '，實為「' + got[i] + '」');
    }
    ok(diff.length === 0, name + ' 欄位相符（' + want.length + ' 欄）' +
      (diff.length ? ' —— ' + diff.slice(0, 3).join('；') : ''));
    ok(sh.getFrozenRows() === 1, name + ' 標題列已凍結');
  }

  var P = ss.getSheetByName('products');
  var colAt = function (c) { return COLS.products.indexOf(c) + 1; };

  // ── 2. 下拉選單真的綁到另外兩張分頁，不只是「有驗證規則」──────────
  // 只檢查「有沒有驗證」是不夠的：綁錯範圍一樣會有驗證，但選項是錯的。
  [['category', 'categories'], ['house', 'houses']].forEach(function (pair) {
    var dv = P.getRange(2, colAt(pair[0])).getDataValidation();
    if (!dv) { ok(false, pair[0] + ' 欄沒有資料驗證'); return; }
    var isRange = dv.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE;
    var src = isRange ? dv.getCriteriaValues()[0] : null;
    var boundTo = src ? src.getSheet().getName() : '(非範圍型)';
    ok(isRange && boundTo === pair[1],
      pair[0] + ' 下拉綁到 ' + pair[1] + ' 分頁（實際：' + boundTo + '）');
  });

  // 下拉真的有選項可選 —— 種子沒灌成功的話這裡會抓到
  var catKeys = ss.getSheetByName('categories').getRange('A2:A20').getValues()
    .map(function (r) { return r[0]; }).filter(String);
  ok(catKeys.length >= 4, 'categories 有 ' + catKeys.length + ' 筆：' + catKeys.join(' / '));
  var houseKeys = ss.getSheetByName('houses').getRange('A2:A20').getValues()
    .map(function (r) { return r[0]; }).filter(String);
  ok(houseKeys.length >= 2, 'houses 有 ' + houseKeys.length + ' 筆：' + houseKeys.join(' / '));

  // ── 3. 核取方塊 ────────────────────────────────────────────────
  ['price_public', 'listed', 'featured', 'deleted'].forEach(function (c) {
    var dv = P.getRange(2, colAt(c)).getDataValidation();
    ok(dv && dv.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.CHECKBOX,
      c + ' 是核取方塊');
  });

  // ── 4. 機密邊界 ────────────────────────────────────────────────
  var priv = ss.getSheetByName('products_private');
  ok(priv.getProtections(SpreadsheetApp.ProtectionType.SHEET).length > 0,
    'products_private 已設保護範圍');
  ok(COLS.products.indexOf('cost') === -1,
    'products 分頁不含 cost 欄（成本只在 products_private）');

  var ids = priv.getRange(1, 1, Math.max(priv.getLastRow(), 1), 1).getValues()
    .map(function (r) { return r[0]; });
  var ci = ids.indexOf('__canary__');
  if (ci === -1) {
    ok(false, '誘餌列不存在');
  } else {
    // 只驗形狀與長度，不印出值
    var v = String(priv.getRange(ci + 1, 2).getValue());
    ok(/^COSTCANARY-[0-9A-F]{16}$/.test(v),
      '誘餌列存在且格式正確（COSTCANARY- + 16 碼，長度 ' + v.length + '）');
  }

  // ── 5. 影像分頁（在另一份試算表）────────────────────────────────
  var im = openImages_().getSheetByName('images');
  ok(im.getRange(2, COLS.images.indexOf('data') + 1).getWrapStrategy() ===
     SpreadsheetApp.WrapStrategy.CLIP, 'images.data 設為不換行（否則捲動會卡）');

  var out = '驗證結果：' + pass.length + ' 項通過，' + fail.length + ' 項失敗\n\n' +
    (fail.length ? fail.join('\n') + '\n\n' : '') + pass.join('\n') +
    (fail.length ? '\n\n→ 重跑一次 setupSheets 即可，它可以重複執行。'
                 : '\n\n→ 結構正確，可以開始灌商品資料。');
  return say_(out);
}


/**
 * 把已經建好的 categories 分頁從 7 欄升到 11 欄。
 *
 * 為什麼不能只重跑 setupSheets：writeHeader_ 只在分頁是空的時候寫標題，
 * seedOnce_ 只在沒有資料時灌種子 —— 兩個都是刻意設計成可重複執行而不覆蓋，
 * 所以對「已經有資料、但欄位定義變了」的表完全不會動。
 *
 * 這次改了什麼：
 *   · 新增 short_zh / short_en / short_ko —— 後台頁籤用的短名
 *   · 新增 cover —— 品類格的封面圖，先前整個漏掉了，前台會變破圖
 *   · name_* 從短名改成長名（香氛 → 居家香氛），前台導覽列用
 *
 * 可以重複執行。已經是新格式的話會直接說「不用改」。
 */
function patchCategories() {
  var ss = openBook_();
  var sh = ss.getSheetByName('categories');
  if (!sh) return say_('✗ 找不到 categories 分頁。請先執行 setupSheets。');

  var want = COLS.categories;
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);

  var same = head.length === want.length;
  if (same) for (var i = 0; i < want.length; i++) if (head[i] !== want[i]) same = false;

  // 讀舊資料。用舊標題列對應，不靠位置 —— 位置在這次改動裡就變了
  var oldRows = [];
  var last = sh.getLastRow();
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, lastCol).getValues();
    for (var r = 0; r < vals.length; r++) {
      if (String(vals[r][0]).trim() === '') continue;
      var o = {};
      for (var c = 0; c < head.length; c++) if (head[c]) o[head[c]] = vals[r][c];
      oldRows.push(o);
    }
  }

  var seedByKey = {};
  for (var s = 0; s < SEED_CATEGORIES.length; s++) {
    seedByKey[SEED_CATEGORIES[s][0]] = SEED_CATEGORIES[s];
  }

  // 組新資料：種子有的用種子值（那是這次要修正的內容），
  // 種子沒有、但表上有的品類原樣保留 —— 那是你自己加的，不該被我洗掉
  var out = [];
  var report = [];
  for (var k = 0; k < SEED_CATEGORIES.length; k++) {
    out.push(SEED_CATEGORIES[k].slice());
    report.push('  · ' + SEED_CATEGORIES[k][0] + '　' + SEED_CATEGORIES[k][3] +
                '（後台顯示「' + SEED_CATEGORIES[k][6] + '」）');
  }
  var kept = 0;
  for (var m = 0; m < oldRows.length; m++) {
    var key = String(oldRows[m].key);
    if (seedByKey[key]) continue;
    var row = [];
    for (var w = 0; w < want.length; w++) {
      var v = oldRows[m][want[w]];
      row.push(v === undefined ? '' : v);
    }
    out.push(row);
    kept++;
    report.push('  · ' + key + '　（表上原有，原樣保留）');
  }

  if (same && oldRows.length === out.length) {
    var identical = true;
    for (var q = 0; q < out.length && identical; q++) {
      for (var p = 0; p < want.length; p++) {
        var was = oldRows[q][want[p]];
        if (String(was === undefined ? '' : was) !== String(out[q][p])) { identical = false; break; }
      }
    }
    if (identical) return say_('不用改：categories 已經是新格式，內容也一致。');
  }

  // 先把整張表清乾淨再寫。不清的話舊的第 8-11 欄殘值會留著，
  // 而殘值長得像正常資料，之後很難查出來源
  ensureRows_(sh, out.length + 1);
  var wide = Math.max(lastCol, want.length);
  sh.getRange(1, 1, sh.getMaxRows(), wide).clearContent();
  sh.getRange(1, 1, 1, want.length).setValues([want]);
  sh.getRange(2, 1, out.length, want.length).setValues(out);
  SpreadsheetApp.flush();

  // 寫完讀回來驗。沒有這一步的話，寫入失敗會安靜地留下一張半新半舊的表
  var back = sh.getRange(1, 1, out.length + 1, want.length).getValues();
  var bad = [];
  for (var x = 0; x < want.length; x++) {
    if (String(back[0][x]) !== want[x]) bad.push('標題第 ' + (x + 1) + ' 欄：' + back[0][x]);
  }
  for (var y = 0; y < out.length; y++) {
    for (var z = 0; z < want.length; z++) {
      if (String(back[y + 1][z]) !== String(out[y][z])) {
        bad.push('第 ' + (y + 2) + ' 列 ' + want[z] + '：寫入「' + out[y][z] +
                 '」讀回「' + back[y + 1][z] + '」');
      }
    }
  }
  if (bad.length) {
    return say_('✗ 寫入後對不上，請再執行一次：\n  ' + bad.slice(0, 6).join('\n  '));
  }

  return say_(
    '✓ categories 已更新為 ' + want.length + ' 欄（原本 ' + head.length + ' 欄）\n\n' +
    report.join('\n') + '\n\n' +
    '  共 ' + out.length + ' 個品類' + (kept ? '，其中 ' + kept + ' 個是你自己加的，內容沒動' : '') + '\n\n' +
    '新增的欄位：short_zh / short_en / short_ko（後台頁籤）、cover（品類封面圖）。\n' +
    'name_* 改成長名給前台導覽列用 —— 「純銀飾品」講得出材質，「飾品」什麼都沒說。');
}


/**
 * 把影像分頁從主試算表搬到獨立的影像檔。
 *
 * ── 為什麼要分開 ────────────────────────────────────────────────────
 *
 * base64 一格四萬字元。Google Sheets 會把每一格的內容都載進瀏覽器並
 * 渲染，二十幾列就足以讓整個檔案捲動卡頓 —— 而且是連帶拖慢你真正在
 * 編輯的 products 分頁。分成兩個檔案之後，你平常開的那份只有純文字。
 *
 * 代價是多一個 ID 要管（指令碼屬性 IMAGES_SHEET_ID），備份時兩份都要備。
 *
 * ── 可以重複執行 ────────────────────────────────────────────────────
 *
 * 已經分開的話會直接回報現況。主檔那張分頁有資料時會先搬過去再刪 ——
 * 不會弄丟任何東西。
 */
function splitImagesBook() {
  var main = openBook_();
  var ib = openImages_();
  var lines = [];

  // 目標檔的分頁
  var dst = ib.getSheetByName('images');
  if (!dst) {
    dst = ib.insertSheet('images');
    writeHeader_(dst, COLS.images);
    lines.push('  在影像檔建立 images 分頁');
  }
  var junk = ib.getSheetByName('工作表1') || ib.getSheetByName('Sheet1');
  if (junk && ib.getSheets().length > 1 && junk.getLastRow() === 0) {
    ib.deleteSheet(junk);
    lines.push('  移除影像檔的空白預設分頁');
  }

  // 主檔還有沒有殘留
  var src = main.getSheetByName('images');
  if (!src) {
    lines.push('  主檔沒有 images 分頁（已經分開了）');
  } else {
    var rows = lastIdRow_(src) - 1;
    if (rows > 0) {
      // 有資料就先搬。逐列複製而不是整段搬移 ——
      // moveSheet 只能在同一份試算表裡動
      var width = COLS.images.length;
      var vals = src.getRange(2, 1, rows, width).getValues();
      var at = lastIdRow_(dst) + 1;
      ensureRows_(dst, at + rows + 1);
      dst.getRange(at, 1, rows, width).setValues(vals);
      SpreadsheetApp.flush();

      // 搬完讀回來比對再刪。沒有這一步的話，複製失敗就是資料消失
      var back = dst.getRange(at, 1, rows, 1).getValues();
      var same = true;
      for (var i = 0; i < rows; i++) {
        if (String(back[i][0]) !== String(vals[i][0])) { same = false; break; }
      }
      if (!same) {
        return say_('✗ 搬過去之後讀回來對不上，主檔那張分頁保留不動。請再執行一次。');
      }
      lines.push('  搬移 ' + rows + ' 列到影像檔並驗證通過');
    } else {
      lines.push('  主檔的 images 分頁是空的，直接移除');
    }
    main.deleteSheet(src);
    lines.push('  已從主檔移除 images 分頁');
  }

  return say_(
    '影像分頁拆分完成\n' + lines.join('\n') + '\n\n' +
    '  商品資料　' + main.getUrl() + '\n' +
    '  影像儲存　' + ib.getUrl() + '\n\n' +
    '影像那份你平常不需要打開。兩份都要記得備份。');
}


/**
 * 把 houses 分頁升到 11 欄（多一個 listed）。
 *
 * listed 是整個品牌的開關：取消勾選，這個品牌的所有商品都不會進前台，
 * 品牌介紹也不會出現。代理關係是整包的，暫停時要動的是一整個品牌 ——
 * 逐件把商品下架，恢復時要記得是哪幾件，那種狀態沒有人記得住。
 *
 * 既有的品牌一律預設為已上架（true），不會因為升欄位就把網站清空。
 * 可以重複執行。
 */
function patchHouses() {
  var ss = openBook_();
  var sh = ss.getSheetByName('houses');
  if (!sh) return say_('✗ 找不到 houses 分頁，請先執行 setupSheets。');

  var want = COLS.houses;
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);

  var same = head.length === want.length;
  if (same) for (var i = 0; i < want.length; i++) if (head[i] !== want[i]) same = false;

  var rows = [];
  var last = sh.getLastRow();
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, lastCol).getValues();
    for (var r = 0; r < vals.length; r++) {
      if (String(vals[r][0]).trim() === '') continue;
      var o = {};
      for (var c = 0; c < head.length; c++) if (head[c]) o[head[c]] = vals[r][c];
      rows.push(o);
    }
  }
  if (!rows.length) return say_('✗ houses 分頁沒有資料，請先執行 setupSheets。');

  if (same) {
    var allSet = true;
    for (var q = 0; q < rows.length; q++) if (rows[q].listed === '' || rows[q].listed === undefined) allSet = false;
    if (allSet) return say_('不用改：houses 已經有 listed 欄，而且每一列都有值。');
  }

  var out = [];
  for (var m = 0; m < rows.length; m++) {
    var row = [];
    for (var w = 0; w < want.length; w++) {
      var name = want[w];
      var v = rows[m][name];
      // 新欄位沒有值就預設為 true —— 升欄位不該把既有品牌下架
      if (name === 'listed' && (v === '' || v === undefined)) v = true;
      row.push(v === undefined ? '' : v);
    }
    out.push(row);
  }

  ensureRows_(sh, out.length + 1);
  var wide = Math.max(lastCol, want.length);
  sh.getRange(1, 1, sh.getMaxRows(), wide).clearContent();
  sh.getRange(1, 1, 1, want.length).setValues([want]);
  sh.getRange(2, 1, out.length, want.length).setValues(out);

  // listed 做成核取方塊，才不會有人打 "true"（字串）而不是勾選
  sh.getRange(2, want.indexOf('listed') + 1, Math.max(out.length, 20), 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  SpreadsheetApp.flush();

  var back = sh.getRange(1, 1, 1, want.length).getValues()[0];
  for (var x = 0; x < want.length; x++) {
    if (String(back[x]) !== want[x]) return say_('✗ 寫入後標題對不上，請再執行一次。');
  }

  var names = [];
  for (var y = 0; y < out.length; y++) {
    names.push('  · ' + out[y][want.indexOf('name')] +
               (out[y][want.indexOf('listed')] ? '（上架中）' : '（已下架）'));
  }
  return say_(
    '✓ houses 已更新為 ' + want.length + ' 欄（原本 ' + head.length + ' 欄）\n\n' +
    names.join('\n') + '\n\n' +
    '要暫停某個品牌：把它那一列的 listed 取消勾選，然後從後台按發布。\n' +
    '那個品牌的所有商品與品牌介紹都會從前台消失，資料完全保留。');
}
