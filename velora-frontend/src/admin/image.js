/**
 * 瀏覽器端的圖片壓縮。原圖不會離開這台電腦 —— 只有壓完的那份會上傳。
 *
 * ══ 為什麼要二維搜尋，而不是壓一次就好 ═══════════════════════════
 *
 * 檔案大小同時受「尺寸」與「品質」影響，而且是非線性的：
 * 同一張圖 q0.8 可能 60KB，q0.7 掉到 38KB，q0.6 只掉到 34KB。
 * 單次猜一個品質必定失手 —— 不是超標就是畫質浪費掉了。
 *
 * 所以走兩層：外層由大到小試寬度，內層用二分搜尋找該寬度下
 * 「不超過上限的最高品質」。取第一個成功的寬度，因為寬度優先於品質：
 * 一張 720px q0.62 的圖，看起來比 480px q0.92 好得多。
 *
 * ══ 兩個一定要處理的瀏覽器問題 ═══════════════════════════════════
 *
 * 1. Safari < 16.4 的 canvas.toBlob(…, 'image/webp') 會**靜默回退 PNG**。
 *    不驗 blob.type 的話，會上傳一個副檔名寫 webp 的 PNG，
 *    大小暴增而且畫面上完全看不出來。所以每次都驗，發現就改走 JPEG。
 *
 * 2. 手機照片帶 EXIF 旋轉。createImageBitmap 要傳
 *    imageOrientation: 'from-image'，否則直的照片會躺著。
 *    canvas 重新編碼順帶把 EXIF 整個剝掉，包含 GPS 座標 ——
 *    那是商品照最容易夾帶的個資。
 */

/** 一格儲存格 40000 字元，base64 膨脹 4/3，所以一格約放 30KB 位元組 */
export const CHUNK_CHARS = 40000

/** 單張圖的目標上限。留餘裕給 base64 膨脹與 Sheet 的其他欄位 */
export const TARGET_BYTES = 34000

/** 上限提高到三格時的天花板，給實在壓不下去的生活情境照 */
export const TARGET_BYTES_HQ = 100000

const WIDTHS = [1200, 1000, 900, 800, 720, 640, 560, 480]

async function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * 壓一張圖。
 * @returns {{blob:Blob, width:number, height:number, quality:number, type:string, tries:number}}
 */
export async function compress(file, { target = TARGET_BYTES, onProgress } = {}) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  // 目標格式先試 WebP，失敗（Safari 舊版）就整輪改用 JPEG
  let type = 'image/webp'
  {
    canvas.width = 8
    canvas.height = 8
    const probe = await toBlob(canvas, 'image/webp', 0.8)
    if (!probe || probe.type !== 'image/webp') type = 'image/jpeg'
  }

  // 寬度階梯要從「不超過原圖」開始 —— 放大只會讓檔案變大、畫質變差。
  // 先前寫過一版從 1000 起跳並且 continue 掉比原圖大的寬度，
  // 結果 275px 的小圖一個寬度都沒試到，卻報告「壓不下 34KB」
  const ladder = WIDTHS.filter((w) => w <= bitmap.width)
  if (!ladder.length) ladder.push(bitmap.width)

  let tries = 0
  let best = null

  for (const w of ladder) {
    const h = Math.round((bitmap.height / bitmap.width) * w)
    canvas.width = w
    canvas.height = h
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)

    // 二分搜尋這個寬度下不超標的最高品質
    let lo = 0.35
    let hi = 0.92
    let hit = null
    for (let i = 0; i < 7; i++) {
      const q = (lo + hi) / 2
      const blob = await toBlob(canvas, type, q)
      tries++
      onProgress?.({ width: w, quality: q, bytes: blob?.size ?? 0, tries })
      if (blob && blob.size <= target) {
        hit = { blob, width: w, height: h, quality: q, type }
        lo = q                       // 還有空間，往上找更好的畫質
      } else {
        hi = q
      }
    }
    if (hit) { best = hit; break }   // 寬度優先：能過就用這個寬度，不再縮小
  }

  bitmap.close?.()

  if (!best) {
    throw new Error(
      `這張圖壓不到 ${Math.round(target / 1000)} KB 以內（試了 ${tries} 次）。` +
      `通常是整張都是細節的生活情境照。可以改用去背或單品照，或勾「高畫質」放寬到 ` +
      `${Math.round(TARGET_BYTES_HQ / 1000)} KB。`)
  }
  return { ...best, tries }
}

/** Blob → base64（不含 data: 前綴）。大檔案用 FileReader，不要自己組字串 */
export function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error('讀取檔案失敗'))
    r.onload = () => {
      const s = String(r.result)
      resolve(s.slice(s.indexOf(',') + 1))
    }
    r.readAsDataURL(blob)
  })
}

/** SHA-256 十六進位。建置時會拿它驗 chunk 有沒有錯亂或被 Sheets 改寫 */
export async function sha256(blob) {
  const buf = await blob.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * WebP 容器有沒有 alpha 通道。
 *
 * 不能用副檔名判斷（WebP 兩種都有），也不用 canvas 掃像素
 * （那可能因為 CORS taint 而整個失敗）。直接讀容器標頭：
 *   VP8X 的第一個 flag byte 第 4 個 bit 是 ALPHA
 *   VP8L 的第 5 個 byte 第 4 個 bit 是 has_alpha
 * 產生器會再讀一次當最終判準，這裡只是先給畫面看。
 */
export async function hasAlpha(blob) {
  const buf = new Uint8Array(await blob.slice(0, 32).arrayBuffer())
  const tag = String.fromCharCode(buf[12], buf[13], buf[14], buf[15])
  if (tag === 'VP8X') return !!(buf[20] & 0x10)
  if (tag === 'VP8L') return !!(buf[24] & 0x10)
  return false
}

/** 把 base64 切成 Sheet 放得下的格 */
export function chunk(b64) {
  const out = []
  for (let i = 0; i < b64.length; i += CHUNK_CHARS) out.push({ data: b64.slice(i, i + CHUNK_CHARS) })
  return out
}

/** 「720 × 900 · q0.70 · 31.4 KB」—— 顯示給操作者看實際發生了什麼 */
export const describe = (r) =>
  `${r.width} × ${r.height} · q${r.quality.toFixed(2)} · ${(r.blob.size / 1000).toFixed(1)} KB` +
  (r.type === 'image/jpeg' ? '（JPEG，這個瀏覽器不支援 WebP）' : '')
