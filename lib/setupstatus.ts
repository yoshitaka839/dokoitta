// 今の設定が、家族が入れたものか、サンプルのままかを知らせる（家族が見てすぐわかるように）。
// 保存した日は、この iPad の中にだけ残す
import { loadHomeText, parsePlacesText } from "./places";

const SAVED_AT = "dokoitta-saved-at";

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function markSaved(on: boolean) {
  try {
    if (on) localStorage.setItem(SAVED_AT, new Date().toISOString());
    else localStorage.removeItem(SAVED_AT);
  } catch {
    /* 保存できない端末では日付を出さない */
  }
}

export type SetupStatus = {
  custom: boolean; // 家の場所を家族が入れたか
  savedAt: Date | null;
  sampleParts: string[]; // サンプルのままの部分
};

export function setupStatus(): SetupStatus {
  const home = loadHomeText();
  const custom = !!(home && parsePlacesText(home).length);
  const at = get(SAVED_AT);
  const savedAt = at && !isNaN(Date.parse(at)) ? new Date(at) : null;
  const sampleParts: string[] = [];
  if (!custom) sampleParts.push("家の場所");
  if (get("dokoitta-routine") === null) sampleParts.push("一日の流れ");
  if (get("dokoitta-desk") === null) sampleParts.push("机の気づきにくい場所");
  if (get("dokoitta-activities") === null) sampleParts.push("していたこと → 場所");
  return { custom, savedAt, sampleParts };
}

export function statusLine(s: SetupStatus): string {
  if (!s.custom) return "今の設定：サンプルのまま";
  const d = s.savedAt ? `${s.savedAt.getMonth() + 1}月${s.savedAt.getDate()}日保存` : "保存した日の記録なし";
  return `今の設定：家族が入れた設定（${d}）`;
}
