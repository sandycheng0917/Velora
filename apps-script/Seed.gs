/**
 * 一次性灌入既有商品（由 tools/migrate-seed.mjs 產生，請勿手動編輯）。
 *
 * 用法：函式下拉選 seedProducts → 執行 → 看執行紀錄。
 *
 * 來源是 velora-frontend/src/data/catalog.js 的 products 陣列，
 * 只含真的有照片的 13 件（沒照片的 SKU 在 catalog.js 就已被排除）。
 * velora2 的手機包三件是版面示意，不在來源裡，也不會被灌進來。
 *
 * catalog.js 的 FEATURED 覆寫已經併入 —— 例如 scarf-1 的品名是
 * 手寫的「象牙真絲長巾」而不是程式生成的「真絲長巾 No.01」。
 *
 * 可以重複執行：已存在的 id 會被跳過，不會產生重複列，也不會覆蓋你之後的編輯。
 * 圖片不在這裡，images 分頁由另一步寫入。
 */

var SEED_PRODUCTS = [
  ["frg-ylang", "VL · FRG · 001", "fragrance", "vuca", "依蘭", "Ylang Ylang", "일랑일랑", "異國花香，優雅而感性", "An exotic floral, elegant and sensual", "우아하고 관능적인 이국적 플로럴", "香水樹的黃色花瓣是這款香調的核心。開場帶著水蜜桃與葡萄柚的果酸，中段讓依蘭與鳶尾鋪出粉質的厚度，尾韻落在麝香、琥珀與檀木。不甜膩，適合放在臥室或更衣間。", "The yellow petals of the ylang tree sit at the centre of this one. It opens on peach and grapefruit, lets ylang and iris build a powdery weight through the middle, and settles into musk, amber and sandalwood. Not sweet — good for a bedroom or dressing room.", "일랑일랑 나무의 노란 꽃잎이 중심입니다. 복숭아와 자몽으로 열리고, 미들에서 일랑일랑과 아이리스가 파우더리한 두께를 쌓은 뒤, 머스크와 앰버, 샌달우드로 가라앉습니다. 달지 않아 침실이나 드레스룸에 어울립니다.", "玉米萃取植物乙醇 · IFRA 標準香精", "Corn-derived plant ethanol · IFRA-compliant fragrance", "옥수수 유래 식물성 에탄올 · IFRA 기준 향료", "Classic Diffuser 260ml × 2", "Classic Diffuser 260ml × 2", "Classic Diffuser 260ml × 2", "水蜜桃;綠意;天竺葵;白松香;葡萄柚", "Peach;Green;Geranium;Galbanum;Grapefruit", "복숭아;그린;제라늄;갈바넘;자몽", "鳶尾;依蘭;鈴蘭", "Iris;Ylang;Lily of the valley", "아이리스;일랑일랑;은방울꽃", "麝香;琥珀;檀香", "Musk;Amber;Sandalwood", "머스크;앰버;샌달우드", "3307.49.0000", "KR", "", false, true, true, 1, "frg-ylang-main", "frg-ylang-2", "frg-ylang-3", "2026-08-28", false],
  ["frg-blackcherry", "VL · FRG · 002", "fragrance", "vuca", "黑櫻桃", "Black Cherry", "블랙체리", "熟成果實的甜潤果香", "Ripe fruit, sweet and full", "잘 익은 과일의 달콤한 향", "像剛洗好、還帶著水珠的一籃櫻桃。前調的柑橘與綠意讓甜度先站穩，中段椰子與莓果堆疊出果肉的厚實，尾韻是橙花與野莓的收口。適合客廳與玄關。", "Like a bowl of cherries just rinsed, still beaded with water. Tangerine and green steady the sweetness up front, coconut and berries build the flesh of it through the middle, and orange blossom with wild berries closes. Good for a living room or entryway.", "방금 씻어 물기가 맺힌 체리 한 바구니 같습니다. 탠저린과 그린이 단맛을 잡아주고, 미들의 코코넛과 베리가 과육의 두께를 만들며, 오렌지 블로썸과 와일드베리로 마무리됩니다. 거실이나 현관에 어울립니다.", "玉米萃取植物乙醇 · IFRA 標準香精", "Corn-derived plant ethanol · IFRA-compliant fragrance", "옥수수 유래 식물성 에탄올 · IFRA 기준 향료", "Classic Diffuser 260ml × 2", "Classic Diffuser 260ml × 2", "Classic Diffuser 260ml × 2", "橘子;果香;綠意", "Tangerine;Fruity;Green", "탠저린;프루티;그린", "椰子;葡萄;覆盆莓;洋李", "Coconut;Grape;Raspberry;Plum", "코코넛;포도;라즈베리;자두", "橙花;草莓;野莓", "Orange blossom;Strawberry;Wild berries", "오렌지 블로썸;딸기;와일드베리", "3307.49.0000", "KR", "", false, true, false, 2, "frg-blackcherry-main", "frg-blackcherry-2", "frg-blackcherry-3", "2026-08-28", false],
  ["frg-aquakiss", "VL · FRG · 003", "fragrance", "vuca", "海潮之吻", "Aqua Kiss", "아쿠아 키스", "清澈海面與暖陽的氣息", "Clear water and warm sun", "맑은 바다와 따스한 햇살", "這是全系列裡最清爽的一支。檸檬與黑醋栗開場，蘋果花與鈴蘭接住花香，麝香與雪松把整體壓在一個乾淨的底上。適合浴室、書房，或任何你希望「空氣感覺是新的」的地方。", "The crispest of the five. Lemon and blackcurrant open, apple blossom and lily of the valley carry the floral, and musk with cedarwood holds it all on a clean base. For a bathroom, a study, or anywhere you want the air to feel new.", "다섯 가지 중 가장 산뜻한 향입니다. 레몬과 블랙커런트로 열리고, 사과꽃과 은방울꽃이 플로럴을 받으며, 머스크와 시더우드가 깨끗한 베이스로 눌러줍니다. 욕실, 서재, 공기가 새로웠으면 하는 어느 곳에나.", "玉米萃取植物乙醇 · IFRA 標準香精", "Corn-derived plant ethanol · IFRA-compliant fragrance", "옥수수 유래 식물성 에탄올 · IFRA 기준 향료", "Classic Diffuser 260ml × 2", "Classic Diffuser 260ml × 2", "Classic Diffuser 260ml × 2", "檸檬;黑醋栗", "Lemon;Blackcurrant", "레몬;블랙커런트", "蘋果花;鈴蘭", "Apple blossom;Lily of the valley", "사과꽃;은방울꽃", "麝香;雪松", "Musk;Cedarwood", "머스크;시더우드", "3307.49.0000", "KR", "", false, true, false, 3, "frg-aquakiss-main", "frg-aquakiss-2", "frg-aquakiss-3", "2026-08-28", false],
  ["frg-flowershop", "VL · FRG · 004", "fragrance", "vuca", "晨間花市", "Flower Shop", "플라워샵", "清晨盛開花市的鮮花香", "A flower market at first light", "이른 아침 꽃시장의 향", "靈感來自天剛亮、花才拆封的花市。綠意與尤加利先帶進濕潤的空氣感，玫瑰、丁香與鈴蘭層層開展，茉莉與雪松收尾。是五款裡花香最完整的一支。", "Drawn from a flower market at daybreak, the bundles just opened. Green and eucalyptus bring in the damp air first, rose, lilac and lily of the valley open in layers, jasmine and cedarwood finish. The fullest floral of the five.", "동틀 무렵, 막 포장을 푼 꽃시장에서 얻은 향입니다. 그린과 유칼립투스가 축축한 공기를 먼저 들이고, 장미와 라일락, 은방울꽃이 겹겹이 열리며, 자스민과 시더우드로 끝맺습니다. 다섯 중 가장 완전한 플로럴입니다.", "玉米萃取植物乙醇 · IFRA 標準香精", "Corn-derived plant ethanol · IFRA-compliant fragrance", "옥수수 유래 식물성 에탄올 · IFRA 기준 향료", "Classic Diffuser 260ml × 2", "Classic Diffuser 260ml × 2", "Classic Diffuser 260ml × 2", "綠意;尤加利", "Green;Eucalyptus", "그린;유칼립투스", "玫瑰;丁香;肉桂;鈴蘭", "Rose;Lilac;Cinnamon;Lily of the valley", "장미;라일락;시나몬;은방울꽃", "茉莉;雪松", "Jasmine;Cedarwood", "자스민;시더우드", "3307.49.0000", "KR", "", false, true, false, 4, "frg-flowershop-main", "frg-flowershop-2", "frg-flowershop-3", "2026-08-28", false],
  ["frg-aprilfresh", "VL · FRG · 005", "fragrance", "vuca", "四月棉柔", "April Fresh", "에이프릴 프레시", "花香混棉柔的舒緩氣息", "Soft florals over clean cotton", "부드러운 플로럴과 코튼", "像剛曬過太陽的棉被。綠意與西洋梨開場，水蜜桃、茴香與蘋果花帶出溫度，香草、檀木與雪松把香氣收得柔軟。放在臥室最合適，也是送禮不容易出錯的一支。", "Like bedding just in from the sun. Green and pear open, peach, anise and apple blossom bring the warmth, and vanilla, sandalwood and cedarwood soften the close. Best in a bedroom, and the safest of the five to give as a gift.", "햇볕에 막 말린 이불 같습니다. 그린과 서양배로 열리고, 복숭아와 아니스, 사과꽃이 온기를 더하며, 바닐라와 샌달우드, 시더우드가 부드럽게 마무리합니다. 침실에 가장 잘 맞고, 선물로도 실패가 없습니다.", "玉米萃取植物乙醇 · IFRA 標準香精", "Corn-derived plant ethanol · IFRA-compliant fragrance", "옥수수 유래 식물성 에탄올 · IFRA 기준 향료", "Classic Diffuser 260ml × 2", "Classic Diffuser 260ml × 2", "Classic Diffuser 260ml × 2", "綠意;西洋梨", "Green;Pear", "그린;서양배", "水蜜桃;茴香;蘋果花", "Peach;Anise;Apple blossom", "복숭아;아니스;사과꽃", "香草;檀香;雪松", "Vanilla;Sandalwood;Cedarwood", "바닐라;샌달우드;시더우드", "3307.49.0000", "KR", "", false, true, false, 5, "frg-aprilfresh-main", "frg-aprilfresh-2", "frg-aprilfresh-3", "2026-08-28", false],
  ["scarf-1", "VL · SLK · 001", "scarf", "saintmari", "象牙真絲長巾", "Ivory Twilly Scarf", "아이보리 실크 스카프", "", "", "", "象牙白底上一枚極淡的金線印記，繫在襯衫領口時只露出一小段。手工捲邊，垂墜感夠但不軟塌，是駝色與奶白這類低彩度穿搭最省力的一筆。", "A faint gold mark on ivory, showing only a short length when tied at a shirt collar. Hand-rolled edges give it drape without slackness — the least effortful way to finish a camel-and-cream outfit.", "아이보리 바탕에 아주 옅은 골드 프린트. 셔츠 카라에 매면 짧은 부분만 드러납니다. 손으로 말아 박은 가장자리 덕에 늘어지지 않으면서 자연스럽게 떨어지며, 카멜과 크림 톤 차림을 가장 손쉽게 완성해 줍니다.", "100% 真絲", "100% Silk", "실크 100%", "約 8 × 120 cm", "approx. 8 × 120 cm", "약 8 × 120 cm", "", "", "", "", "", "", "", "", "", "6214.10.0000", "KR", "", false, true, true, 6, "scarf-1-main", "", "", "2026-08-13", false],
  ["scarf-2", "VL · SLK · 002", "scarf", "saintmari", "真絲長巾 No.002", "Silk Twilly Scarf No.002", "실크 스카프 No.002", "", "", "", "窄版真絲長巾，可繫於頸間、綁在包袋提把或當作髮帶。邊緣以手工捲縫收口，垂墜時不會翻捲。印花刻意壓低飽和度，不搶衣服的主色。", "A narrow silk twilly for the neck, a bag handle, or tied back in the hair. The edges are hand-rolled so they hang without curling. Prints are kept deliberately low in saturation so they never compete with what you are wearing.", "목에 매거나 가방 손잡이에 묶거나 헤어밴드로 쓰는 좁은 폭의 실크 스카프. 가장자리를 손으로 말아 박아 늘어뜨려도 말리지 않습니다. 프린트는 의도적으로 채도를 낮춰 옷의 주된 색을 방해하지 않습니다.", "100% 真絲", "100% Silk", "실크 100%", "約 8 × 120 cm", "approx. 8 × 120 cm", "약 8 × 120 cm", "", "", "", "", "", "", "", "", "", "6214.10.0000", "KR", "", false, true, false, 7, "scarf-2-main", "", "", "2026-08-16", false],
  ["scarf-3", "VL · SLK · 003", "scarf", "saintmari", "真絲長巾 No.003", "Silk Twilly Scarf No.003", "실크 스카프 No.003", "", "", "", "窄版真絲長巾，可繫於頸間、綁在包袋提把或當作髮帶。邊緣以手工捲縫收口，垂墜時不會翻捲。印花刻意壓低飽和度，不搶衣服的主色。", "A narrow silk twilly for the neck, a bag handle, or tied back in the hair. The edges are hand-rolled so they hang without curling. Prints are kept deliberately low in saturation so they never compete with what you are wearing.", "목에 매거나 가방 손잡이에 묶거나 헤어밴드로 쓰는 좁은 폭의 실크 스카프. 가장자리를 손으로 말아 박아 늘어뜨려도 말리지 않습니다. 프린트는 의도적으로 채도를 낮춰 옷의 주된 색을 방해하지 않습니다.", "100% 真絲", "100% Silk", "실크 100%", "約 8 × 120 cm", "approx. 8 × 120 cm", "약 8 × 120 cm", "", "", "", "", "", "", "", "", "", "6214.10.0000", "KR", "", false, true, false, 8, "scarf-3-main", "", "", "2026-08-19", false],
  ["scarfring-1", "VL · SCR · 001", "jewelry", "saintmari", "三色珍珠絲巾扣", "Trio Pearl Scarf Ring", "트리오 펄 스카프링", "", "", "", "鏤空長方框下墜一顆圓潤珍珠，銀、金、玫瑰金三色同款。長巾穿過一收，結就收乾淨了 —— 這是整條長巾最容易被忽略、卻最決定成敗的一步。", "An open rectangular frame with one round pearl below, in silver, gold and rose gold. Thread the scarf through and draw it closed and the knot resolves — the step most often skipped, and the one that decides whether the scarf works.", "비어 있는 사각 프레임 아래 둥근 진주 한 알. 실버·골드·로즈골드 세 가지 색. 스카프를 통과시켜 당기면 매듭이 정리됩니다 — 가장 자주 건너뛰지만, 스카프의 완성도를 결정하는 단계입니다.", "合金鍍層 · 淡水珍珠", "Plated alloy · Freshwater pearl", "합금 도금 · 담수진주", "約 2.2 × 3.5 cm", "approx. 2.2 × 3.5 cm", "약 2.2 × 3.5 cm", "", "", "", "", "", "", "", "", "", "7118.90.9000", "KR", "", false, true, true, 9, "scarfring-1-main", "", "", "2026-08-13", false],
  ["earring-1", "VL · EAR · 001", "jewelry", "saintmari", "耳環 No.001", "Earrings No.001", "귀걸이 No.001", "", "", "", "925 純銀為基底，鑲面以密釘方式排列方晶鋯石。尺寸刻意做小，貼著耳垂不晃動，適合每天戴。", "Sterling silver, with cubic zirconia set pavé across the face. Kept deliberately small so it sits against the lobe without swinging — made to be worn every day.", "925 실버 베이스에 큐빅을 파베 세팅했습니다. 의도적으로 작게 만들어 귓불에 붙어 흔들리지 않으며, 매일 착용하기 좋습니다.", "925 純銀", "Sterling silver 925", "925 실버", "耳針式", "Stud fitting", "스터드", "", "", "", "", "", "", "", "", "", "7113.11.0000", "KR", "", false, true, false, 10, "earring-1-main", "", "", "2026-08-13", false],
  ["necklace-1", "VL · NEC · 001", "jewelry", "saintmari", "項鍊 No.001", "Necklace No.001", "목걸이 No.001", "", "", "", "細鍊配上零星的垂墜，走動時會有很輕的光。鍊長可調五公分，襯衫領內或高領外都能戴。", "A fine chain with a scatter of small drops that catch a little light as you move. Five centimetres of adjustment, so it works inside a shirt collar or over a high neck.", "가는 체인에 작은 드롭이 흩어져 움직일 때 가볍게 빛납니다. 5cm까지 길이 조절이 되어 셔츠 카라 안쪽에도, 하이넥 위에도 어울립니다.", "925 純銀", "Sterling silver 925", "925 실버", "鍊長約 40 + 5 cm", "Chain approx. 40 + 5 cm", "체인 약 40 + 5 cm", "", "", "", "", "", "", "", "", "", "7113.11.0000", "KR", "", false, true, false, 11, "necklace-1-main", "", "", "2026-08-13", false],
  ["ring-1", "VL · RNG · 001", "jewelry", "saintmari", "戒指 No.001", "Ring No.001", "반지 No.001", "", "", "", "線條收得極細，疊戴兩三只也不顯累贅。戒圍可微調，天氣冷熱造成的指圍變化都戴得下。", "Drawn very fine, so two or three stacked still read as restraint. The band adjusts, which covers the way fingers change with the weather.", "선을 아주 가늘게 뽑아 두세 개를 겹쳐 껴도 과하지 않습니다. 사이즈 조절이 가능해 날씨에 따라 달라지는 손가락 둘레에도 맞습니다.", "925 純銀", "Sterling silver 925", "925 실버", "可調式戒圍", "Adjustable size", "사이즈 조절 가능", "", "", "", "", "", "", "", "", "", "7113.11.0000", "KR", "", false, true, false, 12, "ring-1-main", "", "", "2026-08-13", false],
  ["bracelet-1", "VL · BRC · 001", "jewelry", "saintmari", "手鍊 No.001", "Bracelet No.001", "팔찌 No.001", "", "", "", "手腕上最安靜的一件。扣頭做在同一條線上，不會在袖口留下突起。", "The quietest thing on a wrist. The clasp is drawn into the same line as the chain, so nothing catches under a cuff.", "손목에서 가장 조용한 물건. 잠금장치를 체인과 같은 선상에 넣어 소매 안에서 걸리지 않습니다.", "925 純銀", "Sterling silver 925", "925 실버", "鍊長約 16 + 3 cm", "Chain approx. 16 + 3 cm", "체인 약 16 + 3 cm", "", "", "", "", "", "", "", "", "", "7113.11.0000", "KR", "", false, true, false, 13, "bracelet-1-main", "", "", "2026-08-13", false]
];

