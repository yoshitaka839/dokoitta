// 確かめる順番と、各場所で言う一言を決める（画面や声とは切り離した純粋な処理）。仕様書 4章・5章。
// 1. 机の気づきにくい場所（2か所まで）: 目の前にあるのに気づかない、への助け。手でさわって確かめる
// 2. 体のまわり（頭の上・首元・ポケット）を1回の問いかけで
// 3. 置いた場所: 手がかり（話に出たら先頭へ）→ 一日の流れ（今日もう始まった日課のうち新しいものから最大3か所。
//    探す時刻と置いた時刻はちがうため。最初の場所だけ理由を言う）→ よく置く場所（4か所、記録で並べ替え）→ 残り
import { BODY_CHECK, aliases, findPlaceByName, type Activity, type Place } from "./places";
import { recentRoutine, routineReason, type RoutineEntry } from "./routine";

export { aliases };
import { foundAtSameTime, hourHit, mergeOrder, scorePlaces, type FoundCounts, type FoundHours } from "./rank";

// 「午前中」と「前の日の夕方から」の境目（0:00 からの分）
const MORNING_END = 12 * 60;
const EVENING_FROM = 15 * 60;

export type Step = { place: Place; reason: string };
export type RerankResult = { order: string[]; reason: string; source: "claude" | "program" };
export type Clue = { placeId: string; reason: string; by: "spoken" | "settings" | "claude" };


// 本人がその場で場所を言ったら、登録のつながりより優先する。
// 「〜じゃなくて」「〜ではなく」の前の場所は打ち消しなので数えない
export function matchSpokenPlace(text: string, home: Place[]): Clue | null {
  const t = text.replace(/\s+/g, "").replace(/[^、。]*?(じゃなくて|じゃなく|ではなくて|ではなく|でなくて|じゃない)/g, "");
  let best: { alias: string; place: Place } | null = null;
  for (const p of home) {
    for (const a of aliases(p)) {
      if (t.includes(a) && (!best || a.length > best.alias.length)) best = { alias: a, place: p };
    }
  }
  return best ? { placeId: best.place.id, reason: `${best.place.name}だったんですね`, by: "spoken" } : null;
}

// 眼鏡を探しているという言葉以外に、手がかりになりそうな話があるか
const FILLER = /眼鏡|めがね|メガネ|老眼鏡|どこ|ドコ|何処|行った|いった|置いた|おいた|やった|かな|かなぁ|かなあ|だろう|でしょう|知らない|ない|ある|ちょっと|困った|困ってる|んです|です|ます|ね|よ|の|に|が|は|を|へ|あれ|えー|あー|[\s、。？?！!ーぁ]/g;
export function hasClue(text: string): boolean {
  return text.replace(FILLER, "").length >= 3;
}

// 設定の「していたこと → 場所」と話を照らし合わせる。長い言葉の一致を優先
export function matchActivity(text: string, acts: Activity[], home: Place[]): Clue | null {
  const t = text.replace(/\s+/g, "");
  let best: { kw: string; place: Place } | null = null;
  for (const a of acts) {
    const place = findPlaceByName(home, a.placeName);
    if (!place) continue;
    for (const kw of a.keywords) {
      if (t.includes(kw) && (!best || kw.length > best.kw.length)) best = { kw, place };
    }
  }
  return best ? { placeId: best.place.id, reason: `${best.kw}なら、${best.place.name}かもしれません`, by: "settings" } : null;
}

// Claude の結果から手がかりの場所を一つ選ぶ（理由がないときは使わない）
export function clueFromRerank(rr: RerankResult | null, candidates: Place[]): Clue | null {
  if (!rr || rr.source !== "claude" || !rr.reason.trim()) return null;
  const ids = candidates.map((p) => p.id);
  const top = mergeOrder(rr.order, ids)[0];
  return top ? { placeId: top, reason: rr.reason.trim(), by: "claude" } : null;
}

