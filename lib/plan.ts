// 確かめる順番と、各場所で最初に言う一言を決める（画面や声とは切り離した純粋な処理）。
// ・体まわり（頭の上・首元・服のポケット）はいつも先、順番も固定
// ・家の中の場所はプログラムの点数順。本人の話に手がかりがあり、Claude が理由つきで
//   並べ替えたときだけ、その順番を使う
// ・理由の一言は「Claude の理由」→「怪しい時刻」→「前に見つかった」の順に選ぶ

import type { Place } from "./places";
import { hourHit, mergeOrder, type FoundCounts } from "./rank";

export type RerankResult = { order: string[]; reason: string; source: "claude" | "program" };

// 眼鏡を探しているという言葉以外に、手がかりになりそうな話があるか
const FILLER = /眼鏡|めがね|メガネ|老眼鏡|どこ|ドコ|何処|行った|いった|置いた|おいた|やった|かな|かなぁ|かなあ|だろう|でしょう|知らない|ない|ある|ちょっと|困った|困ってる|んです|です|ます|ね|よ|の|に|が|は|を|へ|あれ|えー|あー|[\s、。？?！!ーぁ]/g;
export function hasClue(text: string): boolean {
  return text.replace(FILLER, "").length >= 3;
}

export function splitPlaces(order: Place[]) {
  return { body: order.filter((p) => p.body), home: order.filter((p) => !p.body) };
}

// プログラムの順番と Claude の結果から、家の中の順番を決める
export function homeOrder(programHome: Place[], rr: RerankResult | null): { ids: string[]; claudeReason: string } {
  const ids = programHome.map((p) => p.id);
  if (!rr || rr.source !== "claude" || !rr.reason.trim()) return { ids, claudeReason: "" };
  return { ids: mergeOrder(rr.order, ids), claudeReason: rr.reason.trim() };
}

export function programReason(p: Place, found: FoundCounts, now: Date): string {
  const h = hourHit(p, now);
  if (h !== null) return `${h}時ごろなので、${p.name}かもしれません`;
  if ((found[p.name] ?? 0) > 0) return `前にも${p.name}で見つかっています`;
  return "";
}

// 各場所の問いかけの文
export function question(opts: {
  place: Place;
  index: number; // 全体で何番目か（0から）
  firstHome: boolean; // 体まわりのあと、家の中で最初の場所か
  reason: string;
}): string {
  const parts: string[] = [];
  if (opts.firstHome && opts.index > 0) parts.push("体のまわりにはなかったですね。");
  if (opts.reason) parts.push(`${opts.reason}。`);
  parts.push(`${opts.index === 0 ? "まず、" : ""}${opts.place.action}。ありましたか？`);
  return parts.join("");
}
