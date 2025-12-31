import "./style.css";
import type { CoreState, CatchCandidate } from "./core";
import {
  RULES,
  createInitialState,
  rollCatch,
  setCaught,
  adoptCaught,
  releaseCaught,
  tickCore,
  applyWater,
  applyFeedCucumber,
} from "./core";
import { defaultRandom } from "./core";

/* ============================
   Utils
============================ */
const nowMs = () => Date.now();

function qs<T extends HTMLElement>(sel: string): T {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`Element not found: ${sel}`);
  return el as T;
}

function fmtDateTime(ms: number) {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}:${ss}`;
}

/* ============================
   Screen control
============================ */
type ScreenId = "screen-fishing" | "screen-catch" | "screen-room";

function setActiveScreen(id: ScreenId) {
  (["screen-fishing", "screen-catch", "screen-room"] as ScreenId[]).forEach((s) => {
    qs(`#${s}`).classList.toggle("is-active", s === id);
  });
}

/* ============================
   Modal
============================ */
function toggleModal(id: string, show: boolean) {
  qs<HTMLElement>(`#${id}`).classList.toggle("is-hidden", !show);
}

/* ============================
   Audio
============================ */
const sfx = {
  water: new Audio("/assets/sfx_water.mp3"),
  feed: new Audio("/assets/sfx_feed.mp3"),
  voice: new Audio("/assets/kappa_voice.mp3"),
};

async function playSfx(key: keyof typeof sfx) {
  const a = sfx[key];
  try {
    a.currentTime = 0;
    await a.play();
  } catch {}
}

// 撫で声（画像にリンク）
type PetStageKey = "adult" | "boy" | "baby";
type PetMood = "happy" | "angry";

const petVoice: Record<PetStageKey, Record<PetMood, HTMLAudioElement>> = {
  adult: {
    happy: new Audio("/assets/kappa_adult_happy.mp3"),
    angry: new Audio("/assets/kappa_adult_angry.mp3"),
  },
  boy: {
    happy: new Audio("/assets/kappa_boy_happy.mp3"),
    angry: new Audio("/assets/kappa_boy_angry.mp3"),
  },
  baby: {
    happy: new Audio("/assets/kappa_baby_happy.mp3"),
    angry: new Audio("/assets/kappa_baby_angry.mp3"),
  },
};

async function playPetVoice(stage: PetStageKey, mood: PetMood) {
  const a = petVoice[stage][mood];
  try {
    a.pause();
    a.currentTime = 0;
    await a.play();
  } catch {}
}

/* ============================
   Save / Load (localStorage)
============================ */
// 端末ごとの保存（同じ端末・同じブラウザなら続きから）
const STORAGE_KEY = "osara-kappa:state:v1";

function safeJsonParse<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function isProbablyCoreState(x: any): x is CoreState {
  // 厳密検証はしない（壊れたデータだけ弾く）
  if (!x || typeof x !== "object") return false;
  if (!x.player || typeof x.player !== "object") return false;
  if (typeof x.player.coins !== "number") return false;
  if (!("kappa" in x)) return false;
  if (!("caught" in x)) return false;
  return true;
}

function loadState(): CoreState | null {
  const json = localStorage.getItem(STORAGE_KEY);
  if (!json) return null;
  const parsed = safeJsonParse<CoreState>(json);
  if (!parsed || !isProbablyCoreState(parsed)) return null;
  return parsed;
}

let lastSavedJson = "";
let lastSaveAt = 0;
let saveTimerId: number | null = null;

function saveStateNow() {
  try {
    const json = JSON.stringify(state);
    if (json === lastSavedJson) return;
    lastSavedJson = json;
    lastSaveAt = Date.now();
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // 保存失敗してもゲーム進行は止めない
  }
}

// 連打で毎回保存しないように軽く間引く
function scheduleSave() {
  const now = Date.now();
  const MIN_INTERVAL_MS = 1500;

  if (now - lastSaveAt < MIN_INTERVAL_MS) {
    if (saveTimerId != null) return;
    saveTimerId = window.setTimeout(() => {
      saveTimerId = null;
      saveStateNow();
    }, MIN_INTERVAL_MS - (now - lastSaveAt));
    return;
  }
  saveStateNow();
}

