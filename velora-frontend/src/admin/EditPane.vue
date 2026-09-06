<script setup>
/**
 * 編輯／新增商品。
 *
 * 三語欄位並排而不是分頁籤 —— 分頁籤會讓「缺哪一格」需要點三次才知道，
 * 而缺譯在前台會自動回退中文，你在前台反而看不出來。並排就一眼看到。
 *
 * 成本欄只在這裡出現，而且要按「顯示」才查，每一次都寫進操作紀錄。
 * 它不隨商品清單一起回傳：即使令牌外洩，也拿不到整批 FOB 價。
 */
import { computed, onMounted, ref, watch } from 'vue'

import * as api from './api.js'
import * as img from './image.js'
import { publicUrl } from './imgurl.js'
import * as session from './session.js'

const props = defineProps({
  product: { type: Object, default: null },
  categories: { type: Array, required: true },
  houses: { type: Array, required: true },
  imgIndex: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['back', 'saved', 'error'])

const creating = computed(() => !props.product)

const TEXT_FIELDS = [
  { key: 'name', label: '品名', rows: 1 },
  { key: 'tagline', label: '標語', rows: 1 },
  { key: 'material', label: '材質', rows: 2 },
  { key: 'spec', label: '規格', rows: 1 },
]
const NOTE_FIELDS = [
  { key: 'notes_top', label: '前調' },
  { key: 'notes_mid', label: '中調' },
  { key: 'notes_base', label: '後調' },
]
const LANGS = [
  { k: 'zh', label: '中文' },
  { k: 'en', label: 'ENGLISH' },
  { k: 'ko', label: '한국어' },
]

const truthy = (v) => v === true || String(v).toUpperCase() === 'TRUE'

function blank() {
  const o = {
    id: '', ref: '', category: props.categories[0]?.key || '', house: '',
    hs: '', origin: 'KR', price: '', price_public: false,
    listed: true, featured: false, order: 0,
    img_main: '', img_2: '', img_3: '',
  }
  for (const f of [...TEXT_FIELDS, { key: 'desc' }, ...NOTE_FIELDS]) {
    for (const l of LANGS) o[`${f.key}_${l.k}`] = ''
  }
  return o
}

const form = ref(blank())
watch(
  () => props.product,
  (p) => {
    const base = blank()
    if (p) for (const k in base) if (k in p) base[k] = p[k]
    if (p) {
      base.price_public = truthy(p.price_public)
      base.listed = truthy(p.listed)
      base.featured = truthy(p.featured)
    }
    form.value = base
  },
  { immediate: true }
)

const isFragrance = computed(() => form.value.category === 'fragrance')

/* ── 成本 ─────────────────────────────────────────────────────── */

const costShown = ref(false)
const costData = ref(null)
const costBusy = ref(false)
async function showCost() {
  if (!(await session.keepAlive())) { emit('error', '登入已失效，請重新登入。'); return }
  costBusy.value = true
  try {
    costData.value = await api.cost(session.token.value, form.value.id)
    costShown.value = true
  } catch (e) {
    emit('error', e.message + (e.detail ? '　' + e.detail : ''))
  } finally {
    costBusy.value = false
  }
}

/* ── 圖片 ─────────────────────────────────────────────────────── */

const SLOTS = [
  { field: 'img_main', label: '主圖' },
  { field: 'img_2', label: '副圖一' },
  { field: 'img_3', label: '副圖二' },
]
const preview = ref({})       // field → objectURL 或 data URI
const meta = ref({})          // field → 壓縮結果文字
const upBusy = ref('')
const hq = ref(false)

/**
 * 把已經存在 Sheet 裡的圖抓回來預覽。
 *
 * 只在編輯頁做，清單頁不做 —— 清單一次要十幾張，光是等就二十秒，
 * 而清單要回答的問題只是「有沒有圖」。這裡只有一件商品，值得等。
 *
 * 一張抓失敗不能擋住其他張，也不能擋住整個表單：圖片是附屬品，
 * 抓不到最多是預覽空著，文字欄位照樣要能編輯。
 */
async function loadImages() {
  for (const s of SLOTS) {
    const key = form.value[s.field]
    if (!key || preview.value[s.field]) continue

    /*
     * 先試前台那張烤好的圖。檔名內容定址，sha 在影像索引裡，所以算得出
     * 網址 —— 瀏覽器直接載、會快取，比拉回四萬字元的 base64 快得多。
     *
     * 用 fetch + HEAD 之外的方式驗它在不在：直接設成預覽，
     * <img> 載不到時的 onerror 會把它清掉並改走 API。
     * 這樣不會為了「確認存在」多打一次網路。
     */
    const url = publicUrl(key, props.imgIndex[key])
    if (url) {
      preview.value = { ...preview.value, [s.field]: url }
      meta.value = { ...meta.value, [s.field]: key }
      continue
    }

    try {
      const r = await api.getImage(session.token.value, key)
      if (r.found) {
        preview.value = { ...preview.value, [s.field]: `data:${r.mime};base64,${r.data}` }
        meta.value = { ...meta.value, [s.field]: `${key}　${(r.bytes / 1000).toFixed(1)} KB` }
      } else {
        meta.value = { ...meta.value, [s.field]: `${key}（Sheet 裡找不到這張圖）` }
      }
    } catch (e) {
      meta.value = { ...meta.value, [s.field]: `${key}（讀取失敗：${e.message}）` }
    }
  }
}
onMounted(loadImages)

/**
 * 公開網址載不到 —— 剛上傳、還沒發布時，前台上本來就還沒有那個檔案。
 * 清掉預覽並改走 API 把位元組拉回來。
 */
async function onPreviewError(field) {
  const key = form.value[field]
  preview.value = { ...preview.value, [field]: '' }
  if (!key) return
  try {
    const r = await api.getImage(session.token.value, key)
    if (r.found) {
      preview.value = { ...preview.value, [field]: `data:${r.mime};base64,${r.data}` }
      meta.value = { ...meta.value, [field]: `${key}　${(r.bytes / 1000).toFixed(1)} KB` }
    } else {
      meta.value = { ...meta.value, [field]: `${key}（Sheet 裡找不到這張圖）` }
    }
  } catch (e) {
    meta.value = { ...meta.value, [field]: `${key}（讀取失敗：${e.message}）` }
  }
}

async function pickFile(field, ev) {
  const file = ev.target.files?.[0]
  ev.target.value = ''
  if (!file) return
  if (!(await session.keepAlive())) { emit('error', '登入已失效，請重新登入。'); return }
  if (!form.value.id) { emit('error', '先填好商品編號再上傳圖片 —— 影像鍵是用它組的。'); return }

  upBusy.value = field
  meta.value = { ...meta.value, [field]: '壓縮中…' }
  try {
    const target = hq.value ? img.TARGET_BYTES_HQ : img.TARGET_BYTES
    const r = await img.compress(file, {
      target,
      onProgress: (p) => {
        meta.value = { ...meta.value, [field]: `試 ${p.width}px q${p.quality.toFixed(2)} → ${(p.bytes / 1000).toFixed(1)} KB` }
      },
    })
    const b64 = await img.toBase64(r.blob)
    const key = `${form.value.id}-${field.replace('img_', '')}`
    await api.putImage(session.token.value, {
      key,
      mime: r.type,
      alpha: await img.hasAlpha(r.blob),
      sha256: await img.sha256(r.blob),
      bytes: r.blob.size,
      chunks: img.chunk(b64),
    })
    form.value[field] = key
    preview.value = { ...preview.value, [field]: URL.createObjectURL(r.blob) }
    meta.value = { ...meta.value, [field]: img.describe(r) }
  } catch (e) {
    meta.value = { ...meta.value, [field]: '' }
    emit('error', e.message)
  } finally {
    upBusy.value = ''
  }
}

/* ── 儲存 ─────────────────────────────────────────────────────── */

const saving = ref(false)
const fieldErrs = ref([])

async function save() {
  fieldErrs.value = []
  if (!(await session.keepAlive())) { emit('error', '登入已失效，請重新登入。'); return }
  saving.value = true
  try {
    const r = await api.save(session.token.value, { ...form.value })
    emit('saved', (r.created ? '已新增 ' : '已儲存 ') + form.value.name_zh +
      '。要讓網站更新，回清單按「發布」。')
  } catch (e) {
    if (e.code === 'invalid' && Array.isArray(e.detail)) fieldErrs.value = e.detail
    else emit('error', e.message + (e.detail ? '　' + JSON.stringify(e.detail) : ''))
  } finally {
    saving.value = false
  }
}

const removing = ref(false)
async function remove() {
  if (!confirm(`確定要刪除「${form.value.name_zh}」？\n\n這是軟刪除：資料還在 Sheet 上，商品編號永遠不會被重複使用，但前台會看不到它。`)) return
  if (!(await session.keepAlive())) { emit('error', '登入已失效，請重新登入。'); return }
  removing.value = true
  try {
    await api.remove(session.token.value, form.value.id)
    emit('saved', `已刪除 ${form.value.name_zh}。發布後前台才會消失。`)
  } catch (e) {
    emit('error', e.message)
  } finally {
    removing.value = false
  }
}
</script>

<template>
  <div>
    <button class="link quiet" style="display: flex; align-items: center; gap: 8px" @click="emit('back')">
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3">
        <path d="m12 5-5 5 5 5" />
      </svg>
      商品清單
    </button>

    <header class="head" style="padding: 14px 0 26px; align-items: flex-end">
      <div>
        <h1>{{ form.name_zh || (creating ? '新增商品' : '（未命名）') }}</h1>
        <p class="sub" style="display: flex; align-items: center; gap: 16px">
          <span class="cell mono">{{ form.ref || '尚未填索引碼' }}</span>
        </p>
      </div>
      <div style="display: flex; align-items: center; gap: 24px">
        <button v-if="!creating" class="link quiet" :disabled="removing" @click="remove">
          {{ removing ? '刪除中…' : '刪除這件商品' }}
        </button>
        <button class="go" :disabled="saving" @click="save">{{ saving ? '儲存中…' : '儲存' }}</button>
      </div>
    </header>

    <div v-if="fieldErrs.length" class="warn" style="margin-bottom: 26px">
      <b style="color: var(--gold-deep)">沒有儲存，以下欄位要修：</b>
      <ul style="margin: 8px 0 0; padding-left: 18px">
        <li v-for="(e, i) in fieldErrs" :key="i">{{ e }}</li>
      </ul>
    </div>

    <div class="cols">
      <!-- 左欄 -->
      <div class="colL">
        <div class="sec"><b>基本</b><hr /></div>
        <div class="tri" style="padding-bottom: 24px">
          <div>
            <label>商品編號</label>
            <input v-if="creating" v-model="form.id" type="text" placeholder="frg-ylang" />
            <div v-else class="ro">
              <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="4" y="9" width="12" height="8" /><path d="M7 9V6a3 3 0 0 1 6 0v3" />
              </svg>
              {{ form.id }}
            </div>
            <p class="hint">{{ creating ? '小寫英數與連字號，3–40 字。建立後不可更改。' : '建立後不可更改' }}</p>
          </div>
          <div>
            <label>索引碼</label>
            <input v-model="form.ref" type="text" placeholder="VL · FRG · 001" />
          </div>
          <div>
            <label>品類</label>
            <select v-model="form.category">
              <option v-for="c in categories" :key="c.key" :value="c.key">{{ c.name_zh }}</option>
            </select>
          </div>
        </div>
        <div class="tri" style="padding-bottom: 24px">
          <div>
            <label>品牌（選填）</label>
            <select v-model="form.house">
              <!-- 品牌是選填的：有些商品不掛品牌，前台就不顯示品牌那一欄 -->
              <option value="">（不掛品牌）</option>
              <option v-for="h in houses" :key="h.key" :value="h.key">{{ h.name }}</option>
            </select>
          </div>
          <div>
            <!-- 報關用的商品分類號。不填不影響網站，前台也不顯示 -->
            <label title="海關的商品分類號碼，報關與計稅用。不填不影響網站。">HS 碼（報關用，選填）</label>
            <input v-model="form.hs" type="text" placeholder="3307.49.0000" />
          </div>
          <div><label>產地</label><input v-model="form.origin" type="text" placeholder="KR" /></div>
        </div>

        <div class="sec" style="padding-top: 16px">
          <b>文字內容　三語都要填，缺的語言前台會自動回退中文</b><hr />
        </div>

        <div v-for="f in TEXT_FIELDS" :key="f.key" class="fld">
          <label>{{ f.label }}</label>
          <div class="tri">
            <div v-for="l in LANGS" :key="l.k" :class="{ ko: l.k === 'ko' }">
              <label>{{ l.label }}</label>
              <textarea v-model="form[`${f.key}_${l.k}`]" :rows="f.rows" />
            </div>
          </div>
        </div>

        <div class="fld stack">
          <label>描述</label>
          <div v-for="l in LANGS" :key="l.k" :class="{ ko: l.k === 'ko' }">
            <label>{{ l.label }}</label>
            <textarea v-model="form[`desc_${l.k}`]" rows="4" />
          </div>
        </div>

        <template v-if="isFragrance">
          <div class="sec" style="padding-top: 10px"><b>香調　僅香氛品類　以分號分隔</b><hr /></div>
          <div v-for="f in NOTE_FIELDS" :key="f.key" class="fld">
            <label>{{ f.label }}</label>
            <div class="tri">
              <div v-for="l in LANGS" :key="l.k" :class="{ ko: l.k === 'ko' }">
                <label>{{ l.label }}</label>
                <input v-model="form[`${f.key}_${l.k}`]" type="text" placeholder="水蜜桃;綠意;葡萄柚" />
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 右欄 -->
      <div class="colR">
        <div class="sec"><b>圖片</b><hr /></div>

        <label class="big" style="display: block; cursor: pointer">
          <img
            v-if="preview[SLOTS[0].field]"
            :src="preview[SLOTS[0].field]"
            alt=""
            @error="onPreviewError(SLOTS[0].field)"
          />
          <span
            v-else
            style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--ink-faint)"
          >{{ form.img_main ? '已有主圖（換一張請點這裡）' : '點這裡選主圖' }}</span>
          <input type="file" accept="image/*" hidden @change="(e) => pickFile('img_main', e)" />
        </label>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0 4px">
          <span class="cell mono">{{ meta.img_main || (form.img_main ? form.img_main : '尚未上傳') }}</span>
        </div>

        <div class="subimgs" style="padding-top: 12px">
          <label v-for="s in SLOTS.slice(1)" :key="s.field" class="add" style="cursor: pointer">
            <template v-if="preview[s.field]">
              <img
                :src="preview[s.field]"
                alt=""
                style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover"
                @error="onPreviewError(s.field)"
              />
            </template>
            <template v-else>
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4">
                <path d="M10 4v12M4 10h12" />
              </svg>
              {{ form[s.field] ? s.label + '（已有）' : '加入' + s.label }}
            </template>
            <input type="file" accept="image/*" hidden @change="(e) => pickFile(s.field, e)" />
          </label>
        </div>

        <p class="hint" style="padding-top: 12px">
          上傳後在瀏覽器裡壓成 {{ hq ? 100 : 34 }} KB 以內的 WebP，原圖不會離開你的電腦。EXIF（含 GPS）會一併移除。
        </p>
        <div class="sw" style="padding-top: 6px">
          <span style="font-size: 12px; color: var(--ink-faint)">高畫質（放寬到 100 KB）</span>
          <button type="button" :class="{ on: hq }" @click="hq = !hq" />
        </div>

        <div class="sec" style="padding-top: 34px"><b>上架設定</b><hr /></div>
        <div class="sw"><span>顯示在前台</span><button type="button" :class="{ on: form.listed }" @click="form.listed = !form.listed" /></div>
        <div class="sw"><span>首頁精選</span><button type="button" :class="{ on: form.featured }" @click="form.featured = !form.featured" /></div>
        <p class="hint" style="padding-bottom: 12px">精選會出現在兩個前台的首頁區塊。</p>
        <div class="sw"><span>排序</span><input v-model="form.order" type="text" style="width: 70px; text-align: right" /></div>

        <div class="sec" style="padding-top: 34px"><b>價格</b><hr /></div>
        <div class="sw"><span>售價</span><input v-model="form.price" type="text" style="width: 120px; text-align: right" placeholder="1280" /></div>
        <div class="sw" style="padding-top: 12px">
          <span>在前台顯示價格</span>
          <button type="button" :class="{ on: form.price_public }" @click="form.price_public = !form.price_public" />
        </div>
        <p class="hint">關掉時，價格不會被寫進前台檔案 —— 不是藏起來，是根本不輸出。</p>

        <div class="sec" style="padding-top: 34px"><b>成本（FOB）</b><hr /></div>
        <div class="sw">
          <span>出口單價</span>
          <span style="display: flex; align-items: center; gap: 14px">
            <span class="cell mono">
              {{ costShown ? (costData?.found ? `${costData.cost} ${costData.ccy || ''}` : '沒有這件的成本資料') : '••••••' }}
            </span>
            <button v-if="!costShown" class="ghost" :disabled="costBusy || creating" @click="showCost">
              {{ costBusy ? '查詢中…' : '顯示' }}
            </button>
          </span>
        </div>
        <p v-if="costShown && costData?.found && costData.note" class="hint">{{ costData.note }}</p>
        <div class="warn" style="margin-top: 14px">
          成本存在另一張分頁，前台的建置流程讀不到它。按「顯示」會寫進操作紀錄。
        </div>
      </div>
    </div>
  </div>
</template>
