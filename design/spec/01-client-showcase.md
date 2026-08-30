# 客戶端展示頁 — 版面結構與元件排版規格

畫布 **1440px**。座標為 1440 設計稿的絕對座標；實作為響應式，
留白 `--gutter: clamp(20px, 8.33vw, 120px)`，以下數值為 1440 時的值。

實作：[`velora-frontend/src/views/ShowcaseView.vue`](../../velora-frontend/src/views/ShowcaseView.vue)
設計檔：[`design/velora_design.ep`](../velora_design.ep) 第 1 頁
預覽圖：`design/exports/app-01-hero.png` ～ `app-05-philosophy-footer.png`

**純瀏覽展示 —— 全頁無價格、無購物車、無下單元件。唯一轉換是 LINE。**

---

## 全域

| 元素 | 規格 |
|---|---|
| 目錄書脊 | `x=64`，1px 金箔垂直漸層，上下各以 `mask-image` 淡出（頂 90px / 底 160px） |
| 書脊刻度 | 每區塊左緣 `x=60`：11px 短線 + 5px 菱形飾釘 + 直排 10px mono 代碼，字距 `.30em` |
| 懸浮 LINE 鈕 | `position:fixed`，右下 40px，56px 圓形，金箔描邊 + `outline-offset:4px`，`shadow-ambient`；hover 上浮 2px |

---

## ① 懸浮導覽列 — `y 0`，高 80

- 底：`rgba(253,251,247,.88)` + `backdrop-filter: saturate(140%) blur(14px)`
- 底線：1px 金箔漸層，`opacity .55`
- 捲動後追加 `shadow-ambient`
- 左 `x=120`：`VELORA` Italiana 25px 字距 `.24em`；下方「維 羅 拉」11px 字距 `.42em` `--ink-soft`
- 中 `x=344` 起：`ALL / FRAGRANCE / SCARF / JEWELRY / ACCESSORY / STORY`
  12px 字距 `.16em`，間距 38px；作用中為 `--ink` + 1px 金箔底線
- 右：搜尋 icon 17px｜1×12 分隔線｜語言切換「繁 / EN」11px mono｜
  32px 圓形金箔框內的 LINE icon
- < 860px：選單收合為漢堡；< 520px 隱藏搜尋與分隔線

## ② 品牌主視覺 — `y 80`，高 720（雜誌跨頁，非滿版橫幅）

左 58.3%（840px）為米白與字，右 41.7%（600px）為整根影像直欄，
中間一道 1px `#C5A880` 縫。

**左欄**（`x 120`，垂直置中）
| y | 內容 |
|---|---|
| 260 | eyebrow「2026 AUTUMN — KOREAN SELECTION」11px mono 字距 `.26em` `--gold-deep` |
| 300–630 | H1 Italiana 76px／行高 1.14／字距 `.08em`，四行：`Refined` `Elegance,` `Everyday` `Luxury.`；後兩行縮排 56px 形成詩節結構 |
| 660 | 副標 17px／行高 1.9 `--ink-soft`，寬 430 |
| 720 | CTA `216×52` radius 4，金箔描邊，字「探索系列　Explore」12px 字距 `.20em` `--gold-deep`；**hover 灌入金漸層、字轉 `#FFFCF6`** |
| 738 | 次要連結「或直接用 LINE 問我們 →」12px + 1px `--line-strong` 底線 |
| — | 字徽 `V` Italiana 380px 透明度 6%，`right:8px; top:96px`，`z-index:0` |

**右欄影像**
- 4 張輪播，`opacity` 淡入 1.1s，每 6 秒自動換頁
- 雙層金框（inset 17 + outline offset 5）
- 疊字遮光：上緣 130px、下緣 140px 的 `rgba(20,16,10,.30～.34)` 漸層 —— 沒有這層，疊字遇亮部就讀不到
- 右上 `x 1300, y 122`：「01 / 04」11px mono `rgba(255,253,248,.82)`
- 左下 `x 876, y 760`：4 條 26×1 指示線，作用中 `#FFFDF8`
- 左下 `y 766`：影像索引說明 10px mono `rgba(255,253,248,.80)`

**輪播內容**：VUCA 黑白編輯照 → SAINTMARI 駝色西裝絲巾 → VUCA 臥室情境 → SAINTMARI 藕紫絲巾

## ③ 四大品類 — `y 800`，高 980（韓系不對稱格狀）

區段標題（左對齊，貼合書脊）：
- `y 930`：「TWO KOREAN HOUSES · FOUR LINES」11px mono `--gold-deep`
- `y 958`：「四大品類」Noto Serif TC 42px + `Curated` Italiana 38px `--gold-deep`（左距 18px）
- `y 1026`：金箔飾線 76×7 含中央菱形飾釘

**卡片座標**（`x` 自 120 起算）

| 卡片 | x | y | w | h |
|---|---|---|---|---|
| FRAGRANCE 居家香氛（5） | 120 | 1080 | 456 | 620 |
| SCARF 真絲長巾（12） | 600 | 1080 | 336 | 356 |
| JEWELRY 純銀飾品（19） | 960 | 1220 | 360 | 500 |
| ACCESSORY 絲巾扣（4） | 600 | 1460 | 336 | 300 |

> B 欄刻意超出 A 欄底線 60px、C 欄整根下沉 140px —— 打破基準線是設計，不是誤差。

**卡片樣式**
- 底 `--bg`、1px `--line`、radius 6
- 常駐內框：`inset:7px` 1px `rgba(197,168,128,.26)` radius 3；hover 轉 `.55`
- 影像區佔上方，`meta` 區固定 104px 高，上緣 1px `--line`
- meta：英文品類 Italiana 23px 字距 `.20em` → 中文 13px 字距 `.14em` `--ink-soft`
  → 4px 菱形飾釘 + 「N SELECTED」10px mono `--gold-deep`
