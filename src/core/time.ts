import type { ISODate } from "./types";

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

/** offsetMinutes を加味した “ゲーム日(YYYY-MM-DD)” */
export function toGameDate(nowMs: number, offsetMinutes: number): ISODate {
  const d = new Date(nowMs + offsetMinutes * 60_000);
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  return `${y}-${m}-${day}` as ISODate;
}

/** offsetMinutes を加味した “その日の指定時刻” の epoch ms を返す */
export function atTimeOfGameDate(
  gameDate: ISODate,
  hour: number,
  minute: number,
  offsetMinutes: number
): number {
  const [y, m, d] = gameDate.split("-").map(Number);
  // gameDate の 00:00(UTC相当) を作って offset を引く（= ローカルに合わせる）
  const utcMs = Date.UTC(y, m - 1, d, hour, minute, 0, 0);
  return utcMs - offsetMinutes * 60_000;
}
