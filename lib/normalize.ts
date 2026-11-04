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
const REST = ["休む", "やすむ", "休みたい", "休もう", "やめる", "やめよう", "やめたい", "もういい", "疲れた", "つかれた"];

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

// 返事に関係ない言いよどみ・語尾。これを除いて残りが短いときだけ「答え」とみなす
const FILLERS = /えーと|えっと|ええと|えー|あのー|あの|うーん|んー|あー|ああ|おお|ほら|なあ|なぁ|ねえ|ねぇ|かな|だな|だね|です|ね|よ|わ|[\s、。！!？?ー…・]/g;

export function core(text: string): string {
  return text.replace(FILLERS, "");
}

// 探しに行っている間の声。歩きながらのつぶやき（長い話や途中の言葉）は答えとして拾わない。
// 「あった」「なかった」「ここにあった」くらいの短い言い切りだけを答えにする
export function waitingAnswer(text: string): FoundKind | null {
  const c = core(text);
  if (!c || c.length > 10) return null;
  return foundAnswer(c);
}

// 「はい」「いいえ」「あった」「なかった」だけの短い答えか（分かったらすぐ区切るため）
export function isShortAnswer(text: string): boolean {
  const c = core(text);
  if (!c || c.length > 5) return false;
  return yesNo(c) !== null || foundAnswer(c) !== null;
}