/* ============================
   State
============================ */
let state: CoreState = loadState() ?? createInitialState(nowMs());

/* ============================
   DOM refs
============================ */
const el = {
  btnFish: qs<HTMLButtonElement>("#btn-fish"),
  btnAdopt: qs<HTMLButtonElement>("#btn-adopt"),
  btnRelease: qs<HTMLButtonElement>("#btn-release"),

  caughtImg: qs<HTMLImageElement>("#caught-kappa-img"),
  caughtText: qs<HTMLElement>("#caught-text"),
  caughtMeta: qs<HTMLElement>("#caught-meta"),

  coinAmount: qs<HTMLElement>("#coin-amount"),
  hudAge: qs<HTMLElement>("#hud-age"),

  barWater: qs<HTMLElement>("#bar-water"),
  barFood: qs<HTMLElement>("#bar-food"),
  pctWater: qs<HTMLElement>("#water-percent"),
  pctFood: qs<HTMLElement>("#food-percent"),

  kappaImg: qs<HTMLImageElement>("#kappa-img"),

  btnWater: qs<HTMLButtonElement>("#btn-water"),
  btnFeed: qs<HTMLButtonElement>("#btn-feed"),

  btnShop: qs<HTMLButtonElement>("#btn-shop"),
  btnReward: qs<HTMLButtonElement>("#btn-reward"),
  btnRules: qs<HTMLButtonElement>("#btn-rules"),
  btnStatus: qs<HTMLButtonElement>("#btn-status"),

  btnCloseFood: qs<HTMLButtonElement>("#btn-close-food"),
  foodButtons: Array.from(document.querySelectorAll<HTMLButtonElement>(".food-item")),

  // shop
  btnBuyCoins: qs<HTMLButtonElement>("#btn-buy-coins"),
  shopCoinSection: qs<HTMLElement>("#shop-coin-section"),
  shopBuyItems: Array.from(document.querySelectorAll<HTMLButtonElement>(".buy-item")),
  shopBuyCoinButtons: Array.from(document.querySelectorAll<HTMLButtonElement>(".buy-coin")),
  btnWatchAd: qs<HTMLButtonElement>("#btn-watch-ad"),

  // status modal fields
  statusAge: qs<HTMLElement>("#status-age"),
  statusStage: qs<HTMLElement>("#status-stage"),
  statusCondition: qs<HTMLElement>("#status-condition"),
  statusFever: qs<HTMLElement>("#status-fever"),
  statusLastWater: qs<HTMLElement>("#status-last-water"),
  statusLastFood: qs<HTMLElement>("#status-last-food"),

  // food counts
  foodCucumberCount: qs<HTMLElement>("#food-cucumber-count"),
  foodPremiumCucumberCount: qs<HTMLElement>("#food-premium-cucumber-count"),
  foodMeatCount: qs<HTMLElement>("#food-meat-count"),
  foodKoiCount: qs<HTMLElement>("#food-koi-count"),
  foodTakuanCount: qs<HTMLElement>("#food-takuan-count"),
};

/* ============================
   Inventory helpers
============================ */
type FoodKey = "cucumber" | "premiumCucumber" | "meat" | "koi" | "takuan";

function ensureFoods(s: CoreState): Record<FoodKey, number> {
  const p: any = s.player as any;
  if (!p.foods) {
    p.foods = { cucumber: 0, premiumCucumber: 0, meat: 0, koi: 0, takuan: 0 };
  } else {
    p.foods.cucumber ??= 0;
    p.foods.premiumCucumber ??= 0;
    p.foods.meat ??= 0;
    p.foods.koi ??= 0;
    p.foods.takuan ??= 0;
  }
  return p.foods as Record<FoodKey, number>;
}

function updateFoodCountsUI(s: CoreState) {
  const foods = ensureFoods(s);
  el.foodCucumberCount.textContent = String(foods.cucumber);
  el.foodPremiumCucumberCount.textContent = String(foods.premiumCucumber);
  el.foodMeatCount.textContent = String(foods.meat);
  el.foodKoiCount.textContent = String(foods.koi);
  el.foodTakuanCount.textContent = String(foods.takuan);
}

