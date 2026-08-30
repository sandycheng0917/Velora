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
})
