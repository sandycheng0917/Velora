/**
 * 後台的傳輸層。**全專案只有這個檔案直接呼叫 fetch。**
 *
 * ══ Apps Script 的三條硬限制（不是風格選擇，是天花板）══════════════
 *
 * 1. 沒有 doOptions。Apps Script 只暴露 doGet / doPost，CORS 的 preflight
 *    由 Google 前端處理，你無法回應它。所以每一個請求都必須是
 *    「simple request」，也就是：
 *      · Content-Type 只能是 text/plain;charset=utf-8
 *        （application/json 會觸發 preflight，整個後台連不上）
 *      · 不得帶任何自訂標頭。Authorization、X-Token 都不行 ——
 *        加了就 preflight。所以令牌放在 JSON body 裡，不放標頭。
 *
 * 2. ContentService 無法設定任何回應標頭。TextOutput 只有 setContent /
 *    setMimeType，沒有 setHeader。所以也不能用 Set-Cookie 發 session。
 *
 * 3. /exec 一定會 302 轉到 script.googleusercontent.com。
 *    /admin/ 的 CSP connect-src 必須「同時」列出這兩個網域 ——
 *    只寫 script.google.com 的話，Chrome 會擋掉轉址後的那一跳，
 *    而錯誤訊息只說 CSP 擋了，不會說是哪一跳。
 *
 * 這三條已於 2026-09-06 在真的瀏覽器裡實測確認過
 * （text/plain 200、application/json 被 preflight 擋、自訂標頭被 preflight 擋）。
 *
 * ══ 端點網址不是機密 ═══════════════════════════════════════════════
 *
 * VITE_EXEC_URL 是這個 bundle 裡唯一的外部字串。它等同任何網站的
 * POST /api/login —— 安全性來自密碼與 HMAC 簽章，不來自網址保密。
 * 公開版（v1）刻意不傳這個變數：對外的站台不需要知道端點存在。
 */

const EXEC = import.meta.env.VITE_EXEC_URL || ''

/** 呼叫失敗的統一形狀。UI 只看 code，訊息給人看 */
export class ApiError extends Error {
  constructor(code, message, detail) {
    super(message)
    this.code = code
    this.detail = detail
  }
}

/** 錯誤碼 → 給人看的中文。看不懂的錯誤訊息等於沒有錯誤訊息 */
const MESSAGES = {
  'no-config': '沒有設定端點網址。建置時要給 VITE_EXEC_URL。',
  network: '連不上伺服器。檢查網路，或端點是否還在部署中。',
  'bad-json': '伺服器回了看不懂的東西。通常是 Apps Script 拋了未捕捉的例外。',
  busy: '伺服器正忙，請幾秒後再試。',
  locked: '暫時無法登入，請稍後再試。',
  'bad-pw': '密碼不正確。',
  'not-initialised': '後端還沒初始化。請先在 Apps Script 編輯器執行 initSecrets。',
  auth: '登入已失效，請重新登入。',
  'bad-op': '這個版本的後端不認得這個操作，可能是部署版本太舊。',
  invalid: '有欄位沒有通過檢查。',
  'not-found': '找不到這件商品。',
  'write-failed': '寫入後讀回來對不上，資料可能沒存進去。請再試一次。',
  'not-configured': 'GitHub 設定不完整，無法發布。',
  github: 'GitHub 拒絕了這個請求。',
  incomplete: '影像資料不完整，可能上傳到一半中斷了。',
  // 這幾個以前沒有對應的中文，畫面上只會顯示「未預期的錯誤：bad-key」。
  // 一個看不懂的錯誤碼等於沒有錯誤訊息 —— 使用者不知道要去改哪裡
  'bad-key': '影像鍵不合法。它是用商品編號組的，編號只能是小寫英數與連字號。',
  'bad-product': '送出的商品資料格式不對。',
  'no-key': '沒有指定影像鍵。',
  'no-id': '沒有指定商品編號。',
  'no-data': '沒有收到影像資料。',
  'no-sheet': '找不到對應的試算表分頁，後端可能還沒初始化。',
  'chunk-too-big': '單一區塊超過 Sheet 一格的字元上限。',
  'no-thumb-col': 'images 分頁還沒有 thumb 欄。請在 Apps Script 編輯器執行 addThumbColumn()。',
  'bad-house': '品牌資料的格式不對。',
  'too-many': '品牌數量已達上限。',
  'house-in-use': '還有商品掛著這個品牌，不能刪。',
  'id-taken': '這個商品編號已經有人用了（不分大小寫，也包含已刪除的商品）。',
  'key-taken': '改名後的影像鍵已經存在，會蓋掉別人的圖，所以停下來了。',
  'not-found': '找不到這件商品。',
  server: '伺服器發生未預期的錯誤。',
}

