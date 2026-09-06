/**
 * 品牌與品類
 *
 * 由 tools/build-catalog.mjs 從 Google Sheet 產生，請勿手動編輯 ——
 * 下次建置就會被覆蓋。要改內容請改 Sheet。
 *
 * 產生時間：2026-09-06T14:38:49.250Z
 */

export const houses = [
  {
    "key": "vuca",
    "name": "VUCA",
    "nameKo": "부카",
    "country": {
      "zh": "韓國",
      "en": "Korea",
      "ko": "한국"
    },
    "tagline": "Always be with you.",
    "intro": {
      "zh": "首爾的居家香氛品牌，主張香氣是空間的一部分而非附加品。香精配方符合 IFRA 國際香精協會標準，基劑採用玉米萃取植物乙醇，並通過七項有害物質檢驗。",
      "en": "A Seoul home-fragrance house that treats scent as part of a room, not an accessory to it. Formulated to IFRA standards on a base of corn-derived plant ethanol, and tested for seven key harmful substances.",
      "ko": "향을 공간의 일부로 다루는 서울의 홈 프래그런스 브랜드. IFRA 기준에 맞춘 향료와 옥수수 유래 식물성 에탄올 베이스, 7가지 유해물질 검사를 통과했습니다."
    }
  },
  {
    "key": "saintmari",
    "name": "SAINTMARI",
    "nameKo": "세인트메리",
    "country": {
      "zh": "韓國",
      "en": "Korea",
      "ko": "한국"
    },
    "tagline": "Quiet ornament for everyday.",
    "intro": {
      "zh": "韓國時尚配件品牌，做真絲長巾與純銀首飾。設計克制，靠比例與收邊說話 —— 是每天戴的東西，不是場合才拿出來的。",
      "en": "A Korean accessories label making silk scarves and sterling jewelry. The design is restrained and speaks through proportion and finish — things you wear daily, not only for occasions.",
      "ko": "실크 스카프와 실버 주얼리를 만드는 한국 액세서리 브랜드. 절제된 디자인으로 비율과 마감이 말을 합니다 — 특별한 날이 아니라 매일 착용하는 물건입니다."
    }
  }
]

export const categories = [
  {
    "key": "fragrance",
    "code": "FRAGRANCE",
    "ref": "FRG",
    "name": {
      "zh": "居家香氛",
      "en": "Home Fragrance",
      "ko": "홈 프래그런스"
    },
    "short": {
      "zh": "香氛",
      "en": "Fragrance",
      "ko": "프래그런스"
    },
    "cover": "/media/vuca/bedroom.jpg",
    "order": 1
  },
  {
    "key": "scarf",
    "code": "SCARF",
    "ref": "SLK",
    "name": {
      "zh": "真絲長巾",
      "en": "Silk Scarves",
      "ko": "실크 스카프"
    },
    "short": {
      "zh": "絲巾",
      "en": "Scarves",
      "ko": "스카프"
    },
    "cover": "/media/saintmari/scarf-camel-blazer.jpg",
    "order": 2
  },
  {
    "key": "jewelry",
    "code": "JEWELRY",
    "ref": "JWL",
    "name": {
      "zh": "純銀飾品",
      "en": "Sterling Jewelry",
      "ko": "실버 주얼리"
    },
    "short": {
      "zh": "飾品",
      "en": "Jewelry",
      "ko": "주얼리"
    },
    "cover": "/media/saintmari/necklace-01.png",
    "order": 3
  },
  {
    "key": "phonebag",
    "code": "PHONEBAG",
    "ref": "BAG",
    "name": {
      "zh": "手機包",
      "en": "Phone bags",
      "ko": "폰백"
    },
    "short": {
      "zh": "手機包",
      "en": "Phone bags",
      "ko": "폰백"
    },
    "cover": "",
    "order": 4
  }
]
