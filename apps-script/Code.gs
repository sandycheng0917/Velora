/**
 * 維羅拉後台 —— Apps Script Web App（路由 + 認證 + 匯出）
 *
 * ── 傳輸層的三條硬限制（不是風格選擇，是 Apps Script 的天花板）──────────
 *
 * 1. 沒有 doOptions。Apps Script 只暴露 doGet 與 doPost，CORS 的 preflight
 *    請求由 Google 前端處理，你無法回應它。所以呼叫端必須是「simple request」：
 *      · Content-Type 只能是 text/plain（application/json 會觸發 preflight）
 *      · 不得帶任何自訂標頭（Authorization、X-Token… 帶了就 preflight）
 *    因此令牌一律放在 JSON body 裡，不放標頭。
 *
 * 2. ContentService 無法設定任何回應標頭 —— TextOutput 只有 setContent /
 *    setMimeType / append / downloadAsFile，沒有 setHeader。所以也不能用
 *    Set-Cookie 發 session。
 *
 * 3. /exec 一定會 302 轉到 script.googleusercontent.com。呼叫端頁面的 CSP
 *    connect-src 必須「同時」列出這兩個網域，只寫 script.google.com 的話
 *    Chrome 會擋掉轉址後的那一跳。
 *
 * 以上三條已在 2026-09-06 於瀏覽器實測確認（text/plain 200、
 * application/json 被 preflight 擋、自訂標頭被 preflight 擋）。
 *
 * ── 部署 SOP ────────────────────────────────────────────────────────
 *
 *   第一次：部署 → 新增部署作業 → 類型選「網頁應用程式」
 *   之後每次改完：部署 → 管理部署作業 → 選現有那筆 → 鉛筆（編輯）
 *                 → 版本：新版本 → 部署
 *
 *   第一次之後就別再碰「新增部署作業」了 —— 它每按一次就產生一個「新的」
 *   /exec 網址，已經上線的前端仍指向舊的那個。症狀是「明明改了卻沒有效果」，
 *   而且不會有任何錯誤訊息，很難察覺。
 *
 * 存取權必須是「所有人」。那不代表誰都能改商品 —— 授權是下面 requireAuth_
 * 那一層做的。它的意思只是「這個網址不需要 Google 登入就能呼叫」。
 *
 * ── 機密邊界 ────────────────────────────────────────────────────────
 *
 * 這個檔案裡沒有任何機密。密碼雜湊、HMAC 密鑰、CI 匯出金鑰、GitHub PAT
 * 全部存在指令碼屬性裡，由 initSecrets() 產生。所以原始碼可以進公開版控。
 *
 * export 端點只讀 products / images / houses / categories 四張分頁。
 * 'products_private' 這個字串在整個匯出路徑上不存在 —— 成本讀不到不是
 * 因為有檢查，是因為程式碼沒有那條路。
 */

/**
 * 版本字串。**改了端點就要改這裡**，否則沒辦法分辨線上跑的是哪一版。
 * ping 會連同 ops 清單一起回傳，貼上不完整或忘了重新部署一眼就看得出來。
 */
var VERSION = 'v5-imgindex';

/** 令牌壽命。用算式寫，不要展開成 28800000 —— 十位數字面值會誤觸機密掃描 */
var TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
/** 剩餘壽命低於這個值就換發新令牌，避免操作到一半被登出 */
var TOKEN_RENEW_MS = 2 * 60 * 60 * 1000;

var MAX_FAILS = 5;
var LOCK_MS = 15 * 60 * 1000;
/** 第幾次失敗開始寄信告警。不等到鎖定才通知，那時已經被敲五次了 */
var ALERT_AT = 3;

/* ══ 進入點 ════════════════════════════════════════════════════════ */

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e && e.postData ? e.postData.contents : '{}');
  } catch (err) {
    // 解析不了就當空物件，由 route_ 回報 bad-op。
    // 不要在這裡丟例外 —— Apps Script 的未捕捉例外會變成一頁 HTML 錯誤畫面，
    // 前端拿到 HTML 而不是 JSON，症狀看起來像「伺服器壞了」而非「請求格式錯」
    return json_({ ok: false, err: 'bad-json' });
  }
  try {
    return json_(route_(body));
  } catch (err) {
    // 同上：任何未預期的例外都要收斂成 JSON，否則前端無從判斷
    return json_({ ok: false, err: 'server', detail: String(err && err.message || err) });
  }
}

