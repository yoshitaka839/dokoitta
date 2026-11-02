// iPad の Safari に入っている読み上げ（speechSynthesis）と聞き取り（webkitSpeechRecognition）を
// Promise で使えるようにする小さな部品。音声はサーバーに送らない。

export function canListen(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function speak(text: string, rate = 0.85): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolve();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = rate;
    const ja = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("ja"));
    if (ja) u.voice = ja;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    u.onend = finish;
    u.onerror = finish;
    // onend が来ない端末のための保険（1文字あたり約0.25秒）
    setTimeout(finish, 1500 + text.length * 250);
    window.speechSynthesis.speak(u);
  });
}

export type ListenResult = { text: string; error?: string };

// 話し終わって silenceMs 黙ったら区切る。何も話さなければ maxMs で終わる。
export function listen(opts: { silenceMs?: number; maxMs?: number; onPartial?: (t: string) => void } = {}): Promise<ListenResult> {
  const silenceMs = opts.silenceMs ?? 1500;
  const maxMs = opts.maxMs ?? 8000;
  return new Promise((resolve) => {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return resolve({ text: "", error: "unsupported" });
    const rec = new Ctor();
    rec.lang = "ja-JP";
    rec.interimResults = true;
    rec.continuous = true;
    let text = "";
    let error: string | undefined;
    let silence: ReturnType<typeof setTimeout> | null = null;
    const max = setTimeout(() => rec.stop(), maxMs);
    rec.onresult = (e: any) => {
      let all = "";
      for (let i = 0; i < e.results.length; i++) all += e.results[i][0].transcript;
      text = all;
      opts.onPartial?.(all);
      if (silence) clearTimeout(silence);
      silence = setTimeout(() => rec.stop(), silenceMs);
    };
    rec.onerror = (e: any) => {
      error = e.error ?? "unknown";
    };
    rec.onend = () => {
      clearTimeout(max);
      if (silence) clearTimeout(silence);
      resolve({ text: text.trim(), error });
    };
    try {
      rec.start();
    } catch (err) {
      clearTimeout(max);
      resolve({ text: "", error: String(err) });
    }
  });
}
