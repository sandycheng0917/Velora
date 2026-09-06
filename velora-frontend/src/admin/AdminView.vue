<script setup>
/**
 * 後台外殼：登入、側欄、分頁切換、發布。
 *
 * 資料只在這裡載入一次（op:list），下面的面板都吃同一份 —— 每個面板
 * 各自去打 API 的話，改完商品回到清單會看到舊資料，而那種不一致
 * 沒有錯誤訊息，只會讓人反覆重整。
 *
 * 後台維持中文，不做三語。內部工具的多語只增加維護面，
 * 而商品資料本身的三語是在編輯頁裡填的 —— 那是資料，不是介面。
 */
import { computed, onMounted, ref } from 'vue'

import * as api from './api.js'
import './admin.css'
import EditPane from './EditPane.vue'
import ListPane from './ListPane.vue'
import * as session from './session.js'

const PANES = [
  { key: 'list', label: '商品清單', icon: 'M3 5h14M3 10h14M3 15h9' },
  { key: 'new', label: '新增商品', icon: 'M10 4v12M4 10h12' },
  { key: 'cats', label: '品類與品牌', icon: 'M3 6l7-3 7 3-7 3zM3 11l7 3 7-3' },
  { key: 'audit', label: '操作紀錄', icon: 'M10 5v5l3 2M3 10a7 7 0 1 0 14 0 7 7 0 0 0-14 0' },
]

const ready = ref(false)
const pane = ref('list')
const editing = ref(null)

const pw = ref('')
const busy = ref(false)
const loginErr = ref('')

const products = ref([])
const categories = ref([])
const houses = ref([])
const lastPublish = ref('')
const buildState = ref('')

const toast = ref(null)
let toastTimer = null
function say(text, bad = false) {
  toast.value = { text, bad }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), bad ? 9000 : 4000)
}

const signedIn = computed(() => !!session.token.value)
const dirtyCount = computed(() => products.value.filter(isDirty).length)

/**
 * 「自上次發布後改過」的判準：updated 比 last_publish 新。
 * 兩邊都可能沒有值 —— 沒發布過就全部算改過，那是對的：確實都還沒上線。
 */
function isDirty(p) {
  if (!lastPublish.value) return true
  return String(p.updated || '') > String(lastPublish.value).slice(0, 10)
}

async function doLogin() {
  loginErr.value = ''
  busy.value = true
  try {
    const r = await api.login(pw.value)
    session.set(r.token, r.exp)
    pw.value = ''
    await load()
  } catch (e) {
    // 刻意不顯示「還剩幾次」或「鎖多久」—— 那兩個數字等於把鎖定規則
    // 告訴打的人，讓他能算出剛好不觸發鎖定的節奏
    loginErr.value = e.message
  } finally {
    busy.value = false
  }
}

async function load() {
  busy.value = true
  try {
    const r = await api.list(session.token.value)
    products.value = (r.products || []).filter((p) => !truthy(p.deleted))
    categories.value = r.categories || []
    houses.value = r.houses || []
    try {
      const s = await api.status(session.token.value)
      lastPublish.value = s.last_publish || ''
      buildState.value = s.state || ''
    } catch {
      // GitHub 沒設定不該擋住整個後台 —— 商品照樣能編，只是不知道發布狀態
      buildState.value = 'unknown'
    }
    ready.value = true
  } catch (e) {
    if (e.code === 'auth') {
      session.clear()
      say('登入已失效，請重新登入。', true)
    } else {
      say(e.message + (e.detail ? '　' + JSON.stringify(e.detail) : ''), true)
    }
  } finally {
    busy.value = false
  }
}

const truthy = (v) => v === true || String(v).toUpperCase() === 'TRUE'

function openNew() {
  editing.value = null
  pane.value = 'new'
}
function openEdit(p) {
  editing.value = p
  pane.value = 'edit'
}
async function afterSave(msg) {
  say(msg)
  pane.value = 'list'
  editing.value = null
  await load()
}

