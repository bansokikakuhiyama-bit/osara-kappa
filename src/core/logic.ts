import type { CoreState, Result, CoreEvent, CatchCandidate, Kappa } from "./types";
import { RULES } from "./rules";
import { toGameDate } from "./time";
import type { Random } from "./random";

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function computeAgeDays(nowMs: number, bornAt: number): number {
  return Math.max(0, Math.floor((nowMs - bornAt) / DAY_MS));
}

export function createInitialState(nowMs: number): CoreState {
  const today = toGameDate(nowMs, RULES.tzOffsetMinutes);
  return {
    player: {
      coins: 0,
      waterCountToday: 0,
      feedCountToday: 0,
      adRewardCountToday: 0,
      lastDailyReset: today,

      // 通常きゅうり
      cucumbers: 0,
      lastLoginBonus: undefined,

      // ショップで買える高級ごはん在庫
      premiumCucumbers: 0,
      meats: 0,
      kois: 0,
      takuans: 0,

      // 色ポイント（購入時に該当色 +3）
      color: {
        green: 0,
        red: 0,
        blue: 0,
        yellow: 0,
      },

      // 卵獲得
      eggsTotal: 0,
    },
    kappa: null,
    caught: null,
  };
}

/**
 * 釣る：少年 or 大人（子どもは釣れない）
 * UI側はこの戻り値を「釣果確認画面」に出す
 */
export function rollCatch(
  rng: Random = { nextInt: (n: number) => Math.floor(Math.random() * n) } as any
): CatchCandidate {
  // rng を使って決定（テストや再現性のため）
  const hit = rng.nextInt(1000) < Math.round(RULES.fishing.boyRate * 1000);
  const stage: "boy" | "adult" = hit ? "boy" : "adult";
  const ageYears: 1 | 2 = stage === "boy" ? 1 : 2;
  return { stage, ageYears, lifespanYears: 3 };
}

/**
 * 釣果を state にセット（UIが状態管理したくない場合に利用）
 */
export function setCaught(state: CoreState, caught: CatchCandidate | null): CoreState {
  return { ...state, caught };
}

/**
 * 釣った河童を連れて帰る（育成開始）
 * - 少年：1歳（残り2年）
 * - 大人：2歳（残り1年）
 */
export function adoptCaught(state: CoreState, nowMs: number): Result<CoreState> {
  if (!state.caught) {
    return {
      ok: false,
      error: { code: "NOT_ALLOWED", message: "No caught candidate." },
      events: [],
    };
  }

  const ageDays =
    state.caught.stage === "boy"
      ? RULES.life.caughtBoyAgeDays
      : RULES.life.caughtAdultAgeDays;

  const bornAt = nowMs - ageDays * DAY_MS;

  const kappa: Kappa = {
    stage: state.caught.stage,
    health: "normal",
    pose: state.caught.stage === "adult" ? "stand" : "sit",
    bornAt,
    lastWaterAt: nowMs,
    guttariStartedAt: undefined,

    satiety: RULES.food.satietyFull,
    satietyUpdatedAt: nowMs,
    lastFeedAt: nowMs,

    fever: {
      isFever: false,
      feverStartedAt: undefined,
      feverCheckedDate: undefined,
    },

    imageState: "normal",
  };

  const next: CoreState = {
    ...state,
    kappa,
    caught: null,
  };

  return { ok: true, value: updateImageState(next), events: [] };
}

/**
 * リリース：釣果を破棄して釣りに戻る
 */
export function releaseCaught(state: CoreState): CoreState {
  return { ...state, caught: null };
}

function updateImageState(state: CoreState): CoreState {
  if (!state.kappa) return state;

  const k = state.kappa;
  let imageState = k.imageState;

  if (k.health === "dead") imageState = "dead";
  else if (k.health === "guttari") imageState = "guttari";
  else if (k.stage === "child") imageState = "child";
  else imageState = "normal";

  return { ...state, kappa: { ...k, imageState } };
}

/**
 * 1日跨ぎのカウントリセット＋ログインボーナス（きゅうり×3）
 */