// 探した記録をもとにした理由（「学習」ではなく、家族と本人が残した記録を順番に使う）
export function programReason(p: Place, found: FoundCounts, now: Date, hours: FoundHours = {}, useHours = true): string {
  const h = useHours ? hourHit(p, now) : null;
  if (h !== null) return `${h}時ごろなので、${p.name}かもしれません`;
  if (foundAtSameTime(p, hours, now)) return `前もこの時間に、${p.name}で見つかりました`;
  if ((found[p.name] ?? 0) > 0) return `前は${p.name}で見つかりました`;
  return "";
}

export function initialPlan(opts: {
  home: Place[];
  found: FoundCounts;
  now: Date;
  clue?: Clue | null;
  hours?: FoundHours;
  routine?: RoutineEntry[];
  desk?: Place[];
}): { first: Step[]; rest: Step[] } {
  const hasRoutine = !!opts.routine?.length;
  // 日課があるときは、場所の一覧の「怪しい時刻」は使わない（日課の時刻と食い違わないように）
  const useHours = !hasRoutine;
  const scored = scorePlaces(opts.home, opts.found, opts.now, opts.hours, useHours).map((s) => s.place);
  const cluePlace = opts.clue ? scored.find((p) => p.id === opts.clue!.placeId) : undefined;
  const step = (p: Place): Step => ({ place: p, reason: programReason(p, opts.found, opts.now, opts.hours, useHours) });

  const first: Step[] = [];
  if (cluePlace) first.push({ place: cluePlace, reason: opts.clue!.reason });
  for (const d of opts.desk ?? []) first.push({ place: d, reason: "" });
  first.push({ place: BODY_CHECK, reason: "" });
  const used = new Set<Place>(cluePlace ? [cluePlace] : []);
  if (hasRoutine) {
    const recent = recentRoutine(opts.routine!, opts.now)
      .map((r) => ({ r, place: scored.find((p) => p.name === r.placeName) }))
      .filter((x): x is { r: RoutineEntry; place: Place } => !!x.place && !used.has(x.place))
      .slice(0, 3);
    recent.forEach((x, i) => {
      used.add(x.place);
      first.push({ place: x.place, reason: i === 0 ? routineReason(x.r) : "" });
    });
    // 午前中は、前の日の夕方から夜の日課の場所も早めに見る（前の日に置いたまま、次の日に探すことがあるため）。新しい日課から
    const m = opts.now.getHours() * 60 + opts.now.getMinutes();
    if (m < MORNING_END) {
      for (const r of [...opts.routine!].reverse()) {
        if (r.minutes < EVENING_FROM || r.minutes <= m || !r.placeName) continue;
        const place = scored.find((p) => p.name === r.placeName);
        if (!place || used.has(place)) continue;
        used.add(place);
        first.push({ place, reason: "" });
      }
    }
  }
  const others = scored.filter((p) => !used.has(p));
  first.push(...others.filter((p) => p.main).map(step));
  return { first, rest: others.filter((p) => !p.main).map(step) };
}

// 途中で手がかりが出たとき、その場所を（残りのどこにあっても）先頭に移す
export function moveToFront(queue: Step[], rest: Step[], clue: Clue): { queue: Step[]; rest: Step[] } {
  const pick = [...queue, ...rest].find((s) => s.place.id === clue.placeId);
  if (!pick) return { queue, rest };
  return {
    queue: [{ place: pick.place, reason: clue.reason }, ...queue.filter((s) => s !== pick)],
    rest: rest.filter((s) => s !== pick),
  };
}

// 各場所の問いかけの文。一度に言うのは一か所だけ、短く。
// 最初の一回だけ「見つかったら、教えてください。」をそえる（答えの言葉そのものは言わせない）
export function question(opts: { step: Step; explain: boolean }): string {
  const parts: string[] = [];
  if (opts.step.reason) parts.push(`${opts.step.reason}。`);
  parts.push(`${opts.step.place.action}。`);
  if (opts.explain) parts.push("見つかったら、教えてください。");
  return parts.join("");
}
