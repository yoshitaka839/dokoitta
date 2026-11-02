"use client";

// アプリの方から声で話しかけて、眼鏡を一か所ずつ一緒に確かめるページ。
// 流れ:
//  さわる →「どうしましたか？」→ 眼鏡の話か確かめる
//  → 候補の順番をプログラムで決め、本人の話に手がかりがあれば Claude が候補の中で並べ替える（①）
//  → 手がかりがなければ体まわり（頭の上・首元・ポケット）から順に確かめる（②）
//  → 4か所ごとに「続けますか？」。休むなら見た場所を残す（③）
// 「必ず見つかる」とは言わない。

import { useEffect, useRef, useState } from "react";
import { canListen, listen, speak } from "@/lib/voice";
import { foundAnswer, understand, yesNo } from "@/lib/normalize";
import { getPlaces, type Place } from "@/lib/places";
import { scorePlaces } from "@/lib/rank";
import { foundCounts, saveRecord, type SearchRecord } from "@/lib/history";

type Stage = "idle" | "speaking" | "listening" | "searching" | "done";
type Answer = { ans: boolean | null; text: string };
type FoundAns = { ans: "found" | "not" | "unsure" | null; text: string };

const PER_ROUND = 4; // この数を確かめるごとに、続けるか休むか聞く