/* ============================
   Kappa image helpers (petting)
============================ */
function getPetStageKeyFromCoreStage(stage: any): PetStageKey {
  if (stage === "adult") return "adult";
  if (stage === "boy") return "boy";
  // core の child を「赤ちゃん」として扱う
  return "baby";
}

function computeWaterPct(s: CoreState, now: number) {
  if (!s.kappa) return 0;
  const baseNow = now;
  const last = s.kappa.lastWaterAt ?? baseNow;
  const pct = Math.round((1 - (baseNow - last) / RULES.death.noWaterToGuttariMs) * 100);
  return Math.max(0, Math.min(100, pct));
}

function petAssets(stageKey: PetStageKey) {
  if (stageKey === "adult") {
    return {
      normal: "/assets/kappa_adult.webp",
      dying: "/assets/kappa_adult_dying.webp",
      happy: "/assets/kappa_adult_happy.webp",
      angry: "/assets/kappa_adult_angry.webp",
    };
  }
  if (stageKey === "boy") {
    return {
      normal: "/assets/kappa_boy.webp",
      dying: "/assets/kappa_boy_dying.webp",
      happy: "/assets/kappa_boy_happy.webp",
      angry: "/assets/kappa_boy_angry.webp",
    };
  }
  return {
    normal: "/assets/kappa_baby.webp",
    dying: "/assets/kappa_baby_dying.webp",
    happy: "/assets/kappa_baby_happy.webp",
    angry: "/assets/kappa_baby_angry.webp",
  };
}

// 3秒切り替え中に tick が通常画像で上書きしないようにする
let kappaImgOverride: { src: string; revertAt: number; timerId: number | null } = {
  src: "",
  revertAt: 0,
  timerId: null,
};

function isOverrideActive(now: number) {
  return kappaImgOverride.src && now < kappaImgOverride.revertAt;
}

function clearOverride() {
  if (kappaImgOverride.timerId != null) {
    window.clearTimeout(kappaImgOverride.timerId);
  }
  kappaImgOverride = { src: "", revertAt: 0, timerId: null };
}

// ✅ 追加：happy/angryの見た目クラスを付けたまま3秒固定で戻す（撫でも水も共通で使う）
function applyKappaReaction(src: string, ms: number, opts: { mood?: PetMood } = {}) {
  if (!state.kappa) return;

  const mood = opts.mood ?? "happy";

  // 既存タイマーを潰して、今回の指定時間に更新
  clearOverride();

  // 見た目クラス
  el.kappaImg.classList.remove("is-shake", "is-fade-out");

  if (mood === "angry") {
    // 怒り：震え
    el.kappaImg.classList.add("is-shake");
  } else {
    // happy：フェードで切替（CSS側で is-fade-out の opacity を定義済み前提）
    el.kappaImg.classList.add("is-fade-out");
    // 1フレーム後に画像変更 → フェードイン
    requestAnimationFrame(() => {
      el.kappaImg.src = src;
      el.kappaImg.classList.remove("is-fade-out");
    });
  }

  // 画像切替（angryは即、happyは上のrequestAnimationFrameで）
  if (mood === "angry") {
    el.kappaImg.src = src;
  }

  const now = nowMs();
  kappaImgOverride.src = src;
  kappaImgOverride.revertAt = now + ms;

  // ms後に元画像へ
  kappaImgOverride.timerId = window.setTimeout(() => {
    const stageKey = getPetStageKeyFromCoreStage((state.kappa as any).stage);
    const assets = petAssets(stageKey);
    const waterPct = computeWaterPct(state, nowMs());
    const base = waterPct < 10 ? assets.dying : assets.normal;

    clearOverride();
    el.kappaImg.classList.remove("is-shake", "is-fade-out");
    el.kappaImg.src = base;
  }, ms);
}

async function petKappa() {
  if (!state.kappa) return;

  const stageKey = getPetStageKeyFromCoreStage((state.kappa as any).stage);
  const assets = petAssets(stageKey);

  const mood: PetMood = Math.random() < 0.5 ? "happy" : "angry";
  const nextSrc = mood === "happy" ? assets.happy : assets.angry;

  // 3秒固定（tickで上書きされない）
  applyKappaReaction(nextSrc, 3000, { mood });

  // 声再生（画像にリンク）
  void playPetVoice(stageKey, mood);
}

