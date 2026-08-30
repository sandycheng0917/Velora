<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { company, findCategory, houses, isCutout } from '@/data/catalog.js'
import { pick, t } from '@/i18n.js'

const props = defineProps({ product: { type: Object, default: null } })
const emit = defineEmits(['close', 'line'])

const shot = ref(0)
watch(() => props.product, () => (shot.value = 0))

const cat = computed(() => findCategory(props.product?.category))
const house = computed(() => houses[props.product?.house])
const cutout = computed(() => isCutout(props.product?.gallery?.[shot.value]))

function onKey(e) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
watch(
  () => props.product,
  (p) => (document.body.style.overflow = p ? 'hidden' : ''),
)
</script>

<template>
  <Transition name="fade">
    <div v-if="product" class="scrim" @click.self="emit('close')">
      <article class="modal" role="dialog" aria-modal="true" :aria-label="pick(product.name)">
        <div class="pane plate" :class="{ 'is-cutout': cutout }">
          <img :src="product.gallery[shot]" :alt="pick(product.name)" />
        </div>

        <div class="body">
          <button class="close" :aria-label="t('close')" @click="emit('close')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          <div class="top">
            <span class="pill">{{ cat?.name.en }}</span>
            <span class="ref">{{ product.ref }}</span>
          </div>

          <h3 class="disp">{{ product.name.en }}</h3>
          <p class="zh">{{ pick(product.name) }}</p>
          <p v-if="product.tagline" class="tag">{{ pick(product.tagline) }}</p>
          <p class="desc">{{ pick(product.desc) }}</p>

          <dl v-if="product.notes" class="notes">
            <div><dt>{{ t('noteTop') }}</dt><dd>{{ pick(product.notes.top).join('・') }}</dd></div>
            <div><dt>{{ t('noteMiddle') }}</dt><dd>{{ pick(product.notes.middle).join('・') }}</dd></div>
            <div><dt>{{ t('noteBase') }}</dt><dd>{{ pick(product.notes.base).join('・') }}</dd></div>
          </dl>

          <dl class="facts">
            <div><dt>{{ t('brand') }}</dt><dd>{{ house?.name }}</dd></div>
            <div><dt>{{ t('material') }}</dt><dd>{{ pick(product.material) }}</dd></div>
            <div><dt>{{ t('spec') }}</dt><dd>{{ pick(product.spec) }}</dd></div>
            <div><dt>{{ t('origin') }}</dt><dd>{{ pick(product.origin) }}</dd></div>
          </dl>

          <div v-if="product.gallery.length > 1" class="thumbs">
            <button
              v-for="(g, i) in product.gallery"
              :key="g"
              class="plate bare"
              :class="{ on: i === shot }"
              :aria-label="t('viewShot', i + 1)"
              @click="shot = i"
            >
              <img :src="g" alt="" />
            </button>
          </div>

          <button class="link-gold ask" @click="emit('line')">
            {{ t('askAboutThis') }}　{{ company.lineId }} →
          </button>
        </div>
      </article>
    </div>
  </Transition>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(30, 30, 30, 0.28);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(16px, 4vw, 48px);
  overflow: auto;
}

.modal {
  position: relative;
  display: flex;
  width: min(880px, 100%);
  max-height: 100%;
  background: var(--bg);
  border-radius: var(--r-md);
  box-shadow: var(--sh-raised);
  overflow: hidden;
}
.modal::after {
  content: '';
  position: absolute;
  inset: 7px;
  border: 1px solid rgba(197, 168, 128, 0.42);
  border-radius: 3px;
  pointer-events: none;
  z-index: 6;
}

.pane {
  width: 400px;
  flex: none;
  align-self: stretch;
  min-height: 480px;
}

.body {
  flex: 1;
  padding: 44px 42px;
  overflow: auto;
}
.close {
  position: absolute;
  right: 22px;
  top: 22px;
  z-index: 7;
  color: var(--ink-soft);
  display: flex;
}

.top {
  display: flex;
  align-items: center;
  gap: 16px;
}
h3 {
  margin-top: 20px;
  font-size: clamp(24px, 3vw, 31px);
  line-height: 1.25;
  letter-spacing: 0.07em;
}
.zh {
  margin-top: 8px;
  font-size: 14px;
  letter-spacing: 0.12em;
  color: var(--ink-soft);
}
.tag {
  margin-top: 14px;
  font-size: 13px;
  letter-spacing: 0.1em;
  color: var(--gold-deep);
}
.desc {
  margin-top: 20px;
  font-size: 14px;
  line-height: 1.9;
  color: var(--ink-soft);
}

.notes {
  margin-top: 24px;
  padding: 18px 20px;
  background: var(--bg-alt);
  border-radius: var(--r-sm);
}
.notes div {
  display: flex;
  gap: 16px;
}
.notes div + div {
  margin-top: 9px;
}
.notes dt {
  width: 40px;
  flex: none;
  font-size: 11px;
  letter-spacing: 0.16em;
  color: var(--gold-deep);
  padding-top: 2px;
}
.notes dd {
  font-size: 13px;
  color: var(--ink-soft);
  letter-spacing: 0.06em;
}

.facts {
  margin-top: 24px;
  border-top: 1px solid var(--line);
}
.facts div {
  display: flex;
  padding: 11px 0;
  border-bottom: 1px solid var(--line-soft);
}
.facts dt {
  width: 72px;
  flex: none;
  font-size: 11px;
  letter-spacing: 0.16em;
  color: var(--ink-faint);
  padding-top: 2px;
}
.facts dd {
  font-size: 13px;
  color: var(--ink-soft);
  letter-spacing: 0.06em;
}

.thumbs {
  display: flex;
  gap: 10px;
  margin-top: 24px;
}
.thumbs .plate {
  width: 62px;
  height: 62px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 0;
  overflow: hidden;
  transition: border-color 0.3s ease;
}
.thumbs .plate.on {
  border-color: var(--gold);
}

.ask {
  margin-top: 26px;
}

@media (max-width: 780px) {
  .modal {
    flex-direction: column;
    max-height: none;
  }
  .pane {
    width: 100%;
    min-height: 300px;
    height: 300px;
  }
  .body {
    padding: 32px 24px;
  }
}
</style>
