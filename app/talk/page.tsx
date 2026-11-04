"use client";

// 本人が使う画面。仕様書 docs/SPEC.md の 4章（流れ）・6章（声）・7章（画面）・15章（言葉）。
//  本人がアイコンから開く → 押せそうなボタン1つ「ここを押すと／さがしはじめます」
//  → 押したら質問せず、すぐ1か所目: 机の気づきにくい場所（2か所）→ 体のまわり → 置いた場所（日課・記録）
//  →「なかった」なら短く返してすぐ次へ。「あった」なら見た目を確かめて「ありましたね。覚えておきます。」
//  → あきらめ・返事なしは「わかりました。次に見るなら、〜です。」で終え、家族ページに残す
// 言葉は短く。画面には場所の名前だけを大きく出し、アプリが話す文は出さない（読み上げると答えに聞こえるため）。
// 「必ず見つかる」とは言わない。

import { useEffect, useRef, useState } from "react";
import { beep, canListen, keepAwake, listen, prepareBeep, speak, stopListening } from "@/lib/voice";
import { answerWhileWaiting, echoOf, foundAnswer, looksLikeReadAloud, quickWaitMs, yesNo, type FoundKind } from "@/lib/normalize";
import { BODY_CHECK, getActivities, getHomePlaces, usingSamplePlaces, type Place } from "@/lib/places";
import { effectiveTime, loadTryTime } from "@/lib/trytime";
import { getRoutineText, parseRoutineText, withRoutinePlaces } from "@/lib/routine";
import { clueFromRerank, hasClue, initialPlan, matchActivity, matchSpokenPlace, moveToFront, question, type Clue, type Step } from "@/lib/plan";
import { foundCounts, foundHours, saveRecord, updateLatestFound, type SearchRecord } from "@/lib/history";
import { getDeskSpots, loadProfile, lookQuestion } from "@/lib/profile";
import { P } from "@/lib/phrases";

type Stage = "idle" | "pressed" | "searching" | "done";
type FoundAns = { ans: FoundKind | null; text: string };

const NEAR_WAIT_MS = 30 * 1000; // 机・体のまわりなど手元の場所
const FAR_WAIT_MS = 3 * 60 * 1000; // 離れた場所（歩いて確かめに行く）
const LOOK_WAIT_MS = 10 * 1000; // 見た目の確かめ（返事がなければ見つかった扱い）

// 練習モード: /talk?practice=1 か ?at=… のとき、または /settings で「試すときの時刻」を指定しているとき。
// 記録は「練習」として分け、よく見つかる場所の回数に数えない
function urlParams(): URLSearchParams | null {
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return null;
  }
}
function isPractice(): boolean {
  const q = urlParams();
  return (!!q && (q.has("practice") || q.has("at"))) || loadTryTime() !== null;
}

// 順番を決める時刻: ?at=15:50 → 設定の「試すときの時刻」 → 今の時刻
function currentTime(): Date {
  return effectiveTime(urlParams()?.get("at") ?? null, loadTryTime()).date;
}

async function rerank(utterance: string, candidates: Place[], hour = new Date().getHours()) {
  const ids = candidates.map((p) => p.id);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000); // 2秒を超えたらプログラムの順のまま
    const r = await fetch("/api/rerank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ utterance, candidates: candidates.map((p) => ({ id: p.id, name: p.name })), hour }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()) as { order: string[]; reason: string; source: "claude" | "program"; note?: string; ms: number };
  } catch (e) {
    return { order: ids, reason: "", source: "program" as const, note: String(e), ms: 0 };
  }
}