export function applyDailyResetAndLoginBonusIfNeeded(
  state: CoreState,
  nowMs: number,
  tzOffsetMinutes: number = RULES.tzOffsetMinutes
): { state: CoreState; events: CoreEvent[] } {
  const today = toGameDate(nowMs, tzOffsetMinutes);
  const events: CoreEvent[] = [];

  let next = state;

  // 日次リセット
  if (state.player.lastDailyReset !== today) {
    next = {
      ...next,
      player: {
        ...next.player,
        waterCountToday: 0,
        feedCountToday: 0,
        adRewardCountToday: 0,
        lastDailyReset: today,
      },
    };
    events.push({ type: "DAILY_RESET" });
  }

  // ログインボーナス（1日1回）
  if (next.player.lastLoginBonus !== today) {
    next = {
      ...next,
      player: {
        ...next.player,
        cucumbers: next.player.cucumbers + RULES.food.loginBonusCucumbers,
        lastLoginBonus: today,
      },
    };
    events.push({
      type: "LOGIN_BONUS_CUCUMBER",
      amount: RULES.food.loginBonusCucumbers,
    });
  }

  return { state: next, events };
}

/**
 * 水やり（クールダウン無し：いつでも何回でもOK）
 */
export function applyWater(
  state: CoreState,
  nowMs: number,
  tzOffsetMinutes: number = RULES.tzOffsetMinutes
): Result<CoreState> {
  if (!state.kappa) {
    return {
      ok: false,
      error: { code: "NO_KAPPA", message: "No kappa in room." },
      events: [],
    };
  }
  if (state.kappa.health === "dead") {
    return {
      ok: false,
      error: { code: "ALREADY_DEAD", message: "Kappa is dead." },
      events: [],
    };
  }

  const next: CoreState = updateImageState({
    ...state,
    player: {
      ...state.player,
      waterCountToday: state.player.waterCountToday + 1,
    },
    kappa: {
      ...state.kappa,
      lastWaterAt: nowMs,
      // 水やりで fever / guttari 解除
      health: "normal",
      guttariStartedAt: undefined,
      fever: {
        ...state.kappa.fever,
        isFever: false,
        feverStartedAt: undefined,
      },
    },
  });

  return {
    ok: true,
    value: next,
    events: [{ type: "SE_KAPPA_CRY" }, { type: "WATER_APPLIED" }],
  };
}

/**
 * 内部共通：ごはん適用
 * - 在庫を1減らす（key指定）
 * - 満腹度を100に戻す
 */
function applyFeedCommon(
  state: CoreState,
  nowMs: number,
  stockKey: "cucumbers" | "premiumCucumbers" | "meats" | "kois" | "takuans"
): Result<CoreState> {
  if (!state.kappa) {
    return {
      ok: false,
      error: { code: "NO_KAPPA", message: "No kappa in room." },
      events: [],
    };
  }
  if (state.kappa.health === "dead") {
    return {
      ok: false,
      error: { code: "ALREADY_DEAD", message: "Kappa is dead." },
      events: [],
    };
  }

  const stock = state.player[stockKey];
  if (stock <= 0) {
    return {
      ok: false,
      error: { code: "NOT_ALLOWED", message: "在庫がありません。" },
      events: [],
    };
  }

  const sat = state.kappa.satiety;
  if (sat >= RULES.food.feedThreshold) {
    return {
      ok: false,
      error: {
        code: "NOT_ALLOWED",
        message:
          "河童はまだお腹が空いていないようです。空腹バーが７０％になったらご飯をあげられます。",
      },
      events: [],
    };
  }

  const next: CoreState = updateImageState({
    ...state,
    player: {
      ...state.player,
      [stockKey]: stock - 1,
      // 旧互換：使わないが残す（UIに残っててもOK）
      feedCountToday: state.player.feedCountToday + 1,
    },
    kappa: {
      ...state.kappa,
      satiety: RULES.food.satietyFull,
      satietyUpdatedAt: nowMs,
      lastFeedAt: nowMs,
    },
  });

  // 既存イベントを流用（UI側が必要なら後で拡張）
  return {
    ok: true,
    value: next,
    events: [
      { type: "SE_KAPPA_CRY" },
      {
        type: "FEED_APPLIED",
        cucumbersLeft: next.player.cucumbers,
        satiety: next.kappa!.satiety,
      },
    ],
  };
}

/** ごはん：きゅうり（通常） */
export function applyFeedCucumber(state: CoreState, nowMs: number): Result<CoreState> {
  return applyFeedCommon(state, nowMs, "cucumbers");
}

/** ごはん：高級きゅうり（緑） */
export function applyFeedPremiumCucumber(
  state: CoreState,
  nowMs: number
): Result<CoreState> {
  return applyFeedCommon(state, nowMs, "premiumCucumbers");
}

/** ごはん：肉（赤） */
export function applyFeedMeat(state: CoreState, nowMs: number): Result<CoreState> {
  return applyFeedCommon(state, nowMs, "meats");
}

