// 練習・撮影用の「試すときの時刻」。/settings で指定すると、/talk はその時刻として順番を決める。
// 解除し忘れて本番で使ってしまわないよう、指定した日のうちだけ有効（次の日には自動で今の時刻に戻る）。
// 指定している間は練習あつかいで、記録は「よく見つかる場所」の回数に数えない。

const KEY = "dokoitta-try-time";

export type TryTime = { time: string; day: string }; // time「10:00」, day「2026-11-06」

const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function parseHHMM(s: string | null | undefined): [number, number] | null {
  const m = (s ?? "").match(/^(\d{1,2}):?(\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  return h <= 23 && min <= 59 ? [h, min] : null;
}

// 今日有効な指定だけを返す（前の日の指定は消す）
export function loadTryTime(today = new Date()): TryTime | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as TryTime;
    if (t.day !== dayOf(today) || !parseHHMM(t.time)) {
      localStorage.removeItem(KEY);
      return null;
    }
    return t;
  } catch {
    return null;
  }
}

export function saveTryTime(time: string | null, today = new Date()) {
  try {
    if (!time || !parseHHMM(time)) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ time, day: dayOf(today) }));
  } catch {
    /* 保存できない端末では今の時刻のまま */
  }
}

// URL の ?at= → 設定の「試すときの時刻」 → 今の時刻 の順
export function effectiveTime(urlAt: string | null, tryTime: TryTime | null, now = new Date()): { date: Date; source: "url" | "settings" | "now" } {
  const d = new Date(now);
  const u = parseHHMM(urlAt);
  if (u) {
    d.setHours(u[0], u[1], 0, 0);
    return { date: d, source: "url" };
  }
  const s = tryTime ? parseHHMM(tryTime.time) : null;
  if (s) {
    d.setHours(s[0], s[1], 0, 0);
    return { date: d, source: "settings" };
  }
  return { date: d, source: "now" };
}
