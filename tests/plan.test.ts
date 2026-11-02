// 探す順番が決めたとおりになるかを確かめる。場所はサンプル。実行: npm test
import assert from "node:assert/strict";
import { parseActivitiesText, parsePlacesText } from "../lib/places";
import { clueFromRerank, hasClue, initialPlan, matchActivity, matchSpokenPlace, moveToFront, question } from "../lib/plan";
import { foundAnswer } from "../lib/normalize";

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

console.log("ok: plan tests passed");