function doGet() {
  return ContentService.createTextOutput('Velora admin endpoint. POST only.')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * 不需要令牌的三個。其餘一律走 withAuth_。
 *
 * 用「排除法」而不是逐個標記需不需要驗證：新增端點時如果忘了標，
 * 預設會是「需要令牌」而不是「公開」—— 忘記的後果是東西不能用，
 * 而不是東西沒有保護。安全預設值要往嚴格的方向倒。
 */
var PUBLIC_OPS = ['ping', 'login', 'export'];

/**
 * 端點對照表。
 *
 * 🔴 這裡刻意做成「函式裡的物件」而不是「檔案層級的 var」。
 *    Apps Script 把所有 .gs 檔攤在同一個全域範圍，但求值順序是檔名排序 ——
 *    在檔案層級寫 { save: opSave_ } 的話，Code.gs 先被求值時
 *    Api.gs 的 opSave_ 還不存在，整張表會變成一堆 undefined。
 *    放進函式體，呼叫時才求值，那時所有檔案都載完了。
 *
 * 改成表格而不是 switch 的理由：ping 可以直接回報「我支援哪些 op」。
 * 2026-09-06 遇到一次貼上不完整的部署，我得一個一個 op 去打才知道
 * 少了哪幾個 —— 部署有沒有更新，應該問一次就有答案。
 */
function routes_() {
  return {
    ping: function (b) {
      return {
        ok: true, ver: VERSION, at: nowIso_(),
        // 貼上不完整或忘了重新部署時，這個清單會少東西，一眼就看得出來
        ops: opNames_(),
        echo: b.echo === undefined ? null : b.echo
      };
    },
    login: opLogin_,
    export: opExport_,               // 用 CI 金鑰，不是令牌

    renew: opRenew_,
    list: opList_,
    save: opSave_,
    'delete': opDelete_,
    // 2026-09-07 移除 cost 端點：後台不再顯示出口單價，
    // 所以整條讀取路徑也一起拿掉 —— 令牌外洩時就沒有東西可以拉。
    // FOB 價仍在 products_private 分頁，要看直接開試算表。
    image: opImage_,
    imageIndex: opImageIndex_,   // 中繼資料 + 96px 縮圖，後台清單一次畫完
    saveThumb: opSaveThumb_,     // 回填既有影像的縮圖，不動位元組
    upload: opUpload_,
    renameId: opRenameId_,       // 改商品編號，連影像鍵一起搬
    saveHouse: opSaveHouse_,
    deleteHouse: opDeleteHouse_,
    publish: opPublish_,
    status: opStatus_
  };
}

var HAS = Object.prototype.hasOwnProperty;

/** 目前這份部署支援的 op，排序後回傳。給 ping 用 */
function opNames_() {
  var r = routes_();
  var out = [];
  for (var k in r) if (HAS.call(r, k) && typeof r[k] === 'function') out.push(k);
  return out.sort();
}

function route_(b) {
  var op = String(b.op);
  var r = routes_();

  // 🔴 一定要用 hasOwnProperty，不能只檢查 typeof。
  //    物件的原型鏈上有 constructor、toString、valueOf ——
  //    它們都是「函式」，所以 typeof 檢查會放行。
  //    傳 op:'constructor' 進來就會呼叫到 Object 的建構子。
  //    這裡不會造成實質損害，但它是原型污染那一類問題的入口，
  //    而且會讓 bad-op 這個錯誤訊息說謊。
  if (!HAS.call(r, op) || typeof r[op] !== 'function') return { ok: false, err: 'bad-op' };

  var fn = r[op];
  if (PUBLIC_OPS.indexOf(op) !== -1) return fn(b);
  return withAuth_(b, function () { return fn(b); });
}

/* ══ 認證 ══════════════════════════════════════════════════════════
   密碼 → HMAC 簽章令牌（8 小時）。連續失敗五次鎖十五分鐘。

   為什麼鎖定計數用 PropertiesService 而不是 CacheService：
   快取可以被 Google 隨時逐出，逐出等於鎖定歸零 —— 攻擊者只要製造快取壓力
   就能繞過鎖定。安全控制不能建立在「可能會消失」的儲存上。
   配額不是問題：一天登入幾次，離每日五萬次讀寫差五個數量級。

   Apps Script 拿不到 client IP（e 物件裡沒有這個資訊），所以速率限制只能是
   全域的。副作用是任何人都能故意打錯五次把你自己鎖住 —— 所以有 unlock()
   這個自救出口，以及第三次失敗就寄信的告警。 */

function opLogin_(b) {
  var lock = LockService.getScriptLock();
  // 存取權是「所有人」時匿名請求會真的並行，沒有鎖的話失敗計數器會有 race
  try { lock.waitLock(10000); } catch (e) { return { ok: false, err: 'busy' }; }

  try {
    var props = PropertiesService.getScriptProperties();
    var until = Number(props.getProperty('lock_until') || 0);
    var now = Date.now();

    // 鎖定期間直接回，不做密碼比對 —— 省下 KDF 的秒級成本，
    // 也避免鎖定期間被當成「密碼對不對」的問答機
    //
    // 回應刻意不帶 retryAfter，錯誤時也不帶剩餘次數：那兩個數字等於
    // 把「幾次會鎖、鎖多久」直接告訴打的人，讓他能算出最有效的敲擊節奏。
    // 門檻與時間只出現在寄給擁有者的告警信裡。被自己鎖住時用編輯器的 unlock()。
    if (now < until) {
      return { ok: false, err: 'locked' };
    }

    var hash = props.getProperty('PW_HASH');
    if (!hash) return { ok: false, err: 'not-initialised' };

    var given = kdf_(String(b.pw || '').trim(), props.getProperty('PW_SALT'),
                     Number(props.getProperty('PW_ITER')));

    if (!ctEq_(given, hash)) {
      var fails = Number(props.getProperty('fail_count') || 0) + 1;
      if (fails >= MAX_FAILS) {
        props.setProperty('lock_until', String(now + LOCK_MS));
        props.setProperty('fail_count', '0');
        alert_('後台已鎖定 15 分鐘', '連續 ' + MAX_FAILS + ' 次密碼錯誤，時間 ' + nowIso_() + '。');
        return { ok: false, err: 'locked' };
      }
      props.setProperty('fail_count', String(fails));
      if (fails === ALERT_AT) {
        alert_('後台密碼連續錯誤', '已連續 ' + fails + ' 次，時間 ' + nowIso_() + '。再錯 ' +
          (MAX_FAILS - fails) + ' 次會鎖定 15 分鐘。');
      }
      audit_('login', false, '密碼錯誤（第 ' + fails + ' 次）');
      return { ok: false, err: 'bad-pw' };
    }

    props.setProperty('fail_count', '0');
    audit_('login', true, '');
    var t = issue_();
    return { ok: true, token: t.token, exp: t.exp };
  } finally {
    lock.releaseLock();
  }
}

function opRenew_(b) {
  var p = verify_(b.token);
  if (p.exp - Date.now() > TOKEN_RENEW_MS) return { ok: true, token: b.token, exp: p.exp };
  var t = issue_();
  return { ok: true, token: t.token, exp: t.exp };
}

function issue_() {
  var props = PropertiesService.getScriptProperties();
  var now = Date.now();
  var payload = {
    v: 1, sub: 'admin', iat: now, exp: now + TOKEN_TTL_MS,
    // epoch 對不上就整批失效 —— 密碼外洩時把它 +1 就能一次撤銷所有已發出的令牌
    epoch: props.getProperty('TOKEN_EPOCH') || '1'
  };
  var p = b64url_(JSON.stringify(payload));
  return { token: p + '.' + hmacHex_(p, props.getProperty('HMAC_SECRET')), exp: payload.exp };
}

/**
 * 驗令牌。過不了就丟例外，由 withAuth_ 收成 JSON。
 * 順序很重要：先驗簽章，再解析內容 —— 反過來等於拿未驗證的輸入餵解析器。
 */
function verify_(token) {
  if (typeof token !== 'string' || token.length < 8) throw new AuthError_('no-token');
  var i = token.lastIndexOf('.');
  if (i < 1) throw new AuthError_('bad-token');

  var body = token.slice(0, i), sig = token.slice(i + 1);
  var props = PropertiesService.getScriptProperties();
  if (!ctEq_(sig, hmacHex_(body, props.getProperty('HMAC_SECRET')))) throw new AuthError_('bad-sig');

  var o;
  try { o = JSON.parse(unb64url_(body)); } catch (e) { throw new AuthError_('bad-payload'); }
  if (!o || o.exp < Date.now()) throw new AuthError_('expired');
  if (String(o.epoch) !== String(props.getProperty('TOKEN_EPOCH') || '1')) throw new AuthError_('revoked');
  return o;
}

function AuthError_(code) { this.name = 'AuthError'; this.code = code; this.message = code; }

function withAuth_(b, fn) {
  try { verify_(b.token); } catch (e) {
    if (e.name === 'AuthError') return { ok: false, err: 'auth', reason: e.code };
    throw e;
  }
  return fn();
}

/* ══ 密碼學小工具 ═══════════════════════════════════════════════════ */

/**
 * HMAC-SHA256 轉十六進位。
 *
 * computeHmacSha256Signature 回傳的是「有號」byte 陣列，含負數。
 * 不先轉成無號就 toString(16)，會產生 '-1a' 這種東西，字串長度不固定，
 * 驗證永遠失敗 —— 這是 Apps Script 寫 HMAC 最常見的一個坑。
 */
function hmacHex_(msg, key) {
  var raw = Utilities.computeHmacSha256Signature(String(msg), String(key));
  var out = '';
  for (var i = 0; i < raw.length; i++) {
    var b = (raw[i] < 0 ? raw[i] + 256 : raw[i]) & 0xff;
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

/**
 * 常數時間字串比對。
 * 用 === 比雜湊值會因為「第幾個字元不同」而有時間差，理論上可被量測。
 * 這裡成本近乎為零，沒有理由不做。
 */
function ctEq_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var d = 0;
  for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * 密碼雜湊：迭代 HMAC。Apps Script 沒有 PBKDF2 / bcrypt / argon2。
 *
 * ── 為什麼迭代次數刻意壓低 ──────────────────────────────────────
 *
 * 高成本 KDF 的用途是「雜湊外洩後拖慢離線破解」。但在這個架構裡，
 * PW_HASH 與 HMAC_SECRET 存在同一個指令碼屬性裡 —— 那裡一旦外洩，
 * 攻擊者直接拿 HMAC_SECRET 偽造令牌就有完整權限，破解密碼是多餘的。
 * 所以提高迭代次數保護不到任何東西。
 *
 * 反過來，成本高有實際傷害：2026-09-06 實測 20,000 次要 10.9 秒，而
 * Apps Script 消費者帳號每日總執行時間只有 90 分鐘。鎖定機制擋得住猜密碼
 * （五次鎖十五分鐘），但擋不住配額消耗 —— 每 15 分鐘燒 5×11 秒，
 * 一天就是 88 分鐘，幾乎剛好把配額吃光，等於零成本讓後台整天不能用。
 *
 * 所以：迭代次數由 initSecrets 自動校準到約 250ms（見 tuneIter_），
 * 真正的防線放在密碼熵與鎖定機制上。
 */
function kdf_(pw, salt, iter) {
  var h = String(salt) + '|' + String(pw);
  var n = iter || 600;
  for (var i = 0; i < n; i++) h = hmacHex_(h, salt);
  return h;
}

/**
 * 校準目標。夠慢到不是明文比對，夠快到不會變成配額消耗的槓桿。
 *
 * 訂在 120ms 而不是「看起來剛好」的 250ms，是因為 Apps Script 的執行速度
 * 波動很大：2026-09-06 實測同樣 416 次迭代，校準當下量到 250ms，
 * 幾分鐘後的 selfTest 量到 1201ms —— 差五倍。校準只能抓到當下那一刻，
 * 所以目標值要留出這個倍率的餘裕，而不是貼著門檻設。
 */
var KDF_TARGET_MS = 120;

/**
 * 量測這個帳號實際的 HMAC 速度，回推該用幾次迭代。
 *
 * 不寫死次數：Apps Script 的執行速度會隨 Google 的後端而變，
 * 寫死的數字在別的時間點可能又變成 10 秒。
 *
 * ── 探針要夠大，而且要驗算 ──────────────────────────────────────
 *
 * 第一版用 200 次迭代當探針，結果 2026-09-06 實測校準到 4000 次、
 * 登入要 2.6 秒（目標是 250ms，差一個數量級）。原因是 200 次跑起來太快，
 * Date.now() 的解析度量不出有意義的值，每次耗時被嚴重低估，
 * 於是算出來的次數爆表、被夾到上限 —— 而夾住上限讓這個錯誤看起來像
 * 「有在運作」，沒有任何徵兆。探針量不準時靜默夾住，比直接失敗更糟。
 *
 * 所以改成兩段：先用夠大的探針估，再實跑一次驗算，偏差超過兩倍就按
 * 實測值修正。多花約一秒，但這是初始化時才跑的一次性成本。
 */
function tuneIter_(salt) {
  var LO = 200, HI = 2000;   // 上限對應約 1 秒，不會再回到配額問題

  // 第一段：用 2000 次迭代量測。這個規模跑起來是幾百毫秒等級，
  // 遠高於計時器解析度，估出來的每次耗時才有意義。
  var probe = 2000;
  var t0 = Date.now();
  kdf_('calibration-probe', salt, probe);
  var probeMs = Math.max(Date.now() - t0, 1);
  var n = Math.min(Math.max(Math.round(KDF_TARGET_MS * probe / probeMs), LO), HI);

  // 第二段：拿算出來的 n 實跑一次，確認真的落在目標附近。
  // 估算會因為 JIT 暖機、後端負載而偏掉，實測不會。
  var t1 = Date.now();
  kdf_('calibration-verify', salt, n);
  var realMs = Math.max(Date.now() - t1, 1);
  if (realMs > KDF_TARGET_MS * 2 || realMs < KDF_TARGET_MS / 2) {
    n = Math.min(Math.max(Math.round(n * KDF_TARGET_MS / realMs), LO), HI);
  }
  return n;
}

function b64url_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.newBlob(s).getBytes()).replace(/=+$/, '');
}
function unb64url_(s) {
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(s)).getDataAsString();
}

