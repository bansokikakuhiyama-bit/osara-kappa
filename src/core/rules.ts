export const RULES = {
  tzOffsetMinutes: 540, // JST (+09:00)

  // 釣り確率：少年50% / 大人50%
  fishing: {
    boyRate: 0.5,
  },

  // 水やり
  // 今回仕様：
  // - 1時間クールダウンなし（いつでも何回でも水OK）
  // - freePerDay は「将来の制限やUI表示用」のメタ情報としてだけ保持
  water: {
    freePerDay: 10,
  },

  // ライフサイクル
  life: {
    // 寿命：3年
    lifespanDays: 365 * 3, // 1095日

    // 釣れた時点の年齢
    caughtBoyAgeDays: 365 * 1,   // 1歳
    caughtAdultAgeDays: 365 * 2, // 2歳

    // 子ども期間：30日 → 少年
    childToBoyDays: 30,

    // 少年→大人：年齢2歳到達で大人化
    boyToAdultAgeDays: 365 * 2, // 2歳到達で大人
  },

  // 死亡条件（水）
  death: {
    // 少年・大人：水を24h与えない→ぐったり、ぐったりから+6h→死亡
    // 水バー表示も「24hで100→0、そこから6hは0%のまま」のイメージで計算
    noWaterToGuttariMs: 24 * 60 * 60 * 1000,
    guttariToDeathMs: 6 * 60 * 60 * 1000,

    // 子ども：水を24h与えない→死亡
    childNoWaterDeathMs: 24 * 60 * 60 * 1000,

    // 子ども発熱：発生から10h以内に水が必要（間に合わないと死亡）
    feverDeadlineMs: 10 * 60 * 60 * 1000,
  },

  // 発熱抽選（子ども）
  fever: {
    lotteryDenominator: 30, // 1/30
    checkOncePerDay: true,
  },

  // ごはん（満腹度）
  food: {
    // デイリーログインボーナス：きゅうり3本支給
    loginBonusCucumbers: 3,

    // 与えられる条件：満腹度 < 70%
    feedThreshold: 70,

    // 与えると満腹度100
    satietyFull: 100,

    // 満腹度減衰：6時間で100→0（= 100/6 per hour）
    satietyDecayPerHour: 100 / 6,

    // 20%以下で赤バーにする閾値
    hungryRedThreshold: 20,
  },

  // バーの危険閾値（UIで赤にする）
  ui: {
    dangerThresholdPct: 20,
  },

  // ショップ（コイン消費）
  shop: {
    itemPriceCoins: 300,
    colorBonusOnBuy: 3,
  },
} as const;
