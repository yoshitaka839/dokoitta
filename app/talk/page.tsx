"use client";

// アプリの方から声で話しかけて、眼鏡を一か所ずつ一緒に確かめるページ。
// 流れ:
//  さわる →「どうしましたか？」→ 眼鏡の話か確かめる
//  → 候補の順番をプログラムで決め、本人の話に手がかりがあれば Claude が候補の中で並べ替える（①）
//  → 手がかりがなければ体まわり（頭の上・首元・ポケット）から順に確かめる（②）
//  → 4か所ごとに「続けますか？」。休むなら見た場所を残す（③）
// 「必ず見つかる」とは言わない。

import { useEffect, useRef, useState } from "react";
import { beep, canListen, listen, prepareBeep, speak, stopListening } from "@/lib/voice";
import { answerWhileWaiting, echoOf, foundAnswer, isQuickAnswer, startsWithAck, understand, yesNo, type FoundKind } from "@/lib/normalize";
import { BODY_CHECK, getActivities, getHomePlaces, type Place } from "@/lib/places";
import { clueFromRerank, hasClue, initialPlan, matchActivity, matchSpokenPlace, moveToFront, question, type Clue, type Step } from "@/lib/plan";
import { foundCounts, foundHours, saveRecord, updateLatestFound, type SearchRecord } from "@/lib/history";

type Stage = "idle" | "speaking" | "listening" | "searching" | "done";
type Answer = { ans: boolean | null; text: string };
type FoundAns = { ans: FoundKind | null; text: string };

const WAIT_MS = 3 * 60 * 1000; // 探しに行っている間に待つ時間（短い沈黙は失敗扱いにしない）
const NOD_MS = 20 * 1000; // 「確かめてきて」のすぐ後の「はい」は、うなずきとして聞き流す


// 練習モード: /talk?practice=1 か ?at=… のとき。記録は「練習」として分け、よく見つかる場所の回数に数えない
function isPractice(): boolean {
  try {
    const q = new URLSearchParams(window.location.search);
    return q.has("practice") || q.has("at");
  } catch {
    return false;
  }
}

// 練習用: /talk?at=16:00 のように時刻を指定すると、その時刻として順番を決める
function currentTime(): Date {
  const now = new Date();
  try {
    const at = new URLSearchParams(window.location.search).get("at");
    const m = at?.match(/^(\d{1,2}):?(\d{2})?$/);
    if (m) now.setHours(Number(m[1]) % 24, Number(m[2] ?? 0), 0, 0);
  } catch {
    /* 指定なし */
  }
  return now;
} // この数を確かめるごとに、続けるか休むか聞く

async function rerank(utterance: string, candidates: Place[], hour = new Date().getHours()) {
  const ids = candidates.map((p) => p.id);
  try {
    const r = await fetch("/api/rerank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        utterance,
        candidates: candidates.map((p) => ({ id: p.id, name: p.name })),
        hour,
      }),
    });
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()) as { order: string[]; reason: string; source: "claude" | "program"; note?: string; ms: number };
  } catch (e) {
    return { order: ids, reason: "", source: "program" as const, note: String(e), ms: 0 };
  }
}