/* ══ 匯出（CI 用）══════════════════════════════════════════════════
   用共用金鑰而不是令牌：CI 沒有人可以輸入密碼。

   金鑰的權限邊界不靠 CI 自律，靠這裡的程式碼 —— 它只讀得到下面四張分頁。
   'products_private' 這個名字在這條路徑上不存在。 */

var EXPORT_SHEETS = ['products', 'houses', 'categories'];

function opExport_(b) {
  var props = PropertiesService.getScriptProperties();
  var want = props.getProperty('CI_EXPORT_KEY');
  if (!want) return { ok: false, err: 'not-initialised' };
  if (!ctEq_(String(b.key || ''), want)) {
    audit_('export', false, '金鑰錯誤');
    return { ok: false, err: 'bad-key' };
  }

  var ss = openBook_();
  var part = b.part || 'meta';

  if (part === 'meta') {
    var out = { ok: true, ver: VERSION, at: nowIso_() };
    EXPORT_SHEETS.forEach(function (n) { out[n] = readSheet_(ss, n); });
    // 軟刪除的不輸出。前台看不到，產生器也不必知道它們存在
    out.products = out.products.filter(function (r) { return !truthy_(r.deleted); });
    audit_('export', true, 'meta：' + out.products.length + ' 件商品');
    return out;
  }

  if (part === 'images') {
    // 影像分頁可能很大（一格四萬字元）。分頁回傳，避免單次回應撐爆。
    // 它在另一份試算表裡 —— 分開是為了讓主檔維持可用的速度
    var rows = readSheet_(openImages_(), 'images');
    var page = Math.max(0, Number(b.page || 0));
    var size = Math.min(Math.max(1, Number(b.size || 40)), 200);
    var slice = rows.slice(page * size, (page + 1) * size);
    return {
      ok: true, page: page, size: size, total: rows.length,
      more: (page + 1) * size < rows.length, images: slice
    };
  }

  return { ok: false, err: 'bad-part' };
}

