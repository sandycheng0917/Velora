/**
 * 維羅拉選品目錄（三語：繁體中文 / English / 한국어）
 *
 * 資料來源（原始檔在 design/sample/）：
 *   · VUCA 香氛          ← (2026) VUCA_Product Brochure_EN.pdf
 *   · SAINTMARI 絲巾飾品 ← 供應商商品表（41 個 SKU）
 *
 * 韓文欄位有兩個來源：品項名稱直接沿用 Excel 的原始韓文（실크 스카프、귀걸이…），
 * 香調前中後調則取自型錄英文再譯為韓文業界慣用寫法。
 *
 * 材質由 HS Code 推得，非臆測：
 *   6214.10.0000 → 真絲圍巾／披肩
 *   7113.11.0000 → 純銀首飾
 *   7118.90.9000 → 其他金屬製品（合金鍍層）
 *
 * ⚠️ 機密資料未進入本檔：Excel 的 FOB 出口單價（欄 P/Q）、供應商業務姓名與手機
 *    （欄 G）、事業登記號（欄 F）屬 B2B 機密，不得進入瀏覽器套件。
 *    價格資訊在商業模式確定前也不落地到前端；公開展示頁完全不顯示價格。
 */

// 圖片對照由 design/build-assets.py 產生，不在此猜檔名。
// Excel 中有 6 個 SKU 沒附照片，那些 SKU 不會進入目錄 —— 展示頁不放沒有圖的商品。
import manifest from './media-manifest.js'

/**
 * 圖片路徑一律經過這裡。
 *
 * 部署到子路徑時（GitHub Pages 是 https://<帳號>.github.io/<repo>/），
 * 寫死的 /media/... 會被瀏覽器解析成網域根目錄而 404 ——
 * Vite 只會改寫 index.html 裡的路徑，JS 字串它不碰。
 * import.meta.env.BASE_URL 由 vite.config 的 base 決定，開發時是 '/'。
 */
const BASE = import.meta.env.BASE_URL || '/'
const url = (p) => (p ? BASE.replace(/\/$/, '') + p : p)

export const company = {
  name: {
    zh: '維羅拉國際有限公司',
    en: 'Velora International CO., LTD',
    ko: '벨로라 인터내셔널',
  },
  nameEn: 'Velora International CO., LTD',
  wordmark: 'VELORA',
  wordmarkZh: '維羅拉',
  lineId: '@velora',
  lineUrl: 'https://lin.ee/uzoQ8dl',
  email: 'hello@velora.com.tw',
  // 統編、地址、電話待確認，確定前不對外顯示；補上後於頁尾加回即可。
}

/** 維羅拉代理的韓國品牌 */
export const houses = {
  vuca: {
    key: 'vuca',
    name: 'VUCA',
    country: { zh: '韓國', en: 'Korea', ko: '한국' },
    tagline: 'Always be with you.',
    intro: {
      zh: '首爾的居家香氛品牌，主張香氣是空間的一部分而非附加品。香精配方符合 IFRA 國際香精協會標準，基劑採用玉米萃取植物乙醇，並通過七項有害物質檢驗。',
      en: 'A Seoul home-fragrance house that treats scent as part of a room, not an accessory to it. Formulated to IFRA standards on a base of corn-derived plant ethanol, and tested for seven key harmful substances.',
      ko: '향을 공간의 일부로 다루는 서울의 홈 프래그런스 브랜드. IFRA 기준에 맞춘 향료와 옥수수 유래 식물성 에탄올 베이스, 7가지 유해물질 검사를 통과했습니다.',
    },
  },
  saintmari: {
    key: 'saintmari',
    name: 'SAINTMARI',
    nameKo: '세인트메리',
    country: { zh: '韓國', en: 'Korea', ko: '한국' },
    tagline: 'Quiet ornament for everyday.',
    intro: {
      zh: '韓國時尚配件品牌，做真絲長巾與純銀首飾。設計克制，靠比例與收邊說話 —— 是每天戴的東西，不是場合才拿出來的。',
      en: 'A Korean accessories label making silk scarves and sterling jewelry. The design is restrained and speaks through proportion and finish — things you wear daily, not only for occasions.',
      ko: '실크 스카프와 실버 주얼리를 만드는 한국 액세서리 브랜드. 절제된 디자인으로 비율과 마감이 말을 합니다 — 특별한 날이 아니라 매일 착용하는 물건입니다.',
    },
  },
}

