# design/ — 維羅拉設計交付

韓系低調奢華（Korean Quiet Luxury）· 雕版目錄 (Engraved Catalogue)

---

## 交付物

| 檔案 | 說明 |
|---|---|
| **`velora_design.ep`** | Evolus Pencil 3 設計檔，4 頁 510 個元件，內嵌實拍照 |
| `exports/` | 頁面預覽圖（PNG，1440 寬） |
| `spec/00-design-system.md` | 色票 · 字體 · 幾何 · 裝飾語彙 · 元件狀態 · 無障礙 |
| `spec/01-client-showcase.md` | 展示頁逐區塊版面結構與排版規格 |
| `spec/02-admin-dashboard.md` | 後台逐區塊規格 + 機密欄位處置 |
| `tokens.json` | 設計 token（與 `velora-frontend/src/style.css` 保持一致） |
| `sample/` | **原始素材，只讀不改** |
| `mockup/style-preview.html` | 風格提案頁（定案用，非最終實作） |

`.ep` 用本機 `C:\Program Files\Pencil\Pencil.exe` 開啟：

```powershell
& "C:\Program Files\Pencil\Pencil.exe" "d:\Git\VeloraProject\design\velora_design.ep"
```

---

## 素材管線

原始素材 → 擷取 → 影像處理 → 前端圖庫，四步都可重跑，
`design/sample/` 內的原始檔永不被覆寫。

```
sample/Brochure/(2026) VUCA_Product Brochure_EN.pdf
        │
        ├─ python design/extract-pdf.py      零安裝，直接掃 PDF 影像串流
        ↓
sample/extracted/                            13 檔（含 3 組去背遮罩）

sample/Jewelry accessories/絲巾與飾品.xlsx
        │
        ├─ python design/extract-xlsx.py     .xlsx 是 ZIP，圖在 xl/media/
        ↓                                    並由 xl/drawings/ 對回儲存格
sample/xlsx_media/                           41 檔，檔名保留「第幾列商品」

        │
        ├─ python design/build-assets.py     去背合成 · 統一影調 · 壓縮
        ↓
velora-frontend/public/media/                106 檔
velora-frontend/src/data/media-manifest.js   SKU → 圖片對照（勿手改）

        │
        ├─ python design/build-ep.py         產生 Pencil 設計檔
        ↓
design/velora_design.ep
```

### 各步驟做了什麼

**`extract-pdf.py`** — 零第三方套件。掃描 PDF 的 `/Subtype /Image` 物件，
`DCTDecode` 直接落 `.jpg`，`FlateDecode` 自行組 PNG（純 Python 寫 IHDR/IDAT/IEND），
並辨識 `/SMask` 去背遮罩配對。

**`extract-xlsx.py`** — 零第三方套件。`.xlsx` 是 ZIP：圖在 `xl/media/`，
錨點在 `xl/drawings/drawingN.xml`，關聯在 `_rels/`。因此每張圖都能對回
它所屬的儲存格與該列商品資料 —— 這比圖片本身更有價值。

**`build-assets.py`**（需 Pillow）
1. **去背合成**：PDF 內商品照是「黑底 JPEG + 灰階遮罩」，合成回 RGBA PNG。
2. **透明偵測**：無實際透明像素的 RGBA 轉存 JPEG，讓 `.png` 副檔名真正代表
   「這是去背圖」，前端才能正確選裁切方式。
3. **統一影調**：香調意象圖降至 45% 飽和並壓暖調。`--raw` 可還原原色。
4. **壓縮**：長邊 ≤1600、JPEG q86 漸進式，另產 240px 方形縮圖。

**`build-ep.py`**（需 Pillow）+ `ep_shapes.py`
`.ep` 格式由 `Pencil\resources\app.asar` 反解而得：ZIP 容器，
根目錄放 `content.xml` 與每頁一支 `page_<id>.xml`。頁面內容是帶
Pencil 命名空間的 SVG group；**外觀由 `<p:metadata>` 決定** —— Pencil
從磁碟載入頁面時 `invalidatedAfterLoad` 為 falsy，會呼叫
`invalidatePageContent()` 依 `p:def` 重新產生視覺，所以只需寫對 metadata。
只使用保證存在的 `Evolus.Common` stencil，以 `ZIP_STORED` 打包。

---

## 預覽圖

```bash
node design/shoot.mjs           # 截風格提案頁
node design/shoot.mjs --app     # 截跑起來的 Vue 專案（需先 npm run dev）
```

Evolus Pencil 3 已無 CLI 匯出（已確認 `index.js` 無相關參數），
故預覽圖以 headless Edge/Chrome 對實際頁面截圖產生 ——
好處是預覽圖等於實際成品，不會走鐘。

---

## 已知限制

- **`.ep` 內的字體**：Italiana 與 DM Mono 未安裝於本機，Pencil 只能用系統字，
  故 `.ep` 內以 Noto Serif TC / Noto Sans TC 呈現。網頁端使用真正的字體。
  要讓 Pencil 也顯示，需先把字型裝進系統或使用者字型目錄。
- **LINE QR** 為版面用示意圖形，非可掃描碼。上線前置換
  `velora-frontend/src/components/LineQr.vue` 即可。
- **6 個 SKU 未附照片**（絲巾 No.10、絲巾扣 No.02/05、項鍊 No.04、戒指 No.04、
  手鍊 No.04），不進入目錄。補圖後重跑 `build-assets.py` 會自動納入。
- **公司聯絡資訊為佔位值**（統編 / 地址 / 電話 / LINE ID），
  請於 `velora-frontend/src/data/catalog.js` 的 `company` 更新。

---

## ⚠️ 機密

`sample/Jewelry accessories/絲巾與飾品.xlsx` 含 B2B 機密：
供應商事業登記號（欄 F）、業務姓名與手機（欄 G）、FOB 出口單價（欄 P/Q）。

這些欄位**未進入** `catalog.js`，也不會出現在任何前端頁面。
接後端時應存於受權限控管的資料表，由伺服器端驗證身分後才回傳。