/** 讀整張分頁成物件陣列。標題列當 key，空白列跳過 */
function readSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < 2) return [];
  var width = sh.getLastColumn();
  var values = sh.getRange(1, 1, last, width).getValues();
  var head = values[0].map(String);
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (String(row[0]).trim() === '') continue;      // 第一欄空的視為空列
    var o = {};
    for (var c = 0; c < head.length; c++) if (head[c]) o[head[c]] = row[c];
    out.push(o);
  }
  return out;
}

/** Sheet 的核取方塊回傳 boolean，但手打的可能是字串 'TRUE' */
function truthy_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

/* ══ 需令牌的讀取 ═══════════════════════════════════════════════════ */

/**
 * 後台的商品清單。
 *
 * 刻意「不」回傳成本：即使令牌外洩，攻擊者也拿不到整批 FOB 價。
 * 要看成本得逐件呼叫另一個端點，而每一次都會進 audit 分頁。
 */
function opList_() {
  var ss = openBook_();
  return {
    ok: true,
    products: readSheet_(ss, 'products'),
    categories: readSheet_(ss, 'categories'),
    houses: readSheet_(ss, 'houses')
  };
}

/* ══ 雜項 ══════════════════════════════════════════════════════════ */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function nowIso_() { return new Date().toISOString(); }

