"use client";

// 家族用の設定。家の場所・「していたこと → 場所」のつながり・一日の流れを、この iPad の中にだけ保存する。
// サーバーにも GitHub にも保存しない（探すときに、場所の名前と本人の話だけが並べ替えのために送られる）。

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BODY_CHECK,
  MAIN_COUNT,
  SAMPLE_ACTIVITIES_TEXT,
  SAMPLE_HOME_PLACES,
  loadActivitiesText,
  loadHomeText,
  parseActivitiesText,
  parsePlacesText,
  placesToText,
  saveActivitiesText,
  saveHomeText,
} from "@/lib/places";
import { initialPlan } from "@/lib/plan";
import { loadTryTime, saveTryTime } from "@/lib/trytime";
import { DEFAULT_PROFILE, SAMPLE_DESK_TEXT, loadDeskText, loadProfile, lookQuestion, parseDeskText, saveDeskText, saveProfile, type Profile } from "@/lib/profile";
import { canKeepAwake } from "@/lib/voice";
import { SAMPLE_ROUTINE_TEXT, allSettingPlaces, loadRoutineText, parseRoutineText, saveRoutineText, unreadRoutineLines } from "@/lib/routine";

const area = { width: "100%", fontSize: 20, padding: 12, borderRadius: 12, border: "2px solid var(--line)" } as const;