- hover：邊框轉 `--gold`、上浮 3px、底部 1px 金箔線由左展開 0.7s
- ≤1024px：改 2 欄網格，卡片統一 400px 高；≤720px 單欄

## ④ 精選展示 — `y 1800`，高 1120（底 `--bg-alt`）

- 標題同 ③ 結構，右側「看全部 37 件　View All →」12px `--gold-deep` + 金箔底線
- 3 張寬幅卡片，`x 120`，寬 1200，高 260，間距 32

**卡片內部**
- 左 480px 影像板（`align-self: stretch`，`min-height: 322px`）
- 右內容 pad 46/52：
  - 品牌標籤 pill `h 24`，金箔描邊 radius 4，10px mono `--gold-deep`
  - 索引碼 10px mono `--line-strong`（同一組編號不重複出現在影像上）
  - 品名 Italiana 31px 字距 `.07em` → 中文 14px `--ink-soft`
  - 描述 14px／行高 1.85 `--ink-soft`，最大寬 530
  - 規格列：10px mono，以 1×10 直線分隔（材質 · 產地 · 規格）
  - **「查看細節　View Details →」** 12px 字距 `.18em` `--gold-deep` + 金箔底線
- hover：邊框轉金、陰影升為 `shadow-raised`

**三件精選**（皆為實際看過實拍、能寫出具體描述的商品）
1. `VL · FRG · 001` Ylang Ylang 依蘭 — 影像用去背的擴香組（植物意象圖留給彈窗）
2. `VL · SLK · 001` Ivory Twilly Scarf 象牙真絲長巾
3. `VL · SCR · 001` Trio Pearl Scarf Ring 三色珍珠絲巾扣

## ⑤ 全品項藝廊 — `y 2960`

- 標題左側同 ③；右側品類 chips：`ALL / 居家香氛 / 真絲長巾 / 純銀飾品 / 絲巾扣`
  高 30，radius 4，作用中為金箔描邊
- 網格：`repeat(auto-fill, minmax(232px,1fr))`，間距 28（1440 時為 4 欄）
- 商品磚：radius 6，1px `--line`；影像 `aspect-ratio: 4/5`；
  meta pad 18/20/22，上緣 1px `--line`
  - 索引碼 10px mono `--line-strong`
  - 英文品名 Italiana 17px
  - 中文品名 12.5px `--ink-soft`
- hover：邊框轉金、上浮 2px
- 點擊開啟細節彈窗
- 由導覽列或 chips 選品類時，篩選並平滑捲動至此區

## ⑥ 查看細節彈窗

- 遮罩 `rgba(30,30,30,.28)` + `blur(2px)`
- 面板 `880 × 自適應`，radius 6，`shadow-raised`
- 內縮金框：`inset:7px` 1px `rgba(197,168,128,.42)` radius 3
- 左 400px 影像（可切換），右 pad 44/42：
  品牌 pill · 索引碼 · 品名 Italiana 31px · 中文 · tagline `--gold-deep` · 描述 14/1.9
- **香調金字塔**（僅香氛）：`--bg-alt` 底、radius 4、pad 18/20，
  前調／中調／後調三列，標籤 11px `--gold-deep`
- 規格定義列：材質 / 規格 / 產地 / 品牌，上緣 1px `--line`，各列下緣 1px `--line-soft`
- 縮圖列 62×62（多圖時），作用中邊框轉金
- 底部「用 LINE 詢問這件　Ask on @velora →」—— **這是彈窗唯一的行動點，不是加入購物車**
- Esc 關閉、點遮罩關閉、開啟時 `body` 鎖捲動
- ≤780px 改為上下堆疊，影像高 300px

## ⑦ 品牌理念 — 左右圖文交錯

- 兩列，第二列 `flex-direction: row-reverse` 並 `padding-top: 64px` 製造韓系節奏
- 影像 50% 寬、`aspect-ratio: 15/11`、radius 6
- 文字：`PHILOSOPHY — 小標` 11px mono `--gold-deep` → Italiana 37px 兩行 →
  金箔飾線 → 15px／行高 1.95 `--ink-soft`，最大寬 470
- 字徽 `V` 300px 透明度 6% 襯底
- 內容：`We select, so you don't have to.` / `Quiet things last longer.`
- ≤720px 上下堆疊

## ⑧ 頁尾

- 底 `--surface`，上緣 1px 金箔線，pad `88px / gutter`
- 四欄 `1fr 190 190 300`，間距 40
  1. `VELORA` Italiana 25px → 「維羅拉國際有限公司」14px → 英文名 11px mono →
     統編 / 地址 / 電話 / 信箱（標籤 11px `--line-strong`，寬 46）
  2. CATEGORIES：四條商品線
  3. INFORMATION：品牌故事 / 選件標準 / 隱私權政策 / 服務條款
  4. **LINE 官方帳號**：112px QR 置於金箔框 + `outline-offset:4px`；
     說明 13px；`@velora` 12px mono `--gold-deep`；
     「加入好友」1px `#06C755` 描邊鈕 `h 36`
- 底列：上緣 1px 金箔線，pad 26/34，左為版權宣告、右為「代理品牌 VUCA · SAINTMARI（韓國）」，
  皆 10px mono `--ink-soft`
- ≤1100px 四欄轉兩欄；≤640px 單欄

> LINE QR 目前為版面用的示意圖形（[`LineQr.vue`](../../velora-frontend/src/components/LineQr.vue)），
> **非可掃描碼**。上線前以 LINE 後台產生的正式 QR 置換該元件即可，尺寸與外框不需調整。