/** 操作日誌。出事時這是唯一的鑑識依據，所以寫入失敗也不能拖垮主流程 */
function audit_(op, ok, note) {
  try {
    var sh = openBook_().getSheetByName('audit');
    if (sh) sh.appendRow([nowIso_(), op, ok ? 'TRUE' : 'FALSE', note || '']);
  } catch (e) { /* 記不成就算了，不要因為記帳失敗而讓使用者的操作失敗 */ }
}

/**
 * 告警信。每日 100 封配額，登入失敗這種頻率綽綽有餘。
 *
 * 收件人用 initSecrets 當時記下來的 OWNER_EMAIL，不即時取 ——
 * 匿名呼叫時 Session.getEffectiveUser().getEmail() 可能回空字串，
 * 那樣信會靜默寄不出去，而告警靜默失效比沒有告警更糟：
 * 你會以為沒有人在敲門。
 */
function alert_(subject, body) {
  try {
    var to = PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL');
    if (!to) to = Session.getEffectiveUser().getEmail();   // 舊資料的退路
    if (!to) return;
    MailApp.sendEmail(to, '[Velora] ' + subject, body);
  } catch (e) { /* 寄不出去不影響安全控制本身 */ }
}

/* ══ 編輯器裡手動執行的維護函式（不是端點）════════════════════════ */

/**
 * 產生所有密鑰，並印出「只會顯示這一次」的兩串。
 *
 * 執行一次就好。重跑會產生新的密碼與金鑰，舊的立刻失效。
 *
 * 🔴 執行紀錄會含密碼與 CI 金鑰。存進密碼管理器之後，
 *    到「執行項目」把那筆紀錄刪掉，並且不要把紀錄貼給任何人（包含 AI 助理）。
 */