export const describe = (code, fallback) => MESSAGES[code] || fallback || `未預期的錯誤：${code}`

/**
 * 發一個請求。
 *
 * 逾時用 AbortController 而不是 Promise.race —— race 只是不再等，
 * 那個請求仍然在背景跑完，連按幾次就會累積一堆看不見的在途請求。
 */
export async function call(op, body = {}, { timeout = 45000 } = {}) {
  if (!EXEC) throw new ApiError('no-config', describe('no-config'))

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeout)

  let res
  try {
    res = await fetch(EXEC, {
      method: 'POST',
      // 🔴 這個 Content-Type 不能改。改成 application/json 會觸發 preflight，
      // 而 Apps Script 沒有 doOptions 可以回應，整個後台會連不上。
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ op, ...body }),
      redirect: 'follow',
      signal: ctl.signal,
    })
  } catch (e) {
    throw new ApiError('network', e.name === 'AbortError'
      ? '等太久了，伺服器沒有回應。' : describe('network'))
  } finally {
    clearTimeout(timer)
  }

  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    // Apps Script 的未捕捉例外會回一頁 HTML 錯誤畫面。把開頭幾個字帶出來，
    // 否則畫面上只會寫「失敗」，沒有人知道發生什麼事
    throw new ApiError('bad-json', describe('bad-json'), text.slice(0, 200))
  }

  if (!json.ok) {
    throw new ApiError(json.err || 'server', describe(json.err), json.detail || json.reason || json.hint)
  }
  return json
}

/* ── 各端點的薄包裝。UI 不直接拼 op 字串 ─────────────────────────── */

export const ping = () => call('ping', { echo: Date.now() })
export const login = (pw) => call('login', { pw })
export const renew = (token) => call('renew', { token })
export const list = (token) => call('list', { token })
export const save = (token, product) => call('save', { token, product })
export const remove = (token, id, restore = false) => call('delete', { token, id, restore })
export const getImage = (token, key) => call('image', { token, key }, { timeout: 90000 })
/**
 * 中繼資料（鍵、sha、mime、alpha、bytes）加 96px 縮圖，不回原圖位元組。
 * 23 張連同縮圖約 40KB —— 後台清單靠這一次請求就把整頁的圖畫完。
 */
export const imageIndex = (token) => call('imageIndex', { token })
/** 回填既有影像的縮圖。只寫 thumb 欄，不動位元組 */
export const saveThumb = (token, key, thumb) => call('saveThumb', { token, key, thumb })
export const putImage = (token, payload) => call('upload', { token, ...payload }, { timeout: 120000 })
export const publish = (token) => call('publish', { token })
export const status = (token) => call('status', { token })

/* 品牌。上限四家由伺服器擋，前端只是先攔一次讓錯誤來得早一點 */
/** 改商品編號。伺服器會連影像鍵一起搬，所以圖片不會失聯 */
export const renameId = (token, from, to) => call('renameId', { token, from, to }, { timeout: 90000 })

export const saveHouse = (token, house) => call('saveHouse', { token, house })
export const deleteHouse = (token, key) => call('deleteHouse', { token, key })
