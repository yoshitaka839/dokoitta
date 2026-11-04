// 眼鏡を確かめる場所の候補。
// ・体まわり（頭の上・首元・服のポケット）は全員共通で、いつも最初に確かめる
// ・家の中の場所は、家族が /settings で iPad に保存したものを使う（公開リポジトリには入れない）
//   保存がなければ、下のサンプルを使う

export type TimeBand = "morning" | "noon" | "evening" | "night";

export type Place = {
  id: string;
  name: string; // 読み上げる場所の名前
  action: string; // 確かめ方（読み上げる）
  body?: boolean; // 体まわり（最初に確かめる場所）
  base: number; // いつもの置き場所としての重み
  bands?: Partial<Record<TimeBand, number>>; // 時間帯ごとの加点（サンプル用）
  hours?: number[]; // 怪しい時刻（例: 16 → 15〜17時に大きく加点）
  main?: boolean; // よく置く場所（最初はここだけ確かめる）
  near?: boolean; // 手元で確かめられる場所（机・体のまわり）。待ち時間を短くする
  desk?: boolean; // 机の気づきにくい場所（目の前にあるのに気づかない、への助け）
};

// 場所の呼び方のゆれ（「居間のテーブル」→「居間」「テーブル」も同じ場所として聞き取る）
const GENERIC = new Set(["前", "中", "上", "下", "横", "そば", "まわり", "周り"]);
export function aliases(p: Place): string[] {
  if (p.body) return ["頭", "首", "ポケット"];
  const parts = p.name.split("の").filter((x) => x.length >= 2 && !GENERIC.has(x));
  return [...new Set([p.name, ...parts])];
}

// 最初に確かめる「よく置く場所」の数（設定の上から）
export const MAIN_COUNT = 4;

// 体まわりは3か所を1回の問いかけにまとめる
export const BODY_CHECK: Place = {
  id: "body",
  name: "頭の上・首元・ポケット",
  action: "頭の上、首元、ポケットをさわってみてください",
  body: true,
  near: true,
  base: 100,
};

export const BODY_PLACES: Place[] = [
  { id: "head", name: "頭の上", action: "頭の上を、手でさわってみてください", body: true, base: 100 },
  { id: "neck", name: "首元", action: "首から下げていないか、胸のあたりをさわってみてください", body: true, base: 95 },
  { id: "pocket", name: "服のポケット", action: "胸と、ズボンのポケットをさわってみてください", body: true, base: 90 },
];

export const SAMPLE_HOME_PLACES: Place[] = [
  { id: "living_table", name: "居間のテーブル", action: "居間のテーブルの上を見てください", base: 60, bands: { morning: 15, noon: 10 }, main: true },
  { id: "tv_side", name: "テレビのそば", action: "テレビの前を見てください", base: 50, bands: { evening: 15, night: 10 }, main: true },
  { id: "sofa", name: "ソファ", action: "ソファの上を見てください", base: 45, bands: { noon: 10, evening: 10 }, main: true },
  { id: "washroom", name: "洗面所", action: "洗面台の上を見てください", base: 45, bands: { morning: 20, night: 15 }, main: true },
  { id: "bedside", name: "寝室の枕元", action: "枕元を見てください", base: 40, bands: { morning: 20, night: 20 } },
  { id: "kitchen", name: "台所", action: "台所のテーブルの上を見てください", base: 35, bands: { morning: 10, noon: 15, evening: 10 } },
  { id: "toilet", name: "トイレ", action: "トイレの棚の上を見てください", base: 30 },
  { id: "entrance", name: "玄関", action: "玄関の棚の上を見てください", base: 25, bands: { noon: 10 } },
];

const KEY = "dokoitta-home-places";

// 設定の1行: 「名前 | 確かめ方 | 怪しい時刻（任意。例 16 や 7,21）」
export function parsePlacesText(text: string): Place[] {
  const out: Place[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  lines.forEach((line, i) => {
    const [name, action, hours] = line.split(/[|｜]/).map((s) => (s ?? "").trim());
    if (!name) return;
    // 体まわりと同じ場所は共通のものを使う
    if (BODY_PLACES.some((b) => b.name === name)) return;
    const hs = (hours ?? "")
      .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
      .split(/[,、\s]+/)
      .map((h) => parseInt(h, 10))
      .filter((h) => h >= 0 && h <= 23);
    out.push({
      id: `h${i + 1}`,
      name: name.slice(0, 30),
      action: (action || `${name}を見てください`).slice(0, 80),
      base: Math.max(20, 70 - i * 5), // 上に書いた場所ほど、いつもの場所として重くする
      hours: hs.length ? hs : undefined,
      main: out.length < MAIN_COUNT,
    });
  });
  return out.slice(0, 30);
}

export function placesToText(places: Place[]): string {
  return places.map((p) => [p.name, p.action, p.hours?.join(",") ?? ""].join(" | ").replace(/ \| $/, "")).join("\n");
}

export function loadHomeText(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveHomeText(text: string | null) {
  try {
    if (text === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, text);
  } catch {
    /* 保存できない端末ではサンプルのまま */
  }
}

export function usingSamplePlaces(): boolean {
  const t = typeof window !== "undefined" ? loadHomeText() : null;
  return !(t && parsePlacesText(t).length);
}

export function getHomePlaces(): Place[] {
  const t = typeof window !== "undefined" ? loadHomeText() : null;
  const home = t ? parsePlacesText(t) : [];
  return home.length ? home : SAMPLE_HOME_PLACES;
}

// ── していたこと → 場所 のつながり ──
// 設定の1行: 「読書、数独 > 居間のテーブル」

export type Activity = { keywords: string[]; placeName: string };

export const SAMPLE_ACTIVITIES_TEXT = `新聞、テレビ > 居間のテーブル
顔を洗、歯みがき > 洗面所
昼寝、寝 > 寝室の枕元
料理、食事、ごはん > 台所
出かけ、買い物 > 玄関`;

export function parseActivitiesText(text: string): Activity[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [left, right] = l.split(/>|＞|→|=>/).map((x) => (x ?? "").trim());
      return {
        keywords: (left ?? "").split(/[,、，\s]+/).map((k) => k.trim()).filter(Boolean).slice(0, 10),
        placeName: (right ?? "").slice(0, 30),
      };
    })
    .filter((a) => a.keywords.length && a.placeName)
    .slice(0, 30);
}

const ACT_KEY = "dokoitta-activities";

export function loadActivitiesText(): string | null {
  try {
    return localStorage.getItem(ACT_KEY);
  } catch {
    return null;
  }
}

export function saveActivitiesText(text: string | null) {
  try {
    if (text === null) localStorage.removeItem(ACT_KEY);
    else localStorage.setItem(ACT_KEY, text);
  } catch {
    /* 保存できない端末ではサンプルのまま */
  }
}

export function getActivities(): Activity[] {
  const t = typeof window !== "undefined" ? loadActivitiesText() : null;
  return parseActivitiesText(t ?? SAMPLE_ACTIVITIES_TEXT);
}
