/**
 * 登入狀態。
 *
 * 令牌存 sessionStorage 而不是 localStorage —— 關掉分頁就登出，
 * 這是你選的（「不要記住裝置」）。/admin/ 是公開網址，
 * 少一個「這台電腦被別人拿到就能直接進後台」的破口。
 *
 * 令牌本身是一張會過期的票，不是密碼：它由伺服器用 HMAC 簽章，
 * payload 帶 epoch，伺服器把 TOKEN_EPOCH +1 就能一次撤銷所有已發出的票。
 */
import { ref } from 'vue'

import { renew } from './api.js'

const KEY = 'velora_admin_token'
const EXP = 'velora_admin_exp'

export const token = ref('')
export const expiresAt = ref(0)

/** sessionStorage 在無痕視窗或關閉站台資料時可能整個不能用，包起來 */
function read(k) {
  try { return sessionStorage.getItem(k) } catch { return null }
}
function write(k, v) {
  try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v) } catch { /* 記不住就每次重登 */ }
}

export function restore() {
  const t = read(KEY)
  const e = Number(read(EXP) || 0)
  // 過期的票不要留著。留著的話畫面會先進到後台再被踢出來，
  // 比直接顯示登入畫面更讓人困惑
  if (t && e > Date.now()) {
    token.value = t
    expiresAt.value = e
  } else {
    clear()
  }
  return !!token.value
}

export function set(t, exp) {
  token.value = t
  expiresAt.value = exp
  write(KEY, t)
  write(EXP, String(exp))
}

export function clear() {
  token.value = ''
  expiresAt.value = 0
  write(KEY, null)
  write(EXP, null)
}

/**
 * 剩餘壽命少於兩小時就換一張新票。
 *
 * 在每次操作前呼叫，成本是「大部分時候什麼都不做」。
 * 沒有這個的話，編輯到一半票過期，按儲存會失敗而且內容還沒存 ——
 * 那是最容易讓人丟掉一整段文字的失敗方式。
 */
export async function keepAlive() {
  if (!token.value) return false
  if (expiresAt.value - Date.now() > 2 * 60 * 60 * 1000) return true
  try {
    const r = await renew(token.value)
    set(r.token, r.exp)
    return true
  } catch {
    clear()
    return false
  }
}

/** 這張票還有多久過期，給畫面顯示用 */
export function remaining() {
  const ms = expiresAt.value - Date.now()
  if (ms <= 0) return '已過期'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h ? `${h} 小時 ${m} 分` : `${m} 分`
}
