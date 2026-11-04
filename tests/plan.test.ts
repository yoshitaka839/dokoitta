// 探す順番が決めたとおりになるかを確かめる。場所はサンプル。実行: npm test
import assert from "node:assert/strict";
import { parseActivitiesText, parsePlacesText } from "../lib/places";
import { clueFromRerank, hasClue, initialPlan, matchActivity, matchSpokenPlace, moveToFront, question } from "../lib/plan";
import { allSettingPlaces, leftoverReason, parseRoutineText, recentRoutine, routineReason, unreadRoutineLines, withRoutinePlaces, timePhrase } from "../lib/routine";
import { effectiveTime } from "../lib/trytime";
import { answerWhileWaiting, echoOf, foundAnswer, isQuickAnswer, looksLikeReadAloud, quickWaitMs } from "../lib/normalize";
import { DEFAULT_PROFILE, lookQuestion, parseDeskText, SAMPLE_DESK_TEXT } from "../lib/profile";
import { P } from "../lib/phrases";

const home = parsePlacesText(`物置の棚 | 物置の棚の上を見てください | 16
居間のテーブル | 居間のテーブルの上を見てください
台所 | 台所のテーブルを見てください
ソファ | ソファの上を見てください
玄関 | 玄関の棚を見てください
寝室 | 枕元を見てください`);
const acts = parseActivitiesText(`読書、数独 > 居間のテーブル
出かけ > 玄関
料理 > 存在しない場所`);
const at16 = new Date(2026, 10, 6, 16, 10);
const names = (steps: { place: { name: string } }[]) => steps.map((s) => s.place.name);

// 手がかりなし（デモ）: 体まわり1回 → よく置く4か所（16時は物置の棚が先、理由つき）→ 残りは後で
{
  const p = initialPlan({ home, found: {}, now: at16, clue: null });
  assert.deepEqual(names(p.first), ["頭の上・首元・ポケット", "物置の棚", "居間のテーブル", "台所", "ソファ"]);
  assert.deepEqual(names(p.rest), ["玄関", "寝室"]);
  assert.equal(
    question({ step: p.first[1], explain: false }),
    "16時ごろなので、物置の棚かもしれません。物置の棚の上を見てください。",
  );
  // 最初の一回だけ説明をそえる。答えの言葉（あった・なかった）そのものは言わせない
  const q0 = question({ step: p.first[0], explain: true });
  assert.equal(q0, "頭の上、首元、ポケットをさわってみてください。見つかったら、教えてください。");
  assert.ok(!/あった|なかった/.test(q0));
}

// 時刻から外れると、物置の棚は理由なしで上から順
{
  const p = initialPlan({ home, found: {}, now: new Date(2026, 10, 6, 10, 0), clue: null });
  assert.equal(p.first[1].reason, "");
}

// 会話の手がかり: 設定のつながりで、その場所が体まわりより先
{
  const clue = matchActivity("数独をしてたんだけど眼鏡どこかな", acts, home);
  assert.ok(clue);
  const p = initialPlan({ home, found: {}, now: at16, clue });
  assert.deepEqual(names(p.first).slice(0, 3), ["居間のテーブル", "頭の上・首元・ポケット", "物置の棚"]);
  assert.equal(p.first[0].reason, "数独なら、居間のテーブルかもしれません");
  // よく置く場所以外でも先頭に来る
  const c2 = matchActivity("出かけようとしてた", acts, home)!;
  assert.equal(names(initialPlan({ home, found: {}, now: at16, clue: c2 }).first)[0], "玄関");
  // 存在しない場所へのつながりは無視
  assert.equal(matchActivity("料理してた", acts, home), null);
}

// 本人がその場で言った場所は、設定のつながりより優先（打ち消した場所は数えない）
{
  const t = "今日は居間じゃなくて台所で読書した";
  const spoken = matchSpokenPlace(t, home);
  assert.equal(spoken?.placeId, "h3"); // 台所
  assert.equal(matchActivity(t, acts, home)?.placeId, "h2"); // 設定だけなら居間のテーブル
  assert.equal(names(initialPlan({ home, found: {}, now: at16, clue: spoken }).first)[0], "台所");
  assert.equal(spoken?.reason, "台所だったんですね");
  // 「居間」だけでも「居間のテーブル」として聞き取る
  assert.equal(matchSpokenPlace("居間で読書してた", home)?.placeId, "h2");
  // 場所を言っていなければなし
  assert.equal(matchSpokenPlace("眼鏡どこいった", home), null);
}

// 途中で出た手がかりは、残りの場所から先頭へ移す
{
  const p = initialPlan({ home, found: {}, now: at16, clue: null });
  const m = moveToFront(p.first.slice(2), p.rest, matchActivity("出かけ", acts, home)!);
  assert.equal(m.queue[0].place.name, "玄関");
  assert.deepEqual(names(m.rest), ["寝室"]);
}

