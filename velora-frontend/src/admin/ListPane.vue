<script setup>
/**
 * 版單：一列一件。
 *
 * 刻意不是卡片牆也不是密集表格 —— 上架商品時真正要掃的是
 * 「哪些改過、哪些沒圖、哪些沒上架」，那是逐列比對的動作，
 * 卡片牆會把它變成來回跳視線。這是這次刻意承擔的那一個風險。
 *
 * 這個元件不打 API，資料由外面傳進來。分頁與篩選都是純前端 ——
 * 十幾件商品沒有理由來回問伺服器。
 */
import { computed, ref, watch } from 'vue'

import * as api from './api.js'
import { publicUrl } from './imgurl.js'
import * as session from './session.js'

/**
 * 影像鍵 → data URI 的快取。
 *
 * 放在模組層級而不是元件裡：換頁、切品類、進編輯頁再回來，
 * 都不該重新抓一次。整份 Sheet 的圖加起來也就幾百 KB。
 */
const thumbs = ref({})

/**
 * 抓過但 Sheet 裡沒有的影像鍵。
 *
 * 必須是響應式的 —— 用普通的 Set 的話，畫面永遠停在「載入中」的斜紋，
 * 因為 class 只看 thumbs 有沒有值。13 列全部卡在載入中，
 * 跟壞掉長得一模一樣。這是實際發生過的。
 */
const missingInSheet = ref({})

/**
 * 一次抓幾張。
 *
 * 一開始我完全不抓縮圖，理由是「清單只要回答有沒有圖，抓十三次太慢」。
 * 那是錯的判斷 —— 結果是一整排灰色空框，跟壞掉長得一模一樣，
 * 使用者第一個反應就是「上傳的圖片都沒有顯示出來」。
 *
 * 改成只抓「當前這一頁看得到的」，並行 3 條。圖會一張一張浮現，
 * 不會擋住任何操作。抓失敗的記在 failed 裡不再重試 ——
 * 一直重試一個抓不到的鍵，只會把後面的排隊卡住。
 */
let running = 0
const queue = []
async function pump() {
  while (running < 3 && queue.length) {
    const key = queue.shift()
    running++
    api
      .getImage(session.token.value, key)
      .then((r) => {
        if (r.found) thumbs.value = { ...thumbs.value, [key]: `data:${r.mime};base64,${r.data}` }
        else missingInSheet.value = { ...missingInSheet.value, [key]: 'none' }
      })
      .catch(() => (missingInSheet.value = { ...missingInSheet.value, [key]: 'error' }))
      .finally(() => {
        running--
        pump()
      })
  }
}

const props = defineProps({
  products: { type: Array, required: true },
  categories: { type: Array, required: true },
  houses: { type: Array, required: true },
  imgIndex: { type: Object, default: () => ({}) },
  isDirty: { type: Function, required: true },
})

/**
 * 縮圖優先走「前台那張烤好的圖」。
 *
 * 檔名是內容定址的，sha 在影像索引裡，所以算得出公開網址 ——
 * 瀏覽器直接載，還會快取，比每張打一次 API 快一個數量級。
 *
 * 算不出來（沒有索引、沒有站台網址）或那個網址 404（剛上傳還沒發布）
 * 就退回逐張走 op:'image'。最壞情況只是慢回原本的速度，不會破圖。
 */
const fast = (key) => publicUrl(key, props.imgIndex[key])
/** 公開網址載不到的鍵。標記之後改走 API */
const fastFailed = ref({})

function onFastError(key) {
  fastFailed.value = { ...fastFailed.value, [key]: true }
  if (!thumbs.value[key] && !missingInSheet.value[key] && !queue.includes(key)) {
    queue.push(key)
    pump()
  }
}
defineEmits(['open'])

const cat = ref('')
const q = ref('')
const per = ref(20)
const page = ref(0)

const truthy = (v) => v === true || String(v).toUpperCase() === 'TRUE'

/** 後台頁籤用短名，前台導覽列用長名。舊的 Sheet 沒有 short_* 就退回 name_* */
const shortName = (c) => c.short_zh || c.name_zh

const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return props.products
    .filter((p) => !cat.value || p.category === cat.value)
    .filter((p) => {
      if (!needle) return true
      return [p.name_zh, p.name_en, p.name_ko, p.ref, p.id]
        .some((s) => String(s || '').toLowerCase().includes(needle))
    })
    .slice()
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
})

const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / per.value)))
const shown = computed(() => {
  const start = Math.min(page.value, pages.value - 1) * per.value
  return filtered.value.slice(start, start + per.value)
})
// 當頁換了就把還沒抓的縮圖排進佇列。immediate 讓第一次載入也會跑
watch(
  shown,
  (rows) => {
    if (!session.token.value) return
    for (const p of rows) {
      const k = p.img_main
      if (!k) continue
      // 有公開網址就讓 <img> 自己去載，不必排隊走 API
      if (fast(k) && !fastFailed.value[k]) continue
      if (!thumbs.value[k] && !missingInSheet.value[k] && !queue.includes(k)) queue.push(k)
    }
    pump()
  },
  { immediate: true }
)

const from = computed(() => (filtered.value.length ? page.value * per.value + 1 : 0))
const to = computed(() => Math.min((page.value + 1) * per.value, filtered.value.length))

function pick(key) {
  cat.value = key
  page.value = 0
}

const houseName = (k) => (props.houses.find((h) => h.key === k) || {}).name || k

/** 缺譯要看得見。前台缺譯會自動回退中文，所以在前台反而看不出來 */
function missing(p) {
  const out = []
  if (!String(p.name_en || '').trim()) out.push('英')
  if (!String(p.name_ko || '').trim()) out.push('韓')
  return out
}

