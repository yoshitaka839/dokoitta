// 聞き取った言葉をそろえる。音声認識は「メガネ」「めがね」「眼鏡」など表記がゆれるため。
const GLASSES = ["眼鏡", "めがね", "メガネ", "めがねー", "メガネー", "老眼鏡", "ろうがんきょう"];
const WHERE = ["どこ", "ドコ", "何処", "ない", "無い", "見当たら", "なくした", "知らない"];

export function understand(text: string) {
  const t = text.replace(/\s+/g, "");
  return {
    glasses: GLASSES.some((w) => t.includes(w)),
    searching: WHERE.some((w) => t.includes(w)),
  };
}

const YES = ["はい", "うん", "ええ", "そう", "お願い", "探して", "さがして", "頼む"];
const NO = ["いいえ", "いや", "違う", "ちがう", "大丈夫", "いらない", "ない、", "結構"];

// 「はい／いいえ」を判定する。どちらとも取れないときは null
export function yesNo(text: string): boolean | null {
  const t = text.replace(/\s+/g, "");
  if (!t) return null;
  if (NO.some((w) => t.includes(w))) return false;
  if (YES.some((w) => t.includes(w))) return true;
  return null;
}

// 見つかったかどうか。「はい」「うん」だけは返事のつもりのことがあるので "unsure" にして聞き直す
const NOT_FOUND = ["なかった", "ない", "無い", "ありません", "見つからない", "みつからない", "いいえ"];
// 「さっきの取り消し」「違う」「間違えた」などは、ひとつ前の答えを直したいという合図
const UNDO = ["取り消", "とりけし", "取消", "間違", "まちが", "違う", "ちがう", "やり直", "やりなお", "今のなし", "いまのなし"];
const FOUND = ["あった", "有った", "あります", "ありました", "見つけた", "見つかった", "みつけた", "みつかった", "これだ", "ここだ"];
const PLAIN_YES = ["はい", "うん", "ええ", "そう"];

// 「休む」「もういい」は、今日はここまでにしたいという合図
const REST = ["休む", "やすむ", "休みたい", "休もう", "休憩", "やめる", "やめよう", "やめたい", "もういい", "疲れた", "つかれた"];

export type FoundKind = "found" | "not" | "unsure" | "undo" | "rest";

export function foundAnswer(text: string): FoundKind | null {
  const t = text.replace(/\s+/g, "");
  if (!t) return null;
  if (UNDO.some((w) => t.includes(w))) return "undo";
  if (REST.some((w) => t.includes(w))) return "rest";
  if (NOT_FOUND.some((w) => t.includes(w))) return "not";
  if (FOUND.some((w) => t.includes(w))) return "found";
  if (PLAIN_YES.some((w) => t.includes(w))) return "unsure";
  return null;
}

// 言いよどみや語尾を取り除いた「芯」の部分
const FILLER_WORDS = /えーと|えっと|ええと|えー|あのー|あの|うーん|んー|あー|ああ|おー|ほら|なあ|なぁ|ねえ|ねぇ|かな|だな|だね|だよ|です|ね|よ|わ|[\s、。！!？?ー…・]/g;
export function coreOf(text: string): string {
  return text.replace(FILLER_WORDS, "");
}

// 探しに行っている間に聞こえた声を、答えとして扱うかどうか。
// 歩きながらのつぶやきやテレビの声（長い話）は拾わず、「あった」「なかったよ」くらいの短い言い切りだけを答えにする。
// ただし「あった、ポケットに」のように見つかった場所を言うときは少し長くなるので、見つかった答えは20字まで受け取る
export function answerWhileWaiting(text: string): FoundKind | null {
  const c = coreOf(text);
  if (!c) return null;
  if (c.length <= 10) return foundAnswer(c);
  // 「あった」で始まる言い切りだけ（「どこにあったかな…」のようなつぶやきは除く）
  if (c.length <= 20 && /^(あった|有った|ありました|あります|見つけた|見つかった|みつけた|みつかった)/.test(c) && foundAnswer(c) === "found") return "found";
  return null;
}

// 短い答えのとき、何ミリ秒待って区切るか（null は通常どおり）。
// 「あった」は、続けて場所を言うことがあるので少し長めに待つ
export function quickWaitMs(text: string): number | null {
  const c = coreOf(text);
  if (!c || c.length > 6) return null;
  const f = foundAnswer(c);
  if (f === "found") return 1500;
  if (yesNo(c) !== null || f !== null) return 700;
  return null;
}
export function isQuickAnswer(text: string): boolean {
  return quickWaitMs(text) !== null;
}

// 聞こえた「なかった」を、声で短く返す（本人は画面の字を見ないので、耳で「聞こえた」が分かるように）
export function echoOf(ans: boolean | FoundKind | null): string {
  return ans === "not" ? "なかったんですね。" : "";
}

// アプリが話した文や画面の字を、本人がそのまま読み上げたような言葉か。
// 例: 「見つかったら、教えてください」を読み上げると「見つかった」が答えに聞こえるので、答えにしない
export function looksLikeReadAloud(heard: string, sources: string[]): boolean {
  const h = coreOf(heard);
  if (h.length < 5) return false;
  const grams: string[] = [];
  for (let i = 0; i < h.length - 1; i++) grams.push(h.slice(i, i + 2));
  return sources.some((src) => {
    const s = coreOf(src);
    if (!s) return false;
    const hit = grams.filter((g) => s.includes(g)).length;
    return hit / grams.length >= 0.6;
  });
}
