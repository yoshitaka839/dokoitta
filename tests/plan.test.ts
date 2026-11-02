// デモの流れ（体まわりになし → 時刻の手がかりで次の場所）がいつも同じ順番になるかを確かめる。
// 場所はサンプル。実行: npm test
import assert from "node:assert/strict";
import { BODY_PLACES, parsePlacesText } from "../lib/places";
import { scorePlaces } from "../lib/rank";
import { hasClue, homeOrder, programReason, question, splitPlaces } from "../lib/plan";
import { foundAnswer } from "../lib/normalize";

const home = parsePlacesText(`物置の棚 | 物置の棚の上を見てください | 16
居間のテーブル | 居間のテーブルの上を見てください
台所 | 台所のテーブルを見てください`);
const all = [...BODY_PLACES, ...home];

function sequence(now: Date) {
  const { body, home: h } = splitPlaces(scorePlaces(all, {}, now).map((s) => s.place));
  return [...body, ...homeOrder(h, null).ids.map((id) => all.find((p) => p.id === id)!)];
}

// 16時台: 体まわり3か所 → 時刻の手がかりの場所
const s16 = sequence(new Date(2026, 10, 6, 16, 10));
assert.deepEqual(s16.slice(0, 4).map((p) => p.name), ["頭の上", "首元", "服のポケット", "物置の棚"]);
assert.equal(
  question({ place: s16[3], index: 3, firstHome: true, reason: programReason(s16[3], {}, new Date(2026, 10, 6, 16, 10)) }),
  "体のまわりにはなかったですね。16時ごろなので、物置の棚かもしれません。物置の棚の上を見てください。ありましたか？",
);
// 時刻から外れると理由は言わない
assert.equal(programReason(s16[3], {}, new Date(2026, 10, 6, 10, 0)), "");

// 「眼鏡、どこいった？」だけなら手がかりなし（Claude に頼まず、プログラムの順番）
for (const t of ["眼鏡、どこいった？", "メガネどこいった", "めがねどこにおいたかなぁ"]) assert.equal(hasClue(t), false, t);
assert.equal(hasClue("さっき新聞を読んでたけど眼鏡"), true);

// Claude が理由なしで順番を変えても使わない。候補外のIDは捨てる
assert.deepEqual(homeOrder(home, { order: ["h2", "h1"], reason: "", source: "claude" }).ids, ["h1", "h2", "h3"]);
assert.deepEqual(homeOrder(home, { order: ["zz", "h3"], reason: "台所にいたなら", source: "claude" }).ids, ["h3", "h1", "h2"]);

// 「はい」だけでは見つかった扱いにしない
assert.equal(foundAnswer("はい"), "unsure");
assert.equal(foundAnswer("あった"), "found");
assert.equal(foundAnswer("なかった"), "not");

console.log("ok: plan tests passed");
