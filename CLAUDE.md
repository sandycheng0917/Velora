# 維羅拉國際有限公司 — 專案說明

Velora International CO., LTD ——「韓國選品代理」形象網站與後台商品管理原型。
代理 VUCA（居家香氛）與 SAINTMARI（真絲長巾、純銀飾品）兩家韓國品牌。

## 專案結構

```
velora-frontend/     Vue 3 + Vite 前端（對外展示頁）
design/              設計交付：.ep 設計檔、規格書、素材管線
  sample/            原始素材（唯讀、不進版控，需另外取得）
  spec/              版面與設計系統規格書
  exports/           頁面預覽圖（不進版控，可重生）
check-public.mjs     公開前稽核：哪些會進 Git、哪些會上網站
```

目前沒有後端。商品資料是前端的靜態檔（`src/data/catalog.js`），
後台的改動只存在記憶體，重整就沒了 —— 這是原型階段的刻意選擇。

## 常用指令

```bash
cd velora-frontend && npm run dev     # 開發（5173），對外版本
cd velora-frontend && npm run build   # 建置，必須通過

python design/build-assets.py         # 重建圖庫（改了 sample/ 之後）
node design/shoot.mjs                 # 產生預覽圖（需先跑 dev）
```

## 開始動手前

**要改版面、色票、字體、文案或素材，先載入 `velora-design` skill**
（`.claude/skills/velora-design/`）—— 裡面有金色可讀性規則、
影像板的兩個必要 CSS 條件、文案原則與機密資料紅線，
這些踩錯了畫面會壞或會外洩商業機密。

## 硬性規則

1. **展示頁不出現價格、購物車或下單按鈕。** 唯一轉換是 LINE。
2. **`#C5A880` 不可用於文字**（對比僅 1.9:1）。金色文字一律 `#A8875C`。
3. **不使用 Tailwind。** 設計 token 寫在 `velora-frontend/src/style.css`。
4. **Excel 的 FOB 出口單價與供應商聯絡資訊不得進入前端。**
5. 圖片路徑一律取自 `src/data/media-manifest.js`，不要手寫檔名。

## 部署：什麼會上網站

`npm run build` 產出的 **`velora-frontend/dist/` 就是要上傳到伺服器的全部內容**，
其餘任何東西都不會上線。Vite 的規則只有兩條：

| 位置 | 行為 |
|---|---|
| `velora-frontend/public/` | **原樣複製**到 `dist/`，網址為 `/xxx`。放進去就等於公開，即使沒被用到 |
| `velora-frontend/src/` | **只有真的被 import 的檔案**會被打包，沒引用的會被丟掉 |
| `design/`、`.claude/` | 建置完全不會碰到 |

要確認有沒有東西誤上線，跑稽核工具：

```bash
node check-public.mjs              # 哪些進 Git、哪些上網站、有無機密
node check-public.mjs 自訂關鍵字     # 用自己想到的字搜
git ls-files                       # 會被推送的完整清單（只有這些）
```

### 部署

推到 `main` 由 `.github/workflows/deploy.yml` 自動建置並發布到 GitHub Pages。

前置設定（只需一次）：repo 設為 Public，
然後 Settings → Pages → Source 選 "GitHub Actions"。

網址為 `https://<帳號>.github.io/<repo>/`；
子路徑由 workflow 以 `VITE_BASE` 自動代入，不需手動改設定。

維護用的後台不在這個版控裡，只存在維護者本機（見 `.gitignore`）。
本機有那些檔案時跑 `npm run dev:admin` 才會掛上 `/admin`；
預設的 `npm run dev` 與 `npm run build` 都是對外版本。

## 三語

展示頁支援 **繁體中文 / English / 한국어**，切換器在導覽列右側，
首次進站依瀏覽器語言自動選擇，之後記在 `localStorage`。

- 介面字串：`src/i18n.js` 的 `UI` 表，用 `t('key')` 取用
- 商品資料：`{ zh, en, ko }` 形式的欄位，用 `pick(field)` 取用
- **後台維持中文**，不做三語 —— 內部工具的多語只增加維護面
