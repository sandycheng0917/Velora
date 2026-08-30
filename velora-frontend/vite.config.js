import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * base 由環境變數決定，預設為根目錄。
 * 部署到 GitHub Pages 的子路徑時（https://<帳號>.github.io/<repo>/），
 * 需要 VITE_BASE=/<repo>/ —— 部署流程會自動代入。
 */
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    /**
     * 明確指定目標，不要用預設值。
     *
     * Vite 預設會把 media query 壓成新的範圍語法 `@media (width<=720px)`，
     * 那是 Safari 16.4 / Chrome 104 之後才支援的寫法 —— iOS 16.3 以前的
     * iPhone 會直接忽略整段規則，手機上會拿到桌機版面。
     * 這個站的使用者多半用手機，所以把底線拉到 Safari 14（iOS 14, 2020）。
     */
    target: ['es2020', 'chrome87', 'safari14', 'firefox78', 'edge88'],
    cssTarget: ['chrome87', 'safari14', 'firefox78', 'edge88'],
  },
})