/** ごはん：鯉（青） */
export function applyFeedKoi(state: CoreState, nowMs: number): Result<CoreState> {
  return applyFeedCommon(state, nowMs, "kois");
}

/** ごはん：たくあん（黄） */
export function applyFeedTakuan(state: CoreState, nowMs: number): Result<CoreState> {
  return applyFeedCommon(state, nowMs, "takuans");
}

/**
 * ショップ購入（コイン消費＋在庫+1 ＋ 色ポイント+3）
 * - 各商品 300コイン
 * - 買った瞬間に該当色 +3
 */
export function buyShopItem(
  state: CoreState,
  item: "premiumCucumber" | "meat" | "koi" | "takuan"
): Result<CoreState> {
  const price = RULES.shop.itemPriceCoins;
  const bonus = RULES.shop.colorBonusOnBuy;

  if (state.player.coins < price) {
    return {
      ok: false,
      error: { code: "NOT_ENOUGH_COINS", message: "コインが足りません。" },
      events: [],
    };
  }

  const nextPlayer = { ...state.player, coins: state.player.coins - price };

  if (item === "premiumCucumber") {
    nextPlayer.premiumCucumbers += 1;
    nextPlayer.color = { ...nextPlayer.color, green: nextPlayer.color.green + bonus };
  } else if (item === "meat") {
    nextPlayer.meats += 1;
    nextPlayer.color = { ...nextPlayer.color, red: nextPlayer.color.red + bonus };
  } else if (item === "koi") {
    nextPlayer.kois += 1;
    nextPlayer.color = { ...nextPlayer.color, blue: nextPlayer.color.blue + bonus };
  } else {
    nextPlayer.takuans += 1;
    nextPlayer.color = { ...nextPlayer.color, yellow: nextPlayer.color.yellow + bonus };
  }

  const next: CoreState = { ...state, player: nextPlayer };

  return { ok: true, value: next, events: [] };
}

/**
 * 満腹度減衰（tick用）
 * 仕様：6hで100→0になる線形減衰（RULES.food.satietyDecayPerHour = 100/6）
 */
function applySatietyDecay(state: CoreState, nowMs: number): CoreState {
  if (!state.kappa) return state;

  const k = state.kappa;
  const last = k.satietyUpdatedAt ?? nowMs;
  const dtMs = Math.max(0, nowMs - last);
  if (dtMs === 0) return state;

  const perMs = RULES.food.satietyDecayPerHour / (60 * 60 * 1000);
  const nextSatiety = clamp(k.satiety - dtMs * perMs, 0, 100);

  return {
    ...state,
    kappa: {
      ...k,
      satiety: nextSatiety,
      satietyUpdatedAt: nowMs,
    },
  };
}

/**
 * 子どもの発熱（1日1回抽選 / 1/30）
 */
export function applyFeverLotteryIfNeeded(
  state: CoreState,
  nowMs: number,
  rng: Random,
  tzOffsetMinutes: number = RULES.tzOffsetMinutes
): { state: CoreState; events: CoreEvent[] } {
  if (!state.kappa) return { state, events: [] };

  const k = state.kappa;
  if (k.stage !== "child") return { state, events: [] };
  if (k.health === "dead") return { state, events: [] };
  if (k.fever.isFever) return { state, events: [] };

  const today = toGameDate(nowMs, tzOffsetMinutes);
  if (k.fever.feverCheckedDate === today) return { state, events: [] };

  const hit = rng.nextInt(RULES.fever.lotteryDenominator) === 0;

  const nextKappa: Kappa = {
    ...k,
    fever: {
      ...k.fever,
      feverCheckedDate: today,
      isFever: hit,
      feverStartedAt: hit ? nowMs : undefined,
    },
  };

  return {
    state: updateImageState({ ...state, kappa: nextKappa }),
    events: hit ? [{ type: "FEVER_STARTED" }] : [],
  };
}

/**
 * 時間経過による評価（死亡・ぐったり・寿命・成長・脱皮・卵）
 * A案：死亡/寿命 → 卵GET → 即子ども誕生
 */
