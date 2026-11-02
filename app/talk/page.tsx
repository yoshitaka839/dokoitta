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
import { understand, yesNo } from "@/lib/normalize";
import { placeById } from "@/lib/places";
import { scorePlaces } from "@/lib/rank";
import { foundCounts, saveRecord, type SearchRecord } from "@/lib/history";

type Stage = "idle" | "speaking" | "listening" | "searching" | "done";
type Answer = { ans: boolean | null; text: string };

const PER_ROUND = 4; // この数を確かめるごとに、続けるか休むか聞く

async function rerank(utterance: string, candidates: string[]) {
  try {
    const r = await fetch("/api/rerank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ utterance, candidates }),
    });
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()) as { order: string[]; reason: string; source: "claude" | "program"; note?: string; ms: number };
  } catch (e) {
    return { order: candidates, reason: "", source: "program" as const, note: String(e), ms: 0 };
  }
}

export default function Talk() {
  const [stage, setStage] = useState<Stage>("idle");
  const [said, setSaid] = useState("");
  const [heard, setHeard] = useState("");
  const [showButtons, setShowButtons] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const pendingAnswer = useRef<((v: Answer) => void) | null>(null);

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

  const search = async (utterances: string[]) => {
    const rec: SearchRecord = { at: new Date().toISOString(), utterances: [...utterances], checked: [], ended: "stopped" };
    setStage("searching");
    setChecked([]);

    let order = scorePlaces(foundCounts()).map((s) => s.place.id);
    // 話していただく間に Claude に並べ替えを頼む（返事を待つ間に「一緒に探しましょう」を読み上げる）
    const pending = rerank(utterances.join("。"), order);
    await say("眼鏡を探しているんですね。一緒に探しましょう。");
    const rr = await pending;
    order = rr.order;
    rec.rerankSource = rr.source;
    addLog(`並べ替え: ${rr.source}（${rr.ms}ms${rr.note ? ` / ${rr.note}` : ""}）→ ${order.join(", ")}`);
    let reason = rr.reason;

    const queue = [...order];
    let sinceAsk = 0;
    while (queue.length > 0) {
      const id = queue.shift()!;
      const place = placeById(id)!;
      setCurrent(id);
      const intro = reason ? `${reason}。` : "";
      reason = "";
      let a = await ask(`${intro}${place.action}。ありましたか？`);
      if (a.ans === null && !a.text) a = await ask("ありましたか？");
      rec.checked.push(id);
      setChecked([...rec.checked]);

      if (a.ans === true) {
        rec.foundAt = id;
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
        const r2 = await rerank(rec.utterances.join("。"), queue);
        addLog(`手がかりで並べ替え: ${r2.source} → ${r2.order.join(", ")}`);
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
          {showButtons && (
            <div className="answer-buttons">
              <button className="big-button yes" onClick={() => answer(true)}>はい</button>
              <button className="big-button no" onClick={() => answer(false)}>いいえ</button>
            </div>
          )}
          {checked.length > 0 && (
            <div className="checked muted">見た場所: {checked.map((id) => placeById(id)?.name).join("、")}</div>
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
