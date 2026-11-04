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
// 歩きながらのつぶやきやテレビの声（長い話）は拾わず、「あった」「なかったよ」くらいの短い言い切りだけを答えにする
export function answerWhileWaiting(text: string): FoundKind | null {
  const c = coreOf(text);
  if (!c || c.length > 10) return null;
  return foundAnswer(c);
}

// 「はい」「いいえ」「あった」などの短い答えだと分かったか（分かったら長く待たずに区切る）
export function isQuickAnswer(text: string): boolean {
  const c = coreOf(text);
  if (!c || c.length > 6) return false;
  return yesNo(c) !== null || foundAnswer(c) !== null;
}

// 聞こえた答えを、本人の言葉で短く声に出して返す（画面の字は見ないので、声で「聞こえた」を伝える）
export function echoOf(ans: boolean | FoundKind | null): string {
  switch (ans) {
    case true:
    case "unsure":
      return "はい。";
    case false:
      return "いいえ、ですね。";
    case "found":
      return "あったんですね。";
    case "not":
      return "なかったんですね。";
    default:
      return ""; // 取り消し・休むは、すぐ「わかりました」と返すので不要
  }
}

// すでに受け止める言葉で始まる文なら、声の返事を重ねない
export function startsWithAck(text: string): boolean {
  return /^(わかりました|体のまわりには|よく置く場所には|あったね|なるほど)/.test(text);
}
