"use client";

import { useEffect, useRef, useState } from "react";

// iPad の Safari が持つ音声認識（webkitSpeechRecognition）と読み上げ（speechSynthesis）を試すページ。
// サーバーにもClaudeにも何も送らない。

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

function getRecognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export default function VoiceTest() {
  const [supported, setSupported] = useState<{ stt: boolean; tts: boolean } | null>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [finalText, setFinalText] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const recRef = useRef<Recognition | null>(null);
  const startedAt = useRef<number>(0);

  const addLog = (s: string) => {
    const t = new Date().toLocaleTimeString("ja-JP");
    setLog((l) => [`${t} ${s}`, ...l].slice(0, 50));
  };

  useEffect(() => {
    setSupported({ stt: !!getRecognitionCtor(), tts: "speechSynthesis" in window });
    addLog(`端末: ${navigator.userAgent}`);
  }, []);

  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = 0.9;
    const ja = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("ja"));
    if (ja) u.voice = ja;
    window.speechSynthesis.speak(u);
  };

  const start = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      addLog("このブラウザは音声認識に対応していません");
      return;
    }
    // iOS では最初の読み上げもボタン操作の中で始める必要があるため、ここで空の読み上げを一度呼ぶ
    speak("");
    const rec = new Ctor();
    rec.lang = "ja-JP";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      startedAt.current = performance.now();
      setListening(true);
      addLog("聞き取り開始");
    };
    rec.onresult = (e: any) => {
      let fin = "";
      let mid = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript;
        else mid += r[0].transcript;
      }
      setInterim(mid);
      if (fin) {
        const ms = Math.round(performance.now() - startedAt.current);
        setFinalText(fin);
        addLog(`確定: 「${fin}」（開始から${ms}ms）`);
        speak(`${fin}、と聞こえました。`);
      }
    };
    rec.onerror = (e: any) => addLog(`エラー: ${e.error ?? "不明"}`);
    rec.onend = () => {
      setListening(false);
      setInterim("");
      addLog("聞き取り終了");
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch (err) {
      addLog(`開始できませんでした: ${String(err)}`);
    }
  };

  const stop = () => recRef.current?.stop();

  return (
    <main>
      <h1>声の聞き取りテスト</h1>
      <p className="muted">
        ボタンを押して「眼鏡、どこいった？」などと話してください。聞き取った言葉を読み上げます。声はこの端末の中だけで処理し、記録は送りません。
      </p>
      {supported && (
        <div className="card muted">
          音声認識: {supported.stt ? "使えます" : "使えません"} ／ 読み上げ: {supported.tts ? "使えます" : "使えません"}
        </div>
      )}
      <button
        className={`big-button ${listening ? "listening" : ""}`}
        onClick={listening ? stop : start}
        disabled={!supported?.stt}
      >
        {listening ? "聞いています…（押すと止まる）" : "🎤 話す"}
      </button>
      <div className="card">
        <div className="muted">聞き取った言葉</div>
        <div style={{ fontSize: 32, minHeight: 52 }}>{finalText || interim || "—"}</div>
      </div>
      <button className="big-button" style={{ minHeight: 80, fontSize: 28 }} onClick={() => speak("眼鏡、一緒に探しましょう。まず、頭の上を触ってみてください。")}>
        🔊 読み上げだけ試す
      </button>
      <div className="card">
        <div className="muted">記録（スクリーンショットで送ってください）</div>
        <div className="log">{log.join("\n")}</div>
      </div>
    </main>
  );
}
