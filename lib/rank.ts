// 候補の順番をプログラムで決める。
// 点数 = いつもの重み + 時間帯の加点 + 怪しい時刻の加点 + 過去に見つかった回数の加点
import type { Place, TimeBand } from "./places";

export function timeBand(d = new Date()): TimeBand {
  const h = d.getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 16) return "noon";
  if (h >= 16 && h < 21) return "evening";
  return "night";
}

export type FoundCounts = Record<string, number>; // 場所の名前 → 見つかった回数

// 怪しい時刻の前後1時間にいれば、その時刻を返す
export function hourHit(p: Place, now: Date): number | null {
  if (!p.hours) return null;
  const h = now.getHours() + now.getMinutes() / 60;
  for (const target of p.hours) {
    const diff = Math.min(Math.abs(h - target), 24 - Math.abs(h - target));
    if (diff <= 1) return target;
  }
  return null;
}

function hourBonus(p: Place, now: Date): number {
  if (!p.hours) return 0;
  const h = now.getHours() + now.getMinutes() / 60;
  let best = 0;
  for (const target of p.hours) {
    const diff = Math.min(Math.abs(h - target), 24 - Math.abs(h - target));
    if (diff <= 1) best = Math.max(best, 40);
    else if (diff <= 2) best = Math.max(best, 20);
  }
  return best;
}

export type FoundHours = Record<string, number[]>; // 場所の名前 → 見つかった時刻（時）の一覧

// 前にも今と同じくらいの時刻（前後1時間半）に見つかったことがあるか
export function foundAtSameTime(p: Place, hours: FoundHours, now: Date): boolean {
  const h = now.getHours() + now.getMinutes() / 60;
  return (hours[p.name] ?? []).some((x) => Math.min(Math.abs(h - x), 24 - Math.abs(h - x)) <= 1.5);
}

export function scorePlaces(places: Place[], found: FoundCounts = {}, now = new Date(), hours: FoundHours = {}, useHours = true) {
  const band = timeBand(now);
  return places
    .map((p) => ({
      place: p,
      score:
        p.base +
        (p.bands?.[band] ?? 0) +
        (useHours ? hourBonus(p, now) : 0) +
        Math.min(found[p.name] ?? 0, 5) * 12 +
        (foundAtSameTime(p, hours, now) ? 25 : 0),
    }))
    .sort((a, b) => {
      // 体まわりは常に先（いちばん手軽に確かめられるため）
      if (!!a.place.body !== !!b.place.body) return a.place.body ? -1 : 1;
      return b.score - a.score;
    });
}

// Claude が返した順番を受け取り、候補にないIDを捨て、抜けたIDをプログラムの順で後ろに足す
export function mergeOrder(proposed: string[], programOrder: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of proposed) {
    if (programOrder.includes(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of programOrder) if (!seen.has(id)) out.push(id);
  return out;
}