function initSecrets() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('PW_HASH')) {
    return '已經初始化過了。真的要重設請先手動刪掉 PW_HASH 這個指令碼屬性 —— ' +
           '重設會讓現有密碼與 CI 金鑰同時失效。';
  }

  // 用幾個字串起來當密碼：長度換來的熵遠比「加符號」有效，而且抄得下來
  var words = ('amber anchor basalt cedar cobalt delta ember fjord garnet harbor indigo ' +
    'ivory jasper kelp linen marble nimbus onyx pewter quartz reed slate teak umber ' +
    'velvet willow yarrow zephyr').split(' ');
  var pick = [];
  for (var i = 0; i < 5; i++) pick.push(words[Math.floor(Math.random() * words.length)]);
  var pw = pick.join('-') + '-' + Math.floor(Math.random() * 9000 + 1000);

  var salt = Utilities.getUuid().replace(/-/g, '');
  var iter = tuneIter_(salt);   // 校準到約 250ms，理由見 kdf_ 的說明

  props.setProperties({
    PW_SALT: salt,
    PW_ITER: String(iter),
    PW_HASH: kdf_(pw, salt, iter),
    HMAC_SECRET: Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''),
    CI_EXPORT_KEY: 'cik_' + Utilities.getUuid().replace(/-/g, ''),
    TOKEN_EPOCH: '1',
    fail_count: '0',
    lock_until: '0',
    // 在編輯器裡執行時這個值一定拿得到；之後匿名呼叫時就取不到了，
    // 所以要趁現在記下來（見 alert_ 的說明）
    OWNER_EMAIL: Session.getEffectiveUser().getEmail() || ''
  }, false);

  var msg =
    '════════ 只會顯示這一次，現在就存進密碼管理器 ════════\n\n' +
    '後台密碼：\n  ' + pw + '\n\n' +
    'GitHub Secret CI_EXPORT_KEY：\n  ' + props.getProperty('CI_EXPORT_KEY') + '\n\n' +
    '════════════════════════════════════════════════\n' +
    'KDF 迭代次數已校準為 ' + iter + '（目標約 ' + KDF_TARGET_MS + 'ms）。\n' +
    'HMAC_SECRET 已產生但不顯示 —— 它不需要離開這個專案。\n' +
    '存好之後請到「執行項目」刪掉這筆執行紀錄。\n' +
    '這兩串不要貼給任何人，包含 AI 助理。';
  Logger.log(msg);
  return msg;
}

/**
 * 只換密碼，不動 HMAC_SECRET 與 CI_EXPORT_KEY。
 *
 * 用在「密碼要換掉、但不想重設整個專案」的時候 —— 例如這次要把
 * KDF 迭代次數從 20,000 降到校準值（迭代次數是雜湊的一部分，
 * 不重算雜湊就改不了）。
 *
 * 因為 CI_EXPORT_KEY 沒變，GitHub Secret 不用跟著改。
 *
 * 🔴 執行紀錄會含新密碼，存好之後把那筆紀錄刪掉。
 */
function rekeyPassword() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('HMAC_SECRET')) {
    return '還沒初始化過，請先執行 initSecrets。';
  }

  var words = ('amber anchor basalt cedar cobalt delta ember fjord garnet harbor indigo ' +
    'ivory jasper kelp linen marble nimbus onyx pewter quartz reed slate teak umber ' +
    'velvet willow yarrow zephyr').split(' ');
  var pick = [];
  for (var i = 0; i < 5; i++) pick.push(words[Math.floor(Math.random() * words.length)]);
  var pw = pick.join('-') + '-' + Math.floor(Math.random() * 9000 + 1000);

  var salt = Utilities.getUuid().replace(/-/g, '');
  var iter = tuneIter_(salt);

  var t0 = Date.now();
  var hash = kdf_(pw, salt, iter);
  var took = Date.now() - t0;

  props.setProperties({ PW_SALT: salt, PW_ITER: String(iter), PW_HASH: hash,
                        fail_count: '0', lock_until: '0' }, false);

  // 舊令牌是用舊密碼換到的，換密碼就該讓它們失效
  var next = String(Number(props.getProperty('TOKEN_EPOCH') || '1') + 1);
  props.setProperty('TOKEN_EPOCH', next);

  var msg =
    '════════ 新密碼，只會顯示這一次 ════════\n\n' +
    '  ' + pw + '\n\n' +
    '══════════════════════════════════════\n' +
    'KDF 迭代次數：' + iter + '（實測雜湊耗時 ' + took + 'ms）\n' +
    'CI_EXPORT_KEY 沒有變，GitHub Secret 不用改。\n' +
    '所有舊令牌已失效（TOKEN_EPOCH → ' + next + '）。\n' +
    '存好之後請到「執行項目」刪掉這筆執行紀錄。';
  Logger.log(msg);
  return msg;
}

/**
 * 換成你自己想的密碼。
 *
 * 為什麼不是 setPassword('你的密碼') 這種帶參數的寫法：
 * Apps Script 的執行按鈕只能執行零參數函式，要傳參數就得把密碼寫進原始碼，
 * 而原始碼會進版本歷史 —— 密碼一旦寫進去就等於永久留存，之後刪掉也還在歷史裡。
 * 所以改成從指令碼屬性讀，讀完立刻刪。
 *
 * 用法：
 *   1. 左側齒輪「專案設定」→ 最下面「指令碼屬性」→ 新增 PW_NEW = 你的密碼
 *   2. 回編輯器執行 setPassword
 *   3. 驗過長度就換掉，並自動刪除 PW_NEW
 */
var PW_MIN_CHARS = 12;
var PW_BANNED = ['velora', 'vuca', 'saintmari', 'admin', 'password', 'passwd',
                 '123456', '654321', 'qwerty', 'abcdef', '2024', '2025', '2026',
                 '維羅拉', '後台', '密碼'];