export default function Talk() {
  const [stage, setStage] = useState<Stage>("idle");
  const [listening, setListening] = useState(false);
  const [heardFlash, setHeardFlash] = useState(false); // 答えを受け取った瞬間の緑の合図
  const [buttons, setButtons] = useState<"found" | "yesno" | null>(null);
  const [current, setCurrent] = useState<Place | null>(null);
  const [endText, setEndText] = useState<string[]>([]); // 終わりの画面に大きく出す言葉
  const [savedFound, setSavedFound] = useState<string | null>(null);
  const [practice, setPractice] = useState(false);
  const [tryAt, setTryAt] = useState<string | null>(null);
  const pending = useRef<((v: FoundAns) => void) | null>(null);
  const saidSoFar = useRef<string[]>([]); // この回にアプリが話した文（読み上げを答えにしないため）
  const placesRef = useRef<Place[]>([]);
  const running = useRef(false);
  const toldNoMic = useRef(false);

  useEffect(() => {
    setPractice(isPractice());
    setTryAt(urlParams()?.get("at") ?? loadTryTime()?.time ?? null);
  }, []);

  const log = (s: string) => console.log(`[どこいった] ${s}`);

  // 話している間は聞き取らない（自分の声を答えにしない）
  const say = async (text: string) => {
    if (!text) return;
    stopListening();
    setListening(false);
    saidSoFar.current = [text, ...saidSoFar.current].slice(0, 20);
    await speak(text);
  };

  const flash = () => {
    beep();
    setHeardFlash(true);
    setTimeout(() => setHeardFlash(false), 900);
  };

  // 答えを待つ。声かボタンの早い方。黙っている間・つぶやき・テレビの声・読み上げは聞き流す。
  // waitMs 過ぎたら一度だけ「どうでしたか。」と言い、同じだけ待つ。それでもなければ ans: null
  const waitAnswer = async (opts: { waitMs: number; kind: "found" | "yesno"; reprompt?: boolean; screenWords: string[] }): Promise<FoundAns> => {
    setButtons(opts.kind);
    let done = false;
    const byButton = new Promise<FoundAns>((res) => (pending.current = res));
    const byVoice = (async (): Promise<FoundAns> => {
      const rounds = opts.reprompt === false ? 1 : 2;
      for (let round = 0; round < rounds && !done; round++) {
        const until = Date.now() + opts.waitMs;
        while (!done && Date.now() < until) {
          if (!canListen()) return await byButton;
          setListening(true);
          const r = await listen({ maxMs: Math.min(30000, Math.max(3000, until - Date.now())), silenceMs: 2500, quickWait: quickWaitMs });
          setListening(false);
          if (done) break;
          if (r.error === "not-allowed" || r.error === "service-not-allowed") {
            if (!toldNoMic.current) {
              toldNoMic.current = true;
              await say(P.noMic);
            }
            return await byButton;
          }
          if (!r.text) continue;
          log(`聞き取り「${r.text}」`);
          // アプリが話した文や画面の字を読み上げたような言葉は、答えにしない
          if (looksLikeReadAloud(r.text, [...saidSoFar.current, P.explain, ...opts.screenWords])) {
            log("（読み上げとして聞き流し）");
            continue;
          }
          if (opts.kind === "yesno") {
            const yn = yesNo(r.text);
            if (yn !== null) return { ans: yn ? "found" : "not", text: r.text };
            continue;
          }
          const ans = answerWhileWaiting(r.text);
          if (ans === "unsure") continue; // 「はい」だけは相づちのことがある
          if (ans) return { ans, text: r.text };
          // 「なかった。そういえば本を読んでた」のように、答えと手がかりが一緒の話
          if (r.text.length <= 40 && foundAnswer(r.text) === "not" && hasClue(r.text)) return { ans: "not", text: r.text };
          // 場所や、していたことの話（手がかり）
          if (r.text.length <= 40 && hasClue(r.text)) return { ans: null, text: r.text };
        }
        if (!done && round === 0 && rounds > 1) await say(P.reprompt);
      }
      return { ans: null, text: "" };
    })();
    const a = await Promise.race([byButton, byVoice]);
    done = true;
    stopListening();
    setListening(false);
    pending.current = null;
    setButtons(null);
    if (a.ans) flash();
    return a;
  };

  const press = (v: FoundKind) => {
    stopListening();
    window.speechSynthesis?.cancel();
    pending.current?.({ ans: v, text: "" });
  };

  const search = async () => {
    saidSoFar.current = [];
    const rec: SearchRecord = { at: new Date().toISOString(), utterances: [], checked: [], ended: "searching", practice: isPractice() || undefined };
    const profile = loadProfile();
    const desk = getDeskSpots();
    const baseHome = getHomePlaces();
    const routine = parseRoutineText(getRoutineText(usingSamplePlaces()), baseHome);
    const home = withRoutinePlaces(baseHome, routine);
    placesRef.current = [...desk, BODY_CHECK, ...home];
    const acts = getActivities();
    const now = currentTime();
    const plan = initialPlan({ home, found: foundCounts(), hours: foundHours(), now, routine, desk });
    let queue: Step[] = [...plan.first, ...plan.rest];
    log(`順番: ${queue.map((s) => s.place.name).join("、")}`);
    saveRecord(rec);

    // 手がかりの場所: 本人がその場で言った場所 → 設定のつながり → Claude（候補の中だけ）
    const findClue = async (text: string, candidates: Place[]): Promise<Clue | null> => {
      const spoken = matchSpokenPlace(text, candidates);
      if (spoken) return spoken;
      const bySettings = matchActivity(text, acts, candidates);
      if (bySettings) return bySettings;
      if (!hasClue(text) || candidates.length < 2) return null;
      const rr = await rerank(text, candidates, now.getHours());
      log(`Claude ${rr.source} ${rr.ms}ms ${rr.note ?? ""}`);
      if (rr.source === "claude") rec.rerankSource = "claude";
      return clueFromRerank(rr, candidates);
    };

    const finish = async (ended: SearchRecord["ended"], words: string, screen: string[], next?: Step) => {
      rec.ended = ended;
      if (next) rec.nextPlace = next.place.name;
      saveRecord(rec);
      setCurrent(null);
      setEndText(screen);
      setStage("done");
      await say(words);
    };

    let explained = false;
    let prefix = ""; // 「なかったんですね。」など、次の言葉の頭につける返事
    let last: Step | null = null;
    while (queue.length > 0) {
      const step = queue.shift()!;
      setCurrent(step.place);
      const q = question({ step, explain: !explained });
      explained = true;
      await say(prefix + q);
      prefix = "";
      const near = !!step.place.near;
      let a = await waitAnswer({ waitMs: near ? NEAR_WAIT_MS : FAR_WAIT_MS, kind: "found", screenWords: [step.place.name] });

      if (a.ans === "undo") {
        // ひとつ前の場所の答えを取り消して、もう一度
        queue.unshift(step);
        if (last) {
          rec.checked.pop();
          queue.unshift(last);
          last = null;
        }
        await say(P.undo);
        continue;
      }

      if (a.ans === "rest" || (a.ans === null && !a.text)) {
        rec.checked.push(step.place.name);
        const next = queue[0];
        await finish(a.ans === "rest" ? "rest" : "no-reply", P.giveUp(next?.place.name ?? null), next ? ["次に見るなら", next.place.name] : ["また、いつでも"], next);
        return;
      }

      if (a.ans === "found") {
        // 「あった、ポケットに」のように場所も言ったら、その場所で記録する
        const spoken = a.text ? matchSpokenPlace(a.text, placesRef.current) : null;
        const at = spoken ? placesRef.current.find((p) => p.id === spoken.placeId)?.name ?? step.place.name : step.place.name;
        if (profile.lookCheck) {
          await say(lookQuestion(profile));
          const c = await waitAnswer({ waitMs: LOOK_WAIT_MS, kind: "yesno", reprompt: false, screenWords: [] });
          if (c.ans === "not") {
            // 古い方だった。記録して、次の場所へ
            (rec.oldFound ??= []).push(at);
            rec.checked.push(step.place.name);
            last = step;
            prefix = P.old;
            continue;
          }
          if (c.ans === null) rec.lookNoReply = true;
        }
        rec.checked.push(step.place.name);
        rec.foundAt = at;
        setSavedFound(at);
        await finish("found", P.found, ["ありました", at]);
        return;
      }

      // なかった、または手がかりの話
      rec.checked.push(step.place.name);
      last = step;
      if (a.ans === "not") prefix = echoOf("not");
      // 「なかった」だけなら手がかりではない。「なかった。そういえば本を読んでた」のように話が続いたときだけ
      const extra = a.text.replace(/なかった|無かった|ない|無い|ありません|見つからない|みつからない|いいえ/g, "");
      if (a.text && (a.ans === null || hasClue(extra))) {
        rec.utterances.push(a.text);
        const c = await findClue(a.text, queue.map((s) => s.place).filter((p) => !p.body && !p.desk));
        if (c) queue = moveToFront(queue, [], c).queue;
      }
      saveRecord(rec);
    }
    await finish("all-checked", P.allChecked, ["ひととおり", "見ました"]);
  };

  const begin = async () => {
    if (running.current) return;
    running.current = true;
    setStage("pressed"); // 押したらすぐ見た目が変わる
    prepareBeep();
    beep();
    const awake = await keepAwake(true);
    log(awake ? "画面を消さない仕組み: オン" : "画面を消さない仕組み: 使えない");
    try {
      setStage("searching");
      await search();
    } finally {
      await keepAwake(false);
      running.current = false;
    }
  };

  const reset = () => {
    setSavedFound(null);
    setStage("idle");
    setCurrent(null);
    setEndText([]);
  };

  return (
    <main className={`talk-page ${stage === "idle" || stage === "pressed" ? "start" : ""}`}>
      {practice && <div className="practice-tag">練習{tryAt ? ` ${tryAt}` : ""}</div>}

      {(stage === "idle" || stage === "pressed") && (
        <div className="start-wrap">
          <button className={`start-button ${stage === "pressed" ? "pressed" : ""}`} onClick={begin}>
            <span className="finger">👆</span>
            <span className="line">ここを押すと</span>
            <span className="line">{stage === "pressed" ? "はじめます" : "さがしはじめます"}</span>
          </button>
        </div>
      )}

      {stage === "searching" && (
        <div className="talk">
          <div className="talk-top">
            <div className={`now-place ${heardFlash ? "flash" : ""}`}>{current?.name ?? ""}</div>
            <div className={`mic ${listening ? "on" : ""} ${heardFlash ? "ok" : ""}`}>{heardFlash ? "✓" : "🎤"}</div>
          </div>
          <div className="talk-bottom">
            {buttons === "found" && (
              <>
                <div className="answer-buttons">
                  <button className="big-button yes" onClick={() => press("found")}>あった</button>
                  <button className="big-button no" onClick={() => press("not")}>なかった</button>
                </div>
                <div className="answer-buttons">
                  <button className="big-button sub" onClick={() => press("undo")}>ひとつ前にもどる</button>
                  <button className="big-button sub" onClick={() => press("rest")}>やめる</button>
                </div>
              </>
            )}
            {buttons === "yesno" && (
              <div className="answer-buttons">
                <button className="big-button yes" onClick={() => press("found")}>はい</button>
                <button className="big-button no" onClick={() => press("not")}>いいえ</button>
              </div>
            )}
          </div>
        </div>
      )}

      {stage === "done" && (
        <div className="talk">
          <div className="talk-top">
            {endText.map((t, i) => (
              <div key={i} className={i === 0 ? "end-lead" : "now-place"}>
                {t}
              </div>
            ))}
          </div>
          <div className="talk-bottom">
            {savedFound && (
              <button
                className="big-button sub"
                onClick={() => {
                  updateLatestFound(undefined);
                  setSavedFound(null);
                  speak("記録を取り消しました。");
                }}
              >
                記録を取り消す
              </button>
            )}
            <button className="big-button" onClick={reset}>
              はじめにもどる
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