function seedProducts() {
  var ss = openBook_();
  var sh = ss.getSheetByName('products');
  if (!sh) throw new Error('找不到 products 分頁，請先執行 setupSheets。');

  // 欄數對不上就停 —— 繼續寫下去會整張表錯位，而錯位的表看起來是有資料的
  var header = sh.getRange(1, 1, 1, 40).getValues()[0];
  var want = ["id","ref","category","house","name_zh","name_en","name_ko","tagline_zh","tagline_en","tagline_ko","desc_zh","desc_en","desc_ko","material_zh","material_en","material_ko","spec_zh","spec_en","spec_ko","notes_top_zh","notes_top_en","notes_top_ko","notes_mid_zh","notes_mid_en","notes_mid_ko","notes_base_zh","notes_base_en","notes_base_ko","hs","origin","price","price_public","listed","featured","order","img_main","img_2","img_3","updated","deleted"];
  for (var i = 0; i < want.length; i++) {
    if (String(header[i]) !== want[i]) {
      throw new Error('欄位不符：第 ' + (i + 1) + ' 欄應為 ' + want[i] +
        '，實為「' + header[i] + '」。請先重跑 setupSheets。');
    }
  }

  // 🔴 附加位置用 lastIdRow_（定義在 Setup.gs），不要用 getLastRow()。
  // getLastRow() 把「套了核取方塊驗證的空儲存格」也算成有內容，
  // 實測資料只有 13 列時它會回 501 —— 拿它當附加位置，新商品會被寫到
  // 第 502 列，中間留下一大段空白，而且每次新增都更嚴重。
  var lastRow = lastIdRow_(sh);
  var existing = lastRow > 1
    ? sh.getRange(2, 1, lastRow - 1, 1).getValues().map(function (r) { return String(r[0]); })
    : [];

  var add = SEED_PRODUCTS.filter(function (row) { return existing.indexOf(row[0]) === -1; });
  var skipped = SEED_PRODUCTS.length - add.length;

  if (add.length) {
    ensureRows_(sh, lastRow + add.length + 1);
    sh.getRange(lastRow + 1, 1, add.length, want.length).setValues(add);
    SpreadsheetApp.flush();
  }

  var msg = '灌入 ' + add.length + ' 件商品' +
    (skipped ? '，跳過已存在的 ' + skipped + ' 件' : '') +
    '。\n目前 products 共 ' + (lastIdRow_(sh) - 1) + ' 件（第 2–' + lastIdRow_(sh) + ' 列）。';
  Logger.log(msg);
  return msg;
}
