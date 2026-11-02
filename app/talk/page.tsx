"use client";

// アプリの方から声で話しかけるページ。字を読まなくても使えることを目指す。
// 流れ: 画面をさわる →「どうしましたか？」→ 返事を聞く → 眼鏡なら「一緒に探しましょう」
// 返事がよく分からないときは「眼鏡を探していますか？」とはい／いいえで聞き直す。

import { useEffect, useRef, useState } from "react";
import { canListen, listen, speak } from "@/lib/voice";
import { understand, yesNo } from "@/lib/normalize";

type Stage = "idle" | "speaking" | "listening" | "found-intent" | "bye";

export default function Talk() {
  const [stage, setStage] = useState<Stage>("idle");
  const [said, setSaid] = useState(""); // アプリが今話していること（大きく表示）
  const [heard, setHeard] = useState(""); // 聞き取った言葉
  const [showButtons, setShowButtons] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const busy = useRef(false);
  const pendingAnswer = useRef<((v: boolean | null) => void) | null>(null);

  const addLog = (s: string) => setLog((l) => [`${new Date().toLocaleTimeString("ja-JP")} ${s}`, ...l].slice(0, 40));

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
    if (r.error === "not-allowed" || r.error === "service-not-allowed") setShowButtons(true);
    return r.text;
  };

  // はい／いいえを、声かボタンのどちらか早い方で受け取る
  const askYesNo = async (question: string): Promise<boolean | null> => {
    await say(question);
    setShowButtons(true);
    const byButton = new Promise<boolean | null>((res) => (pendingAnswer.current = res));
    const byVoice = hear().then((t) => {
      const u = understand(t);
      return u.glasses ? true : yesNo(t);
    });
    const ans = await Promise.race([byButton, byVoice]);
    pendingAnswer.current = null;
    return ans;
  };

  const startGlassesSearch = async () => {
    setShowButtons(false);
    setStage("found-intent");
    await say("眼鏡を探しているんですね。一緒に探しましょう。");
    // ここから先（一か所ずつ確かめる流れ）は11/4に作る
  };

  const begin = async () => {
    if (busy.current) return;
    busy.current = true;
    setShowButtons(false);
    try {
      await say("どうしましたか？");
      const first = await hear();
      if (understand(first).glasses) return await startGlassesSearch();

      for (let i = 0; i < 2; i++) {
        const ans = await askYesNo("眼鏡を探していますか？");
        if (ans === true) return await startGlassesSearch();
        if (ans === false) {
          setShowButtons(false);
          setStage("bye");
          await say("わかりました。また呼んでくださいね。");
          return;
        }
      }
      setStage("idle");
      await say("また呼んでくださいね。画面をさわると、もう一度聞きます。");
    } finally {
      busy.current = false;
      setStage((s) => (s === "found-intent" || s === "bye" ? s : "idle"));
    }
  };

  const answer = (v: boolean) => {
    if (pendingAnswer.current) {
      window.speechSynthesis?.cancel();
      pendingAnswer.current(v);
    }
  };

  const reset = () => {
    setStage("idle");
    setSaid("");
    setHeard("");
  };

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {stage === "idle" && !busy.current ? (
        <button className="touch-area" onClick={begin}>
          さわってください
        </button>
      ) : (
        <div className="talk">
          <div className="said">{said}</div>
          <div className={`mic ${stage === "listening" ? "on" : ""}`} aria-label={stage === "listening" ? "聞いています" : ""}>
            🎤
          </div>
          <div className="heard">{heard}</div>
          {showButtons && (
            <div className="answer-buttons">
              <button className="big-button yes" onClick={() => answer(true)}>はい</button>
              <button className="big-button no" onClick={() => answer(false)}>いいえ</button>
            </div>
          )}
          {(stage === "found-intent" || stage === "bye") && (
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