export function tickCore(
  state: CoreState,
  nowMs: number,
  rng: Random,
  tzOffsetMinutes: number = RULES.tzOffsetMinutes
): { state: CoreState; events: CoreEvent[] } {
  let s = state;
  const events: CoreEvent[] = [];

  // 日次リセット＋ログインボーナス
  {
    const r = applyDailyResetAndLoginBonusIfNeeded(s, nowMs, tzOffsetMinutes);
    s = r.state;
    events.push(...r.events);
  }

  // 満腹度減衰
  s = applySatietyDecay(s, nowMs);

  // 河童がいないならここで終わり
  if (!s.kappa) return { state: s, events };

  // 発熱抽選（子どものみ）
  {
    const r = applyFeverLotteryIfNeeded(s, nowMs, rng, tzOffsetMinutes);
    s = r.state;
    events.push(...r.events);
  }

  // 成長・脱皮・寿命
  {
    const k = s.kappa!;
    const ageDays = computeAgeDays(nowMs, k.bornAt);

    // 子ども→少年（30日）
    if (k.stage === "child" && ageDays >= RULES.life.childToBoyDays) {
      s = {
        ...s,
        kappa: {
          ...k,
          stage: "boy",
          pose: "sit",
        },
      };
    }

    // 少年→大人（年齢2歳到達）
    if (k.stage === "boy" && ageDays >= RULES.life.boyToAdultAgeDays) {
      s = {
        ...s,
        kappa: {
          ...k,
          stage: "adult",
          pose: "stand",
        },
      };
      events.push({ type: "MOLTED" });
    }

    // 寿命（3年）
    if (ageDays >= RULES.life.lifespanDays && k.health !== "dead") {
      events.push({ type: "DIED", reason: "lifespan_3y" });
      events.push({ type: "EGG_LAID", reason: "lifespan_3y" });

      s = hatchNewChild(s, nowMs);
      events.push({ type: "HATCHED" });
      return { state: updateImageState(s), events };
    }
  }

  // 死亡判定（水・発熱）
  {
    const k = s.kappa!;
    if (k.health === "dead") return { state: updateImageState(s), events };

    const lastWater = k.lastWaterAt ?? 0;

    // 子ども：水24hなしで死亡
    if (k.stage === "child") {
      if (!lastWater || nowMs - lastWater >= RULES.death.childNoWaterDeathMs) {
        events.push({ type: "DIED", reason: "child_no_water_24h" });
        events.push({ type: "EGG_LAID", reason: "child_no_water_24h" });
        s = hatchNewChild(s, nowMs);
        events.push({ type: "HATCHED" });
        return { state: updateImageState(s), events };
      }

      // 子ども発熱：10h以内に水がないと死亡
      if (k.fever.isFever && k.fever.feverStartedAt != null) {
        if (nowMs - k.fever.feverStartedAt >= RULES.death.feverDeadlineMs) {
          events.push({ type: "DIED", reason: "child_fever_no_water_10h" });
          events.push({ type: "EGG_LAID", reason: "child_fever_no_water_10h" });
          s = hatchNewChild(s, nowMs);
          events.push({ type: "HATCHED" });
          return { state: updateImageState(s), events };
        }
      }
    }

    // 少年・大人：水24hなし→ぐったり、+6h→死亡
    if (k.stage === "boy" || k.stage === "adult") {
      const noWaterMs = nowMs - lastWater;

      if (k.health === "normal" && noWaterMs >= RULES.death.noWaterToGuttariMs) {
        s = {
          ...s,
          kappa: {
            ...k,
            health: "guttari",
            guttariStartedAt: nowMs,
          },
        };
        events.push({ type: "GUTTARI_STARTED" });
        return { state: updateImageState(s), events };
      }

      if (k.health === "guttari" && k.guttariStartedAt != null) {
        if (nowMs - k.guttariStartedAt >= RULES.death.guttariToDeathMs) {
          events.push({ type: "DIED", reason: "boyadult_no_water_dead" });
          events.push({ type: "EGG_LAID", reason: "boyadult_no_water_dead" });
          s = hatchNewChild(s, nowMs);
          events.push({ type: "HATCHED" });
          return { state: updateImageState(s), events };
        }
      }
    }
  }

  return { state: updateImageState(s), events };
}

function hatchNewChild(state: CoreState, nowMs: number): CoreState {
  const today = toGameDate(nowMs, RULES.tzOffsetMinutes);

  const nextKappa: Kappa = {
    stage: "child",
    health: "normal",
    pose: "sit",
    bornAt: nowMs,

    lastWaterAt: nowMs,
    guttariStartedAt: undefined,

    satiety: RULES.food.satietyFull,
    satietyUpdatedAt: nowMs,
    lastFeedAt: nowMs,

    fever: {
      isFever: false,
      feverStartedAt: undefined,
      feverCheckedDate: undefined,
    },

    imageState: "child",
  };

  return {
    ...state,
    player: {
      ...state.player,
      eggsTotal: state.player.eggsTotal + 1,
      lastDailyReset: today,
    },
    kappa: nextKappa,
    caught: null,
  };
}

