// 探す順番が決めたとおりになるかを確かめる。場所はサンプル。実行: npm test
import assert from "node:assert/strict";
import { parseActivitiesText, parsePlacesText } from "../lib/places";
import { clueFromRerank, hasClue, initialPlan, matchActivity, matchSpokenPlace, moveToFront, question } from "../lib/plan";
import { parseRoutineText, recentRoutine, routineReason, withRoutinePlaces, afterPhrase } from "../lib/routine";
import { answerWhileWaiting, echoOf, foundAnswer, isQuickAnswer, startsWithAck } from "../lib/normalize";

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
    question({ step: p.first[1], index: 1, afterBody: true, explain: true }),
    "体のまわりにはなかったですね。16時ごろなので、物置の棚かもしれません。物置の棚の上を見てください。確かめてきて、戻ったら「あった」か「なかった」と教えてください。",
  );
  assert.ok(question({ step: p.first[0], index: 0, afterBody: false, explain: false }).startsWith("念のため、頭の上や首元、ポケット"));
  // 2か所目からは説明を短く
  assert.ok(question({ step: p.first[2], index: 2, afterBody: false, explain: false }).endsWith("戻ったら教えてください。"));
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
assert.equal(echoOf("found"), "あったんですね。");
assert.equal(echoOf(true), "はい。");
assert.equal(echoOf("rest"), "");
assert.equal(startsWithAck("体のまわりにはなかったですね。"), true);
assert.equal(startsWithAck("まず、台所のテーブルを見てください"), false);

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
  assert.equal(p.first[1].reason, "新聞のあとなので、居間のテーブルかもしれません");
  // 日課があるときは、場所の一覧の「怪しい時刻」（物置の棚 16時）は使わない
  const p16 = initialPlan({ home: h, found: {}, now: at16, clue: null, routine });
  assert.equal(p16.first[1].place.name, "物置の棚");
  assert.equal(p16.first[1].reason, "片づけのあとなので、物置の棚かもしれません");
  // 朝早くは前の日の夜の日課へさかのぼる
  const at5 = new Date(2026, 10, 6, 5, 0);
  assert.equal(recentRoutine(routine, at5)[0].placeName, "玄関");
  // 話の手がかりはこれまでどおり最優先
  const clue = matchActivity("出かけようとしてた", acts, h)!;
  assert.equal(names(initialPlan({ home: h, found: {}, now: at10, clue, routine }).first)[0], "玄関");
  assert.equal(routineReason(routine[6]), "寝たあとなので、寝室かもしれません");
  assert.equal(afterPhrase("顔を洗う"), "顔を洗ったあと");
  // 「時刻 日課 > 場所」の書き方も読める
  const r2 = parseRoutineText("７：３０ 朝ごはん > 台所\n9:00 散歩 > そのまま", home);
  assert.deepEqual(r2.map((r) => [r.time, r.activity, r.placeName]), [["7:30", "朝ごはん", "台所"], ["9:00", "散歩", null]]);
}

console.log("ok: plan tests passed");