function state(p) {
  if (!truthy(p.listed)) return { cls: 'off', text: '未上架' }
  if (props.isDirty(p)) return { cls: 'dirty', text: '已修改' }
  return { cls: 'live', text: '已上線' }
}

const priceText = (p) =>
  truthy(p.price_public) && String(p.price).trim() !== ''
    ? `NT$ ${Number(p.price).toLocaleString('zh-TW')}`
    : '未公開'
</script>

<template>
  <div>
    <div class="filter">
      <div class="tabs">
        <button :class="{ on: !cat }" @click="pick('')">
          全部<b>{{ products.length }}</b>
        </button>
        <button
          v-for="c in categories"
          :key="c.key"
          :class="{ on: cat === c.key }"
          @click="pick(c.key)"
        >
          {{ shortName(c) }}<b>{{ products.filter((p) => p.category === c.key).length }}</b>
        </button>
      </div>
      <label class="search">
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4">
          <circle cx="9" cy="9" r="6" /><path d="M13.5 13.5 17 17" />
        </svg>
        <input v-model="q" type="text" placeholder="搜尋品名或索引碼" @input="page = 0" />
      </label>
    </div>

    <div class="sheet">
      <div class="row hd">
        <span>序</span><i /><span>圖片</span><span>品名</span>
        <span class="hideNarrow">品類</span><span class="hideNarrow">索引碼</span>
        <span class="hideNarrow">價格</span><span>狀態</span><span />
      </div>

      <button
        v-for="(p, i) in shown"
        :key="p.id"
        class="row"
        :class="{ dirty: isDirty(p) }"
        @click="$emit('open', p)"
      >
        <span class="n">{{ String(from + i).padStart(2, '0') }}</span>
        <span class="rule" />
        <!--
          縮圖是從 Sheet 抓回來的 data URI（op:'image'）。
          img_main 存的是「影像鍵」不是網址，位元組在 images 分頁。
          只抓當前這一頁，並行 3 條，抓到一張畫一張。
        -->
        <!--
          三種狀態，要分得出來：
            無圖片   這件商品連影像鍵都沒有
            未上傳   有影像鍵，但 Sheet 裡沒有位元組 —— 網站上顯示的是
                     專案裡既有的素材（遷移用的退路），從後台換一次圖就會接管
            斜紋     正在抓
        -->
        <span
          class="plate"
          :class="{
            pending: !p.img_main,
            notyet:
              p.img_main &&
              missingInSheet[p.img_main] &&
              !(fast(p.img_main) && !fastFailed[p.img_main]),
            loading:
              p.img_main &&
              !thumbs[p.img_main] &&
              !missingInSheet[p.img_main] &&
              !(fast(p.img_main) && !fastFailed[p.img_main]),
          }"
          :title="
            !p.img_main
              ? '尚未指定圖片'
              : missingInSheet[p.img_main]
                ? `影像鍵 ${p.img_main} 在 Sheet 裡沒有位元組。網站目前顯示的是專案內既有的素材，從這裡上傳一次就會接管。`
                : p.img_main
          "
        >
          <img
            v-if="p.img_main && fast(p.img_main) && !fastFailed[p.img_main]"
            :src="fast(p.img_main)"
            alt=""
            loading="lazy"
            @error="onFastError(p.img_main)"
          />
          <img v-else-if="thumbs[p.img_main]" :src="thumbs[p.img_main]" alt="" />
          <template v-else-if="!p.img_main">無圖片</template>
          <template v-else-if="missingInSheet[p.img_main]">未上傳</template>
        </span>
        <span class="nm">
          <b>{{ p.name_zh }}<em v-if="p.featured === true || String(p.featured).toUpperCase() === 'TRUE'" class="star">◆</em></b>
          <span class="alt">
            <span class="en">{{ p.name_en || '—' }}</span>
            <i />
            <span>{{ p.name_ko || '—' }}</span>
            <template v-if="missing(p).length">
              <i /><span class="miss">缺{{ missing(p).join('、') }}文</span>
            </template>
          </span>
        </span>
        <span class="cell hideNarrow">{{ (categories.find((c) => c.key === p.category) || {}).short_zh || p.category }}</span>
        <span class="cell mono hideNarrow">{{ p.ref }}</span>
        <span class="cell price hideNarrow" :class="{ hidden: priceText(p) === '未公開' }">{{ priceText(p) }}</span>
        <span class="st" :class="state(p).cls"><i />{{ state(p).text }}</span>
        <svg class="chev" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3">
          <path d="m8 5 5 5-5 5" />
        </svg>
      </button>

      <p v-if="!filtered.length" class="empty">
        沒有符合的商品。<template v-if="q">試試別的關鍵字，或</template>
        <template v-if="cat || q">
          <button class="link" @click="cat = ''; q = ''">清掉篩選條件</button>。
        </template>
      </p>
    </div>

    <div v-if="filtered.length" class="sheetfoot">
      <span>
        每頁
        <select v-model.number="per" @change="page = 0">
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
          <option :value="9999">全部</option>
        </select>
        筆
      </span>
      <span>顯示 {{ from }}–{{ to }}，共 {{ filtered.length }} 件</span>
      <span><em class="star">◆</em> 精選，會出現在首頁</span>
      <span class="grow" />
      <button class="link" :disabled="page === 0" :style="{ color: page === 0 ? 'var(--line-strong)' : '' }" @click="page--">
        上一頁
      </button>
      <button
        class="link"
        :disabled="page >= pages - 1"
        :style="{ color: page >= pages - 1 ? 'var(--line-strong)' : '' }"
        @click="page++"
      >
        下一頁
      </button>
    </div>
  </div>
</template>