/** 四大品類。加一條線只需在此加一筆，版面與後台會自動跟上。 */
export const categories = [
  {
    key: 'fragrance',
    code: 'FRAGRANCE',
    ref: 'FRG',
    name: { zh: '居家香氛', en: 'Home Fragrance', ko: '홈 프래그런스' },
    cover: url('/media/vuca/bedroom.jpg'),
  },
  {
    key: 'scarf',
    code: 'SCARF',
    ref: 'SLK',
    name: { zh: '真絲長巾', en: 'Silk Scarves', ko: '실크 스카프' },
    cover: url('/media/saintmari/scarf-camel-blazer.jpg'),
  },
  {
    key: 'jewelry',
    code: 'JEWELRY',
    ref: 'JWL',
    name: { zh: '純銀飾品', en: 'Sterling Jewelry', ko: '실버 주얼리' },
    cover: url('/media/saintmari/necklace-01.png'),
  },
  {
    key: 'accessory',
    code: 'ACCESSORY',
    ref: 'SCR',
    name: { zh: '絲巾扣', en: 'Scarf Rings', ko: '스카프링' },
    cover: url('/media/saintmari/scarfring-01.png'),
  },
]

const ORIGIN_KR = { zh: '韓國', en: 'Korea', ko: '한국' }

/* ────────────────────────────────────────────────────────────
   VUCA 居家香氛 — 五款香調，前中後調取自 2026 型錄
   ──────────────────────────────────────────────────────────── */