// 手がかりの判定と Claude の結果の扱い
for (const t of ["眼鏡、どこいった？", "メガネどこいった", "めがねどこにおいたかなぁ"]) assert.equal(hasClue(t), false, t);
assert.equal(hasClue("さっき新聞を読んでたけど眼鏡"), true);
assert.equal(clueFromRerank({ order: ["h2"], reason: "", source: "claude" }, home), null);
assert.equal(clueFromRerank({ order: ["zz", "h3"], reason: "料理をしていたなら", source: "claude" }, home)!.placeId, "h3");

// 「はい」だけでは見つかった扱いにしない
assert.equal(foundAnswer("はい"), "unsure");
assert.equal(foundAnswer("あった"), "found");
assert.equal(foundAnswer("なかった"), "not");
// 取り消し・言い直し
for (const t of ["さっきの取り消し", "違う", "間違えた", "今のなし"]) assert.equal(foundAnswer(t), "undo", t);

// 休みたいときは「休む」で終われる
for (const t of ["休む", "もういい", "疲れた"]) assert.equal(foundAnswer(t), "rest", t);

// 探しに行っている間: 短い言い切りだけを答えにし、つぶやきや長い話は聞き流す
assert.equal(answerWhileWaiting("あった"), "found");
assert.equal(answerWhileWaiting("えーと、なかったよ"), "not");
assert.equal(answerWhileWaiting("あったわ"), "found");
assert.equal(answerWhileWaiting("どこかなあ"), null);
assert.equal(answerWhileWaiting("さっきテレビであったニュースの話なんだけどね"), null);
assert.equal(answerWhileWaiting(""), null);

// 短い答えなら長く待たずに区切る（長い話は区切らない）
for (const t of ["はい", "いいえ", "あった", "なかった"]) assert.equal(isQuickAnswer(t), true, t);
assert.equal(isQuickAnswer("さっき新聞を読んでたけど"), false);
assert.equal(isQuickAnswer("はいはいそれでね台所のほうに"), false);

// 探した記録をもとに順番と理由を決める: 前に同じ時間帯で見つかった場所が先に来て、理由を言う
{
  const at10 = new Date(2026, 10, 6, 10, 0);
  const plain = initialPlan({ home, found: {}, now: at10, clue: null });
  const withRecord = initialPlan({ home, found: { 台所: 1 }, hours: { 台所: [10] }, now: at10, clue: null });
  const idx = (steps: { place: { name: string } }[]) => names(steps).indexOf("台所");
  assert.ok(idx(withRecord.first) < idx(plain.first));
  assert.equal(withRecord.first[idx(withRecord.first)].reason, "前もこの時間に、台所で見つかりました");
  // 時間帯が違えば「前は〜で見つかりました」
  const at20 = new Date(2026, 10, 6, 20, 0);
  const other = initialPlan({ home, found: { 台所: 1 }, hours: { 台所: [10] }, now: at20, clue: null });
  assert.equal(other.first.find((s) => s.place.name === "台所")?.reason, "前は台所で見つかりました");
}

// 聞こえた答えは声で短く返す。すでに受け止める言葉で始まる文には重ねない
assert.equal(echoOf("not"), "なかったんですね。");
assert.equal(echoOf("found"), "");

