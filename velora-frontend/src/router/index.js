import { createRouter, createWebHistory } from 'vue-router'

import ShowcaseView from '@/views/ShowcaseView.vue'

/**
 * 公開版（VITE_PUBLIC_BUILD=1，即預設的 npm run build）不掛後台路由。
 *
 * 條件用的是 import.meta.env，Vite 會在建置時替換成字面值，
 * 整個 if 區塊連同 import() 都會被 tree-shaking 移除 ——
 * 公開的 bundle 裡不會有後台的任何一行程式碼或樣式。
 *
 * 後台原始碼不在公開版控裡（見 .gitignore），只存在維護者本機。
 * 檔案不存在時這裡也不會出錯：那個 import 位於永遠為 false 的分支，
 * Rollup 連解析都不會做（已實測）。
 *
 * 不要改用 import.meta.glob —— 它會在建置時就把模組表建好，
 * 導致後台被打包進公開版（踩過這個坑）。
 */
const IS_PUBLIC = import.meta.env.VITE_PUBLIC_BUILD === '1'

const routes = [
  {
    path: '/',
    name: 'showcase',
    component: ShowcaseView,
    meta: { title: '維羅拉國際有限公司 | Velora International' },
  },
]

if (!IS_PUBLIC) {
  routes.push({
    path: '/admin',
    name: 'admin',
    component: () => import('@/views/AdminView.vue'),
  })
}

routes.push({ path: '/:pathMatch(.*)*', redirect: '/' })

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, saved) {
    return saved || { top: 0 }
  },
})

router.afterEach((to) => {
  if (to.meta?.title) document.title = to.meta.title
})

export default router
