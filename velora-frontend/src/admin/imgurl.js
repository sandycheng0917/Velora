/**
 * 從影像索引算出「前台那張圖」的公開網址。
 *
 * ── 為什麼算得出來 ──────────────────────────────────────────────────
 *
 * 產生器輸出的檔名是**內容定址**的：
 *
 *     <影像鍵>-<sha256 前 8 碼>[.cut].<副檔名>
 *
 * sha256、mime、alpha 都在 Sheet 的 images 分頁裡，而 op:'imageIndex'
 * 只回這些中繼資料（23 張約 2KB）。所以後台不必為了一張縮圖
 * 把四萬字元的 base64 拉回來 —— 直接指向 GitHub Pages 上那個檔案，
 * 瀏覽器還會幫忙快取。
 *
 * ── 🔴 這裡跟 tools/build-catalog.mjs 的 imageFileName() 是同一條規則 ──
 *
 * 兩邊必須一致。改了一邊就要改另一邊。
 *
 * 不一致的後果刻意做成「安全的」：算出來的網址 404 時，<img> 會觸發
 * error，前端退回 op:'image' 走 API。所以最壞情況只是慢回原本的速度，
 * 不會變成破圖。剛上傳、還沒發布的圖也走同一條退路 ——
 * 那時公開網址上本來就還沒有那個檔案。
 */

/** mime → 副檔名。跟產生器的 MIME_EXT 對應 */
const EXT = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
}

/**
 * 站台根網址。CI 會帶入，本機開發沒有 —— 沒有就一律走 API，
 * 因為本機根本沒有那些檔案。
 */
const SITE = String(import.meta.env.VITE_SITE_URL || '').replace(/\/$/, '')

export const hasSite = () => SITE !== ''

/**
 * @param {{sha256:string, mime:string, alpha:boolean}} meta 來自 op:'imageIndex'
 * @returns {string} 公開網址，算不出來時回空字串
 */
export function publicUrl(key, meta) {
  if (!SITE || !key || !meta || !meta.sha256) return ''
  const ext = EXT[meta.mime] || 'webp'
  const cut = meta.alpha ? '.cut' : ''
  return `${SITE}/assets/media/${key}-${String(meta.sha256).slice(0, 8)}${cut}.${ext}`
}