const publishing = ref(false)
async function doPublish() {
  if (!(await session.keepAlive())) { say('登入已失效，請重新登入。', true); return }
  publishing.value = true
  try {
    await api.publish(session.token.value)
    buildState.value = 'queued'
    say('已送出發布。網站約 3 分鐘後更新，這段時間可以繼續編輯。')
    poll()
  } catch (e) {
    say(e.message + (e.detail ? '　' + e.detail : ''), true)
  } finally {
    publishing.value = false
  }
}

let pollTimer = null
function poll() {
  clearTimeout(pollTimer)
  pollTimer = setTimeout(async () => {
    try {
      const s = await api.status(session.token.value)
      buildState.value = s.state
      lastPublish.value = s.last_publish || lastPublish.value
      if (s.state === 'queued' || s.state === 'in_progress') poll()
      else if (s.state === 'success') say('網站已更新。')
      else if (s.state === 'failure') say('建置失敗。到 GitHub 的 Actions 頁看是哪一關擋下來的。', true)
    } catch { /* 查不到就不再追，不要因為查狀態把畫面弄壞 */ }
  }, 15000)
}

const STATE_TEXT = {
  queued: '排隊中', in_progress: '發布中', success: '已上線',
  failure: '發布失敗', cancelled: '已取消', superseded: '已被新的取代',
  none: '尚未發布過', unknown: '未設定 GitHub',
}

function signOut() {
  session.clear()
  products.value = []
  ready.value = false
}

onMounted(async () => {
  document.title = '商品管理 | 維羅拉'
  if (session.restore()) await load()
})
</script>