/* ============================
   Helpers
============================ */
function ageLabel(s: CoreState, now: number) {
  if (!s.kappa) return "--";
  const days = Math.floor((now - s.kappa.bornAt) / 86400000);
  return `${Math.floor(days / 365)}歳${Math.floor((days % 365) / 30)}ヵ月`;
}

function caughtImgFor(c: CatchCandidate) {
  return c.stage === "boy" ? "/assets/kappa_boy.webp" : "/assets/kappa_adult.webp";
}

function normalKappaImage(s: CoreState, waterPct: number) {
  if (!s.kappa) return "";

  const stageKey = getPetStageKeyFromCoreStage((s.kappa as any).stage);
  const assets = petAssets(stageKey);

  if (waterPct < 10) return assets.dying;
  return assets.normal;
}

function stageLabel(stage: any) {
  if (stage === "child") return "子供";
  if (stage === "boy") return "少年";
  if (stage === "adult") return "大人";
  return "--";
}

/* ============================
   Rendering
============================ */
function renderCatch(c: CatchCandidate) {
  el.caughtImg.src = caughtImgFor(c);
  el.caughtText.textContent = c.stage === "boy" ? "少年の河童が釣れた！" : "大人の河童が釣れた！";
  el.caughtMeta.textContent = `年齢：${c.ageYears}歳 / 寿命：${c.lifespanYears}年`;
}

function renderRoom(s: CoreState) {
  const now = nowMs();

  el.coinAmount.textContent = String(s.player.coins);
  el.hudAge.textContent = ageLabel(s, now);

  if (!s.kappa) return;

  const waterPct = computeWaterPct(s, now);
  const foodPct = Math.round(s.kappa.satiety);

  el.barWater.style.width = `${waterPct}%`;
  el.barFood.style.width = `${foodPct}%`;

  el.pctWater.textContent = `${waterPct}%`;
  el.pctFood.textContent = `${foodPct}%`;

  // 3秒切替中は上書きしない
  if (!isOverrideActive(now)) {
    el.kappaImg.classList.remove("is-shake", "is-fade-out");
    el.kappaImg.src = normalKappaImage(s, waterPct);
  }

  updateFoodCountsUI(s);
}

function renderStatusModal(s: CoreState) {
  const now = nowMs();
  el.statusAge.textContent = ageLabel(s, now);

  if (!s.kappa) {
    el.statusStage.textContent = "--";
    el.statusCondition.textContent = "--";
    el.statusFever.textContent = "--";
    el.statusLastWater.textContent = "--";
    el.statusLastFood.textContent = "--";
    return;
  }

  el.statusStage.textContent = stageLabel(s.kappa.stage);

  el.statusCondition.textContent = "元気";
  el.statusFever.textContent = "平熱";

  el.statusLastWater.textContent = s.kappa.lastWaterAt ? fmtDateTime(s.kappa.lastWaterAt) : "--";
  const lastFoodAt = (s.kappa as any).lastFoodAt as number | undefined;
  el.statusLastFood.textContent = lastFoodAt ? fmtDateTime(lastFoodAt) : "--";
}

/* ============================
   Happy animation (water/feed)
============================ */
async function showHappy() {
  if (!state.kappa) return;

  // ✅ stage別に happy を出す（childはbaby扱い）
  const stageKey = getPetStageKeyFromCoreStage((state.kappa as any).stage);
  const assets = petAssets(stageKey);

  // ✅ ここがポイント：音声の長さに依存せず「3秒固定」で表示
  applyKappaReaction(assets.happy, 3000, { mood: "happy" });

  // voiceは従来のまま（再生できなくても3秒表示は維持）
  void playSfx("voice");
}

/* ============================
   Tick
============================ */
function tick() {
  const r = tickCore(state, nowMs(), defaultRandom, RULES.tzOffsetMinutes);
  state = r.state;

  if (state.caught) {
    renderCatch(state.caught);
    setActiveScreen("screen-catch");
  } else if (state.kappa) {
    renderRoom(state);
    setActiveScreen("screen-room");
  } else {
    setActiveScreen("screen-fishing");
  }

  // ✅ 追加：毎tick後に保存（間引きあり）
  scheduleSave();
}