function setPassword() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('HMAC_SECRET')) return pwSay_('還沒初始化過，請先執行 initSecrets。');

  var raw = props.getProperty('PW_NEW');
  if (raw === null) {
    return pwSay_(
      '沒有找到 PW_NEW。請照這個順序：\n' +
      '  1. 左側齒輪「專案設定」→ 最下面「指令碼屬性」→「新增指令碼屬性」\n' +
      '  2. 屬性名稱填 PW_NEW，值填你要用的密碼，按儲存\n' +
      '  3. 回到編輯器再執行一次 setPassword\n' +
      '成功之後 PW_NEW 會被自動刪掉，不會留在專案裡。');
  }

  // 前後空白是最難查的錯：貼上時多帶一個空格，之後每次登入都失敗，
  // 而畫面上完全看不出來。在這裡剝掉，登入端也一併剝。
  var pw = String(raw).replace(/^\s+|\s+$/g, '');

  var bad = pwReject_(pw);
  if (bad) return pwSay_('沒有更換。' + bad + '\n\nPW_NEW 保留著，改好值再執行一次。');

  var cur = props.getProperty('PW_HASH');
  if (cur && kdf_(pw, props.getProperty('PW_SALT'), Number(props.getProperty('PW_ITER'))) === cur) {
    return pwSay_('沒有更換：這組跟現在用的完全一樣。\n\nPW_NEW 保留著。');
  }

  var salt = Utilities.getUuid().replace(/-/g, '');
  var iter = tuneIter_(salt);
  var t0 = Date.now();
  var hash = kdf_(pw, salt, iter);
  var took = Date.now() - t0;

  props.setProperties({ PW_SALT: salt, PW_ITER: String(iter), PW_HASH: hash,
                        fail_count: '0', lock_until: '0' }, false);

  // 寫完再讀回來驗一次。沒有這一步的話，setProperties 靜默失敗
  // 會變成「以為換好了、其實還是舊密碼」，而你要到下次登入才發現。
  if (props.getProperty('PW_HASH') !== hash) {
    return pwSay_('✗ 寫入後讀回來對不上，密碼可能沒換成功。PW_NEW 保留著，請再執行一次。');
  }

  var next = String(Number(props.getProperty('TOKEN_EPOCH') || '1') + 1);
  props.setProperty('TOKEN_EPOCH', next);
  props.deleteProperty('PW_NEW');

  return pwSay_(
    '✓ 密碼已更換。\n\n' +
    '  長度         ' + pw.length + ' 個字元\n' +
    '  KDF 迭代     ' + iter + ' 次（實測 ' + took + 'ms）\n' +
    '  PW_NEW       已刪除\n' +
    '  舊令牌       全部失效（TOKEN_EPOCH → ' + next + '）\n\n' +
    'CI_EXPORT_KEY 沒有變，GitHub Secret 不用改。\n' +
    '密碼本身不會顯示在這裡 —— 這支函式從頭到尾沒有把它印出來過。');
}

/** 回傳拒絕的理由；通過則回傳空字串。分開寫是為了能單獨測。 */
function pwReject_(pw) {
  if (pw.length < PW_MIN_CHARS) {
    return '太短了：' + pw.length + ' 個字元，至少要 ' + PW_MIN_CHARS + ' 個。中文一個字算一個。';
  }
  var seen = {};
  var kinds = 0;
  for (var i = 0; i < pw.length; i++) {
    if (!seen[pw.charAt(i)]) { seen[pw.charAt(i)] = 1; kinds++; }
  }
  if (kinds < 4) return '重複字元太多：整組只有 ' + kinds + ' 種不同的字。';

  var low = pw.toLowerCase();
  for (var j = 0; j < PW_BANNED.length; j++) {
    if (low.indexOf(PW_BANNED[j]) !== -1) {
      return '含有太好猜的字串「' + PW_BANNED[j] + '」。跟這個站有關的字、年份、鍵盤順序都不能用 —— ' +
             '針對性的攻擊第一個試的就是站名加年份。';
    }
  }
  return '';
}

/**
 * 驗 pwReject_ 真的會擋。
 *
 * 寫這個的理由：一道從來沒失敗過的檢查等同於沒有檢查 ——
 * 你分不出它是真的在驗，還是條件寫錯了永遠回傳通過。
 */