const SCENTS = [
  {
    slug: 'ylang',
    name: { zh: '依蘭', en: 'Ylang Ylang', ko: '일랑일랑' },
    tagline: {
      zh: '異國花香，優雅而感性',
      en: 'An exotic floral, elegant and sensual',
      ko: '우아하고 관능적인 이국적 플로럴',
    },
    desc: {
      zh: '香水樹的黃色花瓣是這款香調的核心。開場帶著水蜜桃與葡萄柚的果酸，中段讓依蘭與鳶尾鋪出粉質的厚度，尾韻落在麝香、琥珀與檀木。不甜膩，適合放在臥室或更衣間。',
      en: 'The yellow petals of the ylang tree sit at the centre of this one. It opens on peach and grapefruit, lets ylang and iris build a powdery weight through the middle, and settles into musk, amber and sandalwood. Not sweet — good for a bedroom or dressing room.',
      ko: '일랑일랑 나무의 노란 꽃잎이 중심입니다. 복숭아와 자몽으로 열리고, 미들에서 일랑일랑과 아이리스가 파우더리한 두께를 쌓은 뒤, 머스크와 앰버, 샌달우드로 가라앉습니다. 달지 않아 침실이나 드레스룸에 어울립니다.',
    },
    notes: {
      top: {
        zh: ['水蜜桃', '綠意', '天竺葵', '白松香', '葡萄柚'],
        en: ['Peach', 'Green', 'Geranium', 'Galbanum', 'Grapefruit'],
        ko: ['복숭아', '그린', '제라늄', '갈바넘', '자몽'],
      },
      middle: {
        zh: ['鳶尾', '依蘭', '鈴蘭'],
        en: ['Iris', 'Ylang', 'Lily of the valley'],
        ko: ['아이리스', '일랑일랑', '은방울꽃'],
      },
      base: {
        zh: ['麝香', '琥珀', '檀香'],
        en: ['Musk', 'Amber', 'Sandalwood'],
        ko: ['머스크', '앰버', '샌달우드'],
      },
    },
  },
  {
    slug: 'blackcherry',
    name: { zh: '黑櫻桃', en: 'Black Cherry', ko: '블랙체리' },
    tagline: {
      zh: '熟成果實的甜潤果香',
      en: 'Ripe fruit, sweet and full',
      ko: '잘 익은 과일의 달콤한 향',
    },
    desc: {
      zh: '像剛洗好、還帶著水珠的一籃櫻桃。前調的柑橘與綠意讓甜度先站穩，中段椰子與莓果堆疊出果肉的厚實，尾韻是橙花與野莓的收口。適合客廳與玄關。',
      en: 'Like a bowl of cherries just rinsed, still beaded with water. Tangerine and green steady the sweetness up front, coconut and berries build the flesh of it through the middle, and orange blossom with wild berries closes. Good for a living room or entryway.',
      ko: '방금 씻어 물기가 맺힌 체리 한 바구니 같습니다. 탠저린과 그린이 단맛을 잡아주고, 미들의 코코넛과 베리가 과육의 두께를 만들며, 오렌지 블로썸과 와일드베리로 마무리됩니다. 거실이나 현관에 어울립니다.',
    },
    notes: {
      top: {
        zh: ['橘子', '果香', '綠意'],
        en: ['Tangerine', 'Fruity', 'Green'],
        ko: ['탠저린', '프루티', '그린'],
      },
      middle: {
        zh: ['椰子', '葡萄', '覆盆莓', '洋李'],
        en: ['Coconut', 'Grape', 'Raspberry', 'Plum'],
        ko: ['코코넛', '포도', '라즈베리', '자두'],
      },
      base: {
        zh: ['橙花', '草莓', '野莓'],
        en: ['Orange blossom', 'Strawberry', 'Wild berries'],
        ko: ['오렌지 블로썸', '딸기', '와일드베리'],
      },
    },
  },
  {
    slug: 'aquakiss',
    name: { zh: '海潮之吻', en: 'Aqua Kiss', ko: '아쿠아 키스' },
    tagline: {
      zh: '清澈海面與暖陽的氣息',
      en: 'Clear water and warm sun',
      ko: '맑은 바다와 따스한 햇살',
    },
    desc: {
      zh: '這是全系列裡最清爽的一支。檸檬與黑醋栗開場，蘋果花與鈴蘭接住花香，麝香與雪松把整體壓在一個乾淨的底上。適合浴室、書房，或任何你希望「空氣感覺是新的」的地方。',
      en: 'The crispest of the five. Lemon and blackcurrant open, apple blossom and lily of the valley carry the floral, and musk with cedarwood holds it all on a clean base. For a bathroom, a study, or anywhere you want the air to feel new.',
      ko: '다섯 가지 중 가장 산뜻한 향입니다. 레몬과 블랙커런트로 열리고, 사과꽃과 은방울꽃이 플로럴을 받으며, 머스크와 시더우드가 깨끗한 베이스로 눌러줍니다. 욕실, 서재, 공기가 새로웠으면 하는 어느 곳에나.',
    },
    notes: {
      top: { zh: ['檸檬', '黑醋栗'], en: ['Lemon', 'Blackcurrant'], ko: ['레몬', '블랙커런트'] },
      middle: {
        zh: ['蘋果花', '鈴蘭'],
        en: ['Apple blossom', 'Lily of the valley'],
        ko: ['사과꽃', '은방울꽃'],
      },
      base: { zh: ['麝香', '雪松'], en: ['Musk', 'Cedarwood'], ko: ['머스크', '시더우드'] },
    },
  },
  {
    slug: 'flowershop',
    name: { zh: '晨間花市', en: 'Flower Shop', ko: '플라워샵' },
    tagline: {
      zh: '清晨盛開花市的鮮花香',
      en: 'A flower market at first light',
      ko: '이른 아침 꽃시장의 향',
    },
    desc: {
      zh: '靈感來自天剛亮、花才拆封的花市。綠意與尤加利先帶進濕潤的空氣感，玫瑰、丁香與鈴蘭層層開展，茉莉與雪松收尾。是五款裡花香最完整的一支。',
      en: 'Drawn from a flower market at daybreak, the bundles just opened. Green and eucalyptus bring in the damp air first, rose, lilac and lily of the valley open in layers, jasmine and cedarwood finish. The fullest floral of the five.',
      ko: '동틀 무렵, 막 포장을 푼 꽃시장에서 얻은 향입니다. 그린과 유칼립투스가 축축한 공기를 먼저 들이고, 장미와 라일락, 은방울꽃이 겹겹이 열리며, 자스민과 시더우드로 끝맺습니다. 다섯 중 가장 완전한 플로럴입니다.',
    },
    notes: {
      top: { zh: ['綠意', '尤加利'], en: ['Green', 'Eucalyptus'], ko: ['그린', '유칼립투스'] },
      middle: {
        zh: ['玫瑰', '丁香', '肉桂', '鈴蘭'],
        en: ['Rose', 'Lilac', 'Cinnamon', 'Lily of the valley'],
        ko: ['장미', '라일락', '시나몬', '은방울꽃'],
      },
      base: { zh: ['茉莉', '雪松'], en: ['Jasmine', 'Cedarwood'], ko: ['자스민', '시더우드'] },
    },
  },
  {
    slug: 'aprilfresh',
    name: { zh: '四月棉柔', en: 'April Fresh', ko: '에이프릴 프레시' },
    tagline: {
      zh: '花香混棉柔的舒緩氣息',
      en: 'Soft florals over clean cotton',
      ko: '부드러운 플로럴과 코튼',
    },
    desc: {
      zh: '像剛曬過太陽的棉被。綠意與西洋梨開場，水蜜桃、茴香與蘋果花帶出溫度，香草、檀木與雪松把香氣收得柔軟。放在臥室最合適，也是送禮不容易出錯的一支。',
      en: 'Like bedding just in from the sun. Green and pear open, peach, anise and apple blossom bring the warmth, and vanilla, sandalwood and cedarwood soften the close. Best in a bedroom, and the safest of the five to give as a gift.',
      ko: '햇볕에 막 말린 이불 같습니다. 그린과 서양배로 열리고, 복숭아와 아니스, 사과꽃이 온기를 더하며, 바닐라와 샌달우드, 시더우드가 부드럽게 마무리합니다. 침실에 가장 잘 맞고, 선물로도 실패가 없습니다.',
    },
    notes: {
      top: { zh: ['綠意', '西洋梨'], en: ['Green', 'Pear'], ko: ['그린', '서양배'] },
      middle: {
        zh: ['水蜜桃', '茴香', '蘋果花'],
        en: ['Peach', 'Anise', 'Apple blossom'],
        ko: ['복숭아', '아니스', '사과꽃'],
      },
      base: {
        zh: ['香草', '檀香', '雪松'],
        en: ['Vanilla', 'Sandalwood', 'Cedarwood'],
        ko: ['바닐라', '샌달우드', '시더우드'],
      },
    },
  },
]