// 一日の流れ: 探す時刻ではなく「今日もう始まった日課のうち、いちばん最近のもの」の場所から（サンプル）
{
  const routine = parseRoutineText(`7:00 > 朝ごはん > 台所
8:00 > 新聞、ラジオ > 居間
9:00 > 散歩 > そのまま（外に持って出ない）
12:00 > 昼ごはん > 台所
13:00 > 昼寝（ソファ） > ソファ
14:30 > 外出（場所は変わらない）または片づけ > 物置の棚
20:00 > 寝る > 寝室の枕元
21:00 > 夜の散歩 > 外なら変わらない、家なら玄関`, home);
  assert.equal(routine[1].placeName, "居間のテーブル"); // 「居間」でも登録の場所として読む
  assert.equal(routine[2].placeName, null); // 場所が変わらない日課は飛ばす
  assert.equal(routine[5].activity, "片づけ");
  assert.equal(routine[7].placeName, "玄関");
  const h = withRoutinePlaces(home, routine);
  // 置いてから時間がたっていても、最後にした日課の場所が先（10時に探しても、散歩は飛ばして新聞の居間）
  const at10 = new Date(2026, 10, 6, 10, 0);
  assert.deepEqual(recentRoutine(routine, at10).map((r) => r.placeName).slice(0, 3), ["居間のテーブル", "台所", "玄関"]);
  const p = initialPlan({ home: h, found: {}, now: at10, clue: null, routine });
  assert.deepEqual(names(p.first).slice(0, 4), ["頭の上・首元・ポケット", "居間のテーブル", "台所", "玄関"]);
  assert.equal(p.first[1].reason, "さっきは新聞の時間だったので、居間のテーブルかもしれません");
  // 日課があるときは、場所の一覧の「怪しい時刻」（物置の棚 16時）は使わない
  const p16 = initialPlan({ home: h, found: {}, now: at16, clue: null, routine });
  assert.equal(p16.first[1].place.name, "物置の棚");
  assert.equal(p16.first[1].reason, "さっきは片づけの時間だったので、物置の棚かもしれません");
  // 朝早くは前の日の夜の日課へさかのぼる
  const at5 = new Date(2026, 10, 6, 5, 0);
  assert.equal(recentRoutine(routine, at5)[0].placeName, "玄関");
  // 話の手がかりはこれまでどおり最優先
  const clue = matchActivity("出かけようとしてた", acts, h)!;
  assert.equal(names(initialPlan({ home: h, found: {}, now: at10, clue, routine }).first)[0], "玄関");
  assert.equal(routineReason(routine[6]), "さっきは寝る時間だったので、寝室かもしれません");
  assert.equal(timePhrase("顔を洗う"), "顔を洗う時間");
  assert.equal(timePhrase("テレビ"), "テレビの時間");
  assert.equal(timePhrase("おやつ"), "おやつの時間");
  assert.equal(timePhrase("昼ごはん"), "昼ごはんの時間");
  // 「時刻 日課 > 場所」の書き方も読める
  const r2 = parseRoutineText("７：３０ 朝ごはん > 台所\n9:00 散歩 > そのまま", home);
  assert.deepEqual(r2.map((r) => [r.time, r.activity, r.placeName]), [["7:30", "朝ごはん", "台所"], ["9:00", "散歩", null]]);
}

// 試すときの時刻: ?at= → 設定 → 今の時刻 の順
{
  const now = new Date(2026, 10, 6, 16, 40);
  const hm = (d: Date) => `${d.getHours()}:${d.getMinutes()}`;
  assert.equal(hm(effectiveTime(null, null, now).date), "16:40");
  assert.equal(hm(effectiveTime(null, { time: "15:50", day: "2026-11-06" }, now).date), "15:50");
  assert.equal(effectiveTime("10:00", { time: "15:50", day: "2026-11-06" }, now).source, "url");
}

// 仕様書の流れ: 机の気づきにくい場所（2か所まで）→ 体のまわり → 置いた場所
{
  const desk = parseDeskText(SAMPLE_DESK_TEXT + "\n3か所目 | これは使わない");
  assert.equal(desk.length, 2);
  assert.ok(desk.every((d) => d.near && d.desk));
  const p = initialPlan({ home, found: {}, now: at16, clue: null, desk });
  assert.deepEqual(names(p.first).slice(0, 4), ["机の奥の本の上", "机の書類の下", "頭の上・首元・ポケット", "物置の棚"]);
}

// 「あった、ポケットに」のように場所も言った答えは、少し長くても見つかったとして受け取る
assert.equal(answerWhileWaiting("あった、机の書類の下にあったよ"), "found");
assert.equal(answerWhileWaiting("どこにあったかなあ、さっきテレビで見た話だけど"), null);
// 「あった」は場所が続くかもしれないので少し長めに待つ
assert.equal(quickWaitMs("あった"), 1500);
assert.equal(quickWaitMs("なかった"), 700);

// 読み上げを答えにしない: アプリの言葉や画面の字をそのまま読んだ言葉
assert.equal(looksLikeReadAloud("見つかったら教えてください", ["頭の上、首元、ポケットをさわってみてください。見つかったら、教えてください。"]), true);
assert.equal(looksLikeReadAloud("あった", ["見つかったら、教えてください。"]), false); // 短い答えは答え
assert.equal(looksLikeReadAloud("机の書類の下", ["机の書類の下"]), true); // 画面の場所の名前を読んだだけ
assert.equal(looksLikeReadAloud("さっき新聞を読んでた", ["机の書類の下"]), false);

// 本人に言う言葉: 答えの言葉そのものを言わせない。見た目の確かめ
assert.equal(lookQuestion(DEFAULT_PROFILE), "いつものメガネですか？");
assert.equal(lookQuestion({ ...DEFAULT_PROFILE, looks: "細いふちの" }), "いつもの細いふちのメガネですか？");
assert.equal(P.giveUp("台所"), "わかりました。次に見るなら、台所です。");
assert.ok(!/あった|なかった/.test(P.explain + P.reprompt));

