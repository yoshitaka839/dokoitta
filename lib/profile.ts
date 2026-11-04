// 家族が /settings で決める、本人に合わせた設定（iPad の中にだけ保存）。
// ・呼び名: 本人への画面と声で使う言い方（初期値「メガネ」。聞き取りで表示される表記に合わせた）
// ・見た目: 見つかったときに「いつもの〇〇のメガネですか？」と確かめる（古い老眼鏡を見つけて「あった」と言うことがあるため）
// ・机の気づきにくい場所: 目の前にあるのに気づかない、を助けるために最初に確かめる（2か所まで）
import { type Place } from "./places";

export type Profile = { callName: string; looks: string; lookCheck: boolean };
export const DEFAULT_PROFILE: Profile = { callName: "メガネ", looks: "", lookCheck: true };

const KEY = "dokoitta-profile";

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PROFILE;
    const p = JSON.parse(raw) as Partial<Profile>;
    return {
      callName: (p.callName ?? "").trim().slice(0, 10) || DEFAULT_PROFILE.callName,
      looks: (p.looks ?? "").trim().slice(0, 20),
      lookCheck: p.lookCheck ?? true,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* 保存できない端末では初期値のまま */
  }
}

// 「いつもの細いふちのメガネですか？」（見た目が空なら「いつものメガネですか？」）
export function lookQuestion(p: Profile): string {
  return `いつもの${p.looks}${p.callName}ですか？`;
}

// 机の気づきにくい場所。1行に1か所「名前 | 確かめ方」。体のまわりより前に確かめるのは2か所まで
export const DESK_MAX = 2;
export const SAMPLE_DESK_TEXT = `机の奥の本の上 | 机の奥に立てた本の上を、手でさわってみてください
机の書類の下 | 机の上の書類を持ち上げて、下をさわってみてください`;

export function parseDeskText(text: string): Place[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l, i) => {
      const [name, action] = l.split(/[|｜]/).map((x) => (x ?? "").trim());
      return {
        id: `d${i + 1}`,
        name: (name ?? "").slice(0, 30),
        action: (action || `${name}を、手でさわってみてください`).slice(0, 80),
        base: 100,
        near: true,
        desk: true,
      } satisfies Place;
    })
    .filter((p) => p.name)
    .slice(0, DESK_MAX);
}

const DESK_KEY = "dokoitta-desk";
export function loadDeskText(): string | null {
  try {
    return localStorage.getItem(DESK_KEY);
  } catch {
    return null;
  }
}
export function saveDeskText(text: string | null) {
  try {
    if (text === null) localStorage.removeItem(DESK_KEY);
    else localStorage.setItem(DESK_KEY, text);
  } catch {
    /* 保存できない端末ではサンプルのまま */
  }
}
export function getDeskSpots(): Place[] {
  const t = typeof window !== "undefined" ? loadDeskText() : null;
  return parseDeskText(t ?? SAMPLE_DESK_TEXT);
}