/* ────────────────────────────────────────────────────────────
   SAINTMARI — 41 個 SKU。同型商品共用型錄描述，
   個別差異由圖片承載，這是選品代理目錄的實際運作方式。
   ──────────────────────────────────────────────────────────── */
const MAT = {
  silk: { zh: '100% 真絲', en: '100% Silk', ko: '실크 100%' },
  silver: { zh: '925 純銀', en: 'Sterling silver 925', ko: '925 실버' },
  alloyPearl: {
    zh: '合金鍍層 · 淡水珍珠',
    en: 'Plated alloy · Freshwater pearl',
    ko: '합금 도금 · 담수진주',
  },
  alloyCz: {
    zh: '合金鍍層 · 方晶鋯石',
    en: 'Plated alloy · Cubic zirconia',
    ko: '합금 도금 · 큐빅',
  },
}

const SM_LINES = [
  {
    kind: 'scarf',
    category: 'scarf',
    ref: 'SLK',
    count: 13,
    name: { zh: '真絲長巾', en: 'Silk Twilly Scarf', ko: '실크 스카프' },
    hs: '6214.10.0000',
    material: MAT.silk,
    spec: { zh: '約 8 × 120 cm', en: 'approx. 8 × 120 cm', ko: '약 8 × 120 cm' },
    desc: {
      zh: '窄版真絲長巾，可繫於頸間、綁在包袋提把或當作髮帶。邊緣以手工捲縫收口，垂墜時不會翻捲。印花刻意壓低飽和度，不搶衣服的主色。',
      en: 'A narrow silk twilly for the neck, a bag handle, or tied back in the hair. The edges are hand-rolled so they hang without curling. Prints are kept deliberately low in saturation so they never compete with what you are wearing.',
      ko: '목에 매거나 가방 손잡이에 묶거나 헤어밴드로 쓰는 좁은 폭의 실크 스카프. 가장자리를 손으로 말아 박아 늘어뜨려도 말리지 않습니다. 프린트는 의도적으로 채도를 낮춰 옷의 주된 색을 방해하지 않습니다.',
    },
  },
  {
    kind: 'scarfring',
    category: 'accessory',
    ref: 'SCR',
    count: 6,
    name: { zh: '珍珠絲巾扣', en: 'Pearl Scarf Ring', ko: '스카프링' },
    hs: '7118.90.9000',
    material: MAT.alloyPearl,
    spec: { zh: '約 2.2 × 3.5 cm', en: 'approx. 2.2 × 3.5 cm', ko: '약 2.2 × 3.5 cm' },
    desc: {
      zh: '長巾的收尾。鏤空長方框搭一顆珍珠垂墜，銀、金、玫瑰金三色可依當天的首飾決定。穿過長巾一收，結就乾淨了。',
      en: 'How a scarf finishes. An open rectangular frame with a single pearl drop, in silver, gold or rose gold to match whatever else you have on. Thread the scarf through, draw it closed, and the knot is done.',
      ko: '스카프의 마무리. 비어 있는 사각 프레임에 진주 한 알을 매단 형태로, 실버·골드·로즈골드 세 가지 중 그날의 주얼리에 맞춰 고르면 됩니다. 스카프를 통과시켜 당기면 매듭이 깔끔하게 정리됩니다.',
    },
  },
  {
    kind: 'earring',
    category: 'jewelry',
    ref: 'EAR',
    count: 7,
    name: { zh: '耳環', en: 'Earrings', ko: '귀걸이' },
    hs: '7113.11.0000',
    material: MAT.silver,
    spec: { zh: '耳針式', en: 'Stud fitting', ko: '스터드' },
    desc: {
      zh: '925 純銀為基底，鑲面以密釘方式排列方晶鋯石。尺寸刻意做小，貼著耳垂不晃動，適合每天戴。',
      en: 'Sterling silver, with cubic zirconia set pavé across the face. Kept deliberately small so it sits against the lobe without swinging — made to be worn every day.',
      ko: '925 실버 베이스에 큐빅을 파베 세팅했습니다. 의도적으로 작게 만들어 귓불에 붙어 흔들리지 않으며, 매일 착용하기 좋습니다.',
    },
    // 第 5–7 支為 7118.90 合金，非純銀
    hsOverride: { 5: '7118.90.9000', 6: '7118.90.9000', 7: '7118.90.9000' },
    materialOverride: { 5: MAT.alloyCz, 6: MAT.alloyCz, 7: MAT.alloyCz },
  },
  {
    kind: 'necklace',
    category: 'jewelry',
    ref: 'NEC',
    count: 5,
    name: { zh: '項鍊', en: 'Necklace', ko: '목걸이' },
    hs: '7113.11.0000',
    material: MAT.silver,
    spec: { zh: '鍊長約 40 + 5 cm', en: 'Chain approx. 40 + 5 cm', ko: '체인 약 40 + 5 cm' },
    desc: {
      zh: '細鍊配上零星的垂墜，走動時會有很輕的光。鍊長可調五公分，襯衫領內或高領外都能戴。',
      en: 'A fine chain with a scatter of small drops that catch a little light as you move. Five centimetres of adjustment, so it works inside a shirt collar or over a high neck.',
      ko: '가는 체인에 작은 드롭이 흩어져 움직일 때 가볍게 빛납니다. 5cm까지 길이 조절이 되어 셔츠 카라 안쪽에도, 하이넥 위에도 어울립니다.',
    },
  },
  {
    kind: 'ring',
    category: 'jewelry',
    ref: 'RNG',
    count: 5,
    name: { zh: '戒指', en: 'Ring', ko: '반지' },
    hs: '7113.11.0000',
    material: MAT.silver,
    spec: { zh: '可調式戒圍', en: 'Adjustable size', ko: '사이즈 조절 가능' },
    desc: {
      zh: '線條收得極細，疊戴兩三只也不顯累贅。戒圍可微調，天氣冷熱造成的指圍變化都戴得下。',
      en: 'Drawn very fine, so two or three stacked still read as restraint. The band adjusts, which covers the way fingers change with the weather.',
      ko: '선을 아주 가늘게 뽑아 두세 개를 겹쳐 껴도 과하지 않습니다. 사이즈 조절이 가능해 날씨에 따라 달라지는 손가락 둘레에도 맞습니다.',
    },
  },
  {
    kind: 'bracelet',
    category: 'jewelry',
    ref: 'BRC',
    count: 5,
    name: { zh: '手鍊', en: 'Bracelet', ko: '팔찌' },
    hs: '7113.11.0000',
    material: MAT.silver,
    spec: { zh: '鍊長約 16 + 3 cm', en: 'Chain approx. 16 + 3 cm', ko: '체인 약 16 + 3 cm' },
    desc: {
      zh: '手腕上最安靜的一件。扣頭做在同一條線上，不會在袖口留下突起。',
      en: 'The quietest thing on a wrist. The clasp is drawn into the same line as the chain, so nothing catches under a cuff.',
      ko: '손목에서 가장 조용한 물건. 잠금장치를 체인과 같은 선상에 넣어 소매 안에서 걸리지 않습니다.',
    },
  },
]

