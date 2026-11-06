// 一日の流れ（日課）から、眼鏡を置いた場所を考える。
// 探す時刻と、眼鏡を置いた時刻はちがう。置いてから何時間もたってから探すこともあるので、
// 「今の時刻に何をしているか」ではなく「今日もう始まった日課のうち、いちばん最近のもの」の場所から探す。
// 場所が変わらない日課（外に出るときなど）は飛ばし、その前の日課の場所を見る。
// 一日の流れは暮らしがよく分かる情報なので、/settings で iPad の中にだけ保存する（公開リポジトリにはサンプルだけ）。

import { aliases, findPlaceByName, type Activity, type Place } from "./places";

export type RoutineEntry = {
  minutes: number; // 0:00 からの分
  time: string; // 表示用「12:30」
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

// 「置きっぱなし」の「なし」で場所の欄を捨ててしまわないよう、「なし」は欄全体のときだけ
const KEEP = /そのまま|変わらない|かわらない|置いていく|置いて行く|持って出|外出|^なし$|^[-ー－]$/;
// 「物置の棚に置きっぱなし」「物置の棚の上に置いたまま」のように動きの言葉が続くときは、その前を場所の名前とする
const PLACE_THEN_VERB = /^(.+?)(?:に|で|へ)(?:置|おい|おく|おき|ある|あり|しま|入れ|いれ)/;

const toHalf = (s: string) =>
  s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/：/g, ":");
const stripParens = (s: string) => s.replace(/[（(][^）)]*[）)]/g, "").trim();

function parseTime(s: string): number | null {
  // 「16:30〜17:00」のような幅は始まりの時刻だけ、「16時半」は30分として読む
  const t = toHalf(s).replace(/\s/g, "").replace(/[〜~～\-－].*$/, "").replace(/時半$/, "時30分");
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
    const cut = seg.match(PLACE_THEN_VERB)?.[1]?.trim();
    const name = cut && !/なら/.test(cut) ? cut : seg;
    if (KEEP.test(name)) continue;
    if (!/なら/.test(name) && name.length <= 20) return name; // 新しい場所の名前として使う
  }
  return null;
}

// 読めなかった行（時刻が分からない、日課がない）。設定画面で知らせて、場所が黙って抜けないようにする
export function unreadRoutineLines(text: string, home: Place[]): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && parseRoutineText(l, home).length === 0);
}

export function parseRoutineText(text: string, home: Place[]): RoutineEntry[] {
  const out: RoutineEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    let [t, act, where] = line.split(/>|＞|→/).map((x) => (x ?? "").trim());
    // 「4:30 顔洗い > 洗面所」のように、時刻と日課を空白で区切った書き方も受け付ける
    const lead = toHalf(t ?? "").match(/^(\d{1,2}(?::\d{1,2}|時(?:\d{1,2}分?)?)?)[\s　]+(.+)$/);
    if (lead && where === undefined) [t, act, where] = [lead[1], lead[2], act];
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

// 日課や「していたこと → 場所」に出てくるのに場所の一覧にない場所は、一覧の後ろに足す（確かめ方は「〜を見てください」）。
// 設定に書いた場所は、どの時刻に探しても「ひととおり見ました」の前に必ず全部案内するため
export function withExtraPlaces(home: Place[], names: (string | null | undefined)[]): Place[] {
  const out = [...home];
  for (const n of names) {
    if (!n || findPlaceByName(out, n)) continue;
    out.push({ id: `r${out.length + 1}`, name: n, action: `${n}を見てください`, base: 20 });
  }
  return out;
}

export function withRoutinePlaces(home: Place[], routine: RoutineEntry[]): Place[] {
  return withExtraPlaces(home, routine.map((r) => r.placeName));
}

// 探すときに使う場所の全部: 家の場所 + 一日の流れの場所 + 「していたこと → 場所」の場所
export function allSettingPlaces(home: Place[], routine: RoutineEntry[], acts: Activity[]): Place[] {
  return withExtraPlaces(withRoutinePlaces(home, routine), acts.map((a) => a.placeName));
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

// 日課の名前を「〜の時間」の形にする（「新聞」→「新聞の時間」、「顔を洗う」→「顔を洗う時間」）。
// 「〜のあと」は日課の名前によって不自然になる（「新聞のあと」など）ので、どの日課でも言える「さっきは〜の時間だった」にする。
// 漢字を含み、う段のかなで終わるものは動詞として「の」を付けない（「おやつ」のようなかなだけの名前は名詞として扱う）
export function timePhrase(a: string): string {
  const verb = /[うくぐすつぬぶむる]$/.test(a) && /[\u4e00-\u9fff]/.test(a);
  return verb ? `${a}時間` : `${a}の時間`;
}

// 「さっきは新聞の時間だったので、居間のテーブルかもしれません」「さっきは寝る時間だったので、〜」
export function routineReason(r: RoutineEntry): string {
  return `さっきは${timePhrase(r.activity)}だったので、${r.placeName}かもしれません`;
}

// 朝早く、前の日の夕方以降の日課の場所を案内するときの理由。
// 「きのうの新聞のあと、居間のテーブルに置いたままかもしれません」「きのう寝るとき、寝室に置いたままかもしれません」
export function leftoverReason(r: RoutineEntry): string {
  const verb = timePhrase(r.activity) === `${r.activity}時間`;
  return `${verb ? `きのう${r.activity}とき` : `きのうの${r.activity}のあと`}、${r.placeName}に置いたままかもしれません`;
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