export default function Settings() {
  const [text, setText] = useState("");
  const [acts, setActs] = useState("");
  const [routineText, setRoutineText] = useState("");
  const [msg, setMsg] = useState("");
  const [at, setAt] = useState("");
  const [tryTime, setTryTime] = useState<string | null>(null);
  const [tryInput, setTryInput] = useState("15:50");
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [deskText, setDeskText] = useState("");
  const [awakeOk, setAwakeOk] = useState(true);
  const [transfer, setTransfer] = useState("");
  const [transferMsg, setTransferMsg] = useState("");

  useEffect(() => {
    setProfile(loadProfile());
    setDeskText(loadDeskText() ?? SAMPLE_DESK_TEXT);
    setAwakeOk(canKeepAwake());
    const home = loadHomeText();
    setText(home ?? placesToText(SAMPLE_HOME_PLACES));
    setActs(loadActivitiesText() ?? SAMPLE_ACTIVITIES_TEXT);
    setRoutineText(loadRoutineText() ?? (home ? "" : SAMPLE_ROUTINE_TEXT));
    const d = new Date();
    const t = loadTryTime()?.time ?? null;
    setTryTime(t);
    if (t) setTryInput(t);
    setAt(t ?? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
  }, []);

  const basePlaces = parsePlacesText(text);
  const routine = parseRoutineText(routineText, basePlaces);
  const activities = parseActivitiesText(acts);
  const places = allSettingPlaces(basePlaces, routine, activities);
  const added = places.slice(basePlaces.length);
  const unread = unreadRoutineLines(routineText, basePlaces);
  const [hh, mm] = (at || "0:0").split(":").map((x) => parseInt(x, 10) || 0);
  const previewAt = new Date(2026, 0, 1, hh, mm);
  const desk = parseDeskText(deskText);
  const preview = initialPlan({ home: places, found: {}, now: previewAt, clue: null, routine, desk });

  const save = () => {
    saveHomeText(text);
    saveActivitiesText(acts);
    saveRoutineText(routineText);
    saveProfile(profile);
    saveDeskText(deskText);
    setMsg("この iPad に保存しました。");
  };
  const reset = () => {
    saveHomeText(null);
    saveActivitiesText(null);
    saveRoutineText(null);
    saveProfile(DEFAULT_PROFILE);
    setProfile(DEFAULT_PROFILE);
    saveDeskText(null);
    setDeskText(SAMPLE_DESK_TEXT);
    setText(placesToText(SAMPLE_HOME_PLACES));
    setActs(SAMPLE_ACTIVITIES_TEXT);
    setRoutineText(SAMPLE_ROUTINE_TEXT);
    setMsg("サンプルにもどしました。");
  };

  return (
    <main>
      <h1>設定（家族用）</h1>
      <p className="muted">ここに書いた内容は、この iPad の中にだけ保存され、GitHub などには上がりません。</p>

      {!awakeOk && (
        <div className="card" style={{ borderColor: "#b5482f", fontSize: 22 }}>
          この iPad では、探している間に画面を消さない仕組みが使えません。設定アプリの「画面表示と明るさ → 自動ロック」を長め（10分など）にしてください。
        </div>
      )}

      <details className="card" style={{ fontSize: 20 }}>
        <summary>設定を写す（ふだんは使いません）</summary>
        <p style={{ margin: "8px 0" }}>
          ホーム画面のアイコンから開いたアプリと、Safari で開いたページは、設定が別々に保存されます。
          Safari で入れた設定は「設定をコピー」を押し、アイコンから開いたアプリの設定画面（最初の画面の左下「⚙ 家族用」を長押し）で、下の欄に貼り付けて「読み込む」を押してください。
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            className="big-button sub"
            style={{ width: "auto", padding: "0 20px", minHeight: 56, fontSize: 22 }}
            onClick={async () => {
              const keys = ["dokoitta-home-places", "dokoitta-activities", "dokoitta-routine", "dokoitta-profile", "dokoitta-desk"];
              const data: Record<string, string | null> = {};
              for (const k of keys) {
                try {
                  data[k] = localStorage.getItem(k);
                } catch {
                  data[k] = null;
                }
              }
              const t = JSON.stringify({ dokoitta: 1, data });
              setTransfer(t);
              try {
                await navigator.clipboard.writeText(t);
                setTransferMsg("コピーしました。");
              } catch {
                setTransferMsg("下の欄の文字を全部選んでコピーしてください。");
              }
            }}
          >
            設定をコピー
          </button>
          <button
            className="big-button sub"
            style={{ width: "auto", padding: "0 20px", minHeight: 56, fontSize: 22 }}
            onClick={() => {
              try {
                const j = JSON.parse(transfer);
                if (j?.dokoitta !== 1 || typeof j.data !== "object") throw new Error("形式");
                for (const [k, v] of Object.entries(j.data as Record<string, string | null>)) {
                  if (!k.startsWith("dokoitta-")) continue;
                  if (v === null) localStorage.removeItem(k);
                  else localStorage.setItem(k, String(v));
                }
                setTransferMsg("読み込みました。画面を読み込み直します。");
                setTimeout(() => window.location.reload(), 800);
              } catch {
                setTransferMsg("読み込めませんでした。コピーした文字をそのまま貼り付けてください。");
              }
            }}
          >
            読み込む
          </button>
        </div>
        <textarea value={transfer} onChange={(e) => setTransfer(e.target.value)} rows={3} style={{ ...area, marginTop: 8, fontSize: 14 }} placeholder="ここに貼り付け" />
        {transferMsg && <p style={{ margin: 0 }}>{transferMsg}</p>}
      </details>

      <h2>0. 本人への言い方と、老眼鏡の見た目</h2>
      <div className="card" style={{ fontSize: 22, display: "grid", gap: 12 }}>
        <label>
          呼び名（本人への画面と声で使う）{" "}
          <input value={profile.callName} onChange={(e) => setProfile({ ...profile, callName: e.target.value })} style={{ fontSize: 22, width: "8em" }} />
        </label>
        <label>
          見た目（例: 細いふちの）{" "}
          <input value={profile.looks} onChange={(e) => setProfile({ ...profile, looks: e.target.value })} style={{ fontSize: 22, width: "10em" }} />
        </label>
        <label>
          <input type="checkbox" checked={profile.lookCheck} onChange={(e) => setProfile({ ...profile, lookCheck: e.target.checked })} style={{ width: 28, height: 28 }} />{" "}
          見つかったときに「{lookQuestion(profile)}」と確かめる（古い老眼鏡と区別するため）
        </label>
      </div>

      <h2>机の気づきにくい場所（最初に確かめる、2か所まで）</h2>
      <p className="muted">1行に1か所、「名前 | 確かめ方」。目の前にあるのに気づかない場所を、手でさわって確かめてもらいます。</p>
      <textarea value={deskText} onChange={(e) => setDeskText(e.target.value)} rows={3} style={area} />

      <h2>1. 家の場所</h2>
      <p className="muted">
        1行に1か所、「名前 | 確かめ方 | 怪しい時刻」。確かめ方は「居間のテーブルの上を見てください」のように一か所だけにします。上から{MAIN_COUNT}か所が「よく置く場所」で、最初はここだけ確かめます。
        怪しい時刻（任意）は 16 や 7,21 のように書きます。頭の上・首元・ポケットは書かなくて大丈夫です。
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} style={area} />

      <h2>2. していたこと → 場所</h2>
      <p className="muted">
        1行に1つ、「していたこと、していたこと &gt; 場所の名前」。話の中にその言葉があれば、その場所をいちばん先に確かめます。
        場所の名前は、上の1と同じ書き方にしてください。
      </p>
      <textarea value={acts} onChange={(e) => setActs(e.target.value)} rows={6} style={area} />

      <h2>3. 一日の流れ</h2>
      <p className="muted">
        1行に1つ、「時刻 &gt; 日課 &gt; 眼鏡の置き場所」。例「12:00 &gt; 昼ごはん &gt; 台所」。
        探すときは、今日もう始まった日課のうち、いちばん最近のものの場所から確かめます（探す時刻と置いた時刻はちがうため）。
        外に出るときなど場所が変わらない日課は、場所に「そのまま」と書くと飛ばして、その前の日課の場所を見ます。
        1にない場所を書くと、自動で場所に加えます。ここに書くと、1の「怪しい時刻」は使いません。
      </p>
      <textarea value={routineText} onChange={(e) => setRoutineText(e.target.value)} rows={10} style={area} />
      {unread.length > 0 && (
        <p style={{ color: "#b5482f", fontSize: 20 }}>
          読めなかった行があります（時刻を「15:30」の形にしてください）: {unread.join("／")}
        </p>
      )}

      <h2>4. 試すときの時刻（練習・撮影用）</h2>
      <p className="muted">
        指定すると、探す画面はこの時刻として順番を決めます（ふだんは今の時刻）。指定している間は練習あつかいで、記録は回数に数えません。
        解除し忘れても、次の日には自動で今の時刻にもどります。探す画面の上に「練習（15:50として）」と小さく出ます。
      </p>
      <div className="card" style={{ fontSize: 22, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", borderColor: tryTime ? "#b5482f" : undefined }}>
        <strong style={{ color: tryTime ? "#b5482f" : undefined }}>
          {tryTime ? `いまは ${tryTime} として動きます（今日だけ）` : "いまは今の時刻で動きます"}
        </strong>
        <input type="time" value={tryInput} onChange={(e) => setTryInput(e.target.value)} style={{ fontSize: 22 }} />
        <button
          className="big-button"
          style={{ minHeight: 56, fontSize: 22, width: "auto", padding: "0 20px", margin: 0 }}
          onClick={() => {
            saveTryTime(tryInput);
            setTryTime(loadTryTime()?.time ?? null);
            setAt(tryInput);
          }}
        >
          この時刻で試す
        </button>
        {tryTime && (
          <button
            className="big-button no"
            style={{ minHeight: 56, fontSize: 22, width: "auto", padding: "0 20px", margin: 0 }}
            onClick={() => {
              saveTryTime(null);
              setTryTime(null);
            }}
          >
            解除して今の時刻にもどす
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        <button className="big-button" style={{ minHeight: 72, fontSize: 28 }} onClick={save}>保存する</button>
        <button className="big-button no" style={{ minHeight: 72, fontSize: 28 }} onClick={reset}>サンプルにもどす</button>
      </div>
      {msg && <p>{msg}</p>}

      <div className="card" style={{ fontSize: 20 }}>
        <div className="muted">
          確かめる順番（手がかりがないとき）　
          <label>
            探す時刻 <input type="time" value={at} onChange={(e) => setAt(e.target.value)} style={{ fontSize: 20 }} />
          </label>
        </div>
        <ol style={{ margin: "8px 0 0" }}>
          {preview.first.map((st) => (
            <li key={st.place.id}>
              {st.place.id === BODY_CHECK.id ? `${BODY_CHECK.name}（1回でまとめて聞く）` : st.place.name}
              {st.reason ? `　「${st.reason}」` : ""}
              {/と、|、と|および/.test(st.place.action) && (
                <span style={{ color: "#b5482f" }}>　※確かめ方は一か所にしぼると答えやすくなります</span>
              )}
            </li>
          ))}
        </ol>
        {preview.rest.length > 0 && (
          <div className="muted" style={{ marginTop: 8 }}>
            それでもなければ続けて: {preview.rest.map((s) => s.place.name).join("、")}
          </div>
        )}
        {routine.length > 0 && basePlaces.some((p) => p.hours) && (
          <div className="muted" style={{ marginTop: 8 }}>
            ※一日の流れがあるので、1の「怪しい時刻」は使っていません（消してもかまいません）。
          </div>
        )}
      </div>
      {routine.length > 0 && (
        <div className="card" style={{ fontSize: 20 }}>
          <div className="muted">一日の流れの読み取り</div>
          <ul style={{ margin: "8px 0 0" }}>
            {routine.map((r, i) => (
              <li key={i} style={{ color: r.placeName ? undefined : "var(--muted)" }}>
                {r.time} {r.activity} → {r.placeName ?? "場所は変わらない（飛ばす）"}
              </li>
            ))}
          </ul>
        </div>
      )}
      {added.length > 0 && (
        <div className="card muted" style={{ fontSize: 20 }}>
          1にないので加えた場所（一日の流れ・していたことから）: {added.map((p) => p.name).join("、")}
        </div>
      )}
      <div className="card" style={{ fontSize: 20 }}>
        <div className="muted">していたこと → 先に確かめる場所</div>
        <ul style={{ margin: "8px 0 0" }}>
          {activities.map((a, i) => {
            const ok = places.some((p) => p.name === a.placeName);
            return (
              <li key={i} style={{ color: ok ? undefined : "#b5482f" }}>
                {a.keywords.join("・")} → {a.placeName}
                {ok ? "" : "（1に同じ名前の場所がありません）"}
              </li>
            );
          })}
        </ul>
      </div>
      <p><Link href="/talk">探す画面へ</Link></p>
    </main>
  );
}
