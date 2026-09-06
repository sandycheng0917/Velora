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
import { computed, ref } from 'vue'

const props = defineProps({
  products: { type: Array, required: true },
  categories: { type: Array, required: true },
  houses: { type: Array, required: true },
  isDirty: { type: Function, required: true },
})
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
          這裡刻意不顯示縮圖。img_main 存的是「影像鍵」不是網址 ——
          位元組在 Sheet 的 images 分頁，要另外呼叫 op:'image' 才拿得到，
          一列一次的話光是開清單就要打十幾次請求、等上二十秒。
          清單要回答的問題只是「這件有沒有圖」，實際的圖在編輯頁看。
        -->
        <span class="plate" :class="{ pending: !p.img_main }" :title="p.img_main || '尚未上傳圖片'">
          <template v-if="!p.img_main">無圖片</template>
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
