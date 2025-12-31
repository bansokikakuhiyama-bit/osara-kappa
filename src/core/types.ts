export type KappaStage = "child" | "boy" | "adult";
export type KappaHealth = "normal" | "guttari" | "dead";

// 将来拡張（伏線）：画像差し替えしやすいように姿勢概念
export type KappaPose = "sit" | "stand" | "lay" | "bed_sit";

export type KappaImageState = "normal" | "child" | "guttari" | "dead";

export type ISODate = `${number}-${number}-${number}`; // YYYY-MM-DD

/**
 * 色ポイント（ショップ購入時に +3 するための受け皿）
 */
export interface ColorPoints {
  green: number;
  red: number;
  blue: number;
  yellow: number;
}

export interface Player {
  coins: number;

  // 旧UI互換
  waterCountToday: number;
  feedCountToday: number;

  lastDailyReset: ISODate;
  adRewardCountToday: number;

  // 通常ごはん
  cucumbers: number;
  lastLoginBonus?: ISODate;

  // 高級ごはん在庫
  premiumCucumbers: number;
  meats: number;
  kois: number;
  takuans: number;

  // 色ポイント
  color: ColorPoints;

  eggsTotal: number;
}

export interface FeverState {
  isFever: boolean;
  feverStartedAt?: number;
  feverCheckedDate?: ISODate;
}

export interface Kappa {
  stage: KappaStage;
  health: KappaHealth;
  pose: KappaPose;

  bornAt: number;

  lastWaterAt?: number;
  guttariStartedAt?: number;

  satiety: number;
  satietyUpdatedAt: number;
  lastFeedAt?: number;

  fever: FeverState;

  imageState: KappaImageState;
}

export interface CatchCandidate {
  stage: "boy" | "adult";
  ageYears: 1 | 2;
  lifespanYears: 3;
}

export type CoreEvent =
  | { type: "SE_KAPPA_CRY" }
  | { type: "WATER_APPLIED" }
  | { type: "FEED_APPLIED"; cucumbersLeft: number; satiety: number }
  | { type: "FEVER_STARTED" }
  | { type: "GUTTARI_STARTED" }
  | { type: "MOLTED" }
  | { type: "EGG_LAID"; reason: string }
  | { type: "HATCHED" }
  | { type: "DIED"; reason: string }
  | { type: "DAILY_RESET" }
  | { type: "LOGIN_BONUS_CUCUMBER"; amount: number };

export type CoreError =
  | { code: "COOLDOWN"; message: string }
  | { code: "LIMIT"; message: string }
  | { code: "NOT_ENOUGH_COINS"; message: string }
  | { code: "ALREADY_DEAD"; message: string }
  | { code: "NO_KAPPA"; message: string }
  | { code: "NOT_ALLOWED"; message: string }
  | { code: "NO_CUCUMBER"; message: string };

export type Result<T> =
  | { ok: true; value: T; events: CoreEvent[] }
  | { ok: false; error: CoreError; events: CoreEvent[] };

export interface CoreState {
  player: Player;
  kappa: Kappa | null;
  caught: CatchCandidate | null;
}


