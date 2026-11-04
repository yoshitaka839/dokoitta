// 一日の流れ（日課）から、眼鏡を置いた場所を考える。
// 探す時刻と、眼鏡を置いた時刻はちがう。置いてから何時間もたってから探すこともあるので、
// 「今の時刻に何をしているか」ではなく「今日もう始まった日課のうち、いちばん最近のもの」の場所から探す。
// 場所が変わらない日課（外に出るときなど）は飛ばし、その前の日課の場所を見る。
// 一日の流れは暮らしがよく分かる情報なので、/settings で iPad の中にだけ保存する（公開リポジトリにはサンプルだけ）。

import { aliases, type Place } from "./places";

export type RoutineEntry = {
  minutes: number; // 0:00 からの分
  time: string; // 表示用「15:30」
  activity: string; // 読み上げる日課の名前（最初の一つ）
  placeName: string | null; // 場所が変わらない日課は null
};

// 1行: 「時刻 > 日課 > 場所」 例「12:00 > 昼ごはん > 台所」。場所に「そのまま」「変わらない」と書くと飛ばす
export const SAMPLE_ROUTINE_TEXT = `6:00 > 顔を洗う > 洗面所
7:00 > 朝ごはん > 台所
8:00 > 新聞 > 居間のテーブル
10:00 > 散歩 > そのまま（外に持って出ない）
12:00 > 昼ごはん > 台所
13:00 > 昼寝 > ソファ
15:00 > テレビ > テレビのそば
18:00 > 夕ごはん > 台所
21:00 > 寝る > 寝室の枕元`;

const KEEP = /そのまま|変わらない|かわらない|置いていく|置いて行く|持って出|外出|なし|^[-ー－]$/;

const toHalf = (s: string) =>
  s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/：/g, ":");
const stripParens = (s: string) => s.replace(/[（(][^）)]*[）)]/g, "").trim();

function parseTime(s: string): number | null {
  const t = toHalf(s).replace(/\s/g, "");
  const m = t.match(/^(\d{1,2})(?::|時)(\d{1,2})?分?$/) ?? t.match(/^(\d{1,2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// 場所の欄から、場所の名前を一つ決める。
// 登録した場所の名前（「居間」のような短い呼び方も）が書いてあればそれ、
// 「外なら変わらない、家なら居間のテーブル」のような書き方では、変わらない部分を飛ばして次を見る
function placeFromField(field: string, home: Place[]): string | null {
  const segments = stripParens(field).split(/[、,，。]/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    let best: { alias: string; place: Place } | null = null;
    for (const p of home) {
      for (const a of aliases(p)) if (seg.includes(a) && (!best || a.length > best.alias.length)) best = { alias: a, place: p };
    }
    if (best) return best.place.name;
    if (KEEP.test(seg)) continue;
    if (!/なら/.test(seg) && seg.length <= 15) return seg; // 新しい場所の名前として使う
  }
  return null;
}

export function parseRoutineText(text: string, home: Place[]): RoutineEntry[] {
  const out: RoutineEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [t, act, where] = line.split(/>|＞|→/).map((x) => (x ?? "").trim());
    const minutes = parseTime(t ?? "");
    if (minutes === null || !act) continue;
    // 「外出（場所は変わらない）または読書」のような書き方では、場所が変わる方の日課の名前を使う
    const alts = act.split(/または|もしくは/);
    const chosen = alts.find((x) => !KEEP.test(x)) ?? alts[0];
    const activity = stripParens(chosen).split(/[、,，]/)[0].replace(/など$/, "").trim().slice(0, 20);
    out.push({
      minutes,
      time: `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`,
      activity: activity || stripParens(act).slice(0, 20),
      placeName: where ? placeFromField(where, home) : null,
    });
  }
  return out.sort((a, b) => a.minutes - b.minutes).slice(0, 40);
}

// 日課に出てくるのに場所の一覧にない場所は、一覧の後ろに足す（確かめ方は「〜を見てください」）
export function withRoutinePlaces(home: Place[], routine: RoutineEntry[]): Place[] {
  const out = [...home];
  for (const r of routine) {
    if (!r.placeName || out.some((p) => p.name === r.placeName)) continue;
    out.push({ id: `r${out.length + 1}`, name: r.placeName, action: `${r.placeName}を見てください`, base: 20 });
  }
  return out;
}

// 今の時刻から見て、さかのぼった順の日課（今日もう始まったもの → 足りなければ前の日の夜へ）。
// 場所が変わらない日課は飛ばし、同じ場所は一度だけ
export function recentRoutine(routine: RoutineEntry[], now: Date): RoutineEntry[] {
  const m = now.getHours() * 60 + now.getMinutes();
  const today = routine.filter((r) => r.minutes <= m).reverse();
  const yesterday = routine.filter((r) => r.minutes > m).reverse();
  const seen = new Set<string>();
  const out: RoutineEntry[] = [];
  for (const r of [...today, ...yesterday]) {
    if (!r.placeName || seen.has(r.placeName)) continue;
    seen.add(r.placeName);
    out.push(r);
  }
  return out;
}

// 日課の名前を「〜のあと」「〜たあと」の形にする（「新聞」→「新聞のあと」、「顔を洗う」→「顔を洗ったあと」）
const PAST: [RegExp, string][] = [
  [/する$/, "した"], [/くる$/, "きた"], [/る$/, "た"], [/う$/, "った"], [/つ$/, "った"],
  [/く$/, "いた"], [/ぐ$/, "いだ"], [/す$/, "した"], [/[むぶぬ]$/, "んだ"],
];
export function afterPhrase(a: string): string {
  for (const [re, rep] of PAST) if (re.test(a)) return `${a.replace(re, rep)}あと`;
  return `${a}のあと`;
}

// 「テレビのあとなので、テレビのそばかもしれません」「寝たあとなので、〜」
export function routineReason(r: RoutineEntry): string {
  return `${afterPhrase(r.activity)}なので、${r.placeName}かもしれません`;
}

const KEY = "dokoitta-routine";

export function loadRoutineText(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveRoutineText(text: string | null) {
  try {
    if (text === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, text);
  } catch {
    /* 保存できない端末では使わない */
  }
}

// 場所をサンプルのまま使っているときだけサンプルの一日を使う（家の場所を保存したのに一日がサンプルだと食い違うため）
export function getRoutineText(usingSamplePlaces: boolean): string {
  const t = typeof window !== "undefined" ? loadRoutineText() : null;
  return t ?? (usingSamplePlaces ? SAMPLE_ROUTINE_TEXT : "");
}