async function rerank(utterance: string, candidates: Place[]) {
  const ids = candidates.map((p) => p.id);
  try {
    const r = await fetch("/api/rerank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        utterance,
        candidates: candidates.map((p) => ({ id: p.id, name: p.name })),
        hour: new Date().getHours(),
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
  const [showButtons, setShowButtons] = useState(false);
  const [buttonKind, setButtonKind] = useState<"yesno" | "found">("yesno");
  const [current, setCurrent] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const pendingAnswer = useRef<((v: Answer) => void) | null>(null);
  const pendingFound = useRef<((v: FoundAns) => void) | null>(null);
  const placesRef = useRef<Place[]>([]);
  const placeById = (id: string) => placesRef.current.find((p) => p.id === id);

  const addLog = (s: string) => setLog((l) => [`${new Date().toLocaleTimeString("ja-JP")} ${s}`, ...l].slice(0, 60));

  useEffect(() => {
    if (!canListen()) addLog("この端末では聞き取りが使えません（ボタンで答えられます）");
  }, []);

  const say = async (text: string) => {
    setSaid(text);
    setStage("speaking");
    await speak(text);
  };

  const hear = async (): Promise<string> => {
    setHeard("");
    setStage("listening");
    const r = await listen({ onPartial: setHeard });
    addLog(`聞き取り: 「${r.text}」${r.error ? ` エラー=${r.error}` : ""}`);
    return r.text;
  };

  // 質問して、はい／いいえを声かボタンの早い方で受け取る。どちらでもない話は text に入る
  const ask = async (question: string, opts: { glassesMeansYes?: boolean } = {}): Promise<Answer> => {
    await say(question);
    setButtonKind("yesno");
    setShowButtons(true);
    const byButton = new Promise<Answer>((res) => (pendingAnswer.current = res));
    const byVoice = hear().then((text) => {
      if (opts.glassesMeansYes && understand(text).glasses) return { ans: true, text };
      return { ans: yesNo(text), text };
    });
    const a = await Promise.race([byButton, byVoice]);
    pendingAnswer.current = null;
    setShowButtons(false);
    return a;
  };

  // 「ありましたか？」専用。「あった／なかった」を声かボタンで受け取る
  const askFound = async (question: string): Promise<FoundAns> => {
    await say(question);
    setButtonKind("found");
    setShowButtons(true);
    const byButton = new Promise<FoundAns>((res) => (pendingFound.current = res));
    const byVoice = hear().then((text) => ({ ans: foundAnswer(text), text }));
    const a = await Promise.race([byButton, byVoice]);
    pendingFound.current = null;
    setShowButtons(false);
    return a;
  };

  const search = async (utterances: string[]) => {
    const rec: SearchRecord = { at: new Date().toISOString(), utterances: [...utterances], checked: [], ended: "stopped" };
    setStage("searching");
    setChecked([]);

    placesRef.current = getPlaces();
    const programOrder = scorePlaces(placesRef.current, foundCounts()).map((s) => s.place);
    let order = programOrder.map((p) => p.id);
    // 返事を待つ間に「一緒に探しましょう」を読み上げて、待ち時間を感じにくくする
    const pending = rerank(utterances.join("。"), programOrder);
    await say("眼鏡を探しているんですね。一緒に探しましょう。");
    const rr = await pending;
    order = rr.order;
    rec.rerankSource = rr.source;
    addLog(`並べ替え: ${rr.source}（${rr.ms}ms${rr.note ? ` / ${rr.note}` : ""}）→ ${order.map((id) => placeById(id)?.name).join("、")}`);
    let reason = rr.reason;

    const queue = [...order];
    let sinceAsk = 0;
    while (queue.length > 0) {
      const id = queue.shift()!;
      const place = placeById(id)!;
      setCurrent(id);
      const intro = reason ? `${reason}。` : "";
      reason = "";
      let a = await askFound(`${intro}${place.action}。ありましたか？`);
      if (a.ans === null && !a.text) a = await askFound("ありましたか？");
      // 「はい」「うん」だけのときは、返事のつもりかもしれないので確かめる
      if (a.ans === "unsure") {
        const c = await askFound("眼鏡、見つかりましたか？");
        a = c.ans === "unsure" ? { ans: "found", text: c.text } : c;
      }
      rec.checked.push(place.name);
      setChecked([...rec.checked]);

      if (a.ans === "found") {
        rec.foundAt = place.name;
        rec.ended = "found";
        saveRecord(rec);
        setStage("done");
        setCurrent(id);
        await say(`あったね。よかった。${place.name}でしたね。覚えておきます。`);
        return;
      }

      // 「いいえ」以外の話（例:「さっき新聞を読んでた」）は手がかりとして、残りを並べ替える
      if (a.ans === null && a.text) {
        rec.utterances.push(a.text);
        const r2 = await rerank(rec.utterances.join("。"), queue.map((q) => placeById(q)!));
        addLog(`手がかりで並べ替え: ${r2.source} → ${r2.order.map((q) => placeById(q)?.name).join("、")}`);
        queue.splice(0, queue.length, ...r2.order);
        reason = r2.reason;
        if (!reason) await say("なるほど。");
      }

      sinceAsk++;
      if (queue.length > 0 && sinceAsk >= PER_ROUND) {
        sinceAsk = 0;
        const c = await ask(`ここまで${rec.checked.length}か所見ました。続けますか？`);
        if (c.ans !== true) {
          rec.ended = "rest";
          saveRecord(rec);
          setStage("done");
          setCurrent(null);
          await say("わかりました。見た場所は残しておきます。少し休みましょう。また呼んでくださいね。");
          return;
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

  const answerFound = (v: "found" | "not") => {
    if (pendingFound.current) {
      window.speechSynthesis?.cancel();
      pendingFound.current({ ans: v, text: "" });
    }
  };

  const answer = (v: boolean) => {
    if (pendingAnswer.current) {
      window.speechSynthesis?.cancel();
      pendingAnswer.current({ ans: v, text: "" });
    }
  };

  const reset = () => {
    setStage("idle");
    setSaid("");
    setHeard("");
    setCurrent(null);
    setChecked([]);
  };

  const currentPlace = current ? placeById(current) : null;

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {stage === "idle" && !running ? (
        <button className="touch-area" onClick={begin}>
          さわってください
        </button>
      ) : (
        <div className="talk">
          {currentPlace && <div className="place">{currentPlace.name}</div>}
          <div className="said">{said}</div>
          <div className={`mic ${stage === "listening" ? "on" : ""}`}>🎤</div>
          <div className="heard">{heard}</div>
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
          {checked.length > 0 && (
            <div className="checked muted">見た場所: {checked.join("、")}</div>
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