/* ============================
   Purchase / reward
============================ */
function addCoins(n: number) {
  state.player.coins += n;
  tick();
}

function trySpendCoins(cost: number) {
  if (state.player.coins < cost) return false;
  state.player.coins -= cost;
  return true;
}

function buyFood(item: FoodKey, cost: number) {
  if (!trySpendCoins(cost)) {
    alert("コインが足りません");
    return;
  }
  const foods = ensureFoods(state);
  foods[item] += 1;
  tick();
}

/* ============================
   Events
============================ */
function bindEvents() {
  el.btnFish.onclick = () => {
    state = setCaught(state, rollCatch(defaultRandom));
    tick();
  };

  el.btnRelease.onclick = () => {
    state = releaseCaught(state);
    tick();
  };

  el.btnAdopt.onclick = () => {
    const r = adoptCaught(state, nowMs());
    if (!r.ok) return alert(r.error.message);

    state = r.value;

    const foods = ensureFoods(state);
    foods.cucumber += 3;

    tick();
  };

  el.btnWater.onclick = async () => {
    const r = applyWater(state, nowMs(), RULES.tzOffsetMinutes);
    if (!r.ok) return alert(r.error.message);
    state = r.value;

    await playSfx("water");

    // ✅ ここ：3秒固定のhappy（tickで上書きされない）
    await showHappy();

    tick();
  };

  el.btnFeed.onclick = () => {
    updateFoodCountsUI(state);
    toggleModal("modal-food", true);
  };
  el.btnCloseFood.onclick = () => toggleModal("modal-food", false);

  el.foodButtons.forEach((btn) => {
    btn.onclick = async () => {
      const food = btn.dataset.food;

      if (food === "cucumber") {
        const r = applyFeedCucumber(state, nowMs());
        if (!r.ok) return alert(r.error.message);
        state = r.value;
        await playSfx("feed");
        await showHappy();
        toggleModal("modal-food", false);
        tick();
        return;
      }

      const foods = ensureFoods(state);
      const key = food as FoodKey;
      if (!foods[key] || foods[key] <= 0) return alert("在庫がありません");

      foods[key] -= 1;
      await playSfx("feed");
      await showHappy();
      toggleModal("modal-food", false);
      tick();
    };
  });

  // 撫で（クリック/タップ）
  el.kappaImg.addEventListener("click", () => {
    void petKappa();
  });

  el.btnShop.onclick = () => toggleModal("modal-shop", true);
  el.btnRules.onclick = () => toggleModal("modal-rules", true);

  el.btnStatus.onclick = () => {
    renderStatusModal(state);
    toggleModal("modal-status", true);
  };

  el.btnReward.onclick = () => addCoins(100);
  el.btnWatchAd.onclick = () => addCoins(100);

  el.shopBuyItems.forEach((btn) => {
    btn.onclick = () => {
      const item = btn.dataset.item;
      if (!item) return;

      if (item === "premiumCucumber") return buyFood("premiumCucumber", 300);
      if (item === "meat") return buyFood("meat", 300);
      if (item === "takuan") return buyFood("takuan", 300);
      if (item === "carp") return buyFood("koi", 300);

      alert("未対応のアイテムです");
    };
  });

  el.btnBuyCoins.onclick = () => {
    el.shopCoinSection.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  el.shopBuyCoinButtons.forEach((btn) => {
    btn.onclick = () => {
      const coins = Number(btn.dataset.coins ?? "0");
      if (!coins) return;
      addCoins(coins);
      alert(`（ダミー）${coins}コインを追加しました`);
    };
  });

  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.dataset?.close === "modal") {
      t.closest(".modal")?.classList.add("is-hidden");
    }
  });

  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const iconBtn = t.closest(".modal .icon-btn") as HTMLElement | null;
    if (!iconBtn) return;

    const modal = iconBtn.closest(".modal") as HTMLElement | null;
    if (!modal) return;

    modal.classList.add("is-hidden");
  });
}

/* ============================
   Boot
============================ */
bindEvents();
tick();
setInterval(tick, 1000);

// ✅ 追加：タブ閉じる/更新の瞬間にも保存（取りこぼし防止）
window.addEventListener("beforeunload", () => {
  saveStateNow();
});







