// 探した記録。今は iPad の中（localStorage）に残す。家族ページ用の保存先は後で足す。
import type { FoundCounts } from "./rank";

export type SearchRecord = {
  at: string; // 始めた時刻（ISO）
  utterances: string[]; // 本人の話（手がかり）
  checked: string[]; // 確かめた場所の名前（順番どおり）
  foundAt?: string; // 見つかった場所の名前
  ended: "searching" | "found" | "rest" | "no-reply" | "all-checked" | "stopped";
  nextPlace?: string; // あきらめた・返事なしのとき「次に見るなら」の場所
  oldFound?: string[]; // 古い方の老眼鏡が見つかった場所
  lookNoReply?: boolean; // 見た目の確かめに返事がなかった（古い方を持って行ったかもしれない）
  rerankSource?: "claude" | "program";
  practice?: boolean; // 練習・動作確認の記録（よく見つかる場所の回数には数えない）
};

const KEY = "dokoitta-history";

export function loadHistory(): SearchRecord[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

// 同じ記録（始めた時刻が同じ）があれば置き換える。1か所ごとに保存して、途中で閉じても残るようにする
export function saveRecord(r: SearchRecord) {
  try {
    const all = loadHistory().filter((x) => x.at !== r.at);
    all.unshift(r);
    localStorage.setItem(KEY, JSON.stringify(all.slice(0, 100)));
  } catch {
    /* 保存できなくても探す流れは止めない */
  }
}

// 見つかった時刻（何時ごろか）を場所ごとに集める。練習の記録は数えない
export function foundHours(): Record<string, number[]> {
  const h: Record<string, number[]> = {};
  for (const r of loadHistory()) {
    if (!r.foundAt || r.practice) continue;
    const d = new Date(r.at);
    (h[r.foundAt] ??= []).push(d.getHours() + d.getMinutes() / 60);
  }
  return h;
}

export function foundCounts(): FoundCounts {
  const c: FoundCounts = {};
  for (const r of loadHistory()) if (r.foundAt && !r.practice) c[r.foundAt] = (c[r.foundAt] ?? 0) + 1;
  return c;
}

// いちばん新しい記録の「見つかった場所」を直す（取り消しは undefined）
export function updateLatestFound(foundAt: string | undefined) {
  try {
    const all = loadHistory();
    if (!all[0]) return;
    all[0].foundAt = foundAt;
    all[0].ended = foundAt ? "found" : "stopped";
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* 保存できなくても流れは止めない */
  }
}