export default function Talk() {
  const [stage, setStage] = useState<Stage>("idle");
  const [said, setSaid] = useState("");
  const [heard, setHeard] = useState("");
  const [heardOk, setHeardOk] = useState(false); // 答えとして受け取った（緑の「聞こえました」）
  const [showButtons, setShowButtons] = useState(false);
  const [buttonKind, setButtonKind] = useState<"yesno" | "found">("yesno");
  const [current, setCurrent] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [savedFound, setSavedFound] = useState<string | null>(null);
  const pendingAnswer = useRef<((v: Answer) => void) | null>(null);
  const pendingFound = useRef<((v: FoundAns) => void) | null>(null);
  const placesRef = useRef<Place[]>([]);
  const placeById = (id: string) => placesRef.current.find((p) => p.id === id);

  const addLog = (s: string) => setLog((l) => [`${new Date().toLocaleTimeString("ja-JP")} ${s}`, ...l].slice(0, 60));

  useEffect(() => {
    if (!canListen()) addLog("この端末では聞き取りが使えません（ボタンで答えられます）");
  }, []);

  // 聞こえた答えを次の言葉の頭で声に出して返す（「なかったんですね。」など）
  const ack = useRef("");
  const say = async (text: string) => {
    const a = ack.current;
    ack.current = "";
    const t = a && !startsWithAck(text) ? a + text : text;
    if (!t) return;
    setSaid(t);
    setStage("speaking");
    await speak(t);
  };
  // 次の言葉まで間があくとき（Claude に聞く間など）は、先に返事だけ言う
  const flushAck = async () => {
    if (ack.current) await say("");
  };

  // 答えを受け取ったら、すぐ音と表示で知らせる（間があくと、何度も言い直してしまうため）
  // 父は画面の字を見ないので、音に加えて、声に出した答えをそのまま声で返す（ボタンのときは返さない）
  const gotIt = (text: string, ans: boolean | FoundKind | null) => {
    if (text) {
      setHeard(text);
      ack.current = echoOf(ans);
    }
    setHeardOk(true);
    beep();
  };

  const hear = async (opts: { quick?: boolean } = {}): Promise<string> => {
    setHeard("");
    setHeardOk(false);
    setStage("listening");
    const r = await listen({ onPartial: setHeard, quickCut: opts.quick ? isQuickAnswer : undefined });
    addLog(`聞き取り: 「${r.text}」${r.error ? ` エラー=${r.error}` : ""}`);
    return r.text;
  };

  // 質問して、はい／いいえを声かボタンの早い方で受け取る。どちらでもない話は text に入る
  const ask = async (question: string, opts: { glassesMeansYes?: boolean } = {}): Promise<Answer> => {
    await say(question);
    setButtonKind("yesno");
    setShowButtons(true);
    const byButton = new Promise<Answer>((res) => (pendingAnswer.current = res));
    const byVoice = hear({ quick: true }).then((text) => {
      if (opts.glassesMeansYes && understand(text).glasses) return { ans: true, text };
      return { ans: yesNo(text), text };
    });
    const a = await Promise.race([byButton, byVoice]);
    if (a.ans !== null) gotIt(a.text, a.ans);
    stopListening();
    pendingAnswer.current = null;
    setShowButtons(false);
    return a;
  };

  // 探しに行ってもらい、「あった／なかった／取り消し／休む」を待つ。
  // 歩きながらのつぶやき・テレビの声・黙っている間は聞き流して待ち続ける（WAIT_MS まで）。
  // 画面にも、答えと分かった言葉だけを出す。ボタンでも答えられる
  const waitFound = async (question: string, opts: { walking?: boolean } = {}): Promise<FoundAns> => {
    const walking = opts.walking ?? true;
    await say(question);
    setButtonKind("found");
    setShowButtons(true);
    setWaiting(true);
    const askedAt = Date.now();
    let done = false;
    const byButton = new Promise<FoundAns>((res) => (pendingFound.current = res));
    const byVoice = (async (): Promise<FoundAns> => {
      for (let round = 0; round < 2 && !done; round++) {
        const until = Date.now() + WAIT_MS;
        while (!done && Date.now() < until) {
          setHeard("");
          setHeardOk(false);
          setStage("listening");
          const r = await listen({
            onPartial: (t) => setHeard(answerWhileWaiting(t) ? t : ""),
            quickCut: (t) => answerWhileWaiting(t) !== null && isQuickAnswer(t),
            maxMs: 30000,
            silenceMs: 2500,
          });
          if (done) break;
          if (r.text) addLog(`聞き取り: 「${r.text}」`);
          const ans = answerWhileWaiting(r.text);
          if (ans === "unsure" && walking && Date.now() - askedAt < NOD_MS) {
            addLog("（歩き出してすぐの「はい」はうなずきとして聞き流し）");
            continue;
          }
          if (ans) return { ans, text: r.text };
          // 「なかった。そういえば本を読んでた」のように、答えと手がかりが一緒の話
          if (r.text.length <= 40 && foundAnswer(r.text) === "not" && hasClue(r.text)) return { ans: "not", text: r.text };
          if (r.error === "not-allowed" || r.error === "service-not-allowed") return await byButton;
        }
        if (!done && round === 0) await say("ゆっくりで大丈夫です。あったか、なかったか、教えてください。");
      }
      return { ans: null, text: "" };
    })();
    const a = await Promise.race([byButton, byVoice]);
    done = true;
    stopListening();
    if (a.ans) gotIt(a.text, a.ans);
    pendingFound.current = null;
    setShowButtons(false);
    setWaiting(false);
    return a;
  };

  // 見つかった場所を保存する前に「〜ですね？」と短く確かめる。違えば言い直してもらう
  const confirmFound = async (place: Place): Promise<string | null> => {
    let candidate: Place | null = place;
    for (let i = 0; i < 2 && candidate; i++) {
      const c = await ask(`${candidate.name}ですね？`);
      if (c.ans === true) return candidate.name;
      const spoken = c.text ? matchSpokenPlace(c.text, placesRef.current) : null;
      if (spoken) {
        candidate = placeById(spoken.placeId) ?? null;
        continue;
      }
      await say("どこにありましたか？");
      const where = await hear();
      const m = where ? matchSpokenPlace(where, placesRef.current) : null;
      candidate = m ? placeById(m.placeId) ?? null : null;
    }
    return null;
  };

  const search = async (utterances: string[]) => {
    const rec: SearchRecord = {
      at: new Date().toISOString(),
      utterances: [...utterances],
      checked: [],
      ended: "stopped",
      practice: isPractice() || undefined,
    };
    setStage("searching");
    setChecked([]);

    const home = getHomePlaces();
    placesRef.current = [BODY_CHECK, ...home];
    const acts = getActivities();
    const now = currentTime();
    const found = foundCounts();
    const hours = foundHours();
    const said = utterances.join("。");

    // 手がかりの場所: まず設定の「していたこと → 場所」、なければ Claude に候補の中から選んでもらう
    // 優先順: 本人がその場で言った場所 → 設定のつながり → Claude
    const findClue = async (text: string, candidates: Place[]): Promise<Clue | null> => {
      const spoken = matchSpokenPlace(text, candidates);
      if (spoken) {
        addLog(`手がかり（本人の話）: ${placeById(spoken.placeId)?.name}`);
        return spoken;
      }
      const bySettings = matchActivity(text, acts, candidates);
      if (bySettings) {
        addLog(`手がかり（設定）: ${placeById(bySettings.placeId)?.name}`);
        return bySettings;
      }
      if (!hasClue(text) || candidates.length < 2) return null;
      const rr = await rerank(text, candidates, now.getHours());
      const c = clueFromRerank(rr, candidates);
      addLog(`手がかり（Claude ${rr.source} ${rr.ms}ms${rr.note ? ` / ${rr.note}` : ""}）: ${c ? placeById(c.placeId)?.name : "なし"}`);
      return c;
    };

    // 返事を待つ間に「一緒に探しましょう」を読み上げる
    const pendingClue = findClue(said, home);
    await say("眼鏡を探しているんですね。一緒に探しましょう。");
    const clue = await pendingClue;
    rec.rerankSource = clue?.by === "claude" ? "claude" : "program";
    const plan = initialPlan({ home, found, now, clue, hours });
    let queue: Step[] = plan.first;
    let rest: Step[] = plan.rest;
    addLog(`順番: ${queue.map((s) => s.place.name).join("、")} ／ 残り: ${rest.map((s) => s.place.name).join("、")}`);

    let index = 0;
    let prevBody = false;
    let inRest = false;
    let toldHowToAnswer = false;
    let last: Step | null = null; // ひとつ前に「なかった」と答えた場所（取り消し用）
    while (queue.length > 0 || rest.length > 0) {
      if (queue.length === 0) {
        // よく置く場所にはなかった → 聞き返さずに、次の候補を続けて出す（自分で考えるほうが大変、という父の声から）
        if (!inRest) await say("よく置く場所にはなかったですね。ほかの場所を言いますね。休むときは「休む」と言ってください。");
        inRest = true;
        queue = rest.splice(0, 4);
      }
      const step = queue.shift()!;
      const place = step.place;
      setCurrent(place.id);
      const q = question({ step, index, afterBody: prevBody, explain: !toldHowToAnswer && !place.body });
      if (!place.body) toldHowToAnswer = true;
      let a = await waitFound(q);
      index++;

      // 「さっきの取り消し」「違う」→ ひとつ前の場所をもう一度
      if (a.ans === "undo") {
        queue.unshift(step);
        if (last) {
          rec.checked.pop();
          setChecked([...rec.checked]);
          queue.unshift(last);
          await say(`わかりました。さっきの${last.place.name}を、もう一度聞きますね。`);
          last = null;
        } else {
          await say("わかりました。もう一度聞きますね。");
        }
        prevBody = false;
        continue;
      }
      prevBody = !!place.body;

      // 「休む」「もういい」→ 見た場所を残して休む
      if (a.ans === "rest") {
        rec.checked.push(place.name);
        rec.ended = "rest";
        saveRecord(rec);
        setStage("done");
        setCurrent(null);
        await say("わかりました。見た場所は残しておきます。少し休みましょう。また呼んでくださいね。");
        return;
      }

      // 「はい」「うん」だけのときは、返事のつもりかもしれないので確かめる
      if (a.ans === "unsure") {
        const c = await waitFound("眼鏡、見つかりましたか？", { walking: false });
        a = c.ans === "unsure" ? { ans: "found", text: c.text } : c;
      }

      if (a.ans === "found") {
        const at = await confirmFound(place);
        rec.checked.push(place.name);
        setChecked([...rec.checked]);
        rec.foundAt = at ?? undefined;
        rec.ended = "found";
        saveRecord(rec);
        setSavedFound(at);
        setStage("done");
        setCurrent(null);
        await say(
          at
            ? `あったね。よかった。${at}でしたね。覚えておきます。`
            : "あったね。よかった。場所は記録しないでおきますね。",
        );
        return;
      }

      if (a.ans === null && !a.text) {
        // 長いあいだ返事がなかった
        rec.checked.push(place.name);
        rec.ended = "rest";
        saveRecord(rec);
        setStage("done");
        setCurrent(null);
        await say("少し休みましょうか。見た場所は残しておきます。また呼んでくださいね。");
        return;
      }

      rec.checked.push(place.name);
      setChecked([...rec.checked]);
      last = step;

      // 「なかった。そういえば本を読んでた」のような話は手がかりとして、その場所を先に
      if (a.text && (a.ans === null || (a.ans === "not" && hasClue(a.text)))) {
        rec.utterances.push(a.text);
        const remaining = [...queue, ...rest].map((s) => s.place).filter((p) => !p.body);
        await flushAck();
        const c = await findClue(a.text, remaining);
        if (c) {
          const moved = moveToFront(queue, rest, c);
          queue = moved.queue;
          rest = moved.rest;
          prevBody = false;
        } else if (a.ans === null) {
          await say("なるほど。");
        }
      }
    }
    rec.ended = "all-checked";
    saveRecord(rec);
    setStage("done");
    setCurrent(null);
    await say("思いつく場所は、ひととおり見ました。見た場所は残しておきます。少し休んで、また一緒に探しましょう。");
  };

  const begin = async () => {
    if (running) return;
    setRunning(true);
    prepareBeep();
    try {
      await say("どうしましたか？");
      const first = await hear();
      if (understand(first).glasses) return await search([first]);

      for (let i = 0; i < 2; i++) {
        const a = await ask("眼鏡を探していますか？", { glassesMeansYes: true });
        if (a.ans === true) return await search([first, a.text].filter(Boolean));
        if (a.ans === false) {
          setStage("done");
          await say("わかりました。また呼んでくださいね。");
          return;
        }
      }
      setStage("idle");
      await say("また呼んでくださいね。画面をさわると、もう一度聞きます。");
    } finally {
      setRunning(false);
    }
  };

  const answerFound = (v: "found" | "not" | "undo" | "rest") => {
    stopListening();
    if (pendingFound.current) {
      window.speechSynthesis?.cancel();
      pendingFound.current({ ans: v, text: "" });
    }
  };

  const answer = (v: boolean) => {
    stopListening();
    if (pendingAnswer.current) {
      window.speechSynthesis?.cancel();
      pendingAnswer.current({ ans: v, text: "" });
    }
  };

  const reset = () => {
    setSavedFound(null);
    setStage("idle");
    setSaid("");
    setHeard("");
    setHeardOk(false);
    setCurrent(null);
    setChecked([]);
  };

  const currentPlace = current ? placeById(current) : null;
  const [practice, setPractice] = useState(false);
  useEffect(() => setPractice(isPractice()), []);

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {practice && <div className="muted" style={{ textAlign: "center" }}>練習モード（記録は練習として分けて残します）</div>}
      {stage === "idle" && !running ? (
        <button className="touch-area" onClick={begin}>
          さわってください
        </button>
      ) : (
        <div className="talk">
          {currentPlace && <div className="place">{currentPlace.name}</div>}
          <div className="said">{said}</div>
          <div className={`mic ${stage === "listening" ? "on" : ""}`}>🎤</div>
          {waiting && <div className="wait-note">戻ったら「あった」「なかった」と教えてください</div>}
          {heard && (
            <div className={`heard-box ${heardOk ? "ok" : ""}`}>
              <div className="who">{heardOk ? "✓ 聞こえました" : "あなたの声："}</div>
              <div className="heard">「{heard}」</div>
            </div>
          )}
          {showButtons && buttonKind === "yesno" && (
            <div className="answer-buttons">
              <button className="big-button yes" onClick={() => answer(true)}>はい</button>
              <button className="big-button no" onClick={() => answer(false)}>いいえ</button>
            </div>
          )}
          {showButtons && buttonKind === "found" && (
            <div className="answer-buttons">
              <button className="big-button yes" onClick={() => answerFound("found")}>あった</button>
              <button className="big-button no" onClick={() => answerFound("not")}>なかった</button>
            </div>
          )}
          {showButtons && buttonKind === "found" && (
            <div className="answer-buttons">
              <button className="big-button undo" onClick={() => answerFound("undo")}>さっきの取り消し</button>
              <button className="big-button undo" onClick={() => answerFound("rest")}>休む</button>
            </div>
          )}
          {checked.length > 0 && (
            <div className="checked muted">見た場所: {checked.join("、")}</div>
          )}
          {stage === "done" && !running && savedFound && (
            <button
              className="big-button undo"
              onClick={() => {
                updateLatestFound(undefined);
                setSavedFound(null);
                speak("記録を取り消しました。");
              }}
            >
              見つかった場所の記録を取り消す
            </button>
          )}
          {stage === "done" && !running && (
            <button className="big-button" style={{ minHeight: 80, fontSize: 28 }} onClick={reset}>
              はじめにもどる
            </button>
          )}
        </div>
      )}
      <details className="muted" style={{ marginTop: "auto" }}>
        <summary>記録（家族向け）</summary>
        <div className="log">{log.join("\n")}</div>
      </details>
    </main>
  );
}
