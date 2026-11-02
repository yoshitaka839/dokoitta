// 候補の順番をプログラムで決める。点数 = いつもの重み + 時間帯の加点 + 過去に見つかった回数の加点
import { PLACES, type Place, type TimeBand } from "./places";

export function timeBand(d = new Date()): TimeBand {
  const h = d.getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 16) return "noon";
  if (h >= 16 && h < 21) return "evening";
  return "night";
}

export type FoundCounts = Record<string, number>;

export function scorePlaces(found: FoundCounts = {}, band: TimeBand = timeBand()) {
  return PLACES.map((p: Place) => ({
    place: p,
    score: p.base + (p.bands?.[band] ?? 0) + Math.min(found[p.id] ?? 0, 5) * 12,
  })).sort((a, b) => {
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