const pad = (n) => String(n).padStart(3, '0')

/* ── 組出完整目錄 ──────────────────────────────────────────── */
const list = []

SCENTS.forEach((s, i) => {
  list.push({
    id: `frg-${s.slug}`,
    ref: `VL · FRG · ${pad(i + 1)}`,
    house: 'vuca',
    category: 'fragrance',
    name: s.name,
    tagline: s.tagline,
    desc: s.desc,
    notes: s.notes,
    material: {
      zh: '玉米萃取植物乙醇 · IFRA 標準香精',
      en: 'Corn-derived plant ethanol · IFRA-compliant fragrance',
      ko: '옥수수 유래 식물성 에탄올 · IFRA 기준 향료',
    },
    origin: ORIGIN_KR,
    spec: {
      zh: 'Classic Diffuser 260ml × 2',
      en: 'Classic Diffuser 260ml × 2',
      ko: 'Classic Diffuser 260ml × 2',
    },
    hs: '3307.49.0000',
    image: url(`/media/vuca/${s.slug}.jpg`),
    thumb: url(`/media/vuca/${s.slug}.jpg`),
    gallery: [
      url(`/media/vuca/${s.slug}.jpg`),
      url('/media/vuca/set.png'),
      url('/media/vuca/bedroom.jpg'),
    ],
    listed: true,
    order: i + 1,
    updated: '2026-08-28',
  })
})