// 前の日に置いたまま、次の日に探すことがある（サンプル）。
// 「〜に置きっぱなし」「15時半」「15:30〜16:00」のような書き方でも場所が抜けない
{
  const parsed = parseRoutineText(`7:00 > 朝ごはん > 台所
15時半 > 片づけ > 物置の棚に置きっぱなし
16:00〜17:00 > 畑 > 外に持って出る
18:00 > 夕ごはん > 台所
21:00 > 寝る > 寝室の枕元に置いていく`, home);
  assert.deepEqual(parsed.map((r) => [r.time, r.placeName]), [["7:00", "台所"], ["15:30", "物置の棚"], ["16:00", null], ["18:00", "台所"], ["21:00", "寝室"]]);
  assert.deepEqual(unreadRoutineLines("15:30 > 片づけ > 物置の棚\nあさ > 体操 > 庭", home), ["あさ > 体操 > 庭"]);

  // 設定に書いた場所（家の場所・一日の流れ・していたこと → 場所）は、どの時刻に探しても全部案内する
  const acts2 = parseActivitiesText("手紙 > 文机の引き出し\n新聞 > 居間");
  const all = allSettingPlaces(home, parsed, acts2);
  assert.ok(all.some((p) => p.name === "文机の引き出し"));
  assert.ok(!all.some((p) => p.name === "居間")); // 「居間」は「居間のテーブル」と同じ場所
  assert.equal(matchActivity("新聞読んでた", acts2, all)?.placeId, all.find((p) => p.name === "居間のテーブル")!.id);
  for (let h = 0; h < 24; h++) {
    const pl = initialPlan({ home: all, found: {}, now: new Date(2026, 10, 6, h, 15), clue: null, routine: parsed });
    const asked = new Set([...pl.first, ...pl.rest].map((s) => s.place.name));
    for (const p of all) assert.ok(asked.has(p.name), `${h}時に${p.name}が抜けた`);
  }

  // 午前中は、前の日の夕方から夜の日課の場所も早めに見る
  const at8 = initialPlan({ home: all, found: {}, now: new Date(2026, 10, 6, 8, 0), clue: null, routine: parsed });
  const n8 = at8.first.map((s) => s.place.name);
  // 朝早く（今日の日課がまだ1つ）は、前の日の夕方以降の場所を古い順に先に
  assert.deepEqual(n8.slice(0, 4), ["頭の上・首元・ポケット", "物置の棚", "台所", "寝室"]);
  assert.equal(at8.first[1].reason, "きのうの片づけのあと、物置の棚に置いたままかもしれません");
  // 朝の日課がいくつも済んでいても、前の日の夕方の場所が、よく置く場所より前に来る
  const r3 = parseRoutineText("6:00 > 顔を洗う > 洗面所\n7:00 > 朝ごはん > 台所\n8:00 > 新聞 > 居間\n15:30 > 片づけ > 物置の棚\n21:00 > 寝る > 寝室", home);
  const h3 = allSettingPlaces(home, r3, []);
  const at10b = initialPlan({ home: h3, found: {}, now: new Date(2026, 10, 6, 10, 0), clue: null, routine: r3 });
  assert.deepEqual(at10b.first.map((s) => s.place.name).slice(1, 6), ["居間のテーブル", "台所", "洗面所", "物置の棚", "寝室"]);
  // 朝5時、これからする日課の場所（机）に取りに行って「ない」→ 前の日の夕方の場所が先、机の場所はそのあと
  const r5 = parseRoutineText("5:00 > 書きもの > 机\n7:00 > 朝ごはん > 台所\n15:30 > 片づけ > 物置の棚\n18:00 > 夕ごはん > 台所\n20:00 > 歯をみがく > 洗面所", home);
  const h5 = allSettingPlaces(home, r5, []);
  const at5b = initialPlan({ home: h5, found: {}, now: new Date(2026, 10, 6, 5, 0), clue: null, routine: r5 });
  assert.deepEqual(at5b.first.map((s) => s.place.name).slice(1, 5), ["物置の棚", "台所", "洗面所", "机"]);
  assert.equal(question({ step: at5b.first[1], explain: false }), "きのうの片づけのあと、物置の棚に置いたままかもしれません。物置の棚の上を見てください。");
  // 4時台（今日の日課がまだない）も同じ
  const at4 = initialPlan({ home: h5, found: {}, now: new Date(2026, 10, 6, 4, 40), clue: null, routine: r5 });
  assert.equal(at4.first[1].place.name, "物置の棚");
  assert.equal(leftoverReason(r5[4]), "きのう歯をみがくとき、洗面所に置いたままかもしれません");
  // 午後は今日の日課から（前の日の夕方は早めにしない）
  const at14 = initialPlan({ home: all, found: {}, now: new Date(2026, 10, 6, 14, 0), clue: null, routine: parsed });
  assert.equal(at14.first[1].place.name, "台所");
  assert.notEqual(at14.first[2].place.name, "物置の棚");
}

console.log("ok: plan tests passed");
