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

let currentRec: { stop: () => void } | null = null;

// ボタンで答えたときなど、聞き取りを途中で止める（読み上げを拾わないように）
export function stopListening() {
  try {
    currentRec?.stop();
  } catch {
    /* すでに止まっている */
  }
}

// 「〜けど」「〜て」など、話の途中で終わっていそうなら長めに待つ
const UNFINISHED = /(けど|けれど|が|て|で|から|ので|し|と|は|を|に|ね|、|えー|あの|えっと)$/;

// 話し終わって silenceMs 黙ったら区切る（途中っぽければ unfinishedMs まで待つ）。
// 何も話さなければ maxMs で終わる。父はゆっくり間をあけて話すので、既定値は長め。
export function listen(
  opts: {
    silenceMs?: number;
    unfinishedMs?: number;
    maxMs?: number;
    onPartial?: (t: string) => void;
    // 「はい」「あった」のような短い答えだと分かったら、長く待たずにすぐ区切る（何度も言わせないため）
    quick?: (t: string) => boolean;
    quickMs?: number;
  } = {},
): Promise<ListenResult> {
  const silenceMs = opts.silenceMs ?? 3000;
  const unfinishedMs = opts.unfinishedMs ?? 5000;
  const maxMs = opts.maxMs ?? 20000;
  return new Promise((resolve) => {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return resolve({ text: "", error: "unsupported" });
    const rec = new Ctor();
    currentRec = rec;
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
      const wait = opts.quick?.(all.trim())
        ? opts.quickMs ?? 700
        : UNFINISHED.test(all.trim())
          ? unfinishedMs
          : silenceMs;
      silence = setTimeout(() => rec.stop(), wait);
    };
    rec.onerror = (e: any) => {
      error = e.error ?? "unknown";
    };
    rec.onend = () => {
      if (currentRec === rec) currentRec = null;
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

// 聞き取れた合図の短い音。iPad は画面をさわったあとでないと音が出せないので、最初のタップで unlockChime() を呼ぶ
let audioCtx: AudioContext | null = null;
export function unlockChime() {
  try {
    const w = window as any;
    audioCtx = audioCtx ?? new (w.AudioContext || w.webkitAudioContext)();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}
export function chime() {
  const ctx = audioCtx;
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    for (const [f, d] of [[880, 0], [1320, 0.12]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.25, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(t + d);
      o.stop(t + d + 0.3);
    }
  } catch {
    /* 音が出なくても流れは止めない */
  }
}