SM_LINES.forEach((line) => {
  const shots = manifest[line.kind] || {}
  for (let i = 1; i <= line.count; i++) {
    const gallery = shots[i]
    if (!gallery || !gallery.length) continue // Excel 未附照片的 SKU 不上架
    // 名稱不能叫 shots —— 外層已有同名變數，在同一區塊再宣告會讓上一行讀到
    // 尚未初始化的它（TDZ），整個模組會在載入時就丟 ReferenceError。
    const paths = gallery.map(url)
    const img = paths[0]
    const n = pad(i)
    list.push({
      id: `${line.kind}-${i}`,
      ref: `VL · ${line.ref} · ${n}`,
      house: 'saintmari',
      category: line.category,
      name: {
        zh: `${line.name.zh} No.${n}`,
        en: `${line.name.en} No.${n}`,
        ko: `${line.name.ko} No.${n}`,
      },
      tagline: null,
      desc: line.desc,
      notes: null,
      material: line.materialOverride?.[i] || line.material,
      origin: ORIGIN_KR,
      spec: line.spec,
      hs: line.hsOverride?.[i] || line.hs,
      image: img,
      thumb: img,
      gallery: paths,
      listed: true,
      order: list.length + 1,
      updated: '2026-08-' + String(10 + ((i * 3) % 19)).padStart(2, '0'),
    })
  }
})