function testPwRules() {
  var cases = [
    ['太短', 'abc123', true],
    ['剛好 11 個', 'abcdefghijk', true],
    ['剛好 12 個', 'ab3d5f7h9jkm', false],
    ['只有兩種字', 'ababababababab', true],
    ['站名加年份', 'Velora@2026', true],
    ['含站名', 'my-velora-passphrase', true],
    ['含年份', '小虎2026年來我家', true],
    ['鍵盤順序', 'qwertyuiopasd', true],
    ['中文 12 字', '小虎在二零一九年來我家住', false],
    ['正常英文', 'the-cat-sat-on-my-keyboard', false]
  ];
  var out = [];
  var bad = 0;
  for (var i = 0; i < cases.length; i++) {
    var name = cases[i][0], pw = cases[i][1], want = cases[i][2];
    var why = pwReject_(pw);
    var got = why !== '';
    var ok = got === want;
    if (!ok) bad++;
    out.push((ok ? '  ✓ ' : '  ✗ ') + name + '　預期' + (want ? '擋下' : '放行') +
             '，實際' + (got ? '擋下' : '放行'));
  }
  return pwSay_('密碼規則檢查\n' + out.join('\n') + '\n\n' +
    (bad ? '✗ ' + bad + ' 項不符預期' : '✓ ' + cases.length + '/' + cases.length + ' 全部符合預期'));
}

/** Logger.log 之後回傳同一份字串 —— 只 return 不 log 的話，執行紀錄會是空的。 */
function pwSay_(msg) {
  Logger.log(msg);
  return msg;
}

/**
 * 被鎖住時的自救出口。
 *
 * 因為 Apps Script 拿不到 client IP，鎖定必然是全域的 ——
 * 任何人都能靠故意打錯密碼把你自己鎖在門外。沒有這個函式的話，
 * 那是一個零成本就能讓你十五分鐘不能上架的阻斷手段。
 */
function unlock() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('lock_until', '0');
  props.setProperty('fail_count', '0');
  return '已解除鎖定。';
}

/**
 * 撤銷所有已發出的令牌（密碼外洩、或懷疑令牌被複製時用）。
 * 不影響密碼本身，只是讓所有現存的登入 session 立刻失效。
 */
function revokeAllTokens() {
  var props = PropertiesService.getScriptProperties();
  var next = String(Number(props.getProperty('TOKEN_EPOCH') || '1') + 1);
  props.setProperty('TOKEN_EPOCH', next);
  return '所有令牌已失效（TOKEN_EPOCH → ' + next + '）。下次操作需要重新登入。';
}

/**
 * 本機自測：不經過網路，直接驗雜湊、令牌與匯出邊界。
 * 部署前跑一次，可以把「簽章驗不過」這類問題擋在瀏覽器之外。
 */
function selfTest() {
  var out = [];
  var ok = function (c, m) { out.push((c ? '  ✓ ' : '  ✗ ') + m); };
  // 「略過」要跟「失敗」分開標示。拿 ✗ 表示不適用，會訓練人忽略 ✗ ——
  // 那樣真的失敗時也就看不見了
  var skip = function (m) { out.push('  – ' + m); };

  // hmacHex 的負數 byte 處理
  var h = hmacHex_('abc', 'key');
  ok(/^[0-9a-f]{64}$/.test(h), 'hmacHex 輸出 64 個十六進位字元（實得 ' + h.length + '）');
  ok(hmacHex_('abc', 'key') === h, 'hmacHex 同輸入同輸出');
  ok(hmacHex_('abd', 'key') !== h, 'hmacHex 不同輸入不同輸出');

  ok(ctEq_('abc', 'abc') && !ctEq_('abc', 'abd') && !ctEq_('abc', 'abcd'), '常數時間比對正確');

  // 令牌一圈
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('HMAC_SECRET')) {
    skip('尚未執行 initSecrets，令牌測試略過（跑完 initSecrets 再測一次）');
  } else {
    var t = issue_();
    var p = null, threw = false;
    try { p = verify_(t.token); } catch (e) { threw = true; }
    ok(!threw && p && p.sub === 'admin', '令牌簽發後驗得過');
    threw = false;
    try { verify_(t.token.slice(0, -1) + (t.token.slice(-1) === 'a' ? 'b' : 'a')); }
    catch (e) { threw = true; }
    ok(threw, '簽章被竄改一個字元就驗不過');
    threw = false;
    try { verify_('garbage'); } catch (e) { threw = true; }
    ok(threw, '亂填的令牌驗不過');
  }

  // 匯出邊界：機密分頁的名字不該出現在匯出清單裡
  ok(EXPORT_SHEETS.indexOf('products_private') === -1,
     '匯出分頁清單不含 products_private（實際：' + EXPORT_SHEETS.join(', ') + '）');

  // KDF 成本。太慢不只是難用 —— 每日執行時間配額只有 90 分鐘，
  // 一次登入 11 秒的話，攻擊者每 15 分鐘燒 5 次就能把整天的配額吃光
  var iter = Number(props.getProperty('PW_ITER') || 0);
  if (!iter) {
    skip('尚未設定 PW_ITER，KDF 成本測試略過');
  } else {
    var t0 = Date.now();
    kdf_('timing-probe', props.getProperty('PW_SALT'), iter);
    var ms = Date.now() - t0;
    ok(ms < 1500, 'KDF 耗時 ' + ms + 'ms（迭代 ' + iter + ' 次）—— 需低於 1500ms，' +
      '否則登入端點會變成配額消耗的槓桿');
  }

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}