<template>
  <!-- 登入 -->
  <div v-if="!signedIn" class="vadmin login">
    <form class="box" @submit.prevent="doLogin">
      <div class="wm"><b>VELORA</b><span>商品管理</span></div>
      <hr />
      <label for="pw">密碼</label>
      <input id="pw" v-model="pw" type="password" autocomplete="current-password" autofocus />
      <button class="submit" type="submit" :disabled="busy || !pw">
        {{ busy ? '驗證中…' : '登入' }}
      </button>
      <p v-if="loginErr" class="err">{{ loginErr }}</p>
    </form>
  </div>

  <!-- 後台 -->
  <div v-else class="vadmin">
    <aside class="side">
      <div class="wm"><b>VELORA</b><span>商品管理</span></div>
      <nav class="nav">
        <button
          v-for="p in PANES"
          :key="p.key"
          :class="{ on: pane === p.key || (p.key === 'list' && pane === 'edit') }"
          @click="p.key === 'new' ? openNew() : (pane = p.key)"
        >
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3">
            <path :d="p.icon" />
          </svg>
          {{ p.label }}
        </button>
      </nav>
      <div class="fill" />
      <div class="foot">
        資料源　Google Sheet<br />
        最後發布　{{ lastPublish ? lastPublish.slice(0, 16).replace('T', ' ') : '—' }}<br />
        <button class="link quiet" style="font-family: inherit; font-size: 10.5px" @click="signOut">
          登出（票剩 {{ session.remaining() }}）
        </button>
      </div>
    </aside>

    <main class="main">
      <div v-if="pane === 'list'">
        <header class="head">
          <div>
            <h1>商品清單</h1>
            <p class="sub">
              共 {{ products.length }} 件商品<template v-if="dirtyCount">，其中 {{ dirtyCount }} 件自上次發布後有變動</template>。
            </p>
          </div>
          <div class="right">
            <p class="stamp">
              上次發布　{{ lastPublish ? lastPublish.slice(0, 16).replace('T', ' ') : '—' }}
              　·　{{ STATE_TEXT[buildState] || buildState || '—' }}
            </p>
            <button
              class="go"
              :disabled="publishing || buildState === 'queued' || buildState === 'in_progress'"
              @click="doPublish"
            >
              發布<i /><em>約 3 分鐘</em>
            </button>
          </div>
        </header>
        <ListPane
          :products="products"
          :categories="categories"
          :houses="houses"
          :is-dirty="isDirty"
          @open="openEdit"
        />
      </div>

      <EditPane
        v-else-if="pane === 'edit' || pane === 'new'"
        :key="editing ? editing.id : 'new'"
        :product="editing"
        :categories="categories"
        :houses="houses"
        @back="pane = 'list'"
        @saved="afterSave"
        @error="(m) => say(m, true)"
      />

      <div v-else-if="pane === 'cats'">
        <header class="head">
          <div>
            <h1>品類與品牌</h1>
            <p class="sub">品類決定前台的分區與索引碼前綴。要新增或改名請直接編輯 Google Sheet 的 categories 分頁。</p>
          </div>
        </header>
        <div style="padding-top: 30px">
          <div class="sec"><b>品類</b><hr /></div>
          <div class="row hd">
            <span>索引前綴</span><i /><span /><span>中文</span><span>件數</span><span class="hideNarrow" /><span class="hideNarrow" /><span class="hideNarrow" /><span />
          </div>
          <div v-for="c in categories" :key="c.key" class="row" style="cursor: default">
            <span class="n">{{ c.ref }}</span>
            <span class="rule" />
            <span />
            <span class="nm">
              <b>{{ c.name_zh }}</b>
              <span class="alt">
                <span class="en">{{ c.name_en }}</span><i /><span>{{ c.name_ko }}</span>
              </span>
            </span>
            <span class="cell mono">{{ products.filter((p) => p.category === c.key).length }} 件</span>
            <span class="hideNarrow" /><span class="hideNarrow" /><span class="hideNarrow" /><span />
          </div>
          <p class="hint" style="padding-top: 14px">
            沒有商品的品類前台不會顯示 —— 導覽列點進去是空的，比沒有那一項更糟。
          </p>
          <p class="hint">
            要暫停一個代理品牌：到 Google Sheet 的 <b>houses</b> 分頁，
            把那一列的 <b>listed</b> 取消勾選，然後回這裡按發布。
            該品牌的所有商品、品類分區與品牌介紹都會從前台消失，資料完全保留。
          </p>

          <div class="sec" style="padding-top: 42px"><b>品牌</b><hr /></div>
          <div style="display: flex; gap: 36px; align-items: flex-start">
            <div
              v-for="h in houses"
              :key="h.key"
              style="flex: 1; padding-left: 18px"
              :style="{ borderLeft: '1px solid ' + (truthy(h.listed) ? 'var(--gold)' : 'var(--line-strong)') }"
            >
              <p style="display: flex; align-items: center; gap: 12px; margin: 0">
                <span style="font-family: var(--f-disp); font-size: 21px; letter-spacing: 0.19em">{{ h.name }}</span>
                <span class="st" :class="truthy(h.listed) ? 'live' : 'off'"><i />{{ truthy(h.listed) ? '代理中' : '已暫停' }}</span>
              </p>
              <p class="hint" style="padding-top: 8px">
                {{ h.name_ko }}　·　{{ h.country_zh }}　{{ h.tagline }}
              </p>
              <p class="hint" :style="{ color: h.intro_zh ? 'var(--ink-soft)' : 'var(--gold-deep)' }">
                {{ h.intro_zh || '簡介尚未填寫' }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="pane === 'audit'">
        <header class="head">
          <div>
            <h1>操作紀錄</h1>
            <p class="sub">
              紀錄寫在 Google Sheet 的 audit 分頁，這裡不重複做一份。
              查看成本、發布、登入失敗都會留下紀錄。
            </p>
          </div>
        </header>
        <p class="hint" style="padding-top: 30px">
          直接開試算表的 <b>audit</b> 分頁看最完整 —— 它可以排序、篩選、匯出，
          而在這裡再做一次那些功能只是把 Google Sheets 重寫一遍。
        </p>
      </div>
    </main>

    <div v-if="toast" class="toast" :class="{ bad: toast.bad }">{{ toast.text }}</div>
  </div>
</template>