// 未展示的樣本，讓後台的展示狀態切換看得出差別
;['earring-5', 'ring-5', 'bracelet-5'].forEach((id) => {
  const p = list.find((x) => x.id === id)
  if (p) p.listed = false
})

export const products = list

/** 首頁精選：只挑我們確實看過實拍、能寫出具體描述的三件 */
const FEATURED = {
  'frg-ylang': {
    // 精選位要放商品本身；依蘭花的植物意象圖留在彈窗裡說明香調
    image: url('/media/vuca/set.png'),
  },
  'scarf-1': {
    image: url('/media/saintmari/scarf-camel-blazer.jpg'),
    name: { zh: '象牙真絲長巾', en: 'Ivory Twilly Scarf', ko: '아이보리 실크 스카프' },
    desc: {
      zh: '象牙白底上一枚極淡的金線印記，繫在襯衫領口時只露出一小段。手工捲邊，垂墜感夠但不軟塌，是駝色與奶白這類低彩度穿搭最省力的一筆。',
      en: 'A faint gold mark on ivory, showing only a short length when tied at a shirt collar. Hand-rolled edges give it drape without slackness — the least effortful way to finish a camel-and-cream outfit.',
      ko: '아이보리 바탕에 아주 옅은 골드 프린트. 셔츠 카라에 매면 짧은 부분만 드러납니다. 손으로 말아 박은 가장자리 덕에 늘어지지 않으면서 자연스럽게 떨어지며, 카멜과 크림 톤 차림을 가장 손쉽게 완성해 줍니다.',
    },
  },
  'scarfring-1': {
    name: { zh: '三色珍珠絲巾扣', en: 'Trio Pearl Scarf Ring', ko: '트리오 펄 스카프링' },
    desc: {
      zh: '鏤空長方框下墜一顆圓潤珍珠，銀、金、玫瑰金三色同款。長巾穿過一收，結就收乾淨了 —— 這是整條長巾最容易被忽略、卻最決定成敗的一步。',
      en: 'An open rectangular frame with one round pearl below, in silver, gold and rose gold. Thread the scarf through and draw it closed and the knot resolves — the step most often skipped, and the one that decides whether the scarf works.',
      ko: '비어 있는 사각 프레임 아래 둥근 진주 한 알. 실버·골드·로즈골드 세 가지 색. 스카프를 통과시켜 당기면 매듭이 정리됩니다 — 가장 자주 건너뛰지만, 스카프의 완성도를 결정하는 단계입니다.',
    },
  },
}

export const featured = Object.keys(FEATURED)
  .map((id) => {
    const p = products.find((x) => x.id === id)
    return p && { ...p, ...FEATURED[id] }
  })
  .filter(Boolean)

export { url as mediaUrl }

export const findCategory = (key) => categories.find((c) => c.key === key)

export const categoryCount = (key) => products.filter((p) => p.category === key).length

/**
 * 版面用哪種裁切方式取決於「這是不是去背圖」。
 * build-assets.py 會把沒有實際透明像素的圖轉存成 JPEG，
 * 因此 .png 副檔名可以直接當成去背圖的判準。
 */
export const isCutout = (src) => Boolean(src) && src.endsWith('.png')
